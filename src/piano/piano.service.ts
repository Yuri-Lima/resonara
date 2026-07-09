import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Repository } from 'typeorm';
import {
  detectAudioFormat,
  FORMAT_MIME,
  isAllowedAudio,
} from '../common/magic-bytes';
import {
  PianoTake,
  PianoTakeStatus,
} from '../entities/piano-take.entity';
import {
  SamplePack,
  SamplePackManifest,
} from '../entities/sample-pack.entity';
import { Track, TrackStatus } from '../entities/track.entity';
import {
  JobStatus,
  JobType,
  TranscodeJob,
} from '../entities/transcode-job.entity';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { QueueService } from '../queue/queue.service';
import { StorageService } from '../storage/storage.service';
import { ExportTakeDto } from './dto/export-take.dto';

@Injectable()
export class PianoService implements OnModuleInit {
  private readonly logger = new Logger(PianoService.name);

  constructor(
    @InjectRepository(SamplePack)
    private readonly packs: Repository<SamplePack>,
    @InjectRepository(PianoTake)
    private readonly takes: Repository<PianoTake>,
    @InjectRepository(Track)
    private readonly tracks: Repository<Track>,
    @InjectRepository(TranscodeJob)
    private readonly jobs: Repository<TranscodeJob>,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
    private readonly queue: QueueService,
  ) {}

  async onModuleInit() {
    // Auto-register local seed pack if present under samples/upright-basic
    const localSeed = path.join(process.cwd(), 'samples', 'upright-basic');
    try {
      const manifestPath = path.join(localSeed, 'manifest.json');
      await fs.access(manifestPath);
      const existing = await this.packs.findOne({
        where: { id: 'upright-basic' },
      });
      if (!existing) {
        this.logger.log('Seeding upright-basic pack from local samples/');
        await this.registerLocalPack(localSeed);
      }
    } catch {
      this.logger.debug('No local samples/upright-basic seed found');
    }
  }

  async listPacks() {
    const rows = await this.packs.find({ order: { name: 'ASC' } });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      noteCount: p.manifestJson?.notes?.length ?? 0,
      keyRange: p.manifestJson?.keyRange,
      license: p.manifestJson?.license,
    }));
  }

  async getPack(id: string) {
    const pack = await this.packs.findOne({ where: { id } });
    if (!pack) throw new NotFoundException(`Pack ${id} not found`);
    return {
      id: pack.id,
      name: pack.name,
      storagePrefix: pack.storagePrefix,
      manifest: pack.manifestJson,
      status: pack.status,
    };
  }

  async getSampleUrl(packId: string, noteName: string) {
    const pack = await this.packs.findOne({ where: { id: packId } });
    if (!pack) throw new NotFoundException(`Pack ${packId} not found`);
    const note = pack.manifestJson.notes.find(
      (n) => n.name === noteName || String(n.midi) === noteName,
    );
    if (!note) {
      throw new NotFoundException(`Note ${noteName} not in pack ${packId}`);
    }
    const key = `${pack.storagePrefix}/${note.key}`.replace(/\/+/g, '/');
    const url = await this.storage.presignedGet(
      this.storage.samplesBucket,
      key,
    );
    return { packId, note: note.name, midi: note.midi, key, url };
  }

  /** Register pack from local directory (manifest + note files). */
  async registerLocalPack(dir: string): Promise<SamplePack> {
    const manifestPath = path.join(dir, 'manifest.json');
    const raw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw) as SamplePackManifest;
    if (!manifest.id || !manifest.notes?.length) {
      throw new BadRequestException('Invalid pack manifest');
    }
    const prefix = manifest.id;
    for (const note of manifest.notes) {
      const filePath = path.join(dir, note.key);
      await fs.access(filePath);
      const objectKey = `${prefix}/${note.key}`;
      await this.storage.putFile(
        this.storage.samplesBucket,
        objectKey,
        filePath,
        { 'Content-Type': 'audio/mpeg' },
      );
    }
    // also store manifest in minio
    await this.storage.putJson(
      this.storage.samplesBucket,
      `${prefix}/manifest.json`,
      manifest,
    );

    let pack = await this.packs.findOne({ where: { id: manifest.id } });
    if (!pack) {
      pack = this.packs.create({
        id: manifest.id,
        name: manifest.name,
        storagePrefix: prefix,
        manifestJson: manifest,
        status: 'ready',
      });
    } else {
      pack.name = manifest.name;
      pack.storagePrefix = prefix;
      pack.manifestJson = manifest;
      pack.status = 'ready';
    }
    return this.packs.save(pack);
  }

  async createTakeFromUpload(
    file: Express.Multer.File,
    opts: {
      packId?: string;
      label?: string;
      midiStats?: string | Record<string, unknown>;
    },
  ): Promise<PianoTake> {
    if (!file?.path && !file?.buffer) {
      throw new BadRequestException('No file uploaded');
    }

    const tmpDir = this.ffmpeg.createTempDir('piano-take-');
    let localPath: string;
    let size: number;
    try {
      if (file.path) {
        localPath = file.path;
        size = file.size;
      } else {
        localPath = path.join(tmpDir, file.originalname || 'take.webm');
        await fs.writeFile(localPath, file.buffer);
        size = file.buffer.length;
      }

      const head = Buffer.alloc(Math.min(64, size));
      const fh = await fs.open(localPath, 'r');
      await fh.read(head, 0, head.length, 0);
      await fh.close();

      if (!isAllowedAudio(head)) {
        throw new BadRequestException(
          'Unsupported audio (magic-byte check failed)',
        );
      }

      // Convert webm → wav for consistent analysis when needed
      let analysisPath = localPath;
      const fmt = detectAudioFormat(head);
      if (fmt === 'webm' || fmt === 'ogg') {
        const wavPath = path.join(tmpDir, 'take.wav');
        await this.ffmpeg.transcode(localPath, wavPath, {
          format: 'wav',
          sampleRate: 48000,
          bitDepth: 16,
        });
        analysisPath = wavPath;
      }

      const probe = await this.ffmpeg.probe(analysisPath);
      const safeInt = (v: number | null | undefined) =>
        v != null && Number.isFinite(v) ? Math.trunc(v) : null;

      const track = this.tracks.create({
        originalFilename: file.originalname || 'piano-take.wav',
        storageKey: '',
        mimeType: FORMAT_MIME[fmt] || file.mimetype || 'audio/wav',
        format: probe.format,
        durationSec: probe.duration,
        sampleRate: safeInt(probe.sampleRate),
        channels: safeInt(probe.channels),
        bitRate: safeInt(probe.bitRate),
        bitDepth: safeInt(probe.bitDepth),
        sizeBytes: String(size),
        metadataJson: {
          tags: probe.tags,
          codec: probe.codec,
          source: 'piano-take',
        },
        status: TrackStatus.READY,
      });
      await this.tracks.save(track);

      const key = `${track.id}/original/${path.basename(analysisPath)}`;
      track.storageKey = key;
      track.mimeType = 'audio/wav';
      await this.storage.putStream(
        this.storage.originalBucket,
        key,
        createReadStream(analysisPath),
        (await fs.stat(analysisPath)).size,
        { 'Content-Type': 'audio/wav' },
      );
      await this.tracks.save(track);

      let midiStats: Record<string, unknown> | null = null;
      if (opts.midiStats) {
        if (typeof opts.midiStats === 'string') {
          try {
            midiStats = JSON.parse(opts.midiStats);
          } catch {
            midiStats = { raw: opts.midiStats };
          }
        } else {
          midiStats = opts.midiStats;
        }
      }

      const take = this.takes.create({
        trackId: track.id,
        packId: opts.packId || null,
        userLabel: opts.label || null,
        durationSec: probe.duration,
        midiStatsJson: midiStats,
        analysisStatus: PianoTakeStatus.ANALYZING,
      });
      await this.takes.save(take);

      // Fire analysis asynchronously (don't block response too long)
      void this.runAnalysis(take.id).catch((e) =>
        this.logger.error(`analysis ${take.id}: ${e.message}`),
      );

      return take;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      if (file.path) {
        await fs.unlink(file.path).catch(() => undefined);
      }
    }
  }

  async runAnalysis(takeId: string): Promise<PianoTake> {
    const take = await this.takes.findOne({ where: { id: takeId } });
    if (!take) throw new NotFoundException(`Take ${takeId} not found`);
    const track = await this.tracks.findOne({ where: { id: take.trackId } });
    if (!track) throw new NotFoundException('Track missing');

    take.analysisStatus = PianoTakeStatus.ANALYZING;
    await this.takes.save(take);

    const tmp = this.ffmpeg.createTempDir('piano-analysis-');
    const local = path.join(tmp, 'src');
    try {
      await this.storage.getFile(
        this.storage.originalBucket,
        track.storageKey,
        local,
      );

      const [waveform, silence, measured] = await Promise.all([
        this.ffmpeg.extractWaveform(local, {
          resolution: 1800,
          channels: 'stereo',
        }),
        this.ffmpeg.detectSilence(local, {
          thresholdDb: -45,
          minDuration: 0.25,
        }),
        this.ffmpeg.measureLoudness(local, -14, -1, 11),
      ]);

      const waveKey = `${track.id}/artifacts/piano-waveform.json`;
      await this.storage.putJson(this.storage.artifactBucket, waveKey, {
        trackId: track.id,
        takeId: take.id,
        ...waveform,
      });
      track.waveformKey = waveKey;
      await this.tracks.save(track);

      take.analysisJson = {
        waveformKey: waveKey,
        waveform: {
          resolution: waveform.resolution,
          duration: waveform.duration,
          peaksSample: waveform.peaks.mono.slice(0, 20),
          // full peaks served via waveform endpoint / cached object
        },
        silence: {
          thresholdDb: -45,
          minDuration: 0.25,
          segments: silence,
        },
        loudness: {
          measured,
          targetLufs: -14,
          truePeakTarget: -1,
          note: 'Integrated LUFS from two-pass measure (pass 1 only). Export runs full normalize.',
        },
      };
      take.analysisStatus = PianoTakeStatus.READY;
      await this.takes.save(take);
      return take;
    } catch (e: any) {
      take.analysisStatus = PianoTakeStatus.ERROR;
      take.analysisJson = { error: e?.message || String(e) };
      await this.takes.save(take);
      throw e;
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async getTake(id: string) {
    const take = await this.takes.findOne({
      where: { id },
      relations: ['track'],
    });
    if (!take) throw new NotFoundException(`Take ${id} not found`);
    return take;
  }

  async listTakes(limit = 30) {
    return this.takes.find({
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['track'],
    });
  }

  async getAnalysis(id: string) {
    const take = await this.getTake(id);
    let waveform: unknown = null;
    const waveKey =
      (take.analysisJson as any)?.waveformKey || take.track?.waveformKey;
    if (waveKey) {
      waveform = await this.storage.getJson(
        this.storage.artifactBucket,
        waveKey,
      );
    }
    return {
      takeId: take.id,
      trackId: take.trackId,
      status: take.analysisStatus,
      packId: take.packId,
      label: take.userLabel,
      durationSec: take.durationSec,
      midiStats: take.midiStatsJson,
      analysis: take.analysisJson,
      waveform,
      normalizeJobId: take.normalizeJobId,
      exportJobId: take.exportJobId,
    };
  }

  async exportTake(id: string, dto: ExportTakeDto) {
    const take = await this.getTake(id);
    const track = await this.tracks.findOne({ where: { id: take.trackId } });
    if (!track) throw new NotFoundException('Track missing');

    const doNorm = dto.normalize !== false;
    const format = dto.format || 'mp3';
    const targetLufs = dto.targetLufs ?? -14;

    // Enqueue normalize (two-pass) then client can poll; for trim we chain simply
    if (dto.trimSilence) {
      const segs =
        ((take.analysisJson as any)?.silence?.segments as Array<{
          start: number;
          end: number;
        }>) || [];
      const duration = take.durationSec || track.durationSec || 0;
      let start = 0;
      let end = duration;
      // trim leading silence
      if (segs.length && segs[0].start < 0.05) {
        start = segs[0].end;
      }
      // trailing
      const last = segs[segs.length - 1];
      if (last && duration - last.end < 0.15) {
        end = last.start;
      }
      if (end > start + 0.1) {
        const trimJob = await this.enqueueJob(track.id, JobType.TRIM, {
          start,
          end,
          fadeIn: 0.02,
          fadeOut: 0.08,
          fadeCurve: 'quarter-sine',
        });
        take.exportJobId = trimJob.id;
      }
    }

    if (doNorm) {
      const job = await this.enqueueJob(track.id, JobType.NORMALIZE, {
        targetLufs,
        truePeak: -1,
        lra: 11,
      });
      take.normalizeJobId = job.id;
    } else {
      const job = await this.enqueueJob(track.id, JobType.TRANSCODE, {
        format,
        bitrate: dto.bitrate || 192,
      });
      take.exportJobId = job.id;
    }

    await this.takes.save(take);
    return {
      takeId: take.id,
      normalizeJobId: take.normalizeJobId,
      exportJobId: take.exportJobId,
      message:
        'Export jobs enqueued. Poll GET /jobs/:id then GET /tracks/:trackId/download?jobId=',
    };
  }

  private async enqueueJob(
    trackId: string,
    type: JobType,
    params: Record<string, unknown>,
  ): Promise<TranscodeJob> {
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
}
