# Windows runtime testing checklist

The Windows NSIS installer is **cross-built from macOS** with electron-builder.
Artifact structure is verified on the build machine; **full audio runtime**
must be confirmed on a real Windows 10/11 x64 host.

## Build (from macOS)

```bash
npm run download:piper   # ensures en + pt-BR models
npm run dist:win         # → release/Resonara Setup 2.1.0.exe
```

**Release asset (GitHub):**  
`https://github.com/Yuri-Lima/resonara/releases/download/v2.1.0/Resonara.Setup.2.1.0.exe`

Verification level on macOS: **build-verified** (installer exists, contains
`resources/piper/models/*.onnx` for both languages, `piper.exe` when present).

## Install on Windows

1. Copy `Resonara Setup 2.1.0.exe` to a Windows 10/11 x64 machine.
2. Run the installer (custom directory optional).
3. Launch **Resonara** from Start Menu / desktop shortcut.
4. If SmartScreen blocks: More info → Run anyway (unsigned local build).

## Runtime checklist

| # | Check | Expected |
|---|--------|----------|
| 1 | App launches | Studio UI opens, local API on port 3847 |
| 2 | Health | ffmpeg + TTS engines reported in status |
| 3 | English synth | Voice UI → language English → short sentence → audible WAV |
| 4 | Portuguese synth | Language **Português (Brasil)** → `Olá do Resonara` → pt-BR voice |
| 5 | Auto-detect | Paste Portuguese paragraph → detection shows pt-BR |
| 6 | Offline | Airplane mode: both languages still synthesize |
| 7 | Platform fallback | Engine = Platform; if Maria (pt-BR) missing, error is language-safe (no English voice) |
| 8 | Models present | `%LOCALAPPDATA%` / install dir `resources/piper/models` has `en_US-lessac-medium.onnx` and `pt_BR-faber-medium.onnx` |

## Portuguese SAPI notes

Microsoft **Maria** / **Daniel** (pt-BR) require the Portuguese (Brazil)
language pack. Without it, platform fallback for pt-BR is unavailable —
Piper remains primary.

```powershell
# Optional: list installed SAPI cultures
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo | Select-Object Name, Culture, Gender }
```

## Reporting failures

Capture:

- Resonara version / build date
- Windows edition + architecture
- Whether Piper neural or Platform engine was selected
- Job error text from Voice UI status panel
- Contents of install `resources/piper/` (binary + model filenames)

