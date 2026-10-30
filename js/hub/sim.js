/* What every parcel sorter shares (SortHub, TrayLoop, ShoeLine). Parcels
 * arrive in a stream, each for one of a set of destinations (a few take most
 * of the volume); operators at the inducts scan them and put them on the
 * sorter, which drops each into a chute for its destination. Every chute
 * ends in a bag; bag workers change full bags, and a parcel whose chute is
 * full has to wait (or go round again). Labels the scanner cannot read go to
 * a reject chute. A sorter supplies its floor, where its chutes are
 * (chuteSpots), where the bag workers start and walk, and its own machine
 * (seedSorter, stepSorter). There is no stock and no orders: the shared order
 * flow stays idle. */
(function (WS) {
  'use strict';
  const C = WS.CELL;
  const TERMS = { unit: 'parcel', Unit: 'Parcel', units: 'parcels', Units: 'Parcels', store: 'sorter', Store: 'Sorter', port: 'induct', ports: 'inducts', starve: 'parcels', flow1: 'Parcels inducted /h', flow2: 'Parcels sorted /h' };
  const PLACES = ['Brussels', 'Antwerpen', 'Gent', 'Leuven', 'Liège', 'Brugge', 'Namur', 'Mechelen', 'Hasselt', 'Kortrijk', 'Aalst', 'Mons', 'Charleroi', 'Oostende', 'Genk', 'Amsterdam', 'Rotterdam', 'Utrecht', 'Eindhoven', 'Lille', 'Paris', 'Reims', 'Köln', 'Aachen', 'Düsseldorf', 'Luxembourg', 'Maastricht', 'Breda', 'Tilburg', 'Arnhem', 'Groningen', 'Zwolle', 'Calais', 'Metz', 'Trier', 'Bonn', 'Essen', 'Dortmund', 'Nijmegen', 'Den Haag'];

  // ---------------------------------------------------------------- floor
  // A sorter's floor in cells: a map for the control room, with the chute
  // under each of its cells (chuteAt). A sorter lays out the rest.
  class HubFloor extends WS.RobotFloor {
    constructor(cfg, W, D) {
      super(W, D, C.BLOCKED);
      this.cfg = cfg; this.Z = 6; this.chuteAt = new Int16Array(W * D).fill(-1);
    }
    depthOf() { return 1; }
    isStorage(i) { return this.type[i] === C.STORAGE; }
    passable() { return false; }
    // Control-room map: chutes by how full their bag is, inducts in amber.
    mapFill(i, mix) {
      const t = this.type[i], k = this.chuteAt[i];
      if (k >= 0) { const ch = this.sim.chutes[k]; return ch.swapping ? '#a16207' : mix('#16324f', '#dc2626', Math.min(1, ch.count / this.cfg.bagCapacity)); }
      return { [C.HIGHWAY]: '#1b2536', [C.PORT]: '#3a2a0a', [C.LANE]: '#2a2208', [C.CHARGER]: '#0f3321' }[t] || '#070b12';
    }
  }

  // ---------------------------------------------------------------- induct
  // An operator takes the next parcel off the feed belt, scans it and puts
  // it ready on the induct (`ready`), where the sorter takes it. The operator
  // scans the next one meanwhile and holds it until the induct is clear.
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
      if (this.away) { this.stats.away = (this.stats.away || 0) + dt; return; } // the operator is on a break (WS.Disruptions)
      if (!this.cur && this.queue.length) { this.cur = this.queue.shift(); this.t = sim.cfg.inductTime; sim.scanned(this.cur, this); }
      let starved = 0;
      if (this.cur && this.t > 0) { this.stats.busy += dt; this.t -= dt; }
      if (this.cur && this.t <= 0) {
        if (!this.ready) { this.ready = this.cur; this.cur = null; this.readyT = sim.time; } else this.stats.blocked += dt; // holding the next parcel
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

  // ---------------------------------------------------------------- simulation
  class HubSim extends WS.Sim {
    get terms() { return TERMS; }
    get armsAllowed() { return false; }
    get parcelHub() { return true; } // the shared views follow a parcel here, not an order
    createPort(k, def) { return new Induct(this, k, def); }
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
      const spots = this.chuteSpots();
      const n = Math.min(cfg.chutes, spots.length), owner = [];
      for (let k = 0; k < n - 1; k++) owner.push(k < nd ? k : (k - nd) % nd);
      this.chutes = spots.slice(0, n).map((s, k) => {
        const dest = k < n - 1 ? this.dests[owner[k]] : null, at = this.chuteAt(s);
        const ch = Object.assign({ id: k, name: 'Chute ' + (k + 1), dest, x: at.x, y: at.y, u: s.u, side: s.side, cell: s, count: 0, coming: 0, bags: 0, worker: null, swapping: false, sorted: 0 }, s.extra);
        if (dest) dest.chutes.push(ch);
        g.chuteAt[g.idx(Math.floor(s.x), Math.floor(s.y))] = k;
        return ch;
      });
      this.reject = this.chutes[this.chutes.length - 1];
      this.unserved = this.dests.filter((d) => !d.chutes.length); // too few chutes: those go to the reject chute
      this.workers = [];
      for (let k = 0; k < cfg.bagWorkers; k++) { const p = this.workerStart(k); this.workers.push(new BagWorker(this, k, p.x, p.y)); }
      this.seedSorter();
    }
    // where a chute stands, from its spot on the floor
    chuteAt(s) { return { x: s.x, y: s.y }; }
    seedSorter() {}
    stepSorter() {}

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
      this.arrivalAcc += dt * this.disrupt.rateFactor; // a surge runs the arrival clock faster
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
    // A parcel back where it was put on a loop sorter has done a lap; after
    // maxLaps it goes to the reject chute.
    lap(p) {
      p.laps++;
      if (p.laps === 1 && !p.target) this.stats.recirculated++;
      if (p.laps >= this.cfg.maxLaps && p.target !== this.reject) { p.target = this.reject; this.log('warn', `Parcel ${p.id} for ${p.dest.name}: chute full ${this.cfg.maxLaps} laps, to reject`); }
    }

    // ---------------------------------------------------------------- bag workers
    // Each full bag gets the nearest free bag worker.
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
    // where a bag worker stands to change a chute's bag, and the way there
    servicePoint(ch) { return { x: ch.x + 0.35, y: ch.y + 0.35 }; }
    workerPath(w, ch) { return [this.servicePoint(ch)]; }
    // Two aisles, one along each side of a line of chutes, joined round the far end (TrayLoop, ShoeLine).
    aislePath(w, ch, top, bot, ex) {
      const sp = this.servicePoint(ch), onTop = Math.abs(w.y - top) < Math.abs(w.y - bot), toTop = !ch.side;
      if (onTop === toTop) return [{ x: w.x, y: toTop ? top : bot }, sp];
      return [{ x: w.x, y: onTop ? top : bot }, { x: ex, y: onTop ? top : bot }, { x: ex, y: toTop ? top : bot }, sp];
    }

    dispatch() { this.dispatchWorkers(); }
    extraAlerts() {
      const out = [], cap = this.cfg.bagCapacity, full = this.chutes.filter((c) => c.count >= cap);
      if (full.length >= Math.max(2, this.workers.length + 1)) out.push({ sev: full.length > this.workers.length * 3 ? 'critical' : 'warning', key: 'bags', title: 'Full bags waiting', msg: `${full.length} chutes full · ${this.workers.length} bag workers` });
      if (this.backlog.length > 20) out.push({ sev: this.backlog.length > 200 ? 'critical' : 'warning', key: 'backlog', title: 'Induction backlog', msg: `${this.backlog.length} parcels waiting at the inbound dock` });
      return out;
    }
    // parcels on the sorter now
    onSorter() { return 0; }

    tick() {
      super.tick();
      const dt = this.cfg.tick;
      this.arrivals(dt);
      this.stepSorter(dt);
      for (const w of this.workers) w.update(dt);
    }
  }

  WS.HubSim = HubSim;
  WS.HubFloor = HubFloor;
  WS.HubInduct = Induct;
})((globalThis.WS = globalThis.WS || {}));
