/* Isometric view of SortHub. Tilt-tray sorter: the inbound feeder and induct
 * belts with their operators, the loop with its trays (tilting as they
 * drop a parcel), the chutes with their bags, and the bag workers. Robot
 * sorter: the raised deck with a hole per chute, the bags hanging below it,
 * the inducts along the front and the robots tipping parcels through the
 * holes. Parcels falling into a chute are animated from where they left. */
(function (WS) {
  'use strict';
  const C = WS.CELL;
  const TZ = 2.4, PZ = 3.6; // tray height, deck height (render levels)
  const SHADES = ['#b8875a', '#a8794f', '#c6956a', '#9c6f47', '#d0a070', '#b07d52', '#c08a5c'];
  const CARTON = (p) => SHADES[p.hue % SHADES.length]; // cardboard, a shade per parcel

  class SortRenderer extends WS.IsoRenderer {
    worldBounds() {
      const g = this.sim.grid, pts = [this.P(-2, -2, 6), this.P(g.W + 2, -2, 0), this.P(-2, g.D + 4, 0), this.P(g.W + 2, g.D + 4, 0), this.P(g.W + 2, -2, 6)];
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    }
    drawScene(alpha) {
      const g = this.sim.grid, P = this.P.bind(this);
      this.poly([P(-2, -2, 0), P(g.W + 2, -2, 0), P(g.W + 2, g.D + 4, 0), P(-2, g.D + 4, 0)], '#1a2332');
      this.ctx.globalAlpha = 0.5;
      for (let x = -2; x <= g.W + 2; x += 2) this.line(P(x, -2, 0), P(x, g.D + 4, 0), '#222d3f', 1);
      for (let y = -2; y <= g.D + 4; y += 2) this.line(P(-2, y, 0), P(g.W + 2, y, 0), '#222d3f', 1);
      this.ctx.globalAlpha = 1;
      const items = [];
      if (this.sim.tray) this.trayScene(items, alpha); else this.deckScene(items, alpha);
      for (const w of this.sim.workers) {
        const x = w.px + (w.x - w.px) * alpha, y = w.py + (w.y - w.py) * alpha;
        items.push({ d: x + y + 0.2, fn: () => this.drawOperator(x, y, w.state === 'SWAPPING', '#facc15') });
      }
      this.dropItems(items);
      items.sort((a, b) => a.d - b.d);
      for (const it of items) it.fn();
    }
    // Parcels falling from a tray or robot into their chute, for half a second.
    dropItems(items) {
      const sim = this.sim, top = sim.tray ? TZ + 0.3 : PZ + 0.6;
      for (const d of sim.drops) {
        const f = (sim.time - d.t) / 0.5;
        if (f < 0 || f > 1) continue;
        const x = d.from.x + (d.to.x - d.from.x) * f, y = d.from.y + (d.to.y - d.from.y) * f, z = top - f * f * (sim.tray ? 1.2 : 2.6), s = 0.3 * d.parcel.size;
        items.push({ d: x + y + 0.6, fn: () => this.box(x - s, y - s * 0.8, z, x + s, y + s * 0.8, z + 0.45, CARTON(d.parcel)) });
      }
    }
    // A bag hanging under a chute: the sack grows as it fills, red light when full.
    bag(x, y, z0, ch) {
      const cap = this.sim.cfg.bagCapacity, f = Math.min(1, ch.count / cap), full = ch.count >= cap;
      this.box(x - 0.42, y - 0.42, 0, x - 0.36, y - 0.36, z0, '#475569');
      this.box(x + 0.36, y + 0.36, 0, x + 0.42, y + 0.42, z0, '#475569');
      const h = 0.25 + f * (z0 - 0.35);
      this.box(x - 0.36, y - 0.36, z0 - h, x + 0.36, y + 0.36, z0, ch.swapping ? '#94a3b8' : '#e5e7eb', { top: '#f8fafc' });
      if (full || ch.swapping) this.glow(x, y, z0 + 0.3, 14, ch.swapping ? '#f59e0b' : '#ef4444', 0.7);
    }

    // ---------------------------------------------------------------- tilt-tray loop
    trayScene(items, alpha) {
      const sim = this.sim, g = sim.grid, P = this.P.bind(this), sel = this.selected;
      // inbound feeder along the back and an induct belt down to the loop at each induct
      const last = sim.ports[sim.ports.length - 1].slot.x;
      items.push({ d: 0, fn: () => this.conveyor([{ x: -1.5, y: 0.6 }, { x: last, y: 0.6 }], 0.7, TZ - 0.2, '#334155', { legs: true }) });
      for (const p of sim.ports) {
        const s = p.slot, x = s.x;
        items.push({ d: x + 2.5, fn: () => {
          this.conveyor([{ x, y: 0.95 }, { x, y: g.Yt - 0.55 }], 0.6, TZ - 0.1, '#3b4658', { legs: true });
          const n = Math.min(4, p.queue.length);
          for (let k = 0; k < n; k++) { const q = p.queue[k], yy = 1.4 + k * 0.62, sz = 0.26 * q.size; this.box(x - sz, yy - sz * 0.8, TZ - 0.1, x + sz, yy + sz * 0.8, TZ + 0.35, CARTON(q)); }
          const r = p.ready || p.cur;
          if (r) { const sz = 0.26 * r.size, yy = g.Yt - 1.0; this.box(x - sz, yy - sz * 0.8, TZ - 0.1, x + sz, yy + sz * 0.8, TZ + 0.35, CARTON(r)); }
          if (sel && sel.kind === 'port' && sel.id === p.idx) this.quadTop(x - 0.5, 0.9, x + 0.5, g.Yt - 0.5, TZ + 0.02, null, '#38bdf8', 2.5);
        } });
        const op = { x: x + 0.8, y: g.Yt - 2.6 };
        items.push({ d: op.x + op.y + 0.5, fn: () => this.drawOperator(op.x, op.y, !!p.cur, '#f97316') });
      }
      // the loop: a dark frame on legs under the trays
      items.push({ d: g.X0 + g.Yt - 0.5, fn: () => {
        const N = 64;
        for (let k = 0; k < N; k++) {
          const a = g.loopAt((k * g.Lp) / N), b = g.loopAt(((k + 1) * g.Lp) / N);
          if (k % 4 === 0) this.box(a.x - 0.06, a.y - 0.06, 0, a.x + 0.06, a.y + 0.06, TZ - 0.4, '#475569');
          this.line(P(a.x, a.y, TZ - 0.3), P(b.x, b.y, TZ - 0.3), '#1f2937', 40);
        }
      } });
      // chutes and their bags
      for (const ch of sim.chutes) {
        const dir = ch.side ? 1 : -1, y0 = ch.side ? g.Yb : g.Yt, x = ch.x, yb = y0 + dir * 2.45;
        items.push({ d: x + yb - 0.6, fn: () => this.bag(x, yb, 1.5, ch) });
        items.push({ d: x + y0 + dir * 1.2, fn: () => {
          const ya = y0 + dir * 0.55, yc = y0 + dir * 2.05, col = ch === sim.reject ? '#7f1d1d' : '#64748b';
          this.poly([P(x - 0.45, ya, TZ - 0.2), P(x + 0.45, ya, TZ - 0.2), P(x + 0.45, yc, 1.6), P(x - 0.45, yc, 1.6)], col, '#94a3b8', 1);
          this.line(P(x + 0.45, ya, TZ), P(x + 0.45, yc, 1.8), '#94a3b8', 2);
          const s2 = sel && sel.kind === 'cell' && g.chuteAt[sel.id] === ch.id;
          if (s2) this.quadTop(x - 0.5, Math.min(ya, yc), x + 0.5, Math.max(ya, yc) + 0.5, 1.7, null, '#38bdf8', 2.5);
        } });
      }
      // trays, tilting towards the chute as they drop a parcel
      for (const tr of sim.trays) {
        const q = sim.trayAt(tr, alpha), c = Math.cos(q.a), s = Math.sin(q.a), hl = 0.5, hw = 0.42;
        const f = Math.max(0, 1 - (sim.time - tr.tilt) / 0.6), out = q.y < (g.Yt + g.Yb) / 2 ? -1 : 1; // outward side of the loop
        items.push({ d: q.x + q.y, fn: () => {
          const corner = (u, v) => { const x = q.x + u * c - v * s, y = q.y + u * s + v * c, side = Math.sign((y - q.y) * out) || 0; return P(x, y, TZ - side * f * 0.35); };
          this.poly([corner(-hl, -hw), corner(hl, -hw), corner(hl, hw), corner(-hl, hw)], f > 0 ? '#38bdf8' : '#0ea5e9', '#0c4a6e', 1);
          if (tr.parcel) { const p = tr.parcel, z = p.size * 0.26; this.box(q.x - z, q.y - z * 0.8, TZ, q.x + z, q.y + z * 0.8, TZ + 0.45, CARTON(p)); }
        } });
      }
    }

    // ---------------------------------------------------------------- robot deck
    deckScene(items, alpha) {
      const sim = this.sim, g = sim.grid, P = this.P.bind(this), sel = this.selected;
      // under the deck: posts and the bags under the holes (drawn first, the deck hides them partly)
      for (let x = 0; x <= g.W; x += 3) for (let y = 1; y <= g.D - 1; y += 3) this.box(x - 0.05, y - 0.05, 0, x + 0.05, y + 0.05, PZ, '#475569');
      for (const ch of sim.chutes) this.bag(ch.x, ch.y, PZ - 0.4, ch);
      // the deck: a grating with the holes, the induct lanes along the front and the chargers at the back
      this.ctx.globalAlpha = 0.86;
      this.poly([P(0, 1, PZ), P(g.W, 1, PZ), P(g.W, g.D - 1, PZ), P(0, g.D - 1, PZ)], '#2b3546', '#475569', 1);
      this.ctx.globalAlpha = 1;
      this.ctx.globalAlpha = 0.25;
      for (let x = 0; x <= g.W; x++) this.line(P(x, 1, PZ + 0.01), P(x, g.D - 1, PZ + 0.01), '#64748b', 1);
      for (let y = 1; y <= g.D - 1; y++) this.line(P(0, y, PZ + 0.01), P(g.W, y, PZ + 0.01), '#64748b', 1);
      this.ctx.globalAlpha = 1;
      for (let y = 0; y < g.D; y += g.D - 1) for (let x = 0; x < g.W; x++) {
        const t = g.type[g.idx(x, y)];
        if (t === C.LANE || t === C.PORT || t === C.HIGHWAY) this.quadTop(x + 0.02, y + 0.02, x + 0.98, y + 0.98, PZ, t === C.PORT ? '#3a2f12' : t === C.LANE ? '#2a2614' : '#2b3546', t === C.PORT ? '#facc15' : null, 1.5);
        else if (t === C.CHARGER) this.quadTop(x + 0.1, y + 0.1, x + 0.9, y + 0.9, PZ, '#14532d', '#4ade80', 1.2);
        else if (t === C.PARK) this.quadTop(x + 0.1, y + 0.1, x + 0.9, y + 0.9, PZ, null, 'rgba(148,163,184,0.35)', 1);
      }
      for (const ch of sim.chutes) {
        const x = Math.floor(ch.x), y = Math.floor(ch.y), full = ch.count >= sim.cfg.bagCapacity;
        this.quadTop(x + 0.12, y + 0.12, x + 0.88, y + 0.88, PZ + 0.01, '#05080e', full ? '#ef4444' : ch === sim.reject ? '#f87171' : '#facc15', 2);
        const f = Math.min(1, ch.count / sim.cfg.bagCapacity);
        this.quadTop(x + 0.12, y + 0.92, x + 0.12 + 0.76 * f, y + 0.98, PZ + 0.01, full ? '#ef4444' : '#4ade80');
        if (sel && sel.kind === 'cell' && sel.id === g.idx(x, y)) this.quadTop(x, y, x + 1, y + 1, PZ + 0.02, null, '#38bdf8', 2.5);
      }
      if (this.opts.claims) {
        for (const r of sim.fleet) {
          const col = WS.stateColor(sim, r.displayState);
          for (const i of r.claims) { const x = g.cx(i), y = g.cy(i); if (x !== r.x || y !== r.y) this.quadTop(x + 0.15, y + 0.15, x + 0.85, y + 0.85, PZ + 0.02, WS.rgba(col, 0.15), WS.rgba(col, 0.5), 1); }
        }
      }
      if (this.opts.paths) this.drawPaths(alpha, PZ);
      // inducts: a platform at the front with the operator, the feed belt coming in from the front
      for (const p of sim.ports) {
        const x = p.drop.x + 0.5, y0 = g.D;
        items.push({ d: x + y0 + 0.4, fn: () => {
          this.box(x - 0.8, y0, 0, x + 0.8, y0 + 1.4, PZ - 0.05, '#334155', { top: '#1f2937' });
          this.conveyor([{ x: x + 1.2, y: y0 + 3 }, { x: x + 1.2, y: y0 + 0.2 }], 0.55, PZ + 0.1, '#3b4658', { legs: true });
          const n = Math.min(4, p.queue.length);
          for (let k = 0; k < n; k++) { const q = p.queue[k], sz = 0.24 * q.size, yy = y0 + 0.7 + k * 0.6; this.box(x + 1.2 - sz, yy - sz * 0.8, PZ + 0.1, x + 1.2 + sz, yy + sz * 0.8, PZ + 0.5, CARTON(q)); }
          if (p.ready) { const r = p.ready, sz = 0.24 * r.size; this.box(x + 0.35 - sz, y0 + 0.3 - sz * 0.8, PZ + 0.2, x + 0.35 + sz, y0 + 0.3 + sz * 0.8, PZ + 0.6, CARTON(r)); }
          if (sel && sel.kind === 'port' && sel.id === p.idx) this.quadTop(x - 0.8, y0 - 1, x + 0.8, y0 + 1.4, PZ + 0.03, null, '#38bdf8', 2.5);
        } });
        items.push({ d: x + y0 + 1.3, fn: () => this.drawOperator(x - 0.2, y0 + 0.8, !!p.cur, '#f97316', PZ) });
      }
      for (const ch of g.chargers) items.push({ d: ch.x + 0.5, fn: () => { this.box(ch.x + 0.3, 0.02, PZ, ch.x + 0.7, 0.18, PZ + 1.6, '#334155'); const on = ch.robot >= 0 && sim.fleet[ch.robot].state === 'CHARGING'; this.glow(ch.x + 0.5, 0.1, PZ + 1.3, 12, '#4ade80', on ? 0.9 : 0.3); } });
      // robots: a low body with a state-coloured band and a tilting top that tips the parcel
      for (const r of sim.fleet) {
        const x = r.prx + (r.rx - r.prx) * alpha + 0.5, y = r.pry + (r.ry - r.pry) * alpha + 0.5;
        items.push({ d: x + y, fn: () => this.drawSortRobot(r, x, y) });
      }
    }
    drawSortRobot(r, x, y) {
      const sim = this.sim, col = WS.stateColor(sim, r.displayState), h = 0.3, z = PZ;
      this.box(x - h, y - h, z, x + h, y + h, z + 0.32, '#e2e8f0', { left: '#cbd5e1', right: '#94a3b8', top: '#f1f5f9' });
      this.faceY(y + h + 0.004, x - h, x + h, z + 0.16, z + 0.24, col); this.faceX(x + h + 0.004, y - h, y + h, z + 0.16, z + 0.24, col);
      // the tilt tray on top, tipped towards the hole while tipping
      const f = r.tip != null ? Math.min(1, (sim.time - r.tip) / 0.3) : 0, t = r.task && r.task.chute, P = this.P.bind(this);
      let dx = 0, dy = 0;
      if (f && t) { dx = Math.sign(Math.floor(t.x) - Math.floor(x)); dy = Math.sign(Math.floor(t.y) - Math.floor(y)); }
      const zc = (u, v) => z + 0.42 + (u * dx + v * dy) * -0.25 * f;
      this.poly([P(x - h, y - h, zc(-1, -1)), P(x + h, y - h, zc(1, -1)), P(x + h, y + h, zc(1, 1)), P(x - h, y + h, zc(-1, 1))], '#0ea5e9', '#0c4a6e', 1);
      if (r.parcel && !f) { const p = r.parcel, s = 0.22 * p.size; this.box(x - s, y - s * 0.8, z + 0.42, x + s, y + s * 0.8, z + 0.85, CARTON(p)); }
      const sel = this.selected && this.selected.kind === 'robot' && this.selected.id === r.id;
      if (sel) this.quadTop(x - 0.55, y - 0.55, x + 0.55, y + 0.55, z + 0.02, null, '#38bdf8', 2.5);
      if (this.opts.labels && this.cam.zoom > 1.2) this.robotTag(r, x, y, z + 1.6, 'rgba(241,245,249,0.85)');
    }

    drawLabels() {
      const sim = this.sim, g = sim.grid, bg = 'rgba(15,23,42,0.82)', z = sim.tray ? 4.4 : PZ + 2.6;
      for (const p of sim.ports) {
        const x = sim.tray ? p.slot.x : p.drop.x + 0.5, y = sim.tray ? 0.4 : g.D + 1.5;
        this.text(`${p.code} · ${p.queue.length} waiting`, x, y, z, { size: 10, bg, color: '#fdba74' });
      }
      if (this.cam.zoom > 1.1) for (const ch of sim.chutes) {
        const y = sim.tray ? (ch.side ? g.Yb + 3.0 : g.Yt - 3.0) : ch.y, zz = sim.tray ? 2.4 : PZ + 0.8;
        this.text(ch.dest ? ch.dest.name.slice(3) : 'REJECT', ch.x, y, zz, { size: 8, bg: ch.count >= sim.cfg.bagCapacity ? 'rgba(127,29,29,0.9)' : bg, color: '#e2e8f0' });
      }
      this.text(sim.tray ? 'INBOUND PARCELS' : 'INDUCTION', sim.tray ? -1 : g.W / 2, sim.tray ? 0.6 : g.D + 3.4, sim.tray ? 4.0 : PZ + 1.4, { size: 10, bg, color: '#86efac' });
    }

    pick(sx, sy) {
      const sim = this.sim, g = sim.grid, z = sim.tray ? TZ : PZ;
      if (!sim.tray) {
        let best = null, bd = 18 * Math.max(1, this.cam.zoom);
        for (const r of sim.fleet) {
          const [px, py] = this.P(r.rx + 0.5, r.ry + 0.5, PZ + 0.4);
          const d = Math.hypot(this.cam.x + px * this.cam.zoom - sx, this.cam.y + py * this.cam.zoom - sy);
          if (d < bd) { bd = d; best = { kind: 'robot', id: r.id }; }
        }
        if (best) return best;
      }
      // a chute (its slide or bag), an induct, or the floor
      for (const zz of [z, 1.6, 0.8]) {
        const w = this.toWorld(sx, sy, zz);
        for (const ch of sim.chutes) {
          const cy = sim.tray ? (ch.side ? g.Yb + 1.6 : g.Yt - 1.6) : ch.y;
          if (Math.abs(w.x - ch.x) < 0.55 && Math.abs(w.y - cy) < 1.0) return { kind: 'cell', id: g.idx(Math.floor(ch.cell.x), Math.floor(ch.cell.y)) };
        }
        for (const p of sim.ports) {
          const px = sim.tray ? p.slot.x : p.drop.x + 0.5, y0 = sim.tray ? 0.9 : g.D - 1, y1 = sim.tray ? g.Yt - 0.5 : g.D + 1.4;
          if (Math.abs(w.x - px) < 0.8 && w.y >= y0 && w.y <= y1) return { kind: 'port', id: p.idx };
        }
      }
      const w = this.toWorld(sx, sy, z), x = Math.floor(w.x), y = Math.floor(w.y);
      return g.inside(x, y) ? { kind: 'cell', id: g.idx(x, y) } : null;
    }
  }

  WS.SortRenderer = SortRenderer;
})((globalThis.WS = globalThis.WS || {}));
