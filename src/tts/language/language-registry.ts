import { EN_CONFIG } from './en.config';
import { PT_BR_CONFIG } from './pt-br.config';
import { LanguageCode, LanguageConfig } from './language.types';

const registry = new Map<string, LanguageConfig>();

function register(cfg: LanguageConfig): void {
  registry.set(cfg.code.toLowerCase(), cfg);
  for (const a of cfg.aliases) {
    registry.set(a.toLowerCase(), cfg);
  }
}

register(EN_CONFIG);
register(PT_BR_CONFIG);

export function registerLanguage(cfg: LanguageConfig): void {
  register(cfg);
}

export function getLanguageConfig(code: LanguageCode): LanguageConfig {
  const key = normalizeLanguageCode(code).toLowerCase();
  const cfg = registry.get(key) || registry.get(code.toLowerCase());
  if (!cfg) {
    throw new Error(`Unknown language code: ${code}`);
  }
  return cfg;
}

export function tryGetLanguageConfig(
  code: LanguageCode,
): LanguageConfig | undefined {
  try {
    return getLanguageConfig(code);
  } catch {
    return undefined;
  }
}

export function listLanguages(): LanguageConfig[] {
  const seen = new Set<string>();
  const out: LanguageConfig[] = [];
  for (const cfg of registry.values()) {
    if (seen.has(cfg.code)) continue;
    seen.add(cfg.code);
    out.push(cfg);
  }
  return out;
}

export function getDefaultLanguage(): LanguageCode {
  return 'en';
}

/**
 * Normalize variants: en_US → en, pt_BR → pt-BR, por → pt-BR.
 */
export function normalizeLanguageCode(code: string): LanguageCode {
  if (!code) return getDefaultLanguage();
  const raw = code.trim().replace(/_/g, '-');
  const lower = raw.toLowerCase();
  if (lower === 'pt' || lower === 'por' || lower.startsWith('pt-br')) {
    return 'pt-BR';
  }
  if (lower.startsWith('pt-pt')) return 'pt-PT';
  if (lower.startsWith('en')) return 'en';
  const hit = registry.get(lower);
  if (hit) return hit.code;
  return raw;
}

export function languagesMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  try {
    return normalizeLanguageCode(a) === normalizeLanguageCode(b);
  } catch {
    return a.toLowerCase() === b.toLowerCase();
  }
}
