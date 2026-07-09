import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Repository } from 'typeorm';
import { Track, TrackStatus } from '../entities/track.entity';
import {
  JobStatus,
  JobType,
  TranscodeJob,
} from '../entities/transcode-job.entity';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { JobsGateway } from '../gateway/jobs.gateway';
import { StorageService } from '../storage/storage.service';

/**
 * Shared audio job execution used by BullMQ workers and Resonara lite inline queue.
 */
@Injectable()
export class JobRunnerService {
  private readonly logger = new Logger(JobRunnerService.name);

  constructor(
    @InjectRepository(TranscodeJob)
    private readonly jobsRepo: Repository<TranscodeJob>,
    @InjectRepository(Track)
    private readonly tracksRepo: Repository<Track>,
    private readonly ffmpeg: FfmpegService,
    private readonly storage: StorageService,
    private readonly gateway: JobsGateway,
  ) {}

  async run(
    jobId: string,
    trackId: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
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

      const result = await this.runOperation(entity, input, tmp, params, async (pct) => {
        entity.progress = Math.round(pct);
        await this.jobsRepo.save(entity);
        this.gateway.emitProgress(jobId, pct, entity.type);
      });

      entity.status = JobStatus.COMPLETED;
      entity.progress = 100;
      entity.resultJson = result as Record<string, unknown>;
      entity.completedAt = new Date();
      const outKey = result['outputStorageKey'];
      if (typeof outKey === 'string') {
        entity.outputStorageKey = outKey;
      }
      await this.jobsRepo.save(entity);
      track.status = TrackStatus.READY;
      await this.tracksRepo.save(track);
      this.gateway.emitCompleted(jobId, entity);
      return result;
    } catch (err: unknown) {
      entity.status = JobStatus.FAILED;
      entity.errorMessage = err instanceof Error ? err.message : String(err);
      await this.jobsRepo.save(entity);
      track.status = TrackStatus.ERROR;
      await this.tracksRepo.save(track);
      this.gateway.emitFailed(jobId, entity.errorMessage || 'unknown error');
      throw err;
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async runOperation(
    entity: TranscodeJob,
    input: string,
    tmp: string,
    params: Record<string, unknown>,
    onProgress: (pct: number) => Promise<void>,
  ): Promise<Record<string, unknown>> {
    switch (entity.type) {
      case JobType.TRANSCODE: {
        const format = String(params.format || 'mp3') as 'mp3' | 'aac' | 'flac' | 'ogg' | 'opus' | 'wav';
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
      case JobType.NORMALIZE: {
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
      case JobType.TRIM: {
        const output = path.join(tmp, 'trimmed.wav');
        const result = await this.ffmpeg.trim(input, output, {
          start: Number(params.start || 0),
          end: params.end != null ? Number(params.end) : undefined,
          fadeIn: params.fadeIn as number | undefined,
          fadeOut: params.fadeOut as number | undefined,
          fadeCurve: params.fadeCurve as 'linear' | 'exponential' | 'logarithmic' | 'quarter-sine' | undefined,
          onProgress: (p) => {
            void onProgress(p);
          },
        });
        const key = `${entity.trackId}/derivatives/${entity.id}.wav`;
        await this.storage.putFile(this.storage.derivativeBucket, key, output);
        return { ...result, outputStorageKey: key };
      }
      case JobType.WAVEFORM: {
        await onProgress(10);
        const result = await this.ffmpeg.extractWaveform(input, {
          resolution: Number(params.resolution || 1800),
          channels: (params.channels as 'mono' | 'stereo' | undefined) || 'stereo',
        });
        await onProgress(90);
        const key = `${entity.trackId}/artifacts/waveform-job-${entity.id}.json`;
        await this.storage.putJson(this.storage.artifactBucket, key, result);
        return { ...result, outputStorageKey: key };
      }
      case JobType.SILENCE: {
        await onProgress(20);
        const segments = await this.ffmpeg.detectSilence(input, {
          thresholdDb: Number(params.thresholdDb ?? -50),
          minDuration: Number(params.minDuration ?? 0.5),
        });
        await onProgress(100);
        return { segments };
      }
      case JobType.METADATA: {
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
      default:
        throw new Error(`Unknown job type ${entity.type}`);
    }
  }
}
