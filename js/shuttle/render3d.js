/* RailRunner in the free 3D view (WS.PreZone3D): a pair of rails per level in
 * every aisle, an orange shuttle per level whose arms reach into the racks,
 * the totes rolling in the level buffers, and a cyan lift at each aisle front
 * with a platform on each side. */
(function (WS) {
  'use strict';
  const ORANGE = '#f97316', CYAN = '#06b6d4';

  class ShuttleRenderer3D extends WS.PreZone3D {
    buildStatic() {
      super.buildStatic();
      const g = this.sim.grid, S = this.st;
      for (const aisle of this.sim.aisles) {
        const lx = aisle.a * 3 + 1, B = g.B, H = g.Z + 0.8, pick = { kind: 'robot', id: aisle.lift.id };
        for (let l = 0; l < g.L; l++) {
          if (!this.levelShown(l)) continue;
          const z = g.levelZ(l);
          for (const rx of [lx + 0.08, lx + 0.86]) S.box.box(rx, 0, z - 0.08, rx + 0.06, g.B, z + 0.02, '#a3a3a3');
        }
        // lift tower: two cyan columns in the middle with hazard-striped feet and a header
        for (const px of [lx + 0.12, lx + 0.78]) {
          S.box.box(px, B + 0.42, 0, px + 0.1, B + 0.58, H, CYAN, pick);
          for (let k = 0; k < 3; k++) S.box.box(px - 0.002, B + 0.58, 0.1 + k * 0.27, px + 0.102, B + 0.585, 0.1 + k * 0.27 + 0.13, k % 2 ? '#111827' : '#facc15');
        }
        S.box.box(lx + 0.06, B + 0.4, H, lx + 0.94, B + 0.6, H + 0.3, CYAN, pick);
      }
    }
    drawMachines() {
      const sim = this.sim, g = sim.grid, D = this.dy, T = sim.convTote();
      for (const aisle of sim.aisles) {
        const a = aisle.a;
        // totes in the level buffers, where they have rolled to
        for (let l = 0; l < g.L; l++) {
          if (!this.levelShown(l)) continue;
          const z = g.levelZ(l) + 0.06;
          [[aisle.outBuf[l], g.outX(a)], [aisle.inBuf[l], g.inX(a)]].forEach(([buf, x]) => buf.forEach((it) => {
            if (this.moving.has(it.bin.id)) return;
            this.box3(D.box, x - T.w, it.pos - T.d, x + T.w, it.pos + T.d, z, this.toteColor(it.bin));
          }));
        }
        for (const sh of aisle.shuttles) if (this.levelShown(sh.l)) this.drawShuttle(sh, a);
        this.drawLift(aisle);
      }
    }
    // Shuttle: two orange end units carrying the telescopic arms, a dark deck
    // between them for the tote, a status light on the front.
    drawShuttle(sh, a) {
      const sim = this.sim, g = sim.grid, D = this.dy, z = g.levelZ(sh.l), cx = a * 3 + 1.5, y = sh.pos, x0 = cx - 0.42, x1 = cx + 0.42, y0 = y - 0.45, y1 = y + 0.45;
      const col = WS.stateColor(sim, sh.displayState), pick = { kind: 'robot', id: sh.id }, xf = this.xfer(sh), e = xf ? xf.reach * 0.75 : 0;
      D.box.box(x0 + 0.04, y0 + 0.14, z + 0.02, x1 - 0.04, y1 - 0.14, z + 0.12, '#1f2937', pick);
      const id = xf && xf.u != null ? xf.id : sh.bin;
      if (id) {
        const T = sim.convTote(), u = xf && xf.u != null ? xf.u : 0, tx = cx + (this.sideX(a, xf ? xf.side : 0) - cx) * u, hd = xf && xf.io ? T.d : T.d + (0.38 - T.d) * Math.max(0, 2 * u - 1);
        this.box3(D.box, tx - T.w, y - hd, tx + T.w, y + hd, z + 0.12 - 0.06 * u, this.binColor(id));
      }
      for (const [ya, yb] of [[y0, y0 + 0.14], [y1 - 0.14, y1]]) {
        D.box.box(x0, ya, z + 0.02, x1, yb, z + 0.38, ORANGE, pick);
        const ax0 = xf && xf.side === 0 ? x0 - e : x0, ax1 = xf && xf.side === 1 ? x1 + e : x1;
        D.box.box(ax0, ya + 0.03, z + 0.38, ax1, yb - 0.03, z + 0.45, '#e2e8f0', pick);
      }
      D.lit.box(x0 + 0.1, y1, z + 0.16, x1 - 0.1, y1 + 0.01, z + 0.28, col);
      D.lit.box(x0 + 0.1, y0 - 0.01, z + 0.16, x1 - 0.1, y0, z + 0.28, col);
    }
    // the lift carriage: a beam between the columns and a roller platform on
    // each side, in line with the buffers and the aisle's conveyors
    drawLift(aisle) {
      const sim = this.sim, g = sim.grid, D = this.dy, lift = aisle.lift, ax = aisle.a * 3, B = g.B, z = lift.z, pick = { kind: 'robot', id: lift.id };
      D.box.box(ax + 0.9, B + 0.44, z - 0.16, ax + 2.1, B + 0.56, z - 0.02, '#0e7490', pick);
      for (const px of [ax + 0.08, ax + 2.08]) {
        D.box.box(px, B + 0.08, z - 0.16, px + 0.84, B + 0.92, z - 0.06, CYAN, pick);
        for (let k = 1; k < 6; k++) D.cyl.cylX(px + 0.04, px + 0.8, B + 0.08 + (0.84 * k) / 6, z - 0.04, 0.025, '#67e8f9');
      }
      D.lit.box(ax + 1.3, B + 0.56, z - 0.13, ax + 1.7, B + 0.57, z - 0.05, WS.stateColor(sim, lift.displayState));
      if (lift.bin) {
        const T = sim.convTote(), x = lift.side ? g.inX(aisle.a) : g.outX(aisle.a), r = lift.roll;
        let y = B + 0.5;
        if (r) { const f = Math.min(1, (sim.time - r.t0) / r.dur); y = r.y0 + (r.y1 - r.y0) * f; }
        this.box3(D.box, x - T.w, y - T.d, x + T.w, y + T.d, z, this.binColor(lift.bin));
      }
    }
    machinePos(m) {
      const g = this.sim.grid;
      if (!m) return null;
      if (m.l != null) return { x: g.laneX(m.a), y: m.pos, z: g.levelZ(m.l) };
      return { x: g.laneX(m.a), y: g.B + 0.5, z: m.z };
    }
    drawLabels() {
      super.drawLabels();
      if (this.cam.dist > 18 && !this.cam.walk) return; // shuttle names only up close
      const g = this.sim.grid;
      for (const aisle of this.sim.aisles) for (const sh of aisle.shuttles) if (this.levelShown(sh.l)) this.label(sh.name, g.laneX(aisle.a), sh.pos, g.levelZ(sh.l) + 0.7, { size: 9, color: '#0f172a', weight: 800, bg: 'rgba(241,245,249,0.85)' });
    }
  }

  WS.ShuttleRenderer3D = ShuttleRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
