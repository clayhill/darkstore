/* DeepLane: an automated pallet shuttle store. Pallets stand in deep lanes on
 * both sides of a transfer aisle, on every level of a block. A carrier runs
 * along each level's transfer aisle with a satellite on board; at a lane the
 * satellite drives in under the pallets, lifts one off the rails and brings
 * it back. Each lane holds one SKU and is filled from the back, so it works
 * last in, first out: only the pallet nearest the transfer aisle can be
 * taken, and a returning pallet goes in front of the others.
 * As in RailRunner (WS.ShuttleSim, which this builds on) the carrier drops a
 * retrieved pallet in the level's outbound buffer at the front of the block,
 * the block's lift takes it down to the pallet conveyor loop, and the loop
 * carries it to a station; returning pallets go the other way.
 * Full pallets arrive from the receiving dock and pass the goods-in station
 * (checked and labelled) on their way into the store. A pallet picked empty
 * goes to the empty-pallet stacker instead of back into the store. */
(function (WS) {
  'use strict';
  const TERMS = { unit: 'pallet', Unit: 'Pallet', units: 'pallets', Units: 'Pallets', store: 'racking', Store: 'Racking', port: 'station', ports: 'stations', machine: 'Machine' };
  const STATE_LABELS = { MOVING_TO_TARGET: 'To lane', HANDLING: 'Satellite at work', TRANSPORTING_TO_PORT: 'To front / I/O', STORING: 'Storing', WAITING_PORT: 'Blocked (buffer)' };
  const LEGEND = ['IDLE', 'MOVING_TO_TARGET', 'HANDLING', 'TRANSPORTING_TO_PORT', 'STORING', 'WAITING_PORT'];
  const { Shuttle } = WS.ShuttleMachines;

  // The racking: block a has lanes x ∈ [X0, X0 + Dw] on the left of its
  // transfer aisle [X0 + Dw, X0 + Dw + 1] and [X0 + Dw + 1, X0 + 2 Dw + 1] on
  // the right, one lane per cell along y. Pallet position d of a lane is
  // counted from the transfer aisle. The level buffers fill the first
  // position of the front lanes on each side, in line with the lift's
  // platforms and the block's outfeed (left) and infeed (right).
  class PalletRacking extends WS.Racking {
    constructor(cfg, o) {
      super(cfg, o);
      this.DN = cfg.laneDepth; this.DP = cfg.slotPitch / cfg.cellSize; this.Dw = this.DN * this.DP;
      this.blockW = 2 * this.Dw + 1; this.gap = 0.8;
      const span = cfg.aisles * this.blockW + (cfg.aisles - 1) * this.gap, nPorts = cfg.pickPorts + cfg.goodsInPorts;
      this.span = span; this.shadowW = span;
      this.loopX1 = Math.max(span - 0.5, nPorts * 6 - 3.5) + 0.7;
      this.W = Math.ceil(Math.max(span, 1 + nPorts * 6));
      this.dockX = this.loopX0 - 4; // the receiving dock, left of the loop
      this.stackX = this.loopX1 + 3; // the empty-pallet stacker, right of it
    }
    X0(a) { return a * (this.blockW + this.gap); }
    laneX(a) { return this.X0(a) + this.Dw + 0.5; }
    outX(a) { return this.X0(a) + this.Dw - this.DP / 2; }
    inX(a) { return this.X0(a) + this.Dw + 1 + this.DP / 2; }
    // x of a lane's position d (side 0 left, 1 right), and how far the satellite goes from the aisle's middle to it
    slotX(a, s, d) { return s ? this.X0(a) + this.Dw + 1 + (d + 0.5) * this.DP : this.X0(a) + this.Dw - (d + 0.5) * this.DP; }
    reach(d) { return 0.5 + (d + 0.5) * this.DP; }
    sideX0(a, s) { return s ? this.X0(a) + this.Dw + 1 : this.X0(a); }
  }

  // A carrier: Shuttle's bookkeeping, plus its satellite (sat: how far it is
  // from the aisle's middle into a lane, satSide: which side, raised: holding
  // a pallet up).
  class Carrier extends Shuttle {
    constructor(sim, id, a, l) {
      super(sim, id, a, l);
      this.name = `C${a + 1}.${String(l + 1).padStart(2, '0')}`;
      this.sat = 0; this.satSide = 0; this.raised = false; this.lifting = null;
    }
  }

  // ---------------------------------------------------------------- machine jobs
  function* satTo(sim, sh, side, d) { sh.satSide = side; yield sim.satTravel(d == null ? 0 : sim.grid.reach(d)); }
  // the satellite lifts a pallet off the rails (up) or sets it down; for the view
  function* satLift(sim, sh, up) { sh.lifting = { up, t0: sim.time }; yield { op: 'wait', t: sim.cfg.satLift }; sh.lifting = null; sh.raised = up; }
  function* carrierRetrieve(sim, sh, task) {
    const aisle = sim.aisles[sh.a], bin = task.bin, buf = aisle.outBuf[sh.l];
    sh.state = 'MOVING_TO_TARGET';
    yield sim.shuttleTravel(bin.bay + 0.5);
    sh.state = 'HANDLING';
    yield* satTo(sim, sh, bin.side, bin.depth);
    // under the pallet now: it is the satellite's from here
    sim.take(bin);
    bin.loc = 'shuttle'; bin.robot = sh.id; bin.task = null; sh.bin = bin.id;
    sim.removeTask(task);
    yield* satLift(sim, sh, true);
    yield* satTo(sim, sh, bin.side, null);
    sh.state = 'TRANSPORTING_TO_PORT';
    yield sim.shuttleTravel(sim.front);
    // room in the outbound buffer, and the pallet put before has rolled on
    yield { op: 'until', fn: () => buf.length < sim.cfg.bufferSize && buf.every((it) => it.pos >= sim.front + 1 - 1e-6), waitState: 'WAITING_PORT' };
    sh.state = 'HANDLING';
    yield* satTo(sim, sh, 0, 0); // the outbound buffer is on the left
    yield* satLift(sim, sh, false);
    buf.push({ bin, port: task.port, t: sim.time, pos: sim.front });
    bin.loc = 'buffer'; sh.bin = null; sh.lifts++; sim.onCycle();
    yield* satTo(sim, sh, 0, null);
  }
  function* carrierStore(sim, sh, item) {
    const aisle = sim.aisles[sh.a], bin = item.bin;
    sh.state = 'MOVING_TO_TARGET';
    yield sim.shuttleTravel(sim.front);
    yield { op: 'until', fn: () => Math.abs(item.pos - sim.front) < 1e-6 }; // rolled up to the carrier
    sh.state = 'HANDLING';
    yield* satTo(sim, sh, 1, 0); // the inbound buffer is on the right
    aisle.inBuf[sh.l].splice(aisle.inBuf[sh.l].indexOf(item), 1);
    bin.loc = 'shuttle'; bin.robot = sh.id; sh.bin = bin.id;
    yield* satLift(sim, sh, true);
    yield* satTo(sim, sh, 1, null);
    sh.state = 'STORING';
    yield sim.shuttleTravel(item.b + 0.5);
    // in front of the lane's last pallet, or at the back of an empty lane
    const d = sim.laneFront(aisle, item.l, item.s, item.b) - 1;
    sh.state = 'HANDLING';
    yield* satTo(sim, sh, item.s, d);
    yield* satLift(sim, sh, false);
    aisle.resv[sim.si(item.l, item.s, item.b)] = false;
    sim.place(bin, sh.a, item.l, item.s, item.b, d);
    sh.bin = null; sim.onCycle(); sim.kpi.stores++;
    yield* satTo(sim, sh, item.s, null);
  }

  // ---------------------------------------------------------------- simulation
  class PalletSim extends WS.ShuttleSim {
    get kind() { return 'pallet'; }
    get terms() { return TERMS; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    defaults() { return WS.PALLET_CONFIG; }
    rackShape() { return { Z0: 0.8, frontBays: Math.max(2, this.cfg.bufferSize) }; }
    createGrid() { return new PalletRacking(this.cfg, this.rackShape()); }
    createMap() { const m = super.createMap(); Object.defineProperty(m, 'mapTitle', { value: 'LEVELS × BLOCKS · fill = pallets per lane side' }); return m; }
    describe() { const c = this.cfg; return `${c.aisles} blocks × ${c.levels} levels × ${2 * this.grid.SB} lanes ${c.laneDepth} deep online · ${c.aisles * c.levels} carriers · ${c.aisles} lifts · ${this.inv.bins.length} pallets`; }
    storageCapacity() { const c = this.cfg; return c.aisles * c.levels * 2 * this.grid.SB * c.laneDepth; }
    // a pallet on the conveyors, 1.2 × 0.8 m with its long side across the
    // spurs: a station's infeed and outfeed lanes, a cell apart, just take two side by side
    convTote() { return { w: 0.46, d: 0.32, gap: 0.05 }; }
    createShuttle(id, a, l) { return new Carrier(this, id, a, l); }
    storeJob(sh, item) { return carrierStore(this, sh, item); }
    retrieveJob(sh, t) { return carrierRetrieve(this, sh, t); }
    satTravel(to) { const c = this.cfg; return { op: 'travel', prop: 'sat', to, v: c.satV / c.cellSize, a: c.satA / c.cellSize, settle: 0.2 }; }

    // ---------- lanes ----------
    // A slot per pallet position: (level, side, lane, position from the aisle).
    // A lane is reserved (resv at its position 0) while a pallet is on its way into it.
    si(l, s, b, d = 0) { return ((l * 2 + s) * this.cfg.bays + b) * this.cfg.laneDepth + d; }
    laneFront(aisle, l, s, b) { const DN = this.cfg.laneDepth; for (let d = 0; d < DN; d++) if (aisle.slot[this.si(l, s, b, d)]) return d; return DN; }
    laneCount(aisle, l, s, b) { return this.cfg.laneDepth - this.laneFront(aisle, l, s, b); }
    laneGtin(aisle, l, s, b) { const d = this.laneFront(aisle, l, s, b), id = d < this.cfg.laneDepth && aisle.slot[this.si(l, s, b, d)]; return id ? this.inv.binById.get(id).comps[0].gtin : null; }
    sideFill(a, l, s) { return this.aisles[a].count[l * 2 + s] / (this.grid.SB * this.cfg.laneDepth); }
    place(bin, a, l, s, b, d) {
      const aisle = this.aisles[a];
      aisle.slot[this.si(l, s, b, d)] = bin.id; aisle.count[l * 2 + s]++;
      Object.assign(bin, { loc: 'grid', aisle: a, level: l, side: s, bay: b, depth: d, robot: -1, port: -1 });
      bin.x = a * 4 + s * 2; bin.y = this.cfg.levels - 1 - l; // map cell
      this.grid.version++;
    }
    take(bin) {
      const aisle = this.aisles[bin.aisle];
      aisle.slot[this.si(bin.level, bin.side, bin.bay, bin.depth)] = null; aisle.count[bin.level * 2 + bin.side]--;
      this.grid.version++;
    }
    // Only the pallet at the front of its lane can be taken, and not while a
    // pallet is on its way in front of it (WS.Inventory.planLine asks).
    canReach(bin) {
      if (bin.loc !== 'grid') return true;
      const aisle = this.aisles[bin.aisle];
      return !aisle.resv[this.si(bin.level, bin.side, bin.bay)] && this.laneFront(aisle, bin.level, bin.side, bin.bay) === bin.depth;
    }
    unitDepth(bin) { return bin.loc === 'grid' ? bin.depth + 1 : 1; }
    // An order line the lane fronts cannot fill on their own: take all a
    // front pallet has left (it then leaves empty) and go on with the pallet
    // behind it, lane by lane, cheapest lanes first. The pallets behind are
    // fetched once the ones in front have gone (createRetrievals).
    drainPlan(gtin, qty) {
      const inv = this.inv, prod = inv.byGtin.get(gtin);
      if (!prod || inv.available(prod) < qty) return null;
      const lanes = new Map();
      for (const id of prod.bins) {
        const bin = inv.binById.get(id);
        if (bin.loc !== 'grid') continue;
        const k = [bin.aisle, bin.level, bin.side, bin.bay].join('|');
        if (!lanes.has(k)) lanes.set(k, []);
        lanes.get(k).push(bin);
      }
      const runs = [...lanes.values()].filter((ps) => !this.aisles[ps[0].aisle].resv[this.si(ps[0].level, ps[0].side, ps[0].bay)]).map((ps) => ps.sort((x, y) => x.depth - y.depth));
      runs.sort((x, y) => this.fetchCost(x[0]) - this.fetchCost(y[0]));
      const out = [];
      let need = qty;
      for (const ps of runs) {
        // the lane's pallets from the front, as long as each one is emptied
        if (ps[0].depth !== this.laneFront(this.aisles[ps[0].aisle], ps[0].level, ps[0].side, ps[0].bay)) continue;
        for (const bin of ps) {
          const c = bin.comps[0], take = Math.min(need, c.qty - c.reserved);
          if (take > 0) { out.push({ bin, comp: 0, qty: take }); need -= take; }
          if (need <= 0) break;
        }
        if (need <= 0) break;
      }
      return need > 0 ? null : out;
    }
    // a pallet is fetched once it is at the front of its lane
    createRetrievals() {
      for (const bin of this.binsWithRequests) {
        if (bin.loc === 'grid' && !bin.task && bin.requests.length && bin.depth !== this.laneFront(this.aisles[bin.aisle], bin.level, bin.side, bin.bay)) bin.waitFront = true;
      }
      const held = [...this.binsWithRequests].filter((b) => b.waitFront);
      for (const b of held) this.binsWithRequests.delete(b);
      super.createRetrievals();
      for (const b of held) { this.binsWithRequests.add(b); b.waitFront = false; }
    }
    // Cost of fetching a pallet for an order line: work queued on its carrier
    // and lift, how far along the transfer aisle and into the lane it is.
    fetchCost(bin) {
      if (bin.loc !== 'grid') return 10;
      const aisle = this.aisles[bin.aisle];
      return aisle.shuttles[bin.level].jobs.length * 1.5 + aisle.inQ.length * 0.5 + (this.cfg.bays - 1 - bin.bay) * 0.08 + bin.depth * 0.05;
    }

    // ---------- seeding ----------
    // Every SKU gets lanes by its demand, the fastest nearest the lifts; each
    // used lane is filled from the back with pallets of its SKU.
    seed() {
      const cfg = this.cfg, inv = this.inv, rng = this.rng, g = this.grid, A = cfg.aisles, L = cfg.levels, B = cfg.bays, SB = g.SB, DN = cfg.laneDepth;
      this.mapGrid = this.createMap();
      this.conv = []; this.convSeq = 0; this.cycleLog = [];
      this.stats = { received: 0, emptied: 0 };
      inv.seedCatalog(cfg.products, rng);
      this.aisles = [];
      for (let a = 0; a < A; a++) {
        this.aisles.push(Object.assign({ a, slot: new Array(L * 2 * B * DN).fill(null), resv: new Array(L * 2 * B * DN).fill(false), count: new Int16Array(L * 2) }, this.newAisle(a)));
      }
      const lanes = [];
      for (let a = 0; a < A; a++) for (let l = 0; l < L; l++) for (let s = 0; s < 2; s++) for (let b = 0; b < SB; b++) lanes.push({ a, l, s, b, r: this.slotRank(l, s, b) + rng() * 0.35 });
      lanes.sort((x, y) => x.r - y.r);
      // lanes per SKU by demand (every SKU at least one), the fastest SKUs first
      const prods = inv.products.slice().sort((x, y) => y.demand - x.demand), used = Math.min(lanes.length, Math.round(lanes.length * Math.min(1, cfg.rackFill * 1.2)));
      const w = prods.map((p) => Math.pow(p.demand, 0.6)), tot = w.reduce((x, y) => x + y, 0), share = prods.map((p, k) => Math.max(1, Math.round((w[k] / tot) * used)));
      let k = 0;
      const all = [], perLane = cfg.rackFill * lanes.length * DN / Math.max(1, used);
      prods.forEach((p, j) => {
        for (let n = 0; n < share[j] && k < lanes.length; n++, k++) {
          const ln = lanes[k], cnt = Math.max(1, Math.min(DN, Math.round(perLane * (0.5 + rng())))), cap = inv.compCap({ vol: cfg.palletVolume, ncomp: 1 }, p);
          for (let d = DN - cnt; d < DN; d++) {
            const bin = inv.createBin(1, { prefix: 'PL', vol: cfg.palletVolume, asset: 30 });
            inv.setComp(bin, 0, p.gtin);
            const q = Math.max(1, Math.round(cap * (0.3 + rng() * 0.7)));
            bin.comps[0].qty = q; p.onHand += q;
            this.place(bin, ln.a, ln.l, ln.s, ln.b, d);
            all.push(bin);
          }
        }
      });
      this.seedDemand();
      // replenish in whole pallets: below half a pallet, order two more
      for (const p of inv.products) { const cap = inv.compCap({ vol: cfg.palletVolume, ncomp: 1 }, p); p.min = Math.max(p.min, Math.ceil(cap * 0.5)); p.max = p.min + cap * 2; }
      // received goods arrive as new pallets (see dispatch)
      inv.planReceipt = (gtin, qty) => this.newPallets(gtin, qty);
      // too little at the lane fronts: empty the front pallets and go on behind them
      const plan = inv.planLine.bind(inv);
      inv.planLine = (gtin, qty, port) => plan(gtin, qty, port) || this.drainPlan(gtin, qty);
      this.createMachines();
      for (const r of this.fleet) r.place();
    }
    // New full pallets for a receipt line, at the receiving dock.
    newPallets(gtin, qty) {
      const inv = this.inv, prod = inv.byGtin.get(gtin), cap = inv.compCap({ vol: this.cfg.palletVolume, ncomp: 1 }, prod), plan = [];
      for (let need = qty; need > 0;) {
        const bin = inv.createBin(1, { prefix: 'PL', vol: this.cfg.palletVolume, asset: 30 }), take = Math.min(cap, need);
        bin.loc = 'dock';
        inv.setComp(bin, 0, gtin);
        bin.comps[0].incoming += take; prod.incoming += take;
        plan.push({ bin, comp: 0, qty: take }); need -= take;
      }
      return { plan, short: 0 };
    }

    // ---------- storage policy: whole lanes per SKU ----------
    // A returning pallet goes in front of pallets of its own SKU, or into an
    // empty lane; never in front of a pallet a station is waiting for. Fast
    // movers go to the lanes nearest the lift, spread over the blocks and
    // levels with the least work queued; a lane its SKU already has is
    // preferred, so SKUs do not spread over many half-empty lanes.
    chooseSlot(bin, ok) {
      const c = this.cfg, pol = c.putawayPolicy, gtin = bin.comps[0].gtin, DN = c.laneDepth;
      const target = { A: 0, B: 0.35, C: 0.75, E: 0.6 }[this.inv.binClass(bin)];
      let best = null, bestS = Infinity;
      for (const aisle of this.aisles) {
        if (ok && !ok(aisle)) continue;
        const aisleLoad = this.aisleLoad(aisle);
        for (let l = 0; l < c.levels; l++) {
          const levelLoad = this.levelLoad(aisle, l);
          for (let s = 0; s < 2; s++) for (let b = 0; b < this.grid.SB; b++) {
            if (aisle.resv[this.si(l, s, b)]) continue;
            const front = this.laneFront(aisle, l, s, b);
            if (front === 0) continue; // full
            let own = false;
            if (front < DN) {
              const fb = this.inv.binById.get(aisle.slot[this.si(l, s, b, front)]);
              if (fb.comps[0].gtin !== gtin || fb.requests.length || fb.comps[0].reserved > 0 || fb.task) continue;
              own = true;
            }
            const nd = this.slotRank(l, s, b);
            let sc;
            if (pol === 'random') sc = this.rng();
            else if (pol === 'nearest') sc = nd * 4 + aisleLoad * 2 + levelLoad * 1.5;
            else sc = Math.abs(nd - target) * 20 + aisleLoad * 2 + levelLoad * 1.5;
            if (!own) sc += 8; // keep empty lanes for SKUs that need a new one
            if (sc < bestS) { bestS = sc; best = { a: aisle.a, l, s, b }; }
          }
        }
      }
      return best;
    }

    // ---------- pallets out of the store and new ones in ----------
    // A pallet picked empty leaves the loop to the empty-pallet stacker.
    onPortOut(port, bin) {
      if (bin.requests.length || !this.inv.isEmpty(bin)) return super.onPortOut(port, bin);
      port.takeOut();
      const g = this.grid;
      port.leaving = this.convey(bin, [...this.portExit(port), { x: port.drop.x + 1.5, y: g.farY }, { x: g.stackX, y: g.farY }], () => { this.retire(bin); return true; }, false);
    }
    retire(bin) {
      const inv = this.inv, k = inv.bins.indexOf(bin);
      if (k >= 0) inv.bins.splice(k, 1);
      inv.binById.delete(bin.id); inv.binByGrai.delete(bin.grai);
      bin.loc = 'void'; this.stats.emptied++;
      this.emptyStack = (this.emptyStack || 0) + 1;
      this.log('inbound', `Pallet ${bin.id} empty: to the empty-pallet stacker`);
    }
    // the conveyor runs, with the dock's and the stacker's (for the views)
    preZoneLines() {
      const g = this.grid;
      return [...super.preZoneLines(), [{ x: g.dockX, y: g.farY }, { x: g.loopX0, y: g.farY }], [{ x: g.loopX1, y: g.farY }, { x: g.stackX, y: g.farY }]];
    }
    // No more onto the loop than it can take: one pallet at a time from the dock.
    dispatch() {
      super.dispatch();
      const g = this.grid;
      for (const bin of this.binsWithRequests) {
        if (bin.loc !== 'dock' || bin.task || !bin.requests.length) continue;
        const port = this.ports[bin.requests[0].port];
        if (this.portFull(port) || this.loopRoom() <= 0 || !this.convFree(g.dockX, g.farY)) continue;
        bin.task = { type: 'RECEIVE' }; port.inbound++; this.stats.received++;
        this.toPort(bin, [{ x: g.dockX, y: g.farY }, { x: port.drop.x + 0.5, y: g.farY }, { x: port.drop.x + 0.5, y: g.D }], port);
        this.log('inbound', `Pallet ${bin.id} from the receiving dock to ${port.code}`);
      }
    }
  }

  WS.PalletSim = PalletSim;
  WS.PalletRacking = PalletRacking;
})((globalThis.WS = globalThis.WS || {}));
