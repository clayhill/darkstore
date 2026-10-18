/* Order Management & material flow outside the grid:
 *  inbound  — ASN receipts decanted at the goods-in port, auto-replenishment (min/max)
 *  outbound — order release (waveless streaming), order totes on the put wall,
 *             takeaway conveyor → pack station (SSCC label) → dock → truck. */
(function (WS) {
  'use strict';
  const CARRIERS = [{ code: 'PCL', name: 'Parcel Road' }, { code: 'EXP', name: 'Express Air' }, { code: 'ECO', name: 'Eco Freight' }];
  const CITIES = [['1000', 'Brussels', 'BE'], ['2000', 'Antwerpen', 'BE'], ['9000', 'Gent', 'BE'], ['3000', 'Leuven', 'BE'], ['4000', 'Liège', 'BE'], ['8000', 'Brugge', 'BE'], ['1011', 'Amsterdam', 'NL'], ['3011', 'Rotterdam', 'NL'], ['75001', 'Paris', 'FR'], ['59000', 'Lille', 'FR'], ['50667', 'Köln', 'DE'], ['1009', 'Luxembourg', 'LU']];
  const FIRST = ['Emma', 'Lucas', 'Olivia', 'Noah', 'Mila', 'Arthur', 'Louise', 'Jules', 'Elena', 'Victor', 'Nora', 'Finn', 'Lina', 'Adam', 'Marie', 'Liam'];
  const LAST = ['Peeters', 'Janssens', 'Maes', 'Jacobs', 'Mertens', 'Willems', 'Claes', 'Goossens', 'Wouters', 'De Smet', 'Dubois', 'Lambert', 'Martin', 'Smit', 'Müller', 'Bakker'];

  class OMS {
    constructor(sim) {
      this.sim = sim;
      this.orders = []; this.byId = new Map(); this.nextNo = 100001;
      this.receipts = []; this.nextAsn = 5001;
      this.totes = []; this.freeTotes = [];
      for (let k = 1; k <= sim.cfg.toteCount; k++) {
        const t = { id: 'T' + String(k).padStart(4, '0'), grai: WS.Barcode.makeGRAI(20, 9000 + k), order: null };
        this.totes.push(t); this.freeTotes.push(t);
      }
      this.conveyor = []; // items travelling on tote / parcel conveyors
      this.packers = [];
      for (let k = 0; k < sim.cfg.packStations; k++) this.packers.push({ idx: k, name: 'Pack ' + (k + 1), queue: [], incoming: 0, cur: null, t: 0, dur: 0, done: 0 });
      this.truck = this.newTruck(0);
      this.trucksGone = []; this.sscc = 1;
      this.orderAcc = 0; this.replenTimer = 0; this.releaseTimer = 0;
      this.backlogLogged = new Set();
    }
    newTruck(k) {
      const c = CARRIERS[k % CARRIERS.length];
      return { id: 'TRK-' + (100 + k), carrier: c, parcels: [], arrived: this.sim.time, departing: 0, k };
    }

    // ---------------------------------------------------------------- orders
    createOrder(spec) {
      const inv = this.sim.inv, lines = [];
      for (const l of spec.lines || []) {
        const p = inv.byGtin.get(l.gtin);
        if (!p) throw new Error('Unknown GTIN ' + l.gtin);
        const q = Math.max(1, l.qty | 0);
        const ex = lines.find((x) => x.gtin === l.gtin);
        if (ex) ex.qty += q; else lines.push({ gtin: l.gtin, qty: q, picked: 0 });
      }
      if (!lines.length) throw new Error('Order has no lines');
      const rng = this.sim.rng, city = spec.city ? null : rng.pick(CITIES);
      const o = {
        id: 'SO-' + this.nextNo++, status: 'NEW', created: this.sim.time, priority: spec.priority || 0,
        customer: spec.customer || rng.pick(FIRST) + ' ' + rng.pick(LAST),
        postcode: spec.postcode || city[0], city: spec.city || city[1], country: spec.country || (city ? city[2] : 'BE'),
        lines, tote: null, port: -1, slot: -1, sscc: null, carrier: null, times: { created: this.sim.time }, source: spec.source || 'manual',
      };
      this.orders.push(o); this.byId.set(o.id, o);
      if (this.orders.length > 1500) {
        const k = this.orders.findIndex((x) => x.status === 'SHIPPED');
        if (k >= 0) this.byId.delete(this.orders.splice(k, 1)[0].id);
      }
      this.sim.log('order', `${o.id} received · ${lines.length} line${lines.length > 1 ? 's' : ''} · ${o.customer}`);
      return o;
    }
    units(o) { return o.lines.reduce((s, l) => s + l.qty, 0); }

    release() {
      const sim = this.sim, inv = sim.inv;
      const open = this.orders.filter((o) => o.status === 'NEW' || o.status === 'BACKORDER');
      if (!open.length) return;
      open.sort((a, b) => b.priority - a.priority || a.created - b.created);
      const picks = sim.ports.filter((p) => p.kind === 'PICK');
      for (const o of open) {
        if (!this.freeTotes.length) return;
        // port with a free put-wall slot and the least work queued
        let port = null, best = Infinity;
        for (const p of picks) {
          const free = p.slots.indexOf(null);
          if (free < 0) continue;
          const load = p.slots.filter(Boolean).length * 3 + p.demand();
          if (load < best) { best = load; port = p; }
        }
        if (!port) return;
        const plans = [];
        let ok = true;
        for (const l of o.lines) {
          const plan = inv.planLine(l.gtin, l.qty, port.idx);
          if (!plan) { ok = false; break; }
          plans.push(plan);
          inv.commitPlan(plan, l.gtin); // reserve now so later lines of this order see it
        }
        if (!ok) {
          // roll back partial reservations
          plans.forEach((plan, k) => plan.forEach((p) => { p.bin.comps[p.comp].reserved -= p.qty; inv.byGtin.get(o.lines[k].gtin).reserved -= p.qty; }));
          if (o.status !== 'BACKORDER') { o.status = 'BACKORDER'; sim.log('warn', `${o.id} awaiting stock (backorder)`); }
          continue;
        }
        const slot = port.slots.indexOf(null), tote = this.freeTotes.shift();
        tote.order = o; o.tote = tote; o.port = port.idx; o.slot = slot; port.slots[slot] = o;
        o.status = 'RELEASED'; o.times.released = sim.time;
        plans.forEach((plan, k) => plan.forEach((p) => sim.requestBin(p.bin, port.idx, { order: o, line: k, comp: p.comp, qty: p.qty, gtin: o.lines[k].gtin })));
        sim.log('release', `${o.id} → ${port.name} slot ${slot + 1} · tote ${tote.id}`);
      }
    }
    onLinePicked(ln, qty, port) {
      const o = ln.order, line = o.lines[ln.line];
      line.picked += qty;
      if (o.status === 'RELEASED') { o.status = 'PICKING'; o.times.firstPick = this.sim.time; }
      this.sim.kpi.onLinePicked(qty);
      if (o.lines.every((l) => l.picked >= l.qty)) {
        o.status = 'PICKED'; o.times.picked = this.sim.time;
        if (this.sim.onOrderPicked) return this.sim.onOrderPicked(o, port); // the type takes the tote on from here
        port.slots[o.slot] = null;
        this.toPacking(o, (pk) => this.sim.layout.toteRoute(port, o.slot, pk));
        this.sim.log('pick', `${o.id} complete at ${port.name} — tote ${o.tote.id} to packing`);
      }
    }
    // An order tote onto the takeaway conveyor (route(packer) from where it
    // starts) to the pack station with the least work.
    toPacking(o, route) {
      const pk = this.packers.reduce((a, b) => (a.queue.length + a.incoming + (a.cur ? 1 : 0) <= b.queue.length + b.incoming + (b.cur ? 1 : 0) ? a : b));
      pk.incoming++;
      o.status = 'CONVEYOR';
      this.toConveyor({ kind: 'tote', order: o, packer: pk.idx, path: route(pk.idx) });
    }

    // ---------------------------------------------------------------- inbound
    createReceipt(spec) {
      const sim = this.sim, inv = sim.inv;
      const gi = sim.ports.find((p) => p.kind === 'GOODS_IN');
      if (!gi) throw new Error('No goods-in port configured');
      const rc = { id: 'ASN-' + this.nextAsn++, supplier: spec.supplier || 'Supplier', status: 'OPEN', created: sim.time, lines: [], source: spec.source || 'manual' };
      for (const l of spec.lines) {
        const prod = inv.byGtin.get(l.gtin);
        if (!prod) throw new Error('Unknown GTIN ' + l.gtin);
        if (l.bin && !inv.findBin(l.bin)) throw new Error('Unknown bin ' + l.bin);
        const res = inv.planReceipt(l.gtin, l.qty | 0, l.bin ? inv.findBin(l.bin) : null);
        const line = { gtin: l.gtin, qty: l.qty | 0, received: 0, short: res.short, bins: res.plan.map((p) => p.bin.id) };
        rc.lines.push(line);
        res.plan.forEach((p) => sim.requestBin(p.bin, gi.idx, { receipt: rc, line: rc.lines.length - 1, comp: p.comp, qty: p.qty, gtin: l.gtin }));
      }
      this.receipts.push(rc);
      if (this.receipts.length > 300) { const k = this.receipts.findIndex((r) => r.status === 'RECEIVED'); if (k >= 0) this.receipts.splice(k, 1); }
      const sh = rc.lines.reduce((s, l) => s + l.short, 0);
      sim.log('inbound', `${rc.id} from ${rc.supplier}: ${rc.lines.length} line(s)${sh ? ` — ${sh} units without bin space` : ''}`);
      return rc;
    }
    onDecanted(ln) {
      const rc = ln.receipt, line = rc.lines[ln.line];
      line.received += ln.qty;
      rc.status = rc.lines.every((l) => l.received >= l.qty - l.short) ? 'RECEIVED' : 'IN_PROGRESS';
      if (rc.status === 'RECEIVED') { rc.done = this.sim.time; this.sim.log('inbound', `${rc.id} fully decanted`); }
      this.sim.kpi.unitsReceived += ln.qty;
    }
    autoReplenish() {
      const inv = this.sim.inv, lines = [];
      for (const p of inv.products) {
        if (!p.min) continue;
        if (p.onHand - p.reserved + p.incoming < p.min) lines.push({ gtin: p.gtin, qty: Math.max(1, p.max - (p.onHand - p.reserved + p.incoming)) });
      }
      if (lines.length) this.createReceipt({ supplier: 'Auto-replenishment', lines: lines.slice(0, 6), source: 'auto' });
    }

    // ---------------------------------------------------------------- outbound
    toConveyor(item) {
      const pts = item.path; let len = 0;
      for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
      item.len = len; item.s = 0;
      this.conveyor.push(item);
    }
    posOnPath(item) {
      let s = item.s; const p = item.path;
      for (let k = 1; k < p.length; k++) {
        const seg = Math.hypot(p[k].x - p[k - 1].x, p[k].y - p[k - 1].y);
        if (s <= seg) { const f = seg ? s / seg : 0; return { x: p[k - 1].x + (p[k].x - p[k - 1].x) * f, y: p[k - 1].y + (p[k].y - p[k - 1].y) * f }; }
        s -= seg;
      }
      return p[p.length - 1];
    }
    update(dt) {
      const sim = this.sim, cfg = sim.cfg;
      // auto order generation (Poisson arrivals)
      if (cfg.autoOrders && cfg.orderRate > 0) {
        this.orderAcc += dt;
        const rate = cfg.orderRate / 3600;
        if (this.nextGap === undefined) this.nextGap = -Math.log(1 - sim.rng()) / rate;
        while (this.orderAcc >= this.nextGap) {
          this.orderAcc -= this.nextGap;
          this.nextGap = -Math.log(1 - sim.rng()) / rate;
          this.generateOrder();
        }
      }
      this.releaseTimer += dt;
      if (this.releaseTimer >= 1) { this.releaseTimer = 0; this.release(); }
      this.replenTimer += dt;
      if (cfg.autoReplenish && this.replenTimer >= 45) { this.replenTimer = 0; this.autoReplenish(); }

      // conveyors (speed in cells/s)
      const v = cfg.conveyorSpeed / cfg.cellSize;
      for (let k = this.conveyor.length - 1; k >= 0; k--) {
        const it = this.conveyor[k];
        // accumulate: stop behind the item ahead on the same route end
        it.s = Math.min(it.len, it.s + v * dt);
        if (it.s >= it.len) { this.conveyor.splice(k, 1); this.arrive(it); }
      }
      // pack stations
      for (const pk of this.packers) {
        if (!pk.cur && pk.queue.length) {
          pk.cur = pk.queue.shift(); pk.t = 0;
          pk.dur = cfg.packBase + this.units(pk.cur) * cfg.packPerUnit;
          pk.cur.status = 'PACKING';
        }
        if (pk.cur) {
          pk.t += dt;
          if (pk.t >= pk.dur) {
            const o = pk.cur; pk.cur = null; pk.done++;
            o.sscc = WS.Barcode.makeSSCC(this.sscc++);
            o.carrier = this.truck.carrier;
            o.status = 'PACKED'; o.times.packed = sim.time;
            const tote = o.tote; tote.order = null; o.toteId = tote.id; o.tote = null;
            sim.schedule(60, () => this.freeTotes.push(tote)); // empty tote returns to the tote stack
            this.toConveyor({ kind: 'parcel', order: o, path: sim.layout.parcelRoute(pk.idx) });
            sim.log('pack', `${o.id} packed · SSCC ${o.sscc} · ${o.carrier.name}`);
          }
        }
      }
      // truck departs at capacity or cut-off
      const tr = this.truck;
      if (tr.departing > 0) {
        tr.departing += dt;
        if (tr.departing > 8) {
          for (const o of tr.parcels) { o.status = 'SHIPPED'; o.times.shipped = sim.time; sim.kpi.onShipped(o); }
          sim.log('ship', `${tr.id} (${tr.carrier.name}) departed with ${tr.parcels.length} parcels`);
          this.trucksGone.push({ id: tr.id, carrier: tr.carrier.name, parcels: tr.parcels.length, t: sim.time });
          this.truck = this.newTruck(tr.k + 1);
        }
      } else if (tr.parcels.length >= cfg.truckCapacity || (tr.parcels.length && sim.time - tr.arrived > cfg.truckCutoff)) tr.departing = 0.001;
    }
    arrive(it) {
      const o = it.order;
      if (it.kind === 'tote') {
        const pk = this.packers[it.packer];
        pk.incoming--; pk.queue.push(o); o.status = 'TO_PACK';
      } else {
        o.status = 'LOADED'; o.times.loaded = this.sim.time;
        if (this.truck.departing > 0) this.sim.schedule(10, () => this.truck.parcels.push(o));
        else this.truck.parcels.push(o);
      }
    }
    generateOrder() {
      const inv = this.sim.inv, rng = this.sim.rng, prods = inv.products;
      const r = rng(), n = r < 0.5 ? 1 : r < 0.75 ? 2 : r < 0.9 ? 3 : 4 + Math.floor(rng() * 3);
      const w = prods.map((p) => p.demand), tot = w.reduce((a, b) => a + b, 0), lines = [];
      for (let k = 0; k < n; k++) {
        const p = prods[rng.weighted(w, tot)];
        lines.push({ gtin: p.gtin, qty: rng() < 0.8 ? 1 : 2 + Math.floor(rng() * 3) });
      }
      this.createOrder({ lines, source: 'auto' });
    }
  }

  WS.OMS = OMS;
  WS.CARRIERS = CARRIERS;
})((globalThis.WS = globalThis.WS || {}));
