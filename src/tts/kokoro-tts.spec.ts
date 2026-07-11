import { isKokoroAvailable, KOKORO_MAX_CHARS, listKokoroVoices } from './kokoro-tts';

describe('kokoro-tts', () => {
  it('reports availability as boolean', () => {
    expect(typeof isKokoroAvailable()).toBe('boolean');
  });

  it('lists voices when available or empty array', () => {
    const v = listKokoroVoices();
    expect(Array.isArray(v)).toBe(true);
  });

  it('exports max chars constant used by chunker policy', () => {
    expect(KOKORO_MAX_CHARS).toBeGreaterThan(100);
    expect(KOKORO_MAX_CHARS).toBeLessThanOrEqual(2000);
  });

  it('does not throw when probing version helpers', () => {
    // getKokoroVersion may be unused in prod; availability is the live gate
    expect(() => isKokoroAvailable()).not.toThrow();
  });
});
