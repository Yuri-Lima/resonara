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
import { hasDialogueMarkup, parseDialogue } from './dialogue-parser';
import { ModelManager } from './model-manager';
import {
  estimateWordTimestamps,
  groupSubtitles,
  toSrt,
  toWebVtt,
} from './timestamp-aligner';
import { TtsBatch, TtsBatchStatus } from '../entities/tts-batch.entity';

export interface SynthesizeLongOptions {
  text: string;
  voice?: string;
  rate?: number;
  format?: 'wav' | 'mp3' | 'm4b';
  engine?: TtsEngineName;
  ssml?: boolean;
  dialogue?: boolean;
  speakers?: Record<string, string>;
  normalize?: boolean;
  highpass?: boolean;
  compress?: boolean;
  postProcessing?: 'podcast' | 'audiobook' | 'raw' | 'custom';
  chapters?: { title: string; text: string }[];
  title?: string;
  batchId?: string;
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

  private readonly modelManager: ModelManager;

  constructor(
    private readonly ffmpeg: FfmpegService,
    private readonly gateway: JobsGateway,
    private readonly config: ConfigService,
    @InjectRepository(TtsJob)
    private readonly jobsRepo: Repository<TtsJob>,
    @InjectRepository(TtsBatch)
    private readonly batchRepo: Repository<TtsBatch>,
    @Optional() private readonly pronunciation?: PronunciationService,
  ) {
    this.dataDir =
      this.config.get<string>('resonara.dataDir') ||
      path.join(os.homedir(), '.resonara', 'tts');
    this.voiceManager = new VoiceManager({
      piperBinary: this.config.get<string>('piper.path') || undefined,
      piperModelsDir: this.config.get<string>('piper.modelsDir') || undefined,
    });
    this.modelManager = new ModelManager(
      this.config.get<string>('piper.modelsDir') || undefined,
    );
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

    const dialogue =
      opts.dialogue === true ||
      (opts.dialogue !== false && hasDialogueMarkup(text));

    // Pronunciation dictionary (skip raw SSML tags inside markup carefully)
    if (this.pronunciation && !dialogue) {
      try {
        text = await this.pronunciation.applyDictionary(text, engine);
      } catch (e) {
        this.logger.warn(`Dictionary apply failed: ${(e as Error).message}`);
      }
    }

    const preset = opts.postProcessing || 'podcast';
    const post = this.resolvePostProcess(preset, opts);

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
      batchId: opts.batchId ?? null,
      metadata: {
        wordCount: estimateWordCount(text),
        title: opts.title,
        dialogue,
        speakers: opts.speakers,
        postProcess: { ...post, preset },
      },
    });
    await this.jobsRepo.save(job);

    const runOpts: SynthesizeLongOptions = {
      ...opts,
      normalize: post.normalize,
      highpass: post.highpass,
      compress: post.compress,
      dialogue,
    };

    setImmediate(() => {
      void this.runJob(job.id, runOpts, engine).catch((err) => {
        this.logger.error(`TTS job ${job.id} failed: ${err?.message || err}`);
      });
    });

    return job;
  }

  private resolvePostProcess(
    preset: string,
    opts: SynthesizeLongOptions,
  ): { normalize: boolean; highpass: boolean; compress: boolean } {
    if (preset === 'raw') {
      return { normalize: false, highpass: false, compress: false };
    }
    if (preset === 'audiobook') {
      return { normalize: true, highpass: true, compress: true };
    }
    if (preset === 'custom') {
      return {
        normalize: opts.normalize !== false,
        highpass: opts.highpass !== false,
        compress: opts.compress === true,
      };
    }
    // podcast default
    return {
      normalize: opts.normalize !== false,
      highpass: opts.highpass !== false,
      compress: opts.compress === true,
    };
  }

  models() {
    return this.modelManager.listAvailable();
  }

  modelDiskUsage() {
    return this.modelManager.diskUsage();
  }

  async downloadModel(key: string) {
    const p = await this.modelManager.download(key);
    this.voiceManager.refresh();
    return { path: p, models: this.modelManager.listAvailable() };
  }

  deleteModel(key: string) {
    this.modelManager.delete(key);
    return { ok: true, models: this.modelManager.listAvailable() };
  }

  async retryJob(id: string): Promise<TtsJob> {
    const prev = await this.getJob(id);
    if (prev.status !== TtsJobStatus.FAILED && prev.status !== TtsJobStatus.COMPLETED) {
      throw new BadRequestException('Only failed or completed jobs can be retried');
    }
    return this.startLongForm({
      text: prev.text,
      voice: prev.voiceId || undefined,
      engine: prev.engine,
      format: (prev.format as 'wav' | 'mp3' | 'm4b') || 'wav',
      rate: prev.rate ?? undefined,
      ssml: prev.ssml,
      dialogue: prev.metadata?.dialogue,
      speakers: prev.metadata?.speakers,
      title: prev.metadata?.title,
      normalize: prev.metadata?.postProcess?.normalize,
      highpass: prev.metadata?.postProcess?.highpass,
      compress: prev.metadata?.postProcess?.compress,
      postProcessing: prev.metadata?.postProcess?.preset as
        | 'podcast'
        | 'audiobook'
        | 'raw'
        | 'custom'
        | undefined,
    });
  }

  async startBatch(
    items: SynthesizeLongOptions[],
  ): Promise<{ batch: TtsBatch; jobs: TtsJob[] }> {
    if (!items?.length) throw new BadRequestException('batch requires items');
    const batch = this.batchRepo.create({
      status: TtsBatchStatus.QUEUED,
      totalJobs: items.length,
      completedJobs: 0,
      failedJobs: 0,
      jobIds: [],
    });
    await this.batchRepo.save(batch);

    // Sequential processing via chained promises
    setImmediate(() => {
      void this.runBatch(batch.id, items).catch((e) =>
        this.logger.error(`batch ${batch.id}: ${(e as Error).message}`),
      );
    });

    return { batch, jobs: [] };
  }

  private async runBatch(batchId: string, items: SynthesizeLongOptions[]) {
    const batch = await this.batchRepo.findOne({ where: { id: batchId } });
    if (!batch) return;
    batch.status = TtsBatchStatus.PROCESSING;
    const jobIds: string[] = [];
    await this.batchRepo.save(batch);

    for (const item of items) {
      const job = await this.startLongForm({ ...item, batchId });
      jobIds.push(job.id);
      batch.jobIds = [...jobIds];
      await this.batchRepo.save(batch);

      // Wait for job completion
      let current = job;
      while (
        current.status !== TtsJobStatus.COMPLETED &&
        current.status !== TtsJobStatus.FAILED
      ) {
        await new Promise((r) => setTimeout(r, 400));
        current = await this.getJob(job.id);
        this.gateway.emitBatchProgress({
          batchId,
          completedJobs: batch.completedJobs,
          totalJobs: batch.totalJobs,
          currentJobId: job.id,
          currentJobProgress: current.progress,
        });
      }
      if (current.status === TtsJobStatus.COMPLETED) batch.completedJobs += 1;
      else batch.failedJobs += 1;
      await this.batchRepo.save(batch);
    }

    batch.status =
      batch.failedJobs === 0
        ? TtsBatchStatus.COMPLETED
        : batch.completedJobs === 0
          ? TtsBatchStatus.FAILED
          : TtsBatchStatus.PARTIAL;
    await this.batchRepo.save(batch);
  }

  async listBatches() {
    return this.batchRepo.find({ order: { createdAt: 'DESC' }, take: 50 });
  }

  async getBatch(id: string) {
    const batch = await this.batchRepo.findOne({ where: { id } });
    if (!batch) throw new NotFoundException(`Batch ${id} not found`);
    const jobs = batch.jobIds?.length
      ? await this.jobsRepo.find({ where: { id: In(batch.jobIds) } })
      : await this.jobsRepo.find({ where: { batchId: id } });
    return { batch, jobs: jobs.map((j) => this.toPublicJob(j)) };
  }

  async getSubtitles(jobId: string, format: 'vtt' | 'srt' | 'json' = 'vtt') {
    const job = await this.getJob(jobId);
    if (job.status !== TtsJobStatus.COMPLETED) {
      throw new BadRequestException('Job not completed');
    }
    let words = job.metadata?.wordTimestamps;
    if (!words?.length) {
      const durationMs = (job.metadata?.duration || 0) * 1000 || 60_000;
      words = estimateWordTimestamps(job.text, durationMs);
    }
    if (format === 'json') return { words };
    const cues = groupSubtitles(words);
    if (format === 'srt') return { content: toSrt(cues), contentType: 'application/x-subrip' };
    return { content: toWebVtt(cues), contentType: 'text/vtt' };
  }

  async resynthesizeChunk(
    jobId: string,
    index: number,
    override?: { text?: string; voiceId?: string },
  ): Promise<TtsJob> {
    const job = await this.getJob(jobId);
    if (job.status !== TtsJobStatus.COMPLETED || !job.outputKey) {
      throw new BadRequestException('Job must be completed to resynthesize a chunk');
    }
    const map = job.metadata?.chunkMap || [];
    const entry = map.find((c) => c.index === index);
    if (!entry) {
      throw new NotFoundException(`Chunk ${index} not found in job metadata`);
    }
    const engine = this.voiceManager.resolveEngine(
      job.engine === 'auto' ? 'auto' : job.engine,
    );
    const text = override?.text?.trim() || entry.textPreview;
    const voice = this.resolveVoice(override?.voiceId || job.voiceId || undefined, engine);
    const workDir = path.join(this.dataDir, job.id, 'resynth');
    await fs.mkdir(workDir, { recursive: true });
    const chunkPath = path.join(workDir, `chunk-${index}.wav`);
    await this.synthesizeOne(text, chunkPath, engine, voice, job.rate ?? undefined);
    const trimmed = path.join(workDir, `chunk-${index}-trim.wav`);
    try {
      await this.ffmpeg.trimChunkSilence(chunkPath, trimmed);
    } catch {
      await fs.copyFile(chunkPath, trimmed);
    }
    entry.audioKey = trimmed;
    entry.textPreview = text.slice(0, 50);
    // Rebuild full concat from available chunk audio when possible
    const parts = map
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((c) => c.audioKey)
      .filter((p): p is string => !!p && fssync.existsSync(p));
    if (parts.length) {
      const concatPath = path.join(workDir, 'rebuilt.wav');
      await this.ffmpeg.crossfadeChunks(parts, concatPath, {
        durationSec: 0.02,
        format: 'wav',
      });
      await this.ffmpeg.postProcessTts(concatPath, job.outputKey, {
        normalize: job.metadata?.postProcess?.normalize !== false,
        highpass: job.metadata?.postProcess?.highpass !== false,
        compress: job.metadata?.postProcess?.compress === true,
        format: job.format === 'mp3' ? 'mp3' : 'wav',
      });
    }
    job.metadata = { ...(job.metadata || {}), chunkMap: map };
    await this.jobsRepo.save(job);
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

      if (opts.dialogue || job.metadata?.dialogue) {
        await this.synthesizeDialogue(job, {
          engine,
          rate: opts.rate,
          format: format === 'mp3' ? 'mp3' : 'wav',
          workDir,
          outputPath,
          speakers: opts.speakers || job.metadata?.speakers,
          defaultVoice: voice,
          normalize: opts.normalize,
          highpass: opts.highpass,
          compress: opts.compress,
          ssml: opts.ssml || job.ssml,
        });
      } else if (chaptersSrc && chaptersSrc.length > 1) {
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
          jobId: job.id,
          onProgress: async (pct, chunksDone) => {
            job.progress = Math.round(pct);
            job.completedChunks = chunksDone;
            if (pct < 90) job.status = TtsJobStatus.SYNTHESIZING;
            else if (pct < 96) job.status = TtsJobStatus.CONCATENATING;
            else job.status = TtsJobStatus.NORMALIZING;
            await this.jobsRepo.save(job);
            this.gateway.emitProgress(job.id, job.progress, 'tts');
          },
          onChunkMap: async (chunkMap) => {
            job.metadata = { ...(job.metadata || {}), chunkMap };
            await this.jobsRepo.save(job);
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

      const durationMs = (duration || 0) * 1000;
      const wordTimestamps =
        durationMs > 0
          ? estimateWordTimestamps(job.text, durationMs)
          : undefined;
      const meta: TtsJobMetadata = {
        ...(job.metadata || {}),
        duration,
        sampleRate,
        wordCount: estimateWordCount(job.text),
        chapters: chapterMeta,
        title: opts.title || job.metadata?.title,
        wordTimestamps,
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

  private async synthesizeDialogue(
    job: TtsJob,
    opts: {
      engine: 'piper' | 'platform';
      rate?: number;
      format: 'wav' | 'mp3';
      workDir: string;
      outputPath: string;
      speakers?: Record<string, string>;
      defaultVoice?: UnifiedVoice;
      normalize?: boolean;
      highpass?: boolean;
      compress?: boolean;
      ssml?: boolean;
    },
  ) {
    const parsed = parseDialogue(job.text);
    job.status = TtsJobStatus.SYNTHESIZING;
    job.totalChunks = parsed.blocks.length;
    await this.jobsRepo.save(job);

    const parts: string[] = [];
    for (let i = 0; i < parsed.blocks.length; i++) {
      const block = parsed.blocks[i];
      const voiceId = opts.speakers?.[block.speaker];
      const voice = voiceId
        ? this.resolveVoice(voiceId, opts.engine)
        : opts.defaultVoice;
      let pieceText = block.text;
      if (this.pronunciation) {
        try {
          pieceText = await this.pronunciation.applyDictionary(
            pieceText,
            opts.engine,
          );
        } catch {
          /* keep original */
        }
      }
      const raw = path.join(opts.workDir, `dlg-${i}-raw.wav`);
      await this.synthesizeOne(
        pieceText,
        raw,
        opts.engine,
        voice,
        opts.rate,
      );
      const trimmed = path.join(opts.workDir, `dlg-${i}-trim.wav`);
      try {
        await this.ffmpeg.trimChunkSilence(raw, trimmed);
        parts.push(trimmed);
      } catch {
        parts.push(raw);
      }
      // Inter-speaker pause ~200ms (shorter than paragraph)
      if (i < parsed.blocks.length - 1) {
        const silence = path.join(opts.workDir, `dlg-${i}-gap.wav`);
        try {
          await this.ffmpeg.insertSilence(0.2, 22050, silence);
          parts.push(silence);
        } catch {
          /* skip gap if insertSilence unavailable */
        }
      }
      job.completedChunks = i + 1;
      job.progress = Math.round(((i + 1) / Math.max(1, parsed.blocks.length)) * 85);
      await this.jobsRepo.save(job);
      this.gateway.emitProgress(job.id, job.progress, 'tts');
      this.gateway.emitChunkReady(job.id, {
        chunkIndex: i,
        totalChunks: parsed.blocks.length,
        url: `/tts/jobs/${job.id}/chunks/${i}`,
      });
    }

    job.status = TtsJobStatus.CONCATENATING;
    await this.jobsRepo.save(job);
    const concatPath = path.join(opts.workDir, 'dlg-concat.wav');
    await this.ffmpeg.crossfadeChunks(parts, concatPath, {
      durationSec: 0.02,
      format: 'wav',
    });
    job.status = TtsJobStatus.NORMALIZING;
    await this.jobsRepo.save(job);
    await this.ffmpeg.postProcessTts(concatPath, opts.outputPath, {
      normalize: opts.normalize !== false,
      highpass: opts.highpass !== false,
      compress: opts.compress === true,
      format: opts.format,
    });
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
      jobId?: string;
      onProgress: (pct: number, chunksDone: number) => Promise<void>;
      onChunkMap?: (
        map: NonNullable<TtsJobMetadata['chunkMap']>,
      ) => Promise<void>;
    },
  ) {
    const partPaths: string[] = [];
    const chunkMap: NonNullable<TtsJobMetadata['chunkMap']> = [];
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
      let used = rawPart;
      try {
        await this.ffmpeg.trimChunkSilence(rawPart, trimmed);
        used = trimmed;
        partPaths.push(trimmed);
      } catch {
        partPaths.push(rawPart);
      }

      chunkMap.push({
        index: i,
        startOffset: 0,
        endOffset: chunks[i].charCount,
        textPreview: chunks[i].text.slice(0, 50),
        audioKey: used,
      });
      if (opts.onChunkMap) await opts.onChunkMap(chunkMap);
      if (opts.jobId) {
        this.gateway.emitChunkReady(opts.jobId, {
          chunkIndex: i,
          totalChunks: chunks.length,
          url: `/tts/jobs/${opts.jobId}/chunks/${i}`,
        });
      }

      const pct = ((i + 1) / n) * 80;
      await opts.onProgress(pct, i + 1);
    }

    if (partPaths.length === 0) {
      throw new Error('No TTS chunks produced');
    }

    await opts.onProgress(85, chunks.length);
    const concatPath = path.join(opts.workDir, 'concat.wav');
    // WHY 20ms crossfade: shorter produces clicks at boundaries; longer
    // creates audible double-speak / smear. Tuned in listening Phase 7.
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
