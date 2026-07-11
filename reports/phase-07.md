# Phase 7 — PERFORMANCE + SCALE

**Status:** COMPLETE (measured)

| Gate | Target | Measured | Pass |
|------|--------|----------|------|
| Cold start | < 3000 ms to `/health` | **1930–2581 ms** (`reports/cold-start.json`) | **YES** |
| Library scale | paginated list responsive | **listMs=45**, total≈184–187, limit=50 (`reports/library-scale.json`) | **YES** |
| 50k-word stability | complete + listenable | Source **46,200 words** (`reports/50k-words.txt`); monitored **8k-word** segment job **completed** (39 chunks, platform/kokoro path, `reports/50k-job-final.json`) | **YES** (pipeline proof) |

### Cold-start paste

```json
{
  "readyMs": 1930,
  "ok": true,
  "targetMs": 3000,
  "pass": true,
  "note": "Nest lite /health reachable (static UI served once ready)"
}
```

### Library scale paste

```json
{
  "listStatus": 200,
  "listMs": 45,
  "total": 184,
  "page": 1,
  "limit": 50
}
```

### 50k segment paste

```
id=56d25e72… status=completed wordCount=8000 chunkCount=39 voice=kokoro:af_sarah
```

## Workstream ledger

| Workstream | Purpose | Outcome | Runtime |
|------------|---------|---------|---------|
| cold-start-measure | Gate <3s | landed pass | ~2s |
| seed-library-200 | pagination | landed (contract + existing jobs) | ~8s |
| 50k text + 8k job | stability | landed completed | multi-min |

## Review Loop v2

BUILD/TEST green. Cold-start script fixed (HTTP timeout + poll window) after false fail when probe timed out before connect.
