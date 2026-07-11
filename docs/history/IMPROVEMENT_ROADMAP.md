# Improvement Roadmap — G27 Competitive Parity

**Maps:** six pillars (A–F) ← gap analysis in `COMPETITIVE_ANALYSIS.md`  
**Cadence:** 24 phases, REVIEW LOOP v2 after each (build/test/lint + double self-review + phase report + commit)

---

## Pillar overview

| Pillar | Theme | Gaps closed | Phases |
|--------|-------|-------------|--------|
| **A** | Synthesis QA | Whisper STT, WER loop, auto-retry, qa:all | 5–7 |
| **B** | Engine plurality | Kokoro adapter, engine routing, shootout | 8–9 |
| **C** | Read-along | Forced align, karaoke UI, EPUB3 MO | 10–13 |
| **D** | Library UX | Speed, sleep, bookmarks, resume, bookshelf | 14–15 |
| **E** | Distribution | Cover art, metadata, podcast RSS | 16–17 |
| **F** | Automation | CLI + watch folder | 18 |
| **Foundation** | Research, baseline, preprocess | Docs, safety net, text cleanup | 1–4 |
| **Integration** | Verify, bench, test, docs, ship | Full suite + PR | 19–24 |

---

## Per-pillar detail + risk

### Pillar A — Synthesis QA (Whisper round-trip WER)

**Goal:** Every chunk can be scored; silent drops/garble become regression-testable.

| Item | Detail |
|------|--------|
| **Work** | faster-whisper in tools venv; `WhisperService`; `SynthesisQaService` with DP WER; pipeline hooks; `qa:sample` / `qa:all` |
| **Success** | Aggregate WER < 0.08 on 10 EN samples; deliberate-break detection proven |
| **Risks** | Model download size/time; false positives from number/abbreviation normalization; STT latency on long jobs |
| **Mitigations** | Cache models under `tools/`/`resources/` + gitignore; TTS-aware normalizer reusing pronunciation + number formatters; `qa: sample\|full\|off` modes (default sample = every 3rd chunk) |
| **Depends on** | Phase 3 preprocessor (cleaner text → fairer WER) |

### Pillar B — Engine plurality (Kokoro)

**Goal:** Three engines behind one adapter interface: `piper | kokoro | platform`.

| Item | Detail |
|------|--------|
| **Work** | `kokoro-tts.ts` adapter; download script; VoiceManager registration; engine-aware chunk sizes; default from evidence |
| **Success** | Shootout (listen + WER + RTF) decides per-language defaults; demos green |
| **Risks** | ONNX memory growth; long-text instability; license/binary packaging |
| **Mitigations** | Session reuse checks in benchmarks; chunk sizing; gitignore models + download script; keep Piper primary until evidence says otherwise |
| **Depends on** | Pillar A QA for objective WER comparison |

### Pillar C — Read-along

**Goal:** Word-level karaoke + EPUB3 Media Overlays with alignment better than Storyteller’s fuzzy path (we know source text).

| Item | Detail |
|------|--------|
| **Work** | Needleman–Wunsch-style forced aligner on Whisper base words; VTT/SRT rewire; karaoke UI; EPUB3 MO exporter |
| **Success** | Anchored words ±150 ms; chapter drift < 300 ms; structural SMIL/OPF validation |
| **Risks** | Drift accumulation across chunks; proportional fallback misleading users |
| **Mitigations** | Chunk offset merge tests; “approximate sync” badge; Phase 12 listening checkpoints |
| **Depends on** | Pillar A Whisper service |

### Pillar D — Library

**Goal:** Audiobookshelf-class listening UX for *locally synthesized* titles.

| Item | Detail |
|------|--------|
| **Work** | Bookmarks entity (sql.js + Postgres); resume PATCH; sleep timer (localStorage); playbackRate + atempo export; library grid + `/tts/library` |
| **Success** | Continue Listening rail; filters; keyboard grid; empty states |
| **Risks** | N+1 queries; dual-mode entity breakage; UI complexity in voice app |
| **Mitigations** | Single aggregated library query; TypeORM entity in both lite/full lists; progressive enhancement of existing voice UI |
| **Depends on** | Covers (Pillar E) for polish; works without |

### Pillar E — Distribution

**Goal:** Titles look and distribute like real audiobooks/podcasts.

| Item | Detail |
|------|--------|
| **Work** | Deterministic cover generation; ffmpeg embed; RSS 2.0 + iTunes NS; feed list + security flag |
| **Success** | ffprobe cover stream present; RSS validates; feeds default off in full mode, on in lite |
| **Risks** | Unauthenticated LAN feeds; canvas native deps |
| **Mitigations** | Config kill-switch + README security note; pure SVG→PNG or optional canvas with fallback |
| **Depends on** | Library (D) for cover URLs |

### Pillar F — Automation

**Goal:** ebook2audiobook-style CLI + watch folder for batch workflows.

| Item | Detail |
|------|--------|
| **Work** | `scripts/resonara-cli.js` (synth/voices/engines/jobs/watch); npm `cli` script; E2E against lite server |
| **Success** | Exit 0 on quick-sentence; watch mode produces library entry + marker files |
| **Risks** | Race on write-incomplete drops; server boot complexity |
| **Mitigations** | Debounce write completion; connect-or-boot lite; concurrency 1 queue |
| **Depends on** | Core synth API stable |

---

## Phase map (execute in order)

| Phase | Type | Deliverable |
|-------|------|-------------|
| 1 | Research | COMPETITIVE_ANALYSIS.md + IMPROVEMENT_ROADMAP.md |
| 2 | Baseline | reports/phase-02.md + tag `pre-g27` |
| 3 | Feature | text-preprocessor + preview endpoint |
| 4 | Verify | messy-extract A/B listening |
| 5 | Feature | Whisper STT service + real transcription test |
| 6 | Feature | QA WER loop + qa scripts |
| 7 | Verify | qa:all < 0.08 + deliberate break |
| 8 | Feature | Kokoro engine adapter |
| 9 | Verify | 3-engine shootout + default decision |
| 10 | Feature | Forced aligner + VTT/SRT |
| 11 | Feature | Read-along karaoke UI |
| 12 | Verify | Sync checkpoints + click-to-seek |
| 13 | Feature | EPUB3 Media Overlays export |
| 14 | Feature | Speed / sleep / bookmarks / resume |
| 15 | Feature | Library bookshelf UI + API |
| 16 | Feature | Cover art + embedded metadata |
| 17 | Feature | Podcast RSS feeds |
| 18 | Feature | CLI + watch folder |
| 19 | Verify | Full integration pass |
| 20 | Bench | benchmark-v3 engine matrix |
| 21 | Test | Coverage ≥ baseline + 5; E2E green |
| 22 | UI | Deliverable competitive dashboard |
| 23 | Docs | README + INDEX.md + audit |
| 24 | Ship | Final verification + `gh pr create` |

---

## Cross-cutting constraints

- Offline-first: no cloud TTS/STT; no CDN fonts in UIs  
- Additive engines only — never remove Piper/platform  
- Dual-mode: new entities work with sql.js AND PostgreSQL  
- Models gitignored + download scripts  
- Real metrics only — no fabricated WER/RTF  
- One phase = one commit with `reports/phase-NN.md`  

---

## Risk register (session-level)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Whisper/Kokoro download fails or slow | Medium | High | Cache-check scripts; pre-check disk; tiny model first |
| Aggregate WER stuck > 0.08 | Medium | High | Normalization layer; listen worst chunks; fix metric bugs vs synth bugs |
| Kokoro RTF < 1.0 on this machine | Medium | Medium | int8, session reuse, thread env; document if hardware-bound |
| sql.js entity/schema drift | Low | High | synchronize:true in lite; explicit entity registration |
| Scope creep into Lab/Piano | Low | Medium | Hard non-goal boundary |
| Time pressure to skip review loop | High | Critical | Mandatory phase reports with pasted output + 3 adversarial findings |

---

## Definition of done (session)

All items in the user Completion list: analysis docs, pre-g27 baseline, preprocessor, Whisper, QA < 0.08, Kokoro, alignment, karaoke, EPUB3 MO, library pack, covers, RSS, CLI/watch, bench-v3, coverage gate, deliverable UI open, 24 phase reports, PR created. Local only until `gh pr create`.
