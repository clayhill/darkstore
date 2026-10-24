/* An accumulating conveyor along a polyline (CaseCraft's case and pallet
 * conveyors, LayerLift's pallet lines): items (cases, pallets) keep `gap`
 * apart and stop at its end. An exit takes an item that has reached its
 * point (a divert, a merge, the end); a gate holds an item at its point
 * until it lets it pass (a measuring tunnel). Items are { len, s, ps, … }:
 * s is where the item's middle is along the conveyor, ps where it was a
 * tick ago. */
(function (WS) {
  'use strict';
  class Conveyor {
    constructor(name, pts, v, gap = 0.05) {
      Object.assign(this, { name, pts, v, gap, items: [], exits: [], gates: [] });
      this.segs = []; let s = 0;
      for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], l = Math.hypot(b.x - a.x, b.y - a.y); this.segs.push({ a, b, s0: s, l }); s += l; }
      this.len = s;
    }
    at(s) {
      const sg = this.segs; let g = sg[sg.length - 1];
      for (const q of sg) if (s <= q.s0 + q.l) { g = q; break; }
      const t = g.l ? Math.min(1, Math.max(0, (s - g.s0) / g.l)) : 0;
      return { x: g.a.x + (g.b.x - g.a.x) * t, y: g.a.y + (g.b.y - g.a.y) * t, a: Math.atan2(g.b.x - g.a.x, g.b.y - g.a.y) };
    }
    // the distance along to the point nearest (x, y)
    sOf(x, y) {
      let best = 0, bd = Infinity;
      for (const g of this.segs) { const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, t = g.l ? Math.max(0, Math.min(1, ((x - g.a.x) * dx + (y - g.a.y) * dy) / (g.l * g.l))) : 0, d = Math.hypot(g.a.x + dx * t - x, g.a.y + dy * t - y); if (d < bd) { bd = d; best = g.s0 + g.l * t; } }
      return best;
    }
    room(s0, len) { for (const it of this.items) if (Math.abs(it.s - s0) < (it.len + len) / 2 + this.gap - 1e-9) return false; return true; }
    put(it, s0) {
      it.s = s0; it.conv = this; it.ps = s0;
      let k = 0; while (k < this.items.length && this.items[k].s > s0) k++;
      this.items.splice(k, 0, it);
    }
    get front() { return this.items[0]; }
    atEnd(it) { return it && it.s >= this.len - it.len / 2 - 1e-6; }
    take() { const it = this.items.shift(); it.conv = null; return it; }
    // an exit to another conveyor at its distance s0
    to(conv, s0, s = this.len, want = null) { this.exits.push({ s, want, take: (it) => (conv.room(s0, it.len) ? (conv.put(it, s0), true) : false) }); this.exits.sort((a, b) => a.s - b.s); }
    update(dt) {
      const d = this.v * dt;
      for (let k = 0; k < this.items.length; k++) {
        const it = this.items[k];
        it.ps = it.s;
        let stop = this.len - it.len / 2;
        if (k) { const q = this.items[k - 1]; stop = Math.min(stop, q.s - (q.len + it.len) / 2 - this.gap); }
        for (const g of this.gates) if (g.s >= it.s - 1e-9 && it.s + d >= g.s && g.s < stop && !g.pass(it)) { stop = g.s; break; }
        let left = false;
        for (const e of this.exits) {
          const at = e.s >= this.len - 1e-9 ? this.len - it.len / 2 : e.s;
          if (at < it.s - 1e-6 || at > stop + 1e-9 || (e.want && !e.want(it))) continue;
          if (it.s + d >= at - 1e-9) { this.items.splice(k, 1); if (e.take(it)) { left = true; break; } this.items.splice(k, 0, it); it.conv = this; }
          stop = Math.min(stop, at); break;
        }
        if (left) { k--; continue; }
        if (stop > it.s) it.s = Math.min(stop, it.s + d);
      }
    }
  }


  WS.Conveyor = Conveyor;
})((globalThis.WS = globalThis.WS || {}));
