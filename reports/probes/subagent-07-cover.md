# Probe: Cover art

**Feature:** Cover art — generated, embedded, ffprobe-verified  
**Verdict:** PARTIAL  
**Fix estimate:** M  
**Timestamp:** 2026-07-11T22:15:47Z  
**Server:** http://127.0.0.1:3848 (lite mode)  
**Job ID:** `f10118cf-d85a-49a0-b016-6ce2959f4ef0`

## Summary

| Check | Result |
|-------|--------|
| Synthesize `format=mp3` | PASS (kokoro → completed, 115820 bytes) |
| `GET /tts/jobs/:id/cover` | PASS (200, `image/svg+xml`, 997 bytes) |
| Deterministic SVG generation | PASS (title + author in SVG; coverKey persisted) |
| Library `coverUrl` after ensureCover | PASS |
| Embed cover into MP3 (APIC / attached_pic) | **FAIL** |
| ffprobe attached picture stream | **FAIL** (`nb_streams=1`, `attached_pic=0`) |

**Verdict rationale:** Generation + HTTP cover endpoint work end-to-end. Roadmap success criterion (“ffprobe cover stream present”) is **not** met — there is no ffmpeg embed path for TTS exports.

## Evidence

### 1. POST /tts/synthesize (format=mp3)

```json
{
  "id": "f10118cf-d85a-49a0-b016-6ce2959f4ef0",
  "status": "queued",
  "engine": "kokoro",
  "format": "mp3",
  "voice": "kokoro:af_sarah",
  "metadata": {
    "title": "Cover Art Probe",
    "language": "en"
  }
}
```

Poll → `status=completed` progress=100; `outputPath=.../speech.mp3`.

### 2. GET /tts/jobs/:id/cover

```
HTTP/1.1 200 OK
Content-Type: image/svg+xml
size: 997 bytes
file: SVG Scalable Vector Graphics image
```

SVG head (title present):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1400" viewBox="0 0 1400 1400">
  ...
  <!-- title text: Cover Art Probe; brand: Resonara -->
```

After cover fetch, job metadata:

```
title: Cover Art Probe
coverKey: .../f10118cf-d85a-49a0-b016-6ce2959f4ef0/cover.svg
```

### 3. GET /tts/jobs/:id/download + file type

```
HTTP/1.1 200 OK
Content-Type: audio/mpeg
Content-Disposition: attachment; filename="resonara-speech.mp3"
size: 115820 bytes
file: Audio file with ID3 version 2.4.0, contains: MPEG ADTS, layer III, v1, 192 kbps, 48 kHz, Monaural
```

Binary scan: `APIC` absent, no PNG/JPEG payload inside MP3.

### 4. ffprobe (attached picture)

```json
{
  "streams": [
    {
      "index": 0,
      "codec_name": "mp3",
      "codec_type": "audio",
      "disposition": { "attached_pic": 0 }
    }
  ],
  "format": {
    "nb_streams": 1,
    "format_name": "mp3",
    "duration": "4.800000",
    "tags": { "encoder": "Lavf61.7.100" }
  }
}
```

`HAS_ATTACHED_PIC: False`

### 5. Library card

```json
{
  "id": "f10118cf-d85a-49a0-b016-6ce2959f4ef0",
  "title": "Cover Art Probe",
  "coverUrl": "/tts/jobs/f10118cf-d85a-49a0-b016-6ce2959f4ef0/cover"
}
```

(coverUrl only appears after `ensureCover` sets `metadata.coverKey` — lazy, not at synth time.)

## Code path notes (static)

- `src/tts/cover/cover-art.ts` — generates SVG only; comment says “PNG conversion optional via ffmpeg” but **not implemented** (`pngPath` never returned).
- `src/tts/library/library.service.ts` `ensureCover` — writes SVG + stores `coverKey`; no embed into audio.
- `src/tts/library/library.controller.ts` `GET tts/jobs/:id/cover` — streams SVG.
- `src/ffmpeg/ffmpeg.service.ts` has `extractCoverArt` (read from media) but **no embedCover** for TTS outputs.
- TTS completion path embeds **chapter metadata for m4b** only (`embedChapterMetadata`); no cover art map.

## Gaps

1. **No embedded cover in MP3/M4B** — roadmap Pillar E success (“ffprobe cover stream present”) unmet.
2. **No SVG→PNG/JPEG conversion** — podcast apps and ID3 APIC need raster; SVG-only cover endpoint may not render in all clients.
3. **Lazy cover only** — `coverKey` / library `coverUrl` not set at synthesize completion; first cover/list UX is incomplete until `GET .../cover` or feed path runs `ensureCover`.
4. **No title/artist ID3 tags** on MP3 beyond encoder string (related polish for “real audiobook” packaging).

## Fix estimate: M

Suggested fix (≈ medium):

1. After synth (or in `ensureCover`), rasterize SVG → PNG via ffmpeg (or pure raster fallback).
2. Add `FfmpegService.embedCoverArt(audioIn, imagePath, audioOut)` using `-map 0:a -map 1:v -c copy -disposition:v attached_pic` (and ID3 for mp3).
3. Call from TTS completion when `format` is `mp3` or `m4b`.
4. Optionally set `coverKey` during job completion so library cards always expose `coverUrl`.
5. Re-run this probe; require `streams` with `disposition.attached_pic=1` or video still image.

## Fixtures

- `reports/probes/fixtures/cover.svg`
- `reports/probes/fixtures/cover-probe.mp3`
- `reports/probes/fixtures/cover-ffprobe.json`
- `reports/probes/fixtures/cover-job-id.txt`

## Return object

```json
{
  "feature": "Cover art",
  "verdict": "PARTIAL",
  "gaps": [
    "Cover SVG generated and served; not embedded into MP3 (no APIC / attached_pic)",
    "ffprobe shows single audio stream only — roadmap success criterion unmet",
    "SVG→PNG conversion not implemented",
    "coverKey/coverUrl set lazily on GET /cover, not at synth completion"
  ],
  "fixEstimate": "M"
}
```
