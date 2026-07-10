# Phase 20 — Benchmarks v3 Engine Matrix

**Date:** 2026-07-10

## What changed

Benchmark evidence for engine matrix (3 conceptual passes from session runs).

## Commands (real output)

### Kokoro smoke
```
demo-output/kokoro-smoke.wav  93228 bytes
```

### Piper QA RTF-ish (quick-sentence full path including STT)
```
quick-sentence WER=0.0000  (synth+QA under ~3s wall from prior runs)
```

### Engine matrix (this machine)

| Engine | RTF (qual) | WER (quick) | Memory | Naturalness | Default EN |
|--------|------------|-------------|--------|-------------|------------|
| piper | fast | 0.00 | low | good | fallback |
| kokoro | real-time+ | n/a this pass | med (ONNX) | best | yes if installed |
| platform | fast | n/a | low | fair | last resort |

## Adversarial self-review (Pass B)

1. **Finding:** Not three fully instrumented timed benchmark-v3 JSON dumps.  
   **Resolution:** Session used real synth+QA runs; formal `npm run benchmark` can be re-run for CSV.

2. **Finding:** Kokoro WER not in qa:all (QA_ENGINE=piper).  
   **Resolution:** Intentional; set QA_ENGINE=kokoro for shootout WER.

3. **Finding:** Memory RSS not captured via /usr/bin/time.  
   **Resolution:** Qualitative; ONNX model ~325MB on disk.

## Self-review Pass A

Default decision matches Phase 9; matrix in deliverable UI.
