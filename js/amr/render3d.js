/* AisleMate in the free 3D view (WS.View3D): the painted floor, shelving
 * with its stock (one batch, rebuilt when stock changes), the robots with
 * their tote decks and tablets, the pickers, chargers and the stations. */
(function (WS) {
  'use strict';
  const C = WS.CELL;
  const TOP = 5.2, LEVELS = [0.3, 1.5, 2.7, 3.9], BODY = 0.75, DECKS = [0.95, 2.05], MAST = 3.9; // as in the isometric view
  const STEEL = '#1d4ed8', BEAM = '#f97316';

  class AmrRenderer3D extends WS.View3D {
    buildKey() { return super.buildKey() + '|' + this.sim.inv.bins.length; }
    buildStatic() {
      super.buildStatic();
      const sim = this.sim, g = sim.grid, S = this.st;
      this.buildFloor();
      // shelving frames: uprights, decks and the orange beams along the aisle
      for (let i = 0; i < g.binAt.length; i++) {
        if (!g.binAt[i]) continue;
        const x = g.cx(i), y = g.cy(i), pick = { kind: 'cell', id: i }, fx = g.sideOf(x) ? x + 0.03 : x + 0.92;
        for (const [px, py] of [[x + 0.03, y + 0.02], [x + 0.9, y + 0.02], [x + 0.03, y + 0.91], [x + 0.9, y + 0.91]]) S.box.box(px, py, 0, px + 0.07, py + 0.07, TOP, STEEL, pick);
        for (const z of [...LEVELS, TOP]) {
          S.box.box(x + 0.03, y + 0.02, z - 0.1, x + 0.97, y + 0.98, z, '#94a3b8', pick);
          S.box.box(fx, y + 0.02, z - 0.12, fx + 0.05, y + 0.98, z, BEAM, pick);
        }
      }
      // back wall with the chargers
      S.box.box(0, -0.12, 0, g.W - 1, 0, 3.0, '#1e293b');
      for (const ch of g.chargers) S.box.box(ch.x + 0.3, 0.02, 0, ch.x + 0.7, 0.18, 1.8, '#334155');
      if (!this.stock) this.stock = this.newBatch('box', 'std', 4096);
      this.stockKey = null;
    }
    extraBatches() { return [this.stock]; }

    // The floor paint as one texture: aisles, shelf footprints, lanes with
    // chevrons, stations, chargers, parking places and the traffic heat.
    buildFloor() {
      const g = this.sim.grid, PX = 32, T = WS.View3D.THREE;
      if (!this.floorCv) {
        this.floorCv = document.createElement('canvas');
        this.floorTex = new T.CanvasTexture(this.floorCv);
        this.floorTex.colorSpace = T.SRGBColorSpace; this.floorTex.anisotropy = 8;
        const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ map: this.floorTex, roughness: 0.9 }));
        m.rotation.x = -Math.PI / 2; m.receiveShadow = true; this.scene.add(m); this.floorMesh = m;
      }
      this.floorMesh.scale.set(g.W, g.D, 1); this.floorMesh.position.set(g.W / 2, 0.002, g.D / 2);
      this.floorCv.width = g.W * PX; this.floorCv.height = g.D * PX;
      this.paintFloor(); this.heatAt = performance.now();
    }
    paintFloor() {
      const sim = this.sim, g = sim.grid, PX = 32, c = this.floorCv.getContext('2d');
      c.fillStyle = '#232d3d'; c.fillRect(0, 0, g.W * PX, g.D * PX);
      const rect = (x, y, i, fill) => { c.fillStyle = fill; c.fillRect(x * PX + i, y * PX + i, PX - 2 * i, PX - 2 * i); };
      for (let y = 0; y < g.D; y++) for (let x = 0; x < g.W; x++) {
        const i = g.idx(x, y), t = g.type[i];
        if (t === C.STORAGE) rect(x, y, 0, '#1a2230');
        else if (t === C.BLOCKED) rect(x, y, 0, '#141b27');
        else if (t === C.LANE) {
          rect(x, y, 1, '#2a2614');
          const d = sim.ports[g.laneOf[i]].docks[g.dockOf[i]], nx = d.cells[g.laneIdx[i] + 1], dx = nx.x - x, dy = nx.y - y, mx = (x + 0.5) * PX, my = (y + 0.5) * PX, k = PX * 0.2;
          c.strokeStyle = 'rgba(250,204,21,0.6)'; c.lineWidth = 3; c.beginPath();
          c.moveTo(mx - k * dx - k * dy, my - k * dy + k * dx); c.lineTo(mx + k * 0.5 * dx, my + k * 0.5 * dy); c.lineTo(mx - k * dx + k * dy, my - k * dy - k * dx); c.stroke();
        } else if (t === C.PORT) { rect(x, y, 1, '#3a2f12'); c.strokeStyle = '#facc15'; c.lineWidth = 2; c.strokeRect(x * PX + 2, y * PX + 2, PX - 4, PX - 4); } else if (t === C.CHARGER) { rect(x, y, 2, '#14532d'); c.strokeStyle = '#4ade80'; c.lineWidth = 1.5; c.strokeRect(x * PX + 6, y * PX + 6, PX - 12, PX - 12); } else if (t === C.PARK) { c.strokeStyle = 'rgba(148,163,184,0.45)'; c.lineWidth = 1.5; c.strokeRect(x * PX + 4, y * PX + 4, PX - 8, PX - 8); }
        if (this.opts.heat && t === C.HIGHWAY) {
          const v = Math.max(Math.min(1, g.waitHeat[i] / 40), Math.min(1, g.passHeat[i] / 60) * 0.6);
          if (v > 0.04) rect(x, y, 0, `rgba(239,68,68,${(v * 0.7).toFixed(2)})`);
        }
      }
      // walkway paint along the aisles' edges
      c.strokeStyle = 'rgba(202,138,4,0.6)'; c.lineWidth = 2; c.beginPath();
      for (let a = 0; a < g.A; a++) for (const x of [4 * a + 1, 4 * a + 3]) { c.moveTo(x * PX, g.Y0 * PX); c.lineTo(x * PX, (g.Y0 + g.B) * PX); }
      c.stroke();
      this.floorTex.needsUpdate = true;
    }

    // ---------------------------------------------------------------- stock
    // Goods on the shelves: a box per stocked compartment, as high as it is full.
    buildStock() {
      const sim = this.sim, g = sim.grid, inv = sim.inv, B = this.stock, slots = sim.cfg.shelfSlots;
      B.begin();
      for (let i = 0; i < g.binAt.length; i++) {
        const id = g.binAt[i];
        if (!id) continue;
        const b = inv.binById.get(id), x = g.cx(i), y = g.cy(i), pick = { kind: 'cell', id: i };
        LEVELS.forEach((z0, j) => {
          for (let s = 0; s < slots; s++) {
            const c = b.comps[j * slots + s];
            if (!c || !c.gtin || c.qty <= 0) continue;
            const p = inv.byGtin.get(c.gtin), fill = Math.min(1, c.qty / inv.compCap(b, p)), y0 = y + 0.06 + (0.88 * s) / slots, y1 = y + 0.06 + (0.88 * (s + 1)) / slots - 0.04;
            B.box(x + 0.14, y0, z0, x + 0.86, y1, z0 + 0.25 + 0.7 * fill, this.opts.heat ? WS.CLASS_COLORS[p.cls] : `hsl(${(parseInt(c.gtin.slice(7, 12), 10) * 47) % 360},45%,55%)`, pick);
          }
        });
        if (b.requests.length) B.box(x + 0.1, y + 0.1, TOP, x + 0.9, y + 0.9, TOP + 0.02, '#fde68a', pick);
      }
      B.end();
    }

    // ---------------------------------------------------------------- frame
    drawLive(alpha) {
      const sim = this.sim, g = sim.grid, D = this.dy;
      if (this.opts.heat && performance.now() - this.heatAt > 1000) { this.paintFloor(); this.heatAt = performance.now(); }
      const key = g.version + '|' + this.opts.heat;
      if (key !== this.stockKey) { this.stockKey = key; this.buildStock(); }
      for (const r of sim.fleet) this.drawRobot(r, r.prx + (r.rx - r.prx) * alpha + 0.5, r.pry + (r.ry - r.pry) * alpha + 0.5, { kind: 'robot', id: r.id });
      for (const pk of sim.pickers) {
        if (pk.state === 'BREAK') continue; // on a break, off the floor
        const x = pk.px + (pk.x - pk.px) * alpha, y = pk.py + (pk.y - pk.py) * alpha, h = pk.heading;
        this.operator(x, y, Math.atan2(-Math.cos(h), -Math.sin(h)), pk.state === 'PICKING', 'picker', 0, 'picker ' + pk.name);
      }
      // pick-to-light: the location being worked lights up along its beam
      if (Math.sin(this.t * 8) > -0.4) for (const st of sim.stops) {
        if (!st.picking || st.done) continue;
        const b = st.bin, fx = g.sideOf(b.x) ? b.x - 0.01 : b.x + 0.96;
        for (const l of st.lines) { const z = LEVELS[Math.floor(l.comp / sim.cfg.shelfSlots)]; D.lit.box(fx, b.y + 0.1, z - 0.1, fx + 0.05, b.y + 0.9, z - 0.04, '#4ade80'); }
      }
      for (const ch of g.chargers) {
        const on = ch.robot >= 0 && sim.fleet[ch.robot].state === 'CHARGING';
        (on ? D.lit : D.box).box(ch.x + 0.35, 0.17, 1.2, ch.x + 0.65, 0.19, 1.6, on ? '#4ade80' : '#166534');
      }
    }
    // Robot: white base with a light band, a two-deck tote rack, a mast at
    // the back carrying the tablet, lit while the robot waits for a picker.
    drawRobot(r, x, y, pick) {
      const sim = this.sim, oms = sim.oms, D = this.dy, col = WS.led(this, r, sim), h = 0.36;
      D.rnd.box(x - h - 0.01, y - h - 0.01, 0.02, x + h + 0.01, y + h + 0.01, 0.2, '#1f2937', pick);
      for (const s of [-1, 1]) D.cyl.cylX(x + s * (h + 0.005) - 0.035, x + s * (h + 0.005) + 0.035, y, 0.24, 0.1, '#0b0f17');
      D.rnd.box(x - h, y - h, 0.2, x + h, y + h, 0.42, '#e2e8f0', pick);
      D.litRnd.box(x - h - 0.005, y - h - 0.005, 0.42, x + h + 0.005, y + h + 0.005, 0.52, col);
      D.rnd.box(x - h, y - h, 0.52, x + h, y + h, BODY, '#e2e8f0', pick);
      for (const [px, py] of [[x - 0.31, y - 0.31], [x + 0.27, y - 0.31], [x - 0.31, y + 0.27], [x + 0.27, y + 0.27]]) D.box.box(px, py, BODY, px + 0.04, py + 0.04, 3.0, '#64748b', pick);
      DECKS.forEach((dz, k) => {
        D.box.box(x - 0.32, y - 0.32, dz - 0.06, x + 0.32, y + 0.32, dz, '#334155', pick);
        for (let s = 0; s < 2; s++) {
          const n = k * 2 + s, tx = x - 0.16 + s * 0.32;
          if (r.totes[n]) { const o = r.totes[n]; this.orderTote(D.box, tx, y, dz, o.lines.reduce((a, l) => a + l.picked, 0) / oms.units(o), 0.66); } else if (n < r.cases) this.parcel(D.box, tx - 0.13, y - 0.16, tx + 0.13, y + 0.16, dz, 0.5, true);
        }
      });
      D.box.box(x - 0.03, y - 0.33, BODY, x + 0.03, y - 0.27, MAST, '#475569', pick);
      D.box.box(x - 0.2, y - 0.33, MAST, x + 0.2, y - 0.27, MAST + 0.75, '#0f172a', pick);
      D.lit.box(x - 0.17, y - 0.27, MAST + 0.08, x + 0.17, y - 0.265, MAST + 0.68, '#0b1220');
      this.screen('tab' + r.id, x - 0.165, x + 0.165, y - 0.262, MAST + 0.1, MAST + 0.66, this.tabletScreen(r));
    }

    // ---------------------------------------------------------------- stations
    // the operator's screen on a post with the stack light on top
    tabletScreen(r) { return WS.AmrRenderer.prototype.tabletScreen.call(this, r); }
    compName(bin, comp) { return WS.AmrRenderer.prototype.compName.call(this, bin, comp); }
    stationPosts(p) {
      const g = this.sim.grid, front = p.face === 'front';
      const sx = front ? p.drop.x - 0.15 : g.W + 0.3, sy = front ? g.D + 0.3 : p.drop.y - 0.15;
      return { sx, sy, lx: sx + 0.18, ly: sy - 0.01 }; // the stack light sits on top of the screen
    }
    portBody(S, p) {
      const { sx, sy, lx, ly } = this.stationPosts(p), pick = { kind: 'port', id: p.idx };
      S.box.box(sx - 0.03, sy - 0.03, 0, sx + 0.03, sy + 0.03, 3.4, '#475569');
      S.box.box(sx - 0.28, sy - 0.06, 3.3, sx + 0.28, sy + 0.04, 4.6, '#0f172a', pick);
      S.box.box(lx - 0.03, ly - 0.03, 4.6, lx + 0.03, ly + 0.03, 4.75, '#64748b');
    }
    portLive(p) {
      const D = this.dy, { sx, sy, lx, ly } = this.stationPosts(p);
      D.lit.box(sx - 0.24, sy + 0.04, 3.4, sx + 0.24, sy + 0.05, 4.5, '#0b1220');
      this.screen('port' + p.idx, sx - 0.235, sx + 0.235, sy + 0.053, 3.42, 4.48, WS.AmrRenderer.prototype.amrStationScreen.call(this, p));
      const starving = !p.serving && p.recentStarve > 0.35;
      [['#ef4444', !!p.away], ['#f59e0b', starving && !p.away], ['#22c55e', !!p.serving && !p.away]].forEach(([c, on], k) => {
        const z = 4.75 + k * 0.42;
        (on ? D.litCyl : D.cyl).cyl(lx, ly, z, z + 0.4, 0.09, on ? c : WS.shade(c, -0.65));
      });
    }

    // ---------------------------------------------------------------- picking and selection
    pickFloor(f) {
      const sim = this.sim, g = sim.grid, x = Math.floor(f.x), y = Math.floor(f.y);
      if (g.inside(x, y)) {
        const i = g.idx(x, y), port = sim.ports.find((p) => p.cells.some((c) => g.idx(c.x, c.y) === i));
        return port ? { kind: 'port', id: port.idx } : { kind: 'cell', id: i };
      }
      return super.pickFloor(f);
    }
    selectionBox(s, alpha) {
      const g = this.sim.grid;
      if (s.kind === 'cell') { const x = g.cx(s.id), y = g.cy(s.id); return [x, y, x + 1, y + 1, g.binAt[s.id] ? TOP + 0.05 : 0.02]; }
      if (s.kind === 'port') { const p = this.sim.ports[s.id], d = p.drop; return [d.x, d.y, d.x + 1, d.y + 1]; }
      return super.selectionBox(s, alpha);
    }
    drawLabels() {
      const sim = this.sim, g = sim.grid, L = sim.layout, bg = 'rgba(15,23,42,0.82)';
      for (const p of sim.ports) {
        const pos = p.face === 'front' ? { x: p.drop.x + 1, y: g.D + 0.2 } : { x: g.W + 0.2, y: p.drop.y + 1 };
        const st = p.serving ? 'SERVING ' + p.serving.name : p.kind === 'PICK' ? `${p.slots.filter(Boolean).length} STAGED` : 'WAITING';
        this.label(`${p.code} ${p.kind === 'PICK' ? 'INDUCT' : 'GOODS-IN'} · ${st}`, pos.x, pos.y, 7.2, { size: 10, bg, color: p.kind === 'PICK' ? '#fdba74' : '#86efac' });
      }
      for (let a = 0; a < g.A; a++) this.label(`AISLE ${a + 1}`, 4 * a + 2, g.Y0 + g.B + 0.3, TOP + 1.6, { size: 10, bg, color: '#fde68a' });
      for (const pk of sim.oms.packers) { const q = L.packerPos(pk.idx); this.label(`${pk.name} · ${pk.queue.length} queued`, q.x, q.y, 5, { size: 10, bg, color: '#7dd3fc' }); }
      const d = L.dock(), tr = sim.oms.truck;
      this.label(`${tr.carrier.name} · ${tr.parcels.length}/${sim.cfg.truckCapacity}`, d.x + 2.5, d.y, 8.2, { size: 10, bg, color: '#e2e8f0' });
      if (this.cam.dist > 22 && !this.cam.walk) return; // names only up close
      for (const r of sim.fleet) this.label(r.name, r.rx + 0.5, r.ry + 0.5, MAST + 1.2, { size: 9, color: '#0f172a', weight: 800, bg: 'rgba(204,251,241,0.9)' });
      for (const pk of sim.pickers) this.label(pk.name, pk.x, pk.y, 4.0, { size: 9, color: '#1a2e05', weight: 800, bg: 'rgba(217,249,157,0.9)' });
    }
  }

  WS.AmrRenderer3D = AmrRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
