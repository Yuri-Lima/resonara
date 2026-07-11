/**
 * Piper neural TTS adapter — offline ONNX synthesis via child_process.
 * Binary resolution mirrors resolve-ffmpeg.ts for Electron/GUI apps.
 */
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface PiperVoiceInfo {
  id: string;
  name: string;
  language: string;
  quality: string;
  sampleRate: number;
  gender?: string;
  modelPath: string;
  configPath: string;
  engine: 'piper';
}

export interface PiperSynthOptions {
  text: string;
  modelPath: string;
  outputPath: string;
  /** Speaking rate scale (1.0 = normal). Maps to length_scale inverse. */
  lengthScale?: number;
  speakerId?: number;
  timeoutMs?: number;
  jsonInput?: boolean;
  /**
   * Seconds of silence after each sentence (piper --sentence_silence).
   * Wired from the active PauseProfile; assembly inserts only the delta
   * so we do not double-pause.
   */
  sentenceSilenceSec?: number;
}

export interface PiperAvailability {
  available: boolean;
  binary?: string;
  modelsDir?: string;
  voiceCount: number;
  detail?: string;
}

const CANDIDATE_DIRS = [
  // Prefer Python piper-tts venv (reliable on macOS arm64) over broken native tarballs
  path.join(process.cwd(), 'tools', 'piper-venv', 'bin'),
  path.join(process.cwd(), 'tools', 'piper-venv', 'Scripts'),
  path.join(process.cwd(), 'resources', 'piper'),
  path.join(os.homedir(), '.resonara', 'piper'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  path.join(os.homedir(), 'bin'),
  'C:\\piper',
  'C:\\Program Files\\piper',
];

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    try {
      return fs.statSync(filePath).isFile();
    } catch {
      return false;
    }
  }
}

function whichFromPath(name: string): string | null {
  const pathEnv = process.env.PATH || process.env.Path || '';
  const sep = process.platform === 'win32' ? ';' : ':';
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
      : [''];
  for (const dir of pathEnv.split(sep).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext.toLowerCase());
      const alt = path.join(dir, name + ext);
      if (isExecutable(candidate)) return candidate;
      if (ext && isExecutable(alt)) return alt;
    }
    const bare = path.join(dir, name);
    if (isExecutable(bare)) return bare;
    if (process.platform === 'win32' && isExecutable(bare + '.exe')) {
      return bare + '.exe';
    }
  }
  return null;
}

function electronResourcesPiper(): string | null {
  const res = process.env.ELECTRON_RESOURCES_PATH || (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (!res) return null;
  const candidates = [
    path.join(res, 'piper', process.platform === 'win32' ? 'piper.exe' : 'piper'),
    path.join(res, 'piper', 'piper', process.platform === 'win32' ? 'piper.exe' : 'piper'),
  ];
  for (const c of candidates) {
    if (isExecutable(c)) return c;
  }
  return null;
}

/**
 * Resolve Piper executable: env → Electron resources → bundled → PATH → candidates.
 */
/**
 * Prefer a runnable Piper (help succeeds) over a broken native binary
 * that is present but missing dylibs (common with official macOS tarballs).
 */
export function resolvePiperBinary(preferred?: string): string | null {
  const candidates: string[] = [];
  const push = (p: string | null | undefined) => {
    if (p && isExecutable(p) && !candidates.includes(p)) candidates.push(p);
  };

  if (preferred && preferred.trim()) push(preferred.trim());
  push(process.env.PIPER_PATH);
  push(electronResourcesPiper());

  for (const dir of CANDIDATE_DIRS) {
    push(
      process.platform === 'win32'
        ? path.join(dir, 'piper.exe')
        : path.join(dir, 'piper'),
    );
    push(
      process.platform === 'win32'
        ? path.join(dir, 'piper', 'piper.exe')
        : path.join(dir, 'piper', 'piper'),
    );
  }
  push(whichFromPath('piper'));

  // First pass: return first candidate that actually runs --help
  for (const bin of candidates) {
    if (piperBinaryRunnable(bin)) return bin;
  }
  // Fallback: any executable path (tests / mock binaries)
  return candidates[0] ?? null;
}

function piperBinaryRunnable(binary: string): boolean {
  try {
    const env = libraryPathEnv(binary);
    const help = spawnSync(binary, ['--help'], {
      encoding: 'utf8',
      env,
      timeout: 8000,
    });
    const out = `${help.stdout || ''}${help.stderr || ''}`.toLowerCase();
    return (
      help.status === 0 ||
      out.includes('usage') ||
      out.includes('--model') ||
      out.includes('output_file') ||
      out.includes('output-file')
    );
  } catch {
    return false;
  }
}

export function resolvePiperModelsDir(preferred?: string): string {
  if (preferred && fs.existsSync(preferred)) return preferred;
  if (process.env.PIPER_MODELS_DIR && fs.existsSync(process.env.PIPER_MODELS_DIR)) {
    return process.env.PIPER_MODELS_DIR;
  }
  const res = process.env.ELECTRON_RESOURCES_PATH || (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (res) {
    const p = path.join(res, 'piper', 'models');
    if (fs.existsSync(p)) return p;
  }
  const candidates = [
    path.join(process.cwd(), 'resources', 'piper', 'models'),
    path.join(os.homedir(), '.resonara', 'piper', 'models'),
    path.join(os.homedir(), '.local', 'share', 'piper', 'voices'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const fallback = path.join(os.homedir(), '.resonara', 'piper', 'models');
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

function libraryPathEnv(binary: string): NodeJS.ProcessEnv {
  const dir = path.dirname(binary);
  const env = { ...process.env };
  if (process.platform === 'darwin') {
    env.DYLD_LIBRARY_PATH = [dir, env.DYLD_LIBRARY_PATH || '']
      .filter(Boolean)
      .join(':');
  } else if (process.platform === 'linux') {
    env.LD_LIBRARY_PATH = [dir, env.LD_LIBRARY_PATH || '']
      .filter(Boolean)
      .join(':');
  }
  // espeak data next to binary
  const espeakData = path.join(dir, 'espeak-ng-data');
  if (fs.existsSync(espeakData)) {
    env.ESPEAK_DATA_PATH = espeakData;
  }
  return env;
}

export function listPiperVoices(modelsDir?: string): PiperVoiceInfo[] {
  const dir = resolvePiperModelsDir(modelsDir);
  if (!fs.existsSync(dir)) return [];
  const voices: PiperVoiceInfo[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!ent.name.endsWith('.onnx') || ent.name.endsWith('.onnx.json')) continue;
      const configPath = full + '.json';
      if (!fs.existsSync(configPath)) continue;
      let sampleRate = 22050;
      let quality = 'medium';
      let language = 'en';
      let gender: string | undefined;
      try {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
          audio?: { sample_rate?: number; quality?: string };
          espeak?: { voice?: string };
          language?: { code?: string };
          num_speakers?: number;
        };
        sampleRate = cfg.audio?.sample_rate ?? sampleRate;
        quality = cfg.audio?.quality ?? quality;
        language =
          cfg.language?.code ||
          cfg.espeak?.voice?.replace(/-.*/, '') ||
          language;
      } catch {
        /* use defaults */
      }
      const base = path.basename(ent.name, '.onnx');
      // Heuristic gender from name
      const lower = base.toLowerCase();
      if (/(amy|kathleen|lessac|jenny|cori|northern_english_female)/.test(lower)) {
        gender = 'female';
      } else if (/(ryan|joe|sam|john|danny|alan)/.test(lower)) {
        gender = 'male';
      }
      voices.push({
        id: `piper:${base}`,
        name: base.replace(/_/g, ' '),
        language,
        quality,
        sampleRate,
        gender,
        modelPath: full,
        configPath,
        engine: 'piper',
      });
    }
  };
  walk(dir);
  return voices.sort((a, b) => a.id.localeCompare(b.id));
}

export function isPiperAvailable(
  binaryPreferred?: string,
  modelsDir?: string,
): PiperAvailability {
  const binary = resolvePiperBinary(binaryPreferred);
  if (!binary) {
    return {
      available: false,
      voiceCount: 0,
      detail: 'Piper binary not found (set PIPER_PATH or install under resources/piper)',
    };
  }
  // Smoke: try --help (may fail if dylibs missing)
  const env = libraryPathEnv(binary);
  const help = spawnSync(binary, ['--help'], {
    encoding: 'utf8',
    env,
    timeout: 5000,
  });
  const helpOk =
    help.status === 0 ||
    (help.stdout || help.stderr || '').toLowerCase().includes('usage') ||
    (help.stdout || help.stderr || '').includes('--model');
  if (help.error || (!helpOk && help.status !== 0)) {
    const detail =
      help.error?.message ||
      (help.stderr || help.stdout || 'piper failed to start').toString().slice(0, 300);
    return {
      available: false,
      binary,
      voiceCount: 0,
      detail: `Piper binary found but not runnable: ${detail}`,
    };
  }
  const voices = listPiperVoices(modelsDir);
  return {
    available: voices.length > 0,
    binary,
    modelsDir: resolvePiperModelsDir(modelsDir),
    voiceCount: voices.length,
    detail:
      voices.length > 0
        ? 'ok'
        : 'Piper binary OK but no .onnx models found (set PIPER_MODELS_DIR)',
  };
}

export async function synthesizeWithPiper(
  opts: PiperSynthOptions,
): Promise<{ outPath: string; sampleRate?: number }> {
  const binary = resolvePiperBinary();
  if (!binary) {
    throw new Error('Piper binary not found');
  }
  if (!opts.text || !opts.text.trim()) {
    throw new Error('Piper synthesis requires non-empty text');
  }
  if (!fs.existsSync(opts.modelPath)) {
    throw new Error(`Piper model not found: ${opts.modelPath}`);
  }
  await fs.promises.mkdir(path.dirname(opts.outputPath), { recursive: true });

  const args = [
    '--model',
    opts.modelPath,
    '--output_file',
    opts.outputPath,
  ];
  if (opts.jsonInput) {
    args.push('--json-input');
  }
  if (opts.speakerId != null) {
    args.push('--speaker', String(opts.speakerId));
  }
  if (opts.lengthScale != null && Number.isFinite(opts.lengthScale)) {
    args.push('--length_scale', String(opts.lengthScale));
  }
  // Prefer hyphen form (Python piper-tts CLI); underscore accepted as alias.
  if (
    opts.sentenceSilenceSec != null &&
    Number.isFinite(opts.sentenceSilenceSec) &&
    opts.sentenceSilenceSec >= 0
  ) {
    args.push('--sentence_silence', String(opts.sentenceSilenceSec));
  }

  const env = libraryPathEnv(binary);
  const timeoutMs = opts.timeoutMs ?? 600_000;

  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.dirname(binary),
    });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Piper timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Piper exited ${code}: ${stderr.slice(0, 500) || 'no stderr'}`,
          ),
        );
    });

    const payload = opts.jsonInput
      ? JSON.stringify({ text: opts.text }) + '\n'
      : opts.text;
    child.stdin?.write(payload, 'utf8');
    child.stdin?.end();
  });

  try {
    const st = await fs.promises.stat(opts.outputPath);
    if (st.size === 0) {
      throw new Error('Piper produced empty WAV');
    }
  } catch (e) {
    throw new Error(
      `Piper output missing or empty: ${opts.outputPath} (${(e as Error).message})`,
    );
  }

  let sampleRate: number | undefined;
  const cfgPath = opts.modelPath + '.json';
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
        audio?: { sample_rate?: number };
      };
      sampleRate = cfg.audio?.sample_rate;
    } catch {
      /* ignore */
    }
  }
  return { outPath: opts.outputPath, sampleRate };
}

/**
 * Stream raw PCM from Piper stdout (--output-raw).
 */
export function synthesizePiperStream(
  opts: Omit<PiperSynthOptions, 'outputPath'>,
): import('stream').Readable {
  const binary = resolvePiperBinary();
  if (!binary) throw new Error('Piper binary not found');
  const args = ['--model', opts.modelPath, '--output-raw'];
  if (opts.jsonInput) args.push('--json-input');
  const env = libraryPathEnv(binary);
  const child = spawn(binary, args, {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: path.dirname(binary),
  });
  const payload = opts.jsonInput
    ? JSON.stringify({ text: opts.text }) + '\n'
    : opts.text;
  child.stdin?.write(payload, 'utf8');
  child.stdin?.end();
  if (!child.stdout) throw new Error('Piper stdout unavailable');
  return child.stdout;
}
