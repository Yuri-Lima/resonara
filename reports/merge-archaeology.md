# Phase 1 — Merge Archaeology (G28 forensic audit)

**Branch:** `main` @ `12f9f6c` (Merge PR #10 release/v2.0.0)  
**Tag present:** `v1.0.0`  
**TS LOC (src):** ~18,211 (grew past the ~15,900 figure cited in the task brief)  
**Date:** 2026-07-12  

## Merge timeline (chronological)

| Wave | Merge commit | PR / note | Summary |
|------|--------------|-----------|---------|
| 0 | `8fe0b24` | pre-PR | Audio processing service baseline |
| 1 | `85c9ac0` | **#2** neural longform | Piper engine, seamless pipeline, demos, deliverable UI (+10,303 / −363) |
| 1b | `ccefeca` | **#3** same branch tip | Multilingual en+pt-BR, language layer, packaging (+4,372 / −245) |
| 2 | `55aeaf7` | **#4** g27 competitive | Whisper QA, Kokoro, alignment, library, feeds, EPUB, preprocessor (+6,592 / −1,816) |
| 2b | `71e0ab8` | **#5** improvement dashboard | UI/dashboard + same G27 surface re-landed |
| 3 | `7721c02` | **#6** multilingual completion | Language-aware routing, multilingual e2e, desktop verify |
| 3x | `2a741d0` / `d9baa21` | conflict merges | PR #7/#8 vs #6: drop dead Kokoro branch, keep language-aware voice-manager |
| 3c | `22a3d9e` | **#7** pt-BR multilingual | pt-BR expansion + packaging (small final delta after converges) |
| 3d | `75a538f` | **#8** G27 parity session | Competitive parity + UI/docs converge |
| 3e | `018dd54` | sync longform↔#7 after #8 | Full tip of TTS work on main |
| 4 | `f1e47bc` | **#9** pause prosody | Boundary-aware pauses |
| 5 | `12f9f6c` | **#10** v2.0.0 | Feature-truth → production desktop |

## Per-PR catalog

### PR #2 — neural Piper long-form (`85c9ac0`)
- **Modules:** `src/tts/*` explosion: piper-tts, voice-manager, model-manager, ssml-parser, document-extractor, timestamp-aligner, pronunciation; `tts.service` +~1,145; controller +~377
- **Scripts/UI:** demo suite, deliverable dashboard, voice UI
- **LOC delta:** +10,303 / −363 across 82 files
- **Risk introduced:** first god-file growth of `tts.service.ts`; process spawn for Piper

### PR #3 — multilingual + packaging (`ccefeca`)
- **Modules:** `src/tts/language/*` (registry, detector, pt-br formatter ~385 LOC, mixed-language-synthesizer)
- **Changes:** platform-tts language hooks, text-chunker language-aware, voice-manager language routing
- **LOC delta:** +4,372 / −245 across 62 files
- **Risk:** parallel formatter design (pt-BR heavy; EN thin); abbreviation lists in configs vs chunker

### PR #4 — G27 competitive parity (`55aeaf7`)
- **New modules:** `stt/` (whisper), `tts/qa/*`, `tts/alignment/`, `tts/library/`, `tts/feeds/`, `tts/cover/`, `tts/export/`, `tts/kokoro-tts.ts`, `text-preprocessor.ts`
- **LOC delta:** +6,592 / −1,816 across 78 files
- **Risk:** third engine adapter (kokoro); STT child process; library/storage path surface; preprocessor vs chunker/formatters semantic overlap

### PR #5 — improvement dashboard (`71e0ab8`)
- Overlaps heavily with #4 surface (UI rewrite of deliverable); same competitive modules
- **Risk:** deliverable UI thrash; dual source of truth for feature claims

### PR #6 — multilingual completion (`7721c02`)
- voice-manager language-aware auto; multilingual e2e; desktop verification reports
- **Conflict merge note (`2a741d0`):** explicitly **drop dead Kokoro branch** in resolveEngine

### PR #7 — pt-BR (`22a3d9e`)
- Final tip small after converges (download-whisper improvements, MULTILINGUAL_PLAN rewrite, e2e)

### PR #8 — G27 parity session (`75a538f`)
- Converge G27 + multilingual UI/docs; large deliverable UI delta

### Post-merge smell: unreachable Kokoro (`882f6dd`)
```
// Before: second `if (!isPortuguese && kokoro) return 'kokoro'` after piper return — dead
// After: single kokoro check before piper for English auto mode
```
**Class of bug:** typed, compiled, unreachable at runtime — merge-wave wiring debt.

## Overlap map (suspected semantic conflicts)

| Concern A | Concern B | Overlap type | Verify in |
|-----------|-----------|--------------|-----------|
| `qa/normalize.ts` WER normalize | language formatters (number/date expand) | different purpose but both "normalize text" | Pass 2 |
| `text-preprocessor.ts` | `text-chunker.ts` normalizeWhitespace / dashes | parallel preprocessing | Pass 2 |
| `en.formatter.ts` (128) vs `pt-br.formatter.ts` (385) | shared number/date scaffolding | structural dup | Pass 2 |
| piper / platform / kokoro / whisper | spawn+timeout+cleanup | process-wrapper dup | Pass 2 / 5 |
| `tts.service` main/dialogue/chapter/resynth | crossfade×3 trim×4 | assembly pipeline copies | Pass 2 / 18 |
| demo / smoke-service / qa-run / cli | boot server + poll jobs | script dup | Pass 2 |
| language configs abbreviations | chunker abbreviation protect | dual lists | Pass 2 / 9 |
| planning docs ×8 at root | FEATURE_TRUTH / README | stale vs living | Pass 1c |

## Parallel structures (later PR built beside, not into)

1. **Three TTS engines + one STT** — separate spawn wrappers; no shared `ProcessRunner` core
2. **QA normalizer** (WER) vs **locale formatters** (TTS expansion) — intentional domain split but naming confusion risk
3. **Preprocessor** (G27) sits *before* chunker; both do dash/whitespace work
4. **Four boot-and-poll scripts** with different default ports (3851, 3847, 3855)
5. **Library + storage + feeds** path handling added in same wave as model downloads

## Root documentation inventory

| Artifact | Role | Living? | Consolidation candidate |
|----------|------|---------|-------------------------|
| README.md | Product entry | **Yes** | Keep |
| FEATURE_TRUTH.md | v2 feature matrix | **Yes** | Keep as truth table |
| CHANGELOG.md | Release notes | **Yes** | Keep |
| PAUSE_ARCHITECTURE.md / PAUSE_TUNING.md | Pause design (PR #9) | **Yes** | Keep under docs/ later |
| AUDIO_ARCHITECTURE.md | Audio lab design | Stale-ish | `docs/history/` |
| PIANO_ARCHITECTURE.md | Piano design | Stale-ish | `docs/history/` |
| IMPROVEMENT_PLAN.md | Pre-G25 plan | **Stale** planning | `docs/history/` |
| G25_AUDIT_REPORT.md | Prior audit | **Stale** snapshot | `docs/history/` |
| MULTILINGUAL_PLAN.md | Multilingual plan | Partially shipped | `docs/history/` + pointer |
| COMPETITIVE_ANALYSIS.md | G27 research | Stale research | `docs/history/` |
| IMPROVEMENT_ROADMAP.md | G27 roadmap | Largely shipped | `docs/history/` |
| LISTENING_NOTES.md | Subjective notes | Archive | `docs/history/` |
| WINDOWS_TESTING.md | Windows notes | Living-ish | Keep or docs/ |
| docs/ | Mixed | Mixed | Index living only |

**Do not delete yet** — Phase 14 will `git mv` stale plans into `docs/history/`.

## Module LOC snapshot (current main)

| Module | LOC |
|--------|-----|
| tts/ | 11,881 |
| ffmpeg/ | 2,128 |
| tracks/ | 720 |
| piano/ | 671 |
| entities/ | 567 |
| jobs/ | 397 |
| stt/ | 380 |
| common/ | 364 |
| storage/ | 338 |
| health/ | 202 |
| queue/ | 183 |
| gateway/ | 120 |
| config/ | 69 |

**God files:** `tts.service.ts` 1,990 LOC; `ffmpeg.service.ts` 1,431 LOC; `tts.controller.ts` 543 LOC

## Stale origin feature branches (advisory)

| Branch | Relation to main |
|--------|------------------|
| feat/tts-neural-longform | subsumed by #2/#3 |
| feat/tts-neural-overhaul / -pr | subsumed |
| feat/tts-multilingual-ptbr | subsumed by #7 |
| feat/tts-multilingual-completion | subsumed by #6 |
| feat/g27-competitive-parity | subsumed by #4 |
| feat/g27-parity-session | subsumed by #8 |
| feat/tts-improvement-dashboard | subsumed by #5 |
| feat/pause-prosody-architecture | merged #9 |
| release/v2.0.0 | merged #10 |

**Advisory:** all six+ stale feature branches are fully merged; safe to delete on origin after product owner ack (no code action this phase).

## Suspected findings for later passes (not fixed here)

1. Unreachable-wiring class may remain in other resolve paths
2. God-file assembly pipeline (crossfade×3, trim×4 call sites)
3. Engine adapter spawn duplication
4. Formatter EN vs pt-BR structural dup
5. No-spec high-risk modules: en.formatter, mixed-language-synthesizer, language configs, kokoro-tts, library, jobs controllers
6. Script boot/poll duplication
7. Stale root planning docs contradict FEATURE_TRUTH
8. Resource lifecycle across piper/say/kokoro/whisper/ffmpeg
9. Security surface: storage keys, model download, uploads, feeds
10. `npm audit`: 31 vulns (7 high) at baseline

## Workstream ledger (Phase 1)

| Stream | Purpose | Outcome | Runtime |
|--------|---------|---------|---------|
| main shell archaeology | merge log + diff --stat | landed | ~2 min |
| npm install (prep P2) | deps for baseline | landed (31 vulns) | ~5 s |

## Adversarial self-review (3 weaknesses)

1. **reports/merge-archaeology.md / PR #3 vs #7 attribution:** PR #7's `git diff --stat` is tiny because conflict merges already applied the bulk; a reader might under-count pt-BR work. *Resolution:* catalog uses both tip PR and intermediate conflict merges.
2. **LOC totals:** task brief said ~15,900; measured 18,211 — pause (PR #9) + v2 (PR #10) added code after the brief. *Resolution:* use measured 18,211 as audit baseline.
3. **Existing reports/phase-*.md:** prior G27 session already wrote phase-01..24; this G28 audit reuses the directory with **new** merge-archaeology + phase-02+ naming for G28. *Resolution:* G28 reports are additive (`merge-archaeology.md`, new MASTER_TODO, AUDIT_REPORT); INDEX will be rewritten at close.

## Evidence commands (tails)

```
$ git log --merges --oneline | head -15
12f9f6c Merge pull request #10 from Yuri-Lima/release/v2.0.0
f1e47bc Merge pull request #9 from Yuri-Lima/feat/pause-prosody-architecture
018dd54 merge(main): sync longform with PR #7 after G27 PR #8
75a538f Merge pull request #8 from Yuri-Lima/feat/g27-parity-session
22a3d9e Merge pull request #7 from Yuri-Lima/feat/tts-multilingual-ptbr
...
85c9ac0 Merge pull request #2 from Yuri-Lima/feat/tts-neural-longform

$ git show 882f6dd --stat
fix(tts): remove unreachable Kokoro branch in resolveEngine
 src/tts/voice-manager.ts | 2 +-

$ find src -name '*.ts' | xargs wc -l | tail -1
   18211 total
```
