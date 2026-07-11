# Probe: pt-BR pipeline

**Verdict:** WORKING  
**Fix estimate:** S  
**Timestamp:** 2026-07-11T22:16:38.443Z

## Evidence

```
synth ok=true id=bc017e50-70fd-46ec-95dc-94c05603c2ca engine=piper voice=piper:pt_BR-faber-medium

download bytes=555822 voice=piper:pt_BR-faber-medium engine=piper

formatter unit:
PASS src/tts/language/pt-br.formatter.spec.ts

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        0.864 s, estimated 1 s


dialogue unit:
PASS src/tts/dialogue-parser.spec.ts

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
Snapshots:   0 total
Time:        0.881 s, estimated 1 s

```

## Gaps

- (none)

## Structured

```json
{
  "feature": "pt-BR pipeline",
  "verdict": "WORKING",
  "gaps": [],
  "fixEstimate": "S"
}
```
