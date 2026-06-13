/* app-static.js
 * Static-only app: loads landmark JSON, renders once, no animation.
 * This is the baseline — when the engine is wired in, this becomes
 * the initial state of the animated app.
 */
(function () {
  'use strict';

  const EXAMPLES = [
    { id: 'psax',     name: 'PSAX (echo testing)', url: 'examples/psax-landmarks.json' }
  ];

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  let currentSpec = null;
  let renderer = null;

  // ---- examples ----
  async function loadExamples() {
    const og = $('#examples-group');
    og.innerHTML = '';
    for (const ex of EXAMPLES) {
      const opt = document.createElement('option');
      opt.value = ex.url;
      opt.textContent = ex.name;
      og.appendChild(opt);
    }
  }

  // ---- loaders ----
  async function loadFromUrl(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r}`);
    return r.json();
  }

  function applySpec(spec) {
    currentSpec = spec;
    const svg = $('#canvas');
    const out = window.StaticRenderer.renderStatic(svg, spec);
    renderer = out;

    // header
    $('#spec-name').textContent = spec.imageA?.name || spec.name || 'unnamed spec';
    $('#readout-points').textContent = spec.landmarks.length;
    $('#readout-groups').textContent = out.byColor.size;

    // legend
    const lb = $('#legend-body');
    lb.innerHTML = '';
    for (const [color, arr] of [...out.byColor.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const row = document.createElement('div');
      row.className = 'legend-row';
      const sw = document.createElement('div');
      sw.className = 'legend-swatch';
      sw.style.background = color;
      sw.style.color = color;
      const nm = document.createElement('span');
      nm.textContent = color;
      const ct = document.createElement('span');
      ct.className = 'legend-count';
      ct.textContent = `${arr.length} pts`;
      row.append(sw, nm, ct);
      lb.appendChild(row);
    }
  }

  // ---- wiring ----
  $('#spec-source').addEventListener('change', async (e) => {
    const v = e.target.value;
    if (v === '__paste__') {
      $('#spec-paste').style.display = 'block';
      $('#spec-paste-load').style.display = 'inline-block';
      return;
    }
    if (v === '__file__') {
      $('#spec-file').click();
      return;
    }
    if (v) {
      try { applySpec(await loadFromUrl(v)); }
      catch (err) { alert('Load failed: ' + err.message); }
    }
  });

  $('#spec-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { applySpec(JSON.parse(await f.text())); }
    catch (err) { alert('Parse failed: ' + err.message); }
  });

  $('#spec-paste-load').addEventListener('click', () => {
    try { applySpec(JSON.parse($('#spec-paste').value)); }
    catch (err) { alert('Parse failed: ' + err.message); }
  });

  $('#ctl-dots').addEventListener('change', (e) => {
    const dotLayer = $('#layer-dots');
    if (dotLayer) dotLayer.style.display = e.target.checked ? '' : 'none';
  });

  $('#ctl-scanlines').addEventListener('change', (e) => {
    // Scanlines are baked into the SVG; we'd need to rebuild to toggle cleanly.
    // For static mode we just hide the grid + a CSS overlay alternative.
    document.body.style.setProperty('--scan', e.target.checked ? '1' : '0');
  });

  // ---- boot ----
  loadExamples().then(async () => {
    // Auto-load the PSAX example so the page is alive on open
    try { applySpec(await loadFromUrl(EXAMPLES[0].url)); }
    catch (err) { console.warn('auto-load failed', err); }
  });
})();
