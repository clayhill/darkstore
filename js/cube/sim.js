/* CubeFlow: bins stacked in a [X][Y][Z] grid, robots on top digging out the
 * bin they need. Seeding, dispatch (with restacking of dug-out blockers) and
 * the slotting rules that decide where bins go. */
(function (WS) {
  'use strict';
  const TERMS = { unit: 'bin', Unit: 'Bin', units: 'bins', Units: 'Bins', store: 'grid', Store: 'Grid', port: 'port', ports: 'ports' };

  class CubeSim extends WS.Sim {
    get kind() { return 'cube'; }
    get terms() { return TERMS; }
    get taskTypes() { return WS.CubeTasks; }
    defaults() { return WS.CUBE_CONFIG; }
    createGrid() { return new WS.Grid(this.cfg); }
    describe() { return `Grid ${this.cfg.gridW}×${this.cfg.gridD}×${this.cfg.gridZ} online · ${this.robots.length} robots · ${this.inv.bins.length} bins · ${this.ports.length} ports`; }
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
          this.placeOnStack(bin, i);
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

    onPortOut(port, bin) {
      bin.task = this.newTask({ type: 'STORE', port: port.idx, bin, priority: 8 });
    }
    createRestack(origin, items) { this.newTask({ type: 'RESTACK', origin, items, priority: 1 }); }

    // ---------------------------------------------------------------- dispatch
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
