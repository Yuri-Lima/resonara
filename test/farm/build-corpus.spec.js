/**
 * Unit tests for scripts/build-corpus.js
 * Run: npx jest --config jest.farm.config.js
 */
const {
  buildCorpus,
  generateSoakNovel,
  mulberry32,
  wordCount,
} = require('../../scripts/build-corpus');

describe('build-corpus manifest builder', () => {
  it('produces at least 24 non-soak documents', () => {
    const { manifest } = buildCorpus({ seed: 42, write: false, soakWords: 200 });
    expect(manifest.documentCount).toBeGreaterThanOrEqual(25);
    expect(manifest.nonSoakCount).toBeGreaterThanOrEqual(24);
  });

  it('tags languages correctly', () => {
    const { documents } = buildCorpus({ seed: 42, write: false, soakWords: 200 });
    const en = documents.filter((d) => d.language === 'en' && !d.soak);
    const pt = documents.filter((d) => d.language === 'pt-BR');
    expect(en.length).toBeGreaterThanOrEqual(10);
    expect(pt.length).toBeGreaterThanOrEqual(8);
    for (const d of documents) {
      if (d.id.startsWith('pt-')) expect(d.language).toBe('pt-BR');
      if (d.id.startsWith('en-')) expect(d.language).toBe('en');
    }
  });

  it('is deterministic from the seed', () => {
    const a = buildCorpus({ seed: 42, write: false, soakWords: 300 });
    const b = buildCorpus({ seed: 42, write: false, soakWords: 300 });
    const c = buildCorpus({ seed: 7, write: false, soakWords: 300 });
    const sig = (m) =>
      m.documents.map((d) => `${d.id}:${d.wordCount}:${d.contentType}`).join('|');
    expect(sig(a.manifest)).toBe(sig(b.manifest));
    expect(sig(a.manifest)).not.toBe(sig(c.manifest));
  });

  it('includes soak-novel with soak flag', () => {
    const { documents } = buildCorpus({ seed: 42, write: false, soakWords: 400 });
    const soak = documents.find((d) => d.id === 'soak-novel');
    expect(soak).toBeDefined();
    expect(soak.soak).toBe(true);
    expect(soak.language).toBe('en');
    expect(soak.wordCount).toBeGreaterThanOrEqual(400);
  });

  it('generateSoakNovel is seed-deterministic and near target', () => {
    const t1 = generateSoakNovel(42, 1000);
    const t2 = generateSoakNovel(42, 1000);
    expect(t1).toBe(t2);
    expect(wordCount(t1)).toBeGreaterThanOrEqual(1000);
    const t3 = generateSoakNovel(99, 1000);
    expect(t3).not.toBe(t1);
  });

  it('mulberry32 is stable', () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});
