import { chunkTextForTts, estimateWordCount } from './text-chunker';

describe('chunkTextForTts', () => {
  it('returns empty for blank input', () => {
    expect(chunkTextForTts('')).toEqual([]);
    expect(chunkTextForTts('   \n\n  ')).toEqual([]);
  });

  it('returns single chunk for short text', () => {
    const chunks = chunkTextForTts('Hello world.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('Hello world.');
    expect(chunks[0].index).toBe(0);
  });

  it('splits multi-paragraph long text into multiple chunks', () => {
    const para = 'This is a sentence about sound. '.repeat(40);
    const text = Array.from({ length: 8 }, (_, i) => `Section ${i}. ${para}`).join(
      '\n\n',
    );
    const chunks = chunkTextForTts(text, { maxChars: 500, hardMaxChars: 700 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.charCount <= 700)).toBe(true);
    // Reassembly preserves content words
    const joined = chunks.map((c) => c.text).join(' ');
    expect(joined).toContain('Section 0');
    expect(joined).toContain('Section 7');
    expect(estimateWordCount(text)).toBeGreaterThan(100);
  });

  it('handles 10k+ word documents with multiple chunks', () => {
    const sentence =
      'Resonara shapes sound, speaks the long form, and plays freely on the desktop. ';
    // ~12 words per sentence; need ~1000 sentences for 10k+ words
    const text = sentence.repeat(900);
    expect(estimateWordCount(text)).toBeGreaterThan(10_000);
    const chunks = chunkTextForTts(text, { maxChars: 1800 });
    expect(chunks.length).toBeGreaterThan(5);
    const totalChars = chunks.reduce((a, c) => a + c.charCount, 0);
    expect(totalChars).toBeGreaterThan(text.length * 0.9);
  });

  it('force-splits oversized tokens without hanging', () => {
    const monster = 'A'.repeat(5000);
    const chunks = chunkTextForTts(monster, { maxChars: 100, hardMaxChars: 200 });
    expect(chunks.length).toBeGreaterThan(10);
    expect(chunks.every((c) => c.charCount <= 200)).toBe(true);
  });
});
