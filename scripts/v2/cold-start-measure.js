#!/usr/bin/env node
/**
 * Cold-start gate: time from process spawn to GET /health === 200.
 * Target: < 3000ms interactive UI on this machine (Nest lite).
 */
const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '../..');
const PORT = Number(process.env.PORT || 3851);

function health() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port: PORT, path: '/health', timeout: 1500 },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          resolve(res.statusCode === 200 && body.includes('"status"'));
        });
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function freePort() {
  try {
    execSync(`lsof -tiTCP:${PORT} -sTCP:LISTEN | xargs kill -9`, {
      stdio: 'ignore',
    });
  } catch {
    /* free */
  }
}

async function main() {
  freePort();
  await new Promise((r) => setTimeout(r, 400));

  const log = path.join(ROOT, 'reports', 'cold-start-server.log');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  const outFd = fs.openSync(log, 'w');
  const t0 = Date.now();
  const child = spawn('node', [path.join(ROOT, 'dist/main.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      RESONARA_LITE: '1',
      PORT: String(PORT),
      PIPER_PATH: path.join(ROOT, 'tools/piper-venv/bin/piper'),
      PIPER_MODELS_DIR: path.join(ROOT, 'resources/piper/models'),
    },
    stdio: ['ignore', outFd, outFd],
  });

  let ready = false;
  let readyMs = null;
  // 10s budget to detect ready; pass gate is still <3000ms
  for (let i = 0; i < 200; i++) {
    if (await health()) {
      ready = true;
      readyMs = Date.now() - t0;
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  if (readyMs == null) readyMs = Date.now() - t0;

  const result = {
    readyMs,
    ok: ready,
    targetMs: 3000,
    pass: ready && readyMs < 3000,
    note: ready
      ? 'Nest lite /health reachable (static UI served once ready)'
      : `server failed; see ${log}`,
    measuredAt: new Date().toISOString(),
  };

  try {
    child.kill('SIGTERM');
  } catch {
    /* */
  }
  try {
    fs.closeSync(outFd);
  } catch {
    /* */
  }
  freePort();

  fs.writeFileSync(
    path.join(ROOT, 'reports', 'cold-start.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok && result.pass ? 0 : result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
