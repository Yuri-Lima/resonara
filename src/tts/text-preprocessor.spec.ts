import {
  preprocessText,
  preprocessDocument,
  urlToSpoken,
  DOCUMENT_DEFAULTS,
  RAW_DEFAULTS,
} from './text-preprocessor';

describe('text-preprocessor', () => {
  describe('pageNumbers', () => {
    it('strips standalone digit lines', () => {
      const input = 'Hello world.\n14\nMore text.';
      const r = preprocessText(input, {
        documentMode: true,
        rules: {
          pageNumbers: true,
          headers: false,
          footnotes: false,
          citations: 'verbatim',
          urls: 'verbatim',
          dashes: false,
          allCapsHeadings: false,
          whitespace: false,
        },
      });
      expect(r.cleaned).not.toMatch(/^\s*14\s*$/m);
      expect(r.cleaned).toContain('Hello world');
      expect(r.cleaned).toContain('More text');
      expect(r.removals.some((x) => x.rule === 'pageNumbers')).toBe(true);
    });

    it('strips Page N and N of M', () => {
      const input = 'Intro\nPage 3\nBody\n2 of 10\nEnd';
      const r = preprocessDocument(input, {
        headers: false,
        footnotes: false,
        citations: 'verbatim',
        urls: 'verbatim',
        dashes: false,
        allCapsHeadings: false,
        whitespace: true,
      });
      expect(r.cleaned).not.toMatch(/Page 3/i);
      expect(r.cleaned).not.toMatch(/2 of 10/);
    });

    it('strips "Page N of M" PDF footer form', () => {
      const input =
        'Page 1 of 99\n\nHello world.\n\nPage 2 of 99\n\nMore text.';
      const r = preprocessDocument(input, {
        headers: false,
        footnotes: false,
        citations: 'verbatim',
        urls: 'verbatim',
        dashes: false,
        allCapsHeadings: false,
        whitespace: true,
      });
      expect(r.cleaned).not.toMatch(/Page \d+ of \d+/i);
      expect(r.cleaned).toContain('Hello world');
      expect(r.cleaned).toContain('More text');
      expect(r.removals.some((x) => x.rule === 'pageNumbers')).toBe(true);
    });
  });

  describe('headers', () => {
    it('strips lines repeating 3+ times', () => {
      const input = [
        'CHAPTER EXTRACT',
        'First paragraph of real content here.',
        'CHAPTER EXTRACT',
        'Second paragraph continues the story.',
        'CHAPTER EXTRACT',
        'Third paragraph wraps it up.',
      ].join('\n');
      const r = preprocessDocument(input, {
        pageNumbers: false,
        footnotes: false,
        citations: 'verbatim',
        urls: 'verbatim',
        dashes: false,
        allCapsHeadings: false,
        whitespace: true,
      });
      expect(r.cleaned.match(/CHAPTER EXTRACT/g) || []).toHaveLength(0);
      expect(r.cleaned).toContain('First paragraph');
      expect(r.removals.filter((x) => x.rule === 'headers').length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('footnotes', () => {
    it('strips [1] and [a] but preserves [narrator]', () => {
      const input = '[narrator] Hello world[1] and more[a] text* here.';
      const r = preprocessText(input, {
        documentMode: true,
        rules: {
          pageNumbers: false,
          headers: false,
          footnotes: true,
          citations: 'verbatim',
          urls: 'verbatim',
          dashes: false,
          allCapsHeadings: false,
          whitespace: false,
        },
      });
      expect(r.cleaned).toContain('[narrator]');
      expect(r.cleaned).not.toContain('[1]');
      expect(r.cleaned).not.toContain('[a]');
      expect(r.cleaned).not.toMatch(/text\*/);
    });
  });

  describe('citations', () => {
    it('removes (Smith et al., 2023)', () => {
      const input = 'As shown (Smith et al., 2023) the effect holds.';
      const r = preprocessDocument(input, {
        pageNumbers: false,
        headers: false,
        footnotes: false,
        citations: 'removed',
        urls: 'verbatim',
        dashes: false,
        allCapsHeadings: false,
        whitespace: true,
      });
      expect(r.cleaned).not.toContain('Smith');
      expect(r.cleaned).toContain('As shown');
      expect(r.cleaned).toContain('the effect holds');
    });

    it('spoken mode keeps author words', () => {
      const input = 'As shown (Smith et al., 2023) yes.';
      const r = preprocessDocument(input, {
        pageNumbers: false,
        headers: false,
        footnotes: false,
        citations: 'spoken',
        urls: 'verbatim',
        dashes: false,
        allCapsHeadings: false,
        whitespace: true,
      });
      expect(r.cleaned.toLowerCase()).toContain('smith');
      expect(r.cleaned).toContain('2023');
      expect(r.cleaned).not.toContain('(');
    });
  });

  describe('urls', () => {
    it('converts to spoken form', () => {
      expect(urlToSpoken('https://github.com/foo')).toMatch(/github dot com slash foo/i);
      const input = 'See https://github.com/foo for details.';
      const r = preprocessDocument(input, {
        pageNumbers: false,
        headers: false,
        footnotes: false,
        citations: 'verbatim',
        urls: 'spoken',
        dashes: false,
        allCapsHeadings: false,
        whitespace: true,
      });
      expect(r.cleaned).not.toContain('https://');
      expect(r.cleaned.toLowerCase()).toContain('github');
      expect(r.cleaned.toLowerCase()).toContain('dot');
    });

    it('strips when mode stripped', () => {
      const input = 'See https://example.com/x now.';
      const r = preprocessDocument(input, {
        pageNumbers: false,
        headers: false,
        footnotes: false,
        citations: 'verbatim',
        urls: 'stripped',
        dashes: false,
        allCapsHeadings: false,
        whitespace: true,
      });
      expect(r.cleaned).not.toContain('example');
      expect(r.cleaned).toContain('See');
    });
  });

  describe('dashes and caps', () => {
    it('normalizes em-dash and ellipsis', () => {
      const input = 'Wait—what… really?';
      const r = preprocessDocument(input, {
        pageNumbers: false,
        headers: false,
        footnotes: false,
        citations: 'verbatim',
        urls: 'verbatim',
        dashes: true,
        allCapsHeadings: false,
        whitespace: true,
      });
      expect(r.cleaned).toContain('—');
      expect(r.cleaned).toContain('…');
    });

    it('title-cases ALL-CAPS headings', () => {
      const input = 'INTRODUCTION TO AUDIO\n\nThe body starts here with normal case.';
      const r = preprocessDocument(input, {
        pageNumbers: false,
        headers: false,
        footnotes: false,
        citations: 'verbatim',
        urls: 'verbatim',
        dashes: false,
        allCapsHeadings: true,
        whitespace: true,
      });
      expect(r.cleaned).toContain('Introduction To Audio');
      expect(r.cleaned).not.toContain('INTRODUCTION TO AUDIO');
    });
  });

  describe('defaults and idempotency', () => {
    it('raw defaults leave paste mostly untouched', () => {
      const input = 'Page 3\nKeep [1] and https://x.com';
      const r = preprocessText(input, { documentMode: false });
      expect(r.cleaned).toBe(input);
      expect(RAW_DEFAULTS.pageNumbers).toBe(false);
      expect(DOCUMENT_DEFAULTS.pageNumbers).toBe(true);
    });

    it('is idempotent under document defaults', () => {
      const messy = [
        'RUNNING HEADER',
        'Hello world[1] see (Doe, 2021) at https://github.com/foo',
        '14',
        'RUNNING HEADER',
        'More prose here.',
        'RUNNING HEADER',
        'CHAPTER TITLE HERE',
      ].join('\n');
      const once = preprocessDocument(messy);
      const twice = preprocessDocument(once.cleaned);
      expect(twice.cleaned).toBe(once.cleaned);
    });

    it('combined messy extract cleans all artifact classes', () => {
      const lines: string[] = [];
      lines.push('ACME CORP ANNUAL REPORT');
      for (let i = 0; i < 5; i++) {
        lines.push('ACME CORP ANNUAL REPORT');
        lines.push(`Paragraph ${i} discusses the market outlook in detail.`);
        if (i % 2 === 0) lines.push(String(10 + i));
      }
      lines.push('CONCLUSION AND NEXT STEPS');
      lines.push(
        'Further reading[2] is available (Smith et al., 2023) at https://example.com/report.',
      );
      const input = lines.join('\n');
      const r = preprocessDocument(input);
      expect(r.cleaned).not.toMatch(/^\d+$/m);
      expect(r.cleaned.match(/ACME CORP ANNUAL REPORT/g) || []).toHaveLength(0);
      expect(r.cleaned).not.toContain('[2]');
      expect(r.cleaned).not.toContain('Smith et al');
      expect(r.cleaned).not.toContain('https://');
      expect(r.cleaned).toMatch(/Conclusion And Next Steps/);
    });

    it('handles empty and nullish', () => {
      expect(preprocessDocument('').cleaned).toBe('');
      expect(preprocessText(null as unknown as string).cleaned).toBe('');
    });
  });
});
