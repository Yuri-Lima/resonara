(function () {
  'use strict';
  const D = window.RESONARA_EXPRESSIVE;
  if (!D) return;

  const $ = (s) => document.querySelector(s);

  function fillGate() {
    const el = $('#gate2-cmos');
    if (!el) return;
    el.textContent = (D.gate2.cmos >= 0 ? '+' : '') + D.gate2.cmos.toFixed(2);
    $('#gate2-meta').textContent =
      `n=${D.gate2.n} · CI95 [${D.gate2.ci95.join(', ')}] · anchors ${D.gate2.anchorSanity}`;
    $('#engine-winner').textContent = D.winner;
    $('#engine-runner').textContent = 'Runner-up: ' + D.runnerUp;
  }

  function fillMatrix() {
    const tb = $('#matrix-table tbody');
    if (!tb) return;
    tb.innerHTML = D.landscape
      .map((r) => {
        const ship = r.ship
          ? '<span class="pill ok">ship</span>'
          : `<span class="pill bad">DQ</span> ${r.dq || ''}`;
        return `<tr>
          <td>${r.name}</td><td>${r.code}</td><td>${r.weights}</td>
          <td>${r.params}</td><td>${r.ptBR}</td><td>${r.controls}</td>
          <td>${ship}</td><td>${r.score || '—'}</td>
        </tr>`;
      })
      .join('');
  }

  function bar(label, value, max, color) {
    const w = Math.max(2, Math.round((value / max) * 100));
    return `<div style="margin:.35rem 0">
      <div class="muted" style="font-size:.85rem">${label}: ${value.toFixed(0)}</div>
      <div style="background:#0e1116;border:1px solid var(--border);border-radius:6px;height:14px;overflow:hidden">
        <div style="width:${w}%;height:100%;background:${color}"></div>
      </div>
    </div>`;
  }

  function fillProsody() {
    const root = $('#prosody-charts');
    if (!root) return;
    const p = D.prosody.piper;
    const e = D.prosody.expressive;
    const maxMean = Math.max(p.death.f0Mean, p.picnic.f0Mean, e.death.f0Mean, e.picnic.f0Mean);
    const maxDelta = Math.max(p.affectDeltaHz || 1, e.affectDeltaHz || 1, 20);
    root.innerHTML = `
      <p class="muted">Headline metric: <strong>affect contrast</strong> (Δ F0 mean death vs picnic).
      Flat TTS has high absolute F0 variance but <em>same</em> affect; directed performance separates grief vs joy.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div>
          <strong>Piper v2.0.0 (flat affect)</strong>
          ${bar('death F0 mean (Hz)', p.death.f0Mean, maxMean, '#ff6b6b')}
          ${bar('picnic F0 mean (Hz)', p.picnic.f0Mean, maxMean, '#fcc419')}
          ${bar('affect Δ Hz', p.affectDeltaHz || 0, maxDelta, '#9aa3b2')}
          <div class="muted" style="font-size:.85rem">F0 var ratio death/picnic ≈ 1.008</div>
        </div>
        <div>
          <strong>Directed expressive + humanization</strong>
          ${bar('death F0 mean (Hz)', e.death.f0Mean, maxMean, '#51cf66')}
          ${bar('picnic F0 mean (Hz)', e.picnic.f0Mean, maxMean, '#5c7cfa')}
          ${bar('affect Δ Hz', e.affectDeltaHz || 0, maxDelta, '#51cf66')}
          <div class="muted" style="font-size:.85rem">Affect Δ ${((e.affectDeltaHz || 0) / (p.affectDeltaHz || 1)).toFixed(1)}× baseline</div>
        </div>
      </div>`;
  }

  function fillDegrade() {
    const table = $('#degrade-table');
    if (!table) return;
    const { features, engines, matrix } = D.degradation;
    table.querySelector('thead').innerHTML =
      '<tr><th>Feature</th>' +
      engines.map((e) => `<th>${e}</th>`).join('') +
      '</tr>';
    table.querySelector('tbody').innerHTML = features
      .map((f) => {
        return (
          `<tr><th scope="row">${f}</th>` +
          engines
            .map((e) => {
              const v = matrix[f][e];
              const cls =
                v === 'native' || v === 'native*'
                  ? 'ok'
                  : v === 'approx'
                    ? 'warn'
                    : 'bad';
              return `<td><span class="pill ${cls}">${v}</span></td>`;
            })
            .join('') +
          '</tr>'
        );
      })
      .join('');
  }

  function fillCast() {
    const tb = $('#cast-table tbody');
    if (!tb) return;
    tb.innerHTML = D.casting
      .map(
        (c) =>
          `<tr><td>${c.character}</td><td><code>${c.voice}</code></td><td>${c.style}</td><td>${c.note || ''}</td></tr>`,
      )
      .join('');
  }

  fillGate();
  fillMatrix();
  fillProsody();
  fillDegrade();
  fillCast();
})();
