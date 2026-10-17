/* Isometric floor view. World units are grid cells (x, y) and bin levels (z).
 * Drawn every frame with painter's ordering; the X-ray bin matrix is cached
 * to an offscreen canvas and re-rendered only when stacks or camera change. */
(function (WS) {
  'use strict';
  const TW = 64, TH = 32, LV = 17;
  const STATE_COLORS = {
    IDLE: '#94a3b8', MOVING_TO_TARGET: '#38bdf8', DIGGING_BIN: '#f59e0b', TRANSPORTING_TO_PORT: '#22c55e',
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

  class IsoRenderer {
    constructor(canvas, app) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.app = app;
      this.cam = { x: 0, y: 0, zoom: 0.8 };
      this.opts = { xray: false, heat: false, paths: true, claims: true, labels: true };
      this.selected = null; this.hover = null;
      this.xcache = document.createElement('canvas'); this.xkey = ''; this.xtime = 0; this.xcam = null;
      this.t = 0;
      this.bindInput();
    }
    get sim() { return this.app.sim; }
    P(x, y, z) { return [((x - y) * TW) / 2, ((x + y) * TH) / 2 - z * LV]; }

    resize() {
      const r = this.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      this.w = r.width; this.h = r.height; this.dpr = dpr;
      this.canvas.width = Math.max(1, Math.round(r.width * dpr)); this.canvas.height = Math.max(1, Math.round(r.height * dpr));
      this.xkey = '';
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
    pick(sx, sy) {
      const sim = this.sim, g = sim.grid;
      // robots (projected centre)
      let best = null, bd = 22 * Math.max(1, this.cam.zoom);
      for (const r of sim.robots) {
        const [px, py] = this.P(r.rx + 0.5, r.ry + 0.5, g.Z + 1);
        const d = Math.hypot(this.cam.x + px * this.cam.zoom - sx, this.cam.y + py * this.cam.zoom - sy);
        if (d < bd) { bd = d; best = { kind: 'robot', id: r.id }; }
      }
      if (best) return best;
      const top = this.toWorld(sx, sy, g.Z);
      if (top.x >= 0 && top.y >= 0 && top.x < g.W && top.y < g.D) {
        const i = g.idx(Math.floor(top.x), Math.floor(top.y));
        const port = sim.ports.find((p) => g.idx(p.drop.x, p.drop.y) === i || g.idx(p.lift.x, p.lift.y) === i);
        if (port) return { kind: 'port', id: port.idx };
        return { kind: 'cell', id: i };
      }
      const f = this.toWorld(sx, sy, 1.5), L = sim.layout;
      for (const p of sim.ports) {
        if (p.face === 'front' && f.x >= p.drop.x && f.x <= p.drop.x + 4.6 && f.y >= g.D && f.y <= g.D + 2.8) return { kind: 'port', id: p.idx };
        if (p.face === 'right' && f.x >= g.W && f.x <= g.W + 2.8 && f.y >= p.drop.y - 0.2 && f.y <= p.drop.y + 2.2) return { kind: 'port', id: p.idx };
      }
      for (const pk of sim.oms.packers) { const q = L.packerPos(pk.idx); if (Math.abs(f.x - q.x) < 1.2 && Math.abs(f.y - q.y) < 1.2) return { kind: 'packer', id: pk.idx }; }
      const d = L.dock();
      if (f.x > d.x - 1 && f.x < d.x + 6 && Math.abs(f.y - d.y) < 1.6) return { kind: 'dock' };
      return null;
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
    draw(alpha) {
      const c = this.ctx, sim = this.sim, g = sim.grid;
      this.t = performance.now() / 1000;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const bg = c.createLinearGradient(0, 0, 0, this.h);
      bg.addColorStop(0, '#0a0f1a'); bg.addColorStop(1, '#121b2b');
      c.fillStyle = bg; c.fillRect(0, 0, this.w, this.h);
      c.setTransform(this.dpr * this.cam.zoom, 0, 0, this.dpr * this.cam.zoom, this.dpr * this.cam.x, this.dpr * this.cam.y);

      this.drawFloor();
      if (this.opts.xray) this.drawXray(); else this.drawGridSolid();
      this.drawTopSurface();
      this.drawStations();
      this.drawRobots(alpha);
      if (this.opts.labels) this.drawLabels();
    }

    drawFloor() {
      const g = this.sim.grid, L = this.sim.layout, d = L.dock();
      const x0 = -2, y0 = -2, x1 = d.x + 7, y1 = g.D + 8.5;
      const P = this.P.bind(this), c = this.ctx;
      this.poly([P(x0, y0, 0), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0)], '#1a2332');
      c.globalAlpha = 0.5;
      for (let x = Math.ceil(x0); x <= x1; x += 2) this.line(P(x, y0, 0), P(x, y1, 0), '#222d3f', 1);
      for (let y = Math.ceil(y0); y <= y1; y += 2) this.line(P(x0, y, 0), P(x1, y, 0), '#222d3f', 1);
      c.globalAlpha = 1;
      // grid shadow + safety walkway
      this.poly([P(-0.3, -0.3, 0), P(g.W + 0.6, -0.3, 0), P(g.W + 0.6, g.D + 0.6, 0), P(-0.3, g.D + 0.6, 0)], 'rgba(0,0,0,0.35)');
      const ys = g.D + 2.75;
      c.setLineDash([6, 6]);
      this.line(P(0, ys + 1.4, 0), P(g.W + 1.2, ys + 1.4, 0), 'rgba(250,204,21,0.45)', 2);
      this.line(P(g.W + 3.3, -0.5, 0), P(g.W + 3.3, g.D - 0.5, 0), 'rgba(250,204,21,0.45)', 2);
      c.setLineDash([]);
    }

    // Solid grid: aluminium frame with the outer bins visible through it.
    drawGridSolid() {
      const g = this.sim.grid, P = this.P.bind(this), Z = g.Z, inv = this.sim.inv;
      const portCells = new Set(); for (const p of g.ports) { portCells.add(g.idx(p.drop.x, p.drop.y)); portCells.add(g.idx(p.lift.x, p.lift.y)); }
      // left face y = D
      this.poly([P(0, g.D, 0), P(g.W, g.D, 0), P(g.W, g.D, Z), P(0, g.D, Z)], '#1f2937');
      for (let x = 0; x < g.W; x++) {
        const i = g.idx(x, g.D - 1);
        if (portCells.has(i)) { this.poly([P(x, g.D, 0), P(x + 1, g.D, 0), P(x + 1, g.D, Z), P(x, g.D, Z)], '#0b1220'); continue; }
        const s = g.stacks[i];
        for (let z = 0; z < s.length; z++) {
          const b = inv.binById.get(s[z]);
          const col = this.opts.heat ? CLASS_COLORS[inv.binClass(b)] : '#4a5a70';
          // tote seen through the frame: wall, lighter rim and a hand-hold slot
          this.faceY(g.D, x + 0.07, x + 0.93, z + 0.06, z + 0.94, shade(col, -0.25));
          this.faceY(g.D, x + 0.05, x + 0.95, z + 0.8, z + 0.94, shade(col, -0.05));
          this.faceY(g.D, x + 0.36, x + 0.64, z + 0.56, z + 0.7, 'rgba(5,8,14,0.6)');
        }
      }
      // right face x = W
      this.poly([P(g.W, 0, 0), P(g.W, g.D, 0), P(g.W, g.D, Z), P(g.W, 0, Z)], '#18212e');
      for (let y = 0; y < g.D; y++) {
        const i = g.idx(g.W - 1, y);
        if (portCells.has(i)) { this.poly([P(g.W, y, 0), P(g.W, y + 1, 0), P(g.W, y + 1, Z), P(g.W, y, Z)], '#070c16'); continue; }
        const s = g.stacks[i];
        for (let z = 0; z < s.length; z++) {
          const b = inv.binById.get(s[z]);
          const col = this.opts.heat ? CLASS_COLORS[inv.binClass(b)] : '#4a5a70';
          this.faceX(g.W, y + 0.07, y + 0.93, z + 0.06, z + 0.94, shade(col, -0.45));
          this.faceX(g.W, y + 0.05, y + 0.95, z + 0.8, z + 0.94, shade(col, -0.3));
          this.faceX(g.W, y + 0.36, y + 0.64, z + 0.56, z + 0.7, 'rgba(5,8,14,0.6)');
        }
      }
      // aluminium uprights and beams
      for (let x = 0; x <= g.W; x++) this.line(P(x, g.D, 0), P(x, g.D, Z), x % 4 === 0 ? '#9aa8b8' : '#6b7a8d', x % 4 === 0 ? 2 : 1);
      for (let y = 0; y <= g.D; y++) this.line(P(g.W, y, 0), P(g.W, y, Z), y % 4 === 0 ? '#8593a5' : '#566578', y % 4 === 0 ? 2 : 1);
      for (const z of [0, Z * 0.5, Z]) { this.line(P(0, g.D, z), P(g.W, g.D, z), '#9aa8b8', 1.5); this.line(P(g.W, 0, z), P(g.W, g.D, z), '#8593a5', 1.5); }
    }

    // X-ray: every bin of the [X][Y][Z] matrix, coloured by ABC class.
    drawXray() {
      const g = this.sim.grid, now = performance.now();
      const key = g.version + '|' + this.w + 'x' + this.h + '|' + this.opts.xray;
      const camKey = this.cam.x.toFixed(1) + ',' + this.cam.y.toFixed(1) + ',' + this.cam.zoom.toFixed(4);
      const stale = key !== this.xkey || camKey !== this.xcamKey;
      if (stale && (now - this.xtime > 180 || !this.xcam)) {
        this.renderXrayCache(); this.xkey = key; this.xcamKey = camKey; this.xtime = now;
        this.xcam = { x: this.cam.x, y: this.cam.y, zoom: this.cam.zoom };
      }
      const c = this.ctx, s = this.cam.zoom / this.xcam.zoom;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      const ox = (this.cam.x - this.xcam.x * s) * this.dpr, oy = (this.cam.y - this.xcam.y * s) * this.dpr;
      c.drawImage(this.xcache, ox, oy, this.xcache.width * s, this.xcache.height * s);
      c.restore();
    }
    renderXrayCache() {
      const cv = this.xcache, sim = this.sim, g = sim.grid, inv = sim.inv;
      cv.width = this.canvas.width; cv.height = this.canvas.height;
      const saved = this.ctx; const c = cv.getContext('2d'); this.ctx = c;
      c.setTransform(this.dpr * this.cam.zoom, 0, 0, this.dpr * this.cam.zoom, this.dpr * this.cam.x, this.dpr * this.cam.y);
      const P = this.P.bind(this);
      // ghost frame
      this.poly([P(0, g.D, 0), P(g.W, g.D, 0), P(g.W, 0, 0), P(0, 0, 0)], 'rgba(15,23,42,0.6)');
      for (let s = 0; s <= g.W + g.D - 2; s++) {
        for (let x = Math.max(0, s - g.D + 1); x <= Math.min(g.W - 1, s); x++) {
          const y = s - x, i = g.idx(x, y), st = g.stacks[i];
          for (let z = 0; z < st.length; z++) {
            const b = inv.binById.get(st[z]), cls = inv.binClass(b), col = b.requests.length ? '#ffffff' : CLASS_COLORS[cls];
            this.box(x + 0.09, y + 0.09, z + 0.04, x + 0.91, y + 0.91, z + 0.96, col, cls === 'E' && !b.requests.length ? { top: 'rgba(80,95,120,0.55)', left: 'rgba(55,65,85,0.5)', right: 'rgba(40,48,64,0.5)' } : {});
          }
        }
      }
      this.line(P(0, g.D, g.Z), P(g.W, g.D, g.Z), 'rgba(148,163,184,0.5)', 1);
      this.line(P(g.W, 0, g.Z), P(g.W, g.D, g.Z), 'rgba(148,163,184,0.5)', 1);
      for (const [x, y] of [[0, g.D], [g.W, g.D], [g.W, 0]]) this.line(P(x, y, 0), P(x, y, g.Z), 'rgba(148,163,184,0.5)', 1);
      this.ctx = saved;
    }

    drawTopSurface() {
      const sim = this.sim, g = sim.grid, Z = g.Z, P = this.P.bind(this), c = this.ctx, inv = sim.inv;
      const xray = this.opts.xray;
      if (!xray) this.poly([P(0, 0, Z), P(g.W, 0, Z), P(g.W, g.D, Z), P(0, g.D, Z)], '#aab6c4');
      const maxHeat = 40;
      for (let y = 0; y < g.D; y++) {
        for (let x = 0; x < g.W; x++) {
          const i = g.idx(x, y), t = g.type[i];
          if (t === WS.CELL.STORAGE) {
            if (!xray) {
              const h = g.stacks[i].length;
              if (h === Z) {
                const b = inv.binById.get(g.stacks[i][h - 1]);
                const col = this.opts.heat ? CLASS_COLORS[inv.binClass(b)] : '#5b6b80';
                // open top of a tote at the surface: rim around a dark interior
                this.quadTop(x + 0.08, y + 0.08, x + 0.92, y + 0.92, Z, col);
                this.quadTop(x + 0.15, y + 0.15, x + 0.85, y + 0.85, Z, shade(col, -0.55));
              } else {
                const dk = 0.12 + (0.55 * (Z - h)) / Z;
                this.quadTop(x + 0.08, y + 0.08, x + 0.92, y + 0.92, Z, `rgba(8,12,22,${(0.45 + dk).toFixed(2)})`);
              }
            }
            if (this.opts.heat) {
              const hv = Math.min(1, g.waitHeat[i] / maxHeat), pv = Math.min(1, g.passHeat[i] / 60);
              const v = Math.max(hv, pv * 0.6);
              if (v > 0.04) this.quadTop(x, y, x + 1, y + 1, Z + 0.01, `rgba(239,68,68,${(v * 0.7).toFixed(2)})`);
            }
          } else if (t === WS.CELL.PORT) {
            this.quadTop(x + 0.04, y + 0.04, x + 0.96, y + 0.96, Z, '#111827');
            c.save(); c.globalAlpha = 0.9;
            this.quadTop(x + 0.04, y + 0.04, x + 0.96, y + 0.96, Z, null, '#facc15', 2);
            c.restore();
            this.quadTop(x + 0.2, y + 0.2, x + 0.8, y + 0.8, Z, '#000');
          } else if (t === WS.CELL.CHARGER) {
            this.quadTop(x + 0.06, y + 0.06, x + 0.94, y + 0.94, Z, '#14532d');
            this.quadTop(x + 0.18, y + 0.18, x + 0.82, y + 0.82, Z, null, '#4ade80', 1.5);
          }
          // robot holding a winch down here: no-go cell
          const o = g.claim[i];
          if (o >= 0 && sim.robots[o].busy && sim.robots[o].x === x && sim.robots[o].y === y && t === WS.CELL.STORAGE) {
            const a = 0.45 + 0.35 * Math.sin(this.t * 6);
            this.quadTop(x + 0.02, y + 0.02, x + 0.98, y + 0.98, Z + 0.01, null, `rgba(239,68,68,${a.toFixed(2)})`, 2.5);
          }
        }
      }
      // rails
      const rail = xray ? 'rgba(148,163,184,0.35)' : '#d5dde6';
      for (let x = 0; x <= g.W; x++) this.line(P(x, 0, Z), P(x, g.D, Z), rail, xray ? 0.8 : 1.2);
      for (let y = 0; y <= g.D; y++) this.line(P(0, y, Z), P(g.W, y, Z), rail, xray ? 0.8 : 1.2);
      // charger posts on the back edge
      for (const ch of g.chargers) {
        this.box(ch.x + 0.25, -0.32, Z, ch.x + 0.75, -0.04, Z + 1.6, '#334155');
        const on = ch.robot >= 0 && sim.robots[ch.robot].state === 'CHARGING';
        this.glow(ch.x + 0.5, -0.18, Z + 1.3, 14, on ? '#4ade80' : '#22c55e', on ? 0.9 : 0.35);
      }
      // claims & column locks
      if (this.opts.claims) {
        for (const r of sim.robots) {
          const col = STATE_COLORS[r.displayState];
          for (const i of r.claims) {
            const x = g.cx(i), y = g.cy(i);
            if (x === r.x && y === r.y) continue;
            this.quadTop(x + 0.12, y + 0.12, x + 0.88, y + 0.88, Z + 0.02, rgba(col, 0.18), rgba(col, 0.55), 1);
          }
        }
      }
      if (this.hover && this.hover.kind === 'cell') {
        const x = g.cx(this.hover.id), y = g.cy(this.hover.id);
        this.quadTop(x, y, x + 1, y + 1, Z + 0.02, 'rgba(255,255,255,0.12)', '#fff', 1.5);
      }
      if (this.selected && this.selected.kind === 'cell') {
        const x = g.cx(this.selected.id), y = g.cy(this.selected.id);
        this.quadTop(x - 0.04, y - 0.04, x + 1.04, y + 1.04, Z + 0.02, 'rgba(56,189,248,0.18)', '#38bdf8', 2.5);
      }
    }

    // ---------------------------------------------------------------- stations
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
    // Warehouse operator in a hi-vis vest and hard hat. When active the arms alternate between
    // the work in front-left (pick) and front-right (put), with the head turning to follow.
    drawOperator(x, y, active, vest) {
      const c = this.ctx, [px, py] = this.P(x, y, 0);
      const s = active ? Math.sin(this.t * 4.5) : 0, look = s * 2.2;
      const skin = '#e0ac7e', shirt = '#2b3a55', trousers = '#1c2638';
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(px, py, 12, 5.5, 0, 0, Math.PI * 2); c.fill();
      // legs and safety boots
      c.fillStyle = trousers; roundRect(c, px - 6.2, py - 27, 5.6, 25, 2); c.fill(); roundRect(c, px + 0.6, py - 27, 5.6, 25, 2); c.fill();
      c.fillStyle = '#0b0f17'; c.beginPath(); c.ellipse(px - 3.6, py - 1.6, 4.2, 2.3, 0, 0, Math.PI * 2); c.ellipse(px + 3.6, py - 1.6, 4.2, 2.3, 0, 0, Math.PI * 2); c.fill();
      // torso: shirt, vest with reflective tape
      c.fillStyle = shirt; roundRect(c, px - 9, py - 47, 18, 23, 6); c.fill();
      c.fillStyle = vest; roundRect(c, px - 8.5, py - 45.5, 17, 20, 4); c.fill();
      c.fillStyle = 'rgba(232,238,245,0.92)'; c.fillRect(px - 8.5, py - 36, 17, 2.2); c.fillRect(px - 8.5, py - 31, 17, 2.2);
      c.fillRect(px - 5.5, py - 45.5, 2, 9.5); c.fillRect(px + 3.5, py - 45.5, 2, 9.5);
      // arms: rest at the sides, or reach out to the pick (left) and the put wall (right)
      const arm = (side, reach) => {
        const sx = px + side * 8, sy = py - 43;
        const hx = px + side * (10 + reach * 8), hy = py - 27 - reach * 16;
        const ex = (sx + hx) / 2 + side * 3, ey = (sy + hy) / 2 + 2;
        c.strokeStyle = shirt; c.lineWidth = 4.6; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.lineTo(hx, hy); c.stroke();
        c.fillStyle = skin; c.beginPath(); c.arc(hx, hy, 2.6, 0, Math.PI * 2); c.fill();
      };
      arm(-1, Math.max(0, s)); arm(1, Math.max(0, -s));
      c.lineCap = 'butt'; c.lineJoin = 'miter';
      // head: neck, face, ear, hard hat with brim
      c.fillStyle = skin; c.fillRect(px - 2.2, py - 50, 4.4, 4);
      c.beginPath(); c.arc(px + look * 0.4, py - 54, 6.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3b2a20'; c.beginPath(); c.arc(px + look * 0.4, py - 54.5, 6.2, Math.PI * 0.05, Math.PI * 0.95, true); c.fill();
      c.fillStyle = '#facc15'; c.beginPath(); c.arc(px + look * 0.4, py - 56, 6.9, Math.PI, 0); c.fill();
      c.fillStyle = '#eab308'; c.beginPath(); c.ellipse(px + look * 0.4, py - 56, 9, 2.2, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(px + look * 0.4 - 0.8, py - 62.5, 1.6, 6);
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

    drawStations() {
      const sim = this.sim, g = sim.grid, L = sim.layout, oms = sim.oms;
      const items = []; // painter's list for floor objects
      const add = (d, fn) => items.push({ d, fn });
      const CZ = 2.2; // conveyor height (levels)

      // takeaway conveyor + spurs
      const picks = sim.ports.filter((p) => p.kind === 'PICK');
      const lastPk = L.packerPos(oms.packers.length - 1);
      add(g.D + 2, () => {
        this.conveyor([{ x: 1.2, y: L.takeawayY }, { x: lastPk.x, y: L.takeawayY }], 0.5, 1.6);
        for (const p of picks) this.conveyor([{ x: L.spurX(p), y: L.slotPos(p, 0).y }, { x: L.spurX(p), y: L.takeawayY - 0.25 }], 0.45, 1.6);
        for (const pk of oms.packers) { const q = L.packerPos(pk.idx); this.conveyor([{ x: q.x, y: L.takeawayY + 0.25 }, { x: q.x, y: q.y - 0.75 }], 0.45, 1.6); }
      });
      // parcel line to the dock
      add(g.D + 5, () => {
        for (const pk of oms.packers) this.conveyor(L.parcelRoute(pk.idx).slice(0, 2), 0.45, 1.4, '#2b3646');
        const r = L.parcelRoute(0);
        this.conveyor([{ x: L.packerPos(0).x, y: r[1].y }, r[2], r[3]], 0.45, 1.4, '#2b3646');
      });

      for (const p of sim.ports) {
        const pp = L.portPath(p), op = L.operatorPos(p), front = p.face === 'front';
        const x0 = front ? p.drop.x + 0.1 : g.W, y0 = front ? g.D : p.drop.y + 0.1;
        const x1 = front ? p.drop.x + 1.9 : g.W + 1.75, y1 = front ? g.D + 1.75 : p.drop.y + 1.9;
        // anti-fatigue mat where the operator stands
        add(op.x + op.y - 1.2, () => this.quadTop(op.x - 0.55, op.y - 0.45, op.x + 0.55, op.y + 0.45, 0.02, '#10161f', '#2a3546', 1));
        add(x0 + y0, () => {
          this.box(x0, y0, 0, x1, y1, CZ, '#3b4658', { top: '#252f3e' });
          // kick plate, access panel and black/yellow hazard edge along the working side
          if (front) { this.faceY(y1 + 0.002, x0 + 0.15, x1 - 0.15, 0.3, CZ - 0.5, '#344052', '#4b5a70'); this.faceY(y1 + 0.002, x0, x1, 0, 0.22, '#1f2733'); }
          else { this.faceX(x1 + 0.002, y0 + 0.15, y1 - 0.15, 0.3, CZ - 0.5, '#2c3746', '#435064'); this.faceX(x1 + 0.002, y0, y1, 0, 0.22, '#1a212c'); }
          for (let k = 0; k < 12; k++) {
            const a = k / 12, b2 = (k + 1) / 12, fill = k % 2 ? '#111827' : '#facc15';
            if (front) this.faceY(y1 + 0.003, x0 + (x1 - x0) * a, x0 + (x1 - x0) * b2, CZ - 0.25, CZ, fill);
            else this.faceX(x1 + 0.003, y0 + (y1 - y0) * a, y0 + (y1 - y0) * b2, CZ - 0.25, CZ, k % 2 ? '#0b1220' : '#d4a90f');
          }
          // bins on the port conveyor
          p.inQ.forEach((q, k) => {
            const f = Math.min(1, q.t / sim.cfg.conveyorStep), a = pp.entry[0], b = pp.entry[1];
            const t = k === 0 ? f : 0;
            this.drawBin(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, CZ, q.bin.id, { w: front ? 0.3 : 0.26, d: front ? 0.26 : 0.3 });
          });
          if (p.pick) {
            const ln = p.currentLine;
            this.drawBin(pp.pick.x, pp.pick.y, CZ, p.pick.id, { open: true, hl: ln ? ln.comp : -1, w: front ? 0.42 : 0.3, d: front ? 0.3 : 0.42 });
            if (ln) this.glow(pp.pick.x, pp.pick.y, CZ + 1, 30, '#4ade80', 0.25);
          }
          p.outQ.forEach((b, k) => { const e = pp.exit[k === 0 ? 1 : 0]; this.drawBin(e.x, e.y, CZ, b.id, { w: front ? 0.3 : 0.26, d: front ? 0.26 : 0.3 }); });
          // operator HMI screen on a post, showing the pick instruction when a job is open
          const sx = front ? p.drop.x + 1.75 : g.W + 1.9, sy = front ? g.D + 1.95 : p.drop.y + 1.75;
          this.box(sx - 0.03, sy - 0.03, 0, sx + 0.03, sy + 0.03, 3.4, '#475569');
          this.box(sx - 0.28, sy - 0.06, 3.3, sx + 0.28, sy + 0.04, 4.6, '#0f172a');
          this.faceY(sy + 0.045, sx - 0.24, sx + 0.24, 3.4, 4.5, p.job ? '#0c4a6e' : '#111c2e');
          if (p.job) {
            this.faceY(sy + 0.05, sx - 0.2, sx + 0.05, 4.2, 4.38, '#e0f2fe');
            this.faceY(sy + 0.05, sx - 0.2, sx + 0.18, 3.85, 4.05, '#4ade80');
            this.faceY(sy + 0.05, sx - 0.2, sx + 0.1, 3.55, 3.7, '#7dd3fc');
          }
          // stack light: green = working, amber = waiting for bins, off = idle
          const lx = front ? x0 + 0.12 : g.W + 0.12, ly = front ? g.D + 0.12 : y0 + 0.12;
          this.box(lx - 0.04, ly - 0.04, CZ, lx + 0.04, ly + 0.04, CZ + 2.2, '#64748b');
          const starving = !p.job && !p.inQ.length && p.demand() > 0, lamps = [['#ef4444', false], ['#f59e0b', starving], ['#22c55e', !!p.job]];
          lamps.forEach(([lc, on], k) => {
            const z = CZ + 2.2 + k * 0.42;
            this.box(lx - 0.09, ly - 0.09, z, lx + 0.09, ly + 0.09, z + 0.4, on ? lc : shade(lc, -0.65), on ? { top: shade(lc, 0.4) } : {});
            if (on) this.glow(lx, ly, z + 0.2, 16, lc, 0.55);
          });
        });
        add(op.x + op.y + 0.5, () => this.drawOperator(op.x, op.y, !!(p.job && p.job.next < p.job.lines.length && p.mode === 'auto'), p.kind === 'PICK' ? '#f97316' : '#22c55e'));
        if (p.kind === 'PICK') {
          const s0 = L.slotPos(p, 0);
          add(s0.x + s0.y, () => {
            const wx0 = p.drop.x + 2.0, wx1 = p.drop.x + 4.2, wy0 = s0.y - 0.35, wy1 = s0.y + 0.35;
            this.box(wx0, wy0, 0, wx1, wy1, CZ - 0.1, '#334155');
            for (const xx of [wx0, wx1 - 0.08]) this.box(xx, wy0, CZ, xx + 0.08, wy0 + 0.08, 4.6, '#64748b');
            this.box(wx0, wy0, 4.5, wx1, wy0 + 0.1, 4.7, '#64748b');
            const ln = p.currentLine;
            p.slots.forEach((o, k) => {
              const q = L.slotPos(p, k);
              if (o) {
                const units = oms.units(o), picked = o.lines.reduce((s, l) => s + l.picked, 0);
                this.orderTote(q.x, q.y, CZ, picked / units);
              }
              const target = ln && ln.order === o;
              const lc = target ? '#4ade80' : o ? '#e2e8f0' : '#334155';
              this.box(q.x - 0.1, wy0, 4.15, q.x + 0.1, wy0 + 0.12, 4.4, lc);
              if (target) this.glow(q.x, wy0, 4.3, 26, '#4ade80', 0.65 + 0.3 * Math.sin(this.t * 9));
            });
          });
        } else {
          // supplier pallets awaiting decant
          const open = oms.receipts.filter((r) => r.status !== 'RECEIVED').reduce((s, r) => s + r.lines.length, 0);
          const px = g.W + 3.4, py = p.drop.y - 0.6;
          add(px + py, () => {
            for (let k = 0; k < 2; k++) {
              const yy = py + k * 1.6;
              // wooden pallet: deck boards on three blocks
              for (const bx of [0, 0.5, 1.0]) this.box(px + bx, yy, 0, px + bx + 0.2, yy + 1.2, 0.25, '#8a5a1c');
              for (let s2 = 0; s2 < 5; s2++) this.box(px, yy + s2 * 0.25, 0.25, px + 1.2, yy + s2 * 0.25 + 0.2, 0.4, '#b07a2e', { top: '#c9933f' });
              const n = Math.max(0, Math.min(8, open - k * 8));
              for (let j = 0; j < n; j++) {
                const cx = px + 0.05 + (j % 2) * 0.56, cy = yy + 0.05 + (((j >> 1) % 2) * 0.56), cz = 0.4 + Math.floor(j / 4) * 1.1;
                this.parcel(cx, cy, cz, cx + 0.53, cy + 0.53, 1.05);
              }
            }
          });
        }
      }

      // pack stations
      for (const pk of oms.packers) {
        const q = L.packerPos(pk.idx);
        add(q.x + q.y, () => {
          // queued totes on the spur behind the bench
          for (let k = Math.min(pk.queue.length, 3) - 1; k >= 0; k--) this.orderTote(q.x, q.y - 1.05 - k * 0.0, 1.6 + k * 0.85, 0.8, 0.9);
          // packing bench: steel frame, shelf with flat-packed cartons, light worktop
          for (const [lx, ly] of [[-0.95, -0.5], [0.87, -0.5], [-0.95, 0.42], [0.87, 0.42]]) this.box(q.x + lx, q.y + ly, 0, q.x + lx + 0.08, q.y + ly + 0.08, 1.9, '#64748b');
          this.box(q.x - 0.95, q.y - 0.5, 0.45, q.x + 0.95, q.y + 0.5, 0.55, '#475569');
          for (let k = 0; k < 4; k++) this.box(q.x - 0.85, q.y - 0.4, 0.55 + k * 0.12, q.x + 0.1, q.y + 0.4, 0.65 + k * 0.12, '#b8875a', { top: '#cfa271' });
          this.box(q.x - 1.0, q.y - 0.55, 1.9, q.x + 1.0, q.y + 0.55, 2.1, '#94a3b8', { top: '#e7dccb', left: '#cbd5e1' });
          // monitor on a pole, label printer, tape dispenser
          this.box(q.x - 0.85, q.y - 0.5, 2.1, q.x - 0.79, q.y - 0.44, 3.6, '#475569');
          this.box(q.x - 0.98, q.y - 0.52, 3.3, q.x - 0.5, q.y - 0.44, 4.3, '#0f172a');
          this.faceY(q.y - 0.435, q.x - 0.95, q.x - 0.53, 3.38, 4.22, pk.cur ? '#0c4a6e' : '#111c2e');
          this.box(q.x + 0.5, q.y - 0.45, 2.1, q.x + 0.92, q.y - 0.08, 2.75, '#e2e8f0', { top: '#f8fafc' });
          this.faceY(q.y - 0.079, q.x + 0.55, q.x + 0.87, 2.45, 2.55, '#0f172a');
          this.box(q.x + 0.55, q.y + 0.15, 2.1, q.x + 0.85, q.y + 0.35, 2.4, '#dc2626');
          this.discX(q.x + 0.851, q.y + 0.25, 2.45, 0.1, 0.22, '#d6b07a');
          if (pk.cur) {
            const f = pk.t / pk.dur;
            if (f < 0.6) this.orderTote(q.x - 0.45, q.y, 2.1, 1 - f / 0.6);
            const h = 0.25 + Math.min(1, f * 1.6) * 0.55;
            if (f < 0.6) this.tote(q.x - 0.05, q.y - 0.25, q.x + 0.45, q.y + 0.25, 2.1, h, '#b8875a');
            else this.parcel(q.x - 0.05, q.y - 0.25, q.x + 0.45, q.y + 0.25, 2.1, 0.8, { label: f > 0.8 });
          }
        });
        const opq = { x: q.x, y: q.y + 1.0 };
        add(opq.x + opq.y, () => this.drawOperator(opq.x, opq.y, !!pk.cur, '#38bdf8'));
      }

      // dock + truck
      const d = L.dock(), tr = oms.truck;
      add(d.x + d.y, () => {
        this.box(d.x - 0.9, d.y - 1.3, 0, d.x + 0.1, d.y + 1.3, 1.2, '#374151', { top: '#4b5563' });
        const off = tr.departing > 0 ? Math.pow(tr.departing, 2) * 0.25 : 0;
        const tx = d.x + 0.25 + off, carrierCol = { PCL: '#0ea5e9', EXP: '#ef4444', ECO: '#22c55e' }[tr.carrier.code];
        this.box(tx, d.y - 1.0, 0.8, tx + 4.5, d.y + 1.0, 7.2, '#e5e7eb', { left: '#cbd5e1', right: '#94a3b8', top: '#f8fafc' });
        for (const wx of [tx + 0.7, tx + 1.5]) this.wheelY(wx, d.y + 1.01, 0.75, 0.32, 0.75);
        this.box(tx + 4.6, d.y - 0.95, 0.6, tx + 5.8, d.y + 0.95, 5.2, carrierCol, { top: shade(carrierCol, 0.25) }); // cab
        this.faceY(d.y + 0.951, tx + 5.0, tx + 5.65, 3.4, 4.8, '#0f2236'); // side window
        this.faceX(tx + 5.801, d.y - 0.8, d.y + 0.8, 3.3, 4.9, '#13283e'); // windscreen
        this.faceX(tx + 5.802, d.y - 0.8, d.y + 0.8, 1.0, 1.5, '#1f2937'); // grille
        for (const yy of [d.y - 0.7, d.y + 0.7]) this.discX(tx + 5.803, yy, 1.25, 0.12, 0.25, '#fde68a');
        this.wheelY(tx + 5.2, d.y + 0.96, 0.75, 0.32, 0.75);
        const P = this.P.bind(this);
        this.poly([P(tx + 0.3, d.y + 1.0, 5.6), P(tx + 4.2, d.y + 1.0, 5.6), P(tx + 4.2, d.y + 1.0, 6.4), P(tx + 0.3, d.y + 1.0, 6.4)], carrierCol);
        const fill = Math.min(1, tr.parcels.length / sim.cfg.truckCapacity);
        this.text(`${tr.carrier.name} · ${tr.parcels.length}/${sim.cfg.truckCapacity}`, tx + 2.3, d.y + 1.0, 4.0, { size: 10, color: '#0f172a', weight: 700 });
        this.poly([P(tx + 0.3, d.y + 1.0, 1.2), P(tx + 0.3 + 3.9 * fill, d.y + 1.0, 1.2), P(tx + 0.3 + 3.9 * fill, d.y + 1.0, 1.7), P(tx + 0.3, d.y + 1.0, 1.7)], '#b08850');
      });

      // totes and parcels on conveyors
      for (const it of oms.conveyor) {
        const q = oms.posOnPath(it);
        add(q.x + q.y + 0.3, () => {
          if (it.kind === 'tote') this.orderTote(q.x, q.y, 1.6, 1, 0.85);
          else this.parcel(q.x - 0.18, q.y - 0.16, q.x + 0.18, q.y + 0.16, 1.4, 0.6, { label: true });
        });
      }
      items.sort((a, b) => a.d - b.d);
      for (const it of items) it.fn();
    }

    // ---------------------------------------------------------------- robots
    drawRobots(alpha) {
      const sim = this.sim, g = sim.grid, Z = g.Z, P = this.P.bind(this), bh = sim.cfg.binHeight;
      const list = sim.robots.map((r) => ({ r, x: r.prx + (r.rx - r.prx) * alpha, y: r.pry + (r.ry - r.pry) * alpha }));
      list.sort((a, b) => a.x + a.y - (b.x + b.y));
      // paths first, so robots sit on top
      if (this.opts.paths) {
        for (const { r, x, y } of list) {
          if (!r.path || !r.op || r.op.op !== 'move') continue;
          const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === r.id;
          const c = this.ctx, col = STATE_COLORS[r.displayState];
          c.beginPath();
          let p = P(x + 0.5, y + 0.5, Z + 0.05); c.moveTo(p[0], p[1]);
          for (let k = r.pi + 1; k < r.path.length; k++) { p = P(r.path[k].x + 0.5, r.path[k].y + 0.5, Z + 0.05); c.lineTo(p[0], p[1]); }
          c.strokeStyle = rgba(col, sel ? 0.95 : 0.45); c.lineWidth = sel ? 3 : 1.6; c.setLineDash(sel ? [] : [5, 4]); c.stroke(); c.setLineDash([]);
          const e = r.path[r.path.length - 1];
          this.quadTop(e.x + 0.3, e.y + 0.3, e.x + 0.7, e.y + 0.7, Z + 0.05, null, rgba(col, 0.9), 1.5);
        }
      }
      for (const { r, x, y } of list) {
        const col = STATE_COLORS[r.displayState];
        const x0 = x + 0.08, y0 = y + 0.08, x1 = x + 0.92, y1 = y + 0.92, zt = Z + 2.0;
        // winch bands & hanging bin
        if (r.winch > 0.02) {
          const lv = r.winch / bh; // levels below the robot's cavity floor
          const zb = Z + 1 - lv;
          if (this.opts.xray) {
            if (r.bin || r.op) {
              for (const [bx, by] of [[x + 0.22, y + 0.22], [x + 0.78, y + 0.22], [x + 0.22, y + 0.78], [x + 0.78, y + 0.78]]) this.line(P(bx, by, Z), P(bx, by, zb + 0.95), '#e2e8f0', 1);
            }
            if (r.bin) this.tote(x + 0.12, y + 0.12, x + 0.88, y + 0.88, zb, 0.95, '#ffffff', { closed: true });
          } else {
            this.glow(x + 0.5, y + 0.5, Z, 26, '#f59e0b', 0.35);
          }
        }
        // shadow
        this.quadTop(x + 0.04, y + 0.12, x + 1.0, y + 1.04, Z + 0.01, 'rgba(0,0,0,0.3)');
        // chassis: corner posts around the bin cavity; a hoisted bin sits in the cavity
        const zc = Z + 0.62, post = '#cbd5e1';
        this.box(x0, y0, Z + 0.12, x0 + 0.12, y0 + 0.12, zc, post);
        if (r.bin && r.winch <= 0.02) {
          const b = this.sim.inv.binById.get(r.bin);
          this.tote(x + 0.17, y + 0.17, x + 0.83, y + 0.83, Z + 0.08, 0.56, this.opts.heat && b ? CLASS_COLORS[this.sim.inv.binClass(b)] : '#64748b', { closed: true });
        } else this.box(x + 0.16, y + 0.16, Z + 0.3, x + 0.84, y + 0.84, zc, '#0b1220');
        this.box(x1 - 0.12, y0, Z + 0.12, x1, y0 + 0.12, zc, post);
        this.box(x0, y1 - 0.12, Z + 0.12, x0 + 0.12, y1, zc, post);
        this.box(x1 - 0.12, y1 - 0.12, Z + 0.12, x1, y1, zc, post);
        // two wheel sets: X wheels on the y-faces, Y wheels on the x-faces; the set not in use is lifted
        const lx = r.axis === 'x' ? 0 : 0.14, ly = r.axis === 'y' ? 0 : 0.14;
        for (const wx of [x0 + 0.23, x1 - 0.23]) this.wheelY(wx, y1 + 0.005, Z + 0.24 + lx, 0.11, 0.24);
        for (const wy of [y0 + 0.23, y1 - 0.23]) this.wheelX(x1 + 0.005, wy, Z + 0.24 + ly, 0.11, 0.24);
        // body shell with a dark bumper band, a state-coloured light strip and cooling vents
        this.box(x0, y0, zc, x1, y1, zt - 0.14, '#f1f5f9', { left: '#dfe5ec', right: '#b3bfcc', top: '#f8fafc' });
        this.faceY(y1 + 0.002, x0, x1, zc, zc + 0.16, '#334155');
        this.faceX(x1 + 0.002, y0, y1, zc, zc + 0.16, '#1f2937');
        this.faceY(y1 + 0.003, x0 + 0.08, x1 - 0.08, zt - 0.5, zt - 0.38, col);
        this.faceX(x1 + 0.003, y0 + 0.08, y1 - 0.08, zt - 0.5, zt - 0.38, shade(col, -0.25));
        for (let k = 0; k < 4; k++) { const vy = y0 + 0.25 + k * 0.1; this.line(P(x1 + 0.003, vy, zc + 0.3), P(x1 + 0.003, vy, zc + 0.62), '#8693a3', 1); }
        // lid: rounded-look top cap in the state colour
        this.box(x0 + 0.03, y0 + 0.03, zt - 0.14, x1 - 0.03, y1 - 0.03, zt, '#e2e8f0', { left: '#d3dae3', right: '#a5b1bf', top: col });
        this.quadTop(x0 + 0.2, y0 + 0.2, x1 - 0.2, y1 - 0.2, zt, shade(col, 0.3));
        if (r.displayState === 'WAITING_IN_TRAFFIC' || r.busy) this.glow(x + 0.5, y + 0.5, zt + 0.3, 22, col, 0.35 + 0.25 * Math.sin(this.t * 6));
        const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === r.id;
        if (sel) this.quadTop(x - 0.08, y - 0.08, x + 1.08, y + 1.08, Z + 0.02, null, '#38bdf8', 2.5);
        if (this.opts.labels) {
          this.text(r.name, x + 0.5, y + 0.5, zt + 0.02, { size: 9, color: '#0f172a', weight: 800 });
          if (r.battery < 30) {
            const [bx, by] = P(x + 0.5, y + 0.5, zt + 1.4), c = this.ctx;
            c.fillStyle = '#0f172a'; c.fillRect(bx - 11, by - 3, 22, 6);
            c.fillStyle = r.battery < 15 ? '#ef4444' : '#facc15'; c.fillRect(bx - 10, by - 2, (20 * r.battery) / 100, 4);
          }
          if (r.winch > 0.02 && !this.opts.xray) this.text('↓ ' + r.winch.toFixed(1) + ' m', x + 0.5, y + 0.5, zt + 1.6, { size: 9, color: '#fde68a', bg: 'rgba(15,23,42,0.75)' });
        }
      }
    }

    drawLabels() {
      const sim = this.sim, g = sim.grid, L = sim.layout;
      for (const p of sim.ports) {
        const pos = p.face === 'front' ? { x: p.drop.x + 1, y: g.D + 0.2 } : { x: g.W + 0.2, y: p.drop.y + 1 };
        const st = p.job ? (p.mode === 'manual' ? 'MANUAL' : 'ACTIVE') : p.inQ.length ? 'INBOUND' : 'WAITING';
        this.text(`${p.code} ${p.kind === 'PICK' ? 'PICK' : 'GOODS-IN'} · ${st}`, pos.x, pos.y, 6.2, { size: 10, bg: 'rgba(15,23,42,0.82)', color: p.kind === 'PICK' ? '#fdba74' : '#86efac' });
      }
      for (const pk of sim.oms.packers) {
        const q = L.packerPos(pk.idx);
        this.text(`${pk.name} · ${pk.queue.length} queued`, q.x, q.y, 4.6, { size: 10, bg: 'rgba(15,23,42,0.82)', color: '#7dd3fc' });
      }
      const d = L.dock();
      this.text('OUTBOUND DOCK', d.x - 0.4, d.y + 1.6, 1.5, { size: 10, bg: 'rgba(15,23,42,0.82)', color: '#e2e8f0' });
      this.text('GOODS RECEIVING', g.W + 4, (g.ports.find((p) => p.kind === 'GOODS_IN') || { drop: { y: 2 } }).drop.y + 1.4, 3.2, { size: 10, bg: 'rgba(15,23,42,0.82)', color: '#86efac' });
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }

  WS.IsoRenderer = IsoRenderer;
  WS.STATE_COLORS = STATE_COLORS;
  WS.CLASS_COLORS = CLASS_COLORS;
  WS.roundRect = roundRect;
})((globalThis.WS = globalThis.WS || {}));
