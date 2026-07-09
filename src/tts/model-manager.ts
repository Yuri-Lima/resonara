/**
 * Piper voice model registry + download manager.
 */
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as path from 'path';
import { URL } from 'url';
import { resolvePiperModelsDir, listPiperVoices } from './piper-tts';

export interface ModelRegistryEntry {
  key: string;
  name: string;
  language: string;
  quality: string;
  gender?: string;
  sampleRate: number;
  sizeBytes: number;
  onnxUrl: string;
  jsonUrl: string;
}

const DEFAULT_REGISTRY: ModelRegistryEntry[] = [
  {
    key: 'en_US-lessac-medium',
    name: 'Lessac (US English, medium)',
    language: 'en-US',
    quality: 'medium',
    gender: 'female',
    sampleRate: 22050,
    sizeBytes: 63201294,
    onnxUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx?download=true',
    jsonUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json?download=true',
  },
  {
    key: 'en_US-amy-medium',
    name: 'Amy (US English, medium)',
    language: 'en-US',
    quality: 'medium',
    gender: 'female',
    sampleRate: 22050,
    sizeBytes: 63200000,
    onnxUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx?download=true',
    jsonUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json?download=true',
  },
  {
    key: 'en_US-ryan-medium',
    name: 'Ryan (US English, medium)',
    language: 'en-US',
    quality: 'medium',
    gender: 'male',
    sampleRate: 22050,
    sizeBytes: 63200000,
    onnxUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx?download=true',
    jsonUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json?download=true',
  },
  {
    key: 'en_GB-alba-medium',
    name: 'Alba (British English, medium)',
    language: 'en-GB',
    quality: 'medium',
    gender: 'female',
    sampleRate: 22050,
    sizeBytes: 63200000,
    onnxUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx?download=true',
    jsonUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx.json?download=true',
  },
];

export class ModelManager {
  private registry: ModelRegistryEntry[];
  private modelsDir: string;
  private downloads = new Map<string, { progress: number; error?: string }>();

  constructor(modelsDir?: string, registry?: ModelRegistryEntry[]) {
    this.modelsDir = resolvePiperModelsDir(modelsDir);
    this.registry = registry || this.loadBundledRegistry() || DEFAULT_REGISTRY;
  }

  private loadBundledRegistry(): ModelRegistryEntry[] | null {
    const p = path.join(process.cwd(), 'resources', 'piper', 'models-registry.json');
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8')) as ModelRegistryEntry[];
    } catch {
      return null;
    }
  }

  listAvailable(): Array<ModelRegistryEntry & { installed: boolean }> {
    const installed = new Set(
      listPiperVoices(this.modelsDir).map((v) =>
        v.id.replace(/^piper:/, ''),
      ),
    );
    // Also match bare filenames
    for (const v of listPiperVoices(this.modelsDir)) {
      installed.add(path.basename(v.modelPath, '.onnx'));
    }
    return this.registry.map((m) => ({
      ...m,
      installed: installed.has(m.key) || fs.existsSync(path.join(this.modelsDir, `${m.key}.onnx`)),
    }));
  }

  listInstalled(): string[] {
    if (!fs.existsSync(this.modelsDir)) return [];
    const fromVoices = listPiperVoices(this.modelsDir).map((v) =>
      path.basename(v.modelPath, '.onnx'),
    );
    // Also include bare .onnx files even without parseable config (tests / partial installs)
    let fromFs: string[] = [];
    try {
      fromFs = fs
        .readdirSync(this.modelsDir)
        .filter((f) => f.endsWith('.onnx') && !f.endsWith('.onnx.json'))
        .map((f) => path.basename(f, '.onnx'));
    } catch {
      fromFs = [];
    }
    return [...new Set([...fromVoices, ...fromFs])];
  }

  getModelPath(modelKey: string): string | null {
    const p = path.join(this.modelsDir, `${modelKey}.onnx`);
    return fs.existsSync(p) ? p : null;
  }

  diskUsage(): { totalBytes: number; models: { key: string; bytes: number }[] } {
    const models: { key: string; bytes: number }[] = [];
    let totalBytes = 0;
    for (const key of this.listInstalled()) {
      const p = path.join(this.modelsDir, `${key}.onnx`);
      try {
        const st = fs.statSync(p);
        models.push({ key, bytes: st.size });
        totalBytes += st.size;
      } catch {
        /* skip */
      }
    }
    return { totalBytes, models };
  }

  async download(
    modelKey: string,
    onProgress?: (pct: number) => void,
  ): Promise<string> {
    const entry = this.registry.find((m) => m.key === modelKey);
    if (!entry) throw new Error(`Unknown model key: ${modelKey}`);
    fs.mkdirSync(this.modelsDir, { recursive: true });
    const onnxPath = path.join(this.modelsDir, `${modelKey}.onnx`);
    const jsonPath = onnxPath + '.json';
    this.downloads.set(modelKey, { progress: 0 });
    try {
      await this.downloadFile(entry.onnxUrl, onnxPath, (pct) => {
        this.downloads.set(modelKey, { progress: Math.round(pct * 0.95) });
        onProgress?.(Math.round(pct * 0.95));
      });
      await this.downloadFile(entry.jsonUrl, jsonPath);
      this.downloads.set(modelKey, { progress: 100 });
      onProgress?.(100);
      return onnxPath;
    } catch (e) {
      this.downloads.set(modelKey, {
        progress: 0,
        error: (e as Error).message,
      });
      throw e;
    }
  }

  delete(modelKey: string): void {
    const installed = this.listInstalled();
    if (installed.length <= 1 && installed.includes(modelKey)) {
      throw new Error('Cannot delete the last installed model');
    }
    const onnx = path.join(this.modelsDir, `${modelKey}.onnx`);
    const json = onnx + '.json';
    if (fs.existsSync(onnx)) fs.unlinkSync(onnx);
    if (fs.existsSync(json)) fs.unlinkSync(json);
  }

  downloadStatus(modelKey: string) {
    return this.downloads.get(modelKey) || null;
  }

  private downloadFile(
    url: string,
    dest: string,
    onProgress?: (pct: number) => void,
    redirects = 0,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (redirects > 10) return reject(new Error('Too many redirects'));
      const parsed = new URL(url);
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.get(
        url,
        { headers: { 'User-Agent': 'resonara-model-manager' } },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let next = res.headers.location;
            if (next.startsWith('/')) next = `${parsed.protocol}//${parsed.host}${next}`;
            return this.downloadFile(next, dest, onProgress, redirects + 1).then(resolve, reject);
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            return;
          }
          const total = Number(res.headers['content-length'] || 0);
          let received = 0;
          const file = fs.createWriteStream(dest);
          res.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (total > 0) onProgress?.(Math.min(100, (received / total) * 100));
          });
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
          file.on('error', reject);
        },
      );
      req.on('error', reject);
    });
  }
}
