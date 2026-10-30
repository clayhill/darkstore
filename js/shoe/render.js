/* Isometric view of ShoeLine, the sliding shoe sorter: the induct belts
 * fanning in to the merge, the line of slats (moving), parcels pushed off
 * diagonally into the chutes on both sides, the reject chute at the end and
 * the recirculation belt back to the merge. The bags, falling parcels, bag
 * workers and labels are every sorter's (js/hub/render.js). */
(function (WS) {
  'use strict';
  const SZ = 2.2; // the slats' height (render levels)

  class ShoeRenderer extends WS.HubRenderer {
    get G() { return this.sim.G; }
    // a chute's bag hangs at the end of its slide, beside the line or straight ahead of it
    bagAt(ch) { const G = this.G; return ch.side === 2 ? { x: ch.x + 0.3, y: G.yL } : { x: ch.x, y: ch.y }; }
    get techZ() { return 0; }
    get dropTop() { return SZ + 0.1; }
    get dropFall() { return 1.0; }
    // a belt along pts: the shared conveyor where it runs along an axis, a strip where it runs at an angle (the induct belts fanning in)
    belt(pts, w, z, col) {
      const P = this.P.bind(this);
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k];
        if (Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6) { this.conveyor([a, b], w, z, col, { legs: true }); continue; }
        const l = Math.hypot(b.x - a.x, b.y - a.y), nx = (-(b.y - a.y) / l) * (w / 2), ny = ((b.x - a.x) / l) * (w / 2);
        this.poly([P(a.x + nx, a.y + ny, z - 0.3), P(b.x + nx, b.y + ny, z - 0.3), P(b.x + nx, b.y + ny, z), P(a.x + nx, a.y + ny, z)], '#1f2937');
        this.poly([P(a.x - nx, a.y - ny, z), P(a.x + nx, a.y + ny, z), P(b.x + nx, b.y + ny, z), P(b.x - nx, b.y - ny, z)], col, '#1f2937', 1);
      }
    }
    parcel(x, y, z, p) { const l = WS.SHOE_PLEN(p) / 2, w = 0.25 * p.size; this.box(x - l, y - w, z, x + l, y + w, z + 0.4, WS.CARTON(p)); }
    scene(items, alpha) {
      const sim = this.sim, G = this.G, P = this.P.bind(this), sel = this.selected, v = sim.cfg.sorterSpeed, now = sim.time + alpha * sim.cfg.tick;
      // the line: its frame on legs, slats sliding past
      items.push({ d: G.X0 + G.yL - 1, fn: () => {
        this.box(G.X0 - 0.2, G.yL - 0.55, SZ - 0.35, G.X1, G.yL + 0.55, SZ - 0.05, '#1f2937', { top: '#334155' });
        for (let x = G.X0; x <= G.X1; x += 3) for (const y of [G.yL - 0.5, G.yL + 0.5]) this.box(x - 0.05, y - 0.05, 0, x + 0.05, y + 0.05, SZ - 0.35, '#475569');
        const ph = (now * v) % 0.3;
        this.ctx.globalAlpha = 0.5;
        for (let x = G.X0 + ph; x < G.X1; x += 0.3) this.line(P(x, G.yL - 0.5, SZ - 0.04), P(x, G.yL + 0.5, SZ - 0.04), '#94a3b8', 1);
        this.ctx.globalAlpha = 1;
      } });
      // the induct belts down to the merge, each with its operator; the return belt round the back
      for (const p of sim.ports) {
        const s = p.slot, q = sim.feeds[p.idx];
        items.push({ d: s.x + s.y, fn: () => {
          this.conveyor([{ x: s.x, y: 0.5 }, { x: s.x, y: s.y - 0.4 }], 0.55, SZ - 0.1, '#334155', { legs: true });
          this.belt(q.pts, 0.55, SZ - 0.1, '#3b4658');
          const n = Math.min(4, p.queue.length);
          for (let k = 0; k < n; k++) { const c = p.queue[k], yy = 0.9 + k * 0.7; this.parcel(s.x, yy, SZ - 0.1, c); }
          if (p.ready || p.cur) this.parcel(s.x, s.y - 0.1, SZ - 0.1, p.ready || p.cur);
          for (const it of q.items) { const a = q.at(it.s); this.parcel(a.x, a.y, SZ - 0.1, it.p); }
          if (sel && sel.kind === 'port' && sel.id === p.idx) this.quadTop(s.x - 0.5, 0.5, s.x + 0.5, s.y + 0.5, SZ, null, '#38bdf8', 2.5);
        } });
        if (!p.away) items.push({ d: s.x + s.y + 0.6, fn: () => this.drawOperator(s.x + 0.7, s.y - 0.4, !!p.cur, 'station') });
      }
      items.push({ d: G.Xr + G.yR, fn: () => { this.conveyor(sim.ret.pts, 0.55, SZ - 0.1, '#3b4658', { legs: true }); for (const it of sim.ret.items) { const a = sim.ret.at(it.s); this.parcel(a.x, a.y, SZ - 0.1, it.p); } } });
      // the chutes: a slide from the line's edge down to the bag; the reject chute straight ahead at the end
      for (const ch of sim.chutes) {
        const b = this.bagAt(ch), col = ch === sim.reject ? '#7f1d1d' : '#64748b', cs = sel && sel.kind === 'cell' && sim.grid.chuteAt[sel.id] === ch.id;
        items.push({ d: b.x + b.y - 0.6, fn: () => this.bag(b.x, b.y, 1.4, ch) });
        items.push({ d: ch.x + (ch.side === 2 ? G.yL : G.yL + (ch.side ? 1.2 : -1.2)), fn: () => {
          if (ch.side === 2) this.poly([P(G.X1, G.yL - 0.45, SZ - 0.1), P(G.X1, G.yL + 0.45, SZ - 0.1), P(b.x - 0.4, G.yL + 0.45, 1.5), P(b.x - 0.4, G.yL - 0.45, 1.5)], col, '#94a3b8', 1);
          else { const d = ch.side ? 1 : -1, ya = G.yL + d * 0.55, yc = G.yL + d * 2.05; this.poly([P(ch.x - 0.65, ya, SZ - 0.1), P(ch.x + 0.65, ya, SZ - 0.1), P(ch.x + 0.4, yc, 1.5), P(ch.x - 0.4, yc, 1.5)], col, '#94a3b8', 1); }
          if (cs) this.quadTop(b.x - 0.6, b.y - 0.6, b.x + 0.6, b.y + 0.6, 1.55, null, '#38bdf8', 2.5);
        } });
      }
      // the parcels on the slats, and those the shoes are pushing off (sliding diagonally to the side)
      for (const it of sim.line) { const q = sim.lineAt(it, alpha); items.push({ d: q.x + q.y, fn: () => this.parcel(q.x, q.y, SZ, it.p) }); }
      for (const d of sim.diverts) {
        const f = (now - d.t) / sim.cfg.divertTime;
        if (f < 0 || f > 1) continue;
        const x = d.x + v * (now - d.t), y = G.yL + (d.ch.side ? 1 : -1) * 0.95 * f;
        items.push({ d: x + y, fn: () => {
          // the shoes: a diagonal row of green blocks under the parcel's trailing edge
          for (let k = 0; k < 4; k++) { const sx = x - 0.3 + k * 0.08, sy = G.yL + (d.ch.side ? 1 : -1) * (-0.45 + Math.min(0.9, f * 0.95 + k * 0.03)); this.box(sx - 0.03, sy - 0.04, SZ - 0.04, sx + 0.03, sy + 0.04, SZ + 0.05, '#22c55e'); }
          this.parcel(x, y, SZ, d.p);
        } });
      }
    }

    inductLabel(p) { return { x: p.slot.x, y: 0.2, z: 4.2 }; }
    chuteLabel(ch) { const G = this.G; return ch.side === 2 ? { x: ch.x + 0.3, y: G.yL - 1.1, z: 2.4 } : { x: ch.x, y: G.yL + (ch.side ? 3.0 : -3.0), z: 2.2 }; }
    get title() { const G = this.G; return { s: 'INDUCTS', x: G.inX(0) - 1, y: 0.3, z: 3.6 }; }
    get pickZ() { return SZ; }
    chuteHit(w, ch) { const b = this.bagAt(ch), G = this.G, mid = ch.side === 2 ? b : { x: ch.x, y: (G.yL + b.y) / 2 }; return Math.abs(w.x - mid.x) < 0.7 && Math.abs(w.y - mid.y) < 1.2; }
    inductHit(w, p) { return Math.abs(w.x - p.slot.x) < 0.8 && w.y >= 0.4 && w.y <= p.slot.y + 0.5; }
  }

  WS.ShoeRenderer = ShoeRenderer;
})((globalThis.WS = globalThis.WS || {}));
