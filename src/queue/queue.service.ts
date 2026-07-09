import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_METADATA,
  QUEUE_NORMALIZE,
  QUEUE_SILENCE,
  QUEUE_TRANSCODE,
  QUEUE_TRIM,
  QUEUE_WAVEFORM,
} from '../common/constants';
import { JobType } from '../entities/transcode-job.entity';
import { JobRunnerService } from '../jobs/job-runner.service';

export interface AudioJobPayload {
  jobId: string;
  trackId: string;
  params: Record<string, unknown>;
}

export const LITE_MODE = 'RESONARA_LITE_MODE';

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);
  private readonly lite: boolean;
  private queues = new Map<JobType, Queue>();

  constructor(
    private readonly runner: JobRunnerService,
    private readonly moduleRef: ModuleRef,
    @Inject(LITE_MODE) liteFlag: boolean,
  ) {
    this.lite =
      liteFlag === true ||
      process.env.RESONARA_LITE === '1' ||
      process.env.RESONARA_DESKTOP === '1';
  }

  onModuleInit() {
    if (this.lite) return;
    const pairs: Array<[JobType, string]> = [
      [JobType.TRANSCODE, QUEUE_TRANSCODE],
      [JobType.NORMALIZE, QUEUE_NORMALIZE],
      [JobType.WAVEFORM, QUEUE_WAVEFORM],
      [JobType.METADATA, QUEUE_METADATA],
      [JobType.SILENCE, QUEUE_SILENCE],
      [JobType.TRIM, QUEUE_TRIM],
    ];
    for (const [type, name] of pairs) {
      try {
        const q = this.moduleRef.get<Queue>(getQueueToken(name), {
          strict: false,
        });
        if (q) this.queues.set(type, q);
      } catch {
        this.logger.warn(`Queue ${name} not available`);
      }
    }
  }

  async enqueue(type: JobType, payload: AudioJobPayload): Promise<string> {
    if (this.lite) {
      this.logger.debug(`Lite enqueue ${type} job=${payload.jobId}`);
      setImmediate(() => {
        void this.runner
          .run(payload.jobId, payload.trackId, payload.params)
          .catch((err) =>
            this.logger.error(
              `Lite job ${payload.jobId} failed: ${err?.message || err}`,
            ),
          );
      });
      return payload.jobId;
    }

    const q = this.queues.get(type);
    if (!q) throw new Error(`Queue not available for ${type}`);
    const job = await q.add(type, payload, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    return String(job.id);
  }
}
