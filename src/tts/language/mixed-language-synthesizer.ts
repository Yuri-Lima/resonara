/**
 * Split mixed en/pt-BR documents into language blocks for per-voice synthesis.
 * Actual audio synthesis stays in TtsService; this module plans the blocks.
 */
import {
  detectLanguage,
  detectParagraphLanguages,
  isMixedLanguage,
} from './language-detector';
import {
  LanguageBlock,
  LanguageCode,
} from './language.types';
import { normalizeLanguageCode } from './language-registry';

export interface MixedLanguagePlan {
  mode: 'single' | 'mixed';
  language: LanguageCode;
  blocks: LanguageBlock[];
  /** Minimum character length to allow a language switch mid-document. */
  minSwitchChars: number;
}

export interface VoicePairing {
  en?: string;
  'pt-BR'?: string;
}

const DEFAULT_MIN_SWITCH = 40;
const INTER_LANGUAGE_PAUSE_MS = 300;

export function planMixedLanguageSynthesis(
  text: string,
  options?: {
    language?: LanguageCode | 'auto';
    minSwitchChars?: number;
    defaultLanguage?: LanguageCode;
  },
): MixedLanguagePlan {
  const minSwitch = options?.minSwitchChars ?? DEFAULT_MIN_SWITCH;
  const hint = options?.language || 'auto';

  if (hint && hint !== 'auto') {
    const lang = normalizeLanguageCode(hint);
    return {
      mode: 'single',
      language: lang,
      blocks: [
        {
          text,
          language: lang,
          startOffset: 0,
          endOffset: text.length,
          confidence: 1,
        },
      ],
      minSwitchChars: minSwitch,
    };
  }

  const paragraphs = detectParagraphLanguages(text, {
    defaultLanguage: options?.defaultLanguage || 'en',
  });

  // Collapse very short foreign islands into surrounding language
  const stabilized = stabilizeShortIslands(paragraphs, minSwitch);

  if (!isMixedLanguage(stabilized)) {
    const top = detectLanguage(text, {
      defaultLanguage: options?.defaultLanguage || 'en',
    });
    return {
      mode: 'single',
      language: top.code,
      blocks: [
        {
          text,
          language: top.code,
          startOffset: 0,
          endOffset: text.length,
          confidence: top.confidence,
        },
      ],
      minSwitchChars: minSwitch,
    };
  }

  return {
    mode: 'mixed',
    language: 'auto',
    blocks: stabilized,
    minSwitchChars: minSwitch,
  };
}

function stabilizeShortIslands(
  blocks: LanguageBlock[],
  minSwitch: number,
): LanguageBlock[] {
  if (blocks.length <= 1) return blocks;
  const out: LanguageBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const trimmed = b.text.trim();
    if (
      trimmed.length < minSwitch &&
      out.length > 0 &&
      i < blocks.length - 1
    ) {
      // absorb into previous
      const prev = out[out.length - 1];
      prev.text = `${prev.text}\n\n${b.text}`.replace(/\n{3,}/g, '\n\n');
      prev.endOffset = b.endOffset;
    } else if (trimmed.length < minSwitch && out.length > 0) {
      const prev = out[out.length - 1];
      prev.text = `${prev.text}\n\n${b.text}`.replace(/\n{3,}/g, '\n\n');
      prev.endOffset = b.endOffset;
    } else {
      out.push({ ...b });
    }
  }
  // merge adjacent same language after absorption
  const merged: LanguageBlock[] = [];
  for (const b of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.language === b.language) {
      prev.text = `${prev.text}\n\n${b.text}`.replace(/\n{3,}/g, '\n\n');
      prev.endOffset = b.endOffset;
    } else {
      merged.push({ ...b });
    }
  }
  return merged;
}

export function interLanguagePauseMs(): number {
  return INTER_LANGUAGE_PAUSE_MS;
}

export function pickVoiceForLanguage(
  language: LanguageCode,
  pairing: VoicePairing | undefined,
  defaults: VoicePairing,
): string | undefined {
  const lang = normalizeLanguageCode(language);
  if (lang === 'pt-BR') {
    return pairing?.['pt-BR'] || defaults['pt-BR'];
  }
  return pairing?.en || defaults.en;
}
