/**
 * Parse Resonara Expression Markup (REM).
 *
 * Directives (block or inline):
 *   {style: narrative|conversational|newscast|animated}
 *   {emotion: joy|sadness|tension|calm|anger, intensity: 0.0-1.0}
 *   {emphasis}word{/emphasis}  or  *word* for light emphasis
 * Paralinguistic (never spoken as words):
 *   [breath] [sigh] [laugh] [chuckle] [cough] [gasp] [pause:800ms]
 * Character blocks compose with dialogue tags [Name] text
 */
import {
  RemDocument,
  RemEmotion,
  RemNode,
  RemStyle,
} from './rem.types';

const STYLE_RE =
  /\{style:\s*(narrative|conversational|newscast|animated)\s*\}/gi;
const EMOTION_RE =
  /\{emotion:\s*(joy|sadness|tension|calm|anger|neutral)(?:\s*,\s*intensity:\s*([0-9]*\.?[0-9]+))?\s*\}/gi;
const EMPHASIS_RE = /\{emphasis\}([\s\S]*?)\{\/emphasis\}/gi;
const PARA_RE =
  /\[(breath|sigh|laugh|chuckle|cough|gasp|pause(?::\s*\d+\s*ms)?)\]/gi;

const STYLES = new Set<RemStyle>([
  'narrative',
  'conversational',
  'newscast',
  'animated',
]);
const EMOTIONS = new Set<RemEmotion>([
  'joy',
  'sadness',
  'tension',
  'calm',
  'anger',
  'neutral',
]);

export function stripRemToPlain(text: string): string {
  return text
    .replace(STYLE_RE, ' ')
    .replace(EMOTION_RE, ' ')
    .replace(EMPHASIS_RE, '$1')
    .replace(PARA_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ensure no paralinguistic tag names leak as spoken words.
 * Returns true if speakable still contains literal tag-like leaks.
 */
export function hasLiteralTagLeak(speakable: string): boolean {
  // bare [sigh] etc must not remain
  if (/\[(breath|sigh|laugh|chuckle|cough|gasp|pause(?::\s*\d+\s*ms)?)\]/i.test(speakable)) {
    return true;
  }
  // REM braces must not remain
  if (/\{style:|\{emotion:|\{emphasis\}/i.test(speakable)) {
    return true;
  }
  return false;
}

export function parseRem(input: string): RemDocument {
  const warnings: string[] = [];
  if (!input || !input.trim()) {
    return { nodes: [], warnings: ['empty rem input'] };
  }

  let style: RemStyle | undefined;
  let emotion: RemEmotion | undefined;
  let intensity: number | undefined;
  const nodes: RemNode[] = [];

  // Work on a mutable copy with placeholders for structured tokens
  type Tok =
    | { t: 'text'; v: string }
    | { t: 'style'; v: RemStyle }
    | { t: 'emotion'; v: RemEmotion; i: number }
    | { t: 'emphasis'; v: string }
    | { t: 'para'; event: string; ms?: number };

  const tokens: Tok[] = [];
  let i = 0;
  const s = input;

  while (i < s.length) {
    // style
    STYLE_RE.lastIndex = i;
    EMOTION_RE.lastIndex = i;
    EMPHASIS_RE.lastIndex = i;
    PARA_RE.lastIndex = i;

    const slice = s.slice(i);
    const mStyle = /^\{style:\s*(narrative|conversational|newscast|animated)\s*\}/i.exec(
      slice,
    );
    if (mStyle) {
      const st = mStyle[1].toLowerCase() as RemStyle;
      if (STYLES.has(st)) {
        tokens.push({ t: 'style', v: st });
        style = st;
      } else {
        warnings.push(`unknown style: ${mStyle[1]}`);
      }
      i += mStyle[0].length;
      continue;
    }

    const mEmo =
      /^\{emotion:\s*(joy|sadness|tension|calm|anger|neutral)(?:\s*,\s*intensity:\s*([0-9]*\.?[0-9]+))?\s*\}/i.exec(
        slice,
      );
    if (mEmo) {
      const em = mEmo[1].toLowerCase() as RemEmotion;
      const inten = mEmo[2] != null ? Math.min(1, Math.max(0, parseFloat(mEmo[2]))) : 0.6;
      if (EMOTIONS.has(em)) {
        tokens.push({ t: 'emotion', v: em, i: inten });
        emotion = em;
        intensity = inten;
      }
      i += mEmo[0].length;
      continue;
    }

    const mEmp = /^\{emphasis\}([\s\S]*?)\{\/emphasis\}/i.exec(slice);
    if (mEmp) {
      tokens.push({ t: 'emphasis', v: mEmp[1] });
      i += mEmp[0].length;
      continue;
    }

    const mPara =
      /^\[(breath|sigh|laugh|chuckle|cough|gasp|pause(?::\s*(\d+)\s*ms)?)\]/i.exec(
        slice,
      );
    if (mPara) {
      const raw = mPara[1].toLowerCase();
      if (raw.startsWith('pause')) {
        const ms = mPara[2] ? parseInt(mPara[2], 10) : 400;
        tokens.push({ t: 'para', event: 'pause', ms });
      } else {
        tokens.push({ t: 'para', event: raw });
      }
      i += mPara[0].length;
      continue;
    }

    // plain char
    // accumulate until next special
    let j = i + 1;
    while (j < s.length) {
      const c = s[j];
      if (c === '{' || c === '[') break;
      j++;
    }
    tokens.push({ t: 'text', v: s.slice(i, j) });
    i = j;
  }

  for (const tok of tokens) {
    if (tok.t === 'text') {
      if (tok.v) nodes.push({ kind: 'text', text: tok.v });
    } else if (tok.t === 'style') {
      nodes.push({ kind: 'style', style: tok.v });
    } else if (tok.t === 'emotion') {
      nodes.push({ kind: 'emotion', emotion: tok.v, intensity: tok.i });
    } else if (tok.t === 'emphasis') {
      nodes.push({ kind: 'emphasis', text: tok.v });
    } else if (tok.t === 'para') {
      nodes.push({
        kind: 'paralinguistic',
        event: tok.event as
          | 'breath'
          | 'sigh'
          | 'laugh'
          | 'chuckle'
          | 'cough'
          | 'gasp'
          | 'pause',
        ms: tok.ms,
      });
    }
  }

  return { nodes, style, emotion, intensity, warnings };
}

/** True if input contains any REM directives or paralinguistic events. */
export function hasRemMarkup(text: string): boolean {
  if (!text) return false;
  return (
    /\{style:\s*\w+/i.test(text) ||
    /\{emotion:\s*\w+/i.test(text) ||
    /\{emphasis\}/i.test(text) ||
    /\[(breath|sigh|laugh|chuckle|cough|gasp|pause(?::\s*\d+\s*ms)?)\]/i.test(
      text,
    )
  );
}
