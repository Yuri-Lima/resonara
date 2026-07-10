import { computeWer } from './wer';
import { normalizeForWer } from './normalize';

describe('computeWer', () => {
  it('exact match → 0', () => {
    const a = computeWer(['hello', 'world'], ['hello', 'world']);
    expect(a.wer).toBe(0);
    expect(a.substitutions + a.deletions + a.insertions).toBe(0);
  });

  it('one substitution: (S=1)/2 = 0.5', () => {
    const a = computeWer(['hello', 'world'], ['hello', 'there']);
    expect(a.substitutions).toBe(1);
    expect(a.wer).toBeCloseTo(0.5);
  });

  it('one deletion', () => {
    const a = computeWer(['a', 'b', 'c'], ['a', 'c']);
    expect(a.deletions).toBe(1);
    expect(a.wer).toBeCloseTo(1 / 3);
    expect(a.missing).toContain('b');
  });

  it('one insertion', () => {
    const a = computeWer(['a', 'c'], ['a', 'b', 'c']);
    expect(a.insertions).toBe(1);
    expect(a.wer).toBeCloseTo(0.5);
  });

  it('empty reference with hyp → insertions', () => {
    const a = computeWer([], ['x']);
    expect(a.insertions).toBe(1);
    expect(a.wer).toBe(1);
  });

  it('both empty → 0', () => {
    expect(computeWer([], []).wer).toBe(0);
  });
});

describe('normalizeForWer', () => {
  it('maps Dr. to doctor', () => {
    expect(normalizeForWer('Dr. Smith')).toEqual(['doctor', 'smith']);
  });

  it('expands 4.2 to four point two', () => {
    expect(normalizeForWer('value 4.2 units')).toEqual([
      'value',
      'four',
      'point',
      'two',
      'units',
    ]);
  });

  it('strips punctuation and lowercases', () => {
    expect(normalizeForWer('Hello, World!')).toEqual(['hello', 'world']);
  });
});
