(function () {
  const data = window.FARM_DATA || {};

  function $(sel) { return document.querySelector(sel); }

  function setVerdict(v) {
    const el = $('#verdict-badge');
    if (!el) return;
    el.textContent = v;
    el.className = 'badge ' + (v === 'GO' ? 'go' : v === 'NO-GO' ? 'nogo' : 'pending');
  }

  function werKind(r) {
    if (r.wer == null) return '—';
    if (r.werIsProxy) return 'proxy';
    return 'measured';
  }

  function pauseKind(r) {
    if (r.pauseConformance == null) return '—';
    if (r.pauseIsProxy) return 'proxy';
    if (r.method && r.method.pause === 'pause-probe-profile-band') return 'profile-band';
    if (r.method && r.method.pause === 'ffmpeg-silencedetect') return 'proxy';
    return r.pauseIsProxy === false ? 'profile-band' : 'unknown';
  }

  function gateRow(r) {
    // Proxy WER cannot clear the cell gate
    if (r.werIsProxy) return 'NO-GO';
    if (r.pauseIsProxy) return 'NO-GO';
    const werOk = r.wer == null || r.wer <= 0.35;
    const confOk = r.pauseConformance == null || r.pauseConformance >= 0.9;
    const audioOk = r.validAudio !== false;
    return werOk && confOk && audioOk ? 'GO' : 'NO-GO';
  }

  function renderCatalog() {
    const rows = (data.catalog && data.catalog.rows) || [];
    const tbody = $('#catalog-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    let go = 0, nogo = 0;
    let measuredN = 0, proxyN = 0;
    for (const r of rows) {
      const g = gateRow(r);
      if (g === 'GO') go++; else nogo++;
      if (r.werIsProxy) proxyN++;
      else if (r.wer != null) measuredN++;
      const tr = document.createElement('tr');
      const wk = werKind(r);
      const pk = pauseKind(r);
      tr.innerHTML = [
        `<td>${esc(r.docId || r.id)}</td>`,
        `<td>${esc(r.engine)}</td>`,
        `<td>${esc(r.language)}</td>`,
        `<td>${fmt(r.wer, 3)}</td>`,
        `<td class="${wk === 'measured' ? 'kind-measured' : wk === 'proxy' ? 'kind-proxy' : ''}">${wk}</td>`,
        `<td>${r.pauseConformance != null ? (r.pauseConformance * 100).toFixed(0) + '%' : '—'}</td>`,
        `<td class="${pk === 'profile-band' ? 'kind-measured' : pk === 'proxy' ? 'kind-proxy' : ''}">${pk}</td>`,
        `<td>${fmt(r.rtf, 2)}</td>`,
        `<td class="${g === 'GO' ? 'gate-go' : 'gate-nogo'}">${g}</td>`,
      ].join('');
      tbody.appendChild(tr);
    }
    const meta = $('#catalog-meta');
    if (meta) {
      const a = (data.catalog && data.catalog.aggregates) || {};
      const meth = (data.catalog && data.catalog.methodology) || data.methodology || {};
      meta.textContent = rows.length
        ? `Rows ${rows.length} · ASR WER ${fmt(a.meanWerMeasured != null ? a.meanWerMeasured : a.meanWer, 3)} (${measuredN} measured / ${proxyN} proxy) · conf ${fmtPct(a.meanConformance)} · pause=${meth.pause || pauseKind(rows[0]) || '—'} · GO ${go} / NO-GO ${nogo}`
        : 'Waiting for catalog measurement…';
    }
  }

  function renderMatrix() {
    const rows = (data.matrix && data.matrix.rows) || [];
    const heat = $('#heatmap');
    if (heat) {
      heat.innerHTML = '';
      for (const r of rows) {
        const cell = document.createElement('div');
        cell.className = 'heat-cell';
        const conf = r.pauseConformance != null ? r.pauseConformance : 0;
        const alpha = 0.25 + conf * 0.75;
        const wk = werKind(r);
        const pk = pauseKind(r);
        cell.style.background = r.werIsProxy
          ? `rgba(240, 180, 41, ${alpha.toFixed(2)})`
          : `rgba(61, 203, 122, ${alpha.toFixed(2)})`;
        cell.innerHTML = `<strong>${esc(r.engine)} · ${esc(r.profile)}</strong>${esc(r.docId || '')}<br>WER ${fmt(r.wer, 2)} <em>${wk}</em> · conf ${(conf * 100).toFixed(0)}% <em>${pk}</em> · RTF ${fmt(r.rtf, 2)}`;
        heat.appendChild(cell);
      }
    }
    const ul = $('#recommendations');
    if (ul) {
      ul.innerHTML = '';
      const recs = (data.matrix && data.matrix.recommendations) || {};
      for (const [ct, rec] of Object.entries(recs)) {
        const li = document.createElement('li');
        li.textContent = `${ct}: ${rec.engine} + ${rec.profile} (score ${fmt(rec.score, 3)})`;
        ul.appendChild(li);
      }
      if (!Object.keys(recs).length) {
        ul.innerHTML = '<li>Recommendations appear after matrix measurement.</li>';
      }
    }
    const meta = $('#matrix-meta');
    if (meta) meta.textContent = rows.length ? `${rows.length} cells measured` : 'Matrix pending…';
  }

  function renderSoak() {
    const soak = data.soak || {};
    const mem = soak.memory || soak;
    const samples = mem.samples || [];
    const plateau = mem.plateau || soak.plateau;
    const canvas = $('#soak-chart');
    const meta = $('#soak-meta');
    if (meta) {
      const st = soak.state || {};
      meta.textContent = samples.length
        ? `RSS samples ${samples.length} · plateau ${plateau ? 'YES' : 'no'} · farm ${st.status || '—'} · job ${st.done || 0}/${st.total || 0}`
        : 'Soak samples will appear while memory probe runs…';
    }
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#121a24';
    ctx.fillRect(0, 0, w, h);
    if (samples.length < 2) {
      ctx.fillStyle = '#9aa8bc';
      ctx.fillText('Soak samples will plot here (RSS over time).', 24, h / 2);
      return;
    }
    const rss = samples.map((s) => s.rssMB);
    const max = Math.max(...rss) * 1.1;
    const min = Math.min(...rss) * 0.9;
    // plateau band highlight (last 6 samples range)
    if (samples.length >= 6) {
      const last = samples.slice(-6);
      const x0 = ((samples.length - 6) / (samples.length - 1)) * (w - 40) + 20;
      ctx.fillStyle = 'rgba(61, 203, 122, 0.12)';
      ctx.fillRect(x0, 20, w - 20 - x0, h - 40);
    }
    ctx.strokeStyle = '#5b9fd4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    samples.forEach((s, i) => {
      const x = (i / (samples.length - 1)) * (w - 40) + 20;
      const y = h - 20 - ((s.rssMB - min) / (max - min || 1)) * (h - 40);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = plateau ? '#3dcb7a' : '#9aa8bc';
    ctx.fillText(
      plateau ? 'Plateau detected (no monotonic leak)' : `RSS ${fmt(rss[rss.length - 1], 1)} MB (tracking…)`,
      24,
      24,
    );
  }

  function renderThroughput() {
    const pts = (data.throughput && data.throughput.points) || [];
    const canvas = $('#tp-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#121a24';
    ctx.fillRect(0, 0, w, h);
    if (pts.length < 2) {
      ctx.fillStyle = '#9aa8bc';
      ctx.fillText('Throughput from state.json throughput[]', 24, h / 2);
      return;
    }
    const max = Math.max(...pts.map((p) => p.done)) || 1;
    ctx.strokeStyle = '#7c6cf0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = (i / (pts.length - 1)) * (w - 40) + 20;
      const y = h - 20 - (p.done / max) * (h - 40);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = '#9aa8bc';
    ctx.fillText('concurrency cap: ' + (data.throughput.concurrency || 3), 24, 24);
  }

  function renderLedger() {
    const host = $('#ledger-lanes');
    if (!host) return;
    host.innerHTML = '';
    for (const item of data.ledger || []) {
      const div = document.createElement('div');
      div.className = 'lane ' + (item.outcome || '');
      div.setAttribute('role', 'listitem');
      div.innerHTML = `<div>${esc(item.id)}</div><div class="bar" title="${esc(item.purpose)}"></div><div>${esc(item.outcome || '')}</div>`;
      host.appendChild(div);
    }
    if (!(data.ledger || []).length) {
      host.innerHTML = '<p class="meta">Ledger fills as phases complete.</p>';
    }
  }

  function renderPackaging() {
    const mac = $('#pkg-mac');
    const win = $('#pkg-win');
    if (mac) mac.textContent = (data.packaging && data.packaging.mac) || 'pending';
    if (win) win.textContent = (data.packaging && data.packaging.win) || 'pending';
  }

  function fmt(n, d) {
    if (n == null || !Number.isFinite(n)) return '—';
    return Number(n).toFixed(d);
  }
  function fmtPct(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    return (n * 100).toFixed(1) + '%';
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function boot() {
    setVerdict(data.verdict || 'PENDING');
    renderCatalog();
    renderMatrix();
    renderSoak();
    renderThroughput();
    renderLedger();
    renderPackaging();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
