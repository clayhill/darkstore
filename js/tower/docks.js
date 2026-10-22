/* FloorStack's ground floor, the way out and the way in.
 * Out: packed parcels drop down the parcel spiral from the second floor to
 * a sorter loop that runs high along the north wall. Each carrier has a dock
 * door with a truck at it and chutes either side; a parcel turns into an
 * open chute of its carrier and slides into the roll cage under it. A full
 * cage closes its chute until the door's loader has pushed it to the truck
 * (or beside the door while no truck is there) and brought an empty one. A
 * truck leaves when it is full, or at its carrier's departure time with the
 * cages it has; the next one docks a little later.
 * In: suppliers' trucks dock at the west doors; the pallet mover takes the
 * pallets to the staging lanes inside, and from there to the goods-in
 * stations, which work through a pallet's cartons and leave it empty. (The
 * stock itself comes in by the shared receipts, WS.OMS; the pallets show
 * the work.) */
(function (WS) {
  'use strict';
  const { walk, wait, until } = WS.TowerSteps;
  const ARRIVE = 20, LEAVE = 24; // s a truck takes to back up to its door, and to close up and drive off

  class TowerDocks {
    constructor(sim) {
      const g = sim.grid, c = sim.cfg;
      this.sim = sim; this.parcelQ = []; this.cageSeq = 1; this.truckSeq = 1;
      this.stats = { parcels: 0, sorted: 0, cages: 0, trucks: 0, laps: 0, inTrucks: 0, pallets: 0 };
      this.doors = g.doors.map((d) => ({ k: d.k, carrier: d.carrier, x: d.x, truck: null, nextAt: 20 + d.k * 45, staged: [], empties: 6, chutes: [], gone: 0 }));
      this.chutes = g.chutes.map((ch, i) => ({ idx: i, carrier: ch.carrier, door: this.doors[ch.door.k], x: ch.x, belt: null, cage: this.newCage(ch.carrier), busy: false }));
      for (const ch of this.chutes) ch.door.chutes.push(ch);
      for (const d of this.doors) { d.due = this.nextDue(d, 0); d.loader = sim.people.add({ role: 'Dock loader', name: ['Yusuf', 'Marta', 'Koen'][d.k % 3], floor: 0, x: d.x, y: 1.2, home: { x: d.x, y: 1.2 }, look: 'loader' + d.k, vest: '#facc15', heading: -Math.PI / 2 }); }
      this.buildBelts();
      // the way in
      this.inDoors = g.inDoors.map((d) => ({ k: d.k, y: d.y, truck: null, nextAt: 40 + d.k * 420 }));
      this.staging = g.staging.map((s, k) => Object.assign({ full: k < 3 }, s));
      for (const p of sim.ports) if (p.kind === 'GOODS_IN') Object.assign(p, { pallets: 2, empties: 0, cases: 0 });
      this.mover = sim.people.add({ role: 'Pallet mover', name: 'Bram', floor: 0, x: -7.2, y: 18, home: { x: -7.2, y: 18 }, look: 'mover', vest: '#a3e635', heading: Math.PI / 2 });
    }
    newCage(carrier) { return { id: 'RC' + String(this.cageSeq++).padStart(3, '0'), carrier, items: [] }; }
    // the first departure slot of door d at least ten minutes after t: the carriers leave in turn
    nextDue(d, t) {
      const E = this.sim.cfg.truckEvery, off = (E * (d.k + 1)) / this.doors.length;
      return off + Math.max(0, Math.ceil((t + 600 - off) / E)) * E;
    }

    // ---------------------------------------------------------------- parcel belts
    buildBelts() {
      const sim = this.sim, c = sim.cfg, g = sim.grid, net = sim.pnet, P = g.parcel, RP = WS.TOWER_RP, SZ = g.SZ, FZ = g.FZ;
      const h = FZ[2] + 1.4 - SZ, turns = Math.max(1, Math.round(h / (c.spiralPitch / WS.RACK_ZU) - 0.75)) + 0.75;
      this.spiral = net.belt('parcel spiral', WS.helix(P.cx, P.cy, RP, -Math.PI / 2, 1, turns, FZ[2] + 1.4, SZ), { floor: 0, kind: 'spiral' });
      this.feed = net.belt('sorter feed', [{ x: P.cx - RP, y: P.cy }, { x: P.cx - RP, y: g.sortY }, { x: g.sortX1, y: g.sortY }], { floor: 0, z: SZ });
      this.spiral.exit = () => this.feed; net.link(this.spiral, this.feed);
      const pts = [{ x: g.sortX1, y: g.sortY }, { x: g.sortX0, y: g.sortY }, { x: g.sortX0, y: g.sortRY }, { x: g.sortX1, y: g.sortRY }, { x: g.sortX1, y: g.sortY }], u = (x) => g.sortX1 - x;
      const segs = (this.loop = WS.loopBelts(net, 'sorter loop', pts, this.chutes.map((ch) => u(ch.x)), { floor: 0, z: SZ, kind: 'sorter' }));
      this.feed.exit = (t) => { this.induct(t); return segs[0]; }; net.link(this.feed, segs[0]);
      for (const ch of this.chutes) {
        ch.belt = net.belt(`chute ${ch.idx + 1}`, [{ x: ch.x, y: g.sortY, z: SZ }, { x: ch.x, y: g.sortY - 0.8, z: SZ - 0.15 }, { x: ch.x, y: g.cageY + 0.75, z: 4.2 }], { floor: 0, kind: 'chute' });
        ch.belt.exit = (t) => this.intoCage(t, ch);
        const at = sim.segTo(segs, u(ch.x)), next = at.next;
        at.exit = (t) => this.atChute(t, ch, next); net.link(at, ch.belt);
      }
      const last = segs[segs.length - 1];
      last.exit = (t) => { if (sim.time - (t.lapT || -1e9) > 5) { t.lapT = sim.time; this.stats.laps++; t.chute = null; } return segs[0]; };
    }
    parcelIn(o) { this.parcelQ.push(o); this.stats.parcels++; this.sim.kpi.push('parcels'); o.status = 'PACKED'; }
    // A chute takes parcels while its cage has room and the cage is not being changed.
    open(ch) { return !!ch.cage && !ch.busy && ch.cage.items.length + ch.belt.totes.length < this.sim.cfg.cageCap && ch.belt.hasRoom(); }
    // On the sorter: the open chute of its carrier with the emptiest cage.
    induct(t) {
      if (t.chute) return;
      let best = null;
      for (const ch of this.chutes) if (ch.carrier === t.carrier && this.open(ch) && (!best || ch.cage.items.length < best.cage.items.length)) best = ch;
      t.chute = best;
    }
    atChute(t, ch, next) {
      if (t.carrier !== ch.carrier) return next;
      return (t.chute === ch || !t.chute || !this.open(t.chute)) && this.open(ch) ? ch.belt : next;
    }
    intoCage(t, ch) {
      if (!ch.cage || ch.busy || ch.cage.items.length >= this.sim.cfg.cageCap) return null;
      ch.cage.items.push(t.order); t.order.cage = ch.cage.id;
      this.stats.sorted++; this.sim.kpi.push('sorted');
      return true;
    }

    // ---------------------------------------------------------------- trucks
    update(dt) {
      const sim = this.sim, c = sim.cfg;
      while (this.parcelQ.length && this.spiral.hasRoom()) { const o = this.parcelQ.shift(); this.spiral.put({ kind: 'parcel', order: o, carrier: o.carrier, bag: o.pack === 'bagger', chute: null }); }
      for (const d of this.doors) {
        const tr = d.truck;
        if (!tr) {
          if (sim.time >= d.nextAt) d.truck = { id: `${d.carrier.code}-${String(this.truckSeq++).padStart(3, '0')}`, carrier: d.carrier, state: 'ARRIVING', t: 0, cages: [], arrived: sim.time };
        } else {
          tr.t += dt;
          if (tr.state === 'ARRIVING' && tr.t >= ARRIVE) { tr.state = 'DOCKED'; tr.t = 0; tr.docked = sim.time; d.empties = Math.min(14, d.empties + (d.lastCages ?? 4)); sim.log('inbound', `Truck ${tr.id} (${d.carrier.name}) at dock door ${d.k + 1}`); }
          else if (tr.state === 'DOCKED') {
            const loading = d.loader.task === 'load';
            if (tr.cages.length >= c.truckCages || (sim.time >= d.due && tr.cages.length && !loading)) this.depart(d);
            else if (sim.time >= d.due && !tr.cages.length) d.due = this.nextDue(d, sim.time);
          } else if (tr.state === 'LEAVING' && tr.t >= LEAVE) { d.truck = null; d.nextAt = sim.time + c.truckGap; }
        }
        if (d.loader.idle) this.loaderJob(d);
      }
      this.updateInbound(dt);
    }
    depart(d) {
      const sim = this.sim, tr = d.truck;
      tr.state = 'LEAVING'; tr.t = 0;
      let n = 0;
      for (const cage of tr.cages) for (const o of cage.items) { o.status = 'SHIPPED'; o.times.shipped = sim.time; sim.kpi.onShipped(o); n++; }
      this.stats.trucks++; d.gone++;
      sim.oms.trucksGone.push({ id: tr.id, carrier: d.carrier.name, parcels: n, cages: tr.cages.length, t: sim.time });
      if (sim.oms.trucksGone.length > 50) sim.oms.trucksGone.shift();
      sim.log('ship', `Truck ${tr.id} (${d.carrier.name}) left door ${d.k + 1} with ${tr.cages.length} roll cage${tr.cages.length === 1 ? '' : 's'}, ${n} parcels`);
      d.lastCages = tr.cages.length; // it brings as many empty cages back
      d.due = this.nextDue(d, sim.time + sim.cfg.truckGap);
    }
    // what the shared views ask about "the truck": everything loaded at the doors
    truckView() {
      const parcels = [];
      for (const d of this.doors) if (d.truck) for (const cg of d.truck.cages) parcels.push(...cg.items);
      const d0 = this.doors[0];
      return { id: 'Dock doors', carrier: { code: 'ALL', name: `${this.doors.length} carriers` }, parcels, arrived: d0.truck ? d0.truck.arrived : 0, departing: 0 };
    }
    docked(d) { return d.truck && d.truck.state === 'DOCKED' ? d.truck : null; }

    // ---------------------------------------------------------------- dock loaders
    // A door's loader: cages waiting beside the door into a truck that has
    // docked; a full cage off its chute and an empty one in its place; when
    // the truck is about to leave, the cages that are not full yet too.
    loaderJob(d) {
      const c = this.sim.cfg, tr = this.docked(d), P = d.loader;
      if (tr && d.staged.length && tr.cages.length < c.truckCages) { P.task = 'load'; P.run(this.stagedToTruck(P, d)); return; }
      const soon = tr && this.sim.time >= d.due - 240 && tr.cages.length < c.truckCages;
      const ch = d.chutes.find((q) => q.cage && !q.busy && q.cage.items.length >= c.cageCap) || (soon && d.chutes.find((q) => q.cage && !q.busy && q.cage.items.length >= c.cageCap / 4));
      if (ch && d.staged.length < 4) { P.task = 'load'; P.run(this.swapCage(P, d, ch)); return; }
      P.task = null;
      if (Math.hypot(P.x - P.home.x, P.y - P.home.y) > 0.05) P.run((function* () { yield walk([P.home]); })());
    }
    stagedSpot(d, k) { return { x: d.x + (k % 2 ? 0.75 : -0.75), y: 1.1 + Math.floor(k / 2) * 1.2 }; }
    *stagedToTruck(P, d) {
      const c = this.sim.cfg;
      yield walk([{ x: P.x, y: 1.9 }, { x: this.stagedSpot(d, d.staged.length - 1).x, y: 1.9 }, this.stagedSpot(d, d.staged.length - 1)]);
      yield wait(c.cageTime / 2);
      P.carry = d.staged.pop();
      yield* this.pushIn(P, d);
    }
    // push the cage held into the truck at the door (or leave it beside the door)
    *pushIn(P, d) {
      const c = this.sim.cfg, sim = this.sim;
      yield walk([{ x: d.x, y: P.y }, { x: d.x, y: -0.9 }]);
      const tr = this.docked(d);
      if (tr && tr.cages.length < c.truckCages) {
        yield walk([{ x: d.x, y: -2.4 }]);
        yield wait(c.cageTime);
        const tr2 = this.docked(d);
        if (tr2 && tr2.cages.length < c.truckCages) {
          tr2.cages.push(P.carry);
          for (const o of P.carry.items) { o.status = 'LOADED'; o.times.loaded = sim.time; }
          this.stats.cages++;
        } else d.staged.push(P.carry);
        P.carry = null;
        yield walk([{ x: d.x, y: -0.9 }]);
      } else {
        const s = this.stagedSpot(d, d.staged.length);
        yield walk([{ x: d.x, y: 1.9 }, { x: s.x, y: 1.9 }, s]);
        yield wait(c.cageTime / 2);
        d.staged.push(P.carry); P.carry = null;
      }
    }
    *swapCage(P, d, ch) {
      const c = this.sim.cfg, y = this.sim.grid.cageY;
      ch.busy = true;
      yield walk([{ x: P.x, y: 1.0 }, { x: ch.x, y: 1.0 }, { x: ch.x, y: y + 0.85 }]);
      P.heading = -Math.PI / 2;
      yield wait(c.cageTime);
      P.carry = ch.cage; ch.cage = null;
      yield walk([{ x: ch.x, y: 1.0 }]);
      yield* this.pushIn(P, d);
      // an empty cage from the stack beside the door, under the chute
      P.task = 'empties'; // the truck need not wait for this
      yield until(() => d.empties > 0);
      P.task = 'load';
      yield walk([{ x: P.x, y: 1.0 }, { x: d.x, y: 1.0 }, { x: d.x, y: 0.2 }]);
      yield wait(2);
      d.empties--; P.carry = this.newCage(d.carrier);
      yield walk([{ x: d.x, y: 1.0 }, { x: ch.x, y: 1.0 }, { x: ch.x, y: y + 0.85 }]);
      yield wait(c.cageTime / 2);
      ch.cage = P.carry; P.carry = null; ch.busy = false;
      yield walk([{ x: ch.x, y: 1.0 }]);
    }

    // ---------------------------------------------------------------- the way in
    updateInbound(dt) {
      const sim = this.sim, c = sim.cfg;
      // goods-in stations work through their pallets
      for (const p of sim.ports) {
        if (p.kind !== 'GOODS_IN') continue;
        while (p.cases >= c.casesPerPallet && p.pallets > 0) { p.cases -= c.casesPerPallet; p.pallets--; p.empties = Math.min(4, p.empties + 1); }
      }
      // a supplier's truck when the staging lanes run low
      const coming = this.inDoors.reduce((n, d) => n + (d.truck ? d.truck.pallets : 0), 0), staged = this.staging.filter((s) => s.full).length;
      for (const d of this.inDoors) {
        const tr = d.truck;
        if (!tr) {
          if (sim.time >= d.nextAt && staged + coming < 4) { d.truck = { id: 'SUP-' + String(this.truckSeq++).padStart(3, '0'), state: 'ARRIVING', t: 0, pallets: c.inboundPallets }; this.stats.inTrucks++; sim.log('inbound', `Supplier truck ${d.truck.id} at inbound door ${d.k + 1} with ${c.inboundPallets} pallets`); }
          continue;
        }
        tr.t += dt;
        if (tr.state === 'ARRIVING' && tr.t >= ARRIVE) { tr.state = 'DOCKED'; tr.t = 0; }
        else if (tr.state === 'DOCKED' && !tr.pallets && this.mover.task !== 'unload' + d.k) { tr.state = 'LEAVING'; tr.t = 0; }
        else if (tr.state === 'LEAVING' && tr.t >= LEAVE) { d.truck = null; d.nextAt = sim.time + 300; }
      }
      if (this.mover.idle) this.moverJob();
    }
    // The pallet mover: a full pallet to a goods-in station that is short of
    // one, else a pallet off a supplier's truck into the staging lanes.
    moverJob() {
      const sim = this.sim, P = this.mover, full = this.staging.find((s) => s.full), free = this.staging.find((s) => !s.full);
      const gi = sim.ports.filter((p) => p.kind === 'GOODS_IN' && p.pallets < 2).sort((a, b) => a.pallets - b.pallets)[0];
      if (gi && full) { P.task = 'deliver'; P.run(this.deliver(P, full, gi)); return; }
      const d = this.inDoors.find((q) => q.truck && q.truck.state === 'DOCKED' && q.truck.pallets > 0);
      if (d && free) { P.task = 'unload' + d.k; P.run(this.unload(P, d, free)); return; }
      P.task = null;
      if (Math.hypot(P.x - P.home.x, P.y - P.home.y) > 0.05) P.run((function* () { yield walk([P.home]); })());
    }
    // where a goods-in station's pallets stand, beside its operator
    palletSpot(p, k) { return { x: p.drop.x + 2.9 + k * 1.45, y: this.sim.grid.D + 1.1 }; }
    *unload(P, d, spot) {
      const g = this.sim.grid, x = g.bx0 + 0.9;
      yield walk([{ x: -7.2, y: P.y }, { x: -7.2, y: d.y }, { x, y: d.y }]);
      P.heading = Math.PI;
      yield wait(5);
      d.truck.pallets--; P.carry = 'pallet'; spot.full = 'coming';
      yield walk([{ x: -7.2, y: d.y }, { x: -7.2, y: spot.y }, { x: spot.x + 0.9, y: spot.y }]);
      yield wait(3);
      spot.full = true; P.carry = null; this.stats.pallets++;
      yield walk([{ x: -7.2, y: spot.y }]);
    }
    *deliver(P, spot, p) {
      const g = this.sim.grid, s = this.palletSpot(p, p.pallets), yW = g.D + 3.3;
      yield walk([{ x: -7.2, y: P.y }, { x: -7.2, y: spot.y }, { x: spot.x + 0.9, y: spot.y }]);
      yield wait(3);
      spot.full = false; P.carry = 'pallet';
      yield walk([{ x: -7.2, y: spot.y }, { x: -7.2, y: yW }, { x: s.x, y: yW }, { x: s.x, y: s.y + 0.9 }]);
      yield wait(4);
      p.pallets++; p.empties = 0; P.carry = null;
      yield walk([{ x: s.x, y: yW }, { x: -7.2, y: yW }]);
    }

    alerts() {
      const out = [], c = this.sim.cfg;
      for (const ch of this.chutes) if (ch.busy || (ch.cage && ch.cage.items.length >= c.cageCap)) { if (ch.cage && ch.cage.items.length >= c.cageCap && !ch.busy) out.push({ sev: 'warning', key: 'chute' + ch.idx, title: `Chute ${ch.idx + 1} full`, msg: `Its roll cage waits for the ${ch.carrier.name} loader` }); }
      for (const d of this.doors) if (!d.truck && d.staged.length >= 3) out.push({ sev: 'warning', key: 'door' + d.k, title: `Door ${d.k + 1}: no truck`, msg: `${d.staged.length} roll cages wait for the next ${d.carrier.name} truck` });
      if (this.loop) { const n = this.loop.reduce((s, b) => s + b.totes.length, 0), cap = this.loop.len / this.sim.pnet.pitch; if (n > cap * 0.7) out.push({ sev: 'warning', key: 'sorter', title: 'Sorter loop crowded', msg: `${n} parcels going round: chutes closed or cages full` }); }
      return out;
    }
  }

  WS.TowerDocks = TowerDocks;
})((globalThis.WS = globalThis.WS || {}));
