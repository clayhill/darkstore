/* RailRunner: a shuttle AS/RS. Totes sit single deep in racking on both sides
 * of each aisle. A captive shuttle on every level fetches a tote and drops it
 * in the level's outbound buffer at the front of the aisle; the aisle's lift
 * takes it down to the pre-zone conveyor, which carries it to a station.
 * Returning totes ride back to an aisle, the lift brings them up to the level's
 * inbound buffer, and the shuttle puts them away.
 * The racking, storage policy and conveyor are shared with the crane
 * (WS.RackSim, js/sim/rack.js); the machines are WS.Machine (js/sim/machine.js). */
(function (WS) {
  'use strict';
  const TERMS = { unit: 'tote', Unit: 'Tote', units: 'totes', Units: 'Totes', store: 'racking', Store: 'Racking', port: 'station', ports: 'stations', machine: 'Machine' };
  const STATE_LABELS = { MOVING_TO_TARGET: 'To position', HANDLING: 'Handling a tote', TRANSPORTING_TO_PORT: 'To front / I/O', STORING: 'Storing', WAITING_PORT: 'Blocked (buffer)' };
  const LEGEND = ['IDLE', 'MOVING_TO_TARGET', 'HANDLING', 'TRANSPORTING_TO_PORT', 'STORING', 'WAITING_PORT'];
  const ZU = WS.RACK_ZU;

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
  class ShuttleSim extends WS.RackSim {
    get kind() { return 'shuttle'; }
    get terms() { return TERMS; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    get taskTypes() { return {}; }
    defaults() { return WS.SHUTTLE_CONFIG; }
    rackShape() { return { Z0: 2.4, frontBays: 2 }; } // the two front bays of each side are level buffers
    describe() { const c = this.cfg; return `${c.aisles} aisles × ${c.levels} levels × ${c.bays} bays online · ${c.aisles * c.levels} shuttles · ${c.aisles} lifts · ${this.inv.bins.length} totes`; }
    get front() { return this.cfg.bays - 1; } // shuttle position in front of the two buffer bays
    newAisle() { const L = this.cfg.levels; return { outBuf: Array.from({ length: L }, () => []), inBuf: Array.from({ length: L }, () => []), shuttles: [], lift: null }; }
    createMachines() {
      let id = 0;
      for (const aisle of this.aisles) for (let l = 0; l < this.cfg.levels; l++) { const sh = new Shuttle(this, id++, aisle.a, l); aisle.shuttles.push(sh); this.fleet.push(sh); }
      for (const aisle of this.aisles) { aisle.lift = new Lift(this, id++, aisle.a); this.fleet.push(aisle.lift); }
    }

    // ---------- motion ----------
    shuttleTravel(to) { const c = this.cfg; return { op: 'travel', prop: 'pos', to, v: c.shuttleV / c.cellSize, a: c.shuttleA / c.cellSize, settle: c.bayPositioning }; }
    liftTravel(to) { const c = this.cfg; return { op: 'travel', prop: 'z', to, v: c.liftV / ZU, a: c.liftA / ZU, settle: 0.2 }; }

    // ---------- storage policy: near the aisle front, on quiet levels ----------
    slotRank(l, s, b) { const SB = this.grid.SB; return (SB - 1 - b) / (SB - 1); }
    levelLoad(aisle, l) { const sh = aisle.shuttles[l]; return sh.jobs.length + aisle.inBuf[l].length + (sh.idle ? 0 : 1); }
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
  }

  WS.ShuttleSim = ShuttleSim;
})((globalThis.WS = globalThis.WS || {}));
