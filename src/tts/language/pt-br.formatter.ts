/**
 * Brazilian Portuguese spoken-form expansion for TTS.
 * Numbers: 1.234,56 · Currency: R$ · Dates: DD/MM/YYYY · CPF/CNPJ digit groups.
 */
import { LocaleFormatter } from './language.types';

const UNITS = [
  'zero',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
];
const TENS = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
];
const HUNDREDS = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos',
];
const MONTHS = [
  '',
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const ORDINALS_M = [
  '',
  'primeiro',
  'segundo',
  'terceiro',
  'quarto',
  'quinto',
  'sexto',
  'sétimo',
  'oitavo',
  'nono',
  'décimo',
];
const ORDINALS_F = [
  '',
  'primeira',
  'segunda',
  'terceira',
  'quarta',
  'quinta',
  'sexta',
  'sétima',
  'oitava',
  'nona',
  'décima',
];

function underThousand(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  if (n < 20) return UNITS[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    return u ? `${TENS[t]} e ${UNITS[u]}` : TENS[t];
  }
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const head = HUNDREDS[h];
  if (!rest) return head;
  return `${head} e ${underThousand(rest)}`;
}

/** Integer 0..999_999_999_999 → Portuguese words. */
export function integerToPtBr(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  n = Math.trunc(Math.abs(n));
  if (n === 0) return 'zero';
  if (n < 1000) return underThousand(n);

  const parts: string[] = [];
  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  if (billions) {
    parts.push(
      billions === 1 ? 'um bilhão' : `${integerToPtBr(billions)} bilhões`,
    );
  }
  if (millions) {
    parts.push(
      millions === 1 ? 'um milhão' : `${integerToPtBr(millions)} milhões`,
    );
  }
  if (thousands) {
    parts.push(thousands === 1 ? 'mil' : `${integerToPtBr(thousands)} mil`);
  }
  if (rest) parts.push(underThousand(rest));

  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/** Parse Brazilian number string: 1.234,56 or 4,2 */
export function parsePtBrNumber(raw: string): number | null {
  const s = raw.replace(/\s/g, '').replace(/^R\$\s?/i, '');
  if (!s) return null;
  // 1.234.567,89
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    return Number(s.replace(/\./g, '').replace(',', '.'));
  }
  // 1234,56 or 4,2
  if (/^\d+(,\d+)?$/.test(s)) {
    return Number(s.replace(',', '.'));
  }
  // plain integer
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

export function formatNumberPtBr(value: number | string): string {
  if (typeof value === 'string') {
    const parsed = parsePtBrNumber(value);
    if (parsed == null) return value;
    value = parsed;
  }
  if (!Number.isFinite(value)) return String(value);
  const neg = value < 0;
  const abs = Math.abs(value);
  const intPart = Math.floor(abs);
  const frac = Math.round((abs - intPart) * 100);
  let words = integerToPtBr(intPart);
  if (frac > 0) {
    words += ` vírgula ${integerToPtBr(frac)}`;
  }
  return neg ? `menos ${words}` : words;
}

export function formatCurrencyPtBr(value: number | string): string {
  let n: number | null;
  if (typeof value === 'string') {
    n = parsePtBrNumber(value.replace(/R\$\s?/i, ''));
  } else {
    n = value;
  }
  if (n == null || !Number.isFinite(n)) return String(value);
  const neg = n < 0;
  n = Math.abs(n);
  const reais = Math.floor(n);
  const centavos = Math.round((n - reais) * 100);
  let out = '';
  if (reais === 0 && centavos === 0) {
    out = 'zero reais';
  } else if (reais === 0) {
    out =
      centavos === 1
        ? 'um centavo'
        : `${integerToPtBr(centavos)} centavos`;
  } else {
    const realWord = reais === 1 ? 'um real' : `${integerToPtBr(reais)} reais`;
    if (centavos === 0) {
      out = realWord;
    } else if (centavos === 1) {
      out = `${realWord} e um centavo`;
    } else {
      out = `${realWord} e ${integerToPtBr(centavos)} centavos`;
    }
  }
  return neg ? `menos ${out}` : out;
}

export function formatDatePtBr(value: string): string {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return value;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return value;
  return `${integerToPtBr(day)} de ${MONTHS[month]} de ${integerToPtBr(year)}`;
}

export function formatPhonePtBr(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 8) return value;
  const groups: string[] = [];
  let i = 0;
  // country code 55
  if (digits.startsWith('55') && digits.length >= 12) {
    groups.push(digitGroup(digits.slice(0, 2)));
    i = 2;
  }
  // area code 2 digits
  if (digits.length - i >= 10) {
    groups.push(digitGroup(digits.slice(i, i + 2)));
    i += 2;
  }
  const rest = digits.slice(i);
  if (rest.length === 9) {
    groups.push(digitGroup(rest.slice(0, 5)));
    groups.push(digitGroup(rest.slice(5)));
  } else if (rest.length === 8) {
    groups.push(digitGroup(rest.slice(0, 4)));
    groups.push(digitGroup(rest.slice(4)));
  } else {
    groups.push(digitGroup(rest));
  }
  return groups.join(', ');
}

function digitGroup(d: string): string {
  return d
    .split('')
    .map((c) => UNITS[parseInt(c, 10)] || c)
    .join(' ');
}

export function formatOrdinalPtBr(
  value: number | string,
  gender: 'm' | 'f' = 'm',
): string {
  const n =
    typeof value === 'string'
      ? parseInt(value.replace(/\D/g, ''), 10)
      : value;
  if (!Number.isFinite(n) || n < 1) return String(value);
  const table = gender === 'f' ? ORDINALS_F : ORDINALS_M;
  if (n <= 10) return table[n];
  return `${integerToPtBr(n)}°`;
}

export function formatCpf(value: string): string {
  const d = value.replace(/\D/g, '');
  if (d.length !== 11) return digitGroup(d) || value;
  return [
    digitGroup(d.slice(0, 3)),
    digitGroup(d.slice(3, 6)),
    digitGroup(d.slice(6, 9)),
    digitGroup(d.slice(9, 11)),
  ].join(', ');
}

export function formatCnpj(value: string): string {
  const d = value.replace(/\D/g, '');
  if (d.length !== 14) return digitGroup(d) || value;
  return [
    digitGroup(d.slice(0, 2)),
    digitGroup(d.slice(2, 5)),
    digitGroup(d.slice(5, 8)),
    digitGroup(d.slice(8, 12)),
    digitGroup(d.slice(12, 14)),
  ].join(', ');
}

export function formatPercentagePtBr(value: number | string): string {
  let n: number | null;
  if (typeof value === 'string') {
    n = parsePtBrNumber(value.replace(/%/g, ''));
  } else {
    n = value;
  }
  if (n == null) return String(value);
  return `${formatNumberPtBr(n)} por cento`;
}

/**
 * Expand Brazilian patterns in free text for Piper.
 */
export function expandPtBrForSpeech(text: string): string {
  if (!text) return text;
  let out = text;

  // Currency with milhões/bilhões shorthand: R$ 4,2 milhões
  out = out.replace(
    /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)\s*(milhões|milhão|bilhões|bilhão|mil)/gi,
    (_m, num, unit) => {
      const n = parsePtBrNumber(num);
      const words = n == null ? num : formatNumberPtBr(n);
      return `${words} ${unit.toLowerCase()} de reais`;
    },
  );

  // R$ amounts
  out = out.replace(
    /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/g,
    (_m, num) => formatCurrencyPtBr(num),
  );

  // CPF
  out = out.replace(
    /\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/g,
    (_m, cpf) => formatCpf(cpf),
  );

  // CNPJ
  out = out.replace(
    /\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/g,
    (_m, cnpj) => formatCnpj(cnpj),
  );

  // Phone +55 (11) 98765-4321
  out = out.replace(
    /\+55\s*\(?\d{2}\)?\s*\d{4,5}-?\d{4}/g,
    (m) => formatPhonePtBr(m),
  );

  // Dates DD/MM/YYYY
  out = out.replace(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/g, (_m, d) =>
    formatDatePtBr(d),
  );

  // Percentages 847% or 12,5%
  out = out.replace(
    /\b(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)%/g,
    (_m, num) => formatPercentagePtBr(num),
  );

  // Ordinals 1° 2ª 3º
  out = out.replace(/\b(\d+)[º°]\b/g, (_m, n) => formatOrdinalPtBr(n, 'm'));
  out = out.replace(/\b(\d+)ª\b/g, (_m, n) => formatOrdinalPtBr(n, 'f'));

  // Brazilian numbers with thousands: 12.500,00 (avoid dates already handled)
  out = out.replace(
    /\b(\d{1,3}(?:\.\d{3})+(?:,\d+)?)\b/g,
    (m) => formatNumberPtBr(m),
  );

  // Decimal with comma: 3,7 (not part of larger already-replaced)
  out = out.replace(
    /\b(\d+,\d+)\b/g,
    (m) => formatNumberPtBr(m),
  );

  return out;
}

export const ptBrFormatter: LocaleFormatter = {
  language: 'pt-BR',
  expandForSpeech: expandPtBrForSpeech,
  formatNumber: formatNumberPtBr,
  formatCurrency: formatCurrencyPtBr,
  formatDate: formatDatePtBr,
  formatPhone: formatPhonePtBr,
  formatOrdinal: formatOrdinalPtBr,
  formatPercentage: formatPercentagePtBr,
};
