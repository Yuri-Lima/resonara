import { detectAudioFormat, isAllowedAudio } from './magic-bytes';

describe('magic-bytes', () => {
  it('detects WAV', () => {
    const buf = Buffer.alloc(12);
    buf.write('RIFF', 0);
    buf.write('WAVE', 8);
    expect(detectAudioFormat(buf)).toBe('wav');
    expect(isAllowedAudio(buf)).toBe(true);
  });

  it('detects FLAC', () => {
    const buf = Buffer.from('fLaC........');
    expect(detectAudioFormat(buf)).toBe('flac');
  });

  it('detects ID3 MP3', () => {
    const buf = Buffer.from([0x49, 0x44, 0x33, 0x03, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectAudioFormat(buf)).toBe('mp3');
  });

  it('rejects unknown', () => {
    expect(detectAudioFormat(Buffer.from('hello world!!'))).toBe('unknown');
    expect(isAllowedAudio(Buffer.from('hello world!!'))).toBe(false);
  });
});
