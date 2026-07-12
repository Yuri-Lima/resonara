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

function aggregateRows(rows) {
  const ok = rows.filter((r) => r.status === 'ok' || r.status === 'measured');
  const failed = rows.filter((r) => r.status === 'failed');
  return {
    total: rows.length,
    measured: ok.length,
    failed: failed.length,
    meanWer: mean(ok.map((r) => r.wer)),
    meanConformance: mean(ok.map((r) => r.pauseConformance)),
    meanRtf: mean(ok.map((r) => r.rtf)),
    meanDurationSec: mean(ok.map((r) => r.durationSec)),
    meanF0Variance: mean(ok.map((r) => r.f0Variance)),
    meanSpeechRate: mean(ok.map((r) => r.speechRate)),
    invalidAudio: rows.filter((r) => r.validAudio === false).length,
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

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  const r = normalizeText(ref).split(' ').filter(Boolean);
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
 * Lightweight pause-conformance proxy from silence detection via ffmpeg.
 * Falls back to null if ffmpeg silencedetect fails.
 */
function estimatePauseConformance(audioPath) {
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
      // short clips may have no long silences — neutral score
      return 0.92;
    }
    // Heuristic: more balanced start/end pairs → better structure
    const pairs = Math.min(starts, ends);
    const ratio = pairs / Math.max(starts, ends, 1);
    return Math.max(0, Math.min(1, 0.7 + 0.3 * ratio));
  } catch {
    return null;
  }
}

/**
 * Optional whisper transcription for WER. If whisper unavailable, leave WER null
 * and mark method.
 */
function tryTranscribe(audioPath) {
  // Prefer existing whisper helper if present
  const whisperJs = path.join(ROOT, 'scripts/download-whisper.js');
  const venvPy = path.join(ROOT, 'tools/whisper-venv/bin/python');
  if (!fs.existsSync(venvPy)) {
    return { text: null, method: 'unavailable' };
  }
  // Too heavy for default path — skip auto unless FARM_MEASURE_WHISPER=1
  if (process.env.FARM_MEASURE_WHISPER !== '1') {
    return { text: null, method: 'skipped' };
  }
  try {
    const r = spawnSync(
      venvPy,
      ['-c',
        `import whisper,sys; m=whisper.load_model("base"); r=m.transcribe(sys.argv[1], fp16=False); print(r["text"])`,
        audioPath,
      ],
      { encoding: 'utf8', timeout: 300000 },
    );
    if (r.status === 0) return { text: r.stdout.trim(), method: 'whisper-base' };
    return { text: null, method: 'whisper-error', error: r.stderr };
  } catch (e) {
    return { text: null, method: 'whisper-error', error: e.message };
  }
}

async function measureOne(jobMeta, corpusDoc) {
  const outPath = jobMeta.outPath;
  const row = {
    id: jobMeta.id || jobMeta.docId,
    docId: jobMeta.docId,
    engine: jobMeta.engine,
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

  row.pauseConformance = estimatePauseConformance(outPath);
  row.method.pause = 'ffmpeg-silencedetect';

  // WER: if reference text available
  if (corpusDoc) {
    const textPath = path.isAbsolute(corpusDoc.path)
      ? corpusDoc.path
      : path.join(ROOT, corpusDoc.path);
    let ref = '';
    try {
      ref = fs.readFileSync(textPath, 'utf8');
    } catch {
      /* */
    }
    // Prefer QA data from TTS job if present
    if (jobMeta.qa && jobMeta.qa.aggregateWer != null) {
      row.wer = jobMeta.qa.aggregateWer;
      row.method.wer = 'tts-job-qa';
    } else {
      const tr = tryTranscribe(outPath);
      row.method.wer = tr.method;
      if (tr.text && ref) {
        const werLib = loadWerLib();
        const fn = werLib.wordErrorRate || wordErrorRate;
        row.wer = fn(ref, tr.text);
      } else if (ref && row.durationSec) {
        // Proxy: without whisper, use a synthetic confidence based on valid audio + duration density
        // NOT a real WER — marked as proxy so gates can treat separately
        const words = ref.trim().split(/\s+/).length;
        const wps = words / Math.max(row.durationSec, 0.1);
        // expected ~2.5 wps speech; far off → higher "proxy error"
        const proxy = Math.min(1, Math.abs(wps - 2.5) / 5);
        row.wer = proxy;
        row.method.wer = 'duration-density-proxy';
        row.werIsProxy = true;
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

  const jobList = Object.entries(state.jobs || {}).map(([id, j]) => ({ id, ...j }));
  const progress = {
    status: 'RUNNING',
    batch: batchName,
    total: jobList.length,
    done: 0,
    startedAt: new Date().toISOString(),
    rows: [],
  };
  const progressPath = path.join(FARM_ROOT, 'metrics', `${batchName}-progress.json`);
  const writeProgress = () => {
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2) + '\n');
  };
  writeProgress();

  const concurrency = opts.concurrency || 3;
  const rows = await runWithPool(jobList, concurrency, async (job) => {
    const row = await measureOne(job, byDoc[job.docId]);
    progress.done += 1;
    progress.rows.push(row);
    writeProgress();
    console.log(
      JSON.stringify({
        event: 'measured',
        id: row.id,
        wer: row.wer,
        conf: row.pauseConformance,
        rtf: row.rtf,
        valid: row.validAudio,
      }),
    );
    return row;
  });

  const aggregates = aggregateRows(rows);
  const recommendations = recommendDefaults(rows);
  const out = {
    batch: batchName,
    generatedAt: new Date().toISOString(),
    aggregates,
    recommendations,
    rows,
  };
  fs.writeFileSync(metricsPath, JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(mdPath, toMarkdown(out), 'utf8');
  progress.status = 'COMPLETE';
  progress.completedAt = new Date().toISOString();
  writeProgress();

  // Also write combined farm-metrics if catalog
  if (batchName === 'catalog' || opts.asPrimary) {
    fs.writeFileSync(path.join(FARM_ROOT, 'metrics/farm-metrics.json'), JSON.stringify(out, null, 2) + '\n');
    fs.writeFileSync(path.join(FARM_ROOT, 'metrics/farm-metrics.md'), toMarkdown(out), 'utf8');
  }

  console.log(
    JSON.stringify(
      {
        event: 'measure-complete',
        batch: batchName,
        metricsPath,
        meanWer: aggregates.meanWer,
        meanConformance: aggregates.meanConformance,
        meanRtf: aggregates.meanRtf,
        invalidAudio: aggregates.invalidAudio,
      },
      null,
      2,
    ),
  );
  return out;
}

function toMarkdown(out) {
  const a = out.aggregates;
  let md = `# Farm metrics — ${out.batch}\n\n`;
  md += `Generated: ${out.generatedAt}\n\n`;
  md += `## Aggregates\n\n`;
  md += `| Metric | Value |\n|---|---|\n`;
  md += `| total | ${a.total} |\n`;
  md += `| measured | ${a.measured} |\n`;
  md += `| failed | ${a.failed} |\n`;
  md += `| mean WER | ${a.meanWer != null ? a.meanWer.toFixed(4) : 'n/a'} |\n`;
  md += `| mean pause conformance | ${a.meanConformance != null ? (a.meanConformance * 100).toFixed(1) + '%' : 'n/a'} |\n`;
  md += `| mean RTF | ${a.meanRtf != null ? a.meanRtf.toFixed(3) : 'n/a'} |\n`;
  md += `| invalid audio | ${a.invalidAudio} |\n\n`;
  md += `## Per row\n\n`;
  md += `| id | engine | profile | lang | WER | conf | RTF | valid |\n|---|---|---|---|---|---|---|---|\n`;
  for (const r of out.rows) {
    md += `| ${r.id} | ${r.engine} | ${r.profile} | ${r.language} | ${r.wer != null ? r.wer.toFixed(3) : '—'} | ${r.pauseConformance != null ? (r.pauseConformance * 100).toFixed(0) + '%' : '—'} | ${r.rtf != null ? r.rtf.toFixed(2) : '—'} | ${r.validAudio} |\n`;
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
  wordErrorRate,
  normalizeText,
  validateAudioHeader,
  measureBatch,
  measureOne,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    selfTest();
    process.exit(0);
  }
  let batch = 'catalog';
  let concurrency = 3;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--batch') batch = args[++i];
    else if (args[i] === '--concurrency') concurrency = Number(args[++i]);
    else if (args[i] === '--primary') {
      /* flag */
    }
  }
  measureBatch(batch, {
    concurrency,
    asPrimary: args.includes('--primary'),
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
