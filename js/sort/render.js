/* Isometric view of SortHub, the robot sorter: the raised deck with a hole
 * per chute, the bags hanging below it, the inducts along the front and the
 * robots tipping parcels through the holes. The bags, falling parcels, bag
 * workers and labels are every sorter's (js/hub/render.js). */
(function (WS) {
  'use strict';
  const C = WS.CELL, PZ = 3.6; // deck height (render levels)

  class SortRenderer extends WS.HubRenderer {
    get techZ() { return PZ; }
    get dropTop() { return PZ + 0.6; }
    get dropFall() { return 2.6; }
    scene(items, alpha) {
      const sim = this.sim, g = sim.grid, P = this.P.bind(this), sel = this.selected;
      // under the deck: posts and the bags under the holes (drawn first, the deck hides them partly)
      for (let x = 0; x <= g.W; x += 3) for (let y = 1; y <= g.D - 1; y += 3) this.box(x - 0.05, y - 0.05, 0, x + 0.05, y + 0.05, PZ, '#475569');
      for (const ch of sim.chutes) this.bag(ch.x, ch.y, PZ - 0.4, ch);
      // the deck: a grating with the holes, the induct lanes along the front and the chargers at the back
      this.ctx.globalAlpha = 0.86;
      this.poly([P(0, 1, PZ), P(g.W, 1, PZ), P(g.W, g.D - 1, PZ), P(0, g.D - 1, PZ)], '#2b3546', '#475569', 1);
      this.ctx.globalAlpha = 0.25;
      for (let x = 0; x <= g.W; x++) this.line(P(x, 1, PZ + 0.01), P(x, g.D - 1, PZ + 0.01), '#64748b', 1);
      for (let y = 1; y <= g.D - 1; y++) this.line(P(0, y, PZ + 0.01), P(g.W, y, PZ + 0.01), '#64748b', 1);
      this.ctx.globalAlpha = 1;
      for (let y = 0; y < g.D; y += g.D - 1) for (let x = 0; x < g.W; x++) {
        const t = g.type[g.idx(x, y)];
        if (t === C.LANE || t === C.PORT || t === C.HIGHWAY) this.quadTop(x + 0.02, y + 0.02, x + 0.98, y + 0.98, PZ, t === C.PORT ? '#3a2f12' : t === C.LANE ? '#2a2614' : '#2b3546', t === C.PORT ? '#facc15' : null, 1.5);
        else if (t === C.CHARGER) this.quadTop(x + 0.1, y + 0.1, x + 0.9, y + 0.9, PZ, '#14532d', '#4ade80', 1.2);
        else if (t === C.PARK) this.quadTop(x + 0.1, y + 0.1, x + 0.9, y + 0.9, PZ, null, 'rgba(148,163,184,0.35)', 1);
      }
      for (const ch of sim.chutes) {
        const x = Math.floor(ch.x), y = Math.floor(ch.y), full = ch.count >= sim.cfg.bagCapacity;
        this.quadTop(x + 0.12, y + 0.12, x + 0.88, y + 0.88, PZ + 0.01, '#05080e', full ? '#ef4444' : ch === sim.reject ? '#f87171' : '#facc15', 2);
        const f = Math.min(1, ch.count / sim.cfg.bagCapacity);
        this.quadTop(x + 0.12, y + 0.92, x + 0.12 + 0.76 * f, y + 0.98, PZ + 0.01, full ? '#ef4444' : '#4ade80');
        if (sel && sel.kind === 'cell' && sel.id === g.idx(x, y)) this.quadTop(x, y, x + 1, y + 1, PZ + 0.02, null, '#38bdf8', 2.5);
      }
      if (this.opts.claims) {
        for (const r of sim.fleet) {
          const col = WS.stateColor(sim, r.displayState);
          for (const i of r.claims) { const x = g.cx(i), y = g.cy(i); if (x !== r.x || y !== r.y) this.quadTop(x + 0.15, y + 0.15, x + 0.85, y + 0.85, PZ + 0.02, WS.rgba(col, 0.15), WS.rgba(col, 0.5), 1); }
        }
      }
      if (this.opts.paths) this.drawPaths(alpha, PZ);
      // inducts: a platform at the front with the operator, the feed belt coming in from the front
      for (const p of sim.ports) {
        const x = p.drop.x + 0.5, y0 = g.D;
        items.push({ d: x + y0 + 0.4, fn: () => {
          this.box(x - 0.8, y0, 0, x + 0.8, y0 + 1.4, PZ - 0.05, '#334155', { top: '#1f2937' });
          this.conveyor([{ x: x + 1.2, y: y0 + 3 }, { x: x + 1.2, y: y0 + 0.2 }], 0.55, PZ + 0.1, '#3b4658', { legs: true });
          const n = Math.min(4, p.queue.length);
          for (let k = 0; k < n; k++) { const q = p.queue[k], sz = 0.24 * q.size, yy = y0 + 0.7 + k * 0.6; this.box(x + 1.2 - sz, yy - sz * 0.8, PZ + 0.1, x + 1.2 + sz, yy + sz * 0.8, PZ + 0.5, WS.CARTON(q)); }
          if (p.ready) { const r = p.ready, sz = 0.24 * r.size; this.box(x + 0.35 - sz, y0 + 0.3 - sz * 0.8, PZ + 0.2, x + 0.35 + sz, y0 + 0.3 + sz * 0.8, PZ + 0.6, WS.CARTON(r)); }
          if (sel && sel.kind === 'port' && sel.id === p.idx) this.quadTop(x - 0.8, y0 - 1, x + 0.8, y0 + 1.4, PZ + 0.03, null, '#38bdf8', 2.5);
        } });
        if (!p.away) items.push({ d: x + y0 + 1.3, fn: () => this.drawOperator(x - 0.2, y0 + 0.8, !!p.cur, 'station', PZ) });
      }
      for (const ch of g.chargers) items.push({ d: ch.x + 0.5, fn: () => { this.box(ch.x + 0.3, 0.02, PZ, ch.x + 0.7, 0.18, PZ + 1.6, '#334155'); const on = ch.robot >= 0 && sim.fleet[ch.robot].state === 'CHARGING'; this.glow(ch.x + 0.5, 0.1, PZ + 1.3, 12, '#4ade80', on ? 0.9 : 0.3); } });
      // robots: a low body with a state-coloured band and a tilting top that tips the parcel
      for (const r of sim.fleet) {
        const x = r.prx + (r.rx - r.prx) * alpha + 0.5, y = r.pry + (r.ry - r.pry) * alpha + 0.5;
        items.push({ d: x + y, fn: () => this.drawSortRobot(r, x, y) });
      }
    }
    drawSortRobot(r, x, y) {
      const sim = this.sim, col = WS.led(this, r, sim), h = 0.3, z = PZ;
      this.box(x - h, y - h, z, x + h, y + h, z + 0.32, '#e2e8f0', { left: '#cbd5e1', right: '#94a3b8', top: '#f1f5f9' });
      this.faceY(y + h + 0.004, x - h, x + h, z + 0.16, z + 0.24, col); this.faceX(x + h + 0.004, y - h, y + h, z + 0.16, z + 0.24, col);
      // the tilt tray on top, tipped towards the hole while tipping
      const f = r.tip != null ? Math.min(1, (sim.time - r.tip) / 0.3) : 0, t = r.task && r.task.chute, P = this.P.bind(this);
      let dx = 0, dy = 0;
      if (f && t) { dx = Math.sign(Math.floor(t.x) - Math.floor(x)); dy = Math.sign(Math.floor(t.y) - Math.floor(y)); }
      const zc = (u, v) => z + 0.42 + (u * dx + v * dy) * -0.25 * f;
      this.poly([P(x - h, y - h, zc(-1, -1)), P(x + h, y - h, zc(1, -1)), P(x + h, y + h, zc(1, 1)), P(x - h, y + h, zc(-1, 1))], '#0ea5e9', '#0c4a6e', 1);
      if (r.parcel && !f) { const p = r.parcel, s = 0.22 * p.size; this.box(x - s, y - s * 0.8, z + 0.42, x + s, y + s * 0.8, z + 0.85, WS.CARTON(p)); }
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === r.id;
      if (sel) this.quadTop(x - 0.55, y - 0.55, x + 0.55, y + 0.55, z + 0.02, null, '#38bdf8', 2.5);
      if (this.opts.labels && this.cam.zoom > 1.2) this.robotTag(r, x, y, z + 1.6, 'rgba(241,245,249,0.85)');
    }

    inductLabel(p) { return { x: p.drop.x + 0.5, y: this.sim.grid.D + 1.5, z: PZ + 2.6 }; }
    chuteLabel(ch) { return { x: ch.x, y: ch.y, z: PZ + 0.8 }; }
    get title() { const g = this.sim.grid; return { s: 'INDUCTION', x: g.W / 2, y: g.D + 3.4, z: PZ + 1.4 }; }
    get pickZ() { return PZ; }
    pickMachine(sx, sy) {
      let best = null, bd = 18 * Math.max(1, this.cam.zoom);
      for (const r of this.sim.fleet) {
        const [px, py] = this.P(r.rx + 0.5, r.ry + 0.5, PZ + 0.4);
        const d = Math.hypot(this.cam.x + px * this.cam.zoom - sx, this.cam.y + py * this.cam.zoom - sy);
        if (d < bd) { bd = d; best = { kind: 'robot', id: r.id }; }
      }
      return best;
    }
    inductHit(w, p) { const g = this.sim.grid; return Math.abs(w.x - p.drop.x - 0.5) < 0.8 && w.y >= g.D - 1 && w.y <= g.D + 1.4; }
  }

  WS.SortRenderer = SortRenderer;
})((globalThis.WS = globalThis.WS || {}));
