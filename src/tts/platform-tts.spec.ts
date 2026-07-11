import {
  assertSafePsToken,
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
    // G28 TODO-02: EncodedCommand, never raw -Command with user strings
    expect(cmd.args).toContain('-EncodedCommand');
    expect(cmd.args).not.toContain('-Command');
    expect(cmd.script).toContain('System.Speech');
    expect(cmd.script).toContain('SpeechSynthesizer');
    expect(cmd.script).toContain('SetOutputToWaveFile');
    expect(cmd.script).toContain('Microsoft Zira Desktop');
    expect(cmd.script).toContain('C:\\data\\out.wav');
    expect(cmd.script).toContain('C:\\data\\in.txt');
    const enc = cmd.args[cmd.args.indexOf('-EncodedCommand') + 1];
    expect(Buffer.from(enc, 'base64').toString('utf16le')).toContain(
      'SpeechSynthesizer',
    );
  });

  it('rejects PowerShell voice injection payloads (TODO-02)', () => {
    expect(() =>
      buildWindowsSpeechScript({
        textFile: 'C:\\data\\in.txt',
        outPath: 'C:\\data\\out.wav',
        voice: "'); Remove-Item -Recurse C:\\Users\\Public\\x; #",
      }),
    ).toThrow(/Invalid voice/i);
    expect(() => assertSafePsToken("a';b", 'voice')).toThrow();
    expect(() =>
      buildWindowsSpeechScript({
        textFile: "C:\\data\\in'; Write-Host pwned.txt",
        outPath: 'C:\\data\\out.wav',
      }),
    ).toThrow(/Invalid textFile/i);
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

  it('exports platform TTS timeout for hang protection (TODO-03)', () => {
    const { PLATFORM_TTS_TIMEOUT_MS } = require('./platform-tts');
    expect(PLATFORM_TTS_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
    expect(PLATFORM_TTS_TIMEOUT_MS).toBeLessThanOrEqual(600_000);
  });
