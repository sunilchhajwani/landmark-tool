/* renderer.js
 *
 * Renders engine.state into the SVG. Generic: knows nothing about
 * PLAX or any specific anatomy.
 *
 * Layers (z-order, back to front):
 *   1. <defs>  scanline pattern, glow filter, grid
 *   2. background
 *   3. loops (filled volumes)
 *   4. walls (open polylines)
 *   5. channels (tapered tube)
 *   6. gates (leaflet polylines)
 *   7. references (static geometry, e.g. annotation circles)
 *   8. landmarks (debug overlay, toggleable)
 *   9. scanline overlay
 */
(function (root) {
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

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  class Renderer {
    constructor(svgEl, spec) {
      this.svg = svgEl;
      this.spec = spec;
      this.cw = spec.canvas.width;
      this.ch = spec.canvas.height;
      this.svg.setAttribute('viewBox', `0 0 ${this.cw} ${this.ch}`);
      this.showLandmarks = false;

      this._buildDefs();
      this._buildStatic();
    }

    setShowLandmarks(v) { this.showLandmarks = v; }

    _buildDefs() {
      const defs = el('defs');

      // Glow filter for vector strokes
      const glow = el('filter', { id: 'glow', x: '-20%', y: '-20%', width: '140%', height: '140%' });
      glow.appendChild(el('feGaussianBlur', { stdDeviation: '2.5', result: 'blur' }));
      const merge = el('feMerge');
      merge.appendChild(el('feMergeNode', { in: 'blur' }));
      merge.appendChild(el('feMergeNode', { in: 'SourceGraphic' }));
      glow.appendChild(merge);
      defs.appendChild(glow);

      // Strong glow for valves
      const glow2 = el('filter', { id: 'glow-strong', x: '-30%', y: '-30%', width: '160%', height: '160%' });
      glow2.appendChild(el('feGaussianBlur', { stdDeviation: '4', result: 'blur' }));
      const merge2 = el('feMerge');
      merge2.appendChild(el('feMergeNode', { in: 'blur' }));
      merge2.appendChild(el('feMergeNode', { in: 'SourceGraphic' }));
      glow2.appendChild(merge2);
      defs.appendChild(glow2);

      // Subtle background gradient
      const bg = el('radialGradient', { id: 'bg-grad', cx: '50%', cy: '50%', r: '70%' });
      bg.appendChild(el('stop', { offset: '0%',  'stop-color': '#0a1426' }));
      bg.appendChild(el('stop', { offset: '100%', 'stop-color': '#02050a' }));
      defs.appendChild(bg);

      // Scanline pattern
      const pat = el('pattern', { id: 'scanlines', width: '4', height: '4', patternUnits: 'userSpaceOnUse' });
      pat.appendChild(el('rect', { width: '4', height: '4', fill: 'transparent' }));
      pat.appendChild(el('line', { x1: '0', y1: '0', x2: '4', y2: '0', stroke: '#00ffe1', 'stroke-opacity': '0.04', 'stroke-width': '1' }));
      defs.appendChild(pat);

      // Reference grid (very faint)
      const grid = el('pattern', { id: 'grid', width: '40', height: '40', patternUnits: 'userSpaceOnUse' });
      grid.appendChild(el('path', { d: 'M 40 0 L 0 0 0 40', fill: 'none', stroke: '#0e2a3a', 'stroke-width': '0.5' }));
      defs.appendChild(grid);

      this.svg.appendChild(defs);
    }

    _buildStatic() {
      this.svg.appendChild(el('rect', { x: 0, y: 0, width: this.cw, height: this.ch, fill: 'url(#bg-grad)' }));
      this.svg.appendChild(el('rect', { x: 0, y: 0, width: this.cw, height: this.ch, fill: 'url(#grid)' }));
      this.gLoops    = el('g', { id: 'layer-loops' });
      this.gWalls    = el('g', { id: 'layer-walls' });
      this.gChannels = el('g', { id: 'layer-channels' });
      this.gGates    = el('g', { id: 'layer-gates' });
      this.gRefs     = el('g', { id: 'layer-references' });
      this.gLandmarks= el('g', { id: 'layer-landmarks', visibility: 'hidden' });
      this.gScan     = el('g', { id: 'layer-scanlines' });
      this.gScan.appendChild(el('rect', { x: 0, y: 0, width: this.cw, height: this.ch, fill: 'url(#scanlines)', pointerEvents: 'none' }));
      this.svg.append(this.gLoops, this.gWalls, this.gChannels, this.gGates, this.gRefs, this.gLandmarks, this.gScan);
    }

    render(state) {
      // loops
      clearChildren(this.gLoops);
      for (const L of state.loops) {
        const d = 'M ' + L.points.map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ') + ' Z';
        this.gLoops.appendChild(el('path', {
          d, fill: L.fill || 'rgba(80,180,255,0.10)', stroke: L.color, 'stroke-width': L.stroke_width,
          'stroke-linejoin': 'round', filter: 'url(#glow)'
        }));
      }

      // walls
      clearChildren(this.gWalls);
      for (const W of state.walls) {
        const d = 'M ' + W.points.map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ');
        this.gWalls.appendChild(el('path', {
          d, fill: 'none', stroke: W.color, 'stroke-width': W.stroke_width,
          'stroke-linejoin': 'round', filter: 'url(#glow)'
        }));
      }

      // channels (tube)
      clearChildren(this.gChannels);
      for (const C of state.channels) {
        const dl = 'M ' + C.left.map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ');
        const dr = 'M ' + C.right.map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ');
        // Combined filled tube
        const dFill = 'M ' + C.left.map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ')
                    + ' L ' + C.right.slice().reverse().map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ') + ' Z';
        this.gChannels.appendChild(el('path', { d: dFill, fill: C.color, 'fill-opacity': '0.08' }));
        this.gChannels.appendChild(el('path', { d: dl, fill: 'none', stroke: C.color, 'stroke-width': C.stroke_width, filter: 'url(#glow)' }));
        this.gChannels.appendChild(el('path', { d: dr, fill: 'none', stroke: C.color, 'stroke-width': C.stroke_width, filter: 'url(#glow)' }));
      }

      // gates (leaflets)
      clearChildren(this.gGates);
      for (const G of state.gates) {
        const d = `M ${G.hinge.x.toFixed(2)} ${G.hinge.y.toFixed(2)} L ${G.mid.x.toFixed(2)} ${G.mid.y.toFixed(2)} L ${G.tip.x.toFixed(2)} ${G.tip.y.toFixed(2)}`;
        this.gGates.appendChild(el('path', {
          d, fill: 'none', stroke: G.color, 'stroke-width': G.stroke_width,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round', filter: 'url(#glow-strong)'
        }));
        // Hinge dot
        this.gGates.appendChild(el('circle', { cx: G.hinge.x, cy: G.hinge.y, r: 3.5, fill: G.color, filter: 'url(#glow-strong)' }));
        // Tip dot
        this.gGates.appendChild(el('circle', { cx: G.tip.x, cy: G.tip.y, r: 2.5, fill: G.color, opacity: 0.9 }));
      }

      // references
      clearChildren(this.gRefs);
      for (const R of state.references) {
        if (R.shape.kind === 'circle') {
          this.gRefs.appendChild(el('circle', {
            cx: R.shape.center.x, cy: R.shape.center.y, r: R.shape.radius,
            fill: 'none', stroke: R._resolvedColor, 'stroke-width': 1.5, 'stroke-dasharray': '4 4', filter: 'url(#glow)'
          }));
        }
      }

      // landmark debug overlay
      this._renderLandmarks(state);
    }

    _renderLandmarks(state) {
      clearChildren(this.gLandmarks);
      this.gLandmarks.setAttribute('visibility', this.showLandmarks ? 'visible' : 'hidden');
      if (!this.showLandmarks) return;
      // Static landmark dots (from spec), transformed
      let idx = 0;
      const draw = (p, color) => {
        const c = el('circle', { cx: p.x, cy: p.y, r: 2.2, fill: color, opacity: 0.7 });
        const t = el('text', {
          x: p.x + 5, y: p.y - 5, fill: color, 'font-size': '9', 'font-family': 'monospace', opacity: 0.8
        });
        t.textContent = p.name || `#${idx}`;
        this.gLandmarks.appendChild(c);
        this.gLandmarks.appendChild(t);
        idx++;
      };
      for (const L of state.loops) for (const p of L.points) draw(p, L.color);
      for (const W of state.walls) for (const p of W.points) draw(p, W.color);
      for (const G of state.gates) { draw(G.hinge, G.color); /* tip shown in render */ }
    }
  }

  root.Renderer = Renderer;
})(window);
