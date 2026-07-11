/**
 * Regression pins: a future trim/crossfade change must not silently kill pauses.
 * These tests lock the pause map + assembly contract without requiring engines.
 */
import { chunkTextForTts } from '../text-chunker';
import {
  buildAssemblePlan,
  flattenPlanForConcat,
  shouldTrimChunkEdge,
} from './assemble-with-pauses';
import { resolvePauseProfile } from './pause-profiles';

const audiobook = resolvePauseProfile({ profile: 'audiobook' });

describe('pause regression pins (en)', () => {
  const text =
    'The quiet river, flowing past the mill, carried leaves.\n\n' +
    'After the storm the garden recovered.';

  it('emits paragraph endsAt between paragraphs', () => {
    const chunks = chunkTextForTts(text, { engine: 'piper', language: 'en' });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].pause?.endsAt).toBe('paragraph');
  });

  it('assembly inserts multi-hundred-ms gap at paragraph join', () => {
    const chunks = chunkTextForTts(text, { engine: 'piper', language: 'en' });
    const plan = buildAssemblePlan(
      chunks.map((c, i) => ({
        path: `c${i}.wav`,
        pause: c.pause || { endsAt: 'document-end', intraBoundaries: [] },
      })),
      { profile: audiobook, jitter: false, accountForEngineSentenceSilence: false },
    );
    const flat = flattenPlanForConcat(plan);
    const sil = flat.find((x) => x.type === 'silence' && x.boundary === 'paragraph');
    expect(sil && sil.type === 'silence').toBe(true);
    if (sil && sil.type === 'silence') {
      expect(sil.sec).toBeGreaterThanOrEqual(0.7);
      expect(sil.sec).toBeLessThanOrEqual(1.0);
    }
  });

  it('does not trim trailing silence on paragraph chunks', () => {
    const chunks = chunkTextForTts(text, { engine: 'piper', language: 'en' });
    expect(shouldTrimChunkEdge(chunks[0].pause, 'trailing')).toBe(false);
  });
});

describe('pause regression pins (pt-BR)', () => {
  const text =
    'O rio quieto, passando pelo moinho, carregava folhas.\n\n' +
    '— Você vem? — perguntou ela.\n\n' +
    '— Agora não — respondeu ele.';

  it('marks dialogue boundaries for travessão lines', () => {
    const chunks = chunkTextForTts(text, { engine: 'piper', language: 'pt-BR' });
    const ends = chunks.map((c) => c.pause?.endsAt);
    expect(ends.some((e) => e === 'dialogue' || e === 'paragraph')).toBe(true);
  });

  it('assembly inserts dialogue or paragraph gaps', () => {
    const chunks = chunkTextForTts(text, { engine: 'piper', language: 'pt-BR' });
    const plan = buildAssemblePlan(
      chunks.map((c, i) => ({
        path: `c${i}.wav`,
        pause: c.pause || { endsAt: 'document-end', intraBoundaries: [] },
      })),
      {
        profile: resolvePauseProfile({ profile: 'audiobook', language: 'pt-BR' }),
        jitter: false,
        accountForEngineSentenceSilence: false,
      },
    );
    const flat = flattenPlanForConcat(plan);
    const silences = flat.filter((x) => x.type === 'silence');
    expect(silences.length).toBeGreaterThanOrEqual(1);
    for (const s of silences) {
      if (s.type === 'silence') expect(s.sec).toBeGreaterThanOrEqual(0.25);
    }
  });
});
