/* Shared view for racking storage types (RailRunner, SkyStack): racking drawn
 * see-through so the machines inside the aisles stay visible, and the pre-zone
 * conveyor carrying totes to the stations and back. The racking with its totes
 * is a cached layer (redrawn when totes move or the camera changes); a type
 * draws its machines every frame on top and adds rails with drawLaneRails(). */
(function (WS) {
  'use strict';
  const { shade, CLASS_COLORS } = WS;
  const TOTE_H = 0.9; // render levels

  class RackRenderer extends WS.IsoRenderer {
    drawRacking() { const g = this.sim.grid; this.drawCached('racks', g.version + '|' + this.opts.heat + '|' + this.reqKey(), () => this.renderRacks()); }
    // requested totes are drawn white, so the cache must notice new requests
    reqKey() { let n = 0; for (const b of this.sim.binsWithRequests) n += b.loc === 'grid' ? 1 : 0; return n; }

    toteColor(b) {
      if (b.requests.length) return '#f8fafc';
      return this.opts.heat ? CLASS_COLORS[this.sim.inv.binClass(b)] : '#4a5a70';
    }
    // a tote standing upright, as on a machine or a buffer position
    toteBox(x0, y0, x1, y1, z, col) { this.box(x0, y0, z, x1, y1, z + TOTE_H, col, { top: shade(col, 0.15) }); }

    // Each rack side is a tinted volume with the ends of its totes showing on
    // the aisle side and at the front, steel beams per level and uprights every
    // two bays. Bays start at y = g.Y0 (0 unless a cross aisle runs behind them).
    renderRacks() {
      const sim = this.sim, g = sim.grid, inv = sim.inv, P = this.P.bind(this), Y0 = g.Y0 || 0, B = Y0 + g.B, c = this.ctx;
      for (const aisle of sim.aisles) {
        const a = aisle.a;
        for (const s of [0, 1]) {
          const x0 = a * 3 + s * 2, x1 = x0 + 1, faceX = s === 0 ? x1 : x0; // tote ends face the aisle
          this.quadTop(x0, Y0, x1, B, 0.01, 'rgba(0,0,0,0.3)');
          c.globalAlpha = 0.18;
          this.box(x0, Y0, g.Z0 - 0.2, x1, B, g.Z, '#334155');
          c.globalAlpha = 1;
          for (let l = 0; l < g.L; l++) {
            const z = g.levelZ(l);
            for (let b = 0; b < g.SB; b++) {
              const id = aisle.slot[sim.si(l, s, b)];
              if (!id) continue;
              const col = this.toteColor(inv.binById.get(id));
              this.faceX(faceX, Y0 + b + 0.1, Y0 + b + 0.9, z + 0.06, z + 0.06 + TOTE_H, WS.rgba(col, 0.85));
              this.faceX(faceX, Y0 + b + 0.08, Y0 + b + 0.92, z + 0.06 + TOTE_H - 0.18, z + 0.06 + TOTE_H, shade(col, 0.2));
              if (b === g.SB - 1) this.faceY(Y0 + g.SB, x0 + 0.1, x1 - 0.1, z + 0.06, z + 0.06 + TOTE_H, shade(col, -0.15));
            }
            this.line(P(x1, Y0, z), P(x1, B, z), 'rgba(203,213,225,0.35)', 1);
            this.line(P(x0, B, z), P(x1, B, z), 'rgba(203,213,225,0.5)', 1);
          }
          for (let b = Y0; b <= B; b += 2) this.line(P(x1, b, 0), P(x1, b, g.Z), 'rgba(148,163,184,0.4)', 1);
          for (const [px, py] of [[x0, B], [x1, B], [x1, Y0]]) this.line(P(px, py, 0), P(px, py, g.Z), '#94a3b8', 1.6);
          this.line(P(x0, B, g.Z), P(x1, B, g.Z), '#94a3b8', 1.6);
          this.line(P(x1, Y0, g.Z), P(x1, B, g.Z), '#94a3b8', 1.6);
          this.line(P(x0, Y0, g.Z), P(x0, B, g.Z), 'rgba(148,163,184,0.6)', 1);
        }
        this.drawLaneRails(a);
      }
    }
    drawLaneRails() {}

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

    // Screen distance from (sx, sy) to a world point.
    screenDist(sx, sy, x, y, z) { const [px, py] = this.P(x, y, z); return Math.hypot(this.cam.x + px * this.cam.zoom - sx, this.cam.y + py * this.cam.zoom - sy); }
    pick(sx, sy) {
      const sim = this.sim, g = sim.grid;
      const m = this.pickMachine(sx, sy);
      if (m) return m;
      // a rack side at some level: try levels from the top down
      for (let l = g.L - 1; l >= 0; l--) {
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

  WS.RackRenderer = RackRenderer;
  WS.RACK_TOTE_H = TOTE_H;
})((globalThis.WS = globalThis.WS || {}));
