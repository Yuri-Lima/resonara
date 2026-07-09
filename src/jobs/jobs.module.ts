import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Track } from '../entities/track.entity';
import { TranscodeJob } from '../entities/transcode-job.entity';
import { QueueModule } from '../queue/queue.module';
import {
  MetadataProcessor,
  NormalizeProcessor,
  SilenceProcessor,
  TranscodeProcessor,
  TrimProcessor,
  WaveformProcessor,
} from './audio.processor';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

const isLite =
  process.env.RESONARA_LITE === '1' || process.env.RESONARA_DESKTOP === '1';

const processors = isLite
  ? []
  : [
      TranscodeProcessor,
      NormalizeProcessor,
      TrimProcessor,
      WaveformProcessor,
      SilenceProcessor,
      MetadataProcessor,
    ];

@Module({
  imports: [
    TypeOrmModule.forFeature([TranscodeJob, Track]),
    QueueModule,
  ],
  controllers: [JobsController],
  providers: [JobsService, ...processors],
  exports: [JobsService],
})
export class JobsModule {}
