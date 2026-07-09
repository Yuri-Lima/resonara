/* Audio pipeline dashboard — vanilla JS */
(function () {
  'use strict';

  // --- Codec matrix ---
  const formats = ['MP3', 'AAC', 'FLAC', 'OGG', 'Opus', 'WAV'];
  const notes = {
    'FLAC|MP3': 'soxr if SR≠',
    'WAV|MP3': 'dither 24→16',
    'FLAC|WAV': 'lossless',
  };
  const tbody = document.getElementById('matrix-body');
  formats.forEach((row) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = row;
    tr.appendChild(th);
    formats.forEach((col) => {
      const td = document.createElement('td');
      const key = `${row}|${col}`;
      if (notes[key]) {
        td.className = 'note';
        td.textContent = '✓ ' + notes[key];
      } else {
        td.className = 'yes';
        td.textContent = '✓';
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  // --- Loudness steps animation ---
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  function cycleSteps() {
    step1.classList.add('active');
    step2.classList.remove('active');
    setTimeout(() => {
      step1.classList.remove('active');
      step2.classList.add('active');
      drawLufs(true);
    }, 1600);
    setTimeout(cycleSteps, 3600);
  }
  cycleSteps();

  // LUFS histogram
  const lufsCanvas = document.getElementById('lufs-chart');
  const lctx = lufsCanvas.getContext('2d');
  function drawLufs(after) {
    const w = lufsCanvas.width;
    const h = lufsCanvas.height;
    lctx.clearRect(0, 0, w, h);
    // axes
    lctx.strokeStyle = '#243041';
    lctx.beginPath();
    lctx.moveTo(40, 10);
    lctx.lineTo(40, h - 30);
    lctx.lineTo(w - 10, h - 30);
    lctx.stroke();
    const before = [-22, -20, -18, -16, -19, -21, -17, -23, -15, -20];
    const afterH = [-14.2, -13.8, -14.1, -14.0, -13.9, -14.3, -14.0, -13.7, -14.1, -14.0];
    const data = after ? afterH : before;
    const color = after ? '#3dd6c6' : '#5b9dff';
    const barW = (w - 60) / data.length - 6;
    data.forEach((v, i) => {
      const norm = (v + 30) / 20; // map -30..-10
      const bh = Math.max(4, norm * (h - 50));
      const x = 50 + i * (barW + 6);
      const y = h - 30 - bh;
      lctx.fillStyle = color;
      lctx.globalAlpha = 0.85;
      lctx.fillRect(x, y, barW, bh);
    });
    lctx.globalAlpha = 1;
    lctx.fillStyle = '#8b9bb0';
    lctx.font = '12px system-ui';
    lctx.fillText(after ? 'After (−14 LUFS)' : 'Before (unnormalized)', 50, 20);
    // target line
    if (after) {
      const ty = h - 30 - ((-14 + 30) / 20) * (h - 50);
      lctx.strokeStyle = '#f0b429';
      lctx.setLineDash([4, 4]);
      lctx.beginPath();
      lctx.moveTo(40, ty);
      lctx.lineTo(w - 10, ty);
      lctx.stroke();
      lctx.setLineDash([]);
    }
  }
  drawLufs(false);
  document.getElementById('lra-bar').style.width = '42%';
  document.getElementById('tp-bar').style.width = '88%';

  // --- Waveform ---
  function synthWave(n) {
    const peaksL = [], peaksR = [], rmsL = [], rmsR = [], peaksM = [], rmsM = [];
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const env = Math.sin(Math.PI * t) * (0.55 + 0.45 * Math.sin(t * 18));
      const lmax = env * (0.7 + 0.3 * Math.sin(t * 40));
      const rmax = env * (0.7 + 0.3 * Math.cos(t * 36));
      peaksL.push([-lmax * 0.9, lmax]);
      peaksR.push([-rmax * 0.85, rmax * 0.95]);
      peaksM.push([-Math.max(lmax, rmax), Math.max(lmax, rmax)]);
      rmsL.push(lmax * 0.45);
      rmsR.push(rmax * 0.42);
      rmsM.push(((lmax + rmax) / 2) * 0.44);
    }
    return { peaks: { left: peaksL, right: peaksR, mono: peaksM }, rms: { left: rmsL, right: rmsR, mono: rmsM } };
  }

  const wave = synthWave(1800);
  const wc = document.getElementById('wave-canvas');
  const wctx = wc.getContext('2d');

  function drawWave() {
    const w = wc.width;
    const h = wc.height;
    const midL = h * 0.28;
    const midR = h * 0.72;
    const half = h * 0.22;
    wctx.clearRect(0, 0, w, h);
    wctx.fillStyle = '#0a1018';
    wctx.fillRect(0, 0, w, h);
    // center lines
    wctx.strokeStyle = '#1c2a3d';
    [midL, midR].forEach((y) => {
      wctx.beginPath();
      wctx.moveTo(0, y);
      wctx.lineTo(w, y);
      wctx.stroke();
    });

    const n = wave.peaks.left.length;
    function layer(peaks, rms, mid, colorPeak, colorRms) {
      // RMS fill
      wctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w;
        const r = rms[i] * half;
        if (i === 0) wctx.moveTo(x, mid - r);
        else wctx.lineTo(x, mid - r);
      }
      for (let i = n - 1; i >= 0; i--) {
        const x = (i / (n - 1)) * w;
        const r = rms[i] * half;
        wctx.lineTo(x, mid + r);
      }
      wctx.closePath();
      wctx.fillStyle = colorRms;
      wctx.fill();
      // Peak outline
      wctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w;
        const p = peaks[i][1] * half;
        if (i === 0) wctx.moveTo(x, mid - p);
        else wctx.lineTo(x, mid - p);
      }
      for (let i = n - 1; i >= 0; i--) {
        const x = (i / (n - 1)) * w;
        const p = Math.abs(peaks[i][0]) * half;
        wctx.lineTo(x, mid + p);
      }
      wctx.closePath();
      wctx.strokeStyle = colorPeak;
      wctx.lineWidth = 1;
      wctx.stroke();
    }
    layer(wave.peaks.left, wave.rms.left, midL, '#5b9dff', 'rgba(91,157,255,0.35)');
    layer(wave.peaks.right, wave.rms.right, midR, '#c084fc', 'rgba(192,132,252,0.35)');
    wctx.fillStyle = '#8b9bb0';
    wctx.font = '11px system-ui';
    wctx.fillText('L', 8, midL - half + 12);
    wctx.fillText('R', 8, midR - half + 12);
  }
  drawWave();

  // --- Filter graphs ---
  const graphs = {
    transcode:
`[ain] → aresample=44100:resampler=soxr:precision=28
                 :osf=s16:dither_method=triangular
      → encoder (libmp3lame | aac | flac | libvorbis | libopus | pcm_*)
      → [aout]

# Example 96k/24 FLAC → 44.1k/16 MP3 320k
ffmpeg -i in.flac -af "aresample=44100:resampler=soxr:precision=28:osf=s16:dither_method=triangular" \\
  -c:a libmp3lame -b:a 320k out.mp3`,
    normalize:
`PASS 1 (measure):
  [ain] → loudnorm=I=-14:TP=-1:LRA=11:print_format=json → null

PASS 2 (apply linear):
  [ain] → loudnorm=I=-14:TP=-1:LRA=11:
            measured_I=…:measured_LRA=…:measured_TP=…:
            measured_thresh=…:offset=…:linear=true
        → aresample=48000:resampler=soxr → [aout]

# Never use single-pass loudnorm for production masters.`,
    trim:
`[ain] → atrim / -ss start -to end
      → afade=t=in:st=0:d=fadeIn:curve=qsin
      → afade=t=out:st=outStart:d=fadeOut:curve=exp
      → [aout]

# Curves: linear→tri · exponential→exp · logarithmic→log · quarter-sine→qsin
# Crossfade: [0:a][1:a] acrossfade=d=dur:c1=tri:c2=tri`,
    waveform:
`[ain] → aresample=44100 (soxr optional)
      → format f32le · channels 1|2
      → pipe:1 (streamed PCM chunks)
      → JS bucket min/max + RMS → JSON peaks[]

# Output: { peaks: {left,right,mono:[[min,max],…]}, rms: {…} }`,
  };
  const graphEl = document.getElementById('filter-graph');
  const tabs = document.querySelectorAll('.filter-tabs [role="tab"]');
  function selectOp(op) {
    tabs.forEach((t) => t.setAttribute('aria-selected', t.dataset.op === op ? 'true' : 'false'));
    graphEl.textContent = graphs[op];
  }
  tabs.forEach((t) => t.addEventListener('click', () => selectOp(t.dataset.op)));
  tabs.forEach((t) =>
    t.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectOp(t.dataset.op);
      }
    }),
  );
  selectOp('transcode');

  // --- Queue simulator ---
  const types = ['transcode', 'normalize', 'waveform', 'trim', 'silence'];
  let seq = 1;
  let processing = 0;
  const queued = [];

  function el(id) { return document.getElementById(id); }

  function cardHtml(job) {
    const div = document.createElement('div');
    div.className = 'job-card' + (job.state === 'complete' ? ' complete' : '') + (job.state === 'failed' ? ' failed' : '');
    div.dataset.id = job.id;
    div.innerHTML = `
      <header><span class="type">${job.type}</span><span class="status">${job.state}</span></header>
      <div class="progress" aria-hidden="true"><i style="width:${job.progress}%"></i></div>
      <div style="font-size:.72rem;color:#8b9bb0;margin-top:.25rem">#${job.id}</div>`;
    return div;
  }

  function render() {
    const q = el('lane-queued');
    const p = el('lane-processing');
    const d = el('lane-done');
    // keep done cards; rebuild queued/processing
    q.innerHTML = '';
    p.innerHTML = '';
    queued.filter((j) => j.state === 'queued').forEach((j) => q.appendChild(cardHtml(j)));
    queued.filter((j) => j.state === 'processing').forEach((j) => p.appendChild(cardHtml(j)));
  }

  function pump() {
    const conc = Math.max(1, Math.min(8, parseInt(el('conc').value, 10) || 2));
    while (processing < conc) {
      const next = queued.find((j) => j.state === 'queued');
      if (!next) break;
      next.state = 'processing';
      next.progress = 0;
      processing++;
      const tick = setInterval(() => {
        next.progress = Math.min(100, next.progress + 8 + Math.random() * 12);
        const bar = document.querySelector(`.job-card[data-id="${next.id}"] .progress > i`);
        const st = document.querySelector(`.job-card[data-id="${next.id}"] .status`);
        if (bar) bar.style.width = next.progress + '%';
        if (st) st.textContent = next.state + ' ' + Math.round(next.progress) + '%';
        if (next.progress >= 100) {
          clearInterval(tick);
          processing--;
          next.state = Math.random() < 0.08 ? 'failed' : 'complete';
          el('lane-done').prepend(cardHtml(next));
          render();
          pump();
        }
      }, 280);
    }
    render();
  }

  el('spawn-jobs').addEventListener('click', () => {
    for (let i = 0; i < 5; i++) {
      queued.push({
        id: seq++,
        type: types[Math.floor(Math.random() * types.length)],
        state: 'queued',
        progress: 0,
      });
    }
    pump();
  });

  // auto-demo
  el('spawn-jobs').click();
})();
