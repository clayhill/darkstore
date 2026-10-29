/* AirPost: a hospital's pneumatic tube system and its pharmacy (specs/tube.txt).
 *
 *  stations   On every ward, in the emergency department, theatres and ICU a
 *             tube station: a send dock, a basket carriers land in, a rack
 *             of empty carriers. Nurses send samples to the lab; the
 *             medicines they order come from the pharmacy.
 *  lines      A line (a zone) is one tube with one blower: it moves one
 *             carrier at a time, from station to station through its
 *             diverters. Each wing has a riser up through its floors (or a
 *             lower and an upper one); the lab, and the pharmacy with the
 *             carrier store, have lines of their own.
 *  transfer   The lines meet at the transfer unit in the plant room: a
 *             carrier for another line lands there, is shifted across and
 *             waits for that line.
 *  pharmacy   A dispensing robot picks the packs of a medicine order from
 *             its shelves; the pharmacist checks them and sends them up.
 *  carriers   A station needs an empty carrier to send anything. Carriers
 *             pile up at the lab and run short on the wards: the system
 *             tops stations up from the carrier store and takes surpluses
 *             back ('store'), or staff send foreign carriers home now and
 *             then ('sender'). What waits too long for a carrier goes by
 *             porter.
 * Positions are metres: x east along the building, y south (to the
 * street), z up. */
(function (WS) {
  'use strict';
  const TERMS = { unit: 'carrier', Unit: 'Carrier', units: 'carriers', Units: 'Carriers', store: 'tube system', Store: 'Tube system', port: 'station', ports: 'stations', machine: 'Machine', starve: 'carriers', flow1: 'Carriers /h', flow2: 'Packs picked /h', surge: 'Rush of samples' };
  const STATE_LABELS = { MOVING_TO_TARGET: 'Moving', TRANSPORTING_TO_PORT: 'Carrier in the tube', HANDLING: 'Setting the diverters', AT_PORT: 'Landing', WAITING_PORT: 'Waiting' };
  const LEGEND = ['IDLE', 'HANDLING', 'TRANSPORTING_TO_PORT', 'AT_PORT', 'MOVING_TO_TARGET'];
  // departments: samples and medicine orders an hour (wards' from the settings), the share that is urgent, how soon someone sees a carrier land
  const DEPT = {
    ED: { label: 'Emergency', samples: 12, meds: 2, stat: 0.5, respond: 0.4, cap: 8 },
    ICU: { label: 'Intensive care', samples: 8, meds: 3, stat: 0.4, respond: 0.5, cap: 8 },
    OR: { label: 'Theatres', samples: 4, meds: 2, stat: 0.5, respond: 0.6, cap: 6 },
    OPD: { label: 'Outpatients', samples: 6, meds: 0.3, stat: 0.02, respond: 1, cap: 8 },
    RAD: { label: 'Radiology', samples: 0.5, meds: 0.6, stat: 0.1, respond: 1, cap: 6 },
    WARD: { label: 'Ward', samples: null, meds: null, stat: 0.1, respond: 1, cap: 6 },
    PHARM: { label: 'Pharmacy', samples: 0, meds: 0, stat: 0, respond: 0.2, cap: 12 },
    LAB: { label: 'Laboratory', samples: 0, meds: 0, stat: 0, respond: 0, cap: 30 },
    STORE: { label: 'Carrier store', samples: 0, meds: 0, stat: 0, respond: 0, cap: 0 },
  };
  const WARDS = ['Cardiology', 'General surgery', 'Internal medicine', 'Neurology', 'Paediatrics', 'Maternity', 'Oncology', 'Orthopaedics', 'Geriatrics', 'Pulmonology', 'Gastroenterology', 'Nephrology', 'Urology', 'Haematology', 'Stroke unit', 'Short stay'];
  const WING = ['West', 'Centre', 'East', 'North-east'];
  const DRUGS = [
    ['Paracetamol 500 mg', 'tablets', '#e2e8f0'], ['Ibuprofen 400 mg', 'tablets', '#fca5a5'], ['Amoxicillin 500 mg', 'capsules', '#fde68a'], ['Metformin 850 mg', 'tablets', '#bfdbfe'],
    ['Omeprazole 20 mg', 'capsules', '#c4b5fd'], ['Furosemide 40 mg', 'tablets', '#a7f3d0'], ['Bisoprolol 5 mg', 'tablets', '#fbcfe8'], ['Enoxaparin 40 mg', 'syringes', '#93c5fd'],
    ['Morphine 10 mg', 'ampoules', '#fecaca'], ['Ceftriaxone 1 g', 'vials', '#fdba74'], ['Insulin glargine', 'pens', '#86efac'], ['Atorvastatin 40 mg', 'tablets', '#fef08a'],
    ['Pantoprazole 40 mg', 'vials', '#ddd6fe'], ['Prednisolone 20 mg', 'tablets', '#fed7aa'], ['Salbutamol', 'inhaler', '#7dd3fc'], ['Levothyroxine 50 µg', 'tablets', '#f5d0fe'],
    ['Ondansetron 4 mg', 'ampoules', '#bae6fd'], ['Tramadol 50 mg', 'capsules', '#fecdd3'], ['Amlodipine 5 mg', 'tablets', '#d9f99d'], ['Vancomycin 1 g', 'vials', '#fda4af'],
  ];
  const KIND = { sample: 'Samples', med: 'Medicines', blood: 'Blood', empty: 'Empty' };
  const CEIL = 3.35; // m above a floor: where the tubes run under the ceiling

  // ---------------------------------------------------------------- geometry
  function geometry(c) {
    const WW = c.wingWidth, nW = Math.max(2, Math.min(4, c.wings)), F = c.floors, H = c.floorHeight, X = nW * WW, D = 18, ci = Math.floor(nW / 2), x0c = ci * WW;
    return {
      WW, nW, F, H, X, D, ci, x0c, top: (F + 1) * H,
      FZ: (f) => f * H,
      riserX: (w, part) => w * WW + 12 + part * 0.4, yR: 6.2,
      stX: (w) => w * WW + 16, yS: 7.8, yRun: (k) => 0.9 + k * 0.14,
      tu: { x: x0c + 12, y: 2.2, w: 1.6 },
      store: { x: x0c + 10.9, y: 4.8 },
      pharm: { x: x0c + 9.4, y: 3.0 }, lab: { x: x0c + 15.0, y: 3.0 },
      cab: { x0: x0c + 1.6, x1: x0c + 7.4, y: 3.0, h: 2.5, out: x0c + 7.7, inX: x0c + 1.3 },
    };
  }

  // ---------------------------------------------------------------- the control room's map
  // An elevation of the building from the street: the floors, the tubes as
  // they climb and run (lit while their line is busy), the stations.
  const K = { OUT: 0, SLAB: 1, ROOM: 2, TUBE: 3, ST: 4, TU: 5, BLOW: 6, CAB: 7 };
  const ZCOL = ['#38bdf8', '#a78bfa', '#34d399', '#f472b6', '#fbbf24', '#f87171', '#22d3ee', '#a3e635', '#fb923c', '#c084fc', '#2dd4bf', '#e879f9'];
  class TubeMap extends WS.RobotFloor {
    constructor(sim, G) {
      const W = Math.ceil(G.X) + 2, D = Math.ceil(G.top) + 5;
      super(W, D, WS.CELL.BLOCKED);
      Object.assign(this, { sim, G });
      this.kind = new Uint8Array(W * D); this.zoneOf = new Int16Array(W * D).fill(-1); this.stOf = new Int16Array(W * D).fill(-1);
    }
    col(x) { return Math.max(0, Math.min(this.W - 1, Math.floor(x) + 1)); }
    row(z) { return Math.max(0, Math.min(this.D - 1, Math.floor(this.G.top + 3 - z))); }
    cell(x, z) { return this.idx(this.col(x), this.row(z)); }
    mapText() { const G = this.G; return Array.from({ length: G.F + 1 }, (_, f) => ({ s: f ? 'FLOOR ' + f : 'GROUND', x: 1, y: this.row(G.FZ(f) + G.H) + 0.6 })); }
    passable() { return false; }
    depthOf() { return 1; }
    mapFill(i, mix) {
      const k = this.kind[i], sim = this.sim;
      if (k === K.TUBE) { const z = sim.zones[this.zoneOf[i]]; return z.leg ? ZCOL[z.k % ZCOL.length] : mix('#0b1220', ZCOL[z.k % ZCOL.length], 0.35); }
      if (k === K.ST) { const st = sim.ports[this.stOf[i]]; return st.noCarrier() ? '#b91c1c' : st.basket.length ? '#d97706' : '#0f766e'; }
      return { [K.SLAB]: '#334155', [K.ROOM]: '#0c1320', [K.TU]: '#a16207', [K.BLOW]: '#475569', [K.CAB]: '#1e3a8a' }[k] || '#070b12';
    }
    get mapTitle() { return 'TUBES · seen from the street · a line lights up while it carries · stations: amber a carrier landed, red no empty carrier'; }
  }

  // ---------------------------------------------------------------- stations
  // A tube station: the send dock (outQ: loaded carriers in turn), the
  // basket (landed, not yet emptied), the rack of empties, and the things
  // waiting to go (wants). One person deals with it, one thing at a time.
  class Station extends WS.Port {
    constructor(sim, idx, def) {
      super(sim, idx, def);
      Object.assign(this, def.st, { basket: [], incoming: 0, empties: [], outQ: [], wants: [], work: null, coming: 0, sent: 0, got: 0, noCarrierT: 0, cap: DEPT[def.st.type].cap || 1e9 });
      this.name = def.st.name; this.code = def.st.code;
    }
    get job() { return this.work || this.basket.length || this.wants.length ? { lines: [null], next: 0, t: 0, total: 1 } : null; }
    set job(v) {}
    setArm() {}
    get staffed() { return this.type !== 'STORE'; }
    // something waits to go and there is no empty carrier for it
    noCarrier() { return this.staffed && this.wants.some((w) => w.kind !== 'empty') && !this.empties.length && !(this.work && this.work.kind === 'load'); }
    update(dt) {
      const st = this.stats, work = !!this.work, wait = this.noCarrier();
      st.t += dt;
      if (work) st.busy += dt;
      if (wait) { st.starved += dt; this.noCarrierT += dt; }
      if (this.away) st.away = (st.away || 0) + dt;
      const f = Math.exp(-dt / 900), g = Math.exp(-dt / 300);
      this.busyNow = (this.busyNow || 0) * f + (work ? 1 - f : 0);
      this.recentStarve = 0; this.waitNow = (this.waitNow || 0) * g + (wait ? 1 - g : 0);
    }
  }

  // ---------------------------------------------------------------- machines
  // A line: its blower moves one carrier at a time along a leg; s is how far along.
  class Zone extends WS.Machine {
    constructor(sim, id, def) {
      super(sim, id, def.name);
      Object.assign(this, def, { s: 0, os: 0, leg: null, legs: 0, stations: [] });
      this.x = def.blower.x; this.y = def.blower.y; this.z = def.blower.z;
      this.place(); this.prx = this.rx; this.pry = this.ry;
    }
    update(dt) { this.os = this.s; super.update(dt); }
    // on the map: the carrier while it flies, else the blower
    place() {
      const m = this.sim.map; if (!m) return;
      const p = this.leg && this.state !== 'HANDLING' ? this.sim.legPos(this.leg, this.s) : this.blower;
      this.rx = m.col(p.x) - 0.5; this.ry = m.row(p.z) - 0.5;
    }
  }
  class Transfer extends WS.Machine {
    constructor(sim, id) {
      super(sim, id, 'Transfer unit');
      const G = sim.G; Object.assign(this, { x: G.tu.x, y: G.tu.y, slots: [], res: 0, shifts: 0, cur: null, pos: 0, opos: 0 });
      this.place(); this.prx = this.rx; this.pry = this.ry;
    }
    update(dt) { this.opos = this.pos; super.update(dt); }
    place() { const m = this.sim.map; if (!m) return; this.rx = m.col(this.x) - 0.5; this.ry = m.row(1.2) - 0.5; }
    get room() { return this.slots.length + this.res < this.sim.cfg.tuSlots; }
  }
  class Dispenser extends WS.Machine {
    constructor(sim, id) {
      super(sim, id, 'Dispensing robot');
      const G = sim.G; Object.assign(this, { x: G.cab.out - 0.3, z: 1.0, reach: 0, side: 1, held: null, packs: 0, stocked: 0 });
      this.place(); this.prx = this.rx; this.pry = this.ry;
    }
    update(dt) { this.ox = this.x; this.oz = this.z; this.oreach = this.reach; super.update(dt); }
    place() { const m = this.sim.map; if (!m) return; this.rx = m.col(this.x) - 0.5; this.ry = m.row(this.z) - 0.5; }
  }

  // ---------------------------------------------------------------- tasks
  const T = {};
  // A line: the next leg it may run, the diverters set, the carrier through the tube, its landing.
  T.ZONE = function* (sim, Z) {
    const c = sim.cfg;
    for (;;) {
      let leg = null;
      Z.state = 'IDLE';
      yield { op: 'until', fn: () => (leg = sim.zoneLeg(Z)) !== null };
      Z.leg = leg; Z.s = 0; Z.os = 0;
      Z.state = 'HANDLING';
      yield { op: 'wait', t: c.switchTime };
      sim.legStart(Z, leg);
      Z.state = 'TRANSPORTING_TO_PORT';
      yield { op: 'travel', prop: 's', to: leg.L, v: leg.v, a: c.tubeA };
      Z.state = 'AT_PORT';
      yield { op: 'wait', t: c.landTime };
      sim.legEnd(Z, leg);
      Z.leg = null; Z.s = 0; Z.os = 0; Z.legs++;
    }
  };
  // The transfer unit: shifts each carrier that has landed in it across to the line it goes on by.
  T.TU = function* (sim, U) {
    for (;;) {
      let cr = null;
      U.state = 'IDLE';
      yield { op: 'until', fn: () => !U.down && (cr = U.slots.find((x) => !x.shifted)) != null };
      U.cur = cr; U.state = 'HANDLING';
      yield { op: 'travel', prop: 'pos', to: (U.pos > 0.5 ? 0 : 1), v: 2 / sim.cfg.tuTime, a: 8 / sim.cfg.tuTime };
      cr.shifted = true; U.cur = null; U.shifts++;
    }
  };
  // The dispensing robot: the packs of the most urgent order, line by line, to the output; else it puts a delivery away.
  T.ROBOT = function* (sim, R) {
    const c = sim.cfg, G = sim.G;
    const go = function* (x, z, st) { R.state = st; yield { op: 'travel', axes: [{ prop: 'x', to: x, v: c.robotV, a: c.robotA }, { prop: 'z', to: z, v: c.robotZV, a: c.robotZA }], settle: 0.2 }; };
    const reach = function* (side, to) { R.side = side; yield { op: 'travel', prop: 'reach', to, v: 0.6, a: 2 }; };
    for (;;) {
      let job = null;
      R.state = 'IDLE';
      yield { op: 'until', fn: () => (job = sim.robotJob(R)) !== null };
      R.task = job;
      if (job.kind === 'pick') {
        const d = job.line.drug;
        yield* go(d.slot.x, d.slot.z + 0.05, 'MOVING_TO_TARGET');
        R.state = 'HANDLING';
        yield* reach(d.slot.side, 1);
        yield { op: 'wait', t: c.grabTime * job.line.qty };
        sim.robotGrab(R, job);
        yield* reach(d.slot.side, 0);
        yield* go(G.cab.out - 0.3, 0.9, 'TRANSPORTING_TO_PORT');
        R.state = 'HANDLING';
        yield { op: 'wait', t: c.dropTime };
        sim.robotDrop(R, job);
      } else {
        yield* go(G.cab.inX + 0.3, 0.9, 'MOVING_TO_TARGET');
        R.state = 'HANDLING';
        yield { op: 'wait', t: c.grabTime };
        sim.robotTakeIn(R, job);
        const d = job.drug;
        yield* go(d.slot.x, d.slot.z + 0.05, 'TRANSPORTING_TO_PORT');
        R.state = 'HANDLING';
        yield* reach(d.slot.side, 1);
        yield { op: 'wait', t: c.dropTime * job.qty };
        sim.robotStored(R, job);
        yield* reach(d.slot.side, 0);
      }
      R.task = null;
    }
  };

  // ---------------------------------------------------------------- simulation
  class TubeSim extends WS.Sim {
    get kind() { return 'tube'; }
    get terms() { return TERMS; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    get taskTypes() { return T; }
    get armsAllowed() { return false; }
    get floorNames() { return ['Ground', ...Array.from({ length: this.G.F }, (_, k) => 'Floor ' + (k + 1))]; }
    defaults() { return WS.TUBE_CONFIG; }
    createGrid() {
      const c = this.cfg, G = (this.G = geometry(c)), m = (this.map = new TubeMap(this, G));
      this.depts = this.departments();
      for (const d of this.depts) m.ports.push({ kind: d.type, face: 'front', drop: { x: d.x, y: d.y }, lift: { x: d.x, y: d.y }, cells: [{ x: m.col(d.x), y: m.row(G.FZ(d.f) + 1.2) }], st: d });
      return m;
    }
    createPort(k, def) { return new Station(this, k, def); }
    // the stations: the ground floor's departments, theatres and ICU on the first floor, wards above
    departments() {
      const c = this.cfg, G = this.G, out = [];
      let ward = 0;
      const add = (type, name, code, w, f, x, y) => out.push({ type, name, code, w, f, x, y, z: G.FZ(f) });
      for (let f = 0; f <= G.F; f++) for (let w = 0; w < G.nW; w++) {
        const x = G.stX(w), tag = WING[w][0];
        if (f === 0) {
          if (w === G.ci) {
            add('PHARM', 'Pharmacy', 'PH', w, 0, G.pharm.x, G.pharm.y);
            add('LAB', 'Laboratory', 'LAB', w, 0, G.lab.x, G.lab.y);
            if (c.carrierPolicy === 'store') add('STORE', 'Carrier store', 'CS', w, 0, G.store.x, G.store.y);
          } else if (w === 0) add('ED', 'Emergency department', 'ED', w, 0, x, G.yS);
          else add(w === G.nW - 1 ? 'OPD' : 'RAD', w === G.nW - 1 ? 'Outpatients' : 'Radiology', w === G.nW - 1 ? 'OPD' : 'RAD', w, 0, x, G.yS);
        } else if (f === 1 && w === 0) add('OR', 'Theatres', 'OR', w, 1, x, G.yS);
        else if (f === 1 && w === G.ci) add('ICU', 'Intensive care', 'ICU', w, 1, x, G.yS);
        else add('WARD', WARDS[ward++ % WARDS.length], `${f}${tag}`, w, f, x, G.yS);
      }
      return out;
    }
    describe() { const c = this.cfg; return `Tube system online · ${this.zones.length} lines · ${this.ports.length} stations on ${c.floors + 1} floors · ${c.carriers} carriers · dispensing robot with ${this.drugs.length} products`; }
    storageCapacity() { return this.cfg.carriers; }
    fetchCost() { return 0; }
    clock(t = this.time) { return t + this.cfg.dayStart; }
    hourAt(h) { return h * 3600 - this.cfg.dayStart; }
    breakTargets() { return this.ports.filter((p) => p.staffed && p.type !== 'PHARM'); }

    seed() {
      const c = this.cfg, G = this.G, rng = this.rng;
      this.stats = { sent: 0, landed: 0, samples: 0, meds: 0, blood: 0, empties: 0, porter: 0, waitedEmpty: 0, orders: 0, delivered: 0, packs: 0, stocked: 0, transit: [], qwait: [], sampleT: [], medT: [], emptyWait: [] };
      this.carrierSeq = 1; this.orderSeq = 1; this.carriers = []; this.orders = []; this.rxQueue = []; this.porters = []; this.carrierById = new Map();
      this.stations = this.ports;
      this.buildZones();
      this.tu = this.addFleet(new Transfer(this, this.fleet.length));
      this.tu.run(T.TU(this, this.tu));
      for (const Z of this.zones) Z.run(T.ZONE(this, Z));
      this.catalogue();
      this.robot = this.addFleet(new Dispenser(this, this.fleet.length));
      this.robot.run(T.ROBOT(this, this.robot));
      this.paintMap();
      // the carriers: each station its own, the rest in the store (or spread over the stations)
      const staffed = this.ports.filter((p) => p.staffed), store = this.store;
      const parOf = (p) => (p.type === 'PHARM' ? c.par * 2 : p.type === 'LAB' ? 0 : c.par);
      for (const p of staffed) for (let k = 0; k < parOf(p); k++) this.newCarrier(p, p);
      for (let k = this.carriers.length, j = 0; k < c.carriers; k++, j++) { const home = store || staffed[j % staffed.length]; this.newCarrier(home, home === store ? staffed[j % staffed.length] : home); }
      // the next sample, order and unit of blood at every station
      for (const p of staffed) { p.nextSample = this.gap(this.rate(p, 'samples')); p.nextMed = this.gap(this.rate(p, 'meds')); }
      this.lab.nextBlood = this.gap(c.bloodRate * c.demand);
      this.returnAt = c.returnEvery * 60;
      this.deliveryAt = [9, 12, 15, 18, 21].map((h) => this.hourAt(h));
      this.log('system', `06:00 · ${this.carriers.length} carriers · ${this.zones.length} lines through the transfer unit`);
    }
    addFleet(m) { this.fleet.push(m); return m; }
    get store() { return this.ports.find((p) => p.type === 'STORE') || null; }
    get lab() { return this.ports.find((p) => p.type === 'LAB'); }
    get pharmacy() { return this.ports.find((p) => p.type === 'PHARM'); }
    newCarrier(at, home) {
      const id = this.carrierSeq++, cr = { id, code: 'C' + String(id).padStart(3, '0'), home, at, state: 'EMPTY', contents: null, dest: null, leg: null, trips: 0 };
      at.empties.push(cr); this.carriers.push(cr); this.carrierById.set(id, cr);
      return cr;
    }

    // ---------------------------------------------------------------- the network
    // Each line is a tree of points from its port on the transfer unit; a
    // station's route is the list of points from the root to its inlet. The
    // way between two stations of a line goes up to the last point their
    // routes share and down again.
    buildZones() {
      const c = this.cfg, G = this.G, P = (x, y, z) => ({ x, y, z });
      const labOwn = c.labLine !== 'core', defs = [], nZ = (labOwn ? 2 : 1) + G.nW * (c.zonesPerWing > 1 ? 2 : 1);
      const port = (k) => G.tu.x - (G.tu.w / 2) + 0.15 + (k * (G.tu.w - 0.3)) / Math.max(1, nZ - 1);
      const root = (k) => { const x = port(k), a = P(x, G.tu.y, 2.15), b = P(x, G.yRun(k), CEIL); return [a, P(x, G.tu.y, CEIL), b]; };
      const down = (x, y) => [P(x, y, CEIL), P(x, y, 2.05)];
      // the core line: the pharmacy and the carrier store (and the lab, without a line of its own)
      const coreSt = this.ports.filter((p) => p.type === 'PHARM' || p.type === 'STORE' || (!labOwn && p.type === 'LAB'));
      defs.push({ name: 'Core line', short: 'Core', stations: coreSt, blower: P(G.tu.x + 1.6, 5.6, 2.6) });
      if (labOwn) defs.push({ name: 'Lab line', short: 'Lab', stations: this.ports.filter((p) => p.type === 'LAB'), blower: P(G.tu.x + 2.2, 5.6, 2.6) });
      for (let w = 0; w < G.nW; w++) {
        const sts = this.ports.filter((p) => p.w === w && !['PHARM', 'LAB', 'STORE'].includes(p.type));
        if (c.zonesPerWing > 1) {
          const mid = Math.ceil(G.F / 2);
          defs.push({ name: `${WING[w]} lower line`, short: WING[w][0] + '↓', wing: w, part: 0, stations: sts.filter((p) => p.f <= mid), top: mid });
          defs.push({ name: `${WING[w]} upper line`, short: WING[w][0] + '↑', wing: w, part: 1, stations: sts.filter((p) => p.f > mid), top: G.F });
        } else defs.push({ name: `${WING[w]} line`, short: WING[w][0], wing: w, part: 0, stations: sts, top: G.F });
      }
      this.zones = [];
      defs.forEach((d, k) => {
        const r = root(k), routes = new Map();
        if (d.wing == null) {
          for (const st of d.stations) routes.set(st, [...r, P(st.x, G.yRun(k), CEIL), ...down(st.x, st.y)]);
        } else {
          const xR = G.riserX(d.wing, d.part), base = [...r, P(xR, G.yRun(k), CEIL), P(xR, G.yR, CEIL)], J = [];
          for (let f = 1; f <= d.top + 0.5; f++) J[f] = P(xR, G.yR, G.FZ(f) + CEIL);
          for (const st of d.stations) {
            const up = []; for (let f = 1; f <= st.f; f++) up.push(J[f]);
            const zf = G.FZ(st.f);
            routes.set(st, [...base, ...up, P(st.x, G.yR, zf + CEIL), P(st.x, st.y, zf + CEIL), P(st.x, st.y, zf + 2.05)]);
          }
          d.blower = P(xR, G.yR, G.FZ(d.top) + CEIL + 0.9);
          d.riser = { x: xR, y: G.yR, z0: CEIL, z1: G.FZ(d.top) + CEIL };
        }
        d.k = k; d.routes = routes; d.port = r[0];
        const Z = this.addFleet(new Zone(this, this.fleet.length, d));
        Z.stations = d.stations.slice();
        for (const st of d.stations) st.zone = Z;
        this.zones.push(Z);
      });
    }
    // the points of a leg: from a station (or the transfer unit, null) to another (or null)
    legPts(Z, from, to) {
      const a = from ? Z.routes.get(from) : [Z.port], b = to ? Z.routes.get(to) : [Z.port];
      let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++;
      const lca = Math.max(0, k - 1);
      const pts = [...a.slice(lca).reverse(), ...b.slice(lca + 1)];
      // straight runs only: drop repeated points
      return pts.filter((p, i) => !i || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z) > 1e-6);
    }
    makeLeg(Z, cr, from, to) {
      const pts = this.legPts(Z, from, to), cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
      const gentle = cr.contents && (cr.contents.kind === 'sample' || cr.contents.kind === 'blood');
      return { cr, zone: Z, from, to, pts, cum, L: cum[cum.length - 1], v: gentle ? this.cfg.gentleV : this.cfg.tubeV };
    }
    legPos(leg, s) {
      const { pts, cum } = leg;
      let i = 1; while (i < pts.length - 1 && cum[i] < s) i++;
      const a = pts[i - 1], b = pts[i], l = cum[i] - cum[i - 1], t = l ? Math.max(0, Math.min(1, (s - cum[i - 1]) / l)) : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, dx: b.x - a.x, dy: b.y - a.y, dz: b.z - a.z };
    }
    room(st) { return st.type === 'STORE' || st.basket.length + st.incoming < st.cap; }
    // The next leg for a line: the front carrier of each of its stations'
    // send docks and the carriers shifted to it in the transfer unit; urgent
    // ones first (unless in turn), empties last, else the longest waiting.
    zoneLeg(Z) {
      if (Z.down) return null;
      const c = this.cfg, U = this.tu;
      let best = null, bs = -Infinity;
      const score = (cr) => (c.priority === 'stat' && cr.contents && cr.contents.stat ? 1e6 : 0) + (!cr.contents ? -1e5 : 0) + (this.time - cr.tq);
      for (const st of Z.stations) {
        const cr = st.outQ[0];
        if (!cr || cr.leg) continue;
        const D = cr.dest, direct = D.zone === Z;
        if (direct ? !this.room(D) : !U.room || U.down) continue;
        const s = score(cr);
        if (s > bs) { bs = s; best = { cr, from: st, to: direct ? D : null }; }
      }
      for (const cr of U.slots) {
        if (!cr.shifted || cr.leg || cr.dest.zone !== Z || !this.room(cr.dest)) continue;
        const s = score(cr);
        if (s > bs) { bs = s; best = { cr, from: null, to: cr.dest }; }
      }
      if (!best) return null;
      const leg = this.makeLeg(Z, best.cr, best.from, best.to);
      best.cr.leg = leg;
      if (best.to) best.to.incoming++; else U.res++;
      return leg;
    }
    legStart(Z, leg) {
      const cr = leg.cr;
      if (leg.from) { const st = leg.from, k = st.outQ.indexOf(cr); st.outQ.splice(k, 1); if (cr.legs == null) { cr.legs = 0; this.stats.qwait.push({ t: this.time, c: this.time - cr.tq }); } }
      else { this.tu.slots.splice(this.tu.slots.indexOf(cr), 1); }
      cr.legs++; cr.state = 'IN_TUBE'; cr.at = Z;
    }
    legEnd(Z, leg) {
      const cr = leg.cr, U = this.tu;
      cr.leg = null;
      if (!leg.to) { U.res--; U.slots.push(cr); cr.shifted = false; cr.state = 'TRANSFER'; cr.at = U; cr.tq = this.time; return; }
      const st = leg.to; st.incoming--;
      this.landed(cr, st);
    }
    landed(cr, st) {
      const ct = cr.contents;
      cr.state = 'ARRIVED'; cr.at = st; cr.landT = this.time; cr.trips++;
      this.stats.landed++; this.kpi.presented++; this.kpi.push('presented');
      if (cr.tq0 != null) { this.stats.transit.push({ t: this.time, c: this.time - cr.tq0, stat: !!(ct && ct.stat), kind: ct ? ct.kind : 'empty' }); if (this.stats.transit.length > 600) this.stats.transit.shift(); }
      if (st.type === 'STORE') { this.emptied(cr, st); return; }
      // someone sees it after a while; sooner for an urgent one (the station beeps)
      const base = st.type === 'LAB' ? this.cfg.respondLab : this.cfg.respondWard * DEPT[st.type].respond;
      cr.seeT = this.time + base * (ct && ct.stat ? 0.33 : 1) * (0.3 + 1.4 * this.rng());
      st.basket.push(cr); st.got++;
    }
    // the carrier emptied at its station: what it brought has arrived
    emptied(cr, st) {
      const ct = cr.contents;
      if (ct) this.delivered(ct, st);
      if (!ct && cr.from && cr.from.type === 'STORE' && st.coming) st.coming--;
      cr.contents = null; cr.dest = null; cr.state = 'EMPTY'; cr.at = st; cr.t0 = null; cr.tq0 = null;
      st.empties.push(cr);
    }
    delivered(ct, st) {
      if (ct.kind === 'sample') { this.stats.samples++; this.stats.sampleT.push({ t: this.time, c: this.time - ct.t0, stat: ct.stat }); if (this.stats.sampleT.length > 400) this.stats.sampleT.shift(); }
      else if (ct.kind === 'med') { this.stats.meds++; const o = ct.order; o.status = 'DELIVERED'; o.done = this.time; this.stats.delivered++; this.stats.medT.push({ t: this.time, c: this.time - o.created, stat: o.stat }); if (this.stats.medT.length > 400) this.stats.medT.shift(); }
      else if (ct.kind === 'blood') this.stats.blood++;
    }

    // ---------------------------------------------------------------- stations: the people
    rate(p, what) {
      const c = this.cfg, d = DEPT[p.type];
      const base = what === 'samples' ? (d.samples ?? c.wardSamples) : (d.meds ?? c.wardMeds);
      return base * c.demand;
    }
    gap(perHour) { return perHour > 0 ? -Math.log(1 - this.rng()) * 3600 / perHour : Infinity; }
    // the wards' morning round: twice the samples from 06:30 to 09:00
    roundFactor(p) { const h = this.clock() / 3600; return (p.type === 'WARD' || p.type === 'ICU') && h >= 6.5 && h < 9 ? 2 : p.type === 'WARD' ? 0.8 : 1; }
    stepDemand(dt) {
      const c = this.cfg, f = this.disrupt.rateFactor;
      for (const p of this.ports) {
        if (!p.staffed || p.type === 'PHARM' || p.type === 'LAB') continue;
        p.nextSample -= dt * f * this.roundFactor(p);
        if (p.nextSample <= 0) { p.nextSample = this.gap(this.rate(p, 'samples')); this.want(p, { kind: 'sample', dest: this.lab, stat: this.rng() < DEPT[p.type].stat, t0: this.time, from: p }); }
        p.nextMed -= dt * f;
        if (p.nextMed <= 0) { p.nextMed = this.gap(this.rate(p, 'meds')); this.newOrder(p); }
      }
      const L = this.lab;
      L.nextBlood -= dt * f;
      if (L.nextBlood <= 0) {
        L.nextBlood = this.gap(c.bloodRate * c.demand);
        const to = this.ports.filter((p) => p.type === 'OR' || p.type === 'ICU' || p.type === 'ED');
        if (to.length) this.want(L, { kind: 'blood', dest: to[Math.floor(this.rng() * to.length)], stat: true, t0: this.time, from: L });
      }
    }
    want(p, w) { p.wants.push(w); return w; }
    // what a station's person does next: empty a carrier that has landed, else load the most urgent thing waiting
    stepStations(dt) {
      const c = this.cfg;
      for (const p of this.ports) {
        if (p.work) { p.work.t -= dt; if (p.work.t <= 0) this.workDone(p); continue; }
        if (p.away) continue;
        if (p.type === 'STORE') {
          // the store loads and sends by itself
          const w = p.wants[0];
          if (w && p.empties.length) { p.wants.shift(); const cr = p.empties.pop(); this.dispatchCarrier(p, cr, w); }
          continue;
        }
        const seen = p.basket.find((cr) => cr.seeT <= this.time);
        if (seen) { p.basket.splice(p.basket.indexOf(seen), 1); seen.state = 'UNLOADING'; p.work = { kind: 'unload', cr: seen, t: c.unloadTime, t0: this.time }; continue; }
        const w = this.nextWant(p);
        if (w) {
          p.wants.splice(p.wants.indexOf(w), 1);
          const cr = this.takeEmpty(p, w);
          const t = w.kind === 'empty' ? 6 : w.kind === 'med' ? c.checkTime + c.loadTime : c.loadTime;
          p.work = { kind: 'load', w, cr, t, t0: this.time };
          cr.state = 'LOADING';
        }
      }
    }
    // the most urgent thing waiting that can go now: an empty to return needs a carrier of course, anything else an empty one
    nextWant(p) {
      let best = null, bs = -Infinity;
      for (const w of p.wants) {
        if (!p.empties.length) continue;
        if (w.kind === 'empty' && w.carrier && !p.empties.includes(w.carrier)) continue;
        const s = (w.stat ? 1e6 : 0) + (w.kind === 'empty' ? -1e5 : 0) + (this.time - w.t0);
        if (s > bs) { bs = s; best = w; }
      }
      return best;
    }
    // an empty carrier for it: the one named, else a foreign one first (so home carriers stay), the one that has been here longest
    takeEmpty(p, w) {
      let k = w.carrier ? p.empties.indexOf(w.carrier) : -1;
      if (k < 0) k = p.empties.findIndex((cr) => cr.home !== p);
      if (k < 0) k = 0;
      return p.empties.splice(k, 1)[0];
    }
    workDone(p) {
      const wk = p.work; p.work = null;
      if (wk.kind === 'unload') { this.emptied(wk.cr, p); return; }
      const w = wk.w, cr = wk.cr;
      if (w.waited) { this.stats.waitedEmpty++; this.stats.emptyWait.push({ t: this.time, c: w.waited }); if (this.stats.emptyWait.length > 300) this.stats.emptyWait.shift(); }
      this.dispatchCarrier(p, cr, w);
    }
    // into the send dock: it goes when its line is free
    dispatchCarrier(p, cr, w) {
      cr.contents = w.kind === 'empty' ? null : w; cr.dest = w.dest; cr.state = 'QUEUED'; cr.at = p; cr.tq = this.time; cr.tq0 = this.time; cr.t0 = w.t0; cr.legs = null; cr.from = p;
      if (w.kind === 'empty') this.stats.empties++; else this.stats.sent++;
      if (w.order) { w.order.status = 'SENT'; w.order.carrier = cr; }
      p.outQ.push(cr); p.sent++;
    }

    // ---------------------------------------------------------------- empty carriers
    // Every 10 s: stations short of empties get one from the store, those with too many send some there ('store');
    // or every so often staff send the carriers that are not theirs back home ('sender').
    stepEmpties() {
      const c = this.cfg, S = this.store;
      const par = (p) => (p.type === 'PHARM' ? c.par * 2 : p.type === 'LAB' ? 1 : c.par);
      const inWants = (p) => p.wants.filter((w) => w.kind === 'empty').length;
      if (S) {
        for (const p of this.ports) {
          if (!p.staffed) continue;
          const need = p.wants.filter((w) => w.kind !== 'empty').length, have = p.empties.length + p.coming;
          // short: what it needs to send plus its par, counting what is on the way
          for (let k = have; k < Math.min(par(p) + need, par(p) * 2 + 2) && S.wants.length < S.empties.length + 4; k++) { this.want(S, { kind: 'empty', dest: p, t0: this.time }); p.coming++; }
          // a surplus beyond par + 2 goes back to the store
          const extra = p.empties.length - need - par(p) - 2 - inWants(p);
          for (let k = 0; k < extra; k++) this.want(p, { kind: 'empty', dest: S, t0: this.time });
        }
        return;
      }
      if (this.time < this.returnAt) return;
      this.returnAt = this.time + c.returnEvery * 60;
      // 'sender': each station sends the foreign carriers beyond its par back where they belong
      for (const p of this.ports) {
        if (!p.staffed) continue;
        const foreign = p.empties.filter((cr) => cr.home !== p && !p.wants.some((w) => w.carrier === cr));
        const keep = Math.max(0, par(p) - p.empties.filter((cr) => cr.home === p).length);
        for (const cr of foreign.slice(keep)) this.want(p, { kind: 'empty', dest: cr.home, carrier: cr, t0: this.time });
      }
    }
    // what has waited too long for a carrier goes by porter
    stepPorters(dt) {
      const c = this.cfg, lim = c.porterAfter * 60;
      for (const p of this.ports) {
        for (const w of p.wants) if (w.kind !== 'empty' && !p.empties.length) w.waited = (w.waited || 0) + dt;
        const gone = p.wants.filter((w) => w.kind !== 'empty' && (w.waited || 0) >= lim);
        for (const w of gone) {
          p.wants.splice(p.wants.indexOf(w), 1);
          this.stats.porter++;
          if (w.order) w.order.status = 'PORTER';
          this.porters.push({ w, from: p, t: this.time + 600 });
          this.log('porter', `${p.name}: ${KIND[w.kind].toLowerCase()} for ${w.dest.name} waited ${c.porterAfter} min for an empty carrier, a porter takes them`);
        }
      }
      for (const q of this.porters) if (q.t <= this.time) { q.done = true; this.delivered(q.w, q.w.dest); }
      if (this.porters.some((q) => q.done)) this.porters = this.porters.filter((q) => !q.done);
    }

    // ---------------------------------------------------------------- the pharmacy
    catalogue() {
      const c = this.cfg, G = this.G, rng = this.rng, n = Math.max(20, c.drugs);
      this.drugs = [];
      // shelves on both sides of the robot's aisle, 11 high; each product a stretch of one shelf
      const shelves = []; for (const side of [-1, 1]) for (let r = 0; r < 11; r++) shelves.push({ side, z: 0.25 + r * 0.2, x: G.cab.x0 + 0.05 });
      const dem = Array.from({ length: n }, (_, k) => Math.pow(0.95, k) + 0.08), tot = dem.reduce((a, b) => a + b, 0), room = (G.cab.x1 - G.cab.x0 - 0.1) * shelves.length * 0.97;
      let s = 0;
      for (let k = 0; k < n; k++) {
        const len = Math.max(0.12, Math.min(G.cab.x1 - G.cab.x0 - 0.1, (room * Math.sqrt(dem[k])) / dem.reduce((a, b) => a + Math.sqrt(b), 0)));
        const b = DRUGS[k % DRUGS.length], v = Math.floor(k / DRUGS.length);
        const w = 0.05 + rng() * 0.07, h = 0.04 + rng() * 0.06, dp = 0.08 + rng() * 0.06;
        let sh = shelves[s]; if (sh.x + len > G.cab.x1 - 0.05) { s = Math.min(shelves.length - 1, s + 1); sh = shelves[s]; }
        const slot = { side: sh.side, z: sh.z, x: sh.x + len / 2, x0: sh.x, x1: sh.x + len }; sh.x += len;
        const cap = Math.max(4, Math.floor(len / w) * Math.max(1, Math.floor(0.32 / dp)));
        const d = { id: k, name: v ? `${b[0]} (${['generic', 'brand', 'hospital pack'][v % 3]})` : b[0], form: b[1], color: v % 2 ? WS.shade ? WS.shade(b[2], -0.12) : b[2] : b[2], w, h, dp, slot, cap, stock: Math.round(cap * (0.4 + rng() * 0.5)), onOrder: 0, demand: dem[k] / tot, gtin: WS.Barcode.makeGTIN13(540000 + k), picks: 0 };
        d.min = Math.max(2, Math.round(d.cap * 0.25));
        this.drugs.push(d);
      }
      this.drugTot = this.drugs.reduce((a, d) => a + d.demand, 0);
      this.inTray = []; this.stockVer = 0;
    }
    newOrder(ward, stat) {
      const rng = this.rng, id = this.orderSeq++, n = 1 + Math.floor(rng() * rng() * 4), lines = [], used = new Set(), w = this.drugs.map((d) => d.demand);
      for (let g = 0; lines.length < n && g < 40; g++) { const d = this.drugs[rng.weighted(w, this.drugTot)]; if (used.has(d)) continue; used.add(d); lines.push({ drug: d, qty: 1 + (rng() < 0.3 ? 1 : 0), done: false }); }
      for (const l of lines) this.reorder(l.drug);
      const o = { id, code: 'RX-' + String(4000 + id), ward, lines, stat: stat ?? rng() < DEPT[ward.type].stat, created: this.time, status: 'QUEUED', picked: 0 };
      this.orders.push(o); this.rxQueue.push(o); this.stats.orders++;
      if (this.orders.length > 200) { const k = this.orders.findIndex((x) => x.status === 'DELIVERED' || x.status === 'PORTER'); if (k >= 0) this.orders.splice(k, 1); }
      return o;
    }
    // the robot's next job: a line of the most urgent order in stock, else a pack of a delivery to put away
    robotJob(R) {
      if (R.down) return null;
      const qs = this.rxQueue.slice().sort((a, b) => (b.stat - a.stat) || a.created - b.created);
      for (const o of qs) {
        const line = o.lines.find((l) => !l.done && !l.busy && l.drug.stock >= l.qty);
        if (line) { line.busy = true; o.status = 'PICKING'; return { kind: 'pick', order: o, line }; }
      }
      const t = this.inTray[0];
      if (t) { this.inTray.shift(); return { kind: 'store', drug: t.drug, qty: Math.min(t.qty, 6), rest: t.qty - Math.min(t.qty, 6) }; }
      return null;
    }
    robotGrab(R, j) { const d = j.line.drug; d.stock -= j.line.qty; d.picks++; R.held = { drug: d, n: j.line.qty }; this.stockVer++; }
    robotDrop(R, j) {
      R.held = null; R.packs += j.line.qty; this.stats.packs += j.line.qty; this.kpi.push('lines', j.line.qty); this.kpi.linesPicked += j.line.qty;
      j.line.done = true; j.line.busy = false;
      const o = j.order; o.picked++;
      if (o.lines.every((l) => l.done)) {
        this.rxQueue.splice(this.rxQueue.indexOf(o), 1); o.status = 'CHECK'; o.pickedT = this.time;
        this.want(this.pharmacy, { kind: 'med', dest: o.ward, stat: o.stat, t0: o.created, order: o, from: this.pharmacy });
      }
      this.reorder(j.line.drug);
    }
    robotTakeIn(R, j) { R.held = { drug: j.drug, n: j.qty }; if (j.rest > 0) this.inTray.unshift({ drug: j.drug, qty: j.rest }); }
    robotStored(R, j) { R.held = null; j.drug.stock += j.qty; j.drug.onOrder -= j.qty; R.stocked += j.qty; this.stats.stocked += j.qty; this.stockVer++; }
    reorder(d) { if (d.stock + d.onOrder < d.min) { const q = d.cap - d.stock - d.onOrder; d.onOrder += q; d.toOrder = (d.toOrder || 0) + q; } }
    // the wholesaler's delivery: totes of what was reordered, into the robot's input tray
    stepDeliveries() {
      if (!this.deliveryAt.length || this.time < this.deliveryAt[0]) return;
      this.deliveryAt.shift();
      let n = 0;
      for (const d of this.drugs) if (d.toOrder) { this.inTray.push({ drug: d, qty: d.toOrder }); n += d.toOrder; d.toOrder = 0; }
      if (n) this.log('pharmacy', `Wholesaler's delivery: ${n} packs for the robot to put away`);
    }

    // ---------------------------------------------------------------- tick
    dispatch() {} // the lines, the transfer unit and the robot pick their own jobs (see the tasks)
    tick() {
      super.tick();
      const dt = this.cfg.tick;
      this.stepDemand(dt);
      this.stepStations(dt);
      this.stepPorters(dt);
      this.stepDeliveries();
      this.emptyT = (this.emptyT || 0) + dt;
      if (this.emptyT >= 10) { this.emptyT = 0; this.stepEmpties(); }
      const f = Math.exp(-dt / 900);
      for (const m of this.fleet) m.busyNow = (m.busyNow || 0) * f + (m.bucket === 'WORK' ? 1 - f : 0);
    }

    // ---------------------------------------------------------------- numbers
    paintMap() {
      const G = this.G, m = this.map;
      for (let f = 0; f <= G.F; f++) {
        for (let x = 0; x < G.X; x += 0.5) { m.kind[m.cell(x, G.FZ(f) - 0.01)] = K.SLAB; for (let z = 0.5; z < G.H; z += 1) m.kind[m.cell(x, G.FZ(f) + z)] = K.ROOM; }
      }
      for (let x = 0; x < G.X; x += 0.5) m.kind[m.cell(x, G.top - 0.01)] = K.SLAB;
      for (const Z of this.zones) for (const st of Z.stations) {
        const pts = Z.routes.get(st);
        for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.3) + 1; for (let k = 0; k <= n; k++) { const i2 = m.cell(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n); if (m.kind[i2] !== K.ST) { m.kind[i2] = K.TUBE; m.zoneOf[i2] = Z.k; } } }
      }
      for (const Z of this.zones) { const i = m.cell(Z.blower.x, Z.blower.z); m.kind[i] = K.BLOW; }
      m.kind[m.cell(G.tu.x, 1.2)] = K.TU; m.kind[m.cell(G.tu.x - 0.8, 1.2)] = K.TU;
      for (let x = G.cab.x0; x < G.cab.x1; x += 1) for (let z = 0.5; z < 2.5; z += 1) m.kind[m.cell(x, z)] = K.CAB;
      for (const p of this.ports) for (const cl of p.cells) { const i = m.idx(cl.x, cl.y); m.kind[i] = K.ST; m.stOf[i] = p.idx; }
    }
    stat(list, key, span = 3600, pred) {
      const v = list.filter((e) => e.t > this.time - span && (!pred || pred(e))).map((e) => e[key]).sort((a, b) => a - b);
      return v.length ? { n: v.length, avg: v.reduce((a, b) => a + b, 0) / v.length, p90: v[Math.min(v.length - 1, Math.floor(v.length * 0.9))], max: v[v.length - 1] } : null;
    }
    inTubes() { return this.carriers.filter((cr) => cr.state === 'IN_TUBE' || cr.state === 'TRANSFER' || cr.state === 'QUEUED').length; }
    soundPos(p) { return p.drop; }
    extraAlerts() {
      const out = [], short = this.ports.filter((p) => p.noCarrier()), busy = this.zones.filter((z) => (z.busyNow || 0) > 0.85), q = this.ports.reduce((a, p) => a + p.outQ.length, 0);
      if (short.length) out.push({ sev: short.length > 2 ? 'critical' : 'warning', key: 'empty', title: 'No empty carrier', msg: `${short.map((p) => p.code).join(', ')}: something waits to be sent` });
      for (const z of busy) out.push({ sev: (z.busyNow || 0) > 0.95 ? 'critical' : 'warning', key: 'zone' + z.k, title: `${z.name} nearly full`, msg: `busy ${Math.round(z.busyNow * 100)}% the last 15 min` });
      if (q > 12) out.push({ sev: q > 25 ? 'critical' : 'warning', key: 'queue', title: 'Carriers waiting to go', msg: `${q} in the send docks` });
      if (this.stats.porter) out.push({ sev: 'warning', key: 'porter', title: 'Sent by porter', msg: `${this.stats.porter} today` });
      return out;
    }
    fingerprint() {
      return this.carriers.map((cr) => `${cr.code}:${cr.state[0]}${cr.at && cr.at.code ? cr.at.code : cr.at && cr.at.k != null ? 'z' + cr.at.k : 'u'}`).join(' ') + `\n${this.stats.landed}|${this.stats.samples}|${this.stats.meds}|${this.stats.packs}|${this.stats.porter}|${this.zones.map((z) => z.legs).join(',')}`;
    }
  }

  WS.TubeSim = TubeSim;
  WS.TubeZone = Zone; WS.TubeTransfer = Transfer; WS.TubeDispenser = Dispenser;
  WS.TUBE_KIND = KIND; WS.TUBE_DEPT = DEPT; WS.TUBE_ZCOL = ZCOL; WS.TUBE_CEIL = CEIL;
})((globalThis.WS = globalThis.WS || {}));
