/* FloorStack's isometric view: the building's three floors side by side, the
 * second floor up left and the ground floor down right (an exploded plan;
 * the Floors slider shows fewer, or one alone). The first floor is
 * RailRunner's view of the racking, shuttles and aisle lifts
 * (WS.ShuttleRenderer); the floors' belts, the spirals standing on the
 * floor they rise from, the tote lifts, the stations, packing, the sorter,
 * the trucks, the canteen and the people are drawn here. A spiral climbs
 * from the floor below through the slab of the floor above: its totes ride
 * up on the lower floor's plate and come off on the upper one. */
(function (WS) {
  'use strict';
  const { shade } = WS;
  const R = WS.TOWER_R, RP = WS.TOWER_RP;
  const TITLE = ['GROUND FLOOR · goods-in, sorter, docks, canteen', 'FIRST FLOOR · shuttle store', 'SECOND FLOOR · picking and packing'];
  const CARRIER_COL = { PCL: '#0ea5e9', EXP: '#ef4444', ECO: '#22c55e' };
  const STEEL = '#475569', CYAN = '#06b6d4';
  const ease = (u) => u * u * (3 - 2 * u);

  class TowerRenderer extends WS.ShuttleRenderer {
    // ---------------------------------------------------------------- floors
    get floorList() { const o = this.opts, t = o.floorTop; return t == null ? [0, 1, 2] : o.cutOnly ? [t] : [0, 1, 2].filter((f) => f <= t); }
    // floors shown side by side along x, the highest first; room before the ground floor for the trucks at its west doors
    offset(f) { const g = this.sim.grid, L = this.floorList, above = L.length - 1 - L.indexOf(f); return above * (g.bx1 - g.bx0 + 2) + (f === 0 && above ? 15 : 0); }
    setFloor(f) { this.f = f; this.ox = f == null ? 0 : this.offset(f); }
    P(x, y, z) { return super.P(x + (this.ox || 0), y, z); }
    toWorld(sx, sy, z) { const w = super.toWorld(sx, sy, z); return { x: w.x - (this.ox || 0), y: w.y }; }
    worldBounds() {
      const g = this.sim.grid, P = (x, y, z) => WS.IsoView.prototype.P.call(this, x, y, z), pts = [];
      for (const f of this.floorList) {
        const ox = this.offset(f), top = f === 0 ? g.FZ[2] + 3 : f === 1 ? g.FH[1] + 6 : 8;
        for (const [x, y] of [[g.bx0 - 9, g.by0 - 13], [g.bx1, g.by0 - 13], [g.bx0 - 9, g.by1], [g.bx1, g.by1]]) pts.push(P(x + ox, y, 0), P(x + ox, y, top));
      }
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    }
    // local height on floor f of an absolute height (levels)
    lz(f, z) { return z - this.sim.grid.FZ[f]; }

    drawScene(alpha) {
      this.alpha = alpha;
      this.moving = this.movingTotes();
      for (const f of this.floorList.slice().sort((a, b) => b - a)) {
        this.setFloor(f);
        this.drawPlate(f);
        if (f === 0) this.drawGround(alpha); else if (f === 1) this.drawFirst(alpha); else this.drawSecond(alpha);
      }
      this.setFloor(null);
    }
    // The floor slab: concrete with a painted grid, its edge, the openings
    // the spirals and lifts pass through, and a low wall round the ground floor.
    drawPlate(f) {
      const g = this.sim.grid, P = this.P.bind(this), c = this.ctx, x0 = g.bx0, x1 = g.bx1, y0 = g.by0, y1 = g.by1;
      this.faceY(y1, x0, x1, -0.8, 0, '#273246'); this.faceX(x1, y0, y1, -0.8, 0, '#1d2636');
      this.poly([P(x0, y0, 0), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0)], f === 0 ? '#222d3e' : '#253145', 'rgba(148,163,184,0.45)', 1.5);
      c.globalAlpha = 0.35;
      for (let x = Math.ceil(x0); x <= x1; x += 4) this.line(P(x, y0, 0), P(x, y1, 0), '#2a364b', 1);
      for (let y = Math.ceil(y0); y <= y1; y += 4) this.line(P(x0, y, 0), P(x1, y, 0), '#2a364b', 1);
      c.globalAlpha = 1;
      // structural columns
      for (let x = x0 + 6; x < x1 - 2; x += 9) for (let y = y0 + 6; y < y1 - 2; y += 9) if (!this.inShaft(x, y)) this.box(x - 0.18, y - 0.18, 0, x + 0.18, y + 0.18, 0.5, '#3b4a5f');
      // openings for what passes through this slab
      for (const s of this.shafts(f)) { this.quadTop(s.x0, s.y0, s.x1, s.y1, 0.005, '#05080e', '#facc15', 1.2); }
      // walkway along the south side
      const wy = g.walkY[f];
      if (wy != null) { c.setLineDash([6, 6]); this.line(P(g.core.x1 + 0.3, wy - 0.55, 0.01), P(x1 - 1, wy - 0.55, 0.01), 'rgba(250,204,21,0.4)', 1.5); this.line(P(g.core.x1 + 0.3, wy + 0.55, 0.01), P(x1 - 1, wy + 0.55, 0.01), 'rgba(250,204,21,0.4)', 1.5); c.setLineDash([]); }
      if (f === 0) this.drawWalls();
      this.drawCore(f);
    }
    // what pierces floor f's slab: { x0, y0, x1, y1 }
    shafts(f) {
      const g = this.sim.grid, out = [], sq = (x, y, r) => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });
      if (f === 1) out.push(sq(g.giX, g.giY, 0.9));
      if (f >= 1) out.push(sq(g.parcel.cx, g.parcel.cy, RP + 0.45));
      if (f === 2) out.push(sq(g.up.cx, g.up.cy, R + 0.5), sq(g.down.cx, g.down.cy, R + 0.5));
      return out;
    }
    inShaft(x, y) { const g = this.sim.grid, c = g.core; return (x > c.x0 - 1 && x < c.x1 + 1 && y > c.y0 - 1 && y < c.y1 + 1) || [g.up, g.down, g.parcel].some((s) => Math.hypot(x - s.cx, y - s.cy) < 3) || Math.hypot(x - g.giX, y - g.giY) < 1.5; }

    // ---------------------------------------------------------------- belts and totes
    beltsOn(f) { return this.sim.net.belts.filter((b) => b.floor === f && !b.sloped); }
    drawBelts(f) {
      for (const b of this.beltsOn(f)) { this.conveyor(b.pts, 0.72, b.z, b.kind === 'loop' ? '#2b3a52' : null, { legs: true }); this.flowArrows(b.pts, b.z); }
    }
    // storage totes on the floor's belts (and the spirals rising from it), for the painter's list
    toteItems(f, items) {
      const sim = this.sim, a = this.alpha, T = sim.convTote(), g = sim.grid;
      for (const b of sim.net.belts) {
        if (b.floor !== f) continue;
        for (const t of b.totes) {
          const x = t.px + (t.x - t.px) * a, y = t.py + (t.y - t.py) * a, z = b.sloped ? this.lz(f, (t.pz ?? t.z) + (t.z - (t.pz ?? t.z)) * a) + 0.12 : b.z;
          items.push({ d: x + y + 0.3 + (b.sloped ? z * 0.02 : 0), fn: () => this.drawBin(x, y, z, t.bin.id, { w: T.w, d: T.d }) });
        }
      }
      for (const m of sim.vrcs) if (this.vrcFloor(m) === f) items.push({ d: m.x + m.y + 0.6, fn: () => this.drawVrcCar(m) });
      void g;
    }
    // A spiral conveyor: a steel column, the slat belt winding round it with a
    // guard rail on the outside, standing on floor f.
    coilItems(f, belt, r, items, col) {
      const p = belt.pts, n = p.length, w = 0.42, c = (p[0].x + p[n - 1].x) / 2;
      const cx = this.coilC(belt).x, cy = this.coilC(belt).y, top = Math.max(p[0].z, p[n - 1].z) - this.sim.grid.FZ[f];
      void c;
      items.push({ d: cx + cy, fn: () => { this.box(cx - 0.3, cy - 0.3, 0, cx + 0.3, cy + 0.3, top + 0.6, '#64748b', { top: '#94a3b8' }); this.box(cx - 0.45, cy - 0.45, 0, cx + 0.45, cy + 0.45, 0.3, '#334155'); } });
      for (let k = 1; k < n; k++) {
        const a = p[k - 1], b = p[k], za = this.lz(f, a.z), zb = this.lz(f, b.z);
        const ua = Math.atan2(a.y - cy, a.x - cx), ub = Math.atan2(b.y - cy, b.x - cx);
        const pt = (u, rr, z) => this.P(cx + Math.cos(u) * rr, cy + Math.sin(u) * rr, z);
        items.push({ d: (a.x + b.x) / 2 + (a.y + b.y) / 2 + za * 0.02, fn: () => {
          this.poly([pt(ua, r - w, za), pt(ua, r + w, za), pt(ub, r + w, zb), pt(ub, r - w, zb)], col, 'rgba(15,23,42,0.6)', 0.6);
          this.poly([pt(ua, r + w, za), pt(ub, r + w, zb), pt(ub, r + w, zb - 0.22), pt(ua, r + w, za - 0.22)], shade(col, -0.35));
          this.line(pt(ua, r + w, za + 0.45), pt(ub, r + w, zb + 0.45), '#facc15', 1.2);
        } });
      }
    }
    coilC(belt) { const g = this.sim.grid; return belt === this.sim.docks.spiral ? { x: g.parcel.cx, y: g.parcel.cy } : belt.name.includes('up') ? { x: g.up.cx, y: g.up.cy } : { x: g.down.cx, y: g.down.cy }; }
    // the floor a tote lift's carriage is drawn on: the floor it is at or above
    vrcFloor(m) { const g = this.sim.grid; let f = 0; for (let k = 0; k < 3; k++) if (m.z >= g.FZ[k] - 0.01) f = k; return m.stops.some((s) => s.floor === f) ? f : m.stops[0].floor; }
    // A tote lift's shaft: four cyan posts with mesh guards up through the
    // storey, the carriage drawn on the floor it is on.
    drawVrcShaft(m, f) {
      const g = this.sim.grid, lo = Math.min(...m.stops.map((s) => s.floor)), hi = Math.max(...m.stops.map((s) => s.floor));
      if (f < lo || f > hi) return;
      const top = f === hi ? g.convZ + 2.6 : g.FH[f], h = 0.78;
      for (const [dx, dy] of [[-h, -h], [h - 0.12, -h], [-h, h - 0.12], [h - 0.12, h - 0.12]]) this.box(m.x + dx, m.y + dy, 0, m.x + dx + 0.12, m.y + dy + 0.12, top, CYAN, { top: '#67e8f9' });
      if (f === hi) this.box(m.x - h, m.y - h, top, m.x + h, m.y + h, top + 0.3, '#0e7490', { top: '#22d3ee' });
      // mesh on the two sides the totes do not roll through
      const c = this.ctx; c.globalAlpha = 0.35;
      if (m.axis === 'y') { this.faceX(m.x + h, m.y - h, m.y + h, 0.3, Math.min(top, 6), '#0e7490'); this.faceX(m.x - h, m.y - h, m.y + h, 0.3, Math.min(top, 6), '#0e7490'); }
      else { this.faceY(m.y + h, m.x - h, m.x + h, 0.3, Math.min(top, 6), '#0e7490'); this.faceY(m.y - h, m.x - h, m.x + h, 0.3, Math.min(top, 6), '#0e7490'); }
      c.globalAlpha = 1;
    }
    drawVrcCar(m) {
      const sim = this.sim, f = this.f, z = this.lz(f, m.z), T = sim.convTote(), h = 0.72;
      this.box(m.x - h, m.y - h, z - 0.2, m.x + h, m.y + h, z - 0.05, '#0891b2', { top: '#164e63' });
      for (let k = 1; k < 6; k++) { const s = -h + (2 * h * k) / 6; if (m.axis === 'y') this.line(this.P(m.x - h + 0.05, m.y + s, z - 0.04), this.P(m.x + h - 0.05, m.y + s, z - 0.04), '#67e8f9', 1); else this.line(this.P(m.x + s, m.y - h + 0.05, z - 0.04), this.P(m.x + s, m.y + h - 0.05, z - 0.04), '#67e8f9', 1); }
      this.faceY(m.y + h + 0.002, m.x - 0.2, m.x + 0.2, z - 0.18, z - 0.07, WS.led(this, m, sim));
      for (const it of m.load) {
        let q = m.slot(it.slot);
        const r = m.roll;
        if (r && r.it === it) { const u = ease(Math.min(1, (sim.time - r.t0) / r.dur)); q = { x: r.a.x + (r.b.x - r.a.x) * u, y: r.a.y + (r.b.y - r.a.y) * u }; }
        this.drawBin(q.x, q.y, z, it.bin.id, { w: T.w, d: T.d });
      }
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === m.id;
      if (sel) this.quadTop(m.x - 0.95, m.y - 0.95, m.x + 0.95, m.y + 0.95, z, null, '#38bdf8', 2.5);
    }

    // ---------------------------------------------------------------- first floor
    drawFirst(alpha) {
      const sim = this.sim, g = sim.grid;
      this.drawBelts(1);
      this.drawRackScene((aisle) => this.aisleItems(aisle));
      this.drawSelectedCell();
      const items = [];
      for (const aisle of sim.aisles) items.push({ d: g.laneX(aisle.a) + g.B, fn: () => this.drawLift(aisle) });
      for (const m of sim.vrcs) items.push({ d: m.x + m.y, fn: () => this.drawVrcShaft(m, 1) });
      const L = sim.links;
      if (L.up.sp) this.coilItems(1, L.up.sp, R, items, '#2b3a52');
      if (L.down.sp) this.coilItems(1, L.down.sp, R, items, '#2b3a52');
      this.toteItems(1, items);
      this.workshop(items);
      this.props(1, items);
      items.sort((a, b) => a.d - b.d);
      for (const it of items) it.fn();
      void alpha;
    }
    // a corner for the technicians: a bench and a spare shuttle on a trolley
    workshop(items) {
      const g = this.sim.grid, x = g.W + 4, y = g.D + 4;
      items.push({ d: x + y, fn: () => {
        this.box(x, y, 0, x + 2.6, y + 1, 1.9, '#475569', { top: '#64748b' });
        this.box(x + 0.2, y + 0.1, 1.9, x + 0.9, y + 0.8, 2.3, '#f97316', { top: '#fdba74' });
        this.box(x + 3.2, y - 0.2, 0.2, x + 4.6, y + 1.2, 0.9, '#334155', { top: '#475569' });
        this.box(x + 3.3, y, 0.9, x + 4.5, y + 0.25, 1.3, '#f97316', { top: '#fdba74' }); this.box(x + 3.3, y + 0.75, 0.9, x + 4.5, y + 1.0, 1.3, '#f97316', { top: '#fdba74' });
      } });
    }

    // What else is on the floors (as in the 3D view): upstairs a glass control
    // room, packaging supplies and spare order totes; spare storage totes on
    // the first floor; pallet racking and a forklift on the ground floor.
    props(f, items) {
      const add = (d, fn) => items.push({ d, fn }), c = this.ctx;
      if (f === 2) {
        add(4, () => {
          this.quadTop(2, 2, 12, 8, 0.01, '#1e293b');
          for (let k = 0; k < 3; k++) this.box(2.9 + k * 2.9, 2.15, 1.2, 5.5 + k * 2.9, 2.3, 5.0, '#0f172a');
          for (const dy of [3.3, 5.6]) this.box(3, 2 + dy - 0.3, 1.4, 11, 2 + dy + 0.3, 1.5, '#cbd5e1');
          c.globalAlpha = 0.35; this.faceY(8, 2, 12, 0, 5.2, '#9cc9f0'); this.faceX(12, 2, 8, 0, 5.2, '#9cc9f0'); c.globalAlpha = 1;
        });
        for (let r = 0; r < 2; r++) for (let x = 16; x <= 30; x += 2.8) { const y = 3.5 + r * 2.2; add(x + y, () => { for (let l = 0; l < 4; l++) { this.box(x, y, 0.3 + l * 1.4, x + 2.66, y + 0.96, 0.38 + l * 1.4, '#f59e0b'); this.box(x + 0.15, y + 0.12, 0.38 + l * 1.4, x + 2.5, y + 0.84, 0.9 + l * 1.4, '#b8875a', { top: '#d2a676' }); } }); }
        for (let k = 0; k < 8; k++) { const x = 17 + (k % 4) * 1.2, y = 13 + Math.floor(k / 4) * 1.4; add(x + y, () => this.drawToteStack(x, y, 6 + (k * 5) % 6)); }
      }
      if (f === 1) for (let k = 0; k < 6; k++) { const x = 3 + (k % 3) * 2.2, y = this.sim.grid.D + 3.5 + Math.floor(k / 3) * 2; add(x + y, () => { this.palletDeck(x - 0.6, y, 0); this.box(x - 0.8, y - 0.5, 0.4, x + 0.8, y + 0.5, 0.4 + (4 + (k % 3)) * 0.85, '#64748b', { top: '#7d8ca3' }); }); }
      if (f === 0) {
        for (const [y0, y1] of [[10, 11.3], [11.5, 12.8]]) add(13 + y0, () => {
          for (let x = 13; x <= 33.01; x += 2.8) this.box(x, y0, 0, x + 0.1, y0 + 0.1, 8.2, '#1d4ed8');
          for (let l = 1; l <= 3; l++) { const z = l * 2.6 - 0.3; this.box(13, y0, z, 33.1, y1, z + 0.25, '#f97316'); for (let x = 13; x < 33; x += 2.8) this.parcel(x + 0.85, y0 + 0.1, x + 1.95, y1 - 0.1, z + 0.25, 1.5); }
        });
        add(22.5, () => { this.box(8.6, 12.9, 0.3, 9.4, 14.2, 1.6, '#eab308', { top: '#fde047' }); this.box(8.6, 12.6, 0.2, 9.4, 12.7, 5.0, '#334155'); this.box(8.7, 11.8, 0.2, 9.3, 12.6, 0.3, '#475569'); this.box(8.6, 13, 4.4, 9.4, 14, 4.5, '#1f2937'); });
      }
    }

    // ---------------------------------------------------------------- second floor
    drawSecond(alpha) {
      const sim = this.sim, g = sim.grid, L = sim.layout, oms = sim.oms, CZ = this.CZ, items = [], add = (d, fn) => items.push({ d, fn });
      this.drawBelts(2);
      // the spirals' top turns above this slab, the parcel spiral's start
      for (const s of [sim.links.up.sp, sim.links.down.sp]) if (s) this.landing(2, s, R, items);
      this.landing(2, sim.docks.spiral, RP, items);
      for (const m of sim.vrcs) items.push({ d: m.x + m.y, fn: () => this.drawVrcShaft(m, 2) });
      // takeaway conveyor, spurs to the packers, parcel lines to the parcel spiral
      const picks = sim.ports.filter((p) => p.floor === 2), lastPk = L.packerPos(oms.packers.length - 1);
      add(g.D + 2, () => {
        this.conveyor([{ x: 1.2, y: L.takeawayY }, { x: lastPk.x, y: L.takeawayY }], 0.5, 1.6);
        for (const p of picks) { const y = L.backLaneY(p); this.conveyor([{ x: L.backLaneX(p), y }, { x: L.spurX(p), y }, { x: L.spurX(p), y: L.takeawayY - 0.25 }], 0.45, 1.6); }
        for (const pk of oms.packers) { const q = L.packerPos(pk.idx); this.conveyor([{ x: q.x, y: L.takeawayY + 0.25 }, { x: q.x, y: q.y - 0.75 }], 0.45, 1.6); }
      });
      add(g.D + 5, () => {
        for (const pk of oms.packers) this.conveyor(L.parcelRoute(pk.idx).slice(0, 2), 0.45, 1.4, '#2b3646');
        const r = L.parcelRoute(0);
        this.conveyor([{ x: L.packerPos(0).x, y: r[1].y }, r[2], r[3], r[4]], 0.45, 1.4, '#2b3646');
      });
      for (const p of picks) {
        this.drawPortBody(p, add);
        const op = L.operatorPos(p);
        if (this.atStation(p)) add(op.x + op.y + 0.5, () => this.drawOperator(op.x, op.y, !!(p.job && p.job.next < p.job.lines.length && p.mode === 'auto'), '#f97316', 0, 'port' + p.idx));
        this.putWall(p, add);
        const st = L.toteStack(p);
        add(st.x + st.y, () => this.drawToteStack(st.x, st.y, p.stack ? p.stack.length : 0));
        add(op.x + op.y + 1.2, () => this.crossover(op.x, g.D));
      }
      for (const pk of oms.packers) {
        const q = L.packerPos(pk.idx);
        add(q.x + q.y, () => { if (pk.kind === 'bagger') this.drawBagger(pk, q); else if (pk.kind === 'boxer') this.drawBoxMaker(pk, q); else this.drawPackBench(pk, q); });
        const o = L.packerOperator(pk);
        add(o.x + o.y, () => this.drawOperator(o.x, o.y, !!pk.cur, '#38bdf8'));
      }
      for (const it of oms.conveyor) {
        const q = oms.posOnPath(it);
        add(q.x + q.y + 0.3, () => { if (it.kind === 'tote') this.orderTote(q.x, q.y, q.z ?? 1.6, 1, 0.85); else if (it.order.pack === 'bagger') this.bag(q.x, q.y, 1.4, true); else this.parcel(q.x - 0.18, q.y - 0.16, q.x + 0.18, q.y + 0.16, 1.4, 0.6, { label: true }); });
      }
      this.toteItems(2, items);
      this.peopleItems(2, items);
      this.props(2, items);
      items.sort((a, b) => a.d - b.d);
      for (const it of items) it.fn();
      void CZ; void alpha;
    }
    // the part of a spiral above floor f's slab
    landing(f, belt, r, items) {
      const g = this.sim.grid, z0 = g.FZ[f], c = this.coilC(belt), p = belt.pts.filter((q) => q.z >= z0 - 0.01);
      if (p.length < 2) return;
      const fake = { pts: p, name: belt.name };
      void c;
      this.coilItems(f, Object.assign(fake, { pts: p }), r, items, belt === this.sim.docks.spiral ? '#2b3646' : '#2b3a52');
    }
    // put wall: frame, order totes in their slots, a light per slot (as WS.IsoRenderer)
    putWall(p, add) {
      const L = this.sim.layout, oms = this.sim.oms, CZ = this.CZ, s0 = L.slotPos(p, 0);
      add(s0.x + s0.y, () => {
        const wx0 = s0.x - 0.3, wx1 = L.slotPos(p, p.slots.length - 1).x + 0.34, wy0 = s0.y - 0.35, wy1 = s0.y + 0.35;
        this.box(wx0, wy0, 0, wx1, wy1, CZ - 0.1, '#334155');
        for (const xx of [wx0, wx1 - 0.08]) this.box(xx, wy0, CZ, xx + 0.08, wy0 + 0.08, 4.6, '#64748b');
        this.box(wx0, wy0, 4.5, wx1, wy0 + 0.1, 4.7, '#64748b');
        const ln = p.currentLine;
        p.slots.forEach((o, k) => {
          const q = L.slotPos(p, k);
          if (o) { const units = oms.units(o), picked = o.lines.reduce((s, l) => s + l.picked, 0), t = this.slotTote(p, k, o); this.orderTote(t.x, t.y, t.z, picked / units); }
          const target = ln && ln.order === o;
          this.box(q.x - 0.1, wy0, 4.15, q.x + 0.1, wy0 + 0.12, 4.4, target ? '#4ade80' : o ? '#e2e8f0' : '#334155');
          if (target) this.glow(q.x, wy0, 4.3, 26, '#4ade80', 0.65 + 0.3 * Math.sin(this.t * 9));
        });
      });
    }
    // steps over the takeaway conveyor behind a station's operator
    crossover(x, D) {
      const y0 = D + 2.55, y1 = D + 3.85, zt = 2.6, w = 0.32;
      for (let k = 0; k < 3; k++) { const z = ((k + 1) * zt) / 3; this.box(x - w, y0 + k * 0.12, 0, x + w, y0 + (k + 1) * 0.12, z, '#64748b', { top: '#facc15' }); this.box(x - w, y1 - (k + 1) * 0.12, 0, x + w, y1 - k * 0.12, z, '#64748b', { top: '#facc15' }); }
      this.box(x - w, y0 + 0.36, zt - 0.12, x + w, y1 - 0.36, zt, '#64748b', { top: '#94a3b8' });
      for (const xx of [x - w, x + w - 0.04]) this.box(xx, y0 + 0.36, zt, xx + 0.04, y1 - 0.36, zt + 1.6, '#facc15');
    }
    atStation(p) { const P = p.person; return !P || P.state === 'AT_STATION'; }

    // ---------------------------------------------------------------- ground floor
    drawGround(alpha) {
      const sim = this.sim, g = sim.grid, L = sim.layout, d = sim.docks, items = [], add = (dd, fn) => items.push({ d: dd, fn });
      this.drawDockFloor();
      this.drawBelts(0);
      for (const m of sim.vrcs) items.push({ d: m.x + m.y, fn: () => this.drawVrcShaft(m, 0) });
      // the sorter loop runs high on posts; the chutes drop to the roll cages
      for (const b of sim.pnet.belts) if (!b.sloped) add(Math.min(...b.pts.map((q) => q.x + q.y)) - 1, () => { this.conveyor(b.pts, 0.62, b.z, '#2b3646', { legs: true }); this.flowArrows(b.pts, b.z); });
      for (const ch of d.chutes) this.chuteItems(ch, items);
      this.coilItems(0, d.spiral, RP, items, '#2b3646');
      for (const b of sim.pnet.belts) for (const t of b.totes) {
        const a = alpha, x = t.px + (t.x - t.px) * a, y = t.py + (t.y - t.py) * a, z = b.sloped ? (t.pz ?? t.z) + (t.z - (t.pz ?? t.z)) * a + 0.1 : b.z;
        add(x + y + 0.35 + (b.sloped ? z * 0.02 : 0), () => this.parcelOn(t, x, y, z));
      }
      // goods-in stations and their pallets
      for (const p of sim.ports.filter((q) => q.floor === 0)) {
        this.drawPortBody(p, add);
        const op = L.operatorPos(p);
        if (this.atStation(p)) add(op.x + op.y + 0.5, () => this.drawOperator(op.x, op.y, !!(p.job && p.job.next < p.job.lines.length && p.mode === 'auto'), '#22c55e', 0, 'port' + p.idx));
        for (let k = 0; k < 2; k++) { const s = d.palletSpot(p, k); add(s.x + s.y, () => this.pallet(s.x, s.y, k < p.pallets ? 1 - (k === p.pallets - 1 ? (p.cases % sim.cfg.casesPerPallet) / sim.cfg.casesPerPallet : 0) : 0, k < p.pallets)); }
        if (p.empties) { const s = d.palletSpot(p, 0); add(s.x + s.y + 1.5, () => { for (let k = 0; k < p.empties; k++) this.palletDeck(s.x + 0.7, s.y + 1.5, k * 0.26); }); }
      }
      for (const s of d.staging) add(s.x + s.y, () => this.pallet(s.x, s.y, s.full === true ? 1 : 0, s.full === true));
      for (const door of d.doors) { door.staged.forEach((cg, k) => { const s = d.stagedSpot(door, k); add(s.x + s.y, () => this.cage(s.x, s.y, cg.items.length, door.carrier)); }); add(door.x + 2.2, () => this.emptyCages(door.x, 0.2, door.empties)); }
      this.canteen(items);
      this.props(0, items);
      this.toteItems(0, items);
      this.peopleItems(0, items);
      items.sort((a, b) => a.d - b.d);
      for (const it of items) it.fn();
      // trucks outside, in front of everything inside on this side
      for (const door of d.doors) this.outTruck(door);
      for (const door of d.inDoors) this.inTruck(door);
    }
    // painted lines: the dock zone along the north wall, staging lanes inside the inbound doors
    drawDockFloor() {
      const g = this.sim.grid, P = this.P.bind(this);
      this.quadTop(g.bx0 + 0.2, g.by0 + 0.2, g.bx1 - 0.2, 2.2, 0.004, 'rgba(250,204,21,0.05)');
      for (const d of this.sim.docks.doors) { this.quadTop(d.x - 1.7, g.by0 + 0.1, d.x + 1.7, -0.2, 0.006, 'rgba(250,204,21,0.12)', 'rgba(250,204,21,0.55)', 1.2); }
      for (const s of this.sim.docks.staging) this.quadTop(s.x - 0.2, s.y - 0.75, s.x + 1.4, s.y + 0.75, 0.006, null, 'rgba(163,230,53,0.45)', 1);
      this.line(P(g.bx0 + 0.3, 17, 0.01), P(-5.6, 17, 0.01), 'rgba(163,230,53,0.4)', 1.5);
    }
    // the walls round the ground floor, low so the floor shows, with the dock doors
    drawWalls() {
      const g = this.sim.grid, d = this.sim.docks, z = 1.2, x0 = g.bx0, x1 = g.bx1, y0 = g.by0, y1 = g.by1;
      // north wall, with the outbound doors
      let s = x0;
      for (const door of d ? d.doors : []) { this.box(s, y0 - 0.3, 0, door.x - 1.7, y0, z, '#4b5563'); this.box(door.x - 1.85, y0 - 0.35, 0, door.x - 1.7, y0 + 0.05, 7.5, '#facc15'); this.box(door.x + 1.7, y0 - 0.35, 0, door.x + 1.85, y0 + 0.05, 7.5, '#facc15'); s = door.x + 1.7; }
      this.box(s, y0 - 0.3, 0, x1, y0, z, '#4b5563');
      // west wall, with the inbound doors
      let t = y0;
      for (const door of d ? d.inDoors : []) { this.box(x0 - 0.3, t, 0, x0, door.y - 1.6, z, '#4b5563'); this.box(x0 - 0.35, door.y - 1.75, 0, x0 + 0.05, door.y - 1.6, 7.5, '#facc15'); this.box(x0 - 0.35, door.y + 1.6, 0, x0 + 0.05, door.y + 1.75, 7.5, '#facc15'); t = door.y + 1.6; }
      this.box(x0 - 0.3, t, 0, x0, y1, z, '#4b5563');
    }
    // A chute: a stainless slide from the sorter down to its roll cage, the
    // cage with the parcels in it, a red light while it is closed.
    chuteItems(ch, items) {
      const sim = this.sim, g = sim.grid, p = ch.belt.pts, cy = g.cageY, x = ch.x;
      items.push({ d: x + p[1].y - 0.5, fn: () => {
        for (let k = 1; k < p.length; k++) {
          const a = p[k - 1], b = p[k], w = 0.36;
          this.poly([this.P(x - w, a.y, a.z), this.P(x + w, a.y, a.z), this.P(x + w, b.y, b.z), this.P(x - w, b.y, b.z)], '#cbd5e1', 'rgba(15,23,42,0.5)', 0.6);
          this.poly([this.P(x + w, a.y, a.z), this.P(x + w, b.y, b.z), this.P(x + w, b.y, b.z + 0.35), this.P(x + w, a.y, a.z + 0.35)], '#94a3b8');
        }
        this.box(x - 0.05, p[1].y - 0.05, 0, x + 0.05, p[1].y + 0.05, p[1].z, STEEL);
        const open = sim.docks.open(ch);
        this.box(x + 0.4, p[1].y, p[1].z + 0.2, x + 0.52, p[1].y + 0.12, p[1].z + 0.55, open ? '#22c55e' : '#ef4444', { top: open ? '#86efac' : '#fca5a5' });
        if (!open) this.glow(x + 0.46, p[1].y, p[1].z + 0.4, 12, '#ef4444', 0.5);
      } });
      if (ch.cage) items.push({ d: x + cy, fn: () => this.cage(x, cy, ch.cage.items.length, ch.carrier) });
    }
    // A roll cage: wire mesh sides on a wheeled base, parcels stacked inside.
    cage(x, y, n, carrier) {
      const w = 0.55, d = 0.5, h = 3.6, P = this.P.bind(this), col = '#94a3b8', c = this.ctx;
      this.box(x - w, y - d, 0.15, x + w, y + d, 0.3, '#475569', { top: '#64748b' });
      for (const [dx, dy] of [[-w, -d], [w - 0.05, -d], [-w, d - 0.05], [w - 0.05, d - 0.05]]) this.box(x + dx, y + dy, 0, x + dx + 0.05, y + dy + 0.05, 0.15, '#0b0f17');
      const cap = this.sim.cfg.cageCap, rows = 5, per = Math.ceil(cap / rows);
      for (let k = 0; k < Math.min(n, cap); k++) {
        const r = Math.floor(k / per), j = k % per, cx = x - w + 0.08 + (j % 2) * (w - 0.05), cy = y - d + 0.08 + Math.floor(j / 2) * 0.45;
        this.parcel(cx, cy, cx + w - 0.12, cy + 0.38, 0.3 + r * 0.66, 0.6, {});
      }
      c.globalAlpha = 0.85;
      for (const [ax, ay, bx, by] of [[-w, d, w, d], [w, -d, w, d]]) {
        for (let k = 0; k <= 4; k++) { const f = k / 4; this.line(P(x + ax + (bx - ax) * f, y + ay + (by - ay) * f, 0.3), P(x + ax + (bx - ax) * f, y + ay + (by - ay) * f, h), col, 0.8); }
        for (let z = 0.3; z <= h; z += 0.55) this.line(P(x + ax, y + ay, z), P(x + bx, y + by, z), col, 0.8);
      }
      for (const [ax, ay] of [[-w, -d], [w, -d], [-w, d], [w, d]]) this.line(P(x + ax, y + ay, 0.3), P(x + ax, y + ay, h), '#e2e8f0', 1.4);
      c.globalAlpha = 1;
      if (carrier) this.faceY(y + d + 0.002, x - 0.25, x + 0.25, h - 0.5, h - 0.15, CARRIER_COL[carrier.code]);
    }
    emptyCages(x, y, n) { for (let k = 0; k < Math.min(n, 6); k++) this.box(x - 0.55, y - 0.2 + k * 0.12, 0.15, x + 0.55, y - 0.08 + k * 0.12, 3.4, '#94a3b8', { top: '#cbd5e1', left: 'rgba(148,163,184,0.35)', right: 'rgba(100,116,139,0.35)' }); }
    // a parcel on the parcel belts: a sealed bag or a labelled carton
    parcelOn(t, x, y, z) {
      if (t.bag) this.bag(x, y, z, true);
      else this.parcel(x - 0.2, y - 0.17, x + 0.2, y + 0.17, z, 0.55, { label: true });
      if (this.opts.heat) this.quadTop(x - 0.12, y - 0.12, x + 0.12, y + 0.12, z + 0.6, CARRIER_COL[t.carrier.code]);
    }
    // A wooden pallet with cartons on it, fill 0 … 1.
    pallet(x, y, fill, full) {
      this.palletDeck(x, y, 0);
      if (!full) return;
      const n = Math.max(1, Math.ceil(fill * 8));
      for (let j = 0; j < n; j++) { const cx = x + 0.05 + (j % 2) * 0.56, cy = y - 0.55 + ((j >> 1) % 2) * 0.56, cz = 0.4 + Math.floor(j / 4) * 1.1; this.parcel(cx, cy, cx + 0.53, cy + 0.53, cz, 1.05); }
    }
    palletDeck(x, y, z) {
      for (const bx of [0, 0.5, 1.0]) this.box(x + bx, y - 0.6, z, x + bx + 0.2, y + 0.6, z + 0.25, '#8a5a1c');
      for (let s = 0; s < 5; s++) this.box(x, y - 0.6 + s * 0.25, z + 0.25, x + 1.2, y - 0.6 + s * 0.25 + 0.2, z + 0.4, '#b07a2e', { top: '#c9933f' });
    }

    // ---------------------------------------------------------------- trucks
    // A rigid truck backed up to a door: the box body with the carrier's
    // colours, its doors open while it is docked, the cab at the far end.
    // dir: the way it points from the door outwards ('N' or 'W').
    truck(x, y, dir, off, col, label, fill, open) {
      const L = 11, W = 1.9, H = 7.2, P = this.P.bind(this);
      if (dir === 'N') {
        const y1 = y - off, y0 = y1 - L;
        this.box(x - W / 2, y0 - 3.2, 0.6, x + W / 2, y0 - 0.1, 5.4, col, { top: shade(col, 0.25) });
        this.faceY(y0 - 0.1 + 0.002, x - W / 2 + 0.15, x + W / 2 - 0.15, 3.4, 4.9, '#13283e');
        this.box(x - W / 2, y0, 0.8, x + W / 2, y1, H, '#e5e7eb', { left: '#cbd5e1', right: '#94a3b8', top: '#f8fafc' });
        for (const wy of [y0 + 1.2, y0 + 2.4, y1 - 1.4]) this.wheelX(x + W / 2 + 0.01, wy, 0.75, 0.32, 0.75);
        this.faceX(x + W / 2 + 0.003, y0 + 0.6, y1 - 0.6, 5.6, 6.5, col);
        this.faceX(x + W / 2 + 0.004, y0 + 0.6, y0 + 0.6 + (L - 1.2) * fill, 1.2, 1.7, '#b08850');
        this.faceY(y1 + 0.003, x - W / 2 + 0.1, x + W / 2 - 0.1, 0.9, H - 0.2, open ? '#0b1220' : '#d1d5db');
        this.text(label, x + W / 2, (y0 + y1) / 2, H + 0.9, { size: 10, color: '#0f172a', weight: 700, bg: 'rgba(241,245,249,0.85)' });
      } else {
        const x1 = x - off, x0 = x1 - L;
        this.box(x0 - 3.2, y - W / 2, 0.6, x0 - 0.1, y + W / 2, 5.4, col, { top: shade(col, 0.25) });
        this.box(x0, y - W / 2, 0.8, x1, y + W / 2, H, '#e5e7eb', { left: '#cbd5e1', right: '#94a3b8', top: '#f8fafc' });
        for (const wx of [x0 + 1.2, x0 + 2.4, x1 - 1.4]) this.wheelY(wx, y + W / 2 + 0.01, 0.75, 0.32, 0.75);
        this.faceY(y + W / 2 + 0.003, x0 + 0.6, x1 - 0.6, 5.6, 6.5, col);
        this.text(label, (x0 + x1) / 2, y, H + 0.9, { size: 10, color: '#0f172a', weight: 700, bg: 'rgba(241,245,249,0.85)' });
      }
      void P;
    }
    truckOff(tr) {
      if (!tr) return null;
      if (tr.state === 'ARRIVING') return Math.pow(1 - Math.min(1, tr.t / 20), 2) * 14;
      if (tr.state === 'LEAVING') return tr.t < 6 ? 0 : Math.pow((tr.t - 6) / 18, 2) * 16;
      return 0;
    }
    outTruck(door) {
      const tr = door.truck, g = this.sim.grid;
      if (!tr) return;
      this.truck(door.x, g.by0 - 0.35, 'N', this.truckOff(tr), CARRIER_COL[door.carrier.code], `${door.carrier.name} · ${tr.cages.length}/${this.sim.cfg.truckCages}`, tr.cages.length / this.sim.cfg.truckCages, tr.state === 'DOCKED');
    }
    inTruck(door) {
      const tr = door.truck, g = this.sim.grid;
      if (!tr) return;
      this.truck(g.bx0 - 0.35, door.y, 'W', this.truckOff(tr), '#a16207', `${tr.id} · ${tr.pallets} pallets`, 0, tr.state === 'DOCKED');
    }

    // ---------------------------------------------------------------- the staff core and the canteen
    // The goods lift's shaft on every floor, its car where it is, the stairs beside it.
    drawCore(f) {
      const sim = this.sim, g = sim.grid, c = g.core, lift = sim.people.lift, H = f === 2 ? g.FH[2] - 1 : g.FH[f];
      this.box(c.x0, c.y0, 0, c.x0 + 0.2, c.y1, H, '#64748b', { top: '#94a3b8' });
      this.box(c.x0, c.y0, 0, c.x1, c.y0 + 0.2, H, '#64748b', { top: '#94a3b8' });
      // the car on this floor (or on its way up from it)
      const z = lift.z - g.FZ[f];
      if (z > -0.01 && z < g.FH[f] - 0.1) {
        this.box(c.x0 + 0.25, c.y0 + 0.25, z, c.x1 - 0.15, c.y1 - 0.25, z + 0.15, '#334155', { top: '#475569' });
        for (const P of lift.riders) if (P.inLift) this.drawOperator(P.x, P.y, false, P.vest, z + 0.15, P.look);
        this.box(c.x0 + 0.25, c.y0 + 0.25, z + 4.6, c.x1 - 0.15, c.y1 - 0.25, z + 4.8, '#475569');
      }
      // the landing doors: they slide open while the car is here
      const here = lift.floor === f, w = (c.y1 - c.y0 - 0.5) / 2, o = here ? lift.door * w * 0.95 : 0, mid = (c.y0 + c.y1) / 2;
      this.box(c.x1 - 0.08, c.y0 + 0.25, 0, c.x1, mid - o, 4.8, '#94a3b8', { top: '#cbd5e1' });
      this.box(c.x1 - 0.08, mid + o, 0, c.x1, c.y1 - 0.25, 4.8, '#94a3b8', { top: '#cbd5e1' });
      this.box(c.x1 - 0.1, c.y0, 4.8, c.x1, c.y1, 5.4, '#475569');
      this.faceX(c.x1 + 0.002, mid - 0.25, mid + 0.25, 5.0, 5.3, here ? '#4ade80' : '#1f2937');
      // stairs along the core's south side
      for (let k = 0; k < 8; k++) this.box(c.x0 + k * 0.35, c.y1 + 0.2, 0, c.x0 + (k + 1) * 0.35, c.y1 + 1.4, (k + 1) * 0.55, '#475569', { top: '#64748b' });
    }
    canteen(items) {
      const sim = this.sim, g = sim.grid, C = g.canteen;
      items.push({ d: C.x0 + C.y0, fn: () => {
        this.quadTop(C.x0, C.y0, C.x1, C.y1, 0.004, 'rgba(56,189,248,0.07)', 'rgba(56,189,248,0.35)', 1);
        this.box(C.x0 + 0.2, C.y0 + 0.6, 0, C.x0 + 1.0, C.y1 - 0.4, 2.0, '#e2e8f0', { top: '#f8fafc' }); // counter
        this.box(C.x0 + 0.3, C.y0 + 0.8, 2.0, C.x0 + 0.8, C.y0 + 1.3, 3.0, '#1f2937'); // coffee machine
        this.text('CANTEEN', (C.x0 + C.x1) / 2, C.y1 - 0.3, 0.3, { size: 9, color: '#7dd3fc' });
      } });
      const done = new Set();
      for (const s of sim.people.seats) {
        const k = s.tx + ',' + s.ty;
        if (!done.has(k)) { done.add(k); items.push({ d: s.tx + s.ty, fn: () => { this.box(s.tx - 0.55, s.ty - 0.45, 1.5, s.tx + 0.55, s.ty + 0.45, 1.65, '#a16207', { top: '#ca8a04' }); this.box(s.tx - 0.05, s.ty - 0.05, 0, s.tx + 0.05, s.ty + 0.05, 1.5, '#334155'); } }); }
        items.push({ d: s.x + s.y - 0.1, fn: () => this.box(s.x - 0.2, s.y - 0.2, 0.9, s.x + 0.2, s.y + 0.2, 1.05, '#334155', { top: '#475569' }) });
      }
    }
    // people walking, sitting in the canteen, pushing a cage or a pallet jack
    peopleItems(f, items) {
      const sim = this.sim, a = this.alpha;
      for (const P of sim.people.list) {
        if (P.floor !== f || P.inLift || (P.port && P.state === 'AT_STATION')) continue;
        const x = P.px + (P.x - P.px) * a, y = P.py + (P.y - P.py) * a, z = P.pz + (P.z - P.pz) * a;
        items.push({ d: x + y + 0.5, fn: () => {
          if (P.carry === 'pallet') { const dx = Math.cos(P.heading) * 0.9, dy = Math.sin(P.heading) * 0.9; this.box(x + dx - 0.6, y + dy - 0.4, 0.05, x + dx + 0.6, y + dy + 0.4, 0.3, '#f59e0b'); this.pallet(x + dx - 0.6, y + dy, 1, true); }
          else if (P.carry) { const dx = Math.cos(P.heading) * 0.85, dy = Math.sin(P.heading) * 0.85; this.cage(x + dx, y + dy, P.carry.items.length, P.carry.carrier); }
          this.drawOperator(x, y, P.moving, P.vest, z + (P.state === 'BREAK' ? -0.9 : 0), P.look);
        } });
      }
    }

    // ---------------------------------------------------------------- labels
    drawLabels() {
      const sim = this.sim, g = sim.grid, L = sim.layout, bg = 'rgba(15,23,42,0.82)';
      for (const f of this.floorList) {
        this.setFloor(f);
        this.text(TITLE[f], g.bx0 + 0.5, g.by0 - 1.5, 0, { size: 13, bg, color: '#f8fafc', weight: 800, align: 'left' });
        if (f === 1) {
          for (const aisle of sim.aisles) this.text(`AISLE ${aisle.a + 1}`, g.laneX(aisle.a), g.B + 0.5, g.Z + 1.8, { size: 10, bg, color: '#fde68a' });
          this.text(sim.links.up.sp ? '▲ SPIRAL UP · to the pick stations' : '▲ LIFT UP · to the pick stations', g.up.cx, g.up.cy, g.FH[1] + 3, { size: 10, bg, color: '#67e8f9' });
          this.text(sim.links.down.sp ? '▼ SPIRAL DOWN · back to the store' : '▼ LIFT DOWN · back to the store', g.down.cx, g.down.cy, g.FH[1] + 3, { size: 10, bg, color: '#67e8f9' });
          this.text('▼ TOTE LIFT · goods-in', g.giX, g.giY, g.convZ + 4.5, { size: 10, bg, color: '#67e8f9' });
        }
        for (const p of sim.ports) {
          if (p.floor !== f) continue;
          const st = p.away ? 'BREAK' : p.job ? (p.mode === 'manual' ? 'MANUAL' : 'ACTIVE') : p.inQ.length ? 'INBOUND' : 'WAITING';
          this.text(`${p.code} ${p.kind === 'PICK' ? 'PICK' : 'GOODS-IN'} · ${st}`, p.drop.x + 1, g.D + 0.2, 6.2, { size: 10, bg, color: p.kind === 'PICK' ? '#fdba74' : '#86efac' });
        }
        if (f === 2) for (const pk of sim.oms.packers) { const q = L.packerPos(pk.idx); this.text(`${pk.name} · ${pk.queue.length} queued`, q.x, q.y, 4.6, { size: 10, bg, color: '#7dd3fc' }); }
        if (f === 2) this.text('▼ PARCEL SPIRAL · to the sorter', g.parcel.cx, g.parcel.cy, 4.5, { size: 10, bg, color: '#c4b5fd' });
        if (f === 0) {
          for (const d of sim.docks.doors) this.text(`DOOR ${d.k + 1} · ${d.carrier.name}`, d.x, g.by0 + 0.6, 8.6, { size: 10, bg, color: CARRIER_COL[d.carrier.code] });
          this.text('SORTER', g.sortX0 + 2, g.sortY, g.SZ + 1.6, { size: 10, bg, color: '#c4b5fd' });
          this.text('GOODS RECEIVING', -8.5, 12, 3.2, { size: 10, bg, color: '#86efac' });
        }
        this.text(['GOODS LIFT', 'GOODS LIFT', 'GOODS LIFT'][f], g.core.cx, g.core.cy, 6, { size: 9, bg, color: '#e2e8f0' });
      }
      this.setFloor(null);
    }

    // ---------------------------------------------------------------- picking
    pick(sx, sy) {
      const order = this.floorList.slice().sort((a, b) => a - b);
      for (const f of order) {
        this.setFloor(f);
        const hit = this.pickOn(f, sx, sy);
        if (hit) { this.setFloor(null); return hit; }
      }
      this.setFloor(null);
      return null;
    }
    pickOn(f, sx, sy) {
      const sim = this.sim, g = sim.grid, L = sim.layout, near = (x, y, z, r = 18) => this.screenDist(sx, sy, x, y, z) < r * Math.max(1, this.cam.zoom);
      // machines: shuttles and aisle lifts on the first floor, the tote lifts where they are
      for (const m of sim.vrcs) if (this.vrcFloor(m) === f && near(m.x, m.y, this.lz(f, m.z))) return { kind: 'robot', id: m.id };
      if (f === 1) {
        const m = this.pickMachine(sx, sy);
        if (m) return m;
        for (let l = g.L - 1; l >= 0; l--) {
          const w = this.toWorld(sx, sy, g.levelZ(l) + 0.5), a = Math.floor(w.x / 3), part = Math.floor(w.x - a * 3);
          if (a < 0 || a >= g.A || w.y < 0 || w.y >= g.B || part === 1) continue;
          return { kind: 'cell', id: sim.mapGrid.idx(sim.mapGrid.colX(a, part), g.L - 1 - l) };
        }
      }
      for (const P of sim.people.list) if (P.floor === f && !P.inLift && !(P.port && P.state === 'AT_STATION') && near(P.x, P.y, P.z + 2)) return { kind: 'person', id: P.id };
      const w = this.toWorld(sx, sy, 1.5);
      if (f === 1) { for (const k of ['up', 'down']) { const s = g[k]; if (Math.hypot(w.x - s.cx, w.y - s.cy) < R + 0.6) return { kind: 'link', id: k }; } }
      if (f === 2 || f === 0) {
        for (const p of sim.ports) if (p.floor === f && w.x >= p.drop.x && w.x <= p.drop.x + 4.6 && w.y >= g.D && w.y <= g.D + 2.8) return { kind: 'port', id: p.idx };
      }
      if (f === 2) for (const pk of sim.oms.packers) { const q = L.packerPos(pk.idx); if (Math.abs(w.x - q.x) < 1.2 && Math.abs(w.y - q.y) < 1.2) return { kind: 'packer', id: pk.idx }; }
      if (f === 0) {
        const w0 = this.toWorld(sx, sy, 0);
        for (const ch of sim.docks.chutes) if (Math.abs(w0.x - ch.x) < 0.8 && w0.y > g.cageY - 0.8 && w0.y < g.sortY) return { kind: 'chute', id: ch.idx };
        for (const d of sim.docks.doors) if (Math.abs(w0.x - d.x) < 2 && w0.y < g.by0 + 1 && w0.y > g.by0 - 16) return { kind: 'door', id: d.k };
        const ws = this.toWorld(sx, sy, 8);
        if (Math.hypot(ws.x - g.parcel.cx, ws.y - g.parcel.cy) < RP + 0.8) return { kind: 'link', id: 'parcel' };
        if (ws.x > g.sortX0 && ws.x < g.sortX1 && ws.y > g.sortY - 0.5 && ws.y < g.sortRY + 0.5) return { kind: 'link', id: 'sorter' };
        const C = g.canteen;
        if (w0.x > C.x0 && w0.x < C.x1 && w0.y > C.y0 && w0.y < C.y1) return { kind: 'canteen', id: 0 };
      }
      const c = g.core;
      if (w.x > c.x0 - 0.3 && w.x < c.x1 + 0.3 && w.y > c.y0 - 0.3 && w.y < c.y1 + 0.3) return { kind: 'staff', id: 0 };
      // on the slab, nothing in particular
      const w0 = this.toWorld(sx, sy, 0);
      if (w0.x > g.bx0 && w0.x < g.bx1 && w0.y > g.by0 && w0.y < g.by1) return f === 1 ? null : null;
      return null;
    }
  }

  WS.TowerRenderer = TowerRenderer;
})((globalThis.WS = globalThis.WS || {}));
