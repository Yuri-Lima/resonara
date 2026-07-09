# Hybrid Piano Architecture

Extends the [Audio Processing Service](./AUDIO_ARCHITECTURE.md) with a **sample-based piano** and **post-take analysis**.

## Latency split

| Concern | Runtime | Tech |
|---------|---------|------|
| Note on/off, polyphony, sustain | Browser | Web Audio + MinIO samples |
| Live peak / RMS / spectrum | Browser | `AnalyserNode` (not integrated LUFS) |
| Waveform, silence, EBU R128, export | Server | Existing `FfmpegService` + BullMQ |

## Sample packs

- Bucket: `piano-samples`
- Layout: `{packId}/manifest.json`, `{packId}/notes/{Note}.mp3`
- Seed: `scripts/seed-piano-pack.sh` → `samples/upright-basic` (C2–C6, 49 keys, synthetic CC0)
- API auto-registers local seed on boot if DB empty

## API

| Method | Path | Role |
|--------|------|------|
| GET | `/piano/packs` | List packs |
| GET | `/piano/packs/:id` | Manifest |
| GET | `/piano/packs/:id/samples/:note` | Presigned sample URL |
| POST | `/piano/takes` | Upload recording → analyze |
| GET | `/piano/takes/:id/analysis` | Waveform + silence + measured LUFS |
| POST | `/piano/takes/:id/export` | Trim + two-pass normalize enqueue |

## Take analysis bundle

On upload:

1. Convert WebM → WAV if needed (MediaRecorder)
2. `extractWaveform` (1800 stereo)
3. `detectSilence` (−45 dB, 0.25 s) for phrasing
4. `measureLoudness` (loudnorm pass 1 only)

Export runs full **two-pass** normalize via existing queue.

## UI

- Served at `/ui/piano/` (same origin as API)
- Dashboard remains at `/ui/`
- Open: `make piano`

## Out of scope (v1)

- Real-time pitch→MIDI transcription
- Runtime SFZ parsing (use offline import later)
- Full 88-key commercial libraries (swap seed pack)
