import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  isPiperAvailable,
  listPiperVoices,
  resolvePiperBinary,
  resolvePiperModelsDir,
} from './piper-tts';

describe('piper-tts', () => {
  it('resolvePiperModelsDir returns a path', () => {
    const dir = resolvePiperModelsDir();
    expect(typeof dir).toBe('string');
    expect(dir.length).toBeGreaterThan(0);
  });

  it('resolvePiperBinary returns string or null', () => {
    const bin = resolvePiperBinary();
    expect(bin === null || typeof bin === 'string').toBe(true);
  });

  it('isPiperAvailable returns structured status', () => {
    const st = isPiperAvailable();
    expect(typeof st.available).toBe('boolean');
    expect(typeof st.voiceCount).toBe('number');
  });

  it('listPiperVoices scans models dir without throwing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'piper-models-'));
    const model = path.join(tmp, 'en_US-test-medium.onnx');
    const cfg = model + '.json';
    fs.writeFileSync(model, 'fake');
    fs.writeFileSync(
      cfg,
      JSON.stringify({
        audio: { sample_rate: 22050, quality: 'medium' },
        espeak: { voice: 'en-us' },
      }),
    );
    const voices = listPiperVoices(tmp);
    expect(voices.length).toBe(1);
    expect(voices[0].id).toContain('piper:');
    expect(voices[0].sampleRate).toBe(22050);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
