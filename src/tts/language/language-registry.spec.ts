import {
  getDefaultLanguage,
  getLanguageConfig,
  listLanguages,
  normalizeLanguageCode,
} from './language-registry';

describe('language-registry', () => {
  it('loads en and pt-BR configs', () => {
    expect(getLanguageConfig('en').currencySymbol).toBe('$');
    expect(getLanguageConfig('pt-BR').currencySymbol).toBe('R$');
    expect(getLanguageConfig('pt_BR').code).toBe('pt-BR');
    expect(getLanguageConfig('por').code).toBe('pt-BR');
  });

  it('lists unique languages', () => {
    const codes = listLanguages().map((l) => l.code);
    expect(codes).toEqual(expect.arrayContaining(['en', 'pt-BR']));
  });

  it('normalizes codes', () => {
    expect(normalizeLanguageCode('en_US')).toBe('en');
    expect(normalizeLanguageCode('pt_BR')).toBe('pt-BR');
    expect(getDefaultLanguage()).toBe('en');
  });
});
