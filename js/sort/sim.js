/* SortHub: a parcel sorter. Parcels arrive in a stream, each for one of a
 * set of destinations (a few take most of the volume); operators at the
 * inducts scan them and put them on the sorter, which drops each into a
 * chute for its destination. Every chute ends in a bag; bag workers change
 * full bags, and a parcel whose chute is full has to wait. Labels the
 * scanner cannot read go to a reject chute.
 * Two sorters, a setting, so they can be compared on the same stream:
 *  tray    a tilt-tray loop: trays run round past the chutes and tip their
 *          parcel into the right one; when that chute is full the parcel
 *          goes round again, and after maxLaps to the reject chute.
 *  robots  a robot sorter: small robots on a raised deck each carry one
 *          parcel from an induct to its chute and tip it through a hole into
 *          the bag below; with every chute of its destination full the
 *          parcel goes to the overflow (reject) chute. One-way streets
 *          between the holes; battery robots with the shared routing and
 *          charging.
 * There is no stock and no orders: the shared order flow stays idle. */
(function (WS) {
  'use strict';
  const C = Object.assign(WS.CELL, { PARK: WS.CELL.PARK ?? 7 }); // the same number as the other floors' parking
  const TERMS = { unit: 'parcel', Unit: 'Parcel', units: 'parcels', Units: 'Parcels', store: 'sorter', Store: 'Sorter', port: 'induct', ports: 'inducts', starve: 'parcels', flow1: 'Parcels inducted /h', flow2: 'Parcels sorted /h' };
  const STATE_LABELS = { MOVING_TO_TARGET: 'To chute', TRANSPORTING_TO_PORT: 'To induct', AT_PORT: 'At induct', HANDLING: 'Tipping', WAITING_PORT: 'Waiting (induct or full chute)' };
  const LEGEND = ['IDLE', 'TRANSPORTING_TO_PORT', 'AT_PORT', 'MOVING_TO_TARGET', 'HANDLING', 'WAITING_IN_TRAFFIC', 'WAITING_PORT', 'TO_CHARGER', 'CHARGING'];
  const PLACES = ['Brussels', 'Antwerpen', 'Gent', 'Leuven', 'Liège', 'Brugge', 'Namur', 'Mechelen', 'Hasselt', 'Kortrijk', 'Aalst', 'Mons', 'Charleroi', 'Oostende', 'Genk', 'Amsterdam', 'Rotterdam', 'Utrecht', 'Eindhoven', 'Lille', 'Paris', 'Reims', 'Köln', 'Aachen', 'Düsseldorf', 'Luxembourg', 'Maastricht', 'Breda', 'Tilburg', 'Arnhem', 'Groningen', 'Zwolle', 'Calais', 'Metz', 'Trier', 'Bonn', 'Essen', 'Dortmund', 'Nijmegen', 'Den Haag'];

  // ---------------------------------------------------------------- floor
  // The floor in cells: for the tray sorter the loop, its chutes and the
  // inducts (as a map, nothing drives on it); for the robot sorter the deck
  // robots drive on, with a hole per chute, induct lanes along the front and
  // chargers along the back.
  class SortFloor extends WS.RobotFloor {
    constructor(cfg) {
      const K = cfg.inducts, n = cfg.chutes;
      let W, D;
      if (cfg.mechanism === 'robots') {
        const nx = Math.ceil(Math.sqrt(n * 1.5)), ny = Math.ceil(n / nx), L = cfg.stationLane;
        W = Math.max(3 * nx + 2, (L + 3) * K + 3); D = 3 * ny + 3;
        super(W, D, C.BLOCKED);
        Object.assign(this, { nx, ny });
      } else {
        // top straight: the inducts, then chutes; bottom straight: the rest of the chutes
        const slots = Math.ceil((n + K) / 2), S = 2 * slots + 2;
        W = S + 12; D = 15;
        super(W, D, C.BLOCKED);
        Object.assign(this, { slots, S, X0: 4, X1: 4 + S, Yt: 5, Yb: 9, r: 2 });
        this.Lp = 2 * S + 2 * Math.PI * this.r; // loop length (cells)
      }
      this.cfg = cfg; this.Z = 6; this.chuteAt = new Int16Array(W * D).fill(-1);
      if (cfg.mechanism === 'robots') this.layoutDeck(cfg); else this.layoutLoop(cfg);
    }
    depthOf() { return 1; }
    isStorage(i) { return this.type[i] === C.STORAGE; }

    // Tray loop: chute and induct slot k on the top straight at x = X0+1.5+2k
    // (an induct takes the first K slots), on the bottom straight from the
    // right end. Loop position u runs along the top straight to the right,
    // round the right end, back along the bottom and round the left end.
    layoutLoop(cfg) {
      const { X0, X1, Yt, Yb } = this, K = cfg.inducts;
      for (let x = X0; x < X1; x++) for (const y of [Yt, Yb]) this.type[this.idx(x, y)] = C.HIGHWAY;
      for (let y = Yt; y <= Yb; y++) { this.type[this.idx(X0 - 1, y)] = C.HIGHWAY; this.type[this.idx(X1, y)] = C.HIGHWAY; }
      this.slotsTop = []; this.slotsBottom = [];
      for (let k = 0; k < this.slots; k++) {
        this.slotsTop.push({ x: X0 + 1.5 + 2 * k, y: Yt - 2, u: 1.5 + 2 * k, side: 0 });
        this.slotsBottom.push({ x: X1 - 1.5 - 2 * k, y: Yb + 2, u: this.S + Math.PI * this.r + 1.5 + 2 * k, side: 1 });
      }
      for (let k = 0; k < K; k++) {
        const s = this.slotsTop[k], cx = Math.floor(s.x), cell = { x: cx, y: s.y };
        this.type[this.idx(cx, s.y)] = C.PORT;
        this.ports.push({ kind: 'INDUCT', face: 'front', drop: cell, lift: cell, cells: [cell], slot: s });
      }
    }
    // Where loop position u is: { x, y, a } with a the direction of travel.
    loopAt(u) {
      const { X0, X1, Yt, Yb, S, r } = this, my = (Yt + Yb) / 2, arc = Math.PI * r;
      u = ((u % this.Lp) + this.Lp) % this.Lp;
      if (u < S) return { x: X0 + u, y: Yt, a: 0 };
      if (u < S + arc) { const t = (u - S) / r; return { x: X1 + r * Math.sin(t), y: my - r * Math.cos(t), a: t }; }
      if (u < 2 * S + arc) return { x: X1 - (u - S - arc), y: Yb, a: Math.PI };
      const t = (u - 2 * S - arc) / r;
      return { x: X0 - r * Math.sin(t), y: my + r * Math.cos(t), a: Math.PI + t };
    }

    // Robot deck: rows 1 … D-2 are deck, a chute hole every third cell, the
    // induct lanes along the front row (each followed by an exit cell) and
    // chargers and parking in the back row.
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
    // ---------- traffic rules (robot deck) ----------
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

    // Control-room map: chutes by how full their bag is, inducts in amber.
    mapFill(i, mix) {
      const t = this.type[i], k = this.chuteAt[i];
      if (k >= 0) { const ch = this.sim.chutes[k]; return ch.swapping ? '#a16207' : mix('#16324f', '#dc2626', Math.min(1, ch.count / this.cfg.bagCapacity)); }
      return { [C.HIGHWAY]: '#1b2536', [C.PORT]: '#3a2a0a', [C.LANE]: '#2a2208', [C.CHARGER]: '#0f3321' }[t] || '#070b12';
    }
    get mapTitle() { return this.cfg.mechanism === 'robots' ? 'DECK · chutes by bag fill, red = full' : 'LOOP · chutes by bag fill, red = full · dots: trays, coloured as in Tray occupancy'; }
  }

  // ---------------------------------------------------------------- induct
  // An operator takes the next parcel off the feed belt, scans it and puts
  // it ready on the induct (`ready`), where the sorter takes it: an empty
  // tray passing, or the robot standing at the induct. The operator scans
  // the next one meanwhile and holds it until the induct is clear.
  class Induct extends WS.Port {
    constructor(sim, idx, def) {
      super(sim, idx, def);
      this.name = 'Induct ' + (idx + 1); this.code = 'I' + String(idx + 1).padStart(2, '0');
      this.queue = []; this.cur = null; this.t = 0; this.ready = null; this.done = 0;
    }
    // the shared views show a station as working while it has a job
    get job() { return this.cur ? { lines: [null], next: 0, t: 0, total: 1 } : null; }
    set job(v) {}
    update(dt) {
      const sim = this.sim;
      this.stats.t += dt;
      if (!this.cur && this.queue.length) { this.cur = this.queue.shift(); this.t = sim.cfg.inductTime; sim.scanned(this.cur, this); }
      let starved = 0;
      if (this.cur && this.t > 0) { this.stats.busy += dt; this.t -= dt; }
      if (this.cur && this.t <= 0) {
        if (!this.ready) { this.ready = this.cur; this.cur = null; } else this.stats.blocked += dt; // holding the next parcel
      } else if (!this.cur && !this.ready) { this.stats.starved += dt; starved = 1; }
      const f = Math.exp(-dt / 180);
      this.recentStarve = this.recentStarve * f + starved * (1 - f);
    }
  }

  // ---------------------------------------------------------------- bag workers
  // People who change full bags: they walk to the chute, swap the bag and
  // stay there until the next one fills.
  class BagWorker {
    constructor(sim, k, x, y) {
      Object.assign(this, { sim, id: k, name: 'Bags ' + (k + 1), x, y, px: x, py: y, path: [], chute: null, state: 'IDLE', t: 0, bags: 0, distance: 0 });
      this.stateTime = { IDLE: 0, WALKING: 0, SWAPPING: 0 };
    }
    update(dt) {
      const sim = this.sim, ch = this.chute;
      this.px = this.x; this.py = this.y;
      if (this.state === 'WALKING') {
        let m = (sim.cfg.walkSpeed / sim.cfg.cellSize) * dt;
        while (m > 1e-9 && this.path.length) {
          const p = this.path[0], dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
          if (d <= m) { this.x = p.x; this.y = p.y; m -= d; this.distance += d; this.path.shift(); } else { this.x += (dx / d) * m; this.y += (dy / d) * m; this.distance += m; m = 0; }
        }
        if (!this.path.length) { this.state = 'SWAPPING'; this.t = sim.cfg.bagSwap; ch.swapping = true; }
      } else if (this.state === 'SWAPPING') {
        this.t -= dt;
        if (this.t <= 0) {
          ch.swapping = false; ch.worker = null; ch.count = 0; ch.bags++; this.bags++; sim.stats.bags++;
          this.chute = null; this.state = 'IDLE';
          sim.log('pack', `${ch.name}: bag changed (${ch.dest ? ch.dest.name : 'reject'})`);
        }
      }
      this.stateTime[this.state] += dt;
    }
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
    sim.sorted(parcel, ch, { x: spot.x + 0.5, y: spot.y + 0.5 });
  };

  // ---------------------------------------------------------------- simulation
  class SortSim extends WS.Sim {
    get kind() { return 'sort'; }
    get terms() { return TERMS; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    get taskTypes() { return T; }
    get armsAllowed() { return false; }
    defaults() { return WS.SORT_CONFIG; }
    createGrid() { const g = new SortFloor(this.cfg); g.sim = this; return g; }
    createPort(k, def) { return new Induct(this, k, def); }
    get tray() { return this.cfg.mechanism !== 'robots'; }
    describe() { const c = this.cfg; return `${this.tray ? 'Tilt-tray loop' : 'Robot sorter'} online · ${c.inducts} inducts · ${this.chutes.length} chutes for ${c.destinations} destinations${this.tray ? ` · ${this.trays.length} trays` : ` · ${this.fleet.length} robots`}`; }
    storageCapacity() { return this.chutes.length * this.cfg.bagCapacity; }
    fetchCost() { return 0; }

    seed() {
      const cfg = this.cfg, g = this.grid;
      this.parcelSeq = 1; this.arrivalAcc = 0; this.nextGap = undefined; this.backlog = [];
      this.drops = []; // parcels falling into chutes, for the views
      this.stats = { arrived: 0, inducted: 0, sorted: 0, recirculated: 0, rejected: 0, noRead: 0, laps: 0, bags: 0, fullWait: 0 };
      // destinations: shares falling off with rank, so a few take most of the volume
      const nd = Math.max(1, cfg.destinations), w = [];
      for (let d = 0; d < nd; d++) w.push(1 / Math.pow(d + 1, 0.8));
      const tot = w.reduce((a, b) => a + b, 0);
      this.dests = w.map((x, d) => ({ id: d, name: `${String(d + 1).padStart(2, '0')} ${PLACES[d % PLACES.length]}${d >= PLACES.length ? ' ' + (1 + Math.floor(d / PLACES.length)) : ''}`, share: x / tot, chutes: [], sorted: 0 }));
      this.destW = this.dests.map((d) => d.share);
      // chutes: the last one rejects; the rest one per destination, the busiest get a second, third …
      const spots = this.tray ? [...g.slotsTop.slice(cfg.inducts), ...g.slotsBottom] : g.holes;
      const n = Math.min(cfg.chutes, spots.length), owner = [];
      for (let k = 0; k < n - 1; k++) owner.push(k < nd ? k : (k - nd) % nd);
      this.chutes = spots.slice(0, n).map((s, k) => {
        const dest = k < n - 1 ? this.dests[owner[k]] : null;
        const ch = { id: k, name: 'Chute ' + (k + 1), dest, x: s.x + (this.tray ? 0 : 0.5), y: s.y + (this.tray ? 0 : 0.5), u: s.u, side: s.side, cell: s, count: 0, coming: 0, bags: 0, worker: null, swapping: false, sorted: 0 };
        if (dest) dest.chutes.push(ch);
        g.chuteAt[g.idx(Math.floor(s.x), Math.floor(s.y))] = k;
        return ch;
      });
      this.reject = this.chutes[this.chutes.length - 1];
      this.unserved = this.dests.filter((d) => !d.chutes.length); // too few chutes: those go to the reject chute
      // bag workers start at the far end
      this.workers = [];
      for (let k = 0; k < cfg.bagWorkers; k++) {
        const p = this.tray ? { x: g.X1 + 3.5, y: k % 2 ? g.Yb + 3.4 : g.Yt - 3.4 } : { x: g.W + 0.8, y: 2 + k * 2 };
        this.workers.push(new BagWorker(this, k, p.x, p.y));
      }
      if (this.tray) {
        const pitch = cfg.trayPitch / cfg.cellSize, nt = Math.floor(g.Lp / pitch);
        this.trayPitch = g.Lp / nt; this.offset = 0;
        this.trays = Array.from({ length: nt }, (_, k) => ({ id: k, parcel: null, tilt: -1e9 }));
        // loop positions where something happens, in order
        this.points = [...this.ports.map((p) => ({ u: p.slot.u, port: p })), ...this.chutes.map((ch) => ({ u: ch.u, chute: ch })), { u: 0, lap: true }].sort((a, b) => a.u - b.u);
      } else {
        this.trays = [];
        const free = [];
        for (let y = 1; y < g.D - 1; y++) for (let x = 0; x < g.W; x++) if (g.type[g.idx(x, y)] === C.HIGHWAY && (x + y) % 2 === 0) free.push({ x, y });
        for (let k = 0; k < cfg.robots && k < free.length; k++) {
          const c = free[Math.floor((k * free.length) / cfg.robots)];
          const r = new WS.Robot(this, k, c.x, c.y);
          r.parcel = null;
          this.fleet.push(r);
        }
      }
    }

    // ---------------------------------------------------------------- parcels
    newParcel() {
      const d = this.dests[this.rng.weighted(this.destW, 1)], id = this.parcelSeq++;
      return { id, sscc: WS.Barcode.makeSSCC(500000 + id), dest: d, noRead: this.rng() < this.cfg.noRead, laps: 0, t0: this.time, at: 'feed', size: 0.75 + this.rng() * 0.5, hue: Math.floor(this.rng() * 50) + 20 };
    }
    // Arrivals (Poisson) go to the induct with the shortest feed; when every
    // feed is full they wait at the inbound dock.
    arrivals(dt) {
      const rate = this.cfg.parcelRate / 3600;
      if (rate <= 0) return;
      this.arrivalAcc += dt;
      if (this.nextGap === undefined) this.nextGap = -Math.log(1 - this.rng()) / rate;
      while (this.arrivalAcc >= this.nextGap) {
        this.arrivalAcc -= this.nextGap;
        this.nextGap = -Math.log(1 - this.rng()) / rate;
        this.backlog.push(this.newParcel()); this.stats.arrived++;
      }
      while (this.backlog.length) {
        // the feed with the fewest parcels, then the induct that has done fewest
        const load = (q) => q.queue.length + (q.cur ? 1 : 0) + (q.ready ? 1 : 0), p = this.ports.reduce((a, b) => (load(b) < load(a) || (load(b) === load(a) && b.done < a.done) ? b : a));
        if (p.queue.length >= this.cfg.inductQueue) break;
        p.queue.push(this.backlog.shift());
      }
    }
    // The induct scanner reads the label; an unreadable one goes to the reject chute.
    scanned(parcel, port) {
      parcel.at = port.code;
      if (parcel.noRead) { this.stats.noRead++; parcel.target = this.reject; } else parcel.target = parcel.dest.chutes.length ? null : this.reject;
    }
    loaded(parcel, port) { port.done++; port.stats.presented++; this.stats.inducted++; this.kpi.presented++; this.kpi.push('presented'); }
    sorted(parcel, ch, from) {
      ch.count++; ch.sorted++;
      if (!this.tray) ch.coming--;
      if (ch === this.reject) this.stats.rejected++; else parcel.dest.sorted++;
      this.stats.sorted++; this.kpi.push('lines'); this.kpi.linesPicked++;
      if (parcel.laps) this.stats.laps += parcel.laps;
      this.drops.push({ parcel, from, to: { x: ch.x, y: ch.y }, t: this.time, chute: ch });
      if (this.drops.length > 60) this.drops.shift();
      if (ch.count >= this.cfg.bagCapacity) this.log('warn', `${ch.name} (${ch.dest ? ch.dest.name : 'reject'}): bag full`);
    }
    // chutes a parcel may go into: its destination's, or the reject chute
    chutesFor(parcel) { return parcel.target ? [parcel.target] : parcel.dest.chutes; }
    hasRoom(ch) { return ch.count + ch.coming < this.cfg.bagCapacity && !ch.swapping; }
    // Robot sorter: the destination's chute with room nearest the robot; with
    // all of them full the parcel goes to the overflow (reject) chute, as a
    // tray would go round again.
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

    // ---------------------------------------------------------------- tray loop
    // Trays move round the loop at loop speed. A tray passing an induct takes
    // the parcel ready there if it is empty; passing one of its parcel's
    // chutes, it tips the parcel in if the bag has room. A parcel that
    // passes the start of the loop again has done a lap; after maxLaps it
    // goes to the reject chute.
    stepTrays(dt) {
      const cfg = this.cfg, g = this.grid, v = (cfg.loopSpeed / cfg.cellSize) * dt, P = this.points;
      const prev = this.offset;
      this.offset = (this.offset + v) % g.Lp;
      for (const tr of this.trays) {
        const u0 = (prev + tr.id * this.trayPitch) % g.Lp;
        for (const pt of P) {
          const du = (pt.u - u0 + g.Lp) % g.Lp;
          if (du >= v) continue;
          const p = tr.parcel;
          if (pt.port) {
            if (!p && pt.port.ready) { tr.parcel = pt.port.ready; pt.port.ready = null; tr.parcel.at = 'tray ' + (tr.id + 1); this.loaded(tr.parcel, pt.port); }
          } else if (pt.lap) {
            if (p) {
              p.laps++;
              if (p.laps === 1 && !p.target) this.stats.recirculated++;
              if (p.laps >= cfg.maxLaps && p.target !== this.reject) { p.target = this.reject; this.log('warn', `Parcel ${p.id} for ${p.dest.name}: chute full ${cfg.maxLaps} laps, to reject`); }
            }
          } else if (p && this.chutesFor(p).includes(pt.chute) && this.hasRoom(pt.chute)) {
            tr.parcel = null; tr.tilt = this.time;
            const at = g.loopAt(pt.u);
            this.sorted(p, pt.chute, at);
          }
        }
      }
    }
    trayAt(tr, alpha = 1) { const g = this.grid; return g.loopAt(this.offset + tr.id * this.trayPitch - (1 - alpha) * (this.cfg.loopSpeed / this.cfg.cellSize) * this.cfg.tick); }
    trayState(tr) { const p = tr.parcel; return !p ? 'empty' : p.target === this.reject ? 'reject' : p.laps ? 'round' : 'carry'; }
    // The control room has no robots to show for the tray loop: its time
    // split chart, table and map show the trays instead.
    get timeSplit() {
      if (!this.tray) return null;
      return (this._split = this._split || {
        title: 'Tray occupancy', table: 'Loaded trays',
        series: [{ k: 'carry', label: 'Carrying', slot: 's1' }, { k: 'round', label: 'Going round', slot: 's2' }, { k: 'reject', label: 'To reject', slot: 's4' }, { k: 'empty', label: 'Empty', slot: 's3' }],
        sample: () => {
          const n = { carry: 0, round: 0, reject: 0, empty: 0 };
          for (const tr of this.trays) n[this.trayState(tr)]++;
          for (const k in n) n[k] /= this.trays.length || 1;
          return n;
        },
      });
    }
    mapMarks(alpha) {
      if (!this.tray) return [];
      return this.trays.map((tr) => { const q = this.trayAt(tr, alpha); return { x: q.x, y: q.y, state: this.trayState(tr) }; });
    }

    // ---------------------------------------------------------------- bag workers
    // Each full bag gets the nearest free bag worker. On the tray sorter they
    // walk along the aisles outside the chutes (round the far end to change
    // sides); under the robot deck they walk straight.
    dispatchWorkers() {
      const cap = this.cfg.bagCapacity;
      for (const ch of this.chutes) {
        if (ch.worker || ch.count < cap) continue;
        const free = this.workers.filter((w) => !w.chute);
        if (!free.length) return;
        const w = free.reduce((a, b) => (Math.abs(b.x - ch.x) + Math.abs(b.y - ch.y) < Math.abs(a.x - ch.x) + Math.abs(a.y - ch.y) ? b : a));
        w.chute = ch; ch.worker = w; w.state = 'WALKING'; w.path = this.workerPath(w, ch);
      }
    }
    servicePoint(ch) { const g = this.grid; return this.tray ? { x: ch.x, y: ch.side ? g.Yb + 3.4 : g.Yt - 3.4 } : { x: ch.x + 0.35, y: ch.y + 0.35 }; }
    workerPath(w, ch) {
      const g = this.grid, sp = this.servicePoint(ch);
      if (!this.tray) return [sp];
      const top = g.Yt - 3.4, bot = g.Yb + 3.4, onTop = Math.abs(w.y - top) < Math.abs(w.y - bot), toTop = !ch.side;
      if (onTop === toTop) return [{ x: w.x, y: toTop ? top : bot }, sp];
      const ex = g.X1 + 3.5;
      return [{ x: w.x, y: onTop ? top : bot }, { x: ex, y: onTop ? top : bot }, { x: ex, y: toTop ? top : bot }, sp];
    }

    // ---------------------------------------------------------------- dispatch
    // Robots: to the induct with the fewest robots heading there for its
    // parcels, no more than its lane holds and a few on their way; the rest
    // park at the back.
    dispatch() {
      this.dispatchWorkers();
      if (this.tray) return;
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
    extraAlerts() {
      const out = [], cap = this.cfg.bagCapacity, full = this.chutes.filter((c) => c.count >= cap);
      if (full.length >= Math.max(2, this.workers.length + 1)) out.push({ sev: full.length > this.workers.length * 3 ? 'critical' : 'warning', key: 'bags', title: 'Full bags waiting', msg: `${full.length} chutes full · ${this.workers.length} bag workers` });
      if (this.backlog.length > 20) out.push({ sev: this.backlog.length > 200 ? 'critical' : 'warning', key: 'backlog', title: 'Induction backlog', msg: `${this.backlog.length} parcels waiting at the inbound dock` });
      return out;
    }

    tick() {
      super.tick();
      const dt = this.cfg.tick;
      this.arrivals(dt);
      if (this.tray) this.stepTrays(dt);
      for (const w of this.workers) w.update(dt);
    }
  }

  WS.SortSim = SortSim;
  WS.SortFloor = SortFloor;
})((globalThis.WS = globalThis.WS || {}));
