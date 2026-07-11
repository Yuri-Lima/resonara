/**
 * Boundary-aware pause architecture types.
 * Measured silence at each boundary must land in the profile band.
 */

/** How a chunk ended — drives assembly (trim/crossfade vs silence insert). */
export type ChunkEndBoundary =
  | 'paragraph'
  | 'sentence'
  | 'header'
  | 'chapter'
  | 'dash-clause'
  | 'dialogue'
  | 'ssml-break'
  | 'forced'
  | 'document-end';

/** Intra-chunk punctuation / micro-pause markers. */
export type IntraBoundaryType =
  | 'comma'
  | 'semicolon'
  | 'colon'
  | 'em-dash'
  | 'ellipsis'
  | 'sentence'
  | 'dialogue-attrib'
  | 'ssml-break';

export interface IntraBoundary {
  /** Character offset within the chunk text. */
  offset: number;
  type: IntraBoundaryType;
  /** Explicit SSML break duration in ms (overrides profile when set). */
  explicitMs?: number;
}

export interface PauseMapEntry {
  /** What boundary ends this chunk (join to next). */
  endsAt: ChunkEndBoundary;
  /** Intra-chunk punctuation positions for micro-pause injection. */
  intraBoundaries: IntraBoundary[];
  /** True when this chunk is a header/title line. */
  isHeader?: boolean;
  /** Header level 1=chapter, 2=section, 3=topic. */
  headerLevel?: number;
  /** Explicit SSML break ms that replaces profile at the join. */
  explicitBreakMs?: number;
}

/** Per-boundary target band [minMs, maxMs] and default insert midpoint. */
export interface PauseBand {
  minMs: number;
  maxMs: number;
  /** Duration inserted by assembly / engine (midpoint of band by default). */
  insertMs: number;
}

export type PauseBoundaryKey =
  | 'comma'
  | 'semicolon'
  | 'colon'
  | 'emDash'
  | 'sentence'
  | 'ellipsis'
  | 'paragraph'
  | 'header'
  | 'preHeader'
  | 'chapter'
  | 'dialogue'
  | 'dialogueAttrib';

export type PauseProfileName = 'audiobook' | 'podcast' | 'news' | 'custom';

export type PauseProfileBands = Record<PauseBoundaryKey, PauseBand>;

export interface PauseProfile {
  name: PauseProfileName;
  /** Human label. */
  label: string;
  bands: PauseProfileBands;
  /**
   * Piper --sentence_silence seconds (engine-level sentence gap).
   * Assembly inserts only the delta to band midpoint to avoid double-pause.
   */
  piperSentenceSilenceSec: number;
  /** ± jitter fraction within band for natural feel (0–0.15). */
  jitter?: number;
}

/** Per-request overrides (custom profile or partial band overrides). */
export interface PauseOverrides {
  profile?: PauseProfileName;
  /** Partial ms overrides keyed by boundary (insertMs). */
  custom?: Partial<Record<PauseBoundaryKey, number>>;
  /** Language-specific override pack id (e.g. pt-BR). */
  language?: string;
}

export function band(minMs: number, maxMs: number, insertMs?: number): PauseBand {
  const mid = insertMs ?? Math.round((minMs + maxMs) / 2);
  return { minMs, maxMs, insertMs: mid };
}

export function inBand(measuredMs: number, b: PauseBand): boolean {
  return measuredMs >= b.minMs && measuredMs <= b.maxMs;
}
