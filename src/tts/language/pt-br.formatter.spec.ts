import {
  expandPtBrForSpeech,
  formatCnpj,
  formatCpf,
  formatCurrencyPtBr,
  formatDatePtBr,
  formatNumberPtBr,
  formatOrdinalPtBr,
  formatPercentagePtBr,
  integerToPtBr,
} from './pt-br.formatter';

describe('pt-br.formatter', () => {
  it('integers and decimals', () => {
    expect(integerToPtBr(0)).toBe('zero');
    expect(integerToPtBr(21)).toContain('vinte');
    expect(formatNumberPtBr('1.234,56')).toMatch(/mil/);
    expect(formatNumberPtBr('1.234,56')).toMatch(/vírgula/);
  });

  it('currency singular/plural and zero', () => {
    expect(formatCurrencyPtBr('R$ 1,00')).toMatch(/um real/);
    expect(formatCurrencyPtBr('R$ 2,50')).toMatch(/dois reais/);
    expect(formatCurrencyPtBr('R$ 2,50')).toMatch(/centavos/);
    expect(formatCurrencyPtBr('0')).toMatch(/zero reais/);
    expect(formatCurrencyPtBr('0,01')).toMatch(/centavo/);
  });

  it('dates DD/MM/YYYY', () => {
    const d = formatDatePtBr('25/12/2025');
    expect(d).toMatch(/vinte e cinco/);
    expect(d).toMatch(/dezembro/);
  });

  it('CPF CNPJ percentage ordinals', () => {
    expect(formatCpf('123.456.789-00')).toMatch(/um dois três/);
    expect(formatCnpj('12.345.678/0001-90')).toMatch(/um dois/);
    expect(formatPercentagePtBr('847%')).toMatch(/por cento/);
    expect(formatOrdinalPtBr('3°', 'm')).toBe('terceiro');
    expect(formatOrdinalPtBr('3ª', 'f')).toBe('terceira');
  });

  it('expands free text patterns', () => {
    const out = expandPtBrForSpeech(
      'Valor R$ 4,2 milhões em 25/12/2025 CPF 123.456.789-00',
    );
    expect(out).toMatch(/reais/i);
    expect(out).toMatch(/dezembro/i);
    expect(out).not.toMatch(/R\$/);
  });
});
