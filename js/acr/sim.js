/* StackPilot: case-handling robots (ACR). Totes sit single deep on ordinary
 * shelving with aisles one robot wide. A robot has a mast with a tote handler
 * and a column of shelves on its back, so it collects a batch of totes on one
 * trip: it loads returning totes at a station, stores them near its
 * retrievals, takes the totes a station needs, and hands them over at that
 * station's handover point, from where a short conveyor feeds the station.
 * Aisles are one-way (alternating), or locked: a trip only uses aisles no
 * other robot holds, and holds them until it has left them.
 * The robots are WS.Robots (battery, routing, traffic); the racking
 * bookkeeping and conveyors come from WS.RackSim (js/sim/rack.js). */
(function (WS) {
  'use strict';
  const CELL = Object.assign(WS.CELL, { AISLE: 6, PARK: 7 });
  const TERMS = { unit: 'tote', Unit: 'Tote', units: 'totes', Units: 'Totes', store: 'racking', Store: 'Racking', port: 'station', ports: 'stations', machine: 'Robot' };
  const EXTRA = { MAST: { label: 'Mast up/down', color: '#e879f9' } };
  const STATE_LABELS = { MOVING_TO_TARGET: 'To a location', STORING: 'To store', HANDLING: 'Handler', TRANSPORTING_TO_PORT: 'To station', AT_PORT: 'Handover', WAITING_PORT: 'Waiting (port queue)' };
  const LEGEND = ['IDLE', 'MOVING_TO_TARGET', 'STORING', 'MAST', 'HANDLING', 'TRANSPORTING_TO_PORT', 'AT_PORT', 'WAITING_IN_TRAFFIC', 'WAITING_PORT', 'TO_CHARGER', 'CHARGING'];
  const ZU = WS.RACK_ZU;

  // ---------------------------------------------------------------- floor
  // Rows from the back: a cross aisle two cells wide, the racking (aisle a:
  // rack x = 3a, aisle 3a+1, rack 3a+2; bay b at y = Y0 + b), a front cross
  // aisle, the stations' queue lanes and handover points, and a conveyor row.
  // Right of the racking: a corridor two cells wide and a column of parking
  // spots and chargers. Lane entries sit in front of rack columns, not aisle
  // mouths, so robots queueing for a station never block an aisle.
  class AcrFloor extends WS.RobotFloor {
    constructor(cfg, sim) {
      const A = cfg.aisles, B = cfg.bays, L = cfg.levels, nPorts = cfg.pickPorts + cfg.goodsInPorts, ll = cfg.laneLength;
      // station pitch: lane, handover point and the put wall with its spur; a multiple of 3
      const pitch = 3 * Math.ceil(Math.max(ll + 4, 3.15 + (cfg.toteSlots - 1) * 0.52) / 3), sx = (k) => 3 + ll + k * pitch;
      const Y0 = 2, laneY = Y0 + B + 2, parkX = A * 3 + 2;
      super(Math.max(parkX + 1, sx(nPorts - 1) + 2), laneY + 2, CELL.BLOCKED);
      this.cfg = cfg; this.sim = sim;
      Object.assign(this, { A, B, L, Y0, laneY, parkX }); this.SB = B; this.frontY = Y0 + B; this.shadowW = this.W;
      this.LH = cfg.levelHeight / ZU; this.Z0 = 0.5; this.Z = this.Z0 + L * this.LH; // render levels
      this.ioZ = 0.6; // handler height while driving
      for (let y = 0; y < this.laneY; y++) {
        for (let x = 0; x < this.W; x++) {
          let t = CELL.HIGHWAY;
          if (y >= this.Y0 && y < this.frontY) {
            if (x < A * 3) t = x % 3 === 1 ? CELL.AISLE : CELL.STORAGE;
            else if (x === this.parkX) t = CELL.PARK;
            else if (x > this.parkX) t = CELL.BLOCKED;
          }
          this.type[this.idx(x, y)] = t;
        }
      }
      for (let k = 0; k < cfg.chargers; k++) {
        const y = this.Y0 + Math.min(B - 1, Math.floor(((k + 0.5) * B) / cfg.chargers));
        this.type[this.idx(this.parkX, y)] = CELL.CHARGER;
        this.chargers.push({ id: k, x: this.parkX, y, robot: -1 });
      }
      for (let k = 0; k < nPorts; k++) {
        const x = sx(k), lane = [];
        for (let j = 0; j < ll; j++) lane.push({ x: x - ll + j, y: this.laneY });
        const hand = { x, y: this.laneY };
        this.addStation({ kind: k < cfg.pickPorts ? 'PICK' : 'GOODS_IN', face: 'front', drop: { x, y: this.D - 1 }, lift: { x: x + 1, y: this.D - 1 }, lane, hand, entry: { x: x - ll, y: this.laneY - 1 } }, hand);
      }
    }
    depthOf() { return 1; }
    levelZ(l) { return this.Z0 + l * this.LH; }
    laneX(a) { return a * 3 + 1.5; }
    aisleAt(i) { return this.type[i] === CELL.AISLE ? (this.cx(i) - 1) / 3 : -1; }

    // ---------- traffic rules (used by the router) ----------
    // One-way: a move along an aisle, into it or out of it goes the aisle's way.
    dirOK(i, from) {
      if (from == null || this.cfg.aisleMode !== 'oneway' || this.cx(i) !== this.cx(from)) return true;
      const a = this.type[i] === CELL.AISLE ? this.aisleAt(i) : this.aisleAt(from);
      return a < 0 || this.cy(i) - this.cy(from) === this.sim.aisles[a].dir;
    }
    // Locking: only the robot holding the aisle may drive in it.
    aisleOK(i, r, from) {
      if (this.cfg.aisleMode === 'lock') return !!r && this.sim.aisles[this.aisleAt(i)].lock === r.id;
      return this.dirOK(i, from);
    }
    passable(i, r, from) {
      const t = this.type[i];
      if (t === CELL.HIGHWAY || t === CELL.PARK) return this.dirOK(i, from);
      if (t === CELL.AISLE) return this.aisleOK(i, r, from);
      if (t === CELL.LANE) return this.laneEnter(i, from);
      return false;
    }
    // Lanes and handover points are entered in queue order (WS.RobotFloor.laneEnter).
    enterGoal(i, r, from) {
      const t = this.type[i];
      if (t === CELL.LANE || t === CELL.PORT) return this.laneEnter(i, from);
      if (t === CELL.AISLE) return this.aisleOK(i, r, from);
      if (t === CELL.HIGHWAY || t === CELL.PARK) return this.dirOK(i, from);
      return t === CELL.CHARGER;
    }
    canPark(i) { return this.type[i] === CELL.PARK; }

    // Control-room map: rack columns by fill, aisles, lanes and stations.
    mapFill(i, mix) {
      const t = this.type[i];
      if (t === CELL.STORAGE) { const x = this.cx(i); return mix('#131c2c', '#2a5d9e', this.sim.columnFill(Math.floor(x / 3), x % 3 ? 1 : 0, this.cy(i) - this.Y0)); }
      return { [CELL.HIGHWAY]: '#0c1220', [CELL.AISLE]: '#111a2a', [CELL.PARK]: '#0d1a14', [CELL.LANE]: '#2a2208', [CELL.PORT]: '#3a2a0a', [CELL.CHARGER]: '#0f3321' }[t] || '#070b12';
    }
    get mapTitle() { return 'FLOOR · fill = totes per rack column'; }
  }

  // The order totes' spur sits just past the put wall, which is wide here.
  class AcrLayout extends WS.Layout {
    spurX(port) { return this.slotPos(port, this.sim.cfg.toteSlots - 1).x + 0.55; }
  }

  // ---------------------------------------------------------------- robot
  // A WS.Robot with a mast: `mast` is the handler height (render levels),
  // `load` the totes on its back shelves.
  class AcrRobot extends WS.Robot {
    constructor(sim, id, x, y) {
      super(sim, id, x, y);
      this.mast = sim.grid.ioZ; this.load = []; this.xfer = null; this.aisleWait = false; // xfer: tote being taken or put, { id, take, side }
    }
    place() {}
    hold(id) { this.load.push(id); this.bin = this.load[0]; }
    drop(id) { this.load.splice(this.load.indexOf(id), 1); this.bin = this.load[0] || null; }
  }

  // ---------------------------------------------------------------- tasks
  const T = { CHARGE: WS.Tasks.CHARGE, YIELD: WS.Tasks.YIELD, PARK: WS.Tasks.PARK };


  // One trip: load returning totes at a station, visit the stops (store and
  // take totes, handler up and down at each), hand the batch over at the
  // destination station.
  T.TRIP = function* (sim, r, t) {
    const cfg = sim.cfg, g = sim.grid, v = cfg.mastSpeed / ZU;
    if (t.pickup != null) {
      const port = sim.ports[t.pickup];
      r.state = 'MOVING_TO_TARGET';
      yield* WS.Tasks.throughLane(sim, r, port, port.hand);
      r.state = 'AT_PORT'; r.busy = true;
      for (const bin of t.returns) {
        yield { op: 'wait', t: cfg.handoverTime };
        port.back.splice(port.back.indexOf(bin), 1);
        bin.loc = 'robot'; r.hold(bin.id);
      }
      r.busy = false; t.loaded = true;
    }
    for (const st of t.stops) {
      const aisle = sim.aisles[st.a];
      r.state = st.ops.some((o) => o.kind === 'take') ? 'MOVING_TO_TARGET' : 'STORING';
      yield { op: 'move', x: st.a * 3 + 1, y: g.Y0 + st.b };
      r.busy = true; // the robot blocks its aisle cell while the handler works
      for (const o of st.ops) {
        r.state = 'MAST';
        yield { op: 'mast', to: g.levelZ(o.l), v };
        r.state = 'HANDLING'; r.xfer = { id: o.bin.id, take: o.kind === 'take', side: o.s };
        yield { op: 'wait', t: cfg.handlerTime };
        r.xfer = null; r.lifts++; o.done = true;
        if (o.kind === 'put') {
          aisle.resv[sim.si(o.l, o.s, o.b)] = false;
          r.drop(o.bin.id);
          sim.place(o.bin, st.a, o.l, o.s, o.b);
          sim.kpi.stores++;
        } else {
          sim.take(o.bin);
          o.bin.loc = 'robot'; o.bin.robot = r.id; o.bin.task = null; r.hold(o.bin.id);
          sim.removeTask(o.task);
        }
      }
      r.state = 'MAST';
      yield { op: 'mast', to: g.ioZ, v };
      r.busy = false;
    }
    if (t.dest != null) {
      const port = sim.ports[t.dest];
      // no more robots head for a station than its lane and handover point hold
      yield { op: 'until', fn: () => sim.visitors(port) < cfg.laneLength + 1, waitState: 'WAITING_PORT' };
      t.toDest = true;
      r.state = 'TRANSPORTING_TO_PORT';
      yield* WS.Tasks.throughLane(sim, r, port, port.hand);
      r.state = 'AT_PORT'; r.busy = true;
      while (r.load.length) {
        yield { op: 'wait', t: cfg.handoverTime };
        const bin = sim.inv.binById.get(r.load[0]);
        r.drop(bin.id);
        sim.toPort(bin, sim.infeedPath(port), port);
      }
      r.busy = false;
    }
    sim.onTrip(t);
  };

  // ---------------------------------------------------------------- simulation
  class AcrSim extends WS.RackSim {
    get kind() { return 'acr'; }
    get terms() { return TERMS; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    get extraStates() { return EXTRA; }
    get taskTypes() { return T; }
    defaults() { return WS.ACR_CONFIG; }
    createGrid() { return new AcrFloor(this.cfg, this); }
    createMap() { return this.grid; } // the control room shows the floor
    createLayout() { return new AcrLayout(this); }
    describe() { const c = this.cfg; return `${c.aisles} aisles × ${c.levels} levels × ${c.bays} bays online · ${this.fleet.length} robots · ${this.inv.bins.length} totes · ${c.aisleMode === 'oneway' ? 'one-way aisles' : 'aisle locking'}`; }
    // even aisles run from the front to the back, odd ones back to the front
    newAisle(a) { return { dir: a % 2 ? 1 : -1, lock: -1 }; }
    createMachines() {
      const g = this.grid, cells = [];
      for (let y = g.Y0; y < g.frontY; y++) if (g.type[g.idx(g.parkX, y)] === CELL.PARK) cells.push(g.idx(g.parkX, y));
      for (let i = 0; i < g.type.length; i++) if (g.type[i] === CELL.HIGHWAY) cells.push(i);
      for (let k = 0; k < this.cfg.robots && k < cells.length; k++) this.fleet.push(new AcrRobot(this, k, g.cx(cells[k]), g.cy(cells[k])));
      for (const p of this.ports) p.back = []; // totes back from the station, waiting for a robot
      this.trips = { n: 0, takes: 0, puts: 0, time: 0 };
      this.loadSum = 0; this.loadT = 0; this.aisleWaits = { n: 0, t: 0 };
    }
    seed() { super.seed(); this.aisleRank = null; }
    // the map cell of a stored tote is its rack column on the floor
    place(bin, a, l, s, b) { super.place(bin, a, l, s, b); bin.x = a * 3 + s * 2; bin.y = this.grid.Y0 + b; }
    columnFill(a, s, b) {
      const aisle = this.aisles[a], L = this.cfg.levels;
      let n = 0;
      for (let l = 0; l < L; l++) if (aisle.slot[this.si(l, s, b)]) n++;
      return n / L;
    }

    // ---------- conveyors at the stations ----------
    infeedPath(p) { const g = this.grid, x = p.hand.x + 0.5; return [{ x, y: g.laneY + 0.8 }, { x, y: g.D }]; }
    backPath(p) { const g = this.grid, x = p.hand.x + 1.5; return [{ x, y: g.D }, { x, y: g.D - 0.75 }]; }
    stationPath(from, to) {
      const g = this.grid, y = g.D - 0.45;
      return [{ x: from.hand.x + 1.5, y: g.D }, { x: from.hand.x + 1.5, y }, { x: to.hand.x + 0.5, y }, { x: to.hand.x + 0.5, y: g.D }];
    }
    // A tote no station needs goes onto the return conveyor, where it waits
    // for a robot to store it.
    returnTote(port, bin) {
      this.convey(bin, this.backPath(port), () => { port.back.push(bin); bin.loc = 'buffer'; bin.robot = -1; bin.backT = this.time; return true; }, true);
    }

    // ---------- storage policy ----------
    // 0 = fastest position: low (short mast travel), near the front, in the
    // aisles closest to a station.
    rank(a, l, b) {
      const c = this.cfg;
      if (!this.aisleRank) {
        const xs = this.ports.map((p) => p.hand.x), d = this.aisles.map((x) => Math.min(...xs.map((hx) => Math.abs(x.a * 3 + 1 - hx))));
        const mx = Math.max(1, ...d);
        this.aisleRank = d.map((v) => v / mx);
      }
      return 0.45 * l / Math.max(1, c.levels - 1) + 0.3 * this.aisleRank[a] + 0.25 * (c.bays - 1 - b) / Math.max(1, c.bays - 1);
    }
    // rough robot effort between two rack positions
    posDist(a1, b1, a2, b2) { return a1 === a2 ? Math.abs(b1 - b2) * 0.5 : 8 + Math.abs(a1 - a2) * 3; }
    // Free position for a returning tote: fast movers in fast positions, and
    // close to the trip's retrievals so the robot drops and picks in one aisle.
    storeSlot(bin, takes, open) {
      const c = this.cfg, pol = c.putawayPolicy, target = { A: 0, B: 0.35, C: 0.75, E: 0.6 }[this.inv.binClass(bin)];
      let best = null, bs = Infinity;
      for (const aisle of this.aisles) {
        if (!open(aisle.a)) continue;
        for (let b = 0; b < c.bays; b++) {
          let near = 0;
          if (takes.length) { near = Infinity; for (const t of takes) near = Math.min(near, this.posDist(aisle.a, b, t.bin.aisle, t.bin.bay)); }
          for (let l = 0; l < c.levels; l++) for (let s = 0; s < 2; s++) {
            const i = this.si(l, s, b);
            if (aisle.slot[i] || aisle.resv[i]) continue;
            const rk = this.rank(aisle.a, l, b);
            const sc = pol === 'random' ? this.rng() : pol === 'nearest' ? rk * 4 + near * 0.5 : Math.abs(rk - target) * 20 + near * 0.5;
            if (sc < bs) { bs = sc; best = { a: aisle.a, l, s, b }; }
          }
        }
      }
      return best;
    }
    fetchCost(bin) {
      if (bin.loc !== 'grid') return 10;
      return this.rank(bin.aisle, bin.level, bin.bay) * 3 + (bin.task ? -1 : 0);
    }

    // ---------- trips ----------
    portRoom(p) { return this.cfg.portInboundCap - (p.inbound + p.inQ.length + (p.pick ? 1 : 0)); }
    // Robots on their way to a station's handover point. No more go there
    // than its lane and handover point hold, so a queue never spills into the
    // cross aisle: a robot with a batch waits at its last stop until there is room.
    visitors(p) {
      let n = 0;
      for (const r of this.fleet) { const t = r.task; if (t && t.type === 'TRIP' && ((t.pickup === p.idx && !t.loaded) || (t.dest === p.idx && t.toDest))) n++; }
      return n;
    }
    canVisit(p, r) { return (p.hand.x === r.x && p.hand.y === r.y) || this.visitors(p) < this.cfg.laneLength + 1; }
    // A batch for robot r: totes the most urgent station with room needs,
    // close together in the racking, plus returning totes from the station
    // the robot is at (or the nearest one with totes waiting).
    planTrip(r) {
      const cfg = this.cfg, N = cfg.robotSlots;
      // aisle locking: a trip only uses aisles no other robot holds
      const open = (a) => cfg.aisleMode !== 'lock' || this.aisles[a].lock < 0;
      const pend = this.pendingTasks().filter((t) => t.type === 'RETRIEVE' && t.bin.loc === 'grid' && open(t.bin.aisle));
      let dest = null;
      for (const t of pend) { const p = this.ports[t.bin.requests[0].port]; if (this.portRoom(p) > 0) { dest = p; break; } }
      const waiting = (p) => p.back.filter((b) => b.robot < 0);
      let pick = this.ports.find((p) => p.hand.x === r.x && p.hand.y === r.y && waiting(p).length) || null;
      if (!pick) {
        let bd = Infinity;
        for (const p of this.ports) {
          const d = WS.U.manhattan(r.x, r.y, p.hand.x, p.hand.y);
          if (waiting(p).length && d < bd && this.canVisit(p, r)) { bd = d; pick = p; }
        }
      }
      if (!dest && !pick) return null;
      const mine = dest ? pend.filter((t) => t.bin.requests[0].port === dest.idx) : [];
      let k0 = Math.min(mine.length, dest ? this.portRoom(dest) : 0, N);
      let nRet = pick ? Math.min(waiting(pick).length, N - Math.min(k0, N >> 1)) : 0;
      // wait for a fuller batch, unless the oldest tote has waited long enough
      const min = Math.min(cfg.minBatch, N);
      if (k0 < min && (!mine.length || this.time - mine[0].created < cfg.batchWait)) k0 = 0;
      if (nRet < min && !k0 && (!nRet || this.time - waiting(pick)[0].backT < cfg.batchWait)) nRet = 0;
      if (!k0 && !nRet) return null;
      const k = Math.min(k0, N - nRet);
      // retrievals: the most urgent, then the ones closest to those chosen;
      // waiting earns a head start
      const takes = [];
      if (k) {
        takes.push(mine.shift());
        while (takes.length < k && mine.length) {
          let bj = 0, bc = Infinity;
          mine.forEach((t, j) => {
            let d = Infinity;
            for (const s of takes) d = Math.min(d, this.posDist(t.bin.aisle, t.bin.bay, s.bin.aisle, s.bin.bay));
            const c = d - (this.time - t.created) / 15;
            if (c < bc) { bc = c; bj = j; }
          });
          takes.push(mine.splice(bj, 1)[0]);
        }
      }
      const ops = [], returns = [];
      for (const t of takes) {
        const b = t.bin;
        t.robot = r.id; t.port = dest.idx; dest.inbound++;
        ops.push({ kind: 'take', bin: b, task: t, a: b.aisle, l: b.level, s: b.side, b: b.bay });
      }
      for (const bin of pick ? waiting(pick).slice(0, nRet) : []) {
        const p = this.storeSlot(bin, takes, open);
        if (!p) break;
        this.aisles[p.a].resv[this.si(p.l, p.s, p.b)] = true;
        bin.robot = r.id; returns.push(bin);
        ops.push(Object.assign({ kind: 'put', bin }, p));
      }
      if (!ops.length) return null;
      if (cfg.aisleMode === 'lock') for (const o of ops) this.aisles[o.a].lock = r.id;
      return { type: 'TRIP', pickup: returns.length ? pick.idx : null, returns, stops: this.route(ops, returns.length ? pick.hand.x : r.x), dest: takes.length ? dest.idx : null, priority: 5, takes: takes.length, puts: returns.length };
    }
    // Stops in visiting order: aisles from the end nearest the start, each
    // aisle in its driving direction; at a stop, stores first, low levels first.
    route(ops, x0) {
      const by = new Map();
      for (const o of ops) {
        const key = o.a * 1000 + o.b;
        if (!by.has(key)) by.set(key, { a: o.a, b: o.b, ops: [] });
        by.get(key).ops.push(o);
      }
      const stops = [...by.values()];
      for (const s of stops) s.ops.sort((p, q) => (p.kind === q.kind ? p.l - q.l : p.kind === 'put' ? -1 : 1));
      const as = stops.map((s) => s.a), lo = Math.min(...as), hi = Math.max(...as), up = Math.abs(x0 - (lo * 3 + 1)) <= Math.abs(x0 - (hi * 3 + 1));
      const dir = (a) => (this.cfg.aisleMode === 'oneway' ? this.aisles[a].dir : -1);
      return stops.sort((p, q) => (p.a !== q.a ? (up ? p.a - q.a : q.a - p.a) : (q.b - p.b) * -dir(p.a)));
    }
    onTrip(t) {
      super.onCycle();
      Object.assign(this.trips, { n: this.trips.n + 1, takes: this.trips.takes + t.takes, puts: this.trips.puts + t.puts, time: this.trips.time + this.time - t.started });
    }

    // ---------- dispatch ----------
    dispatch() {
      this.createRetrievals();
      this.dispatchCharging();
      const g = this.grid, atPort = (r) => (g.type[g.idx(r.x, r.y)] === CELL.PORT ? 1 : 0);
      // robots standing at a handover point go first: they block its lane
      for (const r of this.idleRobots().sort((a, b) => atPort(b) - atPort(a))) {
        const t = this.planTrip(r);
        if (t) this.assignTask(r, t);
      }
      this.parkIdle(this.fleet.filter((r) => !r.task));
    }
    needsParking(r) { const t = this.grid.type[this.grid.idx(r.x, r.y)]; return t !== CELL.PARK && t !== CELL.CHARGER; }
    parkingCell(r) {
      const g = this.grid; let best = -1, bd = Infinity;
      for (let y = g.Y0; y < g.frontY; y++) {
        const i = g.idx(g.parkX, y);
        if (g.type[i] !== CELL.PARK || g.claim[i] >= 0) continue;
        const d = WS.U.manhattan(r.x, r.y, g.parkX, y);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }

    tick() {
      super.tick();
      const dt = this.cfg.tick, g = this.grid;
      for (const r of this.fleet) {
        if (r.task && r.task.type === 'TRIP') { this.loadSum += r.load.length * dt; this.loadT += dt; }
        const w = r.displayState === 'WAITING_IN_TRAFFIC' && this.atAisle(r);
        if (w && !r.aisleWait) this.aisleWaits.n++;
        if (w) this.aisleWaits.t += dt;
        r.aisleWait = w;
      }
      // a locked aisle is free again once its robot has done its stops there and left
      for (const aisle of this.aisles) {
        if (aisle.lock < 0) continue;
        const r = this.fleet[aisle.lock], t = r.task;
        if (t && t.type === 'TRIP' && t.stops.some((s) => s.a === aisle.a && s.ops.some((o) => !o.done))) continue;
        if (![...r.claims].some((i) => g.aisleAt(i) === aisle.a)) aisle.lock = -1;
      }
    }
    // waiting in an aisle or to enter one
    atAisle(r) {
      const g = this.grid;
      if (g.aisleAt(g.idx(r.x, r.y)) >= 0) return true;
      const n = r.path && r.path[r.pi + 1];
      return !!n && g.aisleAt(g.idx(n.x, n.y)) >= 0;
    }
  }

  WS.AcrSim = AcrSim;
  WS.AcrTasks = T;
})((globalThis.WS = globalThis.WS || {}));
