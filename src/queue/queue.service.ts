import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
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

export interface AudioJobPayload {
  jobId: string;
  trackId: string;
  params: Record<string, unknown>;
}

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue(QUEUE_TRANSCODE) private readonly transcodeQ: Queue,
    @InjectQueue(QUEUE_NORMALIZE) private readonly normalizeQ: Queue,
    @InjectQueue(QUEUE_WAVEFORM) private readonly waveformQ: Queue,
    @InjectQueue(QUEUE_METADATA) private readonly metadataQ: Queue,
    @InjectQueue(QUEUE_SILENCE) private readonly silenceQ: Queue,
    @InjectQueue(QUEUE_TRIM) private readonly trimQ: Queue,
  ) {}

  private queueFor(type: JobType): Queue {
    switch (type) {
      case JobType.TRANSCODE:
        return this.transcodeQ;
      case JobType.NORMALIZE:
        return this.normalizeQ;
      case JobType.WAVEFORM:
        return this.waveformQ;
      case JobType.METADATA:
        return this.metadataQ;
      case JobType.SILENCE:
        return this.silenceQ;
      case JobType.TRIM:
        return this.trimQ;
      default:
        return this.transcodeQ;
    }
  }

  async enqueue(type: JobType, payload: AudioJobPayload): Promise<string> {
    const q = this.queueFor(type);
    const job = await q.add(type, payload, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    return String(job.id);
  }
}
