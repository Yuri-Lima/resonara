/**
 * Lightweight multi-speaker dialogue markup:
 *   [narrator]: The room fell silent.
 *   [alice]: I never said that.
 * Brazilian Portuguese em-dash convention:
 *   — Você vem? — perguntou Maria.
 * Text without a speaker tag uses the default speaker (narrator).
 */

export interface DialogueBlock {
  speaker: string;
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface DialogueParseResult {
  blocks: DialogueBlock[];
  speakers: string[];
  warnings: string[];
}

const SPEAKER_LINE = /^\s*\[([^\]]+)\]\s*:\s*(.*)$/;
/** Line-leading em dash (—) or double hyphen used as dialogue. */
const EM_DASH_LINE = /^\s*[—–]\s*(.*)$/;
const ATTRIBUTION_VERBS =
  /\b(perguntou|disse|respondeu|exclamou|sussurrou|gritou|falou|continuou|retrucou|observou|comentou|murmurou|asked|said|replied|exclaimed|whispered|shouted|continued)\b/i;

/**
 * Parse dialogue-tagged text into speaker blocks.
 * Supports [speaker]: tags and Portuguese em-dash dialogue.
 * Consecutive same-speaker blocks are merged.
 */
export function parseDialogue(
  text: string,
  options?: {
    defaultSpeaker?: string;
    knownSpeakers?: string[];
    /** When true (default for pt-BR), parse — dialogue lines. */
    emDash?: boolean;
  },
): DialogueParseResult {
  const defaultSpeaker = (options?.defaultSpeaker || 'narrator').toLowerCase();
  const known = new Set(
    (options?.knownSpeakers || []).map((s) => s.toLowerCase()),
  );
  const emDash = options?.emDash !== false;
  const warnings: string[] = [];
  if (!text || !text.trim()) {
    return { blocks: [], speakers: [], warnings: ['empty text'] };
  }

  const lines = text.split(/\r?\n/);
  const raw: DialogueBlock[] = [];
  let offset = 0;
  let currentSpeaker = defaultSpeaker;
  let buf: string[] = [];
  let blockStart = 0;
  let lastCharacterSpeaker = defaultSpeaker;
  let dialogueTurn = 0;

  const flush = (endOffset: number) => {
    const body = buf.join('\n').trim();
    if (!body) {
      buf = [];
      return;
    }
    raw.push({
      speaker: currentSpeaker,
      text: body,
      startOffset: blockStart,
      endOffset,
    });
    buf = [];
  };

  for (const line of lines) {
    const lineStart = offset;
    const m = line.match(SPEAKER_LINE);
    if (m) {
      flush(lineStart);
      currentSpeaker = m[1].trim().toLowerCase();
      if (currentSpeaker !== 'narrator' && currentSpeaker !== 'narrador') {
        lastCharacterSpeaker = currentSpeaker;
      }
      if (known.size && !known.has(currentSpeaker)) {
        warnings.push(`undefined speaker tag: ${currentSpeaker}`);
      }
      blockStart = lineStart;
      const rest = m[2] ?? '';
      buf = rest ? [rest] : [];
    } else if (emDash && EM_DASH_LINE.test(line)) {
      flush(lineStart);
      const body = (line.match(EM_DASH_LINE)?.[1] || '').trim();
      // "— Você vem? — perguntou Maria." → extract speaker from attribution
      const attr = body.match(
        /[—–]\s*(?:perguntou|disse|respondeu|exclamou|sussurrou|gritou|falou|asked|said|replied)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç]+)/i,
      );
      let speaker: string;
      if (attr) {
        speaker = attr[1].toLowerCase();
        lastCharacterSpeaker = speaker;
      } else if (ATTRIBUTION_VERBS.test(body) && /[—–]/.test(body.slice(1))) {
        // mid-line attribution without clear name → previous character
        speaker = lastCharacterSpeaker || `speaker${dialogueTurn}`;
      } else {
        dialogueTurn += 1;
        speaker = `speaker${((dialogueTurn - 1) % 2) + 1}`;
        lastCharacterSpeaker = speaker;
      }
      currentSpeaker = speaker;
      blockStart = lineStart;
      // Strip trailing attribution clause for cleaner speech
      const spoken = body
        .replace(
          /\s*[—–]\s*(?:perguntou|disse|respondeu|exclamou|sussurrou|gritou|falou|asked|said|replied)\s+[\wÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç]+.*$/i,
          '',
        )
        .trim();
      buf = spoken ? [spoken] : body ? [body] : [];
    } else {
      if (buf.length === 0 && raw.length === 0 && !line.trim()) {
        // leading blank
      } else {
        // Narration lines (no tag) → narrator
        if (buf.length === 0) {
          flush(lineStart);
          currentSpeaker = defaultSpeaker;
          blockStart = lineStart;
        }
        buf.push(line);
      }
    }
    offset += line.length + 1;
  }
  flush(text.length);

  // Merge consecutive same-speaker blocks
  const blocks: DialogueBlock[] = [];
  for (const b of raw) {
    const prev = blocks[blocks.length - 1];
    if (prev && prev.speaker === b.speaker) {
      prev.text = `${prev.text}\n${b.text}`.trim();
      prev.endOffset = b.endOffset;
    } else {
      blocks.push({ ...b });
    }
  }

  const speakers = [...new Set(blocks.map((b) => b.speaker))];
  return { blocks, speakers, warnings };
}

export function hasDialogueMarkup(text: string): boolean {
  if (!text) return false;
  return (
    /^\s*\[[^\]]+\]\s*:/m.test(text) ||
    /^\s*[—–]\s+\S/m.test(text)
  );
}
