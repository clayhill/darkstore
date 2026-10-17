/* Inventory Management System ("the brain"): item master, storage bins and
 * their compartments, stock reservation, velocity/ABC classification, and the
 * slotting decisions — where a returning bin is stored and where blockers go. */
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

    createBin(ncomp) {
      const serial = this.nextBinSerial++;
      const bin = {
        id: 'B' + String(serial).padStart(5, '0'), serial, grai: WS.Barcode.makeGRAI(10, serial), ncomp,
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
    compCap(bin, prod) { return Math.max(1, Math.floor(BIN_VOLUME / bin.ncomp / prod.vol)); }
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
    isEmpty(bin) { return bin.comps.every((c) => !c.gtin && c.qty === 0 && c.incoming === 0); }
    available(prod) { return prod.onHand - prod.reserved; }

    // ---------- bin ⇄ grid bookkeeping ----------
    placeOnStack(bin, i) {
      const g = this.sim.grid;
      g.stacks[i].push(bin.id);
      bin.loc = 'grid'; bin.x = g.cx(i); bin.y = g.cy(i); bin.robot = -1; bin.port = -1;
      g.version++;
    }
    liftFromStack(bin, i, robotId) {
      const g = this.sim.grid, s = g.stacks[i];
      if (s[s.length - 1] !== bin.id) throw new Error('lift of non-top bin ' + bin.id);
      s.pop();
      bin.loc = 'robot'; bin.robot = robotId; g.version++;
    }
    binColumn(bin) { return bin.loc === 'grid' ? this.sim.grid.idx(bin.x, bin.y) : -1; }
    binDepth(bin) { return bin.loc === 'grid' ? this.sim.grid.depthOf(this.binColumn(bin), bin.id) : 0; }

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
    // sitting at the port, then shallow bins close to the port.
    planLine(gtin, qty, portIdx) {
      const prod = this.byGtin.get(gtin);
      if (!prod || this.available(prod) < qty) return null;
      const g = this.sim.grid, cand = [];
      for (const id of prod.bins) {
        const bin = this.binById.get(id);
        bin.comps.forEach((c, k) => {
          if (c.gtin !== gtin) return;
          const avail = c.qty - c.reserved;
          if (avail <= 0) return;
          let score;
          if (bin.port === portIdx || bin.requests.some((r) => r.port === portIdx)) score = -100;
          else if (bin.loc === 'grid') {
            const i = this.binColumn(bin);
            score = (g.depthOf(i, bin.id) - 1) * 9 + this.portDist[i] * 0.5 + (g.colLock[i] >= 0 ? 6 : 0);
          } else score = 25;
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
      const g = this.sim.grid;
      const consider = forcedBin ? [forcedBin] : this.bins;
      const cand = [];
      for (const bin of consider) {
        if (bin.loc === 'void') continue;
        const depth = bin.loc === 'grid' ? g.depthOf(this.binColumn(bin), bin.id) : 1;
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

    // ---------- slotting ----------
    columnRisk(i) {
      // cost of burying column i: popularity of its top bins + any bins awaiting retrieval
      const s = this.sim.grid.stacks[i]; let r = 0;
      for (let k = s.length - 1, w = 1; k >= 0 && w > 0.1; k--, w *= 0.5) {
        const b = this.binById.get(s[k]);
        if (b.requests.length) r += 40 * w;
        r += Math.min(this.binVelocity(b), 20) * 0.6 * w;
      }
      return r;
    }
    chooseStoreColumn(bin, fx, fy, robotId) {
      const g = this.sim.grid, cfg = this.sim.cfg, pol = cfg.putawayPolicy;
      const cls = this.binClass(bin);
      const target = { A: 0, B: 0.35, C: 0.75, E: 0.6 }[cls];
      let best = -1, bestS = Infinity;
      for (let i = 0; i < g.type.length; i++) {
        if (!g.isStorage(i) || g.stacks[i].length >= g.Z) continue;
        if (g.colLock[i] >= 0 && g.colLock[i] !== robotId) continue;
        const travel = WS.U.manhattan(fx, fy, g.cx(i), g.cy(i));
        let s;
        if (pol === 'random') s = this.sim.rng();
        else if (pol === 'nearest') s = travel + this.columnRisk(i) * 0.3;
        else {
          const nd = this.portDist[i] / this.maxPortDist;
          s = Math.abs(nd - target) * 26 + travel * 0.12 + this.columnRisk(i) * (cls === 'C' || cls === 'E' ? 1 : 0.4) + (g.stacks[i].length / g.Z) * 2;
        }
        if (s < bestS) { bestS = s; best = i; }
      }
      return best;
    }
    // Temporary column for a blocker bin during a dig: adjacent first, then further out.
    findTempColumn(x, y, robotId) {
      const g = this.sim.grid, origin = g.idx(x, y);
      for (let rad = 1; rad <= 4; rad++) {
        let best = -1, bestS = Infinity;
        for (let dx = -rad; dx <= rad; dx++) {
          const ady = rad - Math.abs(dx);
          for (const dy of ady ? [-ady, ady] : [0]) {
            const nx = x + dx, ny = y + dy;
            if (!g.inside(nx, ny)) continue;
            const i = g.idx(nx, ny);
            if (i === origin || !g.isStorage(i) || g.stacks[i].length >= g.Z) continue;
            if (g.colLock[i] >= 0) continue;
            if (g.claim[i] >= 0 && g.claim[i] !== robotId) continue;
            const s = this.columnRisk(i) + g.stacks[i].length * 0.4;
            if (s < bestS) { bestS = s; best = i; }
          }
        }
        if (best >= 0) return best;
      }
      return -1;
    }
  }

  WS.Inventory = Inventory;
  WS.BIN_VOLUME = BIN_VOLUME;
})((globalThis.WS = globalThis.WS || {}));
