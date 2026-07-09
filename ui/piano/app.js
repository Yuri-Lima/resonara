/* Hybrid Piano — sample engine + live meters + take analysis */
(function () {
  'use strict';

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const WHITE = new Set([0, 2, 4, 5, 7, 9, 11]);
  // Two-octave QWERTY map (base MIDI adjusted by octave control)
  const KEY_MAP = {
    a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
    o: 13, l: 14, p: 15, ';': 16, "'": 17,
  };

  function midiToName(m) {
    return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
  }
  function nameToFile(name) {
    return name.replace(/#/g, 's');
  }
  function dbFromLinear(x) {
    if (x <= 1e-8) return -100;
    return 20 * Math.log10(x);
  }

  const el = (id) => document.getElementById(id);

  class SampleEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.analyser = null;
      this.buffers = new Map(); // midi -> AudioBuffer
      this.active = new Map(); // midi -> { src, gain }
      this.sustain = false;
      this.held = new Set();
      this.manifest = null;
      this.maxPoly = 32;
      this.releaseMs = 80;
    }

    async ensureCtx() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.master.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return this.ctx;
    }

    async loadPack(apiBase, packId) {
      await this.ensureCtx();
      const packRes = await fetch(`${apiBase}/piano/packs/${packId}`);
      if (!packRes.ok) throw new Error('Failed to load pack');
      const pack = await packRes.json();
      this.manifest = pack.manifest;
      this.maxPoly = this.manifest.maxPolyphony || 32;
      this.releaseMs = this.manifest.releaseMs || 80;
      this.buffers.clear();

      const notes = this.manifest.notes || [];
      let loaded = 0;
      const concurrency = 6;
      let i = 0;
      async function worker(self) {
        while (i < notes.length) {
          const idx = i++;
          const n = notes[idx];
          const sampleRes = await fetch(
            `${apiBase}/piano/packs/${packId}/samples/${encodeURIComponent(n.name)}`,
          );
          if (!sampleRes.ok) continue;
          const { url } = await sampleRes.json();
          const ab = await fetch(url).then((r) => r.arrayBuffer());
          const buf = await self.ctx.decodeAudioData(ab.slice(0));
          self.buffers.set(n.midi, buf);
          loaded++;
          el('pack-status').textContent = `Loading ${loaded}/${notes.length}…`;
        }
      }
      await Promise.all(Array.from({ length: concurrency }, () => worker(this)));
      return { loaded, total: notes.length, name: this.manifest.name };
    }

    noteOn(midi, velocity = 96) {
      if (!this.ctx || !this.buffers.has(midi)) return;
      this.noteOff(midi, true);
      // polyphony steal
      if (this.active.size >= this.maxPoly) {
        const oldest = this.active.keys().next().value;
        this.noteOff(oldest, true);
      }
      const buf = this.buffers.get(midi);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const gain = this.ctx.createGain();
      const v = Math.max(0.05, Math.min(1, velocity / 127));
      gain.gain.value = v * v; // perceptual curve
      src.connect(gain);
      gain.connect(this.master);
      src.start();
      this.active.set(midi, { src, gain });
      this.held.add(midi);
      src.onended = () => {
        if (this.active.get(midi)?.src === src) this.active.delete(midi);
      };
    }

    noteOff(midi, force = false) {
      const voice = this.active.get(midi);
      if (!voice) {
        this.held.delete(midi);
        return;
      }
      this.held.delete(midi);
      if (this.sustain && !force) return;
      const t = this.ctx.currentTime;
      const rel = this.releaseMs / 1000;
      try {
        voice.gain.gain.cancelScheduledValues(t);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
        voice.gain.gain.linearRampToValueAtTime(0.0001, t + rel);
        voice.src.stop(t + rel + 0.02);
      } catch (_) { /* already stopped */ }
      this.active.delete(midi);
    }

    setSustain(on) {
      this.sustain = on;
      if (!on) {
        for (const midi of [...this.active.keys()]) {
          if (!this.held.has(midi)) this.noteOff(midi, true);
        }
      }
    }

    createRecorder() {
      if (!this.ctx || !this.master) throw new Error('Audio not ready');
      const dest = this.ctx.createMediaStreamDestination();
      this.master.connect(dest);
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const rec = new MediaRecorder(dest.stream, { mimeType: mime });
      const chunks = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      return {
        start: () => rec.start(100),
        stop: () =>
          new Promise((resolve) => {
            rec.onstop = () => {
              try { this.master.disconnect(dest); } catch (_) {}
              resolve(new Blob(chunks, { type: mime }));
            };
            rec.stop();
          }),
      };
    }
  }

  const engine = new SampleEngine();
  let lowMidi = 36;
  let highMidi = 84;
  let baseMidi = 48; // C3 for keyboard map
  let octaveShift = 0;
  let velocity = 96;
  let currentTakeId = null;
  let recHandle = null;
  let recStart = 0;
  let recTimer = null;
  const pressedKeys = new Set();

  function apiBase() {
    const v = el('api-base').value.trim().replace(/\/$/, '');
    if (v) return v;
    // same origin when served from Nest /ui/piano/
    return window.location.origin;
  }

  function buildKeyboard() {
    const root = el('keyboard');
    root.innerHTML = '';
    for (let m = lowMidi; m <= highMidi; m++) {
      const pc = m % 12;
      const isWhite = WHITE.has(pc);
      const div = document.createElement('div');
      div.className = 'key ' + (isWhite ? 'white' : 'black');
      div.dataset.midi = String(m);
      div.setAttribute('role', 'button');
      div.setAttribute('aria-label', midiToName(m));
      if (isWhite) div.textContent = midiToName(m).replace(/\d+$/, '');
      const down = (e) => {
        e.preventDefault();
        div.classList.add('active');
        engine.noteOn(m, velocity);
      };
      const up = (e) => {
        e.preventDefault();
        div.classList.remove('active');
        engine.noteOff(m);
      };
      div.addEventListener('pointerdown', down);
      div.addEventListener('pointerup', up);
      div.addEventListener('pointerleave', up);
      root.appendChild(div);
    }
  }

  function setKeyVisual(midi, on) {
    const node = el('keyboard').querySelector(`[data-midi="${midi}"]`);
    if (node) node.classList.toggle('active', on);
  }

  // Live meters
  function meterLoop() {
    if (!engine.analyser) {
      requestAnimationFrame(meterLoop);
      return;
    }
    const a = engine.analyser;
    const td = new Uint8Array(a.fftSize);
    const fd = new Uint8Array(a.frequencyBinCount);
    a.getByteTimeDomainData(td);
    a.getByteFrequencyData(fd);

    let peak = 0;
    let sum = 0;
    for (let i = 0; i < td.length; i++) {
      const v = (td[i] - 128) / 128;
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    const rms = Math.sqrt(sum / td.length);
    const pdb = dbFromLinear(peak);
    const rdb = dbFromLinear(rms);
    el('peak-val').textContent = pdb <= -99 ? '−∞' : pdb.toFixed(1) + ' dBFS';
    el('rms-val').textContent = rdb <= -99 ? '−∞' : rdb.toFixed(1) + ' dBFS';
    el('peak-bar').style.width = Math.min(100, peak * 100) + '%';
    el('rms-bar').style.width = Math.min(100, rms * 140) + '%';

    // spectrum
    const sc = el('spectrum');
    const sctx = sc.getContext('2d');
    sctx.fillStyle = '#0a1018';
    sctx.fillRect(0, 0, sc.width, sc.height);
    const step = Math.max(1, Math.floor(fd.length / sc.width));
    for (let x = 0; x < sc.width; x++) {
      const v = fd[x * step] / 255;
      sctx.fillStyle = `rgba(61,214,198,${0.3 + v * 0.7})`;
      const h = v * sc.height;
      sctx.fillRect(x, sc.height - h, 1, h);
    }

    // live wave
    const wc = el('live-wave');
    const wctx = wc.getContext('2d');
    wctx.fillStyle = '#0a1018';
    wctx.fillRect(0, 0, wc.width, wc.height);
    wctx.strokeStyle = '#5b9dff';
    wctx.beginPath();
    for (let x = 0; x < wc.width; x++) {
      const i = Math.floor((x / wc.width) * td.length);
      const v = (td[i] - 128) / 128;
      const y = wc.height / 2 + v * (wc.height / 2 - 2);
      if (x === 0) wctx.moveTo(x, y);
      else wctx.lineTo(x, y);
    }
    wctx.stroke();

    requestAnimationFrame(meterLoop);
  }

  async function loadPack() {
    el('pack-status').textContent = 'Loading…';
    try {
      await engine.ensureCtx();
      const packs = await fetch(`${apiBase()}/piano/packs`).then((r) => r.json());
      if (!packs.length) {
        el('pack-status').textContent = 'No packs — run scripts/seed-piano-pack.sh & restart API';
        return;
      }
      const id = packs[0].id;
      const info = await engine.loadPack(apiBase(), id);
      if (engine.manifest?.keyRange) {
        lowMidi = engine.manifest.keyRange.low;
        highMidi = engine.manifest.keyRange.high;
        buildKeyboard();
      }
      el('pack-status').textContent = `${info.name}: ${info.loaded}/${info.total} notes`;
    } catch (e) {
      el('pack-status').textContent = 'Error: ' + e.message;
    }
  }

  // Keyboard / MIDI
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space') {
      e.preventDefault();
      engine.setSustain(true);
      el('btn-sustain').setAttribute('aria-pressed', 'true');
      return;
    }
    if (e.key === 'z') {
      octaveShift = Math.max(-2, octaveShift - 1);
      el('octave').value = String(octaveShift);
      return;
    }
    if (e.key === 'x') {
      octaveShift = Math.min(3, octaveShift + 1);
      el('octave').value = String(octaveShift);
      return;
    }
    const off = KEY_MAP[e.key.toLowerCase()];
    if (off == null) return;
    const midi = baseMidi + octaveShift * 12 + off;
    if (midi < lowMidi || midi > highMidi) return;
    if (pressedKeys.has(e.key)) return;
    pressedKeys.add(e.key);
    engine.noteOn(midi, velocity);
    setKeyVisual(midi, true);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      engine.setSustain(false);
      el('btn-sustain').setAttribute('aria-pressed', 'false');
      return;
    }
    const off = KEY_MAP[e.key.toLowerCase()];
    if (off == null) return;
    pressedKeys.delete(e.key);
    const midi = baseMidi + octaveShift * 12 + off;
    engine.noteOff(midi);
    setKeyVisual(midi, false);
  });

  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then((access) => {
      for (const input of access.inputs.values()) {
        input.onmidimessage = (msg) => {
          const [st, n, v] = msg.data;
          const cmd = st & 0xf0;
          if (cmd === 0x90 && v > 0) {
            engine.noteOn(n, v);
            setKeyVisual(n, true);
          } else if (cmd === 0x80 || (cmd === 0x90 && v === 0)) {
            engine.noteOff(n);
            setKeyVisual(n, false);
          } else if (cmd === 0xb0 && n === 64) {
            engine.setSustain(v >= 64);
            el('btn-sustain').setAttribute('aria-pressed', v >= 64 ? 'true' : 'false');
          }
        };
      }
    }).catch(() => {});
  }

  // Record → upload take
  el('btn-record').addEventListener('click', async () => {
    try {
      await engine.ensureCtx();
      recHandle = engine.createRecorder();
      recHandle.start();
      recStart = performance.now();
      el('btn-record').disabled = true;
      el('btn-stop').disabled = false;
      el('take-status').textContent = 'Recording…';
      recTimer = setInterval(() => {
        el('rec-timer').textContent =
          ((performance.now() - recStart) / 1000).toFixed(1) + 's';
      }, 100);
    } catch (e) {
      el('take-status').textContent = e.message;
    }
  });

  el('btn-stop').addEventListener('click', async () => {
    if (!recHandle) return;
    clearInterval(recTimer);
    el('btn-stop').disabled = true;
    const blob = await recHandle.stop();
    recHandle = null;
    el('btn-record').disabled = false;
    el('take-status').textContent = 'Uploading take…';

    const fd = new FormData();
    fd.append('file', blob, 'piano-take.webm');
    fd.append('packId', engine.manifest?.id || 'upright-basic');
    fd.append('label', 'Practice take ' + new Date().toLocaleTimeString());

    try {
      const res = await fetch(`${apiBase()}/piano/takes`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      const take = await res.json();
      currentTakeId = take.id;
      el('take-status').textContent = `Take ${take.id.slice(0, 8)}… analyzing`;
      el('btn-export').disabled = false;
      pollAnalysis(take.id);
    } catch (e) {
      el('take-status').textContent = 'Upload failed: ' + e.message;
    }
  });

  async function pollAnalysis(id) {
    for (let i = 0; i < 60; i++) {
      const data = await fetch(`${apiBase()}/piano/takes/${id}/analysis`).then(
        (r) => r.json(),
      );
      el('take-status').textContent = `Status: ${data.status}`;
      if (data.status === 'ready') {
        renderAnalysis(data);
        return;
      }
      if (data.status === 'error') {
        el('lufs-box').textContent = JSON.stringify(data.analysis, null, 2);
        return;
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  function renderAnalysis(data) {
    const loud = data.analysis?.loudness?.measured;
    if (loud) {
      el('lufs-box').textContent = JSON.stringify(
        {
          input_i: loud.inputI,
          input_lra: loud.inputLra,
          input_tp: loud.inputTp,
          input_thresh: loud.inputThresh,
          target: data.analysis.loudness.targetLufs,
          note: data.analysis.loudness.note,
        },
        null,
        2,
      );
    }
    const segs = data.analysis?.silence?.segments || [];
    el('silence-box').textContent = segs.length
      ? segs
          .map(
            (s) =>
              `${s.start.toFixed(2)}s – ${s.end.toFixed(2)}s (${s.duration.toFixed(2)}s)`,
          )
          .join('\n')
      : 'No silence segments (or continuous playing)';

    const wave = data.waveform;
    if (wave?.peaks?.mono) drawTakeWave(wave);
  }

  function drawTakeWave(wave) {
    const c = el('take-wave');
    const ctx = c.getContext('2d');
    const peaks = wave.peaks.mono;
    const rms = wave.rms?.mono || [];
    const w = c.width;
    const h = c.height;
    const mid = h / 2;
    ctx.fillStyle = '#0a1018';
    ctx.fillRect(0, 0, w, h);
    // silence overlays
    // RMS fill
    ctx.beginPath();
    for (let i = 0; i < peaks.length; i++) {
      const x = (i / (peaks.length - 1 || 1)) * w;
      const r = (rms[i] || 0) * mid * 0.9;
      if (i === 0) ctx.moveTo(x, mid - r);
      else ctx.lineTo(x, mid - r);
    }
    for (let i = peaks.length - 1; i >= 0; i--) {
      const x = (i / (peaks.length - 1 || 1)) * w;
      const r = (rms[i] || 0) * mid * 0.9;
      ctx.lineTo(x, mid + r);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(91,157,255,0.35)';
    ctx.fill();
    // peaks
    ctx.strokeStyle = '#e7eef8';
    ctx.beginPath();
    for (let i = 0; i < peaks.length; i++) {
      const x = (i / (peaks.length - 1 || 1)) * w;
      const p = Math.abs(peaks[i][1]) * mid * 0.95;
      if (i === 0) ctx.moveTo(x, mid - p);
      else ctx.lineTo(x, mid - p);
    }
    ctx.stroke();
  }

  el('btn-export').addEventListener('click', async () => {
    if (!currentTakeId) return;
    el('take-status').textContent = 'Enqueueing export…';
    const res = await fetch(`${apiBase()}/piano/takes/${currentTakeId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trimSilence: true,
        normalize: true,
        targetLufs: -14,
        format: 'mp3',
      }),
    });
    const data = await res.json();
    el('take-status').textContent =
      'Export jobs: normalize=' +
      (data.normalizeJobId || '—') +
      ' — poll /jobs/:id';
  });

  el('btn-load-pack').addEventListener('click', loadPack);
  el('btn-sustain').addEventListener('click', () => {
    const on = el('btn-sustain').getAttribute('aria-pressed') !== 'true';
    el('btn-sustain').setAttribute('aria-pressed', on ? 'true' : 'false');
    engine.setSustain(on);
  });
  el('octave').addEventListener('change', () => {
    octaveShift = parseInt(el('octave').value, 10) || 0;
  });
  el('velocity').addEventListener('input', () => {
    velocity = parseInt(el('velocity').value, 10) || 96;
  });

  // init
  el('api-base').value = window.location.origin.includes('file')
    ? 'http://localhost:43000'
    : window.location.origin;
  buildKeyboard();
  meterLoop();
  loadPack().catch(() => {});
})();
