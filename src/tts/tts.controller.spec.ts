import { Test } from '@nestjs/testing';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';
import { PronunciationService } from './pronunciation.service';
import { TtsJobStatus } from '../entities/tts-job.entity';

describe('TtsController', () => {
  let ctrl: TtsController;
  const tts = {
    voices: jest.fn(() => [{ id: 'platform:Alex', name: 'Alex', engine: 'platform' }]),
    engineStatus: jest.fn(() => ({ engines: [{ id: 'platform', available: true }] })),
    startLongForm: jest.fn(async () => ({ id: 'j1', status: TtsJobStatus.QUEUED })),
    toPublicJob: jest.fn((j) => ({ ...j, public: true })),
    getJob: jest.fn(async (id) => ({ id, status: TtsJobStatus.COMPLETED })),
    listJobs: jest.fn(async () => ({
      items: [{ id: 'j1', status: TtsJobStatus.COMPLETED }],
      total: 1,
      page: 1,
      limit: 20,
    })),
    deleteJob: jest.fn(async () => undefined),
    retryJob: jest.fn(async (id) => ({ id, status: TtsJobStatus.QUEUED })),
    resynthesizeChunk: jest.fn(async (id) => ({ id, status: TtsJobStatus.COMPLETED })),
    getSubtitles: jest.fn(async () => ({ content: 'WEBVTT\n', contentType: 'text/vtt' })),
    models: jest.fn(() => []),
    modelDiskUsage: jest.fn(() => ({ totalBytes: 0, models: [] })),
    downloadModel: jest.fn(async () => ({ path: '/m.onnx' })),
    deleteModel: jest.fn(() => ({ ok: true })),
    startBatch: jest.fn(async () => ({
      batch: { id: 'b1', status: 'queued', totalJobs: 1 },
      jobs: [],
    })),
    listBatches: jest.fn(async () => []),
    getBatch: jest.fn(async (id) => ({ batch: { id }, jobs: [] })),
    getChapters: jest.fn(async () => [{ index: 0, title: 'Ch1', startTime: 0, endTime: 1, wordCount: 10 }]),
    resolveDownload: jest.fn(async () => '/tmp/out.wav'),
    resolveChapterDownload: jest.fn(async () => '/tmp/ch.wav'),
  };
  const pronunciation = {
    list: jest.fn(async () => [{ word: 'api' }]),
    create: jest.fn(async (b) => b),
    update: jest.fn(async (id, b) => ({ id, ...b })),
    remove: jest.fn(async () => undefined),
    importJson: jest.fn(async () => ({ imported: 1 })),
    exportJson: jest.fn(async () => [{ word: 'api', alias: 'A P I' }]),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TtsController],
      providers: [
        { provide: TtsService, useValue: tts },
        { provide: PronunciationService, useValue: pronunciation },
      ],
    }).compile();
    ctrl = moduleRef.get(TtsController);
  });

  it('voices returns list', () => {
    expect(ctrl.voices().voices.length).toBe(1);
  });

  it('engines endpoint', () => {
    expect(ctrl.engines().engines.length).toBe(1);
    expect(ctrl.engine().engines.length).toBe(1);
  });

  it('synthesize requires text', async () => {
    await expect(ctrl.synthesize({} as never)).rejects.toThrow(/text/i);
  });

  it('synthesize starts job', async () => {
    const r = await ctrl.synthesize({ text: 'Hello world' });
    expect(tts.startLongForm).toHaveBeenCalled();
    expect(r).toBeDefined();
  });

  it('jobs list and get', async () => {
    const list = await ctrl.jobs();
    expect(list.total).toBe(1);
    const one = await ctrl.job('j1');
    expect(one).toBeDefined();
  });

  it('delete job', async () => {
    await ctrl.deleteJob('j1');
    expect(tts.deleteJob).toHaveBeenCalledWith('j1');
  });

  it('chapters', async () => {
    const r = await ctrl.chapters('j1');
    expect(r.chapters.length).toBe(1);
  });

  it('dictionary CRUD', async () => {
    await ctrl.dictionary();
    await ctrl.addWord({ word: 'x', alias: 'ex' });
    await ctrl.updateWord('1', { alias: 'y' });
    await ctrl.removeWord('1');
    await ctrl.importDict({ entries: [{ word: 'a', alias: 'b' }] });
    await ctrl.exportDict();
    expect(pronunciation.exportJson).toHaveBeenCalled();
  });

  it('ssml reference', () => {
    expect(ctrl.ssmlReference().elements.length).toBeGreaterThan(0);
  });

  it('preview', async () => {
    await ctrl.preview({ voice: 'Alex' });
    expect(tts.startLongForm).toHaveBeenCalled();
  });
});
