/* PocketFlow in the free 3D view, one cell a metre. Overhead, on hangers
 * from a steel grid, the rails: the main loop, the storage rails and the
 * sequencer's two banks between its long sides, the feeder winding over
 * the pack stations, the return rail and the empty-pocket buffer to and fro
 * along the west wall. The pockets hang from their trolleys: a fabric pouch
 * that bulges with the item in it (its colour shows at the mouth), or a
 * garment on a hanger; they sway as they go, open at the loading station
 * and drop the item onto the table at a pack station. On the floor the
 * loading stations with their totes, the returns desk, a strip of shelving
 * with pickers, the pack stations with the parcels leaving on a conveyor
 * and the dock door. The line of the sequencer being emptied lights up. */
(function (WS) {
  'use strict';
  const LZ = WS.View3D.LZ;
  const STEEL = '#64748b', DARK = '#1f2937', YELLOW = '#facc15';
  const STEPS = ['Picked', 'Pocket', 'Storage', 'Sequencer', 'Packed'];
  const RAIL = { rail: '#9aa8bb', lane: '#7b8aa0', seqA: '#8b5cf6', seqB: '#a855f7', return: '#64748b', buffer: '#64748b', dist: '#7b8aa0', load: '#9aa8bb', spur: '#9aa8bb' };
  const POUCH = { EMPTY: '#cbd5e1', STOCK: '#f3d48a', WAIT: '#e2e8f0', READY: '#e2e8f0', SEQ: '#e9d5ff', PACK: '#bbf7d0', RESTOCK: '#cbd5e1' };
  const lerp = (a, b, t) => (a == null ? b : a + (b - a) * t);

  class PocketRenderer3D extends WS.View3D {
    get G() { return this.sim.G; }
    // The rail comes down at the stations: to chest height for the loader, lower over the packing table.
    railZ(b, s) {
      const H = this.H, dip = b.kind === 'load' ? [1.5, 2.0] : b.kind === 'spur' ? [0.6, 2.7] : null;
      if (!dip) return H;
      const u = (s - (b.len - dip[0])) / dip[0];
      return u <= 0 ? H : H + (dip[1] - H) * Math.min(1, u);
    }
    get followSteps() { return STEPS; }
    get H() { return this.sim.cfg.railHeight; }
    buildKey() { const c = this.sim.cfg; return [super.buildKey(), c.storageLanes, c.seqLines, c.loadStations, c.packingStations].join('|'); }
    bounds() { const G = this.G; return { x0: G.X0, y0: 0, x1: G.W, y1: G.D }; }
    hall() { const G = this.G; return { x0: G.X0 - 0.5, y0: -0.5, x1: G.W + 0.5, y1: G.D + 0.5, doors: [{ side: 'E', a: G.unloadY + 0.6, b: G.unloadY + 3.4, h: this.lv(3.4) }] }; }
    fit() {
      const G = this.G, c = this.cam;
      // from the south-east, above the pack stations, looking over the rails to the storage and the sequencer
      Object.assign(c, { walk: false, follow: null, tx: (G.X0 + G.W) / 2 + 2, ty: G.yB - 2, tz: this.lv(1.5), yaw: 0.5, pitch: 0.55 });
      c.dist = (G.W - G.X0) * 0.75 / Math.min(1, this.w / this.h);
      this.syncWalkButton();
    }
    // where people work: the stations and the returns desk keep a light in lights-out
    workLights() {
      const out = this.sim.ports.map((p) => ({ x: p.drop.x, y: p.drop.y + 0.6 }));
      out.push({ x: 2.5, y: this.G.yB + 3 });
      return out;
    }

    // ---------------------------------------------------------------- static
    buildStations(S) {
      const sim = this.sim, G = this.G, lv = (m) => this.lv(m), H = this.H, top = 5.4;
      // the grid and the hangers: seen from below only (see cutaway), so the rails can be looked down on
      if (!this.grid) this.grid = this.newBatch('box', 'std', 1024, { cast: false });
      const Gd = this.grid; Gd.begin();
      // the steel grid the rails hang from: beams along x every 3 m, along y every 6 m, columns on the perimeter and every 12 m
      for (let y = 1; y < G.D; y += 3) Gd.box(G.X0 + 0.5, y - 0.08, lv(top), G.W - 0.5, y + 0.08, lv(top + 0.25), '#475569');
      for (let x = G.X0 + 1; x < G.W; x += 6) Gd.box(x - 0.1, 0.5, lv(top + 0.25), x + 0.1, G.D - 0.5, lv(top + 0.55), '#3b4a5f');
      for (let x = G.X0 + 1; x < G.W; x += 12) for (const y of [1, G.D - 1]) { S.box.box(x - 0.15, y - 0.15, 0, x + 0.15, y + 0.15, lv(top + 0.55), STEEL); S.box.box(x - 0.2, y - 0.2, 0, x + 0.2, y + 0.2, lv(0.9), YELLOW); }
      // the rails, and a hanger to the grid every 2.4 m
      for (const b of sim.net.belts) {
        const col = RAIL[b.kind] || RAIL.rail, pick = b.kind === 'lane' || b.kind.startsWith('seq') ? { kind: 'lane', id: b.idx } : null;
        const dips = b.kind === 'load' || b.kind === 'spur', step = dips ? 0.25 : Infinity;
        for (let k = 1; k < b.pts.length; k++) {
          const a = b.pts[k - 1], c = b.pts[k], l = Math.hypot(c.x - a.x, c.y - a.y);
          if (l < 1e-3) continue;
          // where the rail dips, in short pieces along the slope
          const n = Math.max(1, Math.ceil(l / step)), s0 = b.cum[k - 1];
          for (let j = 0; j < n; j++) {
            const f0 = j / n, f1 = (j + 1) / n, p0 = { x: a.x + (c.x - a.x) * f0, y: a.y + (c.y - a.y) * f0 }, p1 = { x: a.x + (c.x - a.x) * f1, y: a.y + (c.y - a.y) * f1 };
            const z0 = this.railZ(b, s0 + l * f0), z1 = this.railZ(b, s0 + l * f1);
            S.box.beam(p0.x, p0.y, lv(z0 + 0.04), p1.x, p1.y, lv(z1 + 0.04), 0.09, 0.1, col, pick);
            S.box.beam(p0.x, p0.y, lv(z0 + 0.12), p1.x, p1.y, lv(z1 + 0.12), 0.04, 0.06, DARK, pick);
          }
        }
        for (let s = 0.4; s < b.len; s += 2.4) { const q = b.at(s); Gd.box(q.x - 0.02, q.y - 0.02, lv(this.railZ(b, s) + 0.12), q.x + 0.02, q.y + 0.02, lv(top), '#94a3b8'); }
        if (dips) { const q = b.at(b.len); S.box.box(q.x - 0.02, q.y - 0.02, lv(this.railZ(b, b.len) + 0.12), q.x + 0.02, q.y + 0.02, lv(H + 0.12), '#94a3b8'); }
      }
      Gd.end();
      this.loading(S); this.packing(S); this.returnsDesk(S); this.shelving(S);
    }
    // loading stations: an opener frame round the pocket, a bench with the totes, a screen; the tote conveyor
    loading(S) {
      const G = this.G, lv = (m) => this.lv(m), H = this.H;
      for (const p of this.sim.loaders) {
        const x = p.drop.x, y = p.drop.y, pick = { kind: 'port', id: p.idx };
        // the opener: a frame that holds the pocket's mouth open at chest height
        for (const dx of [-0.42, 0.42]) S.box.box(x + dx - 0.04, y - 0.04, 0, x + dx + 0.04, y + 0.04, lv(1.7), '#475569', pick);
        S.box.box(x - 0.46, y - 0.12, lv(1.62), x + 0.46, y - 0.06, lv(1.68), YELLOW, pick);
        S.box.box(x - 0.46, y + 0.06, lv(1.62), x + 0.46, y + 0.12, lv(1.68), YELLOW, pick);
        // the bench beside the operator, with a scanner and a screen
        S.box.box(x + 0.6, y + 0.15, 0, x + 1.7, y + 1.35, lv(0.85), '#334155', pick);
        S.box.box(x + 0.6, y + 0.15, lv(0.85), x + 1.7, y + 1.35, lv(0.9), '#cbd5e1', pick);
        S.box.box(x - 1.0, y + 0.5, 0, x - 0.92, y + 0.58, lv(1.3), '#475569');
        S.box.box(x - 1.2, y + 0.48, lv(1.3), x - 0.72, y + 0.6, lv(1.65), '#0f172a', pick);
        S.lit.box(x - 1.16, y + 0.61, lv(1.34), x - 0.76, y + 0.62, lv(1.61), p.role === 'returns' ? '#fbbf24' : '#38bdf8');
      }
      // the tote conveyor up from the shelving past the benches
      const cx = G.loadX + 2.25, y0 = G.loadY[0] + 0.6, y1 = G.yB + 6;
      S.box.box(cx - 0.3, y0, lv(0.7), cx + 0.3, y1, lv(0.78), '#475569');
      for (let y = y0 + 0.15; y < y1; y += 0.3) S.cyl.cylX(cx - 0.28, cx + 0.28, y, lv(0.8), 0.03, '#94a3b8');
      for (let y = y0 + 1; y < y1; y += 2) for (const dx of [-0.25, 0.25]) S.box.box(cx + dx - 0.03, y - 0.03, 0, cx + dx + 0.03, y + 0.03, lv(0.7), STEEL);
    }
    // pack stations: a table under the pocket, a packing bench, cartons; the parcel conveyor to the dock door
    packing(S) {
      const G = this.G, lv = (m) => this.lv(m);
      for (const p of this.sim.ports.filter((q) => q.kind === 'PACK')) {
        const x = p.drop.x, y = p.drop.y, pick = { kind: 'port', id: p.idx };
        S.box.box(x - 0.8, y - 0.45, 0, x + 0.8, y + 0.45, lv(0.82), '#334155', pick);
        S.box.box(x - 0.85, y - 0.5, lv(0.82), x + 0.85, y + 0.5, lv(0.88), '#d6c6a5', pick);
        if (p.role === 'restock') { S.box.box(x - 0.3, y - 0.2, lv(0.88), x + 0.3, y + 0.2, lv(1.2), '#2563eb', pick); continue; }
        // carton stack and a label printer
        for (let k = 0; k < 4; k++) S.box.box(x + 1.0, y - 0.35, lv(0.15 * k), x + 1.6, y + 0.15, lv(0.15 * k + 0.13), '#b8875a', pick);
        S.box.box(x - 1.4, y - 0.3, lv(0.88), x - 1.0, y + 0.1, lv(1.12), '#e5e7eb', pick);
        S.box.box(x - 1.6, y - 0.4, 0, x - 0.85, y + 0.2, lv(0.88), '#334155', pick);
      }
      // the parcel conveyor behind the packers, east to the dock door
      const cy = G.unloadY + 1.95, x0 = Math.min(...this.sim.ports.filter((q) => q.role === 'pack').map((q) => q.drop.x)) - 1.5;
      S.box.box(x0, cy - 0.3, lv(0.7), G.W, cy + 0.3, lv(0.78), '#475569');
      S.box.box(x0, cy - 0.26, lv(0.78), G.W, cy + 0.26, lv(0.8), '#1f2937');
      for (let x = x0 + 1; x < G.W; x += 2.5) for (const dy of [-0.25, 0.25]) S.box.box(x - 0.03, cy + dy - 0.03, 0, x + 0.03, cy + dy + 0.03, lv(0.7), STEEL);
    }
    // the returns desk: tables where the returns are unpacked and checked, parcels waiting, a rework cage
    returnsDesk(S) {
      const G = this.G, lv = (m) => this.lv(m), y = G.yB + 2.6;
      for (let k = 0; k < this.sim.cfg.inspectors; k++) {
        const x = -1.5 + k * 1.8;
        S.box.box(x - 0.75, y - 0.4, 0, x + 0.75, y + 0.4, lv(0.85), '#334155');
        S.box.box(x - 0.8, y - 0.45, lv(0.85), x + 0.8, y + 0.45, lv(0.9), '#e2e8f0');
      }
      for (let k = 0; k < 6; k++) S.box.box(-3.6 + (k % 3) * 0.55, y - 1.4 + Math.floor(k / 3) * 0.55, 0, -3.15 + (k % 3) * 0.55, y - 0.95 + Math.floor(k / 3) * 0.55, lv(0.35 + (k % 2) * 0.1), '#b8875a');
      S.clear.box(-4.2, y + 0.8, 0, -3.0, y + 1.8, lv(1.6), '#94a3b8');
    }
    // a strip of the shelving the pickers pick from
    shelving(S) {
      const G = this.G, lv = (m) => this.lv(m), cols = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2'];
      for (let r = 0; r < 3; r++) {
        const y = G.yB + 5.5 + r * 2.2;
        for (let x = G.X0 + 1.5; x < -4.5; x += 1.0) {
          S.box.box(x, y, 0, x + 0.95, y + 0.5, lv(0.05), STEEL);
          for (let z = 0.45; z < 2.2; z += 0.55) {
            S.box.box(x, y, lv(z), x + 0.95, y + 0.5, lv(z + 0.03), '#94a3b8');
            S.box.box(x + 0.08, y + 0.05, lv(z + 0.03), x + 0.87, y + 0.45, lv(z + 0.28), cols[Math.floor((x * 7 + z * 13 + r * 5) % cols.length + cols.length) % cols.length]);
          }
          for (const dx of [0, 0.92]) S.box.box(x + dx, y, 0, x + dx + 0.03, y + 0.5, lv(2.3), '#475569');
        }
      }
    }

    // ---------------------------------------------------------------- live
    drawStationsLive() {} // the stations are drawn in drawLive
    cutaway() {
      super.cutaway();
      if (this.grid) this.grid.mesh.visible = this.camera.position.y < this.lv(5.4) * LZ;
    }
    drawLive(alpha) {
      const sim = this.sim, D = this.dy;
      this.alpha = alpha;
      for (const p of sim.pocketList) this.pocket(p, alpha);
      this.sequencerLights();
      this.stationsLive(alpha);
      this.people();
      void D;
    }
    // a pocket hanging from its trolley: a pouch, open while it is loaded or
    // emptied, bulging with an item; a garment on a hanger instead of a pouch
    pocket(p, alpha) {
      const D = this.dy, lv = (m) => this.lv(m), x = lerp(p.px, p.x, alpha), y = lerp(p.py, p.y, alpha), a = Math.atan2(-(p.dx || 0), -(p.dy || 1)), pick = { kind: 'pocket', id: p.id };
      const H = p.belt ? this.railZ(p.belt, p.s) : this.H;
      const it = p.item, sel = this.selected && this.selected.kind === 'pocket' && this.selected.id === p.id;
      const st = this.stationOf(p), open = st && st.kind === 'LOAD' ? 1 : 0, drop = st && st.kind === 'PACK' ? 1 - Math.max(0, st.t) / this.sim.cfg.unloadTime : 0;
      // trolley on the rail, the hook
      D.box.rbox(x, y, a, -0.05, -0.06, lv(H - 0.06), 0.05, 0.06, lv(H + 0.02), '#334155', pick);
      D.box.rbox(x, y, a, -0.012, -0.012, lv(H - 0.3), 0.012, 0.012, lv(H - 0.06), '#94a3b8', pick);
      // sway: the bag hangs back a little while it moves (+v is behind it)
      const sw = p.moving ? 0.05 : 0;
      if (it && it.sku.style.hang) {
        // a garment on a hanger
        D.box.rbox(x, y, a, -0.22, -0.01, lv(H - 0.36), 0.22, 0.01, lv(H - 0.3), '#e5e7eb', pick);
        D.rnd.rbox(x, y, a, -0.23, sw - 0.04, lv(H - 1.2), 0.23, sw + 0.04, lv(H - 0.36), it.sku.hex, pick);
        if (sel) D.lit.rbox(x, y, a, -0.25, -0.06, lv(H - 0.33), 0.25, 0.06, lv(H - 0.31), '#38bdf8');
        return;
      }
      // the pouch: a frame bar at the top, the bag below it, thicker with an item, its mouth held open at the loader
      const th = it ? 0.13 : 0.035, bot = H - 0.92 + drop * 0.25, frame = POUCH[p.state] || POUCH.EMPTY, w = th / 2 + open * 0.08;
      D.box.rbox(x, y, a, -0.21, -0.015 - open * 0.08, lv(H - 0.34), 0.21, 0.015 + open * 0.08, lv(H - 0.3), '#475569', pick);
      D.rnd.rbox(x, y, a, -0.2, sw - w, lv(bot), 0.2, sw + w, lv(H - 0.34), frame, pick);
      if (it) {
        // the item shows at the mouth; while the pocket empties it falls to the table
        const z = drop > 0 ? lv(H - 0.5 - drop * (H - 1.4)) : lv(H - 0.42);
        D.box.rbox(x, y, a, -0.15, -th * 0.4, z, 0.15, th * 0.4, z + lv(0.12), it.sku.hex, pick);
      }
      // the state colour on the hook, so the states read from afar
      D.lit.rbox(x, y, a, -0.04, -0.04, lv(H - 0.32), 0.04, 0.04, lv(H - 0.26), WS.TypeUI.pocket.pocketColor(p));
      if (sel) D.lit.rbox(x, y, a, -0.24, -0.1, lv(H - 0.3), 0.24, 0.1, lv(H - 0.28), '#38bdf8');
    }
    // the station whose loading or unloading position this pocket is at, while it works on it
    stationOf(p) { const st = this.sim.ports.find((q) => q.cur && q.cur.pocket === p); return st || null; }
    // the line of the sequencer being emptied lights up along its length
    sequencerLights() {
      const sim = this.sim, lv = (m) => this.lv(m), H = this.H;
      for (const [bt, lines, ph, col] of [[sim.batchA, sim.seqA, 'A2', '#c084fc'], [sim.batchB, sim.seqB, 'B2', '#4ade80']]) {
        if (!bt || bt.phase !== ph || bt.cur >= lines.length) continue;
        const b = lines[bt.cur], a = b.pts[0], c = b.pts[b.pts.length - 1];
        this.dy.lit.beam(a.x, a.y, lv(H + 0.2), c.x, c.y, lv(H + 0.2), 0.05, 0.03, col);
      }
    }
    // totes on the benches, items on the pack tables, parcels on their way to the dock
    stationsLive() {
      const sim = this.sim, D = this.dy, lv = (m) => this.lv(m);
      for (const p of sim.loaders) {
        const x = p.drop.x, y = p.drop.y;
        p.queue.filter((T) => T.arrive <= sim.time).slice(0, 2).forEach((T, k) => {
          const tx = x + 1.15, ty = y + 0.45 + k * 0.6, col = T.kind === 'returns' ? '#64748b' : '#2563eb';
          D.box.box(tx - 0.3, ty - 0.2, lv(0.9), tx + 0.3, ty + 0.2, lv(1.15), col);
          D.box.box(tx - 0.26, ty - 0.16, lv(1.13), tx + 0.26, ty + 0.16, lv(1.14), '#0f172a');
          T.items.slice(0, 6).forEach((it, j) => D.box.box(tx - 0.24 + (j % 3) * 0.16, ty - 0.14 + Math.floor(j / 3) * 0.14, lv(1.0), tx - 0.1 + (j % 3) * 0.16, ty - 0.02 + Math.floor(j / 3) * 0.14, lv(1.12), it.sku.hex));
        });
        // the item in the operator's hands
        if (p.cur) D.box.box(x - 0.12, y + 0.35, lv(1.15), x + 0.12, y + 0.5, lv(1.27), p.cur.item.sku.hex);
      }
      for (const p of sim.packers) {
        const x = p.drop.x, y = p.drop.y;
        p.table.forEach((it, k) => D.box.box(x - 0.6 + (k % 4) * 0.3, y - 0.3 + Math.floor(k / 4) * 0.3, lv(0.88), x - 0.36 + (k % 4) * 0.3, y - 0.08 + Math.floor(k / 4) * 0.3, lv(0.98), it.sku.hex));
        if (p.packing) { const f = 1 - p.packing.t / p.packing.total; D.box.box(x - 0.25, y + 0.05, lv(0.88), x + 0.25, y + 0.4, lv(0.88 + 0.22 * Math.min(1, f * 1.5)), '#b8875a'); }
      }
      // parcels ride the conveyor east to the dock door
      const cy = this.G.unloadY + 1.95;
      for (const pc of sim.parcels) {
        const x = pc.port.drop.x + (sim.time - pc.t) * 0.55;
        if (x > this.G.W - 0.3) continue;
        const s = 0.18 + Math.min(3, pc.size) * 0.06;
        D.box.box(x - s, cy - 0.17, lv(0.8), x + s, cy + 0.17, lv(0.8 + 0.12 + pc.size * 0.03), pc.size > 2 ? '#b8875a' : '#94a3b8');
      }
    }
    // operators at the stations, the returns desk, pickers in the shelving
    people() {
      const sim = this.sim, G = this.G, t = this.t;
      for (const p of sim.loaders) if (!p.away) this.operator(p.drop.x, p.drop.y + 0.75, 0, p.t > 0, p.role === 'returns' ? 'goodsIn' : 'station', 0, 'ld' + p.idx);
      for (const p of sim.ports.filter((q) => q.kind === 'PACK')) if (!p.away) this.operator(p.drop.x, p.drop.y + 0.95, 0, p.t > 0 || !!p.packing, 'pack', 0, 'pk' + p.idx);
      for (let k = 0; k < sim.cfg.inspectors; k++) this.operator(-1.5 + k * 1.8, G.yB + 3.3, 0, !!(sim.inspect && sim.inspect[k]), 'goodsIn', 0, 'in' + k);
      // pickers walk up and down the shelving aisles
      for (let k = 0; k < Math.min(6, sim.cfg.pickers); k++) {
        const r = k % 2, span = -5 - (G.X0 + 2), u = ((t * 0.25 + k * 0.37) % 2), f = u < 1 ? u : 2 - u;
        this.operator(G.X0 + 2 + f * span, G.yB + 6.6 + r * 2.2, f < 1 ? -Math.PI / 2 : Math.PI / 2, false, 'picker', 0, 'pi' + k);
      }
    }

    // ---------------------------------------------------------------- follow, ride, pick, labels
    // the pocket cam rides a loaded pocket round the loop
    followPos(id, alpha) { const p = this.sim.pocketList[id]; return p ? { x: lerp(p.px, p.x, alpha ?? 1), y: lerp(p.py, p.y, alpha ?? 1), z: this.lv((p.belt ? this.railZ(p.belt, p.s) : this.H) - 0.22) } : null; }
    pickRider(not) {
      const ps = this.sim.pocketList.filter((p) => p.id !== not && p.item && p.moving && p.belt && p.belt.kind === 'rail');
      const pool = ps.length ? ps : this.sim.pocketList.filter((p) => p.item);
      return pool.length ? pool[Math.floor(Math.random() * pool.length)].id : 0;
    }
    // above the rail, looking ahead along the pockets in front
    rideFront() { return 0.1; }
    rideHeight() { return this.lv(0.75); }
    techSpot() { return null; }
    pickFloor(f) {
      for (const p of this.sim.ports) if (Math.abs(f.x - p.drop.x) < 1.2 && Math.abs(f.y - p.drop.y - 0.5) < 1.1) return { kind: 'port', id: p.idx };
      return null;
    }
    selectionBox(s, alpha) {
      if (s.kind === 'port') { const p = this.sim.ports[s.id]; return [p.drop.x - 1, p.drop.y - 0.6, p.drop.x + 1, p.drop.y + 1.3]; }
      if (s.kind === 'pocket') { const q = this.followPos(s.id, alpha); return q && [q.x - 0.3, q.y - 0.3, q.x + 0.3, q.y + 0.3, 0.02]; }
      if (s.kind === 'lane') { const b = this.sim.net.belts[s.id], a = b.pts[0], c = b.pts[b.pts.length - 1]; return [Math.min(a.x, c.x) - 0.3, Math.min(a.y, c.y), Math.max(a.x, c.x) + 0.3, Math.max(a.y, c.y), 0.02]; }
      return null;
    }
    drawLabels() {
      const sim = this.sim, G = this.G, bg = 'rgba(15,23,42,0.82)', z = this.lv(this.H + 0.9), c = sim.cfg;
      for (const p of sim.ports) {
        const st = p.away ? 'BREAK' : p.kind === 'LOAD' ? (p.t > 0 ? 'LOADING' : 'WAITING') : p.packing ? 'PACKING' : p.t > 0 ? 'OPENING' : 'WAITING';
        this.label(`${p.code} · ${st}`, p.drop.x, p.drop.y + 0.4, this.lv(2.4), { size: 10, bg, color: p.kind === 'LOAD' ? '#7dd3fc' : '#86efac' });
      }
      this.label(`Returns stock · ${sim.pocketList.filter((p) => p.state === 'STOCK').length}`, G.sx(Math.max(0, c.stockLanes / 2 - 0.5)), G.yT - 0.6, z, { size: 10, bg, color: '#fcd34d' });
      this.label(`Storage · ${sim.stored()} pockets`, G.sx((c.stockLanes + c.storageLanes) / 2), G.yT - 0.6, z, { size: 10, bg, color: '#93c5fd' });
      const ph = (b, bank) => (!b ? 'free' : b.phase === bank + '1' ? `${b.id} filling` : b.phase === bank + '2' ? `${b.id} · line ${b.cur + 1}` : 'free');
      this.label(`Sequencer A · ${ph(sim.batchA, 'A')}`, G.ax((G.N - 1) / 2), G.yT - 0.6, z, { size: 10, bg, color: '#d8b4fe' });
      this.label(`Sequencer B · ${ph(sim.batchB && sim.batchB !== sim.batchA ? sim.batchB : null, 'B')}`, G.bx((G.N - 1) / 2), G.yT - 0.6, z, { size: 10, bg, color: '#86efac' });
      this.label(`Empty pockets · ${sim.buffer.totes.length}`, G.bufX0 + 3.6, 5, z, { size: 10, bg, color: '#cbd5e1' });
      this.label('Returns desk', -0.6, G.yB + 1.8, this.lv(1.8), { size: 10, bg, color: '#fcd34d' });
      this.label('Shelving', G.X0 + 4, G.yB + 5, this.lv(2.8), { size: 10, bg, color: '#e2e8f0' });
    }

    // ---------------------------------------------------------------- follow an order
    pickFollow(not) {
      const os = this.sim.orders.filter((o) => o !== not && o.status === 'OPEN' && o.items.length > 1 && o.items.every((it) => !it.pocket));
      const pool = os.length ? os : this.sim.orders.filter((o) => o !== not && o.status === 'OPEN');
      return pool.length ? { order: pool[pool.length - 1 - Math.floor(Math.random() * Math.min(5, pool.length))] } : null;
    }
    orderFocus(o) {
      const sim = this.sim, lv = (m) => this.lv(m), H = this.H, n = o.items.length;
      const pos = (p) => ({ x: p.x, y: p.y, z: lv(H - 0.6) }), inP = o.items.filter((it) => it.pocket);
      if (o.status === 'SHIPPED' || o.status === 'PACKING') {
        const p = o.batch.port;
        return { x: p.drop.x, y: p.drop.y, z: lv(1), step: 4, done: o.status === 'SHIPPED', text: o.status === 'SHIPPED' ? `Packed at ${p.name}, ${WS.U.fmtDur(o.shipped - o.created)} after it came in` : `${p.name}: all ${n} items on the table, the packer packs it` };
      }
      if (o.status === 'BATCHED') {
        const left = o.items.find((it) => it.pocket), b = o.batch;
        if (!left) return { x: b.port.drop.x, y: b.port.drop.y, z: lv(1), step: 4, text: `${b.port.name}: its pockets open over the table` };
        const where = { lane: 'leaving its storage rail', seqA: 'in sequencer bank A (pass 1)', seqB: 'in sequencer bank B (pass 2)', spur: 'queued over ' + b.port.name, rail: 'on the loop' }[left.pocket.belt && left.pocket.belt.kind] || 'on its way';
        return Object.assign(pos(left.pocket), { step: 3, text: `Batch ${b.id}, places ${left.pocket.seq + 1}…: ${where}` });
      }
      if (o.status === 'READY') return Object.assign(pos(o.items[0].pocket), { step: 2, text: `All ${n} items in storage, waiting for a batch` });
      if (inP.length) {
        const p = inP[inP.length - 1].pocket, ret = o.items.filter((it) => it.fromStock).length;
        return Object.assign(pos(p), { step: inP.length < n ? 1 : 2, text: `${inP.length} of ${n} items in pockets${ret ? ` (${ret} a return that waited in a pocket)` : ''}; ${inP.length < n ? 'the rest are being picked' : 'the last on its way into storage'}` });
      }
      const st = sim.loaders.find((p) => p.queue.some((T) => T.items.some((it) => it.order === o)));
      if (st) return { x: st.drop.x, y: st.drop.y + 0.5, z: lv(1.2), step: 0, text: `Picked; in a tote at ${st.name}, waiting to go into a pocket` };
      return { x: this.G.X0 + 4, y: this.G.yB + 7, z: lv(1.2), step: 0, text: `Being picked from the shelving (${n} item${n > 1 ? 's' : ''})` };
    }
    hudHTML() {
      const o = this.follow.order, f = this.followNow || { step: 0, text: '' }, esc = WS.U.esc;
      const chips = STEPS.map((s, k) => `<span class="${k < f.step || f.done ? 'done' : k === f.step ? 'now' : ''}">${s}</span>`).join('<i></i>');
      return `<div class="fh-top"><b>${o.id}</b><button data-fh="next" title="Follow another (N)">Next</button><button data-fh="stop" title="Stop following">×</button></div>
        <div class="fh-meta">${esc(o.customer)} · ${esc(o.city)} · ${o.items.map((it) => esc(it.sku.name)).join(', ')}</div><div class="fh-steps">${chips}</div><div class="fh-text">${esc(f.text)}</div>`;
    }
  }

  WS.PocketRenderer3D = PocketRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
