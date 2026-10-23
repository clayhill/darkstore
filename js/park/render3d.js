/* RoboValet in the free 3D view: the car park at its true sizes, one cell
 * a metre. The ground floor has the entry/exit cabins on the street, the
 * transfer zone behind them where the ground robots carry cars to the
 * lifts, and the glazed lobby where drivers pay and wait; above it the
 * parking levels: a concrete slab on steel columns each, painted bays and
 * the robots' floor markers, an aluminium fin facade that drops to a guard
 * rail on the camera's side, and the lift shafts at the back. On the roof
 * the lift machine rooms and solar panels; in front the street with its
 * pavements, lamps and trees. Live: the cars (several body styles, real
 * colours, glass, wheels and lights), the flat robots under them with
 * their clamp arms, the lift platforms and their landing gates, the cabin
 * doors and lights, the drivers walking, paying and waiting, and the lobby
 * screen. The Floors slider hides the levels above one, or shows one alone. */
(function (WS) {
  'use strict';
  const LZ = WS.View3D.LZ;
  const STEEL = '#64748b', DARK = '#1f2937', YELLOW = '#facc15', CONCRETE = '#6e7888', FIN = '#93a1b4', WHITE = '#e2e8f0';
  const STEPS = ['Street', 'Cabin', 'Going up', 'Parked', 'Coming down', 'Off'];
  const STEP = { QUEUED: 0, ENTERING: 1, HANDOVER: 1, WAITING_ROBOT: 1, TO_LEVEL: 2, PARKED: 3, RETRIEVING: 4, READY: 4, BOARDING: 5, LEAVING: 5, GONE: 5 };
  const JACKET = ['#1f2937', '#334155', '#7c2d12', '#14532d', '#1e3a8a', '#6b7280', '#9a3412', '#d6d3d1', '#4c1d95', '#0f766e'];
  const LEGS = ['#1f2937', '#1e3a8a', '#374151', '#57534e', '#1e40af', '#292524'];
  const lerpA = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
  const lerp = (a, b, t) => (a == null ? b : a + (b - a) * t);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const hash = (s) => { let h = 2166136261; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); } return h >>> 0; };

  class ParkRenderer3D extends WS.View3D {
    get G() { return this.sim.G; }
    get followSteps() { return STEPS; }
    get nF() { return this.sim.cfg.levels + 1; }
    fz(f) { return this.lv(this.G.FZ[f]); } // floor f's top, in levels
    shown(f) { const o = this.opts, t = o.floorTop; return t == null || (o.cutOnly ? f === t : f <= t); }
    onFloor(f) { this.zLift = this.fz(f); this.skip = !this.shown(f); }
    offFloor() { this.zLift = 0; this.skip = false; }
    // The camera goes level with the floor the Floors slider picks; Walk walks on it.
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
    buildKey() { const c = this.sim.cfg; return [super.buildKey(), this.opts.floorTop, this.opts.cutOnly, c.levels, c.modules, c.baysPerRow].join('|'); }
    bounds() { const G = this.G; return { x0: -10, y0: -4, x1: G.X + 10, y1: G.Y + 14 }; }
    fit() {
      const G = this.G, c = this.cam;
      // from the street, south-east of the building, its south and east sides cut away: every level in view
      // from the street, south-west of the building, where the cabins and lifts are: its south and west sides cut away
      Object.assign(c, { walk: false, follow: null, tx: G.X * 0.4, ty: G.Y * 0.62, tz: this.fz(2), yaw: -0.5, pitch: 0.3 });
      c.dist = (G.X * 0.85) / Math.min(1, this.w / this.h);
      this.syncWalkButton();
    }
    placeSun() {
      super.placeSun();
      const G = this.G, cx = G.X / 2, cy = G.Y / 2, r = Math.hypot(G.X, G.Y) / 2 + 22;
      this.sun.position.set(cx - r * 0.55, r * 1.5, cy + r * 0.9); this.sun.target.position.set(cx, 0, cy);
      const sc = this.sun.shadow.camera; sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.far = r * 5; sc.updateProjectionMatrix();
    }
    buildStations() {}
    drawStationsLive() {}

    // ---------------------------------------------------------------- static
    buildStatic() {
      const T = WS.View3D.THREE, G = this.G, S = this.st;
      if (!this.ground) {
        this.ground = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ color: '#1a2230', roughness: 0.95 }));
        this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; this.scene.add(this.ground);
      }
      this.ground.scale.set(G.X + 160, G.Y + 120, 1); this.ground.position.set(G.X / 2, -0.01, G.Y / 2 + 10);
      this.ground.material.color.set(this.dark ? '#090d14' : '#1d2632');
      if (!this.ceil) this.ceil = { box: this.newBatch('box', 'std', 64, { cast: false }), lit: this.newBatch('box', 'lit', 64) };
      for (const b of Object.values(this.ceil)) b.begin();
      this.groundFloor(S);
      for (const b of Object.values(this.ceil)) b.end();
      for (let f = 1; f < this.nF; f++) this.level(S, f);
      this.shafts(S);
      this.roof(S);
      this.street(S);
      this.offFloor();
    }
    // cabins, transfer zone, lobby and plant room
    groundFloor(S) {
      const G = this.G, lv = (m) => this.lv(m), y0 = G.BD + G.AW, Y = G.Y, L = G.lobby;
      this.onFloor(0);
      for (let k = 0; k < G.M; k++) {
        const x0 = k * G.MP, x1 = x0 + G.MP, pick = { kind: 'port', id: k };
        // walls between the cabins: white panels on a dark base
        for (const x of k ? [x0] : [x0, x1]) { S.box.box(x - 0.08, y0, 0, x + 0.08, Y, lv(0.25), '#475569', pick); S.box.box(x - 0.07, y0, lv(0.25), x + 0.07, Y - 0.05, lv(2.9), '#d9dee6', pick); }
        if (k === G.M - 1) { S.box.box(x1 - 0.08, y0, 0, x1 + 0.08, Y, lv(0.25), '#475569', pick); S.box.box(x1 - 0.07, y0, lv(0.25), x1 + 0.07, Y - 0.05, lv(2.9), '#d9dee6', pick); }
        // ceiling with light panels (seen from below only, see cutaway), the front fascia over the door, the back wall over the robot door
        this.ceil.box.box(x0, y0, lv(2.9), x1, Y, lv(3.0), '#e5e7eb');
        for (const yy of [y0 + 1.2, y0 + 2.9, y0 + 4.4]) this.ceil.lit.box(x0 + 0.7, yy, lv(2.87), x1 - 0.7, yy + 0.35, lv(2.9), '#f8fafc');
        S.box.box(x0, Y - 0.22, lv(2.5), x1, Y, lv(3.35), '#1e293b', pick);
        S.box.box(x0 - 0.1, Y - 0.3, 0, x0 + 0.14, Y + 0.02, lv(2.5), '#334155');
        S.box.box(x0, y0 - 0.12, lv(2.35), x1, y0, lv(3.0), '#cbd5e1');
        // terminal by the door, mirror and guidance display on the back wall
        const tx = x1 - 0.42, ty = Y - 1.0;
        S.box.box(tx - 0.16, ty - 0.12, 0, tx + 0.16, ty + 0.12, lv(1.05), '#334155', pick);
        S.box.box(tx - 0.2, ty - 0.17, lv(1.05), tx + 0.2, ty + 0.17, lv(1.45), '#0f172a', pick);
        S.box.box(x0 + 1.05, y0 + 0.02, lv(1.55), x1 - 1.05, y0 + 0.1, lv(2.15), '#0b1220');
        // a traffic light outside, on the post between this cabin and the next
        S.cyl.cyl(x0 + 0.3, Y + 0.35, 0, lv(2.1), 0.04, '#475569');
        S.box.box(x0 + 0.21, Y + 0.28, lv(2.1), x0 + 0.39, Y + 0.44, lv(2.62), '#111827');
        // bollards and the yellow kerb edge of the entrance
        for (const xx of [x0 + 0.45, x1 - 0.45]) S.cyl.cyl(xx, Y + 0.85, 0, lv(0.9), 0.08, YELLOW);
      }
      // the transfer zone: a glass screen to the lobby, so drivers can watch the robots
      const xz = G.M * G.MP;
      S.box.box(xz - 0.06, 0, 0, xz + 0.06, L.y0, lv(3.4), '#9aa5b4');
      S.glass.box(xz - 0.03, L.y0, lv(0.9), xz + 0.03, y0, lv(3.0), '#9cc9f0');
      S.box.box(xz - 0.06, L.y0, 0, xz + 0.06, y0, lv(0.9), '#9aa5b4');
      // the lobby: back wall, side wall, kiosks, benches, plants
      S.box.box(xz, L.y0 - 0.12, 0, L.x1, L.y0, lv(3.4), '#cbd5e1');
      S.box.box(L.x1, L.y0, 0, L.x1 + 0.15, Y - 0.1, lv(3.4), '#cbd5e1');
      this.ceil.box.box(xz, L.y0, lv(3.25), L.x1, Y, lv(3.4), '#e2e8f0');
      for (let x = xz + 1.5; x < L.x1 - 1; x += 2.4) this.ceil.lit.box(x, L.y0 + 1.2, lv(3.22), x + 1.2, Y - 1.2, lv(3.25), '#fff7e6');
      for (const dx of [-1.1, 1.1]) {
        const kx = L.kiosk.x + dx, ky = L.kiosk.y, pick = null;
        S.box.box(kx - 0.28, ky - 0.2, 0, kx + 0.28, ky + 0.2, lv(1.05), '#1e3a8a', pick);
        S.box.box(kx - 0.3, ky - 0.22, lv(1.05), kx + 0.3, ky + 0.18, lv(1.75), '#0f172a', pick);
        S.lit.box(kx - 0.24, ky - 0.225, lv(1.15), kx + 0.24, ky - 0.215, lv(1.6), '#38bdf8');
      }
      for (let r = 0; r < 2; r++) for (let k = 0; k < 9; k++) {
        const x = L.x0 + 1.4 + k * 1.1, y = L.seatY + r * 0.8;
        S.box.box(x - 0.24, y - 0.22, lv(0.42), x + 0.24, y + 0.22, lv(0.48), '#475569');
        S.box.box(x - 0.24, y + 0.18, lv(0.48), x + 0.24, y + 0.24, lv(0.9), '#475569');
        if (k % 3 === 0) for (const dx of [-0.2, 0.2]) S.box.box(x + dx - 0.02, y - 0.02, 0, x + dx + 0.02, y + 0.02, lv(0.42), STEEL);
      }
      for (const [px, py] of [[L.x1 - 0.7, L.y0 + 0.7], [L.x1 - 0.7, Y - 1.2], [xz + 0.8, Y - 1.0]]) { S.cyl.cyl(px, py, 0, lv(0.45), 0.22, '#78716c'); S.dome.box(px - 0.42, py - 0.42, lv(0.45), px + 0.42, py + 0.42, lv(1.35), '#166534'); }
      // the lobby screen's frame (the picture is a texture, see lobbyScreen)
      S.box.box(L.screen.x - 1.45, L.y0, lv(1.35), L.screen.x + 1.45, L.y0 + 0.08, lv(2.75), '#0b1220');
      // plant room and stairs behind and beside the lobby
      S.box.box(L.x1 + 0.15, 0.15, 0, G.X - 0.15, Y - 0.15, lv(3.35), '#5b6676');
      S.box.box(xz + 0.06, 0.15, 0, L.x1, L.y0 - 0.12, lv(3.35), '#56606f');
      // ground floor columns along the back of the transfer zone and the cabins
      for (let k = 0; k <= G.M; k++) for (const y of [G.BD, y0]) S.box.box(k * G.MP - 0.15, y - 0.15, 0, k * G.MP + 0.15, y + 0.15, this.fz(1) - this.lv(0.25), STEEL);
    }
    // a parking level: its columns, the beams, pipes and lamps under the slab above, charging pad, landing gates
    level(S, f) {
      const G = this.G, lv = (m) => this.lv(m), H = G.FZ[f + 1] != null ? G.FZ[f + 1] - G.FZ[f] : this.sim.cfg.levelHeight, top = lv(H - 0.25);
      this.onFloor(f);
      const cols = new Set();
      for (let j = 0; j <= G.S; j++) if (j % 3 === 0 || j === G.S) cols.add(+(j * G.BW).toFixed(2));
      for (let j = 0; j <= G.B; j++) if (j % 3 === 0 || j === G.B) cols.add(+(G.M * G.MP + j * G.BW).toFixed(2));
      const xs = [...cols].filter((x) => x <= G.X + 0.01);
      for (const x of xs) for (const y of x >= G.M * G.MP - 0.01 ? [0.15, G.BD, G.BD + G.AW, G.Y - 0.15] : [G.BD + G.AW, G.Y - 0.15]) S.box.box(x - 0.13, y - 0.13, 0, x + 0.13, y + 0.13, top, STEEL);
      // under the slab above, hidden with it: beams across the building, sprinkler pipes and LED tubes along the aisle
      this.skip = !(this.shown(f) && (f + 1 < this.nF ? this.shown(f + 1) : this.opts.floorTop == null));
      for (const x of xs) S.box.box(x - 0.1, 0, top - lv(0.32), x + 0.1, G.Y, top, '#4b5563');
      for (const y of [G.BD + 0.7, G.BD + G.AW - 0.7]) S.cyl.cylX(0, G.X, y, top - lv(0.42), 0.05, '#b91c1c');
      for (let x = 2; x < G.X - 1; x += 5) (this.dark ? S.box : S.lit).box(x, G.yA - 0.05, top - lv(0.36), x + 1.4, G.yA + 0.05, top - lv(0.33), this.dark ? '#273244' : '#f1f5f9');
      this.skip = !this.shown(f);
      // a charging pad at the aisle's east end
      const hx = G.X - 3.5;
      S.box.box(hx - 1.2, G.yA - 0.75, 0, hx + 1.2, G.yA + 0.75, lv(0.015), '#14532d');
      S.box.box(G.X - 0.6, G.yA - 0.5, 0, G.X - 0.15, G.yA + 0.5, lv(0.9), '#334155');
      S.lit.box(G.X - 0.62, G.yA - 0.15, lv(0.6), G.X - 0.6, G.yA + 0.15, lv(0.75), '#4ade80');
    }
    // the lift shafts: guide rails through every floor, the back wall, landing sills, the machine rooms on the roof
    shafts(S) {
      const G = this.G, lv = (m) => this.lv(m);
      for (let k = 0; k < G.M; k++) {
        const x0 = k * G.MP + 0.3, x1 = (k + 1) * G.MP - 0.3, pick = { kind: 'robot', id: this.sim.lifts[k].id };
        for (let f = 0; f < this.nF; f++) {
          this.onFloor(f);
          const h = (f + 1 < this.nF ? this.fz(f + 1) : this.lv(G.top)) - this.fz(f);
          for (const x of [x0 + 0.08, x1 - 0.08]) for (const y of [0.35, G.BD - 0.35]) S.box.box(x - 0.06, y - 0.06, 0, x + 0.06, y + 0.06, h, '#374151', pick);
          S.box.box(x0, 0, 0, x1, 0.15, h, '#7a8597');
          // side screens of steel mesh
          for (const x of [x0, x1]) S.clear.box(x - 0.02, 0.15, 0, x + 0.02, G.BD, h, '#94a3b8');
          // the landing sill, striped
          for (let x = x0; x < x1 - 0.01; x += 0.4) S.box.box(x, G.BD - 0.12, 0, Math.min(x1, x + 0.2), G.BD, lv(0.02), (Math.round((x - x0) / 0.4) % 2) ? YELLOW : DARK);
          for (const x of [x0, x1]) S.box.box(x - 0.06, G.BD - 0.06, 0, x + 0.06, G.BD + 0.06, lv(2.15), '#475569');
        }
      }
      this.offFloor();
    }
    roof(S) {
      if (this.opts.floorTop != null) return;
      const G = this.G, lv = (m) => this.lv(m), z = this.lv(G.top);
      S.box.box(-0.3, -0.3, z - lv(0.3), G.X + 0.3, G.Y + 0.3, z, '#5b6474');
      for (const [a, b, c, d] of [[-0.3, -0.3, G.X + 0.3, 0], [-0.3, G.Y, G.X + 0.3, G.Y + 0.3], [-0.3, -0.3, 0, G.Y + 0.3], [G.X, -0.3, G.X + 0.3, G.Y + 0.3]]) S.box.box(a, b, z, c, d, z + lv(1.0), '#6b7585');
      for (let k = 0; k < G.M; k++) {
        const x0 = k * G.MP + 0.2, x1 = (k + 1) * G.MP - 0.2;
        S.box.box(x0, 0.2, z, x1, G.BD - 0.2, z + lv(2.2), '#8792a3');
        S.box.box(x0 + 0.6, G.BD - 0.26, z, x1 - 0.6, G.BD - 0.2, z + lv(1.9), '#334155');
        S.lit.box(x0 + 1.2, G.BD - 0.27, z + lv(1.95), x1 - 1.2, G.BD - 0.26, z + lv(2.05), '#fde68a');
      }
      // solar panels in rows, tilted to the south
      for (let x = G.M * G.MP + 2; x < G.X - 3; x += 2.3) for (let y = 1.5; y < G.Y - 2; y += 2.6) {
        S.box.box(x, y + 1.6, z, x + 0.06, y + 1.7, z + lv(0.7), '#475569');
        S.box.slab(x, x + 2.0, y, z + lv(0.25), y + 1.75, z + lv(0.95), 0.05, '#1e3a8a');
      }
    }
    // the street in front: pavements with lamps, trees on the far side, buildings across the road
    street(S) {
      const G = this.G, lv = (m) => this.lv(m), Y = G.Y, x0 = G.roadX0, x1 = G.roadX1;
      S.box.box(x0, Y, 0, x1, Y + 2.4, lv(0.12), '#7c8594');
      S.box.box(x0, Y + 2.35, 0, x1, Y + 2.45, lv(0.13), '#9ca3af');
      S.box.box(x0, Y + 9.4, 0, x1, Y + 12.4, lv(0.12), '#7c8594');
      S.box.box(x0, Y + 9.35, 0, x1, Y + 9.45, lv(0.13), '#9ca3af');
      for (let x = x0 + 6; x < x1; x += 18) this.streetLamp(S, x, Y + 2.0, 1);
      for (let x = x0 + 15; x < x1; x += 18) this.streetLamp(S, x, Y + 9.8, -1);
      for (let x = x0 + 4; x < x1; x += 12) {
        const s = 0.8 + ((hash('t' + x) % 100) / 100) * 0.3;
        S.cyl.cyl(x, Y + 11.4, 0, lv(2.2 * s), 0.1, '#57534e');
        S.dome.box(x - 1.0 * s, Y + 11.4 - 1.0 * s, lv(1.9 * s), x + 1.0 * s, Y + 11.4 + 1.0 * s, lv(4.4 * s), '#1f6b3a');
      }
      // the neighbours behind the car park, with their windows, out of the way of the view from the street
      const blocks = [[-30, 20, 14], [-8, 16, 22], [10, 24, 12], [36, 18, 18], [56, 22, 11]];
      for (const [bx, w, h] of blocks) {
        const bx1 = bx + w;
        S.box.box(bx, -26, 0, bx1, -10, lv(h), '#2b3546');
        for (let z = 1.2; z < h - 1; z += 3) for (let x = bx + 1; x < bx1 - 1.2; x += 2.2) {
          const on = this.dark ? hash(`${bx},${x},${z}`) % 3 === 0 : false;
          (on ? S.lit : S.box).box(x, -10.04, lv(z), x + 1.2, -10, lv(z + 1.5), on ? '#fde68a' : '#3d4b63');
        }
      }
    }
    streetLamp(S, x, y, side) {
      const lv = (m) => this.lv(m);
      S.cyl.cyl(x, y, 0, lv(6), 0.07, '#475569');
      S.box.box(x - 0.04, y, lv(5.9), x + 0.04, y + side * 1.4, lv(6.0), '#475569');
      S.box.box(x - 0.18, y + side * 1.25 - 0.3, lv(5.8), x + 0.18, y + side * 1.25 + 0.3, lv(5.92), '#1f2937');
      (this.dark ? S.lit : S.box).box(x - 0.14, y + side * 1.25 - 0.26, lv(5.79), x + 0.14, y + side * 1.25 + 0.26, lv(5.8), this.dark ? '#ffe9b0' : '#cbd5e1');
    }

    // ---------------------------------------------------------------- the shell: slabs, painted floors, facade
    buildHall() {
      const T = WS.View3D.THREE, G = this.G, lv = (m) => this.lv(m);
      if (!this.shell) {
        const mk = (shape, mat, cap = 1024) => this.newBatch(shape, mat, cap, { cast: false });
        this.shell = { slab: mk('box'), lit: this.newBatch('box', 'lit', 128) };
        this.walls = {};
        for (const k of ['N', 'S', 'W', 'E']) this.walls[k] = { full: mk('box', 'std', 2048), glass: this.newBatch('box', 'glass', 128, { shadow: false }), low: mk('box') };
        this.floorMeshes = [];
        const plane = (o = {}) => {
          const cv = document.createElement('canvas'), tex = new T.CanvasTexture(cv);
          tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
          const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial(Object.assign({ map: tex, roughness: 0.85, metalness: 0.02 }, o)));
          m.rotation.x = -Math.PI / 2; m.receiveShadow = true; this.scene.add(m);
          return { cv, tex, m };
        };
        this.plane = plane;
        this.road = plane({ roughness: 0.92 });
        // the lobby screen and the sign over the entrance: pictures on upright planes
        const upright = (w, h) => {
          const cv = document.createElement('canvas'), tex = new T.CanvasTexture(cv);
          tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
          const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: tex, toneMapped: false }));
          cv.width = w; cv.height = h; this.scene.add(m);
          return { cv, tex, m };
        };
        this.lobbyScr = upright(480, 230);
        this.sign = upright(1024, 160);
      }
      while (this.floorMeshes.length < this.nF) this.floorMeshes.push(this.plane({ transparent: true, alphaTest: 0.5 }));
      this.floorMeshes.forEach((fm, f) => { fm.m.visible = f < this.nF && this.shown(f); });
      const Sh = this.shell;
      Sh.slab.begin(); Sh.lit.begin();
      for (const W of Object.values(this.walls)) { W.full.begin(); W.glass.begin(); W.low.begin(); }
      // the slabs (with the shafts cut out) and their painted floors
      for (let f = 0; f < this.nF; f++) {
        const fm = this.floorMeshes[f], z = this.fz(f);
        fm.m.scale.set(G.X, G.Y, 1); fm.m.position.set(G.X / 2, z * LZ + 0.006, G.Y / 2);
        this.paintFloor(f, fm);
        this.skip = !this.shown(f);
        if (f) for (const r of this.slabRects()) Sh.slab.box(r.x0, r.y0, z - lv(0.25), r.x1, r.y1, z - 0.002, '#6e7888');
        else Sh.slab.box(-0.2, -0.2, -lv(0.2), G.X + 0.2, G.Y + 0.2, -0.003, '#5b6474');
        this.skip = false;
      }
      this.facade();
      this.paintRoad();
      this.paintSign();
      Sh.slab.end(); Sh.lit.end();
      for (const W of Object.values(this.walls)) { W.full.end(); W.glass.end(); W.low.end(); }
      // the sign over the lobby, facing the street
      const s = this.sign.m, L = G.lobby;
      s.position.set((L.x0 + L.x1) / 2, this.lv(3.62) * LZ, G.Y + 0.33); s.scale.set(L.x1 - L.x0 - 0.4, 1.5, 1); s.visible = this.shown(0);
      const sc = this.lobbyScr.m;
      sc.position.set(L.screen.x, this.lv(2.05) * LZ, L.y0 + 0.09); sc.scale.set(2.7, this.lv(1.3) * LZ, 1); sc.visible = this.shown(0);
      this.hallRect = { x0: 0, y0: 0, x1: G.X, y1: G.Y };
      this.hallTop = this.lv(G.top);
      this.applyLights(this.workLights());
    }
    // the slab of a parking level as rectangles round the shafts
    slabRects() {
      const G = this.G, out = [{ x0: -0.2, y0: G.BD, x1: G.X + 0.2, y1: G.Y + 0.2 }, { x0: G.M * G.MP - 0.3, y0: -0.2, x1: G.X + 0.2, y1: G.BD }];
      for (let k = 0; k < G.M; k++) out.push({ x0: k * G.MP - (k ? 0.3 : 0.2), y0: -0.2, x1: k * G.MP + 0.3, y1: G.BD });
      out.push({ x0: 0, y0: -0.2, x1: G.M * G.MP, y1: 0 });
      return out;
    }
    // A floor's paint. Parking levels: concrete, white bay lines and numbers,
    // the robots' navigation markers, the aisle's edge lines, the charging
    // pad. Ground floor: the cabins' guidance lines and stop bars, the
    // hatched transfer zone, the lobby's tiles. The shafts are left clear.
    paintFloor(f, fm) {
      const sim = this.sim, G = this.G, PX = 24, cv = fm.cv, dark = this.dark;
      cv.width = Math.round(G.X * PX); cv.height = Math.round(G.Y * PX);
      const c = cv.getContext('2d'), X = (x) => x * PX, Y = (y) => y * PX, rect = (x0, y0, x1, y1) => c.fillRect(X(x0), Y(y0), (x1 - x0) * PX, (y1 - y0) * PX);
      c.fillStyle = dark ? '#151b26' : f ? '#4a5466' : '#454e5e'; c.fillRect(0, 0, cv.width, cv.height);
      let s = 31 + f * 17;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let k = 0; k < 340; k++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${(0.008 + rnd() * 0.016).toFixed(3)})`; c.beginPath(); c.ellipse(rnd() * cv.width, rnd() * cv.height, 10 + rnd() * 50, 6 + rnd() * 26, rnd() * 3, 0, Math.PI * 2); c.fill(); }
      // tyre marks where the robots set cars down and turn
      const line = (x0, y0, x1, y1, col, w, dash) => { c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.beginPath(); c.moveTo(X(x0), Y(y0)); c.lineTo(X(x1), Y(y1)); c.stroke(); c.setLineDash([]); };
      const marker = (x, y) => { c.fillStyle = 'rgba(226,232,240,0.35)'; c.fillRect(X(x) - 2.5, Y(y) - 2.5, 5, 5); c.fillStyle = 'rgba(15,23,42,0.9)'; c.fillRect(X(x) - 1.5, Y(y) - 1.5, 3, 3); };
      const hatch = (x0, y0, x1, y1, col = 'rgba(250,204,21,0.5)') => { c.save(); c.beginPath(); c.rect(X(x0), Y(y0), (x1 - x0) * PX, (y1 - y0) * PX); c.clip(); c.strokeStyle = col; c.lineWidth = 5; for (let k = -cv.height; k < cv.width; k += 22) { c.beginPath(); c.moveTo(k, cv.height); c.lineTo(k + cv.height, 0); c.stroke(); } c.restore(); };
      const W = 'rgba(241,245,249,0.85)';
      if (f) {
        // bays: lines between them, a number at the aisle end, two markers down the middle
        c.font = `700 ${Math.round(PX * 0.62)}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (const b of sim.bays.filter((q) => q.level === f)) {
          const n = b.row === 'N', ya = n ? G.BD : G.BD + G.AW, yb = n ? 0.25 : G.Y - 0.25;
          line(b.x0, ya, b.x0, yb, W, 3); line(b.x1, ya, b.x1, yb, W, 3);
          c.fillStyle = 'rgba(241,245,249,0.7)'; c.fillText(b.name.slice(3), X(b.x), Y(n ? G.BD - 0.55 : G.BD + G.AW + 0.55));
          for (const d of [1.6, 3.6]) marker(b.x, n ? G.BD - d : G.BD + G.AW + d);
        }
        // the aisle: yellow edges, a grid of markers, the level painted big near the lifts
        line(0, G.BD + 0.08, G.X, G.BD + 0.08, 'rgba(250,204,21,0.8)', 3, [18, 12]); line(0, G.BD + G.AW - 0.08, G.X, G.BD + G.AW - 0.08, 'rgba(250,204,21,0.8)', 3, [18, 12]);
        for (let x = 0.5; x < G.X; x += 1) for (const y of [G.yA - 1.5, G.yA, G.yA + 1.5]) marker(x, y);
        c.font = `800 ${Math.round(PX * 3.2)}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`; c.fillStyle = 'rgba(56,189,248,0.22)';
        c.fillText('L' + f, X(G.M * G.MP + 4), Y(G.yA));
        c.strokeStyle = 'rgba(74,222,128,0.8)'; c.lineWidth = 3; c.strokeRect(X(G.X - 4.7), Y(G.yA - 0.75), 2.4 * PX, 1.5 * PX);
        for (let k = 0; k < G.M; k++) hatch(k * G.MP + 0.3, G.BD + 0.15, (k + 1) * G.MP - 0.3, G.BD + 1.0);
        // where the cars turn round, a scuffed circle
        c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 7; for (let k = 0; k < G.M; k++) { c.beginPath(); c.arc(X(G.modX(k)), Y(G.yA), 2.3 * PX, 0, Math.PI * 2); c.stroke(); }
      } else {
        const y0 = G.BD + G.AW, L = G.lobby;
        // the transfer zone: hatched, with a lane of markers per module
        hatch(0, G.BD + 0.1, G.M * G.MP, y0 - 0.1, 'rgba(250,204,21,0.28)');
        for (let k = 0; k < G.M; k++) { for (let y = G.BD + 0.5; y < y0; y += 1) marker(G.modX(k), y); line(k * G.MP, G.BD, k * G.MP, y0, 'rgba(250,204,21,0.8)', 3); }
        // the cabins: light epoxy, green guide lines to the stop bar, a STOP at it
        for (let k = 0; k < G.M; k++) {
          const x0 = k * G.MP, x = G.modX(k);
          c.fillStyle = dark ? '#1f2633' : '#8a94a3'; rect(x0 + 0.08, y0, x0 + G.MP - 0.08, G.Y);
          for (const u of [-0.8, 0.8]) line(x + u, G.Y - 0.2, x + u, y0 + 1.6, 'rgba(74,222,128,0.9)', 4);
          c.fillStyle = 'rgba(239,68,68,0.9)'; rect(x - 1.2, y0 + 1.15, x + 1.2, y0 + 1.4);
          c.font = `800 ${Math.round(PX * 0.7)}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(241,245,249,0.85)'; c.fillText('STOP', X(x), Y(y0 + 1.9));
          c.fillText(String(k + 1), X(x), Y(G.Y - 1.0));
        }
        // the lobby's tiles, the plant room
        c.fillStyle = dark ? '#2a2620' : '#b9ae9c'; rect(G.M * G.MP + 0.1, L.y0, L.x1, G.Y);
        c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1;
        for (let x = G.M * G.MP; x < L.x1; x += 0.6) { c.beginPath(); c.moveTo(X(x), Y(L.y0)); c.lineTo(X(x), Y(G.Y)); c.stroke(); }
        for (let y = L.y0; y < G.Y; y += 0.6) { c.beginPath(); c.moveTo(X(G.M * G.MP), Y(y)); c.lineTo(X(L.x1), Y(y)); c.stroke(); }
      }
      // the shafts are open
      for (let k = 0; k < G.M; k++) c.clearRect(X(k * G.MP + 0.3), 0, (G.MP - 0.6) * PX, Y(G.BD) - 1);
      fm.tex.needsUpdate = true;
    }
    // asphalt, lane lines, the pavements' paving, a painted P and arrow at the entrance
    paintRoad() {
      const G = this.G, R = this.road, PX = 12, x0 = G.roadX0, x1 = G.roadX1, y0 = G.Y + 2.4, y1 = G.Y + 9.4, cv = R.cv;
      cv.width = Math.round((x1 - x0) * PX); cv.height = Math.round((y1 - y0) * PX);
      const c = cv.getContext('2d'), X = (x) => (x - x0) * PX, Y = (y) => (y - y0) * PX;
      c.fillStyle = this.dark ? '#0f131a' : '#2a2f38'; c.fillRect(0, 0, cv.width, cv.height);
      let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let k = 0; k < 900; k++) { c.fillStyle = `rgba(255,255,255,${(rnd() * 0.04).toFixed(3)})`; c.fillRect(rnd() * cv.width, rnd() * cv.height, 1 + rnd() * 2, 1 + rnd() * 2); }
      const line = (ax, ay, bx, by, w, dash, col = 'rgba(241,245,249,0.85)') => { c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.beginPath(); c.moveTo(X(ax), Y(ay)); c.lineTo(X(bx), Y(by)); c.stroke(); c.setLineDash([]); };
      line(x0, (G.laneIn + G.laneOut) / 2 + 0.05, x1, (G.laneIn + G.laneOut) / 2 + 0.05, 2, [36, 30]);
      line(x0, y0 + 0.3, x1, y0 + 0.3, 2); line(x0, y1 - 0.3, x1, y1 - 0.3, 2);
      // the entrance: no line in front of the cabins, a box junction, a P with an arrow in the queue lane
      c.fillStyle = this.dark ? '#0f131a' : '#2a2f38'; c.fillRect(X(-0.2), Y(y0 + 0.1), (G.M * G.MP + 0.4) * PX, 0.4 * PX);
      c.strokeStyle = 'rgba(250,204,21,0.7)'; c.lineWidth = 2; c.strokeRect(X(0), Y(y0 + 0.4), G.M * G.MP * PX, (G.laneIn - y0 + 1.2) * PX);
      c.font = `800 ${Math.round(PX * 2.2)}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(241,245,249,0.75)';
      c.save(); c.translate(X(G.queueX0 + 9), Y(G.laneIn)); c.rotate(Math.PI / 2); c.fillText('P', 0, 0); c.restore();
      for (let x = G.queueX0 + 14; x < G.queueX0 + 40; x += 13) { c.beginPath(); c.moveTo(X(x), Y(G.laneIn)); c.lineTo(X(x + 2.4), Y(G.laneIn - 0.6)); c.lineTo(X(x + 2.4), Y(G.laneIn + 0.6)); c.closePath(); c.fill(); line(x + 2.4, G.laneIn, x + 4.5, G.laneIn, 3, null, 'rgba(241,245,249,0.75)'); }
      R.tex.needsUpdate = true;
      R.m.scale.set(x1 - x0, y1 - y0, 1); R.m.position.set((x0 + x1) / 2, 0.004, (y0 + y1) / 2);
    }
    paintSign() {
      const c = this.sign.cv.getContext('2d'), w = this.sign.cv.width, h = this.sign.cv.height;
      c.fillStyle = '#0b1220'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1d4ed8'; c.beginPath(); c.roundRect(18, 18, h - 36, h - 36, 14); c.fill();
      c.fillStyle = '#fff'; c.font = '800 104px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('P', h / 2, h / 2 + 4);
      c.textAlign = 'left'; c.font = '700 76px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'; c.fillStyle = '#e2e8f0'; c.fillText('RoboValet', h + 10, h / 2 - 8);
      c.font = '600 30px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'; c.fillStyle = '#7dd3fc'; c.fillText('AUTOMATED PARKING · DRIVE IN, WALK AWAY', h + 14, h / 2 + 46);
      this.sign.tex.needsUpdate = true;
    }
    // The outside of each floor: on the ground floor concrete walls, the
    // lobby's glass front and the plant room's louvres; on the parking
    // levels a spandrel at the slab edge and aluminium fins up to the next
    // slab. On the camera's side each drops to its low version: a kerb on
    // the ground floor, a guard rail upstairs.
    facade() {
      const G = this.G, lv = (m) => this.lv(m), T = 0.3, L = G.lobby;
      const sides = { N: [0, G.X], S: [0, G.X], W: [0, G.Y], E: [0, G.Y] };
      const put = (B, side, s0, s1, t0, t1, z0, z1, c) => {
        if (side === 'N') B.box(s0, -t1, z0, s1, -t0, z1, c);
        else if (side === 'S') B.box(s0, G.Y + t0, z0, s1, G.Y + t1, z1, c);
        else if (side === 'W') B.box(-t1, s0, z0, -t0, s1, z1, c);
        else B.box(G.X + t0, s0, z0, G.X + t1, s1, z1, c);
      };
      for (const side of ['N', 'S', 'W', 'E']) {
        const Wb = this.walls[side], [a, b] = sides[side];
        for (let f = 0; f < this.nF; f++) {
          this.skip = !this.shown(f);
          const z = this.fz(f), top = f + 1 < this.nF ? this.fz(f + 1) - lv(0.25) : this.lv(G.top) - lv(0.3), slab = f ? z - lv(0.25) : 0;
          if (!f) {
            const spans = side === 'S' ? [[L.x1 + 0.15, b + T]] : [[a - T, b + T]];
            for (const [s0, s1] of spans) {
              put(Wb.full, side, s0, s1, 0, T, 0, top, '#7a8597');
              for (let r = s0 + 0.6; r < s1 - 0.3; r += 1.2) put(Wb.full, side, r - 0.04, r + 0.04, -0.02, 0, lv(0.4), top - lv(0.4), '#6b7585');
              put(Wb.low, side, s0, s1, 0, T, 0, lv(0.9), '#7a8597'); put(Wb.low, side, s0, s1, -0.03, T + 0.03, lv(0.9), lv(1.02), YELLOW);
            }
            if (side === 'S') {
              // the fascia over the cabins and the lobby, the lobby's glass front and its doors
              put(Wb.full, side, a - T, L.x1 + 0.15, 0.05, T, lv(3.35), top + lv(0.25), '#1e293b');
              put(Wb.glass, side, G.M * G.MP + 0.1, L.x1, 0.1, 0.16, 0, lv(3.35), this.dark ? '#16223a' : '#9cc9f0');
              for (let r = G.M * G.MP + 0.1; r <= L.x1 + 0.01; r += 1.5) put(Wb.full, side, r - 0.04, r + 0.04, 0.06, 0.2, 0, lv(3.35), '#334155');
              put(Wb.full, side, G.M * G.MP + 0.1, L.x1, 0.06, 0.2, lv(2.5), lv(2.58), '#334155');
              put(Wb.full, side, L.door - 0.9, L.door + 0.9, 0.04, 0.22, lv(2.3), lv(2.5), '#334155');
              put(Wb.low, side, G.M * G.MP + 0.1, L.x1, 0.06, 0.2, 0, lv(0.25), '#334155');
            }
            continue;
          }
          // spandrel at the slab edge, fins, the edge beam of the slab above
          put(Wb.full, side, a - T, b + T, 0, T, slab, z + lv(0.85), '#5b6676');
          for (let r = a - T + 0.2; r < b + T; r += 0.42) put(Wb.full, side, r - 0.04, r + 0.04, 0.04, 0.3, z + lv(0.85), top, FIN);
          put(Wb.full, side, a - T, b + T, 0.02, T, top - lv(0.05), top + lv(0.25), '#5b6676');
          put(Wb.low, side, a - T, b + T, 0, T, slab, z + lv(0.12), '#5b6676');
          put(Wb.low, side, a - T, b + T, 0.06, 0.14, z + lv(1.0), z + lv(1.08), '#cbd5e1'); put(Wb.low, side, a - T, b + T, 0.06, 0.14, z + lv(0.5), z + lv(0.55), '#94a3b8');
          for (let r = a + 0.2; r < b; r += 2.6) put(Wb.low, side, r - 0.035, r + 0.035, 0.06, 0.14, z, z + lv(1.05), '#94a3b8');
        }
        this.skip = false;
      }
    }
    // Walls on the camera's side drop to their low version.
    cutaway() {
      if (!this.walls) return;
      const p = this.camera.position, H = this.hallRect, out = { N: p.z < H.y0, S: p.z > H.y1, W: p.x < H.x0, E: p.x > H.x1 };
      for (const [k, W] of Object.entries(this.walls)) { W.full.mesh.visible = W.glass.mesh.visible = !out[k]; W.low.mesh.visible = out[k]; }
      // the sign over the lobby belongs to the front wall
      if (this.sign) this.sign.m.visible = !out.S && this.shown(0);
      // the ground floor's ceilings from below only, so the cabins and lobby can be seen into from above
      if (this.ceil) for (const b of Object.values(this.ceil)) b.mesh.visible = p.y < this.lv(3.0) * LZ;
    }
    // the cabins and the lobby keep their lights in lights-out; nobody works on the parking levels
    workLights() {
      const G = this.G, out = [];
      for (let k = 0; k < G.M; k++) out.push({ x: G.modX(k), y: G.yS, f: 0 });
      out.push({ x: G.lobby.x0 + 3.5, y: G.Y - 3, f: 0 }, { x: G.lobby.x0 + 8.5, y: G.Y - 3, f: 0 });
      return out;
    }
    applyLights(lights) {
      const dark = this.dark, bg = dark ? '#03060c' : '#0b1220';
      this.renderer.setClearColor(bg); this.scene.fog.color.set(bg);
      this.hemi.intensity = dark ? 0.2 : 1.55; this.hemi.color.set(dark ? '#7d8fc9' : '#c7d7ff');
      this.sun.intensity = dark ? 0.08 : 2.3;
      const T = WS.View3D.THREE, n = dark ? Math.min(24, lights.length) : 0;
      while (this.spots.length < n) { const sp = new T.SpotLight('#ffe9c4', 1, 0, 0.6, 0.65, 2); this.scene.add(sp, sp.target); this.spots.push(sp); }
      this.spots.forEach((sp, k) => {
        sp.visible = k < n;
        if (k >= n) return;
        const p = lights[k], h = this.lv(2.85) * LZ, r = 2.6;
        sp.position.set(p.x, h, p.y); sp.target.position.set(p.x, 0, p.y); sp.angle = Math.atan(r / h); sp.intensity = 3.2 * h * h;
      });
    }
    startShot(shot) {
      if (shot !== 'station') return super.startShot(shot);
      this.shot = shot; this.shotT = 0;
      const ls = this.workLights();
      this.stationK = ((this.stationK ?? -1) + 1) % ls.length;
      const p = ls[this.stationK];
      Object.assign(this.cam, { tx: p.x, ty: p.y + 2, tz: this.lv(1.0), dist: 9, pitch: 0.3, yaw: 0.35 });
    }

    // ---------------------------------------------------------------- live
    drawLive(alpha) {
      this.aimAtFloor();
      this.alpha = alpha;
      this.drawLifts(alpha);
      for (const m of this.sim.fleet) if (m instanceof WS.ParkRobot) this.drawRobot(m, alpha);
      this.drawCars(alpha);
      this.drawDrivers(alpha);
      this.drawCabins();
      this.offFloor();
      this.lobbyScreen();
    }
    // where a robot is drawn: between its last two ticks
    pose(m, alpha) { return { x: lerp(m.ox, m.x, alpha), y: lerp(m.oy, m.y, alpha), a: m.oa == null ? m.a : lerpA(m.oa, m.a, alpha) }; }
    // clamp arms out (0…1) and the car lifted (0…1) for a robot now
    clampState(r) {
      if (!r.anim) return { arms: r.car ? 1 : 0, lift: r.car ? 1 : 0 };
      const p = clamp01((this.sim.time + this.alpha * this.sim.cfg.tick - r.anim.t0) / r.anim.d);
      return r.anim.on ? { arms: Math.min(1, p / 0.6), lift: Math.max(0, (p - 0.6) / 0.4) } : { arms: 1 - Math.max(0, (p - 0.4) / 0.6), lift: 1 - Math.min(1, p / 0.4) };
    }
    // A parking robot: a flat graphite chassis with yellow bumpers, lidar at
    // both ends, a state-coloured LED strip along each side, and four pairs of
    // clamp arms that swing out round the car's tyres.
    drawRobot(r, alpha) {
      const D = this.dy, lv = (m) => this.lv(m), p = this.pose(r, alpha), pick = { kind: 'robot', id: r.id }, col = WS.stateColor(this.sim, r.displayState);
      this.onFloor(r.level);
      const part = (B) => (u0, v0, z0, u1, v1, z1, c) => B.rbox(p.x, p.y, p.a, u0, v0, lv(z0), u1, v1, lv(z1), c, pick);
      const rnd = part(D.rnd), box = part(D.box), lit = part(D.lit);
      rnd(-0.52, -1.95, 0.02, 0.52, 1.95, 0.125, '#2b3442');
      box(-0.46, -1.7, 0.125, 0.46, 1.7, 0.132, '#3b4656');
      for (const e of [-1, 1]) {
        box(-0.52, e > 0 ? 1.78 : -1.96, 0.03, 0.52, e > 0 ? 1.96 : -1.78, 0.128, YELLOW);
        for (const u of [-0.3, 0, 0.3]) box(u - 0.06, e > 0 ? 1.8 : -1.965, 0.04, u + 0.06, e > 0 ? 1.965 : -1.8, 0.129, DARK);
        D.cyl.cyl(p.x - Math.sin(p.a) * e * 1.6, p.y - Math.cos(p.a) * e * 1.6, lv(0.132), lv(0.17), 0.06, '#0f172a', pick);
      }
      for (const u of [-1, 1]) lit(u * 0.525 - 0.006, -1.45, 0.06, u * 0.525 + 0.006, 1.45, 0.095, r.down ? '#ef4444' : col);
      // the arms: at the axles of the car it has or is going under
      const car = r.car || (r.task && r.task.car), cs = this.clampState(r), va = car ? car.model.L / 2 - 0.8 : 1.35, phi = (cs.arms * Math.PI) / 2;
      for (const v0 of [-va, va]) for (const s of [-1, 1]) for (const e of [-1, 1]) {
        const pu = s * 0.44, pv = v0 + e * 0.36, du = s * Math.sin(phi), dv = e * Math.cos(phi), tu = pu + du * 0.62, tv = pv + dv * 0.62;
        const ca = Math.cos(p.a), sa = Math.sin(p.a), A = { x: p.x + pu * ca + pv * sa, y: p.y - pu * sa + pv * ca }, B = { x: p.x + tu * ca + tv * sa, y: p.y - tu * sa + tv * ca };
        D.rnd.beam(A.x, A.y, lv(0.075), B.x, B.y, lv(0.075), 0.085, lv(0.07), '#f59e0b', pick);
      }
      r.liftK = cs.lift;
    }
    // Lift platforms, their counterweights, and the landing gates on every floor.
    drawLifts(alpha) {
      const G = this.G, D = this.dy, lv = (m) => this.lv(m);
      for (const L of this.sim.lifts) {
        const z = lerp(L.oz, L.z, alpha), zl = lv(z), pick = { kind: 'robot', id: L.id }, x0 = L.x - 1.62, x1 = L.x + 1.62;
        this.zLift = 0; this.skip = !this.shown(L.mapFloor);
        D.box.box(x0, 0.3, zl - lv(0.16), x1, G.BD - 0.15, zl - 0.002, '#4b5563', pick);
        D.box.box(x0, G.BD - 0.32, zl - 0.002, x1, G.BD - 0.15, zl + 0.005, YELLOW, pick);
        for (const x of [x0 + 0.1, x1 - 0.1]) D.box.box(x - 0.05, 0.3, zl, x + 0.05, 0.6, zl + lv(1.0), '#475569', pick);
        D.lit.box(L.x - 0.3, 0.31, zl + lv(0.85), L.x + 0.3, 0.33, zl + lv(0.95), L.down ? '#ef4444' : L.job ? '#38bdf8' : '#4ade80');
        const cw = lv(Math.max(0.2, G.top - 2.5 - z));
        this.skip = false;
        D.box.box(L.x - 0.45, 0.16, cw, L.x + 0.45, 0.3, cw + lv(1.2), '#1f2937');
        // gates: up while the platform stands open at the floor
        for (let f = 0; f < this.nF; f++) {
          this.onFloor(f);
          const open = L.at === f && L.open, gz = open ? lv(2.0) : 0;
          for (const h of [0.45, 1.05]) D.box.box(x0 + 0.05, G.BD - 0.04, gz + lv(h), x1 - 0.05, G.BD + 0.04, gz + lv(h + 0.06), open ? '#94a3b8' : '#eab308');
          this.offFloor();
        }
      }
    }
    // where a car is now: on a robot, a lift, in a bay, or in the street and the cabins
    carPose(car, alpha) {
      const sim = this.sim, lv = (m) => this.lv(m);
      if (car.robot) { const r = car.robot, p = this.pose(r, alpha); return { x: p.x, y: p.y, a: p.a, f: r.level, z: this.fz(r.level) + lv(0.06 * (r.liftK ?? 1)) }; }
      if (car.lift) { const L = car.lift; return { x: L.x, y: L.y, a: car.a, f: L.mapFloor, z: lv(lerp(L.oz, L.z, alpha)) }; }
      if (car.state === 'PARKED' && car.bay) return { x: car.bay.x, y: car.bay.y, a: car.a, f: car.bay.level, z: this.fz(car.bay.level) };
      void sim;
      return { x: lerp(car.ox, car.x, alpha), y: lerp(car.oy, car.y, alpha), a: car.oa == null ? car.a : lerpA(car.oa, car.a, alpha), f: 0, z: 0 };
    }
    drawCars(alpha) {
      const sim = this.sim;
      this.zLift = 0;
      for (const car of sim.cars) {
        if (car.state === 'TURNED_AWAY' || car.state === 'GONE') continue;
        const p = this.carPose(car, alpha);
        this.skip = !this.shown(p.f);
        const brake = car.state === 'QUEUED' || (car.path && car.y < sim.G.Y + 1);
        this.car(p.x, p.y, p.a, p.z, car, { brake, lights: car.where === 'street' || car.state === 'LEAVING' || car.state === 'BOARDING' || car.state === 'ENTERING' });
      }
      for (const it of sim.street) { this.skip = false; this.car(lerp(it.ox, it.x, alpha), lerp(it.oy, it.y, alpha), it.oa == null ? it.a : lerpA(it.oa, it.a, alpha), 0, it.car, { lights: true }); }
      this.skip = false;
    }
    // A car of model car.model (L × W × H m) at (x, y) facing a, standing at level z:
    // wheels with rims, the body, the glasshouse with its pillars and roof,
    // lights, grille, number plates and mirrors. An SUV gets roof rails.
    car(x, y, a, z, car, o = {}) {
      const D = this.dy, m = car.model, lv = (v) => this.lv(v), pick = { kind: 'car', id: car.id }, col = car.color;
      const L2 = m.L / 2, W2 = m.W / 2, suv = m.name === 'SUV', H = m.H, rw = suv ? 0.36 : 0.31, belt = suv ? 1.02 : 0.86, bot = suv ? 0.36 : 0.28;
      const part = (B) => (u0, v0, z0, u1, v1, z1, c, pk = pick) => B.rbox(x, y, a, u0, v0, z + lv(z0), u1, v1, z + lv(z1), c, pk);
      const rnd = part(D.rnd), box = part(D.box), lit = part(D.lit);
      const va = L2 - (m.L < 3.8 ? 0.62 : 0.8);
      for (const v of [-va, va]) for (const s of [-1, 1]) {
        D.cyl.ucyl(x, y, a, s * (W2 - 0.12), v, z + lv(rw), rw, 0.21, '#111317', pick);
        D.cyl.ucyl(x, y, a, s * (W2 - 0.105), v, z + lv(rw), rw * 0.58, 0.215, '#a3acb9', pick);
      }
      // body and sills
      rnd(-W2 + 0.02, -L2, bot, W2 - 0.02, L2, belt, col);
      box(-W2 + 0.06, -va + 0.45, bot - 0.06, W2 - 0.06, va - 0.45, bot + 0.04, '#1f2937');
      // the glasshouse: a raked windscreen up from the bonnet, side windows, a rear window, pillars, the roof
      const hood = m.name === 'City car' ? 0.2 : suv ? 0.26 : 0.29, gf = -L2 + m.L * hood, gr = L2 - m.L * (m.name === 'Saloon' ? 0.21 : 0.07);
      const ws = suv ? 0.5 : 0.68, rs = m.name === 'Saloon' ? 0.62 : suv ? 0.22 : 0.4, top = H - 0.08, ca = Math.cos(a), sa = Math.sin(a);
      const P = (v, zz) => ({ x: x + v * sa, y: y + v * ca, z: z + lv(zz) });
      const wa = P(gf, belt), wb = P(gf + ws, top), ra = P(gr, belt), rb = P(gr - rs, top), GL = '#141c28';
      D.box.beam(wa.x, wa.y, wa.z, wb.x, wb.y, wb.z, m.W - 0.3, 0.05, GL, pick);
      D.box.beam(ra.x, ra.y, ra.z, rb.x, rb.y, rb.z, m.W - 0.3, 0.05, GL, pick);
      box(-W2 + 0.13, gf + ws * 0.5, belt, W2 - 0.13, gr - rs * 0.5, top, GL);
      for (const s of [-1, 1]) {
        const uo = s * (W2 - 0.13);
        box(uo - 0.035, (gf + gr) / 2 - 0.06 + (rs - ws) / 4, belt, uo + 0.035, (gf + gr) / 2 + 0.06 + (rs - ws) / 4, top, col);
        // mirrors
        box(s * (W2 + 0.13) - 0.06, gf + 0.1, belt + 0.02, s * (W2 + 0.01), gf + 0.24, belt + 0.14, col);
      }
      rnd(-W2 + 0.15, gf + ws - 0.04, top - 0.02, W2 - 0.15, gr - rs + 0.04, H, col);
      if (suv) for (const s of [-1, 1]) box(s * (W2 - 0.22) - 0.03, gf + ws + 0.1, H, s * (W2 - 0.22) + 0.03, gr - rs - 0.1, H + 0.05, '#0f172a');
      // lights, grille, plates
      // lights on only while it is driven
      const on = !!o.lights, back = o.brake ? '#ff2a2a' : '#d61f1f';
      for (const s of [-1, 1]) {
        (on ? lit : box)(s * (W2 - 0.3) - 0.16, -L2 - 0.01, belt - 0.2, s * (W2 - 0.3) + 0.16, -L2 + 0.03, belt - 0.08, on ? '#fff7d6' : '#cbd5e1');
        (on || o.brake ? lit : box)(s * (W2 - 0.22) - 0.17, L2 - 0.03, belt - 0.18, s * (W2 - 0.22) + 0.17, L2 + 0.01, belt - 0.06, on || o.brake ? back : '#7f1d1d');
      }
      box(-0.42, -L2 - 0.012, bot + 0.12, 0.42, -L2 + 0.02, belt - 0.24, '#0b0f17');
      for (const e of [-1, 1]) box(-0.26, e * L2 - 0.015, bot + 0.02, 0.26, e * L2 + 0.015, bot + 0.13, WHITE);
    }
    // the cabins' doors, lights and screens
    drawCabins() {
      const G = this.G, D = this.dy, lv = (m) => this.lv(m), dt = Math.min(0.1, this.dtFrame || 0.016);
      this.onFloor(0);
      this.doorK = this.doorK || [];
      for (const cab of this.sim.ports) {
        const k = cab.idx, x0 = k * G.MP + 0.15, x1 = (k + 1) * G.MP - 0.15, st = cab.state, car = cab.car;
        const driver = car && car.driver, front = st === 'ENTERING' || st === 'HANDOVER' || st === 'LEAVING' || (st === 'READY_OUT' && driver && (driver.state === 'TO_CAR' || driver.state === 'GET_IN')) || (st === 'FREE' && this.sim.queue.length > 0);
        const K = (this.doorK[k] = this.doorK[k] || { f: 0, b: 0 });
        K.f += ((front ? 1 : 0) - K.f) * Math.min(1, dt * 1.6); K.b += ((cab.door === 'back' ? 1 : 0) - K.b) * Math.min(1, dt * 2.2);
        const pick = { kind: 'port', id: k };
        // roller doors: the bottom edge rises as they open
        const fz = lv(2.45 * K.f), bz = lv(2.3 * K.b);
        if (K.f < 0.98) {
          D.box.box(x0, G.Y - 0.36, fz, x1, G.Y - 0.3, lv(2.46), '#94a3b8', pick);
          for (let h = 0.3; h < 2.4; h += 0.3) if (lv(h) > fz + 0.01) D.box.box(x0, G.Y - 0.37, lv(h), x1, G.Y - 0.29, lv(h) + 0.012, '#64748b', pick);
        }
        D.box.box(x0, G.BD + G.AW - 0.06, bz, x1, G.BD + G.AW, lv(2.35), '#64748b', pick);
        // traffic light: green while a car may drive in, red otherwise
        const go = st === 'FREE' || st === 'ENTERING', lx = k * G.MP + 0.3;
        D.cyl.cyl(lx, G.Y + 0.26, lv(2.43), lv(2.53), 0.05, go ? '#1f2937' : '#000');
        (go ? D.box : D.lit).box(lx - 0.05, G.Y + 0.27, lv(2.44), lx + 0.05, G.Y + 0.29, lv(2.54), go ? '#3f1d1d' : '#ef4444');
        (go ? D.lit : D.box).box(lx - 0.05, G.Y + 0.27, lv(2.18), lx + 0.05, G.Y + 0.29, lv(2.28), go ? '#22c55e' : '#14301e');
        // guidance display on the back wall and the terminal's screen
        const g = st === 'ENTERING' ? (car && car.y > G.BD + G.AW + 1.9 + 0.3 ? '#22c55e' : '#ef4444') : st === 'HANDOVER' || st === 'SCAN' ? '#ef4444' : st === 'READY_OUT' || st === 'LEAVING' ? '#22c55e' : null;
        if (g) D.lit.box(x0 + 1.0, G.BD + G.AW + 0.11, lv(1.62), x1 - 1.0, G.BD + G.AW + 0.12, lv(2.08), g);
        const tx = (k + 1) * G.MP - 0.42, ty = G.Y - 1.0;
        D.lit.box(tx - 0.21, ty - 0.08, lv(1.12), tx - 0.2, ty + 0.12, lv(1.4), st === 'HANDOVER' ? '#38bdf8' : '#1e3a8a');
      }
      this.offFloor();
    }
    // drivers: walking, at the terminal, paying, seated in the lobby, getting in
    drawDrivers(alpha) {
      this.onFloor(0);
      for (const d of this.sim.drivers) {
        if (d.state === 'GET_IN' && d.t < this.sim.cfg.getIn - 2.5) continue;
        const x = lerp(d.px, d.x, alpha), y = lerp(d.py, d.y, alpha), sit = d.state === 'WAITING' && d.seatK != null;
        const a = sit ? 0 : d.state === 'PAY' ? 0 : d.state === 'HANDOVER' && !d.path.length ? -Math.PI / 2 : 0;
        this.person(x, y, a, 0, 'drv' + d.id, { sit, carry: d.car.kind === 'shopper' && d.state !== 'HANDOVER' });
      }
      this.offFloor();
    }
    // A driver in everyday clothes, 1.6–1.8 m tall: walking with legs and
    // arms swinging (WS.Strides), standing, or seated on a lobby bench.
    person(x, y, a, z0, id, o = {}) {
      const L = WS.personLook(id), D = this.dy, lv = (m) => this.lv(m), h = hash(id);
      const st = (this.strides || (this.strides = new WS.Strides())).at(id, x, y, this.t), walk = st.moving && !o.sit;
      if (walk) a = Math.atan2(-st.dx, -st.dy);
      const g = walk ? Math.sin(st.phase * 0.75) : 0, k = L.female ? 0.95 : 1.03, jacket = JACKET[h % JACKET.length], legs = LEGS[(h >>> 5) % LEGS.length];
      const ca = Math.cos(a), sa = Math.sin(a), W = (u, v) => ({ x: x + u * ca + v * sa, y: y - u * sa + v * ca });
      const part = (B) => (u0, v0, z1, u1, v1, z2, c) => B.rbox(x, y, a, u0 * k, v0 * k, z0 + lv(z1 * k), u1 * k, v1 * k, z0 + lv(z2 * k), c);
      const rnd = part(D.rnd), box = part(D.box), hip = o.sit ? 0.46 : 0.92;
      if (o.sit) {
        for (const u of [-0.09, 0.09]) { rnd(u - 0.07, -0.48, 0.42, u + 0.07, 0.02, 0.56, legs); rnd(u - 0.06, -0.5, 0.06, u + 0.06, -0.38, 0.5, legs); box(u - 0.06, -0.62, 0, u + 0.06, -0.38, 0.08, '#111827'); }
      } else if (walk) {
        for (const [u, s] of [[-0.09, 1], [0.09, -1]]) {
          const hp = W(u * k, 0), ft = W(u * k, -g * s * 0.32), up = Math.max(0, g * s) * 0.06;
          D.rnd.beam(hp.x, hp.y, z0 + lv(0.9 * k), ft.x, ft.y, z0 + lv(0.08 + up), 0.13 * k, lv(0.13 * k), legs);
          D.box.rbox(ft.x, ft.y, a, -0.055, -0.15, z0 + lv(up), 0.055, 0.07, z0 + lv(0.09 + up), '#111827');
        }
      } else for (const u of [-0.09, 0.09]) { rnd(u - 0.065, -0.06, 0.06, u + 0.065, 0.06, 0.93, legs); box(u - 0.06, -0.16, 0, u + 0.06, 0.07, 0.08, '#111827'); }
      const zt = hip - 0.02;
      rnd(-0.18, -0.105, zt, 0.18, 0.105, zt + 0.56, jacket);
      rnd(-0.2, -0.11, zt + 0.36, 0.2, 0.11, zt + 0.55, jacket);
      if (walk) for (const s of [-1, 1]) {
        const sh = W(s * 0.235 * k, 0), hd = W(s * 0.25 * k, g * s * 0.24);
        D.rnd.beam(sh.x, sh.y, z0 + lv((zt + 0.52) * k), hd.x, hd.y, z0 + lv((zt - 0.08) * k), 0.085 * k, lv(0.085 * k), jacket);
      } else for (const s of [-1, 1]) {
        rnd(s * 0.235 - 0.045, -0.05, zt - 0.06 + (o.sit ? 0.12 : 0), s * 0.235 + 0.045, 0.05, zt + 0.53, jacket);
        box(s * 0.235 - 0.035, -0.04, zt - 0.14 + (o.sit ? 0.12 : 0), s * 0.235 + 0.035, 0.04, zt - 0.05 + (o.sit ? 0.12 : 0), L.skin);
      }
      if (o.carry && !o.sit) { const hd = W(0.27 * k, walk ? g * 0.24 : 0); D.box.rbox(hd.x, hd.y, a, -0.04, -0.17, z0 + lv((zt - 0.42) * k), 0.04, 0.17, z0 + lv((zt - 0.08) * k), (h >>> 9) % 2 ? '#f5f5f4' : '#b45309'); }
      const zh = zt + 0.56;
      box(-0.04, -0.04, zh, 0.04, 0.04, zh + 0.07, L.skin);
      if (L.style === 'long') rnd(-0.1, -0.02, zh - 0.12, 0.1, 0.11, zh + 0.22, L.hair);
      rnd(-0.085, -0.1, zh + 0.05, 0.085, 0.09, zh + 0.29, L.skin);
      rnd(-0.09, -0.03, zh + 0.18, 0.09, 0.1, zh + 0.32, L.hair);
      if (L.style === 'ponytail') rnd(-0.03, 0.09, zh + 0.02, 0.03, 0.14, zh + 0.24, L.hair);
      for (const u of [-0.04, 0.04]) box(u - 0.014, -0.103, zh + 0.18, u + 0.014, -0.097, zh + 0.2, '#111827');
    }
    // the lobby screen: cars on their way down and where to collect them
    lobbyScreen() {
      const S = this.lobbyScr;
      if (!S || this.t - (this.scrAt || 0) < 0.5) return;
      this.scrAt = this.t;
      const sim = this.sim, c = S.cv.getContext('2d'), w = S.cv.width, h = S.cv.height;
      const rows = sim.cars.filter((car) => car.requested && ['PARKED', 'RETRIEVING', 'READY', 'BOARDING'].includes(car.state)).sort((p, q) => p.requested - q.requested).slice(0, 6);
      c.fillStyle = '#06101f'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1d4ed8'; c.fillRect(0, 0, w, 40);
      c.font = '700 22px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.textAlign = 'left';
      c.fillText('YOUR CAR', 14, 21); c.textAlign = 'right'; c.fillText(WS.U.fmtClock(sim.clock()).slice(0, 5), w - 14, 21);
      c.font = '600 21px ui-monospace, "SF Mono", Menlo, monospace';
      rows.forEach((car, k) => {
        const y = 62 + k * 28, ready = car.state === 'READY' || car.state === 'BOARDING';
        c.textAlign = 'left'; c.fillStyle = '#e2e8f0'; c.fillText(car.plate, 14, y);
        c.textAlign = 'right'; c.fillStyle = ready ? '#4ade80' : '#fbbf24';
        c.fillText(ready ? `READY · CABIN ${car.cabin.idx + 1}` : car.state === 'RETRIEVING' ? `ON ITS WAY · ${car.cabin.idx + 1}` : 'IN THE QUEUE', w - 14, y);
      });
      if (!rows.length) { c.textAlign = 'center'; c.fillStyle = '#64748b'; c.fillText('Order your car at the kiosk', w / 2, h / 2 + 18); }
      S.tex.needsUpdate = true;
    }
    draw(alpha) {
      const now = performance.now();
      this.dtFrame = Math.min(0.1, (now - (this.lastFrame || now)) / 1000); this.lastFrame = now;
      super.draw(alpha);
    }

    // ---------------------------------------------------------------- picking and labels
    followPos(id, alpha) {
      const m = this.sim.fleet[id];
      if (!m) return null;
      if (m instanceof WS.ParkLift) return { x: m.x, y: m.y, z: this.lv(lerp(m.oz, m.z, alpha ?? 1)) };
      const p = this.pose(m, alpha ?? 1);
      return { x: p.x, y: p.y, z: this.fz(m.level) };
    }
    pickRider(not) {
      const fleet = this.sim.fleet.filter((m) => m instanceof WS.ParkRobot && m.id !== not), busy = fleet.filter((m) => m.gen);
      const pool = busy.length ? busy : fleet;
      return pool.length ? pool[Math.floor(Math.random() * pool.length)].id : 0;
    }
    // the robot cam sits just clear of the car it carries, in the direction it moves (a car often goes sideways)
    rideFront() {
      const R = this.ride, r = R && this.sim.fleet[R.id], h = R && R.h != null ? R.h : 0;
      if (!r || !r.car) return 2.2;
      const ta = { x: Math.cos(h), y: Math.sin(h) }, ax = { x: -Math.sin(r.a), y: -Math.cos(r.a) }, d = Math.abs(ta.x * ax.x + ta.y * ax.y);
      return d * r.car.model.L / 2 + Math.sqrt(Math.max(0, 1 - d * d)) * r.car.model.W / 2 + 0.35;
    }
    rideHeight() { return this.lv(0.55); }
    techSpot(m) {
      const G = this.G;
      if (m instanceof WS.ParkLift) return { x: m.x + 1.1, y: G.BD + 0.9, z: 0, a: 0, floor: m.at ?? 0 };
      return { x: m.x + 1.0, y: m.y < G.BD + 0.5 ? G.BD + 0.8 : m.y > G.BD + G.AW - 0.5 ? G.BD + G.AW - 0.8 : m.y + 1.2, z: 0, a: 0, floor: m.level };
    }
    // bays on the floors shown, from the top down, when nothing else is under the cursor
    pick(sx, sy) {
      const hit = super.pick(sx, sy);
      if (hit) return hit;
      const sim = this.sim, G = this.G;
      for (let f = this.nF - 1; f >= 1; f--) {
        if (!this.shown(f)) continue;
        const p = this.floorAt(sx, sy, this.fz(f));
        if (!p || p.x < 0 || p.x > G.X || p.y < 0 || p.y > G.Y) continue;
        const b = sim.bays.find((q) => q.level === f && p.x >= q.x0 && p.x < q.x1 && (q.row === 'N' ? p.y < G.BD : p.y > G.BD + G.AW));
        return b ? { kind: 'bay', id: b.id } : null;
      }
      return null;
    }
    pickFloor() { return null; }
    selectionBox(s, alpha) {
      const sim = this.sim, G = this.G;
      if (s.kind === 'robot') {
        const m = sim.fleet[s.id], p = this.followPos(s.id, alpha);
        if (!p) return null;
        if (m instanceof WS.ParkLift) return [m.x - 1.75, 0.2, m.x + 1.75, G.BD - 0.1, p.z + 0.03];
        const along = Math.abs(Math.cos(m.a)) > 0.7, hu = along ? 0.62 : 2.05, hv = along ? 2.05 : 0.62;
        return [p.x - hu, p.y - hv, p.x + hu, p.y + hv, p.z + 0.04];
      }
      if (s.kind === 'car') {
        const car = sim.cars.find((c) => c.id === s.id);
        if (!car) return null;
        const p = this.carPose(car, alpha), along = Math.abs(Math.cos(p.a)) > 0.7, hu = (along ? car.model.W : car.model.L) / 2 + 0.2, hv = (along ? car.model.L : car.model.W) / 2 + 0.2;
        return [p.x - hu, p.y - hv, p.x + hu, p.y + hv, p.z + 0.03];
      }
      if (s.kind === 'bay') { const b = sim.bays[s.id]; return [b.x0 + 0.06, b.row === 'N' ? 0.2 : G.BD + G.AW, b.x1 - 0.06, b.row === 'N' ? G.BD : G.Y - 0.2, this.fz(b.level) + 0.02]; }
      if (s.kind === 'port') { const x0 = s.id * G.MP; return [x0 + 0.1, G.BD + G.AW, x0 + G.MP - 0.1, G.Y, 0.02]; }
      return null;
    }
    drawLabels() {
      const sim = this.sim, G = this.G, bg = 'rgba(15,23,42,0.82)', lv = (m) => this.lv(m);
      this.offFloor();
      for (const cab of sim.ports) {
        if (!this.shown(0)) break;
        const col = { FREE: '#86efac', READY_OUT: '#86efac', RESERVED: '#fdba74' }[cab.state] || '#7dd3fc';
        this.label(`${cab.code} · ${cab.state.replace('_', ' ')}`, G.modX(cab.idx), G.Y + 0.4, lv(3.0), { size: 10, bg, color: col });
      }
      for (let f = 1; f < this.nF; f++) {
        if (!this.shown(f)) continue;
        const bays = sim.bays.filter((b) => b.level === f), taken = bays.filter((b) => b.car).length;
        this.label(`L${f} · ${taken}/${bays.length}`, G.X + 1.2, G.yA, this.fz(f) + lv(1.2), { size: 10, bg, color: '#e2e8f0' });
      }
      const free = sim.bays.filter((b) => !b.car && !b.reserved).length;
      this.label(free ? `P  ${free} FREE` : 'P  FULL', G.queueX0 + 1, G.Y + 1.6, lv(3.4), { size: 12, weight: 800, bg: free ? 'rgba(21,128,61,0.92)' : 'rgba(185,28,28,0.92)', color: '#fff' });
      if (sim.queue.length > 1) { const q = sim.queue[sim.queue.length - 1]; this.label(`${sim.queue.length} queueing`, q.x, q.y, lv(2.3), { size: 10, bg, color: '#fde68a' }); }
    }

    // ---------------------------------------------------------------- follow a car
    // On its way in: from the street through a cabin and the lifts to its
    // bay; or on its way out, from its bay to the street.
    pickFollow(not) {
      const sim = this.sim, early = ['QUEUED', 'ENTERING', 'HANDOVER', 'WAITING_ROBOT'];
      const out = sim.cars.filter((c) => c !== not && c.state === 'RETRIEVING'), inn = sim.cars.filter((c) => c !== not && early.includes(c.state));
      const pool = Math.random() < 0.5 && out.length ? out : inn.length ? inn : out;
      return pool.length ? { order: pool[Math.floor(Math.random() * pool.length)] } : null;
    }
    orderFocus(car) {
      const sim = this.sim, G = this.G, lv = (m) => this.lv(m);
      if (!sim.cars.includes(car)) return { x: G.roadX1 - 20, y: G.laneOut, z: lv(1), step: 5, done: true, text: `${car.plate} has driven off` };
      const p = this.carPose(car, 1), step = STEP[car.state] ?? 0;
      let text = { QUEUED: `Queueing in the street, ${sim.queue.indexOf(car) + 1} in line for a free cabin`, ENTERING: `Driving into ${car.cabin ? car.cabin.name : 'a cabin'}`, HANDOVER: `${car.driverName} gets out and confirms at the terminal`, WAITING_ROBOT: `Checked; waiting for the ground robot and ${car.cabin ? sim.lifts[car.cabin.idx].name : 'the lift'}`, PARKED: `Parked in ${car.bay ? car.bay.name : 'its bay'}`, READY: `Ready in ${car.cabin ? car.cabin.name : 'a cabin'}, facing the street`, BOARDING: `${car.driverName} gets in`, LEAVING: 'Driving off' }[car.state] || '';
      if (car.robot) text = `${car.robot.name} carries it ${car.state === 'TO_LEVEL' ? (car.robot.ground ? 'into the lift' : `to bay ${car.target ? car.target.name : ''}`) : car.robot.ground ? 'into the cabin' : car.robot.car && Math.abs(car.robot.a - car.a) > 0.1 ? 'and turns it round' : 'to the lift'}`;
      else if (car.lift) text = `${car.lift.name} ${car.state === 'TO_LEVEL' ? `takes it up to level ${car.target ? car.target.level : ''}` : 'brings it down'}`;
      else if (car.state === 'RETRIEVING') text = `Requested: the level ${car.bay ? car.bay.level : ''} robot is on its way`;
      return { x: p.x, y: p.y, z: p.z + lv(0.6), step, text, done: car.state === 'PARKED' || (car.state === 'LEAVING' && car.x > G.X + 15) };
    }
    hudHTML() {
      const car = this.follow.order, f = this.followNow || { step: 0, text: '' }, esc = WS.U.esc;
      const chips = STEPS.map((s, k) => `<span class="${k < f.step || f.done ? 'done' : k === f.step ? 'now' : ''}">${s}</span>`).join('<i></i>');
      return `<div class="fh-top"><b>${esc(car.plate)}</b><button data-fh="next" title="Follow another (N)">Next</button><button data-fh="stop" title="Stop following">×</button></div>
        <div class="fh-meta">${esc(car.model.name)}, ${car.colorName} · ${esc(car.driverName)}</div><div class="fh-steps">${chips}</div><div class="fh-text">${esc(f.text)}</div>`;
    }
    // the follow pin shows the plate
    drawLabelLayer() {
      const F = this.follow, f = this.followNow;
      this.follow = null;
      super.drawLabelLayer();
      this.follow = F;
      if (this.cam.mode === 'order' && F && F.order && f) { this.zLift = 0; this.skip = false; this.label('▼ ' + F.order.plate, f.x, f.y, f.z + this.lv(1.6), { size: 11, weight: 800, color: '#0f172a', bg: 'rgba(250,204,21,0.92)' }); }
    }
  }

  WS.ParkRenderer3D = ParkRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
