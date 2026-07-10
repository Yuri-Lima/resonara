import { SynthesisQaService } from './synthesis-qa.service';

describe('SynthesisQaService', () => {
  const svc = new SynthesisQaService();

  it('sample mode picks every 3rd chunk', () => {
    expect(svc.shouldSample(0, 'sample')).toBe(true);
    expect(svc.shouldSample(1, 'sample')).toBe(false);
    expect(svc.shouldSample(3, 'sample')).toBe(true);
    expect(svc.shouldSample(2, 'full')).toBe(true);
    expect(svc.shouldSample(0, 'off')).toBe(false);
  });

  it('aggregate weights by reference tokens', () => {
    const summary = svc.aggregate(
      [
        {
          chunkIndex: 0,
          wer: 0.1,
          transcript: 'a',
          missing: [],
          inserted: [],
          qaFailed: false,
          retried: false,
          referenceTokens: 10,
        },
        {
          chunkIndex: 1,
          wer: 0.5,
          transcript: 'b',
          missing: [],
          inserted: [],
          qaFailed: true,
          retried: true,
          referenceTokens: 2,
        },
      ],
      'full',
      0.1,
    );
    // (0.1*10 + 0.5*2) / 12 = 2/12 ≈ 0.1667
    expect(summary.aggregateWer).toBeCloseTo(2 / 12);
    expect(summary.failedCount).toBe(1);
    expect(summary.sampledCount).toBe(2);
  });

  it('empty aggregate is zero', () => {
    expect(svc.aggregate([], 'full').aggregateWer).toBe(0);
  });
});
