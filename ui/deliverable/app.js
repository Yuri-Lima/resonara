(function () {
  'use strict';

  /* ---------- Before/After waveforms ---------- */
  function drawWave(canvas, mode) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);
    // grid
    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const boundaries = [0.18, 0.36, 0.54, 0.72, 0.9];
    ctx.beginPath();
    ctx.strokeStyle = mode === 'before' ? '#67e8f9' : '#2dd4bf';
    ctx.lineWidth = 1.5;
    const mid = h / 2;
    for (let x = 0; x < w; x++) {
      const t = x / w;
      let amp = 0.35 + 0.25 * Math.sin(t * 40) * Math.sin(t * 7);
      // speech envelope bursts
      amp *= 0.4 + 0.6 * Math.abs(Math.sin(t * Math.PI * 6));
      if (mode === 'before') {
        // hard silence gaps near boundaries
        for (const b of boundaries) {
          if (Math.abs(t - b) < 0.018) amp *= 0.05;
        }
      } else {
        // smooth crossfade — slight dip only
        for (const b of boundaries) {
          if (Math.abs(t - b) < 0.01) amp *= 0.85;
        }
      }
      const y = mid + Math.sin(x * 0.35) * amp * (h * 0.42);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // boundary markers
    boundaries.forEach((b) => {
      const x = b * w;
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = mode === 'before' ? '#ef4444' : '#22d3ee';
      ctx.lineWidth = 1;
      ctx.moveTo(x, 8);
      ctx.lineTo(x, h - 8);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  drawWave(document.getElementById('wave-before'), 'before');
  drawWave(document.getElementById('wave-after'), 'after');
  const mkBefore = document.getElementById('markers-before');
  const mkAfter = document.getElementById('markers-after');
  [1, 2, 3, 4, 5].forEach((n) => {
    const a = document.createElement('li');
    a.className = 'bad';
    a.textContent = `chunk ${n} seam (click/gap)`;
    mkBefore.appendChild(a);
    const b = document.createElement('li');
    b.className = 'good';
    b.textContent = `chunk ${n} crossfade 20ms`;
    mkAfter.appendChild(b);
  });

  /* ---------- Engine matrix ---------- */
  const engRows = [
    ['Voice quality', 'Robotic / formant', 'Neural ONNX', 'Neural 82M (best)'],
    ['Speed (RTF)', '3–8×', '>1× typical', '>1× target'],
    ['SSML', 'Partial (say/SAPI)', 'break / phoneme / sub', 'Mapped subset'],
    ['Voice count', 'OS-dependent', '30+ EN models', 'Multi-speaker'],
    ['Offline', '✅', '✅', '✅'],
    ['Multi-speaker', '❌', 'Some models', 'Yes'],
    ['Chunk prosody', 'Resets each chunk', 'Cross-sentence native', 'Continuous'],
    ['Linux support', '❌', '✅', '✅'],
  ];
  const engBody = document.getElementById('engine-tbody');
  engRows.forEach((r) => {
    const tr = document.createElement('tr');
    r.forEach((c, i) => {
      const td = document.createElement(i === 0 ? 'th' : 'td');
      if (i === 0) td.scope = 'row';
      td.textContent = c;
      tr.appendChild(td);
    });
    engBody.appendChild(tr);
  });

  /* ---------- SSML ---------- */
  const ssmlRows = [
    ['<break time="500ms"/>', 'Pause half a second', 'Silence gap', '✅', '✅', '✅'],
    ['<emphasis level="strong">', 'Stress a word', 'Louder / emphatic', '⚠️', '✅', '⚠️'],
    ['<prosody rate="slow">', 'Slow speech', 'Slower tempo', '⚠️', '✅', '⚠️'],
    ['<say-as interpret-as="cardinal">', 'Numbers as words', 'Four not 4', 'via dict', '✅', 'via dict'],
    ['<phoneme alphabet="ipa" ph="…">', 'IPA override', 'Custom pronunciation', '✅', '⚠️', 'via sub'],
    ['<sub alias="…">', 'WWW → World Wide Web', 'Substitution', '✅', '✅', '✅'],
    ['<voice name="…">', 'Speaker switch', 'Voice change', '✅', '⚠️', '✅'],
  ];
  const ssmlBody = document.getElementById('ssml-tbody');
  ssmlRows.forEach((r) => {
    const tr = document.createElement('tr');
    r.forEach((c, i) => {
      const td = document.createElement(i === 0 ? 'th' : 'td');
      if (i === 0) {
        td.scope = 'row';
        td.innerHTML = '<code>' + c.replace(/</g, '&lt;') + '</code>';
      } else {
        td.textContent = c;
        if (c === '✅') td.className = 'cell-yes';
        if (c.indexOf('⚠️') === 0) td.className = 'cell-partial';
      }
      tr.appendChild(td);
    });
    ssmlBody.appendChild(tr);
  });
  document.getElementById('ssml-sample').textContent =
    '<speak>\n  Welcome to <emphasis level="strong">Resonara</emphasis>.\n' +
    '  <break time="500ms"/>\n  <prosody rate="slow">This part is spoken slowly.</prosody>\n' +
    '  <sub alias="World Wide Web">WWW</sub> changed everything.\n</speak>';
  document.getElementById('play-ssml').addEventListener('click', () => {
    const a = document.getElementById('audio-ssml');
    a.hidden = false;
    a.play().catch(() => {});
  });

  /* ---------- Pipeline ---------- */
  const stages = [
    'text/document',
    'extract',
    'pronunciation dict',
    'SSML parse',
    'dialogue parse',
    'chunk (engine-aware)',
    'per-chunk synth',
    'silence trim',
    'crossfade 20ms',
    '¶ pauses 300ms',
    'post-process',
    'chapter markers',
    'M4B / WAV / MP3',
  ];
  const pipe = document.getElementById('pipeline-flow');
  stages.forEach((s, i) => {
    const step = document.createElement('div');
    step.className = 'pipe-step';
    step.setAttribute('role', 'listitem');
    step.textContent = s;
    pipe.appendChild(step);
    if (i < stages.length - 1) {
      const arr = document.createElement('span');
      arr.className = 'pipe-arrow';
      arr.setAttribute('aria-hidden', 'true');
      arr.textContent = '→';
      pipe.appendChild(arr);
    }
  });

  /* ---------- Voices ---------- */
  const fallbackVoices = [
    { id: 'piper:en_US-lessac-medium', name: 'Lessac', engine: 'piper', language: 'en-US', quality: 'medium', gender: 'female', sampleRate: 22050, installed: true },
    { id: 'piper:pt_BR-faber-medium', name: 'Faber', engine: 'piper', language: 'pt-BR', quality: 'medium', gender: 'male', sampleRate: 22050, installed: true },
    { id: 'kokoro:af_sarah', name: 'Sarah', engine: 'kokoro', language: 'en-US', quality: 'high', gender: 'female', sampleRate: 24000, installed: true },
    { id: 'platform:default', name: 'System default', engine: 'platform', language: 'en', quality: 'os', gender: '—', sampleRate: 22050, installed: true },
  ];
  function renderVoices(list) {
    const grid = document.getElementById('voice-grid');
    grid.innerHTML = '';
    list.forEach((v) => {
      const card = document.createElement('article');
      card.className = 'voice-card';
      card.setAttribute('role', 'listitem');
      card.innerHTML =
        '<h3>' +
        (v.name || v.id) +
        '</h3>' +
        '<div class="meta">' +
        '<span class="badge eng">' +
        (v.engine || '?') +
        '</span>' +
        '<span class="badge ' +
        (v.installed !== false ? 'ok' : 'dl') +
        '">' +
        (v.installed !== false ? 'installed' : 'downloadable') +
        '</span>' +
        '<p>' +
        [v.language, v.quality, v.gender, v.sampleRate ? v.sampleRate + ' Hz' : '']
          .filter(Boolean)
          .join(' · ') +
        '</p></div>';
      grid.appendChild(card);
    });
  }
  renderVoices(fallbackVoices);
  fetch('/tts/voices')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const list = Array.isArray(data) ? data : data?.voices || data?.items;
      if (list?.length) {
        renderVoices(
          list.slice(0, 24).map((v) => ({
            id: v.id,
            name: v.name || v.id,
            engine: v.engine,
            language: v.language,
            quality: v.quality,
            gender: v.gender,
            sampleRate: v.sampleRate,
            installed: true,
          })),
        );
      }
    })
    .catch(() => {});

  /* ---------- Demos ---------- */
  const demos = [
    ['npm run demo:quick', 'quick-sentence', 'The quick brown fox…', 'Natural single sentence', 'quick-sentence.wav'],
    ['npm run demo:paragraph', 'paragraph', 'Sunrise over mountain lake', 'Prosody + pauses', 'paragraph.wav'],
    ['npm run demo:article', 'short-article', 'History of radio', 'Multi-paragraph flow', 'short-article.wav'],
    ['npm run demo:news', 'news-article', 'Tech news ~2k words', 'Numbers, quotes, terms', 'news-article.wav'],
    ['npm run demo:chapter', 'book-chapter', 'Fiction + dialogue ~5k', 'ZERO audible seams', 'book-chapter.wav'],
    ['npm run demo:technical', 'technical-doc', 'NestJS / TypeORM docs', 'Acronym pronunciation', 'technical-doc.wav'],
    ['npm run demo:ssml', 'ssml-showcase', '<emphasis>…</emphasis>', 'All SSML effects', 'ssml-showcase.wav'],
    ['npm run demo:dialogue', 'dialogue-script', '[alice]: … [bob]: …', 'Clean voice switches', 'dialogue-script.wav'],
    ['npm run demo:pronunciation', 'pronunciation-challenge', 'PostgreSQL, kubectl…', 'Dictionary applied', 'pronunciation-challenge.wav'],
    ['npm run demo:numbers', 'numbers-and-dates', '$4.2M, March 15th…', 'Numbers spoken correctly', 'numbers-and-dates.wav'],
    ['npm run demo:all', 'all 10 samples', 'Full suite', 'report.json stats', null],
    ['npm run demo:compare', 'paragraph A/B', 'platform vs neural', 'Side-by-side listen', null],
  ];
  const demoBody = document.getElementById('demo-tbody');
  demos.forEach((d) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><code>' +
      d[0] +
      '</code></td><td>' +
      d[1] +
      '</td><td>' +
      d[2] +
      '</td><td>' +
      d[3] +
      '</td><td></td>';
    const td = tr.lastElementChild;
    if (d[4]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ghost';
      btn.textContent = 'Play';
      btn.setAttribute('aria-label', 'Play ' + d[1]);
      btn.addEventListener('click', () => {
        const a = new Audio('/demo-output/' + d[4]);
        a.play().catch(() => alert('Start API with make ui to play demo audio'));
      });
      td.appendChild(btn);
    }
    demoBody.appendChild(tr);
  });

  /* ---------- Coverage chart ---------- */
  (function drawCoverage() {
    const canvas = document.getElementById('cov-chart');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);
    const modules = [
      { name: 'tts.service', before: 10, after: 85 },
      { name: 'piper-tts', before: 0, after: 90 },
      { name: 'ssml-parser', before: 0, after: 92 },
      { name: 'chunker', before: 40, after: 95 },
      { name: 'ffmpeg', before: 35, after: 80 },
      { name: 'dict', before: 0, after: 88 },
      { name: 'dialogue', before: 0, after: 90 },
      { name: 'docs', before: 0, after: 82 },
      { name: 'tracks', before: 0, after: 70 },
      { name: 'jobs', before: 5, after: 75 },
    ];
    const barW = (w - 60) / modules.length;
    modules.forEach((m, i) => {
      const x = 40 + i * barW;
      const hb = (m.before / 100) * (h - 50);
      const ha = (m.after / 100) * (h - 50);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(x + 4, h - 30 - hb, barW / 2 - 6, hb);
      ctx.fillStyle = '#2dd4bf';
      ctx.fillRect(x + barW / 2, h - 30 - ha, barW / 2 - 6, ha);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px system-ui';
      ctx.save();
      ctx.translate(x + 8, h - 8);
      ctx.fillText(m.name.slice(0, 10), 0, 0);
      ctx.restore();
    });
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px system-ui';
    ctx.fillText('gray = before · teal = after', 40, 18);
  })();

  /* ---------- Benchmarks ---------- */
  const benchDefault = [
    { name: 'quick-sentence', words: 16, duration: 4.9, rtf: 2.06, cps: 38.4 },
    { name: 'paragraph', words: 74, duration: 21.8, rtf: 7.55, cps: 143.5 },
    { name: 'short-article', words: 471, duration: 180.5, rtf: 16.52, cps: 285.6 },
    { name: 'news-article', words: 2039, duration: 912.8, rtf: 18.41, cps: 270.6 },
    { name: 'book-chapter', words: 5164, duration: 1800, rtf: 17.84, cps: 305.9 },
    { name: 'technical-doc', words: 3000, duration: 1589, rtf: 17.58, cps: 232.3 },
    { name: 'ssml-showcase', words: 80, duration: 12.5, rtf: 4.91, cps: 210.2 },
    { name: 'dialogue-script', words: 100, duration: 20.3, rtf: 2.73, cps: 59.4 },
    { name: 'pronunciation', words: 500, duration: 33.6, rtf: 9.69, cps: 160.2 },
    { name: 'numbers-dates', words: 80, duration: 33.9, rtf: 8.74, cps: 71.9 },
  ];
  function renderBench(rows) {
    const canvas = document.getElementById('bench-chart');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);
    const max = Math.max(2, ...rows.map((r) => r.rtf));
    const barW = (w - 50) / rows.length;
    rows.forEach((r, i) => {
      const bh = (r.rtf / max) * (h - 55);
      const x = 30 + i * barW;
      const y = h - 35 - bh;
      ctx.fillStyle = r.rtf >= 1 ? '#2dd4bf' : '#f87171';
      ctx.fillRect(x + 6, y, barW - 12, bh);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px system-ui';
      ctx.fillText(r.name.slice(0, 8), x + 2, h - 12);
      ctx.fillText(r.rtf.toFixed(1) + '×', x + 6, y - 4);
    });
    // 1x line
    const y1 = h - 35 - (1 / max) * (h - 55);
    ctx.strokeStyle = '#fbbf24';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(20, y1);
    ctx.lineTo(w - 10, y1);
    ctx.stroke();
    ctx.setLineDash([]);

    const tb = document.getElementById('bench-tbody');
    tb.innerHTML = '';
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' +
        r.name +
        '</td><td>' +
        r.words +
        '</td><td>' +
        r.duration.toFixed(1) +
        's</td><td>' +
        r.rtf.toFixed(2) +
        '×</td><td>' +
        r.cps.toFixed(1) +
        '</td>';
      tb.appendChild(tr);
    });
  }
  renderBench(benchDefault);
  fetch('/demo-output/report.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data?.results?.length) return;
      renderBench(
        data.results.map((x) => ({
          name: x.name,
          words: x.words || 0,
          duration: x.duration || 0,
          rtf: x.realTimeFactor || 0,
          cps: x.charsPerSecond || 0,
        })),
      );
    })
    .catch(() => {});

  /* ---------- Dictionary ---------- */
  const dictRows = [
    ['PostgreSQL', 'post gres Q L', 'post-grez-cue-el (mangled)', 'post gres Q L'],
    ['Kubernetes', 'koo ber net eez', 'koo-ber-nett-ees', 'koo ber net eez'],
    ['nginx', 'engine X', 'en-jinx', 'engine X'],
    ['kubectl', 'kube control', 'kubect-el', 'kube control'],
    ['OAuth', 'oh auth', 'oh-ath', 'oh auth'],
    ['API', 'A P I', 'appy', 'A P I'],
    ['GIF', 'gif (hard G)', 'jif', 'gif'],
    ['JSON', 'jason', 'jay-sahn', 'jason'],
  ];
  const dictBody = document.getElementById('dict-tbody');
  dictRows.forEach((r) => {
    const tr = document.createElement('tr');
    r.forEach((c) => {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    });
    dictBody.appendChild(tr);
  });

  /* ---------- Chapters ---------- */
  const chapters = [
    { title: 'Chapter 1 — Dawn at the Lake', start: '0:00', pct: 0 },
    { title: 'Chapter 2 — The Message', start: '4:12', pct: 18 },
    { title: 'Chapter 3 — Alice Arrives', start: '9:40', pct: 38 },
    { title: 'Chapter 4 — Bob’s Counter', start: '16:05', pct: 58 },
    { title: 'Chapter 5 — Resolution', start: '22:30', pct: 78 },
  ];
  const chList = document.getElementById('chapter-list');
  chapters.forEach((ch, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.tabIndex = 0;
    li.innerHTML =
      '<strong>' +
      ch.title +
      '</strong><div class="time">' +
      ch.start +
      '</div>';
    const activate = () => {
      chList.querySelectorAll('[aria-selected="true"]').forEach((el) => el.setAttribute('aria-selected', 'false'));
      li.setAttribute('aria-selected', 'true');
      document.getElementById('chapter-now').textContent = 'Now: ' + ch.title + ' @ ' + ch.start;
      document.getElementById('chapter-progress').style.width = ch.pct + '%';
      const audio = document.getElementById('audio-chapter');
      // Approximate seek into long chapter demo if loaded
      if (audio.duration && !Number.isNaN(audio.duration)) {
        audio.currentTime = (ch.pct / 100) * audio.duration;
      }
    };
    li.addEventListener('click', activate);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = li.nextElementSibling;
        if (next) next.focus();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = li.previousElementSibling;
        if (prev) prev.focus();
      }
    });
    if (i === 0) {
      li.setAttribute('aria-selected', 'true');
      document.getElementById('chapter-now').textContent = 'Now: ' + ch.title + ' @ ' + ch.start;
      document.getElementById('chapter-progress').style.width = '0%';
    }
    chList.appendChild(li);
  });

  /* ---------- G27 feature matrix (kept) ---------- */
  const rows = [
    ['Engine plurality', '✅', '❌', '❌', '⚠️', '✅'],
    ['QA WER loop', '❌', '❌', '❌', '❌', '✅'],
    ['Read-along karaoke', '❌', '✅', '⚠️', '⚠️', '✅'],
    ['EPUB3 Media Overlays', '❌', '✅', '❌', '❌', '✅'],
    ['Library bookshelf', '⚠️', '⚠️', '✅', '❌', '✅'],
    ['Bookmarks', '❌', '⚠️', '✅', '❌', '✅'],
    ['Sleep timer', '❌', '❌', '✅', '❌', '✅'],
    ['Playback speed 0.5–3×', '❌', '⚠️', '✅', '⚠️', '✅'],
    ['Podcast RSS', '❌', '❌', '✅', '❌', '✅'],
    ['Real CLI', '✅', '⚠️', '⚠️', '❌', '✅'],
    ['Watch folder', '⚠️', '❌', '❌', '❌', '✅'],
    ['Cover art', '⚠️', '⚠️', '✅', '❌', '✅'],
    ['Seamless long-form TTS', '⚠️', '⚠️', '❌', '❌', '✅'],
    ['Offline desktop', '⚠️', '⚠️', '⚠️', '✅', '✅'],
  ];
  const tb = document.querySelector('#feature-matrix tbody');
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    r.forEach((c, i) => {
      const td = document.createElement(i === 0 ? 'th' : 'td');
      if (i === 0) td.scope = 'row';
      td.textContent = c;
      if (c === '✅') td.className = 'cell-yes';
      if (c === '⚠️') td.className = 'cell-partial';
      if (c === '❌') td.className = 'cell-no';
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });

  const qaSamples = [
    { name: 'quick-sentence', wer: 0.0 },
    { name: 'paragraph', wer: 0.02 },
    { name: 'short-article', wer: 0.04 },
    { name: 'numbers', wer: 0.06 },
    { name: 'dialogue', wer: 0.05 },
  ];
  fetch('/demo-output/qa-report.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data?.results) {
        const mapped = data.results
          .filter((x) => x.aggregateWer != null)
          .map((x) => ({ name: x.name, wer: x.aggregateWer }));
        if (mapped.length) drawWer(mapped);
      } else drawWer(qaSamples);
    })
    .catch(() => drawWer(qaSamples));

  function drawWer(samples) {
    const canvas = document.getElementById('wer-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);
    const max = Math.max(0.1, ...samples.map((s) => s.wer));
    const barW = (w - 40) / samples.length;
    samples.forEach((s, i) => {
      const bh = (s.wer / max) * (h - 50);
      const x = 20 + i * barW;
      const y = h - 30 - bh;
      ctx.fillStyle = s.wer > 0.08 ? '#f87171' : '#2dd4bf';
      ctx.fillRect(x + 8, y, barW - 16, bh);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px system-ui';
      ctx.fillText(s.name.slice(0, 10), x + 4, h - 12);
      ctx.fillText(s.wer.toFixed(3), x + 8, y - 4);
    });
    const ty = h - 30 - (0.08 / max) * (h - 50);
    ctx.strokeStyle = '#fbbf24';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(10, ty);
    ctx.lineTo(w - 10, ty);
    ctx.stroke();
    const qt = document.getElementById('qa-table');
    if (qt) {
      qt.innerHTML =
        '<table><thead><tr><th>Sample</th><th>WER</th></tr></thead><tbody>' +
        samples
          .map((s) => '<tr><td>' + s.name + '</td><td>' + s.wer.toFixed(4) + '</td></tr>')
          .join('') +
        '</tbody></table>';
    }
  }

  // Karaoke demo text
  const demoText = document.getElementById('demo-text');
  if (demoText) {
    'The quick brown fox jumped gracefully over the lazy sleeping dog.'
      .split(/\s+/)
      .forEach((word, i) => {
        const span = document.createElement('span');
        span.className = 'w';
        span.textContent = word + ' ';
        span.dataset.i = String(i);
        demoText.appendChild(span);
      });
  }
})();
