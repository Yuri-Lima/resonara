# Probe: Watch folder daemon

**Feature:** Watch folder  
**Verdict:** WORKING  
**Fix estimate:** S  
**Timestamp:** 2026-07-11T22:15:44.000Z  
**Subagent:** 11  
**Server:** http://127.0.0.1:3848 (`RESONARA_PORT=3848`)

## Procedure

1. Create temp watch dir + out dir (`mktemp`)
2. Start: `RESONARA_PORT=3848 node scripts/resonara-cli.js watch <dir> --out <outdir> --engine auto`
3. Drop `probe-drop.txt` into watch dir
4. Wait for sidecar markers / WAV
5. `kill <pid>`; verify process gone (orphan check)

## Evidence

### 1. Temp dirs + daemon start

```
WATCH_DIR=/tmp/resonara-watch-E0CmW4
OUT_DIR=/tmp/resonara-watch-out-cs0EBs
DAEMON_PID=77713
DAEMON_ALIVE=yes
```

### 2. Drop file

```
DROPPED=/tmp/resonara-watch-E0CmW4/probe-drop.txt
# content: "Hello watch folder. This is a short probe sentence for Resonara."
```

### 3. Pickup + markers + audio (FOUND=done after 17s)

Daemon log:

```
[watch] watching /tmp/resonara-watch-E0CmW4 → /tmp/resonara-watch-out-cs0EBs
[watch] synthesizing /tmp/resonara-watch-E0CmW4/probe-drop.txt
[watch] done /tmp/resonara-watch-out-cs0EBs/probe-drop.wav
```

Watch dir after settle:

```
probe-drop.txt
probe-drop.txt.done
```

`.done` marker:

```
job=5cd57828-1dd2-4a18-aeb7-d424a599a60b
out=/tmp/resonara-watch-out-cs0EBs/probe-drop.wav
```

Output WAV:

```
-rw-r--r--  599604 bytes  probe-drop.wav
RIFF (little-endian) data, WAVE audio, mono 48000 Hz
magic: 52 49 46 46 … 57 41 56 45  ("RIFF" … "WAVE")
```

No `.failed` marker written.

### 4. TERMINATE daemon + orphan check

```
Killing DAEMON_PID=77713
ORPHAN=no process gone
ps: no such process 77713
```

- SIGTERM sufficient; no SIGKILL needed.
- `kill -0 77713` false after kill.
- Watch daemon process terminated cleanly (no orphan of PID 77713).
- Server on :3848 left running (shared probe server; not spawned by this watch process).

## Gaps

1. **No PID file / stop subcommand** — operators must track the shell PID and `kill` manually; no `watch --pidfile` or `resonara watch stop`.
2. **`seen` Set never forgets** (phase-18 known) — re-dropping same basename/path after delete of `.done` does not re-queue without daemon restart.
3. **`ensureServer` detaches lite server without PID bookkeeping** — if no server is up, CLI may leave a detached server process; not exercised here because :3848 was already healthy.
4. **Settle is fixed 800ms** — very large slow writers could be read mid-write (not hit with small .txt).

None of the above blocked the happy path: drop → synthesize → `.done` + WAV → kill clean.

## Structured

```json
{
  "feature": "Watch folder",
  "verdict": "WORKING",
  "gaps": [
    "No PID file or stop subcommand for watch daemon lifecycle",
    "seen Set never forgets — same path will not re-queue without restart",
    "ensureServer can detach lite server without pid tracking (not exercised with pre-running :3848)",
    "Fixed 800ms settle delay may race large slow writers"
  ],
  "fixEstimate": "S"
}
```
