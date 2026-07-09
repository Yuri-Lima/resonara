import {
  buildMacSayCommand,
  buildWindowsSpeechScript,
  detectTtsPlatform,
  ttsEngineAvailable,
} from './platform-tts';

describe('platform TTS adapters', () => {
  it('detects darwin and win32 platforms', () => {
    expect(detectTtsPlatform('darwin')).toBe('darwin');
    expect(detectTtsPlatform('win32')).toBe('win32');
    expect(detectTtsPlatform('linux')).toBe('linux');
  });

  it('builds real macOS say invocation (not a reimplementation stub)', () => {
    const cmd = buildMacSayCommand({
      textFile: '/tmp/in.txt',
      outPath: '/tmp/out.aiff',
      voice: 'Samantha',
      rate: 180,
    });
    expect(cmd.bin).toBe('say');
    expect(cmd.args).toEqual([
      '-v',
      'Samantha',
      '-r',
      '180',
      '-o',
      '/tmp/out.aiff',
      '-f',
      '/tmp/in.txt',
    ]);
  });

  it('builds real Windows System.Speech PowerShell invocation', () => {
    const cmd = buildWindowsSpeechScript({
      textFile: 'C:\\data\\in.txt',
      outPath: 'C:\\data\\out.wav',
      voice: 'Microsoft Zira Desktop',
      rate: 2,
    });
    expect(cmd.bin).toBe('powershell.exe');
    expect(cmd.args[0]).toBe('-NoProfile');
    expect(cmd.args).toContain('-Command');
    expect(cmd.script).toContain('System.Speech');
    expect(cmd.script).toContain('SpeechSynthesizer');
    expect(cmd.script).toContain('SetOutputToWaveFile');
    expect(cmd.script).toContain('Microsoft Zira Desktop');
    expect(cmd.script).toContain('C:\\data\\out.wav');
    expect(cmd.script).toContain('C:\\data\\in.txt');
  });

  it('selects Windows path under win32 platform stub', () => {
    expect(detectTtsPlatform('win32')).toBe('win32');
    const cmd = buildWindowsSpeechScript({
      textFile: 't.txt',
      outPath: 'o.wav',
    });
    expect(cmd.bin.toLowerCase()).toContain('powershell');
  });

  it('reports macOS say engine availability on this host when darwin', () => {
    if (process.platform !== 'darwin') return;
    const st = ttsEngineAvailable('darwin');
    expect(st.engine).toMatch(/macOS/i);
    expect(st.available).toBe(true);
  });
});
