/* People in FloorStack who walk about: the station operators on their way to
 * the canteen and back, the dock loaders with the roll cages, the pallet
 * mover at goods-in (their work is WS.TowerDocks'). A person runs generator
 * tasks, as machines do (js/sim/machine.js), with these steps:
 *   walk   along points on the floor they are on (a point may give a
 *          height z: the steps over a conveyor)
 *   wait   a fixed time
 *   until  wait for a condition
 * Between the floors people ride the goods lift in the staff core
 * (StaffLift): they call it, step in when its doors are open, and step out
 * at their floor. A station stops while its operator is away: a break
 * (WS.Disruptions) lasts until the operator is back at the station. */
(function (WS) {
  'use strict';
  const NAMES = ['Ana', 'Ben', 'Chloé', 'Daan', 'Eva', 'Femke', 'Gilles', 'Hanna', 'Ilse', 'Jonas', 'Kato', 'Lars', 'Mats', 'Nina', 'Omar', 'Pieter', 'Rosa', 'Sven', 'Tess', 'Wout'];

  class Person {
    constructor(sim, o) {
      Object.assign(this, { sim, x: 0, y: 0, z: 0, floor: 0, heading: -Math.PI / 2, state: 'IDLE', carry: null, gen: null, op: null, walked: 0, inLift: false }, o);
      this.px = this.x; this.py = this.y; this.pz = this.z;
    }
    get idle() { return !this.gen; }
    get moving() { return !!this.op && this.op.op === 'walk'; }
    run(gen) { this.gen = gen; this.op = null; this.advance(); }
    stop() { this.gen = null; this.op = null; }
    advance() {
      while (this.gen) {
        const r = this.gen.next();
        if (r.done) { this.gen = null; this.op = null; return; }
        const o = r.value;
        if (o.op === 'until' && o.fn()) continue;
        if (o.op === 'walk' && !o.pts.length) continue;
        this.op = Object.assign({ t: 0 }, o);
        return;
      }
    }
    update(dt) {
      this.px = this.x; this.py = this.y; this.pz = this.z;
      const op = this.op;
      if (!op) return;
      if (op.op === 'walk') {
        let m = (this.sim.cfg.walkSpeed / this.sim.cfg.cellSize) * dt;
        while (m > 1e-9 && op.pts.length) {
          const p = op.pts[0], dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy), z1 = p.z || 0;
          if (d > 1e-6) this.heading = Math.atan2(dy, dx);
          if (d <= m) { this.x = p.x; this.y = p.y; this.z = z1; m -= d; this.walked += d; op.pts.shift(); }
          else { const f = m / d; this.x += dx * f; this.y += dy * f; this.z += (z1 - this.z) * f; this.walked += m; m = 0; }
        }
        if (!op.pts.length) { this.op = null; this.advance(); }
      } else if (op.op === 'wait') { op.t += dt; if (op.t >= op.t1) { this.op = null; this.advance(); } }
      else if (op.op === 'until') { if (op.fn()) { this.op = null; this.advance(); } }
    }
  }
  const walk = (pts) => ({ op: 'walk', pts: pts.map((p) => Object.assign({}, p)) });
  const wait = (t) => ({ op: 'wait', t1: t });
  const until = (fn) => ({ op: 'until', fn });

  // The goods lift in the staff core: a car that stops at the floors called,
  // opens its doors, lets people out and in, and goes where its riders go.
  class StaffLift {
    constructor(sim) {
      const g = sim.grid;
      Object.assign(this, { sim, core: g.core, floor: 0, z: g.FZ[0], state: 'IDLE', door: 0, t: 0, target: 0, calls: [], riders: [], trips: 0 });
    }
    call(f) { if (!this.calls.includes(f)) this.calls.push(f); }
    // where rider k stands in the car
    spot(k) { const c = this.core; return { x: c.cx - 0.5 + (k % 2) * 0.9, y: c.cy - 0.6 + Math.floor(k / 2) * 1.0 }; }
    get open() { return this.state === 'OPEN'; }
    update(dt) {
      const sim = this.sim, g = sim.grid, v = sim.cfg.staffLiftV / WS.RACK_ZU;
      if (this.state === 'IDLE') {
        const f = this.calls.length ? this.calls[0] : null;
        if (f == null) return;
        this.target = f; this.state = f === this.floor ? 'OPENING' : 'MOVING';
      }
      if (this.state === 'MOVING') {
        const to = g.FZ[this.target], d = to - this.z, step = v * dt;
        if (Math.abs(d) <= step) { this.z = to; this.floor = this.target; this.state = 'OPENING'; this.trips++; }
        else { this.z += Math.sign(d) * step; this.floor = null; }
        for (const P of this.riders) P.z = this.z - g.FZ[P.floor];
        return;
      }
      if (this.state === 'OPENING') { this.door = Math.min(1, this.door + dt / 1.2); if (this.door >= 1) { this.state = 'OPEN'; this.t = 0; this.calls = this.calls.filter((f) => f !== this.floor); } return; }
      if (this.state === 'OPEN') {
        this.t += dt;
        const f = this.floor, busy = sim.people.list.some((P) => (P.liftStep === 'board' && P.floor === f) || (P.liftStep === 'leave' && P.floor === f && P.inLift));
        if (this.t >= 3.5 && !busy) this.state = 'CLOSING';
        return;
      }
      if (this.state === 'CLOSING') {
        this.door = Math.max(0, this.door - dt / 1.2);
        if (this.door > 0) return;
        const r = this.riders.find((P) => P.liftTo !== this.floor);
        if (r) { this.target = r.liftTo; this.state = 'MOVING'; return; }
        this.calls = this.calls.filter((f) => f !== this.floor);
        this.state = 'IDLE';
      }
    }
  }

  class TowerPeople {
    constructor(sim) {
      const g = sim.grid, L = sim.layout;
      this.sim = sim; this.lift = new StaffLift(sim); this.list = [];
      this.seats = g.seats.map((s) => Object.assign({ taken: null }, s));
      // an operator for every manned station, standing at it
      let k = 0;
      for (const p of sim.ports) {
        if (p.arm || p.decanter) continue;
        const h = L.operatorPos(p);
        p.person = this.add({ role: p.kind === 'PICK' ? 'Picker' : 'Goods-in operator', name: NAMES[(p.idx * 7 + 3) % NAMES.length], floor: p.floor, x: h.x, y: h.y, home: h, port: p, state: 'AT_STATION', look: 'port' + p.idx, vest: p.kind === 'PICK' ? '#f97316' : '#22c55e', heading: -Math.PI / 2 });
        k++;
      }
      this.breakNext = sim.cfg.breakEvery; this.breakIdx = 0;
    }
    add(o) { const P = new Person(this.sim, Object.assign({ id: this.list.length }, o)); this.list.push(P); return P; }

    // A break lasts until the operator is back at the station.
    beforeTick(dt) {
      const t = this.sim.time + dt;
      for (const p of this.sim.ports) {
        const P = p.person;
        if (!P || !p.away || P.state === 'AT_STATION') continue;
        if (t >= p.away.until - 1e-9) { p.away.until = t + 0.5; p.away.h.t1 = p.away.until; }
      }
    }
    update(dt) {
      const sim = this.sim, c = sim.cfg;
      // scheduled breaks, one operator after the other
      if (c.breakEvery > 0 && sim.time >= this.breakNext) {
        this.breakNext += c.breakEvery;
        const ports = sim.breakTargets();
        for (let n = 0; n < ports.length; n++) {
          const p = ports[this.breakIdx++ % ports.length];
          if (!p.away && p.person && p.person.state === 'AT_STATION' && !sim.ports.some((q) => q.away && q.floor === p.floor && q.kind === p.kind)) { sim.disrupt.operatorBreak(p); break; }
        }
      }
      for (const p of sim.ports) {
        const P = p.person;
        if (!P) continue;
        if (p.away && P.state === 'AT_STATION' && P.tripFor !== p.away) { P.tripFor = p.away; P.run(this.breakTrip(P)); }
        // all clear: back at the station straight away
        if (!p.away && P.state !== 'AT_STATION') this.home(P);
      }
      this.lift.update(dt);
      for (const P of this.list) P.update(dt);
    }
    home(P) {
      if (P.inLift) this.lift.riders.splice(this.lift.riders.indexOf(P), 1);
      if (P.seat) { P.seat.taken = null; P.seat = null; }
      P.stop(); Object.assign(P, { x: P.home.x, y: P.home.y, z: 0, floor: P.port.floor, inLift: false, liftStep: null, state: 'AT_STATION', heading: -Math.PI / 2 });
    }

    // ---------------------------------------------------------------- paths
    // From a station's operator to the walkway along the south side: a
    // picker steps over the takeaway conveyor on the steps behind them.
    fromStation(P) {
      const g = this.sim.grid, h = P.home, x = h.x, D = g.D;
      if (P.floor === 2) return [{ x, y: D + 2.55 }, { x, y: D + 2.9, z: 2.6 }, { x, y: D + 3.5, z: 2.6 }, { x, y: D + 3.85 }, { x, y: g.walkY[2] }];
      return [{ x, y: g.walkY[0] }];
    }
    toStation(P) { const pts = this.fromStation(P).reverse().slice(1); pts.push({ x: P.home.x, y: P.home.y }); return pts; }
    // along the walkway to the goods lift's door
    toLiftDoor(f, x) { const g = this.sim.grid, c = g.core, y = g.walkY[f]; return [{ x, y }, { x: c.doorX + 0.7, y }, { x: c.doorX + 0.7, y: c.cy }]; }
    // Ride the goods lift from the floor the person is on to floor `to`.
    *ride(P, to) {
      const L = this.lift, c = this.sim.grid.core;
      if (P.floor === to) return;
      P.liftStep = 'call'; P.liftTo = to;
      L.call(P.floor);
      yield until(() => L.open && L.floor === P.floor && L.riders.length < 4);
      P.liftStep = 'board';
      const s = L.spot(L.riders.length);
      L.riders.push(P);
      yield walk([{ x: c.doorX - 0.3, y: c.cy }, s]);
      P.inLift = true; P.liftStep = 'ride'; P.heading = 0;
      L.call(to);
      yield until(() => L.open && L.floor === to);
      P.floor = to; P.z = 0; P.liftStep = 'leave';
      yield walk([{ x: c.doorX - 0.3, y: c.cy }, { x: c.doorX + 0.7, y: c.cy }]);
      L.riders.splice(L.riders.indexOf(P), 1);
      P.inLift = false; P.liftStep = null;
    }
    // walk from where a person is to (x, y) on floor f, by the goods lift when f is another floor
    *goTo(P, f, x, y) {
      const g = this.sim.grid;
      if (P.floor !== f) {
        yield walk(this.toLiftDoor(P.floor, P.x));
        yield* this.ride(P, f);
        yield walk([{ x: g.core.doorX + 0.7, y: g.walkY[f] }, { x, y: g.walkY[f] }, { x, y }]);
      } else yield walk([{ x: P.x, y: g.walkY[f] }, { x, y: g.walkY[f] }, { x, y }]);
    }
    // An operator's break: out of the station, to the canteen on the ground
    // floor (by the goods lift from upstairs), a seat, and back in time.
    *breakTrip(P) {
      const sim = this.sim, p = P.port, t0 = sim.time;
      P.state = 'TO_BREAK';
      yield walk(this.fromStation(P));
      const seat = this.seats.find((s) => !s.taken) || this.seats[0];
      seat.taken = P; P.seat = seat;
      yield* this.goTo(P, 0, seat.x, seat.y);
      P.state = 'BREAK'; P.heading = seat.face;
      const out = sim.time - t0;
      yield until(() => !p.away || sim.time >= p.away.until - out - 1);
      seat.taken = null; P.seat = null;
      P.state = 'FROM_BREAK';
      const h = this.fromStation(P), w = h[h.length - 1];
      yield* this.goTo(P, p.floor, w.x, w.y);
      yield walk(this.toStation(P));
      P.state = 'AT_STATION'; P.heading = -Math.PI / 2;
      if (p.away) p.away.until = sim.time; // back early: the station starts again
    }
  }

  WS.TowerPeople = TowerPeople;
  WS.TowerPerson = Person;
  WS.TowerSteps = { walk, wait, until };
})((globalThis.WS = globalThis.WS || {}));
