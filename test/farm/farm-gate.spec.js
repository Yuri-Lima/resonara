const { evaluate } = require('../../scripts/farm-gate');

describe('farm-gate', () => {
  it('GO when measured WER + real pause within thresholds', () => {
    const r = evaluate({
      aggregates: {
        total: 10,
        failed: 0,
        meanWer: 0.1,
        meanWerMeasured: 0.1,
        measuredWerCount: 10,
        proxyWerCount: 0,
        meanConformance: 0.95,
        meanConformanceReal: 0.95,
        realPauseCount: 10,
        proxyPauseCount: 0,
        meanRtf: 1.5,
        invalidAudio: 0,
      },
      rows: [
        {
          status: 'measured',
          wer: 0.1,
          werIsProxy: false,
          pauseConformance: 0.95,
          pauseIsProxy: false,
          method: { wer: 'faster-whisper-tiny', pause: 'pause-probe-profile-band' },
        },
      ],
    });
    expect(r.verdict).toBe('GO');
  });

  it('NO-GO on high measured WER', () => {
    const r = evaluate({
      aggregates: {
        total: 10,
        failed: 0,
        meanWer: 0.9,
        meanWerMeasured: 0.9,
        measuredWerCount: 10,
        proxyWerCount: 0,
        meanConformance: 0.95,
        meanConformanceReal: 0.95,
        realPauseCount: 10,
        proxyPauseCount: 0,
        meanRtf: 1.5,
        invalidAudio: 0,
      },
      rows: [
        {
          status: 'measured',
          id: 'x',
          wer: 0.9,
          werIsProxy: false,
          pauseConformance: 0.95,
          method: { pause: 'pause-probe-profile-band' },
        },
      ],
    });
    expect(r.verdict).toBe('NO-GO');
    expect(r.findings.some((f) => f.code === 'WER' || f.code === 'WER_CELL_BREACH')).toBe(true);
  });

  it('NO-GO when WER is proxy-only (cannot clear floor)', () => {
    const r = evaluate({
      aggregates: {
        total: 2,
        failed: 0,
        meanWer: 0.1,
        meanWerMeasured: null,
        measuredWerCount: 0,
        proxyWerCount: 2,
        meanConformance: 1,
        meanConformanceReal: 1,
        realPauseCount: 2,
        proxyPauseCount: 0,
        meanRtf: 0.3,
        invalidAudio: 0,
      },
      rows: [
        {
          status: 'measured',
          wer: 0.1,
          werIsProxy: true,
          method: { wer: 'duration-density-proxy', pause: 'pause-probe-profile-band' },
          pauseConformance: 1,
        },
      ],
    });
    expect(r.verdict).toBe('NO-GO');
    expect(r.findings.some((f) => f.code === 'WER_PROXY_ONLY')).toBe(true);
  });

  it('NO-GO when pause is silencedetect proxy only', () => {
    const r = evaluate({
      aggregates: {
        total: 2,
        failed: 0,
        meanWer: 0.1,
        meanWerMeasured: 0.1,
        measuredWerCount: 2,
        proxyWerCount: 0,
        meanConformance: 1,
        realPauseCount: 0,
        proxyPauseCount: 2,
        meanRtf: 0.3,
        invalidAudio: 0,
      },
      rows: [
        {
          status: 'measured',
          wer: 0.1,
          werIsProxy: false,
          pauseConformance: 1,
          method: { wer: 'faster-whisper-tiny', pause: 'ffmpeg-silencedetect' },
        },
      ],
    });
    expect(r.verdict).toBe('NO-GO');
    expect(r.findings.some((f) => f.code === 'PAUSE_PROXY_ONLY')).toBe(true);
  });
});
