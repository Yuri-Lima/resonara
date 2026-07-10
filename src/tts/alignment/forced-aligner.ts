/**
 * Forced alignment: map Whisper word timestamps onto source tokens
 * via Needleman–Wunsch-style DP over normalized tokens.
 */
import { normalizeForWer } from '../qa/normalize';

export type AlignConfidence = 'anchored' | 'interpolated';

export interface AlignedWord {
  word: string;
  startMs: number;
  endMs: number;
  confidence: AlignConfidence;
}

export interface WhisperWordLike {
  word: string;
  startMs: number;
  endMs: number;
}

function normToken(w: string): string {
  return normalizeForWer(w).join('') || w.toLowerCase().replace(/[^\w]/g, '');
}

/**
 * Align source words to whisper words; interpolate gaps.
 */
export function forcedAlign(
  sourceText: string,
  whisperWords: WhisperWordLike[],
): AlignedWord[] {
  const sourceWords = (sourceText || '').trim().split(/\s+/).filter(Boolean);
  if (!sourceWords.length) return [];
  if (!whisperWords.length) {
    // proportional fallback handled by caller
    return sourceWords.map((w) => ({
      word: w,
      startMs: 0,
      endMs: 0,
      confidence: 'interpolated' as const,
    }));
  }

  const sNorm = sourceWords.map(normToken);
  const wNorm = whisperWords.map((w) => normToken(w.word));
  const n = sNorm.length;
  const m = wNorm.length;

  // Needleman-Wunsch
  const MATCH = 2;
  const MISMATCH = -1;
  const GAP = -1;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0),
  );
  const bt: Array<Array<'D' | 'U' | 'L' | null>> = Array.from(
    { length: n + 1 },
    () => Array(m + 1).fill(null),
  );
  for (let i = 0; i <= n; i++) {
    dp[i][0] = i * GAP;
    if (i) bt[i][0] = 'U';
  }
  for (let j = 0; j <= m; j++) {
    dp[0][j] = j * GAP;
    if (j) bt[0][j] = 'L';
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag =
        dp[i - 1][j - 1] + (sNorm[i - 1] === wNorm[j - 1] ? MATCH : MISMATCH);
      const up = dp[i - 1][j] + GAP;
      const left = dp[i][j - 1] + GAP;
      const best = Math.max(diag, up, left);
      dp[i][j] = best;
      if (best === diag) bt[i][j] = 'D';
      else if (best === up) bt[i][j] = 'U';
      else bt[i][j] = 'L';
    }
  }

  // Backtrace → map source index → whisper index | null
  const map: Array<number | null> = Array(n).fill(null);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const op = bt[i][j];
    if (op === 'D') {
      if (sNorm[i - 1] === wNorm[j - 1]) map[i - 1] = j - 1;
      else map[i - 1] = j - 1; // substitution still anchors time
      i--;
      j--;
    } else if (op === 'U') {
      map[i - 1] = null;
      i--;
    } else if (op === 'L') {
      j--;
    } else break;
  }

  const out: AlignedWord[] = sourceWords.map((word, idx) => {
    const wi = map[idx];
    if (wi != null && whisperWords[wi]) {
      return {
        word,
        startMs: whisperWords[wi].startMs,
        endMs: whisperWords[wi].endMs,
        confidence: 'anchored',
      };
    }
    return { word, startMs: -1, endMs: -1, confidence: 'interpolated' };
  });

  // Interpolate unanchored
  for (let k = 0; k < out.length; k++) {
    if (out[k].startMs >= 0) continue;
    let prev = k - 1;
    while (prev >= 0 && out[prev].startMs < 0) prev--;
    let next = k + 1;
    while (next < out.length && out[next].startMs < 0) next++;
    const t0 = prev >= 0 ? out[prev].endMs : 0;
    const t1 =
      next < out.length
        ? out[next].startMs
        : prev >= 0
          ? out[prev].endMs + 200
          : 200;
    const span = Math.max(1, next - prev);
    const slot = k - prev;
    const start = Math.round(t0 + ((t1 - t0) * (slot - 1)) / span);
    const end = Math.round(t0 + ((t1 - t0) * slot) / span);
    out[k].startMs = start;
    out[k].endMs = Math.max(start + 30, end);
    out[k].confidence = 'interpolated';
  }

  return out;
}

/** Merge per-chunk alignments with time offsets (ms). */
export function mergeChunkAlignments(
  chunks: { offsetMs: number; words: AlignedWord[] }[],
): AlignedWord[] {
  const out: AlignedWord[] = [];
  for (const ch of chunks) {
    for (const w of ch.words) {
      out.push({
        ...w,
        startMs: w.startMs + ch.offsetMs,
        endMs: w.endMs + ch.offsetMs,
      });
    }
  }
  return out;
}

/** Binary search: word index at timeMs. */
export function wordIndexAtTime(words: AlignedWord[], timeMs: number): number {
  if (!words.length) return 0;
  let lo = 0;
  let hi = words.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].startMs <= timeMs) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function groupSentences(
  words: AlignedWord[],
): { startIdx: number; endIdx: number; text: string }[] {
  const sentences: { startIdx: number; endIdx: number; text: string }[] = [];
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    if (/[.!?]["']?$/.test(words[i].word) || i === words.length - 1) {
      const slice = words.slice(start, i + 1);
      sentences.push({
        startIdx: start,
        endIdx: i,
        text: slice.map((w) => w.word).join(' '),
      });
      start = i + 1;
    }
  }
  return sentences;
}
