import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PronunciationEntry } from '../entities/pronunciation.entity';
import { TtsJob } from '../entities/tts-job.entity';
import { FfmpegModule } from '../ffmpeg/ffmpeg.module';
import { GatewayModule } from '../gateway/gateway.module';
import { PronunciationService } from './pronunciation.service';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';

@Module({
  imports: [
    FfmpegModule,
    GatewayModule,
    TypeOrmModule.forFeature([TtsJob, PronunciationEntry]),
  ],
  controllers: [TtsController],
  providers: [TtsService, PronunciationService],
  exports: [TtsService, PronunciationService],
})
export class TtsModule {}
