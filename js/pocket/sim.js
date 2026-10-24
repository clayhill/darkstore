/* PocketFlow: fashion e-commerce through an overhead pocket sorter
 * (specs/pocket.txt). Every item travels alone in a pocket hanging from a
 * friction-driven rail (WS.BeltNet: the pockets are its "totes").
 *
 *  loading     Pickers pick order lines from shelving into totes that come
 *              to the loading stations; returned items that pass inspection
 *              come to the returns station. An operator scans each item and
 *              puts it into the empty pocket in front of them.
 *  storage     The main loop takes the pocket to a storage rail. A storage
 *              rail is first in, first out: pockets are put where they will
 *              least be in the way, behind pockets of older orders.
 *  returns     A returned item waits in its pocket as stock. A new order for
 *              that article takes it instead of having it picked; one that
 *              waits too long goes back to the shelving.
 *  sequencing  Once every item of an order is in storage, the order can go
 *              into a batch. A batch's pockets leave their storage rails (a
 *              pocket in front of one is sent round again) for the
 *              sequencer: two banks of N lines, a two-pass radix sort.
 *              Pass 1 sorts a pocket into line (seq mod N) of bank A; the
 *              lines are then emptied in order, line by line, and pass 2
 *              sorts into line floor(seq / N) of bank B; emptied in order
 *              again, the pockets leave in exact order: up to N² of them.
 *  packing     The sequenced pockets go down to one pack station and open
 *              over the table one after the other; the packer packs each
 *              order as its last item arrives. The empty pockets ride back
 *              to the empty-pocket buffer and on to the loading stations.
 * Positions are metres: x east, y south. There are no robots; the shared
 * stock and order flow are not used. */
(function (WS) {
  'use strict';
  const TERMS = {
    unit: 'pocket', Unit: 'Pocket', units: 'pockets', Units: 'Pockets', store: 'pocket buffer', Store: 'Pocket buffer', port: 'station', ports: 'stations', starve: 'pockets', flow1: 'Items into pockets /h', flow2: 'Items packed /h', surge: 'Order surge',
    fault: { button: 'Stop the rail', title: 'A drive fault stops the whole rail: every pocket stands still until a technician has fixed it', note: 'The control room lists what is going on and the throughput chart marks it. With the rail stopped no pocket moves: loading and packing stop as soon as the pockets in front of them are used up.' },
  };
  const CATS = [
    ['T-shirt', 9, 0], ['Shirt', 6, 0], ['Blouse', 5, 1], ['Jeans', 8, 0], ['Chinos', 4, 0], ['Dress', 7, 1], ['Skirt', 4, 0], ['Jumper', 6, 0], ['Hoodie', 5, 0], ['Cardigan', 3, 0],
    ['Jacket', 4, 1], ['Coat', 3, 1], ['Trousers', 4, 1], ['Shorts', 3, 0], ['Leggings', 3, 0], ['Sneakers', 4, 0], ['Scarf', 2, 0], ['Socks 3-pack', 4, 0], ['Belt', 2, 0], ['Cap', 2, 0],
  ]; // name, weight, hangs on a hanger (1) or rides in a pouch (0)
  const COLOURS = [['navy', '#1e3a8a'], ['black', '#111827'], ['white', '#f1f5f9'], ['grey', '#6b7280'], ['beige', '#d6c6a5'], ['olive', '#5b6b2f'], ['burgundy', '#7f1d3a'], ['denim', '#3b5b8c'], ['camel', '#b07c46'], ['pink', '#f0a3b8'], ['red', '#b91c1c'], ['sage', '#8fa98b']];
  const SIZES = [['XS', 1], ['S', 3], ['M', 5], ['L', 4], ['XL', 2]];
  const LINES = ['Essential', 'Relaxed', 'Linen', 'Organic', 'Slim', 'Wide', 'Cropped', 'Oversized', 'Ribbed', 'Merino', 'Utility', 'Classic', 'Washed', 'Pleated', 'Soft', 'Heavy'];
  const FIRST = ['Sofie', 'Lucas', 'Emma', 'Noah', 'Louise', 'Arthur', 'Olivia', 'Jules', 'Mila', 'Liam', 'Elena', 'Adam', 'Nora', 'Victor', 'Lena', 'Finn', 'Marie', 'Thomas', 'Julie', 'Samir', 'Ines', 'Pieter', 'Yasmine', 'Wout', 'Hanne'];
  const CITIES = [['1000', 'Brussels'], ['2000', 'Antwerpen'], ['9000', 'Gent'], ['3000', 'Leuven'], ['4000', 'Liège'], ['8000', 'Brugge'], ['5000', 'Namur'], ['2800', 'Mechelen'], ['1012', 'Amsterdam'], ['3011', 'Rotterdam'], ['59000', 'Lille'], ['50667', 'Köln']];
  const OPS = ['Ana', 'Ben', 'Chloé', 'Daan', 'Eva', 'Femke', 'Gilles', 'Hanna', 'Ilse', 'Jonas', 'Kato', 'Lars', 'Mats', 'Nina'];
  const POCKET = { EMPTY: 'Empty', STOCK: 'Return in stock', WAIT: 'Order incomplete', READY: 'Order ready', SEQ: 'Sequencing', PACK: 'To packing', RESTOCK: 'Back to the shelving' };

  // ---------------------------------------------------------------- geometry
  function geometry(c) {
    const S = c.storageLanes, N = c.seqLines, LX0 = 9, sx = (l) => LX0 + l, ax = (i) => LX0 + S + 1.5 + i, bx = (i) => LX0 + S + 1.5 + N + 1 + i;
    const XE = bx(N - 1) + 2, yT = 4, yB = yT + c.laneLength + 1, XW = 6, nLoad = c.loadStations + 1;
    const loadY = Array.from({ length: nLoad }, (_, k) => yT + 3 + k * 3), yF = yB + 5, packX = Array.from({ length: c.packingStations + 1 }, (_, k) => XE - 4 - k * 6);
    return { S, N, sx, ax, bx, XE, XW, yT, yB, yF, loadY, packX, unloadY: yF + 3.2, yR: yF + 6, distX: 1, loadX: 3.2, bufX0: -11, cols: 7, W: XE + 4, D: yF + 9, X0: -12 };
  }

  // ---------------------------------------------------------------- the control room's map
  class PocketMap extends WS.RobotFloor {
    constructor(sim, G) { super(Math.ceil(G.W - G.X0), Math.ceil(G.D), WS.CELL.BLOCKED); Object.assign(this, { sim, G }); this.rail = new Uint8Array(this.W * this.D); }
    cell(x, y) { const i = Math.floor(x - this.G.X0), j = Math.floor(y); return i >= 0 && j >= 0 && i < this.W && j < this.D ? this.idx(i, j) : -1; }
    // the rails, drawn cell by cell along every belt (1 rail, 2 storage, 3 sequencer, 4 empty pockets)
    paint(net) {
      for (const b of net.belts) {
        const k = b.kind === 'lane' ? 2 : b.kind === 'seqA' || b.kind === 'seqB' ? 3 : b.kind === 'buffer' || b.kind === 'return' || b.kind === 'dist' ? 4 : 1;
        for (let s = 0; s <= b.len; s += 0.5) { const q = b.at(s), i = this.cell(q.x, q.y); if (i >= 0 && this.rail[i] < 2) this.rail[i] = k; }
      }
    }
    passable() { return false; }
    depthOf() { return 1; }
    mapFill(i, mix) {
      const r = this.rail[i];
      return r === 2 ? '#1c3b5e' : r === 3 ? '#4a2a5e' : r === 4 ? '#263244' : r === 1 ? '#2a3b52' : '#070b12';
    }
    get mapTitle() { return 'RAILS · storage blue, sequencer purple · dots: pockets, coloured as in Pockets'; }
  }

  // ---------------------------------------------------------------- stations
  // Loading (picked items or returns), packing and restocking: the shared
  // views show a station as working while it has something in hand.
  class Station extends WS.Port {
    constructor(sim, idx, def) {
      super(sim, idx, def);
      Object.assign(this, { role: def.role, k: def.k, t: 0, cur: null, released: null, done: 0, queue: [], table: [], op: OPS[idx % OPS.length] });
      const n = def.k + 1;
      this.name = { load: 'Loading ' + n, returns: 'Returns loading', pack: 'Pack ' + n, restock: 'Restock' }[def.role];
      this.code = { load: 'L' + n, returns: 'R1', pack: 'P' + n, restock: 'S1' }[def.role];
    }
    get job() { return this.cur || this.t > 0 ? { lines: [null], next: 0, t: 0, total: 1 } : null; }
    set job(v) {}
    update(dt) {
      const st = this.stats;
      st.t += dt;
      if (this.away) { st.away = (st.away || 0) + dt; return; } // the operator is on a break (WS.Disruptions)
      if (this.t > 0) { st.busy += dt; this.t -= dt; if (this.t <= 0) this.sim.stationDone(this); }
      else { st.starved += dt; this.sim.stationStart(this); }
      const busy = this.t > 0 || this.packing ? 1 : 0, f = Math.exp(-dt / 900);
      this.busyNow = (this.busyNow || 0) * f + busy * (1 - f);
    }
  }

  // ---------------------------------------------------------------- simulation
  class PocketSim extends WS.Sim {
    get kind() { return 'pocket'; }
    get terms() { return TERMS; }
    get armsAllowed() { return false; }
    defaults() { return WS.POCKET_CONFIG; }
    createGrid() {
      const c = this.cfg, G = (this.G = geometry(c)), m = (this.map = new PocketMap(this, G));
      // stations as ports for the shared views: loading, returns, packing, restocking
      const cells = (x, y) => [{ x: Math.floor(x - G.X0) - 1, y: Math.floor(y) }, { x: Math.floor(x - G.X0), y: Math.floor(y) }, { x: Math.floor(x - G.X0), y: Math.floor(y) + 1 }];
      G.loadY.forEach((y, k) => m.ports.push({ kind: 'LOAD', role: k < c.loadStations ? 'load' : 'returns', k: k < c.loadStations ? k : 0, face: 'front', drop: { x: G.loadX, y }, lift: { x: G.loadX, y }, cells: cells(G.loadX, y) }));
      G.packX.forEach((x, k) => m.ports.push({ kind: 'PACK', role: k < c.packingStations ? 'pack' : 'restock', k: k < c.packingStations ? k : 0, face: 'front', drop: { x, y: G.unloadY }, lift: { x, y: G.unloadY }, cells: cells(x, G.unloadY) }));
      return m;
    }
    createPort(k, def) { return new Station(this, k, def); }
    describe() { const c = this.cfg; return `Pocket sorter online · ${c.pockets} pockets · ${c.storageLanes} storage rails · a ${c.seqLines} × ${c.seqLines} sequencer · ${c.loadStations} loading stations and returns · ${c.packingStations} pack stations`; }
    storageCapacity() { return this.lanes.length * this.laneCap; }
    fetchCost() { return 0; }
    clock(t = this.time) { return t + this.cfg.dayStart; }
    get loaders() { return this.ports.filter((p) => p.role === 'load' || p.role === 'returns'); }
    get packers() { return this.ports.filter((p) => p.role === 'pack'); }
    get restock() { return this.ports.find((p) => p.role === 'restock'); }
    breakTargets() { return this.ports; }

    seed() {
      const c = this.cfg, rng = this.rng;
      this.stats = { orders: 0, shipped: 0, items: 0, fromReturns: 0, pickSaved: 0, picked: 0, returned: 0, rework: 0, loaded: 0, recirc: 0, restocked: 0, batches: 0, cycle: [], packed: [] };
      this.catalogue(); this.buildRails();
      this.orders = []; this.open = []; this.ready = []; this.orderSeq = 1; this.itemSeq = 1; this.batchSeq = 1; this.byId = new Map();
      this.pickQueue = []; this.pickAcc = 0; this.openTote = null; this.totes = []; this.toteSeq = 1;
      this.returnsQ = []; this.inspect = null; this.returnTote = null;
      this.batches = []; this.parcels = [];
      this.orderGap = undefined; this.orderAcc = 0; this.returnGap = undefined; this.returnAcc = 0;
      this.timers = 0; this.railFault = null;
      // the pockets: a few hundred returns from yesterday wait in storage; the rest are empty, in the buffer
      this.pocketList = [];
      const nStock = Math.min(Math.round(c.pockets * 0.25), Math.min(c.stockLanes, this.lanes.length) * (this.laneCap - 10));
      for (let k = 0; k < c.pockets; k++) this.pocketList.push({ id: k, code: 'PK' + String(k + 1).padStart(4, '0'), item: null, state: 'EMPTY', rank: Infinity, x: 0, y: 0, dx: 1, dy: 0 });
      let k = 0;
      for (; k < nStock; k++) {
        const p = this.pocketList[k], lane = this.lanes[k % Math.min(c.stockLanes, this.lanes.length)];
        p.item = this.newItem(this.drawSku(), null, 'return'); p.item.pocket = p; p.state = 'STOCK'; p.since = -3600 * (1 + rng() * 10);
        lane.put(p, Math.max(0, lane.len - lane.totes.length * this.net.pitch));
      }
      for (const L of this.lanes) L.totes.sort((a, b) => b.s - a.s);
      // the empty ones fill the loading spurs, the distribution line and the buffer from its far end back
      const fill = (b, n) => { for (let j = 0; j < n && k < c.pockets; j++, k++) b.put(this.pocketList[k], Math.max(0, b.len - b.totes.length * this.net.pitch)); };
      for (const sp of this.loadSpurs) fill(sp, Math.floor(sp.len / this.net.pitch) - 1);
      for (let j = this.dist.length - 1; j >= 0; j--) fill(this.dist[j], Math.floor(this.dist[j].len / this.net.pitch) - 1);
      fill(this.buffer, Math.floor(this.buffer.len / this.net.pitch));
      for (let j = this.ret.length - 1; j >= 0 && k < c.pockets; j--) fill(this.ret[j], Math.floor(this.ret[j].len / this.net.pitch) - 1);
      for (const b of this.net.belts) b.totes.sort((p, q) => q.s - p.s);
      this.pocketList.length = k; this.nPockets = k; // as many as there is room for
      this.log('system', `Morning: ${nStock} returned items from yesterday wait in pockets, ${k - nStock} pockets empty`);
    }

    // ---------------------------------------------------------------- catalogue
    // Styles in a few colours and sizes; demand falls off with the style's rank.
    catalogue() {
      const c = this.cfg, rng = this.rng, tot = CATS.reduce((s, x) => s + x[1], 0);
      this.styles = []; this.skus = []; this.skuById = new Map();
      for (let s = 0; s < c.styles; s++) {
        const cat = CATS[rng.weighted(CATS.map((x) => x[1]), tot)], line = LINES[Math.floor(rng() * LINES.length)], nc = 1 + Math.floor(rng() * 3), cols = [];
        while (cols.length < nc) { const col = COLOURS[Math.floor(rng() * COLOURS.length)]; if (!cols.includes(col)) cols.push(col); }
        const st = { id: s, name: `${line} ${cat[0].toLowerCase()}`, cat: cat[0], hang: !!cat[2], demand: 1 / Math.pow(s + 1, 0.85), skus: [] };
        for (const col of cols) for (const [size, w] of cat[0].includes('3-pack') || cat[0] === 'Belt' || cat[0] === 'Cap' || cat[0] === 'Scarf' ? [['one size', 5]] : SIZES) {
          const id = this.skus.length, sku = { id, style: st, colour: col[0], hex: col[1], size, w, gtin: WS.Barcode.makeGTIN13(40000 + id), name: `${st.name}, ${col[0]}${size === 'one size' ? '' : ', ' + size}` };
          this.skus.push(sku); st.skus.push(sku); this.skuById.set(sku.gtin, sku);
        }
        this.styles.push(st);
      }
      this.styleW = this.styles.map((s) => s.demand); this.styleT = this.styleW.reduce((a, b) => a + b, 0);
    }
    drawSku() {
      const st = this.styles[this.rng.weighted(this.styleW, this.styleT)], ws = st.skus.map((s) => s.w);
      return st.skus[this.rng.weighted(ws, ws.reduce((a, b) => a + b, 0))];
    }
    newItem(sku, order, src) { return { id: this.itemSeq++, sku, order, src, pocket: null, at: src === 'return' ? 'returns' : 'shelving' }; }

    // ---------------------------------------------------------------- the rails
    // Belts: the loading spurs off the distribution line, the west rail up
    // past the loading stations, the top rail east past the exits of the
    // storage rails and sequencer lines, down the east side, the bottom
    // rail west past their entries; off the east side the feeder to the
    // pack stations, from them the return rail and the empty-pocket buffer
    // winding to and fro along the west wall.
    buildRails() {
      const c = this.cfg, G = this.G, net = (this.net = new WS.BeltNet(this, c.railSpeed, c.pocketPitch)), B = (name, pts, o) => net.belt(name, pts, o);
      net.strict = true; net.fast = true;
      const lanesX = [];
      for (let l = 0; l < G.S; l++) lanesX.push({ x: G.sx(l), kind: 'lane', i: l });
      for (let i = 0; i < G.N; i++) lanesX.push({ x: G.ax(i), kind: 'seqA', i });
      for (let i = 0; i < G.N; i++) lanesX.push({ x: G.bx(i), kind: 'seqB', i });
      this.lanes = []; this.seqA = []; this.seqB = [];
      // west rail north past the loading merges, top rail east past the line exits
      const ys = G.loadY.slice().sort((a, b) => b - a), west = [];
      let y0 = G.yB;
      for (const y of [...ys, G.yT]) { west.push(B('West rail', [{ x: G.XW, y: y0 }, { x: G.XW, y }], { kind: 'rail' })); y0 = y; }
      const top = [];
      let x0 = G.XW;
      for (const L of [...lanesX, { x: G.XE }]) { top.push(B('Top rail', [{ x: x0, y: G.yT }, { x: L.x, y: G.yT }], { kind: 'rail' })); x0 = L.x; }
      const east = B('East rail', [{ x: G.XE, y: G.yT }, { x: G.XE, y: G.yB }], { kind: 'rail' });
      const bottom = [];
      x0 = G.XE;
      const rev = lanesX.slice().reverse();
      for (const L of rev) { bottom.push(B('Bottom rail', [{ x: x0, y: G.yB }, { x: L.x, y: G.yB }], { kind: 'rail' })); x0 = L.x; }
      bottom.push(B('Bottom rail', [{ x: x0, y: G.yB }, { x: G.XW, y: G.yB }], { kind: 'rail' }));
      // the lines between them, north from the bottom rail to the top
      const line = {};
      lanesX.forEach((L, j) => {
        const b = B(L.kind === 'lane' ? `Storage rail ${L.i + 1}` : `Sequencer ${L.kind === 'seqA' ? 'A' : 'B'}${L.i + 1}`, [{ x: L.x, y: G.yB }, { x: L.x, y: G.yT }], { kind: L.kind });
        b.i = L.i; b.j = j; line[j] = b;
        (L.kind === 'lane' ? this.lanes : L.kind === 'seqA' ? this.seqA : this.seqB).push(b);
        b.exit = (t) => this.lineExit(t, b) && top[j + 1];
        net.link(top[j], top[j + 1]); net.link(b, top[j + 1]);
      });
      this.laneCap = Math.floor(this.lanes[0].len / c.pocketPitch);
      west.forEach((b, k) => (b.exit = () => (k + 1 < west.length ? west[k + 1] : top[0])));
      for (let k = 0; k + 1 < west.length; k++) net.link(west[k], west[k + 1]);
      net.link(west[west.length - 1], top[0]);
      top.forEach((b, k) => { if (k + 1 < top.length) b.exit = () => top[k + 1]; });
      top[top.length - 1].exit = () => east; net.link(top[top.length - 1], east);
      // the bottom rail: at each line's entry a pocket for it turns in
      bottom.forEach((b, k) => {
        const L = rev[k], next = k + 1 < bottom.length ? bottom[k + 1] : west[0];
        if (L) { const ln = line[lanesX.indexOf(L)]; b.exit = (t) => (this.wants(t, ln) ? ln : next); net.link(b, ln); }
        else b.exit = () => next;
        net.link(b, next);
      });
      net.link(east, bottom[0]);
      // the feeder: off the east rail, south, then west over the pack stations
      const feeder = [], fx = G.packX;
      let fx0 = G.XE, first = true;
      for (const x of fx) { feeder.push(B('Pack feeder', first ? [{ x: G.XE, y: G.yB }, { x: G.XE, y: G.yF }, { x, y: G.yF }] : [{ x: fx0, y: G.yF }, { x, y: G.yF }], { kind: 'rail' })); fx0 = x; first = false; }
      east.exit = (t) => (t.dest && (t.dest.k === 'pack' || t.dest.k === 'restock') ? feeder[0] : bottom[0]);
      net.link(east, feeder[0]);
      // spurs down to the pack stations and the restock station, out to the return rail
      this.packSpurs = []; this.packOuts = [];
      const ret = (this.ret = []);
      let rx0 = fx[0];
      fx.forEach((x, k) => { const xb = k + 1 < fx.length ? fx[k + 1] : G.bufX0; ret.push(B('Return rail', [{ x: rx0, y: G.yR }, { x: xb, y: G.yR }], { kind: 'return' })); rx0 = xb; });
      fx.forEach((x, k) => {
        const port = this.ports.find((p) => p.kind === 'PACK' && p.drop.x === x);
        // the spur winds to and fro over the station: a buffer for a whole sequenced batch
        const y = (d) => G.yF + d, sp = B(`${port.name} spur`, [{ x, y: G.yF }, { x, y: y(0.5) }, { x: x + 2.4, y: y(0.5) }, { x: x + 2.4, y: y(1.0) }, { x: x - 2.4, y: y(1.0) }, { x: x - 2.4, y: y(1.5) }, { x: x + 2.4, y: y(1.5) }, { x: x + 2.4, y: y(2.0) }, { x: x - 2.4, y: y(2.0) }, { x: x - 2.4, y: y(2.5) }, { x, y: y(2.5) }, { x, y: G.unloadY }], { kind: 'spur' });
        const out = B(`${port.name} out`, [{ x, y: G.unloadY }, { x, y: G.yR }], { kind: 'return' });
        sp.port = port; port.spur = sp; port.out = out; this.packSpurs.push(sp); this.packOuts.push(out);
        sp.exit = (t) => (port.released === t ? out : null);
        out.exit = () => ret[k];
        net.link(out, ret[k]);
        feeder[k].exit = (t) => (t.dest && t.dest.port === port ? sp : k + 1 < feeder.length ? feeder[k + 1] : null);
        net.link(feeder[k], sp); if (k + 1 < feeder.length) net.link(feeder[k], feeder[k + 1]);
      });
      // the empty-pocket buffer: to and fro along the west wall, then the distribution line past the loading spurs
      const bp = [{ x: G.bufX0, y: G.yR }];
      for (let cI = 0; cI < G.cols; cI++) { const x = G.bufX0 + cI * 1.2, up = cI % 2 === 0; if (cI) bp.push({ x, y: up ? G.yR - 1 : 6 }); bp.push({ x, y: up ? 6 : G.yR - 1 }); }
      const bx = G.bufX0 + (G.cols - 1) * 1.2;
      this.buffer = B('Empty-pocket buffer', bp, { kind: 'buffer' });
      ret.forEach((b, k) => { b.exit = () => (k + 1 < ret.length ? ret[k + 1] : this.buffer); net.link(b, k + 1 < ret.length ? ret[k + 1] : this.buffer); });
      const dist = (this.dist = []), ly = G.loadY;
      let dy0 = G.yT;
      ly.forEach((y, k) => { dist.push(B('Distribution', k ? [{ x: G.distX, y: dy0 }, { x: G.distX, y }] : [{ x: bx, y: 6 }, { x: bx, y: G.yT }, { x: G.distX, y: G.yT }, { x: G.distX, y }], { kind: 'dist' })); dy0 = y; });
      this.buffer.exit = () => dist[0]; net.link(this.buffer, dist[0]);
      this.loadSpurs = []; this.loadOuts = [];
      ly.forEach((y, k) => {
        const port = this.ports.find((p) => p.kind === 'LOAD' && p.drop.y === y);
        const sp = B(`${port.name} spur`, [{ x: G.distX, y }, { x: G.loadX, y }], { kind: 'load' }), out = B(`${port.name} out`, [{ x: G.loadX, y }, { x: G.XW, y }], { kind: 'rail' });
        sp.port = port; port.spur = sp; port.out = out; this.loadSpurs.push(sp); this.loadOuts.push(out);
        sp.exit = (t) => (port.released === t ? out : null);
        // the loading station merges onto the west rail where its segment starts
        const wk = ys.indexOf(y) + 1, wb = west[wk] || top[0];
        out.exit = () => wb; net.link(out, wb);
        // a spur takes a few empty pockets and leaves the rest for the stations further on, unless the line beyond is full
        dist[k].exit = () => {
          const next = k + 1 < dist.length ? dist[k + 1] : null, room = sp.hasRoom() && sp.totes.length < this.spurCap(sp);
          return room && (sp.totes.length < 4 || !next || !next.hasRoom()) ? sp : next;
        };
        net.link(dist[k], sp); if (k + 1 < dist.length) net.link(dist[k], dist[k + 1]);
      });
      this.rails = { west, top, east, bottom, feeder };
      this.map.paint(net);
    }
    spurCap(sp) { return Math.max(2, Math.floor(sp.len / this.cfg.pocketPitch) - 1); }

    // ---------------------------------------------------------------- routing
    // whether pocket t, on the bottom rail at line ln's entry, turns in
    wants(t, ln) {
      const d = t.dest;
      if (!d) return false;
      let yes = false;
      if (d.k === 'store') {
        if (ln.kind !== 'lane' || d.lane !== ln.i) return false;
        if (ln.totes.length < this.laneCap && ln.hasRoom()) yes = true; else { d.lane = this.chooseLane(t, ln.i); return false; }
      } else yes = (d.k === 'A' && ln.kind === 'seqA' && ln.i === d.line) || (d.k === 'B' && ln.kind === 'seqB' && ln.i === d.line);
      if (yes) t.leaving = null;
      return yes;
    }
    // The storage rail for a pocket. A return waiting for an order goes on
    // the stock rails (the emptiest, so the oldest come to the front). An
    // order's pocket goes behind pockets of older orders, so
    // that it is in nobody's way when its turn comes (the newest older
    // order at the back wins); without one, the emptiest rail. Only rails
    // further along the bottom rail (west of `before`) once it has passed some.
    chooseLane(t, before = Infinity, any = false) {
      let best = null, bestRank = -Infinity, empty = null;
      const stock = t.state === 'STOCK', nS = Math.min(this.cfg.stockLanes, this.lanes.length - 1);
      for (const L of this.lanes) {
        if (L.i >= before || (!any && (L.i < nS) !== stock)) continue; // returns waiting for an order on the stock rails, the rest on the others
        const n = L.totes.length + (L.coming || 0);
        if (n >= this.laneCap - 1) continue;
        const tail = L.tail ?? -Infinity;
        if (!stock && !any && tail <= t.rank && tail > bestRank) { best = L; bestRank = tail; }
        if (!empty || n < empty.totes.length + (empty.coming || 0)) empty = L;
      }
      const L = best || empty;
      // with its own rails full, a pocket goes on the emptiest other one
      if (!L) return any ? -1 : this.chooseLane(t, before, true);
      L.tail = Math.max(L.tail ?? -Infinity, t.rank === Infinity ? 1e12 : t.rank);
      return L.i;
    }
    // A storage rail or a sequencer line lets its front pocket go?
    lineExit(t, b) {
      if (this.railFault) return false;
      if (t.leaving === b) return true; // decided already, waiting to merge
      if (b.kind === 'lane') {
        const B0 = this.batchA;
        if (t.batch && t.batch === B0 && B0.phase === 'A1') { t.dest = { k: 'A', line: t.seq % this.G.N }; t.leaving = b; return true; }
        // a pocket in front of one the batch needs goes round again
        if (B0 && B0.phase === 'A1' && b.totes.some((p) => p.batch === B0)) {
          const lane = this.chooseLane(t);
          if (lane < 0) return false;
          t.dest = { k: 'store', lane }; t.leaving = b; this.stats.recirc++; t.recirc = (t.recirc || 0) + 1; this.stats[b.i < this.cfg.stockLanes ? 'recircS' : 'recircO'] = (this.stats[b.i < this.cfg.stockLanes ? 'recircS' : 'recircO'] || 0) + 1;
          return true;
        }
        // A stock rail is dug out in one sweep once it holds digTaken returns that orders have taken,
        // or one has waited digWait: the pockets in front go round to the stock rails again, the
        // taken ones on to the order rails. One sweep for several is far fewer moves than one each.
        if (b.i < this.cfg.stockLanes && this.digging(b)) {
          const lane = this.chooseLane(t);
          if (lane < 0) return false;
          t.dest = { k: 'store', lane }; t.leaving = b;
          if (!t.item.order) { this.stats.recirc++; t.recirc = (t.recirc || 0) + 1; this.stats.recircD = (this.stats.recircD || 0) + 1; }
          return true;
        }
        // a return that waited too long goes back to the shelving
        if (t.state === 'STOCK' && !t.item.order && this.time - t.since > this.cfg.stockAge * 3600 && this.inFlight(this.restock) < this.spurCap(this.restock.spur)) { t.dest = { k: 'restock', port: this.restock }; t.state = 'RESTOCK'; t.leaving = b; return true; }
        return false;
      }
      const bt = b.kind === 'seqA' ? this.batchA : this.batchB;
      if (!bt || t.batch !== bt) return false;
      if (b.kind === 'seqA') { if (bt.phase !== 'A2' || bt.cur !== b.i) return false; t.dest = { k: 'B', line: Math.floor(t.seq / this.G.N) }; t.leaving = b; return true; }
      if (bt.phase !== 'B2' || bt.cur !== b.i || this.inFlight(bt.port) >= this.spurCap(bt.port.spur)) return false;
      t.dest = { k: 'pack', port: bt.port }; t.state = 'PACK'; t.leaving = b;
      return true;
    }
    digging(b) {
      const taken = b.totes.filter((p) => p.item && p.item.order);
      if (!taken.length) return (b.dig = false);
      if (!b.dig && (taken.length >= this.cfg.digTaken || taken.some((p) => this.time - (p.item.allocAt ?? this.time) > this.cfg.digWait))) b.dig = true;
      return b.dig;
    }
    // pockets on their way to a station or queued at it
    // (counted once a tick for all stations)
    inFlight(port) {
      if (this.flightAt !== this.ticks) {
        this.flightAt = this.ticks; this.flight = new Map();
        for (const p of this.pocketList) if (p.dest && p.dest.port && p.belt && p.belt !== p.dest.port.spur && p.belt.kind !== 'return') this.flight.set(p.dest.port, (this.flight.get(p.dest.port) || 0) + 1);
      }
      return port.spur.totes.length + (this.flight.get(port) || 0);
    }

    // ---------------------------------------------------------------- orders
    // An order takes a returned item of its article if one waits in a
    // pocket; the rest is picked.
    newOrder(nItems) {
      const c = this.cfg, rng = this.rng, no = this.orderSeq++, city = CITIES[Math.floor(rng() * CITIES.length)];
      const o = { id: 'WEB-' + (500000 + no), no, status: 'OPEN', created: this.time, customer: `${FIRST[Math.floor(rng() * FIRST.length)]} ${'ABCDEFGHJKLMNPRSTVWZ'[Math.floor(rng() * 20)]}.`, city: city[1], postcode: city[0], items: [] };
      if (!nItems) { const w = c.itemsPerOrder, r = rng(); let acc = 0; nItems = w.length; for (let k = 0; k < w.length; k++) { acc += w[k]; if (r < acc) { nItems = k + 1; break; } } }
      for (let k = 0; k < nItems; k++) {
        const sku = this.drawSku(), stock = this.pocketList.find((p) => p.state === 'STOCK' && !p.item.order && p.item.sku === sku);
        if (stock) { const it = stock.item; it.order = o; it.allocAt = this.time; o.items.push(it); stock.state = 'WAIT'; stock.rank = no; this.stats.fromReturns++; it.fromStock = true; }
        else { const it = this.newItem(sku, o, 'pick'); o.items.push(it); this.pickQueue.push(it); }
      }
      this.orders.push(o); this.open.push(o); this.byId.set(o.id, o); this.stats.orders++;
      if (this.orders.length > 2000) { const k = this.orders.findIndex((x) => x.status === 'SHIPPED'); if (k >= 0) this.byId.delete(this.orders.splice(k, 1)[0].id); }
      return o;
    }
    arrivals(dt) {
      const c = this.cfg, rate = (c.orderRate * this.disrupt.rateFactor) / 3600, rr = c.returnRate / 3600;
      if (rate > 0) {
        this.orderAcc += dt;
        if (this.orderGap === undefined) this.orderGap = -Math.log(1 - this.rng()) / rate;
        while (this.orderAcc >= this.orderGap) { this.orderAcc -= this.orderGap; this.orderGap = -Math.log(1 - this.rng()) / rate; this.newOrder(); }
      }
      if (rr > 0) {
        this.returnAcc += dt;
        if (this.returnGap === undefined) this.returnGap = -Math.log(1 - this.rng()) / rr;
        while (this.returnAcc >= this.returnGap) { this.returnAcc -= this.returnGap; this.returnGap = -Math.log(1 - this.rng()) / rr; this.returnsQ.push(this.newItem(this.drawSku(), null, 'return')); this.stats.returned++; }
      }
    }
    // Pickers pick the oldest lines into a tote; it goes to the loading
    // station with the shortest queue when full, or after toteWait.
    picking(dt) {
      const c = this.cfg;
      this.pickAcc = Math.min(this.pickAcc + (c.pickers / c.pickTime) * dt, c.pickers);
      while (this.pickAcc >= 1 && this.pickQueue.length) {
        this.pickAcc -= 1;
        const it = this.pickQueue.shift();
        if (!this.openTote) this.openTote = { id: 'T' + String(this.toteSeq++).padStart(4, '0'), items: [], t0: this.time, kind: 'pick' };
        this.openTote.items.push(it); it.at = 'tote ' + this.openTote.id; this.stats.picked++;
      }
      const T = this.openTote;
      if (T && (T.items.length >= c.toteItems || this.time - T.t0 >= c.toteWait)) { this.sendTote(T, this.ports.filter((p) => p.role === 'load')); this.openTote = null; }
      // the returns desk: inspect, then into the returns station's tote
      this.inspect = this.inspect || Array.from({ length: c.inspectors }, () => null);
      this.inspect.forEach((ins, k) => {
        if (!ins && this.returnsQ.length) this.inspect[k] = ins = { item: this.returnsQ.shift(), t: c.inspectTime };
        if (!ins || (ins.t -= dt) > 0) return;
        const it = ins.item; this.inspect[k] = null;
        if (this.rng() < c.returnsGood) {
          if (!this.returnTote) this.returnTote = { id: 'T' + String(this.toteSeq++).padStart(4, '0'), items: [], t0: this.time, kind: 'returns' };
          this.returnTote.items.push(it); it.at = 'tote ' + this.returnTote.id;
        } else this.stats.rework++;
      });
      const R = this.returnTote;
      if (R && (R.items.length >= c.toteItems || this.time - R.t0 >= c.toteWait)) { this.sendTote(R, this.ports.filter((p) => p.role === 'returns')); this.returnTote = null; }
    }
    sendTote(T, ports) {
      const load = (q) => q.queue.reduce((n, t) => n + t.items.length, 0) * 1000 + q.done, p = ports.reduce((a, b) => (load(b) < load(a) ? b : a));
      T.port = p; T.arrive = this.time + 25; // on the conveyor from the shelving or the returns desk
      p.queue.push(T);
    }

    // ---------------------------------------------------------------- stations
    // the pocket at the end of a station's spur, if it is there
    atEnd(sp) { const f = sp.front; return f && f.s >= sp.len - 1e-6 ? f : null; }
    stationStart(p) {
      const c = this.cfg;
      if (p.released && p.released.belt !== p.spur) p.released = null; // it has gone
      if (p.kind === 'LOAD') {
        const pk = this.atEnd(p.spur), T = p.queue[0];
        if (!pk || pk.item || p.released || !T || T.arrive > this.time || this.storageFull()) return;
        p.cur = { item: T.items.shift(), pocket: pk }; p.t = c.loadTime;
        if (!T.items.length) p.queue.shift();
        return;
      }
      // pack and restock: the pocket at the end opens over the table
      const pk = this.atEnd(p.spur);
      if (!pk || !pk.item || p.released) return;
      if (p.role === 'pack' && !this.tableRoom(p, pk.item.order)) return;
      p.cur = { item: pk.item, pocket: pk }; p.t = c.unloadTime;
    }
    // the table takes items of the order being packed and the next one
    tableRoom(p, o) { const orders = [...new Set(p.table.map((it) => it.order))]; return orders.includes(o) || orders.length < 2; }
    stationDone(p) {
      const cur = p.cur;
      if (p.kind === 'LOAD') {
        if (!cur) return;
        const { item, pocket } = cur; p.cur = null;
        pocket.item = item; item.pocket = pocket; item.at = 'pocket ' + pocket.code; p.done++; p.stats.presented++; this.stats.loaded++; this.kpi.presented++; this.kpi.push('presented');
        if (item.order) { pocket.state = 'WAIT'; pocket.rank = item.order.no; }
        else {
          // a return: an order still waiting for this article to be picked takes it, and the pick is cancelled
          const k = this.pickQueue.findIndex((it) => it.sku === item.sku);
          if (k >= 0) {
            const old = this.pickQueue.splice(k, 1)[0], o = old.order;
            o.items[o.items.indexOf(old)] = item; item.order = o; item.fromStock = true;
            pocket.state = 'WAIT'; pocket.rank = o.no; this.stats.pickSaved++; this.stats.fromReturns++;
          } else { pocket.state = 'STOCK'; pocket.rank = Infinity; pocket.since = this.time; }
        }
        pocket.dest = { k: 'store', lane: -1 };
        p.released = pocket;
        return;
      }
      if (!cur) return;
      const { item, pocket } = cur; p.cur = null;
      pocket.item = null; pocket.state = 'EMPTY'; pocket.dest = null; pocket.batch = null; pocket.rank = Infinity; item.pocket = null;
      p.released = pocket; p.stats.presented++;
      if (p.role === 'restock') { item.at = 'shelving'; this.stats.restocked++; p.done++; p.restocked = (p.restocked || 0) + 1; return; }
      item.at = 'table ' + p.code; p.table.push(item); p.stats.lines++;
      this.kpi.linesPicked++; this.kpi.push('lines'); this.stats.items++;
    }
    // The packer packs the first order on the table once all of it is there.
    packing(dt) {
      const c = this.cfg;
      for (const p of this.packers) {
        if (p.away) continue;
        if (p.packing) {
          p.packing.t -= dt; p.stats.busy += dt;
          if (p.packing.t <= 0) {
            const o = p.packing.order; p.packing = null;
            p.table = p.table.filter((it) => it.order !== o);
            o.status = 'SHIPPED'; o.times = o.times || {}; o.shipped = this.time; p.done++;
            o.sscc = WS.Barcode.makeSSCC(700000 + o.no);
            this.stats.shipped++; this.kpi.ordersShipped++; this.kpi.push('shipped'); this.kpi.cycleSum += this.time - o.created; this.kpi.cycleN++;
            this.stats.cycle.push({ t: this.time, c: this.time - o.created }); if (this.stats.cycle.length > 600) this.stats.cycle.shift();
            this.parcels.push({ order: o, port: p, t: this.time, size: o.items.length }); if (this.parcels.length > 80) this.parcels.shift();
            const b = o.batch; if (b && b.orders.every((x) => x.status === 'SHIPPED')) { b.phase = 'DONE'; this.batches = this.batches.filter((x) => x !== b); }
          }
          continue;
        }
        const o = p.table[0] && p.table[0].order;
        if (o && p.table.filter((it) => it.order === o).length === o.items.length) { o.status = 'PACKING'; p.packing = { order: o, t: c.packBase + c.packPerItem * o.items.length, total: c.packBase + c.packPerItem * o.items.length }; }
      }
    }
    storageFull() { let n = 0; for (const L of this.lanes) n += L.totes.length + (L.coming || 0); return n >= this.lanes.length * this.laneCap - this.lanes.length * 3; }

    // ---------------------------------------------------------------- batches and the sequencer
    // Orders whose every item is in storage are ready. When bank A is free
    // a batch of ready orders, oldest first, goes to the pack station with
    // least to do; each pocket gets its place in the batch's sequence.
    sequencing() {
      const c = this.cfg, G = this.G, N = G.N;
      // (the open and ready orders are kept in lists of their own: the order list is long)
      this.open = this.open.filter((o) => {
        if (!o.items.every((it) => it.pocket && it.pocket.belt && it.pocket.belt.kind === 'lane' && it.pocket.belt.i >= this.cfg.stockLanes)) return true;
        o.status = 'READY'; o.ready = this.time; for (const it of o.items) it.pocket.state = 'READY';
        let k = this.ready.length; while (k && this.ready[k - 1].no > o.no) k--; // oldest first, as they came in
        this.ready.splice(k, 0, o);
        return false;
      });
      // bank A: a new batch, pass 1 from storage
      if (!this.batchA) {
        const ready = this.ready, pick = [];
        let n = 0;
        for (const o of ready) { if (n + o.items.length > N * N || pick.length >= c.batchOrders) break; pick.push(o); n += o.items.length; }
        // wait a little for a fuller batch unless the oldest has waited a while
        if (pick.length && (pick.length >= Math.min(c.batchOrders, 8) || this.time - pick[0].ready > 60)) {
          const load = (p) => this.batches.filter((b) => b.port === p).reduce((s, b) => s + b.orders.length, 0) + p.table.length * 0.3;
          const port = this.packers.filter((p) => !p.away).reduce((a, b) => (!a || load(b) < load(a) ? b : a), null) || this.packers[0];
          const bt = { id: 'B' + String(this.batchSeq++).padStart(3, '0'), orders: pick, port, phase: 'A1', cur: 0, pockets: [], t0: this.time };
          let seq = 0;
          this.ready = ready.slice(pick.length);
          for (const o of pick) { o.status = 'BATCHED'; o.batch = bt; for (const it of o.items) { const p = it.pocket; p.batch = bt; p.seq = seq++; p.state = 'SEQ'; bt.pockets.push(p); } }
          this.batchA = bt; this.batches.push(bt); this.stats.batches++;
          this.log('release', `${bt.id}: ${pick.length} orders, ${seq} pockets for ${port.name} into the sequencer`);
        }
      }
      // (a pocket of a batch may already be emptied at its pack station and loaded again for another)
      const mine = (bt) => bt.pockets.filter((p) => p.batch === bt), A = this.batchA, Bt = this.batchB, inK = (bt, kind) => mine(bt).filter((p) => p.belt && p.belt.kind === kind).length;
      // The next line may go once the one before is empty and its pockets are off the top rail: the lines
      // join the top rail one after the other from west to east, so a later line's pockets could
      // otherwise get in front of an earlier one's.
      const lineDone = (bt, lines) => {
        if (lines[bt.cur].totes.some((p) => p.batch === bt)) return false;
        const nx = bt.cur + 1 < N ? lines[bt.cur + 1].pts[0].x + 0.5 : Infinity;
        return !bt.pockets.some((p) => p.batch === bt && p.belt && p.belt.name === 'Top rail' && p.x < nx);
      };
      if (A && A.phase === 'A1' && inK(A, 'seqA') === mine(A).length && !Bt) { A.phase = 'A2'; A.cur = 0; this.batchB = A; }
      if (A && A.phase === 'A2') {
        while (A.cur < N && lineDone(A, this.seqA)) A.cur++;
        if (A.cur >= N) { A.phase = 'B1'; this.batchA = null; }
      }
      const B2 = this.batchB;
      if (B2 && B2.phase === 'B1' && inK(B2, 'seqB') === mine(B2).length) { B2.phase = 'B2'; B2.cur = 0; }
      if (B2 && B2.phase === 'B2') {
        while (B2.cur < N && lineDone(B2, this.seqB)) B2.cur++;
        if (B2.cur >= N) { B2.phase = 'PACK'; this.batchB = null; }
      }
    }
    // pockets on their way into each storage rail, so the choice of rail counts them
    countComing() {
      for (const L of this.lanes) L.coming = 0;
      for (const p of this.pocketList) if (p.dest && p.dest.k === 'store' && p.dest.lane >= 0 && p.belt && p.belt.kind !== 'lane') this.lanes[p.dest.lane].coming++;
      // a pocket that has just come onto the loop gets its rail once it reaches the east side
      for (const p of this.rails.east.totes) if (p.dest && p.dest.k === 'store' && p.dest.lane < 0) p.dest.lane = this.chooseLane(p);
      // a rail's tail is what is at its back now, or coming
      for (const L of this.lanes) { const b = L.back; L.tail = Math.max(b ? (b.rank === Infinity ? 1e12 : b.rank) : -Infinity, L.coming ? L.tail ?? -Infinity : -Infinity); }
    }

    // ---------------------------------------------------------------- disruptions: the rail stops
    fault(until) {
      if (this.railFault) return null;
      this.railFault = { until };
      this.railFault.h = this.disrupt.note('breakdown', 'Rail stopped', until);
      this.log('warn', `Rail drive fault: every pocket stops · repair ${this.disrupt.mins(this.cfg.repairMinutes)}`);
      return 'The rail stopped';
    }
    faultAlerts(left) { return this.railFault ? [{ sev: 'critical', key: 'rail', title: 'Rail stopped', msg: `Drive fault · repair ${left(this.railFault.until)}` }] : []; }
    clearFaults() { if (this.railFault) this.endFault(); }
    endFault() { this.railFault.h.t1 = this.time; this.railFault = null; this.log('system', 'Rail running again'); }

    // ---------------------------------------------------------------- numbers
    // the pockets by state, for the time split chart and the map
    get timeSplit() {
      return (this._split = this._split || {
        title: 'Pockets', table: 'Stations',
        series: [{ k: 'EMPTY', label: 'Empty', slot: 's3' }, { k: 'STOCK', label: 'Returns in stock', slot: 's4' }, { k: 'WAIT', label: 'Orders incomplete', slot: 's2' }, { k: 'SEQ', label: 'Ready and sequencing', slot: 's1' }],
        // counted once a second: a thousand pockets every tick is more than the chart needs
        sample: () => {
          const sec = Math.floor(this.time);
          if (this.splitAt === sec) return this.splitLast;
          const n = { EMPTY: 0, STOCK: 0, WAIT: 0, SEQ: 0 }; for (const p of this.pocketList) n[this.splitKey(p)]++; for (const k in n) n[k] /= this.pocketList.length || 1;
          this.splitAt = sec; this.splitLast = n;
          return n;
        },
      });
    }
    splitKey(p) { return p.state === 'EMPTY' || p.state === 'RESTOCK' ? 'EMPTY' : p.state === 'STOCK' ? 'STOCK' : p.state === 'WAIT' ? 'WAIT' : 'SEQ'; }
    mapMarks(alpha) { return this.pocketList.map((p) => ({ x: lerp(p.px, p.x, alpha) - this.G.X0 - 0.5, y: lerp(p.py, p.y, alpha) - 0.5, state: this.splitKey(p) })); }
    stat(list, key, span = 3600) {
      const v = list.filter((e) => e.t > this.time - span).map((e) => e[key]).sort((a, b) => a - b);
      return v.length ? { n: v.length, avg: v.reduce((a, b) => a + b, 0) / v.length, p90: v[Math.min(v.length - 1, Math.floor(v.length * 0.9))] } : null;
    }
    stored() { return this.lanes.reduce((n, L) => n + L.totes.length, 0); }
    extraAlerts() {
      const out = [], fill = this.stored() / this.storageCapacity(), q = this.pickQueue.length, empty = this.loaders.filter((p) => !this.atEnd(p.spur)).length;
      if (fill > 0.85) out.push({ sev: fill > 0.93 ? 'critical' : 'warning', key: 'full', title: 'Storage rails filling up', msg: `${Math.round(fill * 100)}% full · loading stops near the top` });
      if (q > this.cfg.pickers * 12) out.push({ sev: q > this.cfg.pickers * 30 ? 'critical' : 'warning', key: 'pick', title: 'Picking backlog', msg: `${q} items waiting to be picked` });
      if (empty >= 2) out.push({ sev: 'warning', key: 'empty', title: 'No empty pockets', msg: `${empty} loading stations without an empty pocket` });
      if (this.returnsQ.length > 30) out.push({ sev: 'warning', key: 'ret', title: 'Returns piling up', msg: `${this.returnsQ.length} returned items at the desk` });
      return out;
    }
    fingerprint() { return this.pocketList.map((p) => [p.code, p.state, p.belt ? p.belt.name : '-', Math.round(p.s * 100), p.item ? p.item.sku.id : ''].join('|')).join('\n') + `\n${this.stats.recirc}|${this.stats.fromReturns}|${this.stats.shipped}`; }
    soundPos(p) { return p.drop; }
    dispatch() {} // nothing to dispatch: the rail and the stations run themselves (see tick)

    tick() {
      super.tick();
      const dt = this.cfg.tick;
      if (this.railFault && this.time >= this.railFault.until) this.endFault();
      this.arrivals(dt);
      this.picking(dt);
      for (const p of this.pocketList) { p.px = p.x; p.py = p.y; }
      if (!this.railFault) this.net.update(dt);
      this.packing(dt);
      this.timers += dt;
      if (this.timers >= 0.5) { this.timers = 0; this.countComing(); this.sequencing(); }
    }
  }
  const lerp = (a, b, t) => (a == null ? b : a + (b - a) * t);

  WS.PocketSim = PocketSim;
  WS.POCKET_STATES = POCKET;
})((globalThis.WS = globalThis.WS || {}));
