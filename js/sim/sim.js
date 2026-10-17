/* Simulation orchestrator shared by every storage type: fixed time-step loop
 * (100 ms ticks) with a small discrete-event queue, task bookkeeping, and the
 * layout of everything outside the storage (stations, packing, dock). */
(function (WS) {
  'use strict';
  WS.CELL = { STORAGE: 0, PORT: 1, CHARGER: 2 }; // cell types; each floor adds its own

  // Positions of everything outside the grid, in cell units (x right, y forward).
  class Layout {
    constructor(sim) {
      const g = sim.grid; this.g = g; this.W = g.W; this.D = g.D; this.sim = sim;
      this.takeawayY = g.D + 3.2;
    }
    packerPos(k) { return { x: this.W + 2.4 + k * 2.6, y: this.D + 5.2 }; }
    spurX(port) { return port.drop.x + 4.45; }
    slotPos(port, k) { return { x: port.drop.x + 2.3 + k * 0.52, y: this.D + 1.55 }; }
    pickPos(port) {
      return port.face === 'front' ? { x: port.drop.x + 1.0, y: this.D + 1.3 } : { x: this.W + 1.3, y: port.drop.y + 1.0 };
    }
    // conveyor positions inside a port: entry (from drop), pick, exit (to lift)
    portPath(port) {
      const D = this.D, W = this.W;
      if (port.face === 'front') {
        const x = port.drop.x;
        return { entry: [{ x: x + 0.5, y: D }, { x: x + 0.5, y: D + 1.3 }], pick: { x: x + 1, y: D + 1.3 }, exit: [{ x: x + 1.5, y: D + 1.3 }, { x: x + 1.5, y: D }] };
      }
      const y = port.drop.y;
      return { entry: [{ x: W, y: y + 0.5 }, { x: W + 1.3, y: y + 0.5 }], pick: { x: W + 1.3, y: y + 1 }, exit: [{ x: W + 1.3, y: y + 1.5 }, { x: W, y: y + 1.5 }] };
    }
    operatorPos(port) { return port.face === 'front' ? { x: port.drop.x + 1.0, y: this.D + 2.35 } : { x: this.W + 2.35, y: port.drop.y + 1.0 }; }
    toteRoute(port, slot, pk) {
      const s = this.slotPos(port, slot), p = this.packerPos(pk);
      const sx = this.spurX(port);
      return [s, { x: sx, y: s.y }, { x: sx, y: this.takeawayY }, { x: p.x, y: this.takeawayY }, { x: p.x, y: p.y - 0.75 }];
    }
    parcelRoute(pk) {
      const p = this.packerPos(pk), d = this.dock();
      return [{ x: p.x, y: p.y + 0.7 }, { x: p.x, y: this.D + 7.0 }, { x: d.x - 0.6, y: this.D + 7.0 }, { x: d.x - 0.6, y: d.y }, { x: d.x + 0.2, y: d.y }];
    }
    dock() { return { x: this.W + 2.4 + this.sim.cfg.packStations * 2.6 + 1.6, y: this.D + 3.0 }; }
  }

  class Sim {
    constructor(cfg) {
      this.cfg = Object.assign({}, this.defaults(), cfg || {});
      this.rng = WS.U.rng(this.cfg.seed);
      this.time = 0; this.ticks = 0;
      this.logs = []; this.logSeq = 0; this.events = [];
      this.tasks = []; this.taskSeq = 1;
      this.binsWithRequests = new Set();
      this.grid = this.createGrid();
      this.inv = new WS.Inventory(this);
      this.router = new WS.Router(this);
      this.ports = this.grid.ports.map((d, k) => new WS.Port(this, k, d));
      this.layout = this.createLayout();
      this.kpi = new WS.KPI(this);
      this.robots = [];
      this.seed();
      this.oms = new WS.OMS(this);
      this.dispatchTimer = 0; this.heatTimer = 0;
      this.log('system', this.describe());
    }

    // ---------------------------------------------------------------- storage type
    // Each storage type (CubeSim, PodSim, …) supplies kind, terms, taskTypes,
    // defaults(), createGrid(), seed(), dispatch(), describe(), storageCapacity()
    // and fetchCost(unit). The order flow, ports, inventory, router and KPIs
    // are shared.
    createLayout() { return new Layout(this); }
    compLabel(k) { return 'compartment ' + (k + 1); }
    // depth of a stored unit counted from the top (1 = directly reachable)
    unitDepth(bin) { return this.grid.depthOf(this.inv.binColumn(bin), bin.id); }
    // cell the inspector opens for a stored unit
    unitCell(bin) { return this.grid.idx(bin.x, bin.y); }
    onPortOut() {}

    // ---------------------------------------------------------------- seeding helpers
    // Products to stock, in order: every product once, then demand-weighted draws.
    productStream() {
      const prods = this.inv.products, rng = this.rng, w = prods.map((p) => Math.pow(p.demand, 0.3)), tot = w.reduce((a, b) => a + b, 0);
      let k = 0;
      return () => (k < prods.length ? prods[k++] : prods[rng.weighted(w, tot)]);
    }
    // Fill compartment c with a random 25–100 % of what fits.
    stockComp(bin, c, p) {
      const inv = this.inv, q = Math.max(1, Math.round(inv.compCap(bin, p) * (0.25 + this.rng() * 0.75)));
      inv.setComp(bin, c, p.gtin);
      bin.comps[c].qty = q; p.onHand += q;
    }
    // A storage bin or tote with 1, 2 or 4 compartments.
    newBin(o) { const r = this.rng(); return this.inv.createBin(r < 0.45 ? 1 : r < 0.8 ? 2 : 4, o); }
    // Stock a share of the bins: every product at least once, then
    // demand-weighted; one product per bin, sometimes a second one.
    stockBins(bins) {
      const cfg = this.cfg, rng = this.rng;
      const stocked = bins.filter(() => rng() < cfg.stockedRatio), next = this.productStream();
      for (const bin of stocked) {
        const nfill = bin.ncomp === 1 || rng() < 0.6 ? 1 : 2;
        for (let c = 0; c < nfill; c++) {
          const p = next();
          if (!bin.comps.some((x) => x.gtin === p.gtin)) this.stockComp(bin, c, p);
        }
      }
    }
    // Velocity prior and min/max replenishment levels from expected demand.
    seedDemand() {
      const cfg = this.cfg, prods = this.inv.products, dTot = prods.reduce((s, p) => s + p.demand, 0);
      for (const p of prods) {
        const share = p.demand / dTot;
        p.hits = cfg.orderRate * 1.9 * share;
        p.min = Math.max(4, Math.ceil(cfg.orderRate * 2.2 * share * 2));
        p.max = p.min * 4;
      }
      this.inv.classify();
    }

    // ---------------------------------------------------------------- dispatch helpers
    // A retrieval task for every stored unit that a station has asked for.
    createRetrievals() {
      for (const bin of this.binsWithRequests) {
        if (bin.loc === 'grid' && !bin.task && bin.requests.length) {
          const goodsIn = this.ports[bin.requests[0].port].kind === 'GOODS_IN';
          bin.task = this.newTask({ type: 'RETRIEVE', bin, port: bin.requests[0].port, priority: goodsIn ? 4 : 5 });
        }
      }
    }
    // Robots low on battery go charging when a charger is free.
    dispatchCharging() {
      const cfg = this.cfg, g = this.grid;
      for (const r of this.robots) {
        if (r.task || r.battery >= cfg.battLow) continue;
        const ch = g.chargers.filter((c) => c.robot < 0).sort((a, b) => WS.U.manhattan(r.x, r.y, a.x, a.y) - WS.U.manhattan(r.x, r.y, b.x, b.y))[0];
        if (ch) { ch.robot = r.id; this.assignTask(r, { type: 'CHARGE', charger: ch, priority: 9 }); this.log('robot', `${r.name} battery ${r.battery.toFixed(0)}% → charger ${ch.id + 1}`); }
      }
    }
    // Tasks still waiting for a robot or machine, most urgent first. Priority
    // grows by one point per waiting minute, so no station starves.
    taskPriority(t) { return t.priority + (this.time - t.created) / 60; }
    pendingTasks() { return this.tasks.filter((t) => t.robot < 0).sort((a, b) => this.taskPriority(b) - this.taskPriority(a)); }
    // A station already has as many units on their way as it may have.
    portFull(port) { return port.inbound + port.inQ.length + (port.pick ? 1 : 0) >= this.cfg.portInboundCap; }
    idleRobots() { return this.robots.filter((r) => !r.task && r.battery >= this.cfg.battLow * 0.5); }
    nearestRobot(list, x, y) {
      let best = null, bd = Infinity;
      for (const r of list) { const d = WS.U.manhattan(r.x, r.y, x, y); if (d < bd) { bd = d; best = r; } }
      return best;
    }
    // Robots idle for a few seconds in the way (needsParking) move to parkingCell().
    parkIdle(idle) {
      const g = this.grid;
      for (const r of idle) {
        if (r.idleTime < 3 || !this.needsParking(r)) continue;
        const target = this.parkingCell(r);
        if (target >= 0) this.assignTask(r, { type: 'PARK', x: g.cx(target), y: g.cy(target), priority: 0 });
      }
    }

    // ---------------------------------------------------------------- events & log
    schedule(delay, fn) { this.events.push({ t: this.time + delay, fn }); this.events.sort((a, b) => a.t - b.t); }
    log(type, msg) {
      this.logs.push({ id: ++this.logSeq, t: this.time, type, msg });
      if (this.logs.length > 500) this.logs.shift();
    }

    // ---------------------------------------------------------------- bins & tasks
    requestBin(bin, portIdx, line) {
      const ex = bin.requests.find((q) => q.port === portIdx);
      if (ex) ex.lines.push(line); else bin.requests.push({ port: portIdx, lines: [line], t: this.time });
      this.binsWithRequests.add(bin);
    }
    newTask(t) { t.id = this.taskSeq++; t.created = this.time; t.robot = -1; this.tasks.push(t); return t; }
    assignTask(r, t) {
      if (!t.id) { t.id = this.taskSeq++; t.created = this.time; this.tasks.push(t); }
      r.start(t);
    }
    taskDone(r) {
      const t = r.task;
      r.task = null; r.gen = null; r.op = null; r.state = 'IDLE'; r.busy = false; r.tasksDone++;
      if (t) {
        const k = this.tasks.indexOf(t); if (k >= 0) this.tasks.splice(k, 1);
        if (t.bin && t.bin.task === t) t.bin.task = null;
      }
    }

    // ---------------------------------------------------------------- tick
    tick() {
      const dt = this.cfg.tick;
      this.time += dt; this.ticks++;
      while (this.events.length && this.events[0].t <= this.time) this.events.shift().fn();
      this.inv.update(dt);
      this.oms.update(dt);
      for (const p of this.ports) p.update(dt);
      this.dispatchTimer += dt;
      if (this.dispatchTimer >= 0.2) { this.dispatchTimer = 0; this.dispatch(); }
      for (const r of this.robots) r.update(dt);
      this.heatTimer += dt;
      if (this.heatTimer >= 1) { this.grid.decayHeat(this.heatTimer); this.heatTimer = 0; }
      this.kpi.update(dt);
    }
  }

  WS.Sim = Sim;
  WS.Layout = Layout;
})((globalThis.WS = globalThis.WS || {}));
