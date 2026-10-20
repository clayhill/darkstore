/* SortHub in the free 3D view (WS.View3D), as in the isometric view: the
 * tilt-tray loop with its trays, chutes, bags, inducts and feeder, or the
 * raised robot deck with its holes, the bags hanging below, the induct
 * platforms and the robots. No packing or dock: the shared stations are
 * not drawn. */
(function (WS) {
  'use strict';
  const C = WS.CELL;
  const TZ = 2.4, PZ = 3.6; // tray height, deck height (render levels)
  const SHADES = ['#b8875a', '#a8794f', '#c6956a', '#9c6f47', '#d0a070', '#b07d52', '#c08a5c'];
  const CARTON = (p) => SHADES[p.hue % SHADES.length];

  class SortRenderer3D extends WS.View3D {
    bounds() { const g = this.sim.grid; return { x0: -2, y0: -2, x1: g.W + 2, y1: g.D + 4 }; }
    get robotZ() { return this.sim.tray ? 0 : PZ; }
    workLights() { const g = this.sim.grid; return this.sim.ports.map((p) => (this.sim.tray ? { x: p.slot.x + 0.8, y: g.Yt - 2.6 } : { x: p.drop.x + 1.2, y: g.D + 1.5 })); }
    buildKey() { const c = this.sim.cfg; return [c.seed, c.mechanism, c.chutes, c.inducts, this.sim.grid.W, this.sim.grid.D].join('|'); }
    fit() {
      super.fit();
      const g = this.sim.grid;
      Object.assign(this.cam, { tx: g.W / 2, ty: g.D / 2, dist: Math.max(g.W, g.D) * (this.sim.tray ? 0.75 : 1.05) });
    }
    buildStatic() {
      const T = WS.View3D.THREE, b = this.bounds(), S = this.st;
      if (!this.ground) {
        this.ground = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ color: '#1a2332', roughness: 0.95 }));
        this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; this.scene.add(this.ground);
      }
      this.ground.scale.set(b.x1 - b.x0 + 12, b.y1 - b.y0 + 12, 1); this.ground.position.set((b.x0 + b.x1) / 2, -0.002, (b.y0 + b.y1) / 2);
      if (this.sim.tray) this.loopStatic(S); else this.deckStatic(S);
    }
    // ---------------------------------------------------------------- tilt-tray loop
    loopStatic(S) {
      const sim = this.sim, g = sim.grid, N = 96;
      for (let k = 0; k < N; k++) {
        const a = g.loopAt((k * g.Lp) / N), b = g.loopAt(((k + 1) * g.Lp) / N), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, len = Math.hypot(b.x - a.x, b.y - a.y);
        S.box.rbox(mx, my, -Math.atan2(b.y - a.y, b.x - a.x), -len / 2 - 0.02, -0.5, TZ - 0.45, len / 2 + 0.02, 0.5, TZ - 0.2, '#1f2937');
        if (k % 6 === 0) S.box.box(a.x - 0.06, a.y - 0.06, 0, a.x + 0.06, a.y + 0.06, TZ - 0.45, '#475569');
      }
      const last = sim.ports[sim.ports.length - 1].slot.x;
      this.conveyor(S, [{ x: -1.5, y: 0.6 }, { x: last, y: 0.6 }], 0.7, TZ - 0.2);
      for (const p of sim.ports) {
        const x = p.slot.x, pick = { kind: 'port', id: p.idx };
        this.conveyor(S, [{ x, y: 0.95 }, { x, y: g.Yt - 0.55 }], 0.6, TZ - 0.1, '#3b4658');
        S.box.box(x - 0.3, 1.0, 0, x + 0.3, g.Yt - 0.6, 0.05, '#334155', pick);
        S.box.box(x + 0.3, g.Yt - 3.1, 0, x + 1.3, g.Yt - 2.1, 0.04, '#10161f');
      }
      for (const ch of sim.chutes) {
        const dir = ch.side ? 1 : -1, y0 = ch.side ? g.Yb : g.Yt, x = ch.x, cell = { kind: 'cell', id: g.idx(Math.floor(ch.cell.x), Math.floor(ch.cell.y)) };
        // a slide down from the loop's edge to the bag, in three steps
        for (let k = 0; k < 3; k++) {
          const ya = y0 + dir * (0.55 + k * 0.5), yc = ya + dir * 0.5, z = TZ - 0.25 - k * 0.25;
          S.box.box(x - 0.45, Math.min(ya, yc), z - 0.06, x + 0.45, Math.max(ya, yc), z, ch === sim.reject ? '#7f1d1d' : '#64748b', cell);
        }
        const yb = y0 + dir * 2.45;
        for (const [px, py] of [[-0.42, -0.42], [0.36, 0.36], [-0.42, 0.36], [0.36, -0.42]]) S.box.box(x + px, yb + py, 0, x + px + 0.06, yb + py + 0.06, 1.5, '#475569');
        S.box.box(x - 0.42, yb - 0.42, 1.45, x + 0.42, yb + 0.42, 1.55, '#475569', cell);
      }
    }
    // ---------------------------------------------------------------- robot deck
    deckStatic(S) {
      const sim = this.sim, g = sim.grid;
      for (let y = 0; y < g.D; y++) for (let x = 0; x < g.W; x++) {
        const t = g.type[g.idx(x, y)], pick = { kind: 'cell', id: g.idx(x, y) };
        if (t === C.STORAGE) { // a hole: a frame round it
          for (const [x0, y0, x1, y1] of [[0, 0, 1, 0.1], [0, 0.9, 1, 1], [0, 0, 0.1, 1], [0.9, 0, 1, 1]]) S.box.box(x + x0, y + y0, PZ - 0.15, x + x1, y + y1, PZ + 0.02, '#facc15', pick);
          continue;
        }
        if (t === C.BLOCKED) continue;
        const col = t === C.PORT ? '#3a2f12' : t === C.LANE ? '#2a2614' : t === C.CHARGER ? '#14532d' : (x + y) % 2 ? '#2b3546' : '#2f3a4c';
        S.box.box(x + 0.01, y + 0.01, PZ - 0.15, x + 0.99, y + 0.99, PZ, col, pick);
      }
      for (let x = 0; x <= g.W; x += 3) for (let y = 1; y <= g.D - 1; y += 3) S.box.box(x - 0.06, y - 0.06, 0, x + 0.06, y + 0.06, PZ - 0.15, '#475569');
      for (const p of sim.ports) {
        const x = p.drop.x + 0.5, y0 = g.D, pick = { kind: 'port', id: p.idx };
        S.box.box(x - 0.8, y0, 0, x + 0.8, y0 + 1.4, PZ - 0.05, '#334155', pick);
        this.conveyor(S, [{ x: x + 1.2, y: y0 + 3 }, { x: x + 1.2, y: y0 + 0.2 }], 0.55, PZ + 0.1, '#3b4658');
      }
      for (const ch of g.chargers) S.box.box(ch.x + 0.3, 0.02, PZ, ch.x + 0.7, 0.18, PZ + 1.6, '#334155');
    }

    // ---------------------------------------------------------------- frame
    drawLive(alpha) {
      const sim = this.sim, g = sim.grid, D = this.dy, cap = sim.cfg.bagCapacity;
      // bags: a sack growing as it fills, a lamp when full or being changed
      for (const ch of sim.chutes) {
        const tray = sim.tray, x = ch.x, y = tray ? (ch.side ? g.Yb : g.Yt) + (ch.side ? 2.45 : -2.45) : ch.y, top = tray ? 1.45 : PZ - 0.2, f = Math.min(1, ch.count / cap), h = 0.25 + f * (top - 0.4), cell = { kind: 'cell', id: g.idx(Math.floor(ch.cell.x), Math.floor(ch.cell.y)) };
        D.box.box(x - 0.34, y - 0.34, top - h, x + 0.34, y + 0.34, top, ch.swapping ? '#94a3b8' : '#e5e7eb', cell);
        if (ch.count >= cap || ch.swapping) D.litCyl.cyl(x, y, top + (tray ? 0.15 : 0.3), top + (tray ? 0.35 : 0.5), 0.08, ch.swapping ? '#f59e0b' : '#ef4444');
      }
      if (sim.tray) {
        for (const tr of sim.trays) {
          const q = sim.trayAt(tr, alpha), f = Math.max(0, 1 - (sim.time - tr.tilt) / 0.6);
          D.box.rbox(q.x, q.y, -q.a, -0.5, -0.42, TZ - 0.2 - f * 0.2, 0.5, 0.42, TZ - f * 0.2, f > 0 ? '#38bdf8' : '#0ea5e9');
          if (tr.parcel) { const p = tr.parcel, s = 0.26 * p.size; D.box.box(q.x - s, q.y - s * 0.8, TZ, q.x + s, q.y + s * 0.8, TZ + 0.45, CARTON(p)); }
        }
        for (const p of sim.ports) {
          const x = p.slot.x, n = Math.min(4, p.queue.length);
          for (let k = 0; k < n; k++) { const q = p.queue[k], s = 0.26 * q.size, yy = 1.4 + k * 0.62; D.box.box(x - s, yy - s * 0.8, TZ - 0.1, x + s, yy + s * 0.8, TZ + 0.35, CARTON(q)); }
          const r = p.ready || p.cur;
          if (r) { const s = 0.26 * r.size, yy = g.Yt - 1.0; D.box.box(x - s, yy - s * 0.8, TZ - 0.1, x + s, yy + s * 0.8, TZ + 0.35, CARTON(r)); }
          if (!p.away) this.operator(x + 0.8, g.Yt - 2.6, Math.PI / 2, !!p.cur, '#f97316');
        }
      } else {
        for (const r of sim.fleet) this.sortRobot(r, r.prx + (r.rx - r.prx) * alpha + 0.5, r.pry + (r.ry - r.pry) * alpha + 0.5);
        for (const p of sim.ports) {
          const x = p.drop.x + 0.5, y0 = g.D, n = Math.min(4, p.queue.length);
          for (let k = 0; k < n; k++) { const q = p.queue[k], s = 0.24 * q.size, yy = y0 + 0.7 + k * 0.6; D.box.box(x + 1.2 - s, yy - s * 0.8, PZ + 0.1, x + 1.2 + s, yy + s * 0.8, PZ + 0.5, CARTON(q)); }
          if (p.ready) { const r = p.ready, s = 0.24 * r.size; D.box.box(x + 0.35 - s, y0 + 0.3 - s * 0.8, PZ + 0.2, x + 0.35 + s, y0 + 0.3 + s * 0.8, PZ + 0.6, CARTON(r)); }
          if (!p.away) this.operator(x - 0.2, y0 + 0.8, 0, !!p.cur, '#f97316', PZ);
        }
        for (const ch of g.chargers) { const on = ch.robot >= 0 && sim.fleet[ch.robot].state === 'CHARGING'; (on ? D.lit : D.box).box(ch.x + 0.35, 0.17, PZ + 1.2, ch.x + 0.65, 0.19, PZ + 1.5, on ? '#4ade80' : '#166534'); }
      }
      sim.workers.forEach((w, k) => {
        const x = w.px + (w.x - w.px) * alpha, y = w.py + (w.y - w.py) * alpha;
        this.operator(x, y, 0, w.state === 'SWAPPING', '#facc15', 0, 'bag worker ' + k);
      });
      // parcels falling into their chute
      const top = sim.tray ? TZ + 0.3 : PZ + 0.6;
      for (const d of sim.drops) {
        const f = (sim.time - d.t) / 0.5;
        if (f < 0 || f > 1) continue;
        const x = d.from.x + (d.to.x - d.from.x) * f, y = d.from.y + (d.to.y - d.from.y) * f, z = top - f * f * (sim.tray ? 1.2 : 2.6), s = 0.3 * d.parcel.size;
        D.box.box(x - s, y - s * 0.8, z, x + s, y + s * 0.8, z + 0.45, CARTON(d.parcel));
      }
    }
    // Sorter robot: a low white body, a state-coloured light band and a tilt
    // tray on top that tips the parcel into the hole.
    sortRobot(r, x, y) {
      const sim = this.sim, D = this.dy, pick = { kind: 'robot', id: r.id }, h = 0.3, z = PZ;
      D.rnd.box(x - h, y - h, z, x + h, y + h, z + 0.16, '#e2e8f0', pick);
      D.litRnd.box(x - h - 0.005, y - h - 0.005, z + 0.16, x + h + 0.005, y + h + 0.005, z + 0.24, WS.led(this, r, sim));
      D.rnd.box(x - h, y - h, z + 0.24, x + h, y + h, z + 0.34, '#e2e8f0', pick);
      const f = r.tip != null ? Math.min(1, (sim.time - r.tip) / 0.3) : 0;
      D.box.box(x - h, y - h, z + 0.36 - f * 0.1, x + h, y + h, z + 0.42 - f * 0.1, '#0ea5e9', pick);
      if (r.parcel && !f) { const p = r.parcel, s = 0.22 * p.size; D.box.box(x - s, y - s * 0.8, z + 0.42, x + s, y + s * 0.8, z + 0.85, CARTON(p)); }
    }
    drawStationsLive() {}

    pickFloor(f) {
      const g = this.sim.grid, x = Math.floor(f.x), y = Math.floor(f.y);
      for (const p of this.sim.ports) {
        const px = this.sim.tray ? p.slot.x : p.drop.x + 0.5, y0 = this.sim.tray ? 0.9 : g.D - 1, y1 = this.sim.tray ? g.Yt - 0.5 : g.D + 1.4;
        if (Math.abs(f.x - px) < 0.8 && f.y >= y0 && f.y <= y1) return { kind: 'port', id: p.idx };
      }
      return g.inside(x, y) ? { kind: 'cell', id: g.idx(x, y) } : null;
    }
    selectionBox(s, alpha) {
      const sim = this.sim, g = sim.grid;
      if (s.kind === 'cell') {
        const k = g.chuteAt[s.id];
        if (k >= 0 && sim.tray) { const ch = sim.chutes[k], dir = ch.side ? 1 : -1, y0 = ch.side ? g.Yb : g.Yt, ya = y0 + dir * 0.5, yb = y0 + dir * 2.9; return [ch.x - 0.5, Math.min(ya, yb), ch.x + 0.5, Math.max(ya, yb), 1.6]; }
        const x = g.cx(s.id), y = g.cy(s.id);
        return [x, y, x + 1, y + 1, sim.tray ? TZ : PZ + 0.02];
      }
      if (s.kind === 'port') { const p = sim.ports[s.id]; return sim.tray ? [p.slot.x - 0.5, 0.9, p.slot.x + 0.5, g.Yt - 0.5, TZ] : [p.drop.x - 0.3, g.D - 1, p.drop.x + 1.3, g.D + 1.4, PZ + 0.02]; }
      return super.selectionBox(s, alpha);
    }
    drawLabels() {
      const sim = this.sim, g = sim.grid, bg = 'rgba(15,23,42,0.82)';
      for (const p of sim.ports) this.label(`${p.code} · ${p.queue.length} waiting`, sim.tray ? p.slot.x : p.drop.x + 0.5, sim.tray ? 0.4 : g.D + 1.5, sim.tray ? 5 : PZ + 3, { size: 10, bg, color: '#fdba74' });
      if (this.cam.dist > 26 && !this.cam.walk) return; // chute names only up close
      for (const ch of sim.chutes) {
        const y = sim.tray ? (ch.side ? g.Yb + 3.0 : g.Yt - 3.0) : ch.y;
        this.label(ch.dest ? ch.dest.name.slice(3) : 'REJECT', ch.x, y, sim.tray ? 2.6 : PZ + 1, { size: 9, bg: ch.count >= sim.cfg.bagCapacity ? 'rgba(127,29,29,0.9)' : bg, color: '#e2e8f0' });
      }
    }
  }

  WS.SortRenderer3D = SortRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
