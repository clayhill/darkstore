/* Fixed machines on rails: a shuttle running along one aisle level, a lift in
 * front of an aisle, later a stacker crane. Like robots they run generator
 * tasks, but they never leave their rail, so there is no routing or traffic:
 *   travel  move one coordinate to a target with a trapezoidal speed profile
 *   wait    a fixed time (load handler, transfer)
 *   until   wait for a condition (a full buffer clears)
 * Machines share the robots' state names, so KPIs, the fleet table and the
 * control room treat them the same way. */
(function (WS) {
  'use strict';

  // Time to cover distance d starting and ending at rest, and position at time t.
  function profile(d, v, a) {
    const dAcc = (v * v) / a;
    if (d < dAcc) { const ta = Math.sqrt(d / a); return { T: 2 * ta, ta, vp: a * ta, d, a }; }
    const ta = v / a; return { T: 2 * ta + (d - dAcc) / v, ta, vp: v, d, a };
  }
  function along(p, t) {
    if (t <= 0) return 0;
    if (t >= p.T) return p.d;
    if (t < p.ta) return 0.5 * p.a * t * t;
    if (t > p.T - p.ta) return p.d - 0.5 * p.a * (p.T - t) * (p.T - t);
    return 0.5 * p.a * p.ta * p.ta + p.vp * (t - p.ta);
  }

  class Machine {
    constructor(sim, id, name) {
      this.sim = sim; this.id = id; this.name = name;
      this.state = 'IDLE'; this.task = null; this.gen = null; this.op = null;
      this.stateTime = {}; WS.ROBOT_STATES.forEach((s) => (this.stateTime[s] = 0));
      this.battery = 100; this.busy = false; this.claims = new Set(); this.path = null; this.bin = null;
      this.v = 0; this.idleTime = 0; this.tasksDone = 0; this.lifts = 0; this.distance = 0;
      this.x = 0; this.y = 0; this.rx = 0; this.ry = 0; this.prx = 0; this.pry = 0; // control-room map position
    }
    get displayState() { return this.op && this.op.waitState ? this.op.waitState : this.state; }
    get bucket() { return WS.ROBOT_BUCKET[this.displayState] || 'IDLE'; }
    get idle() { return !this.gen; }

    run(gen, task) { this.gen = gen; this.task = task || null; this.op = null; this.idleTime = 0; this.advance(); }

    update(dt) {
      this.prx = this.rx; this.pry = this.ry;
      const op = this.op;
      if (op) {
        op.t += dt;
        if (op.op === 'travel') {
          const s = along(op.p, Math.min(op.t, op.p.T));
          const prev = this[op.prop];
          this[op.prop] = op.from + Math.sign(op.to - op.from) * s;
          this.distance += Math.abs(this[op.prop] - prev);
          this.v = op.t < op.p.T ? Math.abs(this[op.prop] - prev) / dt : 0;
          if (op.t >= op.p.T + op.settle) { this[op.prop] = op.to; this.v = 0; this.finishOp(); }
        } else if (op.op === 'wait') { if (op.t >= op.dur) this.finishOp(); }
        else if (op.op === 'until') { if (op.fn()) this.finishOp(); }
      } else if (!this.gen) this.idleTime += dt;
      this.place();
      this.stateTime[this.displayState] += dt;
    }
    place() {} // a machine type sets rx / ry for the control-room map here

    finishOp() { this.op = null; if (this.gen) this.advance(); }
    advance() {
      for (let guard = 0; guard < 50; guard++) {
        const res = this.gen.next();
        if (res.done) { this.gen = null; this.task = null; this.state = 'IDLE'; this.tasksDone++; return; }
        const o = res.value;
        if (o.op === 'travel') {
          const from = this[o.prop], d = Math.abs(o.to - from);
          if (d < 1e-6) continue;
          this.op = { op: 'travel', prop: o.prop, from, to: o.to, p: profile(d, o.v, o.a), settle: o.settle || 0, t: 0 };
          return;
        }
        if (o.op === 'wait') { this.op = { op: 'wait', dur: o.t, t: 0, waitState: o.waitState }; return; }
        if (o.op === 'until') { if (o.fn()) continue; this.op = { op: 'until', fn: o.fn, waitState: o.waitState, t: 0 }; return; }
      }
    }
  }

  WS.Machine = Machine;
  WS.travelTime = (d, v, a) => profile(d, v, a).T;
})((globalThis.WS = globalThis.WS || {}));
