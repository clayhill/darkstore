/* Isometric view of the pod floor. Pods are drawn as rotatable prisms so a
 * pod visibly turns at the station to show the operator another face; drive
 * units, stored pods and the shared stations share one painter's list. */
(function (WS) {
  'use strict';
  const C = WS.CELL;
  const LEG = 0.9, TOP = 4.6, HALF = 0.42; // pod legs / top height (levels), half footprint (cells)
  const BODY = 0.62; // drive unit height
  const QUARTER = Math.PI / 2;
  const SIDE_N = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // local outward normal of pod face k

  class PodRenderer extends WS.IsoRenderer {
    constructor(canvas, app) {
      super(canvas, app);
      this.sprites = new Map(); // pod id → { key, zoom, cv } — pods at rest are blitted from these
      this.zoomSeen = 0; this.zoomAt0 = 0;
    }
    worldBounds() {
      const g = this.sim.grid, d = this.sim.layout.dock();
      const pts = [this.P(-1, -1, TOP + 3), this.P(d.x + 6, -1, 0), this.P(-1, g.D + 8, 0), this.P(d.x + 6, g.D + 8, 0), this.P(g.W + 1, -1, TOP + 3)];
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    }

    draw(alpha) {
      const c = this.ctx;
      this.t = performance.now() / 1000;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const bg = c.createLinearGradient(0, 0, 0, this.h);
      bg.addColorStop(0, '#0a0f1a'); bg.addColorStop(1, '#121b2b');
      c.fillStyle = bg; c.fillRect(0, 0, this.w, this.h);
      c.setTransform(this.dpr * this.cam.zoom, 0, 0, this.dpr * this.cam.zoom, this.dpr * this.cam.x, this.dpr * this.cam.y);
      this.drawFloor();
      this.drawPodFloor();
      if (this.opts.paths) this.drawPaths(alpha);
      const items = [];
      this.floorObjects(items, alpha);
      this.drawStations(items);
      if (this.opts.labels) this.drawLabels();
    }

    // ---------------------------------------------------------------- floor
    drawPodFloor() {
      const sim = this.sim, g = sim.grid, P = this.P.bind(this), c = this.ctx;
      this.poly([P(0, 0, 0), P(g.W, 0, 0), P(g.W, g.D, 0), P(0, g.D, 0)], '#232d3d');
      for (let y = 0; y < g.D; y++) {
        for (let x = 0; x < g.W; x++) {
          const i = g.idx(x, y), t = g.type[i];
          if (t === C.STORAGE) this.quadTop(x + 0.03, y + 0.03, x + 0.97, y + 0.97, 0, '#1c2533');
          else if (t === C.BLOCKED) this.quadTop(x, y, x + 1, y + 1, 0, '#141b27');
          else if (t === C.LANE) {
            this.quadTop(x + 0.04, y + 0.04, x + 0.96, y + 0.96, 0, '#2a2614');
            // chevrons pointing along the lane
            const p = sim.ports[g.laneOf[i]], dx = p.face === 'front' ? 1 : 0, dy = 1 - dx;
            const mx = x + 0.5, my = y + 0.5;
            this.line(P(mx - 0.2 * dx - 0.2 * dy, my - 0.2 * dy - 0.2 * dx, 0), P(mx + 0.1 * dx, my + 0.1 * dy, 0), 'rgba(250,204,21,0.55)', 2);
            this.line(P(mx + 0.1 * dx, my + 0.1 * dy, 0), P(mx - 0.2 * dx + 0.2 * dy, my - 0.2 * dy + 0.2 * dx, 0), 'rgba(250,204,21,0.55)', 2);
          } else if (t === C.PORT) {
            this.quadTop(x + 0.04, y + 0.04, x + 0.96, y + 0.96, 0, '#3a2f12');
            this.quadTop(x + 0.04, y + 0.04, x + 0.96, y + 0.96, 0, null, '#facc15', 2);
          } else if (t === C.CHARGER) {
            this.quadTop(x + 0.08, y + 0.08, x + 0.92, y + 0.92, 0, '#14532d');
            this.quadTop(x + 0.2, y + 0.2, x + 0.8, y + 0.8, 0, null, '#4ade80', 1.5);
          }
          if (t === C.STORAGE || t === C.HIGHWAY) {
            // fiducial sticker the robots navigate by
            this.quadTop(x + 0.44, y + 0.44, x + 0.56, y + 0.56, 0, '#64748b');
            this.quadTop(x + 0.47, y + 0.47, x + 0.53, y + 0.53, 0, '#1e293b');
          }
          if (this.opts.heat && (t === C.STORAGE || t === C.HIGHWAY)) {
            const v = Math.max(Math.min(1, g.waitHeat[i] / 40), Math.min(1, g.passHeat[i] / 60) * 0.6);
            if (v > 0.04) this.quadTop(x, y, x + 1, y + 1, 0.01, `rgba(239,68,68,${(v * 0.7).toFixed(2)})`);
          }
          if (g.podTarget[i] >= 0) this.quadTop(x + 0.1, y + 0.1, x + 0.9, y + 0.9, 0.01, null, 'rgba(167,139,250,0.7)', 1.5);
        }
      }
      // storage blocks outlined in yellow floor paint
      c.globalAlpha = 0.5;
      for (let y = 0; y < g.D; y++) for (let x = 0; x < g.W; x++) {
        if (g.type[g.idx(x, y)] !== C.STORAGE) continue;
        const edge = (nx, ny) => !g.inside(nx, ny) || g.type[g.idx(nx, ny)] !== C.STORAGE;
        if (edge(x, y - 1)) this.line(P(x, y, 0), P(x + 1, y, 0), '#ca8a04', 1.2);
        if (edge(x, y + 1)) this.line(P(x, y + 1, 0), P(x + 1, y + 1, 0), '#ca8a04', 1.2);
        if (edge(x - 1, y)) this.line(P(x, y, 0), P(x, y + 1, 0), '#ca8a04', 1.2);
        if (edge(x + 1, y)) this.line(P(x + 1, y, 0), P(x + 1, y + 1, 0), '#ca8a04', 1.2);
      }
      c.globalAlpha = 1;
      // safety fence along the back and left of the robot area, charger posts on the back wall
      this.poly([P(0, 0, 0), P(g.W, 0, 0), P(g.W, 0, 3.2), P(0, 0, 3.2)], 'rgba(148,163,184,0.10)');
      this.poly([P(0, 0, 0), P(0, g.D, 0), P(0, g.D, 3.2), P(0, 0, 3.2)], 'rgba(148,163,184,0.07)');
      for (let x = 0; x <= g.W; x += 2) this.line(P(x, 0, 0), P(x, 0, 3.2), '#64748b', 1.5);
      for (let y = 0; y <= g.D; y += 2) this.line(P(0, y, 0), P(0, y, 3.2), '#64748b', 1.5);
      this.line(P(0, 0, 3.2), P(g.W, 0, 3.2), '#94a3b8', 1.5);
      this.line(P(0, 0, 3.2), P(0, g.D, 3.2), '#94a3b8', 1.5);
      for (const ch of g.chargers) {
        this.box(ch.x + 0.3, 0.02, 0, ch.x + 0.7, 0.18, 1.8, '#334155');
        const on = ch.robot >= 0 && sim.robots[ch.robot].state === 'CHARGING';
        this.glow(ch.x + 0.5, 0.1, 1.5, 14, on ? '#4ade80' : '#22c55e', on ? 0.9 : 0.35);
      }
      if (this.opts.claims) {
        for (const r of sim.robots) {
          const col = WS.STATE_COLORS[r.displayState];
          for (const i of r.claims) {
            const x = g.cx(i), y = g.cy(i);
            if (x === r.x && y === r.y) continue;
            this.quadTop(x + 0.12, y + 0.12, x + 0.88, y + 0.88, 0.02, `${col}2e`, `${col}8c`, 1);
          }
        }
      }
      for (const [s, fill, stroke, lw] of [[this.hover, 'rgba(255,255,255,0.12)', '#fff', 1.5], [this.selected, 'rgba(56,189,248,0.18)', '#38bdf8', 2.5]]) {
        if (s && s.kind === 'cell') { const x = g.cx(s.id), y = g.cy(s.id); this.quadTop(x, y, x + 1, y + 1, 0.02, fill, stroke, lw); }
      }
    }
    drawPaths(alpha) {
      const sim = this.sim, P = this.P.bind(this), c = this.ctx;
      for (const r of sim.robots) {
        if (!r.path || !r.op || r.op.op !== 'move') continue;
        const x = r.prx + (r.rx - r.prx) * alpha, y = r.pry + (r.ry - r.pry) * alpha;
        const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === r.id, col = WS.STATE_COLORS[r.displayState];
        c.beginPath();
        let p = P(x + 0.5, y + 0.5, 0.05); c.moveTo(p[0], p[1]);
        for (let k = r.pi + 1; k < r.path.length; k++) { p = P(r.path[k].x + 0.5, r.path[k].y + 0.5, 0.05); c.lineTo(p[0], p[1]); }
        c.strokeStyle = col; c.globalAlpha = sel ? 0.95 : 0.5; c.lineWidth = sel ? 3 : 1.6; c.setLineDash(sel ? [] : [5, 4]); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
        const e = r.path[r.path.length - 1];
        this.quadTop(e.x + 0.3, e.y + 0.3, e.x + 0.7, e.y + 0.7, 0.05, null, col, 1.5);
      }
    }

    // ---------------------------------------------------------------- pods & robots
    floorObjects(items, alpha) {
      const sim = this.sim, g = sim.grid, inv = sim.inv;
      const lifting = new Map(); // cell → lift fraction of a pod being picked up
      for (const r of sim.robots) {
        if (r.state === 'LIFTING_POD' && r.op && r.op.op === 'timer' && !r.bin) lifting.set(g.idx(r.x, r.y), r.op.t / r.op.dur);
      }
      for (let i = 0; i < g.podAt.length; i++) {
        const id = g.podAt[i]; if (!id) continue;
        const pod = inv.binById.get(id), x = g.cx(i), y = g.cy(i);
        const lift = (lifting.get(i) || 0) * 0.25;
        items.push({ d: x + y + 1, fn: () => (lift ? this.drawPod(x + 0.5, y + 0.5, pod.angle, pod, lift) : this.blitPod(x + 0.5, y + 0.5, pod)) });
      }
      for (const r of sim.robots) {
        const x = r.prx + (r.rx - r.prx) * alpha, y = r.pry + (r.ry - r.pry) * alpha;
        items.push({
          d: x + y + 0.99, fn: () => {
            this.drawRobot(r, x, y);
            if (!r.bin) return;
            const pod = inv.binById.get(r.bin);
            let lift = 1;
            if (r.state === 'LIFTING_POD' && r.op && r.op.op === 'timer') lift = 1 - r.op.t / r.op.dur;
            const port = pod.loc === 'port' ? sim.ports[pod.port] : null;
            const ln = port && port.job && port.job.bin === pod ? port.currentLine : null;
            this.drawPod(x + 0.5, y + 0.5, pod.angle, pod, lift * 0.25, { hl: ln ? ln.comp : -1 });
          },
        });
      }
    }

    // A pod standing still is drawn once into its own small canvas and copied
    // from there; the sprite is redrawn when its stock, highlight or the zoom changes.
    blitPod(cx, cy, pod) {
      const now = performance.now(), z = this.cam.zoom * this.dpr;
      if (Math.abs(z - this.zoomSeen) > 1e-6) { this.zoomSeen = z; this.zoomAt0 = now; }
      const sel = this.selected && this.selected.kind === 'cell' && this.selected.id === this.sim.grid.idx(pod.x, pod.y);
      let sig = pod.rot * 7 + (pod.requests.length ? 1 : 0) + (sel ? 2 : 0) + (this.opts.heat ? 4 : 0);
      for (let k = 0; k < pod.comps.length; k++) { const c = pod.comps[k]; if (c.qty) sig = (sig * 31 + c.qty * (k + 1) + (this.opts.heat && c.gtin ? this.sim.inv.byGtin.get(c.gtin).cls.charCodeAt(0) : 0)) | 0; }
      let sp = this.sprites.get(pod.id);
      const rezoom = !sp || (Math.abs(sp.zoom - z) / z > 0.01 && now - this.zoomAt0 > 200);
      if (!sp || sp.key !== sig || rezoom) {
        const b = this.podBox, w = Math.ceil((b.x1 - b.x0) * z) + 2, h = Math.ceil((b.y1 - b.y0) * z) + 2;
        sp = sp || { cv: document.createElement('canvas') };
        sp.cv.width = w; sp.cv.height = h; sp.key = sig; sp.zoom = z;
        const saved = this.ctx; this.ctx = sp.cv.getContext('2d');
        this.ctx.setTransform(z, 0, 0, z, -b.x0 * z + 1, -b.y0 * z + 1);
        this.drawPod(0, 0, pod.rot * QUARTER, pod, 0);
        this.ctx = saved;
        this.sprites.set(pod.id, sp);
      }
      const [px, py] = this.P(cx, cy, 0), b = this.podBox;
      this.ctx.drawImage(sp.cv, px + b.x0 - 1 / z, py + b.y0 - 1 / z, sp.cv.width / sp.zoom, sp.cv.height / sp.zoom);
    }
    // screen-space box (world units) around a pod centred on the origin
    get podBox() {
      if (!this._podBox) {
        const pts = [];
        for (const u of [-0.6, 0.6]) for (const v of [-0.6, 0.6]) for (const z of [0, TOP + 0.3]) pts.push(this.P(u, v, z));
        this._podBox = { x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) };
      }
      return this._podBox;
    }

    // Rotated square prism helpers: local (u, v) around a centre, turned by angle a.
    // Face k's local normal SIDE_N[k] maps to world direction (k + rot) % 4.
    rot(cx, cy, u, v, a) { const c = Math.cos(a), s = Math.sin(a); return [cx + u * c + v * s, cy - u * s + v * c]; }

    // Shelving pod: four legs, four faces of shelves with fabric pockets, stock
    // visible in the pockets. o.hl = compartment the operator is picking from.
    drawPod(cx, cy, angle, pod, lift, o = {}) {
      const sim = this.sim, cfg = sim.cfg, inv = sim.inv, P = this.P.bind(this);
      const z0 = lift, zb = z0 + LEG, zt = z0 + TOP, h = HALF;
      const corner = [[-h, h], [h, h], [h, -h], [-h, -h]].map(([u, v]) => this.rot(cx, cy, u, v, angle));
      // legs, back ones first
      const legs = corner.map((p, k) => ({ p, k })).sort((a, b) => a.p[0] + a.p[1] - (b.p[0] + b.p[1]));
      for (const { p } of legs) this.line(P(p[0], p[1], z0), P(p[0], p[1], zb + 0.05), '#a16207', 2.2);
      this.poly(corner.map((p) => P(p[0], p[1], zb)), '#5c4310');
      const shelves = cfg.podShelves, slots = cfg.podSlots, per = shelves * slots, hz = (zt - zb) / shelves;
      const sel = this.selected && this.selected.kind === 'cell' && pod.loc === 'grid' && this.selected.id === sim.grid.idx(pod.x, pod.y);
      const wanted = pod.requests.length > 0 && pod.loc !== 'port';
      for (let k = 0; k < 4; k++) {
        const [nx0, ny0] = SIDE_N[k], n = this.rot(0, 0, nx0, ny0, angle);
        if (n[0] + n[1] <= 0.01) continue; // faces away from the viewer
        const a = corner[k], b = corner[(k + 1) % 4], lit = 0.5 + 0.5 * (n[1] - n[0]) / (Math.abs(n[0]) + Math.abs(n[1]));
        const at = (u, z) => P(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, z);
        const quad = (u0, u1, za, zc, fill, stroke, lw) => this.poly([at(u0, za), at(u1, za), at(u1, zc), at(u0, zc)], fill, stroke, lw);
        quad(0, 1, zb, zt, lit > 0.5 ? '#eab308' : '#b78a09');
        for (let j = 0; j < shelves; j++) {
          for (let s = 0; s < slots; s++) {
            const ci = k * per + j * slots + s, cp = pod.comps[ci];
            const u0 = 0.06 + (0.88 * s) / slots + 0.02, u1 = 0.06 + (0.88 * (s + 1)) / slots - 0.02, za = zb + j * hz + 0.12, zc = zb + (j + 1) * hz - 0.08;
            quad(u0, u1, za, zc, lit > 0.5 ? '#1e3a5f' : '#162c48');
            if (cp.gtin && cp.qty > 0) {
              const fill = Math.min(1, cp.qty / inv.compCap(pod, inv.byGtin.get(cp.gtin)));
              const col = this.opts.heat ? WS.CLASS_COLORS[inv.byGtin.get(cp.gtin).cls] : `hsl(${(parseInt(cp.gtin.slice(7, 12), 10) * 47) % 360},${lit > 0.5 ? 50 : 40}%,${lit > 0.5 ? 58 : 46}%)`;
              quad(u0 + 0.03, u1 - 0.03, za + 0.04, za + 0.04 + (zc - za - 0.12) * (0.35 + 0.65 * fill), col);
            }
            if (ci === o.hl) {
              const pulse = 0.6 + 0.4 * Math.sin(this.t * 8);
              quad(u0, u1, za, zc, `rgba(74,222,128,${(0.35 * pulse).toFixed(2)})`, `rgba(74,222,128,${pulse.toFixed(2)})`, 2.5);
              const m = at((u0 + u1) / 2, (za + zc) / 2);
              this.glowAt(m, 26, '#4ade80', 0.5 * pulse);
            }
          }
          if (j) this.poly([at(0, zb + j * hz), at(1, zb + j * hz)], null, '#7c5a06', 1.2);
        }
        quad(0, 1, zb, zt, null, wanted ? 'rgba(255,255,255,0.75)' : 'rgba(40,30,5,0.6)', wanted ? 1.6 : 1);
      }
      this.poly(corner.map((p) => P(p[0], p[1], zt)), '#facc15', sel ? '#38bdf8' : '#a16207', sel ? 2.5 : 1);
      const inner = [[-h * 0.7, h * 0.7], [h * 0.7, h * 0.7], [h * 0.7, -h * 0.7], [-h * 0.7, -h * 0.7]].map(([u, v]) => this.rot(cx, cy, u, v, angle));
      this.poly(inner.map((p) => P(p[0], p[1], zt)), '#d9a90b');
    }
    glowAt(p, r, color, a) {
      const c = this.ctx, gr = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
      gr.addColorStop(0, WS.rgba(color, a)); gr.addColorStop(1, WS.rgba(color, 0));
      c.fillStyle = gr; c.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
    }

    // Drive unit: low orange body with chamfered corners, a lift plate on top
    // and a state-coloured light band. It turns on the spot to change direction.
    drawRobot(r, x, y) {
      const sim = this.sim, P = this.P.bind(this), col = WS.STATE_COLORS[r.displayState];
      const cx = x + 0.5, cy = y + 0.5;
      const f = r.shift > 0 ? 1 - r.shift / sim.cfg.wheelShift : 1;
      const a = (r.axis === 'x' ? 0 : Math.PI / 2) - (1 - f) * (Math.PI / 2);
      const h = 0.4, k = 0.12;
      const shape = [[-h + k, h], [h - k, h], [h, h - k], [h, -h + k], [h - k, -h], [-h + k, -h], [-h, -h + k], [-h, h - k]];
      const pts = shape.map(([u, v]) => this.rot(cx, cy, u, v, a));
      this.poly(pts.map((p) => P(p[0] + 0.06, p[1] + 0.08, 0.005)), 'rgba(0,0,0,0.35)');
      const sides = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length], nx = -(q[1] - p[1]), ny = q[0] - p[0];
        if (nx + ny > 1e-4) sides.push({ p, q, lit: 0.5 + 0.5 * (ny - nx) / (Math.abs(nx) + Math.abs(ny)) });
      }
      for (const s of sides) {
        this.poly([P(s.p[0], s.p[1], 0.02), P(s.q[0], s.q[1], 0.02), P(s.q[0], s.q[1], BODY), P(s.p[0], s.p[1], BODY)], s.lit > 0.5 ? '#ea6a12' : '#b4500c');
        this.poly([P(s.p[0], s.p[1], 0.02), P(s.q[0], s.q[1], 0.02), P(s.q[0], s.q[1], 0.16), P(s.p[0], s.p[1], 0.16)], '#1f2937');
        this.poly([P(s.p[0], s.p[1], 0.36), P(s.q[0], s.q[1], 0.36), P(s.q[0], s.q[1], 0.46), P(s.p[0], s.p[1], 0.46)], col);
      }
      this.poly(pts.map((p) => P(p[0], p[1], BODY)), '#f97316');
      const disc = []; for (let i = 0; i < 16; i++) { const t = (i * Math.PI) / 8; disc.push(P(cx + 0.27 * Math.cos(t), cy + 0.27 * Math.sin(t), BODY + 0.01)); }
      this.poly(disc, '#334155', '#0f172a', 1);
      if (r.displayState === 'WAITING_IN_TRAFFIC' || r.busy) this.glow(cx, cy, BODY + 0.4, 20, col, 0.35 + 0.25 * Math.sin(this.t * 6));
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === r.id;
      if (sel) this.quadTop(x - 0.06, y - 0.06, x + 1.06, y + 1.06, 0.02, null, '#38bdf8', 2.5);
      if (this.opts.labels) {
        const zl = r.bin ? TOP + 1.6 : BODY + 0.9;
        this.text(r.name, cx, cy, zl, { size: 9, color: '#0f172a', weight: 800, bg: 'rgba(241,245,249,0.85)' });
        if (r.battery < 30) {
          const [bx, by] = P(cx, cy, zl + 1.1), c = this.ctx;
          c.fillStyle = '#0f172a'; c.fillRect(bx - 11, by - 3, 22, 6);
          c.fillStyle = r.battery < 15 ? '#ef4444' : '#facc15'; c.fillRect(bx - 10, by - 2, (20 * r.battery) / 100, 4);
        }
      }
    }

    // ---------------------------------------------------------------- stations
    // Pod station: a pick frame at the floor edge with a pick-to-light bar and
    // light curtain, the operator's screen and a stack light.
    drawPortBody(p, add) {
      const sim = this.sim, g = sim.grid, L = sim.layout, op = L.operatorPos(p), front = p.face === 'front';
      add(op.x + op.y - 1.2, () => this.quadTop(op.x - 0.55, op.y - 0.45, op.x + 0.55, op.y + 0.45, 0.02, '#10161f', '#2a3546', 1));
      const x0 = front ? p.drop.x : g.W, y0 = front ? g.D : p.drop.y, x1 = front ? p.drop.x + 1 : g.W, y1 = front ? g.D : p.drop.y + 1;
      add(x1 + y1 + 0.05, () => {
        const P = this.P.bind(this), active = !!(p.job && p.currentLine);
        // posts and top beam
        for (const [px, py] of [[x0, y0], [x1, y1]]) this.box(px - 0.05, py - 0.05, 0, px + 0.05, py + 0.05, TOP + 1.1, '#475569');
        this.poly([P(x0, y0, TOP + 0.9), P(x1, y1, TOP + 0.9), P(x1, y1, TOP + 1.25), P(x0, y0, TOP + 1.25)], '#1f2937', '#475569', 1);
        // light curtain: faint beams between the posts
        this.ctx.globalAlpha = active ? 0.35 : 0.15;
        for (let z = 0.6; z < TOP; z += 0.55) this.line(P(x0, y0, z), P(x1, y1, z), '#f87171', 1);
        this.ctx.globalAlpha = 1;
        if (active) this.glowAt(P((x0 + x1) / 2, (y0 + y1) / 2, TOP + 1.05), 24, '#4ade80', 0.6);
        // operator screen on a post beside the frame, and a stack light
        const sx = front ? x0 - 0.35 : x0 + 0.35, sy = front ? y0 + 0.35 : y0 - 0.35;
        this.box(sx - 0.03, sy - 0.03, 0, sx + 0.03, sy + 0.03, 3.4, '#475569');
        this.box(sx - 0.28, sy - 0.06, 3.3, sx + 0.28, sy + 0.04, 4.6, '#0f172a');
        this.faceY(sy + 0.045, sx - 0.24, sx + 0.24, 3.4, 4.5, p.job ? '#0c4a6e' : '#111c2e');
        if (p.job) {
          this.faceY(sy + 0.05, sx - 0.2, sx + 0.05, 4.2, 4.38, '#e0f2fe');
          this.faceY(sy + 0.05, sx - 0.2, sx + 0.18, 3.85, 4.05, '#4ade80');
        }
        const lx = x1, ly = y1, starving = !p.job && !p.inQ.length && p.demand() > 0;
        [['#ef4444', false], ['#f59e0b', starving], ['#22c55e', !!p.job]].forEach(([lc, on], k) => {
          const z = TOP + 1.3 + k * 0.42;
          this.box(lx - 0.09, ly - 0.09, z, lx + 0.09, ly + 0.09, z + 0.4, on ? lc : WS.shade(lc, -0.65), on ? { top: WS.shade(lc, 0.4) } : {});
          if (on) this.glow(lx, ly, z + 0.2, 16, lc, 0.55);
        });
      });
    }

    pick(sx, sy) {
      const sim = this.sim, g = sim.grid, L = sim.layout;
      let best = null, bd = 22 * Math.max(1, this.cam.zoom);
      for (const r of sim.robots) {
        const [px, py] = this.P(r.rx + 0.5, r.ry + 0.5, r.bin ? 3 : 0.5);
        const d = Math.hypot(this.cam.x + px * this.cam.zoom - sx, this.cam.y + py * this.cam.zoom - sy);
        if (d < bd) { bd = d; best = { kind: 'robot', id: r.id }; }
      }
      if (best) return best;
      const cellAt = (z) => { const w = this.toWorld(sx, sy, z); return g.inside(Math.floor(w.x), Math.floor(w.y)) ? g.idx(Math.floor(w.x), Math.floor(w.y)) : -1; };
      // a click on a pod's side or top selects the cell it stands on
      for (const z of [TOP, TOP * 0.7, TOP * 0.4, LEG + 0.5]) { const i = cellAt(z); if (i >= 0 && g.podAt[i]) return { kind: 'cell', id: i }; }
      const i = cellAt(0);
      if (i >= 0) {
        const port = sim.ports.find((p) => p.cells.some((c) => g.idx(c.x, c.y) === i));
        return port ? { kind: 'port', id: port.idx } : { kind: 'cell', id: i };
      }
      const f = this.toWorld(sx, sy, 1.5);
      for (const p of sim.ports) {
        if (p.face === 'front' && f.x >= p.drop.x - 0.4 && f.x <= p.drop.x + 1.4 && f.y >= g.D && f.y <= g.D + 1.6) return { kind: 'port', id: p.idx };
        if (p.face === 'right' && f.x >= g.W && f.x <= g.W + 1.6 && f.y >= p.drop.y - 0.4 && f.y <= p.drop.y + 1.4) return { kind: 'port', id: p.idx };
      }
      for (const pk of sim.oms.packers) { const q = L.packerPos(pk.idx); if (Math.abs(f.x - q.x) < 1.2 && Math.abs(f.y - q.y) < 1.2) return { kind: 'packer', id: pk.idx }; }
      const d = L.dock();
      if (f.x > d.x - 1 && f.x < d.x + 6 && Math.abs(f.y - d.y) < 1.6) return { kind: 'dock' };
      return null;
    }
  }

  WS.PodRenderer = PodRenderer;
})((globalThis.WS = globalThis.WS || {}));
