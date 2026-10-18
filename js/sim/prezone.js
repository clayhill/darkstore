/* Racking with its stations in front of the aisles, fed by a pre-zone
 * conveyor: RailRunner and SkyStack. Totes leave and enter the racking at the
 * aisle fronts, where returning totes queue for the aisle's machines. This
 * holds the racking geometry, the levels × aisles control-room map, the
 * conveyor paths and the storage policy for returning totes. The slot
 * bookkeeping and the conveyor items are WS.RackSim (js/sim/rack.js). */
(function (WS) {
  'use strict';
  const ZU = WS.RACK_ZU;

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

  class PreZoneSim extends WS.RackSim {
    // ---------- a type supplies ----------
    // rackShape(): { Z0, frontBays } · aisleLoad(aisle) / levelLoad(aisle, l)
    // for the storage policy · slotRank(l, s, b): 0 = fastest position, 1 = slowest
    createGrid() { return new Racking(this.cfg, this.rackShape()); }
    createMap() { return new RackMap(this); }
    newAisle() { return { inQ: [] }; } // returning totes waiting for the aisle's machines
    sideFill(a, l, s) { return this.aisles[a].count[l * 2 + s] / this.grid.SB; }

    // ---------- conveyor paths ----------
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
    // A tote no station needs goes back to the aisle the storage policy
    // picks, where it queues for its machine.
    returnTote(port, bin) {
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
  }

  WS.PreZoneSim = PreZoneSim;
})((globalThis.WS = globalThis.WS || {}));
