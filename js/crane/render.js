/* SkyStack view: the shared see-through racking (WS.PreZoneRenderer) with a floor
 * rail and a top guide rail in every aisle, a stacker crane per aisle (mast,
 * drive unit, carriage with a twin load handler), returning totes waiting at
 * the I/O point and the pre-zone conveyor to the stations. */
(function (WS) {
  'use strict';

  class CraneRenderer extends WS.PreZoneRenderer {
    drawScene() {
      const sim = this.sim, g = sim.grid;
      this.drawFloor();
      this.drawRacking();
      this.drawSelectedCell();
      const items = [];
      for (const aisle of sim.aisles) {
        items.push({ d: g.laneX(aisle.a) + aisle.crane.pos, fn: () => this.drawCrane(aisle.crane) });
        items.push({ d: g.laneX(aisle.a) + g.B + 0.6, fn: () => this.drawInfeed(aisle) });
      }
      this.conveyorItems(items);
      this.drawStations(items);
    }
    // floor rail the crane drives on, guide rail along the top of the racking
    drawLaneRails(a) {
      const g = this.sim.grid, P = this.P.bind(this), cx = a * 3 + 1.5, y1 = g.B + 1;
      this.quadTop(cx - 0.12, 0, cx + 0.12, y1, 0.02, '#3f3a22');
      this.line(P(cx, 0, 0.03), P(cx, y1, 0.03), 'rgba(250,204,21,0.6)', 1.2);
      if (this.opts.cutTop == null) this.line(P(cx, 0, g.Z + 0.35), P(cx, y1, g.Z + 0.35), 'rgba(250,204,21,0.45)', 1.2);
    }

    drawCrane(cr) {
      const sim = this.sim, g = sim.grid, cx = g.laneX(cr.a), y = cr.pos, z = cr.z, col = WS.stateColor(this.sim, cr.displayState), top = g.Z + 0.35;
      if (!cr.idle) this.glow(cx, y, z + 0.4, 26, col, 0.5);
      // drive unit on the floor rail, mast behind the carriage, guide wheels at the top
      this.box(cx - 0.3, y - 0.55, 0, cx + 0.3, y + 0.55, 0.32, '#273244', { top: '#3b4a60', left: '#222b3a', right: '#1a2230' });
      this.faceY(y + 0.552, cx - 0.24, cx + 0.24, 0.12, 0.22, col);
      this.box(cx - 0.12, y - 0.52, 0.32, cx + 0.12, y - 0.32, top, '#64748b');
      this.box(cx - 0.16, y - 0.56, top, cx + 0.16, y - 0.28, top + 0.22, '#475569');
      // carriage with the load handler, a state-coloured band and up to two totes
      const x0 = cx - 0.44, x1 = cx + 0.44, y0 = y - 0.32, y1 = y + 0.5;
      this.box(x0, y0, z - 0.16, x1, y1, z, '#94a3b8', { top: cr.idle ? '#5c4a14' : '#ca8a04' });
      this.faceY(y1 + 0.002, x0 + 0.05, x1 - 0.05, z - 0.13, z - 0.04, col);
      cr.load.forEach((id, k) => {
        const c2 = this.toteColor(sim.inv.binById.get(id)), ya = y0 + 0.04 + k * 0.4;
        this.toteBox(x0 + 0.06, ya, x1 - 0.06, ya + 0.36, z, c2);
      });
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === cr.id;
      if (sel) this.quadTop(x0 - 0.1, y0 - 0.1, x1 + 0.1, y1 + 0.1, z, null, '#38bdf8', 2.5);
    }
    // returning totes waiting on the infeed for the crane
    drawInfeed(aisle) {
      const g = this.sim.grid;
      aisle.inQ.slice(0, 2).forEach((it, k) => this.drawBin(g.laneX(aisle.a), g.B + 0.55 + k * 0.6, 1.4, it.bin.id, { w: 0.26, d: 0.28 }));
    }

    machinePoints() {
      const g = this.sim.grid;
      return this.sim.aisles.map((aisle) => ({ id: aisle.crane.id, x: g.laneX(aisle.a), y: aisle.crane.pos, z: aisle.crane.z }));
    }
  }

  WS.CraneRenderer = CraneRenderer;
})((globalThis.WS = globalThis.WS || {}));
