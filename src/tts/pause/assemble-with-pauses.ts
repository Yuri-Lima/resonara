/**
 * Boundary-aware assembly plan:
 *  - trim + crossfade ONLY at 'forced' (mid-sentence) joins
 *  - insert profile-driven silence at every other boundary
 *  - SSML explicit breaks replace profile values (never sum)
 *  - engine sentence silence is subtracted (delta-only insert)
 */
import {
  ChunkEndBoundary,
  PauseMapEntry,
  PauseProfile,
} from './pause.types';
import {
  boundaryToBandKey,
  jitteredInsertMs,
} from './pause-profiles';

export type AssemblePartKind = 'audio' | 'silence' | 'crossfade-pair';

export interface AssemblePart {
  kind: AssemblePartKind;
  /** Path to audio chunk (kind=audio). */
  path?: string;
  /** Silence duration seconds (kind=silence). */
  silenceSec?: number;
  /** For forced joins: pair of paths to crossfade. */
  paths?: [string, string];
  crossfadeSec?: number;
  /** Debug: boundary that produced this gap. */
  boundary?: ChunkEndBoundary;
  gapMs?: number;
}

export interface ChunkAudio {
  path: string;
  pause: PauseMapEntry;
  /** Optional measured trailing silence already present (ms) from engine. */
  engineTrailingSilenceMs?: number;
}

export interface AssemblePlanOptions {
  profile: PauseProfile;
  /** Crossfade duration for forced seams only. */
  forcedCrossfadeSec?: number;
  /** Whether to apply jitter. Default true. */
  jitter?: boolean;
  rng?: () => number;
  /**
   * When true, assume piper --sentence_silence already produced
   * profile.piperSentenceSilenceSec of gap at sentence ends — insert only delta.
   */
  accountForEngineSentenceSilence?: boolean;
}

/**
 * Build an ordered list of audio + silence parts for a single concat pass.
 * Forced mid-sentence joins are marked as crossfade-pair for the caller
 * (or pre-resolved into a single audio path before concat).
 */
export function buildAssemblePlan(
  chunks: ChunkAudio[],
  opts: AssemblePlanOptions,
): AssemblePart[] {
  const parts: AssemblePart[] = [];
  const xf = opts.forcedCrossfadeSec ?? 0.02;
  const useJitter = opts.jitter !== false;
  const rng = opts.rng ?? Math.random;
  const accountEngine = opts.accountForEngineSentenceSilence !== false;

  for (let i = 0; i < chunks.length; i++) {
    const cur = chunks[i];
    parts.push({ kind: 'audio', path: cur.path });

    if (i >= chunks.length - 1) break;
    const endsAt = cur.pause?.endsAt ?? 'forced';
    const next = chunks[i + 1];

    // Explicit SSML break on this chunk wins
    if (
      endsAt === 'ssml-break' ||
      (cur.pause?.explicitBreakMs != null && cur.pause.explicitBreakMs > 0)
    ) {
      const ms = cur.pause.explicitBreakMs ?? 0;
      if (ms > 0) {
        parts.push({
          kind: 'silence',
          silenceSec: ms / 1000,
          boundary: 'ssml-break',
          gapMs: ms,
        });
      }
      continue;
    }

    if (endsAt === 'forced') {
      // Seam: no silence insert; caller should crossfade cur+next
      // We leave a marker; resolveForcedCrossfades() merges pairs.
      parts.push({
        kind: 'crossfade-pair',
        paths: [cur.path, next.path],
        crossfadeSec: xf,
        boundary: 'forced',
        gapMs: 0,
      });
      // Skip pushing next audio here — crossfade consumes it; advance?
      // Simpler approach: don't use crossfade-pair in the stream; instead
      // return gapMs=0 and let the service crossfade adjacent forced joins
      // in a pre-pass. Keep marker but also don't duplicate.
      continue;
    }

    if (endsAt === 'document-end') continue;

    // Entering a header/chapter: ONLY the approach gap (pre-header or chapter).
    // The header→body gap is inserted when the header chunk itself ends.
    // Never stack pre-header + paragraph/header at the same join (double-pause).
    if (next.pause?.isHeader) {
      const nextLevel = next.pause.headerLevel ?? 2;
      const approachKey = nextLevel <= 1 ? 'chapter' : 'preHeader';
      const approachBand = opts.profile.bands[approachKey];
      const approachMs = useJitter
        ? jitteredInsertMs(approachBand, opts.profile.jitter ?? 0, rng)
        : approachBand.insertMs;
      if (approachMs >= 15) {
        parts.push({
          kind: 'silence',
          silenceSec: approachMs / 1000,
          boundary: approachKey === 'chapter' ? 'chapter' : 'header',
          gapMs: approachMs,
        });
      }
      continue;
    }

    const bandKey = boundaryToBandKey(endsAt);
    if (!bandKey) continue;
    const band = opts.profile.bands[bandKey];
    let insertMs = useJitter
      ? jitteredInsertMs(band, opts.profile.jitter ?? 0, rng)
      : band.insertMs;

    // Delta-only when engine already emitted sentence silence
    if (
      accountEngine &&
      endsAt === 'sentence' &&
      opts.profile.piperSentenceSilenceSec > 0
    ) {
      const engineMs = Math.round(opts.profile.piperSentenceSilenceSec * 1000);
      // Prefer measured trailing if provided
      const already =
        cur.engineTrailingSilenceMs != null
          ? cur.engineTrailingSilenceMs
          : engineMs;
      insertMs = Math.max(0, insertMs - already);
    }

    // Also subtract measured trailing silence for paragraph/header if present
    if (cur.engineTrailingSilenceMs != null && endsAt !== 'sentence') {
      insertMs = Math.max(0, insertMs - cur.engineTrailingSilenceMs);
    }

    if (insertMs >= 15) {
      parts.push({
        kind: 'silence',
        silenceSec: insertMs / 1000,
        boundary: endsAt,
        gapMs: insertMs,
      });
    }
  }

  // Drop crossfade-pair markers from the flat concat list — they are
  // informational for a pre-pass. Filter them out of concat parts.
  return parts.filter((p) => p.kind !== 'crossfade-pair' || false);
}

/**
 * Flatten plan to alternating audio paths + silence durations for
 * ffmpeg concat (caller generates silence WAVs).
 */
export function flattenPlanForConcat(
  plan: AssemblePart[],
): Array<{ type: 'audio'; path: string } | { type: 'silence'; sec: number; boundary?: string }> {
  const out: Array<
    | { type: 'audio'; path: string }
    | { type: 'silence'; sec: number; boundary?: string }
  > = [];
  for (const p of plan) {
    if (p.kind === 'audio' && p.path) {
      // Avoid consecutive duplicate audio after failed crossfade markers
      if (
        out.length &&
        out[out.length - 1].type === 'audio' &&
        (out[out.length - 1] as { path: string }).path === p.path
      ) {
        continue;
      }
      out.push({ type: 'audio', path: p.path });
    } else if (p.kind === 'silence' && p.silenceSec && p.silenceSec > 0) {
      out.push({
        type: 'silence',
        sec: p.silenceSec,
        boundary: p.boundary,
      });
    }
  }
  return out;
}

/**
 * Decide whether a chunk edge should be silence-trimmed.
 * Only forced (mid-sentence) edges get full trim; other edges keep
 * trailing engine silence (sentence_silence).
 */
export function shouldTrimChunkEdge(
  pause: PauseMapEntry | undefined,
  edge: 'leading' | 'trailing',
): boolean {
  if (!pause) return true; // legacy: trim both
  if (pause.endsAt === 'forced') return true;
  // Always allow light leading trim (startup breath) except after silence insert
  if (edge === 'leading') return true;
  // Keep trailing silence for sentence/paragraph/etc.
  return false;
}

/**
 * Gap ms to insert between dialogue speaker blocks.
 */
export function dialogueGapMs(profile: PauseProfile, language?: string): number {
  const key =
    language && language.toLowerCase().startsWith('pt')
      ? 'dialogueAttrib'
      : 'dialogue';
  return profile.bands[key].insertMs;
}
