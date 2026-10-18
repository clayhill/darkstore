/* CubeFlow: bins stacked in a [X][Y][Z] grid, robots on top digging out the
 * bin they need. Seeding, dispatch (with restacking of dug-out blockers) and
 * the slotting rules that decide where bins go. */
(function (WS) {
  'use strict';
  const TERMS = { unit: 'bin', Unit: 'Bin', units: 'bins', Units: 'Bins', store: 'grid', Store: 'Grid', port: 'port', ports: 'ports' };

  const EXTRA = { DIGGING_BIN: { label: 'Digging', color: '#f59e0b' }, RESTACKING: { label: 'Restacking', color: '#fb923c' } };
  const LEGEND = ['IDLE', 'MOVING_TO_TARGET', 'DIGGING_BIN', 'HANDLING', 'TRANSPORTING_TO_PORT', 'AT_PORT', 'STORING', 'RESTACKING', 'WAITING_IN_TRAFFIC', 'WAITING_PORT', 'TO_CHARGER', 'CHARGING'];

  class CubeSim extends WS.Sim {
    get kind() { return 'cube'; }
    get terms() { return TERMS; }
    get taskTypes() { return WS.CubeTasks; }
    get extraStates() { return EXTRA; }
    get legendStates() { return LEGEND; }
    defaults() { return WS.CUBE_CONFIG; }
    createGrid() { return new WS.Grid(this.cfg); }
    describe() { return `Grid ${this.cfg.gridW}×${this.cfg.gridD}×${this.cfg.gridZ} online · ${this.fleet.length} robots · ${this.inv.bins.length} bins · ${this.ports.length} ports`; }
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
          const bin = this.newBin();
          this.placeOnStack(bin, i);
          allBins.push(bin);
        }
      }
      this.stockBins(allBins);
      this.seedDemand();
      // robots on random free storage cells
      const free = cols.slice();
      for (let r = 0; r < cfg.robots; r++) {
        const j = Math.floor(rng() * free.length), i = free.splice(j, 1)[0];
        this.fleet.push(new WS.Robot(this, r, g.cx(i), g.cy(i)));
      }
    }

    onPortOut(port, bin) {
      bin.task = this.newTask({ type: 'STORE', port: port.idx, bin, priority: 8 });
    }
    createRestack(origin, items) { this.newTask({ type: 'RESTACK', origin, items, priority: 1 }); }

    // ---------------------------------------------------------------- dispatch
    dispatch() {
      const g = this.grid;
      this.createRetrievals();
      this.dispatchCharging();
      let idle = this.idleRobots();
      if (!idle.length) return;
      const now = this.time;
      for (let k = this.tasks.length - 1; k >= 0; k--) {
        const t = this.tasks[k];
        if (t.type === 'RESTACK' && t.robot < 0 && now - t.created > 900) this.tasks.splice(k, 1); // stale: leave bins where they are
      }
      for (const t of this.pendingTasks()) {
        if (!idle.length) break;
        let sx, sy;
        if (t.type === 'RETRIEVE') {
          const col = this.inv.binColumn(t.bin);
          if (col < 0 || g.colLock[col] >= 0) continue;
          t.port = t.bin.requests[0].port;
          const port = this.ports[t.port];
          if (this.portFull(port)) continue;
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
        const best = this.nearestRobot(idle, sx, sy);
        if (t.type === 'RETRIEVE') { g.colLock[this.inv.binColumn(t.bin)] = best.id; this.ports[t.port].inbound++; }
        if (t.type === 'RESTACK') g.colLock[t.origin] = best.id;
        idle = idle.filter((r) => r !== best);
        best.start(t);
      }
      this.parkIdle(idle);
    }
    // restacks don't age: they only use robots nothing else needs
    taskPriority(t) { return t.type === 'RESTACK' ? t.priority : super.taskPriority(t); }
    // idle robots clear ports, chargers and the cells right next to ports
    needsParking(r) {
      const g = this.grid, i = g.idx(r.x, r.y);
      return !(g.isStorage(i) && this.inv.portDist[i] >= 3 && r.y > 0);
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

    // ---------------------------------------------------------------- stacks & slotting
    placeOnStack(bin, i) {
      const g = this.grid;
      g.stacks[i].push(bin.id);
      bin.loc = 'grid'; bin.x = g.cx(i); bin.y = g.cy(i); bin.robot = -1; bin.port = -1;
      g.version++;
    }
    liftFromStack(bin, i, robotId) {
      const g = this.grid, s = g.stacks[i];
      if (s[s.length - 1] !== bin.id) throw new Error('lift of non-top bin ' + bin.id);
      s.pop();
      bin.loc = 'robot'; bin.robot = robotId; g.version++;
    }
    columnRisk(i) {
      // cost of burying column i: popularity of its top bins + any bins awaiting retrieval
      const s = this.grid.stacks[i]; let r = 0;
      for (let k = s.length - 1, w = 1; k >= 0 && w > 0.1; k--, w *= 0.5) {
        const b = this.inv.binById.get(s[k]);
        if (b.requests.length) r += 40 * w;
        r += Math.min(this.inv.binVelocity(b), 20) * 0.6 * w;
      }
      return r;
    }
    chooseStoreColumn(bin, fx, fy, robotId) {
      const g = this.grid, cfg = this.cfg, pol = cfg.putawayPolicy;
      const cls = this.inv.binClass(bin);
      const target = { A: 0, B: 0.35, C: 0.75, E: 0.6 }[cls];
      let best = -1, bestS = Infinity;
      for (let i = 0; i < g.type.length; i++) {
        if (!g.isStorage(i) || g.stacks[i].length >= g.Z) continue;
        if (g.colLock[i] >= 0 && g.colLock[i] !== robotId) continue;
        const travel = WS.U.manhattan(fx, fy, g.cx(i), g.cy(i));
        let s;
        if (pol === 'random') s = this.rng();
        else if (pol === 'nearest') s = travel + this.columnRisk(i) * 0.3;
        else {
          const nd = this.inv.portDist[i] / this.inv.maxPortDist;
          s = Math.abs(nd - target) * 26 + travel * 0.12 + this.columnRisk(i) * (cls === 'C' || cls === 'E' ? 1 : 0.4) + (g.stacks[i].length / g.Z) * 2;
        }
        if (s < bestS) { bestS = s; best = i; }
      }
      return best;
    }
    // Temporary column for a blocker bin during a dig: adjacent first, then further out.
    findTempColumn(x, y, robotId) {
      const g = this.grid, origin = g.idx(x, y);
      for (let rad = 1; rad <= 4; rad++) {
        let best = -1, bestS = Infinity;
        for (let dx = -rad; dx <= rad; dx++) {
          const ady = rad - Math.abs(dx);
          for (const dy of ady ? [-ady, ady] : [0]) {
            const nx = x + dx, ny = y + dy;
            if (!g.inside(nx, ny)) continue;
            const i = g.idx(nx, ny);
            if (i === origin || !g.isStorage(i) || g.stacks[i].length >= g.Z) continue;
            if (g.colLock[i] >= 0) continue;
            if (g.claim[i] >= 0 && g.claim[i] !== robotId) continue;
            const s = this.columnRisk(i) + g.stacks[i].length * 0.4;
            if (s < bestS) { bestS = s; best = i; }
          }
        }
        if (best >= 0) return best;
      }
      return -1;
    }
  }

  WS.CubeSim = CubeSim;
})((globalThis.WS = globalThis.WS || {}));
