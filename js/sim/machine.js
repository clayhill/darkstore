/* Fixed machines on rails: a shuttle running along one aisle level, a lift in
 * front of an aisle, later a stacker crane. Like robots they run generator
 * tasks, but they never leave their rail, so there is no routing or traffic:
 *   travel  move one coordinate to a target, or several at once (axes: a
 *           crane's mast and carriage); it ends when the slowest axis arrives
 *           and the machine has settled. The speed ramps up and down along a
 *           cosine (jerk-limited, as real drives do) in the same time as a
 *           constant acceleration would take, so travel times are those of a
 *           trapezoidal profile. With settleAxis the settling time scales
 *           with the speed that axis braked from (a mast sways less after a
 *           short hop), and the machine notes when it braked (`braked`).
 *   wait    a fixed time (load handler, transfer)
 *   until   wait for a condition (a full buffer clears)
 * Machines are WS.Movers like robots, so KPIs, the fleet table and the control
 * room treat them the same way; rx / ry is their control-room map position. */
(function (WS) {
  'use strict';

  // Time to cover distance d starting and ending at rest, and position at time t:
  // ramps of length ta with v = vp (1 − cos(π t / ta)) / 2, which cover the same
  // distance as a constant acceleration to vp would.
  function profile(d, v, a) {
    const dAcc = (v * v) / a;
    if (d < dAcc) { const ta = Math.sqrt(d / a); return { T: 2 * ta, ta, vp: a * ta, d, a }; }
    const ta = v / a; return { T: 2 * ta + (d - dAcc) / v, ta, vp: v, d, a };
  }
  function along(p, t) {
    if (t <= 0) return 0;
    if (t >= p.T) return p.d;
    const ramp = (u) => 0.5 * p.vp * (u - (p.ta / Math.PI) * Math.sin((Math.PI * u) / p.ta));
    if (t < p.ta) return ramp(t);
    if (t > p.T - p.ta) return p.d - ramp(p.T - t);
    return 0.5 * p.vp * p.ta + p.vp * (t - p.ta);
  }

  class Machine extends WS.Mover {
    constructor(sim, id, name) { super(sim, id, name); this.vel = {}; } // speed per moving coordinate
    get idle() { return !this.gen; }

    run(gen, task) { this.gen = gen; this.task = task || null; this.op = null; this.idleTime = 0; this.advance(); }

    update(dt) {
      this.prx = this.rx; this.pry = this.ry;
      const op = this.op;
      if (op) {
        op.t += dt;
        if (op.op === 'travel') {
          let v = 0;
          for (const x of op.axes) {
            const s = along(x.p, Math.min(op.t, x.p.T));
            const prev = this[x.prop];
            this[x.prop] = x.from + Math.sign(x.to - x.from) * s;
            this.distance += Math.abs(this[x.prop] - prev);
            this.vel[x.prop] = op.t < x.p.T ? Math.abs(this[x.prop] - prev) / dt : 0;
            v = Math.max(v, this.vel[x.prop]);
            if (x.prop === op.settleAxis && !x.stopped && op.t >= x.p.T) { x.stopped = true; this.braked = { at: this.sim.time - (op.t - x.p.T), k: x.p.vp / x.v, dir: Math.sign(x.to - x.from) }; }
          }
          this.v = v;
          if (op.t >= op.T + op.settle) { for (const x of op.axes) { this[x.prop] = x.to; this.vel[x.prop] = 0; } this.v = 0; this.finishOp(); }
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
          const axes = [];
          for (const x of o.axes || [o]) {
            const from = this[x.prop], d = Math.abs(x.to - from);
            if (d >= 1e-6) axes.push({ prop: x.prop, from, to: x.to, v: x.v, p: profile(d, x.v, x.a) });
          }
          if (!axes.length) continue;
          let settle = o.settle || 0;
          if (o.settleAxis) { const ax = axes.find((x) => x.prop === o.settleAxis); settle *= Math.max(0.3, ax ? ax.p.vp / ax.v : 0); }
          this.op = { op: 'travel', axes, T: Math.max(...axes.map((x) => x.p.T)), settle, settleAxis: o.settleAxis, t: 0 };
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
