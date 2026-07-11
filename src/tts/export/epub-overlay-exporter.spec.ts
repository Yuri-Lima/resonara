import {
  buildSmil,
  wrapSentenceSpans,
  injectOpfMediaOverlays,
  validateSmilMonotonic,
  writeOverlayPackage,
} from './epub-overlay-exporter';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('epub-overlay-exporter', () => {
  it('builds SMIL with clip times', () => {
    const smil = buildSmil('s', 'c.xhtml', 'a.mp3', [
      { id: 's0001', text: 'Hi', clipBeginSec: 0, clipEndSec: 1.2 },
    ]);
    expect(smil).toContain('clipBegin="0.000s"');
    expect(smil).toContain('s0001');
  });

  it('wrapSentenceSpans is idempotent on second pass', () => {
    const once = wrapSentenceSpans('<p>Hello world</p>', ['Hello world']);
    const twice = wrapSentenceSpans(once, ['Hello world']);
    expect(twice).toBe(once);
  });

  it('injectOpfMediaOverlays adds manifest item', () => {
    const opf = injectOpfMediaOverlays(
      `<?xml version="1.0"?><package><metadata></metadata><manifest></manifest><spine><itemref idref="ch1"/></spine></package>`,
      [{ smilPath: 'c.smil', durationSec: 10, chapterId: 'ch1' }],
    );
    expect(opf).toContain('mo-ch1');
    expect(opf).toContain('media-overlay');
  });

  it('validateSmilMonotonic', () => {
    expect(
      validateSmilMonotonic([
        { id: 'a', text: 'a', clipBeginSec: 0, clipEndSec: 1 },
        { id: 'b', text: 'b', clipBeginSec: 1, clipEndSec: 2 },
      ]),
    ).toBe(true);
    expect(
      validateSmilMonotonic([
        { id: 'a', text: 'a', clipBeginSec: 2, clipEndSec: 1 },
      ]),
    ).toBe(false);
  });

  it('writeOverlayPackage creates files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epub-mo-'));
    const r = writeOverlayPackage(dir, {
      title: 'T',
      audioFileName: 'a.mp3',
      xhtmlBody: '<p>One. Two.</p>',
      sentences: [
        { id: 's0001', text: 'One.', clipBeginSec: 0, clipEndSec: 1 },
        { id: 's0002', text: 'Two.', clipBeginSec: 1, clipEndSec: 2 },
      ],
    });
    expect(fs.existsSync(r.smilPath)).toBe(true);
    expect(fs.existsSync(r.opfPath)).toBe(true);
    expect(fs.existsSync(r.epubPath)).toBe(true);
    expect(fs.existsSync(r.containerPath)).toBe(true);
    expect(fs.existsSync(path.join(dir, 'mimetype'))).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'mimetype'), 'utf8')).toBe(
      'application/epub+zip',
    );
    // Structural zip check via adm-zip (CJS package)
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const AdmZip = require('adm-zip') as new (p: string) => {
      getEntries(): { entryName: string }[];
    };
    const zip = new AdmZip(r.epubPath);
    const names = zip.getEntries().map((e: { entryName: string }) => e.entryName);
    expect(names).toContain('mimetype');
    expect(names.some((n: string) => n.includes('container.xml'))).toBe(true);
    expect(names.some((n: string) => n.includes('content.opf'))).toBe(true);
  });
});
