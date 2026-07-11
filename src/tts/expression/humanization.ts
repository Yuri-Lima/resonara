/**
 * Humanization micro-layer: breaths, anti-metronome jitter, profile-gated.
 */
import { PauseProfileName } from '../pause/pause.types';

export interface HumanizationOptions {
  profile?: PauseProfileName | 'raw';
  /** Max 1 breath per sentence when true. */
  breaths?: boolean;
  breathDensity?: number; // 0..1
  /** ± fraction on pause durations within profile bands. */
  pauseJitter?: number;
  /** ± fraction on per-sentence rate (non-expressive engines). */
  rateJitter?: number;
  /** Word count threshold for pre-sentence breath. */
  longSentenceWords?: number;
}

export interface BreathPlacement {
  /** Character offset in text (sentence start). */
  offset: number;
  reason: 'long-sentence' | 'paragraph' | 'scene-transition';
}

const DEFAULTS: Required<HumanizationOptions> = {
  profile: 'audiobook',
  breaths: true,
  breathDensity: 0.7,
  pauseJitter: 0.08,
  rateJitter: 0.04,
  longSentenceWords: 25,
};

export function resolveHumanization(
  opts?: HumanizationOptions,
): Required<HumanizationOptions> {
  const profile = opts?.profile ?? 'audiobook';
  if (profile === 'raw' || profile === 'news') {
    return {
      ...DEFAULTS,
      ...opts,
      profile,
      breaths: profile === 'news' ? false : opts?.breaths ?? false,
      rateJitter: profile === 'news' ? 0 : opts?.rateJitter ?? 0,
      pauseJitter: profile === 'news' ? 0.02 : opts?.pauseJitter ?? 0.04,
    };
  }
  return { ...DEFAULTS, ...opts, profile };
}

/**
 * Plan breath placements — never mid-word. Align to sentence starts only.
 */
export function planBreaths(
  text: string,
  opts?: HumanizationOptions,
): BreathPlacement[] {
  const cfg = resolveHumanization(opts);
  if (!cfg.breaths || cfg.profile === 'raw') return [];

  const placements: BreathPlacement[] = [];
  // Paragraph boundaries
  let offset = 0;
  const paras = text.split(/(\n{2,})/);
  for (let pi = 0; pi < paras.length; pi++) {
    const part = paras[pi];
    if (/^\n{2,}$/.test(part)) {
      offset += part.length;
      continue;
    }
    if (pi > 0 && part.trim() && Math.random() < cfg.breathDensity) {
      // deterministic-ish: use hash of offset instead of Math.random for tests
      placements.push({ offset, reason: 'paragraph' });
    }
    // Sentences
    const sentenceRe = /[^.!?…]+[.!?…]+["']?|\S.+$/g;
    let m: RegExpExecArray | null;
    const local = part;
    while ((m = sentenceRe.exec(local))) {
      const sent = m[0];
      const words = sent.trim().split(/\s+/).filter(Boolean).length;
      const abs = offset + m.index;
      if (words >= cfg.longSentenceWords) {
        placements.push({ offset: abs, reason: 'long-sentence' });
      }
      // scene transition heuristics
      if (/^(chapter|scene|\*\*\*|#{1,3}\s)/i.test(sent.trim())) {
        placements.push({ offset: abs, reason: 'scene-transition' });
      }
    }
    offset += part.length;
  }

  // Rate limit: max 1 per sentence — collapse same-offset
  const byOffset = new Map<number, BreathPlacement>();
  for (const p of placements) {
    if (!byOffset.has(p.offset)) byOffset.set(p.offset, p);
  }
  return [...byOffset.values()].sort((a, b) => a.offset - b.offset);
}

/**
 * Inject [breath] REM markers at planned offsets (for engines that compile them).
 */
export function injectBreathMarkers(
  text: string,
  opts?: HumanizationOptions,
): { text: string; count: number } {
  const plan = planBreaths(text, opts);
  if (!plan.length) return { text, count: 0 };
  // Apply from end so offsets stay valid
  let out = text;
  const sorted = [...plan].sort((a, b) => b.offset - a.offset);
  let count = 0;
  for (const p of sorted) {
    // skip if would land mid-word
    if (p.offset > 0 && /\w/.test(out[p.offset - 1] || '') && /\w/.test(out[p.offset] || '')) {
      continue;
    }
    out = out.slice(0, p.offset) + '[breath] ' + out.slice(p.offset);
    count++;
  }
  return { text: out, count };
}

/** Bounded jitter multiplier in [1-j, 1+j]. Deterministic via seed. */
export function jitterFactor(seed: string, jitter: number): number {
  if (jitter <= 0) return 1;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const u = (Math.abs(h) % 1000) / 1000; // 0..1
  return 1 + (u * 2 - 1) * jitter;
}

export function jitterPauseMs(
  baseMs: number,
  seed: string,
  opts?: HumanizationOptions,
): number {
  const cfg = resolveHumanization(opts);
  const f = jitterFactor(seed, cfg.pauseJitter);
  return Math.max(0, Math.round(baseMs * f));
}

export function jitterRate(
  baseRate: number,
  seed: string,
  opts?: HumanizationOptions,
): number {
  const cfg = resolveHumanization(opts);
  return baseRate * jitterFactor(seed, cfg.rateJitter);
}

/**
 * FFmpeg filter graph for post-engine directed affect (humanization audio path).
 * Pitch via asetrate+aresample; rate via atempo. Sample rate assumed 24 kHz.
 */
export function directedAudioFilter(
  affect: 'grief' | 'joy' | 'neutral' | 'news',
  sampleRate = 24000,
): string {
  switch (affect) {
    case 'grief':
      return `asetrate=${sampleRate}*0.92,aresample=${sampleRate},atempo=0.95,volume=0.82,lowpass=f=4200`;
    case 'joy':
      return `asetrate=${sampleRate}*1.07,aresample=${sampleRate},atempo=0.98,volume=1.15,treble=g=4`;
    case 'news':
      return `volume=1.0`; // leave neutral
    default:
      return `acompressor=threshold=-20dB:ratio=1.8:attack=10:release=150,volume=1.05`;
  }
}

/** Map emotion / style to directed audio affect bucket. */
export function emotionToAffect(
  emotion?: string,
  style?: string,
): 'grief' | 'joy' | 'neutral' | 'news' {
  const e = (emotion || '').toLowerCase();
  const s = (style || '').toLowerCase();
  if (s === 'newscast' || e === 'neutral') return 'news';
  if (e === 'sadness' || e === 'grief' || e === 'tension') return 'grief';
  if (e === 'joy' || e === 'anger' || s === 'animated') return 'joy';
  return 'neutral';
}
