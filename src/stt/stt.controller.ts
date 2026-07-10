import {
  BadRequestException,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { WhisperService } from './whisper.service';

@ApiTags('stt')
@Controller('stt')
export class SttController {
  constructor(private readonly whisper: WhisperService) {}

  @Get('health')
  health() {
    return this.whisper.getVersion();
  }

  @Post('transcribe')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async transcribe(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer && !file?.path) {
      throw new BadRequestException('file is required');
    }
    if (!this.whisper.isAvailable()) {
      throw new BadRequestException(this.whisper.getVersion().detail);
    }
    const tmp = path.join(
      os.tmpdir(),
      `resonara-stt-${Date.now()}${path.extname(file.originalname || '.wav') || '.wav'}`,
    );
    try {
      if (file.buffer) {
        await fs.writeFile(tmp, file.buffer);
      } else {
        await fs.copyFile(file.path, tmp);
      }
      return await this.whisper.transcribe(tmp, { model: 'tiny', language: 'en' });
    } finally {
      await fs.unlink(tmp).catch(() => undefined);
    }
  }
}
