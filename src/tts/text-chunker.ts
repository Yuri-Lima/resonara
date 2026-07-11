/**
 * Split long documents into TTS-safe chunks at sentence/paragraph boundaries.
 * Pure functions — unit-testable without platform APIs.
 * Engine-aware: Piper uses larger chunks for cross-sentence prosody.
 * Language-aware: abbreviation protection + Brazilian number format + em-dash dialogue.
 * Emits a pause map (endsAt + intraBoundaries) for boundary-aware assembly.
 */

import {
  getLanguageConfig,
  tryGetLanguageConfig,
} from './language/language-registry';
import { LanguageCode } from './language/language.types';
import {
  ChunkEndBoundary,
  PauseMapEntry,
} from './pause/pause.types';
import { KOKORO_MAX_CHARS } from './kokoro-tts';
import { EXPRESSIVE_MAX_CHARS } from './expressive-tts';
import {
  classifyPieceEnd,
  detectHeaderLine,
  findIntraBoundaries,
  isChapterSeparator,
} from './pause/boundary-detect';

export type ChunkEngine = 'piper' | 'platform' | 'kokoro' | 'expressive';

export interface ChunkOptions {
  /** Soft max characters per chunk. Default engine-aware. */
  maxChars?: number;
  /** Hard max; force-split if a single sentence exceeds this. */
  hardMaxChars?: number;
  /** Engine selects defaults when max not provided. */
  engine?: ChunkEngine;
  /** Language for abbreviation / number / dialogue rules. */
  language?: LanguageCode;
}

export interface TextChunk {
  index: number;
  text: string;
  charCount: number;
  /** Boundary metadata for pause-aware assembly. */
  pause?: PauseMapEntry;
}

const PLATFORM_MAX = 1800;
const PLATFORM_HARD = 2400;
const PIPER_MAX = 4000;
const PIPER_HARD = 6000;

export function defaultChunkLimits(engine: ChunkEngine = 'platform'): {
  maxChars: number;
  hardMaxChars: number;
} {
  if (engine === 'expressive') {
    return {
      maxChars: EXPRESSIVE_MAX_CHARS,
      hardMaxChars: Math.round(EXPRESSIVE_MAX_CHARS * 1.5),
    };
  }
  if (engine === 'kokoro') {
    // Kokoro practical max from shared constant (G28 A5 drift fix)
    return { maxChars: KOKORO_MAX_CHARS, hardMaxChars: Math.round(KOKORO_MAX_CHARS * 1.5) };
  }
  if (engine === 'piper') {
    return { maxChars: PIPER_MAX, hardMaxChars: PIPER_HARD };
  }
  return { maxChars: PLATFORM_MAX, hardMaxChars: PLATFORM_HARD };
}

interface AnnotatedPiece {
  text: string;
  /** Boundary type if this piece is flushed as a chunk end. */
  endHint: ChunkEndBoundary;
  /** True when piece is a header/title line. */
  isHeader?: boolean;
  headerLevel?: number;
  /** Forced mid-sentence/word split. */
  forced?: boolean;
  /** Explicit SSML break ms that ends this piece. */
  explicitBreakMs?: number;
}

/**
 * Chunk text for long-form TTS. Prefer paragraph breaks, then sentences, then words.
 * Never splits inside SSML tags when markup is present.
 * Each chunk carries pause map metadata (endsAt + intraBoundaries).
 */
export function chunkTextForTts(
  input: string,
  options: ChunkOptions = {},
): TextChunk[] {
  const engine = options.engine ?? 'platform';
  const defaults = defaultChunkLimits(engine);
  const maxChars = options.maxChars ?? defaults.maxChars;
  const hardMax = options.hardMaxChars ?? defaults.hardMaxChars;
  const language = options.language || 'en';
  const text = normalizeWhitespace(input);
  if (!text) return [];

  // SSML-aware: protect tags by splitting only on safe boundaries
  if (/<[^>]+>/.test(text)) {
    return annotateSsmlChunks(chunkSsmlAware(text, maxChars, hardMax), language);
  }

  // Always collect annotated pieces so paragraph/header boundaries become
  // chunk edges (even when total length < maxChars). A single packed chunk
  // would erase structural pauses at assembly time.
  const pieces = collectAnnotatedPieces(text, maxChars, hardMax, language);
  if (!pieces.length) {
    return [buildChunk(0, text, language, 'document-end')];
  }
  const packed = packAnnotatedPieces(pieces, maxChars);
  return packed.map((p, index) =>
    buildChunk(index, p.text, language, p.endsAt, {
      isHeader: p.isHeader,
      headerLevel: p.headerLevel,
      explicitBreakMs: p.explicitBreakMs,
    }),
  );
}

function buildChunk(
  index: number,
  text: string,
  language: string,
  endsAt: ChunkEndBoundary,
  extra: {
    isHeader?: boolean;
    headerLevel?: number;
    explicitBreakMs?: number;
  } = {},
): TextChunk {
  const header =
    extra.isHeader != null
      ? { isHeader: extra.isHeader, headerLevel: extra.headerLevel }
      : detectHeaderFromChunk(text);
  return {
    index,
    text,
    charCount: text.length,
    pause: {
      endsAt,
      intraBoundaries: findIntraBoundaries(text, language),
      isHeader: header.isHeader,
      headerLevel: header.headerLevel,
      explicitBreakMs: extra.explicitBreakMs,
    },
  };
}

function detectHeaderFromChunk(text: string): {
  isHeader?: boolean;
  headerLevel?: number;
} {
  const first = text.trim().split('\n')[0] || '';
  const h = detectHeaderLine(first);
  if (h && text.trim().split('\n').length <= 2) {
    return { isHeader: true, headerLevel: h.level };
  }
  return {};
}

function collectAnnotatedPieces(
  text: string,
  maxChars: number,
  hardMax: number,
  language: LanguageCode,
): AnnotatedPiece[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    // Horizontal rules are chapter markers, not spoken content. Drop them so
    // the chapter gap is applied once at the next H1 rather than triple-stacked.
    .filter((p) => !/^---+\s*$/.test(p));
  const pieces: AnnotatedPiece[] = [];

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const para = paragraphs[pi];
    const lines = para.split('\n');
    const firstLine = lines[0] || para;
    const header = detectHeaderLine(firstLine);
    const isSep = isChapterSeparator(para);

    // Prefer not to split header away from its first paragraph body unless forced
    if (header && lines.length === 1) {
      // Standalone header line (markdown) — ends as header/chapter before next para
      const endsAt: ChunkEndBoundary =
        header.level === 1 || isSep ? 'chapter' : 'header';
      pieces.push({
        text: para,
        endHint: endsAt,
        isHeader: true,
        headerLevel: header.level,
      });
      continue;
    }

    if (para.length <= maxChars) {
      // Whole paragraph — ends at paragraph (or document if last)
      const isLast = pi === paragraphs.length - 1;
      let endHint: ChunkEndBoundary = isLast ? 'document-end' : 'paragraph';
      if (header) {
        endHint = header.level === 1 ? 'chapter' : 'header';
      }
      // Dialogue paragraph (pt-BR travessão)
      if (
        language.startsWith('pt') &&
        /^[—–]/.test(para.trim()) &&
        pi + 1 < paragraphs.length &&
        /^[—–]/.test(paragraphs[pi + 1].trim())
      ) {
        endHint = 'dialogue';
      }
      pieces.push({
        text: para,
        endHint,
        isHeader: !!header && lines.length === 1,
        headerLevel: header?.level,
      });
      continue;
    }

    // Large paragraph: sentence split — never split inside dash clause if avoidable
    const sentPieces = splitBySentencesAnnotated(
      para,
      maxChars,
      hardMax,
      language,
    );
    for (let si = 0; si < sentPieces.length; si++) {
      const sp = sentPieces[si];
      const isLastSent = si === sentPieces.length - 1;
      const isLastPara = pi === paragraphs.length - 1;
      let endHint: ChunkEndBoundary = sp.forced
        ? 'forced'
        : isLastSent
          ? isLastPara
            ? 'document-end'
            : 'paragraph'
          : 'sentence';
      if (sp.forced) endHint = 'forced';
      pieces.push({ ...sp, endHint });
    }
  }

  return pieces;
}

function splitBySentencesAnnotated(
  para: string,
  maxChars: number,
  hardMax: number,
  language: LanguageCode,
): AnnotatedPiece[] {
  const sentences = splitSentencesLanguageAware(para, language);
  const out: AnnotatedPiece[] = [];
  let buf = '';

  const flush = (text: string, forced: boolean) => {
    if (!text) return;
    // Avoid ending mid dash-clause when possible
    let endHint: ChunkEndBoundary = forced ? 'forced' : 'sentence';
    if (/[—–]\s*$/.test(text.trim()) && !forced) endHint = 'dash-clause';
    out.push({ text, endHint, forced });
  };

  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > hardMax) {
      if (buf) {
        flush(buf, false);
        buf = '';
      }
      for (const w of splitByWords(s, maxChars)) {
        flush(w, true);
      }
      continue;
    }
    // Don't pack across dash clause mid-attribution if it would split oddly
    const candidate = buf ? `${buf} ${s}` : s;
    if (candidate.length <= maxChars) {
      buf = candidate;
    } else {
      if (buf) flush(buf, false);
      buf = s;
    }
  }
  if (buf) flush(buf, false);
  return out;
}

function packAnnotatedPieces(
  pieces: AnnotatedPiece[],
  maxChars: number,
): Array<{
  text: string;
  endsAt: ChunkEndBoundary;
  isHeader?: boolean;
  headerLevel?: number;
  explicitBreakMs?: number;
}> {
  const packed: Array<{
    text: string;
    endsAt: ChunkEndBoundary;
    isHeader?: boolean;
    headerLevel?: number;
    explicitBreakMs?: number;
  }> = [];

  let buf = '';
  let bufIsHeader: boolean | undefined;
  let bufHeaderLevel: number | undefined;
  let lastEndHint: ChunkEndBoundary = 'document-end';

  const flushBuf = (endsAt: ChunkEndBoundary) => {
    if (!buf) return;
    packed.push({
      text: buf,
      endsAt,
      isHeader: bufIsHeader,
      headerLevel: bufHeaderLevel,
    });
    buf = '';
    bufIsHeader = undefined;
    bufHeaderLevel = undefined;
  };

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (!buf) {
      buf = piece.text;
      bufIsHeader = piece.isHeader;
      bufHeaderLevel = piece.headerLevel;
      lastEndHint = piece.endHint;
      continue;
    }

    // Never pack a header into previous body unless size forces (then forced)
    if (piece.isHeader) {
      flushBuf(lastEndHint === 'document-end' ? 'paragraph' : lastEndHint);
      buf = piece.text;
      bufIsHeader = piece.isHeader;
      bufHeaderLevel = piece.headerLevel;
      lastEndHint = piece.endHint;
      continue;
    }

    // Never pack across structural boundaries — assembly inserts the gap
    // at chunk edges. Packing paragraphs would erase paragraph pauses.
    if (
      lastEndHint === 'header' ||
      lastEndHint === 'chapter' ||
      lastEndHint === 'dialogue' ||
      lastEndHint === 'paragraph' ||
      lastEndHint === 'ssml-break' ||
      piece.isHeader
    ) {
      flushBuf(lastEndHint);
      buf = piece.text;
      bufIsHeader = piece.isHeader;
      bufHeaderLevel = piece.headerLevel;
      lastEndHint = piece.endHint;
      continue;
    }

    // Only pack sentence-level pieces into larger windows
    const joiner = ' ';
    const candidate = `${buf}${joiner}${piece.text}`;
    if (candidate.length <= maxChars && !piece.forced) {
      buf = candidate;
      lastEndHint = rankBoundary(lastEndHint, piece.endHint);
      continue;
    }

    // Flush current buffer; ending boundary is lastEndHint
    flushBuf(lastEndHint);
    buf = piece.text;
    bufIsHeader = piece.isHeader;
    bufHeaderLevel = piece.headerLevel;
    lastEndHint = piece.endHint;
  }
  if (buf) flushBuf(lastEndHint);

  // Last chunk always document-end
  if (packed.length) {
    packed[packed.length - 1].endsAt = 'document-end';
  }
  return packed;
}

function rankBoundary(
  a: ChunkEndBoundary,
  b: ChunkEndBoundary,
): ChunkEndBoundary {
  const rank: Record<ChunkEndBoundary, number> = {
    'document-end': 0,
    forced: 1,
    'dash-clause': 2,
    sentence: 3,
    dialogue: 4,
    'ssml-break': 5,
    paragraph: 6,
    header: 7,
    chapter: 8,
  };
  return (rank[a] || 0) >= (rank[b] || 0) ? a : b;
}

function annotateSsmlChunks(
  chunks: TextChunk[],
  language: string,
): TextChunk[] {
  return chunks.map((c, i) => {
    const isLast = i === chunks.length - 1;
    // Detect explicit break at end of chunk text
    const breakM = c.text.match(
      /<break\b[^>]*\btime\s*=\s*["']?(\d+(?:\.\d+)?)(ms|s)?["']?[^>]*\/?>\s*$/i,
    );
    let endsAt: ChunkEndBoundary = isLast ? 'document-end' : 'paragraph';
    let explicitBreakMs: number | undefined;
    if (breakM) {
      endsAt = 'ssml-break';
      let ms = parseFloat(breakM[1]);
      if ((breakM[2] || 'ms') === 's') ms *= 1000;
      explicitBreakMs = Math.round(ms);
    } else if (!isLast) {
      const next = chunks[i + 1]?.text || '';
      endsAt = classifyPieceEnd(c.text, next, { language });
    }
    return buildChunk(i, c.text, language, endsAt, { explicitBreakMs });
  });
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

/**
 * Sentence split with abbreviation protection, Brazilian thousands separators,
 * and Portuguese em-dash dialogue awareness.
 */
export function splitSentencesLanguageAware(
  text: string,
  language: LanguageCode = 'en',
): string[] {
  if (!text.trim()) return [];
  const cfg = tryGetLanguageConfig(language) || getLanguageConfig('en');
  let protectedText = text;
  const placeholders: string[] = [];
  const protect = (m: string): string => {
    const token = `\uE000${placeholders.length}\uE001`;
    placeholders.push(m);
    return token;
  };

  for (const abbr of cfg.abbreviations) {
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'gi');
    protectedText = protectedText.replace(re, (m) => protect(m));
  }

  // Protect Brazilian numbers 1.234,56 (periods as thousands)
  if (cfg.code === 'pt-BR' || cfg.numberFormat.thousands === '.') {
    protectedText = protectedText.replace(
      /\d{1,3}(?:\.\d{3})+(?:,\d+)?/g,
      (m) => protect(m),
    );
  }

  // Protect English thousands 1,234.56
  if (cfg.numberFormat.thousands === ',') {
    protectedText = protectedText.replace(
      /\d{1,3}(?:,\d{3})+(?:\.\d+)?/g,
      (m) => protect(m),
    );
  }

  // Split on sentence terminators; keep delimiter with lookbehind
  const parts = protectedText.split(/(?<=[.!?…])(?=\s+|$)/);
  const restored = parts
    .map((p) => {
      let s = p;
      for (let i = 0; i < placeholders.length; i++) {
        s = s.split(`\uE000${i}\uE001`).join(placeholders[i]);
      }
      return s.trim();
    })
    .filter(Boolean);

  return restored.length ? restored : [text];
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
