/* Racking in the free 3D view, shared by RailRunner, SkyStack and StackPilot:
 * steel uprights and beams, every stored tote (one batch, rebuilt when a
 * tote moves), the totes machines are handing over (WS.RackRenderer's
 * transfer timing) and the Levels cut-away. WS.PreZone3D adds the pre-zone
 * loop in front of the aisles (RailRunner, SkyStack). */
(function (WS) {
  'use strict';
  const TOTE_H = WS.RACK_TOTE_H, R = WS.RackRenderer.prototype;

  class Rack3D extends WS.View3D {
    // transfer timing, moving totes, cut-away and colours as in the isometric view
    xfer(m) { return R.xfer.call(this, m); }
    movingTotes() { return R.movingTotes.call(this); }
    sideX(a, side) { return R.sideX.call(this, a, side); }
    levelShown(l) { return R.levelShown.call(this, l); }
    reqKey() { return R.reqKey.call(this); }
    // stored totes a little lighter than in the isometric view, so they read against the steel
    toteColor(b) { const c = R.toteColor.call(this, b); return c === '#4a5a70' ? '#7d8ca3' : c; }
    get Y0() { return this.sim.grid.Y0 || 0; }
    extraBatches() { return [this.totes]; }
    buildKey() { return [super.buildKey(), this.opts.cutTop, this.opts.cutOnly].join('|'); }

    // top of the racking drawn under the cut-away
    rackTop() { const g = this.sim.grid, t = this.opts.cutTop; return t == null ? g.Z : g.levelZ(t) + g.LH; }
    buildStatic() {
      super.buildStatic();
      const g = this.sim.grid, S = this.st, Y0 = this.Y0, B = Y0 + g.B, Z = this.rackTop();
      if (!this.totes) this.totes = this.newBatch('box', 'std', 4096);
      this.toteKey = null;
      for (const aisle of this.sim.aisles) for (const s of [0, 1]) {
        const x0 = aisle.a * 3 + s * 2, x1 = x0 + 1;
        // uprights every two bays on both faces, a beam pair under every shown level
        for (let y = Y0; y <= B; y += 2) for (const x of [x0, x1]) S.box.box(x - 0.03 + (x === x0 ? 0.03 : -0.03), y - 0.03, 0, x + 0.03 + (x === x0 ? 0.03 : -0.03), y + 0.03, Z, '#33507d');
        for (let l = 0; l < g.L; l++) {
          if (!this.levelShown(l)) continue;
          const z = g.levelZ(l);
          for (const x of [x0 + 0.02, x1 - 0.05]) S.box.box(x, Y0, z - 0.08, x + 0.03, B, z + 0.04, '#64748b');
        }
        S.box.box(x0, Y0, Z, x0 + 0.06, B, Z + 0.12, '#33507d'); S.box.box(x1 - 0.06, Y0, Z, x1, B, Z + 0.12, '#33507d');
        for (let y = Y0; y < B; y += 2) S.box.box(x0, y + 0.97, Z - 0.05, x1, y + 1.03, Z + 0.05, '#33507d');
      }
    }
    // the cell a stored tote belongs to when clicked
    rackPick(a, s, l, b) { return { kind: 'cell', id: this.sim.mapGrid.idx(this.sim.mapGrid.colX(a, s * 2), this.sim.grid.L - 1 - l) }; }
    buildTotes() {
      const sim = this.sim, g = sim.grid, inv = sim.inv, T = this.totes, Y0 = this.Y0;
      T.begin();
      for (const aisle of sim.aisles) for (const s of [0, 1]) for (let l = 0; l < g.L; l++) {
        if (!this.levelShown(l)) continue;
        const x0 = aisle.a * 3 + s * 2, z = g.levelZ(l) + 0.06, pick = this.rackPick(aisle.a, s, l, 0);
        for (let b = 0; b < g.SB; b++) {
          const id = aisle.slot[sim.si(l, s, b)];
          if (!id || this.moving.has(id)) continue;
          T.box(x0 + 0.1, Y0 + b + 0.12, z, x0 + 0.9, Y0 + b + 0.88, z + TOTE_H, this.toteColor(inv.binById.get(id)), this.rackPick(aisle.a, s, l, b) || pick);
        }
      }
      T.end();
    }
    // stored totes for the audit (WS.View3D.probe)
    probeStatic(out) {
      const sim = this.sim, g = sim.grid, Y0 = this.Y0;
      for (const aisle of sim.aisles) for (const s of [0, 1]) for (let l = 0; l < g.L; l++) {
        const x0 = aisle.a * 3 + s * 2, z = g.levelZ(l) + 0.06;
        for (let b = 0; b < g.SB; b++) {
          const id = aisle.slot[sim.si(l, s, b)];
          if (id && !this.moving.has(id)) out.push({ kind: 'stored', box: [x0 + 0.1, Y0 + b + 0.12, z, x0 + 0.9, Y0 + b + 0.88, z + TOTE_H], who: 'rack ' + id });
        }
      }
    }
    drawLive(alpha) {
      const g = this.sim.grid, o = this.opts;
      this.moving = this.movingTotes();
      const key = [g.version, o.heat, this.reqKey(), o.cutTop, o.cutOnly, [...this.moving].join()].join('|');
      if (key !== this.toteKey) { this.toteKey = key; this.buildTotes(); }
      this.drawMachines(alpha);
      this.drawConveyorTotes();
    }
    // a tote on a machine, a buffer or a conveyor, as the stations show them
    box3(B, x0, y0, x1, y1, z, color) { this.tote(B, x0, y0, x1, y1, z, TOTE_H, color); }
    // totes keep their colour and size from the racking to the stations (as in the isometric view)
    binColor(id) { const b = id && this.sim.inv.binById.get(id); return b ? this.toteColor(b) : '#64748b'; }
    portBinSize() { return WS.RackRenderer.prototype.portBinSize.call(this); }
    // totes on the conveyors, except one a machine is lifting off
    drawConveyorTotes() {
      const sim = this.sim, T = sim.convTote(), z = sim.grid.convZ;
      for (const it of sim.conv) {
        if (this.moving.has(it.bin.id)) continue;
        const q = sim.convAt(it);
        this.box3(this.dy.box, q.x - T.w, q.y - T.d, q.x + T.w, q.y + T.d, z, this.binColor(it.bin.id));
      }
    }
    // a conveyor on legs with chevrons along the belt pointing the way it runs
    beltLine(S, pts, width, z) {
      this.conveyor(S, pts, width, z);
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k], dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y), len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y), ang = Math.atan2(dy, dx);
        for (let s = 0.5; s < len - 0.2; s += 1.6) {
          // two arms from the tip, turned back ±135° (rbox turns its u axis by −a)
          const x = a.x + dx * (s + 0.08), y = a.y + dy * (s + 0.08);
          for (const sg of [1, -1]) S.box.rbox(x, y, -(ang + sg * 2.36), 0, -0.025, z - 0.02, 0.2, 0.025, z - 0.005, '#a16207');
        }
      }
    }
    // a fixed machine's position { x, y, z } for following and selection
    followPos(id) { return this.machinePos(this.sim.fleet[id]); }
    machinePos() { return null; }
    // a technician stands on the aisle floor, under a shuttle or crane up in the racking
    techSpot(m, p) { return { x: p.x, y: p.y + 0.85, z: 0, a: 0 }; }

    pickFloor(f) {
      const g = this.sim.grid;
      // a click on the racking footprint selects the rack side there, top shown level
      const a = Math.floor(f.x / 3), part = Math.floor(f.x - a * 3), y = f.y - this.Y0;
      if (a >= 0 && a < g.A && part !== 1 && y >= 0 && y < g.SB) {
        for (let l = g.L - 1; l >= 0; l--) if (this.levelShown(l)) return this.rackPick(a, part / 2, l, Math.floor(y));
      }
      return super.pickFloor(f);
    }
    drawLabels() {
      super.drawLabels();
      const g = this.sim.grid;
      for (const aisle of this.sim.aisles) this.label(`AISLE ${aisle.a + 1}`, g.laneX(aisle.a), this.Y0 + g.B + 0.3, g.Z + 1.6, { size: 10, bg: 'rgba(15,23,42,0.82)', color: '#fde68a' });
    }
  }

  // Racking with the pre-zone conveyor in front: lines to the stations and
  // back, or the stands and the floor of the transport robots (WS.ToteBots).
  class PreZone3D extends Rack3D {
    // the one-way pre-zone loop and its spurs (WS.PreZoneSim.preZoneLines())
    buildStatic() {
      super.buildStatic();
      for (const line of this.sim.preZoneLines()) this.beltLine(this.st, line, 0.72, this.sim.grid.convZ);
      if (this.sim.bots) this.buildBotFloor();
    }

    // ---------------------------------------------------------------- transport robots
    // The robot floor's paint as one texture, from the handover row to the stations.
    buildBotFloor() {
      const g = this.sim.grid, S = this.st, PX = 32, T = WS.View3D.THREE;
      if (!this.floorCv) {
        this.floorCv = document.createElement('canvas');
        this.floorTex = new T.CanvasTexture(this.floorCv); this.floorTex.colorSpace = T.SRGBColorSpace; this.floorTex.anisotropy = 8;
        const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ map: this.floorTex, roughness: 0.9 }));
        m.rotation.x = -Math.PI / 2; m.receiveShadow = true; this.scene.add(m); this.floorMesh = m;
      }
      const H = g.D - g.handY;
      this.floorMesh.scale.set(g.W, H, 1); this.floorMesh.position.set(g.W / 2, 0.002, g.handY + H / 2);
      this.floorCv.width = g.W * PX; this.floorCv.height = H * PX;
      this.paintBotFloor(); this.heatAt = performance.now();
      for (const ch of g.chargers) S.box.box(ch.x + 0.82, ch.y + 0.3, 0, ch.x + 0.98, ch.y + 0.7, 1.8, '#334155');
    }
    paintBotFloor() {
      const sim = this.sim, g = sim.grid, C = WS.CELL, PX = 32, c = this.floorCv.getContext('2d'), Y = g.handY;
      c.fillStyle = '#1f2a3a'; c.fillRect(0, 0, this.floorCv.width, this.floorCv.height);
      const rect = (x, y, i, fill) => { c.fillStyle = fill; c.fillRect(x * PX + i, (y - Y) * PX + i, PX - 2 * i, PX - 2 * i); };
      const chevron = (x, y, dx, col) => {
        const mx = (x + 0.5) * PX, my = (y - Y + 0.5) * PX, k = PX * 0.2;
        c.strokeStyle = col; c.lineWidth = 3; c.beginPath();
        c.moveTo(mx - k * dx, my - k); c.lineTo(mx + k * 0.5 * dx, my); c.lineTo(mx - k * dx, my + k); c.stroke();
      };
      for (let y = Y; y < g.D; y++) for (let x = 0; x < g.W; x++) {
        const i = g.idx(x, y), t = g.type[i];
        if (t === C.HIGHWAY) { rect(x, y, 1, '#243246'); chevron(x, y, g.west.includes(y) ? -1 : 1, 'rgba(148,163,184,0.45)'); }
        else if (t === C.PARK) { rect(x, y, 3, '#13261d'); c.strokeStyle = 'rgba(74,222,128,0.35)'; c.lineWidth = 1.5; c.strokeRect(x * PX + 3, (y - Y) * PX + 3, PX - 6, PX - 6); }
        else if (t === C.CHARGER) { rect(x, y, 2, '#14532d'); c.strokeStyle = '#4ade80'; c.lineWidth = 1.5; c.strokeRect(x * PX + 6, (y - Y) * PX + 6, PX - 12, PX - 12); }
        else if (t === C.LANE) { rect(x, y, 1, '#2a2614'); chevron(x, y, 1, 'rgba(250,204,21,0.6)'); }
        else if (t === C.HAND || t === C.PORT || t === C.PORT_OUT) { rect(x, y, 1, '#3a2f12'); c.strokeStyle = '#facc15'; c.lineWidth = 2; c.strokeRect(x * PX + 2, (y - Y) * PX + 2, PX - 4, PX - 4); }
        else rect(x, y, 0, '#141b27');
        if (this.opts.heat) {
          const v = Math.max(Math.min(1, g.waitHeat[i] / 40), Math.min(1, g.passHeat[i] / 60) * 0.6);
          if (v > 0.04) rect(x, y, 0, `rgba(239,68,68,${(v * 0.7).toFixed(2)})`);
        }
      }
      c.strokeStyle = 'rgba(202,138,4,0.6)'; c.lineWidth = 2; c.beginPath();
      for (const y of [g.handY + 1, g.portY]) { c.moveTo(0, (y - Y) * PX); c.lineTo(g.W * PX, (y - Y) * PX); }
      c.stroke();
      this.floorTex.needsUpdate = true;
    }
    drawLive(alpha) {
      super.drawLive(alpha);
      if (!this.sim.bots) return;
      const sim = this.sim, g = sim.grid, D = this.dy;
      if (this.opts.heat && performance.now() - this.heatAt > 1000) { this.paintBotFloor(); this.heatAt = performance.now(); }
      for (const ch of g.chargers) { const on = ch.robot >= 0 && sim.fleet[ch.robot].state === 'CHARGING'; (on ? D.lit : D.box).box(ch.x + 0.8, ch.y + 0.35, 1.2, ch.x + 0.82, ch.y + 0.65, 1.6, on ? '#4ade80' : '#166534'); }
      for (const r of sim.bots.robots) this.drawBot(r, r.prx + (r.rx - r.prx) * alpha, r.pry + (r.ry - r.pry) * alpha);
    }
    // A roller-top robot: a dark base with wheels, a white body with a teal
    // band and the state light, the roller deck on top at conveyor height
    // with the tote on it or rolling on or off.
    drawBot(r, x, y) {
      const sim = this.sim, g = sim.grid, D = this.dy, col = WS.led(this, r, sim), pick = { kind: 'robot', id: r.id }, cx = x + 0.5, cy = y + 0.5, H = g.convZ - 0.12;
      D.rnd.box(cx - 0.4, cy - 0.4, 0.02, cx + 0.4, cy + 0.4, 0.16, '#1e293b', pick);
      for (const s of [-1, 1]) D.cyl.cylX(cx + s * 0.405 - 0.03, cx + s * 0.405 + 0.03, cy, 0.12, 0.1, '#0b0f17');
      D.rnd.box(cx - 0.39, cy - 0.39, 0.16, cx + 0.39, cy + 0.39, H - 0.08, '#e2e8f0', pick);
      D.rnd.box(cx - 0.395, cy - 0.395, 0.9, cx + 0.395, cy + 0.395, 1.08, '#0d9488', pick);
      D.lit.box(cx - 0.12, cy + 0.395, 1.3, cx + 0.12, cy + 0.4, 1.42, col);
      D.lit.box(cx - 0.12, cy - 0.4, 1.3, cx + 0.12, cy - 0.395, 1.42, col);
      // the deck: a frame and rollers across the way totes roll on and off (along y)
      D.box.box(cx - 0.38, cy - 0.38, H - 0.08, cx + 0.38, cy + 0.38, H - 0.02, '#475569', pick);
      for (let k = 0; k < 6; k++) D.cyl.cylX(cx - 0.34, cx + 0.34, cy - 0.3 + k * 0.12, H, 0.035, '#94a3b8');
      const xf = this.xfer(r), T = sim.convTote();
      let tx = cx, ty = cy, id = r.bin;
      if (xf) { id = xf.u == null ? null : xf.id; if (xf.u != null) { tx = cx + (xf.at.x - cx) * xf.u; ty = cy + (xf.at.y - cy) * xf.u; } }
      if (id) this.box3(D.box, tx - T.w, ty - T.d, tx + T.w, ty + T.d, H + 0.04, this.binColor(id));
    }
    // a robot is followed where it is drawn; a machine where WS.Rack3D puts it
    followPos(id, alpha) {
      const r = this.sim.fleet[id];
      if (r && r.claims) return WS.View3D.prototype.followPos.call(this, id, alpha);
      return super.followPos(id, alpha);
    }
    pickFloor(f) {
      const sim = this.sim, g = sim.grid, x = Math.floor(f.x), y = Math.floor(f.y);
      if (sim.bots && g.inside(x, y) && y >= g.B) {
        const i = g.idx(x, y), port = sim.ports.find((p) => [...p.dock.cells, p.out].some((c) => c.x === x && c.y === y));
        if (port) return { kind: 'port', id: port.idx };
        if (g.type[i] !== WS.CELL.BLOCKED) return { kind: 'cell', id: sim.mapGrid.idx(x, y + sim.mapGrid.floorDY) };
      }
      return super.pickFloor(f);
    }
    drawLabels() {
      super.drawLabels();
      if (!this.sim.bots || (this.cam.dist > 24 && !this.cam.walk)) return; // robot names only up close
      const z = this.sim.grid.convZ + 1.4;
      for (const r of this.sim.bots.robots) this.label(r.name, r.rx + 0.5, r.ry + 0.5, z, { size: 9, color: '#0f172a', weight: 800, bg: 'rgba(241,245,249,0.85)' });
    }
    // a rack side at one level (the control-room map cell), outlined along its length
    selectionBox(s, alpha) {
      if (s.kind === 'cell') {
        const c = this.sim.mapGrid.at(s.id), g = this.sim.grid;
        if (this.sim.bots && !c) { const f = this.sim.mapGrid.floorCell(s.id); return f >= 0 ? [g.cx(f), g.cy(f), g.cx(f) + 1, g.cy(f) + 1, 0.02] : null; }
        if (!c || (c.part !== 0 && c.part !== 2)) return null;
        const x0 = c.a * 3 + c.part;
        return [x0, 0, x0 + 1, g.SB, g.levelZ(c.level) + 0.02];
      }
      return super.selectionBox(s, alpha);
    }
  }

  WS.Rack3D = Rack3D;
  WS.PreZone3D = PreZone3D;
})((globalThis.WS = globalThis.WS || {}));
