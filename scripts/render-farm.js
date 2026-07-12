#!/usr/bin/env node
/**
 * Resonara release-qualification render farm.
 *
 * Usage:
 *   node scripts/render-farm.js run --manifest farm-output/catalog/manifest.json
 *   node scripts/render-farm.js cancel
 *   node scripts/render-farm.js status
 *   node scripts/render-farm.js expand-catalog  # write catalog job manifest
 *   node scripts/render-farm.js expand-matrix   # write matrix job manifest
 *   node scripts/render-farm.js expand-smoke    # 4-job mini matrix
 *
 * Status surface: GET http://127.0.0.1:$FARM_STATUS_PORT/farm/status
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FARM_ROOT = path.join(ROOT, 'farm-output');
const LOCK_PATH = path.join(FARM_ROOT, 'farm.lock');
const DEFAULT_CONCURRENCY = 3;
const APP_PORT = Number(process.env.FARM_PORT || process.env.PORT || 3860);
const STATUS_PORT = Number(process.env.FARM_STATUS_PORT || 3861);
const POLL_MS = Number(process.env.FARM_POLL_MS || 800);
const JOB_TIMEOUT_MS = Number(process.env.FARM_JOB_TIMEOUT_MS || 30 * 60 * 1000);

// ── pure helpers (unit-tested) ────────────────────────────────────────────

/**
 * Slice queue into waves of size concurrency (for documentation/tests).
 * Actual runner uses a live pool; this validates the cap math.
 */
function sliceQueue(jobs, concurrency) {
  const n = Math.max(1, concurrency | 0);
  const waves = [];
  for (let i = 0; i < jobs.length; i += n) {
    waves.push(jobs.slice(i, i + n));
  }
  return waves;
}

/**
 * Concurrency pool: never exceeds N in-flight.
 * runOne(job) => Promise<result>
 */
async function runWithConcurrency(jobs, concurrency, runOne, hooks = {}) {
  const n = Math.max(1, concurrency | 0);
  const queue = jobs.slice();
  const results = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const inflightIds = new Set();

  return new Promise((resolve, reject) => {
    let settled = false;
    let idx = 0;

    function maybeDone() {
      if (settled) return;
      if (idx >= jobs.length && inFlight === 0) {
        settled = true;
        resolve({ results, maxInFlight });
      }
    }

    function launch() {
      while (inFlight < n && idx < jobs.length) {
        const job = jobs[idx++];
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        inflightIds.add(job.id);
        if (hooks.onStart) hooks.onStart(job, { inFlight, maxInFlight });
        Promise.resolve()
          .then(() => runOne(job))
          .then((res) => {
            results.push(res);
            inFlight--;
            inflightIds.delete(job.id);
            if (hooks.onDone) hooks.onDone(job, res, { inFlight });
            launch();
            maybeDone();
          })
          .catch((err) => {
            inFlight--;
            inflightIds.delete(job.id);
            const res = {
              id: job.id,
              status: 'failed',
              error: err && err.message ? err.message : String(err),
            };
            results.push(res);
            if (hooks.onDone) hooks.onDone(job, res, { inFlight });
            launch();
            maybeDone();
          });
      }
      maybeDone();
    }

    if (!jobs.length) {
      resolve({ results: [], maxInFlight: 0 });
      return;
    }
    launch();
  });
}

/**
 * PID lock helpers.
 * isPidAlive can be injected for tests.
 */
function readLock(lockPath = LOCK_PATH) {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8').trim();
    const pid = parseInt(raw, 10);
    if (!Number.isFinite(pid)) return null;
    return { pid, path: lockPath };
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire lock. Returns { ok, stale, refused, pid }.
 * If another live PID holds lock → refused.
 * If stale PID → take over with warning.
 */
function acquireLock(lockPath = LOCK_PATH, myPid = process.pid, aliveFn = isPidAlive) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const existing = readLock(lockPath);
  if (existing && existing.pid !== myPid) {
    if (aliveFn(existing.pid)) {
      return { ok: false, refused: true, stale: false, pid: existing.pid };
    }
    // stale
    fs.writeFileSync(lockPath, String(myPid), 'utf8');
    return { ok: true, refused: false, stale: true, pid: myPid, previousPid: existing.pid };
  }
  fs.writeFileSync(lockPath, String(myPid), 'utf8');
  return { ok: true, refused: false, stale: false, pid: myPid };
}

function releaseLock(lockPath = LOCK_PATH, myPid = process.pid) {
  const existing = readLock(lockPath);
  if (existing && existing.pid === myPid) {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* */
    }
    return true;
  }
  // If lock is ours by content mismatch but file empty, still try
  if (!existing) return true;
  return false;
}

/**
 * Cancel cleanup plan (pure): given inFlight jobs + partial paths, return actions.
 */
function planCancelCleanup(state, opts = {}) {
  const partials = [];
  const childPids = [];
  if (state && state.jobs) {
    for (const [id, j] of Object.entries(state.jobs)) {
      if (j.status === 'running' || j.status === 'queued') {
        if (j.outPath) partials.push(j.outPath);
        if (j.childPids) childPids.push(...j.childPids);
      }
    }
  }
  if (state && state.inFlight) {
    for (const id of state.inFlight) {
      const j = state.jobs && state.jobs[id];
      if (j && j.outPath && !partials.includes(j.outPath)) partials.push(j.outPath);
    }
  }
  if (opts.extraPartials) partials.push(...opts.extraPartials);
  if (opts.extraChildPids) childPids.push(...opts.extraChildPids);
  return {
    status: 'CANCELLED',
    partialsToDelete: [...new Set(partials)],
    childPidsToKill: [...new Set(childPids.filter(Boolean))],
    releaseLock: true,
  };
}

function emptyState(batch, total, concurrency) {
  const now = new Date().toISOString();
  return {
    status: 'RUNNING',
    batch: batch || 'farm',
    total,
    done: 0,
    failed: 0,
    inFlight: [],
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    concurrency,
    throughput: [{ t: now, done: 0 }],
    jobs: {},
    appPort: APP_PORT,
    statusPort: STATUS_PORT,
  };
}

function writeState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

// ── process / port helpers ────────────────────────────────────────────────

function freePort(port) {
  try {
    const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true`, {
      encoding: 'utf8',
    }).trim();
    if (!out) return [];
    const pids = out.split(/\s+/).filter(Boolean);
    for (const p of pids) {
      try {
        process.kill(Number(p), 'SIGTERM');
      } catch {
        /* */
      }
    }
    // brief grace then KILL
    try {
      execSync('sleep 0.3', { stdio: 'ignore' });
    } catch {
      /* */
    }
    for (const p of pids) {
      try {
        process.kill(Number(p), 'SIGKILL');
      } catch {
        /* */
      }
    }
    return pids;
  } catch {
    return [];
  }
}

function httpRequest(method, port, urlPath, body, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: data
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data),
            }
          : {},
        timeout: timeoutMs,
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
              resolve({ status: res.statusCode, body: buf.toString('utf8'), raw: buf });
            }
          } else {
            resolve({ status: res.statusCode, body: buf, raw: buf });
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout ${method} ${urlPath}`));
    });
    if (data) req.write(data);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealth(port, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await httpRequest('GET', port, '/health', null, 3000);
      if (r.status === 200) return r.body;
    } catch {
      /* retry */
    }
    await sleep(300);
  }
  throw new Error(`health timeout on :${port}`);
}

function startLiteServer(port) {
  freePort(port);
  const logPath = path.join(FARM_ROOT, 'lite-server.log');
  fs.mkdirSync(FARM_ROOT, { recursive: true });
  const env = {
    ...process.env,
    RESONARA_LITE: '1',
    PORT: String(port),
    PIPER_PATH: process.env.PIPER_PATH || path.join(ROOT, 'tools/piper-venv/bin/piper'),
    PIPER_MODELS_DIR:
      process.env.PIPER_MODELS_DIR || path.join(ROOT, 'resources/piper/models'),
  };
  const child = spawn('node', [path.join(ROOT, 'dist/main.js')], {
    cwd: ROOT,
    env,
    detached: true,
    stdio: ['ignore', fs.openSync(logPath, 'a'), fs.openSync(logPath, 'a')],
  });
  child.unref();
  const pidPath = path.join(FARM_ROOT, 'lite-server.pid');
  fs.writeFileSync(pidPath, String(child.pid), 'utf8');
  return { pid: child.pid, logPath, pidPath };
}

async function ensureServer(port) {
  try {
    const r = await httpRequest('GET', port, '/health', null, 2000);
    if (r.status === 200) return { reused: true };
  } catch {
    /* boot */
  }
  const boot = startLiteServer(port);
  await waitHealth(port, 90000);
  return { reused: false, ...boot };
}

// ── status server ─────────────────────────────────────────────────────────

function startStatusServer(statePath, port = STATUS_PORT) {
  const server = http.createServer((req, res) => {
    if (req.url === '/farm/status' || req.url === '/farm/status/') {
      try {
        const raw = fs.readFileSync(statePath, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(raw);
      } catch (e) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'state unavailable', message: e.message }));
      }
      return;
    }
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'farm-status' }));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  freePort(port);
  server.listen(port, '127.0.0.1');
  return server;
}

// ── job execution ─────────────────────────────────────────────────────────

async function runOneJob(job, port, state, statePath, logStream) {
  const started = Date.now();
  state.jobs[job.id] = {
    status: 'running',
    outPath: job.outPath,
    engine: job.engine,
    language: job.language,
    profile: job.profile,
    docId: job.docId,
    startedAt: new Date().toISOString(),
  };
  if (!state.inFlight.includes(job.id)) state.inFlight.push(job.id);
  writeState(statePath, state);

  try {
    const textPath = path.isAbsolute(job.textPath)
      ? job.textPath
      : path.join(ROOT, job.textPath);
    const text = fs.readFileSync(textPath, 'utf8');
    const body = {
      text,
      engine: job.engine || 'auto',
      language: job.language || 'auto',
      pauseProfile: job.profile || 'audiobook',
      format: job.format || 'wav',
      title: job.id,
      qa: job.qa || 'off',
    };
    if (job.voice) body.voice = job.voice;

    const create = await httpRequest('POST', port, '/tts/synthesize', body, 30000);
    if (create.status >= 400 || !create.body || !create.body.id) {
      throw new Error(
        `synthesize failed status=${create.status} body=${JSON.stringify(create.body).slice(0, 300)}`,
      );
    }
    const jobId = create.body.id;
    state.jobs[job.id].ttsJobId = jobId;
    writeState(statePath, state);

    // Poll until complete/failed
    let publicJob = create.body;
    const deadline = Date.now() + JOB_TIMEOUT_MS;
    while (
      publicJob.status !== 'completed' &&
      publicJob.status !== 'failed' &&
      publicJob.status !== 'cancelled'
    ) {
      if (Date.now() > deadline) throw new Error(`job timeout ${jobId}`);
      await sleep(POLL_MS);
      const poll = await httpRequest('GET', port, `/tts/jobs/${jobId}`, null, 15000);
      publicJob = poll.body;
      if (!publicJob) throw new Error('empty poll body');
    }

    if (publicJob.status !== 'completed') {
      throw new Error(`tts job ${jobId} status=${publicJob.status} err=${publicJob.error || ''}`);
    }

    // Collect audio: prefer local copy when lite server wrote outputPath on this host
    // (HTTP download buffers entire body — fails for >~2GB Node Buffer limit on soak novels).
    fs.mkdirSync(path.dirname(job.outPath), { recursive: true });
    let bytes = 0;
    const localOut =
      publicJob.outputPath &&
      typeof publicJob.outputPath === 'string' &&
      fs.existsSync(publicJob.outputPath)
        ? publicJob.outputPath
        : null;
    if (localOut) {
      fs.copyFileSync(localOut, job.outPath);
      bytes = fs.statSync(job.outPath).size;
    } else {
      const dlTimeout = Number(process.env.FARM_DOWNLOAD_TIMEOUT_MS || 30 * 60 * 1000);
      const dl = await httpRequest('GET', port, `/tts/jobs/${jobId}/download`, null, dlTimeout);
      if (dl.status >= 400 || !dl.raw || !dl.raw.length) {
        throw new Error(`download failed status=${dl.status}`);
      }
      fs.writeFileSync(job.outPath, dl.raw);
      bytes = dl.raw.length;
    }

    const ms = Date.now() - started;
    const durationSec =
      publicJob.durationSec ||
      publicJob.duration ||
      publicJob.metadata?.durationSec ||
      null;
    const rtf =
      durationSec && durationSec > 0 ? ms / 1000 / durationSec : null;

    const result = {
      id: job.id,
      status: 'ok',
      ms,
      bytes,
      rtf,
      durationSec,
      ttsJobId: jobId,
      outPath: job.outPath,
      engine: job.engine,
      language: job.language,
      profile: job.profile,
      docId: job.docId,
    };

    state.jobs[job.id] = { ...state.jobs[job.id], ...result, status: 'ok' };
    state.done += 1;
    state.inFlight = state.inFlight.filter((x) => x !== job.id);
    state.throughput.push({ t: new Date().toISOString(), done: state.done });
    writeState(statePath, state);

    if (logStream) {
      logStream.write(JSON.stringify(result) + '\n');
    }
    return result;
  } catch (err) {
    const ms = Date.now() - started;
    // delete partial
    try {
      if (job.outPath && fs.existsSync(job.outPath)) fs.unlinkSync(job.outPath);
    } catch {
      /* */
    }
    const result = {
      id: job.id,
      status: 'failed',
      ms,
      error: err && err.message ? err.message : String(err),
      outPath: job.outPath,
      engine: job.engine,
      language: job.language,
      profile: job.profile,
      docId: job.docId,
    };
    state.jobs[job.id] = { ...state.jobs[job.id], ...result, status: 'failed' };
    state.failed += 1;
    state.done += 1;
    state.inFlight = state.inFlight.filter((x) => x !== job.id);
    state.throughput.push({ t: new Date().toISOString(), done: state.done });
    writeState(statePath, state);
    if (logStream) logStream.write(JSON.stringify(result) + '\n');
    return result;
  }
}

// ── expand manifests ──────────────────────────────────────────────────────

function loadCorpusManifest() {
  const p = path.join(ROOT, 'samples/catalog/manifest.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function listAvailableEngines(port) {
  try {
    const r = await httpRequest('GET', port, '/tts/engines', null, 5000);
    const engines = (r.body && r.body.engines) || [];
    return engines.filter((e) => e.available).map((e) => e.id);
  } catch {
    return ['platform'];
  }
}

function bestEngineFor(lang, available) {
  // Prefer piper when available, else platform
  if (available.includes('piper')) return 'piper';
  if (available.includes('kokoro') && lang === 'en') return 'kokoro';
  if (available.includes('platform')) return 'platform';
  return available[0] || 'platform';
}

function expandCatalogJobs(availableEngines, outDir) {
  const corpus = loadCorpusManifest();
  const docs = corpus.documents.filter((d) => !d.soak);
  const jobs = [];
  for (const d of docs) {
    const engine = bestEngineFor(d.language, availableEngines);
    const id = `${d.id}__${engine}__audiobook`;
    jobs.push({
      id,
      docId: d.id,
      engine,
      language: d.language,
      profile: 'audiobook',
      textPath: d.path,
      outPath: path.join(outDir, `${id}.wav`),
    });
  }
  return {
    version: 1,
    name: 'catalog',
    concurrency: DEFAULT_CONCURRENCY,
    jobs,
  };
}

function expandMatrixJobs(availableEngines, outDir) {
  const corpus = loadCorpusManifest();
  // Representative 6-doc subset
  const pickIds = [
    'en-short-article',
    'en-news',
    'en-dialogue-script',
    'en-numbers-and-dates',
    'pt-artigo',
    'pt-dialogo',
  ];
  const docs = pickIds
    .map((id) => corpus.documents.find((d) => d.id === id))
    .filter(Boolean);
  const profiles = ['audiobook', 'podcast', 'news'];
  const engines = availableEngines.length ? availableEngines : ['platform'];
  const jobs = [];
  for (const d of docs) {
    for (const engine of engines) {
      for (const profile of profiles) {
        const id = `${d.id}__${engine}__${profile}`;
        jobs.push({
          id,
          docId: d.id,
          engine,
          language: d.language,
          profile,
          textPath: d.path,
          outPath: path.join(outDir, `${id}.wav`),
        });
      }
    }
  }
  return {
    version: 1,
    name: 'matrix',
    concurrency: DEFAULT_CONCURRENCY,
    jobs,
  };
}

function expandSmokeJobs(availableEngines, outDir) {
  const corpus = loadCorpusManifest();
  const engine = bestEngineFor('en', availableEngines);
  const picks = ['en-quick-sentence', 'en-paragraph', 'pt-paragrafo', 'en-numbers-and-dates'];
  const jobs = picks.map((id) => {
    const d = corpus.documents.find((x) => x.id === id);
    const jid = `smoke-${id}__${engine}__audiobook`;
    return {
      id: jid,
      docId: id,
      engine,
      language: d ? d.language : 'en',
      profile: 'audiobook',
      textPath: d ? d.path : `samples/catalog/${id}.txt`,
      outPath: path.join(outDir, `${jid}.wav`),
    };
  });
  return { version: 1, name: 'smoke', concurrency: 2, jobs };
}

function expandSoakJob(availableEngines, outDir) {
  const engine = bestEngineFor('en', availableEngines);
  const id = `soak-novel__${engine}__audiobook`;
  return {
    version: 1,
    name: 'soak',
    concurrency: 1,
    jobs: [
      {
        id,
        docId: 'soak-novel',
        engine,
        language: 'en',
        profile: 'audiobook',
        textPath: 'samples/catalog/soak-novel.txt',
        outPath: path.join(outDir, `${id}.wav`),
      },
    ],
  };
}

// ── main run ──────────────────────────────────────────────────────────────

async function runFarm(manifestPath, opts = {}) {
  fs.mkdirSync(FARM_ROOT, { recursive: true });
  const lock = acquireLock(LOCK_PATH, process.pid);
  if (!lock.ok) {
    console.error(
      JSON.stringify({
        error: 'farm already running',
        pid: lock.pid,
        lock: LOCK_PATH,
      }),
    );
    process.exit(2);
  }
  if (lock.stale) {
    console.warn(
      JSON.stringify({
        warning: 'stale lock taken over',
        previousPid: lock.previousPid,
      }),
    );
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const concurrency = opts.concurrency || manifest.concurrency || DEFAULT_CONCURRENCY;
  const batch = manifest.name || 'farm';
  const batchDir = path.join(FARM_ROOT, batch);
  fs.mkdirSync(batchDir, { recursive: true });
  const statePath = path.join(batchDir, 'state.json');
  // Also symlink/copy path for await-farm default
  const primaryState = path.join(FARM_ROOT, 'state.json');

  const state = emptyState(batch, manifest.jobs.length, concurrency);
  state.manifestPath = manifestPath;
  writeState(statePath, state);
  writeState(primaryState, state);

  // Track children for cancel
  const tracked = { statusServer: null, cancelled: false };

  const onSignal = () => {
    tracked.cancelled = true;
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);

  let logStream;
  try {
    // Reap stale app port, boot server
    freePort(APP_PORT);
    freePort(STATUS_PORT);
    await ensureServer(APP_PORT);

    tracked.statusServer = startStatusServer(statePath, STATUS_PORT);
    // Mirror state to primary path on each write via wrapper
    const origWrite = writeState;
    // monkey: after each writeState to statePath also copy
    const mirror = (sp, st) => {
      origWrite(sp, st);
      if (sp === statePath) {
        try {
          fs.writeFileSync(primaryState, JSON.stringify(st, null, 2) + '\n');
        } catch {
          /* */
        }
      }
    };
    // use mirror below

    logStream = fs.createWriteStream(path.join(batchDir, 'log.jsonl'), { flags: 'a' });

    const jobs = manifest.jobs.map((j) => ({
      ...j,
      outPath: path.isAbsolute(j.outPath) ? j.outPath : path.join(ROOT, j.outPath),
    }));

    // Seed job records
    for (const j of jobs) {
      state.jobs[j.id] = {
        status: 'queued',
        outPath: j.outPath,
        engine: j.engine,
        language: j.language,
        profile: j.profile,
        docId: j.docId,
      };
    }
    mirror(statePath, state);

    const { results, maxInFlight } = await runWithConcurrency(
      jobs,
      concurrency,
      async (job) => {
        if (tracked.cancelled) {
          return {
            id: job.id,
            status: 'cancelled',
            error: 'farm cancelled',
          };
        }
        return runOneJob(job, APP_PORT, state, statePath, logStream).then((r) => {
          // mirror after job
          try {
            fs.writeFileSync(primaryState, JSON.stringify(state, null, 2) + '\n');
          } catch {
            /* */
          }
          return r;
        });
      },
      {
        onStart: (job) => {
          console.log(JSON.stringify({ event: 'job-start', id: job.id }));
        },
        onDone: (job, res) => {
          console.log(
            JSON.stringify({
              event: 'job-done',
              id: job.id,
              status: res.status,
              ms: res.ms,
              bytes: res.bytes,
            }),
          );
        },
      },
    );

    if (tracked.cancelled) {
      const plan = planCancelCleanup(state);
      for (const p of plan.partialsToDelete) {
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {
          /* */
        }
      }
      state.status = 'CANCELLED';
      state.completedAt = new Date().toISOString();
      mirror(statePath, state);
    } else {
      state.status = 'COMPLETE';
      state.completedAt = new Date().toISOString();
      state.maxInFlight = maxInFlight;
      mirror(statePath, state);
    }

    console.log(
      JSON.stringify({
        event: 'farm-finished',
        status: state.status,
        total: state.total,
        done: state.done,
        failed: state.failed,
        maxInFlight,
        statePath,
        statusUrl: `http://127.0.0.1:${STATUS_PORT}/farm/status`,
      }),
    );

    return { state, results, maxInFlight };
  } finally {
    if (logStream) logStream.end();
    if (tracked.statusServer) {
      try {
        tracked.statusServer.close();
      } catch {
        /* */
      }
    }
    releaseLock(LOCK_PATH, process.pid);
    process.removeListener('SIGTERM', onSignal);
    process.removeListener('SIGINT', onSignal);
  }
}

function cancelFarm() {
  const lock = readLock(LOCK_PATH);
  const batchDirs = ['catalog', 'matrix', 'smoke', 'soak', 'scratch']
    .map((b) => path.join(FARM_ROOT, b, 'state.json'))
    .concat([path.join(FARM_ROOT, 'state.json')]);

  let state = null;
  let statePath = null;
  for (const sp of batchDirs) {
    try {
      const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
      if (s.status === 'RUNNING') {
        state = s;
        statePath = sp;
        break;
      }
    } catch {
      /* */
    }
  }

  const plan = planCancelCleanup(state || { jobs: {}, inFlight: [] });

  // Kill farm PID
  const killed = [];
  if (lock && isPidAlive(lock.pid)) {
    try {
      process.kill(lock.pid, 'SIGTERM');
      killed.push(lock.pid);
    } catch {
      /* */
    }
    try {
      execSync('sleep 0.5', { stdio: 'ignore' });
    } catch {
      /* */
    }
    if (isPidAlive(lock.pid)) {
      try {
        process.kill(lock.pid, 'SIGKILL');
      } catch {
        /* */
      }
    }
  }

  // Kill tracked children + common orphans on farm ports
  for (const pid of plan.childPidsToKill) {
    try {
      process.kill(pid, 'SIGTERM');
      killed.push(pid);
    } catch {
      /* */
    }
  }

  // Reap lite server if we own it
  try {
    const litePid = parseInt(fs.readFileSync(path.join(FARM_ROOT, 'lite-server.pid'), 'utf8'), 10);
    if (isPidAlive(litePid)) {
      process.kill(litePid, 'SIGTERM');
      killed.push(litePid);
    }
  } catch {
    /* */
  }

  freePort(STATUS_PORT);

  for (const p of plan.partialsToDelete) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* */
    }
  }

  if (state && statePath) {
    state.status = 'CANCELLED';
    state.completedAt = new Date().toISOString();
    state.inFlight = [];
    writeState(statePath, state);
    try {
      writeState(path.join(FARM_ROOT, 'state.json'), state);
    } catch {
      /* */
    }
  }

  releaseLock(LOCK_PATH, lock ? lock.pid : process.pid);
  // Force-remove lock
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {
    /* */
  }

  const result = {
    event: 'cancel',
    killed,
    partialsDeleted: plan.partialsToDelete,
    statePath,
    status: 'CANCELLED',
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function printStatus() {
  const candidates = [
    path.join(FARM_ROOT, 'state.json'),
    path.join(FARM_ROOT, 'catalog/state.json'),
    path.join(FARM_ROOT, 'matrix/state.json'),
    path.join(FARM_ROOT, 'smoke/state.json'),
    path.join(FARM_ROOT, 'soak/state.json'),
  ];
  for (const p of candidates) {
    try {
      const s = JSON.parse(fs.readFileSync(p, 'utf8'));
      console.log(JSON.stringify({ statePath: p, ...s }, null, 2));
      return s;
    } catch {
      /* */
    }
  }
  console.log(JSON.stringify({ error: 'no state.json found' }));
  return null;
}

// ── CLI ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'status';

  if (cmd === 'cancel') {
    cancelFarm();
    return;
  }
  if (cmd === 'status') {
    printStatus();
    return;
  }

  if (cmd === 'expand-catalog' || cmd === 'expand-matrix' || cmd === 'expand-smoke' || cmd === 'expand-soak') {
    // Need engines — try live, else platform
    let engines = ['platform'];
    try {
      await ensureServer(APP_PORT);
      engines = await listAvailableEngines(APP_PORT);
    } catch {
      engines = ['platform'];
      if (fs.existsSync(path.join(ROOT, 'tools/piper-venv/bin/piper'))) {
        engines = ['piper', 'platform'];
      }
    }
    const name = cmd.replace('expand-', '');
    const outDir = path.join(FARM_ROOT, name);
    fs.mkdirSync(outDir, { recursive: true });
    let manifest;
    if (name === 'catalog') manifest = expandCatalogJobs(engines, outDir);
    else if (name === 'matrix') manifest = expandMatrixJobs(engines, outDir);
    else if (name === 'soak') manifest = expandSoakJob(engines, outDir);
    else manifest = expandSmokeJobs(engines, outDir);
    const mp = path.join(outDir, 'manifest.json');
    fs.writeFileSync(mp, JSON.stringify(manifest, null, 2) + '\n');
    console.log(
      JSON.stringify(
        { ok: true, name, jobs: manifest.jobs.length, engines, manifestPath: mp },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === 'run') {
    let manifestPath = null;
    let concurrency = null;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--manifest') manifestPath = args[++i];
      else if (args[i] === '--concurrency') concurrency = Number(args[++i]);
    }
    if (!manifestPath) {
      console.error('usage: render-farm.js run --manifest <path>');
      process.exit(1);
    }
    if (!path.isAbsolute(manifestPath)) manifestPath = path.join(ROOT, manifestPath);
    await runFarm(manifestPath, { concurrency });
    return;
  }

  console.error('unknown command', cmd);
  process.exit(1);
}

module.exports = {
  sliceQueue,
  runWithConcurrency,
  readLock,
  acquireLock,
  releaseLock,
  isPidAlive,
  planCancelCleanup,
  emptyState,
  expandCatalogJobs,
  expandMatrixJobs,
  expandSmokeJobs,
  expandSoakJob,
  bestEngineFor,
  APP_PORT,
  STATUS_PORT,
  LOCK_PATH,
  FARM_ROOT,
  DEFAULT_CONCURRENCY,
};

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    try {
      releaseLock(LOCK_PATH, process.pid);
    } catch {
      /* */
    }
    process.exit(1);
  });
}
