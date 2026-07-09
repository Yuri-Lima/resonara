import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { Request, Response } from 'express';
import * as os from 'os';
import * as path from 'path';
import { NormalizeDto } from './dto/normalize.dto';
import { TranscodeDto } from './dto/transcode.dto';
import { TrimDto } from './dto/trim.dto';
import { TracksService } from './tracks.service';

@ApiTags('tracks')
@Controller('tracks')
export class TracksController {
  constructor(private readonly tracks: TracksService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload audio file (magic-byte validated)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) =>
          cb(null, os.tmpdir()),
        filename: (_req, file, cb) =>
          cb(null, `up-${Date.now()}-${file.originalname}`),
      }),
      limits: { fileSize: 2048 * 1024 * 1024 },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    return this.tracks.upload(file);
  }

  @Get()
  @ApiOperation({ summary: 'List tracks' })
  list(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.tracks.findAll(
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get track by id' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.tracks.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete track' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.tracks.remove(id);
    return { deleted: true };
  }

  @Post(':id/transcode')
  @ApiOperation({ summary: 'Enqueue format conversion' })
  transcode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TranscodeDto,
  ) {
    return this.tracks.enqueueTranscode(id, dto);
  }

  @Post(':id/normalize')
  @ApiOperation({
    summary: 'Enqueue two-pass EBU R128 loudness normalization',
  })
  normalize(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NormalizeDto,
  ) {
    return this.tracks.enqueueNormalize(id, dto);
  }

  @Get(':id/waveform')
  @ApiOperation({ summary: 'Extract peak/RMS waveform JSON' })
  @ApiQuery({ name: 'resolution', required: false })
  @ApiQuery({ name: 'channels', required: false, enum: ['mono', 'stereo'] })
  waveform(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('resolution') resolution?: string,
    @Query('channels') channels?: 'mono' | 'stereo',
  ) {
    return this.tracks.getWaveform(
      id,
      resolution ? parseInt(resolution, 10) : 1800,
      channels || 'stereo',
    );
  }

  @Get(':id/metadata')
  @ApiOperation({ summary: 'ffprobe + tags + cover art URL' })
  metadata(@Param('id', ParseUUIDPipe) id: string) {
    return this.tracks.getMetadata(id);
  }

  @Get(':id/silence')
  @ApiOperation({ summary: 'Detect silence segments' })
  silence(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('threshold') threshold?: string,
    @Query('duration') duration?: string,
  ) {
    return this.tracks.getSilence(
      id,
      threshold ? parseFloat(threshold) : -50,
      duration ? parseFloat(duration) : 0.5,
    );
  }

  @Post(':id/trim')
  @ApiOperation({ summary: 'Trim + optional fade (enqueued)' })
  trim(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TrimDto) {
    return this.tracks.enqueueTrim(id, dto);
  }

  @Get(':id/stream')
  @ApiOperation({ summary: 'HTTP Range streaming delivery' })
  @ApiQuery({ name: 'jobId', required: false })
  async stream(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('jobId') jobId?: string,
  ) {
    const range = req.headers.range;
    const result = await this.tracks.openStream(id, range, jobId);
    res.status(result.status);
    for (const [k, v] of Object.entries(result.headers)) {
      res.setHeader(k, String(v));
    }
    result.stream.pipe(res);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Presigned MinIO download URL' })
  download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('jobId') jobId?: string,
  ) {
    return this.tracks.getDownloadUrl(id, jobId);
  }
}
