/* SortHub in the free 3D view: the raised robot deck with its holes, the
 * bags hanging below, the induct platforms and the robots. The bags, falling
 * parcels, bag workers, labels and following a parcel are every sorter's
 * (js/hub/render3d.js). */
(function (WS) {
  'use strict';
  const C = WS.CELL, PZ = 3.6; // deck height (render levels)

  class SortRenderer3D extends WS.HubRenderer3D {
    get robotZ() { return PZ; }
    get bagTop() { return PZ - 0.2; }
    get lampGap() { return 0.3; }
    get dropTop() { return PZ + 0.6; }
    get dropFall() { return 2.6; }
    get chuteZ() { return PZ - 1.5; }
    get pickZ() { return PZ + 0.02; }
    workLights() { const g = this.sim.grid; return this.sim.ports.map((p) => ({ x: p.drop.x + 1.2, y: g.D + 1.5 })); }
    fit() {
      super.fit();
      const g = this.sim.grid;
      Object.assign(this.cam, { tx: g.W / 2, ty: g.D / 2, dist: Math.max(g.W, g.D) * 1.05 });
    }
    staticParts(S) {
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
    liveParts(alpha) {
      const sim = this.sim, g = sim.grid, D = this.dy;
      for (const r of sim.fleet) this.sortRobot(r, r.prx + (r.rx - r.prx) * alpha + 0.5, r.pry + (r.ry - r.pry) * alpha + 0.5);
      for (const p of sim.ports) {
        const x = p.drop.x + 0.5, y0 = g.D, n = Math.min(4, p.queue.length);
        for (let k = 0; k < n; k++) { const q = p.queue[k], s = 0.24 * q.size, yy = y0 + 0.7 + k * 0.6; D.box.box(x + 1.2 - s, yy - s * 0.8, PZ + 0.1, x + 1.2 + s, yy + s * 0.8, PZ + 0.5, WS.CARTON(q)); }
        if (p.ready) { const r = p.ready, s = 0.24 * r.size; D.box.box(x + 0.35 - s, y0 + 0.3 - s * 0.8, PZ + 0.2, x + 0.35 + s, y0 + 0.3 + s * 0.8, PZ + 0.6, WS.CARTON(r)); }
        if (!p.away) this.operator(x - 0.2, y0 + 0.8, 0, !!p.cur, 'station', PZ);
      }
      for (const ch of g.chargers) { const on = ch.robot >= 0 && sim.fleet[ch.robot].state === 'CHARGING'; (on ? D.lit : D.box).box(ch.x + 0.35, 0.17, PZ + 1.2, ch.x + 0.65, 0.19, PZ + 1.5, on ? '#4ade80' : '#166534'); }
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
      if (r.parcel && !f) { const p = r.parcel, s = 0.22 * p.size; D.box.box(x - s, y - s * 0.8, z + 0.42, x + s, y + s * 0.8, z + 0.85, WS.CARTON(p)); }
    }

    inductQueueAt(p, k) { return { x: p.drop.x + 0.5, y: this.sim.grid.D + 0.7 + k * 0.6, z: PZ }; }
    inductReadyAt(p) { return { x: p.drop.x + 0.5, y: this.sim.grid.D + 0.3, z: PZ }; }
    inductRect(p) { const g = this.sim.grid; return [p.drop.x - 0.3, g.D - 1, p.drop.x + 1.3, g.D + 1.4, PZ + 0.02]; }
    inductLabel(p) { return { x: p.drop.x + 0.5, y: this.sim.grid.D + 1.5, z: PZ + 3 }; }
    chuteLabel(ch) { return { x: ch.x, y: ch.y, z: PZ + 1 }; }
    sorterFocus(pc, dest) {
      const r = this.sim.fleet.find((m) => m.parcel === pc), p = r && this.followPos(r.id, 1);
      return p ? Object.assign(p, { text: `${r.name} carries it to ${dest}${r.state === 'HANDLING' ? ' and tips it in' : ''}` }) : null;
    }
  }

  WS.SortRenderer3D = SortRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
