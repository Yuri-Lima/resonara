/**
 * Unit tests for scripts/render-farm.js (queue, concurrency, PID lock, cancel).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  sliceQueue,
  runWithConcurrency,
  acquireLock,
  releaseLock,
  readLock,
  planCancelCleanup,
} = require('../../scripts/render-farm');

describe('render-farm queue + concurrency', () => {
  it('sliceQueue respects concurrency waves', () => {
    const jobs = [1, 2, 3, 4, 5].map((i) => ({ id: String(i) }));
    const waves = sliceQueue(jobs, 3);
    expect(waves).toHaveLength(2);
    expect(waves[0]).toHaveLength(3);
    expect(waves[1]).toHaveLength(2);
  });

  it('runWithConcurrency never exceeds N in flight', async () => {
    const N = 3;
    let current = 0;
    let max = 0;
    const jobs = Array.from({ length: 12 }, (_, i) => ({ id: `j${i}` }));
    const { results, maxInFlight } = await runWithConcurrency(
      jobs,
      N,
      async (job) => {
        current++;
        max = Math.max(max, current);
        await new Promise((r) => setTimeout(r, 20));
        current--;
        return { id: job.id, status: 'ok' };
      },
    );
    expect(results).toHaveLength(12);
    expect(maxInFlight).toBeLessThanOrEqual(N);
    expect(max).toBeLessThanOrEqual(N);
    expect(results.every((r) => r.status === 'ok')).toBe(true);
  });

  it('runWithConcurrency isolates failures', async () => {
    const jobs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const { results } = await runWithConcurrency(jobs, 2, async (job) => {
      if (job.id === 'b') throw new Error('boom');
      return { id: job.id, status: 'ok' };
    });
    expect(results).toHaveLength(3);
    const failed = results.find((r) => r.id === 'b');
    expect(failed.status).toBe('failed');
    expect(results.filter((r) => r.status === 'ok')).toHaveLength(2);
  });
});

describe('render-farm PID lock', () => {
  let dir;
  let lockPath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-lock-'));
    lockPath = path.join(dir, 'farm.lock');
  });

  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  it('acquires lock when free', () => {
    const r = acquireLock(lockPath, 111, () => false);
    expect(r.ok).toBe(true);
    expect(readLock(lockPath).pid).toBe(111);
  });

  it('refuses when lock PID is alive', () => {
    acquireLock(lockPath, 222, () => false);
    const r = acquireLock(lockPath, 333, (pid) => pid === 222);
    expect(r.ok).toBe(false);
    expect(r.refused).toBe(true);
    expect(r.pid).toBe(222);
  });

  it('takes over stale lock with warning', () => {
    acquireLock(lockPath, 444, () => false);
    const r = acquireLock(lockPath, 555, () => false); // 444 dead
    expect(r.ok).toBe(true);
    expect(r.stale).toBe(true);
    expect(r.previousPid).toBe(444);
    expect(readLock(lockPath).pid).toBe(555);
  });

  it('releaseLock removes own lock', () => {
    acquireLock(lockPath, 666, () => false);
    expect(releaseLock(lockPath, 666)).toBe(true);
    expect(readLock(lockPath)).toBeNull();
  });
});

describe('render-farm cancel cleanup plan', () => {
  it('lists partials and child pids for in-flight jobs', () => {
    const state = {
      inFlight: ['j1', 'j2'],
      jobs: {
        j1: { status: 'running', outPath: '/tmp/a.wav', childPids: [10, 11] },
        j2: { status: 'running', outPath: '/tmp/b.wav', childPids: [12] },
        j3: { status: 'ok', outPath: '/tmp/c.wav' },
      },
    };
    const plan = planCancelCleanup(state);
    expect(plan.status).toBe('CANCELLED');
    expect(plan.partialsToDelete.sort()).toEqual(['/tmp/a.wav', '/tmp/b.wav'].sort());
    expect(plan.childPidsToKill.sort()).toEqual([10, 11, 12].sort());
    expect(plan.releaseLock).toBe(true);
  });
});
