# Probe: Whisper STT

**Verdict:** BROKEN  
**Fix estimate:** M  
**Timestamp:** 2026-07-11T22:15:41.502Z

## Evidence

```
GET /stt/health → 200
{
  "available": true,
  "python": "/private/tmp/trace-swe23-20260712-000916/tools/whisper-venv/bin/python",
  "script": "/private/tmp/trace-swe23-20260712-000916/tools/whisper/transcribe.py",
  "detail": "faster-whisper (tools/whisper-venv)"
}

fixture synth ok=true id=ed31b88d-c7b5-4786-a970-9f323d5783c8 engine=kokoro

fixture wav bytes=393324 path=/private/tmp/trace-swe23-20260712-000916/reports/probes/fixtures/whisper-input.wav

POST /stt/transcribe → 201
{
  "text": "The quick brown fox jumps over the lazy dog.",
  "segments": [
    {
      "text": "The quick brown fox jumps over the lazy dog.",
      "startMs": 0,
      "endMs": 2680,
      "words": [
        {
          "word": "The",
          "startMs": 0,
          "endMs": 160
        },
        {
          "word": "quick",
          "startMs": 160,
          "endMs": 380
        },
        {
          "word": "brown",
          "startMs": 380,
          "endMs": 740
        },
        {
          "word": "fox",
          "startMs": 740,
          "endMs": 1200
        },
        {
          "word": "jumps",
          "startMs": 1200,
          "endMs": 1620
        },
        {
          "word": "over",
          "startMs": 1620,
          "endMs": 1900
        },
        {
          "word": "the",
          "startMs": 1900,
          "endMs": 2000
        },
        {
          "word": "lazy",
          "startMs": 2000,
          "endMs": 2240
        },
        {
          "word": "dog.",
          "startMs": 2240,
          "endMs": 2680
        }
      ]
    }
  ],
  "language": "en",
  "durationMs": 2731,
  "model": "tiny",
  "elapsedMs": 767
}
```

## Gaps

- {"text":"The quick brown fox jumps over the lazy dog.","segments":[{"text":"The quick brown fox jumps over the lazy dog.","startMs":0,"endMs":2680,"words":[{"word":"The","startMs":0,"endMs":160},{"word":"quick","startMs":160,"endMs":380},{"word":"brown","startMs":380,"endMs":740},{"word":"fox","startMs":740,"endMs":1200},{"word":"jumps","startMs":1200,"endMs":1620},{"word":"over","startMs":1620,"endMs":1900},{"word":"the","startMs":1900,"endMs":2000},{"word":"lazy","startMs":2000,"endMs":2240},{

## Structured

```json
{
  "feature": "Whisper STT",
  "verdict": "BROKEN",
  "gaps": [
    "{\"text\":\"The quick brown fox jumps over the lazy dog.\",\"segments\":[{\"text\":\"The quick brown fox jumps over the lazy dog.\",\"startMs\":0,\"endMs\":2680,\"words\":[{\"word\":\"The\",\"startMs\":0,\"endMs\":160},{\"word\":\"quick\",\"startMs\":160,\"endMs\":380},{\"word\":\"brown\",\"startMs\":380,\"endMs\":740},{\"word\":\"fox\",\"startMs\":740,\"endMs\":1200},{\"word\":\"jumps\",\"startMs\":1200,\"endMs\":1620},{\"word\":\"over\",\"startMs\":1620,\"endMs\":1900},{\"word\":\"the\",\"startMs\":1900,\"endMs\":2000},{\"word\":\"lazy\",\"startMs\":2000,\"endMs\":2240},{"
  ],
  "fixEstimate": "M"
}
```
