/**
 * Lightweight multi-speaker dialogue markup:
 *   [narrator]: The room fell silent.
 *   [alice]: I never said that.
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

/**
 * Parse dialogue-tagged text into speaker blocks.
 * Consecutive same-speaker blocks are merged.
 */
export function parseDialogue(
  text: string,
  options?: { defaultSpeaker?: string; knownSpeakers?: string[] },
): DialogueParseResult {
  const defaultSpeaker = (options?.defaultSpeaker || 'narrator').toLowerCase();
  const known = new Set(
    (options?.knownSpeakers || []).map((s) => s.toLowerCase()),
  );
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
      if (known.size && !known.has(currentSpeaker)) {
        warnings.push(`undefined speaker tag: ${currentSpeaker}`);
      }
      blockStart = lineStart;
      const rest = m[2] ?? '';
      buf = rest ? [rest] : [];
    } else {
      if (buf.length === 0 && raw.length === 0 && !line.trim()) {
        // leading blank
      } else {
        if (buf.length === 0) blockStart = lineStart;
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
  return /^\s*\[[^\]]+\]\s*:/m.test(text || '');
}
