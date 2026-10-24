/* LayerLift: beverage distribution by layer picking (specs/layer.txt).
 *
 *  pick field   A row of pallet flow lanes, one product each. The pallet at
 *               the front of a lane is picked from; full pallets wait
 *               behind it and roll forward when it is gone.
 *  gantries     Over the field, on one overhead runway, gantry robots with
 *               a clamp-and-vacuum head lift a whole layer off a lane's
 *               front pallet and set it on a customer's pallet at one of
 *               the build places along the field. They also lift an
 *               emptied pallet off its lane onto the empty-pallet magazine,
 *               and set a new base pallet from it on a free build place.
 *  orders       A customer orders cases of a few products. Whole layers are
 *               picked by the gantries, heaviest first; what is short of a
 *               full layer is put on top by hand at the top-off station.
 *  outbound     Stretch wrapper, labeller, and route trucks at the doors.
 *  replenish    A forklift brings full pallets from the reserve rack along
 *               the north wall to the back of the lanes, and stacks of
 *               empty pallets to or from the magazine.
 * Positions are metres: x east, y south, z up. Two gantries share the
 * runway: one may move only within a stretch it has reserved, clear of the
 * other's stretch and of where the other stands; an idle gantry in the way
 * goes back to its own end. */
(function (WS) {
  'use strict';
  const TERMS = { unit: 'layer', Unit: 'Layer', units: 'layers', Units: 'Layers', store: 'pick field', Store: 'Pick field', port: 'place', ports: 'places', machine: 'Machine', starve: 'layers', flow1: 'Layers /h', flow2: 'Cases out /h', surge: 'Rush of orders' };
  const STATE_LABELS = { MOVING_TO_TARGET: 'Moving empty', TRANSPORTING_TO_PORT: 'Carrying', HANDLING: 'Gripping or setting down', WAITING_IN_TRAFFIC: 'Waiting for the runway', WAITING_PORT: 'Waiting' };
  const LEGEND = ['IDLE', 'MOVING_TO_TARGET', 'TRANSPORTING_TO_PORT', 'HANDLING', 'WAITING_IN_TRAFFIC', 'WAITING_PORT'];
  // products: case L × W × H (m), kg, look, colours, a share of the orders
  const FAMS = [
    { n: 'Water', d: [0.27, 0.18, 0.33], kg: 9.3, look: 'shrink', v: ['still 6×1.5 l', 'sparkling 6×1.5 l', 'lightly sparkling 6×1.5 l'], col: ['#7dd3fc', '#38bdf8', '#93c5fd'], w: 9 },
    { n: 'Cola', d: [0.27, 0.18, 0.33], kg: 9.6, look: 'shrink', v: ['6×1.5 l', 'zero 6×1.5 l'], col: ['#b91c1c', '#111827'], w: 7 },
    { n: 'Lemonade', d: [0.27, 0.18, 0.33], kg: 9.5, look: 'shrink', v: ['orange 6×1.5 l', 'lemon 6×1.5 l', 'tonic 6×1.5 l'], col: ['#f97316', '#facc15', '#a3e635'], w: 4 },
    { n: 'Beer crate', d: [0.4, 0.3, 0.27], kg: 15.5, look: 'crate', v: ['pils 24×25 cl', 'blonde 24×33 cl', 'alcohol-free 24×25 cl'], col: ['#ca8a04', '#b45309', '#15803d'], w: 7 },
    { n: 'Mineral water crate', d: [0.4, 0.3, 0.33], kg: 18, look: 'crate', v: ['still 12×1 l glass', 'sparkling 12×1 l glass'], col: ['#0369a1', '#7c3aed'], w: 3 },
    { n: 'Soft drink cans', d: [0.4, 0.27, 0.12], kg: 8.6, look: 'tray', v: ['cola 24×33 cl', 'orange 24×33 cl', 'energy 24×25 cl'], col: ['#dc2626', '#f97316', '#16a34a'], w: 5 },
    { n: 'Juice', d: [0.29, 0.2, 0.25], kg: 6.6, look: 'kraft', v: ['orange 6×1 l', 'apple 6×1 l', 'multivitamin 6×1 l'], col: ['#f97316', '#65a30d', '#e11d48'], w: 4 },
    { n: 'Wine', d: [0.31, 0.24, 0.33], kg: 8.5, look: 'kraft', v: ['red 6×75 cl', 'white 6×75 cl'], col: ['#7f1d1d', '#a3a3a3'], w: 3 },
  ];
  const CUST = ['Cash & carry', 'Supermarket', 'Café', 'Wholesale', 'Hotel', 'Event caterer'];
  const TOWNS = ['Gent', 'Leuven', 'Mechelen', 'Aalst', 'Brugge', 'Kortrijk', 'Hasselt', 'Lier', 'Ieper', 'Tienen', 'Geel', 'Lokeren', 'Halle', 'Genk', 'Oostende', 'Roeselare'];
  const PZ = { lane: 0.3, spot: 0.45, mag: 0.1 }; // m: where a pallet's runners stand
  const PH = 0.144, PL = 1.2, PW = 0.8; // m: a Euro pallet

  // ---------------------------------------------------------------- geometry
  function geometry(c) {
    const LP = 1.45, X0 = 2.5, W = c.lanes * LP, XF = X0 + W, n = c.buildSpots;
    const yL0 = 4.4, yPick = yL0 + c.laneDepth * 1.2 - 0.7, yBuild = yPick + 2.4, yC = yBuild + 2.2;
    const xTop = XF + 2.6, xWr = xTop + 3.2, xLb = xWr + 2.6;
    const doorX = Array.from({ length: c.doors }, (_, k) => xLb + 2.4 + k * 4.2);
    return {
      LP, X0, W, XF, yL0, yPick, yBuild, yC, xTop, xWr, xLb, doorX,
      laneX: (k) => X0 + LP / 2 + k * LP, slotY: (i) => yPick - i * 1.2,
      spotX: (j) => (n > 1 ? X0 + 1.0 + (j * (W - 2.0)) / (n - 1) : X0 + W / 2),
      magX: [1.2, XF + 1.3], yRack: 0.65, yAisle: 2.7, yR: [yPick - 0.9, yBuild + 0.9], railZ: 4.6, clearZ: 2.95,
      XE: doorX[doorX.length - 1] + 3, yN: -0.3, yWall: yC + 4.0, CZ: 0.8,
      home: [0.9, XF + 1.6], poolX: [0.9, XF + 1.6],
    };
  }

  // ---------------------------------------------------------------- the control room's map
  const K = { OUT: 0, HALL: 1, RACK: 2, LANE: 3, SPOT: 4, CONV: 5, MAG: 6, TRUCK: 7 };
  class LayerMap extends WS.RobotFloor {
    constructor(sim, G) {
      const X0 = -1, Y0 = Math.floor(G.yN) - 1;
      super(Math.ceil(G.XE + 2 - X0), Math.ceil(G.yWall + 15 - Y0), WS.CELL.BLOCKED);
      Object.assign(this, { sim, G, X0, Y0 });
      this.kind = new Uint8Array(this.W * this.D); this.laneOf = new Int16Array(this.W * this.D).fill(-1);
    }
    cell(x, y) { const i = Math.floor(x - this.X0), j = Math.floor(y - this.Y0); return i >= 0 && j >= 0 && i < this.W && j < this.D ? this.idx(i, j) : -1; }
    fill(x0, y0, x1, y1, k, lane = -1) { for (let y = y0; y < y1 - 1e-6; y += 0.5) for (let x = x0; x < x1 - 1e-6; x += 0.5) { const i = this.cell(x, y); if (i >= 0) { this.kind[i] = k; if (lane >= 0) this.laneOf[i] = lane; } } }
    line(conv) { for (let s = 0; s <= conv.len; s += 0.4) { const q = conv.at(s), i = this.cell(q.x, q.y); if (i >= 0 && this.kind[i] <= K.HALL) this.kind[i] = K.CONV; } }
    passable() { return false; }
    depthOf() { return 1; }
    mapFill(i, mix) {
      const l = this.laneOf[i];
      if (l >= 0) { const ln = this.sim.lanes[l], f = ln.pallets.reduce((a, p) => a + p.layers, 0) / (ln.sku.layers * this.sim.cfg.laneDepth); return mix('#7f1d1d', '#1d4ed8', Math.min(1, f * 1.4)); }
      return { [K.HALL]: '#0c1320', [K.RACK]: '#1e293b', [K.SPOT]: '#3a2a0a', [K.CONV]: '#2a3b52', [K.MAG]: '#3f3a2a', [K.TRUCK]: '#111827' }[this.kind[i]] || '#070b12';
    }
    get mapTitle() { return 'PICK FIELD · lanes red (empty) → blue (full) · dots: gantries and the forklift'; }
  }

  // ---------------------------------------------------------------- build places and the top-off station
  class Place extends WS.Port {
    constructor(sim, idx, def) {
      super(sim, idx, def);
      Object.assign(this, { role: def.role, k: def.k, x: def.drop.x, pal: null, state: 'FREE', busy: false, done: 0 });
      this.name = def.role === 'spot' ? 'Build place ' + (def.k + 1) : 'Top-off';
      this.code = def.role === 'spot' ? 'B' + (def.k + 1) : 'T1';
    }
    get job() { return this.role === 'top' ? (this.pal && !this.away ? { lines: [null], next: 0, t: 0, total: 1 } : null) : this.pal ? { lines: [null], next: 0, t: 0, total: 1 } : null; }
    set job(v) {}
    setArm() {}
    update(dt) {
      const st = this.stats, work = this.role === 'top' ? !!(this.pal && this.t > 0 && !this.away) : this.state === 'BUILD' && this.busy, wait = this.role === 'spot' && (this.state === 'BUILD' || this.state === 'WAIT_BASE') && !this.busy;
      st.t += dt;
      if (work) st.busy += dt;
      if (wait) st.starved += dt;
      if (this.away) st.away = (st.away || 0) + dt;
      const f = Math.exp(-dt / 900), g = Math.exp(-dt / 300);
      this.busyNow = (this.busyNow || 0) * f + (work ? 1 - f : 0);
      this.recentStarve = 0; this.waitNow = (this.waitNow || 0) * g + (wait ? 1 - g : 0);
    }
  }

  // ---------------------------------------------------------------- machines
  class Gantry extends WS.Machine {
    constructor(sim, id, k, x) {
      super(sim, id, 'Gantry ' + (k + 1));
      Object.assign(this, { k, x, y: sim.G.yPick, z: sim.G.clearZ, grip: 0, held: null, claim: null, layers: 0, retreat: false, home: sim.G.home[k] });
      this.place(); this.prx = this.rx; this.pry = this.ry;
    }
    update(dt) { this.ox = this.x; this.oy = this.y; this.oz = this.z; super.update(dt); }
    place() { const m = this.sim.map; this.rx = this.x - m.X0 - 0.5; this.ry = (this.sim.G.yPick + this.sim.G.yBuild) / 2 - m.Y0 - 0.5; }
  }
  class Forklift extends WS.Machine {
    constructor(sim, id, k, x, y) {
      super(sim, id, 'Forklift' + (sim.cfg.forklifts > 1 ? ' ' + (k + 1) : ''));
      Object.assign(this, { k, x, y, a: -Math.PI / 2, fork: 0, mast: 0, pal: null, stack: 0, moves: 0 });
      this.place(); this.prx = this.rx; this.pry = this.ry;
    }
    update(dt) { this.ox = this.x; this.oy = this.y; this.oa = this.a; this.ofork = this.fork; super.update(dt); }
    place() { const m = this.sim.map; this.rx = this.x - m.X0 - 0.5; this.ry = this.y - m.Y0 - 0.5; }
  }

  // ---------------------------------------------------------------- tasks
  const T = {};
  const near = (from, to) => to + Math.round((from - to) / (Math.PI * 2)) * Math.PI * 2;
  // A gantry: take the best job its runway allows, do it, give the runway back.
  T.GANTRY = function* (sim, g) {
    const c = sim.cfg, G = sim.G;
    const up = function* () { if (g.z < G.clearZ - 1e-6) yield { op: 'travel', prop: 'z', to: G.clearZ, v: c.hoistV, a: c.hoistA }; };
    const over = function* (x, y) { yield { op: 'travel', axes: [{ prop: 'x', to: x, v: c.gantryV, a: c.gantryA }, { prop: 'y', to: y, v: c.trolleyV, a: c.trolleyA }], settle: 0.4 }; };
    for (;;) {
      let job = null;
      g.state = 'IDLE';
      yield { op: 'until', fn: () => (job = sim.gantryJob(g)) !== null };
      if (job.kind === 'park') {
        g.state = 'MOVING_TO_TARGET';
        yield* up(); yield* over(g.home, g.y);
        sim.unclaim(g); g.retreat = false;
        continue;
      }
      g.task = job;
      g.state = 'MOVING_TO_TARGET';
      yield* up(); yield* over(job.from.x, job.from.y);
      yield { op: 'travel', prop: 'z', to: job.from.z, v: c.hoistV, a: c.hoistA };
      g.state = 'HANDLING';
      yield { op: 'travel', prop: 'grip', to: 1, v: 1 / c.gripTime, a: 10 / c.gripTime };
      sim.gripped(g, job);
      g.state = 'TRANSPORTING_TO_PORT';
      yield* up(); yield* over(job.to.x, job.to.y);
      yield { op: 'travel', prop: 'z', to: job.to.z, v: c.hoistV * 0.7, a: c.hoistA };
      g.state = 'HANDLING';
      yield { op: 'travel', prop: 'grip', to: 0, v: 1 / c.releaseTime, a: 10 / c.releaseTime };
      sim.released(g, job);
      g.state = 'MOVING_TO_TARGET';
      yield* up();
      sim.unclaim(g); g.task = null; g.lifts++;
    }
  };
  // A forklift: a full pallet from the reserve rack to the back of a lane, or a stack of empties to or from the magazine.
  T.FORK = function* (sim, F) {
    const G = sim.G, turn = Math.PI / 2, fore = 1.25;
    const face = function* (a) { yield { op: 'travel', prop: 'a', to: near(F.a, a), v: turn, a: turn * 2 }; };
    for (;;) {
      let job = null;
      F.state = 'IDLE';
      yield { op: 'until', fn: () => (job = sim.forkJob(F)) !== null };
      F.state = 'MOVING_TO_TARGET';
      yield { op: 'travel', prop: 'y', to: G.yAisle, v: 1.2, a: 1 };
      yield* face(job.x > F.x ? Math.PI / 2 : -Math.PI / 2);
      yield { op: 'travel', prop: 'x', to: job.x, v: 2.2, a: 0.8 };
      // the pallet (or stack) to fetch: in the rack to the north, or the magazine to the south
      const from = job.kind === 'mag-out' ? { y: G.yPick, north: false } : { y: G.yRack, north: true };
      yield* face(from.north ? Math.PI : 0);
      yield { op: 'travel', prop: 'y', to: from.y + (from.north ? fore : -fore), v: 1, a: 1 };
      F.state = 'HANDLING';
      yield { op: 'travel', axes: [{ prop: 'mast', to: job.level || 0, v: 0.5, a: 0.8 }, { prop: 'fork', to: 1, v: 0.5, a: 1 }] };
      sim.forkTook(F, job);
      yield { op: 'travel', prop: 'mast', to: 0, v: 0.5, a: 0.8 };
      F.state = 'TRANSPORTING_TO_PORT';
      yield { op: 'travel', prop: 'y', to: G.yAisle, v: 1, a: 1 };
      const to = job.kind === 'lane' ? { x: job.x, y: G.slotY(sim.cfg.laneDepth - 1) } : job.kind === 'mag-in' ? { x: job.mag.x, y: G.yPick } : { x: G.poolX[job.mag.k], y: G.yRack };
      if (Math.abs(to.x - F.x) > 1e-6) { yield* face(to.x > F.x ? Math.PI / 2 : -Math.PI / 2); yield { op: 'travel', prop: 'x', to: to.x, v: 2.2, a: 0.8 }; }
      const north = to.y < G.yAisle;
      yield* face(north ? Math.PI : 0);
      if (job.kind === 'lane') yield { op: 'until', fn: () => sim.laneRoom(job.lane), waitState: 'WAITING_PORT' };
      yield { op: 'travel', prop: 'y', to: to.y + (north ? fore : -fore), v: 1, a: 1 };
      F.state = 'HANDLING';
      yield { op: 'travel', prop: 'fork', to: 0, v: 0.5, a: 1 };
      sim.forkPut(F, job);
      F.state = 'MOVING_TO_TARGET';
      yield { op: 'travel', prop: 'y', to: G.yAisle, v: 1, a: 1 };
      F.moves++;
    }
  };

  // ---------------------------------------------------------------- simulation
  class LayerSim extends WS.Sim {
    get kind() { return 'layer'; }
    get terms() { return TERMS; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    get taskTypes() { return T; }
    get armsAllowed() { return false; }
    defaults() { return WS.LAYER_CONFIG; }
    createGrid() {
      const c = this.cfg, G = (this.G = geometry(c)), m = (this.map = new LayerMap(this, G));
      const cells = (x, y) => { const out = []; for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) out.push({ x: Math.floor(x - m.X0) + dx, y: Math.floor(y - m.Y0) + dy }); return out; };
      for (let j = 0; j < c.buildSpots; j++) { const x = G.spotX(j); m.ports.push({ kind: 'SPOT', role: 'spot', k: j, face: 'front', drop: { x, y: G.yBuild }, lift: { x, y: G.yBuild }, cells: cells(x + 0.5, G.yBuild + 0.5) }); }
      m.ports.push({ kind: 'TOP', role: 'top', k: 0, face: 'front', drop: { x: G.xTop - 0.65, y: G.yC }, lift: { x: G.xTop - 0.65, y: G.yC }, cells: cells(G.xTop, G.yC + 0.5) });
      return m;
    }
    createPort(k, def) { return new Place(this, k, def); }
    describe() { const c = this.cfg; return `Layer picking online · ${c.lanes} lanes · ${c.gantries} gantr${c.gantries > 1 ? 'ies' : 'y'} · ${c.buildSpots} build places · top-off by hand`; }
    storageCapacity() { return this.lanes.reduce((a, l) => a + l.sku.layers * this.cfg.laneDepth, 0); }
    fetchCost() { return 0; }
    clock(t = this.time) { return t + this.cfg.dayStart; }
    get spots() { return this.ports.filter((p) => p.role === 'spot'); }
    get topOff() { return this.ports.find((p) => p.role === 'top'); }
    breakTargets() { return [this.topOff]; }

    seed() {
      const c = this.cfg, G = this.G, rng = this.rng;
      this.stats = { layers: 0, cases: 0, casesTop: 0, pallets: 0, palletsIn: 0, orders: 0, shipped: 0, trucks: 0, empties: 0, stockouts: 0, cycle: [], built: [], layerTimes: [] };
      this.orderSeq = 1; this.palSeq = 1; this.orders = []; this.palQueue = []; this.palletById = new Map();
      this.catalogue();
      // the lanes, full; their front pallets part picked
      this.lanes = this.skus.map((sku, k) => ({ k, x: G.laneX(k), sku, pallets: [], coming: 0, busy: false, rollT: -10, picks: 0 }));
      for (const ln of this.lanes) for (let i = 0; i < c.laneDepth; i++) ln.pallets.push(this.newSource(ln, i ? ln.sku.layers : 1 + Math.floor(rng() * ln.sku.layers)));
      this.mags = this.G.magX.map((x, k) => ({ k, x, count: 3 + 4 * k, coming: 0, forkOut: false }));
      this.buildConveyors();
      this.gantryList = [];
      for (let k = 0; k < Math.min(2, Math.max(1, c.gantries)); k++) this.gantryList.push(this.addFleet(new Gantry(this, this.fleet.length, k, k ? G.home[1] : G.home[0])));
      this.forks = [];
      for (let k = 0; k < c.forklifts; k++) this.forks.push(this.addFleet(new Forklift(this, this.fleet.length, k, 4 + k * 8, G.yAisle)));
      for (const g of this.gantryList) g.run(T.GANTRY(this, g));
      for (const F of this.forks) F.run(T.FORK(this, F));
      this.paintMap();
      this.orderGap = -Math.log(1 - rng()) / Math.max(1e-9, c.orderRate / 3600); this.orderAcc = 0;
      for (let k = 0; k < 4; k++) this.newOrder();
      this.log('system', `06:00 · ${this.lanes.length} lanes full, ${this.orders.length} orders in`);
    }
    addFleet(m) { this.fleet.push(m); return m; }
    catalogue() {
      const c = this.cfg, rng = this.rng;
      this.skus = [];
      const tot = FAMS.reduce((a, f) => a + f.w, 0);
      for (let k = 0; k < c.lanes; k++) {
        // the families in turn by their weight, each variant once before any repeats
        let r = (k + 0.5) * (tot / c.lanes), fi = 0; while (r > FAMS[fi].w) { r -= FAMS[fi].w; fi = (fi + 1) % FAMS.length; }
        const F = FAMS[fi], n = this.skus.filter((p) => p.fam === F).length, j = n % F.v.length;
        const [L, W, H] = F.d, a = Math.floor(PL / L) * Math.floor(PW / W), b = Math.floor(PL / W) * Math.floor(PW / L), rot = b > a;
        const p = { id: k, fam: F, name: `${F.n} ${F.v[j]}${n >= F.v.length ? ' · house brand' : ''}`, L, W, H, kg: F.kg, look: F.look, color: F.col[j], gtin: WS.Barcode.makeGTIN13(80000 + k), rot, perLayer: Math.max(a, b), crush: 2 };
        p.nx = Math.floor(PL / (rot ? W : L)); p.ny = Math.floor(PW / (rot ? L : W));
        p.layers = Math.max(3, Math.min(8, Math.floor(1.6 / H)));
        p.layerKg = p.perLayer * p.kg;
        p.demand = F.w * (0.6 + rng() * 0.8) / F.v.length;
        this.skus.push(p);
      }
      this.demandTot = this.skus.reduce((a, p) => a + p.demand, 0);
    }
    newSource(ln, layers) { const id = this.palSeq++, pal = { id, inbound: true, sku: ln.sku, layers, lane: ln }; return pal; }

    // ---------------------------------------------------------------- conveyors
    buildConveyors() {
      const G = this.G, conv = (name, pts, v, gap) => { const q = new WS.Conveyor(name, pts, v, gap); this.convs.push(q); return q; };
      this.convs = [];
      const x0 = G.spotX(0);
      this.collector = conv('Collector', [{ x: x0, y: G.yC }, { x: G.xTop, y: G.yC }], 0.4, 0.15);
      this.spots.forEach((p) => { const x = G.spotX(p.k), q = conv('Out ' + p.code, [{ x, y: G.yBuild }, { x, y: G.yC }], 0.4, 0.15); q.to(this.collector, x - x0); p.out = q; });
      this.lineA = conv('To the wrapper', [{ x: G.xTop - 1.3, y: G.yC }, { x: G.xWr, y: G.yC }], 0.4, 0.15);
      this.lineB = conv('To the labeller', [{ x: G.xWr - 1.3, y: G.yC }, { x: G.xLb, y: G.yC }], 0.4, 0.15);
      const last = G.doorX[G.doorX.length - 1];
      this.distLine = conv('To the doors', [{ x: G.xLb - 1.3, y: G.yC }, { x: last, y: G.yC }], 0.4, 0.15);
      this.doorLines = G.doorX.map((x, k) => conv('Door ' + (k + 1), [{ x, y: G.yC }, { x, y: G.yWall + 0.4 }], 0.4, 0.15));
      G.doorX.forEach((x, k) => this.distLine.to(this.doorLines[k], 0, k === G.doorX.length - 1 ? this.distLine.len : x - (G.xLb - 1.3), (it) => it.pal.door === k));
      this.wrapper = { pal: null, t: 0, wraps: 0 }; this.labeller = { pal: null, t: 0 };
      this.doors = G.doorX.map((x, k) => ({ k, x, truck: null, gapT: k * 60, loading: null, incoming: 0, route: 0 }));
      this.routeSeq = 1;
    }
    paintMap() {
      const G = this.G, m = this.map;
      m.fill(0, G.yN, G.XE, G.yWall, K.HALL);
      m.fill(G.X0, G.yRack - 0.55, G.XF, G.yRack + 0.55, K.RACK);
      for (const ln of this.lanes) m.fill(ln.x - 0.6, G.yL0, ln.x + 0.6, G.yPick + 0.5, K.LANE, ln.k);
      for (const x of G.magX) m.fill(x - 0.6, G.yPick - 0.4, x + 0.6, G.yPick + 0.4, K.MAG);
      for (const q of this.convs) m.line(q);
      for (const p of this.ports) for (const cl of p.cells) if (m.inside(cl.x, cl.y)) m.kind[m.idx(cl.x, cl.y)] = K.SPOT;
      for (const x of G.doorX) m.fill(x - 1.5, G.yWall, x + 1.5, G.yWall + 14, K.TRUCK);
    }

    // ---------------------------------------------------------------- orders
    // Lines in cases; whole layers are picked by a gantry, the rest put on by hand.
    newOrder() {
      const c = this.cfg, rng = this.rng, id = this.orderSeq++, [lo, hi] = c.linesPerOrder, n = lo + Math.floor(rng() * (hi - lo + 1));
      const used = new Set(), lines = [], w = this.skus.map((p) => p.demand);
      for (let guard = 0; lines.length < n && guard < 200; guard++) {
        const p = this.skus[rng.weighted(w, this.demandTot)];
        if (used.has(p)) continue;
        used.add(p);
        const r = rng(), layers = r < 0.25 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3, cases = layers === 0 || rng() < 0.55 ? 1 + Math.floor(rng() * (p.perLayer - 1)) : 0;
        lines.push({ p, layers, cases, qty: layers * p.perLayer + cases });
      }
      const o = { id, code: 'BO-' + String(7000 + id), cust: `${CUST[id % CUST.length]} ${TOWNS[(id * 5) % TOWNS.length]}`, lines, created: this.time, pallets: [], status: 'PLANNED', loaded: 0 };
      // layers heaviest first, as many as a pallet takes; the cases on top of the last
      const layers = []; for (const l of lines) for (let k = 0; k < l.layers; k++) layers.push(l.p);
      layers.sort((a, b) => b.layerKg - a.layerKg || a.id - b.id);
      const cases = []; for (const l of lines) for (let k = 0; k < l.cases; k++) cases.push(l.p);
      let cur = null;
      const open = () => { const pid = this.palSeq++; cur = { id: pid, sscc: WS.Barcode.makeSSCC(600000 + pid), order: o, layers: [], cases: [], placed: 0, top: 0, height: 0, kg: 0, casesPlaced: 0, state: 'QUEUED', where: 'queue' }; o.pallets.push(cur); this.palletById.set(pid, cur); };
      for (const p of layers) {
        const h = p.layers ? p.H : 0;
        if (!cur || cur.height + h > c.palletLoad + 1e-6 || cur.kg + p.layerKg > c.palletKg) open();
        cur.layers.push(p); cur.height += h; cur.kg += p.layerKg;
      }
      if (cases.length) {
        const maxH = Math.max(...cases.map((p) => p.H)) * 2;
        if (!cur || cur.height + maxH > c.palletLoad + 0.25) open();
        cur.cases = this.placeCases(cases, cur.height);
        cur.kg += cases.reduce((a, p) => a + p.kg, 0);
      }
      o.pallets.forEach((pal, k) => { pal.k = k; pal.of = o.pallets.length; this.palQueue.push(pal); });
      this.orders.push(o); this.stats.orders++;
      this.log('order', `${o.code} for ${o.cust}: ${layers.length} layers and ${cases.length} cases of ${lines.length} products · ${o.pallets.length} pallet${o.pallets.length > 1 ? 's' : ''}`);
      return o;
    }
    // the hand-picked cases on top of a pallet: rows across it, a second tier when the first is full
    placeCases(cases, z0) {
      const out = [], list = cases.slice().sort((a, b) => b.H - a.H || b.L * b.W - a.L * a.W);
      let x = 0, y = 0, rowW = 0, z = z0, tierH = 0;
      for (const p of list) {
        if (x + p.L > PL + 1e-6) { x = 0; y += rowW; rowW = 0; }
        if (y + p.W > PW + 1e-6) { x = 0; y = 0; rowW = 0; z += tierH; tierH = 0; }
        out.push({ p, x, y, z });
        x += p.L; rowW = Math.max(rowW, p.W); tierH = Math.max(tierH, p.H);
      }
      return out;
    }
    stepOrders(dt) {
      const c = this.cfg;
      if (c.orderRate <= 0) return;
      this.orderAcc += dt * this.disrupt.rateFactor;
      while (this.orderAcc >= this.orderGap) { this.orderAcc -= this.orderGap; this.orderGap = -Math.log(1 - this.rng()) / (c.orderRate / 3600); this.newOrder(); }
    }

    // ---------------------------------------------------------------- the runway
    // A job's stretch of runway: from where the gantry is to everywhere it goes, plus the head's width.
    span(g, xs) { return { lo: Math.min(g.x, ...xs) - 1.1, hi: Math.max(g.x, ...xs) + 1.1 }; }
    // whether the other gantry leaves this stretch free; an idle one in it is sent home
    runwayFree(g, s) {
      for (const h of this.gantryList) {
        if (h === g) continue;
        if (h.claim) { if (h.claim.hi > s.lo - 0.4 && h.claim.lo < s.hi + 0.4) return false; continue; }
        if (h.x + 1.1 > s.lo && h.x - 1.1 < s.hi) {
          if (h.home + 1.1 > s.lo && h.home - 1.1 < s.hi) return false; // it could not get out of the way
          h.retreat = true; return false;
        }
      }
      return true;
    }
    unclaim(g) { g.claim = null; }
    // The best job for gantry g that its runway allows: the next layer for
    // the oldest pallet whose lane is ready, an emptied pallet off a lane, a
    // base pallet onto a free build place; or home when another needs it out of the way.
    gantryJob(g) {
      if (g.down) return null;
      const G = this.G, c = this.cfg, cands = [];
      if (g.retreat) {
        if (Math.abs(g.x - g.home) < 0.05) { g.retreat = false; return null; }
        const s = this.span(g, [g.home]);
        if (!this.runwayFree(g, s)) return null;
        g.claim = s; return { kind: 'park' };
      }
      const need = new Map(), half = G.X0 + G.W / 2, mine = (x) => (this.gantryList.length < 2 ? 0 : (x < half) === (g.k === 0) ? 25 : 0);
      // the magazine nearer this gantry's end first
      const mags = this.mags.slice().sort((a, b) => Math.abs(a.x - g.home) - Math.abs(b.x - g.home));
      for (const sp of this.spots) {
        if (sp.busy) continue;
        if (sp.state !== 'BUILD') continue;
        const p = sp.pal.layers[sp.pal.placed], ln = this.lanes[p.id];
        const urgent = (this.time - sp.pal.t0) / 20;
        need.set(ln, Math.max(need.get(ln) || 0, urgent));
        const fp = ln.pallets[0];
        if (ln.busy || !fp || fp.layers <= 0 || this.time - ln.rollT < 3) continue;
        cands.push({ kind: 'layer', spot: sp, lane: ln, score: 100 + (this.time - sp.pal.t0) / 20 + mine(sp.x), x: [ln.x, sp.x] });
      }
      for (const ln of this.lanes) {
        const fp = ln.pallets[0], m = mags.find((q) => q.count + q.coming < c.magCap);
        if (ln.busy || !fp || fp.layers > 0 || !m) continue;
        // as urgent as the oldest pallet waiting for a layer from this lane
        cands.push({ kind: 'empty', lane: ln, mag: m, score: (need.has(ln) ? 130 + need.get(ln) : 40) + mine(ln.x), x: [ln.x, m.x] });
      }
      let best = null;
      for (const j of cands) {
        j.score -= Math.abs(g.x - j.x[0]) * 2;
        if (best && j.score <= best.score) continue;
        const s = this.span(g, j.x);
        if (!this.runwayFree(g, s)) continue;
        best = Object.assign(j, { s });
      }
      if (!best) return null;
      g.claim = best.s;
      return this.plan(best);
    }
    // where the head goes down to take, and to set down, for a job (z: the bottom of what it holds, m)
    plan(j) {
      const G = this.G;
      if (j.kind === 'layer') {
        const fp = j.lane.pallets[0], p = j.lane.sku;
        j.lane.busy = true; j.spot.busy = true;
        j.from = { x: j.lane.x, y: G.yPick, z: PZ.lane + PH + (fp.layers - 1) * p.H };
        j.to = { x: j.spot.x, y: G.yBuild, z: PZ.spot + PH + j.spot.pal.top };
        j.t0 = this.time;
      } else if (j.kind === 'empty') {
        j.lane.busy = true;
        j.from = { x: j.lane.x, y: G.yPick, z: PZ.lane };
        j.to = { x: j.mag.x, y: G.yPick, z: PZ.mag + (j.mag.count + j.mag.coming) * PH };
        j.mag.coming++;
      }
      return j;
    }
    gripped(g, j) {
      if (j.kind === 'layer') { const fp = j.lane.pallets[0]; fp.layers--; g.held = { kind: 'layer', sku: j.lane.sku }; j.lane.picks++; }
      else { j.lane.pallets.shift(); j.lane.rollT = this.time; g.held = { kind: 'pallet' }; this.stats.empties++; }
    }
    released(g, j) {
      g.held = null;
      if (j.kind === 'layer') {
        const pal = j.spot.pal, p = j.lane.sku;
        pal.placed++; pal.top += p.H; j.lane.busy = false; j.spot.busy = false;
        g.layers++; this.stats.layers++; this.stats.cases += p.perLayer;
        this.kpi.presented++; this.kpi.push('presented');
        this.stats.layerTimes.push({ t: this.time, c: this.time - j.t0 }); if (this.stats.layerTimes.length > 300) this.stats.layerTimes.shift();
        if (pal.placed >= pal.layers.length) this.spotDone(j.spot);
      } else { j.lane.busy = false; j.mag.coming--; j.mag.count++; }
    }

    // ---------------------------------------------------------------- build places
    stepSpots() {
      for (const sp of this.spots) {
        if (sp.state === 'FREE' && this.palQueue.length) {
          const pal = this.palQueue.shift();
          sp.pal = pal; sp.state = 'WAIT_BASE'; sp.inT = this.cfg.palletIn; pal.spot = sp; pal.where = 'spot'; pal.state = 'BASE'; pal.t0 = this.time;
          if (!pal.order.started) { pal.order.started = this.time; pal.order.status = 'IN_PROGRESS'; }
        }
        // an empty pallet rolls in from the dispenser under the build place
        if (sp.state === 'WAIT_BASE') { sp.inT -= this.cfg.tick; if (sp.inT <= 0) { sp.state = 'BUILD'; sp.pal.state = 'BUILDING'; if (!sp.pal.layers.length) this.spotDone(sp); } }
        if (sp.state === 'DONE' && sp.out.room(0, 1.3)) {
          sp.out.put({ pal: sp.pal, len: 1.0 }, 0);
          sp.pal.where = 'line'; sp.pal.state = sp.pal.cases.length ? 'TO_TOP' : 'TO_WRAP';
          sp.pal = null; sp.state = 'FREE'; sp.done++;
        }
      }
    }
    spotDone(sp) { sp.state = 'DONE'; sp.pal.state = 'LAYERS_DONE'; this.stats.pallets++; this.kpi.push('shipped'); }

    // ---------------------------------------------------------------- replenishment
    laneRoom(ln) { return ln.pallets.length < this.cfg.laneDepth && this.time - ln.rollT > 3; }
    forkJob(F) {
      if (F.down) return null;
      const c = this.cfg, G = this.G;
      // a magazine nearly full: its stack of empties goes to the dispensers
      for (const m of this.mags) if (m.count >= c.magCap - 2 && !m.forkOut && !m.coming) { m.forkOut = true; return { kind: 'mag-out', mag: m, x: m.x, level: 0 }; }
      // the lane whose front pallet has the fewest layers left, of those with room behind it
      let best = null, bs = Infinity;
      for (const ln of this.lanes) {
        if (ln.pallets.length + ln.coming >= c.laneDepth) continue;
        const left = ln.pallets.reduce((a, p) => a + p.layers, 0) + Math.abs(ln.x - F.x) * 0.05;
        if (left < bs) { bs = left; best = ln; }
      }
      if (!best) return null;
      best.coming++;
      return { kind: 'lane', lane: best, x: best.x, level: [0, 1.6, 3.2][Math.floor(this.rng() * 3)] };
    }
    forkTook(F, j) {
      if (j.kind === 'lane') F.pal = this.newSource(j.lane, j.lane.sku.layers);
      else if (j.kind === 'mag-in') F.stack = 8;
      else { const n = Math.min(8, j.mag.count); j.mag.count -= n; F.stack = n; }
    }
    forkPut(F, j) {
      if (j.kind === 'lane') { j.lane.pallets.push(F.pal); j.lane.coming--; F.pal = null; this.stats.palletsIn++; }
      else if (j.kind === 'mag-in') { j.mag.count += F.stack; j.mag.forkIn = 0; }
      else j.mag.forkOut = false;
      F.stack = 0;
    }

    // ---------------------------------------------------------------- top-off, wrapping, labelling, the doors
    stepOutbound(dt) {
      const c = this.cfg, top = this.topOff, Wr = this.wrapper, Lb = this.labeller, col = this.collector;
      // top-off: the pallet stops, a person puts the cases on one by one; a pallet without cases rolls on
      if (!top.pal && col.atEnd(col.front)) { top.pal = col.take().pal; top.pal.where = 'top'; top.t = 0; }
      if (top.pal) {
        const pal = top.pal;
        if (pal.casesPlaced < pal.cases.length) {
          if (!top.away) { top.t += dt; if (top.t >= c.caseTime) { top.t = 0; pal.casesPlaced++; this.stats.casesTop++; this.stats.cases++; } }
        } else if (this.lineA.room(0.65, 1.3)) { this.lineA.put({ pal, len: 1.0 }, 0.65); pal.where = 'line'; pal.state = 'TO_WRAP'; top.pal = null; top.done++; }
      }
      if (!Wr.pal && this.lineA.atEnd(this.lineA.front)) { Wr.pal = this.lineA.take().pal; Wr.t = c.wrapTime; Wr.pal.where = 'wrapper'; Wr.pal.state = 'WRAP'; }
      if (Wr.pal) { Wr.t -= dt; if (Wr.t <= 0 && this.lineB.room(0.65, 1.3)) { this.lineB.put({ pal: Wr.pal, len: 1.0 }, 0.65); Wr.pal.wrapped = true; Wr.pal.where = 'line'; Wr.pal = null; Wr.wraps++; } }
      if (!Lb.pal && this.lineB.atEnd(this.lineB.front)) { Lb.pal = this.lineB.take().pal; Lb.t = c.labelTime; Lb.pal.where = 'labeller'; Lb.pal.state = 'LABEL'; }
      if (Lb.pal) {
        Lb.t -= dt;
        // to a door whose truck has room for it
        const d = Lb.t <= 0 && this.doors.filter((q) => q.truck && q.truck.state === 'DOCKED' && q.truck.pallets.length + q.incoming < c.truckPallets).sort((a, b) => b.truck.pallets.length + b.incoming - (a.truck.pallets.length + a.incoming))[0];
        if (d && this.distLine.room(0.65, 1.3)) { Lb.pal.door = d.k; d.incoming++; this.distLine.put({ pal: Lb.pal, len: 1.0 }, 0.65); Lb.pal.labelled = true; Lb.pal.where = 'line'; Lb.pal.state = 'TO_DOOR'; Lb.pal = null; }
      }
      // route trucks: load what comes, leave when full or at the cut-off after the first pallet
      for (const d of this.doors) {
        const tr = d.truck, q = this.doorLines[d.k];
        if (!tr) { d.gapT -= dt; if (d.gapT <= 0) { d.truck = { route: this.routeSeq++, state: 'ARRIVING', t: 25, pallets: [], first: null }; } continue; }
        if (tr.t > 0) { tr.t -= dt; if (tr.t <= 0) { if (tr.state === 'ARRIVING') tr.state = 'DOCKED'; else { d.truck = null; d.gapT = 120; } } continue; }
        if (tr.state !== 'DOCKED') continue;
        if (d.loading) { d.loading.t -= dt; if (d.loading.t <= 0) { const pal = d.loading.pal; tr.pallets.push(pal); pal.where = 'truck'; pal.state = 'LOADED'; pal.order.loaded++; d.incoming--; d.loading = null; if (tr.first == null) tr.first = this.time; this.shippedPallet(pal); } }
        else if (q.atEnd(q.front)) { const pal = q.take().pal; d.loading = { pal, t: 15, t0: this.time }; }
        const full = tr.pallets.length >= c.truckPallets, late = tr.first != null && this.time - tr.first > c.cutoff * 60 && !d.incoming && !d.loading;
        if (!d.loading && !d.incoming && (full || late)) { tr.state = 'LEAVING'; tr.t = 25; this.stats.trucks++; this.log('ship', `Route truck ${tr.route} leaves door ${d.k + 1} with ${tr.pallets.length} pallets`); for (const pal of tr.pallets) this.palletById.delete(pal.id); }
      }
    }
    shippedPallet(pal) {
      const o = pal.order;
      this.kpi.linesPicked += pal.layers.reduce((a, p) => a + p.perLayer, 0) + pal.cases.length; this.kpi.push('lines', pal.layers.reduce((a, p) => a + p.perLayer, 0) + pal.cases.length);
      this.stats.built.push({ t: this.time, layers: pal.layers.length, cases: pal.cases.length, h: pal.top + (pal.cases.length ? Math.max(...pal.cases.map((c) => c.z + c.p.H)) - pal.top : 0), kg: pal.kg }); if (this.stats.built.length > 300) this.stats.built.shift();
      if (o.loaded >= o.pallets.length) {
        o.status = 'SHIPPED'; o.shipped = this.time; this.stats.shipped++; this.kpi.ordersShipped++;
        this.stats.cycle.push({ t: this.time, c: o.shipped - o.created }); if (this.stats.cycle.length > 200) this.stats.cycle.shift();
        if (this.orders.length > 150) { const k = this.orders.findIndex((x) => x.status === 'SHIPPED'); if (k >= 0) this.orders.splice(k, 1); }
      }
    }

    // ---------------------------------------------------------------- tick
    dispatch() {} // the gantries and forklifts pick their own jobs (see the tasks)
    tick() {
      super.tick();
      const dt = this.cfg.tick;
      this.stepOrders(dt);
      this.stepSpots();
      for (const q of this.convs) q.update(dt);
      this.stepOutbound(dt);
      const f = Math.exp(-dt / 900);
      for (const m of this.fleet) m.busyNow = (m.busyNow || 0) * f + (m.bucket === 'WORK' ? 1 - f : 0);
      // a lane whose product has run out (its front pallet empty, nothing behind)
      for (const ln of this.lanes) { const out = !ln.pallets.some((p) => p.layers > 0); if (out && !ln.out) this.stats.stockouts++; ln.out = out; }
    }

    // ---------------------------------------------------------------- numbers
    stat(list, key, span = 3600) {
      const v = list.filter((e) => e.t > this.time - span).map((e) => e[key]).sort((a, b) => a - b);
      return v.length ? { n: v.length, avg: v.reduce((a, b) => a + b, 0) / v.length, p90: v[Math.min(v.length - 1, Math.floor(v.length * 0.9))], max: v[v.length - 1] } : null;
    }
    layersInField() { return this.lanes.reduce((a, l) => a + l.pallets.reduce((b, p) => b + p.layers, 0), 0); }
    soundPos(p) { return p.drop; }
    extraAlerts() {
      const out = [], empty = this.lanes.filter((l) => l.out).length, q = this.palQueue.length, top = this.collector.items.length;
      if (empty) out.push({ sev: empty > 2 ? 'critical' : 'warning', key: 'out', title: 'Lanes run empty', msg: `${empty} lane${empty > 1 ? 's' : ''} waiting for the forklift` });
      if (q > this.spots.length) out.push({ sev: q > this.spots.length * 3 ? 'critical' : 'warning', key: 'queue', title: 'Pallets waiting for a build place', msg: `${q} pallets queued` });
      if (top >= 5) out.push({ sev: top >= 8 ? 'critical' : 'warning', key: 'top', title: 'Queue at the top-off station', msg: `${top} pallets waiting for their cases` });
      return out;
    }
    fingerprint() {
      return this.lanes.map((l) => `${l.k}:${l.pallets.map((p) => p.layers).join('.')}`).join(' ') + `\n${this.stats.layers}|${this.stats.cases}|${this.stats.pallets}|${this.stats.shipped}|${this.mags.map((m) => m.count).join(',')}|${this.spots.map((s) => s.state[0]).join('')}`;
    }
  }

  WS.LayerSim = LayerSim;
  WS.LayerGantry = Gantry; WS.LayerForklift = Forklift;
  WS.LAYER_PZ = PZ; WS.LAYER_PALLET = { PH, PL, PW };
})((globalThis.WS = globalThis.WS || {}));
