/* Racking with its stations in front of the aisles, fed by a pre-zone
 * conveyor: RailRunner and SkyStack. Totes leave and enter the racking at the
 * aisle fronts, where returning totes queue for the aisle's machines. This
 * holds the racking geometry, the levels × aisles control-room map, the
 * conveyor paths and the storage policy for returning totes. The slot
 * bookkeeping and the conveyor items are WS.RackSim (js/sim/rack.js).
 *
 * The pre-zone is a one-way loop at the height of the stations' conveyors:
 * the near line runs left in front of the aisles, the far line right past
 * the stations, joined at both ends. Each aisle has an outfeed on its left
 * that joins the near line and an infeed on its right that leaves it; each
 * station takes totes off the far line and puts them back on it. No line
 * carries totes both ways and none crosses another. */
(function (WS) {
  'use strict';
  const ZU = WS.RACK_ZU;

  // World geometry for the isometric view and the shared station layout.
  // Aisle a: rack x ∈ [3a, 3a+1], machine lane [3a+1, 3a+2], rack [3a+2, 3a+3];
  // bays run along y, the aisle fronts are at y = B, then the I/O point, the
  // pre-zone loop and the stations. The front `frontBays` bays of each side
  // are not storage (shuttle buffers).
  class Racking {
    constructor(cfg, o) {
      const A = cfg.aisles, B = cfg.bays, L = cfg.levels;
      Object.assign(this, { A, B, L });
      this.frontBays = o.frontBays; this.SB = B - o.frontBays; // storage bays per side and level
      this.LH = cfg.levelHeight / ZU; this.Z0 = o.Z0; // level spacing and bottom level (render levels)
      this.Z = this.Z0 + L * this.LH; // rack top
      this.convZ = 2.2; // top of the pre-zone conveyors, as high as the stations' conveyors
      this.ioZ = this.convZ - 0.06; // handler height at the I/O point: a tote on it stands on the conveyor
      this.nearY = B + 2.9; this.farY = B + 3.8; // the loop's lines: left past the aisles, right past the stations
      const nPorts = cfg.pickPorts + cfg.goodsInPorts;
      this.loopX0 = -0.5; this.loopX1 = Math.max(A * 3 - 0.5, nPorts * 6 - 3.5) + 0.7; // the loop's ends
      // stations in a row in front of the racking
      this.W = Math.max(A * 3, 1 + nPorts * 6); this.D = B + 5; this.shadowW = A * 3;
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
    outX(a) { return a * 3 + 0.5; } // the aisle's outfeed, in front of its left rack
    inX(a) { return a * 3 + 2.5; } // its infeed, in front of the right rack
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
    // a tote 0.8 cells across and 0.6 along the aisle, as in the racking
    convTote() { return { w: 0.4, d: 0.3, gap: 0.04 }; }

    // ---------- conveyor paths ----------
    // From aisle a's outfeed (put on at y0) along the near line, round the
    // left end and along the far line to the station's infeed.
    outPath(a, port, y0) {
      const g = this.grid, x = g.outX(a), px = port.drop.x + 0.5;
      return [{ x, y: y0 }, { x, y: g.nearY }, { x: g.loopX0, y: g.nearY }, { x: g.loopX0, y: g.farY }, { x: px, y: g.farY }, { x: px, y: g.D }];
    }
    // From a station along the far line, round the right end and along the
    // near line to aisle a's infeed, up to where its machine takes the tote.
    returnPath(port, a) {
      const g = this.grid, x = g.inX(a);
      return [...this.portExit(port), { x: port.drop.x + 1.5, y: g.farY }, { x: g.loopX1, y: g.farY }, { x: g.loopX1, y: g.nearY }, { x, y: g.nearY }, { x, y: this.ioEnd(a) }];
    }
    // From one station to another: straight on along the far line, or once round the loop.
    stationPath(from, to) {
      const g = this.grid, x = to.drop.x + 0.5, path = [...this.portExit(from), { x: from.drop.x + 1.5, y: g.farY }];
      if (x < from.drop.x + 1.5) path.push({ x: g.loopX1, y: g.farY }, { x: g.loopX1, y: g.nearY }, { x: g.loopX0, y: g.nearY }, { x: g.loopX0, y: g.farY });
      return path.concat([{ x, y: g.farY }, { x, y: g.D }]);
    }
    // y on the infeed where the aisle's machine takes a returning tote
    ioEnd() { return this.grid.B + 0.5; }
    // where the aisles' conveyors start and end in front of the racking (for the views)
    ioConveyorY() { return this.grid.B + 0.1; }
    // The conveyor runs, as point lists in the direction they carry totes (for the views).
    preZoneLines() {
      const g = this.grid, x0 = g.loopX0, x1 = g.loopX1, y = this.ioConveyorY();
      const lines = [[{ x: x1, y: g.nearY }, { x: x0, y: g.nearY }], [{ x: x0, y: g.nearY }, { x: x0, y: g.farY }], [{ x: x0, y: g.farY }, { x: x1, y: g.farY }], [{ x: x1, y: g.farY }, { x: x1, y: g.nearY }]];
      for (const aisle of this.aisles) lines.push([{ x: g.outX(aisle.a), y }, { x: g.outX(aisle.a), y: g.nearY }], [{ x: g.inX(aisle.a), y: g.nearY }, { x: g.inX(aisle.a), y }]);
      for (const p of this.ports) lines.push([{ x: p.drop.x + 0.5, y: g.farY }, { x: p.drop.x + 0.5, y: g.D }], [{ x: p.drop.x + 1.5, y: g.D }, { x: p.drop.x + 1.5, y: g.farY }]);
      return lines;
    }
    // how far along its path a tote on aisle's infeed may go for now
    infeedLimit(aisle, it) { return it.len - this.infeedHold; }
    get infeedHold() { return 0; } // how far before its end a tote stops on an infeed until its machine takes it
    // A tote no station needs goes back to the aisle the storage policy
    // picks (it.dest; it may still change, see routeBack). On the aisle's
    // infeed it joins the queue the aisle's machines take from (it stays on
    // the conveyor until one does).
    returnTote(port, bin) {
      const dest = this.chooseSlot(bin);
      this.aisles[dest.a].resv[this.si(dest.l, dest.s, dest.b)] = true;
      const it = this.convey(bin, this.returnPath(port, dest.a), null, true, {
        dest,
        onLast: () => { const d = it.dest; this.aisles[d.a].inQ.push({ bin, l: d.l, s: d.s, b: d.b, t: this.time, conv: it }); bin.loc = 'queue'; },
        limit: () => this.infeedLimit(this.aisles[it.dest.a], it),
      });
      return it;
    }
    // No more totes released for a station while one for it is going round.
    portFull(port) { return super.portFull(port) || this.conv.some((it) => it.port === port && it.laps && !it.turn); }
    toPort(bin, path, port) { const it = super.toPort(bin, path, port); it.port = port; return it; }

    // ---------- late routing ----------
    // Every path ends in a spur off the loop: a station's infeed or an
    // aisle's infeed. Just before a tote reaches its turn-off it is decided:
    // with room on the spur it turns off (it.turn); otherwise it stays on the
    // loop, so it never stands there blocking the totes behind it. A tote for
    // a station goes round once more and tries again; a returning tote goes
    // to the next aisle with room on its infeed, or round once more.
    routeConveyors() {
      for (const it of this.conv.slice()) {
        if (it.turn || !(it.port || it.dest)) continue;
        if (this.convTo(it, it.path.length - 2) - it.s > 1) continue;
        if (it.port) {
          if (this.portRoom(it.port, it) > 0) it.turn = true;
          else this.lap(it, this.lapTail('far', it.port.drop.x + 0.5, this.grid.D));
        } else this.routeBack(it);
      }
    }
    routeBack(it) {
      const g = this.grid, d = it.dest, bin = it.bin;
      if (this.infeedRoom(this.aisles[d.a]) > 0) { it.turn = true; return; }
      const room = (aisle) => this.infeedRoom(aisle) > 0;
      // an aisle further along the near line, else round the loop to the best one with room
      let t = this.chooseSlot(bin, (aisle) => g.inX(aisle.a) < g.inX(d.a) && room(aisle)), lap = false;
      if (!t) { t = this.chooseSlot(bin, room) || d; lap = true; }
      if (t !== d) {
        this.aisles[d.a].resv[this.si(d.l, d.s, d.b)] = false;
        this.aisles[t.a].resv[this.si(t.l, t.s, t.b)] = true;
        it.dest = t;
      }
      const x = g.inX(t.a), y = this.ioEnd(t.a);
      if (lap) this.lap(it, this.lapTail('near', x, y));
      else this.reroute(it, [{ x, y: g.nearY }, { x, y }]);
    }
    // Round once more. A tote going round gives way where totes join the
    // loop (it counts as the youngest), so the loop cannot shut out the
    // machines and stations putting totes on it.
    lap(it, tail) {
      this.reroute(it, tail);
      it.laps = (it.laps || 0) + 1; it.seq = this.convSeq++;
      this.conv.splice(this.conv.indexOf(it), 1); this.conv.push(it);
      this.kpi.recirculated = (this.kpi.recirculated || 0) + 1;
    }
    // Totes that may still turn onto a station's infeed: what its queue
    // takes, less those already turning. A tote that has gone round goes
    // first: the room is kept for those that have been round more often.
    portRoom(port, tote) {
      const ahead = (it) => it.turn || (it !== tote && (it.laps || 0) > (tote.laps || 0));
      return port.queueRoom() - this.conv.filter((it) => it.port === port && ahead(it)).length;
    }
    // Totes an aisle's infeed holds clear of the loop: from where the first
    // stops, a tote and a gap apart, the last a tote and a gap from the near
    // line. Less those already on it or turning onto it, and the handler
    // positions a crane has just emptied (they hold the totes behind back).
    infeedCap() {
      const g = this.grid, T = this.convTote(), p = 2 * T.d + T.gap;
      return Math.floor((g.nearY - p - this.ioEnd() - this.infeedHold) / p + 1e-6) + 1;
    }
    infeedRoom(aisle) { return this.infeedCap() - (aisle.ioHeld || 0) - this.conv.filter((it) => it.turn && it.dest && it.dest.a === aisle.a).length; }
    // From the turn-off a tote has passed, once more round the loop to the spur
    // at x ending at y: from the far line ('far', running right) or the near line.
    lapTail(line, x, y) {
      const g = this.grid, x0 = g.loopX0, x1 = g.loopX1, n = g.nearY, f = g.farY;
      const lap = line === 'far' ? [{ x: x1, y: f }, { x: x1, y: n }, { x: x0, y: n }, { x: x0, y: f }, { x, y: f }] : [{ x: x0, y: n }, { x: x0, y: f }, { x: x1, y: f }, { x: x1, y: n }, { x, y: n }];
      return lap.concat([{ x, y }]);
    }
    // The tote has not reached its turn-off yet (the second last point of its
    // path): from there on it follows tail, whose first point lies straight
    // ahead on the same line.
    reroute(it, tail) {
      const p = it.path.slice(0, -2).concat(tail);
      let len = 0;
      for (let k = 1; k < p.length; k++) len += Math.abs(p[k].x - p[k - 1].x) + Math.abs(p[k].y - p[k - 1].y);
      it.path = p; it.len = len;
    }
    // distance along a tote's path to its k-th point
    convTo(it, k) {
      const p = it.path;
      let s = 0;
      for (let j = 1; j <= k; j++) s += Math.abs(p[j].x - p[j - 1].x) + Math.abs(p[j].y - p[j - 1].y);
      return s;
    }
    // Room for more totes on the loop (counting those about to join it), up
    // to a share of what it holds. Machines send no more out when it is
    // three quarters full, stations hold a finished tote when it is nine
    // tenths full, so it never fills up: a full loop would hold the totes it
    // needs to empty.
    loopRoom(share = 0.75) {
      const g = this.grid, T = this.convTote(), len = 2 * (g.loopX1 - g.loopX0) + 2 * (g.farY - g.nearY);
      return Math.floor(share * len / (2 * T.w + T.gap)) - this.conv.filter((it) => !it.turn).length;
    }
    portOutOk() { return this.loopRoom(0.9) > 0; }
    // Storage position for a returning tote: fast movers in the fastest
    // positions, spread over the aisles (and levels) with the least work queued.
    aisleLoad(aisle) { return aisle.inQ.length + this.conv.filter((it) => it.back && !it.joined).length / this.cfg.aisles; }
    levelLoad() { return 0; }
    chooseSlot(bin, ok) {
      const c = this.cfg, pol = c.putawayPolicy;
      const target = { A: 0, B: 0.35, C: 0.75, E: 0.6 }[this.inv.binClass(bin)];
      let best = null, bestS = Infinity;
      for (const aisle of this.aisles) {
        if (ok && !ok(aisle)) continue;
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
  WS.Racking = Racking;
  WS.RackMap = RackMap;
})((globalThis.WS = globalThis.WS || {}));
