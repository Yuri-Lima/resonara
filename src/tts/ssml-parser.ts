/**
 * Resonara SSML subset parser + engine-specific transforms.
 * Common: speak, break, emphasis, prosody, say-as, phoneme, sub.
 */

export type SsmlEngine = 'piper' | 'platform-darwin' | 'platform-win32' | 'plain';

export interface SsmlParseResult {
  plainText: string;
  engineText: string;
  warnings: string[];
  hasMarkup: boolean;
}

export interface SsmlTransformOptions {
  engine: SsmlEngine;
  /** If true, input is already SSML; else wrap plain text. */
  isSsml?: boolean;
}

const SUPPORTED = new Set([
  'speak',
  'break',
  'emphasis',
  'prosody',
  'say-as',
  'phoneme',
  'sub',
  'p',
  's',
  'w',
]);

/**
 * Parse and transform SSML (or plain text) for a target engine.
 */
export function transformSsml(
  input: string,
  options: SsmlTransformOptions,
): SsmlParseResult {
  const warnings: string[] = [];
  const raw = (input || '').trim();
  if (!raw) {
    return { plainText: '', engineText: '', warnings, hasMarkup: false };
  }

  const looksLikeSsml =
    options.isSsml === true || /<\/?[a-zA-Z][\w:-]*[\s/>]/.test(raw);
  let xml = raw;
  if (!looksLikeSsml) {
    xml = `<speak>${escapeXml(raw)}</speak>`;
  } else if (!/<speak[\s>]/i.test(xml)) {
    xml = `<speak>${xml}</speak>`;
  }

  // Strip unsupported tags but keep content
  xml = xml.replace(/<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g, (full, name: string) => {
    const n = name.toLowerCase();
    if (SUPPORTED.has(n)) return full;
    warnings.push(`Unsupported SSML element <${n}> stripped`);
    return '';
  });

  const plainText = stripTags(xml).replace(/\s+/g, ' ').trim();
  let engineText = '';

  switch (options.engine) {
    case 'piper':
      engineText = toPiper(xml, warnings);
      break;
    case 'platform-darwin':
      engineText = toMacSay(xml, warnings);
      break;
    case 'platform-win32':
      engineText = toSapiSsml(xml);
      break;
    default:
      engineText = plainText;
  }

  return {
    plainText,
    engineText,
    warnings,
    hasMarkup: looksLikeSsml,
  };
}

function toPiper(xml: string, warnings: string[]): string {
  // phoneme → [[ ipa ]]
  let s = xml.replace(
    /<phoneme\b[^>]*\bph=["']([^"']+)["'][^>]*>([\s\S]*?)<\/phoneme>/gi,
    (_m, ph: string) => ` [[ ${ph.trim()} ]] `,
  );
  // sub → alias
  s = s.replace(
    /<sub\b[^>]*\balias=["']([^"']+)["'][^>]*>([\s\S]*?)<\/sub>/gi,
    (_m, alias: string) => alias,
  );
  // break → period pause approximation via ellipsis / sentence silence markers
  s = s.replace(/<break\b[^>]*\btime=["']([^"']+)["'][^>]*\/?>/gi, (_m, t: string) => {
    const ms = parseTimeMs(t);
    if (ms >= 800) return '... ';
    if (ms >= 300) return '. ';
    return ', ';
  });
  // emphasis → leave text; piper limited
  s = s.replace(/<\/?emphasis\b[^>]*>/gi, '');
  // prosody → strip tags (rate handled at synth options)
  s = s.replace(/<\/?prosody\b[^>]*>/gi, (tag) => {
    if (/rate=/i.test(tag)) {
      warnings.push('prosody rate applied at engine options when possible');
    }
    return '';
  });
  // say-as → expand simple cases
  s = s.replace(
    /<say-as\b[^>]*interpret-as=["']([^"']+)["'][^>]*>([\s\S]*?)<\/say-as>/gi,
    (_m, interpret: string, body: string) => expandSayAs(interpret, stripTags(body)),
  );
  s = s.replace(/<\/?speak\b[^>]*>/gi, '');
  s = s.replace(/<\/?p\b[^>]*>/gi, '\n\n');
  s = s.replace(/<\/?s\b[^>]*>/gi, ' ');
  s = s.replace(/<\/?w\b[^>]*>/gi, '');
  return decodeXml(stripTags(s)).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function toMacSay(xml: string, _warnings: string[]): string {
  let s = xml;
  s = s.replace(
    /<break\b[^>]*\btime=["']([^"']+)["'][^>]*\/?>/gi,
    (_m, t: string) => ` [[slnc ${parseTimeMs(t)}]] `,
  );
  s = s.replace(
    /<emphasis\b[^>]*level=["']strong["'][^>]*>([\s\S]*?)<\/emphasis>/gi,
    (_m, body: string) => ` [[emph +]] ${stripTags(body)} [[emph -]] `,
  );
  s = s.replace(
    /<emphasis\b[^>]*>([\s\S]*?)<\/emphasis>/gi,
    (_m, body: string) => ` [[emph +]] ${stripTags(body)} [[emph -]] `,
  );
  s = s.replace(
    /<prosody\b[^>]*rate=["']([^"']+)["'][^>]*>([\s\S]*?)<\/prosody>/gi,
    (_m, rate: string, body: string) => {
      const r = mapMacRate(rate);
      return ` [[rate ${r}]] ${stripTags(body)} `;
    },
  );
  s = s.replace(
    /<sub\b[^>]*\balias=["']([^"']+)["'][^>]*>([\s\S]*?)<\/sub>/gi,
    (_m, alias: string) => alias,
  );
  s = s.replace(
    /<phoneme\b[^>]*\bph=["']([^"']+)["'][^>]*>([\s\S]*?)<\/phoneme>/gi,
    (_m, _ph: string, body: string) => stripTags(body),
  );
  s = s.replace(
    /<say-as\b[^>]*interpret-as=["']([^"']+)["'][^>]*>([\s\S]*?)<\/say-as>/gi,
    (_m, interpret: string, body: string) => expandSayAs(interpret, stripTags(body)),
  );
  s = s.replace(/<\/?speak\b[^>]*>/gi, '');
  s = s.replace(/<\/?p\b[^>]*>/gi, '\n\n');
  s = s.replace(/<\/?s\b[^>]*>/gi, ' ');
  return decodeXml(stripTags(s)).replace(/\s+/g, ' ').trim();
}

function toSapiSsml(xml: string): string {
  // Windows SAPI accepts a broad SSML subset — pass through cleaned markup
  if (!/<speak[\s>]/i.test(xml)) {
    return `<speak version="1.0" xml:lang="en-US">${xml}</speak>`;
  }
  return xml;
}

function mapMacRate(rate: string): number {
  const r = rate.trim().toLowerCase();
  if (r === 'x-slow' || r === 'slow') return 140;
  if (r === 'fast' || r === 'x-fast') return 220;
  if (r === 'medium') return 175;
  if (r.endsWith('%')) {
    const pct = parseFloat(r);
    if (Number.isFinite(pct)) return Math.round(175 * (pct / 100));
  }
  const n = parseFloat(r);
  return Number.isFinite(n) ? Math.round(n) : 175;
}

function expandSayAs(interpret: string, body: string): string {
  const t = body.trim();
  const kind = interpret.toLowerCase();
  if (kind === 'digits' || kind === 'telephone') {
    return t.split('').join(' ');
  }
  if (kind === 'characters' || kind === 'spell-out') {
    return t.split('').join(' ');
  }
  // cardinal/ordinal/date/time — leave as-is for engine
  return t;
}

function parseTimeMs(t: string): number {
  const s = t.trim().toLowerCase();
  if (s.endsWith('ms')) return Math.max(0, parseFloat(s));
  if (s.endsWith('s')) return Math.max(0, parseFloat(s) * 1000);
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Public list of supported elements for API/docs. */
export function supportedSsmlElements(): {
  element: string;
  syntax: string;
  engines: string[];
}[] {
  return [
    {
      element: 'speak',
      syntax: '<speak>...</speak>',
      engines: ['piper', 'platform', 'sapi'],
    },
    {
      element: 'break',
      syntax: '<break time="500ms"/>',
      engines: ['piper', 'platform', 'sapi'],
    },
    {
      element: 'emphasis',
      syntax: '<emphasis level="strong">...</emphasis>',
      engines: ['platform', 'sapi', 'piper(limited)'],
    },
    {
      element: 'prosody',
      syntax: '<prosody rate="slow" pitch="high">...</prosody>',
      engines: ['platform', 'sapi', 'piper(limited)'],
    },
    {
      element: 'say-as',
      syntax: '<say-as interpret-as="digits">123</say-as>',
      engines: ['piper', 'platform', 'sapi'],
    },
    {
      element: 'phoneme',
      syntax: '<phoneme alphabet="ipa" ph="təˈmeɪtoʊ">tomato</phoneme>',
      engines: ['piper', 'sapi'],
    },
    {
      element: 'sub',
      syntax: '<sub alias="World Wide Web">WWW</sub>',
      engines: ['piper', 'platform', 'sapi'],
    },
  ];
}
