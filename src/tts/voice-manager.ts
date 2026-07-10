/**
 * Unified voice registry across Piper + Kokoro + platform engines.
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
import {
  isKokoroAvailable,
  listKokoroVoices,
  KokoroVoiceInfo,
} from './kokoro-tts';

export type VoiceEngine = 'piper' | 'platform' | 'kokoro';

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

    if (!filter?.engine || filter.engine === 'kokoro') {
      if (isKokoroAvailable()) {
        for (const v of listKokoroVoices()) {
          out.push(this.fromKokoro(v));
        }
      }
    }
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
      const lang = filter.language.toLowerCase().replace(/_/g, '-');
      const langBase = lang.split('-')[0];
      result = result.filter((v) => {
        if (!v.language && !v.id) return false;
        const vl = `${v.language || ''} ${v.id} ${v.name || ''}`
          .toLowerCase()
          .replace(/_/g, '-');
        if (lang.startsWith('pt')) {
          // pt-BR only — exclude pt-PT
          if (/pt-pt/.test(vl)) return false;
          return /pt-br|pt\b|faber|jeff|cadu|edresson|luciana/.test(vl);
        }
        if (lang.startsWith('en')) {
          return /en-|\ben\b|lessac|amy|ryan|alba|samantha|alex/.test(vl);
        }
        return vl.includes(lang) || vl.includes(langBase);
      });
    }
    return result;
  }

  getVoice(id: string): UnifiedVoice | undefined {
    if (!id) return undefined;
    const all = this.listVoices();
    return all.find((v) => v.id === id || v.nativeId === id);
  }

  /**
   * Prefer Kokoro (when available) > Piper high > platform.
   * Evidence-based default refined in Phase 9 shootout.
   */
  resolveEngine(
    requested: 'auto' | 'piper' | 'platform' | 'kokoro' = 'auto',
  ): 'piper' | 'platform' | 'kokoro' {
    const piper = isPiperAvailable(this.piperBinary, this.piperModelsDir);
    const kokoro = isKokoroAvailable();
    if (requested === 'kokoro') {
      if (!kokoro) {
        throw new Error('Kokoro engine unavailable');
      }
      return 'kokoro';
    }
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
    // auto: kokoro > piper > platform (Phase 9 may re-order per language)
    if (kokoro) return 'kokoro';
    if (piper.available) return 'piper';
    const p = ttsEngineAvailable();
    if (p.available) return 'platform';
    throw new Error(
      `No TTS engine available. Kokoro: ${kokoro}; Piper: ${piper.detail}; Platform: ${p.detail}`,
    );
  }

  engines(): EngineStatus[] {
    const piper = isPiperAvailable(this.piperBinary, this.piperModelsDir);
    const platform = ttsEngineAvailable();
    const platformVoices = platform.available ? listPlatformVoices().length : 0;
    const kokoro = isKokoroAvailable();
    const kokoroVoices = kokoro ? listKokoroVoices().length : 0;
    return [
      {
        id: 'kokoro',
        available: kokoro,
        detail: kokoro
          ? 'kokoro-onnx'
          : 'Kokoro not installed (node scripts/download-kokoro.js)',
        voiceCount: kokoroVoices,
        primary: kokoro,
      },
      {
        id: 'piper',
        available: piper.available,
        detail: piper.detail,
        voiceCount: piper.voiceCount,
        primary: !kokoro && piper.available,
      },
      {
        id: 'platform',
        available: platform.available,
        detail: platform.detail || platform.engine,
        voiceCount: platformVoices,
        primary: !kokoro && !piper.available && platform.available,
      },
    ];
  }

  defaultVoice(
    engine?: 'piper' | 'platform' | 'kokoro',
    language?: string,
  ): UnifiedVoice | undefined {
    const eng = engine || this.resolveEngineSafe();
    if (!eng) return undefined;
    const lang = language || 'en';
    const voices = this.listVoices({ engine: eng, language: lang });
    const pool =
      voices.length > 0 ? voices : this.listVoices({ engine: eng });

    if (eng === 'kokoro') {
      if (/pt/i.test(lang)) {
        return (
          pool.find((v) => /pf_|pm_/.test(v.nativeId || v.id)) || pool[0]
        );
      }
      if (/en-gb|en_gb|british/i.test(lang)) {
        return (
          pool.find((v) => /bf_emma|bm_george/i.test(v.id)) ||
          pool.find((v) => /^bf_|^bm_/.test(v.nativeId || '')) ||
          pool[0]
        );
      }
      return (
        pool.find((v) => /af_sarah/i.test(v.id)) ||
        pool.find((v) => /^af_/.test(v.nativeId || '')) ||
        pool[0]
      );
    }

    if (eng === 'piper') {
      if (/pt/i.test(lang)) {
        return (
          pool.find((v) => /faber.*medium/i.test(v.id)) ||
          pool.find((v) => /pt[_-]br/i.test(v.language || v.id)) ||
          pool.find((v) => v.quality === 'medium') ||
          pool[0]
        );
      }
      return (
        pool.find((v) => /lessac.*medium/i.test(v.id)) ||
        pool.find((v) => v.quality === 'medium' && /en/i.test(v.language || '')) ||
        pool.find((v) => /en/i.test(v.language || v.id)) ||
        pool[0]
      );
    }

    // Platform: never cross languages
    if (/pt/i.test(lang)) {
      return (
        pool.find((v) => /pt_br|pt-br/i.test(v.language || '')) ||
        pool.find((v) => /luciana/i.test(v.name || v.id)) ||
        undefined
      );
    }
    return (
      pool.find((v) => /^en/i.test(v.language || '')) ||
      pool.find((v) => /en/i.test(v.language || '')) ||
      pool[0]
    );
  }

  /**
   * Language-aware default for a preferred engine (when known).
   * Prefer matching engine voice; fall back piper → kokoro → platform.
   * Never returns a voice from a different language family.
   */
  getDefaultVoiceForLanguage(
    language: string,
    preferredEngine?: 'piper' | 'platform' | 'kokoro',
  ): UnifiedVoice | undefined {
    const lang = language || 'en';
    const order: Array<'piper' | 'platform' | 'kokoro'> = preferredEngine
      ? [
          preferredEngine,
          ...(['kokoro', 'piper', 'platform'] as const).filter(
            (e) => e !== preferredEngine,
          ),
        ]
      : ['kokoro', 'piper', 'platform'];
    for (const eng of order) {
      if (eng === 'kokoro' && !isKokoroAvailable()) continue;
      if (eng === 'piper' && !isPiperAvailable().available) continue;
      if (eng === 'platform' && !ttsEngineAvailable().available) continue;
      const v = this.defaultVoice(eng, lang);
      if (v && this.voiceMatchesLanguage(v, lang)) return v;
    }
    return undefined;
  }

  voiceMatchesLanguage(voice: UnifiedVoice, language: string): boolean {
    const lang = language.toLowerCase().replace(/_/g, '-');
    const vl = (voice.language || voice.id || '').toLowerCase().replace(/_/g, '-');
    if (lang.startsWith('pt-br') || lang === 'pt') {
      return /pt-br|pt_br|pt-br|faber|jeff|cadu|edresson|luciana/i.test(
        `${vl} ${voice.id} ${voice.name}`,
      ) && !/pt-pt|pt_pt|joana|catarina/i.test(`${vl} ${voice.id}`);
    }
    if (lang.startsWith('en')) {
      return /en|lessac|amy|ryan|alba|samantha|alex|daniel|af_|am_|bf_|bm_|kokoro/i.test(
        `${vl} ${voice.id} ${voice.name}`,
      );
    }
    return vl.includes(lang) || voice.id.toLowerCase().includes(lang);
  }

  private resolveEngineSafe(): 'piper' | 'platform' | 'kokoro' | undefined {
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

  private fromKokoro(v: KokoroVoiceInfo): UnifiedVoice {
    return {
      id: v.id,
      name: v.name,
      engine: 'kokoro',
      language: v.language,
      quality: 'neural',
      gender: v.gender,
      nativeId: v.nativeId,
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
