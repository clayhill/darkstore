/* DeepLane in the free 3D view: steel racking with rails along every deep
 * lane, the pallets in them (one batch, rebuilt when a pallet moves), an
 * orange carrier on every level of each transfer aisle with its yellow
 * satellite driving into the lanes, the level buffers, a cyan lift at the
 * front of each block, the pallet conveyor loop with the receiving dock and
 * the empty-pallet stacker, and the stations. */
(function (WS) {
  'use strict';
  const ORANGE = '#f97316', SAT = '#facc15', CYAN = '#06b6d4', STEEL = '#33507d', RAIL = '#64748b';
  const R = WS.PalletRenderer.prototype, { PW, PD, BASE, WOOD } = WS.PALLET_DRAW;

  class PalletRenderer3D extends WS.PreZone3D {
    // colours, cut-away and satellite lift as in the isometric view
    toteColor(b) { return R.toteColor.call(this, b); }
    fillOf(b) { return R.fillOf.call(this, b); }
    liftOf(sh) { return R.liftOf.call(this, sh); }
    movingTotes() { return R.movingTotes.call(this); }
    // the hall reaches out to the receiving dock
    bounds() { const b = super.bounds(); b.x0 = this.sim.grid.dockX - 3; return b; }

    // A wooden pallet (deck on three runners) with its load, as high as it is full.
    pallet(B, x, y, z, b, o = {}) {
      const w = o.w || PW, d = o.d || PD, h = 0.5 + 3.4 * (o.fill != null ? o.fill : b ? this.fillOf(b) : 0), zb = z + BASE, pick = o.pick;
      if (this.probe && B !== this.totes) this.probeAdd('pallet', x - w, y - d, z, x + w, y + d, zb + h); // stored ones: probeStatic
      B.box(x - w, y - d, zb - 0.12, x + w, y + d, zb, WOOD, pick);
      for (const f of [-1, 0, 1]) B.box(x - w, y + f * (d - 0.06) - 0.06, z, x + w, y + f * (d - 0.06) + 0.06, zb - 0.12, '#7a5a36', pick);
      if (h > 0.55) B.box(x - w + 0.03, y - d + 0.03, zb, x + w - 0.03, y + d - 0.03, zb + h, o.color || (b ? this.toteColor(b) : WS.PALLET_DRAW.LOAD), pick);
    }

    // ---------------------------------------------------------------- static
    buildStatic() {
      WS.View3D.prototype.buildStatic.call(this);
      const sim = this.sim, g = sim.grid, S = this.st, SB = g.SB, Z = this.rackTop();
      if (!this.totes) this.totes = this.newBatch('box', 'std', 8192);
      this.toteKey = null;
      for (const line of sim.preZoneLines()) this.beltLine(S, line, 0.8, g.convZ);
      for (const aisle of sim.aisles) {
        const a = aisle.a;
        for (const s of [0, 1]) {
          const x0 = g.sideX0(a, s), x1 = x0 + g.Dw, pick = this.rackPick(a, s, g.L - 1);
          // uprights every two lanes on both faces, beams along both faces and rails along every lane on each shown level
          for (let y = 0; y <= SB; y += 2) for (const x of [x0, x1]) S.box.box(x - 0.04, y - 0.04, 0, x + 0.04, y + 0.04, Z, STEEL, pick);
          for (let l = 0; l < g.L; l++) {
            if (!this.levelShown(l)) continue;
            const z = g.levelZ(l);
            for (const x of [x0, x1]) S.box.box(x - 0.03, 0, z - 0.25, x + 0.03, SB, z - 0.05, '#c2410c', pick);
            for (let b = 0; b < SB; b++) for (const r of [-0.3, 0.3]) S.box.box(x0, b + 0.5 + r - 0.03, z - 0.05, x1, b + 0.5 + r + 0.03, z + 0.08, RAIL, this.rackPick(a, s, l));
            // the level buffer in the front lanes, a chain conveyor in line with the lift
            const bx = s ? g.inX(a) : g.outX(a);
            S.box.box(bx - 0.48, SB, z - 0.12, bx + 0.48, g.B, z + 0.06, '#1f2937');
            for (const r of [-0.25, 0.25]) S.box.box(bx + r - 0.04, SB, z + 0.06, bx + r + 0.04, g.B, z + 0.09, '#94a3b8');
          }
          for (let y = 0; y < SB; y += 2) S.box.box(x0, y + 0.96, Z - 0.05, x1, y + 1.04, Z + 0.05, STEEL);
        }
        // the carriers' rails along the transfer aisle, and the lift tower
        const lx = g.laneX(a), B = g.B, H = g.Z + 1, lp = { kind: 'robot', id: aisle.lift.id };
        for (let l = 0; l < g.L; l++) if (this.levelShown(l)) for (const r of [-0.42, 0.42]) S.box.box(lx + r - 0.03, 0, g.levelZ(l) - 0.6, lx + r + 0.03, B, g.levelZ(l) - 0.5, '#a3a3a3');
        for (const px of [lx - 0.4, lx + 0.28]) {
          S.box.box(px, B + 0.4, 0, px + 0.12, B + 0.6, H, CYAN, lp);
          for (let k = 0; k < 3; k++) S.box.box(px - 0.002, B + 0.6, 0.1 + k * 0.33, px + 0.122, B + 0.605, 0.26 + k * 0.33, k % 2 ? '#111827' : '#facc15');
        }
        S.box.box(lx - 0.46, B + 0.38, H, lx + 0.46, B + 0.62, H + 0.35, CYAN, lp);
      }
      // the receiving dock door and the stacker's base
      const dx = g.dockX - 1.2, y = g.farY;
      S.box.box(dx - 1.1, y - 1.5, 0, dx - 0.95, y + 1.5, 7, '#334155');
      S.box.box(dx - 0.96, y - 1.2, 0, dx - 0.94, y + 1.2, 6.2, '#475569');
      S.box.box(g.stackX + 0.1, y - 0.55, 0, g.stackX + 1.3, y + 0.55, 0.2, '#475569');
    }
    // the map cell of a lane side, for a click on the racking
    rackPick(a, s, l) { return { kind: 'cell', id: this.sim.mapGrid.idx(a * 4 + s * 2, this.sim.grid.L - 1 - l) }; }
    buildTotes() {
      const sim = this.sim, g = sim.grid, inv = sim.inv, T = this.totes, DN = sim.cfg.laneDepth;
      T.begin();
      for (const aisle of sim.aisles) for (const s of [0, 1]) for (let l = 0; l < g.L; l++) {
        if (!this.levelShown(l)) continue;
        const pick = this.rackPick(aisle.a, s, l), z = g.levelZ(l) + 0.1;
        for (let b = 0; b < g.SB; b++) for (let d = 0; d < DN; d++) {
          const id = aisle.slot[sim.si(l, s, b, d)];
          if (id && !this.moving.has(id)) this.pallet(T, g.slotX(aisle.a, s, d), b + 0.5, z, inv.binById.get(id), { pick });
        }
      }
      T.end();
    }
    probeStatic(out) {
      const sim = this.sim, g = sim.grid, DN = sim.cfg.laneDepth;
      for (const aisle of sim.aisles) for (const s of [0, 1]) for (let l = 0; l < g.L; l++) for (let b = 0; b < g.SB; b++) for (let d = 0; d < DN; d++) {
        const id = aisle.slot[sim.si(l, s, b, d)], x = g.slotX(aisle.a, s, d), z = g.levelZ(l) + 0.1;
        if (id && !this.moving.has(id)) out.push({ kind: 'stored', box: [x - PW, b + 0.5 - PD, z, x + PW, b + 0.5 + PD, z + BASE + 0.5 + 3.4 * this.fillOf(sim.inv.binById.get(id))], who: 'lane ' + id });
      }
    }

    // ---------------------------------------------------------------- live
    drawMachines() {
      const sim = this.sim, g = sim.grid, D = this.dy;
      for (const aisle of sim.aisles) {
        for (let l = 0; l < g.L; l++) {
          if (!this.levelShown(l)) continue;
          [[aisle.outBuf[l], g.outX(aisle.a)], [aisle.inBuf[l], g.inX(aisle.a)]].forEach(([buf, x]) => buf.forEach((it) => { if (!this.moving.has(it.bin.id)) this.pallet(D.box, x, it.pos, g.levelZ(l) + 0.1, it.bin); }));
        }
        for (const sh of aisle.shuttles) if (this.levelShown(sh.l)) this.drawCarrier(sh, aisle.a);
        this.drawLift(aisle);
      }
      // full pallets waiting at the dock, empty ones on the stacker
      const n = sim.inv.bins.filter((b) => b.loc === 'dock').length, dx = g.dockX - 1.1;
      for (let k = 0; k < Math.min(n, 3); k++) this.pallet(D.box, dx, g.farY - 0.9 + k * 0.9, 0, null, { fill: 0.85, w: PD, d: PW * 0.85, color: WS.PALLET_DRAW.LOAD });
      const e = (sim.emptyStack || 0) % 12;
      for (let k = 0; k < e; k++) D.box.box(g.stackX + 0.7 - PW, g.farY - PD, 0.2 + k * 0.5, g.stackX + 0.7 + PW, g.farY + PD, 0.6 + k * 0.5, WOOD);
    }
    drawCarrier(sh, a) {
      const sim = this.sim, g = sim.grid, D = this.dy, z = g.levelZ(sh.l), cx = g.laneX(a), y = sh.pos, pick = { kind: 'robot', id: sh.id }, col = WS.led(this, sh, sim);
      for (const e of [-1, 1]) D.box.box(cx - 0.47, y + e * 0.39 - 0.06, z - 0.5, cx + 0.47, y + e * 0.39 + 0.06, z - 0.05, ORANGE, pick);
      D.box.box(cx - 0.42, y - 0.33, z - 0.5, cx + 0.42, y + 0.33, z - 0.38, '#7c2d12', pick);
      D.lit.box(cx - 0.2, y + 0.45, z - 0.4, cx + 0.2, y + 0.46, z - 0.25, col);
      const sx = cx + (sh.satSide ? 1 : -1) * sh.sat, lift = this.liftOf(sh);
      D.box.box(sx - 0.4, y - 0.27, z - 0.32, sx + 0.4, y + 0.27, z + 0.04 + lift * 0.06, SAT, pick);
      D.lit.box(sx + 0.4, y - 0.08, z - 0.22, sx + 0.41, y + 0.08, z - 0.1, col);
      D.lit.box(sx - 0.41, y - 0.08, z - 0.22, sx - 0.4, y + 0.08, z - 0.1, col);
      if (sh.bin) { const b = sim.inv.binById.get(sh.bin); if (b) this.pallet(D.box, sx, y, z + 0.1 + lift * 0.12, b, { pick }); }
    }
    drawLift(aisle) {
      const sim = this.sim, g = sim.grid, D = this.dy, lift = aisle.lift, a = aisle.a, B = g.B, z = lift.z, pick = { kind: 'robot', id: lift.id };
      D.box.box(g.outX(a) + 0.45, B + 0.42, z - 0.2, g.inX(a) - 0.45, B + 0.58, z - 0.02, '#0e7490', pick);
      for (const px of [g.outX(a), g.inX(a)]) {
        D.box.box(px - 0.5, B + 0.05, z - 0.16, px + 0.5, B + 0.95, z - 0.03, CYAN, pick);
        for (const r of [-0.25, 0.25]) D.box.box(px - 0.48, B + 0.5 + r - 0.04, z - 0.03, px + 0.48, B + 0.5 + r + 0.04, z, '#67e8f9');
      }
      D.lit.box(g.laneX(a) - 0.15, B + 0.58, z - 0.17, g.laneX(a) + 0.15, B + 0.59, z - 0.06, WS.led(this, lift, sim));
      if (lift.bin) {
        const x = lift.side ? g.inX(a) : g.outX(a), r = lift.roll, b = sim.inv.binById.get(lift.bin);
        let y = B + 0.5;
        if (r) { const f = Math.min(1, (sim.time - r.t0) / r.dur); y = r.y0 + (r.y1 - r.y0) * f; }
        if (b) this.pallet(D.box, x, y, z + 0.04, b, { pick });
      }
    }
    // pallets on the conveyors
    drawConveyorTotes() {
      const sim = this.sim, T = sim.convTote(), z = sim.grid.convZ;
      for (const it of sim.conv) {
        if (this.moving.has(it.bin.id)) continue;
        const q = sim.convAt(it);
        this.pallet(this.dy.box, q.x, q.y, z, it.bin, { w: T.w, d: T.d });
      }
    }
    // pallets at a station, as in WS.View3D.portLive with totes
    portLive(p) {
      const sim = this.sim, g = sim.grid, L = sim.layout, CZ = this.CZ, front = p.face === 'front', D = this.dy, pp = L.portPath(p);
      const sx = front ? p.drop.x + 1.75 : g.W + 1.9, sy = front ? g.D + 1.95 : p.drop.y + 1.75;
      D.lit.box(sx - 0.24, sy + 0.04, 3.4, sx + 0.24, sy + 0.05, 4.5, '#0b1220');
      this.screen('port' + p.idx, sx - 0.235, sx + 0.235, sy + 0.053, 3.42, 4.48, this.portScreen(p));
      const T = sim.convTote(), bin = (x, y, b) => this.pallet(D.box, x, y, CZ, b, { w: T.w, d: T.d });
      p.inQ.forEach((q, k) => { const f = k === 0 ? Math.min(1, q.t / sim.cfg.conveyorStep) : 0, a = pp.entry[0], b = pp.head; bin(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, q.bin); });
      if (p.pick) { const q = this.pickPos(p); bin(q.x, q.y, p.pick); }
      p.outQ.forEach((b, k) => { const e = this.outPos(p, k); bin(e.x, e.y, b); });
      const l = this.stackLightPos(p);
      this.stackLight(l.x, l.y, l.z, p);
    }
    // The robot cam rides a busy carrier's satellite, low between the rails,
    // so it drives in under the pallets; a lift only when no carrier works.
    pickRider(not) {
      const fleet = this.sim.fleet, busy = fleet.filter((m, k) => k !== not && m.l != null && !m.idle).map((m) => m.id);
      return busy.length ? busy[Math.floor(Math.random() * busy.length)] : super.pickRider(not);
    }
    rideFront() { return 0.6; }
    rideHeight() { return 0.2; }
    machinePos(m) {
      const g = this.sim.grid;
      if (!m) return null;
      if (m.l != null) return { x: g.laneX(m.a) + (m.satSide ? 1 : -1) * m.sat, y: m.pos, z: g.levelZ(m.l) };
      return { x: g.laneX(m.a), y: g.B + 0.5, z: m.z };
    }

    // ---------------------------------------------------------------- picking and labels
    selectionBox(s, alpha) {
      if (s.kind === 'cell') {
        const c = this.sim.mapGrid.at(s.id), g = this.sim.grid;
        if (!c || (c.part !== 0 && c.part !== 2)) return null;
        const x0 = g.sideX0(c.a, c.part / 2);
        return [x0, 0, x0 + g.Dw, g.SB, g.levelZ(c.level) + 0.02];
      }
      return WS.View3D.prototype.selectionBox.call(this, s, alpha);
    }
    pickFloor(f) {
      const sim = this.sim, g = sim.grid;
      if (f.y >= 0 && f.y < g.SB) for (const aisle of sim.aisles) {
        const x = f.x - g.X0(aisle.a);
        if (x < 0 || x > g.blockW || (x > g.Dw && x < g.Dw + 1)) continue;
        for (let l = g.L - 1; l >= 0; l--) if (this.levelShown(l)) return this.rackPick(aisle.a, x < g.Dw ? 0 : 1, l);
      }
      return WS.View3D.prototype.pickFloor.call(this, f);
    }
    drawLabels() {
      WS.View3D.prototype.drawLabels.call(this);
      const g = this.sim.grid, bg = 'rgba(15,23,42,0.82)';
      for (const aisle of this.sim.aisles) this.label(`BLOCK ${aisle.a + 1}`, g.laneX(aisle.a), g.B + 0.3, g.Z + 2, { size: 10, bg, color: '#fde68a' });
      this.label('RECEIVING DOCK', g.dockX - 1, g.farY, 7.6, { size: 10, bg, color: '#86efac' });
      this.label('EMPTY PALLETS', g.stackX + 0.7, g.farY, 6.5, { size: 10, bg, color: '#cbd5e1' });
      if (this.cam.dist > 22 && !this.cam.walk) return; // carrier names only up close
      for (const aisle of this.sim.aisles) for (const sh of aisle.shuttles) if (this.levelShown(sh.l)) this.label(sh.name, g.laneX(aisle.a), sh.pos, g.levelZ(sh.l) + 0.6, { size: 9, color: '#0f172a', weight: 800, bg: 'rgba(241,245,249,0.85)' });
    }
  }

  WS.PalletRenderer3D = PalletRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
