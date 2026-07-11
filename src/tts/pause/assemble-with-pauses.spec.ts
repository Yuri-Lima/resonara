import {
  buildAssemblePlan,
  dialogueGapMs,
  flattenPlanForConcat,
  shouldTrimChunkEdge,
} from './assemble-with-pauses';
import { resolvePauseProfile } from './pause-profiles';
import { PauseMapEntry } from './pause.types';

const profile = resolvePauseProfile({ profile: 'audiobook' });

function entry(endsAt: PauseMapEntry['endsAt'], extra: Partial<PauseMapEntry> = {}): PauseMapEntry {
  return { endsAt, intraBoundaries: [], ...extra };
}

describe('assemble-with-pauses', () => {
  it('inserts silence at paragraph boundaries, not at forced', () => {
    const plan = buildAssemblePlan(
      [
        { path: 'a.wav', pause: entry('paragraph') },
        { path: 'b.wav', pause: entry('sentence') },
        { path: 'c.wav', pause: entry('forced') },
        { path: 'd.wav', pause: entry('document-end') },
      ],
      { profile, jitter: false, accountForEngineSentenceSilence: false },
    );
    const flat = flattenPlanForConcat(plan);
    const silences = flat.filter((x) => x.type === 'silence');
    expect(silences.length).toBeGreaterThanOrEqual(2);
    const para = silences.find((s) => s.type === 'silence' && s.boundary === 'paragraph');
    expect(para && para.type === 'silence' && para.sec).toBeGreaterThan(0.6);
  });

  it('SSML explicit break replaces profile', () => {
    const plan = buildAssemblePlan(
      [
        {
          path: 'a.wav',
          pause: entry('ssml-break', { explicitBreakMs: 800 }),
        },
        { path: 'b.wav', pause: entry('document-end') },
      ],
      { profile, jitter: false },
    );
    const flat = flattenPlanForConcat(plan);
    const sil = flat.find((x) => x.type === 'silence');
    expect(sil && sil.type === 'silence' && Math.round(sil.sec * 1000)).toBe(800);
  });

  it('accounts for engine sentence silence (delta only)', () => {
    const plan = buildAssemblePlan(
      [
        { path: 'a.wav', pause: entry('sentence') },
        { path: 'b.wav', pause: entry('document-end') },
      ],
      {
        profile,
        jitter: false,
        accountForEngineSentenceSilence: true,
      },
    );
    const flat = flattenPlanForConcat(plan);
    const sil = flat.find((x) => x.type === 'silence');
    // insertMs ~450, engine 450ms → delta ~0 (may omit silence)
    if (sil && sil.type === 'silence') {
      expect(sil.sec).toBeLessThan(0.2);
    }
  });

  it('shouldTrimChunkEdge keeps trailing on non-forced', () => {
    expect(shouldTrimChunkEdge(entry('paragraph'), 'trailing')).toBe(false);
    expect(shouldTrimChunkEdge(entry('forced'), 'trailing')).toBe(true);
    expect(shouldTrimChunkEdge(entry('sentence'), 'leading')).toBe(true);
  });

  it('dialogueGapMs uses profile', () => {
    expect(dialogueGapMs(profile)).toBe(profile.bands.dialogue.insertMs);
    expect(dialogueGapMs(profile, 'pt-BR')).toBe(
      profile.bands.dialogueAttrib.insertMs,
    );
  });

  it('inserts only pre-header when next chunk is a section header', () => {
    const plan = buildAssemblePlan(
      [
        { path: 'body.wav', pause: entry('paragraph') },
        {
          path: 'hdr.wav',
          pause: entry('header', { isHeader: true, headerLevel: 2 }),
        },
        { path: 'body2.wav', pause: entry('document-end') },
      ],
      { profile, jitter: false, accountForEngineSentenceSilence: false },
    );
    const flat = flattenPlanForConcat(plan);
    const silences = flat.filter((x) => x.type === 'silence');
    // body→header: pre-header only (not paragraph+pre-header)
    // header→body: header band
    expect(silences.length).toBe(2);
    expect(silences[0].type === 'silence' && silences[0].sec).toBeCloseTo(
      profile.bands.preHeader.insertMs / 1000,
      3,
    );
    expect(silences[1].type === 'silence' && silences[1].sec).toBeCloseTo(
      profile.bands.header.insertMs / 1000,
      3,
    );
  });
});
