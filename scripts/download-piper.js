#!/usr/bin/env node
/**
 * Download Piper binary + default English voice for the current platform.
 * On macOS arm64, official GitHub tarballs are often broken (x86_64 + missing dylibs).
 * Fallback: install piper-tts into tools/piper-venv (Python wheel, arm64-native).
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const { URL } = require('url');

const RELEASE = '2023.11.14-2';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'resources', 'piper');
const MODELS = path.join(OUT, 'models');
const VENV = path.join(ROOT, 'tools', 'piper-venv');

const ASSETS = {
  'darwin-arm64': `piper_macos_aarch64.tar.gz`,
  'darwin-x64': `piper_macos_x64.tar.gz`,
  'linux-x64': `piper_linux_x86_64.tar.gz`,
  'linux-arm64': `piper_linux_aarch64.tar.gz`,
  'win32-x64': `piper_windows_amd64.zip`,
};

const DEFAULT_VOICES = [
  {
    onnx:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx?download=true',
    json:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json?download=true',
    name: 'en_US-lessac-medium',
    language: 'en-US',
  },
  {
    // Brazilian Portuguese medium male — primary offline pt-BR voice
    onnx:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx?download=true',
    json:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx.json?download=true',
    name: 'pt_BR-faber-medium',
    language: 'pt-BR',
  },
];

// Back-compat alias
const DEFAULT_VOICE = DEFAULT_VOICES[0];

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('Too many redirects'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      // Relative redirect — should not happen if we resolve properly
      return reject(new Error(`Invalid URL: ${url}`));
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(
      url,
      { headers: { 'User-Agent': 'resonara-piper-download', Accept: '*/*' } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          try { fs.unlinkSync(dest); } catch { /* */ }
          let next = res.headers.location;
          if (next.startsWith('/')) {
            next = `${parsed.protocol}//${parsed.host}${next}`;
          }
          return download(next, dest, redirects + 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(dest); } catch { /* */ }
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      },
    );
    req.on('error', reject);
  });
}

function installPythonPiper() {
  console.log('Installing piper-tts into tools/piper-venv (recommended on macOS arm64)…');
  fs.mkdirSync(path.dirname(VENV), { recursive: true });
  execSync(`python3 -m venv "${VENV}"`, { stdio: 'inherit' });
  const pip = process.platform === 'win32'
    ? path.join(VENV, 'Scripts', 'pip')
    : path.join(VENV, 'bin', 'pip');
  execSync(`"${pip}" install -U pip piper-tts`, { stdio: 'inherit' });
  const bin = process.platform === 'win32'
    ? path.join(VENV, 'Scripts', 'piper.exe')
    : path.join(VENV, 'bin', 'piper');
  console.log('Python Piper binary:', bin);
  return bin;
}

function nativeRunnable(bin) {
  try {
    execSync(`"${bin}" --help`, { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(MODELS, { recursive: true });

  const key = `${process.platform}-${process.arch}`;
  const asset = ASSETS[key] || ASSETS[`${process.platform}-x64`];

  // Always ensure default multilingual models (en + pt-BR)
  for (const voice of DEFAULT_VOICES) {
    const onnxPath = path.join(MODELS, `${voice.name}.onnx`);
    const jsonPath = onnxPath + '.json';
    if (!fs.existsSync(onnxPath) || fs.statSync(onnxPath).size < 1_000_000) {
      console.log('Downloading voice', voice.name, `(${voice.language})`);
      await download(voice.onnx, onnxPath);
      await download(voice.json, jsonPath);
    } else if (!fs.existsSync(jsonPath) || fs.statSync(jsonPath).size < 100) {
      console.log('Downloading voice config JSON for', voice.name);
      await download(voice.json, jsonPath);
    } else {
      console.log('Voice model already present:', onnxPath);
    }
  }

  // Prefer python wheel on darwin-arm64 or when native fails
  const preferPython = process.platform === 'darwin' && process.arch === 'arm64';
  let pythonBin = path.join(VENV, 'bin', 'piper');
  if (process.platform === 'win32') pythonBin = path.join(VENV, 'Scripts', 'piper.exe');

  if (preferPython || !fs.existsSync(pythonBin)) {
    try {
      installPythonPiper();
    } catch (e) {
      console.warn('Python piper install failed:', e.message);
    }
  }

  if (asset && !preferPython) {
    const url = `https://github.com/rhasspy/piper/releases/download/${RELEASE}/${asset}`;
    const archive = path.join(os.tmpdir(), asset);
    console.log('Downloading native binary', url);
    try {
      await download(url, archive);
      console.log('Extracting to', OUT);
      if (asset.endsWith('.zip')) {
        execSync(`unzip -o "${archive}" -d "${OUT}"`, { stdio: 'inherit' });
      } else {
        execSync(`tar -xzf "${archive}" -C "${OUT}" --strip-components=1`, {
          stdio: 'inherit',
        });
      }
      const bin = path.join(OUT, process.platform === 'win32' ? 'piper.exe' : 'piper');
      if (fs.existsSync(bin)) {
        fs.chmodSync(bin, 0o755);
        if (!nativeRunnable(bin)) {
          console.warn('Native Piper binary present but not runnable — use tools/piper-venv');
        } else {
          console.log('Native Piper binary OK:', bin);
        }
      }
    } catch (e) {
      console.warn('Native download failed:', e.message);
    }
  }

  // Write version stamp
  const voiceNames = DEFAULT_VOICES.map((v) => v.name).join(',');
  fs.writeFileSync(
    path.join(OUT, 'VERSION'),
    `release=${RELEASE}\nvoices=${voiceNames}\npython_venv=${VENV}\nlanguages=en-US,pt-BR\n`,
  );
  console.log('Done. Bundled models:', voiceNames);
  console.log('Resonara resolves tools/piper-venv/bin/piper first when runnable.');
  console.log('Optional: export PIPER_PATH and PIPER_MODELS_DIR');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
