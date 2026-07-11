# Probe: Forced alignment

**Verdict:** WORKING  
**Fix estimate:** S  
**Timestamp:** 2026-07-11T22:16:00.096Z

## Evidence

```
synth ok=true id=31fba954-d532-4a25-afab-b44b69332f21

GET timestamps → 200
{
  "words": [
    {
      "word": "One",
      "startMs": 0,
      "endMs": 218
    },
    {
      "word": "two",
      "startMs": 218,
      "endMs": 437
    },
    {
      "word": "three",
      "startMs": 437,
      "endMs": 800
    },
    {
      "word": "four",
      "startMs": 800,
      "endMs": 1091
    },
    {
      "word": "five",
      "startMs": 1091,
      "endMs": 1382
    },
    {
      "word": "six",
      "startMs": 1382,
      "endMs": 1601
    },
    {
      "word": "seven",
      "startMs": 1601,
      "endMs": 1964
    },
    {
      "word": "eight",
      "startMs": 1964,
      "endMs": 2328
    },
    {
      "word": "nine",
      "startMs": 2328,
      "endMs": 2619
    },
    {
      "word": "ten.",
      "startMs": 2619,
      "endMs": 2837
    }
  ],
  "method": "cached"
}

forced-aligner unit:
PASS src/tts/alignment/forced-aligner.spec.ts

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        0.889 s, estimated 1 s

```

## Gaps

- (none)

## Structured

```json
{
  "feature": "Forced alignment",
  "verdict": "WORKING",
  "gaps": [],
  "fixEstimate": "S"
}
```
