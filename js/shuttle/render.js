/* RailRunner view: the shared see-through racking (WS.PreZoneRenderer) with a pair
 * of shuttle rails per level, orange shuttles running inside the aisles, a cyan
 * lift tower at the front of every aisle, and the pre-zone conveyor to the
 * stations. */
(function (WS) {
  'use strict';
  const { shade } = WS;
  const TOTE_H = WS.RACK_TOTE_H;
  const ORANGE = '#f97316', ORANGE_TOP = '#fdba74', CYAN = '#06b6d4', CYAN_TOP = '#67e8f9';

  class ShuttleRenderer extends WS.PreZoneRenderer {
    drawScene() {
      const sim = this.sim, g = sim.grid;
      this.drawFloor();
      this.drawRackScene((aisle) => this.aisleItems(aisle));
      this.drawSelectedCell();
      const items = [];
      for (const aisle of sim.aisles) items.push({ d: g.laneX(aisle.a) + g.B, fn: () => this.drawLift(aisle) });
      this.conveyorItems(items);
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
    drawBuffers(aisle) {
      const g = this.sim.grid, B = g.B, a = aisle.a;
      for (let l = 0; l < g.L; l++) {
        if (!this.levelShown(l)) continue;
        const z = g.levelZ(l);
        [[aisle.outBuf[l], a * 3], [aisle.inBuf[l], a * 3 + 2]].forEach(([buf, x0]) => buf.forEach((it, k) => {
          if (this.moving.has(it.bin.id)) return;
          const b = B - 1 - k;
          this.toteBox(x0 + 0.1, b + 0.1, x0 + 0.9, b + 0.9, z + 0.06, this.toteColor(it.bin));
        }));
      }
    }
    // A shuttle in safety orange: two end units carrying the telescopic arms,
    // which reach into the left or right rack while it takes or puts a tote,
    // a dark deck between them for the tote, a status light on the front.
    drawShuttle(sh, a) {
      const sim = this.sim, g = sim.grid, z = g.levelZ(sh.l), cx = a * 3 + 1.5, y = sh.pos, x0 = cx - 0.42, x1 = cx + 0.42, y0 = y - 0.45, y1 = y + 0.45;
      const col = WS.stateColor(sim, sh.displayState), edge = { stroke: 'rgba(15,23,42,0.55)', lw: 0.8 };
      if (!sh.idle) this.glow(cx, y, z + 0.3, 22, ORANGE, 0.4);
      const xf = this.xfer(sh), e = xf ? xf.reach * 0.75 : 0;
      this.box(x0 + 0.04, y0 + 0.14, z + 0.02, x1 - 0.04, y1 - 0.14, z + 0.12, '#1f2937', { top: '#334155' });
      // the tote on the deck, or sliding between the deck and the rack or a buffer
      const id = xf && xf.u != null ? xf.id : sh.bin;
      if (id) {
        const u = xf && xf.u != null ? xf.u : 0, tx = cx + (this.sideX(a, xf ? xf.side : 0) - cx) * u;
        this.toteBox(tx - 0.32, y0 + 0.17, tx + 0.32, y1 - 0.17, z + 0.12 - 0.06 * u, this.toteColor(sim.inv.binById.get(id)));
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
    // Vertical lift in front of the aisle: cyan columns and header, and a
    // carriage with a roller conveyor that carries one tote.
    drawLift(aisle) {
      const g = this.sim.grid, lift = aisle.lift, x0 = aisle.a * 3 + 1.06, x1 = aisle.a * 3 + 1.94, y0 = g.B + 0.06, y1 = g.B + 0.94, H = g.Z + 0.8;
      const col = WS.stateColor(this.sim, lift.displayState), edge = { stroke: 'rgba(15,23,42,0.55)', lw: 0.8 }, cy = Object.assign({ top: CYAN_TOP }, edge);
      for (const px of [x0, x1 - 0.1]) this.box(px, y0, 0, px + 0.1, y0 + 0.12, H, CYAN, cy);
      this.box(x0, y0, H, x1, y0 + 0.16, H + 0.3, CYAN, cy);
      this.hazardY(y0 + 0.122, x0, x0 + 0.1, 0.1, 0.9, 3); this.hazardY(y0 + 0.122, x1 - 0.1, x1, 0.1, 0.9, 3);
      if (!lift.idle) this.glow(aisle.a * 3 + 1.5, g.B + 0.5, lift.z + 0.4, 20, CYAN, 0.45);
      this.box(x0 + 0.1, y0 + 0.12, lift.z - 0.16, x1 - 0.1, y1 - 0.04, lift.z, CYAN, Object.assign({ top: '#164e63' }, edge));
      for (let k = 1; k < 6; k++) { const ry = y0 + 0.12 + ((y1 - y0 - 0.16) * k) / 6; this.line(this.P(x0 + 0.12, ry, lift.z + 0.001), this.P(x1 - 0.12, ry, lift.z + 0.001), '#67e8f9', 1); }
      this.faceY(y1 - 0.038, x0 + 0.16, x1 - 0.16, lift.z - 0.13, lift.z - 0.05, col);
      if (lift.bin) { const b = this.sim.inv.binById.get(lift.bin), c2 = this.toteColor(b); this.box(x0 + 0.16, y0 + 0.18, lift.z, x1 - 0.16, y1 - 0.1, lift.z + TOTE_H, c2, { top: shade(c2, 0.15) }); }
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === lift.id;
      if (sel) this.quadTop(x0 - 0.1, y0 - 0.1, x1 + 0.1, y1 + 0.1, lift.z, null, '#38bdf8', 2.5);
      // totes waiting to go up
      aisle.inQ.slice(0, 2).forEach((it, k) => this.drawBin(g.laneX(aisle.a), g.B + 0.55 + k * 0.6, 1.4, it.bin.id, { w: 0.26, d: 0.28 }));
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
