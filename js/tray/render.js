/* Isometric view of TrayLoop, the tilt-tray sorter: the inbound feeder and
 * induct belts with their operators, the loop with its trays (tilting as
 * they drop a parcel), the chutes with their bags. The bags, falling
 * parcels, bag workers and labels are every sorter's (js/hub/render.js). */
(function (WS) {
  'use strict';
  const TZ = 2.4; // tray height (render levels)

  class TrayRenderer extends WS.HubRenderer {
    // a chute's bag hangs beside the loop, at the end of its slide
    bagAt(ch) { const g = this.sim.grid; return { x: ch.x, y: (ch.side ? g.Yb : g.Yt) + (ch.side ? 2.45 : -2.45) }; }
    get techZ() { return 0; }
    get dropTop() { return TZ + 0.3; }
    get dropFall() { return 1.2; }
    scene(items, alpha) {
      const sim = this.sim, g = sim.grid, P = this.P.bind(this), sel = this.selected;
      // inbound feeder along the back and an induct belt down to the loop at each induct
      const last = sim.ports[sim.ports.length - 1].slot.x;
      items.push({ d: 0, fn: () => this.conveyor([{ x: -1.5, y: 0.6 }, { x: last, y: 0.6 }], 0.7, TZ - 0.2, '#334155', { legs: true }) });
      for (const p of sim.ports) {
        const s = p.slot, x = s.x;
        items.push({ d: x + 2.5, fn: () => {
          this.conveyor([{ x, y: 0.95 }, { x, y: g.Yt - 0.55 }], 0.6, TZ - 0.1, '#3b4658', { legs: true });
          const n = Math.min(4, p.queue.length);
          for (let k = 0; k < n; k++) { const q = p.queue[k], yy = 1.4 + k * 0.62, sz = 0.26 * q.size; this.box(x - sz, yy - sz * 0.8, TZ - 0.1, x + sz, yy + sz * 0.8, TZ + 0.35, WS.CARTON(q)); }
          const r = p.ready || p.cur;
          if (r) { const sz = 0.26 * r.size, yy = g.Yt - 1.0; this.box(x - sz, yy - sz * 0.8, TZ - 0.1, x + sz, yy + sz * 0.8, TZ + 0.35, WS.CARTON(r)); }
          if (sel && sel.kind === 'port' && sel.id === p.idx) this.quadTop(x - 0.5, 0.9, x + 0.5, g.Yt - 0.5, TZ + 0.02, null, '#38bdf8', 2.5);
        } });
        const op = { x: x + 0.8, y: g.Yt - 2.6 };
        if (!p.away) items.push({ d: op.x + op.y + 0.5, fn: () => this.drawOperator(op.x, op.y, !!p.cur, 'station') });
      }
      // the loop: a dark frame on legs under the trays
      items.push({ d: g.X0 + g.Yt - 0.5, fn: () => {
        const N = 64;
        for (let k = 0; k < N; k++) {
          const a = g.loopAt((k * g.Lp) / N), b = g.loopAt(((k + 1) * g.Lp) / N);
          if (k % 4 === 0) this.box(a.x - 0.06, a.y - 0.06, 0, a.x + 0.06, a.y + 0.06, TZ - 0.4, '#475569');
          this.line(P(a.x, a.y, TZ - 0.3), P(b.x, b.y, TZ - 0.3), '#1f2937', 40);
        }
      } });
      // chutes and their bags
      for (const ch of sim.chutes) {
        const dir = ch.side ? 1 : -1, y0 = ch.side ? g.Yb : g.Yt, x = ch.x, yb = y0 + dir * 2.45;
        items.push({ d: x + yb - 0.6, fn: () => this.bag(x, yb, 1.5, ch) });
        items.push({ d: x + y0 + dir * 1.2, fn: () => {
          const ya = y0 + dir * 0.55, yc = y0 + dir * 2.05, col = ch === sim.reject ? '#7f1d1d' : '#64748b';
          this.poly([P(x - 0.45, ya, TZ - 0.2), P(x + 0.45, ya, TZ - 0.2), P(x + 0.45, yc, 1.6), P(x - 0.45, yc, 1.6)], col, '#94a3b8', 1);
          this.line(P(x + 0.45, ya, TZ), P(x + 0.45, yc, 1.8), '#94a3b8', 2);
          const s2 = sel && sel.kind === 'cell' && g.chuteAt[sel.id] === ch.id;
          if (s2) this.quadTop(x - 0.5, Math.min(ya, yc), x + 0.5, Math.max(ya, yc) + 0.5, 1.7, null, '#38bdf8', 2.5);
        } });
      }
      // trays, tilting towards the chute as they drop a parcel
      for (const tr of sim.trays) {
        const q = sim.trayAt(tr, alpha), c = Math.cos(q.a), s = Math.sin(q.a), hl = 0.5, hw = 0.42;
        const f = Math.max(0, 1 - (sim.time - tr.tilt) / 0.6), out = q.y < (g.Yt + g.Yb) / 2 ? -1 : 1; // outward side of the loop
        items.push({ d: q.x + q.y, fn: () => {
          const corner = (u, v) => { const x = q.x + u * c - v * s, y = q.y + u * s + v * c, side = Math.sign((y - q.y) * out) || 0; return P(x, y, TZ - side * f * 0.35); };
          this.poly([corner(-hl, -hw), corner(hl, -hw), corner(hl, hw), corner(-hl, hw)], f > 0 ? '#38bdf8' : '#0ea5e9', '#0c4a6e', 1);
          if (tr.parcel) { const p = tr.parcel, z = p.size * 0.26; this.box(q.x - z, q.y - z * 0.8, TZ, q.x + z, q.y + z * 0.8, TZ + 0.45, WS.CARTON(p)); }
        } });
      }
    }

    inductLabel(p) { return { x: p.slot.x, y: 0.4, z: 4.4 }; }
    chuteLabel(ch) { const g = this.sim.grid; return { x: ch.x, y: ch.side ? g.Yb + 3.0 : g.Yt - 3.0, z: 2.4 }; }
    get title() { return { s: 'INBOUND PARCELS', x: -1, y: 0.6, z: 4.0 }; }
    get pickZ() { return TZ; }
    chuteHit(w, ch) { const g = this.sim.grid, cy = ch.side ? g.Yb + 1.6 : g.Yt - 1.6; return Math.abs(w.x - ch.x) < 0.55 && Math.abs(w.y - cy) < 1.0; }
    inductHit(w, p) { return Math.abs(w.x - p.slot.x) < 0.8 && w.y >= 0.9 && w.y <= this.sim.grid.Yt - 0.5; }
  }

  WS.TrayRenderer = TrayRenderer;
})((globalThis.WS = globalThis.WS || {}));
