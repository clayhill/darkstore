/* Isometric view of ZoneHop: the conveyors with their order totes, the
 * A-frame with its channels emptying and the windows on its belt, the
 * pick-to-light flow racks lighting the location to pick, the carousels
 * turning, the RF shelving with the pickers and their carts, the merge,
 * the closing line's machines, the route lanes with the stacked totes and
 * the vans, and the tote return with the emptier and the de-stacker. */
(function (WS) {
  'use strict';
  const CZ = 2.2, AZ = 2.3, RZ = 2.6; // conveyor height, A-frame belt, tote return (render levels)
  const TOTE = { order: '#2563eb', rf: '#f59e0b', empty: '#64748b' };
  const hue = (gtin) => (parseInt(gtin.slice(7, 12), 10) * 47) % 360;

  class ZoneRenderer extends WS.IsoRenderer {
    worldBounds() {
      const g = this.sim.grid, pts = [this.P(-1, -1, 8), this.P(g.W + 1, -1, 0), this.P(-1, g.D + 1, 0), this.P(g.W + 1, g.D + 1, 0), this.P(g.W + 1, -1, 8)];
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    }

    drawScene(alpha) {
      const sim = this.sim, g = sim.grid, P = this.P.bind(this), items = [], add = (d, fn) => items.push({ d, fn });
      this.poly([P(-1, -1, 0), P(g.W + 1, -1, 0), P(g.W + 1, g.D + 1, 0), P(-1, g.D + 1, 0)], '#1a2332');
      this.ctx.globalAlpha = 0.5;
      for (let x = 0; x <= g.W; x += 2) this.line(P(x, -1, 0), P(x, g.D + 1, 0), '#222d3f', 1);
      for (let y = 0; y <= g.D; y += 2) this.line(P(-1, y, 0), P(g.W + 1, y, 0), '#222d3f', 1);
      this.ctx.globalAlpha = 1;
      this.drawMarkings();
      for (const b of sim.net.belts) this.addBelt(b, add);
      this.addAframe(add);
      for (const z of sim.zones) z.kind === 'carousel' ? this.addCarousels(z, add) : this.addPtl(z, add);
      this.addRf(add, alpha);
      this.addMerge(add);
      this.addClosing(add);
      this.addLanes(add);
      this.addStart(add);
      // order totes on the belts
      for (const b of sim.net.belts) for (const t of b.totes) {
        const x = t.px + (t.x - t.px) * alpha, y = t.py + (t.y - t.py) * alpha, z = b.kind === 'return' ? RZ : b === sim.belts.check ? CZ : CZ;
        add(x + y + 0.35, () => this.drawTote(t, x, y, z, Math.abs(t.dx) > 0.5));
      }
      items.sort((a, b) => a.d - b.d);
      for (const it of items) it.fn();
    }
    // walkways and the zones' floor marking
    drawMarkings() {
      const sim = this.sim, g = sim.grid, P = this.P.bind(this), c = this.ctx;
      c.setLineDash([6, 6]);
      for (const y of [g.AY - 1.0, g.AY + 1.0]) this.line(P(g.AX - 1.4, y, 0), P(g.AX + g.afLen + 1.4, y, 0), 'rgba(250,204,21,0.35)', 2);
      c.setLineDash([]);
      for (const z of sim.zones) this.quadTop(z.dx - 4.4, g.LB + 1, z.dx + 1.4, z.kind === 'carousel' ? g.caroEnd + 0.3 : g.LB + g.SD + 2.3, 'rgba(34,197,94,0.05)', 'rgba(34,197,94,0.25)', 1);
      this.quadTop(g.SX + 11.1, -0.5, g.W + 0.6, g.D + 0.5, 'rgba(15,23,42,0.6)');
    }
    // A belt in short pieces, so totes and machines sort in between.
    addBelt(b, add) {
      const z = b.kind === 'return' ? RZ : CZ, col = b.kind === 'loop' ? '#2f3d52' : b.kind === 'lane' ? '#3a3420' : '#334155';
      for (let k = 1; k < b.pts.length; k++) {
        const a = b.pts[k - 1], e = b.pts[k], n = Math.max(1, Math.ceil(Math.hypot(e.x - a.x, e.y - a.y) / 2));
        for (let j = 0; j < n; j++) {
          const p0 = { x: a.x + ((e.x - a.x) * j) / n, y: a.y + ((e.y - a.y) * j) / n }, p1 = { x: a.x + ((e.x - a.x) * (j + 1)) / n, y: a.y + ((e.y - a.y) * (j + 1)) / n };
          add(Math.min(p0.x + p0.y, p1.x + p1.y) - 0.3, () => this.conveyor([p0, p1], 0.7, z, col, { legs: true }));
        }
      }
    }
    // An order tote: blue, an RF tote amber, an empty one back from a van grey;
    // closed once the lid is on, a white label once labelled.
    drawTote(t, x, y, z, alongX) {
      const w = alongX ? 0.38 : 0.26, d = alongX ? 0.26 : 0.38, col = TOTE[t.kind] || TOTE.empty, h = 0.9;
      const fill = t.kind === 'empty' ? 0 : Math.min(1, (t.units || 0) / 25);
      this.tote(x - w, y - d, x + w, y + d, z, h, col, t.lid ? { closed: true } : {
        contents: (zf) => {
          const n = Math.ceil(fill * 4);
          for (let k = 0; k < n; k++) {
            const ya = y - d + 0.06 + ((2 * d - 0.12) * (k >> 1)) / 2, xa = x - w + 0.05 + ((2 * w - 0.1) * (k & 1)) / 2, hh = (k * 97 + 30) % 360;
            this.box(xa + 0.01, ya + 0.01, zf, xa + (2 * w - 0.1) / 2 - 0.01, ya + (2 * d - 0.12) / 2 - 0.01, zf + 0.4, '#888', { top: `hsl(${hh},55%,64%)`, left: `hsl(${hh},50%,52%)`, right: `hsl(${hh},45%,40%)` });
          }
        },
      });
      if (t.lid) this.box(x - w - 0.02, y - d - 0.02, z + h, x + w + 0.02, y + d + 0.02, z + h + 0.12, WS.shade(col, -0.1), { top: WS.shade(col, 0.15) });
      if (t.sscc) { if (alongX) this.faceY(y + d + 0.003, x - w * 0.4, x + w * 0.5, z + 0.2, z + 0.65, '#f8fafc'); else this.faceX(x + w + 0.003, y - d * 0.4, y + d * 0.5, z + 0.2, z + 0.65, '#f8fafc'); }
      const s = this.selected;
      if (s && s.tote && (s.tote === t || (t.order && s.tote.order === t.order))) { this.quadTop(x - w - 0.06, y - d - 0.06, x + w + 0.06, y + d + 0.06, z + h + 0.16, null, '#38bdf8', s.tote === t ? 3 : 1.5); if (s.tote === t) this.glow(x, y, z + h + 0.5, 22, '#38bdf8', 0.5); }
    }

    // ---------------------------------------------------------------- A-frame
    // The frame: two sloping faces of channels over the belt, each channel
    // showing how full it is; windows on the belt with the units dispensed
    // into them; the tip chute into the tote at the end; refill operators.
    addAframe(add) {
      const sim = this.sim, g = sim.grid, c = sim.cfg, P = this.P.bind(this), x0 = g.AX, x1 = g.AX + g.afLen, y = g.AY, top = 6.2, foot = AZ + 0.6, half = 0.75;
      const toX = (b) => g.AX + b / c.cellSize;
      // back face (side 0), behind the belt
      add(x0 + y - 0.9, () => {
        for (const xx of [x0, x1]) { this.box(xx - 0.06, y - half, 0, xx + 0.06, y - half + 0.1, foot, '#475569'); this.box(xx - 0.06, y + half - 0.1, 0, xx + 0.06, y + half, foot, '#475569'); }
        this.poly([P(x0, y - half, foot), P(x1, y - half, foot), P(x1, y, top), P(x0, y, top)], '#1e3a5f', '#334155', 1);
        this.channels(0, x0, y, half, foot, top);
      });
      // the belt with its windows
      add(x0 + y - 0.1, () => {
        this.box(x0 - 0.3, y - 0.32, AZ - 0.35, x1 + 0.3, y + 0.32, AZ, '#1f2937', { top: '#0b1220' });
        for (const w of sim.windows) {
          const xc = toX(w.b), hw = c.windowLength / c.cellSize / 2 - 0.05;
          this.quadTop(Math.max(x0 - 0.3, xc - hw), y - 0.28, Math.min(x1 + 0.3, xc + hw), y + 0.28, AZ + 0.01, 'rgba(56,189,248,0.10)', 'rgba(56,189,248,0.55)', 1);
          for (let k = 0; k < Math.min(w.units, 24); k++) { const ux = xc - hw + 0.15 + (k % 8) * ((2 * hw - 0.3) / 8), uy = y - 0.18 + Math.floor(k / 8) * 0.16, hh = (k * 53 + w.order.id.length * 31) % 360; this.box(ux, uy, AZ, ux + 0.12, uy + 0.1, AZ + 0.18, '#888', { top: `hsl(${hh},55%,62%)`, left: `hsl(${hh},50%,50%)`, right: `hsl(${hh},45%,38%)` }); }
        }
        // units falling from a channel into the window under it
        for (const e of sim.ejects) {
          const f = (sim.time - e.t) / 0.35;
          if (f < 0 || f > 1) continue;
          const ch = e.ch, sy = ch.side ? y + half * 0.4 : y - half * 0.4, zz = foot + 1.2 - f * (foot + 1.2 - AZ), hh = hue(ch.comps[0].gtin || '0000000000000');
          this.box(ch.wx - 0.06, sy + (y - sy) * f - 0.05, zz, ch.wx + 0.06, sy + (y - sy) * f + 0.05, zz + 0.15, '#888', { top: `hsl(${hh},55%,62%)`, left: `hsl(${hh},50%,50%)`, right: `hsl(${hh},45%,38%)` });
        }
        // the tip chute from the end of the belt down to the tote
        this.poly([P(x1 + 0.3, y - 0.3, AZ), P(x1 + 0.3, y + 0.3, AZ), P(g.tipX + 0.3, g.SY - 0.3, CZ + 1.4), P(g.tipX - 0.3, g.SY - 0.3, CZ + 1.4)], '#475569', '#64748b', 1);
        if (!sim.afRunning && sim.windows.length) this.glow(x1, y, AZ + 1, 20, '#f59e0b', 0.6);
      });
      // front face (side 1), in front of the belt
      add(x0 + y + 0.9, () => {
        this.poly([P(x0, y + half, foot), P(x1, y + half, foot), P(x1, y, top), P(x0, y, top)], '#24476f', '#334155', 1);
        this.channels(1, x0, y, half, foot, top);
        this.box(x0 - 0.1, y - 0.08, top - 0.05, x1 + 0.1, y + 0.08, top + 0.12, '#64748b');
        const sel = this.selected && this.selected.kind === 'port' && sim.ports[this.selected.id] === sim.afPort;
        if (sel) this.quadTop(x0 - 0.5, y - 1.0, x1 + 0.5, y + 1.0, 0.03, null, '#38bdf8', 2.5);
      });
      for (const op of sim.refillers) {
        if (op.state === 'BREAK') continue;
        const x = op.px + (op.x - op.px) * 1, yy = op.y;
        add(x + yy + (yy > y ? 0.95 : -0.95), () => {
          this.drawOperator(x, yy, op.state === 'WORKING', '#a3e635', 0, 'refill ' + op.name);
          if (op.job) this.parcel(x + 0.2, yy - 0.2, x + 0.55, yy + 0.15, op.state === 'WORKING' ? 3.2 : 2.4, 0.5);
        });
      }
    }
    // The channels of one face as narrow strips: their fill, red when empty,
    // amber while waiting for a refill, green as they are being refilled.
    channels(side, x0, y, half, foot, top) {
      const sim = this.sim, c = sim.cfg, P = this.P.bind(this), sy = side ? 1 : -1, w = WS.ZONE_CHANNEL_PITCH / c.cellSize;
      for (const ch of sim.channels) {
        if (ch.side !== side) continue;
        const q = ch.comps[0].qty, f = q / ch.cap, xa = ch.wx - w * 0.42, xb = ch.wx + w * 0.42;
        const col = ch.jam ? '#dc2626' : q <= 0 ? '#7f1d1d' : ch.req && ch.req.op && ch.req.op.state === 'WORKING' ? '#22c55e' : ch.req ? '#f59e0b' : `hsl(${hue(ch.comps[0].gtin)},45%,58%)`;
        const at = (u) => ({ y: y + sy * half * (1 - u), z: foot + (top - foot) * u });
        const a = at(0.02), b = at(0.08 + 0.85 * f);
        this.poly([P(xa, a.y, a.z), P(xb, a.y, a.z), P(xb, b.y, b.z), P(xa, b.y, b.z)], col);
      }
    }

    // ---------------------------------------------------------------- zones
    // Pick-to-light: a flow rack wall behind the operator, a light per
    // location; the one to pick lights up with its quantity.
    addPtl(z, add) {
      const sim = this.sim, g = sim.grid, py = g.LB + g.SD, ry = py + 1.8, j = z.job, cur = j && j.cur, x0 = z.dx - 4.2, x1 = z.dx + 1.2, levels = 5;
      add(x0 + ry + 0.4, () => {
        this.box(x0, ry - 0.35, 0, x1, ry + 0.45, 0.3, '#334155');
        for (const xx of [x0, x1 - 0.08]) this.box(xx, ry - 0.35, 0, xx + 0.08, ry + 0.45, 5.6, '#1d4ed8');
        for (let lv = 0; lv < levels; lv++) {
          const zz = 0.6 + lv * 1.0;
          this.poly([this.P(x0, ry - 0.35, zz), this.P(x1, ry - 0.35, zz), this.P(x1, ry + 0.45, zz + 0.25), this.P(x0, ry + 0.45, zz + 0.25)], '#475569', '#64748b', 0.6);
        }
        for (const b of z.bins) {
          const zz = 0.6 + b.level * 1.0, w = 5.4 / b.bays / 2 - 0.03, qf = b.comps[0].qty / b.cap, hh = hue(b.comps[0].gtin);
          this.box(b.wx - w, ry - 0.3, zz + 0.02, b.wx + w, ry - 0.3 + 0.7 * Math.max(0.15, qf), zz + 0.5, '#888', { top: `hsl(${hh},45%,62%)`, left: `hsl(${hh},40%,50%)`, right: `hsl(${hh},35%,38%)` });
          const on = cur && cur.bin === b;
          this.box(b.wx - 0.06, ry - 0.37, zz - 0.18, b.wx + 0.06, ry - 0.35, zz - 0.02, on ? '#4ade80' : '#1f2937');
          if (on) { this.glow(b.wx, ry - 0.36, zz, 24, '#4ade80', 0.7 + 0.3 * Math.sin(this.t * 9)); this.text(String(cur.qty), b.wx, ry - 0.4, zz - 0.6, { size: 9, color: '#052e16', weight: 800, bg: 'rgba(134,239,172,0.95)' }); }
        }
        if (cur && cur.completion) this.text('completion', z.dx - 1.5, ry - 0.4, 6.0, { size: 9, color: '#fde68a', bg: 'rgba(15,23,42,0.85)' });
      });
      this.addZoneOperator(z, add, cur ? (cur.bin ? cur.bin.wx : z.dx + 0.6) : null);
      this.addZoneScreen(z, add);
    }
    // the operator's screen on a post beside the pick position, and the zone's outline when selected
    addZoneScreen(z, add) {
      const sim = this.sim, g = sim.grid, sx = z.pick.x + 1.15, sy = g.LB + g.SD + 0.7;
      add(sx + sy + 0.2, () => {
        this.box(sx - 0.03, sy - 0.03, 0, sx + 0.03, sy + 0.03, 3.4, '#475569');
        this.box(sx - 0.3, sy - 0.06, 3.3, sx + 0.3, sy + 0.04, 4.6, '#0f172a');
        this.screenFace('zone' + z.id, sx - 0.26, sx + 0.26, sy + 0.045, 3.4, 4.5, this.zoneScreen(z));
      });
      const s = this.selected;
      if (s && s.kind === 'port' && s.id === z.port.idx) add(-100, () => this.quadTop(z.dx - 4.4, g.LB + 1, z.dx + 1.4, z.kind === 'carousel' ? g.caroEnd + 0.3 : g.LB + g.SD + 2.3, null, '#38bdf8', 2.5));
    }
    // What a zone's screen shows (WS.paintScreen): the line to pick, from where, for which order.
    zoneScreen(z) {
      const sim = this.sim, p = z.port, j = z.job, title = `${p.code} · ${z.kind === 'carousel' ? 'Carousels' : 'Pick-to-light'}`;
      if (p.away) return WS.awayScreen(p, title);
      if (!j) { const n = z.in.totes.length; return { title, accent: n ? '#38bdf8' : '#64748b', big: n ? 'Tote coming' : 'Idle', name: n ? `${n} on the spur` : 'No tote for this zone', info: [] }; }
      const o = j.tote.order, left = j.queue.length + (j.queues ? j.queues.reduce((a, q) => a + q.length, 0) : 0), done = j.n - left - (j.cur ? 1 : 0);
      if (!j.cur) return { title, tag: `TOTE ${j.tote.id}`, accent: '#38bdf8', big: z.kind === 'carousel' ? 'Turning…' : 'Next line', name: o.id, info: [o.customer], bar: done / j.n };
      const x = j.cur, prod = sim.inv.byGtin.get(x.line.gtin), from = x.completion ? 'completion: from the reserve' : z.kind === 'carousel' ? `carousel ${x.bin.caro + 1} · shelf ${x.bin.shelf + 1}` : `location ${x.bin.code}`;
      return { title, tag: `TOTE ${j.tote.id}`, accent: x.completion ? '#fbbf24' : '#4ade80', big: `Pick ${x.qty}`, name: prod.name, info: [from, `${o.id} · ${o.customer}`], bar: done / j.n, foot: `Line ${done + 1} of ${j.n} · ${o.route.name}` };
    }
    // the operator walks between the location and the tote at the pick position
    addZoneOperator(z, add, binX) {
      const sim = this.sim, g = sim.grid, port = z.port, py = g.LB + g.SD, oy = py + 0.95;
      if (port.away) return;
      let x = z.pick.x;
      const j = z.job;
      if (j && j.cur && binX != null && z.kind === 'ptl') {
        const tot = sim.cfg.ptlLine + sim.cfg.ptlUnit * j.cur.qty, f = 1 - j.t / tot, u = f < 0.5 ? Math.min(1, f / 0.2) : Math.max(0, 1 - (f - 0.5) / 0.2);
        x = z.pick.x + (binX - z.pick.x) * u;
      }
      add(x + oy + 0.3, () => this.drawOperator(x, oy, !!(j && j.cur), '#f97316', 0, 'zone ' + z.id));
    }
    // Two carousels: a ring of shelves each, turning past the operator at their near end.
    addCarousels(z, add) {
      const sim = this.sim, j = z.job, cur = j && j.cur;
      for (const cr of z.carousels) {
        const top = 4.2, r = cr.r;
        add(cr.x + cr.y + 0.2, () => {
          // the frame: a low oval track and a top rail
          this.quadTop(cr.x - r - 0.2, cr.y - 0.2, cr.x + r + 0.2, cr.y + 2 * r + cr.len + 0.2, '#1f2937', '#334155', 1);
          for (const yy of [cr.y + r, cr.y + r + cr.len]) this.box(cr.x - 0.08, yy - 0.08, 0, cr.x + 0.08, yy + 0.08, top + 0.4, '#475569');
          this.box(cr.x - 0.06, cr.y + r, top + 0.3, cr.x + 0.06, cr.y + r + cr.len, top + 0.45, '#475569');
        });
        // the shelves, back to front so the near ones cover the far ones
        const shelves = z.bins.filter((b) => b.caro === cr.id).map((b) => ({ b, p: sim.shelfAt(cr, b.shelf) }));
        for (const { b, p } of shelves) {
          add(p.x + p.y + 0.25, () => {
            const hh = hue(b.comps[0].gtin), on = cur && cur.bin === b, s = 0.24;
            this.box(p.x - s, p.y - s, 0.3, p.x + s, p.y + s, top, on ? '#166534' : '#334155', { top: '#475569' });
            for (let lv = 0; lv < 3; lv++) this.box(p.x - s + 0.04, p.y - s + 0.04, 0.6 + lv * 1.2, p.x + s - 0.04, p.y + s - 0.04, 1.0 + lv * 1.2, '#888', { top: `hsl(${(hh + lv * 40) % 360},45%,62%)`, left: `hsl(${(hh + lv * 40) % 360},40%,50%)`, right: `hsl(${(hh + lv * 40) % 360},35%,38%)` });
            if (on) this.glow(p.x, p.y, 2.5, 26, '#4ade80', 0.7);
          });
        }
        if (cr.target != null) add(cr.x + cr.y - 0.5, () => this.glow(cr.x, cr.y, 0.2, 14, '#38bdf8', 0.6));
      }
      this.addZoneOperator(z, add, null);
      this.addZoneScreen(z, add);
    }

    // ---------------------------------------------------------------- RF shelving
    addRf(add, alpha) {
      const sim = this.sim, g = sim.grid;
      for (let a = 0; a < g.na; a++) for (const side of [0, 1]) {
        const x = g.RFX + 3 * a + (side ? 2 : 0);
        add(x + g.RFY + 1, () => {
          const y0 = g.RFY + 1, y1 = g.RFY + 1 + g.bays;
          for (let yy = y0; yy <= y1 - 0.05; yy += Math.max(1, (y1 - y0) / 4)) for (const xx of [x + 0.05, x + 0.87]) this.box(xx, Math.min(yy, y1 - 0.08), 0, xx + 0.08, Math.min(yy, y1 - 0.08) + 0.08, 5.5, '#1d4ed8');
          for (let lv = 0; lv < g.rfLevels; lv++) this.box(x + 0.05, y0, 0.3 + lv * 1.05, x + 0.95, y1, 0.36 + lv * 1.05, '#64748b', { top: '#475569', left: '#f97316', right: '#c2410c' });
        });
      }
      for (const b of sim.rfBins) {
        if (b.comps[0].qty <= 0) continue;
        const x = g.RFX + 3 * b.aisle + (b.side ? 2 : 0), hh = hue(b.comps[0].gtin), zz = 0.42 + b.level * 1.05;
        const f = Math.max(0.25, Math.min(1, b.comps[0].qty / b.cap));
        add(x + b.wy + 0.9, () => this.box(x + 0.22, b.wy - 0.3, zz + 0.06, x + 0.22 + 0.56 * f, b.wy + 0.3, zz + 0.42, '#888', { top: `hsl(${hh},40%,60%)`, left: `hsl(${hh},35%,48%)`, right: `hsl(${hh},30%,36%)` }));
      }
      // the depot: a stack of empty totes for the carts
      const d = sim.rfDepot();
      add(d.x + d.y, () => { for (let k = 0; k < 4; k++) this.box(d.x - 0.3, d.y - 0.25, 0.1 + k * 0.17, d.x + 0.1, d.y + 0.25, 0.27 + k * 0.17, '#b45309', { top: '#f59e0b' }); });
      for (const pk of sim.pickers) {
        if (pk.state === 'BREAK') continue;
        const x = pk.px + (pk.x - pk.px) * alpha, y = pk.py + (pk.y - pk.py) * alpha;
        add(x + y + 0.1, () => {
          this.drawOperator(x, y, pk.state === 'WORKING', '#a3e635', 0, 'rf ' + pk.name);
          // the cart with a tote per order of the batch
          if (pk.job) {
            const cx = x + 0.45, cy = y - 0.1, n = pk.job.totes.length - pk.job.put;
            this.box(cx - 0.3, cy - 0.35, 0.3, cx + 0.3, cy + 0.35, 0.4, '#64748b');
            for (let k = 0; k < Math.min(n, 8); k++) { const tx = cx - 0.18 + (k % 2) * 0.36, ty = cy - 0.24 + Math.floor(k / 2 % 2) * 0.48, tz = 0.4 + Math.floor(k / 4) * 0.7; this.box(tx - 0.15, ty - 0.2, tz, tx + 0.15, ty + 0.2, tz + 0.6, '#b45309', { top: '#f59e0b' }); }
          }
          if (this.opts.labels && this.cam.zoom > 0.9) this.text(pk.name, x, y, 4.3, { size: 9, color: '#1a2e05', weight: 800, bg: 'rgba(217,249,157,0.9)' });
        });
      }
    }

    // ---------------------------------------------------------------- merge & closing
    mergeSpot(k) { const g = this.sim.grid; return { x: g.RX + 3.3 + (k % 7) * 0.62, y: g.LT - 1.5 + Math.floor(k / 7) * 0.95 }; }
    addMerge(add) {
      const sim = this.sim, g = sim.grid, m = sim.merge, x0 = g.RX + 2.8, x1 = g.RX + 7.6, y0 = g.LT - 2, y1 = g.LT + 1.9;
      add(x0 + y0, () => this.box(x0, y0, 0, x1, y1, CZ - 0.05, '#2b2440', { top: '#1f1a33' }));
      m.totes.forEach((t, k) => { const q = this.mergeSpot(k); add(q.x + q.y + 0.3, () => this.drawTote(t, q.x, q.y, CZ, false)); });
      m.rf.forEach((t, k) => { const x = g.RX + 3.3 + k * 0.62, y = g.LT + 2.0; add(x + y + 0.3, () => this.drawTote(t, Math.min(x, x1 + 2), y, CZ, false)); });
      if (!sim.mergePort.away) { const x = g.RX + 5.2, y = g.LT + 2.9; add(x + y + 0.3, () => this.drawOperator(x, y, !!m.job, '#f97316', 0, 'merge')); }
    }
    addClosing(add) {
      const sim = this.sim, g = sim.grid, y = g.LT;
      for (const m of sim.machines) {
        add(m.x + y + 0.7, () => {
          const on = !!m.tote, col = m.down ? '#7f1d1d' : '#4c1d95';
          if (m.id === 'scale') { this.box(m.x - 0.55, y - 0.5, CZ - 0.05, m.x + 0.55, y + 0.5, CZ + 0.05, '#94a3b8'); this.box(m.x + 0.6, y - 0.1, 0, m.x + 0.75, y + 0.05, 3.6, '#475569'); this.box(m.x + 0.55, y - 0.3, 3.4, m.x + 0.8, y + 0.2, 4.4, '#0f172a'); }
          else {
            // a cabinet over the conveyor, open at both ends
            this.box(m.x - 0.55, y - 0.6, CZ, m.x - 0.4, y + 0.6, CZ + 3.0, col);
            this.box(m.x + 0.4, y - 0.6, CZ, m.x + 0.55, y + 0.6, CZ + 3.0, col);
            this.box(m.x - 0.55, y - 0.6, CZ + 2.4, m.x + 0.55, y + 0.6, CZ + 3.0, col, { top: WS.shade(col, 0.2) });
            if (m.id === 'docs') this.box(m.x - 0.3, y - 0.45, CZ + 3.0, m.x + 0.3, y + 0.1, CZ + 3.4, '#f8fafc');
            if (m.id === 'lid') for (let k = 0; k < 4; k++) this.box(m.x - 0.35, y + 0.65, 0.2 + k * 0.15, m.x + 0.35, y + 1.1, 0.33 + k * 0.15, '#1d4ed8');
          }
          if (on) this.glow(m.x, y, CZ + 3.1, 16, '#22c55e', 0.6);
          if (m.down) this.glow(m.x, y, CZ + 3.1, 18, '#ef4444', 0.6 + 0.4 * Math.sin(this.t * 7));
        });
      }
      const q = sim.checkStation, m0 = sim.machines[0];
      add(m0.x + y - 2.4 - 0.3, () => this.box(m0.x - 0.7, y - 3.2, 0, m0.x + 0.7, y - 2.7, CZ, '#475569', { top: '#94a3b8' }));
      if (!sim.checkPort.away) add(m0.x + y - 3.0, () => this.drawOperator(m0.x - 0.9, y - 2.4, !!q.tote, '#f97316', 0, 'check'));
    }

    // ---------------------------------------------------------------- lanes & vans
    // Totes stack five high at the end of their lane; the van docks when its
    // departure is near and drives off with them.
    addLanes(add) {
      const sim = this.sim, g = sim.grid, c = sim.cfg;
      for (const lane of sim.lanes) {
        const y = lane.y, route = lane.route, n = lane.stack.length;
        for (let k = 0; k < Math.min(n, 80); k++) {
          const col = Math.floor(k / 10), row = Math.floor(k / 5) % 2, lv = k % 5, x = g.SX + 5.8 + col * 0.62, yy = y - 0.33 + row * 0.66;
          add(x + yy + 0.2 + lv * 0.001, () => this.tote(x - 0.27, yy - 0.3, x + 0.27, yy + 0.3, 0.1 + lv * 0.95, 0.9, TOTE.order, { closed: true }));
        }
        // the dock door with the route's colour, and the van when it is there
        const dx = g.SX + 11.2;
        add(dx + y - 1.2, () => { this.box(dx, y - 1.25, 0, dx + 0.2, y + 1.25, 7, '#334155'); this.faceX(dx + 0.21, y - 1.1, y + 1.1, 6.2, 6.8, route.color); });
        const left = route.next - sim.time, since = sim.time - (route.lastDep ?? -1e9);
        if (left < 900 || since < 10) {
          const off = since < 10 ? since * since * 0.08 : 0, vx = dx + 0.4 + off;
          add(vx + y + 2, () => this.drawVan(vx, y, route, left < 900 ? Math.min(1, lane.stack.length / c.vanCapacity) : 1));
        }
      }
    }
    drawVan(x, y, route, fill) {
      const w = 1.2, L = 8;
      this.box(x, y - w, 0.8, x + L * 0.72, y + w, 7.4, '#f1f5f9', { left: '#cbd5e1', right: '#94a3b8', top: '#f8fafc' });
      this.box(x + L * 0.72, y - w + 0.05, 0.6, x + L, y + w - 0.05, 5.2, route.color, { top: WS.shade(route.color, 0.25) });
      this.faceX(x + L + 0.001, y - w + 0.25, y + w - 0.25, 3.2, 4.9, '#13283e');
      this.faceY(y + w - 0.04, x + L * 0.78, x + L * 0.95, 3.3, 4.8, '#0f2236');
      for (const wx of [x + 1.2, x + L - 1.0]) this.wheelY(wx, y + w + 0.01, 0.8, 0.45, 1.0);
      this.faceY(y + w + 0.002, x + 0.4, x + L * 0.68, 5.6, 6.6, route.color);
      this.text(route.name, x + L * 0.36, y + w, 6.1, { size: 10, color: '#0f172a', weight: 800 });
      this.faceY(y + w + 0.003, x + 0.4, x + 0.4 + (L * 0.68 - 0.4) * fill, 1.2, 1.7, '#2563eb');
    }

    // ---------------------------------------------------------------- order start & tote return
    // The de-stacker with its stack of empty totes and the label printer;
    // the tote-emptying machine at the end of the return conveyor.
    addStart(add) {
      const sim = this.sim, g = sim.grid, n = sim.oms.freeTotes.length, e = sim.emptier;
      const sx = 1.2, sy = g.SY;
      add(sx + sy - 0.4, () => {
        this.box(sx - 0.55, sy - 0.6, 0, sx + 0.55, sy + 0.6, CZ, '#334155', { top: '#1f2937' });
        const h = Math.min(14, Math.ceil(n / 40));
        for (let k = 0; k < h; k++) this.box(sx - 0.3, sy - 0.4, CZ + k * 0.28, sx + 0.3, sy + 0.4, CZ + k * 0.28 + 0.26, '#1d4ed8', { top: '#2563eb' });
        for (const xx of [sx - 0.6, sx + 0.52]) this.box(xx, sy - 0.65, 0, xx + 0.08, sy + 0.65, CZ + 4.6, '#64748b');
        this.text(`${n} empty`, sx, sy, CZ + 5.2, { size: 9, color: '#bfdbfe', bg: 'rgba(15,23,42,0.85)' });
      });
      add(2.6 + sy + 0.2, () => { this.box(2.4, sy - 0.75, CZ, 3.2, sy - 0.45, CZ + 2.0, '#e2e8f0'); if (sim.startT > sim.cfg.startTime - 1) this.glow(2.8, sy - 0.4, CZ + 1.4, 12, '#38bdf8', 0.7); });
      add(e.x + e.y + 0.3, () => {
        this.box(e.x - 0.7, e.y - 0.6, 0, e.x + 0.6, e.y + 0.6, RZ + 2.2, '#4c1d95', { top: '#5b21b6' });
        if (e.tote) this.glow(e.x, e.y, RZ + 2.4, 16, '#22c55e', 0.6);
      });
      // returned totes waiting at the dock
      const r = sim.returnDock.length, rx = g.SX + 9.8, ry = 0.6;
      add(rx + ry, () => { for (let k = 0; k < Math.min(12, Math.ceil(r / 8)); k++) this.box(rx - 0.3, ry - 0.4, 0.1 + k * 0.28, rx + 0.3, ry + 0.4, 0.36 + k * 0.28, '#475569', { top: '#64748b' }); });
    }

    drawLabels() {
      const sim = this.sim, g = sim.grid, bg = 'rgba(15,23,42,0.82)';
      this.text(`A-FRAME · ${sim.channels.length} channels${sim.afRunning || !sim.windows.length ? '' : ' · BELT WAITING'}`, g.AX + g.afLen / 2, g.AY, 7.4, { size: 10, bg, color: '#7dd3fc' });
      this.text('ORDER START', 1.6, g.SY + 1.2, 0.5, { size: 10, bg, color: '#86efac' });
      for (const z of sim.zones) this.text(`${z.port.code} · ${z.kind === 'carousel' ? 'CAROUSELS' : z.idx === 0 ? 'PICK-TO-LIGHT · COMPLETION' : 'PICK-TO-LIGHT'} · ${z.in.totes.length}/${sim.cfg.spurTotes}${z.port.away ? ' · BREAK' : ''}`, z.dx - 1.5, g.LB + 1.2, 3.8, { size: 10, bg, color: '#fdba74' });
      this.text(`LOOP ${Math.round(sim.loopFill() * 100)}%`, g.LX + 2, g.LB - 0.5, 3.2, { size: 10, bg, color: '#e2e8f0' });
      this.text(`MERGE · ${sim.merge.totes.length} waiting`, g.RX + 5.2, g.LT - 2.2, 3.4, { size: 10, bg, color: '#c4b5fd' });
      this.text('CLOSING LINE', g.RX + 14, g.LT + 1.2, 6.0, { size: 10, bg, color: '#c4b5fd' });
      this.text('RF SHELVING', g.RFX + 1.5 * g.na, g.RFY + 0.2, 6.2, { size: 10, bg, color: '#fde68a' });
      this.text('TOTE RETURN', g.SX, 0.6, RZ + 1.4, { size: 10, bg, color: '#cbd5e1' });
      if (this.cam.zoom > 0.6) for (const lane of sim.lanes) {
        const r = lane.route, left = r.next - sim.time;
        this.text(`${r.name} · ${lane.stack.length} · ${left < 3600 ? 'leaves in ' + WS.U.fmtDur(left) : WS.U.fmtClock(r.next).slice(-8, -3)}`, g.SX + 3, lane.y + 0.9, 0.4, { size: 9, bg, color: r.color });
      }
    }

    // Clicks: a tote, a zone, the A-frame, a machine, a lane, or any map cell.
    pick(sx, sy) {
      const sim = this.sim, g = sim.grid;
      let best = null, bd = 14 * Math.max(1, this.cam.zoom);
      const near = (t, x, y, z) => { const [px, py] = this.P(x, y, z); const d = Math.hypot(this.cam.x + px * this.cam.zoom - sx, this.cam.y + py * this.cam.zoom - sy); if (d < bd) { bd = d; best = t; } };
      for (const b of sim.net.belts) for (const t of b.totes) near(t, t.x, t.y, (b.kind === 'return' ? RZ : CZ) + 0.5);
      sim.merge.totes.forEach((t, k) => { const q = this.mergeSpot(k); near(t, q.x, q.y, CZ + 0.5); });
      if (best) return { kind: 'cell', id: g.idx(Math.floor(best.x ?? 0), Math.floor(best.y ?? 0)), tote: best };
      for (const z of [CZ + 1, CZ, 1, 0]) {
        const w = this.toWorld(sx, sy, z), x = Math.floor(w.x), y = Math.floor(w.y);
        if (!g.inside(x, y)) continue;
        const i = g.idx(x, y), th = g.what[i] >= 0 ? sim.things[g.what[i]] : null;
        if (th && th.kind === 'zone') return { kind: 'port', id: th.zone.port.idx };
        if (th && th.kind === 'aframe' && z >= CZ) return { kind: 'port', id: sim.afPort.idx };
        if (th) return { kind: 'cell', id: i };
      }
      const w = this.toWorld(sx, sy, 0), x = Math.floor(w.x), y = Math.floor(w.y);
      return g.inside(x, y) ? { kind: 'cell', id: g.idx(x, y) } : null;
    }
  }

  WS.ZoneRenderer = ZoneRenderer;
})((globalThis.WS = globalThis.WS || {}));
