import { planMicroPauseSegments } from './micro-pauses';
import { resolvePauseProfile } from './pause-profiles';

const profile = resolvePauseProfile({ profile: 'audiobook' });

describe('planMicroPauseSegments', () => {
  it('returns single segment without punctuation', () => {
    const s = planMicroPauseSegments('Hello world', profile);
    expect(s).toHaveLength(1);
    expect(s[0].gapAfterMs).toBe(0);
  });

  it('splits on commas with gap', () => {
    const s = planMicroPauseSegments('One, two, three.', profile);
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(s[0].gapAfterMs).toBe(profile.bands.comma.insertMs);
    expect(s[s.length - 1].gapAfterMs).toBe(0);
  });

  it('handles em-dash', () => {
    const s = planMicroPauseSegments('After the storm — which lasted — done.', profile);
    expect(s.some((x) => x.gapAfterMs === profile.bands.emDash.insertMs)).toBe(true);
  });

  it('splits on sentence terminators with sentence gap', () => {
    const s = planMicroPauseSegments('First sentence. Second sentence! Third?', profile);
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(s.some((x) => x.gapAfterMs === profile.bands.sentence.insertMs)).toBe(true);
    expect(s[s.length - 1].gapAfterMs).toBe(0);
  });
});
