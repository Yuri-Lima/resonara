/**
 * Configurable text preprocessing for TTS document imports.
 * Strips PDF/extraction poison (page numbers, running headers, footnotes)
 * before chunking. Defaults: ON for document imports, OFF for raw paste.
 */

export type UrlMode = 'spoken' | 'stripped' | 'verbatim';
export type CitationMode = 'removed' | 'spoken' | 'verbatim';

export interface PreprocessRules {
  pageNumbers?: boolean;
  headers?: boolean;
  footnotes?: boolean;
  citations?: boolean | CitationMode;
  urls?: boolean | UrlMode;
  dashes?: boolean;
  allCapsHeadings?: boolean;
  whitespace?: boolean;
}

export interface PreprocessOptions {
  /** When true, apply document-import defaults (most rules ON). */
  documentMode?: boolean;
  rules?: PreprocessRules;
}

export interface RemovalRecord {
  rule: string;
  text: string;
  position: number;
}

export interface PreprocessResult {
  original: string;
  cleaned: string;
  removals: RemovalRecord[];
}

/** Dialogue speaker tags like [narrator], [Alice] — not single-letter/digit footnotes. */
const DIALOGUE_TAG_RE = /^\[([a-zA-Z][a-zA-Z0-9_\- ]{1,40})\]$/;

/** Defaults for document imports (PDF/EPUB/DOCX extraction artifacts). */
export const DOCUMENT_DEFAULTS: Required<
  Omit<PreprocessRules, 'citations' | 'urls'>
> & { citations: CitationMode; urls: UrlMode } = {
  pageNumbers: true,
  headers: true,
  footnotes: true,
  citations: 'removed',
  urls: 'spoken',
  dashes: true,
  allCapsHeadings: true,
  whitespace: true,
};

/** Defaults for raw text paste — user typed exactly what they want. */
export const RAW_DEFAULTS: Required<
  Omit<PreprocessRules, 'citations' | 'urls'>
> & { citations: CitationMode; urls: UrlMode } = {
  pageNumbers: false,
  headers: false,
  footnotes: false,
  citations: 'verbatim',
  urls: 'verbatim',
  dashes: false,
  allCapsHeadings: false,
  whitespace: false,
};

function resolveRules(opts?: PreprocessOptions): {
  pageNumbers: boolean;
  headers: boolean;
  footnotes: boolean;
  citations: CitationMode;
  urls: UrlMode;
  dashes: boolean;
  allCapsHeadings: boolean;
  whitespace: boolean;
} {
  const base = opts?.documentMode ? DOCUMENT_DEFAULTS : RAW_DEFAULTS;
  const r = opts?.rules || {};
  const citations: CitationMode =
    r.citations === true
      ? 'removed'
      : r.citations === false
        ? 'verbatim'
        : typeof r.citations === 'string'
          ? r.citations
          : base.citations;
  const urls: UrlMode =
    r.urls === true
      ? 'spoken'
      : r.urls === false
        ? 'verbatim'
        : typeof r.urls === 'string'
          ? r.urls
          : base.urls;
  return {
    pageNumbers: r.pageNumbers ?? base.pageNumbers,
    headers: r.headers ?? base.headers,
    footnotes: r.footnotes ?? base.footnotes,
    citations,
    urls,
    dashes: r.dashes ?? base.dashes,
    allCapsHeadings: r.allCapsHeadings ?? base.allCapsHeadings,
    whitespace: r.whitespace ?? base.whitespace,
  };
}

function isPageNumberLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^\d{1,4}$/.test(t)) return true;
  // "Page 3", "page 12"
  if (/^page\s+\d{1,4}$/i.test(t)) return true;
  // "Page 1 of 99", "página 2 de 10" (common PDF footer forms)
  if (/^page\s+\d{1,4}\s+of\s+\d{1,4}$/i.test(t)) return true;
  if (/^p[aá]gina\s+\d{1,4}(\s+de\s+\d{1,4})?$/i.test(t)) return true;
  // "2 of 10"
  if (/^\d{1,4}\s+of\s+\d{1,4}$/i.test(t)) return true;
  if (/^-\s*\d{1,4}\s*-$/.test(t)) return true;
  return false;
}

function isAllCapsHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 4 || t.length > 80) return false;
  // Must have letters and be mostly uppercase
  if (!/[A-Z]/.test(t)) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  if (upper / letters.length < 0.9) return false;
  // Not a single word acronym line like "NASA" alone under 5 chars with digits
  if (/https?:\/\//i.test(t)) return false;
  return true;
}

function toTitleCase(line: string): string {
  return line
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/** Speak-friendly URL: strip scheme, expand dots/slashes. */
export function urlToSpoken(url: string): string {
  let u = url.trim();
  u = u.replace(/^https?:\/\//i, '');
  u = u.replace(/^www\./i, '');
  u = u.replace(/\/+$/, '');
  const parts: string[] = [];
  for (const ch of u) {
    if (ch === '.') parts.push(' dot ');
    else if (ch === '/') parts.push(' slash ');
    else if (ch === '-' || ch === '_') parts.push(' ');
    else if (ch === '?' || ch === '#' || ch === '&' || ch === '=') parts.push(' ');
    else parts.push(ch);
  }
  return parts
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripFootnoteMarkers(text: string, removals: RemovalRecord[]): string {
  // Preserve dialogue tags like [narrator], [Alice]
  // Remove [1], [12], [a], [b] style footnote refs (single letter or digits)
  let out = text.replace(/\[([^\]]+)\]/g, (match, inner: string, offset: number) => {
    if (DIALOGUE_TAG_RE.test(match)) {
      return match;
    }
    // Footnote: digits only, or single letter
    if (/^\d{1,3}$/.test(inner) || /^[a-zA-Z]$/.test(inner)) {
      removals.push({ rule: 'footnotes', text: match, position: offset });
      return '';
    }
    return match;
  });
  // Trailing footnote markers after a word (asterisk, dagger, superscripts)
  out = out.replace(
    /(\w)([*†‡§¶]+|\u00B9|\u00B2|\u00B3|[\u2070-\u2079]+)/g,
    (match, wordChar: string, mark: string, offset: number) => {
      removals.push({ rule: 'footnotes', text: mark, position: offset + wordChar.length });
      return wordChar;
    },
  );
  return out;
}

function handleCitations(
  text: string,
  mode: CitationMode,
  removals: RemovalRecord[],
): string {
  if (mode === 'verbatim') return text;
  // Numeric bracket citations [12] already handled by footnotes if enabled;
  // academic: (Smith et al., 2023) / (Smith, 2023)
  return text.replace(
    /\(([A-Z][A-Za-z\-']+(?:\s+et\s+al\.)?(?:\s+and\s+[A-Z][A-Za-z\-']+)?,?\s*\d{4}[a-z]?)\)/g,
    (match, _g, offset: number) => {
      if (mode === 'removed') {
        removals.push({ rule: 'citations', text: match, position: offset });
        return '';
      }
      // spoken: "Smith et al 2023"
      const spoken = match
        .slice(1, -1)
        .replace(/,/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      removals.push({ rule: 'citations', text: match, position: offset });
      return spoken;
    },
  );
}

function handleUrls(
  text: string,
  mode: UrlMode,
  removals: RemovalRecord[],
): string {
  if (mode === 'verbatim') return text;
  const urlRe = /https?:\/\/[^\s<>"')\]]+/gi;
  return text.replace(urlRe, (match, offset: number) => {
    if (mode === 'stripped') {
      removals.push({ rule: 'urls', text: match, position: offset });
      return '';
    }
    const spoken = urlToSpoken(match);
    removals.push({ rule: 'urls', text: match, position: offset });
    return spoken;
  });
}

function normalizeDashes(text: string): string {
  return text
    .replace(/\u2014|\u2013/g, ' — ') // em/en dash → spaced em for pause
    .replace(/\.{3,}|…/g, '…')
    .replace(/\s+—\s+/g, ' — ')
    .replace(/[ \t]+/g, ' ');
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Preprocess text for TTS. Pure function; safe to call twice (idempotent for
 * document defaults when input is already cleaned).
 */
export function preprocessText(
  original: string,
  opts?: PreprocessOptions,
): PreprocessResult {
  if (original == null || original === '') {
    return { original: original ?? '', cleaned: original ?? '', removals: [] };
  }

  const rules = resolveRules(opts);
  const removals: RemovalRecord[] = [];
  let text = original;

  // Line-oriented rules first
  if (rules.pageNumbers || rules.headers || rules.allCapsHeadings) {
    const lines = text.split('\n');
    let headerCounts: Map<string, number> | null = null;
    if (rules.headers) {
      headerCounts = new Map();
      for (const line of lines) {
        const key = line.trim();
        if (key.length >= 4 && key.length <= 80 && !isPageNumberLine(key)) {
          headerCounts.set(key, (headerCounts.get(key) || 0) + 1);
        }
      }
    }

    const out: string[] = [];
    let pos = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      const linePos = original.indexOf(line, pos);
      pos = linePos >= 0 ? linePos + line.length : pos;

      if (rules.pageNumbers && isPageNumberLine(line)) {
        removals.push({
          rule: 'pageNumbers',
          text: trimmed,
          position: linePos >= 0 ? linePos : 0,
        });
        continue;
      }

      if (
        rules.headers &&
        headerCounts &&
        trimmed.length >= 4 &&
        (headerCounts.get(trimmed) || 0) >= 3
      ) {
        removals.push({
          rule: 'headers',
          text: trimmed,
          position: linePos >= 0 ? linePos : 0,
        });
        continue;
      }

      if (rules.allCapsHeadings && isAllCapsHeading(line)) {
        const titled = toTitleCase(line);
        removals.push({
          rule: 'allCapsHeadings',
          text: trimmed,
          position: linePos >= 0 ? linePos : 0,
        });
        out.push(titled);
        continue;
      }

      out.push(line);
    }
    text = out.join('\n');
  }

  if (rules.footnotes) {
    text = stripFootnoteMarkers(text, removals);
  }

  if (rules.citations !== 'verbatim') {
    text = handleCitations(text, rules.citations, removals);
  }

  if (rules.urls !== 'verbatim') {
    text = handleUrls(text, rules.urls, removals);
  }

  if (rules.dashes) {
    text = normalizeDashes(text);
  }

  if (rules.whitespace) {
    text = collapseWhitespace(text);
  }

  return { original, cleaned: text, removals };
}

/** Convenience: document-import defaults. */
export function preprocessDocument(text: string, rules?: PreprocessRules): PreprocessResult {
  return preprocessText(text, { documentMode: true, rules });
}

/** Convenience: raw paste defaults (usually no-op unless rules override). */
export function preprocessRaw(text: string, rules?: PreprocessRules): PreprocessResult {
  return preprocessText(text, { documentMode: false, rules });
}
