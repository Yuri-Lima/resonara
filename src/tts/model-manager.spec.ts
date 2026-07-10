import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ModelManager } from './model-manager';

describe('ModelManager', () => {
  let dir: string;
  let mgr: ModelManager;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resonara-models-'));
    mgr = new ModelManager(dir, [
      {
        key: 'test-voice',
        name: 'Test',
        language: 'en',
        quality: 'low',
        sampleRate: 16000,
        sizeBytes: 100,
        onnxUrl: 'https://example.com/x.onnx',
        jsonUrl: 'https://example.com/x.onnx.json',
      },
    ]);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('lists available with installed flag', () => {
    const list = mgr.listAvailable();
    expect(list[0].installed).toBe(false);
    fs.writeFileSync(path.join(dir, 'test-voice.onnx'), 'fake');
    fs.writeFileSync(path.join(dir, 'test-voice.onnx.json'), '{}');
    expect(mgr.listAvailable()[0].installed).toBe(true);
  });

  it('computes disk usage', () => {
    fs.writeFileSync(path.join(dir, 'test-voice.onnx'), '12345');
    const u = mgr.diskUsage();
    expect(u.totalBytes).toBe(5);
  });

  it('prevents deleting last model', () => {
    fs.writeFileSync(path.join(dir, 'test-voice.onnx'), 'x');
    expect(() => mgr.delete('test-voice')).toThrow(/last installed/);
  });
});
