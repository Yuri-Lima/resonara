import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'fs';
import { Response } from 'express';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { TtsJobStatus } from '../entities/tts-job.entity';
import { extractText, detectFormat } from './document-extractor';
import { PronunciationService } from './pronunciation.service';
import { supportedSsmlElements } from './ssml-parser';
import { TtsService } from './tts.service';

class SynthesizeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  text?: string;

  @IsOptional()
  @IsString()
  voice?: string;

  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsOptional()
  @IsIn(['wav', 'mp3', 'm4b'])
  format?: 'wav' | 'mp3' | 'm4b';

  @IsOptional()
  @IsIn(['auto', 'piper', 'platform'])
  engine?: 'auto' | 'piper' | 'platform';

  @IsOptional()
  @IsBoolean()
  ssml?: boolean;

  @IsOptional()
  @IsBoolean()
  normalize?: boolean;

  @IsOptional()
  @IsBoolean()
  highpass?: boolean;

  @IsOptional()
  @IsBoolean()
  compress?: boolean;

  @IsOptional()
  @IsString()
  title?: string;
}

class PronunciationBody {
  @IsString()
  @MinLength(1)
  word!: string;

  @IsOptional()
  @IsString()
  phoneme?: string;

  @IsOptional()
  @IsString()
  alias?: string;

  @IsOptional()
  @IsIn(['all', 'piper', 'platform'])
  engine?: 'all' | 'piper' | 'platform';

  @IsOptional()
  @IsString()
  language?: string;
}

@ApiTags('tts')
@Controller('tts')
export class TtsController {
  constructor(
    private readonly tts: TtsService,
    private readonly pronunciation: PronunciationService,
  ) {}

  @Get('voices')
  voices(
    @Query('engine') engine?: 'piper' | 'platform',
    @Query('language') language?: string,
  ) {
    return {
      voices: this.tts.voices({ engine, language }),
      engines: this.tts.engineStatus().engines,
    };
  }

  @Get('engines')
  engines() {
    return this.tts.engineStatus();
  }

  @Get('engine')
  engine() {
    return this.tts.engineStatus();
  }

  @Get('ssml')
  ssmlReference() {
    return { elements: supportedSsmlElements() };
  }

  @Post('synthesize')
  @ApiBody({ type: SynthesizeDto })
  async synthesize(@Body() body: SynthesizeDto) {
    if (!body.text?.trim()) {
      throw new BadRequestException('text is required');
    }
    const job = await this.tts.startLongForm({
      text: body.text,
      voice: body.voice,
      rate: body.rate,
      format: body.format,
      engine: body.engine,
      ssml: body.ssml,
      normalize: body.normalize,
      highpass: body.highpass,
      compress: body.compress,
      title: body.title,
    });
    return this.tts.toPublicJob(job);
  }

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async importDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: SynthesizeDto,
  ) {
    if (!file?.buffer && !file?.path) {
      throw new BadRequestException('file is required');
    }
    const tmp = path.join(
      os.tmpdir(),
      `resonara-import-${Date.now()}${path.extname(file.originalname || '.txt')}`,
    );
    if (file.buffer) {
      await fs.writeFile(tmp, file.buffer);
    } else {
      await fs.copyFile(file.path, tmp);
    }
    try {
      const fmt = detectFormat(file.originalname || tmp, file.mimetype);
      const doc = await extractText(tmp, fmt);
      const job = await this.tts.startFromDocument(doc, {
        voice: body.voice,
        rate: body.rate,
        format: body.format,
        engine: body.engine,
        ssml: body.ssml,
        normalize: body.normalize,
        highpass: body.highpass,
        compress: body.compress,
        title: body.title || doc.title,
      });
      return { document: { title: doc.title, chapters: doc.chapters.length, totalWords: doc.totalWords, format: doc.format }, job: this.tts.toPublicJob(job) };
    } finally {
      await fs.unlink(tmp).catch(() => undefined);
    }
  }

  @Get('jobs')
  async jobs(
    @Query('status') status?: TtsJobStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.tts.listJobs({
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    return {
      ...result,
      items: result.items.map((j) => this.tts.toPublicJob(j)),
    };
  }

  @Get('jobs/:id')
  async job(@Param('id') id: string) {
    return this.tts.toPublicJob(await this.tts.getJob(id));
  }

  @Delete('jobs/:id')
  async deleteJob(@Param('id') id: string) {
    await this.tts.deleteJob(id);
    return { ok: true };
  }

  @Get('jobs/:id/chapters')
  async chapters(@Param('id') id: string) {
    return { chapters: await this.tts.getChapters(id) };
  }

  @Get('jobs/:id/chapters/:n/download')
  async downloadChapter(
    @Param('id') id: string,
    @Param('n') n: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const filePath = await this.tts.resolveChapterDownload(id, parseInt(n, 10));
    const ext = filePath.endsWith('.mp3') ? 'mp3' : 'wav';
    res.set({
      'Content-Type': ext === 'mp3' ? 'audio/mpeg' : 'audio/wav',
      'Content-Disposition': `attachment; filename="chapter-${n}.${ext}"`,
    });
    return new StreamableFile(createReadStream(filePath));
  }

  @Get('jobs/:id/download')
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const filePath = await this.tts.resolveDownload(id);
    let ext = 'wav';
    if (filePath.endsWith('.mp3')) ext = 'mp3';
    else if (filePath.endsWith('.m4b')) ext = 'm4b';
    const mime =
      ext === 'mp3'
        ? 'audio/mpeg'
        : ext === 'm4b'
          ? 'audio/mp4'
          : 'audio/wav';
    res.set({
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="resonara-speech.${ext}"`,
    });
    return new StreamableFile(createReadStream(filePath));
  }

  // --- Pronunciation dictionary ---

  @Get('dictionary')
  dictionary() {
    return this.pronunciation.list();
  }

  @Post('dictionary')
  addWord(@Body() body: PronunciationBody) {
    return this.pronunciation.create(body);
  }

  @Put('dictionary/:id')
  updateWord(@Param('id') id: string, @Body() body: Partial<PronunciationBody>) {
    return this.pronunciation.update(id, body);
  }

  @Delete('dictionary/:id')
  async removeWord(@Param('id') id: string) {
    await this.pronunciation.remove(id);
    return { ok: true };
  }

  @Post('dictionary/import')
  importDict(@Body() body: { entries: PronunciationBody[] }) {
    return this.pronunciation.importJson(body.entries || []);
  }

  @Get('dictionary/export')
  exportDict() {
    return this.pronunciation.exportJson();
  }

  @Post('preview')
  async preview(@Body() body: SynthesizeDto) {
    const sample =
      body.text?.trim() ||
      'Hello from Resonara. This is a short voice preview.';
    // short sync-ish job
    const job = await this.tts.startLongForm({
      text: sample.slice(0, 200),
      voice: body.voice,
      engine: body.engine,
      format: 'wav',
      normalize: true,
      highpass: true,
    });
    return this.tts.toPublicJob(job);
  }
}
