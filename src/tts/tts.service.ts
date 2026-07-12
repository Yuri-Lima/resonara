import {
  BadRequestException,
  ConflictException,
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
import {
  PauseMapEntry,
  PauseProfile,
  PauseProfileName,
} from './pause/pause.types';
import {
  dialogueGapMs,
  buildAssemblePlan,
  flattenPlanForConcat,
  shouldTrimChunkEdge,
} from './pause/assemble-with-pauses';
import { resolvePauseProfile } from './pause/pause-profiles';
import { toSpeakable } from './pause/boundary-detect';
import { planMicroPauseSegments } from './pause/micro-pauses';
import {
  AppError,
  checkDiskSpace,
  mapEngineError,
  userFacingMessage,
} from '../common/app-error';

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
  /**
   * Pause profile for boundary-aware gaps.
   * 'audiobook' (default) | 'podcast' | 'news' | 'custom'
   */
  pauseProfile?: PauseProfileName;
  /** Per-boundary ms overrides when pauseProfile='custom' (or to tweak a preset). */
  pauseCustom?: Partial<
    Record<
      | 'comma'
      | 'semicolon'
      | 'colon'
      | 'emDash'
      | 'sentence'
      | 'ellipsis'
      | 'paragraph'
      | 'header'
      | 'preHeader'
      | 'chapter'
      | 'dialogue'
      | 'dialogueAttrib',
      number
    >
  >;
  /** Attribution-driven auto-direction (default false). */
  autoDirect?: boolean;
  /** Parse/compile REM markup when present. */
  rem?: boolean;
  /** Emotion exaggeration 0..1 for expressive tier. */
  exaggeration?: number;
  /** Style profile for direction/humanization. */
  styleProfile?: string;
  /** Humanization micro-layer. */
  humanize?: boolean;
  /** Consent for voice cloning. */
  cloneConsent?: boolean;
  /** Reference audio for cloning. */
  referenceAudioPath?: string;
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
      job.error =
        'Synthesis was interrupted by a restart. Retry the job from the library.';
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
      const en = subset.filter((v) =>
        /en/i.test(`${v.language || ''} ${v.id}`),
      ).length;
      const pt = subset.filter((v) =>
        /pt/i.test(`${v.language || ''} ${v.id}`),
      ).length;
      return { en, 'pt-BR': pt };
    };
    return {
      engines: engines.map((e) => {
        const byLang = countByLang(e.id);
        // Honesty: only advertise languages that have at least one voice.
        // Kokoro is English-only today — do not list pt-BR when count is 0.
        const languages = (['en', 'pt-BR'] as const).filter(
          (code) => (byLang[code] || 0) > 0,
        );
        return {
          ...e,
          languages: languages.length ? [...languages] : [],
          voiceCountByLanguage: byLang,
        };
      }),
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
    // G28 TODO-12: do not delete while synthesis pipeline is active
    const inFlight: TtsJobStatus[] = [
      TtsJobStatus.QUEUED,
      TtsJobStatus.CHUNKING,
      TtsJobStatus.SYNTHESIZING,
      TtsJobStatus.CONCATENATING,
      TtsJobStatus.NORMALIZING,
    ];
    if (inFlight.includes(job.status)) {
      throw new ConflictException(
        `Cannot delete job ${id} while status is ${job.status}`,
      );
    }
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

    // Disk preflight before long synthesis (skip if free space unknown)
    const disk = checkDiskSpace(this.dataDir);
    if (disk && !disk.ok) {
      throw new BadRequestException(
        new AppError(
          'DISK_FULL',
          `Not enough free disk space to synthesize (need >100MB under ${disk.path}). Free space and try again.`,
          { retryable: true, details: { freeBytes: disk.freeBytes } },
        ).userMessage,
      );
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
    let engine: 'piper' | 'platform' | 'kokoro' | 'expressive';
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

    // Expression direction layer (opt-in): autoDirect → humanize breaths → REM compile
    // Runtime controls are persisted on job.metadata.expression and honored at synth time.
    let expressionMeta: TtsJobMetadata['expression'] | undefined;
    if (opts.autoDirect) {
      try {
        const { applyAutoDirection } = await import('./expression/auto-direction');
        const directed = applyAutoDirection(text, {
          enabled: true,
          language: primaryLang,
          defaultStyle:
            opts.styleProfile === 'news'
              ? 'newscast'
              : opts.styleProfile === 'children'
                ? 'animated'
                : opts.styleProfile === 'podcast'
                  ? 'conversational'
                  : 'narrative',
        });
        if (directed.applied) {
          text = directed.text;
          this.logger.log(
            `Auto-direction applied: ${directed.hintsApplied} hints`,
          );
        }
      } catch (e) {
        this.logger.warn(`Auto-direction failed: ${(e as Error).message}`);
      }
    }
    if (opts.humanize) {
      try {
        const { injectBreathMarkers } = await import('./expression/humanization');
        const profile =
          opts.styleProfile === 'news'
            ? 'news'
            : opts.styleProfile === 'podcast'
              ? 'podcast'
              : 'audiobook';
        const breathed = injectBreathMarkers(text, {
          profile: profile as 'audiobook' | 'podcast' | 'news',
          breaths: profile !== 'news',
        });
        if (breathed.count > 0) {
          text = breathed.text;
          this.logger.log(`Humanize: injected ${breathed.count} breath markers`);
        }
      } catch (e) {
        this.logger.warn(`Humanize breath inject failed: ${(e as Error).message}`);
      }
    }
    // Compile REM: expressive keeps native tags + per-segment controls;
    // other engines get speakable-only (never read tags aloud).
    {
      const wantsRem =
        opts.rem !== false &&
        (/\[(laugh|sigh|breath|chuckle|gasp|cough)\]|\{emotion:|\{style:/i.test(
          text,
        ) ||
          opts.autoDirect ||
          opts.humanize ||
          opts.exaggeration != null ||
          !!opts.styleProfile);
      try {
        const { compileRem } = await import('./expression/rem-compiler');
        const { buildExpressionRuntime } = await import(
          './expression/direction-runtime'
        );
        const compiled = wantsRem ? compileRem(text, engine) : null;
        const runtime = buildExpressionRuntime({
          engine,
          plainText: text,
          exaggeration: opts.exaggeration,
          humanize: opts.humanize === true,
          styleProfile: opts.styleProfile,
          compiled,
        });
        // Persist engine-facing text (tags kept for expressive)
        text =
          engine === 'expressive'
            ? runtime.engineText
            : runtime.speakableText || runtime.engineText;
        expressionMeta = {
          directed: runtime.directed,
          humanize: runtime.humanize,
          exaggeration: runtime.exaggeration,
          emotion: runtime.emotion as string | undefined,
          style: runtime.style as string | undefined,
          affect: runtime.affect,
          multiControl: runtime.multiControl,
          remWarnings: runtime.remWarnings,
          remDegraded: runtime.remDegraded,
          segments: runtime.segments.map((s) => ({
            text: s.text,
            speakable: s.speakable,
            exaggeration: s.exaggeration,
            emotion: s.emotion as string | undefined,
            style: s.style as string | undefined,
            affect: s.affect,
            rate: s.rate,
          })),
        };
        if (runtime.remWarnings?.length) {
          this.logger.debug(`REM compile: ${runtime.remWarnings.join('; ')}`);
        }
        this.logger.log(
          `Expression runtime: exaggeration=${runtime.exaggeration.toFixed(2)} ` +
            `affect=${runtime.affect} humanize=${runtime.humanize} ` +
            `segments=${runtime.segments.length} multiControl=${runtime.multiControl}`,
        );
      } catch (e) {
        this.logger.warn(`Expression runtime failed: ${(e as Error).message}`);
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
        expression: expressionMeta,
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
    let engine: 'piper' | 'platform' | 'kokoro' | 'expressive';
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
    engine: 'piper' | 'platform' | 'kokoro' | 'expressive',
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
          expression: job.metadata?.expression,
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
            expression: job.metadata?.expression,
          },
        );
      } else {
        const lang =
          opts.language ||
          job.metadata?.language ||
          detectLanguage(job.text).code;
        const pauseProfile = resolvePauseProfile({
          profile: opts.pauseProfile || 'audiobook',
          custom: opts.pauseCustom,
          language: lang,
        });
        job.metadata = {
          ...(job.metadata || {}),
          pauseProfile: pauseProfile.name,
          pauseBands: pauseProfile.bands,
        };
        // Prefer persisted expression from startLongForm; also merge request opts
        let expression: TtsJobMetadata['expression'] | undefined =
          job.metadata?.expression ||
          (opts.exaggeration != null ||
          opts.humanize ||
          opts.styleProfile ||
          opts.autoDirect
            ? {
                directed: true,
                humanize: opts.humanize === true,
                exaggeration: opts.exaggeration,
                style: opts.styleProfile,
              }
            : undefined);

        // Multi-control REM: expand each directed segment into chunks and map controls
        let chunks: TextChunk[];
        let chunkSegmentMap: number[] | undefined;
        if (
          engine === 'expressive' &&
          expression?.multiControl &&
          expression.segments &&
          expression.segments.length > 1
        ) {
          chunks = [];
          chunkSegmentMap = [];
          let idx = 0;
          for (let si = 0; si < expression.segments.length; si++) {
            const seg = expression.segments[si];
            const piece = (seg.text || seg.speakable || '').trim();
            if (!piece) continue;
            const sub = chunkTextForTts(piece, {
              engine,
              language: lang as import('./language/language.types').LanguageCode,
            });
            for (const c of sub) {
              chunks.push({ ...c, index: idx });
              chunkSegmentMap[idx] = si;
              idx++;
            }
          }
          if (!chunks.length) {
            chunks = chunkTextForTts(job.text, {
              engine,
              language: lang as import('./language/language.types').LanguageCode,
            });
            chunkSegmentMap = undefined;
          } else {
            expression = { ...expression, chunkSegmentMap };
          }
        } else {
          chunks = chunkTextForTts(job.text, {
            engine,
            language: lang as import('./language/language.types').LanguageCode,
          });
        }
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
          pauseProfile,
          language: lang,
          expression,
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
      const mapped = mapEngineError(String(job.engine || 'auto'), err);
      const message = userFacingMessage(mapped);
      job.status = TtsJobStatus.FAILED;
      job.error = message;
      job.metadata = {
        ...(job.metadata || {}),
        // Typed error for UI/CLI (no stack traces)
        lastError: mapped.toJSON(),
      } as TtsJobMetadata;
      await this.jobsRepo.save(job);
      this.gateway.emitFailed(job.id, message);
      // G28 TODO-23: drop intermediate chunk trees on failure
      const workDir = path.join(this.dataDir, job.id);
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }

  private async synthesizeDialogue(
    job: TtsJob,
    opts: {
      engine: 'piper' | 'platform' | 'kokoro' | 'expressive';
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
      expression?: NonNullable<TtsJobMetadata['expression']>;
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
        undefined,
        opts.expression || job.metadata?.expression,
      );
      const trimmed = path.join(opts.workDir, `dlg-${i}-trim.wav`);
      try {
        await this.ffmpeg.trimChunkSilence(raw, trimmed);
        parts.push(trimmed);
      } catch {
        parts.push(raw);
      }
      // Inter-speaker pause from pause profile (dialogue / travessão band)
      if (i < parsed.blocks.length - 1) {
        const silence = path.join(opts.workDir, `dlg-${i}-gap.wav`);
        try {
          const dlgProfile = resolvePauseProfile({
            profile: 'audiobook',
            language:
              (job.metadata as { language?: string } | undefined)?.language,
          });
          const gapMs = dialogueGapMs(
            dlgProfile,
            (job.metadata as { language?: string } | undefined)?.language,
          );
          await this.ffmpeg.insertSilence(gapMs / 1000, 22050, silence);
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
      engine: 'piper' | 'platform' | 'kokoro' | 'expressive';
      rate?: number;
      format: 'wav' | 'mp3';
      workDir: string;
      ssml?: boolean;
      normalize?: boolean;
      highpass?: boolean;
      compress?: boolean;
      outputPath: string;
      expression?: NonNullable<TtsJobMetadata['expression']>;
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
        expression: opts.expression || job.metadata?.expression,
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

    // Chapter assembly: profile chapter gap between chapters (not flat crossfade)
    const chapterProfile = resolvePauseProfile({
      profile: 'audiobook',
      language: (job.metadata as { language?: string } | undefined)?.language,
    });
    const chapterGapSec = chapterProfile.bands.chapter.insertMs / 1000;
    const wavParts: string[] = [];
    for (let i = 0; i < chapterFiles.length; i++) {
      const w = path.join(opts.workDir, `ch-full-${i}.wav`);
      if (chapterFiles[i].endsWith('.wav')) {
        await fs.copyFile(chapterFiles[i], w);
      } else {
        await this.convertToWav(chapterFiles[i], w);
      }
      wavParts.push(w);
      if (i < chapterFiles.length - 1 && chapterGapSec > 0) {
        const gap = path.join(opts.workDir, `ch-gap-${i}.wav`);
        await this.ffmpeg.insertSilence(chapterGapSec, 22050, gap);
        wavParts.push(gap);
      }
    }
    const concatWav = path.join(opts.workDir, 'full-concat.wav');
    await this.ffmpeg.concatAudioFiles(wavParts, concatWav, {
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
      engine: 'piper' | 'platform' | 'kokoro' | 'expressive';
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
      pauseProfile?: PauseProfile;
      language?: string;
      /** Expression runtime from job.metadata.expression — threaded to synth. */
      expression?: NonNullable<TtsJobMetadata['expression']>;
      onProgress: (pct: number, chunksDone: number) => Promise<void>;
      onChunkMap?: (
        map: NonNullable<TtsJobMetadata['chunkMap']>,
      ) => Promise<void>;
      onQa?: (summary: JobQaSummary) => Promise<void>;
    },
  ) {
    const partPaths: string[] = [];
    const pauseMaps: PauseMapEntry[] = [];
    const chunkMap: NonNullable<TtsJobMetadata['chunkMap']> = [];
    const qaResults: ChunkQaResult[] = [];
    const n = chunks.length || 1;
    const qaMode: QaMode =
      opts.qaMode ||
      (this.synthesisQa?.isAvailable() ? 'sample' : 'off');
    const profile =
      opts.pauseProfile ||
      resolvePauseProfile({
        profile: 'audiobook',
        language: opts.language,
      });
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
      const pause: PauseMapEntry = chunks[i].pause || {
        endsAt: i === chunks.length - 1 ? 'document-end' : 'paragraph',
        intraBoundaries: [],
      };
      if (opts.ssml || /<[^>]+>/.test(pieceText)) {
        const transformed = transformSsml(pieceText, {
          engine: ssmlEngine,
          isSsml: true,
        });
        pieceText = transformed.engineText || transformed.plainText;
      } else {
        // Strip markdown markers for engines that choke on --- / #
        pieceText = toSpeakable(pieceText);
      }

      // Platform macOS: inject [[slnc]] micro-pauses for commas/dashes
      if (opts.engine === 'platform' && process.platform === 'darwin') {
        pieceText = injectMacSlncPauses(pieceText, profile);
      }

      const rawPart = path.join(
        opts.workDir,
        `part-${String(i).padStart(4, '0')}-raw.wav`,
      );
      // Per-chunk expression: multiControl maps rem segments by order when available
      const chunkExpr = this.expressionForChunk(opts.expression, i, chunks.length);

      await this.synthesizeOne(
        pieceText,
        rawPart,
        opts.engine,
        opts.voice,
        opts.rate,
        profile,
        chunkExpr,
      );

      // Boundary-aware trim: keep trailing silence except at forced seams
      const trimTrailing = shouldTrimChunkEdge(pause, 'trailing');
      const trimLeading = shouldTrimChunkEdge(pause, 'leading');
      const trimmed = path.join(
        opts.workDir,
        `part-${String(i).padStart(4, '0')}-trim.wav`,
      );
      let used = rawPart;
      try {
        await this.ffmpeg.trimChunkSilence(rawPart, trimmed, {
          trimLeading,
          trimTrailing,
        });
        used = trimmed;
        partPaths.push(trimmed);
      } catch {
        partPaths.push(rawPart);
      }
      pauseMaps.push(pause);

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
              await this.synthesizeOne(
                pieceText,
                retryRaw,
                engine,
                voice,
                rate,
                profile,
                chunkExpr,
              );
              const retryTrim = path.join(
                opts.workDir,
                `part-${String(i).padStart(4, '0')}-retry-trim.wav`,
              );
              try {
                await this.ffmpeg.trimChunkSilence(retryRaw, retryTrim, {
                  trimLeading,
                  trimTrailing,
                });
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
        endsAt: pause.endsAt,
        isHeader: pause.isHeader,
        headerLevel: pause.headerLevel,
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

    // Boundary-aware assembly: silence gaps + forced-only crossfade
    await this.assembleWithPauseMap(partPaths, pauseMaps, concatPath, {
      profile,
      workDir: opts.workDir,
      engine: opts.engine,
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

  /**
   * Assemble chunk WAVs using the pause map:
   *  - forced joins → 20ms crossfade (seam fix preserved)
   *  - all other boundaries → profile silence insert (one concat pass)
   */
  private async assembleWithPauseMap(
    partPaths: string[],
    pauseMaps: PauseMapEntry[],
    outputPath: string,
    opts: {
      profile: PauseProfile;
      workDir: string;
      engine: string;
    },
  ): Promise<void> {
    if (partPaths.length === 1) {
      await fs.copyFile(partPaths[0], outputPath);
      return;
    }

    // Pre-resolve forced joins into crossfaded segments
    const resolved: Array<{ path: string; pause: PauseMapEntry }> = [];
    let i = 0;
    while (i < partPaths.length) {
      const pause = pauseMaps[i] || {
        endsAt: 'document-end' as const,
        intraBoundaries: [],
      };
      if (
        pause.endsAt === 'forced' &&
        i + 1 < partPaths.length
      ) {
        // Crossfade this chunk with the next; absorb next's pause map
        const xfOut = path.join(
          opts.workDir,
          `xf-${String(i).padStart(4, '0')}.wav`,
        );
        try {
          await this.ffmpeg.crossfadeChunks(
            [partPaths[i], partPaths[i + 1]],
            xfOut,
            { durationSec: 0.02, format: 'wav' },
          );
          // Carry the NEXT chunk's end boundary forward
          const nextPause = pauseMaps[i + 1] || pause;
          resolved.push({ path: xfOut, pause: nextPause });
          i += 2;
          continue;
        } catch {
          // fall through to plain keep
        }
      }
      resolved.push({ path: partPaths[i], pause });
      i += 1;
    }

    const plan = buildAssemblePlan(
      resolved.map((r) => ({ path: r.path, pause: r.pause })),
      {
        profile: opts.profile,
        accountForEngineSentenceSilence: opts.engine === 'piper',
        jitter: true,
      },
    );
    const flat = flattenPlanForConcat(plan);

    // Materialize silence WAVs and concat in one pass
    const sampleRate = 22050;
    const concatParts: string[] = [];
    let silIdx = 0;
    for (const item of flat) {
      if (item.type === 'audio') {
        concatParts.push(item.path);
      } else {
        const silPath = path.join(
          opts.workDir,
          `gap-${String(silIdx++).padStart(4, '0')}.wav`,
        );
        await this.ffmpeg.insertSilence(item.sec, sampleRate, silPath);
        concatParts.push(silPath);
      }
    }

    if (concatParts.length === 1) {
      await fs.copyFile(concatParts[0], outputPath);
      return;
    }
    await this.ffmpeg.concatAudioFiles(concatParts, outputPath, {
      format: 'wav',
    });
  }

  private async synthesizeOne(
    text: string,
    outPath: string,
    engine: 'piper' | 'platform' | 'kokoro' | 'expressive',
    voice?: UnifiedVoice,
    rate?: number,
    pauseProfile?: PauseProfile,
    expression?: NonNullable<TtsJobMetadata['expression']>,
  ): Promise<void> {
    // Intra-chunk micro-pauses for piper/kokoro/expressive (platform uses [[slnc]] upstream)
    if (
      pauseProfile &&
      (engine === 'piper' || engine === 'kokoro' || engine === 'expressive') &&
      text.length > 0
    ) {
      const segments = planMicroPauseSegments(text, pauseProfile);
      if (segments.length > 1) {
        await this.synthesizeWithMicroPauses(
          segments,
          outPath,
          engine,
          voice,
          rate,
          pauseProfile,
          expression,
        );
        return;
      }
    }

    await this.synthesizeOneRaw(
      text,
      outPath,
      engine,
      voice,
      rate,
      pauseProfile,
      expression,
    );
  }

  /** Single-utterance engine call (no micro-split). */
  private async synthesizeOneRaw(
    text: string,
    outPath: string,
    engine: 'piper' | 'platform' | 'kokoro' | 'expressive',
    voice?: UnifiedVoice,
    rate?: number,
    pauseProfile?: PauseProfile,
    expression?: NonNullable<TtsJobMetadata['expression']>,
  ): Promise<void> {
    if (engine === 'expressive') {
      const { synthesizeWithExpressive, isExpressiveAvailable } = await import(
        './expressive-tts'
      );
      if (!isExpressiveAvailable()) {
        // Fallback chain: expressive → kokoro → piper → platform (same language)
        const { isKokoroAvailable } = await import('./kokoro-tts');
        if (isKokoroAvailable()) {
          const { synthesizeWithKokoro } = await import('./kokoro-tts');
          await synthesizeWithKokoro({
            text,
            outputPath: outPath,
            voiceId: voice?.nativeId?.startsWith('kokoro')
              ? voice.nativeId
              : undefined,
            rate,
          });
          return;
        }
        const piperVoice = this.voiceManager.defaultVoice('piper');
        if (piperVoice?.modelPath) {
          await synthesizeWithPiper({
            text,
            modelPath: piperVoice.modelPath,
            outputPath: outPath,
          });
          return;
        }
        throw new Error('Expressive unavailable and no fallback engine');
      }
      // Honor job/REM exaggeration — never silently force 0.55 over user/REM controls
      const exaggeration =
        expression?.exaggeration != null &&
        Number.isFinite(expression.exaggeration)
          ? Math.max(0, Math.min(1, expression.exaggeration))
          : 0.55;
      const prePath = expression?.humanize
        ? path.join(
            path.dirname(outPath),
            `${path.basename(outPath, path.extname(outPath))}-pre-dir.wav`,
          )
        : outPath;
      await synthesizeWithExpressive({
        text,
        outputPath: prePath,
        voiceId: voice?.id || voice?.nativeId,
        rate,
        exaggeration,
      });
      if (expression?.humanize) {
        const { expressionAudioFilter } = await import(
          './expression/direction-runtime'
        );
        const af = expressionAudioFilter({
          humanize: true,
          affect: expression.affect || 'neutral',
        });
        if (af) {
          try {
            await this.ffmpeg.applyAudioFilter(prePath, outPath, af);
            await fs.unlink(prePath).catch(() => undefined);
            this.logger.debug(
              `Directed AF applied affect=${expression.affect} exaggeration=${exaggeration}`,
            );
          } catch (e) {
            this.logger.warn(
              `Directed AF failed, using raw synth: ${(e as Error).message}`,
            );
            await fs.copyFile(prePath, outPath).catch(() => undefined);
            await fs.unlink(prePath).catch(() => undefined);
          }
        } else if (prePath !== outPath) {
          await fs.copyFile(prePath, outPath);
          await fs.unlink(prePath).catch(() => undefined);
        }
      }
      return;
    }
    if (engine === 'kokoro') {
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
      let lengthScale: number | undefined;
      if (rate != null && Number.isFinite(rate)) {
        lengthScale = Math.max(0.5, Math.min(2, 175 / rate));
      }
      await synthesizeWithPiper({
        text,
        modelPath,
        outputPath: outPath,
        lengthScale,
        sentenceSilenceSec:
          pauseProfile?.piperSentenceSilenceSec ?? undefined,
      });
      return;
    }

    const platformOut =
      outPath.replace(/\.wav$/i, '') +
      (process.platform === 'darwin' ? '.aiff' : '.wav');
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

  /**
   * Synthesize sub-utterances and insert profile micro-gaps between them.
   * One concat pass; never splits mid-word (planner splits on punctuation).
   */
  private async synthesizeWithMicroPauses(
    segments: { text: string; gapAfterMs: number }[],
    outPath: string,
    engine: 'piper' | 'platform' | 'kokoro' | 'expressive',
    voice: UnifiedVoice | undefined,
    rate: number | undefined,
    pauseProfile: PauseProfile,
    expression?: NonNullable<TtsJobMetadata['expression']>,
  ): Promise<void> {
    const workDir = path.dirname(outPath);
    const parts: string[] = [];
    const uid = `mp${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg.text.trim()) continue;
      const segPath = path.join(workDir, `${uid}-seg-${i}.wav`);
      // Only apply full sentence_silence on the last segment of the chunk
      const prof =
        i === segments.length - 1
          ? pauseProfile
          : {
              ...pauseProfile,
              piperSentenceSilenceSec: Math.min(
                0.08,
                pauseProfile.piperSentenceSilenceSec,
              ),
            };
      await this.synthesizeOneRaw(
        seg.text,
        segPath,
        engine,
        voice,
        rate,
        prof,
        expression,
      );
      parts.push(segPath);
      if (seg.gapAfterMs >= 15) {
        const gapPath = path.join(workDir, `${uid}-gap-${i}.wav`);
        await this.ffmpeg.insertSilence(seg.gapAfterMs / 1000, 22050, gapPath);
        parts.push(gapPath);
      }
    }
    if (!parts.length) {
      throw new Error('micro-pause synthesis produced no parts');
    }
    if (parts.length === 1) {
      await fs.copyFile(parts[0], outPath);
      return;
    }
    await this.ffmpeg.concatAudioFiles(parts, outPath, { format: 'wav' });
  }

  /**
   * Resolve per-chunk expression controls.
   * When multiControl + chunkSegmentMap, each chunk inherits its REM segment's
   * exaggeration/affect; otherwise the document-level expression is used.
   */
  private expressionForChunk(
    expression: NonNullable<TtsJobMetadata['expression']> | undefined,
    chunkIndex: number,
    _chunkCount: number,
  ): NonNullable<TtsJobMetadata['expression']> | undefined {
    if (!expression) return undefined;
    const map = expression.chunkSegmentMap;
    const segs = expression.segments;
    if (map && segs?.length) {
      const si = map[chunkIndex];
      const seg =
        si != null && segs[si]
          ? segs[si]
          : segs[Math.min(chunkIndex, segs.length - 1)];
      if (seg) {
        return {
          ...expression,
          exaggeration: seg.exaggeration,
          emotion: seg.emotion,
          style: seg.style,
          affect: seg.affect,
        };
      }
    }
    if (expression.multiControl && segs?.length) {
      const seg = segs[Math.min(chunkIndex, segs.length - 1)];
      if (seg) {
        return {
          ...expression,
          exaggeration: seg.exaggeration,
          emotion: seg.emotion,
          style: seg.style,
          affect: seg.affect,
        };
      }
    }
    return expression;
  }

  private resolveVoice(
    voiceId: string | undefined,
    engine: 'piper' | 'platform' | 'kokoro' | 'expressive',
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
      epubPath: paths.epubPath,
    };
    await this.jobsRepo.save(job);
    return {
      outDir,
      ...paths,
      epubPath: paths.epubPath,
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

/** G28 TODO-06: ad-hoc ffmpeg spawn with timeout + single-settle. */
function runFf(
  bin: string,
  args: string[],
  timeoutMs = 120_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      finish(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => finish(err));
    child.on('close', (code) => {
      if (code === 0) finish();
      else
        finish(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}

/**
 * Inject macOS `say` [[slnc N]] embedded pauses at comma/dash/ellipsis.
 * N is milliseconds. Best-effort platform parity with piper sentence_silence.
 */
export function injectMacSlncPauses(
  text: string,
  profile: PauseProfile,
): string {
  const comma = profile.bands.comma.insertMs;
  const dash = profile.bands.emDash.insertMs;
  const ellipsis = profile.bands.ellipsis.insertMs;
  const semi = profile.bands.semicolon.insertMs;
  return text
    .replace(/,/g, `,[[slnc ${comma}]]`)
    .replace(/;/g, `;[[slnc ${semi}]]`)
    .replace(/—|–/g, `—[[slnc ${dash}]]`)
    .replace(/…/g, `…[[slnc ${ellipsis}]]`);
}
