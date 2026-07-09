#!/usr/bin/env node
/**
 * Resonara TTS demo runner.
 * Boots lite server, synthesizes a sample, downloads WAV, opens player, prints stats.
 *
 * Usage:
 *   node scripts/demo/run-demo.js quick-sentence
 *   node scripts/demo/run-demo.js --all
 *   node scripts/demo/run-demo.js --compare paragraph
 *   node scripts/demo/run-demo.js book-chapter --engine piper --no-open
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SAMPLES = path.join(ROOT, 'samples', 'texts');
const OUT_DIR = path.join(ROOT, 'demo-output');
const PORT = Number(process.env.DEMO_PORT || 3855);
const BASE = `http://127.0.0.1:${PORT}`;

const SAMPLE_MAP = {
  'quick-sentence': 'quick-sentence.txt',
  paragraph: 'paragraph.txt',
  'short-article': 'short-article.txt',
  article: 'short-article.txt',
  'news-article': 'news-article.txt',
  news: 'news-article.txt',
  'book-chapter': 'book-chapter.txt',
  chapter: 'book-chapter.txt',
  'technical-doc': 'technical-doc.txt',
  technical: 'technical-doc.txt',
  'ssml-showcase': 'ssml-showcase.txt',
  ssml: 'ssml-showcase.txt',
  'dialogue-script': 'dialogue-script.txt',
  dialogue: 'dialogue-script.txt',
  'pronunciation-challenge': 'pronunciation-challenge.txt',
  pronunciation: 'pronunciation-challenge.txt',
  'numbers-and-dates': 'numbers-and-dates.txt',
  numbers: 'numbers-and-dates.txt',
};

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function request(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(data
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
              }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const ct = res.headers['content-type'] || '';
          if (ct.includes('application/json')) {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(buf.toString('utf8')), raw: buf });
            } catch (e) {
              reject(e);
            }
          } else {
            resolve({ status: res.statusCode, body: buf, raw: buf });
          }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function waitHealth(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await request('GET', '/health');
      if (r.status === 200) return r.body;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  throw new Error('Server health check timed out');
}

function openAudio(filePath) {
  try {
    if (process.platform === 'darwin') {
      execSync(`open "${filePath}"`, { stdio: 'ignore' });
    } else if (process.platform === 'win32') {
      execSync(`start "" "${filePath}"`, { stdio: 'ignore', shell: true });
    } else {
      execSync(`xdg-open "${filePath}"`, { stdio: 'ignore' });
    }
  } catch (e) {
    console.warn('Could not open audio player:', e.message);
  }
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function startServer() {
  const env = {
    ...process.env,
    RESONARA_LITE: '1',
    PORT: String(PORT),
    PIPER_PATH:
      process.env.PIPER_PATH ||
      path.join(ROOT, 'tools', 'piper-venv', 'bin', 'piper'),
    PIPER_MODELS_DIR:
      process.env.PIPER_MODELS_DIR ||
      path.join(ROOT, 'resources', 'piper', 'models'),
  };
  // Prefer built dist
  const entry = fs.existsSync(path.join(ROOT, 'dist', 'main.js'))
    ? path.join(ROOT, 'dist', 'main.js')
    : null;
  if (!entry) {
    throw new Error('dist/main.js missing — run npm run build first');
  }
  const child = spawn(process.execPath, [entry], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => {
    log += d.toString();
  });
  child.stderr.on('data', (d) => {
    log += d.toString();
  });
  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error('Server exited', code, log.slice(-2000));
    }
  });
  return { child, getLog: () => log };
}

async function synthesizeSample(name, opts = {}) {
  const file = SAMPLE_MAP[name];
  if (!file) throw new Error(`Unknown sample: ${name}`);
  const textPath = path.join(SAMPLES, file);
  if (!fs.existsSync(textPath)) throw new Error(`Missing sample file ${textPath}`);
  let text = fs.readFileSync(textPath, 'utf8');
  const isSsml = name.includes('ssml') || /<speak[\s>]/i.test(text);
  const isDialogue = name.includes('dialogue') || opts.dialogue;

  const body = {
    text,
    engine: opts.engine || 'auto',
    format: opts.format || 'wav',
    ssml: isSsml || undefined,
    dialogue: isDialogue || undefined,
    normalize: true,
    highpass: true,
  };
  if (opts.voice) body.voice = opts.voice;

  const t0 = Date.now();
  const created = await request('POST', '/tts/synthesize', body);
  if (created.status >= 400) {
    throw new Error(`synthesize failed ${created.status}: ${JSON.stringify(created.body)}`);
  }
  const jobId = created.body.id;
  let job = created.body;
  const deadline = Date.now() + (opts.timeoutMs || 600000);
  while (job.status !== 'completed' && job.status !== 'failed') {
    if (Date.now() > deadline) throw new Error(`Job ${jobId} timed out (last status ${job.status})`);
    await sleep(500);
    const poll = await request('GET', `/tts/jobs/${jobId}`);
    job = poll.body;
  }
  if (job.status === 'failed') {
    throw new Error(`Job failed: ${job.error || 'unknown'}`);
  }
  const elapsedMs = Date.now() - t0;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const suffix = opts.suffix ? `-${opts.suffix}` : '';
  const outPath = path.join(OUT_DIR, `${name}${suffix}.wav`);
  const dl = await request('GET', `/tts/jobs/${jobId}/download`);
  if (dl.status >= 400) throw new Error(`download failed ${dl.status}`);
  fs.writeFileSync(outPath, dl.raw);

  const words = wordCount(text);
  const chars = text.length;
  const stats = {
    name,
    jobId,
    engine: job.engine || opts.engine || 'auto',
    words,
    chars,
    elapsedMs,
    charsPerSecond: chars / (elapsedMs / 1000),
    wordsPerSecond: words / (elapsedMs / 1000),
    fileSize: fs.statSync(outPath).size,
    duration: job.metadata?.duration ?? job.duration ?? null,
    output: outPath,
  };
  if (stats.duration && stats.elapsedMs) {
    stats.realTimeFactor = stats.duration / (stats.elapsedMs / 1000);
  }
  return stats;
}

function printStats(stats) {
  console.log('--- demo stats ---');
  console.log(JSON.stringify(stats, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  const noOpen = args.includes('--no-open');
  const all = args.includes('--all');
  const compareIdx = args.indexOf('--compare');
  const engineIdx = args.indexOf('--engine');
  const engine = engineIdx >= 0 ? args[engineIdx + 1] : undefined;
  const nameArg = args.find((a) => !a.startsWith('--') && a !== engine);

  // Ensure build
  if (!fs.existsSync(path.join(ROOT, 'dist', 'main.js'))) {
    console.log('Building…');
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
  }

  const { child } = startServer();
  try {
    console.log(`Waiting for server on ${BASE}…`);
    const health = await waitHealth();
    console.log('Health OK', typeof health === 'object' ? JSON.stringify(health).slice(0, 200) : health);

    if (compareIdx >= 0) {
      const sample = args[compareIdx + 1] || 'paragraph';
      console.log(`A/B compare for ${sample}`);
      const platform = await synthesizeSample(sample, {
        engine: 'platform',
        suffix: 'platform',
        noOpen: true,
      });
      let piper;
      try {
        piper = await synthesizeSample(sample, {
          engine: 'piper',
          suffix: 'piper',
          noOpen: true,
        });
      } catch (e) {
        console.warn('Piper compare failed:', e.message);
      }
      printStats({ platform, piper });
      const report = { platform, piper, at: new Date().toISOString() };
      fs.writeFileSync(
        path.join(OUT_DIR, 'compare-report.json'),
        JSON.stringify(report, null, 2),
      );
      if (!noOpen) {
        openAudio(platform.output);
        if (piper) openAudio(piper.output);
      }
      return;
    }

    if (all) {
      const report = [];
      for (const name of ALL) {
        console.log(`\n=== demo: ${name} ===`);
        try {
          const stats = await synthesizeSample(name, { engine, noOpen: true });
          printStats(stats);
          report.push(stats);
          if (!noOpen && name === 'quick-sentence') openAudio(stats.output);
        } catch (e) {
          console.error(`FAILED ${name}:`, e.message);
          report.push({ name, error: e.message });
        }
      }
      fs.writeFileSync(
        path.join(OUT_DIR, 'report.json'),
        JSON.stringify({ generatedAt: new Date().toISOString(), results: report }, null, 2),
      );
      console.log('Wrote', path.join(OUT_DIR, 'report.json'));
      return;
    }

    const name = nameArg || 'quick-sentence';
    console.log(`Demo: ${name}`);
    const stats = await synthesizeSample(name, { engine });
    printStats(stats);
    if (!noOpen) openAudio(stats.output);
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
    try {
      child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
