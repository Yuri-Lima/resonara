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

@Module({
  imports: [
    TypeOrmModule.forFeature([TranscodeJob, Track]),
    QueueModule,
  ],
  controllers: [JobsController],
  providers: [
    JobsService,
    TranscodeProcessor,
    NormalizeProcessor,
    TrimProcessor,
    WaveformProcessor,
    SilenceProcessor,
    MetadataProcessor,
  ],
  exports: [JobsService],
})
export class JobsModule {}
