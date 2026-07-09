#!/usr/bin/env node
/**
 * Download Piper binary + default English voice for the current platform.
 * Usage: node scripts/download-piper.js
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const RELEASE = '2023.11.14-2';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'resources', 'piper');
const MODELS = path.join(OUT, 'models');

const ASSETS = {
  'darwin-arm64': `piper_macos_aarch64.tar.gz`,
  'darwin-x64': `piper_macos_x64.tar.gz`,
  'linux-x64': `piper_linux_x86_64.tar.gz`,
  'linux-arm64': `piper_linux_aarch64.tar.gz`,
  'win32-x64': `piper_windows_amd64.zip`,
};

const DEFAULT_VOICE = {
  onnx:
    'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx',
  json:
    'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json',
  name: 'en_US-lessac-medium',
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    const get = url.startsWith('https') ? https.get : http.get;
    const req = get(url, { headers: { 'User-Agent': 'resonara-piper-download' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
    });
    req.on('error', reject);
  });
}

async function main() {
  const key = `${process.platform}-${process.arch}`;
  const asset = ASSETS[key] || ASSETS[`${process.platform}-x64`];
  if (!asset) {
    console.error('Unsupported platform', key);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(MODELS, { recursive: true });

  const url = `https://github.com/rhasspy/piper/releases/download/${RELEASE}/${asset}`;
  const archive = path.join(os.tmpdir(), asset);
  console.log('Downloading', url);
  await download(url, archive);
  console.log('Extracting to', OUT);
  if (asset.endsWith('.zip')) {
    execSync(`unzip -o "${archive}" -d "${OUT}"`, { stdio: 'inherit' });
  } else {
    execSync(`tar -xzf "${archive}" -C "${OUT}" --strip-components=1`, {
      stdio: 'inherit',
    });
  }

  const onnxPath = path.join(MODELS, `${DEFAULT_VOICE.name}.onnx`);
  const jsonPath = onnxPath + '.json';
  if (!fs.existsSync(onnxPath)) {
    console.log('Downloading default voice', DEFAULT_VOICE.name);
    await download(DEFAULT_VOICE.onnx, onnxPath);
    await download(DEFAULT_VOICE.json, jsonPath);
  }

  // chmod binary
  const bin = path.join(OUT, process.platform === 'win32' ? 'piper.exe' : 'piper');
  if (fs.existsSync(bin)) {
    fs.chmodSync(bin, 0o755);
    console.log('Piper binary:', bin);
  } else {
    // nested piper/piper
    const nested = path.join(OUT, 'piper', process.platform === 'win32' ? 'piper.exe' : 'piper');
    if (fs.existsSync(nested)) {
      fs.chmodSync(nested, 0o755);
      console.log('Piper binary:', nested);
    } else {
      console.warn('Binary not found after extract — check resources/piper');
    }
  }
  console.log('Done. Set PIPER_PATH / PIPER_MODELS_DIR if needed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
