/* CubeFlow in the free 3D view (WS.View3D): every bin of the [X][Y][Z]
 * matrix inside the aluminium grid, the rails on top, the port shafts, and
 * the robots with their winch lowering a gripper and bin into a stack. The
 * bins are one batch, rebuilt only when a stack changes. X-ray colours every
 * bin by ABC class and leaves the frame out. */
(function (WS) {
  'use strict';
  const C = WS.CELL, BIN = '#4a5a70', EMPTY = '#3a4658';

  class CubeRenderer3D extends WS.View3D {
    get robotZ() { return this.sim.grid.Z; }
    buildKey() { return super.buildKey() + '|' + this.opts.xray; }
    extraBatches() { return [this.bins]; }

    buildStatic() {
      super.buildStatic();
      const g = this.sim.grid, S = this.st, Z = g.Z, xray = this.opts.xray;
      if (!this.bins) { this.bins = this.newBatch('box', 'std', 8192); this.ghosts = this.newBatch('box', 'clear', 2048); }
      this.binKey = null;
      // base plate, then the aluminium frame: an upright at every grid line crossing
      S.box.box(-0.1, -0.1, -0.05, g.W + 0.1, g.D + 0.1, 0.02, '#111827');
      for (let x = 0; x <= g.W; x++) for (let y = 0; y <= g.D; y++) {
        const edge = x === 0 || y === 0 || x === g.W || y === g.D;
        if (xray && !(edge && (x % g.W === 0) && (y % g.D === 0))) continue;
        S.box.box(x - 0.035, y - 0.035, 0, x + 0.035, y + 0.035, Z, edge && (x % 4 === 0 || y % 4 === 0) ? '#b8c4d2' : '#8a98aa');
      }
      // rails on top in both directions; beams along the outside
      const rail = xray ? '#64748b' : '#d5dde6';
      for (let x = 0; x <= g.W; x++) S.box.box(x - 0.05, 0, Z, x + 0.05, g.D, Z + 0.1, rail);
      for (let y = 0; y <= g.D; y++) S.box.box(0, y - 0.05, Z, g.W, y + 0.05, Z + 0.1, rail);
      if (!xray) for (const z of [0, Z / 2]) { S.box.box(0, g.D - 0.04, z, g.W, g.D + 0.04, z + 0.12, '#9aa8b8'); S.box.box(g.W - 0.04, 0, z, g.W + 0.04, g.D, z + 0.12, '#8593a5'); }
      // port shafts: see-through, so a bin going down to the conveyor stays visible
      for (const p of this.sim.ports) {
        const pick = { kind: 'port', id: p.idx };
        for (const c of [p.drop, p.lift]) {
          S.clear.box(c.x + 0.04, c.y + 0.04, this.CZ + 1, c.x + 0.96, c.y + 0.96, Z, '#0b1220');
          for (const [a, b] of [[0, 0.08], [0.92, 1]]) { S.lit.box(c.x + a, c.y, Z + 0.1, c.x + b, c.y + 1, Z + 0.13, '#facc15'); S.lit.box(c.x, c.y + a, Z + 0.1, c.x + 1, c.y + b, Z + 0.13, '#facc15'); }
          S.box.box(c.x + 0.2, c.y + 0.2, Z + 0.08, c.x + 0.8, c.y + 0.8, Z + 0.1, '#000000', pick);
        }
      }
      for (const ch of g.chargers) {
        S.box.box(ch.x + 0.25, -0.32, Z, ch.x + 0.75, -0.04, Z + 1.6, '#334155');
        S.lit.box(ch.x + 0.06, 0.06, Z + 0.1, ch.x + 0.94, 0.94, Z + 0.12, '#14532d');
      }
    }

    // Every bin as a box; the top of a full stack shows the tote's open top.
    buildBins() {
      const sim = this.sim, g = sim.grid, inv = sim.inv, B = this.bins, G = this.ghosts, xray = this.opts.xray, heat = this.opts.heat;
      B.begin(); G.begin();
      for (let i = 0; i < g.stacks.length; i++) {
        const st = g.stacks[i]; if (!st.length) continue;
        const x = g.cx(i), y = g.cy(i), pick = { kind: 'cell', id: i };
        for (let z = 0; z < st.length; z++) {
          const b = inv.binById.get(st[z]), cls = inv.binClass(b);
          if (xray) {
            if (cls === 'E' && !b.requests.length) G.box(x + 0.09, y + 0.09, z + 0.04, x + 0.91, y + 0.91, z + 0.96, EMPTY);
            else B.box(x + 0.09, y + 0.09, z + 0.04, x + 0.91, y + 0.91, z + 0.96, b.requests.length ? '#ffffff' : WS.CLASS_COLORS[cls], pick);
          } else {
            const col = heat ? WS.CLASS_COLORS[cls] : BIN;
            B.box(x + 0.07, y + 0.07, z + 0.03, x + 0.93, y + 0.93, z + 0.97, col, pick);
            if (z === st.length - 1) B.box(x + 0.15, y + 0.15, z + 0.97, x + 0.85, y + 0.85, z + 0.98, WS.shade(col, -0.55), pick);
          }
        }
      }
      B.end(); G.end();
    }

    // stored bins for the audit (WS.View3D.probe)
    probeStatic(out) {
      const g = this.sim.grid;
      for (let i = 0; i < g.stacks.length; i++) for (let z = 0; z < g.stacks[i].length; z++) out.push({ kind: 'stored', box: [g.cx(i) + 0.07, g.cy(i) + 0.07, z + 0.03, g.cx(i) + 0.93, g.cy(i) + 0.93, z + 0.97], who: 'stack ' + g.stacks[i][z] });
    }
    drawLive(alpha) {
      const sim = this.sim, g = sim.grid, Z = g.Z, D = this.dy;
      const key = `${g.version}|${this.opts.xray}|${this.opts.heat}|${sim.inv.bins.length}`;
      if (key !== this.binKey) { this.binKey = key; this.buildBins(); }
      for (let i = 0; i < g.type.length; i++) {
        const x = g.cx(i), y = g.cy(i);
        if (this.opts.heat && g.type[i] === C.STORAGE) {
          const v = Math.max(Math.min(1, g.waitHeat[i] / 40), Math.min(1, g.passHeat[i] / 60) * 0.6);
          if (v > 0.15) D.clear.box(x + 0.05, y + 0.05, Z + 0.11, x + 0.95, y + 0.95, Z + 0.13, v > 0.5 ? '#ef4444' : '#f97316');
        }
        // a robot digging here: red no-go frame
        const o = g.claim[i];
        if (o >= 0 && sim.fleet[o].busy && sim.fleet[o].x === x && sim.fleet[o].y === y && g.type[i] === C.STORAGE && Math.sin(this.t * 6) > -0.3) {
          for (const [a, b] of [[0, 0.06], [0.94, 1]]) { D.lit.box(x + a, y, Z + 0.12, x + b, y + 1, Z + 0.15, '#ef4444'); D.lit.box(x, y + a, Z + 0.12, x + 1, y + b, Z + 0.15, '#ef4444'); }
        }
      }
      for (const ch of g.chargers) {
        const on = ch.robot >= 0 && sim.fleet[ch.robot].state === 'CHARGING';
        (on ? D.lit : D.box).box(ch.x + 0.35, -0.05, Z + 1.1, ch.x + 0.65, -0.03, Z + 1.4, on ? '#4ade80' : '#166534');
      }
      for (const r of sim.fleet) this.drawRobot(r, r.prx + (r.rx - r.prx) * alpha, r.pry + (r.ry - r.pry) * alpha);
    }

    // Robot: corner posts around the bin cavity, two wheel sets (the one not
    // in use lifted), a white shell with a bumper band and a state-coloured
    // light strip and lid. The winch lowers four tapes and the gripper.
    drawRobot(r, x, y) {
      const sim = this.sim, g = sim.grid, Z = g.Z, D = this.dy, inv = sim.inv, col = WS.stateColor(sim, r.displayState), pick = { kind: 'robot', id: r.id };
      const x0 = x + 0.08, y0 = y + 0.08, x1 = x + 0.92, y1 = y + 0.92, zc = Z + 0.62, zt = Z + 2.0;
      const binCol = (id) => { const b = inv.binById.get(id); return this.opts.heat && b ? WS.CLASS_COLORS[inv.binClass(b)] : '#64748b'; };
      for (const [px, py] of [[x0, y0], [x1 - 0.12, y0], [x0, y1 - 0.12], [x1 - 0.12, y1 - 0.12]]) D.box.box(px, py, Z + 0.12, px + 0.12, py + 0.12, zc, '#cbd5e1', pick);
      if (r.winch > 0.02) {
        // tapes down to the gripper, with the bin hanging under it
        const zb = Z + 0.08 - r.winch / sim.cfg.binHeight;
        for (const [bx, by] of [[x + 0.22, y + 0.22], [x + 0.78, y + 0.22], [x + 0.22, y + 0.78], [x + 0.78, y + 0.78]]) D.lit.box(bx - 0.012, by - 0.012, zb + 0.95, bx + 0.012, by + 0.012, Z + 0.3, '#e2e8f0');
        D.box.box(x + 0.14, y + 0.14, zb + 0.95, x + 0.86, y + 0.86, zb + 1.05, '#334155', pick);
        if (r.bin) this.tote(D.box, x + 0.12, y + 0.12, x + 0.88, y + 0.88, zb, 0.95, binCol(r.bin));
      } else if (r.bin) this.tote(D.box, x + 0.17, y + 0.17, x + 0.83, y + 0.83, Z + 0.08, 0.56, binCol(r.bin));
      else D.box.box(x + 0.16, y + 0.16, Z + 0.3, x + 0.84, y + 0.84, Z + 0.34, '#0b1220');
      // X wheels on the faces along x, Y wheels on the faces along y; the idle set is lifted
      const lx = r.axis === 'x' ? 0 : 0.14, ly = r.axis === 'y' ? 0 : 0.14;
      for (const wx of [x0 + 0.23, x1 - 0.23]) for (const wy of [y0 - 0.01, y1 - 0.03]) D.cyl.cylY(wx, wy, wy + 0.04, Z + 0.24 + lx, 0.11, '#0b0f17');
      for (const wy of [y0 + 0.23, y1 - 0.23]) for (const wx of [x0 - 0.01, x1 - 0.03]) D.cyl.cylX(wx, wx + 0.04, wy, Z + 0.24 + ly, 0.11, '#0b0f17');
      D.box.box(x0 - 0.005, y0 - 0.005, zc, x1 + 0.005, y1 + 0.005, zc + 0.16, '#334155', pick);
      D.rnd.box(x0, y0, zc + 0.16, x1, y1, zt - 0.14, '#f1f5f9', pick);
      D.lit.box(x0 + 0.06, y0 - 0.006, zt - 0.5, x1 - 0.06, y1 + 0.006, zt - 0.38, col);
      D.lit.box(x0 - 0.006, y0 + 0.06, zt - 0.5, x1 + 0.006, y1 - 0.06, zt - 0.38, col);
      D.rnd.box(x0 + 0.03, y0 + 0.03, zt - 0.14, x1 - 0.03, y1 - 0.03, zt, '#e2e8f0', pick);
      D.lit.box(x0 + 0.2, y0 + 0.2, zt, x1 - 0.2, y1 - 0.2, zt + 0.02, WS.shade(col, 0.2));
    }
    followPos(id, alpha) {
      const r = this.sim.fleet[id];
      return r && { x: r.prx + (r.rx - r.prx) * alpha + 0.5, y: r.pry + (r.ry - r.pry) * alpha + 0.5 };
    }

    // Clicks on the grid top or its sides select the column there.
    pickFloor(f) {
      const g = this.sim.grid, x = Math.floor(f.x), y = Math.floor(f.y);
      if (g.inside(x, y)) {
        const i = g.idx(x, y), port = this.sim.ports.find((p) => p.cells.some((c) => g.idx(c.x, c.y) === i));
        return port ? { kind: 'port', id: port.idx } : { kind: 'cell', id: i };
      }
      return super.pickFloor(f);
    }
    selectionBox(s, alpha) {
      const g = this.sim.grid, Z = g.Z + 0.14;
      if (s.kind === 'cell') { const x = g.cx(s.id), y = g.cy(s.id); return [x - 0.04, y - 0.04, x + 1.04, y + 1.04, Z]; }
      if (s.kind === 'port') { const p = this.sim.ports[s.id], xs = p.cells.map((c) => c.x), ys = p.cells.map((c) => c.y); return [Math.min(...xs), Math.min(...ys), Math.max(...xs) + 1, Math.max(...ys) + 1, Z]; }
      return super.selectionBox(s, alpha);
    }
    drawLabels() {
      super.drawLabels();
      const sim = this.sim, Z = sim.grid.Z;
      for (const r of sim.fleet) {
        this.label(r.name, r.rx + 0.5, r.ry + 0.5, Z + 2.6, { size: 9, color: '#0f172a', weight: 800, bg: 'rgba(241,245,249,0.85)' });
        if (r.winch > 0.02) this.label('↓ ' + r.winch.toFixed(1) + ' m', r.rx + 0.5, r.ry + 0.5, Z + 3.6, { size: 9, color: '#fde68a', bg: 'rgba(15,23,42,0.75)' });
      }
    }
  }

  WS.CubeRenderer3D = CubeRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
