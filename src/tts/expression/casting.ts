/**
 * Persistent per-character voice + style identity across a book.
 */
export interface CharacterCast {
  character: string;
  voiceId: string;
  style?: 'narrative' | 'conversational' | 'newscast' | 'animated';
  gender?: 'male' | 'female' | 'neutral';
  notes?: string;
}

export interface CastingTable {
  /** Book / job scope id */
  scopeId: string;
  narratorVoiceId?: string;
  characters: CharacterCast[];
  updatedAt: string;
}

export function normalizeCharacterName(name: string): string {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function upsertCast(
  table: CastingTable,
  cast: CharacterCast,
): CastingTable {
  const key = normalizeCharacterName(cast.character);
  const characters = table.characters.filter(
    (c) => normalizeCharacterName(c.character) !== key,
  );
  characters.push({ ...cast, character: key });
  return {
    ...table,
    characters,
    updatedAt: new Date().toISOString(),
  };
}

export function resolveCharacterVoice(
  table: CastingTable | undefined,
  character: string,
  fallbackVoiceId: string,
): { voiceId: string; style?: CharacterCast['style'] } {
  if (!table) return { voiceId: fallbackVoiceId };
  const key = normalizeCharacterName(character);
  if (key === 'narrator' || key === 'narrador') {
    return { voiceId: table.narratorVoiceId || fallbackVoiceId, style: 'narrative' };
  }
  const hit = table.characters.find((c) => normalizeCharacterName(c.character) === key);
  if (!hit) return { voiceId: fallbackVoiceId };
  return { voiceId: hit.voiceId, style: hit.style };
}

/**
 * Auto-propose casting from dialogue speaker list + available voices.
 * Deterministic: same speakers → same assignment order.
 */
export function proposeCasting(opts: {
  scopeId: string;
  speakers: string[];
  voices: Array<{ id: string; gender?: string; language?: string }>;
  narratorVoiceId?: string;
}): CastingTable {
  const female = opts.voices.filter((v) => v.gender === 'female');
  const male = opts.voices.filter((v) => v.gender === 'male');
  const any = opts.voices.length ? opts.voices : [{ id: 'piper:en_US-lessac-medium' }];
  let fi = 0;
  let mi = 0;
  let ai = 0;
  const characters: CharacterCast[] = [];
  const sorted = [...new Set(opts.speakers.map(normalizeCharacterName))].sort();
  for (const sp of sorted) {
    if (sp === 'narrator' || sp === 'narrador') continue;
    // Heuristic gender from name ending (weak, deterministic)
    const likelyFemale = /a$|ie$|y$|elle$|ine$|mara|maria|ana|lea|zoe/.test(sp);
    let voiceId: string;
    if (likelyFemale && female.length) {
      voiceId = female[fi++ % female.length].id;
    } else if (!likelyFemale && male.length) {
      voiceId = male[mi++ % male.length].id;
    } else {
      voiceId = any[ai++ % any.length].id;
    }
    characters.push({
      character: sp,
      voiceId,
      style: 'conversational',
      gender: likelyFemale ? 'female' : 'male',
    });
  }
  return {
    scopeId: opts.scopeId,
    narratorVoiceId: opts.narratorVoiceId || any[0].id,
    characters,
    updatedAt: new Date().toISOString(),
  };
}

/** Consistency: chapter1 cast must equal chapter12 cast for same character. */
export function castingConsistent(
  a: CastingTable,
  b: CastingTable,
  character: string,
): boolean {
  const va = resolveCharacterVoice(a, character, '');
  const vb = resolveCharacterVoice(b, character, '');
  return va.voiceId === vb.voiceId && va.style === vb.style;
}
