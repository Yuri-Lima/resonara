import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Repository } from 'typeorm';
import {
  QUEUE_NORMALIZE,
  QUEUE_TRANSCODE,
  QUEUE_TRIM,
  QUEUE_WAVEFORM,
  QUEUE_SILENCE,
  QUEUE_METADATA,
} from '../common/constants';
import { Track, TrackStatus } from '../entities/track.entity';
import {
  JobStatus,
  TranscodeJob,
} from '../entities/transcode-job.entity';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { JobsGateway } from '../gateway/jobs.gateway';
import { AudioJobPayload } from '../queue/queue.service';
import { StorageService } from '../storage/storage.service';

/**
 * Shared processing logic used by all queue workers.
 */
export abstract class BaseAudioProcessor extends WorkerHost {
  protected abstract readonly logger: Logger;

  constructor(
    protected readonly jobsRepo: Repository<TranscodeJob>,
    protected readonly tracksRepo: Repository<Track>,
    protected readonly ffmpeg: FfmpegService,
    protected readonly storage: StorageService,
    protected readonly gateway: JobsGateway,
  ) {
    super();
  }

  async process(job: Job<AudioJobPayload>): Promise<unknown> {
    const { jobId, trackId, params } = job.data;
    const entity = await this.jobsRepo.findOne({ where: { id: jobId } });
    if (!entity) {
      this.logger.warn(`Job entity ${jobId} missing`);
      return;
    }
    const track = await this.tracksRepo.findOne({ where: { id: trackId } });
    if (!track) throw new Error(`Track ${trackId} not found`);

    entity.status = JobStatus.ACTIVE;
    entity.progress = 0;
    await this.jobsRepo.save(entity);
    track.status = TrackStatus.PROCESSING;
    await this.tracksRepo.save(track);
    this.gateway.emitProgress(jobId, 0, entity.type);

    const tmp = this.ffmpeg.createTempDir(`job-${entity.type}-`);
    try {
      const input = path.join(tmp, 'source');
      await this.storage.getFile(
        this.storage.originalBucket,
        track.storageKey,
        input,
      );

      const result = await this.runOperation(
        entity,
        input,
        tmp,
        params,
        async (pct) => {
          entity.progress = Math.round(pct);
          await this.jobsRepo.save(entity);
          await job.updateProgress(pct);
          this.gateway.emitProgress(jobId, pct, entity.type);
        },
      );

      entity.status = JobStatus.COMPLETED;
      entity.progress = 100;
      entity.resultJson = result as Record<string, unknown>;
      entity.completedAt = new Date();
      if ((result as any).outputStorageKey) {
        entity.outputStorageKey = (result as any).outputStorageKey;
      }
      await this.jobsRepo.save(entity);
      track.status = TrackStatus.READY;
      await this.tracksRepo.save(track);
      this.gateway.emitCompleted(jobId, entity);
      return result;
    } catch (err: any) {
      entity.status = JobStatus.FAILED;
      entity.errorMessage = err?.message || String(err);
      await this.jobsRepo.save(entity);
      track.status = TrackStatus.ERROR;
      await this.tracksRepo.save(track);
      this.gateway.emitFailed(jobId, entity.errorMessage || 'unknown error');
      throw err;
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  protected abstract runOperation(
    entity: TranscodeJob,
    input: string,
    tmp: string,
    params: Record<string, unknown>,
    onProgress: (pct: number) => Promise<void>,
  ): Promise<Record<string, unknown>>;

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job?.id} failed: ${err.message}`);
  }
}

@Processor(QUEUE_TRANSCODE, {
  concurrency: parseInt(process.env.FFMPEG_CONCURRENCY || '2', 10),
})
export class TranscodeProcessor extends BaseAudioProcessor {
  protected readonly logger = new Logger(TranscodeProcessor.name);

  constructor(
    @InjectRepository(TranscodeJob) jobsRepo: Repository<TranscodeJob>,
    @InjectRepository(Track) tracksRepo: Repository<Track>,
    ffmpeg: FfmpegService,
    storage: StorageService,
    gateway: JobsGateway,
  ) {
    super(jobsRepo, tracksRepo, ffmpeg, storage, gateway);
  }

  protected async runOperation(
    entity: TranscodeJob,
    input: string,
    tmp: string,
    params: Record<string, unknown>,
    onProgress: (pct: number) => Promise<void>,
  ) {
    const format = String(params.format || 'mp3') as any;
    const ext = this.ffmpeg.extensionFor(format);
    const output = path.join(tmp, `out.${ext}`);
    const result = await this.ffmpeg.transcode(input, output, {
      format,
      bitrate: params.bitrate as number | undefined,
      quality: params.quality as number | undefined,
      vbr: params.vbr as boolean | undefined,
      sampleRate: params.sampleRate as number | undefined,
      bitDepth: params.bitDepth as 16 | 24 | 32 | undefined,
      channels: params.channels as number | undefined,
      onProgress: (p) => {
        void onProgress(p);
      },
    });
    const key = `${entity.trackId}/derivatives/${entity.id}.${ext}`;
    await this.storage.putFile(this.storage.derivativeBucket, key, output);
    return { ...result, outputStorageKey: key };
  }
}

@Processor(QUEUE_NORMALIZE, {
  concurrency: parseInt(process.env.FFMPEG_CONCURRENCY || '2', 10),
})
export class NormalizeProcessor extends BaseAudioProcessor {
  protected readonly logger = new Logger(NormalizeProcessor.name);

  constructor(
    @InjectRepository(TranscodeJob) jobsRepo: Repository<TranscodeJob>,
    @InjectRepository(Track) tracksRepo: Repository<Track>,
    ffmpeg: FfmpegService,
    storage: StorageService,
    gateway: JobsGateway,
  ) {
    super(jobsRepo, tracksRepo, ffmpeg, storage, gateway);
  }

  protected async runOperation(
    entity: TranscodeJob,
    input: string,
    tmp: string,
    params: Record<string, unknown>,
    onProgress: (pct: number) => Promise<void>,
  ) {
    const output = path.join(tmp, 'normalized.wav');
    const result = await this.ffmpeg.normalize(input, output, {
      targetLufs: Number(params.targetLufs ?? -14),
      truePeak: Number(params.truePeak ?? -1),
      lra: Number(params.lra ?? 11),
      sampleRate: params.sampleRate as number | undefined,
      onProgress: (p, pass) => {
        void onProgress(pass === 1 ? p * 0.5 : 50 + p * 0.5);
      },
    });
    const key = `${entity.trackId}/derivatives/${entity.id}.wav`;
    await this.storage.putFile(this.storage.derivativeBucket, key, output);
    return {
      measured: result.measured,
      targetLufs: result.targetLufs,
      truePeak: result.truePeak,
      lra: result.lra,
      outputI: result.outputI,
      withinTolerance: result.withinTolerance,
      outputStorageKey: key,
    };
  }
}

@Processor(QUEUE_TRIM, {
  concurrency: parseInt(process.env.FFMPEG_CONCURRENCY || '2', 10),
})
export class TrimProcessor extends BaseAudioProcessor {
  protected readonly logger = new Logger(TrimProcessor.name);

  constructor(
    @InjectRepository(TranscodeJob) jobsRepo: Repository<TranscodeJob>,
    @InjectRepository(Track) tracksRepo: Repository<Track>,
    ffmpeg: FfmpegService,
    storage: StorageService,
    gateway: JobsGateway,
  ) {
    super(jobsRepo, tracksRepo, ffmpeg, storage, gateway);
  }

  protected async runOperation(
    entity: TranscodeJob,
    input: string,
    tmp: string,
    params: Record<string, unknown>,
    onProgress: (pct: number) => Promise<void>,
  ) {
    const output = path.join(tmp, 'trimmed.wav');
    const result = await this.ffmpeg.trim(input, output, {
      start: Number(params.start || 0),
      end: params.end != null ? Number(params.end) : undefined,
      fadeIn: params.fadeIn as number | undefined,
      fadeOut: params.fadeOut as number | undefined,
      fadeCurve: params.fadeCurve as any,
      onProgress: (p) => {
        void onProgress(p);
      },
    });
    const key = `${entity.trackId}/derivatives/${entity.id}.wav`;
    await this.storage.putFile(this.storage.derivativeBucket, key, output);
    return { ...result, outputStorageKey: key };
  }
}

@Processor(QUEUE_WAVEFORM, {
  concurrency: parseInt(process.env.FFMPEG_CONCURRENCY || '4', 10),
})
export class WaveformProcessor extends BaseAudioProcessor {
  protected readonly logger = new Logger(WaveformProcessor.name);

  constructor(
    @InjectRepository(TranscodeJob) jobsRepo: Repository<TranscodeJob>,
    @InjectRepository(Track) tracksRepo: Repository<Track>,
    ffmpeg: FfmpegService,
    storage: StorageService,
    gateway: JobsGateway,
  ) {
    super(jobsRepo, tracksRepo, ffmpeg, storage, gateway);
  }

  protected async runOperation(
    entity: TranscodeJob,
    input: string,
    _tmp: string,
    params: Record<string, unknown>,
    onProgress: (pct: number) => Promise<void>,
  ) {
    await onProgress(10);
    const result = await this.ffmpeg.extractWaveform(input, {
      resolution: Number(params.resolution || 1800),
      channels: (params.channels as any) || 'stereo',
    });
    await onProgress(90);
    const key = `${entity.trackId}/artifacts/waveform-job-${entity.id}.json`;
    await this.storage.putJson(this.storage.artifactBucket, key, result);
    return { ...result, outputStorageKey: key } as any;
  }
}

// Register silence/metadata as light processors for completeness
@Processor(QUEUE_SILENCE, { concurrency: 4 })
export class SilenceProcessor extends BaseAudioProcessor {
  protected readonly logger = new Logger(SilenceProcessor.name);
  constructor(
    @InjectRepository(TranscodeJob) jobsRepo: Repository<TranscodeJob>,
    @InjectRepository(Track) tracksRepo: Repository<Track>,
    ffmpeg: FfmpegService,
    storage: StorageService,
    gateway: JobsGateway,
  ) {
    super(jobsRepo, tracksRepo, ffmpeg, storage, gateway);
  }
  protected async runOperation(
    _e: TranscodeJob,
    input: string,
    _t: string,
    params: Record<string, unknown>,
    onProgress: (pct: number) => Promise<void>,
  ) {
    await onProgress(20);
    const segments = await this.ffmpeg.detectSilence(input, {
      thresholdDb: Number(params.thresholdDb ?? -50),
      minDuration: Number(params.minDuration ?? 0.5),
    });
    await onProgress(100);
    return { segments };
  }
}

@Processor(QUEUE_METADATA, { concurrency: 4 })
export class MetadataProcessor extends BaseAudioProcessor {
  protected readonly logger = new Logger(MetadataProcessor.name);
  constructor(
    @InjectRepository(TranscodeJob) jobsRepo: Repository<TranscodeJob>,
    @InjectRepository(Track) tracksRepo: Repository<Track>,
    ffmpeg: FfmpegService,
    storage: StorageService,
    gateway: JobsGateway,
  ) {
    super(jobsRepo, tracksRepo, ffmpeg, storage, gateway);
  }
  protected async runOperation(
    _e: TranscodeJob,
    input: string,
    _t: string,
    _p: Record<string, unknown>,
    onProgress: (pct: number) => Promise<void>,
  ) {
    await onProgress(50);
    const probe = await this.ffmpeg.probe(input);
    await onProgress(100);
    return {
      format: probe.format,
      duration: probe.duration,
      tags: probe.tags,
      codec: probe.codec,
    };
  }
}
