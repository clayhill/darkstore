/* Racking in the free 3D view, shared by RailRunner, SkyStack and StackPilot:
 * steel uprights and beams, every stored tote (one batch, rebuilt when a
 * tote moves), the totes machines are handing over (WS.RackRenderer's
 * transfer timing) and the Levels cut-away. WS.PreZone3D adds the pre-zone
 * conveyor in front of the aisles (RailRunner, SkyStack). */
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
    drawLive(alpha) {
      const g = this.sim.grid, o = this.opts;
      this.moving = this.movingTotes();
      const key = [g.version, o.heat, this.reqKey(), o.cutTop, o.cutOnly, [...this.moving].join()].join('|');
      if (key !== this.toteKey) { this.toteKey = key; this.buildTotes(); }
      this.drawMachines(alpha);
      this.drawConveyorTotes();
    }
    // an upright tote on a machine or buffer, closed look
    box3(B, x0, y0, x1, y1, z, color, pick) { B.box(x0, y0, z, x1, y1, z + TOTE_H, color, pick); }
    binColor(id) { const b = id && this.sim.inv.binById.get(id); return b ? this.toteColor(b) : '#64748b'; }
    drawConveyorTotes() {
      const sim = this.sim;
      for (const it of sim.conv) { const q = sim.posOnPath(it); this.box3(this.dy.box, q.x - 0.26, q.y - 0.3, q.x + 0.26, q.y + 0.3, this.convZ(it), this.binColor(it.bin.id)); }
    }
    convZ(it) { return it.back ? 1.4 : 2.0; }
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
    buildStatic() {
      super.buildStatic();
      const sim = this.sim, g = sim.grid, S = this.st, last = sim.ports[sim.ports.length - 1].drop.x;
      this.conveyor(S, [{ x: g.laneX(0), y: g.retY }, { x: last + 1.5, y: g.retY }], 0.42, 1.4, '#2b3646');
      for (const aisle of sim.aisles) this.conveyor(S, [{ x: g.laneX(aisle.a), y: g.B + 0.5 }, { x: g.laneX(aisle.a), y: g.outY }], 0.4, 2.0);
      for (const p of sim.ports) {
        this.conveyor(S, [{ x: p.drop.x + 1.5, y: g.retY }, { x: p.drop.x + 1.5, y: g.D }], 0.4, 1.4, '#2b3646');
        this.conveyor(S, [{ x: p.drop.x + 0.5, y: g.outY }, { x: p.drop.x + 0.5, y: g.D }], 0.4, 2.0);
      }
      this.conveyor(S, [{ x: g.laneX(0), y: g.outY }, { x: last + 0.5, y: g.outY }], 0.42, 2.0);
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
