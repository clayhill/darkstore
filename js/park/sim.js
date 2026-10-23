/* RoboValet: an automated car park (specs/park.txt).
 * The ground floor has a row of modules along the street: an entry/exit
 * cabin (EET) a driver drives into, and behind it a car lift at the back of
 * the building, with a ground robot that carries cars straight across
 * between the two. Above are the parking levels: one aisle each, bays on
 * both sides, the lift shafts in the first bays of the north row, and one
 * parking robot per level. A robot is a flat omnidirectional AGV that slides
 * under a car, clamps its tyres and lifts it a few centimetres; it crabs
 * along the aisle and turns a car on the spot. Robots never leave their
 * floor; the lifts carry only the car, so no two robots ever share a floor.
 *
 * A lift takes one job at a time and is booked only when it is free: a
 * store (cabin → lift → level → bay) when the car in its cabin is ready, a
 * retrieval (bay → lift → cabin) together with the cabin, which stays
 * reserved for the car coming down. So a robot only ever waits for a lift
 * already on its way to it, and nothing can lock up.
 *
 * Positions are metres: x along the building (east), y from its back wall
 * (north) to the street (south), z up. The day starts at cfg.dayStart. */
(function (WS) {
  'use strict';
  const TAU = Math.PI * 2;
  const TERMS = { unit: 'car', Unit: 'Car', units: 'cars', Units: 'Cars', store: 'car park', Store: 'Car park', port: 'cabin', ports: 'cabins', machine: 'Machine', starve: 'cars', flow1: 'Cars parked /h', flow2: 'Cars delivered /h', surge: 'Rush of cars' };
  const STATE_LABELS = { MOVING_TO_TARGET: 'Driving empty', TRANSPORTING_TO_PORT: 'Carrying a car', HANDLING: 'Clamping / setting down', STORING: 'Lift travelling', AT_PORT: 'Lift open', WAITING_PORT: 'Waiting (lift or robot)' };
  const LEGEND = ['IDLE', 'MOVING_TO_TARGET', 'TRANSPORTING_TO_PORT', 'HANDLING', 'STORING', 'AT_PORT', 'WAITING_PORT'];
  const MODELS = [
    { name: 'City car', L: 3.6, W: 1.65, H: 1.5, w: 2 },
    { name: 'Hatchback', L: 4.1, W: 1.78, H: 1.47, w: 5 },
    { name: 'Saloon', L: 4.75, W: 1.83, H: 1.44, w: 3 },
    { name: 'Estate', L: 4.85, W: 1.85, H: 1.5, w: 3 },
    { name: 'SUV', L: 4.6, W: 1.9, H: 1.68, w: 4 },
  ];
  const PAINT = [['#e5e7eb', 'white', 24], ['#111827', 'black', 18], ['#6b7280', 'grey', 17], ['#a8b0bc', 'silver', 12], ['#1e3a8a', 'blue', 10], ['#9f1d1d', 'red', 8], ['#14532d', 'green', 3], ['#b9a684', 'beige', 3], ['#c2410c', 'orange', 2], ['#0c4a6e', 'petrol', 3]];
  const FIRST = ['Sofie', 'Lucas', 'Emma', 'Noah', 'Louise', 'Arthur', 'Olivia', 'Jules', 'Mila', 'Liam', 'Elena', 'Adam', 'Nora', 'Victor', 'Lena', 'Finn', 'Marie', 'Thomas', 'Julie', 'Samir', 'Ines', 'Pieter', 'Yasmine', 'Wout', 'Hanne', 'Bram', 'Fatima', 'Jonas', 'Lotte', 'Mehdi'];
  const LAST = 'ABCDEFGHJKLMNPRSTVWZ';
  const KIND_NAME = { resident: 'resident', commuter: 'commuter', shopper: 'visitor' };
  const near = (from, to) => to + Math.round((from - to) / TAU) * TAU; // the angle to turn to: to, give or take whole turns

  // ---------------------------------------------------------------- geometry
  // Everything about where things are, from the settings.
  function geometry(c) {
    const M = c.modules, MP = c.moduleWidth, BW = c.bayWidth, BD = c.bayDepth, AW = c.aisleWidth;
    const X = M * MP + c.baysPerRow * BW, S = Math.floor(X / BW), Y = 2 * BD + AW;
    const FZ = [0]; for (let k = 1; k <= c.levels; k++) FZ.push(c.groundHeight + (k - 1) * c.levelHeight);
    const lobbyX0 = M * MP + 0.6;
    return {
      M, MP, BW, BD, AW, X, Y, S, B: c.baysPerRow, FZ, GAP: 3,
      yN: BD / 2, yA: BD + AW / 2, yS: BD + AW + BD / 2, eetY: BD + AW + BD / 2 - 0.1,
      modX: (k) => k * MP + MP / 2,
      pave: Y + 1.2, laneIn: Y + 3.9, laneOut: Y + 7.3, roadX0: -40, roadX1: X + 70,
      queueX0: M * MP + 5.5, queueGap: 6.4,
      lobby: { x0: lobbyX0, x1: lobbyX0 + 12, y0: BD + AW - 1.5, door: lobbyX0 + 2.2, kiosk: { x: lobbyX0 + 4.5, y: Y - 2.2 }, seatY: BD + AW + 0.6, screen: { x: lobbyX0 + 8.5, y: BD + AW - 1.4 } },
      top: FZ[c.levels] + c.levelHeight,
    };
  }

  // ---------------------------------------------------------------- the control room's map
  // The floors two by two: the ground floor and level 1, then 2 and 3, …,
  // each with its name above it. Each bay is coloured by how long its car
  // has been in.
  const K = { OUT: 0, AISLE: 1, BAY: 2, SHAFT: 3, EET: 4, LOBBY: 5, PLANT: 6 };
  class ParkMap extends WS.RobotFloor {
    constructor(sim, G) {
      const nF = sim.cfg.levels + 1, span = Math.ceil(G.X) + G.GAP, rowH = Math.ceil(G.Y) + 4, W = span * Math.min(2, nF) - G.GAP, D = 2 + rowH * Math.ceil(nF / 2) - 1;
      super(W, D, WS.CELL.BLOCKED);
      Object.assign(this, { sim, G, span, rowH, nF });
      this.kind = new Uint8Array(W * D); this.bayAt = new Int16Array(W * D).fill(-1);
    }
    mapX(f, x) { return (f % 2) * this.span + x; }
    mapY(f, y) { return 2 + Math.floor(f / 2) * this.rowH + y; }
    floorAt(i) { const x = this.cx(i), y = this.cy(i) - 2; return Math.min(this.nF - 1, Math.floor(y / this.rowH) * 2 + (x >= this.span ? 1 : 0)); }
    fill(f, x0, y0, x1, y1, k, bay = -1) {
      for (let y = Math.max(0, Math.floor(y0)); y < Math.min(Math.ceil(this.G.Y), Math.ceil(y1)); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        if (x < 0 || x >= Math.ceil(this.G.X)) continue;
        const i = this.idx(this.mapX(f, x), this.mapY(f, y)); this.kind[i] = k; if (bay >= 0) this.bayAt[i] = bay;
      }
    }
    // the floors' names over them (WS.ControlRoom)
    mapText() { return Array.from({ length: this.nF }, (_, f) => ({ s: f ? 'LEVEL ' + f : 'GROUND FLOOR', x: this.mapX(f, 0), y: this.mapY(f, -1.1) })); }
    passable() { return false; }
    depthOf() { return 1; }
    mapFill(i, mix) {
      const b = this.bayAt[i];
      if (b >= 0) {
        const bay = this.sim.bays[b];
        if (bay.car) return mix('#1d4ed8', '#7c3aed', Math.min(1, (this.sim.time - (bay.car.times.parked || 0)) / (8 * 3600)));
        return bay.reserved ? '#a16207' : '#142033';
      }
      return { [K.AISLE]: '#1b2536', [K.SHAFT]: '#0e3a46', [K.EET]: '#3a2a0a', [K.LOBBY]: '#1e293b', [K.PLANT]: '#111827' }[this.kind[i]] || '#070b12';
    }
    get mapTitle() { return 'BAYS · blue → purple by how long the car has been in · amber: reserved'; }
  }

  // ---------------------------------------------------------------- entry/exit cabin
  // FREE → ENTERING (a car drives in) → HANDOVER (the driver gets out and
  // confirms) → SCAN (door closes, the car is checked) → READY_IN, until the
  // ground robot has taken it out (CLEARING). Or RESERVED (a car is on its way down to
  // it) → READY_OUT (the car stands facing the street) → LEAVING (the driver
  // gets in and drives off).
  class Cabin extends WS.Port {
    constructor(sim, idx, def) {
      super(sim, idx, def);
      this.name = 'Cabin ' + (idx + 1); this.code = 'E' + (idx + 1);
      this.state = 'FREE'; this.car = null; this.t = 0; this.since = 0;
      this.ins = 0; this.outs = 0;
    }
    get job() { return this.state === 'FREE' ? null : { lines: [null], next: 0, t: 0, total: 1 }; }
    set job(v) {}
    set(state) { this.state = state; this.since = this.sim.time; }
    update(dt) {
      this.stats.t += dt;
      if (this.state !== 'FREE') this.stats.busy += dt;
      if (this.state === 'RESERVED') this.stats.blocked += dt; // held for a car on its way down
      if (this.t > 0) { this.t -= dt; if (this.t <= 0) this.sim.cabinTimer(this); }
    }
  }

  // ---------------------------------------------------------------- robots and lifts
  class ParkRobot extends WS.Machine {
    constructor(sim, id, name, level, x, y) {
      super(sim, id, name);
      Object.assign(this, { level, x, y, a: 0, car: null, jobs: [], home: { x, y }, anim: null });
      this.place(); this.prx = this.rx; this.pry = this.ry;
    }
    get ground() { return this.level === 0; }
    // where it was a tick ago, so the 3D view can draw it in between
    update(dt) { this.ox = this.x; this.oy = this.y; this.oa = this.a; super.update(dt); }
    place() { const m = this.sim.map; this.rx = m.mapX(this.level, this.x) - 0.5; this.ry = m.mapY(this.level, this.y) - 0.5; }
  }
  class Lift extends WS.Machine {
    constructor(sim, id, k) {
      super(sim, id, 'Lift ' + 'ABCDEFGH'[k]);
      const G = sim.G;
      Object.assign(this, { k, x: G.modX(k), y: G.yN, z: 0, at: 0, open: true, car: null, job: null, trips: 0 });
      this.place(); this.prx = this.rx; this.pry = this.ry;
    }
    update(dt) { this.oz = this.z; super.update(dt); }
    // the floor the platform stands at, or the one it is nearest to on the map
    place() {
      const FZ = this.sim.G.FZ;
      let f = 0; for (let k = 1; k < FZ.length; k++) if (Math.abs(FZ[k] - this.z) < Math.abs(FZ[f] - this.z)) f = k;
      this.mapFloor = f;
      this.at = Math.abs(FZ[f] - this.z) < 1e-6 ? f : null;
      this.rx = this.sim.map.mapX(f, this.x) - 0.5; this.ry = this.sim.map.mapY(f, this.y) - 0.5;
    }
  }

  // ---------------------------------------------------------------- tasks
  // Every move is one axis at a time, except a turn while driving along the aisle.
  function* drive(sim, r, to, state) {
    const c = sim.cfg, v = r.car ? c.vLoaded : c.vEmpty, w = (c.turnRate * Math.PI) / 180, axes = [];
    if (to.x != null) axes.push({ prop: 'x', to: to.x, v, a: c.accel });
    if (to.y != null) axes.push({ prop: 'y', to: to.y, v, a: c.accel });
    if (to.a != null) axes.push({ prop: 'a', to: near(r.a, to.a), v: w, a: w * 1.5 });
    r.state = state || (r.car ? 'TRANSPORTING_TO_PORT' : 'MOVING_TO_TARGET');
    yield { op: 'travel', axes };
  }
  // arms out round the tyres and lift (clamp), or set down and arms in
  function* clamp(sim, r, on) {
    const d = on ? sim.cfg.clampTime : sim.cfg.releaseTime;
    r.state = 'HANDLING'; r.anim = { on, t0: sim.time, d };
    yield { op: 'wait', t: d };
    r.anim = null;
    if (!on) r.lifts++;
  }
  const liftReady = (L, J, f) => () => L.job === J && L.at === f && L.open;
  function* liftTo(sim, L, f) {
    const c = sim.cfg, z = sim.G.FZ[f];
    if (Math.abs(L.z - z) < 1e-6) { L.open = true; return; }
    L.open = false; L.state = 'STORING';
    yield { op: 'wait', t: 1.2 }; // the gate closes
    yield { op: 'travel', prop: 'z', to: z, v: c.liftV, a: c.liftA, settle: c.liftSettle };
    L.open = true; L.trips++;
  }

  const T = {};
  // A lift's job: to the floor the car is picked up from, wait while a robot
  // drives it on, to the other floor, wait while a robot takes it off.
  T.LIFT = function* (sim, L, J) {
    const from = J.type === 'store' ? 0 : J.level, to = J.type === 'store' ? J.level : 0;
    yield* liftTo(sim, L, from);
    L.state = 'AT_PORT';
    yield { op: 'until', fn: () => L.car === J.car && !J.inLift, waitState: 'WAITING_PORT' };
    J.car.where = 'lift'; J.car.lift = L;
    yield* liftTo(sim, L, to);
    L.state = 'AT_PORT';
    yield { op: 'until', fn: () => !L.car && !J.inLift, waitState: 'WAITING_PORT' };
    L.job = null; sim.stats.liftJobs++;
  };
  // The ground robot of a module: from the cabin into the lift, or from the lift into the cabin.
  T.GROUND = function* (sim, r, J) {
    const G = sim.G, L = J.lift, cab = J.cabin, car = J.car;
    if (J.type === 'store') {
      yield* drive(sim, r, { a: car.a });
      cab.door = 'back';
      yield* drive(sim, r, { y: G.eetY });
      yield* clamp(sim, r, true);
      r.car = car; car.where = 'robot'; car.robot = r; cab.car = null; cab.set('CLEARING');
      yield* drive(sim, r, { y: G.yA });
      cab.door = null; cab.set('FREE'); sim.log('robot', `${r.name} has ${car.plate} out of ${cab.name}`);
      yield { op: 'until', fn: liftReady(L, J, 0), waitState: 'WAITING_PORT' };
      J.inLift = true;
      yield* drive(sim, r, { y: G.yN });
      yield* clamp(sim, r, false);
      r.car = null; L.car = car; car.where = 'lift'; car.lift = L; car.robot = null;
      yield* drive(sim, r, { y: G.yA });
      J.inLift = false;
    } else {
      yield { op: 'until', fn: () => L.job === J && L.at === 0 && L.open && L.car === car, waitState: 'WAITING_PORT' };
      yield* drive(sim, r, { a: car.a });
      J.inLift = true;
      yield* drive(sim, r, { y: G.yN });
      yield* clamp(sim, r, true);
      L.car = null; r.car = car; car.where = 'robot'; car.robot = r; car.lift = null;
      yield* drive(sim, r, { y: G.yA });
      J.inLift = false;
      cab.door = 'back';
      yield* drive(sim, r, { y: G.eetY });
      yield* clamp(sim, r, false);
      r.car = null; car.robot = null; cab.car = car;
      car.where = 'cabin'; car.x = car.ox = cab.drop.x; car.y = car.oy = cab.drop.y; car.a = car.oa = Math.PI;
      yield* drive(sim, r, { y: G.yA });
      cab.door = null;
      sim.carReady(car, cab);
    }
  };
  // A level's robot: take a car off the lift and park it, or fetch a car from its bay to the lift.
  T.LEVEL = function* (sim, r, j) {
    const G = sim.G, J = j.J, L = J.lift, car = J.car, bay = J.bay, lx = L.x;
    if (j.kind === 'in') {
      yield* drive(sim, r, { y: G.yA });
      yield* drive(sim, r, { x: lx, a: car.a });
      yield { op: 'until', fn: () => L.job === J && L.at === J.level && L.open && L.car === car, waitState: 'WAITING_PORT' };
      J.inLift = true;
      yield* drive(sim, r, { y: G.yN });
      yield* clamp(sim, r, true);
      L.car = null; r.car = car; car.where = 'robot'; car.robot = r; car.lift = null;
      yield* drive(sim, r, { y: G.yA });
      J.inLift = false;
      yield* drive(sim, r, { x: bay.x });
      yield* drive(sim, r, { y: bay.y });
      yield* clamp(sim, r, false);
      r.car = null; car.robot = null;
      sim.parked(car, bay);
      yield* drive(sim, r, { y: G.yA });
    } else {
      yield* drive(sim, r, { y: G.yA });
      yield* drive(sim, r, { x: bay.x, a: car.a });
      yield* drive(sim, r, { y: bay.y });
      yield* clamp(sim, r, true);
      bay.car = null; bay.reserved = false; r.car = car; car.where = 'robot'; car.robot = r; car.bay = null;
      yield* drive(sim, r, { y: G.yA });
      // turn the car round on the way, so it faces the street when it comes down
      car.a = Math.PI;
      yield* drive(sim, r, { x: lx, a: car.a });
      yield { op: 'until', fn: liftReady(L, J, J.level), waitState: 'WAITING_PORT' };
      J.inLift = true;
      yield* drive(sim, r, { y: G.yN });
      yield* clamp(sim, r, false);
      r.car = null; L.car = car; car.where = 'lift'; car.lift = L; car.robot = null;
      yield* drive(sim, r, { y: G.yA });
      J.inLift = false;
    }
  };

  // ---------------------------------------------------------------- drivers
  // People walking: from the cabin away along the pavement, or to the lobby,
  // the pay kiosk, a seat, and to their car in a cabin.
  class Driver {
    constructor(sim, car, x, y) {
      Object.assign(this, { sim, car, x, y, px: x, py: y, path: [], state: 'WALK', t: 0, gone: false, id: car.id });
      this.name = car.driverName;
    }
    walk(path, state) { this.path = path.slice(); this.state = state; }
    update(dt) {
      this.px = this.x; this.py = this.y;
      if (this.t > 0) { this.t -= dt; if (this.t <= 0) this.sim.driverTimer(this); return; }
      if (!this.path.length) return;
      let m = this.sim.cfg.walkSpeed * dt;
      while (m > 1e-9 && this.path.length) {
        const p = this.path[0], dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
        if (d <= m) { this.x = p.x; this.y = p.y; m -= d; this.path.shift(); } else { this.x += (dx / d) * m; this.y += (dy / d) * m; m = 0; }
      }
      if (!this.path.length) this.sim.driverArrived(this);
    }
  }

  // ---------------------------------------------------------------- simulation
  class ParkSim extends WS.Sim {
    get kind() { return 'park'; }
    get terms() { return TERMS; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    get taskTypes() { return T; }
    get armsAllowed() { return false; }
    get floorNames() { return ['Ground', ...Array.from({ length: this.cfg.levels }, (_, k) => 'L' + (k + 1))]; }
    defaults() { return WS.PARK_CONFIG; }
    createGrid() {
      const c = this.cfg, G = (this.G = geometry(c)), m = (this.map = new ParkMap(this, G));
      // the cabins along the street on the ground floor, as stations for the shared views
      for (let k = 0; k < G.M; k++) {
        const x = G.modX(k), cells = [];
        for (let y = Math.floor(G.BD + G.AW); y < Math.ceil(G.Y); y++) for (let dx = -1; dx <= 1; dx++) cells.push({ x: m.mapX(0, Math.floor(x) + dx), y: m.mapY(0, y) });
        m.ports.push({ kind: 'EET', face: 'front', drop: { x, y: G.eetY }, lift: { x, y: G.yN }, cells });
      }
      return m;
    }
    createPort(k, def) { return new Cabin(this, k, def); }
    describe() { const c = this.cfg; return `Car park online · ${this.bays.length} bays on ${c.levels} levels · ${c.modules} cabins with a lift each · ${this.fleet.filter((r) => r instanceof ParkRobot).length} robots`; }
    storageCapacity() { return this.bays.length; }
    fetchCost() { return 0; }
    // time of day, for the clock and the log
    clock(t = this.time) { return t + this.cfg.dayStart; }
    hourAt(h) { return h * 3600 - this.cfg.dayStart; }

    seed() {
      const c = this.cfg, G = this.G, m = this.map, rng = this.rng;
      this.stats = { arrived: 0, turnedAway: 0, full: 0, entered: 0, stored: 0, requested: 0, delivered: 0, left: 0, liftJobs: 0, waits: [], retrievals: [] };
      this.cars = []; this.carSeq = 1; this.queue = []; this.street = []; this.drivers = []; this.requests = []; this.jobs = [];
      // the bays: north row after the lift shafts, south row the whole length
      this.bays = [];
      for (let f = 1; f <= c.levels; f++) {
        for (let j = 0; j < G.B; j++) { const x0 = G.M * G.MP + j * G.BW; this.addBay(f, 'N', x0, G.yN); }
        for (let j = 0; j < G.S; j++) { const x0 = j * G.BW; this.addBay(f, 'S', x0, G.yS); }
        m.fill(f, 0, G.BD, G.X, G.BD + G.AW, K.AISLE);
        for (let k = 0; k < G.M; k++) m.fill(f, k * G.MP + 0.3, 0, (k + 1) * G.MP - 0.3, G.BD, K.SHAFT);
      }
      // the ground floor: the modules, the lobby and the plant room behind it
      for (let k = 0; k < G.M; k++) { m.fill(0, k * G.MP + 0.3, 0, (k + 1) * G.MP - 0.3, G.BD, K.SHAFT); m.fill(0, k * G.MP, G.BD, (k + 1) * G.MP, G.BD + G.AW, K.AISLE); m.fill(0, k * G.MP + 0.2, G.BD + G.AW, (k + 1) * G.MP - 0.2, G.Y, K.EET); }
      m.fill(0, G.lobby.x0, G.lobby.y0, G.lobby.x1, G.Y, K.LOBBY);
      m.fill(0, G.lobby.x1 + 0.4, 0, G.X, G.Y, K.PLANT); m.fill(0, G.M * G.MP, 0, G.lobby.x1, G.lobby.y0, K.PLANT);
      // the fleet: a ground robot per module, a robot per level, a lift per module
      this.ground = []; this.levelBots = [null]; this.lifts = [];
      for (let k = 0; k < G.M; k++) this.ground.push(this.addFleet(new ParkRobot(this, this.fleet.length, 'Ground ' + (k + 1), 0, G.modX(k), G.yA)));
      for (let f = 1; f <= c.levels; f++) this.levelBots.push(this.addFleet(new ParkRobot(this, this.fleet.length, 'Level ' + f, f, G.X - 3.5, G.yA)));
      for (let k = 0; k < G.M; k++) this.lifts.push(this.addFleet(new Lift(this, this.fleet.length, k)));
      // the day: residents parked overnight, commuters, visitors through the day
      const d = c.demand, H = (h) => this.hourAt(h), gauss = () => { let s = 0; for (let k = 0; k < 6; k++) s += rng(); return (s - 3) / Math.sqrt(0.5); };
      this.plan = [];
      const nRes = Math.round(c.residents * d), free = this.bays.slice();
      for (let k = 0; k < nRes && free.length; k++) {
        const r = rng(), car = this.newCar('resident');
        // most leave in the morning and are back in the evening; some go out during the day; some stay
        if (r < 0.6) { car.ret = H(Math.min(10, Math.max(6.4, 7.75 + 0.6 * gauss()))); car.back = H(Math.min(22, Math.max(16.5, 18.5 + 0.75 * gauss()))); }
        else if (r < 0.8) { car.ret = H(10 + rng() * 6); car.back = car.ret + 3600 * (1 + rng() * 2); }
        else car.ret = Infinity;
        const bay = free.splice(Math.floor(rng() * free.length), 1)[0];
        car.times.parked = -3600 * (6 + rng() * 6);
        this.parked(car, bay, true);
      }
      for (let k = 0, n = Math.round(c.commuters * d); k < n; k++) {
        const t = H(Math.min(11, Math.max(6.2, c.commuteIn + c.spreadIn * gauss()))), out = H(c.commuteOut + c.spreadOut * gauss());
        this.plan.push({ t, kind: 'commuter', ret: Math.max(out, t + 4 * 3600) });
      }
      this.plan.sort((a, b) => a.t - b.t);
      this.visitAt = H(10); this.nextVisit();
      this.log('system', `Morning: ${nRes} cars parked overnight, ${this.plan.length} commuters expected, about ${Math.round(c.shoppers * d)} visitors an hour from 10:00`);
    }
    addFleet(m) { this.fleet.push(m); return m; }
    addBay(f, row, x0, y) {
      const G = this.G, id = this.bays.length, n = this.bays.filter((b) => b.level === f).length;
      const bay = { id, level: f, row, x: x0 + G.BW / 2, y, x0, x1: x0 + G.BW, car: null, reserved: false, name: `L${f}-${String(n + 1).padStart(2, '0')}` };
      this.bays.push(bay);
      this.map.fill(f, x0 + 0.15, row === 'N' ? 0 : G.BD + G.AW, x0 + G.BW - 0.15, row === 'N' ? G.BD : G.Y, K.BAY, id);
      return bay;
    }
    // shoppers: Poisson arrivals from 10:00 to 20:00, faster in a rush (WS.Disruptions)
    nextVisit() {
      const rate = (this.cfg.shoppers * this.cfg.demand) / 3600;
      this.visitAt = rate > 0 ? this.visitAt - Math.log(1 - this.rng()) / rate : Infinity;
    }

    // ---------------------------------------------------------------- cars
    newCar(kind) {
      const rng = this.rng, id = this.carSeq++, mi = rng.weighted(MODELS.map((x) => x.w), MODELS.reduce((s, x) => s + x.w, 0));
      const pi = rng.weighted(PAINT.map((p) => p[2]), PAINT.reduce((s, p) => s + p[2], 0)), L = () => LAST[Math.floor(rng() * LAST.length)];
      const plate = `${1 + Math.floor(rng() * 2)}-${L()}${L()}${L()}-${String(Math.floor(rng() * 1000)).padStart(3, '0')}`;
      const car = { id, kind, plate, model: MODELS[mi], color: PAINT[pi][0], colorName: PAINT[pi][1], driverName: `${FIRST[Math.floor(rng() * FIRST.length)]} ${L()}.`, app: rng() < this.cfg.appShare, x: 0, y: 0, a: 0, where: 'street', state: 'ARRIVING', bay: null, times: {}, ret: Infinity };
      this.cars.push(car);
      return car;
    }
    // A car turns up in the street: it joins the queue, unless the queue is
    // too long or the car park is full (counting the cars still on their way in).
    arrive(kind, ret) {
      const c = this.cfg, G = this.G, s = this.stats, car = this.newCar(kind);
      car.ret = ret; car.times.arrived = this.time; s.arrived++;
      const inbound = this.queue.length + this.cars.filter((x) => x.state === 'ENTERING' || x.state === 'HANDOVER' || x.state === 'WAITING_ROBOT' || x.state === 'TO_LEVEL').length;
      const room = this.bays.filter((b) => !b.car && !b.reserved).length - inbound;
      if (room <= 0 || this.queue.length >= c.maxQueue) {
        car.state = 'TURNED_AWAY'; car.where = 'gone'; s.turnedAway++; if (room <= 0) s.full++;
        this.log('warn', `${car.plate} turned away: ${room <= 0 ? 'the car park is full' : this.queue.length + ' cars queueing'}`);
        this.cars.splice(this.cars.indexOf(car), 1);
        this.street.push({ car, x: G.roadX1, y: G.laneIn, a: Math.PI / 2, path: [{ x: G.roadX0, y: G.laneIn }], v: 8 });
        return;
      }
      car.state = 'QUEUED'; car.x = G.roadX1; car.y = G.laneIn; car.a = Math.PI / 2; car.v = 0;
      this.queue.push(car);
      this.log('inbound', `${car.plate} (${KIND_NAME[kind]}, ${car.model.name.toLowerCase()}) arrives · ${this.queue.length} in the queue`);
    }
    // the cars in the street: queueing nose to tail, or driving along a path
    stepStreet(dt) {
      const G = this.G;
      for (const it of this.cars) if (it.where === 'street' || it.where === 'cabin') { it.ox = it.x; it.oy = it.y; it.oa = it.a; }
      for (const it of this.street) { it.ox = it.x; it.oy = it.y; it.oa = it.a; }
      this.queue.forEach((car, j) => {
        const tx = G.queueX0 + j * G.queueGap, d = car.x - tx;
        car.v = d > 0.01 ? Math.min(d / dt, Math.min(8, Math.max(2, d * 0.6))) : 0;
        car.x -= Math.min(d, car.v * dt);
      });
      for (const it of [...this.cars.filter((x) => x.path), ...this.street]) {
        let m = (it.car ? it.v : this.speedAt(it)) * dt;
        while (m > 1e-9 && it.path.length) {
          const p = it.path[0], dx = p.x - it.x, dy = p.y - it.y, d = Math.hypot(dx, dy);
          if (d > 1e-6) it.a = Math.atan2(-dx, -dy);
          if (d <= m) { it.x = p.x; it.y = p.y; m -= d; it.path.shift(); } else { it.x += (dx / d) * m; it.y += (dy / d) * m; m = 0; }
        }
        if (!it.path.length) { it.path = null; if (it.car) this.street.splice(this.street.indexOf(it), 1); else this.carArrived(it); }
      }
    }
    // slow inside a cabin, careful turning in and out, faster once away down the street
    speedAt(car) { const G = this.G; return car.y < G.Y + 0.4 ? this.cfg.cabinSpeed : car.state === 'LEAVING' && car.y > G.laneOut - 0.2 ? 8 : this.cfg.driveSpeed; }
    // the queue's head drives into cabin cab
    enter(car, cab) {
      const G = this.G, x = G.modX(cab.idx);
      this.queue.splice(this.queue.indexOf(car), 1);
      cab.set('ENTERING'); cab.car = car; car.cabin = cab; car.state = 'ENTERING'; car.where = 'street'; car.v = 0;
      car.times.entered = this.time;
      car.path = [{ x: x + 3.2, y: G.laneIn }, { x: x + 1.1, y: G.laneIn - 0.9 }, { x: x + 0.15, y: G.laneIn - 2.6 }, { x, y: G.Y + 0.6 }, { x, y: G.eetY }];
      this.log('inbound', `${car.plate} drives into ${cab.name}`);
    }
    carArrived(car) {
      const cab = car.cabin, G = this.G;
      if (car.state === 'ENTERING') {
        car.a = 0; car.where = 'cabin'; car.state = 'HANDOVER'; cab.set('HANDOVER'); cab.t = this.cfg.handover;
        // the driver gets out on the left and goes to the terminal by the door
        const dr = new Driver(this, car, car.x - 1.15, car.y - 0.4);
        dr.walk([{ x: car.x - 1.2, y: G.Y - 1.2 }, { x: car.x + 1.45, y: G.Y - 0.55 }], 'HANDOVER');
        this.drivers.push(dr); car.driver = dr;
      } else if (car.state === 'LEAVING') {
        car.state = 'GONE'; car.where = 'gone'; this.stats.left++;
        this.cars.splice(this.cars.indexOf(car), 1);
      }
    }
    cabinTimer(cab) {
      const car = cab.car, G = this.G;
      if (cab.state === 'HANDOVER') {
        cab.set('SCAN'); cab.t = this.cfg.scanTime;
        const dr = car.driver;
        dr.walk([{ x: dr.x, y: G.Y + 0.6 }, { x: dr.x + (car.id % 2 ? -1 : 1) * 0.5, y: G.pave }, { x: car.id % 2 ? G.roadX0 + 10 : G.X + 30, y: G.pave + (car.id % 3) * 0.3 }], 'AWAY');
        car.driver = null;
      } else if (cab.state === 'SCAN') {
        cab.set('READY_IN'); car.state = 'WAITING_ROBOT'; car.times.handed = this.time; cab.ins++; cab.stats.presented++; this.stats.entered++;
      } else if (cab.state === 'LEAVING') {
        // off it goes: out of the cabin, across into the far lane
        const x = G.modX(cab.idx);
        car.state = 'LEAVING'; car.where = 'street'; car.cabin = null; cab.car = null; cab.set('FREE'); cab.outs++;
        car.path = [{ x, y: G.Y + 1.2 }, { x, y: G.laneIn + 0.6 }, { x: x + 1.2, y: G.laneOut - 0.9 }, { x: x + 4, y: G.laneOut }, { x: G.roadX1, y: G.laneOut }];
        car.times.left = this.time;
        this.log('ship', `${car.plate} leaves from ${cab.name}`);
      }
    }
    parked(car, bay, quiet) {
      bay.car = car; bay.reserved = false; car.bay = bay; car.where = 'bay'; car.state = 'PARKED'; car.x = bay.x; car.y = bay.y; car.level = bay.level;
      if (!quiet) { car.times.parked = this.time; this.stats.stored++; this.kpi.presented++; this.kpi.push('presented'); this.log('robot', `${car.plate} parked in ${bay.name}`); }
    }

    // ---------------------------------------------------------------- returning drivers
    // The driver comes back along the pavement to the lobby, pays and waits,
    // or ordered the car in the app on the way and goes straight to a seat.
    request(car, app) {
      if (car.requested) return;
      car.requested = this.time; car.times.requested = this.time; this.stats.requested++;
      this.requests.push(car);
      this.log('order', `${car.plate} requested${app ? ' in the app' : ' at the kiosk'} (${car.bay ? car.bay.name : car.state.toLowerCase()})`);
    }
    // called from the Cars tab or a car's inspector: the driver orders it in the app now and walks over
    callCar(car) {
      if (car.requested || car.state !== 'PARKED') return;
      car.ret = this.time; car.app = true;
      this.request(car, true);
      if (!car.times.back) this.driverComes(car);
    }
    driverComes(car) {
      const G = this.G, L = G.lobby, west = car.id % 2 === 0;
      const dr = new Driver(this, car, west ? G.roadX0 + 10 : G.X + 30, G.pave + 0.4);
      dr.walk([{ x: L.door, y: G.pave }, { x: L.door, y: G.Y - 0.6 }, car.app ? this.seat(dr) : { x: L.kiosk.x, y: L.kiosk.y }], car.app ? 'TO_SEAT' : 'TO_KIOSK');
      this.drivers.push(dr); car.driver = dr; car.times.back = this.time;
    }
    seat(dr) {
      const L = this.G.lobby, used = new Set(this.drivers.filter((d) => d !== dr && d.seatK != null).map((d) => d.seatK));
      let k = 0; while (used.has(k)) k++;
      dr.seatK = k;
      return { x: L.x0 + 1.4 + (k % 9) * 1.1, y: L.seatY + 0.8 * Math.floor(k / 9) };
    }
    driverArrived(dr) {
      const car = dr.car;
      if (dr.state === 'AWAY') { dr.gone = true; return; }
      if (dr.state === 'HANDOVER') return; // at the terminal until the cabin's timer moves them on
      if (dr.state === 'TO_KIOSK') { dr.state = 'PAY'; dr.t = this.cfg.payTime; return; }
      if (dr.state === 'TO_SEAT') { dr.state = 'WAITING'; dr.a = 0; car.times.lobby = car.times.lobby ?? this.time; this.toCar(dr); return; }
      if (dr.state === 'TO_CAR') { dr.state = 'GET_IN'; dr.t = this.cfg.getIn; car.cabin.set('LEAVING'); car.cabin.t = this.cfg.getIn; car.state = 'BOARDING'; }
    }
    driverTimer(dr) {
      if (dr.state === 'PAY') { this.request(dr.car, false); dr.car.times.lobby = this.time; dr.walk([this.seat(dr)], 'TO_SEAT'); }
      else if (dr.state === 'GET_IN') { dr.gone = true; }
    }
    // a waiting driver goes to the cabin once the car stands there
    toCar(dr) {
      const car = dr.car, G = this.G;
      if (dr.state !== 'WAITING' || car.state !== 'READY') return;
      const x = G.modX(car.cabin.idx);
      dr.seatK = null;
      dr.walk([{ x: G.lobby.door, y: G.Y - 0.6 }, { x: G.lobby.door, y: G.pave }, { x: x + 1.6, y: G.pave }, { x: x + 1.25, y: G.Y - 0.8 }, { x: x + 1.15, y: car.y - 0.5 }], 'TO_CAR');
      const w = this.time - car.times.lobby;
      this.stats.waits.push({ t: this.time, w, plate: car.plate }); if (this.stats.waits.length > 400) this.stats.waits.shift();
    }
    carReady(car, cab) {
      car.state = 'READY'; car.where = 'cabin'; car.times.ready = this.time; car.x = cab.drop.x; car.y = cab.drop.y; car.a = Math.PI;
      cab.set('READY_OUT'); cab.stats.lines++; this.stats.delivered++; this.kpi.linesPicked++; this.kpi.push('lines');
      this.stats.retrievals.push({ t: this.time, r: this.time - car.times.requested }); if (this.stats.retrievals.length > 400) this.stats.retrievals.shift();
      this.log('ship', `${car.plate} ready in ${cab.name}, ${WS.U.fmtDur(this.time - car.times.requested)} after it was requested`);
      if (car.driver) this.toCar(car.driver);
    }

    // ---------------------------------------------------------------- where a car goes
    // Free bays scored by the policy: time to get there (lift and aisle),
    // the level robot's work (balanced), or how long the car will stay.
    chooseBay(car, k) {
      const c = this.cfg, G = this.G, lx = G.modX(k), free = this.bays.filter((b) => !b.car && !b.reserved && !this.levelBots[b.level].down);
      if (!free.length) return null;
      const cost = (b) => G.FZ[b.level] / c.liftV + Math.abs(b.x - lx) / c.vLoaded;
      if (c.placement === 'stay') {
        const sorted = free.slice().sort((a, b) => cost(a) - cost(b)), h = (car.ret - this.time) / 3600;
        return sorted[Math.round(Math.min(1, Math.max(0, h / 9)) * (sorted.length - 1))];
      }
      if (c.placement === 'nearest') return free.reduce((a, b) => (cost(b) < cost(a) ? b : a));
      const load = (f) => { const r = this.levelBots[f]; return r.jobs.length + (r.gen ? 1 : 0); };
      return free.reduce((a, b) => (cost(b) + 45 * load(b.level) < cost(a) + 45 * load(a.level) ? b : a));
    }
    book(type, car, k) {
      const L = this.lifts[k], cab = this.ports[k], J = { id: this.jobs.length + 1, type, car, k, lift: L, cabin: cab, inLift: false };
      if (type === 'store') {
        const bay = this.chooseBay(car, k);
        if (!bay) return false;
        bay.reserved = true; J.bay = bay; J.level = bay.level; car.state = 'TO_LEVEL'; car.target = bay;
      } else {
        J.bay = car.bay; J.level = car.bay.level; cab.set('RESERVED'); cab.car = null; car.cabin = cab; car.state = 'RETRIEVING';
        this.requests.splice(this.requests.indexOf(car), 1);
        this.log('order', `${car.plate}: ${J.level === 0 ? '' : 'level ' + J.level + ' robot and '}${L.name} on their way · out at ${cab.name}`);
      }
      L.job = J; L.run(T.LIFT(this, L, J), J);
      const g = this.ground[k];
      g.jobs.push(J);
      this.levelBots[J.level].jobs.push({ J, kind: type === 'store' ? 'in' : 'out' });
      return true;
    }

    // ---------------------------------------------------------------- dispatch
    dispatch() {
      // cabins: a free one takes the queue's head or the oldest request, whichever has waited longer;
      // a request needs the cabin's lift free as well
      for (const cab of this.ports) {
        if (cab.state !== 'FREE') continue;
        const L = this.lifts[cab.idx], reqs = this.requests.filter((car) => car.state === 'PARKED' && !this.levelBots[car.bay.level].down);
        const req = !L.job && !L.down && reqs.length ? reqs.reduce((a, b) => (b.requested < a.requested ? b : a)) : null;
        const head = this.queue[0], headT = head ? head.times.arrived : Infinity;
        if (req && req.requested <= headT) {
          // the request goes to the free cabin whose lift is nearest the car's level
          const better = this.ports.find((q) => q !== cab && q.state === 'FREE' && !this.lifts[q.idx].job && !this.lifts[q.idx].down && Math.abs(this.lifts[q.idx].z - this.G.FZ[req.bay.level]) < Math.abs(L.z - this.G.FZ[req.bay.level]));
          this.book('retrieve', req, (better || cab).idx);
        } else if (head && head.x - this.G.queueX0 < 0.5) this.enter(head, cab);
      }
      // stores: a car ready in a cabin whose lift is free
      for (const cab of this.ports) if (cab.state === 'READY_IN' && cab.car.state === 'WAITING_ROBOT' && !this.lifts[cab.idx].job && !this.lifts[cab.idx].down) this.book('store', cab.car, cab.idx);
      // robots: a job each. A level robot first serves a lift that is already waiting for it.
      for (const r of this.ground) if (!r.gen && !r.down && r.jobs.length) { const J = r.jobs.shift(); r.run(T.GROUND(this, r, J), J); }
      for (let f = 1; f < this.levelBots.length; f++) {
        const r = this.levelBots[f];
        if (r.gen || r.down || !r.jobs.length) continue;
        let k = r.jobs.findIndex((j) => j.kind === 'in' && j.J.lift.at === f && j.J.lift.car === j.J.car);
        if (k < 0) k = r.jobs.findIndex((j) => j.kind === 'out');
        if (k < 0) k = 0;
        const j = r.jobs.splice(k, 1)[0];
        r.run(T.LEVEL(this, r, j), j.J);
      }
    }

    // ---------------------------------------------------------------- the day
    // Arrivals as planned (commuters, residents coming home, visitors), and
    // drivers coming back for their cars: app users order a few minutes ahead.
    stepDay() {
      const c = this.cfg, t = this.time;
      while (this.plan.length && this.plan[0].t <= t) { const p = this.plan.shift(); this.arrive(p.kind, p.ret); }
      if (this.disrupt.surge) this.visitAt -= this.cfg.tick * (this.disrupt.rateFactor - 1); // a rush: visitors come faster
      while (t >= this.visitAt && t < this.hourAt(20)) {
        const stay = Math.min(4, 0.5 + -Math.log(1 - this.rng()) * 1.2) * 3600;
        this.arrive('shopper', t + stay); this.nextVisit();
      }
      for (const car of this.cars) {
        const inside = car.state === 'PARKED' || car.state === 'TO_LEVEL' || car.state === 'WAITING_ROBOT';
        if (inside && car.app && !car.requested && t >= car.ret - c.appLead * 60) this.request(car, true);
        if (!car.times.back && t >= car.ret && (inside || car.state === 'RETRIEVING' || car.state === 'READY')) this.driverComes(car);
      }
    }
    // A car that has left is a resident's: they come back later as a new arrival.
    noteHome(car) { if (car.back != null) this.plan.push({ t: car.back, kind: 'resident', ret: Infinity }), this.plan.sort((a, b) => a.t - b.t); }

    tick() {
      super.tick();
      const dt = this.cfg.tick;
      this.stepDay();
      this.stepStreet(dt);
      this.stepBusy(dt);
      for (const d of this.drivers) d.update(dt);
      if (this.drivers.some((d) => d.gone)) this.drivers = this.drivers.filter((d) => !d.gone);
      // residents who have just driven off are expected home again
      for (const car of this.cars) if (car.state === 'LEAVING' && !car.homeNoted) { car.homeNoted = true; this.noteHome(car); }
    }

    // ---------------------------------------------------------------- numbers
    occupancy() { return this.bays.filter((b) => b.car).length; }
    // every car, its state and bay, for the regression check (test/golden.js)
    fingerprint() { return this.cars.map((c) => [c.plate, c.state, c.bay ? c.bay.name : '', c.cabin ? c.cabin.code : ''].join('|')).join('\n') + `\n${this.stats.turnedAway}|${this.stats.delivered}|${this.stats.waits.reduce((a, w) => a + w.w, 0).toFixed(1)}`; }
    recent(list, key, span = 3600) { const v = list.filter((e) => e.t > this.time - span).map((e) => e[key]); return v; }
    stat(list, key) {
      const v = this.recent(list, key).sort((a, b) => a - b);
      if (!v.length) return null;
      return { n: v.length, avg: v.reduce((a, b) => a + b, 0) / v.length, p90: v[Math.min(v.length - 1, Math.floor(v.length * 0.9))], max: v[v.length - 1] };
    }
    soundPos(p) { return { x: p.drop.x, y: p.drop.y }; }
    // how busy the cabins, lifts and robots have been lately (15-minute average), for the KPI tiles
    stepBusy(dt) {
      const f = Math.exp(-dt / 900), add = (o, on) => (o.busyNow = (o.busyNow || 0) * f + (on ? 1 - f : 0));
      for (const p of this.ports) add(p, p.state !== 'FREE');
      for (const m of this.fleet) add(m, m instanceof Lift ? !!m.job : !!m.gen);
    }
    breakTargets() { return []; }
    extraAlerts() {
      const out = [], q = this.queue.length, waiting = this.drivers.filter((d) => d.state === 'WAITING').length, free = this.bays.filter((b) => !b.car && !b.reserved).length;
      if (q >= 4) out.push({ sev: q >= this.cfg.maxQueue - 2 ? 'critical' : 'warning', key: 'queue', title: 'Queue in the street', msg: `${q} cars waiting to drive in · ${this.stats.turnedAway} turned away so far` });
      const w = this.stat(this.stats.waits, 'w');
      if (waiting >= 4 || (w && w.p90 > 300)) out.push({ sev: waiting >= 10 || (w && w.p90 > 600) ? 'critical' : 'warning', key: 'lobby', title: 'Drivers waiting', msg: `${waiting} in the lobby${w ? ` · 90% get their car within ${WS.U.fmtDur(w.p90)}` : ''}` });
      if (free < this.bays.length * 0.05) out.push({ sev: free ? 'warning' : 'critical', key: 'full', title: free ? 'Nearly full' : 'Car park full', msg: `${free} bays free of ${this.bays.length}` });
      return out;
    }
  }

  WS.ParkSim = ParkSim;
  WS.ParkRobot = ParkRobot;
  WS.ParkLift = Lift;
  WS.PARK_MODELS = MODELS;
})((globalThis.WS = globalThis.WS || {}));
