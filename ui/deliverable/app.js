/* Resonara v2.0 release dashboard */
(function () {
  const FEATURES = [
    { n: 1, name: 'Kokoro engine', probe: 'WORKING', post: 'WORKING', decision: 'KEEP', evidence: 'reports/probes/01-kokoro.md' },
    { n: 2, name: 'Whisper STT', probe: 'WORKING*', post: 'WORKING', decision: 'KEEP', evidence: 'reports/probes/02-whisper.md' },
    { n: 3, name: 'QA loop', probe: 'WORKING', post: 'WORKING', decision: 'KEEP', evidence: 'reports/probes/03-qa.md' },
    { n: 4, name: 'Forced alignment', probe: 'WORKING', post: 'WORKING', decision: 'KEEP', evidence: 'reports/probes/04-alignment.md' },
    { n: 5, name: 'Library', probe: 'WORKING', post: 'WORKING', decision: 'KEEP', evidence: 'reports/probes/05-library.md' },
    { n: 6, name: 'Podcast feeds', probe: 'WORKING', post: 'WORKING', decision: 'KEEP', evidence: 'reports/probes/06-feeds.md' },
    { n: 7, name: 'Cover art', probe: 'WORKING', post: 'WORKING', decision: 'KEEP', evidence: 'reports/probes/07-cover.md' },
    { n: 8, name: 'EPUB export', probe: 'PARTIAL', post: 'WORKING', decision: 'KEEP', evidence: 'reports/probes/08-epub.md' },
    { n: 9, name: 'Text preprocessor', probe: 'PARTIAL', post: 'WORKING', decision: 'KEEP', evidence: 'reports/probes/09-preprocessor.md' },
    { n: 10, name: 'CLI', probe: 'PARTIAL', post: 'WORKING', decision: 'KEEP', evidence: 'reports/probes/10-cli.md' },
    { n: 11, name: 'Watch folder', probe: 'WORKING', post: 'WORKING', decision: 'KEEP', evidence: 'reports/probes/11-watch.md' },
    { n: 12, name: 'pt-BR pipeline', probe: 'WORKING', post: 'WORKING', decision: 'KEEP', evidence: 'reports/probes/12-ptbr.md' },
  ];

  const SCORES = [
    { label: 'Feature truth', value: '12/12 WORKING', note: '0 descope · FEATURE_TRUTH.md' },
    { label: 'Unit tests', value: '226 pass', note: '45 suites · 1 skipped' },
    { label: 'Cold start', value: '1930 ms', note: 'target < 3000 · pass' },
    { label: 'Library scale', value: '45 ms list', note: '~187 jobs · page limit 50' },
    { label: 'Stability synth', value: '8k done', note: '46.2k source · 39 chunks' },
    { label: 'Installer (mac)', value: 'DMG 421 MB', note: 'en+pt onnx bundled' },
  ];

  const DELTA = [
    { k: 'Version', v: '1.0.0 → 2.0.0' },
    { k: 'LOC (src)', v: '~15,900' },
    { k: 'Spec files', v: '44' },
    { k: 'Modules', v: '14+' },
    { k: 'Engines', v: 'platform → +Piper +Kokoro' },
    { k: 'Languages', v: 'en → en + pt-BR' },
  ];

  const FLEET = [
    { name: 'pre-v2 tag', state: 'landed', detail: 'f1e47bcd local' },
    { name: 'download-piper', state: 'landed', detail: 'en + pt-BR models' },
    { name: 'download-whisper', state: 'landed', detail: 'tiny + base' },
    { name: 'download-kokoro', state: 'landed', detail: 'onnx + voices' },
    { name: 'server-3848', state: 'landed', detail: 'workspace-local API' },
    { name: 'probe-fleet.js ×12', state: 'landed', detail: '~107s sequential harness' },
    { name: 'subagent fleet ×12', state: 'landed', detail: 'parallel probes' },
    { name: 'spot-check ×3', state: 'landed', detail: 'Kokoro / prep / pt-BR' },
    { name: 'stale find (homedir)', state: 'killed', detail: 'orphan hygiene' },
    { name: 'probe on :3847 (wrong tree)', state: 'killed', detail: 'redirected to :3848' },
  ];

  const CL = [
    'Neural engines: Piper + Kokoro with honest /tts/engines reporting',
    'Whisper STT + synthesis QA loop (WER thresholds)',
    'Audiobook library, covers, resume bookmarks, podcast feeds',
    'EPUB 3 media-overlay package export',
    'pt-BR voices, formatters, travessão dialogue',
    'CLI + watch-folder daemon with debounce',
    'Typed error taxonomy, diagnostics bundle, crash-resume',
    'Library-first Voice IA, onboarding, keyboard map, WCAG AA dark theme',
  ];

  function pill(v) {
    const t = String(v).toUpperCase();
    const cls = t.includes('WORKING') ? 'ok' : t.includes('PARTIAL') ? 'warn' : 'bad';
    return `<span class="pill ${cls}">${v}</span>`;
  }

  const tb = document.querySelector('#truth-table tbody');
  tb.innerHTML = FEATURES.map(
    (f) => `<tr>
      <td>${f.n}</td>
      <td>${f.name}</td>
      <td>${pill(f.probe)}</td>
      <td>${pill(f.post)}</td>
      <td>${f.decision}</td>
      <td><a href="/${f.evidence}">${f.evidence.split('/').pop()}</a></td>
    </tr>`,
  ).join('');

  document.getElementById('scoregrid').innerHTML = SCORES.map(
    (s) => `<div class="score"><span class="muted">${s.label}</span><strong>${s.value}</strong><span class="muted">${s.note}</span></div>`,
  ).join('');

  document.getElementById('delta-grid').innerHTML = DELTA.map(
    (d) => `<div><span class="muted">${d.k}</span><strong>${d.v}</strong></div>`,
  ).join('');
  document.getElementById('delta-notes').textContent =
    'Major bump: competitive parity wave (PRs #2–#9) is the product surface of v2.0.';

  document.getElementById('fleet-timeline').innerHTML = FLEET.map(
    (w) => `<div class="tl-item ${w.state}"><strong>${w.name}</strong> · <span class="pill ${w.state === 'landed' ? 'ok' : 'bad'}">${w.state}</span><div class="muted">${w.detail}</div></div>`,
  ).join('');

  document.getElementById('cl-list').innerHTML = CL.map((c) => `<li>${c}</li>`).join('');

  // Live score refresh when API is up
  fetch('/health')
    .then((r) => r.json())
    .then((h) => {
      const el = document.createElement('p');
      el.className = 'muted';
      el.textContent = `Live API: ${h.product || 'ok'} mode=${h.mode} ffmpeg=${h.checks?.ffmpeg} tts=${h.checks?.tts}`;
      document.getElementById('score').appendChild(el);
    })
    .catch(() => {});
})();

/* G28 audit dashboard */
(function () {
  const g28TodoRows = [
    { id: 'TODO-01', sev: 'P0', cat: 'security', status: 'fixed' },
    { id: 'TODO-02', sev: 'P0', cat: 'security', status: 'fixed' },
    { id: 'TODO-03', sev: 'P0', cat: 'leak', status: 'fixed' },
    { id: 'TODO-04', sev: 'P0', cat: 'async', status: 'fixed' },
    { id: 'TODO-05', sev: 'P1', cat: 'leak', status: 'fixed' },
    { id: 'TODO-06', sev: 'P1', cat: 'leak', status: 'fixed' },
    { id: 'TODO-08', sev: 'P1', cat: 'security', status: 'fixed' },
    { id: 'TODO-09', sev: 'P1', cat: 'security', status: 'fixed' },
    { id: 'TODO-10', sev: 'P1', cat: 'security', status: 'fixed' },
    { id: 'TODO-11', sev: 'P1', cat: 'security', status: 'fixed' },
    { id: 'TODO-12', sev: 'P1', cat: 'async', status: 'fixed' },
    { id: 'TODO-13', sev: 'P1', cat: 'perf', status: 'fixed' },
    { id: 'TODO-15', sev: 'P1', cat: 'test', status: 'fixed' },
    { id: 'TODO-16', sev: 'P1', cat: 'test', status: 'fixed' },
    { id: 'TODO-23', sev: 'P2', cat: 'leak', status: 'fixed' },
    { id: 'TODO-26', sev: 'P2', cat: 'dead', status: 'fixed' },
    { id: 'TODO-31', sev: 'P3', cat: 'polish', status: 'fixed' },
    { id: 'TODO-32', sev: 'P3', cat: 'docs', status: 'fixed' },
    { id: 'TODO-34', sev: 'P1', cat: 'security', status: 'fixed' },
    { id: 'TODO-22', sev: 'P2', cat: 'leak', status: 'fixed' },
    { id: 'TODO-17', sev: 'P1', cat: 'dup', status: 'deferred' },
    { id: 'TODO-18', sev: 'P1', cat: 'dup', status: 'deferred' },
    { id: 'TODO-19', sev: 'P1', cat: 'dup', status: 'deferred' },
    { id: 'TODO-20', sev: 'P1', cat: 'arch', status: 'deferred' },
    { id: 'TODO-24', sev: 'P2', cat: 'dup', status: 'deferred' },
    { id: 'TODO-25', sev: 'P2', cat: 'dup', status: 'deferred' },
    { id: 'TODO-27', sev: 'P2', cat: 'perf', status: 'deferred' },
    { id: 'TODO-28', sev: 'P2', cat: 'security', status: 'deferred' },
    { id: 'TODO-29', sev: 'P2', cat: 'types', status: 'deferred' },
    { id: 'TODO-30', sev: 'P2', cat: 'coverage', status: 'deferred' },
    { id: 'TODO-07', sev: 'P1', cat: 'leak', status: 'deferred' },
    { id: 'TODO-14', sev: 'P1', cat: 'perf', status: 'deferred' },
    { id: 'TODO-21', sev: 'P1', cat: 'config', status: 'deferred' },
    { id: 'TODO-33', sev: 'P2', cat: 'async', status: 'deferred' },
  ];
  function renderTodos(filter) {
    const tb = document.querySelector('#todo-table tbody');
    if (!tb) return;
    tb.innerHTML = '';
    g28TodoRows
      .filter((r) => filter === 'all' || r.status === filter)
      .forEach((r) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.id}</td><td>${r.sev}</td><td>${r.cat}</td><td>${r.status}</td>`;
        tb.appendChild(tr);
      });
  }
  const sel = document.getElementById('todo-filter');
  if (sel) {
    sel.addEventListener('change', () => renderTodos(sel.value));
    renderTodos('all');
  }
})();
