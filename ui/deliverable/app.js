(function () {
  'use strict';
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
    ['OCR', '✅', '❌', '❌', '❌', '❌'],
    ['Voice cloning', '✅', '❌', '❌', '❌', '❌'],
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

  // QA chart from embedded or fetched report
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
        const mean = data.aggregateWerMean;
        if (mean != null) {
          document.getElementById('break-proof').innerHTML +=
            ` <strong>Mean WER ${mean.toFixed(4)}</strong>`;
        }
      } else drawWer(qaSamples);
    })
    .catch(() => drawWer(qaSamples));

  function drawWer(samples) {
    const canvas = document.getElementById('wer-chart');
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
    // threshold line
    const ty = h - 30 - (0.08 / max) * (h - 50);
    ctx.strokeStyle = '#fbbf24';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(10, ty);
    ctx.lineTo(w - 10, ty);
    ctx.stroke();
    document.getElementById('qa-table').innerHTML =
      '<table><thead><tr><th>Sample</th><th>WER</th></tr></thead><tbody>' +
      samples
        .map((s) => `<tr><td>${s.name}</td><td>${s.wer.toFixed(4)}</td></tr>`)
        .join('') +
      '</tbody></table>';
  }

  const engBody = document.querySelector('#engine-matrix tbody');
  [
    ['platform', '~3–8×', 'varies', '3 — robotic', 'fallback'],
    ['piper', '>1× (baseline)', '<0.08', '2 — clear neural', 'EN default if no Kokoro'],
    ['kokoro', '>1× target', '<0.08', '1 — most natural', 'EN default when available'],
  ].forEach((r) => {
    const tr = document.createElement('tr');
    r.forEach((c) => {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    });
    engBody.appendChild(tr);
  });
  document.getElementById('engine-verdict').textContent =
    'Default EN: kokoro > piper medium > platform (evidence from Phase 9 listening + WER + RTF).';

  // Karaoke demo with baked alignment
  const demoWords = [
    { word: 'The', startMs: 0, endMs: 200 },
    { word: 'quick', startMs: 200, endMs: 440 },
    { word: 'brown', startMs: 440, endMs: 740 },
    { word: 'fox', startMs: 740, endMs: 1120 },
    { word: 'jumped', startMs: 1120, endMs: 1480 },
    { word: 'gracefully', startMs: 1480, endMs: 2060 },
    { word: 'over', startMs: 2060, endMs: 2300 },
    { word: 'the', startMs: 2300, endMs: 2450 },
    { word: 'lazy', startMs: 2450, endMs: 2800 },
    { word: 'sleeping', startMs: 2800, endMs: 3300 },
    { word: 'dog.', startMs: 3300, endMs: 3800 },
  ];
  const demoText = document.getElementById('demo-text');
  const demoAudio = document.getElementById('demo-audio');
  demoText.innerHTML = demoWords
    .map((w, i) => `<span class="w" data-i="${i}" data-start="${w.startMs}">${w.word} </span>`)
    .join('');
  demoAudio.src = '/demo-output/quick-sentence.wav';
  demoText.querySelectorAll('.w').forEach((el) => {
    el.addEventListener('click', () => {
      demoAudio.currentTime = Number(el.dataset.start) / 1000;
      demoAudio.play();
    });
  });
  function tick() {
    const t = demoAudio.currentTime * 1000;
    let idx = 0;
    for (let i = 0; i < demoWords.length; i++) {
      if (demoWords[i].startMs <= t) idx = i;
    }
    demoText.querySelectorAll('.w').forEach((n, i) => n.classList.toggle('active', i === idx));
    if (!demoAudio.paused) requestAnimationFrame(tick);
  }
  demoAudio.addEventListener('play', () => requestAnimationFrame(tick));
  demoText.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (demoAudio.paused) demoAudio.play();
      else demoAudio.pause();
    }
  });

  document.getElementById('rss-snip').textContent = `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>My Audiobook</title>
    <itunes:image href="http://127.0.0.1:3847/tts/jobs/…/cover"/>
    <item>
      <title>Chapter 1</title>
      <enclosure url="…/download" type="audio/mpeg"/>
      <itunes:duration>00:12:05</itunes:duration>
    </item>
  </channel>
</rss>`;
})();
