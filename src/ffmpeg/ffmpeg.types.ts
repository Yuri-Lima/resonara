export interface ProbeResult {
  format: string;
  duration: number;
  bitRate: number | null;
  sampleRate: number | null;
  channels: number | null;
  bitDepth: number | null;
  codec: string | null;
  tags: Record<string, string>;
  hasCoverArt: boolean;
  raw: Record<string, unknown>;
}

export interface TranscodeOptions {
  format: 'mp3' | 'aac' | 'flac' | 'ogg' | 'opus' | 'wav';
  /** CBR kbps for mp3/aac/opus */
  bitrate?: number;
  /** VBR quality: MP3 0-9 (LAME -q:a), Vorbis -1..10, FLAC 0-8 */
  quality?: number;
  /** VBR mode for MP3 */
  vbr?: boolean;
  sampleRate?: number;
  bitDepth?: 16 | 24 | 32;
  channels?: number;
  onProgress?: (percent: number) => void;
}

export interface TranscodeResult {
  outputPath: string;
  format: string;
  duration: number;
  sampleRate: number | null;
  channels: number | null;
  bitRate: number | null;
}

export interface LoudnormMeasure {
  inputI: number;
  inputLra: number;
  inputTp: number;
  inputThresh: number;
  targetOffset: number;
  normalizationType?: string;
}

export interface NormalizeOptions {
  targetLufs: number;
  truePeak: number;
  lra: number;
  sampleRate?: number;
  onProgress?: (percent: number, pass: 1 | 2) => void;
}

export interface NormalizeResult {
  outputPath: string;
  measured: LoudnormMeasure;
  targetLufs: number;
  truePeak: number;
  lra: number;
  /** Post-normalization measurement if verify ran */
  outputI?: number;
  withinTolerance?: boolean;
}

export interface WaveformOptions {
  resolution?: number;
  channels?: 'mono' | 'stereo';
}

export interface WaveformResult {
  duration: number;
  sampleRate: number;
  channels: number;
  resolution: number;
  peaks: {
    left?: Array<[number, number]>;
    right?: Array<[number, number]>;
    mono: Array<[number, number]>;
  };
  rms: {
    left?: number[];
    right?: number[];
    mono: number[];
  };
}

export interface SilenceSegment {
  start: number;
  end: number;
  duration: number;
}

export interface SilenceOptions {
  /** Noise floor e.g. -50 (dB) or linear 0.001 */
  thresholdDb?: number;
  minDuration?: number;
}

export interface TrimOptions {
  start: number;
  end?: number;
  fadeIn?: number;
  fadeOut?: number;
  fadeCurve?: 'linear' | 'exponential' | 'logarithmic' | 'quarter-sine';
  onProgress?: (percent: number) => void;
}

export interface TrimResult {
  outputPath: string;
  duration: number;
  start: number;
  end: number | null;
}

export interface CoverArtResult {
  path: string;
  mime: string;
}
