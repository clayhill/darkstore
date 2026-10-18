/* SkyStack: a stacker crane AS/RS. Totes sit single deep in high racking on
 * both sides of each aisle. In each aisle runs one crane: a mast on a floor
 * rail with a carriage that moves up and down it at the same time, so a trip
 * takes the longer of the two motions. At the front of the aisle is the I/O
 * point, where returning totes wait on the infeed and retrieved totes leave on
 * the outfeed conveyor to the stations.
 * Work is done in crane cycles that start and end at the I/O point: a single
 * command stores or retrieves; a dual command stores, then retrieves on the
 * way back. A twin load handler can carry two totes, so one cycle does up to
 * two stores and two retrievals.
 * The racking, storage policy and conveyor are shared with RailRunner
 * (WS.PreZoneSim, js/sim/prezone.js); the crane is a WS.Machine (js/sim/machine.js). */
(function (WS) {
  'use strict';
  const TERMS = { unit: 'tote', Unit: 'Tote', units: 'totes', Units: 'Totes', store: 'racking', Store: 'Racking', port: 'station', ports: 'stations', machine: 'Crane' };
  const STATE_LABELS = { MOVING_TO_TARGET: 'To a location', HANDLING: 'Forks out', TRANSPORTING_TO_PORT: 'To the I/O point', STORING: 'To store' };
  const LEGEND = ['IDLE', 'MOVING_TO_TARGET', 'STORING', 'HANDLING', 'TRANSPORTING_TO_PORT'];
  const ZU = WS.RACK_ZU;

  class Crane extends WS.Machine {
    constructor(sim, id, a) {
      super(sim, id, `C${a + 1}`);
      this.a = a; this.pos = sim.ioPos; this.z = sim.grid.ioZ; this.axis = 'xz';
      this.jobs = []; // retrievals waiting for this crane
      this.load = []; // tote ids on the load handler
    }
    place() {
      const g = this.sim.grid, L = this.sim.cfg.levels;
      this.rx = this.a * 4 + 1;
      this.ry = Math.max(-0.2, Math.min(L, L - 1 - (this.z - g.Z0) / g.LH));
      this.x = this.a; this.y = Math.max(0, Math.round((this.z - g.Z0) / g.LH));
    }
    hold(id) { this.load.push(id); this.bin = this.load[0]; }
    drop(id) { this.load.splice(this.load.indexOf(id), 1); this.bin = this.load[0] || null; }
  }

  // ---------------------------------------------------------------- crane cycle
  // stores: infeed items { bin, l, s, b }; rets: retrieval tasks. Both already
  // in the order the crane visits them.
  function* craneCycle(sim, cr, stores, rets) {
    const cfg = sim.cfg, g = sim.grid, aisle = sim.aisles[cr.a], t0 = sim.time;
    for (const it of stores) {
      cr.state = 'HANDLING';
      yield { op: 'wait', t: cfg.forkTime };
      aisle.inQ.splice(aisle.inQ.indexOf(it), 1);
      it.bin.loc = 'crane'; it.bin.robot = cr.id; cr.hold(it.bin.id);
    }
    for (const it of stores) {
      cr.state = 'STORING';
      yield sim.craneTravel(it.b + 0.5, g.levelZ(it.l));
      cr.state = 'HANDLING';
      yield { op: 'wait', t: cfg.forkTime };
      aisle.resv[sim.si(it.l, it.s, it.b)] = false;
      cr.drop(it.bin.id);
      sim.place(it.bin, cr.a, it.l, it.s, it.b);
      sim.kpi.stores++;
    }
    for (const t of rets) {
      const bin = t.bin;
      cr.state = 'MOVING_TO_TARGET';
      yield sim.craneTravel(bin.bay + 0.5, g.levelZ(bin.level));
      cr.state = 'HANDLING';
      yield { op: 'wait', t: cfg.forkTime };
      sim.take(bin);
      bin.loc = 'crane'; bin.robot = cr.id; bin.task = null; cr.hold(bin.id);
      sim.removeTask(t);
    }
    cr.state = rets.length ? 'TRANSPORTING_TO_PORT' : 'MOVING_TO_TARGET';
    yield sim.craneTravel(sim.ioPos, g.ioZ);
    for (const t of rets) {
      cr.state = 'HANDLING';
      yield { op: 'wait', t: cfg.forkTime };
      cr.drop(t.bin.id); cr.lifts++;
      const port = sim.ports[t.port];
      sim.toPort(t.bin, sim.outPath(cr.a, port), port);
    }
    sim.onCycle(stores.length && rets.length ? 'dual' : 'single', sim.time - t0);
  }

  // ---------------------------------------------------------------- simulation
  class CraneSim extends WS.PreZoneSim {
    get kind() { return 'crane'; }
    get terms() { return TERMS; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    get taskTypes() { return {}; }
    defaults() { return WS.CRANE_CONFIG; }
    rackShape() { return { Z0: 0.4, frontBays: 0 }; }
    describe() { const c = this.cfg; return `${c.aisles} aisles × ${c.levels} levels × ${c.bays} bays online · ${c.aisles} cranes · ${this.inv.bins.length} totes`; }
    get ioPos() { return this.cfg.bays + 0.5; } // the crane's position at the I/O point
    newAisle(a) { return Object.assign(super.newAisle(a), { crane: null }); }
    createMachines() {
      this.cycles = { single: 0, dual: 0, singleT: 0, dualT: 0 };
      for (const aisle of this.aisles) { aisle.crane = new Crane(this, aisle.a, aisle.a); this.fleet.push(aisle.crane); }
    }

    // ---------- motion ----------
    craneTravel(pos, z) {
      const c = this.cfg;
      return { op: 'travel', settle: c.settleTime, axes: [{ prop: 'pos', to: pos, v: c.craneVx / c.cellSize, a: c.craneAx / c.cellSize }, { prop: 'z', to: z, v: c.craneVz / ZU, a: c.craneAz / ZU }] };
    }
    // Crane travel time between two points (bay position, render height):
    // mast and carriage move at once, so the slower of the two counts.
    craneTime(p0, z0, p1, z1) {
      const c = this.cfg;
      return Math.max(WS.travelTime(Math.abs(p1 - p0) * c.cellSize, c.craneVx, c.craneAx), WS.travelTime(Math.abs(z1 - z0) * ZU, c.craneVz, c.craneAz));
    }
    timeFromIO(l, b) { const g = this.grid; return this.craneTime(this.ioPos, g.ioZ, b + 0.5, g.levelZ(l)); }
    // FEM 9.851 reference cycles for this rack: points P1 (1/5 length, 2/3
    // height) and P2 (2/3 length, 1/5 height), from the I/O point.
    femCycles() {
      const c = this.cfg, g = this.grid, len = c.bays, io = { p: this.ioPos, z: g.ioZ };
      const p1 = { p: io.p - len / 5, z: g.Z0 + (g.Z - g.Z0) * 2 / 3 }, p2 = { p: io.p - len * 2 / 3, z: g.Z0 + (g.Z - g.Z0) / 5 };
      const t = (a, b) => this.craneTime(a.p, a.z, b.p, b.z) + c.settleTime;
      return { single: t(io, p1) + t(io, p2) + 2 * c.forkTime, dual: t(io, p1) + t(p1, p2) + t(p2, io) + 4 * c.forkTime };
    }
    onCycle(type, dt) {
      super.onCycle();
      this.cycles[type]++; this.cycles[type + 'T'] += dt;
    }

    // ---------- storage policy: by crane time from the I/O point ----------
    // The fastest positions form a rectangle near the I/O point, low and close.
    slotRank(l, s, b) {
      if (!this.rankT) {
        const c = this.cfg, T = [];
        for (let k = 0; k < c.levels; k++) for (let j = 0; j < c.bays; j++) T.push(this.timeFromIO(k, j));
        const max = Math.max(...T);
        this.rankT = T.map((t) => t / max);
      }
      return this.rankT[l * this.cfg.bays + b];
    }
    aisleLoad(aisle) { return super.aisleLoad(aisle) + aisle.crane.jobs.length * 0.5; }
    // Cost of fetching a tote for an order line: work already queued on its
    // crane and how long the crane needs to reach it.
    fetchCost(bin) {
      if (bin.loc !== 'grid') return 10;
      const aisle = this.aisles[bin.aisle];
      return aisle.crane.jobs.length * 1.5 + aisle.inQ.length * 0.5 + this.slotRank(bin.level, bin.side, bin.bay) * 2;
    }

    // ---------- dispatch ----------
    dispatch() {
      this.createRetrievals();
      for (const t of this.pendingTasks()) {
        const bin = t.bin;
        if (bin.loc !== 'grid') continue;
        t.port = bin.requests[0].port;
        const port = this.ports[t.port];
        if (this.portFull(port)) continue;
        const cr = this.aisles[bin.aisle].crane;
        cr.jobs.push(t); t.robot = cr.id; port.inbound++;
      }
      for (const aisle of this.aisles) {
        const cr = aisle.crane;
        if (!cr.idle) continue;
        const plan = this.planCycle(aisle);
        if (plan) cr.run(craneCycle(this, cr, plan.stores, plan.rets), { type: 'CYCLE', stores: plan.stores, rets: plan.rets });
      }
    }
    // One crane cycle: the totes waiting longest on the infeed, stored in the
    // order that keeps the crane moving least, then the retrievals closest (in
    // crane time) to where the last store left the crane. A retrieval that has
    // waited gets a head start, so far totes are not passed over for ever.
    planCycle(aisle) {
      const cr = aisle.crane, n = this.cfg.handlerSlots, g = this.grid;
      const stores = [];
      let p = this.ioPos, z = g.ioZ;
      const inq = aisle.inQ.slice(0, n);
      while (inq.length) {
        let k = 0, bt = Infinity;
        inq.forEach((it, j) => { const t = this.craneTime(p, z, it.b + 0.5, g.levelZ(it.l)); if (t < bt) { bt = t; k = j; } });
        const it = inq.splice(k, 1)[0];
        stores.push(it); p = it.b + 0.5; z = g.levelZ(it.l);
      }
      const rets = [];
      while (rets.length < n && cr.jobs.length) {
        let k = 0, bt = Infinity;
        cr.jobs.forEach((t, j) => {
          const c = this.craneTime(p, z, t.bin.bay + 0.5, g.levelZ(t.bin.level)) - (this.time - t.created) * 0.05;
          if (c < bt) { bt = c; k = j; }
        });
        const t = cr.jobs.splice(k, 1)[0];
        rets.push(t); p = t.bin.bay + 0.5; z = g.levelZ(t.bin.level);
      }
      return stores.length || rets.length ? { stores, rets } : null;
    }
  }

  WS.CraneSim = CraneSim;
})((globalThis.WS = globalThis.WS || {}));
