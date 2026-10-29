# Roadmap

Living document — what is planned for Resonara beyond the current release.
Items come from the [Known limits](./README.md#known-limits-v1) of v1 and ongoing product work.
Last updated: 2026-10-29.

## Near term (v2.x)

- **Signed installers** — Apple notarization on macOS and Authenticode on Windows, so installs no longer require Gatekeeper/SmartScreen overrides.
- **Bundle ffmpeg** — remove the host dependency by bundling ffmpeg per platform (or downloading it on first run), with a checksum-verified fetch.
- **Linux desktop installer** — AppImage and/or `.deb` for the Electron app (today Linux is server/CLI only).
- **Pause & prosody tuning pass** — continue the work tracked in [PAUSE_TUNING.md](./PAUSE_TUNING.md): long-form pacing, breath groups, punctuation-driven pauses.
- **Watch-folder UX** — per-file progress, retry on transient failures, clearer error surfacing in the desktop UI.

## Mid term

- **More languages** — beyond en / pt-BR; Spanish is the first candidate, reusing the multilingual pipeline.
- **Chapterized audiobook export** — `.m4b` output with chapter markers and metadata from `.epub` inputs.
- **Synthesis-quality gate in CI** — run the Whisper-based QA harness on a fixed corpus per PR and fail on regression.
- **Expressive pack improvements** — expand the expression markup (see [EXPRESSION_MARKUP.md](./EXPRESSION_MARKUP.md)) and its voice coverage.

## Longer term / exploratory

- **Voice cloning** — out of scope for v1 by design (CPU offline-first constraint); revisit if it can run acceptably on CPU.
- **OCR input path** — scanned PDFs/images as input, feeding the same text pipeline.
- **Custom pre-processor plugins** — a small API to let users plug text normalization steps before synthesis.

---

Suggestions and bug reports are welcome — please open an issue.
