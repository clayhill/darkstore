/* RackRider in the free 3D view: StackPilot's racking and painted robot
 * floor (WS.AcrRenderer3D) without station conveyors, the climbing robots
 * (chassis, side towers with their pinions, the tote between them, the
 * telescopic arm) at the height they have climbed to, and the station
 * frames the robots climb into to present their tote. The robot cam rides on
 * top of a robot, up the racking and down again. */
(function (WS) {
  'use strict';
  const H = WS.CLIMB_H, CYAN = '#06b6d4', GRAPHITE = '#1f2937', TOP = 4.6, R = WS.ClimbRenderer.prototype;

  class ClimbRenderer3D extends WS.AcrRenderer3D {
    pickPos(p) { return R.pickPos.call(this, p); }
    buildStatic() {
      WS.Rack3D.prototype.buildStatic.call(this);
      const g = this.sim.grid, S = this.st;
      this.buildFloor();
      // fence behind the robot area, charger posts beside the parking column
      S.glass.box(0, -0.03, 0, g.W, 0, 7.4, '#94a3b8');
      for (let x = 0; x <= g.W; x += 2) S.box.box(x - 0.04, -0.06, 0, x + 0.04, 0.02, 7.4, '#64748b');
      S.box.box(0, -0.06, 7.3, g.W, 0.02, 7.45, '#94a3b8');
      for (const ch of g.chargers) S.box.box(ch.x + 0.82, ch.y + 0.3, 0, ch.x + 0.98, ch.y + 0.7, 1.8, '#334155');
    }
    // where a robot is, at the height it has climbed to (follow, robot cam)
    followPos(id, alpha) {
      const p = WS.View3D.prototype.followPos.call(this, id, alpha), r = this.sim.fleet[id];
      return p && r ? Object.assign(p, { z: r.mast }) : p;
    }
    rideFront() { return 0.5; }
    rideHeight() { return H + 0.35; } // on top of the robot, looking along the aisle as it climbs
    drawRobot(r, x, y) {
      const sim = this.sim, D = this.dy, col = WS.led(this, r, sim), cx = x + 0.5, cy = y + 0.5, m = r.mast, pick = { kind: 'robot', id: r.id };
      const climbing = m > 0.05 || r.state === 'CLIMBING';
      for (const [wx, wy] of [[-0.32, -0.26], [0.32, -0.26], [-0.32, 0.26], [0.32, 0.26]]) D.cyl.cylX(cx + wx - 0.04, cx + wx + 0.04, cy + wy, m + 0.07, 0.07, '#0b0f17');
      D.rnd.box(cx - 0.4, cy - 0.38, m + 0.08, cx + 0.4, cy + 0.38, m + 0.42, GRAPHITE, pick);
      D.lit.box(cx - 0.12, cy + 0.38, m + 0.18, cx + 0.12, cy + 0.385, m + 0.3, col);
      D.lit.box(cx - 0.12, cy - 0.385, m + 0.18, cx + 0.12, cy - 0.38, m + 0.3, col);
      for (const sx of [-0.42, 0.34]) {
        D.box.box(cx + sx, cy - 0.34, m + 0.42, cx + sx + 0.08, cy + 0.34, m + H, '#e2e8f0', pick);
        // the pinions that grip the rack uprights, lit amber while climbing
        for (const pz of [m + 0.5, m + H - 0.2]) for (const py of [-0.3, 0.3]) (climbing ? D.lit : D.box).box(cx + sx + (sx < 0 ? -0.03 : 0.08), cy + py - 0.05, pz - 0.08, cx + sx + (sx < 0 ? 0 : 0.11), cy + py + 0.05, pz + 0.08, climbing ? '#f59e0b' : '#475569');
      }
      const xf = this.xfer(r), id = xf && xf.u != null ? xf.id : r.bin;
      if (id) {
        const u = xf && xf.u != null ? xf.u : 0, tx = cx + (this.sideX(Math.round((x - 1) / 3), xf ? xf.side : 0) - cx) * u;
        this.box3(D.box, tx - 0.3, cy - 0.27, tx + 0.3, cy + 0.27, m + 0.46, this.binColor(id), pick);
      }
      if (xf) { const e = xf.reach * 0.8, s = xf.side ? 1 : -1; for (const fy of [cy - 0.28, cy + 0.22]) D.box.box(Math.min(cx, cx + s * (0.3 + e)), fy, m + 0.44, Math.max(cx, cx + s * (0.3 + e)), fy + 0.06, m + 0.5, '#cbd5e1'); }
      D.box.box(cx - 0.42, cy - 0.36, m + H, cx + 0.42, cy + 0.36, m + H + 0.12, CYAN, pick);
      D.litCyl.cyl(cx, cy, m + H + 0.12, m + H + 0.32, 0.06, col);
    }
    // Station: a frame over the end of the lane with a light curtain, the
    // operator's screen and a stack light (as a PodSwarm station).
    portBody(S, p) {
      const g = this.sim.grid, x0 = p.hand.x, x1 = x0 + 1, y = g.D, pick = { kind: 'port', id: p.idx };
      for (const px of [x0, x1]) S.box.box(px - 0.05, y - 0.05, 0, px + 0.05, y + 0.05, TOP + 1.1, '#475569', pick);
      S.box.box(x0 - 0.05, y - 0.05, TOP + 0.9, x1 + 0.05, y + 0.05, TOP + 1.25, '#1f2937', pick);
      const sx = x0 - 0.35, sy = y + 0.35;
      S.box.box(sx - 0.03, sy - 0.03, 0, sx + 0.03, sy + 0.03, 3.4, '#475569');
      S.box.box(sx - 0.28, sy - 0.06, 3.3, sx + 0.28, sy + 0.04, 4.6, '#0f172a', pick);
    }
    portLive(p) {
      const D = this.dy, g = this.sim.grid, x0 = p.hand.x, x1 = x0 + 1, y = g.D, active = !!(p.job && p.currentLine);
      if (active) for (let z = 0.6; z < TOP; z += 0.55) D.clear.box(x0, y - 0.01, z, x1, y + 0.01, z + 0.04, '#f87171');
      if (active) D.lit.box(x0 + 0.1, y + 0.04, TOP + 0.95, x1 - 0.1, y + 0.06, TOP + 1.05, '#4ade80');
      const sx = x0 - 0.35, sy = y + 0.35;
      D.lit.box(sx - 0.24, sy + 0.04, 3.4, sx + 0.24, sy + 0.05, 4.5, '#0b1220');
      this.screen('port' + p.idx, sx - 0.235, sx + 0.235, sy + 0.053, 3.42, 4.48, this.portScreen(p));
      this.stackLight(x1, y, TOP + 1.3, p);
    }
    drawLabels() {
      WS.Rack3D.prototype.drawLabels.call(this);
      for (const r of this.sim.fleet) this.label(r.name, r.rx + 0.5, r.ry + 0.5, r.mast + H + 1, { size: 9, color: '#0f172a', weight: 800, bg: 'rgba(241,245,249,0.85)' });
    }
  }

  WS.ClimbRenderer3D = ClimbRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
