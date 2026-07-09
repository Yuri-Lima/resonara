import { Module } from '@nestjs/common';
import { FfmpegModule } from '../ffmpeg/ffmpeg.module';
import { GatewayModule } from '../gateway/gateway.module';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';

@Module({
  imports: [FfmpegModule, GatewayModule],
  controllers: [TtsController],
  providers: [TtsService],
  exports: [TtsService],
})
export class TtsModule {}
