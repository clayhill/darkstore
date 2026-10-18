/* RailRunner in the free 3D view (WS.PreZone3D): a pair of rails per level in
 * every aisle, an orange shuttle per level whose arms reach into the racks,
 * the totes in the level buffers, and a cyan lift tower at each aisle front. */
(function (WS) {
  'use strict';
  const ORANGE = '#f97316', CYAN = '#06b6d4';

  class ShuttleRenderer3D extends WS.PreZone3D {
    buildStatic() {
      super.buildStatic();
      const g = this.sim.grid, S = this.st;
      for (const aisle of this.sim.aisles) {
        const lx = aisle.a * 3 + 1, x0 = lx + 0.06, x1 = lx + 0.94, y0 = g.B + 0.06, H = g.Z + 0.8;
        for (let l = 0; l < g.L; l++) {
          if (!this.levelShown(l)) continue;
          const z = g.levelZ(l);
          for (const rx of [lx + 0.08, lx + 0.86]) S.box.box(rx, 0, z - 0.08, rx + 0.06, g.B, z + 0.02, '#a3a3a3');
        }
        // lift tower: two cyan columns with hazard-striped feet and a header
        for (const px of [x0, x1 - 0.1]) {
          S.box.box(px, y0, 0, px + 0.1, y0 + 0.12, H, CYAN, { kind: 'robot', id: aisle.lift.id });
          for (let k = 0; k < 3; k++) S.box.box(px - 0.002, y0 + 0.12, 0.1 + k * 0.27, px + 0.102, y0 + 0.125, 0.1 + k * 0.27 + 0.13, k % 2 ? '#111827' : '#facc15');
        }
        S.box.box(x0, y0, H, x1, y0 + 0.16, H + 0.3, CYAN, { kind: 'robot', id: aisle.lift.id });
      }
    }
    drawMachines() {
      const sim = this.sim, g = sim.grid, D = this.dy;
      for (const aisle of sim.aisles) {
        const a = aisle.a;
        // totes in the level buffers at the aisle front
        for (let l = 0; l < g.L; l++) {
          if (!this.levelShown(l)) continue;
          const z = g.levelZ(l) + 0.06;
          [[aisle.outBuf[l], a * 3], [aisle.inBuf[l], a * 3 + 2]].forEach(([buf, x0]) => buf.forEach((it, k) => {
            if (this.moving.has(it.bin.id)) return;
            const b = g.B - 1 - k;
            this.box3(D.box, x0 + 0.1, b + 0.1, x0 + 0.9, b + 0.9, z, this.toteColor(it.bin));
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
        const u = xf && xf.u != null ? xf.u : 0, tx = cx + (this.sideX(a, xf ? xf.side : 0) - cx) * u;
        this.box3(D.box, tx - 0.32, y0 + 0.17, tx + 0.32, y1 - 0.17, z + 0.12 - 0.06 * u, this.binColor(id));
      }
      for (const [ya, yb] of [[y0, y0 + 0.14], [y1 - 0.14, y1]]) {
        D.box.box(x0, ya, z + 0.02, x1, yb, z + 0.38, ORANGE, pick);
        const ax0 = xf && xf.side === 0 ? x0 - e : x0, ax1 = xf && xf.side === 1 ? x1 + e : x1;
        D.box.box(ax0, ya + 0.03, z + 0.38, ax1, yb - 0.03, z + 0.45, '#e2e8f0', pick);
      }
      D.lit.box(x0 + 0.1, y1, z + 0.16, x1 - 0.1, y1 + 0.01, z + 0.28, col);
      D.lit.box(x0 + 0.1, y0 - 0.01, z + 0.16, x1 - 0.1, y0, z + 0.28, col);
    }
    // the lift carriage: a cyan platform with rollers, one tote on it
    drawLift(aisle) {
      const g = this.sim.grid, D = this.dy, lift = aisle.lift, x0 = aisle.a * 3 + 1.06, x1 = aisle.a * 3 + 1.94, y0 = g.B + 0.06, y1 = g.B + 0.94, pick = { kind: 'robot', id: lift.id };
      D.box.box(x0 + 0.1, y0 + 0.12, lift.z - 0.16, x1 - 0.1, y1 - 0.04, lift.z, CYAN, pick);
      for (let k = 1; k < 6; k++) D.cyl.cylX(x0 + 0.12, x1 - 0.12, y0 + 0.12 + ((y1 - y0 - 0.16) * k) / 6, lift.z - 0.02, 0.025, '#67e8f9');
      D.lit.box(x0 + 0.16, y1 - 0.04, lift.z - 0.13, x1 - 0.16, y1 - 0.03, lift.z - 0.05, WS.stateColor(this.sim, lift.displayState));
      if (lift.bin) this.box3(D.box, x0 + 0.16, y0 + 0.18, x1 - 0.16, y1 - 0.1, lift.z, this.binColor(lift.bin), pick);
      // totes waiting to go up
      aisle.inQ.slice(0, 2).forEach((it, k) => { const y = g.B + 0.55 + k * 0.6; this.box3(D.box, g.laneX(aisle.a) - 0.26, y - 0.28, g.laneX(aisle.a) + 0.26, y + 0.28, 1.4, this.toteColor(it.bin)); });
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
