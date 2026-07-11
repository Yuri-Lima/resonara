/**
 * Kokoro neural TTS adapter (Phase 8).
 * Plug-compatible surface with piper-tts.ts.
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface KokoroVoiceInfo {
  id: string;
  name: string;
  language: string;
  gender?: string;
  engine: 'kokoro';
  nativeId: string;
}

export interface KokoroSynthOptions {
  text: string;
  outputPath: string;
  voiceId?: string;
  rate?: number;
  timeoutMs?: number;
}

export function isKokoroAvailable(): boolean {
  const py =
    process.env.KOKORO_PYTHON ||
    path.join(process.cwd(), 'tools', 'kokoro-venv', 'bin', 'python');
  const model =
    process.env.KOKORO_MODEL ||
    path.join(process.cwd(), 'tools', 'kokoro', 'models', 'kokoro-v1.0.onnx');
  return fs.existsSync(py) && (fs.existsSync(model) || fs.existsSync(path.join(process.cwd(), 'tools', 'kokoro', 'models')));
}

export function listKokoroVoices(): KokoroVoiceInfo[] {
  // Common Kokoro voice ids (af_=American female, am_=American male, bf_/bm_=British)
  const ids = [
    'af_sarah',
    'af_bella',
    'af_nicole',
    'af_sky',
    'am_adam',
    'am_michael',
    'bf_emma',
    'bf_isabella',
    'bm_george',
    'bm_lewis',
  ];
  return ids.map((id) => parseKokoroVoice(id));
}

export function parseKokoroVoice(id: string): KokoroVoiceInfo {
  const bare = id.replace(/^kokoro:/, '');
  const prefix = bare.slice(0, 2);
  const lang =
    prefix === 'bf' || prefix === 'bm'
      ? 'en-GB'
      : prefix.startsWith('p')
        ? 'pt-BR'
        : 'en-US';
  const gender =
    prefix.endsWith('f') || bare.includes('_f') || /^[a-z]f_/.test(bare)
      ? 'female'
      : prefix.endsWith('m') || /^[a-z]m_/.test(bare)
        ? 'male'
        : undefined;
  return {
    id: `kokoro:${bare}`,
    name: bare.replace(/_/g, ' '),
    language: lang,
    gender,
    engine: 'kokoro',
    nativeId: bare,
  };
}

export function getKokoroVersion(): { available: boolean; detail?: string } {
  if (!isKokoroAvailable()) {
    return {
      available: false,
      detail: 'Kokoro not installed. Run: node scripts/download-kokoro.js',
    };
  }
  return { available: true, detail: 'kokoro-onnx (tools/kokoro-venv)' };
}

/**
 * Practical max input chars per Kokoro synth call (phoneme / context window safety).
 * Research: long strings degrade; chunker uses this for engine-aware sizing.
 */
export const KOKORO_MAX_CHARS = 400;

export async function synthesizeWithKokoro(
  opts: KokoroSynthOptions,
): Promise<void> {
  if (!isKokoroAvailable()) {
    throw new Error(
      'Kokoro unavailable. Run: node scripts/download-kokoro.js',
    );
  }
  const py =
    process.env.KOKORO_PYTHON ||
    path.join(process.cwd(), 'tools', 'kokoro-venv', 'bin', 'python');
  const script =
    process.env.KOKORO_SCRIPT ||
    path.join(process.cwd(), 'tools', 'kokoro', 'synthesize.py');
  if (!fs.existsSync(script)) {
    throw new Error(`Kokoro script missing: ${script}`);
  }
  const voice = (opts.voiceId || 'af_sarah').replace(/^kokoro:/, '');
  const timeoutMs = opts.timeoutMs ?? 120_000;
  await new Promise<void>((resolve, reject) => {
    const args = [
      script,
      '--text',
      opts.text,
      '--out',
      opts.outputPath,
      '--voice',
      voice,
    ];
    if (opts.rate != null) args.push('--rate', String(opts.rate));
    const child = spawn(py, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    // G28 TODO-05: single-settle so timeout kill does not double-reject
    let settled = false;
    const finish = (e?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (e) reject(e);
      else resolve();
    };
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      finish(new Error(`Kokoro timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stderr.on('data', (b) => {
      err += b.toString();
    });
    child.on('error', (e) => {
      finish(e);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        finish(new Error(`Kokoro exited ${code}: ${err.slice(0, 400)}`));
        return;
      }
      if (!fs.existsSync(opts.outputPath) || fs.statSync(opts.outputPath).size === 0) {
        finish(new Error('Kokoro produced empty output'));
        return;
      }
      finish();
    });
  });
}
