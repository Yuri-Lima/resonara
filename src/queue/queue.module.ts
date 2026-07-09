import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  ALL_QUEUES,
  QUEUE_METADATA,
  QUEUE_NORMALIZE,
  QUEUE_SILENCE,
  QUEUE_TRANSCODE,
  QUEUE_TRIM,
  QUEUE_WAVEFORM,
} from '../common/constants';
import { QueueService } from './queue.service';

@Module({
  imports: [
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
  ],
  providers: [QueueService],
  exports: [QueueService, BullModule],
})
export class QueueModule {}

export { ALL_QUEUES };
