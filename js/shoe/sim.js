/* ShoeLine: a sliding shoe sorter (specs/shoe.txt). Each induct puts its
 * parcels on a belt of its own that runs to the merge; there a gapper lets
 * one at a time onto the sorter, the one that has waited longest, when there
 * is a gap behind the parcel before it. The sorter is a
 * straight line of slats with a chute every metre or so on both sides; at a
 * chute of its destination with room, shoes glide diagonally across the
 * slats under the parcel and push it off. A parcel that reaches the end of
 * the line goes onto the recirculation belt, back to the merge, where it has
 * priority over new ones; after maxLaps, or with no room on that belt, it
 * goes into the reject chute straight ahead (with that bag full, round
 * again). If neither can take it the line stops. The parcel stream, inducts, chutes and bags are those of every
 * parcel sorter (js/hub/sim.js). Positions in metres: x along the line, y
 * across it (south). */
(function (WS) {
  'use strict';
  const C = WS.CELL;
  const STATE_LABELS = {};
  const LEGEND = ['IDLE'];
  const PLEN = (p) => 0.3 + (p.size - 0.75) * 0.9; // m along the line: a parcel's length (0.3–0.75)

  // ---------------------------------------------------------------- floor
  function geometry(c) {
    const K = c.inducts, pairs = Math.ceil(Math.max(1, c.chutes - 1) / 2), P = c.chutePitch;
    const X0 = 2.5 + K * 1.8, yL = 7, D0 = X0 + 2.5; // the merge, the line, the first chute
    const X1 = D0 + pairs * P + 0.5; // the end of the line
    return {
      K, pairs, P, X0, X1, yL, D0, yR: yL + 5, Xr: X0 - 0.9,
      inX: (k) => 1.3 + k * 1.8, chuteX: (i) => D0 + P / 2 + i * P,
      aisle: [yL - 3.4, yL + 3.4], cross: X1 + 4.2, end: { x: X1 + 1.3, y: yL },
      W: Math.ceil(X1 + 6), D: yL + 8,
    };
  }
  // The sorter as a map: the line, its chutes on both sides, the inducts, the return belt.
  class ShoeFloor extends WS.HubFloor {
    constructor(cfg) {
      const G = geometry(cfg);
      super(cfg, G.W, G.D);
      this.G = G;
      const mark = (x0, x1, y0, y1, t) => { for (let y = Math.floor(y0); y <= Math.floor(y1); y++) for (let x = Math.floor(x0); x <= Math.floor(x1); x++) if (this.inside(x, y)) this.type[this.idx(x, y)] = t; };
      mark(0.5, G.X1, G.yL, G.yL, C.HIGHWAY);
      mark(G.X1, G.X1 + 0.2, G.yL, G.yR, C.HIGHWAY); mark(G.Xr, G.X1, G.yR, G.yR, C.HIGHWAY); mark(G.Xr, G.Xr, G.yL + 1, G.yR, C.HIGHWAY);
      // the chutes: in pairs, one each side, from the merge on; the last spot is the reject chute at the end
      this.spots = [];
      for (let i = 0; i < G.pairs; i++) for (const side of [0, 1]) this.spots.push({ x: G.chuteX(i), y: G.yL + (side ? 2.4 : -2.4), side, s: G.chuteX(i) - G.X0 }); // at the bag, the end of the slide
      this.spots = this.spots.slice(0, Math.max(1, cfg.chutes - 1));
      this.spots.push({ x: G.end.x, y: G.end.y, side: 2, s: G.X1 - G.X0, end: true });
      // the inducts, north of the line before the merge, each with a belt down to it
      for (let k = 0; k < G.K; k++) {
        const x = G.inX(k), cell = { x: Math.floor(x), y: Math.floor(G.yL - 2.5) };
        this.type[this.idx(cell.x, cell.y)] = C.PORT;
        this.ports.push({ kind: 'INDUCT', face: 'front', drop: cell, lift: cell, cells: [cell], slot: { x, y: G.yL - 2.5 } });
      }
    }
    get mapTitle() { return 'LINE · chutes by bag fill, red = full · dots: parcels on the line and the belts'; }
  }

  // ---------------------------------------------------------------- simulation
  class ShoeSim extends WS.HubSim {
    get kind() { return 'shoe'; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    get taskTypes() { return {}; }
    defaults() { return WS.SHOE_CONFIG; }
    createGrid() { const g = new ShoeFloor(this.cfg); g.sim = this; this.G = g.G; return g; }
    describe() { const c = this.cfg; return `Shoe sorter online · ${c.inducts} inducts · ${this.chutes.length} chutes for ${c.destinations} destinations · ${(this.G.X1 - this.G.X0).toFixed(0)} m of line at ${c.sorterSpeed} m/s`; }
    get chuteSounds() { return true; } // shoes pushing a parcel off
    get soundLoop() { const G = this.G; return { x: (G.X0 + G.X1) / 2, y: G.yL }; } // the slats never stop

    chuteSpots() { return this.grid.spots; }
    workerStart(k) { const G = this.G; return { x: G.cross, y: G.aisle[k % 2] }; }
    servicePoint(ch) { const G = this.G; return ch.side === 2 ? { x: ch.x + 1.3, y: G.yL - 0.9 } : { x: ch.x, y: G.aisle[ch.side] }; }
    // the aisles on both sides of the line, round its far end to change sides (the end chute from the north aisle)
    workerPath(w, ch) {
      const G = this.G;
      if (ch.side === 2) { const sp = this.servicePoint(ch), onTop = Math.abs(w.y - G.aisle[0]) < Math.abs(w.y - G.aisle[1]); return onTop ? [{ x: w.x, y: G.aisle[0] }, { x: G.cross, y: G.aisle[0] }, sp] : [{ x: w.x, y: G.aisle[1] }, { x: G.cross, y: G.aisle[1] }, { x: G.cross, y: G.aisle[0] }, sp]; }
      return this.aislePath(w, ch, G.aisle[0], G.aisle[1], G.cross);
    }
    seedSorter() {
      const c = this.cfg, G = this.G;
      this.line = []; // parcels on the slats: { p, s (m from the merge, the parcel's middle), len }, the front first
      this.diverts = []; // parcels being pushed off by the shoes, for the views
      // a belt from each induct, the belts fanning in to the merge
      this.feeds = this.ports.map((p) => new WS.Conveyor('Feed ' + p.code, [{ x: p.slot.x, y: G.yL - 2.2 }, { x: p.slot.x, y: G.yL - 1.1 - (G.K - 1 - p.idx) * 0.05 }, { x: G.X0 - 0.5, y: G.yL }], c.feedSpeed, 0.1));
      this.ret = new WS.Conveyor('Recirculation', [{ x: G.X1 + 0.2, y: G.yL + 0.7 }, { x: G.X1 + 0.2, y: G.yR }, { x: G.Xr, y: G.yR }, { x: G.Xr, y: G.yL + 0.7 }], c.returnSpeed, 0.1);
      this.Ls = G.X1 - G.X0;
      for (const ch of this.chutes) if (ch.cell.side !== 2) ch.s = ch.cell.s;
      this.stats.mergeWait = 0; this.stats.overflow = 0; this.stats.jam = 0; this.stats.merged = 0; this.stats.remerged = 0;
      this.lineFill = 0;
    }
    onSorter() { return this.line.length + this.ret.items.length + this.feeds.reduce((a, q) => a + q.items.length, 0); }

    // ---------------------------------------------------------------- the line
    stepSorter(dt) {
      const c = this.cfg, G = this.G, v = c.sorterSpeed * dt;
      if (this.loopStopped) return;
      // the inducts put their parcel on their belt to the merge
      for (const p of this.ports) {
        if (!p.ready) continue;
        const pc = p.ready, len = PLEN(pc), q = this.feeds[p.idx];
        if (q.room(len / 2, len)) { q.put({ p: pc, len }, len / 2); p.ready = null; pc.at = 'feed ' + p.code; this.loaded(pc, p); }
      }
      for (const q of this.feeds) { q.update(dt); const f = q.front; if (f && q.atEnd(f) && f.endT == null) f.endT = this.time; }
      this.ret.update(dt);
      // the end of the line: onto the recirculation belt, or into the reject chute straight ahead
      const head = this.line[0];
      let hold = false;
      if (head && head.s + v >= this.Ls) {
        const p = head.p, toRet = (p.target !== this.reject || !this.hasRoom(this.reject)) && this.ret.room(head.len / 2, head.len); // with the reject bag full a reject goes round too
        if (toRet) { this.line.shift(); this.ret.put({ p, len: head.len }, head.len / 2); p.at = 'recirculation'; this.lap(p); }
        else if (this.hasRoom(this.reject)) { this.line.shift(); if (p.target !== this.reject) { p.target = this.reject; this.stats.overflow++; } this.sorted(p, this.reject, { x: G.X1, y: G.yL }); }
        else hold = true; // nowhere to go: the line stops
      }
      if (hold) { this.stats.jam += dt; return; }
      // the slats move; a parcel crossing a chute of its destination with room is pushed off
      for (let k = 0; k < this.line.length; k++) {
        const it = this.line[k], s0 = it.s;
        it.ps = s0; it.s += v;
        if (it.p.target === this.reject) continue;
        for (const ch of this.chutesFor(it.p)) {
          if (ch.cell.side === 2 || !(s0 < ch.s && it.s >= ch.s) || !this.hasRoom(ch)) continue;
          this.divert(it, ch);
          this.line.splice(k, 1); k--;
          break;
        }
      }
      // the merge: a parcel coming round first, else the one waiting longest on an induct belt, once the gap behind the last one is long enough
      const last = this.line[this.line.length - 1], free = last ? last.s - last.len / 2 : Infinity;
      const rq = this.ret.front;
      let from = rq && this.ret.atEnd(rq) ? this.ret : null;
      if (!from) for (const q of this.feeds) { const f = q.front; if (f && f.endT != null && (!from || f.endT < from.front.endT)) from = q; }
      if (from && free >= c.gap) {
        const it = from.take();
        this.line.push({ p: it.p, s: -it.len / 2, ps: -it.len / 2, len: it.len });
        it.p.at = 'sorter';
        if (from === this.ret) this.stats.remerged++; else this.stats.merged++;
      } else if (from) this.stats.mergeWait += dt; // waiting at the merge for a gap
      // how much of the line the parcels and their gaps take up
      const used = this.line.reduce((a, it) => a + it.len + c.gap, 0), f = Math.exp(-dt / 120);
      this.lineFill = this.lineFill * f + Math.min(1, used / this.Ls) * (1 - f);
    }
    // the shoes push it across the slats into its chute; it lands in the bag after the slide
    divert(it, ch) {
      const c = this.cfg, G = this.G, x = G.X0 + ch.s;
      this.diverts.push({ p: it.p, ch, x, t: this.time, len: it.len });
      if (this.diverts.length > 40) this.diverts.shift();
      this.sorted(it.p, ch, { x: x + c.sorterSpeed * c.divertTime, y: G.yL + (ch.side ? 0.9 : -0.9) });
      this.drops[this.drops.length - 1].t += c.divertTime;
    }
    // where a parcel on the line is (m), for the views
    lineAt(it, alpha = 1) { const G = this.G; return { x: G.X0 + it.ps + (it.s - it.ps) * alpha, y: G.yL }; }
    // a breakdown stops the line and the belts (WS.Disruptions)
    stopLoop(on) { this.loopStopped = on; }
    mapMarks(alpha) {
      const out = this.line.map((it) => { const q = this.lineAt(it, alpha); return { x: q.x, y: q.y, state: it.p.laps ? 'round' : 'carry' }; });
      for (const [q, st] of [...this.feeds.map((f) => [f, 'merge']), [this.ret, 'round']]) for (const it of q.items) { const a = q.at(it.s); out.push({ x: a.x, y: a.y, state: st }); }
      return out;
    }
    get timeSplit() {
      return (this._split = this._split || {
        title: 'Parcels on the sorter', table: 'Going round',
        series: [{ k: 'carry', label: 'On the line', slot: 's1' }, { k: 'round', label: 'Going round', slot: 's2' }, { k: 'merge', label: 'On the induct belts', slot: 's3' }],
        sample: () => {
          const n = { carry: 0, round: 0, merge: 0 }, tot = Math.max(1, this.onSorter());
          for (const it of this.line) n[it.p.laps ? 'round' : 'carry']++;
          n.round += this.ret.items.length; for (const q of this.feeds) n.merge += q.items.length;
          for (const k in n) n[k] /= tot;
          return n;
        },
      });
    }
    extraAlerts() {
      const out = super.extraAlerts(), n = this.ret.items.length, cap = this.ret.len / 0.65;
      if (n > cap * 0.75) out.push({ sev: n > cap * 0.9 ? 'critical' : 'warning', key: 'ret', title: 'Recirculation belt filling up', msg: `${n} parcels going round` });
      if (this.stats.jam > 30) out.push({ sev: 'warning', key: 'jam', title: 'Line stopped', msg: `${WS.U.fmtDur(this.stats.jam)} today: the end of the line had nowhere to go` });
      return out;
    }
  }

  WS.ShoeSim = ShoeSim;
  WS.SHOE_PLEN = PLEN;
})((globalThis.WS = globalThis.WS || {}));
