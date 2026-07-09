/**
 * Word-level timestamp estimation + subtitle generation (WebVTT / SRT).
 */

export interface WordTimestamp {
  word: string;
  startMs: number;
  endMs: number;
}

export interface SubtitleCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

/** Fallback: distribute duration across words proportional to character length. */
export function estimateWordTimestamps(
  text: string,
  durationMs: number,
  offsetMs = 0,
): WordTimestamp[] {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length || durationMs <= 0) return [];
  const weights = words.map((w) => Math.max(1, w.replace(/[^\p{L}\p{N}]/gu, '').length || 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = offsetMs;
  const out: WordTimestamp[] = [];
  for (let i = 0; i < words.length; i++) {
    const slice = (weights[i] / total) * durationMs;
    const startMs = Math.round(t);
    const endMs = Math.round(t + slice);
    out.push({ word: words[i], startMs, endMs: Math.max(endMs, startMs + 40) });
    t += slice;
  }
  return out;
}

export function groupSubtitles(
  words: WordTimestamp[],
  opts?: { maxWords?: number; maxChars?: number; minDurationMs?: number },
): SubtitleCue[] {
  const maxWords = opts?.maxWords ?? 10;
  const maxChars = opts?.maxChars ?? 42;
  const minDur = opts?.minDurationMs ?? 1500;
  const cues: SubtitleCue[] = [];
  let i = 0;
  let idx = 1;
  while (i < words.length) {
    const line: WordTimestamp[] = [];
    let chars = 0;
    while (i < words.length && line.length < maxWords) {
      const w = words[i];
      if (line.length && chars + 1 + w.word.length > maxChars) break;
      line.push(w);
      chars += (line.length > 1 ? 1 : 0) + w.word.length;
      i++;
    }
    if (!line.length) break;
    const startMs = line[0].startMs;
    let endMs = line[line.length - 1].endMs;
    if (endMs - startMs < minDur) endMs = startMs + minDur;
    cues.push({
      index: idx++,
      startMs,
      endMs,
      text: line.map((w) => w.word).join(' '),
    });
  }
  return cues;
}

function fmtVtt(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = Math.floor(ms % 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
}

function fmtSrt(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = Math.floor(ms % 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
}

export function toWebVtt(cues: SubtitleCue[]): string {
  const lines = ['WEBVTT', ''];
  for (const c of cues) {
    lines.push(`${fmtVtt(c.startMs)} --> ${fmtVtt(c.endMs)}`);
    lines.push(c.text);
    lines.push('');
  }
  return lines.join('\n');
}

export function toSrt(cues: SubtitleCue[]): string {
  const lines: string[] = [];
  for (const c of cues) {
    lines.push(String(c.index));
    lines.push(`${fmtSrt(c.startMs)} --> ${fmtSrt(c.endMs)}`);
    lines.push(c.text);
    lines.push('');
  }
  return lines.join('\n');
}
