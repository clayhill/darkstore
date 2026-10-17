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
    onPortOut() {}

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
