# MASTER_TODO — G28 Forensic Audit

**Baseline tag:** `pre-g28` (local)  
**Source:** reports/findings.md + merge-archaeology.md  
**Minimum:** 25 evidence-grounded findings  
**Status legend:** `[ ]` open · `[x]` fixed (commit hash) · `[~]` deferred (rationale)

## Fix order
P0 → leaks → duplication → async/errors → security remainder → performance → types/API/tests → P3

| id | sev | category | file:line | evidence-ref | fix plan | effort | status |
|----|-----|----------|-----------|--------------|----------|--------|--------|
| TODO-01 | P0 | security | storage.service.ts:77; storage.controller.ts:17 | findings S1; path.join probe escapes to /etc/passwd | resolve+root containment; reject `..`; unit probe | M | [x] fixed (fca1aa9)|
| TODO-02 | P0 | security | platform-tts.ts:68-104 | findings S2 | EncodedCommand or env-based script; allowlist voices; unit attack test | M | [x] fixed (4414c8f)|
| TODO-03 | P0 | leak | platform-tts.ts:293-305 | findings L1/AS5 | timeout+SIGKILL+settled gate like whisper | S | [x] fixed (a0873d1)|
| TODO-04 | P0 | async | main.ts (no hooks) | findings AS1 | enableShutdownHooks; SIGTERM; child registry | M | [x] fixed (59dd8e8) |
| TODO-05 | P1 | leak | piper-tts.ts:373; kokoro-tts.ts:126 | findings L4 | single-settle finish() on timeout+close | S | [x] fixed (02fec75) |
| TODO-06 | P1 | leak | tts.service.ts:1958 runFf | findings L3 | timeout+kill or FfmpegService | S | [x] fixed (c325255) |
| TODO-07 | P1 | leak | library.controller.ts:115 | findings L2 | timeout ffmpeg; cleanup speed WAV | M | [~] deferred — L effort; library speed endpoint low traffic — timeout shared when process-runner lands |
| TODO-08 | P1 | security | tracks.controller.ts:52; piano | findings S3 | UUID filename; never originalname in path | S | [x] fixed (e1478b8) |
| TODO-09 | P1 | security | model-manager.ts:248 | findings S4 | allowlist modelKey; path containment | S | [x] fixed (f2f0787) |
| TODO-10 | P1 | security | stt.controller.ts; tts import | findings S6 | multer limits; magic for docs | M | [x] fixed (a539424) |
| TODO-11 | P1 | security | main.ts ValidationPipe; SynthesizeDto | findings S8 | forbidNonWhitelisted; MaxLength; rate bounds | S | [x] fixed (59dd8e8) |
| TODO-12 | P1 | async | tts.service.ts:267 deleteJob | findings AS2 | reject/cancel in-flight delete | S | [x] fixed (c325255) |
| TODO-13 | P1 | perf | voice-manager.ts:56 | findings PERF-1 | TTL cache voices/engines | M | [x] fixed (3b3d9ed) |
| TODO-14 | P1 | perf | library.service.ts:17 | findings PERF-2 | DB pagination + select | M | [~] deferred — L effort DB pagination; library still small on desktop |
| TODO-15 | P1 | test | language/en.formatter.ts; mixed-language-synthesizer | findings T6/B-01 | assertion specs | M | [x] fixed (ff31560) |
| TODO-16 | P1 | test | kokoro-tts.ts; library.controller | findings T3/T4 | mock-spawn specs | M | [x] fixed (ff31560) |
| TODO-17 | P1 | dup | piper/platform/kokoro/whisper spawn | findings D1 | process-runner.ts | L | [~] deferred — L effort process-runner extraction deferred; settled gates shipped on adapters |
| TODO-18 | P1 | dup | resolve-ffmpeg ↔ piper binary resolve | findings D2 | binary-resolve.ts | M | [~] deferred — M effort binary-resolve extract deferred; behavior unchanged |
| TODO-19 | P1 | dup | tts.service trim×4 crossfade×3 | findings D3 | assembly/chunk-audio helper | L | [~] deferred — L effort assembly extract deferred; call sites still correct |
| TODO-20 | P1 | architecture | tts.service.ts 1990 LOC; ffmpeg 1431 | findings A2 | behavior-preserving extract facades | L | [~] deferred — L god-file split deferred; facades would be multi-PR |
| TODO-21 | P1 | architecture | config upload.maxMb unread | findings A9 | wire multer limit from config | S | [~] deferred — upload.maxMb wire deferred; multer limits hardcoded safe defaults |
| TODO-22 | P2 | leak | model-manager downloads Map | findings L6 | TTL eviction; stream destroy on error | S | [x] fixed (f2f0787) |
| TODO-23 | P2 | leak | tts failed workDir | findings L5 | rm workDir on FAILED | S | [x] fixed (3b3d9ed) |
| TODO-24 | P2 | dup | en vs pt-br formatter scaffold | findings D4 | number-words core | M | [~] deferred — formatter core extract deferred; locales stable |
| TODO-25 | P2 | dup | scripts boot-and-poll ×6 | findings D7 | scripts/lib/resonara-client.js | M | [~] deferred — scripts client extract deferred; demos green |
| TODO-26 | P2 | dead | synthesizePiperStream; getVoiceManager; downloadToTemp; /tts/engine | findings A3/A4/A7/A8 | delete after ref-verify | S | [x] fixed (ff31560) |
| TODO-27 | P2 | perf | per-chunk DB save | findings PERF-4 | throttle progress saves | M | [~] deferred — perf throttle chunk saves deferred; not user-blocking on desktop |
| TODO-28 | P2 | security | model download no checksum; open redirects | findings S7 | pin host + size check | M | [~] deferred — checksum pin needs registry product decision |
| TODO-29 | P2 | types | incomplete strict; dual error shapes | findings T1/T2 | incremental strict; AppErrorFilter later | M | [~] deferred — full strict mode multi-PR; any census already zero |
| TODO-30 | P2 | baseline | coverage 77.38% < 80% | findings B-01 | specs TODO-15/16 raise coverage | M | [~] deferred — coverage improved via new specs; full 80% needs more marathon |
| TODO-31 | P3 | polish | eslint unused vars ×8 | findings B-03 | remove unused imports | S | [x] fixed (3b3d9ed) |
| TODO-32 | P3 | docs | root planning docs ×8 stale | merge-archaeology | git mv docs/history/ | S | [x] fixed (3b3d9ed) |
| TODO-33 | P2 | async | worker SIGTERM; bootstrap catch | findings AS8 | SIGTERM + bootstrap().catch | S | [~] deferred — worker SIGTERM partial via enableShutdownHooks on main; worker path low use in lite |
| TODO-34 | P1 | security | CORS * + no auth (desktop) | findings S5 | bind 127.0.0.1 default in lite/desktop | S | [x] fixed (59dd8e8) |

## NON-FINDINGS (checked clean)

| Check | Probe | Result |
|-------|-------|--------|
| shell:true on piper/ffmpeg/mac say | rg shell:true src/ | No shell:true on those spawn paths |
| Model download SSRF via user URL | model-manager download(key) | Registry-pinned keys only |
| `: any` / `as any` / @ts-ignore | rg census | 0 real matches in src/ |
| TODO/FIXME/HACK in src | rg | None |
| Nest module circular imports | manual graph | No forwardRef cycles (soft jobs↔queue only) |
| EPUB zip-slip write | document-extractor | In-memory getData only |
| demo:all | npm run demo:all | 10/10 green |
| unit tests | npm test | 226 pass / 1 skip |
| build | npm run build | clean |

## Branch advisory (stale origin features)
All feat/* branches for PRs #2–#9 are fully merged into main; safe to delete after owner ack — **no remote action this audit**.

## Counts
- Total rows: 34 (≥25)
- Open / Fixed / Deferred: updated during marathon
