/* Robots: an independent state machine per robot plus the Physical Engine
 * constraints (winch speeds by payload, gripper times, battery drain).
 * Tasks are generator functions that yield primitive operations:
 *   move · winch · grip · release · wait · until · charge
 * so the multi-step "dig and retrieve" logic reads top to bottom. */
(function (WS) {
  'use strict';

  const STATES = ['IDLE', 'MOVING_TO_TARGET', 'DIGGING_BIN', 'TRANSPORTING_TO_PORT', 'AT_PORT', 'STORING', 'RESTACKING', 'WAITING_IN_TRAFFIC', 'WAITING_PORT', 'TO_CHARGER', 'CHARGING', 'YIELDING'];
  // KPI buckets: utilization = WORK / total
  const BUCKET = { IDLE: 'IDLE', YIELDING: 'IDLE', MOVING_TO_TARGET: 'WORK', DIGGING_BIN: 'WORK', TRANSPORTING_TO_PORT: 'WORK', AT_PORT: 'WORK', STORING: 'WORK', RESTACKING: 'WORK', WAITING_IN_TRAFFIC: 'WAIT', WAITING_PORT: 'WAIT', TO_CHARGER: 'CHARGE', CHARGING: 'CHARGE' };

  class Robot {
    constructor(sim, id, x, y) {
      this.sim = sim; this.id = id; this.name = 'R' + String(id + 1).padStart(2, '0');
      this.x = x; this.y = y; this.axis = 'x';
      this.rx = x; this.ry = y; this.prx = x; this.pry = y; // render position (current / previous tick)
      this.v = 0; this.shift = 0; this.path = null; this.pi = 0; this.prog = 0; this.goal = null; this.detour = false;
      this.wait = 0; this.waitTotal = 0; this.patience = 1.5; this.evadeAt = 7; this.replanIn = 0;
      this.claims = new Set(); this.blocked = false; this.busy = false; this.moved = 0;
      this.state = 'IDLE'; this.task = null; this.gen = null; this.op = null; this.lastResult = undefined;
      this.bin = null; this.winch = 0; this.winchFrom = 0; this.winchTo = 0; this.winchDur = 0;
      this.battery = 70 + sim.rng() * 30;
      this.idleTime = 0; this.yieldCooldown = 0;
      this.stateTime = {}; STATES.forEach((s) => (this.stateTime[s] = 0));
      this.tasksDone = 0; this.distance = 0; this.lifts = 0;
      sim.router.claimCell(this, sim.grid.idx(x, y));
    }
    get displayState() {
      if (this.op && this.op.op === 'move' && this.blocked) return 'WAITING_IN_TRAFFIC';
      if (this.op && this.op.op === 'until' && this.op.waitState) return this.op.waitState;
      return this.state;
    }
    get bucket() { return BUCKET[this.displayState] || 'IDLE'; }

    start(task) {
      this.task = task; task.robot = this.id; task.started = this.sim.time;
      this.gen = WS.Tasks[task.type](this.sim, this, task);
      this.op = null; this.lastResult = undefined; this.idleTime = 0;
    }

    update(dt) {
      const sim = this.sim, cfg = sim.cfg;
      this.prx = this.rx; this.pry = this.ry;
      if (this.yieldCooldown > 0) this.yieldCooldown -= dt;
      if (this.gen && !this.op) this.advance();
      let drain = cfg.battIdle;
      const op = this.op;
      if (op) {
        switch (op.op) {
          case 'move': {
            if (sim.router.step(this, dt)) this.finishOp();
            if (this.v > 0) drain = cfg.battMove;
            break;
          }
          case 'winch': {
            op.t += dt; drain = cfg.battWinch * (this.bin ? 1.4 : 1);
            const f = Math.min(1, op.t / op.dur);
            this.winch = this.winchFrom + (this.winchTo - this.winchFrom) * f;
            if (f >= 1) this.finishOp();
            break;
          }
          case 'timer': op.t += dt; if (op.t >= op.dur) this.finishOp(); break;
          case 'until': if (op.fn()) this.finishOp(); break;
          case 'charge': {
            drain = -cfg.chargeRate;
            if (this.battery >= cfg.battTarget) this.finishOp();
            break;
          }
        }
      } else this.idleTime += dt;
      this.battery = Math.max(0, Math.min(100, this.battery - drain * dt));
      // render position: interpolated along the current path edge
      if (this.path && this.prog > 0 && this.pi + 1 < this.path.length) {
        const a = this.path[this.pi], b = this.path[this.pi + 1];
        this.rx = a.x + (b.x - a.x) * this.prog; this.ry = a.y + (b.y - a.y) * this.prog;
      } else { this.rx = this.x; this.ry = this.y; }
      this.distance += Math.abs(this.rx - this.prx) + Math.abs(this.ry - this.pry);
      this.stateTime[this.displayState] += dt;
    }

    finishOp() { this.op = null; if (this.gen) this.advance(); }

    advance() {
      for (let guard = 0; guard < 50; guard++) {
        const res = this.gen.next(this.lastResult);
        this.lastResult = undefined;
        if (res.done) { this.sim.taskDone(this); return; }
        const o = res.value;
        switch (o.op) {
          case 'move':
            if (this.x === o.x && this.y === o.y) continue;
            this.sim.router.setGoal(this, o.x, o.y);
            this.op = { op: 'move' };
            return;
          case 'winch': {
            const cfg = this.sim.cfg, dist = Math.abs(o.to - this.winch);
            if (dist < 1e-3) continue;
            let speed = cfg.winchEmpty;
            if (this.bin) {
              const w = this.sim.inv.binWeight(this.sim.inv.binById.get(this.bin)) / cfg.maxPayload;
              speed = cfg.winchEmpty * 0.85 + (cfg.winchLoaded - cfg.winchEmpty * 0.85) * w;
            }
            this.winchFrom = this.winch; this.winchTo = o.to;
            this.op = { op: 'winch', t: 0, dur: dist / speed + 0.35 }; // + ramp up/down
            return;
          }
          case 'grip': case 'release': this.op = { op: 'timer', t: 0, dur: this.sim.cfg.gripTime }; return;
          case 'wait': this.op = { op: 'timer', t: 0, dur: o.t }; return;
          case 'until': if (o.fn()) continue; this.op = { op: 'until', fn: o.fn, waitState: o.waitState }; return;
          case 'charge': this.op = { op: 'charge' }; return;
        }
      }
    }
  }

  // ---------------------------------------------------------------- tasks
  const T = {};
  const portDepth = (sim) => (sim.grid.Z - 0.6) * sim.cfg.binHeight;

  // Robot over column i lifts the top bin into its cavity.
  function* liftTop(sim, r, i, bin) {
    const g = sim.grid, bh = sim.cfg.binHeight;
    r.busy = true;
    yield { op: 'winch', to: (g.Z - g.stacks[i].length + 1) * bh };
    yield { op: 'grip' };
    sim.inv.liftFromStack(bin, i, r.id);
    r.bin = bin.id; r.lifts++;
    yield { op: 'winch', to: 0 };
    r.busy = false;
  }
  // Robot over column i lowers its bin on top of the stack.
  function* dropOn(sim, r, i) {
    const g = sim.grid, bh = sim.cfg.binHeight, bin = sim.inv.binById.get(r.bin);
    r.busy = true;
    yield { op: 'winch', to: (g.Z - g.stacks[i].length) * bh };
    yield { op: 'release' };
    sim.inv.placeOnStack(bin, i);
    r.bin = null;
    yield { op: 'winch', to: 0 };
    r.busy = false;
  }
  function* deliverToPort(sim, r, port) {
    const bin = sim.inv.binById.get(r.bin);
    r.state = 'TRANSPORTING_TO_PORT';
    yield { op: 'move', x: port.drop.x, y: port.drop.y };
    r.state = 'AT_PORT';
    yield { op: 'until', fn: () => port.canAccept(), waitState: 'WAITING_PORT' };
    port.entryReserved = true;
    r.busy = true;
    yield { op: 'winch', to: portDepth(sim) };
    yield { op: 'release' };
    r.bin = null;
    port.receive(bin);
    yield { op: 'winch', to: 0 };
    r.busy = false;
  }

  // Fetch a bin from the grid, digging out blockers, and deliver it to a port.
  T.RETRIEVE = function* (sim, r, t) {
    const g = sim.grid, inv = sim.inv, bin = t.bin;
    const col = inv.binColumn(bin), cx = g.cx(col), cy = g.cy(col);
    r.state = 'MOVING_TO_TARGET';
    yield { op: 'move', x: cx, y: cy };
    r.state = 'DIGGING_BIN';
    const t0 = sim.time, depth0 = g.depthOf(col, bin.id), blockers = [];
    if (g.stacks[col].indexOf(bin.id) < 0) throw new Error(`${bin.id} not in locked column ${col}`);
    while (g.stacks[col][g.stacks[col].length - 1] !== bin.id) {
      const top = inv.binById.get(g.stacks[col][g.stacks[col].length - 1]);
      yield* liftTop(sim, r, col, top);
      let tmp;
      while ((tmp = inv.findTempColumn(cx, cy, r.id)) < 0) yield { op: 'wait', t: 1 };
      g.colLock[tmp] = r.id;
      yield { op: 'move', x: g.cx(tmp), y: g.cy(tmp) };
      yield* dropOn(sim, r, tmp);
      g.colLock[tmp] = -1;
      blockers.push({ bin: top, tmp });
      sim.kpi.onShuffle();
      yield { op: 'move', x: cx, y: cy };
    }
    yield* liftTop(sim, r, col, bin);
    g.colLock[col] = -1;
    sim.kpi.onDig(bin, depth0, sim.time - t0);
    if (blockers.length && sim.cfg.restackPolicy === 'origin') sim.createRestack(col, blockers.reverse());
    yield* deliverToPort(sim, r, sim.ports[t.port]);
  };

  // Collect a bin from a port's lift position; route it to the next port that
  // needs it, or store it on top of a stack chosen by the slotting policy.
  T.STORE = function* (sim, r, t) {
    const g = sim.grid, inv = sim.inv, port = sim.ports[t.port];
    r.state = 'MOVING_TO_TARGET';
    yield { op: 'move', x: port.lift.x, y: port.lift.y };
    r.state = 'AT_PORT';
    yield { op: 'until', fn: () => port.outQ.length > 0, waitState: 'WAITING_PORT' };
    r.busy = true;
    yield { op: 'winch', to: portDepth(sim) };
    yield { op: 'grip' };
    const bin = port.takeOut();
    r.bin = bin.id; bin.loc = 'robot'; bin.robot = r.id; bin.port = -1;
    yield { op: 'winch', to: 0 };
    r.busy = false;
    if (bin.requests.length) {
      const next = sim.ports[bin.requests[0].port];
      next.inbound++;
      yield* deliverToPort(sim, r, next);
      return;
    }
    r.state = 'STORING';
    let i;
    while ((i = inv.chooseStoreColumn(bin, r.x, r.y, r.id)) < 0) yield { op: 'wait', t: 1 };
    g.colLock[i] = r.id;
    yield { op: 'move', x: g.cx(i), y: g.cy(i) };
    yield* dropOn(sim, r, i);
    g.colLock[i] = -1;
    sim.kpi.stores++;
  };

  // Consolidation: return dug-out blockers to their original column.
  T.RESTACK = function* (sim, r, t) {
    const g = sim.grid, inv = sim.inv, origin = t.origin;
    r.state = 'RESTACKING';
    for (const it of t.items) {
      if (g.stacks[origin].length >= g.Z) break;
      const s = g.stacks[it.tmp], b = it.bin;
      if (b.loc !== 'grid' || s[s.length - 1] !== b.id || g.colLock[it.tmp] >= 0 || b.requests.length || b.task) continue;
      g.colLock[it.tmp] = r.id; b.task = t;
      yield { op: 'move', x: g.cx(it.tmp), y: g.cy(it.tmp) };
      yield* liftTop(sim, r, it.tmp, b);
      g.colLock[it.tmp] = -1;
      yield { op: 'move', x: g.cx(origin), y: g.cy(origin) };
      yield* dropOn(sim, r, origin);
      b.task = null;
      sim.kpi.restacks++;
    }
    g.colLock[origin] = -1;
  };

  T.CHARGE = function* (sim, r, t) {
    const ch = t.charger;
    r.state = 'TO_CHARGER';
    yield { op: 'move', x: ch.x, y: ch.y };
    r.state = 'CHARGING'; r.busy = true;
    yield { op: 'charge' };
    r.busy = false; ch.robot = -1;
  };

  T.YIELD = function* (sim, r, t) {
    r.state = 'YIELDING';
    yield { op: 'move', x: t.x, y: t.y };
  };
  T.PARK = T.YIELD;

  WS.Robot = Robot;
  WS.Tasks = T;
  WS.ROBOT_STATES = STATES;
})((globalThis.WS = globalThis.WS || {}));
