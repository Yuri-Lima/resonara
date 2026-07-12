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
  // drama stays narrative (affect comes from content/REM emotion — not "animated/joy")
  if (p === 'children' || p === 'animated') return 'animated';
  if (p === 'drama') return 'narrative';
  if (p === 'podcast' || p === 'conversational') return 'conversational';
  if (p === 'audiobook' || p === 'narrative') return 'narrative';
  return undefined;
}

/**
 * Lightweight content → affect when REM has no emotion yet.
 * Enables product-path direction on plain monologues (death/picnic/news)
 * without offline hand-authored filters.
 */
export function contentAffectFromText(text: string): DirectedAffect | null {
  if (!text?.trim()) return null;
  const t = text.toLowerCase();
  if (
    /\b(breaking news|in other news|national news|good evening\.|lawmakers|markets closed|authorities said|officials said|negotiators said|full report)\b/.test(
      t,
    ) ||
    /\bnewscast\b/.test(t)
  ) {
    return 'news';
  }
  if (
    /\b(grief|grieving|mourn|funeral|died|death|dying|final breath|let go|warmth faded|sobbed|tears?|weep)\b/.test(
      t,
    )
  ) {
    return 'grief';
  }
  if (
    /\b(picnic|laughter|laughing|laugh|giggle|celebration|sunshine|bright|cheerful|delighted|joyous|joy|happiness|honey|meadow)\b/.test(
      t,
    )
  ) {
    return 'joy';
  }
  return null;
}

function applyContentAffectFallback(
  affect: DirectedAffect,
  text: string,
  humanize: boolean,
): DirectedAffect {
  if (!humanize) return affect;
  if (affect !== 'neutral' && affect !== 'news') return affect;
  const fromContent = contentAffectFromText(text);
  if (!fromContent) return affect;
  // Do not override an explicit newscast style with joy/grief keywords
  if (affect === 'news' && fromContent !== 'news') return affect;
  return fromContent;
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
    const multiControl =
      segments.length > 1 &&
      segments.some(
        (s) =>
          Math.abs(s.exaggeration - segments[0].exaggeration) > 0.04 ||
          s.affect !== segments[0].affect,
      );

    // Content fallback for monologues; multi-emotion dialogue keeps document AF neutral
    if (multiControl) {
      const unique = new Set(segments.map((s) => s.affect));
      if (unique.size > 1) {
        // Conflicting segment affects: document-level AF stays neutral
        // (per-segment synth owns color via expressionForChunk)
        affect = 'neutral';
      } else {
        // multiControl only from exaggeration variance — content cue still valid
        affect = applyContentAffectFallback(
          affect,
          speakableText || opts.plainText,
          humanize,
        );
      }
    } else {
      affect = applyContentAffectFallback(
        affect,
        speakableText || opts.plainText,
        humanize,
      );
      // Propagate document affect onto neutral segments when humanize + content cue
      if (humanize && affect !== 'neutral') {
        for (const s of segments) {
          if (s.affect === 'neutral') s.affect = affect;
        }
      }
    }

    const primary = segments[0];

    // Content-driven grief/joy nudges exaggeration when user did not set it
    let exaggeration = clamp01(
      opts.exaggeration != null ? opts.exaggeration : aggEx,
    );
    if (opts.exaggeration == null && humanize) {
      if (affect === 'grief') exaggeration = Math.max(exaggeration, 0.58);
      if (affect === 'joy') exaggeration = Math.max(exaggeration, 0.62);
      if (affect === 'news') exaggeration = Math.min(exaggeration, 0.35);
    }

    return {
      directed: true,
      humanize,
      exaggeration,
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
  let affect = emotionToAffect(undefined, style);
  affect = applyContentAffectFallback(affect, opts.plainText, humanize);
  let exaggeration = clamp01(
    opts.exaggeration != null ? opts.exaggeration : 0.55,
  );
  if (opts.exaggeration == null && humanize) {
    if (affect === 'grief') exaggeration = 0.58;
    if (affect === 'joy') exaggeration = 0.62;
    if (affect === 'news') exaggeration = 0.35;
  }
  const directed =
    opts.exaggeration != null || humanize || !!opts.styleProfile || affect !== 'neutral';

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
