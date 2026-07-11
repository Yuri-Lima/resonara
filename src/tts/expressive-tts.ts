/**
 * Expressive tier adapter (Engine #4) — Chatterbox / offline Python sidecar.
 * Same surface as piper-tts / kokoro-tts: listVoices/synthesize/isAvailable/getVersion.
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ExpressiveVoiceInfo {
  id: string;
  name: string;
  language: string;
  gender?: string;
  engine: 'expressive';
  capabilities: {
    paralinguisticTags: boolean;
    emotionControl: boolean;
    cloning: boolean;
    streaming: boolean;
  };
}

export interface ExpressiveSynthOptions {
  text: string;
  outputPath: string;
  voiceId?: string;
  /** 0..1 emotion exaggeration (Chatterbox). */
  exaggeration?: number;
  cfgWeight?: number;
  rate?: number;
  /** Optional reference wav for cloning — requires consent flag. */
  referenceAudioPath?: string;
  /** User affirmed rights to reference audio. */
  cloneConsent?: boolean;
  timeoutMs?: number;
  language?: string;
}

export const EXPRESSIVE_MAX_CHARS = 280;

const CAPS = {
  paralinguisticTags: true,
  emotionControl: true,
  cloning: true,
  streaming: false,
} as const;

export function resolveExpressivePython(): string | null {
  const env = process.env.EXPRESSIVE_PYTHON;
  if (env && fs.existsSync(env)) return env;
  const venv = path.join(
    process.cwd(),
    'tools',
    'expressive-venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
  if (fs.existsSync(venv)) return venv;
  return null;
}

export function resolveExpressiveSynthScript(): string | null {
  const p = path.join(process.cwd(), 'tools', 'expressive', 'synthesize.py');
  return fs.existsSync(p) ? p : null;
}

export function resolveExpressiveModelsDir(): string {
  return (
    process.env.EXPRESSIVE_MODELS_DIR ||
    path.join(os.homedir(), '.resonara', 'expressive-pack') ||
    path.join(process.cwd(), 'tools', 'expressive', 'models')
  );
}

export function isExpressiveAvailable(): boolean {
  const py = resolveExpressivePython();
  const script = resolveExpressiveSynthScript();
  if (!py || !script) return false;
  // Models may download on first use; script presence is enough for "installed runtime"
  // but pack readiness is separate.
  try {
    fs.accessSync(py, fs.constants.X_OK);
  } catch {
    try {
      fs.accessSync(py, fs.constants.R_OK);
    } catch {
      return false;
    }
  }
  return true;
}

export function isExpressivePackReady(): boolean {
  const dir = resolveExpressiveModelsDir();
  // Marker file written by download manager after checksum verify
  return fs.existsSync(path.join(dir, '.pack-ready'));
}

export function listExpressiveVoices(): ExpressiveVoiceInfo[] {
  if (!isExpressiveAvailable()) return [];
  return [
    {
      id: 'expressive:chatterbox-turbo',
      name: 'Chatterbox Turbo (expressive)',
      language: 'en-US',
      gender: 'neutral',
      engine: 'expressive',
      capabilities: { ...CAPS },
    },
    {
      id: 'expressive:chatterbox-default',
      name: 'Chatterbox (expressive, exaggeration)',
      language: 'en-US',
      gender: 'neutral',
      engine: 'expressive',
      capabilities: { ...CAPS },
    },
    {
      id: 'expressive:chatterbox-pt-br',
      name: 'Chatterbox Multilingual pt-BR',
      language: 'pt-BR',
      gender: 'neutral',
      engine: 'expressive',
      capabilities: { ...CAPS, paralinguisticTags: false },
    },
  ];
}

export function getExpressiveVersion(): {
  available: boolean;
  packReady: boolean;
  detail?: string;
} {
  const avail = isExpressiveAvailable();
  const pack = isExpressivePackReady();
  if (!avail) {
    return {
      available: false,
      packReady: false,
      detail:
        'Expressive runtime missing. Run: node scripts/download-expressive-pack.js',
    };
  }
  return {
    available: true,
    packReady: pack,
    detail: pack
      ? 'Chatterbox expressive tier (pack ready)'
      : 'Runtime present; download Expressive Pack for offline weights',
  };
}

export async function synthesizeWithExpressive(
  opts: ExpressiveSynthOptions,
): Promise<void> {
  if (!isExpressiveAvailable()) {
    throw new Error(
      'Expressive engine unavailable. Install tools/expressive-venv and synthesize.py',
    );
  }
  if (opts.referenceAudioPath && !opts.cloneConsent) {
    throw new Error(
      'Voice cloning requires cloneConsent=true (user affirms rights to reference audio)',
    );
  }
  const py = resolveExpressivePython()!;
  const script = resolveExpressiveSynthScript()!;
  const timeout = opts.timeoutMs ?? 600_000;

  const args = [
    script,
    '--text',
    opts.text,
    '--output',
    opts.outputPath,
  ];
  if (opts.voiceId) args.push('--voice', opts.voiceId);
  if (opts.exaggeration != null) {
    args.push('--exaggeration', String(opts.exaggeration));
  }
  if (opts.cfgWeight != null) args.push('--cfg-weight', String(opts.cfgWeight));
  if (opts.referenceAudioPath) {
    args.push('--ref', opts.referenceAudioPath);
  }
  if (opts.language) args.push('--language', opts.language);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(py, args, {
      env: {
        ...process.env,
        EXPRESSIVE_MODELS_DIR: resolveExpressiveModelsDir(),
      },
    });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Expressive synth timed out after ${timeout}ms`));
    }, timeout);
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-4000);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(opts.outputPath)) {
        resolve();
      } else {
        reject(
          new Error(
            `Expressive synth failed (code ${code}): ${stderr.slice(0, 800)}`,
          ),
        );
      }
    });
  });
}

/** Fallback chain: expressive → kokoro → piper → platform. Never cross languages. */
export function expressiveFallbackChain(): Array<
  'expressive' | 'kokoro' | 'piper' | 'platform'
> {
  return ['expressive', 'kokoro', 'piper', 'platform'];
}
