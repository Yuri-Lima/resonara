import { supportedSsmlElements, transformSsml } from './ssml-parser';

describe('transformSsml', () => {
  it('wraps plain text', () => {
    const r = transformSsml('Hello world', { engine: 'piper' });
    expect(r.plainText).toContain('Hello');
    expect(r.engineText).toContain('Hello');
    expect(r.hasMarkup).toBe(false);
  });

  it('transforms break and sub for piper', () => {
    const r = transformSsml(
      '<speak>Hello <break time="500ms"/> <sub alias="World Wide Web">WWW</sub></speak>',
      { engine: 'piper', isSsml: true },
    );
    expect(r.engineText).toMatch(/World Wide Web/);
    expect(r.hasMarkup).toBe(true);
  });

  it('maps phoneme for piper', () => {
    const r = transformSsml(
      '<speak><phoneme alphabet="ipa" ph="təˈmeɪtoʊ">tomato</phoneme></speak>',
      { engine: 'piper', isSsml: true },
    );
    expect(r.engineText).toContain('[[');
    expect(r.engineText).toContain('təˈmeɪtoʊ');
  });

  it('emits macOS slnc for breaks', () => {
    const r = transformSsml(
      '<speak>Hi <break time="300ms"/> there</speak>',
      { engine: 'platform-darwin', isSsml: true },
    );
    expect(r.engineText).toContain('[[slnc');
  });

  it('passes through SAPI speak wrapper', () => {
    const r = transformSsml('<break time="1s"/> OK', {
      engine: 'platform-win32',
      isSsml: true,
    });
    expect(r.engineText).toMatch(/<speak/i);
  });

  it('strips unknown tags with warning', () => {
    const r = transformSsml('<speak><foo>bar</foo></speak>', {
      engine: 'piper',
      isSsml: true,
    });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.plainText).toContain('bar');
  });

  it('lists supported elements', () => {
    expect(supportedSsmlElements().length).toBeGreaterThan(3);
  });
});
