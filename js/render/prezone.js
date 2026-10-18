/* View parts for racking with its stations in front of the aisles
 * (RailRunner, SkyStack; see js/sim/prezone.js): the pre-zone conveyor
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

    // Totes riding the conveyors, for drawStations().
    conveyorItems(items) {
      const sim = this.sim, g = sim.grid;
      items.push({ d: g.B + 1.4, fn: () => this.drawPreZone() });
      for (const it of sim.conv) {
        const q = sim.posOnPath(it);
        items.push({ d: q.x + q.y + 0.3, fn: () => this.drawBin(q.x, q.y, it.back ? 1.4 : 2.0, it.bin.id, { w: 0.26, d: 0.3 }) });
      }
    }
    // Conveyor lines: to the stations (higher) and back to the aisles (lower).
    drawPreZone() {
      const sim = this.sim, g = sim.grid, last = sim.ports[sim.ports.length - 1].drop.x;
      this.conveyor([{ x: g.laneX(0), y: g.retY }, { x: last + 1.5, y: g.retY }], 0.42, 1.4, '#2b3646');
      for (const aisle of sim.aisles) this.conveyor([{ x: g.laneX(aisle.a), y: g.B + 0.5 }, { x: g.laneX(aisle.a), y: g.outY }], 0.4, 2.0);
      for (const p of sim.ports) {
        this.conveyor([{ x: p.drop.x + 1.5, y: g.retY }, { x: p.drop.x + 1.5, y: g.D }], 0.4, 1.4, '#2b3646');
        this.conveyor([{ x: p.drop.x + 0.5, y: g.outY }, { x: p.drop.x + 0.5, y: g.D }], 0.4, 2.0);
      }
      this.conveyor([{ x: g.laneX(0), y: g.outY }, { x: last + 0.5, y: g.outY }], 0.42, 2.0);
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
