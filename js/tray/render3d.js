/* TrayLoop in the free 3D view: the tilt-tray loop with its trays, the
 * chutes' slides, the inducts and the feeder. The bags, falling parcels,
 * bag workers, labels and following a parcel are every sorter's
 * (js/hub/render3d.js). */
(function (WS) {
  'use strict';
  const TZ = 2.4; // tray height (render levels)

  class TrayRenderer3D extends WS.HubRenderer3D {
    bagAt(ch) { const g = this.sim.grid; return { x: ch.x, y: (ch.side ? g.Yb : g.Yt) + (ch.side ? 2.45 : -2.45) }; }
    get dropTop() { return TZ + 0.3; }
    get pickZ() { return TZ; }
    workLights() { const g = this.sim.grid; return this.sim.ports.map((p) => ({ x: p.slot.x + 0.8, y: g.Yt - 2.6 })); }
    fit() {
      super.fit();
      const g = this.sim.grid;
      Object.assign(this.cam, { tx: g.W / 2, ty: g.D / 2, dist: Math.max(g.W, g.D) * 0.75 });
    }
    staticParts(S) {
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
        const dir = ch.side ? 1 : -1, y0 = ch.side ? g.Yb : g.Yt, x = ch.x, cell = this.chuteCell(ch);
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
    liveParts(alpha) {
      const sim = this.sim, g = sim.grid, D = this.dy;
      for (const tr of sim.trays) {
        const q = sim.trayAt(tr, alpha), f = Math.max(0, 1 - (sim.time - tr.tilt) / 0.6);
        D.box.rbox(q.x, q.y, -q.a, -0.5, -0.42, TZ - 0.2 - f * 0.2, 0.5, 0.42, TZ - f * 0.2, f > 0 ? '#38bdf8' : '#0ea5e9');
        if (tr.parcel) { const p = tr.parcel, s = 0.26 * p.size; D.box.box(q.x - s, q.y - s * 0.8, TZ, q.x + s, q.y + s * 0.8, TZ + 0.45, WS.CARTON(p)); }
      }
      for (const p of sim.ports) {
        const x = p.slot.x, n = Math.min(4, p.queue.length);
        for (let k = 0; k < n; k++) { const q = p.queue[k], s = 0.26 * q.size, yy = 1.4 + k * 0.62; D.box.box(x - s, yy - s * 0.8, TZ - 0.1, x + s, yy + s * 0.8, TZ + 0.35, WS.CARTON(q)); }
        const r = p.ready || p.cur;
        if (r) { const s = 0.26 * r.size, yy = g.Yt - 1.0; D.box.box(x - s, yy - s * 0.8, TZ - 0.1, x + s, yy + s * 0.8, TZ + 0.35, WS.CARTON(r)); }
        if (!p.away) this.operator(x + 0.8, g.Yt - 2.6, Math.PI / 2, !!p.cur, 'station');
      }
    }

    inductQueueAt(p, k) { return { x: p.slot.x, y: 1.4 + k * 0.62, z: TZ }; }
    inductReadyAt(p) { return { x: p.slot.x, y: this.sim.grid.Yt - 1, z: TZ }; }
    inductRect(p) { return [p.slot.x - 0.5, 0.9, p.slot.x + 0.5, this.sim.grid.Yt - 0.5, TZ]; }
    chuteRect(ch) { const g = this.sim.grid, dir = ch.side ? 1 : -1, y0 = ch.side ? g.Yb : g.Yt, ya = y0 + dir * 0.5, yb = y0 + dir * 2.9; return [ch.x - 0.5, Math.min(ya, yb), ch.x + 0.5, Math.max(ya, yb), 1.6]; }
    inductLabel(p) { return { x: p.slot.x, y: 0.4, z: 5 }; }
    chuteLabel(ch) { const g = this.sim.grid; return { x: ch.x, y: ch.side ? g.Yb + 3.0 : g.Yt - 3.0, z: 2.6 }; }
    sorterFocus(pc, dest) {
      const tr = this.sim.trays.find((t) => t.parcel === pc);
      if (!tr) return null;
      const q = this.sim.trayAt(tr, 1);
      return { x: q.x, y: q.y, z: TZ, text: `On tray ${tr.id + 1} to ${dest}${pc.laps ? ` · lap ${pc.laps + 1}: its chute was full` : ''}` };
    }
  }

  WS.TrayRenderer3D = TrayRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
