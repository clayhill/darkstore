/* AisleMate: collaborative mobile robots in ordinary shelving (person-to-goods
 * with robot assistance). Orders are staged as empty totes at an induct &
 * drop-off station. A robot takes a batch of them and drives a route along
 * the shelf locations of their lines; at every stop it waits until a picker
 * walks up, picks into the right tote and confirms. Pickers keep to a zone
 * of aisles and go to the robots there, also to robots still on their way.
 * After the last stop the robot drives to a station, where the operator
 * takes the full totes off onto the packing conveyor and puts the next
 * batch on. Received goods go the other way: the goods-in operator loads
 * cases onto a robot and pickers put them away at its stops.
 * Reuses the shared orders, stations, inventory, router and KPIs; this file
 * holds the batches and routes, the stops and the pickers. */
(function (WS) {
  'use strict';
  const TERMS = { unit: 'location', Unit: 'Location', units: 'locations', Units: 'Locations', store: 'shelving', Store: 'Shelving', port: 'station', ports: 'stations', starve: 'robots' };
  const STATE_LABELS = { MOVING_TO_TARGET: 'To pick location', TRANSPORTING_TO_PORT: 'To station', AT_PORT: 'At station', STORING: 'Putaway tour', WAITING_PORT: 'Station queue' };
  const EXTRA = { WAITING_PICKER: { label: 'Waiting for picker', color: '#e879f9', bucket: 'WAIT' } };
  const LEGEND = ['IDLE', 'MOVING_TO_TARGET', 'WAITING_PICKER', 'TRANSPORTING_TO_PORT', 'AT_PORT', 'STORING', 'WAITING_IN_TRAFFIC', 'WAITING_PORT', 'TO_CHARGER', 'CHARGING'];
  const NAMES = ['Ana', 'Ben', 'Chloé', 'Daan', 'Eva', 'Femke', 'Gilles', 'Hanna', 'Ilse', 'Jonas', 'Kato', 'Lars', 'Mats', 'Nina', 'Omar', 'Pieter', 'Rosa', 'Sven', 'Tess', 'Wout'];
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];

  // The operator stands just outside the floor in front of the robot, with
  // the rack of staged order totes to the right and the takeaway spur after it.
  class AmrLayout extends WS.Layout {
    slotPos(port, k) { return { x: port.drop.x + 1.35 + k * 0.46, y: this.D + 0.75 }; }
    spurX(port) { return this.slotPos(port, this.sim.cfg.toteSlots - 1).x + 0.6; }
    // the operator lifts a full tote off the robot onto the lane behind the rack, beside the robot
    backLaneX(port) { return port.drop.x + 0.75; }
    backLaneY(port) { return this.slotPos(port, 0).y - 0.53; } // clear of the robots at the floor's edge
    dropRoute(port, pk) { const y = this.backLaneY(port), sx = this.spurX(port); return [{ x: port.drop.x + 1.0, y, z: 1.6 }, { x: sx, y, z: 1.6 }, ...this.toPacker(sx, pk)]; }
    pickPos(port) { return { x: port.drop.x + 0.5, y: port.drop.y + 0.5 }; }
    toteStack(port) { const s = this.slotPos(port, 1); return { x: s.x + 0.2, y: s.y + 1.0 }; } // clear of the operator
    operatorPos(port) { return port.face === 'front' ? { x: port.drop.x + 0.5, y: this.D + 0.85 } : { x: this.W + 0.85, y: port.drop.y + 0.5 }; }
  }

  // A station where robots are served: the operator swaps totes (induct &
  // drop-off) or loads received cases (goods-in). It is busy while a robot is
  // at it and starved while work waits there and no robot is coming.
  class AmrStation extends WS.Port {
    constructor(sim, idx, def) {
      super(sim, idx, def);
      this.name = (def.kind === 'PICK' ? 'Induct ' : 'Goods-in ') + (idx + 1);
      this.serving = null; // robot at the station
      this.swaps = 0; // totes taken off robots
    }
    // The shared views and station cards show a station as working while it
    // has a job: here, while a robot is being served.
    get job() { return this.serving ? { lines: [null], next: 0, t: 0, total: 1 } : null; }
    set job(v) {}
    update(dt) {
      const sim = this.sim;
      this.stats.t += dt;
      let starved = 0;
      if (this.serving) this.stats.busy += dt;
      else if (sim.stationWork(this) && !sim.fleet.some((r) => r.task && r.task.port === this.idx)) { this.stats.starved += dt; starved = 1; }
      const f = Math.exp(-dt / 180);
      this.recentStarve = this.recentStarve * f + starved * (1 - f);
    }
  }

  // A person who walks the aisles and picks into (or puts away from) the
  // robots' totes. Pickers do not reserve cells: they step around robots.
  class Picker {
    constructor(sim, k, x, y, zone) {
      Object.assign(this, { sim, id: k, name: NAMES[k % NAMES.length] + (k >= NAMES.length ? ' ' + (1 + Math.floor(k / NAMES.length)) : ''), x, y, px: x, py: y, zone });
      Object.assign(this, { path: [], stop: null, state: 'IDLE', t: 0, lines: 0, stops: 0, distance: 0, heading: -Math.PI / 2 });
      this.stateTime = { IDLE: 0, WALKING: 0, WAITING: 0, PICKING: 0, BREAK: 0 };
    }
    // share of the time walking to robots or picking
    get utilization() { const s = this.stateTime, tot = s.IDLE + s.WALKING + s.WAITING + s.PICKING; return tot ? (s.WALKING + s.PICKING) / tot : 0; }
    update(dt) {
      const sim = this.sim, st = this.stop;
      this.px = this.x; this.py = this.y;
      if (this.away && !st) { this.state = 'BREAK'; this.stateTime.BREAK += dt; return; } // on a break (WS.Disruptions), after the stop in hand
      if (this.state === 'BREAK') this.state = 'IDLE';
      if (this.state === 'WALKING') {
        let m = (sim.cfg.walkSpeed / sim.cfg.cellSize) * dt;
        while (m > 1e-9 && this.path.length) {
          const p = this.path[0], dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
          if (d > 1e-9) this.heading = Math.atan2(dy, dx);
          if (d <= m) { this.x = p.x; this.y = p.y; m -= d; this.distance += d; this.path.shift(); } else { this.x += (dx / d) * m; this.y += (dy / d) * m; this.distance += m; m = 0; }
        }
        if (!this.path.length) this.state = 'WAITING';
      }
      if (this.state === 'WAITING' && st.arrived) {
        // face the shelf the robot stands at
        this.heading = st.x % 4 === 1 ? Math.PI : 0;
        this.state = 'PICKING'; this.t = sim.stopWork(st); st.picking = sim.time;
        sim.waitStats.sum += sim.time - st.since; sim.waitStats.n++;
      } else if (this.state === 'PICKING') {
        this.t -= dt;
        if (this.t <= 0) { sim.finishStop(st, this); this.stop = null; this.state = 'IDLE'; }
      }
      this.stateTime[this.state] += dt;
    }
  }

  // ---------------------------------------------------------------- robot tasks
  const T = {};
  // Queue through the station's lane to the cell where it is served.
  function* toStation(sim, r, port) {
    r.state = 'TRANSPORTING_TO_PORT';
    yield* WS.Tasks.throughLane(sim, r, port.docks[0]);
    r.state = 'AT_PORT';
    yield { op: 'until', fn: () => !port.serving, waitState: 'WAITING_PORT' };
    port.serving = r;
  }
  // While the operator is on a break (WS.Disruptions) the robot waits.
  function* attended(port) { if (port.away) yield { op: 'until', fn: () => !port.away, waitState: 'WAITING_PORT' }; }
  // The operator takes the full totes off, one by one, onto the takeaway spur.
  function* unload(sim, r, port) {
    while (r.totes.length) {
      yield* attended(port);
      yield { op: 'wait', t: sim.cfg.toteHandle };
      sim.dropTote(port, r.totes.shift());
    }
  }
  // The operator puts the batch on: an empty tote per order, or the cases to put away.
  function* load(sim, r, t, port) {
    if (t.kind === 'pick') {
      for (const o of t.orders) { yield* attended(port); yield { op: 'wait', t: sim.cfg.toteHandle }; sim.loadTote(r, o, port); }
      t.stops = sim.pickStops(t.orders, port);
    } else {
      for (const st of t.stops) { yield* attended(port); yield { op: 'wait', t: sim.cfg.toteHandle * 0.6 }; r.cases += st.lines.length; }
    }
    sim.route(t.stops);
  }
  // Drive to each stop in turn and wait there until a picker has worked it.
  function* tour(sim, r, t) {
    for (const st of t.stops) {
      r.state = t.kind === 'pick' ? 'MOVING_TO_TARGET' : 'STORING';
      st.robot = r; sim.stops.push(st);
      yield { op: 'move', x: st.x, y: st.y };
      st.arrived = true; st.since = sim.time; r.busy = true;
      yield { op: 'until', fn: () => st.done, waitState: 'WAITING_PICKER' };
      r.busy = false; r.lifts++;
      sim.stops.splice(sim.stops.indexOf(st), 1);
      if (t.kind === 'put') r.cases -= st.lines.length;
    }
  }
  // Load at the station, work the stops, then drop the totes at a station and,
  // while there are orders staged and the battery lasts, take the next batch.
  T.TRIP = function* (sim, r, t) {
    let port = sim.ports[t.port];
    yield* toStation(sim, r, port);
    yield* load(sim, r, t, port);
    port.serving = null;
    for (;;) {
      yield* tour(sim, r, t);
      if (t.kind === 'put') return;
      port = sim.dropStation(r); t.port = port.idx;
      yield* toStation(sim, r, port);
      yield* unload(sim, r, port);
      const next = r.battery >= sim.cfg.battLow ? sim.claimBatch(port, r, true) : null;
      if (!next) break;
      t.orders = next;
      yield* load(sim, r, t, port);
      port.serving = null;
    }
    port.serving = null;
    // off the station so the next robot can come up
    const i = sim.parkingCell(r);
    if (i >= 0) { r.state = 'IDLE'; t.park = i; yield { op: 'move', x: sim.grid.cx(i), y: sim.grid.cy(i) }; }
  };
  T.CHARGE = WS.Tasks.CHARGE;
  T.YIELD = WS.Tasks.YIELD;
  T.PARK = WS.Tasks.PARK;

  // ---------------------------------------------------------------- simulation
  class AmrSim extends WS.Sim {
    get kind() { return 'amr'; }
    get terms() { return TERMS; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    get extraStates() { return EXTRA; }
    get taskTypes() { return T; }
    defaults() { return WS.AMR_CONFIG; }
    createGrid() { const g = new WS.ShelfFloor(this.cfg); g.sim = this; return g; }
    createLayout() { return new AmrLayout(this); }
    createPort(k, def) { return new AmrStation(this, k, def); }
    get armsAllowed() { return false; } // pickers pick at the shelves: no pick station for an arm
    // who can go on a break: the station operators and the pickers
    breakTargets() { return [...this.ports, ...this.pickers]; }
    describe() { const c = this.cfg; return `${c.aisles} aisles × ${c.bays} bays of shelving online · ${this.fleet.length} robots · ${this.pickers.length} pickers · ${this.ports.length} stations`; }
    storageCapacity() { return this.inv.bins.length; }
    compLabel(k) { const s = this.cfg.shelfSlots; return `level ${Math.floor(k / s) + 1} · slot ${(k % s) + 1}`; }

    seed() {
      const cfg = this.cfg, g = this.grid, inv = this.inv, rng = this.rng;
      inv.seedCatalog(cfg.products, rng);
      inv.computePortDistances();
      this.stops = []; this.pickers = []; this.waitStats = { sum: 0, n: 0 };
      // a stock location on every shelf bay, stocked like the pods: every product somewhere, then demand-weighted
      const ncomp = cfg.shelfLevels * cfg.shelfSlots, next = this.productStream();
      for (let x = 0; x < g.W; x++) for (let y = 0; y < g.D; y++) {
        const i = g.idx(x, y);
        if (!g.isShelf(i)) continue;
        const bin = inv.createBin(ncomp, { prefix: 'SH-', digits: 4, asset: 40, vol: ncomp * cfg.slotVol });
        bin.loc = 'grid'; bin.x = x; bin.y = y; g.binAt[i] = bin.id;
        for (let c = 0; c < ncomp; c++) {
          if (rng() >= cfg.stockedRatio) continue;
          const p = next();
          if (!bin.comps.some((q) => q.gtin === p.gtin)) this.stockComp(bin, c, p);
        }
      }
      this.seedDemand();
      // robots start in the parking row, then in the front cross-aisle
      const park = [];
      for (let x = 0; x < g.W; x++) if (g.canPark(g.idx(x, g.D - 1))) park.push(g.idx(x, g.D - 1));
      for (let x = g.W - 2; x >= 0; x--) park.push(g.idx(x, g.D - 2));
      for (let k = 0; k < cfg.robots && k < park.length; k++) {
        const r = new WS.Robot(this, k, g.cx(park[k]), g.cy(park[k]));
        r.totes = []; r.cases = 0;
        this.fleet.push(r);
      }
      // pickers: zones of neighbouring aisles, each picker starting in front of its zone
      const nz = Math.max(1, Math.min(cfg.aisles, cfg.pickers));
      for (let k = 0; k < cfg.pickers; k++) {
        const z = k % nz, a0 = Math.floor((z * cfg.aisles) / nz), a1 = Math.floor(((z + 1) * cfg.aisles) / nz) - 1;
        const x = ((a0 + a1) / 2) * 4 + 2 + (k >= nz ? 0.6 : 0), y = g.Y0 + g.B + 0.5;
        this.pickers.push(new Picker(this, k, x, y, { a0, a1 }));
      }
    }
    // Cost of picking an order line from a location: the work already waiting
    // in its aisle (spreads the picking over the zones), then how far it is
    // from the stations.
    fetchCost(bin) { return (this.aisleWork ? this.aisleWork[this.grid.aisleOf(bin.x)] : 0) * 0.4 + this.inv.portDist[this.grid.idx(bin.x, bin.y)] * 0.03; }
    // locations with lines waiting, per aisle
    countAisleWork() {
      const w = (this.aisleWork = new Array(this.cfg.aisles).fill(0));
      for (const bin of this.binsWithRequests) w[this.grid.aisleOf(bin.x)]++;
    }

    // ---------------------------------------------------------------- batches and routes
    // Orders staged at a station that no robot has taken yet, oldest and most
    // urgent first. A robot waits for a full batch unless the oldest has
    // waited long enough (or `any`: it is at the station already).
    claimBatch(port, r, any) {
      const cfg = this.cfg, staged = port.slots.filter((o) => o && o.amr == null).sort((a, b) => b.priority - a.priority || a.created - b.created);
      if (!staged.length) return null;
      const oldest = Math.min(...staged.map((o) => o.times.released));
      if (!any && staged.length < cfg.robotTotes && this.time - oldest < cfg.batchWait) return null;
      const batch = staged.slice(0, cfg.robotTotes);
      for (const o of batch) o.amr = r.id;
      return batch;
    }
    // Received goods waiting at the shelf locations the IMS chose: one stop
    // per location, with the lines planned so far.
    claimPutaway(port, r, any) {
      const cfg = this.cfg, wait = [];
      for (const bin of this.binsWithRequests) {
        if (bin.task) continue;
        const q = bin.requests.find((x) => x.port === port.idx);
        if (q) wait.push({ bin, q });
      }
      if (!wait.length) return null;
      wait.sort((a, b) => a.q.t - b.q.t);
      if (!any && wait.length < cfg.putawayStops && this.time - wait[0].q.t < cfg.batchWait) return null;
      return wait.slice(0, cfg.putawayStops).map(({ bin, q }) => { bin.task = { type: 'PUTAWAY', robot: r.id }; return this.newStop('put', bin, q.lines.slice(), port); });
    }
    newStop(kind, bin, lines, port) {
      const c = this.grid.stopCell(bin.x, bin.y);
      return { kind, bin, lines, port: port.idx, x: c.x, y: c.y, robot: null, picker: null, arrived: false, done: false, since: 0 };
    }
    // The stops for a batch of orders: every location holding one of their lines.
    pickStops(orders, port) {
      const set = new Set(orders), by = new Map();
      for (const bin of this.binsWithRequests) {
        for (const q of bin.requests) for (const l of q.lines) if (set.has(l.order)) { if (!by.has(bin)) by.set(bin, []); by.get(bin).push(l); }
      }
      return [...by].map(([bin, lines]) => this.newStop('pick', bin, lines, port));
    }
    // S-shape route: aisles left to right, into the first from the front,
    // back out of the next, and so on.
    route(stops) {
      const aisle = (s) => Math.floor(s.x / 4), order = [...new Set(stops.map(aisle))].sort((a, b) => a - b);
      stops.sort((p, q) => {
        const ka = order.indexOf(aisle(p)), kb = order.indexOf(aisle(q));
        if (ka !== kb) return ka - kb;
        return ka % 2 === 0 ? q.y - p.y : p.y - q.y;
      });
    }
    // where a robot drops its full totes: the induct station with the fewest robots heading there, then the nearest
    dropStation(r) {
      let best = null, bs = Infinity;
      for (const p of this.ports) {
        if (p.kind !== 'PICK') continue;
        const n = this.fleet.filter((o) => o !== r && o.task && o.task.port === p.idx).length;
        const s = n * 8 + WS.U.manhattan(r.x, r.y, p.drop.x, p.drop.y);
        if (s < bs) { bs = s; best = p; }
      }
      return best;
    }
    loadTote(r, o, port) {
      const k = port.slots.indexOf(o);
      if (k >= 0) port.slots[k] = null;
      r.totes.push(o); o.slot = r.totes.length - 1;
    }
    dropTote(port, o) {
      if (!o.times.picked) o.times.picked = this.time; // short-picked: packed with what is in it
      port.swaps++;
      this.oms.toPacking(o, (pk) => this.layout.dropRoute(port, pk));
      this.log('pick', `${o.id} dropped at ${port.name} — tote ${o.tote.id} to packing`);
    }
    onOrderPicked(o) { this.log('pick', `${o.id} complete on ${this.fleet[o.amr].name}`); }
    // something for a station to do: staged orders, or received goods to put away
    stationWork(port) {
      if (port.kind === 'PICK') return port.slots.some((o) => o && o.amr == null);
      for (const bin of this.binsWithRequests) if (!bin.task && bin.requests.some((q) => q.port === port.idx)) return true;
      return false;
    }

    // ---------------------------------------------------------------- stops and pickers
    // seconds a picker needs at a stop: scan the location, then each line
    stopWork(st) {
      const c = this.cfg;
      return st.lines.reduce((t, l) => t + (st.kind === 'pick' ? 1.0 + l.qty * c.pickPerUnit + c.putConfirm : 2.0 + l.qty * c.decantPerUnit), c.scanTime);
    }
    finishStop(st, picker) {
      const inv = this.inv, oms = this.oms, bin = st.bin, done = new Set(st.lines);
      for (const l of st.lines) {
        if (st.kind === 'pick') {
          const port = this.ports[l.order.port], q = inv.pick(bin, l.comp, l.qty);
          port.stats.lines++; port.stats.units += q;
          oms.onLinePicked(l, q, port);
        } else {
          inv.decant(bin, l.comp, l.qty); oms.onDecanted(l);
          const port = this.ports[st.port]; port.stats.lines++; port.stats.units += l.qty;
        }
      }
      bin.requests = bin.requests.filter((q) => { q.lines = q.lines.filter((l) => !done.has(l)); return q.lines.length; });
      if (!bin.requests.length) this.binsWithRequests.delete(bin);
      if (st.kind === 'put') bin.task = null;
      st.done = true; picker.lines += st.lines.length; picker.stops++;
      this.ports[st.port].stats.presented++;
      this.kpi.onPresented(this.ports[st.port]);
      this.grid.version++;
    }
    inZone(pk, st) {
      if (this.cfg.zonePicking !== 'on') return true;
      const a = Math.floor(st.x / 4);
      return a >= pk.zone.a0 && a <= pk.zone.a1;
    }
    // Each free picker takes the stop in reach that has waited longest:
    // robots already waiting first, then robots on their way there. With
    // nothing to do in their own zone, pickers help out in another one with
    // robots waiting.
    assignPickers() {
      for (const pk of this.pickers) {
        if (pk.stop || pk.away) continue;
        let best = null, bs = Infinity;
        for (const st of this.stops) {
          if (st.picker) continue;
          const own = this.inZone(pk, st);
          if (!own && !st.arrived) continue;
          const d = Math.abs(pk.x - st.x - 0.5) + Math.abs(pk.y - st.y - 0.5);
          const s = d + (st.arrived ? -(this.time - st.since) * 0.3 - 4 : 0) + (own ? 0 : 1000);
          if (s < bs) { bs = s; best = st; }
        }
        if (best) { pk.stop = best; best.picker = pk; pk.path = this.walkPath(pk, best); pk.state = 'WALKING'; }
      }
    }
    // where a picker stands to work a stop: beside the robot, on the shelf side
    pickSpot(st) { return { x: st.x + 0.5 + (st.x % 4 === 1 ? -0.2 : 0.2), y: st.y + 1.02 }; }
    // Walking route over the aisles (cell centres), ending at the pick spot.
    walkPath(pk, st) {
      const g = this.grid, n = g.W * g.D, prev = new Int32Array(n).fill(-1), goal = g.idx(st.x, st.y);
      let sx = Math.floor(pk.x), sy = Math.floor(pk.y);
      if (!g.walkable(sx, sy)) for (let d = 0; d < 4; d++) if (g.walkable(sx + DX[d], sy + DY[d])) { sx += DX[d]; sy += DY[d]; break; }
      const start = g.idx(sx, sy), q = [start];
      prev[start] = start;
      for (let h = 0; h < q.length && prev[goal] < 0; h++) {
        const ci = q[h], x = g.cx(ci), y = g.cy(ci);
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (!g.walkable(nx, ny)) continue;
          const ni = g.idx(nx, ny);
          if (prev[ni] < 0) { prev[ni] = ci; q.push(ni); }
        }
      }
      const path = [];
      if (prev[goal] >= 0) for (let c = goal; c !== start; c = prev[c]) path.push({ x: g.cx(c) + 0.5, y: g.cy(c) + 0.5 });
      path.reverse();
      path.push(this.pickSpot(st));
      return path;
    }
    extraAlerts() {
      const n = this.fleet.length, waiting = this.fleet.filter((r) => r.displayState === 'WAITING_PICKER').length;
      return waiting >= Math.max(2, n * 0.4) ? [{ sev: waiting >= n * 0.6 ? 'critical' : 'warning', key: 'pickers', title: 'Picker shortage', msg: `${waiting} of ${n} robots waiting for a picker` }] : [];
    }

    // ---------------------------------------------------------------- dispatch
    dispatch() {
      this.countAisleWork();
      this.dispatchCharging();
      this.assignPickers();
      let idle = this.idleRobots();
      for (const port of this.ports) {
        while (idle.length) {
          const r = this.nearestRobot(idle, port.drop.x, port.drop.y);
          const work = port.kind === 'PICK' ? this.claimBatch(port, r) : this.claimPutaway(port, r);
          if (!work) break;
          this.assignTask(r, port.kind === 'PICK' ? { type: 'TRIP', kind: 'pick', port: port.idx, orders: work, stops: [], priority: 5 } : { type: 'TRIP', kind: 'put', port: port.idx, stops: work, priority: 4 });
          idle = idle.filter((x) => x !== r);
        }
      }
      this.parkIdle(idle);
    }
    // idle robots wait in the parking rows along the front and the back
    needsParking(r) { return !this.grid.canPark(this.grid.idx(r.x, r.y)); }
    parkingCell(r) {
      const g = this.grid, taken = new Set(this.fleet.filter((o) => o !== r && o.task).map((o) => o.task.park ?? (o.task.type === 'PARK' ? g.idx(o.task.x, o.task.y) : -1)));
      let best = -1, bd = Infinity;
      for (let i = 0; i < g.type.length; i++) {
        if (!g.canPark(i) || taken.has(i) || (g.claim[i] >= 0 && g.claim[i] !== r.id)) continue;
        const d = WS.U.manhattan(r.x, r.y, g.cx(i), g.cy(i));
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }

    tick() {
      super.tick();
      for (const p of this.pickers) p.update(this.cfg.tick);
    }
  }

  WS.AmrSim = AmrSim;
  WS.AmrTasks = T;
})((globalThis.WS = globalThis.WS || {}));
