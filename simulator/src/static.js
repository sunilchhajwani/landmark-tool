/* static.js
 *
 * Render a landmark JSON (v3.0-sequence) as a static SVG image.
 * Generic — no anatomy knowledge. Groups points by color, draws
 * each color group as a polyline in landmark-ID order. This is the
 * "preserve what the user traced" path. If you need smart grouping,
 * post-process the JSON into the engine input first.
 *
 * Renders into <svg id="canvas">. Dark monitor aesthetic.
 */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, children) {
    const e = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const k in attrs) {
      if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    }
    if (children) for (const c of children) e.appendChild(c);
    return e;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // Build a static rendering of one landmark JSON
  function renderStatic(svg, spec) {
    clear(svg);
    const w = spec.imageA?.width  || spec.imageWidth  || 800;
    const h = spec.imageA?.height || spec.imageHeight || 533;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    // ---- defs (glow, grid, scanlines, bg) ----
    const defs = el('defs');
    const glow = el('filter', { id: 'glow', x: '-20%', y: '-20%', width: '140%', height: '140%' });
    glow.appendChild(el('feGaussianBlur', { stdDeviation: '2.2', result: 'b' }));
    const m1 = el('feMerge'); m1.appendChild(el('feMergeNode', { in: 'b' })); m1.appendChild(el('feMergeNode', { in: 'SourceGraphic' }));
    glow.appendChild(m1);
    defs.appendChild(glow);

    const glow2 = el('filter', { id: 'glow-strong', x: '-30%', y: '-30%', width: '160%', height: '160%' });
    glow2.appendChild(el('feGaussianBlur', { stdDeviation: '3.5', result: 'b' }));
    const m2 = el('feMerge'); m2.appendChild(el('feMergeNode', { in: 'b' })); m2.appendChild(el('feMergeNode', { in: 'SourceGraphic' }));
    glow2.appendChild(m2);
    defs.appendChild(glow2);

    const bg = el('radialGradient', { id: 'bg', cx: '50%', cy: '50%', r: '75%' });
    bg.appendChild(el('stop', { offset: '0%',   'stop-color': '#0a1426' }));
    bg.appendChild(el('stop', { offset: '100%', 'stop-color': '#02050a' }));
    defs.appendChild(bg);

    const grid = el('pattern', { id: 'grid', width: '40', height: '40', patternUnits: 'userSpaceOnUse' });
    grid.appendChild(el('path', { d: 'M 40 0 L 0 0 0 40', fill: 'none', stroke: '#0e2a3a', 'stroke-width': '0.5' }));
    defs.appendChild(grid);

    const scan = el('pattern', { id: 'scan', width: '4', height: '4', patternUnits: 'userSpaceOnUse' });
    scan.appendChild(el('rect', { width: '4', height: '4', fill: 'transparent' }));
    scan.appendChild(el('line', { x1: '0', y1: '0', x2: '4', y2: '0', stroke: '#00ffe1', 'stroke-opacity': '0.04', 'stroke-width': '1' }));
    defs.appendChild(scan);

    svg.appendChild(defs);

    // ---- layers ----
    svg.appendChild(el('rect', { x: 0, y: 0, width: w, height: h, fill: 'url(#bg)' }));
    svg.appendChild(el('rect', { x: 0, y: 0, width: w, height: h, fill: 'url(#grid)' }));
    const gPolylines = el('g', { id: 'layer-polylines' });
    const gDots      = el('g', { id: 'layer-dots' });
    const gLabels    = el('g', { id: 'layer-labels' });
    svg.append(gPolylines, gDots, gLabels);

    // ---- group landmarks by color, preserve ID order within each group ----
    const byColor = new Map();
    for (const p of spec.landmarks) {
      const c = p.color || '#ffffff';
      if (!byColor.has(c)) byColor.set(c, []);
      byColor.get(c).push(p);
    }
    for (const arr of byColor.values()) arr.sort((a, b) => a.id - b.id);

    // Heuristic: a color group is "closed" if the first and last points
    // are spatially close. Otherwise it's an open polyline.
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    const wref = (spec.imageA?.width  || w);
    const href = (spec.imageA?.height || h);
    const diag = Math.hypot(wref, href);
    const CLOSE_THRESH = diag * 0.04;     // 4% of image diagonal

    // ---- draw polylines ----
    for (const [color, arr] of byColor.entries()) {
      if (arr.length < 2) continue;
      const isClosed = dist(arr[0], arr[arr.length - 1]) < CLOSE_THRESH;
      const d = 'M ' + arr.map(p => `${p.x_A} ${p.y_A}`).join(' L ') + (isClosed ? ' Z' : '');
      const sw = arr.length > 10 ? 2.2 : 2.0;
      gPolylines.appendChild(el('path', {
        d, fill: 'none', stroke: color, 'stroke-width': sw,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round', filter: 'url(#glow)'
      }));
    }

    // ---- draw dots + labels ----
    for (const p of spec.landmarks) {
      gDots.appendChild(el('circle', {
        cx: p.x_A, cy: p.y_A, r: 2.5, fill: p.color, opacity: 0.95, filter: 'url(#glow-strong)'
      }));
    }

    return { byColor, svg };
  }

  window.StaticRenderer = { renderStatic };
})();
