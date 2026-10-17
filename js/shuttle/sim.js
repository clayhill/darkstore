/* RailRunner: a shuttle AS/RS. Totes sit single deep in racking on both sides
 * of each aisle. A captive shuttle on every level fetches a tote and drops it
 * in the level's outbound buffer at the front of the aisle; the aisle's lift
 * takes it down to the pre-zone conveyor, which carries it to a station.
 * Returning totes ride back to an aisle, the lift brings them up to the level's
 * inbound buffer, and the shuttle puts them away.
 * Reuses the shared order flow, stations, inventory and KPIs; the machines are
 * WS.Machine (js/sim/machine.js). */
(function (WS) {
  'use strict';
  const TERMS = { unit: 'tote', Unit: 'Tote', units: 'totes', Units: 'Totes', store: 'racking', Store: 'Racking', port: 'station', ports: 'stations', machine: 'Machine' };
  const STATE_LABELS = { MOVING_TO_TARGET: 'To position', HANDLING: 'Handling a tote', TRANSPORTING_TO_PORT: 'To front / I/O', STORING: 'Storing', WAITING_PORT: 'Blocked (buffer)' };
  const LEGEND = ['IDLE', 'MOVING_TO_TARGET', 'HANDLING', 'TRANSPORTING_TO_PORT', 'STORING', 'WAITING_PORT'];
  const ZU = 0.33; // metres per render level

  // World geometry for the isometric view and the shared station layout.
  // Aisle a: rack x ∈ [3a, 3a+1], shuttle lane [3a+1, 3a+2], rack [3a+2, 3a+3];
  // bays run along y, the aisle fronts are at y = B, stations further out.
  class Racking {
    constructor(cfg) {
      const A = cfg.aisles, B = cfg.bays, L = cfg.levels;
      Object.assign(this, { A, B, L });
      this.LH = cfg.levelHeight / ZU; this.Z0 = 2.4; // level spacing and bottom level (render levels)
      this.Z = this.Z0 + L * this.LH; // rack top
      this.ioZ = 1.8; // where the lift meets the conveyor
      this.outY = B + 2.2; this.retY = B + 1.3; // pre-zone lines: to the stations, back to the aisles
      const nPorts = cfg.pickPorts + cfg.goodsInPorts;
      // stations in a row in front of the racking
      this.W = Math.max(A * 3, 1 + nPorts * 6); this.D = B + 3;
      this.ports = [];
      for (let k = 0; k < nPorts; k++) {
        const sx = 1 + k * 6;
        this.ports.push({ kind: k < cfg.pickPorts ? 'PICK' : 'GOODS_IN', face: 'front', drop: { x: sx, y: this.D - 1 }, lift: { x: sx + 1, y: this.D - 1 }, cells: [{ x: k * 3, y: L + 1 }, { x: k * 3 + 1, y: L + 1 }] });
      }
      this.chargers = [];
      this.waitHeat = new Float32Array(0); this.passHeat = this.waitHeat;
      this.version = 0;
    }
    idx(x, y) { return y * this.W + x; }
    cx(i) { return i % this.W; }
    cy(i) { return (i / this.W) | 0; }
    inside(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.D; }
    depthOf() { return 1; }
    decayHeat() {}
    levelZ(l) { return this.Z0 + l * this.LH; }
    laneX(a) { return a * 3 + 1.5; }
  }

  // Control-room map: one column per rack side, shuttle lane and lift of each
  // aisle, one row per level (top level first), then the conveyor row and the stations.
  class RackMap {
    constructor(sim) {
      const c = sim.cfg, nPorts = c.pickPorts + c.goodsInPorts;
      this.sim = sim; this.A = c.aisles; this.L = c.levels;
      this.W = Math.max(c.aisles * 4, nPorts * 3); this.D = c.levels + 2;
      const n = this.W * this.D;
      this.type = new Uint8Array(n); this.waitHeat = new Float32Array(n);
      this.claim = new Int16Array(n).fill(-1); this.colLock = new Int16Array(n).fill(-1);
      this.ports = sim.grid.ports; this.chargers = [];
    }
    idx(x, y) { return y * this.W + x; }
    cx(i) { return i % this.W; }
    cy(i) { return (i / this.W) | 0; }
    inside(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.D; }
    passable() { return false; }
    // map cell → { aisle, level, part } with part 0/2 = rack side, 1 = lane, 3 = lift
    at(i) {
      const x = this.cx(i), y = this.cy(i), a = Math.floor(x / 4);
      return a < this.A && y < this.L ? { a, level: this.L - 1 - y, part: x % 4 } : null;
    }
    mapFill(i, mix) {
      const y = this.cy(i);
      if (y === this.L) return '#1c2433';
      const c = this.at(i);
      if (!c) return '#070b12';
      if (c.part === 1) return '#0c1220';
      if (c.part === 3) return '#1a1508';
      return mix('#131c2c', '#2a5d9e', this.sim.sideFill(c.a, c.level, c.part / 2));
    }
    get mapTitle() { return 'LEVELS × AISLES · fill = totes per rack side'; }
  }

  class Shuttle extends WS.Machine {
    constructor(sim, id, a, l) {
      super(sim, id, `S${a + 1}.${String(l + 1).padStart(2, '0')}`);
      this.a = a; this.l = l; this.pos = sim.front; this.jobs = []; this.axis = 'y';
    }
    place() { this.rx = this.a * 4 + 1; this.ry = this.sim.cfg.levels - 1 - this.l; this.x = this.a; this.y = this.l; }
  }
  class Lift extends WS.Machine {
    constructor(sim, id, a) {
      super(sim, id, `L${a + 1}`);
      this.a = a; this.z = sim.grid.ioZ; this.axis = 'z';
    }
    place() {
      const g = this.sim.grid, L = this.sim.cfg.levels;
      this.rx = this.a * 4 + 3;
      this.ry = this.z <= g.Z0 - 0.3 ? L : Math.max(-0.2, L - 1 - (this.z - g.Z0) / g.LH);
      this.x = this.a; this.y = Math.max(0, Math.round((this.z - g.Z0) / g.LH));
    }
  }

  // ---------------------------------------------------------------- machine jobs
  function* shuttleStore(sim, sh, item) {
    const cfg = sim.cfg, aisle = sim.aisles[sh.a], bin = item.bin;
    sh.state = 'MOVING_TO_TARGET';
    yield sim.shuttleTravel(sim.front);
    sh.state = 'HANDLING';
    yield { op: 'wait', t: cfg.handlerTime };
    aisle.inBuf[sh.l].splice(aisle.inBuf[sh.l].indexOf(item), 1);
    bin.loc = 'shuttle'; bin.robot = sh.id; sh.bin = bin.id;
    sh.state = 'STORING';
    yield sim.shuttleTravel(item.b + 0.5);
    sh.state = 'HANDLING';
    yield { op: 'wait', t: cfg.handlerTime };
    aisle.resv[sim.si(item.l, item.s, item.b)] = false;
    sim.place(bin, sh.a, item.l, item.s, item.b);
    sh.bin = null; sim.onCycle(); sim.kpi.stores++;
  }
  function* shuttleRetrieve(sim, sh, task) {
    const cfg = sim.cfg, aisle = sim.aisles[sh.a], bin = task.bin;
    sh.state = 'MOVING_TO_TARGET';
    yield sim.shuttleTravel(bin.bay + 0.5);
    sh.state = 'HANDLING';
    yield { op: 'wait', t: cfg.handlerTime };
    sim.take(bin);
    bin.loc = 'shuttle'; bin.robot = sh.id; sh.bin = bin.id; bin.task = null;
    sim.removeTask(task);
    sh.state = 'TRANSPORTING_TO_PORT';
    yield sim.shuttleTravel(sim.front);
    yield { op: 'until', fn: () => aisle.outBuf[sh.l].length < cfg.bufferSize, waitState: 'WAITING_PORT' };
    sh.state = 'HANDLING';
    yield { op: 'wait', t: cfg.handlerTime };
    aisle.outBuf[sh.l].push({ bin, port: task.port, t: sim.time });
    bin.loc = 'buffer'; sh.bin = null; sh.lifts++; sim.onCycle();
  }
  function* liftOut(sim, lift, l) {
    const cfg = sim.cfg, g = sim.grid, aisle = sim.aisles[lift.a];
    lift.state = 'MOVING_TO_TARGET';
    yield sim.liftTravel(g.levelZ(l));
    lift.state = 'HANDLING';
    yield { op: 'wait', t: cfg.liftTransfer };
    const item = aisle.outBuf[l].shift(), bin = item.bin;
    bin.loc = 'lift'; lift.bin = bin.id;
    lift.state = 'TRANSPORTING_TO_PORT';
    yield sim.liftTravel(g.ioZ);
    lift.state = 'HANDLING';
    yield { op: 'wait', t: cfg.liftTransfer };
    lift.bin = null; lift.lifts++;
    sim.toPort(bin, sim.outPath(lift.a, sim.ports[item.port]), sim.ports[item.port]);
  }
  function* liftIn(sim, lift, item) {
    const cfg = sim.cfg, g = sim.grid, aisle = sim.aisles[lift.a], bin = item.bin;
    lift.state = 'MOVING_TO_TARGET';
    yield sim.liftTravel(g.ioZ);
    lift.state = 'HANDLING';
    yield { op: 'wait', t: cfg.liftTransfer };
    aisle.inQ.splice(aisle.inQ.indexOf(item), 1);
    bin.loc = 'lift'; lift.bin = bin.id;
    lift.state = 'STORING';
    yield sim.liftTravel(g.levelZ(item.l));
    // only this lift fills the inbound buffer, and it was chosen with room in it
    yield { op: 'until', fn: () => aisle.inBuf[item.l].length < cfg.bufferSize, waitState: 'WAITING_PORT' };
    lift.state = 'HANDLING';
    yield { op: 'wait', t: cfg.liftTransfer };
    aisle.inBuf[item.l].push(item);
    bin.loc = 'buffer'; lift.bin = null;
    // dual cycle: take an outbound tote from the same level on the way down
    if (aisle.outBuf[item.l].length) yield* liftOut(sim, lift, item.l);
  }

  // ---------------------------------------------------------------- simulation
  class ShuttleSim extends WS.Sim {
    get kind() { return 'shuttle'; }
    get terms() { return TERMS; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    get taskTypes() { return {}; }
    defaults() { return WS.SHUTTLE_CONFIG; }
    createGrid() { return new Racking(this.cfg); }
    describe() { const c = this.cfg; return `${c.aisles} aisles × ${c.levels} levels × ${c.bays} bays online · ${c.aisles * c.levels} shuttles · ${c.aisles} lifts · ${this.inv.bins.length} totes`; }
    storageCapacity() { const c = this.cfg; return c.aisles * c.levels * 2 * (c.bays - 2); }
    unitDepth() { return 1; }
    unitCell(bin) { return this.mapGrid.idx(bin.x, bin.y); }
    get front() { return this.cfg.bays - 1; } // shuttle position in front of the two buffer bays
    si(l, s, b) { return (l * 2 + s) * this.cfg.bays + b; }
    sideFill(a, l, s) { return this.aisles[a].count[l * 2 + s] / (this.cfg.bays - 2); }

    seed() {
      const cfg = this.cfg, inv = this.inv, rng = this.rng, A = cfg.aisles, L = cfg.levels, B = cfg.bays;
      this.mapGrid = new RackMap(this);
      this.conv = []; this.cycleLog = [];
      inv.seedCatalog(cfg.products, rng);
      this.aisles = [];
      for (let a = 0; a < A; a++) {
        this.aisles.push({
          a, slot: new Array(L * 2 * B).fill(null), resv: new Array(L * 2 * B).fill(false), count: new Int16Array(L * 2),
          outBuf: Array.from({ length: L }, () => []), inBuf: Array.from({ length: L }, () => []), inQ: [], shuttles: [], lift: null,
        });
      }
      const all = [];
      for (let a = 0; a < A; a++) for (let l = 0; l < L; l++) for (let s = 0; s < 2; s++) for (let b = 0; b < B - 2; b++) {
        if (rng() >= cfg.rackFill) continue;
        const bin = this.newBin({ prefix: 'ST' });
        this.place(bin, a, l, s, b);
        all.push(bin);
      }
      this.stockBins(all);
      this.seedDemand();
      let id = 0;
      for (const aisle of this.aisles) for (let l = 0; l < L; l++) { const sh = new Shuttle(this, id++, aisle.a, l); aisle.shuttles.push(sh); this.fleet.push(sh); }
      for (const aisle of this.aisles) { aisle.lift = new Lift(this, id++, aisle.a); this.fleet.push(aisle.lift); }
      for (const r of this.fleet) r.place();
    }

    // ---------- racking bookkeeping ----------
    place(bin, a, l, s, b) {
      const aisle = this.aisles[a];
      aisle.slot[this.si(l, s, b)] = bin.id; aisle.count[l * 2 + s]++;
      Object.assign(bin, { loc: 'grid', aisle: a, level: l, side: s, bay: b, robot: -1, port: -1 });
      bin.x = a * 4 + s * 2; bin.y = this.cfg.levels - 1 - l; // map cell
      this.grid.version++;
    }
    take(bin) {
      const aisle = this.aisles[bin.aisle];
      aisle.slot[this.si(bin.level, bin.side, bin.bay)] = null; aisle.count[bin.level * 2 + bin.side]--;
      this.grid.version++;
    }
    removeTask(t) { const k = this.tasks.indexOf(t); if (k >= 0) this.tasks.splice(k, 1); }
    onCycle() { this.cycleLog.push(this.time); }
    cycleRate() {
      const a = this.cycleLog, now = this.time;
      while (a.length && a[0] < now - 3600) a.shift();
      return (a.length * 3600) / Math.min(3600, Math.max(now, 120));
    }

    // ---------- motion ----------
    shuttleTravel(to) { const c = this.cfg; return { op: 'travel', prop: 'pos', to, v: c.shuttleV / c.cellSize, a: c.shuttleA / c.cellSize, settle: c.bayPositioning }; }
    liftTravel(to) { const c = this.cfg; return { op: 'travel', prop: 'z', to, v: c.liftV / ZU, a: c.liftA / ZU, settle: 0.2 }; }

    // ---------- pre-zone conveyor ----------
    outPath(a, port) {
      const g = this.grid, x = g.laneX(a), sx = port.drop.x;
      return [{ x, y: g.B + 0.5 }, { x, y: g.outY }, { x: sx + 0.5, y: g.outY }, { x: sx + 0.5, y: g.D }];
    }
    returnPath(port, a) {
      const g = this.grid, x = g.laneX(a), sx = port.drop.x;
      return [{ x: sx + 1.5, y: g.D }, { x: sx + 1.5, y: g.retY }, { x, y: g.retY }, { x, y: g.B + 0.5 }];
    }
    stationPath(from, to) {
      const g = this.grid;
      return [{ x: from.drop.x + 1.5, y: g.D }, { x: from.drop.x + 1.5, y: g.outY }, { x: to.drop.x + 0.5, y: g.outY }, { x: to.drop.x + 0.5, y: g.D }];
    }
    convey(bin, path, arrive, back) {
      let len = 0;
      for (let k = 1; k < path.length; k++) len += Math.abs(path[k].x - path[k - 1].x) + Math.abs(path[k].y - path[k - 1].y);
      bin.loc = 'conveyor';
      this.conv.push({ bin, path, len, s: 0, arrive, back });
    }
    toPort(bin, path, port) { this.convey(bin, path, () => { if (!port.canAccept()) return false; port.receive(bin); return true; }, false); }
    posOnPath(it) { return WS.OMS.prototype.posOnPath.call(null, it); }

    // A tote leaves a station: on to the next station that wants it, or back
    // into the racking at the position the storage policy picks.
    onPortOut(port, bin) {
      port.takeOut();
      if (bin.requests.length) {
        const next = this.ports[bin.requests[0].port];
        next.inbound++;
        this.toPort(bin, this.stationPath(port, next), next);
        return;
      }
      const t = this.chooseSlot(bin);
      this.aisles[t.a].resv[this.si(t.l, t.s, t.b)] = true;
      this.convey(bin, this.returnPath(port, t.a), () => {
        const aisle = this.aisles[t.a];
        aisle.inQ.push({ bin, l: t.l, s: t.s, b: t.b, t: this.time });
        bin.loc = 'queue';
        return true;
      }, true);
    }
    // Storage position for a returning tote: fast movers near the aisle front,
    // spread over aisles and levels that have the least work queued.
    chooseSlot(bin) {
      const c = this.cfg, pol = c.putawayPolicy, B = c.bays;
      const target = { A: 0, B: 0.35, C: 0.75, E: 0.6 }[this.inv.binClass(bin)];
      let best = null, bestS = Infinity;
      for (const aisle of this.aisles) {
        const aisleLoad = aisle.inQ.length + this.conv.filter((it) => it.back).length / c.aisles;
        for (let l = 0; l < c.levels; l++) {
          const sh = aisle.shuttles[l], levelLoad = sh.jobs.length + aisle.inBuf[l].length + (sh.idle ? 0 : 1);
          for (let s = 0; s < 2; s++) for (let b = 0; b < B - 2; b++) {
            const i = this.si(l, s, b);
            if (aisle.slot[i] || aisle.resv[i]) continue;
            const nd = (B - 3 - b) / (B - 3); // 0 = front of the aisle
            let sc;
            if (pol === 'random') sc = this.rng();
            else if (pol === 'nearest') sc = nd * 4 + aisleLoad * 2 + levelLoad * 1.5;
            else sc = Math.abs(nd - target) * 20 + aisleLoad * 2 + levelLoad * 1.5;
            if (sc < bestS) { bestS = sc; best = { a: aisle.a, l, s, b }; }
          }
        }
      }
      return best;
    }
    // Cost of fetching a tote for an order line: work already queued on its
    // shuttle and lift, and how far it is from the aisle front.
    fetchCost(bin) {
      if (bin.loc !== 'grid') return 10;
      const aisle = this.aisles[bin.aisle];
      return aisle.shuttles[bin.level].jobs.length * 1.5 + aisle.inQ.length * 0.5 + (this.cfg.bays - 1 - bin.bay) * 0.08;
    }

    // ---------- dispatch ----------
    dispatch() {
      const cfg = this.cfg;
      this.createRetrievals();
      for (const t of this.pendingTasks()) {
        const bin = t.bin;
        if (bin.loc !== 'grid') continue;
        t.port = bin.requests[0].port;
        const port = this.ports[t.port];
        if (this.portFull(port)) continue;
        const sh = this.aisles[bin.aisle].shuttles[bin.level];
        sh.jobs.push(t); t.robot = sh.id; port.inbound++;
      }
      for (const aisle of this.aisles) {
        // shuttles: put away first (frees the inbound buffer), then the nearest retrieval
        for (const sh of aisle.shuttles) {
          if (!sh.idle) continue;
          const inb = aisle.inBuf[sh.l];
          if (inb.length) { sh.run(shuttleStore(this, sh, inb[0]), { type: 'STORE', bin: inb[0].bin }); continue; }
          if (!sh.jobs.length) continue;
          let k = 0;
          sh.jobs.forEach((t, j) => { if (Math.abs(t.bin.bay + 0.5 - sh.pos) < Math.abs(sh.jobs[k].bin.bay + 0.5 - sh.pos)) k = j; });
          const t = sh.jobs.splice(k, 1)[0];
          sh.run(shuttleRetrieve(this, sh, t), t);
        }
        // lift: the tote that has waited longest, outbound or inbound
        const lift = aisle.lift;
        if (!lift.idle) continue;
        let best = null;
        for (let l = 0; l < cfg.levels; l++) {
          const o = aisle.outBuf[l][0];
          if (o && (!best || o.t < best.t)) best = { t: o.t, out: l };
        }
        const inn = aisle.inQ.find((it) => aisle.inBuf[it.l].length < cfg.bufferSize);
        if (inn && (!best || inn.t < best.t)) best = { t: inn.t, in: inn };
        if (!best) continue;
        if (best.in) lift.run(liftIn(this, lift, best.in), { type: 'IN', bin: best.in.bin });
        else lift.run(liftOut(this, lift, best.out), { type: 'OUT', bin: aisle.outBuf[best.out][0].bin });
      }
    }

    tick() {
      super.tick();
      const v = this.cfg.preZoneSpeed / this.cfg.cellSize, dt = this.cfg.tick;
      for (let k = this.conv.length - 1; k >= 0; k--) {
        const it = this.conv[k];
        it.s = Math.min(it.len, it.s + v * dt);
        if (it.s >= it.len && it.arrive()) this.conv.splice(k, 1);
      }
    }
  }

  WS.ShuttleSim = ShuttleSim;
})((globalThis.WS = globalThis.WS || {}));
