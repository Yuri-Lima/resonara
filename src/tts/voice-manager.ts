/**
 * Unified voice registry across Piper + platform engines.
 */
import {
  listVoices as listPlatformVoices,
  ttsEngineAvailable,
  VoiceInfo as PlatformVoiceInfo,
} from './platform-tts';
import {
  isPiperAvailable,
  listPiperVoices,
  PiperVoiceInfo,
  resolvePiperBinary,
  resolvePiperModelsDir,
} from './piper-tts';

export type VoiceEngine = 'piper' | 'platform';

export interface UnifiedVoice {
  id: string;
  name: string;
  engine: VoiceEngine;
  language?: string;
  quality?: string;
  sampleRate?: number;
  gender?: string;
  /** Platform voice id or piper model path */
  nativeId: string;
  modelPath?: string;
}

export interface EngineStatus {
  id: VoiceEngine;
  available: boolean;
  detail?: string;
  voiceCount: number;
  primary?: boolean;
}

export class VoiceManager {
  private piperModelsDir?: string;
  private piperBinary?: string;

  constructor(opts?: { piperModelsDir?: string; piperBinary?: string }) {
    this.piperModelsDir = opts?.piperModelsDir;
    this.piperBinary = opts?.piperBinary;
  }

  /** No-op refresh hook for callers after model download/delete. */
  refresh(): void {
    // Voices are scanned from disk on each listVoices() call.
  }

  listVoices(filter?: {
    engine?: VoiceEngine;
    language?: string;
  }): UnifiedVoice[] {
    const out: UnifiedVoice[] = [];

    if (!filter?.engine || filter.engine === 'piper') {
      for (const v of listPiperVoices(this.piperModelsDir)) {
        out.push(this.fromPiper(v));
      }
    }
    if (!filter?.engine || filter.engine === 'platform') {
      for (const v of listPlatformVoices()) {
        out.push(this.fromPlatform(v));
      }
    }

    let result = out;
    if (filter?.language) {
      const lang = filter.language.toLowerCase();
      result = result.filter(
        (v) =>
          !v.language ||
          v.language.toLowerCase().startsWith(lang) ||
          v.language.toLowerCase().includes(lang),
      );
    }
    return result;
  }

  getVoice(id: string): UnifiedVoice | undefined {
    if (!id) return undefined;
    const all = this.listVoices();
    return all.find((v) => v.id === id || v.nativeId === id);
  }

  /** Prefer Piper when available; else platform. */
  resolveEngine(
    requested: 'auto' | 'piper' | 'platform' = 'auto',
  ): 'piper' | 'platform' {
    const piper = isPiperAvailable(this.piperBinary, this.piperModelsDir);
    if (requested === 'piper') {
      if (!piper.available) {
        throw new Error(piper.detail || 'Piper engine unavailable');
      }
      return 'piper';
    }
    if (requested === 'platform') {
      const p = ttsEngineAvailable();
      if (!p.available) {
        throw new Error(p.detail || 'Platform TTS unavailable');
      }
      return 'platform';
    }
    // auto
    if (piper.available) return 'piper';
    const p = ttsEngineAvailable();
    if (p.available) return 'platform';
    throw new Error(
      `No TTS engine available. Piper: ${piper.detail}; Platform: ${p.detail}`,
    );
  }

  engines(): EngineStatus[] {
    const piper = isPiperAvailable(this.piperBinary, this.piperModelsDir);
    const platform = ttsEngineAvailable();
    const platformVoices = platform.available ? listPlatformVoices().length : 0;
    return [
      {
        id: 'piper',
        available: piper.available,
        detail: piper.detail,
        voiceCount: piper.voiceCount,
        primary: piper.available,
      },
      {
        id: 'platform',
        available: platform.available,
        detail: platform.detail || platform.engine,
        voiceCount: platformVoices,
        primary: !piper.available && platform.available,
      },
    ];
  }

  defaultVoice(engine?: 'piper' | 'platform'): UnifiedVoice | undefined {
    const eng = engine || this.resolveEngineSafe();
    if (!eng) return undefined;
    const voices = this.listVoices({ engine: eng });
    if (eng === 'piper') {
      // Prefer lessac medium / medium quality english
      return (
        voices.find((v) => /lessac.*medium/i.test(v.id)) ||
        voices.find((v) => v.quality === 'medium') ||
        voices[0]
      );
    }
    return voices.find((v) => /en/i.test(v.language || '')) || voices[0];
  }

  private resolveEngineSafe(): 'piper' | 'platform' | undefined {
    try {
      return this.resolveEngine('auto');
    } catch {
      return undefined;
    }
  }

  private fromPiper(v: PiperVoiceInfo): UnifiedVoice {
    return {
      id: v.id,
      name: v.name,
      engine: 'piper',
      language: v.language,
      quality: v.quality,
      sampleRate: v.sampleRate,
      gender: v.gender,
      nativeId: v.id.replace(/^piper:/, ''),
      modelPath: v.modelPath,
    };
  }

  private fromPlatform(v: PlatformVoiceInfo): UnifiedVoice {
    return {
      id: `platform:${v.id}`,
      name: v.name,
      engine: 'platform',
      language: v.language,
      quality: 'system',
      nativeId: v.id,
    };
  }

  getPiperPaths(): { binary: string | null; modelsDir: string } {
    return {
      binary: resolvePiperBinary(this.piperBinary),
      modelsDir: resolvePiperModelsDir(this.piperModelsDir),
    };
  }
}

/** Singleton-style factory for Nest providers. */
let defaultManager: VoiceManager | null = null;
export function getVoiceManager(): VoiceManager {
  if (!defaultManager) defaultManager = new VoiceManager();
  return defaultManager;
}
