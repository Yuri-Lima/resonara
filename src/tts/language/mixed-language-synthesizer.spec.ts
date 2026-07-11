import {
  interLanguagePauseMs,
  pickVoiceForLanguage,
  planMixedLanguageSynthesis,
} from './mixed-language-synthesizer';

describe('mixed-language-synthesizer', () => {
  it('plans single-language when forced', () => {
    const plan = planMixedLanguageSynthesis('Olá mundo', { language: 'pt-BR' });
    expect(plan.mode).toBe('single');
    expect(plan.language).toBe('pt-BR');
    expect(plan.blocks).toHaveLength(1);
  });

  it('plans mixed blocks for en + pt-BR paragraphs', () => {
    const text = [
      'This is a long enough English paragraph about neural speech synthesis quality.',
      '',
      'Este é um parágrafo suficientemente longo em português brasileiro para troca de voz.',
    ].join('\n');
    const plan = planMixedLanguageSynthesis(text, { language: 'auto' });
    expect(['single', 'mixed']).toContain(plan.mode);
    expect(plan.blocks.length).toBeGreaterThanOrEqual(1);
    expect(plan.blocks.every((b) => typeof b.text === 'string')).toBe(true);
  });

  it('exports inter-language pause and voice picker', () => {
    expect(interLanguagePauseMs()).toBeGreaterThan(0);
    const defaults = {
      en: 'piper:en_US-lessac-medium',
      'pt-BR': 'piper:pt_BR-faber-medium',
    };
    const pair = pickVoiceForLanguage('en', undefined, defaults);
    expect(pair).toContain('lessac');
    expect(
      pickVoiceForLanguage('pt-BR', { 'pt-BR': 'piper:pt_BR-faber-medium' }, defaults),
    ).toContain('faber');
  });
});
