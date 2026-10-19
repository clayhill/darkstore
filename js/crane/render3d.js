/* SkyStack in the free 3D view (WS.PreZone3D): a floor rail and a top guide
 * rail in every aisle and an orange stacker crane on them: bottom carriage,
 * box-section mast, top carriage with a beacon, control cabinet, and the
 * lifting carriage whose forks reach sideways into a rack side or onto the
 * I/O conveyors. */
(function (WS) {
  'use strict';
  const ORANGE = '#f97316';

  class CraneRenderer3D extends WS.PreZone3D {
    buildStatic() {
      super.buildStatic();
      const g = this.sim.grid, S = this.st;
      for (const aisle of this.sim.aisles) {
        const cx = g.laneX(aisle.a), y1 = g.B + 1.3;
        S.box.box(cx - 0.12, 0, 0, cx + 0.12, y1, 0.06, '#3f3a22');
        S.box.box(cx - 0.04, 0, 0.06, cx + 0.04, y1, 0.12, '#a3a3a3');
        if (this.opts.cutTop == null) S.box.box(cx - 0.05, 0, g.Z + 0.3, cx + 0.05, y1, g.Z + 0.4, '#facc15');
      }
    }
    drawMachines() { for (const aisle of this.sim.aisles) this.drawCrane(aisle.crane); }
    drawCrane(cr) {
      const sim = this.sim, g = sim.grid, D = this.dy, cx = g.laneX(cr.a), y = cr.pos, z = cr.z, col = WS.stateColor(sim, cr.displayState), top = g.Z + 0.35, pick = { kind: 'robot', id: cr.id };
      // bottom carriage with wheels and hazard stripes, mast, top carriage and beacon
      D.box.box(cx - 0.26, y - 0.72, 0.12, cx + 0.26, y + 0.62, 0.42, ORANGE, pick);
      for (let k = 0; k < 6; k++) D.box.box(cx - 0.26 + (0.52 * k) / 6, y + 0.62, 0.12, cx - 0.26 + (0.52 * (k + 1)) / 6, y + 0.63, 0.42, k % 2 ? '#111827' : '#facc15');
      for (const wy of [y - 0.5, y + 0.4]) D.cyl.cylX(cx - 0.3, cx + 0.3, wy, 0.17, 0.08, '#0b0f17');
      D.box.box(cx - 0.16, y - 0.62, 0.42, cx + 0.16, y - 0.3, top, ORANGE, pick);
      D.box.box(cx - 0.05, y - 0.3, 0.5, cx + 0.05, y - 0.29, top - 0.05, '#9a3412');
      D.box.box(cx - 0.22, y - 0.7, top, cx + 0.22, y - 0.22, top + 0.32, ORANGE, pick);
      D.litCyl.cyl(cx, y - 0.46, top + 0.32, top + 0.6, 0.07, col);
      // control cabinet on the back end
      D.box.box(cx - 0.2, y - 1.02, 0.02, cx + 0.2, y - 0.72, 1.8, '#e2e8f0', pick);
      D.lit.box(cx - 0.13, y - 0.72, 1.25, cx + 0.13, y - 0.71, 1.6, '#0f172a');
      D.lit.box(cx - 0.1, y - 0.71, 1.42, cx + 0.04, y - 0.7, 1.5, col);
      // lifting carriage: side plates, deck and the telescopic forks; handler
      // position k holds a tote at y + slotY(k)
      const T = sim.convTote(), x0 = cx - 0.44, x1 = cx + 0.44, y0 = y - 0.3, y1 = y + sim.slotY(sim.cfg.handlerSlots - 1) + T.d + 0.02, xf = this.xfer(cr), e = xf ? xf.reach * 0.8 : 0;
      D.box.box(x0, y0, z - 0.2, x1, y1, z - 0.04, '#334155', pick);
      for (const fy of [y0 + 0.12, y1 - 0.16]) {
        const fx0 = xf && xf.side === 0 ? x0 - e : x0 + 0.06, fx1 = xf && xf.side === 1 ? x1 + e : x1 - 0.06;
        D.box.box(fx0, fy, z - 0.06, fx1, fy + 0.05, z, '#cbd5e1', pick);
      }
      // totes on the handler; one taken or put slides sideways between its
      // handler position and the rack or a conveyor, growing to its rack size
      // once it is clear of the handler (the handler positions are closer
      // together than rack totes are deep)
      const tote = (id, k, u) => {
        const ty = y + sim.slotY(k), hd = xf && xf.io ? T.d : T.d + (0.38 - T.d) * Math.max(0, 2 * u - 1), tx = cx + (u ? (this.sideX(cr.a, xf.side) - cx) * u : 0);
        this.box3(D.box, tx - T.w, ty - hd, tx + T.w, ty + hd, z + 0.06 * u, this.binColor(id));
      };
      cr.load.forEach((id) => tote(id, cr.slotOf[id], xf && !xf.take && xf.id === id ? xf.u : 0));
      if (xf && xf.take && xf.u != null) tote(xf.id, xf.slot, xf.u);
      for (const px of [x0, x1 - 0.07]) D.box.box(px, y0, z - 0.2, px + 0.07, y1, z + 0.5, ORANGE, pick);
      D.lit.box(x0 + 0.1, y1, z - 0.16, x1 - 0.1, y1 + 0.01, z - 0.08, col);
    }
    machinePos(m) { const g = this.sim.grid; return m && { x: g.laneX(m.a), y: m.pos, z: m.z }; }
    drawLabels() {
      super.drawLabels();
      const g = this.sim.grid;
      for (const aisle of this.sim.aisles) this.label(aisle.crane.name, g.laneX(aisle.a), aisle.crane.pos, g.Z + 1.0, { size: 9, color: '#0f172a', weight: 800, bg: 'rgba(241,245,249,0.85)' });
    }
  }

  WS.CraneRenderer3D = CraneRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
