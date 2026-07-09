import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  detectFormat,
  extractText,
  splitByChapterMarkers,
} from './document-extractor';

describe('document-extractor', () => {
  it('detects formats by extension', () => {
    expect(detectFormat('a.md')).toBe('md');
    expect(detectFormat('a.pdf')).toBe('pdf');
    expect(detectFormat('a.docx')).toBe('docx');
    expect(detectFormat('a.epub')).toBe('epub');
    expect(detectFormat('a.txt')).toBe('txt');
  });

  it('extracts markdown chapters', async () => {
    const tmp = path.join(os.tmpdir(), `doc-${Date.now()}.md`);
    fs.writeFileSync(
      tmp,
      '# Title One\n\nHello world.\n\n## Title Two\n\nMore text here.\n',
    );
    const doc = await extractText(tmp, 'md');
    expect(doc.chapters.length).toBeGreaterThanOrEqual(2);
    expect(doc.totalWords).toBeGreaterThan(0);
    fs.unlinkSync(tmp);
  });

  it('splitByChapterMarkers finds Chapter N', () => {
    const text = 'Preface text\n\nChapter 1: Begin\n\nOnce upon a time.\n\nChapter 2: End\n\nThe end.';
    const ch = splitByChapterMarkers(text);
    expect(ch.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts plain text', async () => {
    const tmp = path.join(os.tmpdir(), `doc-${Date.now()}.txt`);
    fs.writeFileSync(tmp, 'Just a plain document with several words.');
    const doc = await extractText(tmp, 'txt');
    expect(doc.chapters[0].text).toContain('plain');
    fs.unlinkSync(tmp);
  });
});
