/* Isometric view of AisleMate: static shelving with its stock, the robots
 * with their order totes on two decks and a tablet on a mast, the pickers
 * walking the aisles, and the induct and goods-in stations. Shelf bays at
 * rest are blitted from small sprites, as PodSwarm's pods are. */
(function (WS) {
  'use strict';
  const C = WS.CELL;
  const TOP = 5.2, LEVELS = [0.3, 1.5, 2.7, 3.9], BODY = 0.75, DECKS = [0.95, 2.05], MAST = 3.9; // render levels
  const STEEL = '#1d4ed8', BEAM = '#f97316';

  class AmrRenderer extends WS.IsoRenderer {
    constructor(canvas, app) {
      super(canvas, app);
      this.sprites = new Map(); // location id → { key, zoom, cv }
      this.zoomSeen = 0; this.zoomAt0 = 0;
    }
    worldBounds() {
      const g = this.sim.grid, d = this.sim.layout.dock();
      const pts = [this.P(-1, -1, TOP + 3), this.P(d.x + 6, -1, 0), this.P(-1, g.D + 8, 0), this.P(d.x + 6, g.D + 8, 0), this.P(g.W + 1, -1, TOP + 3)];
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    }
    resetCaches() { super.resetCaches(); if (this.sprites) this.sprites.clear(); }

    drawScene(alpha) {
      this.drawFloor();
      this.drawShelfFloor();
      if (this.opts.paths) this.drawPaths(alpha);
      const items = [], sim = this.sim, g = sim.grid;
      for (let i = 0; i < g.binAt.length; i++) {
        const id = g.binAt[i];
        if (id) { const x = g.cx(i), y = g.cy(i), b = sim.inv.binById.get(id); items.push({ d: x + y + 1, fn: () => this.blitShelf(x, y, b) }); }
      }
      for (const r of sim.fleet) {
        const x = r.prx + (r.rx - r.prx) * alpha, y = r.pry + (r.ry - r.pry) * alpha;
        items.push({ d: x + y + 0.99, fn: () => this.drawRobot(r, x, y) });
      }
      for (const pk of sim.pickers) {
        const x = pk.px + (pk.x - pk.px) * alpha, y = pk.py + (pk.y - pk.py) * alpha;
        items.push({ d: x + y + 0.05, fn: () => this.drawPicker(pk, x, y) });
      }
      // pick-to-light: the location being worked glows on its shelf
      for (const st of sim.stops) {
        if (!st.picking || st.done) continue;
        const b = st.bin;
        items.push({ d: b.x + b.y + 1.01, fn: () => this.glow(b.x + 0.5, b.y + 0.5, 3.0, 34, '#4ade80', 0.35 + 0.25 * Math.sin(this.t * 8)) });
      }
      this.drawStations(items);
    }

    // ---------------------------------------------------------------- floor
    drawShelfFloor() {
      const sim = this.sim, g = sim.grid, P = this.P.bind(this);
      this.poly([P(0, 0, 0), P(g.W, 0, 0), P(g.W, g.D, 0), P(0, g.D, 0)], '#232d3d');
      for (let y = 0; y < g.D; y++) for (let x = 0; x < g.W; x++) {
        const i = g.idx(x, y), t = g.type[i];
        if (t === C.BLOCKED) this.quadTop(x, y, x + 1, y + 1, 0, '#141b27');
        else if (t === C.STORAGE) this.quadTop(x + 0.02, y + 0.02, x + 0.98, y + 0.98, 0, '#1a2230');
        else if (t === C.LANE) {
          this.quadTop(x + 0.04, y + 0.04, x + 0.96, y + 0.96, 0, '#2a2614');
          const d = sim.ports[g.laneOf[i]].docks[g.dockOf[i]], nx = d.cells[g.laneIdx[i] + 1], dx = nx.x - x, dy = nx.y - y, mx = x + 0.5, my = y + 0.5;
          this.line(P(mx - 0.2 * dx - 0.2 * dy, my - 0.2 * dy + 0.2 * dx, 0), P(mx + 0.1 * dx, my + 0.1 * dy, 0), 'rgba(250,204,21,0.55)', 2);
          this.line(P(mx + 0.1 * dx, my + 0.1 * dy, 0), P(mx - 0.2 * dx + 0.2 * dy, my - 0.2 * dy - 0.2 * dx, 0), 'rgba(250,204,21,0.55)', 2);
        } else if (t === C.PORT) {
          this.quadTop(x + 0.04, y + 0.04, x + 0.96, y + 0.96, 0, '#3a2f12');
          this.quadTop(x + 0.04, y + 0.04, x + 0.96, y + 0.96, 0, null, '#facc15', 2);
        } else if (t === C.CHARGER) {
          this.quadTop(x + 0.08, y + 0.08, x + 0.92, y + 0.92, 0, '#14532d');
          this.quadTop(x + 0.2, y + 0.2, x + 0.8, y + 0.8, 0, null, '#4ade80', 1.5);
        } else if (t === C.PARK) this.quadTop(x + 0.1, y + 0.1, x + 0.9, y + 0.9, 0, null, 'rgba(148,163,184,0.35)', 1);
        if (this.opts.heat && t === C.HIGHWAY) {
          const v = Math.max(Math.min(1, g.waitHeat[i] / 40), Math.min(1, g.passHeat[i] / 60) * 0.6);
          if (v > 0.04) this.quadTop(x, y, x + 1, y + 1, 0.01, `rgba(239,68,68,${(v * 0.7).toFixed(2)})`);
        }
      }
      // walkway paint along the aisles' edges
      this.ctx.globalAlpha = 0.45;
      for (let a = 0; a < g.A; a++) for (const x of [4 * a + 1, 4 * a + 3]) this.line(P(x, g.Y0, 0), P(x, g.Y0 + g.B, 0), '#ca8a04', 1.2);
      this.ctx.globalAlpha = 1;
      for (const ch of g.chargers) {
        this.box(ch.x + 0.3, 0.02, 0, ch.x + 0.7, 0.18, 1.8, '#334155');
        const on = ch.robot >= 0 && sim.fleet[ch.robot].state === 'CHARGING';
        this.glow(ch.x + 0.5, 0.1, 1.5, 14, on ? '#4ade80' : '#22c55e', on ? 0.9 : 0.35);
      }
      if (this.opts.claims) this.drawClaims(0);
      for (const [s, fill, stroke, lw] of [[this.hover, 'rgba(255,255,255,0.12)', '#fff', 1.5], [this.selected, 'rgba(56,189,248,0.18)', '#38bdf8', 2.5]]) {
        if (s && s.kind === 'cell') { const x = g.cx(s.id), y = g.cy(s.id); this.quadTop(x, y, x + 1, y + 1, 0.02, fill, stroke, lw); }
      }
    }

    // ---------------------------------------------------------------- shelving
    // A shelf bay at rest, drawn once into a small canvas and copied from there
    // until its stock, the selection, the zoom or the tilt changes.
    blitShelf(x, y, b) {
      const now = performance.now(), z = this.cam.zoom * this.dpr, g = this.sim.grid;
      if (Math.abs(z - this.zoomSeen) > 1e-6) { this.zoomSeen = z; this.zoomAt0 = now; }
      const sel = this.selected && this.selected.kind === 'cell' && this.selected.id === g.idx(x, y);
      let sig = (b.requests.length ? 1 : 0) + (sel ? 2 : 0) + (this.opts.heat ? 4 : 0);
      for (let k = 0; k < b.comps.length; k++) { const c = b.comps[k]; if (c.gtin) sig = (sig * 31 + c.qty * (k + 1) + (this.opts.heat ? this.sim.inv.byGtin.get(c.gtin).cls.charCodeAt(0) : 0)) | 0; }
      let sp = this.sprites.get(b.id);
      const rezoom = !sp || (Math.abs(sp.zoom - z) / z > 0.01 && now - this.zoomAt0 > 200);
      if (!sp || sp.key !== sig || rezoom || sp.tilt !== this.cam.tilt) {
        const bx = this.shelfBox, w = Math.ceil((bx.x1 - bx.x0) * z) + 2, h = Math.ceil((bx.y1 - bx.y0) * z) + 2;
        sp = sp || { cv: document.createElement('canvas') };
        sp.cv.width = w; sp.cv.height = h; sp.key = sig; sp.zoom = z; sp.tilt = this.cam.tilt;
        const saved = this.ctx; this.ctx = sp.cv.getContext('2d');
        this.ctx.setTransform(z, 0, 0, z, -bx.x0 * z + 1, -bx.y0 * z + 1);
        this.drawShelf(0, 0, b, sel, g.sideOf(x));
        this.ctx = saved;
        this.sprites.set(b.id, sp);
      }
      const [px, py] = this.P(x, y, 0), bx = this.shelfBox;
      this.ctx.drawImage(sp.cv, px + bx.x0 - 1 / z, py + bx.y0 - 1 / z, sp.cv.width / sp.zoom, sp.cv.height / sp.zoom);
    }
    get shelfBox() {
      if (!this._shelfBox || this._shelfBox.tilt !== this.cam.tilt) {
        const pts = [];
        for (const u of [-0.05, 1.05]) for (const v of [-0.05, 1.05]) for (const z of [0, TOP + 0.2]) pts.push(this.P(u, v, z));
        this._shelfBox = { tilt: this.cam.tilt, x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) };
      }
      return this._shelfBox;
    }
    // One bay of open shelving: blue uprights, orange beams under steel
    // decks, and the goods in each compartment (two slots along the aisle per
    // level) as boxes as high as the compartment is full. side: which side of
    // its aisle the bay stands (the open face looks into the aisle).
    drawShelf(x, y, b, sel, side) {
      const sim = this.sim, inv = sim.inv, cfg = sim.cfg, slots = cfg.shelfSlots;
      const posts = [[x + 0.03, y + 0.02], [x + 0.9, y + 0.02], [x + 0.03, y + 0.91], [x + 0.9, y + 0.91]];
      for (const [px, py] of posts.slice(0, 2)) this.box(px, py, 0, px + 0.07, py + 0.07, TOP, STEEL);
      LEVELS.forEach((z0, j) => {
        this.box(x + 0.03, y + 0.02, z0 - 0.12, x + 0.97, y + 0.98, z0, '#94a3b8', { top: '#cbd5e1' });
        this.faceY(y + 0.981, x + 0.03, x + 0.97, z0 - 0.12, z0, BEAM);
        this.faceX(x + 0.971, y + 0.02, y + 0.98, z0 - 0.12, z0, side ? BEAM : '#c2410c');
        for (let s = 0; s < slots; s++) {
          const c = b.comps[j * slots + s];
          if (!c || !c.gtin || c.qty <= 0) continue;
          const p = inv.byGtin.get(c.gtin), fill = Math.min(1, c.qty / inv.compCap(b, p)), y0 = y + 0.06 + (0.88 * s) / slots, y1 = y + 0.06 + (0.88 * (s + 1)) / slots - 0.04;
          const hue = (parseInt(c.gtin.slice(7, 12), 10) * 47) % 360;
          const o = this.opts.heat ? {} : { top: `hsl(${hue},50%,64%)`, left: `hsl(${hue},45%,52%)`, right: `hsl(${hue},40%,40%)` };
          this.box(x + 0.14, y0, z0, x + 0.86, y1, z0 + 0.25 + 0.7 * fill, this.opts.heat ? WS.CLASS_COLORS[p.cls] : '#888888', o);
        }
      });
      this.box(x + 0.03, y + 0.02, TOP - 0.1, x + 0.97, y + 0.98, TOP, '#94a3b8', { top: b.requests.length ? '#fde68a' : '#cbd5e1' });
      for (const [px, py] of posts.slice(2)) this.box(px, py, 0, px + 0.07, py + 0.07, TOP, STEEL);
      if (sel) this.quadTop(x, y, x + 1, y + 1, TOP + 0.01, null, '#38bdf8', 2.5);
    }

    // ---------------------------------------------------------------- robots and pickers
    // Robot: a low white base with a state-coloured light band, a two-deck
    // tote rack and a tablet on a mast showing the picker what to pick.
    drawRobot(r, x, y) {
      const sim = this.sim, inv = sim.inv, oms = sim.oms, P = this.P.bind(this), col = WS.stateColor(sim, r.displayState), cx = x + 0.5, cy = y + 0.5, h = 0.36;
      this.poly([P(cx - h + 0.06, cy - h + 0.08, 0.005), P(cx + h + 0.06, cy - h + 0.08, 0.005), P(cx + h + 0.06, cy + h + 0.08, 0.005), P(cx - h + 0.06, cy + h + 0.08, 0.005)], 'rgba(0,0,0,0.35)');
      this.box(cx - h, cy - h, 0.05, cx + h, cy + h, BODY, '#e2e8f0', { left: '#cbd5e1', right: '#94a3b8' });
      this.box(cx - h - 0.01, cy - h - 0.01, 0.05, cx + h + 0.01, cy + h + 0.01, 0.2, '#1f2937');
      this.faceY(cy + h + 0.012, cx - h, cx + h, 0.42, 0.52, col); this.faceX(cx + h + 0.012, cy - h, cy + h, 0.42, 0.52, col);
      // rack: corner posts and two decks
      const posts = [[cx - 0.31, cy - 0.31], [cx + 0.27, cy - 0.31]], front = [[cx - 0.31, cy + 0.27], [cx + 0.27, cy + 0.27]];
      for (const [px, py] of posts) this.box(px, py, BODY, px + 0.04, py + 0.04, 3.0, '#64748b');
      // mast with the tablet, at the back
      this.box(cx - 0.03, cy - 0.33, BODY, cx + 0.03, cy - 0.27, MAST, '#475569');
      const waiting = r.displayState === 'WAITING_PICKER';
      DECKS.forEach((dz, k) => {
        this.box(cx - 0.32, cy - 0.32, dz - 0.06, cx + 0.32, cy + 0.32, dz, '#334155', { top: '#475569' });
        for (let s = 0; s < 2; s++) {
          const n = k * 2 + s, tx = cx - 0.16 + s * 0.32;
          if (r.totes[n]) { const o = r.totes[n], u = oms.units(o); this.orderTote(tx, cy, dz, o.lines.reduce((a, l) => a + l.picked, 0) / u, 0.66); } else if (n < r.cases) this.parcel(tx - 0.13, cy - 0.16, tx + 0.13, cy + 0.16, dz, 0.5);
        }
      });
      for (const [px, py] of front) this.box(px, py, BODY, px + 0.04, py + 0.04, 3.0, '#64748b');
      // tablet facing forward; it lights up while the robot waits for a picker
      this.box(cx - 0.2, cy - 0.33, MAST, cx + 0.2, cy - 0.27, MAST + 0.75, '#0f172a');
      this.faceY(cy - 0.268, cx - 0.17, cx + 0.17, MAST + 0.08, MAST + 0.68, waiting ? '#14b8a6' : '#0c4a6e');
      if (waiting) this.glow(cx, cy - 0.27, MAST + 0.4, 22, '#2dd4bf', 0.4 + 0.2 * Math.sin(this.t * 6));
      if (r.displayState === 'WAITING_IN_TRAFFIC') this.glow(cx, cy, BODY + 0.3, 20, col, 0.35 + 0.25 * Math.sin(this.t * 6));
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === r.id;
      if (sel) this.quadTop(x - 0.06, y - 0.06, x + 1.06, y + 1.06, 0.02, null, '#38bdf8', 2.5);
      if (this.opts.labels) this.robotTag(r, cx, cy, MAST + 1.3, 'rgba(204,251,241,0.9)');
    }
    // A picker in a hi-vis vest; arms busy while picking.
    drawPicker(pk, x, y) {
      this.drawOperator(x, y, pk.state === 'PICKING', '#a3e635');
      if (this.opts.labels && this.cam.zoom > 0.9) this.text(pk.name, x, y, 4.3, { size: 9, color: '#1a2e05', weight: 800, bg: 'rgba(217,249,157,0.9)' });
    }

    // ---------------------------------------------------------------- stations
    // Induct & drop-off (front) or goods-in (right): the operator's mat, a
    // screen on a post and a stack light; green while a robot is being served.
    drawPortBody(p, add) {
      const sim = this.sim, g = sim.grid, op = sim.layout.operatorPos(p), front = p.face === 'front';
      add(op.x + op.y - 1.2, () => this.quadTop(op.x - 0.55, op.y - 0.45, op.x + 0.55, op.y + 0.45, 0.02, '#10161f', '#2a3546', 1));
      const sx = front ? p.drop.x - 0.15 : g.W + 0.3, sy = front ? g.D + 0.3 : p.drop.y - 0.15;
      add(sx + sy + 0.3, () => {
        this.box(sx - 0.03, sy - 0.03, 0, sx + 0.03, sy + 0.03, 3.4, '#475569');
        this.box(sx - 0.28, sy - 0.06, 3.3, sx + 0.28, sy + 0.04, 4.6, '#0f172a');
        this.faceY(sy + 0.045, sx - 0.24, sx + 0.24, 3.4, 4.5, p.serving ? '#0c4a6e' : '#111c2e');
        if (p.serving) { this.faceY(sy + 0.05, sx - 0.2, sx + 0.05, 4.2, 4.38, '#e0f2fe'); this.faceY(sy + 0.05, sx - 0.2, sx + 0.18, 3.85, 4.05, '#4ade80'); }
        const lx = front ? p.drop.x + 1.05 : g.W + 0.12, ly = front ? g.D + 0.12 : p.drop.y + 1.05, starving = !p.serving && p.recentStarve > 0.35;
        this.box(lx - 0.04, ly - 0.04, 0, lx + 0.04, ly + 0.04, 3.2, '#64748b');
        [['#ef4444', false], ['#f59e0b', starving], ['#22c55e', !!p.serving]].forEach(([lc, on], k) => {
          const z = 3.2 + k * 0.42;
          this.box(lx - 0.09, ly - 0.09, z, lx + 0.09, ly + 0.09, z + 0.4, on ? lc : WS.shade(lc, -0.65), on ? { top: WS.shade(lc, 0.4) } : {});
          if (on) this.glow(lx, ly, z + 0.2, 16, lc, 0.55);
        });
      });
    }

    drawLabels() {
      const sim = this.sim, g = sim.grid, L = sim.layout;
      for (const p of sim.ports) {
        const pos = p.face === 'front' ? { x: p.drop.x + 1, y: g.D + 0.2 } : { x: g.W + 0.2, y: p.drop.y + 1 };
        const st = p.serving ? 'SERVING ' + p.serving.name : p.kind === 'PICK' ? `${p.slots.filter(Boolean).length} STAGED` : 'WAITING';
        this.text(`${p.code} ${p.kind === 'PICK' ? 'INDUCT' : 'GOODS-IN'} · ${st}`, pos.x, pos.y, 6.2, { size: 10, bg: 'rgba(15,23,42,0.82)', color: p.kind === 'PICK' ? '#fdba74' : '#86efac' });
      }
      for (let a = 0; a < g.A; a++) this.text(`AISLE ${a + 1}`, 4 * a + 2, g.Y0 + g.B + 0.2, TOP + 1.2, { size: 10, bg: 'rgba(15,23,42,0.82)', color: '#fde68a' });
      for (const pk of sim.oms.packers) {
        const q = L.packerPos(pk.idx);
        this.text(`${pk.name} · ${pk.queue.length} queued`, q.x, q.y, 4.6, { size: 10, bg: 'rgba(15,23,42,0.82)', color: '#7dd3fc' });
      }
      const d = L.dock();
      this.text('OUTBOUND DOCK', d.x - 0.4, d.y + 1.6, 1.5, { size: 10, bg: 'rgba(15,23,42,0.82)', color: '#e2e8f0' });
      this.text('GOODS RECEIVING', g.W + 4, (g.ports.find((p) => p.kind === 'GOODS_IN') || { drop: { y: 2 } }).drop.y + 1.4, 3.2, { size: 10, bg: 'rgba(15,23,42,0.82)', color: '#86efac' });
    }

    pick(sx, sy) {
      const sim = this.sim, g = sim.grid;
      let best = null, bd = 22 * Math.max(1, this.cam.zoom);
      for (const r of sim.fleet) {
        const [px, py] = this.P(r.rx + 0.5, r.ry + 0.5, 2);
        const d = Math.hypot(this.cam.x + px * this.cam.zoom - sx, this.cam.y + py * this.cam.zoom - sy);
        if (d < bd) { bd = d; best = { kind: 'robot', id: r.id }; }
      }
      if (best) return best;
      const cellAt = (z) => { const w = this.toWorld(sx, sy, z); return g.inside(Math.floor(w.x), Math.floor(w.y)) ? g.idx(Math.floor(w.x), Math.floor(w.y)) : -1; };
      // a click on a shelf's side or top selects its bay
      for (const z of [TOP, TOP * 0.7, TOP * 0.4, 0.6]) { const i = cellAt(z); if (i >= 0 && g.binAt[i]) return { kind: 'cell', id: i }; }
      const i = cellAt(0);
      if (i >= 0) {
        const port = sim.ports.find((p) => p.cells.some((c) => g.idx(c.x, c.y) === i));
        return port ? { kind: 'port', id: port.idx } : { kind: 'cell', id: i };
      }
      return this.pickStations(this.toWorld(sx, sy, 1.5));
    }
  }

  WS.AmrRenderer = AmrRenderer;
})((globalThis.WS = globalThis.WS || {}));
