import { VoiceManager } from './voice-manager';
import * as piper from './piper-tts';
import * as platform from './platform-tts';
import * as kokoro from './kokoro-tts';

describe('VoiceManager', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('lists engines', () => {
    const vm = new VoiceManager();
    const engines = vm.engines();
    expect(engines.some((e) => e.id === 'piper')).toBe(true);
    expect(engines.some((e) => e.id === 'platform')).toBe(true);
  });

  it('listVoices returns array', () => {
    const vm = new VoiceManager();
    expect(Array.isArray(vm.listVoices())).toBe(true);
  });

  it('getVoice returns undefined for unknown', () => {
    const vm = new VoiceManager();
    expect(vm.getVoice('no-such-voice-xyz')).toBeUndefined();
  });

  it('aggregates piper and platform voices', () => {
    jest.spyOn(kokoro, 'isKokoroAvailable').mockReturnValue(false);
    jest.spyOn(piper, 'listPiperVoices').mockReturnValue([
      {
        id: 'piper:en_US-lessac-medium',
        name: 'lessac',
        language: 'en',
        quality: 'medium',
        sampleRate: 22050,
        gender: 'female',
        modelPath: '/m.onnx',
        configPath: '/m.onnx.json',
        engine: 'piper',
      },
    ]);
    jest.spyOn(platform, 'listVoices').mockReturnValue([
      { id: 'Alex', name: 'Alex', language: 'en_US' },
    ]);
    const vm = new VoiceManager();
    const all = vm.listVoices();
    expect(all.length).toBe(2);
    expect(vm.listVoices({ engine: 'piper' })).toHaveLength(1);
    expect(vm.listVoices({ language: 'en' }).length).toBeGreaterThan(0);
    expect(vm.getVoice('piper:en_US-lessac-medium')?.engine).toBe('piper');
    expect(vm.defaultVoice('piper')?.quality).toBe('medium');
    expect(vm.getPiperPaths()).toBeDefined();
  });

  it('resolveEngine prefers piper when kokoro unavailable', () => {
    jest.spyOn(kokoro, 'isKokoroAvailable').mockReturnValue(false);
    jest.spyOn(piper, 'isPiperAvailable').mockReturnValue({
      available: true,
      voiceCount: 1,
      detail: 'ok',
    });
    jest.spyOn(platform, 'ttsEngineAvailable').mockReturnValue({
      available: true,
      engine: 'macOS say',
    });
    const vm = new VoiceManager();
    expect(vm.resolveEngine('auto')).toBe('piper');
    expect(vm.resolveEngine('piper')).toBe('piper');
    expect(vm.resolveEngine('platform')).toBe('platform');
  });

  it('resolveEngine prefers kokoro when available for English', () => {
    jest.spyOn(kokoro, 'isKokoroAvailable').mockReturnValue(true);
    jest.spyOn(piper, 'isPiperAvailable').mockReturnValue({
      available: true,
      voiceCount: 1,
      detail: 'ok',
    });
    const vm = new VoiceManager();
    expect(vm.resolveEngine('auto')).toBe('kokoro');
    expect(vm.resolveEngine('auto', 'en')).toBe('kokoro');
    expect(vm.resolveEngine('kokoro')).toBe('kokoro');
  });

  it('resolveEngine skips kokoro for Portuguese (English-only engine)', () => {
    jest.spyOn(kokoro, 'isKokoroAvailable').mockReturnValue(true);
    jest.spyOn(piper, 'isPiperAvailable').mockReturnValue({
      available: true,
      voiceCount: 2,
      detail: 'ok',
    });
    jest.spyOn(platform, 'ttsEngineAvailable').mockReturnValue({
      available: true,
      engine: 'macOS say',
    });
    const vm = new VoiceManager();
    expect(vm.resolveEngine('auto', 'pt-BR')).toBe('piper');
    expect(vm.resolveEngine('auto', 'pt_BR')).toBe('piper');
    expect(vm.resolveEngine('auto', 'pt')).toBe('piper');
  });

  it('getDefaultVoiceForLanguage never returns kokoro for pt-BR', () => {
    jest.spyOn(kokoro, 'isKokoroAvailable').mockReturnValue(true);
    jest.spyOn(piper, 'isPiperAvailable').mockReturnValue({
      available: true,
      voiceCount: 1,
      detail: 'ok',
    });
    jest.spyOn(piper, 'listPiperVoices').mockReturnValue([
      {
        id: 'piper:pt_BR-faber-medium',
        name: 'faber',
        language: 'pt_BR',
        quality: 'medium',
        sampleRate: 22050,
        gender: 'male',
        modelPath: '/pt.onnx',
        configPath: '/pt.onnx.json',
        engine: 'piper',
      },
    ]);
    jest.spyOn(platform, 'listVoices').mockReturnValue([
      { id: 'Luciana', name: 'Luciana', language: 'pt_BR' },
    ]);
    const vm = new VoiceManager();
    const v = vm.getDefaultVoiceForLanguage('pt-BR');
    expect(v).toBeDefined();
    expect(v!.engine).not.toBe('kokoro');
    expect(v!.engine).toBe('piper');
    expect(/pt/i.test(v!.language || v!.id)).toBe(true);
  });

  it('resolveEngine throws when none available', () => {
    jest.spyOn(piper, 'isPiperAvailable').mockReturnValue({
      available: false,
      voiceCount: 0,
      detail: 'no',
    });
    jest.spyOn(platform, 'ttsEngineAvailable').mockReturnValue({
      available: false,
      engine: 'none',
      detail: 'no',
    });
    jest.spyOn(kokoro, 'isKokoroAvailable').mockReturnValue(false);
    const vm = new VoiceManager();
    expect(() => vm.resolveEngine('auto')).toThrow(/No TTS engine/);
  });
});
