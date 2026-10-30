/* Isometric view of a parcel sorter: what every sorter shows (the bags under
 * the chutes, parcels falling into them, the bag workers, the labels and
 * picking a chute or an induct). Each sorter draws its own machine
 * (scene) and says where its bags hang, where labels go and what a click
 * hits. */
(function (WS) {
  'use strict';
  const SHADES = ['#b8875a', '#a8794f', '#c6956a', '#9c6f47', '#d0a070', '#b07d52', '#c08a5c'];
  WS.CARTON = (p) => SHADES[p.hue % SHADES.length]; // cardboard, a shade per parcel

  class HubRenderer extends WS.IsoRenderer {
    // where a chute's bag hangs (under its spot unless the sorter says otherwise)
    bagAt(ch) { return { x: ch.x, y: ch.y }; }
    get dropTop() { return 2.7; } // where a falling parcel starts and how far it falls (render levels)
    get dropFall() { return 1.2; }
    worldBounds() {
      const g = this.sim.grid, pts = [this.P(-2, -2, 6), this.P(g.W + 2, -2, 0), this.P(-2, g.D + 4, 0), this.P(g.W + 2, g.D + 4, 0), this.P(g.W + 2, -2, 6)];
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    }
    drawScene(alpha) {
      const g = this.sim.grid, P = this.P.bind(this);
      this.poly([P(-2, -2, 0), P(g.W + 2, -2, 0), P(g.W + 2, g.D + 4, 0), P(-2, g.D + 4, 0)], '#1a2332');
      this.ctx.globalAlpha = 0.5;
      for (let x = -2; x <= g.W + 2; x += 2) this.line(P(x, -2, 0), P(x, g.D + 4, 0), '#222d3f', 1);
      for (let y = -2; y <= g.D + 4; y += 2) this.line(P(-2, y, 0), P(g.W + 2, y, 0), '#222d3f', 1);
      this.ctx.globalAlpha = 1;
      const items = [];
      this.scene(items, alpha);
      this.sim.workers.forEach((w, k) => {
        const x = w.px + (w.x - w.px) * alpha, y = w.py + (w.y - w.py) * alpha;
        const b = w.chute && this.bagAt(w.chute);
        items.push({ d: x + y + 0.2, fn: () => this.drawOperator(x, y, w.state === 'SWAPPING', 'bag', 0, 'bag worker ' + k, { facing: b ? Math.atan2(x - b.x, y - b.y) : null }) });
      });
      this.dropItems(items);
      this.techItems(items);
      items.sort((a, b) => a.d - b.d);
      for (const it of items) it.fn();
    }
    scene() {}
    // Parcels falling from the sorter into their chute, for half a second.
    dropItems(items) {
      const sim = this.sim, top = this.dropTop;
      for (const d of sim.drops) {
        const f = (sim.time - d.t) / 0.5;
        if (f < 0 || f > 1) continue;
        const x = d.from.x + (d.to.x - d.from.x) * f, y = d.from.y + (d.to.y - d.from.y) * f, z = top - f * f * this.dropFall, s = 0.3 * d.parcel.size;
        items.push({ d: x + y + 0.6, fn: () => this.box(x - s, y - s * 0.8, z, x + s, y + s * 0.8, z + 0.45, WS.CARTON(d.parcel)) });
      }
    }
    // A bag hanging under a chute: the sack grows as it fills, red light when full.
    bag(x, y, z0, ch) {
      const cap = this.sim.cfg.bagCapacity, f = Math.min(1, ch.count / cap), full = ch.count >= cap;
      this.box(x - 0.42, y - 0.42, 0, x - 0.36, y - 0.36, z0, '#475569');
      this.box(x + 0.36, y + 0.36, 0, x + 0.42, y + 0.42, z0, '#475569');
      const h = 0.25 + f * (z0 - 0.35);
      this.box(x - 0.36, y - 0.36, z0 - h, x + 0.36, y + 0.36, z0, ch.swapping ? '#94a3b8' : '#e5e7eb', { top: '#f8fafc' });
      if (full || ch.swapping) this.glow(x, y, z0 + 0.3, 14, ch.swapping ? '#f59e0b' : '#ef4444', 0.7);
    }

    // labels: every induct's queue, every chute's destination up close, the sorter's name for its infeed
    inductLabel(p) { return { x: p.drop.x + 0.5, y: p.drop.y, z: 4.4 }; }
    chuteLabel(ch) { return { x: ch.x, y: ch.y, z: 2.4 }; }
    get title() { return null; }
    drawLabels() {
      const sim = this.sim, bg = 'rgba(15,23,42,0.82)';
      for (const p of sim.ports) { const q = this.inductLabel(p); this.text(`${p.code} · ${p.queue.length} waiting`, q.x, q.y, q.z, { size: 10, bg, color: '#fdba74' }); }
      if (this.cam.zoom > 1.1) for (const ch of sim.chutes) { const q = this.chuteLabel(ch); this.text(ch.dest ? ch.dest.name.slice(3) : 'REJECT', q.x, q.y, q.z, { size: 8, bg: ch.count >= sim.cfg.bagCapacity ? 'rgba(127,29,29,0.9)' : bg, color: '#e2e8f0' }); }
      const t = this.title;
      if (t) this.text(t.s, t.x, t.y, t.z, { size: 10, bg, color: '#86efac' });
    }

    // a click: what the sorter itself has (its robots), a chute (its slide or bag), an induct, or the floor
    pickMachine() { return null; }
    get pickZ() { return 2.4; }
    chuteHit(w, ch) { return Math.abs(w.x - ch.x) < 0.55 && Math.abs(w.y - ch.y) < 1.0; }
    inductHit(w, p) { return Math.abs(w.x - p.drop.x - 0.5) < 0.8 && Math.abs(w.y - p.drop.y - 0.5) < 0.8; }
    pick(sx, sy) {
      const sim = this.sim, g = sim.grid, m = this.pickMachine(sx, sy);
      if (m) return m;
      for (const zz of [this.pickZ, 1.6, 0.8]) {
        const w = this.toWorld(sx, sy, zz);
        for (const ch of sim.chutes) if (this.chuteHit(w, ch)) return { kind: 'cell', id: g.idx(Math.floor(ch.cell.x), Math.floor(ch.cell.y)) };
        for (const p of sim.ports) if (this.inductHit(w, p)) return { kind: 'port', id: p.idx };
      }
      const w = this.toWorld(sx, sy, this.pickZ), x = Math.floor(w.x), y = Math.floor(w.y);
      return g.inside(x, y) ? { kind: 'cell', id: g.idx(x, y) } : null;
    }
  }

  WS.HubRenderer = HubRenderer;
})((globalThis.WS = globalThis.WS || {}));
