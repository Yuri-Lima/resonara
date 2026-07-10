/**
 * Offline Whisper STT via faster-whisper in tools/whisper-venv.
 * Word-level timestamps required for QA (Phase 6) and forced alignment (Phase 10).
 */
import { Injectable, Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export type WhisperModelSize = 'tiny' | 'base' | 'small' | 'medium';

export interface WhisperWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface WhisperSegment {
  text: string;
  startMs: number;
  endMs: number;
  words: WhisperWord[];
}

export interface WhisperTranscript {
  text: string;
  segments: WhisperSegment[];
  language: string;
  durationMs: number;
  model?: string;
  elapsedMs?: number;
}

export interface TranscribeOptions {
  model?: WhisperModelSize;
  language?: string;
  timeoutMs?: number;
  wordTimestamps?: boolean;
}

const DEFAULT_TIMEOUT_MS = 120_000;

@Injectable()
export class WhisperService {
  private readonly logger = new Logger(WhisperService.name);
  private readonly root: string;
  private readonly pythonPath: string;
  private readonly scriptPath: string;
  private readonly modelDir: string;

  constructor() {
    this.root = process.cwd();
    const bin = process.platform === 'win32' ? 'Scripts' : 'bin';
    const pyName = process.platform === 'win32' ? 'python.exe' : 'python';
    this.pythonPath =
      process.env.WHISPER_PYTHON ||
      path.join(this.root, 'tools', 'whisper-venv', bin, pyName);
    this.scriptPath =
      process.env.WHISPER_SCRIPT ||
      path.join(this.root, 'tools', 'whisper', 'transcribe.py');
    this.modelDir =
      process.env.WHISPER_MODEL_DIR ||
      path.join(this.root, 'tools', 'whisper', 'models');
  }

  isAvailable(): boolean {
    try {
      return fs.existsSync(this.pythonPath) && fs.existsSync(this.scriptPath);
    } catch {
      return false;
    }
  }

  getVersion(): { available: boolean; python?: string; script?: string; detail?: string } {
    if (!this.isAvailable()) {
      return {
        available: false,
        detail:
          'faster-whisper not installed. Run: node scripts/download-whisper.js',
      };
    }
    return {
      available: true,
      python: this.pythonPath,
      script: this.scriptPath,
      detail: 'faster-whisper (tools/whisper-venv)',
    };
  }

  async transcribe(
    audioPath: string,
    opts: TranscribeOptions = {},
  ): Promise<WhisperTranscript> {
    if (!audioPath || !fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }
    const st = fs.statSync(audioPath);
    if (st.size === 0) {
      throw new Error(`Audio file is empty: ${audioPath}`);
    }
    if (!this.isAvailable()) {
      throw new Error(
        'Whisper STT unavailable. Run: node scripts/download-whisper.js',
      );
    }

    const model = opts.model || 'tiny';
    const language = opts.language || 'en';
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const wordTs = opts.wordTimestamps !== false;

    const args = [
      this.scriptPath,
      audioPath,
      '--model',
      model,
      '--language',
      language,
      '--device',
      'cpu',
      '--compute-type',
      'int8',
    ];
    if (fs.existsSync(this.modelDir)) {
      args.push('--model-dir', this.modelDir);
    }
    if (!wordTs) args.push('--no-word-timestamps');

    return this.spawnJson(args, timeoutMs);
  }

  private spawnJson(args: string[], timeoutMs: number): Promise<WhisperTranscript> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timer: NodeJS.Timeout | null = null;
      let child: ChildProcess;

      try {
        child = spawn(this.pythonPath, args, {
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            HF_HOME: this.modelDir,
            HUGGINGFACE_HUB_CACHE: path.join(this.modelDir, 'hub'),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) {
        reject(e as Error);
        return;
      }

      const finish = (err?: Error, result?: WhisperTranscript) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (!child.killed) {
          try {
            child.kill('SIGKILL');
          } catch {
            /* ignore */
          }
        }
        if (err) reject(err);
        else resolve(result as WhisperTranscript);
      };

      timer = setTimeout(() => {
        this.logger.warn(`Whisper timed out after ${timeoutMs}ms`);
        finish(new Error(`Whisper transcription timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout?.on('data', (buf: Buffer) => {
        stdout += buf.toString('utf8');
      });
      child.stderr?.on('data', (buf: Buffer) => {
        const s = buf.toString('utf8');
        stderr += s;
        if (/Downloading|Loading|Transcrib/i.test(s)) {
          this.logger.debug(s.trim().slice(0, 200));
        }
      });

      child.on('error', (err) => finish(err));
      child.on('close', (code) => {
        if (settled) return;
        if (code !== 0) {
          finish(
            new Error(
              `Whisper exited ${code}: ${(stderr || stdout).slice(0, 500)}`,
            ),
          );
          return;
        }
        try {
          const line = stdout
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .pop();
          if (!line) {
            finish(new Error('Whisper produced empty stdout'));
            return;
          }
          const parsed = JSON.parse(line) as WhisperTranscript & {
            error?: string;
          };
          if (parsed.error) {
            finish(new Error(parsed.error));
            return;
          }
          if (typeof parsed.text !== 'string') {
            finish(new Error('Whisper JSON missing text field'));
            return;
          }
          parsed.segments = Array.isArray(parsed.segments)
            ? parsed.segments
            : [];
          finish(undefined, parsed);
        } catch (e) {
          finish(
            new Error(
              `Failed to parse Whisper JSON: ${(e as Error).message}; stdout=${stdout.slice(0, 200)}`,
            ),
          );
        }
      });
    });
  }
}
