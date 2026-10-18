/* Shared base for storage types that keep totes single deep in racking on
 * both sides of aisles: RailRunner and SkyStack (through WS.PreZoneSim,
 * js/sim/prezone.js) and StackPilot. This holds the slot bookkeeping, seeding,
 * cycle counting and the conveyors that carry totes between the storage and
 * the stations. A type adds the racking geometry and its control-room map,
 * its machines and dispatch, the conveyor paths, and where a tote goes once
 * no station needs it. */
(function (WS) {
  'use strict';
  const ZU = 0.33; // metres per render level

  class RackSim extends WS.Sim {
    // ---------- a type supplies ----------
    // createGrid() / createMap(): the racking and the control-room map ·
    // newAisle(a): extra per-aisle state · createMachines() ·
    // stationPath(from, to): conveyor from one station to the next ·
    // returnTote(port, bin): where a tote goes when no station needs it
    storageCapacity() { const c = this.cfg; return c.aisles * c.levels * 2 * this.grid.SB; }
    unitDepth() { return 1; }
    unitCell(bin) { return this.mapGrid.idx(bin.x, bin.y); }
    si(l, s, b) { return (l * 2 + s) * this.cfg.bays + b; }

    seed() {
      const cfg = this.cfg, inv = this.inv, rng = this.rng, A = cfg.aisles, L = cfg.levels, B = cfg.bays, SB = this.grid.SB;
      this.mapGrid = this.createMap();
      this.conv = []; this.convSeq = 0; this.cycleLog = [];
      inv.seedCatalog(cfg.products, rng);
      this.aisles = [];
      for (let a = 0; a < A; a++) {
        this.aisles.push(Object.assign({
          a, slot: new Array(L * 2 * B).fill(null), resv: new Array(L * 2 * B).fill(false), count: new Int16Array(L * 2),
        }, this.newAisle(a)));
      }
      const all = [];
      for (let a = 0; a < A; a++) for (let l = 0; l < L; l++) for (let s = 0; s < 2; s++) for (let b = 0; b < SB; b++) {
        if (rng() >= cfg.rackFill) continue;
        const bin = this.newBin({ prefix: 'ST' });
        this.place(bin, a, l, s, b);
        all.push(bin);
      }
      this.stockBins(all);
      this.seedDemand();
      this.createMachines();
      for (const r of this.fleet) r.place();
    }

    // ---------- racking bookkeeping ----------
    place(bin, a, l, s, b) {
      const aisle = this.aisles[a];
      aisle.slot[this.si(l, s, b)] = bin.id; aisle.count[l * 2 + s]++;
      Object.assign(bin, { loc: 'grid', aisle: a, level: l, side: s, bay: b, robot: -1, port: -1 });
      bin.x = a * 4 + s * 2; bin.y = this.cfg.levels - 1 - l; // map cell
      this.grid.version++;
    }
    take(bin) {
      const aisle = this.aisles[bin.aisle];
      aisle.slot[this.si(bin.level, bin.side, bin.bay)] = null; aisle.count[bin.level * 2 + bin.side]--;
      this.grid.version++;
    }
    removeTask(t) { const k = this.tasks.indexOf(t); if (k >= 0) this.tasks.splice(k, 1); }
    onCycle() { this.cycleLog.push(this.time); }
    cycleRate() {
      const a = this.cycleLog, now = this.time;
      while (a.length && a[0] < now - 3600) a.shift();
      return (a.length * 3600) / Math.min(3600, Math.max(now, 120));
    }

    // ---------- conveyors ----------
    // A tote on a conveyor follows a path of straight segments along x or y
    // and keeps its orientation, so it covers 2w × 2d cells (convTote()).
    // Totes queue: none comes closer than a tote and a gap to another tote,
    // or to a fixed obstacle (convObstacles()), ahead of it in its direction
    // of travel. Totes move one after the other, the oldest first; should two
    // ever stand in each other's way, the older one goes first.
    // opts: arrive() → true when the tote leaves the conveyor at the end of
    // its path (no arrive: it waits there until a machine takes it, convRemove);
    // onLast() once when it turns onto its last segment; limit() → how far
    // along the path it may go for now.
    convey(bin, path, arrive, back, opts) {
      const pts = path.filter((q, k) => !k || q.x !== path[k - 1].x || q.y !== path[k - 1].y);
      let len = 0;
      for (let k = 1; k < pts.length; k++) len += Math.abs(pts[k].x - pts[k - 1].x) + Math.abs(pts[k].y - pts[k - 1].y);
      bin.loc = 'conveyor';
      const it = Object.assign({ bin, path: pts, len, s: 0, arrive, back, seq: this.convSeq++ }, opts);
      this.conv.push(it);
      return it;
    }
    convRemove(it) { const k = this.conv.indexOf(it); if (k >= 0) this.conv.splice(k, 1); }
    toPort(bin, path, port) { return this.convey(bin, path, () => { if (!port.canAccept()) return false; port.receive(bin); return true; }, false); }
    // half the footprint of a tote on the conveyors (x, y) in cells, and the gap kept between totes
    convTote() { return { w: 0.3, d: 0.26, gap: 0.04 }; }
    // where a tote is along its path: { x, y }, the direction of its segment (dx, dy) and the segment (k)
    convAt(it) {
      const p = it.path;
      let s = it.s;
      for (let k = 1; k < p.length; k++) {
        const a = p[k - 1], b = p[k], seg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
        if (s < seg || k === p.length - 1) { const f = seg ? Math.min(1, s / seg) : 0; return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dx: Math.sign(b.x - a.x), dy: Math.sign(b.y - a.y), k }; }
        s -= seg;
      }
      return { x: p[0].x, y: p[0].y, dx: 0, dy: 0, k: 0 };
    }
    posOnPath(it) { return this.convAt(it); }
    // distance along the path to the end of the tote's segment
    convCorner(it) {
      const p = it.path;
      let s = 0;
      for (let k = 1; k < p.length; k++) { s += Math.abs(p[k].x - p[k - 1].x) + Math.abs(p[k].y - p[k - 1].y); if (s > it.s + 1e-9) return s; }
      return it.len;
    }
    // no tote on the conveyors where one put at (x, y) would stand
    convFree(x, y) {
      const T = this.convTote(), gx = 2 * T.w + T.gap, gy = 2 * T.d + T.gap;
      return this.conv.every((it) => { const q = this.convAt(it); return Math.abs(q.x - x) >= gx - 1e-6 || Math.abs(q.y - y) >= gy - 1e-6; });
    }
    // Totes standing where the conveyors end: those on the stations' infeeds
    // (as WS.StationRenderer draws them). A type adds its own.
    convObstacles() {
      const out = [], step = this.cfg.conveyorStep;
      for (const p of this.ports) {
        const e = this.layout.portPath(p).entry;
        p.inQ.forEach((q, k) => { const f = k ? 0 : Math.min(1, q.t / step); out.push({ x: e[0].x + (e[1].x - e[0].x) * f, y: e[0].y + (e[1].y - e[0].y) * f }); });
      }
      return out;
    }
    moveConveyors(dist) {
      const T = this.convTote(), gx = 2 * T.w + T.gap, gy = 2 * T.d + T.gap, conv = this.conv, at = conv.map((it) => this.convAt(it));
      // how far tote i may go before it comes too close to q; Infinity if q is not in its way
      const room = (i, q) => {
        const a = at[i], rx = q.x - a.x, ry = q.y - a.y;
        if (a.dx) return Math.abs(ry) >= gy - 1e-6 || rx * a.dx <= 1e-9 ? Infinity : rx * a.dx - gx;
        return Math.abs(rx) >= gx - 1e-6 || ry * a.dy <= 1e-9 ? Infinity : ry * a.dy - gy;
      };
      // one tote after the other, the oldest first, each against where the others are now
      const obst = this.convObstacles();
      conv.forEach((it, i) => {
        // no further than the next corner: past it the tote runs another way
        const c = this.convCorner(it);
        let m = Math.min(dist, (it.limit ? it.limit() : it.len) - it.s, c - it.s > 1e-9 ? c - it.s : Infinity);
        for (const q of obst) m = Math.min(m, room(i, q));
        for (let j = 0; j < conv.length; j++) {
          if (j === i) continue;
          const r = room(i, at[j]);
          if (r === Infinity || (conv[j].seq > it.seq && room(j, at[i]) !== Infinity)) continue;
          m = Math.min(m, r);
        }
        if (m > 0) { it.s = Math.min(it.len, it.s + m); at[i] = this.convAt(it); }
      });
    }
    // A type can send totes another way before they move (late routing).
    routeConveyors() {}
    // Where a tote leaves a station: from the pick position to the station's outfeed.
    portExit(port) { const pp = this.layout.portPath(port); return [pp.pick, pp.exit[0], pp.exit[1]]; }
    // The next tote is presented once the one before has cleared the pick position.
    portClear(port) {
      const it = port.leaving;
      if (!it || !this.conv.includes(it)) return true;
      const T = this.convTote(), q = this.convAt(it), p = this.layout.portPath(port).pick;
      return Math.abs(q.x - p.x) >= 2 * T.w + T.gap || Math.abs(q.y - p.y) >= 2 * T.d + T.gap;
    }

    // A tote leaves a station: on to the next station that wants it, or back
    // towards the racking.
    onPortOut(port, bin) {
      port.takeOut();
      if (bin.requests.length) {
        const next = this.ports[bin.requests[0].port];
        next.inbound++;
        port.leaving = this.toPort(bin, this.stationPath(port, next), next);
        return;
      }
      port.leaving = this.returnTote(port, bin);
    }

    tick() {
      super.tick();
      this.routeConveyors();
      this.moveConveyors(this.cfg.preZoneSpeed / this.cfg.cellSize * this.cfg.tick);
      for (const it of this.conv) if (it.onLast && !it.joined && this.convAt(it).k === it.path.length - 1) { it.joined = true; it.onLast(it); }
      for (let k = this.conv.length - 1; k >= 0; k--) {
        const it = this.conv[k];
        if (it.arrive && it.s >= it.len - 1e-9 && it.arrive()) this.conv.splice(k, 1);
      }
    }
  }

  WS.RackSim = RackSim;
  WS.RACK_ZU = ZU;
})((globalThis.WS = globalThis.WS || {}));
