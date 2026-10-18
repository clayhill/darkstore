/* StackPilot view: the shared see-through racking (WS.RackRenderer) on a
 * robot floor with cross aisles, queue lanes and handover points, parking
 * spots and chargers. Each robot is a low drive unit with a tall mast, its
 * column of back shelves with the totes it carries and the tote handler that
 * moves up and down the mast. Paths, reservations and name tags come from
 * WS.IsoRenderer. */
(function (WS) {
  'use strict';
  const C = WS.CELL, { STATE_COLORS } = WS;
  const BODY = 0.55; // drive unit height (render levels)

  class AcrRenderer extends WS.RackRenderer {
    drawScene(alpha) {
      const g = this.sim.grid;
      this.drawFloor();
      this.drawCached('acr-floor', this.sim.cfg.aisleMode, () => this.drawRobotFloor());
      this.drawOverlays();
      if (this.opts.paths) this.drawPaths(alpha);
      this.drawRacking();
      this.drawSelectedCell();
      const items = [];
      for (const r of this.sim.fleet) {
        const x = r.prx + (r.rx - r.prx) * alpha, y = r.pry + (r.ry - r.pry) * alpha;
        items.push({ d: x + y + 1, fn: () => this.drawRobot(r, x, y) });
      }
      for (const p of this.sim.ports) items.push({ d: p.hand.x + g.D - 0.2, fn: () => this.drawReturns(p) });
      this.conveyorItems(items);
      this.drawStations(items);
    }

    // ---------------------------------------------------------------- floor
    // Cross aisles and the corridor, aisle floors (with arrows when one-way),
    // queue lanes with chevrons, handover points, parking spots and chargers.
    drawRobotFloor() {
      const sim = this.sim, g = sim.grid, P = this.P.bind(this), oneway = sim.cfg.aisleMode === 'oneway';
      this.poly([P(0, 0, 0), P(g.W, 0, 0), P(g.W, g.laneY + 1, 0), P(0, g.laneY + 1, 0)], '#1f2a3a');
      for (let y = 0; y < g.D; y++) {
        for (let x = 0; x < g.W; x++) {
          const t = g.type[g.idx(x, y)];
          if (t === C.HIGHWAY) {
            this.quadTop(x + 0.03, y + 0.03, x + 0.97, y + 0.97, 0, '#243246');
            this.quadTop(x + 0.45, y + 0.45, x + 0.55, y + 0.55, 0, '#64748b');
          } else if (t === C.AISLE) this.quadTop(x + 0.08, y, x + 0.92, y + 1, 0, '#18222f');
          else if (t === C.PARK) this.quadTop(x + 0.1, y + 0.1, x + 0.9, y + 0.9, 0, '#13261d', 'rgba(74,222,128,0.35)', 1);
          else if (t === C.CHARGER) {
            this.quadTop(x + 0.08, y + 0.08, x + 0.92, y + 0.92, 0, '#14532d');
            this.quadTop(x + 0.2, y + 0.2, x + 0.8, y + 0.8, 0, null, '#4ade80', 1.5);
          } else if (t === C.LANE) {
            this.quadTop(x + 0.04, y + 0.04, x + 0.96, y + 0.96, 0, '#2a2614');
            const mx = x + 0.5, my = y + 0.5;
            this.line(P(mx - 0.2, my - 0.2, 0), P(mx + 0.1, my, 0), 'rgba(250,204,21,0.55)', 2);
            this.line(P(mx + 0.1, my, 0), P(mx - 0.2, my + 0.2, 0), 'rgba(250,204,21,0.55)', 2);
          } else if (t === C.PORT) {
            this.quadTop(x + 0.04, y + 0.04, x + 0.96, y + 0.96, 0, '#3a2f12');
            this.quadTop(x + 0.04, y + 0.04, x + 0.96, y + 0.96, 0, null, '#facc15', 2);
          }
        }
      }
      // yellow edge lines along the racking and the robot area
      const edge = 'rgba(202,138,4,0.55)';
      this.line(P(0, g.Y0, 0), P(g.A * 3, g.Y0, 0), edge, 1.2);
      this.line(P(0, g.frontY, 0), P(g.A * 3, g.frontY, 0), edge, 1.2);
      this.line(P(0, g.laneY, 0), P(g.W, g.laneY, 0), edge, 1.2);
      if (oneway) {
        for (const aisle of sim.aisles) {
          const x = aisle.a * 3 + 1.5, d = aisle.dir;
          for (let b = 2; b < g.B; b += 4) {
            const y = g.Y0 + b + 0.5;
            this.line(P(x - 0.18, y - 0.15 * d, 0), P(x, y + 0.15 * d, 0), 'rgba(250,204,21,0.5)', 2);
            this.line(P(x, y + 0.15 * d, 0), P(x + 0.18, y - 0.15 * d, 0), 'rgba(250,204,21,0.5)', 2);
          }
        }
      }
      // fence behind the robot area, charger posts on the parking column
      this.poly([P(0, 0, 0), P(g.W, 0, 0), P(g.W, 0, 3.2), P(0, 0, 3.2)], 'rgba(148,163,184,0.08)');
      this.line(P(0, 0, 3.2), P(g.W, 0, 3.2), '#94a3b8', 1.5);
      for (let x = 0; x <= g.W; x += 2) this.line(P(x, 0, 0), P(x, 0, 3.2), '#64748b', 1.2);
      for (const ch of g.chargers) this.box(ch.x + 0.82, ch.y + 0.3, 0, ch.x + 0.98, ch.y + 0.7, 1.8, '#334155');
    }
    // Traffic heat, reserved cells, aisle locks, hover and selection on the floor.
    drawOverlays() {
      const sim = this.sim, g = sim.grid;
      if (this.opts.heat) {
        for (let i = 0; i < g.waitHeat.length; i++) {
          const v = Math.max(Math.min(1, g.waitHeat[i] / 40), Math.min(1, g.passHeat[i] / 60) * 0.6);
          if (v > 0.04) this.quadTop(g.cx(i), g.cy(i), g.cx(i) + 1, g.cy(i) + 1, 0.01, `rgba(239,68,68,${(v * 0.7).toFixed(2)})`);
        }
      }
      if (sim.cfg.aisleMode === 'lock') {
        for (const aisle of sim.aisles) {
          if (aisle.lock < 0) continue;
          const x = aisle.a * 3 + 1, col = STATE_COLORS[sim.fleet[aisle.lock].displayState];
          this.quadTop(x + 0.1, g.Y0, x + 0.9, g.frontY, 0.01, WS.rgba(col, 0.1), WS.rgba(col, 0.55), 1.2);
        }
      }
      if (this.opts.claims) this.drawClaims(0);
      const s = this.hover;
      if (s && s.kind === 'cell' && g.type[s.id] !== C.STORAGE) { const x = g.cx(s.id), y = g.cy(s.id); this.quadTop(x, y, x + 1, y + 1, 0.02, 'rgba(255,255,255,0.12)', '#fff', 1.5); }
    }
    // A rack column or floor cell picked in the control-room map or the view.
    drawSelectedCell() {
      const s = this.selected, g = this.sim.grid;
      if (!s || s.kind !== 'cell') return;
      const x = g.cx(s.id), y = g.cy(s.id);
      this.quadTop(x, y, x + 1, y + 1, 0.02, 'rgba(56,189,248,0.18)', '#38bdf8', 2.5);
      if (g.type[s.id] === C.STORAGE) this.quadTop(x, y, x + 1, y + 1, g.Z, 'rgba(56,189,248,0.1)', '#38bdf8', 2);
    }

    // ---------------------------------------------------------------- robots
    // Drive unit, mast with the back shelves (top shelf first holds the first
    // tote loaded), the handler at its current height reaching into the rack
    // while it takes or puts a tote.
    drawRobot(r, x, y) {
      const sim = this.sim, g = sim.grid, N = sim.cfg.robotSlots, col = STATE_COLORS[r.displayState];
      const cx = x + 0.5, cy = y + 0.5, H = g.Z + 0.5, x0 = cx - 0.3, x1 = cx + 0.3, y0 = cy - 0.28, y1 = cy + 0.28;
      this.quadTop(cx - 0.36, cy - 0.34, cx + 0.48, cy + 0.5, 0.005, 'rgba(0,0,0,0.35)');
      this.box(cx - 0.42, cy - 0.42, 0.02, cx + 0.42, cy + 0.42, BODY, '#334155', { top: '#475569' });
      this.faceY(cy + 0.421, cx - 0.36, cx + 0.36, 0.28, 0.4, col);
      this.faceX(cx + 0.421, cy - 0.36, cy + 0.36, 0.28, 0.4, col);
      // mast: back posts, shelves with totes, front post
      for (const [px, py] of [[x0, y0], [x1 - 0.06, y0], [x0, y1 - 0.06]]) this.box(px, py, BODY, px + 0.06, py + 0.06, H, '#64748b');
      this.ctx.globalAlpha = 0.3;
      this.box(x0, y0, BODY, x1, y1, H, '#475569', { top: '#64748b' });
      this.ctx.globalAlpha = 1;
      for (let k = 0; k < N; k++) {
        const z = BODY + 0.5 + (k * (H - BODY - 1.6)) / Math.max(1, N - 1);
        this.quadTop(x0, y0, x1, y1, z, 'rgba(71,85,105,0.7)', '#64748b', 1);
        const id = r.load[k];
        if (id) this.toteBox(x0 + 0.04, y0 + 0.04, x1 - 0.04, y1 - 0.04, z, this.toteColor(sim.inv.binById.get(id)));
      }
      this.box(x1 - 0.06, y1 - 0.06, BODY, x1, y1, H, '#cbd5e1');
      this.box(x0, y0, H, x1, y1, H + 0.18, '#f97316', { top: '#fb923c' });
      // handler: a tray on the mast, reaching left or right into the rack
      let e = 0;
      if (r.state === 'HANDLING' && r.op && r.op.op === 'timer') e = Math.sin(Math.PI * Math.min(1, r.op.t / r.op.dur)) * 0.75;
      const hx0 = r.face ? cx - 0.34 : cx - 0.34 - e, hx1 = r.face ? cx + 0.34 + e : cx + 0.34;
      this.box(hx0, cy - 0.3, r.mast - 0.06, hx1, cy + 0.3, r.mast + 0.08, '#f97316', { top: '#fdba74' });
      if (r.state === 'HANDLING' || r.state === 'MAST') this.glow(cx, cy, r.mast + 0.3, 18, col, 0.35);
      if (r.displayState === 'WAITING_IN_TRAFFIC' || r.busy) this.glow(cx, cy, BODY + 0.4, 20, col, 0.35 + 0.25 * Math.sin(this.t * 6));
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === r.id;
      if (sel) this.quadTop(x - 0.06, y - 0.06, x + 1.06, y + 1.06, 0.02, null, '#38bdf8', 2.5);
      if (this.opts.labels) this.robotTag(r, cx, cy, H + 1.2, 'rgba(241,245,249,0.85)');
    }
    // totes back from a station, waiting on its return conveyor for a robot
    drawReturns(p) {
      const g = this.sim.grid;
      p.back.slice(0, 2).forEach((b, k) => this.drawBin(p.hand.x + 1.5, g.D - 0.75 + k * 0.3, 1.4, b.id, { w: 0.26, d: 0.22 }));
    }

    // ---------------------------------------------------------------- conveyors
    conveyorItems(items) {
      const sim = this.sim, g = sim.grid;
      items.push({ d: g.D - 0.5, fn: () => this.drawPreZone() });
      for (const it of sim.conv) {
        const q = sim.posOnPath(it);
        items.push({ d: q.x + q.y + 0.3, fn: () => this.drawBin(q.x, q.y, 1.4, it.bin.id, { w: 0.26, d: 0.3 }) });
      }
    }
    // Infeed from each handover point into its station, the return conveyor
    // beside it, and a line between the stations for totes going on.
    drawPreZone() {
      const sim = this.sim, g = sim.grid, ps = sim.ports;
      if (ps.length > 1) this.conveyor([{ x: ps[0].hand.x + 0.5, y: g.D - 0.45 }, { x: ps[ps.length - 1].hand.x + 1.5, y: g.D - 0.45 }], 0.3, 0.9, '#2b3646');
      for (const p of ps) {
        this.conveyor([{ x: p.hand.x + 0.5, y: g.laneY + 0.8 }, { x: p.hand.x + 0.5, y: g.D }], 0.4, 1.4);
        this.conveyor([{ x: p.hand.x + 1.5, y: g.D - 0.85 }, { x: p.hand.x + 1.5, y: g.D }], 0.4, 1.4, '#2b3646');
      }
    }

    drawLabels() {
      WS.IsoRenderer.prototype.drawLabels.call(this);
      const g = this.sim.grid;
      for (const aisle of this.sim.aisles) this.text(`AISLE ${aisle.a + 1}`, g.laneX(aisle.a), g.frontY + 0.3, g.Z + 1.2, { size: 10, bg: 'rgba(15,23,42,0.82)', color: '#fde68a' });
    }

    // ---------------------------------------------------------------- picking
    pick(sx, sy) {
      const sim = this.sim, g = sim.grid;
      let best = null, bd = 18 * Math.max(1, this.cam.zoom);
      for (const r of sim.fleet) {
        for (const z of [0.3, g.Z * 0.35, g.Z * 0.7, g.Z]) {
          const d = this.screenDist(sx, sy, r.rx + 0.5, r.ry + 0.5, z);
          if (d < bd) { bd = d; best = { kind: 'robot', id: r.id }; }
        }
      }
      if (best) return best;
      // a rack column at some level, from the top down
      for (let l = g.L - 1; l >= 0; l--) {
        const w = this.toWorld(sx, sy, g.levelZ(l) + 0.5), x = Math.floor(w.x), y = Math.floor(w.y);
        if (g.inside(x, y) && g.type[g.idx(x, y)] === C.STORAGE) return { kind: 'cell', id: g.idx(x, y) };
      }
      const w = this.toWorld(sx, sy, 0), x = Math.floor(w.x), y = Math.floor(w.y);
      if (g.inside(x, y) && y < g.laneY + 1) {
        const i = g.idx(x, y), port = sim.ports.find((p) => p.cells.some((c) => g.idx(c.x, c.y) === i));
        if (port) return { kind: 'port', id: port.idx };
        if (g.type[i] !== C.BLOCKED) return { kind: 'cell', id: i };
      }
      return this.pickStations(this.toWorld(sx, sy, 1.5));
    }
  }

  WS.AcrRenderer = AcrRenderer;
})((globalThis.WS = globalThis.WS || {}));
