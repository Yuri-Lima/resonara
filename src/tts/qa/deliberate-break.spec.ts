/**
 * Phase 7: deliberate-break detection proof.
 * Truncating reference text by ~30% must produce WER ≫ threshold and qaFailed.
 */
import { computeWer } from './wer';
import { normalizeForWer } from './normalize';

describe('deliberate-break detection', () => {
  const full =
    'The quick brown fox jumped gracefully over the lazy sleeping dog near the old stone bridge while birds sang overhead.';

  it('detects truncated synthesis (missing ~30% of words)', () => {
    const ref = normalizeForWer(full);
    // simulate dropped final third of speech
    const cut = full.split(/\s+/).slice(0, Math.floor(full.split(/\s+/).length * 0.7)).join(' ');
    const hyp = normalizeForWer(cut);
    const align = computeWer(ref, hyp);
    expect(align.wer).toBeGreaterThan(0.1);
    expect(align.deletions).toBeGreaterThan(0);
    const qaFailed = align.wer > 0.1;
    expect(qaFailed).toBe(true);
  });

  it('passes clean round-trip under threshold', () => {
    const ref = normalizeForWer(full);
    const hyp = normalizeForWer(full);
    const align = computeWer(ref, hyp);
    expect(align.wer).toBe(0);
  });

  it('flags swapped middle sentence as high WER', () => {
    const ref = normalizeForWer(
      'Alpha bravo charlie. Delta echo foxtrot. Golf hotel india.',
    );
    const hyp = normalizeForWer(
      'Alpha bravo charlie. XXX YYY ZZZ. Golf hotel india.',
    );
    const align = computeWer(ref, hyp);
    expect(align.wer).toBeGreaterThan(0.15);
    expect(align.substitutions + align.deletions + align.insertions).toBeGreaterThan(2);
  });
});
