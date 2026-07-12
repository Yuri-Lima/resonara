/**
 * Product-path expression runtime: turn REM compile + job options into
 * real synth controls (exaggeration, affect filter) — not dead scaffolding.
 */
import type { CompileResult, CompiledSegment, RemEmotion, RemStyle } from './rem.types';
import { directedAudioFilter, emotionToAffect } from './humanization';

export type DirectedAffect = 'grief' | 'joy' | 'neutral' | 'news';

export interface ExpressionSegmentRuntime {
  /** Engine-facing text (native tags for expressive). */
  text: string;
  /** Speakable plain text (QA / non-expressive). */
  speakable: string;
  exaggeration: number;
  emotion?: RemEmotion | string;
  style?: RemStyle | string;
  affect: DirectedAffect;
  rate?: number;
}

export interface ExpressionRuntime {
  directed: boolean;
  humanize: boolean;
  /** Document-level exaggeration (user override or aggregate). */
  exaggeration: number;
  emotion?: RemEmotion | string;
  style?: RemStyle | string;
  affect: DirectedAffect;
  /** Full document text for expressive (tags preserved when supported). */
  engineText: string;
  speakableText: string;
  segments: ExpressionSegmentRuntime[];
  remWarnings?: string[];
  remDegraded?: boolean;
  /** True when segments differ in affect/exaggeration (need per-segment synth). */
  multiControl: boolean;
}

export interface BuildExpressionOpts {
  engine: string;
  plainText: string;
  /** User-supplied 0..1; wins over REM aggregate when set. */
  exaggeration?: number;
  humanize?: boolean;
  styleProfile?: string;
  compiled?: CompileResult | null;
}

function styleFromProfile(profile?: string): RemStyle | undefined {
  if (!profile) return undefined;
  const p = profile.toLowerCase();
  if (p === 'news' || p === 'newscast') return 'newscast';
  if (p === 'children' || p === 'animated' || p === 'drama') return 'animated';
  if (p === 'podcast' || p === 'conversational') return 'conversational';
  if (p === 'audiobook' || p === 'narrative') return 'narrative';
  return undefined;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function segmentRuntime(seg: CompiledSegment): ExpressionSegmentRuntime {
  const emotion = seg.emotion;
  const style = seg.style;
  const exaggeration = clamp01(
    seg.exaggeration != null ? seg.exaggeration : 0.5,
  );
  return {
    text: (seg.text || seg.speakable || '').trim(),
    speakable: (seg.speakable || seg.text || '').trim(),
    exaggeration,
    emotion,
    style,
    affect: emotionToAffect(emotion, style),
    rate: seg.rate,
  };
}

/**
 * Aggregate compiled REM + job options into runtime controls that synth must honor.
 */
export function buildExpressionRuntime(opts: BuildExpressionOpts): ExpressionRuntime {
  const humanize = opts.humanize === true;
  const profileStyle = styleFromProfile(opts.styleProfile);
  const compiled = opts.compiled;

  if (compiled?.segments?.length) {
    const segments = compiled.segments
      .map(segmentRuntime)
      .filter((s) => s.text || s.speakable);

    const engIsExpressive = opts.engine === 'expressive';
    const engineText = segments
      .map((s) => (engIsExpressive ? s.text : s.speakable))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const speakableText = segments
      .map((s) => s.speakable)
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Word-weighted mean exaggeration
    let wSum = 0;
    let eSum = 0;
    for (const s of segments) {
      const w = Math.max(1, s.speakable.split(/\s+/).filter(Boolean).length);
      wSum += w;
      eSum += s.exaggeration * w;
    }
    const aggEx = wSum ? eSum / wSum : 0.5;

    // Dominant non-neutral affect by speakable length
    let affect: DirectedAffect = 'neutral';
    let best = 0;
    for (const s of segments) {
      const w = s.speakable.length;
      if (s.affect !== 'neutral' && s.affect !== 'news' && w >= best) {
        best = w;
        affect = s.affect;
      } else if (affect === 'neutral' && s.affect === 'news') {
        affect = 'news';
      }
    }
    if (affect === 'neutral' && profileStyle) {
      affect = emotionToAffect(undefined, profileStyle);
    }

    const primary = segments[0];
    const multiControl =
      segments.length > 1 &&
      segments.some(
        (s) =>
          Math.abs(s.exaggeration - segments[0].exaggeration) > 0.04 ||
          s.affect !== segments[0].affect,
      );

    return {
      directed: true,
      humanize,
      exaggeration: clamp01(
        opts.exaggeration != null ? opts.exaggeration : aggEx,
      ),
      emotion: primary?.emotion,
      style: primary?.style || profileStyle,
      affect,
      engineText: engineText || opts.plainText,
      speakableText: speakableText || opts.plainText,
      segments,
      remWarnings: compiled.warnings,
      remDegraded: compiled.degraded,
      multiControl,
    };
  }

  // No REM: still honor user exaggeration / style / humanize
  const style = profileStyle;
  const affect = emotionToAffect(undefined, style);
  const exaggeration = clamp01(
    opts.exaggeration != null ? opts.exaggeration : 0.55,
  );
  const directed =
    opts.exaggeration != null || humanize || !!opts.styleProfile;

  return {
    directed,
    humanize,
    exaggeration,
    style,
    affect,
    engineText: opts.plainText,
    speakableText: opts.plainText,
    segments: [
      {
        text: opts.plainText,
        speakable: opts.plainText,
        exaggeration,
        style,
        affect,
      },
    ],
    multiControl: false,
  };
}

/** Whether post-synth directed AF should run. */
export function shouldApplyDirectedFilter(
  expr: Pick<ExpressionRuntime, 'humanize' | 'affect'> | undefined,
): boolean {
  if (!expr?.humanize) return false;
  // news leave neutral; grief/joy/neutral compressor all apply when humanize
  return true;
}

/** FFmpeg -af graph for this expression (empty string = skip). */
export function expressionAudioFilter(
  expr: Pick<ExpressionRuntime, 'humanize' | 'affect'> | undefined,
  sampleRate = 24000,
): string | null {
  if (!shouldApplyDirectedFilter(expr)) return null;
  const affect = expr?.affect || 'neutral';
  return directedAudioFilter(affect, sampleRate);
}

export { directedAudioFilter, emotionToAffect };
