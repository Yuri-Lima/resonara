# FEATURE_TRUTH.md — Resonara v2.0 Feature-Truth Audit

> Runtime-evidenced verdicts for the post-v1.0.0 feature wave (PRs #6–#9).
> Subagent claims were evidence candidates; **three spot-checks** re-ran by the orchestrator.

**Baseline commit:** `pre-v2` @ `f1e47bcd5d845e9ea50e4c376253cfdc1ce5846e`  
**Audit date:** 2026-07-12  
**Probe server:** `http://127.0.0.1:3848` (workspace-local lite; NOT the stale :3847 from another tree)  
**Harness:** `scripts/probe-fleet.js` + 12 parallel subagents  

## Verdict legend

| Verdict | Meaning |
|---------|---------|
| WORKING | End-to-end runtime proof; KEEP for v2.0 |
| PARTIAL | Core path works; gaps remain; FIX before ship |
| BROKEN | Path exists but fails at runtime; FIX or DESCOPE |
| UNREACHABLE | Code present but not selectable/invokable |
| DESCOPED | Formally out of v2.0 with written product rationale |

## Verdict table (post spot-check)

| # | Feature | Fleet verdict | Spot-check | Corrected | Decision | Fix | Evidence |
|---|---------|---------------|------------|-----------|----------|-----|----------|
| 1 | Kokoro engine | WORKING | **YES** — engine=kokoro → completed, 282192-byte WAV mono 48kHz, 1.96s | WORKING | **KEEP** | — | reports/probes/01-kokoro.md, spot-kokoro.wav |
| 2 | Whisper STT | BROKEN* | Evidence shows HTTP **201** + perfect transcript of fox/dog | **WORKING** | **KEEP** | S† | reports/probes/02-whisper.md |
| 3 | QA loop | WORKING | qa:sample MEAN_AGGREGATE_WER **0.0000** | WORKING | **KEEP** | — | reports/probes/03-qa.md, demo-output/qa-report.json |
| 4 | Forced alignment | WORKING | timestamps endpoint + unit suite | WORKING | **KEEP** | — | reports/probes/04-alignment.md |
| 5 | Library | WORKING | list + bookmarks + cover SVG | WORKING | **KEEP** | — | reports/probes/05-library.md |
| 6 | Podcast feeds | WORKING | RSS + enclosure 200 | WORKING | **KEEP** | — | reports/probes/06-feeds.md |
| 7 | Cover art | WORKING | cover endpoint + audio | WORKING | **KEEP** | — | reports/probes/07-cover.md |
| 8 | EPUB export | PARTIAL | overlay dir (smil/xhtml/opf) returned; **not a zip .epub** | PARTIAL | **FIX** | M | reports/probes/08-epub.md |
| 9 | Text preprocessor | BROKEN* / WORKING‡ | preview works; raw bypass OK; **"Page N of M" not stripped** | **PARTIAL** | **FIX** | S | reports/probes/09-preprocessor.md, subagent-09 |
| 10 | CLI | PARTIAL | engines/voices/jobs/synth OK; dead-port **auto-starts** server | PARTIAL | **FIX** | S | reports/probes/10-cli.md |
| 11 | Watch folder | WORKING | drop → output; daemon terminated | WORKING | **KEEP** | — | reports/probes/11-watch.md |
| 12 | pt-BR pipeline | WORKING | **YES** — piper:pt_BR-faber-medium, 1.06MB WAV | WORKING | **KEEP** | — | reports/probes/12-ptbr.md, spot-ptbr.wav |

\* Fleet harness treated Nest **201 Created** as failure — classification bug in the probe, not the product.  
† Optional: document 201 as success in clients; no product code change required for WORKING.  
‡ Subagent-09: WORKING with explicit gap on `"Page N of M"` form.

## Spot-checks (orchestrator re-runs)

### Spot 1 — Kokoro (feature 1)

```
GET /tts/engines → kokoro available=true voiceCount=10
POST engine=kokoro → id=4f684008… completed voice=kokoro:af_sarah
download_http=200 size=282192
file: RIFF WAVE audio, mono 48000 Hz  duration=1.958958
```

**Historical claim settled:** Kokoro is selectable and synthesizes. The old "unreachable resolveEngine branch" was fixed in `882f6dd`; with models installed, the engine is live. Engines endpoint still advertises `languages: ["en","pt-BR"]` with `pt-BR: 0` voices — honesty polish in Phase 2/3.

### Spot 2 — Preprocessor (feature 9)

```
documentMode:true → footnotes/urls/allCaps applied; cleaned returned
enabled:false → identity (raw paste bypass) removals=[]
GAP: "Page 1 of 99" / "Page 2 of 99" remain in cleaned text
```

### Spot 3 — pt-BR (feature 12)

```
language=pt-BR engine=auto → piper / piper:pt_BR-faber-medium
completed; download 1061302 bytes WAVE mono 48kHz
dialogue:true accepted; formatter unit suite green in fleet
```

## Decision summary

| Decision | Features |
|----------|----------|
| **KEEP** (already WORKING) | Kokoro, Whisper, QA, Alignment, Library, Feeds, Cover, Watch, pt-BR |
| **FIX** → WORKING | EPUB export (package real .epub), Preprocessor (Page N of M), CLI (server-down UX) |
| **DESCOPE** | *(none)* — all 12 are product-critical for competitive parity |

## Kokoro reachability settlement

| Question | Answer |
|----------|--------|
| Selectable via API? | **Yes** — `engine=kokoro` accepted |
| Reported on `/tts/engines`? | **Yes** — `available: true` when venv+model present; `false` with install hint when not |
| Audio produced? | **Yes** — 282KB+ WAV verified |
| Auto-selected for English? | **Yes** — primary when available |
| Auto-selected for pt-BR? | **No** (correct) — language-aware skip; piper/platform used |
| Formal descope? | **Not needed** |

## Baseline snapshot (Phase 1a)

| Check | Result |
|-------|--------|
| build | PASS |
| test | 44 suites, **221 passed**, 1 skipped |
| lint | 0 errors, 8 warnings |
| coverage | 77.38% stmts / 79.57% lines (under 80% gate) |
| npm audit | 31 vulns (transitive) |
| demo:quick | PASS (platform Albert, 7.5s) |
| pre-v2 tag | local only @ f1e47bcd |

## Risk notes (Movement III)

1. Installers at v1.0.0 predate entire wave — must rebundle piper + models (en+pt-BR) + whisper tiny + kokoro.
2. Schema: v1 jobs may lack language/qa/resume fields — migration drill required.
3. Engines honesty: do not list pt-BR under Kokoro when voiceCountByLanguage.pt-BR === 0.
4. Coverage slightly under 80% at baseline — raise during fix marathons.
5. Stale origin branches (6+) — advisory report only in Phase 8.
6. Concurrent load on single lite process caused one ECONNRESET during QA probe under fleet pressure — reliability layer (Phase 4).

## Workstream ledger (Phase 1)

| Workstream | Purpose | Outcome | Runtime |
|------------|---------|---------|---------|
| pre-v2 tag | Pin baseline | landed | <1s |
| download-piper | Binary + en/pt models | landed | ~4 min |
| download-whisper | faster-whisper tiny+base | landed | ~3 min |
| download-kokoro (subagent) | kokoro-onnx + voices | landed | ~2 min |
| server-3848 | Probe API | landed | session |
| probe-fleet.js all | 12 sequential runtime probes | landed | ~107s |
| subagent×12 | Parallel feature probes | landed/partial | ~1–3 min each |
| spot-check ×3 | Kokoro, preprocessor, pt-BR | landed | ~20–25s each |
| kill stale find | Orphan hygiene | killed | — |

## Phase 2–3 fix queue (severity order)

1. **EPUB** — package overlay into valid EPUB zip (mimetype, META-INF/container.xml, content.opf)
2. **Preprocessor** — strip `Page N of M` / `Page N` running footers when pageNumbers rule on
3. **CLI** — distinguish server-down vs auto-start; non-zero exit + clear message when `--no-start` or RESONARA_NO_AUTOSTART
4. **Engines honesty** — Kokoro languages list only those with voices



## Post-fix verdicts (Phases 2–3)

| # | Feature | Final verdict | Decision |
|---|---------|---------------|----------|
| 1 | Kokoro | WORKING | KEEP |
| 2 | Whisper | WORKING | KEEP |
| 3 | QA | WORKING | KEEP |
| 4 | Alignment | WORKING | KEEP |
| 5 | Library | WORKING | KEEP |
| 6 | Feeds | WORKING | KEEP |
| 7 | Cover | WORKING | KEEP |
| 8 | EPUB export | **WORKING** (was PARTIAL) | KEEP |
| 9 | Preprocessor | **WORKING** (was PARTIAL) | KEEP |
| 10 | CLI | **WORKING** (was PARTIAL) | KEEP |
| 11 | Watch | WORKING (+debounce) | KEEP |
| 12 | pt-BR | WORKING | KEEP |

All 12 KEEP features probe-verified WORKING. Zero DESCOPE.
