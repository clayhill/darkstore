/* ZoneHop in the free 3D view (WS.View3D). The A-frame is the centrepiece:
 * two sloping faces of channels over its belt, each channel's stack of
 * boxes going down as it dispenses and back up when it is refilled, the
 * windows on the belt filling as they pass and tipping into the tote at the
 * end. Around it the conveyors with the totes, the pick-to-light flow racks
 * lighting the location to pick, the carousels turning, the RF shelving with
 * the pickers and their carts, the merge, the closing line's machines, the
 * route lanes with the stacked totes and the vans at their doors. The tote
 * cam rides an order tote through all of it; Follow an order follows an
 * order's window, totes and van. */
(function (WS) {
  'use strict';
  const CZ = 2.2, AZ = 2.3, RZ = 2.6, TOP = 6.2, FOOT = 2.9, HALF = 0.75, STEPS = 6; // as in the isometric view; the A-frame's faces in steps
  const TOTE = { order: '#2563eb', rf: '#f59e0b', empty: '#64748b' };
  const hue = (gtin) => (parseInt(gtin.slice(7, 12), 10) * 47) % 360;
  const prodCol = (gtin, l = 58) => `hsl(${hue(gtin)},50%,${l}%)`;
  const FOLLOW_STEPS = ['Start', 'A-frame', 'Zones', 'Merge', 'Closing', 'Van'];

  class ZoneRenderer3D extends WS.View3D {
    bounds() { const g = this.sim.grid; return { x0: -1, y0: -1, x1: g.W + 1, y1: g.D + 1 }; }
    get followSteps() { return FOLLOW_STEPS; }
    buildKey() { const c = this.sim.cfg; return super.buildKey() + '|' + [c.afChannels, c.ptlZones, c.carousels, c.routes, c.rfLocations, this.sim.grid.W, this.sim.grid.D].join(','); }
    fit() {
      super.fit();
      const g = this.sim.grid;
      // the A-frame and the loop, from the front left
      Object.assign(this.cam, { tx: g.AX + g.afLen * 0.9, ty: g.LT + 2, yaw: -Math.PI / 5, pitch: 0.62, dist: Math.max(30, g.afLen * 2.4) });
    }
    hall() {
      const sim = this.sim, g = sim.grid;
      return { x0: -0.5, y0: -0.5, x1: g.SX + 11.1, y1: g.D + 0.5, doors: sim.lanes.map((l) => ({ side: 'E', a: l.y - 1.2, b: l.y + 1.2, h: this.lv(3.4) })) };
    }
    workLights() {
      const sim = this.sim, g = sim.grid, out = sim.zones.map((z) => ({ x: z.pick.x, y: z.pick.y + 0.9 }));
      out.push({ x: g.AX + g.afLen / 2, y: g.AY }, { x: g.RX + 5.2, y: g.LT + 2.6 }, { x: sim.machines[0].x - 0.9, y: g.LT - 2.4 }, sim.rfDepot(), { x: 1.4, y: g.SY });
      return out;
    }

    // ---------------------------------------------------------------- static
    buildStatic() {
      const T = WS.View3D.THREE, sim = this.sim, g = sim.grid, b = this.bounds(), S = this.st;
      if (!this.ground) {
        this.ground = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ color: '#1a2332', roughness: 0.95 }));
        this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; this.scene.add(this.ground);
      }
      this.ground.scale.set(b.x1 - b.x0 + 30, b.y1 - b.y0 + 20, 1); this.ground.position.set((b.x0 + b.x1) / 2 + 6, -0.002, (b.y0 + b.y1) / 2);
      for (const bt of sim.net.belts) this.conveyor(S, bt.pts, 0.7, bt.kind === 'return' ? RZ : CZ, bt.kind === 'loop' ? '#2f3d52' : bt.kind === 'lane' ? '#3a3420' : '#334155');
      this.aframeStatic(S);
      for (const z of sim.zones) this.zoneStatic(S, z);
      this.rfStatic(S);
      this.closingStatic(S);
      this.startStatic(S);
      // the zones' floor marking and the walkways along the A-frame
      for (const z of sim.zones) S.box.box(z.dx - 4.4, g.LB + 1, 0, z.dx + 1.4, z.kind === 'carousel' ? g.caroEnd + 0.3 : g.LB + g.SD + 2.3, 0.01, '#1f3a2c', { kind: 'port', id: z.port.idx });
      for (const y of [g.AY - 1.0, g.AY + 1.0]) S.box.box(g.AX - 1.4, y - 0.04, 0, g.AX + g.afLen + 1.4, y + 0.04, 0.015, '#a16207');
      if (!this.chan) this.chan = this.newBatch('box', 'std', 2048);
      this.chan.slots(sim.channels.length, STEPS);
    }
    extraBatches() { return [this.chan]; }
    // The A-frame: posts, the apex beam and the two sloping faces in steps; the belt underneath; the tip chute.
    aframeStatic(S) {
      const sim = this.sim, g = sim.grid, x0 = g.AX, x1 = g.AX + g.afLen, y = g.AY, pick = { kind: 'port', id: sim.afPort.idx };
      for (let x = x0; x <= x1 + 1e-6; x += (x1 - x0) / 6) for (const s of [-1, 1]) { S.box.box(x - 0.06, y + s * HALF - 0.05, 0, x + 0.06, y + s * HALF + 0.05, FOOT, '#475569'); }
      for (let k = 0; k < STEPS; k++) {
        const u = (k + 0.5) / STEPS, z = FOOT + (TOP - FOOT) * u, dy = HALF * (1 - u);
        for (const s of [-1, 1]) S.box.box(x0, y + s * dy - 0.07, z - 0.08, x1, y + s * dy + 0.07, z, '#334155', pick);
      }
      S.box.box(x0 - 0.1, y - 0.08, TOP - 0.05, x1 + 0.1, y + 0.08, TOP + 0.15, '#64748b', pick);
      S.box.box(x0 - 0.3, y - 0.32, AZ - 0.35, x1 + 0.3, y + 0.32, AZ, '#1f2937', pick);
      for (let x = x0; x <= x1; x += 2) S.box.box(x - 0.05, y - 0.05, 0, x + 0.05, y + 0.05, AZ - 0.35, '#475569');
      // the dispensers along the foot of each face
      for (const s of [-1, 1]) S.box.box(x0, y + s * HALF * 0.55 - 0.08, FOOT - 0.4, x1, y + s * HALF * 0.55 + 0.08, FOOT - 0.1, '#0f172a', pick);
      // tip chute: from the end of the belt down to the tote at the tip position
      const n = 4;
      for (let k = 0; k < n; k++) {
        const f = k / n, f1 = (k + 1) / n, xa = x1 + 0.3 + (g.tipX - x1 - 0.3) * f, xb = x1 + 0.3 + (g.tipX - x1 - 0.3) * f1, ya = y + (g.SY - y) * f, yb = y + (g.SY - y) * f1, z = AZ + (CZ + 1.4 - AZ) * f1;
        S.box.box(Math.min(xa, xb) - 0.3, Math.min(ya, yb) - 0.3, z - 0.08, Math.max(xa, xb) + 0.3, Math.max(ya, yb) + 0.3, z, '#475569');
      }
    }
    zoneStatic(S, z) {
      const sim = this.sim, g = sim.grid, pick = { kind: 'port', id: z.port.idx }, py = g.LB + g.SD;
      // operator screen on a post beside the pick position
      const sx = z.pick.x + 1.15, sy = py + 0.7;
      S.box.box(sx - 0.03, sy - 0.03, 0, sx + 0.03, sy + 0.03, 3.4, '#475569');
      S.box.box(sx - 0.3, sy - 0.06, 3.3, sx + 0.3, sy + 0.04, 4.6, '#0f172a', pick);
      S.box.box(z.pick.x - 0.55, py + 0.5, 0, z.pick.x + 0.55, py + 1.4, 0.03, '#10161f');
      if (z.kind === 'ptl') {
        // the flow rack wall: uprights, five sloping levels (drawn flat), a light rail at the front
        const ry = py + 1.8, x0 = z.dx - 4.2, x1 = z.dx + 1.2;
        for (let x = x0; x <= x1 + 1e-6; x += (x1 - x0) / 4) S.box.box(x - 0.04, ry - 0.35, 0, x + 0.04, ry + 0.45, 5.6, '#1d4ed8', pick);
        for (let lv = 0; lv < 5; lv++) S.box.box(x0, ry - 0.35, 0.5 + lv, x1, ry + 0.45, 0.6 + lv, '#64748b', pick);
      } else {
        // carousels: an oval track on the floor, posts and a top rail
        for (const cr of z.carousels) {
          const N = 48, R = 2 * cr.len + 2 * Math.PI * cr.r;
          for (let k = 0; k < N; k++) { const p = sim.caroAt(cr, (k * R) / N); S.box.box(p.x - 0.12, p.y - 0.12, 0, p.x + 0.12, p.y + 0.12, 0.25, '#1f2937', pick); }
          for (const yy of [cr.y + cr.r, cr.y + cr.r + cr.len]) S.box.box(cr.x - 0.08, yy - 0.08, 0, cr.x + 0.08, yy + 0.08, 4.6, '#475569', pick);
          S.box.box(cr.x - 0.06, cr.y + cr.r, 4.4, cr.x + 0.06, cr.y + cr.r + cr.len, 4.6, '#475569', pick);
        }
      }
    }
    rfStatic(S) {
      const sim = this.sim, g = sim.grid, pick = { kind: 'port', id: sim.rfPort.idx };
      for (let a = 0; a < g.na; a++) for (const side of [0, 1]) {
        const x = g.RFX + 3 * a + (side ? 2 : 0), y0 = g.RFY + 1, y1 = g.RFY + 1 + g.bays;
        for (let yy = y0; yy <= y1 + 1e-6; yy += Math.max(1, (y1 - y0) / 4)) for (const xx of [x + 0.05, x + 0.87]) S.box.box(xx, Math.min(yy, y1 - 0.08), 0, xx + 0.08, Math.min(yy, y1 - 0.08) + 0.08, 5.5, '#1d4ed8', pick);
        for (let lv = 0; lv < g.rfLevels; lv++) { S.box.box(x + 0.05, y0, 0.3 + lv * 1.05, x + 0.95, y1, 0.36 + lv * 1.05, '#64748b', pick); S.box.box(x + (side ? 0.05 : 0.88), y0, 0.3 + lv * 1.05, x + (side ? 0.12 : 0.95), y1, 0.45 + lv * 1.05, '#f97316', pick); }
      }
    }
    closingStatic(S) {
      const sim = this.sim, g = sim.grid, y = g.LT;
      const mg = { kind: 'port', id: sim.mergePort.idx };
      S.box.box(g.RX + 2.8, y - 2, 0, g.RX + 7.6, y + 1.9, CZ - 0.05, '#2b2440', mg);
      sim.machines.forEach((m) => {
        const pick = { kind: 'cell', id: g.idx(Math.floor(m.x), Math.floor(y)) }, col = '#4c1d95';
        if (m.id === 'scale') { S.box.box(m.x - 0.55, y - 0.5, CZ - 0.05, m.x + 0.55, y + 0.5, CZ + 0.05, '#94a3b8', pick); S.box.box(m.x + 0.6, y - 0.1, 0, m.x + 0.75, y + 0.05, 3.6, '#475569'); S.box.box(m.x + 0.55, y - 0.3, 3.4, m.x + 0.8, y + 0.2, 4.4, '#0f172a', pick); return; }
        S.box.box(m.x - 0.55, y - 0.6, CZ, m.x - 0.4, y + 0.6, CZ + 3.0, col, pick);
        S.box.box(m.x + 0.4, y - 0.6, CZ, m.x + 0.55, y + 0.6, CZ + 3.0, col, pick);
        S.box.box(m.x - 0.55, y - 0.6, CZ + 2.4, m.x + 0.55, y + 0.6, CZ + 3.0, col, pick);
        if (m.id === 'docs') S.box.box(m.x - 0.3, y - 0.45, CZ + 3.0, m.x + 0.3, y + 0.1, CZ + 3.4, '#f8fafc', pick);
        if (m.id === 'lid') for (let k = 0; k < 4; k++) S.box.box(m.x - 0.35, y + 0.65, 0.2 + k * 0.15, m.x + 0.35, y + 1.1, 0.33 + k * 0.15, '#1d4ed8', pick);
      });
      const m0 = sim.machines[0], qc = { kind: 'port', id: sim.checkPort.idx };
      S.box.box(m0.x - 0.7, y - 3.2, 0, m0.x + 0.7, y - 2.7, CZ, '#475569', qc);
      // the stacking area at the end of each lane
      for (const lane of sim.lanes) S.box.box(g.SX + 5.4, lane.y - 0.75, 0, g.SX + 11, lane.y + 0.75, 0.02, '#1f2937', { kind: 'cell', id: g.idx(Math.floor(g.SX + 7), Math.floor(lane.y)) });
    }
    startStatic(S) {
      const sim = this.sim, g = sim.grid, sx = 1.2, sy = g.SY, e = sim.emptier, pick = { kind: 'cell', id: g.idx(1, Math.floor(sy)) };
      S.box.box(sx - 0.55, sy - 0.6, 0, sx + 0.55, sy + 0.6, CZ, '#334155', pick);
      for (const xx of [sx - 0.6, sx + 0.52]) S.box.box(xx, sy - 0.65, 0, xx + 0.08, sy + 0.65, CZ + 4.6, '#64748b');
      S.box.box(2.4, sy - 0.75, CZ, 3.2, sy - 0.45, CZ + 2.0, '#e2e8f0', pick);
      S.box.box(e.x - 0.7, e.y - 0.6, 0, e.x + 0.6, e.y + 0.6, RZ + 2.2, '#4c1d95', pick);
    }

    // ---------------------------------------------------------------- live
    drawLive(alpha) {
      const sim = this.sim, D = this.dy;
      this.aframeLive();
      for (const z of sim.zones) z.kind === 'carousel' ? this.carouselLive(z) : this.ptlLive(z);
      this.rfLive(alpha);
      this.mergeLive();
      this.closingLive();
      this.lanesLive();
      this.startLive();
      for (const b of sim.net.belts) for (const t of b.totes) {
        const x = t.px + (t.x - t.px) * alpha, y = t.py + (t.y - t.py) * alpha;
        this.zoneTote(D, t, x, y, b.kind === 'return' ? RZ : CZ, Math.abs(t.dx) > 0.5);
      }
    }
    // an order tote (blue), RF tote (amber) or empty one back from a van (grey); a lid and a label once closed
    zoneTote(D, t, x, y, z, alongX, pick) {
      const w = alongX ? 0.38 : 0.26, d = alongX ? 0.26 : 0.38, col = TOTE[t.kind] || TOTE.empty, h = 0.9;
      pick = pick || { kind: 'cell', id: this.sim.grid.idx(Math.max(0, Math.floor(t.x)), Math.max(0, Math.floor(t.y))), tote: t };
      if (t.lid) { D.box.box(x - w, y - d, z, x + w, y + d, z + h, col, pick); D.box.box(x - w - 0.02, y - d - 0.02, z + h, x + w + 0.02, y + d + 0.02, z + h + 0.12, WS.shade(col, -0.1), pick); }
      else {
        this.tote(D.box, x - w, y - d, x + w, y + d, z, h, col);
        D.box.box(x - w, y - d, z, x + w, y + d, z + 0.1, WS.shade(col, -0.3), pick);
        const n = t.kind === 'empty' ? 0 : Math.ceil(Math.min(1, (t.units || 0) / 25) * 4);
        for (let k = 0; k < n; k++) {
          const xa = x - w + 0.05 + ((2 * w - 0.1) * (k & 1)) / 2, ya = y - d + 0.06 + ((2 * d - 0.12) * (k >> 1)) / 2;
          D.box.box(xa + 0.01, ya + 0.01, z + 0.1, xa + (2 * w - 0.1) / 2 - 0.01, ya + (2 * d - 0.12) / 2 - 0.01, z + 0.5, `hsl(${(k * 97 + 30) % 360},55%,60%)`);
        }
      }
      if (t.sscc) { if (alongX) D.box.box(x - w * 0.4, y + d, z + 0.2, x + w * 0.5, y + d + 0.01, z + 0.65, '#f8fafc'); else D.box.box(x + w, y - d * 0.4, z + 0.2, x + w + 0.01, y + d * 0.5, z + 0.65, '#f8fafc'); }
    }
    // The channels: a stack of product boxes down each face, shorter as the
    // channel empties; amber while it waits for a refill, green as it is refilled.
    aframeLive() {
      const sim = this.sim, g = sim.grid, c = sim.cfg, D = this.dy, B = this.chan, y = g.AY, w = WS.ZONE_CHANNEL_PITCH / c.cellSize * 0.42;
      sim.channels.forEach((ch, k) => {
        const q = ch.comps[0].qty, n = Math.ceil((q / ch.cap) * STEPS), state = ch.jam ? 'j' : q <= 0 ? 'e' : ch.req ? (ch.req.op && ch.req.op.state === 'WORKING' ? 'r' : 'w') : '';
        if (!B.open(k, n + state)) return;
        const s = ch.side ? 1 : -1, col = ch.jam ? '#dc2626' : ch.req && ch.req.op && ch.req.op.state === 'WORKING' ? '#22c55e' : ch.req ? '#f59e0b' : prodCol(ch.comps[0].gtin), pick = { kind: 'port', id: sim.afPort.idx };
        for (let j = 0; j < Math.max(n, q <= 0 ? 1 : 0); j++) {
          const u = (j + 0.5) / STEPS, z = FOOT + (TOP - FOOT) * u, dy = HALF * (1 - u);
          B.box(ch.wx - w, y + s * dy - 0.06 + s * 0.08, z, ch.wx + w, y + s * dy + 0.06 + s * 0.08, z + 0.28, q <= 0 ? '#7f1d1d' : col, pick);
        }
        B.close(k);
      });
      B.flush();
      // the windows on the belt, with the units in them
      for (const wd of sim.windows) {
        const xc = g.AX + wd.b / c.cellSize, hw = c.windowLength / c.cellSize / 2 - 0.05;
        D.box.box(Math.max(g.AX - 0.3, xc - hw), y - 0.3, AZ, Math.min(g.AX + g.afLen + 0.3, xc + hw), y - 0.27, AZ + 0.15, '#38bdf8');
        D.box.box(Math.max(g.AX - 0.3, xc - hw), y + 0.27, AZ, Math.min(g.AX + g.afLen + 0.3, xc + hw), y + 0.3, AZ + 0.15, '#38bdf8');
        let k = 0;
        for (const ln of wd.lines) for (let u = 0; u < ln.got && k < 24; u++, k++) { const ux = xc - hw + 0.15 + (k % 8) * ((2 * hw - 0.3) / 8), uy = y - 0.18 + Math.floor(k / 8) * 0.16; D.box.box(ux, uy, AZ, ux + 0.12, uy + 0.1, AZ + 0.18, prodCol(ln.line.gtin)); }
      }
      // units falling from a channel into the window under it
      for (const e of sim.ejects) {
        const f = (sim.time - e.t) / 0.35;
        if (f < 0 || f > 1) continue;
        const ch = e.ch, sy = y + (ch.side ? 1 : -1) * HALF * 0.55, zz = FOOT - 0.3 - f * (FOOT - 0.3 - AZ), yy = sy + (y - sy) * f;
        D.box.box(ch.wx - 0.06, yy - 0.05, zz, ch.wx + 0.06, yy + 0.05, zz + 0.15, prodCol(ch.comps[0].gtin || '0000000000000'));
      }
      if (!sim.afRunning && sim.windows.length) D.litCyl.cyl(g.AX + g.afLen + 0.3, y, TOP + 0.2, TOP + 0.5, 0.1, '#f59e0b');
      for (const op of sim.refillers) {
        if (op.state === 'BREAK') continue;
        this.operator(op.x, op.y, op.y < y ? Math.PI : 0, op.state === 'WORKING', '#a3e635', 0, 'refill ' + op.name);
        if (op.job) { const z = op.state === 'WORKING' ? 3.2 : 2.4, dir = op.y < y ? 1 : -1; this.parcel(D.box, op.x - 0.18, op.y + dir * 0.15 - 0.15, op.x + 0.18, op.y + dir * 0.15 + 0.15, z, 0.45); }
      }
    }
    zoneScreen(z) { return WS.ZoneRenderer.prototype.zoneScreen.call(this, z); }
    zoneLive(z) {
      const sim = this.sim, g = sim.grid, py = g.LB + g.SD, sx = z.pick.x + 1.15, sy = py + 0.7, D = this.dy;
      D.lit.box(sx - 0.26, sy + 0.04, 3.4, sx + 0.26, sy + 0.05, 4.5, '#0b1220');
      this.screen('zone' + z.id, sx - 0.255, sx + 0.255, sy + 0.053, 3.42, 4.48, this.zoneScreen(z));
      if (z.port.away) return;
      let x = z.pick.x;
      const j = z.job;
      if (j && j.cur && j.cur.bin && z.kind === 'ptl') {
        const tot = sim.cfg.ptlLine + sim.cfg.ptlUnit * j.cur.qty, f = 1 - j.t / tot, u = f < 0.5 ? Math.min(1, f / 0.2) : Math.max(0, 1 - (f - 0.5) / 0.2);
        x = z.pick.x + (j.cur.bin.wx - z.pick.x) * u;
      }
      // facing the rack (behind her) while she takes the units, the tote otherwise
      const atRack = j && j.cur && z.kind === 'ptl' && Math.abs(x - z.pick.x) > 0.1;
      this.operator(x, py + 0.95, atRack ? Math.PI : 0, !!(j && j.cur), '#f97316', 0, 'zone ' + z.id);
    }
    ptlLive(z) {
      const sim = this.sim, g = sim.grid, D = this.dy, ry = g.LB + g.SD + 1.8, j = z.job, cur = j && j.cur, pick = { kind: 'port', id: z.port.idx };
      for (const b of z.bins) {
        const zz = 0.6 + b.level, w = 5.4 / b.bays / 2 - 0.03, qf = Math.max(0.15, b.comps[0].qty / b.cap), on = cur && cur.bin === b;
        D.box.box(b.wx - w, ry - 0.3, zz + 0.02, b.wx + w, ry - 0.3 + 0.7 * qf, zz + 0.5, prodCol(b.comps[0].gtin, 55), pick);
        (on ? D.lit : D.box).box(b.wx - 0.06, ry - 0.38, zz - 0.15, b.wx + 0.06, ry - 0.35, zz, on ? '#4ade80' : '#1f2937', pick);
      }
      this.zoneLive(z);
    }
    carouselLive(z) {
      const sim = this.sim, D = this.dy, j = z.job, cur = j && j.cur, pick = { kind: 'port', id: z.port.idx };
      for (const b of z.bins) {
        const cr = z.carousels[b.caro], p = sim.shelfAt(cr, b.shelf), s = 0.24, on = cur && cur.bin === b;
        D.box.box(p.x - s, p.y - s, 0.3, p.x + s, p.y + s, 0.42, on ? '#166534' : '#334155', pick);
        for (let lv = 0; lv < 3; lv++) D.box.box(p.x - s + 0.04, p.y - s + 0.04, 0.6 + lv * 1.2, p.x + s - 0.04, p.y + s - 0.04, 1.0 + lv * 1.2, `hsl(${(hue(b.comps[0].gtin) + lv * 40) % 360},45%,58%)`, pick);
        D.box.box(p.x - s, p.y - s, 4.1, p.x + s, p.y + s, 4.2, on ? '#166534' : '#334155', pick);
        if (on) D.litCyl.cyl(p.x, p.y, 4.2, 4.35, 0.08, '#4ade80');
      }
      this.zoneLive(z);
    }
    rfLive(alpha) {
      const sim = this.sim, g = sim.grid, D = this.dy, pick = { kind: 'port', id: sim.rfPort.idx };
      for (const b of sim.rfBins) {
        if (b.comps[0].qty <= 0) continue;
        const x = g.RFX + 3 * b.aisle + (b.side ? 2 : 0), zz = 0.42 + b.level * 1.05, f = Math.max(0.25, Math.min(1, b.comps[0].qty / b.cap));
        D.box.box(x + 0.22, b.wy - 0.3, zz + 0.06, x + 0.22 + 0.56 * f, b.wy + 0.3, zz + 0.42, prodCol(b.comps[0].gtin, 52), pick);
      }
      const d = sim.rfDepot();
      for (let k = 0; k < 4; k++) D.box.box(d.x - 0.3, d.y - 0.25, 0.1 + k * 0.17, d.x + 0.1, d.y + 0.25, 0.27 + k * 0.17, k === 3 ? '#f59e0b' : '#b45309');
      for (const pk of sim.pickers) {
        if (pk.state === 'BREAK') continue;
        const x = pk.px + (pk.x - pk.px) * alpha, y = pk.py + (pk.y - pk.py) * alpha;
        this.operator(x, y, -pk.heading - Math.PI / 2, pk.state === 'WORKING', '#a3e635', 0, 'rf ' + pk.name);
        if (!pk.job) continue;
        // the cart with a tote per order of the batch
        const cx = x + 0.45, cy = y - 0.1, n = pk.job.totes.length - pk.job.put;
        D.box.box(cx - 0.3, cy - 0.35, 0.3, cx + 0.3, cy + 0.35, 0.4, '#64748b');
        for (const [ox, oy] of [[-0.25, -0.3], [0.25, -0.3], [-0.25, 0.3], [0.25, 0.3]]) D.cyl.cyl(cx + ox, cy + oy, 0, 0.3, 0.05, '#0b0f17');
        for (let k = 0; k < Math.min(n, 8); k++) { const tx = cx - 0.15 + (k % 2) * 0.3, ty = cy - 0.18 + (Math.floor(k / 2) % 2) * 0.36, tz = 0.4 + Math.floor(k / 4) * 0.7; this.tote(D.box, tx - 0.13, ty - 0.17, tx + 0.13, ty + 0.17, tz, 0.6, TOTE.rf); }
      }
    }
    mergeSpot(k) { return WS.ZoneRenderer.prototype.mergeSpot.call(this, k); }
    mergeLive() {
      const sim = this.sim, g = sim.grid, m = sim.merge, D = this.dy;
      m.totes.forEach((t, k) => { const q = this.mergeSpot(k); this.zoneTote(D, t, q.x, q.y, CZ, false); });
      m.rf.forEach((t, k) => this.zoneTote(D, t, g.RX + 3.3 + k * 0.62, g.LT + 2.0, CZ, false));
      if (!sim.mergePort.away) this.operator(g.RX + 5.2, g.LT + 2.9, 0, !!m.job, '#f97316', 0, 'merge');
    }
    closingLive() {
      const sim = this.sim, g = sim.grid, D = this.dy, y = g.LT;
      for (const m of sim.machines) {
        if (m.down) D.litCyl.cyl(m.x, y, CZ + 3.1, CZ + 3.4, 0.09, '#ef4444');
        else (m.tote ? D.litCyl : D.cyl).cyl(m.x, y, CZ + 3.0, CZ + 3.25, 0.08, m.tote ? '#22c55e' : '#14532d');
      }
      const m0 = sim.machines[0];
      if (!sim.checkPort.away) this.operator(m0.x - 0.9, y - 2.4, 0, !!sim.checkStation.tote, '#f97316', 0, 'check');
    }
    // closed totes stacked five high at the end of each lane; the van at its door when its departure is near
    lanesLive() {
      const sim = this.sim, g = sim.grid, c = sim.cfg, D = this.dy;
      for (const lane of sim.lanes) {
        const y = lane.y, route = lane.route, n = Math.min(lane.stack.length, 80), pick = { kind: 'cell', id: g.idx(Math.floor(g.SX + 7), Math.floor(y)) };
        for (let k = 0; k < n; k++) {
          const col = Math.floor(k / 10), row = Math.floor(k / 5) % 2, lv = k % 5, x = g.SX + 5.8 + col * 0.62, yy = y - 0.33 + row * 0.66, z = 0.1 + lv * 0.95;
          D.box.box(x - 0.27, yy - 0.3, z, x + 0.27, yy + 0.3, z + 0.82, TOTE.order, pick);
          D.box.box(x - 0.28, yy - 0.31, z + 0.82, x + 0.28, yy + 0.31, z + 0.92, '#1e40af', pick);
        }
        D.lit.box(g.SX + 11.15, y - 1.1, this.lv(3.5), g.SX + 11.2, y + 1.1, this.lv(3.7), route.color);
        const left = route.next - sim.time, since = sim.time - (route.lastDep ?? -1e9);
        if (left < 900 || since < 10) this.van(g.SX + 11.5 + (since < 10 ? since * since * 0.08 : 0), y, route, left < 900 ? Math.min(1, lane.stack.length / c.vanCapacity) : 1);
      }
    }
    van(x, y, route, fill) {
      const D = this.dy, w = 1.2, L = 8, hz = this.lv(2.6), cz = this.lv(2.1), base = this.lv(0.35), pick = { kind: 'cell', id: this.sim.grid.idx(Math.floor(this.sim.grid.SX + 7), Math.floor(y)) };
      D.rnd.box(x, y - w, base, x + L * 0.72, y + w, hz, '#f1f5f9', pick);
      D.rnd.box(x + L * 0.72, y - w + 0.05, base, x + L, y + w - 0.05, cz, route.color, pick);
      D.box.box(x + L - 0.02, y - w + 0.3, cz * 0.62, x + L + 0.01, y + w - 0.3, cz * 0.95, '#13283e');
      for (const wx of [x + 1.2, x + L - 1.0]) for (const s of [-1, 1]) D.cyl.cylY(wx, y + s * w - 0.15, y + s * w + 0.02, base, 0.4, '#0b0f17');
      D.box.box(x + 0.4, y + w, hz * 0.7, x + L * 0.68, y + w + 0.01, hz * 0.85, route.color);
      D.box.box(x + 0.4, y + w, hz * 0.2, x + 0.4 + (L * 0.68 - 0.4) * fill, y + w + 0.01, hz * 0.28, '#2563eb');
    }
    startLive() {
      const sim = this.sim, g = sim.grid, D = this.dy, sx = 1.2, sy = g.SY, h = Math.min(14, Math.ceil(sim.oms.freeTotes.length / 40));
      for (let k = 0; k < h; k++) D.box.box(sx - 0.3, sy - 0.4, CZ + k * 0.28, sx + 0.3, sy + 0.4, CZ + k * 0.28 + 0.26, k % 2 ? '#1d4ed8' : '#2563eb');
      if (sim.startT > sim.cfg.startTime - 1) D.litCyl.cyl(2.8, sy - 0.42, CZ + 1.4, CZ + 1.6, 0.06, '#38bdf8');
      const e = sim.emptier;
      if (e.tote) D.litCyl.cyl(e.x, e.y, RZ + 2.2, RZ + 2.45, 0.08, '#22c55e');
      const r = sim.returnDock.length, rx = g.SX + 9.8, ry = 0.6;
      for (let k = 0; k < Math.min(12, Math.ceil(r / 8)); k++) D.box.box(rx - 0.3, ry - 0.4, 0.1 + k * 0.28, rx + 0.3, ry + 0.4, 0.36 + k * 0.28, '#475569');
    }
    drawStationsLive() {}

    // ---------------------------------------------------------------- picking and selection
    pickFloor(f) {
      const sim = this.sim, g = sim.grid, x = Math.floor(f.x), y = Math.floor(f.y);
      if (!g.inside(x, y)) return null;
      const i = g.idx(x, y), th = g.what[i] >= 0 ? sim.things[g.what[i]] : null;
      if (th && th.kind === 'zone') return { kind: 'port', id: th.zone.port.idx };
      return { kind: 'cell', id: i };
    }
    selectionBox(s, alpha) {
      const sim = this.sim, g = sim.grid;
      if (s.tote) { const t = s.tote; if (t.x == null) return null; return [t.x - 0.45, t.y - 0.45, t.x + 0.45, t.y + 0.45, (t.belt && t.belt.kind === 'return' ? RZ : CZ) + 1.05]; }
      if (s.kind === 'port') {
        const p = sim.ports[s.id], z = p.zoneRef;
        if (z) return [z.dx - 4.4, g.LB + 1, z.dx + 1.4, z.kind === 'carousel' ? g.caroEnd + 0.3 : g.LB + g.SD + 2.3, 0.03];
        const xs = p.cells.map((c) => c.x), ys = p.cells.map((c) => c.y);
        return [Math.min(...xs), Math.min(...ys), Math.max(...xs) + 1, Math.max(...ys) + 1, 0.03];
      }
      if (s.kind === 'cell') { const x = g.cx(s.id), y = g.cy(s.id); return [x, y, x + 1, y + 1, 0.03]; }
      return super.selectionBox(s, alpha);
    }

    // ---------------------------------------------------------------- tote cam
    // The robot cam rides an order tote instead: one just started, so it has the whole journey ahead.
    followPos(id, alpha) {
      const t = this.sim.oms.totes[id];
      if (!t || !t.belt) return null;
      return { x: t.px + (t.x - t.px) * alpha, y: t.py + (t.y - t.py) * alpha, z: (t.belt.kind === 'return' ? RZ : CZ) };
    }
    pickRider(not) {
      const sim = this.sim, totes = sim.oms.totes, start = sim.belts.start.totes.filter((t) => t.kind === 'order');
      const pool = start.length ? start : sim.net.belts.flatMap((b) => b.totes.filter((t) => t.kind === 'order'));
      const ok = pool.filter((t) => totes.indexOf(t) !== not);
      const t = ok.length ? ok[ok.length - 1] : pool[0];
      return t ? totes.indexOf(t) : 0;
    }
    rideFront() { return 0.42; }
    rideHeight() { return 1.5; }

    // ---------------------------------------------------------------- follow an order
    orderFocus(o) {
      const sim = this.sim, g = sim.grid, U = WS.U;
      const at = (x, y, z, text, step, done) => ({ x, y, z, text, step, done });
      const onBelt = o.totes.filter((t) => t.order === o && t.belt);
      switch (o.status) {
        case 'NEW': {
          const ahead = sim.waiting.filter((x) => x.due < o.due || (x.due === o.due && x.created < o.created)).length;
          return at(1.4, g.SY, CZ, `Waiting for order start${ahead ? `: ${ahead} order${ahead > 1 ? 's' : ''} go first` : ''}. Its van (${o.route.name}) leaves at ${U.fmtClock(o.due).slice(-8, -3)}`, 0);
        }
        case 'RELEASED': case 'PICKING': {
          // the A-frame window first, as long as it has not tipped
          const w = sim.windows.find((x) => x.order === o);
          if (w) {
            const units = w.lines.reduce((s, l) => s + l.got, 0), need = w.lines.reduce((s, l) => s + l.need, 0);
            return at(g.AX + w.b / sim.cfg.cellSize, g.AY, AZ, `Its window on the A-frame belt: ${units} of ${need} units dispensed by ${w.lines.length} channels${sim.afRunning ? '' : ' · the belt waits for the tote at its end'}`, 1);
          }
          const t = onBelt.find((x) => x.kind === 'order') || onBelt[0];
          if (t) {
            const b = t.belt, z = sim.zones.find((zz) => zz.in === b), next = sim.zones.find((zz) => sim.needs(t, zz));
            let text;
            if (b === sim.belts.start) text = t.tipAt != null ? 'The window tips into the tote' : `The tote (${t.id}) rides along the A-frame to the end of its belt`;
            else if (z && z.job && z.job.tote === t) { const x = z.job.cur; text = x ? `${z.port.code}: picking ${x.qty} × ${sim.inv.byGtin.get(x.line.gtin).name}${x.completion ? ' (completion)' : ''}` : `${z.port.code}: ${z.kind === 'carousel' ? 'the carousels turn to its next shelf' : 'next line'}`; }
            else if (z) text = `Waiting on the ${z.port.code} spur`;
            else if (b.kind === 'loop') text = next ? `On the loop to ${next.port.code} (${next.kind === 'carousel' ? 'carousels' : 'pick-to-light'})${t.laps > 1 ? `, going round again` : ''}` : 'Done in the zones: on the loop to the merge';
            else text = `On the conveyor: ${b.name}`;
            return at(t.x, t.y, CZ, text, z || (b.kind === 'loop' && t.laps) ? 2 : 1);
          }
          if (o.rf && o.rf.picker && o.rf.state === 'PICKING') { const pk = o.rf.picker; return at(pk.x, pk.y, 0.5, `${pk.name} picks its slow movers in the RF shelving`, 2); }
          break;
        }
        case 'PICKED': {
          const rf = o.rf && o.rf.state !== 'MERGE' && o.rf.state !== 'DONE';
          if (rf && o.rf.picker && o.rf.state === 'PICKING') { const pk = o.rf.picker; return at(pk.x, pk.y, 0.5, `At the merge, waiting for its RF tote: ${pk.name} is picking it`, 3); }
          const k = sim.merge.totes.findIndex((t) => t.order === o), q = k >= 0 ? this.mergeSpot(k) : { x: g.RX + 5, y: g.LT };
          return at(q.x, q.y, CZ, sim.merge.job && sim.merge.job.o === o ? 'The merge operator tips the RF tote into the order tote' : rf ? 'At the merge, waiting for its RF tote on the belt' : 'At the merge, waiting for its other totes', 3);
        }
        case 'PACKING': {
          const t = onBelt[0];
          if (t) { const m = sim.machines.find((mm) => mm.tote === t); return at(t.x, t.y, CZ, m ? `${m.name}${m.id === 'scale' ? ': weighing' : m.id === 'docs' ? ': the documents go in' : m.id === 'lid' ? ': the lid goes on' : ': the SSCC label goes on'}` : t.failed || t.belt === sim.belts.check ? 'Off weight: to the manual check' : `On the ${t.belt.name.startsWith('sorter') || t.belt.name === 'to sorter' ? 'shipping sorter to its lane' : 'closing line'}`, 4); }
          const k = sim.merge.totes.findIndex((t) => t.order === o), q = k >= 0 ? this.mergeSpot(k) : { x: g.RX + 5, y: g.LT };
          return at(q.x, q.y, CZ, 'At the merge, waiting to go onto the closing line', 4);
        }
        case 'PACKED': case 'LOADED': {
          const lane = o.route.lane, t = onBelt[0];
          if (t) return at(t.x, t.y, CZ, `Down its route's lane: ${o.route.name}`, 5);
          return at(g.SX + 7, lane.y, 1.5, `In lane ${o.route.name}, ${lane.stack.length} totes: the van leaves at ${U.fmtClock(o.route.next).slice(-8, -3)} (in ${U.fmtDur(o.route.next - sim.time)})`, 5);
        }
        case 'SHIPPED': { const lane = o.route.lane; return at(g.SX + 13, lane.y, 2, `On the van to ${o.route.city}: ${U.fmtDur(o.times.shipped - o.created)} from order to van${o.missed ? ' (it missed its first van)' : ''}`, 6, true); }
      }
      return at(g.W / 2, g.D / 2, 1, o.status, 0);
    }

    drawLabels() {
      const sim = this.sim, g = sim.grid, bg = 'rgba(15,23,42,0.82)';
      this.label(`A-FRAME · ${sim.channels.length} channels${sim.afRunning || !sim.windows.length ? '' : ' · belt waiting'}`, g.AX + g.afLen / 2, g.AY, TOP + 1.2, { size: 10, bg, color: '#7dd3fc' });
      for (const z of sim.zones) this.label(`${z.port.code} · ${z.kind === 'carousel' ? 'CAROUSELS' : 'PICK-TO-LIGHT'} · ${z.in.totes.length}/${sim.cfg.spurTotes}`, z.dx - 1.5, g.LB + 1.2, 5.5, { size: 10, bg, color: '#fdba74' });
      this.label(`MERGE · ${sim.merge.totes.length}`, g.RX + 5.2, g.LT - 2.2, 4.4, { size: 10, bg, color: '#c4b5fd' });
      this.label('RF SHELVING', g.RFX + 1.5 * g.na, g.RFY + 0.2, 6.5, { size: 10, bg, color: '#fde68a' });
      this.label('ORDER START', 1.6, g.SY + 1.2, 1, { size: 10, bg, color: '#86efac' });
      if (this.cam.dist > 45 && !this.cam.walk) return;
      for (const lane of sim.lanes) { const r = lane.route; this.label(`${r.name} · ${lane.stack.length}`, g.SX + 3, lane.y + 0.9, 1, { size: 9, bg, color: r.color }); }
    }
  }

  WS.ZoneRenderer3D = ZoneRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
