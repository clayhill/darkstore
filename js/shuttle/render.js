/* RailRunner view: the shared see-through racking (WS.PreZoneRenderer) with a pair
 * of shuttle rails per level, orange shuttles running inside the aisles, the
 * level buffers rolling totes between the shuttles and the lift, a cyan lift
 * at the front of every aisle with a platform on each side, and the pre-zone
 * loop. */
(function (WS) {
  'use strict';
  const ORANGE = '#f97316', ORANGE_TOP = '#fdba74', CYAN = '#06b6d4', CYAN_TOP = '#67e8f9';

  class ShuttleRenderer extends WS.PreZoneRenderer {
    drawScene(alpha) {
      const sim = this.sim, g = sim.grid;
      this.drawFloor();
      if (sim.bots) {
        this.drawCached('bot-floor', g.W, () => this.drawBotFloor());
        if (this.opts.heat) this.drawHeat();
        if (this.opts.claims) this.drawClaims(0);
        if (this.opts.paths) this.drawPaths(alpha);
      }
      this.drawPreZone();
      this.drawRackScene((aisle) => this.aisleItems(aisle));
      this.drawSelectedCell();
      const items = [];
      for (const aisle of sim.aisles) items.push({ d: g.laneX(aisle.a) + g.B, fn: () => this.drawLift(aisle) });
      this.conveyorItems(items);
      if (sim.bots) this.botItems(items, alpha);
      this.drawStations(items);
    }
    // shuttle rails along the lane, one pair per level
    drawLaneRails(a) {
      const g = this.sim.grid, P = this.P.bind(this), lx = a * 3 + 1, B = g.B;
      for (let l = 0; l < g.L; l++) {
        if (!this.levelShown(l)) continue;
        const z = g.levelZ(l);
        this.line(P(lx + 0.12, 0, z), P(lx + 0.12, B, z), 'rgba(250,204,21,0.35)', 1);
        this.line(P(lx + 0.88, 0, z), P(lx + 0.88, B, z), 'rgba(250,204,21,0.35)', 1);
      }
    }

    // An aisle's shuttles and the totes in its levels' front buffers, on the
    // levels the cut-away shows.
    aisleItems(aisle) {
      const a = aisle.a, items = [() => this.drawBuffers(aisle)];
      for (const sh of aisle.shuttles) if (this.levelShown(sh.l)) items.push(() => this.drawShuttle(sh, a));
      return items;
    }
    // totes in the level buffers, where they have rolled to
    drawBuffers(aisle) {
      const g = this.sim.grid, a = aisle.a, T = this.sim.convTote();
      for (let l = 0; l < g.L; l++) {
        if (!this.levelShown(l)) continue;
        const z = g.levelZ(l) + 0.06;
        [[aisle.outBuf[l], g.outX(a)], [aisle.inBuf[l], g.inX(a)]].forEach(([buf, x]) => buf.forEach((it) => {
          if (this.moving.has(it.bin.id)) return;
          this.toteBox(x - T.w, it.pos - T.d, x + T.w, it.pos + T.d, z, this.toteColor(it.bin));
        }));
      }
    }
    // A shuttle in safety orange: two end units carrying the telescopic arms,
    // which reach into the left or right rack while it takes or puts a tote,
    // a dark deck between them for the tote, a status light on the front.
    drawShuttle(sh, a) {
      const sim = this.sim, g = sim.grid, z = g.levelZ(sh.l), cx = a * 3 + 1.5, y = sh.pos, x0 = cx - 0.42, x1 = cx + 0.42, y0 = y - 0.45, y1 = y + 0.45;
      const col = WS.led(this, sh, sim), edge = { stroke: 'rgba(15,23,42,0.55)', lw: 0.8 };
      if (!sh.idle) this.glow(cx, y, z + 0.3, 22, ORANGE, 0.4);
      const xf = this.xfer(sh), e = xf ? xf.reach * 0.75 : 0;
      this.box(x0 + 0.04, y0 + 0.14, z + 0.02, x1 - 0.04, y1 - 0.14, z + 0.12, '#1f2937', { top: '#334155' });
      // the tote on the deck, or sliding between the deck and the rack or a
      // buffer (growing to its rack size on the way into the rack)
      const id = xf && xf.u != null ? xf.id : sh.bin;
      if (id) {
        const T = sim.convTote(), u = xf && xf.u != null ? xf.u : 0, tx = cx + (this.sideX(a, xf ? xf.side : 0) - cx) * u, hd = xf && xf.io ? T.d : T.d + (0.4 - T.d) * Math.max(0, 2 * u - 1);
        this.toteBox(tx - T.w, y - hd, tx + T.w, y + hd, z + 0.12 - 0.06 * u, this.toteColor(sim.inv.binById.get(id)));
      }
      for (const [ya, yb] of [[y0, y0 + 0.14], [y1 - 0.14, y1]]) {
        this.box(x0, ya, z + 0.02, x1, yb, z + 0.38, ORANGE, Object.assign({ top: ORANGE_TOP }, edge));
        const ax0 = xf && xf.side === 0 ? x0 - e : x0, ax1 = xf && xf.side === 1 ? x1 + e : x1;
        this.box(ax0, ya + 0.03, z + 0.38, ax1, yb - 0.03, z + 0.45, '#e2e8f0', { top: '#f8fafc' });
      }
      this.faceY(y1 + 0.002, x0 + 0.1, x1 - 0.1, z + 0.16, z + 0.28, col);
      this.faceX(x1 + 0.002, y1 - 0.12, y1 - 0.02, z + 0.16, z + 0.28, col);
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === sh.id;
      if (sel) this.quadTop(x0 - 0.1, y0 - 0.1, x1 + 0.1, y1 + 0.1, z + 0.02, null, '#38bdf8', 2.5);
    }
    // Vertical lift in front of the aisle: two cyan columns in the middle with
    // a header, and a carriage with a roller platform on each side, in line
    // with the buffers and the aisle's conveyors (left out, right in).
    drawLift(aisle) {
      const sim = this.sim, g = sim.grid, lift = aisle.lift, ax = aisle.a * 3, B = g.B, H = g.Z + 0.8, z = lift.z;
      const col = WS.led(this, lift, sim), edge = { stroke: 'rgba(15,23,42,0.55)', lw: 0.8 }, cy = Object.assign({ top: CYAN_TOP }, edge);
      for (const px of [ax + 1.12, ax + 1.78]) this.box(px, B + 0.42, 0, px + 0.1, B + 0.58, H, CYAN, cy);
      this.box(ax + 1.06, B + 0.4, H, ax + 1.94, B + 0.6, H + 0.3, CYAN, cy);
      this.hazardY(B + 0.582, ax + 1.12, ax + 1.22, 0.1, 0.9, 3); this.hazardY(B + 0.582, ax + 1.78, ax + 1.88, 0.1, 0.9, 3);
      if (!lift.idle) this.glow(ax + 1.5, B + 0.5, z + 0.4, 20, CYAN, 0.45);
      this.box(ax + 0.9, B + 0.44, z - 0.16, ax + 2.1, B + 0.56, z - 0.02, '#0e7490', edge);
      for (const px of [ax + 0.08, ax + 2.08]) {
        this.box(px, B + 0.08, z - 0.12, px + 0.84, B + 0.92, z, CYAN, Object.assign({ top: '#164e63' }, edge));
        for (let k = 1; k < 6; k++) { const ry = B + 0.08 + (0.84 * k) / 6; this.line(this.P(px + 0.04, ry, z + 0.001), this.P(px + 0.8, ry, z + 0.001), '#67e8f9', 1); }
      }
      this.faceY(B + 0.562, ax + 1.3, ax + 1.7, z - 0.13, z - 0.05, col);
      if (lift.bin) {
        const T = sim.convTote(), x = lift.side ? g.inX(aisle.a) : g.outX(aisle.a), r = lift.roll;
        let y = B + 0.5;
        if (r) { const f = Math.min(1, (sim.time - r.t0) / r.dur); y = r.y0 + (r.y1 - r.y0) * f; }
        this.toteBox(x - T.w, y - T.d, x + T.w, y + T.d, z, this.toteColor(sim.inv.binById.get(lift.bin)));
      }
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === lift.id;
      if (sel) this.quadTop(ax + 0.02, B + 0.02, ax + 2.98, B + 0.98, z, null, '#38bdf8', 2.5);
    }
    machinePoints() {
      const g = this.sim.grid, out = [];
      for (const aisle of this.sim.aisles) {
        for (const sh of aisle.shuttles) if (this.levelShown(sh.l)) out.push({ id: sh.id, x: g.laneX(aisle.a), y: sh.pos, z: g.levelZ(sh.l) + 0.3 });
        out.push({ id: aisle.lift.id, x: g.laneX(aisle.a), y: g.B + 0.5, z: aisle.lift.z });
      }
      return out;
    }
  }

  WS.ShuttleRenderer = ShuttleRenderer;
})((globalThis.WS = globalThis.WS || {}));
