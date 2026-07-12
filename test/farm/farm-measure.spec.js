const {
  aggregateRows,
  recommendDefaults,
  wordErrorRate,
  validateAudioHeader,
} = require('../../scripts/farm-measure');

describe('farm-measure aggregation math', () => {
  it('aggregates known WER/conformance rows', () => {
    const rows = [
      { status: 'measured', wer: 0.0, pauseConformance: 1.0, rtf: 1.0, validAudio: true, engine: 'piper', profile: 'audiobook', contentType: 'news' },
      { status: 'measured', wer: 0.2, pauseConformance: 0.8, rtf: 2.0, validAudio: true, engine: 'platform', profile: 'news', contentType: 'news' },
      { status: 'failed', validAudio: false },
    ];
    const a = aggregateRows(rows);
    expect(a.total).toBe(3);
    expect(a.measured).toBe(2);
    expect(a.failed).toBe(1);
    expect(a.meanWer).toBeCloseTo(0.1, 9);
    expect(a.meanConformance).toBeCloseTo(0.9, 9);
    expect(a.meanRtf).toBeCloseTo(1.5, 9);
    expect(a.invalidAudio).toBe(1);
  });

  it('recommendDefaults picks better engine for content type', () => {
    const rows = [
      { status: 'ok', wer: 0.05, pauseConformance: 0.95, rtf: 1.1, engine: 'piper', profile: 'audiobook', contentType: 'dialogue-script', language: 'en', id: '1', validAudio: true },
      { status: 'ok', wer: 0.3, pauseConformance: 0.7, rtf: 2.5, engine: 'platform', profile: 'news', contentType: 'dialogue-script', language: 'en', id: '2', validAudio: true },
    ];
    const rec = recommendDefaults(rows);
    expect(rec['dialogue-script'].engine).toBe('piper');
    expect(rec['dialogue-script'].profile).toBe('audiobook');
  });

  it('wordErrorRate basic', () => {
    expect(wordErrorRate('hello world', 'hello world')).toBe(0);
    expect(wordErrorRate('hello world', 'hello')).toBeCloseTo(0.5, 5);
  });

  it('validateAudioHeader detects WAV', () => {
    const wav = Buffer.alloc(44);
    wav.write('RIFF', 0);
    wav.write('WAVE', 8);
    expect(validateAudioHeader(wav)).toBe(true);
    expect(validateAudioHeader(Buffer.from('nope'))).toBe(false);
  });
});
