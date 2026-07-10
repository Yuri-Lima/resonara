import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TtsJob, TtsJobStatus } from '../../entities/tts-job.entity';
import { Bookmark } from '../../entities/bookmark.entity';
import * as fs from 'fs';
import * as path from 'path';
import { writeCoverFiles } from '../cover/cover-art';

@Injectable()
export class LibraryService {
  constructor(
    @InjectRepository(TtsJob) private readonly jobs: Repository<TtsJob>,
    @InjectRepository(Bookmark) private readonly bookmarks: Repository<Bookmark>,
  ) {}

  async listLibrary(opts?: {
    page?: number;
    limit?: number;
    q?: string;
    language?: string;
    engine?: string;
  }) {
    const page = Math.max(1, opts?.page || 1);
    const limit = Math.min(100, Math.max(1, opts?.limit || 24));
    // Single query — no N+1
    const all = await this.jobs.find({
      where: { status: TtsJobStatus.COMPLETED },
      order: { updatedAt: 'DESC' },
    });
    let items = all.map((j) => this.toCard(j));
    if (opts?.q) {
      const q = opts.q.toLowerCase();
      items = items.filter(
        (c) =>
          (c.title || '').toLowerCase().includes(q) ||
          (c.author || '').toLowerCase().includes(q),
      );
    }
    if (opts?.language) {
      items = items.filter((c) =>
        (c.language || '').toLowerCase().startsWith(opts.language!.toLowerCase()),
      );
    }
    if (opts?.engine) {
      items = items.filter((c) => c.engine === opts.engine);
    }
    const total = items.length;
    const slice = items.slice((page - 1) * limit, page * limit);
    const continueListening = items
      .filter((c) => c.progressPct > 0 && c.progressPct < 98)
      .slice(0, 8);
    return { items: slice, total, page, limit, continueListening };
  }

  private toCard(j: TtsJob) {
    const audioMissing = !!(j.outputKey && !fs.existsSync(j.outputKey));
    const duration = j.metadata?.duration || 0;
    const resume = j.metadata?.resumePositionMs || 0;
    const progressPct =
      duration > 0 ? Math.min(100, (resume / (duration * 1000)) * 100) : 0;
    return {
      id: j.id,
      title: j.metadata?.title || j.text.slice(0, 48) || 'Untitled',
      author: j.metadata?.author || 'Resonara',
      duration,
      engine: j.engine,
      language: j.metadata?.language || 'en',
      coverUrl: j.metadata?.coverKey
        ? `/tts/jobs/${j.id}/cover`
        : undefined,
      progressPct,
      resumePositionMs: resume,
      audioMissing,
      updatedAt: j.updatedAt,
      createdAt: j.createdAt,
    };
  }

  async ensureCover(job: TtsJob): Promise<string> {
    if (job.metadata?.coverKey && fs.existsSync(job.metadata.coverKey)) {
      return job.metadata.coverKey;
    }
    const dir = job.outputKey
      ? path.dirname(job.outputKey)
      : path.join(process.cwd(), '.resonara-data', 'tts', job.id);
    const { svgPath } = await writeCoverFiles(
      dir,
      job.metadata?.title || 'Untitled',
      job.metadata?.author,
    );
    job.metadata = { ...(job.metadata || {}), coverKey: svgPath };
    await this.jobs.save(job);
    return svgPath;
  }

  async createBookmark(jobId: string, positionMs: number, note?: string) {
    const b = this.bookmarks.create({
      jobId,
      positionMs: Math.max(0, Math.round(positionMs)),
      note: note || null,
    });
    return this.bookmarks.save(b);
  }

  async listBookmarks(jobId: string) {
    return this.bookmarks.find({
      where: { jobId },
      order: { createdAt: 'DESC' },
    });
  }

  async deleteBookmark(id: string) {
    await this.bookmarks.delete(id);
    return { ok: true };
  }

  async setResume(jobId: string, positionMs: number) {
    const job = await this.jobs.findOne({ where: { id: jobId } });
    if (!job) return null;
    job.metadata = {
      ...(job.metadata || {}),
      resumePositionMs: Math.max(0, Math.round(positionMs)),
    };
    await this.jobs.save(job);
    return job.metadata.resumePositionMs;
  }
}
