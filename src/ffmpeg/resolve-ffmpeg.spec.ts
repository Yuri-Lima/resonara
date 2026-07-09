import * as fs from 'fs';
import {
  augmentedPath,
  probeFfmpegAvailability,
  resolveFfmpegBinary,
} from './resolve-ffmpeg';

describe('resolveFfmpegBinary', () => {
  it('finds a real ffmpeg on this host when installed', () => {
    const p = resolveFfmpegBinary(undefined, 'ffmpeg');
    // Either absolute path that exists, or bare name
    if (p !== 'ffmpeg') {
      expect(fs.existsSync(p)).toBe(true);
    }
    const st = probeFfmpegAvailability(p);
    // On CI without ffmpeg this may fail; on this Mac it should pass
    if (process.platform === 'darwin' && fs.existsSync('/opt/homebrew/bin/ffmpeg')) {
      expect(st.available).toBe(true);
      expect(st.ffmpeg).toContain('ffmpeg');
      expect(st.versionLine || '').toMatch(/ffmpeg/i);
    }
  });

  it('prefers absolute preferred path when executable', () => {
    const homebrew = '/opt/homebrew/bin/ffmpeg';
    if (!fs.existsSync(homebrew)) return;
    expect(resolveFfmpegBinary(homebrew, 'ffmpeg')).toBe(homebrew);
  });

  it('augments PATH with homebrew/local bins', () => {
    const p = augmentedPath();
    if (fs.existsSync('/opt/homebrew/bin')) {
      expect(p.includes('/opt/homebrew/bin')).toBe(true);
    }
  });
});
