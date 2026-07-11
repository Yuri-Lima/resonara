/**
 * Offline narration intelligence: attribution → REM, optional opt-in.
 * Default OFF — raw text users get neutral narration unless autoDirect=true.
 */
import { parseDialogue, hasDialogueMarkup, DialogueBlock } from '../dialogue-parser';
import {
  deliveryToRemPrefix,
  extractDeliveryFromAttribution,
  DeliveryHint,
} from './delivery-lexicon';

export interface AutoDirectionOptions {
  /** Master switch — default false. */
  enabled?: boolean;
  language?: string;
  /** Inject style for whole document. */
  defaultStyle?: 'narrative' | 'conversational' | 'newscast' | 'animated';
}

export interface AutoDirectionResult {
  text: string;
  applied: boolean;
  hintsApplied: number;
  warnings: string[];
}

/**
 * Apply auto-direction: wrap dialogue lines with REM from attribution verbs.
 * When disabled, returns text unchanged (opt-out purity).
 */
export function applyAutoDirection(
  text: string,
  opts: AutoDirectionOptions = {},
): AutoDirectionResult {
  const warnings: string[] = [];
  if (!opts.enabled) {
    return { text, applied: false, hintsApplied: 0, warnings };
  }
  if (!text || !text.trim()) {
    return { text: text || '', applied: false, hintsApplied: 0, warnings: ['empty'] };
  }

  let hintsApplied = 0;
  let out = text;
  const stylePrefix = opts.defaultStyle
    ? `{style: ${opts.defaultStyle}}\n`
    : '{style: narrative}\n';

  if (hasDialogueMarkup(text) || /[—–]/.test(text)) {
    const parsed = parseDialogue(text, {
      emDash: (opts.language || '').toLowerCase().startsWith('pt'),
    });
    const lines: string[] = [];
    for (const block of parsed.blocks) {
      const directed = directBlock(block);
      if (directed.hint) hintsApplied++;
      lines.push(directed.line);
    }
    out = stylePrefix + lines.join('\n\n');
  } else {
    // Paragraph-level punctuation cues only
    const paras = text.split(/\n{2,}/);
    const directed = paras.map((p) => {
      const hint = extractDeliveryFromAttribution(p);
      if (!hint) return p;
      hintsApplied++;
      const prefix = deliveryToRemPrefix(hint);
      return prefix ? `${prefix} ${p}` : p;
    });
    out = stylePrefix + directed.join('\n\n');
  }

  return { text: out, applied: true, hintsApplied, warnings };
}

function directBlock(block: DialogueBlock): { line: string; hint?: DeliveryHint } {
  const hint = extractDeliveryFromAttribution(block.text);
  const speaker = block.speaker;
  // Strip trailing attribution for delivery but keep spoken quote content
  const spoken = block.text;
  // Remove common "she whispered" tails from speakable — keep in analysis only
  // Actually keep full line; engine needs the words. Direction is REM prefix.
  const prefix = hint ? deliveryToRemPrefix(hint) : '';
  const line = prefix
    ? `[${speaker}]: ${prefix} ${spoken}`
    : `[${speaker}]: ${spoken}`;
  return { line, hint };
}
