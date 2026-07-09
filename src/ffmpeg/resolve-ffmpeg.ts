/**
 * Resolve ffmpeg/ffprobe binaries when GUI/Electron PATH lacks Homebrew/local bins.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CANDIDATE_DIRS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  path.join(os.homedir(), 'bin'),
  // Windows common locations
  'C:\\ffmpeg\\bin',
  'C:\\Program Files\\ffmpeg\\bin',
  'C:\\ProgramData\\chocolatey\\bin',
];

export interface ResolvedFfmpeg {
  ffmpeg: string;
  ffprobe: string;
  available: boolean;
  versionLine?: string;
  error?: string;
}

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    // On Windows X_OK is flaky; existence is enough
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
    // bare name without ext on win
    const bare = path.join(dir, name);
    if (isExecutable(bare)) return bare;
    if (process.platform === 'win32' && isExecutable(bare + '.exe')) {
      return bare + '.exe';
    }
  }
  return null;
}

function findInCandidates(name: string): string | null {
  for (const dir of CANDIDATE_DIRS) {
    const p =
      process.platform === 'win32'
        ? path.join(dir, `${name}.exe`)
        : path.join(dir, name);
    if (isExecutable(p)) return p;
    if (process.platform === 'win32') {
      const bare = path.join(dir, name);
      if (isExecutable(bare)) return bare;
    }
  }
  return null;
}

/**
 * Prefer explicit env, then PATH, then well-known install locations.
 */
export function resolveFfmpegBinary(
  preferred?: string,
  name: 'ffmpeg' | 'ffprobe' = 'ffmpeg',
): string {
  if (preferred && preferred.trim()) {
    if (isExecutable(preferred) || preferred === name) {
      // allow bare "ffmpeg" if it works via PATH at spawn time
      if (preferred === name || preferred === 'ffprobe') {
        const fromPath = whichFromPath(preferred);
        if (fromPath) return fromPath;
        const found = findInCandidates(preferred);
        if (found) return found;
        return preferred;
      }
      if (isExecutable(preferred)) return preferred;
    }
  }

  const envKey = name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH';
  const fromEnv = process.env[envKey];
  if (fromEnv && isExecutable(fromEnv)) return fromEnv;

  const fromPath = whichFromPath(name);
  if (fromPath) return fromPath;

  const found = findInCandidates(name);
  if (found) return found;

  return name; // last resort: bare name
}

export function probeFfmpegAvailability(
  ffmpegPath?: string,
  ffprobePath?: string,
): ResolvedFfmpeg {
  const ffmpeg = resolveFfmpegBinary(ffmpegPath, 'ffmpeg');
  const ffprobe = resolveFfmpegBinary(ffprobePath, 'ffprobe');

  const r = spawnSync(ffmpeg, ['-version'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: augmentedPath(),
    },
  });

  if (r.error || r.status !== 0) {
    return {
      ffmpeg,
      ffprobe,
      available: false,
      error:
        r.error?.message ||
        (r.stderr || r.stdout || `exit ${r.status}`).toString().slice(0, 200),
    };
  }

  const versionLine = (r.stdout || '').split('\n')[0]?.trim();
  return { ffmpeg, ffprobe, available: true, versionLine };
}

/** PATH with common package-manager bin dirs prepended (Electron GUI apps). */
export function augmentedPath(): string {
  const sep = process.platform === 'win32' ? ';' : ':';
  const current = process.env.PATH || process.env.Path || '';
  const extras = CANDIDATE_DIRS.filter((d) => {
    try {
      return fs.existsSync(d);
    } catch {
      return false;
    }
  });
  return [...extras, current].join(sep);
}
