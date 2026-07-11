# Probe: CLI (synth / voices / engines / jobs)

**Feature:** `scripts/resonara-cli.js` against live lite server  
**Server:** `http://127.0.0.1:3848` (`RESONARA_PORT=3848`)  
**Verdict:** WORKING  
**Fix estimate:** S (minor polish only)  
**Timestamp:** 2026-07-12T00:15:00Z

## Summary

All four primary CLI subcommands work against the live lite server with correct exit codes:

| Command | Exit | Result |
|---------|------|--------|
| `engines` | **0** | 3 engines (kokoro primary, piper, platform) + languages |
| `voices` | **0** | 196 voices (kokoro 10 / piper 2 / platform 184) |
| `jobs` | **0** | paginated job list (`total: 174+`, page 1 limit 20) |
| `synth … --engine auto --language en --qa off` | **0** | job completed, valid WAV written |
| unknown command | **2** | usage printed |
| `synth` without file | **2** | usage printed |
| `synth` missing path | **1** | ENOENT via main catch |
| no args / `--help` | **0** | usage printed |

## Commands run

```bash
export RESONARA_PORT=3848
node scripts/resonara-cli.js engines
node scripts/resonara-cli.js voices
node scripts/resonara-cli.js jobs
node scripts/resonara-cli.js synth samples/texts/quick-sentence.txt \
  --engine auto --language en --qa off
```

## Evidence

### 1. `engines` → exit 0

Returns JSON with engines, piper paths, and languages:

- **kokoro** — `available: true`, `primary: true`, `voiceCount: 10`, detail `kokoro-onnx`
- **piper** — `available: true`, `voiceCount: 2`, detail `ok`
- **platform** — `available: true`, `voiceCount: 184`, detail `ok`
- Languages: `en`, `pt-BR`

### 2. `voices` → exit 0

- Full list: **196** voices
- By engine: kokoro=10, piper=2, platform=184
- `--language en` filter works (returns en-* voices, exit 0)

### 3. `jobs` → exit 0

- Shape: `{ jobs: [...], total, page, limit }`
- Default page: 20 items, total ≥ 174
- `--status completed` filter works (all returned items status=`completed`, total 167)

### 4. `synth` → exit 0

```
Job 0054c7b1-a97e-4924-b06a-1202efd958d3 ..........
{
  "jobId": "0054c7b1-a97e-4924-b06a-1202efd958d3",
  "output": ".../demo-output/cli/quick-sentence.wav",
  "bytes": 798828,
  "qa": {
    "mode": "off",
    "aggregateWer": null,
    "chunks": [],
    "message": "No QA data for this job"
  }
}
```

WAV verification:

```
demo-output/cli/quick-sentence.wav: RIFF (little-endian) data, WAVE audio, mono 48000 Hz
size: 798828 bytes
magic: RIFF....WAVE
```

`--qa off` honored (QA payload reports `mode: "off"` / no QA data).

### 5. Exit codes matrix

| Scenario | Expected | Actual | Notes |
|----------|----------|--------|-------|
| Success path (engines/voices/jobs/synth) | 0 | **0** | OK |
| Unknown command | 2 | **2** | usage to stdout |
| `synth` missing `<file>` arg | 2 | **2** | usage |
| Missing filesystem path | 1 | **1** | uncaught ENOENT → `main().catch` |
| No args / help | 0 | **0** | usage (help is success) |
| Server unreachable after spawn fail | 1 | (not re-probed; code path exists) | `ensureServer` |

## Gaps (non-blocking)

1. **Missing-file error UX** — `synth` on a nonexistent path throws raw Node `ENOENT` stack instead of a one-line CLI error + exit 2. Still exits non-zero (1).
2. **No HTTP status checks on list commands** — `voices` / `engines` / `jobs` print body even if status ≥ 400 (would still exit 0). Not hit against live healthy server.
3. **Download content-type** — synth writes `dl.raw` without asserting WAV; worked here (valid WAVE).
4. **`watch` not in this probe scope** — present in CLI but not required for this task.

## Fix estimate

**S** — optional: wrap `fs.readFileSync` in `cmdSynth` with friendly message; check `r.status` on list endpoints before printing. Core feature truth: **WORKING**.

## Verdict

**WORKING** — CLI `engines`, `voices`, `jobs`, and `synth` all succeed against lite `:3848` with correct exit codes (0 success, 2 usage/bad args, 1 runtime failure).
