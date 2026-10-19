/* StackPilot in the free 3D view (WS.Rack3D): the shelving on a painted robot
 * floor (cross aisles, queue lanes, handover points, parking and chargers),
 * aisle locks, the stations' conveyors, and the robots: a drive unit,
 * a mast with the back shelves holding the totes it carries, and the orange
 * handler whose forks reach into the racks. */
(function (WS) {
  'use strict';
  const C = WS.CELL, BODY = 0.55, BLUE = '#2563eb', ORANGE = '#f97316';

  class AcrRenderer3D extends WS.Rack3D {
    buildKey() { return super.buildKey() + '|' + this.sim.cfg.aisleMode; }
    rackPick(a, s, l, b) { return { kind: 'cell', id: this.sim.grid.idx(a * 3 + s * 2, this.Y0 + b) }; }
    followPos(id, alpha) { return WS.View3D.prototype.followPos.call(this, id, alpha); }
    // the robot's frame and the path of a tote it moves, as in the isometric view
    robotFrame(r, x) { return WS.AcrRenderer.prototype.robotFrame.call(this, r, x); }
    xferTote(r, x, y, xf) { return WS.AcrRenderer.prototype.xferTote.call(this, r, x, y, xf); }

    buildStatic() {
      super.buildStatic();
      const sim = this.sim, g = sim.grid, S = this.st, ps = sim.ports;
      this.buildFloor();
      // fence behind the robot area, charger posts beside the parking column
      S.glass.box(0, -0.03, 0, g.W, 0, 7.4, '#94a3b8');
      for (let x = 0; x <= g.W; x += 2) S.box.box(x - 0.04, -0.06, 0, x + 0.04, 0.02, 7.4, '#64748b');
      S.box.box(0, -0.06, 7.3, g.W, 0.02, 7.45, '#94a3b8');
      for (const ch of g.chargers) S.box.box(ch.x + 0.82, ch.y + 0.3, 0, ch.x + 0.98, ch.y + 0.7, 1.8, '#334155');
      // at each station: the infeed from in front of the handover point, the return conveyor ending beside it
      for (const p of ps) {
        const a = sim.infeedStart(p), b = sim.backEnd(p);
        this.beltLine(S, [{ x: a.x, y: a.y - 0.3 }, { x: a.x, y: g.D }], 0.62, g.convZ);
        this.beltLine(S, [{ x: b.x, y: g.D }, { x: b.x, y: b.y - 0.3 }], 0.62, g.convZ);
      }
    }
    // The floor paint as one texture.
    buildFloor() {
      const sim = this.sim, g = sim.grid, PX = 32, T = WS.View3D.THREE;
      if (!this.floorCv) {
        this.floorCv = document.createElement('canvas');
        this.floorTex = new T.CanvasTexture(this.floorCv); this.floorTex.colorSpace = T.SRGBColorSpace; this.floorTex.anisotropy = 8;
        const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ map: this.floorTex, roughness: 0.9 }));
        m.rotation.x = -Math.PI / 2; m.receiveShadow = true; this.scene.add(m); this.floorMesh = m;
      }
      const H = g.laneY + 1;
      this.floorMesh.scale.set(g.W, H, 1); this.floorMesh.position.set(g.W / 2, 0.002, H / 2);
      this.floorCv.width = g.W * PX; this.floorCv.height = H * PX;
      this.paintFloor(); this.heatAt = performance.now();
    }
    paintFloor() {
      const sim = this.sim, g = sim.grid, PX = 32, c = this.floorCv.getContext('2d'), H = g.laneY + 1;
      c.fillStyle = '#1f2a3a'; c.fillRect(0, 0, g.W * PX, H * PX);
      const rect = (x, y, i, fill) => { c.fillStyle = fill; c.fillRect(x * PX + i, y * PX + i, PX - 2 * i, PX - 2 * i); };
      const chevron = (x, y, dx, dy, col) => {
        const mx = (x + 0.5) * PX, my = (y + 0.5) * PX, k = PX * 0.2;
        c.strokeStyle = col; c.lineWidth = 3; c.beginPath();
        c.moveTo(mx - k * dx - k * dy, my - k * dy + k * dx); c.lineTo(mx + k * 0.5 * dx, my + k * 0.5 * dy); c.lineTo(mx - k * dx + k * dy, my - k * dy - k * dx); c.stroke();
      };
      for (let y = 0; y < H; y++) for (let x = 0; x < g.W; x++) {
        const i = g.idx(x, y), t = g.type[i];
        if (t === C.HIGHWAY) { rect(x, y, 1, '#243246'); rect(x, y, PX * 0.45, '#64748b'); } else if (t === C.AISLE) { c.fillStyle = '#18222f'; c.fillRect(x * PX + 2, y * PX, PX - 4, PX); } else if (t === C.PARK) { rect(x, y, 3, '#13261d'); c.strokeStyle = 'rgba(74,222,128,0.35)'; c.lineWidth = 1.5; c.strokeRect(x * PX + 3, y * PX + 3, PX - 6, PX - 6); } else if (t === C.CHARGER) { rect(x, y, 2, '#14532d'); c.strokeStyle = '#4ade80'; c.lineWidth = 1.5; c.strokeRect(x * PX + 6, y * PX + 6, PX - 12, PX - 12); } else if (t === C.LANE) {
          rect(x, y, 1, '#2a2614');
          const d = sim.ports[g.laneOf[i]].docks[g.dockOf[i]], nx = d.cells[g.laneIdx[i] + 1];
          chevron(x, y, nx.x - x, nx.y - y, 'rgba(250,204,21,0.6)');
        } else if (t === C.PORT) { rect(x, y, 1, '#3a2f12'); c.strokeStyle = '#facc15'; c.lineWidth = 2; c.strokeRect(x * PX + 2, y * PX + 2, PX - 4, PX - 4); } else if (t === C.BLOCKED) rect(x, y, 0, '#141b27');
        if (this.opts.heat) {
          const v = Math.max(Math.min(1, g.waitHeat[i] / 40), Math.min(1, g.passHeat[i] / 60) * 0.6);
          if (v > 0.04) rect(x, y, 0, `rgba(239,68,68,${(v * 0.7).toFixed(2)})`);
        }
      }
      // one-way aisles: arrows along each aisle
      if (sim.cfg.aisleMode === 'oneway') for (const aisle of sim.aisles) for (let b = 2; b < g.B; b += 4) chevron(aisle.a * 3 + 1, g.Y0 + b, 0, aisle.dir, 'rgba(250,204,21,0.5)');
      c.strokeStyle = 'rgba(202,138,4,0.6)'; c.lineWidth = 2; c.beginPath();
      for (const y of [g.Y0, g.frontY]) { c.moveTo(0, y * PX); c.lineTo(g.A * 3 * PX, y * PX); }
      c.moveTo(0, g.laneY * PX); c.lineTo(g.W * PX, g.laneY * PX); c.stroke();
      this.floorTex.needsUpdate = true;
    }

    drawMachines(alpha) {
      const sim = this.sim, g = sim.grid, D = this.dy;
      if (this.opts.heat && performance.now() - this.heatAt > 1000) { this.paintFloor(); this.heatAt = performance.now(); }
      // aisles held by a trip, in the colour of the robot holding them
      if (sim.cfg.aisleMode === 'lock') for (const aisle of sim.aisles) if (aisle.lock >= 0) D.clear.box(aisle.a * 3 + 1.1, g.Y0, 0.01, aisle.a * 3 + 1.9, g.frontY, 0.04, WS.stateColor(sim, sim.fleet[aisle.lock].displayState));
      for (const ch of g.chargers) { const on = ch.robot >= 0 && sim.fleet[ch.robot].state === 'CHARGING'; (on ? D.lit : D.box).box(ch.x + 0.8, ch.y + 0.35, 1.2, ch.x + 0.82, ch.y + 0.65, 1.6, on ? '#4ade80' : '#166534'); }
      for (const r of sim.fleet) this.drawRobot(r, r.prx + (r.rx - r.prx) * alpha, r.pry + (r.ry - r.pry) * alpha);
    }

    // Drive unit with bumper, blue band and state light; mast with the back
    // shelves and their totes behind, a blue top beam with a beacon; in front
    // the orange handler at its height, forks reaching into a rack while it
    // works. The tote it moves follows WS.AcrRenderer.xferTote.
    drawRobot(r, x, y) {
      const sim = this.sim, D = this.dy, N = sim.cfg.robotSlots, col = WS.led(this, r, sim), pick = { kind: 'robot', id: r.id };
      const F = this.robotFrame(r, x), cx = x + 0.5, cy = y + 0.5, H = F.H, x0 = cx - 0.3, x1 = cx + 0.3, y0 = cy - 0.42, y1 = cy + 0.02;
      D.rnd.box(cx - 0.42, cy - 0.42, 0.02, cx + 0.42, cy + 0.42, 0.14, '#1e293b', pick);
      for (const s of [-1, 1]) D.cyl.cylX(cx + s * 0.425 - 0.035, cx + s * 0.425 + 0.035, cy, 0.24, 0.1, '#0b0f17');
      D.rnd.box(cx - 0.41, cy - 0.41, 0.14, cx + 0.41, cy + 0.41, BODY, '#e2e8f0', pick);
      D.rnd.box(cx - 0.415, cy - 0.415, 0.22, cx + 0.415, cy + 0.415, 0.3, BLUE, pick);
      D.lit.box(cx - 0.14, cy + 0.415, 0.36, cx + 0.14, cy + 0.42, 0.44, col);
      for (const [px, py] of [[x0, y0], [x1 - 0.07, y0], [x0, y1 - 0.07], [x1 - 0.07, y1 - 0.07]]) D.box.box(px, py, BODY, px + 0.07, py + 0.07, H, '#e2e8f0', pick);
      const shelfZ = F.shelfZ, xf = this.xfer(r);
      for (let k = 0; k < N; k++) {
        D.box.box(x0, y0, shelfZ(k) - 0.04, x1, y1, shelfZ(k), '#94a3b8', pick);
        const id = r.load[k];
        if (id && !(xf && xf.id === id)) this.box3(D.box, x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, shelfZ(k), this.binColor(id), pick);
      }
      D.box.box(x0, y0, H, x1, y1, H + 0.2, BLUE, pick);
      D.litCyl.cyl(cx, cy, H + 0.2, H + 0.45, 0.06, col);
      // handler and forks in front of the shelves, and the tote it is moving
      const e = xf ? xf.reach * 0.75 : 0;
      D.box.box(cx - 0.36, cy + 0.02, r.mast - 0.08, cx + 0.36, cy + 0.42, r.mast + 0.06, ORANGE, pick);
      if (xf && xf.u != null) { const q = this.xferTote(r, x, y, xf); this.box3(D.box, q.x - q.w, q.y - q.d, q.x + q.w, q.y + q.d, q.z, this.binColor(xf.id)); }
      if (xf && xf.side === 2) for (const fx of [cx - 0.24, cx + 0.18]) D.box.box(fx, cy + 0.02, r.mast + 0.06, fx + 0.06, cy + 0.42 + e, r.mast + 0.11, '#cbd5e1', pick);
      else for (const fy of [cy + 0.06, cy + 0.32]) {
        const fx0 = xf && xf.side === 0 ? cx - 0.36 - e : cx - 0.3, fx1 = xf && xf.side === 1 ? cx + 0.36 + e : cx + 0.3;
        D.box.box(fx0, fy, r.mast + 0.06, fx1, fy + 0.06, r.mast + 0.11, '#cbd5e1', pick);
      }
    }

    pickFloor(f) {
      const g = this.sim.grid, x = Math.floor(f.x), y = Math.floor(f.y);
      if (g.inside(x, y) && y < g.laneY + 1) {
        const i = g.idx(x, y), t = g.type[i], port = this.sim.ports.find((p) => p.cells.some((c) => g.idx(c.x, c.y) === i));
        if (port) return { kind: 'port', id: port.idx };
        if (t === C.STORAGE) return super.pickFloor(f);
        if (t !== C.BLOCKED) return { kind: 'cell', id: i };
      }
      return super.pickFloor(f);
    }
    selectionBox(s, alpha) {
      const g = this.sim.grid;
      if (s.kind === 'cell') { const x = g.cx(s.id), y = g.cy(s.id); return [x, y, x + 1, y + 1, g.type[s.id] === C.STORAGE ? g.Z : 0.02]; }
      if (s.kind === 'port') { const p = this.sim.ports[s.id], xs = p.cells.map((c) => c.x), ys = p.cells.map((c) => c.y); return [Math.min(...xs), Math.min(...ys), Math.max(...xs) + 1, Math.max(...ys) + 1]; }
      return super.selectionBox(s, alpha);
    }
    drawLabels() {
      super.drawLabels();
      const H = this.sim.grid.Z + 0.5;
      for (const r of this.sim.fleet) this.label(r.name, r.rx + 0.5, r.ry + 0.5, H + 1.2, { size: 9, color: '#0f172a', weight: 800, bg: 'rgba(241,245,249,0.85)' });
    }
  }

  WS.AcrRenderer3D = AcrRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
