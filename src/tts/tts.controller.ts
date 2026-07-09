import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'fs';
import { Response } from 'express';
import { IsIn, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { TtsService } from './tts.service';

class SynthesizeDto {
  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsString()
  voice?: string;

  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsOptional()
  @IsIn(['wav', 'mp3'])
  format?: 'wav' | 'mp3';
}

@ApiTags('tts')
@Controller('tts')
export class TtsController {
  constructor(private readonly tts: TtsService) {}

  @Get('voices')
  voices() {
    return { voices: this.tts.voices(), engine: this.tts.engineStatus() };
  }

  @Get('engine')
  engine() {
    return this.tts.engineStatus();
  }

  @Post('synthesize')
  synthesize(@Body() body: SynthesizeDto) {
    return this.tts.startLongForm(body);
  }

  @Get('jobs/:id')
  job(@Param('id') id: string) {
    return this.tts.getJob(id);
  }

  @Get('jobs/:id/download')
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const filePath = await this.tts.resolveDownload(id);
    const ext = filePath.endsWith('.mp3') ? 'mp3' : 'wav';
    res.set({
      'Content-Type': ext === 'mp3' ? 'audio/mpeg' : 'audio/wav',
      'Content-Disposition': `attachment; filename="resonara-speech.${ext}"`,
    });
    return new StreamableFile(createReadStream(filePath));
  }
}
