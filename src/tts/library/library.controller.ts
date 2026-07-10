import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TtsJob } from '../../entities/tts-job.entity';
import { LibraryService } from './library.service';
import { buildPodcastRss, feedsEnabled } from '../feeds/podcast-feed';
import { atempoFilterGraph } from '../cover/cover-art';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { resolveFfmpegBinary } from '../../ffmpeg/resolve-ffmpeg';

@ApiTags('library')
@Controller()
export class LibraryController {
  constructor(
    private readonly library: LibraryService,
    @InjectRepository(TtsJob) private readonly jobs: Repository<TtsJob>,
  ) {}

  @Get('tts/library')
  listLibrary(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('language') language?: string,
    @Query('engine') engine?: string,
  ) {
    return this.library.listLibrary({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 24,
      q,
      language,
      engine,
    });
  }

  @Get('tts/jobs/:id/cover')
  async cover(@Param('id') id: string, @Res() res: Response) {
    const job = await this.jobs.findOne({ where: { id } });
    if (!job) throw new NotFoundException('job not found');
    const cover = await this.library.ensureCover(job);
    res.setHeader('Content-Type', 'image/svg+xml');
    createReadStream(cover).pipe(res);
  }

  @Post('tts/jobs/:id/bookmarks')
  async addBookmark(
    @Param('id') id: string,
    @Body() body: { positionMs?: number; note?: string },
  ) {
    if (body.positionMs == null || !Number.isFinite(body.positionMs)) {
      throw new BadRequestException('positionMs required');
    }
    return this.library.createBookmark(id, body.positionMs, body.note);
  }

  @Get('tts/jobs/:id/bookmarks')
  listBookmarks(@Param('id') id: string) {
    return this.library.listBookmarks(id);
  }

  @Delete('tts/bookmarks/:id')
  deleteBookmark(@Param('id') id: string) {
    return this.library.deleteBookmark(id);
  }

  @Patch('tts/jobs/:id/resume')
  async resume(
    @Param('id') id: string,
    @Body() body: { positionMs?: number },
  ) {
    if (body.positionMs == null) throw new BadRequestException('positionMs required');
    const v = await this.library.setResume(id, body.positionMs);
    if (v == null) throw new NotFoundException('job not found');
    return { positionMs: v };
  }

  @Get('tts/jobs/:id/download-speed')
  async downloadSpeed(
    @Param('id') id: string,
    @Query('speed') speedRaw: string,
    @Res() res: Response,
  ) {
    const speed = parseFloat(speedRaw || '1');
    if (!Number.isFinite(speed) || speed < 0.5 || speed > 3.0) {
      throw new BadRequestException('speed must be 0.5–3.0');
    }
    const job = await this.jobs.findOne({ where: { id } });
    if (!job?.outputKey || !existsSync(job.outputKey)) {
      throw new NotFoundException('audio missing');
    }
    const filter = atempoFilterGraph(speed);
    const ff = resolveFfmpegBinary(undefined, 'ffmpeg');
    const out = path.join(
      path.dirname(job.outputKey),
      `speech-speed-${speed}.wav`,
    );
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ff, [
        '-y',
        '-i',
        job.outputKey!,
        '-filter:a',
        filter,
        out,
      ]);
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)),
      );
    });
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="speech-${speed}x.wav"`,
    );
    createReadStream(out).pipe(res);
  }

  @Get('feeds')
  listFeeds() {
    if (!feedsEnabled()) {
      throw new ServiceUnavailableException(
        'Podcast feeds disabled. Set RESONARA_FEEDS=1 (LAN only — unauthenticated).',
      );
    }
    return this.jobs
      .find({ where: { status: 'completed' as never }, take: 100 })
      .then((list) =>
        list.map((j) => ({
          jobId: j.id,
          title: j.metadata?.title || j.id,
          url: `/feeds/${j.id}/rss.xml`,
        })),
      );
  }

  @Get('feeds/:jobId/rss.xml')
  async feedXml(@Param('jobId') jobId: string, @Res() res: Response) {
    if (!feedsEnabled()) {
      throw new ServiceUnavailableException(
        'Podcast feeds disabled (RESONARA_FEEDS=0). Security: feeds are unauthenticated for LAN podcast apps.',
      );
    }
    const job = await this.jobs.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('job not found');
    const base = process.env.RESONARA_PUBLIC_URL || 'http://127.0.0.1:3847';
    const chapters = job.metadata?.chapters || [];
    const episodes =
      chapters.length > 0
        ? chapters.map((c, i) => ({
            title: c.title || `Chapter ${i + 1}`,
            enclosureUrl: `${base}/tts/jobs/${job.id}/chapters/${i}/download`,
            durationSec: Math.max(0, (c.endTime || 0) - (c.startTime || 0)),
            guid: `${job.id}-ch-${i}`,
            lengthBytes: 0,
          }))
        : [
            {
              title: job.metadata?.title || 'Audiobook',
              enclosureUrl: `${base}/tts/jobs/${job.id}/download`,
              durationSec: job.metadata?.duration || 0,
              guid: `${job.id}-full`,
              lengthBytes: job.outputKey && fs.existsSync(job.outputKey)
                ? fs.statSync(job.outputKey).size
                : 0,
            },
          ];
    const cover = await this.library.ensureCover(job);
    const xml = buildPodcastRss({
      title: job.metadata?.title || 'Resonara Audiobook',
      description: (job.text || '').slice(0, 400),
      link: `${base}/ui/voice/`,
      imageUrl: `${base}/tts/jobs/${job.id}/cover`,
      author: job.metadata?.author || 'Resonara',
      language: job.metadata?.language || 'en',
      episodes,
    });
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(xml);
    void cover;
  }
}
