/* RailRunner view: racking drawn see-through so the shuttles running inside the
 * aisles stay visible, a lift tower at the front of every aisle, and the
 * pre-zone conveyor carrying totes to the stations and back. The racking with
 * its totes is a cached layer (redrawn when totes move or the camera changes);
 * shuttles, lifts, buffers and conveyors are drawn every frame on top. */
(function (WS) {
  'use strict';
  const { shade, STATE_COLORS, CLASS_COLORS } = WS;
  const TOTE_H = 0.9; // render levels

  class ShuttleRenderer extends WS.IsoRenderer {
    drawScene(alpha) {
      const sim = this.sim, g = sim.grid;
      this.drawFloor();
      this.drawCached('racks', g.version + '|' + this.opts.heat + '|' + this.reqKey(), () => this.renderRacks());
      this.drawShuttles();
      this.drawSelectedCell();
      const items = [];
      for (const aisle of sim.aisles) items.push({ d: g.laneX(aisle.a) + g.B, fn: () => this.drawLift(aisle) });
      items.push({ d: g.B + 1.4, fn: () => this.drawPreZone() });
      for (const it of sim.conv) {
        const q = sim.posOnPath(it);
        items.push({ d: q.x + q.y + 0.3, fn: () => this.drawBin(q.x, q.y, it.back ? 1.4 : 2.0, it.bin.id, { w: 0.26, d: 0.3 }) });
      }
      this.drawStations(items);
    }
    // requested totes are drawn white, so the cache must notice new requests
    reqKey() { let n = 0; for (const b of this.sim.binsWithRequests) n += b.loc === 'grid' ? 1 : 0; return n; }

    toteColor(b) {
      if (b.requests.length) return '#f8fafc';
      return this.opts.heat ? CLASS_COLORS[this.sim.inv.binClass(b)] : '#4a5a70';
    }

    // Racking drawn see-through: each rack side is a tinted volume with the ends
    // of its totes showing on the aisle side and at the front, steel beams per
    // level and uprights every two bays. Shuttles are drawn solid on top.
    renderRacks() {
      const sim = this.sim, g = sim.grid, inv = sim.inv, P = this.P.bind(this), B = g.B, c = this.ctx;
      for (const aisle of sim.aisles) {
        const a = aisle.a;
        for (const s of [0, 1]) {
          const x0 = a * 3 + s * 2, x1 = x0 + 1, faceX = s === 0 ? x1 : x0; // tote ends face the aisle
          this.quadTop(x0, 0, x1, B, 0.01, 'rgba(0,0,0,0.3)');
          c.globalAlpha = 0.18;
          this.box(x0, 0, g.Z0 - 0.2, x1, B, g.Z, '#334155');
          c.globalAlpha = 1;
          for (let l = 0; l < g.L; l++) {
            const z = g.levelZ(l);
            for (let b = 0; b < B - 2; b++) {
              const id = aisle.slot[sim.si(l, s, b)];
              if (!id) continue;
              const col = this.toteColor(inv.binById.get(id));
              this.faceX(faceX, b + 0.1, b + 0.9, z + 0.06, z + 0.06 + TOTE_H, WS.rgba(col, 0.85));
              this.faceX(faceX, b + 0.08, b + 0.92, z + 0.06 + TOTE_H - 0.18, z + 0.06 + TOTE_H, shade(col, 0.2));
              if (b === B - 3) this.faceY(B - 2, x0 + 0.1, x1 - 0.1, z + 0.06, z + 0.06 + TOTE_H, shade(col, -0.15));
            }
            this.line(P(x1, 0, z), P(x1, B, z), 'rgba(203,213,225,0.35)', 1);
            this.line(P(x0, B, z), P(x1, B, z), 'rgba(203,213,225,0.5)', 1);
          }
          for (let b = 0; b <= B; b += 2) this.line(P(x1, b, 0), P(x1, b, g.Z), 'rgba(148,163,184,0.4)', 1);
          for (const [px, py] of [[x0, B], [x1, B], [x1, 0]]) this.line(P(px, py, 0), P(px, py, g.Z), '#94a3b8', 1.6);
          this.line(P(x0, B, g.Z), P(x1, B, g.Z), '#94a3b8', 1.6);
          this.line(P(x1, 0, g.Z), P(x1, B, g.Z), '#94a3b8', 1.6);
          this.line(P(x0, 0, g.Z), P(x0, B, g.Z), 'rgba(148,163,184,0.6)', 1);
        }
        // shuttle rails along the lane, one pair per level
        const lx = a * 3 + 1;
        for (let l = 0; l < g.L; l++) {
          const z = g.levelZ(l);
          this.line(P(lx + 0.12, 0, z), P(lx + 0.12, B, z), 'rgba(250,204,21,0.35)', 1);
          this.line(P(lx + 0.88, 0, z), P(lx + 0.88, B, z), 'rgba(250,204,21,0.35)', 1);
        }
      }
    }

    // Shuttles, and the totes waiting in each level's front buffers.
    drawShuttles() {
      const sim = this.sim, g = sim.grid, B = g.B;
      for (const aisle of sim.aisles) {
        const a = aisle.a;
        for (let l = 0; l < g.L; l++) {
          const z = g.levelZ(l);
          [[aisle.outBuf[l], a * 3], [aisle.inBuf[l], a * 3 + 2]].forEach(([buf, x0]) => buf.forEach((it, k) => {
            const b = B - 1 - k, col = '#f59e0b';
            this.box(x0 + 0.1, b + 0.1, z + 0.06, x0 + 0.9, b + 0.9, z + 0.06 + TOTE_H, col, { top: shade(col, 0.2) });
          }));
        }
        for (const sh of aisle.shuttles) {
          const z = g.levelZ(sh.l), x0 = a * 3 + 1.08, x1 = a * 3 + 1.92, y0 = sh.pos - 0.45, y1 = sh.pos + 0.45, col = STATE_COLORS[sh.displayState];
          if (!sh.idle) this.glow(a * 3 + 1.5, sh.pos, z + 0.3, 22, col, 0.55);
          // dark chassis on the rails, a state-coloured light band, a yellow load handler on top
          this.box(x0, y0, z + 0.02, x1, y1, z + 0.34, '#273244', { top: '#3b4a60', left: '#222b3a', right: '#1a2230' });
          this.faceY(y1 + 0.002, x0 + 0.06, x1 - 0.06, z + 0.14, z + 0.24, col);
          this.faceX(x1 + 0.002, y0 + 0.06, y1 - 0.06, z + 0.14, z + 0.24, shade(col, -0.25));
          this.quadTop(x0 + 0.12, y0 + 0.08, x1 - 0.12, y1 - 0.08, z + 0.341, sh.idle ? '#5c4a14' : '#ca8a04');
          if (sh.bin) { const b = sim.inv.binById.get(sh.bin), c2 = this.toteColor(b); this.box(x0 + 0.08, y0 + 0.08, z + 0.34, x1 - 0.08, y1 - 0.08, z + 0.34 + TOTE_H, c2, { top: shade(c2, 0.15) }); }
          const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === sh.id;
          if (sel) this.quadTop(x0 - 0.1, y0 - 0.1, x1 + 0.1, y1 + 0.1, z + 0.02, null, '#38bdf8', 2.5);
        }
      }
    }
    drawSelectedCell() {
      const s = this.selected, sim = this.sim, g = sim.grid;
      if (!s || s.kind !== 'cell') return;
      const c = sim.mapGrid.at(s.id);
      if (!c) return;
      const x0 = c.a * 3 + c.part, z = c.part === 3 ? 0 : g.levelZ(c.level);
      if (c.part === 0 || c.part === 2) this.quadTop(x0, 0, x0 + 1, g.B - 2, z + 0.02, 'rgba(56,189,248,0.15)', '#38bdf8', 2.5);
    }

    // Lift tower in front of the aisle with its carriage and the I/O transfer.
    drawLift(aisle) {
      const g = this.sim.grid, lift = aisle.lift, x0 = aisle.a * 3 + 1.08, x1 = aisle.a * 3 + 1.92, y0 = g.B + 0.06, y1 = g.B + 0.94;
      for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) this.box(px - 0.04, py - 0.04, 0, px + 0.04, py + 0.04, g.Z + 0.8, '#64748b');
      this.box(x0 - 0.04, y0 - 0.04, g.Z + 0.8, x1 + 0.04, y1 + 0.04, g.Z + 1.1, '#475569');
      const col = STATE_COLORS[lift.displayState];
      this.box(x0 + 0.04, y0 + 0.04, lift.z - 0.12, x1 - 0.04, y1 - 0.04, lift.z, '#94a3b8', { top: '#334155' });
      this.faceY(y1 - 0.039, x0 + 0.04, x1 - 0.04, lift.z - 0.12, lift.z - 0.02, col);
      if (lift.bin) { const b = this.sim.inv.binById.get(lift.bin), c2 = this.toteColor(b); this.box(x0 + 0.12, y0 + 0.1, lift.z, x1 - 0.12, y1 - 0.1, lift.z + TOTE_H, c2, { top: shade(c2, 0.15) }); }
      if (!lift.idle) this.glow(aisle.a * 3 + 1.5, g.B + 0.5, lift.z + 0.5, 18, col, 0.45);
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === lift.id;
      if (sel) this.quadTop(x0 - 0.1, y0 - 0.1, x1 + 0.1, y1 + 0.1, lift.z, null, '#38bdf8', 2.5);
      // totes waiting to go up
      aisle.inQ.slice(0, 2).forEach((it, k) => this.drawBin(g.laneX(aisle.a), g.B + 0.55 + k * 0.6, 1.4, it.bin.id, { w: 0.26, d: 0.28 }));
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
      const sim = this.sim, g = sim.grid, near = (x, y, z) => { const [px, py] = this.P(x, y, z); return Math.hypot(this.cam.x + px * this.cam.zoom - sx, this.cam.y + py * this.cam.zoom - sy); };
      let best = null, bd = 16 * Math.max(1, this.cam.zoom);
      for (const aisle of sim.aisles) {
        for (const sh of aisle.shuttles) { const d = near(g.laneX(aisle.a), sh.pos, g.levelZ(sh.l) + 0.3); if (d < bd) { bd = d; best = { kind: 'robot', id: sh.id }; } }
        const d = near(g.laneX(aisle.a), g.B + 0.5, aisle.lift.z); if (d < bd) { bd = d; best = { kind: 'robot', id: aisle.lift.id }; }
      }
      if (best) return best;
      // a rack side at some level: try levels from the top down
      for (let l = g.L - 1; l >= 0; l--) {
        const w = this.toWorld(sx, sy, g.levelZ(l) + 0.5), a = Math.floor(w.x / 3), part = Math.floor(w.x - a * 3);
        if (a < 0 || a >= g.A || w.y < 0 || w.y >= g.B || part === 1) continue;
        return { kind: 'cell', id: sim.mapGrid.idx(a * 4 + part, g.L - 1 - l) };
      }
      return this.pickStations(this.toWorld(sx, sy, 1.5));
    }
  }

  WS.ShuttleRenderer = ShuttleRenderer;
})((globalThis.WS = globalThis.WS || {}));
