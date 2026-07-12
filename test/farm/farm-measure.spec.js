const {
  aggregateRows,
  recommendDefaults,
  resolveActualEngine,
  applyActualEngine,
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

  describe('resolveActualEngine / byEngine keying', () => {
    it('prefers retryEngine over planned engine field', () => {
      expect(
        resolveActualEngine({
          id: 'en-numbers-and-dates__piper__audiobook',
          engine: 'piper',
          retryEngine: 'platform',
        }),
      ).toBe('platform');
    });

    it('prefers actualEngine over engine', () => {
      expect(
        resolveActualEngine({
          id: 'x__piper__y',
          engine: 'piper',
          actualEngine: 'platform',
        }),
      ).toBe('platform');
    });

    it('uses bare engine when no retry/actual override', () => {
      expect(resolveActualEngine({ id: 'x__piper__y', engine: 'piper' })).toBe('piper');
      expect(resolveActualEngine({ id: 'x__platform__y', engine: 'platform' })).toBe(
        'platform',
      );
    });

    it('never derives engine from job id when engine is platform', () => {
      // Regression: id says piper but render was platform — must NOT become piper.
      const job = {
        id: 'x__piper__y',
        engine: 'platform',
        status: 'measured',
        wer: 0.1,
        pauseConformance: 1,
        rtf: 0.2,
        validAudio: true,
        profile: 'audiobook',
        contentType: 'numbers-and-dates',
        language: 'en',
      };
      expect(resolveActualEngine(job)).toBe('platform');
      expect(applyActualEngine({ ...job }).engine).toBe('platform');
    });

    it('aggregates id=x__piper__y with engine=platform under platform, not piper', () => {
      // The G30 matrix defect: three platform-substituted WAVs kept piper cell ids
      // and were counted in byEngine.piper (n=18). Aggregator must key off actual engine.
      const rows = [
        {
          id: 'x__piper__y',
          status: 'measured',
          engine: 'platform',
          wer: 0.25,
          pauseConformance: 1,
          rtf: 0.12,
          validAudio: true,
          profile: 'audiobook',
          contentType: 'numbers-and-dates',
          language: 'en',
        },
        {
          id: 'real__piper__audiobook',
          status: 'measured',
          engine: 'piper',
          wer: 0.05,
          pauseConformance: 1,
          rtf: 0.4,
          validAudio: true,
          profile: 'audiobook',
          contentType: 'short-article',
          language: 'en',
        },
        {
          id: 'real__platform__news',
          status: 'measured',
          engine: 'platform',
          wer: 0.08,
          pauseConformance: 1,
          rtf: 0.1,
          validAudio: true,
          profile: 'news',
          contentType: 'news',
          language: 'en',
        },
        // log-style row: planned engine=piper, actual via retryEngine
        {
          id: 'en-numbers-and-dates__piper__news',
          status: 'measured',
          engine: 'piper',
          retryEngine: 'platform',
          retried: true,
          wer: 0.24,
          pauseConformance: 1,
          rtf: 0.08,
          validAudio: true,
          profile: 'news',
          contentType: 'numbers-and-dates',
          language: 'en',
        },
      ];
      const a = aggregateRows(rows);
      expect(a.byEngine.piper).toBeDefined();
      expect(a.byEngine.platform).toBeDefined();
      expect(a.byEngine.piper.n).toBe(1);
      expect(a.byEngine.platform.n).toBe(3);
      // id containing "piper" must not create a phantom piper bucket entry
      expect(a.byEngine.piper.meanWer).toBeCloseTo(0.05, 9);
    });
  });
});
