/* RailRunner: a shuttle AS/RS. Totes sit single deep in racking on both sides
 * of each aisle. A captive shuttle on every level fetches a tote and drops it
 * in the level's outbound buffer at the front of the aisle; the aisle's lift
 * takes it down to the pre-zone conveyor, which carries it to a station.
 * Returning totes ride back to an aisle, the lift brings them up to the level's
 * inbound buffer, and the shuttle puts them away.
 * The buffers are short conveyors in the front bays: the outbound one on the
 * left rolls totes from the shuttle to the lift, the inbound one on the right
 * from the lift to the shuttle. The lift's carriage spans the aisle front with
 * a platform on each side, in line with the buffers and with the aisle's
 * outfeed (left) and infeed (right) conveyors.
 * The racking, storage policy and conveyor are shared with the crane
 * (WS.PreZoneSim, js/sim/prezone.js); the machines are WS.Machine (js/sim/machine.js). */
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
      this.xfer = null; // tote being taken or put: { id, take, side } (0 left, 1 right); for the view
    }
    place() { this.rx = this.sim.mapGrid.colX(this.a, 1); this.ry = this.sim.cfg.levels - 1 - this.l; this.x = this.a; this.y = this.l; }
  }
  class Lift extends WS.Machine {
    constructor(sim, id, a) {
      super(sim, id, `L${a + 1}`);
      this.a = a; this.z = sim.grid.convZ; this.axis = 'z';
      this.side = 0; // platform the tote is on: 0 left (outbound), 1 right (inbound)
      this.roll = null; // tote rolling between the carriage and a buffer: { y0, y1, t0, dur }; for the view
    }
    place() {
      const g = this.sim.grid, L = this.sim.cfg.levels;
      this.rx = this.sim.mapGrid.colX(this.a, 3);
      this.ry = this.z <= g.convZ + 0.01 ? L : Math.max(-0.2, L - 1 - (this.z - g.Z0) / g.LH);
      this.x = this.a; this.y = Math.max(0, Math.round((this.z - g.Z0) / g.LH));
    }
  }

  // ---------------------------------------------------------------- machine jobs
  function* shuttleStore(sim, sh, item) {
    const cfg = sim.cfg, aisle = sim.aisles[sh.a], bin = item.bin;
    sh.state = 'MOVING_TO_TARGET';
    yield sim.shuttleTravel(sim.front);
    yield { op: 'until', fn: () => Math.abs(item.pos - sim.front) < 1e-6 }; // rolled up to the shuttle
    sh.state = 'HANDLING'; sh.xfer = { id: bin.id, take: true, side: 1, io: true }; // the inbound buffer is on the right
    yield { op: 'wait', t: cfg.handlerTime };
    sh.xfer = null;
    aisle.inBuf[sh.l].splice(aisle.inBuf[sh.l].indexOf(item), 1);
    bin.loc = 'shuttle'; bin.robot = sh.id; sh.bin = bin.id;
    sh.state = 'STORING';
    yield sim.shuttleTravel(item.b + 0.5);
    sh.state = 'HANDLING'; sh.xfer = { id: bin.id, take: false, side: item.s };
    yield { op: 'wait', t: cfg.handlerTime };
    sh.xfer = null;
    aisle.resv[sim.si(item.l, item.s, item.b)] = false;
    sim.place(bin, sh.a, item.l, item.s, item.b);
    sh.bin = null; sim.onCycle(); sim.kpi.stores++;
  }
  function* shuttleRetrieve(sim, sh, task) {
    const cfg = sim.cfg, aisle = sim.aisles[sh.a], bin = task.bin, buf = aisle.outBuf[sh.l];
    sh.state = 'MOVING_TO_TARGET';
    yield sim.shuttleTravel(bin.bay + 0.5);
    sh.state = 'HANDLING'; sh.xfer = { id: bin.id, take: true, side: bin.side };
    yield { op: 'wait', t: cfg.handlerTime };
    sh.xfer = null;
    sim.take(bin);
    bin.loc = 'shuttle'; bin.robot = sh.id; sh.bin = bin.id; bin.task = null;
    sim.removeTask(task);
    sh.state = 'TRANSPORTING_TO_PORT';
    yield sim.shuttleTravel(sim.front);
    // room in the outbound buffer, and the tote put before has rolled on
    yield { op: 'until', fn: () => buf.length < cfg.bufferSize && buf.every((it) => it.pos >= sim.front + 1 - 1e-6), waitState: 'WAITING_PORT' };
    sh.state = 'HANDLING'; sh.xfer = { id: bin.id, take: false, side: 0, io: true }; // the outbound buffer is on the left
    yield { op: 'wait', t: cfg.handlerTime };
    sh.xfer = null;
    buf.push({ bin, port: task.port, t: sim.time, pos: sim.front });
    bin.loc = 'buffer'; sh.bin = null; sh.lifts++; sim.onCycle();
  }
  // A tote rolls between the carriage (y = B + 0.5) and the end of a buffer.
  function* liftRoll(sim, lift, y0, y1) {
    const dur = Math.abs(y1 - y0) / sim.convSpeed;
    lift.roll = { y0, y1, t0: sim.time, dur };
    yield { op: 'wait', t: dur };
    lift.roll = null;
  }
  function* liftOut(sim, lift, l) {
    const cfg = sim.cfg, g = sim.grid, aisle = sim.aisles[lift.a], buf = aisle.outBuf[l], B = g.B;
    lift.state = 'MOVING_TO_TARGET';
    yield sim.liftTravel(sim.liftLevel(l));
    lift.state = 'HANDLING';
    yield { op: 'until', fn: () => buf.length && Math.abs(buf[0].pos - sim.bufOuter) < 1e-6 };
    let t0 = sim.time;
    const item = buf.shift(), bin = item.bin;
    bin.loc = 'lift'; lift.bin = bin.id; lift.side = 0;
    yield* liftRoll(sim, lift, sim.bufOuter, B + 0.5);
    yield { op: 'wait', t: Math.max(0, cfg.liftTransfer - (sim.time - t0)) };
    lift.state = 'TRANSPORTING_TO_PORT';
    yield sim.liftTravel(g.convZ);
    // off the carriage onto the aisle's outfeed
    lift.state = 'HANDLING';
    const x = g.outX(lift.a), y = B + 0.5;
    yield { op: 'until', fn: () => sim.convFree(x, y), waitState: 'WAITING_PORT' };
    t0 = sim.time;
    const port = sim.ports[item.port], it = sim.sendOut(lift.a, bin, port, y);
    lift.bin = null; lift.lifts++;
    yield { op: 'until', fn: () => it.s >= 0.8 || !sim.conv.includes(it) };
    yield { op: 'wait', t: Math.max(0, cfg.liftTransfer - (sim.time - t0)) };
  }
  function* liftIn(sim, lift, item) {
    const cfg = sim.cfg, g = sim.grid, aisle = sim.aisles[lift.a], bin = item.bin, c = item.conv, buf = aisle.inBuf[item.l];
    lift.state = 'MOVING_TO_TARGET';
    yield sim.liftTravel(g.convZ);
    // the tote waiting at the lift rolls onto the carriage
    lift.state = 'HANDLING';
    let t0 = sim.time;
    aisle.gate = c;
    yield { op: 'until', fn: () => c.s >= c.len - 1e-6 };
    aisle.gate = null;
    sim.convRemove(c);
    aisle.inQ.splice(aisle.inQ.indexOf(item), 1);
    bin.loc = 'lift'; lift.bin = bin.id; lift.side = 1;
    yield { op: 'wait', t: Math.max(0, cfg.liftTransfer - (sim.time - t0)) };
    lift.state = 'STORING';
    yield sim.liftTravel(sim.liftLevel(item.l));
    // only this lift fills the inbound buffer, and it was chosen with room in
    // it; the tote put before must have rolled on
    yield { op: 'until', fn: () => buf.length < cfg.bufferSize && buf.every((it) => it.pos <= sim.bufOuter - 1 + 1e-6), waitState: 'WAITING_PORT' };
    lift.state = 'HANDLING';
    t0 = sim.time;
    yield* liftRoll(sim, lift, g.B + 0.5, sim.bufOuter);
    buf.push(Object.assign(item, { pos: sim.bufOuter, conv: null }));
    bin.loc = 'buffer'; lift.bin = null;
    yield { op: 'wait', t: Math.max(0, cfg.liftTransfer - (sim.time - t0)) };
    // dual cycle: take an outbound tote from the same level on the way down
    if (aisle.outBuf[item.l].length && sim.outRoom(aisle)) yield* liftOut(sim, lift, item.l);
  }

  // ---------------------------------------------------------------- simulation
  class ShuttleSim extends WS.PreZoneSim {
    get kind() { return 'shuttle'; }
    get terms() { return TERMS; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    defaults() { return WS.SHUTTLE_CONFIG; }
    rackShape() { return { Z0: 2.4, frontBays: Math.max(2, this.cfg.bufferSize) }; } // the front bays of each side are level buffers
    describe() { const c = this.cfg; return `${c.aisles} aisles × ${c.levels} levels × ${c.bays} bays online · ${c.aisles * c.levels} shuttles · ${c.aisles} lifts${this.bots ? ` · ${WS.botCount(c)} transport robots` : ''} · ${this.inv.bins.length} totes`; }
    // the buffers' ends: the shuttle's side (where the shuttle stops to hand
    // totes over) and the lift's side; totes in a buffer stand a bay apart
    get front() { return this.grid.B - this.grid.frontBays + 0.5; }
    get bufOuter() { return this.grid.B - 0.5; }
    get convSpeed() { return this.cfg.preZoneSpeed / this.cfg.cellSize; } // cells/s
    liftLevel(l) { return this.grid.levelZ(l) + 0.06; } // carriage height at a level's buffers
    // A tote waits at the lift (its front at the carriage's edge) until the
    // lift is down and takes it.
    infeedLimit(aisle, it) { return aisle.gate === it ? it.len : super.infeedLimit(aisle, it); }
    get infeedHold() { return 0.8; }
    ioConveyorY() { return this.grid.B + 0.92; } // the conveyors meet the lift's platforms
    tick() {
      super.tick();
      // totes in the level buffers roll towards their end
      const d = this.convSpeed * this.cfg.tick, step = (it, to) => { it.pos += Math.max(-d, Math.min(d, to - it.pos)); };
      for (const aisle of this.aisles) for (let l = 0; l < this.cfg.levels; l++) {
        aisle.outBuf[l].forEach((it, k) => step(it, this.bufOuter - k));
        aisle.inBuf[l].forEach((it, k) => step(it, this.front + k));
      }
    }
    newAisle(a) { const L = this.cfg.levels; return Object.assign(super.newAisle(a), { outBuf: Array.from({ length: L }, () => []), inBuf: Array.from({ length: L }, () => []), shuttles: [], lift: null }); }
    createMachines() {
      let id = 0;
      for (const aisle of this.aisles) for (let l = 0; l < this.cfg.levels; l++) { const sh = this.createShuttle(id++, aisle.a, l); aisle.shuttles.push(sh); this.fleet.push(sh); }
      for (const aisle of this.aisles) { aisle.lift = new Lift(this, id++, aisle.a); this.fleet.push(aisle.lift); }
    }

    // a level machine's jobs (DeepLane's carriers bring their own)
    storeJob(sh, item) { return shuttleStore(this, sh, item); }
    retrieveJob(sh, t) { return shuttleRetrieve(this, sh, t); }
    // the machines, for a type built on this one
    createShuttle(id, a, l) { return new Shuttle(this, id, a, l); }

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
          if (inb.length) { sh.run(this.storeJob(sh, inb[0]), { type: 'STORE', bin: inb[0].bin }); continue; }
          if (!sh.jobs.length) continue;
          let k = 0;
          sh.jobs.forEach((t, j) => { if (Math.abs(t.bin.bay + 0.5 - sh.pos) < Math.abs(sh.jobs[k].bin.bay + 0.5 - sh.pos)) k = j; });
          const t = sh.jobs.splice(k, 1)[0];
          sh.run(this.retrieveJob(sh, t), t);
        }
        // lift: the tote that has waited longest, outbound or inbound
        const lift = aisle.lift;
        if (!lift.idle) continue;
        let best = null;
        // nothing more onto a busy loop or a full stand (WS.PreZoneSim.outRoom)
        for (let l = 0; l < cfg.levels && this.outRoom(aisle); l++) {
          const o = aisle.outBuf[l][0];
          if (o && (!best || o.t < best.t)) best = { t: o.t, out: l };
        }
        // the infeed is a queue: only the tote at its head can go up
        const head = aisle.inQ[0], inn = head && aisle.inBuf[head.l].length < cfg.bufferSize ? head : null;
        // a full infeed goes first: totes for this aisle are going round meanwhile
        if (inn && (!best || inn.t < best.t || this.infeedRoom(aisle) <= 0)) best = { t: inn.t, in: inn };
        if (!best) continue;
        if (best.in) lift.run(liftIn(this, lift, best.in), { type: 'IN', bin: best.in.bin });
        else lift.run(liftOut(this, lift, best.out), { type: 'OUT', bin: aisle.outBuf[best.out][0].bin });
      }
      this.dispatchRobots();
    }
  }

  WS.ShuttleSim = ShuttleSim;
  WS.ShuttleMachines = { Shuttle, Lift };
})((globalThis.WS = globalThis.WS || {}));
