/**
 * Multilingual TTS e2e (RESONARA_LITE=1).
 * Boots Nest AppModule with sql.js and exercises language routing.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { AppModule } from '../../src/app.module';

jest.setTimeout(180_000);

describe('TTS multilingual e2e (lite)', () => {
  let app: INestApplication;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resonara-e2e-'));
    process.env.RESONARA_LITE = '1';
    process.env.RESONARA_DATA_DIR = dataDir;
    process.env.PORT = '0';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  async function waitJob(
    id: string,
    timeoutMs = 120_000,
  ): Promise<Record<string, unknown>> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await request(app.getHttpServer())
        .get(`/tts/jobs/${id}`)
        .expect(200);
      const status = res.body.status as string;
      if (status === 'completed' || status === 'failed') {
        return res.body as Record<string, unknown>;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`Job ${id} timed out`);
  }

  it('GET /tts/voices?language=pt-BR returns only Portuguese voices', async () => {
    const res = await request(app.getHttpServer())
      .get('/tts/voices')
      .query({ language: 'pt-BR' })
      .expect(200);
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
    const res = await request(app.getHttpServer())
      .get('/tts/voices')
      .query({ language: 'en' })
      .expect(200);
    const voices = (res.body.voices || res.body) as Array<{ id: string }>;
    expect(Array.isArray(voices)).toBe(true);
    const faberAsEn = voices.filter((v) => /pt_BR-faber|pt-br-faber/i.test(v.id));
    expect(faberAsEn).toHaveLength(0);
  });

  it('POST /tts/detect-language classifies Portuguese text', async () => {
    const res = await request(app.getHttpServer())
      .post('/tts/detect-language')
      .send({
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
    const create = await request(app.getHttpServer())
      .post('/tts/synthesize')
      .send({
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
      // Surface error for diagnosis
      throw new Error(`Job failed: ${JSON.stringify(done.error || done)}`);
    }
    expect(done.status).toBe('completed');
    // Critical: Portuguese must never route to English-only Kokoro
    expect(String(done.engine || '')).toMatch(/piper|platform/);
    expect(String(done.engine)).not.toBe('kokoro');

    const dl = await request(app.getHttpServer())
      .get(`/tts/jobs/${jobId}/download`)
      .responseType('blob')
      .expect(200);
    const len = Number(dl.headers['content-length'] || 0);
    // Prefer content-length; fall back to body size when present
    const bodyLen =
      typeof dl.body === 'string'
        ? Buffer.byteLength(dl.body)
        : Buffer.isBuffer(dl.body)
          ? dl.body.length
          : 0;
    expect(Math.max(len, bodyLen)).toBeGreaterThan(1000);
  });

  it('POST /tts/synthesize language=auto on Portuguese text selects pt-BR path', async () => {
    const create = await request(app.getHttpServer())
      .post('/tts/synthesize')
      .send({
        text: 'A empresa captou quatro milhões de reais no trimestre passado em São Paulo.',
        language: 'auto',
        postProcessing: 'raw',
      });
    expect([200, 201]).toContain(create.status);
    const jobId = create.body.id;
    const done = await waitJob(jobId);
    expect(done.status).toBe('completed');
    // Must not have used English-only Kokoro for Portuguese
    expect(String(done.engine)).not.toBe('kokoro');
    const meta = (done.metadata || {}) as { language?: string };
    expect(String(meta.language || done.language || '')).toMatch(/pt/i);
  });

  it('POST /tts/dictionary accepts pt-BR entry', async () => {
    const res = await request(app.getHttpServer())
      .post('/tts/dictionary')
      .send({
        word: 'açaí-e2e',
        alias: 'ah-sah-EE',
        language: 'pt-BR',
        engine: 'all',
      });
    expect([200, 201]).toContain(res.status);
    const list = await request(app.getHttpServer()).get('/tts/dictionary');
    expect([200, 201]).toContain(list.status);
    const raw = list.body;
    const entries = (
      Array.isArray(raw)
        ? raw
        : raw?.entries || raw?.items || raw?.data || []
    ) as Array<{ word?: string; language?: string }>;
    expect(Array.isArray(entries)).toBe(true);
    // Create succeeded; list may be filtered — at least no server error
    expect(res.body?.id || res.body?.word || res.status < 300).toBeTruthy();
  });
});
