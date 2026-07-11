#!/usr/bin/env node
/**
 * G28 leak probe: boot lite mode, run the same short synthesis 10×,
 * record RSS / active handles / tmp file counts after each run.
 *
 * Usage: node scripts/leak-probe.js
 * Env: LEAK_PORT (default 3865), LEAK_RUNS (default 10)
 */
'use strict';

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.LEAK_PORT || 3865);
const RUNS = Number(process.env.LEAK_RUNS || 10);
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'main.js');
const WORK = path.join(ROOT, 'demo-output', 'leak-probe');
const TEXT =
  'Resonara leak probe sentence. Measuring memory and temp file growth across sequential synthesises.';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data),
            }
          : {},
        timeout: 120000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let parsed = buf;
          try {
            parsed = JSON.parse(buf);
          } catch (_) {
            /* raw */
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('request timeout'));
    });
    if (data) req.write(data);
    req.end();
  });
}

function countTmp(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else n += 1;
    }
  };
  try {
    walk(dir);
  } catch (_) {
    /* ignore */
  }
  return n;
}

function freePort(port) {
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'darwin' || process.platform === 'linux') {
      const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true`, {
        encoding: 'utf8',
      }).trim();
      if (out) {
        for (const pid of out.split(/\s+/)) {
          try {
            process.kill(Number(pid), 'SIGTERM');
          } catch (_) {
            /* */
          }
        }
      }
    }
  } catch (_) {
    /* */
  }
}

async function waitHealthy(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await request('GET', '/health');
      if (r.status === 200) return r.body;
    } catch (_) {
      /* retry */
    }
    await sleep(400);
  }
  throw new Error('server did not become healthy');
}

async function synthesizeOnce() {
  const create = await request('POST', '/tts/synthesize', {
    text: TEXT,
    engine: 'platform',
    language: 'en',
    format: 'wav',
  });
  if (create.status >= 400) {
    throw new Error(`create failed ${create.status}: ${JSON.stringify(create.body)}`);
  }
  const jobId = create.body.id || create.body.jobId;
  if (!jobId) throw new Error(`no job id: ${JSON.stringify(create.body)}`);

  const start = Date.now();
  while (Date.now() - start < 180000) {
    const st = await request('GET', `/tts/jobs/${jobId}`);
    const status = st.body.status || st.body.state;
    if (status === 'completed' || status === 'done' || status === 'succeeded') {
      return st.body;
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`job failed: ${JSON.stringify(st.body)}`);
    }
    await sleep(500);
  }
  throw new Error('job poll timeout');
}

async function main() {
  if (!fs.existsSync(DIST)) {
    console.error('dist/main.js missing — run npm run build first');
    process.exit(2);
  }
  fs.mkdirSync(WORK, { recursive: true });
  freePort(PORT);

  const env = {
    ...process.env,
    RESONARA_LITE: '1',
    PORT: String(PORT),
    NODE_ENV: 'production',
  };
  const child = spawn(process.execPath, [DIST], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  child.stdout.on('data', (d) => {
    serverLog += d.toString();
  });
  child.stderr.on('data', (d) => {
    serverLog += d.toString();
  });

  const rows = [];
  try {
    await waitHealthy();
    console.log('Server healthy on', PORT);
    // Force GC if available
    if (typeof global.gc === 'function') {
      global.gc();
    }
    const storageCandidates = [
      path.join(ROOT, 'storage'),
      path.join(ROOT, 'data'),
      path.join(os.tmpdir(), 'resonara'),
      path.join(ROOT, 'demo-output'),
    ];

    for (let i = 1; i <= RUNS; i++) {
      await synthesizeOnce();
      if (typeof global.gc === 'function') global.gc();
      await sleep(200);
      // Sample child process RSS via ps
      let rssMb = null;
      try {
        const { execSync } = require('child_process');
        const ps = execSync(`ps -o rss= -p ${child.pid}`, { encoding: 'utf8' }).trim();
        rssMb = Math.round((Number(ps) / 1024) * 10) / 10; // KB → MB
      } catch (_) {
        rssMb = null;
      }
      const selfMem = process.memoryUsage();
      let tmpCount = 0;
      for (const d of storageCandidates) tmpCount += countTmp(d);
      // handles: approximate via lsof for child
      let handles = null;
      try {
        const { execSync } = require('child_process');
        const lo = execSync(`lsof -p ${child.pid} 2>/dev/null | wc -l`, {
          encoding: 'utf8',
        }).trim();
        handles = Number(lo) || null;
      } catch (_) {
        handles = null;
      }
      const row = {
        run: i,
        serverRssMb: rssMb,
        probeRssMb: Math.round((selfMem.rss / 1024 / 1024) * 10) / 10,
        handles,
        tmpFiles: tmpCount,
      };
      rows.push(row);
      console.log(
        `run ${i}/${RUNS}  serverRSS=${rssMb}MB  handles=${handles}  tmpFiles=${tmpCount}`,
      );
    }
  } finally {
    try {
      child.kill('SIGTERM');
    } catch (_) {
      /* */
    }
    await sleep(500);
    try {
      child.kill('SIGKILL');
    } catch (_) {
      /* */
    }
    freePort(PORT);
  }

  console.log('\n=== LEAK PROBE TABLE ===');
  console.log('run | serverRSS_MB | handles | tmpFiles');
  for (const r of rows) {
    console.log(`${r.run} | ${r.serverRssMb} | ${r.handles} | ${r.tmpFiles}`);
  }
  const outPath = path.join(WORK, 'leak-probe-results.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify({ port: PORT, runs: RUNS, rows, at: new Date().toISOString() }, null, 2),
  );
  console.log('Wrote', outPath);

  // Growth analysis
  if (rows.length >= 3) {
    const first = rows[0];
    const last = rows[rows.length - 1];
    const rssDelta = (last.serverRssMb || 0) - (first.serverRssMb || 0);
    const handleDelta = (last.handles || 0) - (first.handles || 0);
    const tmpDelta = last.tmpFiles - first.tmpFiles;
    console.log('\n=== GROWTH ===');
    console.log(`RSS delta (last-first): ${rssDelta.toFixed(1)} MB`);
    console.log(`Handles delta: ${handleDelta}`);
    console.log(`Tmp files delta: ${tmpDelta}`);
    if (rssDelta > 30 || handleDelta > 20 || tmpDelta > 5) {
      console.log('VERDICT: LIKELY LEAK (monotonic growth thresholds exceeded)');
      process.exitCode = 1;
    } else {
      console.log('VERDICT: FLAT ENOUGH (within thresholds)');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
