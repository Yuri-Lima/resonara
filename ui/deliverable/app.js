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
  drawWave(document.getElementById('wave-en'), 'after');
  drawWave(document.getElementById('wave-pt'), 'after');

  function fillVoiceGrid(gridId, voiceList, stroke) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    voiceList.forEach((v, i) => {
      const el = document.createElement('article');
      el.className = 'voice-card';
      const status = v.bundled
        ? '<span class="badge good">Bundled</span>'
        : v.platform
          ? '<span class="badge">Platform</span>'
          : '<span class="badge">Downloadable</span>';
      el.innerHTML =
        status +
        '<h3>' +
        v.name +
        '</h3><p class="caption">' +
        [v.lang, v.quality, v.gender, v.sr + ' Hz'].filter(Boolean).join(' · ') +
        (v.note ? ' · ' + v.note : '') +
        '</p><canvas class="mini-wave" width="240" height="40" aria-hidden="true"></canvas>';
      grid.appendChild(el);
      const c = el.querySelector('canvas');
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.strokeStyle = stroke || '#4f8cff';
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

  const voices = [
    { name: 'en_US lessac medium', lang: 'en-US', quality: 'medium', gender: 'female', sr: 22050, bundled: true },
    { name: 'en_US amy low', lang: 'en-US', quality: 'low', gender: 'female', sr: 16000 },
    { name: 'en_US ryan high', lang: 'en-US', quality: 'high', gender: 'male', sr: 22050 },
    { name: 'en_GB alan medium', lang: 'en-GB', quality: 'medium', gender: 'male', sr: 22050 },
    { name: 'en_US libritts medium', lang: 'en-US', quality: 'medium', gender: 'mixed', sr: 22050 },
    { name: 'en_US kathleen low', lang: 'en-US', quality: 'low', gender: 'female', sr: 16000 },
  ];
  fillVoiceGrid('voice-grid', voices, '#4f8cff');

  const ptVoices = [
    { name: 'pt_BR faber medium', lang: 'pt-BR', quality: 'medium', gender: 'male', sr: 22050, bundled: true, note: 'primary' },
    { name: 'pt_BR edresson low', lang: 'pt-BR', quality: 'low', gender: 'male', sr: 16000, note: 'optional' },
    { name: 'Luciana (macOS say)', lang: 'pt-BR', quality: 'system', gender: 'female', sr: 22050, platform: true, note: 'fallback' },
    { name: 'Felipe (macOS say)', lang: 'pt-BR', quality: 'system', gender: 'male', sr: 22050, platform: true, note: 'optional install' },
    { name: 'Microsoft Maria (SAPI)', lang: 'pt-BR', quality: 'system', gender: 'female', sr: 22050, platform: true, note: 'Win language pack' },
  ];
  fillVoiceGrid('pt-voice-grid', ptVoices, '#3dd68c');

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

  // --- Demo script Play (all npm run demo:* from the UI) ---
  const DEMO_CATALOG = [
    {
      id: 'quick-sentence',
      cmd: 'demo:quick',
      sample: '16 words',
      listen: 'Natural single sentence',
      file: 'quick-sentence.txt',
    },
    {
      id: 'paragraph',
      cmd: 'demo:paragraph',
      sample: '~75 words',
      listen: 'Prosody, punctuation pauses',
      file: 'paragraph.txt',
    },
    {
      id: 'short-article',
      cmd: 'demo:article',
      sample: '~500 words',
      listen: 'Paragraph transitions',
      file: 'short-article.txt',
    },
    {
      id: 'news-article',
      cmd: 'demo:news',
      sample: '~2k words',
      listen: 'Numbers, URLs, quotes',
      file: 'news-article.txt',
    },
    {
      id: 'book-chapter',
      cmd: 'demo:chapter',
      sample: '~5k words',
      listen: 'Zero audible seams',
      file: 'book-chapter.txt',
    },
    {
      id: 'technical-doc',
      cmd: 'demo:technical',
      sample: '~3k words',
      listen: 'Acronyms, API terms, long sections',
      file: 'technical-doc.txt',
    },
    {
      id: 'ssml-showcase',
      cmd: 'demo:ssml',
      sample: 'SSML showcase',
      listen: 'Breaks, emphasis, rate',
      file: 'ssml-showcase.txt',
      ssml: true,
    },
    {
      id: 'dialogue-script',
      cmd: 'demo:dialogue',
      sample: '3 speakers',
      listen: 'Clean voice switches',
      file: 'dialogue-script.txt',
      dialogue: true,
    },
    {
      id: 'pronunciation-challenge',
      cmd: 'demo:pronunciation',
      sample: 'Tech terms',
      listen: 'Dictionary substitutions',
      file: 'pronunciation-challenge.txt',
    },
    {
      id: 'numbers-and-dates',
      cmd: 'demo:numbers',
      sample: 'Dates & figures',
      listen: 'Numeric expansion, currency',
      file: 'numbers-and-dates.txt',
    },
    {
      id: 'compare',
      cmd: 'demo:compare',
      sample: 'A/B engines',
      listen: 'Platform vs Piper quality',
      file: 'paragraph.txt',
      type: 'compare',
    },
    {
      id: 'all',
      cmd: 'demo:all',
      sample: 'All 10',
      listen: 'Full report — plays each sample in order',
      type: 'all',
    },
    // Portuguese (pt-BR)
    {
      id: 'frase-rapida',
      cmd: 'demo:pt:rapida',
      sample: 'pt-BR · frase',
      listen: 'Natural Brazilian Portuguese sentence',
      file: 'pt-br/frase-rapida.txt',
      lang: 'pt-BR',
    },
    {
      id: 'paragrafo',
      cmd: 'demo:pt:paragrafo',
      sample: 'pt-BR · parágrafo',
      listen: 'Prosody, accents, nasal vowels',
      file: 'pt-br/paragrafo.txt',
      lang: 'pt-BR',
    },
    {
      id: 'artigo-curto',
      cmd: 'demo:pt:artigo',
      sample: 'pt-BR · artigo',
      listen: 'Paragraph transitions in Portuguese',
      file: 'pt-br/artigo-curto.txt',
      lang: 'pt-BR',
    },
    {
      id: 'noticia',
      cmd: 'demo:pt:noticia',
      sample: 'pt-BR · notícia',
      listen: 'News cadence, quotes, numbers',
      file: 'pt-br/noticia.txt',
      lang: 'pt-BR',
    },
    {
      id: 'capitulo-livro',
      cmd: 'demo:pt:capitulo',
      sample: 'pt-BR · capítulo',
      listen: 'Long-form seam-free Portuguese',
      file: 'pt-br/capitulo-livro.txt',
      lang: 'pt-BR',
    },
    {
      id: 'documento-tecnico',
      cmd: 'demo:pt:tecnico',
      sample: 'pt-BR · técnico',
      listen: 'Loanwords + tech terms',
      file: 'pt-br/documento-tecnico.txt',
      lang: 'pt-BR',
    },
    {
      id: 'dialogo-roteiro',
      cmd: 'demo:pt:dialogo',
      sample: 'pt-BR · diálogo',
      listen: 'Em-dash dialogue (—)',
      file: 'pt-br/dialogo-roteiro.txt',
      lang: 'pt-BR',
      dialogue: true,
    },
    {
      id: 'desafio-pronuncia',
      cmd: 'demo:pt:pronuncia',
      sample: 'pt-BR · pronúncia',
      listen: 'Dictionary + hard place names',
      file: 'pt-br/desafio-pronuncia.txt',
      lang: 'pt-BR',
    },
    {
      id: 'numeros-e-datas',
      cmd: 'demo:pt:numeros',
      sample: 'pt-BR · números',
      listen: 'R$, DD/MM/YYYY, CPF',
      file: 'pt-br/numeros-e-datas.txt',
      lang: 'pt-BR',
    },
    {
      id: 'misturado-en-pt',
      cmd: 'demo:pt:misturado',
      sample: 'en + pt-BR',
      listen: 'Mixed-language voice switch',
      file: 'pt-br/misturado-en-pt.txt',
      lang: 'pt-BR',
    },
    {
      id: 'ssml-demonstracao',
      cmd: 'demo:pt:ssml',
      sample: 'pt-BR · SSML',
      listen: 'Breaks + accented phonemes',
      file: 'pt-br/ssml-demonstracao.txt',
      lang: 'pt-BR',
      ssml: true,
    },
    {
      id: 'pt-all',
      cmd: 'demo:pt:all',
      sample: 'All pt-BR',
      listen: 'Full Portuguese suite',
      type: 'all',
      lang: 'pt-BR',
    },
  ];

  const SAMPLE_DEMOS = DEMO_CATALOG.filter(
    (d) => d.type !== 'compare' && d.type !== 'all',
  );

  // Tiny silent WAV to unlock autoplay inside the user-gesture handler
  const SILENT_WAV =
    'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

  function isResonaraHealth(body) {
    if (!body || typeof body !== 'object') return false;
    if (body.product === 'Resonara') return true;
    if (body.checks && (body.checks.tts || body.checks.ffmpeg)) return true;
    return false;
  }

  /** Resolve API base; only accept real Resonara /health (not other apps on :3000). */
  async function resolveApiBase() {
    const candidates = [];
    if (typeof location !== 'undefined' && location.protocol !== 'file:') {
      candidates.push('');
      if (location.origin) candidates.push(location.origin);
    }
    candidates.push(
      'http://127.0.0.1:3847',
      'http://localhost:3847',
      'http://127.0.0.1:3855',
      'http://127.0.0.1:3000',
      'http://localhost:3000',
    );
    const seen = new Set();
    for (const base of candidates) {
      const key = base || '__same__';
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const r = await fetch(base + '/health', {
          signal: ctrl.signal,
          cache: 'no-store',
        });
        clearTimeout(t);
        if (!r.ok) continue;
        const body = await r.json().catch(() => null);
        if (isResonaraHealth(body)) return base;
      } catch {
        /* try next */
      }
    }
    return null;
  }

  const audioEl = document.getElementById('demo-audio');
  const demoStatus = document.getElementById('demo-play-status');
  const progressWrap = document.getElementById('demo-progress-wrap');
  const progressBar = document.getElementById('demo-progress-bar');
  const progressLabel = document.getElementById('demo-progress-label');
  const demoTbody = document.getElementById('demo-table-body');
  const playButtons = new Map();
  let cachedApiBase = undefined; // undefined=unknown, null=offline, string=base
  let activeDemoId = null;
  let abortPlay = false;
  let audioCtx = null;

  function setDemoStatus(msg) {
    if (demoStatus) demoStatus.textContent = msg;
  }

  function setProgress(pct, label) {
    if (progressWrap) progressWrap.hidden = pct == null;
    if (progressBar) {
      progressBar.style.width = Math.max(0, Math.min(100, pct || 0)) + '%';
    }
    if (progressLabel) {
      progressLabel.textContent =
        label || (pct != null ? Math.round(pct) + '%' : '');
    }
  }

  async function getApiBase(force) {
    if (!force && cachedApiBase !== undefined) return cachedApiBase;
    cachedApiBase = await resolveApiBase();
    return cachedApiBase;
  }

  /** Must run synchronously from the click handler before any await. */
  function unlockAudioFromGesture() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        if (!audioCtx) audioCtx = new AC();
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(function () {});
        }
        const buf = audioCtx.createBuffer(1, 1, 22050);
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(audioCtx.destination);
        src.start(0);
      }
    } catch {
      /* ignore */
    }
    if (!audioEl) return;
    try {
      audioEl.muted = true;
      audioEl.src = SILENT_WAV;
      const p = audioEl.play();
      if (p && typeof p.then === 'function') {
        p.then(function () {
          audioEl.pause();
          audioEl.muted = false;
          audioEl.removeAttribute('src');
          audioEl.load();
        }).catch(function () {
          audioEl.muted = false;
        });
      } else {
        audioEl.muted = false;
      }
    } catch {
      if (audioEl) audioEl.muted = false;
    }
  }

  function resetPlayButtons() {
    playButtons.forEach(function (btn, id) {
      btn.disabled = false;
      btn.classList.remove('is-playing', 'is-error');
      btn.textContent = '▶ Play';
      btn.setAttribute('aria-label', 'Play ' + id);
    });
    activeDemoId = null;
  }

  function stopDemoAudio() {
    abortPlay = true;
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.removeAttribute('src');
        audioEl.load();
      } catch {
        /* ignore */
      }
    }
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    resetPlayButtons();
    setProgress(null);
  }

  function markPlaying(id) {
    playButtons.forEach(function (btn, bid) {
      var on = bid === id;
      btn.classList.toggle('is-playing', on);
      btn.classList.remove('is-error');
      btn.disabled = !on;
      if (on) {
        btn.disabled = false;
        btn.textContent = '❚❚ Stop';
        btn.setAttribute('aria-label', 'Stop ' + id);
      } else {
        btn.textContent = '▶ Play';
      }
    });
    activeDemoId = id;
  }

  function markError(id, msg) {
    var btn = playButtons.get(id);
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('is-playing');
      btn.classList.add('is-error');
      btn.textContent = '▶ Retry';
    }
    playButtons.forEach(function (b, bid) {
      if (bid !== id) b.disabled = false;
    });
    activeDemoId = null;
    setProgress(null);
    setDemoStatus(msg);
  }

  function playUrl(url) {
    return new Promise(function (resolve, reject) {
      if (!audioEl) {
        reject(new Error('Audio element missing'));
        return;
      }
      var settled = false;
      function cleanup() {
        audioEl.removeEventListener('ended', onEnd);
        audioEl.removeEventListener('error', onErr);
        audioEl.removeEventListener('playing', onPlaying);
      }
      function finishOk() {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      }
      function finishErr(msg) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(msg || 'Audio playback failed'));
      }
      function onEnd() {
        finishOk();
      }
      function onErr() {
        finishErr('Could not load audio from ' + url);
      }
      function onPlaying() {
        setDemoStatus('Playing… (use the scrubber above to pause/seek)');
      }

      audioEl.addEventListener('ended', onEnd);
      audioEl.addEventListener('error', onErr);
      audioEl.addEventListener('playing', onPlaying);
      audioEl.muted = false;
      audioEl.controls = true;
      audioEl.src = url;
      audioEl.load();

      var p = audioEl.play();
      if (p && typeof p.then === 'function') {
        p.then(function () {
          /* playing */
        }).catch(function (err) {
          // Autoplay blocked after async work — src is set; user can press native ▶
          var name = err && err.name ? err.name : '';
          if (name === 'NotAllowedError' || name === 'NotSupportedError') {
            setDemoStatus(
              'Audio loaded — press the ▶ button on the player above to hear it (browser blocked autoplay)',
            );
            setProgress(100, 'ready');
            // Resolve when user finishes listening (ended) or after they start
            var onUserPlay = function () {
              audioEl.removeEventListener('play', onUserPlay);
              setDemoStatus('Playing…');
            };
            audioEl.addEventListener('play', onUserPlay);
            // Don't reject — keep waiting for ended
          } else {
            finishErr(err && err.message ? err.message : 'play() failed');
          }
        });
      }
    });
  }

  async function urlExists(url) {
    try {
      var head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (head.ok) {
        var len = Number(head.headers.get('content-length') || 0);
        if (!len || len > 1000) return true;
      }
    } catch {
      /* fall through */
    }
    try {
      var r = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: { Range: 'bytes=0-11' },
      });
      if (!(r.ok || r.status === 206)) return false;
      var buf = await r.arrayBuffer();
      if (!buf || buf.byteLength < 12) return false;
      var sig = new Uint8Array(buf);
      return (
        sig[0] === 0x52 &&
        sig[1] === 0x49 &&
        sig[2] === 0x46 &&
        sig[3] === 0x46
      );
    } catch {
      return false;
    }
  }

  async function fetchCachedWav(base, id) {
    var url = base + '/demo-output/' + encodeURIComponent(id) + '.wav';
    if (await urlExists(url)) return url;
    return null;
  }

  async function loadSampleText(base, file) {
    var r = await fetch(base + '/samples/texts/' + encodeURIComponent(file), {
      cache: 'no-store',
    });
    if (!r.ok) {
      throw new Error(
        'Sample text not found: ' +
          file +
          ' — open http://127.0.0.1:3847/ui/deliverable/ (npm run ui)',
      );
    }
    return r.text();
  }

  async function synthesizeAndDownloadUrl(base, opts) {
    var body = {
      text: opts.text,
      engine: opts.engine || 'auto',
      format: 'wav',
      ssml: opts.ssml || undefined,
      dialogue: opts.dialogue || undefined,
      normalize: true,
      highpass: true,
    };
    var created = await fetch(base + '/tts/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!created.ok) {
      var errText = await created.text();
      throw new Error('Synthesize failed: ' + errText.slice(0, 200));
    }
    var job = await created.json();
    var id = job.id;
    var deadline = Date.now() + (opts.timeoutMs || 600000);
    while (Date.now() < deadline) {
      if (abortPlay) throw new Error('Cancelled');
      var poll = await fetch(base + '/tts/jobs/' + id);
      var j = await poll.json();
      var pct = j.progress != null ? j.progress : 0;
      setProgress(pct, (j.status || 'working') + ' · ' + pct + '%');
      if (j.status === 'completed') {
        return base + '/tts/jobs/' + id + '/download';
      }
      if (j.status === 'failed') {
        throw new Error(j.error || 'Job failed');
      }
      await new Promise(function (r) {
        setTimeout(r, 500);
      });
    }
    throw new Error('Synthesis timed out');
  }

  async function resolveDemoAudio(base, demo, engine) {
    if (!engine || engine === 'auto') {
      var cached = await fetchCachedWav(base, demo.id);
      if (cached) {
        setDemoStatus('Playing cached ' + demo.id);
        setProgress(100, 'cached');
        return cached;
      }
    }
    if (engine === 'platform') {
      var cPlat = await fetchCachedWav(base, 'paragraph-platform');
      if (cPlat) return cPlat;
    }
    if (engine === 'piper') {
      var cPip = await fetchCachedWav(base, 'paragraph-piper');
      if (cPip) return cPip;
    }

    setDemoStatus(
      'Synthesizing ' +
        demo.id +
        '… (first run may take a while for long samples)',
    );
    setProgress(2, 'starting');
    var text = await loadSampleText(base, demo.file);
    return synthesizeAndDownloadUrl(base, {
      text: text,
      engine: engine || 'auto',
      ssml: demo.ssml,
      dialogue: demo.dialogue,
    });
  }

  /** Browser speech fallback when API is offline (short demos only). */
  function speakBrowser(text, label) {
    return new Promise(function (resolve, reject) {
      if (!window.speechSynthesis) {
        reject(new Error('No speechSynthesis and API offline'));
        return;
      }
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      var u = new SpeechSynthesisUtterance(
        String(text || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 3500),
      );
      u.rate = 1;
      u.onend = function () {
        resolve();
      };
      u.onerror = function () {
        reject(new Error('Browser speech failed'));
      };
      setDemoStatus(
        (label || 'Browser speech fallback') +
          ' — start API with npm run ui for full neural audio',
      );
      window.speechSynthesis.speak(u);
    });
  }

  // Inline short samples so Play works even before /samples is reachable
  const INLINE_SAMPLES = {
    'quick-sentence':
      'The quick brown fox jumped gracefully over the lazy sleeping dog near the old stone bridge.',
    paragraph:
      'At first light, the mountain lake lay still as polished glass; mist rose in thin ribbons from the water, curling around the dark pines that ringed the shore.',
    'numbers-and-dates':
      'The company raised 4.2 million dollars in Q3 2025. Revenue grew 847 percent. The board meeting is at 2:30 PM on March 15th, 2026.',
    'ssml-showcase':
      'Welcome to Resonara. Version 2 point 0. This is an SSML showcase with emphasis and breaks.',
    'dialogue-script':
      'Narrator: The coffee shop was nearly empty. Alice: Do you think the presentation went well? Bob: Honestly, I think we lost them at slide seven.',
    'pronunciation-challenge':
      'Setting up the stack required PostgreSQL, Kubernetes, and nginx. We debated GIF with a hard G and shipped JSON over OAuth.',
  };

  async function runCompare(base) {
    setDemoStatus('A/B compare — platform first, then Piper');
    var platformUrl = await fetchCachedWav(base, 'paragraph-platform');
    if (!platformUrl) {
      var text = await loadSampleText(base, 'paragraph.txt');
      platformUrl = await synthesizeAndDownloadUrl(base, {
        text: text,
        engine: 'platform',
      });
    }
    if (abortPlay) return;
    setDemoStatus('Playing platform TTS…');
    setProgress(100, 'platform');
    await playUrl(platformUrl);
    if (abortPlay) return;

    var piperUrl = await fetchCachedWav(base, 'paragraph-piper');
    if (!piperUrl) {
      var text2 = await loadSampleText(base, 'paragraph.txt');
      piperUrl = await synthesizeAndDownloadUrl(base, {
        text: text2,
        engine: 'piper',
      });
    }
    if (abortPlay) return;
    setDemoStatus('Playing Piper neural…');
    setProgress(100, 'piper');
    await playUrl(piperUrl);
    setDemoStatus('Compare finished — platform then Piper');
  }

  async function runAll(base) {
    for (var i = 0; i < SAMPLE_DEMOS.length; i++) {
      if (abortPlay) return;
      var demo = SAMPLE_DEMOS[i];
      setDemoStatus(
        'All demos: ' + (i + 1) + '/' + SAMPLE_DEMOS.length + ' — ' + demo.id,
      );
      var url = await resolveDemoAudio(base, demo);
      if (abortPlay) return;
      await playUrl(url);
    }
    setDemoStatus('All demos finished');
  }

  async function playDemo(demo) {
    if (activeDemoId === demo.id) {
      stopDemoAudio();
      setDemoStatus('Stopped');
      return;
    }
    stopDemoAudio();
    abortPlay = false;
    markPlaying(demo.id);
    setDemoStatus('Starting ' + demo.id + '…');

    try {
      var base = await getApiBase(true);
      if (base == null) {
        // Offline fallback for short demos via browser speech
        var inline = INLINE_SAMPLES[demo.id];
        if (inline || demo.file) {
          var fallbackText = inline;
          if (!fallbackText && demo.file) {
            throw new Error(
              'API offline. Run: npm run ui   then open http://127.0.0.1:3847/ui/deliverable/',
            );
          }
          await speakBrowser(fallbackText, demo.id);
          resetPlayButtons();
          setDemoStatus('Finished ' + demo.id + ' (browser speech — start API for neural audio)');
          return;
        }
        throw new Error(
          'API offline. Run: npm run ui   then open http://127.0.0.1:3847/ui/deliverable/',
        );
      }

      if (demo.type === 'compare') {
        await runCompare(base);
      } else if (demo.type === 'all') {
        await runAll(base);
      } else {
        var url = await resolveDemoAudio(base, demo);
        if (abortPlay) return;
        setDemoStatus('Playing ' + demo.id);
        setProgress(100, 'playing');
        await playUrl(url);
        if (!abortPlay) setDemoStatus('Finished ' + demo.id);
      }

      if (!abortPlay) {
        resetPlayButtons();
        setProgress(null);
      }
    } catch (e) {
      if (abortPlay) {
        setDemoStatus('Stopped');
        resetPlayButtons();
        return;
      }
      markError(
        demo.id,
        'Failed: ' + (e && e.message ? e.message : String(e)),
      );
    }
  }

  if (demoTbody) {
    DEMO_CATALOG.forEach(function (demo) {
      var tr = document.createElement('tr');
      var tdPlay = document.createElement('td');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'demo-play-btn';
      btn.textContent = '▶ Play';
      btn.setAttribute('aria-label', 'Play ' + demo.cmd);
      btn.dataset.demo = demo.id;
      // pointerdown unlocks audio while still inside the user gesture
      btn.addEventListener('pointerdown', function () {
        unlockAudioFromGesture();
      });
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        unlockAudioFromGesture();
        playDemo(demo);
      });
      tdPlay.appendChild(btn);
      playButtons.set(demo.id, btn);

      var tdCmd = document.createElement('td');
      var code = document.createElement('code');
      code.textContent = 'npm run ' + demo.cmd;
      tdCmd.appendChild(code);

      var tdSample = document.createElement('td');
      tdSample.textContent = demo.sample;

      var tdListen = document.createElement('td');
      tdListen.textContent = demo.listen;

      tr.appendChild(tdPlay);
      tr.appendChild(tdCmd);
      tr.appendChild(tdSample);
      tr.appendChild(tdListen);
      demoTbody.appendChild(tr);
    });

    getApiBase(true).then(function (base) {
      if (base == null) {
        setDemoStatus(
          'Server offline — run npm run ui and open http://127.0.0.1:3847/ui/deliverable/  (short demos still work via browser speech)',
        );
      } else {
        setDemoStatus(
          'API ready at ' +
            (base || location.origin) +
            ' — press Play on any demo',
        );
      }
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
