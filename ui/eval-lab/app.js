/**
 * Blind A/B eval lab — scores written before unblinding.
 */
(function () {
  'use strict';

  const state = {
    manifest: null,
    index: 0,
    /** @type {Array<object>} */
    ratings: [],
    ledgerLines: [],
  };

  const $ = (id) => document.getElementById(id);

  function hide(el) { el.classList.add('hidden'); }
  function show(el) { el.classList.remove('hidden'); }

  async function loadManifest() {
    const url = $('manifestUrl').value.trim();
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load manifest: ' + res.status);
    const man = await res.json();
    if (!man.trials || !Array.isArray(man.trials)) {
      throw new Error('Manifest missing trials[]');
    }
    state.manifest = man;
    state.index = 0;
    state.ratings = [];
    state.ledgerLines = [];
    $('sessionMeta').textContent =
      `Session ${man.sessionId || '?'} · ${man.trials.length} trials · seed ${man.seed ?? '?'}`;
    hide($('setup'));
    hide($('summary'));
    show($('trial'));
    renderTrial();
  }

  function currentTrial() {
    return state.manifest.trials[state.index];
  }

  function renderTrial() {
    const t = currentTrial();
    if (!t) return finish();
    $('trialNum').textContent = String(state.index + 1);
    $('trialTotal').textContent = String(state.manifest.trials.length);
    $('fixtureLabel').textContent = t.fixtureLabel || t.fixture || 'Pair';
    // Blind: use presentation order only
    $('audioA').src = t.presentation.A.url;
    $('audioB').src = t.presentation.B.url;
    document.querySelectorAll('input[name="cmos"]').forEach((r) => {
      r.checked = false;
    });
    $('pmosPitch').value = 50;
    $('pmosRhythm').value = 50;
    $('pmosExpr').value = 50;
    updatePmosLabels();
  }

  function updatePmosLabels() {
    $('pmosPitchV').textContent = $('pmosPitch').value;
    $('pmosRhythmV').textContent = $('pmosRhythm').value;
    $('pmosExprV').textContent = $('pmosExpr').value;
  }

  function commitScore() {
    const cmosEl = document.querySelector('input[name="cmos"]:checked');
    if (!cmosEl) {
      alert('Select a CMOS score before committing.');
      return;
    }
    const t = currentTrial();
    const cmos = parseInt(cmosEl.value, 10);
    // Map: CMOS is B relative to A. Convert to system-preference after unblind.
    const entry = {
      trialId: t.id,
      fixture: t.fixture,
      timestamp: new Date().toISOString(),
      cmosAb: cmos, // positive → B better (HUMAN CMOS)
      isHumanCmos: true,
      protocol: (state.manifest && state.manifest.protocol) || 'human-CMOS-blind-v1',
      certifiesGate2: !!(state.manifest && state.manifest.certifiesGate2),
      pmos: {
        pitch: parseInt($('pmosPitch').value, 10),
        rhythm: parseInt($('pmosRhythm').value, 10),
        expressiveness: parseInt($('pmosExpr').value, 10),
      },
      // Store mapping for unblind (not shown yet)
      _map: {
        A: t.presentation.A.system,
        B: t.presentation.B.system,
      },
      anchor: t.anchor || null,
    };
    state.ratings.push(entry);
    state.ledgerLines.push(JSON.stringify(entry));
    // Persist to localStorage as backup BEFORE unblind
    try {
      localStorage.setItem(
        'resonara-eval-' + (state.manifest.sessionId || 'session'),
        state.ledgerLines.join('\n'),
      );
    } catch (_) { /* */ }

    state.index++;
    if (state.index >= state.manifest.trials.length) finish();
    else renderTrial();
  }

  function finish() {
    hide($('trial'));
    show($('summary'));
    // Unblind now
    const rows = state.ratings.map((r) => {
      // cmos from perspective of system "B" vs "A" in presentation
      // Convert to: score for primary system vs baseline if known
      const aSys = r._map.A;
      const bSys = r._map.B;
      return {
        trialId: r.trialId,
        fixture: r.fixture,
        cmosAb: r.cmosAb,
        systemA: aSys,
        systemB: bSys,
        pmos: r.pmos,
        anchor: r.anchor,
        timestamp: r.timestamp,
      };
    });

    // Anchor sanity
    const anchors = rows.filter((r) => r.anchor);
    let anchorOk = true;
    const anchorNotes = [];
    for (const a of anchors) {
      if (a.anchor === 'identical' && Math.abs(a.cmosAb) > 1) {
        anchorOk = false;
        anchorNotes.push('identical-pair |cmos|>1');
      }
      if (a.anchor === 'degraded' && a.cmosAb >= 0) {
        // degraded should be on B or A — check systems
        // If B is degraded, expect negative CMOS (A better)
        if (a.systemB && String(a.systemB).includes('degraded')) {
          if (a.cmosAb >= 0) {
            anchorOk = false;
            anchorNotes.push('degraded-B not preferred-against');
          }
        }
      }
    }

    // Aggregate CMOS for expressive vs piper if present
    let sum = 0;
    let n = 0;
    for (const r of rows) {
      if (r.anchor) continue;
      const pair = [r.systemA, r.systemB].map(String);
      if (pair.includes('expressive') && pair.includes('piper')) {
        // score for expressive relative to piper
        let s = r.cmosAb;
        if (r.systemA === 'expressive') s = -s; // flip so positive = expressive better
        sum += s;
        n++;
      }
    }
    const mean = n ? sum / n : null;

    const certifies = !!(state.manifest && state.manifest.certifiesGate2);
    let gateLine = '';
    if (certifies) {
      if (!anchorOk) {
        gateLine =
          '<p><strong>Gate 2:</strong> NOT CERTIFIED — anchor sanity failed. Discard this session.</p>';
      } else if (mean == null || n < 4) {
        gateLine =
          '<p><strong>Gate 2:</strong> NOT CERTIFIED — need n≥4 expressive-vs-piper human scores.</p>';
      } else if (mean >= 0.5) {
        gateLine = `<p><strong>Gate 2 (human CMOS):</strong> CERTIFIED_PASS mean ${mean.toFixed(2)} (n=${n}). Save ledger to <code>bench/eval/human-sessions/</code>.</p>`;
      } else {
        gateLine = `<p><strong>Gate 2 (human CMOS):</strong> CERTIFIED_FAIL mean ${mean.toFixed(2)} (n=${n}) — expressive does not beat Piper on this panel. Save ledger honestly.</p>`;
      }
    }
    const html = [
      `<p><strong>Protocol:</strong> ${state.manifest?.protocol || 'human-CMOS'} · <strong>human CMOS only</strong> (not automated proxy)</p>`,
      `<p><strong>Anchor sanity:</strong> ${anchorOk ? 'PASS' : 'FAIL — discard session'} ${anchorNotes.join('; ')}</p>`,
      mean != null
        ? `<p><strong>Mean human CMOS (expressive vs piper):</strong> ${mean.toFixed(2)} (n=${n})</p>`
        : '<p>No expressive-vs-piper pairs in this session.</p>',
      gateLine,
      '<table><thead><tr><th>Trial</th><th>Fixture</th><th>A</th><th>B</th><th>CMOS</th><th>Expr</th></tr></thead><tbody>',
      ...rows.map(
        (r) =>
          `<tr><td>${r.trialId}</td><td>${r.fixture}</td><td>${r.systemA}</td><td>${r.systemB}</td><td>${r.cmosAb}</td><td>${r.pmos.expressiveness}</td></tr>`,
      ),
      '</tbody></table>',
      '<p class="help">Download ledger and place under <code>bench/eval/human-sessions/</code>, then run <code>npm run eval:gate2:status</code>.</p>',
    ];
    $('summaryBody').innerHTML = html.join('');
    state.unblinded = rows;
    state.anchorOk = anchorOk;
    state.meanCmos = mean;
  }

  function downloadLedger() {
    const blob = new Blob([state.ledgerLines.join('\n') + '\n'], {
      type: 'application/x-ndjson',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `human-cmos-${state.manifest?.sessionId || 'session'}.jsonl`;
    a.click();
  }

  $('btnLoad').addEventListener('click', () => {
    loadManifest().catch((e) => {
      $('sessionMeta').textContent = e.message;
    });
  });
  $('btnCommit').addEventListener('click', commitScore);
  $('btnSkip').addEventListener('click', () => {
    state.index++;
    if (state.index >= state.manifest.trials.length) finish();
    else renderTrial();
  });
  $('btnDownload').addEventListener('click', downloadLedger);
  ['pmosPitch', 'pmosRhythm', 'pmosExpr'].forEach((id) => {
    $(id).addEventListener('input', updatePmosLabels);
  });
  document.querySelectorAll('.replay').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = $(btn.getAttribute('data-target'));
      el.currentTime = 0;
      el.play();
    });
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.target.matches('input[type="text"]')) return;
    if (ev.key === '1') {
      $('audioA').currentTime = 0;
      $('audioA').play();
    } else if (ev.key === '2') {
      $('audioB').currentTime = 0;
      $('audioB').play();
    } else if (ev.key === 'Enter' && !$('trial').classList.contains('hidden')) {
      commitScore();
    } else if (ev.key === '-' || ev.key === '_') {
      const cur = document.querySelector('input[name="cmos"]:checked');
      const v = cur ? parseInt(cur.value, 10) - 1 : 0;
      const next = Math.max(-3, v);
      const r = document.querySelector(`input[name="cmos"][value="${next}"]`);
      if (r) r.checked = true;
    } else if (ev.key === '=' || ev.key === '+') {
      const cur = document.querySelector('input[name="cmos"]:checked');
      const v = cur ? parseInt(cur.value, 10) + 1 : 0;
      const next = Math.min(3, v);
      const r = document.querySelector(`input[name="cmos"][value="${next}"]`);
      if (r) r.checked = true;
    }
  });
})();
