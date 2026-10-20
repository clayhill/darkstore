/* RackRider view: StackPilot's racking and robot floor (WS.AcrRenderer), with
 * climbing robots: a graphite chassis on four wheels, two white side towers
 * whose pinions grip the rack uprights when it climbs, the tote it carries
 * between them and a telescopic arm that slides it into the rack. Stations
 * are frames at the floor's front edge that the robot climbs into to present
 * its tote; there are no station conveyors. */
(function (WS) {
  'use strict';
  const H = 1.6; // robot height (render levels)
  const CYAN = '#06b6d4', GRAPHITE = '#1f2937', TOP = 4.6; // station frame height
  const ease = (u) => u * u * (3 - 2 * u);

  class ClimbRenderer extends WS.AcrRenderer {
    // the robot is the station's conveyor: no belts, no totes on them
    conveyorItems() {}
    pickPos(p) { return this.sim.layout.pickPos(p); }
    // A climbing robot at (x, y), its body at height r.mast.
    drawRobot(r, x, y) {
      const sim = this.sim, g = sim.grid, col = WS.led(this, r, sim), cx = x + 0.5, cy = y + 0.5, m = r.mast, edge = { stroke: 'rgba(15,23,42,0.5)', lw: 0.8 };
      // shadow on the floor, smaller and fainter the higher it climbs
      const sh = Math.max(0.2, 1 - m / 12);
      this.quadTop(cx - 0.36 * sh, cy - 0.34 * sh, cx + 0.46 * sh, cy + 0.48 * sh, 0.005, `rgba(0,0,0,${(0.35 * sh).toFixed(2)})`);
      const climbing = m > 0.05 || r.state === 'CLIMBING';
      // wheels and chassis
      for (const [wx, wy] of [[-0.36, -0.3], [0.28, -0.3], [-0.36, 0.22], [0.28, 0.22]]) this.box(cx + wx, cy + wy, m, cx + wx + 0.08, cy + wy + 0.08, m + 0.14, '#0b0f17');
      this.box(cx - 0.4, cy - 0.38, m + 0.08, cx + 0.4, cy + 0.38, m + 0.42, GRAPHITE, Object.assign({ top: '#374151' }, edge));
      this.faceY(cy + 0.381, cx - 0.12, cx + 0.12, m + 0.18, m + 0.3, col);
      // side towers with the climbing pinions at the top and bottom
      for (const sx of [-0.42, 0.34]) {
        this.box(cx + sx, cy - 0.34, m + 0.42, cx + sx + 0.08, cy + 0.34, m + H, '#e2e8f0', Object.assign({ top: '#f8fafc' }, edge));
        for (const pz of [m + 0.5, m + H - 0.2]) this.faceY(cy + 0.342, cx + sx, cx + sx + 0.08, pz - 0.08, pz + 0.08, climbing ? '#f59e0b' : '#475569');
      }
      // the tote between the towers, or sliding out into the rack on the arm
      const xf = this.xfer(r), id = xf && xf.u != null ? xf.id : r.bin;
      if (id) {
        const b = sim.inv.binById.get(id), u = xf && xf.u != null ? xf.u : 0, tx = cx + (this.sideX(Math.round((x - 1) / 3), xf ? xf.side : 0) - cx) * u;
        if (b) this.toteBox(tx - 0.3, cy - 0.27, tx + 0.3, cy + 0.27, m + 0.46, this.toteColor(b));
      }
      if (xf) { const e = xf.reach * 0.8, s = xf.side ? 1 : -1; for (const fy of [cy - 0.28, cy + 0.22]) this.box(Math.min(cx, cx + s * (0.3 + e)), fy, m + 0.44, Math.max(cx, cx + s * (0.3 + e)), fy + 0.06, m + 0.5, '#cbd5e1', { top: '#f1f5f9' }); }
      // top plate with the status beacon
      this.box(cx - 0.42, cy - 0.36, m + H, cx + 0.42, cy + 0.36, m + H + 0.12, CYAN, Object.assign({ top: '#67e8f9' }, edge));
      this.box(cx - 0.06, cy - 0.06, m + H + 0.12, cx + 0.06, cy + 0.06, m + H + 0.32, col, { top: WS.shade(col, 0.35) });
      this.glow(cx, cy, m + H + 0.25, 12, col, 0.8);
      if (r.state === 'CLIMBING' || r.state === 'HANDLING') this.glow(cx, cy, m + 0.8, 22, '#e879f9', 0.35);
      if (r.displayState === 'WAITING_IN_TRAFFIC') this.glow(cx, cy, m + 0.5, 20, col, 0.35 + 0.25 * Math.sin(this.t * 6));
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === r.id;
      if (sel) this.quadTop(x - 0.06, y - 0.06, x + 1.06, y + 1.06, m + 0.02, null, '#38bdf8', 2.5);
      if (this.opts.labels) this.robotTag(r, cx, cy, m + H + 1.1, 'rgba(241,245,249,0.85)');
    }
    // Station: a frame at the floor's front edge over the end of the lane,
    // with a light curtain, the operator's screen and a stack light.
    drawPortBody(p, add) {
      const g = this.sim.grid, L = this.sim.layout, op = L.operatorPos(p), x0 = p.hand.x, x1 = x0 + 1, y = g.D;
      add(op.x + op.y - 1.2, () => this.quadTop(op.x - 0.55, op.y - 0.45, op.x + 0.55, op.y + 0.45, 0.02, '#10161f', '#2a3546', 1));
      add(x1 + y + 0.05, () => {
        const P = this.P.bind(this), active = !!(p.job && p.currentLine);
        for (const px of [x0, x1]) this.box(px - 0.05, y - 0.05, 0, px + 0.05, y + 0.05, TOP + 1.1, '#475569');
        this.poly([P(x0, y, TOP + 0.9), P(x1, y, TOP + 0.9), P(x1, y, TOP + 1.25), P(x0, y, TOP + 1.25)], '#1f2937', '#475569', 1);
        this.ctx.globalAlpha = active ? 0.35 : 0.15;
        for (let z = 0.6; z < TOP; z += 0.55) this.line(P(x0, y, z), P(x1, y, z), '#f87171', 1);
        this.ctx.globalAlpha = 1;
        const sx = x0 - 0.35, sy = y + 0.35;
        this.box(sx - 0.03, sy - 0.03, 0, sx + 0.03, sy + 0.03, 3.4, '#475569');
        this.box(sx - 0.28, sy - 0.06, 3.3, sx + 0.28, sy + 0.04, 4.6, '#0f172a');
        this.screenFace('port' + p.idx, sx - 0.24, sx + 0.24, sy + 0.045, 3.4, 4.5, this.portScreen(p));
        const starving = !p.job && !p.inQ.length && p.demand() > 0;
        [['#ef4444', !!p.away], ['#f59e0b', starving && !p.away], ['#22c55e', !!p.job && !p.away]].forEach(([lc, on], k) => {
          const z = TOP + 1.3 + k * 0.42;
          this.box(x1 - 0.09, y - 0.09, z, x1 + 0.09, y + 0.09, z + 0.4, on ? lc : WS.shade(lc, -0.65), on ? { top: WS.shade(lc, 0.4) } : {});
          if (on) this.glow(x1, y, z + 0.2, 16, lc, 0.55);
        });
      });
    }
  }

  WS.ClimbRenderer = ClimbRenderer;
  WS.CLIMB_H = H;
  WS.CLIMB_EASE = ease;
})((globalThis.WS = globalThis.WS || {}));
