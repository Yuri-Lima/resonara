# Probe: CLI

**Verdict:** PARTIAL  
**Fix estimate:** S  
**Timestamp:** 2026-07-11T22:16:27.374Z

## Evidence

```
cli engines exit=0
{
  "engines": [
    {
      "id": "kokoro",
      "available": true,
      "detail": "kokoro-onnx",
      "voiceCount": 10,
      "primary": true,
      "languages": [
        "en",
        "pt-BR"
      ],
      "voiceCountByLanguage": {
        "en": 10,
        "pt-BR": 0
      }
    },
    {
      "id": "piper",
      "available": true,
      "detail": "ok",
      "voiceCount": 2,
      "primary": false,
      "languages": [
        "en",
        "pt-BR"
      ],
      "voiceCountByLanguage": {
        "en": 1,
        "pt-BR": 1
      }
    },
    {
      "id": "platform",
      "available": true,
      "detail": "ok",
      "voiceCount": 184,
      "primary": false,
      "languages": [
        "en",
        "pt-BR"
      ],
      "voiceCountByLanguage": {
        "en": 43,
        "pt-BR": 10
      }
    }
  ],
  "piper": {
    "binary": "/private/tmp/trace-swe23-20260712-000916/tools/piper-venv/bin/piper",
    "modelsDir": "/private/tmp/trace-swe23-20260712-000916/resources/piper/models"
  },
  "languages": [
    {
      "code": "en",
      "name": "English"
    },
    {
      "code": "pt-BR",
      "name": "Português (Brasil)"
    }
  ]
}


cli voices exit=0
{
  "voices": [
    {
      "id": "kokoro:af_sarah",
      "name": "af sarah",
      "engine": "kokoro",
      "language": "en-US",
      "quality": "neural",
      "gender": "female",
      "nativeId": "af_sarah"
    },
    {
      "id": "kokoro:af_bella",
      "name": "af bella",
      "engine": "kokoro",
      "language": "en-US",
      "quality": "neural",
      "gender": "female",
      "nativeId": "af_bella"
    },
    {
      "id": "kokoro:af_nicole",
      "name": "af nicole",
      "engine": "kokoro",
      "language": "en-US",
      "quality": "neural",
      "gender": "female",
      "nativeId": "af_nicole"
    },
    {
      "id": "kokoro:af_sky",
      "name": "af sky",
      "engine": "kokoro",
      "language": "en-US",
      "quality": "neural",
      "gender": "female",
      "nativeId": "af_sky"
    },
    {
      "id": "kokoro:am_adam",
      "name": "am adam",
      "engine": "kokoro",
      "language": "en-US",
      "quality": "neural",
      "gender": "male",
  

cli jobs exit=0
{
  "items": [
    {
      "id": "315b0632-0ca5-47d1-b7a4-3cf48ef4e90c",
      "status": "queued",
      "progress": 0,
      "wordCount": 31,
      "chunkCount": 0,
      "chunksDone": 0,
      "voice": "piper:pt_BR-faber-medium",
      "engine": "piper",
      "format": "wav",
      "outputPath": null,
      "error": null,
      "metadata": {
        "wordCount": 31,
        "title": "pt-br-formatter-only",
        "dialogue": false,
        "postProcess": {
          "normalize": true,
          "highpass": true,
          "compress": false,
          "preset": "podcast"
        },
        "language": "pt-BR"
      },
      "createdAt": "2026-07-11T22:16:19.000Z",
      "completedAt": null
    },
    {
      "id": "8b5e6b71-df16-4632-aef0-6d5a938424d0",
      "status": "completed",
      "progress": 100,
      "wordCount": 13,
      "chunkCount": 1,
      "chunksDone": 1,
      "voice": "kokoro:af_sarah",
      "engine": "kokoro",
      "format": "wav",
      "outputPath": "/Users/y

cli synth exit=0
{
  "jobId": "2f31d1c7-5967-49e6-9130-23c50c2055e1",
  "output": "/private/tmp/trace-swe23-20260712-000916/demo-output/cli/cli-sample.wav",
  "bytes": 295518,
  "qa": {
    "mode": "off",
    "aggregateWer": null,
    "chunks": [],
    "message": "No QA data for this job"
  }
}


cli engines on dead port exit=0
{
  "engines": [
    {
      "id": "kokoro",
      "available": true,
      "detail": "kokoro-onnx",
      "voiceCount": 10,
      "primary": true,
      "languages": [
        "en",
        "pt-BR"
      ],
      "voiceCountByLanguage": {
        "en": 10,
        "pt-BR": 0
      }
    },
    {
      "id": "piper",
      "available": true,
      "detail": "ok",
      "voiceCount": 2,
      "primary": false,
      "languages": [
        "en",
        "pt-BR"
      ],
      "voiceCountByLanguage
```

## Gaps

- CLI may auto-start server on dead port; error-handling for true server-down unclear

## Structured

```json
{
  "feature": "CLI",
  "verdict": "PARTIAL",
  "gaps": [
    "CLI may auto-start server on dead port; error-handling for true server-down unclear"
  ],
  "fixEstimate": "S"
}
```
