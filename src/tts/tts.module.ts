import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PronunciationEntry } from '../entities/pronunciation.entity';
import { TtsBatch } from '../entities/tts-batch.entity';
import { TtsJob } from '../entities/tts-job.entity';
import { Bookmark } from '../entities/bookmark.entity';
import { FfmpegModule } from '../ffmpeg/ffmpeg.module';
import { GatewayModule } from '../gateway/gateway.module';
import { SttModule } from '../stt/stt.module';
import { PronunciationService } from './pronunciation.service';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';
import { SynthesisQaService } from './qa/synthesis-qa.service';
import { LibraryService } from './library/library.service';
import { LibraryController } from './library/library.controller';

@Module({
  imports: [
    FfmpegModule,
    GatewayModule,
    SttModule,
    TypeOrmModule.forFeature([TtsJob, TtsBatch, PronunciationEntry, Bookmark]),
  ],
  controllers: [TtsController, LibraryController],
  providers: [
    TtsService,
    PronunciationService,
    SynthesisQaService,
    LibraryService,
  ],
  exports: [TtsService, PronunciationService, SynthesisQaService, LibraryService],
})
export class TtsModule {}
