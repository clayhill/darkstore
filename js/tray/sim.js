/* TrayLoop: a tilt-tray sorter (specs/tray.txt). Trays run round a loop past
 * the inducts and the chutes. An induct puts its parcel on the next empty
 * tray; at a chute of the parcel's destination with room the tray tilts and
 * the parcel slides in. When that chute is full the parcel goes round again,
 * and after maxLaps to the reject chute. The parcel stream, inducts, chutes
 * and bags are those of every parcel sorter (js/hub/sim.js). */
(function (WS) {
  'use strict';
  const C = WS.CELL;
  const STATE_LABELS = {};
  const LEGEND = ['IDLE'];

  // ---------------------------------------------------------------- floor
  // The loop, its chutes and the inducts, as a map (nothing drives on it).
  // Top straight: the inducts, then chutes; bottom straight: the rest of the
  // chutes. Chute and induct slot k on the top straight at x = X0+1.5+2k (an
  // induct takes the first K slots), on the bottom straight from the right
  // end. Loop position u runs along the top straight to the right, round the
  // right end, back along the bottom and round the left end.
  class LoopFloor extends WS.HubFloor {
    constructor(cfg) {
      const K = cfg.inducts, n = cfg.chutes, slots = Math.ceil((n + K) / 2), S = 2 * slots + 2;
      super(cfg, S + 12, 15);
      Object.assign(this, { slots, S, X0: 4, X1: 4 + S, Yt: 5, Yb: 9, r: 2 });
      this.Lp = 2 * S + 2 * Math.PI * this.r; // loop length (cells)
      this.layoutLoop(cfg);
    }
    layoutLoop(cfg) {
      const { X0, X1, Yt, Yb } = this, K = cfg.inducts;
      for (let x = X0; x < X1; x++) for (const y of [Yt, Yb]) this.type[this.idx(x, y)] = C.HIGHWAY;
      for (let y = Yt; y <= Yb; y++) { this.type[this.idx(X0 - 1, y)] = C.HIGHWAY; this.type[this.idx(X1, y)] = C.HIGHWAY; }
      this.slotsTop = []; this.slotsBottom = [];
      for (let k = 0; k < this.slots; k++) {
        this.slotsTop.push({ x: X0 + 1.5 + 2 * k, y: Yt - 2, u: 1.5 + 2 * k, side: 0 });
        this.slotsBottom.push({ x: X1 - 1.5 - 2 * k, y: Yb + 2, u: this.S + Math.PI * this.r + 1.5 + 2 * k, side: 1 });
      }
      for (let k = 0; k < K; k++) {
        const s = this.slotsTop[k], cx = Math.floor(s.x), cell = { x: cx, y: s.y };
        this.type[this.idx(cx, s.y)] = C.PORT;
        this.ports.push({ kind: 'INDUCT', face: 'front', drop: cell, lift: cell, cells: [cell], slot: s });
      }
    }
    // Where loop position u is: { x, y, a } with a the direction of travel.
    loopAt(u) {
      const { X0, X1, Yt, Yb, S, r } = this, my = (Yt + Yb) / 2, arc = Math.PI * r;
      u = ((u % this.Lp) + this.Lp) % this.Lp;
      if (u < S) return { x: X0 + u, y: Yt, a: 0 };
      if (u < S + arc) { const t = (u - S) / r; return { x: X1 + r * Math.sin(t), y: my - r * Math.cos(t), a: t }; }
      if (u < 2 * S + arc) return { x: X1 - (u - S - arc), y: Yb, a: Math.PI };
      const t = (u - 2 * S - arc) / r;
      return { x: X0 - r * Math.sin(t), y: my + r * Math.cos(t), a: Math.PI + t };
    }
    get mapTitle() { return 'LOOP · chutes by bag fill, red = full · dots: trays, coloured as in Tray occupancy'; }
  }

  // ---------------------------------------------------------------- simulation
  class TraySim extends WS.HubSim {
    get kind() { return 'tray'; }
    get stateLabels() { return STATE_LABELS; }
    get legendStates() { return LEGEND; }
    get taskTypes() { return {}; }
    defaults() { return WS.TRAY_CONFIG; }
    createGrid() { const g = new LoopFloor(this.cfg); g.sim = this; return g; }
    describe() { const c = this.cfg; return `Tilt-tray loop online · ${c.inducts} inducts · ${this.chutes.length} chutes for ${c.destinations} destinations · ${this.trays.length} trays`; }
    get chuteSounds() { return true; } // a tray tipping a parcel into its chute
    get soundLoop() { const g = this.grid; return { x: (g.X0 + g.X1) / 2, y: (g.Yt + g.Yb) / 2 }; } // the tray chain never stops

    chuteSpots() { const g = this.grid; return [...g.slotsTop.slice(this.cfg.inducts), ...g.slotsBottom]; }
    // bag workers start at the far end, one on each side
    workerStart(k) { const g = this.grid; return { x: g.X1 + 3.5, y: k % 2 ? g.Yb + 3.4 : g.Yt - 3.4 }; }
    servicePoint(ch) { const g = this.grid; return { x: ch.x, y: ch.side ? g.Yb + 3.4 : g.Yt - 3.4 }; }
    // the aisles outside the chutes, round the far end to change sides
    workerPath(w, ch) { const g = this.grid; return this.aislePath(w, ch, g.Yt - 3.4, g.Yb + 3.4, g.X1 + 3.5); }
    seedSorter() {
      const cfg = this.cfg, g = this.grid, pitch = cfg.trayPitch / cfg.cellSize, nt = Math.floor(g.Lp / pitch);
      this.trayPitch = g.Lp / nt; this.offset = 0;
      this.trays = Array.from({ length: nt }, (_, k) => ({ id: k, parcel: null, tilt: -1e9 }));
      // loop positions where something happens, in order
      this.points = [...this.ports.map((p) => ({ u: p.slot.u, port: p })), ...this.chutes.map((ch) => ({ u: ch.u, chute: ch })), { u: 0, lap: true }].sort((a, b) => a.u - b.u);
    }
    onSorter() { return this.trays.filter((t) => t.parcel).length; }

    // Trays move round the loop at loop speed. A tray passing an induct takes
    // the parcel ready there if it is empty; passing one of its parcel's
    // chutes, it tips the parcel in if the bag has room. A parcel that
    // passes the start of the loop again has done a lap.
    stepSorter(dt) {
      if (this.loopStopped) return;
      const cfg = this.cfg, g = this.grid, v = (cfg.loopSpeed / cfg.cellSize) * dt, P = this.points;
      const prev = this.offset;
      this.offset = (this.offset + v) % g.Lp;
      for (const tr of this.trays) {
        const u0 = (prev + tr.id * this.trayPitch) % g.Lp;
        for (const pt of P) {
          const du = (pt.u - u0 + g.Lp) % g.Lp;
          if (du >= v) continue;
          const p = tr.parcel;
          if (pt.port) {
            if (!p && pt.port.ready) { tr.parcel = pt.port.ready; pt.port.ready = null; tr.parcel.at = 'tray ' + (tr.id + 1); this.loaded(tr.parcel, pt.port); }
          } else if (pt.lap) {
            if (p) this.lap(p);
          } else if (p && this.chutesFor(p).includes(pt.chute) && this.hasRoom(pt.chute)) {
            tr.parcel = null; tr.tilt = this.time;
            const at = g.loopAt(pt.u);
            this.sorted(p, pt.chute, at);
          }
        }
      }
    }
    trayAt(tr, alpha = 1) { const g = this.grid; return g.loopAt(this.offset + tr.id * this.trayPitch - (this.loopStopped ? 0 : (1 - alpha) * (this.cfg.loopSpeed / this.cfg.cellSize) * this.cfg.tick)); }
    // a breakdown stops the whole loop (WS.Disruptions)
    stopLoop(on) { this.loopStopped = on; }
    trayState(tr) { const p = tr.parcel; return !p ? 'empty' : p.target === this.reject ? 'reject' : p.laps ? 'round' : 'carry'; }
    // The control room has no robots to show: its time split chart, table and map show the trays instead.
    get timeSplit() {
      return (this._split = this._split || {
        title: 'Tray occupancy', table: 'Loaded trays',
        series: [{ k: 'carry', label: 'Carrying', slot: 's1' }, { k: 'round', label: 'Going round', slot: 's2' }, { k: 'reject', label: 'To reject', slot: 's4' }, { k: 'empty', label: 'Empty', slot: 's3' }],
        sample: () => {
          const n = { carry: 0, round: 0, reject: 0, empty: 0 };
          for (const tr of this.trays) n[this.trayState(tr)]++;
          for (const k in n) n[k] /= this.trays.length || 1;
          return n;
        },
      });
    }
    mapMarks(alpha) { return this.trays.map((tr) => { const q = this.trayAt(tr, alpha); return { x: q.x, y: q.y, state: this.trayState(tr) }; }); }
  }

  WS.TraySim = TraySim;
})((globalThis.WS = globalThis.WS || {}));
