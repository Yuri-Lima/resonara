#!/usr/bin/env node
/**
 * Resonara CLI — synth / voices / engines / jobs / watch
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.RESONARA_PORT || process.env.PORT || 3847);

function usage() {
  console.log(`Usage:
  resonara synth <file> [--voice X] [--engine Y] [--language Z] [--out DIR] [--speed N] [--qa full|sample|off]
  resonara voices [--language X]
  resonara engines
  resonara jobs [--status S]
  resonara watch <dir> [--out DIR] [--engine Y] [--voice X]
`);
}

function request(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body != null ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...headers,
          ...(data && !Buffer.isBuffer(body)
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
              }
            : data
              ? { 'Content-Length': data.length, ...headers }
              : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const ct = res.headers['content-type'] || '';
          if (ct.includes('json')) {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(buf.toString()), raw: buf });
            } catch {
              resolve({ status: res.statusCode, body: buf.toString(), raw: buf });
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureServer() {
  try {
    const h = await request('GET', '/health');
    if (h.status === 200) return;
  } catch {
    /* */
  }
  const dist = path.join(ROOT, 'dist', 'main.js');
  if (!fs.existsSync(dist)) {
    console.error('Build first: npm run build');
    process.exit(1);
  }
  console.error(`Starting Resonara lite on :${PORT}…`);
  const child = spawn('node', [dist], {
    cwd: ROOT,
    env: {
      ...process.env,
      RESONARA_LITE: '1',
      RESONARA_FEEDS: process.env.RESONARA_FEEDS || '1',
      PORT: String(PORT),
      PIPER_PATH:
        process.env.PIPER_PATH ||
        path.join(ROOT, 'tools', 'piper-venv', 'bin', 'piper'),
      PIPER_MODELS_DIR:
        process.env.PIPER_MODELS_DIR ||
        path.join(ROOT, 'resources', 'piper', 'models'),
    },
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
  for (let i = 0; i < 50; i++) {
    await sleep(200);
    try {
      const h = await request('GET', '/health');
      if (h.status === 200) return;
    } catch {
      /* */
    }
  }
  console.error('Server failed to start');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) args[key] = true;
      else {
        args[key] = next;
        i++;
      }
    } else args._.push(a);
  }
  return args;
}

async function cmdSynth(args) {
  const file = args._[0];
  if (!file) {
    usage();
    process.exit(2);
  }
  const text = fs.readFileSync(file, 'utf8');
  const outDir = args.out || path.join(process.cwd(), 'demo-output', 'cli');
  fs.mkdirSync(outDir, { recursive: true });
  const body = {
    text,
    voice: args.voice,
    engine: args.engine || 'auto',
    language: args.language || 'auto',
    qa: args.qa || 'sample',
    title: path.basename(file),
    rate: args.speed ? Number(args.speed) * 175 : undefined,
  };
  const syn = await request('POST', '/tts/synthesize', body);
  if (syn.status >= 400) {
    console.error('synth failed', syn.body);
    process.exit(1);
  }
  const id = syn.body.id;
  process.stderr.write(`Job ${id} `);
  let job = syn.body;
  while (job.status !== 'completed' && job.status !== 'failed') {
    await sleep(400);
    job = (await request('GET', `/tts/jobs/${id}`)).body;
    process.stderr.write(`.`);
  }
  process.stderr.write('\n');
  if (job.status !== 'completed') {
    console.error('failed', job.error);
    process.exit(1);
  }
  const dl = await request('GET', `/tts/jobs/${id}/download`);
  const outPath = path.join(outDir, `${path.basename(file, path.extname(file))}.wav`);
  fs.writeFileSync(outPath, dl.raw);
  const qa = await request('GET', `/tts/jobs/${id}/qa`);
  console.log(
    JSON.stringify(
      {
        jobId: id,
        output: outPath,
        bytes: dl.raw.length,
        qa: qa.body,
      },
      null,
      2,
    ),
  );
}

async function cmdVoices(args) {
  const q = args.language ? `?language=${encodeURIComponent(args.language)}` : '';
  const r = await request('GET', `/tts/voices${q}`);
  console.log(JSON.stringify(r.body, null, 2));
}

async function cmdEngines() {
  const r = await request('GET', '/tts/engines');
  console.log(JSON.stringify(r.body, null, 2));
}

async function cmdJobs(args) {
  const q = args.status ? `?status=${encodeURIComponent(args.status)}` : '';
  const r = await request('GET', `/tts/jobs${q}`);
  console.log(JSON.stringify(r.body, null, 2));
}

async function cmdWatch(args) {
  const dir = args._[0];
  if (!dir) {
    usage();
    process.exit(2);
  }
  const outDir = args.out || path.join(dir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const queue = [];
  let busy = false;
  const seen = new Set();

  async function processQueue() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const file = queue.shift();
      const base = path.basename(file);
      try {
        console.log('[watch] synthesizing', file);
        // wait for write settle
        await sleep(800);
        const text = fs.readFileSync(file, 'utf8');
        const syn = await request('POST', '/tts/synthesize', {
          text,
          engine: args.engine || 'auto',
          voice: args.voice,
          title: base,
          qa: args.qa || 'off',
        });
        const id = syn.body.id;
        let job = syn.body;
        while (job.status !== 'completed' && job.status !== 'failed') {
          await sleep(500);
          job = (await request('GET', `/tts/jobs/${id}`)).body;
        }
        if (job.status === 'completed') {
          const dl = await request('GET', `/tts/jobs/${id}/download`);
          const out = path.join(outDir, base.replace(/\.[^.]+$/, '') + '.wav');
          fs.writeFileSync(out, dl.raw);
          fs.writeFileSync(file + '.done', `job=${id}\nout=${out}\n`);
          console.log('[watch] done', out);
        } else {
          fs.writeFileSync(file + '.failed', String(job.error || 'failed'));
          console.error('[watch] failed', job.error);
        }
      } catch (e) {
        fs.writeFileSync(file + '.failed', e.message);
        console.error('[watch] error', e.message);
      }
    }
    busy = false;
  }

  function enqueue(f) {
    if (seen.has(f)) return;
    if (!/\.(txt|md|epub|docx)$/i.test(f)) return;
    if (f.endsWith('.done') || f.endsWith('.failed')) return;
    seen.add(f);
    queue.push(f);
    processQueue();
  }

  console.log('[watch] watching', dir, '→', outDir);
  for (const name of fs.readdirSync(dir)) {
    enqueue(path.join(dir, name));
  }
  fs.watch(dir, (evt, fname) => {
    if (!fname) return;
    enqueue(path.join(dir, fname));
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === '--help' || argv[0] === '-h') {
    usage();
    process.exit(0);
  }
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));
  await ensureServer();
  if (cmd === 'synth') await cmdSynth(args);
  else if (cmd === 'voices') await cmdVoices(args);
  else if (cmd === 'engines') await cmdEngines();
  else if (cmd === 'jobs') await cmdJobs(args);
  else if (cmd === 'watch') await cmdWatch(args);
  else {
    usage();
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
