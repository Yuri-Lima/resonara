/**
 * Attribution-driven delivery lexicon (en + pt-BR).
 * Maps verbs/adverbs → REM emotion/intensity/volume hints.
 */

export interface DeliveryHint {
  emotion?: 'joy' | 'sadness' | 'tension' | 'calm' | 'anger' | 'neutral';
  intensity?: number;
  volume?: number; // 0..1 relative
  rate?: number; // multiplier
  style?: 'narrative' | 'conversational' | 'newscast' | 'animated';
  paralinguistic?: 'breath' | 'sigh' | 'laugh';
}

const EN: Record<string, DeliveryHint> = {
  whispered: { emotion: 'calm', intensity: 0.7, volume: 0.45, rate: 0.92 },
  whispers: { emotion: 'calm', intensity: 0.7, volume: 0.45, rate: 0.92 },
  whisper: { emotion: 'calm', intensity: 0.7, volume: 0.45, rate: 0.92 },
  muttered: { emotion: 'calm', intensity: 0.5, volume: 0.55, rate: 0.95 },
  mutters: { emotion: 'calm', intensity: 0.5, volume: 0.55, rate: 0.95 },
  shouted: { emotion: 'anger', intensity: 0.85, volume: 1.15, rate: 1.08 },
  shouts: { emotion: 'anger', intensity: 0.85, volume: 1.15, rate: 1.08 },
  yelled: { emotion: 'anger', intensity: 0.9, volume: 1.2, rate: 1.1 },
  screamed: { emotion: 'anger', intensity: 0.95, volume: 1.25, rate: 1.12 },
  hissed: { emotion: 'tension', intensity: 0.75, volume: 0.7, rate: 0.95 },
  sobbed: { emotion: 'sadness', intensity: 0.85, volume: 0.7, rate: 0.88, paralinguistic: 'breath' },
  cried: { emotion: 'sadness', intensity: 0.8, volume: 0.75, rate: 0.9 },
  laughed: { emotion: 'joy', intensity: 0.7, paralinguistic: 'laugh' },
  chuckled: { emotion: 'joy', intensity: 0.5, paralinguistic: 'laugh' },
  sighed: { emotion: 'sadness', intensity: 0.4, paralinguistic: 'sigh' },
  snapped: { emotion: 'anger', intensity: 0.7, rate: 1.05 },
  flatly: { emotion: 'neutral', intensity: 0.2, rate: 0.98, volume: 0.9 },
  softly: { emotion: 'calm', intensity: 0.5, volume: 0.6, rate: 0.94 },
  gently: { emotion: 'calm', intensity: 0.45, volume: 0.7, rate: 0.95 },
  angrily: { emotion: 'anger', intensity: 0.8 },
  sadly: { emotion: 'sadness', intensity: 0.7, rate: 0.92 },
  happily: { emotion: 'joy', intensity: 0.7, rate: 1.05 },
  nervously: { emotion: 'tension', intensity: 0.65, rate: 1.06 },
  coldly: { emotion: 'neutral', intensity: 0.3, rate: 0.96 },
  excitedly: { emotion: 'joy', intensity: 0.8, rate: 1.1 },
  demanded: { emotion: 'anger', intensity: 0.6, rate: 1.04 },
  pleaded: { emotion: 'sadness', intensity: 0.65, volume: 0.8 },
  murmured: { emotion: 'calm', intensity: 0.55, volume: 0.55, rate: 0.93 },
};

const PT: Record<string, DeliveryHint> = {
  sussurrou: { emotion: 'calm', intensity: 0.7, volume: 0.45, rate: 0.92 },
  sussurra: { emotion: 'calm', intensity: 0.7, volume: 0.45, rate: 0.92 },
  gritou: { emotion: 'anger', intensity: 0.85, volume: 1.15, rate: 1.08 },
  grita: { emotion: 'anger', intensity: 0.85, volume: 1.15, rate: 1.08 },
  berrou: { emotion: 'anger', intensity: 0.9, volume: 1.2, rate: 1.1 },
  sibilou: { emotion: 'tension', intensity: 0.75, volume: 0.7, rate: 0.95 },
  murmurou: { emotion: 'calm', intensity: 0.55, volume: 0.55, rate: 0.93 },
  resmungou: { emotion: 'anger', intensity: 0.4, volume: 0.7, rate: 0.95 },
  soluçou: { emotion: 'sadness', intensity: 0.85, volume: 0.7, rate: 0.88 },
  chorou: { emotion: 'sadness', intensity: 0.8, rate: 0.9 },
  riu: { emotion: 'joy', intensity: 0.7, paralinguistic: 'laugh' },
  suspirou: { emotion: 'sadness', intensity: 0.4, paralinguistic: 'sigh' },
  baixinho: { emotion: 'calm', intensity: 0.55, volume: 0.55, rate: 0.94 },
  calmamente: { emotion: 'calm', intensity: 0.5, rate: 0.95 },
  nervosamente: { emotion: 'tension', intensity: 0.65, rate: 1.06 },
  furiosamente: { emotion: 'anger', intensity: 0.85 },
  tristemente: { emotion: 'sadness', intensity: 0.7, rate: 0.92 },
  alegremente: { emotion: 'joy', intensity: 0.7, rate: 1.05 },
  sem: { emotion: 'neutral', intensity: 0.2 }, // "sem emoção" handled separately
  'sem emoção': { emotion: 'neutral', intensity: 0.15, rate: 0.98 },
  'sem emocao': { emotion: 'neutral', intensity: 0.15, rate: 0.98 },
};

const MERGED: Record<string, DeliveryHint> = { ...EN, ...PT };

export function lookupDelivery(word: string): DeliveryHint | undefined {
  if (!word) return undefined;
  const key = word.toLowerCase().normalize('NFC').trim();
  return MERGED[key];
}

export function extractDeliveryFromAttribution(text: string): DeliveryHint | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();

  // Multi-word first
  for (const phrase of ['sem emoção', 'sem emocao', 'said flatly', 'said softly']) {
    if (lower.includes(phrase)) {
      if (phrase.includes('flatly') || phrase.includes('sem emo')) {
        return MERGED['flatly'] || MERGED['sem emoção'];
      }
      if (phrase.includes('softly')) return MERGED['softly'];
    }
  }

  // Token scan
  const tokens = lower.split(/[^a-zà-ÿ]+/i).filter(Boolean);
  let best: DeliveryHint | undefined;
  for (const t of tokens) {
    const h = lookupDelivery(t);
    if (h) {
      best = { ...best, ...h };
    }
  }

  // Punctuation cues
  if (/!{2,}|\b[A-Z]{3,}\b/.test(text)) {
    best = {
      emotion: 'anger',
      intensity: Math.max(best?.intensity ?? 0.5, 0.75),
      rate: Math.max(best?.rate ?? 1, 1.08),
      ...best,
    };
  } else if (/\?$/.test(text.trim())) {
    best = { emotion: best?.emotion ?? 'neutral', intensity: best?.intensity ?? 0.4, ...best };
  } else if (/\.\.\.|…/.test(text)) {
    best = {
      emotion: best?.emotion ?? 'tension',
      intensity: best?.intensity ?? 0.45,
      rate: (best?.rate ?? 1) * 0.95,
      ...best,
    };
  }

  return best;
}

export function deliveryToRemPrefix(hint: DeliveryHint): string {
  const parts: string[] = [];
  if (hint.style) parts.push(`{style: ${hint.style}}`);
  if (hint.emotion) {
    const inten = hint.intensity ?? 0.5;
    parts.push(`{emotion: ${hint.emotion}, intensity: ${inten.toFixed(2)}}`);
  }
  if (hint.paralinguistic === 'laugh') parts.push('[laugh]');
  if (hint.paralinguistic === 'sigh') parts.push('[sigh]');
  if (hint.paralinguistic === 'breath') parts.push('[breath]');
  return parts.join(' ');
}

export const LEXICON_EN_SIZE = Object.keys(EN).length;
export const LEXICON_PT_SIZE = Object.keys(PT).length;
