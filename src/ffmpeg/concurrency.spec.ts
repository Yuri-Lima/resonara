import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

(hasFfmpeg ? describe : describe.skip)('concurrent ffmpeg backpressure', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conc-'));

  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('runs 8 transcodes with concurrency 2 — all complete', async () => {
    const input = path.join(tmp, 'in.wav');
    await new Promise<void>((resolve, reject) => {
      const c = spawn('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=0.3:sample_rate=44100',
        input,
      ]);
      c.on('close', (code) => (code === 0 ? resolve() : reject(new Error('gen'))));
    });

    let maxInFlight = 0;
    let inFlight = 0;
    const jobs = Array.from({ length: 8 }, (_, i) => i);

    const outs = await mapPool(jobs, 2, async (i) => {
      const out = path.join(tmp, `out-${i}.mp3`);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve, reject) => {
        const c = spawn('ffmpeg', [
          '-y',
          '-i',
          input,
          '-c:a',
          'libmp3lame',
          '-b:a',
          '128k',
          out,
        ]);
        c.on('close', (code) => {
          inFlight--;
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg ${i}`));
        });
      });
      return out;
    });

    expect(outs).toHaveLength(8);
    for (const o of outs) expect(fs.existsSync(o)).toBe(true);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  }, 120000);
});
