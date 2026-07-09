import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { FfmpegService } from './ffmpeg.service';

const hasFfmpeg = (() => {
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  return r.status === 0;
})();

(hasFfmpeg ? describe : describe.skip)('FfmpegService', () => {
  let service: FfmpegService;
  let fixtureWav: string;
  let tmpRoot: string;

  beforeAll(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-test-'));
    fixtureWav = path.join(tmpRoot, 'tone.wav');
    // 1s stereo 440Hz sine @ 48kHz 16-bit
    const r = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=1:sample_rate=48000',
        '-ac',
        '2',
        fixtureWav,
      ],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) {
      throw new Error('fixture gen failed: ' + r.stderr);
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        FfmpegService,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) => {
              if (k === 'ffmpeg') {
                return {
                  path: process.env.FFMPEG_PATH || '',
                  ffprobePath: process.env.FFPROBE_PATH || '',
                  timeoutMs: 120000,
                };
              }
              return undefined;
            },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(FfmpegService);
    service.onModuleInit();
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('probe() returns duration and sample rate', async () => {
    const p = await service.probe(fixtureWav);
    expect(p.duration).toBeGreaterThan(0.9);
    expect(p.sampleRate).toBe(48000);
    expect(p.channels).toBe(2);
  });

  it('transcode to mp3', async () => {
    const out = path.join(tmpRoot, 'out.mp3');
    const r = await service.transcode(fixtureWav, out, {
      format: 'mp3',
      bitrate: 192,
    });
    expect(fs.existsSync(out)).toBe(true);
    expect(r.format).toBe('mp3');
    expect(r.duration).toBeGreaterThan(0.5);
  });

  it('two-pass normalize approaches target LUFS', async () => {
    const out = path.join(tmpRoot, 'norm.wav');
    const r = await service.normalize(fixtureWav, out, {
      targetLufs: -14,
      truePeak: -1,
      lra: 11,
      sampleRate: 48000,
    });
    expect(fs.existsSync(out)).toBe(true);
    expect(r.measured.inputI).toBeDefined();
    if (r.outputI != null) {
      expect(Math.abs(r.outputI - (-14))).toBeLessThanOrEqual(0.5);
    }
  }, 120000);

  it('extractWaveform returns peaks and rms', async () => {
    const w = await service.extractWaveform(fixtureWav, {
      resolution: 100,
      channels: 'stereo',
    });
    expect(w.peaks.mono.length).toBeGreaterThan(10);
    expect(w.rms.mono.length).toBe(w.peaks.mono.length);
    expect(w.peaks.left?.length).toBe(w.peaks.mono.length);
  });

  it('detectSilence on quiet-padded tone', async () => {
    const padded = path.join(tmpRoot, 'padded.wav');
    spawnSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'anullsrc=r=48000:cl=mono',
        '-t',
        '0.8',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=0.3:sample_rate=48000',
        '-f',
        'lavfi',
        '-i',
        'anullsrc=r=48000:cl=mono',
        '-t',
        '0.8',
        '-filter_complex',
        '[0][1][2]concat=n=3:v=0:a=1',
        padded,
      ],
      { encoding: 'utf8' },
    );
    const segs = await service.detectSilence(padded, {
      thresholdDb: -50,
      minDuration: 0.3,
    });
    expect(Array.isArray(segs)).toBe(true);
    expect(segs.length).toBeGreaterThanOrEqual(1);
  });

  it('trim shortens duration', async () => {
    const out = path.join(tmpRoot, 'trim.wav');
    const r = await service.trim(fixtureWav, out, {
      start: 0.1,
      end: 0.5,
      fadeIn: 0.05,
      fadeOut: 0.05,
      fadeCurve: 'quarter-sine',
    });
    expect(r.duration).toBeLessThan(0.5);
    expect(r.duration).toBeGreaterThan(0.2);
  });

  it('0-length file yields empty waveform without crash', async () => {
    const empty = path.join(tmpRoot, 'empty.wav');
    fs.writeFileSync(empty, Buffer.alloc(0));
    const w = await service.extractWaveform(empty, { resolution: 10 });
    expect(w.peaks.mono).toEqual([]);
    expect(w.rms.mono).toEqual([]);
  });

  it('corrupt file fails gracefully', async () => {
    const bad = path.join(tmpRoot, 'bad.wav');
    fs.writeFileSync(bad, Buffer.from('NOT_AN_AUDIO_FILE_XXXX'));
    await expect(service.probe(bad)).rejects.toThrow();
  });

  it('soxr path used for sample rate conversion 48k->44.1k', async () => {
    const out = path.join(tmpRoot, 'soxr.wav');
    const r = await service.transcode(fixtureWav, out, {
      format: 'wav',
      sampleRate: 44100,
      bitDepth: 16,
    });
    expect(r.sampleRate).toBe(44100);
  });
});
