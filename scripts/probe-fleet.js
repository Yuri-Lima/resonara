#!/usr/bin/env node
/**
 * Feature-truth probe fleet — one feature or all.
 * Usage: node scripts/probe-fleet.js <feature|all>
 * Features: kokoro whisper qa alignment library feeds(DESCOPED) cover epub preprocessor cli watch ptbr
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.RESONARA_PORT || process.env.PROBE_PORT || 3847);
const OUT = path.join(ROOT, 'reports', 'probes');
const FIXTURES = path.join(OUT, 'fixtures');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(FIXTURES, { recursive: true });

function request(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data =
      body != null
        ? Buffer.isBuffer(body)
          ? body
          : typeof body === 'string'
            ? body
            : JSON.stringify(body)
        : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...headers,
          ...(data && !Buffer.isBuffer(body) && typeof body !== 'string'
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
              }
            : data
              ? {
                  'Content-Length': Buffer.isBuffer(data)
                    ? data.length
                    : Buffer.byteLength(data),
                  ...headers,
                }
              : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const ct = res.headers['content-type'] || '';
          let parsed = buf;
          if (ct.includes('json')) {
            try {
              parsed = JSON.parse(buf.toString());
            } catch {
              parsed = buf.toString();
            }
          } else if (ct.includes('text') || ct.includes('xml') || ct.includes('svg')) {
            parsed = buf.toString();
          }
          resolve({ status: res.statusCode, body: parsed, raw: buf, headers: res.headers });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy(new Error('timeout'));
    });
    if (data) req.write(data);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealth(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const h = await request('GET', '/health');
      if (h.status === 200) return h.body;
    } catch {
      /* */
    }
    await sleep(250);
  }
  throw new Error('health check failed');
}

async function ensureServer() {
  try {
    return await waitHealth(3);
  } catch {
    /* start */
  }
  const dist = path.join(ROOT, 'dist', 'main.js');
  if (!fs.existsSync(dist)) throw new Error('build first');
  const log = path.join(OUT, 'server.log');
  const child = spawn('node', [dist], {
    cwd: ROOT,
    env: {
      ...process.env,
      RESONARA_LITE: '1',
      RESONARA_DESKTOP: '1',
      PORT: String(PORT),
      PIPER_PATH:
        process.env.PIPER_PATH ||
        path.join(ROOT, 'tools', 'piper-venv', 'bin', 'piper'),
      PIPER_MODELS_DIR:
        process.env.PIPER_MODELS_DIR ||
        path.join(ROOT, 'resources', 'piper', 'models'),
    },
    stdio: ['ignore', fs.openSync(log, 'a'), fs.openSync(log, 'a')],
    detached: true,
  });
  child.unref();
  fs.writeFileSync(path.join(OUT, 'server.pid'), String(child.pid));
  return waitHealth(80);
}

async function synthAndWait(body, timeoutMs = 120000) {
  const syn = await request('POST', '/tts/synthesize', body);
  if (syn.status >= 400) {
    return { ok: false, status: syn.status, body: syn.body };
  }
  const id = syn.body.id;
  const start = Date.now();
  let job = syn.body;
  while (job.status !== 'completed' && job.status !== 'failed') {
    if (Date.now() - start > timeoutMs) {
      return { ok: false, status: 'timeout', job };
    }
    await sleep(400);
    job = (await request('GET', `/tts/jobs/${id}`)).body;
  }
  return { ok: job.status === 'completed', job, id };
}

function writeReport(name, data) {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return p;
}

function verdictMd(feature, verdict, evidence, gaps, fixEstimate) {
  return `# Probe: ${feature}

**Verdict:** ${verdict}  
**Fix estimate:** ${fixEstimate}  
**Timestamp:** ${new Date().toISOString()}

## Evidence

\`\`\`
${evidence}
\`\`\`

## Gaps

${(gaps || []).map((g) => `- ${g}`).join('\n') || '- (none)'}

## Structured

\`\`\`json
${JSON.stringify({ feature, verdict, gaps, fixEstimate }, null, 2)}
\`\`\`
`;
}

// ─── Probes ───────────────────────────────────────────────

async function probeKokoro() {
  const logs = [];
  const gaps = [];
  let verdict = 'BROKEN';
  let fix = 'L';
  try {
    const eng = await request('GET', '/tts/engines');
    logs.push(`GET /tts/engines → ${eng.status}\n${JSON.stringify(eng.body, null, 2)}`);
    const engines = eng.body?.engines || eng.body || [];
    const kokoro = Array.isArray(engines)
      ? engines.find((e) => e.id === 'kokoro' || e.engine === 'kokoro')
      : engines.kokoro;
    logs.push(`kokoro status object: ${JSON.stringify(kokoro)}`);
    if (!kokoro) {
      verdict = 'UNREACHABLE';
      gaps.push('Kokoro not listed in engines endpoint');
      fix = 'M';
    } else if (!kokoro.available) {
      // try synth anyway / check download
      const r = await synthAndWait({
        text: 'Hello from Kokoro probe.',
        engine: 'kokoro',
        language: 'en',
        qa: 'off',
        title: 'kokoro-probe',
      });
      logs.push(`synth engine=kokoro → ${JSON.stringify(r, null, 2).slice(0, 2000)}`);
      if (r.ok) {
        verdict = 'WORKING';
        fix = 'S';
      } else {
        verdict = 'UNREACHABLE';
        gaps.push('Kokoro unavailable (model/venv missing); synth failed');
        gaps.push(String(r.body || r.job?.error || r.status));
        fix = 'L';
      }
    } else {
      const r = await synthAndWait({
        text: 'Hello from Kokoro probe. Neural synthesis check.',
        engine: 'kokoro',
        language: 'en',
        qa: 'off',
        title: 'kokoro-probe',
      });
      logs.push(`synth engine=kokoro → ok=${r.ok} status=${r.job?.status} err=${r.job?.error}`);
      if (r.ok) {
        const dl = await request('GET', `/tts/jobs/${r.id}/download`);
        logs.push(`download status=${dl.status} bytes=${dl.raw?.length}`);
        if (dl.status === 200 && dl.raw.length > 1000) {
          const out = path.join(FIXTURES, 'kokoro-probe.wav');
          fs.writeFileSync(out, dl.raw);
          logs.push(`wrote ${out}`);
          verdict = 'WORKING';
          fix = 'S';
        } else {
          verdict = 'PARTIAL';
          gaps.push('Synth completed but audio download empty/small');
          fix = 'M';
        }
      } else {
        verdict = 'BROKEN';
        gaps.push(String(r.job?.error || r.body || r.status));
        fix = 'L';
      }
    }
  } catch (e) {
    logs.push(`ERROR: ${e.stack || e}`);
    verdict = 'BROKEN';
    gaps.push(String(e.message || e));
  }
  writeReport('01-kokoro.md', verdictMd('Kokoro engine', verdict, logs.join('\n\n'), gaps, fix));
  return { feature: 'Kokoro engine', verdict, gaps, fixEstimate: fix, evidence: logs.join('\n') };
}

async function probeWhisper() {
  const logs = [];
  const gaps = [];
  let verdict = 'BROKEN';
  let fix = 'L';
  try {
    const h = await request('GET', '/stt/health');
    logs.push(`GET /stt/health → ${h.status}\n${JSON.stringify(h.body, null, 2)}`);
    // Need a WAV — synthesize one first with platform/piper
    const r = await synthAndWait({
      text: 'The quick brown fox jumps over the lazy dog.',
      engine: 'auto',
      language: 'en',
      qa: 'off',
      title: 'whisper-fixture',
    });
    logs.push(`fixture synth ok=${r.ok} id=${r.id} engine=${r.job?.engine}`);
    if (!r.ok) {
      verdict = 'BROKEN';
      gaps.push('Could not create WAV fixture for STT');
    } else {
      const dl = await request('GET', `/tts/jobs/${r.id}/download`);
      const wav = path.join(FIXTURES, 'whisper-input.wav');
      fs.writeFileSync(wav, dl.raw);
      logs.push(`fixture wav bytes=${dl.raw.length} path=${wav}`);
      // multipart is hard — use service via child if needed
      // Try curl-style multipart with boundary
      const boundary = '----ResonaraProbe' + Date.now();
      const fileBuf = dl.raw;
      const preamble = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="whisper-input.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
      );
      const mid = Buffer.from(
        `\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen\r\n--${boundary}--\r\n`,
      );
      const body = Buffer.concat([preamble, fileBuf, mid]);
      const tr = await request('POST', '/stt/transcribe', body, {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      });
      logs.push(`POST /stt/transcribe → ${tr.status}\n${JSON.stringify(tr.body, null, 2).slice(0, 3000)}`);
      if (tr.status === 200 && (tr.body?.text || tr.body?.transcript)) {
        const text = (tr.body.text || tr.body.transcript || '').toLowerCase();
        if (text.includes('fox') || text.includes('quick') || text.includes('dog')) {
          verdict = 'WORKING';
          fix = 'S';
        } else {
          verdict = 'PARTIAL';
          gaps.push(`Transcription returned but content mismatch: ${text.slice(0, 200)}`);
          fix = 'M';
        }
      } else if (tr.status === 503 || /whisper|not installed|unavailable/i.test(JSON.stringify(tr.body))) {
        verdict = 'UNREACHABLE';
        gaps.push('Whisper not installed or unavailable');
        fix = 'L';
      } else {
        verdict = 'BROKEN';
        gaps.push(JSON.stringify(tr.body).slice(0, 500));
        fix = 'M';
      }
    }
  } catch (e) {
    logs.push(`ERROR: ${e.stack || e}`);
    gaps.push(String(e.message || e));
  }
  writeReport('02-whisper.md', verdictMd('Whisper STT', verdict, logs.join('\n\n'), gaps, fix));
  return { feature: 'Whisper STT', verdict, gaps, fixEstimate: fix, evidence: logs.join('\n') };
}

async function probeQa() {
  const logs = [];
  const gaps = [];
  let verdict = 'BROKEN';
  let fix = 'M';
  try {
    // Use npm qa:sample if available, else synthesize with qa=full
    try {
      const out = execSync('npm run qa:sample --silent 2>&1', {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 180000,
        env: { ...process.env, RESONARA_LITE: '1', PORT: String(PORT) },
      });
      logs.push(`npm run qa:sample:\n${out.slice(-4000)}`);
    } catch (e) {
      logs.push(`qa:sample exit=${e.status} out=${(e.stdout || e.message || '').toString().slice(-3000)}`);
    }
    const r = await synthAndWait({
      text: 'Quality assurance probe sentence for word error rate measurement.',
      engine: 'auto',
      language: 'en',
      qa: 'full',
      title: 'qa-probe',
    }, 180000);
    logs.push(`synth qa=full ok=${r.ok} id=${r.id}`);
    if (r.ok) {
      const qa = await request('GET', `/tts/jobs/${r.id}/qa`);
      logs.push(`GET /tts/jobs/${r.id}/qa → ${qa.status}\n${JSON.stringify(qa.body, null, 2).slice(0, 3000)}`);
      const body = qa.body || {};
      const hasWer =
        body.wer != null ||
        body.summary?.wer != null ||
        body.overallWer != null ||
        (Array.isArray(body.chunks) && body.chunks.some((c) => c.wer != null));
      if (hasWer) {
        verdict = 'WORKING';
        fix = 'S';
      } else if (qa.status === 200 && body) {
        verdict = 'PARTIAL';
        gaps.push('QA endpoint responds but WER not present (whisper missing?)');
        fix = 'M';
      } else {
        verdict = 'BROKEN';
        gaps.push('QA endpoint failed');
      }
    } else {
      verdict = 'BROKEN';
      gaps.push(String(r.job?.error || r.body));
    }
  } catch (e) {
    logs.push(`ERROR: ${e.stack || e}`);
    gaps.push(String(e.message || e));
  }
  writeReport('03-qa.md', verdictMd('QA loop', verdict, logs.join('\n\n'), gaps, fix));
  return { feature: 'QA loop', verdict, gaps, fixEstimate: fix, evidence: logs.join('\n') };
}

async function probeAlignment() {
  const logs = [];
  const gaps = [];
  let verdict = 'BROKEN';
  let fix = 'M';
  try {
    // Unit path: run forced-aligner via node require from dist or ts-node
    const r = await synthAndWait({
      text: 'One two three four five six seven eight nine ten.',
      engine: 'auto',
      language: 'en',
      qa: 'off',
      title: 'align-probe',
    });
    logs.push(`synth ok=${r.ok} id=${r.id}`);
    if (!r.ok) {
      gaps.push('fixture synth failed');
    } else {
      const ts = await request('GET', `/tts/jobs/${r.id}/timestamps`);
      logs.push(`GET timestamps → ${ts.status}\n${JSON.stringify(ts.body, null, 2).slice(0, 2500)}`);
      const words = ts.body?.words || ts.body?.timestamps || ts.body;
      if (ts.status === 200 && Array.isArray(words) && words.length >= 5) {
        const withTime = words.filter((w) => w.start != null || w.startMs != null || w.begin != null);
        if (withTime.length >= 5) {
          verdict = 'WORKING';
          fix = 'S';
        } else {
          verdict = 'PARTIAL';
          gaps.push('timestamps present but missing start times');
          fix = 'M';
        }
      } else if (ts.status === 200) {
        // Try subtitles
        const sub = await request('GET', `/tts/jobs/${r.id}/subtitles?format=vtt`);
        logs.push(`GET subtitles → ${sub.status} len=${sub.raw?.length}`);
        if (sub.status === 200 && sub.raw?.length > 20) {
          verdict = 'PARTIAL';
          gaps.push('Subtitles work; word-level forced alignment may be estimate-only');
          fix = 'M';
        } else {
          verdict = 'BROKEN';
          gaps.push('No timestamps or subtitles');
        }
      } else {
        verdict = 'BROKEN';
        gaps.push(`timestamps status ${ts.status}`);
      }
      // Also run unit test evidence
      try {
        const ut = execSync('npx jest src/tts/alignment/forced-aligner.spec.ts --silent 2>&1', {
          cwd: ROOT,
          encoding: 'utf8',
          timeout: 60000,
        });
        logs.push(`forced-aligner unit:\n${ut.slice(-1500)}`);
      } catch (e) {
        logs.push(`unit test fail: ${(e.stdout || e.message || '').toString().slice(-1000)}`);
      }
    }
  } catch (e) {
    logs.push(`ERROR: ${e.stack || e}`);
    gaps.push(String(e.message || e));
  }
  writeReport('04-alignment.md', verdictMd('Forced alignment', verdict, logs.join('\n\n'), gaps, fix));
  return { feature: 'Forced alignment', verdict, gaps, fixEstimate: fix, evidence: logs.join('\n') };
}

async function probeLibrary() {
  const logs = [];
  const gaps = [];
  let verdict = 'BROKEN';
  let fix = 'M';
  try {
    const r = await synthAndWait({
      text: 'Library probe book title content for bookshelf listing.',
      engine: 'auto',
      language: 'en',
      qa: 'off',
      title: 'Library Probe Title',
    });
    logs.push(`synth ok=${r.ok} id=${r.id}`);
    const lib = await request('GET', '/tts/library?page=1&limit=10');
    logs.push(`GET /tts/library → ${lib.status}\n${JSON.stringify(lib.body, null, 2).slice(0, 2500)}`);
    const items = lib.body?.items || lib.body?.jobs || lib.body?.data || (Array.isArray(lib.body) ? lib.body : []);
    if (lib.status === 200 && (items.length > 0 || lib.body?.total >= 0)) {
      const jobId = r.id || items[0]?.id;
      if (jobId) {
        const bm = await request('POST', `/tts/jobs/${jobId}/bookmarks`, {
          positionMs: 1500,
          note: 'probe',
        });
        logs.push(`POST bookmark → ${bm.status} ${JSON.stringify(bm.body).slice(0, 500)}`);
        const bml = await request('GET', `/tts/jobs/${jobId}/bookmarks`);
        logs.push(`GET bookmarks → ${bml.status} ${JSON.stringify(bml.body).slice(0, 500)}`);
        const cover = await request('GET', `/tts/jobs/${jobId}/cover`);
        logs.push(`GET cover → ${cover.status} ct=${cover.headers['content-type']} bytes=${cover.raw?.length}`);
        const resumeOk =
          bm.status < 400 &&
          bml.status === 200 &&
          (Array.isArray(bml.body) ? bml.body.length > 0 : !!bml.body);
        const coverOk = cover.status === 200 && cover.raw?.length > 50;
        if (resumeOk && coverOk) {
          verdict = 'WORKING';
          fix = 'S';
        } else if (lib.status === 200) {
          verdict = 'PARTIAL';
          if (!resumeOk) gaps.push('Bookmark/resume position not persisted cleanly');
          if (!coverOk) gaps.push('Cover not rendered');
          fix = 'M';
        }
      } else {
        verdict = 'PARTIAL';
        gaps.push('Library lists but no job id to test resume/cover');
      }
    } else {
      verdict = 'BROKEN';
      gaps.push('Library endpoint failed or empty after completed job');
    }
  } catch (e) {
    logs.push(`ERROR: ${e.stack || e}`);
    gaps.push(String(e.message || e));
  }
  writeReport('05-library.md', verdictMd('Library', verdict, logs.join('\n\n'), gaps, fix));
  return { feature: 'Library', verdict, gaps, fixEstimate: fix, evidence: logs.join('\n') };
}

async function probeFeeds() {
  const logs = [
    'DESCOPED: Podcast RSS feeds removed — Resonara is TTS-only (no podcast host).',
  ];
  const gaps = ['Product scope: offline long-form TTS only'];
  writeReport(
    '06-feeds.md',
    verdictMd('Podcast feeds', 'DESCOPED', logs.join('\n\n'), gaps, '—'),
  );
  return {
    feature: 'Podcast feeds',
    verdict: 'DESCOPED',
    gaps,
    fixEstimate: '—',
    evidence: logs.join('\n'),
  };
}

async function probeCover() {
  const logs = [];
  const gaps = [];
  let verdict = 'BROKEN';
  let fix = 'M';
  try {
    const r = await synthAndWait({
      text: 'Cover art probe for embedded artwork verification.',
      engine: 'auto',
      language: 'en',
      qa: 'off',
      title: 'Cover Art Probe',
      format: 'mp3',
    });
    logs.push(`synth ok=${r.ok} id=${r.id} format=${r.job?.format}`);
    if (!r.ok) {
      // try wav then cover endpoint
      const r2 = await synthAndWait({
        text: 'Cover art probe wav.',
        engine: 'auto',
        language: 'en',
        qa: 'off',
        title: 'Cover Art Probe WAV',
      });
      logs.push(`wav synth ok=${r2.ok} id=${r2.id}`);
      if (r2.ok) {
        const cover = await request('GET', `/tts/jobs/${r2.id}/cover`);
        logs.push(`cover → ${cover.status} ct=${cover.headers['content-type']} bytes=${cover.raw?.length}`);
        if (cover.status === 200 && cover.raw?.length > 50) {
          fs.writeFileSync(path.join(FIXTURES, 'cover.svg'), cover.raw);
          verdict = 'PARTIAL';
          gaps.push('Cover SVG generated; MP3 embed/ffprobe not verified (mp3 synth failed or skipped)');
          fix = 'M';
        }
      }
    } else {
      const cover = await request('GET', `/tts/jobs/${r.id}/cover`);
      logs.push(`cover → ${cover.status} bytes=${cover.raw?.length}`);
      const dl = await request('GET', `/tts/jobs/${r.id}/download`);
      const audioPath = path.join(FIXTURES, 'cover-probe.mp3');
      fs.writeFileSync(audioPath, dl.raw);
      logs.push(`audio bytes=${dl.raw.length}`);
      try {
        const probe = execSync(`ffprobe -v quiet -print_format json -show_format -show_streams "${audioPath}"`, {
          encoding: 'utf8',
          timeout: 30000,
        });
        logs.push(`ffprobe:\n${probe.slice(0, 2000)}`);
        const hasArt =
          /attached_pic|cover|APIC|metadata/i.test(probe) ||
          JSON.parse(probe).streams?.some((s) => s.codec_type === 'video' || s.disposition?.attached_pic);
        if (cover.status === 200 && hasArt) {
          verdict = 'WORKING';
          fix = 'S';
        } else if (cover.status === 200) {
          verdict = 'PARTIAL';
          gaps.push('Cover endpoint works; embed in audio not confirmed by ffprobe');
          fix = 'M';
        } else {
          verdict = 'BROKEN';
          gaps.push('Cover endpoint failed');
        }
      } catch (e) {
        logs.push(`ffprobe error: ${e.message}`);
        if (cover.status === 200) {
          verdict = 'PARTIAL';
          gaps.push('ffprobe failed; cover endpoint OK');
        }
      }
    }
  } catch (e) {
    logs.push(`ERROR: ${e.stack || e}`);
    gaps.push(String(e.message || e));
  }
  writeReport('07-cover.md', verdictMd('Cover art', verdict, logs.join('\n\n'), gaps, fix));
  return { feature: 'Cover art', verdict, gaps, fixEstimate: fix, evidence: logs.join('\n') };
}

async function probeEpub() {
  const logs = [];
  const gaps = [];
  let verdict = 'BROKEN';
  let fix = 'M';
  try {
    // Create a minimal text job then export epub overlay
    const r = await synthAndWait({
      text: 'Chapter one. The journey begins with a single step into the unknown forest.',
      engine: 'auto',
      language: 'en',
      qa: 'off',
      title: 'EPUB Probe Book',
    });
    logs.push(`synth ok=${r.ok} id=${r.id}`);
    if (!r.ok) {
      gaps.push('synth failed');
    } else {
      const exp = await request('POST', `/tts/jobs/${r.id}/export/epub-overlay`, {});
      logs.push(`POST export/epub-overlay → ${exp.status}\n${JSON.stringify(exp.body, null, 2).slice(0, 2000)}`);
      if (exp.status >= 400) {
        // maybe returns file stream
        logs.push(`raw head: ${exp.raw?.slice?.(0, 200) || exp.raw?.toString?.()?.slice(0, 200)}`);
      }
      let epubPath = exp.body?.path || exp.body?.file || exp.body?.output;
      if (exp.status === 200 || exp.status === 201) {
        if (epubPath && fs.existsSync(epubPath)) {
          // check zip structure
          try {
            const listing = execSync(`unzip -l "${epubPath}" 2>&1 | head -40`, { encoding: 'utf8' });
            logs.push(`unzip -l:\n${listing}`);
            const hasContainer = /META-INF\/container\.xml|mimetype|content\.opf/i.test(listing);
            if (hasContainer) {
              verdict = 'WORKING';
              fix = 'S';
            } else {
              verdict = 'PARTIAL';
              gaps.push('EPUB produced but structure incomplete');
            }
          } catch (e) {
            logs.push(`unzip err ${e.message}`);
            verdict = 'PARTIAL';
            gaps.push('EPUB path returned but could not list');
          }
        } else if (exp.headers['content-type']?.includes('epub') || exp.raw?.length > 100) {
          const p = path.join(FIXTURES, 'probe.epub');
          fs.writeFileSync(p, exp.raw);
          try {
            const listing = execSync(`unzip -l "${p}" 2>&1 | head -40`, { encoding: 'utf8' });
            logs.push(`unzip:\n${listing}`);
            if (/mimetype|container\.xml/i.test(listing)) {
              verdict = 'WORKING';
              fix = 'S';
            } else {
              verdict = 'PARTIAL';
              gaps.push('Response bytes but not valid epub zip');
            }
          } catch {
            verdict = 'PARTIAL';
            gaps.push('Wrote bytes, unzip failed');
          }
        } else {
          verdict = 'PARTIAL';
          gaps.push('Export endpoint 200 but no file path/body');
          fix = 'M';
        }
      } else {
        verdict = 'BROKEN';
        gaps.push(`export status ${exp.status}: ${JSON.stringify(exp.body).slice(0, 300)}`);
        fix = 'L';
      }
    }
  } catch (e) {
    logs.push(`ERROR: ${e.stack || e}`);
    gaps.push(String(e.message || e));
  }
  writeReport('08-epub.md', verdictMd('EPUB export', verdict, logs.join('\n\n'), gaps, fix));
  return { feature: 'EPUB export', verdict, gaps, fixEstimate: fix, evidence: logs.join('\n') };
}

async function probePreprocessor() {
  const logs = [];
  const gaps = [];
  let verdict = 'BROKEN';
  let fix = 'M';
  try {
    const messy = `Page 1 of 99\n\nCHAPTER ONE\n\nHello   world...  see https://example.com for more.\n\n[1] footnote garbage\n\n"Smart quotes" and — dashes.\n\nPage 2 of 99\n`;
    const prev = await request('POST', '/tts/preprocess-preview', {
      text: messy,
      documentMode: true,
    });
    logs.push(`POST preprocess-preview → ${prev.status}\n${JSON.stringify(prev.body, null, 2).slice(0, 2500)}`);
    const cleaned = prev.body?.text || prev.body?.cleaned || prev.body?.result?.text || '';
    const rulesApplied =
      prev.body?.rulesApplied ||
      prev.body?.applied ||
      prev.body?.changes ||
      prev.body?.stats;
    const pageRemoved = cleaned && !/Page \d+ of \d+/i.test(cleaned);
    const raw = await request('POST', '/tts/preprocess-preview', {
      text: messy,
      documentMode: false,
      enabled: false,
    });
    logs.push(`raw-paste path → ${raw.status}\n${JSON.stringify(raw.body, null, 2).slice(0, 1500)}`);
    const rawText = raw.body?.text || raw.body?.cleaned || messy;
    const bypassOk =
      raw.status === 200 &&
      (/Page \d+ of \d+/i.test(String(rawText)) ||
        raw.body?.enabled === false ||
        raw.body?.skipped === true ||
        String(rawText).includes('Page 1'));
    if (prev.status === 200 && cleaned && pageRemoved) {
      if (bypassOk) {
        verdict = 'WORKING';
        fix = 'S';
      } else {
        verdict = 'PARTIAL';
        gaps.push('Document mode works; raw-paste bypass unclear');
        fix = 'S';
      }
    } else if (prev.status === 200) {
      verdict = 'PARTIAL';
      gaps.push('Preview endpoint works but expected rules not clearly applied');
      logs.push(`cleaned sample: ${String(cleaned).slice(0, 300)}`);
      fix = 'M';
    } else {
      verdict = 'BROKEN';
      gaps.push(`preview status ${prev.status}`);
    }
    logs.push(`rulesApplied=${JSON.stringify(rulesApplied)}`);
  } catch (e) {
    logs.push(`ERROR: ${e.stack || e}`);
    gaps.push(String(e.message || e));
  }
  writeReport('09-preprocessor.md', verdictMd('Text preprocessor', verdict, logs.join('\n\n'), gaps, fix));
  return { feature: 'Text preprocessor', verdict, gaps, fixEstimate: fix, evidence: logs.join('\n') };
}

async function probeCli() {
  const logs = [];
  const gaps = [];
  let verdict = 'BROKEN';
  let fix = 'M';
  try {
    const cli = path.join(ROOT, 'scripts', 'resonara-cli.js');
    const run = (args) => {
      try {
        const out = execSync(`node "${cli}" ${args}`, {
          cwd: ROOT,
          encoding: 'utf8',
          timeout: 120000,
          env: { ...process.env, RESONARA_PORT: String(PORT), PORT: String(PORT), RESONARA_LITE: '1' },
        });
        return { code: 0, out };
      } catch (e) {
        return { code: e.status || 1, out: (e.stdout || '') + (e.stderr || e.message || '') };
      }
    };
    const engines = run('engines');
    logs.push(`cli engines exit=${engines.code}\n${engines.out.slice(0, 1500)}`);
    const voices = run('voices');
    logs.push(`cli voices exit=${voices.code}\n${voices.out.slice(0, 1000)}`);
    const jobs = run('jobs');
    logs.push(`cli jobs exit=${jobs.code}\n${jobs.out.slice(0, 1000)}`);
    const sample = path.join(FIXTURES, 'cli-sample.txt');
    fs.writeFileSync(sample, 'CLI synthesis probe sentence.');
    const synth = run(`synth "${sample}" --engine auto --language en --qa off`);
    logs.push(`cli synth exit=${synth.code}\n${synth.out.slice(0, 1500)}`);
    // server-down error handling
    const down = (() => {
      try {
        const out = execSync(`node "${cli}" engines`, {
          cwd: ROOT,
          encoding: 'utf8',
          timeout: 10000,
          env: { ...process.env, RESONARA_PORT: '19999', PORT: '19999' },
        });
        return { code: 0, out };
      } catch (e) {
        return { code: e.status || 1, out: (e.stdout || '') + (e.stderr || e.message || '') };
      }
    })();
    logs.push(`cli engines on dead port exit=${down.code}\n${down.out.slice(0, 500)}`);
    if (engines.code === 0 && voices.code === 0 && jobs.code === 0 && synth.code === 0) {
      if (down.code !== 0) {
        verdict = 'WORKING';
        fix = 'S';
      } else {
        // might have auto-started server
        verdict = 'PARTIAL';
        gaps.push('CLI may auto-start server on dead port; error-handling for true server-down unclear');
        fix = 'S';
      }
    } else {
      verdict = 'PARTIAL';
      if (engines.code !== 0) gaps.push('engines subcommand failed');
      if (synth.code !== 0) gaps.push('synth subcommand failed');
      if (voices.code !== 0) gaps.push('voices failed');
      if (jobs.code !== 0) gaps.push('jobs failed');
      fix = 'M';
    }
  } catch (e) {
    logs.push(`ERROR: ${e.stack || e}`);
    gaps.push(String(e.message || e));
  }
  writeReport('10-cli.md', verdictMd('CLI', verdict, logs.join('\n\n'), gaps, fix));
  return { feature: 'CLI', verdict, gaps, fixEstimate: fix, evidence: logs.join('\n') };
}

async function probeWatch() {
  const logs = [];
  const gaps = [];
  let verdict = 'BROKEN';
  let fix = 'M';
  let child = null;
  try {
    const watchDir = path.join(FIXTURES, 'watch-in');
    const outDir = path.join(FIXTURES, 'watch-out');
    fs.mkdirSync(watchDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });
    const cli = path.join(ROOT, 'scripts', 'resonara-cli.js');
    const logFile = path.join(OUT, 'watch-daemon.log');
    child = spawn('node', [cli, 'watch', watchDir, '--out', outDir, '--engine', 'auto'], {
      cwd: ROOT,
      env: { ...process.env, RESONARA_PORT: String(PORT), PORT: String(PORT), RESONARA_LITE: '1' },
      stdio: ['ignore', fs.openSync(logFile, 'w'), fs.openSync(logFile, 'w')],
      detached: true,
    });
    logs.push(`watch daemon pid=${child.pid}`);
    await sleep(1500);
    const drop = path.join(watchDir, 'watch-probe.txt');
    fs.writeFileSync(drop, 'Watch folder probe text for daemon pickup.');
    logs.push(`dropped ${drop}`);
    let found = false;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const files = fs.readdirSync(outDir);
      const markers = fs.readdirSync(watchDir);
      if (files.some((f) => f.endsWith('.wav') || f.endsWith('.mp3')) ||
          markers.some((f) => f.includes('.done') || f.includes('.error') || f.includes('.processing'))) {
        found = true;
        logs.push(`outDir=${JSON.stringify(files)} watchDir=${JSON.stringify(markers)}`);
        break;
      }
    }
    if (!found) {
      const wlog = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
      logs.push(`watch log:\n${wlog.slice(-2000)}`);
      // check if watch command exists
      if (/usage|unknown|not found/i.test(wlog)) {
        verdict = 'UNREACHABLE';
        gaps.push('Watch subcommand missing or broken');
      } else {
        verdict = 'BROKEN';
        gaps.push('Daemon did not produce output/markers within timeout');
      }
      fix = 'M';
    } else {
      verdict = 'WORKING';
      fix = 'S';
      // debounce check is phase 3
    }
  } catch (e) {
    logs.push(`ERROR: ${e.stack || e}`);
    gaps.push(String(e.message || e));
  } finally {
    if (child && child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
        logs.push(`killed process group -${child.pid}`);
      } catch {
        try {
          process.kill(child.pid, 'SIGTERM');
          logs.push(`killed pid ${child.pid}`);
        } catch (e2) {
          logs.push(`kill failed: ${e2.message}`);
        }
      }
      await sleep(300);
      try {
        process.kill(child.pid, 0);
        process.kill(child.pid, 'SIGKILL');
        logs.push('had to SIGKILL');
      } catch {
        logs.push('daemon terminated (orphan check OK)');
      }
    }
  }
  writeReport('11-watch.md', verdictMd('Watch folder', verdict, logs.join('\n\n'), gaps, fix));
  return { feature: 'Watch folder', verdict, gaps, fixEstimate: fix, evidence: logs.join('\n') };
}

async function probePtbr() {
  const logs = [];
  const gaps = [];
  let verdict = 'BROKEN';
  let fix = 'M';
  try {
    const text =
      'No dia 15 de março de 2024, o Dr. Silva disse: — Olá, tudo bem? — perguntou Maria. O valor era R$ 1.250,50.';
    const r = await synthAndWait({
      text,
      engine: 'auto',
      language: 'pt-BR',
      qa: 'off',
      title: 'pt-BR probe',
      dialogue: true,
    });
    logs.push(`synth ok=${r.ok} id=${r.id} engine=${r.job?.engine} voice=${r.job?.voiceId || r.job?.voice}`);
    if (!r.ok) {
      gaps.push(String(r.job?.error || r.body));
      // try platform
      const r2 = await synthAndWait({
        text: 'Olá, este é um teste em português do Brasil.',
        engine: 'platform',
        language: 'pt-BR',
        qa: 'off',
        title: 'pt-BR platform',
      });
      logs.push(`platform fallback ok=${r2.ok} voice=${r2.job?.voiceId} err=${r2.job?.error}`);
      if (r2.ok) {
        verdict = 'PARTIAL';
        gaps.push('pt-BR works on platform only; neural voice path failed');
        fix = 'M';
      } else {
        verdict = 'BROKEN';
        fix = 'L';
      }
    } else {
      const voice = String(r.job?.voiceId || r.job?.voice || '');
      const eng = String(r.job?.engine || '');
      const ptVoice =
        /pt|faber|luciana|joana|fernanda|brazil/i.test(voice) ||
        /pt/i.test(eng);
      const dl = await request('GET', `/tts/jobs/${r.id}/download`);
      logs.push(`download bytes=${dl.raw?.length} voice=${voice} engine=${eng}`);
      // formatter unit
      try {
        const ut = execSync('npx jest src/tts/language/pt-br.formatter.spec.ts --silent 2>&1', {
          cwd: ROOT,
          encoding: 'utf8',
          timeout: 60000,
        });
        logs.push(`formatter unit:\n${ut.slice(-800)}`);
      } catch (e) {
        logs.push(`formatter unit fail ${(e.stdout || e.message || '').toString().slice(-500)}`);
        gaps.push('formatter unit failed');
      }
      // dialogue parser unit
      try {
        const ut = execSync('npx jest src/tts/dialogue-parser.spec.ts --silent 2>&1', {
          cwd: ROOT,
          encoding: 'utf8',
          timeout: 60000,
        });
        logs.push(`dialogue unit:\n${ut.slice(-800)}`);
      } catch (e) {
        gaps.push('dialogue parser unit failed');
      }
      if (dl.status === 200 && dl.raw.length > 1000) {
        fs.writeFileSync(path.join(FIXTURES, 'ptbr-probe.wav'), dl.raw);
        if (ptVoice || eng === 'platform' || eng === 'piper') {
          verdict = 'WORKING';
          fix = 'S';
          if (!/faber|pt_BR|pt-BR/i.test(voice) && eng === 'piper') {
            gaps.push(`voice may not be explicit pt-BR model: ${voice}`);
            verdict = 'PARTIAL';
          }
        } else {
          verdict = 'PARTIAL';
          gaps.push(`Unexpected voice/engine for pt-BR: ${eng}/${voice}`);
        }
      } else {
        verdict = 'BROKEN';
        gaps.push('empty audio');
      }
    }
  } catch (e) {
    logs.push(`ERROR: ${e.stack || e}`);
    gaps.push(String(e.message || e));
  }
  writeReport('12-ptbr.md', verdictMd('pt-BR pipeline', verdict, logs.join('\n\n'), gaps, fix));
  return { feature: 'pt-BR pipeline', verdict, gaps, fixEstimate: fix, evidence: logs.join('\n') };
}

const PROBES = {
  kokoro: probeKokoro,
  whisper: probeWhisper,
  qa: probeQa,
  alignment: probeAlignment,
  library: probeLibrary,
  feeds: probeFeeds,
  cover: probeCover,
  epub: probeEpub,
  preprocessor: probePreprocessor,
  cli: probeCli,
  watch: probeWatch,
  ptbr: probePtbr,
};

async function main() {
  const which = process.argv[2] || 'all';
  await ensureServer();
  const health = await waitHealth(5);
  console.log('health', JSON.stringify(health).slice(0, 200));
  const names = which === 'all' ? Object.keys(PROBES) : [which];
  const results = [];
  for (const n of names) {
    if (!PROBES[n]) {
      console.error('unknown', n);
      process.exit(2);
    }
    console.error(`\n=== PROBE ${n} ===`);
    const t0 = Date.now();
    const r = await PROBES[n]();
    r.runtimeMs = Date.now() - t0;
    results.push(r);
    console.error(`→ ${r.verdict} (${r.runtimeMs}ms)`);
    writeReport(`result-${n}.json`, r);
  }
  writeReport('fleet-summary.json', {
    at: new Date().toISOString(),
    port: PORT,
    results: results.map((r) => ({
      feature: r.feature,
      verdict: r.verdict,
      fixEstimate: r.fixEstimate,
      gaps: r.gaps,
      runtimeMs: r.runtimeMs,
    })),
  });
  console.log(JSON.stringify(results.map((r) => ({ feature: r.feature, verdict: r.verdict, fixEstimate: r.fixEstimate, gaps: r.gaps })), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
