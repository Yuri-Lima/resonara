import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as fssync from 'fs';
import * as os from 'os';
import * as path from 'path';
import { In, Repository } from 'typeorm';
import {
  TtsChapterMeta,
  TtsEngineName,
  TtsJob,
  TtsJobMetadata,
  TtsJobStatus,
} from '../entities/tts-job.entity';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { resolveFfmpegBinary } from '../ffmpeg/resolve-ffmpeg';
import { JobsGateway } from '../gateway/jobs.gateway';
import {
  chunkTextForTts,
  detectChapters,
  estimateWordCount,
  TextChunk,
} from './text-chunker';
import { synthesizeChunk } from './platform-tts';
import { synthesizeWithPiper } from './piper-tts';
import { PronunciationService } from './pronunciation.service';
import { transformSsml, SsmlEngine } from './ssml-parser';
import { UnifiedVoice, VoiceManager } from './voice-manager';
import { ExtractedDocument } from './document-extractor';

export interface SynthesizeLongOptions {
  text: string;
  voice?: string;
  rate?: number;
  format?: 'wav' | 'mp3' | 'm4b';
  engine?: TtsEngineName;
  ssml?: boolean;
  normalize?: boolean;
  highpass?: boolean;
  compress?: boolean;
  chapters?: { title: string; text: string }[];
  title?: string;
}

export interface JobListQuery {
  status?: TtsJobStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class TtsService implements OnModuleInit {
  private readonly logger = new Logger(TtsService.name);
  private readonly dataDir: string;
  private readonly voiceManager: VoiceManager;

  constructor(
    private readonly ffmpeg: FfmpegService,
    private readonly gateway: JobsGateway,
    private readonly config: ConfigService,
    @InjectRepository(TtsJob)
    private readonly jobsRepo: Repository<TtsJob>,
    @Optional() private readonly pronunciation?: PronunciationService,
  ) {
    this.dataDir =
      this.config.get<string>('resonara.dataDir') ||
      path.join(os.homedir(), '.resonara', 'tts');
    this.voiceManager = new VoiceManager({
      piperBinary: this.config.get<string>('piper.path') || undefined,
      piperModelsDir: this.config.get<string>('piper.modelsDir') || undefined,
    });
  }

  async onModuleInit() {
    const interrupted = await this.jobsRepo.find({
      where: {
        status: In([
          TtsJobStatus.CHUNKING,
          TtsJobStatus.SYNTHESIZING,
          TtsJobStatus.CONCATENATING,
          TtsJobStatus.NORMALIZING,
        ]),
      },
    });
    for (const job of interrupted) {
      job.status = TtsJobStatus.FAILED;
      job.error = 'interrupted by restart';
      await this.jobsRepo.save(job);
    }
    if (interrupted.length) {
      this.logger.warn(
        `Marked ${interrupted.length} interrupted TTS job(s) as failed`,
      );
    }
  }

  engineStatus() {
    return {
      engines: this.voiceManager.engines(),
      piper: this.voiceManager.getPiperPaths(),
    };
  }

  voices(filter?: { engine?: 'piper' | 'platform'; language?: string }) {
    return this.voiceManager.listVoices(filter);
  }

  async getJob(id: string): Promise<TtsJob> {
    const j = await this.jobsRepo.findOne({ where: { id } });
    if (!j) throw new NotFoundException(`TTS job ${id} not found`);
    return j;
  }

  async listJobs(query: JobListQuery = {}): Promise<{
    items: TtsJob[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const where = query.status ? { status: query.status } : {};
    const [items, total] = await this.jobsRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async deleteJob(id: string): Promise<void> {
    const job = await this.getJob(id);
    if (job.outputKey) {
      await fs.rm(job.outputKey, { force: true }).catch(() => undefined);
      const dir = path.dirname(job.outputKey);
      if (dir.includes(job.id)) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
    const workDir = path.join(this.dataDir, job.id);
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    await this.jobsRepo.delete(id);
  }

  /**
   * Start long-form TTS: persist job → chunk → synthesize → trim → crossfade → post-process.
   */
  async startLongForm(opts: SynthesizeLongOptions): Promise<TtsJob> {
    let text = (opts.text || '').trim();
    if (!text) throw new BadRequestException('text is required');

    let engine: 'piper' | 'platform';
    try {
      engine = this.voiceManager.resolveEngine(opts.engine || 'auto');
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    // Pronunciation dictionary
    if (this.pronunciation) {
      try {
        text = await this.pronunciation.applyDictionary(text, engine);
      } catch (e) {
        this.logger.warn(`Dictionary apply failed: ${(e as Error).message}`);
      }
    }

    const job = this.jobsRepo.create({
      status: TtsJobStatus.QUEUED,
      text,
      voiceId: opts.voice ?? null,
      engine: opts.engine || 'auto',
      format: opts.format || 'wav',
      rate: opts.rate ?? null,
      totalChunks: 0,
      completedChunks: 0,
      progress: 0,
      ssml: opts.ssml === true || /<speak[\s>]/i.test(text),
      metadata: {
        wordCount: estimateWordCount(text),
        title: opts.title,
        postProcess: {
          normalize: opts.normalize !== false,
          highpass: opts.highpass !== false,
          compress: opts.compress === true,
        },
      },
    });
    await this.jobsRepo.save(job);

    setImmediate(() => {
      void this.runJob(job.id, opts, engine).catch((err) => {
        this.logger.error(`TTS job ${job.id} failed: ${err?.message || err}`);
      });
    });

    return job;
  }

  async startFromDocument(
    doc: ExtractedDocument,
    opts: Omit<SynthesizeLongOptions, 'text' | 'chapters'>,
  ): Promise<TtsJob> {
    const fullText = doc.chapters
      .map((c) => `### ${c.title}\n\n${c.text}`)
      .join('\n\n');
    return this.startLongForm({
      ...opts,
      text: fullText,
      title: doc.title,
      chapters: doc.chapters,
    });
  }

  /**
   * Synchronous path for tests/CLI.
   */
  async synthesizeLongSync(
    opts: SynthesizeLongOptions & { outDir?: string },
  ): Promise<{
    outputPath: string;
    chunkCount: number;
    wordCount: number;
    chunks: { index: number; charCount: number }[];
    engine: string;
  }> {
    let text = (opts.text || '').trim();
    if (!text) throw new BadRequestException('text is required');
    const engine = this.voiceManager.resolveEngine(opts.engine || 'auto');
    if (this.pronunciation) {
      text = await this.pronunciation.applyDictionary(text, engine);
    }
    const voice = this.resolveVoice(opts.voice, engine);
    const chunks = chunkTextForTts(text, { engine });
    const outDir =
      opts.outDir || path.join(this.dataDir, `sync-${Date.now()}`);
    await fs.mkdir(outDir, { recursive: true });
    const format = opts.format === 'm4b' ? 'wav' : opts.format || 'wav';
    const outputPath = path.join(outDir, `speech.${format === 'mp3' ? 'mp3' : 'wav'}`);
    await this.chunkSynthConcat(chunks, {
      voice,
      engine,
      rate: opts.rate,
      format: format === 'mp3' ? 'mp3' : 'wav',
      outputPath,
      workDir: outDir,
      ssml: opts.ssml,
      normalize: opts.normalize,
      highpass: opts.highpass,
      compress: opts.compress,
      onProgress: async () => undefined,
    });
    return {
      outputPath,
      chunkCount: chunks.length,
      wordCount: estimateWordCount(text),
      chunks: chunks.map((c) => ({ index: c.index, charCount: c.charCount })),
      engine,
    };
  }

  private async runJob(
    jobId: string,
    opts: SynthesizeLongOptions,
    engine: 'piper' | 'platform',
  ) {
    const job = await this.getJob(jobId);
    const workDir = path.join(this.dataDir, job.id);
    await fs.mkdir(workDir, { recursive: true });
    const format = (opts.format === 'm4b' ? 'wav' : opts.format) || 'wav';
    const outputPath = path.join(
      workDir,
      `speech.${format === 'mp3' ? 'mp3' : 'wav'}`,
    );

    try {
      job.status = TtsJobStatus.CHUNKING;
      job.progress = 2;
      await this.jobsRepo.save(job);
      this.gateway.emitProgress(job.id, job.progress, 'tts');

      const voice = this.resolveVoice(opts.voice, engine);
      const chaptersSrc =
        opts.chapters ||
        (detectChapters(job.text).length > 1
          ? detectChapters(job.text)
          : null);

      let chapterMeta: TtsChapterMeta[] | undefined;

      if (chaptersSrc && chaptersSrc.length > 1) {
        chapterMeta = await this.synthesizeByChapter(
          job,
          chaptersSrc,
          {
            voice,
            engine,
            rate: opts.rate,
            format: format === 'mp3' ? 'mp3' : 'wav',
            workDir,
            ssml: opts.ssml,
            normalize: opts.normalize,
            highpass: opts.highpass,
            compress: opts.compress,
            outputPath,
          },
        );
      } else {
        const chunks = chunkTextForTts(job.text, { engine });
        job.totalChunks = chunks.length;
        job.status = TtsJobStatus.SYNTHESIZING;
        await this.jobsRepo.save(job);

        await this.chunkSynthConcat(chunks, {
          voice,
          engine,
          rate: opts.rate,
          format: format === 'mp3' ? 'mp3' : 'wav',
          outputPath,
          workDir,
          ssml: opts.ssml || job.ssml,
          normalize: opts.normalize,
          highpass: opts.highpass,
          compress: opts.compress,
          onProgress: async (pct, chunksDone) => {
            job.progress = Math.round(pct);
            job.completedChunks = chunksDone;
            if (pct < 90) job.status = TtsJobStatus.SYNTHESIZING;
            else if (pct < 96) job.status = TtsJobStatus.CONCATENATING;
            else job.status = TtsJobStatus.NORMALIZING;
            await this.jobsRepo.save(job);
            this.gateway.emitProgress(job.id, job.progress, 'tts');
          },
        });
      }

      if (opts.format === 'm4b' && chapterMeta?.length) {
        const m4bPath = path.join(workDir, 'speech.m4b');
        await this.ffmpeg.embedChapterMetadata(
          outputPath,
          m4bPath,
          chapterMeta,
          opts.title || job.metadata?.title,
        );
        job.outputKey = m4bPath;
      } else {
        job.outputKey = outputPath;
      }

      let duration: number | undefined;
      let sampleRate: number | undefined;
      try {
        const probe = await this.ffmpeg.probe(job.outputKey);
        duration = probe.duration;
        sampleRate = probe.sampleRate ?? undefined;
      } catch {
        /* optional */
      }

      const meta: TtsJobMetadata = {
        ...(job.metadata || {}),
        duration,
        sampleRate,
        wordCount: estimateWordCount(job.text),
        chapters: chapterMeta,
        title: opts.title || job.metadata?.title,
      };
      job.metadata = meta;
      job.status = TtsJobStatus.COMPLETED;
      job.progress = 100;
      job.completedAt = new Date();
      await this.jobsRepo.save(job);
      this.gateway.emitCompleted(job.id, this.toPublicJob(job));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      job.status = TtsJobStatus.FAILED;
      job.error = message;
      await this.jobsRepo.save(job);
      this.gateway.emitFailed(job.id, message);
      throw err;
    }
  }

  private async synthesizeByChapter(
    job: TtsJob,
    chapters: { title: string; text: string }[],
    opts: {
      voice?: UnifiedVoice;
      engine: 'piper' | 'platform';
      rate?: number;
      format: 'wav' | 'mp3';
      workDir: string;
      ssml?: boolean;
      normalize?: boolean;
      highpass?: boolean;
      compress?: boolean;
      outputPath: string;
    },
  ): Promise<TtsChapterMeta[]> {
    const chapterFiles: string[] = [];
    const meta: TtsChapterMeta[] = [];
    let cursor = 0;
    const total = chapters.length;

    job.totalChunks = total;
    job.status = TtsJobStatus.SYNTHESIZING;
    await this.jobsRepo.save(job);

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const chDir = path.join(opts.workDir, `chapter-${String(i).padStart(3, '0')}`);
      await fs.mkdir(chDir, { recursive: true });
      const chOut = path.join(chDir, `chapter.${opts.format}`);
      const chunks = chunkTextForTts(ch.text, { engine: opts.engine });
      await this.chunkSynthConcat(chunks, {
        voice: opts.voice,
        engine: opts.engine,
        rate: opts.rate,
        format: opts.format,
        outputPath: chOut,
        workDir: chDir,
        ssml: opts.ssml,
        normalize: opts.normalize,
        highpass: opts.highpass,
        compress: opts.compress,
        onProgress: async () => undefined,
      });
      chapterFiles.push(chOut);
      let dur = 0;
      try {
        const p = await this.ffmpeg.probe(chOut);
        dur = p.duration || 0;
      } catch {
        dur = 0;
      }
      meta.push({
        index: i,
        title: ch.title,
        startTime: cursor,
        endTime: cursor + dur,
        wordCount: estimateWordCount(ch.text),
        file: chOut,
      });
      cursor += dur;
      job.completedChunks = i + 1;
      job.progress = Math.round(((i + 1) / total) * 85);
      await this.jobsRepo.save(job);
      this.gateway.emitProgress(job.id, job.progress, 'tts');
    }

    job.status = TtsJobStatus.CONCATENATING;
    await this.jobsRepo.save(job);

    // Crossfade chapter files into full output
    const wavParts: string[] = [];
    for (let i = 0; i < chapterFiles.length; i++) {
      const w = path.join(opts.workDir, `ch-full-${i}.wav`);
      if (chapterFiles[i].endsWith('.wav')) {
        await fs.copyFile(chapterFiles[i], w);
      } else {
        await this.convertToWav(chapterFiles[i], w);
      }
      wavParts.push(w);
    }
    const concatWav = path.join(opts.workDir, 'full-concat.wav');
    await this.ffmpeg.crossfadeChunks(wavParts, concatWav, {
      durationSec: 0.02,
      format: 'wav',
    });

    job.status = TtsJobStatus.NORMALIZING;
    await this.jobsRepo.save(job);
    await this.ffmpeg.postProcessTts(concatWav, opts.outputPath, {
      normalize: opts.normalize !== false,
      highpass: opts.highpass !== false,
      compress: opts.compress === true,
      format: opts.format,
    });

    job.progress = 98;
    await this.jobsRepo.save(job);
    return meta;
  }

  private async chunkSynthConcat(
    chunks: TextChunk[],
    opts: {
      voice?: UnifiedVoice;
      engine: 'piper' | 'platform';
      rate?: number;
      format: 'wav' | 'mp3';
      outputPath: string;
      workDir: string;
      ssml?: boolean;
      normalize?: boolean;
      highpass?: boolean;
      compress?: boolean;
      onProgress: (pct: number, chunksDone: number) => Promise<void>;
    },
  ) {
    const partPaths: string[] = [];
    const n = chunks.length || 1;
    const ssmlEngine: SsmlEngine =
      opts.engine === 'piper'
        ? 'piper'
        : process.platform === 'darwin'
          ? 'platform-darwin'
          : process.platform === 'win32'
            ? 'platform-win32'
            : 'plain';

    for (let i = 0; i < chunks.length; i++) {
      let pieceText = chunks[i].text;
      if (opts.ssml || /<[^>]+>/.test(pieceText)) {
        const transformed = transformSsml(pieceText, {
          engine: ssmlEngine,
          isSsml: true,
        });
        pieceText = transformed.engineText || transformed.plainText;
      }

      const rawPart = path.join(
        opts.workDir,
        `part-${String(i).padStart(4, '0')}-raw.wav`,
      );
      await this.synthesizeOne(pieceText, rawPart, opts.engine, opts.voice, opts.rate);

      const trimmed = path.join(
        opts.workDir,
        `part-${String(i).padStart(4, '0')}-trim.wav`,
      );
      try {
        await this.ffmpeg.trimChunkSilence(rawPart, trimmed);
        partPaths.push(trimmed);
      } catch {
        partPaths.push(rawPart);
      }

      const pct = ((i + 1) / n) * 80;
      await opts.onProgress(pct, i + 1);
    }

    if (partPaths.length === 0) {
      throw new Error('No TTS chunks produced');
    }

    await opts.onProgress(85, chunks.length);
    const concatPath = path.join(opts.workDir, 'concat.wav');
    await this.ffmpeg.crossfadeChunks(partPaths, concatPath, {
      durationSec: 0.02,
      format: 'wav',
    });

    await opts.onProgress(92, chunks.length);
    await this.ffmpeg.postProcessTts(concatPath, opts.outputPath, {
      normalize: opts.normalize !== false,
      highpass: opts.highpass !== false,
      compress: opts.compress === true,
      format: opts.format,
    });
    await opts.onProgress(100, chunks.length);
  }

  private async synthesizeOne(
    text: string,
    outPath: string,
    engine: 'piper' | 'platform',
    voice?: UnifiedVoice,
    rate?: number,
  ): Promise<void> {
    if (engine === 'piper') {
      const modelPath =
        voice?.modelPath ||
        this.voiceManager.defaultVoice('piper')?.modelPath;
      if (!modelPath) {
        throw new Error('No Piper voice model available');
      }
      // rate: map WPM-ish to length_scale (higher rate → lower length_scale)
      let lengthScale: number | undefined;
      if (rate != null && Number.isFinite(rate)) {
        lengthScale = Math.max(0.5, Math.min(2, 175 / rate));
      }
      await synthesizeWithPiper({
        text,
        modelPath,
        outputPath: outPath,
        lengthScale,
      });
      return;
    }

    // platform
    const platformOut = outPath.replace(/\.wav$/i, '') + (process.platform === 'darwin' ? '.aiff' : '.wav');
    await synthesizeChunk({
      text,
      outPath: platformOut,
      voice: voice?.nativeId,
      rate,
    });
    if (platformOut !== outPath) {
      await this.convertToWav(platformOut, outPath);
      await fs.unlink(platformOut).catch(() => undefined);
    }
  }

  private resolveVoice(
    voiceId: string | undefined,
    engine: 'piper' | 'platform',
  ): UnifiedVoice | undefined {
    if (voiceId) {
      const v = this.voiceManager.getVoice(voiceId);
      if (v) return v;
      // Allow bare platform voice names
      return {
        id: `${engine}:${voiceId}`,
        name: voiceId,
        engine,
        nativeId: voiceId.replace(/^(piper|platform):/, ''),
        modelPath:
          engine === 'piper'
            ? this.findModelById(voiceId)
            : undefined,
      };
    }
    return this.voiceManager.defaultVoice(engine);
  }

  private findModelById(id: string): string | undefined {
    const bare = id.replace(/^piper:/, '');
    const voices = this.voiceManager.listVoices({ engine: 'piper' });
    return voices.find((v) => v.nativeId === bare || v.id === id)?.modelPath;
  }

  private convertToWav(input: string, output: string): Promise<void> {
    const ff = resolveFfmpegBinary(
      this.config.get<string>('ffmpeg.path') || undefined,
      'ffmpeg',
    );
    return runFf(ff, [
      '-y',
      '-i',
      input,
      '-acodec',
      'pcm_s16le',
      '-ar',
      '22050',
      output,
    ]);
  }

  async resolveDownload(jobId: string): Promise<string> {
    const job = await this.getJob(jobId);
    if (job.status !== TtsJobStatus.COMPLETED || !job.outputKey) {
      throw new BadRequestException('TTS job not completed');
    }
    await fs.access(job.outputKey);
    return job.outputKey;
  }

  async getChapters(jobId: string): Promise<TtsChapterMeta[]> {
    const job = await this.getJob(jobId);
    return job.metadata?.chapters || [];
  }

  async resolveChapterDownload(jobId: string, n: number): Promise<string> {
    const chapters = await this.getChapters(jobId);
    const ch = chapters.find((c) => c.index === n) || chapters[n];
    if (!ch?.file || !fssync.existsSync(ch.file)) {
      throw new NotFoundException(`Chapter ${n} not found`);
    }
    return ch.file;
  }

  toPublicJob(job: TtsJob) {
    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      wordCount: job.metadata?.wordCount ?? estimateWordCount(job.text),
      chunkCount: job.totalChunks,
      chunksDone: job.completedChunks,
      voice: job.voiceId,
      engine: job.engine,
      format: job.format,
      outputPath: job.outputKey,
      downloadPath:
        job.status === TtsJobStatus.COMPLETED
          ? `/tts/jobs/${job.id}/download`
          : undefined,
      error: job.error,
      metadata: job.metadata,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    };
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
