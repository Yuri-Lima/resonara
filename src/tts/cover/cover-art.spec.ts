import { buildAtempoChain, atempoFilterGraph, hashPalette, generateCoverSvg } from './cover-art';

describe('cover-art + atempo', () => {
  it('deterministic palette', () => {
    expect(hashPalette('Book A')).toEqual(hashPalette('Book A'));
  });

  it('svg contains title', () => {
    expect(generateCoverSvg('Hello', 'Author')).toContain('Hello');
  });

  it('atempo 0.5', () => {
    expect(buildAtempoChain(0.5)).toEqual([0.5]);
  });

  it('atempo 3.0 → [1.5, 2.0]', () => {
    const c = buildAtempoChain(3.0);
    const prod = c.reduce((a, b) => a * b, 1);
    expect(prod).toBeCloseTo(3.0, 2);
    expect(c.every((f) => f >= 0.5 && f <= 2.0)).toBe(true);
  });

  it('atempo 2.5 factors in range', () => {
    const c = buildAtempoChain(2.5);
    const prod = c.reduce((a, b) => a * b, 1);
    expect(prod).toBeCloseTo(2.5, 2);
    expect(c.every((f) => f >= 0.5 && f <= 2.0)).toBe(true);
  });

  it('filter graph string', () => {
    expect(atempoFilterGraph(1.5)).toContain('atempo=');
  });
});
