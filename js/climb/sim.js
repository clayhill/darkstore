/* RackRider: climbing robots (Exotec Skypod style). The racking is
 * StackPilot's (WS.AcrSim, which this builds on): totes single deep on both
 * sides of aisles one robot wide, one-way aisles. A robot carries one tote.
 * It drives into the aisle, engages with the rack uprights and climbs
 * straight up the racking to the tote's level, takes it with its telescopic
 * arm and climbs down; while it climbs it blocks its column of the aisle,
 * so robots behind it wait. It then drives to the station and climbs into
 * the station's frame to present the tote to the operator itself, waits
 * while the lines are picked (and goes on to the next station that wants
 * the tote), and finally climbs to a free position and puts it away.
 * Stations have no conveyor: the robot is the conveyor. */
(function (WS) {
  'use strict';
  const CELL = WS.CELL;
  const TERMS = { unit: 'tote', Unit: 'Tote', units: 'totes', Units: 'Totes', store: 'racking', Store: 'Racking', port: 'station', ports: 'stations', machine: 'Robot' };
  const EXTRA = { CLIMBING: { label: 'Climbing', color: '#e879f9' } };
  const STATE_LABELS = { MOVING_TO_TARGET: 'To the tote', STORING: 'To store', HANDLING: 'Arm out', TRANSPORTING_TO_PORT: 'To station', AT_PORT: 'Presenting', WAITING_PORT: 'Waiting (station queue)' };
  const LEGEND = ['IDLE', 'MOVING_TO_TARGET', 'CLIMBING', 'HANDLING', 'TRANSPORTING_TO_PORT', 'AT_PORT', 'STORING', 'WAITING_IN_TRAFFIC', 'WAITING_PORT', 'TO_CHARGER', 'CHARGING'];
  const ZU = WS.RACK_ZU;

  // StackPilot's floor, but each station is a frame at the floor's front edge
  // that the robot drives into at the end of its queue lane: the operator
  // stands just outside it.
  class ClimbFloor extends WS.AcrFloor {
    constructor(cfg, sim) {
      super(cfg, sim);
      this.D = this.laneY + 1;
      for (const p of this.ports) { p.drop = { x: p.hand.x, y: p.hand.y }; p.lift = p.drop; }
    }
  }
  // The operator stands in front of the frame, the put wall to their right.
  class ClimbLayout extends WS.Layout {
    pickPos(port) { return { x: port.hand.x + 0.5, y: port.hand.y + 0.5 }; }
    operatorPos(port) { return { x: port.hand.x + 0.5, y: this.D + 0.85 }; }
    slotPos(port, k) { return { x: port.hand.x + 1.6 + k * 0.52, y: this.D + 0.8 }; }
    spurX(port) { return this.slotPos(port, this.sim.cfg.toteSlots - 1).x + 0.6; }
    backLaneY(port) { return this.slotPos(port, 0).y - 0.55; }
  }

  // ---------------------------------------------------------------- tasks
  const T = { CHARGE: WS.Tasks.CHARGE, YIELD: WS.Tasks.YIELD, PARK: WS.Tasks.PARK };
  // Up or down the racking (or into a station's frame) to height z (render
  // levels; 0 = on the floor): engage with the uprights, climb, and let go
  // again back on the floor. The robot blocks its cell meanwhile.
  function* climb(sim, r, z) {
    const c = sim.cfg;
    if (Math.abs(r.mast - z) < 1e-3) return;
    r.busy = true;
    const up = r.mast < 1e-3;
    r.state = 'CLIMBING';
    if (up) yield { op: 'wait', t: c.climbOn };
    yield { op: 'mast', to: z, v: c.climbSpeed / ZU };
    if (z < 1e-3) { yield { op: 'wait', t: c.climbOn }; r.busy = false; }
  }
  // the rack position of a tote: the aisle cell beside it, the height to climb to
  const standAt = (sim, a, l, b) => ({ x: a * 3 + 1, y: sim.grid.Y0 + b, z: sim.grid.levelZ(l) - 0.25 });
  // Queue through the station's lane, climb into its frame and present the
  // tote until the operator has worked every line on it.
  function* present(sim, r, port, bin) {
    r.state = 'TRANSPORTING_TO_PORT';
    yield* WS.Tasks.throughLane(sim, r, port.docks[0]);
    r.state = 'AT_PORT';
    yield { op: 'until', fn: () => port.canAccept(), waitState: 'WAITING_PORT' };
    yield* climb(sim, r, sim.cfg.presentHeight / ZU);
    r.state = 'AT_PORT';
    port.receive(bin);
    yield { op: 'until', fn: () => port.outQ[0] === bin };
    port.takeOut();
    bin.loc = 'robot'; bin.robot = r.id; bin.port = -1;
    yield* climb(sim, r, 0);
  }
  // Fetch a tote, take it to every station that wants it, put it away.
  T.RETRIEVE = function* (sim, r, t) {
    const cfg = sim.cfg, bin = t.bin;
    let s = standAt(sim, bin.aisle, bin.level, bin.bay);
    r.state = 'MOVING_TO_TARGET';
    yield { op: 'move', x: s.x, y: s.y };
    yield* climb(sim, r, s.z);
    r.state = 'HANDLING'; r.xfer = { id: bin.id, take: true, side: bin.side };
    yield { op: 'wait', t: cfg.handlerTime };
    r.xfer = null; r.lifts++;
    sim.take(bin);
    bin.loc = 'robot'; bin.robot = r.id; r.hold(bin.id);
    yield* climb(sim, r, 0);
    let port = sim.ports[t.port];
    for (;;) {
      yield* present(sim, r, port, bin);
      if (!bin.requests.length) break;
      // more lines for a station came in meanwhile: there next
      port = sim.ports[bin.requests[0].port];
      port.inbound++;
    }
    // put it away in the free position the storage policy picks
    let p;
    while (!(p = sim.storeSlot(bin, [], () => true))) yield { op: 'wait', t: 1 };
    sim.aisles[p.a].resv[sim.si(p.l, p.s, p.b)] = true;
    s = standAt(sim, p.a, p.l, p.b);
    r.state = 'STORING';
    yield { op: 'move', x: s.x, y: s.y };
    yield* climb(sim, r, s.z);
    r.state = 'HANDLING'; r.xfer = { id: bin.id, take: false, side: p.s };
    yield { op: 'wait', t: cfg.handlerTime };
    r.xfer = null;
    sim.aisles[p.a].resv[sim.si(p.l, p.s, p.b)] = false;
    r.drop(bin.id);
    sim.place(bin, p.a, p.l, p.s, p.b);
    sim.kpi.stores++; sim.climbs.n++;
    yield* climb(sim, r, 0);
    sim.onCycle();
  };

  // ---------------------------------------------------------------- simulation
  class ClimbSim extends WS.AcrSim {
    get kind() { return 'climb'; }
    get terms() { return TERMS; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    get extraStates() { return EXTRA; }
    get taskTypes() { return T; }
    defaults() { return WS.CLIMB_CONFIG; }
    createGrid() { return new ClimbFloor(this.cfg, this); }
    createLayout() { return new ClimbLayout(this); }
    describe() { const c = this.cfg; return `${c.aisles} aisles × ${c.levels} levels × ${c.bays} bays online · ${this.fleet.length} climbing robots · ${this.inv.bins.length} totes`; }
    createMachines() {
      super.createMachines();
      for (const r of this.fleet) r.mast = 0; // on the floor
      this.climbs = { n: 0 };
    }
    // the robot takes the tote back itself (present)
    onPortOut() {}
    // A free parking spot no other robot is heading for: many robots can go
    // idle at once (after a breakdown), and all of them driving to the same
    // spot would lock up the corridor.
    parkingCell(r) {
      const g = this.grid, taken = new Set(this.fleet.filter((o) => o !== r && o.task && o.task.type === 'PARK').map((o) => g.idx(o.task.x, o.task.y)));
      let best = -1, bd = Infinity;
      for (let y = g.Y0; y < g.frontY; y++) {
        const i = g.idx(g.parkX, y);
        if (g.type[i] !== CELL.PARK || taken.has(i) || (g.claim[i] >= 0 && g.claim[i] !== r.id)) continue;
        const d = WS.U.manhattan(r.x, r.y, g.parkX, y);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
    // Each retrieval goes to the nearest idle robot, while its station has room.
    dispatch() {
      this.createRetrievals();
      this.dispatchCharging();
      const idle = this.idleRobots(), g = this.grid;
      for (const t of this.pendingTasks()) {
        if (!idle.length) break;
        if (t.type !== 'RETRIEVE' || t.bin.loc !== 'grid') continue;
        const port = this.ports[t.port];
        if (this.portFull(port)) continue;
        const r = this.nearestRobot(idle, t.bin.aisle * 3 + 1, g.Y0 + t.bin.bay);
        idle.splice(idle.indexOf(r), 1);
        port.inbound++;
        this.assignTask(r, t);
      }
      this.parkIdle(idle);
    }
  }

  WS.ClimbSim = ClimbSim;
})((globalThis.WS = globalThis.WS || {}));
