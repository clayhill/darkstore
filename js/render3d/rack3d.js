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
    rackPick(a, s, l, b) { return { kind: 'cell', id: this.sim.mapGrid.idx(a * 4 + s * 2, this.sim.grid.L - 1 - l) }; }
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

  // Racking with the pre-zone conveyor in front: lines to the stations and back.
  class PreZone3D extends Rack3D {
    // the one-way pre-zone loop and its spurs (WS.PreZoneSim.preZoneLines())
    buildStatic() {
      super.buildStatic();
      for (const line of this.sim.preZoneLines()) this.beltLine(this.st, line, 0.72, this.sim.grid.convZ);
    }
    // a rack side at one level (the control-room map cell), outlined along its length
    selectionBox(s, alpha) {
      if (s.kind === 'cell') {
        const c = this.sim.mapGrid.at(s.id), g = this.sim.grid;
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
