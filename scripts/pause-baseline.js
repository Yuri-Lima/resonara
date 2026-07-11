#!/usr/bin/env node
/**
 * Phase 1 baseline: synthesize pause-probe fixtures with the CURRENT pipeline
 * (no --sentence_silence, trim leading+trailing on every chunk, 20ms crossfade,
 * zero inserted silence) and measure silence around annotated boundaries.
 *
 * Usage: node scripts/pause-baseline.js [--fixture NAME] [--engine piper|platform]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FIX_DIR = path.join(ROOT, 'samples', 'pause-probes');
const OUT_DIR = path.join(ROOT, 'reports', 'ab-baseline');
const PIPER = path.join(ROOT, 'tools', 'piper-venv', 'bin', 'piper');
const MODELS = path.join(ROOT, 'resources', 'piper', 'models');

const FIXTURES = [
  { name: 'en-punctuation', file: 'en-punctuation.txt', lang: 'en', model: 'en_US-lessac-medium' },
  { name: 'en-structure', file: 'en-structure.md', lang: 'en', model: 'en_US-lessac-medium' },
  { name: 'pt-br-pontuacao', file: 'pt-br-pontuacao.txt', lang: 'pt-BR', model: 'pt_BR-faber-medium' },
  { name: 'pt-br-estrutura', file: 'pt-br-estrutura.md', lang: 'pt-BR', model: 'pt_BR-faber-medium' },
];

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { fixture: null, engine: 'piper' };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--fixture') o.fixture = a[++i];
    else if (a[i] === '--engine') o.engine = a[++i];
  }
  return o;
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function wavDurationSec(wavPath) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${wavPath}"`,
    { encoding: 'utf8' },
  ).trim();
  return parseFloat(out);
}

function trimChunkSilence(input, output) {
  // Mirror ffmpeg.service.ts trimChunkSilence: leading AND trailing
  const threshold = -50;
  const minSil = 0.03;
  const af =
    `silenceremove=start_periods=1:start_silence=${minSil}:start_threshold=${threshold}dB,` +
    `areverse,` +
    `silenceremove=start_periods=1:start_silence=${minSil}:start_threshold=${threshold}dB,` +
    `areverse`;
  const r = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-y', '-i', input, '-af', af, '-acodec', 'pcm_s16le', output],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    fs.copyFileSync(input, output);
  }
  const inStat = fs.statSync(input);
  const outStat = fs.statSync(output);
  if (outStat.size < 1024 || outStat.size < inStat.size * 0.05) {
    fs.copyFileSync(input, output);
  }
}

function crossfadeOrConcat(parts, output, durationSec = 0.02) {
  if (parts.length === 1) {
    fs.copyFileSync(parts[0], output);
    return;
  }
  // Simple concat demuxer (crossfade of N files is complex; for baseline we
  // approximate with concat which is even MORE seamless/no-gap than crossfade)
  // For 2+ parts use acrossfade chain when possible, else concat.
  if (parts.length === 2) {
    const r = spawnSync(
      'ffmpeg',
      [
        '-hide_banner', '-y',
        '-i', parts[0], '-i', parts[1],
        '-filter_complex',
        `[0][1]acrossfade=d=${durationSec}:c1=tri:c2=tri`,
        '-acodec', 'pcm_s16le', output,
      ],
      { encoding: 'utf8' },
    );
    if (r.status === 0) return;
  }
  // Fallback: concat with zero silence (proves the bug)
  const listPath = output + '.txt';
  fs.writeFileSync(listPath, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  const r2 = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', output],
    { encoding: 'utf8' },
  );
  if (r2.status !== 0) throw new Error('concat failed: ' + (r2.stderr || '').slice(-400));
}

/** Strip markdown markers so engines don't choke on --- or # headings. */
function speakableText(text) {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---+\s*$/gm, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function synthesizePiper(text, modelName, outPath, sentenceSilence = null) {
  const model = path.join(MODELS, modelName + '.onnx');
  if (!fs.existsSync(model)) throw new Error('Model missing: ' + model);
  const spoken = speakableText(text);
  if (!spoken) {
    // empty after strip (e.g. lone ---) → 50ms silence placeholder
    spawnSync(
      'ffmpeg',
      [
        '-hide_banner', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono',
        '-t', '0.05', '-acodec', 'pcm_s16le', outPath,
      ],
      { encoding: 'utf8' },
    );
    return;
  }
  const args = ['--model', model, '--output_file', outPath];
  if (sentenceSilence != null) {
    args.push('--sentence_silence', String(sentenceSilence));
  }
  const r = spawnSync(PIPER, args, {
    input: spoken,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0 || !fs.existsSync(outPath)) {
    throw new Error('piper failed: ' + (r.stderr || r.stdout || '').slice(-500));
  }
}

function synthesizePlatform(text, outPath) {
  const spoken = speakableText(text);
  if (!spoken) {
    spawnSync(
      'ffmpeg',
      [
        '-hide_banner', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono',
        '-t', '0.05', '-acodec', 'pcm_s16le', outPath,
      ],
      { encoding: 'utf8' },
    );
    return;
  }
  // Use -f textfile to avoid CLI option parsing of leading dashes
  const txtFile = outPath + '.txt';
  fs.writeFileSync(txtFile, spoken, 'utf8');
  const aiff = outPath + '.aiff';
  const r = spawnSync('say', ['-o', aiff, '-f', txtFile], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('say failed: ' + (r.stderr || ''));
  spawnSync('ffmpeg', ['-hide_banner', '-y', '-i', aiff, '-acodec', 'pcm_s16le', '-ar', '22050', outPath], {
    encoding: 'utf8',
  });
  try { fs.unlinkSync(aiff); } catch {}
  try { fs.unlinkSync(txtFile); } catch {}
}

/**
 * Split text into pipeline-like chunks: by paragraphs first, then hard max.
 * Force small max so multi-chunk assembly is exercised for structure fixtures.
 */
function chunkLikePipeline(text, maxChars = 4000) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  // maxChars <= 1 → one chunk per paragraph (baseline stress for assembly)
  if (maxChars <= 1) return paras.length ? paras : [text];
  const pieces = [];
  for (const p of paras) {
    if (p.length <= maxChars) pieces.push(p);
    else {
      const sents = p.split(/(?<=[.!?…])\s+/);
      let buf = '';
      for (const s of sents) {
        if (!buf) buf = s;
        else if ((buf + ' ' + s).length <= maxChars) buf = buf + ' ' + s;
        else { pieces.push(buf); buf = s; }
      }
      if (buf) pieces.push(buf);
    }
  }
  return pieces.length ? pieces : [text];
}

function detectSilences(wavPath, noiseDb = -40, minDur = 0.05) {
  const r = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-i', wavPath, '-af', `silencedetect=noise=${noiseDb}dB:d=${minDur}`, '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const stderr = r.stderr || '';
  const silences = [];
  let current = null;
  for (const line of stderr.split('\n')) {
    const startM = line.match(/silence_start:\s*([\d.]+)/);
    if (startM) current = { start: parseFloat(startM[1]) };
    const endM = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
    if (endM && current) {
      current.end = parseFloat(endM[1]);
      current.duration = parseFloat(endM[2]);
      silences.push(current);
      current = null;
    }
  }
  return silences;
}

/**
 * Map char offset → approximate time via linear ratio (baseline heuristic).
 * Good enough to find the nearest silence gap around structural boundaries.
 */
function measureBoundary(durationSec, textLen, offset, silences, windowSec = 1.2) {
  const t = durationSec * (offset / Math.max(1, textLen));
  const winStart = Math.max(0, t - windowSec / 2);
  const winEnd = Math.min(durationSec, t + windowSec / 2);
  // Find longest silence overlapping the window
  let best = 0;
  let bestSil = null;
  for (const s of silences) {
    const overlapStart = Math.max(winStart, s.start);
    const overlapEnd = Math.min(winEnd, s.end);
    if (overlapEnd > overlapStart) {
      const od = (overlapEnd - overlapStart);
      // prefer full silence duration if mostly inside window
      const score = s.duration;
      if (score > best) {
        best = score;
        bestSil = s;
      }
    } else {
      // near miss: silence center within window
      const mid = (s.start + s.end) / 2;
      if (mid >= winStart && mid <= winEnd && s.duration > best) {
        best = s.duration;
        bestSil = s;
      }
    }
  }
  return {
    estimatedTimeSec: Math.round(t * 1000) / 1000,
    measuredMs: Math.round(best * 1000),
    silence: bestSil,
  };
}

function inBand(ms, band) {
  if (!band) return null;
  return ms >= band[0] && ms <= band[1];
}

async function runFixture(fx, engine) {
  const textPath = path.join(FIX_DIR, fx.file);
  const annPath = path.join(FIX_DIR, fx.name + '.json');
  const text = fs.readFileSync(textPath, 'utf8');
  const ann = JSON.parse(fs.readFileSync(annPath, 'utf8'));
  const work = path.join(OUT_DIR, 'work', engine, fx.name);
  ensureDir(work);

  // CURRENT pipeline simulation: split on paragraphs so each paragraph is a
  // chunk. Real pipeline packs paragraphs up to maxChars, but packing still
  // ends chunks at paragraph boundaries — and then trims trailing silence
  // from every chunk before crossfading with ZERO inserted gap. Using
  // per-paragraph chunks makes the bug measurable at every paragraph edge.
  const chunks = chunkLikePipeline(text, 1); // force no packing across paras
  const partPaths = [];
  for (let i = 0; i < chunks.length; i++) {
    const raw = path.join(work, `part-${i}-raw.wav`);
    const trim = path.join(work, `part-${i}-trim.wav`);
    if (engine === 'platform') {
      synthesizePlatform(chunks[i], raw);
    } else {
      // NO --sentence_silence (forensic item 1)
      synthesizePiper(chunks[i], fx.model, raw, null);
    }
    // trim leading AND trailing (forensic item 2)
    trimChunkSilence(raw, trim);
    partPaths.push(trim);
  }
  const outWav = path.join(OUT_DIR, `${engine}_${fx.name}.wav`);
  // crossfade 20ms, ZERO inserted silence (forensic item 3)
  crossfadeOrConcat(partPaths, outWav, 0.02);
  const durationSec = wavDurationSec(outWav);
  const silences = detectSilences(outWav, -40, 0.04);

  const results = [];
  for (const b of ann.boundaries) {
    const m = measureBoundary(durationSec, text.length, b.offset, silences);
    const pass = inBand(m.measuredMs, b.expectedBandMs);
    results.push({
      type: b.type,
      offset: b.offset,
      context: b.context,
      expectedBandMs: b.expectedBandMs,
      measuredMs: m.measuredMs,
      estimatedTimeSec: m.estimatedTimeSec,
      pass: pass === true,
      fail: pass === false,
      unbanded: pass === null,
    });
  }

  const banded = results.filter((r) => r.expectedBandMs);
  const passed = banded.filter((r) => r.pass).length;
  const conformance = banded.length ? Math.round((passed / banded.length) * 1000) / 10 : 0;

  // Aggregate by type
  const byType = {};
  for (const r of results) {
    if (!byType[r.type]) byType[r.type] = { count: 0, sumMs: 0, maxMs: 0, minMs: Infinity, pass: 0, fail: 0 };
    const t = byType[r.type];
    t.count++;
    t.sumMs += r.measuredMs;
    t.maxMs = Math.max(t.maxMs, r.measuredMs);
    t.minMs = Math.min(t.minMs, r.measuredMs);
    if (r.pass) t.pass++;
    if (r.fail) t.fail++;
  }
  for (const k of Object.keys(byType)) {
    byType[k].avgMs = Math.round(byType[k].sumMs / byType[k].count);
    if (byType[k].minMs === Infinity) byType[k].minMs = 0;
  }

  return {
    fixture: fx.name,
    engine,
    language: fx.lang,
    chunkCount: chunks.length,
    durationSec: Math.round(durationSec * 1000) / 1000,
    silenceRegions: silences.length,
    silenceDurationsMs: silences.map((s) => Math.round(s.duration * 1000)),
    conformancePct: conformance,
    passed,
    totalBanded: banded.length,
    byType,
    boundaries: results,
    wav: path.relative(ROOT, outWav),
  };
}

async function main() {
  const opts = parseArgs();
  ensureDir(OUT_DIR);
  const list = FIXTURES.filter((f) => !opts.fixture || f.name === opts.fixture);
  const engines = opts.engine === 'all' ? ['piper', 'platform'] : [opts.engine];
  const reports = [];
  for (const engine of engines) {
    for (const fx of list) {
      if (engine === 'platform' && process.platform !== 'darwin') continue;
      console.error(`→ ${engine} / ${fx.name} …`);
      try {
        const r = await runFixture(fx, engine);
        reports.push(r);
        console.error(
          `  chunks=${r.chunkCount} dur=${r.durationSec}s silences=${r.silenceRegions} ` +
            `conformance=${r.conformancePct}% (${r.passed}/${r.totalBanded})`,
        );
        for (const [type, stats] of Object.entries(r.byType)) {
          console.error(
            `    ${type}: avg=${stats.avgMs}ms min=${stats.minMs} max=${stats.maxMs} ` +
              `(${stats.pass}/${stats.count} in band)`,
          );
        }
      } catch (e) {
        console.error(`  FAIL: ${e.message}`);
        reports.push({ fixture: fx.name, engine, error: e.message });
      }
    }
  }
  const out = {
    generatedAt: new Date().toISOString(),
    note:
      'Baseline of CURRENT pipeline: no --sentence_silence, trim both edges, ' +
      '20ms crossfade, zero inserted silence. Low conformance PROVES the user report.',
    reports,
  };
  const jsonPath = path.join(ROOT, 'reports', 'pause-baseline.json');
  // Merge with existing reports when running one engine at a time
  let merged = out;
  if (fs.existsSync(jsonPath) && opts.engine !== 'all') {
    try {
      const prev = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const keep = (prev.reports || []).filter(
        (r) => !reports.some((n) => n.fixture === r.fixture && n.engine === r.engine),
      );
      merged = {
        generatedAt: new Date().toISOString(),
        note: out.note,
        reports: [...keep, ...reports],
      };
    } catch { /* overwrite */ }
  }
  fs.writeFileSync(jsonPath, JSON.stringify(merged, null, 2));
  console.log('\nWrote', jsonPath);

  // Human table
  console.log('\n=== BASELINE TABLE ===');
  console.log(
    '| fixture | engine | chunks | duration | conformance | para avg ms | sentence avg ms | comma avg ms | header avg ms |',
  );
  console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of reports) {
    if (r.error) {
      console.log(`| ${r.fixture} | ${r.engine} | ERR | | | | | | |`);
      continue;
    }
    const p = (t) => (r.byType[t] ? r.byType[t].avgMs : '—');
    console.log(
      `| ${r.fixture} | ${r.engine} | ${r.chunkCount} | ${r.durationSec}s | ${r.conformancePct}% | ${p('paragraph')} | ${p('sentence')} | ${p('comma')} | ${p('header')} |`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
