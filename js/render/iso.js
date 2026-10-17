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
          this.poly([P(x + 0.07, g.D, z + 0.06), P(x + 0.93, g.D, z + 0.06), P(x + 0.93, g.D, z + 0.94), P(x + 0.07, g.D, z + 0.94)], shade(col, -0.25));
          this.poly([P(x + 0.3, g.D, z + 0.55), P(x + 0.7, g.D, z + 0.55), P(x + 0.7, g.D, z + 0.75), P(x + 0.3, g.D, z + 0.75)], 'rgba(226,232,240,0.35)');
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
          this.poly([P(g.W, y + 0.07, z + 0.06), P(g.W, y + 0.93, z + 0.06), P(g.W, y + 0.93, z + 0.94), P(g.W, y + 0.07, z + 0.94)], shade(col, -0.45));
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
                this.quadTop(x + 0.08, y + 0.08, x + 0.92, y + 0.92, Z, col);
                this.quadTop(x + 0.2, y + 0.2, x + 0.8, y + 0.8, Z, shade(col, -0.15));
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
      this.box(x - w, y - d, z, x + w, y + d, z + 0.95, col);
      if (o.open && b) {
        // open bin: compartments with goods
        const n = b.ncomp, P = this.P.bind(this);
        this.quadTop(x - w + 0.04, y - d + 0.04, x + w - 0.04, y + d - 0.04, z + 0.95, '#1e293b');
        for (let k = 0; k < n; k++) {
          const cx0 = x - w + 0.05 + ((2 * w - 0.1) * k) / n, cx1 = x - w + 0.05 + ((2 * w - 0.1) * (k + 1)) / n;
          const c = b.comps[k];
          if (c.gtin && c.qty > 0) {
            const hue = (parseInt(c.gtin.slice(7, 12), 10) * 47) % 360;
            this.quadTop(cx0 + 0.02, y - d + 0.07, cx1 - 0.02, y + d - 0.07, z + 0.75, `hsl(${hue},55%,${55}%)`);
          }
          if (o.hl === k) {
            const a = 0.6 + 0.4 * Math.sin(this.t * 8);
            this.quadTop(cx0, y - d + 0.05, cx1, y + d - 0.05, z + 0.96, `rgba(74,222,128,${(a * 0.35).toFixed(2)})`, `rgba(74,222,128,${a.toFixed(2)})`, 2);
          }
          if (k > 0) this.line(P(cx0, y - d + 0.04, z + 0.95), P(cx0, y + d - 0.04, z + 0.95), '#94a3b8', 1);
        }
      }
    }
    drawOperator(x, y, active, color) {
      const c = this.ctx, [px, py] = this.P(x, y, 0);
      const bob = active ? Math.sin(this.t * 7) * 1.5 : 0;
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(px, py, 11, 5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1e293b'; roundRect(c, px - 6, py - 22, 5, 22, 2); c.fill(); roundRect(c, px + 1, py - 22, 5, 22, 2); c.fill();
      c.fillStyle = color || '#f97316'; roundRect(c, px - 8, py - 42 + bob * 0.3, 16, 22, 5); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.75)'; c.fillRect(px - 8, py - 33 + bob * 0.3, 16, 2.5);
      c.strokeStyle = color || '#f97316'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(px - 7, py - 38); c.lineTo(px - 12, py - 30 - (active ? 6 + bob * 3 : 0)); c.stroke();
      c.beginPath(); c.moveTo(px + 7, py - 38); c.lineTo(px + 12, py - 30 - (active ? 6 - bob * 3 : 0)); c.stroke();
      c.lineCap = 'butt';
      c.fillStyle = '#f1c27d'; c.beginPath(); c.arc(px, py - 49 + bob * 0.3, 6.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#facc15'; c.beginPath(); c.arc(px, py - 51 + bob * 0.3, 6.8, Math.PI, 0); c.fill();
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
        add(x0 + y0, () => {
          this.box(x0, y0, 0, x1, y1, CZ, '#3b4658', { top: '#252f3e' });
          const P = this.P.bind(this);
          this.poly([P(x0, y1, CZ), P(x1, y1, CZ), P(x1, y1, CZ - 0.25), P(x0, y1, CZ - 0.25)], '#facc15');
          if (!front) this.poly([P(x1, y0, CZ), P(x1, y1, CZ), P(x1, y1, CZ - 0.25), P(x1, y0, CZ - 0.25)], '#d4a90f');
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
          // operator HMI screen
          const sx = front ? p.drop.x + 1.75 : g.W + 1.9, sy = front ? g.D + 1.95 : p.drop.y + 1.75;
          this.box(sx - 0.03, sy - 0.03, 0, sx + 0.03, sy + 0.03, 3.4, '#475569');
          this.box(sx - 0.25, sy - 0.05, 3.4, sx + 0.25, sy + 0.05, 4.5, '#0f172a', { left: p.job ? '#0ea5e9' : '#1e293b' });
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
                this.box(q.x - 0.22, q.y - 0.28, CZ, q.x + 0.22, q.y + 0.28, CZ + 0.85, '#2563eb');
                const fill = picked / units;
                if (fill > 0) this.quadTop(q.x - 0.18, q.y - 0.24, q.x + 0.18, q.y + 0.24, CZ + 0.85, `rgba(251,191,36,${(0.3 + fill * 0.6).toFixed(2)})`);
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
              this.box(px, yy, 0, px + 1.2, yy + 1.2, 0.4, '#a16207');
              const n = Math.max(0, Math.min(8, open - k * 8));
              for (let j = 0; j < n; j++) {
                const cx = px + 0.05 + (j % 2) * 0.56, cy = yy + 0.05 + (((j >> 1) % 2) * 0.56), cz = 0.4 + Math.floor(j / 4) * 1.1;
                this.box(cx, cy, cz, cx + 0.53, cy + 0.53, cz + 1.05, '#c8a46b');
              }
            }
          });
        }
      }

      // pack stations
      for (const pk of oms.packers) {
        const q = L.packerPos(pk.idx);
        add(q.x + q.y, () => {
          this.box(q.x - 1.0, q.y - 0.55, 0, q.x + 1.0, q.y + 0.55, 2.1, '#475569', { top: '#cbd5e1' });
          this.box(q.x + 0.55, q.y - 0.45, 2.1, q.x + 0.9, q.y - 0.1, 2.7, '#e2e8f0'); // label printer
          if (pk.cur) {
            const f = pk.t / pk.dur;
            if (f < 0.6) this.box(q.x - 0.5, q.y - 0.3, 2.1, q.x - 0.05, q.y + 0.3, 2.95, '#2563eb');
            this.box(q.x - 0.0, q.y - 0.25, 2.1, q.x + 0.45, q.y + 0.25, 2.1 + Math.min(1, f * 2) * 0.8, '#b08850');
            if (f > 0.8) this.quadTop(q.x + 0.05, q.y - 0.12, q.x + 0.35, q.y + 0.12, 2.92, '#fff');
          }
          for (let k = 0; k < Math.min(pk.queue.length, 4); k++) this.box(q.x - 0.22, q.y - 1.3 + k * 0.0, 1.6 + k * 0.9, q.x + 0.22, q.y - 0.75, 2.4 + k * 0.9, '#2563eb');
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
        this.box(tx + 4.6, d.y - 0.95, 0.6, tx + 5.8, d.y + 0.95, 5.2, carrierCol, { top: shade(carrierCol, 0.25) }); // cab
        this.box(tx, d.y - 1.0, 0.8, tx + 4.5, d.y + 1.0, 7.2, '#e5e7eb', { left: '#cbd5e1', right: '#94a3b8', top: '#f8fafc' });
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
          if (it.kind === 'tote') this.box(q.x - 0.2, q.y - 0.2, 1.6, q.x + 0.2, q.y + 0.2, 2.4, '#2563eb');
          else this.box(q.x - 0.18, q.y - 0.16, 1.4, q.x + 0.18, q.y + 0.16, 2.0, '#b08850', { top: '#d6b07a' });
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
        const x0 = x + 0.1, y0 = y + 0.1, x1 = x + 0.9, y1 = y + 0.9, zt = Z + 1.9;
        // winch bands & hanging bin
        if (r.winch > 0.02) {
          const lv = r.winch / bh; // levels below the robot's cavity floor
          const zb = Z + 1 - lv;
          if (this.opts.xray) {
            if (r.bin || r.op) {
              for (const [bx, by] of [[x + 0.22, y + 0.22], [x + 0.78, y + 0.22], [x + 0.22, y + 0.78], [x + 0.78, y + 0.78]]) this.line(P(bx, by, Z), P(bx, by, zb + 0.95), '#e2e8f0', 1);
            }
            if (r.bin) this.box(x + 0.12, y + 0.12, zb - 0.0, x + 0.88, y + 0.88, zb + 0.95, '#ffffff');
          } else {
            this.glow(x + 0.5, y + 0.5, Z, 26, '#f59e0b', 0.35);
          }
        }
        // shadow
        this.quadTop(x + 0.04, y + 0.12, x + 1.0, y + 1.04, Z + 0.01, 'rgba(0,0,0,0.28)');
        // carried bin peeks out below the body when fully hoisted
        if (r.bin && r.winch <= 0.02) this.box(x + 0.14, y + 0.14, Z + 0.05, x + 0.86, y + 0.86, Z + 0.5, '#64748b');
        // body
        this.box(x0, y0, Z + 0.35, x1, y1, zt, '#f1f5f9', { left: '#d6dde6', right: '#a9b4c2', top: '#f8fafc' });
        // wheels
        this.box(x0 + 0.05, y1 - 0.02, Z, x0 + 0.25, y1 + 0.0, Z + 0.4, '#1f2937');
        this.box(x1 - 0.25, y1 - 0.02, Z, x1 - 0.05, y1 + 0.0, Z + 0.4, '#1f2937');
        this.box(x1 - 0.02, y0 + 0.05, Z, x1 + 0.0, y0 + 0.25, Z + 0.4, '#111827');
        this.box(x1 - 0.02, y1 - 0.25, Z, x1 + 0.0, y1 - 0.05, Z + 0.4, '#111827');
        // state lid + LED strip
        this.quadTop(x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, zt, col);
        this.quadTop(x0 + 0.2, y0 + 0.2, x1 - 0.2, y1 - 0.2, zt, shade(col, 0.3));
        this.poly([P(x0 + 0.1, y1, zt - 0.25), P(x1 - 0.1, y1, zt - 0.25), P(x1 - 0.1, y1, zt - 0.4), P(x0 + 0.1, y1, zt - 0.4)], col);
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
