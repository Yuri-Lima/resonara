import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PronunciationEntry } from '../entities/pronunciation.entity';
import { PronunciationService } from './pronunciation.service';

describe('PronunciationService', () => {
  let service: PronunciationService;
  const store: PronunciationEntry[] = [];
  const repo = {
    count: jest.fn(async () => store.length),
    find: jest.fn(async () => [...store].sort((a, b) => a.word.localeCompare(b.word))),
    findOne: jest.fn(async ({ where }: { where: { id?: string; word?: string } }) => {
      if (where.id) return store.find((s) => s.id === where.id) || null;
      if (where.word) return store.find((s) => s.word === where.word) || null;
      return null;
    }),
    create: jest.fn((x: Partial<PronunciationEntry>) => ({
      id: x.id || `id-${store.length + 1}`,
      word: x.word || '',
      phoneme: x.phoneme ?? null,
      alias: x.alias ?? null,
      engine: x.engine || 'all',
      language: x.language || 'en',
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    save: jest.fn(async (e: PronunciationEntry) => {
      const i = store.findIndex((s) => s.id === e.id);
      if (i >= 0) store[i] = e;
      else store.push(e);
      return e;
    }),
    delete: jest.fn(async (id: string) => {
      const i = store.findIndex((s) => s.id === id);
      if (i < 0) return { affected: 0 };
      store.splice(i, 1);
      return { affected: 1 };
    }),
  };

  beforeEach(async () => {
    store.length = 0;
    const moduleRef = await Test.createTestingModule({
      providers: [
        PronunciationService,
        { provide: getRepositoryToken(PronunciationEntry), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(PronunciationService);
  });

  it('creates and lists entries', async () => {
    await service.create({ word: 'API', alias: 'A P I' });
    const list = await service.list();
    expect(list).toHaveLength(1);
    expect(list[0].word).toBe('api');
  });

  it('applies dictionary substitutions', async () => {
    await service.create({ word: 'SQL', alias: 'sequel' });
    const out = await service.applyDictionary('Learn SQL today', 'all');
    expect(out).toMatch(/sub alias="sequel"/i);
  });

  it('exports and imports', async () => {
    await service.create({ word: 'tts', alias: 'text to speech' });
    const exp = await service.exportJson();
    store.length = 0;
    const r = await service.importJson(exp);
    expect(r.imported).toBe(1);
  });
});
