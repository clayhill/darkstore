/* CaseCraft: a distribution centre that turns single-product pallets into
 * mixed store pallets, case by case (specs/case.txt).
 *
 *  inbound      Trucks bring pallets of one product each; a forklift puts
 *               them on a pallet conveyor past the depalletising cells,
 *               where a robot arm takes the cases off one by one. A tunnel
 *               measures each case and gives it its place in the structure.
 *  structure    Levels of narrow aisles with shelves on both sides, and a
 *               transfer deck along their south end. Case bots (a few per
 *               level, never leaving it) drive along the deck's lane and
 *               into the aisles, and set each case in a gap just wide enough
 *               for it. Lifts on the deck's south side carry cases between
 *               the conveyors below and each level's transfer shelves.
 *  sequencing   A palletising cell releases its pallet's cases in the order
 *               they are stacked: the bots bring them to the cell's output
 *               lift, which takes them down in exactly that order.
 *  palletising  A robot arm stacks them as planned (WS.CasePlanner): heavy
 *               at the bottom, nothing heavy on fragile cases, every case
 *               standing on most of its base. The pallet is wrapped,
 *               labelled and conveyed into the store's truck.
 * Positions are metres: x east, y south, z up. Nothing can lock up: a bot
 * enters the deck's lane only with the stretch it drives reserved and the
 * aisle or lift it goes to to itself, and goes to its own parking pocket
 * when it cannot go on; lifts and the transfer shelves are booked in
 * sequence order, so the case a lift waits for always has a place. */
(function (WS) {
  'use strict';
  const TERMS = { unit: 'case', Unit: 'Case', units: 'cases', Units: 'Cases', store: 'structure', Store: 'Structure', port: 'cell', ports: 'cells', machine: 'Machine', starve: 'cases', flow1: 'Cases in /h', flow2: 'Cases out /h', surge: 'Rush of store orders' };
  const STATE_LABELS = { MOVING_TO_TARGET: 'Driving empty', TRANSPORTING_TO_PORT: 'Carrying a case', HANDLING: 'Handling a case', STORING: 'Lift moving', AT_PORT: 'Lift at a level', WAITING_PORT: 'Waiting for a case', WAITING_IN_TRAFFIC: 'Waiting for the deck' };
  const LEGEND = ['IDLE', 'MOVING_TO_TARGET', 'TRANSPORTING_TO_PORT', 'HANDLING', 'STORING', 'WAITING_IN_TRAFFIC', 'WAITING_PORT'];
  const AISLES = ['Snacks', 'Baby & care', 'Paper & cleaning', 'Breakfast & dry', 'Tins & jars', 'Pet', 'Drinks'];
  // case families: store aisle, size L × W × H (m), kg, crush (0 fragile, 1 normal, 2 strong), look, share of the range, variants and their print colours
  const FAMS = [
    { n: 'Crisps', a: 0, d: [0.5, 0.36, 0.34], kg: 2.1, crush: 0, look: 'print', w: 6, v: ['salted 15×150 g', 'paprika 15×150 g', 'sour cream 15×150 g', 'tortilla 12×200 g', 'popcorn 12×90 g'], col: ['#dc2626', '#f59e0b', '#16a34a', '#7c3aed', '#0891b2'] },
    { n: 'Biscuits', a: 0, d: [0.36, 0.24, 0.18], kg: 3.2, crush: 1, look: 'print', w: 6, v: ['butter 12×200 g', 'chocolate 12×150 g', 'speculoos 12×250 g', 'wafers 16×75 g'], col: ['#b45309', '#78350f', '#c2410c', '#eab308'] },
    { n: 'Chocolate', a: 0, d: [0.3, 0.2, 0.12], kg: 2.4, crush: 1, look: 'print', w: 4, v: ['milk 24×100 g', 'dark 24×100 g', 'hazelnut 24×100 g'], col: ['#7c2d12', '#292524', '#9a3412'] },
    { n: 'Nappies', a: 1, d: [0.45, 0.25, 0.38], kg: 4.6, crush: 0, look: 'bale', w: 4, v: ['size 3 ×4', 'size 4 ×4', 'size 5 ×4'], col: ['#60a5fa', '#a78bfa', '#34d399'] },
    { n: 'Shampoo', a: 1, d: [0.3, 0.22, 0.22], kg: 5.6, crush: 1, look: 'kraft', w: 4, v: ['classic 12×250 ml', 'sensitive 12×250 ml', 'anti-dandruff 12×250 ml'], col: ['#0ea5e9', '#f472b6', '#14b8a6'] },
    { n: 'Toilet paper', a: 2, d: [0.48, 0.4, 0.4], kg: 3.0, crush: 0, look: 'bale', w: 4, v: ['24 rolls', '32 rolls', 'recycled 24 rolls'], col: ['#e0f2fe', '#fef9c3', '#dcfce7'] },
    { n: 'Kitchen roll', a: 2, d: [0.44, 0.3, 0.28], kg: 2.0, crush: 0, look: 'bale', w: 3, v: ['8 rolls', '12 rolls'], col: ['#fde68a', '#bfdbfe'] },
    { n: 'Detergent', a: 2, d: [0.38, 0.28, 0.3], kg: 13, crush: 2, look: 'kraft', w: 4, v: ['liquid 4×3 l', 'pods 4×60', 'colour 4×3 l'], col: ['#2563eb', '#f97316', '#db2777'] },
    { n: 'Dish soap', a: 2, d: [0.3, 0.22, 0.24], kg: 6, crush: 1, look: 'kraft', w: 3, v: ['lemon 12×500 ml', 'original 12×500 ml'], col: ['#facc15', '#22c55e'] },
    { n: 'Pasta', a: 3, d: [0.38, 0.28, 0.2], kg: 6, crush: 1, look: 'kraft', w: 6, v: ['spaghetti 12×500 g', 'penne 12×500 g', 'fusilli 12×500 g', 'lasagne 12×500 g'], col: ['#1d4ed8', '#1e40af', '#1d4ed8', '#b91c1c'] },
    { n: 'Rice', a: 3, d: [0.4, 0.3, 0.18], kg: 10, crush: 2, look: 'kraft', w: 4, v: ['long grain 10×1 kg', 'basmati 10×1 kg', 'risotto 10×1 kg'], col: ['#d97706', '#65a30d', '#be123c'] },
    { n: 'Cereal', a: 3, d: [0.4, 0.3, 0.3], kg: 3.3, crush: 1, look: 'print', w: 5, v: ['corn flakes 10×500 g', 'muesli 10×750 g', 'oat flakes 10×500 g', 'choco pops 10×375 g'], col: ['#eab308', '#84cc16', '#a16207', '#7c3aed'] },
    { n: 'Coffee', a: 3, d: [0.3, 0.2, 0.18], kg: 3.2, crush: 1, look: 'print', w: 4, v: ['ground 12×250 g', 'beans 6×500 g', 'capsules 10×20'], col: ['#7f1d1d', '#451a03', '#111827'] },
    { n: 'Sugar', a: 3, d: [0.36, 0.26, 0.18], kg: 10, crush: 2, look: 'kraft', w: 2, v: ['white 10×1 kg', 'brown 10×1 kg'], col: ['#e5e7eb', '#92400e'] },
    { n: 'Tinned tomatoes', a: 4, d: [0.32, 0.24, 0.12], kg: 5.4, crush: 2, look: 'tray', w: 5, v: ['chopped 12×400 g', 'whole 12×400 g', 'passata 12×500 g'], col: ['#dc2626', '#b91c1c', '#ef4444'] },
    { n: 'Soup', a: 4, d: [0.4, 0.27, 0.11], kg: 10, crush: 2, look: 'tray', w: 4, v: ['tomato 24×400 g', 'vegetable 24×400 g', 'chicken 24×400 g'], col: ['#ea580c', '#16a34a', '#ca8a04'] },
    { n: 'Jars', a: 4, d: [0.3, 0.23, 0.16], kg: 6.5, crush: 1, look: 'kraft', w: 4, v: ['pasta sauce 12×400 g', 'pickles 12×350 g', 'jam 12×370 g'], col: ['#b91c1c', '#4d7c0f', '#9d174d'] },
    { n: 'Dog food', a: 5, d: [0.3, 0.23, 0.1], kg: 9.5, crush: 2, look: 'tray', w: 3, v: ['beef 12×800 g', 'chicken 12×800 g'], col: ['#9a3412', '#a16207'] },
    { n: 'Cat litter', a: 5, d: [0.4, 0.25, 0.32], kg: 10, crush: 2, look: 'print', w: 2, v: ['clumping 2×10 l', 'silica 2×8 l'], col: ['#0f766e', '#475569'] },
    { n: 'Water', a: 6, d: [0.27, 0.18, 0.33], kg: 9.3, crush: 2, look: 'shrink', w: 6, v: ['still 6×1.5 l', 'sparkling 6×1.5 l', 'mineral 6×1.5 l'], col: ['#7dd3fc', '#38bdf8', '#bae6fd'] },
    { n: 'Soft drinks', a: 6, d: [0.4, 0.27, 0.12], kg: 8.6, crush: 2, look: 'shrink', w: 6, v: ['cola 24×33 cl', 'orange 24×33 cl', 'lemon 24×33 cl', 'zero 24×33 cl'], col: ['#b91c1c', '#f97316', '#facc15', '#111827'] },
    { n: 'Juice', a: 6, d: [0.29, 0.2, 0.25], kg: 6.6, crush: 1, look: 'kraft', w: 4, v: ['orange 6×1 l', 'apple 6×1 l', 'multivitamin 6×1 l'], col: ['#f97316', '#65a30d', '#e11d48'] },
    { n: 'Beer', a: 6, d: [0.4, 0.27, 0.25], kg: 16, crush: 2, look: 'kraft', w: 5, v: ['pils 24×25 cl', 'blonde 24×33 cl', 'tripel 24×33 cl', 'alcohol-free 24×25 cl'], col: ['#ca8a04', '#a16207', '#78350f', '#15803d'] },
    { n: 'Wine', a: 6, d: [0.31, 0.24, 0.33], kg: 8.5, crush: 1, look: 'kraft', w: 3, v: ['red 6×75 cl', 'white 6×75 cl', 'rosé 6×75 cl'], col: ['#7f1d1d', '#a3a3a3', '#fb7185'] },
  ];
  const TOWNS = ['Gent-Zuid', 'Leuven', 'Mechelen', 'Aalst', 'Brugge', 'Kortrijk', 'Hasselt', 'Sint-Niklaas', 'Turnhout', 'Lier', 'Ronse', 'Ieper', 'Tienen', 'Geel', 'Lokeren', 'Dendermonde', 'Ninove', 'Vilvoorde', 'Halle', 'Waregem', 'Brasschaat', 'Diest', 'Genk', 'Oostende', 'Roeselare', 'Herentals', 'Mol', 'Zottegem', 'Wetteren', 'Eeklo'];
  const CARRY = [5, 14, Infinity, Infinity]; // kg a case of crush class k carries on top of it (3: the pallet itself)
  const GAP = 0.03; // m a stored case keeps clear of the next
  const U0 = 0.8, U1 = 0.1; // m of an aisle without shelf at the deck end (a bot working there stays clear of the deck) and at the far end
  const near = (from, to) => to + Math.round((from - to) / (Math.PI * 2)) * Math.PI * 2;

  // ---------------------------------------------------------------- geometry
  // Everything about where things are, from the settings (see specs/case.txt, 2).
  function geometry(c) {
    const A = c.aisles, P = 2.1, AW = 0.8, RD = 0.65, AL = c.aisleLength, W = A * P;
    const yS = AL, nIn = c.inLifts, nOut = c.palletCells, nPark = c.botsPerLevel, LW = 2.3, PW = 1.0, gap = 0.6;
    // along the deck's south side, west to east: input lifts, parking pockets (round the middle), output lifts
    let x = Math.max(0.3, W / 2 - (nIn * LW + gap + (nPark * PW) / 2));
    const inX = [], outX = [], parkX = [];
    for (let k = 0; k < nIn; k++) { inX.push(x + LW / 2); x += LW; }
    x += gap; for (let k = 0; k < nPark; k++) { parkX.push(x + PW / 2); x += PW; } x += gap;
    for (let k = 0; k < nOut; k++) { outX.push(x + LW / 2); x += LW; }
    const DX0 = 0, DX1 = Math.max(W, x + 0.3);
    // inbound below the west half: the depalletisers west of the input lifts, the tunnel between
    const yI = yS + 7.0, nD = c.depalCells, depX = Array.from({ length: nD }, (_, k) => inX[0] - 3.5 - (nD - 1 - k) * 3.6);
    // outbound below the east half: a palletiser under each output lift, its door in the south wall below it
    const cellX = Array.from({ length: nOut }, (_, k) => outX[0] + 0.6 + 6 * k), yE = yS + 9.4, yC = yS + 14.0, yDist = yC + 2.0;
    const xWr = cellX[nOut - 1] + 3.6, xLb = xWr + 2.6, xT = xLb + 1.0, XW = depX[0] - 5.0, XE = xT + 2.5;
    return {
      A, P, AW, RD, AL, W, yS, DX0, DX1, inX, outX, parkX, LW,
      yM: yS - 0.75, yL: [yS + 0.62, yS + 1.87], yP: yS + 3.15, yD: yS + 3.85, yShelf: yS + 4.2, yCar: yS + 5.1, yMast: yS + 5.65, yBase: yS + 5.85,
      ax: (k) => k * P + P / 2,
      shelfX: (k, s) => k * P + P / 2 + s * (AW / 2 + RD / 2),
      z: (f) => c.baseHeight + f * c.levelHeight, zc: (f) => c.baseHeight + f * c.levelHeight + 0.28,
      slotX: (lx, j) => lx + (j - 1) * 0.7,
      yI, depX, yDepOut: yI + 2.4, yDepPal: yI + 4.1, yDepNext: yI + 5.35, yPL: yI + 6.6, tunnelX: inX[0] - 1.8,
      cellX, yE, yC, yBuild: yE + 1.45, yDist, xWr, xLb, xT, XE, XW, doorX: cellX.map((x) => x + 0.35), yWall: yDist + 4.5, yN: -1.2,
      CZ: 0.8, // conveyor top (m)
    };
  }

  const Conveyor = WS.Conveyor;

  // ---------------------------------------------------------------- the pallet planner
  // A pallet is planned on a 5 cm grid seen from above, from its far corner
  // (u from the east edge going west, v from the south edge going north), so
  // the arm never reaches over cases it has placed. Each case goes on the
  // corner where it ends up lowest, then furthest back, standing on at least
  // 75 % of its base on cases that can carry it.
  const RES = 0.05, NU = 24, NV = 20;
  const Planner = {
    newPallet() { return { items: [], kg: 0, vol: 0, top: 0, hm: new Float32Array(NU * NV), cr: new Uint8Array(NU * NV).fill(3), cand: new Set([0]), aisles: new Set() }; },
    place(pal, p, cfg) {
      if (pal.kg + p.kg > cfg.palletWeight) return false;
      let best = null;
      for (const [l, w, rot] of [[p.L, p.W, 0], [p.W, p.L, 1]]) {
        const li = Math.ceil(l / RES - 1e-6), wj = Math.ceil(w / RES - 1e-6);
        if (li > NU || wj > NV) continue;
        for (const key of pal.cand) {
          const i = Math.min(key >> 5, NU - li), j = Math.min(key & 31, NV - wj);
          let z = 0;
          for (let b = j; b < j + wj; b++) for (let a = i; a < i + li; a++) { const h = pal.hm[b * NU + a]; if (h > z) z = h; }
          if (z + p.H > cfg.palletHeight + 1e-6) continue;
          // lowest first, then furthest back; and a case turned so it leaves no strip too narrow for another like it
          const ru = NU - i - li, rv = NV - j - wj, m = Math.min(li, wj), waste = (ru > 0 && ru < m ? ru : 0) + (rv > 0 && rv < m ? rv : 0);
          const score = z * 1000 + j * 2 + i + waste * 3;
          if (best && score >= best.score) continue;
          let sup = 0, cr = 3;
          for (let b = j; b < j + wj; b++) for (let a = i; a < i + li; a++) { const q = b * NU + a; if (pal.hm[q] >= z - 0.015) { sup++; if (pal.cr[q] < cr) cr = pal.cr[q]; } }
          const share = sup / (li * wj);
          if (share < 0.75 || p.kg > CARRY[cr]) continue;
          best = { score, i, j, li, wj, z, l, w, rot, share };
        }
      }
      if (!best) return false;
      const { i, j, li, wj, z } = best;
      for (let b = j; b < j + wj; b++) for (let a = i; a < i + li; a++) { pal.hm[b * NU + a] = z + p.H; pal.cr[b * NU + a] = p.crush; }
      for (const [a, b] of [[i + li, j], [i, j + wj], [i + li, j + wj], [0, j + wj], [i + li, 0]]) if (a < NU && b < NV) pal.cand.add((a << 5) | b);
      pal.items.push({ p, u: i * RES, v: j * RES, z, l: best.l, w: best.w, h: p.H, rot: best.rot, sup: best.share });
      pal.kg += p.kg; pal.vol += p.L * p.W * p.H; pal.top = Math.max(pal.top, z + p.H); pal.aisles.add(p.aisle);
      return true;
    },
    // An order's cases (products, in build order) into pallets. Two pallets
    // are open at a time: a case goes on the first it fits on, else a new
    // one is opened and the older of the two is closed. Each pallet is built
    // in the order its cases were given places.
    plan(list, cfg) {
      const out = [], open = [];
      for (const p of list) {
        if (open.some((pal) => this.place(pal, p, cfg))) continue;
        if (open.length >= 2) out.push(open.shift());
        const pal = this.newPallet();
        if (!this.place(pal, p, cfg)) this.force(pal, p);
        open.push(pal);
      }
      out.push(...open);
      for (const pal of out) { delete pal.hm; delete pal.cr; delete pal.cand; }
      return out;
    },
    // a case that fits on no pallet at all (too heavy for the limit): on the floor of an empty one
    force(pal, p) { pal.items.push({ p, u: 0, v: 0, z: 0, l: p.L, w: p.W, h: p.H, rot: 0, sup: 1 }); pal.kg += p.kg; pal.vol += p.L * p.W * p.H; pal.top = p.H; pal.aisles.add(p.aisle); pal.hm.fill(9); },
  };
  // the order a policy builds a store's pallets in
  const band = (p) => (p.kg >= 8 ? 2 : p.kg >= 4.5 ? 1 : 0);
  const ORDER = {
    stable: (a, b) => b.crush - a.crush || band(b) - band(a) || b.H - a.H || a.id - b.id,
    aisle: (a, b) => a.aisle - b.aisle || b.kg - a.kg || a.id - b.id,
    blend: (a, b) => band(b) - band(a) || a.aisle - b.aisle || b.L * b.W - a.L * a.W || a.id - b.id,
  };

  // ---------------------------------------------------------------- the control room's map
  const K = { OUT: 0, HALL: 1, SHELF: 2, AISLE: 3, DECK: 4, LIFT: 5, CONV: 6, CELL: 7, DOOR: 8, TRUCK: 9 };
  class CaseMap extends WS.RobotFloor {
    constructor(sim, G) {
      const X0 = Math.floor(G.XW) - 15, Y0 = Math.floor(G.yN) - 1;
      super(Math.ceil(G.XE + 2 - X0), Math.ceil(G.yWall + 15 - Y0), WS.CELL.BLOCKED);
      Object.assign(this, { sim, G, X0, Y0 });
      this.kind = new Uint8Array(this.W * this.D); this.shelfOf = new Int16Array(this.W * this.D).fill(-1);
    }
    cell(x, y) { const i = Math.floor(x - this.X0), j = Math.floor(y - this.Y0); return i >= 0 && j >= 0 && i < this.W && j < this.D ? this.idx(i, j) : -1; }
    fill(x0, y0, x1, y1, k, shelf = -1) {
      for (let y = y0; y < y1 - 1e-6; y += 0.5) for (let x = x0; x < x1 - 1e-6; x += 0.5) { const i = this.cell(x, y); if (i >= 0) { this.kind[i] = k; if (shelf >= 0) this.shelfOf[i] = shelf; } }
    }
    line(conv) { for (let s = 0; s <= conv.len; s += 0.4) { const q = conv.at(s), i = this.cell(q.x, q.y); if (i >= 0 && this.kind[i] <= K.HALL) this.kind[i] = K.CONV; } }
    passable() { return false; }
    depthOf() { return 1; }
    mapFill(i, mix) {
      const s = this.shelfOf[i];
      if (s >= 0) { const f = this.sim.shelfFill(s); return mix('#1d3a5c', '#e3a008', Math.max(0, (f - 0.4) / 0.6)); }
      return { [K.HALL]: '#0c1320', [K.AISLE]: '#141d2b', [K.DECK]: '#1b2536', [K.LIFT]: '#0e3a46', [K.CONV]: '#2a3b52', [K.CELL]: '#3a2a0a', [K.DOOR]: '#1e293b', [K.TRUCK]: '#111827' }[this.kind[i]] || '#070b12';
    }
    get mapTitle() { return 'STRUCTURE · shelves blue → amber as they fill (all levels) · dots: bots, lifts and arms'; }
  }

  // ---------------------------------------------------------------- cells
  // A depalletising or palletising cell, as a station for the shared views:
  // working while its arm handles a case, starved while it waits for one.
  class Cell extends WS.Port {
    constructor(sim, idx, def) {
      super(sim, idx, def);
      Object.assign(this, { role: def.role, k: def.k, arm: null, pal: null, next: null, inT: 0, cases: 0, empties: 0 });
      this.name = def.role === 'depal' ? 'Depalletiser ' + (def.k + 1) : 'Palletiser ' + (def.k + 1);
      this.code = (def.role === 'depal' ? 'D' : 'C') + (def.k + 1);
      if (def.role === 'pal') Object.assign(this, { queue: [], active: [], toRelease: [], bySeq: new Map(), seqNext: 0, liftSeq: 0, build: null, done: null, orders: [] });
    }
    get job() { return this.robot && this.robot.state === 'HANDLING' ? { lines: [null], next: 0, t: 0, total: 1 } : null; }
    set job(v) {}
    setArm() {} // the shared stations' arm option does not apply
    update(dt) {
      const st = this.stats, A = this.robot, work = !!(A && A.state === 'HANDLING' && !A.down), starve = !work && !(A && A.down) && (this.role === 'depal' ? !!this.pal : !!this.build);
      st.t += dt;
      if (work) st.busy += dt;
      if (starve) st.starved += dt;
      if (this.inT > 0) this.inT = Math.max(0, this.inT - dt);
      const f = Math.exp(-dt / 900), g = Math.exp(-dt / 300);
      this.busyNow = (this.busyNow || 0) * f + (work ? 1 - f : 0);
      this.recentStarve = this.role === 'pal' ? (this.recentStarve || 0) * g + (starve ? 1 - g : 0) : 0;
    }
  }

  // ---------------------------------------------------------------- machines
  class Bot extends WS.Machine {
    constructor(sim, id, level, k, home) {
      super(sim, id, `Bot ${level + 1}.${k + 1}`);
      Object.assign(this, { level, k, home, at: home, x: home.x, y: home.py, a: Math.PI, c: null, anim: null, jobs: 0 });
      this.place(); this.prx = this.rx; this.pry = this.ry;
    }
    update(dt) {
      this.ox = this.x; this.oy = this.y; this.oa = this.a;
      super.update(dt);
      // the lane behind it is free again as it drives along (its start too, once clear of it)
      const q = this.claim;
      if (q && q.moving) {
          const r = q.segs[0];
        if (q.east) r.lo = Math.max(r.lo, this.x - 0.75); else r.hi = Math.min(r.hi, this.x + 0.75);
        if (q.cross0 && Math.abs(this.x - q.cross0.lo - 0.75) > 1.5) { q.segs.splice(q.segs.indexOf(q.cross0), 1); q.cross0 = null; }
      }
    }
    place() { const m = this.sim.map; this.rx = this.x - m.X0 - 0.5; this.ry = this.y - m.Y0 - 0.5; }
  }
  class Lift extends WS.Machine {
    constructor(sim, id, k, out, x) {
      super(sim, id, (out ? 'Output lift ' : 'Input lift ') + (k + 1));
      const G = sim.G, L = sim.cfg.levels;
      Object.assign(this, { k, out, x, y: G.yCar, z: G.CZ, load: [], trips: 0 });
      this.slots = Array.from({ length: L }, () => [0, 1, 2].map(() => ({ c: null, res: null })));
      this.place(); this.prx = this.rx; this.pry = this.ry;
    }
    update(dt) { this.oz = this.z; super.update(dt); }
    place() { const m = this.sim.map; this.rx = this.x - m.X0 - 0.5; this.ry = this.y - m.Y0 - 0.5; }
    // the level the carriage stands at (-1: the bottom), or null between
    get at() { const G = this.sim.G; if (Math.abs(this.z - G.CZ) < 1e-6) return -1; const f = Math.round((this.z - G.zc(0)) / this.sim.cfg.levelHeight); return f >= 0 && f < this.slots.length && Math.abs(G.zc(f) - this.z) < 1e-6 ? f : null; }
  }
  class Arm extends WS.Machine {
    constructor(sim, id, cell, base) {
      super(sim, id, cell.role === 'depal' ? 'Depal arm ' + (cell.k + 1) : 'Pallet arm ' + (cell.k + 1));
      Object.assign(this, { cell, x: base.x, y: base.y, c: null, cyc: null, cases: 0, yaw: 0 });
      cell.robot = this;
      this.place(); this.prx = this.rx; this.pry = this.ry;
    }
    place() { const m = this.sim.map; this.rx = this.x - m.X0 - 0.5; this.ry = this.y - m.Y0 - 0.5; }
  }
  class Forklift extends WS.Machine {
    constructor(sim, id, x, y) {
      super(sim, id, 'Forklift');
      Object.assign(this, { x, y, a: Math.PI / 2, fork: 0, pal: null, moves: 0 });
      this.place(); this.prx = this.rx; this.pry = this.ry;
    }
    update(dt) { this.ox = this.x; this.oy = this.y; this.oa = this.a; this.ofork = this.fork; super.update(dt); }
    place() { const m = this.sim.map; this.rx = this.x - m.X0 - 0.5; this.ry = this.y - m.Y0 - 0.5; }
  }

  // ---------------------------------------------------------------- tasks
  const T = {};
  // A bot drives to a pocket on its level's deck: an aisle's mouth, a lift's
  // transfer shelf, or its parking pocket. It reserves the stretch of lane it
  // drives and the place it goes to before it leaves; when the place is not
  // free it waits in its own parking pocket instead of where it is.
  function* goto(sim, b, dest) {
    const c = sim.cfg, G = sim.G;
    if (b.at === dest) return;
    if (b.at.kind === 'aisle' && b.y < G.yM - 1e-6) { b.state = b.c ? 'TRANSPORTING_TO_PORT' : 'MOVING_TO_TARGET'; yield { op: 'travel', prop: 'y', to: G.yM, v: c.vAisle, a: c.botAccel }; }
    // the place is taken: wait for it in the parking pocket, out of everybody's way
    while (!sim.claim(b, dest)) {
      if (dest !== b.home && b.at !== b.home && !sim.placeFree(b, dest)) yield* goto(sim, b, b.home);
      else yield { op: 'wait', t: 0.2, waitState: 'WAITING_IN_TRAFFIC' };
    }
    const from = b.at, turn = (Math.PI / 2) / c.turnTime, lane = b.claim.lane;
    b.state = b.c ? 'TRANSPORTING_TO_PORT' : 'MOVING_TO_TARGET';
    yield { op: 'travel', prop: 'y', to: G.yL[lane], v: c.vAisle * 0.6, a: c.botAccel };
    if (from.lock !== dest.lock) sim.unlock(b, from);
    if (Math.abs(dest.x - b.x) > 1e-6) {
      yield { op: 'travel', prop: 'a', to: near(b.a, dest.x > b.x ? Math.PI / 2 : -Math.PI / 2), v: turn, a: turn * 4 };
      b.claim.moving = true;
      yield { op: 'travel', prop: 'x', to: dest.x, v: c.vDeck, a: c.botAccel };
    }
    yield { op: 'travel', prop: 'a', to: near(b.a, dest.kind === 'aisle' ? Math.PI : 0), v: turn, a: turn * 4 };
    yield { op: 'travel', prop: 'y', to: dest.py, v: c.vAisle * 0.6, a: c.botAccel };
    sim.unclaim(b);
    b.at = dest;
  }
  // along an aisle to a shelf position
  function* along(sim, b, y) {
    const c = sim.cfg;
    b.state = b.c ? 'TRANSPORTING_TO_PORT' : 'MOVING_TO_TARGET';
    yield { op: 'travel', prop: 'y', to: y, v: c.vAisle, a: c.botAccel };
  }
  // arms out under the case and back, to take it or put it down
  function* transfer(sim, b, put, side, c) {
    const d = sim.cfg.transferTime;
    b.state = 'HANDLING'; b.anim = { put, side, t0: sim.time, d, c };
    if (!put) { c.moving = true; if (c.shelf) c.shelf.ver++; }
    yield { op: 'wait', t: d };
    b.anim = null; c.moving = false;
  }
  // A bot's life: take the most urgent task of its level, do it, repeat; park when there is none.
  T.BOT = function* (sim, b) {
    for (;;) {
      let t = sim.takeTask(b);
      if (!t) {
        if (b.at !== b.home) { yield* goto(sim, b, b.home); continue; }
        b.state = 'IDLE';
        yield { op: 'until', fn: () => (t = sim.takeTask(b)) !== null };
      }
      b.task = t;
      const lift = sim.liftDest(b.level, t.L, t.j), aisle = sim.aisleDest(b.level, t.k), side = t.c.shelf.s;
      if (t.type === 'store') {
        yield* goto(sim, b, lift);
        yield* transfer(sim, b, false, 0, t.c);
        sim.tookFromLift(b, t);
        yield* goto(sim, b, aisle);
        yield* along(sim, b, t.c.y);
        yield* transfer(sim, b, true, side, t.c);
        sim.stored(b, t);
      } else {
        yield* goto(sim, b, aisle);
        yield* along(sim, b, t.c.y);
        yield* transfer(sim, b, false, side, t.c);
        sim.fetched(b, t);
        yield* goto(sim, b, lift);
        yield* transfer(sim, b, true, 0, t.c);
        sim.delivered(b, t);
      }
      b.task = null; b.jobs++; b.lifts++;
    }
  };
  function* liftTo(sim, L, f) {
    const c = sim.cfg, G = sim.G, z = f < 0 ? G.CZ : G.zc(f);
    if (Math.abs(L.z - z) < 1e-6) return;
    L.state = 'STORING';
    yield { op: 'travel', prop: 'z', to: z, v: c.liftV, a: c.liftA, settle: 0.2 };
    L.trips++;
  }
  // An input lift: loads cases at the bottom from its spur (up to its carriage's
  // load, each with a place booked on its level's transfer shelf), takes them
  // up level by level, and goes back down.
  T.INLIFT = function* (sim, L) {
    const c = sim.cfg;
    for (;;) {
      L.state = 'IDLE';
      yield { op: 'until', fn: () => sim.inReady(L) };
      yield* liftTo(sim, L, -1);
      while (L.load.length < c.liftCap && sim.inReady(L)) {
        sim.loadIn(L);
        L.state = 'HANDLING';
        yield { op: 'wait', t: c.liftLoad };
      }
      L.load.sort((a, b) => a.dest.f - b.dest.f);
      while (L.load.length) {
        const cs = L.load[0];
        yield* liftTo(sim, L, cs.dest.f);
        L.state = 'AT_PORT';
        yield { op: 'wait', t: c.liftShelf };
        sim.unloadIn(L, cs);
      }
      yield* liftTo(sim, L, -1);
    }
  };
  // An output lift: fetches its cell's next case from whichever level's
  // transfer shelf it is on, and the ones after it as far as they are
  // already waiting, then puts them on the conveyor down to the cell in
  // that order.
  T.OUTLIFT = function* (sim, L) {
    const c = sim.cfg, cell = L.cell;
    for (;;) {
      let cs = null;
      L.state = 'IDLE';
      yield { op: 'until', fn: () => !!(cs = cell.bySeq.get(cell.liftSeq)) };
      yield* liftTo(sim, L, cs.f);
      L.state = 'AT_PORT';
      yield { op: 'until', fn: () => cs.state === 'SLOT', waitState: 'WAITING_PORT' };
      for (;;) {
        yield { op: 'wait', t: c.liftShelf };
        sim.loadOut(L, cs);
        const nx = cell.bySeq.get(cell.liftSeq);
        if (L.load.length >= c.liftCap || !nx || nx.state !== 'SLOT') break;
        cs = nx;
        yield* liftTo(sim, L, cs.f);
        L.state = 'AT_PORT';
      }
      yield* liftTo(sim, L, -1);
      while (L.load.length) {
        L.state = 'HANDLING';
        yield { op: 'until', fn: () => cell.feed.room(L.load[0].len / 2, L.load[0].len), waitState: 'WAITING_PORT' };
        yield { op: 'wait', t: c.liftUnload };
        sim.unloadOut(L);
      }
    }
  };
  // A depalletising arm: takes the top case off the pallet in its cell onto the conveyor.
  T.DEPAL = function* (sim, A) {
    const c = sim.cfg, cell = A.cell, out = cell.feed;
    for (;;) {
      A.state = 'IDLE';
      yield { op: 'until', fn: () => cell.pal && cell.inT <= 0 && cell.pal.left > 0 };
      const cs = cell.pal.cases[cell.pal.left - 1];
      yield { op: 'until', fn: () => out.room(cs.len / 2, cs.len), waitState: 'WAITING_PORT' };
      sim.armTakes(A, cs);
      yield { op: 'wait', t: c.depalTime };
      sim.depalPut(A, cs);
    }
  };
  // A palletising arm: places the next case in sequence where the plan says.
  T.PALLETISE = function* (sim, A) {
    const c = sim.cfg, cell = A.cell, feed = cell.feed;
    for (;;) {
      A.state = 'IDLE';
      yield { op: 'until', fn: () => cell.build && cell.inT <= 0 && cell.build.placed < cell.build.items.length };
      yield { op: 'until', fn: () => feed.atEnd(feed.front), waitState: 'WAITING_PORT' };
      const it = feed.front, cs = it.c;
      if (cs.seq !== cell.build.items[cell.build.placed].seq) throw new Error(`${cell.name}: case ${cs.seq} arrived for place ${cell.build.items[cell.build.placed].seq}`);
      feed.take();
      sim.armTakes(A, cs);
      yield { op: 'wait', t: c.palletTime };
      sim.palletPut(A, cs);
    }
  };
  // The forklift at the inbound door: from the truck to the pallet conveyor.
  T.FORK = function* (sim, F) {
    const c = sim.cfg, G = sim.G, line = sim.palLine, turn = Math.PI / 2;
    const fore = 1.25; // m from its centre to the middle of a pallet on its forks
    for (;;) {
      F.state = 'IDLE';
      const tr = () => sim.inTruck && sim.inTruck.state === 'DOCKED' && sim.inTruck.pallets.length;
      yield { op: 'until', fn: () => tr() && line.room(0.65, 1.3) };
      const pal = sim.inTruck.pallets[sim.inTruck.pallets.length - 1], spot = sim.truckSpot(sim.inTruck.pallets.length - 1);
      F.state = 'MOVING_TO_TARGET';
      yield { op: 'travel', prop: 'a', to: near(F.a, -Math.PI / 2), v: turn, a: turn * 2 };
      yield { op: 'travel', prop: 'x', to: G.XW + 1.2, v: 2.2, a: 1 };
      yield { op: 'travel', prop: 'y', to: spot.y, v: 1, a: 1 };
      yield { op: 'travel', prop: 'x', to: spot.x + fore, v: 1.6, a: 1 };
      F.state = 'HANDLING';
      yield { op: 'travel', prop: 'fork', to: 1, v: 0.5, a: 1 };
      sim.inTruck.pallets.pop(); F.pal = pal; pal.where = 'fork';
      F.state = 'TRANSPORTING_TO_PORT';
      yield { op: 'travel', prop: 'x', to: G.XW + 1.2, v: 1.6, a: 1 };
      yield { op: 'travel', prop: 'y', to: G.yPL, v: 1, a: 1 };
      yield { op: 'travel', prop: 'a', to: near(F.a, Math.PI / 2), v: turn, a: turn * 2 };
      yield { op: 'until', fn: () => line.room(0.65, 1.3), waitState: 'WAITING_PORT' };
      yield { op: 'travel', prop: 'x', to: line.pts[0].x + 0.65 - fore, v: 1.6, a: 1 };
      F.state = 'HANDLING';
      yield { op: 'travel', prop: 'fork', to: 0, v: 0.5, a: 1 };
      F.pal = null; pal.where = 'line'; line.put({ pal, len: 1.3 }, 0.65); F.moves++;
      F.state = 'MOVING_TO_TARGET';
      yield { op: 'travel', prop: 'x', to: G.XW + 1.2, v: 1.2, a: 1 };
      if (sim.inTruck && sim.inTruck.state === 'DOCKED' && !sim.inTruck.pallets.length) sim.truckEmpty();
    }
  };

  // ---------------------------------------------------------------- simulation
  class CaseSim extends WS.Sim {
    get kind() { return 'case'; }
    get terms() { return TERMS; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    get taskTypes() { return T; }
    get armsAllowed() { return false; }
    get floorNames() { return Array.from({ length: this.cfg.levels }, (_, f) => 'L' + (f + 1)); }
    defaults() { return WS.CASE_CONFIG; }
    createGrid() {
      const c = this.cfg, G = (this.G = geometry(c)), m = (this.map = new CaseMap(this, G));
      const cells = (x, y) => { const out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push({ x: Math.floor(x - m.X0) + dx, y: Math.floor(y - m.Y0) + dy }); return out; };
      G.depX.forEach((x, k) => m.ports.push({ kind: 'DEPAL', role: 'depal', k, face: 'front', drop: { x, y: G.yDepPal }, lift: { x, y: G.yDepPal }, cells: cells(x, G.yDepPal) }));
      G.cellX.forEach((x, k) => m.ports.push({ kind: 'PAL', role: 'pal', k, face: 'front', drop: { x: x + 0.35, y: G.yBuild }, lift: { x: x + 0.35, y: G.yBuild }, cells: cells(x + 0.35, G.yBuild) }));
      return m;
    }
    createPort(k, def) { return new Cell(this, k, def); }
    describe() { const c = this.cfg; return `Case DC online · ${c.levels} levels × ${c.aisles} aisles · ${this.botList.length} bots · ${c.inLifts} input and ${c.palletCells} output lifts · ${c.depalCells} depalletisers · ${c.palletCells} palletisers`; }
    storageCapacity() { return Math.round(this.shelves.length * this.shelfLen / 0.33); }
    fetchCost() { return 0; }
    clock(t = this.time) { return t + this.cfg.dayStart; }
    get depals() { return this.ports.filter((p) => p.role === 'depal'); }
    get cells() { return this.ports.filter((p) => p.role === 'pal'); }
    breakTargets() { return []; }

    seed() {
      const c = this.cfg, G = this.G;
      this.stats = { depal: 0, stored: 0, palletised: 0, pallets: 0, palletsShipped: 0, orders: 0, shipped: 0, trucksIn: 0, trucksOut: 0, palletsIn: 0, cycle: [], built: [], shorts: 0, seqWait: 0 };
      this.caseById = new Map(); this.palletById = new Map(); // for the inspectors and the scan field
      this.caseSeq = 1; this.palSeq = 1; this.orderSeq = 1; this.orders = []; this.inQueue = []; this.trucks = []; this.inTruck = null;
      this.catalogue();
      this.buildStructure();
      this.buildConveyors();
      // the fleet: bots on every level, lifts, an arm per cell, the forklift
      this.botList = []; this.inLifts = []; this.outLifts = [];
      for (let f = 0; f < c.levels; f++) for (let k = 0; k < c.botsPerLevel; k++) {
        const b = this.addFleet(new Bot(this, this.fleet.length, f, k, this.levels[f].parks[k]));
        this.levels[f].bots.push(b); this.botList.push(b);
      }
      G.inX.forEach((x, k) => this.inLifts.push(this.addFleet(new Lift(this, this.fleet.length, k, false, x))));
      G.outX.forEach((x, k) => { const L = this.addFleet(new Lift(this, this.fleet.length, k, true, x)); L.cell = this.cells[k]; this.cells[k].lift = L; this.outLifts.push(L); });
      this.depals.forEach((p, k) => new Arm(this, -1, p, { x: G.depX[k] + 1.15, y: G.yDepOut + 0.45 }));
      this.cells.forEach((p, k) => new Arm(this, -1, p, { x: G.cellX[k] - 0.55, y: G.yE - 0.15 }));
      for (const p of this.ports) { p.robot.id = this.fleet.length; this.addFleet(p.robot); }
      this.fork = this.addFleet(new Forklift(this, this.fleet.length, G.XW + 1.2, G.yPL));
      // run them
      for (const b of this.botList) b.run(T.BOT(this, b));
      for (const L of this.inLifts) L.run(T.INLIFT(this, L));
      for (const L of this.outLifts) L.run(T.OUTLIFT(this, L));
      for (const p of this.depals) p.robot.run(T.DEPAL(this, p.robot));
      for (const p of this.cells) p.robot.run(T.PALLETISE(this, p.robot));
      this.fork.run(T.FORK(this, this.fork));
      this.paintMap();
      this.stockUp();
      // the day starts with a truck at the door and a few store orders in
      this.reorder();
      this.truckAt = 0;
      this.orderGap = -Math.log(1 - this.rng()) / Math.max(1e-9, c.orderRate / 3600); this.orderAcc = 0;
      for (let k = 0; k < 4; k++) this.newOrder();
      this.log('system', `06:00 · ${this.stockCount()} cases in the structure, ${this.skus.length} products, ${this.orders.length} store orders in`);
    }
    addFleet(m) { this.fleet.push(m); return m; }

    // ---------------------------------------------------------------- products
    catalogue() {
      const c = this.cfg, rng = this.rng, tot = FAMS.reduce((s, f) => s + f.w, 0);
      this.skus = []; this.skuByGtin = new Map();
      FAMS.forEach((F, fi) => {
        const n = Math.max(1, Math.round((c.skus * F.w) / tot));
        for (let k = 0; k < n; k++) {
          const j = k % F.v.length, vary = (x, r) => Math.round(x * (1 - r + 2 * r * rng()) * 100) / 100;
          let L = vary(F.d[0], 0.07), W = vary(F.d[1], 0.07);
          if (W > L) [L, W] = [W, L];
          const id = this.skus.length, brand = Math.floor(k / F.v.length);
          const p = { id, fam: F, fi, name: `${F.n} ${F.v[j]}${brand ? ' · ' + ['house brand', 'premium', 'organic', 'value'][(brand - 1) % 4] : ''}`, aisle: F.a, L, W, H: vary(F.d[2], 0.06), kg: Math.round(F.kg * (0.92 + 0.16 * rng()) * 10) / 10, crush: F.crush, look: F.look, color: F.col[j], gtin: WS.Barcode.makeGTIN13(70000 + id) };
          p.demand = 0; p.stock = 0; p.coming = 0; p.alloc = 0; p.cases = new Set(); p.lv = new Array(c.levels).fill(0); p.out = 0; p.inb = 0;
          this.skus.push(p); this.skuByGtin.set(p.gtin, p);
        }
      });
      // demand: a long tail, in a random order of products
      const order = this.skus.slice();
      for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
      order.forEach((p, r) => (p.demand = 1 / Math.pow(r + 4, 0.85)));
      const dt = this.skus.reduce((s, p) => s + p.demand, 0), rank = this.skus.slice().sort((a, b) => b.demand - a.demand);
      rank.forEach((p, r) => { p.share = p.demand / dt; p.cls = r < rank.length * 0.2 ? 'A' : r < rank.length * 0.5 ? 'B' : 'C'; });
      this.demandTot = dt;
      this.demandRates();
      for (const p of this.skus) {
        // a supplier's pallet: as many cases a layer as fit either way round, layers up to 1.5 m
        const a = Math.floor(1.2 / p.L) * Math.floor(1.0 / p.W), b = Math.floor(1.2 / p.W) * Math.floor(1.0 / p.L);
        p.rot = b > a; p.perLayer = Math.max(1, Math.max(a, b)); p.layers = Math.max(1, Math.min(8, Math.floor(1.5 / p.H)));
        p.palletCases = p.perLayer * p.layers;
      }
    }
    // cases an hour each product sells, and its reorder point, from the settings now
    demandRates() { const c = this.cfg; for (const p of this.skus) { p.rate = p.share * c.orderRate * c.orderCases; p.rop = Math.max(6, Math.ceil(c.coverHours * p.rate)); } }
    newCase(p) { const cs = { id: this.caseSeq++, p, state: 'NEW', len: p.L, f: -1, shelf: null, entry: null }; this.caseById.set(cs.id, cs); return cs; }

    // ---------------------------------------------------------------- the structure
    buildStructure() {
      const c = this.cfg, G = this.G;
      this.shelves = []; this.levels = [];
      for (let f = 0; f < c.levels; f++) {
        const lv = { f, bots: [], tasks: [], aisleBy: new Array(G.A).fill(null), liftBy: new Map(), claims: [], shelves: [], aisles: [], parks: [], lifts: new Map() };
        for (let k = 0; k < G.A; k++) {
          lv.aisles.push({ kind: 'aisle', k, x: G.ax(k), py: G.yM, lock: 'a' + k });
          for (const s of [-1, 1]) { const sh = { id: this.shelves.length, f, k, s, x: G.shelfX(k, s), items: [], used: 0, ver: 0 }; this.shelves.push(sh); lv.shelves.push(sh); }
        }
        G.parkX.forEach((x, k) => lv.parks.push({ kind: 'park', k, x, py: G.yP, lock: 'p' + k }));
        this.levels.push(lv);
      }
      this.shelfLen = G.AL - U0 - U1;
    }
    // a pocket on the deck in front of a lift's transfer shelf place j
    liftDest(f, L, j) {
      const lv = this.levels[f], key = L.id + ':' + j;
      let d = lv.lifts.get(key);
      if (!d) { d = { kind: 'lift', L, j, x: this.G.slotX(L.x, j), py: this.G.yP, lock: 'L' + L.id }; lv.lifts.set(key, d); }
      return d;
    }
    aisleDest(f, k) { return this.levels[f].aisles[k]; }
    placeFree(b, d) {
      const lv = this.levels[b.level];
      if (d.kind === 'aisle') { const o = lv.aisleBy[d.k]; return !o || o === b; }
      if (d.kind === 'lift') { const o = lv.liftBy.get(d.lock); return !o || o === b; }
      return true;
    }
    // The place d and the way there, both free: they are the bot's until it
    // gets there. The deck has two lanes, the north one (by the aisles)
    // westbound and the south one (by the lifts) eastbound. A bot needs its
    // lane from here to there, and the other lane only where it crosses it:
    // going east from an aisle, or west from the south side, at the start;
    // going east to an aisle, or west to the south side, at the end.
    claim(b, d) {
      if (!this.placeFree(b, d)) return false;
      const lv = this.levels[b.level], M = 0.75, x0 = b.x, x1 = d.x, north = (p) => p.kind === 'aisle';
      const east = x1 > x0, lane = east ? 1 : 0, other = 1 - lane, segs = [{ lane, lo: Math.min(x0, x1) - M, hi: Math.max(x0, x1) + M }];
      const q = { b, lane, east, segs, cross0: null, moving: false };
      if (Math.abs(x1 - x0) < 1e-6) { if (north(b.at) !== north(d)) segs.push({ lane: other, lo: x0 - M, hi: x0 + M }); }
      else {
        if (north(b.at) === east) segs.push((q.cross0 = { lane: other, lo: x0 - M, hi: x0 + M }));
        if (north(d) === east) segs.push({ lane: other, lo: x1 - M, hi: x1 + M });
      }
      for (const o of lv.claims) {
        if (o.b === b) continue;
        for (const a of o.segs) for (const s of segs) if (a.lane === s.lane && a.hi > s.lo && a.lo < s.hi) return false;
      }
      lv.claims.push(q); b.claim = q;
      if (d.kind === 'aisle') lv.aisleBy[d.k] = b; else if (d.kind === 'lift') lv.liftBy.set(d.lock, b);
      return true;
    }
    unclaim(b) { const lv = this.levels[b.level]; lv.claims = lv.claims.filter((q) => q.b !== b); b.claim = null; }
    unlock(b, d) {
      const lv = this.levels[b.level];
      if (d.kind === 'aisle' && lv.aisleBy[d.k] === b) lv.aisleBy[d.k] = null;
      else if (d.kind === 'lift' && lv.liftBy.get(d.lock) === b) lv.liftBy.delete(d.lock);
    }
    // The gap on a shelf for a case w wide, by the storage policy: the
    // smallest it fits (best fit) or the one nearest the deck. Returns
    // { a, gap } or null.
    gapOn(sh, w, cls) {
      const need = w + GAP, best = this.cfg.storagePolicy === 'nearest' ? 'near' : 'fit', k = { A: 0.05, B: 0.015, C: 0.002 }[cls] || 0.002;
      let prev = U0, out = null;
      // best fit: a gap the case fills best, but any gap more than 60 cm too big is just open shelf;
      // fast movers near the deck: a metre further in costs as much as 5 cm of gap left over (A), 1.5 cm (B)
      const try1 = (a, b) => { const g = b - a; if (g + 1e-9 < need) return; const sc = best === 'near' ? a : Math.min(g - need, 0.6) + a * k; if (!out || sc < out.sc) out = { a, gap: g, sc }; };
      for (const e of sh.items) { try1(prev, e.a); prev = e.b; }
      try1(prev, U0 + this.shelfLen);
      return out;
    }
    // A place for a case: the level with the fewest of its product and the
    // least to do, then the aisle and gap by the storage policy.
    assign(cs, quiet) {
      const c = this.cfg, G = this.G, p = cs.p, lx = G.inX[Math.floor(G.inX.length / 2)];
      const lvs = this.levels.slice().sort((a, b) => this.levelScore(a, p) - this.levelScore(b, p));
      for (const lv of lvs) {
        let best = null;
        for (const sh of lv.shelves) {
          const g = this.gapOn(sh, p.W, p.cls);
          if (!g) continue;
          // and the emptier shelves, so all aisles fill alike
          const sc = g.sc + (sh.used / this.shelfLen) * (c.storagePolicy === 'nearest' ? 4 : 0.8) + Math.abs(G.ax(sh.k) - lx) * (c.storagePolicy === 'nearest' ? 0.3 : 0.004);
          if (!best || sc < best.sc) best = { sh, a: g.a, sc };
        }
        if (!best) continue;
        const sh = best.sh, e = { a: best.a, b: best.a + p.W + GAP, c: cs };
        let k = 0; while (k < sh.items.length && sh.items[k].a < e.a) k++;
        sh.items.splice(k, 0, e); sh.used += e.b - e.a; sh.ver++;
        Object.assign(cs, { shelf: sh, entry: e, f: lv.f, k: sh.k, x: sh.x, y: G.yS - (e.a + p.W / 2) });
        p.lv[lv.f]++;
        void quiet;
        return true;
      }
      return false;
    }
    levelScore(lv, p) { let st = 0; for (const t of lv.tasks) if (t.type === 'store') st++; return p.lv[lv.f] * 3 + st * 0.6 + this.levelFill(lv) * 6; }
    levelFill(lv) { let u = 0; for (const sh of lv.shelves) u += sh.used; return u / (lv.shelves.length * this.shelfLen); }
    shelfFill(s) { const k = s >> 1, side = s & 1; let u = 0, n = 0; for (const sh of this.shelves) if (sh.k === k && (sh.s > 0 ? 1 : 0) === side) { u += sh.used; n++; } return n ? u / (n * this.shelfLen) : 0; }
    unshelve(cs) { const sh = cs.shelf, e = cs.entry, k = sh.items.indexOf(e); if (k >= 0) sh.items.splice(k, 1); sh.used -= e.b - e.a; sh.ver++; cs.shelf = null; cs.entry = null; cs.p.lv[cs.f]--; }
    // the morning's stock: every product up to its reorder point and some way into a pallet, as far as stockFill allows
    stockUp() {
      const c = this.cfg, rng = this.rng, want = this.skus.map((p) => p.rop + Math.floor(rng() * p.palletCases * 0.7));
      const len = this.skus.reduce((s, p, k) => s + want[k] * (p.W + GAP), 0), room = c.stockFill * this.shelves.length * this.shelfLen, f = Math.min(1, room / len);
      const all = [];
      this.skus.forEach((p, k) => { const n = Math.max(1, Math.round(want[k] * f)); for (let q = 0; q < n; q++) all.push(p); });
      for (let k = all.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [all[k], all[j]] = [all[j], all[k]]; }
      for (const p of all) { const cs = this.newCase(p); if (!this.assign(cs, true)) break; cs.state = 'STORED'; p.stock++; p.cases.add(cs); }
    }
    stockCount() { let n = 0; for (const p of this.skus) n += p.stock; return n; }

    // ---------------------------------------------------------------- conveyors
    buildConveyors() {
      const c = this.cfg, G = this.G, yI = G.yI, nIn = G.inX.length;
      this.convs = [];
      const conv = (name, pts, v, gap) => { const q = new Conveyor(name, pts, v, gap); this.convs.push(q); return q; };
      // inbound: the pallet conveyor from the door past the depalletisers
      const lastD = G.depX[G.depX.length - 1];
      this.palLine = conv('Pallet infeed', [{ x: G.XW + 2.6, y: G.yPL }, { x: lastD, y: G.yPL }], 0.4, 0.1);
      // A pallet turns into a depalletiser only when that one will be ready for it soon;
      // otherwise it goes on to the next one, or waits here if a pallet waits there already.
      // So each cell has one pallet in front of it, and none is promised to a busy cell early.
      this.depals.forEach((cell, k) => {
        cell.s = G.depX[k] - G.XW - 2.6;
        this.palLine.exits.push({ s: cell.s, want: () => this.depalWants(cell), hold: () => k < this.depals.length - 1 && !this.lineFree(cell.s, this.depals[k + 1].s), take: (it) => { cell.next = it.pal; it.pal.where = 'next'; it.pal.cell = cell; it.pal.t0 = this.time; return true; } });
      });
      this.palLine.exits.sort((a, b) => a.s - b.s);
      // the case conveyor: past the depalletisers, through the tunnel, to the input lifts
      this.mainLine = conv('Case infeed', [{ x: G.depX[0] - 1, y: yI }, { x: G.inX[nIn - 1], y: yI }, { x: G.inX[nIn - 1], y: G.yBase }], 0.8, 0.06);
      this.depals.forEach((cell, k) => {
        const x = G.depX[k], q = conv('Outfeed D' + (k + 1), [{ x, y: G.yDepOut }, { x, y: yI }], 0.8, 0.06);
        q.to(this.mainLine, x - (G.depX[0] - 1));
        cell.feed = q;
        // a zip merge: a case coming along the main line waits for one taken off earlier that waits to join
        this.mainLine.gates.push({ s: x - (G.depX[0] - 1) - 0.6, pass: (it) => { const f = q.front; return !(f && q.atEnd(f) && f.t < it.t); } });
      });
      this.tunnelS = G.tunnelX - (G.depX[0] - 1);
      this.mainLine.gates.push({ s: this.tunnelS, pass: (it) => it.c.dest || this.measure(it.c) });
      this.spurs = this.inLiftSpurs = [];
      G.inX.forEach((x, k) => {
        if (k === nIn - 1) { this.spurs.push(this.mainLine); return; }
        const q = conv('Spur ' + (k + 1), [{ x, y: yI }, { x, y: G.yBase }], 0.8, 0.06);
        this.mainLine.to(q, 0, x - (G.depX[0] - 1), (it) => it.c.route === k);
        this.spurs.push(q);
      });
      // outbound: from each output lift down to its palletiser
      G.outX.forEach((x, k) => {
        const cx = G.cellX[k] - 1.7, h = yI + 0.9 - 0.6 * k;
        this.cells[k].feed = conv('Infeed C' + (k + 1), [{ x, y: G.yBase }, { x, y: h }, { x: cx, y: h }, { x: cx, y: G.yE }], 0.8, 0.05);
      });
      // finished pallets: out of each cell to the collector, the wrapper, the labeller, along the doors
      this.collector = conv('Collector', [{ x: G.cellX[0] + 0.35, y: G.yC }, { x: G.xWr, y: G.yC }], 0.4, 0.15);
      this.cells.forEach((cell, k) => {
        const x = G.cellX[k] + 0.35, q = conv('Out C' + (k + 1), [{ x, y: G.yBuild }, { x, y: G.yC }], 0.4, 0.15);
        q.to(this.collector, x - (G.cellX[0] + 0.35));
        cell.out = q;
      });
      this.labelLine = conv('To the labeller', [{ x: G.xWr - 1.3, y: G.yC }, { x: G.xLb, y: G.yC }], 0.4, 0.15);
      // from the labeller round and west along the doors, each door's line south through the wall into its truck
      this.distLine = conv('To the doors', [{ x: G.xLb - 1.3, y: G.yC }, { x: G.xT, y: G.yC }, { x: G.xT, y: G.yDist }, { x: G.doorX[0], y: G.yDist }], 0.4, 0.15);
      this.doorLines = G.doorX.map((x, k) => conv('Door ' + (k + 1), [{ x, y: G.yDist }, { x, y: G.yWall + 0.4 }], 0.4, 0.15));
      G.doorX.forEach((x, k) => this.distLine.to(this.doorLines[k], 0, k === 0 ? this.distLine.len : this.distLine.sOf(x, G.yDist), (it) => it.pal.cell.k === k));
      this.wrapper = { pal: null, t: 0, wraps: 0 }; this.labeller = { pal: null, t: 0 };
      this.doors = G.doorX.map((x, k) => ({ k, x, truck: null, gapT: 0, loading: null }));
    }
    paintMap() {
      const G = this.G, m = this.map;
      m.fill(G.XW, G.yN, G.XE, G.yWall, K.HALL);
      for (let k = 0; k < G.A; k++) { m.fill(G.ax(k) - G.AW / 2, 0, G.ax(k) + G.AW / 2, G.yS, K.AISLE); for (const s of [-1, 1]) { const x0 = s < 0 ? G.ax(k) - G.AW / 2 - G.RD : G.ax(k) + G.AW / 2; m.fill(x0, 0, x0 + G.RD, G.yS, K.SHELF, k * 2 + (s > 0 ? 1 : 0)); } }
      m.fill(G.DX0, G.yS, G.DX1, G.yD, K.DECK);
      for (const x of [...G.inX, ...G.outX]) m.fill(x - 1, G.yD, x + 1, G.yBase, K.LIFT);
      for (const q of this.convs) m.line(q);
      for (const p of this.ports) for (const cl of p.cells) { const i = m.idx(cl.x, cl.y); if (m.inside(cl.x, cl.y)) m.kind[i] = K.CELL; }
      for (const x of G.doorX) m.fill(x - 1.5, G.yWall, x + 1.5, G.yWall + 14, K.TRUCK);
      m.fill(G.XW - 14, G.yPL - 1.5, G.XW, G.yPL + 1.5, K.TRUCK);
    }
    // As a case passes the tunnel: measured, given its place and an input lift.
    measure(cs) {
      if (!this.assign(cs)) return false;
      cs.dest = { f: cs.f };
      const n = (k) => { let x = this.inLifts[k].load.length + (this.spurs[k] === this.mainLine ? 0 : this.spurs[k].items.length); for (const it of this.mainLine.items) if (it.c.route === k) x++; return x; };
      let best = 0; for (let k = 1; k < this.spurs.length; k++) if (n(k) < n(best)) best = k;
      cs.route = best; cs.state = 'CONV';
      return true;
    }

    // ---------------------------------------------------------------- inbound
    // Pallets are ordered for products below their reorder point, and come
    // on the next truck, as long as the structure has room for them.
    reorder() {
      this.demandRates();
      let len = 0; for (const p of this.skus) len += (p.stock + p.coming) * (p.W + GAP);
      const room = 0.92 * this.shelves.length * this.shelfLen;
      for (const p of this.skus.slice().sort((a, b) => this.cover(a) - this.cover(b))) {
        while (p.cases.size + p.coming - p.alloc < p.rop && len + p.palletCases * (p.W + GAP) < room) { p.coming += p.palletCases; p.inb++; this.inQueue.push(p); len += p.palletCases * (p.W + GAP); }
      }
    }
    // hours of demand in stock, after what orders have taken (below zero: orders wait for it)
    cover(p) { return (p.cases.size - p.alloc) / Math.max(0.1, p.rate); }
    newPallet(p) {
      const id = this.palSeq++, pal = { id, inbound: true, sscc: WS.Barcode.makeSSCC(100000 + id), p, cases: [], left: p.palletCases, where: 'truck' };
      this.palletById.set(id, pal);
      const L = p.rot ? p.W : p.L, W = p.rot ? p.L : p.W, nx = Math.floor(1.2 / L), ny = Math.floor(1.0 / W);
      for (let z = 0; z < p.layers; z++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const cs = this.newCase(p);
        cs.state = 'INBOUND'; cs.pal = pal; cs.pos = { u: (i + 0.5) * L - (nx * L) / 2, v: (j + 0.5) * W - (ny * W) / 2, z: z * p.H, rot: p.rot };
        pal.cases.push(cs);
      }
      return pal;
    }
    stepInbound(dt) {
      const c = this.cfg, tr = this.inTruck;
      if (!tr && this.time >= this.truckAt && this.inQueue.length) {
        // the most urgent first: products orders are waiting for, then the least cover
        this.inQueue.sort((a, b) => this.cover(a) - this.cover(b));
        const pals = this.inQueue.splice(0, c.truckPallets).map((p) => this.newPallet(p));
        this.inTruck = { id: this.stats.trucksIn + 1, pallets: pals, state: 'ARRIVING', t: 25, n: pals.length };
        this.stats.trucksIn++;
        this.log('inbound', `Truck ${this.inTruck.id} at the inbound door with ${pals.length} pallets`);
        this.truckAt = this.time + c.truckEvery * 60;
      }
      if (tr && tr.t > 0) {
        tr.t -= dt;
        if (tr.t <= 0) { if (tr.state === 'ARRIVING') tr.state = 'DOCKED'; else if (tr.state === 'LEAVING') this.inTruck = null; }
      }
    }
    truckEmpty() { const tr = this.inTruck; tr.state = 'LEAVING'; tr.t = 25; this.log('inbound', `Truck ${tr.id} unloaded, leaving`); }
    // where pallet k stands in the inbound trailer: two abreast from the doors back
    truckSpot(k) { const G = this.G; return { x: G.XW - 1.05 - Math.floor(k / 2) * 1.22, y: G.yPL + (k % 2 ? 0.55 : -0.55) }; }
    armTakes(A, cs) {
      A.c = cs; cs.state = 'ARM'; A.state = 'HANDLING';
      A.cyc = { t0: this.time, d: A.cell.role === 'depal' ? this.cfg.depalTime : this.cfg.palletTime };
    }
    depalPut(A, cs) {
      const cell = A.cell;
      A.c = null; A.cyc = null; A.cases++; cell.cases++; cell.stats.lines++;
      cell.feed.put({ c: cs, len: cs.len, t: this.time }, cs.len / 2);
      cs.state = 'CONV'; cs.pal = null; cell.pal.left--;
      this.stats.depal++; this.kpi.presented++; this.kpi.push('presented');
      if (!cell.pal.left) {
        cell.pal.where = 'empty'; this.palletById.delete(cell.pal.id); cell.pal = null; cell.empties++; this.stats.palletsIn++;
        if (cell.empties >= 12) cell.empties = 0; // a full stack of empties is taken away
      }
    }
    // s from now until a depalletiser can start on a new pallet: the cases left on
    // its pallet at the pace it has managed lately, held up by a full outfeed included
    depalStart(cell) {
      if (cell.robot.down) return Infinity;
      if (!cell.pal) return cell.next || cell.back ? Infinity : 0;
      const busy = cell.hb + cell.wb, slow = busy < 0.05 ? 1 : Math.min(4, busy / Math.max(cell.hb, 0.05));
      return cell.pal.left * this.cfg.depalTime * slow + 4;
    }
    depalWants(cell) { return !cell.next && !cell.back && this.depalStart(cell) <= 20; }
    // no pallet on the pallet conveyor after s0 up to s1
    lineFree(s0, s1) { return !this.palLine.items.some((it) => it.s > s0 + 0.01 && it.s <= s1 + 0.01); }
    // where a depalletiser's waiting pallet could go instead: a cell further along the line
    // that starts on it sooner, with the line clear up to it (the conveyor runs one way)
    depalBetter(cell) {
      const v = this.palLine.v, wait = this.depalStart(cell);
      let best = null, bt = wait - 30;
      for (const d of this.depals) {
        if (d.s <= cell.s || d.next || d.back || !this.lineFree(cell.s, d.s)) continue;
        const t = Math.max(this.depalStart(d), (d.s - cell.s) / v + 7);
        if (t < bt) { bt = t; best = d; }
      }
      return best;
    }
    canSendBack(cell) { return !!cell.next && !cell.back && cell !== this.depals[this.depals.length - 1] && this.palLine.room(cell.s, 1.3); }
    // the waiting pallet rolls back onto the pallet conveyor and goes on along it
    sendBack(cell, why) {
      if (!this.canSendBack(cell)) return false;
      const pal = cell.next;
      cell.back = { pal, t: 3 }; cell.next = null; pal.where = 'back';
      this.log('inbound', `Supplier pallet ${pal.id} (${pal.p.name}) back onto the line from ${cell.name}${why ? ': ' + why : ''}`);
      return true;
    }
    stepDepal(dt) {
      const f = Math.exp(-dt / 300); // how the arm has spent the last 5 minutes or so
      for (const cell of this.depals) {
        const st = cell.robot.displayState;
        cell.hb = (cell.hb || 0) * f + (st === 'HANDLING' ? 1 - f : 0);
        cell.wb = (cell.wb || 0) * f + (st === 'WAITING_PORT' ? 1 - f : 0);
      }
      for (const cell of this.depals) {
        // a waiting pallet moves up once the last one is empty
        if (!cell.pal && cell.next && !cell.robot.down && this.time - cell.next.t0 > 4) { cell.pal = cell.next; cell.next = null; cell.pal.where = 'cell'; cell.inT = 4; }
        if (cell.back) {
          const b = cell.back;
          if ((b.t -= dt) <= 0 && this.palLine.room(cell.s, 1.3)) { this.palLine.put({ pal: b.pal, len: 1.3 }, cell.s); b.pal.where = 'line'; b.pal.cell = null; cell.back = null; }
        }
        // one that would wait long here goes on to a cell further along that is ready sooner
        if (cell.next && this.time - cell.next.t0 > 4 && this.canSendBack(cell)) {
          const d = this.depalBetter(cell);
          if (d) this.sendBack(cell, cell.robot.down ? 'the arm is down' : `${d.name} is free sooner`);
        }
      }
    }
    // the case at the end of a spur, if its level's transfer shelf has a place for it
    inReady(L) {
      if (L.down) return false;
      const q = this.spurs[L.k], it = q.front;
      if (!q.atEnd(it) || it.c.route !== L.k) return false;
      return L.slots[it.c.dest.f].some((s) => !s.c && !s.res);
    }
    loadIn(L) {
      const it = this.spurs[L.k].take(), cs = it.c, sl = L.slots[cs.dest.f];
      const j = sl.findIndex((s) => !s.c && !s.res);
      sl[j].res = cs; cs.slotJ = j; cs.state = 'LIFT'; cs.lift = L; L.load.push(cs);
    }
    unloadIn(L, cs) {
      L.load.shift();
      const s = L.slots[cs.dest.f][cs.slotJ];
      s.res = null; s.c = cs; cs.state = 'SLOT'; cs.lift = null;
      this.levels[cs.f].tasks.push({ type: 'store', c: cs, k: cs.k, L, j: cs.slotJ, f: cs.f, t: this.time });
    }

    // ---------------------------------------------------------------- the bots' tasks
    // A free bot takes, in this order: a case its output lift needs soon; a
    // case waiting on an input shelf; any other case to fetch. One already
    // in an aisle prefers a task in that aisle (a dual cycle).
    takeTask(b) {
      if (b.down) return null;
      const lv = this.levels[b.level], ts = lv.tasks;
      if (!ts.length) return null;
      let bi = -1, bs = -Infinity;
      for (let i = 0; i < ts.length; i++) {
        const t = ts[i], o = lv.aisleBy[t.k];
        if (o && o !== b) continue;
        let s;
        if (t.type === 'fetch') { const ahead = t.seq - t.cell.liftSeq; s = ahead < 6 ? 400 - ahead : 150 - ahead; }
        else s = 250 + (this.time - t.t) * 0.2;
        if (b.at.kind === 'aisle' && b.at.k === t.k) s += 80;
        s -= Math.abs(b.x - t.c.x) * 0.5;
        if (s > bs) { bs = s; bi = i; }
      }
      return bi < 0 ? null : ts.splice(bi, 1)[0];
    }
    tookFromLift(b, t) { const s = t.L.slots[t.f][t.j]; s.c = null; b.c = t.c; t.c.state = 'BOT'; t.c.bot = b; }
    stored(b, t) {
      const cs = t.c, p = cs.p;
      b.c = null; cs.bot = null; cs.state = 'STORED'; cs.dest = null; cs.shelf.ver++;
      p.stock++; p.coming--; p.cases.add(cs);
      this.stats.stored++;
    }
    fetched(b, t) { const cs = t.c; this.unshelve(cs); cs.p.stock--; b.c = cs; cs.bot = b; cs.state = 'BOT'; }
    delivered(b, t) { const cs = t.c, s = t.L.slots[t.f][t.j]; b.c = null; cs.bot = null; s.res = null; s.c = cs; cs.state = 'SLOT'; }

    // ---------------------------------------------------------------- store orders
    newOrder() {
      const c = this.cfg, rng = this.rng, id = this.orderSeq++, target = Math.round(c.orderCases * (0.7 + 0.6 * rng()));
      const store = { no: 100 + ((id * 7) % c.stores), town: TOWNS[(id * 7) % c.stores % TOWNS.length] };
      const lines = [], used = new Set(), w = this.skus.map((p) => p.demand);
      let n = 0, guard = 0;
      while (n < target && guard++ < 600) {
        const p = this.skus[rng.weighted(w, this.demandTot)];
        if (used.has(p)) continue;
        used.add(p);
        const want = 1 + Math.floor(rng() * (p.cls === 'A' ? 8 : p.cls === 'B' ? 4 : 2)), free = p.cases.size + p.coming - p.alloc, q = Math.min(want, Math.max(0, free)); // stored and not yet released, or on its way
        if (q < want) this.stats.shorts += want - q;
        if (!q) continue;
        p.alloc += q; p.out += q; n += q;
        lines.push({ p, qty: q });
      }
      const list = [];
      for (const ln of lines) for (let k = 0; k < ln.qty; k++) list.push(ln.p);
      list.sort(ORDER[c.buildPolicy] || ORDER.blend);
      const plans = Planner.plan(list, c);
      if (!n) return null;
      const o = { id, code: 'SO-' + String(4000 + id), store, lines, cases: n, created: this.time, pallets: [], status: 'PLANNED', loaded: 0 };
      // the cell with least to do builds all of its pallets, for the door it serves
      const work = (cell) => cell.queue.reduce((s, p) => s + p.items.length, 0) + cell.active.reduce((s, p) => s + p.items.length - p.placed, 0);
      const cell = this.cells.reduce((a, b) => (work(b) < work(a) ? b : a));
      plans.forEach((pl, k) => {
        const pid = this.palSeq++;
        const pal = { id: pid, sscc: WS.Barcode.makeSSCC(500000 + pid), order: o, k, of: plans.length, cell, items: pl.items, kg: pl.kg, vol: pl.vol, top: pl.top, aisles: [...pl.aisles].sort((a, b) => a - b), placed: 0, state: 'QUEUED', where: 'queue' };
        o.pallets.push(pal); cell.queue.push(pal); this.palletById.set(pid, pal);
      });
      o.cell = cell; cell.orders.push(o);
      this.orders.push(o); this.stats.orders++;
      this.log('order', `${o.code} for store ${store.no} ${store.town}: ${n} cases of ${lines.length} products, planned on ${plans.length} pallet${plans.length === 1 ? '' : 's'} · ${cell.name}`);
      return o;
    }
    stepOrders(dt) {
      const c = this.cfg;
      if (c.orderRate <= 0) return;
      this.orderAcc += dt * this.disrupt.rateFactor;
      while (this.orderAcc >= this.orderGap) { this.orderAcc -= this.orderGap; this.orderGap = -Math.log(1 - this.rng()) / (c.orderRate / 3600); this.newOrder(); }
    }

    // ---------------------------------------------------------------- palletising cells
    // A cell keeps two pallets active (the one on the build spot and the
    // next) and releases their cases in build order: each to the stored case
    // of its product nearest the deck, with a place booked on the output
    // lift's transfer shelf of that case's level.
    stepCells() {
      for (const cell of this.cells) {
        while (cell.active.length < 2 && cell.queue.length) {
          const pal = cell.queue.shift();
          pal.state = 'RELEASED';
          for (const it of pal.items) { it.seq = cell.seqNext++; it.pal = pal; cell.toRelease.push(it); }
          cell.active.push(pal);
          if (!pal.order.started) { pal.order.started = this.time; pal.order.status = 'IN_PROGRESS'; }
        }
        // a new pallet comes in once the last has gone
        if (cell.coming) { if (cell.inT <= 0) { cell.build = cell.coming; cell.coming = null; cell.build.state = 'BUILDING'; cell.build.where = 'cell'; cell.build.t0 = this.time; } }
        else if (!cell.build && !cell.done && cell.active.length) { cell.coming = cell.active[0]; cell.inT = this.cfg.palletIn; }
        if (cell.done && cell.out.room(0, 1.3)) {
          const pal = cell.done;
          cell.out.put({ pal, len: 1.3 }, 0);
          pal.where = 'line'; pal.state = 'OUT'; cell.done = null;
        }
        this.release(cell);
      }
    }
    release(cell) {
      const L = cell.lift, W = this.cfg.seqWindow;
      while (cell.toRelease.length) {
        const it = cell.toRelease[0];
        if (it.seq - cell.liftSeq >= W) break;
        let best = null, bs = Infinity;
        for (const cs of it.p.cases) {
          if (!L.slots[cs.f].some((s) => !s.c && !s.res)) continue;
          const lv = this.levels[cs.f], sc = (this.G.yS - cs.y) / 5 + Math.abs(cs.x - L.x) / 6 + lv.tasks.length * 3;
          if (sc < bs) { bs = sc; best = cs; }
        }
        if (!best) break;
        const cs = best, sl = L.slots[cs.f], j = sl.findIndex((s) => !s.c && !s.res);
        sl[j].res = cs;
        it.p.cases.delete(cs); it.p.alloc--;
        Object.assign(cs, { state: 'RELEASED', seq: it.seq, item: it, cell, slotJ: j });
        it.c = cs;
        this.levels[cs.f].tasks.push({ type: 'fetch', c: cs, k: cs.k, L, j, f: cs.f, seq: it.seq, cell, t: this.time });
        cell.bySeq.set(it.seq, cs);
        cell.toRelease.shift();
      }
    }
    loadOut(L, cs) {
      const s = L.slots[cs.f][cs.slotJ];
      s.c = null; s.res = null;
      cs.state = 'LIFT'; cs.lift = L; L.load.push(cs);
      L.cell.bySeq.delete(cs.seq); L.cell.liftSeq++;
    }
    unloadOut(L) { const cs = L.load.shift(); cs.lift = null; cs.state = 'CONV'; L.cell.feed.put({ c: cs, len: cs.len }, cs.len / 2); }
    palletPut(A, cs) {
      const cell = A.cell, pal = cell.build;
      A.c = null; A.cyc = null; A.cases++; cell.cases++; cell.stats.lines++;
      cs.state = 'PALLET'; cs.palOut = pal; pal.placed++;
      this.stats.palletised++; this.kpi.linesPicked++; this.kpi.push('lines');
      if (pal.placed >= pal.items.length) {
        pal.state = 'DONE'; pal.t1 = this.time; cell.done = pal; cell.build = null; cell.active.shift();
        this.stats.pallets++; this.kpi.push('shipped');
        this.stats.built.push({ t: this.time, fill: pal.vol / (1.2 * 1.0 * this.cfg.palletHeight), n: pal.items.length, h: pal.top, kg: pal.kg, aisles: pal.aisles.length, sup: pal.items.reduce((s, it) => s + it.sup, 0) / pal.items.length });
        if (this.stats.built.length > 400) this.stats.built.shift();
        this.log('ship', `${cell.name} finished pallet ${pal.k + 1}/${pal.of} of ${pal.order.code}: ${pal.items.length} cases, ${pal.top.toFixed(2)} m, ${Math.round(pal.kg)} kg`);
      }
    }

    // ---------------------------------------------------------------- wrapping, labelling, the doors
    stepOutbound(dt) {
      const c = this.cfg, Wr = this.wrapper, Lb = this.labeller;
      const col = this.collector, ll = this.labelLine;
      if (!Wr.pal && col.atEnd(col.front)) { Wr.pal = col.take().pal; Wr.t = c.wrapTime; Wr.pal.where = 'wrapper'; Wr.pal.state = 'WRAP'; Wr.t0 = this.time; }
      if (Wr.pal) { Wr.t -= dt; if (Wr.t <= 0 && ll.room(0.65, 1.3)) { ll.put({ pal: Wr.pal, len: 1.3 }, 0.65); Wr.pal.wrapped = true; Wr.pal.where = 'line'; Wr.pal = null; Wr.wraps++; } }
      if (!Lb.pal && ll.atEnd(ll.front)) { Lb.pal = ll.take().pal; Lb.t = c.labelTime; Lb.pal.where = 'labeller'; Lb.pal.state = 'LABEL'; }
      if (Lb.pal) { Lb.t -= dt; if (Lb.t <= 0 && this.distLine.room(0.65, 1.3)) { this.distLine.put({ pal: Lb.pal, len: 1.3 }, 0.65); Lb.pal.labelled = true; Lb.pal.where = 'line'; Lb.pal.state = 'TO_DOOR'; Lb.pal = null; } }
      // a door's truck: one store order at a time; it loads that order's pallets as they come, then leaves
      for (const d of this.doors) {
        const cell = this.cells[d.k], tr = d.truck, q = this.doorLines[d.k];
        if (!tr) {
          const o = cell.orders[0];
          if (o) { d.gapT -= dt; if (d.gapT <= 0) { d.truck = { order: o, state: 'ARRIVING', t: 25, pallets: [] }; this.log('ship', `Truck for store ${o.store.no} ${o.store.town} backing up to door ${d.k + 1}`); } }
          continue;
        }
        if (tr.t > 0) { tr.t -= dt; if (tr.t <= 0) { if (tr.state === 'ARRIVING') tr.state = 'DOCKED'; else { d.truck = null; d.gapT = 90; } } continue; }
        if (tr.state !== 'DOCKED') continue;
        if (d.loading) { d.loading.t -= dt; if (d.loading.t <= 0) { const pal = d.loading.pal; tr.pallets.push(pal); pal.where = 'truck'; pal.state = 'LOADED'; tr.order.loaded++; d.loading = null; this.stats.palletsShipped++; } }
        else if (q.atEnd(q.front)) {
          const pal = q.front.pal;
          if (pal.order !== tr.order) throw new Error(`door ${d.k + 1}: a pallet of ${pal.order.code} for the truck of ${tr.order.code}`);
          q.take(); d.loading = { pal, t: 18, t0: this.time };
        }
        if (!d.loading && tr.order.loaded >= tr.order.pallets.length) {
          const o = tr.order;
          o.status = 'SHIPPED'; o.shipped = this.time; this.stats.shipped++; this.stats.trucksOut++;
          this.stats.cycle.push({ t: this.time, c: o.shipped - o.created }); if (this.stats.cycle.length > 200) this.stats.cycle.shift();
          cell.orders.shift(); tr.state = 'LEAVING'; tr.t = 25;
          for (const pal of o.pallets) { this.palletById.delete(pal.id); for (const it of pal.items) if (it.c) this.caseById.delete(it.c.id); }
          this.kpi.ordersShipped++;
          this.log('ship', `Store ${o.store.no} ${o.store.town}: ${o.pallets.length} pallets loaded, the truck leaves door ${d.k + 1} (${WS.U.fmtDur(o.shipped - o.created)} after the order)`);
          if (this.orders.length > 120) { const k = this.orders.findIndex((x) => x.status === 'SHIPPED'); if (k >= 0) this.orders.splice(k, 1); }
        }
      }
    }

    // ---------------------------------------------------------------- tick
    dispatch() {} // the machines run their own loops (see the tasks); cells release in stepCells
    tick() {
      super.tick();
      const dt = this.cfg.tick;
      this.stepOrders(dt);
      this.stepInbound(dt);
      for (const q of this.convs) q.update(dt);
      this.stepDepal(dt);
      this.stepCells();
      this.stepOutbound(dt);
      const f = Math.exp(-dt / 900); // how busy each machine has been, the last 15 minutes or so
      for (const m of this.fleet) m.busyNow = (m.busyNow || 0) * f + (m.bucket === 'WORK' ? 1 - f : 0);
      this.timer = (this.timer || 0) + dt;
      if (this.timer >= 60) { this.timer = 0; this.reorder(); }
    }

    // ---------------------------------------------------------------- numbers
    stat(list, key, span = 3600) {
      const v = list.filter((e) => e.t > this.time - span).map((e) => e[key]).sort((a, b) => a - b);
      return v.length ? { n: v.length, avg: v.reduce((a, b) => a + b, 0) / v.length, p90: v[Math.min(v.length - 1, Math.floor(v.length * 0.9))], max: v[v.length - 1] } : null;
    }
    fill() { let u = 0; for (const sh of this.shelves) u += sh.used; return u / (this.shelves.length * this.shelfLen); }
    lowStock() { return this.skus.filter((p) => p.cases.size - p.alloc < p.rop * 0.3).length; }
    soundPos(p) { return p.drop; }
    extraAlerts() {
      const out = [], fill = this.fill(), q = this.mainLine.items.length, wait = this.cells.filter((p) => p.recentStarve > 0.4);
      if (fill > 0.88) out.push({ sev: fill > 0.95 ? 'critical' : 'warning', key: 'full', title: 'Structure filling up', msg: `${Math.round(fill * 100)}% of the shelf length used · cases wait at the tunnel when no gap fits` });
      if (q > 30) out.push({ sev: 'warning', key: 'infeed', title: 'Infeed backing up', msg: `${q} cases on the case conveyor` });
      const lows = this.skus.filter((p) => p.stock === 0 && p.alloc > 0).length;
      if (lows) out.push({ sev: lows > 5 ? 'critical' : 'warning', key: 'out', title: 'Out of stock', msg: `${lows} products ordered but none in the structure: their pallets wait for the inbound truck` });
      return out;
    }
    fingerprint() {
      const sh = this.shelves.map((s) => s.items.map((e) => `${e.c.id}@${Math.round(e.a * 1000)}`).join(',')).join('\n');
      return sh + `\n${this.stats.depal}|${this.stats.stored}|${this.stats.palletised}|${this.stats.pallets}|${this.stats.shipped}|${this.cells.map((p) => p.liftSeq).join(',')}`;
    }
  }

  WS.CaseSim = CaseSim;
  WS.CaseBot = Bot; WS.CaseLift = Lift; WS.CaseArm = Arm; WS.CaseForklift = Forklift;
  WS.CasePlanner = Planner;
  WS.CASE_AISLES = AISLES;
})((globalThis.WS = globalThis.WS || {}));
