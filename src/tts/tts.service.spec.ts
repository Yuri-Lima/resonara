import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { TtsJob, TtsJobStatus } from '../entities/tts-job.entity';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { JobsGateway } from '../gateway/jobs.gateway';
import { TtsService } from './tts.service';

describe('TtsService persistence helpers', () => {
  let service: TtsService;
  const jobs: TtsJob[] = [];
  const repo = {
    find: jest.fn(async ({ where }: { where?: { status?: unknown } } = {}) => {
      if (!where) return [...jobs];
      // simplified
      return jobs.filter((j) => j.status !== TtsJobStatus.COMPLETED);
    }),
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

  beforeEach(async () => {
    jobs.length = 0;
    const moduleRef = await Test.createTestingModule({
      providers: [
        TtsService,
        { provide: getRepositoryToken(TtsJob), useValue: repo },
        {
          provide: FfmpegService,
          useValue: {
            trimChunkSilence: jest.fn(),
            crossfadeChunks: jest.fn(),
            postProcessTts: jest.fn(),
            probe: jest.fn(),
            embedChapterMetadata: jest.fn(),
          },
        },
        {
          provide: JobsGateway,
          useValue: {
            emitProgress: jest.fn(),
            emitCompleted: jest.fn(),
            emitFailed: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => undefined) },
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
    expect(pub.id).toBe(j.id);
    expect(pub.downloadPath).toContain('/tts/jobs/');
  });

  it('getJob throws when missing', async () => {
    await expect(service.getJob('missing')).rejects.toThrow(/not found/);
  });

  it('listJobs returns page', async () => {
    const r = await service.listJobs({ page: 1, limit: 10 });
    expect(r.page).toBe(1);
    expect(Array.isArray(r.items)).toBe(true);
  });
});
