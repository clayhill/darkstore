/* SkyStack view: the shared see-through racking (WS.PreZoneRenderer) with a floor
 * rail and a top guide rail in every aisle, an orange stacker crane per aisle
 * (drive unit, mast, carriage with a twin load handler), returning totes waiting at
 * the I/O point and the pre-zone conveyor to the stations. */
(function (WS) {
  'use strict';
  const { shade } = WS;
  const ORANGE = '#f97316', ORANGE_TOP = '#fdba74';

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

    // A mini-load stacker crane in safety orange: bottom carriage on the floor
    // rail with the control cabinet in front, a box-section mast, the top
    // carriage on the guide rail with a status beacon, and the lifting
    // carriage whose telescopic forks reach into a rack side or the I/O point.
    drawCrane(cr) {
      const sim = this.sim, g = sim.grid, cx = g.laneX(cr.a), y = cr.pos, z = cr.z, col = WS.stateColor(sim, cr.displayState), top = g.Z + 0.35;
      const edge = { stroke: 'rgba(15,23,42,0.55)', lw: 0.8 }, or = Object.assign({ top: ORANGE_TOP }, edge);
      if (cr.state !== 'IDLE') this.glow(cx, y, z + 0.3, 30, ORANGE, 0.3);
      // bottom carriage with wheels, hazard stripes at the ends
      this.box(cx - 0.26, y - 0.72, 0.02, cx + 0.26, y + 0.62, 0.42, ORANGE, or);
      this.hazardY(y + 0.622, cx - 0.26, cx + 0.26, 0.1, 0.34, 6);
      for (const wy of [y - 0.5, y + 0.4]) this.wheelX(cx + 0.262, wy, 0.17, 0.12, 0.12);
      // mast, its carriage guide, the top carriage and the beacon
      this.box(cx - 0.16, y - 0.62, 0.42, cx + 0.16, y - 0.3, top, ORANGE, or);
      this.faceY(y - 0.298, cx - 0.05, cx + 0.05, 0.5, top - 0.05, '#9a3412');
      this.box(cx - 0.22, y - 0.7, top, cx + 0.22, y - 0.22, top + 0.32, ORANGE, or);
      this.box(cx - 0.07, y - 0.53, top + 0.32, cx + 0.07, y - 0.39, top + 0.6, col, { top: shade(col, 0.35) });
      this.glow(cx, y - 0.46, top + 0.5, 14, col, 0.8);
      // control cabinet on the front end
      this.box(cx - 0.2, y + 0.62, 0.02, cx + 0.2, y + 0.92, 1.8, '#e2e8f0', Object.assign({ top: '#f8fafc' }, edge));
      this.faceY(y + 0.922, cx - 0.13, cx + 0.13, 1.25, 1.6, '#0f172a');
      this.faceY(y + 0.924, cx - 0.1, cx + 0.04, 1.42, 1.5, col);
      // lifting carriage: orange side plates, dark deck, telescopic forks
      const x0 = cx - 0.44, x1 = cx + 0.44, y0 = y - 0.3, y1 = y + 0.5;
      let e = 0;
      if (cr.state === 'HANDLING' && cr.op && cr.op.op === 'wait') e = Math.sin(Math.PI * Math.min(1, cr.op.t / cr.op.dur)) * 0.8;
      this.box(x0, y0, z - 0.2, x1, y1, z - 0.04, '#334155', Object.assign({ top: '#475569' }, edge));
      for (const fy of [y0 + 0.12, y1 - 0.16]) {
        const fx0 = cr.face === 0 ? x0 - e : x0 + 0.06, fx1 = cr.face === 1 ? x1 + e : x1 - 0.06;
        this.box(fx0, fy, z - 0.06, fx1, fy + 0.05, z, '#cbd5e1', { top: '#e2e8f0' });
      }
      if (cr.face < 0 && e) this.box(cx - 0.3, y1, z - 0.06, cx + 0.3, y1 + e, z, '#cbd5e1', { top: '#e2e8f0' });
      cr.load.forEach((id, k) => {
        const c2 = this.toteColor(sim.inv.binById.get(id)), ya = y0 + 0.04 + k * 0.4;
        this.toteBox(x0 + 0.1, ya, x1 - 0.1, ya + 0.36, z, c2);
      });
      for (const px of [x0, x1 - 0.07]) this.box(px, y0, z - 0.2, px + 0.07, y1, z + 0.5, ORANGE, or);
      this.faceY(y1 + 0.002, x0 + 0.1, x1 - 0.1, z - 0.16, z - 0.08, col);
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === cr.id;
      if (sel) this.quadTop(x0 - 0.12, y0 - 0.12, x1 + 0.12, y1 + 0.12, z, null, '#38bdf8', 2.5);
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
