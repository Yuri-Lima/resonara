# Competitive Analysis — Resonara Voice vs Landscape (G27)

**Date:** 2026-07-11  
**Branch baseline:** `feat/tts-neural-longform` @ `5bc2c81`  
**Scope:** Voice / long-form TTS competitive parity research (no implementation in this document)

---

## 1. Landscape project catalog

### 1.1 ebook2audiobook (github.com/DrewThomasson/ebook2audiobook)

| Dimension | Detail |
|-----------|--------|
| **What it is** | Offline/self-hosted ebook → audiobook pipeline with many TTS backends |
| **Feature set** | 1,158+ languages (via Fairseq/etc.), multi-engine TTS (XTTS, Bark, VITS, Fairseq, YourTTS, …), input formats EPUB/MOBI/AZW3/PDF/TXT/DOCX/HTML + OCR, GUI (web) + CLI + Docker, chaptered output |
| **Architecture** | Job-oriented pipeline; engines behind a unified synthesis interface; heavy optional GPU models for cloning/quality; consumption modes: web UI, scripts, containers |
| **Does BETTER than Resonara** | Engine plurality (many backends, swappable per job); real CLI; OCR; massive language count; Docker-first ops story; chaptered packaging discipline as first-class |
| **Resonara does BETTER** | Desktop Electron install (no Docker required); dual-mode lite/full architecture; production audio post (two-pass EBU R128, highpass, compress presets); SSML + pronunciation dictionary; dialogue multi-speaker; seamless long-form concat; English + pt-BR first-class; offline Piper neural as primary without GPU |

### 1.2 Storyteller (storyteller-platform.dev / gitlab.com/smoores/storyteller)

| Dimension | Detail |
|-----------|--------|
| **What it is** | Self-hosted “immersion reading”: align existing audiobook audio with ebook text → EPUB 3 Media Overlays |
| **Feature set** | Whisper transcription → Levenshtein fuzzy chapter locate → per-sentence timestamp match → SMIL overlays; reader apps; Docker/self-host |
| **Architecture** | Synchronizer service + web UI + mobile readers; algorithm is *align existing audio*, not synthesize |
| **Does BETTER than Resonara** | Production-grade read-along EPUB3 MO export; sentence-level SMIL for any compliant reader; battle-tested fuzzy alignment for imperfect A/V |
| **Resonara does BETTER** | We *synthesize* audio from text — exact source tokens available (no fuzzy chapter search needed if we align our own output); integrated synthesis + audio lab + piano; offline desktop packaging |

**Key insight for Resonara:** Forced alignment on *our* synthesis should beat Storyteller’s fuzzy path because source text is known exactly. Export EPUB3 MO is the consumption format we should match.

### 1.3 Audiobookshelf (audiobookshelf.org)

| Dimension | Detail |
|-----------|--------|
| **What it is** | Self-hosted audiobook + podcast *library server* |
| **Feature set** | Shelf UI (covers, series, progress), multi-user progress sync (Socket.IO), bookmarks, sleep timer, 0.5×–3.0× speed, private podcast RSS re-emit for any client on LAN |
| **Architecture** | Media library + streaming server; Socket.IO sync; RSS as distribution bridge to third-party podcast apps |
| **Does BETTER than Resonara** | Library UX as product center; resume/bookmarks/sleep/speed; multi-device progress; RSS re-emit for any podcast client |
| **Resonara does BETTER** | Creates the audiobook (synthesis) end-to-end; offline desktop; neural TTS; document import pipeline; audio production tools |

**Key insight:** Synthesis output must land in a *library* with listening UX, not only a bare job list. RSS makes every title consumable from Overcast/Apple Podcasts/etc. on the LAN.

### 1.4 Kokoro-82M via kokoro-onnx (github.com/thewh1teagle/kokoro-onnx)

| Dimension | Detail |
|-----------|--------|
| **What it is** | 82M-parameter neural TTS (#1 TTS Arena ~Jan 2026), ONNX Runtime, CPU real-time or faster |
| **Feature set** | ~50 voices; en-US/en-GB, fr, es, it, hi, pt-BR, ja, ko, zh; Apache/MIT-friendly; fully offline |
| **Architecture** | Single compact ONNX model + voices file; Node (`kokoro-js`) or Python (`kokoro-onnx`) |
| **Does BETTER than Resonara** | Naturalness ceiling vs many Piper voices; multi-language in one model; competitive RTF on CPU without espeak phonemizer chain |
| **Resonara does BETTER** | Mature long-form pipeline (chunk/seam/post); Piper packaging already shipping; platform fallback; desktop product surface |

**Key insight:** Kokoro is the additive third engine — not a Piper replacement. Quality order should be evidence-based (listen + WER + RTF), not hardcoded.

### 1.5 faster-whisper / whisper.cpp (STT foundation)

| Dimension | Detail |
|-----------|--------|
| **What it is** | Offline speech-to-text with word-level timestamps |
| **Feature set** | `word_timestamps=True` / `--word-timestamps`; int8/tiny/base fast on CPU; no cloud |
| **Architecture choice for Resonara** | Prefer **faster-whisper** in a tools venv (same pattern as Piper venv): Python API, clean word timestamps, CTranslate2 int8; whisper.cpp is lighter binary but more packaging friction for word JSON |
| **Does BETTER as capability Resonara lacks** | Round-trip QA (synthesize → transcribe → WER); forced alignment anchors for karaoke/EPUB |
| **Resonara advantage once integrated** | We own both ends of the pipeline — can auto-retry bad chunks and surface per-chunk WER |

---

## 2. Feature matrix

Legend: ✅ has · ⚠️ partial · ❌ missing

| Feature | ebook2audiobook | Storyteller | Audiobookshelf | Resonara-today |
|---------|-----------------|-------------|----------------|----------------|
| Engine plurality (swappable TTS) | ✅ | ❌ (align only) | ❌ | ⚠️ (piper + platform) |
| Synthesis QA loop (WER round-trip) | ❌ | ❌ | ❌ | ❌ |
| Read-along / karaoke sync | ❌ | ✅ | ⚠️ (progress only) | ⚠️ (proportional timestamps) |
| EPUB3 Media Overlays export | ❌ | ✅ | ❌ | ❌ |
| Library / bookshelf UX | ⚠️ | ⚠️ | ✅ | ❌ (job list) |
| Progress sync (multi-device) | ❌ | ⚠️ | ✅ | ❌ |
| Bookmarks | ❌ | ⚠️ | ✅ | ❌ |
| Sleep timer | ❌ | ❌ | ✅ | ❌ |
| Playback speed 0.5–3.0× | ❌ | ⚠️ | ✅ | ⚠️ (rate at synth only) |
| Podcast RSS re-emit | ❌ | ❌ | ✅ | ❌ |
| Real CLI | ✅ | ⚠️ | ⚠️ | ❌ (demo scripts only) |
| Watch folder automation | ⚠️ | ❌ | ❌ | ❌ |
| Cover art + embedded metadata | ⚠️ | ⚠️ | ✅ | ❌ |
| OCR for image pages | ✅ | ❌ | ❌ | ❌ |
| Voice cloning | ✅ (XTTS etc.) | ❌ | ❌ | ❌ |
| Input formats (EPUB/PDF/DOCX/…) | ✅ | ✅ (EPUB in) | ✅ (audio lib) | ✅ (import) |
| Offline-first desktop install | ⚠️ | ⚠️ | ⚠️ | ✅ |
| Chaptered audiobook output | ✅ | ✅ | ✅ | ✅ |
| SSML / pronunciation dict | ⚠️ | ❌ | ❌ | ✅ |
| Production audio post (loudnorm) | ⚠️ | ❌ | ❌ | ✅ |
| Multilingual (en + pt-BR first-class) | ✅ (many) | ⚠️ | ✅ | ✅ |

---

## 3. Gap analysis — top 10 by (user value ÷ implementation cost)

Ranked highest leverage first:

| Rank | Gap | Value | Cost | Score | Pillar |
|------|-----|-------|------|-------|--------|
| 1 | **Whisper QA WER loop** (per-chunk synthesize→transcribe→diff) | Very high — only scalable accuracy metric | Medium (venv + service + WER) | ★★★★★ | A |
| 2 | **Forced alignment + read-along UI** | High — Storyteller parity with better anchors | Medium | ★★★★★ | C |
| 3 | **Kokoro third engine** | High naturalness; engine plurality lesson | Medium | ★★★★☆ | B |
| 4 | **Library + resume + bookmarks** | High daily listening UX | Medium | ★★★★☆ | D |
| 5 | **Text preprocessor** (PDF poison cleanup) | High for document import quality | Low | ★★★★★ | (enables A/C) |
| 6 | **CLI + watch folder** | High for power users / batch | Low–Medium | ★★★★☆ | F |
| 7 | **Cover art + full metadata embed** | Medium–High for library feel | Low | ★★★★☆ | E |
| 8 | **Podcast RSS re-emit** | High distribution leverage | Low–Medium | ★★★★☆ | E |
| 9 | **Playback speed + sleep timer** | Medium–High comfort features | Low | ★★★★☆ | D |
| 10 | **EPUB3 Media Overlays export** | High for immersion readers | Medium–High | ★★★☆☆ | C |

---

## 4. Explicit NON-goals (with rationale)

| Non-goal | Rationale |
|----------|-----------|
| **Voice cloning (XTTS/YourTTS-style)** | Heavy GPU models conflict with offline-CPU-first desktop; license/complexity; Piper+Kokoro cover quality without cloning |
| **OCR for scanned PDFs** | Out of scope for G27; document import already handles digital PDF text; OCR is a separate product surface |
| **Multi-user cloud progress sync** | Audiobookshelf’s multi-device Socket.IO sync assumes always-on server; Resonara desktop is single-user local-first — local resume is enough |
| **1,000+ language Fairseq matrix** | Maintenance explosion; ship en + pt-BR well + Kokoro’s multi-lang set; expand languages deliberately later |
| **Docker as primary UX** | Resonara differentiator is Electron installer; Docker remains optional for full mode, not the product center |
| **Replacing Piper** | Piper stays; Kokoro is additive; platform voices stay as fallback |
| **Cloud STT/TTS** | Offline-first is non-negotiable; no OpenAI Whisper API |
| **Audio Lab / Piano feature work** | Out of scope except shared-code fixes |

---

## 5. Resonara strengths to preserve

1. Offline-first desktop (lite sql.js + full Postgres)  
2. Piper neural + platform fallback with language-matched selection  
3. Long-form chunking, seams, chapter markers, post-processing presets  
4. SSML, pronunciation dictionary, dialogue multi-speaker  
5. Document import (EPUB/PDF/DOCX/MD/TXT)  
6. Two-pass loudnorm production path  
7. Demo suite + deliverable UI already shipping  

---

## 6. Decision summary for G27

Close the gap with **six pillars**:

- **A** Synthesis QA (Whisper WER)  
- **B** Engine plurality (Kokoro)  
- **C** Read-along (alignment + karaoke + EPUB3 MO)  
- **D** Library UX (shelf, resume, bookmarks, sleep, speed)  
- **E** Distribution (covers, metadata, podcast RSS)  
- **F** Automation (CLI + watch folder)  

See `IMPROVEMENT_ROADMAP.md` for phase mapping and risk.
