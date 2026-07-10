import { JobsGateway } from './jobs.gateway';

describe('JobsGateway', () => {
  it('emits progress to room', () => {
    const gw = new JobsGateway();
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    (gw as unknown as { server: { to: typeof to } }).server = { to };
    gw.emitProgress('job-1', 50, 'tts');
    expect(to).toHaveBeenCalledWith('job:job-1');
    expect(emit).toHaveBeenCalledWith(
      'job:progress',
      expect.objectContaining({ jobId: 'job-1', progress: 50 }),
    );
  });

  it('emits completed and failed', () => {
    const gw = new JobsGateway();
    const emit = jest.fn();
    (gw as unknown as { server: { to: () => { emit: typeof emit } } }).server = {
      to: () => ({ emit }),
    };
    gw.emitCompleted('j', { ok: true });
    gw.emitFailed('j', 'boom');
    expect(emit).toHaveBeenCalled();
  });

  it('subscribes client to room', () => {
    const gw = new JobsGateway();
    const join = jest.fn();
    const client = { join } as never;
    const r = gw.handleSubscribe(client, { jobId: 'abc' });
    expect(join).toHaveBeenCalledWith('job:abc');
    expect(r).toEqual({ ok: true, room: 'job:abc' });
  });
});
