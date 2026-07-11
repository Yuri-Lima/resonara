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
  Max,
  MaxLength,
  Min,
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
import {
  detectLanguage as detectLang,
  detectParagraphLanguages,
} from './language';

class SynthesizeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  // G28 TODO-11: cap body size to protect synthesis pipeline
  @MaxLength(500_000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  voice?: string;

  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(400)
  rate?: number;

  @IsOptional()
  @IsIn(['wav', 'mp3', 'm4b'])
  format?: 'wav' | 'mp3' | 'm4b';

  @IsOptional()
  @IsIn(['auto', 'piper', 'platform', 'kokoro'])
  engine?: 'auto' | 'piper' | 'platform' | 'kokoro';

  @IsOptional()
  @IsIn(['off', 'sample', 'full'])
  qa?: 'off' | 'sample' | 'full';

  /** 'en' | 'pt-BR' | 'auto' (detect language). */
  @IsOptional()
  @IsString()
  language?: string;

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

  @IsOptional()
  @IsBoolean()
  dialogue?: boolean;

  @IsOptional()
  speakers?: Record<string, string>;

  @IsOptional()
  @IsIn(['podcast', 'audiobook', 'raw', 'custom'])
  postProcessing?: 'podcast' | 'audiobook' | 'raw' | 'custom';

  /**
   * Pause profile for boundary-aware gaps.
   * audiobook (default) | podcast (~20% tighter) | news (~35% tighter) | custom
   */
  @IsOptional()
  @IsIn(['audiobook', 'podcast', 'news', 'custom'])
  pauseProfile?: 'audiobook' | 'podcast' | 'news' | 'custom';

  /** Per-boundary insertMs overrides (used with custom or to tweak a preset). */
  @IsOptional()
  pauseCustom?: Record<string, number>;

  /**
   * Optional preprocessing config. Raw paste: off unless enabled.
   * Document import applies document defaults unless enabled === false.
   */
  @IsOptional()
  preprocessing?: {
    enabled?: boolean;
    documentMode?: boolean;
    rules?: Record<string, boolean | string>;
  };
}

class PreprocessPreviewDto {
  @IsString()
  text!: string;

  @IsOptional()
  @IsBoolean()
  documentMode?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  rules?: Record<string, boolean | string>;
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


  @Get('ssml')
  ssmlReference() {
    return { elements: supportedSsmlElements() };
  }

  @Post('preprocess-preview')
  @ApiBody({ type: PreprocessPreviewDto })
  preprocessPreview(@Body() body: PreprocessPreviewDto) {
    if (body.text == null) {
      throw new BadRequestException('text is required');
    }
    return this.tts.previewPreprocess(body.text, {
      documentMode: body.documentMode,
      enabled: body.enabled ?? body.documentMode === true,
      rules: body.rules as import('./text-preprocessor').PreprocessRules | undefined,
    });
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
      language: body.language || 'auto',
      ssml: body.ssml,
      dialogue: body.dialogue,
      speakers: body.speakers,
      normalize: body.normalize,
      highpass: body.highpass,
      compress: body.compress,
      postProcessing: body.postProcessing,
      title: body.title,
      preprocessing: body.preprocessing as
        | {
            enabled?: boolean;
            documentMode?: boolean;
            rules?: import('./text-preprocessor').PreprocessRules;
          }
        | undefined,
      qa: body.qa,
      pauseProfile: body.pauseProfile,
      pauseCustom: body.pauseCustom as
        | import('./tts.service').SynthesizeLongOptions['pauseCustom']
        | undefined,
    });
    return this.tts.toPublicJob(job);
  }

  @Post('detect-language')
  detectLanguageEndpoint(@Body() body: { text?: string }) {
    const text = body.text || '';
    const overall = detectLang(text);
    const paragraphs = detectParagraphLanguages(text);
    return { overall, paragraphs };
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
        // Document imports: preprocessing ON by default (documentMode)
        preprocessing: body.preprocessing
          ? (body.preprocessing as {
              enabled?: boolean;
              documentMode?: boolean;
              rules?: import('./text-preprocessor').PreprocessRules;
            })
          : { enabled: true, documentMode: true },
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

  @Post('jobs/:id/retry')
  async retryJob(@Param('id') id: string) {
    return this.tts.toPublicJob(await this.tts.retryJob(id));
  }

  @Post('jobs/:id/chunks/:index/resynthesize')
  async resynthesizeChunk(
    @Param('id') id: string,
    @Param('index') index: string,
    @Body() body: { text?: string; voiceId?: string },
  ) {
    const job = await this.tts.resynthesizeChunk(id, parseInt(index, 10), body);
    return this.tts.toPublicJob(job);
  }

  @Get('jobs/:id/subtitles')
  async subtitles(
    @Param('id') id: string,
    @Query('format') format?: 'vtt' | 'srt' | 'json',
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.tts.getSubtitles(id, format || 'vtt');
    if ('content' in result && result.content && res) {
      res.set({
        'Content-Type': result.contentType || 'text/vtt',
        'Content-Disposition': `attachment; filename="speech.${format || 'vtt'}"`,
      });
      return result.content;
    }
    return result;
  }

  @Get('jobs/:id/timestamps')
  async timestamps(@Param('id') id: string) {
    return this.tts.getSubtitles(id, 'json');
  }

  @Get('jobs/:id/qa')
  async jobQa(@Param('id') id: string) {
    const job = await this.tts.getJob(id);
    return (
      job.metadata?.qa || {
        mode: 'off',
        aggregateWer: null,
        chunks: [],
        message: 'No QA data for this job',
      }
    );
  }

  @Post('jobs/:id/qa/rerun')
  async jobQaRerun(@Param('id') id: string) {
    return this.tts.rerunQa(id);
  }

  @Get('models')
  models() {
    return { models: this.tts.models() };
  }

  @Get('models/disk-usage')
  modelDisk() {
    return this.tts.modelDiskUsage();
  }

  @Post('models/:key/download')
  async downloadModel(@Param('key') key: string) {
    return this.tts.downloadModel(key);
  }

  @Delete('models/:key')
  deleteModel(@Param('key') key: string) {
    return this.tts.deleteModel(key);
  }

  @Post('batch')
  async batch(@Body() body: { items: SynthesizeDto[] }) {
    if (!body?.items?.length) {
      throw new BadRequestException('items array required');
    }
    const { batch } = await this.tts.startBatch(
      body.items.map((item) => ({
        text: item.text || '',
        voice: item.voice,
        rate: item.rate,
        format: item.format,
        engine: item.engine,
        ssml: item.ssml,
        dialogue: item.dialogue,
        speakers: item.speakers,
        normalize: item.normalize,
        highpass: item.highpass,
        compress: item.compress,
        postProcessing: item.postProcessing,
        title: item.title,
      })),
    );
    return { batchId: batch.id, status: batch.status, totalJobs: batch.totalJobs };
  }

  @Get('batches')
  listBatches() {
    return this.tts.listBatches();
  }

  @Get('batches/:id')
  getBatch(@Param('id') id: string) {
    return this.tts.getBatch(id);
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
    const lang = body.language || 'auto';
    const defaultSample =
      lang === 'pt-BR'
        ? 'Olá do Resonara. Esta é uma prévia curta da voz em português do Brasil.'
        : 'Hello from Resonara. This is a short voice preview.';
    const sample = body.text?.trim() || defaultSample;
    // short sync-ish job
    const job = await this.tts.startLongForm({
      text: sample.slice(0, 200),
      voice: body.voice,
      engine: body.engine,
      language: lang,
      format: 'wav',
      normalize: true,
      highpass: true,
    });
    return this.tts.toPublicJob(job);
  }

  /** EPUB 3 Media Overlays package for a completed job. */
  @Post('jobs/:id/export/epub-overlay')
  async exportEpubOverlay(@Param('id') id: string) {
    return this.tts.exportEpubOverlay(id);
  }
}
