/* Shared view for racking storage types (RailRunner, SkyStack, StackPilot):
 * racking drawn see-through so the machines inside the aisles stay visible.
 * The racking with its totes is a cached layer (redrawn when totes move or the
 * camera changes); a type draws its machines every frame on top and adds
 * rails with drawLaneRails(). The pre-zone conveyor and the levels × aisles
 * map of RailRunner and SkyStack are WS.PreZoneRenderer (js/render/prezone.js). */
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

    // Screen distance from (sx, sy) to a world point.
    screenDist(sx, sy, x, y, z) { const [px, py] = this.P(x, y, z); return Math.hypot(this.cam.x + px * this.cam.zoom - sx, this.cam.y + py * this.cam.zoom - sy); }
  }

  WS.RackRenderer = RackRenderer;
  WS.RACK_TOTE_H = TOTE_H;
})((globalThis.WS = globalThis.WS || {}));
