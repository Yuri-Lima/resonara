import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PronunciationEntry } from '../entities/pronunciation.entity';
import { TtsBatch } from '../entities/tts-batch.entity';
import { TtsJob } from '../entities/tts-job.entity';
import { FfmpegModule } from '../ffmpeg/ffmpeg.module';
import { GatewayModule } from '../gateway/gateway.module';
import { SttModule } from '../stt/stt.module';
import { PronunciationService } from './pronunciation.service';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';
import { SynthesisQaService } from './qa/synthesis-qa.service';

@Module({
  imports: [
    FfmpegModule,
    GatewayModule,
    SttModule,
    TypeOrmModule.forFeature([TtsJob, TtsBatch, PronunciationEntry]),
  ],
  controllers: [TtsController],
  providers: [TtsService, PronunciationService, SynthesisQaService],
  exports: [TtsService, PronunciationService, SynthesisQaService],
})
export class TtsModule {}
