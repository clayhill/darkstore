/* Simulation orchestrator: fixed time-step loop (100 ms ticks) with a small
 * discrete-event queue, the task dispatcher, scenario seeding and the
 * floor layout shared by simulation and renderers. */
(function (WS) {
  'use strict';

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
    // A storage type (see PodSim) overrides these hooks; the order flow, ports,
    // inventory, router and KPIs are shared.
    get kind() { return 'cube'; }
    get terms() { return TERMS; }
    get taskTypes() { return WS.Tasks; }
    defaults() { return WS.DEFAULT_CONFIG; }
    createGrid() { return new WS.Grid(this.cfg); }
    createLayout() { return new Layout(this); }
    describe() { return `Grid ${this.cfg.gridW}×${this.cfg.gridD}×${this.cfg.gridZ} online · ${this.robots.length} robots · ${this.inv.bins.length} bins · ${this.ports.length} ports`; }
    compLabel(k) { return 'compartment ' + (k + 1); }
    storageCapacity() { const g = this.grid; return g.type.reduce((s, t) => s + (t === WS.CELL.STORAGE ? g.Z : 0), 0); }
    // Cost of fetching a bin for an order line: digging depth, travel, a locked column.
    fetchCost(bin) {
      if (bin.loc !== 'grid') return 25;
      const g = this.grid, i = this.inv.binColumn(bin);
      return (g.depthOf(i, bin.id) - 1) * 9 + this.inv.portDist[i] * 0.5 + (g.colLock[i] >= 0 ? 6 : 0);
    }

    seed() {
      const cfg = this.cfg, g = this.grid, inv = this.inv, rng = this.rng;
      inv.seedCatalog(cfg.products, rng);
      inv.computePortDistances();
      // storage bins: random fill, unsorted (the system self-sorts over time)
      const cols = [];
      for (let i = 0; i < g.type.length; i++) if (g.isStorage(i)) cols.push(i);
      const allBins = [];
      for (const i of cols) {
        const h = WS.U.clamp(Math.round(g.Z * cfg.initialFill + (rng() - 0.5) * 4), 1, g.Z);
        for (let z = 0; z < h; z++) {
          const r = rng(), bin = inv.createBin(r < 0.45 ? 1 : r < 0.8 ? 2 : 4);
          inv.placeOnStack(bin, i);
          allBins.push(bin);
        }
      }
      // stock: every product in at least one bin, then demand-weighted
      const stocked = allBins.filter(() => rng() < cfg.stockedRatio);
      const prods = inv.products, w = prods.map((p) => Math.pow(p.demand, 0.3)), tot = w.reduce((a, b) => a + b, 0);
      let k = 0;
      for (const bin of stocked) {
        const nfill = bin.ncomp === 1 || rng() < 0.6 ? 1 : 2;
        for (let c = 0; c < nfill; c++) {
          const p = k < prods.length ? prods[k++] : prods[rng.weighted(w, tot)];
          if (bin.comps.some((x) => x.gtin === p.gtin)) continue;
          const cap = inv.compCap(bin, p), q = Math.max(1, Math.round(cap * (0.25 + rng() * 0.75)));
          inv.setComp(bin, c, p.gtin);
          bin.comps[c].qty = q; p.onHand += q;
        }
      }
      // velocity prior & replenishment levels from expected demand
      const dTot = prods.reduce((s, p) => s + p.demand, 0);
      for (const p of prods) {
        const share = p.demand / dTot;
        p.hits = cfg.orderRate * 1.9 * share;
        p.min = Math.max(4, Math.ceil(cfg.orderRate * 2.2 * share * 2));
        p.max = p.min * 4;
      }
      inv.classify();
      // robots on random free storage cells
      const free = cols.slice();
      for (let r = 0; r < cfg.robots; r++) {
        const j = Math.floor(rng() * free.length), i = free.splice(j, 1)[0];
        this.robots.push(new WS.Robot(this, r, g.cx(i), g.cy(i)));
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
    onPortOut(port, bin) {
      bin.task = this.newTask({ type: 'STORE', port: port.idx, bin, priority: 8 });
    }
    createRestack(origin, items) { this.newTask({ type: 'RESTACK', origin, items, priority: 1 }); }
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

    dispatch() {
      const g = this.grid, cfg = this.cfg;
      for (const bin of this.binsWithRequests) {
        if (bin.loc === 'grid' && !bin.task && bin.requests.length) {
          const goodsIn = this.ports[bin.requests[0].port].kind === 'GOODS_IN';
          bin.task = this.newTask({ type: 'RETRIEVE', bin, port: bin.requests[0].port, priority: goodsIn ? 4 : 5 });
        }
      }
      // battery management: low robots go charging when a charger is free
      for (const r of this.robots) {
        if (r.task || r.battery >= cfg.battLow) continue;
        const ch = g.chargers.filter((c) => c.robot < 0).sort((a, b) => WS.U.manhattan(r.x, r.y, a.x, a.y) - WS.U.manhattan(r.x, r.y, b.x, b.y))[0];
        if (ch) { ch.robot = r.id; this.assignTask(r, { type: 'CHARGE', charger: ch, priority: 9 }); this.log('robot', `${r.name} battery ${r.battery.toFixed(0)}% → charger ${ch.id + 1}`); }
      }
      let idle = this.robots.filter((r) => !r.task && r.battery >= cfg.battLow * 0.5);
      if (!idle.length) return;
      // priority ageing (1 point per waiting minute) so no port starves; restacks don't age
      const now = this.time, eff = (t) => t.priority + (t.type === 'RESTACK' ? 0 : (now - t.created) / 60);
      for (let k = this.tasks.length - 1; k >= 0; k--) {
        const t = this.tasks[k];
        if (t.type === 'RESTACK' && t.robot < 0 && now - t.created > 900) this.tasks.splice(k, 1); // stale: leave bins where they are
      }
      const pending = this.tasks.filter((t) => t.robot < 0).sort((a, b) => eff(b) - eff(a));
      for (const t of pending) {
        if (!idle.length) break;
        let sx, sy;
        if (t.type === 'RETRIEVE') {
          const col = this.inv.binColumn(t.bin);
          if (col < 0 || g.colLock[col] >= 0) continue;
          t.port = t.bin.requests[0].port;
          const port = this.ports[t.port];
          if (port.inbound + port.inQ.length + (port.pick ? 1 : 0) >= cfg.portInboundCap) continue;
          sx = g.cx(col); sy = g.cy(col);
        } else if (t.type === 'STORE') { const p = this.ports[t.port]; sx = p.lift.x; sy = p.lift.y; }
        else if (t.type === 'RESTACK') {
          if (g.colLock[t.origin] >= 0 || g.stacks[t.origin].length >= g.Z) continue;
          // only worth it if at least one blocker is still on top of its temp column
          if (!t.items.some((it) => it.bin.loc === 'grid' && g.stacks[it.tmp][g.stacks[it.tmp].length - 1] === it.bin.id)) {
            this.tasks.splice(this.tasks.indexOf(t), 1); continue;
          }
          if (idle.length < 2 && this.tasks.some((x) => x.robot < 0 && x.priority > 1)) continue; // keep a robot for real work
          sx = g.cx(t.items[0].tmp); sy = g.cy(t.items[0].tmp);
        } else continue;
        let best = null, bd = Infinity;
        for (const r of idle) { const d = WS.U.manhattan(r.x, r.y, sx, sy); if (d < bd) { bd = d; best = r; } }
        if (t.type === 'RETRIEVE') { g.colLock[this.inv.binColumn(t.bin)] = best.id; this.ports[t.port].inbound++; }
        if (t.type === 'RESTACK') g.colLock[t.origin] = best.id;
        idle = idle.filter((r) => r !== best);
        best.start(t);
      }
      // idle robots clear ports, chargers and the cells right next to ports
      for (const r of idle) {
        if (r.idleTime < 3) continue;
        const i = g.idx(r.x, r.y);
        if (g.isStorage(i) && this.inv.portDist[i] >= 3 && r.y > 0) continue;
        const target = this.parkingCell(r);
        if (target >= 0) this.assignTask(r, { type: 'PARK', x: g.cx(target), y: g.cy(target), priority: 0 });
      }
    }
    parkingCell(r) {
      const g = this.grid; let best = -1, bd = Infinity;
      for (let i = 0; i < g.type.length; i++) {
        if (!g.isStorage(i) || g.claim[i] >= 0 || this.inv.portDist[i] < 3 || g.cy(i) === 0) continue;
        const d = WS.U.manhattan(r.x, r.y, g.cx(i), g.cy(i)) + g.passHeat[i] * 0.3;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
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

  const TERMS = { unit: 'bin', Unit: 'Bin', units: 'bins', Units: 'Bins', store: 'grid', Store: 'Grid', port: 'port', ports: 'ports' };

  WS.Sim = Sim;
  WS.Layout = Layout;
})((globalThis.WS = globalThis.WS || {}));
