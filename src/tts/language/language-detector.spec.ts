import {
  detectLanguage,
  detectParagraphLanguages,
  isMixedLanguage,
} from './language-detector';

describe('language-detector', () => {
  it('detects English', () => {
    const r = detectLanguage(
      'The quick brown fox jumps over the lazy dog near the river bank while scientists carefully observe the experiment results today.',
    );
    expect(r.code).toBe('en');
  });

  it('detects Portuguese', () => {
    const r = detectLanguage(
      'O novo framework da startup de São Paulo utiliza aprendizado de máquina para otimizar a experiência do usuário em aplicações móveis modernas com autenticação segura.',
    );
    expect(r.code).toBe('pt-BR');
  });

  it('falls back on short text', () => {
    const r = detectLanguage('Oi');
    expect(r.method).toBe('default');
  });

  it('paragraph mixed detection', () => {
    const text = [
      'Este parágrafo está claramente escrito em português brasileiro com várias palavras acentuadas como informação e coração.',
      '',
      'This paragraph is clearly written in English with enough words for reliable automatic language detection algorithms.',
    ].join('\n\n');
    const blocks = detectParagraphLanguages(text);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(isMixedLanguage(blocks)).toBe(true);
  });
});
