import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ALL_QUEUES,
  QUEUE_METADATA,
  QUEUE_NORMALIZE,
  QUEUE_SILENCE,
  QUEUE_TRANSCODE,
  QUEUE_TRIM,
  QUEUE_WAVEFORM,
} from '../common/constants';
import { Track } from '../entities/track.entity';
import { TranscodeJob } from '../entities/transcode-job.entity';
import { FfmpegModule } from '../ffmpeg/ffmpeg.module';
import { GatewayModule } from '../gateway/gateway.module';
import { JobRunnerService } from '../jobs/job-runner.service';
import { LITE_MODE, QueueService } from './queue.service';

const isLite =
  process.env.RESONARA_LITE === '1' || process.env.RESONARA_DESKTOP === '1';

const bullImports = isLite
  ? []
  : [
      BullModule.forRootAsync({
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          connection: {
            host: config.get('redis.host'),
            port: config.get('redis.port'),
          },
        }),
      }),
      BullModule.registerQueue(
        { name: QUEUE_TRANSCODE },
        { name: QUEUE_NORMALIZE },
        { name: QUEUE_WAVEFORM },
        { name: QUEUE_METADATA },
        { name: QUEUE_SILENCE },
        { name: QUEUE_TRIM },
      ),
    ];

@Module({
  imports: [
    ...bullImports,
    TypeOrmModule.forFeature([TranscodeJob, Track]),
    FfmpegModule,
    GatewayModule,
  ],
  providers: [
    QueueService,
    JobRunnerService,
    { provide: LITE_MODE, useValue: isLite },
  ],
  exports: [QueueService, JobRunnerService, ...(isLite ? [] : [BullModule])],
})
export class QueueModule {}

export { ALL_QUEUES };
