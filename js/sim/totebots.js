/* Mobile robots instead of the pre-zone loop (cfg.transport 'robots'), for
 * the racking types built on WS.PreZoneSim: RailRunner, SkyStack. The
 * storage, its machines and the stations stay as they are; only the leg
 * between the aisle fronts and the stations changes (specs/prezone-robots.txt).
 *
 * The floor in front of the racking, from the back:
 *   y = B          the lift row (the machines' I/O point), not driven on
 *   B+1, B+2       stands: a short conveyor per aisle side, the outfeed on
 *                  the left rack's column, the infeed on the right one's
 *   handY = B+3    handover cells in front of the stands, parking in front
 *                  of the lifts and past the racking
 *   wY = B+4       a highway running left (west)
 *   eY = B+5       a highway running right (east), joined to the first at
 *                  both ends: together a one-way ring, as the loop was
 *   portY = B+6    each station's queue lane (two cells), its infeed cell
 *                  (a robot leaves a tote on the infeed) and its outfeed
 *                  cell (a robot takes one off the outfeed); parking and
 *                  chargers between the stations and past the last one
 * The cells off the ring are entered only from the highway next to them, so
 * robots that wait, hand over or charge never stand on the ring.
 *
 * A roller-top robot (WS.Robot) carries one tote: from an aisle's outfeed
 * stand to the station it was retrieved for, and from a station's outfeed to
 * an aisle's infeed stand, or straight on to the next station that wants it. */
(function (WS) {
  'use strict';
  const CELL = Object.assign(WS.CELL, { PARK: 7, STAND: 8, HAND: 9, PORT_OUT: 10 });
  const LANE = 2; // queue cells in front of a station's infeed cell

  // ---------------------------------------------------------------- floor
  // WS.Racking with a robot floor in front of it, for the router: type,
  // claim, passable(), enterGoal(), canPark(), heat.
  class RobotRacking extends WS.Racking {
    constructor(cfg, o) {
      super(cfg, o);
      const A = this.A, B = this.B, L = this.L, nPorts = this.ports.length;
      this.robots = true; this.oneRoute = true;
      this.standY = B + 1; this.handY = B + 3; this.wY = B + 4; this.eY = B + 5; this.portY = B + 6; this.D = B + 7;
      this.standEnd = this.handY - 0.3; // where a tote stands at the front of a stand, for a robot to take
      this.W = Math.max(A * 3, nPorts * 6) + 1;
      const n = this.W * this.D;
      this.type = new Uint8Array(n).fill(CELL.BLOCKED);
      this.claim = new Int16Array(n).fill(-1);
      this.colLock = new Int16Array(n).fill(-1);
      this.waitHeat = new Float32Array(n); this.passHeat = new Float32Array(n);
      this.portOf = new Int8Array(n).fill(-1); // station of a lane, infeed or outfeed cell
      this.laneIdx = new Int8Array(n).fill(-1); // 0, 1 = the lane, 2 = the infeed cell
      const set = (x, y, t) => (this.type[this.idx(x, y)] = t);
      for (let x = 0; x < this.W; x++) {
        set(x, this.standY, CELL.STAND); set(x, this.standY + 1, CELL.STAND);
        set(x, this.wY, CELL.HIGHWAY); set(x, this.eY, CELL.HIGHWAY);
        set(x, this.handY, x < A * 3 && x % 3 !== 1 ? CELL.HAND : CELL.PARK);
        set(x, this.portY, CELL.PARK);
      }
      for (let x = A * 3; x < this.W; x++) set(x, this.standY, CELL.BLOCKED), set(x, this.standY + 1, CELL.BLOCKED);
      for (let a = 0; a < A; a++) set(a * 3 + 1, this.standY, CELL.BLOCKED), set(a * 3 + 1, this.standY + 1, CELL.BLOCKED);
      // stations: lane, infeed and outfeed cell, the infeed above the station's infeed conveyor
      this.ports = this.ports.map((p, k) => {
        const sx = 2 + k * 6, y = this.portY, mapY = L + y - B;
        const lane = [{ x: sx - 2, y }, { x: sx - 1, y }], end = { x: sx, y }, out = { x: sx + 1, y };
        lane.concat([end]).forEach((c, j) => { const i = this.idx(c.x, c.y); this.type[i] = j < LANE ? CELL.LANE : CELL.PORT; this.portOf[i] = k; this.laneIdx[i] = j; });
        set(out.x, out.y, CELL.PORT_OUT); this.portOf[this.idx(out.x, out.y)] = k;
        return Object.assign({}, p, {
          drop: { x: sx, y: this.D - 1 }, lift: { x: sx + 1, y: this.D - 1 },
          dock: { lane, entry: { x: sx - 2, y: this.eY }, end, cells: lane.concat([end]) }, out,
          cells: [...lane, end, out].map((c) => ({ x: c.x, y: mapY })), // control-room map cells (WS.RobotRackMap)
        });
      });
      this.nCharge = Math.max(1, Math.ceil(WS.botCount(cfg) / 6));
      // chargers at the east end, on the station row first, then the handover row
      this.chargers = [];
      for (let x = this.W - 1; x >= 0 && this.chargers.length < this.nCharge; x--) {
        for (const y of [this.portY, this.handY]) {
          if (this.chargers.length >= this.nCharge || this.type[this.idx(x, y)] !== CELL.PARK) continue;
          set(x, y, CELL.CHARGER);
          this.chargers.push({ id: this.chargers.length, x, y, robot: -1 });
        }
      }
    }
    decayHeat(dt) {
      const f = Math.exp(-dt / 300);
      for (let i = 0; i < this.waitHeat.length; i++) { this.waitHeat[i] *= f; this.passHeat[i] *= f; }
    }

    // ---------- traffic rules (used by the router) ----------
    // The west highway runs left, the east one right; the west one turns
    // into the east one at x = 0 and back at the east end. A robot leaves a
    // cell off the ring onto the highway next to it.
    passable(i, r, from) {
      const t = this.type[i], x = this.cx(i), y = this.cy(i);
      if (from == null) return t === CELL.HIGHWAY;
      const fx = this.cx(from), fy = this.cy(from);
      if (y === this.wY) return (fy === y && fx === x + 1) || (fx === x && (fy === this.handY || (fy === this.eY && x === this.W - 1)));
      if (y === this.eY) return (fy === y && fx === x - 1) || (fx === x && (fy === this.portY || (fy === this.wY && x === 0)));
      if (t === CELL.LANE) return this.laneEnter(i, from);
      if (t === CELL.PARK) return this.fromRing(i, from); // a robot may step aside onto a parking cell
      return false;
    }
    // queue lanes in order: from the highway into the first cell, then on to the infeed cell
    laneEnter(i, from) {
      const j = this.laneIdx[i], p = this.ports[this.portOf[i]];
      const prev = j === 0 ? p.dock.entry : p.dock.cells[j - 1];
      return from === this.idx(prev.x, prev.y);
    }
    // a cell off the ring, entered from the highway next to it
    fromRing(i, from) {
      const x = this.cx(i), y = this.cy(i), fx = this.cx(from), fy = this.cy(from);
      return fx === x && ((y === this.handY && fy === this.wY) || (y === this.portY && fy === this.eY));
    }
    enterGoal(i, r, from) {
      const t = this.type[i];
      if (t === CELL.HIGHWAY || t === CELL.LANE) return this.passable(i, r, from);
      if (t === CELL.PORT) return this.laneEnter(i, from);
      if (t === CELL.PORT_OUT) { const p = this.ports[this.portOf[i]]; return from === this.idx(p.dock.end.x, p.dock.end.y) || this.fromRing(i, from); }
      if (t === CELL.HAND || t === CELL.PARK || t === CELL.CHARGER) return this.fromRing(i, from);
      return false;
    }
    canPark(i) { return this.type[i] === CELL.PARK; }
  }

  // Control-room map: the racking as levels × aisles (three columns per
  // aisle: left side, lane, right side), the lifts in the lane column, then
  // the floor from the lift row on, cell for cell.
  class RobotRackMap extends WS.RackMap {
    constructor(sim) {
      super(sim);
      const g = sim.grid;
      this.W = g.W; this.D = this.L + g.D - g.B; this.floorDY = this.L - g.B; // map row = floor row + floorDY
      const n = this.W * this.D;
      this.type = new Uint8Array(n); this.waitHeat = new Float32Array(n);
      this.claim = new Int16Array(n).fill(-1); this.colLock = new Int16Array(n).fill(-1);
      for (let i = 0; i < n; i++) { const f = this.floorCell(i); this.type[i] = f >= 0 ? g.type[f] : CELL.STORAGE; }
    }
    colX(a, part) { return a * 3 + (part === 3 ? 1 : part); }
    // the floor's chargers, where the map shows them
    get chargers() { return this.sim.grid.chargers.map((ch) => ({ id: ch.id, x: ch.x, y: ch.y + this.floorDY, down: ch.down, robot: ch.robot })); }
    set chargers(v) {}
    floorCell(i) { const y = this.cy(i) - this.floorDY, g = this.sim.grid; return y >= g.B && y < g.D ? g.idx(this.cx(i), y) : -1; }
    at(i) {
      const x = this.cx(i), y = this.cy(i), a = Math.floor(x / 3);
      if (a >= this.A) return null;
      if (y < this.L) return { a, level: this.L - 1 - y, part: x % 3 };
      if (y === this.L && x % 3 === 1) return { a, level: 0, part: 3 }; // the lift
      return null;
    }
    passable(i) { const t = this.type[i]; return this.floorCell(i) >= 0 && (t === CELL.HIGHWAY || t === CELL.LANE); }
    // the floor's traffic heat, for the map
    sync() { const g = this.sim.grid; for (let i = 0; i < this.type.length; i++) { const f = this.floorCell(i); if (f >= 0) this.waitHeat[i] = g.waitHeat[f]; } }
    mapFill(i, mix) {
      const y = this.cy(i), c = this.at(i);
      if (y < this.L) {
        if (!c) return '#070b12';
        if (c.part === 1) return '#0c1220';
        return mix('#131c2c', '#2a5d9e', this.sim.sideFill(c.a, c.level, c.part / 2));
      }
      if (c) return '#1a1508';
      return { [CELL.HIGHWAY]: '#0c1220', [CELL.STAND]: '#1c2433', [CELL.HAND]: '#2a2208', [CELL.PARK]: '#0d1a14', [CELL.LANE]: '#2a2208', [CELL.PORT]: '#3a2a0a', [CELL.PORT_OUT]: '#3a2a0a', [CELL.CHARGER]: '#0f3321' }[this.type[i]] || '#070b12';
    }
    get mapTitle() { return 'LEVELS × AISLES · FLOOR · fill = totes per rack side'; }
  }

  // ---------------------------------------------------------------- robot
  // A low robot with a powered roller deck at conveyor height. xfer: the
  // tote rolling on or off the deck, { id, take, at (conveyor position) }.
  class ToteBot extends WS.Robot {
    constructor(sim, id, x, y) { super(sim, id, x, y); this.xfer = null; }
    place() {}
  }

  // ---------------------------------------------------------------- tasks
  const T = { CHARGE: WS.Tasks.CHARGE, YIELD: WS.Tasks.YIELD, PARK: WS.Tasks.PARK };
  // Take a tote at a stand or a station's outfeed and leave it on a
  // station's infeed or an aisle's infeed stand.
  T.CARRY = function* (sim, r, t) {
    const bots = sim.bots, cfg = sim.cfg;
    r.state = 'MOVING_TO_TARGET';
    yield { op: 'move', x: t.from.x, y: t.from.y };
    r.state = 'AT_PORT';
    yield { op: 'until', fn: () => t.it.s >= t.it.len - 1e-6, waitState: 'WAITING_PORT' };
    r.busy = true; r.xfer = { id: t.bin.id, take: true, at: sim.convAt(t.it) };
    yield { op: 'wait', t: cfg.transferTime };
    r.xfer = null; r.busy = false;
    bots.taken(r, t);
    r.state = 'TRANSPORTING_TO_PORT';
    if (t.toPort != null) yield* WS.Tasks.throughLane(sim, r, sim.ports[t.toPort].dock);
    else yield { op: 'move', x: t.to.x, y: t.to.y };
    r.state = 'AT_PORT';
    yield { op: 'until', fn: () => bots.canDrop(t), waitState: 'WAITING_PORT' };
    r.busy = true; r.xfer = { id: t.bin.id, take: false, at: bots.dropAt(t) };
    yield { op: 'wait', t: cfg.transferTime };
    r.xfer = null; r.busy = false;
    bots.dropped(r, t);
  };

  // ---------------------------------------------------------------- dispatch
  class ToteBots {
    constructor(sim) {
      this.sim = sim;
      this.stats = { trips: 0, loaded: 0, empty: 0, paired: 0, drops: 0, standWait: 0, standN: 0, dist: 0 };
    }
    get grid() { return this.sim.grid; }
    get robots() { return this.list || (this.list = this.sim.fleet.filter((m) => m instanceof ToteBot)); }
    createRobots() {
      const sim = this.sim, g = this.grid, cells = [];
      for (const y of [g.handY, g.portY]) for (let x = 0; x < g.W; x++) if (g.type[g.idx(x, y)] === CELL.PARK) cells.push(g.idx(x, y));
      const n = Math.min(WS.botCount(sim.cfg), cells.length);
      for (let k = 0; k < n; k++) {
        const i = cells[Math.floor((k * cells.length) / n)], r = new ToteBot(sim, sim.fleet.length, g.cx(i), g.cy(i));
        r.name = 'R' + String(k + 1).padStart(2, '0');
        sim.fleet.push(r);
      }
      this.list = null;
      for (const p of sim.ports) p.back = []; // totes at the end of the outfeed, waiting for a robot
    }

    // ---------- stands ----------
    standX(a, side) { return a * 3 + side * 2 + 0.5; } // side 0 outfeed (left), 1 infeed (right)
    // a tote the aisle's lift puts on its outfeed stand at y
    toStand(a, bin, port, y) {
      const sim = this.sim, x = this.standX(a, 0), it = sim.convey(bin, [{ x, y }, { x, y: this.grid.standEnd }], null, false, { stand: a, port, t0: sim.time });
      bin.loc = 'stand';
      return it;
    }
    outStand(a) { return this.sim.conv.filter((it) => it.stand === a); }
    // the aisle's lift may put another tote on its outfeed stand
    outRoom(a) { return this.outStand(a).length < this.sim.cfg.standCap; }
    // returning totes the aisle's infeed stand still takes: those on it and on robots heading there count
    inRoom(aisle) { return this.sim.cfg.standCap - aisle.inQ.length - this.robots.filter((r) => r.task && r.task.toStand === aisle.a && !r.task.done).length; }
    // totes heading for an aisle on robots (the storage policy's aisle load)
    heading(a) { return this.robots.filter((r) => r.task && r.task.toStand === a && !r.task.done).length; }

    // ---------- stations ----------
    // A tote leaving a station rolls to the end of its outfeed, where a robot takes it.
    toStub(port, bin) {
      const sim = this.sim, T = sim.convTote(), p = sim.portExit(port), last = p[p.length - 1];
      const it = sim.convey(bin, [...p.slice(0, -1), { x: last.x, y: last.y + T.d + 0.02 }], null, true, {
        onLast: () => { port.back.push(bin); bin.loc = 'buffer'; bin.robot = -1; bin.backT = sim.time; bin.conv = it; },
      });
      return it;
    }
    // robots heading for a station's infeed: no more than its lane and infeed cell hold
    toPortCount(p) { return this.robots.filter((r) => r.task && r.task.toPort === p.idx && !r.task.done).length; }
    portRoom(p) { return this.toPortCount(p) < LANE + 1; }

    // ---------- the tasks' steps ----------
    taken(r, t) {
      const sim = this.sim, bin = t.bin;
      if (t.fromPort != null) { const p = sim.ports[t.fromPort]; p.back.splice(p.back.indexOf(bin), 1); bin.conv = null; }
      else { this.stats.standWait += sim.time - t.it.t0; this.stats.standN++; }
      sim.convRemove(t.it);
      bin.loc = 'robot'; bin.robot = r.id; r.bin = bin.id; t.took = true;
    }
    dropAt(t) {
      const g = this.grid;
      if (t.toPort != null) { const pp = this.sim.layout.portPath(this.sim.ports[t.toPort]); return pp.entry[0]; }
      return { x: this.standX(t.toStand, 1), y: g.standEnd };
    }
    canDrop(t) {
      if (t.toPort != null) return this.sim.ports[t.toPort].canAccept();
      const q = this.dropAt(t);
      return this.sim.convFree(q.x, q.y);
    }
    dropped(r, t) {
      const sim = this.sim, bin = t.bin;
      r.bin = null; t.done = true; this.stats.drops++;
      if (t.toPort != null) { sim.ports[t.toPort].receive(bin); return; }
      // onto the infeed stand: it queues there for the aisle's lift
      const aisle = sim.aisles[t.toStand], d = t.dest, q = this.dropAt(t);
      const it = sim.convey(bin, [q, { x: q.x, y: sim.ioEnd(aisle.a) }], null, true, {
        dest: d,
        onLast: () => { aisle.inQ.push({ bin, l: d.l, s: d.s, b: d.b, t: sim.time, conv: it }); bin.loc = 'queue'; },
        limit: () => sim.infeedLimit(aisle, it),
      });
    }

    // ---------- dispatch ----------
    // Jobs, the longest waiting first: the front tote of each aisle's
    // outfeed stand, and the tote at the end of each station's outfeed.
    // One robot at a time takes from a stand or an outfeed.
    jobs() {
      const sim = this.sim, g = this.grid, jobs = [], busy = new Set();
      for (const r of this.robots) { const t = r.task; if (t && t.type === 'CARRY' && !t.took) busy.add(t.fromKey); }
      for (const aisle of sim.aisles) {
        const key = 's' + aisle.a;
        if (busy.has(key)) continue;
        const it = this.outStand(aisle.a).sort((p, q) => q.s - p.s)[0];
        if (it) jobs.push({ key, it, bin: it.bin, t: it.t0, from: { x: aisle.a * 3, y: g.handY }, port: it.port });
      }
      for (const p of sim.ports) {
        const key = 'p' + p.idx, bin = p.back[0];
        if (busy.has(key) || !bin) continue;
        jobs.push({ key, it: bin.conv, bin, t: bin.backT, from: p.out, fromPort: p.idx });
      }
      return jobs.sort((a, b) => a.t - b.t);
    }
    // where the job's tote goes: a station that wants it, or an aisle with
    // room on its infeed stand and a free position (the storage policy)
    destination(j) {
      const sim = this.sim;
      if (j.port) return this.portRoom(j.port) ? { toPort: j.port.idx } : null;
      const bin = j.bin;
      if (bin.requests.length) {
        const p = sim.ports[bin.requests[0].port];
        return this.portRoom(p) ? { toPort: p.idx, next: true } : null;
      }
      const d = sim.chooseSlot(bin, (aisle) => this.inRoom(aisle) > 0);
      return d ? { toStand: d.a, dest: d, to: { x: d.a * 3 + 2, y: this.grid.handY } } : null;
    }
    idle() { return this.robots.filter((r) => !r.task && !r.down && r.battery >= this.sim.cfg.battLow * 0.5); }
    // cells along the one-way ring from a robot to a cell (a cell off the ring counts as the highway next to it)
    ringPos(x, y) { const g = this.grid; return y <= g.wY ? g.W - 1 - x : g.W + x; }
    ringDist(r, c) { const n = 2 * this.grid.W; return (((this.ringPos(c.x, c.y) - this.ringPos(r.x, r.y)) % n) + n) % n; }
    dispatch() {
      const sim = this.sim;
      this.charge();
      let idle = this.idle();
      for (const j of this.jobs()) {
        if (!idle.length) break;
        const d = this.destination(j);
        if (!d) continue;
        let r = null, bd = Infinity;
        for (const o of idle) { const dd = this.ringDist(o, j.from); if (dd < bd) { bd = dd; r = o; } }
        idle = idle.filter((o) => o !== r);
        if (d.next) sim.ports[d.toPort].inbound++;
        if (d.dest) sim.aisles[d.dest.a].resv[sim.si(d.dest.l, d.dest.s, d.dest.b)] = true;
        j.bin.robot = r.id;
        this.stats.trips++;
        if (bd > 0) this.stats.empty++;
        sim.assignTask(r, Object.assign({ type: 'CARRY', bin: j.bin, it: j.it, from: j.from, fromKey: j.key, fromPort: j.fromPort, priority: 5 }, d));
      }
      this.park();
    }
    // Robots low on battery go to a free charger.
    charge() {
      const sim = this.sim, cfg = sim.cfg;
      for (const r of this.robots) {
        if (r.task || r.down || r.battery >= cfg.battLow) continue;
        const ch = this.grid.chargers.filter((c) => c.robot < 0 && !c.down && this.grid.claim[this.grid.idx(c.x, c.y)] < 0).sort((a, b) => this.ringDist(r, a) - this.ringDist(r, b))[0];
        if (ch) { ch.robot = r.id; sim.assignTask(r, { type: 'CHARGE', charger: ch, priority: 9 }); sim.log('robot', `${r.name} battery ${r.battery.toFixed(0)}% → charger ${ch.id + 1}`); }
      }
    }
    // Idle robots off a parking cell (at a stand, a station or a charger) go to the nearest free one.
    park() {
      const sim = this.sim, g = this.grid;
      const taken = new Set(this.robots.filter((o) => o.task && o.task.type === 'PARK').map((o) => g.idx(o.task.x, o.task.y)));
      for (const r of this.robots) {
        if (r.task || r.down || r.idleTime < 1 || g.type[g.idx(r.x, r.y)] === CELL.PARK) continue;
        let best = -1, bd = Infinity;
        for (const y of [g.handY, g.portY]) for (let x = 0; x < g.W; x++) {
          const i = g.idx(x, y);
          if (g.type[i] !== CELL.PARK || taken.has(i) || g.claim[i] >= 0) continue;
          const d = this.ringDist(r, { x, y });
          if (d < bd) { bd = d; best = i; }
        }
        if (best < 0) continue;
        taken.add(best);
        sim.assignTask(r, { type: 'PARK', x: g.cx(best), y: g.cy(best), priority: 0 });
      }
    }
    tick() { if (this.sim.mapGrid.sync) this.sim.mapGrid.sync(); }
  }

  // robots for a scenario: transportRobots per station
  WS.botCount = (cfg) => Math.max(1, Math.round(cfg.transportRobots * (cfg.pickPorts + cfg.goodsInPorts)));
  WS.RobotRacking = RobotRacking;
  WS.RobotRackMap = RobotRackMap;
  WS.ToteBot = ToteBot;
  WS.ToteBots = ToteBots;
  WS.ToteBotTasks = T;
})((globalThis.WS = globalThis.WS || {}));
