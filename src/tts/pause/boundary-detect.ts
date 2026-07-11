/**
 * Detect headers, chapter markers, dialogue travessões, and intra-chunk
 * punctuation for the pause map.
 */
import {
  ChunkEndBoundary,
  IntraBoundary,
  IntraBoundaryType,
} from './pause.types';

const HEADER_RE = /^(#{1,6})\s+(.+)$/;
const PLAIN_TITLE_RE =
  /^([A-Z][A-Za-z0-9 ,:;'"\-]{2,60}|[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç0-9 ,:;'"\-]{2,60})$/;

export interface HeaderInfo {
  level: number;
  title: string;
  /** Original line including # markers. */
  raw: string;
}

/** Detect markdown ATX header or plain-text Title Case standalone line. */
export function detectHeaderLine(line: string): HeaderInfo | null {
  const t = line.trim();
  if (!t) return null;
  const m = t.match(HEADER_RE);
  if (m) {
    return { level: m[1].length, title: m[2].trim(), raw: t };
  }
  // Plain-text heuristic: short standalone Title Case, no terminal period
  if (
    t.length <= 60 &&
    t.length >= 3 &&
    !/[.!?…]$/.test(t) &&
    !t.includes('\n') &&
    PLAIN_TITLE_RE.test(t) &&
    /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(t) &&
    t.split(/\s+/).length <= 10
  ) {
    // Avoid treating normal sentences as headers
    const words = t.split(/\s+/);
    const titleish = words.filter((w) => /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(w)).length;
    if (titleish >= Math.ceil(words.length * 0.6)) {
      return { level: 2, title: t, raw: t };
    }
  }
  return null;
}

/** Chapter separator lines (--- or # Chapter). */
export function isChapterSeparator(line: string): boolean {
  const t = line.trim();
  if (/^---+\s*$/.test(t)) return true;
  if (/^#\s+/.test(t) && /chapter|capítulo|capitulo/i.test(t)) return true;
  if (/^chapter\s+\d+/i.test(t)) return true;
  if (/^capítulo\s+\d+/i.test(t)) return true;
  return false;
}

/**
 * Scan chunk text for intra-chunk punctuation offsets.
 * Offsets are relative to the chunk string.
 */
export function findIntraBoundaries(
  text: string,
  language = 'en',
): IntraBoundary[] {
  const out: IntraBoundary[] = [];
  const push = (offset: number, type: IntraBoundaryType, explicitMs?: number) => {
    out.push({ offset, type, explicitMs });
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ',') push(i, 'comma');
    else if (ch === ';') push(i, 'semicolon');
    else if (ch === ':') push(i, 'colon');
    else if (ch === '—' || ch === '–') {
      // Dialogue attribution vs clause dash
      const lineStart = text.lastIndexOf('\n', i) + 1;
      const before = text.slice(lineStart, i);
      const isDialogueLine =
        (language.startsWith('pt') || language === 'pt-BR') &&
        (before.trim() === '' || /[.!?…]\s*$/.test(before));
      // Mid-line travessão after speech often marks attribution
      if (
        language.startsWith('pt') &&
        before.trim() !== '' &&
        /[?!.…]"?\s*$/.test(before.trimEnd())
      ) {
        push(i, 'dialogue-attrib');
      } else if (isDialogueLine && before.trim() === '') {
        // dialogue open — not usually a micro-pause target inside chunk
        push(i, 'em-dash');
      } else {
        push(i, 'em-dash');
      }
    } else if (ch === '…') push(i, 'ellipsis');
    else if (ch === '.' || ch === '!' || ch === '?') {
      // sentence end if followed by space/end (not abbreviation-safe here;
      // chunker already protects abbreviations at split time)
      const next = text[i + 1];
      if (next == null || /\s/.test(next)) push(i, 'sentence');
    }
  }

  // SSML explicit breaks
  const breakRe = /<break\b[^>]*\btime\s*=\s*["']?(\d+(?:\.\d+)?)(ms|s)?["']?[^>]*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = breakRe.exec(text)) !== null) {
    let ms = parseFloat(m[1]);
    if ((m[2] || 'ms') === 's') ms *= 1000;
    push(m.index, 'ssml-break', Math.round(ms));
  }

  out.sort((a, b) => a.offset - b.offset);
  return out;
}

/**
 * Classify how a piece of text ends (before packing into a chunk).
 */
export function classifyPieceEnd(
  piece: string,
  nextPiece: string | null,
  opts: { language?: string; forced?: boolean } = {},
): ChunkEndBoundary {
  if (opts.forced) return 'forced';
  if (nextPiece == null) return 'document-end';

  const trimmed = piece.trimEnd();
  const next = nextPiece.trimStart();

  // Header → body
  const nextHeader = detectHeaderLine(next.split('\n')[0] || next);
  if (nextHeader) {
    return nextHeader.level === 1 ? 'chapter' : 'header';
  }
  const selfHeader = detectHeaderLine(trimmed.split('\n').pop() || trimmed);
  if (selfHeader) {
    return selfHeader.level === 1 ? 'chapter' : 'header';
  }

  // Chapter separator was its own piece
  if (isChapterSeparator(trimmed) || isChapterSeparator(next.split('\n')[0] || '')) {
    return 'chapter';
  }

  // Dialogue line end (pt-BR travessão lines)
  if (
    opts.language?.startsWith('pt') &&
    /^[—–]/.test(trimmed) &&
    /^[—–]/.test(next)
  ) {
    return 'dialogue';
  }

  // Paragraph: original split was on blank line — caller passes flag via
  // trailing \n\n or we detect when next starts a new para after blank.
  // Pieces from paragraph split always get 'paragraph' unless sentence-packed.
  if (/\n\n$/.test(piece) || piece.endsWith('\n\n')) return 'paragraph';

  // Sentence end
  if (/[.!?…]["')\]]?\s*$/.test(trimmed)) return 'sentence';

  // Dash clause mid-thought
  if (/[—–]\s*$/.test(trimmed)) return 'dash-clause';

  return 'forced';
}

/**
 * Strip markdown markers for synthesis while preserving spoken words.
 */
export function toSpeakable(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---+\s*$/gm, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
