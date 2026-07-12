const { evaluate } = require('../../scripts/farm-gate');

describe('farm-gate', () => {
  it('GO when aggregates within thresholds', () => {
    const r = evaluate({
      aggregates: {
        total: 10,
        failed: 0,
        meanWer: 0.1,
        meanConformance: 0.95,
        meanRtf: 1.5,
        invalidAudio: 0,
      },
    });
    expect(r.verdict).toBe('GO');
  });

  it('NO-GO on high WER', () => {
    const r = evaluate({
      aggregates: {
        total: 10,
        failed: 0,
        meanWer: 0.9,
        meanConformance: 0.95,
        meanRtf: 1.5,
        invalidAudio: 0,
      },
    });
    expect(r.verdict).toBe('NO-GO');
    expect(r.findings.some((f) => f.code === 'WER')).toBe(true);
  });
});
