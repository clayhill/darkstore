/* Shared view for racking storage types (RailRunner, SkyStack, StackPilot).
 * Two ways to draw the racking:
 *  see-through (default)  a cached layer, redrawn when totes move or the
 *                         camera changes; the machines are drawn on top
 *  solid (opts.solid)     every tote a box, back to front, also cached; each
 *                         machine is drawn on it and then the totes in front
 *                         of the machine are drawn again where they overlap
 *                         it, so the racking hides whatever is behind it
 * A type draws its scene with drawRackScene() and adds rails with
 * drawLaneRails(). It also animates its machines' tote transfers with xfer().
 * The pre-zone conveyor and the levels × aisles map of RailRunner and SkyStack
 * are WS.PreZoneRenderer (js/render/prezone.js). */
(function (WS) {
  'use strict';
  const { shade, CLASS_COLORS } = WS;
  const TOTE_H = 0.9; // render levels
  const TW_HALF = 32; // half a cell's screen width (WS.IsoView)
  const ease = (u) => u * u * (3 - 2 * u);

  class RackRenderer extends WS.IsoRenderer {
    // Racking and the machines in its aisles: inAisle(aisle) lists the draw
    // functions of the aisle's machines, back to front; behind() those of
    // things behind the whole racking.
    drawRackScene(inAisle, behind = []) {
      this.moving = this.movingTotes();
      this.drawRacking();
      if (!this.opts.solid) { for (const aisle of this.sim.aisles) inAisle(aisle).forEach((f) => f()); behind.forEach((f) => f()); return; }
      this.sideBounds = this.rackSideBounds();
      behind.forEach((f) => this.drawOccluded(f, 0));
      for (const aisle of this.sim.aisles) inAisle(aisle).forEach((f) => this.drawOccluded(f, aisle.a * 3 + 2));
    }
    drawRacking() {
      const g = this.sim.grid, o = this.opts;
      this.drawCached('racks', [g.version, o.heat, o.solid, this.reqKey(), o.cutTop, o.cutOnly, [...this.moving].join()].join('|'), () => {
        if (!o.solid) { this.renderRacks(); return; }
        for (const aisle of this.sim.aisles) { this.rackSide(aisle, 0); this.drawLaneRails(aisle.a); this.rackSide(aisle, 1); }
      });
    }
    // Screen bounds of what is drawn while this.track is set (see drawOccluded).
    P(x, y, z) {
      const p = super.P(x, y, z), t = this.track;
      if (t) { if (p[0] < t.x0) t.x0 = p[0]; if (p[0] > t.x1) t.x1 = p[0]; if (p[1] < t.y0) t.y0 = p[1]; if (p[1] > t.y1) t.y1 = p[1]; }
      return p;
    }
    // Draw something among solid racking: draw it, then draw again the totes
    // of the rack sides from x = fromX on (those in front of it) that overlap it.
    drawOccluded(draw, fromX) {
      this.track = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
      draw();
      const t = this.track, sim = this.sim, g = sim.grid, inv = sim.inv, Y0 = g.Y0 || 0;
      this.track = null;
      if (t.x0 > t.x1) return;
      const mx = (TW_HALF + 4), my = TW_HALF + this.kz * (TOTE_H + 0.2);
      for (const aisle of sim.aisles) for (const s of [0, 1]) {
        const x0 = aisle.a * 3 + s * 2, sb = this.sideBounds[aisle.a * 2 + s];
        if (x0 < fromX || sb.x1 < t.x0 || sb.x0 > t.x1 || sb.y1 < t.y0 || sb.y0 > t.y1) continue;
        for (let b = 0; b < g.SB; b++) for (let l = 0; l < g.L; l++) {
          const id = aisle.slot[sim.si(l, s, b)];
          if (!id || this.moving.has(id) || !this.levelShown(l)) continue;
          const z = g.levelZ(l) + 0.06, [px, py] = super.P(x0 + 0.5, Y0 + b + 0.5, z);
          if (px < t.x0 - mx || px > t.x1 + mx || py < t.y0 - my || py > t.y1 + my) continue;
          this.solidTote(x0, Y0 + b, z, this.toteColor(inv.binById.get(id)));
        }
      }
    }
    // screen bounds of every rack side, [aisle * 2 + side]
    rackSideBounds() {
      const g = this.sim.grid, Y0 = g.Y0 || 0, out = [];
      for (const aisle of this.sim.aisles) for (const s of [0, 1]) {
        const x0 = aisle.a * 3 + s * 2, pts = [];
        for (const x of [x0, x0 + 1]) for (const y of [Y0, Y0 + g.SB]) for (const z of [0, g.Z]) pts.push(super.P(x, y, z));
        out.push({ x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) });
      }
      return out;
    }
    solidTote(x0, y0, z, col) { this.box(x0 + 0.08, y0 + 0.1, z, x0 + 0.92, y0 + 0.9, z + TOTE_H, col, { top: shade(col, 0.15), left: shade(col, -0.3), right: shade(col, -0.48) }); }
    // Cut-away (the Levels slider): all levels, levels up to opts.cutTop, or that level only.
    levelShown(l) { const t = this.opts.cutTop; return t == null || (this.opts.cutOnly ? l === t : l <= t); }
    // top and bottom of the racking drawn under the cut-away
    cutSpan() {
      const g = this.sim.grid, t = this.opts.cutTop;
      return { Z: t == null ? g.Z : g.levelZ(t) + g.LH, zb: t != null && this.opts.cutOnly ? g.levelZ(t) - 0.2 : g.Z0 - 0.2 };
    }
    // requested totes are drawn white, so the cache must notice new requests
    reqKey() { let n = 0; for (const b of this.sim.binsWithRequests) n += b.loc === 'grid' ? 1 : 0; return n; }

    toteColor(b) {
      if (b.requests.length) return '#f8fafc';
      return this.opts.heat ? CLASS_COLORS[this.sim.inv.binClass(b)] : '#4a5a70';
    }
    // a tote on a machine, a buffer or a conveyor
    toteBox(x0, y0, x1, y1, z, col) { this.tote(x0, y0, x1, y1, z, TOTE_H, col); }
    // Totes keep their colour and size from the racking through the machines
    // and conveyors to the station (convTote(): the size on the conveyors).
    drawBin(x, y, z, id, o = {}) {
      const b = id && this.sim.inv.binById.get(id);
      return super.drawBin(x, y, z, id, b && !o.color ? Object.assign({ color: this.toteColor(b) }, o) : o);
    }
    portBinSize() { const T = this.sim.convTote(), s = { w: T.w, d: T.d }; return { q: s, pick: s }; }
    // small chevrons on a belt pointing the way it runs
    flowArrows(pts, z) {
      const P = this.P.bind(this);
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k], dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y), len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
        for (let s = 0.5; s < len - 0.2; s += 1.6) {
          const x = a.x + dx * s, y = a.y + dy * s, nx = -dy * 0.16, ny = dx * 0.16;
          this.line(P(x - dx * 0.12 + nx, y - dy * 0.12 + ny, z + 0.01), P(x + dx * 0.08, y + dy * 0.08, z + 0.01), 'rgba(250,204,21,0.55)', 1.6);
          this.line(P(x + dx * 0.08, y + dy * 0.08, z + 0.01), P(x - dx * 0.12 - nx, y - dy * 0.12 - ny, z + 0.01), 'rgba(250,204,21,0.55)', 1.6);
        }
      }
    }
    // Totes on the conveyors, except one a machine is lifting off: { d, fn } for drawStations().
    conveyorTotes(items, z) {
      const sim = this.sim, T = sim.convTote();
      for (const it of sim.conv) {
        if (this.moving && this.moving.has(it.bin.id)) continue;
        const q = sim.convAt(it);
        items.push({ d: q.x + q.y + 0.3, fn: () => this.drawBin(q.x, q.y, z, it.bin.id, { w: T.w, d: T.d }) });
      }
    }

    // ---------------------------------------------------------------- tote transfers
    // A machine taking or putting a tote (m.xfer = { id, take, side }, set by
    // the simulation for the length of the handling time): the forks go out
    // (first 40 %), lift or set the tote down (to 60 %) and come back (the rest).
    // reach: how far the forks are out (0–1). u: where the tote is, from 0 on
    // the machine to 1 at the rack position; null while it still stands in the
    // rack, which then draws it.
    xfer(m) {
      const x = m.xfer, op = m.op;
      if (!x || !op || (op.op !== 'wait' && op.op !== 'timer')) return null;
      const f = Math.min(1, op.t / op.dur), reach = f < 0.4 ? f / 0.4 : f < 0.6 ? 1 : (1 - f) / 0.4;
      const u = x.take ? (f < 0.6 ? null : reach) : f < 0.4 ? reach : 1;
      return { id: x.id, take: x.take, side: x.side, slot: x.slot, at: x.at, io: x.io, reach: ease(reach), u: u == null ? null : ease(u) };
    }
    // totes lifted off a rack position, buffer or infeed: those draw them no longer
    movingTotes() {
      const s = new Set();
      for (const m of this.sim.fleet) { const x = this.xfer(m); if (x && x.take && x.u != null) s.add(x.id); }
      return s;
    }
    // x of the middle of a rack side's totes next to aisle a (side 0 left, 1 right)
    sideX(a, side) { return a * 3 + side * 2 + 0.5; }

    // ---------------------------------------------------------------- see-through racking
    // Each rack side is a tinted volume with the ends of its totes showing on
    // the aisle side and at the front, steel beams per level and uprights every
    // two bays. Bays start at y = g.Y0 (0 unless a cross aisle runs behind them).
    renderRacks() {
      const sim = this.sim, g = sim.grid, inv = sim.inv, P = this.P.bind(this), Y0 = g.Y0 || 0, B = Y0 + g.B, c = this.ctx, { Z, zb } = this.cutSpan();
      for (const aisle of sim.aisles) {
        const a = aisle.a;
        for (const s of [0, 1]) {
          const x0 = a * 3 + s * 2, x1 = x0 + 1, faceX = s === 0 ? x1 : x0; // tote ends face the aisle
          this.quadTop(x0, Y0, x1, B, 0.01, 'rgba(0,0,0,0.3)');
          c.globalAlpha = 0.18;
          this.box(x0, Y0, zb, x1, B, Z, '#334155');
          c.globalAlpha = 1;
          for (let l = 0; l < g.L; l++) {
            if (!this.levelShown(l)) continue;
            const z = g.levelZ(l);
            for (let b = 0; b < g.SB; b++) {
              const id = aisle.slot[sim.si(l, s, b)];
              if (!id || this.moving.has(id)) continue;
              const col = this.toteColor(inv.binById.get(id));
              this.faceX(faceX, Y0 + b + 0.1, Y0 + b + 0.9, z + 0.06, z + 0.06 + TOTE_H, WS.rgba(col, 0.85));
              this.faceX(faceX, Y0 + b + 0.08, Y0 + b + 0.92, z + 0.06 + TOTE_H - 0.18, z + 0.06 + TOTE_H, shade(col, 0.2));
              if (b === g.SB - 1) this.faceY(Y0 + g.SB, x0 + 0.1, x1 - 0.1, z + 0.06, z + 0.06 + TOTE_H, shade(col, -0.15));
            }
            this.line(P(x1, Y0, z), P(x1, B, z), 'rgba(203,213,225,0.35)', 1);
            this.line(P(x0, B, z), P(x1, B, z), 'rgba(203,213,225,0.5)', 1);
          }
          for (let b = Y0; b <= B; b += 2) this.line(P(x1, b, 0), P(x1, b, Z), 'rgba(148,163,184,0.4)', 1);
          for (const [px, py] of [[x0, B], [x1, B], [x1, Y0]]) this.line(P(px, py, 0), P(px, py, Z), '#94a3b8', 1.6);
          this.line(P(x0, B, Z), P(x1, B, Z), '#94a3b8', 1.6);
          this.line(P(x1, Y0, Z), P(x1, B, Z), '#94a3b8', 1.6);
          this.line(P(x0, Y0, Z), P(x0, B, Z), 'rgba(148,163,184,0.6)', 1);
        }
        this.drawLaneRails(a);
      }
    }
    drawLaneRails() {}

    // ---------------------------------------------------------------- solid racking
    // One rack side drawn solid, back to front: the far face's uprights and
    // beams, every tote as a box, then the near face's uprights and beams.
    // Totes outside the view are skipped (the layer is redrawn when the camera moves).
    rackSide(aisle, s) {
      const sim = this.sim, g = sim.grid, inv = sim.inv, P = this.P.bind(this), Y0 = g.Y0 || 0, B = Y0 + g.B, { Z, zb } = this.cutSpan();
      const x0 = aisle.a * 3 + s * 2, x1 = x0 + 1, cam = this.cam, m = 60;
      const onScreen = (x, y, z) => { const [px, py] = P(x, y, z), sx = cam.x + px * cam.zoom, sy = cam.y + py * cam.zoom; return sx > -m && sx < this.w + m && sy > -m && sy < this.h + m; };
      const levels = [];
      for (let l = 0; l < g.L; l++) if (this.levelShown(l)) levels.push(l);
      this.quadTop(x0, Y0, x1, B, 0.01, 'rgba(0,0,0,0.35)');
      for (let b = Y0; b <= B; b += 2) this.line(P(x0, b, Math.max(0, zb)), P(x0, b, Z), '#475569', 1);
      for (const l of levels) this.line(P(x0, Y0, g.levelZ(l)), P(x0, B, g.levelZ(l)), '#334155', 1);
      for (let b = 0; b < g.SB; b++) {
        for (const l of levels) {
          const id = aisle.slot[sim.si(l, s, b)];
          if (!id || this.moving.has(id)) continue;
          const z = g.levelZ(l) + 0.06;
          if (!onScreen(x0 + 0.5, Y0 + b + 0.5, z + 0.45)) continue;
          this.solidTote(x0, Y0 + b, z, this.toteColor(inv.binById.get(id)));
        }
      }
      for (const l of levels) {
        const z = g.levelZ(l);
        this.line(P(x1, Y0, z), P(x1, B, z), '#64748b', 1.2);
        this.line(P(x0, B, z), P(x1, B, z), '#64748b', 1.2);
      }
      for (let b = Y0; b <= B; b += 2) this.line(P(x1, b, Math.max(0, zb)), P(x1, b, Z), '#94a3b8', 1.4);
      this.line(P(x0, B, Math.max(0, zb)), P(x0, B, Z), '#94a3b8', 1.4);
      this.line(P(x0, B, Z), P(x1, B, Z), '#94a3b8', 1.4);
      this.line(P(x1, Y0, Z), P(x1, B, Z), '#94a3b8', 1.4);
    }

    // Screen distance from (sx, sy) to a world point.
    screenDist(sx, sy, x, y, z) { const [px, py] = this.P(x, y, z); return Math.hypot(this.cam.x + px * this.cam.zoom - sx, this.cam.y + py * this.cam.zoom - sy); }
  }

  WS.RackRenderer = RackRenderer;
  WS.RACK_TOTE_H = TOTE_H;
})((globalThis.WS = globalThis.WS || {}));
