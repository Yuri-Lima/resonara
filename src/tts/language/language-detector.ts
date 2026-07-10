/**
 * Offline language detection for en vs pt-BR (and mixed documents).
 * Character-frequency + function-word heuristic (no native deps, Jest-friendly).
 * Optional franc dynamic import is available at runtime when ESM load succeeds.
 */
import {
  LanguageBlock,
  LanguageCode,
  LanguageDetectionResult,
} from './language.types';
import {
  getDefaultLanguage,
  normalizeLanguageCode,
} from './language-registry';

const MIN_CHARS = 20;
const DEFAULT_CONFIDENCE = 0.7;

/** Portuguese-distinctive characters rare in English. */
const PT_CHARS = /[ãõáàâéêíóôúçÃÕÁÀÂÉÊÔÚÇ]/g;

const PT_WORDS =
  /\b(que|não|nao|uma|com|para|como|mais|dos|das|pelo|pela|você|voce|está|esta|também|tambem|são|sao|ou|em|os|as|um|de|da|do|no|na|por|se|ao|à|às|aos|ele|ela|eles|elas|isso|este|esta|esse|essa|muito|já|ja|foi|ser|ter|há|ha|sobre|entre|quando|onde|porque|após|apos|através|atraves|também|depois|antes|ainda|sempre|nunca|hoje|amanhã|amanha|ontem|brasil|brasileiro|português|portugues)\b/gi;

const EN_WORDS =
  /\b(the|and|of|to|in|is|that|for|with|on|as|are|this|was|be|have|from|by|or|an|at|it|not|you|his|her|they|we|their|which|will|can|about|more|when|there|been|has|were|would|what|said|each|she|do|how|if|up|out|them|then|some|could|into|than|other|these|may|only|over|such|after|most|also|through|during|before|between|under|while|where|because)\b/gi;

function letterCount(text: string): number {
  return (text.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
}

function heuristicScores(text: string): { pt: number; en: number } {
  const letters = Math.max(letterCount(text), 1);
  const ptChars = (text.match(PT_CHARS) || []).length;
  const ptWords = (text.match(PT_WORDS) || []).length;
  const enWords = (text.match(EN_WORDS) || []).length;
  const pt = (ptChars / letters) * 10 + ptWords * 0.35;
  const en = enWords * 0.35 - (ptChars / letters) * 4;
  return { pt, en };
}

export function detectLanguage(
  text: string,
  options?: {
    defaultLanguage?: LanguageCode;
    confidenceThreshold?: number;
  },
): LanguageDetectionResult {
  const fallback = options?.defaultLanguage || getDefaultLanguage();
  const threshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE;
  const plain = (text || '').replace(/<[^>]+>/g, ' ').trim();

  if (plain.length < MIN_CHARS) {
    return { code: fallback, confidence: 0.3, method: 'default' };
  }

  const letterRatio = letterCount(plain) / Math.max(plain.length, 1);
  if (letterRatio < 0.25) {
    return { code: fallback, confidence: 0.25, method: 'default' };
  }

  const { pt, en } = heuristicScores(plain);

  if (pt > en && pt > 0.4) {
    const confidence = Math.min(0.98, 0.55 + pt * 0.15);
    if (confidence >= threshold || pt > 1.2) {
      return { code: 'pt-BR', confidence, method: 'heuristic' };
    }
  }

  if (en >= pt) {
    return {
      code: 'en',
      confidence: Math.min(0.95, 0.55 + en * 0.12),
      method: 'heuristic',
    };
  }

  // Weak Portuguese signal still preferred over English when accents present
  if ((plain.match(PT_CHARS) || []).length >= 2) {
    return { code: 'pt-BR', confidence: 0.72, method: 'heuristic' };
  }

  return { code: fallback, confidence: 0.4, method: 'default' };
}

export function detectParagraphLanguages(
  text: string,
  options?: {
    defaultLanguage?: LanguageCode;
    confidenceThreshold?: number;
  },
): LanguageBlock[] {
  const raw = text || '';
  if (!raw.trim()) return [];

  const paragraphs = raw.split(/(\n{2,})/);
  const blocks: LanguageBlock[] = [];
  let offset = 0;

  for (const part of paragraphs) {
    if (/^\n+$/.test(part) || !part.trim()) {
      offset += part.length;
      continue;
    }
    const det = detectLanguage(part, options);
    blocks.push({
      text: part,
      language: det.code,
      startOffset: offset,
      endOffset: offset + part.length,
      confidence: det.confidence,
    });
    offset += part.length;
  }

  return mergeAdjacentSameLanguage(blocks);
}

export function detectSentenceLanguages(
  text: string,
  options?: {
    defaultLanguage?: LanguageCode;
    confidenceThreshold?: number;
  },
): LanguageBlock[] {
  const raw = text || '';
  if (!raw.trim()) return [];
  const parts = raw.split(/(?<=[.!?…])\s+/);
  const blocks: LanguageBlock[] = [];
  let offset = 0;
  for (const part of parts) {
    if (!part.trim()) continue;
    const idx = raw.indexOf(part, offset);
    const start = idx >= 0 ? idx : offset;
    const det = detectLanguage(part, options);
    blocks.push({
      text: part,
      language: det.code,
      startOffset: start,
      endOffset: start + part.length,
      confidence: det.confidence,
    });
    offset = start + part.length;
  }
  return mergeAdjacentSameLanguage(blocks);
}

function mergeAdjacentSameLanguage(blocks: LanguageBlock[]): LanguageBlock[] {
  if (!blocks.length) return [];
  const out: LanguageBlock[] = [{ ...blocks[0] }];
  for (let i = 1; i < blocks.length; i++) {
    const prev = out[out.length - 1];
    const cur = blocks[i];
    if (prev.language === cur.language) {
      prev.text =
        prev.text.endsWith('\n') || cur.text.startsWith('\n')
          ? prev.text + cur.text
          : `${prev.text}\n\n${cur.text}`;
      prev.endOffset = cur.endOffset;
      prev.confidence = Math.min(prev.confidence, cur.confidence);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

export function isMixedLanguage(blocks: LanguageBlock[]): boolean {
  const langs = new Set(
    blocks
      .filter((b) => b.text.trim().length >= MIN_CHARS)
      .map((b) => normalizeLanguageCode(b.language)),
  );
  return langs.has('en') && langs.has('pt-BR');
}
