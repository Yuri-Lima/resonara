/**
 * Split long documents into TTS-safe chunks at sentence/paragraph boundaries.
 * Pure functions — unit-testable without platform APIs.
 * Engine-aware: Piper uses larger chunks for cross-sentence prosody.
 */

export type ChunkEngine = 'piper' | 'platform';

export interface ChunkOptions {
  /** Soft max characters per chunk. Default engine-aware. */
  maxChars?: number;
  /** Hard max; force-split if a single sentence exceeds this. */
  hardMaxChars?: number;
  /** Engine selects defaults when max not provided. */
  engine?: ChunkEngine;
}

export interface TextChunk {
  index: number;
  text: string;
  charCount: number;
}

const PLATFORM_MAX = 1800;
const PLATFORM_HARD = 2400;
const PIPER_MAX = 4000;
const PIPER_HARD = 6000;

export function defaultChunkLimits(engine: ChunkEngine = 'platform'): {
  maxChars: number;
  hardMaxChars: number;
} {
  if (engine === 'piper') {
    return { maxChars: PIPER_MAX, hardMaxChars: PIPER_HARD };
  }
  return { maxChars: PLATFORM_MAX, hardMaxChars: PLATFORM_HARD };
}

/**
 * Chunk text for long-form TTS. Prefer paragraph breaks, then sentences, then words.
 * Never splits inside SSML tags when markup is present.
 */
export function chunkTextForTts(
  input: string,
  options: ChunkOptions = {},
): TextChunk[] {
  const engine = options.engine ?? 'platform';
  const defaults = defaultChunkLimits(engine);
  const maxChars = options.maxChars ?? defaults.maxChars;
  const hardMax = options.hardMaxChars ?? defaults.hardMaxChars;
  const text = normalizeWhitespace(input);
  if (!text) return [];

  if (text.length <= maxChars) {
    return [{ index: 0, text, charCount: text.length }];
  }

  // SSML-aware: protect tags by splitting only on safe boundaries
  if (/<[^>]+>/.test(text)) {
    return chunkSsmlAware(text, maxChars, hardMax);
  }

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pieces: string[] = [];

  for (const para of paragraphs) {
    if (para.length <= maxChars) {
      pieces.push(para);
      continue;
    }
    pieces.push(...splitBySentences(para, maxChars, hardMax));
  }

  // Greedy pack small pieces into maxChars windows
  const packed: string[] = [];
  let buf = '';
  for (const piece of pieces) {
    if (!buf) {
      buf = piece;
      continue;
    }
    const candidate = `${buf}\n\n${piece}`;
    if (candidate.length <= maxChars) {
      buf = candidate;
    } else {
      packed.push(buf);
      buf = piece;
    }
  }
  if (buf) packed.push(buf);

  return packed.map((t, index) => ({
    index,
    text: t,
    charCount: t.length,
  }));
}

export function estimateWordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  // Strip tags for counting
  const plain = t.replace(/<[^>]+>/g, ' ');
  return plain.split(/\s+/).filter(Boolean).length;
}

/**
 * Detect chapter headings in plain/markdown text for bookmarking.
 */
/**
 * Detect chapter boundaries for long-form TTS.
 * Conservative: only real chapter markers (Chapter N / H1), not every ## section.
 * Markdown ##/### headings are ignored unless the document has few large sections
 * (avg body ≥ 200 words) — avoids 20+ micro-chapters that break concat.
 */
export function detectChapters(
  text: string,
): { title: string; text: string }[] {
  if (!text?.trim()) return [];

  // Primary: explicit "Chapter N" or ATX H1 only
  const primaryRe = /(?:^|\n)(#\s+[^\n]+|Chapter\s+\d+[:.\s][^\n]*)/gi;
  let matches = [...text.matchAll(primaryRe)];

  // Fallback: ## headings only when they form a small number of substantial sections
  if (matches.length < 2) {
    const h2Re = /(?:^|\n)(#{2,3}\s+[^\n]+)/gi;
    const h2 = [...text.matchAll(h2Re)];
    if (h2.length >= 2 && h2.length <= 12) {
      matches = h2;
    }
  }

  if (matches.length < 2) {
    return [{ title: 'Body', text: text.trim() }];
  }

  const chapters: { title: string; text: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const title = m[1].replace(/^#+\s*/, '').trim();
    const start = (m.index ?? 0) + m[0].length;
    const end =
      i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;
    const body = text.slice(start, end).trim();
    if (body) chapters.push({ title, text: body });
  }

  if (chapters.length < 2) {
    return [{ title: 'Body', text: text.trim() }];
  }

  const avgWords =
    chapters.reduce((n, c) => n + estimateWordCount(c.text), 0) /
    chapters.length;
  // Too many tiny sections → treat as single body (use chunker instead)
  if (chapters.length > 12 || avgWords < 40) {
    return [{ title: 'Body', text: text.trim() }];
  }
  return chapters;
}

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function chunkSsmlAware(
  text: string,
  maxChars: number,
  hardMax: number,
): TextChunk[] {
  // Split only at paragraph boundaries outside tags, or between closed tags
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const packed: string[] = [];
  let buf = '';
  for (const para of paragraphs) {
    if (para.length > hardMax) {
      if (buf) {
        packed.push(buf);
        buf = '';
      }
      // Fall back to sentence split but avoid mid-tag
      packed.push(...splitSsmlSafe(para, maxChars));
      continue;
    }
    const candidate = buf ? `${buf}\n\n${para}` : para;
    if (candidate.length <= maxChars) {
      buf = candidate;
    } else {
      if (buf) packed.push(buf);
      buf = para;
    }
  }
  if (buf) packed.push(buf);
  return packed.map((t, index) => ({ index, text: t, charCount: t.length }));
}

function splitSsmlSafe(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + maxChars, text.length);
    if (end < text.length) {
      // Prefer break at space not inside <...>
      let j = end;
      while (j > i + maxChars / 2) {
        if (text[j] === ' ' && !insideTag(text, j)) break;
        j--;
      }
      if (j > i + maxChars / 2) end = j;
    }
    out.push(text.slice(i, end).trim());
    i = end;
  }
  return out.filter(Boolean);
}

function insideTag(text: string, pos: number): boolean {
  const before = text.lastIndexOf('<', pos);
  const after = text.indexOf('>', pos);
  if (before === -1) return false;
  const closeBefore = text.lastIndexOf('>', pos);
  return before > closeBefore && after !== -1;
}

function splitBySentences(
  para: string,
  maxChars: number,
  hardMax: number,
): string[] {
  const sentences = para.match(/[^.!?]+[.!?]+|\S+$/g) || [para];
  const out: string[] = [];
  let buf = '';

  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > hardMax) {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      out.push(...splitByWords(s, maxChars));
      continue;
    }
    const candidate = buf ? `${buf} ${s}` : s;
    if (candidate.length <= maxChars) {
      buf = candidate;
    } else {
      if (buf) out.push(buf);
      buf = s;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function splitByWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let buf = '';
  for (const w of words) {
    const candidate = buf ? `${buf} ${w}` : w;
    if (candidate.length <= maxChars) {
      buf = candidate;
    } else {
      if (buf) out.push(buf);
      if (w.length > maxChars) {
        for (let i = 0; i < w.length; i += maxChars) {
          out.push(w.slice(i, i + maxChars));
        }
        buf = '';
      } else {
        buf = w;
      }
    }
  }
  if (buf) out.push(buf);
  return out;
}
