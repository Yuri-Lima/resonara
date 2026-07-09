/**
 * Split long documents into TTS-safe chunks at sentence/paragraph boundaries.
 * Pure functions — unit-testable without platform APIs.
 */

export interface ChunkOptions {
  /** Soft max characters per chunk (platform voice limits). Default 1800. */
  maxChars?: number;
  /** Hard max; force-split if a single sentence exceeds this. Default 2400. */
  hardMaxChars?: number;
}

export interface TextChunk {
  index: number;
  text: string;
  charCount: number;
}

const DEFAULT_MAX = 1800;
const DEFAULT_HARD = 2400;

/**
 * Chunk text for long-form TTS. Prefer paragraph breaks, then sentences, then words.
 */
export function chunkTextForTts(
  input: string,
  options: ChunkOptions = {},
): TextChunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX;
  const hardMax = options.hardMaxChars ?? DEFAULT_HARD;
  const text = normalizeWhitespace(input);
  if (!text) return [];

  if (text.length <= maxChars) {
    return [{ index: 0, text, charCount: text.length }];
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
  return t.split(/\s+/).filter(Boolean).length;
}

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
      // Force-break oversize tokens
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
