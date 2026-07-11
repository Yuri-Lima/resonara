import * as fs from 'fs';
import * as path from 'path';
import {
  listExpressiveVoices,
  isExpressiveAvailable,
  expressiveFallbackChain,
  EXPRESSIVE_MAX_CHARS,
  getExpressiveVersion,
  synthesizeWithExpressive,
} from './expressive-tts';

describe('expressive-tts adapter', () => {
  it('lists voices with capability flags when available', () => {
    const voices = listExpressiveVoices();
    if (isExpressiveAvailable()) {
      expect(voices.length).toBeGreaterThan(0);
      expect(voices[0].capabilities.emotionControl).toBe(true);
      expect(voices[0].engine).toBe('expressive');
    } else {
      expect(voices).toEqual([]);
    }
  });

  it('fallback chain order', () => {
    expect(expressiveFallbackChain()).toEqual([
      'expressive',
      'kokoro',
      'piper',
      'platform',
    ]);
  });

  it('max chars is practical for chunker', () => {
    expect(EXPRESSIVE_MAX_CHARS).toBeGreaterThan(100);
    expect(EXPRESSIVE_MAX_CHARS).toBeLessThan(1000);
  });

  it('getVersion reports availability', () => {
    const v = getExpressiveVersion();
    expect(typeof v.available).toBe('boolean');
    expect(typeof v.packReady).toBe('boolean');
  });

  it('refuses cloning without consent', async () => {
    if (!isExpressiveAvailable()) return;
    await expect(
      synthesizeWithExpressive({
        text: 'hi',
        outputPath: path.join(process.cwd(), 'bench', 'no-consent.wav'),
        referenceAudioPath: '/tmp/fake-ref.wav',
        cloneConsent: false,
      }),
    ).rejects.toThrow(/consent/i);
  });
});
