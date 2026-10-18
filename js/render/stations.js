/* The parts of the isometric view every warehouse has outside its storage:
 * the warehouse floor, conveyor workstations with their operators and put
 * walls, packing, the outbound dock, and their labels. WS.IsoRenderer is what
 * every storage type's renderer extends; it draws its storage in drawScene().
 * Camera, input and drawing primitives are WS.IsoView (js/render/iso.js). */
(function (WS) {
  'use strict';
  const { shade, roundRect } = WS;

  class IsoRenderer extends WS.IsoView {
    // ---------------------------------------------------------------- picking
    // Stations, packers and the dock, hit at floor level (f = world point at z 1.5).
    pickStations(f) {
      const sim = this.sim, L = sim.layout;
      const port = this.pickPort(f);
      if (port) return port;
      for (const pk of sim.oms.packers) { const q = L.packerPos(pk.idx); if (Math.abs(f.x - q.x) < 1.2 && Math.abs(f.y - q.y) < 1.2) return { kind: 'packer', id: pk.idx }; }
      const d = L.dock();
      if (f.x > d.x - 1 && f.x < d.x + 6 && Math.abs(f.y - d.y) < 1.6) return { kind: 'dock' };
      return null;
    }
    // conveyor workstation footprint, next to the storage
    pickPort(f) {
      const g = this.sim.grid;
      for (const p of this.sim.ports) {
        if (p.face === 'front' && f.x >= p.drop.x && f.x <= p.drop.x + 4.6 && f.y >= g.D && f.y <= g.D + 2.8) return { kind: 'port', id: p.idx };
        if (p.face === 'right' && f.x >= g.W && f.x <= g.W + 2.8 && f.y >= p.drop.y - 0.2 && f.y <= p.drop.y + 2.2) return { kind: 'port', id: p.idx };
      }
      return null;
    }

    // ---------------------------------------------------------------- warehouse floor
    drawFloor() {
      const g = this.sim.grid, L = this.sim.layout, d = L.dock();
      const x0 = -2, y0 = -2, x1 = d.x + 7, y1 = g.D + 8.5;
      const P = this.P.bind(this), c = this.ctx;
      this.poly([P(x0, y0, 0), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0)], '#1a2332');
      c.globalAlpha = 0.5;
      for (let x = Math.ceil(x0); x <= x1; x += 2) this.line(P(x, y0, 0), P(x, y1, 0), '#222d3f', 1);
      for (let y = Math.ceil(y0); y <= y1; y += 2) this.line(P(x0, y, 0), P(x1, y, 0), '#222d3f', 1);
      c.globalAlpha = 1;
      // shadow under the storage (racking: only as wide as the aisles) + safety walkway
      const sw = g.shadowW || g.W;
      this.poly([P(-0.3, -0.3, 0), P(sw + 0.6, -0.3, 0), P(sw + 0.6, g.D + 0.6, 0), P(-0.3, g.D + 0.6, 0)], 'rgba(0,0,0,0.35)');
      const ys = g.D + 2.75;
      c.setLineDash([6, 6]);
      this.line(P(0, ys + 1.4, 0), P(g.W + 1.2, ys + 1.4, 0), 'rgba(250,204,21,0.45)', 2);
      this.line(P(g.W + 3.3, -0.5, 0), P(g.W + 3.3, g.D - 0.5, 0), 'rgba(250,204,21,0.45)', 2);
      c.setLineDash([]);
    }

    // ---------------------------------------------------------------- stations
    // Warehouse operator in a hi-vis vest and hard hat. When active the arms alternate between
    // the work in front-left (pick) and front-right (put), with the head turning to follow.
    drawOperator(x, y, active, vest) {
      const c = this.ctx, [px, py] = this.P(x, y, 0);
      const s = active ? Math.sin(this.t * 4.5) : 0, look = s * 2.2;
      const skin = '#e0ac7e', shirt = '#2b3a55', trousers = '#1c2638';
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(px, py, 12, 5.5, 0, 0, Math.PI * 2); c.fill();
      // legs and safety boots
      c.fillStyle = trousers; roundRect(c, px - 6.2, py - 27, 5.6, 25, 2); c.fill(); roundRect(c, px + 0.6, py - 27, 5.6, 25, 2); c.fill();
      c.fillStyle = '#0b0f17'; c.beginPath(); c.ellipse(px - 3.6, py - 1.6, 4.2, 2.3, 0, 0, Math.PI * 2); c.ellipse(px + 3.6, py - 1.6, 4.2, 2.3, 0, 0, Math.PI * 2); c.fill();
      // torso: shirt, vest with reflective tape
      c.fillStyle = shirt; roundRect(c, px - 9, py - 47, 18, 23, 6); c.fill();
      c.fillStyle = vest; roundRect(c, px - 8.5, py - 45.5, 17, 20, 4); c.fill();
      c.fillStyle = 'rgba(232,238,245,0.92)'; c.fillRect(px - 8.5, py - 36, 17, 2.2); c.fillRect(px - 8.5, py - 31, 17, 2.2);
      c.fillRect(px - 5.5, py - 45.5, 2, 9.5); c.fillRect(px + 3.5, py - 45.5, 2, 9.5);
      // arms: rest at the sides, or reach out to the pick (left) and the put wall (right)
      const arm = (side, reach) => {
        const sx = px + side * 8, sy = py - 43;
        const hx = px + side * (10 + reach * 8), hy = py - 27 - reach * 16;
        const ex = (sx + hx) / 2 + side * 3, ey = (sy + hy) / 2 + 2;
        c.strokeStyle = shirt; c.lineWidth = 4.6; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.lineTo(hx, hy); c.stroke();
        c.fillStyle = skin; c.beginPath(); c.arc(hx, hy, 2.6, 0, Math.PI * 2); c.fill();
      };
      arm(-1, Math.max(0, s)); arm(1, Math.max(0, -s));
      c.lineCap = 'butt'; c.lineJoin = 'miter';
      // head: neck, face, ear, hard hat with brim
      c.fillStyle = skin; c.fillRect(px - 2.2, py - 50, 4.4, 4);
      c.beginPath(); c.arc(px + look * 0.4, py - 54, 6.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3b2a20'; c.beginPath(); c.arc(px + look * 0.4, py - 54.5, 6.2, Math.PI * 0.05, Math.PI * 0.95, true); c.fill();
      c.fillStyle = '#facc15'; c.beginPath(); c.arc(px + look * 0.4, py - 56, 6.9, Math.PI, 0); c.fill();
      c.fillStyle = '#eab308'; c.beginPath(); c.ellipse(px + look * 0.4, py - 56, 9, 2.2, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(px + look * 0.4 - 0.8, py - 62.5, 1.6, 6);
    }
    // Half sizes { w, d } of the bins on a port's conveyor (q) and at its pick position.
    portBinSize(p) {
      const front = p.face === 'front';
      return { q: { w: front ? 0.3 : 0.26, d: front ? 0.26 : 0.3 }, pick: { w: front ? 0.42 : 0.3, d: front ? 0.3 : 0.42 } };
    }
    // Where the presented bin is: it slides from the end of the infeed to the
    // pick position in the first moments of its job.
    pickPos(p) {
      const pp = this.sim.layout.portPath(p), a = pp.entry[1], b = pp.pick, u = Math.min(1, Math.max(0, (this.sim.time - (p.pickAt || 0)) / 0.4));
      const f = u * u * (3 - 2 * u);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    // Conveyor port: the frame the bins ride through, HMI screen and stack light.
    drawPortBody(p, add) {
      const sim = this.sim, g = sim.grid, L = sim.layout, CZ = this.CZ;
      const pp = L.portPath(p), op = L.operatorPos(p), front = p.face === 'front';
      const x0 = front ? p.drop.x + 0.1 : g.W, y0 = front ? g.D : p.drop.y + 0.1;
      const x1 = front ? p.drop.x + 1.9 : g.W + 1.75, y1 = front ? g.D + 1.75 : p.drop.y + 1.9;
      // anti-fatigue mat where the operator stands
      add(op.x + op.y - 1.2, () => this.quadTop(op.x - 0.55, op.y - 0.45, op.x + 0.55, op.y + 0.45, 0.02, '#10161f', '#2a3546', 1));
      add(x0 + y0, () => {
        this.box(x0, y0, 0, x1, y1, CZ, '#3b4658', { top: '#252f3e' });
        // kick plate, access panel and black/yellow hazard edge along the working side
        if (front) { this.faceY(y1 + 0.002, x0 + 0.15, x1 - 0.15, 0.3, CZ - 0.5, '#344052', '#4b5a70'); this.faceY(y1 + 0.002, x0, x1, 0, 0.22, '#1f2733'); }
        else { this.faceX(x1 + 0.002, y0 + 0.15, y1 - 0.15, 0.3, CZ - 0.5, '#2c3746', '#435064'); this.faceX(x1 + 0.002, y0, y1, 0, 0.22, '#1a212c'); }
        for (let k = 0; k < 12; k++) {
          const a = k / 12, b2 = (k + 1) / 12, fill = k % 2 ? '#111827' : '#facc15';
          if (front) this.faceY(y1 + 0.003, x0 + (x1 - x0) * a, x0 + (x1 - x0) * b2, CZ - 0.25, CZ, fill);
          else this.faceX(x1 + 0.003, y0 + (y1 - y0) * a, y0 + (y1 - y0) * b2, CZ - 0.25, CZ, k % 2 ? '#0b1220' : '#d4a90f');
        }
        // bins on the port conveyor; the one presented slides in from the infeed
        const sz = this.portBinSize(p);
        p.inQ.forEach((q, k) => {
          const f = Math.min(1, q.t / sim.cfg.conveyorStep), a = pp.entry[0], b = pp.entry[1];
          const t = k === 0 ? f : 0;
          this.drawBin(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, CZ, q.bin.id, sz.q);
        });
        if (p.pick) {
          const ln = p.currentLine, q = this.pickPos(p);
          this.drawBin(q.x, q.y, CZ, p.pick.id, Object.assign({ open: true, hl: ln ? ln.comp : -1 }, sz.pick));
          if (ln) this.glow(pp.pick.x, pp.pick.y, CZ + 1, 30, '#4ade80', 0.25);
        }
        p.outQ.forEach((b, k) => { const e = pp.exit[k === 0 ? 1 : 0]; this.drawBin(e.x, e.y, CZ, b.id, sz.q); });
        // operator HMI screen on a post, showing the pick instruction when a job is open
        const sx = front ? p.drop.x + 1.75 : g.W + 1.9, sy = front ? g.D + 1.95 : p.drop.y + 1.75;
        this.box(sx - 0.03, sy - 0.03, 0, sx + 0.03, sy + 0.03, 3.4, '#475569');
        this.box(sx - 0.28, sy - 0.06, 3.3, sx + 0.28, sy + 0.04, 4.6, '#0f172a');
        this.faceY(sy + 0.045, sx - 0.24, sx + 0.24, 3.4, 4.5, p.job ? '#0c4a6e' : '#111c2e');
        if (p.job) {
          this.faceY(sy + 0.05, sx - 0.2, sx + 0.05, 4.2, 4.38, '#e0f2fe');
          this.faceY(sy + 0.05, sx - 0.2, sx + 0.18, 3.85, 4.05, '#4ade80');
          this.faceY(sy + 0.05, sx - 0.2, sx + 0.1, 3.55, 3.7, '#7dd3fc');
        }
        // stack light: green = working, amber = waiting for bins, off = idle
        const lx = front ? x0 + 0.12 : g.W + 0.12, ly = front ? g.D + 0.12 : y0 + 0.12;
        this.box(lx - 0.04, ly - 0.04, CZ, lx + 0.04, ly + 0.04, CZ + 2.2, '#64748b');
        const starving = !p.job && !p.inQ.length && p.demand() > 0, lamps = [['#ef4444', false], ['#f59e0b', starving], ['#22c55e', !!p.job]];
        lamps.forEach(([lc, on], k) => {
          const z = CZ + 2.2 + k * 0.42;
          this.box(lx - 0.09, ly - 0.09, z, lx + 0.09, ly + 0.09, z + 0.4, on ? lc : shade(lc, -0.65), on ? { top: shade(lc, 0.4) } : {});
          if (on) this.glow(lx, ly, z + 0.2, 16, lc, 0.55);
        });
      });
    }

    // ---------------------------------------------------------------- robot arm
    // Where a station's robot arm is (it stands where the operator would): a
    // column at base, a boom over to the tip, which swings between the
    // storage unit at the pick position and the order tote of the current
    // line, low at either end and high in between, holding an item on the way
    // over. While an operator helps out with a line the arm waits, raised,
    // and the operator (helper) steps up beside it.
    armPose(p) {
      const sim = this.sim, L = sim.layout, base = L.operatorPos(p), pick = L.pickPos(p), CZ = this.CZ, j = p.job, ln = p.currentLine;
      const front = p.face === 'front', helper = front ? { x: base.x + 0.7, y: base.y } : { x: base.x, y: base.y + 0.7 };
      const rest = { x: (base.x + pick.x) / 2, y: (base.y + pick.y) / 2, z: CZ + 2.0, hold: false };
      if (!j || !ln || p.mode !== 'auto' || ln.assist) return { base, tip: rest, helper, assist: !!(j && ln && ln.assist && p.mode === 'auto') };
      const ph = (Math.max(0, j.t - ln.start - 0.5) / sim.cfg.armPerUnit) % 1, s = 0.5 - 0.5 * Math.cos(2 * Math.PI * ph);
      const q = ln.order ? L.slotPos(p, ln.order.slot) : pick;
      return { base, helper, assist: false, color: `hsl(${(parseInt(ln.gtin.slice(7, 12), 10) * 47) % 360},55%,60%)`, tip: { x: pick.x + (q.x - pick.x) * s, y: pick.y + (q.y - pick.y) * s, z: CZ + 0.9 + 1.4 * Math.sin(Math.PI * s), hold: ph > 0.08 && ph < 0.5 } };
    }
    // A decanting cell: the case opener stands beside where the operator
    // would (src), the arm (at base) carries each opened carton over the
    // storage unit, tips it while the goods pour in, and goes back empty.
    // While an operator decants an item the cell cannot tip, the arm waits.
    decantPose(p) {
      const L = this.sim.layout, base = L.operatorPos(p), pick = L.pickPos(p), CZ = this.CZ, j = p.job, ln = p.currentLine, front = p.face === 'front';
      const src = front ? { x: base.x + 0.9, y: base.y - 0.15 } : { x: base.x - 0.15, y: base.y + 0.9 };
      const helper = front ? { x: base.x - 0.75, y: base.y } : { x: base.x, y: base.y - 0.75 };
      const out = { base, src, helper, assist: false, carton: true, tip: { x: src.x, y: src.y, z: CZ + 1.6, hold: false } };
      if (!j || !ln || p.mode !== 'auto') return out;
      if (ln.assist) return Object.assign(out, { assist: true });
      const f = Math.min(1, Math.max(0, (j.t - ln.start) / Math.max(0.1, ln.at - ln.start))), ease = (u) => u * u * (3 - 2 * u);
      const s = f < 0.35 ? ease(f / 0.35) : f < 0.8 ? 1 : 1 - ease((f - 0.8) / 0.2);
      out.tip = { x: src.x + (pick.x - src.x) * s, y: src.y + (pick.y - src.y) * s, z: CZ + 1.6, hold: f < 0.8 };
      out.pour = f >= 0.35 && f < 0.8 ? (f - 0.35) / 0.45 : 0;
      out.color = `hsl(${(parseInt(ln.gtin.slice(7, 12), 10) * 47) % 360},55%,60%)`;
      return out;
    }
    drawCaseOpener(a) {
      const s = a.src, CZ = this.CZ;
      this.box(s.x - 0.32, s.y - 0.32, 0, s.x + 0.32, s.y + 0.32, CZ + 0.5, '#64748b', { top: '#334155' });
      this.faceY(s.y + 0.322, s.x - 0.22, s.x + 0.22, CZ - 0.6, CZ + 0.2, '#0f172a');
      this.glow(s.x, s.y + 0.32, CZ - 0.2, 12, '#f87171', 0.5); // cutter
      if (!a.tip.hold || a.assist) this.parcel(s.x - 0.18, s.y - 0.15, s.x + 0.18, s.y + 0.15, CZ + 0.5, 0.45); // next carton waiting
    }
    drawArm(a) {
      const P = this.P.bind(this), b = a.base, t = a.tip, top = this.CZ + 2.6;
      this.box(b.x - 0.26, b.y - 0.26, 0, b.x + 0.26, b.y + 0.26, 0.35, '#334155');
      this.box(b.x - 0.11, b.y - 0.11, 0.35, b.x + 0.11, b.y + 0.11, top, '#f59e0b');
      this.box(b.x - 0.07, b.y - 0.13, top - 1.1, b.x + 0.07, b.y - 0.11, top - 0.8, '#0f172a'); // vision camera
      this.line(P(b.x, b.y, top + 0.05), P(t.x, t.y, top + 0.05), '#b45309', 8);
      this.line(P(b.x, b.y, top + 0.05), P(t.x, t.y, top + 0.05), '#f59e0b', 5);
      this.box(t.x - 0.08, t.y - 0.08, top - 0.12, t.x + 0.08, t.y + 0.08, top + 0.15, '#d97706');
      this.line(P(t.x, t.y, top - 0.1), P(t.x, t.y, t.z + 0.22), '#94a3b8', 3);
      this.box(t.x - 0.09, t.y - 0.09, t.z, t.x + 0.09, t.y + 0.09, t.z + 0.22, '#475569');
      if (t.hold && a.carton) {
        this.parcel(t.x - 0.18, t.y - 0.15, t.x + 0.18, t.y + 0.15, t.z - 0.45, 0.45);
        // the goods pouring out of the tipped carton into the storage unit
        if (a.pour) for (let k = 0; k < 3; k++) { const z = t.z - 0.5 - ((a.pour * 3 + k / 3) % 1) * 1.2; this.box(t.x - 0.05 + k * 0.05, t.y - 0.04, z, t.x + k * 0.05, t.y + 0.04, z + 0.1, '#888888', { top: a.color, left: a.color, right: a.color }); }
      } else if (t.hold) this.box(t.x - 0.08, t.y - 0.07, t.z - 0.3, t.x + 0.08, t.y + 0.07, t.z, '#888888', { top: a.color, left: a.color, right: a.color });
    }

    // ---------------------------------------------------------------- packing
    // Manual pack bench: steel frame, shelf with flat-packed cartons, light worktop.
    drawPackBench(pk, q) {
      for (const [lx, ly] of [[-0.95, -0.5], [0.87, -0.5], [-0.95, 0.42], [0.87, 0.42]]) this.box(q.x + lx, q.y + ly, 0, q.x + lx + 0.08, q.y + ly + 0.08, 1.9, '#64748b');
      this.box(q.x - 0.95, q.y - 0.5, 0.45, q.x + 0.95, q.y + 0.5, 0.55, '#475569');
      for (let k = 0; k < 4; k++) this.box(q.x - 0.85, q.y - 0.4, 0.55 + k * 0.12, q.x + 0.1, q.y + 0.4, 0.65 + k * 0.12, '#b8875a', { top: '#cfa271' });
      this.box(q.x - 1.0, q.y - 0.55, 1.9, q.x + 1.0, q.y + 0.55, 2.1, '#94a3b8', { top: '#e7dccb', left: '#cbd5e1' });
      // monitor on a pole, label printer, tape dispenser
      this.box(q.x - 0.85, q.y - 0.5, 2.1, q.x - 0.79, q.y - 0.44, 3.6, '#475569');
      this.box(q.x - 0.98, q.y - 0.52, 3.3, q.x - 0.5, q.y - 0.44, 4.3, '#0f172a');
      this.faceY(q.y - 0.435, q.x - 0.95, q.x - 0.53, 3.38, 4.22, pk.cur ? '#0c4a6e' : '#111c2e');
      this.box(q.x + 0.5, q.y - 0.45, 2.1, q.x + 0.92, q.y - 0.08, 2.75, '#e2e8f0', { top: '#f8fafc' });
      this.faceY(q.y - 0.079, q.x + 0.55, q.x + 0.87, 2.45, 2.55, '#0f172a');
      this.box(q.x + 0.55, q.y + 0.15, 2.1, q.x + 0.85, q.y + 0.35, 2.4, '#dc2626');
      this.discX(q.x + 0.851, q.y + 0.25, 2.45, 0.1, 0.22, '#d6b07a');
      if (pk.cur) {
        const f = pk.t / pk.dur;
        if (f < 0.6) this.orderTote(q.x - 0.45, q.y, 2.1, 1 - f / 0.6);
        const h = 0.25 + Math.min(1, f * 1.6) * 0.55;
        if (f < 0.6) this.tote(q.x - 0.05, q.y - 0.25, q.x + 0.45, q.y + 0.25, 2.1, h, '#b8875a');
        else this.parcel(q.x - 0.05, q.y - 0.25, q.x + 0.45, q.y + 0.25, 2.1, 0.8, { label: f > 0.8 });
      }
    }
    // Auto-bagger: a tall cabinet with the film roll on top; the operator
    // drops the items in from the shelf beside it, a sealed bag drops out
    // onto the parcel conveyor.
    drawBagger(pk, q) {
      const f = pk.cur ? pk.t / pk.dur : 0;
      this.box(q.x - 0.75, q.y - 0.45, 0, q.x + 0.05, q.y + 0.4, 3.7, '#334155', { top: '#475569' });
      this.box(q.x - 0.7, q.y - 0.3, 3.7, q.x + 0.0, q.y + 0.2, 4.15, '#e5e7eb', { top: '#f8fafc', right: '#cbd5e1' }); // film roll
      this.faceX(q.x + 0.001, q.y - 0.3, q.y + 0.2, 3.82, 4.03, '#94a3b8');
      this.faceY(q.y + 0.402, q.x - 0.6, q.x - 0.15, 2.6, 3.3, pk.cur ? '#0c4a6e' : '#111c2e');
      this.faceY(q.y + 0.403, q.x - 0.62, q.x - 0.08, 1.15, 1.7, '#0b1220'); // bag outlet
      if (pk.cur) this.glow(q.x - 0.35, q.y + 0.4, 3.0, 16, '#22c55e', 0.45);
      // loading shelf with the order tote
      for (const [lx, ly] of [[0.82, -0.4], [0.82, 0.35]]) this.box(q.x + lx, q.y + ly, 0, q.x + lx + 0.08, q.y + ly + 0.08, 1.9, '#64748b');
      this.box(q.x + 0.05, q.y - 0.4, 1.9, q.x + 0.9, q.y + 0.43, 2.1, '#94a3b8', { top: '#e7dccb', left: '#cbd5e1' });
      if (pk.cur && f < 0.6) this.orderTote(q.x + 0.47, q.y, 2.1, 1 - f / 0.6);
      if (pk.cur && f >= 0.6) this.bag(q.x - 0.35, q.y + 0.6, 1.4, f > 0.85);
    }
    // Box-making machine: an enclosure with a window, the fanfold cardboard
    // bale on top and an induction conveyor where the operator lays the items;
    // inside, a carton is cut to size around them.
    drawBoxMaker(pk, q) {
      const f = pk.cur ? pk.t / pk.dur : 0;
      this.box(q.x - 1.1, q.y - 0.55, 0, q.x + 0.35, q.y + 0.45, 3.1, '#cbd5e1', { left: '#94a3b8', right: '#64748b', top: '#475569' });
      this.box(q.x - 1.0, q.y - 0.45, 3.1, q.x + 0.0, q.y + 0.3, 3.65, '#b8875a', { top: '#d2a676' }); // cardboard bale
      for (let k = 1; k < 5; k++) this.faceY(q.y + 0.301, q.x - 1.0, q.x, 3.1 + k * 0.11, 3.12 + k * 0.11, '#8a623f');
      this.faceY(q.y + 0.452, q.x - 0.95, q.x + 0.2, 1.1, 2.7, 'rgba(15,23,42,0.85)'); // window
      if (pk.cur && f > 0.3) { const w = Math.min(1, (f - 0.3) / 0.4); this.faceY(q.y + 0.455, q.x - 0.6, q.x - 0.6 + 0.6 * w, 1.3, 1.3 + 0.7 * w, '#b8875a'); }
      this.hazardY(q.y + 0.453, q.x - 1.1, q.x + 0.35, 0, 0.18, 10);
      if (pk.cur) this.glow(q.x - 0.4, q.y + 0.45, 2.9, 18, '#22c55e', 0.45);
      // induction conveyor on the right, the order tote on it while it is emptied
      this.box(q.x + 0.35, q.y - 0.3, 1.6, q.x + 1.0, q.y + 0.35, 1.85, '#334155', { top: '#1f2937' });
      for (const [lx, ly] of [[0.9, -0.28], [0.9, 0.27]]) this.box(q.x + lx, q.y + ly, 0, q.x + lx + 0.06, q.y + ly + 0.06, 1.6, '#475569');
      if (pk.cur && f < 0.5) this.orderTote(q.x + 0.68, q.y + 0.03, 1.85, 1 - f / 0.5, 0.8);
      if (pk.cur && f >= 0.85) this.parcel(q.x - 0.55, q.y + 0.5, q.x - 0.1, q.y + 0.85, 1.4, 0.55, { label: true });
    }
    // Sealed poly bag with a label (flat, slightly puffed).
    bag(x, y, z, label) {
      this.box(x - 0.2, y - 0.15, z, x + 0.2, y + 0.15, z + 0.22, '#e2e8f0', { top: '#f1f5f9', left: '#cbd5e1', right: '#94a3b8' });
      if (label) this.quadTop(x - 0.12, y - 0.08, x + 0.04, y + 0.08, z + 0.221, '#ffffff', '#64748b', 0.6);
    }

    // Stations, packing and dock. `items` lets a subclass mix its own floor
    // objects into the same painter's ordering.
    drawStations(items = []) {
      const sim = this.sim, g = sim.grid, L = sim.layout, oms = sim.oms;
      const add = (d, fn) => items.push({ d, fn }), CZ = this.CZ;

      // takeaway conveyor + spurs
      const picks = sim.ports.filter((p) => p.kind === 'PICK');
      const lastPk = L.packerPos(oms.packers.length - 1);
      add(g.D + 2, () => {
        this.conveyor([{ x: 1.2, y: L.takeawayY }, { x: lastPk.x, y: L.takeawayY }], 0.5, 1.6);
        for (const p of picks) this.conveyor([{ x: L.spurX(p), y: L.slotPos(p, 0).y }, { x: L.spurX(p), y: L.takeawayY - 0.25 }], 0.45, 1.6);
        for (const pk of oms.packers) { const q = L.packerPos(pk.idx); this.conveyor([{ x: q.x, y: L.takeawayY + 0.25 }, { x: q.x, y: q.y - 0.75 }], 0.45, 1.6); }
      });
      // parcel line to the dock
      add(g.D + 5, () => {
        for (const pk of oms.packers) this.conveyor(L.parcelRoute(pk.idx).slice(0, 2), 0.45, 1.4, '#2b3646');
        const r = L.parcelRoute(0);
        this.conveyor([{ x: L.packerPos(0).x, y: r[1].y }, r[2], r[3]], 0.45, 1.4, '#2b3646');
      });

      for (const p of sim.ports) {
        const op = L.operatorPos(p);
        this.drawPortBody(p, add);
        if (p.decanter) {
          const a = this.decantPose(p);
          add(a.src.x + a.src.y, () => this.drawCaseOpener(a));
          add(op.x + op.y + 0.5, () => this.drawArm(a));
          if (a.assist) add(a.helper.x + a.helper.y + 0.5, () => this.drawOperator(a.helper.x, a.helper.y, true, '#22c55e'));
        } else if (p.arm) {
          const a = this.armPose(p);
          add(op.x + op.y + 0.5, () => this.drawArm(a));
          if (a.assist) add(a.helper.x + a.helper.y + 0.5, () => this.drawOperator(a.helper.x, a.helper.y, true, '#f97316'));
        } else add(op.x + op.y + 0.5, () => this.drawOperator(op.x, op.y, !!(p.job && p.job.next < p.job.lines.length && p.mode === 'auto'), p.kind === 'PICK' ? '#f97316' : '#22c55e'));
        if (p.kind === 'PICK') {
          const s0 = L.slotPos(p, 0);
          add(s0.x + s0.y, () => {
            const wx0 = s0.x - 0.3, wx1 = L.slotPos(p, p.slots.length - 1).x + 0.34, wy0 = s0.y - 0.35, wy1 = s0.y + 0.35;
            this.box(wx0, wy0, 0, wx1, wy1, CZ - 0.1, '#334155');
            for (const xx of [wx0, wx1 - 0.08]) this.box(xx, wy0, CZ, xx + 0.08, wy0 + 0.08, 4.6, '#64748b');
            this.box(wx0, wy0, 4.5, wx1, wy0 + 0.1, 4.7, '#64748b');
            const ln = p.currentLine;
            p.slots.forEach((o, k) => {
              const q = L.slotPos(p, k);
              if (o) {
                const units = oms.units(o), picked = o.lines.reduce((s, l) => s + l.picked, 0);
                this.orderTote(q.x, q.y, CZ, picked / units);
              }
              const target = ln && ln.order === o;
              const lc = target ? '#4ade80' : o ? '#e2e8f0' : '#334155';
              this.box(q.x - 0.1, wy0, 4.15, q.x + 0.1, wy0 + 0.12, 4.4, lc);
              if (target) this.glow(q.x, wy0, 4.3, 26, '#4ade80', 0.65 + 0.3 * Math.sin(this.t * 9));
            });
          });
        } else {
          // supplier pallets awaiting decant
          const open = oms.receipts.filter((r) => r.status !== 'RECEIVED').reduce((s, r) => s + r.lines.length, 0);
          const px = g.W + 3.4, py = p.drop.y - 0.6;
          add(px + py, () => {
            for (let k = 0; k < 2; k++) {
              const yy = py + k * 1.6;
              // wooden pallet: deck boards on three blocks
              for (const bx of [0, 0.5, 1.0]) this.box(px + bx, yy, 0, px + bx + 0.2, yy + 1.2, 0.25, '#8a5a1c');
              for (let s2 = 0; s2 < 5; s2++) this.box(px, yy + s2 * 0.25, 0.25, px + 1.2, yy + s2 * 0.25 + 0.2, 0.4, '#b07a2e', { top: '#c9933f' });
              const n = Math.max(0, Math.min(8, open - k * 8));
              for (let j = 0; j < n; j++) {
                const cx = px + 0.05 + (j % 2) * 0.56, cy = yy + 0.05 + (((j >> 1) % 2) * 0.56), cz = 0.4 + Math.floor(j / 4) * 1.1;
                this.parcel(cx, cy, cx + 0.53, cy + 0.53, cz, 1.05);
              }
            }
          });
        }
      }

      // pack stations: queued totes on the spur behind, the bench or machine, the operator
      for (const pk of oms.packers) {
        const q = L.packerPos(pk.idx);
        add(q.x + q.y, () => {
          for (let k = Math.min(pk.queue.length, 3) - 1; k >= 0; k--) this.orderTote(q.x, q.y - 1.05 - k * 0.0, 1.6 + k * 0.85, 0.8, 0.9);
          if (pk.kind === 'bagger') this.drawBagger(pk, q); else if (pk.kind === 'boxer') this.drawBoxMaker(pk, q); else this.drawPackBench(pk, q);
        });
        const opq = L.packerOperator(pk);
        add(opq.x + opq.y, () => this.drawOperator(opq.x, opq.y, !!pk.cur, '#38bdf8'));
      }

      // dock + truck
      const d = L.dock(), tr = oms.truck;
      add(d.x + d.y, () => {
        this.box(d.x - 0.9, d.y - 1.3, 0, d.x + 0.1, d.y + 1.3, 1.2, '#374151', { top: '#4b5563' });
        const off = tr.departing > 0 ? Math.pow(tr.departing, 2) * 0.25 : 0;
        const tx = d.x + 0.25 + off, carrierCol = { PCL: '#0ea5e9', EXP: '#ef4444', ECO: '#22c55e' }[tr.carrier.code];
        this.box(tx, d.y - 1.0, 0.8, tx + 4.5, d.y + 1.0, 7.2, '#e5e7eb', { left: '#cbd5e1', right: '#94a3b8', top: '#f8fafc' });
        for (const wx of [tx + 0.7, tx + 1.5]) this.wheelY(wx, d.y + 1.01, 0.75, 0.32, 0.75);
        this.box(tx + 4.6, d.y - 0.95, 0.6, tx + 5.8, d.y + 0.95, 5.2, carrierCol, { top: shade(carrierCol, 0.25) }); // cab
        this.faceY(d.y + 0.951, tx + 5.0, tx + 5.65, 3.4, 4.8, '#0f2236'); // side window
        this.faceX(tx + 5.801, d.y - 0.8, d.y + 0.8, 3.3, 4.9, '#13283e'); // windscreen
        this.faceX(tx + 5.802, d.y - 0.8, d.y + 0.8, 1.0, 1.5, '#1f2937'); // grille
        for (const yy of [d.y - 0.7, d.y + 0.7]) this.discX(tx + 5.803, yy, 1.25, 0.12, 0.25, '#fde68a');
        this.wheelY(tx + 5.2, d.y + 0.96, 0.75, 0.32, 0.75);
        const P = this.P.bind(this);
        this.poly([P(tx + 0.3, d.y + 1.0, 5.6), P(tx + 4.2, d.y + 1.0, 5.6), P(tx + 4.2, d.y + 1.0, 6.4), P(tx + 0.3, d.y + 1.0, 6.4)], carrierCol);
        const fill = Math.min(1, tr.parcels.length / sim.cfg.truckCapacity);
        this.text(`${tr.carrier.name} · ${tr.parcels.length}/${sim.cfg.truckCapacity}`, tx + 2.3, d.y + 1.0, 4.0, { size: 10, color: '#0f172a', weight: 700 });
        this.poly([P(tx + 0.3, d.y + 1.0, 1.2), P(tx + 0.3 + 3.9 * fill, d.y + 1.0, 1.2), P(tx + 0.3 + 3.9 * fill, d.y + 1.0, 1.7), P(tx + 0.3, d.y + 1.0, 1.7)], '#b08850');
      });

      // totes and parcels on conveyors
      for (const it of oms.conveyor) {
        const q = oms.posOnPath(it);
        add(q.x + q.y + 0.3, () => {
          if (it.kind === 'tote') this.orderTote(q.x, q.y, 1.6, 1, 0.85);
          else if (it.order.pack === 'bagger') this.bag(q.x, q.y, 1.4, true);
          else this.parcel(q.x - 0.18, q.y - 0.16, q.x + 0.18, q.y + 0.16, 1.4, 0.6, { label: true });
        });
      }
      items.sort((a, b) => a.d - b.d);
      for (const it of items) it.fn();
    }

    drawLabels() {
      const sim = this.sim, g = sim.grid, L = sim.layout;
      for (const p of sim.ports) {
        const pos = p.face === 'front' ? { x: p.drop.x + 1, y: g.D + 0.2 } : { x: g.W + 0.2, y: p.drop.y + 1 };
        const st = p.job ? (p.mode === 'manual' ? 'MANUAL' : 'ACTIVE') : p.inQ.length ? 'INBOUND' : 'WAITING';
        this.text(`${p.code} ${p.kind === 'PICK' ? (p.arm ? 'ROBOT PICK' : 'PICK') : p.decanter ? 'AUTO GOODS-IN' : 'GOODS-IN'} · ${st}`, pos.x, pos.y, 6.2, { size: 10, bg: 'rgba(15,23,42,0.82)', color: p.kind === 'PICK' ? '#fdba74' : '#86efac' });
      }
      for (const pk of sim.oms.packers) {
        const q = L.packerPos(pk.idx);
        this.text(`${pk.name} · ${pk.queue.length} queued`, q.x, q.y, 4.6, { size: 10, bg: 'rgba(15,23,42,0.82)', color: '#7dd3fc' });
      }
      const d = L.dock();
      this.text('OUTBOUND DOCK', d.x - 0.4, d.y + 1.6, 1.5, { size: 10, bg: 'rgba(15,23,42,0.82)', color: '#e2e8f0' });
      this.text('GOODS RECEIVING', g.W + 4, (g.ports.find((p) => p.kind === 'GOODS_IN') || { drop: { y: 2 } }).drop.y + 1.4, 3.2, { size: 10, bg: 'rgba(15,23,42,0.82)', color: '#86efac' });
    }
  }

  WS.IsoRenderer = IsoRenderer;
})((globalThis.WS = globalThis.WS || {}));
