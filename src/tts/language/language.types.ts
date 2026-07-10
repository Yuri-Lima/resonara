/**
 * Language-aware TTS types. Extensible beyond en / pt-BR.
 */

export type LanguageCode = 'en' | 'pt-BR' | string;

export interface NumberFormatConfig {
  decimal: string;
  thousands: string;
}

export interface LanguageConfig {
  code: LanguageCode;
  name: string;
  nativeName: string;
  /** Abbreviations that must not trigger sentence splits (with trailing period). */
  abbreviations: string[];
  /** Patterns that end a sentence (used as hints; chunker owns full logic). */
  sentenceEndPatterns: RegExp[];
  numberFormat: NumberFormatConfig;
  dateFormat: string;
  currencySymbol: string;
  currencyName: string;
  currencyPlural: string;
  /** Default Piper model key when installed. */
  defaultVoice?: string;
  /** ISO-ish tags accepted as aliases (en_US, pt_BR, por, …). */
  aliases: string[];
}

export interface LanguageDetectionResult {
  code: LanguageCode;
  confidence: number;
  method: 'franc' | 'heuristic' | 'default' | 'user';
}

export interface LanguageBlock {
  text: string;
  language: LanguageCode;
  startOffset: number;
  endOffset: number;
  confidence: number;
}

export interface LocaleFormatter {
  language: LanguageCode;
  /** Expand numbers, currency, dates, phones, IDs into spoken words. */
  expandForSpeech(text: string): string;
  formatNumber(value: number | string): string;
  formatCurrency(value: number | string): string;
  formatDate(value: string): string;
  formatPhone(value: string): string;
  formatOrdinal(value: number | string, gender?: 'm' | 'f'): string;
  formatPercentage(value: number | string): string;
}
