#!/usr/bin/env node
/**
 * Install faster-whisper into tools/whisper-venv and pre-download tiny+base models.
 * Models are cached under tools/whisper/models (gitignored). Never re-download if present.
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const VENV = path.join(ROOT, 'tools', 'whisper-venv');
const MODEL_DIR = path.join(ROOT, 'tools', 'whisper', 'models');
const MODELS = ['tiny', 'base'];

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
  // HuggingFace cache layout under download_root varies; use a marker + size check
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

function main() {
  ensureVenv();
  for (const m of MODELS) downloadModel(m);
  console.log('Done. Python:', py());
  console.log('Models dir:', MODEL_DIR);
  console.log('Transcribe helper: tools/whisper/transcribe.py');
}

main();
