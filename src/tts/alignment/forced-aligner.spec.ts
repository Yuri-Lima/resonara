import {
  forcedAlign,
  mergeChunkAlignments,
  wordIndexAtTime,
  groupSentences,
} from './forced-aligner';

describe('forcedAlign', () => {
  it('exact match anchors all words', () => {
    const src = 'hello world again';
    const wh = [
      { word: 'hello', startMs: 0, endMs: 100 },
      { word: 'world', startMs: 100, endMs: 200 },
      { word: 'again', startMs: 200, endMs: 300 },
    ];
    const a = forcedAlign(src, wh);
    expect(a.every((w) => w.confidence === 'anchored')).toBe(true);
    expect(a[1].startMs).toBe(100);
  });

  it('interpolates missing whisper words', () => {
    const src = 'one two three four';
    const wh = [
      { word: 'one', startMs: 0, endMs: 100 },
      { word: 'four', startMs: 300, endMs: 400 },
    ];
    const a = forcedAlign(src, wh);
    expect(a[0].confidence).toBe('anchored');
    expect(a[3].confidence).toBe('anchored');
    expect(a[1].confidence).toBe('interpolated');
    expect(a[1].startMs).toBeGreaterThanOrEqual(100);
    expect(a[1].endMs).toBeLessThanOrEqual(300);
  });

  it('mergeChunkAlignments applies offsets', () => {
    const m = mergeChunkAlignments([
      {
        offsetMs: 1000,
        words: [{ word: 'a', startMs: 10, endMs: 20, confidence: 'anchored' }],
      },
    ]);
    expect(m[0].startMs).toBe(1010);
  });

  it('wordIndexAtTime binary search', () => {
    const words = [
      { word: 'a', startMs: 0, endMs: 100, confidence: 'anchored' as const },
      { word: 'b', startMs: 100, endMs: 200, confidence: 'anchored' as const },
      { word: 'c', startMs: 200, endMs: 300, confidence: 'anchored' as const },
    ];
    expect(wordIndexAtTime(words, 150)).toBe(1);
    expect(wordIndexAtTime(words, 0)).toBe(0);
  });

  it('groupSentences', () => {
    const words = ['Hello', 'world.', 'Next', 'line!'].map((word, i) => ({
      word,
      startMs: i * 100,
      endMs: i * 100 + 90,
      confidence: 'anchored' as const,
    }));
    const g = groupSentences(words);
    expect(g.length).toBe(2);
  });
});
