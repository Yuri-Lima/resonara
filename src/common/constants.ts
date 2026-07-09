export const QUEUE_TRANSCODE = 'audio-transcode';
export const QUEUE_NORMALIZE = 'audio-normalize';
export const QUEUE_WAVEFORM = 'audio-waveform';
export const QUEUE_METADATA = 'audio-metadata';
export const QUEUE_SILENCE = 'audio-silence';
export const QUEUE_TRIM = 'audio-trim';

export const ALL_QUEUES = [
  QUEUE_TRANSCODE,
  QUEUE_NORMALIZE,
  QUEUE_WAVEFORM,
  QUEUE_METADATA,
  QUEUE_SILENCE,
  QUEUE_TRIM,
] as const;

export type OutputFormat = 'mp3' | 'aac' | 'flac' | 'ogg' | 'opus' | 'wav';

export const MP3_CBR_BITRATES = [128, 192, 256, 320] as const;
export const AAC_BITRATES = [128, 192, 256] as const;
export const OPUS_BITRATES = [64, 96, 128, 160, 192, 256] as const;
export const WAV_SAMPLE_RATES = [44100, 48000, 96000] as const;
export const WAV_BIT_DEPTHS = [16, 24, 32] as const;

export const LUFS_PROFILES = {
  spotify: { targetLufs: -14, truePeak: -1, lra: 11 },
  podcast: { targetLufs: -16, truePeak: -1.5, lra: 11 },
  ebu: { targetLufs: -23, truePeak: -1, lra: 7 },
} as const;
