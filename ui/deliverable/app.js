(function () {
  'use strict';

  function drawWave(canvas, mode) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#0b0f16';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = mode === 'before' ? '#f07178' : '#3dd68c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const seams = [0.2, 0.4, 0.6, 0.8];
    for (let x = 0; x < w; x++) {
      const t = x / w;
      let amp = Math.sin(t * Math.PI * 40) * 0.35 + Math.sin(t * Math.PI * 7) * 0.2;
      if (mode === 'before') {
        for (const s of seams) {
          if (Math.abs(t - s) < 0.012) amp *= 0.05;
          if (t > s && t < s + 0.02) amp *= 0.15;
        }
      } else {
        for (const s of seams) {
          const d = Math.abs(t - s);
          if (d < 0.015) amp *= 0.85 + 0.15 * (d / 0.015);
        }
      }
      const y = h / 2 + amp * (h * 0.42) * (0.6 + 0.4 * Math.sin(t * 12));
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // seam markers
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = mode === 'before' ? 'rgba(240,113,120,0.5)' : 'rgba(61,214,140,0.25)';
    seams.forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(s * w, 8);
      ctx.lineTo(s * w, h - 8);
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  drawWave(document.getElementById('wave-before'), 'before');
  drawWave(document.getElementById('wave-after'), 'after');

  const voices = [
    { name: 'en_US lessac medium', lang: 'en-US', quality: 'medium', gender: 'female', sr: 22050 },
    { name: 'en_US amy low', lang: 'en-US', quality: 'low', gender: 'female', sr: 16000 },
    { name: 'en_US ryan high', lang: 'en-US', quality: 'high', gender: 'male', sr: 22050 },
    { name: 'en_GB alan medium', lang: 'en-GB', quality: 'medium', gender: 'male', sr: 22050 },
    { name: 'en_US libritts medium', lang: 'en-US', quality: 'medium', gender: 'mixed', sr: 22050 },
    { name: 'en_US kathleen low', lang: 'en-US', quality: 'low', gender: 'female', sr: 16000 },
  ];
  const grid = document.getElementById('voice-grid');
  voices.forEach((v, i) => {
    const el = document.createElement('article');
    el.className = 'voice-card';
    el.innerHTML =
      '<span class="badge">Neural</span><h3>' +
      v.name +
      '</h3><p class="caption">' +
      [v.lang, v.quality, v.gender, v.sr + ' Hz'].join(' · ') +
      '</p><canvas class="mini-wave" width="240" height="40" aria-hidden="true"></canvas>';
    grid.appendChild(el);
    const c = el.querySelector('canvas');
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#4f8cff';
    ctx.beginPath();
    for (let x = 0; x < c.width; x++) {
      const y =
        c.height / 2 +
        Math.sin((x / c.width) * Math.PI * (8 + i) + i) * (10 + (i % 3) * 3);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });

  const modules = [
    { name: 'ssml-parser', before: 0, after: 82 },
    { name: 'text-chunker', before: 40, after: 75 },
    { name: 'pronunciation', before: 0, after: 94 },
    { name: 'tts.controller', before: 0, after: 77 },
    { name: 'voice-manager', before: 0, after: 84 },
    { name: 'jobs.service', before: 0, after: 100 },
    { name: 'gateway', before: 0, after: 87 },
    { name: 'entities (tts)', before: 0, after: 100 },
  ];
  const bars = document.getElementById('coverage-bars');
  modules.forEach((m) => {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML =
      '<span>' +
      m.name +
      '</span><div class="bar-track"><div class="bar-fill before" style="--before:' +
      m.before +
      '%;width:' +
      m.before +
      '%"></div><div class="bar-fill" style="width:' +
      m.after +
      '%"></div></div><span>' +
      m.after +
      '%</span>';
    bars.appendChild(row);
  });

  const chapters = [
    { title: 'Introduction', start: 0, end: 95 },
    { title: 'Chapter 1 — The Signal', start: 95, end: 320 },
    { title: 'Chapter 2 — Resonance', start: 320, end: 540 },
    { title: 'Chapter 3 — Long Form', start: 540, end: 760 },
  ];
  const total = 760;
  const list = document.getElementById('chapter-demo-list');
  const playhead = document.getElementById('playhead');
  const timeLabel = document.getElementById('time-label');
  let timer = null;
  let t = 0;

  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  chapters.forEach((ch) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent =
      ch.title + ' · ' + fmt(ch.start) + '–' + fmt(ch.end);
    btn.addEventListener('click', () => {
      t = ch.start;
      update();
    });
    li.appendChild(btn);
    list.appendChild(li);
  });

  function update() {
    playhead.style.width = (t / total) * 100 + '%';
    timeLabel.textContent = fmt(t) + ' / ' + fmt(total);
  }

  document.getElementById('play-demo').addEventListener('click', () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      document.getElementById('play-demo').textContent = '▶ Play demo';
      return;
    }
    document.getElementById('play-demo').textContent = '❚❚ Pause';
    timer = setInterval(() => {
      t += 2;
      if (t >= total) {
        t = total;
        clearInterval(timer);
        timer = null;
        document.getElementById('play-demo').textContent = '▶ Play demo';
      }
      update();
    }, 50);
  });
  update();
})();
