/* Inventory Management System ("the brain"): item master, storage units and
 * their compartments, stock reservation and velocity/ABC classification.
 * Where a unit is stored is up to each storage type. */
(function (WS) {
  'use strict';
  const BIN_VOLUME = 64; // litres of usable volume per storage bin
  const TAU = 3600; // velocity decay constant → velocity ≈ order lines per hour

  const NAMES = ['Wireless Mouse', 'USB-C Cable 1m', 'USB-C Cable 2m', 'HDMI Cable 2m', 'Phone Case Clear', 'Screen Protector', 'Power Bank 10k', 'Power Bank 20k', 'Bluetooth Earbuds', 'Smart Watch Band', 'Laptop Sleeve 14"', 'Laptop Sleeve 16"', 'Mechanical Keyboard', 'Webcam HD', 'Desk Lamp LED', 'AA Batteries 8pk', 'AAA Batteries 8pk', 'Notebook A5', 'Gel Pen Set', 'Sticky Notes', 'Coffee Beans 1kg', 'Green Tea 50ct', 'Protein Bar Box', 'Water Bottle 750ml', 'Travel Mug', 'Yoga Mat', 'Resistance Bands', 'Running Socks', 'Sport Cap', 'Sunglasses', 'Hand Cream', 'Shampoo 250ml', 'Toothbrush Duo', 'Face Masks 10pk', 'Vitamin D3', 'Dog Treats', 'Cat Toy Mouse', 'LEGO Starter Set', 'Puzzle 1000pc', 'Board Game Classic', 'Kids Paint Set', 'Headphone Stand', 'Mouse Pad XL', 'Monitor Arm', 'Cable Organizer', 'Smart Plug', 'LED Bulb E27', 'Extension Lead', 'Wall Charger 65W', 'Car Charger', 'SD Card 128GB', 'USB Stick 64GB', 'Portable SSD 1TB', 'Phone Tripod', 'Ring Light', 'Selfie Stick', 'Kitchen Scale', 'Chef Knife', 'Cutting Board', 'Spice Rack', 'Tea Towels 3pk', 'Candle Vanilla', 'Photo Frame A4', 'Plant Pot Ceramic', 'Garden Gloves', 'Umbrella Compact', 'Wallet Leather', 'Key Finder Tag', 'Passport Holder', 'Luggage Scale', 'Sleep Mask', 'Ear Plugs 10pr', 'Hoodie M', 'T-Shirt L', 'Beanie', 'Scarf Wool', 'Rain Poncho', 'Bike Light Set', 'Bike Lock', 'Tyre Repair Kit'];

  const VARIANTS = ['Black', 'White', 'Blue', 'Red', 'Grey', 'Green', 'XL', 'Pro', 'Mini', 'Twin Pack'];

  class Inventory {
    constructor(sim) {
      this.sim = sim;
      this.products = []; this.byGtin = new Map();
      this.bins = []; this.binById = new Map(); this.binByGrai = new Map();
      this.nextItemRef = 1001; this.nextBinSerial = 1;
      this.portDist = null; this.maxPortDist = 1;
      this.velTimer = 0; this.classTimer = 0;
    }

    // ---------- master data ----------
    addProduct(p) {
      const gtin = p.gtin && WS.Barcode.isValidGTIN(p.gtin) ? p.gtin : WS.Barcode.makeGTIN13(this.nextItemRef++);
      if (this.byGtin.has(gtin)) return this.byGtin.get(gtin);
      const prod = {
        gtin, name: p.name || 'Item ' + gtin.slice(7, 12), sku: 'SKU-' + gtin.slice(7, 12),
        weight: p.weight || 0.4, vol: p.vol || 1.0, demand: p.demand || 0.2,
        onHand: 0, reserved: 0, incoming: 0, hits: p.hits || 0, cls: 'C',
        min: p.min || 0, max: p.max || 0, bins: new Set(), lines: 0, units: 0,
      };
      this.products.push(prod); this.byGtin.set(gtin, prod);
      return prod;
    }
    seedCatalog(n, rng) {
      for (let k = 0; k < n; k++) {
        const v = Math.floor(k / NAMES.length);
        const name = NAMES[k % NAMES.length] + (v ? ' · ' + VARIANTS[(v - 1) % VARIANTS.length] : '');
        this.addProduct({ name, weight: +(0.08 + rng() * rng() * 2.2).toFixed(2), vol: +(0.25 + rng() * rng() * 5.5).toFixed(2), demand: 1 / Math.pow(k + 1, 0.95) });
      }
      // shuffle demand ranks so popularity isn't alphabetical
      const d = this.products.map((p) => p.demand);
      for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
      this.products.forEach((p, i) => (p.demand = d[i]));
    }

    // o.prefix / o.digits name the unit, o.asset is the GRAI asset type, o.vol its usable litres
    createBin(ncomp, o = {}) {
      const serial = this.nextBinSerial++;
      const bin = {
        id: (o.prefix || 'B') + String(serial).padStart(o.digits || 5, '0'), serial, grai: WS.Barcode.makeGRAI(o.asset || 10, serial), ncomp, vol: o.vol || BIN_VOLUME,
        comps: Array.from({ length: ncomp }, () => ({ gtin: null, qty: 0, reserved: 0, incoming: 0 })),
        loc: 'grid', x: -1, y: -1, robot: -1, port: -1, requests: [], task: null, presentations: 0,
      };
      this.bins.push(bin); this.binById.set(bin.id, bin); this.binByGrai.set(bin.grai, bin);
      return bin;
    }
    findBin(code) {
      const s = String(code).trim().toUpperCase();
      return this.binById.get(s) || this.binByGrai.get(s.replace(/^\(?8003\)?/, '')) || null;
    }
    compCap(bin, prod) { return Math.max(1, Math.floor(bin.vol / bin.ncomp / prod.vol)); }
    binWeight(bin) {
      let w = this.sim.cfg.binTare;
      for (const c of bin.comps) if (c.gtin) w += c.qty * this.byGtin.get(c.gtin).weight;
      return Math.min(w, this.sim.cfg.maxPayload);
    }
    binVelocity(bin) {
      let v = 0;
      for (const c of bin.comps) if (c.gtin && c.qty > 0) v += this.byGtin.get(c.gtin).hits;
      return v;
    }
    binClass(bin) {
      let best = 'E';
      for (const c of bin.comps) {
        if (!c.gtin || c.qty + c.incoming <= 0) continue;
        const k = this.byGtin.get(c.gtin).cls;
        if (best === 'E' || k < best) best = k; // 'A' < 'B' < 'C'
      }
      return best;
    }
    // Chance that a robot arm grasps one unit of a product: a fixed property of
    // the product (from its item reference, so it needs no random draws).
    // Too heavy (over 1.5 kg) or soft and bagged (1 in 20): never; shiny or
    // awkward (1 in 5): 80 %; the rest: 98 %.
    gripRate(prod) {
      const h = parseInt(prod.gtin.slice(7, 12), 10);
      if (prod.weight > 1.5 || h % 20 === 0) return 0;
      return h % 5 === 1 ? 0.8 : 0.98;
    }
    // Whether a decanting cell can tip a product's carton into a storage unit,
    // also from its item reference: fragile or loose items (1 in 8) and heavy
    // ones (over 2 kg a unit) are decanted by hand.
    tippable(prod) { return prod.weight <= 2 && parseInt(prod.gtin.slice(7, 12), 10) % 8 !== 3; }
    isEmpty(bin) { return bin.comps.every((c) => !c.gtin && c.qty === 0 && c.incoming === 0); }
    available(prod) { return prod.onHand - prod.reserved; }

    // ---------- location ----------
    binColumn(bin) { return bin.loc === 'grid' ? this.sim.grid.idx(bin.x, bin.y) : -1; }
    binDepth(bin) { return bin.loc === 'grid' ? this.sim.unitDepth(bin) : 0; }

    computePortDistances() {
      const g = this.sim.grid, picks = g.ports.filter((p) => p.kind === 'PICK');
      const ref = picks.length ? picks : g.ports;
      this.portDist = new Float32Array(g.W * g.D);
      let mx = 1;
      for (let i = 0; i < this.portDist.length; i++) {
        let d = 1e9;
        for (const p of ref) d = Math.min(d, WS.U.manhattan(g.cx(i), g.cy(i), p.drop.x, p.drop.y));
        this.portDist[i] = d; if (d > mx) mx = d;
      }
      this.maxPortDist = mx;
    }

    // ---------- velocity & ABC ----------
    recordPick(prod, units) { prod.hits += 1; prod.lines += 1; prod.units += units; }
    update(dt) {
      this.velTimer += dt; this.classTimer += dt;
      if (this.velTimer >= 10) {
        const f = Math.exp(-this.velTimer / TAU);
        for (const p of this.products) p.hits *= f;
        this.velTimer = 0;
      }
      if (this.classTimer >= 60) { this.classify(); this.classTimer = 0; }
    }
    classify() {
      const s = this.products.slice().sort((a, b) => b.hits - a.hits);
      const nA = Math.ceil(s.length * 0.2), nB = Math.ceil(s.length * 0.5);
      s.forEach((p, k) => (p.cls = k < nA ? 'A' : k < nB ? 'B' : 'C'));
    }

    // ---------- stock movements ----------
    setComp(bin, comp, gtin) {
      const c = bin.comps[comp];
      if (c.gtin && c.gtin !== gtin) this.byGtin.get(c.gtin).bins.delete(bin.id);
      c.gtin = gtin;
      if (gtin) this.byGtin.get(gtin).bins.add(bin.id);
    }
    releaseCompIfEmpty(bin, comp) {
      const c = bin.comps[comp];
      if (c.gtin && c.qty <= 0 && c.incoming <= 0 && c.reserved <= 0) {
        const g = c.gtin; c.gtin = null; c.qty = 0;
        if (!bin.comps.some((o) => o.gtin === g)) this.byGtin.get(g).bins.delete(bin.id);
      }
    }
    pick(bin, comp, qty) {
      const c = bin.comps[comp], prod = this.byGtin.get(c.gtin);
      const q = Math.min(qty, c.qty);
      c.qty -= q; c.reserved -= qty; prod.onHand -= q; prod.reserved -= qty;
      this.recordPick(prod, q);
      this.releaseCompIfEmpty(bin, comp);
      return q;
    }
    decant(bin, comp, qty) {
      const c = bin.comps[comp], prod = this.byGtin.get(c.gtin);
      c.qty += qty; c.incoming -= qty; prod.onHand += qty; prod.incoming -= qty;
    }

    // Reserve stock for an order line. Prefers bins already travelling to /
    // sitting at the port, then the ones that are cheapest to fetch.
    planLine(gtin, qty, portIdx) {
      const prod = this.byGtin.get(gtin);
      if (!prod || this.available(prod) < qty) return null;
      const cand = [];
      for (const id of prod.bins) {
        const bin = this.binById.get(id);
        bin.comps.forEach((c, k) => {
          if (c.gtin !== gtin) return;
          const avail = c.qty - c.reserved;
          if (avail <= 0) return;
          let score;
          if (bin.port === portIdx || bin.requests.some((r) => r.port === portIdx)) score = -100;
          else score = this.sim.fetchCost(bin);
          cand.push({ bin, comp: k, avail, score });
        });
      }
      cand.sort((a, b) => a.score - b.score || b.avail - a.avail);
      const out = []; let need = qty;
      for (const c of cand) {
        if (need <= 0) break;
        const take = Math.min(need, c.avail);
        out.push({ bin: c.bin, comp: c.comp, qty: take }); need -= take;
      }
      return need > 0 ? null : out;
    }
    commitPlan(plan, gtin) {
      const prod = this.byGtin.get(gtin);
      for (const p of plan) { p.bin.comps[p.comp].reserved += p.qty; prod.reserved += p.qty; }
    }

    // Find compartment space for received goods: top up a same-SKU compartment
    // first, then an empty compartment (fully empty bins preferred).
    planReceipt(gtin, qty, forcedBin) {
      const prod = this.byGtin.get(gtin), out = [];
      let need = qty;
      const consider = forcedBin ? [forcedBin] : this.bins;
      const cand = [];
      for (const bin of consider) {
        if (bin.loc === 'void') continue;
        const depth = bin.loc === 'grid' ? this.sim.unitDepth(bin) : 1;
        const cap = this.compCap(bin, prod);
        const empty = this.isEmpty(bin);
        bin.comps.forEach((c, k) => {
          let space, score;
          if (c.gtin === gtin) { space = cap - c.qty - c.incoming; score = depth; }
          else if (!c.gtin && c.qty === 0 && c.incoming === 0 && c.reserved === 0) {
            space = cap; score = 20 + depth + (empty ? 0 : 4) + Math.abs(cap - need) / cap * 6;
          } else return;
          if (space > 0) cand.push({ bin, comp: k, space, score });
        });
      }
      cand.sort((a, b) => a.score - b.score);
      for (const c of cand) {
        if (need <= 0) break;
        const take = Math.min(need, c.space);
        if (!c.bin.comps[c.comp].gtin) this.setComp(c.bin, c.comp, gtin);
        c.bin.comps[c.comp].incoming += take; prod.incoming += take;
        out.push({ bin: c.bin, comp: c.comp, qty: take }); need -= take;
      }
      return { plan: out, short: need };
    }
  }

  WS.Inventory = Inventory;
  WS.BIN_VOLUME = BIN_VOLUME;
})((globalThis.WS = globalThis.WS || {}));
