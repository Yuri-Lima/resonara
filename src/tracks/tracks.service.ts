import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream, createWriteStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { Repository } from 'typeorm';
import { detectAudioFormat, FORMAT_MIME, isAllowedAudio } from '../common/magic-bytes';
import { LUFS_PROFILES } from '../common/constants';
import { Track, TrackStatus } from '../entities/track.entity';
import {
  JobStatus,
  JobType,
  TranscodeJob,
} from '../entities/transcode-job.entity';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { QueueService } from '../queue/queue.service';
import { StorageService } from '../storage/storage.service';
import { NormalizeDto } from './dto/normalize.dto';
import { TranscodeDto } from './dto/transcode.dto';
import { TrimDto } from './dto/trim.dto';

@Injectable()
export class TracksService {
  private readonly logger = new Logger(TracksService.name);

  constructor(
    @InjectRepository(Track) private readonly tracks: Repository<Track>,
    @InjectRepository(TranscodeJob)
    private readonly jobs: Repository<TranscodeJob>,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
    private readonly queue: QueueService,
  ) {}

  async upload(file: Express.Multer.File): Promise<Track> {
    if (!file?.path && !file?.buffer) {
      throw new BadRequestException('No file uploaded');
    }

    // Read magic bytes from start of file
    let head: Buffer;
    let size: number;
    let localPath: string | null = null;
    const tmpDir = this.ffmpeg.createTempDir('upload-');

    try {
      if (file.path) {
        localPath = file.path;
        size = file.size;
        const fh = await fs.open(file.path, 'r');
        head = Buffer.alloc(Math.min(64, file.size));
        await fh.read(head, 0, head.length, 0);
        await fh.close();
      } else {
        head = file.buffer.subarray(0, Math.min(64, file.buffer.length));
        size = file.buffer.length;
        localPath = path.join(tmpDir, file.originalname || 'upload.bin');
        await fs.writeFile(localPath, file.buffer);
      }

      if (!isAllowedAudio(head)) {
        throw new BadRequestException(
          'Unsupported or invalid audio file (magic-byte check failed)',
        );
      }

      const fmt = detectAudioFormat(head);
      const probe = await this.ffmpeg.probe(localPath!);

      const safeInt = (v: number | null | undefined) =>
        v != null && Number.isFinite(v) ? Math.trunc(v) : null;

      const track = this.tracks.create({
        originalFilename: file.originalname || 'upload',
        storageKey: '', // set after id
        mimeType: FORMAT_MIME[fmt] || file.mimetype,
        format: probe.format,
        durationSec: Number.isFinite(probe.duration) ? probe.duration : null,
        sampleRate: safeInt(probe.sampleRate),
        channels: safeInt(probe.channels),
        bitRate: safeInt(probe.bitRate),
        bitDepth: safeInt(probe.bitDepth),
        sizeBytes: String(size || 0),
        metadataJson: { tags: probe.tags, codec: probe.codec },
        status: TrackStatus.READY,
      });
      await this.tracks.save(track);

      const key = `${track.id}/original/${path.basename(track.originalFilename)}`;
      track.storageKey = key;

      // Stream to MinIO
      const stream = createReadStream(localPath!);
      await this.storage.putStream(
        this.storage.originalBucket,
        key,
        stream,
        size,
        { 'Content-Type': track.mimeType || 'application/octet-stream' },
      );
      await this.tracks.save(track);

      // Optional cover art
      if (probe.hasCoverArt) {
        try {
          const coverPath = path.join(tmpDir, 'cover.jpg');
          const cover = await this.ffmpeg.extractCoverArt(localPath!, coverPath);
          if (cover) {
            const coverKey = `${track.id}/artifacts/cover.jpg`;
            await this.storage.putFile(
              this.storage.artifactBucket,
              coverKey,
              cover.path,
            );
            track.metadataJson = {
              ...track.metadataJson,
              coverArtKey: coverKey,
            };
            await this.tracks.save(track);
          }
        } catch (e) {
          this.logger.warn(`cover extract: ${(e as Error).message}`);
        }
      }

      return track;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      if (file.path) {
        await fs.unlink(file.path).catch(() => undefined);
      }
    }
  }

  async findAll(limit = 50, offset = 0) {
    return this.tracks.find({
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async findOne(id: string): Promise<Track> {
    const t = await this.tracks.findOne({
      where: { id },
      relations: ['jobs'],
    });
    if (!t) throw new NotFoundException(`Track ${id} not found`);
    return t;
  }

  async remove(id: string): Promise<void> {
    const t = await this.findOne(id);
    await this.tracks.remove(t);
  }

  private async createJob(
    trackId: string,
    type: JobType,
    params: Record<string, unknown>,
  ): Promise<TranscodeJob> {
    await this.findOne(trackId);
    const job = this.jobs.create({
      trackId,
      type,
      status: JobStatus.QUEUED,
      progress: 0,
      paramsJson: params,
    });
    await this.jobs.save(job);
    const bullId = await this.queue.enqueue(type, {
      jobId: job.id,
      trackId,
      params,
    });
    job.bullJobId = bullId;
    await this.jobs.save(job);
    return job;
  }

  async enqueueTranscode(id: string, dto: TranscodeDto) {
    return this.createJob(id, JobType.TRANSCODE, { ...dto });
  }

  async enqueueNormalize(id: string, dto: NormalizeDto) {
    let targetLufs = dto.targetLufs ?? -14;
    let truePeak = dto.truePeak ?? -1;
    let lra = dto.lra ?? 11;
    if (dto.profile && dto.profile !== 'custom') {
      const p = LUFS_PROFILES[dto.profile];
      targetLufs = p.targetLufs;
      truePeak = p.truePeak;
      lra = p.lra;
    }
    return this.createJob(id, JobType.NORMALIZE, {
      targetLufs,
      truePeak,
      lra,
      sampleRate: dto.sampleRate,
    });
  }

  async enqueueTrim(id: string, dto: TrimDto) {
    return this.createJob(id, JobType.TRIM, { ...dto });
  }

  async getWaveform(
    id: string,
    resolution = 1800,
    channels: 'mono' | 'stereo' = 'stereo',
  ) {
    const track = await this.findOne(id);
    const cacheKey = `${id}/artifacts/waveform-${resolution}-${channels}.json`;
    const cached = await this.storage.getJson(
      this.storage.artifactBucket,
      cacheKey,
    );
    if (cached) return cached;

    const tmp = this.ffmpeg.createTempDir('wave-');
    const local = path.join(tmp, 'input');
    try {
      await this.storage.getFile(
        this.storage.originalBucket,
        track.storageKey,
        local,
      );
      const result = await this.ffmpeg.extractWaveform(local, {
        resolution,
        channels,
      });
      const payload = { trackId: id, ...result };
      await this.storage.putJson(
        this.storage.artifactBucket,
        cacheKey,
        payload,
      );
      track.waveformKey = cacheKey;
      await this.tracks.save(track);
      return payload;
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async getMetadata(id: string) {
    const track = await this.findOne(id);
    const tmp = this.ffmpeg.createTempDir('meta-');
    const local = path.join(tmp, 'input');
    try {
      await this.storage.getFile(
        this.storage.originalBucket,
        track.storageKey,
        local,
      );
      const probe = await this.ffmpeg.probe(local);
      let coverUrl: string | null = null;
      const coverKey = (track.metadataJson as any)?.coverArtKey;
      if (coverKey) {
        coverUrl = await this.storage.presignedGet(
          this.storage.artifactBucket,
          coverKey,
        );
      }
      return {
        trackId: id,
        format: probe.format,
        duration: probe.duration,
        bitRate: probe.bitRate,
        sampleRate: probe.sampleRate,
        channels: probe.channels,
        bitDepth: probe.bitDepth,
        codec: probe.codec,
        tags: probe.tags,
        coverArtUrl: coverUrl,
      };
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async getSilence(
    id: string,
    thresholdDb = -50,
    duration = 0.5,
  ) {
    const track = await this.findOne(id);
    const tmp = this.ffmpeg.createTempDir('sil-');
    const local = path.join(tmp, 'input');
    try {
      await this.storage.getFile(
        this.storage.originalBucket,
        track.storageKey,
        local,
      );
      const segments = await this.ffmpeg.detectSilence(local, {
        thresholdDb,
        minDuration: duration,
      });
      return { trackId: id, thresholdDb, minDuration: duration, segments };
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async getDownloadUrl(id: string, jobId?: string) {
    const track = await this.findOne(id);
    if (jobId) {
      const job = await this.jobs.findOne({ where: { id: jobId, trackId: id } });
      if (!job?.outputStorageKey) {
        throw new NotFoundException('Derivative not ready');
      }
      const url = await this.storage.presignedGet(
        this.storage.derivativeBucket,
        job.outputStorageKey,
      );
      return { url, storageKey: job.outputStorageKey };
    }
    const url = await this.storage.presignedGet(
      this.storage.originalBucket,
      track.storageKey,
    );
    return { url, storageKey: track.storageKey };
  }

  async openStream(
    id: string,
    rangeHeader?: string,
    jobId?: string,
  ): Promise<{
    stream: NodeJS.ReadableStream;
    status: number;
    headers: Record<string, string | number>;
  }> {
    const track = await this.findOne(id);
    let bucket = this.storage.originalBucket;
    let key = track.storageKey;
    let contentType = track.mimeType || 'application/octet-stream';

    if (jobId) {
      const job = await this.jobs.findOne({ where: { id: jobId, trackId: id } });
      if (!job?.outputStorageKey) {
        throw new NotFoundException('Derivative not ready');
      }
      bucket = this.storage.derivativeBucket;
      key = job.outputStorageKey;
      contentType = 'application/octet-stream';
    }

    const stat = await this.storage.stat(bucket, key);
    const total = stat.size;

    if (rangeHeader) {
      const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
      if (!m) throw new BadRequestException('Invalid Range header');
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : total - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        throw new BadRequestException('Invalid range');
      }
      const stream = await this.storage.getStream(bucket, key, { start, end });
      return {
        stream,
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Content-Length': end - start + 1,
        },
      };
    }

    const stream = await this.storage.getStream(bucket, key);
    return {
      stream,
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Length': total,
      },
    };
  }

  /** Materialize track to local temp for workers */
  async downloadToTemp(track: Track, destDir: string): Promise<string> {
    const local = path.join(destDir, 'source');
    await this.storage.getFile(
      this.storage.originalBucket,
      track.storageKey,
      local,
    );
    return local;
  }
}
