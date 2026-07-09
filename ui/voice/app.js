(function () {
  'use strict';
  const API = '';
  const textEl = document.getElementById('tts-text');
  const voiceEl = document.getElementById('voice-select');
  const formatEl = document.getElementById('format-select');
  const wordCount = document.getElementById('word-count');
  const statusEl = document.getElementById('status');
  const progressWrap = document.getElementById('progress-wrap');
  const progressBar = document.getElementById('progress-bar');
  const progressLabel = document.getElementById('progress-label');
  const result = document.getElementById('result');
  const player = document.getElementById('player');
  const downloadLink = document.getElementById('download-link');

  function words(t) {
    const s = (t || '').trim();
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
      (data.voices || []).forEach((v) => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.language ? `${v.name} (${v.language})` : v.name;
        voiceEl.appendChild(opt);
      });
      log(data.engine || data);
    } catch (e) {
      log('Could not load voices: ' + e.message);
    }
  }

  document.getElementById('btn-engine').addEventListener('click', async () => {
    const r = await fetch(API + '/health');
    log(await r.json());
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
      progressLabel.textContent = `${job.status} — ${job.chunksDone || 0}/${job.chunkCount || 0} chunks (${job.progress || 0}%)`;
      if (job.status === 'completed') {
        const url = API + '/tts/jobs/' + id + '/download';
        player.src = url;
        downloadLink.href = url;
        result.hidden = false;
        log(job);
        return;
      }
      if (job.status === 'failed') {
        progressLabel.textContent = 'Failed';
        log(job);
        return;
      }
      setTimeout(tick, 500);
    };
    tick();
  }

  loadVoices();
})();
