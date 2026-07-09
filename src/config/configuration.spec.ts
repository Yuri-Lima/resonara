import configuration from './configuration';

describe('configuration', () => {
  it('loads defaults', () => {
    const cfg = configuration();
    expect(cfg.port).toBeGreaterThan(0);
    expect(cfg.resonara.productName).toBe('Resonara');
    expect(cfg.piper).toBeDefined();
  });
});
