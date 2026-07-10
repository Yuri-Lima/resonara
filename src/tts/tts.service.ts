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
import {
  detectLanguage,
  expandTextForLanguage,
  normalizeLanguageCode,
  planMixedLanguageSynthesis,
} from './language';
import {
  preprocessText,
  PreprocessResult,
  PreprocessRules,
} from './text-preprocessor';
import {
  SynthesisQaService,
  QaMode,
  ChunkQaResult,
  JobQaSummary,
} from './qa/synthesis-qa.service';

export interface SynthesizeLongOptions {
  text: string;
  voice?: string;
  rate?: number;
  format?: 'wav' | 'mp3' | 'm4b';
  engine?: TtsEngineName;
  /** 'en' | 'pt-BR' | 'auto' (detect). */
  language?: string;
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
  /** Per-language voice ids for mixed documents. */
  voiceMap?: { en?: string; 'pt-BR'?: string };
  /**
   * Text preprocessing before chunking.
   * - document imports default ON (documentMode)
   * - raw text paste defaults OFF unless preprocessing.enabled or rules set
   */
  preprocessing?: {
    enabled?: boolean;
    documentMode?: boolean;
    rules?: import('./text-preprocessor').PreprocessRules;
  };
  /** Whisper QA mode: off | sample (every 3rd) | full. Default sample when available. */
  qa?: QaMode;
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
    @Optional() private readonly synthesisQa?: SynthesisQaService,
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
    const engines = this.voiceManager.engines();
    const allVoices = this.voiceManager.listVoices();
    const countByLang = (engineId: string) => {
      const subset = allVoices.filter((v) => v.engine === engineId);
      const en = subset.filter((v) => /en/i.test(v.language || v.id)).length;
      const pt = subset.filter((v) => /pt/i.test(v.language || v.id)).length;
      return { en, 'pt-BR': pt };
    };
    return {
      engines: engines.map((e) => ({
        ...e,
        languages: ['en', 'pt-BR'],
        voiceCountByLanguage: countByLang(e.id),
      })),
      piper: this.voiceManager.getPiperPaths(),
      languages: [
        { code: 'en', name: 'English' },
        { code: 'pt-BR', name: 'Português (Brasil)' },
      ],
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
   * Preview preprocessing without synthesizing.
   */
  previewPreprocess(
    text: string,
    opts?: {
      documentMode?: boolean;
      rules?: PreprocessRules;
      enabled?: boolean;
    },
  ): PreprocessResult {
    const documentMode = opts?.documentMode === true;
    const enabled =
      opts?.enabled === true ||
      documentMode ||
      (opts?.rules != null && Object.keys(opts.rules).length > 0);
    if (!enabled) {
      return { original: text || '', cleaned: text || '', removals: [] };
    }
    return preprocessText(text || '', {
      documentMode,
      rules: opts?.rules,
    });
  }

  /**
   * Start long-form TTS: persist job → chunk → synthesize → trim → crossfade → post-process.
   */
  async startLongForm(opts: SynthesizeLongOptions): Promise<TtsJob> {
    let text = (opts.text || '').trim();
    if (!text) throw new BadRequestException('text is required');

    // Preprocessing: document path opts in documentMode; raw paste only if enabled
    const prep = opts.preprocessing;
    const wantPrep =
      prep?.enabled === true ||
      prep?.documentMode === true ||
      (prep?.rules != null && Object.keys(prep.rules).length > 0);
    if (wantPrep) {
      const result = preprocessText(text, {
        documentMode: prep?.documentMode === true,
        rules: prep?.rules,
      });
      text = result.cleaned.trim();
      if (!text) {
        throw new BadRequestException(
          'text is empty after preprocessing (all content removed by rules)',
        );
      }
    }

    // Resolve language FIRST so engine auto-selection is language-aware
    // (Kokoro is English-only; pt-BR must use Piper or platform pt-BR).
    const langHint = opts.language || 'auto';
    const plan = planMixedLanguageSynthesis(text, {
      language: langHint === 'auto' ? 'auto' : langHint,
    });
    const primaryLang =
      plan.mode === 'single'
        ? plan.language
        : detectLanguage(text).code;

    // Auto-select voice for language when not provided
    let voice = opts.voice;
    if (!voice && plan.mode === 'single') {
      const def = this.voiceManager.getDefaultVoiceForLanguage(primaryLang);
      if (def) voice = def.id;
    }
    if (!voice && plan.mode === 'single' && /pt/i.test(primaryLang)) {
      // Fail clearly rather than speak Portuguese with English voice
      const any = this.voiceManager.listVoices({ language: 'pt-BR' });
      if (!any.length) {
        throw new BadRequestException(
          'No pt-BR voice available. Download a Piper pt-BR model or install a system Portuguese (Brazil) voice.',
        );
      }
      voice = any[0].id;
    }

    // Engine: honor explicit request; otherwise align to selected voice, then language-aware auto
    let engine: 'piper' | 'platform' | 'kokoro';
    try {
      if (opts.engine && opts.engine !== 'auto') {
        engine = this.voiceManager.resolveEngine(opts.engine, primaryLang);
      } else if (voice) {
        const resolved = this.voiceManager.getVoice(voice);
        if (resolved?.engine) {
          engine = resolved.engine;
        } else {
          engine = this.voiceManager.resolveEngine('auto', primaryLang);
        }
      } else {
        engine = this.voiceManager.resolveEngine('auto', primaryLang);
      }
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const dialogue =
      opts.dialogue === true ||
      (opts.dialogue !== false && hasDialogueMarkup(text));

    // Number/date/currency expansion + pronunciation (language-scoped)
    if (!dialogue && plan.mode === 'single') {
      try {
        text = expandTextForLanguage(text, primaryLang);
      } catch (e) {
        this.logger.warn(`Formatter failed: ${(e as Error).message}`);
      }
      if (this.pronunciation) {
        try {
          text = await this.pronunciation.applyDictionary(
            text,
            engine,
            primaryLang,
          );
        } catch (e) {
          this.logger.warn(`Dictionary apply failed: ${(e as Error).message}`);
        }
      }
    }

    const preset = opts.postProcessing || 'podcast';
    const post = this.resolvePostProcess(preset, opts);

    const languageBlocks =
      plan.mode === 'mixed'
        ? plan.blocks.map((b) => ({
            language: b.language,
            startOffset: b.startOffset,
            endOffset: b.endOffset,
            wordCount: estimateWordCount(b.text),
          }))
        : undefined;

    const job = this.jobsRepo.create({
      status: TtsJobStatus.QUEUED,
      text,
      voiceId: voice ?? null,
      // Persist resolved engine so resynth / restarts never re-pick English Kokoro for pt-BR
      engine: engine,
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
        language: primaryLang,
        languageBlocks,
      } as TtsJobMetadata & {
        language?: string;
        languageBlocks?: Array<{
          language: string;
          startOffset: number;
          endOffset: number;
          wordCount: number;
        }>;
      },
    });
    await this.jobsRepo.save(job);

    const runOpts: SynthesizeLongOptions = {
      ...opts,
      voice,
      language: primaryLang,
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
    let method: 'forced' | 'proportional' | 'cached' = words?.length
      ? 'cached'
      : 'proportional';

    // Prefer forced alignment via Whisper base when available and not cached
    if (
      !words?.length &&
      job.outputKey &&
      fssync.existsSync(job.outputKey) &&
      this.synthesisQa?.isAvailable()
    ) {
      try {
        const { WhisperService } = await import('../stt/whisper.service');
        const { forcedAlign } = await import('./alignment/forced-aligner');
        const whisper = new WhisperService();
        if (whisper.isAvailable()) {
          const tr = await whisper.transcribe(job.outputKey, {
            model: 'base',
            language: job.metadata?.language?.startsWith('pt') ? 'pt' : 'en',
            timeoutMs: 180_000,
          });
          const whWords = tr.segments.flatMap((s) => s.words || []);
          const aligned = forcedAlign(job.text, whWords);
          words = aligned.map((w) => ({
            word: w.word,
            startMs: w.startMs,
            endMs: w.endMs,
          }));
          method = 'forced';
          job.metadata = {
            ...(job.metadata || {}),
            wordTimestamps: words,
            alignmentMethod: 'forced',
          };
          await this.jobsRepo.save(job);
        }
      } catch (e) {
        this.logger.warn(`Forced alignment failed: ${(e as Error).message}`);
      }
    }

    if (!words?.length) {
      const durationMs = (job.metadata?.duration || 0) * 1000 || 60_000;
      words = estimateWordTimestamps(job.text, durationMs);
      method = 'proportional';
      job.metadata = {
        ...(job.metadata || {}),
        alignmentMethod: 'proportional',
      };
    }
    if (format === 'json') return { words, method };
    const cues = groupSubtitles(words);
    if (format === 'srt') {
      return {
        content: toSrt(cues),
        contentType: 'application/x-subrip',
        method,
      };
    }
    return { content: toWebVtt(cues), contentType: 'text/vtt', method };
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
    const lang =
      (job.metadata as { language?: string } | undefined)?.language || 'en';
    const engine = this.voiceManager.resolveEngine(
      (job.engine === 'auto' ? 'auto' : job.engine) as
        | 'auto'
        | 'piper'
        | 'platform'
        | 'kokoro',
      lang,
    );
    const text = override?.text?.trim() || entry.textPreview;
    const voice = this.resolveVoice(
      override?.voiceId || job.voiceId || undefined,
      engine,
      lang,
    );
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
    // Document imports: preprocess each chapter with document defaults ON
    // unless caller explicitly disables preprocessing.enabled === false.
    const prepDisabled = opts.preprocessing?.enabled === false;
    const chapters = doc.chapters.map((c) => {
      if (prepDisabled) return c;
      const cleaned = preprocessText(c.text, {
        documentMode: true,
        rules: opts.preprocessing?.rules,
      }).cleaned;
      const title = preprocessText(c.title || '', {
        documentMode: true,
        rules: {
          ...opts.preprocessing?.rules,
          // Titles: keep caps transform + whitespace; skip aggressive header strip on short titles
          headers: false,
          pageNumbers: true,
        },
      }).cleaned;
      return { title: title || c.title, text: cleaned };
    });
    const fullText = chapters
      .map((c) => `### ${c.title}\n\n${c.text}`)
      .join('\n\n');
    return this.startLongForm({
      ...opts,
      // Already cleaned per-chapter; avoid double-processing chapter markers
      preprocessing: prepDisabled
        ? { enabled: false }
        : { enabled: false, documentMode: true, rules: opts.preprocessing?.rules },
      text: fullText,
      title: doc.title,
      chapters,
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
    const lang =
      opts.language && opts.language !== 'auto'
        ? normalizeLanguageCode(opts.language)
        : detectLanguage(text).code;
    const voiceHint =
      opts.voice ||
      this.voiceManager.getDefaultVoiceForLanguage(lang)?.id;
    let engine: 'piper' | 'platform' | 'kokoro';
    if (opts.engine && opts.engine !== 'auto') {
      engine = this.voiceManager.resolveEngine(opts.engine, lang);
    } else if (voiceHint) {
      const rv = this.voiceManager.getVoice(voiceHint);
      engine = rv?.engine || this.voiceManager.resolveEngine('auto', lang);
    } else {
      engine = this.voiceManager.resolveEngine('auto', lang);
    }
    text = expandTextForLanguage(text, lang);
    if (this.pronunciation) {
      text = await this.pronunciation.applyDictionary(text, engine, lang);
    }
    const voice =
      this.resolveVoice(opts.voice || voiceHint, engine, lang) ||
      this.voiceManager.getDefaultVoiceForLanguage(lang, engine);
    const chunks = chunkTextForTts(text, { engine, language: lang });
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
    engine: 'piper' | 'platform' | 'kokoro',
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

      const voice = this.resolveVoice(
        opts.voice,
        engine,
        opts.language || job.metadata?.language,
      );
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
        const lang =
          opts.language ||
          job.metadata?.language ||
          detectLanguage(job.text).code;
        const chunks = chunkTextForTts(job.text, {
          engine,
          language: lang,
        });
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
          qaMode: opts.qa,
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
          onQa: async (summary) => {
            job.metadata = {
              ...(job.metadata || {}),
              qa: {
                mode: summary.mode,
                aggregateWer: summary.aggregateWer,
                failedCount: summary.failedCount,
                sampledCount: summary.sampledCount,
                threshold: summary.threshold,
                chunks: summary.chunks,
              },
            };
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
      engine: 'piper' | 'platform' | 'kokoro';
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

    if (!parts.length) {
      throw new Error('Dialogue synthesis produced no audio parts');
    }

    job.status = TtsJobStatus.CONCATENATING;
    await this.jobsRepo.save(job);
    const concatPath = path.join(opts.workDir, 'dlg-concat.wav');
    // Hard-concat is more reliable for dialogue (short lines + silence gaps).
    // Crossfade still used for same-voice long-form chunks.
    if (typeof this.ffmpeg.concatAudioFiles === 'function') {
      await this.ffmpeg.concatAudioFiles(parts, concatPath, { format: 'wav' });
    } else {
      await this.ffmpeg.crossfadeChunks(parts, concatPath, {
        durationSec: 0.02,
        format: 'wav',
      });
    }
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
      engine: 'piper' | 'platform' | 'kokoro';
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
      engine: 'piper' | 'platform' | 'kokoro';
      rate?: number;
      format: 'wav' | 'mp3';
      outputPath: string;
      workDir: string;
      ssml?: boolean;
      normalize?: boolean;
      highpass?: boolean;
      compress?: boolean;
      jobId?: string;
      qaMode?: QaMode;
      onProgress: (pct: number, chunksDone: number) => Promise<void>;
      onChunkMap?: (
        map: NonNullable<TtsJobMetadata['chunkMap']>,
      ) => Promise<void>;
      onQa?: (summary: JobQaSummary) => Promise<void>;
    },
  ) {
    const partPaths: string[] = [];
    const chunkMap: NonNullable<TtsJobMetadata['chunkMap']> = [];
    const qaResults: ChunkQaResult[] = [];
    const n = chunks.length || 1;
    const qaMode: QaMode =
      opts.qaMode ||
      (this.synthesisQa?.isAvailable() ? 'sample' : 'off');
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

      // Per-chunk Whisper QA (sample/full)
      if (
        this.synthesisQa?.isAvailable() &&
        this.synthesisQa.shouldSample(i, qaMode)
      ) {
        try {
          const engine = opts.engine;
          const voice = opts.voice;
          const rate = opts.rate;
          const qa = await this.synthesisQa.qaWithRetry(i, pieceText, used, {
            resynthesize: async () => {
              const retryRaw = path.join(
                opts.workDir,
                `part-${String(i).padStart(4, '0')}-retry-raw.wav`,
              );
              await this.synthesizeOne(pieceText, retryRaw, engine, voice, rate);
              const retryTrim = path.join(
                opts.workDir,
                `part-${String(i).padStart(4, '0')}-retry-trim.wav`,
              );
              try {
                await this.ffmpeg.trimChunkSilence(retryRaw, retryTrim);
                // replace part path
                const idx = partPaths.length - 1;
                if (idx >= 0) partPaths[idx] = retryTrim;
                used = retryTrim;
                return retryTrim;
              } catch {
                const idx = partPaths.length - 1;
                if (idx >= 0) partPaths[idx] = retryRaw;
                used = retryRaw;
                return retryRaw;
              }
            },
          });
          qaResults.push(qa);
        } catch (e) {
          this.logger.warn(
            `QA skipped for chunk ${i}: ${(e as Error).message}`,
          );
        }
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

    if (qaResults.length && opts.onQa) {
      const summary = this.synthesisQa!.aggregate(qaResults, qaMode);
      await opts.onQa(summary);
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
    engine: 'piper' | 'platform' | 'kokoro',
    voice?: UnifiedVoice,
    rate?: number,
  ): Promise<void> {
    if (engine === 'kokoro') {
      // Lazy require to keep Phase 5 green before Phase 8 lands fully
      const { synthesizeWithKokoro } = await import('./kokoro-tts');
      await synthesizeWithKokoro({
        text,
        outputPath: outPath,
        voiceId: voice?.nativeId,
        rate,
      });
      return;
    }
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
    engine: 'piper' | 'platform' | 'kokoro',
    language?: string,
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
    if (language) {
      return (
        this.voiceManager.defaultVoice(engine, language) ||
        this.voiceManager.getDefaultVoiceForLanguage(language, engine)
      );
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

  /**
   * Export EPUB 3 Media Overlays package for a completed job.
   */
  async exportEpubOverlay(jobId: string) {
    const job = await this.getJob(jobId);
    if (job.status !== TtsJobStatus.COMPLETED) {
      throw new BadRequestException('Job not completed');
    }
    const { writeOverlayPackage, validateSmilMonotonic } = await import(
      './export/epub-overlay-exporter'
    );
    const sub = await this.getSubtitles(jobId, 'json');
    const words =
      'words' in sub && Array.isArray(sub.words)
        ? (sub.words as { word: string; startMs: number; endMs: number }[])
        : [];
    const sentences: {
      id: string;
      text: string;
      clipBeginSec: number;
      clipEndSec: number;
    }[] = [];
    let buf: typeof words = [];
    let si = 0;
    const flush = () => {
      if (!buf.length) return;
      si++;
      sentences.push({
        id: `s${String(si).padStart(4, '0')}`,
        text: buf.map((w) => w.word).join(' '),
        clipBeginSec: (buf[0].startMs || 0) / 1000,
        clipEndSec: (buf[buf.length - 1].endMs || 0) / 1000,
      });
      buf = [];
    };
    for (const w of words) {
      buf.push(w);
      if (/[.!?]["']?$/.test(w.word)) flush();
    }
    flush();
    if (!sentences.length) {
      sentences.push({
        id: 's0001',
        text: job.text.slice(0, 500),
        clipBeginSec: 0,
        clipEndSec: job.metadata?.duration || 1,
      });
    }
    if (!validateSmilMonotonic(sentences)) {
      this.logger.warn(`SMIL timestamps non-monotonic for job ${jobId}; clamping`);
      let prev = 0;
      for (const s of sentences) {
        s.clipBeginSec = Math.max(s.clipBeginSec, prev);
        s.clipEndSec = Math.max(s.clipEndSec, s.clipBeginSec + 0.05);
        prev = s.clipEndSec;
      }
    }
    const outDir = path.join(
      path.dirname(job.outputKey || path.join(this.dataDir, 'tts', job.id)),
      'epub-overlay',
    );
    const audioName = job.outputKey
      ? path.basename(job.outputKey)
      : 'speech.wav';
    if (job.outputKey && fssync.existsSync(job.outputKey)) {
      fssync.mkdirSync(outDir, { recursive: true });
      fssync.copyFileSync(job.outputKey, path.join(outDir, audioName));
    }
    const paths = writeOverlayPackage(outDir, {
      title: job.metadata?.title || 'Resonara Audiobook',
      sentences,
      audioFileName: audioName,
      xhtmlBody: `<p>${job.text.slice(0, 8000)}</p>`,
    });
    job.metadata = {
      ...(job.metadata || {}),
      epubOverlayDir: outDir,
    };
    await this.jobsRepo.save(job);
    return {
      outDir,
      ...paths,
      sentenceCount: sentences.length,
      method: 'method' in sub ? sub.method : 'unknown',
    };
  }

  /**
   * Re-run Whisper QA on a completed job using persisted chunk audio paths.
   */
  async rerunQa(jobId: string) {
    const job = await this.getJob(jobId);
    if (!this.synthesisQa?.isAvailable()) {
      throw new BadRequestException(
        'Whisper QA unavailable. Run: node scripts/download-whisper.js',
      );
    }
    const map = job.metadata?.chunkMap || [];
    if (!map.length) {
      throw new BadRequestException('Job has no chunk map for QA');
    }
    const results: ChunkQaResult[] = [];
    for (const entry of map) {
      const audio = entry.audioKey;
      if (!audio || !fssync.existsSync(audio)) continue;
      const chunkText = entry.textPreview || '';
      let text = chunkText;
      if (
        typeof entry.startOffset === 'number' &&
        typeof entry.endOffset === 'number' &&
        entry.endOffset > entry.startOffset
      ) {
        text =
          job.text.slice(
            entry.startOffset,
            entry.startOffset + Math.max(entry.endOffset, chunkText.length),
          ) || chunkText;
      }
      if (!text.trim()) text = chunkText;
      try {
        const r = await this.synthesisQa.qaWithRetry(entry.index, text, audio);
        results.push(r);
      } catch (e) {
        this.logger.warn(
          `QA rerun chunk ${entry.index}: ${(e as Error).message}`,
        );
      }
    }
    const summary = this.synthesisQa.aggregate(results, 'full');
    job.metadata = {
      ...(job.metadata || {}),
      qa: {
        mode: 'full',
        aggregateWer: summary.aggregateWer,
        failedCount: summary.failedCount,
        sampledCount: summary.sampledCount,
        threshold: summary.threshold,
        chunks: summary.chunks,
      },
    };
    await this.jobsRepo.save(job);
    return job.metadata.qa;
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
