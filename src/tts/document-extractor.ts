/**
 * Document → structured text with chapter boundaries.
 * Supports Markdown, plain text, DOCX (mammoth), PDF (pdf-parse), EPUB (zip HTML).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

export interface ExtractedChapter {
  title: string;
  text: string;
}

export interface ExtractedDocument {
  title: string;
  chapters: ExtractedChapter[];
  totalWords: number;
  format: string;
}

export type DocumentFormat = 'md' | 'txt' | 'docx' | 'pdf' | 'epub' | 'html';

export function detectFormat(
  filePath: string,
  mime?: string,
): DocumentFormat {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'md';
  if (ext === '.docx') return 'docx';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.epub') return 'epub';
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.txt') return 'txt';
  if (mime?.includes('pdf')) return 'pdf';
  if (mime?.includes('wordprocessingml')) return 'docx';
  if (mime?.includes('epub')) return 'epub';
  return 'txt';
}

export async function extractText(
  filePath: string,
  format?: DocumentFormat,
): Promise<ExtractedDocument> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const fmt = format || detectFormat(filePath);
  switch (fmt) {
    case 'md':
      return extractMarkdown(filePath);
    case 'docx':
      return extractDocx(filePath);
    case 'pdf':
      return extractPdf(filePath);
    case 'epub':
      return extractEpub(filePath);
    case 'html':
      return extractHtmlFile(filePath);
    default:
      return extractPlain(filePath);
  }
}

function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function extractPlain(filePath: string): ExtractedDocument {
  const text = fs.readFileSync(filePath, 'utf8');
  const chapters = splitByChapterMarkers(text);
  const title = path.basename(filePath, path.extname(filePath));
  return {
    title,
    chapters,
    totalWords: wordCount(chapters.map((c) => c.text).join(' ')),
    format: 'txt',
  };
}

function extractMarkdown(filePath: string): ExtractedDocument {
  const text = fs.readFileSync(filePath, 'utf8');
  const title = path.basename(filePath, path.extname(filePath));
  const lines = text.split(/\r?\n/);
  const chapters: ExtractedChapter[] = [];
  let currentTitle = 'Introduction';
  let buf: string[] = [];

  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) chapters.push({ title: currentTitle, text: body });
    buf = [];
  };

  for (const line of lines) {
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      flush();
      currentTitle = h[2].trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  if (!chapters.length && text.trim()) {
    chapters.push({ title: 'Body', text: text.trim() });
  }
  return {
    title,
    chapters,
    totalWords: wordCount(chapters.map((c) => c.text).join(' ')),
    format: 'md',
  };
}

async function extractDocx(filePath: string): Promise<ExtractedDocument> {
  // Dynamic import so tests can run without native issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require('mammoth') as {
    convertToHtml: (opts: { path: string }) => Promise<{ value: string }>;
  };
  const result = await mammoth.convertToHtml({ path: filePath });
  const html = result.value || '';
  const title = path.basename(filePath, path.extname(filePath));
  const chapters = chaptersFromHtml(html);
  return {
    title,
    chapters,
    totalWords: wordCount(chapters.map((c) => c.text).join(' ')),
    format: 'docx',
  };
}

async function extractPdf(filePath: string): Promise<ExtractedDocument> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (
    buf: Buffer,
  ) => Promise<{ text: string; info?: { Title?: string } }>;
  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  const text = data.text || '';
  const title =
    data.info?.Title || path.basename(filePath, path.extname(filePath));
  // Split on Chapter N patterns
  const chapters = splitByChapterMarkers(text);
  return {
    title,
    chapters,
    totalWords: wordCount(chapters.map((c) => c.text).join(' ')),
    format: 'pdf',
  };
}

async function extractEpub(filePath: string): Promise<ExtractedDocument> {
  // Minimal EPUB: ZIP of HTML — use adm-zip if available, else crude
  let AdmZip: new (p: string) => {
    getEntries: () => { entryName: string; isDirectory: boolean; getData: () => Buffer }[];
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    AdmZip = require('adm-zip');
  } catch {
    throw new Error('EPUB support requires adm-zip package');
  }
  const zip = new AdmZip(filePath);
  const entries = zip
    .getEntries()
    .filter(
      (e) =>
        !e.isDirectory &&
        /\.(xhtml|html|htm)$/i.test(e.entryName) &&
        !/meta-inf/i.test(e.entryName),
    )
    .sort((a, b) => a.entryName.localeCompare(b.entryName));

  const chapters: ExtractedChapter[] = [];
  for (const ent of entries) {
    const html = ent.getData().toString('utf8');
    const text = htmlToText(html).trim();
    if (!text || text.length < 20) continue;
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title =
      (h1 && htmlToText(h1[1])) ||
      (titleMatch && htmlToText(titleMatch[1])) ||
      path.basename(ent.entryName);
    chapters.push({ title: title.trim(), text });
  }
  if (!chapters.length) {
    throw new Error('No extractable text in EPUB');
  }
  return {
    title: path.basename(filePath, path.extname(filePath)),
    chapters,
    totalWords: wordCount(chapters.map((c) => c.text).join(' ')),
    format: 'epub',
  };
}

function extractHtmlFile(filePath: string): ExtractedDocument {
  const html = fs.readFileSync(filePath, 'utf8');
  const title = path.basename(filePath, path.extname(filePath));
  return {
    title,
    chapters: chaptersFromHtml(html),
    totalWords: wordCount(htmlToText(html)),
    format: 'html',
  };
}

function chaptersFromHtml(html: string): ExtractedChapter[] {
  const parts = html.split(/<h[1-3][^>]*>/i);
  if (parts.length <= 1) {
    const text = htmlToText(html).trim();
    return text ? [{ title: 'Body', text }] : [];
  }
  const chapters: ExtractedChapter[] = [];
  // First segment before any heading
  const intro = htmlToText(parts[0]).trim();
  if (intro) chapters.push({ title: 'Introduction', text: intro });
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    const close = seg.match(/^([^<]*)<\/h[1-3]>/i);
    const title = close ? htmlToText(close[1]).trim() : `Section ${i}`;
    const bodyHtml = close ? seg.slice(close[0].length) : seg;
    const text = htmlToText(bodyHtml).trim();
    if (text) chapters.push({ title: title || `Section ${i}`, text });
  }
  return chapters;
}

export function splitByChapterMarkers(text: string): ExtractedChapter[] {
  const re =
    /(?:^|\n)(?:Chapter\s+(\d+)[:.\s-]+([^\n]*)|#{1,3}\s+([^\n]+)|---\s*chapter:\s*([^\n]+)\s*---)/gi;
  const matches = [...text.matchAll(re)];
  if (!matches.length) {
    const t = text.trim();
    return t ? [{ title: 'Body', text: t }] : [];
  }
  const chapters: ExtractedChapter[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;
    const title =
      (m[2] && `Chapter ${m[1]}: ${m[2].trim()}`) ||
      m[3]?.trim() ||
      m[4]?.trim() ||
      `Chapter ${i + 1}`;
    const body = text.slice(start, end).trim();
    if (body) chapters.push({ title, text: body });
  }
  // Content before first chapter
  const firstIdx = matches[0].index ?? 0;
  if (firstIdx > 0) {
    const intro = text.slice(0, firstIdx).trim();
    if (intro) chapters.unshift({ title: 'Introduction', text: intro });
  }
  return chapters.length ? chapters : [{ title: 'Body', text: text.trim() }];
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// silence unused zlib import in some bundlers — used if we add gzip epub later
void zlib;
