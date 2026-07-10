# Listening verification notes (G26 multilingual)

Recorded during local verification on macOS arm64 with Python Piper venv.

## Environment

- Piper: `tools/piper-venv/bin/piper` (native arm64 wheel)
- Models: `en_US-lessac-medium`, `pt_BR-faber-medium`
- ffmpeg: system PATH
- Tests: 133 passed

## English (no regression)

| Demo | Voice | Result |
|------|-------|--------|
| `demo:quick` | lessac medium | Clear single sentence, RTF ~2×, natural prosody |
| `demo:paragraph` | lessac medium | Stable prosody, no audible chunk seams |

## Portuguese (pt-BR)

| Demo | Voice | Result |
|------|-------|--------|
| `demo:pt:rapida` | faber medium | Natural pt-BR sentence; nasal vowels intact |
| `demo:pt:numeros` | faber medium | R$ / dates expanded before synth (formatter) |
| `demo:pt:misturado` | per-block routing | Language blocks routed; crossfade at boundaries |

## Fallback policy

- Language-matched only: Portuguese never falls back to an English voice.
- Platform: Luciana (macOS) when available for pt-BR.

## Desktop packaging

- macOS DMG: runtime-verified after install (synth en + pt-BR offline).
- Windows NSIS: build-verified from macOS; see WINDOWS_TESTING.md.

