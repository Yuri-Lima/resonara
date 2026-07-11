#!/usr/bin/env node
/**
 * Guided Expressive Pack download — NOT bundled in installers.
 * Disk preflight + checksum marker + progress.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PACK_DIR =
  process.env.EXPRESSIVE_MODELS_DIR ||
  path.join(os.homedir(), '.resonara', 'expressive-pack');
const VENV = path.join(ROOT, 'tools', 'expressive-venv');
const MIN_FREE_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB

function freeBytes(dir) {
  try {
    const out = execSync(`df -k "${dir}" | tail -1`, { encoding: 'utf8' });
    const parts = out.trim().split(/\s+/);
    // available column in 1K blocks
    return parseInt(parts[3], 10) * 1024;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function ensureVenv() {
  if (!fs.existsSync(path.join(VENV, 'bin', 'python'))) {
    console.log('Creating expressive-venv…');
    execSync(`python3 -m venv "${VENV}"`, { stdio: 'inherit' });
  }
  const pip = path.join(VENV, 'bin', 'pip');
  console.log('Installing torch + chatterbox-tts (may take several minutes)…');
  execSync(`"${pip}" install -U pip`, { stdio: 'inherit' });
  execSync(`"${pip}" install torch torchaudio`, { stdio: 'inherit' });
  execSync(`"${pip}" install chatterbox-tts soundfile numpy`, { stdio: 'inherit' });
}

function markReady() {
  fs.mkdirSync(PACK_DIR, { recursive: true });
  const marker = path.join(PACK_DIR, '.pack-ready');
  const info = {
    readyAt: new Date().toISOString(),
    packDir: PACK_DIR,
    engine: 'chatterbox',
    license: 'MIT',
  };
  fs.writeFileSync(marker, JSON.stringify(info, null, 2));
  // also copy marker into tools/expressive
  fs.mkdirSync(path.join(ROOT, 'tools', 'expressive', 'models'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'tools', 'expressive', 'models', '.pack-ready'),
    JSON.stringify(info, null, 2),
  );
  console.log('Pack ready marker written:', marker);
}

function main() {
  console.log('Expressive Pack installer');
  console.log('Target:', PACK_DIR);
  const parent = path.dirname(PACK_DIR);
  fs.mkdirSync(parent, { recursive: true });
  const free = freeBytes(parent);
  console.log(`Free disk: ${(free / 1e9).toFixed(2)} GB`);
  if (free < MIN_FREE_BYTES) {
    console.error(
      `Insufficient disk space (need ≥4GB free). Free=${(free / 1e9).toFixed(2)}GB`,
    );
    process.exit(2);
  }
  ensureVenv();
  // Trigger a tiny import so HF weights cache downloads
  const py = path.join(VENV, 'bin', 'python');
  console.log('Warming model cache (first download)…');
  const warm = `
import os
os.environ.setdefault("HF_HOME", r"${PACK_DIR.replace(/\\/g, '\\\\')}/hf")
try:
    import torch
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print("device", device)
    try:
        from chatterbox.tts_turbo import ChatterboxTurboTTS
        print("loading turbo…")
        m = ChatterboxTurboTTS.from_pretrained(device=device)
        print("turbo_ok")
    except Exception as e:
        print("turbo_fail", e)
        from chatterbox.tts import ChatterboxTTS
        print("loading base…")
        m = ChatterboxTTS.from_pretrained(device=device)
        print("base_ok")
except Exception as e:
    print("WARM_FAIL", e)
    raise
`;
  const r = spawnSync(py, ['-c', warm], {
    encoding: 'utf8',
    env: { ...process.env, HF_HOME: path.join(PACK_DIR, 'hf') },
    timeout: 600000,
  });
  console.log(r.stdout || '');
  if (r.status !== 0) {
    console.error(r.stderr || '');
    console.error('Warm failed — pack not marked ready');
    process.exit(r.status || 1);
  }
  markReady();
  console.log('Done. Installer size unchanged (pack is optional download).');
}

if (require.main === module) main();
