# Probe: Kokoro engine

**Verdict:** WORKING  
**Fix estimate:** S  
**Timestamp:** 2026-07-11T22:15:30.127Z

## Evidence

```
GET /tts/engines → 200
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

kokoro status object: {"id":"kokoro","available":true,"detail":"kokoro-onnx","voiceCount":10,"primary":true,"languages":["en","pt-BR"],"voiceCountByLanguage":{"en":10,"pt-BR":0}}

synth engine=kokoro → ok=true status=completed err=null

download status=200 bytes=486372

wrote /private/tmp/trace-swe23-20260712-000916/reports/probes/fixtures/kokoro-probe.wav
```

## Gaps

- (none)

## Structured

```json
{
  "feature": "Kokoro engine",
  "verdict": "WORKING",
  "gaps": [],
  "fixEstimate": "S"
}
```
