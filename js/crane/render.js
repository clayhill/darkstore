/* SkyStack view: the shared racking (WS.PreZoneRenderer) with a floor
 * rail and a top guide rail in every aisle, an orange stacker crane per aisle
 * (drive unit, mast, carriage with a twin load handler) whose forks reach
 * sideways into the racking or onto the I/O conveyors, and the pre-zone loop. */
(function (WS) {
  'use strict';
  const { shade } = WS;
  const ORANGE = '#f97316', ORANGE_TOP = '#fdba74';

  class CraneRenderer extends WS.PreZoneRenderer {
    drawScene(alpha) {
      this.drawFloor();
      this.drawBotLayer(alpha);
      this.drawPreZone();
      this.drawRackScene((aisle) => [() => this.drawCrane(aisle.crane)]);
      this.drawSelectedCell();
      const items = [];
      this.conveyorItems(items);
      if (this.sim.bots) this.botItems(items, alpha);
      this.drawStations(items);
    }
    // floor rail the crane drives on, guide rail along the top of the racking
    drawLaneRails(a) {
      const g = this.sim.grid, P = this.P.bind(this), cx = a * 3 + 1.5, y1 = g.B + 1.3;
      this.quadTop(cx - 0.12, 0, cx + 0.12, y1, 0.02, '#3f3a22');
      this.line(P(cx, 0, 0.03), P(cx, y1, 0.03), 'rgba(250,204,21,0.6)', 1.2);
      if (this.opts.cutTop == null) this.line(P(cx, 0, g.Z + 0.35), P(cx, y1, g.Z + 0.35), 'rgba(250,204,21,0.45)', 1.2);
    }

    // A mini-load stacker crane in safety orange: bottom carriage on the floor
    // rail with the control cabinet in front, a box-section mast, the top
    // carriage on the guide rail with a status beacon, and the lifting
    // carriage whose telescopic forks reach into a rack side or the I/O point.
    drawCrane(cr) {
      const sim = this.sim, g = sim.grid, cx = g.laneX(cr.a), y = cr.pos, z = cr.z, col = WS.led(this, cr, sim), top = g.Z + 0.35;
      const edge = { stroke: 'rgba(15,23,42,0.55)', lw: 0.8 }, or = Object.assign({ top: ORANGE_TOP }, edge);
      if (cr.state !== 'IDLE') this.glow(cx, y, z + 0.3, 30, ORANGE, 0.3);
      // bottom carriage with wheels, hazard stripes at the ends
      this.box(cx - 0.26, y - 0.72, 0.02, cx + 0.26, y + 0.62, 0.42, ORANGE, or);
      this.hazardY(y + 0.622, cx - 0.26, cx + 0.26, 0.1, 0.34, 6);
      for (const wy of [y - 0.5, y + 0.4]) this.wheelX(cx + 0.262, wy, 0.17, 0.12, 0.12);
      // mast, its carriage guide, the top carriage and the beacon
      // the mast bends with its sway (WS.Crane.mastSway), more the higher up
      const sw = cr.mastSway() / sim.cfg.cellSize, bend = (h) => sw * ((Math.max(0.42, h) - 0.42) / (top - 0.42)) ** 2, N = 6;
      for (let k = 0; k < N; k++) {
        const za = 0.42 + ((top - 0.42) * k) / N, zb = 0.42 + ((top - 0.42) * (k + 1)) / N, o = bend((za + zb) / 2);
        this.box(cx - 0.16, y - 0.62 + o, za, cx + 0.16, y - 0.3 + o, zb, ORANGE, k === N - 1 ? or : { top: ORANGE_TOP }); // no edge lines between the pieces
        this.faceY(y - 0.298 + o, cx - 0.05, cx + 0.05, Math.max(0.5, za), Math.min(top - 0.05, zb), '#9a3412');
      }
      this.box(cx - 0.22, y - 0.7 + sw, top, cx + 0.22, y - 0.22 + sw, top + 0.32, ORANGE, or);
      this.box(cx - 0.07, y - 0.53 + sw, top + 0.32, cx + 0.07, y - 0.39 + sw, top + 0.6, col, { top: shade(col, 0.35) });
      this.glow(cx, y - 0.46 + sw, top + 0.5, 14, col, 0.8);
      // control cabinet on the back end
      this.box(cx - 0.2, y - 1.02, 0.02, cx + 0.2, y - 0.72, 1.8, '#e2e8f0', Object.assign({ top: '#f8fafc' }, edge));
      this.faceY(y - 0.718, cx - 0.13, cx + 0.13, 1.25, 1.6, '#0f172a');
      this.faceY(y - 0.716, cx - 0.1, cx + 0.04, 1.42, 1.5, col);
      // lifting carriage: orange side plates, dark deck, telescopic forks;
      // handler position k holds a tote at y + slotY(k)
      const T = sim.convTote(), last = sim.slotY(sim.cfg.handlerSlots - 1) + T.d + 0.02;
      const yc = y + bend(z), x0 = cx - 0.44, x1 = cx + 0.44, y0 = yc - 0.3, y1 = yc + last;
      const xf = this.xfer(cr), e = xf ? xf.reach * 0.8 : 0;
      this.box(x0, y0, z - 0.2, x1, y1, z - 0.04, '#334155', Object.assign({ top: '#475569' }, edge));
      for (const fy of [y0 + 0.12, y1 - 0.16]) {
        const fx0 = xf && xf.side === 0 ? x0 - e : x0 + 0.06, fx1 = xf && xf.side === 1 ? x1 + e : x1 - 0.06;
        this.box(fx0, fy, z - 0.06, fx1, fy + 0.05, z, '#cbd5e1', { top: '#e2e8f0' });
      }
      // totes on the handler; one taken or put slides sideways between its
      // handler position and the rack or a conveyor, growing to its rack size
      const tote = (id, k, u) => {
        const ty = yc + sim.slotY(k), hd = xf && xf.io ? T.d : T.d + (0.4 - T.d) * Math.max(0, 2 * u - 1), tx = cx + (u ? (this.sideX(cr.a, xf.side) - cx) * u : 0);
        this.toteBox(tx - T.w, ty - hd, tx + T.w, ty + hd, z + 0.06 * u, this.toteColor(sim.inv.binById.get(id)));
      };
      cr.load.forEach((id) => tote(id, cr.slotOf[id], xf && !xf.take && xf.id === id ? xf.u : 0));
      if (xf && xf.take && xf.u != null) tote(xf.id, xf.slot, xf.u);
      for (const px of [x0, x1 - 0.07]) this.box(px, y0, z - 0.2, px + 0.07, y1, z + 0.5, ORANGE, or);
      this.faceY(y1 + 0.002, x0 + 0.1, x1 - 0.1, z - 0.16, z - 0.08, col);
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === cr.id;
      if (sel) this.quadTop(x0 - 0.12, y0 - 0.12, x1 + 0.12, y1 + 0.12, z, null, '#38bdf8', 2.5);
    }

    machinePoints() {
      const g = this.sim.grid;
      return this.sim.aisles.map((aisle) => ({ id: aisle.crane.id, x: g.laneX(aisle.a), y: aisle.crane.pos, z: aisle.crane.z }));
    }
  }

  WS.CraneRenderer = CraneRenderer;
})((globalThis.WS = globalThis.WS || {}));
