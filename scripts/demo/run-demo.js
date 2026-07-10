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
const SAMPLES_EN = path.join(ROOT, 'samples', 'texts');
const SAMPLES_PT = path.join(ROOT, 'samples', 'texts', 'pt-br');
const OUT_DIR_EN = path.join(ROOT, 'demo-output');
const OUT_DIR_PT = path.join(ROOT, 'demo-output', 'pt-br');
const PORT = Number(process.env.DEMO_PORT || 3855);
const BASE = `http://127.0.0.1:${PORT}`;

const SAMPLE_MAP_EN = {
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

const SAMPLE_MAP_PT = {
  'frase-rapida': 'frase-rapida.txt',
  paragrafo: 'paragrafo.txt',
  'artigo-curto': 'artigo-curto.txt',
  artigo: 'artigo-curto.txt',
  noticia: 'noticia.txt',
  'capitulo-livro': 'capitulo-livro.txt',
  capitulo: 'capitulo-livro.txt',
  'documento-tecnico': 'documento-tecnico.txt',
  tecnico: 'documento-tecnico.txt',
  'dialogo-roteiro': 'dialogo-roteiro.txt',
  dialogo: 'dialogo-roteiro.txt',
  'desafio-pronuncia': 'desafio-pronuncia.txt',
  pronuncia: 'desafio-pronuncia.txt',
  'numeros-e-datas': 'numeros-e-datas.txt',
  numeros: 'numeros-e-datas.txt',
  'misturado-en-pt': 'misturado-en-pt.txt',
  misturado: 'misturado-en-pt.txt',
  'ssml-demonstracao': 'ssml-demonstracao.txt',
  ssml: 'ssml-demonstracao.txt',
};

const ALL_EN = [
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

const ALL_PT = [
  'frase-rapida',
  'paragrafo',
  'artigo-curto',
  'noticia',
  'capitulo-livro',
  'documento-tecnico',
  'dialogo-roteiro',
  'desafio-pronuncia',
  'numeros-e-datas',
  'misturado-en-pt',
];

// Back-compat aliases used by rest of file
const SAMPLE_MAP = SAMPLE_MAP_EN;
const ALL = ALL_EN;
const SAMPLES = SAMPLES_EN;
const OUT_DIR = OUT_DIR_EN;

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

function freePort(port) {
  try {
    if (process.platform === 'win32') {
      execSync(
        `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /F /PID %a`,
        { stdio: 'ignore', shell: true },
      );
    } else {
      // Kill anything still bound to the demo port from a prior run
      try {
        const pids = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null`, {
          encoding: 'utf8',
        })
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        for (const pid of pids) {
          try {
            process.kill(Number(pid), 'SIGTERM');
          } catch {
            /* ignore */
          }
        }
        if (pids.length) {
          // brief wait then force
          try {
            execSync('sleep 0.4', { stdio: 'ignore' });
          } catch {
            /* ignore */
          }
          for (const pid of pids) {
            try {
              process.kill(Number(pid), 'SIGKILL');
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* nothing listening */
      }
    }
  } catch {
    /* ignore */
  }
}

function startServer() {
  freePort(PORT);
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
  let exited = false;
  child.stdout.on('data', (d) => {
    log += d.toString();
  });
  child.stderr.on('data', (d) => {
    log += d.toString();
  });
  child.on('exit', (code) => {
    exited = true;
    if (code && code !== 0) {
      console.error('Server exited', code, log.slice(-2000));
    }
  });
  return {
    child,
    getLog: () => log,
    isAlive: () => !exited && child.exitCode == null,
  };
}

function resolveSample(name, lang) {
  const isPt = /^pt/i.test(lang || 'en');
  const map = isPt ? SAMPLE_MAP_PT : SAMPLE_MAP_EN;
  const dir = isPt ? SAMPLES_PT : SAMPLES_EN;
  const outDir = isPt ? OUT_DIR_PT : OUT_DIR_EN;
  const file = map[name];
  if (!file) {
    throw new Error(
      `Unknown sample "${name}" for lang=${lang}. Known: ${Object.keys(map).join(', ')}`,
    );
  }
  return {
    textPath: path.join(dir, file),
    outDir,
    language: isPt ? 'pt-BR' : lang === 'auto' ? 'auto' : 'en',
  };
}

async function synthesizeSample(name, opts = {}) {
  const lang = opts.lang || opts.language || 'en';
  const { textPath, outDir, language } = resolveSample(name, lang);
  if (!fs.existsSync(textPath)) throw new Error(`Missing sample file ${textPath}`);
  let text = fs.readFileSync(textPath, 'utf8');
  const isSsml = name.includes('ssml') || /<speak[\s>]/i.test(text);
  const isDialogue =
    name.includes('dialogue') ||
    name.includes('dialogo') ||
    opts.dialogue;

  const body = {
    text,
    engine: opts.engine || 'auto',
    format: opts.format || 'wav',
    language: opts.languageHint || language,
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

  fs.mkdirSync(outDir, { recursive: true });
  const suffix = opts.suffix ? `-${opts.suffix}` : '';
  const outPath = path.join(outDir, `${name}${suffix}.wav`);
  const dl = await request('GET', `/tts/jobs/${jobId}/download`);
  if (dl.status >= 400) throw new Error(`download failed ${dl.status}`);
  fs.writeFileSync(outPath, dl.raw);

  const words = wordCount(text);
  const chars = text.length;
  const stats = {
    name,
    language: job.metadata?.language || language,
    jobId,
    engine: job.engine || opts.engine || 'auto',
    voiceId: job.voice || job.voiceId || job.voice_id || null,
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
  const allLanguages = args.includes('--all-languages');
  const compareIdx = args.indexOf('--compare');
  const engineIdx = args.indexOf('--engine');
  const langIdx = args.indexOf('--lang');
  const engine = engineIdx >= 0 ? args[engineIdx + 1] : undefined;
  const langRaw = langIdx >= 0 ? args[langIdx + 1] : 'en';
  const lang = /^pt/i.test(langRaw || '') ? 'pt-BR' : langRaw || 'en';
  const reserved = new Set(
    [engine, langRaw].filter(Boolean),
  );
  const nameArg = args.find(
    (a) => !a.startsWith('--') && !reserved.has(a),
  );

  // Ensure build
  if (!fs.existsSync(path.join(ROOT, 'dist', 'main.js'))) {
    console.log('Building…');
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
  }

  const { child, isAlive, getLog } = startServer();
  try {
    console.log(`Waiting for server on ${BASE}…`);
    const health = await waitHealth();
    if (!isAlive()) {
      throw new Error(
        `Demo server died before health stabilized.\n${getLog().slice(-2000)}`,
      );
    }
    console.log('Health OK', typeof health === 'object' ? JSON.stringify(health).slice(0, 200) : health);

    async function runSuite(suiteLang, names) {
      const report = [];
      const outBase = /^pt/i.test(suiteLang) ? OUT_DIR_PT : OUT_DIR_EN;
      for (const name of names) {
        console.log(`\n=== demo [${suiteLang}]: ${name} ===`);
        try {
          const stats = await synthesizeSample(name, {
            engine,
            lang: suiteLang,
            noOpen: true,
          });
          printStats(stats);
          report.push(stats);
        } catch (e) {
          console.error(`FAILED ${name}:`, e.message);
          report.push({ name, error: e.message, language: suiteLang });
        }
      }
      fs.mkdirSync(outBase, { recursive: true });
      const reportPath = path.join(outBase, 'report.json');
      fs.writeFileSync(
        reportPath,
        JSON.stringify(
          { generatedAt: new Date().toISOString(), language: suiteLang, results: report },
          null,
          2,
        ),
      );
      console.log('Wrote', reportPath);
      return report;
    }

    if (allLanguages) {
      const en = await runSuite('en', ALL_EN);
      const pt = await runSuite('pt-BR', ALL_PT);
      const failed = [...en, ...pt].filter((r) => r.error);
      if (failed.length) {
        console.error(`\n${failed.length} demo(s) failed`);
        process.exitCode = 1;
      }
      return;
    }

    if (compareIdx >= 0) {
      const sample =
        args[compareIdx + 1] && !args[compareIdx + 1].startsWith('--')
          ? args[compareIdx + 1]
          : /^pt/i.test(lang)
            ? 'paragrafo'
            : 'paragraph';
      console.log(`A/B compare for ${sample} lang=${lang}`);
      const platform = await synthesizeSample(sample, {
        engine: 'platform',
        suffix: 'platform',
        lang,
        noOpen: true,
      });
      let piper;
      try {
        piper = await synthesizeSample(sample, {
          engine: 'piper',
          suffix: 'piper',
          lang,
          noOpen: true,
        });
      } catch (e) {
        console.warn('Piper compare failed:', e.message);
      }
      printStats({ platform, piper, language: lang });
      const outBase = /^pt/i.test(lang) ? OUT_DIR_PT : OUT_DIR_EN;
      fs.mkdirSync(outBase, { recursive: true });
      const report = { platform, piper, language: lang, at: new Date().toISOString() };
      fs.writeFileSync(
        path.join(outBase, 'compare-report.json'),
        JSON.stringify(report, null, 2),
      );
      if (!noOpen) {
        openAudio(platform.output);
        if (piper) openAudio(piper.output);
      }
      return;
    }

    if (all) {
      const names = /^pt/i.test(lang) ? ALL_PT : ALL_EN;
      const report = await runSuite(lang, names);
      const failed = report.filter((r) => r.error);
      if (failed.length) {
        console.error(
          `\n${failed.length} demo(s) failed:`,
          failed.map((f) => f.name).join(', '),
        );
        process.exitCode = 1;
      }
      return;
    }

    const name =
      nameArg ||
      (/^pt/i.test(lang) ? 'frase-rapida' : 'quick-sentence');
    console.log(`Demo: ${name} lang=${lang}`);
    const stats = await synthesizeSample(name, { engine, lang });
    printStats(stats);
    if (!noOpen) openAudio(stats.output);
  } finally {
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    await sleep(300);
    try {
      child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    freePort(PORT);
  }
}



main().catch((e) => {
  console.error(e);
  process.exit(1);
});
