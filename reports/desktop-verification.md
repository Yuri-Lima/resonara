# Desktop packaging verification

Date: 2026-07-10  
Branch: `feat/tts-multilingual-completion`

## macOS DMG (runtime-tested)

| Check | Result |
|-------|--------|
| `npm run dist:mac` | ✅ `release/Resonara-1.0.0-arm64.dmg` (420MB) + zip (441MB) |
| Bundled models | ✅ `en_US-lessac-medium.onnx` + `pt_BR-faber-medium.onnx` |
| Piper runtime | ✅ `piper-venv/bin/piper` preferred (health: available, voiceCount=2) |
| afterPack | ✅ models logged; ad-hoc codesign attempted |
| Launch `.app` | ✅ API on :3847 after ~5s |
| Synth EN | ✅ completed · engine=piper · voice=`piper:en_US-lessac-medium` |
| Synth pt-BR | ✅ completed · engine=piper · voice=`piper:pt_BR-faber-medium` |
| Offline | Models + venv local (no network required for synth) |

## Windows NSIS (build-verified from macOS)

| Check | Result |
|-------|--------|
| `npm run dist:win` | ✅ `release/Resonara Setup 1.0.0.exe` (339MB) |
| `piper.exe` | ✅ PE32+ x86-64 under `win-unpacked/resources/piper/` |
| DLLs + espeak-ng-data | ✅ present |
| Models | ✅ both en + pt-BR onnx |
| Runtime on Windows host | **Not executed** — checklist in `WINDOWS_TESTING.md` |

## Critical product fix in this branch

Auto language=`pt-BR` no longer routes to Kokoro (English-only). Engine resolves
to Piper/platform for Portuguese; English still prefers Kokoro in dev when available.
