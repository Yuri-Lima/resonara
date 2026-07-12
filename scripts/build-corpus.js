#!/usr/bin/env node
/**
 * Build release-qualification corpus under samples/catalog/.
 * Deterministic from seed. Reuses samples/texts fixtures where they fit.
 *
 * Usage:
 *   node scripts/build-corpus.js [--seed 42] [--out samples/catalog]
 *   node scripts/build-corpus.js --self-test
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'samples', 'catalog');
const FIXTURES_EN = path.join(ROOT, 'samples', 'texts');
const FIXTURES_PT = path.join(ROOT, 'samples', 'texts', 'pt-br');

// ── seeded PRNG (mulberry32) ──────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function readIfExists(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

// ── prose templates (public-domain style, original generated text) ────────
const EN_SENTENCES = [
  'The river wound through the valley under a pale morning sky.',
  'Scholars gathered notes from every shelf in the quiet library.',
  'A single lamp marked the desk where the manuscript waited.',
  'Wind carried the scent of pine across the open meadow.',
  'Numbers and dates lined the margin of the engineer\'s logbook.',
  'Children laughed as the storyteller raised a painted puppet.',
  'The council debated the charter until the candles burned low.',
  'Far beyond the hills, a lighthouse blinked against the fog.',
  'She measured each pause as carefully as each spoken word.',
  'In the workshop, gears turned with a soft and steady rhythm.',
  'The captain reviewed the chart before the tide turned again.',
  'Autumn leaves covered the path that led to the old mill.',
  'A careful reader marks the boundaries between sentence and silence.',
  'The archive preserved letters written in a fine and patient hand.',
  'Thunder rolled once, then the rain began in earnest.',
  'Every chapter opens a door that the previous page left ajar.',
  'The market filled with voices selling bread, spices, and news.',
  'He counted the stars as if they were coins in a ledger.',
  'Soft music drifted from the window of the upstairs room.',
  'The map showed rivers that no longer matched the land.',
];

const PT_SENTENCES = [
  'O rio serpenteava pelo vale sob um céu pálido de manhã.',
  'Estudiosos reuniam anotações de cada prateleira na biblioteca quieta.',
  'Uma única lâmpada marcava a mesa onde o manuscrito esperava.',
  'O vento trouxe o cheiro de pinho pelo campo aberto.',
  'Números e datas alinhavam a margem do diário do engenheiro.',
  'As crianças riam enquanto o contador de histórias erguia um fantoche.',
  'O conselho debateu a carta até as velas se apagarem.',
  'Longe além das colinas, um farol piscava contra o nevoeiro.',
  'Ela media cada pausa com o mesmo cuidado de cada palavra.',
  'Na oficina, as engrenagens giravam com ritmo suave e constante.',
  'O capitão revisou a carta náutica antes da maré mudar de novo.',
  'Folhas de outono cobriam o caminho que levava ao velho moinho.',
  'Um leitor atento marca os limites entre frase e silêncio.',
  'O arquivo preservava cartas escritas com letra fina e paciente.',
  'O trovão rolou uma vez, e a chuva começou de verdade.',
  'Cada capítulo abre uma porta que a página anterior deixou entreaberta.',
  'O mercado encheu-se de vozes vendendo pão, temperos e notícias.',
  'Ele contava as estrelas como se fossem moedas em um livro-caixa.',
  'Música suave vinha da janela do quarto de cima.',
  'O mapa mostrava rios que já não batiam com a terra.',
];

function generateProse(rng, sentences, targetWords, opts = {}) {
  const parts = [];
  let words = 0;
  let para = 0;
  const paraEvery = opts.paraEvery || 5;
  while (words < targetWords) {
    const s = sentences[Math.floor(rng() * sentences.length)];
    parts.push(s);
    words += wordCount(s);
    para++;
    if (para % paraEvery === 0) {
      parts.push('\n\n');
    } else {
      parts.push(' ');
    }
  }
  return parts.join('').replace(/ +\n/g, '\n').trim() + '\n';
}

function generateEssay(rng, sentences, targetWords, title) {
  const sections = Math.max(3, Math.ceil(targetWords / 400));
  const per = Math.ceil(targetWords / sections);
  const chunks = [`# ${title}\n\n`];
  for (let i = 1; i <= sections; i++) {
    chunks.push(`## Section ${i}\n\n`);
    chunks.push(generateProse(rng, sentences, per, { paraEvery: 4 }));
    chunks.push('\n');
  }
  return chunks.join('');
}

function generateChildrenStory(rng, sentences, lang) {
  if (lang === 'pt-BR') {
    return (
      '# A Estrela que Aprendeu a Esperar\n\n' +
      'Era uma vez uma pequena estrela que queria brilhar mais alto que todas as outras. ' +
      'Ela apressava cada cintilar e esquecia de respirar entre um e outro.\n\n' +
      '— Por que você corre tanto? — perguntou a Lua, com voz calma.\n\n' +
      '— Porque o céu é grande e eu tenho medo de ficar para trás — respondeu a estrela.\n\n' +
      'A Lua sorriu. — As estrelas que o tempo mais ama são as que sabem fazer pausas. ' +
      'Quando você descansa, as pessoas embaixo têm tempo de te encontrar.\n\n' +
      generateProse(rng, sentences, 180, { paraEvery: 3 }) +
      '\n\nE assim a estrela aprendeu: brilhar bem é também saber calar um instante.\n'
    );
  }
  return (
    '# The Star That Learned to Wait\n\n' +
    'Once there was a little star that wanted to shine brighter than all the others. ' +
    'It rushed every twinkle and forgot to breathe between them.\n\n' +
    '"Why do you hurry so?" asked the Moon in a calm voice.\n\n' +
    '"Because the sky is large and I am afraid of falling behind," said the star.\n\n' +
    'The Moon smiled. "The stars that time loves most are the ones that know how to pause. ' +
    'When you rest, the people below have time to find you."\n\n' +
    generateProse(rng, sentences, 180, { paraEvery: 3 }) +
    '\n\nAnd so the star learned: shining well also means knowing when to be still.\n'
  );
}

function generateLongEssay(rng, sentences, lang) {
  const title =
    lang === 'pt-BR'
      ? 'Ensaio sobre o Tempo e a Voz'
      : 'An Essay on Time and the Speaking Voice';
  return generateEssay(rng, sentences, 1200, title);
}

function generateNewsExpanded(rng, sentences, lang, targetWords) {
  const header =
    lang === 'pt-BR'
      ? '# Notícia: Conselho aprova plano de arquivos abertos\n\nCIDADE — '
      : '# News: Council Approves Open Archives Plan\n\nCITY — ';
  return header + generateProse(rng, sentences, targetWords, { paraEvery: 3 });
}

function generateChapter(rng, sentences, lang, targetWords) {
  const title =
    lang === 'pt-BR' ? '# Capítulo: A Travessia do Vale\n\n' : '# Chapter: Crossing the Valley\n\n';
  return title + generateProse(rng, sentences, targetWords, { paraEvery: 4 });
}

function generateTechnical(rng, sentences, lang) {
  const head =
    lang === 'pt-BR'
      ? '# Documento Técnico: Protocolo de Síntese Offline\n\n' +
        'Versão 2.2.0. Data de referência: 12/07/2026. Taxa de amostragem: 22050 Hz.\n\n'
      : '# Technical Document: Offline Synthesis Protocol\n\n' +
        'Version 2.2.0. Reference date: 2026-07-12. Sample rate: 22050 Hz.\n\n';
  const body = generateProse(rng, sentences, 400, { paraEvery: 3 });
  const nums =
    lang === 'pt-BR'
      ? '\n\nMétricas: RTF 1,2; WER 0,08; 50.000 palavras; 3 motores; portas 3847 e 3860.\n'
      : '\n\nMetrics: RTF 1.2; WER 0.08; 50,000 words; 3 engines; ports 3847 and 3860.\n';
  return head + body + nums;
}

function generateDialogue(rng, sentences, lang) {
  if (lang === 'pt-BR') {
    return (
      '# Diálogo: Na Biblioteca\n\n' +
      '— Você leu o capítulo inteiro? — perguntou Ana.\n\n' +
      '— Li até a página 42 — respondeu Bruno. — Depois a voz do narrador mudou.\n\n' +
      '— Mudou como?\n\n' +
      '— Mais devagar. Como se contasse um segredo.\n\n' +
      generateProse(rng, sentences, 80, { paraEvery: 2 }) +
      '\n\n— Então a pausa também é texto — disse Ana.\n\n— Exato — disse Bruno.\n'
    );
  }
  return (
    '# Dialogue: In the Library\n\n' +
    '"Did you read the whole chapter?" asked Ana.\n\n' +
    '"I read to page 42," said Bruno. "Then the narrator\'s voice changed."\n\n' +
    '"Changed how?"\n\n' +
    '"Slower. As if telling a secret."\n\n' +
    generateProse(rng, sentences, 80, { paraEvery: 2 }) +
    '\n\n"Then the pause is also text," said Ana.\n\n"Exactly," said Bruno.\n'
  );
}

function generateNumbers(lang) {
  if (lang === 'pt-BR') {
    return (
      '# Números e Datas\n\n' +
      'No dia 12 de julho de 2026, às 16h37, o sistema processou 50.000 palavras em 3 motores. ' +
      'A taxa foi de 1,25× tempo real. O capítulo 7 tinha 5.164 palavras; a notícia, 2.039. ' +
      'Telefone de suporte: (11) 3456-7890. Valor: R$ 1.234,56. Versão 2.2.0.\n'
    );
  }
  return (
    '# Numbers and Dates\n\n' +
    'On July 12, 2026 at 4:37 PM, the system processed 50,000 words across 3 engines. ' +
    'Throughput was 1.25× real time. Chapter 7 had 5,164 words; the news piece, 2,039. ' +
    'Support line: (555) 234-5678. Amount: $1,234.56. Version 2.2.0.\n'
  );
}

function generatePronunciation(lang) {
  if (lang === 'pt-BR') {
    return (
      '# Desafio de Pronúncia\n\n' +
      'O otorrinolaringologista explicou a inconstitucionalissimamente complexa regulamentação. ' +
      'Paralelepípedo, interdisciplinaridade e desencontradamente aparecem no mesmo parágrafo. ' +
      'Resonara sintetiza pt-BR com travessão e números misturados: 3,14 e 2026.\n'
    );
  }
  return (
    '# Pronunciation Challenge\n\n' +
    'The otorhinolaryngologist explained the anachronistically complex regulation. ' +
    'Worcestershire, rural, and sixths appear in the same paragraph. ' +
    'Resonara synthesizes English with numbers mixed in: 3.14 and 2026.\n'
  );
}

function generateSsml(lang) {
  if (lang === 'pt-BR') {
    return (
      '# SSML Demonstração\n\n' +
      '<speak>Olá. <break time="400ms"/> Esta é uma demonstração de SSML. ' +
      '<prosody rate="slow">Fale devagar aqui.</prosody> ' +
      'E volte ao ritmo normal.</speak>\n'
    );
  }
  return (
    '# SSML Showcase\n\n' +
    '<speak>Hello. <break time="400ms"/> This is an SSML demonstration. ' +
    '<prosody rate="slow">Speak slowly here.</prosody> ' +
    'Then return to normal pace.</speak>\n'
  );
}

function generateArticle(rng, sentences, lang, targetWords) {
  const title =
    lang === 'pt-BR' ? '# Artigo: A Arte da Narracao Offline\n\n' : '# Article: The Craft of Offline Narration\n\n';
  return title + generateProse(rng, sentences, targetWords, { paraEvery: 3 });
}

/**
 * Generate novel-length soak document (~targetWords).
 * Deterministic; public-domain-style original prose only.
 */
function generateSoakNovel(seed, targetWords = 50000) {
  const rng = mulberry32(seed ^ 0x50a7);
  const chapters = Math.ceil(targetWords / 2500);
  const per = Math.ceil(targetWords / chapters);
  const out = [];
  out.push('# The Quiet Cartographer\n\n');
  out.push(
    'A novel-length public-domain-style prose document generated deterministically for Resonara soak testing. Seed=' +
      seed +
      '.\n\n',
  );
  for (let c = 1; c <= chapters; c++) {
    out.push(`## Chapter ${c}\n\n`);
    // Mix paragraph structure for realistic pause map density
    out.push(generateProse(rng, EN_SENTENCES, per, { paraEvery: 3 + (c % 3) }));
    out.push('\n\n');
  }
  let text = out.join('');
  // Trim/pad to land near target
  let wc = wordCount(text);
  while (wc < targetWords) {
    text += ' ' + EN_SENTENCES[Math.floor(rng() * EN_SENTENCES.length)];
    wc = wordCount(text);
  }
  return text + '\n';
}

/**
 * Build the full catalog + manifest. Pure-ish: returns { documents, manifest }.
 * Also writes files when write=true.
 */
function buildCorpus(options = {}) {
  const seed = options.seed != null ? Number(options.seed) : 42;
  const outDir = options.outDir || DEFAULT_OUT;
  const write = options.write !== false;
  const soakWords = options.soakWords != null ? Number(options.soakWords) : 50000;
  const rng = mulberry32(seed);

  if (write) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const documents = [];

  function add(id, language, contentType, text, source, soak = false) {
    const fileName = `${id}.txt`;
    const relPath = path.join('samples', 'catalog', fileName).replace(/\\/g, '/');
    const absPath = path.join(outDir, fileName);
    if (write) {
      fs.writeFileSync(absPath, text, 'utf8');
    }
    documents.push({
      id,
      path: relPath,
      language,
      contentType,
      wordCount: wordCount(text),
      source,
      soak: !!soak,
    });
  }

  function fixtureOrGen(fixturePath, genFn) {
    const t = readIfExists(fixturePath);
    if (t && wordCount(t) >= 10) return { text: t, source: 'fixture' };
    return { text: genFn(), source: 'generated' };
  }

  // ── English ────────────────────────────────────────────────────────────
  {
    const f = fixtureOrGen(path.join(FIXTURES_EN, 'short-article.txt'), () =>
      generateArticle(rng, EN_SENTENCES, 'en', 450),
    );
    add('en-short-article', 'en', 'short-article', f.text, f.source);
  }
  {
    const f = fixtureOrGen(path.join(FIXTURES_EN, 'news-article.txt'), () =>
      generateNewsExpanded(rng, EN_SENTENCES, 'en', 2000),
    );
    add('en-news', 'en', 'news', f.text, f.source);
  }
  {
    const f = fixtureOrGen(path.join(FIXTURES_EN, 'book-chapter.txt'), () =>
      generateChapter(rng, EN_SENTENCES, 'en', 5000),
    );
    add('en-book-chapter', 'en', 'book-chapter', f.text, f.source);
  }
  {
    const f = fixtureOrGen(path.join(FIXTURES_EN, 'technical-doc.txt'), () =>
      generateTechnical(rng, EN_SENTENCES, 'en'),
    );
    add('en-technical-doc', 'en', 'technical-doc', f.text, f.source);
  }
  {
    const f = fixtureOrGen(path.join(FIXTURES_EN, 'dialogue-script.txt'), () =>
      generateDialogue(rng, EN_SENTENCES, 'en'),
    );
    add('en-dialogue-script', 'en', 'dialogue-script', f.text, f.source);
  }
  {
    const f = fixtureOrGen(path.join(FIXTURES_EN, 'ssml-showcase.txt'), () =>
      generateSsml('en'),
    );
    add('en-ssml-showcase', 'en', 'ssml-showcase', f.text, f.source);
  }
  add(
    'en-children-story',
    'en',
    'children-story',
    generateChildrenStory(rng, EN_SENTENCES, 'en'),
    'generated',
  );
  {
    const f = fixtureOrGen(path.join(FIXTURES_EN, 'numbers-and-dates.txt'), () =>
      generateNumbers('en'),
    );
    add('en-numbers-and-dates', 'en', 'numbers-and-dates', f.text, f.source);
  }
  {
    const f = fixtureOrGen(path.join(FIXTURES_EN, 'pronunciation-challenge.txt'), () =>
      generatePronunciation('en'),
    );
    add('en-pronunciation-challenge', 'en', 'pronunciation-challenge', f.text, f.source);
  }
  add(
    'en-long-essay',
    'en',
    'long-form-essay',
    generateLongEssay(rng, EN_SENTENCES, 'en'),
    'generated',
  );
  // Extra en docs for ≥24 total
  {
    const f = fixtureOrGen(path.join(FIXTURES_EN, 'paragraph.txt'), () =>
      generateProse(rng, EN_SENTENCES, 80),
    );
    add('en-paragraph', 'en', 'paragraph', f.text, f.source);
  }
  {
    const f = fixtureOrGen(path.join(FIXTURES_EN, 'quick-sentence.txt'), () =>
      'Resonara speaks offline with care and clarity.\n',
    );
    add('en-quick-sentence', 'en', 'quick-sentence', f.text, f.source);
  }
  add(
    'en-news-expanded',
    'en',
    'news',
    generateNewsExpanded(rng, EN_SENTENCES, 'en', 2000),
    'generated',
  );

  // ── pt-BR ──────────────────────────────────────────────────────────────
  {
    const f = fixtureOrGen(path.join(FIXTURES_PT, 'artigo-curto.txt'), () =>
      generateArticle(rng, PT_SENTENCES, 'pt-BR', 120),
    );
    add('pt-artigo', 'pt-BR', 'short-article', f.text, f.source);
  }
  {
    const f = fixtureOrGen(path.join(FIXTURES_PT, 'noticia.txt'), () =>
      generateNewsExpanded(rng, PT_SENTENCES, 'pt-BR', 150),
    );
    add('pt-noticia', 'pt-BR', 'news', f.text, f.source);
  }
  {
    const f = fixtureOrGen(path.join(FIXTURES_PT, 'capitulo-livro.txt'), () =>
      generateChapter(rng, PT_SENTENCES, 'pt-BR', 2500),
    );
    add('pt-capitulo', 'pt-BR', 'book-chapter', f.text, f.source);
  }
  {
    const f = fixtureOrGen(path.join(FIXTURES_PT, 'dialogo-roteiro.txt'), () =>
      generateDialogue(rng, PT_SENTENCES, 'pt-BR'),
    );
    add('pt-dialogo', 'pt-BR', 'dialogue-script', f.text, f.source);
  }
  {
    const f = fixtureOrGen(path.join(FIXTURES_PT, 'numeros-e-datas.txt'), () =>
      generateNumbers('pt-BR'),
    );
    add('pt-numeros', 'pt-BR', 'numbers-and-dates', f.text, f.source);
  }
  {
    const f = fixtureOrGen(path.join(FIXTURES_PT, 'documento-tecnico.txt'), () =>
      generateTechnical(rng, PT_SENTENCES, 'pt-BR'),
    );
    add('pt-tecnico', 'pt-BR', 'technical-doc', f.text, f.source);
  }
  {
    const f = fixtureOrGen(path.join(FIXTURES_PT, 'desafio-pronuncia.txt'), () =>
      generatePronunciation('pt-BR'),
    );
    add('pt-pronuncia', 'pt-BR', 'pronunciation-challenge', f.text, f.source);
  }
  {
    const f = fixtureOrGen(path.join(FIXTURES_PT, 'ssml-demonstracao.txt'), () =>
      generateSsml('pt-BR'),
    );
    add('pt-ssml', 'pt-BR', 'ssml-showcase', f.text, f.source);
  }
  add(
    'pt-historia',
    'pt-BR',
    'children-story',
    generateChildrenStory(rng, PT_SENTENCES, 'pt-BR'),
    'generated',
  );
  add(
    'pt-ensaio',
    'pt-BR',
    'long-form-essay',
    generateLongEssay(rng, PT_SENTENCES, 'pt-BR'),
    'generated',
  );
  {
    const f = fixtureOrGen(path.join(FIXTURES_PT, 'paragrafo.txt'), () =>
      generateProse(rng, PT_SENTENCES, 55),
    );
    add('pt-paragrafo', 'pt-BR', 'paragraph', f.text, f.source);
  }

  // ── Soak novel (always generated, deterministic) ───────────────────────
  const soakText = generateSoakNovel(seed, soakWords);
  add('soak-novel', 'en', 'soak-novel', soakText, 'generated', true);

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    seed,
    soakWords,
    documentCount: documents.length,
    nonSoakCount: documents.filter((d) => !d.soak).length,
    documents,
  };

  if (write) {
    fs.writeFileSync(
      path.join(outDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      'utf8',
    );
  }

  return { documents, manifest, seed };
}

function selfTest() {
  const a = buildCorpus({ seed: 42, write: false, soakWords: 500 });
  const b = buildCorpus({ seed: 42, write: false, soakWords: 500 });
  const c = buildCorpus({ seed: 99, write: false, soakWords: 500 });

  const errors = [];
  if (a.documents.length < 24) errors.push(`expected ≥24 docs, got ${a.documents.length}`);
  if (a.manifest.nonSoakCount < 24) errors.push(`non-soak < 24: ${a.manifest.nonSoakCount}`);

  const langs = new Set(a.documents.map((d) => d.language));
  if (!langs.has('en') || !langs.has('pt-BR')) errors.push(`languages missing: ${[...langs]}`);

  const soak = a.documents.find((d) => d.id === 'soak-novel');
  if (!soak || !soak.soak) errors.push('soak-novel missing');
  if (soak && soak.wordCount < 450) errors.push(`soak too small in self-test: ${soak.wordCount}`);

  // Determinism: same seed → same word counts and content types
  const sig = (m) =>
    m.documents.map((d) => `${d.id}:${d.language}:${d.contentType}:${d.wordCount}`).join('|');
  if (sig(a.manifest) !== sig(b.manifest)) errors.push('determinism failed for seed 42');
  if (sig(a.manifest) === sig(c.manifest)) errors.push('different seeds produced identical corpus');

  // Language tagging
  for (const d of a.documents) {
    if (d.id.startsWith('pt-') && d.language !== 'pt-BR') {
      errors.push(`bad lang tag ${d.id}`);
    }
    if (d.id.startsWith('en-') && d.language !== 'en') {
      errors.push(`bad lang tag ${d.id}`);
    }
  }

  if (errors.length) {
    console.error('SELF-TEST FAILED:', errors);
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        documentCount: a.documents.length,
        nonSoakCount: a.manifest.nonSoakCount,
        languages: [...langs],
        soakWordsSelfTest: soak.wordCount,
        deterministic: true,
      },
      null,
      2,
    ),
  );
}

// Exports for unit tests
module.exports = {
  buildCorpus,
  generateSoakNovel,
  mulberry32,
  wordCount,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    selfTest();
    process.exit(0);
  }
  let seed = 42;
  let outDir = DEFAULT_OUT;
  let soakWords = 50000;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seed') seed = Number(args[++i]);
    else if (args[i] === '--out') outDir = path.resolve(args[++i]);
    else if (args[i] === '--soak-words') soakWords = Number(args[++i]);
  }
  console.log(JSON.stringify({ action: 'build-corpus', seed, outDir, soakWords }));
  const started = Date.now();
  const { manifest } = buildCorpus({ seed, outDir, write: true, soakWords });
  const elapsedMs = Date.now() - started;
  console.log(
    JSON.stringify(
      {
        ok: true,
        elapsedMs,
        documentCount: manifest.documentCount,
        nonSoakCount: manifest.nonSoakCount,
        soak: manifest.documents.find((d) => d.soak),
        manifestPath: path.join(outDir, 'manifest.json'),
      },
      null,
      2,
    ),
  );
}
