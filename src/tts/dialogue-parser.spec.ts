import { hasDialogueMarkup, parseDialogue } from './dialogue-parser';

describe('dialogue-parser', () => {
  it('parses speaker tags', () => {
    const text = `[narrator]: Hello.
[alice]: Hi there.
[bob]: Hey.`;
    const r = parseDialogue(text);
    expect(r.blocks).toHaveLength(3);
    expect(r.blocks[0].speaker).toBe('narrator');
    expect(r.blocks[1].text).toContain('Hi');
    expect(r.speakers).toEqual(expect.arrayContaining(['narrator', 'alice', 'bob']));
  });

  it('merges consecutive same-speaker blocks', () => {
    const text = `[alice]: One.
[alice]: Two.`;
    const r = parseDialogue(text);
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0].text).toContain('One');
    expect(r.blocks[0].text).toContain('Two');
  });

  it('uses default speaker for untagged text', () => {
    const r = parseDialogue('Just narration here.');
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0].speaker).toBe('narrator');
  });

  it('handles empty text', () => {
    const r = parseDialogue('');
    expect(r.blocks).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('warns on unknown speakers when known list provided', () => {
    const r = parseDialogue('[zed]: yo', { knownSpeakers: ['alice'] });
    expect(r.warnings.some((w) => w.includes('zed'))).toBe(true);
  });

  it('detects markup', () => {
    expect(hasDialogueMarkup('[alice]: hi')).toBe(true);
    expect(hasDialogueMarkup('plain')).toBe(false);
  });
});
