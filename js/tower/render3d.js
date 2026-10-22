/* FloorStack in the free 3D view: the whole building at its true heights.
 * RailRunner's 3D view (WS.ShuttleRenderer3D) draws the racking, shuttles
 * and aisle lifts, lifted onto the first floor (View3D.zLift); the shared
 * stations and packing are drawn on their floors the same way. This adds
 * the building (slabs with their painted floors and the openings the links
 * pass through, columns, a facade per storey that drops to a guard rail on
 * the camera's side, the dock doors and the yard), the belts of every floor,
 * the spiral conveyors winding through the slabs, the tote lifts, the
 * sorter with its chutes and roll cages, the trucks, the goods lift and
 * stairs, the canteen and the people walking between them. The Floors
 * slider hides the floors above one, or shows one alone (View3D.skip). */
(function (WS) {
  'use strict';
  const LZ = WS.View3D.LZ, R = WS.TOWER_R, RP = WS.TOWER_RP, TOTE_H = WS.RACK_TOTE_H;
  const CARRIER_COL = { PCL: '#0ea5e9', EXP: '#ef4444', ECO: '#22c55e' };
  const CYAN = '#0891b2', STEEL = '#64748b', DARK = '#1f2937', YELLOW = '#facc15', CONCRETE = '#5b6676';
  const YARD = -1.2; // the yard outside is lower: the trucks' beds are at the ground floor's level
  const STEPS = ['Released', 'Stock', 'Pick', 'Pack', 'Sorter', 'Truck'];
  const ease = (u) => u * u * (3 - 2 * u);

  class TowerRenderer3D extends WS.ShuttleRenderer3D {
    get FZ() { return this.sim.grid.FZ; }
    get followSteps() { return STEPS; }
    shown(f) { const o = this.opts, t = o.floorTop; return t == null || (o.cutOnly ? f === t : f <= t); }
    // what is drawn next stands on floor f
    onFloor(f) { this.zLift = this.FZ[f]; this.skip = !this.shown(f); }
    offFloor() { this.zLift = 0; this.skip = false; }
    buildKey() { return [super.buildKey(), this.opts.floorTop, this.opts.cutOnly, this.sim.cfg.linkType, this.sim.cfg.pickPorts, this.sim.cfg.aisles].join('|'); }
    bounds() { const g = this.sim.grid; return { x0: g.bx0 - 17, y0: g.by0 - 18, x1: g.bx1 + 2, y1: g.by1 + 2 }; }
    fit() {
      const g = this.sim.grid, c = this.cam;
      // into the building from the south, where its wall is cut away: all three floors one above the other
      Object.assign(c, { walk: false, follow: null, tx: (g.bx0 + g.bx1) / 2 + 1, ty: (g.by0 + g.by1) / 2 + 2, tz: this.FZ[1] + 3, yaw: 0.38, pitch: 0.26 });
      c.dist = (g.bx1 - g.bx0) * 1.3 / Math.min(1, this.w / this.h);
      this.syncWalkButton();
    }
    placeSun() {
      super.placeSun();
      const g = this.sim.grid, cx = (g.bx0 + g.bx1) / 2, cy = (g.by0 + g.by1) / 2, r = Math.hypot(g.bx1 - g.bx0, g.by1 - g.by0) / 2 + 20;
      this.sun.position.set(cx - r * 0.5, r * 1.5, cy + r * 0.8); this.sun.target.position.set(cx, 0, cy);
      const sc = this.sun.shadow.camera; sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.far = r * 5; sc.updateProjectionMatrix();
    }

    // ---------------------------------------------------------------- static
    buildStatic() {
      this.onFloor(1);
      super.buildStatic(); // the ground, the stations (buildStations), the racking, rails and aisle lift towers
      const S = this.st;
      for (const f of [0, 1, 2]) { this.onFloor(f); this.floorStatic(S, f); }
      this.offFloor();
      this.linksStatic(S);
      if (this.ground) { this.ground.position.y = YARD * LZ; this.ground.material.color.set(this.dark ? '#0b0f17' : '#202a38'); }
    }
    // Stations and packing, each on its floor (WS.View3D.buildStations draws them on the ground).
    buildStations(S) {
      const keep = [this.zLift, this.skip], sim = this.sim, L = sim.layout, oms = sim.oms, CZ = this.CZ, g = sim.grid;
      this.onFloor(2);
      const lastPk = L.packerPos(oms.packers.length - 1);
      this.conveyor(S, [{ x: 1.2, y: L.takeawayY }, { x: lastPk.x, y: L.takeawayY }], 0.5, 1.6);
      for (const pk of oms.packers) { const q = L.packerPos(pk.idx); this.conveyor(S, [{ x: q.x, y: L.takeawayY + 0.25 }, { x: q.x, y: q.y - 0.75 }], 0.45, 1.6); }
      for (const pk of oms.packers) this.conveyor(S, L.parcelRoute(pk.idx).slice(0, 2), 0.45, 1.4, '#2b3646');
      const r0 = L.parcelRoute(0);
      this.conveyor(S, [{ x: L.packerPos(0).x, y: r0[1].y }, r0[2], r0[3], r0[4]], 0.45, 1.4, '#2b3646');
      for (const p of sim.ports) {
        this.onFloor(p.floor);
        const pick = { kind: 'port', id: p.idx }, op = L.operatorPos(p);
        this.portBody(S, p);
        S.box.box(op.x - 0.55, op.y - 0.45, 0, op.x + 0.55, op.y + 0.45, 0.04, '#10161f');
        if (p.kind === 'PICK') {
          const y = L.backLaneY(p);
          this.conveyor(S, [{ x: L.backLaneX(p), y }, { x: L.spurX(p), y }, { x: L.spurX(p), y: L.takeawayY - 0.25 }], 0.45, 1.6);
          const s0 = L.slotPos(p, 0), wx0 = s0.x - 0.3, wx1 = L.slotPos(p, p.slots.length - 1).x + 0.34, wy0 = s0.y - 0.35, wy1 = s0.y + 0.35;
          S.box.box(wx0, wy0, 0, wx1, wy1, CZ - 0.1, '#334155', pick);
          for (const xx of [wx0, wx1 - 0.08]) S.box.box(xx, wy0, CZ, xx + 0.08, wy0 + 0.08, 4.6, '#64748b');
          S.box.box(wx0, wy0, 4.5, wx1, wy0 + 0.1, 4.7, '#64748b');
          this.crossover(S, op.x, g.D);
        }
      }
      this.onFloor(2);
      for (const pk of oms.packers) {
        const q = L.packerPos(pk.idx), pick = { kind: 'packer', id: pk.idx }, op = L.packerOperator(pk);
        S.box.box(op.x - 0.55, op.y - 0.45, 0, op.x + 0.55, op.y + 0.45, 0.04, '#10161f');
        if (pk.kind === 'bagger') { this.baggerBody(S, q, pick); continue; }
        if (pk.kind === 'boxer') { this.boxMakerBody(S, q, pick); continue; }
        for (const [lx, ly] of [[-0.95, -0.5], [0.87, -0.5], [-0.95, 0.42], [0.87, 0.42]]) S.box.box(q.x + lx, q.y + ly, 0, q.x + lx + 0.08, q.y + ly + 0.08, 1.9, '#64748b');
        S.box.box(q.x - 0.95, q.y - 0.5, 0.45, q.x + 0.95, q.y + 0.5, 0.55, '#475569');
        for (let k = 0; k < 4; k++) S.box.box(q.x - 0.85, q.y - 0.4, 0.55 + k * 0.12, q.x + 0.1, q.y + 0.4, 0.65 + k * 0.12, k % 2 ? '#cfa271' : '#b8875a');
        S.box.box(q.x - 1.0, q.y - 0.55, 1.9, q.x + 1.0, q.y + 0.55, 2.1, '#e7dccb', pick);
        S.box.box(q.x - 0.85, q.y - 0.5, 2.1, q.x - 0.79, q.y - 0.44, 3.6, '#475569');
        S.box.box(q.x - 0.98, q.y - 0.52, 3.3, q.x - 0.5, q.y - 0.44, 4.3, '#0f172a', pick);
        S.box.box(q.x + 0.5, q.y - 0.45, 2.1, q.x + 0.92, q.y - 0.08, 2.75, '#e2e8f0');
        S.box.box(q.x + 0.55, q.y + 0.15, 2.1, q.x + 0.85, q.y + 0.35, 2.4, '#dc2626');
      }
      [this.zLift, this.skip] = keep;
    }
    // steps over the takeaway conveyor behind a picker, with handrails
    crossover(S, x, D) {
      const y0 = D + 2.55, y1 = D + 3.85, zt = 2.6, w = 0.32;
      for (let k = 0; k < 3; k++) {
        const z = ((k + 1) * zt) / 3;
        S.box.box(x - w, y0 + k * 0.12, z - 0.12, x + w, y0 + (k + 1) * 0.12 + 0.02, z, '#94a3b8');
        S.box.box(x - w, y1 - (k + 1) * 0.12 - 0.02, z - 0.12, x + w, y1 - k * 0.12, z, '#94a3b8');
      }
      S.box.box(x - w, y0 + 0.36, zt - 0.12, x + w, y1 - 0.36, zt, '#94a3b8');
      for (const s of [-1, 1]) {
        const xx = x + s * (w + 0.02);
        S.box.box(xx - 0.02, y0, 0, xx + 0.02, y0 + 0.04, 1.0, '#64748b'); S.box.box(xx - 0.02, y1 - 0.04, 0, xx + 0.02, y1, 1.0, '#64748b');
        S.cyl.beam(xx, y0, 2.0, xx, y0 + 0.36, zt + 2.0, 0.04, 0.04, YELLOW); S.cyl.beam(xx, y0 + 0.36, zt + 2.0, xx, y1 - 0.36, zt + 2.0, 0.04, 0.04, YELLOW); S.cyl.beam(xx, y1 - 0.36, zt + 2.0, xx, y1, 2.0, 0.04, 0.04, YELLOW);
        for (const yy of [y0 + 0.36, y1 - 0.36]) S.box.box(xx - 0.02, yy - 0.02, zt, xx + 0.02, yy + 0.02, zt + 2.0, YELLOW);
      }
    }

    // A floor's own parts: its belts, and what stands there.
    floorStatic(S, f) {
      const sim = this.sim, g = sim.grid;
      for (const b of sim.net.belts) if (b.floor === f && !b.sloped) this.beltLine(S, b.pts, 0.72, b.z);
      this.coreStatic(S, f);
      if (f === 0) { this.sorterStatic(S); this.canteenStatic(S); this.receivingStatic(S); this.palletRacking(S); this.forklift(S, 9, 13.5, 0); }
      if (f === 1) { this.workshopStatic(S); this.spareTotes(S); }
      if (f === 2) { this.controlRoom(S); this.supplies(S); }
      void g;
    }
    // The sorter: the loop high on portal frames, a pop-up diverter and a
    // stainless chute down to a roll cage at every exit.
    sorterStatic(S) {
      const sim = this.sim, g = sim.grid, d = sim.docks, SZ = g.SZ, pick = { kind: 'link', id: 'sorter' };
      for (const b of sim.pnet.belts) {
        if (b.sloped) continue;
        for (let k = 1; k < b.pts.length; k++) {
          const a = b.pts[k - 1], c = b.pts[k], hw = 0.34, x0 = Math.min(a.x, c.x) - hw, x1 = Math.max(a.x, c.x) + hw, y0 = Math.min(a.y, c.y) - hw, y1 = Math.max(a.y, c.y) + hw, along = a.x !== c.x;
          S.box.box(x0, y0, SZ - 0.45, x1, y1, SZ - 0.1, '#334155', pick);
          S.box.box(x0, y0, SZ - 0.1, x1, y1, SZ - 0.04, '#1e293b', pick);
          for (const e of along ? [y0, y1 - 0.05] : [x0, x1 - 0.05]) { if (along) S.box.box(x0, e, SZ - 0.1, x1, e + 0.05, SZ + 0.25, '#94a3b8'); else S.box.box(e, y0, SZ - 0.1, e + 0.05, y1, SZ + 0.25, '#94a3b8'); }
          const len = along ? x1 - x0 : y1 - y0;
          for (let s = 0.6; s < len; s += 3) {
            const px = along ? x0 + s : (x0 + x1) / 2, py = along ? (y0 + y1) / 2 : y0 + s;
            for (const o of [-0.28, 0.28]) { const lx = along ? px : px + o, ly = along ? py + o : py; S.box.box(lx - 0.05, ly - 0.05, 0, lx + 0.05, ly + 0.05, SZ - 0.45, STEEL); }
            if (along) S.box.box(px - 0.05, py - 0.34, SZ - 0.8, px + 0.05, py + 0.34, SZ - 0.7, STEEL); else S.box.box(px - 0.34, py - 0.05, SZ - 0.8, px + 0.34, py + 0.05, SZ - 0.7, STEEL);
          }
        }
      }
      for (const ch of d.chutes) {
        const p = ch.belt.pts, x = ch.x, w = 0.38, cp = { kind: 'chute', id: ch.idx };
        S.box.box(x - 0.3, g.sortY - 0.22, SZ - 0.06, x + 0.3, g.sortY + 0.22, SZ - 0.02, '#475569', cp); // the pop-up wheel diverter
        for (let k = 0; k < 4; k++) S.cyl.cylX(x - 0.26, x + 0.26, g.sortY - 0.15 + k * 0.1, SZ - 0.02, 0.03, '#94a3b8');
        for (let k = 1; k < p.length; k++) {
          const a = p[k - 1], b = p[k];
          S.box.slab(x - w, x + w, a.y, a.z - 0.05, b.y, b.z - 0.05, 0.04, '#cbd5e1', cp);
          for (const s of [-1, 1]) S.box.slab(x + s * w - 0.025, x + s * w + 0.025, a.y, a.z + 0.2, b.y, b.z + 0.2, 0.5, '#94a3b8');
        }
        S.box.box(x - 0.05, p[1].y - 0.05, 0, x + 0.05, p[1].y + 0.05, p[1].z, STEEL);
        S.box.box(x - 0.04, p[2].y - 0.04, 0, x + 0.04, p[2].y + 0.04, p[2].z, STEEL);
        S.box.box(x + w + 0.05, p[1].y - 0.05, p[1].z + 0.2, x + w + 0.15, p[1].y + 0.05, p[1].z + 0.6, '#0f172a'); // the chute's light
      }
    }
    // Inbound: the staging lanes inside the west doors.
    receivingStatic(S) {
      for (const s of this.sim.docks.staging) {
        for (const [y0, y1] of [[s.y - 0.8, s.y - 0.76], [s.y + 0.76, s.y + 0.8]]) S.box.box(s.x - 0.25, y0, 0, s.x + 1.45, y1, 0.01, '#65a30d');
      }
    }
    // The canteen: a counter with a coffee machine, a vending machine, tables and chairs, plants.
    canteenStatic(S) {
      const sim = this.sim, g = sim.grid, C = g.canteen, pick = { kind: 'canteen', id: 0 };
      S.box.box(C.x0 + 0.2, C.y0 + 0.5, 0, C.x0 + 1.0, C.y1 - 0.5, 1.95, '#e2e8f0', pick);
      S.box.box(C.x0 + 0.15, C.y0 + 0.45, 1.95, C.x0 + 1.05, C.y1 - 0.45, 2.05, '#a16207');
      S.box.box(C.x0 + 0.3, C.y0 + 0.8, 2.05, C.x0 + 0.85, C.y0 + 1.3, 3.1, '#1f2937', pick);
      S.box.box(C.x0 + 0.3, C.y0 + 1.6, 2.05, C.x0 + 0.85, C.y0 + 2.0, 2.6, '#cbd5e1');
      S.box.box(C.x0 + 0.2, C.y1 - 1.6, 0, C.x0 + 1.0, C.y1 - 0.6, 4.6, '#7f1d1d', pick); // vending machine
      for (const s of sim.people.seats) {
        // a chair: seat, back away from the table, legs
        const back = s.y < s.ty ? -1 : 1, h = 0.15;
        S.box.box(s.x - h, s.y - h, 0.82, s.x + h, s.y + h, 0.9, '#334155', pick);
        S.box.box(s.x - h, s.y + back * (h - 0.02) - 0.02, 0.9, s.x + h, s.y + back * (h - 0.02) + 0.02, 1.8, '#334155');
        for (const [lx, ly] of [[-h + 0.01, -h + 0.01], [h - 0.03, -h + 0.01], [-h + 0.01, h - 0.03], [h - 0.03, h - 0.03]]) S.box.box(s.x + lx, s.y + ly, 0, s.x + lx + 0.02, s.y + ly + 0.02, 0.82, '#94a3b8');
      }
      const tables = new Set();
      for (const s of sim.people.seats) {
        const k = s.tx + ',' + s.ty;
        if (tables.has(k)) continue;
        tables.add(k);
        S.box.box(s.tx - 0.42, s.ty - 0.3, 1.42, s.tx + 0.42, s.ty + 0.3, 1.5, '#e7dccb', pick);
        S.cyl.cyl(s.tx, s.ty, 0, 1.42, 0.04, '#475569'); S.cyl.cyl(s.tx, s.ty, 0, 0.04, 0.2, '#475569');
        S.box.box(s.tx - 0.1, s.ty - 0.06, 1.5, s.tx - 0.02, s.ty + 0.02, 1.62, '#f8fafc'); // a mug
      }
      for (const [px, py] of [[C.x1 - 0.6, C.y0 + 0.6], [C.x1 - 0.6, C.y1 - 0.6]]) { S.cyl.cyl(px, py, 0, 0.9, 0.25, '#78350f'); S.dome.box(px - 0.45, py - 0.45, 0.9, px + 0.45, py + 0.45, 2.6, '#15803d'); }
    }
    // the technicians' corner on the first floor: a bench, a tool cabinet and a spare shuttle on a trolley
    workshopStatic(S) {
      const g = this.sim.grid, x = g.W + 4, y = g.D + 4;
      S.box.box(x, y, 1.8, x + 2.6, y + 1, 1.95, '#a16207');
      for (const [lx, ly] of [[0.05, 0.05], [2.45, 0.05], [0.05, 0.85], [2.45, 0.85]]) S.box.box(x + lx, y + ly, 0, x + lx + 0.08, y + ly + 0.08, 1.8, '#475569');
      S.box.box(x + 0.2, y + 0.15, 1.95, x + 0.9, y + 0.8, 2.35, '#f97316');
      S.box.box(x + 1.2, y + 0.15, 1.95, x + 1.6, y + 0.45, 2.15, '#334155');
      S.box.box(x - 1.3, y, 0, x - 0.3, y + 0.8, 4.2, '#b91c1c'); // tool cabinet
      for (let k = 0; k < 5; k++) S.box.box(x - 1.28, y + 0.8, 0.5 + k * 0.7, x - 0.32, y + 0.82, 1.0 + k * 0.7, '#7f1d1d');
      S.box.box(x + 3.2, y - 0.2, 0.25, x + 4.6, y + 1.2, 0.35, '#334155');
      for (const [lx, ly] of [[0.1, -0.1], [1.3, -0.1], [0.1, 1.1], [1.3, 1.1]]) S.cyl.cyl(x + 3.2 + lx, y + ly, 0, 0.25, 0.08, '#0b0f17');
      S.box.box(x + 3.3, y, 0.35, x + 4.5, y + 0.25, 0.75, '#f97316'); S.box.box(x + 3.3, y + 0.75, 0.35, x + 4.5, y + 1.0, 0.75, '#f97316');
      S.box.box(x + 3.4, y + 0.25, 0.35, x + 4.4, y + 0.75, 0.45, DARK);
    }

    // ---------------------------------------------------------------- what else is on the floors
    // Upstairs, above the store: a glass control room with desks and a wall
    // of screens, the supervisors at work in it.
    controlRoom(S) {
      const x0 = 2, x1 = 12, y0 = 2, y1 = 8, H = 5.2, pick = { kind: 'control', id: 0 };
      S.box.box(x0, y0, 0, x1, y1, 0.03, '#1e293b', pick);
      for (const [a, b, c, d] of [[x0, y0, x1, y0 + 0.06], [x0, y0, x0 + 0.06, y1], [x1 - 0.06, y0, x1, y1], [x0, y1 - 0.06, x0 + 4, y1], [x0 + 5.4, y1 - 0.06, x1, y1]]) { this.st.glass.box(a, b, 0.05, c, d, H, '#9cc9f0'); S.box.box(a, b, H, c, d, H + 0.15, '#475569'); S.box.box(a, b, 0, c, d, 0.25, '#475569'); }
      for (let x = x0; x <= x1; x += 2) for (const y of [y0, y1]) S.box.box(x - 0.04, y - 0.04, 0, x + 0.04, y + 0.04, H, '#475569');
      for (let k = 0; k < 3; k++) S.box.box(x0 + 0.9 + k * 2.9, y0 + 0.15, 1.2, x0 + 3.5 + k * 2.9, y0 + 0.3, 5.0, '#0f172a', pick); // the screen wall
      for (const dy of [3.3, 5.6]) {
        S.box.box(x0 + 1, y0 + dy - 0.3, 1.4, x1 - 1, y0 + dy + 0.3, 1.5, '#cbd5e1', pick);
        for (let x = x0 + 1.2; x < x1 - 1; x += 1.6) {
          S.box.box(x - 0.02, y0 + dy - 0.28, 0, x + 0.02, y0 + dy - 0.24, 1.4, '#64748b');
          S.box.box(x + 0.2, y0 + dy - 0.2, 1.5, x + 0.9, y0 + dy - 0.17, 2.3, '#0f172a');
          this.st.lit.box(x + 0.24, y0 + dy - 0.165, 1.58, x + 0.86, y0 + dy - 0.16, 2.24, (x * 13) % 3 < 1 ? '#0c4a6e' : '#14532d');
          S.box.box(x + 0.3, y0 + dy + 0.45, 0.82, x + 0.6, y0 + dy + 0.75, 0.9, '#334155'); // a chair
        }
      }
    }
    // packaging supplies on shelving, and spare order totes stacked on dollies
    supplies(S) {
      for (let r = 0; r < 2; r++) {
        const y = 3.5 + r * 2.2;
        for (let x = 16; x <= 30; x += 2.8) {
          for (const xx of [x, x + 2.6]) for (const yy of [y, y + 0.9]) S.box.box(xx, yy, 0, xx + 0.06, yy + 0.06, 5.6, '#2563eb');
          for (let l = 0; l < 4; l++) {
            const z = 0.3 + l * 1.4;
            S.box.box(x, y, z, x + 2.66, y + 0.96, z + 0.08, '#f59e0b');
            for (let k = 0; k < 3; k++) S.box.box(x + 0.15 + k * 0.82, y + 0.12, z + 0.08, x + 0.85 + k * 0.82, y + 0.84, z + 0.2 + ((x * 7 + l * 3 + k) % 4) * 0.22, (k + l) % 2 ? '#c9a274' : '#b8875a');
          }
        }
      }
      for (let k = 0; k < 8; k++) {
        const x = 17 + (k % 4) * 1.2, y = 13 + Math.floor(k / 4) * 1.4;
        S.box.box(x - 0.3, y - 0.36, 0.1, x + 0.3, y + 0.36, 0.28, '#475569');
        const n = 6 + (k * 5) % 6;
        for (let j = 0; j < n; j++) S.box.box(x - 0.22, y - 0.28, 0.28 + j * 0.17, x + 0.22, y + 0.28, 0.42 + j * 0.17, j % 2 ? '#1d4ed8' : '#2563eb');
      }
    }
    // On the ground floor: pallet racking for packaging and spare stock, back to back.
    palletRacking(S) {
      const x0 = 13, x1 = 33, bay = 2.8, L = 3, LH = 2.6;
      for (const [y0, y1] of [[10, 11.3], [11.5, 12.8]]) {
        for (let x = x0; x <= x1 + 0.01; x += bay) for (const y of [y0, y1 - 0.08]) S.box.box(x, y, 0, x + 0.1, y + 0.08, L * LH + 0.4, '#1d4ed8');
        for (let l = 1; l <= L; l++) {
          const z = l * LH - 0.3;
          for (const y of [y0, y1 - 0.08]) S.box.box(x0, y, z, x1 + 0.1, y + 0.08, z + 0.25, '#f97316');
          for (let x = x0; x < x1; x += bay) {
            if ((x * 3 + l * 7 + y0) % 5 < 1) continue;
            this.palletDeck(S.box, x + bay / 2, (y0 + y1) / 2, z + 0.25);
            S.box.box(x + bay / 2 - 0.55, (y0 + y1) / 2 - 0.55, z + 0.65, x + bay / 2 + 0.55, (y0 + y1) / 2 + 0.55, z + 0.65 + 1.4 + ((x + l) % 3) * 0.3, (x + l) % 2 ? '#b8875a' : '#d2b48c');
          }
        }
      }
    }
    // a counterbalance forklift, parked: body, mast, forks, overhead guard, seat and wheels
    forklift(S, x, y, a) {
      const rb = (u0, v0, z0, u1, v1, z1, c) => S.box.rbox(x, y, a, u0, v0, z0, u1, v1, z1, c);
      rb(-0.42, -0.6, 0.35, 0.42, 0.7, 1.6, '#eab308'); rb(-0.42, 0.45, 1.6, 0.42, 0.75, 2.2, '#ca8a04'); // body and counterweight
      for (const [u, v] of [[-0.46, -0.4], [0.38, -0.4], [-0.46, 0.45], [0.38, 0.45]]) S.cyl.cylX(x + u, x + u + 0.08, y + v, 0.4, 0.2, '#0b0f17');
      rb(-0.3, -0.05, 1.6, 0.3, 0.3, 1.95, '#111827'); rb(-0.3, 0.25, 1.95, 0.3, 0.32, 2.7, '#111827'); // seat
      for (const u of [-0.4, 0.36]) { rb(u, -0.55, 1.6, u + 0.04, -0.5, 4.5, '#1f2937'); rb(u, 0.55, 1.6, u + 0.04, 0.6, 4.5, '#1f2937'); }
      rb(-0.42, -0.55, 4.45, 0.42, 0.6, 4.55, '#1f2937'); // overhead guard
      for (const u of [-0.32, 0.25]) rb(u, -0.72, 0.3, u + 0.07, -0.65, 5.0, '#334155'); // mast
      for (const u of [-0.3, 0.2]) rb(u, -1.6, 0.2, u + 0.1, -0.72, 0.3, '#475569'); // forks
      rb(-0.35, -0.75, 0.2, 0.35, -0.7, 1.2, '#475569');
    }
    // first floor: spare storage totes stacked on pallets
    spareTotes(S) {
      for (let k = 0; k < 6; k++) {
        const x = 3 + (k % 3) * 2.2, y = this.sim.grid.D + 3.5 + Math.floor(k / 3) * 2;
        this.palletDeck(S.box, x, y, 0);
        for (let j = 0; j < 4 + (k % 3); j++) for (const dx of [-0.42, 0.42]) S.box.box(x + dx - 0.38, y - 0.5, 0.4 + j * 0.85, x + dx + 0.38, y + 0.5, 1.2 + j * 0.85, j % 2 ? '#64748b' : '#7d8ca3');
      }
    }
    // the control room's wall of screens: the building's figures now
    controlScreen() {
      const sim = this.sim, k = sim.kpi, d = sim.docks, L = sim.links, r = (w) => Math.round(k.rate(w)), tag = WS.U.fmtClock(sim.time).slice(-8, -3);
      const models = [
        { title: 'Picking · 2nd floor', tag, accent: '#4ade80', big: `${r('lines')} lines/h`, name: `${r('shipped')} orders shipped/h`, info: [`${sim.oms.orders.filter((o) => o.status !== 'SHIPPED').length} orders open`], bar: Math.min(1, r('lines') / 1000) },
        { title: 'Between the floors', tag, accent: '#38bdf8', big: `${r('up')} up · ${r('down')} down`, name: `totes/h by ${L.up.vrc ? 'lift' : 'spiral'}`, info: [`tote lift ${Math.round(L.gi.vrc.utilization * 100)}% busy`] },
        { title: 'Dock · ground floor', tag, accent: '#c4b5fd', big: `${r('sorted')} sorted/h`, name: `${d.stats.trucks} trucks out`, info: d.doors.map((x) => `${x.carrier.code} ${x.truck ? x.truck.cages.length + '/' + sim.cfg.truckCages : '—'}`) },
      ];
      this.onFloor(2);
      models.forEach((m, j) => this.screen('ctl' + j, 3.0 + j * 2.9, 5.4 + j * 2.9, 2.31, 1.3, 4.9, m));
      // two supervisors at the desks
      const sup = this.supervisors || (this.supervisors = [{ id: -1, look: 'sup1', vest: '#38bdf8' }, { id: -2, look: 'sup2', vest: '#38bdf8' }]);
      this.walker(sup[0], 5.25, 2 + 3.3 + 0.6, 0, -Math.PI / 2, 0, 'sit');
      this.walker(sup[1], 8.45, 2 + 5.6 + 0.6, 0, -Math.PI / 2, 0, 'sit');
      this.offFloor();
    }

    // ---------------------------------------------------------------- the links between the floors
    linksStatic(S) {
      const sim = this.sim, L = sim.links, g = sim.grid;
      const show = (f0, f1) => [f0, f1].some((f) => this.shown(f));
      this.skip = !show(1, 2);
      if (L.up.sp) this.spiral(S, L.up.sp, g.up, R, '#334155', { kind: 'link', id: 'up' });
      if (L.down.sp) this.spiral(S, L.down.sp, g.down, R, '#334155', { kind: 'link', id: 'down' });
      this.skip = !show(0, 2);
      this.spiral(S, sim.docks.spiral, g.parcel, RP, '#3b3f55', { kind: 'link', id: 'parcel' });
      for (const m of sim.vrcs) { const f = m.stops.map((s) => s.floor); this.skip = !show(Math.min(...f), Math.max(...f)); this.vrcShaft(S, m); }
      this.skip = false;
    }
    // A spiral conveyor: a steel column, the slat belt winding round it on
    // arms, a guard on the outside, four posts round it, and a drive at the top.
    spiral(S, belt, c, r, col, pick) {
      const p = belt.pts, n = p.length, zb = Math.min(p[0].z, p[n - 1].z), zt = Math.max(p[0].z, p[n - 1].z), w = r < 1.8 ? 0.36 : 0.42;
      const floorBelow = this.FZ.filter((z) => z <= zb + 0.01).pop();
      S.cyl.cyl(c.cx, c.cy, floorBelow, zt + 1.2, 0.3, '#94a3b8', pick);
      S.cyl.cyl(c.cx, c.cy, floorBelow, floorBelow + 0.25, 0.7, '#334155');
      S.box.box(c.cx - 0.42, c.cy - 0.42, zt + 1.2, c.cx + 0.42, c.cy + 0.42, zt + 2.0, '#0e7490', pick); // drive
      for (let k = 1; k < n; k++) {
        const a = p[k - 1], b = p[k], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
        const ox = (mx - c.cx) / r, oy = (my - c.cy) / r;
        S.box.beam(a.x, a.y, a.z - 0.08, b.x, b.y, b.z - 0.08, 2 * w, 0.03, k % 2 ? col : '#3b4a60', pick);
        S.box.beam(a.x + ox * (w + 0.02), a.y + oy * (w + 0.02), a.z + 0.15, b.x + ox * (w + 0.02), b.y + oy * (w + 0.02), b.z + 0.15, 0.03, 0.12, '#94a3b8');
        S.box.beam(a.x + ox * (w + 0.02), a.y + oy * (w + 0.02), a.z + 0.55, b.x + ox * (w + 0.02), b.y + oy * (w + 0.02), b.z + 0.55, 0.035, 0.035, YELLOW);
        S.box.beam(a.x - ox * (w + 0.02), a.y - oy * (w + 0.02), a.z + 0.05, b.x - ox * (w + 0.02), b.y - oy * (w + 0.02), b.z + 0.05, 0.03, 0.08, '#94a3b8');
        if (k % 7 === 0) S.box.beam(c.cx + ox * 0.28, c.cy + oy * 0.28, mz - 0.25, mx - ox * w, my - oy * w, mz - 0.12, 0.08, 0.06, STEEL);
      }
      for (let k = 0; k < 4; k++) { const a = (k + 0.5) * (Math.PI / 2), x = c.cx + Math.cos(a) * (r + w + 0.18), y = c.cy + Math.sin(a) * (r + w + 0.18); S.box.box(x - 0.05, y - 0.05, floorBelow, x + 0.05, y + 0.05, zt + 0.8, STEEL); }
    }
    // A tote lift's shaft: four posts from the lower floor to above the
    // upper one, mesh guards on the two closed sides, the drive on top.
    vrcShaft(S, m) {
      const g = this.sim.grid, z0 = Math.min(...m.stops.map((s) => s.z)) - g.convZ, z1 = Math.max(...m.stops.map((s) => s.z)) + 3.2, h = 0.8, pick = { kind: 'robot', id: m.id };
      for (const [dx, dy] of [[-h, -h], [h - 0.14, -h], [-h, h - 0.14], [h - 0.14, h - 0.14]]) S.box.box(m.x + dx, m.y + dy, z0, m.x + dx + 0.14, m.y + dy + 0.14, z1, CYAN, pick);
      S.box.box(m.x - h, m.y - h, z1, m.x + h, m.y + h, z1 + 0.3, '#0e7490', pick);
      S.box.box(m.x - 0.35, m.y - 0.35, z1 + 0.3, m.x + 0.35, m.y + 0.35, z1 + 1.0, '#1e293b', pick);
      for (let z = z0 + 0.2; z < z1; z += 2.4) {
        if (m.along === 'y') { for (const x of [m.x - h, m.x + h - 0.04]) this.st.clear.box(x, m.y - h, z, x + 0.04, m.y + h, z + 2.2, '#67e8f9'); }
        else for (const y of [m.y - h, m.y + h - 0.04]) this.st.clear.box(m.x - h, y, z, m.x + h, y + 0.04, z + 2.2, '#67e8f9');
      }
      for (const s of m.stops) S.box.box(m.x - h - 0.05, m.y - h - 0.05, s.z - 2.2 + 0.01, m.x + h + 0.05, m.y + h + 0.05, s.z - 2.2 + 0.05, YELLOW);
    }
    // The staff core on every floor: the goods lift's shaft, the stairs.
    coreStatic(S, f) {
      const g = this.sim.grid, c = g.core, H = g.FH[f], pick = { kind: 'staff', id: 0 }, W = 0.2;
      S.box.box(c.x0, c.y0, 0, c.x0 + W, c.y1, H, CONCRETE, pick);
      S.box.box(c.x0, c.y0, 0, c.x1, c.y0 + W, H, CONCRETE, pick);
      S.box.box(c.x0, c.y1 - W, 0, c.x1, c.y1, H, CONCRETE, pick);
      const mid = (c.y0 + c.y1) / 2;
      S.box.box(c.x1 - W, c.y0, 0, c.x1, mid - 1.1, H, CONCRETE, pick);
      S.box.box(c.x1 - W, mid + 1.1, 0, c.x1, c.y1, H, CONCRETE, pick);
      S.box.box(c.x1 - W, mid - 1.1, 5.0, c.x1, mid + 1.1, H, CONCRETE, pick);
      S.box.box(c.x1, mid - 1.25, 4.9, c.x1 + 0.06, mid + 1.25, 5.2, '#94a3b8');
      // stairs south of the core: two flights per storey with a landing
      const sx0 = c.x0, sx1 = c.x1, sy0 = c.y1 + 0.1, sy1 = Math.min(g.by1 - 0.1, c.y1 + 2.2), n = 12, half = (sy1 - sy0) / 2, step = (sx1 - sx0 - 0.9) / n, rise = H / (2 * n);
      for (let k = 0; k < n; k++) {
        S.box.box(sx0 + k * step, sy0, k * rise, sx0 + (k + 1) * step + 0.02, sy0 + half - 0.05, (k + 1) * rise, '#64748b');
        S.box.box(sx1 - 0.9 - (k + 1) * step, sy0 + half + 0.05, H / 2 + k * rise, sx1 - 0.9 - k * step + 0.02, sy1, H / 2 + (k + 1) * rise, '#64748b');
      }
      S.box.box(sx1 - 0.9, sy0, H / 2 - 0.2, sx1, sy1, H / 2, '#64748b');
      S.cyl.beam(sx0, sy0 + half, 2.0, sx1 - 0.9, sy0 + half, H / 2 + 2.0, 0.05, 0.05, YELLOW);
      S.cyl.beam(sx0, sy1, 2.0, sx1 - 0.9, sy1, H / 2 + 2.0, 0.05, 0.05, YELLOW);
    }

    // ---------------------------------------------------------------- the building
    // Slabs with the openings cut out, a painted floor on each, columns, the
    // facade per storey (a guard rail on the camera's side instead), the
    // dock doors' frames and shelters, ceiling lamps, the yard.
    buildHall() {
      const sim = this.sim, g = sim.grid, T = WS.View3D.THREE;
      if (!this.shell) {
        const mk = (shape, mat) => this.newBatch(shape, mat, 512, { cast: false });
        this.shell = { slab: mk('box'), lamp: mk('cyl'), lit: this.newBatch('cyl', 'lit', 256), roof: mk('box'), lamp2: mk('cyl'), lit2: this.newBatch('cyl', 'lit', 128) };
        this.walls = {};
        for (const k of ['N', 'S', 'W', 'E']) this.walls[k] = { full: mk('box'), glass: this.newBatch('box', 'glass', 256, { shadow: false }), low: mk('box') };
        this.floorMeshes = [0, 1, 2].map(() => {
          const cv = document.createElement('canvas'), tex = new T.CanvasTexture(cv);
          tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
          const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.02, transparent: true, alphaTest: 0.5 }));
          m.rotation.x = -Math.PI / 2; m.receiveShadow = true; this.scene.add(m);
          return { cv, tex, m };
        });
        this.yard = mk('box');
      }
      const Sh = this.shell;
      for (const b of [Sh.slab, Sh.lamp, Sh.lit, Sh.roof, Sh.lamp2, Sh.lit2, this.yard]) b.begin();
      for (const W of Object.values(this.walls)) { W.full.begin(); W.glass.begin(); W.low.begin(); }
      // floors: the painted surface, and the slab under it (the ground floor sits on a plinth above the yard)
      for (const f of [0, 1, 2]) {
        const fm = this.floorMeshes[f], z = this.FZ[f];
        fm.m.visible = this.shown(f);
        fm.m.scale.set(g.bx1 - g.bx0, g.by1 - g.by0, 1); fm.m.position.set((g.bx0 + g.bx1) / 2, z * LZ + 0.004, (g.by0 + g.by1) / 2);
        this.paintFloor(f, fm);
        this.skip = !this.shown(f);
        for (const r of this.slabRects(f)) Sh.slab.box(r.x0, r.y0, z - (f ? g.SLAB : -YARD), r.x1, r.y1, z - 0.002, f ? '#6b7585' : '#4b5563');
        // ceiling lamps under the slab above (hidden with it), a lamp over every work place on the floor
        const top = z + g.FH[f] - (f < 2 ? g.SLAB : 0.6);
        this.skip = !(this.shown(f) && (f === 2 || this.shown(f + 1)));
        for (let x = g.bx0 + 4; x < g.bx1 - 2; x += 6) for (let y = g.by0 + 4; y < g.by1 - 2; y += 6) if (!this.overShaft(f, x, y)) this.lamp(x, y, top, !this.dark, f === 2);
        for (const w of this.workLights()) if (w.f === f) this.lamp(w.x, w.y, top, true, f === 2);
        if (f === 2) for (let x = g.bx0 + 4.5; x < g.bx1 - 2; x += 9) Sh.roof.box(x - 0.12, g.by0, top + 0.1, x + 0.12, g.by1, top + 0.6, '#3b4a5f');
        this.skip = false;
      }
      // the roof, seen from inside only
      Sh.roof.box(g.bx0 - 0.3, g.by0 - 0.3, g.roofZ, g.bx1 + 0.3, g.by1 + 0.3, g.roofZ + 0.6, '#4b5563');
      this.facade();
      this.yardStatic();
      for (const b of [Sh.slab, Sh.lamp, Sh.lit, Sh.roof, Sh.lamp2, Sh.lit2, this.yard]) b.end();
      for (const W of Object.values(this.walls)) { W.full.end(); W.glass.end(); W.low.end(); }
      this.hallRect = { x0: g.bx0, y0: g.by0, x1: g.bx1, y1: g.by1 };
      this.hallTop = g.roofZ;
      this.applyLights(this.workLights(), g.roofZ);
    }
    // a high-bay lamp hanging from the ceiling; under the roof (roof: true) it shows with the roof
    lamp(x, y, top, on, roof) {
      const Sh = this.shell, cs = this.sim.cfg.cellSize, B = roof ? Sh.lamp2 : Sh.lamp, BL = roof ? Sh.lit2 : Sh.lit;
      B.cyl(x, y, top - 0.6, top, 0.012 / cs, '#64748b');
      B.cyl(x, y, top - 0.95, top - 0.6, 0.14 / cs, '#1f2937');
      (on ? BL : B).cyl(x, y, top - 0.98, top - 0.95, 0.12 / cs, on ? '#fff4d6' : '#273244');
    }
    // what the slab of floor f is cut for: the spirals and lifts that pass through it, the staff core
    holes(f) {
      const g = this.sim.grid, sq = (x, y, r) => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r }), out = [];
      if (f === 0) return out;
      out.push({ x0: g.core.x0, y0: g.core.y0, x1: g.core.x1, y1: Math.min(g.by1, g.core.y1 + 2.3) });
      if (f === 1) out.push(sq(g.giX, g.giY, 0.95));
      out.push(sq(g.parcel.cx, g.parcel.cy, RP + 0.75));
      if (f === 2) { const L = this.sim.links; out.push(L.up.sp ? sq(g.up.cx, g.up.cy, R + 0.75) : sq(g.up.cx, g.up.cy, 0.95), L.down.sp ? sq(g.down.cx, g.down.cy, R + 0.75) : sq(g.down.cx, g.down.cy, 0.95)); }
      return out;
    }
    overShaft(f, x, y) { return this.holes(f).concat(this.holes(Math.min(2, f + 1))).some((h) => x > h.x0 - 1 && x < h.x1 + 1 && y > h.y0 - 1 && y < h.y1 + 1); }
    // the slab as rectangles round its holes
    slabRects(f) {
      const g = this.sim.grid, H = this.holes(f), xs = [...new Set([g.bx0, g.bx1, ...H.flatMap((h) => [h.x0, h.x1])])].filter((x) => x >= g.bx0 && x <= g.bx1).sort((a, b) => a - b), out = [];
      for (let k = 1; k < xs.length; k++) {
        const xa = xs[k - 1], xb = xs[k], cut = H.filter((h) => h.x0 <= xa + 1e-6 && h.x1 >= xb - 1e-6).sort((a, b) => a.y0 - b.y0);
        let y = g.by0;
        for (const h of cut) { if (h.y0 > y) out.push({ x0: xa, y0: y, x1: xb, y1: h.y0 }); y = Math.max(y, h.y1); }
        if (y < g.by1) out.push({ x0: xa, y0: y, x1: xb, y1: g.by1 });
      }
      return out;
    }
    // A floor's paint: concrete with joints, walkways, the dock zone and
    // staging lanes, the safety zones round the lifts; holes left clear.
    paintFloor(f, fm) {
      const sim = this.sim, g = sim.grid, PX = 22, W = g.bx1 - g.bx0, H = g.by1 - g.by0, cv = fm.cv;
      cv.width = Math.round(W * PX); cv.height = Math.round(H * PX);
      const c = cv.getContext('2d'), X = (x) => (x - g.bx0) * PX, Y = (y) => (y - g.by0) * PX, rect = (x0, y0, x1, y1) => c.fillRect(X(x0), Y(y0), (x1 - x0) * PX, (y1 - y0) * PX);
      c.fillStyle = this.dark ? '#161c27' : f === 0 ? '#3a4352' : '#414b5b'; c.fillRect(0, 0, cv.width, cv.height);
      // trowel marks: soft patches, the same every time
      let s = 99 + f * 7;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let k = 0; k < 260; k++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${(0.006 + rnd() * 0.014).toFixed(3)})`; c.beginPath(); c.ellipse(rnd() * cv.width, rnd() * cv.height, 10 + rnd() * 40, 6 + rnd() * 24, rnd() * 3, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1.5;
      for (let x = g.bx0 + 6; x < g.bx1; x += 6) { c.beginPath(); c.moveTo(X(x), 0); c.lineTo(X(x), cv.height); c.stroke(); }
      for (let y = g.by0 + 6; y < g.by1; y += 6) { c.beginPath(); c.moveTo(0, Y(y)); c.lineTo(cv.width, Y(y)); c.stroke(); }
      const line = (x0, y0, x1, y1, col, w, dash) => { c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.beginPath(); c.moveTo(X(x0), Y(y0)); c.lineTo(X(x1), Y(y1)); c.stroke(); c.setLineDash([]); };
      const hatch = (x0, y0, x1, y1) => { c.save(); c.beginPath(); c.rect(X(x0), Y(y0), (x1 - x0) * PX, (y1 - y0) * PX); c.clip(); c.strokeStyle = 'rgba(250,204,21,0.55)'; c.lineWidth = 4; for (let k = -cv.height; k < cv.width; k += 18) { c.beginPath(); c.moveTo(k, cv.height); c.lineTo(k + cv.height, 0); c.stroke(); } c.restore(); c.strokeStyle = 'rgba(250,204,21,0.8)'; c.lineWidth = 2; c.strokeRect(X(x0), Y(y0), (x1 - x0) * PX, (y1 - y0) * PX); };
      const wy = g.walkY[f];
      if (wy != null) { line(g.core.x1 + 0.4, wy - 0.6, g.bx1 - 1, wy - 0.6, 'rgba(250,204,21,0.85)', 3); line(g.core.x1 + 0.4, wy + 0.6, g.bx1 - 1, wy + 0.6, 'rgba(250,204,21,0.85)', 3); for (let x = g.core.x1 + 2; x < g.bx1 - 2; x += 5) { c.fillStyle = 'rgba(226,232,240,0.5)'; c.fillRect(X(x), Y(wy - 0.15), PX * 0.9, PX * 0.3); } }
      if (f === 0) {
        hatch(g.bx0 + 0.3, g.by0 + 0.2, g.bx1 - 0.3, -0.3);
        for (const d of sim.docks.doors) hatch(d.x - 1.7, g.by0 + 0.2, d.x + 1.7, 1.2);
        for (const s of sim.docks.staging) { c.strokeStyle = 'rgba(132,204,22,0.8)'; c.lineWidth = 2.5; c.strokeRect(X(s.x - 0.25), Y(s.y - 0.8), 1.7 * PX, 1.6 * PX); }
        const C = g.canteen; c.fillStyle = this.dark ? '#2a2016' : '#6b4f33'; rect(C.x0, C.y0, C.x1, C.y1);
        c.strokeStyle = 'rgba(0,0,0,0.25)'; for (let x = C.x0; x < C.x1; x += 0.5) { c.beginPath(); c.moveTo(X(x), Y(C.y0)); c.lineTo(X(x), Y(C.y1)); c.stroke(); }
        hatch(g.giX - 1.3, g.giY - 1.3, g.giX + 1.3, g.giY + 1.3);
      }
      if (f === 1) { for (const a of sim.aisles) hatch(a.a * 3 + 0.1, g.B, a.a * 3 + 2.9, g.B + 1.0); hatch(g.giX - 1.3, g.giY - 1.3, g.giX + 1.3, g.giY + 1.3); line(g.W + 2.5, g.D + 2.5, g.W + 10, g.D + 2.5, 'rgba(56,189,248,0.6)', 2, [8, 6]); }
      if (f === 2) for (const p of sim.ports.filter((q) => q.floor === 2)) line(p.drop.x, g.D + 2.9, p.drop.x + 5, g.D + 2.9, 'rgba(250,204,21,0.5)', 2);
      // the openings
      for (const h of this.holes(f)) c.clearRect(X(h.x0), Y(h.y0), (h.x1 - h.x0) * PX, (h.y1 - h.y0) * PX);
      fm.tex.needsUpdate = true;
    }
    // The outside of each storey: cladding, a band of windows, mullions and
    // columns; the ground floor's dock doors with their frames. Each side
    // has a low version for when the camera looks in from that side: a kerb
    // on the ground floor, a guard rail at the slab edge upstairs.
    facade() {
      const sim = this.sim, g = sim.grid, d = sim.docks, T = 0.3;
      const sides = { N: { a: g.bx0, b: g.bx1 }, S: { a: g.bx0, b: g.bx1 }, W: { a: g.by0, b: g.by1 }, E: { a: g.by0, b: g.by1 } };
      const put = (B, side, s0, s1, t0, t1, z0, z1, c) => {
        if (side === 'N') B.box(s0, g.by0 - t1, z0, s1, g.by0 - t0, z1, c);
        else if (side === 'S') B.box(s0, g.by1 + t0, z0, s1, g.by1 + t1, z1, c);
        else if (side === 'W') B.box(g.bx0 - t1, s0, z0, g.bx0 - t0, s1, z1, c);
        else B.box(g.bx1 + t0, s0, z0, g.bx1 + t1, s1, z1, c);
      };
      const doors = { N: d.doors.map((x) => ({ a: x.x - 1.75, b: x.x + 1.75, h: 7.6 })), W: d.inDoors.map((x) => ({ a: x.y - 1.65, b: x.y + 1.65, h: 7.6 })) };
      for (const side of ['N', 'S', 'W', 'E']) {
        const Wb = this.walls[side], { a, b } = sides[side];
        for (const f of [0, 1, 2]) {
          this.skip = !this.shown(f);
          const z = this.FZ[f], H = g.FH[f], top = z + H - (f < 2 ? g.SLAB : 0), dd = f === 0 ? doors[side] || [] : [], spans = [];
          let s = a - T;
          for (const o of dd) { spans.push([s, o.a]); s = o.b; }
          spans.push([s, b + T]);
          const w0 = z + (f === 0 ? H - 5.4 : 1.2), w1 = top - 1.3;
          for (const [s0, s1] of spans) {
            put(Wb.full, side, s0, s1, 0, T, z + (f === 0 ? YARD : 0), z + (f === 0 ? 1.2 : 0.2), f === 0 ? '#6b7280' : '#4b5563');
            put(Wb.full, side, s0, s1, 0.04, T, z + (f === 0 ? 1.2 : 0.2), w0, '#3b4b63');
            put(Wb.glass, side, s0, s1, 0.1, 0.16, w0, w1, this.dark ? '#0b1730' : '#9cc9f0');
            put(Wb.full, side, s0, s1, 0.04, T, w1, top + (f < 2 ? g.SLAB : 0.6), '#3b4b63');
            for (let r = s0 + 1; r < s1 - 0.5; r += 2) put(Wb.full, side, r - 0.05, r + 0.05, 0.1, 0.18, w0, w1, '#64748b');
            // the low version: a kerb downstairs, a rail at the slab edge upstairs
            if (f === 0) { put(Wb.low, side, s0, s1, 0, T, YARD, 0.9, '#6b7280'); put(Wb.low, side, s0, s1, -0.03, T + 0.03, 0.9, 1.02, YELLOW); }
            else {
              for (let r = s0 + 0.3; r < s1; r += 2) put(Wb.low, side, r - 0.04, r + 0.04, 0.05, 0.13, z, z + 2.4, YELLOW);
              put(Wb.low, side, s0, s1, 0.05, 0.13, z + 2.3, z + 2.45, YELLOW); put(Wb.low, side, s0, s1, 0.05, 0.13, z + 1.2, z + 1.3, YELLOW);
              put(Wb.low, side, s0, s1, -0.02, T, z - g.SLAB, z + 0.15, '#4b5563');
            }
          }
          // the door openings: a header over each, a black shelter round it outside, bumpers and a leveller
          for (const o of dd) {
            put(Wb.full, side, o.a, o.b, 0.04, T, z + o.h, top + g.SLAB, '#3b4b63');
            for (const B of [Wb.full, Wb.low]) {
              put(B, side, o.a - 0.15, o.a, -0.45, T, YARD, o.h + 0.2, '#111827'); put(B, side, o.b, o.b + 0.15, -0.45, T, YARD, o.h + 0.2, '#111827');
              put(B, side, o.a - 0.15, o.b + 0.15, -0.45, T, o.h, o.h + 0.45, '#111827');
              for (const e of [o.a + 0.4, o.b - 0.6]) put(B, side, e, e + 0.2, -0.25, 0, -0.6, -0.1, '#0b0f17');
            }
            put(Wb.low, side, o.a, o.b, 0, T, YARD, 0, '#6b7280');
          }
          // columns on the inside of the wall
          const span = b - a, n = Math.max(1, Math.round(span / 6));
          for (let k = 0; k <= n; k++) { const r = a + (span * k) / n; if (dd.some((o) => r > o.a - 0.5 && r < o.b + 0.5)) continue; put(Wb.full, side, r - 0.22, r + 0.22, -0.45, 0, z, top, '#556275'); }
        }
        this.skip = false;
      }
    }
    // the yard: kerbs, painted bays for the trucks, a white line along the building
    yardStatic() {
      const g = this.sim.grid, Y = this.yard, d = this.sim.docks;
      for (const door of d.doors) for (const s of [-1, 1]) Y.box(door.x + s * 1.9 - 0.05, g.by0 - 16, YARD, door.x + s * 1.9 + 0.05, g.by0 - 0.5, YARD + 0.02, '#e2e8f0');
      for (const door of d.inDoors) for (const s of [-1, 1]) Y.box(g.bx0 - 16, door.y + s * 1.8 - 0.05, YARD, g.bx0 - 0.5, door.y + s * 1.8 + 0.05, YARD + 0.02, '#e2e8f0');
      Y.box(g.bx0 - 0.4, g.by1, YARD, g.bx1 + 0.4, g.by1 + 1.2, 0, '#6b7280');
      Y.box(g.bx1, g.by0 - 0.4, YARD, g.bx1 + 1.2, g.by1 + 1.2, 0, '#6b7280');
    }
    // Walls on the camera's side drop to their low version; the roof shows from inside only.
    cutaway() {
      if (!this.walls) return;
      const p = this.camera.position, H = this.hallRect, out = { N: p.z < H.y0, S: p.z > H.y1, W: p.x < H.x0, E: p.x > H.x1 };
      for (const [k, W] of Object.entries(this.walls)) { W.full.mesh.visible = W.glass.mesh.visible = !out[k]; W.low.mesh.visible = out[k]; }
      const inside = p.y < this.hallTop * LZ && !Object.values(out).some(Boolean);
      const roof = inside && this.opts.floorTop == null;
      for (const b of [this.shell.roof, this.shell.lamp2, this.shell.lit2]) b.mesh.visible = roof;
    }
    // places with a lamp of their own, on their floor
    workLights() {
      const sim = this.sim, L = sim.layout, g = sim.grid, out = sim.ports.map((p) => Object.assign({ f: p.floor }, L.operatorPos(p)));
      for (const pk of sim.oms.packers) out.push(Object.assign({ f: 2 }, L.packerOperator(pk)));
      for (const d of sim.docks.doors) out.push({ f: 0, x: d.x, y: 0.5 });
      out.push({ f: 0, x: (g.canteen.x0 + g.canteen.x1) / 2, y: (g.canteen.y0 + g.canteen.y1) / 2 }, { f: 0, x: -8.5, y: 12 }, { f: 1, x: g.W + 5, y: g.D + 4.5 });
      return out;
    }
    applyLights(lights) {
      const g = this.sim.grid, dark = this.dark, bg = dark ? '#03060c' : '#0b1220';
      this.renderer.setClearColor(bg); this.scene.fog.color.set(bg);
      this.hemi.intensity = dark ? 0.22 : 1.6; this.hemi.color.set(dark ? '#7d8fc9' : '#c7d7ff');
      this.sun.intensity = dark ? 0.1 : 2.2;
      const T = WS.View3D.THREE, n = dark ? Math.min(24, lights.length) : 0;
      while (this.spots.length < n) { const sp = new T.SpotLight('#ffe9c4', 1, 0, 0.6, 0.65, 2); this.scene.add(sp, sp.target); this.spots.push(sp); }
      this.spots.forEach((sp, k) => {
        sp.visible = k < n;
        if (k >= n) return;
        const p = lights[k], z0 = this.FZ[p.f], h = (g.FH[p.f] - 2.5) * LZ, r = 3.5 / (this.sim.cfg.cellSize || 1);
        sp.position.set(p.x, z0 * LZ + h, p.y); sp.target.position.set(p.x, z0 * LZ, p.y); sp.angle = Math.atan(r / h); sp.intensity = 3.2 * h * h;
      });
    }
    // camera shots of the work places, on their floors
    startShot(shot) {
      if (shot !== 'station') return super.startShot(shot);
      this.shot = shot; this.shotT = 0;
      const ls = this.workLights();
      this.stationK = ((this.stationK ?? -1) + 1) % ls.length;
      const p = ls[this.stationK];
      Object.assign(this.cam, { tx: p.x, ty: p.y - 0.6, tz: this.FZ[p.f] + 2.0, dist: 5.5, pitch: 0.38, yaw: 0.55 });
    }

    // ---------------------------------------------------------------- live
    drawLive(alpha) {
      this.onFloor(1);
      super.drawLive(alpha); // stored totes, shuttles and aisle lifts
      this.offFloor();
      this.alpha = alpha;
      this.drawBeltTotes(alpha);
      this.drawVrcs();
      this.drawParcels(alpha);
      this.drawDockLive();
      this.drawStaffLift();
      this.drawPeople(alpha);
      this.controlScreen();
    }
    // a tote turned along its way (a, as WS.View3D's rbox), for the spirals
    rtote(B, x, y, a, z, color) {
      const T = this.sim.convTote(), w = T.w, d = T.d, t = 0.035, h = TOTE_H;
      B.rbox(x, y, a, -w, -d, z, w, d, z + 0.08, WS.shade(color, -0.3));
      B.rbox(x, y, a, -w, -d, z, w, -d + t, z + h, color); B.rbox(x, y, a, -w, d - t, z, w, d, z + h, color);
      B.rbox(x, y, a, -w, -d, z, -w + t, d, z + h, WS.shade(color, -0.12)); B.rbox(x, y, a, w - t, -d, z, w, d, z + h, WS.shade(color, -0.12));
    }
    drawBeltTotes(alpha) {
      const sim = this.sim, T = sim.convTote(), D = this.dy;
      for (const b of sim.net.belts) {
        if (!b.totes.length) continue;
        const shown = b.sloped ? this.shown(b.floor) || this.shown(b.floor + 1) : this.shown(b.floor);
        if (!shown) continue;
        for (const t of b.totes) {
          const x = t.px + (t.x - t.px) * alpha, y = t.py + (t.y - t.py) * alpha;
          if (b.sloped) { const z = (t.pz ?? t.z) + (t.z - (t.pz ?? t.z)) * alpha; this.rtote(D.box, x, y, Math.atan2(t.dx, t.dy), z + 0.04, this.binColor(t.bin.id)); }
          else this.box3(D.box, x - T.w, y - T.d, x + T.w, y + T.d, this.FZ[b.floor] + b.z, this.binColor(t.bin.id));
        }
      }
    }
    // The tote lifts' carriages: a roller deck between guard rails, the
    // totes on it or rolling on and off.
    drawVrcs() {
      const sim = this.sim, D = this.dy, T = sim.convTote();
      for (const m of sim.vrcs) {
        const fl = m.stops.map((s) => s.floor);
        if (!fl.some((f) => this.shown(f))) continue;
        const z = m.z, h = 0.74, pick = { kind: 'robot', id: m.id }, along = m.along === 'y';
        D.box.box(m.x - h, m.y - h, z - 0.3, m.x + h, m.y + h, z - 0.08, '#155e75', pick);
        for (let k = 0; k < 7; k++) { const s = -h + 0.1 + (k * (2 * h - 0.2)) / 6; if (along) D.cyl.cylX(m.x - h + 0.08, m.x + h - 0.08, m.y + s, z - 0.05, 0.035, '#94a3b8'); else D.cyl.cylY(m.x + s, m.y - h + 0.08, m.y + h - 0.08, z - 0.05, 0.035, '#94a3b8'); }
        for (const s of [-1, 1]) { if (along) D.box.box(m.x + s * h - 0.04, m.y - h, z - 0.08, m.x + s * h + 0.04, m.y + h, z + 0.6, YELLOW, pick); else D.box.box(m.x - h, m.y + s * h - 0.04, z - 0.08, m.x + h, m.y + s * h + 0.04, z + 0.6, YELLOW, pick); }
        D.lit.box(m.x - 0.15, m.y - 0.15, z + 0.6, m.x + 0.15, m.y + 0.15, z + 0.66, WS.led(this, m, sim));
        for (const it of m.load) {
          let q = m.slot(it.slot);
          const r = m.roll;
          if (r && r.it === it) { const u = ease(Math.min(1, (sim.time - r.t0) / r.dur)); q = { x: r.a.x + (r.b.x - r.a.x) * u, y: r.a.y + (r.b.y - r.a.y) * u }; }
          this.box3(D.box, q.x - T.w, q.y - T.d, q.x + T.w, q.y + T.d, z, this.binColor(it.bin.id));
        }
      }
    }
    // parcels and bags: on the spiral, the sorter, sliding down a chute
    drawParcels(alpha) {
      const sim = this.sim, D = this.dy, show = this.shown(0) || this.shown(2);
      if (!show) return;
      for (const b of sim.pnet.belts) for (const t of b.totes) {
        const x = t.px + (t.x - t.px) * alpha, y = t.py + (t.y - t.py) * alpha, z = b.sloped ? (t.pz ?? t.z) + (t.z - (t.pz ?? t.z)) * alpha + 0.04 : b.z;
        if (!b.sloped || b.kind !== 'spiral') { if (!this.shown(0)) continue; }
        const a = b.sloped ? Math.atan2(t.dx, t.dy) : 0;
        if (t.bag) { D.box.rbox(x, y, a, -0.2, -0.15, z, 0.2, 0.15, z + 0.22, '#e2e8f0'); D.box.rbox(x, y, a, -0.12, -0.08, z + 0.22, 0.04, 0.08, z + 0.23, '#ffffff'); }
        else { D.box.rbox(x, y, a, -0.2, -0.17, z, 0.2, 0.17, z + 0.55, '#b8875a'); D.box.rbox(x, y, a, -0.205, -0.03, z + 0.3, 0.205, 0.03, z + 0.56, '#e6c79c'); D.box.rbox(x, y, a, -0.02, 0.17, z + 0.12, 0.17, 0.175, z + 0.42, '#f8fafc'); }
      }
      // the parcels waiting at the top of the parcel spiral
      const q = sim.docks.parcelQ.length, d = sim.layout.dock();
      this.onFloor(2);
      for (let k = 0; k < Math.min(q, 6); k++) this.parcel(D.box, d.x - 0.8 - k * 0.42, d.y - 0.17, d.x - 0.42 - k * 0.42, d.y + 0.17, 1.4, 0.5, true);
      this.offFloor();
    }
    // A roll cage: a wheeled base, wire mesh on three sides, posts, the
    // carrier's tag, the parcels in it.
    cage3d(B, x, y, z, n, carrier, a = 0) {
      const w = 0.55, d = 0.5, h = 3.6, mesh = '#a3b1c2', c = Math.cos(a), s = Math.sin(a);
      const rb = (u0, v0, z0, u1, v1, z1, col) => B.rbox(x, y, a, u0, v0, z + z0, u1, v1, z + z1, col);
      rb(-w, -d, 0.15, w, d, 0.3, '#475569');
      for (const [u, v] of [[-w + 0.08, -d + 0.08], [w - 0.08, -d + 0.08], [-w + 0.08, d - 0.08], [w - 0.08, d - 0.08]]) this.dy.cyl.cyl(x + u * c + v * s, y - u * s + v * c, z, z + 0.15, 0.06, '#0b0f17');
      for (const [u, v] of [[-w, -d], [w - 0.05, -d], [-w, d - 0.05], [w - 0.05, d - 0.05]]) rb(u, v, 0.3, u + 0.05, v + 0.05, h, '#e2e8f0');
      for (let zz = 0.8; zz < h; zz += 0.7) { rb(-w, -d, zz, w, -d + 0.02, zz + 0.03, mesh); rb(-w, d - 0.02, zz, w, d, zz + 0.03, mesh); rb(-w, -d, zz, -w + 0.02, d, zz + 0.03, mesh); }
      for (let k = 1; k < 4; k++) { const u = -w + (2 * w * k) / 4, v = -d + (2 * d * k) / 4; rb(u, -d, 0.3, u + 0.02, -d + 0.02, h, mesh); rb(u, d - 0.02, 0.3, u + 0.02, d, h, mesh); rb(-w, v, 0.3, -w + 0.02, v + 0.02, h, mesh); }
      const cap = this.sim.cfg.cageCap, per = 4;
      for (let k = 0; k < Math.min(n, cap); k++) {
        const r = Math.floor(k / per), j = k % per, u = -w + 0.08 + (j % 2) * (w - 0.04), v = -d + 0.08 + Math.floor(j / 2) * (d - 0.04);
        rb(u, v, 0.3 + r * 0.62, u + w - 0.12, v + d - 0.12, 0.3 + r * 0.62 + 0.58, (k * 37) % 3 ? '#b8875a' : '#a87a4f');
      }
      if (carrier) rb(-0.22, d, h - 0.6, 0.22, d + 0.02, h - 0.2, CARRIER_COL[carrier.code]);
    }
    // the dock: cages under the chutes and by the doors, the doors, the trucks, pallets at goods-in
    drawDockLive() {
      const sim = this.sim, g = sim.grid, d = sim.docks, D = this.dy;
      if (this.shown(0)) {
        for (const ch of d.chutes) {
          if (ch.cage) this.cage3d(D.box, ch.x, g.cageY, 0, ch.cage.items.length, ch.carrier);
          const p = ch.belt.pts[1], open = d.open(ch), w = 0.38;
          D.lit.box(ch.x + w + 0.06, p.y - 0.04, p.z + 0.25, ch.x + w + 0.14, p.y + 0.04, p.z + 0.55, open ? '#22c55e' : '#ef4444');
        }
        for (const door of d.doors) {
          door.staged.forEach((cg, k) => { const s = d.stagedSpot(door, k); this.cage3d(D.box, s.x, s.y, 0, cg.items.length, door.carrier); });
          for (let k = 0; k < Math.min(door.empties, 6); k++) this.cage3d(D.box, door.x, 0.2 + k * 0.13, 0, 0, null);
        }
        for (const s of d.staging) if (s.full) this.pallet3d(D.box, s.x + 0.6, s.y, 0, 1);
        for (const p of sim.ports) {
          if (p.floor !== 0) continue;
          for (let k = 0; k < 2; k++) { const s = d.palletSpot(p, k); if (k < p.pallets) this.pallet3d(D.box, s.x + 0.6, s.y, 0, k === p.pallets - 1 ? 1 - (p.cases % sim.cfg.casesPerPallet) / sim.cfg.casesPerPallet : 1); }
          const s = d.palletSpot(p, 0);
          for (let k = 0; k < p.empties; k++) this.palletDeck(D.box, s.x + 1.3, s.y + 1.5, k * 0.27);
        }
        this.dockDoors();
      }
      for (const door of d.doors) if (door.truck) this.truck3d(door.x, g.by0 - 0.5, 'N', this.truckOff(door.truck), CARRIER_COL[door.carrier.code], door.truck, door.truck.cages, { kind: 'door', id: door.k });
      for (const door of d.inDoors) if (door.truck) this.truck3d(g.bx0 - 0.5, door.y, 'W', this.truckOff(door.truck), '#a16207', door.truck, null, { kind: 'inDoor', id: door.k });
    }
    pallet3d(B, x, y, z, fill) {
      this.palletDeck(B, x, y, z);
      const n = Math.max(1, Math.ceil(fill * 8));
      for (let j = 0; j < n; j++) { const cx = x - 0.55 + (j % 2) * 0.56, cy = y - 0.55 + ((j >> 1) % 2) * 0.56, cz = z + 0.4 + Math.floor(j / 4) * 1.1; this.parcel(B, cx, cy, cx + 0.53, cy + 0.53, cz, 1.05, false); }
    }
    palletDeck(B, x, y, z) {
      for (const bx of [-0.6, -0.1, 0.4]) B.box(x + bx, y - 0.6, z, x + bx + 0.2, y + 0.6, z + 0.25, '#8a5a1c');
      for (let s = 0; s < 5; s++) B.box(x - 0.6, y - 0.6 + s * 0.25, z + 0.25, x + 0.6, y - 0.6 + s * 0.25 + 0.2, z + 0.4, '#b07a2e');
    }
    // the sectional doors: up while a truck is docked, down otherwise
    dockDoors() {
      const sim = this.sim, g = sim.grid, d = sim.docks, D = this.dy, H = 7.6;
      const openOf = (tr) => (!tr ? 0 : tr.state === 'ARRIVING' ? Math.max(0, (tr.t - 14) / 6) : tr.state === 'DOCKED' ? 1 : Math.max(0, 1 - tr.t / 5));
      for (const door of d.doors) {
        const o = ease(Math.min(1, openOf(door.truck))), z0 = H * o;
        for (let k = 0; k < 6; k++) { const za = z0 + ((H - z0) * k) / 6, zb = z0 + ((H - z0) * (k + 1)) / 6; if (zb - za > 0.01) D.box.box(door.x - 1.72, g.by0 - 0.22, za, door.x + 1.72, g.by0 - 0.1, zb - 0.03, k % 2 ? '#cbd5e1' : '#b6c2d1', { kind: 'door', id: door.k }); }
        D.lit.box(door.x + 1.9, g.by0 + 0.05, 7.0, door.x + 2.1, g.by0 + 0.1, 7.3, door.truck && door.truck.state === 'DOCKED' ? '#22c55e' : '#ef4444');
      }
      for (const door of d.inDoors) {
        const o = ease(Math.min(1, openOf(door.truck))), z0 = H * o;
        for (let k = 0; k < 6; k++) { const za = z0 + ((H - z0) * k) / 6, zb = z0 + ((H - z0) * (k + 1)) / 6; if (zb - za > 0.01) D.box.box(g.bx0 - 0.22, door.y - 1.62, za, g.bx0 - 0.1, door.y + 1.62, zb - 0.03, k % 2 ? '#cbd5e1' : '#b6c2d1'); }
      }
    }
    truckOff(tr) {
      if (tr.state === 'ARRIVING') return Math.pow(1 - Math.min(1, tr.t / 20), 2) * 18;
      if (tr.state === 'LEAVING') return tr.t < 6 ? 0 : Math.pow((tr.t - 6) / 18, 2) * 22;
      return 0;
    }
    // A rigid truck backed up to a door, its bed level with the floor: a
    // chassis on three axles, the cab with windscreen, mirrors and lights, a
    // box body in the carrier's colours with its rear doors swung open while
    // docked, and inside the roll cages or pallets it carries.
    truck3d(x, y, dir, off, col, tr, cages, pick) {
      const D = this.dy, open = tr.state === 'DOCKED';
      // local frame: u across, v from the rear doors outwards
      const tb = (B, u0, v0, z0, u1, v1, z1, c) => { const v = (q) => q + off; if (dir === 'N') B.box(x + u0, y - v(v1), z0, x + u1, y - v(v0), z1, c, pick); else B.box(x - v(v1), y + u0, z0, x - v(v0), y + u1, z1, c, pick); };
      const wheel = (v, u) => { const vv = v + off; if (dir === 'N') D.cyl.cylX(x + u - 0.16, x + u + 0.16, y - vv, YARD + 0.75, 0.33, '#0b0f17'); else D.cyl.cylY(x - vv, y + u - 0.16, y + u + 0.16, YARD + 0.75, 0.33, '#0b0f17'); };
      const Z = YARD, L = 11, W = 0.98;
      tb(D.box, -0.75, 0.2, Z + 0.55, 0.75, 14.3, Z + 0.95, DARK); // chassis
      for (const v of [1.6, 2.8, 13.1]) for (const u of [-0.82, 0.82]) wheel(v, u);
      // box body
      tb(D.box, -W, 0, Z + 1.2, W, L, Z + 1.3, '#475569');
      tb(D.box, -W, 0.1, Z + 1.3, -W + 0.06, L, Z + 8.6, '#eef2f7'); tb(D.box, W - 0.06, 0.1, Z + 1.3, W, L, Z + 8.6, '#eef2f7');
      tb(D.box, -W, L - 0.1, Z + 1.3, W, L, Z + 8.6, '#e2e8f0'); tb(D.box, -W, 0.1, Z + 8.5, W, L, Z + 8.75, '#f8fafc');
      for (const s of [-1, 1]) { tb(D.box, s > 0 ? W : -W - 0.01, 0.5, Z + 6.4, s > 0 ? W + 0.01 : -W, L - 0.5, Z + 7.6, col); tb(D.box, s > 0 ? W : -W - 0.01, 0.5, Z + 1.6, s > 0 ? W + 0.01 : -W, L - 0.5, Z + 1.9, col); }
      tb(D.box, -W - 0.04, -0.05, Z + 1.2, W + 0.04, 0.12, Z + 1.5, '#334155'); tb(D.box, -W - 0.04, -0.05, Z + 8.5, W + 0.04, 0.12, Z + 8.8, '#334155');
      for (const s of [-1, 1]) tb(D.box, s * (W + 0.02) - 0.03, -0.05, Z + 1.2, s * (W + 0.02) + 0.03, 0.12, Z + 8.8, '#334155');
      for (const s of [-1, 1]) {
        tb(D.box, s * W - 0.05, L - 0.12, Z + 1.2, s * W + 0.05, L, Z + 8.75, '#334155'); // front corner posts
        tb(D.box, s > 0 ? W - 0.02 : -W - 0.04, 3.4, Z + 0.95, s > 0 ? W + 0.04 : -W + 0.02, 10.4, Z + 1.1, '#94a3b8'); // side guard
        tb(D.box, s > 0 ? W - 0.02 : -W - 0.04, 3.4, Z + 0.55, s > 0 ? W + 0.04 : -W + 0.02, 10.4, Z + 0.65, '#94a3b8');
        tb(D.box, s * 0.82 - 0.2, 0.8, Z + 0.25, s * 0.82 + 0.2, 0.84, Z + 1.0, '#111827'); // mud flaps
      }
      for (const v of [1.6, 2.8, 13.1]) for (const u of [-0.99, 0.99]) { const vv = v + off; if (dir === 'N') D.cyl.cylX(x + u - 0.01, x + u + 0.01, y - vv, YARD + 0.75, 0.15, '#94a3b8'); else D.cyl.cylY(x - vv, y + u - 0.01, y + u + 0.01, YARD + 0.75, 0.15, '#94a3b8'); }
      if (open) { for (const s of [-1, 1]) tb(D.box, s > 0 ? W + 0.02 : -W - 0.08, 0.05, Z + 1.4, s > 0 ? W + 0.08 : -W - 0.02, 0.98, Z + 8.4, '#d1d5db'); }
      else tb(D.box, -W + 0.06, -0.04, Z + 1.4, W - 0.06, 0.02, Z + 8.4, '#d1d5db');
      // what it carries, seen through the open doors
      if (cages) cages.forEach((cg, k) => { const v = 0.8 + Math.floor(k / 2) * 1.15 + off, u = k % 2 ? 0.47 : -0.47; this.cage3d(D.box, dir === 'N' ? x + u : x - v, dir === 'N' ? y - v : y + u, Z + 1.3, cg.items.length, null); });
      else for (let k = 0; k < tr.pallets; k++) { const v = 1.0 + Math.floor(k / 2) * 1.45 + off, u = k % 2 ? 0.48 : -0.48; this.pallet3d(D.box, dir === 'N' ? x + u : x - v, dir === 'N' ? y - v : y + u, Z + 1.3, 1); }
      // cab
      tb(D.box, -W, 11.2, Z + 0.95, W, 14.3, Z + 3.4, col);
      tb(D.rnd, -W, 11.2, Z + 3.4, W, 14.0, Z + 6.6, col);
      tb(D.lit, -W + 0.12, 14.0, Z + 4.0, W - 0.12, 14.06, Z + 6.1, '#1e3a5f');
      for (const s of [-1, 1]) tb(D.lit, s > 0 ? W : -W - 0.01, 12.4, Z + 4.2, s > 0 ? W + 0.01 : -W, 13.7, Z + 6.0, '#1e3a5f');
      tb(D.box, -W, 11.2, Z + 6.6, W, 12.6, Z + 7.6, WS.shade(col, -0.2)); // roof fairing
      tb(D.box, -W + 0.1, 14.3, Z + 1.0, W - 0.1, 14.45, Z + 2.1, '#111827'); // bumper and grille
      for (const s of [-1, 1]) { tb(D.lit, s * 0.62 - 0.15, 14.3, Z + 2.2, s * 0.62 + 0.15, 14.34, Z + 2.6, '#fde68a'); tb(D.box, s > 0 ? W : -W - 0.35, 13.6, Z + 4.4, s > 0 ? W + 0.35 : -W, 13.7, Z + 5.6, '#111827'); }
    }
    // the goods lift's car and its landing doors on every floor
    drawStaffLift() {
      const sim = this.sim, g = sim.grid, c = g.core, lift = sim.people.lift, D = this.dy, pick = { kind: 'staff', id: 0 }, mid = (c.y0 + c.y1) / 2;
      const z = lift.z;
      if ([0, 1, 2].some((f) => this.shown(f) && z >= this.FZ[f] - 0.01 && z < this.FZ[f] + g.FH[f])) {
        D.box.box(c.x0 + 0.25, c.y0 + 0.25, z, c.x1 - 0.25, c.y1 - 0.25, z + 0.15, '#334155', pick);
        D.clear.box(c.x0 + 0.25, c.y0 + 0.25, z + 0.15, c.x0 + 0.3, c.y1 - 0.25, z + 4.8, '#cbd5e1');
        D.box.box(c.x0 + 0.25, c.y0 + 0.25, z + 4.8, c.x1 - 0.25, c.y1 - 0.25, z + 4.95, '#475569', pick);
        D.lit.box(c.x0 + 0.6, c.y0 + 0.8, z + 4.75, c.x1 - 0.6, c.y1 - 0.8, z + 4.8, '#f8fafc');
        D.box.box(c.x0 + 0.3, c.y0 + 0.3, z + 1.8, c.x0 + 0.36, c.y1 - 0.3, z + 1.9, '#94a3b8'); // handrail
        D.cyl.cyl(c.cx, c.cy, z + 4.95, this.FZ[2] + g.FH[2] - 0.5, 0.02, '#94a3b8'); // the ropes
      }
      for (const f of [0, 1, 2]) {
        if (!this.shown(f)) continue;
        const here = lift.floor === f, w = 1.05, o = here ? lift.door * w * 0.95 : 0, zf = this.FZ[f];
        D.box.box(c.x1 - 0.12, mid - w - 0.05, zf, c.x1 - 0.04, mid - o, zf + 4.95, '#cbd5e1', pick);
        D.box.box(c.x1 - 0.12, mid + o, zf, c.x1 - 0.04, mid + w + 0.05, zf + 4.95, '#cbd5e1', pick);
        D.lit.box(c.x1 + 0.01, mid - 0.2, zf + 5.25, c.x1 + 0.03, mid + 0.2, zf + 5.45, here ? '#4ade80' : lift.calls.includes(f) ? '#f59e0b' : '#1f2937');
      }
    }

    // ---------------------------------------------------------------- people
    // A person walking (legs and arms swinging), standing, sitting on a
    // canteen chair, pushing a roll cage or a pallet jack. From WS.View3D's
    // operator: workwear, hi-vis vest, hard hat, their own look.
    walker(P, x, y, z0, h, phase, mode) {
      const L = WS.personLook(P.look), D = this.dy, a = Math.atan2(-Math.cos(h), -Math.sin(h)), ca = Math.cos(a), sa = Math.sin(a), f = L.female;
      const W = (u, v) => ({ x: x + u * ca + v * sa, y: y - u * sa + v * ca });
      const sit = mode === 'sit', walk = mode === 'walk' || mode === 'push', sw = walk ? Math.sin(phase) : 0, dz = sit ? -0.66 : 0, pick = { kind: 'person', id: P.id };
      const part = (B) => (u0, v0, z1, u1, v1, z2, c) => B.rbox(x, y, a, u0, v0, z1 + z0 + dz, u1, v1, z2 + z0 + dz, c, pick);
      const box = part(D.box), rnd = part(D.rnd), dome = part(D.dome);
      const sh = f ? 0.135 : 0.16, hip = f ? 0.13 : 0.12, hw = f ? 0.07 : 0.075, skin = L.skin, shirt = L.shirt;
      // legs: thigh and shin as one piece from the hip to the boot, swinging; seated, the thighs lie on the chair
      for (const [u, s] of [[-0.055, 1], [0.055, -1]]) {
        const hp = W(u, 0), hz = z0 + 1.62 + dz;
        if (sit) {
          const k = W(u, -0.36), ft = W(u, -0.4);
          D.rnd.beam(hp.x, hp.y, hz, k.x, k.y, hz, 0.1, 0.1, L.trousers, pick);
          D.rnd.beam(k.x, k.y, hz, ft.x, ft.y, z0 + 0.2, 0.09, 0.09, L.trousers, pick);
          D.rnd.rbox(ft.x, ft.y, a, -0.05, -0.12, z0, 0.05, 0.06, z0 + 0.22, '#111827', pick);
        } else {
          const ft = W(u, -sw * s * 0.24);
          D.rnd.beam(hp.x, hp.y, hz, ft.x, ft.y, z0 + 0.22, 0.095, 0.1, L.trousers, pick);
          D.rnd.rbox(ft.x, ft.y, a, -0.05, -0.13, z0, 0.05, 0.06, z0 + 0.24, '#111827', pick);
        }
      }
      rnd(-hip, -0.068, 1.48, hip, 0.068, 1.9, L.trousers);
      box(-hip - 0.004, -0.068, 1.8, hip + 0.004, 0.068, 1.86, '#111827');
      rnd(-hip + 0.005, -0.075, 1.85, hip - 0.005, 0.075, 2.35, shirt);
      rnd(-sh, -0.085, 2.25, sh, 0.085, 2.78, shirt);
      rnd(-hip - 0.002, -0.09, 1.88, hip + 0.002, 0.09, 2.36, P.vest);
      rnd(-sh + 0.01, -0.092, 2.3, sh - 0.01, 0.092, 2.74, P.vest);
      for (const zz of [2.0, 2.2]) box(-hip - 0.006, -0.094, zz, hip + 0.006, 0.094, zz + 0.06, '#e2e8f0');
      // arms swinging against the legs, forward on the handle when pushing, on the table when seated
      for (const s of [-1, 1]) {
        const shp = W(s * (sh + 0.03), 0), hand = mode === 'push' ? W(s * 0.16, -0.42) : sit ? W(s * 0.12, -0.3) : W(s * (sh + 0.05), sw * s * 0.18);
        const hz = z0 + dz + (mode === 'push' ? 2.0 : sit ? 2.25 : 1.95);
        D.rnd.beam(shp.x, shp.y, z0 + dz + 2.72, hand.x, hand.y, hz, 0.07, 0.07, shirt, pick);
        D.rnd.rbox(hand.x, hand.y, a, -0.03, -0.03, hz - 0.08, 0.03, 0.03, hz + 0.04, skin, pick);
      }
      box(-0.035, -0.035, 2.74, 0.035, 0.035, 2.9, skin);
      if (L.style === 'long') rnd(-hw - 0.012, -0.02, 2.62, hw + 0.012, 0.095, 3.2, L.hair);
      rnd(-hw, -0.085, 2.84, hw, 0.08, 3.25, skin);
      rnd(-hw - 0.006, -0.03, 3.0, hw + 0.006, 0.088, 3.27, L.hair);
      if (L.style === 'ponytail') rnd(-0.028, 0.075, 2.78, 0.028, 0.125, 3.16, L.hair);
      if (L.style === 'beard') rnd(-hw + 0.004, -0.092, 2.83, hw - 0.004, 0.0, 2.98, L.hair);
      for (const u of [-0.045, 0.02]) box(u, -0.09, 3.06, u + 0.025, -0.084, 3.095, '#111827');
      dome(-0.1, -0.11, 3.2, 0.1, 0.105, 3.46, L.hat);
      rnd(-0.106, -0.116, 3.18, 0.106, 0.111, 3.22, WS.shade(L.hat, -0.1));
      rnd(-0.08, -0.17, 3.19, 0.08, -0.1, 3.215, WS.shade(L.hat, -0.1));
    }
    drawPeople(alpha) {
      const sim = this.sim, D = this.dy;
      for (const P of sim.people.list) {
        if (P.port && P.state === 'AT_STATION') continue; // drawn at the station
        const f = P.floor;
        if (!this.shown(f)) continue;
        const x = P.px + (P.x - P.px) * alpha, y = P.py + (P.y - P.py) * alpha, z = this.FZ[f] + P.pz + (P.z - P.pz) * alpha;
        const mode = P.state === 'BREAK' ? 'sit' : P.carry ? 'push' : P.moving ? 'walk' : 'stand';
        if (mode === 'sit' && P.seat) { this.walker(P, P.seat.x, P.seat.y, z, P.seat.face === Math.PI ? Math.PI / 2 : -Math.PI / 2, 0, 'sit'); continue; }
        this.walker(P, x, y, z, P.heading, P.walked * 2.6, mode);
        const hx = Math.cos(P.heading), hy = Math.sin(P.heading);
        if (P.carry === 'pallet') {
          // a pallet jack: handle, body, forks under the pallet
          const fx = x + hx * 0.55, fy = y + hy * 0.55, a = Math.atan2(hx, hy);
          D.box.beam(x + hx * 0.25, y + hy * 0.25, z + 2.1, fx, fy, z + 0.5, 0.05, 0.05, '#111827');
          D.box.rbox(fx, fy, a, -0.25, -0.15, z + 0.1, 0.25, 0.15, z + 0.6, '#f59e0b');
          for (const s of [-0.3, 0.3]) D.box.rbox(fx, fy, a, s - 0.08, 0.15, z + 0.05, s + 0.08, 1.4, z + 0.22, '#f59e0b');
          this.pallet3d(D.box, x + hx * 1.35, y + hy * 1.35, z + 0.22, 1);
        } else if (P.carry) this.cage3d(D.box, x + hx * 0.95, y + hy * 0.95, z, P.carry.items.length, P.carry.carrier, Math.atan2(hx, hy));
      }
    }

    // ---------------------------------------------------------------- stations on their floors
    drawStationsLive() {
      const sim = this.sim, L = sim.layout, oms = sim.oms, D = this.dy;
      for (const p of sim.ports) {
        this.onFloor(p.floor);
        this.portLive(p);
        const op = L.operatorPos(p), P = p.person;
        if (!P || P.state === 'AT_STATION') this.operator(op.x, op.y, this.faceAngle(p), !!(p.job && p.job.next < p.job.lines.length && p.mode === 'auto'), p.kind === 'PICK' ? '#f97316' : '#22c55e', 0, 'port' + p.idx);
        if (p.kind !== 'PICK') continue;
        const st = L.toteStack(p);
        this.toteStack(st.x, st.y, p.stack ? p.stack.length : 0);
        const ln = p.currentLine, wy0 = L.slotPos(p, 0).y - 0.35;
        p.slots.forEach((o, k) => {
          const q = L.slotPos(p, k);
          if (o) { const units = oms.units(o), picked = o.lines.reduce((s, l) => s + l.picked, 0), t = this.slotTote(p, k, o); this.orderTote(D.box, t.x, t.y, t.z, picked / units); }
          const target = ln && ln.order === o, on = target && Math.sin(this.t * 9) > -0.3;
          (target ? D.lit : D.box).box(q.x - 0.1, wy0 - 0.02, 4.15, q.x + 0.1, wy0 + 0.12, 4.4, on ? '#4ade80' : o ? '#e2e8f0' : '#334155');
        });
      }
      this.onFloor(2);
      for (const pk of oms.packers) {
        const q = L.packerPos(pk.idx);
        if (pk.kind === 'bagger') this.baggerLive(pk, q);
        else if (pk.kind === 'boxer') this.boxMakerLive(pk, q);
        else { D.lit.box(q.x - 0.95, q.y - 0.44, 3.38, q.x - 0.53, q.y - 0.43, 4.22, '#0b1220'); this.screen('pack' + pk.idx, q.x - 0.945, q.x - 0.535, q.y - 0.427, 3.4, 4.2, this.packerScreen(pk)); }
        if (pk.cur && pk.kind === 'manual') {
          const f = pk.t / pk.dur;
          if (f < 0.6) { this.orderTote(D.box, q.x - 0.45, q.y, 2.1, 1 - f / 0.6); this.tote(D.box, q.x - 0.05, q.y - 0.25, q.x + 0.45, q.y + 0.25, 2.1, 0.25 + Math.min(1, f * 1.6) * 0.55, '#b8875a'); } else this.parcel(D.box, q.x - 0.05, q.y - 0.25, q.x + 0.45, q.y + 0.25, 2.1, 0.8, f > 0.8);
        }
        const op = L.packerOperator(pk);
        this.operator(op.x, op.y, 0, !!pk.cur, '#38bdf8');
      }
      for (const it of oms.conveyor) {
        const q = oms.posOnPath(it);
        if (it.kind === 'tote') this.orderTote(D.box, q.x, q.y, q.z ?? 1.6, 1, 0.85);
        else if (it.order.pack === 'bagger') this.bag(D.box, q.x, q.y, 1.4);
        else this.parcel(D.box, q.x - 0.18, q.y - 0.16, q.x + 0.18, q.y + 0.16, 1.4, 0.6, true);
      }
      this.offFloor();
    }

    // ---------------------------------------------------------------- labels
    drawLabels() {
      const sim = this.sim, g = sim.grid, L = sim.layout, bg = 'rgba(15,23,42,0.82)', close = this.cam.dist < 30 || this.cam.walk;
      const at = (f, s, x, y, z, o) => { if (!this.shown(f)) return; this.zLift = this.FZ[f]; this.label(s, x, y, z, Object.assign({ size: 10, bg }, o)); this.zLift = 0; };
      const names = ['GROUND FLOOR', 'FIRST FLOOR', 'SECOND FLOOR'];
      if (!close) for (const f of [0, 1, 2]) at(f, names[f], g.bx0 + 3, g.by1 - 1, 1.5, { size: 11, color: '#f8fafc', weight: 800 });
      for (const p of sim.ports) {
        const st = p.away ? 'BREAK' : p.job ? (p.mode === 'manual' ? 'MANUAL' : 'ACTIVE') : p.inQ.length ? 'INBOUND' : 'WAITING';
        at(p.floor, `${p.code} ${p.kind === 'PICK' ? 'PICK' : 'GOODS-IN'} · ${st}`, p.drop.x + 1, g.D + 0.2, 7.2, { color: p.kind === 'PICK' ? '#fdba74' : '#86efac' });
      }
      if (close) for (const pk of sim.oms.packers) { const q = L.packerPos(pk.idx); at(2, `${pk.name} · ${pk.queue.length} queued`, q.x, q.y, 5, { color: '#7dd3fc' }); }
      const Lk = sim.links;
      at(1, Lk.up.sp ? 'SPIRAL UP' : 'LIFT UP', g.up.cx, g.up.cy, g.FH[1] + 3.5, { color: '#67e8f9' });
      at(1, Lk.down.sp ? 'SPIRAL DOWN' : 'LIFT DOWN', g.down.cx, g.down.cy, g.FH[1] + 3.5, { color: '#67e8f9' });
      at(0, 'TOTE LIFT', g.giX, g.giY, g.FH[0] + 4.5, { color: '#67e8f9' });
      at(0, 'PARCEL SPIRAL', g.parcel.cx, g.parcel.cy, g.FZ[2] + 4, { color: '#c4b5fd' });
      if (this.camera.position.z < (g.by0 + g.by1) / 2) for (const d of sim.docks.doors) at(0, `DOOR ${d.k + 1} · ${d.carrier.name}${d.truck ? ` · ${d.truck.cages.length}/${sim.cfg.truckCages} cages` : ' · no truck'}`, d.x, g.by0 + 0.5, 9.4, { color: CARRIER_COL[d.carrier.code] });
      if (close && (this.camera.position.y < this.FZ[2] * LZ || !this.shown(2))) for (const aisle of sim.aisles) at(1, `AISLE ${aisle.a + 1}`, g.laneX(aisle.a), g.B + 0.3, g.Z + 1.6, { color: '#fde68a' });
    }

    // ---------------------------------------------------------------- following and selection
    // machines at their true height: the store's on the first floor, the tote lifts anywhere
    followPos(id, alpha) {
      const m = this.sim.fleet[id];
      if (m instanceof WS.Vrc) return { x: m.x, y: m.y, z: m.z };
      const p = super.followPos(id, alpha);
      return p && Object.assign({}, p, { z: (p.z || 0) + this.FZ[1] });
    }
    pickFloor() { return null; }
    selectionBox(s, alpha) {
      const sim = this.sim, g = sim.grid, L = sim.layout;
      if (s.kind === 'cell') { const b = super.selectionBox(s, alpha); if (b) b[4] = (b[4] || 0) + this.FZ[1]; return b; }
      if (s.kind === 'port') { const p = sim.ports[s.id]; return [p.drop.x, g.D, p.drop.x + 4.6, g.D + 2.8, this.FZ[p.floor] + 0.03]; }
      if (s.kind === 'packer') { const q = L.packerPos(s.id); return [q.x - 1.1, q.y - 0.65, q.x + 1.1, q.y + 0.65, this.FZ[2] + 0.03]; }
      if (s.kind === 'chute') { const ch = sim.docks.chutes[s.id]; return [ch.x - 0.7, g.cageY - 0.7, ch.x + 0.7, g.sortY, 0.03]; }
      if (s.kind === 'door') { const d = sim.docks.doors[s.id]; return [d.x - 1.8, g.by0 - 14.6, d.x + 1.8, g.by0, YARD + 0.03]; }
      if (s.kind === 'staff') { const c = g.core; return [c.x0, c.y0, c.x1, c.y1, sim.people.lift.z + 0.2]; }
      if (s.kind === 'person') { const P = sim.people.list[s.id]; return P && [P.x - 0.4, P.y - 0.4, P.x + 0.4, P.y + 0.4, this.FZ[P.floor] + P.z + 0.03]; }
      if (s.kind === 'link') { const c = s.id === 'up' ? g.up : s.id === 'down' ? g.down : s.id === 'parcel' ? g.parcel : null; if (c) return [c.cx - c.r - 0.6, c.cy - c.r - 0.6, c.cx + c.r + 0.6, c.cy + c.r + 0.6, s.id === 'parcel' ? 0.03 : this.FZ[1] + 0.03]; return [g.sortX0, g.sortY - 0.5, g.sortX1, g.sortRY + 0.5, g.SZ + 0.3]; }
      if (s.kind === 'canteen') { const C = g.canteen; return [C.x0, C.y0, C.x1, C.y1, 0.03]; }
      return super.selectionBox(s, alpha);
    }
    // Where a storage tote is while it travels, for Follow an order.
    binFocus(bin) {
      const sim = this.sim, g = sim.grid, U = 'Tote';
      if (bin.loc === 'port' && bin.port >= 0) {
        const p = sim.ports[bin.port], q = p.pick === bin ? this.pickPos(p) : sim.layout.portPath(p).head;
        return { abs: true, x: q.x, y: q.y, z: this.FZ[p.floor] + this.CZ, text: `${U} ${bin.id} ${p.pick === bin ? 'is presented' : 'waits'} at ${p.name}` };
      }
      if (bin.loc === 'conveyor') {
        for (const b of sim.net.belts) {
          const t = b.totes.find((x) => x.bin === bin);
          if (!t) continue;
          const z = b.sloped ? t.z : this.FZ[b.floor] + b.z, to = t.port ? t.port.name : 'the racking';
          const what = b.kind === 'spiral' ? `rides the ${b.name} (${t.port ? 'to ' + to : 'back to the store'})` : b.kind === 'loop' ? `rides the ${b.name} to ${to}` : `on the ${b.name}, for ${to}`;
          return { abs: true, x: t.x, y: t.y, z, text: `${U} ${bin.id} ${what}` };
        }
        for (const m of sim.vrcs) if (m.load.some((x) => x.bin === bin)) return { abs: true, x: m.x, y: m.y, z: m.z, text: `${U} ${bin.id} rides the ${m.name.toLowerCase()} between the floors` };
      }
      const f = WS.View3D.prototype.binFocus.call(this, bin);
      if (f && bin.loc === 'buffer') f.z += this.FZ[1];
      if (f) f.abs = true;
      return f;
    }
    // Follow an order through the building: its totes up from the store,
    // the pick, packing, down the parcel spiral, the sorter, the cage, the truck.
    orderFocus(o) {
      const sim = this.sim, g = sim.grid, L = sim.layout, oms = sim.oms, d = sim.docks, FZ = this.FZ;
      const at = (x, y, z, text, step, done) => ({ x, y, z, text, step, done });
      switch (o.status) {
        case 'NEW': case 'BACKORDER': case 'RELEASED': case 'PICKING': case 'PICKED': case 'CONVEYOR': case 'TO_PACK': case 'PACKING': {
          // the shared steps, at the stations and packing upstairs; a tote on its way is where it is (abs)
          const f = WS.View3D.prototype.orderFocus.call(this, o);
          if (f && !f.abs) f.z = (f.z ?? 2) + FZ[2];
          if (f && f.step > 3) f.step = 3;
          return f;
        }
        case 'PACKED': {
          const it = oms.conveyor.find((i) => i.kind === 'parcel' && i.order === o);
          if (it) { const q = oms.posOnPath(it); return at(q.x, q.y, FZ[2] + 1.4, `The parcel (SSCC ${o.sscc}) rides to the parcel spiral`, 4); }
          if (d.parcelQ.includes(o)) { const q = L.dock(); return at(q.x, q.y, FZ[2] + 1.4, 'Waiting to go down the parcel spiral', 4); }
          for (const b of sim.pnet.belts) {
            const t = b.totes.find((x) => x.order === o);
            if (!t) continue;
            const z = b.sloped ? t.z : b.z;
            const text = b.kind === 'spiral' ? `Down the parcel spiral, two floors, to the sorter (${o.carrier.name})` : b.kind === 'chute' ? `Slides down chute ${d.chutes.findIndex((c) => c.belt === b) + 1} into a ${o.carrier.name} roll cage` : `On the sorter loop to a ${o.carrier.name} chute${t.chute ? '' : ': its chutes are closed, it goes round'}`;
            return at(t.x, t.y, z, text, 4);
          }
          for (const ch of d.chutes) if (ch.cage && ch.cage.items.includes(o)) return at(ch.x, g.cageY, 2, `In roll cage ${ch.cage.id} under chute ${ch.idx + 1}, ${ch.cage.items.length}/${sim.cfg.cageCap} parcels`, 4);
          for (const door of d.doors) {
            if (door.loader.carry && door.loader.carry.items && door.loader.carry.items.includes(o)) return at(door.loader.x, door.loader.y, 2, `${door.loader.name} pushes its roll cage to door ${door.k + 1}`, 5);
            const k = door.staged.findIndex((cg) => cg.items.includes(o));
            if (k >= 0) { const s = d.stagedSpot(door, k); return at(s.x, s.y, 2, `Its roll cage waits by door ${door.k + 1} for the next ${door.carrier.name} truck`, 5); }
          }
          break;
        }
        case 'LOADED': case 'SHIPPED': {
          const door = d.doors.find((x) => x.carrier === o.carrier);
          const leaves = door && door.truck ? WS.U.fmtClock(door.due).slice(-8, -3) : '';
          return at(door ? door.x : 0, g.by0 - 4, 3, o.status === 'LOADED' ? `Loaded on the ${o.carrier.name} truck at door ${door.k + 1}, ${WS.U.fmtDur(sim.time - o.created)} after the order came in${leaves ? `; it leaves when full or at ${leaves}` : ''}` : `Shipped: ${WS.U.fmtDur(o.times.shipped - o.created)} from order to truck`, 5, true);
        }
      }
      return at(L.dock().x, L.dock().y, FZ[2] + 1.4, o.status, 4);
    }
  }

  WS.TowerRenderer3D = TowerRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
