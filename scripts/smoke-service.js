#!/usr/bin/env node
/**
 * Boot Resonara lite API and hit /health + key routes.
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const PORT = process.env.PORT || '3851';
const dataDir = path.join(root, '.resonara-data', 'smoke-service');
fs.mkdirSync(dataDir, { recursive: true });

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${PORT}${urlPath}`, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: body.slice(0, 4000) }),
        );
      })
      .on('error', reject);
  });
}

async function waitHealth(timeoutMs = 45000) {
  const start = Date.now();
  for (;;) {
    try {
      const r = await get('/health');
      if (r.status === 200) return JSON.parse(r.body);
    } catch {}
    if (Date.now() - start > timeoutMs) throw new Error('health timeout');
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function main() {
  const entry = path.join(root, 'dist', 'main.js');
  if (!fs.existsSync(entry)) {
    throw new Error('dist/main.js missing — run npm run build first');
  }
  const child = spawn('node', [entry], {
    cwd: root,
    env: {
      ...process.env,
      PORT,
      RESONARA_LITE: '1',
      RESONARA_DESKTOP: '1',
      RESONARA_DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (d) => (logs += d));
  child.stderr.on('data', (d) => (logs += d));

  try {
    const health = await waitHealth();
    const ui = await get('/ui/');
    const voice = await get('/ui/voice/');
    const voices = await get('/tts/voices');
    const engines = await get('/tts/engines');
    const result = {
      health,
      uiStatus: ui.status,
      voiceStatus: voice.status,
      voicesStatus: voices.status,
      enginesStatus: engines.status,
      voiceHasResonara: /Resonara/i.test(voice.body),
      product: health.product,
      mode: health.mode,
      checks: health.checks,
    };
    console.log(JSON.stringify(result, null, 2));
    if (health.product !== 'Resonara') throw new Error('product name missing');
    if (health.checks?.ffmpeg !== 'ok') throw new Error('ffmpeg not ok');
    if (voice.status !== 200 || !result.voiceHasResonara) {
      throw new Error('Voice UI missing or not branded');
    }
    if (voices.status !== 200 || engines.status !== 200) {
      throw new Error('TTS API surfaces missing');
    }
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
    try {
      child.kill('SIGKILL');
    } catch {}
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
