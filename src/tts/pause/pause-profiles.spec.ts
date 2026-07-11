import {
  AUDIOBOOK_PROFILE,
  NEWS_PROFILE,
  PODCAST_PROFILE,
  boundaryToBandKey,
  jitteredInsertMs,
  listPauseProfiles,
  resolvePauseProfile,
} from './pause-profiles';
import { inBand } from './pause.types';

describe('pause profiles', () => {
  it('ships three presets', () => {
    const names = listPauseProfiles().map((p) => p.name);
    expect(names).toEqual(['audiobook', 'podcast', 'news']);
  });

  it('podcast is ~20% tighter than audiobook', () => {
    expect(PODCAST_PROFILE.bands.paragraph.insertMs).toBeLessThan(
      AUDIOBOOK_PROFILE.bands.paragraph.insertMs,
    );
    expect(PODCAST_PROFILE.bands.paragraph.insertMs).toBeGreaterThan(
      AUDIOBOOK_PROFILE.bands.paragraph.insertMs * 0.7,
    );
  });

  it('news is tighter than podcast', () => {
    expect(NEWS_PROFILE.bands.sentence.insertMs).toBeLessThan(
      PODCAST_PROFILE.bands.sentence.insertMs,
    );
  });

  it('pt-BR overrides travessão / dialogue', () => {
    const en = resolvePauseProfile({ profile: 'audiobook', language: 'en' });
    const pt = resolvePauseProfile({ profile: 'audiobook', language: 'pt-BR' });
    expect(pt.bands.emDash.insertMs).toBeGreaterThanOrEqual(
      en.bands.emDash.insertMs,
    );
    expect(pt.bands.dialogueAttrib.insertMs).toBeGreaterThanOrEqual(
      en.bands.dialogue.insertMs,
    );
  });

  it('custom overrides insertMs', () => {
    const p = resolvePauseProfile({
      profile: 'custom',
      custom: { paragraph: 900 },
    });
    expect(p.bands.paragraph.insertMs).toBe(900);
  });

  it('boundaryToBandKey maps endsAt', () => {
    expect(boundaryToBandKey('paragraph')).toBe('paragraph');
    expect(boundaryToBandKey('forced')).toBeNull();
    expect(boundaryToBandKey('ssml-break')).toBeNull();
  });

  it('jitter stays inside band', () => {
    const b = AUDIOBOOK_PROFILE.bands.sentence;
    for (let i = 0; i < 50; i++) {
      const ms = jitteredInsertMs(b, 0.1, () => Math.random());
      expect(ms).toBeGreaterThanOrEqual(b.minMs);
      expect(ms).toBeLessThanOrEqual(b.maxMs);
    }
  });

  it('inBand contract helper', () => {
    const b = AUDIOBOOK_PROFILE.bands.paragraph;
    expect(inBand(b.insertMs, b)).toBe(true);
    expect(inBand(10, b)).toBe(false);
  });
});
