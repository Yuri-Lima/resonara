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
    findOne: jest.fn(
      async ({
        where,
      }: {
        where: { id?: string; word?: string; language?: string };
      }) => {
        if (where.id) return store.find((s) => s.id === where.id) || null;
        if (where.word != null) {
          return (
            store.find(
              (s) =>
                s.word === where.word &&
                (where.language == null || s.language === where.language),
            ) || null
          );
        }
        return null;
      },
    ),
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

  it('applies phoneme dictionary', async () => {
    await service.create({ word: 'tomato', phoneme: 'təˈmeɪtoʊ' });
    const out = await service.applyDictionary('A tomato', 'piper');
    expect(out).toMatch(/phoneme/);
  });

  it('exports and imports', async () => {
    await service.create({ word: 'tts', alias: 'text to speech' });
    const exp = await service.exportJson();
    store.length = 0;
    const r = await service.importJson(exp);
    expect(r.imported).toBe(1);
  });

  it('updates and removes entries', async () => {
    const created = await service.create({ word: 'CPU', alias: 'C P U' });
    const updated = await service.update(created.id, {
      alias: 'central processing unit',
    });
    expect(updated.alias).toContain('central');
    await service.remove(created.id);
    const list = await service.list();
    expect(list.find((x) => x.id === created.id)).toBeUndefined();
  });

  it('rejects create without phoneme or alias', async () => {
    await expect(service.create({ word: 'xyz' })).rejects.toThrow();
  });

  it('seeds on empty module init', async () => {
    await service.onModuleInit();
    expect(store.length).toBeGreaterThan(5);
  });

  it('filters dictionary by language (no cross-contamination)', async () => {
    await service.create({ word: 'sql', alias: 'sequel', language: 'en' });
    await service.create({ word: 'cpf', alias: 'C P F', language: 'pt-BR' });
    const en = await service.applyDictionary('Learn SQL and CPF', 'all', 'en');
    expect(en).toMatch(/sequel/i);
    expect(en).not.toMatch(/C P F/);
    const pt = await service.applyDictionary('Informe o CPF', 'all', 'pt-BR');
    expect(pt).toMatch(/C P F/);
    expect(pt).not.toMatch(/sequel/i);
  });
});
