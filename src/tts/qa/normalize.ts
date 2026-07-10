/**
 * TTS-aware text normalization for WER comparison.
 * Expands common spoken forms so "Dr." vs "doctor" is not an error.
 */

const ABBREV: Record<string, string> = {
  dr: 'doctor',
  mr: 'mister',
  mrs: 'missus',
  ms: 'miss',
  prof: 'professor',
  sr: 'senior',
  jr: 'junior',
  st: 'street',
  ave: 'avenue',
  ltd: 'limited',
  inc: 'incorporated',
  vs: 'versus',
  etc: 'etcetera',
  approx: 'approximately',
};

const NUMBER_WORDS: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  sixty: '60',
  seventy: '70',
  eighty: '80',
  ninety: '90',
  hundred: '100',
  thousand: '1000',
};

/** Map digit strings to a canonical spoken-ish form for loose equality. */
function expandDigitsToken(tok: string): string[] {
  // 4.2 → four point two (tokenized later as words — keep as joined form)
  if (/^\d+\.\d+$/.test(tok)) {
    const [a, b] = tok.split('.');
    return [...digitToWords(a), 'point', ...digitToWords(b)];
  }
  if (/^\d+$/.test(tok) && tok.length <= 4) {
    return digitToWords(tok);
  }
  return [tok];
}

function digitToWords(n: string): string[] {
  const map = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
  ];
  // simple digit-by-digit for long; small numbers as whole if < 20 handled elsewhere
  const num = parseInt(n, 10);
  if (!Number.isFinite(num)) return [n];
  if (num >= 0 && num <= 20) {
    const small = [
      'zero',
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
      'ten',
      'eleven',
      'twelve',
      'thirteen',
      'fourteen',
      'fifteen',
      'sixteen',
      'seventeen',
      'eighteen',
      'nineteen',
      'twenty',
    ];
    return [small[num]];
  }
  // fall back digit by digit
  return n.split('').map((d) => map[parseInt(d, 10)] || d);
}

/**
 * Normalize a string to a list of comparable tokens.
 */
export function normalizeForWer(text: string): string[] {
  let t = (text || '').toLowerCase();
  // strip SSML-ish tags
  t = t.replace(/<[^>]+>/g, ' ');
  // dialogue tags
  t = t.replace(/\[([a-z][a-z0-9_\- ]{1,40})\]/gi, ' ');
  // punctuation → space (keep apostrophes inside words)
  t = t.replace(/[^\w\s'.]/g, ' ');
  t = t.replace(/'/g, '');
  t = t.replace(/\s+/g, ' ').trim();

  const raw = t.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let w of raw) {
    // strip trailing periods from abbreviations
    if (w.endsWith('.')) w = w.slice(0, -1);
    if (ABBREV[w]) {
      out.push(ABBREV[w]);
      continue;
    }
    // number words stay as words; also expand pure digits
    if (/^\d+(\.\d+)?$/.test(w)) {
      out.push(...expandDigitsToken(w));
      continue;
    }
    // collapse number-word sequences later via equivalence — keep as-is
    if (NUMBER_WORDS[w]) {
      // keep spoken form for both sides consistency
      out.push(w);
      continue;
    }
    out.push(w);
  }
  return out;
}

/**
 * Optional equivalence collapse: map number words to digits for second pass.
 * Used when first WER is high to reduce false positives.
 */
export function toDigitish(tokens: string[]): string[] {
  return tokens.map((t) => NUMBER_WORDS[t] || t);
}
