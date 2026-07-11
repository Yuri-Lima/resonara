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
 * Safe token for PowerShell single-quoted strings and voice names.
 * Rejects quote-breaking / injection payloads (G28 TODO-02).
 */
export function assertSafePsToken(value: string, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    throw new Error(`Invalid ${label}: empty or too long`);
  }
  // Allow letters, digits, spaces, common voice punctuation — no quotes, $, `;, |, etc.
  if (!/^[\w .()\-+#]+$/u.test(value)) {
    throw new Error(`Invalid ${label}: disallowed characters`);
  }
  if (value.includes("'") || value.includes('"') || value.includes('`')) {
    throw new Error(`Invalid ${label}: quotes not allowed`);
  }
  return value;
}

/**
 * Build PowerShell script that uses System.Speech.Synthesis to write a WAV file.
 * Uses -EncodedCommand (UTF-16LE base64) so user-influenced paths/voices never
 * pass through shell metacharacter parsing of -Command strings (G28 TODO-02).
 */
export function buildWindowsSpeechScript(opts: {
  textFile: string;
  outPath: string;
  voice?: string;
  rate?: number; // -10..10 for SAPI Rate
}): WinPsArgs {
  // Paths may include drive letters and backslashes — block PS metacharacters only
  const safePath = (p: string, label: string): string => {
    if (typeof p !== 'string' || !p || p.length > 512) {
      throw new Error(`Invalid ${label}`);
    }
    if (/[`$'";|&<>]/.test(p) || p.includes('\0')) {
      throw new Error(`Invalid ${label}: disallowed characters`);
    }
    return p;
  };
  const outPath = safePath(opts.outPath, 'outPath');
  const inPath = safePath(opts.textFile, 'textFile');
  const voice =
    opts.voice != null && opts.voice !== ''
      ? assertSafePsToken(opts.voice, 'voice')
      : undefined;
  const rateLine =
    opts.rate != null && Number.isFinite(opts.rate)
      ? `$s.Rate = ${Math.max(-10, Math.min(10, Math.round(opts.rate)))};`
      : '';
  const voiceLine = voice ? `$s.SelectVoice('${voice}');` : '';
  // Read UTF-8 text file; write WAV via SetOutputToWaveFile
  const script = [
    `Add-Type -AssemblyName System.Speech;`,
    `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;`,
    voiceLine,
    rateLine,
    `$text = [System.IO.File]::ReadAllText('${inPath}', [System.Text.Encoding]::UTF8);`,
    `$s.SetOutputToWaveFile('${outPath}');`,
    `$s.Speak($text);`,
    `$s.Dispose();`,
  ]
    .filter(Boolean)
    .join(' ');

  // EncodedCommand: UTF-16LE base64 — avoids -Command injection surface
  const encoded = Buffer.from(script, 'utf16le').toString('base64');

  return {
    bin: 'powershell.exe',
    args: [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encoded,
    ],
    script,
  };
}

/**
 * Parse a single `say -v '?'` line into name + locale.
 * Handles multi-word names: "Eddy (Portuguese (Brazil)) pt_BR    # ..."
 * and simple: "Luciana             pt_BR    # ..."
 */
export function parseMacSayVoiceLine(line: string): VoiceInfo | null {
  if (!line || !line.trim()) return null;
  // Locale is typically xx_YY before optional # comment
  const m = line.match(
    /^(.+?)\s+([a-z]{2}[_-][A-Z]{2})\s*(?:#.*)?$/i,
  );
  if (!m) {
    const simple = line.match(/^(\S+)\s+(\S+)/);
    if (!simple) return null;
    return {
      id: simple[1],
      name: simple[1],
      language: normalizeLocaleTag(simple[2]),
    };
  }
  const name = m[1].trim();
  const locale = normalizeLocaleTag(m[2]);
  return { id: name, name, language: locale };
}

/** Map macOS/Windows locale tags to product LanguageCode-ish strings. */
export function normalizeLocaleTag(tag: string): string {
  if (!tag) return tag;
  const t = tag.replace(/_/g, '-');
  // Keep region: pt-BR, en-US, pt-PT
  if (/^[a-z]{2}-[a-z]{2}$/i.test(t)) {
    const [lang, region] = t.split('-');
    return `${lang.toLowerCase()}-${region.toUpperCase()}`;
  }
  return t;
}

export function listMacVoices(): VoiceInfo[] {
  const r = spawnSync('say', ['-v', '?'], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return [];
  const voices: VoiceInfo[] = [];
  for (const line of r.stdout.split('\n')) {
    const v = parseMacSayVoiceLine(line);
    if (v) voices.push(v);
  }
  return voices;
}

export function listWindowsVoices(): VoiceInfo[] {
  // Enumerate via Culture.Name — never parse localized display strings
  const script =
    `Add-Type -AssemblyName System.Speech; ` +
    `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
    `$s.GetInstalledVoices() | ForEach-Object { ` +
    `$_.VoiceInfo.Name + [char]9 + $_.VoiceInfo.Culture.Name ` +
    `}`;
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
    .map((line) => {
      const [name, culture] = line.split('\t');
      return {
        id: name,
        name,
        language: culture ? normalizeLocaleTag(culture) : undefined,
      };
    });
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

/** Default timeout for OS TTS (say / PowerShell). G28 TODO-03. */
export const PLATFORM_TTS_TIMEOUT_MS = 120_000;

function runCommand(
  bin: string,
  args: string[],
  timeoutMs: number = PLATFORM_TTS_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      finish(new Error(`${bin} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => finish(err));
    child.on('close', (code) => {
      if (code === 0) finish();
      else
        finish(
          new Error(`${bin} exited ${code}: ${stderr.slice(0, 500)}`),
        );
    });
  });
}
