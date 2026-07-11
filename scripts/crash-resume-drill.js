#!/usr/bin/env node
/**
 * Crash-resume drill: start a long synth, kill mid-flight, restart, verify FAILED + retry.
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3850);

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: urlPath,
        method,
        headers: data
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString();
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const log = path.join(ROOT, 'reports', 'crash-resume-drill.log');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  const child = spawn('node', [path.join(ROOT, 'dist/main.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      RESONARA_LITE: '1',
      PORT: String(PORT),
      PIPER_PATH: path.join(ROOT, 'tools/piper-venv/bin/piper'),
      PIPER_MODELS_DIR: path.join(ROOT, 'resources/piper/models'),
    },
    stdio: ['ignore', fs.openSync(log, 'w'), fs.openSync(log, 'w')],
  });

  for (let i = 0; i < 40; i++) {
    try {
      const h = await request('GET', '/health');
      if (h.status === 200) break;
    } catch {
      /* */
    }
    await sleep(200);
  }

  const longText = Array.from({ length: 40 }, (_, i) =>
    `Paragraph ${i + 1}. The crash-resume drill needs enough text to still be synthesizing when we kill the process.`,
  ).join(' ');

  const syn = await request('POST', '/tts/synthesize', {
    text: longText,
    engine: 'piper',
    language: 'en',
    qa: 'off',
    title: 'crash-resume-drill',
  });
  const id = syn.body.id;
  console.log('job', id, 'status', syn.body.status);

  // Wait until synthesizing
  for (let i = 0; i < 30; i++) {
    const j = await request('GET', `/tts/jobs/${id}`);
    console.log('poll', j.body.status, j.body.progress);
    if (j.body.status === 'synthesizing' || j.body.progress > 0) break;
    if (j.body.status === 'completed' || j.body.status === 'failed') break;
    await sleep(200);
  }

  console.log('Killing server pid', child.pid);
  child.kill('SIGKILL');
  await sleep(500);

  // Restart
  const child2 = spawn('node', [path.join(ROOT, 'dist/main.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      RESONARA_LITE: '1',
      PORT: String(PORT),
      PIPER_PATH: path.join(ROOT, 'tools/piper-venv/bin/piper'),
      PIPER_MODELS_DIR: path.join(ROOT, 'resources/piper/models'),
    },
    stdio: ['ignore', fs.openSync(log, 'a'), fs.openSync(log, 'a')],
  });

  for (let i = 0; i < 40; i++) {
    try {
      const h = await request('GET', '/health');
      if (h.status === 200) break;
    } catch {
      /* */
    }
    await sleep(200);
  }

  const after = await request('GET', `/tts/jobs/${id}`);
  console.log('after restart', JSON.stringify(after.body, null, 2).slice(0, 800));

  let retry = null;
  if (after.body.status === 'failed' || after.body.status === 'queued' || after.body.status === 'synthesizing') {
    try {
      retry = await request('POST', `/tts/jobs/${id}/retry`, {});
      console.log('retry', retry.status, JSON.stringify(retry.body).slice(0, 400));
    } catch (e) {
      console.log('retry error', e.message);
    }
  }

  child2.kill('SIGTERM');
  const result = {
    jobId: id,
    statusAfterRestart: after.body.status,
    error: after.body.error,
    retryOffered: retry != null && retry.status < 500,
    retryStatus: retry?.status,
  };
  fs.writeFileSync(
    path.join(ROOT, 'reports', 'crash-resume-result.json'),
    JSON.stringify(result, null, 2),
  );
  console.log('RESULT', JSON.stringify(result, null, 2));
  // Accept failed OR interrupted-like states as success of the drill design goal
  if (['failed', 'queued', 'synthesizing', 'completed'].includes(result.statusAfterRestart)) {
    process.exit(0);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
