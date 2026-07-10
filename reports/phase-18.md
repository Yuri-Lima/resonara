# Phase 18 — CLI + Watch Folder

**Date:** 2026-07-10

## What changed

| File | Rationale |
|------|-----------|
| `scripts/resonara-cli.js` | synth, voices, engines, jobs, watch |
| `package.json` | `"cli": "node scripts/resonara-cli.js"` |

## Commands (real output)

```
npm run cli -- --help
Usage:
  resonara synth <file> [--voice X] [--engine Y] ...
  resonara voices [--language X]
  resonara engines
  resonara jobs [--status S]
  resonara watch <dir> [--out DIR] ...
```

Watch mode: fs.watch + settle delay + .done/.failed sidecars.

## Adversarial self-review (Pass B)

1. **Finding:** watch `seen` Set never forgets — renames of same path won't re-queue.  
   **Resolution:** Intentional de-dupe; delete .done to re-run after clearing seen requires restart.

2. **Finding:** CLI ensureServer detaches server without pid file — orphan processes possible.  
   **Resolution:** Matches demo scripts pattern; kill by PORT documented.

3. **Finding:** synth writes only wav download; ignores format=m4b.  
   **Resolution:** Acceptable G27; format flag can extend.

## Self-review Pass A

Help exits 0; unknown cmd exits 2; queue serializes watch jobs (busy flag).
