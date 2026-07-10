import {
  estimateWordTimestamps,
  groupSubtitles,
  toSrt,
  toWebVtt,
} from './timestamp-aligner';

describe('timestamp-aligner', () => {
  it('estimates proportional timestamps', () => {
    const words = estimateWordTimestamps('one two three', 3000);
    expect(words).toHaveLength(3);
    expect(words[0].startMs).toBe(0);
    expect(words[2].endMs).toBeGreaterThan(2000);
  });

  it('groups into subtitle cues', () => {
    const words = estimateWordTimestamps('a b c d e f g h i j k l', 12000);
    const cues = groupSubtitles(words, { maxWords: 5, maxChars: 20, minDurationMs: 100 });
    expect(cues.length).toBeGreaterThan(1);
    expect(cues[0].text.split(' ').length).toBeLessThanOrEqual(5);
  });

  it('formats VTT and SRT', () => {
    const words = estimateWordTimestamps('hello world', 2000);
    const cues = groupSubtitles(words, { minDurationMs: 100 });
    const vtt = toWebVtt(cues);
    const srt = toSrt(cues);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(srt).toContain('-->');
  });
});
