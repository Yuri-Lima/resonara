/**
 * Multilingual TTS e2e — spawns Resonara lite (same path as demos/desktop).
 * Avoids Nest TestingModule + sql.js under Jest (driver load issues).
 */
import { spawn, ChildProcess, execSync } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

jest.setTimeout(180_000);

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3866;
const BASE = `http://127.0.0.1:${PORT}`;

function httpJson(
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders; raw?: Buffer }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, BASE);
    const data = body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: data
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data),
            }
          : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let parsed: any = null;
          const ct = String(res.headers['content-type'] || '');
          if (ct.includes('json')) {
            try {
              parsed = JSON.parse(raw.toString('utf8'));
            } catch {
              parsed = raw.toString('utf8');
            }
          } else {
            parsed = raw;
          }
          resolve({ status: res.statusCode || 0, body: parsed, headers: res.headers, raw });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function waitHealth(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await httpJson('GET', '/health');
      if (r.status === 200) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Server health timeout');
}

async function waitJob(id: string, timeoutMs = 120_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await httpJson('GET', `/tts/jobs/${id}`);
    if (res.status === 200) {
      const status = res.body?.status;
      if (status === 'completed' || status === 'failed') return res.body;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Job ${id} timed out`);
}

describe('TTS multilingual e2e (lite server)', () => {
  let child: ChildProcess | null = null;
  let dataDir: string;
  let logPath: string;

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resonara-e2e-'));
    logPath = path.join(dataDir, 'server.log');
    // free port
    try {
      const pids = execSync(`lsof -ti :${PORT}`, { encoding: 'utf8' }).trim();
      if (pids) execSync(`kill -9 ${pids.split('\n').join(' ')}`, { stdio: 'ignore' });
    } catch {
      /* free */
    }
    const entry = path.join(ROOT, 'dist', 'main.js');
    if (!fs.existsSync(entry)) {
      throw new Error('dist/main.js missing — run npm run build first');
    }
    const logFd = fs.openSync(logPath, 'w');
    child = spawn(process.execPath, [entry], {
      cwd: ROOT,
      env: {
        ...process.env,
        RESONARA_LITE: '1',
        RESONARA_DESKTOP: '1',
        RESONARA_DATA_DIR: dataDir,
        PORT: String(PORT),
      },
      stdio: ['ignore', logFd, logFd],
    });
    await waitHealth();
  });

  afterAll(async () => {
    if (child && !child.killed) {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
      try {
        child.kill('SIGKILL');
      } catch {
        /* */
      }
    }
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  it('GET /tts/voices?language=pt-BR returns only Portuguese voices', async () => {
    const res = await httpJson('GET', '/tts/voices?language=pt-BR');
    expect(res.status).toBe(200);
    const voices = (res.body.voices || res.body) as Array<{
      id: string;
      language?: string;
      name?: string;
    }>;
    expect(Array.isArray(voices)).toBe(true);
    expect(voices.length).toBeGreaterThan(0);
    for (const v of voices) {
      const hay = `${v.id} ${v.language || ''} ${v.name || ''}`.toLowerCase();
      expect(hay).toMatch(/pt|faber|jeff|cadu|edresson|luciana|portuguese|brasil/);
      expect(hay).not.toMatch(/pt-pt|joana|catarina/);
    }
  });

  it('GET /tts/voices?language=en does not return pt-BR-only Piper models as English', async () => {
    const res = await httpJson('GET', '/tts/voices?language=en');
    expect(res.status).toBe(200);
    const voices = (res.body.voices || res.body) as Array<{ id: string }>;
    const faberAsEn = voices.filter((v) => /pt_BR-faber|pt-br-faber/i.test(v.id));
    expect(faberAsEn).toHaveLength(0);
  });

  it('POST /tts/detect-language classifies Portuguese text', async () => {
    const res = await httpJson('POST', '/tts/detect-language', {
      text: 'O cachorro marrom pulou graciosamente sobre a cerca do jardim perto da velha ponte de pedra em Minas Gerais.',
    });
    expect([200, 201]).toContain(res.status);
    const code =
      res.body.overall?.code ||
      res.body.overall?.language ||
      res.body.language ||
      res.body.code;
    expect(String(code)).toMatch(/pt/i);
  });

  it('POST /tts/synthesize pt-BR short sentence → completed WAV', async () => {
    const create = await httpJson('POST', '/tts/synthesize', {
      text: 'Olá, como você está? Bem-vindo ao Resonara.',
      language: 'pt-BR',
      engine: 'piper',
      postProcessing: 'raw',
    });
    expect([200, 201]).toContain(create.status);
    const jobId = create.body.id;
    expect(jobId).toBeTruthy();

    const done = await waitJob(jobId);
    if (done.status === 'failed') {
      throw new Error(`Job failed: ${JSON.stringify(done.error || done)}`);
    }
    expect(done.status).toBe('completed');
    expect(String(done.engine || '')).toMatch(/piper|platform/);
    expect(String(done.engine)).not.toBe('kokoro');

    const dl = await httpJson('GET', `/tts/jobs/${jobId}/download`);
    expect(dl.status).toBe(200);
    const len = Number(dl.headers['content-length'] || 0);
    const bodyLen = dl.raw?.length || 0;
    expect(Math.max(len, bodyLen)).toBeGreaterThan(1000);
  });

  it('POST /tts/synthesize language=auto on Portuguese text selects pt-BR path', async () => {
    const create = await httpJson('POST', '/tts/synthesize', {
      text: 'A empresa captou quatro milhões de reais no trimestre passado em São Paulo.',
      language: 'auto',
      postProcessing: 'raw',
    });
    expect([200, 201]).toContain(create.status);
    const done = await waitJob(create.body.id);
    expect(done.status).toBe('completed');
    expect(String(done.engine)).not.toBe('kokoro');
    const meta = (done.metadata || {}) as { language?: string };
    expect(String(meta.language || done.language || '')).toMatch(/pt/i);
  });

  it('POST /tts/dictionary accepts pt-BR entry', async () => {
    const res = await httpJson('POST', '/tts/dictionary', {
      word: 'açaí-e2e',
      alias: 'ah-sah-EE',
      language: 'pt-BR',
      engine: 'all',
    });
    expect([200, 201]).toContain(res.status);
    const list = await httpJson('GET', '/tts/dictionary');
    expect([200, 201]).toContain(list.status);
    expect(res.body?.id || res.body?.word || res.status < 300).toBeTruthy();
  });
});
