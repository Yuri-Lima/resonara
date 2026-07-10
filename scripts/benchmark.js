#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = 3856;
const OUT = path.join(ROOT, 'demo-output');
const SAMPLES = ['quick-sentence', 'paragraph', 'short-article'];

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
          const buf = Buffer.concat(chunks);
          try {
            resolve({ status: res.statusCode, body: JSON.parse(buf.toString()) });
          } catch {
            resolve({ status: res.statusCode, body: buf });
          }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function waitHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await request('GET', '/health');
      if (r.status === 200) return;
    } catch { /* */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('health timeout');
}

async function runOne(name) {
  const text = fs.readFileSync(
    path.join(ROOT, 'samples/texts', name.includes('.') ? name : `${name}.txt`),
    'utf8',
  );
  const memBefore = process.memoryUsage().rss;
  const t0 = Date.now();
  const created = await request('POST', '/tts/synthesize', {
    text,
    engine: 'auto',
    format: 'wav',
  });
  const id = created.body.id;
  let job = created.body;
  while (job.status !== 'completed' && job.status !== 'failed') {
    await new Promise((r) => setTimeout(r, 400));
    job = (await request('GET', `/tts/jobs/${id}`)).body;
  }
  const elapsedMs = Date.now() - t0;
  const memAfter = process.memoryUsage().rss;
  if (job.status === 'failed') throw new Error(job.error);
  const duration = job.metadata?.duration || 0;
  return {
    name,
    words: text.trim().split(/\s+/).length,
    chars: text.length,
    elapsedMs,
    durationSec: duration,
    realTimeFactor: duration ? duration / (elapsedMs / 1000) : null,
    charsPerSecond: text.length / (elapsedMs / 1000),
    peakRssMbApprox: Math.round(Math.max(memBefore, memAfter) / 1024 / 1024),
    engine: job.engine,
  };
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, 'dist/main.js'))) {
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
  }
  const child = spawn(process.execPath, [path.join(ROOT, 'dist/main.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      RESONARA_LITE: '1',
      PORT: String(PORT),
      PIPER_PATH: process.env.PIPER_PATH || path.join(ROOT, 'tools/piper-venv/bin/piper'),
      PIPER_MODELS_DIR: process.env.PIPER_MODELS_DIR || path.join(ROOT, 'resources/piper/models'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitHealth();
    const results = [];
    for (const s of SAMPLES) {
      console.log('Benchmark', s);
      const runs = [];
      for (let i = 0; i < 3; i++) {
        runs.push(await runOne(s === 'short-article' ? 'short-article' : s));
      }
      const avg = {
        name: s,
        runs,
        avgElapsedMs: Math.round(runs.reduce((a, b) => a + b.elapsedMs, 0) / runs.length),
        avgRtf:
          runs.filter((r) => r.realTimeFactor).reduce((a, b) => a + b.realTimeFactor, 0) /
            (runs.filter((r) => r.realTimeFactor).length || 1) || null,
        maxRssMb: Math.max(...runs.map((r) => r.peakRssMbApprox)),
      };
      results.push(avg);
      console.log(JSON.stringify(avg, null, 2));
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'benchmark.json'), JSON.stringify(results, null, 2));
    const md = [
      '# Resonara TTS Benchmark',
      '',
      '| Sample | Avg ms | RTF | Peak RSS MB |',
      '|--------|--------|-----|-------------|',
      ...results.map(
        (r) =>
          `| ${r.name} | ${r.avgElapsedMs} | ${r.avgRtf ? r.avgRtf.toFixed(2) : 'n/a'} | ${r.maxRssMb} |`,
      ),
      '',
    ].join('\n');
    fs.writeFileSync(path.join(OUT, 'benchmark.md'), md);
    console.log(md);
  } finally {
    child.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
