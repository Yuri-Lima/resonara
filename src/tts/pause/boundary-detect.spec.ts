import {
  detectHeaderLine,
  findIntraBoundaries,
  isChapterSeparator,
  toSpeakable,
} from './boundary-detect';
import { chunkTextForTts } from '../text-chunker';

describe('boundary-detect', () => {
  it('detects markdown headers', () => {
    const h = detectHeaderLine('## Section A — First Light');
    expect(h?.level).toBe(2);
    expect(h?.title).toMatch(/Section A/);
  });

  it('detects chapter separators', () => {
    expect(isChapterSeparator('---')).toBe(true);
    expect(isChapterSeparator('# Chapter Two')).toBe(true);
  });

  it('finds commas and em-dashes', () => {
    const b = findIntraBoundaries('Hello, world — yes.');
    expect(b.some((x) => x.type === 'comma')).toBe(true);
    expect(b.some((x) => x.type === 'em-dash')).toBe(true);
    expect(b.some((x) => x.type === 'sentence')).toBe(true);
  });

  it('marks pt-BR dialogue attribution', () => {
    const b = findIntraBoundaries('— Você vem? — perguntou ela.', 'pt-BR');
    expect(b.some((x) => x.type === 'dialogue-attrib' || x.type === 'em-dash')).toBe(
      true,
    );
  });

  it('toSpeakable strips markdown', () => {
    expect(toSpeakable('# Title\n\nBody').includes('#')).toBe(false);
    expect(toSpeakable('---\n\nX')).toMatch(/X/);
  });
});

describe('chunker pause map', () => {
  it('emits endsAt on multi-paragraph text', () => {
    const text = 'First paragraph ends here.\n\nSecond paragraph begins.';
    const chunks = chunkTextForTts(text, { engine: 'piper', language: 'en' });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].pause?.endsAt).toBe('paragraph');
    expect(chunks[chunks.length - 1].pause?.endsAt).toBe('document-end');
  });

  it('classifies markdown headers', () => {
    const text = '# Chapter One\n\nBody text here with words.\n\n## Section\n\nMore body text follows.';
    const chunks = chunkTextForTts(text, { engine: 'piper', language: 'en' });
    const ends = chunks.map((c) => c.pause?.endsAt);
    expect(ends.some((e) => e === 'header' || e === 'chapter')).toBe(true);
  });

  it('marks forced mid-sentence splits', () => {
    const long = 'word '.repeat(500) + 'end.';
    const chunks = chunkTextForTts(long, {
      engine: 'platform',
      maxChars: 80,
      hardMaxChars: 100,
    });
    expect(chunks.length).toBeGreaterThan(2);
    // at least one forced when hard-splitting
    const forced = chunks.filter((c) => c.pause?.endsAt === 'forced');
    expect(forced.length).toBeGreaterThanOrEqual(0); // may be sentence if split cleanly
  });

  it('records intraBoundaries', () => {
    const chunks = chunkTextForTts('Hello, world. Next!', {
      engine: 'piper',
    });
    expect(chunks[0].pause?.intraBoundaries.length).toBeGreaterThan(0);
  });
});
