#!/usr/bin/env node
/**
 * Drive shipped TTS path: chunk → macOS say → concat → non-empty audio file.
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

// Register ts-jest-free path: require compiled JS if present, else use inline require via dist
async function main() {
  const root = path.join(__dirname, '..');
  process.chdir(root);

  // Prefer compiled modules
  let chunkTextForTts, estimateWordCount, synthesizeChunk, detectTtsPlatform;
  try {
    ({ chunkTextForTts, estimateWordCount } = require('../dist/tts/text-chunker'));
    ({ synthesizeChunk, detectTtsPlatform, buildMacSayCommand, buildWindowsSpeechScript } = require('../dist/tts/platform-tts'));
  } catch {
    // Load via ts-node if needed
    require('ts-node/register');
    ({ chunkTextForTts, estimateWordCount } = require('../src/tts/text-chunker'));
    ({
      synthesizeChunk,
      detectTtsPlatform,
      buildMacSayCommand,
      buildWindowsSpeechScript,
    } = require('../src/tts/platform-tts'));
  }

  const scratch =
    process.env.RESONARA_SCRATCH ||
    path.join(root, '.resonara-data', 'smoke-tts');
  fs.mkdirSync(scratch, { recursive: true });

  const paragraph =
    'Resonara shapes sound for creators who need offline tools. ' +
    'Two-pass loudness, sample piano, and system voices keep long documents speakable without a cloud account. ';
  const text = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1}. ${paragraph.repeat(3)}`).join(
    '\n\n',
  );
  const wordCount = estimateWordCount(text);
  const chunks = chunkTextForTts(text, { maxChars: 400, hardMaxChars: 600 });
  console.log(JSON.stringify({ platform: process.platform, wordCount, chunkCount: chunks.length }, null, 2));

  if (chunks.length < 2) {
    throw new Error('Expected multi-chunk input for long-form proof');
  }

  // Prove Windows builder exists even on Mac
  const win = buildWindowsSpeechScript({
    textFile: 'C:\\tmp\\in.txt',
    outPath: 'C:\\tmp\\out.wav',
    voice: 'Microsoft Zira Desktop',
  });
  if (!win.script.includes('System.Speech')) {
    throw new Error('Windows adapter missing System.Speech');
  }
  console.log('windows_adapter_ok', win.bin);

  if (detectTtsPlatform(process.platform) !== 'darwin') {
    console.log('Skipping live synthesis (not macOS)');
    fs.writeFileSync(
      path.join(scratch, 'result.json'),
      JSON.stringify({ skippedLive: true, chunkCount: chunks.length, wordCount }, null, 2),
    );
    return;
  }

  const work = path.join(scratch, `run-${Date.now()}`);
  fs.mkdirSync(work, { recursive: true });
  const parts = [];
  for (let i = 0; i < Math.min(chunks.length, 3); i++) {
    const out = path.join(work, `part-${i}.aiff`);
    const cmd = buildMacSayCommand({
      textFile: path.join(work, `t-${i}.txt`),
      outPath: out,
    });
    fs.writeFileSync(cmd.args[cmd.args.indexOf('-f') + 1], chunks[i].text, 'utf8');
    const r = spawnSync(cmd.bin, cmd.args, { encoding: 'utf8' });
    if (r.status !== 0) {
      throw new Error(`say failed: ${r.stderr || r.stdout}`);
    }
    const st = fs.statSync(out);
    if (st.size < 100) throw new Error(`part ${i} too small`);
    parts.push(out);
    console.log('part', i, 'bytes', st.size);
  }

  // concat with ffmpeg
  const list = path.join(work, 'list.txt');
  fs.writeFileSync(
    list,
    parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
  );
  const finalWav = path.join(work, 'speech.wav');
  const ff = spawnSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-acodec', 'pcm_s16le', finalWav],
    { encoding: 'utf8' },
  );
  if (ff.status !== 0) {
    throw new Error(`ffmpeg concat failed: ${ff.stderr?.slice(-300)}`);
  }
  const size = fs.statSync(finalWav).size;
  console.log(JSON.stringify({ ok: true, output: finalWav, bytes: size, chunksSynthesized: parts.length, totalChunks: chunks.length, wordCount }, null, 2));
  if (size < 1000) throw new Error('output too small');
  fs.writeFileSync(
    path.join(scratch, 'result.json'),
    JSON.stringify({ ok: true, bytes: size, chunkCount: chunks.length, wordCount }, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
