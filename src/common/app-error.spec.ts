import { AppError, mapEngineError, userFacingMessage } from './app-error';

describe('app-error', () => {
  it('maps missing binary', () => {
    const e = mapEngineError('piper', new Error('ENOENT piper not found'));
    expect(e.code).toBe('ENGINE_BINARY_MISSING');
    expect(e.userMessage).toMatch(/download-piper/i);
    expect(e.retryable).toBe(true);
  });

  it('maps disk full', () => {
    const e = mapEngineError('kokoro', new Error('ENOSPC: no space left'));
    expect(e.code).toBe('DISK_FULL');
  });

  it('userFacingMessage never returns stack frames as primary', () => {
    const e = new Error('boom\n    at Object.<anonymous> (x.js:1:1)');
    expect(userFacingMessage(e)).toBe('boom');
  });

  it('AppError JSON shape', () => {
    const e = new AppError('VALIDATION', 'Text is required', { retryable: false });
    expect(e.toJSON()).toEqual({
      code: 'VALIDATION',
      message: 'Text is required',
      retryable: false,
      details: undefined,
    });
  });
});
