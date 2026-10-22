/* FloorStack: a fulfilment building of three floors. The first floor is
 * RailRunner's shuttle store (WS.ShuttleSim: shuttles, aisle lifts, the
 * racking and its storage policy); everything else is on the floors above
 * and below it, and the links between the floors are the new bottleneck.
 *  second floor  pick stations with put walls, and packing (the shared
 *                stations, WS.Port, and order flow, WS.OMS)
 *  ground floor  goods-in stations, supplier trucks and pallet staging, the
 *                parcel sorter with roll cages, outbound trucks at the dock
 *                doors, the canteen
 * Storage totes ride conveyor belts (WS.BeltNet, js/sim/belts.js) on every
 * floor: a loop in front of the racking on the first floor, a station loop
 * on the second and on the ground floor. A spiral conveyor carries them up
 * to the pick stations and another one back down (or, in 'lift' mode, a
 * tote lift each way); a tote lift links the store with goods-in on the
 * ground floor. Packed parcels drop two floors down the parcel spiral to the
 * sorter (WS.TowerDocks, js/tower/docks.js). People walk to the canteen on
 * their breaks and ride the goods lift between the floors (WS.TowerPeople,
 * js/tower/people.js). The building's geometry is WS.TowerRacking
 * (js/tower/building.js). */
(function (WS) {
  'use strict';
  const ZU = WS.RACK_ZU, R = WS.TOWER_R;
  const { liftRoll } = WS.ShuttleMachines;

  // ---------------------------------------------------------------- tote lifts
  // A vertical reciprocating conveyor: a carriage with room for a few totes
  // runs up and down a shaft between two floors. At each stop totes roll on
  // from the end of an infeed belt and off onto an outfeed belt, along `axis`
  // in direction `dir` (a tote lift is a flow-through one: in at one side,
  // out at the other).
  class Vrc extends WS.Machine {
    constructor(sim, id, name, o) {
      super(sim, id, name);
      Object.assign(this, o); // x, y, axis ('x' | 'y'), dir, stops [{ floor, z, in, out }], mapX
      this.z = o.stops[0].z; this.load = []; this.roll = null; this.trips = 0;
    }
    // where carriage slot k is (k = 0 the front, by the outfeed)
    slot(k) { const d = this.dir * (0.4 - 0.8 * k); return this.axis === 'x' ? { x: this.x + d, y: this.y } : { x: this.x, y: this.y + d }; }
    get floor() { const s = this.stops.find((q) => Math.abs(q.z - this.z) < 0.01); return s ? s.floor : null; }
    place() { this.rx = this.mapX; this.ry = this.sim.cfg.levels; }
  }
  function* vrcCycle(sim, m, from) {
    const cfg = sim.cfg, S = m.stops[from], T = m.stops[1 - from];
    m.state = 'MOVING_TO_TARGET';
    yield sim.vrcTravel(S.z);
    m.state = 'HANDLING';
    // the totes waiting at the end of the infeed roll on, up to the carriage's capacity
    while (m.load.length < cfg.vrcCap && sim.atEnd(S.in)) {
      const it = S.in.totes.shift(), k = cfg.vrcCap - 1 - m.load.length;
      it.belt = null; m.load.push(it); m.bin = it.bin.id; it.slot = k;
      const a = S.in.at(S.in.len), b = m.slot(k);
      m.roll = { it, a, b, t0: sim.time, dur: cfg.vrcTransfer };
      yield { op: 'wait', t: cfg.vrcTransfer };
      m.roll = null;
      // the next one rolls up behind it
      const t0 = sim.time;
      if (m.load.length < cfg.vrcCap) yield { op: 'until', fn: () => sim.atEnd(S.in) || sim.time - t0 > 2.5 };
    }
    m.state = 'TRANSPORTING_TO_PORT';
    yield sim.vrcTravel(T.z);
    m.trips++;
    // off onto the outfeed, the front tote first
    m.state = 'HANDLING';
    while (m.load.length) {
      yield { op: 'until', fn: () => T.out.hasRoom(), waitState: 'WAITING_PORT' };
      const it = m.load.shift();
      T.out.put(it); m.lifts++;
      m.bin = m.load.length ? m.load[0].bin.id : null;
      sim.onLink(m, T.floor);
      // the one behind rolls up to the front
      if (m.load.length) { const it2 = m.load[0], a = m.slot(it2.slot), b = m.slot(0); it2.slot = 0; m.roll = { it: it2, a, b, t0: sim.time, dur: cfg.vrcTransfer }; }
      yield { op: 'wait', t: cfg.vrcTransfer };
      m.roll = null;
    }
  }

  // ---------------------------------------------------------------- aisle lifts
  // As RailRunner's (js/shuttle/sim.js), but onto and off the first floor's belts.
  function* liftOut(sim, lift, l) {
    const cfg = sim.cfg, g = sim.grid, aisle = sim.aisles[lift.a], buf = aisle.outBuf[l], B = g.B;
    lift.state = 'MOVING_TO_TARGET';
    yield sim.liftTravel(sim.liftLevel(l));
    lift.state = 'HANDLING';
    yield { op: 'until', fn: () => buf.length && Math.abs(buf[0].pos - sim.bufOuter) < 1e-6 };
    let t0 = sim.time;
    const item = buf.shift(), bin = item.bin;
    bin.loc = 'lift'; lift.bin = bin.id; lift.side = 0;
    yield* liftRoll(sim, lift, sim.bufOuter, B + 0.5);
    yield { op: 'wait', t: Math.max(0, cfg.liftTransfer - (sim.time - t0)) };
    lift.state = 'TRANSPORTING_TO_PORT';
    yield sim.liftTravel(g.convZ);
    // off the carriage onto the aisle's outfeed, which starts on the carriage
    lift.state = 'HANDLING';
    yield { op: 'until', fn: () => aisle.out.hasRoom(), waitState: 'WAITING_PORT' };
    t0 = sim.time;
    const it = sim.newItem(bin, sim.ports[item.port]);
    aisle.out.put(it);
    lift.bin = null; lift.lifts++;
    yield { op: 'until', fn: () => it.belt !== aisle.out || it.s >= 0.8 };
    yield { op: 'wait', t: Math.max(0, cfg.liftTransfer - (sim.time - t0)) };
  }
  function* liftIn(sim, lift) {
    const cfg = sim.cfg, g = sim.grid, aisle = sim.aisles[lift.a], inn = aisle.inn;
    lift.state = 'MOVING_TO_TARGET';
    yield sim.liftTravel(g.convZ);
    lift.state = 'HANDLING';
    yield { op: 'until', fn: () => sim.atEnd(inn) };
    let t0 = sim.time;
    const it = inn.totes.shift(), bin = it.bin, d = it.dest, buf = aisle.inBuf[d.l];
    it.belt = null; aisle.heading--;
    bin.loc = 'lift'; lift.bin = bin.id; lift.side = 1;
    yield* liftRoll(sim, lift, inn.at(inn.len).y, g.B + 0.5);
    yield { op: 'wait', t: Math.max(0, cfg.liftTransfer - (sim.time - t0)) };
    lift.state = 'STORING';
    yield sim.liftTravel(sim.liftLevel(d.l));
    yield { op: 'until', fn: () => buf.length < cfg.bufferSize && buf.every((x) => x.pos <= sim.bufOuter - 1 + 1e-6), waitState: 'WAITING_PORT' };
    lift.state = 'HANDLING';
    t0 = sim.time;
    yield* liftRoll(sim, lift, g.B + 0.5, sim.bufOuter);
    buf.push({ bin, l: d.l, s: d.s, b: d.b, pos: sim.bufOuter, t: sim.time });
    bin.loc = 'buffer'; lift.bin = null;
    yield { op: 'wait', t: Math.max(0, cfg.liftTransfer - (sim.time - t0)) };
    // dual cycle: take an outbound tote from the same level on the way down
    if (aisle.outBuf[d.l].length && sim.outRoom(aisle)) yield* liftOut(sim, lift, d.l);
  }

  // ---------------------------------------------------------------- orders
  // The shared order flow, with a carrier per order (its dock door) and
  // packed parcels going down the parcel spiral instead of onto one truck.
  class TowerOMS extends WS.OMS {
    get truck() { return this.sim.docks ? this.sim.docks.truckView() : this._truck; }
    set truck(v) { this._truck = v; }
    createOrder(spec) {
      const o = super.createOrder(spec), r = this.sim.rng();
      o.carrier = WS.CARRIERS[r < 0.6 ? 0 : r < 0.85 ? 1 : 2];
      return o;
    }
    carrierFor(o) { return o.carrier; }
    updateTruck() {} // the dock doors have their own trucks (WS.TowerDocks)
    arrive(it) {
      if (it.kind === 'tote') return super.arrive(it);
      this.sim.docks.parcelIn(it.order);
    }
    onDecanted(ln, port) { super.onDecanted(ln, port); if (port) port.cases = (port.cases || 0) + 1; }
  }

  // ---------------------------------------------------------------- simulation
  class TowerSim extends WS.ShuttleSim {
    get kind() { return 'tower'; }
    get floorNames() { return ['G', '1', '2']; } // the views' floor slider
    defaults() { return WS.TOWER_CONFIG; }
    createGrid() { return new WS.TowerRacking(this.cfg, this.rackShape()); }
    createOMS() { return new TowerOMS(this); }
    describe() {
      const c = this.cfg, link = c.linkType === 'lift' ? 'a tote lift each way' : 'a spiral each way';
      return `FloorStack online · 3 floors · ${c.aisles} aisles × ${c.levels} levels on the first floor · ${c.pickPorts} pick stations upstairs, ${link} · ${c.goodsInPorts} goods-in stations on the ground floor · ${this.inv.bins.length} totes`;
    }
    newAisle(a) { return Object.assign(super.newAisle(a), { out: null, inn: null, heading: 0 }); }
    createMachines() {
      super.createMachines();
      this.buildFloors();
    }

    // ---------------------------------------------------------------- belts and links
    buildFloors() {
      const c = this.cfg, g = this.grid, cs = c.cellSize;
      this.net = new WS.BeltNet(this, c.beltSpeed / cs, c.totePitch / cs); this.net.zScale = g.zs;
      this.pnet = new WS.BeltNet(this, c.sorterSpeed / cs, c.parcelPitch / cs); this.pnet.zScale = g.zs;
      this.stats = { up: 0, down: 0, giDown: 0, giUp: 0, laps1: 0, laps2: 0, laps0: 0 };
      for (const w of ['up', 'down', 'giDown', 'giUp', 'sorted', 'parcels']) this.kpi.win[w] = [];
      this.vrcs = [];
      this.buildLinks();
      this.buildFirst();
      this.buildSecond();
      this.buildGround();
      this.people = new WS.TowerPeople(this);
      this.docks = new WS.TowerDocks(this);
    }
    // the segment of a loop that starts at arc length u, and the one that ends there
    segAt(segs, u) { return segs.find((s) => Math.abs(s.u0 - u) < 1e-6); }
    segTo(segs, u) { const k = segs.indexOf(this.segAt(segs, u)); return segs[(k + segs.length - 1) % segs.length]; }
    flat(f, o) { return Object.assign({ floor: f, z: this.grid.convZ }, o); }

    // The links between the floors, with their infeed and outfeed belts.
    buildLinks() {
      const c = this.cfg, g = this.grid, net = this.net, n = g.nearY, f = g.farY, s = g.lineY, CZ = g.convZ, FZ = g.FZ;
      const turns = (h) => Math.max(1, Math.round(h / (c.spiralPitch / ZU) - 0.5)) + 0.5;
      const lifts = c.linkType === 'lift', U = g.up, D = g.down, xg = g.giX;
      let id = this.fleet.length;
      const vrc = (name, o) => { const m = new Vrc(this, id++, name, Object.assign({ mapX: this.mapGrid.W - 1 - this.vrcs.length }, o)); this.vrcs.push(m); this.fleet.push(m); return m; };
      // up: from the first floor's near line to the second floor's station line
      this.links = {};
      if (lifts) {
        const inn = net.belt('to the lift up', [{ x: U.cx - R, y: n }, { x: U.cx - R, y: U.cy }, { x: U.cx - 0.9, y: U.cy }], this.flat(1)), out = net.belt('from the lift up', [{ x: U.cx + 0.4, y: U.cy }, { x: U.cx + R, y: U.cy }, { x: U.cx + R, y: s }, { x: g.XL2, y: s }], this.flat(2));
        inn.exit = () => null;
        this.links.up = { inn, out, vrc: vrc('Lift up', { x: U.cx, y: U.cy, axis: 'x', dir: 1, stops: [{ floor: 1, z: FZ[1] + CZ, in: inn, out: null }, { floor: 2, z: FZ[2] + CZ, in: null, out }] }) };
      } else {
        const inn = net.belt('to the spiral up', [{ x: U.cx - R, y: n }, { x: U.cx - R, y: U.cy }], this.flat(1));
        const sp = net.belt('spiral up', WS.helix(U.cx, U.cy, R, Math.PI, 1, turns(g.FH[1]), FZ[1] + CZ, FZ[2] + CZ), { floor: 1, kind: 'spiral' });
        const out = net.belt('from the spiral up', [{ x: U.cx + R, y: U.cy }, { x: U.cx + R, y: s }, { x: g.XL2, y: s }], this.flat(2));
        inn.exit = () => sp; net.link(inn, sp);
        sp.exit = (t) => { this.onLink(null, 2, t); return out; }; net.link(sp, out);
        this.links.up = { inn, out, sp };
      }
      // down: from the second floor's station line to the first floor's near line
      if (lifts) {
        const inn = net.belt('to the lift down', [{ x: g.X2, y: s }, { x: D.cx, y: s }, { x: D.cx, y: D.cy + 0.9 }], this.flat(2)), out = net.belt('from the lift down', [{ x: D.cx, y: D.cy - 0.4 }, { x: D.cx, y: n }, { x: g.X1, y: n }], this.flat(1));
        inn.exit = () => null;
        this.links.down = { inn, out, vrc: vrc('Lift down', { x: D.cx, y: D.cy, axis: 'y', dir: -1, stops: [{ floor: 2, z: FZ[2] + CZ, in: inn, out: null }, { floor: 1, z: FZ[1] + CZ, in: null, out }] }) };
      } else {
        const inn = net.belt('to the spiral down', [{ x: g.X2, y: s }, { x: D.cx, y: s }], this.flat(2));
        const sp = net.belt('spiral down', WS.helix(D.cx, D.cy, R, Math.PI / 2, -1, turns(g.FH[1]), FZ[2] + CZ, FZ[1] + CZ), { floor: 1, kind: 'spiral' });
        const out = net.belt('from the spiral down', [{ x: D.cx, y: n }, { x: g.X1, y: n }], this.flat(1));
        inn.exit = () => sp; net.link(inn, sp);
        sp.exit = (t) => { this.onLink(null, 1, t); return out; }; net.link(sp, out);
        this.links.down = { inn, out, sp };
      }
      // the tote lift between goods-in and the store: in from the north, out to the south on both floors
      const i0 = net.belt('to the tote lift', [{ x: xg, y: n }, { x: xg, y: g.giY - 0.9 }], this.flat(0)), o0 = net.belt('from the tote lift', [{ x: xg, y: g.giY + 0.4 }, { x: xg, y: s }], this.flat(0));
      const i1 = net.belt('to the tote lift', [{ x: xg, y: n }, { x: xg, y: g.giY - 0.9 }], this.flat(1)), o1 = net.belt('from the tote lift', [{ x: xg, y: g.giY + 0.4 }, { x: xg, y: f }], this.flat(1));
      i0.exit = i1.exit = () => null;
      this.links.gi = { i0, o0, i1, o1, vrc: vrc('Tote lift', { x: xg, y: g.giY, axis: 'y', dir: 1, stops: [{ floor: 1, z: FZ[1] + CZ, in: i1, out: o1 }, { floor: 0, z: FZ[0] + CZ, in: i0, out: o0 }] }) };
    }

    // First floor: the loop in front of the racking.
    buildFirst() {
      const g = this.grid, net = this.net, n = g.nearY, f = g.farY, X1 = g.X1, XW = g.XW, L = this.links;
      const pts = [{ x: X1, y: n }, { x: XW, y: n }, { x: XW, y: f }, { x: X1, y: f }, { x: X1, y: n }];
      const nu = (x) => X1 - x, fu = (x) => X1 - XW + (f - n) + (x - XW), upX = g.up.cx - R;
      const cuts = [nu(g.giX), nu(upX), fu(g.giX)];
      for (const aisle of this.aisles) cuts.push(nu(g.inX(aisle.a)), nu(g.outX(aisle.a)));
      const segs = (this.loop1 = WS.loopBelts(net, 'first-floor loop', pts, cuts, this.flat(1, { kind: 'loop' })));
      for (const aisle of this.aisles) {
        const a = aisle.a, ox = g.outX(a), ix = g.inX(a);
        aisle.out = net.belt(`aisle ${a + 1} outfeed`, [{ x: ox, y: g.B + 0.5 }, { x: ox, y: n }], this.flat(1));
        const join = this.segAt(segs, nu(ox));
        aisle.out.exit = () => join; net.link(aisle.out, join);
        aisle.inn = net.belt(`aisle ${a + 1} infeed`, [{ x: ix, y: n }, { x: ix, y: g.B + 1.3 }], this.flat(1));
        aisle.inn.exit = () => null;
        const at = this.segTo(segs, nu(ix)), next = at.next;
        at.exit = (t) => this.atInfeed(t, aisle, next); net.link(at, aisle.inn);
      }
      // the tote lift down to goods-in and the link up to the pick stations, off the near line
      const atGi = this.segTo(segs, nu(g.giX)), afterGi = atGi.next;
      atGi.exit = (t) => this.atLink(t, L.gi.i1, afterGi, 0); net.link(atGi, L.gi.i1);
      const atUp = this.segTo(segs, nu(upX)), afterUp = atUp.next;
      atUp.exit = (t) => this.atLink(t, L.up.inn, afterUp, 2); net.link(atUp, L.up.inn);
      // totes from goods-in join the far line, those from upstairs the near line; both go back into the racking
      const farJoin = this.segAt(segs, fu(g.giX));
      L.gi.o1.exit = (t) => { this.toStore(t); return farJoin; }; net.link(L.gi.o1, farJoin);
      L.down.out.exit = (t) => { this.toStore(t); return segs[0]; }; net.link(L.down.out, segs[0]);
      const last = segs[segs.length - 1];
      last.exit = (t) => { this.lapped(t, 'laps1', !!t.port); this.toStore(t); return segs[0]; };
    }

    // Second floor: the station line past the pick stations and the return line.
    buildSecond() {
      const g = this.grid, net = this.net, s = g.lineY, XL = g.XL2, X2 = g.X2, L = this.links;
      const pts = [{ x: XL, y: s }, { x: X2, y: s }, { x: X2, y: g.retY }, { x: XL, y: g.retY }, { x: XL, y: s }];
      const ports = this.ports.filter((p) => p.floor === 2), u = (x) => x - XL;
      const cuts = [u(X2)];
      for (const p of ports) cuts.push(u(p.drop.x + 0.5), u(p.drop.x + 1.5));
      const segs = (this.loop2 = WS.loopBelts(net, 'second-floor loop', pts, cuts, this.flat(2, { kind: 'loop' })));
      for (const p of ports) this.stationBelts(p, segs, u, 2);
      const at = this.segTo(segs, u(X2)), next = at.next;
      at.exit = (t) => this.atLink(t, L.down.inn, next, 2, true); net.link(at, L.down.inn);
      L.up.out.exit = () => segs[0]; net.link(L.up.out, segs[0]);
      const last = segs[segs.length - 1];
      last.exit = (t) => { this.lapped(t, 'laps2', true); return segs[0]; };
    }

    // Ground floor: the goods-in line, fed by the tote lift, and back to it.
    buildGround() {
      const g = this.grid, net = this.net, s = g.lineY, n = g.nearY, xg = g.giX, xl = xg - 2, X0 = g.X0, L = this.links;
      const pts = [{ x: xg, y: s }, { x: X0, y: s }, { x: X0, y: n }, { x: xl, y: n }, { x: xl, y: s }, { x: xg, y: s }];
      const ports = this.ports.filter((p) => p.floor === 0), u = (x) => x - xg, ret = X0 - xg + (s - n) + (X0 - xg);
      const cuts = [ret];
      for (const p of ports) cuts.push(u(p.drop.x + 0.5), u(p.drop.x + 1.5));
      const segs = (this.loop0 = WS.loopBelts(net, 'ground-floor loop', pts, cuts, this.flat(0, { kind: 'loop' })));
      for (const p of ports) this.stationBelts(p, segs, u, 0);
      // a tote going up waits here for the tote lift: everything on this line is going up but the odd tote that missed its station
      const at = this.segTo(segs, ret), next = at.next;
      at.exit = (t) => { this.rebind(t); return t.port && t.port.floor === 0 ? next : L.gi.i0; }; net.link(at, L.gi.i0);
      L.gi.o0.exit = () => segs[0]; net.link(L.gi.o0, segs[0]);
      const last = segs[segs.length - 1];
      last.exit = (t) => { this.lapped(t, 'laps0', true); return segs[0]; };
    }
    // A station's spur off the station line and its outfeed back onto it.
    stationBelts(p, segs, u, floor) {
      const g = this.grid, net = this.net, x = p.drop.x, s = g.lineY, D = g.D;
      p.spur = net.belt(`${p.code} infeed`, [{ x: x + 0.5, y: s }, { x: x + 0.5, y: D }], this.flat(floor));
      p.spur.exit = (t) => this.intoPort(t, p);
      const at = this.segTo(segs, u(x + 0.5)), next = at.next;
      at.exit = (t) => this.atStation(t, p, next); net.link(at, p.spur);
      p.outBelt = net.belt(`${p.code} outfeed`, [{ x: x + 1, y: D + 1.3 }, { x: x + 1.5, y: D + 1.3 }, { x: x + 1.5, y: D }, { x: x + 1.5, y: s }], this.flat(floor));
      const join = this.segAt(segs, u(x + 1.5));
      p.outBelt.exit = () => join; net.link(p.outBelt, join);
      p.cases = 0;
    }

    // ---------------------------------------------------------------- routing
    newItem(bin, port) { bin.loc = 'conveyor'; return { kind: 'tote', bin, port: port || null, dest: null, born: this.time, laps: 0 }; }
    atEnd(b) { const t = b && b.front; return !!t && t.s >= b.len - 1e-6; }
    // A tote on its way back to the racking that a station asks for
    // meanwhile goes to that station instead (once there is room for it).
    rebind(t) {
      if (t.port || !t.bin.requests.length) return;
      const p = this.ports[t.bin.requests[0].port];
      if (this.portFull(p)) return;
      t.port = p; p.inbound++;
      const d = t.dest;
      if (d) { this.aisles[d.a].resv[this.si(d.l, d.s, d.b)] = false; this.aisles[d.a].heading--; t.dest = null; }
      this.stats.rebound = (this.stats.rebound || 0) + 1;
    }
    // A tote going back into the racking gets its place once it is on the
    // first floor: fast movers near the aisle fronts, the aisle with the least work.
    toStore(t) {
      this.rebind(t);
      if (t.port || t.dest) return;
      const d = this.chooseSlot(t.bin);
      if (!d) return;
      this.aisles[d.a].resv[this.si(d.l, d.s, d.b)] = true; this.aisles[d.a].heading++;
      t.dest = d;
    }
    // At an aisle's infeed: in, when it is the tote's aisle and there is
    // room; otherwise on to the next aisle along with room, or once round.
    atInfeed(t, aisle, next) {
      this.rebind(t);
      const d = t.dest;
      if (!d || d.a !== aisle.a) return next;
      if (aisle.inn.hasRoom()) return aisle.inn;
      const g = this.grid, room = (q) => q.inn.hasRoom();
      let nd = this.chooseSlot(t.bin, (q) => g.inX(q.a) < g.inX(aisle.a) && room(q));
      if (!nd) { nd = this.chooseSlot(t.bin, (q) => q !== aisle) || d; this.lapped(t, 'laps1', true); }
      if (nd !== d) {
        const A = this.aisles;
        A[d.a].resv[this.si(d.l, d.s, d.b)] = false; A[d.a].heading--;
        A[nd.a].resv[this.si(nd.l, nd.s, nd.b)] = true; A[nd.a].heading++;
        t.dest = nd;
      }
      return next;
    }
    // At a link off a loop: in, for a tote headed for floor `floor` (with
    // away: for one headed anywhere else), when the link has room.
    atLink(t, inn, next, floor, away) {
      this.rebind(t);
      const here = !!t.port && t.port.floor === floor;
      return (away ? !here : here) && inn.hasRoom() ? inn : next;
    }
    // At a station's spur: in, for the tote it waits for, while the spur and
    // the station's infeed hold it.
    atStation(t, p, next) {
      if (t.port === p && p.spur.hasRoom() && p.queueRoom() - p.spur.totes.length > 0) return p.spur;
      return next;
    }
    intoPort(t, p) {
      if (!p.canAccept()) return null;
      p.receive(t.bin);
      return true;
    }
    lapped(t, key, count) {
      if (!count || this.time - (t.lapT || -1e9) < 5) return;
      t.lapT = this.time; t.laps++; this.stats[key]++;
      this.kpi.recirculated = (this.kpi.recirculated || 0) + 1;
    }
    // a tote reached another floor by a link (m: the lift that carried it, null: a spiral, counted once per tote)
    onLink(m, floor, t) {
      if (t) { if (t.landed === floor) return; t.landed = floor; }
      const k = m === this.links.gi.vrc ? (floor === 0 ? 'giDown' : 'giUp') : floor === 2 ? 'up' : 'down';
      this.stats[k]++; this.kpi.push(k);
    }

    // ---------------------------------------------------------------- stations
    // A tote done at a station goes onto its outfeed: on to the next station
    // that wants it, or back to the racking.
    onPortOut(port, bin) {
      port.takeOut();
      let next = null;
      if (bin.requests.length) { next = this.ports[bin.requests[0].port]; next.inbound++; }
      const it = this.newItem(bin, next);
      port.outBelt.put(it);
      port.leaving = it;
    }
    portOutOk(port) { return port.outBelt.hasRoom(); }
    portClear(port) { return port.outBelt.hasRoom(); } // the tote that left has cleared the pick position

    // ---------------------------------------------------------------- the store's lifts
    // The first floor's loop fill; the aisle lifts send no more totes out above loopLimit.
    loopFill() { let n = 0; for (const s of this.loop1) n += s.totes.length; return (n * this.net.pitch) / this.loop1.len; }
    outSpace() { return this.loopFill() < this.cfg.loopLimit ? 1 : 0; }
    outRoom() { return this.loopFill() < this.cfg.loopLimit; }
    aisleLoad(aisle) { return aisle.inn.totes.length + aisle.heading; }
    preZoneLines() { return []; } // the belts are drawn instead (js/tower/render.js)
    dispatchLift(aisle) {
      const cfg = this.cfg, lift = aisle.lift;
      if (!lift.idle) return;
      let best = null;
      if (this.outRoom(aisle)) for (let l = 0; l < cfg.levels; l++) { const o = aisle.outBuf[l][0]; if (o && (!best || o.t < best.t)) best = { t: o.t, out: l }; }
      // the tote at the end of the infeed goes up, first when the infeed is full
      const h = aisle.inn.front;
      if (h && this.atEnd(aisle.inn) && aisle.inBuf[h.dest.l].length < cfg.bufferSize) {
        const since = this.time - h.wait;
        if (!best || since < best.t || !aisle.inn.hasRoom()) best = { in: h };
      }
      if (!best) return;
      if (best.in) lift.run(liftIn(this, lift), { type: 'IN', bin: best.in.bin });
      else lift.run(liftOut(this, lift, best.out), { type: 'OUT', bin: aisle.outBuf[best.out][0].bin });
    }
    vrcTravel(to) { const c = this.cfg; return { op: 'travel', prop: 'z', to, v: c.vrcV / ZU, a: c.vrcA / ZU, settle: 0.3 }; }
    // A tote lift serves the stop where totes have waited longest; it stays
    // where it is when totes wait there too.
    dispatchVrcs() {
      for (const m of this.vrcs) {
        if (!m.idle) continue;
        let best = -1, bw = -Infinity;
        m.stops.forEach((s, k) => {
          if (!this.atEnd(s.in)) return;
          const w = s.in.front.wait + (Math.abs(s.z - m.z) < 0.01 ? 5 : 0);
          if (w > bw) { bw = w; best = k; }
        });
        if (best >= 0) m.run(vrcCycle(this, m, best), { type: 'LIFT', bin: m.stops[best].in.front.bin, to: m.stops[1 - best].floor });
      }
    }
    dispatch() { super.dispatch(); this.dispatchVrcs(); }

    // ---------------------------------------------------------------- tick
    tick() {
      const dt = this.cfg.tick;
      this.people.beforeTick(dt);
      super.tick();
      this.net.update(dt);
      this.pnet.update(dt);
      this.docks.update(dt);
      this.people.update(dt);
    }
    // who can go on a break: the station operators
    breakTargets() { return this.ports.filter((p) => !p.arm && !p.decanter); }
    // totes on the move between the floors, for the views and the control room
    get spiralTotes() { const L = this.links; return (L.up.sp ? L.up.sp.totes.length : 0) + (L.down.sp ? L.down.sp.totes.length : 0); }
    extraAlerts() {
      const out = [], L = this.links;
      for (const m of this.vrcs) if (m.displayState === 'WAITING_PORT') out.push({ sev: 'warning', key: 'vrc' + m.id, title: `${m.name} blocked`, msg: 'Its outfeed is full: totes queue in the shaft' });
      const q = (b) => b.totes.length * this.net.pitch / b.len;
      if (q(L.up.inn) > 0.95 && L.up.inn.totes.length >= 2) out.push({ sev: 'warning', key: 'upq', title: 'Totes queue for the way up', msg: `${L.up.inn.totes.length} totes wait at the ${L.up.sp ? 'spiral' : 'lift'} to the pick stations` });
      if (this.loopFill() > this.cfg.loopLimit) out.push({ sev: 'info', key: 'loop1', title: 'First-floor loop busy', msg: `${Math.round(this.loopFill() * 100)}% full · the aisle lifts hold totes back` });
      if (this.docks) out.push(...this.docks.alerts());
      return out;
    }
  }

  WS.TowerSim = TowerSim;
  WS.TowerOMS = TowerOMS;
  WS.Vrc = Vrc;
})((globalThis.WS = globalThis.WS || {}));
