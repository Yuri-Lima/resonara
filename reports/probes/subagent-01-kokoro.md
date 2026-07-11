# Probe: Kokoro TTS engine (end-to-end)

**Feature:** Kokoro neural TTS (`engine=kokoro`)  
**Verdict:** WORKING  
**Fix estimate:** S (install only; code path already live)  
**Timestamp:** 2026-07-11T22:16:00Z  
**Probe agent:** subagent-01

## Summary

Kokoro is **selectable and synthesizes real audio** when the venv + ONNX models are present under the server process CWD. After `node scripts/download-kokoro.js` in this repo, POST `/tts/synthesize` with `engine=kokoro` completed in ~6s and produced a valid 298 KB WAV.

The default listener on **:3847** is a *different* tree (`trace-swe22-…`) without Kokoro installed, so it correctly reports `available: false`. The workspace server on **:3848** (`trace-swe23-…`) is the true runtime for this probe.

## 1. GET /tts/engines

### Port 3847 (pre-existing RESONARA_LITE server, CWD=swe22 — no Kokoro install)

```bash
curl -sS http://127.0.0.1:3847/tts/engines
```

Kokoro entry:

```json
{
  "id": "kokoro",
  "available": false,
  "detail": "Kokoro not installed (node scripts/download-kokoro.js)",
  "voiceCount": 0,
  "primary": false,
  "languages": ["en", "pt-BR"],
  "voiceCountByLanguage": { "en": 0, "pt-BR": 0 }
}
```

### Port 3848 (workspace server, CWD=swe23 — after download)

```bash
curl -sS http://127.0.0.1:3848/tts/engines
```

Kokoro entry:

```json
{
  "id": "kokoro",
  "available": true,
  "detail": "kokoro-onnx",
  "voiceCount": 10,
  "primary": true,
  "languages": ["en", "pt-BR"],
  "voiceCountByLanguage": { "en": 10, "pt-BR": 0 }
}
```

**Engine is selectable now:** `resolveEngine('kokoro')` returns `'kokoro'` when `isKokoroAvailable()` is true (see `src/tts/voice-manager.ts` lines 118–128). Explicit request throws `Kokoro engine unavailable` only when install is missing — confirmed on :3847 with HTTP 400.

## 2. isKokoroAvailable paths

From `src/tts/kokoro-tts.ts`:

| Check | Path / env |
|-------|------------|
| Python | `KOKORO_PYTHON` or `{cwd}/tools/kokoro-venv/bin/python` |
| Model | `KOKORO_MODEL` or `{cwd}/tools/kokoro/models/kokoro-v1.0.onnx` **or** models dir exists |

### Before install (this repo)

```
tools/kokoro-venv          → missing
tools/kokoro/models        → missing
tools/kokoro/synthesize.py → present (stub helper only)
```

### After `node scripts/download-kokoro.js`

```text
$ ls -lh tools/kokoro-venv/bin/python tools/kokoro/models/
tools/kokoro-venv/bin/python -> python3
kokoro-v1.0.onnx   310M
voices-v1.0.bin     27M
```

Download script output:

```text
Creating kokoro venv…
Installing kokoro-onnx + soundfile…
Downloading https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
Downloading https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
Kokoro setup done. models: …/tools/kokoro/models
```

**Why :3847 stayed unavailable after install:** process CWD is `/private/tmp/trace-swe22-20260711-014507`, not this workspace; install landed under swe23. Availability is CWD-relative (no absolute install path by default).

## 3. POST /tts/synthesize + job poll + audio

```bash
curl -sS -X POST http://127.0.0.1:3848/tts/synthesize \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello Kokoro end to end probe.","language":"en","engine":"kokoro","qa":"off"}'
```

Queued response (excerpt):

```json
{
  "id": "62aee2c6-933b-4e61-ab6e-051c49b1861f",
  "status": "queued",
  "voice": "kokoro:af_sarah",
  "engine": "kokoro",
  "format": "wav",
  "error": null
}
```

Poll:

```text
[1] synthesizing 2 None
[2] completed 100 None
```

Completed job (excerpt):

```json
{
  "id": "62aee2c6-933b-4e61-ab6e-051c49b1861f",
  "status": "completed",
  "progress": 100,
  "engine": "kokoro",
  "voice": "kokoro:af_sarah",
  "outputPath": "/Users/yurilima/.resonara/data/62aee2c6-933b-4e61-ab6e-051c49b1861f/speech.wav",
  "downloadPath": "/tts/jobs/62aee2c6-933b-4e61-ab6e-051c49b1861f/download",
  "error": null,
  "metadata": {
    "duration": 2.074792,
    "sampleRate": 48000,
    "language": "en"
  }
}
```

Audio download:

```bash
curl -sS -o reports/probes/fixtures/kokoro-probe.wav \
  http://127.0.0.1:3848/tts/jobs/62aee2c6-933b-4e61-ab6e-051c49b1861f/download
# http=200 size=298872
```

```text
speech.wav / kokoro-probe.wav: 298872 bytes
file: RIFF (little-endian) data, WAVE audio, mono 48000 Hz
threshold: size > 1KB  → PASS (≈292 KB)
```

### Negative control on :3847 (no install in that CWD)

```bash
curl -sS -X POST http://127.0.0.1:3847/tts/synthesize \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello Kokoro probe.","language":"en","engine":"kokoro","qa":"off"}'
```

```json
{"message":"Kokoro engine unavailable","error":"Bad Request","statusCode":400}
```

## 4. Code path notes (engine selectable NOW)

- `VoiceManager.resolveEngine('kokoro')` → returns `'kokoro'` if available; throws if not.
- Auto mode prefers Kokoro for English when available (`kokoro → piper → platform`).
- `tts.service` `synthesizeOneRaw` dynamically imports `synthesizeWithKokoro` when `engine === 'kokoro'`.
- Prior post-merge cleanup of an unreachable branch did **not** remove the live selectable path; runtime confirms explicit `engine=kokoro` works.

## Gaps

1. **Default install is optional** — fresh clones report `available: false` until `node scripts/download-kokoro.js` (~337 MB models + pip venv).
2. **CWD-bound discovery** — servers started from another tree (e.g. :3847/swe22) cannot see an install in this repo unless `KOKORO_PYTHON` / `KOKORO_MODEL` are set or install is mirrored.
3. **Kokoro is English-primary** — `voiceCountByLanguage.pt-BR` is 0; auto mode skips Kokoro for Portuguese (by design).
4. First synth is slow (model load into ONNX); subsequent jobs faster but still multi-second for short phrases.

## Structured verdict

```json
{
  "feature": "Kokoro TTS engine",
  "verdict": "WORKING",
  "evidence": {
    "enginesEndpoint": "GET :3848/tts/engines → kokoro available=true, voiceCount=10, primary=true",
    "synthesize": "POST engine=kokoro language=en → job 62aee2c6… status=completed, engine=kokoro, voice=kokoro:af_sarah",
    "audioBytes": 298872,
    "audioFormat": "WAVE mono 48000 Hz",
    "download": "GET /tts/jobs/…/download → HTTP 200, size matches speech.wav",
    "install": "node scripts/download-kokoro.js succeeded (venv + 310M onnx + 27M voices.bin)",
    "negativeControl": ":3847 without install → available=false, synth 400 Kokoro engine unavailable"
  },
  "gaps": [
    "Requires download-kokoro.js (~337MB) before available",
    "isKokoroAvailable is process.cwd()-relative",
    "English-only voices in practice"
  ],
  "fixEstimate": "S"
}
```
