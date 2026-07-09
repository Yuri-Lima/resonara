import { VoiceManager } from './voice-manager';

describe('VoiceManager', () => {
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
});
