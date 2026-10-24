/* LayerLift in the free 3D view, one cell a metre. Along the north wall the
 * reserve rack; in front of it the forklift aisle and a row of pallet flow
 * lanes, one product each, their pallets rolling forward as the front one
 * is emptied. Over the lanes and the build places in front of them, the
 * gantry runway on its columns; on it the gantries: a bridge, a trolley and
 * a clamp head that comes down round a layer, grips it and carries it over
 * to a customer's pallet. The magazines of empty pallets at the runway's
 * ends; the build places with their dispensers; the collector to the
 * top-off station, where a person puts the odd cases on by hand; the
 * wrapper, the labeller and the route trucks at the doors. Shares the case
 * drawing, the wrapper and the trucks with CaseCraft's view. */
(function (WS) {
  'use strict';
  const PZ = WS.LAYER_PZ, { PH, PL, PW } = WS.LAYER_PALLET;
  const UPRIGHT = '#2f5ea8', BEAM = '#ea6a1a', STEEL = '#64748b', YELLOW = '#facc15', GANTRY = '#f59e0b';
  const STEPS = ['Queued', 'Layers', 'Top-off', 'Wrapped', 'On a truck'];
  const lerp = (a, b, t) => (a == null ? b : a + (b - a) * t);
  const lerpA = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const TF = 1.1;

  class LayerRenderer3D extends WS.CaseRenderer3D {
    get followSteps() { return STEPS; }
    shown() { return true; }
    get cut() { return false; }
    staticTop() { return this.lv(this.G.railZ + 1.6); }
    buildKey() { const c = this.sim.cfg; return [WS.View3D.prototype.buildKey.call(this), c.lanes, c.laneDepth, c.buildSpots, c.gantries, c.doors].join('|'); }
    bounds() { const G = this.G; return { x0: 0, y0: G.yN, x1: G.XE, y1: G.yWall }; }
    hall() { const G = this.G; return { x0: 0, y0: G.yN, x1: G.XE, y1: G.yWall, doors: G.doorX.map((x) => ({ side: 'S', a: x - 1.5, b: x + 1.5, h: this.lv(4.0) })) }; }
    fit() {
      const G = this.G, c = this.cam;
      Object.assign(c, { walk: false, follow: null, tx: G.XE * 0.47, ty: G.yPick + 1.0, tz: this.lv(1.5), yaw: -0.32, pitch: 0.62 });
      c.dist = G.XE * 0.62 / Math.min(1, this.w / this.h);
      this.syncWalkButton();
    }
    aimAtFloor() {}
    workLights() {
      const G = this.G, out = this.sim.spots.map((p) => ({ x: p.x, y: G.yBuild }));
      out.push({ x: G.xTop - 0.6, y: G.yC - 0.6 }, { x: G.xWr - 0.65, y: G.yC });
      for (const x of G.doorX) out.push({ x, y: G.yWall - 2 });
      return out;
    }

    // ---------------------------------------------------------------- static
    buildStations(S) {
      this.rack(S);
      this.laneBeds(S);
      this.runway(S);
      this.places(S);
      this.lines(S);
      this.topOffRack(S);
      this.wrapLine(S);
      for (const x of this.G.doorX) { S.box.box(x - 1.25, this.G.yWall - 0.05, this.lv(TF - 0.06), x + 1.25, this.G.yWall + 0.45, this.lv(TF), '#475569'); for (const d of [-1.3, 1.3]) S.box.box(x + d - 0.12, this.G.yWall + 0.3, this.lv(TF - 0.5), x + d + 0.12, this.G.yWall + 0.5, this.lv(TF - 0.1), '#111827'); }
      this.paintFloor(S);
    }
    // the reserve rack along the north wall: three beam levels, full pallets of every product
    rack(S) {
      const sim = this.sim, G = this.G, lv = (m) => this.lv(m), y0 = 0.1, y1 = 1.2;
      for (let x = G.X0 - 0.05; x <= G.XF + 0.06; x += G.LP * 2) for (const y of [y0, y1]) S.box.box(x - 0.045, y - 0.04, 0, x + 0.045, y + 0.04, lv(4.6), UPRIGHT);
      for (const z of [1.5, 3.1]) for (const y of [y0, y1]) S.box.box(G.X0, y - 0.05, lv(z - 0.12), G.XF, y + 0.05, lv(z), BEAM);
      for (const ln of sim.lanes) for (const z of [0, 1.5, 3.1]) {
        if (z && (ln.k + z * 3) % 5 === 0) continue;
        this.palletBase(this.st.box, ln.x, G.yRack, z + 0.02);
        this.layerBlock(this.st.box, ln.x, G.yRack, z + 0.02 + PH, ln.sku, Math.min(ln.sku.layers, Math.floor(1.3 / ln.sku.H)));
      }
      // the pools of empty pallets at the aisle's ends
      for (const x of G.poolX) for (let n = 0; n < 9; n++) this.palletBase(this.st.box, x, G.yRack, n * PH);
    }
    // the flow lanes: a roller bed sloping gently to the front, side guides, an end stop
    laneBeds(S) {
      const sim = this.sim, G = this.G, lv = (m) => this.lv(m), z = PZ.lane, y0 = G.yL0, y1 = G.yPick + 0.5;
      for (const ln of sim.lanes) {
        const pick = { kind: 'lane', id: ln.k };
        S.box.box(ln.x - 0.62, y0, 0, ln.x + 0.62, y1, lv(z - 0.06), '#3b4456', pick);
        for (let y = y0 + 0.1; y < y1; y += 0.24) S.cyl.cylX(ln.x - 0.58, ln.x + 0.58, y, lv(z - 0.03), 0.035, '#7d8796');
        for (const s of [-1, 1]) S.box.box(ln.x + s * 0.64 - 0.03, y0, lv(z - 0.06), ln.x + s * 0.64 + 0.03, y1, lv(z + 0.12), '#94a3b8');
        S.box.box(ln.x - 0.62, y1, 0, ln.x + 0.62, y1 + 0.08, lv(z + 0.2), YELLOW, pick);
      }
      for (const x of G.magX) { for (const s of [-1, 1]) for (const d of [-1, 1]) S.box.box(x + s * 0.66 - 0.04, G.yPick + d * 0.46 - 0.04, 0, x + s * 0.66 + 0.04, G.yPick + d * 0.46 + 0.04, lv(2.4), '#475569'); S.box.box(x - 0.66, G.yPick - 0.5, 0, x + 0.66, G.yPick + 0.5, lv(PZ.mag), '#3b4456'); }
    }
    // the gantry runway: two rails on columns, the length of the field and the magazines
    runway(S) {
      const G = this.G, lv = (m) => this.lv(m), x0 = 0.2, x1 = G.magX[1] + 0.9, z = G.railZ;
      for (const y of G.yR) {
        S.box.box(x0, y - 0.18, lv(z - 0.45), x1, y + 0.18, lv(z), '#475569');
        S.box.box(x0, y - 0.05, lv(z), x1, y + 0.05, lv(z + 0.08), '#94a3b8');
        for (let x = x0 + 0.2; x <= x1; x += 6) { S.box.box(x - 0.15, y - 0.15, 0, x + 0.15, y + 0.15, lv(z - 0.45), '#556275'); S.box.box(x - 0.2, y - 0.2, 0, x + 0.2, y + 0.2, lv(0.9), YELLOW); }
      }
    }
    // build places: a roller platform, and the dispenser of empty pallets beside it
    places(S) {
      const G = this.G, lv = (m) => this.lv(m);
      for (const p of this.sim.spots) {
        const pick = { kind: 'port', id: p.idx };
        S.box.box(p.x - 0.66, G.yBuild - 0.46, 0, p.x + 0.66, G.yBuild + 0.46, lv(PZ.spot - 0.05), '#3b4456', pick);
        for (let dx = -0.55; dx <= 0.56; dx += 0.22) S.cyl.cylY(p.x + dx, G.yBuild - 0.42, G.yBuild + 0.42, lv(PZ.spot - 0.03), 0.035, '#7d8796');
        const dx = p.x + 1.55;
        S.box.box(dx - 0.66, G.yBuild - 0.46, 0, dx + 0.66, G.yBuild + 0.46, lv(0.1), '#3b4456', pick);
        for (const s of [-1, 1]) S.box.box(dx + s * 0.66 - 0.04, G.yBuild - 0.04, 0, dx + s * 0.66 + 0.04, G.yBuild + 0.04, lv(1.5), '#475569', pick);
        for (let n = 0; n < 6; n++) this.palletBase(S.box, dx, G.yBuild, 0.1 + n * PH, pick);
      }
    }
    lines(S) {
      const sim = this.sim, G = this.G, lv = (m) => this.lv(m);
      for (const q of sim.convs) {
        if (sim.doorLines.includes(q)) continue;
        this.conveyor(S, q.pts, 1.0, lv(PZ.spot), '#3b4456');
      }
      for (const q of sim.doorLines) {
        const a = q.pts[0], b = q.pts[q.pts.length - 1];
        S.box.beam(a.x, a.y, lv(PZ.spot - 0.12), b.x, b.y, lv(TF - 0.12), 1.0, lv(0.1), '#3b4456');
        for (let s = 0.2; s < q.len; s += 0.3) { const p = q.at(s), z = PZ.spot + (TF - PZ.spot) * (s / q.len); S.cyl.cylX(p.x - 0.48, p.x + 0.48, p.y, lv(z - 0.03), 0.04, '#64748b'); }
      }
    }
    // the carton flow rack behind the top-off station: three sloping shelves of cases
    topOffRack(S) {
      const sim = this.sim, G = this.G, lv = (m) => this.lv(m), x = G.xTop - 0.6, y = G.yC - 1.9, pick = { kind: 'port', id: sim.topOff.idx };
      for (const s of [-1, 1]) for (const d of [-0.45, 0.45]) S.box.box(x + s * 1.3 - 0.04, y + d - 0.04, 0, x + s * 1.3 + 0.04, y + d + 0.04, lv(1.9), '#475569', pick);
      [0.5, 1.0, 1.5].forEach((z, r) => {
        S.box.slab(x - 1.3, x + 1.3, y - 0.45, lv(z + 0.15), y + 0.45, lv(z), 0.03, '#94a3b8');
        for (let k = 0; k < 6; k++) { const p = sim.skus[(k * 5 + r * 7) % sim.skus.length]; this.caseAt(S, x - 1.1 + k * 0.44, y + 0.2, z + 0.03, Math.PI / 2, Object.assign({}, p, { L: 0.36, W: 0.28, H: Math.min(0.3, p.H) }), pick); }
      });
    }
    paintFloor(S) {
      const G = this.G, z = this.lv(0.004), W = '#d9b81f';
      const line = (x0, y0, x1, y1) => S.box.box(Math.min(x0, x1) - 0.05, Math.min(y0, y1) - 0.05, 0.001, Math.max(x0, x1) + 0.05, Math.max(y0, y1) + 0.05, z, W);
      line(0.4, G.yL0 - 0.3, G.XF + 2.2, G.yL0 - 0.3);
      line(0.4, 1.5, G.XE - 0.4, 1.5);
      // keep out under the runway: hatched by its ends
      line(0.3, G.yR[0], 0.3, G.yR[1]); line(G.magX[1] + 0.8, G.yR[0], G.magX[1] + 0.8, G.yR[1]);
    }

    // ---------------------------------------------------------------- pallets and layers
    // a Euro pallet: 1.2 m along x, 0.8 m along y
    palletBase(B, x, y, z, pick) {
      const lv = (m) => this.lv(m);
      B.box(x - PL / 2, y - PW / 2, lv(z + PH - 0.022), x + PL / 2, y + PW / 2, lv(z + PH), '#c9a66b', pick);
      for (const d of [-0.34, 0, 0.34]) B.box(x - PL / 2, y + d - 0.05, lv(z), x + PL / 2, y + d + 0.05, lv(z + PH - 0.022), '#a8844f', pick);
    }
    // one layer of product p, case by case, its bottom at z (m)
    layerCases(D, x, y, z, p, pick) {
      const cl = p.rot ? p.W : p.L, cw = p.rot ? p.L : p.W, x0 = x - (p.nx * cl) / 2, y0 = y - (p.ny * cw) / 2;
      for (let j = 0; j < p.ny; j++) for (let i = 0; i < p.nx; i++) this.caseAt(D, x0 + (i + 0.5) * cl, y0 + (j + 0.5) * cw, z, p.rot ? 0 : Math.PI / 2, p, pick);
    }
    // n layers of product p as blocks (a pallet seen from a distance, or behind another)
    layerBlock(B, x, y, z, p, n, pick) {
      const lv = (m) => this.lv(m), cl = p.rot ? p.W : p.L, cw = p.rot ? p.L : p.W, hx = (p.nx * cl) / 2 - 0.005, hy = (p.ny * cw) / 2 - 0.005;
      const body = p.look === 'kraft' ? '#b98a58' : p.look === 'crate' ? p.color : p.look === 'tray' ? '#a67a4c' : (WS.shade ? WS.shade(p.color, 0.3) : p.color);
      for (let k = 0; k < n; k++) {
        const zb = z + k * p.H;
        B.box(x - hx, y - hy, lv(zb + 0.004), x + hx, y + hy, lv(zb + p.H - 0.004), body, pick);
        B.box(x - hx - 0.003, y - hy - 0.003, lv(zb + p.H * 0.62), x + hx + 0.003, y + hy + 0.003, lv(zb + p.H * 0.82), p.look === 'kraft' || p.look === 'tray' ? p.color : '#f1f5f9', pick);
      }
    }
    // a customer's pallet: its layers so far, the cases put on by hand, film and label
    drawPallet(pal, x, y, z, o = {}) {
      const D = this.dy, lv = (m) => this.lv(m), pick = { kind: 'lpallet', id: pal.id };
      this.palletBase(D.box, x, y, z, pick);
      const n = o.placed ?? pal.placed, far = !!o.block;
      let zt = z + PH;
      for (let k = 0; k < n; k++) { const p = pal.layers[k]; if (far) this.layerBlock(D.box, x, y, zt, p, 1, pick); else this.layerCases(D, x, y, zt, p, pick); zt += p.H; }
      const nc = o.cases ?? pal.casesPlaced;
      for (let k = 0; k < nc; k++) { const c = pal.cases[k]; this.caseAt(D, x - PL / 2 + c.x + c.p.L / 2, y - PW / 2 + c.y + c.p.W / 2, z + PH + c.z, Math.PI / 2, c.p, pick); }
      const top = pal.cases.length && nc ? Math.max(zt - z - PH, ...pal.cases.slice(0, nc).map((c) => c.z + c.p.H)) : zt - z - PH;
      pal.top = top;
      const wrap = o.wrap ?? (pal.wrapped ? 1 : 0);
      if (wrap > 0) D.clear.box(x - PL / 2 - 0.01, y - PW / 2 - 0.01, lv(z + PH), x + PL / 2 + 0.01, y + PW / 2 + 0.01, lv(z + PH + (top + 0.02) * wrap), '#e8eef6');
      if (pal.labelled) D.lit.box(x - 0.15, y + PW / 2 + 0.012, lv(z + PH + top * 0.55), x + 0.15, y + PW / 2 + 0.015, lv(z + PH + top * 0.55 + 0.2), '#f8fafc');
    }
    // a supplier's pallet in a lane: the front one case by case, the others as blocks
    drawSource(pal, x, y, z, front) {
      const D = this.dy, pick = { kind: 'lane', id: pal.lane.k };
      this.palletBase(D.box, x, y, z, pick);
      if (front) for (let k = 0; k < pal.layers; k++) this.layerCases(D, x, y, z + PH + k * pal.sku.H, pal.sku, pick);
      else this.layerBlock(D.box, x, y, z + PH, pal.sku, pal.layers, pick);
    }

    // ---------------------------------------------------------------- live
    drawLive(alpha) {
      this.alpha = alpha; this.now = this.sim.time + alpha * this.sim.cfg.tick;
      const sim = this.sim, G = this.G, D = this.dy, dt = Math.min(0.1, Math.max(0, this.t - (this.lastT ?? this.t))); this.lastT = this.t;
      // the lanes: pallets roll forward to their places
      for (const ln of sim.lanes) ln.pallets.forEach((p, i) => {
        const want = G.slotY(i);
        p.ry = p.ry == null ? want : p.ry + Math.sign(want - p.ry) * Math.min(Math.abs(want - p.ry), dt * 0.5);
        this.drawSource(p, ln.x, p.ry, PZ.lane + (p.ry - G.slotY(0)) * -0.02, i === 0 && Math.abs(p.ry - want) < 0.01);
      });
      for (const m of sim.mags) for (let n = 0; n < m.count; n++) this.palletBase(D.box, m.x, G.yPick, PZ.mag + n * PH, { kind: 'mag', id: m.k });
      for (const p of sim.spots) {
        if (!p.pal) continue;
        if (p.state === 'WAIT_BASE') { const f = clamp01(1 - p.inT / sim.cfg.palletIn); this.palletBase(D.box, lerp(p.x + 1.55, p.x, f), G.yBuild, lerp(0.1 + 6 * PH, PZ.spot, Math.min(1, f * 2)), { kind: 'port', id: p.idx }); continue; }
        this.drawPallet(p.pal, p.x, G.yBuild, PZ.spot);
      }
      for (const g of sim.gantryList) this.drawGantry(g, alpha);
      for (const F of sim.forks) this.drawForklift(F, alpha);
      for (const q of sim.convs) for (const it of q.items) {
        const s = lerp(it.ps, it.s, alpha), at = q.at(s), door = sim.doorLines.includes(q);
        this.drawPallet(it.pal, at.x, at.y, door ? PZ.spot + (TF - PZ.spot) * clamp01(s / q.len) : PZ.spot);
      }
      this.drawTopOff();
      this.drawWrapper();
      this.drawRouteTrucks();
    }
    // A gantry: a bridge of two girders between its end carriages on the rails, the trolley, the mast down to the head;
    // the head a frame with clamp plates on two sides (closing as it grips) and the vacuum plate on top.
    drawGantry(g, alpha) {
      const D = this.dy, G = this.G, lv = (m) => this.lv(m), pick = { kind: 'robot', id: g.id }, z = G.railZ;
      const x = lerp(g.ox, g.x, alpha), y = lerp(g.oy, g.y, alpha), hz = lerp(g.oz, g.z, alpha), col = g.down ? '#b91c1c' : GANTRY, st = g.down ? '#ef4444' : WS.stateColor(this.sim, g.displayState);
      for (const s of [-0.55, 0.55]) D.box.box(x + s - 0.12, G.yR[0] - 0.1, lv(z + 0.1), x + s + 0.12, G.yR[1] + 0.1, lv(z + 0.65), col, pick);
      for (const yy of G.yR) { D.box.box(x - 0.8, yy - 0.3, lv(z + 0.08), x + 0.8, yy + 0.3, lv(z + 0.75), '#374151', pick); D.lit.box(x - 0.2, yy - 0.31, lv(z + 0.5), x + 0.2, yy - 0.3, lv(z + 0.6), st); }
      // the trolley and its mast
      D.box.box(x - 0.75, y - 0.55, lv(z + 0.65), x + 0.75, y + 0.55, lv(z + 1.05), '#1f2937', pick);
      const L = g.held && g.held.kind === 'layer' ? g.held.sku : null, lh = L ? L.H : 0.15, top = hz + lh + 0.12;
      for (const s of [-0.25, 0.25]) D.box.box(x + s - 0.08, y - 0.08, lv(top + 0.1), x + s + 0.08, y + 0.08, lv(z + 0.65), '#94a3b8', pick);
      // the head
      D.box.box(x - 0.7, y - 0.5, lv(top), x + 0.7, y + 0.5, lv(top + 0.12), '#334155', pick);
      D.box.box(x - 0.62, y - 0.42, lv(top - 0.02), x + 0.62, y + 0.42, lv(top), '#0f172a', pick);
      const gp = g.grip * 0.07;
      for (const s of [-1, 1]) D.box.box(x - 0.66, y + s * (0.47 - gp) - 0.02, lv(hz - 0.02), x + 0.66, y + s * (0.47 - gp) + 0.02, lv(top), '#475569', pick);
      for (const s of [-1, 1]) D.box.box(x + s * 0.68 - 0.02, y - 0.47, lv(top - 0.1), x + s * 0.68 + 0.02, y + 0.47, lv(top), '#475569', pick);
      if (L) this.layerCases(D, x, y, hz, L, pick);
      else if (g.held) this.palletBase(D.box, x, y, hz, pick);
    }
    // a forklift in the aisle: mast that rises to the rack's levels, forks, a driver; a pallet or a stack of empties on its forks
    drawForklift(F, alpha) {
      const D = this.dy, lv = (m) => this.lv(m), pick = { kind: 'robot', id: F.id };
      const x = lerp(F.ox, F.x, alpha), y = lerp(F.oy, F.y, alpha), a = F.oa == null ? F.a : lerpA(F.oa, F.a, alpha), fk = lerp(F.ofork, F.fork, alpha), fz = 0.08 + F.mast + fk * 0.15;
      const R = (B, u0, v0, h0, u1, v1, h1, c) => B.rbox(x, y, a, u0, v0, lv(h0), u1, v1, lv(h1), c, pick);
      R(D.rnd, -0.55, -1.0, 0.18, 0.55, 0.45, 0.95, '#f59e0b');
      R(D.box, -0.55, -1.12, 0.18, 0.55, -0.85, 0.85, '#374151');
      for (const u of [-0.5, 0.5]) for (const v of [-0.75, 0.3]) R(D.box, u - 0.03, v - 0.03, 0.95, u + 0.03, v + 0.03, 2.1, '#111827');
      R(D.box, -0.53, -0.8, 2.1, 0.53, 0.35, 2.14, '#111827');
      const mh = Math.max(2.3, fz + 1.0);
      for (const u of [-0.3, 0.3]) R(D.box, u - 0.05, 0.48, 0.05, u + 0.05, 0.56, mh, '#374151');
      R(D.box, -0.42, 0.56, fz, 0.42, 0.6, fz + 0.65, '#374151');
      for (const u of [-0.25, 0.25]) R(D.box, u - 0.05, 0.6, fz, u + 0.05, 1.85, fz + 0.045, '#4b5563');
      for (const v of [-0.7, 0.3]) for (const s of [-1, 1]) D.cyl.ucyl(x, y, a, s * 0.5, v, lv(0.22), 0.22, 0.2, '#111317', pick);
      R(D.rnd, -0.17, -0.45, 0.95, 0.17, -0.2, 1.45, '#1d4ed8');
      R(D.rnd, -0.09, -0.38, 1.47, 0.09, -0.22, 1.66, '#e0b796');
      R(D.dome, -0.11, -0.4, 1.6, 0.11, -0.2, 1.74, YELLOW);
      const px = x + Math.sin(a) * 1.25, py = y + Math.cos(a) * 1.25;
      if (F.pal) { this.palletBase(D.box, px, py, fz - 0.02); this.layerBlock(D.box, px, py, fz - 0.02 + PH, F.pal.sku, F.pal.layers); }
      for (let n = 0; n < F.stack; n++) this.palletBase(D.box, px, py, fz - 0.02 + n * PH);
    }
    // the top-off station: the pallet stopped, a person putting the cases on
    drawTopOff() {
      const sim = this.sim, G = this.G, p = sim.topOff, x = G.xTop - 0.6, y = G.yC;
      if (p.pal) this.drawPallet(p.pal, x, y, PZ.spot);
      const busy = !!(p.pal && p.pal.casesPlaced < p.pal.cases.length);
      if (!p.away) this.operator(x + 0.2, y - 0.95, 0, busy, 'station', 0, 'top');
      if (busy && p.t > sim.cfg.caseTime * 0.3) { const c = p.pal.cases[p.pal.casesPlaced]; this.caseAt(this.dy, x + 0.2, y - 0.55, 1.0, Math.PI / 2, c.p); }
    }
    drawRouteTrucks() {
      const sim = this.sim, G = this.G;
      for (const d of sim.doors) {
        const t = d.truck;
        if (!t) continue;
        const off = t.state === 'ARRIVING' ? (t.t / 25) * 30 : t.state === 'LEAVING' ? (1 - t.t / 25) * 30 : 0, y0 = G.yWall + 0.4 + off;
        this.truck(d.x, y0, 0, 'route');
        const spot = (k) => ({ x: d.x + (k % 2 ? 0.61 : -0.61), y: y0 + 13.6 - 0.45 - Math.floor(k / 2) * 0.84 });
        t.pallets.forEach((pal, k) => { const s = spot(k); this.drawPallet(pal, s.x, s.y, TF, { block: true }); });
        if (d.loading) { const s = spot(t.pallets.length), f = clamp01((this.now - d.loading.t0) / 15); this.drawPallet(d.loading.pal, lerp(d.x, s.x, f), lerp(G.yWall + 0.4, s.y, f), TF, { block: true }); }
      }
    }

    // ---------------------------------------------------------------- follow, ride, pick, labels
    followPos(id, alpha) {
      const m = this.sim.fleet[id], a = alpha ?? 1;
      if (!m) return null;
      if (m instanceof WS.LayerGantry) return { x: lerp(m.ox, m.x, a), y: lerp(m.oy, m.y, a), z: this.lv(lerp(m.oz, m.z, a) + 0.5) };
      return { x: lerp(m.ox, m.x, a), y: lerp(m.oy, m.y, a), z: 0 };
    }
    pickRider(not) { const gs = this.sim.gantryList.filter((g) => g.id !== not); return (gs.find((g) => g.held) || gs[0] || this.sim.gantryList[0]).id; }
    rideFront() { return 0.0; }
    rideHeight() { return this.lv(this.G.railZ - 0.8); }
    techSpot(m, p) { const G = this.G; return m instanceof WS.LayerGantry ? { x: p.x + 1.2, y: G.yBuild + 1.4, z: 0, a: 0 } : { x: p.x + 0.9, y: p.y + 0.9, z: 0, a: 0 }; }
    pickFloor(f) {
      for (const p of this.sim.ports) if (Math.abs(f.x - p.drop.x) < 1.0 && Math.abs(f.y - p.drop.y) < 0.9) return { kind: 'port', id: p.idx };
      for (const ln of this.sim.lanes) if (Math.abs(f.x - ln.x) < 0.65 && f.y > this.G.yL0 && f.y < this.G.yPick + 0.6) return { kind: 'lane', id: ln.k };
      return null;
    }
    selectionBox(s, alpha) {
      const sim = this.sim, G = this.G;
      if (s.kind === 'robot') { const m = sim.fleet[s.id], p = m && this.followPos(s.id, alpha); if (!p) return null; return m instanceof WS.LayerGantry ? [p.x - 0.8, G.yR[0], p.x + 0.8, G.yR[1], 0.02] : [p.x - 1.0, p.y - 1.0, p.x + 1.0, p.y + 1.0, 0.02]; }
      if (s.kind === 'port') { const p = sim.ports[s.id]; return [p.drop.x - 0.8, p.drop.y - 0.6, p.drop.x + 0.8, p.drop.y + 0.6, 0.02]; }
      if (s.kind === 'lane') { const ln = sim.lanes[s.id]; return [ln.x - 0.66, G.yL0, ln.x + 0.66, G.yPick + 0.55, 0.02]; }
      if (s.kind === 'lpallet') { const pal = sim.palletById.get(s.id), q = pal && this.palletPos(pal); return q && [q.x - 0.7, q.y - 0.5, q.x + 0.7, q.y + 0.5, 0.02]; }
      return null;
    }
    palletPos(pal) {
      const sim = this.sim, G = this.G;
      if (pal.where === 'spot') return { x: pal.spot.x, y: G.yBuild, z: this.lv(PZ.spot) };
      if (pal.where === 'line') for (const q of sim.convs) { const it = q.items.find((i) => i.pal === pal); if (it) { const a = q.at(it.s); return { x: a.x, y: a.y, z: this.lv(PZ.spot) }; } }
      if (pal.where === 'top') return { x: G.xTop - 0.6, y: G.yC, z: this.lv(PZ.spot) };
      if (pal.where === 'wrapper') return { x: G.xWr - 0.65, y: G.yC, z: this.lv(PZ.spot) };
      if (pal.where === 'labeller') return { x: G.xLb - 0.65, y: G.yC, z: this.lv(PZ.spot) };
      if (pal.where === 'truck' && pal.door != null) return { x: sim.doors[pal.door].x, y: G.yWall + 6, z: this.lv(TF) };
      return null;
    }
    drawLabels() {
      const sim = this.sim, G = this.G, bg = 'rgba(15,23,42,0.82)', lv = (m) => this.lv(m);
      for (const g of sim.gantryList) { const p = this.followPos(g.id, this.alpha); this.label(`${g.name} · ${g.down ? 'DOWN' : g.task ? (g.task.kind === 'layer' ? g.task.lane.sku.name.split(' ').slice(0, 2).join(' ') : 'empty pallet') : 'idle'}`, p.x, G.yR[0], lv(G.railZ + 1.3), { size: 10, bg, color: '#fcd34d' }); }
      for (const p of sim.spots) if (p.pal) this.label(`${p.code} · ${p.state === 'WAIT_BASE' ? 'NEW PALLET' : `${p.pal.placed}/${p.pal.layers.length}`}`, p.x, G.yBuild + 0.6, lv(2.4), { size: 9, bg, color: '#fdba74' });
      for (const ln of sim.lanes) { const n = ln.pallets.reduce((a, q) => a + q.layers, 0); if (ln.out || n <= ln.sku.layers) this.label(`${ln.out ? 'EMPTY' : 'low'} · ${ln.sku.name.split(' ').slice(0, 2).join(' ')}`, ln.x, G.yL0 + 0.3, lv(2.2), { size: 9, bg, color: ln.out ? '#fca5a5' : '#fde68a' }); }
      const t = sim.topOff;
      this.label(`Top-off${t.away ? ' · BREAK' : t.pal ? ` · ${t.pal.casesPlaced}/${t.pal.cases.length} cases` : ''}`, G.xTop - 0.6, G.yC - 1.9, lv(2.3), { size: 10, bg, color: '#86efac' });
      this.label(`Wrapper${sim.wrapper.pal ? ' · ' + Math.round(100 * (1 - sim.wrapper.t / sim.cfg.wrapTime)) + '%' : ''}`, G.xWr - 0.65, G.yC, lv(3.6), { size: 10, bg, color: '#e2e8f0' });
      for (const d of sim.doors) if (d.truck) this.label(`Door ${d.k + 1} · route ${d.truck.route} · ${d.truck.pallets.length}/${sim.cfg.truckPallets}`, d.x, G.yWall - 0.5, lv(4.6), { size: 10, bg, color: '#bbf7d0' });
    }

    // ---------------------------------------------------------------- follow an order
    pickFollow(not) {
      const os = this.sim.orders.filter((o) => o !== not && o.status !== 'SHIPPED' && o.pallets.some((p) => p.state === 'QUEUED'));
      const pool = os.length ? os : this.sim.orders.filter((o) => o !== not && o.status !== 'SHIPPED');
      return pool.length ? { order: pool[pool.length - 1] } : null;
    }
    orderFocus(o) {
      const G = this.G, lv = (m) => this.lv(m), pal = o.pallets.find((p) => p.state !== 'LOADED') || o.pallets[o.pallets.length - 1], n = o.pallets.length;
      if (o.status === 'SHIPPED') { const q = this.palletPos(pal) || { x: G.doorX[0], y: G.yWall + 4, z: lv(TF) }; return Object.assign(q, { step: 4, done: true, text: `On route truck · ${n} pallet${n > 1 ? 's' : ''} loaded` }); }
      const q = this.palletPos(pal), which = n > 1 ? `Pallet ${pal.k + 1} of ${n}: ` : '';
      if (!q) return { x: G.spotX(0), y: G.yBuild, z: lv(1), step: 0, text: `${which}waiting for a build place` };
      const st = pal.state, step = { QUEUED: 0, BASE: 1, BUILDING: 1, LAYERS_DONE: 1, TO_TOP: 2, TO_WRAP: 3, WRAP: 3, LABEL: 3, TO_DOOR: 4, LOADED: 4 }[st] ?? 1;
      const text = { BASE: 'an empty pallet rolls in', BUILDING: `layer ${pal.placed + 1} of ${pal.layers.length}: ${pal.layers[pal.placed] ? pal.layers[pal.placed].name : ''}`, LAYERS_DONE: 'all its layers on', TO_TOP: `to the top-off station for ${pal.cases.length} cases by hand`, TO_WRAP: 'to the wrapper', WRAP: 'being wrapped', LABEL: 'being labelled', TO_DOOR: 'to its route truck' }[st] || '';
      return Object.assign(q, { z: q.z + lv(1.2), step, text: which + text });
    }
    hudHTML() {
      const o = this.follow.order, f = this.followNow || { step: 0, text: '' }, esc = WS.U.esc;
      const chips = STEPS.map((s, k) => `<span class="${k < f.step || f.done ? 'done' : k === f.step ? 'now' : ''}">${s}</span>`).join('<i></i>');
      const layers = o.lines.reduce((a, l) => a + l.layers, 0), cases = o.lines.reduce((a, l) => a + l.cases, 0);
      return `<div class="fh-top"><b>${o.code}</b><button data-fh="next" title="Follow another (N)">Next</button><button data-fh="stop" title="Stop following">×</button></div>
        <div class="fh-meta">${esc(o.cust)} · ${layers} layers and ${cases} cases of ${o.lines.length} products</div><div class="fh-steps">${chips}</div><div class="fh-text">${esc(f.text)}</div>`;
    }
    drawLabelLayer() {
      const F = this.follow, f = this.followNow;
      this.follow = null;
      WS.View3D.prototype.drawLabelLayer.call(this);
      this.follow = F;
      if (this.cam.mode === 'order' && F && F.order && f) this.label('▼ ' + F.order.code, f.x, f.y, f.z + this.lv(0.6), { size: 11, weight: 800, color: '#0f172a', bg: 'rgba(250,204,21,0.92)' });
    }
    extraBatches() { return []; }
  }

  WS.LayerRenderer3D = LayerRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
