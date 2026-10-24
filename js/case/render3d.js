/* CaseCraft in the free 3D view, one cell a metre. The structure: blue
 * uprights and orange beams, a galvanised shelf on both sides of every
 * aisle on every level, the bots' rails in the aisles, and a grated deck
 * along the south end of each level with its two lanes marked; along the
 * deck's far side the lift masts with a transfer shelf at every level. On
 * the floor the inbound dock with its forklift and truck, the pallet
 * conveyor past the depalletising cells, the case conveyor through the
 * measuring tunnel to the input lifts, the conveyors from the output lifts
 * down to the palletising cells, the stretch wrapper, the labeller and the
 * conveyors into the stores' trucks at the doors. Live: the bots on their
 * decks and in their aisles, reaching under a case with their arms; the
 * cases on the shelves (each in its product's print); the lift carriages;
 * articulated robot arms taking cases off a pallet and stacking them on
 * another, the plan's next places shown as ghosts; pallets being wrapped;
 * trucks backing up and leaving. The Levels slider shows the structure up to
 * a level, or one level alone. */
(function (WS) {
  'use strict';
  const UPRIGHT = '#2f5ea8', BEAM = '#ea6a1a', GALV = '#9aa5b4', DARK = '#1f2937', YELLOW = '#facc15', ARM = '#f08a24', FENCE = '#facc15';
  const STEPS = ['Inbound', 'Into storage', 'Stored', 'Sequenced', 'Palletised', 'Shipped'];
  const lerp = (a, b, t) => (a == null ? b : a + (b - a) * t);
  const lerpA = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  // two #rrggbb colours mixed, t of the second
  const mix = (a, b, t) => '#' + [1, 3, 5].map((k) => Math.round(parseInt(a.slice(k, k + 2), 16) * (1 - t) + parseInt(b.slice(k, k + 2), 16) * t).toString(16).padStart(2, '0')).join('');
  const PZ = 0.45; // m: the top of a pallet conveyor, where a pallet's runners stand
  const PH = 0.144; // m: a pallet's own height
  const TF = 1.1; // m: a trailer's floor

  class CaseRenderer3D extends WS.View3D {
    get G() { return this.sim.G; }
    get followSteps() { return STEPS; }
    get nF() { return this.sim.cfg.levels; }
    shown(f) { const o = this.opts, t = o.floorTop; return t == null || (o.cutOnly ? f === t : f <= t); }
    buildKey() { const c = this.sim.cfg; return [super.buildKey(), this.opts.floorTop, this.opts.cutOnly, c.levels, c.aisles, c.aisleLength, c.inLifts, c.palletCells, c.depalCells, c.botsPerLevel, c.levelHeight].join('|'); }
    bounds() { const G = this.G; return { x0: G.XW, y0: G.yN, x1: G.XE, y1: G.yWall }; }
    hall() {
      const G = this.G;
      return { x0: G.XW, y0: G.yN, x1: G.XE, y1: G.yWall, doors: [{ side: 'W', a: G.yPL - 1.6, b: G.yPL + 1.6, h: this.lv(4.2) }, ...G.doorX.map((x) => ({ side: 'S', a: x - 1.5, b: x + 1.5, h: this.lv(4.0) }))] };
    }
    fit() {
      const G = this.G, c = this.cam;
      // from the south-west, over the depalletisers, looking at the deck side of the structure and the cells
      Object.assign(c, { walk: false, follow: null, tx: (G.XW + G.XE) / 2, ty: G.yS + 4, tz: this.lv(2), yaw: -0.55, pitch: 0.52 });
      c.dist = (G.XE - G.XW) * 0.82 / Math.min(1, this.w / this.h);
      this.syncWalkButton();
    }
    // The camera goes level with the level the slider picks.
    aimAtFloor() {
      const o = this.opts, k = [o.floorTop, o.cutOnly].join('|');
      if (k === this.floorKey) return;
      const first = this.floorKey === undefined;
      this.floorKey = k;
      if (first || o.floorTop == null) return;
      this.leavePreset();
      Object.assign(this.cam, { follow: null, tz: this.lv(this.G.z(o.floorTop)) });
    }
    workLights() {
      const G = this.G, out = this.sim.ports.map((p) => ({ x: p.drop.x, y: p.drop.y }));
      out.push({ x: G.xWr - 0.65, y: G.yC }, { x: G.XW + 2, y: G.yPL });
      for (const x of G.doorX) out.push({ x, y: G.yWall - 2 });
      return out;
    }
    startShot(shot) {
      if (shot !== 'station') return super.startShot(shot);
      this.shot = shot; this.shotT = 0;
      const ls = this.workLights();
      this.stationK = ((this.stationK ?? -1) + 1) % ls.length;
      const p = ls[this.stationK];
      Object.assign(this.cam, { tx: p.x, ty: p.y, tz: this.lv(1.2), dist: 8, pitch: 0.42, yaw: -0.4 });
    }

    // ---------------------------------------------------------------- static
    drawStationsLive() {} // the cells are drawn in drawLive
    buildStations(S) {
      this.structure(S);
      this.liftMasts(S);
      this.conveyors(S);
      this.depalCells(S);
      this.palletCells(S);
      this.wrapLine(S);
      this.docks(S);
      this.floorPaint(S);
    }
    // the top of the structure, or of the highest level shown (m)
    get topShown() { const c = this.sim.cfg, t = this.opts.floorTop; return this.G.z(t == null ? c.levels - 1 : t) + c.levelHeight; }
    get cut() { return this.opts.floorTop != null; }
    // the hall is as high as the whole structure, whatever is cut away
    staticTop() { const c = this.sim.cfg; return this.lv(this.G.z(c.levels - 1) + c.levelHeight + 1.5); }
    // uprights, beams and shelves, rails, the decks
    structure(S) {
      const sim = this.sim, G = this.G, c = sim.cfg, lv = (m) => this.lv(m), top = this.topShown;
      // uprights on every rack face every 2.4 m, and at the backs of the racks; cross-braced at the outer ends
      const lines = [0, G.W];
      for (let k = 0; k < G.A; k++) { lines.push(G.ax(k) - G.AW / 2, G.ax(k) + G.AW / 2); if (k) lines.push(k * G.P); }
      const ys = []; for (let y = 0.05; y < G.yS; y += 2.4) ys.push(y); ys.push(G.yS - 0.05);
      for (const x of lines) for (const y of ys) S.box.box(x - 0.045, y - 0.04, 0, x + 0.045, y + 0.04, lv(top + 0.15), UPRIGHT);
      for (const x of [0, G.W]) for (let k = 1; k < ys.length; k++) for (let z = 0; z < top - 1; z += 2.4) S.box.beam(x, ys[k - 1], lv(z), x, ys[k], lv(z + 2.4), 0.04, 0.03, '#3b6cb8');
      // a cap of beams on top (not when levels are cut away) and the base plinth
      if (!this.cut) {
        for (const y of [0.05, G.yS - 0.05]) S.box.box(-0.05, y - 0.06, lv(top + 0.15), G.W + 0.05, y + 0.06, lv(top + 0.3), '#1e3a6e');
        for (let x = 0; x <= G.W + 1e-6; x += G.P) S.box.box(x - 0.05, 0, lv(top + 0.15), x + 0.05, G.yS, lv(top + 0.27), '#1e3a6e');
      }
      S.box.box(-0.1, -0.05, 0, G.W + 0.1, G.yS, lv(0.06), '#3a4352');
      const y0 = 0.1, y1 = G.yS - 0.8;
      // top level first: seen from above, the levels below are then mostly hidden before they are drawn
      for (let f = c.levels - 1; f >= 0; f--) {
        this.skip = !this.shown(f);
        const zc = G.zc(f), z = G.z(f);
        for (let k = 0; k < G.A; k++) {
          const ax = G.ax(k);
          for (const s of [-1, 1]) {
            const sh = sim.shelves[(f * G.A + k) * 2 + (s > 0 ? 1 : 0)], pick = { kind: 'shelf', id: sh.id };
            const xi = ax + s * G.AW / 2, xo = xi + s * G.RD, x0 = Math.min(xi, xo), x1 = Math.max(xi, xo);
            S.box.box(x0, y0, lv(zc - 0.035), x1, y1, lv(zc - 0.005), GALV, pick);
            S.box.box(xi - 0.03, y0, lv(zc - 0.12), xi + 0.03, y1, lv(zc - 0.03), BEAM, pick);
            S.box.box(xo - 0.03, y0, lv(zc - 0.12), xo + 0.03, y1, lv(zc - 0.03), BEAM);
          }
          // the bots' rails along the aisle
          for (const s of [-1, 1]) S.box.box(ax + s * 0.36 - 0.03, 0.1, lv(z - 0.05), ax + s * 0.36 + 0.03, G.yS, lv(z), '#b6bfcc');
        }
        // the deck: a grated floor, the two lanes' lines, a toe board on its south edge
        S.box.box(G.DX0 - 0.2, G.yS, lv(z - 0.05), G.DX1 + 0.2, G.yD, lv(z - 0.005), '#4b5565');
        for (const ly of G.yL) for (let x = G.DX0; x < G.DX1; x += 1.5) S.box.box(x, ly - 0.025, lv(z - 0.004), x + 0.8, ly + 0.025, lv(z), '#cbd5e1');
        for (let x = G.DX0 + 0.3; x < G.DX1; x += 0.6) S.box.box(x, G.yD - 0.03, lv(z), x + 0.3, G.yD, lv(z + 0.08), YELLOW);
        // parking pockets marked out
        for (const x of G.parkX) for (const s of [-1, 1]) S.box.box(x + s * 0.36 - 0.02, G.yP - 0.66, lv(z - 0.004), x + s * 0.36 + 0.02, G.yP + 0.66, lv(z), '#4ade80');
      }
      this.skip = false;
      // the deck's columns along its south edge
      for (let x = G.DX0; x <= G.DX1 + 1e-6; x += 2.3) S.box.box(x - 0.06, G.yD - 0.12, 0, x + 0.06, G.yD, lv(top + 0.15), UPRIGHT);
    }
    // the lifts: two masts, a head on top, a transfer shelf of three places at every level
    liftMasts(S) {
      const sim = this.sim, G = this.G, c = sim.cfg, lv = (m) => this.lv(m), top = this.topShown;
      for (const L of [...sim.inLifts, ...sim.outLifts]) {
        const pick = { kind: 'robot', id: L.id }, tint = L.out ? '#2563eb' : '#16a34a';
        for (const s of [-1, 1]) {
          S.box.box(L.x + s * 1.08 - 0.07, G.yMast - 0.07, 0, L.x + s * 1.08 + 0.07, G.yMast + 0.07, lv(top + 0.8), '#475569', pick);
          for (let z = 0.5; z < top; z += 3) S.box.box(L.x + s * 1.08 - 0.075, G.yMast - 0.075, lv(z), L.x + s * 1.08 + 0.075, G.yMast + 0.075, lv(z + 0.25), tint);
        }
        if (!this.cut) {
          S.box.box(L.x - 1.15, G.yMast - 0.25, lv(top + 0.8), L.x + 1.15, G.yMast + 0.25, lv(top + 1.15), '#334155', pick);
          S.box.box(L.x - 0.4, G.yMast - 0.2, lv(top + 1.15), L.x + 0.4, G.yMast + 0.2, lv(top + 1.45), '#1f2937', pick);
        }
        for (let f = 0; f < c.levels; f++) {
          this.skip = !this.shown(f);
          const zc = G.zc(f);
          for (let j = 0; j < 3; j++) {
            const sx = G.slotX(L.x, j);
            S.box.box(sx - 0.31, G.yShelf - 0.32, lv(zc - 0.05), sx + 0.31, G.yShelf + 0.32, lv(zc - 0.005), '#7d8796', pick);
            for (let r = -0.24; r <= 0.25; r += 0.12) S.cyl.cylX(sx - 0.29, sx + 0.29, G.yShelf + r, lv(zc - 0.02), 0.022, '#a7b0bd');
          }
          S.box.box(L.x - 1.05, G.yShelf + 0.3, lv(zc - 0.06), L.x + 1.05, G.yShelf + 0.34, lv(zc + 0.08), tint);
        }
        this.skip = false;
      }
    }
    // the case and pallet conveyors on their legs; the measuring tunnel
    conveyors(S) {
      const sim = this.sim, G = this.G, lv = (m) => this.lv(m);
      const pallet = new Set([sim.palLine, sim.collector, sim.labelLine, sim.distLine, ...sim.cells.map((p) => p.out)]);
      for (const q of sim.convs) {
        if (sim.doorLines.includes(q)) continue;
        this.conveyor(S, q.pts, pallet.has(q) ? 1.3 : 0.62, lv(pallet.has(q) ? PZ : G.CZ), pallet.has(q) ? '#3b4456' : '#334155');
      }
      // the lines to the doors rise to the trailers' floor
      for (const q of sim.doorLines) {
        const a = q.pts[0], b = q.pts[q.pts.length - 1];
        S.box.beam(a.x, a.y, lv(PZ - 0.12), b.x, b.y, lv(TF - 0.12), 1.3, lv(0.1), '#3b4456');
        const alongX = Math.abs(b.x - a.x) > Math.abs(b.y - a.y);
        for (let s = 0.2; s < q.len; s += 0.3) { const p = q.at(s), z = PZ + (TF - PZ) * (s / q.len); if (alongX) S.cyl.cylY(p.x, p.y - 0.62, p.y + 0.62, lv(z - 0.03), 0.04, '#64748b'); else S.cyl.cylX(p.x - 0.62, p.x + 0.62, p.y, lv(z - 0.03), 0.04, '#64748b'); }
        for (let s = 0.5; s < q.len - 0.3; s += 2) { const p = q.at(s), z = PZ + (TF - PZ) * (s / q.len), dx = alongX ? 0 : 0.6, dy = alongX ? 0.6 : 0; for (const d of [-1, 1]) S.box.box(p.x + d * dx - 0.04, p.y + d * dy - 0.04, 0, p.x + d * dx + 0.04, p.y + d * dy + 0.04, lv(z - 0.12), '#475569'); }
      }
      // the tunnel: a hood over the case conveyor with a light curtain inside
      const tx = G.tunnelX, ty = G.yI, z = G.CZ;
      for (const s of [-1, 1]) S.box.box(tx - 0.7, ty + s * 0.42 - 0.05, lv(z - 0.35), tx + 0.7, ty + s * 0.42 + 0.05, lv(z + 0.75), '#1e293b', { kind: 'tunnel' });
      S.box.box(tx - 0.72, ty - 0.48, lv(z + 0.75), tx + 0.72, ty + 0.48, lv(z + 0.85), '#334155', { kind: 'tunnel' });
      S.lit.box(tx - 0.65, ty - 0.36, lv(z + 0.86), tx + 0.65, ty + 0.36, lv(z + 0.865), '#38bdf8');
    }
    // depalletising cells: fence, the arm's pedestal, the pallet's place and the next one's, the stack of empties
    depalCells(S) {
      const sim = this.sim, G = this.G, lv = (m) => this.lv(m);
      sim.depals.forEach((cell, k) => {
        const x = G.depX[k], A = cell.robot, pick = { kind: 'port', id: cell.idx };
        S.cyl.cyl(A.x, A.y, 0, lv(0.5), 0.34, '#334155', pick);
        S.cyl.cyl(A.x, A.y, 0, lv(0.06), 0.5, '#475569', pick);
        for (const y of [G.yDepPal, G.yDepNext]) this.palletStand(S, x, y, pick);
        this.palletStand(S, x - 1.5, G.yDepPal, pick, 0.12);
        this.fence(S, x - 1.7, G.yDepOut - 0.3, x + 1.75, G.yDepNext + 0.2, [[x - 0.45, x + 0.45, 'S'], [x - 0.4, x + 0.4, 'N']]);
      });
    }
    // palletising cells: fence, pedestal, the build place, the dispenser of empty pallets, a stack light
    palletCells(S) {
      const sim = this.sim, G = this.G, lv = (m) => this.lv(m);
      sim.cells.forEach((cell, k) => {
        const cx = G.cellX[k], A = cell.robot, pick = { kind: 'port', id: cell.idx }, bx = cx + 0.35;
        S.cyl.cyl(A.x, A.y, 0, lv(0.5), 0.34, '#334155', pick);
        S.cyl.cyl(A.x, A.y, 0, lv(0.06), 0.5, '#475569', pick);
        this.palletStand(S, bx, G.yBuild, pick);
        // the dispenser: a frame with a stack of empty pallets that one at a time roll in from the east
        this.palletStand(S, bx + 1.7, G.yBuild, pick);
        for (const dx of [-0.65, 0.65]) for (const dy of [-0.55, 0.55]) S.box.box(bx + 1.7 + dx - 0.04, G.yBuild + dy - 0.04, 0, bx + 1.7 + dx + 0.04, G.yBuild + dy + 0.04, lv(1.6), '#475569', pick);
        for (let n = 0; n < 7; n++) this.palletBase(S.box, bx + 1.7, G.yBuild, PZ + 0.12 + n * PH);
        this.fence(S, cx - 2.4, G.yE - 0.9, cx + 3.15, G.yBuild + 0.85, [[bx - 0.7, bx + 0.7, 'S'], [cx - 2.0, cx - 1.4, 'N']]);
        // a stack light on the fence post
        S.box.box(cx - 2.44, G.yE - 0.94, 0, cx - 2.36, G.yE - 0.86, lv(2.2), '#475569');
      });
    }
    // a roller section a pallet stands on
    palletStand(S, x, y, pick, h = PZ) {
      const lv = (m) => this.lv(m);
      S.box.box(x - 0.66, y - 0.55, 0, x + 0.66, y + 0.55, lv(h - 0.05), '#3b4456', pick);
      if (h > 0.2) for (let dx = -0.55; dx <= 0.56; dx += 0.22) S.cyl.cylY(x + dx, y - 0.52, y + 0.52, lv(h - 0.03), 0.035, '#64748b');
    }
    // A safety fence of mesh panels on posts round x0…x1, y0…y1, open where gaps say ([a, b, side]).
    fence(S, x0, y0, x1, y1, gaps) {
      const lv = (m) => this.lv(m), H = 2.0;
      const run = (side, a, b) => {
        const open = gaps.filter((g) => g[2] === side).sort((p, q) => p[0] - q[0]), spans = [];
        let s = a; for (const g of open) { spans.push([s, g[0]]); s = g[1]; } spans.push([s, b]);
        for (const [p, q] of spans) {
          if (q - p < 0.05) continue;
          for (let t = p; t < q - 1e-6; t += 1.2) {
            const e = Math.min(q, t + 1.2);
            if (side === 'N' || side === 'S') { const y = side === 'N' ? y0 : y1; S.clear.box(t, y - 0.01, lv(0.1), e, y + 0.01, lv(H), '#d6dbe3'); S.box.box(t - 0.03, y - 0.03, 0, t + 0.03, y + 0.03, lv(H), FENCE); }
            else { const x = side === 'W' ? x0 : x1; S.clear.box(x - 0.01, t, lv(0.1), x + 0.01, e, lv(H), '#d6dbe3'); S.box.box(x - 0.03, t - 0.03, 0, x + 0.03, t + 0.03, lv(H), FENCE); }
          }
        }
      };
      run('N', x0, x1); run('S', x0, x1); run('W', y0, y1); run('E', y0, y1);
    }
    // the stretch wrapper's frame, the labeller's cabinet
    wrapLine(S) {
      const G = this.G, lv = (m) => this.lv(m), x = G.xWr - 0.65, y = G.yC, pick = { kind: 'wrapper' };
      for (const dx of [-1.25, 1.25]) for (const dy of [-1.25, 1.25]) S.box.box(x + dx - 0.08, y + dy - 0.08, 0, x + dx + 0.08, y + dy + 0.08, lv(2.9), '#cbd5e1', pick);
      for (const dy of [-1.25, 1.25]) S.box.box(x - 1.33, y + dy - 0.1, lv(2.9), x + 1.33, y + dy + 0.1, lv(3.1), '#94a3b8', pick);
      for (const dx of [-1.25, 1.25]) S.box.box(x + dx - 0.1, y - 1.33, lv(2.9), x + dx + 0.1, y + 1.33, lv(3.1), '#94a3b8', pick);
      S.box.box(x - 0.35, y - 0.35, lv(3.1), x + 0.35, y + 0.35, lv(3.4), '#475569', pick);
      const lx = G.xLb - 0.65;
      S.box.box(lx - 0.45, y + 0.85, 0, lx + 0.45, y + 1.45, lv(1.5), '#e5e7eb', { kind: 'labeller' });
      S.box.box(lx - 0.42, y + 0.84, lv(1.1), lx + 0.42, y + 0.85, lv(1.4), '#0f172a', { kind: 'labeller' });
    }
    // dock levellers and bumpers at the doors; the inbound dock's ramp
    docks(S) {
      const G = this.G, lv = (m) => this.lv(m);
      for (const x of G.doorX) { S.box.box(x - 1.25, G.yWall - 0.05, lv(TF - 0.06), x + 1.25, G.yWall + 0.45, lv(TF), '#475569'); for (const d of [-1.3, 1.3]) S.box.box(x + d - 0.12, G.yWall + 0.3, lv(TF - 0.5), x + d + 0.12, G.yWall + 0.5, lv(TF - 0.1), '#111827'); }
      // inbound: a dock platform at trailer height inside the door and a ramp down to the floor
      const y = G.yPL;
      S.box.box(G.XW - 0.45, y - 1.5, 0, G.XW + 0.6, y + 1.5, lv(TF), '#565f6e');
      S.box.beam(G.XW + 0.6, y, lv(TF - 0.06), G.XW + 2.8, y, lv(0), 3.0, lv(0.12), '#565f6e');
      for (const s of [-1, 1]) S.box.box(G.XW - 0.45, y + s * 1.5 - 0.05, lv(TF), G.XW + 0.6, y + s * 1.5 + 0.05, lv(TF + 1.0), YELLOW);
    }
    // walkways and keep-out hatching on the floor
    floorPaint(S) {
      const G = this.G, lv = (m) => this.lv(m), z = lv(0.004), W = '#d9b81f';
      const line = (x0, y0, x1, y1) => S.box.box(Math.min(x0, x1) - 0.05, Math.min(y0, y1) - 0.05, 0.001, Math.max(x0, x1) + 0.05, Math.max(y0, y1) + 0.05, z, W);
      // a walkway round the structure's west and east ends and along the south wall
      line(G.XW + 0.6, G.yN + 0.6, G.XW + 0.6, G.yWall - 0.6);
      line(G.XE - 0.6, G.yN + 0.6, G.XE - 0.6, G.yWall - 0.6);
      line(G.XW + 0.6, G.yN + 0.6, G.XE - 0.6, G.yN + 0.6);
    }

    // ---------------------------------------------------------------- stored cases
    // A batch of instances per level, refilled only when one of its shelves
    // changes, and hidden with its level.
    extraBatches() { return this.stock || []; }
    drawStock() {
      const sim = this.sim, G = this.G, n = sim.cfg.levels;
      if (!this.stock || this.stock.length !== n) {
        for (const B of this.stock || []) { this.scene.remove(B.mesh); B.mesh.dispose(); }
        this.stock = Array.from({ length: n }, (_, f) => { const B = this.newBatch('box', 'std', 1024, { shadow: false }); B.mesh.renderOrder = -f; return B; });
        this.stockSig = [];
      }
      // from afar a case is one box in its colour, close by the carton and its print
      const p = this.camera.position, far = p.y > (this.lv(G.z(n - 1)) + 0.0) * WS.View3D.LZ + 14 || Math.hypot(p.x - G.W / 2, p.z - G.yS / 2) > G.W * 0.9;
      for (let f = 0; f < n; f++) {
        const B = this.stock[f], sh0 = f * G.A * 2, shelves = sim.shelves.slice(sh0, sh0 + G.A * 2);
        B.mesh.visible = this.shown(f);
        let sig = far ? 'f' : 'n'; for (const sh of shelves) sig += sh.ver;
        if (this.stockSig[f] === sig) continue;
        this.stockSig[f] = sig;
        B.begin();
        for (const sh of shelves) for (const e of sh.items) { const c = e.c; if ((c.state === 'STORED' || c.state === 'RELEASED') && !c.moving) this.caseAt({ box: B }, sh.x, c.y, G.zc(f), Math.PI / 2, c.p, { kind: 'case', id: c.id }, far ? { simple: true } : null); }
        B.end();
      }
    }
    // a new run starts with all its levels to fill
    reset() { super.reset(); this.stockSig = []; }

    // ---------------------------------------------------------------- live
    drawLive(alpha) {
      this.aimAtFloor();
      this.alpha = alpha; this.now = this.sim.time + alpha * this.sim.cfg.tick;
      this.drawStock();
      for (const b of this.sim.botList) this.drawBot(b, alpha);
      for (const L of [...this.sim.inLifts, ...this.sim.outLifts]) this.drawLift(L, alpha);
      this.drawConveyors(alpha);
      this.drawDepal();
      this.drawCells();
      this.drawWrapper();
      this.drawTrucks();
      this.drawFork(this.sim.fork, alpha);
    }
    // A case of product p, its bottom at zb (m), its long side along heading a:
    // the carton, and a band of its print (shrink film and its caps, a tray and the tins in it, a bale and its label).
    caseAt(D, x, y, zb, a, p, pick, o) {
      const lv = (m) => this.lv(m), u = p.W / 2 - 0.005, v = p.L / 2 - 0.005, H = p.H, B = D.box;
      const R = (u0, v0, h0, u1, v1, h1, c) => B.rbox(x, y, a, u0, v0, lv(zb + h0), u1, v1, lv(zb + h1), c, pick);
      if (o && o.ghost) { D.clear.rbox(x, y, a, -u, -v, lv(zb), u, v, lv(zb + H), '#67e8f9'); return; }
      if (o && o.simple) { R(-u, -v, 0, u, v, H, p.far || (p.far = mix(p.look === 'kraft' || p.look === 'tray' ? '#b98a58' : p.look === 'bale' ? '#eef2f6' : p.color, p.color, p.look === 'print' || p.look === 'shrink' ? 0.6 : 0.3))); return; }
      switch (p.look) {
        case 'print': R(-u, -v, 0, u, v, H, p.color); R(-u - 0.003, -v - 0.003, H * 0.62, u + 0.003, v + 0.003, H * 0.8, '#f8fafc'); break;
        case 'tray': R(-u, -v, 0, u, v, H * 0.35, '#a67a4c'); R(-u + 0.01, -v + 0.01, H * 0.35, u - 0.01, v - 0.01, H, p.color); break;
        case 'shrink': R(-u, -v, 0, u, v, H * 0.86, WS.shade ? WS.shade(p.color, 0.35) : p.color); R(-u + 0.01, -v + 0.01, H * 0.86, u - 0.01, v - 0.01, H, p.color); break;
        case 'bale': R(-u, -v, 0, u, v, H, '#eef2f6'); R(-u - 0.003, -v - 0.003, H * 0.38, u + 0.003, v + 0.003, H * 0.62, p.color); break;
        default: R(-u, -v, 0, u, v, H, '#b98a58'); R(-u - 0.003, -v - 0.003, H * 0.4, u + 0.003, v + 0.003, H * 0.64, p.color);
      }
    }
    // A case bot: a low graphite chassis with yellow bumpers, a lidar, a state-coloured
    // light along each side, and two telescopic arms that reach under a case beside it.
    drawBot(b, alpha) {
      if (!this.shown(b.level)) return;
      const D = this.dy, G = this.G, lv = (m) => this.lv(m), z = G.z(b.level), pick = { kind: 'robot', id: b.id };
      const x = lerp(b.ox, b.x, alpha), y = lerp(b.oy, b.y, alpha), a = b.oa == null ? b.a : lerpA(b.oa, b.a, alpha), col = b.down ? '#ef4444' : WS.stateColor(this.sim, b.displayState);
      const R = (B, u0, v0, h0, u1, v1, h1, c) => B.rbox(x, y, a, u0, v0, lv(z + h0), u1, v1, lv(z + h1), c, pick);
      R(D.rnd, -0.31, -0.6, 0.03, 0.31, 0.6, 0.2, '#263243');
      R(D.box, -0.28, -0.5, 0.2, 0.28, 0.5, 0.232, '#3b4658');
      for (const e of [-1, 1]) R(D.box, -0.3, e > 0 ? 0.56 : -0.607, 0.05, 0.3, e > 0 ? 0.607 : -0.56, 0.16, YELLOW);
      for (const s of [-1, 1]) R(D.lit, s * 0.313 - 0.004, -0.4, 0.1, s * 0.313 + 0.004, 0.4, 0.14, col);
      for (const v of [-0.42, 0.42]) for (const s of [-1, 1]) D.cyl.ucyl(x, y, a, s * 0.29, v, lv(z + 0.065), 0.065, 0.05, '#111317', pick);
      D.cyl.cyl(x + Math.sin(a) * 0.48, y + Math.cos(a) * 0.48, lv(z + 0.232), lv(z + 0.28), 0.045, '#0f172a', pick);
      // the arms and the case moving with them
      const an = b.anim, zc = G.zc(b.level);
      let tgt = null, ext = 0, p = 0;
      if (an) {
        p = clamp01((this.now - an.t0) / an.d); ext = p < 0.4 ? p / 0.4 : p < 0.6 ? 1 : (1 - p) / 0.4;
        tgt = b.at.kind === 'aisle' ? { x: x + an.side * (G.AW / 2 + G.RD / 2), y } : { x, y: G.yShelf };
        const dx = tgt.x - x, dy = tgt.y - y;
        for (const s of [-1, 1]) {
          const ox = dy ? s * 0.22 : 0, oy = dx ? s * 0.33 : 0;
          D.box.beam(x + ox, y + oy, lv(z + 0.24), x + ox + dx * ext, y + oy + dy * ext, lv(z + 0.24), 0.05, lv(0.025), '#cbd5e1', pick);
        }
      }
      const cs = b.c || (an && !an.put ? an.c : null);
      if (cs) {
        let f = 0;
        if (an && an.put) f = p < 0.4 ? p / 0.4 : 1;
        else if (an) f = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
        const cx = tgt ? lerp(x, tgt.x, f) : x, cy = tgt ? lerp(y, tgt.y, f) : y;
        this.caseAt(D, cx, cy, zc, f > 0.5 && tgt && b.at.kind === 'aisle' ? Math.PI / 2 : a + Math.PI / 2, cs.p, { kind: 'case', id: cs.id });
      }
    }
    // a lift's carriage with the cases on it, and the cases on its transfer shelves
    drawLift(L, alpha) {
      const D = this.dy, G = this.G, lv = (m) => this.lv(m), z = lerp(L.oz, L.z, alpha), pick = { kind: 'robot', id: L.id }, t = this.opts.floorTop;
      if (t == null || z <= G.zc(t) + 0.2) {
        D.box.box(L.x - 1.02, G.yCar - 0.4, lv(z - 0.1), L.x + 1.02, G.yCar + 0.4, lv(z - 0.02), '#334155', pick);
        for (const s of [-1, 1]) D.box.box(L.x + s * 1.0 - 0.03, G.yCar - 0.4, lv(z - 0.02), L.x + s * 1.0 + 0.03, G.yCar + 0.4, lv(z + 0.12), '#64748b', pick);
        D.box.box(L.x - 1.02, G.yCar + 0.36, lv(z - 0.02), L.x + 1.02, G.yCar + 0.4, lv(z + 0.08), L.out ? '#2563eb' : '#16a34a', pick);
        D.lit.box(L.x - 0.15, G.yCar + 0.401, lv(z), L.x + 0.15, G.yCar + 0.405, lv(z + 0.06), L.down ? '#ef4444' : L.load.length ? '#38bdf8' : '#4ade80');
        for (const c of L.load) this.caseAt(D, G.slotX(L.x, c.slotJ), G.yCar, z, Math.PI / 2, c.p, { kind: 'case', id: c.id });
        // the carriage hangs from belts to the head
        const top = this.topShown + (this.cut ? 0 : 0.8);
        for (const s of [-1, 1]) D.box.box(L.x + s * 0.9 - 0.015, G.yMast - 0.02, lv(z), L.x + s * 0.9 + 0.015, G.yMast + 0.02, lv(top), '#111827');
      }
      L.slots.forEach((sl, f) => {
        if (!this.shown(f)) return;
        sl.forEach((s, j) => { if (s.c && !s.c.moving) this.caseAt(D, G.slotX(L.x, j), G.yShelf, G.zc(f), Math.PI / 2, s.c.p, { kind: 'case', id: s.c.id }); });
      });
    }
    drawConveyors(alpha) {
      const sim = this.sim, D = this.dy, G = this.G;
      for (const q of sim.convs) for (const it of q.items) {
        const s = lerp(it.ps, it.s, alpha), at = q.at(s);
        if (it.c) this.caseAt(D, at.x, at.y, G.CZ, at.a, it.c.p, { kind: 'case', id: it.c.id });
        else if (it.pal) {
          const door = sim.doorLines.includes(q), z = door ? PZ + (TF - PZ) * clamp01(s / q.len) : PZ;
          this.drawPallet(it.pal, at.x, at.y, z);
        }
      }
      // the tunnel's curtain glows green while a case passes through it
      const t = sim.mainLine.items.some((it) => Math.abs(it.s - sim.tunnelS) < 0.7);
      if (t) D.lit.box(G.tunnelX - 0.02, G.yI - 0.36, this.lv(G.CZ), G.tunnelX + 0.02, G.yI + 0.36, this.lv(G.CZ + 0.7), '#4ade80');
    }
    // a wooden pallet: the deck boards and three runners
    palletBase(B, x, y, z, pick) {
      const lv = (m) => this.lv(m);
      B.box(x - 0.6, y - 0.5, lv(z + PH - 0.022), x + 0.6, y + 0.5, lv(z + PH), '#c9a66b', pick);
      for (const d of [-0.44, 0, 0.44]) B.box(x - 0.6, y + d - 0.05, lv(z), x + 0.6, y + d + 0.05, lv(z + PH - 0.022), '#a8844f', pick);
    }
    // A pallet and its load: a supplier's pallet of one product, or a store's mixed pallet as far as it is built.
    drawPallet(pal, x, y, z, o = {}) {
      const D = this.dy, lv = (m) => this.lv(m), pick = { kind: 'pallet', id: pal.id }, zb = z + PH;
      this.palletBase(D.box, x, y, z, pick);
      if (o.block) {
        // a loaded pallet seen from afar (in a trailer): its load as one block
        const h = pal.inbound ? pal.p.layers * pal.p.H : pal.top, col = pal.inbound ? pal.p.color : '#b98a58';
        D.box.box(x - 0.58, y - 0.48, lv(zb), x + 0.58, y + 0.48, lv(zb + h), pal.inbound && pal.p.look !== 'kraft' ? col : '#b98a58', pick);
        D.box.box(x - 0.585, y - 0.485, lv(zb + h * 0.4), x + 0.585, y + 0.485, lv(zb + h * 0.6), pal.inbound ? col : '#94a3b8', pick);
        if (!pal.inbound) D.clear.box(x - 0.6, y - 0.5, lv(zb), x + 0.6, y + 0.5, lv(zb + h + 0.02), '#e2e8f0');
        return;
      }
      if (pal.inbound) {
        const p = pal.p;
        for (let k = 0; k < pal.left; k++) { const c = pal.cases[k]; if (c.state === 'ARM') continue; this.caseAt(D, x + c.pos.u, y + c.pos.v, zb + c.pos.z, c.pos.rot ? 0 : Math.PI / 2, p, pick); }
        return;
      }
      const n = o.placed ?? pal.items.length;
      for (let k = 0; k < n; k++) { const it = pal.items[k]; this.caseAt(D, x + 0.6 - it.u - it.l / 2, y + 0.5 - it.v - it.w / 2, zb + it.z, it.l === it.p.L ? Math.PI / 2 : 0, it.p, pick); }
      // the plan's next places, as ghosts
      if (o.ghosts) for (let k = n; k < Math.min(pal.items.length, n + o.ghosts); k++) { const it = pal.items[k]; this.caseAt(D, x + 0.6 - it.u - it.l / 2, y + 0.5 - it.v - it.w / 2, zb + it.z, it.l === it.p.L ? Math.PI / 2 : 0, it.p, null, { ghost: true }); }
      const wrap = o.wrap ?? (pal.wrapped ? 1 : 0);
      if (wrap > 0) D.clear.box(x - 0.61, y - 0.51, lv(zb), x + 0.61, y + 0.51, lv(zb + (pal.top + 0.02) * wrap), '#e8eef6');
      if (pal.labelled) D.lit.box(x - 0.15, y + 0.512, lv(zb + pal.top * 0.55), x + 0.15, y + 0.515, lv(zb + pal.top * 0.55 + 0.2), '#f8fafc');
    }
    // the depalletisers' pallets (sliding in from the conveyor, then up to the arm) and the empties
    drawDepal() {
      const G = this.G, now = this.now;
      this.sim.depals.forEach((cell, k) => {
        const x = G.depX[k];
        if (cell.next) this.drawPallet(cell.next, x, lerp(G.yPL, G.yDepNext, clamp01((now - cell.next.t0) / 3)), PZ);
        if (cell.pal) this.drawPallet(cell.pal, x, lerp(G.yDepNext, G.yDepPal, clamp01(1 - cell.inT / 4)), PZ);
        for (let n = 0; n < cell.empties; n++) this.palletBase(this.dy.box, x - 1.5, G.yDepPal, 0.12 + n * PH);
        this.drawArm(cell.robot);
      });
    }
    drawCells() {
      const G = this.G, cfg = this.sim.cfg;
      this.sim.cells.forEach((cell, k) => {
        const bx = G.cellX[k] + 0.35, y = G.yBuild;
        if (cell.build) this.drawPallet(cell.build, bx, y, PZ, { placed: cell.build.placed, ghosts: 3 });
        else if (cell.done) this.drawPallet(cell.done, bx, y, PZ);
        else if (cell.coming) this.drawPallet(cell.coming, lerp(bx + 1.7, bx, clamp01(1 - cell.inT / cfg.palletIn)), y, PZ, { placed: 0 });
        this.drawArm(cell.robot);
        // the stack light: green building, amber waiting for a case, red down
        const A = cell.robot, st = A.down ? '#ef4444' : A.state === 'HANDLING' ? '#22c55e' : cell.build ? '#f59e0b' : '#64748b';
        this.dy.lit.box(G.cellX[k] - 2.46, G.yE - 0.96, this.lv(2.2), G.cellX[k] - 2.34, G.yE - 0.84, this.lv(2.38), st);
      });
    }
    armP(A) { return A.cyc ? clamp01((this.now - A.cyc.t0) / A.cyc.d) : 0; }
    // Where the arm's gripper is (its face, m) and what it holds: down to the
    // case, grip, up, swing over to its place, down, let go, back.
    armPose(A) {
      const sim = this.sim, G = this.G, cell = A.cell, cs = A.c;
      let P, Q, aP = 0, aQ = 0, clear = 0;
      if (cell.role === 'depal') {
        const x = G.depX[cell.k], pal = cell.pal, q = cell.feed.at(0.25);
        const c = cs || (pal && pal.left ? pal.cases[pal.left - 1] : null);
        if (c && c.pos) { P = { x: x + c.pos.u, y: G.yDepPal + c.pos.v, z: PZ + PH + c.pos.z + c.p.H }; aP = c.pos.rot ? 0 : Math.PI / 2; }
        else P = { x, y: G.yDepPal, z: PZ + PH + 1.0 };
        Q = { x: q.x, y: q.y, z: G.CZ + (c ? c.p.H : 0.3) }; aQ = q.a;
        clear = Math.max(P.z, Q.z) + 0.3;
      } else {
        const feed = cell.feed, end = feed.at(feed.len - 0.25), pal = cell.build, bx = G.cellX[cell.k] + 0.35;
        P = { x: end.x, y: end.y, z: G.CZ + (cs ? cs.p.H : 0.3) }; aP = end.a;
        const it = pal && pal.items[pal.placed];
        if (cs && it) { Q = { x: bx + 0.6 - it.u - it.l / 2, y: G.yBuild + 0.5 - it.v - it.w / 2, z: PZ + PH + it.z + it.h }; aQ = it.l === it.p.L ? Math.PI / 2 : 0; }
        else Q = { x: bx, y: G.yBuild, z: PZ + PH + 0.6 };
        clear = Math.max(P.z, Q.z, PZ + PH + (pal ? pal.top : 0) + (cs ? cs.p.H : 0.3)) + 0.25;
      }
      const p = this.armP(A);
      if (!A.cyc) return { tip: { x: P.x, y: P.y, z: P.z + 0.35 }, hold: null };
      const B = { x: A.x, y: A.y }, pol = (q) => ({ r: Math.hypot(q.x - B.x, q.y - B.y), t: Math.atan2(q.x - B.x, q.y - B.y), z: q.z });
      const at = (o) => ({ x: B.x + Math.sin(o.t) * o.r, y: B.y + Math.cos(o.t) * o.r, z: o.z });
      const swing = (a, b, f, z) => { const g = (1 - Math.cos(Math.PI * f)) / 2; return at({ r: lerp(a.r, b.r, g), t: lerpA(a.t, b.t, g), z }); };
      const pp = pol(P), pq = pol(Q), ez = (f) => (1 - Math.cos(Math.PI * clamp01(f))) / 2;
      let tip, hold = null, ang = aP;
      if (p < 0.12) tip = { x: P.x, y: P.y, z: lerp(P.z + 0.35, P.z, ez(p / 0.12)) };
      else if (p < 0.2) { tip = { x: P.x, y: P.y, z: P.z }; if (p > 0.16) hold = 'arm'; }
      else if (p < 0.32) { tip = { x: P.x, y: P.y, z: lerp(P.z, clear, ez((p - 0.2) / 0.12)) }; hold = 'arm'; }
      else if (p < 0.62) { const f = (p - 0.32) / 0.3; tip = swing(pp, pq, f, clear); hold = 'arm'; ang = lerpA(aP, aQ, ez(f)); }
      else if (p < 0.74) { tip = { x: Q.x, y: Q.y, z: lerp(clear, Q.z, ez((p - 0.62) / 0.12)) }; hold = 'arm'; ang = aQ; }
      else if (p < 0.8) { tip = { x: Q.x, y: Q.y, z: Q.z }; hold = p < 0.77 ? 'arm' : 'placed'; ang = aQ; }
      else { const f = (p - 0.8) / 0.2; tip = swing(pq, pp, f, lerp(Q.z, P.z + 0.35, f) + Math.sin(Math.PI * f) * 0.25); hold = 'placed'; ang = aQ; }
      if (p < 0.16) hold = 'pick';
      return { tip, hold, ang, P, Q, aP, aQ };
    }
    // An industrial robot arm on its pedestal: a turning base, an upper arm
    // and forearm (worked out from where the gripper must be), a wrist and a
    // vacuum gripper that stays level; and the case it handles.
    drawArm(A) {
      const D = this.dy, lv = (m) => this.lv(m), pick = { kind: 'robot', id: A.id }, pose = this.armPose(A), tip = pose.tip;
      const z0 = 0.5, zs = z0 + 0.62, L1 = 1.3, L2 = 1.25, WR = 0.32, sr = 0.18;
      const yaw = Math.atan2(tip.x - A.x, tip.y - A.y), r = Math.max(0.45, Math.hypot(tip.x - A.x, tip.y - A.y)), wz = tip.z + WR;
      const h = wz - zs, d = Math.min(L1 + L2 - 1e-3, Math.max(0.2, Math.hypot(r - sr, h)));
      // elbow up; out of reach, the forearm points at the target
      const a1 = Math.atan2(h, r - sr) + Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
      const W = (rr, zz) => ({ x: A.x + Math.sin(yaw) * rr, y: A.y + Math.cos(yaw) * rr, z: zz });
      const er = sr + L1 * Math.cos(a1), ez = zs + L1 * Math.sin(a1), fl = Math.hypot(r - er, wz - ez) || 1;
      const S = W(sr, zs), E = W(er, ez), Wp = W(er + ((r - er) / fl) * L2, ez + ((wz - ez) / fl) * L2);
      const col = A.down ? '#b91c1c' : ARM;
      D.cyl.cyl(A.x, A.y, lv(z0), lv(z0 + 0.18), 0.32, '#475569', pick);
      D.box.rbox(A.x, A.y, yaw, -0.26, -0.24, lv(z0 + 0.18), 0.26, 0.3, lv(zs + 0.12), col, pick);
      D.cyl.ucyl(A.x, A.y, yaw, 0, sr, lv(zs), 0.19, 0.6, '#374151', pick);
      D.rnd.beam(S.x, S.y, lv(S.z), E.x, E.y, lv(E.z), 0.26, lv(0.28), col, pick);
      D.cyl.ucyl(E.x, E.y, yaw, 0, 0, lv(E.z), 0.15, 0.4, '#374151', pick);
      D.rnd.beam(E.x, E.y, lv(E.z), Wp.x, Wp.y, lv(Wp.z), 0.19, lv(0.2), col, pick);
      D.cyl.cyl(tip.x, tip.y, lv(tip.z + 0.07), lv(wz + 0.06), 0.07, '#374151', pick);
      D.box.rbox(tip.x, tip.y, pose.ang ?? yaw, -0.2, -0.26, lv(tip.z), 0.2, 0.26, lv(tip.z + 0.07), '#1f2937', pick);
      D.lit.rbox(tip.x, tip.y, pose.ang ?? yaw, -0.06, -0.265, lv(tip.z + 0.02), 0.06, -0.26, lv(tip.z + 0.05), A.state === 'HANDLING' ? '#38bdf8' : '#334155');
      const cs = A.c;
      if (!cs || !pose.hold) return;
      const at = pose.hold === 'pick' ? pose.P : pose.hold === 'placed' ? pose.Q : tip, a = pose.hold === 'pick' ? pose.aP : pose.hold === 'placed' ? pose.aQ : pose.ang;
      this.caseAt(D, at.x, at.y, at.z - cs.p.H, a, cs.p, { kind: 'case', id: cs.id });
    }
    // the stretch wrapper's arm going round with the film, the pallet in it, the one at the labeller
    drawWrapper() {
      const sim = this.sim, G = this.G, D = this.dy, lv = (m) => this.lv(m), Wr = sim.wrapper, Lb = sim.labeller, x = G.xWr - 0.65, y = G.yC;
      let ang = 0, zc = 1.0;
      if (Wr.pal) {
        const f = clamp01(1 - Wr.t / sim.cfg.wrapTime);
        this.drawPallet(Wr.pal, x, y, PZ, { wrap: f });
        ang = this.now * 1.6; zc = PZ + PH + (Wr.pal.top) * (0.5 - 0.5 * Math.cos(f * Math.PI * 4));
      }
      // the arm hangs from the top, its carriage with the film roll runs up and down it
      const ax = x + Math.sin(ang) * 1.05, ay = y + Math.cos(ang) * 1.05;
      D.box.beam(x, y, lv(3.0), ax, ay, lv(3.0), 0.14, lv(0.14), '#e5e7eb');
      D.box.box(ax - 0.06, ay - 0.06, lv(0.6), ax + 0.06, ay + 0.06, lv(3.0), '#e5e7eb');
      D.cyl.cyl(ax, ay, lv(zc - 0.25), lv(zc + 0.25), 0.07, '#cbd5e1');
      D.box.box(ax - 0.1, ay - 0.1, lv(zc - 0.3), ax + 0.1, ay + 0.1, lv(zc - 0.25), '#475569');
      if (Lb.pal) this.drawPallet(Lb.pal, G.xLb - 0.65, y, PZ);
    }
    // the inbound truck at the west door; the stores' trucks at the south doors
    drawTrucks() {
      const sim = this.sim, G = this.G;
      const tr = sim.inTruck;
      if (tr) {
        const off = tr.state === 'ARRIVING' ? (tr.t / 25) * 30 : tr.state === 'LEAVING' ? (1 - tr.t / 25) * 30 : 0;
        this.truck(G.XW - 0.4 - off, G.yPL, -Math.PI / 2, 'inbound');
        tr.pallets.forEach((pal, k) => { const s = sim.truckSpot(k); this.drawPallet(pal, s.x - off, s.y, TF, { block: true }); });
      }
      for (const d of sim.doors) {
        const t = d.truck;
        if (!t) continue;
        const off = t.state === 'ARRIVING' ? (t.t / 25) * 30 : t.state === 'LEAVING' ? (1 - t.t / 25) * 30 : 0, y0 = G.yWall + 0.4 + off;
        this.truck(d.x, y0, 0, t.order.store);
        const spot = (k) => ({ x: d.x + (k % 2 ? 0.61 : -0.61), y: y0 + 13.6 - 0.55 - Math.floor(k / 2) * 1.04 });
        t.pallets.forEach((pal, k) => { const s = spot(k); this.drawPallet(pal, s.x, s.y, TF, { block: true }); });
        if (d.loading) { const s = spot(t.pallets.length), f = clamp01((this.now - d.loading.t0) / 18); this.drawPallet(d.loading.pal, lerp(d.x, s.x, f), lerp(G.yWall + 0.4, s.y, f), TF, { block: true }); }
      }
    }
    // A trailer (its floor at dock height, no roof so its load can be seen) and its tractor;
    // (x, y) is the trailer's rear, a the way it runs from there (as rbox: along (sin a, cos a)).
    truck(x, y, a, who) {
      const D = this.dy, lv = (m) => this.lv(m), L = 13.6, W = 1.24, inb = who === 'inbound', col = inb ? '#e5e7eb' : '#dbe3ee';
      const R = (B, u0, v0, z0, u1, v1, z1, c) => B.rbox(x, y, a, u0, v0, lv(z0), u1, v1, lv(z1), c);
      R(D.box, -W, 0, TF - 0.12, W, L, TF, '#4b5563');
      for (const s of [-1, 1]) { R(D.box, s > 0 ? W - 0.04 : -W, 0, TF, s > 0 ? W : -W + 0.04, L, TF + 2.6, col); R(D.box, s > 0 ? W : -W - 0.006, 0.3, TF + 0.9, s > 0 ? W + 0.006 : -W, L - 0.3, TF + 1.3, inb ? '#0ea5e9' : '#16a34a'); }
      R(D.box, -W, L - 0.04, TF, W, L, TF + 2.6, col);
      // the rear doors swung open against the sides
      for (const s of [-1, 1]) R(D.box, s > 0 ? W + 0.02 : -W - 0.08, 0.05, TF, s > 0 ? W + 0.08 : -W - 0.02, 1.25, TF + 2.5, '#cbd5e1');
      for (const v of [0.9, 2.1, 3.3]) for (const s of [-1, 1]) D.cyl.ucyl(x, y, a, s * 1.0, v, lv(0.5), 0.5, 0.36, '#111317');
      // the tractor
      R(D.box, -1.1, L + 0.2, 0.4, 1.1, L + 6.0, 1.2, '#1f2937');
      R(D.box, -1.25, L + 3.7, 1.0, 1.25, L + 6.0, 3.7, inb ? '#0369a1' : '#15803d');
      R(D.box, -1.1, L + 5.99, 2.4, 1.1, L + 6.01, 3.3, '#0b1220');
      for (const v of [L + 1.0, L + 2.3, L + 5.0]) for (const s of [-1, 1]) D.cyl.ucyl(x, y, a, s * 1.0, v, lv(0.5), 0.5, 0.34, '#111317');
    }
    // The forklift at the inbound dock: counterweight, cab and guard, mast and forks, a driver.
    drawFork(F, alpha) {
      const D = this.dy, G = this.G, lv = (m) => this.lv(m), pick = { kind: 'robot', id: F.id };
      const x = lerp(F.ox, F.x, alpha), y = lerp(F.oy, F.y, alpha), a = F.oa == null ? F.a : lerpA(F.oa, F.a, alpha), fk = lerp(F.ofork, F.fork, alpha);
      // on the dock platform and up the ramp into the trailer
      const z0 = x < G.XW + 0.6 ? TF : x < G.XW + 2.8 ? TF * (1 - (x - G.XW - 0.6) / 2.2) : 0;
      const R = (B, u0, v0, h0, u1, v1, h1, c) => B.rbox(x, y, a, u0, v0, lv(z0 + h0), u1, v1, lv(z0 + h1), c, pick);
      R(D.rnd, -0.55, -1.0, 0.18, 0.55, 0.45, 0.95, '#f59e0b');
      R(D.box, -0.55, -1.12, 0.18, 0.55, -0.85, 0.85, '#374151');
      for (const u of [-0.5, 0.5]) for (const v of [-0.75, 0.3]) R(D.box, u - 0.03, v - 0.03, 0.95, u + 0.03, v + 0.03, 2.1, '#111827');
      R(D.box, -0.53, -0.8, 2.1, 0.53, 0.35, 2.14, '#111827');
      for (const u of [-0.3, 0.3]) R(D.box, u - 0.05, 0.48, 0.05, u + 0.05, 0.56, 2.3, '#374151');
      const fz = 0.08 + fk * 0.35;
      R(D.box, -0.42, 0.56, fz, 0.42, 0.6, fz + 0.65, '#374151');
      for (const u of [-0.25, 0.25]) R(D.box, u - 0.05, 0.6, fz, u + 0.05, 1.85, fz + 0.045, '#4b5563');
      for (const v of [-0.7, 0.3]) for (const s of [-1, 1]) D.cyl.ucyl(x, y, a, s * 0.5, v, lv(z0 + 0.22), 0.22, 0.2, '#111317', pick);
      // the driver
      R(D.rnd, -0.17, -0.45, 0.95, 0.17, -0.2, 1.45, '#1d4ed8');
      R(D.rnd, -0.09, -0.38, 1.47, 0.09, -0.22, 1.66, '#e0b796');
      R(D.dome, -0.11, -0.4, 1.6, 0.11, -0.2, 1.74, YELLOW);
      if (F.pal) this.drawPallet(F.pal, x + Math.sin(a) * 1.25, y + Math.cos(a) * 1.25, z0 + fz - 0.02, { block: true });
    }

    // ---------------------------------------------------------------- follow, ride, pick, labels
    followPos(id, alpha) {
      const m = this.sim.fleet[id], G = this.G, a = alpha ?? 1;
      if (!m) return null;
      if (m instanceof WS.CaseBot) return { x: lerp(m.ox, m.x, a), y: lerp(m.oy, m.y, a), z: this.lv(G.z(m.level)) };
      if (m instanceof WS.CaseLift) return { x: m.x, y: G.yCar, z: this.lv(lerp(m.oz, m.z, a)) };
      if (m instanceof WS.CaseForklift) return { x: lerp(m.ox, m.x, a), y: lerp(m.oy, m.y, a), z: 0 };
      return { x: m.x, y: m.y, z: this.lv(1.2) };
    }
    pickRider(not) {
      const bots = this.sim.botList.filter((b) => b.id !== not && this.shown(b.level)), busy = bots.filter((b) => b.c);
      const pool = busy.length ? busy : bots.length ? bots : this.sim.botList;
      return pool[Math.floor(Math.random() * pool.length)].id;
    }
    // just above the case it carries, under the level above
    rideFront() { return 0.45; }
    rideHeight() { return this.lv(0.6); }
    // a technician on the floor beside a lift, an arm or the forklift; a bot is fetched out by a service bot (not drawn)
    techSpot(m, p) {
      const G = this.G;
      if (m instanceof WS.CaseBot) return null;
      if (m instanceof WS.CaseLift) return { x: m.x + 1.4, y: G.yBase + 0.7, z: 0, a: 0 };
      return { x: p.x + 0.9, y: p.y + 0.9, z: 0, a: 0 };
    }
    pickFloor(f) {
      for (const p of this.sim.ports) if (Math.abs(f.x - p.drop.x) < 1.6 && Math.abs(f.y - p.drop.y) < 1.6) return { kind: 'port', id: p.idx };
      return null;
    }
    selectionBox(s, alpha) {
      const sim = this.sim, G = this.G, lv = (m) => this.lv(m);
      if (s.kind === 'robot') {
        const m = sim.fleet[s.id], p = this.followPos(s.id, alpha);
        if (!m || !p) return null;
        if (m instanceof WS.CaseBot) return [p.x - 0.7, p.y - 0.7, p.x + 0.7, p.y + 0.7, p.z + 0.02];
        if (m instanceof WS.CaseLift) return [m.x - 1.1, G.yCar - 0.5, m.x + 1.1, G.yCar + 0.5, p.z + 0.02];
        return [p.x - 1.0, p.y - 1.0, p.x + 1.0, p.y + 1.0, 0.02];
      }
      if (s.kind === 'port') { const p = sim.ports[s.id]; return [p.drop.x - 1.5, p.drop.y - 1.3, p.drop.x + 1.5, p.drop.y + 1.3, 0.02]; }
      if (s.kind === 'shelf') { const sh = sim.shelves[s.id], x0 = sh.x - G.RD / 2, x1 = sh.x + G.RD / 2; return [x0, 0.1, x1, G.yS - 0.8, lv(G.zc(sh.f)) + 0.02]; }
      if (s.kind === 'case') { const c = sim.caseById.get(s.id), q = c && this.casePos(c); return q && [q.x - 0.35, q.y - 0.35, q.x + 0.35, q.y + 0.35, q.z]; }
      if (s.kind === 'pallet') { const pal = sim.palletById.get(s.id), q = pal && this.palletPos(pal); return q && [q.x - 0.7, q.y - 0.6, q.x + 0.7, q.y + 0.6, q.z]; }
      return null;
    }
    // where a pallet is now (levels for z), or null
    palletPos(pal) {
      const sim = this.sim, G = this.G, lv = (m) => this.lv(m);
      if (pal.where === 'line') for (const q of sim.convs) { const it = q.items.find((i) => i.pal === pal); if (it) { const a = q.at(it.s); return { x: a.x, y: a.y, z: lv(PZ) }; } }
      if (pal.inbound) {
        if (pal.cell) return { x: G.depX[pal.cell.k], y: pal.where === 'next' ? G.yDepNext : G.yDepPal, z: lv(PZ) };
        if (pal.where === 'fork') { const F = sim.fork; return { x: F.x + Math.sin(F.a) * 1.25, y: F.y, z: lv(0.5) }; }
        const tr = sim.inTruck, k = tr ? tr.pallets.indexOf(pal) : -1;
        if (k >= 0) { const s = sim.truckSpot(k); return { x: s.x, y: s.y, z: lv(TF) }; }
        return null;
      }
      if (pal.where === 'cell' || pal.where === 'queue' || pal.state === 'DONE') return { x: G.cellX[pal.cell.k] + 0.35, y: G.yBuild, z: lv(PZ) };
      if (pal.where === 'wrapper') return { x: G.xWr - 0.65, y: G.yC, z: lv(PZ) };
      if (pal.where === 'labeller') return { x: G.xLb - 0.65, y: G.yC, z: lv(PZ) };
      if (pal.where === 'truck') { const d = sim.doors[pal.cell.k]; return { x: d.x, y: G.yWall + 6, z: lv(TF) }; }
      return null;
    }
    // where a case is now (levels for z), what is happening to it and how far it is
    casePos(c) {
      const sim = this.sim, G = this.G, lv = (m) => this.lv(m), out = !!c.cell;
      const conv = () => { for (const q of sim.convs) { const it = q.items.find((i) => i.c === c); if (it) { const a = q.at(it.s); return { x: a.x, y: a.y, z: lv(G.CZ), q }; } } return null; };
      switch (c.state) {
        case 'INBOUND': { const q = c.pal && this.palletPos(c.pal); return q && Object.assign(q, { step: 0, text: `On a pallet of ${c.p.palletCases} from the supplier${c.pal.where === 'truck' ? ', in the truck' : c.pal.where === 'fork' ? ', on the forklift' : c.pal.cell ? ' at ' + c.pal.cell.name : ', on the pallet conveyor'}` }); }
        case 'ARM': { const A = sim.ports.map((p) => p.robot).find((r) => r.c === c), t = A && this.armPose(A).tip; return t && { x: t.x, y: t.y, z: lv(t.z), step: out ? 4 : 0, text: out ? `${A.name} stacks it in its place on the pallet` : `${A.name} takes it off the pallet` }; }
        case 'CONV': { const q = conv(); return q && Object.assign(q, { step: out ? 3 : 1, text: out ? `On its way down to ${c.cell.name}, place ${c.seq - c.item.pal.items[0].seq + 1} of ${c.item.pal.items.length}` : c.dest ? `Measured; to input lift ${c.route + 1}, then level ${c.f + 1}, aisle ${c.k + 1}` : 'Riding to the measuring tunnel' }); }
        case 'LIFT': { const L = c.lift; return L && { x: G.slotX(L.x, c.slotJ), y: G.yCar, z: lv(L.z), step: out ? 3 : 1, text: out ? `${L.name} takes it down, in sequence` : `${L.name} takes it up to level ${c.f + 1}` }; }
        case 'SLOT': { const L = [...sim.inLifts, ...sim.outLifts].find((m) => m.slots[c.f] && m.slots[c.f].some((s) => s.c === c)); return L && { x: G.slotX(L.x, c.slotJ), y: G.yShelf, z: lv(G.zc(c.f)), step: out ? 3 : 1, text: out ? `On level ${c.f + 1}'s shelf at ${L.name}, waiting for its turn` : `On level ${c.f + 1}'s transfer shelf, waiting for a bot` }; }
        case 'BOT': { const b = c.bot; return b && { x: b.x, y: b.y, z: lv(G.zc(b.level)), step: out ? 3 : 1, text: out ? `${b.name} brings it to ${c.cell.lift.name}` : `${b.name} takes it to aisle ${c.k + 1}` }; }
        case 'STORED': return { x: c.x, y: c.y, z: lv(G.zc(c.f)), step: 2, text: `Stored: level ${c.f + 1}, aisle ${c.k + 1}, ${(G.yS - c.y).toFixed(1)} m in`, done: true };
        case 'RELEASED': return { x: c.x, y: c.y, z: lv(G.zc(c.f)), step: 3, text: `Released for ${c.cell.name}: a bot of level ${c.f + 1} is coming for it` };
        case 'PALLET': { const pal = c.palOut, q = pal && this.palletPos(pal); return q && Object.assign(q, { step: pal.where === 'truck' ? 5 : 4, done: pal.where === 'truck', text: pal.where === 'truck' ? `Loaded for store ${pal.order.store.no} ${pal.order.store.town}` : `On pallet ${pal.k + 1} of ${pal.of} for store ${pal.order.store.no}${pal.state === 'WRAP' ? ', being wrapped' : ''}` }); }
      }
      return null;
    }
    drawLabels() {
      const sim = this.sim, G = this.G, bg = 'rgba(15,23,42,0.82)', lv = (m) => this.lv(m), top = G.z(sim.cfg.levels - 1) + sim.cfg.levelHeight;
      for (const p of sim.depals) this.label(`${p.code} · ${p.robot.down ? 'DOWN' : p.pal ? `${p.pal.left} left` : 'WAITING'}`, p.drop.x, p.drop.y, lv(2.5), { size: 10, bg, color: '#86efac' });
      for (const p of sim.cells) {
        const b = p.build, st = p.robot.down ? 'DOWN' : b ? `${b.order.store.town} ${b.k + 1}/${b.of} · ${b.placed}/${b.items.length}` : p.coming ? 'NEW PALLET' : 'WAITING';
        this.label(`${p.code} · ${st}`, p.drop.x, p.drop.y, lv(2.7), { size: 10, bg, color: '#fdba74' });
      }
      for (const L of sim.inLifts) this.label(L.name, L.x, G.yMast, lv(top + 1.8), { size: 9, bg, color: '#86efac' });
      for (const L of sim.outLifts) this.label(L.name, L.x, G.yMast, lv(top + 1.8), { size: 9, bg, color: '#93c5fd' });
      const shownTop = this.opts.floorTop ?? sim.cfg.levels - 1;
      this.label(`L${shownTop + 1}${this.opts.cutOnly ? ' only' : ''} · ${sim.levels[shownTop].bots.map((b) => (b.c ? '■' : '□')).join('')}`, G.DX0 - 0.6, G.yL[0], lv(G.z(shownTop) + 0.5), { size: 10, bg, color: '#e2e8f0' });
      this.label(`Structure · ${sim.stockCount()} cases · ${Math.round(sim.fill() * 100)}% of the shelf length`, G.W / 2, 0.4, lv(top + 0.9), { size: 10, bg, color: '#bfdbfe' });
      this.label('Tunnel', G.tunnelX, G.yI, lv(G.CZ + 1.3), { size: 9, bg, color: '#7dd3fc' });
      this.label(`Wrapper${sim.wrapper.pal ? ' · ' + Math.round(100 * (1 - sim.wrapper.t / sim.cfg.wrapTime)) + '%' : ''}`, G.xWr - 0.65, G.yC, lv(3.6), { size: 10, bg, color: '#e2e8f0' });
      for (const d of sim.doors) if (d.truck) this.label(`Door ${d.k + 1} · ${d.truck.order.store.no} ${d.truck.order.store.town} · ${d.truck.order.loaded}/${d.truck.order.pallets.length}`, d.x, G.yWall - 0.5, lv(4.6), { size: 10, bg, color: '#bbf7d0' });
      if (sim.inTruck) this.label(`Inbound · ${sim.inTruck.pallets.length} pallets on the truck`, G.XW + 0.5, G.yPL, lv(4.8), { size: 10, bg, color: '#bae6fd' });
    }

    // ---------------------------------------------------------------- follow a case
    // A case just measured on its way into storage, or one just released for a pallet.
    pickFollow(not) {
      const sim = this.sim, pool = [];
      for (const it of sim.mainLine.items) if (it.c !== not && !it.c.dest) pool.push(it.c);
      const rel = []; for (const lv of sim.levels) for (const t of lv.tasks) if (t.type === 'fetch' && t.c !== not && this.shown(lv.f)) rel.push(t.c);
      const from = Math.random() < 0.5 && rel.length ? rel : pool.length ? pool : rel;
      return from.length ? { order: from[Math.floor(Math.random() * from.length)] } : null;
    }
    orderFocus(c) {
      const q = this.casePos(c);
      if (!q) return { x: this.G.doorX[0], y: this.G.yWall + 3, z: this.lv(1.5), step: 5, done: true, text: 'Shipped' };
      return Object.assign(q, { z: q.z + this.lv(0.3) });
    }
    hudHTML() {
      const c = this.follow.order, f = this.followNow || { step: 0, text: '' }, esc = WS.U.esc;
      const chips = STEPS.map((s, k) => `<span class="${k < f.step || f.done ? 'done' : k === f.step ? 'now' : ''}">${s}</span>`).join('<i></i>');
      return `<div class="fh-top"><b>Case ${c.id}</b><button data-fh="next" title="Follow another (N)">Next</button><button data-fh="stop" title="Stop following">×</button></div>
        <div class="fh-meta">${esc(c.p.name)} · ${c.p.kg} kg · GTIN ${c.p.gtin}</div><div class="fh-steps">${chips}</div><div class="fh-text">${esc(f.text)}</div>`;
    }
    drawLabelLayer() {
      const F = this.follow, f = this.followNow;
      this.follow = null;
      super.drawLabelLayer();
      this.follow = F;
      if (this.cam.mode === 'order' && F && F.order && f) this.label('▼ case ' + F.order.id, f.x, f.y, f.z + this.lv(0.9), { size: 11, weight: 800, color: '#0f172a', bg: 'rgba(250,204,21,0.92)' });
    }
  }

  WS.CaseRenderer3D = CaseRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
