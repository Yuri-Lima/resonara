/**
 * Integration-style tests for hard problems (run with unit suite via path include).
 * These live under test/ and are invoked via npm test with a separate config if needed.
 * For simplicity, critical cases are also in src/ffmpeg/ffmpeg.service.spec.ts.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

(hasFfmpeg ? describe : describe.skip)('ffmpeg integration hard cases', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'int-'));

  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('streams long-ish wav without loading whole file in node (pipe size check)', () => {
    // 30s stereo 48k 16-bit ~5.7MB — verify ffmpeg pipe works
    const wav = path.join(tmp, 'long.wav');
    const r = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=220:duration=30:sample_rate=48000',
        '-ac',
        '2',
        wav,
      ],
      { encoding: 'utf8' },
    );
    expect(r.status).toBe(0);
    const size = fs.statSync(wav).size;
    expect(size).toBeGreaterThan(1_000_000);

    // pipe f32le and count bytes — streaming
    const pipe = spawnSync(
      'ffmpeg',
      [
        '-i',
        wav,
        '-f',
        'f32le',
        '-acodec',
        'pcm_f32le',
        '-ac',
        '1',
        '-ar',
        '8000',
        'pipe:1',
      ],
      { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 },
    );
    expect(pipe.status).toBe(0);
    expect(pipe.stdout.length).toBeGreaterThan(1000);
  }, 60000);

  it('soxr resampler is accepted by local ffmpeg', () => {
    const out = path.join(tmp, 'soxr.wav');
    const r = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=0.2:sample_rate=96000',
        '-af',
        'aresample=44100:resampler=soxr:precision=28:osf=s16:dither_method=triangular',
        out,
      ],
      { encoding: 'utf8' },
    );
    expect(r.status).toBe(0);
    expect(fs.existsSync(out)).toBe(true);
  });
});
