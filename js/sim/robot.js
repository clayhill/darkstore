/* Battery robots on a grid (a WS.Mover): an independent state machine per robot plus the physical
 * constraints (speeds, winch by payload, gripper times, battery drain).
 * Tasks are generator functions that yield primitive operations:
 *   move · winch · grip · release · wait · until · charge
 * so multi-step jobs read top to bottom. Each storage type adds its own tasks
 * (js/cube/tasks.js, js/pod/sim.js); charging, yielding and parking are shared. */
(function (WS) {
  'use strict';

  class Robot extends WS.Mover {
    constructor(sim, id, x, y) {
      super(sim, id, 'R' + String(id + 1).padStart(2, '0'));
      this.x = x; this.y = y; this.axis = 'x';
      this.rx = x; this.ry = y; this.prx = x; this.pry = y;
      this.shift = 0; this.path = null; this.pi = 0; this.prog = 0; this.goal = null; this.detour = false;
      this.wait = 0; this.waitTotal = 0; this.patience = 1.5; this.evadeAt = 7; this.replanIn = 0;
      this.claims = new Set(); this.blocked = false; this.busy = false; this.moved = 0;
      this.lastResult = undefined;
      this.winch = 0; this.winchFrom = 0; this.winchTo = 0; this.winchDur = 0;
      this.battery = 70 + sim.rng() * 30;
      this.yieldCooldown = 0;
      sim.router.claimCell(this, sim.grid.idx(x, y));
    }
    get displayState() {
      if (this.op && this.op.op === 'move' && this.blocked) return 'WAITING_IN_TRAFFIC';
      return super.displayState;
    }

    start(task) {
      this.task = task; task.robot = this.id; task.started = this.sim.time;
      this.gen = this.sim.taskTypes[task.type](this.sim, this, task);
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

  const T = {};

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
})((globalThis.WS = globalThis.WS || {}));
