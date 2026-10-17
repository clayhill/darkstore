/* Shared base for storage types built from aisles of racking with machines on
 * rails: RailRunner (a shuttle per level and a lift per aisle) and SkyStack (a
 * stacker crane per aisle). Totes sit single deep on both sides of each aisle.
 * This holds the racking geometry, the slot bookkeeping, the control-room map,
 * the storage policy and the pre-zone conveyor between the aisle fronts and
 * the stations. A type adds its machines, how they move and how it dispatches. */
(function (WS) {
  'use strict';
  const ZU = 0.33; // metres per render level

  // World geometry for the isometric view and the shared station layout.
  // Aisle a: rack x ∈ [3a, 3a+1], machine lane [3a+1, 3a+2], rack [3a+2, 3a+3];
  // bays run along y, the aisle fronts are at y = B, stations further out.
  // The front `frontBays` bays of each side are not storage (shuttle buffers).
  class Racking {
    constructor(cfg, o) {
      const A = cfg.aisles, B = cfg.bays, L = cfg.levels;
      Object.assign(this, { A, B, L });
      this.SB = B - o.frontBays; // storage bays per side and level
      this.LH = cfg.levelHeight / ZU; this.Z0 = o.Z0; // level spacing and bottom level (render levels)
      this.Z = this.Z0 + L * this.LH; // rack top
      this.ioZ = 1.8; // where totes meet the conveyor
      this.outY = B + 2.2; this.retY = B + 1.3; // pre-zone lines: to the stations, back to the aisles
      const nPorts = cfg.pickPorts + cfg.goodsInPorts;
      // stations in a row in front of the racking
      this.W = Math.max(A * 3, 1 + nPorts * 6); this.D = B + 3; this.shadowW = A * 3;
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

  // Control-room map: four columns per aisle (rack side, machine lane, rack
  // side, front column), one row per level (top level first), then the
  // conveyor row and the stations.
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
    // map cell → { aisle, level, part } with part 0/2 = rack side, 1 = lane, 3 = front column
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

  class RackSim extends WS.Sim {
    // ---------- a type supplies ----------
    // rackShape(): { Z0, frontBays } · newAisle(a): extra per-aisle state ·
    // createMachines() · aisleLoad(aisle) / levelLoad(aisle, l) for the storage
    // policy · slotRank(l, s, b): 0 = fastest position, 1 = slowest
    createGrid() { return new Racking(this.cfg, this.rackShape()); }
    storageCapacity() { const c = this.cfg; return c.aisles * c.levels * 2 * this.grid.SB; }
    unitDepth() { return 1; }
    unitCell(bin) { return this.mapGrid.idx(bin.x, bin.y); }
    si(l, s, b) { return (l * 2 + s) * this.cfg.bays + b; }
    sideFill(a, l, s) { return this.aisles[a].count[l * 2 + s] / this.grid.SB; }

    seed() {
      const cfg = this.cfg, inv = this.inv, rng = this.rng, A = cfg.aisles, L = cfg.levels, B = cfg.bays, SB = this.grid.SB;
      this.mapGrid = new RackMap(this);
      this.conv = []; this.cycleLog = [];
      inv.seedCatalog(cfg.products, rng);
      this.aisles = [];
      for (let a = 0; a < A; a++) {
        this.aisles.push(Object.assign({
          a, slot: new Array(L * 2 * B).fill(null), resv: new Array(L * 2 * B).fill(false), count: new Int16Array(L * 2), inQ: [],
        }, this.newAisle(a)));
      }
      const all = [];
      for (let a = 0; a < A; a++) for (let l = 0; l < L; l++) for (let s = 0; s < 2; s++) for (let b = 0; b < SB; b++) {
        if (rng() >= cfg.rackFill) continue;
        const bin = this.newBin({ prefix: 'ST' });
        this.place(bin, a, l, s, b);
        all.push(bin);
      }
      this.stockBins(all);
      this.seedDemand();
      this.createMachines();
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
    // to the aisle the storage policy picks, where it queues for its machine.
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
    // Storage position for a returning tote: fast movers in the fastest
    // positions, spread over the aisles (and levels) with the least work queued.
    aisleLoad(aisle) { return aisle.inQ.length + this.conv.filter((it) => it.back).length / this.cfg.aisles; }
    levelLoad() { return 0; }
    chooseSlot(bin) {
      const c = this.cfg, pol = c.putawayPolicy;
      const target = { A: 0, B: 0.35, C: 0.75, E: 0.6 }[this.inv.binClass(bin)];
      let best = null, bestS = Infinity;
      for (const aisle of this.aisles) {
        const aisleLoad = this.aisleLoad(aisle);
        for (let l = 0; l < c.levels; l++) {
          const levelLoad = this.levelLoad(aisle, l);
          for (let s = 0; s < 2; s++) for (let b = 0; b < this.grid.SB; b++) {
            const i = this.si(l, s, b);
            if (aisle.slot[i] || aisle.resv[i]) continue;
            const nd = this.slotRank(l, s, b);
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

  WS.RackSim = RackSim;
  WS.RACK_ZU = ZU;
})((globalThis.WS = globalThis.WS || {}));
