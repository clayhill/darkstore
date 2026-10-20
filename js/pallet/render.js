/* DeepLane view: see-through racking of deep pallet lanes on both sides of
 * each transfer aisle, wooden pallets with their stretch-wrapped loads (as
 * high as they are full), an orange carrier per level with its yellow
 * satellite driving into the lanes, the level buffers, a lift at the front
 * of every block, the pallet conveyor loop with the receiving dock on its
 * left and the empty-pallet stacker on its right, and the stations. */
(function (WS) {
  'use strict';
  const { shade, CLASS_COLORS } = WS;
  const ORANGE = '#f97316', ORANGE_TOP = '#fdba74', SAT = '#facc15', CYAN = '#06b6d4', CYAN_TOP = '#67e8f9';
  const WOOD = '#9a7448', WOOD_TOP = '#b9925f', LOAD = '#b69a74';
  const PW = 0.46, PD = 0.32, BASE = 0.42; // pallet half sizes (cells) and the pallet's own height (levels)
  const ease = (u) => u * u * (3 - 2 * u);

  // cardboard a shade lighter or darker per SKU, so the lanes of different SKUs read apart
  // (as hex: the drawing shades it again)
  WS.palletLoad = (b) => {
    const g = b && b.comps[0].gtin;
    if (!g) return LOAD;
    const f = 1 + ((parseInt(g.slice(7, 12), 10) * 37) % 9 - 4) * 0.035, n = parseInt(LOAD.slice(1), 16);
    return '#' + [16, 8, 0].map((sh) => Math.min(255, Math.round(((n >> sh) & 255) * f)).toString(16).padStart(2, '0')).join('');
  };

  class PalletRenderer extends WS.PreZoneRenderer {
    drawScene() {
      const sim = this.sim, g = sim.grid;
      this.drawFloor();
      this.drawPreZone();
      this.moving = this.movingTotes();
      this.drawRacking();
      for (const aisle of sim.aisles) this.drawBuffers(aisle);
      for (const aisle of sim.aisles) for (const sh of aisle.shuttles) if (this.levelShown(sh.l)) this.drawCarrier(sh, aisle.a);
      this.drawSelectedCell();
      const items = [];
      for (const aisle of sim.aisles) items.push({ d: g.laneX(aisle.a) + g.B, fn: () => this.drawLift(aisle) });
      items.push({ d: g.dockX + g.farY - 0.5, fn: () => this.drawDock() }, { d: g.stackX + g.farY + 0.5, fn: () => this.drawStacker() });
      this.conveyorItems(items);
      this.drawStations(items);
    }
    // the floor reaches out to the receiving dock on the left
    drawFloor() {
      const g = this.sim.grid, P = this.P.bind(this);
      this.poly([P(g.dockX - 2.5, g.B + 1, 0), P(-2, g.B + 1, 0), P(-2, g.D + 8.5, 0), P(g.dockX - 2.5, g.D + 8.5, 0)], '#1a2332');
      super.drawFloor();
    }
    // pallet conveyors: wide chain conveyors the pallets stand across
    drawPreZone() {
      const z = this.sim.grid.convZ;
      for (const line of this.sim.preZoneLines()) { this.conveyor(line, 0.8, z, null, { legs: true }); this.flowArrows(line, z); }
    }
    // Pallets keep their colour from the racking to the stations: white when a
    // station has asked for one, ABC colours with heat on, else stretch-wrapped cartons.
    toteColor(b) {
      if (b.requests.length) return '#f8fafc';
      return this.opts.heat ? CLASS_COLORS[this.sim.inv.binClass(b)] : WS.palletLoad(b);
    }
    fillOf(b) { const c = b.comps[0]; return c.gtin ? Math.min(1, c.qty / this.sim.inv.compCap(b, this.sim.inv.byGtin.get(c.gtin))) : 0; }
    // A wooden pallet with its load: cartons in stretch wrap, as high as the pallet is full.
    pallet(x, y, z, b, o = {}) {
      const w = o.w || PW, d = o.d || PD, col = o.color || this.toteColor(b), h = 0.5 + 3.4 * (o.fill != null ? o.fill : this.fillOf(b));
      const P = this.P.bind(this), zb = z + BASE, zt = zb + h;
      this.box(x - w, y - d, z, x + w, y + d, zb, WOOD, { top: WOOD_TOP });
      // fork openings
      for (const f of [-0.62, 0.18]) this.faceY(y + d + 0.002, x + w * f, x + w * (f + 0.44), z + 0.08, zb - 0.1, '#2a1d10');
      for (const f of [-0.7, 0.3]) this.faceX(x + w + 0.002, y + d * f, y + d * (f + 0.4), z + 0.08, zb - 0.1, '#2a1d10');
      if (h <= 0.55) return; // an empty pallet
      this.box(x - w + 0.03, y - d + 0.03, zb, x + w - 0.03, y + d - 0.03, zt, col, { top: shade(col, 0.16) });
      // carton seams and the shine of the wrap
      const seam = shade(col, -0.35);
      this.line(P(x, y + d - 0.03, zb), P(x, y + d - 0.03, zt), seam, 0.8);
      for (let k = 1; k * 1.1 < h; k++) { const zz = zb + k * 1.1; this.line(P(x - w + 0.03, y + d - 0.03, zz), P(x + w - 0.03, y + d - 0.03, zz), seam, 0.8); this.line(P(x + w - 0.03, y - d + 0.03, zz), P(x + w - 0.03, y + d - 0.03, zz), seam, 0.8); }
      this.line(P(x - w + 0.12, y + d - 0.025, zb + 0.2), P(x - w + 0.12, y + d - 0.025, zt - 0.15), 'rgba(255,255,255,0.28)', 1.4);
      if (o.hl) { const a = 0.6 + 0.4 * Math.sin(this.t * 8); this.quadTop(x - w + 0.03, y - d + 0.03, x + w - 0.03, y + d - 0.03, zt + 0.01, `rgba(74,222,128,${(a * 0.3).toFixed(2)})`, `rgba(74,222,128,${a.toFixed(2)})`, 2); }
    }
    // pallets on the conveyors and at the stations
    drawBin(x, y, z, id, o = {}) {
      const b = id && this.sim.inv.binById.get(id);
      if (!b) return super.drawBin(x, y, z, id, o);
      this.pallet(x, y, z, b, { w: o.w, d: o.d, color: o.color, hl: o.open && o.hl >= 0 });
    }
    // pallets a satellite holds: the racking and buffers no longer draw them
    movingTotes() { const s = new Set(); for (const m of this.sim.fleet) if (m.sat != null && m.bin) s.add(m.bin); return s; }

    // ---------------------------------------------------------------- racking
    // Each side of a transfer aisle: a lane per cell along y, its pallets from
    // the aisle outwards, rails along every lane, beams and uprights; the
    // level buffers in the front lanes, in line with the lift.
    drawRacking() {
      const g = this.sim.grid, o = this.opts;
      this.drawCached('racks', [g.version, o.heat, this.reqKey(), o.cutTop, o.cutOnly, [...this.moving].join()].join('|'), () => this.renderRacks());
    }
    renderRacks() {
      const sim = this.sim, g = sim.grid, inv = sim.inv, P = this.P.bind(this), c = this.ctx, { Z, zb } = this.cutSpan(), SB = g.SB, DN = sim.cfg.laneDepth, pallets = [];
      for (const aisle of sim.aisles) {
        const a = aisle.a;
        for (const s of [0, 1]) {
          const x0 = g.sideX0(a, s), x1 = x0 + g.Dw, face = s ? x0 : x1;
          this.quadTop(x0, 0, x1, SB, 0.01, 'rgba(0,0,0,0.3)');
          c.globalAlpha = 0.12; this.box(x0, 0, zb, x1, SB, Z, '#334155'); c.globalAlpha = 1;
          for (let l = 0; l < g.L; l++) {
            if (!this.levelShown(l)) continue;
            const z = g.levelZ(l);
            // lane rails, the beams along the aisle face and the back, the buffer conveyor in the front lanes
            for (let b = 0; b < SB; b++) for (const r of [-0.3, 0.3]) this.line(P(x0, b + 0.5 + r, z), P(x1, b + 0.5 + r, z), 'rgba(148,163,184,0.28)', 1);
            for (const x of [x0, x1]) this.line(P(x, 0, z), P(x, SB, z), x === face ? 'rgba(203,213,225,0.45)' : 'rgba(148,163,184,0.3)', 1);
            const bx = s ? g.inX(a) : g.outX(a);
            this.quadTop(bx - 0.5, SB, bx + 0.5, g.B, z + 0.06, 'rgba(31,41,55,0.85)', 'rgba(100,116,139,0.8)', 1);
            for (let b = 0; b < SB; b++) for (let d = 0; d < DN; d++) {
              const id = aisle.slot[sim.si(l, s, b, d)];
              if (id && !this.moving.has(id)) pallets.push({ x: g.slotX(a, s, d), y: b + 0.5, z: z + 0.1, id });
            }
          }
          for (let b = 0; b <= SB; b += 2) for (const x of [x0, x1]) this.line(P(x, b, 0), P(x, b, Z), x === face ? 'rgba(148,163,184,0.55)' : 'rgba(148,163,184,0.3)', 1);
          for (const [px, py] of [[x0, SB], [x1, SB]]) this.line(P(px, py, 0), P(px, py, Z), '#94a3b8', 1.6);
          this.line(P(x0, SB, Z), P(x1, SB, Z), '#94a3b8', 1.6);
          this.line(P(face, 0, Z), P(face, SB, Z), '#94a3b8', 1.4);
        }
        // the carriers' rails along the transfer aisle
        const lx = g.laneX(a);
        for (let l = 0; l < g.L; l++) if (this.levelShown(l)) for (const r of [-0.42, 0.42]) this.line(P(lx + r, 0, g.levelZ(l) - 0.3), P(lx + r, g.B, g.levelZ(l) - 0.3), 'rgba(250,204,21,0.35)', 1);
      }
      // back to front, so nearer pallets cover those behind them
      pallets.sort((p, q) => p.x + p.y - (q.x + q.y) || p.z - q.z);
      for (const p of pallets) this.pallet(p.x, p.y, p.z, inv.binById.get(p.id));
    }
    // pallets in the level buffers, where they have rolled to (every frame, over the cached racking)
    drawBuffers(aisle) {
      const g = this.sim.grid;
      for (let l = 0; l < g.L; l++) {
        if (!this.levelShown(l)) continue;
        [[aisle.outBuf[l], g.outX(aisle.a)], [aisle.inBuf[l], g.inX(aisle.a)]].forEach(([buf, x]) => buf.forEach((it) => { if (!this.moving.has(it.bin.id)) this.pallet(x, it.pos, g.levelZ(l) + 0.1, it.bin); }));
      }
    }

    // A carrier: an orange frame running on the transfer aisle's rails, with
    // the yellow satellite on it or out in a lane under a pallet.
    drawCarrier(sh, a) {
      const sim = this.sim, g = sim.grid, z = g.levelZ(sh.l), cx = g.laneX(a), y = sh.pos, col = WS.led(this, sh, sim), edge = { stroke: 'rgba(15,23,42,0.55)', lw: 0.8 };
      if (!sh.idle) this.glow(cx, y, z, 22, ORANGE, 0.35);
      this.box(cx - 0.47, y - 0.45, z - 0.5, cx + 0.47, y - 0.33, z - 0.05, ORANGE, Object.assign({ top: ORANGE_TOP }, edge));
      this.box(cx - 0.47, y + 0.33, z - 0.5, cx + 0.47, y + 0.45, z - 0.05, ORANGE, Object.assign({ top: ORANGE_TOP }, edge));
      this.box(cx - 0.42, y - 0.33, z - 0.5, cx + 0.42, y + 0.33, z - 0.38, '#7c2d12');
      this.faceY(y + 0.452, cx - 0.2, cx + 0.2, z - 0.4, z - 0.25, col);
      // the satellite and the pallet it holds
      const sx = cx + (sh.satSide ? 1 : -1) * sh.sat, lift = this.liftOf(sh);
      this.box(sx - 0.4, y - 0.27, z - 0.32, sx + 0.4, y + 0.27, z + 0.04 + lift * 0.06, SAT, Object.assign({ top: '#fde68a' }, edge));
      this.faceX(sx + 0.402, y - 0.08, y + 0.08, z - 0.22, z - 0.1, col);
      if (sh.bin) { const b = sim.inv.binById.get(sh.bin); if (b) this.pallet(sx, y, z + 0.1 + lift * 0.12, b); }
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === sh.id;
      if (sel) this.quadTop(cx - 0.55, y - 0.55, cx + 0.55, y + 0.55, z, null, '#38bdf8', 2.5);
    }
    // how far the satellite has lifted its pallet (0 down, 1 up)
    liftOf(sh) {
      if (!sh.lifting) return sh.raised ? 1 : 0;
      const f = ease(Math.min(1, (this.sim.time - sh.lifting.t0) / this.sim.cfg.satLift));
      return sh.lifting.up ? f : 1 - f;
    }
    // A pallet lift at the front of the block: two cyan columns with a header,
    // a carriage with a chain-conveyor platform on each side, in line with
    // the buffers and the block's conveyors (left out, right in).
    drawLift(aisle) {
      const sim = this.sim, g = sim.grid, lift = aisle.lift, a = aisle.a, B = g.B, H = g.Z + 1, z = lift.z, lx = g.laneX(a);
      const col = WS.led(this, lift, sim), edge = { stroke: 'rgba(15,23,42,0.55)', lw: 0.8 }, cy = Object.assign({ top: CYAN_TOP }, edge);
      for (const px of [lx - 0.4, lx + 0.28]) this.box(px, B + 0.4, 0, px + 0.12, B + 0.6, H, CYAN, cy);
      this.box(lx - 0.46, B + 0.38, H, lx + 0.46, B + 0.62, H + 0.35, CYAN, cy);
      this.hazardY(B + 0.602, lx - 0.4, lx - 0.28, 0.1, 1.1, 3); this.hazardY(B + 0.602, lx + 0.28, lx + 0.4, 0.1, 1.1, 3);
      if (!lift.idle) this.glow(lx, B + 0.5, z + 0.4, 24, CYAN, 0.45);
      this.box(g.outX(a) + 0.45, B + 0.42, z - 0.2, g.inX(a) - 0.45, B + 0.58, z - 0.02, '#0e7490', edge);
      for (const px of [g.outX(a), g.inX(a)]) {
        this.box(px - 0.5, B + 0.05, z - 0.16, px + 0.5, B + 0.95, z, CYAN, Object.assign({ top: '#164e63' }, edge));
        for (const r of [-0.25, 0.25]) this.line(this.P(px - 0.48, B + 0.5 + r, z + 0.001), this.P(px + 0.48, B + 0.5 + r, z + 0.001), '#67e8f9', 1.4);
      }
      this.faceY(B + 0.582, lx - 0.15, lx + 0.15, z - 0.17, z - 0.06, col);
      if (lift.bin) {
        const x = lift.side ? g.inX(a) : g.outX(a), r = lift.roll, b = sim.inv.binById.get(lift.bin);
        let y = B + 0.5;
        if (r) { const f = Math.min(1, (sim.time - r.t0) / r.dur); y = r.y0 + (r.y1 - r.y0) * f; }
        if (b) this.pallet(x, y, z + 0.04, b);
      }
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === lift.id;
      if (sel) this.quadTop(g.outX(a) - 0.55, B + 0.02, g.inX(a) + 0.55, B + 0.98, z, null, '#38bdf8', 2.5);
    }
    // The receiving dock: a dock door with full pallets waiting to go in.
    drawDock() {
      const sim = this.sim, g = sim.grid, x = g.dockX - 1.2, y = g.farY, n = sim.inv.bins.filter((b) => b.loc === 'dock').length;
      this.box(x - 1.1, y - 1.5, 0, x - 0.95, y + 1.5, 7, '#334155');
      this.faceX(x - 0.948, y - 1.2, y + 1.2, 0, 6.2, '#475569');
      for (let k = 0; k < 6; k++) this.line(this.P(x - 0.946, y - 1.2, 0.8 + k), this.P(x - 0.946, y + 1.2, 0.8 + k), '#64748b', 1);
      for (let k = 0; k < Math.min(n, 3); k++) this.pallet(x + 0.1, y - 0.9 + k * 0.9, 0, null, { color: LOAD, fill: 0.85, w: PD, d: PW * 0.85 });
    }
    // The empty-pallet stacker: empty pallets piling up, cleared every twelve.
    drawStacker() {
      const sim = this.sim, g = sim.grid, x = g.stackX + 0.7, y = g.farY, n = (sim.emptyStack || 0) % 12;
      this.box(x - 0.6, y - 0.55, 0, x + 0.6, y + 0.55, 0.2, '#475569');
      for (let k = 0; k < n; k++) this.box(x - PW, y - PD, 0.2 + k * 0.5, x + PW, y + PD, 0.6 + k * 0.5, WOOD, { top: WOOD_TOP });
    }
    drawLabels() {
      WS.IsoRenderer.prototype.drawLabels.call(this);
      const g = this.sim.grid, bg = 'rgba(15,23,42,0.82)';
      for (const aisle of this.sim.aisles) this.text(`BLOCK ${aisle.a + 1}`, g.laneX(aisle.a), g.B + 0.5, g.Z + 2, { size: 10, bg, color: '#fde68a' });
      this.text('RECEIVING DOCK', g.dockX - 1, g.farY, 7.6, { size: 10, bg, color: '#86efac' });
      this.text('EMPTY PALLETS', g.stackX + 0.7, g.farY, 6.5, { size: 10, bg, color: '#cbd5e1' });
    }

    // ---------------------------------------------------------------- selection
    drawSelectedCell() {
      const s = this.selected, sim = this.sim, g = sim.grid;
      if (!s || s.kind !== 'cell') return;
      const c = sim.mapGrid.at(s.id);
      if (!c || (c.part !== 0 && c.part !== 2)) return;
      const x0 = g.sideX0(c.a, c.part / 2);
      this.quadTop(x0, 0, x0 + g.Dw, g.SB, g.levelZ(c.level) + 0.02, 'rgba(56,189,248,0.15)', '#38bdf8', 2.5);
    }
    pick(sx, sy) {
      const sim = this.sim, g = sim.grid, m = this.pickMachine(sx, sy);
      if (m) return m;
      // a side of a transfer aisle at some level: try levels from the top down
      for (let l = g.L - 1; l >= 0; l--) {
        if (!this.levelShown(l)) continue;
        const w = this.toWorld(sx, sy, g.levelZ(l) + 1);
        if (w.y < 0 || w.y >= g.SB) continue;
        for (const aisle of sim.aisles) {
          const x = w.x - g.X0(aisle.a);
          if (x < 0 || x > g.blockW || (x > g.Dw && x < g.Dw + 1)) continue;
          return { kind: 'cell', id: sim.mapGrid.idx(aisle.a * 4 + (x < g.Dw ? 0 : 2), g.L - 1 - l) };
        }
      }
      return this.pickStations(this.toWorld(sx, sy, 1.5));
    }
    machinePoints() {
      const g = this.sim.grid, out = [];
      for (const aisle of this.sim.aisles) {
        for (const sh of aisle.shuttles) if (this.levelShown(sh.l)) out.push({ id: sh.id, x: g.laneX(aisle.a) + (sh.satSide ? 1 : -1) * sh.sat, y: sh.pos, z: g.levelZ(sh.l) });
        out.push({ id: aisle.lift.id, x: g.laneX(aisle.a), y: g.B + 0.5, z: aisle.lift.z });
      }
      return out;
    }
  }

  WS.PalletRenderer = PalletRenderer;
  WS.PALLET_DRAW = { PW, PD, BASE, WOOD, WOOD_TOP, LOAD };
})((globalThis.WS = globalThis.WS || {}));
