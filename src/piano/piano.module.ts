import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PianoTake } from '../entities/piano-take.entity';
import { SamplePack } from '../entities/sample-pack.entity';
import { Track } from '../entities/track.entity';
import { TranscodeJob } from '../entities/transcode-job.entity';
import { QueueModule } from '../queue/queue.module';
import { PianoController } from './piano.controller';
import { PianoService } from './piano.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SamplePack, PianoTake, Track, TranscodeJob]),
    QueueModule,
  ],
  controllers: [PianoController],
  providers: [PianoService],
  exports: [PianoService],
})
export class PianoModule {}
