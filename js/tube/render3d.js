/* AirPost in the free 3D view: the hospital at its true sizes, one cell a
 * metre. Wings side by side along the street, each floor a slab with its
 * corridor, rooms and furniture: beds on the wards, ICU beds with their
 * monitors, theatres with their lamps, the ED's trolley bays, outpatients'
 * waiting room and a CT scanner. On the ground floor in the middle the
 * pharmacy with its dispensing robot (shelves of packs on both sides of an
 * aisle, a gripper on a mast), the lab with its analysers, and the plant
 * room with the transfer unit, the carrier store and the blowers of the
 * core and lab lines. The tubes are clear and tinted by line: risers up
 * through the floors, a diverter at each floor, runs under the ceilings to
 * the stations on the corridor walls; the leg a line is running glows. The
 * carriers fly through them, coloured by what they carry, land in the
 * baskets, stand in the racks of empties, wait in the transfer unit. Nurses
 * in scrubs load and empty them. Blowers on the roof over each riser; the
 * street with an ambulance at the ED. The Floors slider hides the floors
 * above one, or shows one alone. */
(function (WS) {
  'use strict';
  const LZ = WS.View3D.LZ, CEIL = WS.TUBE_CEIL, ZCOL = WS.TUBE_ZCOL;
  const WALL = '#d7dce4', FLOORC = '#64748b', CORR = '#8693a6', WOOD = '#a47a52', WHITE = '#eef2f7', STEEL = '#64748b';
  const KCOL = { sample: '#ef4444', med: '#22c55e', blood: '#991b1b', empty: '#94a3b8' };
  const SCRUBS = { WARD: '#38bdf8', ICU: '#0ea5e9', OR: '#16a34a', ED: '#1d4ed8', OPD: '#7dd3fc', RAD: '#6366f1', PHARM: '#f1f5f9', LAB: '#f8fafc' };
  const STEPS = ['Loaded', 'Waiting', 'In the tube', 'Transfer', 'Landed', 'Emptied'];
  const lerp = (a, b, t) => (a == null ? b : a + (b - a) * t);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const R_TUBE = 0.15, R_CORE = 0.085, R_CAR = 0.115, L_CAR = 0.46, WALL_H = 0.9; // m: inner walls are cut low, so the tubes and stations show

  class TubeRenderer3D extends WS.View3D {
    get G() { return this.sim.G; }
    get followSteps() { return STEPS; }
    get nF() { return this.G.F + 1; }
    fz(f) { return this.lv(this.G.FZ(f)); }
    floorOfZ(z) { return Math.max(0, Math.min(this.G.F, Math.floor((z + 0.05) / this.G.H))); }
    // the floors shown: as the Floors slider says, and while following or riding something none above its floor
    shown(f) { const o = this.opts, t = o.floorTop; if (o.cutOnly && t != null) return f === t; return f <= Math.min(t ?? Infinity, this.autoTop ?? Infinity); }
    get roofShown() { return this.opts.floorTop == null && this.autoTop == null; }
    updateCamera(dt, alpha) {
      super.updateCamera(dt, alpha);
      const m = this.cam.mode, shot = m === 'tour' ? this.shot : m;
      let p = null;
      if (shot === 'order' && this.followNow) p = this.followNow;
      else if ((shot === 'robot' || shot === 'chase') && this.ride) p = this.followPos(this.ride.id, alpha);
      else if (this.cam.follow != null) p = this.followPos(this.cam.follow, alpha);
      this.autoTop = p ? this.floorOfZ(p.z * LZ) : null;
    }
    onFloor(f) { this.zLift = this.fz(f); this.skip = !this.shown(f); }
    offFloor() { this.zLift = 0; this.skip = false; }
    aimAtFloor() {
      const o = this.opts, k = [o.floorTop, o.cutOnly].join('|');
      if (k === this.floorKey) return;
      const first = this.floorKey === undefined;
      this.floorKey = k;
      if (first) return;
      const f = o.floorTop == null ? 2 : o.floorTop;
      this.leavePreset();
      Object.assign(this.cam, { follow: null, tz: this.fz(f) + this.lv(1.2) });
      if (this.cam.walk) this.walkZ = this.fz(f);
    }
    get eye() { return super.eye + (this.cam.walk ? (this.walkZ || 0) * LZ : 0); }
    setWalk(on) {
      if (on && !this.cam.walk) { let f = 0; for (let k = 0; k < this.nF; k++) if (this.shown(k) && this.cam.tz >= this.fz(k) - 0.5) f = k; this.walkZ = this.fz(f); }
      super.setWalk(on);
      if (!on) this.cam.tz = (this.walkZ || 0) + 2;
    }
    buildKey() { const c = this.sim.cfg; return [super.buildKey(), this.opts.floorTop, this.opts.cutOnly, this.autoTop, c.wings, c.floors, c.zonesPerWing, c.labLine, c.carrierPolicy, c.drugs].join('|'); }
    bounds() { const G = this.G; return { x0: -8, y0: -4, x1: G.X + 8, y1: G.D + 12 }; }
    fit() {
      const G = this.G, c = this.cam;
      // from the street, south-west of the building, its south and west sides cut away
      Object.assign(c, { walk: false, follow: null, tx: G.X * 0.5, ty: G.D * 0.5, tz: this.lv(G.top * 0.42), yaw: -0.38, pitch: 0.3 });
      c.dist = (G.X * 1.06) / Math.min(1, this.w / this.h);
      this.syncWalkButton();
    }
    placeSun() {
      super.placeSun();
      const G = this.G, cx = G.X / 2, cy = G.D / 2, r = Math.hypot(G.X, G.D) / 2 + 24;
      this.sun.position.set(cx - r * 0.5, r * 1.5, cy + r * 0.9); this.sun.target.position.set(cx, 0, cy);
      const sc = this.sun.shadow.camera; sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.far = r * 5; sc.updateProjectionMatrix();
    }
    buildStations() {}
    drawStationsLive() {}
    workLights() {
      return this.sim.ports.filter((p) => p.staffed).map((p) => ({ x: p.x, y: p.y + 0.8, f: p.f }));
    }
    startShot(shot) {
      if (shot !== 'station') return super.startShot(shot);
      this.shot = shot; this.shotT = 0;
      const ls = this.workLights();
      this.stationK = ((this.stationK ?? -1) + 1) % ls.length;
      const p = ls[this.stationK];
      Object.assign(this.cam, { tx: p.x, ty: p.y, tz: this.fz(p.f) + this.lv(1.2), dist: 6.5, pitch: 0.32, yaw: 0.4 });
    }

    // ---------------------------------------------------------------- static
    buildStatic() {
      const T = WS.View3D.THREE, G = this.G, S = this.st;
      if (!this.ground) {
        this.ground = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ color: '#1a2230', roughness: 0.95 }));
        this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; this.scene.add(this.ground);
      }
      this.ground.scale.set(G.X + 160, G.D + 120, 1); this.ground.position.set(G.X / 2, -0.01, G.D / 2 + 10);
      this.ground.material.color.set(this.dark ? '#090d14' : '#1d2632');
            // The building stays in the background: slabs and facade faint and see-through, walls and furniture dimmed
      // (a material's colour multiplies every part's). The tubes' cores and the carriers are drawn after the
      // see-through parts, so they show through the floors bright; solid walls still hide them.
      if (!this.ghost) {
        const T3 = WS.View3D.THREE, Bt = this.st.box.constructor;
        this.ghostMat = new T3.MeshStandardMaterial({ roughness: 0.9, metalness: 0.02, transparent: true, opacity: 0.2, depthWrite: false, color: '#687284' });
        const dim = new T3.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, color: '#5c6678' });
        const B = (geo, mat, cap, o) => new Bt(this, this.geos[geo], mat, Object.assign({ cap }, o));
        this.ghost = { slab: B('box', this.ghostMat, 1024, { shadow: false }), box: B('box', dim, 8192, { cast: false }), cyl: B('cyl', dim, 512, { cast: false }), rnd: B('rnd', dim, 256, { cast: false }), dome: B('dome', dim, 64, { cast: false }) };
        const over = (mat, geo, cap) => { const b = new Bt(this, this.geos[geo], mat, { shadow: false, cap }); b.mesh.renderOrder = 5; return b; };
        const core = new T3.MeshBasicMaterial({ transparent: true, opacity: 1, toneMapped: false });
        const body = new T3.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1, transparent: true, opacity: 1 });
        // and once more through everything, faint: a tube or carrier behind a wall still shows where it is
        const xray = new T3.MeshBasicMaterial({ transparent: true, opacity: 0.38, toneMapped: false, depthTest: false, depthWrite: false });
        this.tubesB = { glass: this.newBatch('cyl', 'clear', 2048, { shadow: false }), tint: over(core, 'cyl', 2048), xray: over(xray, 'cyl', 2048) };
        this.carB = { cyl: over(body, 'cyl', 512), litCyl: over(core, 'cyl', 512), xray: over(xray, 'cyl', 512) };
        this.tubesB.xray.mesh.renderOrder = this.carB.xray.mesh.renderOrder = 6;
      }
      const Gh = this.ghost, GS = { slab: Gh.slab, box: Gh.box, cyl: Gh.cyl, rnd: Gh.rnd, dome: Gh.dome, lit: S.lit, litCyl: S.litCyl, clear: S.clear, glass: S.glass };
      for (const b of Object.values(Gh)) b.begin();
      for (const b of Object.values(this.tubesB)) b.begin();
      for (let f = 0; f < this.nF; f++) this.floor(GS, f);
      this.offFloor();
      this.tubes(S);
      this.stationsStatic(S);
      this.plantRoom(S, GS);
      this.pharmacyStatic(S);
      this.roof(S);
      this.street(GS);
      this.offFloor();
      for (const b of Object.values(this.tubesB)) b.end();
      for (const b of Object.values(Gh)) b.end();
    }
    // a floor: the slab, corridor and rooms, walls with door gaps, and what stands in the rooms
    floor(S, f) {
      const G = this.G, lv = (m) => this.lv(m), wallH = lv(WALL_H), t = 0.06;
      this.onFloor(f);
      // the slab: its underside a little below, so the ceiling shows from the floor below
      (S.slab || S.box).box(-0.2, -0.2, -lv(0.3), G.X + 0.2, G.D + 0.2, -lv(0.005), f ? '#6e7888' : '#566070');
      (S.slab || S.box).box(0, 7.6, 0, G.X, 10, lv(0.012), CORR);
      for (let w = 0; w < G.nW; w++) {
        const x0 = w * G.WW, x1 = x0 + G.WW, centreGround = !f && w === G.ci;
        // rooms on both sides of the corridor, every 4 m (the centre of the ground floor has its own)
        if (!centreGround) {
          for (const [ya, yb, door] of [[0.2, 7.6, 7.6], [10, G.D - 0.2, 10]]) {
            for (let x = x0; x <= x1 + 0.01; x += 4) S.box.box(x - t, ya, 0, x + t, yb, wallH, WALL);
            for (let x = x0; x < x1 - 0.01; x += 4) {
              S.box.box(x, door - t, 0, x + 1.4, door + t, wallH, WALL); S.box.box(x + 2.6, door - t, 0, x + 4, door + t, wallH, WALL);
            }
          }
          // the shaft room round the riser
          const xr = G.riserX(w, 0);
          S.glass.box(xr - 1.1, 4.6, 0, xr + 1.5, 4.6 + t * 2, lv(3.0), '#bfdbfe');
          // behind the station a full-height panel of the corridor wall
          S.box.box(G.stX(w) - 1.2, 7.6 - t, 0, G.stX(w) + 1.4, 7.6 + t, lv(3.0), '#c7cdd6');
        } else {
          S.box.box(x0, 10 - t, 0, x1, 10 + t, lv(1.0), WALL);
          S.glass.box(x0, 10 - 0.03, lv(1.0), x1, 10 + 0.03, lv(2.6), '#9cc9f0');
        }
        this.furnish(S, f, w);
      }
      // the cross walls between the wings, open at the corridor
      for (let w = 0; w <= G.nW; w++) { const x = w * G.WW; S.box.box(x - 0.1, 0, 0, x + 0.1, 7.6, wallH, '#c7cdd6'); S.box.box(x - 0.1, 10, 0, x + 0.1, G.D, wallH, '#c7cdd6'); }
      // lights along the corridor ceiling
      if (f < G.F || this.roofShown) for (let x = 2; x < G.X; x += 4) (this.dark ? S.box : S.lit).box(x, 8.6, lv(3.66), x + 1.2, 9.0, lv(3.68), this.dark ? '#273244' : '#f8fafc');
      this.facade(S, f);
    }
    // what stands in one wing on one floor
    furnish(S, f, w) {
      const G = this.G, lv = (m) => this.lv(m), x0 = w * G.WW, type = this.wingType(f, w);
      const bed = (x, y, a, icu) => {
        S.box.rbox(x, y, a, -0.48, -1.0, lv(0.25), 0.48, 1.0, lv(0.58), '#cbd5e1');
        S.box.rbox(x, y, a, -0.45, -0.95, lv(0.58), 0.45, 0.95, lv(0.66), WHITE);
        S.box.rbox(x, y, a, -0.4, -0.95, lv(0.66), 0.4, -0.6, lv(0.74), '#f8fafc');
        S.box.rbox(x, y, a, -0.47, -1.04, lv(0.25), 0.47, -0.98, lv(1.05), '#94a3b8');
        S.box.rbox(x, y, a, -0.44, -0.2, lv(0.66), 0.44, 0.9, lv(0.7), type === 'ICU' ? '#9fb1c4' : '#a8b4c4');
        if (icu) { S.box.rbox(x, y, a, 0.62, -1.0, 0, 0.72, -0.9, lv(1.6), STEEL); S.lit.rbox(x, y, a, 0.55, -0.98, lv(1.35), 0.85, -0.93, lv(1.6), '#22c55e'); }
      };
      if (type === 'WARD' || type === 'ICU') {
        for (let x = x0; x < x0 + G.WW - 0.01; x += 4) {
          bed(x + 1.1, G.D - 1.4, 0, type === 'ICU'); bed(x + 2.9, G.D - 1.4, 0, type === 'ICU');
          if (x - x0 < 8 || x - x0 > 15) bed(x + 2.0, 1.3, Math.PI, type === 'ICU');
        }
        // the nurses' station in the corridor by the tube station
        const sx = G.stX(w);
        S.box.box(sx - 3.0, 8.0, 0, sx - 0.9, 8.55, lv(1.05), WOOD); S.box.box(sx - 3.05, 7.95, lv(1.05), sx - 0.85, 8.6, lv(1.1), '#e7e5e4');
        S.lit.box(sx - 2.4, 8.05, lv(1.1), sx - 1.9, 8.09, lv(1.4), '#0ea5e9');
      } else if (type === 'OR') {
        for (const x of [x0 + 2, x0 + 10, x0 + 18]) {
          S.box.box(x - 0.3, G.D - 4.3, 0, x + 0.3, G.D - 3.7, lv(0.75), STEEL); S.box.box(x - 0.35, G.D - 5.0, lv(0.75), x + 0.35, G.D - 3.0, lv(0.88), '#0f766e');
          S.cyl.cyl(x, G.D - 4.0, lv(2.3), lv(3.6), 0.04, STEEL); S.litCyl.cyl(x, G.D - 4.0, lv(2.15), lv(2.3), 0.38, '#fefce8');
          S.box.box(x + 1.0, G.D - 3.0, 0, x + 1.6, G.D - 2.6, lv(1.4), '#334155'); S.lit.box(x + 1.02, G.D - 3.02, lv(1.0), x + 1.58, G.D - 2.99, lv(1.35), '#22d3ee');
        }
      } else if (type === 'ED') {
        for (let x = x0 + 1.2; x < x0 + G.WW - 1; x += 2.4) {
          S.box.box(x - 0.4, G.D - 2.9, lv(0.5), x + 0.4, G.D - 1.0, lv(0.62), WHITE);
          S.box.box(x - 0.35, G.D - 2.8, lv(0.2), x + 0.35, G.D - 1.1, lv(0.5), STEEL);
          S.clear.box(x + 1.15, G.D - 3.6, lv(0.3), x + 1.2, G.D - 0.3, lv(2.3), '#5eead4');
        }
        S.box.box(x0 + 3, 1.0, 0, x0 + 7, 1.6, lv(1.05), WOOD);
      } else if (type === 'OPD') {
        for (let r = 0; r < 3; r++) for (let x = x0 + 2; x < x0 + 14; x += 0.6) S.box.box(x, G.D - 3 - r * 1.2, lv(0.42), x + 0.5, G.D - 2.55 - r * 1.2, lv(0.5), '#2563eb');
        S.box.box(x0 + 16, G.D - 4, 0, x0 + 20, G.D - 3.3, lv(1.05), WOOD);
      } else if (type === 'RAD') {
        const x = x0 + 8, y = G.D - 4;
        S.box.box(x - 1.1, y - 0.4, 0, x + 1.1, y + 0.4, lv(2.0), '#e5e7eb'); S.box.box(x - 0.45, y - 0.42, lv(0.6), x + 0.45, y + 0.42, lv(1.4), '#1e293b');
        S.box.box(x - 0.25, y - 2.4, lv(0.55), x + 0.25, y + 0.2, lv(0.7), WHITE);
      } else if (type === 'LAB') {
        const lx = G.lab.x;
        for (const y of [5.0, 6.8]) { S.box.box(lx - 0.5, y - 0.35, 0, x0 + G.WW - 1.2, y + 0.35, lv(0.9), '#e7e5e4'); for (let x = lx + 0.4; x < x0 + G.WW - 2; x += 1.6) { S.box.box(x, y - 0.3, lv(0.9), x + 1.1, y + 0.3, lv(1.6), '#f1f5f9'); S.lit.box(x + 0.2, y + 0.305, lv(1.25), x + 0.6, y + 0.31, lv(1.45), '#38bdf8'); } }
        S.box.box(lx + 2, 0.6, 0, x0 + G.WW - 1.2, 1.2, lv(1.9), '#cbd5e1');
        for (let x = lx + 2.2; x < x0 + G.WW - 1.5; x += 1.4) S.lit.box(x, 1.205, lv(1.2), x + 1.0, 1.21, lv(1.7), '#e0f2fe');
        // the main entrance's reception in front, the lab's room walls
        S.box.box(G.x0c + 9, 12.5, 0, G.x0c + 15, 13.2, lv(1.1), WOOD); S.box.box(G.x0c + 8.95, 12.45, lv(1.1), G.x0c + 15.05, 13.25, lv(1.15), '#e7e5e4');
        for (let r = 0; r < 2; r++) for (let x = G.x0c + 3; x < G.x0c + 21; x += 0.6) if (x < G.x0c + 8 || x > G.x0c + 16) S.box.box(x, 15 + r * 1.3, lv(0.42), x + 0.5, 15.45 + r * 1.3, lv(0.5), '#0d9488');
        S.box.box(G.x0c + 13.6, 0.2, 0, G.x0c + 13.7, 7.6, lv(WALL_H), WALL); S.box.box(G.x0c + 13.6, 7.55, 0, x0 + G.WW, 7.65, lv(WALL_H), WALL); S.box.box(G.lab.x - 1.0, 7.55, 0, G.lab.x + 1.4, 7.65, lv(3.0), '#c7cdd6');
      }
    }
    // the department on a floor of a wing
    wingType(f, w) {
      const G = this.G;
      if (f === 0) return w === G.ci ? 'LAB' : w === 0 ? 'ED' : w === G.nW - 1 ? 'OPD' : 'RAD';
      if (f === 1 && w === 0) return 'OR';
      if (f === 1 && w === G.ci) return 'ICU';
      return 'WARD';
    }
    // the outside of a floor: a spandrel at the slab and a band of windows; on the camera's side only the spandrel
    facade(S, f) {
      const G = this.G, lv = (m) => this.lv(m), T = 0.25, top = lv(G.H - 0.3);
      if (!this.walls) {
        this.walls = {};
        const B = (cap) => new this.st.box.constructor(this, this.geos.box, this.ghostMat, { shadow: false, cap }); // see-through, like the slabs
        for (const k of ['N', 'S', 'W', 'E']) this.walls[k] = { full: B(2048), glass: this.newBatch('box', 'glass', 256, { shadow: false }), low: B(512) };
      }
      if (f === 0) for (const W of Object.values(this.walls)) { W.full.begin(); W.glass.begin(); W.low.begin(); }
      const put = (B, side, s0, s1, t0, t1, z0, z1, c) => {
        if (side === 'N') B.box(s0, -t1, z0, s1, -t0, z1, c);
        else if (side === 'S') B.box(s0, G.D + t0, z0, s1, G.D + t1, z1, c);
        else if (side === 'W') B.box(-t1, s0, z0, -t0, s1, z1, c);
        else B.box(G.X + t0, s0, z0, G.X + t1, s1, z1, c);
      };
      const glass = this.dark ? '#16223a' : '#9cc9f0';
      for (const side of ['N', 'S', 'W', 'E']) {
        const Wb = this.walls[side], len = side === 'N' || side === 'S' ? G.X : G.D;
        put(Wb.full, side, -T, len + T, 0, T, -lv(0.3), lv(0.9), '#cbd5e1');
        put(Wb.glass, side, 0, len, 0.08, 0.14, lv(0.9), lv(2.9), glass);
        for (let r = 0; r <= len; r += 1.5) put(Wb.full, side, r - 0.05, r + 0.05, 0, 0.2, lv(0.9), top, '#94a3b8');
        put(Wb.full, side, -T, len + T, 0, T, lv(2.9), top + lv(0.3), '#e2e8f0');
        put(Wb.low, side, -T, len + T, 0, T, -lv(0.3), lv(0.9), '#cbd5e1');
        put(Wb.low, side, -T, len + T, -0.02, T + 0.02, lv(0.9), lv(0.96), '#94a3b8');
      }
      if (f === this.nF - 1) for (const W of Object.values(this.walls)) { W.full.end(); W.glass.end(); W.low.end(); }
    }
    cutaway() {
      if (!this.walls) return;
      const p = this.camera.position, G = this.G, out = { N: p.z < 0, S: p.z > G.D, W: p.x < 0, E: p.x > G.X };
      for (const [k, W] of Object.entries(this.walls)) { W.full.mesh.visible = W.glass.mesh.visible = !out[k]; W.low.mesh.visible = out[k]; }
    }
    buildHall() { this.hallRect = { x0: 0, y0: 0, x1: this.G.X, y1: this.G.D }; this.hallTop = this.lv(this.G.top); this.applyLights(this.workLights()); }
    applyLights(lights) {
      const dark = this.dark, bg = dark ? '#03060c' : '#0b1220';
      this.renderer.setClearColor(bg); this.scene.fog.color.set(bg);
      this.hemi.intensity = dark ? 0.22 : 1.6; this.hemi.color.set(dark ? '#7d8fc9' : '#c7d7ff');
      this.sun.intensity = dark ? 0.08 : 2.3;
      const T = WS.View3D.THREE, n = dark ? Math.min(24, lights.length) : 0;
      while (this.spots.length < n) { const sp = new T.SpotLight('#ffe9c4', 1, 0, 0.6, 0.65, 2); this.scene.add(sp, sp.target); this.spots.push(sp); }
      this.spots.forEach((sp, k) => {
        sp.visible = k < n && this.shown(lights[k].f);
        if (k >= n) return;
        const p = lights[k], z0 = this.G.FZ(p.f), h = this.lv(3.4) * LZ;
        sp.position.set(p.x, z0 + h, p.y); sp.target.position.set(p.x, z0, p.y); sp.angle = Math.atan(2.6 / h); sp.intensity = 3.2 * h * h;
      });
    }

    // ---------------------------------------------------------------- the tubes
    // every segment of every line once: clear, tinted with the line's colour; a diverter where a branch leaves the riser
    tubes(S) {
      const G = this.G, sim = this.sim, seen = new Set();
      for (const Z of sim.zones) {
        const col = ZCOL[Z.k % ZCOL.length], pick = { kind: 'robot', id: Z.id };
        for (const st of Z.stations) {
          const pts = Z.routes.get(st);
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i], key = Z.k + ':' + [a.x, a.y, a.z, b.x, b.y, b.z].map((v) => v.toFixed(2)).join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            this.tubeSeg(a, b, col, pick);
          }
          // the diverter where the station's branch leaves the riser or the run
          const j = pts[pts.length - 4];
          if (j) { this.skip = !this.shown(this.floorOfZ(j.z)); S.box.box(j.x - 0.16, j.y - 0.16, this.lv(j.z - 0.16), j.x + 0.16, j.y + 0.16, this.lv(j.z + 0.16), '#94a3b8', pick); this.skip = false; }
        }
        // the blower: on the roof over a riser, else in the plant room
        const b = Z.blower, f = this.floorOfZ(b.z - 0.5);
        this.skip = Z.riser ? (Z.blower.z > G.top ? !this.roofShown : !this.shown(f)) : !this.shown(0);
        const z0 = this.lv(Z.riser ? b.z - 0.5 : 0);
        S.box.box(b.x - 0.45, b.y - 0.35, z0, b.x + 0.45, b.y + 0.35, z0 + this.lv(0.9), '#475569', pick);
        S.cyl.cylX(b.x - 0.5, b.x + 0.5, b.y, z0 + this.lv(0.45), 0.28, '#334155', pick);
        S.box.box(b.x - 0.47, b.y - 0.37, z0 + this.lv(0.9), b.x + 0.47, b.y + 0.37, z0 + this.lv(0.96), col, pick);
        this.skip = false;
      }
    }
    tubeSeg(a, b, col, pick) {
      const lv = (m) => this.lv(m), T = this.tubesB, f = this.floorOfZ(Math.min(a.z, b.z));
      this.skip = !this.shown(f);
      if (Math.abs(a.z - b.z) > 1e-6) {
        // a riser: drawn floor by floor, so the Floors slider can hide what is above
        const z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
        for (let z = z0; z < z1 - 1e-6;) {
          const fl = this.floorOfZ(z), ze = Math.min(z1, this.G.FZ(fl + 1) + (fl + 1 > this.G.F ? 99 : 0));
          const zz = Math.min(z1, Math.max(z + 0.01, ze));
          this.skip = !this.shown(fl);
          T.glass.cyl(a.x, a.y, lv(z), lv(zz), R_TUBE, '#dbeafe', pick);
          T.tint.cyl(a.x, a.y, lv(z), lv(zz), R_CORE, col, pick); T.xray.cyl(a.x, a.y, lv(z), lv(zz), R_CORE, col);
          z = zz;
        }
      } else if (Math.abs(a.x - b.x) > 1e-6) { T.glass.cylX(Math.min(a.x, b.x), Math.max(a.x, b.x), a.y, lv(a.z), R_TUBE, '#dbeafe', pick); T.tint.cylX(Math.min(a.x, b.x), Math.max(a.x, b.x), a.y, lv(a.z), R_CORE, col, pick); T.xray.cylX(Math.min(a.x, b.x), Math.max(a.x, b.x), a.y, lv(a.z), R_CORE, col); }
      else if (Math.abs(a.y - b.y) > 1e-6) { T.glass.cylY(a.x, Math.min(a.y, b.y), Math.max(a.y, b.y), lv(a.z), R_TUBE, '#dbeafe', pick); T.tint.cylY(a.x, Math.min(a.y, b.y), Math.max(a.y, b.y), lv(a.z), R_CORE, col, pick); T.xray.cylY(a.x, Math.min(a.y, b.y), Math.max(a.y, b.y), lv(a.z), R_CORE, col); }
      this.skip = false;
    }
    // the stations on the corridor walls: the unit with its send dock and display, the basket below, the rack of empties beside
    stationsStatic(S) {
      const lv = (m) => this.lv(m);
      for (const p of this.sim.ports) {
        if (p.type === 'STORE') continue;
        this.onFloor(p.f);
        const pick = { kind: 'port', id: p.idx }, x = p.x, y0 = p.y - 0.2, col = ZCOL[p.zone.k % ZCOL.length];
        S.box.box(x - 0.3, y0, lv(0.95), x + 0.3, y0 + 0.34, lv(2.05), '#e5e7eb', pick);
        S.box.box(x - 0.31, y0 + 0.34, lv(1.98), x + 0.31, y0 + 0.36, lv(2.05), col, pick);
        S.box.box(x - 0.12, y0 + 0.3, lv(1.5), x + 0.12, y0 + 0.36, lv(1.95), '#1f2937', pick);
        // the basket: a wire frame under the unit
        S.box.box(x - 0.3, y0, lv(0.5), x + 0.3, y0 + 0.4, lv(0.53), '#475569', pick);
        for (const s of [-1, 1]) S.box.box(x + s * 0.3 - 0.015, y0, lv(0.5), x + s * 0.3 + 0.015, y0 + 0.4, lv(0.8), '#64748b', pick);
        S.box.box(x - 0.3, y0 + 0.385, lv(0.5), x + 0.3, y0 + 0.4, lv(0.72), '#64748b', pick);
        // the rack of empties
        S.box.box(x + 0.4, y0, lv(0.45), x + 1.0, y0 + 0.2, lv(0.48), '#475569', pick);
        S.box.box(x + 0.4, y0, lv(0.86), x + 1.0, y0 + 0.2, lv(0.88), '#475569', pick);
      }
      this.offFloor();
    }
    // the plant room: the transfer unit with its rails, the carrier store, electrical cabinets
    plantRoom(S, GS) {
      const G = this.G, lv = (m) => this.lv(m), U = G.tu, pick = { kind: 'robot', id: this.sim.tu.id };
      this.onFloor(0);
      S.box.box(U.x - U.w / 2 - 0.2, U.y - 0.45, 0, U.x + U.w / 2 + 0.2, U.y + 0.45, lv(0.6), '#334155', pick);
      for (const s of [-1, 1]) S.box.box(U.x + s * (U.w / 2 + 0.15) - 0.05, U.y - 0.4, lv(0.6), U.x + s * (U.w / 2 + 0.15) + 0.05, U.y + 0.4, lv(2.15), '#475569', pick);
      S.box.box(U.x - U.w / 2 - 0.2, U.y - 0.45, lv(2.1), U.x + U.w / 2 + 0.2, U.y + 0.45, lv(2.2), '#475569', pick);
      S.clear.box(U.x - U.w / 2 - 0.15, U.y + 0.4, lv(0.6), U.x + U.w / 2 + 0.15, U.y + 0.43, lv(2.1), '#bfdbfe');
      for (let k = 0; k < 3; k++) { S.box.box(G.x0c + 11.0 + k * 0.7, 0.25, 0, G.x0c + 11.6 + k * 0.7, 0.7, lv(2.0), '#64748b'); S.lit.box(G.x0c + 11.1 + k * 0.7, 0.705, lv(1.6), G.x0c + 11.2 + k * 0.7, 0.71, lv(1.7), '#4ade80'); }
      // the plant room's walls
      GS.box.box(G.x0c + 10.4, 0.2, 0, G.x0c + 10.5, 7.6, lv(WALL_H), WALL);
      GS.box.box(G.x0c, 7.55, 0, G.x0c + 10.4, 7.65, lv(WALL_H), WALL);
      // the carrier store: a rack of upright tubes
      if (this.sim.store) { const s = G.store; S.box.box(s.x - 0.45, s.y - 0.7, 0, s.x + 0.45, s.y + 0.7, lv(0.4), '#475569', { kind: 'port', id: this.sim.store.idx }); S.box.box(s.x - 0.45, s.y - 0.7, lv(1.1), s.x + 0.45, s.y + 0.7, lv(1.14), '#475569', { kind: 'port', id: this.sim.store.idx }); }
      this.offFloor();
    }
    // the pharmacy: the robot's cabinet (glass walls, shelves both sides of its aisle, the rails), the bench, ordinary shelves
    pharmacyStatic(S) {
      const G = this.G, lv = (m) => this.lv(m), C = G.cab, pick = { kind: 'robot', id: this.sim.robot.id };
      this.onFloor(0);
      for (const side of [-1, 1]) {
        const y = C.y + side * 0.42;
        S.box.box(C.x0, y - 0.18, 0, C.x1, y + 0.18, lv(0.15), '#334155', pick);
        for (let r = 0; r < 11; r++) S.box.box(C.x0, y - 0.18, lv(0.23 + r * 0.2), C.x1, y + 0.18, lv(0.25 + r * 0.2), '#cbd5e1', pick);
        for (let x = C.x0; x <= C.x1 + 0.01; x += (C.x1 - C.x0) / 4) S.box.box(x - 0.02, y - 0.18, 0, x + 0.02, y + 0.18, lv(C.h), '#94a3b8', pick);
        S.glass.box(C.x0 - 0.1, y + side * 0.2 - 0.01, 0, C.x1 + 0.4, y + side * 0.2 + 0.01, lv(C.h + 0.2), '#bfdbfe');
      }
      S.box.box(C.x0 - 0.1, C.y - 0.62, lv(C.h + 0.15), C.x1 + 0.4, C.y + 0.62, lv(C.h + 0.25), '#475569', pick);
      for (const y of [C.y - 0.1, C.y + 0.1]) S.box.box(C.x0 - 0.1, y - 0.02, lv(C.h + 0.08), C.x1 + 0.3, y + 0.02, lv(C.h + 0.15), '#94a3b8', pick);
      S.box.box(C.x0 - 0.1, C.y - 0.1, 0, C.x1 + 0.3, C.y + 0.1, lv(0.05), '#94a3b8', pick);
      // the output chute and the pharmacist's bench; the input tray at the other end
      S.box.beam(C.out, C.y, lv(1.0), C.out + 0.55, C.y + 0.1, lv(0.92), 0.25, lv(0.04), '#94a3b8', pick);
      S.box.box(C.out + 0.3, C.y - 0.5, 0, C.out + 1.3, C.y + 0.4, lv(0.9), WOOD); S.box.box(C.out + 0.28, C.y - 0.52, lv(0.9), C.out + 1.32, C.y + 0.42, lv(0.94), '#e7e5e4');
      S.box.box(C.inX - 0.3, C.y - 0.3, 0, C.inX + 0.2, C.y + 0.3, lv(0.85), '#475569', pick);
      // the pharmacy's other shelves along the north wall and its walls
      S.box.box(G.x0c + 1.0, 0.25, 0, G.x0c + 9.5, 0.7, lv(2.1), '#cbd5e1');
      for (let x = G.x0c + 1.1; x < G.x0c + 9.4; x += 0.35) for (const z of [0.5, 1.0, 1.5]) S.box.box(x, 0.68, lv(z), x + 0.25, 0.72, lv(z + 0.2), ['#fca5a5', '#bfdbfe', '#fde68a', '#bbf7d0'][Math.floor(x * 3 + z * 2) % 4]);
      this.offFloor();
    }
    roof(S) {
      if (!this.roofShown) return;
      const G = this.G, lv = (m) => this.lv(m), z = this.lv(G.top);
      S.box.box(-0.25, -0.25, z - lv(0.3), G.X + 0.25, G.D + 0.25, z, '#5b6474');
      for (const [a, b, c, d] of [[-0.25, -0.25, G.X + 0.25, 0], [-0.25, G.D, G.X + 0.25, G.D + 0.25], [-0.25, -0.25, 0, G.D + 0.25], [G.X, -0.25, G.X + 0.25, G.D + 0.25]]) S.box.box(a, b, z, c, d, z + lv(0.9), '#6b7585');
      // a helipad over the centre wing
      const cx = G.x0c + G.WW / 2, cy = G.D / 2 + 2;
      S.cyl.cyl(cx, cy, z, z + lv(0.06), 4.2, '#334155'); S.box.box(cx - 1.2, cy - 0.2, z + lv(0.06), cx + 1.2, cy + 0.2, z + lv(0.08), '#f8fafc');
      for (const s of [-1, 1]) S.box.box(cx + s * 1.0 - 0.2, cy - 1.4, z + lv(0.06), cx + s * 1.0 + 0.2, cy + 1.4, z + lv(0.08), '#f8fafc');
    }
    // the street in front, the ED's canopy and an ambulance under it
    street(S) {
      const G = this.G, lv = (m) => this.lv(m), Y = G.D;
      S.box.box(-40, Y + 0.3, 0, G.X + 40, Y + 2.6, lv(0.12), '#7c8594');
      S.box.box(-40, Y + 2.6, 0, G.X + 40, Y + 10, lv(0.02), '#2a2f38');
      for (let x = -38; x < G.X + 38; x += 6) S.box.box(x, Y + 6.2, lv(0.02), x + 3, Y + 6.35, lv(0.03), '#e2e8f0');
      S.box.box(1, Y + 0.3, lv(3.3), 9, Y + 4.5, lv(3.5), '#e2e8f0'); for (const x of [1.3, 8.7]) S.cyl.cyl(x, Y + 4.3, 0, lv(3.3), 0.1, '#94a3b8');
      S.lit.box(3, Y + 0.28, lv(3.5), 7, Y + 0.32, lv(3.9), '#ef4444');
      const ax = 5, ay = Y + 3.2;
      S.rnd.box(ax - 3, ay - 1.05, lv(0.35), ax + 2.4, ay + 1.05, lv(2.6), '#f8fafc'); S.box.box(ax - 3.02, ay - 1.07, lv(1.2), ax + 2.42, ay + 1.07, lv(1.45), '#16a34a');
      S.box.box(ax + 1.4, ay - 1.0, lv(1.5), ax + 2.42, ay + 1.0, lv(2.3), '#1e293b');
      S.lit.box(ax - 2.0, ay - 0.6, lv(2.6), ax - 1.5, ay + 0.6, lv(2.75), '#3b82f6');
      for (const x of [ax - 2.0, ax + 1.4]) for (const s of [-1, 1]) S.cyl.cylY(x, ay + s * 1.05 - 0.15, ay + s * 1.05 + 0.15, lv(0.38), 0.36, '#111317');
    }

    // ---------------------------------------------------------------- live
    drawLive(alpha) {
      for (const b of Object.values(this.carB)) b.begin();
      this.drawLiveParts(alpha);
      for (const b of Object.values(this.carB)) b.end();
    }
    drawLiveParts(alpha) {
      this.alpha = alpha; this.now = this.sim.time + alpha * this.sim.cfg.tick;
      const sim = this.sim;
      this.drawPacks();
      for (const Z of sim.zones) this.drawZone(Z, alpha);
      for (const p of sim.ports) this.drawStation(p);
      this.drawTU(alpha);
      this.drawRobot(alpha);
      this.offFloor();
    }
    // a carrier: a capsule along axis ('x', 'y' or 'z') centred at (x, y, z m), its colour what it carries
    carrier(cr, x, y, z, axis, moving) {
      const lv = (m) => this.lv(m), D = this.carB, k = cr.contents ? cr.contents.kind : 'empty', col = KCOL[k], pick = { kind: 'carrier', id: cr.id }, h = L_CAR / 2;
      const band = cr.contents && cr.contents.stat ? '#fde047' : '#e2e8f0';
      if (axis === 'z') { D.cyl.cyl(x, y, lv(z - h), lv(z + h), R_CAR, col, pick); if (moving) D.xray.cyl(x, y, lv(z - h), lv(z + h), R_CAR, col); D.litCyl.cyl(x, y, lv(z - 0.03), lv(z + 0.03), R_CAR + 0.004, band, pick); }
      else if (axis === 'x') { D.cyl.cylX(x - h, x + h, y, lv(z), R_CAR, col, pick); if (moving) D.xray.cylX(x - h, x + h, y, lv(z), R_CAR, col); D.litCyl.cylX(x - 0.03, x + 0.03, y, lv(z), R_CAR + 0.004, band, pick); }
      else { D.cyl.cylY(x, y - h, y + h, lv(z), R_CAR, col, pick); if (moving) D.xray.cylY(x, y - h, y + h, lv(z), R_CAR, col); D.litCyl.cylY(x, y - 0.03, y + 0.03, lv(z), R_CAR + 0.004, band, pick); }
    }
    // a line: the leg it runs glows; its carrier in the tube; the blower's lamp
    drawZone(Z, alpha) {
      const sim = this.sim, L = Z.leg, lv = (m) => this.lv(m), col = ZCOL[Z.k % ZCOL.length];
      if (L) {
        for (let i = 1; i < L.pts.length; i++) {
          const a = L.pts[i - 1], b = L.pts[i];
          this.skip = !this.shown(this.floorOfZ(Math.min(a.z, b.z)));
          if (Math.abs(a.z - b.z) > 1e-6) {
            const z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
            for (let z = z0; z < z1 - 1e-6;) { const fl = this.floorOfZ(z), zz = Math.min(z1, Math.max(z + 0.01, this.G.FZ(fl + 1) + (fl >= this.G.F ? 99 : 0))); this.skip = !this.shown(fl); this.dy.litCyl.cyl(a.x, a.y, lv(z), lv(zz), 0.02, col); z = zz; }
          } else if (Math.abs(a.x - b.x) > 1e-6) this.dy.litCyl.cylX(Math.min(a.x, b.x), Math.max(a.x, b.x), a.y, lv(a.z), 0.02, col);
          else if (Math.abs(a.y - b.y) > 1e-6) this.dy.litCyl.cylY(a.x, Math.min(a.y, b.y), Math.max(a.y, b.y), lv(a.z), 0.02, col);
        }
        if (L.cr.state === 'IN_TUBE') {
          const p = sim.legPos(L, lerp(Z.os, Z.s, alpha));
          this.skip = !this.shown(this.floorOfZ(p.z));
          this.carrier(L.cr, p.x, p.y, p.z, Math.abs(p.dz) > 1e-6 ? 'z' : Math.abs(p.dx) > 1e-6 ? 'x' : 'y', true);
        }
      }
      const b = Z.blower;
      this.skip = Z.riser ? (b.z > this.G.top ? !this.roofShown : !this.shown(this.floorOfZ(b.z - 0.5))) : !this.shown(0);
      const z0 = this.lv(Z.riser ? b.z - 0.5 : 0);
      this.dy.lit.box(b.x - 0.1, b.y + 0.355, z0 + lv(0.55), b.x + 0.1, b.y + 0.37, z0 + lv(0.7), Z.down ? '#ef4444' : L ? col : '#334155');
      this.skip = false;
    }
    // a station's carriers: in the send dock, waiting on the counter, in the basket, in the rack, in a nurse's hands; the nurse
    drawStation(p) {
      const sim = this.sim, x = p.x, y0 = p.y - 0.2;
      this.onFloor(p.f);
      if (p.type === 'STORE') {
        p.empties.forEach((cr, k) => { const i = k % 6, j = Math.floor(k / 6) % 4, l = Math.floor(k / 24); this.carrier(cr, p.x - 0.35 + i * 0.14, p.y - 0.55 + j * 0.36 + l * 0.07, 0.6 + l * 0.38, 'z'); });
        this.offFloor(); return;
      }
      p.outQ.forEach((cr, k) => { if (!k) this.carrier(cr, x, y0 + 0.2, 1.73, 'z'); else this.carrier(cr, x - 0.55 - (k - 1) * 0.13, y0 + 0.28, 1.0, 'y'); });
      p.basket.forEach((cr, k) => { const big = p.type === 'LAB', i = k % 4, j = Math.floor(k / 4); if (!big && j > 1) return; this.carrier(cr, x - 0.18 + i * 0.12, y0 + 0.2, 0.6 + j * 0.12, 'y'); });
      p.empties.forEach((cr, k) => { if (k < 6) this.carrier(cr, x + 0.47 + k * 0.1, y0 + 0.1, 0.67, 'z'); else this.carrier(cr, x + 0.47 + (k - 6) * 0.1, y0 + 0.3, 1.0 + Math.floor((k - 6) / 6) * 0.12, 'x'); });
      const w = p.work, staff = !p.away;
      // the person: beside the unit, facing it; busy while loading or emptying
      const px = p.type === 'PHARM' ? sim.G.cab.out + 0.8 : x - 0.75, py = p.type === 'PHARM' ? sim.G.cab.y + 0.85 : y0 + 0.75;
      if (staff) this.nurse(px, py, p.type === 'PHARM' ? Math.PI : Math.PI * 0.75, !!w, SCRUBS[p.type] || '#38bdf8', 'st' + p.idx);
      if (w && w.cr) this.carrier(w.cr, px + 0.25, py - 0.3, 1.1, 'x');
      this.offFloor();
    }
    // a person in scrubs: trousers, tunic, arms that move while working, head and hair (WS.personLook)
    nurse(x, y, a, active, col, id) {
      const L = WS.personLook(id), D = this.dy, lv = (m) => this.lv(m), s = active ? Math.sin(this.t * 4.5) : 0, f = L.female;
      const R = (B, u0, v0, z0, u1, v1, z1, c) => B.rbox(x, y, a + s * 0.15, u0, v0, lv(z0), u1, v1, lv(z1), c);
      for (const u of [-0.1, 0.02]) { R(D.rnd, u, -0.06, 0.0, u + 0.09, 0.07, 0.08, '#f8fafc'); R(D.rnd, u, -0.05, 0.06, u + 0.085, 0.05, 0.86, col); }
      R(D.rnd, -0.17, -0.1, 0.82, 0.17, 0.1, 1.45, col);
      R(D.box, -0.04, -0.105, 1.2, 0.08, -0.1, 1.32, '#f8fafc');
      for (const [side, r] of [[-1, Math.max(0, s)], [1, Math.max(0, -s)]]) {
        const u0 = side < 0 ? -0.24 : 0.17;
        R(D.rnd, u0, -0.05, 1.12, u0 + 0.07, 0.05, 1.44, col);
        R(D.rnd, u0, -0.06 - 0.1 - r * 0.15, 1.02 + r * 0.15, u0 + 0.065, -0.02, 1.16 + r * 0.15, L.skin);
      }
      R(D.box, -0.04, -0.04, 1.44, 0.04, 0.04, 1.52, L.skin);
      R(D.rnd, -0.085, -0.1, 1.5, 0.085, 0.09, 1.72, L.skin);
      R(D.rnd, -0.09, -0.03, 1.62, 0.09, 0.1, 1.76, L.hair);
      if (f && L.style !== 'beard') R(D.rnd, -0.08, 0.04, 1.42, 0.08, 0.11, 1.68, L.hair);
      for (const u of [-0.05, 0.025]) R(D.box, u, -0.105, 1.63, u + 0.025, -0.1, 1.655, '#111827');
    }
    // the transfer unit: its carriage shifting across, the carriers in it
    drawTU(alpha) {
      const sim = this.sim, U = sim.tu, G = this.G.tu, lv = (m) => this.lv(m), pos = lerp(U.opos, U.pos, alpha), cx = G.x - G.w / 2 + 0.25 + pos * (G.w - 0.5);
      this.onFloor(0);
      this.dy.box.box(cx - 0.22, G.y - 0.3, lv(1.2), cx + 0.22, G.y + 0.3, lv(1.6), U.down ? '#b91c1c' : '#f59e0b', { kind: 'robot', id: U.id });
      U.slots.forEach((cr, k) => this.carrier(cr, G.x - G.w / 2 + 0.25 + (k * (G.w - 0.5)) / Math.max(1, sim.cfg.tuSlots - 1), G.y, 1.85, 'z'));
      this.offFloor();
    }
    // the dispensing robot: a mast on the aisle's rails, the gripper on it reaching into a shelf, what it holds
    drawRobot(alpha) {
      const sim = this.sim, R = sim.robot, C = this.G.cab, lv = (m) => this.lv(m), D = this.dy, pick = { kind: 'robot', id: R.id };
      const x = lerp(R.ox, R.x, alpha), z = lerp(R.oz, R.z, alpha), reach = lerp(R.oreach, R.reach, alpha), side = R.side || 1;
      this.onFloor(0);
      D.box.box(x - 0.12, C.y - 0.1, lv(0.05), x + 0.12, C.y + 0.1, lv(C.h + 0.08), '#334155', pick);
      D.box.box(x - 0.16, C.y - 0.14, lv(C.h + 0.08), x + 0.16, C.y + 0.14, lv(C.h + 0.15), '#475569', pick);
      const gy = C.y + side * reach * 0.28;
      D.box.box(x - 0.13, gy - 0.12, lv(z), x + 0.13, gy + 0.12, lv(z + 0.06), R.down ? '#b91c1c' : '#f59e0b', pick);
      for (const s of [-1, 1]) D.box.box(x + s * 0.12 - 0.01, gy - 0.12, lv(z), x + s * 0.12 + 0.01, gy + 0.12, lv(z + 0.14), '#94a3b8', pick);
      D.lit.box(x - 0.04, C.y - 0.105, lv(C.h - 0.2), x + 0.04, C.y - 0.1, lv(C.h - 0.12), WS.stateColor(sim, R.displayState));
      if (R.held) { const d = R.held.drug; for (let k = 0; k < R.held.n; k++) D.box.box(x - d.w / 2 + k * 0.01, gy - d.dp / 2, lv(z + 0.06 + k * d.h), x + d.w / 2 + k * 0.01, gy + d.dp / 2, lv(z + 0.06 + (k + 1) * d.h), d.color, pick); }
      this.offFloor();
    }
    // the packs on the robot's shelves: rebuilt only when its stock changes
    drawPacks() {
      const sim = this.sim, C = this.G.cab, lv = (m) => this.lv(m);
      if (!this.packB) this.packB = this.newBatch('box', 'std', 4096, { cast: false });
      const key = sim.stockVer + '|' + this.opts.floorTop + '|' + this.opts.cutOnly + '|' + this.autoTop;
      if (key === this.packKey) return;
      this.packKey = key; this.packB.begin();
      this.zLift = 0; this.skip = !this.shown(0);
      for (const d of sim.drugs) {
        const sl = d.slot, y = C.y + sl.side * 0.42, per = Math.max(1, Math.floor((sl.x1 - sl.x0) / d.w)), deep = Math.max(1, Math.floor(0.32 / d.dp));
        for (let k = 0; k < d.stock; k++) {
          const i = k % per, j = Math.floor(k / per) % deep, x = sl.x0 + (i + 0.5) * d.w, yy = y - sl.side * (0.16 - (j + 0.5) * d.dp);
          this.packB.box(x - d.w / 2 + 0.004, yy - d.dp / 2 + 0.004, lv(sl.z + 0.025), x + d.w / 2 - 0.004, yy + d.dp / 2 - 0.004, lv(sl.z + 0.025 + Math.min(0.17, d.h)), d.color, { kind: 'drug', id: d.id });
        }
      }
      this.skip = false;
      this.packB.end();
    }

    // ---------------------------------------------------------------- follow, ride, pick, labels
    carrierPos(cr, alpha = 1) {
      const sim = this.sim;
      if (cr.state === 'IN_TUBE' && cr.leg) { const Z = cr.leg.zone, p = sim.legPos(cr.leg, lerp(Z.os, Z.s, alpha)); return { x: p.x, y: p.y, z: this.lv(p.z) }; }
      if (cr.state === 'TRANSFER') return { x: sim.G.tu.x, y: sim.G.tu.y, z: this.lv(1.9) };
      const p = cr.at && cr.at.x != null && cr.at.f != null ? cr.at : null;
      if (p) return { x: p.x, y: p.y, z: this.fz(p.f) + this.lv(1.2) };
      return null;
    }
    followPos(id, alpha) {
      const m = this.sim.fleet[id], a = alpha ?? 1;
      if (!m) return null;
      if (m instanceof WS.TubeZone) return m.leg && m.leg.cr.state === 'IN_TUBE' ? this.carrierPos(m.leg.cr, a) : null; // a line is ridden on its carrier
      if (m instanceof WS.TubeDispenser) return { x: lerp(m.ox, m.x, a), y: this.G.cab.y, z: this.lv(lerp(m.oz, m.z, a)) };
      return { x: this.G.tu.x, y: this.G.tu.y, z: this.lv(1.2) };
    }
    // ride a carrier: a line with one in its tube
    pickRider(not) {
      const zs = this.sim.zones.filter((z) => z.id !== not && z.leg && z.leg.cr.state === 'IN_TUBE');
      const pool = zs.length ? zs : this.sim.zones.filter((z) => z.id !== not);
      return (pool[Math.floor(Math.random() * pool.length)] || this.sim.zones[0]).id;
    }
    // The carrier cam rides just behind a carrier along its leg, round the bends and up the risers, looking
    // ahead down the tube; the chase camera hangs back further and higher. Between legs it waits for the next.
    presetCamera(dt, alpha) {
      const shot = this.shot;
      if (shot !== 'robot' && shot !== 'chase') return super.presetCamera(dt, alpha);
      const cam = this.cam, sim = this.sim;
      this.shotT = (this.shotT || 0) + dt;
      if (cam.mode === 'tour' && this.shotT > (shot === 'robot' ? 24 : 20) && !this.fading) { this.fading = true; this.nextShot(); setTimeout(() => (this.fading = false), 400); }
      const R = this.ride, Z = R && sim.fleet[R.id], on = Z instanceof WS.TubeZone && Z.leg && Z.leg.cr.state === 'IN_TUBE';
      if (!on) { const id = this.pickRider(R && R.id), z = sim.fleet[id]; if (z && z.leg && z.leg.cr.state === 'IN_TUBE') this.ride = { id }; return !!this.rideEye; }
      const L = Z.leg, s = lerp(Z.os, Z.s, alpha), near = shot === 'robot';
      const a = sim.legPos(L, Math.max(0, s - (near ? 1.4 : 4.5))), t = sim.legPos(L, Math.min(L.L, s + (near ? 2.5 : 1)));
      const up = Math.abs(t.z - a.z) > Math.hypot(t.x - a.x, t.y - a.y), side = near ? (up ? 0.8 : 0.15) : (up ? 2.6 : 1.2);
      const V = new WS.View3D.THREE.Vector3(a.x + side, a.z + (near ? (up ? -0.4 : 0.32) : 1.6), a.y + side);
      if (!this.rideEye || R.leg !== L) { this.rideEye = V.clone(); R.leg = L; } else this.rideEye.lerp(V, Math.min(1, dt * 6));
      if (!this.rideLook || R.legLook !== L) { this.rideLook = new WS.View3D.THREE.Vector3(t.x, t.z, t.y); R.legLook = L; } else this.rideLook.lerp(new WS.View3D.THREE.Vector3(t.x, t.z, t.y), Math.min(1, dt * 6));
      this.camera.position.copy(this.rideEye); this.camera.lookAt(this.rideLook);
      return true;
    }
    techSpot(m) {
      const G = this.G;
      if (m instanceof WS.TubeZone) { const b = m.blower; return m.riser && b.z > G.top ? null : { x: b.x + 0.9, y: b.y + 0.6, z: 0, a: 0 }; }
      if (m instanceof WS.TubeDispenser) return { x: G.cab.inX - 0.5, y: G.cab.y + 0.8, z: 0, a: 0 };
      return { x: G.tu.x + 1.2, y: G.tu.y + 0.9, z: 0, a: 0 };
    }
    pickFloor() { return null; }
    selectionBox(s, alpha) {
      const sim = this.sim;
      if (s.kind === 'robot') { const m = sim.fleet[s.id], p = this.followPos(s.id, alpha) || (m && m.blower && { x: m.blower.x, y: m.blower.y, z: this.lv(m.riser ? m.blower.z - 0.5 : 0) + this.lv(0.4) }); return p && [p.x - 0.5, p.y - 0.5, p.x + 0.5, p.y + 0.5, p.z - this.lv(0.4)]; }
      if (s.kind === 'port') { const p = sim.ports[s.id]; return p && [p.x - 0.65, p.y - 0.25, p.x + 1.05, p.y + 1.2, this.fz(p.f) + this.lv(0.02)]; }
      if (s.kind === 'carrier') { const cr = sim.carrierById.get(s.id), q = cr && this.carrierPos(cr, alpha); return q && [q.x - 0.3, q.y - 0.3, q.x + 0.3, q.y + 0.3, q.z]; }
      return null;
    }
    drawLabels() {
      const sim = this.sim, G = this.G, bg = 'rgba(15,23,42,0.82)', lv = (m) => this.lv(m);
      for (const p of sim.ports) {
        this.onFloor(p.f);
        const s = p.type === 'STORE' ? `Carrier store · ${p.empties.length}` : `${p.code} · ${p.name}${p.noCarrier() ? ' · NO CARRIER' : p.basket.length ? ` · ${p.basket.length} landed` : ''}`;
        this.label(s, p.x, p.y + 0.2, lv(2.55), { size: 10, bg, color: p.noCarrier() ? '#fca5a5' : '#a5f3fc' });
      }
      this.offFloor();
      for (const Z of sim.zones) {
        const b = Z.blower;
        this.skip = Z.riser ? (b.z > G.top ? !this.roofShown : !this.shown(this.floorOfZ(b.z - 0.5))) : !this.shown(0);
        this.label(`${Z.name}${Z.down ? ' · DOWN' : Z.leg ? ' · ' + Z.leg.cr.code : ''}`, b.x, b.y, lv((Z.riser ? b.z : 0.4) + 1.2), { size: 10, bg, color: ZCOL[Z.k % ZCOL.length] });
        this.skip = false;
      }
      this.onFloor(0);
      this.label(`Transfer unit · ${sim.tu.slots.length}/${sim.cfg.tuSlots}`, G.tu.x, G.tu.y, lv(2.6), { size: 10, bg, color: '#fcd34d' });
      this.label(`Dispensing robot · ${sim.rxQueue.length} orders`, (G.cab.x0 + G.cab.x1) / 2, G.cab.y, lv(G.cab.h + 0.6), { size: 10, bg, color: '#86efac' });
      this.offFloor();
    }

    // ---------------------------------------------------------------- follow a carrier
    pickFollow(not) {
      const cs = this.sim.carriers.filter((c) => c !== not && c.contents && (c.state === 'QUEUED' || c.state === 'LOADING'));
      const pool = cs.length ? cs : this.sim.carriers.filter((c) => c !== not && c.contents);
      return pool.length ? { order: pool[Math.floor(Math.random() * pool.length)] } : null;
    }
    orderFocus(cr) {
      const sim = this.sim, F = this.follow, q = this.carrierPos(cr, this.alpha ?? 1) || { x: sim.G.tu.x, y: sim.G.tu.y, z: 1 };
      const ct = F.what || (F.what = cr.contents), dest = F.dest || (F.dest = cr.dest), what = ct ? WS.TUBE_KIND[ct.kind].toLowerCase() : 'empty';
      const st = cr.state;
      if (!ct || (cr.contents !== ct && st !== 'IN_TUBE')) return Object.assign(q, { step: 5, done: true, text: `Emptied at ${dest ? dest.name : 'its station'}` });
      const step = { LOADING: 0, QUEUED: 1, IN_TUBE: 2, TRANSFER: 3, ARRIVED: 4, UNLOADING: 4 }[st] ?? 0;
      const text = {
        LOADING: `being loaded with ${what} at ${cr.at.name}`, QUEUED: `in the send dock at ${cr.at.name}, waiting for ${cr.at.zone ? cr.at.zone.name : 'its line'}`,
        IN_TUBE: `${what} through ${cr.leg ? cr.leg.zone.name : 'the tube'}${cr.leg && cr.leg.to ? ' to ' + cr.leg.to.name : ' to the transfer unit'}`,
        TRANSFER: `in the transfer unit, ${cr.shifted ? 'waiting for ' + (dest && dest.zone ? dest.zone.name : 'its line') : 'shifted across'}`,
        ARRIVED: `landed at ${cr.at.name}, waiting for someone to empty it`, UNLOADING: `being emptied at ${cr.at.name}`,
      }[st] || '';
      return Object.assign(q, { z: q.z + this.lv(0.4), step, text });
    }
    hudHTML() {
      const cr = this.follow.order, f = this.followNow || { step: 0, text: '' }, esc = WS.U.esc, F = this.follow;
      const chips = STEPS.map((s, k) => `<span class="${k < f.step || f.done ? 'done' : k === f.step ? 'now' : ''}">${s}</span>`).join('<i></i>');
      const ct = F.what, meta = ct ? `${WS.TUBE_KIND[ct.kind]}${ct.stat ? ' · urgent' : ''} · ${esc(ct.from ? ct.from.name : '')} → ${esc(F.dest ? F.dest.name : '')}` : 'Empty carrier';
      return `<div class="fh-top"><b>Carrier ${cr.code}</b><button data-fh="next" title="Follow another (N)">Next</button><button data-fh="stop" title="Stop following">×</button></div>
        <div class="fh-meta">${meta}</div><div class="fh-steps">${chips}</div><div class="fh-text">${esc(f.text)}</div>`;
    }
    drawLabelLayer() {
      const F = this.follow, f = this.followNow;
      this.follow = null;
      WS.View3D.prototype.drawLabelLayer.call(this);
      this.follow = F;
      if (this.cam.mode === 'order' && F && F.order && f) this.label('▼ ' + F.order.code, f.x, f.y, f.z + this.lv(0.5), { size: 11, weight: 800, color: '#0f172a', bg: 'rgba(250,204,21,0.92)' });
    }
  }

  WS.TubeRenderer3D = TubeRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
