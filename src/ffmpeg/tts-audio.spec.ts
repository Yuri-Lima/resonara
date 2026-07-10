import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FfmpegService } from './ffmpeg.service';

describe('FfmpegService TTS helpers', () => {
  let service: FfmpegService;
  let runRaw: jest.SpyInstance;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FfmpegService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((k: string) => {
              if (k === 'ffmpeg') return { path: 'ffmpeg', timeoutMs: 60000 };
              return undefined;
            }),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(FfmpegService);
    service.onModuleInit();
    runRaw = jest
      .spyOn(service, 'runFfmpegRaw')
      .mockResolvedValue({ stdout: '', stderr: '', code: 0 });
    jest.spyOn(service, 'normalize').mockResolvedValue({
      outputPath: '/tmp/out.wav',
      measured: {
        inputI: -20,
        inputLra: 5,
        inputTp: -2,
        inputThresh: -30,
        targetOffset: 0,
      },
      targetLufs: -16,
      truePeak: -1.5,
      lra: 11,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('trimChunkSilence invokes silenceremove filter', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-ff-'));
    const input = path.join(dir, 'in.wav');
    const output = path.join(dir, 'out.wav');
    fs.writeFileSync(input, 'x');
    await service.trimChunkSilence(input, output);
    expect(runRaw).toHaveBeenCalled();
    const args = runRaw.mock.calls[0][0] as string[];
    expect(args.join(' ')).toContain('silenceremove');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('crossfadeChunks copies single part', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-ff-'));
    const a = path.join(dir, 'a.wav');
    const out = path.join(dir, 'out.wav');
    fs.writeFileSync(a, 'data');
    await service.crossfadeChunks([a], out, { format: 'wav' });
    expect(fs.existsSync(out)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('crossfadeChunks uses acrossfade for two parts', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-ff-'));
    const a = path.join(dir, 'a.wav');
    const b = path.join(dir, 'b.wav');
    const out = path.join(dir, 'out.wav');
    fs.writeFileSync(a, 'a');
    fs.writeFileSync(b, 'b');
    await service.crossfadeChunks([a, b], out, { format: 'wav' });
    const joined = runRaw.mock.calls.map((c) => (c[0] as string[]).join(' ')).join(' | ');
    expect(joined).toMatch(/acrossfade|concat/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('postProcessTts applies highpass by default', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-ff-'));
    const input = path.join(dir, 'in.wav');
    const output = path.join(dir, 'out.wav');
    fs.writeFileSync(input, 'x');
    // mock copy for final
    runRaw.mockImplementation(async (args: string[]) => {
      const out = args[args.length - 1];
      if (typeof out === 'string' && out.endsWith('.wav')) {
        fs.writeFileSync(out, 'wav');
      }
      return { stdout: '', stderr: '', code: 0 };
    });
    await service.postProcessTts(input, output, {
      normalize: false,
      highpass: true,
      compress: false,
      format: 'wav',
    });
    const joined = runRaw.mock.calls.map((c) => (c[0] as string[]).join(' ')).join(' ');
    expect(joined).toContain('highpass');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
