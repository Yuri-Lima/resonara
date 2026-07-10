import { Module } from '@nestjs/common';
import { SttController } from './stt.controller';
import { WhisperService } from './whisper.service';

@Module({
  controllers: [SttController],
  providers: [WhisperService],
  exports: [WhisperService],
})
export class SttModule {}
