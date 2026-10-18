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
      this.conv = []; this.cycleLog = [];
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
    convey(bin, path, arrive, back) {
      let len = 0;
      for (let k = 1; k < path.length; k++) len += Math.abs(path[k].x - path[k - 1].x) + Math.abs(path[k].y - path[k - 1].y);
      bin.loc = 'conveyor';
      this.conv.push({ bin, path, len, s: 0, arrive, back });
    }
    toPort(bin, path, port) { this.convey(bin, path, () => { if (!port.canAccept()) return false; port.receive(bin); return true; }, false); }
    posOnPath(it) { return WS.OMS.prototype.posOnPath.call(null, it); }

    // A tote leaves a station: on to the next station that wants it, or back
    // towards the racking.
    onPortOut(port, bin) {
      port.takeOut();
      if (bin.requests.length) {
        const next = this.ports[bin.requests[0].port];
        next.inbound++;
        this.toPort(bin, this.stationPath(port, next), next);
        return;
      }
      this.returnTote(port, bin);
    }

    tick() {
      super.tick();
      const v = this.cfg.preZoneSpeed / this.cfg.cellSize, dt = this.cfg.tick;
      for (let k = this.conv.length - 1; k >= 0; k--) {
        const it = this.conv[k];
        it.s = Math.min(it.len, it.s + v * dt);
        if (it.s >= it.len && it.arrive()) this.conv.splice(k, 1);
      }
    }
  }

  WS.RackSim = RackSim;
  WS.RACK_ZU = ZU;
})((globalThis.WS = globalThis.WS || {}));
