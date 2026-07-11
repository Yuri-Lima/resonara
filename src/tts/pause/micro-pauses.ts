/**
 * Intra-chunk micro-pause planning: split speakable text at punctuation
 * so the synthesizer can insert profile gaps between sub-utterances
 * without clipping phonemes (never mid-word).
 */
import { PauseProfile } from './pause.types';

export interface MicroSegment {
  text: string;
  /** Gap to insert AFTER this segment (ms); 0 for last. */
  gapAfterMs: number;
}

/**
 * Split text into speakable segments at comma/semicolon/colon/em-dash/ellipsis
 * AND sentence terminators (.!?). Sentence gaps use the profile sentence band
 * so assembly can insert a known pause (engine-agnostic, measurable).
 * Returns a single segment when no micro-boundary is found.
 */
export function planMicroPauseSegments(
  text: string,
  profile: PauseProfile,
): MicroSegment[] {
  const t = (text || '').trim();
  if (!t) return [];

  // Capture punctuation tokens; keep sentence terminators separate from ellipsis
  const parts = t.split(/(\.{3}|…|[,;:—–]|[.!?])/).filter((p) => p.length);
  const segments: MicroSegment[] = [];
  let buf = '';

  const gapFor = (punct: string): number => {
    if (punct === ',') return profile.bands.comma.insertMs;
    if (punct === ';' || punct === ':') return profile.bands.semicolon.insertMs;
    if (punct === '—' || punct === '–') return profile.bands.emDash.insertMs;
    if (punct === '…' || punct === '...') return profile.bands.ellipsis.insertMs;
    if (punct === '.' || punct === '!' || punct === '?') {
      return profile.bands.sentence.insertMs;
    }
    return profile.bands.comma.insertMs;
  };

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === '...' || p === '…') {
      buf += p;
      segments.push({ text: buf.trim(), gapAfterMs: gapFor(p) });
      buf = '';
    } else if (/^[,;:—–]$/.test(p)) {
      buf += p;
      segments.push({ text: buf.trim(), gapAfterMs: gapFor(p) });
      buf = '';
    } else if (/^[.!?]$/.test(p)) {
      // Avoid treating decimals (digit.digit) as sentence ends
      const prev = buf;
      const next = parts[i + 1] || '';
      if (/\d$/.test(prev) && /^\d/.test(next)) {
        buf += p;
        continue;
      }
      buf += p;
      segments.push({ text: buf.trim(), gapAfterMs: gapFor(p) });
      buf = '';
    } else {
      buf += p;
    }
  }
  if (buf.trim()) {
    segments.push({ text: buf.trim(), gapAfterMs: 0 });
  }

  // Collapse empty / punctuation-only segments (need real word chars)
  const hasWords = (s: string) => /[\p{L}\p{N}]/u.test(s);
  const cleaned = segments.filter((s) => s.text.length > 0 && hasWords(s.text));
  if (cleaned.length <= 1) {
    return [{ text: t, gapAfterMs: 0 }];
  }
  // Last segment never needs gap (document/chunk end handled by assembly)
  cleaned[cleaned.length - 1].gapAfterMs = 0;
  return cleaned;
}
