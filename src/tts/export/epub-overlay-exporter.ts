/**
 * EPUB 3 Media Overlays export (SMIL + OPF injection).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface OverlaySentence {
  id: string;
  text: string;
  clipBeginSec: number;
  clipEndSec: number;
}

export function wrapSentenceSpans(htmlBody: string, sentences: string[]): string {
  // Idempotent-ish: if already has id="s0001", return as-is
  if (/id="s\d{4}"/.test(htmlBody)) return htmlBody;
  let i = 0;
  let out = htmlBody;
  for (const s of sentences) {
    i++;
    const id = `s${String(i).padStart(4, '0')}`;
    const span = `<span id="${id}">${escapeHtml(s)}</span>`;
    // simple first-occurrence replace of plain text
    if (out.includes(s)) out = out.replace(s, span);
    else out += `\n<p>${span}</p>`;
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildSmil(
  smilId: string,
  textSrc: string,
  audioSrc: string,
  sentences: OverlaySentence[],
): string {
  const pars = sentences
    .map(
      (s) => `    <par id="${s.id}-par">
      <text src="${textSrc}#${s.id}"/>
      <audio src="${audioSrc}" clipBegin="${s.clipBeginSec.toFixed(3)}s" clipEnd="${s.clipEndSec.toFixed(3)}s"/>
    </par>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<smil xmlns="http://www.w3.org/ns/SMIL" version="3.0">
  <body>
    <seq id="${smilId}" epub:textref="${textSrc}" xmlns:epub="http://www.idpf.org/2007/ops">
${pars}
    </seq>
  </body>
</smil>
`;
}

export function injectOpfMediaOverlays(
  opfXml: string,
  overlays: { smilPath: string; durationSec: number; chapterId: string }[],
): string {
  let out = opfXml;
  for (const o of overlays) {
    const item = `<item id="mo-${o.chapterId}" href="${o.smilPath}" media-type="application/smil+xml"/>`;
    if (!out.includes(`mo-${o.chapterId}`)) {
      out = out.replace('</manifest>', `  ${item}\n  </manifest>`);
    }
    // spine media-overlay attr
    const re = new RegExp(`(<itemref[^>]*idref="${o.chapterId}"[^>]*)(/>|>)`, 'i');
    if (re.test(out) && !out.includes(`media-overlay="mo-${o.chapterId}"`)) {
      out = out.replace(re, `$1 media-overlay="mo-${o.chapterId}"$2`);
    }
  }
  const total = overlays.reduce((s, o) => s + o.durationSec, 0);
  if (!/media:duration/.test(out)) {
    out = out.replace(
      '</metadata>',
      `  <meta property="media:duration">${formatClock(total)}</meta>\n  </metadata>`,
    );
  }
  return out;
}

function formatClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}

export function validateSmilMonotonic(sentences: OverlaySentence[]): boolean {
  for (let i = 0; i < sentences.length; i++) {
    if (sentences[i].clipEndSec < sentences[i].clipBeginSec) return false;
    if (i > 0 && sentences[i].clipBeginSec + 1e-6 < sentences[i - 1].clipBeginSec)
      return false;
  }
  return true;
}

export function writeOverlayPackage(
  outDir: string,
  opts: {
    title: string;
    sentences: OverlaySentence[];
    audioFileName: string;
    xhtmlBody: string;
  },
): {
  smilPath: string;
  xhtmlPath: string;
  opfPath: string;
  epubPath: string;
  containerPath: string;
} {
  fs.mkdirSync(outDir, { recursive: true });
  const oebps = path.join(outDir, 'OEBPS');
  const metaInf = path.join(outDir, 'META-INF');
  fs.mkdirSync(oebps, { recursive: true });
  fs.mkdirSync(metaInf, { recursive: true });

  const xhtmlName = 'chapter.xhtml';
  const smilName = 'chapter.smil';
  const spans = wrapSentenceSpans(
    opts.xhtmlBody,
    opts.sentences.map((s) => s.text),
  );
  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${escapeHtml(opts.title)}</title></head>
<body>${spans}</body>
</html>`;
  const xhtmlPath = path.join(oebps, xhtmlName);
  fs.writeFileSync(xhtmlPath, xhtml, 'utf8');
  const smil = buildSmil('seq1', xhtmlName, opts.audioFileName, opts.sentences);
  const smilPath = path.join(oebps, smilName);
  fs.writeFileSync(smilPath, smil, 'utf8');

  // Prefer audio under OEBPS when present in outDir root (caller copies it)
  const audioSrc = path.join(outDir, opts.audioFileName);
  const audioDest = path.join(oebps, opts.audioFileName);
  if (fs.existsSync(audioSrc) && audioSrc !== audioDest) {
    fs.copyFileSync(audioSrc, audioDest);
  }

  const audioExt = path.extname(opts.audioFileName).toLowerCase();
  const audioMime =
    audioExt === '.wav'
      ? 'audio/wav'
      : audioExt === '.m4b' || audioExt === '.m4a'
        ? 'audio/mp4'
        : 'audio/mpeg';

  let opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${crypto.randomUUID()}</dc:identifier>
    <dc:title>${escapeHtml(opts.title)}</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="${xhtmlName}" media-type="application/xhtml+xml"/>
    <item id="audio" href="${opts.audioFileName}" media-type="${audioMime}"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`;
  opf = injectOpfMediaOverlays(opf, [
    {
      smilPath: smilName,
      durationSec: opts.sentences.at(-1)?.clipEndSec || 0,
      chapterId: 'ch1',
    },
  ]);
  const opfPath = path.join(oebps, 'content.opf');
  fs.writeFileSync(opfPath, opf, 'utf8');

  const containerPath = path.join(metaInf, 'container.xml');
  fs.writeFileSync(
    containerPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
    'utf8',
  );

  // EPUB requires uncompressed mimetype as first entry
  const mimetypePath = path.join(outDir, 'mimetype');
  fs.writeFileSync(mimetypePath, 'application/epub+zip', 'utf8');

  const epubPath = path.join(outDir, 'book.epub');
  packageEpubZip(outDir, epubPath, {
    audioFileName: opts.audioFileName,
  });

  return { smilPath, xhtmlPath, opfPath, epubPath, containerPath };
}

/**
 * Build a structurally valid EPUB zip:
 * mimetype (store/uncompressed) first, then META-INF + OEBPS.
 */
export function packageEpubZip(
  outDir: string,
  epubPath: string,
  opts?: { audioFileName?: string },
): string {
  // Same pattern as document-extractor.ts (adm-zip has no bundled types)
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const AdmZip = require('adm-zip');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  const zip = new AdmZip();

  // Uncompressed mimetype (EPUB spec)
  const mimeBuf = Buffer.from('application/epub+zip', 'utf8');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  zip.addFile('mimetype', mimeBuf);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  const mimeEntry = zip.getEntry('mimetype');
  if (mimeEntry?.header) {
    // 0 = STORE (no compression)
    mimeEntry.header.method = 0;
  }

  const container = path.join(outDir, 'META-INF', 'container.xml');
  if (fs.existsSync(container)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    zip.addLocalFile(container, 'META-INF');
  }

  const oebps = path.join(outDir, 'OEBPS');
  if (fs.existsSync(oebps)) {
    for (const name of fs.readdirSync(oebps)) {
      const full = path.join(oebps, name);
      if (fs.statSync(full).isFile()) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        zip.addLocalFile(full, 'OEBPS');
      }
    }
  } else {
    // Legacy flat layout fallback
    for (const name of [
      'chapter.xhtml',
      'chapter.smil',
      'content.opf',
      opts?.audioFileName,
    ].filter(Boolean) as string[]) {
      const full = path.join(outDir, name);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      if (fs.existsSync(full)) zip.addLocalFile(full, 'OEBPS');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  zip.writeZip(epubPath);
  return epubPath;
}
