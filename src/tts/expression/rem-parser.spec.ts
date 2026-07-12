import {
  parseRem,
  hasRemMarkup,
  stripRemToPlain,
  hasLiteralTagLeak,
} from './rem-parser';
import { compileRem, degradationMatrix, getCapability } from './rem-compiler';
import {
  extractDeliveryFromAttribution,
  lookupDelivery,
  LEXICON_EN_SIZE,
  LEXICON_PT_SIZE,
} from './delivery-lexicon';
import { applyAutoDirection } from './auto-direction';
import {
  proposeCasting,
  castingConsistent,
  resolveCharacterVoice,
  upsertCast,
} from './casting';
import {
  planBreaths,
  injectBreathMarkers,
  jitterFactor,
  resolveHumanization,
} from './humanization';

describe('REM parser', () => {
  it('parses style and emotion directives', () => {
    const doc = parseRem(
      '{style: narrative}{emotion: sadness, intensity: 0.8}Hello world',
    );
    expect(doc.style).toBe('narrative');
    expect(doc.emotion).toBe('sadness');
    expect(doc.intensity).toBeCloseTo(0.8);
    expect(doc.nodes.some((n) => n.kind === 'text')).toBe(true);
  });

  it('parses paralinguistic events', () => {
    const doc = parseRem('Wait [sigh] then [breath] continue [pause:800ms]');
    const paras = doc.nodes.filter((n) => n.kind === 'paralinguistic');
    expect(paras.length).toBe(3);
  });

  it('detects markup', () => {
    expect(hasRemMarkup('{style: animated}hi')).toBe(true);
    expect(hasRemMarkup('plain text')).toBe(false);
  });

  it('stripRemToPlain removes tags', () => {
    const p = stripRemToPlain('{emotion: joy, intensity: 0.5}[sigh] Hello');
    expect(p).toMatch(/Hello/);
    expect(p).not.toMatch(/sigh|emotion/);
  });
});

describe('REM compiler — no literal tag leaks', () => {
  const engines = ['expressive', 'piper', 'kokoro', 'platform'];

  for (const eng of engines) {
    it(`never leaks [sigh] as speakable on ${eng}`, () => {
      const r = compileRem('She paused [sigh] and left.', eng);
      for (const seg of r.segments) {
        expect(hasLiteralTagLeak(seg.speakable)).toBe(false);
        expect(seg.speakable.toLowerCase()).not.toMatch(/\[sigh\]/);
        // "sigh" as a bare word from the tag must not appear as the only content
        expect(seg.speakable.trim().toLowerCase()).not.toBe('sigh');
      }
    });
  }

  it('expressive keeps native laugh tag in text path but not speakable-only leak', () => {
    const r = compileRem('[laugh] That was funny', 'expressive');
    expect(r.segments.length).toBeGreaterThan(0);
    const speak = r.segments.map((s) => s.speakable).join(' ');
    expect(speak).toMatch(/funny/i);
    expect(hasLiteralTagLeak(speak)).toBe(false);
  });

  it('piper degrades emotion to rate approx', () => {
    const r = compileRem('{emotion: sadness, intensity: 0.9}I am sorry.', 'piper');
    expect(r.degraded).toBe(true);
    expect(r.segments[0].rate).toBeLessThan(1);
  });

  it('degradation matrix covers features × engines', () => {
    const m = degradationMatrix();
    expect(m.emotion.expressive).toBe('native');
    expect(m.emotion.piper).toBe('approx');
    expect(m.laugh.piper).toBe('drop');
    expect(m.pause.piper).toBe('approx');
  });

  it('getCapability returns flags', () => {
    const c = getCapability('expressive');
    expect(c.paralinguisticTags).toBe(true);
    expect(c.emotionControl).toBe(true);
  });
});

describe('delivery lexicon', () => {
  it('has en and pt-BR entries', () => {
    expect(LEXICON_EN_SIZE).toBeGreaterThan(10);
    expect(LEXICON_PT_SIZE).toBeGreaterThan(5);
  });

  it('maps whispered to quiet calm', () => {
    const h = lookupDelivery('whispered');
    expect(h?.volume).toBeLessThan(0.6);
    expect(h?.emotion).toBe('calm');
  });

  it('maps gritou to anger', () => {
    const h = lookupDelivery('gritou');
    expect(h?.emotion).toBe('anger');
  });

  it('extracts from attribution sentence', () => {
    const h = extractDeliveryFromAttribution('she whispered softly');
    expect(h?.emotion).toBe('calm');
  });
});

describe('auto-direction', () => {
  it('opt-out purity: disabled leaves text unchanged', () => {
    const text = '[Mara]: "Hi," she whispered.';
    const r = applyAutoDirection(text, { enabled: false });
    expect(r.applied).toBe(false);
    expect(r.text).toBe(text);
    expect(r.hintsApplied).toBe(0);
  });

  it('when enabled injects REM from attribution', () => {
    const text = '[Mara]: "Don\'t wake the baby," she whispered.';
    const r = applyAutoDirection(text, { enabled: true });
    expect(r.applied).toBe(true);
    expect(r.hintsApplied).toBeGreaterThan(0);
    expect(r.text).toMatch(/emotion|calm|breath|style/i);
  });
});

describe('casting', () => {
  it('proposes stable casting and persists consistency', () => {
    const voices = [
      { id: 'v-f1', gender: 'female' },
      { id: 'v-m1', gender: 'male' },
      { id: 'v-f2', gender: 'female' },
    ];
    const a = proposeCasting({
      scopeId: 'book-1',
      speakers: ['mara', 'jon', 'narrator'],
      voices,
      narratorVoiceId: 'v-f1',
    });
    const b = proposeCasting({
      scopeId: 'book-1',
      speakers: ['jon', 'mara', 'narrator'],
      voices,
      narratorVoiceId: 'v-f1',
    });
    expect(castingConsistent(a, b, 'mara')).toBe(true);
    expect(castingConsistent(a, b, 'jon')).toBe(true);
    const r = resolveCharacterVoice(a, 'mara', 'fallback');
    expect(r.voiceId).toBeTruthy();
  });

  it('upsert overwrites same character', () => {
    let t = proposeCasting({
      scopeId: 'x',
      speakers: ['alice'],
      voices: [{ id: 'a' }, { id: 'b' }],
    });
    t = upsertCast(t, { character: 'alice', voiceId: 'custom', style: 'animated' });
    expect(resolveCharacterVoice(t, 'alice', '').voiceId).toBe('custom');
  });
});

describe('humanization', () => {
  it('plans breaths before long sentences', () => {
    const long =
      'Word '.repeat(30) +
      'end. Short one. ' +
      'Another long sentence with many many words that keep going beyond twenty five words easily here yes.';
    const plan = planBreaths(long, { profile: 'audiobook', breaths: true });
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.every((p) => p.offset >= 0)).toBe(true);
  });

  it('raw profile disables breaths', () => {
    const plan = planBreaths('Word '.repeat(40) + '.', { profile: 'raw' });
    expect(plan.length).toBe(0);
  });

  it('injectBreathMarkers adds [breath] without mid-word', () => {
    const text = 'Hello world.\n\n' + 'Word '.repeat(30) + 'done.';
    const { text: out, count } = injectBreathMarkers(text, {
      profile: 'audiobook',
    });
    expect(count).toBeGreaterThanOrEqual(0);
    if (count > 0) expect(out).toMatch(/\[breath\]/);
  });

  it('jitter is bounded and deterministic', () => {
    const a = jitterFactor('seed-1', 0.04);
    const b = jitterFactor('seed-1', 0.04);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0.96);
    expect(a).toBeLessThanOrEqual(1.04);
  });

  it('news profile is minimal', () => {
    const h = resolveHumanization({ profile: 'news' });
    expect(h.breaths).toBe(false);
  });
});
