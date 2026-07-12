(function () {
  'use strict';
  const API = '';
  const textEl = document.getElementById('tts-text');
  const voiceEl = document.getElementById('voice-select');
  const engineEl = document.getElementById('engine-select');
  const languageEl = document.getElementById('language-select');
  const formatEl = document.getElementById('format-select');
  const wordCount = document.getElementById('word-count');
  const statusEl = document.getElementById('status');
  const langDetectEl = document.getElementById('lang-detect');
  const progressWrap = document.getElementById('progress-wrap');
  const progressBar = document.getElementById('progress-bar');
  const progressLabel = document.getElementById('progress-label');
  const result = document.getElementById('result');
  const player = document.getElementById('player');
  const downloadLink = document.getElementById('download-link');
  const chapterList = document.getElementById('chapter-list');
  const chaptersUl = document.getElementById('chapters');
  const jobHistory = document.getElementById('job-history');
  const dictBody = document.getElementById('dict-body');
  let ssmlMode = false;
  let importedChapters = null;
  let detectTimer = null;
  let allVoices = [];

  function words(t) {
    const s = (t || '').replace(/<[^>]+>/g, ' ').trim();
    if (!s) return 0;
    return s.split(/\s+/).filter(Boolean).length;
  }

  textEl.addEventListener('input', () => {
    wordCount.textContent = words(textEl.value) + ' words';
    scheduleLangDetect();
  });

  function scheduleLangDetect() {
    if (!langDetectEl) return;
    clearTimeout(detectTimer);
    detectTimer = setTimeout(runLangDetect, 400);
  }

  async function runLangDetect() {
    if (!langDetectEl) return;
    const text = textEl.value.trim();
    if (!text) {
      langDetectEl.textContent = 'Language: auto — type text to detect';
      return;
    }
    if (languageEl && languageEl.value !== 'auto') {
      langDetectEl.textContent =
        'Language locked: ' + languageEl.value + ' (auto-detect off)';
      return;
    }
    try {
      const r = await fetch(API + '/tts/detect-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 4000) }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const o = data.overall || {};
      const conf = o.confidence != null ? Math.round(o.confidence * 100) : '?';
      const paras = (data.paragraphs || [])
        .filter((p) => p.code && p.code !== 'unknown')
        .slice(0, 4)
        .map((p) => p.code + ' ' + Math.round((p.confidence || 0) * 100) + '%')
        .join(', ');
      langDetectEl.textContent =
        'Detected: ' +
        (o.code || 'unknown') +
        ' (' +
        conf +
        '% conf)' +
        (paras ? ' · paragraphs: ' + paras : '');
    } catch (e) {
      langDetectEl.textContent = 'Language detect unavailable';
    }
  }

  if (languageEl) {
    languageEl.addEventListener('change', () => {
      populateVoiceSelect();
      scheduleLangDetect();
    });
  }

  function log(msg) {
    statusEl.textContent =
      typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);
  }

  function voiceMatchesLangFilter(v, lang) {
    if (!lang || lang === 'auto') return true;
    const hay = `${v.language || ''} ${v.id || ''} ${v.name || ''}`.toLowerCase();
    if (lang === 'pt-BR') return /pt[_-]?br|portuguese|brasil|brazil|luciana|faber|edresson/i.test(hay);
    if (lang === 'en') return /en[_-]|english|lessac|amy|ryan|alan|samantha|daniel|alex/i.test(hay) && !/pt[_-]?br/i.test(hay);
    return true;
  }

  function populateVoiceSelect() {
    const lang = languageEl ? languageEl.value : 'auto';
    const groups = { piper: [], platform: [] };
    allVoices.forEach((v) => {
      if (!voiceMatchesLangFilter(v, lang)) return;
      const eng = v.engine || 'platform';
      (groups[eng] || (groups[eng] = [])).push(v);
    });
    const prev = voiceEl.value;
    voiceEl.innerHTML = '<option value="">Auto (prefer Piper)</option>';
    Object.keys(groups).forEach((eng) => {
      if (!groups[eng].length) return;
      const og = document.createElement('optgroup');
      og.label = eng === 'piper' ? 'Piper Neural' : 'Platform System';
      groups[eng].forEach((v) => {
        const opt = document.createElement('option');
        opt.value = v.id;
        const badge = eng === 'piper' ? 'Neural' : 'System';
        const meta = [v.language, v.quality, v.gender, v.sampleRate && v.sampleRate + 'Hz']
          .filter(Boolean)
          .join(' · ');
        opt.textContent = `${v.name} [${badge}]${meta ? ' — ' + meta : ''}`;
        og.appendChild(opt);
      });
      voiceEl.appendChild(og);
    });
    if (prev && Array.from(voiceEl.options).some((o) => o.value === prev)) {
      voiceEl.value = prev;
    }
  }

  async function loadVoices() {
    try {
      const r = await fetch(API + '/tts/voices');
      const data = await r.json();
      allVoices = data.voices || [];
      populateVoiceSelect();
      log(data.engines || data);
    } catch (e) {
      log('Could not load voices: ' + e.message);
    }
  }

  document.getElementById('mode-plain').addEventListener('click', () => setMode(false));
  document.getElementById('mode-ssml').addEventListener('click', () => setMode(true));

  function setMode(ssml) {
    ssmlMode = ssml;
    document.getElementById('mode-plain').classList.toggle('active', !ssml);
    document.getElementById('mode-ssml').classList.toggle('active', ssml);
    document.getElementById('mode-plain').setAttribute('aria-pressed', String(!ssml));
    document.getElementById('mode-ssml').setAttribute('aria-pressed', String(ssml));
    document.getElementById('ssml-toolbar').hidden = !ssml;
  }

  document.querySelectorAll('#ssml-toolbar [data-ssml]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.getAttribute('data-ssml');
      const map = {
        break: '<break time="500ms"/>',
        emphasis: '<emphasis level="strong">text</emphasis>',
        prosody: '<prosody rate="slow">text</prosody>',
        sub: '<sub alias="World Wide Web">WWW</sub>',
        phoneme: '<phoneme alphabet="ipa" ph="təˈmeɪtoʊ">tomato</phoneme>',
      };
      insertAtCursor(map[kind] || '');
    });
  });

  function insertAtCursor(snippet) {
    const start = textEl.selectionStart;
    const end = textEl.selectionEnd;
    const v = textEl.value;
    textEl.value = v.slice(0, start) + snippet + v.slice(end);
    textEl.focus();
    textEl.dispatchEvent(new Event('input'));
  }

  document.getElementById('btn-engine').addEventListener('click', async () => {
    const r = await fetch(API + '/tts/engines');
    log(await r.json());
  });

  document.getElementById('btn-preview').addEventListener('click', async () => {
    try {
      const lang = languageEl ? languageEl.value : 'auto';
      const previewText =
        lang === 'pt-BR'
          ? 'Olá do Resonara. Esta é uma prévia curta da voz em português do Brasil.'
          : 'Hello from Resonara. This is a short voice preview.';
      const r = await fetch(API + '/tts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: voiceEl.value || undefined,
          engine: engineEl.value || 'auto',
          language: lang === 'auto' ? undefined : lang,
          text: previewText,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const job = await r.json();
      log(job);
      pollJob(job.id);
    } catch (e) {
      log(e.message);
    }
  });

  document.getElementById('btn-speak').addEventListener('click', async () => {
    result.hidden = true;
    progressWrap.hidden = false;
    progressBar.style.width = '0%';
    progressLabel.textContent = 'Starting…';
    const body = {
      text: textEl.value,
      voice: voiceEl.value || undefined,
      format: formatEl.value || 'wav',
      engine: engineEl.value || 'auto',
      language: languageEl ? languageEl.value || 'auto' : 'auto',
      ssml: ssmlMode || /<speak[\s>]/i.test(textEl.value),
      normalize: document.getElementById('opt-normalize').checked,
      highpass: document.getElementById('opt-highpass').checked,
      compress: document.getElementById('opt-compress').checked,
    };
    try {
      const r = await fetch(API + '/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      const job = await r.json();
      log(job);
      pollJob(job.id);
    } catch (e) {
      progressLabel.textContent = 'Failed';
      log(e.message);
    }
  });

  async function pollJob(id) {
    const tick = async () => {
      const r = await fetch(API + '/tts/jobs/' + id);
      const job = await r.json();
      progressBar.style.width = (job.progress || 0) + '%';
      progressLabel.textContent =
        (job.status || '') + ' · ' + (job.progress || 0) + '% · chunks ' +
        (job.chunksDone || 0) + '/' + (job.chunkCount || 0);
      log(job);
      if (job.status === 'completed') {
        progressBar.style.width = '100%';
        result.hidden = false;
        const url = API + '/tts/jobs/' + id + '/download';
        player.src = url;
        downloadLink.href = url;
        await loadChapters(id);
        loadJobs();
        return;
      }
      if (job.status === 'failed') {
        progressLabel.textContent = 'Failed: ' + (job.error || '');
        return;
      }
      setTimeout(tick, 800);
    };
    tick();
  }

  async function loadChapters(id) {
    try {
      const r = await fetch(API + '/tts/jobs/' + id + '/chapters');
      const data = await r.json();
      const ch = data.chapters || [];
      if (!ch.length) {
        chapterList.hidden = true;
        return;
      }
      chapterList.hidden = false;
      chaptersUl.innerHTML = '';
      ch.forEach((c) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ghost chapter-btn';
        btn.textContent =
          (c.title || 'Chapter ' + c.index) +
          ' · ' +
          (c.startTime != null ? c.startTime.toFixed(1) + 's' : '');
        btn.addEventListener('click', () => {
          if (c.startTime != null) {
            player.currentTime = c.startTime;
            player.play();
          }
        });
        li.appendChild(btn);
        chaptersUl.appendChild(li);
      });
    } catch {
      chapterList.hidden = true;
    }
  }

  async function loadJobs() {
    try {
      const r = await fetch(API + '/tts/jobs?limit=20');
      const data = await r.json();
      jobHistory.innerHTML = '';
      (data.items || []).forEach((j) => {
        const li = document.createElement('li');
        li.innerHTML =
          '<span class="job-status">' +
          j.status +
          '</span> ' +
          (j.id || '').slice(0, 8) +
          ' · ' +
          (j.wordCount || '?') +
          ' words';
        if (j.status === 'completed') {
          const a = document.createElement('a');
          a.href = API + '/tts/jobs/' + j.id + '/download';
          a.textContent = ' download';
          li.appendChild(a);
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'ghost';
          del.textContent = 'Delete';
          del.addEventListener('click', async () => {
            await fetch(API + '/tts/jobs/' + j.id, { method: 'DELETE' });
            loadJobs();
          });
          li.appendChild(del);
        }
        jobHistory.appendChild(li);
      });
    } catch (e) {
      jobHistory.innerHTML = '<li>' + e.message + '</li>';
    }
  }

  document.getElementById('btn-refresh-jobs').addEventListener('click', loadJobs);

  // Upload
  const zone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');
  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  async function handleFile(file) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('engine', engineEl.value || 'auto');
    fd.append('format', formatEl.value || 'wav');
    if (voiceEl.value) fd.append('voice', voiceEl.value);
    document.getElementById('upload-meta').textContent = 'Importing ' + file.name + '…';
    try {
      const r = await fetch(API + '/tts/import', { method: 'POST', body: fd });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      document.getElementById('upload-meta').textContent =
        (data.document?.title || file.name) +
        ' · ' +
        (data.document?.chapters || 0) +
        ' chapters · ' +
        (data.document?.totalWords || 0) +
        ' words';
      if (data.job?.id) {
        progressWrap.hidden = false;
        pollJob(data.job.id);
      }
      log(data);
    } catch (e) {
      document.getElementById('upload-meta').textContent = e.message;
      log(e.message);
    }
  }

  // Dictionary
  async function loadDict() {
    const r = await fetch(API + '/tts/dictionary');
    const rows = await r.json();
    dictBody.innerHTML = '';
    (rows || []).forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' +
        row.word +
        '</td><td>' +
        (row.alias || row.phoneme || '') +
        '</td><td></td>';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost';
      btn.textContent = '×';
      btn.setAttribute('aria-label', 'Delete ' + row.word);
      btn.addEventListener('click', async () => {
        await fetch(API + '/tts/dictionary/' + row.id, { method: 'DELETE' });
        loadDict();
      });
      tr.lastChild.appendChild(btn);
      dictBody.appendChild(tr);
    });
  }

  document.getElementById('dict-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const lang = languageEl && languageEl.value !== 'auto' ? languageEl.value : 'en';
    const body = {
      word: document.getElementById('dict-word').value,
      alias: document.getElementById('dict-alias').value || undefined,
      phoneme: document.getElementById('dict-phoneme').value || undefined,
      language: lang,
    };
    await fetch(API + '/tts/dictionary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    e.target.reset();
    loadDict();
  });

  document.getElementById('btn-dict-export').addEventListener('click', async () => {
    const r = await fetch(API + '/tts/dictionary/export');
    const data = await r.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'resonara-pronunciation.json';
    a.click();
  });

  document.getElementById('btn-dict-import').addEventListener('click', () => {
    document.getElementById('dict-import-file').click();
  });
  document.getElementById('dict-import-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const text = await f.text();
    const entries = JSON.parse(text);
    await fetch(API + '/tts/dictionary/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: Array.isArray(entries) ? entries : entries.entries }),
    });
    loadDict();
  });

  loadVoices();
  loadJobs();
  loadDict();
})();


  /* —— Library + Read-along (G27) —— */
  const libraryGrid = document.getElementById('library-grid');
  const continueRail = document.getElementById('continue-rail');
  const readalongPanel = document.getElementById('readalong-panel');
  const readalongText = document.getElementById('readalong-text');
  const raAudio = document.getElementById('ra-audio');
  const syncBadge = document.getElementById('sync-badge');
  let raWords = [];
  let raSentences = [];
  let raJobId = null;
  let sleepTimer = null;
  let lastResumeSend = 0;

  async function loadLibrary() {
    if (!libraryGrid) return;
    const q = document.getElementById('library-search')?.value || '';
    const engine = document.getElementById('library-engine')?.value || '';
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (engine) params.set('engine', engine);
    const res = await fetch(API + '/tts/library?' + params.toString());
    if (!res.ok) return;
    const data = await res.json();
    if (continueRail) {
      continueRail.innerHTML = (data.continueListening || [])
        .map(
          (c) =>
            `<button type="button" class="library-card" data-id="${c.id}">${escapeHtml(c.title)} · ${Math.round(c.progressPct)}%</button>`,
        )
        .join('');
    }
    if (!data.items?.length) {
      libraryGrid.innerHTML =
        '<p>No books yet — synthesize something to fill the shelf.</p>';
      return;
    }
    libraryGrid.innerHTML = data.items
      .map((c) => {
        return `<article class="library-card" role="listitem" tabindex="0" data-id="${c.id}">
          <strong>${escapeHtml(c.title)}</strong>
          <div class="meta">${escapeHtml(c.engine)} · ${escapeHtml(c.language || '')}${c.audioMissing ? ' · audio missing' : ''}</div>
          <div class="progress" aria-hidden="true"><i style="width:${c.progressPct || 0}%"></i></div>
        </article>`;
      })
      .join('');
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  libraryGrid?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-id]');
    if (card) openReadAlong(card.getAttribute('data-id'));
  });
  continueRail?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-id]');
    if (card) openReadAlong(card.getAttribute('data-id'));
  });
  document.getElementById('library-search')?.addEventListener('input', () => loadLibrary());
  document.getElementById('library-engine')?.addEventListener('change', () => loadLibrary());

  async function openReadAlong(jobId) {
    raJobId = jobId;
    if (readalongPanel) readalongPanel.hidden = false;
    const jobRes = await fetch(API + '/tts/jobs/' + jobId);
    const job = await jobRes.json();
    raAudio.src = API + '/tts/jobs/' + jobId + '/download';
    const ts = await fetch(API + '/tts/jobs/' + jobId + '/timestamps').then((r) => r.json());
    const method = ts.method || job.metadata?.alignmentMethod || 'proportional';
    if (syncBadge) {
      syncBadge.textContent =
        method === 'forced' ? 'aligned sync' : 'approximate sync';
    }
    raWords = (ts.words || ts.wordTimestamps || job.metadata?.wordTimestamps || []).map((w) => ({
      word: w.word,
      startMs: w.startMs,
      endMs: w.endMs,
    }));
    if (!raWords.length && job.text) {
      // proportional fallback client-side
      const words = job.text.trim().split(/\s+/);
      const dur = (job.metadata?.duration || 60) * 1000;
      const step = dur / Math.max(1, words.length);
      raWords = words.map((word, i) => ({
        word,
        startMs: Math.round(i * step),
        endMs: Math.round((i + 1) * step),
      }));
    }
    renderReadAlong();
    const resume = job.metadata?.resumePositionMs || 0;
    if (resume > 0) {
      raAudio.currentTime = resume / 1000;
    }
    loadBookmarks(jobId);
    raAudio.play().catch(() => undefined);
  }

  function renderReadAlong() {
    if (!readalongText) return;
    readalongText.innerHTML = raWords
      .map(
        (w, i) =>
          `<span class="w" data-i="${i}" data-start="${w.startMs}">${escapeHtml(w.word)} </span>`,
      )
      .join('');
    readalongText.querySelectorAll('.w').forEach((el) => {
      el.addEventListener('click', () => {
        const ms = Number(el.getAttribute('data-start') || 0);
        raAudio.currentTime = ms / 1000;
        raAudio.play();
      });
    });
  }

  function wordIndexAt(timeMs) {
    let lo = 0,
      hi = raWords.length - 1,
      ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (raWords[mid].startMs <= timeMs) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  function tickReadAlong() {
    if (!raWords.length || !readalongText) return;
    const t = raAudio.currentTime * 1000;
    const idx = wordIndexAt(t);
    const nodes = readalongText.querySelectorAll('.w');
    nodes.forEach((n, i) => {
      n.classList.toggle('active', i === idx);
      n.classList.toggle('sweep', i === idx);
    });
    const active = nodes[idx];
    if (active) {
      const rect = active.getBoundingClientRect();
      const parent = readalongText.getBoundingClientRect();
      if (rect.top < parent.top + parent.height / 3 || rect.bottom > parent.bottom) {
        active.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    // resume throttle
    const now = Date.now();
    if (raJobId && now - lastResumeSend > 5000 && !raAudio.paused) {
      lastResumeSend = now;
      fetch(API + '/tts/jobs/' + raJobId + '/resume', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionMs: Math.round(t) }),
      }).catch(() => undefined);
    }
    if (!raAudio.paused) requestAnimationFrame(tickReadAlong);
  }

  raAudio?.addEventListener('play', () => requestAnimationFrame(tickReadAlong));
  document.getElementById('ra-play')?.addEventListener('click', () => {
    if (raAudio.paused) raAudio.play();
    else raAudio.pause();
  });
  document.getElementById('ra-speed')?.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    raAudio.playbackRate = v;
    raAudio.preservesPitch = true;
    const lab = document.getElementById('ra-speed-val');
    if (lab) lab.textContent = v.toFixed(1) + '×';
  });
  document.getElementById('ra-sleep')?.addEventListener('change', (e) => {
    if (sleepTimer) clearTimeout(sleepTimer);
    const v = e.target.value;
    localStorage.setItem('resonara-sleep', v);
    if (v === '0' || v === 'chapter') return;
    const ms = parseInt(v, 10) * 60 * 1000;
    sleepTimer = setTimeout(() => {
      raAudio.pause();
    }, ms);
  });
  const savedSleep = localStorage.getItem('resonara-sleep');
  if (savedSleep && document.getElementById('ra-sleep')) {
    document.getElementById('ra-sleep').value = savedSleep;
  }

  async function loadBookmarks(jobId) {
    const ul = document.getElementById('bookmark-list');
    if (!ul) return;
    const res = await fetch(API + '/tts/jobs/' + jobId + '/bookmarks');
    if (!res.ok) return;
    const list = await res.json();
    ul.innerHTML = (list || [])
      .map(
        (b) =>
          `<li><button type="button" data-ms="${b.positionMs}">${(b.positionMs / 1000).toFixed(1)}s</button> ${escapeHtml(b.note || '')} <button type="button" data-del="${b.id}">×</button></li>`,
      )
      .join('');
    ul.onclick = async (ev) => {
      const t = ev.target;
      if (t.dataset.ms) {
        raAudio.currentTime = Number(t.dataset.ms) / 1000;
        raAudio.play();
      }
      if (t.dataset.del) {
        await fetch(API + '/tts/bookmarks/' + t.dataset.del, { method: 'DELETE' });
        loadBookmarks(jobId);
      }
    };
  }

  document.getElementById('ra-bookmark')?.addEventListener('click', async () => {
    if (!raJobId) return;
    await fetch(API + '/tts/jobs/' + raJobId + '/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positionMs: Math.round(raAudio.currentTime * 1000),
        note: '',
      }),
    });
    loadBookmarks(raJobId);
  });

  // Keyboard: space play/pause when focus in readalong
  readalongText?.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (raAudio.paused) raAudio.play();
      else raAudio.pause();
    } else if (e.code === 'ArrowLeft') raAudio.currentTime = Math.max(0, raAudio.currentTime - 5);
    else if (e.code === 'ArrowRight') raAudio.currentTime += 5;
  });

  loadLibrary();

/* ——— Resonara v2 IA layer ——— */
(function v2Ia() {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const api = (path, opts) =>
    fetch(path, opts).then(async (r) => {
      const ct = r.headers.get('content-type') || '';
      const body = ct.includes('json') ? await r.json() : await r.text();
      if (!r.ok) {
        const msg =
          (body && body.message) ||
          (typeof body === 'string' ? body : 'Request failed');
        throw new Error(Array.isArray(msg) ? msg.join(', ') : msg);
      }
      return body;
    });

  function toast(msg) {
    const host = $('#toast-host');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  }

  function showView(name) {
    $$('.voice-view').forEach((v) => {
      v.hidden = v.id !== `view-${name}`;
    });
    $$('.ia-tab[data-view]').forEach((t) => {
      const on = t.dataset.view === name;
      t.classList.toggle('active', on);
      if (on) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    localStorage.setItem('resonara.view', name);
  }

  $$('.ia-tab[data-view]').forEach((t) =>
    t.addEventListener('click', () => showView(t.dataset.view)),
  );

  const help = $('#help-dialog');
  $('#btn-help')?.addEventListener('click', () => help?.showModal());
  $('#help-close')?.addEventListener('click', () => help?.close());

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      help?.showModal();
    } else if (e.key === 'l') showView('library');
    else if (e.key === 'n') {
      showView('wizard');
      $('#tts-text')?.focus();
    } else if (e.key === 's') showView('settings');
    else if (e.key === '/') {
      e.preventDefault();
      $('#tts-text')?.focus();
    } else if (e.key === 'Escape') help?.close();
  });

  async function loadLibrary() {
    const rail = $('#library-rail');
    const cont = $('#continue-rail');
    if (!rail) return;
    rail.setAttribute('aria-busy', 'true');
    rail.innerHTML = '<p class="loading-state">Loading library…</p>';
    try {
      const data = await api('/tts/library?page=1&limit=24');
      const items = data.items || data.jobs || data || [];
      if (!items.length) {
        rail.innerHTML =
          '<p class="empty-state">No audiobooks yet. Open <strong>Synthesize</strong> and create your first paragraph.</p>';
        if (cont) cont.innerHTML = '';
        return;
      }
      rail.innerHTML = '';
      if (cont) {
        cont.innerHTML = items
          .slice(0, 5)
          .map(
            (j) =>
              `<a class="library-card" href="#job-${j.id}" data-id="${j.id}">▶ ${escapeHtml(j.metadata?.title || j.title || j.id.slice(0, 8))}</a>`,
          )
          .join('');
      }
      for (const j of items) {
        const card = document.createElement('article');
        card.className = 'library-card';
        card.innerHTML = `
          <img class="cover" alt="" src="/tts/jobs/${j.id}/cover" loading="lazy" width="160" height="160" />
          <h3>${escapeHtml(j.metadata?.title || j.title || 'Untitled')}</h3>
          <p class="meta">${escapeHtml(j.engine || '')} · ${escapeHtml(j.status || '')}</p>
          <button type="button" data-retry="${j.id}" class="ghost" ${j.status === 'failed' ? '' : 'hidden'}>Retry</button>
        `;
        rail.appendChild(card);
      }
      rail.querySelectorAll('[data-retry]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          try {
            await api(`/tts/jobs/${btn.dataset.retry}/retry`, { method: 'POST' });
            toast('Retry started');
            loadLibrary();
          } catch (err) {
            toast(err.message || 'Retry failed');
          }
        }),
      );
    } catch (err) {
      rail.innerHTML = `<p class="error-state">Could not load library: ${escapeHtml(err.message)}. Is the API running?</p>`;
    } finally {
      rail.setAttribute('aria-busy', 'false');
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Settings persistence
  const SETTINGS_KEY = 'resonara.settings.v2';
  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    } catch {
      return {};
    }
  }
  function applySettings() {
    const s = loadSettings();
    if (s.engine && $('#set-engine')) $('#set-engine').value = s.engine;
    if (s.language && $('#set-lang')) $('#set-lang').value = s.language;
    if (s.pause && $('#set-pause')) $('#set-pause').value = s.pause;
    if (s.engine && $('#engine-select')) $('#engine-select').value = s.engine;
    if (s.language && $('#language-select')) $('#language-select').value = s.language;
  }
  $('#settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const s = {
      engine: $('#set-engine')?.value || 'auto',
      language: $('#set-lang')?.value || 'auto',
      pause: $('#set-pause')?.value || 'audiobook',
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    applySettings();
    $('#settings-status').textContent = 'Saved locally.';
    toast('Settings saved');
  });
  $('#btn-diagnostics')?.addEventListener('click', async () => {
    try {
      const r = await api('/diagnostics/bundle', { method: 'POST' });
      $('#settings-status').textContent = r.path
        ? `Diagnostics written to ${r.path}`
        : JSON.stringify(r);
      toast('Diagnostics bundle ready (local only)');
    } catch (err) {
      $('#settings-status').textContent = err.message;
      toast(err.message);
    }
  });

  // Onboarding
  async function maybeOnboard() {
    if (localStorage.getItem('resonara.onboarded.v2')) return;
    const panel = $('#onboarding');
    if (!panel) return;
    panel.hidden = false;
    const status = $('#ob-status');
    try {
      const eng = await api('/tts/engines');
      const lines = (eng.engines || []).map(
        (e) => `${e.id}: ${e.available ? 'ready' : 'missing'} (${e.voiceCount || 0} voices)`,
      );
      status.textContent = lines.join(' · ');
    } catch {
      status.textContent = 'API offline — start Resonara to check engines.';
    }
    $('#ob-dismiss')?.addEventListener('click', () => {
      localStorage.setItem('resonara.onboarded.v2', '1');
      panel.hidden = true;
      showView('wizard');
      toast('Tip: paste a paragraph and press Speak');
    });
  }

  // Job completion toast via polling when user is on library
  let lastSeen = new Set();
  setInterval(async () => {
    try {
      const data = await api('/tts/jobs?limit=10');
      const items = data.items || data || [];
      for (const j of items) {
        if (j.status === 'completed' && !lastSeen.has(j.id + ':done')) {
          if (lastSeen.size) toast(`Finished: ${j.metadata?.title || j.id.slice(0, 8)}`);
          lastSeen.add(j.id + ':done');
        }
      }
    } catch {
      /* */
    }
  }, 8000);

  applySettings();
  const initial = localStorage.getItem('resonara.view') || 'library';
  showView(initial);
  loadLibrary();
  maybeOnboard();
  // Expose toast for other handlers
  window.resonaraToast = toast;
})();
