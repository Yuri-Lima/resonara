import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  QUEUE_NORMALIZE,
  QUEUE_TRANSCODE,
  QUEUE_TRIM,
  QUEUE_WAVEFORM,
  QUEUE_SILENCE,
  QUEUE_METADATA,
} from '../common/constants';
import { AudioJobPayload } from '../queue/queue.service';
import { JobRunnerService } from './job-runner.service';

/**
 * BullMQ workers — thin wrappers over JobRunnerService (full stack mode only).
 * In RESONARA_LITE these processors are not registered.
 */
abstract class RunnerProcessor extends WorkerHost {
  protected abstract readonly logger: Logger;

  constructor(protected readonly runner: JobRunnerService) {
    super();
  }

  async process(job: Job<AudioJobPayload>): Promise<unknown> {
    const { jobId, trackId, params } = job.data;
    return this.runner.run(jobId, trackId, params);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job?.id} failed: ${err.message}`);
  }
}

@Processor(QUEUE_TRANSCODE, {
  concurrency: parseInt(process.env.FFMPEG_CONCURRENCY || '2', 10),
})
export class TranscodeProcessor extends RunnerProcessor {
  protected readonly logger = new Logger(TranscodeProcessor.name);
  constructor(runner: JobRunnerService) {
    super(runner);
  }
}

@Processor(QUEUE_NORMALIZE, {
  concurrency: parseInt(process.env.FFMPEG_CONCURRENCY || '2', 10),
})
export class NormalizeProcessor extends RunnerProcessor {
  protected readonly logger = new Logger(NormalizeProcessor.name);
  constructor(runner: JobRunnerService) {
    super(runner);
  }
}

@Processor(QUEUE_TRIM, {
  concurrency: parseInt(process.env.FFMPEG_CONCURRENCY || '2', 10),
})
export class TrimProcessor extends RunnerProcessor {
  protected readonly logger = new Logger(TrimProcessor.name);
  constructor(runner: JobRunnerService) {
    super(runner);
  }
}

@Processor(QUEUE_WAVEFORM, {
  concurrency: parseInt(process.env.FFMPEG_CONCURRENCY || '4', 10),
})
export class WaveformProcessor extends RunnerProcessor {
  protected readonly logger = new Logger(WaveformProcessor.name);
  constructor(runner: JobRunnerService) {
    super(runner);
  }
}

@Processor(QUEUE_SILENCE, { concurrency: 4 })
export class SilenceProcessor extends RunnerProcessor {
  protected readonly logger = new Logger(SilenceProcessor.name);
  constructor(runner: JobRunnerService) {
    super(runner);
  }
}

@Processor(QUEUE_METADATA, { concurrency: 4 })
export class MetadataProcessor extends RunnerProcessor {
  protected readonly logger = new Logger(MetadataProcessor.name);
  constructor(runner: JobRunnerService) {
    super(runner);
  }
}
