(function () {
  'use strict';

  function drawWave(canvas, mode) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
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
  if (grid) {
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
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
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
  }

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
  if (bars) {
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
  }

  // --- Chapter marker demo (interactive + audible) ---
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
  const playBtn = document.getElementById('play-demo');
  const timeline = document.querySelector('#chapters .timeline');
  const statusEl = document.getElementById('chapter-status');
  let timer = null;
  let t = 0;
  let lastSpokenChapter = -1;
  const chapterButtons = [];

  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function currentChapterIndex(sec) {
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (sec >= chapters[i].start) return i;
    }
    return 0;
  }

  function stopSpeech() {
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }

  function speakChapter(index) {
    if (index === lastSpokenChapter) return;
    lastSpokenChapter = index;
    const ch = chapters[index];
    if (!ch || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(
        ch.title.replace(/—/g, ',') + '. Chapter marker at ' + fmt(ch.start),
      );
      u.rate = 1.05;
      u.pitch = 1;
      u.volume = 1;
      window.speechSynthesis.speak(u);
    } catch {
      /* Speech API unavailable */
    }
  }

  function setPlayingUi(playing) {
    if (!playBtn) return;
    playBtn.textContent = playing ? '❚❚ Pause' : '▶ Play demo';
    playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    playBtn.setAttribute(
      'aria-label',
      playing ? 'Pause chapter demo' : 'Play chapter demo',
    );
  }

  function stopPlayback() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    stopSpeech();
    setPlayingUi(false);
  }

  function update() {
    if (playhead) {
      const pct = Math.min(100, Math.max(0, (t / total) * 100));
      playhead.style.width = pct + '%';
    }
    if (timeLabel) {
      timeLabel.textContent = fmt(t) + ' / ' + fmt(total);
    }
    const idx = currentChapterIndex(t);
    chapterButtons.forEach((btn, i) => {
      btn.classList.toggle('is-active', i === idx);
      btn.setAttribute('aria-current', i === idx ? 'true' : 'false');
    });
    if (statusEl) {
      statusEl.textContent =
        'Now: ' + chapters[idx].title + ' (' + fmt(chapters[idx].start) + '–' + fmt(chapters[idx].end) + ')';
    }
    if (timer) speakChapter(idx);
  }

  function seekTo(sec) {
    t = Math.max(0, Math.min(total, sec));
    lastSpokenChapter = -1;
    update();
    if (timer) speakChapter(currentChapterIndex(t));
  }

  function startPlayback() {
    if (timer) return;
    if (t >= total) {
      t = 0;
      lastSpokenChapter = -1;
    }
    setPlayingUi(true);
    speakChapter(currentChapterIndex(t));
    // ~1s of audiobook time every 40ms wall clock → full demo ~30s
    timer = setInterval(() => {
      t += 1;
      if (t >= total) {
        t = total;
        update();
        stopPlayback();
        if (statusEl) statusEl.textContent = 'Finished — click a chapter or Play to restart';
        return;
      }
      update();
    }, 40);
  }

  if (list) {
    chapters.forEach((ch, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chapter-item';
      btn.textContent = ch.title + ' · ' + fmt(ch.start) + '–' + fmt(ch.end);
      btn.addEventListener('click', () => {
        seekTo(ch.start);
        if (!timer) startPlayback();
      });
      li.appendChild(btn);
      list.appendChild(li);
      chapterButtons.push(btn);
    });
  }

  if (playBtn) {
    playBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (timer) {
        stopPlayback();
        if (statusEl) statusEl.textContent = 'Paused at ' + fmt(t);
        return;
      }
      startPlayback();
    });
  }

  if (timeline) {
    timeline.style.cursor = 'pointer';
    timeline.setAttribute('role', 'slider');
    timeline.setAttribute('aria-label', 'Seek in chapter demo');
    timeline.setAttribute('aria-valuemin', '0');
    timeline.setAttribute('aria-valuemax', String(total));
    const seekFromEvent = (ev) => {
      const rect = timeline.getBoundingClientRect();
      const x = (ev.clientX - rect.left) / Math.max(1, rect.width);
      seekTo(x * total);
    };
    timeline.addEventListener('click', seekFromEvent);
  }

  update();
})();
