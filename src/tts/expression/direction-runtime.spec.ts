import { compileRem } from './rem-compiler';
import {
  buildExpressionRuntime,
  expressionAudioFilter,
  shouldApplyDirectedFilter,
  emotionToAffect,
  directedAudioFilter,
} from './direction-runtime';

describe('direction-runtime (product path)', () => {
  it('threads user exaggeration instead of forcing 0.55', () => {
    const rt = buildExpressionRuntime({
      engine: 'expressive',
      plainText: 'Hello there.',
      exaggeration: 0.82,
      humanize: true,
      styleProfile: 'drama',
    });
    expect(rt.exaggeration).toBeCloseTo(0.82);
    expect(rt.humanize).toBe(true);
    expect(rt.affect).toBe('joy'); // animated style
  });

  it('aggregates REM emotion into exaggeration + affect', () => {
    const src =
      '{style: narrative}{emotion: sadness, intensity: 0.9}He whispered goodbye.';
    const compiled = compileRem(src, 'expressive');
    const rt = buildExpressionRuntime({
      engine: 'expressive',
      plainText: src,
      humanize: true,
      compiled,
    });
    expect(rt.directed).toBe(true);
    expect(rt.exaggeration).toBeGreaterThan(0.4);
    expect(rt.affect).toBe('grief');
    // expressive keeps engine text (may include tags / speakable)
    expect(rt.engineText.toLowerCase()).toMatch(/whispered|goodbye/);
    expect(rt.speakableText).not.toMatch(/\{emotion/);
  });

  it('multiControl when segments differ in affect', () => {
    const src =
      '{emotion: sadness, intensity: 0.9}Dark night. {emotion: joy, intensity: 0.8}Bright morning.';
    const compiled = compileRem(src, 'expressive');
    const rt = buildExpressionRuntime({
      engine: 'expressive',
      plainText: src,
      humanize: true,
      compiled,
    });
    expect(rt.segments.length).toBeGreaterThanOrEqual(2);
    expect(rt.multiControl).toBe(true);
    const affects = new Set(rt.segments.map((s) => s.affect));
    expect(affects.has('grief')).toBe(true);
    expect(affects.has('joy')).toBe(true);
  });

  it('user exaggeration overrides REM aggregate', () => {
    const src = '{emotion: calm, intensity: 0.2}Steady.';
    const compiled = compileRem(src, 'expressive');
    const rt = buildExpressionRuntime({
      engine: 'expressive',
      plainText: src,
      exaggeration: 0.91,
      compiled,
    });
    expect(rt.exaggeration).toBeCloseTo(0.91);
  });

  it('non-expressive gets speakable-only engine text path via speakableText', () => {
    const src = '{emotion: joy, intensity: 0.5}[laugh] Hello';
    const compiled = compileRem(src, 'piper');
    const rt = buildExpressionRuntime({
      engine: 'piper',
      plainText: src,
      compiled,
    });
    expect(rt.speakableText).not.toMatch(/\[laugh\]/);
    expect(rt.speakableText.toLowerCase()).toMatch(/hello/);
  });

  it('expressionAudioFilter only when humanize', () => {
    expect(
      expressionAudioFilter({ humanize: false, affect: 'grief' }),
    ).toBeNull();
    expect(shouldApplyDirectedFilter({ humanize: true, affect: 'grief' })).toBe(
      true,
    );
    const af = expressionAudioFilter({ humanize: true, affect: 'grief' });
    expect(af).toMatch(/asetrate/);
    expect(af).toMatch(/0\.92/);
  });

  it('emotionToAffect + directedAudioFilter match Gate-2 filter family', () => {
    expect(emotionToAffect('sadness', 'narrative')).toBe('grief');
    expect(emotionToAffect('joy', 'animated')).toBe('joy');
    expect(emotionToAffect('neutral', 'newscast')).toBe('news');
    expect(directedAudioFilter('grief')).toContain('asetrate=24000*0.92');
    expect(directedAudioFilter('joy')).toContain('asetrate=24000*1.07');
  });
});
