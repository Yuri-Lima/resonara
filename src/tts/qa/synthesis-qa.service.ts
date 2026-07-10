/**
 * Synthesize → transcribe → WER QA loop.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { WhisperService } from '../../stt/whisper.service';
import { computeWer, tokenizeWords } from './wer';
import { normalizeForWer, toDigitish } from './normalize';

export type QaMode = 'off' | 'sample' | 'full';

export interface ChunkQaResult {
  chunkIndex: number;
  wer: number;
  transcript: string;
  missing: string[];
  inserted: string[];
  qaFailed: boolean;
  retried: boolean;
  referenceTokens: number;
}

export interface JobQaSummary {
  mode: QaMode;
  aggregateWer: number;
  chunks: ChunkQaResult[];
  failedCount: number;
  sampledCount: number;
  threshold: number;
}

const DEFAULT_THRESHOLD = 0.1;

@Injectable()
export class SynthesisQaService {
  private readonly logger = new Logger(SynthesisQaService.name);

  constructor(@Optional() private readonly whisper?: WhisperService) {}

  isAvailable(): boolean {
    return !!this.whisper?.isAvailable();
  }

  /**
   * QA a single chunk: transcribe audio, normalize, compute WER.
   */
  async qaChunk(
    chunkText: string,
    chunkAudioPath: string,
    opts?: { threshold?: number; model?: 'tiny' | 'base' },
  ): Promise<Omit<ChunkQaResult, 'chunkIndex' | 'retried' | 'qaFailed'> & { wer: number }> {
    if (!this.whisper?.isAvailable()) {
      throw new Error('Whisper unavailable for QA');
    }
    const transcript = await this.whisper.transcribe(chunkAudioPath, {
      model: opts?.model || 'tiny',
      language: 'en',
      timeoutMs: 120_000,
    });
    const refTok = normalizeForWer(chunkText);
    let hypTok = normalizeForWer(transcript.text);
    let align = computeWer(refTok, hypTok);

    // Second pass with digitish collapse if WER high (number false positives)
    if (align.wer > 0.15) {
      const a2 = computeWer(toDigitish(refTok), toDigitish(hypTok));
      if (a2.wer < align.wer) align = a2;
    }

    return {
      wer: align.wer,
      transcript: transcript.text,
      missing: align.missing,
      inserted: align.inserted,
      referenceTokens: align.referenceLength,
    };
  }

  /**
   * Decide whether chunk index should be QA'd under mode.
   * sample = every 3rd chunk (0, 3, 6, …)
   */
  shouldSample(chunkIndex: number, mode: QaMode): boolean {
    if (mode === 'off') return false;
    if (mode === 'full') return true;
    return chunkIndex % 3 === 0;
  }

  /**
   * After synthesis: optionally re-synth once if WER > threshold.
   * resynthesize fn provided by caller to avoid circular deps.
   */
  async qaWithRetry(
    chunkIndex: number,
    chunkText: string,
    chunkAudioPath: string,
    opts: {
      threshold?: number;
      resynthesize?: () => Promise<string>;
    } = {},
  ): Promise<ChunkQaResult> {
    const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
    let path = chunkAudioPath;
    let retried = false;
    let result = await this.qaChunk(chunkText, path);
    if (result.wer > threshold && opts.resynthesize) {
      this.logger.warn(
        `Chunk ${chunkIndex} WER ${result.wer.toFixed(3)} > ${threshold}; retry once`,
      );
      path = await opts.resynthesize();
      retried = true;
      result = await this.qaChunk(chunkText, path);
    }
    return {
      chunkIndex,
      wer: result.wer,
      transcript: result.transcript,
      missing: result.missing,
      inserted: result.inserted,
      referenceTokens: result.referenceTokens,
      qaFailed: result.wer > threshold,
      retried,
    };
  }

  aggregate(chunks: ChunkQaResult[], mode: QaMode, threshold = DEFAULT_THRESHOLD): JobQaSummary {
    if (!chunks.length) {
      return {
        mode,
        aggregateWer: 0,
        chunks: [],
        failedCount: 0,
        sampledCount: 0,
        threshold,
      };
    }
    // Weighted by reference token count
    let num = 0;
    let den = 0;
    for (const c of chunks) {
      const n = Math.max(1, c.referenceTokens || 1);
      num += c.wer * n;
      den += n;
    }
    return {
      mode,
      aggregateWer: den ? num / den : 0,
      chunks,
      failedCount: chunks.filter((c) => c.qaFailed).length,
      sampledCount: chunks.length,
      threshold,
    };
  }
}

export { DEFAULT_THRESHOLD, tokenizeWords };
