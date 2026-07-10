#!/usr/bin/env node
/**
 * Install faster-whisper into tools/whisper-venv and pre-download tiny+base models.
 * Models are cached under tools/whisper/models (gitignored). Never re-download if present.
 * Ensures tools/whisper/transcribe.py exists (required by WhisperService.isAvailable()).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VENV = path.join(ROOT, 'tools', 'whisper-venv');
const MODEL_DIR = path.join(ROOT, 'tools', 'whisper', 'models');
const HELPER = path.join(ROOT, 'tools', 'whisper', 'transcribe.py');
const MODELS = ['tiny', 'base'];

const TRANSCRIBE_PY = `#!/usr/bin/env python3
"""Offline transcription via faster-whisper. Emits JSON on stdout."""
from __future__ import annotations

import argparse
import json
import sys
import time


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("audio")
    p.add_argument("--model", default="tiny", choices=["tiny", "base", "small", "medium"])
    p.add_argument("--language", default="en")
    p.add_argument("--device", default="cpu")
    p.add_argument("--compute-type", default="int8")
    p.add_argument("--model-dir", default="")
    p.add_argument("--word-timestamps", action="store_true", default=True)
    p.add_argument("--no-word-timestamps", action="store_true")
    args = p.parse_args()
    word_ts = not args.no_word_timestamps

    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        print(json.dumps({"error": f"faster_whisper not installed: {e}"}))
        return 2

    t0 = time.time()
    model_kwargs = {
        "device": args.device,
        "compute_type": args.compute_type,
    }
    if args.model_dir:
        model_kwargs["download_root"] = args.model_dir

    model = WhisperModel(args.model, **model_kwargs)
    segments_iter, info = model.transcribe(
        args.audio,
        language=args.language if args.language and args.language != "auto" else None,
        word_timestamps=word_ts,
        vad_filter=True,
    )

    segments = []
    full_parts = []
    for seg in segments_iter:
        words = []
        if word_ts and seg.words:
            for w in seg.words:
                words.append(
                    {
                        "word": (w.word or "").strip(),
                        "startMs": int(round((w.start or 0) * 1000)),
                        "endMs": int(round((w.end or 0) * 1000)),
                    }
                )
        text = (seg.text or "").strip()
        full_parts.append(text)
        segments.append(
            {
                "text": text,
                "startMs": int(round((seg.start or 0) * 1000)),
                "endMs": int(round((seg.end or 0) * 1000)),
                "words": words,
            }
        )

    duration_ms = int(round((info.duration or 0) * 1000))
    out = {
        "text": " ".join(full_parts).strip(),
        "segments": segments,
        "language": getattr(info, "language", args.language) or args.language or "en",
        "durationMs": duration_ms,
        "model": args.model,
        "elapsedMs": int(round((time.time() - t0) * 1000)),
    }
    json.dump(out, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;

function py() {
  const bin = process.platform === 'win32' ? 'Scripts' : 'bin';
  const python = path.join(VENV, bin, process.platform === 'win32' ? 'python.exe' : 'python');
  return python;
}

function ensureVenv() {
  if (!fs.existsSync(py())) {
    console.log('Creating tools/whisper-venv…');
    fs.mkdirSync(path.dirname(VENV), { recursive: true });
    execSync(`python3 -m venv "${VENV}"`, { stdio: 'inherit' });
  }
  console.log('Installing faster-whisper…');
  execSync(`"${py()}" -m pip install -U pip -q`, { stdio: 'inherit' });
  execSync(`"${py()}" -m pip install -U faster-whisper -q`, { stdio: 'inherit' });
}

function modelMarker(name) {
  return path.join(MODEL_DIR, `${name}.ready`);
}

function downloadModel(name) {
  const marker = modelMarker(name);
  if (fs.existsSync(marker)) {
    const st = fs.statSync(marker);
    if (st.size > 0) {
      console.log(`Model ${name} already cached (marker ${marker})`);
      return;
    }
  }
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  console.log(`Downloading Whisper model: ${name} → ${MODEL_DIR}`);
  const code = `
from faster_whisper import WhisperModel
import os
md = r"${MODEL_DIR}"
os.makedirs(md, exist_ok=True)
m = WhisperModel("${name}", device="cpu", compute_type="int8", download_root=md)
print("loaded", "${name}")
`;
  execSync(`"${py()}" -c '${code.replace(/'/g, "'\\''")}'`, {
    stdio: 'inherit',
    env: { ...process.env, HF_HOME: MODEL_DIR, HUGGINGFACE_HUB_CACHE: path.join(MODEL_DIR, 'hub') },
  });
  fs.writeFileSync(marker, `ready ${new Date().toISOString()} model=${name}\n`);
  console.log(`Model ${name} ready`);
}

function ensureTranscribeHelper() {
  fs.mkdirSync(path.dirname(HELPER), { recursive: true });
  if (fs.existsSync(HELPER) && fs.statSync(HELPER).size > 100) {
    console.log('transcribe helper present:', HELPER);
    return;
  }
  fs.writeFileSync(HELPER, TRANSCRIBE_PY, { mode: 0o755 });
  console.log('Wrote transcribe helper:', HELPER);
}

function main() {
  ensureVenv();
  ensureTranscribeHelper();
  for (const m of MODELS) downloadModel(m);
  console.log('Done. Python:', py());
  console.log('Models dir:', MODEL_DIR);
  console.log('Transcribe helper:', HELPER);
}

main();
