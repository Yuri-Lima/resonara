/**
 * Word Error Rate via classic DP edit distance.
 * WER = (S + D + I) / N  where N = reference word count (min 1 if both empty → 0).
 *
 * Soft token match (ASR-tolerant): near-identical tokens count as matches so
 * Whisper typos like "ringed"→"ring" or "Gugglielmo"→"guglielmo" do not
 * inflate synthesis WER. Dropped/inserted words still cost full edits.
 */

export interface WerAlignment {
  wer: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  referenceLength: number;
  missing: string[];
  inserted: string[];
  hypothesis: string[];
  reference: string[];
}

export function tokenizeWords(text: string): string[] {
  return (text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Levenshtein distance for short strings (cap length 24). */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (a.length > 24 || b.length > 24) {
    return a === b ? 0 : Math.max(a.length, b.length);
  }
  const m = a.length;
  const n = b.length;
  const prev = new Array(n + 1);
  const cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

/**
 * Tokens match if equal, or soft-equal for ASR noise:
 * - edit distance ≤ 1 for len ≥ 4
 * - edit distance ≤ 2 for len ≥ 8
 * - one is a prefix of the other when shorter ≥ 4 and ratio ≥ 0.75
 */
export function tokensSoftEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const la = a.length;
  const lb = b.length;
  const longer = Math.max(la, lb);
  const shorter = Math.min(la, lb);
  if (shorter >= 4 && longer <= shorter + 2) {
    if (a.startsWith(b) || b.startsWith(a)) return true;
  }
  const d = editDistance(a, b);
  if (longer >= 8 && d <= 2) return true;
  if (longer >= 4 && d <= 1) return true;
  return false;
}

/**
 * Compute WER and rough missing/inserted lists via backtrace.
 */
export function computeWer(reference: string[], hypothesis: string[]): WerAlignment {
  const ref = reference.map((w) => w.toLowerCase());
  const hyp = hypothesis.map((w) => w.toLowerCase());
  const n = ref.length;
  const m = hyp.length;

  if (n === 0 && m === 0) {
    return {
      wer: 0,
      substitutions: 0,
      deletions: 0,
      insertions: 0,
      referenceLength: 0,
      missing: [],
      inserted: [],
      hypothesis: hyp,
      reference: ref,
    };
  }
  if (n === 0) {
    return {
      wer: m > 0 ? 1 : 0,
      substitutions: 0,
      deletions: 0,
      insertions: m,
      referenceLength: 0,
      missing: [],
      inserted: [...hyp],
      hypothesis: hyp,
      reference: ref,
    };
  }

  // dp[i][j] = min ops to transform ref[0..i) → hyp[0..j)
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0),
  );
  const bt: Array<Array<'M' | 'S' | 'D' | 'I' | null>> = Array.from(
    { length: n + 1 },
    () => Array(m + 1).fill(null),
  );

  for (let i = 0; i <= n; i++) {
    dp[i][0] = i;
    if (i > 0) bt[i][0] = 'D';
  }
  for (let j = 0; j <= m; j++) {
    dp[0][j] = j;
    if (j > 0) bt[0][j] = 'I';
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (tokensSoftEqual(ref[i - 1], hyp[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1];
        bt[i][j] = 'M';
      } else {
        const sub = dp[i - 1][j - 1] + 1;
        const del = dp[i - 1][j] + 1;
        const ins = dp[i][j - 1] + 1;
        const best = Math.min(sub, del, ins);
        dp[i][j] = best;
        if (best === sub) bt[i][j] = 'S';
        else if (best === del) bt[i][j] = 'D';
        else bt[i][j] = 'I';
      }
    }
  }

  let i = n;
  let j = m;
  let S = 0;
  let D = 0;
  let I = 0;
  const missing: string[] = [];
  const inserted: string[] = [];
  while (i > 0 || j > 0) {
    const op = bt[i][j];
    if (op === 'M') {
      i--;
      j--;
    } else if (op === 'S') {
      S++;
      missing.push(ref[i - 1]);
      inserted.push(hyp[j - 1]);
      i--;
      j--;
    } else if (op === 'D') {
      D++;
      missing.push(ref[i - 1]);
      i--;
    } else if (op === 'I') {
      I++;
      inserted.push(hyp[j - 1]);
      j--;
    } else {
      break;
    }
  }

  const wer = (S + D + I) / n;
  return {
    wer,
    substitutions: S,
    deletions: D,
    insertions: I,
    referenceLength: n,
    missing: missing.reverse(),
    inserted: inserted.reverse(),
    hypothesis: hyp,
    reference: ref,
  };
}
