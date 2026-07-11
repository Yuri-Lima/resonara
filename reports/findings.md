# G28 Forensic Findings (Phases 3–9)

Consolidated from parallel audit fleet + orchestrator spot-verification.
Evidence refs point to file:line and session command output.

## Pass 1 — Architecture + Dead Code

| ID | Sev | Summary | Evidence |
|----|-----|---------|----------|
| A1 | P1 | Soft cycle jobs↔queue; JobRunnerService owned by QueueModule | queue.module.ts:18,54 |
| A2 | P1 | TtsService god-object 1990 LOC; VoiceManager/ModelManager manual `new` | tts.service.ts:150-178 |
| A3 | P2 | Dead export `synthesizePiperStream` | piper-tts.ts:432; grep callers=0 |
| A4 | P2 | Dead export `getVoiceManager` | voice-manager.ts:352-357 |
| A5 | P2 | Dead mixed-lang helpers + KOKORO_MAX_CHARS unused (chunker hardcodes 400) | mixed-language-synthesizer.ts:136; kokoro-tts.ts:92 |
| A6 | P2 | Dead bitrate constants / ALL_QUEUES re-export | common/constants.ts:17-23 |
| A7 | P2 | Dead `TracksService.downloadToTemp` | tracks.service.ts:394 |
| A8 | P3 | Dead alias GET /tts/engine | tts.controller.ts:184-192 |
| A9 | P1 | Config unread: upload.maxMb never wired; dual public URL; .env.example gaps | configuration.ts:42; tracks.controller.ts:55 |
| A10 | P3 | Unused forwardRef import | queue.module.ts:2 |

## Pass 2 — Duplication

| ID | Sev | Summary | Evidence |
|----|-----|---------|----------|
| D1 | P1 | Engine spawn wrappers duplicated (piper/kokoro/whisper/platform) | jscpd + structural |
| D2 | P1 | binary resolve copy resolve-ffmpeg ↔ piper-tts | resolve-ffmpeg.ts:28-65; piper-tts.ts:60-94 |
| D3 | P1 | trim×4 / crossfade×3 call-site drift in tts.service | tts.service.ts:734,1108,1371,1410 / 748,1155,1524 |
| D4 | P2 | en.formatter vs pt-br.formatter scaffold | 128 vs 385 LOC parallel structure |
| D5 | P2 | sentenceEndPatterns in configs never consumed | en.config.ts:30 |
| D6 | P2 | Controller DTO→options mapping repeated | tts.controller.ts:218-245,412-427 |
| D7 | P1 | Scripts boot-and-poll ×6+ | demo/qa/cli/smoke/benchmark/probe |
| D8 | P2 | ffmpeg fluent lifecycle + MP3 argv clones | ffmpeg.service.ts multi sites |
| jscpd | — | src: 50 clones, 421 lines (2.31%); scripts+ui: 56 clones, 467 lines (5.35%) | session jscpd run |

## Pass 3 — Leaks (static + dynamic)

| ID | Sev | Summary | Evidence |
|----|-----|---------|----------|
| L1 | P0 | platform-tts runCommand no timeout/kill | platform-tts.ts:293-305 |
| L2 | P1 | library download-speed ffmpeg no timeout; derivative WAV kept | library.controller.ts:115-134 |
| L3 | P1 | tts.service runFf no timeout | tts.service.ts:1958-1970 |
| L4 | P1 | Piper/Kokoro/ffmpeg double-reject after timeout kill (no settled gate) | piper-tts.ts:373-393 |
| L5 | P2 | Failed jobs leave workDir trees | tts.service.ts:1043-1055 |
| L6 | P2 | model-manager downloads Map never evicts; write-stream error path weak | model-manager.ts:133,288 |
| L7 | P2 | ffprobe timeout does not kill child | ffmpeg.service.ts:86-92 |
| L8 | P2 | Socket.IO subscribe without unsubscribe | jobs.gateway.ts:25-31 |
| L9 | P2 | watch-folder unbounded seen Set | resonara-cli.js:236 |
| L10 | P3 | UI lastSeen Set grows forever | ui/voice/app.js:906 |
| L-ORPHAN | P1 | Live orphan node dist/main.js :3847 killed during audit | PID 26414, 44 min |

## Pass 4 — Async / Errors

| ID | Sev | Summary | Evidence |
|----|-----|---------|----------|
| AS1 | P0 | No SIGTERM/SIGINT shutdown hooks for active synth children | main.ts |
| AS2 | P1 | deleteJob races active runJob | tts.service.ts:267-278 |
| AS3 | P1 | void onProgress races completion | job-runner.service.ts:115 |
| AS4 | P1 | Promise.all piano analysis orphans siblings | piano.service.ts:299 |
| AS5 | P1 | platform/runFf no timeout (overlap L1/L3) | platform-tts.ts |
| AS6 | P2 | Lite mode unbounded TTS concurrency | tts.service.ts:471 |
| AS7 | P2 | Job status transitions without CAS | job-runner.service.ts:46 |
| AS8 | P2 | Worker only SIGINT not SIGTERM | worker.ts:16 |
| AS9 | P2 | Generic error messages / ENGINE_UNAVAILABLE default | app-error.ts:118 |
| AS10 | P3 | Silent catch on trim failures | tts.service.ts:1370 |

## Pass 5 — Security

| ID | Sev | Summary | Evidence |
|----|-----|---------|----------|
| S1 | P0 | Lite storage path traversal arbitrary file read | storage.service.ts:77; **spot-verified**: path.join escapes to /etc/passwd |
| S2 | P0 | Windows PowerShell voice injection | platform-tts.ts:68-104 |
| S3 | P1 | Multer originalname path traversal | tracks.controller.ts:52 |
| S4 | P1 | Model key ../ delete escape | model-manager.ts:248 |
| S5 | P1 | No auth + CORS * (desktop LAN surface) | main.ts |
| S6 | P1 | STT/import no size limits | stt.controller.ts; tts import |
| S7 | P2 | No model checksum; open redirect follow | model-manager.ts:277 |
| S8 | P2 | ValidationPipe missing forbidNonWhitelisted; no MaxLength on text | main.ts:13; SynthesizeDto |
| S9 | P2 | Bare platform voice names accepted | tts.service.ts:1718 |
| S10 | P3 | Trusted absolute outputKey download | tts.service.ts resolveDownload |

## Pass 6 — Performance

| ID | Sev | Summary | Evidence |
|----|-----|---------|----------|
| PERF-1 | P1 | Voice list re-scans disk + spawnSync every request | voice-manager.ts:56 |
| PERF-2 | P1 | Library loads all completed jobs then slices | library.service.ts:17 |
| PERF-3 | P1 | crossfade O(N) sequential ffmpeg + re-encode | ffmpeg.service.ts:1140 |
| PERF-4 | P1 | Per-chunk full entity DB save | tts.service.ts:970 |
| PERF-5 | P2 | listJobs selects full text column | tts.service.ts:249 |
| PERF-6 | P2 | Missing DB indexes on status/created_at | entities |
| PERF-7 | P2 | Double ffprobe in transcode | ffmpeg.service.ts:176 |
| PERF-8 | P2 | Startup serial recovery saves | tts.service.ts:180 |

## Pass 7 — Types / API / Tests

| ID | Sev | Summary | Evidence |
|----|-----|---------|----------|
| T1 | P2 | Incomplete TS strict (no strict:true) | tsconfig.json |
| T2 | P2 | Dual error shapes; no ExceptionFilter | controllers vs AppError |
| T3 | P1 | library download-speed untested spawn | library.controller.ts:96 |
| T4 | P1 | kokoro-tts no spec | kokoro-tts.ts |
| T5 | P1 | piper/whisper spawn weakly tested | specs |
| T6 | P1 | en.formatter + mixed-language-synthesizer no specs | language/ |
| T7 | P2 | Pagination inconsistency page/limit vs offset | controllers |
| T8 | P2 | Swagger incomplete; inline DTOs | tts.controller |
| T9 | P2 | UUID validation inconsistent | jobs vs tts |
| T10 | P2 | Weak tautological tests | tts.controller.spec, whisper.spec |
| T11 | P1 | Missing specs: library, stt controller, storage controller | inventory |
| T12 | P3 | STT unavailable → 400 not 503 | stt.controller.ts:33 |

## Baseline findings

| ID | Sev | Summary |
|----|-----|---------|
| B-01 | P1 | Coverage 77.38%/79.57% below 80% thresholds |
| B-02 | P2 | 31 npm audit vulns (7 high) |
| B-03 | P3 | 8 eslint unused-var warnings |
| B-04 | P1 | Orphan server process during audit |

## Spot-verification ledger

| Pass | Finding verified | Method | Result |
|------|------------------|--------|--------|
| 1 | A3 synthesizePiperStream dead | rg callers | only definition |
| 2 | D3 trim/crossfade sites | rg -n | 4 trim / 3 crossfade confirmed |
| 3 | L1 platform no timeout | rg setTimeout platform-tts | none in runCommand |
| 4 | AS1 no shutdown hooks | read main.ts | no enableShutdownHooks |
| 5 | S1 path traversal | node path.join probe | escapes to /etc/passwd |
| 6 | PERF-1 listVoices scan | read voice-manager comment | "scanned from disk on each call" |
| 7 | T6 no en.formatter.spec | find | NO SPEC confirmed |
| — | L-ORPHAN | ps + kill | PID 26414 killed |

## Workstream ledger (Phases 3–9)

| Stream | Purpose | Outcome | Runtime |
|--------|---------|---------|---------|
| subagent pass1 arch | A findings | landed | ~103s |
| subagent pass2 dup | D findings | landed | ~71s |
| subagent pass3 leak static | L findings | landed | ~59s |
| subagent pass4 async | AS findings | landed | ~57s |
| subagent pass5 security | S findings | landed | ~74s |
| subagent pass6 perf | PERF findings | landed | ~54s |
| subagent pass7 types | T findings | landed | ~55s |
| jscpd src + scripts/ui | dup metrics | landed | ~12s+10s |
| leak-probe.js | dynamic proof | in progress | TBD |
| demo:all | baseline demos | 10/10 green | ~474s |
