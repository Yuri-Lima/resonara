#!/usr/bin/env node
/**
 * Measurement aggregator for farm outputs.
 * Produces farm-metrics.json + farm-metrics.md with WER, pause conformance,
 * prosody (when available), duration, RTF.
 *
 * Usage:
 *   node scripts/farm-measure.js --batch catalog
 *   node scripts/farm-measure.js --batch matrix --concurrency 2
 *   node scripts/farm-measure.js --self-test
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FARM_ROOT = path.join(ROOT, 'farm-output');

// ── aggregation math (unit-tested) ────────────────────────────────────────

function mean(nums) {
  const a = nums.filter((n) => n != null && Number.isFinite(n));
  if (!a.length) return null;
  return a.reduce((s, x) => s + x, 0) / a.length;
}

/**
 * Resolve the engine that actually produced the audio.
 *
 * Prefer retryEngine / actualEngine (what ran) over engine (planned cell),
 * then fall back to a bare engine field. NEVER parse the job id/filename —
 * cell ids like `en-numbers-and-dates__piper__audiobook` can be re-rendered
 * with engine=platform after a transient failure, and aggregating those under
 * piper falsifies byEngine and the matrix gate.
 */
function resolveActualEngine(jobMeta) {
  if (!jobMeta || typeof jobMeta !== 'object') return 'unknown';
  if (jobMeta.retryEngine) return String(jobMeta.retryEngine);
  if (jobMeta.actualEngine) return String(jobMeta.actualEngine);
  if (jobMeta.engine) return String(jobMeta.engine);
  return 'unknown';
}

/**
 * Normalize a measured/job row so `engine` reflects the actual render engine.
 * Mutates and returns the row for convenience.
 */
function applyActualEngine(row) {
  if (!row || typeof row !== 'object') return row;
  row.engine = resolveActualEngine(row);
  return row;
}

function aggregateRows(rows) {
  // Re-key engine off actual render metadata before grouping — never trust id.
  const normalized = rows.map((r) => {
    const copy = { ...r };
    applyActualEngine(copy);
    return copy;
  });
  const ok = normalized.filter((r) => r.status === 'ok' || r.status === 'measured');
  const failed = normalized.filter((r) => r.status === 'failed');
  const measuredWerRows = ok.filter((r) => r.wer != null && !r.werIsProxy);
  const proxyWerRows = ok.filter((r) => r.wer != null && r.werIsProxy);
  const realPauseRows = ok.filter(
    (r) => r.pauseConformance != null && r.method && r.method.pause === 'pause-probe-profile-band',
  );
  const proxyPauseRows = ok.filter(
    (r) =>
      r.pauseConformance != null &&
      r.method &&
      r.method.pause &&
      r.method.pause !== 'pause-probe-profile-band',
  );
  return {
    total: normalized.length,
    measured: ok.length,
    failed: failed.length,
    // meanWer prefers measured ASR WER; falls back to all rows (incl. proxy) only if none measured
    meanWer: mean(measuredWerRows.length ? measuredWerRows.map((r) => r.wer) : ok.map((r) => r.wer)),
    meanWerMeasured: mean(measuredWerRows.map((r) => r.wer)),
    meanWerProxy: mean(proxyWerRows.map((r) => r.wer)),
    measuredWerCount: measuredWerRows.length,
    proxyWerCount: proxyWerRows.length,
    meanConformance: mean(ok.map((r) => r.pauseConformance)),
    meanConformanceReal: mean(realPauseRows.map((r) => r.pauseConformance)),
    realPauseCount: realPauseRows.length,
    proxyPauseCount: proxyPauseRows.length,
    meanRtf: mean(ok.map((r) => r.rtf)),
    meanDurationSec: mean(ok.map((r) => r.durationSec)),
    meanF0Variance: mean(ok.map((r) => r.f0Variance)),
    meanSpeechRate: mean(ok.map((r) => r.speechRate)),
    invalidAudio: normalized.filter((r) => r.validAudio === false).length,
    byEngine: groupBy(ok, 'engine'),
    byProfile: groupBy(ok, 'profile'),
    byContentType: groupBy(ok, 'contentType'),
    byLanguage: groupBy(ok, 'language'),
  };
}

function groupBy(rows, key) {
  const map = {};
  for (const r of rows) {
    const k = r[key] || 'unknown';
    if (!map[k]) map[k] = [];
    map[k].push(r);
  }
  const out = {};
  for (const [k, list] of Object.entries(map)) {
    out[k] = {
      n: list.length,
      meanWer: mean(list.map((r) => r.wer)),
      meanConformance: mean(list.map((r) => r.pauseConformance)),
      meanRtf: mean(list.map((r) => r.rtf)),
    };
  }
  return out;
}

/**
 * Recommend engine+profile per content type from measured rows.
 * Score = low WER + high conformance + reasonable RTF.
 */
function recommendDefaults(rows) {
  const byCt = {};
  for (const r of rows) {
    if (r.status === 'failed' || r.validAudio === false) continue;
    const ct = r.contentType || 'unknown';
    if (!byCt[ct]) byCt[ct] = [];
    byCt[ct].push(r);
  }
  const recs = {};
  for (const [ct, list] of Object.entries(byCt)) {
    let best = null;
    let bestScore = -Infinity;
    for (const r of list) {
      const wer = r.wer != null ? r.wer : 0.5;
      const conf = r.pauseConformance != null ? r.pauseConformance : 0.5;
      const rtf = r.rtf != null ? r.rtf : 3;
      // Higher is better
      const score = (1 - Math.min(1, wer)) * 0.5 + conf * 0.35 + (1 / (1 + rtf)) * 0.15;
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    if (best) {
      recs[ct] = {
        engine: best.engine,
        profile: best.profile,
        language: best.language,
        score: bestScore,
        wer: best.wer,
        pauseConformance: best.pauseConformance,
        rtf: best.rtf,
        jobId: best.id,
      };
    }
  }
  return recs;
}

function validateAudioHeader(buf) {
  if (!buf || buf.length < 12) return false;
  // WAV: RIFF....WAVE
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    return buf.slice(8, 12).toString('ascii') === 'WAVE';
  }
  // AIFF
  if (buf.slice(0, 4).toString('ascii') === 'FORM') return true;
  // MP3 ID3 or frame sync
  if (buf.slice(0, 3).toString('ascii') === 'ID3') return true;
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
  return buf.length > 1000; // permissive for exotic containers
}

// ── WER helpers (mirror src/tts/qa/wer when dist available) ───────────────

/**
 * Strip SSML/XML/markdown markup so WER compares spoken content, not tags.
 * (Pin: en-ssml-showcase raw ref WER≈0.62 was dominated by <speak>/<break> tokens.)
 */
function stripMarkupForWer(s) {
  let t = String(s || '');
  // <sub alias="spoken">written</sub> → spoken form
  t = t.replace(/<sub\b[^>]*\balias\s*=\s*["']([^"']+)["'][^>]*>[^<]*<\/sub>/gi, ' $1 ');
  // <break .../> and other empty tags
  t = t.replace(/<break\b[^>]*\/?>/gi, ' ');
  // Generic SSML/XML tags
  t = t.replace(/<\/?[^>]+>/g, ' ');
  // Markdown headings / horizontal rules
  t = t.replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/^---+\s*$/gm, ' ');
  return t;
}

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRefForWer(s) {
  return normalizeText(stripMarkupForWer(s));
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function wordErrorRate(ref, hyp) {
  const r = normalizeRefForWer(ref).split(' ').filter(Boolean);
  const h = normalizeText(hyp).split(' ').filter(Boolean);
  if (!r.length) return h.length ? 1 : 0;
  return levenshtein(r, h) / r.length;
}

// Try to load dist wer if present
function loadWerLib() {
  try {
    return require('../dist/tts/qa/wer');
  } catch {
    return { wordErrorRate, normalizeForWer: normalizeText };
  }
}

// ── measurement of one output ─────────────────────────────────────────────

function probeDurationSec(audioPath) {
  try {
    const r = spawnSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audioPath],
      { encoding: 'utf8' },
    );
    const d = parseFloat(r.stdout.trim());
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}

/**
 * Legacy silencedetect heuristic — kept only as explicit fallback when
 * FARM_MEASURE_PAUSE_PROXY=1. Never the default gate path.
 */
function estimatePauseConformanceLegacy(audioPath) {
  try {
    const r = spawnSync(
      'ffmpeg',
      ['-i', audioPath, '-af', 'silencedetect=noise=-35dB:d=0.15', '-f', 'null', '-'],
      { encoding: 'utf8' },
    );
    const err = (r.stderr || '') + (r.stdout || '');
    const starts = (err.match(/silence_start/g) || []).length;
    const ends = (err.match(/silence_end/g) || []).length;
    if (starts === 0 && ends === 0) {
      return 0.92;
    }
    const pairs = Math.min(starts, ends);
    const ratio = pairs / Math.max(starts, ends, 1);
    return Math.max(0, Math.min(1, 0.7 + 0.3 * ratio));
  } catch {
    return null;
  }
}

function loadPauseProbe() {
  try {
    return require('./pause-probe');
  } catch {
    return null;
  }
}

/**
 * Real profile-band pause conformance via pause-probe harness.
 * Falls back to legacy only when FARM_MEASURE_PAUSE_PROXY=1.
 */
function measurePauseConformance(audioPath, refText, profile) {
  if (process.env.FARM_MEASURE_PAUSE_PROXY === '1') {
    return {
      pauseConformance: estimatePauseConformanceLegacy(audioPath),
      method: 'ffmpeg-silencedetect',
      pauseIsProxy: true,
    };
  }
  const probe = loadPauseProbe();
  if (!probe || typeof probe.scoreProfileBandConformance !== 'function') {
    return {
      pauseConformance: null,
      method: 'pause-probe-unavailable',
      pauseIsProxy: true,
    };
  }
  const scored = probe.scoreProfileBandConformance(audioPath, refText || '', profile || 'audiobook');
  return {
    pauseConformance: scored.pauseConformance,
    method: scored.method || 'pause-probe-profile-band',
    pauseIsProxy: false,
    pauseDetail: {
      passed: scored.passed,
      totalBanded: scored.totalBanded,
      conformancePct: scored.conformancePct,
      note: scored.note,
    },
  };
}

function whisperPaths() {
  const bin = process.platform === 'win32' ? 'Scripts' : 'bin';
  const py = path.join(
    ROOT,
    'tools/whisper-venv',
    bin,
    process.platform === 'win32' ? 'python.exe' : 'python',
  );
  const helper = path.join(ROOT, 'tools/whisper/transcribe.py');
  const modelDir = path.join(ROOT, 'tools/whisper/models');
  return { py, helper, modelDir };
}

function whisperAvailable() {
  const { py, helper } = whisperPaths();
  return fs.existsSync(py) && fs.existsSync(helper);
}

/**
 * True ASR transcription via faster-whisper (tools/whisper/transcribe.py).
 * Requires FARM_MEASURE_WHISPER=1 and an installed whisper venv.
 */
function tryTranscribe(audioPath, language) {
  const { py, helper, modelDir } = whisperPaths();
  if (!fs.existsSync(py) || !fs.existsSync(helper)) {
    return { text: null, method: 'unavailable', offlineCapable: false };
  }
  if (process.env.FARM_MEASURE_WHISPER !== '1') {
    return { text: null, method: 'skipped' };
  }
  const model = process.env.FARM_MEASURE_WHISPER_MODEL || 'tiny';
  const langRaw = String(language || 'en');
  const lang = langRaw.toLowerCase().startsWith('pt') ? 'pt' : langRaw.toLowerCase().startsWith('en') ? 'en' : langRaw;
  try {
    const args = [
      helper,
      audioPath,
      '--model',
      model,
      '--language',
      lang,
      '--device',
      process.env.FARM_MEASURE_WHISPER_DEVICE || 'cpu',
      '--compute-type',
      process.env.FARM_MEASURE_WHISPER_COMPUTE || 'int8',
      '--no-word-timestamps',
    ];
    if (fs.existsSync(modelDir)) {
      args.push('--model-dir', modelDir);
    }
    const timeoutMs = Number(process.env.FARM_MEASURE_WHISPER_TIMEOUT_MS || 3_600_000);
    const r = spawnSync(py, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 64 << 20,
      env: {
        ...process.env,
        HF_HOME: modelDir,
        HUGGINGFACE_HUB_CACHE: path.join(modelDir, 'hub'),
        // Prefer offline after models are cached
        HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE || '1',
        TRANSFORMERS_OFFLINE: process.env.TRANSFORMERS_OFFLINE || '1',
      },
    });
    if (r.status === 0 && r.stdout) {
      try {
        const j = JSON.parse(r.stdout.trim().split('\n').filter(Boolean).pop());
        if (j.error) {
          return { text: null, method: 'whisper-error', error: j.error };
        }
        return {
          text: (j.text || '').trim(),
          method: `faster-whisper-${model}`,
          elapsedMs: j.elapsedMs,
          language: j.language,
        };
      } catch (e) {
        // Plain text fallback
        const text = r.stdout.trim();
        if (text) return { text, method: `faster-whisper-${model}-raw` };
        return { text: null, method: 'whisper-error', error: e.message };
      }
    }
    return {
      text: null,
      method: 'whisper-error',
      error: (r.stderr || r.stdout || 'whisper failed').slice(0, 500),
    };
  } catch (e) {
    return { text: null, method: 'whisper-error', error: e.message };
  }
}

async function measureOne(jobMeta, corpusDoc) {
  const outPath = jobMeta.outPath;
  const actualEngine = resolveActualEngine(jobMeta);
  const row = {
    id: jobMeta.id || jobMeta.docId,
    docId: jobMeta.docId,
    // Actual engine used for the WAV — never derived from id/filename.
    engine: actualEngine,
    language: jobMeta.language,
    profile: jobMeta.profile,
    contentType: corpusDoc ? corpusDoc.contentType : null,
    outPath,
    status: 'measured',
    wer: null,
    pauseConformance: null,
    f0Variance: null,
    speechRate: null,
    durationSec: null,
    rtf: jobMeta.rtf != null ? jobMeta.rtf : null,
    ms: jobMeta.ms,
    bytes: jobMeta.bytes,
    validAudio: false,
    method: {},
  };
  // Preserve retry provenance for audit (aggregator already keys off this).
  if (jobMeta.retryEngine) {
    row.retryEngine = jobMeta.retryEngine;
    row.plannedEngine = jobMeta.engine && jobMeta.engine !== actualEngine ? jobMeta.engine : undefined;
    if (jobMeta.retried != null) row.retried = jobMeta.retried;
  }

  if (!outPath || !fs.existsSync(outPath)) {
    row.status = 'failed';
    row.error = 'missing audio';
    return row;
  }

  const buf = fs.readFileSync(outPath);
  row.bytes = buf.length;
  row.validAudio = validateAudioHeader(buf) && buf.length > 100;
  if (!row.validAudio) {
    row.status = 'failed';
    row.error = 'invalid audio header';
    return row;
  }

  row.durationSec = probeDurationSec(outPath);
  if (row.durationSec && jobMeta.ms) {
    row.rtf = jobMeta.ms / 1000 / row.durationSec;
  }

  // Reference text (needed for both pause-band annotation and WER)
  let ref = '';
  if (corpusDoc) {
    const textPath = path.isAbsolute(corpusDoc.path)
      ? corpusDoc.path
      : path.join(ROOT, corpusDoc.path);
    try {
      ref = fs.readFileSync(textPath, 'utf8');
    } catch {
      /* */
    }
  }

  // REAL profile-band pause probe (not silencedetect constant)
  const pause = measurePauseConformance(outPath, ref, jobMeta.profile || 'audiobook');
  row.pauseConformance = pause.pauseConformance;
  row.method.pause = pause.method;
  row.pauseIsProxy = !!pause.pauseIsProxy;
  if (pause.pauseDetail) row.pauseDetail = pause.pauseDetail;

  // WER: true ASR when whisper enabled; otherwise explicit proxy (never presented as measured)
  if (corpusDoc) {
    if (jobMeta.qa && jobMeta.qa.aggregateWer != null && !jobMeta.qa.werIsProxy) {
      row.wer = jobMeta.qa.aggregateWer;
      row.method.wer = 'tts-job-qa';
      row.werIsProxy = false;
    } else {
      const tr = tryTranscribe(outPath, jobMeta.language || (corpusDoc && corpusDoc.language));
      row.method.wer = tr.method;
      if (tr.text && ref) {
        // Always strip SSML/markdown from reference before WER (spoken content only)
        const refSpoken = stripMarkupForWer(ref);
        row.wer = wordErrorRate(refSpoken, tr.text);
        row.werIsProxy = false;
        row.hypothesis = tr.text.slice(0, 500);
        if (tr.elapsedMs != null) row.whisperElapsedMs = tr.elapsedMs;
      } else if (ref && row.durationSec) {
        // Proxy: duration-density — NOT a real WER. Gate must not treat as measured.
        const words = ref.trim().split(/\s+/).length;
        const wps = words / Math.max(row.durationSec, 0.1);
        const proxy = Math.min(1, Math.abs(wps - 2.5) / 5);
        row.wer = proxy;
        row.method.wer = 'duration-density-proxy';
        row.werIsProxy = true;
        if (tr.method === 'unavailable') {
          row.method.werNote = 'whisper-unavailable-offline';
        } else if (tr.method === 'skipped') {
          row.method.werNote = 'FARM_MEASURE_WHISPER not set';
        } else if (tr.method === 'whisper-error') {
          row.method.werNote = tr.error || 'whisper-error';
          row.method.wer = 'duration-density-proxy';
        }
      } else {
        row.wer = null;
        row.werIsProxy = null;
        row.method.wer = tr.method || 'no-reference';
      }
    }
  }

  // Prosody optional
  try {
    const prosody = path.join(ROOT, 'scripts/prosody-metrics.js');
    if (fs.existsSync(prosody) && process.env.FARM_MEASURE_PROSODY === '1') {
      const r = spawnSync('node', [prosody, outPath], { encoding: 'utf8', timeout: 60000 });
      if (r.status === 0) {
        try {
          const j = JSON.parse(r.stdout);
          row.f0Variance = j.f0Variance ?? j.f0_var ?? null;
          row.speechRate = j.speechRate ?? j.speech_rate ?? null;
          row.method.prosody = 'prosody-metrics';
        } catch {
          /* */
        }
      }
    }
  } catch {
    /* */
  }

  return row;
}

async function runWithPool(items, concurrency, fn) {
  const n = Math.max(1, concurrency | 0);
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => worker()));
  return results;
}

async function measureBatch(batchName, opts = {}) {
  const batchDir = path.join(FARM_ROOT, batchName);
  const statePath = path.join(batchDir, 'state.json');
  const metricsPath = path.join(FARM_ROOT, 'metrics', `${batchName}-metrics.json`);
  const mdPath = path.join(FARM_ROOT, 'metrics', `${batchName}-metrics.md`);
  fs.mkdirSync(path.dirname(metricsPath), { recursive: true });

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const corpus = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'samples/catalog/manifest.json'), 'utf8'),
  );
  const byDoc = Object.fromEntries(corpus.documents.map((d) => [d.id, d]));

  // Prefer state.jobs fields; if log.jsonl carries retryEngine, merge it in so
  // resolveActualEngine sees the true render engine even when state.engine was
  // left as the planned cell engine.
  const logRetryById = {};
  const logPath = path.join(batchDir, 'log.jsonl');
  if (fs.existsSync(logPath)) {
    try {
      for (const line of fs.readFileSync(logPath, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const rec = JSON.parse(line);
          if (rec && rec.id && (rec.retryEngine || rec.actualEngine)) {
            logRetryById[rec.id] = {
              retryEngine: rec.retryEngine,
              actualEngine: rec.actualEngine,
              retried: rec.retried,
            };
          }
        } catch {
          /* skip bad line */
        }
      }
    } catch {
      /* log optional */
    }
  }

  let jobList = Object.entries(state.jobs || {}).map(([id, j]) => {
    const merged = { id, ...j, ...(logRetryById[id] || {}) };
    // Force engine field to actual before measureOne / aggregate.
    applyActualEngine(merged);
    return merged;
  });

  // Optional id filter
  if (opts.ids && opts.ids.length) {
    const want = new Set(opts.ids);
    jobList = jobList.filter((j) => want.has(j.id) || want.has(j.docId));
  }

  // Representative sample: ≥1 doc per content type × each engine present
  if (opts.sampleRepresentative) {
    jobList = selectRepresentativeSample(jobList, byDoc);
  }

  // Interleave by engine/content so partial progress is diverse & pollable
  if (opts.interleave !== false) {
    jobList = interleaveJobs(jobList, byDoc);
  }

  // Prefer shorter audio first within interleave buckets when duration known
  if (opts.shortFirst) {
    jobList = [...jobList].sort((a, b) => (a.bytes || 0) - (b.bytes || 0));
  }

  const progressPath = opts.progressPath
    || path.join(FARM_ROOT, 'metrics', `${batchName}-progress.json`);
  const progress = {
    status: 'RUNNING',
    batch: batchName,
    total: jobList.length,
    done: 0,
    startedAt: new Date().toISOString(),
    whisper: process.env.FARM_MEASURE_WHISPER === '1',
    whisperAvailable: whisperAvailable(),
    sampleRepresentative: !!opts.sampleRepresentative,
    rows: [],
  };
  const writeProgress = () => {
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2) + '\n');
  };
  writeProgress();

  // Whisper is memory-heavy; default concurrency 1 when ASR enabled
  const concurrency =
    opts.concurrency ||
    (process.env.FARM_MEASURE_WHISPER === '1' ? 1 : 3);
  const rows = await runWithPool(jobList, concurrency, async (job) => {
    const row = await measureOne(job, byDoc[job.docId]);
    progress.done += 1;
    progress.rows.push({
      id: row.id,
      wer: row.wer,
      werIsProxy: row.werIsProxy,
      pauseConformance: row.pauseConformance,
      pauseIsProxy: row.pauseIsProxy,
      method: row.method,
      engine: row.engine,
      profile: row.profile,
      contentType: row.contentType,
      status: row.status,
    });
    writeProgress();
    console.log(
      JSON.stringify({
        event: 'measured',
        id: row.id,
        wer: row.wer,
        werIsProxy: row.werIsProxy,
        conf: row.pauseConformance,
        pauseIsProxy: row.pauseIsProxy,
        rtf: row.rtf,
        valid: row.validAudio,
        method: row.method,
        done: progress.done,
        total: progress.total,
      }),
    );
    return row;
  });

  const aggregates = aggregateRows(rows);
  const recommendations = recommendDefaults(rows);
  const methodology = {
    wer:
      aggregates.measuredWerCount > 0
        ? aggregates.proxyWerCount > 0
          ? 'mixed-measured-and-proxy'
          : 'faster-whisper-asr'
        : aggregates.proxyWerCount > 0
          ? 'duration-density-proxy-only'
          : 'unavailable',
    pause:
      aggregates.realPauseCount > 0
        ? 'pause-probe-profile-band'
        : aggregates.proxyPauseCount > 0
          ? 'ffmpeg-silencedetect-proxy'
          : 'unavailable',
    whisperEnabled: process.env.FARM_MEASURE_WHISPER === '1',
    whisperAvailable: whisperAvailable(),
    whisperModel: process.env.FARM_MEASURE_WHISPER_MODEL || 'tiny',
    note:
      aggregates.proxyWerCount > 0
        ? 'Proxy WER rows are labeled werIsProxy=true and must not be presented as measured gate WER.'
        : 'All WER rows are ASR-measured (werIsProxy=false).',
  };
  const out = {
    batch: batchName,
    generatedAt: new Date().toISOString(),
    methodology,
    aggregates,
    recommendations,
    rows,
  };
  const outMetricsPath = opts.metricsPath || metricsPath;
  const outMdPath = opts.mdPath || mdPath;
  fs.writeFileSync(outMetricsPath, JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(outMdPath, toMarkdown(out), 'utf8');
  progress.status = 'COMPLETE';
  progress.completedAt = new Date().toISOString();
  progress.methodology = methodology;
  progress.aggregates = {
    meanWer: aggregates.meanWer,
    meanWerMeasured: aggregates.meanWerMeasured,
    measuredWerCount: aggregates.measuredWerCount,
    proxyWerCount: aggregates.proxyWerCount,
    meanConformance: aggregates.meanConformance,
    realPauseCount: aggregates.realPauseCount,
  };
  writeProgress();

  // Also write combined farm-metrics if catalog
  if ((batchName === 'catalog' || opts.asPrimary) && !opts.metricsPath) {
    fs.writeFileSync(path.join(FARM_ROOT, 'metrics/farm-metrics.json'), JSON.stringify(out, null, 2) + '\n');
    fs.writeFileSync(path.join(FARM_ROOT, 'metrics/farm-metrics.md'), toMarkdown(out), 'utf8');
  }

  console.log(
    JSON.stringify(
      {
        event: 'measure-complete',
        batch: batchName,
        metricsPath: outMetricsPath,
        methodology,
        meanWer: aggregates.meanWer,
        meanWerMeasured: aggregates.meanWerMeasured,
        measuredWerCount: aggregates.measuredWerCount,
        proxyWerCount: aggregates.proxyWerCount,
        meanConformance: aggregates.meanConformance,
        realPauseCount: aggregates.realPauseCount,
        meanRtf: aggregates.meanRtf,
        invalidAudio: aggregates.invalidAudio,
      },
      null,
      2,
    ),
  );
  return out;
}

/**
 * ≥1 job per (contentType × engine). Prefers shorter audio (bytes) so sample is fast.
 */
function selectRepresentativeSample(jobList, byDoc) {
  const best = new Map();
  for (const j of jobList) {
    const doc = byDoc[j.docId] || {};
    const ct = doc.contentType || j.contentType || 'unknown';
    const eng = j.engine || 'unknown';
    const key = `${ct}||${eng}`;
    const prev = best.get(key);
    if (!prev || (j.bytes || Infinity) < (prev.bytes || Infinity)) {
      best.set(key, j);
    }
  }
  return [...best.values()];
}

/**
 * Fan/interleave jobs by engine so progress streams mixed engines/content types.
 */
function interleaveJobs(jobList, byDoc) {
  const buckets = new Map();
  for (const j of jobList) {
    const eng = j.engine || 'unknown';
    if (!buckets.has(eng)) buckets.set(eng, []);
    buckets.get(eng).push(j);
  }
  // Within each engine, short-first for faster partial WER
  for (const list of buckets.values()) {
    list.sort((a, b) => (a.bytes || 0) - (b.bytes || 0));
  }
  const keys = [...buckets.keys()];
  const out = [];
  let added = true;
  while (added) {
    added = false;
    for (const k of keys) {
      const list = buckets.get(k);
      if (list && list.length) {
        out.push(list.shift());
        added = true;
      }
    }
  }
  return out;
}

function toMarkdown(out) {
  const a = out.aggregates;
  const m = out.methodology || {};
  let md = `# Farm metrics — ${out.batch}\n\n`;
  md += `Generated: ${out.generatedAt}\n\n`;
  md += `## Methodology (measured vs proxy)\n\n`;
  md += `| Signal | Method |\n|---|---|\n`;
  md += `| WER | ${m.wer || 'n/a'} (measured rows: ${a.measuredWerCount ?? '—'}, proxy rows: ${a.proxyWerCount ?? '—'}) |\n`;
  md += `| Pause conformance | ${m.pause || 'n/a'} (real: ${a.realPauseCount ?? '—'}, proxy: ${a.proxyPauseCount ?? '—'}) |\n`;
  md += `| Whisper available | ${m.whisperAvailable} · enabled=${m.whisperEnabled} · model=${m.whisperModel || '—'} |\n\n`;
  if (m.note) md += `> ${m.note}\n\n`;
  md += `## Aggregates\n\n`;
  md += `| Metric | Value |\n|---|---|\n`;
  md += `| total | ${a.total} |\n`;
  md += `| measured | ${a.measured} |\n`;
  md += `| failed | ${a.failed} |\n`;
  md += `| mean WER (gate key) | ${a.meanWer != null ? a.meanWer.toFixed(4) : 'n/a'} |\n`;
  md += `| mean WER measured (ASR) | ${a.meanWerMeasured != null ? a.meanWerMeasured.toFixed(4) : 'n/a'} |\n`;
  md += `| mean WER proxy | ${a.meanWerProxy != null ? a.meanWerProxy.toFixed(4) : 'n/a'} |\n`;
  md += `| mean pause conformance | ${a.meanConformance != null ? (a.meanConformance * 100).toFixed(1) + '%' : 'n/a'} |\n`;
  md += `| mean RTF | ${a.meanRtf != null ? a.meanRtf.toFixed(3) : 'n/a'} |\n`;
  md += `| invalid audio | ${a.invalidAudio} |\n\n`;
  md += `## Per row\n\n`;
  md += `| id | engine | profile | lang | WER | wer kind | conf | pause kind | RTF | valid |\n|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of out.rows) {
    const werKind = r.wer == null ? '—' : r.werIsProxy ? 'proxy' : 'measured';
    const pauseKind = r.pauseConformance == null ? '—' : r.pauseIsProxy ? 'proxy' : 'profile-band';
    md += `| ${r.id} | ${r.engine} | ${r.profile} | ${r.language} | ${r.wer != null ? r.wer.toFixed(3) : '—'} | ${werKind} | ${r.pauseConformance != null ? (r.pauseConformance * 100).toFixed(0) + '%' : '—'} | ${pauseKind} | ${r.rtf != null ? r.rtf.toFixed(2) : '—'} | ${r.validAudio} |\n`;
  }
  if (out.recommendations && Object.keys(out.recommendations).length) {
    md += `\n## Recommended defaults (data-derived)\n\n`;
    md += `| contentType | engine | profile | score |\n|---|---|---|---|\n`;
    for (const [ct, rec] of Object.entries(out.recommendations)) {
      md += `| ${ct} | ${rec.engine} | ${rec.profile} | ${rec.score.toFixed(3)} |\n`;
    }
  }
  return md;
}

function selfTest() {
  const rows = [
    { status: 'measured', wer: 0.1, pauseConformance: 0.95, rtf: 1.2, durationSec: 10, engine: 'piper', profile: 'audiobook', contentType: 'news', language: 'en', validAudio: true, id: 'a' },
    { status: 'measured', wer: 0.2, pauseConformance: 0.9, rtf: 1.5, durationSec: 12, engine: 'platform', profile: 'news', contentType: 'news', language: 'en', validAudio: true, id: 'b' },
    { status: 'failed', wer: null, pauseConformance: null, rtf: null, validAudio: false, id: 'c' },
  ];
  const agg = aggregateRows(rows);
  if (Math.abs(agg.meanWer - 0.15) > 1e-9) throw new Error(`meanWer ${agg.meanWer}`);
  if (Math.abs(agg.meanConformance - 0.925) > 1e-9) throw new Error(`conf ${agg.meanConformance}`);
  if (agg.invalidAudio !== 1) throw new Error('invalidAudio');
  if (agg.measured !== 2) throw new Error('measured');
  const rec = recommendDefaults(rows);
  if (!rec.news) throw new Error('no news rec');
  // piper should win (lower wer, higher conf)
  if (rec.news.engine !== 'piper') throw new Error(`expected piper got ${rec.news.engine}`);
  console.log(JSON.stringify({ ok: true, meanWer: agg.meanWer, rec: rec.news }, null, 2));
}

module.exports = {
  mean,
  aggregateRows,
  recommendDefaults,
  resolveActualEngine,
  applyActualEngine,
  wordErrorRate,
  normalizeText,
  stripMarkupForWer,
  normalizeRefForWer,
  validateAudioHeader,
  measureBatch,
  measureOne,
  tryTranscribe,
  measurePauseConformance,
  whisperAvailable,
  selectRepresentativeSample,
  interleaveJobs,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    selfTest();
    process.exit(0);
  }
  let batch = 'catalog';
  let concurrency = null;
  let ids = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--batch') batch = args[++i];
    else if (args[i] === '--concurrency') concurrency = Number(args[++i]);
    else if (args[i] === '--ids') ids = args[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (args[i] === '--primary') {
      /* flag */
    }
  }
  measureBatch(batch, {
    concurrency: concurrency || undefined,
    asPrimary: args.includes('--primary'),
    sampleRepresentative: args.includes('--sample-representative'),
    interleave: !args.includes('--no-interleave'),
    shortFirst: args.includes('--short-first'),
    ids,
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
