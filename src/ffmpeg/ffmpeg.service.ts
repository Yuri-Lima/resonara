import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ffmpeg from 'fluent-ffmpeg';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import {
  CoverArtResult,
  LoudnormMeasure,
  NormalizeOptions,
  NormalizeResult,
  ProbeResult,
  SilenceOptions,
  SilenceSegment,
  TranscodeOptions,
  TranscodeResult,
  TrimOptions,
  TrimResult,
  WaveformOptions,
  WaveformResult,
} from './ffmpeg.types';

const FADE_CURVE_MAP: Record<string, string> = {
  linear: 'tri',
  exponential: 'exp',
  logarithmic: 'log',
  'quarter-sine': 'qsin',
};

@Injectable()
export class FfmpegService implements OnModuleInit {
  private readonly logger = new Logger(FfmpegService.name);
  private ffmpegPath = 'ffmpeg';
  private ffprobePath = 'ffprobe';
  private timeoutMs = 600_000;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const cfg = this.config.get('ffmpeg') || {};
    if (cfg.path) {
      this.ffmpegPath = cfg.path;
      ffmpeg.setFfmpegPath(cfg.path);
    }
    if (cfg.ffprobePath) {
      this.ffprobePath = cfg.ffprobePath;
      ffmpeg.setFfprobePath(cfg.ffprobePath);
    }
    this.timeoutMs = cfg.timeoutMs || 600_000;
    this.logger.log(
      `ffmpeg=${this.ffmpegPath} ffprobe=${this.ffprobePath} timeout=${this.timeoutMs}ms`,
    );
  }

  /** Always probe before processing. */
  async probe(inputPath: string): Promise<ProbeResult> {
    if (!fs.existsSync(inputPath)) {
      throw new BadRequestException(`Input not found: ${inputPath}`);
    }
    const stat = fs.statSync(inputPath);
    if (stat.size === 0) {
      throw new BadRequestException('Audio file is empty (0 bytes)');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new BadRequestException('ffprobe timed out'));
      }, Math.min(this.timeoutMs, 60_000));

      ffmpeg.ffprobe(inputPath, (err, data) => {
        clearTimeout(timer);
        if (err) {
          reject(
            new BadRequestException(
              this.parseFfmpegError(err.message || String(err)),
            ),
          );
          return;
        }
        try {
          resolve(this.mapProbe(data));
        } catch (e: any) {
          reject(new BadRequestException(e.message));
        }
      });
    });
  }

  private mapProbe(data: ffmpeg.FfprobeData): ProbeResult {
    const format = data.format || ({} as ffmpeg.FfprobeFormat);
    const audio =
      (data.streams || []).find((s) => s.codec_type === 'audio') ||
      (data.streams || [])[0];
    const tags: Record<string, string> = {};
    const rawTags = {
      ...(format.tags || {}),
      ...(audio?.tags || {}),
    } as Record<string, string>;
    for (const [k, v] of Object.entries(rawTags)) {
      if (v != null) tags[k.toLowerCase()] = String(v);
    }

    const parseIntOrNull = (v: unknown): number | null => {
      if (v == null || v === '') return null;
      const n = parseInt(String(v), 10);
      return Number.isFinite(n) ? n : null;
    };
    const parseFloatOrZero = (v: unknown): number => {
      const n = parseFloat(String(v ?? 0));
      return Number.isFinite(n) ? n : 0;
    };

    let bitDepth: number | null = null;
    if (audio?.bits_per_raw_sample) {
      bitDepth = parseIntOrNull(audio.bits_per_raw_sample);
    } else if (audio?.bits_per_sample) {
      bitDepth = parseIntOrNull(audio.bits_per_sample);
    } else if (audio?.sample_fmt) {
      const m = String(audio.sample_fmt).match(/(\d+)/);
      if (m) bitDepth = parseIntOrNull(m[1]);
    }

    const hasCoverArt = (data.streams || []).some(
      (s) =>
        s.codec_type === 'video' ||
        String(s.codec_name || '').includes('mjpeg') ||
        String(s.codec_name || '').includes('png'),
    );

    return {
      format: format.format_name || 'unknown',
      duration: parseFloatOrZero(format.duration || audio?.duration || 0),
      bitRate: parseIntOrNull(format.bit_rate),
      sampleRate: parseIntOrNull(audio?.sample_rate),
      channels:
        audio?.channels != null && Number.isFinite(Number(audio.channels))
          ? Number(audio.channels)
          : null,
      bitDepth,
      codec: audio?.codec_name || null,
      tags,
      hasCoverArt,
      raw: data as unknown as Record<string, unknown>,
    };
  }

  /**
   * Transcode with soxr for sample-rate conversion and TPDF dither for bit-depth reduction.
   */
  async transcode(
    inputPath: string,
    outputPath: string,
    options: TranscodeOptions,
  ): Promise<TranscodeResult> {
    await this.probe(inputPath);
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    const filters: string[] = [];
    const inputProbe = await this.probe(inputPath);
    const targetSr = options.sampleRate;
    const needResample =
      targetSr != null &&
      inputProbe.sampleRate != null &&
      targetSr !== inputProbe.sampleRate;
    const needBitDepth =
      options.format === 'wav' &&
      options.bitDepth === 16 &&
      (inputProbe.bitDepth == null || inputProbe.bitDepth > 16);

    if (needResample || needBitDepth || options.sampleRate) {
      // Mandatory soxr — never default SWR for production quality
      const parts = [`resampler=soxr`, `precision=28`];
      if (options.sampleRate) {
        // aresample first arg / sample_rate
      }
      let af = options.sampleRate
        ? `aresample=${options.sampleRate}:resampler=soxr:precision=28`
        : `aresample=resampler=soxr:precision=28`;
      if (needBitDepth || (options.format === 'wav' && options.bitDepth === 16)) {
        af += `:osf=s16:dither_method=triangular`;
      }
      filters.push(af);
    } else if (options.sampleRate) {
      filters.push(
        `aresample=${options.sampleRate}:resampler=soxr:precision=28`,
      );
    }

    return new Promise((resolve, reject) => {
      let cmd = ffmpeg(inputPath).output(outputPath);

      if (filters.length) {
        cmd = cmd.audioFilters(filters);
      }

      cmd = this.applyEncoder(cmd, options);

      if (options.channels) {
        cmd = cmd.audioChannels(options.channels);
      }

      const timer = setTimeout(() => {
        try {
          (cmd as any).kill?.('SIGKILL');
        } catch {
          /* ignore */
        }
        reject(new BadRequestException('ffmpeg transcode timed out'));
      }, this.timeoutMs);

      cmd
        .on('progress', (p) => {
          if (options.onProgress && p.percent != null) {
            options.onProgress(Math.min(99, Math.max(0, p.percent)));
          }
        })
        .on('error', (err, _stdout, stderr) => {
          clearTimeout(timer);
          reject(
            new BadRequestException(
              this.parseFfmpegError(stderr || err.message),
            ),
          );
        })
        .on('end', async () => {
          clearTimeout(timer);
          try {
            const out = await this.probe(outputPath);
            options.onProgress?.(100);
            resolve({
              outputPath,
              format: options.format,
              duration: out.duration,
              sampleRate: out.sampleRate,
              channels: out.channels,
              bitRate: out.bitRate,
            });
          } catch (e: any) {
            reject(e);
          }
        })
        .run();
    });
  }

  private applyEncoder(
    cmd: ffmpeg.FfmpegCommand,
    options: TranscodeOptions,
  ): ffmpeg.FfmpegCommand {
    switch (options.format) {
      case 'mp3': {
        cmd = cmd.audioCodec('libmp3lame').format('mp3');
        if (options.vbr && options.quality != null) {
          const q = Math.min(9, Math.max(0, options.quality));
          cmd = cmd.audioQuality(q);
        } else {
          const br = options.bitrate || 192;
          cmd = cmd.audioBitrate(br);
        }
        break;
      }
      case 'aac': {
        // Native encoder only — not libfdk_aac (licensing)
        const br = options.bitrate || 192;
        cmd = cmd.audioCodec('aac').audioBitrate(br).format('adts');
        // Prefer m4a container when output ends with .m4a
        break;
      }
      case 'flac': {
        const level = options.quality != null ? options.quality : 5;
        cmd = cmd
          .audioCodec('flac')
          .outputOptions([`-compression_level`, String(Math.min(8, Math.max(0, level)))])
          .format('flac');
        break;
      }
      case 'ogg': {
        const q = options.quality != null ? options.quality : 5;
        cmd = cmd.audioCodec('libvorbis').audioQuality(q).format('ogg');
        break;
      }
      case 'opus': {
        const br = options.bitrate || 128;
        cmd = cmd.audioCodec('libopus').audioBitrate(br).format('opus');
        break;
      }
      case 'wav': {
        const depth = options.bitDepth || 16;
        const codec =
          depth === 32
            ? 'pcm_s32le'
            : depth === 24
              ? 'pcm_s24le'
              : 'pcm_s16le';
        cmd = cmd.audioCodec(codec).format('wav');
        if (options.sampleRate) {
          cmd = cmd.audioFrequency(options.sampleRate);
        }
        break;
      }
      default:
        throw new BadRequestException(`Unsupported format: ${options.format}`);
    }
    return cmd;
  }

  /**
   * TWO-PASS EBU R128 loudness normalization (mandatory — not single-pass).
   * Pass 1: measure with print_format=json
   * Pass 2: apply measured_* + linear=true
   */
  async normalize(
    inputPath: string,
    outputPath: string,
    options: NormalizeOptions,
  ): Promise<NormalizeResult> {
    await this.probe(inputPath);
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    const targetLufs = options.targetLufs;
    const truePeak = options.truePeak;
    const lra = options.lra;

    options.onProgress?.(5, 1);
    const measured = await this.loudnormMeasure(
      inputPath,
      targetLufs,
      truePeak,
      lra,
    );
    options.onProgress?.(50, 1);

    options.onProgress?.(55, 2);
    await this.loudnormApply(
      inputPath,
      outputPath,
      targetLufs,
      truePeak,
      lra,
      measured,
      options.sampleRate,
      (p) => options.onProgress?.(55 + p * 0.4, 2),
    );
    options.onProgress?.(100, 2);

    // Verify within ±0.5 LUFS
    let outputI: number | undefined;
    let withinTolerance: boolean | undefined;
    try {
      const verify = await this.loudnormMeasure(
        outputPath,
        targetLufs,
        truePeak,
        lra,
      );
      outputI = verify.inputI;
      withinTolerance = Math.abs(verify.inputI - targetLufs) <= 0.5;
    } catch (e) {
      this.logger.warn(`loudnorm verify skipped: ${(e as Error).message}`);
    }

    return {
      outputPath,
      measured,
      targetLufs,
      truePeak,
      lra,
      outputI,
      withinTolerance,
    };
  }

  private async loudnormMeasure(
    inputPath: string,
    I: number,
    TP: number,
    LRA: number,
  ): Promise<LoudnormMeasure> {
    const filter = `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:print_format=json`;
    const { stderr } = await this.runFfmpegRaw([
      '-hide_banner',
      '-i',
      inputPath,
      '-af',
      filter,
      '-f',
      'null',
      '-',
    ]);
    const json = this.extractJsonFromStderr(stderr);
    if (!json) {
      throw new BadRequestException(
        'Failed to parse loudnorm measurement JSON from ffmpeg',
      );
    }
    return {
      inputI: parseFloat(json.input_i),
      inputLra: parseFloat(json.input_lra),
      inputTp: parseFloat(json.input_tp),
      inputThresh: parseFloat(json.input_thresh),
      targetOffset: parseFloat(json.target_offset),
      normalizationType: json.normalization_type,
    };
  }

  private async loudnormApply(
    inputPath: string,
    outputPath: string,
    I: number,
    TP: number,
    LRA: number,
    m: LoudnormMeasure,
    sampleRate?: number,
    onProgress?: (pct: number) => void,
  ): Promise<void> {
    const filter =
      `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}` +
      `:measured_I=${m.inputI}:measured_LRA=${m.inputLra}` +
      `:measured_TP=${m.inputTp}:measured_thresh=${m.inputThresh}` +
      `:offset=${m.targetOffset}:linear=true`;

    // Restore sample rate with soxr after loudnorm (works at high internal rate)
    const sr = sampleRate || 48000;
    const af = `${filter},aresample=${sr}:resampler=soxr:precision=28`;

    return new Promise((resolve, reject) => {
      const cmd = ffmpeg(inputPath)
        .audioFilters(af)
        .audioCodec('pcm_s24le')
        .format('wav')
        .output(outputPath);

      const timer = setTimeout(() => {
        try {
          (cmd as any).kill?.('SIGKILL');
        } catch {
          /* ignore */
        }
        reject(new BadRequestException('loudnorm pass 2 timed out'));
      }, this.timeoutMs);

      cmd
        .on('progress', (p) => {
          if (onProgress && p.percent != null) onProgress(p.percent / 100);
        })
        .on('error', (err, _o, stderr) => {
          clearTimeout(timer);
          reject(
            new BadRequestException(
              this.parseFfmpegError(stderr || err.message),
            ),
          );
        })
        .on('end', () => {
          clearTimeout(timer);
          resolve();
        })
        .run();
    });
  }

  /**
   * Extract waveform peaks + RMS by streaming f32le PCM (not full-file buffer).
   */
  async extractWaveform(
    inputPath: string,
    options: WaveformOptions = {},
  ): Promise<WaveformResult> {
    const resolution = options.resolution ?? 1800;
    const mode = options.channels ?? 'stereo';
    const sampleRate = 44100;
    const empty = (channels = 1): WaveformResult => ({
      duration: 0,
      sampleRate,
      channels,
      resolution,
      peaks: { mono: [] },
      rms: { mono: [] },
    });

    // 0-length → empty peaks (no crash)
    if (!fs.existsSync(inputPath) || fs.statSync(inputPath).size === 0) {
      return empty(mode === 'mono' ? 1 : 2);
    }

    const probe = await this.probe(inputPath);
    const channels = mode === 'mono' ? 1 : Math.min(2, probe.channels || 2);

    if (probe.duration === 0) {
      return empty(channels);
    }

    const totalSamplesPerChannel = Math.max(
      1,
      Math.floor(probe.duration * sampleRate),
    );
    const samplesPerBucket = Math.max(
      1,
      Math.floor(totalSamplesPerChannel / resolution),
    );

    const peaksL: Array<[number, number]> = [];
    const peaksR: Array<[number, number]> = [];
    const peaksM: Array<[number, number]> = [];
    const rmsL: number[] = [];
    const rmsR: number[] = [];
    const rmsM: number[] = [];

    let bucketMinL = Infinity,
      bucketMaxL = -Infinity,
      sumSqL = 0,
      countL = 0;
    let bucketMinR = Infinity,
      bucketMaxR = -Infinity,
      sumSqR = 0,
      countR = 0;
    let samplesInBucket = 0;
    let leftover: Buffer = Buffer.alloc(0);
    const bytesPerFrame = 4 * channels; // f32le

    await this.streamPcm(inputPath, channels, sampleRate, (chunk) => {
      let buf: Buffer = leftover.length
        ? Buffer.concat([leftover, chunk])
        : chunk;
      const frames = Math.floor(buf.length / bytesPerFrame);
      const usable = frames * bytesPerFrame;
      leftover = Buffer.from(buf.subarray(usable));
      buf = Buffer.from(buf.subarray(0, usable));

      for (let i = 0; i < frames; i++) {
        const off = i * bytesPerFrame;
        const l = buf.readFloatLE(off);
        const r = channels > 1 ? buf.readFloatLE(off + 4) : l;
        const m = channels > 1 ? (l + r) / 2 : l;

        bucketMinL = Math.min(bucketMinL, l);
        bucketMaxL = Math.max(bucketMaxL, l);
        sumSqL += l * l;
        countL++;

        bucketMinR = Math.min(bucketMinR, r);
        bucketMaxR = Math.max(bucketMaxR, r);
        sumSqR += r * r;
        countR++;

        samplesInBucket++;
        if (samplesInBucket >= samplesPerBucket) {
          const minM = Math.min(bucketMinL, bucketMinR);
          const maxM = Math.max(bucketMaxL, bucketMaxR);
          peaksL.push([
            Number.isFinite(bucketMinL) ? bucketMinL : 0,
            Number.isFinite(bucketMaxL) ? bucketMaxL : 0,
          ]);
          peaksR.push([
            Number.isFinite(bucketMinR) ? bucketMinR : 0,
            Number.isFinite(bucketMaxR) ? bucketMaxR : 0,
          ]);
          peaksM.push([minM, maxM]);
          rmsL.push(countL ? Math.sqrt(sumSqL / countL) : 0);
          rmsR.push(countR ? Math.sqrt(sumSqR / countR) : 0);
          rmsM.push(
            countL + countR
              ? Math.sqrt((sumSqL + sumSqR) / (countL + countR))
              : 0,
          );
          bucketMinL = Infinity;
          bucketMaxL = -Infinity;
          sumSqL = 0;
          countL = 0;
          bucketMinR = Infinity;
          bucketMaxR = -Infinity;
          sumSqR = 0;
          countR = 0;
          samplesInBucket = 0;
        }
      }
    });

    // flush remainder
    if (samplesInBucket > 0) {
      peaksL.push([
        Number.isFinite(bucketMinL) ? bucketMinL : 0,
        Number.isFinite(bucketMaxL) ? bucketMaxL : 0,
      ]);
      peaksR.push([
        Number.isFinite(bucketMinR) ? bucketMinR : 0,
        Number.isFinite(bucketMaxR) ? bucketMaxR : 0,
      ]);
      peaksM.push([
        Math.min(
          Number.isFinite(bucketMinL) ? bucketMinL : 0,
          Number.isFinite(bucketMinR) ? bucketMinR : 0,
        ),
        Math.max(
          Number.isFinite(bucketMaxL) ? bucketMaxL : 0,
          Number.isFinite(bucketMaxR) ? bucketMaxR : 0,
        ),
      ]);
      rmsL.push(countL ? Math.sqrt(sumSqL / countL) : 0);
      rmsR.push(countR ? Math.sqrt(sumSqR / countR) : 0);
      rmsM.push(
        countL + countR
          ? Math.sqrt((sumSqL + sumSqR) / (countL + countR))
          : 0,
      );
    }

    const result: WaveformResult = {
      duration: probe.duration,
      sampleRate,
      channels,
      resolution: peaksM.length,
      peaks: { mono: peaksM },
      rms: { mono: rmsM },
    };
    if (mode === 'stereo' && channels > 1) {
      result.peaks.left = peaksL;
      result.peaks.right = peaksR;
      result.rms.left = rmsL;
      result.rms.right = rmsR;
    }
    return result;
  }

  private streamPcm(
    inputPath: string,
    channels: number,
    sampleRate: number,
    onChunk: (buf: Buffer) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-hide_banner',
        '-i',
        inputPath,
        '-vn',
        '-ac',
        String(channels),
        '-ar',
        String(sampleRate),
        '-f',
        'f32le',
        '-acodec',
        'pcm_f32le',
        'pipe:1',
      ];
      const child = spawn(this.ffmpegPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new BadRequestException('waveform PCM stream timed out'));
      }, this.timeoutMs);

      child.stdout.on('data', (c: Buffer) => onChunk(c));
      child.stderr.on('data', (c: Buffer) => {
        stderr += c.toString();
        if (stderr.length > 50_000) stderr = stderr.slice(-30_000);
      });
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(new BadRequestException(e.message));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 || code === null) resolve();
        else
          reject(
            new BadRequestException(
              this.parseFfmpegError(stderr || `ffmpeg exit ${code}`),
            ),
          );
      });
    });
  }

  async detectSilence(
    inputPath: string,
    options: SilenceOptions = {},
  ): Promise<SilenceSegment[]> {
    await this.probe(inputPath);
    const thresholdDb = options.thresholdDb ?? -50;
    const minDuration = options.minDuration ?? 0.5;
    // noise as dB string
    const noise =
      thresholdDb < 0 ? `${thresholdDb}dB` : String(thresholdDb);

    const { stderr } = await this.runFfmpegRaw([
      '-hide_banner',
      '-i',
      inputPath,
      '-af',
      `silencedetect=noise=${noise}:d=${minDuration}`,
      '-f',
      'null',
      '-',
    ]);

    return this.parseSilence(stderr);
  }

  private parseSilence(stderr: string): SilenceSegment[] {
    const segments: SilenceSegment[] = [];
    let currentStart: number | null = null;
    for (const line of stderr.split('\n')) {
      const startM = line.match(/silence_start:\s*([-\d.]+)/);
      if (startM) {
        currentStart = parseFloat(startM[1]);
        continue;
      }
      const endM = line.match(
        /silence_end:\s*([-\d.]+)\s*\|\s*silence_duration:\s*([-\d.]+)/,
      );
      if (endM && currentStart != null) {
        segments.push({
          start: currentStart,
          end: parseFloat(endM[1]),
          duration: parseFloat(endM[2]),
        });
        currentStart = null;
      }
    }
    return segments;
  }

  async trim(
    inputPath: string,
    outputPath: string,
    options: TrimOptions,
  ): Promise<TrimResult> {
    const probe = await this.probe(inputPath);
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    const start = Math.max(0, options.start);
    const end =
      options.end != null
        ? Math.min(options.end, probe.duration || options.end)
        : undefined;
    if (end != null && end <= start) {
      throw new BadRequestException('trim end must be greater than start');
    }

    const curve =
      FADE_CURVE_MAP[options.fadeCurve || 'linear'] || 'tri';
    const filters: string[] = [];
    if (options.fadeIn && options.fadeIn > 0) {
      filters.push(
        `afade=t=in:st=0:d=${options.fadeIn}:curve=${curve}`,
      );
    }
    if (options.fadeOut && options.fadeOut > 0) {
      const dur =
        end != null ? end - start : (probe.duration || 0) - start;
      const fadeStart = Math.max(0, dur - options.fadeOut);
      filters.push(
        `afade=t=out:st=${fadeStart}:d=${options.fadeOut}:curve=${curve}`,
      );
    }

    return new Promise((resolve, reject) => {
      let cmd = ffmpeg(inputPath);
      // Sample-accurate: use -ss after -i for accuracy (slower but correct)
      cmd = cmd.outputOptions(['-ss', String(start)]);
      if (end != null) {
        cmd = cmd.outputOptions(['-to', String(end)]);
      }
      if (filters.length) {
        cmd = cmd.audioFilters(filters);
      }
      // Preserve as WAV intermediate for quality
      cmd = cmd.audioCodec('pcm_s24le').format('wav').output(outputPath);

      const timer = setTimeout(() => {
        try {
          (cmd as any).kill?.('SIGKILL');
        } catch {
          /* ignore */
        }
        reject(new BadRequestException('trim timed out'));
      }, this.timeoutMs);

      cmd
        .on('progress', (p) => {
          if (options.onProgress && p.percent != null) {
            options.onProgress(Math.min(99, p.percent));
          }
        })
        .on('error', (err, _o, stderr) => {
          clearTimeout(timer);
          reject(
            new BadRequestException(
              this.parseFfmpegError(stderr || err.message),
            ),
          );
        })
        .on('end', async () => {
          clearTimeout(timer);
          try {
            const out = await this.probe(outputPath);
            options.onProgress?.(100);
            resolve({
              outputPath,
              duration: out.duration,
              start,
              end: end ?? null,
            });
          } catch (e: any) {
            reject(e);
          }
        })
        .run();
    });
  }

  async extractCoverArt(
    inputPath: string,
    outputPath: string,
  ): Promise<CoverArtResult | null> {
    await this.probe(inputPath);
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    try {
      await this.runFfmpegRaw([
        '-hide_banner',
        '-i',
        inputPath,
        '-an',
        '-vcodec',
        'copy',
        '-y',
        outputPath,
      ]);
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        return { path: outputPath, mime: 'image/jpeg' };
      }
    } catch {
      /* no cover */
    }
    return null;
  }

  /** Create temp workspace under os.tmpdir() */
  createTempDir(prefix = 'audio-'): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }

  async runFfmpegRaw(
    args: string[],
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.ffmpegPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new BadRequestException('ffmpeg timed out'));
      }, this.timeoutMs);

      child.stdout.on('data', (c) => {
        stdout += c.toString();
      });
      child.stderr.on('data', (c) => {
        stderr += c.toString();
      });
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(new BadRequestException(e.message));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        // loudnorm measure exits 0; some analysis also 0
        if (code === 0 || code === null) {
          resolve({ stdout, stderr, code: code ?? 0 });
        } else {
          // still resolve for filters that write stats to stderr with non-zero? usually 0
          if (stderr.includes('input_i') || stderr.includes('silence_start')) {
            resolve({ stdout, stderr, code: code ?? 1 });
          } else {
            reject(
              new BadRequestException(
                this.parseFfmpegError(stderr || `exit ${code}`),
              ),
            );
          }
        }
      });
    });
  }

  extractJsonFromStderr(stderr: string): Record<string, string> | null {
    const start = stderr.lastIndexOf('{');
    const end = stderr.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(stderr.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  parseFfmpegError(stderr: string): string {
    const lines = stderr
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const errLine =
      lines.find((l) => /error|invalid|failed|could not/i.test(l)) ||
      lines[lines.length - 1] ||
      'ffmpeg error';
    return errLine.slice(0, 500);
  }

  /** Extension for output format */
  extensionFor(format: string): string {
    const map: Record<string, string> = {
      mp3: 'mp3',
      aac: 'aac',
      flac: 'flac',
      ogg: 'ogg',
      opus: 'opus',
      wav: 'wav',
      m4a: 'm4a',
    };
    return map[format] || 'bin';
  }
}
