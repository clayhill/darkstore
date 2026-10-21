/* View parts for racking with its stations in front of the aisles
 * (RailRunner, SkyStack; see js/sim/prezone.js): the one-way pre-zone loop
 * carrying totes to the stations and back, aisle labels, and picking machines
 * and rack sides that the levels × aisles control-room map selects. */
(function (WS) {
  'use strict';

  class PreZoneRenderer extends WS.RackRenderer {
    // Highlight of a rack side picked in the control-room map or the view.
    drawSelectedCell() {
      const s = this.selected, sim = this.sim, g = sim.grid;
      if (!s || s.kind !== 'cell') return;
      const f = sim.bots ? sim.mapGrid.floorCell(s.id) : -1;
      if (f >= 0 && !sim.mapGrid.at(s.id)) { this.quadTop(g.cx(f), g.cy(f), g.cx(f) + 1, g.cy(f) + 1, 0.02, 'rgba(56,189,248,0.15)', '#38bdf8', 2.5); return; }
      const c = sim.mapGrid.at(s.id);
      if (!c || (c.part !== 0 && c.part !== 2)) return;
      const x0 = c.a * 3 + c.part;
      this.quadTop(x0, 0, x0 + 1, g.SB, g.levelZ(c.level) + 0.02, 'rgba(56,189,248,0.15)', '#38bdf8', 2.5);
    }

    // Totes riding the conveyors, for drawStations(). The conveyors
    // themselves are drawn before the racking (drawPreZone()), so a tote a
    // machine slides onto one is never painted over by the belt.
    conveyorItems(items) { this.conveyorTotes(items, this.sim.grid.convZ); }
    // The pre-zone loop and its spurs, all one way: the near line runs left
    // past the aisles' outfeeds and infeeds, the far line right past the
    // stations, with arrows along the belts.
    drawPreZone() {
      const z = this.sim.grid.convZ;
      for (const line of this.sim.preZoneLines()) { this.conveyor(line, 0.72, z, null, { legs: true }); this.flowArrows(line, z); }
    }

    // ---------------------------------------------------------------- transport robots
    // With robots instead of the loop (WS.ToteBots): the floor in front of
    // the racking, cached; then the robots among the stations' items.
    drawBotFloor() {
      const sim = this.sim, g = sim.grid, C = WS.CELL, P = this.P.bind(this);
      this.poly([P(0, g.handY, 0), P(g.W, g.handY, 0), P(g.W, g.D, 0), P(0, g.D, 0)], '#1f2a3a');
      for (const y of [g.handY, ...g.west, ...g.east, g.portY]) for (let x = 0; x < g.W; x++) {
        const t = g.type[g.idx(x, y)];
        if (t === C.HIGHWAY) {
          this.quadTop(x + 0.03, y + 0.03, x + 0.97, y + 0.97, 0, '#243246');
          const d = g.west.includes(y) ? -1 : 1, mx = x + 0.5, my = y + 0.5;
          this.line(P(mx - 0.12 * d, my - 0.16, 0), P(mx + 0.12 * d, my, 0), 'rgba(148,163,184,0.45)', 1.6);
          this.line(P(mx + 0.12 * d, my, 0), P(mx - 0.12 * d, my + 0.16, 0), 'rgba(148,163,184,0.45)', 1.6);
        } else if (t === C.PARK) this.quadTop(x + 0.1, y + 0.1, x + 0.9, y + 0.9, 0, '#13261d', 'rgba(74,222,128,0.35)', 1);
        else if (t === C.CHARGER) { this.quadTop(x + 0.08, y + 0.08, x + 0.92, y + 0.92, 0, '#14532d'); this.quadTop(x + 0.2, y + 0.2, x + 0.8, y + 0.8, 0, null, '#4ade80', 1.5); }
        else if (t === C.LANE) {
          this.quadTop(x + 0.04, y + 0.04, x + 0.96, y + 0.96, 0, '#2a2614');
          const mx = x + 0.5, my = y + 0.5;
          this.line(P(mx - 0.2, my - 0.2, 0), P(mx + 0.1, my, 0), 'rgba(250,204,21,0.55)', 2);
          this.line(P(mx + 0.1, my, 0), P(mx - 0.2, my + 0.2, 0), 'rgba(250,204,21,0.55)', 2);
        } else if (t === C.HAND || t === C.PORT || t === C.PORT_OUT) {
          this.quadTop(x + 0.04, y + 0.04, x + 0.96, y + 0.96, 0, '#3a2f12');
          this.quadTop(x + 0.04, y + 0.04, x + 0.96, y + 0.96, 0, null, '#facc15', 2);
        }
      }
      const edge = 'rgba(202,138,4,0.55)';
      this.line(P(0, g.handY + 1, 0), P(g.W, g.handY + 1, 0), edge, 1.2);
      this.line(P(0, g.portY, 0), P(g.W, g.portY, 0), edge, 1.2);
      for (const ch of g.chargers) this.box(ch.x + 0.82, ch.y + 0.3, 0, ch.x + 0.98, ch.y + 0.7, 1.8, '#334155');
    }
    // traffic heat on the robot floor
    drawHeat() {
      const g = this.sim.grid;
      for (let i = g.idx(0, g.handY); i < g.waitHeat.length; i++) {
        const v = Math.max(Math.min(1, g.waitHeat[i] / 40), Math.min(1, g.passHeat[i] / 60) * 0.6);
        if (v > 0.04) this.quadTop(g.cx(i), g.cy(i), g.cx(i) + 1, g.cy(i) + 1, 0.01, `rgba(239,68,68,${(v * 0.7).toFixed(2)})`);
      }
    }
    botItems(items, alpha) {
      for (const r of this.sim.bots.robots) {
        const x = r.prx + (r.rx - r.prx) * alpha, y = r.pry + (r.ry - r.pry) * alpha;
        items.push({ d: x + y + 1, fn: () => this.drawBot(r, x, y) });
      }
    }
    // A roller-top robot: a low white body with a dark bumper and a teal
    // band, the roller deck on top at conveyor height, the tote on it or
    // rolling on or off.
    drawBot(r, x, y) {
      const sim = this.sim, g = sim.grid, col = WS.led(this, r, sim), cx = x + 0.5, cy = y + 0.5, H = g.convZ - 0.12;
      const edge = { stroke: 'rgba(15,23,42,0.5)', lw: 0.8 };
      this.quadTop(cx - 0.36, cy - 0.34, cx + 0.48, cy + 0.5, 0.005, 'rgba(0,0,0,0.35)');
      this.box(cx - 0.4, cy - 0.4, 0.02, cx + 0.4, cy + 0.4, H, '#e2e8f0', Object.assign({ top: '#cbd5e1' }, edge));
      this.faceY(cy + 0.401, cx - 0.4, cx + 0.4, 0.02, 0.18, '#1e293b'); this.faceX(cx + 0.401, cy - 0.4, cy + 0.4, 0.02, 0.18, '#0f172a');
      this.faceY(cy + 0.402, cx - 0.34, cx + 0.34, 0.9, 1.08, '#0d9488'); this.faceX(cx + 0.402, cy - 0.34, cy + 0.34, 0.9, 1.08, '#0f766e');
      this.faceY(cy + 0.403, cx - 0.1, cx + 0.1, 1.3, 1.42, col);
      // the roller deck, rollers across the way totes roll on and off (along y)
      this.box(cx - 0.36, cy - 0.36, H, cx + 0.36, cy + 0.36, H + 0.06, '#475569', { top: '#334155' });
      for (let k = 0; k < 6; k++) { const ry = cy - 0.3 + k * 0.12; this.line(this.P(cx - 0.33, ry, H + 0.065), this.P(cx + 0.33, ry, H + 0.065), '#94a3b8', 1); }
      const xf = this.xfer(r), T = sim.convTote();
      let tx = cx, ty = cy, id = r.bin;
      if (xf) { id = xf.u == null ? null : xf.id; if (xf.u != null) { tx = cx + (xf.at.x - cx) * xf.u; ty = cy + (xf.at.y - cy) * xf.u; } }
      if (id) this.toteBox(tx - T.w, ty - T.d, tx + T.w, ty + T.d, H + 0.06, this.toteColor(sim.inv.binById.get(id)));
      if (r.displayState === 'WAITING_IN_TRAFFIC' || r.busy) this.glow(cx, cy, H + 0.4, 18, col, 0.35 + 0.25 * Math.sin(this.t * 6));
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === r.id;
      if (sel) this.quadTop(x - 0.06, y - 0.06, x + 1.06, y + 1.06, 0.02, null, '#38bdf8', 2.5);
      if (this.opts.labels) this.robotTag(r, cx, cy, H + 2.2, 'rgba(241,245,249,0.85)');
    }

    drawLabels() {
      super.drawLabels();
      const g = this.sim.grid;
      for (const aisle of this.sim.aisles) this.text(`AISLE ${aisle.a + 1}`, g.laneX(aisle.a), g.B + 0.5, g.Z + 1.8, { size: 10, bg: 'rgba(15,23,42,0.82)', color: '#fde68a' });
    }

    pick(sx, sy) {
      const sim = this.sim, g = sim.grid;
      const m = this.pickMachine(sx, sy);
      if (m) return m;
      // a rack side at some level: try levels from the top down
      for (let l = g.L - 1; l >= 0; l--) {
        if (!this.levelShown(l)) continue;
        const w = this.toWorld(sx, sy, g.levelZ(l) + 0.5), a = Math.floor(w.x / 3), part = Math.floor(w.x - a * 3);
        if (a < 0 || a >= g.A || w.y < 0 || w.y >= g.B || part === 1) continue;
        return { kind: 'cell', id: sim.mapGrid.idx(sim.mapGrid.colX(a, part), g.L - 1 - l) };
      }
      if (sim.bots) {
        // a cell of the robot floor: a station's lane or handover cells open the station
        const w = this.toWorld(sx, sy, 0), x = Math.floor(w.x), y = Math.floor(w.y);
        if (g.inside(x, y) && y >= g.B) {
          const port = sim.ports.find((p) => [...p.dock.cells, p.out].some((c) => c.x === x && c.y === y));
          if (port) return { kind: 'port', id: port.idx };
          if (g.type[g.idx(x, y)] !== WS.CELL.BLOCKED) return { kind: 'cell', id: sim.mapGrid.idx(x, y + sim.mapGrid.floorDY) };
        }
      }
      return this.pickStations(this.toWorld(sx, sy, 1.5));
    }
    // nearest machine within a few pixels: [{ id, x, y, z }] from machinePoints()
    pickMachine(sx, sy) {
      let best = null, bd = 16 * Math.max(1, this.cam.zoom);
      const pts = this.machinePoints();
      if (this.sim.bots) for (const r of this.sim.bots.robots) pts.push({ id: r.id, x: r.rx + 0.5, y: r.ry + 0.5, z: 1.2 });
      for (const p of pts) { const d = this.screenDist(sx, sy, p.x, p.y, p.z); if (d < bd) { bd = d; best = { kind: 'robot', id: p.id }; } }
      return best;
    }
    machinePoints() { return []; }
  }

  WS.PreZoneRenderer = PreZoneRenderer;
})((globalThis.WS = globalThis.WS || {}));
