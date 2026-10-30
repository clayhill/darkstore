/* SortHub: a robot sorter (specs/sort.txt). Small robots on a raised deck
 * each carry one parcel from an induct to its chute and tip it through a hole
 * into the bag below; with every chute of its destination full the parcel
 * goes to the overflow (reject) chute. One-way streets between the holes;
 * battery robots with the shared routing and charging. The parcel stream,
 * inducts, chutes and bags are those of every parcel sorter (js/hub/sim.js). */
(function (WS) {
  'use strict';
  const C = Object.assign(WS.CELL, { PARK: WS.CELL.PARK ?? 7 }); // the same number as the other floors' parking
  const STATE_LABELS = { MOVING_TO_TARGET: 'To chute', TRANSPORTING_TO_PORT: 'To induct', AT_PORT: 'At induct', HANDLING: 'Tipping', WAITING_PORT: 'Waiting (induct or full chute)' };
  const LEGEND = ['IDLE', 'TRANSPORTING_TO_PORT', 'AT_PORT', 'MOVING_TO_TARGET', 'HANDLING', 'WAITING_IN_TRAFFIC', 'WAITING_PORT', 'TO_CHARGER', 'CHARGING'];

  // ---------------------------------------------------------------- floor
  // The deck robots drive on: rows 1 … D-2, a chute hole every third cell, the
  // induct lanes along the front row (each followed by an exit cell) and
  // chargers and parking in the back row.
  class DeckFloor extends WS.HubFloor {
    constructor(cfg) {
      const K = cfg.inducts, n = cfg.chutes, nx = Math.ceil(Math.sqrt(n * 1.5)), ny = Math.ceil(n / nx), L = cfg.stationLane;
      super(cfg, Math.max(3 * nx + 2, (L + 3) * K + 3), 3 * ny + 3);
      Object.assign(this, { nx, ny });
      this.layoutDeck(cfg);
    }
    layoutDeck(cfg) {
      const { W, D } = this, L = cfg.stationLane;
      for (let y = 1; y <= D - 2; y++) for (let x = 0; x < W; x++) this.type[this.idx(x, y)] = C.HIGHWAY;
      this.holes = [];
      for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) if (this.holes.length < cfg.chutes) this.holes.push({ x: 2 + 3 * i, y: 2 + 3 * j });
      for (const h of this.holes) this.type[this.idx(h.x, h.y)] = C.STORAGE;
      // Inducts along the front, each a pass-through: robots come down a
      // southbound street into the lane and leave straight on to the right,
      // onto a northbound street (s is a multiple of 3, so column s+1 runs north).
      for (let k = 0; k < cfg.inducts; k++) {
        const s = (L + 3) * (k + 1), lane = [];
        for (let j = L; j >= 1; j--) lane.push({ x: s - j, y: D - 1 });
        const docks = [{ lane, entry: { x: s - L, y: D - 2 }, end: { x: s, y: D - 1 } }];
        this.addStation({ kind: 'INDUCT', face: 'front', drop: docks[0].end, lift: { x: s, y: D - 2 }, points: 1, docks }, docks[0].end);
        this.type[this.idx(s + 1, D - 1)] = C.HIGHWAY;
      }
      for (let k = 0; k < cfg.chargers; k++) {
        const x = Math.min(W - 1, Math.max(0, Math.round(((k + 0.5) * W) / cfg.chargers)));
        this.type[this.idx(x, 0)] = C.CHARGER;
        this.chargers.push({ id: k, x, y: 0, robot: -1 });
      }
      // the rest of the back row: parking for robots with nothing to do
      for (let x = 0; x < W; x++) if (this.type[this.idx(x, 0)] === C.BLOCKED) this.type[this.idx(x, 0)] = C.PARK;
    }
    // ---------- traffic rules ----------
    // One-way streets between the holes: of the two rows between hole rows
    // the first runs east (+x), the second west; of the two columns between
    // hole columns the first runs south (+y, to the front), the second north.
    // A cell beside a hole lies on one street only. Leaving the charger row
    // and the induct exits along the front is always allowed.
    oneWay(i, from) {
      if (from == null) return true;
      const x = this.cx(i), y = this.cy(i), fx = this.cx(from), fy = this.cy(from), dx = x - fx, dy = y - fy;
      if (fy === 0 || fy === this.D - 1) return true;
      if (dx) return fy % 3 !== 2 && (fy % 3 === 0 ? dx > 0 : dx < 0);
      return fx % 3 !== 2 && (fx % 3 === 0 ? dy > 0 : dy < 0);
    }
    // Crossings (a row street meets a column street): no stopping inside, so
    // a robot never blocks the crossing traffic (see WS.Router.step).
    noStop(i) { const x = this.cx(i), y = this.cy(i); return this.type[i] === C.HIGHWAY && y > 0 && y < this.D - 1 && x % 3 !== 2 && y % 3 !== 2; }
    passable(i, r, from) {
      const t = this.type[i];
      if (t === C.HIGHWAY) return this.oneWay(i, from);
      if (t === C.LANE) return from != null && this.laneEnter(i, from);
      return false;
    }
    enterGoal(i, r, from) {
      const t = this.type[i];
      if (t === C.LANE || t === C.PORT) return this.laneEnter(i, from);
      if (t === C.HIGHWAY) return this.oneWay(i, from);
      return t === C.CHARGER || t === C.PARK;
    }
    canPark(i) { return this.type[i] === C.PARK; }
    get mapTitle() { return 'DECK · chutes by bag fill, red = full'; }
  }

  // ---------------------------------------------------------------- robot tasks
  const T = { CHARGE: WS.Tasks.CHARGE, YIELD: WS.Tasks.YIELD, PARK: WS.Tasks.PARK };
  // Queue at an induct, take the parcel the operator has ready, drive to a
  // cell beside its chute's hole, wait while the bag is full, tip it in.
  T.SORT = function* (sim, r, t) {
    const port = sim.ports[t.port], g = sim.grid;
    r.state = 'TRANSPORTING_TO_PORT';
    yield* WS.Tasks.throughLane(sim, r, port.docks[0]);
    r.state = 'AT_PORT';
    yield { op: 'until', fn: () => !!port.ready, waitState: 'WAITING_PORT' };
    const parcel = port.ready;
    port.ready = null; sim.loaded(parcel, port); r.parcel = parcel; parcel.at = 'robot ' + r.name;
    yield { op: 'wait', t: 0.4 };
    // A chute that filled up on the way is chosen again on arrival. With
    // nowhere to go, not even the overflow chute, the robot waits in the
    // parking row, never in a street, where it would block the traffic.
    let ch, spot;
    for (;;) {
      ch = sim.chuteFor(parcel, r);
      if (!sim.hasRoom(ch)) {
        const since = sim.time, i = sim.parkingCell(r);
        r.state = 'WAITING_PORT';
        if (i >= 0) { t.park = i; yield { op: 'move', x: g.cx(i), y: g.cy(i) }; t.park = null; }
        yield { op: 'until', fn: () => sim.hasRoom(sim.chuteFor(parcel, r)), waitState: 'WAITING_PORT' };
        sim.stats.fullWait += sim.time - since;
        continue;
      }
      spot = sim.dropSpot(ch, r); t.chute = ch;
      r.state = 'MOVING_TO_TARGET';
      yield { op: 'move', x: spot.x, y: spot.y };
      if (sim.hasRoom(ch)) break;
    }
    ch.coming++; // its place in the bag, so a second robot arriving now finds it full
    r.state = 'HANDLING';
    r.busy = true; r.tip = sim.time;
    yield { op: 'wait', t: sim.cfg.tipTime };
    r.busy = false; r.tip = null; r.parcel = null; r.lifts++;
    ch.coming--;
    sim.sorted(parcel, ch, { x: spot.x + 0.5, y: spot.y + 0.5 });
  };

  // ---------------------------------------------------------------- simulation
  class SortSim extends WS.HubSim {
    get kind() { return 'sort'; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    get taskTypes() { return T; }
    defaults() { return WS.SORT_CONFIG; }
    createGrid() { const g = new DeckFloor(this.cfg); g.sim = this; return g; }
    describe() { const c = this.cfg; return `Robot sorter online · ${c.inducts} inducts · ${this.chutes.length} chutes for ${c.destinations} destinations · ${this.fleet.length} robots`; }

    chuteSpots() { return this.grid.holes; }
    chuteAt(s) { return { x: s.x + 0.5, y: s.y + 0.5 }; }
    // bag workers start at the far end, under the deck
    workerStart(k) { return { x: this.grid.W + 0.8, y: 2 + k * 2 }; }
    seedSorter() {
      const cfg = this.cfg, g = this.grid, free = [];
      for (let y = 1; y < g.D - 1; y++) for (let x = 0; x < g.W; x++) if (g.type[g.idx(x, y)] === C.HIGHWAY && (x + y) % 2 === 0) free.push({ x, y });
      for (let k = 0; k < cfg.robots && k < free.length; k++) {
        const c = free[Math.floor((k * free.length) / cfg.robots)];
        const r = new WS.Robot(this, k, c.x, c.y);
        r.parcel = null;
        this.fleet.push(r);
      }
    }
    onSorter() { return this.fleet.filter((r) => r.parcel).length; }

    // The destination's chute with room nearest the robot; with all of them
    // full the parcel goes to the overflow (reject) chute, as a tray would go
    // round again.
    chuteFor(parcel, r) {
      const open = this.chutesFor(parcel).filter((c) => this.hasRoom(c));
      const d = (c) => Math.abs(c.x - r.x) + Math.abs(c.y - r.y);
      if (!open.length) { if (!parcel.target) { this.stats.recirculated++; parcel.target = this.reject; } return this.reject; }
      return open.reduce((a, b) => (d(b) < d(a) ? b : a));
    }
    // the deck cell beside a chute's hole the robot tips from: the free one nearest it
    dropSpot(ch, r) {
      const g = this.grid, hx = Math.floor(ch.x), hy = Math.floor(ch.y);
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: hx + dx, y: hy + dy })).filter((c) => g.inside(c.x, c.y) && g.type[g.idx(c.x, c.y)] === C.HIGHWAY);
      const score = (c) => Math.abs(c.x - r.x) + Math.abs(c.y - r.y) + (g.claim[g.idx(c.x, c.y)] >= 0 ? 6 : 0) + this.fleet.filter((o) => o.task && o.task.spot && o.task.spot.x === c.x && o.task.spot.y === c.y).length * 4;
      const best = opts.reduce((a, b) => (score(b) < score(a) ? b : a));
      if (r.task) r.task.spot = best;
      return best;
    }

    // ---------------------------------------------------------------- dispatch
    // Robots: to the induct with the fewest robots heading there for its
    // parcels, no more than its lane holds and a few on their way; the rest
    // park at the back.
    dispatch() {
      super.dispatch();
      this.dispatchCharging();
      const idle = [];
      for (const r of this.idleRobots()) {
        let best = null, bs = Infinity;
        for (const p of this.ports) {
          const heading = this.fleet.filter((o) => o.task && o.task.type === 'SORT' && o.task.port === p.idx && !o.parcel).length;
          if (heading > this.cfg.stationLane + 3) continue;
          const s = heading - (p.queue.length + (p.cur ? 1 : 0) + (p.ready ? 1 : 0)) * 0.25 + WS.U.manhattan(r.x, r.y, p.drop.x, p.drop.y) * 0.02;
          if (s < bs) { bs = s; best = p; }
        }
        if (best) this.assignTask(r, { type: 'SORT', port: best.idx, priority: 5 }); else idle.push(r);
      }
      this.parkIdle(idle);
    }
    needsParking(r) { return !this.grid.canPark(this.grid.idx(r.x, r.y)); }
    parkingCell(r) {
      const g = this.grid, taken = new Set(this.fleet.filter((o) => o !== r && o.task).map((o) => (o.task.type === 'PARK' ? g.idx(o.task.x, o.task.y) : o.task.park ?? -1)));
      let best = -1, bd = Infinity;
      for (let x = 0; x < g.W; x++) {
        const i = g.idx(x, 0);
        if (!g.canPark(i) || taken.has(i) || (g.claim[i] >= 0 && g.claim[i] !== r.id)) continue;
        const d = Math.abs(x - r.x) + r.y;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
  }

  WS.SortSim = SortSim;
  WS.SortFloor = DeckFloor;
})((globalThis.WS = globalThis.WS || {}));
