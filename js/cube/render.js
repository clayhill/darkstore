/* CubeFlow view: the aluminium grid with bins showing through its sides, the
 * top surface with rails, ports and chargers, an X-ray of every stack (cached
 * to an offscreen canvas, re-rendered only when stacks or the camera change)
 * and the robots with their winches. */
(function (WS) {
  'use strict';
  const { shade, rgba, STATE_COLORS, CLASS_COLORS } = WS;

  class CubeRenderer extends WS.IsoRenderer {
    pick(sx, sy) {
      const sim = this.sim, g = sim.grid;
      // robots (projected centre)
      let best = null, bd = 22 * Math.max(1, this.cam.zoom);
      for (const r of sim.fleet) {
        const [px, py] = this.P(r.rx + 0.5, r.ry + 0.5, g.Z + 1);
        const d = Math.hypot(this.cam.x + px * this.cam.zoom - sx, this.cam.y + py * this.cam.zoom - sy);
        if (d < bd) { bd = d; best = { kind: 'robot', id: r.id }; }
      }
      if (best) return best;
      const top = this.toWorld(sx, sy, g.Z);
      if (top.x >= 0 && top.y >= 0 && top.x < g.W && top.y < g.D) {
        const i = g.idx(Math.floor(top.x), Math.floor(top.y));
        const port = sim.ports.find((p) => g.idx(p.drop.x, p.drop.y) === i || g.idx(p.lift.x, p.lift.y) === i);
        if (port) return { kind: 'port', id: port.idx };
        return { kind: 'cell', id: i };
      }
      return this.pickStations(this.toWorld(sx, sy, 1.5));
    }

    drawScene(alpha) {
      this.drawFloor();
      if (this.opts.xray) this.drawXray(); else this.drawGridSolid();
      this.drawTopSurface();
      this.drawStations();
      this.drawRobots(alpha);
    }

    // Solid grid: aluminium frame with the outer bins visible through it.
    drawGridSolid() {
      const g = this.sim.grid, P = this.P.bind(this), Z = g.Z, inv = this.sim.inv;
      const portCells = new Set(); for (const p of g.ports) { portCells.add(g.idx(p.drop.x, p.drop.y)); portCells.add(g.idx(p.lift.x, p.lift.y)); }
      // left face y = D
      this.poly([P(0, g.D, 0), P(g.W, g.D, 0), P(g.W, g.D, Z), P(0, g.D, Z)], '#1f2937');
      for (let x = 0; x < g.W; x++) {
        const i = g.idx(x, g.D - 1);
        if (portCells.has(i)) { this.poly([P(x, g.D, 0), P(x + 1, g.D, 0), P(x + 1, g.D, Z), P(x, g.D, Z)], '#0b1220'); continue; }
        const s = g.stacks[i];
        for (let z = 0; z < s.length; z++) {
          const b = inv.binById.get(s[z]);
          const col = this.opts.heat ? CLASS_COLORS[inv.binClass(b)] : '#4a5a70';
          // tote seen through the frame: wall, lighter rim and a hand-hold slot
          this.faceY(g.D, x + 0.07, x + 0.93, z + 0.06, z + 0.94, shade(col, -0.25));
          this.faceY(g.D, x + 0.05, x + 0.95, z + 0.8, z + 0.94, shade(col, -0.05));
          this.faceY(g.D, x + 0.36, x + 0.64, z + 0.56, z + 0.7, 'rgba(5,8,14,0.6)');
        }
      }
      // right face x = W
      this.poly([P(g.W, 0, 0), P(g.W, g.D, 0), P(g.W, g.D, Z), P(g.W, 0, Z)], '#18212e');
      for (let y = 0; y < g.D; y++) {
        const i = g.idx(g.W - 1, y);
        if (portCells.has(i)) { this.poly([P(g.W, y, 0), P(g.W, y + 1, 0), P(g.W, y + 1, Z), P(g.W, y, Z)], '#070c16'); continue; }
        const s = g.stacks[i];
        for (let z = 0; z < s.length; z++) {
          const b = inv.binById.get(s[z]);
          const col = this.opts.heat ? CLASS_COLORS[inv.binClass(b)] : '#4a5a70';
          this.faceX(g.W, y + 0.07, y + 0.93, z + 0.06, z + 0.94, shade(col, -0.45));
          this.faceX(g.W, y + 0.05, y + 0.95, z + 0.8, z + 0.94, shade(col, -0.3));
          this.faceX(g.W, y + 0.36, y + 0.64, z + 0.56, z + 0.7, 'rgba(5,8,14,0.6)');
        }
      }
      // aluminium uprights and beams
      for (let x = 0; x <= g.W; x++) this.line(P(x, g.D, 0), P(x, g.D, Z), x % 4 === 0 ? '#9aa8b8' : '#6b7a8d', x % 4 === 0 ? 2 : 1);
      for (let y = 0; y <= g.D; y++) this.line(P(g.W, y, 0), P(g.W, y, Z), y % 4 === 0 ? '#8593a5' : '#566578', y % 4 === 0 ? 2 : 1);
      for (const z of [0, Z * 0.5, Z]) { this.line(P(0, g.D, z), P(g.W, g.D, z), '#9aa8b8', 1.5); this.line(P(g.W, 0, z), P(g.W, g.D, z), '#8593a5', 1.5); }
    }

    // X-ray: every bin of the [X][Y][Z] matrix, coloured by ABC class.
    drawXray() { this.drawCached('xray', this.sim.grid.version + '|' + this.opts.heat, () => this.renderXray()); }
    renderXray() {
      const sim = this.sim, g = sim.grid, inv = sim.inv;
      const P = this.P.bind(this);
      // ghost frame
      this.poly([P(0, g.D, 0), P(g.W, g.D, 0), P(g.W, 0, 0), P(0, 0, 0)], 'rgba(15,23,42,0.6)');
      for (let s = 0; s <= g.W + g.D - 2; s++) {
        for (let x = Math.max(0, s - g.D + 1); x <= Math.min(g.W - 1, s); x++) {
          const y = s - x, i = g.idx(x, y), st = g.stacks[i];
          for (let z = 0; z < st.length; z++) {
            const b = inv.binById.get(st[z]), cls = inv.binClass(b), col = b.requests.length ? '#ffffff' : CLASS_COLORS[cls];
            this.box(x + 0.09, y + 0.09, z + 0.04, x + 0.91, y + 0.91, z + 0.96, col, cls === 'E' && !b.requests.length ? { top: 'rgba(80,95,120,0.55)', left: 'rgba(55,65,85,0.5)', right: 'rgba(40,48,64,0.5)' } : {});
          }
        }
      }
      this.line(P(0, g.D, g.Z), P(g.W, g.D, g.Z), 'rgba(148,163,184,0.5)', 1);
      this.line(P(g.W, 0, g.Z), P(g.W, g.D, g.Z), 'rgba(148,163,184,0.5)', 1);
      for (const [x, y] of [[0, g.D], [g.W, g.D], [g.W, 0]]) this.line(P(x, y, 0), P(x, y, g.Z), 'rgba(148,163,184,0.5)', 1);
    }

    drawTopSurface() {
      const sim = this.sim, g = sim.grid, Z = g.Z, P = this.P.bind(this), c = this.ctx, inv = sim.inv;
      const xray = this.opts.xray;
      if (!xray) this.poly([P(0, 0, Z), P(g.W, 0, Z), P(g.W, g.D, Z), P(0, g.D, Z)], '#aab6c4');
      const maxHeat = 40;
      for (let y = 0; y < g.D; y++) {
        for (let x = 0; x < g.W; x++) {
          const i = g.idx(x, y), t = g.type[i];
          if (t === WS.CELL.STORAGE) {
            if (!xray) {
              const h = g.stacks[i].length;
              if (h === Z) {
                const b = inv.binById.get(g.stacks[i][h - 1]);
                const col = this.opts.heat ? CLASS_COLORS[inv.binClass(b)] : '#5b6b80';
                // open top of a tote at the surface: rim around a dark interior
                this.quadTop(x + 0.08, y + 0.08, x + 0.92, y + 0.92, Z, col);
                this.quadTop(x + 0.15, y + 0.15, x + 0.85, y + 0.85, Z, shade(col, -0.55));
              } else {
                const dk = 0.12 + (0.55 * (Z - h)) / Z;
                this.quadTop(x + 0.08, y + 0.08, x + 0.92, y + 0.92, Z, `rgba(8,12,22,${(0.45 + dk).toFixed(2)})`);
              }
            }
            if (this.opts.heat) {
              const hv = Math.min(1, g.waitHeat[i] / maxHeat), pv = Math.min(1, g.passHeat[i] / 60);
              const v = Math.max(hv, pv * 0.6);
              if (v > 0.04) this.quadTop(x, y, x + 1, y + 1, Z + 0.01, `rgba(239,68,68,${(v * 0.7).toFixed(2)})`);
            }
          } else if (t === WS.CELL.PORT) {
            this.quadTop(x + 0.04, y + 0.04, x + 0.96, y + 0.96, Z, '#111827');
            c.save(); c.globalAlpha = 0.9;
            this.quadTop(x + 0.04, y + 0.04, x + 0.96, y + 0.96, Z, null, '#facc15', 2);
            c.restore();
            this.quadTop(x + 0.2, y + 0.2, x + 0.8, y + 0.8, Z, '#000');
          } else if (t === WS.CELL.CHARGER) {
            this.quadTop(x + 0.06, y + 0.06, x + 0.94, y + 0.94, Z, '#14532d');
            this.quadTop(x + 0.18, y + 0.18, x + 0.82, y + 0.82, Z, null, '#4ade80', 1.5);
          }
          // robot holding a winch down here: no-go cell
          const o = g.claim[i];
          if (o >= 0 && sim.fleet[o].busy && sim.fleet[o].x === x && sim.fleet[o].y === y && t === WS.CELL.STORAGE) {
            const a = 0.45 + 0.35 * Math.sin(this.t * 6);
            this.quadTop(x + 0.02, y + 0.02, x + 0.98, y + 0.98, Z + 0.01, null, `rgba(239,68,68,${a.toFixed(2)})`, 2.5);
          }
        }
      }
      // rails
      const rail = xray ? 'rgba(148,163,184,0.35)' : '#d5dde6';
      for (let x = 0; x <= g.W; x++) this.line(P(x, 0, Z), P(x, g.D, Z), rail, xray ? 0.8 : 1.2);
      for (let y = 0; y <= g.D; y++) this.line(P(0, y, Z), P(g.W, y, Z), rail, xray ? 0.8 : 1.2);
      // charger posts on the back edge
      for (const ch of g.chargers) {
        this.box(ch.x + 0.25, -0.32, Z, ch.x + 0.75, -0.04, Z + 1.6, '#334155');
        const on = ch.robot >= 0 && sim.fleet[ch.robot].state === 'CHARGING';
        this.glow(ch.x + 0.5, -0.18, Z + 1.3, 14, on ? '#4ade80' : '#22c55e', on ? 0.9 : 0.35);
      }
      // claims & column locks
      if (this.opts.claims) {
        for (const r of sim.fleet) {
          const col = STATE_COLORS[r.displayState];
          for (const i of r.claims) {
            const x = g.cx(i), y = g.cy(i);
            if (x === r.x && y === r.y) continue;
            this.quadTop(x + 0.12, y + 0.12, x + 0.88, y + 0.88, Z + 0.02, rgba(col, 0.18), rgba(col, 0.55), 1);
          }
        }
      }
      if (this.hover && this.hover.kind === 'cell') {
        const x = g.cx(this.hover.id), y = g.cy(this.hover.id);
        this.quadTop(x, y, x + 1, y + 1, Z + 0.02, 'rgba(255,255,255,0.12)', '#fff', 1.5);
      }
      if (this.selected && this.selected.kind === 'cell') {
        const x = g.cx(this.selected.id), y = g.cy(this.selected.id);
        this.quadTop(x - 0.04, y - 0.04, x + 1.04, y + 1.04, Z + 0.02, 'rgba(56,189,248,0.18)', '#38bdf8', 2.5);
      }
    }

    // ---------------------------------------------------------------- robots
    drawRobots(alpha) {
      const sim = this.sim, g = sim.grid, Z = g.Z, P = this.P.bind(this), bh = sim.cfg.binHeight;
      const list = sim.fleet.map((r) => ({ r, x: r.prx + (r.rx - r.prx) * alpha, y: r.pry + (r.ry - r.pry) * alpha }));
      list.sort((a, b) => a.x + a.y - (b.x + b.y));
      // paths first, so robots sit on top
      if (this.opts.paths) {
        for (const { r, x, y } of list) {
          if (!r.path || !r.op || r.op.op !== 'move') continue;
          const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === r.id;
          const c = this.ctx, col = STATE_COLORS[r.displayState];
          c.beginPath();
          let p = P(x + 0.5, y + 0.5, Z + 0.05); c.moveTo(p[0], p[1]);
          for (let k = r.pi + 1; k < r.path.length; k++) { p = P(r.path[k].x + 0.5, r.path[k].y + 0.5, Z + 0.05); c.lineTo(p[0], p[1]); }
          c.strokeStyle = rgba(col, sel ? 0.95 : 0.45); c.lineWidth = sel ? 3 : 1.6; c.setLineDash(sel ? [] : [5, 4]); c.stroke(); c.setLineDash([]);
          const e = r.path[r.path.length - 1];
          this.quadTop(e.x + 0.3, e.y + 0.3, e.x + 0.7, e.y + 0.7, Z + 0.05, null, rgba(col, 0.9), 1.5);
        }
      }
      for (const { r, x, y } of list) {
        const col = STATE_COLORS[r.displayState];
        const x0 = x + 0.08, y0 = y + 0.08, x1 = x + 0.92, y1 = y + 0.92, zt = Z + 2.0;
        // winch bands & hanging bin
        if (r.winch > 0.02) {
          const lv = r.winch / bh; // levels below the robot's cavity floor
          const zb = Z + 1 - lv;
          if (this.opts.xray) {
            if (r.bin || r.op) {
              for (const [bx, by] of [[x + 0.22, y + 0.22], [x + 0.78, y + 0.22], [x + 0.22, y + 0.78], [x + 0.78, y + 0.78]]) this.line(P(bx, by, Z), P(bx, by, zb + 0.95), '#e2e8f0', 1);
            }
            if (r.bin) this.tote(x + 0.12, y + 0.12, x + 0.88, y + 0.88, zb, 0.95, '#ffffff', { closed: true });
          } else {
            this.glow(x + 0.5, y + 0.5, Z, 26, '#f59e0b', 0.35);
          }
        }
        // shadow
        this.quadTop(x + 0.04, y + 0.12, x + 1.0, y + 1.04, Z + 0.01, 'rgba(0,0,0,0.3)');
        // chassis: corner posts around the bin cavity; a hoisted bin sits in the cavity
        const zc = Z + 0.62, post = '#cbd5e1';
        this.box(x0, y0, Z + 0.12, x0 + 0.12, y0 + 0.12, zc, post);
        if (r.bin && r.winch <= 0.02) {
          const b = this.sim.inv.binById.get(r.bin);
          this.tote(x + 0.17, y + 0.17, x + 0.83, y + 0.83, Z + 0.08, 0.56, this.opts.heat && b ? CLASS_COLORS[this.sim.inv.binClass(b)] : '#64748b', { closed: true });
        } else this.box(x + 0.16, y + 0.16, Z + 0.3, x + 0.84, y + 0.84, zc, '#0b1220');
        this.box(x1 - 0.12, y0, Z + 0.12, x1, y0 + 0.12, zc, post);
        this.box(x0, y1 - 0.12, Z + 0.12, x0 + 0.12, y1, zc, post);
        this.box(x1 - 0.12, y1 - 0.12, Z + 0.12, x1, y1, zc, post);
        // two wheel sets: X wheels on the y-faces, Y wheels on the x-faces; the set not in use is lifted
        const lx = r.axis === 'x' ? 0 : 0.14, ly = r.axis === 'y' ? 0 : 0.14;
        for (const wx of [x0 + 0.23, x1 - 0.23]) this.wheelY(wx, y1 + 0.005, Z + 0.24 + lx, 0.11, 0.24);
        for (const wy of [y0 + 0.23, y1 - 0.23]) this.wheelX(x1 + 0.005, wy, Z + 0.24 + ly, 0.11, 0.24);
        // body shell with a dark bumper band, a state-coloured light strip and cooling vents
        this.box(x0, y0, zc, x1, y1, zt - 0.14, '#f1f5f9', { left: '#dfe5ec', right: '#b3bfcc', top: '#f8fafc' });
        this.faceY(y1 + 0.002, x0, x1, zc, zc + 0.16, '#334155');
        this.faceX(x1 + 0.002, y0, y1, zc, zc + 0.16, '#1f2937');
        this.faceY(y1 + 0.003, x0 + 0.08, x1 - 0.08, zt - 0.5, zt - 0.38, col);
        this.faceX(x1 + 0.003, y0 + 0.08, y1 - 0.08, zt - 0.5, zt - 0.38, shade(col, -0.25));
        for (let k = 0; k < 4; k++) { const vy = y0 + 0.25 + k * 0.1; this.line(P(x1 + 0.003, vy, zc + 0.3), P(x1 + 0.003, vy, zc + 0.62), '#8693a3', 1); }
        // lid: rounded-look top cap in the state colour
        this.box(x0 + 0.03, y0 + 0.03, zt - 0.14, x1 - 0.03, y1 - 0.03, zt, '#e2e8f0', { left: '#d3dae3', right: '#a5b1bf', top: col });
        this.quadTop(x0 + 0.2, y0 + 0.2, x1 - 0.2, y1 - 0.2, zt, shade(col, 0.3));
        if (r.displayState === 'WAITING_IN_TRAFFIC' || r.busy) this.glow(x + 0.5, y + 0.5, zt + 0.3, 22, col, 0.35 + 0.25 * Math.sin(this.t * 6));
        const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === r.id;
        if (sel) this.quadTop(x - 0.08, y - 0.08, x + 1.08, y + 1.08, Z + 0.02, null, '#38bdf8', 2.5);
        if (this.opts.labels) {
          this.text(r.name, x + 0.5, y + 0.5, zt + 0.02, { size: 9, color: '#0f172a', weight: 800 });
          if (r.battery < 30) {
            const [bx, by] = P(x + 0.5, y + 0.5, zt + 1.4), c = this.ctx;
            c.fillStyle = '#0f172a'; c.fillRect(bx - 11, by - 3, 22, 6);
            c.fillStyle = r.battery < 15 ? '#ef4444' : '#facc15'; c.fillRect(bx - 10, by - 2, (20 * r.battery) / 100, 4);
          }
          if (r.winch > 0.02 && !this.opts.xray) this.text('↓ ' + r.winch.toFixed(1) + ' m', x + 0.5, y + 0.5, zt + 1.6, { size: 9, color: '#fde68a', bg: 'rgba(15,23,42,0.75)' });
        }
      }
    }
  }

  WS.CubeRenderer = CubeRenderer;
})((globalThis.WS = globalThis.WS || {}));
