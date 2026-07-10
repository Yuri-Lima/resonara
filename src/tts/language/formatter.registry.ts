import { enFormatter } from './en.formatter';
import { ptBrFormatter } from './pt-br.formatter';
import { LanguageCode, LocaleFormatter } from './language.types';
import { normalizeLanguageCode } from './language-registry';

const formatters = new Map<string, LocaleFormatter>();
formatters.set('en', enFormatter);
formatters.set('pt-br', ptBrFormatter);
formatters.set('pt-BR', ptBrFormatter);

export function getFormatter(languageCode: LanguageCode): LocaleFormatter {
  const code = normalizeLanguageCode(languageCode);
  return formatters.get(code) || formatters.get(code.toLowerCase()) || enFormatter;
}

export function expandTextForLanguage(
  text: string,
  languageCode: LanguageCode,
): string {
  return getFormatter(languageCode).expandForSpeech(text);
}
