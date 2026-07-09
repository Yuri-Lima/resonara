import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { resolveFfmpegBinary } from '../ffmpeg/resolve-ffmpeg';
import { JobsGateway } from '../gateway/jobs.gateway';
import { chunkTextForTts, estimateWordCount } from './text-chunker';
import {
  listVoices,
  synthesizeChunk,
  ttsEngineAvailable,
  VoiceInfo,
} from './platform-tts';

export type TtsJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface TtsJob {
  id: string;
  status: TtsJobStatus;
  progress: number;
  wordCount: number;
  chunkCount: number;
  chunksDone: number;
  voice?: string;
  outputPath?: string;
  downloadPath?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface SynthesizeLongOptions {
  text: string;
  voice?: string;
  rate?: number;
  format?: 'wav' | 'mp3';
}

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly jobs = new Map<string, TtsJob>();
  private readonly dataDir: string;

  constructor(
    private readonly ffmpeg: FfmpegService,
    private readonly gateway: JobsGateway,
    private readonly config: ConfigService,
  ) {
    this.dataDir =
      this.config.get<string>('resonara.dataDir') ||
      path.join(os.homedir(), '.resonara', 'tts');
  }

  engineStatus() {
    return ttsEngineAvailable();
  }

  voices(): VoiceInfo[] {
    return listVoices();
  }

  getJob(id: string): TtsJob {
    const j = this.jobs.get(id);
    if (!j) throw new NotFoundException(`TTS job ${id} not found`);
    return j;
  }

  /**
   * Start long-form TTS: chunk → synthesize each → ffmpeg concat → export.
   * Returns immediately; progress via job polling + websocket room job:{id}.
   */
  async startLongForm(opts: SynthesizeLongOptions): Promise<TtsJob> {
    const text = (opts.text || '').trim();
    if (!text) throw new BadRequestException('text is required');

    const engine = ttsEngineAvailable();
    if (!engine.available) {
      throw new BadRequestException(
        `System TTS unavailable: ${engine.detail || engine.engine}`,
      );
    }

    const chunks = chunkTextForTts(text);
    const id = uuidv4();
    const job: TtsJob = {
      id,
      status: 'queued',
      progress: 0,
      wordCount: estimateWordCount(text),
      chunkCount: chunks.length,
      chunksDone: 0,
      voice: opts.voice,
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(id, job);

    // Fire-and-forget background work (non-blocking UI)
    setImmediate(() => {
      void this.runJob(job, chunks, opts).catch((err) => {
        this.logger.error(`TTS job ${id} failed: ${err?.message || err}`);
      });
    });

    return job;
  }

  /**
   * Synchronous path for tests/CLI: full chunk→synth→concat, returns output path.
   */
  async synthesizeLongSync(
    opts: SynthesizeLongOptions & { outDir?: string },
  ): Promise<{
    outputPath: string;
    chunkCount: number;
    wordCount: number;
    chunks: { index: number; charCount: number }[];
  }> {
    const text = (opts.text || '').trim();
    if (!text) throw new BadRequestException('text is required');
    const chunks = chunkTextForTts(text);
    const outDir =
      opts.outDir ||
      path.join(this.dataDir, `sync-${Date.now()}`);
    await fs.mkdir(outDir, { recursive: true });
    const format = opts.format || 'wav';
    const outputPath = path.join(outDir, `speech.${format}`);
    await this.chunkSynthConcat(chunks, {
      voice: opts.voice,
      rate: opts.rate,
      format,
      outputPath,
      workDir: outDir,
      onProgress: async () => undefined,
    });
    return {
      outputPath,
      chunkCount: chunks.length,
      wordCount: estimateWordCount(text),
      chunks: chunks.map((c) => ({ index: c.index, charCount: c.charCount })),
    };
  }

  private async runJob(
    job: TtsJob,
    chunks: ReturnType<typeof chunkTextForTts>,
    opts: SynthesizeLongOptions,
  ) {
    job.status = 'running';
    this.gateway.emitProgress(job.id, 0, 'tts');
    const workDir = path.join(this.dataDir, job.id);
    await fs.mkdir(workDir, { recursive: true });
    const format = opts.format || 'wav';
    const outputPath = path.join(workDir, `speech.${format}`);

    try {
      await this.chunkSynthConcat(chunks, {
        voice: opts.voice,
        rate: opts.rate,
        format,
        outputPath,
        workDir,
        onProgress: async (pct, chunksDone) => {
          job.progress = Math.round(pct);
          job.chunksDone = chunksDone;
          this.gateway.emitProgress(job.id, job.progress, 'tts');
        },
      });
      job.status = 'completed';
      job.progress = 100;
      job.chunksDone = chunks.length;
      job.outputPath = outputPath;
      job.downloadPath = `/tts/jobs/${job.id}/download`;
      job.completedAt = new Date().toISOString();
      this.gateway.emitCompleted(job.id, job);
    } catch (err: any) {
      job.status = 'failed';
      job.error = err?.message || String(err);
      this.gateway.emitFailed(job.id, job.error || 'tts failed');
      throw err;
    }
  }

  private async chunkSynthConcat(
    chunks: ReturnType<typeof chunkTextForTts>,
    opts: {
      voice?: string;
      rate?: number;
      format: 'wav' | 'mp3';
      outputPath: string;
      workDir: string;
      onProgress: (pct: number, chunksDone: number) => Promise<void>;
    },
  ) {
    const partPaths: string[] = [];
    const n = chunks.length || 1;

    for (let i = 0; i < chunks.length; i++) {
      const part = path.join(opts.workDir, `part-${String(i).padStart(4, '0')}.aiff`);
      await synthesizeChunk({
        text: chunks[i].text,
        outPath: part,
        voice: opts.voice,
        rate: opts.rate,
      });
      // Normalize each part to wav for concat
      const wavPart = path.join(opts.workDir, `part-${String(i).padStart(4, '0')}.wav`);
      await this.convertToWav(part, wavPart);
      await fs.unlink(part).catch(() => undefined);
      partPaths.push(wavPart);
      const pct = ((i + 1) / n) * 90;
      await opts.onProgress(pct, i + 1);
    }

    if (partPaths.length === 0) {
      throw new Error('No TTS chunks produced');
    }

    if (partPaths.length === 1 && opts.format === 'wav') {
      await fs.copyFile(partPaths[0], opts.outputPath);
    } else {
      await this.concatAudio(partPaths, opts.outputPath, opts.format);
    }
    await opts.onProgress(100, chunks.length);
  }

  private convertToWav(input: string, output: string): Promise<void> {
    const ff = resolveFfmpegBinary(
      this.config.get<string>('ffmpeg.path') || undefined,
      'ffmpeg',
    );
    return runFf(ff, ['-y', '-i', input, '-acodec', 'pcm_s16le', '-ar', '22050', output]);
  }

  private concatAudio(
    parts: string[],
    output: string,
    format: 'wav' | 'mp3',
  ): Promise<void> {
    const ff = resolveFfmpegBinary(
      this.config.get<string>('ffmpeg.path') || undefined,
      'ffmpeg',
    );
    const listFile = output + '.txt';
    const body = parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    return fs.writeFile(listFile, body, 'utf8').then(() => {
      const args =
        format === 'mp3'
          ? [
              '-y',
              '-f',
              'concat',
              '-safe',
              '0',
              '-i',
              listFile,
              '-c:a',
              'libmp3lame',
              '-b:a',
              '192k',
              output,
            ]
          : [
              '-y',
              '-f',
              'concat',
              '-safe',
              '0',
              '-i',
              listFile,
              '-c',
              'copy',
              output,
            ];
      // pcm concat may need re-encode if copy fails
      return runFf(ff, args).catch(() =>
        runFf(ff, [
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listFile,
          '-acodec',
          'pcm_s16le',
          '-ar',
          '22050',
          output,
        ]),
      );
    });
  }

  async resolveDownload(jobId: string): Promise<string> {
    const job = this.getJob(jobId);
    if (job.status !== 'completed' || !job.outputPath) {
      throw new BadRequestException('TTS job not completed');
    }
    await fs.access(job.outputPath);
    return job.outputPath;
  }
}

function runFf(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}
