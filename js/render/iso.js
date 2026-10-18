/* Isometric view shared by every storage type. World units are cells (x, y)
 * and levels (z). This base holds the camera, input, cached layers, drawing
 * primitives (boxes, totes, conveyors), the frame, and the overlays of
 * battery robots. What every warehouse has outside its storage (stations,
 * packing, the dock) is WS.IsoRenderer in js/render/stations.js. */
(function (WS) {
  'use strict';
  const TW = 64, TH = 32, LV = 17;
  const STATE_COLORS = {
    IDLE: '#94a3b8', MOVING_TO_TARGET: '#38bdf8', DIGGING_BIN: '#f59e0b', LIFTING_POD: '#f59e0b', MAST: '#e879f9', HANDLING: '#f59e0b', TRANSPORTING_TO_PORT: '#22c55e',
    AT_PORT: '#2dd4bf', STORING: '#a78bfa', RESTACKING: '#fb923c', WAITING_IN_TRAFFIC: '#ef4444', WAITING_PORT: '#f472b6',
    TO_CHARGER: '#facc15', CHARGING: '#fde047', YIELDING: '#cbd5e1',
  };
  const CLASS_COLORS = { A: '#f2705f', B: '#f2b84b', C: '#5b8def', E: '#3a4658' };

  // ---- colour helpers
  const rgbCache = new Map();
  function rgb(hex) {
    let c = rgbCache.get(hex);
    if (!c) { const n = parseInt(hex.slice(1), 16); c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; rgbCache.set(hex, c); }
    return c;
  }
  function shade(hex, f) {
    const [r, g, b] = rgb(hex);
    const m = (v) => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f));
    return `rgb(${m(r)},${m(g)},${m(b)})`;
  }
  function rgba(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }

  class IsoView {
    constructor(canvas, app) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.app = app;
      this.cam = { x: 0, y: 0, zoom: 0.8 };
      this.opts = { xray: false, heat: false, paths: true, claims: true, labels: true };
      this.selected = null; this.hover = null;
      this.t = 0; this.CZ = 2.2; // conveyor height (levels)
      this.layers = new Map(); // cached static layers, see drawCached()
      this.bindInput();
    }
    get sim() { return this.app.sim; }
    P(x, y, z) { return [((x - y) * TW) / 2, ((x + y) * TH) / 2 - z * LV]; }

    resize() {
      const r = this.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      this.w = r.width; this.h = r.height; this.dpr = dpr;
      this.canvas.width = Math.max(1, Math.round(r.width * dpr)); this.canvas.height = Math.max(1, Math.round(r.height * dpr));
      this.resetCaches();
    }
    worldBounds() {
      const g = this.sim.grid, L = this.sim.layout, d = L.dock();
      const pts = [this.P(-1, -1, g.Z + 3), this.P(d.x + 6, -1, 0), this.P(-1, g.D + 8, 0), this.P(d.x + 6, g.D + 8, 0), this.P(g.W, -1, g.Z + 3)];
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    }
    fit() {
      if (!this.w) return;
      const b = this.worldBounds();
      const z = Math.min(this.w / (b.x1 - b.x0), this.h / (b.y1 - b.y0)) * 0.96;
      this.cam.zoom = z;
      this.cam.x = this.w / 2 - ((b.x0 + b.x1) / 2) * z;
      this.cam.y = this.h / 2 - ((b.y0 + b.y1) / 2) * z;
    }
    toWorld(sx, sy, z) {
      const wx = (sx - this.cam.x) / this.cam.zoom, wy = (sy - this.cam.y) / this.cam.zoom + z * LV;
      const a = wx / (TW / 2), b = wy / (TH / 2);
      return { x: (a + b) / 2, y: (b - a) / 2 };
    }

    // Draw an expensive, mostly static layer from an offscreen canvas. It is
    // re-rendered (at most every 180 ms) when `key` or the camera changes; in
    // between, the cached image is scaled and moved to follow the camera.
    drawCached(name, key, render) {
      let L = this.layers.get(name);
      if (!L) { L = { cv: document.createElement('canvas'), key: '', camKey: '', time: 0, cam: null }; this.layers.set(name, L); }
      const now = performance.now(), full = key + '|' + this.w + 'x' + this.h;
      const camKey = this.cam.x.toFixed(1) + ',' + this.cam.y.toFixed(1) + ',' + this.cam.zoom.toFixed(4);
      if ((full !== L.key || camKey !== L.camKey) && (now - L.time > 180 || !L.cam)) {
        L.cv.width = this.canvas.width; L.cv.height = this.canvas.height;
        const saved = this.ctx; this.ctx = L.cv.getContext('2d');
        this.ctx.setTransform(this.dpr * this.cam.zoom, 0, 0, this.dpr * this.cam.zoom, this.dpr * this.cam.x, this.dpr * this.cam.y);
        render();
        this.ctx = saved;
        Object.assign(L, { key: full, camKey, time: now, cam: { x: this.cam.x, y: this.cam.y, zoom: this.cam.zoom } });
      }
      const c = this.ctx, s = this.cam.zoom / L.cam.zoom;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(L.cv, (this.cam.x - L.cam.x * s) * this.dpr, (this.cam.y - L.cam.y * s) * this.dpr, L.cv.width * s, L.cv.height * s);
      c.restore();
    }
    resetCaches() { this.layers.forEach((L) => { L.key = ''; L.time = 0; }); } // redraw on the next frame

    // ---------------------------------------------------------------- input
    bindInput() {
      const c = this.canvas;
      let drag = null;
      c.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y, moved: false }; });
      window.addEventListener('mousemove', (e) => {
        if (drag) {
          const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
          this.cam.x = drag.cx + dx; this.cam.y = drag.cy + dy;
        } else if (e.target === c) {
          const r = c.getBoundingClientRect();
          this.hover = this.pick(e.clientX - r.left, e.clientY - r.top);
          c.style.cursor = this.hover ? 'pointer' : 'grab';
        }
      });
      window.addEventListener('mouseup', (e) => {
        if (drag && !drag.moved && e.target === c) {
          const r = c.getBoundingClientRect();
          const hit = this.pick(e.clientX - r.left, e.clientY - r.top);
          this.selected = hit; this.app.ui.select(hit);
        }
        drag = null;
      });
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = c.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
        const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        this.zoomAt(mx, my, f);
      }, { passive: false });
      // Safari trackpad pinch
      let gs = 1;
      c.addEventListener('gesturestart', (e) => { e.preventDefault(); gs = 1; });
      c.addEventListener('gesturechange', (e) => {
        e.preventDefault();
        const r = c.getBoundingClientRect();
        this.zoomAt(e.clientX - r.left, e.clientY - r.top, e.scale / gs); gs = e.scale;
      });
      // touch: one-finger pan
      let tp = null;
      c.addEventListener('touchstart', (e) => { if (e.touches.length === 1) tp = { x: e.touches[0].clientX, y: e.touches[0].clientY, cx: this.cam.x, cy: this.cam.y }; }, { passive: true });
      c.addEventListener('touchmove', (e) => { if (tp && e.touches.length === 1) { this.cam.x = tp.cx + e.touches[0].clientX - tp.x; this.cam.y = tp.cy + e.touches[0].clientY - tp.y; } }, { passive: true });
    }
    zoomAt(mx, my, f) {
      const z0 = this.cam.zoom, z = WS.U.clamp(z0 * f, 0.25, 4);
      this.cam.x = mx - ((mx - this.cam.x) * z) / z0; this.cam.y = my - ((my - this.cam.y) * z) / z0; this.cam.zoom = z;
    }
    // ---------------------------------------------------------------- primitives
    poly(pts, fill, stroke, lw) {
      const c = this.ctx;
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) c.lineTo(pts[k][0], pts[k][1]);
      c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
    }
    quadTop(x0, y0, x1, y1, z, fill, stroke, lw) { const P = this.P.bind(this); this.poly([P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)], fill, stroke, lw); }
    box(x0, y0, z0, x1, y1, z1, base, o = {}) {
      const P = this.P.bind(this);
      this.poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], o.left || shade(base, -0.18), o.stroke, o.lw);
      this.poly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], o.right || shade(base, -0.38), o.stroke, o.lw);
      this.poly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], o.top || shade(base, 0.08), o.stroke, o.lw);
    }
    line(a, b, color, lw) { const c = this.ctx; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.strokeStyle = color; c.lineWidth = lw || 1; c.stroke(); }
    glow(x, y, z, r, color, a) {
      const c = this.ctx, [px, py] = this.P(x, y, z);
      const gr = c.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, rgba(color, a)); gr.addColorStop(1, rgba(color, 0));
      c.fillStyle = gr; c.fillRect(px - r, py - r, r * 2, r * 2);
    }
    text(s, x, y, z, o = {}) {
      const c = this.ctx, [px, py] = this.P(x, y, z);
      c.font = `${o.weight || 600} ${o.size || 11}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif`;
      c.textAlign = o.align || 'center'; c.textBaseline = 'middle';
      if (o.bg) {
        const w = c.measureText(s).width + 10, h = (o.size || 11) + 6;
        c.fillStyle = o.bg; roundRect(c, px - (o.align === 'left' ? 5 : w / 2), py - h / 2, w, h, 4); c.fill();
      }
      c.fillStyle = o.color || '#e2e8f0'; c.fillText(s, px, py);
    }
    // rectangles and discs lying in a vertical plane: faceY on y = const (left-facing), faceX on x = const (right-facing)
    faceY(y, xa, xb, za, zb, fill, stroke) { const P = this.P.bind(this); this.poly([P(xa, y, za), P(xb, y, za), P(xb, y, zb), P(xa, y, zb)], fill, stroke); }
    faceX(x, ya, yb, za, zb, fill, stroke) { const P = this.P.bind(this); this.poly([P(x, ya, za), P(x, yb, za), P(x, yb, zb), P(x, ya, zb)], fill, stroke); }
    discY(cx, y, cz, r, rz, fill) { const pts = []; for (let k = 0; k < 14; k++) { const a = (k * Math.PI) / 7; pts.push(this.P(cx + r * Math.cos(a), y, cz + rz * Math.sin(a))); } this.poly(pts, fill); }
    discX(x, cy, cz, r, rz, fill) { const pts = []; for (let k = 0; k < 14; k++) { const a = (k * Math.PI) / 7; pts.push(this.P(x, cy + r * Math.cos(a), cz + rz * Math.sin(a))); } this.poly(pts, fill); }
    wheelY(cx, y, cz, r, rz) { this.discY(cx, y, cz, r, rz, '#0b0f17'); this.discY(cx, y + 0.001, cz, r * 0.45, rz * 0.45, '#64748b'); }
    wheelX(x, cy, cz, r, rz) { this.discX(x, cy, cz, r, rz, '#05080e'); this.discX(x + 0.001, cy, cz, r * 0.45, rz * 0.45, '#475569'); }

    // Plastic storage tote: ribbed walls, rolled rim, hand-hold slots and an open top showing the inside.
    tote(x0, y0, x1, y1, z0, h, col, o = {}) {
      const P = this.P.bind(this), c = this.ctx, zt = z0 + h, zr = zt - Math.min(0.18, h * 0.2);
      this.box(x0, y0, z0, x1, y1, zr, col);
      const rib = shade(col, -0.42);
      for (let k = 1; k < 4; k++) { const xx = x0 + ((x1 - x0) * k) / 4; this.line(P(xx, y1, z0 + 0.08), P(xx, y1, zr), rib, 0.8); }
      for (let k = 1; k < 3; k++) { const yy = y0 + ((y1 - y0) * k) / 3; this.line(P(x1, yy, z0 + 0.08), P(x1, yy, zr), rib, 0.8); }
      this.box(x0 - 0.015, y0 - 0.015, zr, x1 + 0.015, y1 + 0.015, zt, shade(col, 0.14), { top: shade(col, 0.25) });
      const hy = h * 0.14, mx = (x0 + x1) / 2, my = (y0 + y1) / 2, sx = (x1 - x0) * 0.16, sy = (y1 - y0) * 0.16;
      this.faceY(y1 + 0.002, mx - sx, mx + sx, zr - 0.06 - hy, zr - 0.06, 'rgba(5,8,14,0.75)');
      this.faceX(x1 + 0.002, my - sy, my + sy, zr - 0.06 - hy, zr - 0.06, 'rgba(5,8,14,0.75)');
      if (o.closed) return;
      // inside: far walls and floor, clipped to the opening
      const i = 0.045, ix0 = x0 + i, iy0 = y0 + i, ix1 = x1 - i, iy1 = y1 - i, zf = z0 + 0.1;
      c.save();
      c.beginPath(); for (const p of [P(ix0, iy0, zt), P(ix1, iy0, zt), P(ix1, iy1, zt), P(ix0, iy1, zt)]) c.lineTo(p[0], p[1]); c.closePath(); c.clip();
      this.faceY(iy0, ix0, ix1, zf, zt, shade(col, -0.5));
      this.faceX(ix0, iy0, iy1, zf, zt, shade(col, -0.3));
      this.quadTop(ix0, iy0, ix1, iy1, zf, shade(col, -0.62));
      if (o.contents) o.contents(zf, zt);
      c.restore();
    }
    // Corrugated carton with a tape strip and, once labelled, a white shipping label.
    parcel(x0, y0, x1, y1, z0, h, o = {}) {
      const zt = z0 + h, my = (y0 + y1) / 2, tw = Math.min(0.06, (y1 - y0) * 0.15);
      this.box(x0, y0, z0, x1, y1, zt, '#b8875a', { left: '#a87a4f', right: '#8a623f', top: '#d2a676' });
      this.quadTop(x0, my - tw, x1, my + tw, zt, '#e6c79c');
      this.faceX(x1 + 0.001, my - tw, my + tw, zt - h * 0.35, zt, '#c9a274');
      if (o.label) this.faceY(y1 + 0.002, x0 + (x1 - x0) * 0.45, x1 - (x1 - x0) * 0.1, z0 + h * 0.2, z0 + h * 0.75, '#f8fafc');
    }
    // Blue customer order tote; fill (0..1) shows how much of the order is already in it.
    orderTote(x, y, z, fill, s = 1) {
      const w = 0.22 * s, d = 0.28 * s;
      this.tote(x - w, y - d, x + w, y + d, z, 0.85 * s, '#2563eb', {
        contents: (zf) => {
          const n = Math.ceil(Math.min(1, fill) * 4);
          for (let k = 0; k < n; k++) {
            const ya = y - d + 0.06 + ((2 * d - 0.12) * (k >> 1)) / 2, xa = x - w + 0.05 + ((2 * w - 0.1) * (k & 1)) / 2;
            const hue = (k * 97 + 30) % 360;
            this.box(xa + 0.01, ya + 0.01, zf, xa + (2 * w - 0.1) / 2 - 0.01, ya + (2 * d - 0.12) / 2 - 0.01, zf + 0.45 * s, '#888', { top: `hsl(${hue},55%,64%)`, left: `hsl(${hue},50%,52%)`, right: `hsl(${hue},45%,40%)` });
          }
        },
      });
    }

    // ---------------------------------------------------------------- frame
    // Background and camera, then the storage type's scene, then labels.
    draw(alpha) {
      const c = this.ctx;
      this.t = performance.now() / 1000;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const bg = c.createLinearGradient(0, 0, 0, this.h);
      bg.addColorStop(0, '#0a0f1a'); bg.addColorStop(1, '#121b2b');
      c.fillStyle = bg; c.fillRect(0, 0, this.w, this.h);
      c.setTransform(this.dpr * this.cam.zoom, 0, 0, this.dpr * this.cam.zoom, this.dpr * this.cam.x, this.dpr * this.cam.y);
      this.drawScene(alpha);
      if (this.opts.labels) this.drawLabels();
    }

    // ---------------------------------------------------------------- battery robots
    // Overlays for types with robots on a floor (CubeFlow, PodSwarm, StackPilot).
    // Planned route of every moving robot, from where it is drawn now, at height z.
    drawPaths(alpha, z = 0) {
      const sim = this.sim, P = this.P.bind(this), c = this.ctx;
      for (const r of sim.fleet) {
        if (!r.path || !r.op || r.op.op !== 'move') continue;
        const x = r.prx + (r.rx - r.prx) * alpha, y = r.pry + (r.ry - r.pry) * alpha;
        const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === r.id, col = STATE_COLORS[r.displayState];
        c.beginPath();
        let p = P(x + 0.5, y + 0.5, z + 0.05); c.moveTo(p[0], p[1]);
        for (let k = r.pi + 1; k < r.path.length; k++) { p = P(r.path[k].x + 0.5, r.path[k].y + 0.5, z + 0.05); c.lineTo(p[0], p[1]); }
        c.strokeStyle = col; c.globalAlpha = sel ? 0.95 : 0.5; c.lineWidth = sel ? 3 : 1.6; c.setLineDash(sel ? [] : [5, 4]); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
        const e = r.path[r.path.length - 1];
        this.quadTop(e.x + 0.3, e.y + 0.3, e.x + 0.7, e.y + 0.7, z + 0.05, null, col, 1.5);
      }
    }
    // Cells each robot has reserved ahead (fleet manager), at height z.
    drawClaims(z) {
      const g = this.sim.grid;
      for (const r of this.sim.fleet) {
        const col = STATE_COLORS[r.displayState];
        for (const i of r.claims) {
          const x = g.cx(i), y = g.cy(i);
          if (x === r.x && y === r.y) continue;
          this.quadTop(x + 0.12, y + 0.12, x + 0.88, y + 0.88, z + 0.02, rgba(col, 0.18), rgba(col, 0.55), 1);
        }
      }
    }
    // Name tag at height z and, when low, a battery bar above it.
    robotTag(r, cx, cy, z, bg) {
      this.text(r.name, cx, cy, z, { size: 9, color: '#0f172a', weight: 800, bg });
      if (r.battery >= 30) return;
      const [bx, by] = this.P(cx, cy, z + 1.1), c = this.ctx;
      c.fillStyle = '#0f172a'; c.fillRect(bx - 11, by - 3, 22, 6);
      c.fillStyle = r.battery < 15 ? '#ef4444' : '#facc15'; c.fillRect(bx - 10, by - 2, (20 * r.battery) / 100, 4);
    }

    // ---------------------------------------------------------------- tote and conveyor
    drawBin(x, y, z, binId, o = {}) {
      const inv = this.sim.inv, b = binId ? inv.binById.get(binId) : null;
      const col = o.color || (this.opts.heat && b ? CLASS_COLORS[inv.binClass(b)] : '#64748b');
      const w = o.w || 0.36, d = o.d || 0.3;
      if (!(o.open && b)) { this.tote(x - w, y - d, x + w, y + d, z, 0.95, col); return; }
      // open bin at the pick face: compartments with the goods in them
      const n = b.ncomp, P = this.P.bind(this), zt = z + 0.95, cw = (2 * w - 0.1) / n, cx = (k) => x - w + 0.05 + cw * k;
      this.tote(x - w, y - d, x + w, y + d, z, 0.95, col, {
        contents: (zf) => {
          for (let k = 0; k < n; k++) {
            const cp = b.comps[k];
            if (!cp.gtin || cp.qty <= 0) continue;
            const hue = (parseInt(cp.gtin.slice(7, 12), 10) * 47) % 360, pc = `hsl(${hue},50%,52%)`;
            const rows = cp.qty > 1 ? 2 : 1, rd = (2 * d - 0.14) / rows;
            for (let j = 0; j < rows; j++) {
              const ya = y - d + 0.07 + rd * j;
              this.box(cx(k) + 0.03, ya + 0.02, zf, cx(k + 1) - 0.03, ya + rd - 0.02, zf + 0.55, '#888', { top: `hsl(${hue},55%,62%)`, left: pc, right: `hsl(${hue},45%,38%)` });
            }
          }
          for (let k = 1; k < n; k++) this.faceX(cx(k), y - d + 0.05, y + d - 0.05, zf, zt - 0.05, shade(col, -0.2));
        },
      });
      if (o.hl >= 0 && o.hl < n) {
        const a = 0.6 + 0.4 * Math.sin(this.t * 8);
        this.quadTop(cx(o.hl), y - d + 0.05, cx(o.hl + 1), y + d - 0.05, zt + 0.01, `rgba(74,222,128,${(a * 0.3).toFixed(2)})`, `rgba(74,222,128,${a.toFixed(2)})`, 2);
      }
    }
    conveyor(pts, width, z, color) {
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k], hw = width / 2;
        const x0 = Math.min(a.x, b.x) - hw, x1 = Math.max(a.x, b.x) + hw, y0 = Math.min(a.y, b.y) - hw, y1 = Math.max(a.y, b.y) + hw;
        this.box(x0, y0, 0, x1, y1, z, color || '#334155', { top: '#1f2937' });
        // rollers
        const P = this.P.bind(this), along = a.x !== b.x;
        const len = along ? x1 - x0 : y1 - y0;
        for (let s = 0.15; s < len; s += 0.25) {
          if (along) this.line(P(x0 + s, y0 + 0.05, z), P(x0 + s, y1 - 0.05, z), '#475569', 1);
          else this.line(P(x0 + 0.05, y0 + s, z), P(x1 - 0.05, y0 + s, z), '#475569', 1);
        }
      }
    }

  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }

  WS.IsoView = IsoView;
  WS.ISO = { TW, TH, LV };
  WS.STATE_COLORS = STATE_COLORS;
  WS.CLASS_COLORS = CLASS_COLORS;
  WS.roundRect = roundRect;
  WS.shade = shade;
  WS.rgba = rgba;
})((globalThis.WS = globalThis.WS || {}));
