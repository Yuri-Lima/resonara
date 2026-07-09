/**
 * Platform TTS adapters — build real OS invocations (macOS `say`, Windows PowerShell SAPI).
 * Synthesis runs via child_process; unit tests cover command builders + platform selection.
 */
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type TtsPlatform = 'darwin' | 'win32' | 'linux' | 'unsupported';

export interface VoiceInfo {
  id: string;
  name: string;
  language?: string;
}

export interface SynthesizeOptions {
  text: string;
  outPath: string;
  voice?: string;
  rate?: number; // words per minute-ish; platform mapped
  platform?: NodeJS.Platform;
}

export interface MacSayArgs {
  bin: string;
  args: string[];
}

export interface WinPsArgs {
  bin: string;
  args: string[];
  script: string;
}

export function detectTtsPlatform(
  platform: NodeJS.Platform = process.platform,
): TtsPlatform {
  if (platform === 'darwin') return 'darwin';
  if (platform === 'win32') return 'win32';
  if (platform === 'linux') return 'linux';
  return 'unsupported';
}

/** Build `say` argv for macOS (AIFF/CAF output). */
export function buildMacSayCommand(opts: {
  textFile: string;
  outPath: string;
  voice?: string;
  rate?: number;
}): MacSayArgs {
  const args: string[] = [];
  if (opts.voice) {
    args.push('-v', opts.voice);
  }
  if (opts.rate != null && Number.isFinite(opts.rate)) {
    args.push('-r', String(Math.round(opts.rate)));
  }
  args.push('-o', opts.outPath, '-f', opts.textFile);
  return { bin: 'say', args };
}

/**
 * Build PowerShell script that uses System.Speech.Synthesis to write a WAV file.
 * Invoked as: powershell -NoProfile -ExecutionPolicy Bypass -Command <script>
 */
export function buildWindowsSpeechScript(opts: {
  textFile: string;
  outPath: string;
  voice?: string;
  rate?: number; // -10..10 for SAPI Rate
}): WinPsArgs {
  const voiceLine = opts.voice
    ? `$s.SelectVoice(${psQuote(opts.voice)});`
    : '';
  const rateLine =
    opts.rate != null && Number.isFinite(opts.rate)
      ? `$s.Rate = ${Math.max(-10, Math.min(10, Math.round(opts.rate)))};`
      : '';
  // Read UTF-8 text file; write WAV via SetOutputToWaveFile
  const script = [
    `Add-Type -AssemblyName System.Speech;`,
    `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;`,
    voiceLine,
    rateLine,
    `$text = [System.IO.File]::ReadAllText(${psQuote(opts.textFile)}, [System.Text.Encoding]::UTF8);`,
    `$s.SetOutputToWaveFile(${psQuote(opts.outPath)});`,
    `$s.Speak($text);`,
    `$s.Dispose();`,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    bin: 'powershell.exe',
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    script,
  };
}

function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

export function listMacVoices(): VoiceInfo[] {
  const r = spawnSync('say', ['-v', '?'], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return [];
  const voices: VoiceInfo[] = [];
  for (const line of r.stdout.split('\n')) {
    // e.g. "Alex                en_US    # ..."
    const m = line.match(/^(\S+)\s+(\S+)/);
    if (m) voices.push({ id: m[1], name: m[1], language: m[2] });
  }
  return voices;
}

export function listWindowsVoices(): VoiceInfo[] {
  const script =
    `Add-Type -AssemblyName System.Speech; ` +
    `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
    `$s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }`;
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8' },
  );
  if (r.status !== 0 || !r.stdout) return [];
  return r.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((name) => ({ id: name, name }));
}

export function listVoices(
  platform: NodeJS.Platform = process.platform,
): VoiceInfo[] {
  const p = detectTtsPlatform(platform);
  if (p === 'darwin') return listMacVoices();
  if (p === 'win32') return listWindowsVoices();
  return [];
}

export function ttsEngineAvailable(
  platform: NodeJS.Platform = process.platform,
): { available: boolean; engine: string; detail?: string } {
  const p = detectTtsPlatform(platform);
  if (p === 'darwin') {
    const r = spawnSync('say', ['-v', '?'], { encoding: 'utf8' });
    return {
      available: r.status === 0,
      engine: 'macOS say',
      detail: r.status === 0 ? 'ok' : r.stderr || 'say failed',
    };
  }
  if (p === 'win32') {
    const r = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Add-Type -AssemblyName System.Speech; "ok"',
      ],
      { encoding: 'utf8' },
    );
    return {
      available: r.status === 0 && (r.stdout || '').includes('ok'),
      engine: 'Windows System.Speech',
      detail: r.status === 0 ? 'ok' : r.stderr || 'powershell speech failed',
    };
  }
  return {
    available: false,
    engine: 'none',
    detail: `No system TTS adapter for ${platform}`,
  };
}

/**
 * Synthesize one chunk to an audio file using the native platform engine.
 * macOS writes AIFF; Windows writes WAV. Caller may convert/concat with ffmpeg.
 */
export async function synthesizeChunk(
  opts: SynthesizeOptions,
): Promise<{ outPath: string; platform: TtsPlatform }> {
  const platform = opts.platform ?? process.platform;
  const p = detectTtsPlatform(platform);
  await fs.promises.mkdir(path.dirname(opts.outPath), { recursive: true });

  const textFile = path.join(
    os.tmpdir(),
    `resonara-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );
  await fs.promises.writeFile(textFile, opts.text, 'utf8');

  try {
    if (p === 'darwin') {
      // Prefer aiff extension for say
      const out = opts.outPath.endsWith('.aiff')
        ? opts.outPath
        : opts.outPath.replace(/\.[^.]+$/, '') + '.aiff';
      const cmd = buildMacSayCommand({
        textFile,
        outPath: out,
        voice: opts.voice,
        rate: opts.rate,
      });
      await runCommand(cmd.bin, cmd.args);
      if (out !== opts.outPath) {
        await fs.promises.rename(out, opts.outPath).catch(async () => {
          await fs.promises.copyFile(out, opts.outPath);
          await fs.promises.unlink(out).catch(() => undefined);
        });
      }
      return { outPath: opts.outPath, platform: p };
    }

    if (p === 'win32') {
      const out = opts.outPath.endsWith('.wav')
        ? opts.outPath
        : opts.outPath.replace(/\.[^.]+$/, '') + '.wav';
      const cmd = buildWindowsSpeechScript({
        textFile,
        outPath: out,
        voice: opts.voice,
        rate: opts.rate,
      });
      await runCommand(cmd.bin, cmd.args);
      if (out !== opts.outPath) {
        await fs.promises.rename(out, opts.outPath).catch(async () => {
          await fs.promises.copyFile(out, opts.outPath);
          await fs.promises.unlink(out).catch(() => undefined);
        });
      }
      return { outPath: opts.outPath, platform: p };
    }

    throw new Error(
      `System TTS not supported on platform ${platform}. Resonara v1 supports macOS and Windows.`,
    );
  } finally {
    await fs.promises.unlink(textFile).catch(() => undefined);
  }
}

function runCommand(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}
