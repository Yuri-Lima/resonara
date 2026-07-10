import { LocaleFormatter } from './language.types';

const UNITS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function underThousand(n: number): string {
  if (n === 0) return '';
  if (n < 20) return UNITS[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    return u ? `${TENS[t]}-${UNITS[u]}` : TENS[t];
  }
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return rest ? `${UNITS[h]} hundred ${underThousand(rest)}` : `${UNITS[h]} hundred`;
}

export function integerToEn(n: number): string {
  n = Math.trunc(Math.abs(n));
  if (n === 0) return 'zero';
  if (n < 1000) return underThousand(n);
  if (n < 1_000_000) {
    const th = Math.floor(n / 1000);
    const rest = n % 1000;
    return rest
      ? `${integerToEn(th)} thousand ${underThousand(rest)}`
      : `${integerToEn(th)} thousand`;
  }
  if (n < 1_000_000_000) {
    const m = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    return rest
      ? `${integerToEn(m)} million ${integerToEn(rest)}`
      : `${integerToEn(m)} million`;
  }
  const b = Math.floor(n / 1_000_000_000);
  const rest = n % 1_000_000_000;
  return rest
    ? `${integerToEn(b)} billion ${integerToEn(rest)}`
    : `${integerToEn(b)} billion`;
}

export function formatNumberEn(value: number | string): string {
  let n: number;
  if (typeof value === 'string') {
    n = Number(value.replace(/,/g, ''));
  } else {
    n = value;
  }
  if (!Number.isFinite(n)) return String(value);
  const neg = n < 0;
  n = Math.abs(n);
  const intPart = Math.floor(n);
  const frac = Math.round((n - intPart) * 100);
  let words = integerToEn(intPart);
  if (frac > 0) words += ` point ${integerToEn(frac)}`;
  return neg ? `minus ${words}` : words;
}

export function formatCurrencyEn(value: number | string): string {
  let n: number;
  if (typeof value === 'string') {
    n = Number(value.replace(/[$,]/g, ''));
  } else {
    n = value;
  }
  if (!Number.isFinite(n)) return String(value);
  const dollars = Math.floor(Math.abs(n));
  const cents = Math.round((Math.abs(n) - dollars) * 100);
  const dWord = dollars === 1 ? 'one dollar' : `${integerToEn(dollars)} dollars`;
  if (cents === 0) return n < 0 ? `minus ${dWord}` : dWord;
  const cWord = cents === 1 ? 'one cent' : `${integerToEn(cents)} cents`;
  const out = `${dWord} and ${cWord}`;
  return n < 0 ? `minus ${out}` : out;
}

export function formatDateEn(value: string): string {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return value;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12) return value;
  return `${MONTHS[month]} ${day}, ${integerToEn(year)}`;
}

export function expandEnForSpeech(text: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(
    /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(million|billion|thousand)?/gi,
    (_m, num, unit) => {
      const n = Number(String(num).replace(/,/g, ''));
      if (!Number.isFinite(n)) return _m;
      if (unit) return `${formatNumberEn(n)} ${unit.toLowerCase()} dollars`;
      return formatCurrencyEn(n);
    },
  );
  out = out.replace(
    /\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?)\b/g,
    (m) => formatNumberEn(m),
  );
  out = out.replace(
    /\b(\d+(?:\.\d+)?)%/g,
    (_m, num) => `${formatNumberEn(num)} percent`,
  );
  return out;
}

export const enFormatter: LocaleFormatter = {
  language: 'en',
  expandForSpeech: expandEnForSpeech,
  formatNumber: formatNumberEn,
  formatCurrency: formatCurrencyEn,
  formatDate: formatDateEn,
  formatPhone: (v) => v,
  formatOrdinal: (v) => String(v),
  formatPercentage: (v) => `${formatNumberEn(v)} percent`,
};
