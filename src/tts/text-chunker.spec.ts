import {
  chunkTextForTts,
  defaultChunkLimits,
  detectChapters,
  estimateWordCount,
  splitSentencesLanguageAware,
} from './text-chunker';

describe('chunkTextForTts', () => {
  it('returns empty for blank', () => {
    expect(chunkTextForTts('')).toEqual([]);
    expect(chunkTextForTts('   ')).toEqual([]);
  });

  it('keeps short text as one chunk', () => {
    const chunks = chunkTextForTts('Hello world.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('Hello');
  });

  it('splits long text under platform max', () => {
    const para = 'Sentence number. '.repeat(200);
    const chunks = chunkTextForTts(para, { engine: 'platform' });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.charCount).toBeLessThanOrEqual(2400);
    }
  });

  it('allows larger chunks for piper', () => {
    const limits = defaultChunkLimits('piper');
    expect(limits.maxChars).toBe(4000);
    const text = ('Word '.repeat(500) + '. ').repeat(5);
    const chunks = chunkTextForTts(text, { engine: 'piper' });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // Piper should produce fewer chunks than platform for same text
    const platform = chunkTextForTts(text, { engine: 'platform' });
    expect(chunks.length).toBeLessThanOrEqual(platform.length);
  });

  it('does not split inside SSML tags when possible', () => {
    const text =
      '<speak>Hello <emphasis level="strong">world</emphasis>.</speak>\n\n' +
      '<speak>Second paragraph with more words here.</speak>';
    const chunks = chunkTextForTts(text, { maxChars: 80, engine: 'platform' });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const c of chunks) {
      const opens = (c.text.match(/<emphasis/g) || []).length;
      const closes = (c.text.match(/<\/emphasis>/g) || []).length;
      // Best-effort: balanced when both present
      if (opens && closes) expect(opens).toBe(closes);
    }
  });
});

describe('estimateWordCount', () => {
  it('counts words', () => {
    expect(estimateWordCount('one two three')).toBe(3);
    expect(estimateWordCount('')).toBe(0);
  });
});

describe('detectChapters', () => {
  it('finds substantial H1 / Chapter markers', () => {
    const body = (n: string) =>
      `This is a substantial body for ${n}. `.repeat(50);
    const text = `# Introduction\n\n${body('intro')}\n\n# Chapter Two\n\n${body('two')}`;
    const ch = detectChapters(text);
    expect(ch.length).toBeGreaterThanOrEqual(2);
    expect(ch[0].title).toMatch(/Introduction/i);
  });

  it('collapses tiny micro-sections into a single body', () => {
    const text = '# Intro\n\nHello\n\n## Chapter Two\n\nWorld';
    const ch = detectChapters(text);
    expect(ch).toHaveLength(1);
    expect(ch[0].title).toBe('Body');
  });
});

describe('Portuguese chunking rules', () => {
  it('does not split on Sr. abbreviation', () => {
    const parts = splitSentencesLanguageAware(
      'O Sr. Silva e a Dra. Costa chegaram às 14h30. Depois foram embora.',
      'pt-BR',
    );
    expect(parts[0]).toMatch(/Sr\. Silva/);
    expect(parts.length).toBeGreaterThanOrEqual(2);
  });

  it('does not split Brazilian thousands separator', () => {
    const parts = splitSentencesLanguageAware(
      'O valor é R$ 1.234,56 por unidade. O total é maior.',
      'pt-BR',
    );
    expect(parts[0]).toMatch(/1\.234,56/);
  });
});
