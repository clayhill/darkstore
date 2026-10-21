/* ZoneHop: a pharmacy wholesaler's order picking. Nothing travels to a
 * picker here: the order tote travels past the stock. Pharmacies order
 * through the day, in waves before their route's van leaves. At order start
 * the de-stacker feeds an empty tote and a printer labels it; it runs along
 * the A-frame, whose belt carries a window per order under the channels,
 * each dispensing its product into the windows that need it, and at the end
 * of the belt the window tips into the tote. The tote then rides a conveyor
 * loop and turns off into every picking zone its order has lines in, and
 * only those: pick-to-light flow racks and a pair of horizontal carousels.
 * Slow movers are picked into a separate tote by RF pickers in shelving; it
 * joins its order at the merge, where an operator tips it into the order
 * tote. A closing line weighs, adds the documents, puts the lid on and
 * labels each tote, and the shipping sorter sends it down its route's lane,
 * where it waits for the van. Vans bring the empty totes of their last trip
 * back; the tote-emptying machine tips them and stacks them for the
 * de-stacker.
 * The shared orders (with pharmacies and routes), inventory (a location per
 * product) and KPIs are used; there are no robots, stations or packing. */
(function (WS) {
  'use strict';
  const M = { FLOOR: WS.CELL.BLOCKED, BELT: 20, LOOP: 21, AFRAME: 22, RACK: 23, MACHINE: 24, LANE: 25, SHELF: 26, DOCK: 27, CAROUSEL: 28, STACK: 29, MERGE: 30 };
  const TERMS = {
    unit: 'location', Unit: 'Location', units: 'locations', Units: 'Locations', store: 'picking area', Store: 'Picking area', port: 'zone', ports: 'zones', starve: 'totes', flow1: 'Order totes out /h', flow2: 'Order lines /h',
    fault: { button: 'Jam a channel', title: 'One of the busiest A-frame channels jams and dispenses nothing until a technician has freed it', note: 'The control room lists what is going on and the throughput chart marks it. A jammed channel dispenses nothing: every line for its product goes short and the tote goes to the completion zone. A refill operator on a break leaves the channels emptying; the busiest operator goes first.' },
  };
  const TIP = 1.0, PUT = 2.0, CHANNEL_PITCH = 0.1; // s the window takes to tip into the tote; s an RF picker takes to put a tote on the belt; m per A-frame channel
  const CARO_PITCH = 0.4; // m of carousel ring per carrier (one product each)
  const FETCH = 6; // s of a refill the operator takes to get the carton from the reserve rack

  // ---------------------------------------------------------------- catalogue
  const BASES = ['Paracetamol 500 mg', 'Paracetamol 1 g', 'Ibuprofen 200 mg', 'Ibuprofen 400 mg', 'Acetylsalicylic acid 100 mg', 'Naproxen 250 mg', 'Diclofenac gel 1%', 'Omeprazole 20 mg', 'Pantoprazole 40 mg', 'Esomeprazole 20 mg',
    'Amoxicillin 500 mg', 'Azithromycin 250 mg', 'Cetirizine 10 mg', 'Loratadine 10 mg', 'Desloratadine 5 mg', 'Simvastatin 20 mg', 'Atorvastatin 40 mg', 'Rosuvastatin 10 mg', 'Metformin 850 mg', 'Gliclazide 30 mg',
    'Amlodipine 5 mg', 'Lisinopril 10 mg', 'Ramipril 5 mg', 'Bisoprolol 2.5 mg', 'Nebivolol 5 mg', 'Losartan 50 mg', 'Levothyroxine 75 µg', 'Salbutamol inhaler', 'Budesonide inhaler', 'Montelukast 10 mg',
    'Vitamin D3 1000 IU', 'Vitamin C 500 mg', 'Vitamin B12', 'Magnesium 375 mg', 'Zinc 15 mg', 'Iron 80 mg', 'Folic acid 0.4 mg', 'Multivitamin', 'Omega-3 1000 mg', 'Calcium + D3',
    'Loperamide 2 mg', 'Macrogol sachets', 'Lactulose syrup', 'Probiotic', 'Xylometazoline spray', 'Sea water nasal spray', 'Fluticasone nasal spray', 'Chlorhexidine 0.5%', 'Povidone-iodine', 'Hydrocortisone cream 1%',
    'Clotrimazole cream', 'Arnica gel', 'Eye drops lubricating', 'Ear drops', 'Throat lozenges', 'Cough syrup', 'Melatonin 1 mg', 'Valerian', 'Nicotine gum 2 mg', 'Nicotine patch',
    'Plasters assorted', 'Sterile gauze', 'Elastic bandage', 'Digital thermometer', 'Pregnancy test', 'Glucose test strips', 'Lancets', 'Pen needles 4 mm', 'Sunscreen SPF50', 'Lip balm'];
  const PACKS = ['20 tabl', '30 tabl', '10 tabl', '60 tabl', '28 caps', '100 tabl', '14 caps', '56 caps', '50 ml', '150 ml', '30 g', '15 g', '8 sachets', '20 pc', '200 doses', '10 ml', '90 tabl', '250 ml'];
  // Pharmacies, on routes named after the region they cover
  const REGIONS = [['Gent', '9000'], ['Brugge', '8000'], ['Kortrijk', '8500'], ['Aalst', '9300'], ['Antwerpen', '2000'], ['Mechelen', '2800'], ['Leuven', '3000'], ['Hasselt', '3500'], ['Brussel', '1000'], ['Liège', '4000'], ['Namur', '5000'], ['Mons', '7000'], ['Oostende', '8400'], ['Turnhout', '2300'], ['Genk', '3600'], ['Charleroi', '6000']];
  const NAMES = ['Centrum', 'De Linde', 'Sint-Jan', 'Van Damme', 'Peeters', 'De Smet', 'Het Kruid', 'Du Parc', 'De Kroon', 'Maes', 'Goossens', 'Claes', 'Willems', 'Du Marché', 'De Ster', 'Mertens', 'Hermans', 'Lambert', 'Dubois', 'Nieuwland'];
  const OPS = ['Ana', 'Ben', 'Chloé', 'Daan', 'Eva', 'Femke', 'Gilles', 'Hanna', 'Ilse', 'Jonas', 'Kato', 'Lars', 'Mats', 'Nina', 'Omar', 'Pieter', 'Rosa', 'Sven', 'Tess', 'Wout'];
  const ROUTE_COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#2dd4bf', '#fb923c', '#60a5fa', '#e879f9', '#4ade80', '#f87171', '#facc15', '#22d3ee', '#a78bfa', '#fda4af', '#86efac'];

  // ---------------------------------------------------------------- floor
  // The floor in cells, as a map for the control room and the views. Rows
  // from the back: the tote return conveyor, the A-frame with a walkway on
  // each side for the refill operators, behind each walkway a flow rack of
  // reserve bins with the bin conveyors behind it, and below the A-frame the
  // Cuby shuttle store the bins come from. Order start is past the end of
  // the A-frame: its totes pass under the A-frame's hopper on their way to
  // the loop, with the zone spurs below it; to its right
  // the merge, the closing line and the shipping sorter with the route
  // lanes, the RF shelving below the merge and the vans at the far wall.
  class ZoneFloor extends WS.RobotFloor {
    constructor(cfg) {
      const cs = cfg.cellSize, afLen = (2 + (cfg.afChannels / 2) * CHANNEL_PITCH) / cs, AX = 4, tipX = AX + afLen + 0.7;
      const nz = cfg.ptlZones + (cfg.carousels > 0 ? 1 : 0), LX = Math.max(26, Math.ceil(tipX) - 2), RX = LX + 8 * nz + 8, LT = 7, LB = 13, SD = 4;
      const SX = RX + 25, laneY = (r) => LT + 3 + 2.8 * r, na = cfg.rfAisles, rfLevels = 5, bays = Math.max(2, Math.ceil(cfg.rfLocations / (na * 2 * rfLevels)));
      const AY = 4.5, CY0 = AY + 6.4, CW = 2.6; // the A-frame's belt; the Cuby's first aisle and aisle pitch
      const RFX = RX + 3, RFY = LB + 1, caroEnd = LB + SD + 1.7 + 1.6 + Math.max(1, (cfg.carouselShelves * CARO_PITCH / cs - 2 * Math.PI * 0.8) / 2);
      const W = Math.ceil(SX + 20), D = Math.ceil(Math.max(laneY(cfg.routes - 1) + 3, RFY + bays + 5, LB + SD + 9, cfg.carousels > 0 ? caroEnd + 1.5 : 0, CY0 + CW * cfg.cubyAisles + 1));
      super(W, D, M.FLOOR);
      Object.assign(this, { cfg, AX, afLen, tipX, nz, LX, RX, LT, LB, SD, SX, RFX, RFY, na, rfLevels, bays, laneY, caroEnd });
      this.AY = AY; this.SY = AY + 1.6; // A-frame belt; the feed from the tip position to the loop
      this.WK = 1.35; this.RK = 2.2; this.BK = 2.9; // the walkways, the reserve flow racks and the bin conveyors behind them, either side of the A-frame
      this.OSX = tipX + 3; // order start: the de-stacker, past the end of the A-frame
      // the Cuby: aisles along the A-frame, a lift at the west end of each; the bin conveyor out of it and the one for empty bins back
      Object.assign(this, { CY0, CW, CX0: AX, CX1: AX + afLen, BX: 1.6, EX: 0.9 });
      this.what = new Int16Array(W * D).fill(-1); // what a map cell shows: index into sim.things
      // the zones on the loop, then the other places where people or machines work, as stations
      const box = (x0, y0, x1, y1) => [{ x: Math.floor(x0), y: Math.floor(y0) }, { x: Math.floor(x1), y: Math.floor(y1) }];
      const st = (code, name, cells, o = {}) => this.ports.push(Object.assign({ kind: 'ZONE', code, name, face: 'front', drop: cells[0], lift: cells[0], cells, person: true }, o));
      for (let z = 0; z < cfg.ptlZones; z++) { const dx = RX - 5 - 8 * z; st('P' + (z + 1), z === 0 ? 'Pick-to-light 1 · completion' : 'Pick-to-light ' + (z + 1), box(dx - 4, LB + 1, dx + 0.9, LB + SD + 1.9), { zone: 'P' + (z + 1) }); }
      if (cfg.carousels > 0) { const dx = RX - 5 - 8 * cfg.ptlZones; st('CA', 'Carousels', box(dx - 4, LB + 1, dx + 0.9, caroEnd), { zone: 'CA' }); }
      st('AF', 'A-frame', box(AX - 0.5, AY - 0.7, AX + afLen + 0.4, AY + 0.7), { person: false, zone: 'AF' });
      st('RF', 'RF shelving', box(RFX, RFY, RFX + 3 * na - 0.1, RFY + bays + 1.9), { person: false, zone: 'RF' });
      st('MG', 'Merge', box(RX + 2.6, LT - 2, RX + 7.4, LT + 2.9));
      st('QC', 'Manual check', box(RX + 9.4, LT - 3.4, RX + 10.6, LT - 1.6));
    }
    depthOf() { return 1; }
    passable() { return false; }
    // cells of a rectangle or along a belt, of type t, for thing k
    mark(x0, y0, x1, y1, t, k = -1) {
      for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.D - 1, Math.floor(y1 - 1e-6)); y++)
        for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(this.W - 1, Math.floor(x1 - 1e-6)); x++) { const i = this.idx(x, y); this.type[i] = t; if (k >= 0) this.what[i] = k; }
    }
    markBelt(b, t, k = -1) {
      for (let s = 0; s <= b.len; s += 0.25) { const q = b.at(s), i = this.idx(Math.floor(q.x), Math.floor(q.y)); if (this.inside(Math.floor(q.x), Math.floor(q.y)) && this.type[i] === M.FLOOR) { this.type[i] = t; if (k >= 0) this.what[i] = k; } }
    }
    // Control room: conveyors, the A-frame by how empty its channels run,
    // zones and machines by what they are doing, route lanes by how full.
    mapFill(i, mix) {
      const sim = this.sim, t = this.type[i], k = this.what[i], th = k >= 0 ? sim.things[k] : null;
      if (th && th.fill) return th.fill(mix);
      return { [M.BELT]: '#1b2536', [M.LOOP]: '#1d2b42', [M.AFRAME]: '#16324f', [M.RACK]: '#1f3a2c', [M.MACHINE]: '#2b2440', [M.LANE]: '#2a2208', [M.SHELF]: '#23303f', [M.DOCK]: '#0f1a12', [M.CAROUSEL]: '#1f3a2c', [M.STACK]: '#1e293b', [M.MERGE]: '#26203a' }[t] || '#070b12';
    }
    get mapTitle() { return 'CONVEYORS · dots: totes, as in the tote time split · lanes by fill'; }
  }

  // ---------------------------------------------------------------- orders
  // The shared order book with pharmacies on routes: an order is due on the
  // first van of its route that leaves at least the cut-off after it came
  // in. Orders come in waves: faster as a tour's departure comes nearer.
  class ZoneOMS extends WS.OMS {
    get emptyTotes() { return this.freeTotes.length; }
    // how fast orders come in now, relative to the average: low just after a tour, highest just before the next
    waveFactor(t) {
      const c = this.sim.cfg, T = c.tourEvery, f = ((((t - c.firstTour) % T) + T) % T) / T;
      return 1 + c.waves * (3 * f * f - 1) / 2;
    }
    createOrder(spec) {
      const sim = this.sim, ph = spec.pharmacy || sim.pharmacies[Math.floor(sim.rng() * sim.pharmacies.length)];
      for (const l of spec.lines || []) if (!(sim.inv.byGtin.get(l.gtin) || {}).loc) throw new Error('No pick location for GTIN ' + l.gtin);
      const o = super.createOrder(Object.assign({}, spec, { customer: spec.customer || ph.name, postcode: spec.postcode || ph.postcode, city: spec.city || ph.city, country: 'BE' }));
      o.pharmacy = ph; o.route = ph.route; o.due = sim.dueDeparture(ph.route, o.created);
      o.totes = []; o.ntotes = 0; o.shipped = 0; o.rf = null; o.carrier = { name: ph.route.name };
      for (const l of o.lines) { l.o = o; l.bin = sim.inv.byGtin.get(l.gtin).loc; l.zone = l.bin.zone; l.short = 0; l.done = false; }
      sim.waiting.push(o);
      return o;
    }
    // A pharmacy order: minLines … maxLines different products, the fast movers most often.
    generateOrder() {
      const sim = this.sim, c = sim.cfg, rng = sim.rng, prods = sim.stocked, w = sim.stockedW;
      const n = Math.min(prods.length, c.minLines + Math.floor(rng() * (c.maxLines - c.minLines + 1))), seen = new Set(), lines = [];
      for (let k = 0; lines.length < n && k < n * 20; k++) {
        const p = prods[rng.weighted(w, sim.stockedTot)];
        if (seen.has(p)) continue;
        seen.add(p);
        const r = rng();
        lines.push({ gtin: p.gtin, qty: r < 0.6 ? 1 : r < 0.85 ? 2 : 3 });
      }
      return this.createOrder({ lines, source: 'auto' });
    }
    update(dt) {
      const sim = this.sim, cfg = sim.cfg;
      if (cfg.autoOrders && cfg.orderRate > 0) {
        this.orderAcc += dt * sim.disrupt.rateFactor * this.waveFactor(sim.time); // a surge, and the waves, run the arrival clock faster
        const rate = cfg.orderRate / 3600;
        if (this.nextGap === undefined) this.nextGap = -Math.log(1 - sim.rng()) / rate;
        while (this.orderAcc >= this.nextGap) {
          this.orderAcc -= this.nextGap;
          this.nextGap = -Math.log(1 - sim.rng()) / rate;
          this.generateOrder();
        }
      }
    }
  }

  // ---------------------------------------------------------------- zones
  // A zone, a machine or a work place, as the shared views know stations:
  // the control room's cards, the map's outlines, breaks (WS.Disruptions).
  class ZonePort extends WS.Port {
    constructor(sim, idx, def) {
      super(sim, idx, def);
      this.name = def.name; this.code = def.code; this.zone = def.zone;
      this.stats.totes = 0; this.stats.skipped = 0; this.stats.idle = 0;
    }
    get job() { return this.busy ? { lines: [null], next: 0, t: 0, total: 1 } : null; }
    set job(v) {}
    update(dt) { this.stats.t += dt; if (this.away) this.stats.away = (this.stats.away || 0) + dt; }
  }

  // A person who walks: the A-frame's refill operators and the RF pickers.
  class Walker {
    constructor(sim, k, role, x, y) {
      Object.assign(this, { sim, id: k, role, roleName: role === 'rf' ? 'RF picker' : 'Refill operator', name: OPS[(k + (role === 'rf' ? 7 : 0)) % OPS.length], x, y, px: x, py: y, path: [], state: 'IDLE', t: 0, distance: 0, heading: 0, done: 0 });
      this.stateTime = { IDLE: 0, WALKING: 0, WORKING: 0, BREAK: 0 };
    }
    get utilization() { const s = this.stateTime, tot = s.IDLE + s.WALKING + s.WORKING; return tot ? (s.WALKING + s.WORKING) / tot : 0; }
    // walk along the path; true once there
    walk(dt) {
      const sim = this.sim;
      let m = (sim.cfg.walkSpeed / sim.cfg.cellSize) * dt;
      while (m > 1e-9 && this.path.length) {
        const p = this.path[0], dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
        if (d > 1e-9) this.heading = Math.atan2(dy, dx);
        if (d <= m) { this.x = p.x; this.y = p.y; m -= d; this.distance += d; this.path.shift(); } else { this.x += (dx / d) * m; this.y += (dy / d) * m; this.distance += m; m = 0; }
      }
      return !this.path.length;
    }
  }

  // ---------------------------------------------------------------- simulation
  class ZoneSim extends WS.Sim {
    get kind() { return 'zone'; }
    get terms() { return TERMS; }
    get armsAllowed() { return false; }
    defaults() { return WS.ZONE_CONFIG; }
    createGrid() { const g = new ZoneFloor(this.cfg); g.sim = this; return g; }
    createPort(k, def) { return new ZonePort(this, k, def); }
    createOMS() { return new ZoneOMS(this); }
    describe() { const c = this.cfg; return `ZoneHop online · A-frame of ${c.afChannels} channels · ${this.zones.length} zones on the loop · RF shelving · ${c.routes} routes · ${this.oms ? this.oms.totes.length : c.toteCount} totes`; }
    storageCapacity() { return this.inv.bins.length; }
    fetchCost() { return 0; }
    // who can go on a break: the zone and work place operators, the RF pickers and the refill operators
    breakTargets() { return [...this.ports.filter((p) => p.person), ...this.pickers, ...this.refillers]; }

    // ---------------------------------------------------------------- seeding
    seed() {
      const cfg = this.cfg, g = this.grid;
      this.things = []; // what map cells show (inspectors, map colours)
      this.stats = { started: 0, orders: 0, afTotes: 0, out: 0, recirc: 0, loopTotes: 0, short: 0, completed: 0, rfTotes: 0, merged: 0, weightFails: 0, missed: 0, shipped: 0, mergeWait: 0, mergeN: 0, zoneShort: 0 };
      this.windows = []; // A-frame windows on the belt, the front one first
      this.merge = { totes: [], rf: [], out: [], job: null, lanes: new Array(this.cfg.mergeBuffer).fill(null) };
      this.checkStation = { tote: null, t: 0, done: 0 };
      this.waiting = []; // orders waiting for order start
      const port = (code) => this.ports.find((p) => p.code === code);
      this.afPort = port('AF'); this.rfPort = port('RF'); this.mergePort = port('MG'); this.checkPort = port('QC');
      this.seedCatalog();
      this.seedRoutes();
      this.buildBelts();
      this.slot();
      // velocity prior: expected order lines an hour
      const dTot = this.stocked.reduce((a, p) => a + p.demand, 0);
      for (const p of this.inv.products) p.hits = p.loc ? (cfg.orderRate * ((cfg.minLines + cfg.maxLines) / 2) * p.demand) / dTot : 0;
      this.inv.classify();
      this.pickers = []; this.refillers = [];
      for (let k = 0; k < cfg.refillOps; k++) this.refillers.push(new Walker(this, k, 'refill', g.AX + 2 + k * 4, g.AY - g.WK));
      for (let k = 0; k < cfg.rfPickers; k++) { const d = this.rfDepot(); this.pickers.push(new Walker(this, k, 'rf', d.x - 0.5 - k * 0.7, d.y)); }
      this.rfQueue = []; // orders whose RF lines wait for a picker
      this.startT = 0; this.startNext = []; // totes of the order being started, still to go
      this.returnDock = []; this.vansOut = []; this.vanLog = []; this.recycling = [];
      this.ejects = []; this.tips = []; // for the views
    }
    // Products: small boxes of medicines and care products (0.05 … 0.5 L).
    seedCatalog() {
      const inv = this.inv, rng = this.rng, n = this.cfg.products;
      for (let k = 0; k < n; k++) {
        const name = BASES[k % BASES.length] + ' · ' + PACKS[Math.floor(k / BASES.length) % PACKS.length] + (k >= BASES.length * PACKS.length ? ' ' + (1 + Math.floor(k / (BASES.length * PACKS.length))) : '');
        const vol = +(0.05 + rng() * rng() * 0.45).toFixed(3);
        inv.addProduct({ name, vol, weight: +(vol * (0.3 + rng() * 0.6)).toFixed(3), demand: 1 / Math.pow(k + 1, 1.1) });
      }
      const d = inv.products.map((p) => p.demand);
      for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
      inv.products.forEach((p, i) => (p.demand = d[i]));
    }
    // An A-frame takes small, regular boxes: the ones that slide down a channel.
    fitsAframe(p) { return p.vol <= 0.3 && parseInt(p.gtin.slice(7, 12), 10) % 5 !== 2; }
    // Routes, each with its pharmacies and its van; departures every tour, a van after the other.
    seedRoutes() {
      const c = this.cfg;
      this.routes = []; this.pharmacies = [];
      for (let r = 0; r < c.routes; r++) {
        const [city, pc] = REGIONS[r % REGIONS.length];
        const route = { id: r, name: `R${String(r + 1).padStart(2, '0')} ${city}`, city, color: ROUTE_COLORS[r % ROUTE_COLORS.length], next: 0, trips: 0, totes: 0, missed: 0, pharmacies: [] };
        route.next = this.departure(route, this.time);
        for (let k = 0; k < 20; k++) {
          const ph = { id: this.pharmacies.length, name: `${pc < '4000' || pc >= '8000' ? 'Apotheek' : 'Pharmacie'} ${NAMES[(k * 7 + r * 3) % NAMES.length]}`, city, postcode: String(+pc + 10 * (k % 9)), route };
          route.pharmacies.push(ph); this.pharmacies.push(ph);
        }
        this.routes.push(route);
      }
    }
    // route r's first departure at or after time t
    departure(route, t) {
      const c = this.cfg, off = c.firstTour + route.id * c.vanStagger;
      return t <= off ? off : off + Math.ceil((t - off) / c.tourEvery) * c.tourEvery;
    }
    dueDeparture(route, created) { return this.departure(route, created + this.cfg.cutoff); }

    // ---------------------------------------------------------------- conveyors
    buildBelts() {
      const cfg = this.cfg, g = this.grid, net = (this.net = new WS.BeltNet(this, cfg.conveyorSpeed / cfg.cellSize, cfg.totePitch / cfg.cellSize));
      const { LX, RX, LT, LB, SD, SX, SY } = g, J = LX + 4;
      // from order start to the tip position under the hopper at the end of the A-frame's belt, then up to the loop
      const B = (this.belts = {});
      B.start = net.belt('start', [{ x: g.OSX - 0.6, y: g.AY }, { x: g.tipX, y: g.AY }], { exit: (t) => this.atTip(t) });
      B.feed = net.belt('feed', [{ x: g.tipX, y: g.AY }, { x: g.tipX, y: SY }, { x: J, y: SY }, { x: J, y: LT }]);
      // the loop, east along the top: segments between the entry (J), the exit (X) and the zone spurs
      const loopLen = 2 * (RX - LX) + 2 * (LB - LT), X = RX - LX, U = (x, side) => (side ? X + (LB - LT) + (RX - x) : x - LX);
      const at = (u) => {
        u = ((u % loopLen) + loopLen) % loopLen;
        if (u <= X) return { x: LX + u, y: LT };
        if (u <= X + (LB - LT)) return { x: RX, y: LT + u - X };
        if (u <= 2 * X + (LB - LT)) return { x: RX - (u - X - (LB - LT)), y: LB };
        return { x: LX, y: LB - (u - 2 * X - (LB - LT)) };
      };
      const corners = [X, X + (LB - LT), 2 * X + (LB - LT), loopLen];
      const arc = (u0, u1) => { if (u1 <= u0) u1 += loopLen; const pts = [at(u0)]; for (const c0 of [...corners, ...corners.map((c1) => c1 + loopLen)]) if (c0 > u0 + 1e-9 && c0 < u1 - 1e-9) pts.push(at(c0)); pts.push(at(u1)); return pts; };
      this.zones = [];
      const zdefs = [];
      for (let z = 0; z < cfg.ptlZones; z++) zdefs.push({ id: 'P' + (z + 1), kind: 'ptl', name: z === 0 ? 'Pick-to-light 1 · completion' : 'Pick-to-light ' + (z + 1) });
      if (cfg.carousels > 0) zdefs.push({ id: 'CA', kind: 'carousel', name: 'Carousels' });
      const nodes = [{ u: U(J, 0), kind: 'J' }, { u: X, kind: 'X' }];
      zdefs.forEach((zd, k) => { const dx = RX - 5 - 8 * k; nodes.push({ u: U(dx, 1), kind: 'd', z: k }, { u: U(dx - 3, 1), kind: 'r', z: k }); zd.dx = dx; });
      nodes.sort((a, b) => a.u - b.u);
      const segs = nodes.map((n, k) => { const m = nodes[(k + 1) % nodes.length]; return net.belt('the loop', arc(n.u, m.u), { kind: 'loop' }); });
      B.loop = segs;
      const after = (kind, z) => segs[nodes.findIndex((n) => n.kind === kind && n.z === z)]; // the segment that starts at a node
      const before = (kind, z) => segs[(nodes.findIndex((n) => n.kind === kind && n.z === z) + nodes.length - 1) % nodes.length]; // the one that ends there
      // zones: a spur off the loop down to the pick position and back up, downstream
      zdefs.forEach((zd, k) => {
        const dx = zd.dx, py = LB + SD, port = this.ports[k];
        const zone = Object.assign(zd, { idx: k, port, bins: [], job: null, done: 0, lines: 0, units: 0, skipped: 0, visits: 0, pick: { x: dx - 1.5, y: py } });
        zone.in = net.belt(zd.id + ' spur', [{ x: dx, y: LB }, { x: dx, y: py }, { x: dx - 1.5, y: py }], { exit: (t) => (t.done.has(zd.id) ? zone.out : null) });
        zone.out = net.belt(zd.id + ' spur, back to the loop', [{ x: dx - 1.5, y: py }, { x: dx - 3, y: py }, { x: dx - 3, y: LB }]);
        port.zoneRef = zone;
        this.zones.push(zone);
      });
      // exits of the loop segments: the entry and exit nodes, the spurs
      nodes.forEach((n, k) => {
        const seg = segs[(k + nodes.length - 1) % nodes.length], next = segs[k];
        if (n.kind === 'J') seg.exit = () => next;
        else if (n.kind === 'X') seg.exit = (t) => this.atExit(t, next);
        else if (n.kind === 'd') { const zone = this.zones[n.z]; seg.exit = (t) => this.atDivert(t, zone, next); }
        else seg.exit = () => next;
      });
      // who feeds whom: the loop first, then the spurs' returns and the feed from order start
      segs.forEach((s, k) => net.link(segs[(k + segs.length - 1) % segs.length], s));
      net.link(B.feed, after('J'));
      B.start.exit = (t) => this.atTip(t);
      B.feed.exit = () => after('J');
      this.zones.forEach((zone, k) => { net.link(before('d', k), zone.in); net.link(zone.out, after('r', k)); zone.out.exit = () => after('r', k); });
      this.loopSegs = segs; this.loopCap = loopLen / net.pitch;
      // out of the loop to the merge; the RF totes come up from the shelving
      const MX = RX + 2.6;
      B.exit = net.belt('to merge', [{ x: RX, y: LT }, { x: MX, y: LT }], { exit: (t) => this.intoMerge(t) });
      net.link(after('X'), B.exit);
      const dep = this.rfDepot();
      B.rf = net.belt('RF totes', [{ x: dep.x + 0.9, y: dep.y }, { x: dep.x + 0.9, y: LT + 2 }, { x: MX + 0.6, y: LT + 2 }], { exit: (t) => this.rfIn(t) });
      // the closing line (one machine for each step), the manual check beside the scale
      const C0 = RX + 8, step = 3;
      this.machines = [['scale', 'Check-weigher'], ['docs', 'Document inserter'], ['lid', 'Lidding machine'], ['label', 'Label printer & applicator']].map(([id, name], k) => ({ id, name, k, x: C0 + 2 + step * k, y: LT, tote: null, t: 0, busy: 0, cycles: 0 }));
      const mx = this.machines.map((m) => m.x);
      B.close = [net.belt('closing 0', [{ x: C0, y: LT }, { x: mx[0], y: LT }])];
      B.close.push(net.belt('closing 1a', [{ x: mx[0], y: LT }, { x: mx[0] + 1.5, y: LT }]));
      B.close.push(net.belt('closing 1b', [{ x: mx[0] + 1.5, y: LT }, { x: mx[1], y: LT }]));
      for (let k = 2; k < 4; k++) B.close.push(net.belt('closing ' + k, [{ x: mx[k - 1], y: LT }, { x: mx[k], y: LT }]));
      B.check = net.belt('to manual check', [{ x: mx[0], y: LT }, { x: mx[0], y: LT - 2.4 }], { exit: (t) => this.atCheck(t) });
      B.checkBack = net.belt('from manual check', [{ x: mx[0], y: LT - 2.4 }, { x: mx[0] + 1.5, y: LT - 2.4 }, { x: mx[0] + 1.5, y: LT }]);
      const [c0, c1a, c1b, c2, c3] = B.close;
      c0.exit = (t) => this.atMachine(t, this.machines[0], () => (t.failed ? B.check : c1a));
      c1a.exit = () => c1b; net.link(c1a, c1b); net.link(B.checkBack, c1b); B.checkBack.exit = () => c1b;
      net.link(c0, c1a); net.link(c0, B.check);
      c1b.exit = (t) => this.atMachine(t, this.machines[1], () => c2); net.link(c1b, c2);
      c2.exit = (t) => this.atMachine(t, this.machines[2], () => c3); net.link(c2, c3);
      // the shipping sorter: down past the route lanes, a diverter at each
      const y0 = LT + 1.5;
      B.sorter = [net.belt('to sorter', [{ x: mx[3], y: LT }, { x: SX, y: LT }, { x: SX, y: y0 }])];
      c3.exit = (t) => this.atMachine(t, this.machines[3], () => B.sorter[0]); net.link(c3, B.sorter[0]);
      this.lanes = this.routes.map((route, r) => {
        const y = g.laneY(r), lane = { route, y, stack: [], belt: null };
        lane.belt = net.belt('lane ' + (r + 1), [{ x: SX, y }, { x: SX + 5.2, y }], { exit: (t) => this.intoLane(t, lane), kind: 'lane' });
        route.lane = lane;
        const prev = B.sorter[B.sorter.length - 1], seg = net.belt('sorter ' + (r + 1), [{ x: SX, y: prev.pts[prev.pts.length - 1].y }, { x: SX, y }]);
        if (!prev.exit) prev.exit = () => seg;
        net.link(prev, seg);
        B.sorter.push(seg);
        return lane;
      });
      B.sorter.forEach((seg, k) => { if (k) seg.exit = (t) => (t.route === k - 1 ? this.lanes[k - 1].belt : B.sorter[k + 1] || null); });
      this.lanes.forEach((lane, r) => net.link(B.sorter[r + 1], lane.belt));
      // tote return: back along the far wall to the tote-emptying machine and the de-stacker
      B.ret = net.belt('tote return', [{ x: SX + 9, y: 0.6 }, { x: g.OSX + 0.8, y: 0.6 }], { exit: (t) => this.atEmptier(t), kind: 'return' });
      this.emptier = { x: g.OSX, y: 0.6, tote: null, t: 0, cycles: 0 };
      this.cuby = { aisles: [...Array(cfg.cubyAisles)].map((_, a) => ({ a, y: g.CY0 + g.CW * (a + 0.5), free: 0, out: 0 })), queue: [], jobs: [], moving: [], retrieved: 0, stored: 0 };
      this.markFloor();
    }
    rfDepot() { const g = this.grid; return { x: g.RFX + 0.6, y: g.RFY - 0.6 }; }
    // the cells of the map: belts, machines, zones, lanes
    markFloor() {
      const g = this.grid, B = this.belts, thing = (o) => { this.things.push(o); return this.things.length - 1; };
      const af = thing({ kind: 'aframe', fill: (mix) => this.afFill(mix) });
      g.mark(g.AX - 0.5, g.AY - 0.7, g.AX + g.afLen + 0.5, g.AY + 0.8, M.AFRAME, af);
      for (const s of [-1, 1]) g.mark(g.AX - 0.3, g.AY + s * g.RK - 0.35, g.AX + g.afLen + 0.3, g.AY + s * g.RK + 0.35, M.SHELF, af);
      for (const b of this.net.belts) g.markBelt(b, b.kind === 'loop' ? M.LOOP : b.kind === 'lane' ? M.LANE : M.BELT);
      for (const z of this.zones) {
        const k = thing({ kind: 'zone', zone: z, fill: (mix) => this.zoneFill(z, mix) });
        g.mark(z.dx - 4.4, g.LB + 1, z.dx + 1.4, z.kind === 'carousel' ? g.caroEnd + 0.3 : g.LB + g.SD + 2.3, z.kind === 'carousel' ? M.CAROUSEL : M.RACK, k);
        g.markBelt(z.in, M.BELT, k); g.markBelt(z.out, M.BELT, k);
      }
      for (const m of this.machines) g.mark(m.x - 0.6, g.LT - 0.8, m.x + 0.6, g.LT + 1, M.MACHINE, thing({ kind: 'machine', m, fill: (mix) => this.machineFill(m) }));
      g.mark(g.RX + 2.6, g.LT - 2, g.RX + 7.4, g.LT + 3, M.MERGE, thing({ kind: 'merge', fill: (mix) => mix('#26203a', '#dc2626', Math.min(1, this.merge.totes.length / this.cfg.mergeBuffer)) }));
      g.mark(g.RFX, g.RFY, g.RFX + 3 * g.na + 1, g.RFY + g.bays + 2, M.SHELF, thing({ kind: 'rf' }));
      for (const lane of this.lanes) g.mark(g.SX + 0.5, lane.y - 0.8, g.SX + 11, lane.y + 1.2, M.LANE, thing({ kind: 'lane', lane, fill: (mix) => mix('#2a2208', '#f59e0b', Math.min(1, lane.stack.length / this.cfg.vanCapacity)) }));
      g.mark(g.OSX - 0.6, g.AY - 0.7, g.OSX + 0.6, g.AY + 0.7, M.STACK, thing({ kind: 'start' }));
      g.mark(g.OSX - 0.7, 0, g.OSX + 0.6, 1.2, M.MACHINE, thing({ kind: 'start' }));
      // the Cuby with its lifts, and the bin conveyors round to the backs of the flow racks
      const cb = thing({ kind: 'cuby' });
      g.mark(g.CX0 - 0.9, g.CY0, g.CX1, g.CY0 + g.CW * this.cfg.cubyAisles, M.SHELF, cb);
      for (const [x0, y0, x1, y1] of [[g.EX - 0.3, g.AY - g.BK, g.BX + 0.3, g.CY0 + g.CW * this.cfg.cubyAisles], [g.EX - 0.3, g.AY - g.BK - 0.3, g.CX1 + 0.3, g.AY - g.BK + 0.3], [g.EX - 0.3, g.AY + g.BK - 0.3, g.CX1 + 0.3, g.AY + g.BK + 0.3]]) g.mark(x0, y0, x1, y1, M.BELT, cb);
      g.mark(g.SX + 11.2, 0, g.W, g.D, M.DOCK);
    }

    // ---------------------------------------------------------------- slotting
    // Products by units a day: the fastest that fit the A-frame's channels go
    // there, the next ones to pick-to-light (shared out over the zones), then
    // the carousels; the long tail to the RF shelving. Each location holds
    // one product; it starts half to completely full.
    slot() {
      const cfg = this.cfg, inv = this.inv, g = this.grid, rng = this.rng;
      const byDemand = inv.products.slice().sort((a, b) => b.demand - a.demand), dTot = byDemand.reduce((s, p) => s + p.demand, 0);
      const unitsPerHour = (p) => (p.demand / dTot) * cfg.orderRate * ((cfg.minLines + cfg.maxLines) / 2) * 1.55;
      const loc = (p, zone, code, x, y, cap, extra) => {
        const bin = inv.createBin(1, { prefix: zone + '-', digits: 4, asset: 50, vol: cap * p.vol });
        Object.assign(bin, { loc: 'grid', x: Math.floor(x), y: Math.floor(y), zone, code, cap, wx: x, wy: y }, extra);
        inv.setComp(bin, 0, p.gtin);
        const q = Math.max(1, Math.round(cap * (0.5 + rng() * 0.5)));
        bin.comps[0].qty = q; p.onHand += q; p.loc = bin;
        return bin;
      };
      const zoneCap = (p) => Math.max(20, Math.ceil(unitsPerHour(p) * cfg.zoneStock));
      // A-frame: channel k on side s (0 the back, 1 the front), along the belt
      this.channels = [];
      const af = byDemand.filter((p) => this.fitsAframe(p)).slice(0, cfg.afChannels), per = Math.ceil(cfg.afChannels / 2);
      af.forEach((p, n) => {
        const side = n % 2, k = Math.floor(n / 2), b = (1 + (k + 0.5) * CHANNEL_PITCH); // m along the belt
        const x = g.AX + b / cfg.cellSize, ch = loc(p, 'AF', `AF ${side ? 'F' : 'B'}-${String(k + 1).padStart(3, '0')}`, x, g.AY + (side ? 0.45 : -0.45), cfg.channelCap, { side, slot: k, b, req: null, jam: null, dispensed: 0, refills: 0, res: cfg.reserveBins, incoming: 0 });
        this.channels.push(ch);
      });
      this.channelsByB = this.channels.slice().sort((a, b) => a.b - b.b);
      const rest = byDemand.filter((p) => !p.loc);
      let k = 0;
      // pick-to-light: shared out over the zones so each has about as many
      // lines to pick, on a flow rack wall behind the operator (bays across, five levels)
      const ptl = this.zones.filter((z) => z.kind === 'ptl'), load = ptl.map(() => 0), nb = Math.ceil(cfg.ptlLocations / 5);
      for (let n = 0; n < ptl.length * cfg.ptlLocations && k < rest.length; n++, k++) {
        let zi = -1;
        ptl.forEach((z, i) => { if (z.bins.length < cfg.ptlLocations && (zi < 0 || load[i] < load[zi])) zi = i; });
        const z = ptl[zi], j = z.bins.length, lv = j % 5, bay = Math.floor(j / 5), x = z.dx - 4.2 + ((bay + 0.5) * 5.4) / nb;
        load[zi] += rest[k].demand;
        z.bins.push(loc(rest[k], z.id, `${z.id}-${String(bay + 1).padStart(2, '0')}-${lv + 1}`, x, g.LB + g.SD + 1.8, zoneCap(rest[k]), { bay, level: lv, bays: nb }));
      }
      // carousels: one product per shelf
      const ca = this.zones.find((z) => z.kind === 'carousel');
      if (ca) {
        ca.carousels = [];
        // each an oval running away from the operator, its near end the pick face
        for (let c = 0; c < cfg.carousels; c++) {
          const ring = cfg.carouselShelves * CARO_PITCH / cfg.cellSize, r = 0.8, len = Math.max(1, (ring - 2 * Math.PI * r) / 2);
          ca.carousels.push({ id: c, pos: 0, target: null, moved: 0, x: ca.pick.x + (c ? 1.4 : -1.4), y: ca.pick.y + 1.7, r, len, ring: cfg.carouselShelves * CARO_PITCH });
        }
        for (let n = 0; n < cfg.carousels * cfg.carouselShelves && k < rest.length; n++, k++) {
          const c = n % cfg.carousels, sh = Math.floor(n / cfg.carousels), cr = ca.carousels[c];
          ca.bins.push(loc(rest[k], 'CA', `CA${c + 1}-${String(sh + 1).padStart(2, '0')}`, cr.x, cr.y, zoneCap(rest[k]), { caro: c, shelf: sh }));
        }
      }
      // RF shelving: aisles across, a rack on each side of each, bays along it, levels
      this.rfBins = [];
      for (let n = 0; n < cfg.rfLocations && k < rest.length; n++, k++) {
        const per = g.bays * g.rfLevels * 2, a = Math.floor(n / per), r = n % per, side = Math.floor(r / (g.bays * g.rfLevels)), q = r % (g.bays * g.rfLevels), bay = Math.floor(q / g.rfLevels), lv = q % g.rfLevels;
        const x = g.RFX + 3 * a + (side ? 2.5 : 0.5), y = g.RFY + 1.5 + bay;
        this.rfBins.push(loc(rest[k], 'RF', `RF-${a + 1}${side ? 'B' : 'A'}-${String(bay + 1).padStart(2, '0')}-${lv + 1}`, x, y, zoneCap(rest[k]), { aisle: a, side, bay, level: lv }));
      }
      // only products with a location can be ordered
      this.stocked = inv.products.filter((p) => p.loc);
      this.stockedW = this.stocked.map((p) => p.demand); this.stockedTot = this.stockedW.reduce((a, b) => a + b, 0);
    }

    // ---------------------------------------------------------------- order start
    // The de-stacker feeds an empty tote and a printer labels it, a tote
    // every startTime seconds, while the loop is less than loopLimit full;
    // an order with A-frame lines also needs a free window on the belt.
    loopFill() { let n = 0; for (const s of this.loopSegs) n += s.totes.length; return n / this.loopCap; }
    orderStart(dt) {
      const c = this.cfg, oms = this.oms;
      if (this.startT > 0) { this.startT -= dt; return; }
      if (!this.startNext.length) {
        const o = this.nextOrder();
        if (!o) return;
        this.startNext = this.planTotes(o);
      }
      const t = this.startNext[0], o = t.order;
      if (!oms.freeTotes.length || !this.belts.start.hasRoom() || this.loopFill() >= c.loopLimit) return;
      if (t.afLines.length && !this.windowRoom()) return;
      this.startNext.shift();
      const tote = oms.freeTotes.shift();
      Object.assign(tote, t, { kind: 'order', at: 'conveyor', laps: 0, failed: false, docs: t.no === 1, sscc: null, started: this.time, route: o.route.id, lid: false, units: 0 });
      o.totes.push(tote); if (!o.tote) o.tote = tote;
      this.belts.start.put(tote);
      if (tote.afLines.length) { this.openWindow(tote); this.stats.afTotes++; }
      if (o.status === 'NEW') {
        o.status = 'RELEASED'; o.times.released = this.time; this.stats.orders++;
        if (o.lines.some((l) => l.zone === 'RF')) { o.rf = { state: 'WAIT', t: this.time, tote: null, lines: o.lines.filter((l) => l.zone === 'RF') }; this.rfQueue.push(o); }
        this.log('release', `${o.id} started · ${o.ntotes} tote${o.ntotes > 1 ? 's' : ''} · ${o.customer} (${o.route.name})`);
      }
      this.stats.started++;
      this.startT = c.startTime;
    }
    // the next order to start: due on the earliest van, then the oldest
    nextOrder() {
      let best = -1;
      this.waiting.forEach((o, k) => { const b = this.waiting[best]; if (!b || o.due < b.due || (o.due === b.due && o.created < b.created)) best = k; });
      return best < 0 ? null : this.waiting.splice(best, 1)[0];
    }
    // Share an order's lines over its totes: as many as its volume needs,
    // the A-frame's lines in the first (its window tips into it), the RF
    // lines in none (they come in their own tote).
    planTotes(o) {
      const c = this.cfg, inv = this.inv, vol = (l) => l.qty * inv.byGtin.get(l.gtin).vol;
      const lines = o.lines.filter((l) => l.zone !== 'RF'), af = lines.filter((l) => l.zone === 'AF'), zl = lines.filter((l) => l.zone !== 'AF');
      const order = this.zones.map((z) => z.id);
      zl.sort((a, b) => order.indexOf(a.zone) - order.indexOf(b.zone));
      const totes = [{ lines: af.slice(), vol: af.reduce((s, l) => s + vol(l), 0) }];
      for (const l of zl) {
        let t = totes[totes.length - 1];
        if (t.vol + vol(l) > c.toteVolume && t.lines.length) totes.push((t = { lines: [], vol: 0 }));
        t.lines.push(l); t.vol += vol(l);
      }
      o.ntotes = totes.length;
      return totes.map((t, k) => ({ order: o, no: k + 1, lines: t.lines, vol: t.vol, afLines: t.lines.filter((l) => l.zone === 'AF'), zones: new Set(t.lines.filter((l) => l.zone !== 'AF').map((l) => l.zone)), done: new Set(), window: null, tipped: false, tipAt: null, picked: 0 }));
    }

    // ---------------------------------------------------------------- A-frame
    // The belt carries a window per order; as it passes a channel holding
    // one of the order's products, the dispenser ejects the units into it,
    // a unit at a time, as many as it can while the window passes. At the
    // end of the belt the window tips into the order's tote, waiting there;
    // without it the belt stops.
    afBeltLen() { return 2 + (this.cfg.afChannels / 2) * CHANNEL_PITCH; } // m
    windowRoom() { const w = this.windows[this.windows.length - 1]; return !w || w.b >= this.cfg.windowLength; }
    openWindow(tote) {
      const lines = tote.afLines.map((l) => ({ line: l, ch: l.bin, need: l.qty, got: 0 })).sort((a, b) => a.ch.b - b.ch.b);
      const w = { tote, order: tote.order, b: 0, lines, units: 0, next: 0 };
      tote.window = w; this.windows.push(w);
    }
    stepAframe(dt) {
      const c = this.cfg, L = this.afBeltLen(), front = this.windows[0];
      this.afRunning = true;
      if (front && front.b >= L) {
        const at = this.belts.start.front;
        if (at && at === front.tote && at.s >= this.belts.start.len - 1e-6) this.tip(front);
        else { this.afRunning = false; this.afStopped = (this.afStopped || 0) + dt; return; }
      }
      const v = c.beltSpeed * dt, per = Math.max(1, Math.floor(c.windowLength / c.beltSpeed / c.unitTime));
      for (const w of this.windows) {
        w.b = Math.min(L, w.b + v);
        while (w.next < w.lines.length && w.lines[w.next].ch.b <= w.b) {
          const ln = w.lines[w.next++], ch = ln.ch, cp = ch.comps[0];
          const n = ch.jam ? 0 : Math.min(ln.need, cp.qty, per);
          if (n > 0) { this.takeUnits(ch, n); ch.dispensed += n; this.afPort.stats.units += n; this.ejects.push({ ch, n, t: this.time, w }); if (this.ejects.length > 80) this.ejects.shift(); }
          ln.got = n; w.units += n; ln.line.picked += n;
          if (n < ln.need) ln.line.short = ln.need - n; else { this.lineDone(ln.line, n); this.afPort.stats.lines++; }
          if (cp.qty <= c.refillLevel && !ch.req) this.requestRefill(ch);
        }
      }
      this.afPort.busy = this.windows.length > 0;
      if (this.afPort.busy) this.afPort.stats.busy += dt;
    }
    // The front window tips into its tote; lines it came short on send the tote to completion.
    tip(w) {
      const t = w.tote;
      this.windows.shift();
      t.tipped = true; t.tipAt = this.time; t.window = null; t.units += w.units;
      this.tips.push({ w, t: this.time }); if (this.tips.length > 10) this.tips.shift();
      const short = w.lines.filter((l) => l.line.short > 0);
      if (short.length) {
        t.zones.add(this.zones[0].id); t.completion = short.map((l) => l.line);
        this.stats.short += short.length;
        this.log('warn', `${w.order.id}: ${short.length} A-frame line${short.length > 1 ? 's' : ''} short → completion`);
      }
    }
    // the tote at the tip position waits for its window, then a moment for it to tip
    atTip(t) {
      if (t.window) return null;
      if (t.tipAt != null && this.time < t.tipAt + TIP) return null;
      return this.belts.feed;
    }
    // A channel at or below its refill level asks for a refill; refill
    // operators work the one that will run out first, as long as its lane in
    // the flow rack has a bin. At the channel the operator turns round to the
    // flow rack behind the walkway, takes the product's bin from it, sets it
    // on the ledge at the foot of the A-frame and fills the channel from it,
    // then puts the empty bin on the return lane at the top of the rack.
    requestRefill(ch) { ch.req = { t: this.time, op: null }; }
    channelUrgency(ch) { const p = this.inv.byGtin.get(ch.comps[0].gtin); return ch.comps[0].qty / Math.max(0.05, p.hits); }
    dispatchRefills() {
      for (const op of this.refillers) {
        if (op.job || op.away) continue;
        let best = null, bs = Infinity;
        for (const ch of this.channels) {
          if (!ch.req || ch.req.op || ch.res < 1) continue;
          const s = this.channelUrgency(ch) + Math.abs(ch.wx - op.x) * 0.02;
          if (s < bs) { bs = s; best = ch; }
        }
        if (!best) continue;
        best.req.op = op; op.job = best; op.state = 'WALKING'; op.path = this.refillPath(op, best);
      }
    }
    // along the walkway on the channel's side, round the west end of the frame
    // to change sides (the east end has the hopper and the tote conveyor)
    refillPath(op, ch) {
      const g = this.grid, yb = g.AY - g.WK, yf = g.AY + g.WK, y = ch.side ? yf : yb, onBack = op.y < g.AY;
      if (onBack === !ch.side) return [{ x: ch.wx, y }];
      const ex = g.AX - 1.2;
      return [{ x: ex, y: op.y }, { x: ex, y }, { x: ch.wx, y }];
    }
    stepRefillers(dt) {
      const c = this.cfg;
      for (const op of this.refillers) {
        op.px = op.x; op.py = op.y;
        if (op.away && !op.job) { op.state = 'BREAK'; op.stateTime.BREAK += dt; continue; }
        if (op.state === 'BREAK') op.state = 'IDLE';
        if (op.state === 'WALKING' && op.walk(dt)) { op.state = 'WORKING'; op.t = c.refillTime; op.job.res--; this.requestBin(op.job); }
        else if (op.state === 'WORKING') {
          op.t -= dt;
          if (op.t <= 0) {
            const ch = op.job, cp = ch.comps[0], n = ch.cap - cp.qty;
            if (n > 0) { cp.qty += n; this.inv.byGtin.get(cp.gtin).onHand += n; }
            ch.req = null; ch.refills++; op.done++; op.job = null; op.state = 'IDLE';
            this.binBack(ch);
          }
        }
        op.fetch = op.state === 'WORKING' && op.t > c.refillTime - FETCH; // taking the carton from the reserve rack
        op.stateTime[op.state] += dt;
      }
    }

    // ---------------------------------------------------------------- the Cuby
    // The shuttle store with the reserve bins of the A-frame's products: a
    // shuttle on every level of each aisle, a lift at the aisle's end. A flow
    // rack lane that has given up a bin asks for another; the aisle whose lift
    // is free first sends it (its shuttle fetches the bin, the lift brings it
    // down) and the bin conveyor carries it round to the back of the lane.
    // Empty bins go back along the conveyor over it. The Cuby's own stock is
    // not modelled: it always has the bin.
    requestBin(ch) { ch.incoming++; this.cuby.queue.push(ch); }
    stepCuby() {
      const c = this.cfg, cb = this.cuby, g = this.grid;
      while (cb.queue.length) {
        const ch = cb.queue.shift(), A = cb.aisles.reduce((m, x) => (x.free < m.free ? x : m), cb.aisles[0]);
        const t0 = Math.max(this.time, A.free), t1 = t0 + c.cubyRetrieve, level = (ch.slot * 7 + ch.refills * 3 + ch.side) % c.cubyLevels;
        const sx = g.CX0 + 1 + (((ch.slot * 37 + ch.side * 53 + ch.refills * 11) % 100) / 100) * (g.CX1 - g.CX0 - 2);
        A.free = t0 + c.cubyCycle; A.out++;
        cb.jobs.push({ a: A.a, level, sx, t0, t1, ch });
        const path = this.binPath(A, ch, true), len = this.pathLen(path), v = c.conveyorSpeed / c.cellSize;
        const m = { ch, full: true, path, len, t0: t1, t1: t1 + len / v };
        cb.moving.push(m);
        this.schedule(m.t1 - this.time, () => { ch.res++; ch.incoming--; cb.retrieved++; cb.moving.splice(cb.moving.indexOf(m), 1); });
      }
      while (cb.jobs.length && cb.jobs[0].t1 < this.time - 1) cb.jobs.shift();
    }
    // an empty bin from the top of the rack back to its aisle's lift
    binBack(ch) {
      const c = this.cfg, cb = this.cuby, A = cb.aisles[(ch.slot + ch.side) % cb.aisles.length], path = this.binPath(A, ch, false), len = this.pathLen(path);
      const m = { ch, full: false, path, len, t0: this.time, t1: this.time + len / (c.conveyorSpeed / c.cellSize) };
      cb.moving.push(m);
      this.schedule(m.t1 - this.time, () => { cb.stored++; cb.moving.splice(cb.moving.indexOf(m), 1); });
    }
    // out of the lift, along the bin conveyor to the back of the channel's lane and into it; or the way back for an empty one
    binPath(A, ch, full) {
      const g = this.grid, s = ch.side ? 1 : -1, yb = g.AY + s * g.BK, yr = g.AY + s * g.RK, lift = g.CX0 - 0.5, x = full ? g.BX : g.EX;
      const p = [{ x: lift, y: A.y }, { x, y: A.y }, { x, y: yb }, { x: ch.wx, y: yb }, { x: ch.wx, y: yr }];
      return full ? p : p.reverse();
    }
    pathLen(p) { let n = 0; for (let k = 1; k < p.length; k++) n += Math.hypot(p[k].x - p[k - 1].x, p[k].y - p[k - 1].y); return n; }

    // ---------------------------------------------------------------- the loop
    needs(t, zone) { return t.zones.has(zone.id) && !t.done.has(zone.id); }
    allDone(t) { for (const z of t.zones) if (!t.done.has(z)) return false; return true; }
    // A tote turns into a zone's spur when its order has lines there and the
    // spur has room; otherwise it stays on the loop (and goes round again).
    atDivert(t, zone, next) {
      if (this.needs(t, zone) && zone.in.totes.length < this.cfg.spurTotes && zone.in.hasRoom()) { zone.visits++; return zone.in; }
      return next;
    }
    // At the exit a finished tote leaves for the merge, if it may; any other goes round again.
    // A tote enters the loop before the exit, so it passes the exit once on its
    // way to the zones; passing it a third time it has gone round again.
    atExit(t, next) {
      if (!t.laps) { this.stats.loopTotes++; for (const z of this.zones) if (!t.zones.has(z.id)) z.skipped++; }
      else if (t.laps > 1) this.stats.recirc++;
      if (this.allDone(t) && this.mergeTakes(t)) return this.belts.exit;
      t.laps++;
      return next;
    }

    // ---------------------------------------------------------------- zones
    // Pick-to-light: the operator picks the tote's lines in the zone, the
    // lights showing each location and quantity, and confirms each. The
    // completion zone also picks the units the A-frame came short on, from
    // its reserve. Carousels: the operator picks from one carousel while the
    // other turns to the shelf with its next line.
    stepZones(dt) {
      const c = this.cfg;
      for (const z of this.zones) {
        const port = z.port, f = z.in.front;
        port.busy = false;
        if (port.away) continue;
        if (!z.job && f && f.s >= z.in.len - 1e-6 && this.needs(f, z)) z.job = this.zoneJob(z, f);
        if (z.kind === 'carousel') this.stepCarousels(z, dt);
        const j = z.job;
        if (!j) continue;
        if (z.kind === 'ptl') {
          if (!j.cur && j.queue.length) { j.cur = j.queue.shift(); j.t = c.ptlLine + c.ptlUnit * j.cur.qty; }
        }
        if (j.cur) {
          port.busy = true; port.stats.busy += dt; j.t -= dt;
          if (j.t <= 0) { this.zonePick(z, j.cur); j.cur = null; }
        } else if (z.kind === 'carousel' && j.queues.some((q) => q.length)) port.stats.blocked += dt; // waiting for a carousel to turn
        if (!j.cur && !j.queue.length && (!j.queues || !j.queues.some((q) => q.length))) {
          j.tote.done.add(z.id); z.job = null; z.done++; port.stats.totes++; port.stats.presented++;
        }
      }
    }
    zoneJob(z, t) {
      const own = t.lines.filter((l) => l.zone === z.id).map((l) => ({ line: l, qty: l.qty, bin: l.bin }));
      const compl = z === this.zones[0] && t.completion ? t.completion.map((l) => ({ line: l, qty: l.short, bin: null, completion: true })) : [];
      const j = { tote: t, queue: [...own, ...compl], cur: null, t: 0, n: own.length + compl.length };
      if (z.kind === 'carousel') { j.queues = z.carousels.map((cr) => j.queue.filter((x) => x.bin.caro === cr.id)); j.queue = []; j.last = -1; }
      return j;
    }
    zonePick(z, x) {
      const port = z.port, l = x.line;
      let q = x.qty;
      if (x.completion) { l.short = 0; l.picked += q; this.stats.completed++; }
      else {
        q = this.takeUnits(x.bin, x.qty);
        l.picked += q;
        if (q < x.qty) { l.short = x.qty - q; this.stats.zoneShort++; this.log('warn', `${x.bin.code} empty: ${l.o.id} ${x.qty - q} unit${x.qty - q > 1 ? 's' : ''} short`); }
      }
      this.lineDone(l, q);
      z.lines++; z.units += q; port.stats.lines++; port.stats.units += q;
      z.job.tote.units += q;
    }
    // Two carousels per operator: each turns (the shorter way round) to the
    // shelf of its next line; the operator picks from whichever has arrived,
    // taking turns, so one turns while she picks from the other. With no
    // line left on it for this tote, a carousel turns ahead for the next one
    // on the spur.
    stepCarousels(z, dt) {
      const c = this.cfg, j = z.job, v = c.carouselSpeed * dt;
      z.carousels.forEach((cr, k) => {
        const q = j && j.queues[k];
        let target = null;
        if (q && q.length && !(j.cur && j.cur.car === k)) {
          q.sort((a, b) => this.ringDist(cr, a.bin.shelf) - this.ringDist(cr, b.bin.shelf));
          target = q[0].bin.shelf;
        } else if (!j || !q || !q.length) {
          const nt = z.in.totes[j ? 1 : 0];
          const nl = nt && nt.lines.find((l) => l.zone === z.id && l.bin.caro === k);
          if (nl) target = nl.bin.shelf;
        }
        cr.target = target;
        if (target == null) return;
        const d = this.ringDelta(cr, target);
        if (Math.abs(d) > 1e-6) { const m = Math.min(Math.abs(d), v); cr.pos = (cr.pos + Math.sign(d) * m + cr.ring) % cr.ring; cr.moved += m; }
      });
      if (!j || j.cur) return;
      // the operator takes the next line on a carousel that has arrived, the other one than last time first
      const ready = z.carousels.filter((cr, k) => j.queues[k].length && Math.abs(this.ringDelta(cr, j.queues[k][0].bin.shelf)) < 1e-6).map((cr) => cr.id);
      if (!ready.length) return;
      const k = ready.length > 1 && ready[0] === j.last ? ready[1] : ready[0];
      j.cur = j.queues[k].shift(); j.cur.car = k; j.last = k; j.t = c.carouselLine + c.carouselUnit * j.cur.qty;
    }
    // Where a point u cells round a carousel is: from the pick face at its
    // near end, round the near end, along one side, round the far end, back.
    caroAt(cr, u) {
      const r = cr.r, L = cr.len, q = (Math.PI * r) / 2, R = 2 * L + 2 * Math.PI * r;
      u = ((u % R) + R) % R;
      if (u < q) { const a = -Math.PI / 2 + u / r; return { x: cr.x + r * Math.cos(a), y: cr.y + r + r * Math.sin(a) }; }
      u -= q;
      if (u < L) return { x: cr.x + r, y: cr.y + r + u };
      u -= L;
      if (u < Math.PI * r) { const a = u / r; return { x: cr.x + r * Math.cos(a), y: cr.y + r + L + r * Math.sin(a) }; }
      u -= Math.PI * r;
      if (u < L) return { x: cr.x - r, y: cr.y + r + L - u };
      u -= L;
      const a = Math.PI + u / r;
      return { x: cr.x + r * Math.cos(a), y: cr.y + r + r * Math.sin(a) };
    }
    shelfAt(cr, j) { return this.caroAt(cr, (j * CARO_PITCH - cr.pos) / this.cfg.cellSize); }
    // where shelf s is from the pick face, the shorter way round (m)
    ringDelta(cr, s) { const d = s * CARO_PITCH - cr.pos, R = cr.ring; return ((d % R) + R * 1.5) % R - R / 2; }
    ringDist(cr, s) { return Math.abs(this.ringDelta(cr, s)); }

    // stock leaves a location; a zone location running low is topped up from the reserve store later
    takeUnits(bin, qty) {
      const cp = bin.comps[0], p = this.inv.byGtin.get(cp.gtin), q = Math.min(qty, cp.qty);
      cp.qty -= q; p.onHand -= q;
      this.inv.recordPick(p, q);
      if (bin.zone !== 'AF' && cp.qty + cp.incoming <= bin.cap * 0.4) {
        const n = bin.cap - cp.qty - cp.incoming;
        cp.incoming += n; p.incoming += n;
        this.schedule(this.cfg.zoneRefill, () => { cp.incoming -= n; p.incoming -= n; cp.qty += n; p.onHand += n; });
      }
      return q;
    }
    lineDone(l, units) {
      if (l.done) return;
      l.done = true;
      this.kpi.onLinePicked(units);
    }

    // ---------------------------------------------------------------- RF shelving
    // A picker takes a batch of orders' RF lines, walks a route through the
    // shelving with a tote per order on the cart, and puts the totes on the
    // belt to the merge.
    dispatchRf() {
      const c = this.cfg;
      for (const pk of this.pickers) {
        if (pk.job || pk.away || !this.rfQueue.length) continue;
        const oldest = this.rfQueue[0].rf.t;
        if (this.rfQueue.length < c.rfBatch && this.time - oldest < c.rfBatchWait) return;
        const n = Math.min(c.rfBatch, this.rfQueue.length, this.oms.freeTotes.length);
        if (!n) return;
        const orders = this.rfQueue.splice(0, n), totes = [];
        for (const o of orders) {
          const t = this.oms.freeTotes.shift();
          Object.assign(t, { kind: 'rf', order: o, no: 0, lines: o.rf.lines, vol: o.rf.lines.reduce((s, l) => s + l.qty * this.inv.byGtin.get(l.gtin).vol, 0), zones: new Set(), done: new Set(), at: 'cart', route: o.route.id, units: 0, started: this.time, laps: 0 });
          o.rf.state = 'PICKING'; o.rf.tote = t; o.rf.picker = pk; totes.push(t);
          this.stats.rfTotes++;
        }
        const stops = [];
        for (const o of orders) for (const l of o.rf.lines) stops.push({ l, bin: l.bin, tote: o.rf.tote });
        pk.job = { orders, totes, stops: this.rfRoute(stops), k: 0, put: 0 };
        pk.state = 'WALKING'; pk.path = this.rfPath(pk, pk.job.stops[0]);
        this.log('pick', `${pk.name}: RF batch of ${orders.length} order${orders.length > 1 ? 's' : ''}, ${stops.length} lines`);
      }
    }
    // S-shape: aisles left to right, into the first from the front, out of the next at the back
    rfRoute(stops) {
      const aisles = [...new Set(stops.map((s) => s.bin.aisle))].sort((a, b) => a - b);
      return stops.sort((p, q) => {
        const ka = aisles.indexOf(p.bin.aisle), kb = aisles.indexOf(q.bin.aisle);
        if (ka !== kb) return ka - kb;
        return ka % 2 === 0 ? p.bin.bay - q.bin.bay : q.bin.bay - p.bin.bay;
      });
    }
    // where a picker stands for a location: in the aisle beside it
    rfSpot(bin) { const g = this.grid; return { x: g.RFX + 3 * bin.aisle + 1.5, y: g.RFY + 1.5 + bin.bay }; }
    // through the cross aisle at the front or the back of the shelving, whichever is shorter
    rfPath(pk, stop) {
      const g = this.grid, to = stop ? this.rfSpot(stop.bin) : this.rfDepot(), front = g.RFY + 0.5, back = g.RFY + g.bays + 1.5;
      if (stop && pk.y > front && Math.abs(pk.x - to.x) < 0.1) return [to];
      const cross = pk.y < front || !stop ? front : Math.abs(pk.y - front) + Math.abs(to.y - front) <= Math.abs(pk.y - back) + Math.abs(to.y - back) ? front : back;
      return [{ x: pk.x, y: cross }, { x: to.x, y: cross }, to];
    }
    stepPickers(dt) {
      const c = this.cfg;
      for (const pk of this.pickers) {
        pk.px = pk.x; pk.py = pk.y;
        const j = pk.job;
        if (pk.away && !j) { pk.state = 'BREAK'; pk.stateTime.BREAK += dt; continue; }
        if (pk.state === 'BREAK') pk.state = 'IDLE';
        if (j && pk.state === 'WALKING' && pk.walk(dt)) {
          if (j.k < j.stops.length) { pk.state = 'WORKING'; pk.t = c.rfLine; }
          else { pk.state = 'PUTTING'; pk.t = PUT; }
        } else if (j && pk.state === 'WORKING') {
          pk.t -= dt;
          if (pk.t <= 0) {
            const st = j.stops[j.k++], q = this.takeUnits(st.bin, st.l.qty);
            st.l.picked += q; st.tote.units += q; if (q < st.l.qty) { st.l.short = st.l.qty - q; this.stats.zoneShort++; }
            this.lineDone(st.l, q); this.rfPort.stats.lines++; this.rfPort.stats.units += q;
            pk.state = 'WALKING'; pk.path = this.rfPath(pk, j.stops[j.k]);
          }
        } else if (j && pk.state === 'PUTTING') {
          pk.t -= dt;
          if (pk.t <= 0 && this.belts.rf.hasRoom()) {
            const t = j.totes[j.put++];
            t.at = 'conveyor'; t.order.rf.state = 'CONVEYOR';
            this.belts.rf.put(t);
            pk.t = PUT;
            if (j.put >= j.totes.length) { pk.job = null; pk.state = 'IDLE'; pk.done++; this.rfPort.stats.presented++; }
          }
        }
        const s = pk.state === 'PUTTING' ? 'WORKING' : pk.state;
        pk.stateTime[s] += dt;
      }
      this.rfPort.busy = this.pickers.some((p) => p.job);
      if (this.rfPort.busy) this.rfPort.stats.busy += dt;
    }

    // ---------------------------------------------------------------- merge
    // Order totes off the loop wait at the merge, each in a lane of its
    // put-to-light rack, until all of the order's totes are in: its other
    // order totes and its RF tote. The merge operator tips the RF tote into
    // the order tote (or, when it does not fit, sends it along as one more
    // tote of the order), and the order's totes go on to the closing line
    // together.
    mergeTakes(t) { return this.merge.totes.length < this.cfg.mergeBuffer || this.merge.totes.some((x) => x.order === t.order); }
    intoMerge(t) {
      t.at = 'merge'; t.mergeAt = this.time; this.merge.totes.push(t);
      const lanes = this.merge.lanes; t.lane = lanes.indexOf(null); if (t.lane >= 0) lanes[t.lane] = t; // more than the rack holds wait beside it
      const o = t.order;
      if (o.totes.every((x) => x.at === 'merge') && o.totes.length === o.ntotes && o.status !== 'PICKED') { o.status = 'PICKED'; o.times.picked = this.time; }
      return true;
    }
    rfIn(t) { t.at = 'merge'; t.mergeAt = this.time; this.merge.rf.push(t); t.order.rf.state = 'MERGE'; return true; }
    orderReady(o) { return o.totes.length === o.ntotes && o.totes.every((x) => x.at === 'merge') && (!o.rf || o.rf.state === 'MERGE'); }
    stepMerge(dt) {
      const c = this.cfg, m = this.merge, port = this.mergePort;
      port.busy = false;
      if (!m.job && !port.away) {
        const t = m.totes.find((x) => !x.ready && this.orderReady(x.order));
        if (t) {
          const o = t.order, rf = o.rf ? o.rf.tote : null, last = o.totes[o.totes.length - 1];
          m.job = { o, rf, t: rf ? c.mergeTime : 0 };
          if (rf && last.vol + rf.vol <= c.toteVolume) m.job.into = last;
        }
      }
      if (m.job && !port.away) {
        const j = m.job;
        if (j.t > 0) { port.busy = true; port.stats.busy += dt; j.t -= dt; }
        if (j.t <= 0) {
          const o = j.o;
          if (j.rf) {
            m.rf.splice(m.rf.indexOf(j.rf), 1);
            if (j.into) {
              j.into.units += j.rf.units; j.into.vol += j.rf.vol; j.into.lines = j.into.lines.concat(j.rf.lines);
              this.recycle(j.rf); this.stats.merged++;
            } else { j.rf.kind = 'order'; j.rf.no = o.totes.length + 1; o.totes.push(j.rf); o.ntotes++; j.rf.at = 'merge'; m.totes.push(j.rf); }
            o.rf.state = 'DONE';
          }
          for (const t of o.totes) { t.ready = true; m.out.push(t); this.stats.mergeWait += this.time - t.mergeAt; this.stats.mergeN++; }
          port.stats.totes++; port.stats.presented++;
          m.job = null;
        }
      }
      // out onto the closing line, in turn
      while (m.out.length && this.belts.close[0].hasRoom()) {
        const t = m.out.shift();
        m.totes.splice(m.totes.indexOf(t), 1);
        if (t.lane >= 0 && m.lanes[t.lane] === t) m.lanes[t.lane] = null;
        t.at = 'conveyor'; t.lane = null;
        if (t.order.status === 'PICKED' || t.order.status === 'PICKING' || t.order.status === 'RELEASED') { t.order.status = 'PACKING'; }
        this.belts.close[0].put(t);
      }
    }
    // an emptied tote goes back to the de-stacker's stack
    recycle(t) {
      Object.assign(t, { kind: null, order: null, lines: null, at: 'recycle', belt: null, window: null, zones: null, done: null, ready: false, completion: null });
      this.recycling.push({ t, back: this.time + 60 });
    }

    // ---------------------------------------------------------------- closing line
    // Each machine works one tote at a time, with a fixed cycle; the tote
    // stops in it until it is done. A tote that fails the weight check goes
    // to the manual check beside the scale and comes back after it.
    atMachine(t, m, next) {
      if (m.down) return null;
      if (m.tote !== t) {
        if (m.tote) return null;
        m.tote = t; m.t = this.cfg[m.id + 'Time']; m.cycles++;
        return null;
      }
      if (m.t > 0) return null;
      m.tote = null;
      this.machineDone(t, m);
      return next();
    }
    machineDone(t, m) {
      const o = t.order;
      if (m.id === 'scale') { t.failed = !t.checked && this.rng() < this.cfg.weightErr; if (t.failed) { this.stats.weightFails++; this.log('warn', `${o.id} tote ${t.no}: weight off by more than the tolerance → manual check`); } }
      else if (m.id === 'docs') t.docsIn = t === o.totes[0];
      else if (m.id === 'lid') t.lid = true;
      else if (m.id === 'label') {
        t.sscc = WS.Barcode.makeSSCC(this.oms.sscc++);
        if (!o.sscc) o.sscc = t.sscc;
        this.stats.out++; this.kpi.presented++; this.kpi.push('presented');
      }
    }
    stepMachines(dt) {
      for (const m of this.machines) if (m.tote) { if (m.t > 0) { m.t -= dt; m.busy += dt; } }
      const q = this.checkStation;
      if (q.tote && !this.checkPort.away) { this.checkPort.busy = true; this.checkPort.stats.busy += dt; q.t -= dt; } else this.checkPort.busy = false;
      if (this.emptier.tote && this.emptier.t > 0) this.emptier.t -= dt;
    }
    atCheck(t) {
      const q = this.checkStation;
      if (!q.tote) { q.tote = t; q.t = this.cfg.checkTime; return null; }
      if (q.tote !== t || q.t > 0) return null;
      q.tote = null; t.failed = false; t.checked = true; q.done++; this.checkPort.stats.presented++;
      return this.belts.checkBack;
    }

    // ---------------------------------------------------------------- lanes and vans
    // The shipping sorter diverts each tote into its route's lane; at the end
    // of the lane totes are stacked for the van. A van leaves at its time
    // with what is in its lane, up to its capacity; the rest wait for the
    // next trip.
    intoLane(t, lane) {
      t.at = 'lane'; t.laneAt = this.time; lane.stack.push(t);
      const o = t.order;
      if (o.totes.every((x) => x.at === 'lane') && o.status !== 'PACKED') { o.status = 'PACKED'; o.times.packed = this.time; }
      return true;
    }
    stepVans() {
      const c = this.cfg;
      for (const route of this.routes) {
        if (this.time < route.next) continue;
        const lane = route.lane, n = Math.min(c.vanCapacity, lane.stack.length), load = lane.stack.splice(0, n), dep = route.next;
        route.trips++; route.totes += n; route.lastDep = this.time; this.stats.shipped += n;
        const orders = new Set();
        for (const t of load) { t.at = 'van'; t.order.shipped++; orders.add(t.order); }
        for (const o of orders) {
          if (o.shipped >= o.ntotes) {
            o.status = 'SHIPPED'; o.times.loaded = o.times.loaded || this.time; o.times.shipped = this.time; this.kpi.onShipped(o);
          } else { o.status = 'LOADED'; o.times.loaded = o.times.loaded || this.time; }
        }
        // orders due on this van that are not on it
        let missed = 0;
        for (const o of this.oms.orders) if (o.route === route && o.due === dep && o.status !== 'SHIPPED') { missed++; o.missed = true; o.due = this.departure(route, dep + 1); }
        route.missed += missed; this.stats.missed += missed;
        const van = { route, t: this.time, totes: n, missed, orders: orders.size };
        this.vanLog.push(van); if (this.vanLog.length > 60) this.vanLog.shift();
        this.log('ship', `Van ${route.name} left with ${n} tote${n === 1 ? '' : 's'} for ${orders.size} pharmac${orders.size === 1 ? 'y' : 'ies'}${missed ? ` · ${missed} order${missed > 1 ? 's' : ''} missed it` : ''}`);
        // the van brings these totes back empty after its trip
        this.vansOut.push({ route, back: this.time + c.vanTrip, totes: load });
        route.next = this.departure(route, this.time + 1);
      }
      while (this.vansOut.length && this.vansOut[0].back <= this.time) for (const t of this.vansOut.shift().totes) { t.at = 'dock'; t.order = null; this.returnDock.push(t); }
      while (this.recycling.length && this.recycling[0].back <= this.time) { const t = this.recycling.shift().t; t.at = 'stack'; this.oms.freeTotes.push(t); }
      // returned totes go onto the return conveyor one by one
      if (this.returnDock.length && this.belts.ret.hasRoom()) { const t = this.returnDock.shift(); t.at = 'conveyor'; t.kind = 'empty'; this.belts.ret.put(t); }
    }
    // the tote-emptying machine tips a returned tote and stacks it on the de-stacker
    atEmptier(t) {
      const e = this.emptier;
      if (!e.tote) { e.tote = t; e.t = this.cfg.emptyTime; return null; }
      if (e.tote !== t || e.t > 0) return null;
      e.tote = null; e.cycles++;
      Object.assign(t, { kind: null, order: null, lines: null, at: 'stack', zones: null, done: null, ready: false, completion: null, sscc: null });
      this.oms.freeTotes.push(t);
      return true;
    }

    // ---------------------------------------------------------------- disruptions (WS.Disruptions)
    // A breakdown jams one of the busiest A-frame channels: it dispenses
    // nothing until it has been freed, so its lines go short to completion.
    fault(until) {
      const free = this.channels.filter((ch) => !ch.jam);
      if (!free.length) return null;
      const ch = free.reduce((a, b) => (this.inv.byGtin.get(b.comps[0].gtin).hits > this.inv.byGtin.get(a.comps[0].gtin).hits ? b : a));
      ch.jam = { until };
      ch.jam.h = this.disrupt.note('breakdown', `${ch.code} jammed`, until);
      this.log('warn', `A-frame channel ${ch.code} jammed (${this.inv.byGtin.get(ch.comps[0].gtin).name}) · technician on the way`);
      return `Channel ${ch.code} jammed`;
    }
    unjam(ch) { ch.jam.h.t1 = this.time; ch.jam = null; this.log('robot', `A-frame channel ${ch.code} freed`); }
    clearFaults() { for (const ch of this.channels) if (ch.jam) this.unjam(ch); }
    faultAlerts(left) { return this.channels.filter((ch) => ch.jam).map((ch) => ({ sev: 'critical', key: 'jam' + ch.code, title: `Channel ${ch.code} jammed`, msg: `Its lines go short to completion · ${left(ch.jam.until)}` })); }
    checkFaults() { for (const ch of this.channels) if (ch.jam && this.time >= ch.jam.until) this.unjam(ch); }

    // ---------------------------------------------------------------- control room
    afFill(mix) { const low = this.channels.filter((ch) => ch.comps[0].qty <= this.cfg.refillLevel).length; return mix('#16324f', '#dc2626', Math.min(1, (low / Math.max(1, this.channels.length)) * 4)); }
    zoneFill(z, mix) { return z.port.away ? '#334155' : z.job ? '#14532d' : '#1f3a2c'; }
    machineFill(m) { return m.down ? '#7f1d1d' : m.tote ? '#4c1d95' : '#2b2440'; }
    // what an order tote on the conveyors is doing
    toteState(t) {
      if (t.at === 'merge') return 'merge';
      const b = t.belt;
      if (!b) return 'work';
      if (b.front === t && t.s >= b.len - 1e-6 && (t.window || (t.tipAt != null && this.time < t.tipAt + TIP) || this.zones.some((z) => z.in === b && z.job && z.job.tote === t) || this.machines.some((m) => m.tote === t) || this.checkStation.tote === t)) return 'work';
      return t.moving ? 'move' : 'queue';
    }
    get inSystem() { const out = []; for (const b of this.net.belts) if (b.kind !== 'return' && b.kind !== 'lane') out.push(...b.totes); out.push(...this.merge.totes, ...this.merge.rf); return out; }
    // The control room has no fleet: its time split and map show the order totes instead.
    get timeSplit() {
      return (this._split = this._split || {
        title: 'Tote time split', table: 'Zones',
        series: [{ k: 'work', label: 'Being picked or worked', slot: 's1' }, { k: 'queue', label: 'Queued on a conveyor', slot: 's2' }, { k: 'move', label: 'Moving', slot: 's3' }, { k: 'merge', label: 'At the merge', slot: 's4' }],
        sample: () => {
          const n = { work: 0, queue: 0, move: 0, merge: 0 }, all = this.inSystem;
          for (const t of all) n[this.toteState(t)]++;
          for (const k in n) n[k] /= all.length || 1;
          return n;
        },
      });
    }
    mapMarks(alpha) {
      return this.inSystem.map((t) => {
        const x = t.px != null ? t.px + (t.x - t.px) * alpha : t.x, y = t.py != null ? t.py + (t.y - t.py) * alpha : t.y;
        return { x: x - 0.5, y: y - 0.5, state: this.toteState(t) };
      });
    }
    extraAlerts() {
      const out = [], c = this.cfg, fill = this.loopFill();
      if (fill >= c.loopLimit) out.push({ sev: 'warning', key: 'loop', title: 'Loop full', msg: `${Math.round(fill * 100)}% full · order start holds` });
      const req = this.channels.filter((ch) => ch.req && !ch.req.op).length, empty = this.channels.filter((ch) => ch.comps[0].qty <= 0).length;
      if (req > this.refillers.length * 4 || empty) out.push({ sev: empty ? 'critical' : 'warning', key: 'refill', title: 'A-frame refills behind', msg: `${req} channel${req === 1 ? '' : 's'} waiting for a refill${empty ? ` · ${empty} empty` : ''}` });
      if (this.merge.totes.length >= c.mergeBuffer) out.push({ sev: 'warning', key: 'merge', title: 'Merge full', msg: `${this.merge.totes.length} order totes waiting · totes go round the loop again` });
      if (this.waiting.length > 60) out.push({ sev: this.waiting.length > 200 ? 'critical' : 'warning', key: 'backlog', title: 'Order backlog', msg: `${this.waiting.length} orders waiting for order start` });
      return out;
    }

    // ---------------------------------------------------------------- sound (js/render/sound.js)
    soundPos(p) { const z = p.zoneRef; if (z) return { x: z.pick.x, y: z.pick.y }; const c = p.cells[0]; return { x: c.x + 1, y: c.y + 1 }; }
    soundEvents(t0, t1) {
      const out = [];
      for (const e of this.ejects) if (e.t > t0 && e.t <= t1) out.push({ kind: 'beep', p: { x: e.ch.wx, y: e.ch.wy }, w: 0.35 });
      for (const e of this.tips) if (e.t > t0 && e.t <= t1) out.push({ kind: 'slide', p: { x: this.grid.tipX, y: this.grid.AY }, w: 0.9 });
      return out;
    }

    // ---------------------------------------------------------------- dispatch & tick
    dispatch() { this.dispatchRefills(); this.dispatchRf(); }
    tick() {
      super.tick();
      const dt = this.cfg.tick;
      this.checkFaults();
      this.orderStart(dt);
      this.stepAframe(dt);
      this.net.update(dt);
      this.stepZones(dt);
      this.stepMerge(dt);
      this.stepMachines(dt);
      this.stepVans();
      this.stepRefillers(dt);
      this.stepCuby();
      this.stepPickers(dt);
      this.updateStatuses();
    }
    // an order's status follows its totes
    updateStatuses() {
      if (this.ticks % 10) return;
      for (const o of this.oms.orders) if (o.status === 'RELEASED' && o.totes.some((t) => t.belt && t.belt.kind === 'loop')) { o.status = 'PICKING'; o.times.firstPick = o.times.firstPick || this.time; }
    }
  }

  WS.ZoneSim = ZoneSim;
  WS.ZoneFloor = ZoneFloor;
  WS.ZONE_MAP = M;
  WS.ZONE_CHANNEL_PITCH = CHANNEL_PITCH;
  WS.ZONE_CARO_PITCH = CARO_PITCH;
})((globalThis.WS = globalThis.WS || {}));
