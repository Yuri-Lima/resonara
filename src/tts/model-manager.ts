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
  {
    key: 'pt_BR-faber-medium',
    name: 'Faber (Português Brasil, medium)',
    language: 'pt-BR',
    quality: 'medium',
    gender: 'male',
    sampleRate: 22050,
    sizeBytes: 63201294,
    onnxUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx?download=true',
    jsonUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx.json?download=true',
  },
  {
    key: 'pt_BR-jeff-medium',
    name: 'Jeff (Português Brasil, medium)',
    language: 'pt-BR',
    quality: 'medium',
    gender: 'male',
    sampleRate: 22050,
    sizeBytes: 62950044,
    onnxUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/jeff/medium/pt_BR-jeff-medium.onnx?download=true',
    jsonUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/jeff/medium/pt_BR-jeff-medium.onnx.json?download=true',
  },
  {
    key: 'pt_BR-cadu-medium',
    name: 'Cadu (Português Brasil, medium)',
    language: 'pt-BR',
    quality: 'medium',
    gender: 'male',
    sampleRate: 22050,
    sizeBytes: 62950044,
    onnxUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/cadu/medium/pt_BR-cadu-medium.onnx?download=true',
    jsonUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/cadu/medium/pt_BR-cadu-medium.onnx.json?download=true',
  },
  {
    key: 'pt_BR-edresson-low',
    name: 'Edresson (Português Brasil, low)',
    language: 'pt-BR',
    quality: 'low',
    gender: 'male',
    sampleRate: 16000,
    sizeBytes: 63104526,
    onnxUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/edresson/low/pt_BR-edresson-low.onnx?download=true',
    jsonUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/edresson/low/pt_BR-edresson-low.onnx.json?download=true',
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

  listAvailable(filter?: {
    language?: string;
  }): Array<ModelRegistryEntry & { installed: boolean }> {
    const installed = new Set(
      listPiperVoices(this.modelsDir).map((v) =>
        v.id.replace(/^piper:/, ''),
      ),
    );
    // Also match bare filenames
    for (const v of listPiperVoices(this.modelsDir)) {
      installed.add(path.basename(v.modelPath, '.onnx'));
    }
    let rows = this.registry.map((m) => ({
      ...m,
      installed: installed.has(m.key) || fs.existsSync(path.join(this.modelsDir, `${m.key}.onnx`)),
    }));
    if (filter?.language) {
      const lang = filter.language.toLowerCase().replace(/_/g, '-');
      rows = rows.filter((m) => {
        const ml = (m.language || '').toLowerCase().replace(/_/g, '-');
        return (
          ml === lang ||
          ml.startsWith(lang) ||
          lang.startsWith(ml.split('-')[0]) ||
          (lang.startsWith('pt') && ml.startsWith('pt'))
        );
      });
    }
    return rows;
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

  /** G28 TODO-09: only safe model key basenames may touch the models dir. */
  assertSafeModelKey(modelKey: string): string {
    if (
      typeof modelKey !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(modelKey)
    ) {
      throw new Error(`Invalid model key: ${modelKey}`);
    }
    if (modelKey.includes('..') || modelKey.includes('/') || modelKey.includes('\\')) {
      throw new Error(`Invalid model key: ${modelKey}`);
    }
    return modelKey;
  }

  private modelPaths(modelKey: string): { onnx: string; json: string } {
    const key = this.assertSafeModelKey(modelKey);
    const dir = path.resolve(this.modelsDir);
    const onnx = path.resolve(dir, `${key}.onnx`);
    const json = onnx + '.json';
    const prefix = dir.endsWith(path.sep) ? dir : dir + path.sep;
    if (!onnx.startsWith(prefix) && onnx !== dir) {
      throw new Error(`Model path escapes models dir: ${modelKey}`);
    }
    return { onnx, json };
  }

  getModelPath(modelKey: string): string | null {
    const { onnx } = this.modelPaths(modelKey);
    return fs.existsSync(onnx) ? onnx : null;
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
    const key = this.assertSafeModelKey(modelKey);
    const entry = this.registry.find((m) => m.key === key);
    if (!entry) throw new Error(`Unknown model key: ${key}`);
    fs.mkdirSync(this.modelsDir, { recursive: true });
    const { onnx: onnxPath, json: jsonPath } = this.modelPaths(key);
    this.downloads.set(key, { progress: 0 });
    try {
      await this.downloadFile(entry.onnxUrl, onnxPath, (pct) => {
        this.downloads.set(key, { progress: Math.round(pct * 0.95) });
        onProgress?.(Math.round(pct * 0.95));
      });
      await this.downloadFile(entry.jsonUrl, jsonPath);
      this.downloads.set(key, { progress: 100 });
      onProgress?.(100);
      // G28 TODO-22: evict completed status after a short window
      setTimeout(() => this.downloads.delete(key), 60_000).unref?.();
      return onnxPath;
    } catch (e) {
      this.downloads.set(key, {
        progress: 0,
        error: (e as Error).message,
      });
      setTimeout(() => this.downloads.delete(key), 60_000).unref?.();
      throw e;
    }
  }

  delete(modelKey: string): void {
    const key = this.assertSafeModelKey(modelKey);
    const installed = this.listInstalled();
    if (installed.length <= 1 && installed.includes(key)) {
      throw new Error('Cannot delete the last installed model');
    }
    if (!installed.includes(key) && !this.registry.some((m) => m.key === key)) {
      throw new Error(`Unknown model key: ${key}`);
    }
    const { onnx, json } = this.modelPaths(key);
    if (fs.existsSync(onnx)) fs.unlinkSync(onnx);
    if (fs.existsSync(json)) fs.unlinkSync(json);
    this.downloads.delete(key);
  }

  downloadStatus(modelKey: string) {
    try {
      return this.downloads.get(this.assertSafeModelKey(modelKey)) || null;
    } catch {
      return null;
    }
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
