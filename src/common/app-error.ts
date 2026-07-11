/**
 * Typed application errors with user-facing messages.
 * Never surface raw stacks to UI/CLI — use `userMessage` + `code`.
 */
import * as fs from 'fs';

export type AppErrorCode =
  | 'ENGINE_BINARY_MISSING'
  | 'ENGINE_UNAVAILABLE'
  | 'MODEL_ABSENT'
  | 'DISK_FULL'
  | 'PORT_OCCUPIED'
  | 'CORRUPT_INPUT'
  | 'JOB_INTERRUPTED'
  | 'JOB_FAILED'
  | 'SERVER_UNREACHABLE'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    userMessage: string,
    opts?: {
      cause?: unknown;
      retryable?: boolean;
      details?: Record<string, unknown>;
    },
  ) {
    super(userMessage);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    this.retryable = opts?.retryable ?? false;
    this.details = opts?.details;
    if (opts?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }

  toJSON() {
    return {
      code: this.code,
      message: this.userMessage,
      retryable: this.retryable,
      details: this.details,
    };
  }
}

const ENGINE_HINTS: Record<string, string> = {
  piper:
    'Piper is not available. Run: node scripts/download-piper.js — then restart Resonara.',
  kokoro:
    'Kokoro is not available. Run: node scripts/download-kokoro.js — then restart Resonara.',
  platform:
    'Platform TTS is not available on this system. Install Piper for offline synthesis.',
  whisper:
    'Whisper STT is not available. Run: node scripts/download-whisper.js',
};

/** Map low-level failures to typed, user-facing AppErrors. */
export function mapEngineError(
  engine: string,
  err: unknown,
): AppError {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (/enoent|not found|no such file|unavailable|not installed/.test(lower)) {
    if (/model|\.onnx|voices-/.test(lower)) {
      return new AppError(
        'MODEL_ABSENT',
        `A required model for ${engine} is missing. Download models from Settings or run the download script.`,
        { cause: err, retryable: true, details: { engine, raw } },
      );
    }
    return new AppError(
      'ENGINE_BINARY_MISSING',
      ENGINE_HINTS[engine] ||
        `The ${engine} engine binary is missing or not runnable.`,
      { cause: err, retryable: true, details: { engine, raw } },
    );
  }
  if (/enospc|no space|disk full/.test(lower)) {
    return new AppError(
      'DISK_FULL',
      'Not enough disk space to finish synthesis. Free space and retry the job.',
      { cause: err, retryable: true, details: { engine, raw } },
    );
  }
  if (/eaddrinuse|port.*in use|address already/.test(lower)) {
    return new AppError(
      'PORT_OCCUPIED',
      'The selected port is already in use. Choose another port or stop the other process.',
      { cause: err, retryable: true, details: { raw } },
    );
  }
  if (/corrupt|invalid|empty file|0 bytes|unsupported/.test(lower)) {
    return new AppError(
      'CORRUPT_INPUT',
      'The input file could not be read. Check the file format and try again.',
      { cause: err, retryable: false, details: { raw } },
    );
  }
  if (/interrupt|killed|sigterm|cancelled|canceled/.test(lower)) {
    return new AppError(
      'JOB_INTERRUPTED',
      'Synthesis was interrupted. You can retry the job from the library.',
      { cause: err, retryable: true, details: { raw } },
    );
  }
  return new AppError(
    'ENGINE_UNAVAILABLE',
    ENGINE_HINTS[engine] ||
      `Synthesis failed with ${engine}. ${raw.slice(0, 200)}`,
    { cause: err, retryable: true, details: { engine, raw } },
  );
}

export function userFacingMessage(err: unknown): string {
  if (err instanceof AppError) return err.userMessage;
  if (err && typeof err === 'object' && 'userMessage' in err) {
    return String((err as { userMessage: string }).userMessage);
  }
  if (err instanceof Error) {
    // Strip stack-like content from message
    const m = err.message.split('\n')[0];
    if (/at\s+\S+\s+\(/.test(m)) {
      return 'Something unexpected happened. Open Diagnostics to export logs for a bug report.';
    }
    return m;
  }
  return 'Something unexpected happened. Open Diagnostics to export logs for a bug report.';
}

/** Rough free-space check before long synthesis (bytes). Returns null if unknown. */
export function checkDiskSpace(
  dir: string,
): { freeBytes: number; ok: boolean; path: string } | null {
  try {
    // Node 18.15+ / 19+ has fs.statfsSync
    const statfs = (
      fs as unknown as {
        statfsSync?: (p: string) => { bavail: number; bsize: number };
      }
    ).statfsSync;
    if (typeof statfs === 'function') {
      const s = statfs(dir);
      const freeBytes = Number(s.bavail) * Number(s.bsize);
      // Require at least 100MB free for a long job
      return { freeBytes, ok: freeBytes > 100 * 1024 * 1024, path: dir };
    }
  } catch {
    /* */
  }
  return null;
}
