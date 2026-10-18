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
        return { kind: 'cell', id: sim.mapGrid.idx(a * 4 + part, g.L - 1 - l) };
      }
      return this.pickStations(this.toWorld(sx, sy, 1.5));
    }
    // nearest machine within a few pixels: [{ id, x, y, z }] from machinePoints()
    pickMachine(sx, sy) {
      let best = null, bd = 16 * Math.max(1, this.cam.zoom);
      for (const p of this.machinePoints()) { const d = this.screenDist(sx, sy, p.x, p.y, p.z); if (d < bd) { bd = d; best = { kind: 'robot', id: p.id }; } }
      return best;
    }
    machinePoints() { return []; }
  }

  WS.PreZoneRenderer = PreZoneRenderer;
})((globalThis.WS = globalThis.WS || {}));
