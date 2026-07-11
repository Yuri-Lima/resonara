/**
 * Pause profiles — audiobook (default), podcast (~20% tighter), news (~35% tighter).
 * Bands are the contract measured by the pause probe.
 */
import {
  PauseBand,
  PauseBoundaryKey,
  PauseOverrides,
  PauseProfile,
  PauseProfileBands,
  PauseProfileName,
  band,
} from './pause.types';

function scaleBand(b: PauseBand, factor: number): PauseBand {
  const minMs = Math.max(40, Math.round(b.minMs * factor));
  const maxMs = Math.max(minMs + 40, Math.round(b.maxMs * factor));
  const insertMs = Math.round((minMs + maxMs) / 2);
  return { minMs, maxMs, insertMs };
}

function scaleAll(bands: PauseProfileBands, factor: number): PauseProfileBands {
  const out = {} as PauseProfileBands;
  for (const k of Object.keys(bands) as PauseBoundaryKey[]) {
    out[k] = scaleBand(bands[k], factor);
  }
  return out;
}

/** Professional audiobook defaults (contract from the user report). */
export const AUDIOBOOK_BANDS: PauseProfileBands = {
  comma: band(150, 250, 200),
  semicolon: band(200, 300, 250),
  colon: band(200, 300, 250),
  emDash: band(200, 350, 275),
  sentence: band(350, 600, 450),
  ellipsis: band(450, 750, 600),
  paragraph: band(700, 1000, 850),
  header: band(900, 1300, 1100),
  preHeader: band(250, 400, 325),
  chapter: band(1500, 2500, 2000),
  dialogue: band(250, 400, 325),
  dialogueAttrib: band(250, 400, 325),
};

/** pt-BR language overrides — slightly longer travessão beats. */
export const PT_BR_OVERRIDES: Partial<Record<PauseBoundaryKey, PauseBand>> = {
  emDash: band(250, 400, 325),
  dialogue: band(250, 400, 325),
  dialogueAttrib: band(280, 420, 350),
  // Brazilian readers often take a fuller breath at paragraph ends
  paragraph: band(750, 1100, 900),
};

export const AUDIOBOOK_PROFILE: PauseProfile = {
  name: 'audiobook',
  label: 'Audiobook',
  bands: AUDIOBOOK_BANDS,
  // Slightly under sentence band midpoint so measured (engine + residual)
  // lands inside 350–600 ms rather than overshooting.
  piperSentenceSilenceSec: 0.4,
  jitter: 0.08,
};

export const PODCAST_PROFILE: PauseProfile = {
  name: 'podcast',
  label: 'Podcast',
  bands: scaleAll(AUDIOBOOK_BANDS, 0.8),
  piperSentenceSilenceSec: 0.35,
  jitter: 0.08,
};

export const NEWS_PROFILE: PauseProfile = {
  name: 'news',
  label: 'News',
  bands: scaleAll(AUDIOBOOK_BANDS, 0.65),
  piperSentenceSilenceSec: 0.25,
  jitter: 0.05,
};

const PRESETS: Record<Exclude<PauseProfileName, 'custom'>, PauseProfile> = {
  audiobook: AUDIOBOOK_PROFILE,
  podcast: PODCAST_PROFILE,
  news: NEWS_PROFILE,
};

export function listPauseProfiles(): PauseProfile[] {
  return [AUDIOBOOK_PROFILE, PODCAST_PROFILE, NEWS_PROFILE];
}

/**
 * Resolve a profile with optional language + custom insertMs overrides.
 */
export function resolvePauseProfile(opts: PauseOverrides = {}): PauseProfile {
  const name = opts.profile || 'audiobook';
  const base =
    name === 'custom'
      ? { ...AUDIOBOOK_PROFILE, name: 'custom' as const, label: 'Custom' }
      : { ...PRESETS[name] };

  const bands: PauseProfileBands = { ...base.bands };
  const lang = (opts.language || '').toLowerCase();
  if (lang === 'pt-br' || lang === 'pt_br' || lang === 'pt') {
    for (const [k, v] of Object.entries(PT_BR_OVERRIDES)) {
      bands[k as PauseBoundaryKey] = v!;
    }
  }
  if (opts.custom) {
    for (const [k, ms] of Object.entries(opts.custom)) {
      if (ms == null || !Number.isFinite(ms)) continue;
      const key = k as PauseBoundaryKey;
      if (!bands[key]) continue;
      const b = bands[key];
      // Custom sets insertMs; expand band ±20% around it for pass tolerance
      const insertMs = Math.max(0, Math.round(ms));
      bands[key] = {
        minMs: Math.max(0, Math.round(insertMs * 0.8)),
        maxMs: Math.round(insertMs * 1.2) + 50,
        insertMs,
      };
      // keep original band if custom is within it
      if (insertMs >= b.minMs && insertMs <= b.maxMs) {
        bands[key] = { ...b, insertMs };
      }
    }
  }

  // piper sentence silence tracks sentence insert
  const sentenceSec = bands.sentence.insertMs / 1000;
  return {
    ...base,
    name: name === 'custom' ? 'custom' : base.name,
    bands,
    piperSentenceSilenceSec: Math.max(0.05, Math.min(1.5, sentenceSec)),
  };
}

/** Map chunk endsAt → profile band key for assembly insert. */
export function boundaryToBandKey(
  endsAt: string,
): PauseBoundaryKey | null {
  switch (endsAt) {
    case 'paragraph':
      return 'paragraph';
    case 'sentence':
      return 'sentence';
    case 'header':
      return 'header';
    case 'chapter':
      return 'chapter';
    case 'dash-clause':
      return 'emDash';
    case 'dialogue':
      return 'dialogue';
    case 'forced':
    case 'document-end':
      return null;
    case 'ssml-break':
      return null; // explicit ms on the map entry
    default:
      return null;
  }
}

/**
 * Apply ±jitter within band so pauses don't sound robotic.
 */
export function jitteredInsertMs(
  b: PauseBand,
  jitter = 0.08,
  rng: () => number = Math.random,
): number {
  if (!(jitter > 0)) return b.insertMs;
  const span = b.maxMs - b.minMs;
  const delta = (rng() * 2 - 1) * jitter * span;
  return Math.round(
    Math.min(b.maxMs, Math.max(b.minMs, b.insertMs + delta)),
  );
}
