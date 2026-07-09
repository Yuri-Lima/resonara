(function () {
  'use strict';
  const API = '';
  const textEl = document.getElementById('tts-text');
  const voiceEl = document.getElementById('voice-select');
  const engineEl = document.getElementById('engine-select');
  const formatEl = document.getElementById('format-select');
  const wordCount = document.getElementById('word-count');
  const statusEl = document.getElementById('status');
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

  function words(t) {
    const s = (t || '').replace(/<[^>]+>/g, ' ').trim();
    if (!s) return 0;
    return s.split(/\s+/).filter(Boolean).length;
  }

  textEl.addEventListener('input', () => {
    wordCount.textContent = words(textEl.value) + ' words';
  });

  function log(msg) {
    statusEl.textContent =
      typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);
  }

  async function loadVoices() {
    try {
      const r = await fetch(API + '/tts/voices');
      const data = await r.json();
      const groups = { piper: [], platform: [] };
      (data.voices || []).forEach((v) => {
        const eng = v.engine || 'platform';
        (groups[eng] || (groups[eng] = [])).push(v);
      });
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
      const r = await fetch(API + '/tts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: voiceEl.value || undefined,
          engine: engineEl.value || 'auto',
          text: 'Hello from Resonara. This is a short voice preview.',
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
    const body = {
      word: document.getElementById('dict-word').value,
      alias: document.getElementById('dict-alias').value || undefined,
      phoneme: document.getElementById('dict-phoneme').value || undefined,
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
