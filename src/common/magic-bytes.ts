/**
 * Validate audio by magic bytes (not extension alone).
 */
export type DetectedAudioFormat =
  | 'mp3'
  | 'flac'
  | 'ogg'
  | 'opus'
  | 'wav'
  | 'aiff'
  | 'aac'
  | 'm4a'
  | 'webm'
  | 'unknown';

export function detectAudioFormat(buf: Buffer): DetectedAudioFormat {
  if (buf.length < 12) return 'unknown';

  // WebM / Matroska (MediaRecorder)
  if (
    buf[0] === 0x1a &&
    buf[1] === 0x45 &&
    buf[2] === 0xdf &&
    buf[3] === 0xa3
  ) {
    return 'webm';
  }

  // WAV: RIFF....WAVE
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x41 &&
    buf[10] === 0x56 &&
    buf[11] === 0x45
  ) {
    return 'wav';
  }

  // AIFF: FORM....AIFF / AIFC
  if (
    buf[0] === 0x46 &&
    buf[1] === 0x4f &&
    buf[2] === 0x52 &&
    buf[3] === 0x4d &&
    (buf.toString('ascii', 8, 12) === 'AIFF' ||
      buf.toString('ascii', 8, 12) === 'AIFC')
  ) {
    return 'aiff';
  }

  // FLAC
  if (buf.toString('ascii', 0, 4) === 'fLaC') return 'flac';

  // OGG (Vorbis or Opus — refined by later probe)
  if (buf.toString('ascii', 0, 4) === 'OggS') {
    const slice = buf.toString('ascii', 0, Math.min(buf.length, 64));
    if (slice.includes('OpusHead')) return 'opus';
    return 'ogg';
  }

  // ID3 tag MP3
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return 'mp3';

  // MPEG frame sync
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3';

  // MP4/M4A ftyp
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (['M4A ', 'M4B ', 'mp42', 'isom', 'iso2'].some((b) => brand.startsWith(b.trim()) || brand.includes(b.trim()))) {
      return 'm4a';
    }
    return 'aac';
  }

  // ADTS AAC
  if (buf[0] === 0xff && (buf[1] & 0xf0) === 0xf0) return 'aac';

  return 'unknown';
}

export function isAllowedAudio(buf: Buffer): boolean {
  return detectAudioFormat(buf) !== 'unknown';
}

export const FORMAT_MIME: Record<DetectedAudioFormat, string> = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  wav: 'audio/wav',
  aiff: 'audio/aiff',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  unknown: 'application/octet-stream',
};
