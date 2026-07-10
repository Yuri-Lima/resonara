#!/usr/bin/env node
/**
 * QA round-trip runner: synthesize sample(s) with qa:full, print WER table.
 * Usage:
 *   node scripts/qa-run.js sample quick-sentence
 *   node scripts/qa-run.js all
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.QA_PORT || process.env.DEMO_PORT || 3855);
const SAMPLES = path.join(ROOT, 'samples', 'texts');
const OUT = path.join(ROOT, 'demo-output');

const ALL = [
  'quick-sentence',
  'paragraph',
  'short-article',
  'news-article',
  'book-chapter',
  'technical-doc',
  'ssml-showcase',
  'dialogue-script',
  'pronunciation-challenge',
  'numbers-and-dates',
];

const MAP = {
  'quick-sentence': 'quick-sentence.txt',
  paragraph: 'paragraph.txt',
  'short-article': 'short-article.txt',
  'news-article': 'news-article.txt',
  'book-chapter': 'book-chapter.txt',
  'technical-doc': 'technical-doc.txt',
  'ssml-showcase': 'ssml-showcase.txt',
  'dialogue-script': 'dialogue-script.txt',
  'pronunciation-challenge': 'pronunciation-challenge.txt',
  'numbers-and-dates': 'numbers-and-dates.txt',
};

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
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
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null });
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureServer() {
  try {
    const h = await request('GET', '/health');
    if (h.status === 200) return;
  } catch {
    /* start */
  }
  const dist = path.join(ROOT, 'dist', 'main.js');
  if (!fs.existsSync(dist)) {
    console.error('Build first: npm run build');
    process.exit(1);
  }
  console.log('Starting lite server for QA…');
  const child = spawn('node', [dist], {
    cwd: ROOT,
    env: {
      ...process.env,
      RESONARA_LITE: '1',
      PORT: String(PORT),
      PIPER_PATH: process.env.PIPER_PATH || path.join(ROOT, 'tools', 'piper-venv', 'bin', 'piper'),
      PIPER_MODELS_DIR: process.env.PIPER_MODELS_DIR || path.join(ROOT, 'resources', 'piper', 'models'),
    },
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const h = await request('GET', '/health');
      if (h.status === 200) return;
    } catch {
      /* */
    }
  }
  throw new Error('QA server failed to start');
}

async function runSample(name) {
  const file = MAP[name];
  if (!file) throw new Error(`Unknown sample ${name}`);
  const text = fs.readFileSync(path.join(SAMPLES, file), 'utf8');
  // Cap very long samples for QA runtime (still real synthesis)
  const maxChars = Number(process.env.QA_MAX_CHARS || 2500);
  const bodyText = text.length > maxChars ? text.slice(0, maxChars) : text;
  const started = Date.now();
  const extra = {};
  if (name === 'dialogue-script') extra.dialogue = true;
  if (name === 'ssml-showcase') extra.ssml = true;
  const syn = await request('POST', '/tts/synthesize', {
    text: bodyText,
    title: `qa-${name}`,
    qa: 'full',
    // Default piper for stable WER baseline; set QA_ENGINE=kokoro for shootout.
    engine: process.env.QA_ENGINE || 'piper',
    ...extra,
  });
  if (syn.status >= 400) throw new Error(`synthesize failed: ${JSON.stringify(syn.body)}`);
  const id = syn.body.id;
  let job = syn.body;
  for (let i = 0; i < 600; i++) {
    await sleep(500);
    const r = await request('GET', `/tts/jobs/${id}`);
    job = r.body;
    if (job.status === 'completed' || job.status === 'failed') break;
  }
  if (job.status !== 'completed') {
    return { name, error: job.error || job.status, elapsedMs: Date.now() - started };
  }
  const qa = await request('GET', `/tts/jobs/${id}/qa`);
  return {
    name,
    jobId: id,
    elapsedMs: Date.now() - started,
    aggregateWer: qa.body?.aggregateWer ?? null,
    failedCount: qa.body?.failedCount ?? null,
    sampledCount: qa.body?.sampledCount ?? null,
    chunks: qa.body?.chunks || [],
    truncated: text.length > maxChars,
  };
}

async function main() {
  const mode = process.argv[2] || 'sample';
  const name = process.argv[3] || 'quick-sentence';
  await ensureServer();
  fs.mkdirSync(OUT, { recursive: true });

  let results = [];
  if (mode === 'all') {
    for (const s of ALL) {
      console.log(`QA sample: ${s}`);
      try {
        const r = await runSample(s);
        results.push(r);
        console.log(
          `  WER=${r.aggregateWer != null ? r.aggregateWer.toFixed(4) : 'n/a'} failed=${r.failedCount} chunks=${r.sampledCount}`,
        );
      } catch (e) {
        results.push({ name: s, error: e.message });
        console.error('  ERROR', e.message);
      }
    }
  } else {
    const r = await runSample(name);
    results = [r];
    console.log(JSON.stringify(r, null, 2));
  }

  const ok = results.filter((r) => r.aggregateWer != null);
  const agg =
    ok.length > 0
      ? ok.reduce((s, r) => s + r.aggregateWer, 0) / ok.length
      : null;
  // Primary gate: narrative/prose samples (ASR-hostile number/SSML/pronunciation reported separately)
  const PROSE = new Set([
    'quick-sentence',
    'paragraph',
    'short-article',
    'book-chapter',
  ]);
  const proseOk = ok.filter((r) => PROSE.has(r.name));
  const proseAgg =
    proseOk.length > 0
      ? proseOk.reduce((s, r) => s + r.aggregateWer, 0) / proseOk.length
      : null;

  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    aggregateWerMean: agg,
    aggregateWerProse: proseAgg,
    results,
  };
  fs.writeFileSync(path.join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));

  const lines = [
    '# QA Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Mean aggregate WER (all): ${agg != null ? agg.toFixed(4) : 'n/a'}`,
    `Mean aggregate WER (prose gate): ${proseAgg != null ? proseAgg.toFixed(4) : 'n/a'}`,
    '',
    '| Sample | WER | Failed chunks | Sampled |',
    '|--------|-----|---------------|---------|',
  ];
  for (const r of results) {
    lines.push(
      `| ${r.name} | ${r.aggregateWer != null ? r.aggregateWer.toFixed(4) : r.error || 'n/a'} | ${r.failedCount ?? '-'} | ${r.sampledCount ?? '-'} |`,
    );
  }
  fs.writeFileSync(path.join(OUT, 'qa-report.md'), lines.join('\n') + '\n');
  console.log('Wrote', path.join(OUT, 'qa-report.json'));
  console.log('Wrote', path.join(OUT, 'qa-report.md'));
  if (agg != null) console.log('MEAN_AGGREGATE_WER', agg.toFixed(4));
  if (proseAgg != null) console.log('MEAN_PROSE_WER', proseAgg.toFixed(4));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
