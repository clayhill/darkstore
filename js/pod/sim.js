/* PodSwarm: robots drive under shelving pods, lift them and carry them to a
 * station, where the operator picks from the face that is turned towards
 * them. The pod then goes back to a free cell (not necessarily the one it came
 * from), so busy pods drift towards the stations over time.
 * Reuses the shared order flow, stations, inventory, router and KPIs; this file
 * holds what is specific to pods: seeding, dispatch, tasks and face turning. */
(function (WS) {
  'use strict';
  const TERMS = { unit: 'pod', Unit: 'Pod', units: 'pods', Units: 'Pods', store: 'floor', Store: 'Floor', port: 'station', ports: 'stations' };
  const STATE_LABELS = { MOVING_TO_TARGET: 'To pod', TRANSPORTING_TO_PORT: 'To station', AT_PORT: 'At station', STORING: 'Returning pod', WAITING_PORT: 'Waiting (queue)' };
  const LEGEND = ['IDLE', 'MOVING_TO_TARGET', 'LIFTING_POD', 'TRANSPORTING_TO_PORT', 'AT_PORT', 'STORING', 'WAITING_IN_TRAFFIC', 'WAITING_PORT', 'TO_CHARGER', 'CHARGING'];
  const QUARTER = Math.PI / 2;

  // Station positions: the pod stands on the station cell at the floor edge,
  // the operator just outside it and the put wall to the operator's right.
  class PodLayout extends WS.Layout {
    slotPos(port, k) { return { x: port.drop.x + 1.75 + k * 0.52, y: this.D + 0.8 }; }
    spurX(port) { return this.slotPos(port, this.sim.cfg.toteSlots - 1).x + 0.6; }
    pickPos(port) { return { x: port.drop.x + 0.5, y: port.drop.y + 0.5 }; }
    operatorPos(port) { return port.face === 'front' ? { x: port.drop.x + 0.5, y: this.D + 0.85 } : { x: this.W + 0.85, y: port.drop.y + 0.5 }; }
  }

  // ---------------------------------------------------------------- tasks
  const T = {};

  function* liftPod(sim, r, pod) {
    const g = sim.grid;
    r.state = 'LIFTING_POD'; r.busy = true;
    yield { op: 'wait', t: sim.cfg.liftTime };
    g.podAt[g.idx(r.x, r.y)] = null; g.version++;
    pod.loc = 'robot'; pod.robot = r.id; r.bin = pod.id; r.lifts++;
    r.busy = false;
  }
  function* lowerPod(sim, r, pod) {
    const g = sim.grid, i = g.idx(r.x, r.y);
    r.state = 'LIFTING_POD'; r.busy = true;
    yield { op: 'wait', t: sim.cfg.liftTime };
    g.podAt[i] = pod.id; g.podTarget[i] = -1; g.version++;
    pod.loc = 'grid'; pod.x = r.x; pod.y = r.y; pod.robot = -1; r.bin = null;
    r.busy = false;
  }
  // Queue through the station's lane one cell at a time, present the pod and
  // wait until the operator has worked every line on it.
  function* present(sim, r, port, pod) {
    const g = sim.grid;
    if (r.x !== port.drop.x || r.y !== port.drop.y) {
      r.state = 'TRANSPORTING_TO_PORT';
      yield { op: 'move', x: port.entry.x, y: port.entry.y };
      // move up to the farthest free cell, wait when the pod ahead hasn't moved on
      const cells = [...port.lane, port.drop], free = (c) => g.claim[g.idx(c.x, c.y)] < 0;
      for (let k = -1; k < cells.length - 1;) {
        yield { op: 'until', fn: () => free(cells[k + 1]), waitState: 'WAITING_PORT' };
        let j = k + 1;
        while (j + 1 < cells.length && free(cells[j + 1])) j++;
        yield { op: 'move', x: cells[j].x, y: cells[j].y };
        k = cells.findIndex((c) => c.x === r.x && c.y === r.y);
      }
    }
    r.state = 'AT_PORT';
    yield { op: 'until', fn: () => port.canAccept(), waitState: 'WAITING_PORT' };
    port.receive(pod);
    yield { op: 'until', fn: () => port.outQ[0] === pod };
    port.takeOut();
    pod.loc = 'robot'; pod.robot = r.id; pod.port = -1;
  }

  // Fetch a pod, take it to every station that wants it, then put it back on
  // the free cell the storage policy picks.
  T.RETRIEVE = function* (sim, r, t) {
    const g = sim.grid, pod = t.bin;
    r.state = 'MOVING_TO_TARGET';
    yield { op: 'move', x: pod.x, y: pod.y };
    yield* liftPod(sim, r, pod);
    let port = sim.ports[t.port];
    for (;;) {
      yield* present(sim, r, port, pod);
      if (!pod.requests.length) break;
      // more lines for this station came in while it was being picked: stay
      const q = pod.requests.find((x) => x.port === port.idx) || pod.requests[0];
      port = sim.ports[q.port];
      port.inbound++;
    }
    r.state = 'STORING';
    let i;
    while ((i = sim.chooseReturnCell(pod, r)) < 0) yield { op: 'wait', t: 1 };
    g.podTarget[i] = r.id;
    yield { op: 'move', x: g.cx(i), y: g.cy(i) };
    yield* lowerPod(sim, r, pod);
    sim.kpi.stores++;
  };
  T.CHARGE = WS.Tasks.CHARGE;
  T.YIELD = WS.Tasks.YIELD;
  T.PARK = WS.Tasks.PARK;

  // ---------------------------------------------------------------- simulation
  class PodSim extends WS.Sim {
    get kind() { return 'pod'; }
    get terms() { return TERMS; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    get taskTypes() { return T; }
    defaults() { return WS.POD_CONFIG; }
    createGrid() { return new WS.PodFloor(this.cfg); }
    createLayout() { return new PodLayout(this); }
    describe() { return `Floor ${this.grid.W}×${this.grid.D} online · ${this.robots.length} robots · ${this.inv.bins.length} pods · ${this.ports.length} stations`; }
    storageCapacity() { return this.grid.type.reduce((s, t) => s + (t === WS.CELL.STORAGE ? 1 : 0), 0); }
    get perFace() { return this.cfg.podShelves * this.cfg.podSlots; }
    faceOf(comp) { return Math.floor(comp / this.perFace); }
    compLabel(k) {
      const per = this.perFace, s = this.cfg.podSlots, r = k % per;
      return `face ${this.faceOf(k) + 1} · shelf ${Math.floor(r / s) + 1} · bin ${(r % s) + 1}`;
    }

    seed() {
      const cfg = this.cfg, g = this.grid, inv = this.inv, rng = this.rng;
      inv.seedCatalog(cfg.products, rng);
      inv.computePortDistances();
      const cells = [];
      for (let i = 0; i < g.type.length; i++) if (g.isStorage(i)) cells.push(i);
      for (let k = cells.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [cells[k], cells[j]] = [cells[j], cells[k]]; }
      const nPods = Math.round(cells.length * cfg.podFill), ncomp = 4 * this.perFace;
      const pods = [];
      for (let k = 0; k < nPods; k++) {
        const pod = inv.createBin(ncomp, { prefix: 'POD-', digits: 4, asset: 30, vol: ncomp * cfg.podBinVol });
        pod.rot = Math.floor(rng() * 4); pod.angle = pod.rot * QUARTER;
        const i = cells[k];
        g.podAt[i] = pod.id; pod.loc = 'grid'; pod.x = g.cx(i); pod.y = g.cy(i);
        pods.push(pod);
      }
      // stock: every product somewhere, then demand-weighted; one SKU per pod at most once
      const prods = inv.products, w = prods.map((p) => Math.pow(p.demand, 0.3)), tot = w.reduce((a, b) => a + b, 0);
      let k = 0;
      for (const pod of pods) {
        for (let c = 0; c < ncomp; c++) {
          if (rng() >= cfg.stockedRatio) continue;
          const p = k < prods.length ? prods[k++] : prods[rng.weighted(w, tot)];
          if (pod.comps.some((x) => x.gtin === p.gtin)) continue;
          const q = Math.max(1, Math.round(inv.compCap(pod, p) * (0.25 + rng() * 0.75)));
          inv.setComp(pod, c, p.gtin);
          pod.comps[c].qty = q; p.onHand += q;
        }
      }
      const dTot = prods.reduce((s, p) => s + p.demand, 0);
      for (const p of prods) {
        const share = p.demand / dTot;
        p.hits = cfg.orderRate * 1.9 * share;
        p.min = Math.max(4, Math.ceil(cfg.orderRate * 2.2 * share * 2));
        p.max = p.min * 4;
      }
      inv.classify();
      // robots start on empty storage cells, then on highways
      const free = cells.slice(nPods);
      for (let i = 0; i < g.type.length; i++) if (g.type[i] === WS.CELL.HIGHWAY) free.push(i);
      for (let r = 0; r < cfg.robots && free.length; r++) {
        const i = free.splice(r < cells.length - nPods ? 0 : Math.floor(rng() * free.length), 1)[0];
        this.robots.push(new WS.Robot(this, r, g.cx(i), g.cy(i)));
      }
    }

    // Cost of fetching a pod for an order line: travel to the stations. A pod
    // that is already on its way somewhere is cheap, it will pass by anyway.
    fetchCost(pod) {
      if (pod.loc !== 'grid') return 10;
      return this.inv.portDist[this.inv.binColumn(pod)] * 0.4 + (pod.task ? -3 : 0);
    }
    onPortOut() {} // the robot stays under the pod and collects it itself

    // ---------- pod faces ----------
    // A pod's face k points in direction (k + rot) % 4, directions being
    // +y (front), +x (right), -y, -x. The operator looks at the pod from the
    // front at pick stations and from the right at goods-in stations.
    presentDir(port) { return port.face === 'front' ? 0 : 1; }
    facing(pod, port) { return (this.presentDir(port) - pod.rot + 4) % 4; }
    sequenceLines(pod, lines, port) {
      const f0 = this.facing(pod, port), turns = (ln) => (this.faceOf(ln.comp) - f0 + 4) % 4;
      lines.sort((a, b) => turns(a) - turns(b));
    }
    lineOverhead(pod, ln, prev, port) {
      const pf = prev ? this.faceOf(prev.comp) : this.facing(pod, port), d = (this.faceOf(ln.comp) - pf + 4) % 4;
      return Math.min(d, 4 - d) * this.cfg.podRotate;
    }
    // Turn each presented pod towards the face of the line being worked.
    turnPods(dt) {
      for (const p of this.ports) {
        const j = p.job;
        if (!j) continue;
        const pod = j.bin, ln = p.currentLine;
        if (ln) pod.rot = (this.presentDir(p) - this.faceOf(ln.comp) + 4) % 4;
        const target = pod.rot * QUARTER, two = Math.PI * 2;
        const diff = ((target - pod.angle + Math.PI) % two + two) % two - Math.PI, step = (QUARTER / this.cfg.podRotate) * dt;
        pod.angle = Math.abs(diff) <= step ? target : (pod.angle + Math.sign(diff) * step + two) % two;
      }
    }

    // Return cell for a pod: velocity-based by default (busy pods near the
    // stations), or simply the nearest free cell, or a random one.
    chooseReturnCell(pod, r) {
      const g = this.grid, inv = this.inv, pol = this.cfg.putawayPolicy;
      const target = { A: 0, B: 0.35, C: 0.75, E: 0.6 }[inv.binClass(pod)];
      let best = -1, bestS = Infinity;
      for (let i = 0; i < g.type.length; i++) {
        if (!g.isStorage(i) || g.podAt[i] || g.podTarget[i] >= 0) continue;
        const travel = WS.U.manhattan(r.x, r.y, g.cx(i), g.cy(i));
        let s;
        if (pol === 'random') s = this.rng();
        else if (pol === 'nearest') s = travel;
        else s = Math.abs(inv.portDist[i] / inv.maxPortDist - target) * 26 + travel * 0.12;
        if (s < bestS) { bestS = s; best = i; }
      }
      return best;
    }

    dispatch() {
      const g = this.grid, cfg = this.cfg;
      for (const pod of this.binsWithRequests) {
        if (pod.loc === 'grid' && !pod.task && pod.requests.length) {
          const goodsIn = this.ports[pod.requests[0].port].kind === 'GOODS_IN';
          pod.task = this.newTask({ type: 'RETRIEVE', bin: pod, port: pod.requests[0].port, priority: goodsIn ? 4 : 5 });
        }
      }
      for (const r of this.robots) {
        if (r.task || r.battery >= cfg.battLow) continue;
        const ch = g.chargers.filter((c) => c.robot < 0).sort((a, b) => WS.U.manhattan(r.x, r.y, a.x, a.y) - WS.U.manhattan(r.x, r.y, b.x, b.y))[0];
        if (ch) { ch.robot = r.id; this.assignTask(r, { type: 'CHARGE', charger: ch, priority: 9 }); this.log('robot', `${r.name} battery ${r.battery.toFixed(0)}% → charger ${ch.id + 1}`); }
      }
      let idle = this.robots.filter((r) => !r.task && r.battery >= cfg.battLow * 0.5);
      if (!idle.length) return;
      const now = this.time, eff = (t) => t.priority + (now - t.created) / 60;
      const pending = this.tasks.filter((t) => t.robot < 0).sort((a, b) => eff(b) - eff(a));
      for (const t of pending) {
        if (!idle.length) break;
        if (t.type !== 'RETRIEVE' || t.bin.loc !== 'grid') continue;
        t.port = t.bin.requests[0].port;
        const port = this.ports[t.port];
        if (port.inbound + port.inQ.length + (port.pick ? 1 : 0) >= cfg.portInboundCap) continue;
        let best = null, bd = Infinity;
        for (const r of idle) { const d = WS.U.manhattan(r.x, r.y, t.bin.x, t.bin.y); if (d < bd) { bd = d; best = r; } }
        port.inbound++;
        idle = idle.filter((r) => r !== best);
        best.start(t);
      }
      // idle robots get off highways, lanes and chargers and wait on a storage cell
      for (const r of idle) {
        if (r.idleTime < 3) continue;
        const i = g.idx(r.x, r.y);
        if (g.canPark(i)) continue;
        const target = this.parkingCell(r);
        if (target >= 0) this.assignTask(r, { type: 'PARK', x: g.cx(target), y: g.cy(target), priority: 0 });
      }
    }
    parkingCell(r) {
      const g = this.grid; let best = -1, bd = Infinity;
      for (let i = 0; i < g.type.length; i++) {
        if (!g.canPark(i) || g.claim[i] >= 0) continue;
        const d = WS.U.manhattan(r.x, r.y, g.cx(i), g.cy(i)) + g.passHeat[i] * 0.3 + (g.podAt[i] ? 0 : 2);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }

    tick() {
      super.tick();
      this.turnPods(this.cfg.tick);
    }
  }

  WS.PodSim = PodSim;
  WS.PodTasks = T;
})((globalThis.WS = globalThis.WS || {}));
