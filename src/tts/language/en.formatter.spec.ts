import { expandEnForSpeech, integerToEn } from './en.formatter';

describe('en.formatter', () => {
  it('converts integers to English words', () => {
    expect(integerToEn(0)).toBe('zero');
    expect(integerToEn(21)).toMatch(/twenty/i);
    expect(integerToEn(1000)).toMatch(/thousand/i);
  });

  it('expands currency and percentages for speech', () => {
    const money = expandEnForSpeech('Price is $12.50 today.');
    expect(money.toLowerCase()).toMatch(/dollar|cent|twelve|fifty/);
    const pct = expandEnForSpeech('Growth of 15%.');
    expect(pct.toLowerCase()).toMatch(/percent|fifteen/);
  });

  it('leaves plain prose mostly intact', () => {
    const t = 'Hello world from Resonara.';
    expect(expandEnForSpeech(t)).toContain('Hello');
  });
});
