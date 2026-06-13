/* engine.js
 *
 * Generic anatomy simulator engine. Schema-driven. Domain-agnostic.
 * Master phase φ ∈ [0, 2π] drives all motion.
 *
 * Coordinate system: fractions of canvas (0..1) in JSON; converted to
 * canvas units once at load. All engine math happens in canvas units.
 *
 * Public API:
 *   const engine = new Engine(spec, canvasEl);
 *   engine.setPhase(phi);                 // φ in radians
 *   engine.setAmplitude(a);               // 0..1, scales all contractions
 *   engine.getState();                    // current transformed geometry
 *   engine.start();  engine.stop();       // play loop
 */

(function (root) {
  'use strict';

  // ---- helpers ----
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function smoothstep(t) {
    // Cubic Hermite: 3t^2 - 2t^3, derivative 0 at endpoints
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }
  function smootherstep(t) {
    // Quintic: 6t^5 - 15t^4 + 10t^3, C2-continuous
    t = clamp(t, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function waveform(phi, closedPhi, openPhi, kind) {
    // Returns 0 at closed_phi, 1 at open_phi, smooth between.
    // The two phases are normalized to 0..1 fractions of 2π.
    let c = ((closedPhi % 1) + 1) % 1;
    let o = ((openPhi   % 1) + 1) % 1;
    // φ fraction
    const f = ((phi / TAU) % 1 + 1) % 1;
    // Distance from f to c, going the short way toward o
    let dist;
    if (o > c) {
      // open is later in cycle than closed
      if (f >= c && f <= o) dist = (f - c) / (o - c);
      else dist = 0;
    } else {
      // wraps around
      if (f >= c) dist = (f - c) / (o + 1 - c);
      else if (f <= o) dist = (f + 1 - c) / (o + 1 - c);
      else dist = 0;
    }
    const t = clamp(dist, 0, 1);
    if (kind === 'cosine') return 0.5 - 0.5 * Math.cos(t * Math.PI);
    if (kind === 'pulse')  return Math.pow(t, 0.5);            // fast rise, slow fall
    return smoothstep(t);                                       // default sine-like, smooth
  }

  // ---- Engine ----
  class Engine {
    constructor(spec, svgEl) {
      this.spec = spec;
      this.svg  = svgEl;
      this.phi  = 0;
      this.amplitude = 1.0;
      this.playing = false;
      this.lastT = null;
      this.rate  = 1.0;                  // cycles per second
      this.cw    = spec.canvas.width;
      this.ch    = spec.canvas.height;
      this.palette = spec.palette || {};

      // Pre-compute per-structure state
      this._indexStructures();
    }

    _resolveColor(c) {
      if (!c) return '#ffffff';
      if (c.startsWith('#') || c.startsWith('rgb') || c.startsWith('hsl')) return c;
      return this.palette[c] || c;
    }

    _indexStructures() {
      this.structs = this.spec.structures.map(s => {
        const out = { ...s, _resolvedColor: this._resolveColor(s.color) };
        if (s.type === 'loop' || s.type === 'wall') {
          out._landmarksPx = s.landmarks.map(p => ({
            x: p.x * this.cw,
            y: p.y * this.ch,
            name: p.name
          }));
        }
        if (s.type === 'gate') {
          out._hingePx = { x: s.hinge.x * this.cw, y: s.hinge.y * this.ch };
          out._dirUnit = this._normalize(s.leaflet.rest_direction);
          out._restLen = s.leaflet.rest_length; // canvas units
        }
        if (s.type === 'channel') {
          out._inletPx  = { x: s.inlet.x  * this.cw, y: s.inlet.y  * this.ch, hw: s.inlet.half_width };
          out._outletPx = { x: s.outlet.x * this.cw, y: s.outlet.y * this.ch };
        }
        return out;
      });
      this.byId = Object.fromEntries(this.structs.map(s => [s.id, s]));
    }

    _normalize(v) {
      const m = Math.hypot(v.x, v.y) || 1;
      return { x: v.x / m, y: v.y / m };
    }

    // -- top-level phase update --
    setPhase(phi) {
      this.phi = ((phi % TAU) + TAU) % TAU;
      this._update();
    }

    setAmplitude(a) { this.amplitude = clamp(a, 0, 1.5); this._update(); }
    setRate(r)      { this.rate = Math.max(0, r); }

    start() {
      if (this.playing) return;
      this.playing = true;
      this.lastT = performance.now();
      const tick = (t) => {
        if (!this.playing) return;
        const dt = (t - this.lastT) / 1000;
        this.lastT = t;
        this.setPhase(this.phi + dt * this.rate * TAU);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    stop() { this.playing = false; }

    // -- compute current geometry --
    _update() {
      this.state = {
        loops: [], walls: [], gates: [], channels: [], references: []
      };

      // 1. Resolve gate positions first (hinges are static, so we
      //    know tip->tip distance for coaptation)
      const gateTips = {};
      for (const s of this.structs) {
        if (s.type === 'gate') this._transformGate(s, gateTips);
      }

      // 2. Apply auto-coaptation: scale leaflet length so opposing
      //    tips meet exactly when both gates are at the closed phase
      this._applyCoaptation(gateTips);

      // 3. Loops and walls: radial scale from contraction center
      for (const s of this.structs) {
        if (s.type === 'loop')  this._transformLoop(s);
        if (s.type === 'wall')  this._transformWall(s);
        if (s.type === 'channel') this._transformChannel(s);
        if (s.type === 'reference') this.state.references.push(s);
      }
    }

    _transformGate(s, tipsOut) {
      const m = s.motion;
      const open01 = waveform(this.phi, m.closed_phase, m.open_phase, m.waveform);
      // open01 = 1 means fully OPEN. Closed-phase rotation = 0, open-phase = swing_degrees.
      const angleDeg = open01 * m.swing_degrees;

      // Direction sign: positive swing = leaflet swings "up" from rest.
      // We let the JSON's rest_direction point toward the closed-phase tip;
      // open-phase tips swing in the +y-rotated direction in screen coords.
      // For now, rotate by +angle (CCW in math, but SVG y is flipped so visually CW).
      const rad = angleDeg * Math.PI / 180;
      const c = Math.cos(rad), sn = Math.sin(rad);
      const dx = s._dirUnit.x * c - s._dirUnit.y * sn;
      const dy = s._dirUnit.x * sn + s._dirUnit.y * c;

      const tip = {
        x: s._hingePx.x + dx * s._restLen,
        y: s._hingePx.y + dy * s._restLen,
      };
      const mid = {
        x: s._hingePx.x + dx * s._restLen * 0.5,
        y: s._hingePx.y + dy * s._restLen * 0.5,
      };

      this.state.gates.push({
        id: s.id, label: s.label, color: s._resolvedColor,
        stroke_width: s.stroke_width || 2.5,
        hinge: s._hingePx, mid, tip,
        open01
      });
      tipsOut[s.id] = tip;
    }

    _applyCoaptation(tips) {
      // For each gate that has a coaptation_with partner, find both gates'
      // tip positions at this frame, compute the gap, and scale each
      // leaflet's rendered length (not rest length) so tips meet when both
      // are in the closed phase. Outside the closed phase, scale ramps to 1.
      for (const s of this.structs) {
        if (s.type !== 'gate' || !s.coaptation_with) continue;
        const partner = this.byId[s.coaptation_with];
        if (!partner) continue;

        const myTip = tips[s.id];
        const pTip  = tips[partner.id];
        if (!myTip || !pTip) continue;

        // Effective direction for THIS leaflet at this frame (from hinge toward tip)
        const myDir = this._normalize({
          x: myTip.x - s._hingePx.x,
          y: myTip.y - s._hingePx.y
        });
        const pDir = this._normalize({
          x: pTip.x - partner._hingePx.x,
          y: pTip.y - partner._hingePx.y
        });

        // We need the two tips to meet at a point P along both directions.
        // s._hinge + t1*myDir = partner._hinge + t2*pDir
        // Solve the 2x2 system.
        const sol = this._lineLineIntersect(
          s._hingePx, myDir,
          partner._hingePx, pDir
        );
        if (!sol) continue;
        const t1 = sol.t1, t2 = sol.t2;

        // Closed-ness of this pair: 1 when both gates at closed_phase, 0 when open
        const closed1 = 1 - waveform(this.phi, s.motion.closed_phase, s.motion.open_phase, s.motion.waveform);
        const closed2 = 1 - waveform(this.phi, partner.motion.closed_phase, partner.motion.open_phase, partner.motion.waveform);
        const coaptFactor = Math.min(closed1, closed2); // 1 = fully closed

        // Update the rendered tip in state.gates for this gate
        const gateState = this.state.gates.find(g => g.id === s.id);
        if (gateState) {
          const targetTip = { x: s._hingePx.x + myDir.x * t1, y: s._hingePx.y + myDir.y * t1 };
          const baseTip   = gateState.tip;
          // Lerp between baseTip (no coaptation) and targetTip (full coaptation)
          gateState.tip = {
            x: lerp(baseTip.x, targetTip.x, coaptFactor),
            y: lerp(baseTip.y, targetTip.y, coaptFactor)
          };
          // Adjust mid to keep leaflet a straight line from hinge to tip
          gateState.mid = {
            x: (s._hingePx.x + gateState.tip.x) / 2,
            y: (s._hingePx.y + gateState.tip.y) / 2,
          };
        }
      }
    }

    _lineLineIntersect(p1, d1, p2, d2) {
      // p1 + t1*d1 = p2 + t2*d2
      // [d1, -d2] [t1, t2]^T = p2 - p1
      const det = d1.x * (-d2.y) - d1.y * (-d2.x);
      if (Math.abs(det) < 1e-9) return null;
      const rx = p2.x - p1.x, ry = p2.y - p1.y;
      const t1 = (rx * (-d2.y) - ry * (-d2.x)) / det;
      const t2 = (d1.x * ry - d1.y * rx) / det;
      return { t1, t2 };
    }

    _transformLoop(s) {
      const c = s.contraction;
      const phase = this.phi - (c.phase_offset || 0);
      // scale: 1 at rest, 1-amplitude at peak contraction
      let s01;
      if (c.waveform === 'cosine') s01 = 0.5 + 0.5 * Math.cos(phase);
      else if (c.waveform === 'pulse') s01 = 1 - c.amplitude * Math.max(0, Math.cos(phase));
      else s01 = 1 - c.amplitude * (0.5 - 0.5 * Math.cos(phase));

      const eff = lerp(1, s01, this.amplitude);
      const cx = c.center.x * this.cw, cy = c.center.y * this.ch;
      const pts = s._landmarksPx.map(p => ({
        x: cx + (p.x - cx) * eff,
        y: cy + (p.y - cy) * eff,
        name: p.name
      }));
      this.state.loops.push({
        id: s.id, label: s.label, color: s._resolvedColor,
        fill: s.fill, stroke_width: s.stroke_width || 2,
        points: pts
      });
    }

    _transformWall(s) {
      // Same radial scaling as loop, but polyline is open
      this._transformLoop(s);
      const last = this.state.loops.pop();
      this.state.walls.push(last);
    }

    _transformChannel(s) {
      const t = s.taper || {};
      const profile = t.profile || 'cubic';
      const amp = (t.pulse_amplitude || 0) * this.amplitude;
      const phase = this.phi - (t.pulse_phase_offset || 0);
      const pulse = 1 + amp * (0.5 - 0.5 * Math.cos(phase));

      const i = s._inletPx, o = s._outletPx;
      const dx = o.x - i.x, dy = o.y - i.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;          // unit along channel
      const nx = -uy,        ny =  ux;              // unit normal

      // Build N samples along the channel; for each, compute half-width
      // via taper profile, then ±normal offset for the two wall polylines.
      const N = 32;
      const wallL = [], wallR = [];
      for (let k = 0; k <= N; k++) {
        const t01 = k / N;
        let w;
        if (profile === 'linear') w = 1 - t01;
        else if (profile === 'quintic') w = 1 - smootherstep(t01);
        else w = 1 - smoothstep(t01);   // cubic default: zero derivative at outlet
        const hw = i.hw * w * pulse;
        const px = i.x + dx * t01, py = i.y + dy * t01;
        wallL.push({ x: px + nx * hw, y: py + ny * hw });
        wallR.push({ x: px - nx * hw, y: py - ny * hw });
      }
      this.state.channels.push({
        id: s.id, label: s.label, color: s._resolvedColor,
        stroke_width: s.stroke_width || 1.5,
        left: wallL, right: wallR,
        inlet: i, outlet: o, axis: { x: ux, y: uy }
      });
    }

    getState() { return this.state; }
  }

  root.Engine = Engine;
  root.TAU = TAU;
})(window);
