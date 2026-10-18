/* RailRunner view: the shared see-through racking (WS.PreZoneRenderer) with a pair
 * of shuttle rails per level, shuttles running inside the aisles, a lift tower
 * at the front of every aisle, and the pre-zone conveyor to the stations. */
(function (WS) {
  'use strict';
  const { shade, STATE_COLORS } = WS;
  const TOTE_H = WS.RACK_TOTE_H;

  class ShuttleRenderer extends WS.PreZoneRenderer {
    drawScene() {
      const sim = this.sim, g = sim.grid;
      this.drawFloor();
      this.drawRacking();
      this.drawShuttles();
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
        const z = g.levelZ(l);
        this.line(P(lx + 0.12, 0, z), P(lx + 0.12, B, z), 'rgba(250,204,21,0.35)', 1);
        this.line(P(lx + 0.88, 0, z), P(lx + 0.88, B, z), 'rgba(250,204,21,0.35)', 1);
      }
    }

    // Shuttles, and the totes waiting in each level's front buffers.
    drawShuttles() {
      const sim = this.sim, g = sim.grid, B = g.B;
      for (const aisle of sim.aisles) {
        const a = aisle.a;
        for (let l = 0; l < g.L; l++) {
          const z = g.levelZ(l);
          [[aisle.outBuf[l], a * 3], [aisle.inBuf[l], a * 3 + 2]].forEach(([buf, x0]) => buf.forEach((it, k) => {
            const b = B - 1 - k, col = '#f59e0b';
            this.box(x0 + 0.1, b + 0.1, z + 0.06, x0 + 0.9, b + 0.9, z + 0.06 + TOTE_H, col, { top: shade(col, 0.2) });
          }));
        }
        for (const sh of aisle.shuttles) {
          const z = g.levelZ(sh.l), x0 = a * 3 + 1.08, x1 = a * 3 + 1.92, y0 = sh.pos - 0.45, y1 = sh.pos + 0.45, col = STATE_COLORS[sh.displayState];
          if (!sh.idle) this.glow(a * 3 + 1.5, sh.pos, z + 0.3, 22, col, 0.55);
          // dark chassis on the rails, a state-coloured light band, a yellow load handler on top
          this.box(x0, y0, z + 0.02, x1, y1, z + 0.34, '#273244', { top: '#3b4a60', left: '#222b3a', right: '#1a2230' });
          this.faceY(y1 + 0.002, x0 + 0.06, x1 - 0.06, z + 0.14, z + 0.24, col);
          this.faceX(x1 + 0.002, y0 + 0.06, y1 - 0.06, z + 0.14, z + 0.24, shade(col, -0.25));
          this.quadTop(x0 + 0.12, y0 + 0.08, x1 - 0.12, y1 - 0.08, z + 0.341, sh.idle ? '#5c4a14' : '#ca8a04');
          if (sh.bin) { const b = sim.inv.binById.get(sh.bin), c2 = this.toteColor(b); this.box(x0 + 0.08, y0 + 0.08, z + 0.34, x1 - 0.08, y1 - 0.08, z + 0.34 + TOTE_H, c2, { top: shade(c2, 0.15) }); }
          const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === sh.id;
          if (sel) this.quadTop(x0 - 0.1, y0 - 0.1, x1 + 0.1, y1 + 0.1, z + 0.02, null, '#38bdf8', 2.5);
        }
      }
    }
    // Lift tower in front of the aisle with its carriage and the I/O transfer.
    drawLift(aisle) {
      const g = this.sim.grid, lift = aisle.lift, x0 = aisle.a * 3 + 1.08, x1 = aisle.a * 3 + 1.92, y0 = g.B + 0.06, y1 = g.B + 0.94;
      for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) this.box(px - 0.04, py - 0.04, 0, px + 0.04, py + 0.04, g.Z + 0.8, '#64748b');
      this.box(x0 - 0.04, y0 - 0.04, g.Z + 0.8, x1 + 0.04, y1 + 0.04, g.Z + 1.1, '#475569');
      const col = STATE_COLORS[lift.displayState];
      this.box(x0 + 0.04, y0 + 0.04, lift.z - 0.12, x1 - 0.04, y1 - 0.04, lift.z, '#94a3b8', { top: '#334155' });
      this.faceY(y1 - 0.039, x0 + 0.04, x1 - 0.04, lift.z - 0.12, lift.z - 0.02, col);
      if (lift.bin) { const b = this.sim.inv.binById.get(lift.bin), c2 = this.toteColor(b); this.box(x0 + 0.12, y0 + 0.1, lift.z, x1 - 0.12, y1 - 0.1, lift.z + TOTE_H, c2, { top: shade(c2, 0.15) }); }
      if (!lift.idle) this.glow(aisle.a * 3 + 1.5, g.B + 0.5, lift.z + 0.5, 18, col, 0.45);
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === lift.id;
      if (sel) this.quadTop(x0 - 0.1, y0 - 0.1, x1 + 0.1, y1 + 0.1, lift.z, null, '#38bdf8', 2.5);
      // totes waiting to go up
      aisle.inQ.slice(0, 2).forEach((it, k) => this.drawBin(g.laneX(aisle.a), g.B + 0.55 + k * 0.6, 1.4, it.bin.id, { w: 0.26, d: 0.28 }));
    }
    machinePoints() {
      const g = this.sim.grid, out = [];
      for (const aisle of this.sim.aisles) {
        for (const sh of aisle.shuttles) out.push({ id: sh.id, x: g.laneX(aisle.a), y: sh.pos, z: g.levelZ(sh.l) + 0.3 });
        out.push({ id: aisle.lift.id, x: g.laneX(aisle.a), y: g.B + 0.5, z: aisle.lift.z });
      }
      return out;
    }
  }

  WS.ShuttleRenderer = ShuttleRenderer;
})((globalThis.WS = globalThis.WS || {}));
