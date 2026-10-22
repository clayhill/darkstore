/* ZoneHop in the free 3D view (WS.View3D). The A-frame is the centrepiece:
 * two sloping faces of channels over its belt, each channel's stack of
 * boxes going down as it dispenses and back up when it is refilled, the
 * windows on the belt filling as they pass and sliding off its end through
 * a hopper into the order tote below, past which order start sends its
 * totes; the refill operators taking bins from the flow racks behind their
 * walkways, and the shuttle store sending those bins round on its
 * conveyors, its shuttles and lifts at work. Around it the conveyors with
 * the totes, the pick-to-light flow racks lighting the location to pick, the
 * carousels' carriers turning round their track, the RF shelving with
 * the pickers and their carts, the merge, the closing line's machines, the
 * route lanes with the stacked totes and the vans at their doors. The tote
 * cam rides an order tote through all of it; Follow an order follows an
 * order's window, totes and van. */
(function (WS) {
  'use strict';
  const CZ = 2.2, AZ = 2.3, RZ = 2.6, TZ = 0.95, TOP = 6.2, FOOT = 2.9, HALF = 0.75; // as in the isometric view
  const RACK = [0.5, 1.4, 2.3, 3.2], RTOP = 4.05, BZ = 4.5; // the flow racks' levels, as in the isometric view; their return lane; the empty bin conveyor
  const STOREZ = (l) => 0.3 + l * 0.58; // a level of the shuttle store (a lift's position, in levels)
  const CL = 6, CLZ = (l) => 0.45 + l * 0.62, CTOP = 4.3, CRAIL = 4.75; // carousel carriers: levels, shelf level, top of a carrier, the overhead track
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
      out.push({ x: g.AX + g.afLen / 2, y: g.AY }, { x: g.RX + 5.2, y: g.LT + 2.6 }, { x: sim.machines[0].x - 0.9, y: g.LT - 2.4 }, sim.rfDepot(), { x: g.OSX, y: g.AY }, { x: g.tipX, y: g.AY }, { x: g.CX0 + 3, y: g.CY0 + 3 }, { x: g.CX1 - 3, y: g.CY0 + 3 });
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
      for (const bt of sim.net.belts) {
        const col = bt.kind === 'loop' ? '#2f3d52' : bt.kind === 'lane' ? '#3a3420' : '#334155';
        if (bt === sim.belts.feed) { this.incline(S, bt.pts[0], bt.pts[1], TZ, CZ, col); this.conveyor(S, bt.pts.slice(1), 0.7, CZ, col); }
        else this.conveyor(S, bt.pts, 0.7, this.beltZ(bt, 0), col);
      }
      this.aframeStatic(S);
      for (const z of sim.zones) this.zoneStatic(S, z);
      this.rfStatic(S);
      this.closingStatic(S);
      this.startStatic(S);
      // the zones' floor marking and the walkways along the A-frame
      for (const z of sim.zones) S.box.box(z.dx - 4.4, g.LB + 1, 0, z.dx + 1.4, z.kind === 'carousel' ? g.caroEnd + 0.3 : g.LB + g.SD + 2.3, 0.01, '#1f3a2c', { kind: 'port', id: z.port.idx });
      for (const s of [-1, 1]) for (const d of [-0.42, 0.42]) S.box.box(g.AX - 1.4, g.AY + s * g.WK + d - 0.04, 0, g.AX + g.afLen + 1.4, g.AY + s * g.WK + d + 0.04, 0.015, '#a16207');
      if (!this.chan) { this.chan = this.newBatch('box', 'std', 2048); this.res = this.newBatch('box', 'std', 2048); }
      this.chan.slots(sim.channels.length, 2);
      this.res.slots(sim.channels.length, 6);
    }
    extraBatches() { return [this.chan, this.res]; }
    beltZ(b, s) { return WS.ZoneRenderer.prototype.beltZ.call(this, b, s); }
    // an inclined conveyor from a (level z0) to b (level z1): side frames and rollers in steps, legs
    incline(S, a, b, z0, z1, color) {
      const len = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / len, uy = (b.y - a.y) / len, n = Math.ceil(len / 0.25);
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n, x = a.x + ux * len * f, y = a.y + uy * len * f, z = z0 + (z1 - z0) * f, h = len / n / 2 + 0.01;
        for (const s of [-1, 1]) S.box.box(x - h * Math.abs(ux) + s * 0.36 * Math.abs(uy) - 0.03, y - h * Math.abs(uy) + s * 0.36 * Math.abs(ux) - 0.03, z - 0.35, x + h * Math.abs(ux) + s * 0.36 * Math.abs(uy) + 0.03, y + h * Math.abs(uy) + s * 0.36 * Math.abs(ux) + 0.03, z + 0.05, color);
        if (Math.abs(uy) > 0.5) S.cyl.cylX(x - 0.33, x + 0.33, y, z - 0.07, 0.04, '#64748b'); else S.cyl.cylY(x, y - 0.33, y + 0.33, z - 0.07, 0.04, '#64748b');
        if (k % 3 === 1) for (const s of [-1, 1]) S.box.box(x + s * 0.33 * Math.abs(uy) - 0.03, y + s * 0.33 * Math.abs(ux) - 0.03, 0, x + s * 0.33 * Math.abs(uy) + 0.03, y + s * 0.33 * Math.abs(ux) + 0.03, z - 0.35, '#475569');
      }
    }
    // The A-frame, light grey as the real ones are: frames at the ends and
    // every few metres, two steep faces with a white channel for each slot
    // over the belt, a grey header along the apex with an indicator light per
    // channel, the ejectors along the foot; on each walkway side a ledge to
    // set a bin on while filling a channel; blue railings at the hopper end.
    aframeStatic(S) {
      const sim = this.sim, g = sim.grid, c = sim.cfg, x0 = g.AX, x1 = g.AX + g.afLen, y = g.AY, pick = { kind: 'port', id: sim.afPort.idx }, frame = '#d5dbe2';
      const nf = Math.max(2, Math.round((x1 - x0) / 4)), w = WS.ZONE_CHANNEL_PITCH / c.cellSize;
      for (let k = 0; k <= nf; k++) {
        const x = x0 - 0.12 + ((x1 - x0 + 0.24) * k) / nf;
        for (const s of [-1, 1]) {
          S.box.box(x - 0.05, y + s * (HALF + 0.1) - 0.05, 0, x + 0.05, y + s * (HALF + 0.1) + 0.05, FOOT - 0.3, frame, pick);
          S.box.slab(x - 0.05, x + 0.05, y + s * (HALF + 0.1), FOOT - 0.35, y + s * 0.1, TOP + 0.1, 0.1, frame, pick);
        }
        S.box.box(x - 0.05, y - HALF - 0.12, FOOT - 0.42, x + 0.05, y + HALF + 0.12, FOOT - 0.32, frame, pick);
      }
      // the end panels closing the triangle
      for (const x of [x0 - 0.15, x1 + 0.15]) for (let k = 0; k < 8; k++) {
        const u = (k + 0.5) / 8, z = FOOT + (TOP - FOOT) * u, d = HALF * (1 - u) + 0.08, h = (TOP - FOOT) / 16;
        S.box.box(x - 0.025, y - d, z - h, x + 0.025, y + d, z + h, '#e8ecf0', pick);
      }
      for (const s of [-1, 1]) {
        // the face: a backing with a white channel for each slot
        S.box.slab(x0, x1, y + s * HALF, FOOT, y + s * 0.06, TOP, 0.04, '#97a1ae', pick);
        for (const ch of sim.channels) if ((ch.side ? 1 : -1) === s) S.box.slab(ch.wx - w * 0.43, ch.wx + w * 0.43, y + s * (HALF + 0.03), FOOT, y + s * 0.09, TOP - 0.05, 0.035, '#f3f5f8', pick);
        // the ejectors along the foot; the ledge on the walkway side on its brackets
        S.box.box(x0, y + s * (HALF - 0.05) - 0.12, FOOT - 0.45, x1, y + s * (HALF - 0.05) + 0.12, FOOT, '#475569', pick);
        const la = y + s * (HALF + 0.08), lb = y + s * (HALF + 0.38);
        S.box.box(x0, Math.min(la, lb), 1.55, x1, Math.max(la, lb), 1.65, '#b5835a', pick);
        for (let x = x0 + 0.5; x < x1; x += 2) S.box.box(x - 0.03, Math.min(la, lb), 1.1, x + 0.03, Math.max(la, lb), 1.55, '#8b95a1');
        // blue railing across the walkway at the hopper end
        const ra = y + s * (HALF + 0.12), rb = y + s * (g.RK - 0.4), rx = x1 + 1.0;
        for (const yy of [ra, (ra + rb) / 2, rb]) S.box.box(rx - 0.04, yy - 0.04, 0, rx + 0.04, yy + 0.04, 2.3, '#1d4ed8');
        for (const z of [1.2, 2.25]) S.box.box(rx - 0.035, Math.min(ra, rb), z, rx + 0.035, Math.max(ra, rb), z + 0.08, '#2563eb');
      }
      // the header over the apex, with the WAMAS labels
      S.box.box(x0 - 0.15, y - 0.22, TOP - 0.1, x1 + 0.15, y + 0.22, TOP + 0.45, '#8b95a1', pick);
      for (let x = x0 + 0.6; x < x1; x += 2.4) for (const s of [-1, 1]) S.box.box(x, y + s * 0.225 - 0.005, TOP + 0.2, x + 0.4, y + s * 0.225 + 0.005, TOP + 0.38, x % 4.8 < 2.4 ? '#ef4444' : '#facc15');
      // the belt between the faces, the rubber belt over its end drums
      S.box.box(x0 - 0.3, y - 0.32, AZ - 0.3, x1 + 0.3, y + 0.32, AZ - 0.05, '#1f2937', pick);
      S.box.box(x0 - 0.3, y - 0.27, AZ - 0.05, x1 + 0.3, y + 0.27, AZ, '#0b0f17', pick);
      for (const s of [-1, 1]) S.box.box(x0 - 0.3, y + s * 0.3 - 0.025, AZ - 0.05, x1 + 0.3, y + s * 0.3 + 0.025, AZ + 0.12, '#475569', pick);
      S.cyl.cylY(x1 + 0.3, y - 0.29, y + 0.29, AZ - 0.15, 0.15, '#94a3b8');
      S.cyl.cylY(x0 - 0.3, y - 0.29, y + 0.29, AZ - 0.15, 0.15, '#94a3b8');
      S.box.box(x0 - 0.75, y + 0.32, AZ - 0.4, x0 - 0.35, y + 0.6, AZ + 0.05, '#1e3a8a'); // drive motor
      this.hopperStatic(S);
      this.reserveStatic(S);
      this.storeStatic(S);
    }
    // The hopper past the end of the belt: a stainless funnel in rings,
    // narrowing from under the belt's end to the tote below; its flap at the
    // bottom; a stand on the floor and a photo eye for the tote.
    hopperStatic(S) {
      const g = this.sim.grid, y = g.AY, hx = g.tipX - 0.08, zt = AZ + 0.25, zb = TZ + 1.05, n = 5, steel = '#a3acb9';
      for (let k = 0; k < n; k++) {
        const f = k / (n - 1), z = zt - (zt - zb) * f, wx = 0.55 - 0.27 * f, wy = 0.45 - 0.18 * f, cx = hx - 0.1 * (1 - f), t = 0.03, h = (zt - zb) / (n - 1) + 0.02;
        S.box.box(cx - wx, y - wy, z - h, cx + wx, y - wy + t, z, steel);
        S.box.box(cx - wx, y + wy - t, z - h, cx + wx, y + wy, z, steel);
        S.box.box(cx + wx - t, y - wy, z - h, cx + wx, y + wy, z, WS.shade(steel, -0.12));
        if (f > 0.3) S.box.box(cx - wx, y - wy, z - h, cx - wx + t, y + wy, z, WS.shade(steel, -0.12));
      }
      // the rim, open towards the belt
      for (const s of [-1, 1]) S.box.box(hx - 0.68, y + s * 0.47 - 0.04, zt - 0.02, hx + 0.48, y + s * 0.47 + 0.04, zt + 0.06, '#64748b');
      S.box.box(hx + 0.42, y - 0.47, zt - 0.02, hx + 0.5, y + 0.47, zt + 0.06, '#64748b');
      for (const s of [-1, 1]) {
        S.box.box(hx + 0.55, y + s * 0.5 - 0.04, 0, hx + 0.63, y + s * 0.5 + 0.04, zt, '#475569');
        S.box.box(hx - 0.3, y + s * 0.42 - 0.03, TZ + 0.4, hx - 0.24, y + s * 0.42 + 0.03, TZ + 0.55, '#0f172a'); // photo eye
      }
    }
    // The flow racks behind the walkways: light grey, four levels of roller
    // lanes sloping down towards the walkway with a lane for every channel,
    // yellow label strips on the front beams, and a return lane at the top
    // sloping the other way for the empty bins. Behind each, the bin
    // conveyor from the shuttle store and over it the one for the empty bins.
    reserveStatic(S) {
      const sim = this.sim, g = sim.grid, x0 = g.AX - 0.3, x1 = g.AX + g.afLen + 0.3, pick = { kind: 'port', id: sim.afPort.idx }, grey = '#cdd4dc';
      for (const s of [-1, 1]) {
        const ry = g.AY + s * g.RK, near = ry - s * 0.35, far = ry + s * 0.35;
        for (let x = x0; x <= x1 + 1e-6; x += (x1 - x0) / Math.ceil((x1 - x0) / 2.2)) for (const yy of [near, far]) S.box.box(x - 0.04, yy - 0.04, 0, x + 0.04, yy + 0.04, 4.4, grey, pick);
        for (const z of [...RACK, RTOP]) {
          const top = z === RTOP;
          S.box.slab(x0, x1, near, z - (top ? 0.02 : 0.1), far, z + (top ? -0.1 : 0.0), 0.03, '#aab3be', pick);
          S.box.box(x0, near - 0.03, z - 0.14, x1, near + 0.03, z + 0.02, grey, pick);
          if (!top) S.box.box(x0, near - s * 0.035, z - 0.11, x1, near - s * 0.03, z - 0.01, '#facc15', pick); // label strip
          S.box.box(x0, far - 0.03, z - 0.06, x1, far + 0.03, z + 0.04, grey, pick);
        }
      }
      // the bin conveyors: out of each west lift along to the back of both racks; the empty bins back above them
      const cy = (a) => g.CY0 + g.CW * (a + 0.5), na = sim.cfg.storeAisles, last = cy(na - 1), lift = g.CX0 - 0.5;
      for (const [x, z] of [[g.BX, CZ], [g.EX, BZ]]) {
        for (let a = 0; a < na; a++) this.conveyor(S, [{ x: lift - 0.3, y: cy(a) }, { x, y: cy(a) }], 0.5, z, '#3b4a5e');
        this.conveyor(S, [{ x, y: last }, { x, y: g.AY - g.BK }], 0.5, z, '#3b4a5e');
        for (const s of [-1, 1]) this.conveyor(S, [{ x, y: g.AY + s * g.BK }, { x: x1, y: g.AY + s * g.BK }], 0.5, z, '#3b4a5e');
      }
      // out of the east lifts to the zones' replenishment point, the empty bins back above
      for (const z of [CZ, BZ]) {
        for (let a = 0; a < na; a++) this.conveyor(S, [{ x: g.CX1 + 0.8, y: cy(a) }, { x: g.ZX, y: cy(a) }], 0.5, z, '#3b4a5e');
        this.conveyor(S, [{ x: g.ZX, y: cy(0) }, { x: g.ZX, y: g.ZY }, { x: g.ZEND, y: g.ZY }], 0.5, z, '#3b4a5e');
      }
      // the replenishment point: a roller table at the end of the line, a cart beside it
      const rp = { kind: 'cell', id: g.idx(Math.floor(g.ZEND), Math.floor(g.ZY)) };
      S.box.box(g.ZEND, g.ZY - 0.35, CZ - 0.3, g.ZEND + 1.6, g.ZY + 0.35, CZ - 0.05, '#334155', rp);
      for (let x = g.ZEND + 0.1; x < g.ZEND + 1.6; x += 0.25) S.cyl.cylY(x, g.ZY - 0.32, g.ZY + 0.32, CZ - 0.07, 0.04, '#64748b');
      for (const x of [g.ZEND + 0.05, g.ZEND + 1.55]) for (const y of [g.ZY - 0.3, g.ZY + 0.3]) S.box.box(x - 0.03, y - 0.03, 0, x + 0.03, y + 0.03, CZ - 0.3, '#475569');
      S.box.box(g.ZEND + 0.2, g.ZY + 0.65, 0.3, g.ZEND + 1.4, g.ZY + 1.35, 0.4, '#64748b', rp);
      S.box.box(g.ZEND + 0.2, g.ZY + 0.65, 1.5, g.ZEND + 1.4, g.ZY + 1.35, 1.6, '#64748b', rp);
      for (const x of [g.ZEND + 0.22, g.ZEND + 1.36]) S.box.box(x - 0.02, g.ZY + 0.66, 0.3, x + 0.02, g.ZY + 0.7, 2.5, '#94a3b8');
      for (const x of [g.ZEND + 0.3, g.ZEND + 1.3]) for (const y of [g.ZY + 0.72, g.ZY + 1.28]) S.cyl.cyl(x, y, 0, 0.3, 0.07, '#0b0f17');
    }
    // The shuttle store: in each aisle a rack either side, a level for every
    // shuttle, grey bins (a few blue) on every level; at each end of the
    // aisle the lift in its steel mast.
    storeStatic(S) {
      const sim = this.sim, g = sim.grid, c = sim.cfg, x0 = g.CX0, x1 = g.CX1, pick = { kind: 'cell', id: g.idx(Math.floor(x0 + 2), Math.floor(g.CY0 + 1)) }, grey = '#9aa4b0';
      for (let a = 0; a < c.storeAisles; a++) {
        const ay = g.CY0 + g.CW * (a + 0.5), top = STOREZ(c.storeLevels);
        for (const s of [-1, 1]) {
          const ya = ay + s * 0.45, yb = ay + s * 1.25;
          for (let x = x0; x <= x1 + 1e-6; x += (x1 - x0) / Math.ceil((x1 - x0) / 1.6)) for (const yy of [ya, yb]) S.box.box(x - 0.04, yy - 0.04, 0, x + 0.04, yy + 0.04, top + 0.3, grey, pick);
          for (let l = 0; l < c.storeLevels; l++) {
            const z = STOREZ(l);
            S.box.box(x0, Math.min(ya, yb), z - 0.05, x1, Math.max(ya, yb), z, '#7c8794', pick);
            S.box.box(x0, ya - 0.03, z, x1, ya + 0.03, z + 0.06, '#5b6573', pick); // the shuttle's rail
            let k = 0;
            for (let x = x0 + 0.1; x + 0.5 < x1; x += 0.56, k++) {
              const h = (a * 131 + l * 37 + k * 17 + (s > 0 ? 7 : 0)) % 23;
              if (h === 0) continue; // a gap
              S.box.box(x, Math.min(ya, yb) + 0.08, z, x + 0.48, Math.max(ya, yb) - 0.06, z + 0.36, h < 4 ? '#2563eb' : '#8e98a5', pick);
            }
          }
        }
        // a lift at each end: its mast, the drive on top
        for (const lx of [x0 - 0.5, x1 + 0.5]) {
          for (const dy of [-0.4, 0.4]) { S.box.box(lx - 0.06, ay + dy - 0.06, 0, lx + 0.06, ay + dy + 0.06, top + 0.55, '#64748b', pick); S.box.box(lx - 0.45, ay + dy - 0.04, top + 0.45, lx + 0.45, ay + dy + 0.04, top + 0.55, '#64748b', pick); }
          S.box.box(lx - 0.25, ay - 0.3, top + 0.55, lx + 0.25, ay + 0.3, top + 0.85, '#1e293b', pick);
        }
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
      } else for (const cr of z.carousels) this.carouselStatic(S, z, cr, pick);
    }
    // A horizontal carousel: the carriers hang from a chain in an overhead
    // oval track carried by a frame of posts and cross beams down the middle,
    // with the drive at the far end; a guide rail on the floor keeps them
    // from swinging. At the pick face a light tree with a light per level, a
    // light curtain post either side, a mat for the operator.
    carouselStatic(S, z, cr, pick) {
      const sim = this.sim, R = 2 * cr.len + 2 * Math.PI * cr.r, N = Math.ceil(R / 0.35), ya = cr.y + cr.r, yb = cr.y + cr.r + cr.len;
      for (let k = 0; k < N; k++) {
        const u = (k + 0.5) * R / N, p = sim.caroAt(cr, u), q = sim.caroAt(cr, u + 0.2), h = 0.2;
        const ax = Math.abs(q.x - p.x) > Math.abs(q.y - p.y);
        S.box.box(p.x - (ax ? h : 0.05), p.y - (ax ? 0.05 : h), 0, p.x + (ax ? h : 0.05), p.y + (ax ? 0.05 : h), 0.1, '#52525b', pick); // floor guide
        S.box.box(p.x - (ax ? h : 0.09), p.y - (ax ? 0.09 : h), CRAIL - 0.05, p.x + (ax ? h : 0.09), p.y + (ax ? 0.09 : h), CRAIL + 0.2, '#64748b', pick); // overhead track
      }
      // the frame: posts down the middle, a spine beam and arms out to the track
      const nPost = Math.max(2, Math.round(cr.len / 3) + 1);
      for (let k = 0; k < nPost; k++) {
        const yy = ya + (cr.len * k) / (nPost - 1);
        S.box.box(cr.x - 0.07, yy - 0.07, 0, cr.x + 0.07, yy + 0.07, CRAIL + 0.35, '#475569', pick);
        S.box.box(cr.x - cr.r, yy - 0.05, CRAIL + 0.2, cr.x + cr.r, yy + 0.05, CRAIL + 0.3, '#475569', pick);
      }
      S.box.box(cr.x - 0.08, ya, CRAIL + 0.25, cr.x + 0.08, yb, CRAIL + 0.4, '#475569', pick);
      S.box.box(cr.x - 0.2, ya, 0, cr.x + 0.2, yb, 0.12, '#334155', pick); // base rail in the middle
      // the drive at the far end: gearbox and motor on top, a guard round the sprocket
      S.box.box(cr.x - 0.32, yb - 0.3, CRAIL + 0.4, cr.x + 0.32, yb + 0.3, CRAIL + 0.95, '#1e3a8a', pick);
      S.cyl.cylY(cr.x + 0.12, yb - 0.6, yb - 0.3, CRAIL + 0.68, 0.17, '#1e40af', pick);
      S.cyl.cyl(cr.x, yb, CRAIL + 0.2, CRAIL + 0.4, cr.r * 0.55, '#facc15', pick);
      S.cyl.cyl(cr.x, ya, CRAIL + 0.2, CRAIL + 0.4, cr.r * 0.55, '#334155', pick);
      // pick face: light tree on the outer side, light curtain posts, the mat
      const out = cr.x < z.pick.x ? -1 : 1, tx = cr.x + out * (cr.r + 0.42), ty = cr.y - 0.15;
      S.box.box(tx - 0.05, ty - 0.05, 0, tx + 0.05, ty + 0.05, CTOP + 0.6, '#1f2937', pick);
      S.box.box(tx - 0.16, ty - 0.12, CTOP + 0.6, tx + 0.16, ty + 0.06, CTOP + 1.05, '#0f172a', pick);
      for (const s of [-1, 1]) {
        const px = cr.x + s * (cr.r + 0.18);
        if (s === out) continue;
        S.box.box(px - 0.05, ty - 0.05, 0, px + 0.05, ty + 0.05, CTOP, '#facc15', pick);
      }
      S.box.box(cr.x - 0.55, cr.y - 1.5, 0, cr.x + 0.55, cr.y - 0.55, 0.03, '#10161f');
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
      this.mergeStatic(S);
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
    // The merge station: the put-to-light rack, light grey with blue beams,
    // roller lanes sloping to the front and a light module under each lane;
    // the line through the station with a stop at the merge position; the RF
    // totes' accumulation lane with a shelf over it; the operator's mat, the
    // screen on its post and a dolly for the empty RF totes.
    mergeStatic(S) {
      const sim = this.sim, g = sim.grid, G = this.mergeGeo(), mg = { kind: 'port', id: sim.mergePort.idx }, top = G.levels[2] + 1.6;
      this.conveyor(S, [{ x: g.RX + 2.6, y: g.LT }, { x: g.RX + 8, y: g.LT }], 0.7, CZ, '#334155');
      S.box.box(G.px + 0.4, g.LT - 0.36, CZ - 0.05, G.px + 0.45, g.LT + 0.36, CZ + 0.2, '#facc15', mg); // the stop
      for (const s of [-1, 1]) S.box.box(G.px - 0.1, g.LT + s * 0.38 - 0.03, CZ + 0.3, G.px + 0.1, g.LT + s * 0.38 + 0.03, CZ + 0.45, '#0f172a', mg); // photo eyes
      const cs = [...new Set([...Array(Math.floor(G.cols / 2) + 1)].map((_, k) => Math.min(G.cols, k * 2)).concat(G.cols))];
      for (const c of cs) for (const y of [G.y0, G.y1]) { const x = G.x0 + c * 0.62; S.box.box(x - 0.04, y - 0.04, 0, x + 0.04, y + 0.04, top, '#cbd5e1', mg); }
      for (const z of G.levels) {
        S.box.slab(G.x0, G.x1, G.y0, z + 0.1, G.y1, z - 0.06, 0.04, '#94a3b8', mg); // the lanes, sloping to the front
        for (let c = 0; c <= G.cols; c++) S.box.slab(G.x0 + c * 0.62 - 0.015, G.x0 + c * 0.62 + 0.015, G.y0, z + 0.2, G.y1, z + 0.04, 0.05, '#64748b', mg);
        S.box.box(G.x0, G.y1 - 0.04, z - 0.42, G.x1, G.y1 + 0.04, z - 0.06, '#2563eb', mg); // front beam, the lights on it
        S.box.box(G.x0, G.y0 - 0.04, z + 0.02, G.x1, G.y0 + 0.04, z + 0.2, '#2563eb', mg);
        for (let c = 0; c < G.cols; c++) { const x = G.x0 + (c + 0.5) * 0.62; S.box.box(x - 0.16, G.y1 + 0.04, z - 0.38, x + 0.16, G.y1 + 0.07, z - 0.08, '#0f172a', mg); }
      }
      S.box.box(G.x0, G.y1 - 0.05, top - 0.55, G.x1, G.y1 + 0.02, top, '#1e293b', mg); // the sign board
      // the RF totes' shelf over their lane
      for (const x of [G.rfx - 2.6, G.rfx + 0.3]) for (const s of [-1, 1]) S.box.box(x - 0.04, G.rfy + s * 0.4 - 0.04, CZ, x + 0.04, G.rfy + s * 0.4 + 0.04, CZ + 1.35, '#cbd5e1', mg);
      for (const s of [-1, 1]) S.box.box(G.rfx - 2.6, G.rfy + s * 0.4 - 0.04, CZ + 1.18, G.rfx + 0.3, G.rfy + s * 0.4 + 0.04, CZ + 1.4, '#94a3b8', mg);
      for (let x = G.rfx - 2.5; x < G.rfx + 0.3; x += 0.25) S.cyl.cylY(x, G.rfy - 0.37, G.rfy + 0.37, CZ + 1.3, 0.035, '#64748b');
      // the operator's mat, the screen's post, the dolly
      S.box.box(G.px - 0.65, G.opy - 0.45, 0, G.px + 0.65, G.opy + 0.45, 0.03, '#10161f', mg);
      S.box.box(G.px + 0.92, g.LT + 0.52, 0, G.px + 0.98, g.LT + 0.58, 4.5, '#475569');
      S.box.box(G.px + 0.6, g.LT + 0.5, 3.35, G.px + 1.3, g.LT + 0.6, 4.45, '#0f172a', mg);
      S.box.box(G.stack.x - 0.42, G.stack.y - 0.32, 0.06, G.stack.x + 0.42, G.stack.y + 0.32, 0.15, '#334155', mg);
      for (const dx of [-0.32, 0.32]) for (const dy of [-0.22, 0.22]) S.cyl.cyl(G.stack.x + dx, G.stack.y + dy, 0, 0.08, 0.05, '#0b0f17');
    }
    startStatic(S) {
      const sim = this.sim, g = sim.grid, sx = g.OSX, sy = g.AY, e = sim.emptier, pick = { kind: 'cell', id: g.idx(Math.floor(sx), Math.floor(sy)) };
      S.box.box(sx - 0.55, sy - 0.6, 0, sx + 0.55, sy + 0.6, TZ, '#334155', pick);
      for (const xx of [sx - 0.6, sx + 0.52]) S.box.box(xx, sy - 0.65, 0, xx + 0.08, sy + 0.65, TZ + 5.4, '#64748b');
      S.box.box(sx - 1.4, sy - 0.75, 0, sx - 0.8, sy - 0.45, TZ + 2.0, '#e2e8f0', pick);
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
        this.zoneTote(D, t, x, y, this.beltZ(b, t.s), Math.abs(t.dx) > 0.5);
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
    // The channels: a stripe of the product down each white channel, as long
    // as the stack in it; the header light over it amber while it waits for a
    // refill, green as it is refilled, red when it is jammed or empty.
    aframeLive() {
      const sim = this.sim, g = sim.grid, c = sim.cfg, D = this.dy, B = this.chan, y = g.AY, w = WS.ZONE_CHANNEL_PITCH / c.cellSize * 0.3;
      sim.channels.forEach((ch, k) => {
        const q = ch.comps[0].qty, f = Math.round((q / ch.cap) * 40) / 40, state = ch.jam ? 'j' : q <= 0 ? 'e' : ch.req ? (ch.req.op && ch.req.op.state === 'WORKING' ? 'r' : 'w') : '';
        if (!B.open(k, f + state)) return;
        const s = ch.side ? 1 : -1, pick = { kind: 'port', id: sim.afPort.idx }, at = (u) => [y + s * (HALF * (1 - u) + 0.075), FOOT + (TOP - FOOT) * u];
        if (q > 0) { const [ya, za] = at(0.03), [yb, zb] = at(0.03 + 0.92 * f); B.slab(ch.wx - w, ch.wx + w, ya, za, yb, zb, 0.06, prodCol(ch.comps[0].gtin), pick); }
        const light = ch.jam ? '#ef4444' : q <= 0 ? '#b91c1c' : state === 'r' ? '#22c55e' : state === 'w' ? '#f59e0b' : null;
        if (light) B.box(ch.wx - 0.05, y + s * 0.23 - 0.02, TOP + 0.02, ch.wx + 0.05, y + s * 0.23 + 0.02, TOP + 0.16, light, pick);
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
      // units falling from a channel's ejector into the window under it
      for (const e of sim.ejects) {
        const f = (sim.time - e.t) / 0.35;
        if (f < 0 || f > 1) continue;
        const ch = e.ch, sy = y + (ch.side ? 1 : -1) * (HALF - 0.05), zz = FOOT - 0.45 - f * (FOOT - 0.45 - AZ), yy = sy + (y - sy) * f;
        D.box.box(ch.wx - 0.06, yy - 0.05, zz, ch.wx + 0.06, yy + 0.05, zz + 0.15, prodCol(ch.comps[0].gtin || '0000000000000'));
      }
      if (!sim.afRunning && sim.windows.length) D.litCyl.cyl(g.AX + g.afLen + 0.3, y, TOP + 0.45, TOP + 0.75, 0.1, '#f59e0b');
      this.tipLive();
      this.reserveLive();
      this.binsLive();
      this.storeLive();
      // refill operators: walking the walkway; at the channel turned round to
      // the flow rack to take the bin, then filling the channel from it on the ledge
      // a technician on the walkway at a jammed channel, freeing it
      for (const ch of sim.channels) if (ch.jam) { const ty = ch.side ? g.AY + g.WK : g.AY - g.WK; this.operator(ch.wx + 0.35, ty, ch.side ? 0 : Math.PI, true, 'tech', 0, 'tech ' + ch.code); }
      for (const op of sim.refillers) {
        if (op.state === 'BREAK') continue;
        const toFrame = op.y < y ? Math.PI : 0, working = op.state === 'WORKING', a = working ? (op.fetch ? toFrame + Math.PI : toFrame) : op.state === 'WALKING' ? -op.heading - Math.PI / 2 : toFrame;
        this.operator(op.x, op.y, a, working, 'goodsIn', 0, 'refill ' + op.name);
        if (!working || !op.job) continue;
        const dir = op.y < y ? 1 : -1, ch = op.job, s = -dir;
        if (op.fetch) {
          // out of the lane to the arms, then onto the ledge
          const f = Math.min(1, Math.max(0, (c.refillTime - op.t) / 6)), zr = RACK[ch.slot % 4], ya = g.AY + s * (g.RK - 0.18), yh = op.y + dir * 0.25;
          const u = Math.min(1, f * 1.8), v = Math.max(0, (f - 0.6) / 0.4), yl = g.AY + s * (HALF + 0.23);
          this.bin(D, op.x, f < 0.6 ? ya + (yh - ya) * u : yh + (yl - yh) * v, f < 0.6 ? zr + (2.3 - zr) * u : 2.3 + (1.65 - 2.3) * v, ch.comps[0].gtin, true);
        } else {
          // on the ledge; a unit at a time from the bin into the channel
          this.bin(D, op.x, g.AY + s * (HALF + 0.23), 1.65, ch.comps[0].gtin, true);
          const u = (this.t * 1.6) % 1, ya = g.AY + s * (HALF + 0.23), yb = g.AY + s * (HALF * 0.55 + 0.1), za = 2.0, zb = FOOT + (TOP - FOOT) * 0.45;
          D.box.box(op.x - 0.05, ya + (yb - ya) * u - 0.04, za + (zb - za) * u + Math.sin(u * Math.PI) * 0.4, op.x + 0.05, ya + (yb - ya) * u + 0.04, za + (zb - za) * u + Math.sin(u * Math.PI) * 0.4 + 0.12, prodCol(ch.comps[0].gtin));
        }
      }
    }
    // a grey bin, 600 × 400, its product's label at the front and, when full, the product in it
    bin(D, x, y, z, gtin, full, B = D.box, pick) {
      B.box(x - 0.2, y - 0.16, z, x + 0.2, y + 0.16, z + 0.4, '#8e98a5', pick);
      if (full) B.box(x - 0.17, y - 0.13, z + 0.4, x + 0.17, y + 0.13, z + 0.41, prodCol(gtin, 55), pick);
      B.box(x - 0.1, y - 0.165, z + 0.15, x + 0.1, y + 0.165, z + 0.3, '#f8fafc', pick);
    }
    // The bins in each channel's lane of the flow rack, the front one at the walkway.
    reserveLive() {
      const sim = this.sim, g = sim.grid, B = this.res, pick = { kind: 'port', id: sim.afPort.idx };
      sim.channels.forEach((ch, k) => {
        if (!B.open(k, ch.res)) return;
        const s = ch.side ? 1 : -1, near = g.AY + s * (g.RK - 0.35), z = RACK[ch.slot % 4];
        for (let d = 0; d < Math.min(2, ch.res); d++) this.bin(null, ch.wx, near + s * (0.18 + d * 0.34), z + d * 0.05, ch.comps[0].gtin, true, B, pick);
        B.close(k);
      });
      B.flush();
    }
    // Bins on the move: full ones on the conveyors from the shuttle store,
    // sliding into their lane at its level or to the zones' replenishment
    // point; empty ones from the flow racks' return lanes and from the zones
    // back over them. At the replenishment point the bins wait for the
    // zones' replenishers.
    binsLive() {
      const sim = this.sim, g = sim.grid, D = this.dy, st = sim.store;
      for (const m of st.moving) {
        if (sim.time < m.t0) continue;
        let d = Math.min(m.len, ((sim.time - m.t0) / (m.t1 - m.t0)) * m.len), k = 1;
        while (k < m.path.length - 1 && d > Math.hypot(m.path[k].x - m.path[k - 1].x, m.path[k].y - m.path[k - 1].y)) { d -= Math.hypot(m.path[k].x - m.path[k - 1].x, m.path[k].y - m.path[k - 1].y); k++; }
        const a = m.path[k - 1], b = m.path[k], L = Math.hypot(b.x - a.x, b.y - a.y) || 1, f = Math.min(1, d / L), x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
        let z = m.full ? CZ : BZ;
        if (m.to === 'af') { const lane = m.full ? k === m.path.length - 1 : k === 1, zl = m.full ? RACK[m.ch.slot % 4] : RTOP; if (lane) z = m.full ? CZ + (zl - CZ) * f : zl + (BZ - zl) * f; }
        this.bin(D, x, y, z, m.gtin, m.full);
      }
      st.point.forEach((p, k) => { if (k < 3) this.bin(D, g.ZEND + 0.3 + k * 0.5, g.ZY, CZ, p.gtin, true); else if (k < 9) this.bin(D, g.ZEND + 0.4 + ((k - 3) % 3) * 0.4, g.ZY + 1.0, (k < 6 ? 0.4 : 1.6), p.gtin, true); });
    }
    // The shuttles, one on each level of an aisle, driving along it to a bin
    // and to the lifts with it, and the lifts' carriages going up and down
    // to meet them: where each is, from its timeline in the simulation.
    storeLive() {
      const sim = this.sim, D = this.dy, now = sim.time;
      for (const A of sim.store.aisles) {
        for (const S of A.shuttles) {
          const q = sim.storeAt(S, now), z = STOREZ(S.lv) + 0.06, x = q.p;
          D.box.box(x - 0.3, A.y - 0.36, z, x + 0.3, A.y + 0.36, z + 0.2, '#0d9488');
          D.box.box(x - 0.31, A.y - 0.37, z + 0.07, x + 0.31, A.y + 0.37, z + 0.11, '#1f2937');
          D.box.box(x - 0.27, A.y - 0.33, z + 0.2, x + 0.27, A.y + 0.33, z + 0.22, '#5eead4');
          if (q.bin) this.bin(D, x, A.y, z + 0.22, q.bin.gtin, q.bin.full);
        }
        for (const L of [A.lifts.w, A.lifts.e]) {
          const q = sim.storeAt(L, now), z = STOREZ(q.p);
          D.box.box(L.x - 0.34, A.y - 0.36, z - 0.14, L.x + 0.34, A.y + 0.36, z, '#334155');
          for (const dy of [-0.38, 0.38]) D.box.box(L.x - 0.34, A.y + dy - 0.02, z - 0.14, L.x + 0.34, A.y + dy + 0.02, z + 0.25, '#475569');
          if (q.bin) this.bin(D, L.x, A.y, z, q.bin.gtin, q.bin.full);
        }
      }
    }
    // The window tipping: its units slide off the end of the belt into the
    // hopper and drop into the tote; the flap stands open while they fall.
    tipLive() {
      const sim = this.sim, g = sim.grid, D = this.dy, y = g.AY, x1 = g.AX + g.afLen + 0.3, hx = g.tipX - 0.08, zt = AZ + 0.25, zb = TZ + 1.05;
      let open = false;
      for (const e of sim.tips) {
        const age = sim.time - e.t;
        if (age < 0 || age > 1.0) continue;
        open = true;
        let k = 0;
        for (const ln of e.w.lines) for (let u = 0; u < ln.got && k < 18; u++, k++) {
          const f = Math.min(1, Math.max(0, (age - k * 0.025) / 0.6));
          if (f <= 0 || f >= 1) continue;
          const ox = ((k % 4) - 1.5) * 0.08, oy = ((k >> 2) % 3 - 1) * 0.1;
          // over the drum (a short arc), then a fall through the hopper into the tote
          const x = f < 0.25 ? x1 - 0.2 + f * 2.4 + ox * f * 4 : hx + ox, z = f < 0.25 ? AZ + 0.05 - f * 0.6 : AZ - 0.1 - (f - 0.25) / 0.75 * (AZ - 0.1 - TZ - 0.25);
          D.box.box(x - 0.06, y + oy - 0.05, z, x + 0.06, y + oy + 0.05, z + 0.15, prodCol(ln.line.gtin));
        }
      }
      // the flap at the bottom of the hopper: closed, or both halves hanging open
      if (open) for (const s of [-1, 1]) D.box.box(hx - 0.28, y + s * 0.27 - 0.02, zb - 0.3, hx + 0.28, y + s * 0.27 + 0.02, zb, '#64748b');
      else D.box.box(hx - 0.28, y - 0.27, zb - 0.03, hx + 0.28, y + 0.27, zb, '#64748b');
      const ready = sim.belts.start.front && sim.belts.start.front.s >= sim.belts.start.len - 1e-6;
      (ready ? D.litCyl : D.cyl).cyl(hx + 0.59, y - 0.5, zt + 0.05, zt + 0.25, 0.06, ready ? '#22c55e' : '#334155');
    }
    zoneScreen(z) { return WS.ZoneRenderer.prototype.zoneScreen.call(this, z); }
    zoneLive(z) {
      const sim = this.sim, g = sim.grid, py = g.LB + g.SD, sx = z.pick.x + 1.15, sy = py + 0.7, D = this.dy;
      D.lit.box(sx - 0.26, sy + 0.04, 3.4, sx + 0.26, sy + 0.05, 4.5, '#0b1220');
      this.screen('zone' + z.id, sx - 0.255, sx + 0.255, sy + 0.053, 3.42, 4.48, this.zoneScreen(z));
      if (z.port.away) return;
      let x = z.pick.x, y = py + 0.95, u = 0;
      const j = z.job;
      if (j && j.cur && (j.cur.bin || z.kind === 'carousel')) {
        const c = sim.cfg, tot = z.kind === 'ptl' ? c.ptlLine + c.ptlUnit * j.cur.qty : c.carouselLine + c.carouselUnit * j.cur.qty, f = 1 - j.t / tot;
        u = f < 0.5 ? Math.min(1, f / 0.2) : Math.max(0, 1 - (f - 0.5) / 0.2);
        if (z.kind === 'ptl') x = z.pick.x + (j.cur.bin.wx - z.pick.x) * u;
        else { const cr = z.carousels[j.cur.car]; x = z.pick.x + (cr.x - z.pick.x) * 0.7 * u; y += 0.35 * u; }
      }
      // facing the rack or the carousel (behind her) while she takes the units, the tote otherwise
      this.operator(x, y, u > 0.3 ? Math.PI : 0, !!(j && j.cur), 'station', 0, 'zone ' + z.id);
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
    // The carriers: one per product, hanging from the track and turned along
    // it, open to the outside; wire sides and back, six shelves with a
    // plastic bin each, as many of them holding the product as its stock
    // fills (the top one is picked from). The carrier at the pick face with the line to pick
    // lights its bin and the light tree its level.
    carouselLive(z) {
      const sim = this.sim, D = this.dy, j = z.job, cur = j && j.cur, pick = { kind: 'port', id: z.port.idx };
      const hw = (WS.ZONE_CARO_PITCH / sim.cfg.cellSize) / 2 - 0.025, dp = 0.29, wire = '#6b7280';
      const lit = z.carousels.map(() => -1);
      for (const b of z.bins) {
        const cr = z.carousels[b.caro], u = (b.shelf * WS.ZONE_CARO_PITCH - cr.pos) / sim.cfg.cellSize, p = sim.caroAt(cr, u), q = sim.caroAt(cr, u + 0.05), o = sim.caroAt(cr, u - 0.05);
        const a = Math.atan2(-(q.y - o.y), q.x - o.x), sy = Math.max(cr.y + cr.r, Math.min(cr.y + cr.r + cr.len, p.y));
        const out = Math.sign((p.x - cr.x) * Math.sin(a) + (p.y - sy) * Math.cos(a)) || 1, v = (x) => x * out;
        const box = (u0, v0, z0, u1, v1, z1, c) => D.box.rbox(p.x, p.y, a, u0, Math.min(v(v0), v(v1)), z0, u1, Math.max(v(v0), v(v1)), z1, c, pick);
        // frame: hanger up to the track, top, sides and back of wire mesh
        box(-0.03, -0.03, CTOP, 0.03, 0.03, CRAIL, '#475569');
        for (const e of [-hw, hw - 0.04]) { box(e, -dp, CTOP - 0.05, e + 0.04, dp, CTOP, wire); box(e, dp - 0.04, 0.3, e + 0.04, dp, CTOP, wire); box(e, -dp, 0.3, e + 0.04, -dp + 0.04, CTOP, wire); box(e + 0.015, -dp, 0.3, e + 0.025, dp, CTOP, '#3f4652'); }
        box(-hw, -0.03, CTOP - 0.05, hw, 0.03, CTOP, wire);
        box(-hw, -dp, 0.3, hw, -dp + 0.02, CTOP, '#2f3540');
        const qf = b.comps[0].qty / b.cap, n = b.comps[0].qty > 0 ? Math.max(1, Math.ceil(qf * CL)) : 0, on = cur && cur.bin === b;
        for (let l = 0; l < CL; l++) {
          const zl = CLZ(l);
          box(-hw, -dp, zl - 0.04, hw, dp, zl, wire);
          // a bin on every shelf: the product's colour while it holds stock, grey once empty
          const c = l < n ? prodCol(b.comps[0].gtin, 52 + (l % 2) * 6) : '#3b4252', top = on && l === n - 1;
          box(-hw + 0.04, -dp + 0.04, zl, hw - 0.04, dp - 0.02, zl + 0.36, c);
          (top ? D.lit : D.box).rbox(p.x, p.y, a, -hw + 0.08, Math.min(v(dp - 0.02), v(dp + 0.005)), zl + 0.08, hw - 0.08, Math.max(v(dp - 0.02), v(dp + 0.005)), zl + (l < n ? 0.3 : 0.14), top ? '#4ade80' : prodCol(b.comps[0].gtin, l < n ? 74 : 40), pick);
        }
        if (on) lit[b.caro] = Math.max(0, n - 1);
      }
      // the light trees: a light per level, the one to pick from lit, the quantity on top
      z.carousels.forEach((cr, k) => {
        const out = cr.x < z.pick.x ? -1 : 1, tx = cr.x + out * (cr.r + 0.42), ty = cr.y - 0.15;
        for (let l = 0; l < CL; l++) (lit[k] === l ? D.litCyl : D.cyl).cyl(tx, ty - 0.06, CLZ(l) + 0.1, CLZ(l) + 0.32, 0.07, lit[k] === l ? '#4ade80' : '#14532d');
        if (lit[k] >= 0) D.lit.box(tx - 0.12, ty - 0.125, CTOP + 0.7, tx + 0.12, ty - 0.12, CTOP + 0.95, '#ef4444');
        // the carousel turning: an amber beacon on the drive
        if (cr.target != null && Math.abs(sim.ringDelta(cr, cr.target)) > 1e-6) D.litCyl.cyl(cr.x, cr.y + cr.r + cr.len, CRAIL + 0.95, CRAIL + 1.15, 0.08, '#f59e0b');
      });
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
        this.operator(x, y, -pk.heading - Math.PI / 2, pk.state === 'WORKING', 'picker', 0, 'rf ' + pk.name);
        if (!pk.job) continue;
        // the cart with a tote per order of the batch
        const cx = x + 0.45, cy = y - 0.1, n = pk.job.totes.length - pk.job.put;
        D.box.box(cx - 0.3, cy - 0.35, 0.3, cx + 0.3, cy + 0.35, 0.4, '#64748b');
        for (const [ox, oy] of [[-0.25, -0.3], [0.25, -0.3], [-0.25, 0.3], [0.25, 0.3]]) D.cyl.cyl(cx + ox, cy + oy, 0, 0.3, 0.05, '#0b0f17');
        for (let k = 0; k < Math.min(n, 8); k++) { const tx = cx - 0.15 + (k % 2) * 0.3, ty = cy - 0.18 + (Math.floor(k / 2) % 2) * 0.36, tz = 0.4 + Math.floor(k / 4) * 0.7; this.tote(D.box, tx - 0.13, ty - 0.17, tx + 0.13, ty + 0.17, tz, 0.6, TOTE.rf); }
      }
    }
    mergeGeo() { return WS.ZoneRenderer.prototype.mergeGeo.call(this); }
    mergeTarget() { return WS.ZoneRenderer.prototype.mergeTarget.call(this); }
    mergePos(t) { return WS.ZoneRenderer.prototype.mergePos.call(this, t); }
    rfPos(k) { return WS.ZoneRenderer.prototype.rfPos.call(this, k); }
    mergeLight(t) { return WS.ZoneRenderer.prototype.mergeLight.call(this, t); }
    mergeScreen() { return WS.ZoneRenderer.prototype.mergeScreen.call(this); }
    mergeLift() { return WS.ZoneRenderer.prototype.mergeLift.call(this); }
    // The order totes in their lanes with their lights, the one being merged
    // at the merge position, the complete ones on the outlet; the RF totes in
    // their lane, the one the operator lifts over the order tote and tips,
    // the stack of empties; the operator turning between them.
    mergeLive() {
      const sim = this.sim, g = sim.grid, m = sim.merge, D = this.dy, G = this.mergeGeo(), j = m.job, lift = this.mergeLift();
      for (const t of m.totes) {
        const q = this.mergePos(t);
        this.zoneTote(D, t, q.x, q.y, q.z, q.alongX);
        if (t.lane >= 0) D.lit.box(q.x - 0.12, G.y1 + 0.07, q.z - 0.34, q.x + 0.12, G.y1 + 0.08, q.z - 0.12, this.mergeLight(t));
      }
      m.rf.forEach((t, k) => { if (lift && t === j.rf) return; const q = this.rfPos(k); this.zoneTote(D, t, q.x, q.y, q.z, true); });
      if (lift) {
        this.zoneTote(D, j.rf, lift.x, lift.y, lift.z, true);
        if (lift.phase === 'tip') for (let k = 0; k < 5; k++) {
          const u = (lift.u * 3 + k * 0.2) % 1, l = j.rf.lines[k % Math.max(1, j.rf.lines.length)];
          D.box.box(lift.x - 0.25 + k * 0.11, lift.y - 0.05, lift.z + 0.2 - u * 1.2, lift.x - 0.15 + k * 0.11, lift.y + 0.05, lift.z + 0.35 - u * 1.2, l ? prodCol(l.gtin) : '#e2e8f0');
        }
      }
      for (let k = 0; k < Math.min(5, sim.recycling.length); k++) this.tote(D.box, G.stack.x - 0.38, G.stack.y - 0.26, G.stack.x + 0.38, G.stack.y + 0.26, 0.15 + k * 0.95, 0.9, TOTE.rf);
      // the screen
      D.lit.box(G.px + 0.62, g.LT + 0.6, 3.37, G.px + 1.28, g.LT + 0.61, 4.43, '#0b1220');
      this.screen('merge', G.px + 0.625, G.px + 1.275, g.LT + 0.613, 3.38, 4.42, this.mergeScreen());
      if (sim.mergePort.away) return;
      // facing the line, or turned to the RF tote (and the dolly) while lifting it
      let a = 0;
      if (lift && (lift.phase === 'lift' && lift.f < 0.15 || lift.phase === 'away' && j.into)) { const q = lift.phase === 'lift' ? this.rfPos(Math.max(0, m.rf.indexOf(j.rf))) : G.stack; a = -Math.atan2(q.y - G.opy, q.x - G.px) - Math.PI / 2; }
      this.operator(G.px, G.opy, a, !!j, 'station', 0, 'merge');
    }
    closingLive() {
      const sim = this.sim, g = sim.grid, D = this.dy, y = g.LT;
      for (const m of sim.machines) {
        if (m.down) D.litCyl.cyl(m.x, y, CZ + 3.1, CZ + 3.4, 0.09, '#ef4444');
        else (m.tote ? D.litCyl : D.cyl).cyl(m.x, y, CZ + 3.0, CZ + 3.25, 0.08, m.tote ? '#22c55e' : '#14532d');
      }
      const m0 = sim.machines[0];
      if (!sim.checkPort.away) this.operator(m0.x - 0.9, y - 2.4, 0, !!sim.checkStation.tote, 'station', 0, 'check');
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
      const sim = this.sim, g = sim.grid, D = this.dy, sx = g.OSX, sy = g.AY, h = Math.min(18, Math.ceil(sim.oms.freeTotes.length / 40));
      for (let k = 0; k < h; k++) D.box.box(sx - 0.3, sy - 0.4, TZ + k * 0.28, sx + 0.3, sy + 0.4, TZ + k * 0.28 + 0.26, k % 2 ? '#1d4ed8' : '#2563eb');
      if (sim.startT > sim.cfg.startTime - 1) D.litCyl.cyl(sx - 1.1, sy - 0.42, TZ + 1.4, TZ + 1.6, 0.06, '#38bdf8');
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
      if (s.tote) { const t = s.tote; if (t.x == null) return null; return [t.x - 0.45, t.y - 0.45, t.x + 0.45, t.y + 0.45, (t.belt ? this.beltZ(t.belt, t.s) : CZ) + 1.05]; }
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
      return { x: t.px + (t.x - t.px) * alpha, y: t.py + (t.y - t.py) * alpha, z: this.beltZ(t.belt, t.s) };
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
          return at(g.OSX, g.AY, TZ, `Waiting for order start${ahead ? `: ${ahead} order${ahead > 1 ? 's' : ''} go first` : ''}. Its van (${o.route.name}) leaves at ${U.fmtClock(o.due).slice(-8, -3)}`, 0);
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
          const mt = sim.merge.totes.find((t) => t.order === o), q = mt ? this.mergePos(mt) : { x: g.RX + 5, y: g.LT };
          return at(q.x, q.y, CZ, sim.merge.job && sim.merge.job.o === o ? 'The merge operator tips the RF tote into the order tote' : rf ? 'At the merge, waiting for its RF tote on the belt' : 'At the merge, waiting for its other totes', 3);
        }
        case 'PACKING': {
          const t = onBelt[0];
          if (t) { const m = sim.machines.find((mm) => mm.tote === t); return at(t.x, t.y, CZ, m ? `${m.name}${m.id === 'scale' ? ': weighing' : m.id === 'docs' ? ': the documents go in' : m.id === 'lid' ? ': the lid goes on' : ': the SSCC label goes on'}` : t.failed || t.belt === sim.belts.check ? 'Off weight: to the manual check' : `On the ${t.belt.name.startsWith('sorter') || t.belt.name === 'to sorter' ? 'shipping sorter to its lane' : 'closing line'}`, 4); }
          const mt = sim.merge.totes.find((t) => t.order === o), q = mt ? this.mergePos(mt) : { x: g.RX + 5, y: g.LT };
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
      this.label(`MERGE · ${sim.merge.totes.length}`, g.RX + 5.2, g.LT - 2.2, 5.9, { size: 10, bg, color: '#c4b5fd' });
      this.label('RF SHELVING', g.RFX + 1.5 * g.na, g.RFY + 0.2, 6.5, { size: 10, bg, color: '#fde68a' });
      const nb = sim.store.moving.filter((m) => m.full).length;
      this.label(`SHUTTLE STORE · ${nb} bin${nb === 1 ? '' : 's'} on the way`, g.CX0 + 3, g.CY0 + 0.2, STOREZ(sim.cfg.storeLevels) + 1, { size: 10, bg, color: '#5eead4' });
      this.label('ZONE REPLENISHMENT', g.ZEND + 0.8, g.ZY, CZ + 1.5, { size: 9, bg, color: '#5eead4' });
      this.label('ORDER START', g.OSX, g.AY + 1.2, 1, { size: 10, bg, color: '#86efac' });
      if (this.cam.dist > 45 && !this.cam.walk) return;
      for (const lane of sim.lanes) { const r = lane.route; this.label(`${r.name} · ${lane.stack.length}`, g.SX + 3, lane.y + 0.9, 1, { size: 9, bg, color: r.color }); }
    }
  }

  WS.ZoneRenderer3D = ZoneRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
