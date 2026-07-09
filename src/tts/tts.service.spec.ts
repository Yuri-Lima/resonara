import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TtsJob, TtsJobStatus } from '../entities/tts-job.entity';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { JobsGateway } from '../gateway/jobs.gateway';
import { TtsService } from './tts.service';
import * as platformTts from './platform-tts';
import * as piperTts from './piper-tts';
import { VoiceManager } from './voice-manager';

describe('TtsService', () => {
  let service: TtsService;
  const jobs: TtsJob[] = [];
  const repo = {
    find: jest.fn(async () =>
      jobs.filter((j) =>
        [
          TtsJobStatus.CHUNKING,
          TtsJobStatus.SYNTHESIZING,
          TtsJobStatus.CONCATENATING,
          TtsJobStatus.NORMALIZING,
        ].includes(j.status),
      ),
    ),
    findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
      jobs.find((j) => j.id === where.id) || null,
    ),
    findAndCount: jest.fn(async () => [jobs, jobs.length]),
    create: jest.fn((x: Partial<TtsJob>) => {
      const j = {
        id: x.id || `job-${jobs.length + 1}`,
        status: x.status || TtsJobStatus.QUEUED,
        text: x.text || '',
        voiceId: x.voiceId ?? null,
        engine: x.engine || 'auto',
        format: x.format || 'wav',
        rate: x.rate ?? null,
        totalChunks: x.totalChunks || 0,
        completedChunks: x.completedChunks || 0,
        progress: x.progress || 0,
        outputKey: x.outputKey ?? null,
        error: x.error ?? null,
        metadata: x.metadata ?? null,
        ssml: x.ssml || false,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      } as TtsJob;
      return j;
    }),
    save: jest.fn(async (j: TtsJob) => {
      const i = jobs.findIndex((x) => x.id === j.id);
      if (i >= 0) jobs[i] = j;
      else jobs.push(j);
      return j;
    }),
    delete: jest.fn(async (id: string) => {
      const i = jobs.findIndex((j) => j.id === id);
      if (i >= 0) jobs.splice(i, 1);
      return { affected: 1 };
    }),
  };

  const ffmpeg = {
    trimChunkSilence: jest.fn(async (_i: string, o: string) => {
      fs.writeFileSync(o, 'trim');
      return o;
    }),
    crossfadeChunks: jest.fn(async (_p: string[], o: string) => {
      fs.writeFileSync(o, 'xfade');
      return o;
    }),
    postProcessTts: jest.fn(async (_i: string, o: string) => {
      fs.writeFileSync(o, 'post');
      return o;
    }),
    probe: jest.fn(async () => ({
      duration: 1.5,
      sampleRate: 22050,
      format: 'wav',
      bitRate: null,
      channels: 1,
      bitDepth: 16,
      codec: 'pcm',
      tags: {},
      hasCoverArt: false,
      raw: {},
    })),
    embedChapterMetadata: jest.fn(async (_i: string, o: string) => {
      fs.writeFileSync(o, 'm4b');
      return o;
    }),
  };

  const gateway = {
    emitProgress: jest.fn(),
    emitCompleted: jest.fn(),
    emitFailed: jest.fn(),
  };

  beforeEach(async () => {
    jobs.length = 0;
    jest.restoreAllMocks();
    jest.spyOn(global, 'setImmediate').mockImplementation((fn: any) => { return 0 as any; });
    jest.spyOn(platformTts, 'ttsEngineAvailable').mockReturnValue({
      available: true,
      engine: 'macOS say',
      detail: 'ok',
    });
    jest.spyOn(platformTts, 'listVoices').mockReturnValue([
      { id: 'Alex', name: 'Alex', language: 'en_US' },
    ]);
    jest.spyOn(platformTts, 'synthesizeChunk').mockImplementation(async (opts) => {
      fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
      fs.writeFileSync(opts.outPath, 'audio');
      return { outPath: opts.outPath, platform: 'darwin' };
    });
    jest.spyOn(piperTts, 'isPiperAvailable').mockReturnValue({
      available: false,
      voiceCount: 0,
      detail: 'not installed',
    });
    jest.spyOn(piperTts, 'listPiperVoices').mockReturnValue([]);
    jest.spyOn(piperTts, 'resolvePiperBinary').mockReturnValue(null);
    jest.spyOn(piperTts, 'resolvePiperModelsDir').mockReturnValue('/tmp/models');

    const moduleRef = await Test.createTestingModule({
      providers: [
        TtsService,
        { provide: getRepositoryToken(TtsJob), useValue: repo },
        { provide: FfmpegService, useValue: ffmpeg },
        { provide: JobsGateway, useValue: gateway },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) =>
              k === 'resonara.dataDir'
                ? path.join(os.tmpdir(), 'resonara-tts-test')
                : undefined,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(TtsService);
  });

  it('toPublicJob maps fields', () => {
    const j = repo.create({
      text: 'hello world',
      status: TtsJobStatus.COMPLETED,
      totalChunks: 1,
      completedChunks: 1,
      progress: 100,
      outputKey: '/tmp/x.wav',
    });
    jobs.push(j);
    const pub = service.toPublicJob(j);
    expect(pub.downloadPath).toContain('/tts/jobs/');
  });

  it('getJob throws when missing', async () => {
    await expect(service.getJob('missing')).rejects.toThrow(/not found/);
  });

  it('listJobs returns page', async () => {
    const r = await service.listJobs({ page: 1, limit: 10 });
    expect(r.page).toBe(1);
  });

  it('startLongForm rejects empty text', async () => {
    await expect(service.startLongForm({ text: '  ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('startLongForm persists queued job', async () => {
    const job = await service.startLongForm({ text: 'Hello from Resonara.' });
    expect(job.status).toBe(TtsJobStatus.QUEUED);
    expect(jobs.length).toBe(1);
    expect(job.metadata?.wordCount).toBeGreaterThan(0);
  });

  it('onModuleInit marks interrupted jobs failed', async () => {
    const j = repo.create({
      text: 'x',
      status: TtsJobStatus.SYNTHESIZING,
    });
    jobs.push(j);
    await service.onModuleInit();
    expect(j.status).toBe(TtsJobStatus.FAILED);
    expect(j.error).toMatch(/interrupted/);
  });

  it('deleteJob removes entity', async () => {
    const j = repo.create({ text: 'x', status: TtsJobStatus.COMPLETED });
    jobs.push(j);
    await service.deleteJob(j.id);
    expect(jobs.find((x) => x.id === j.id)).toBeUndefined();
  });

  it('getChapters returns empty when none', async () => {
    const j = repo.create({ text: 'x', status: TtsJobStatus.COMPLETED, metadata: {} });
    jobs.push(j);
    expect(await service.getChapters(j.id)).toEqual([]);
  });

  it('synthesizeLongSync rejects empty text', async () => {
    await expect(
      service.synthesizeLongSync({ text: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolveDownload rejects incomplete job', async () => {
    const j = repo.create({ text: 'x', status: TtsJobStatus.QUEUED });
    jobs.push(j);
    await expect(service.resolveDownload(j.id)).rejects.toThrow(/not completed/i);
  });


  it('voices and engineStatus work', () => {
    expect(Array.isArray(service.voices())).toBe(true);
    expect(service.engineStatus().engines.length).toBe(2);
  });
});
