/* The pod floor: a W×D grid of cells, each the footprint of one pod.
 *  STORAGE  a pod may stand here (2 cells deep, so every pod touches a highway)
 *  HIGHWAY  kept free for driving
 *  LANE     queue lane in front of a station, entered in order
 *  PORT     the station cell where a pod is presented
 *  CHARGER  charging pad on the back wall
 *  BLOCKED  wall or unused
 * podAt[i] holds the id of the pod standing on cell i. */
(function (WS) {
  'use strict';
  const CELL = Object.assign(WS.CELL, { HIGHWAY: 3, LANE: 4, BLOCKED: 5 });

  class PodFloor {
    constructor(cfg) {
      this.cfg = cfg;
      this.W = cfg.floorW; this.D = cfg.floorD;
      this.Z = 6; // tallest thing on the floor, in render levels (pods with robot under them)
      const n = this.W * this.D;
      this.type = new Uint8Array(n).fill(CELL.BLOCKED);
      this.podAt = new Array(n).fill(null);
      this.podTarget = new Int16Array(n).fill(-1); // robot bringing a pod back to this cell
      this.laneOf = new Int16Array(n).fill(-1); // port whose queue lane this cell is
      this.laneIdx = new Int16Array(n).fill(-1); // position in the lane, 0 = entry
      this.claim = new Int16Array(n).fill(-1);
      this.colLock = new Int16Array(n).fill(-1); // unused for pods; the control room reads it
      this.waitHeat = new Float32Array(n);
      this.passHeat = new Float32Array(n);
      this.version = 0;
      this.ports = []; this.chargers = [];
      this.layout(cfg);
    }
    idx(x, y) { return y * this.W + x; }
    cx(i) { return i % this.W; }
    cy(i) { return (i / this.W) | 0; }
    inside(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.D; }
    isStorage(i) { return this.type[i] === CELL.STORAGE; }
    depthOf(i, id) { return this.podAt[i] === id ? 1 : -1; }

    layout(cfg) {
      const { W, D } = this, L = Math.max(1, cfg.portInboundCap - 1), bw = cfg.blockW;
      // Back wall (y = 0) with charging pads; a highway right in front of it.
      // Rows 2..D-3 repeat storage, storage, highway; row D-2 is the front highway
      // and row D-1 holds the station lanes. Column 0 and W-2 are highways,
      // column W-1 holds the goods-in lanes.
      for (let y = 1; y <= D - 2; y++) {
        for (let x = 0; x <= W - 2; x++) {
          const row = y === 1 || y === D - 2 || (y - 2) % 3 === 2;
          const col = x === 0 || x === W - 2 || (x - 1) % (bw + 1) === bw;
          this.type[this.idx(x, y)] = row || col ? CELL.HIGHWAY : CELL.STORAGE;
        }
      }
      this.type[this.idx(W - 1, 1)] = CELL.HIGHWAY;
      this.type[this.idx(W - 1, D - 2)] = CELL.HIGHWAY;
      // Pick stations on the front edge: a lane of L cells, then the station cell.
      for (let k = 0; k < cfg.pickPorts; k++) {
        const sx = 1 + L + k * (L + 3);
        if (sx > W - 4) break;
        const lane = [];
        for (let j = 0; j < L; j++) lane.push({ x: sx - L + j, y: D - 1 });
        this.addPort({ kind: 'PICK', face: 'front', drop: { x: sx, y: D - 1 }, lift: { x: sx, y: D - 2 }, lane, entry: { x: sx - L, y: D - 2 } });
      }
      // Goods-in stations on the right edge, lanes running down column W-1.
      for (let k = 0; k < cfg.goodsInPorts; k++) {
        const sy = 2 + L + k * (L + 3);
        if (sy > D - 4) break;
        const lane = [];
        for (let j = 0; j < L; j++) lane.push({ x: W - 1, y: sy - L + j });
        this.addPort({ kind: 'GOODS_IN', face: 'right', drop: { x: W - 1, y: sy }, lift: { x: W - 2, y: sy }, lane, entry: { x: W - 2, y: sy - L } });
      }
      // Chargers on the back wall, reached from the highway in front of it.
      for (let k = 0; k < cfg.chargers; k++) {
        const x = Math.min(W - 2, Math.max(0, Math.round(((k + 0.5) * (W - 1)) / cfg.chargers)));
        this.type[this.idx(x, 0)] = CELL.CHARGER;
        this.chargers.push({ id: k, x, y: 0, robot: -1 });
      }
    }
    addPort(p) {
      const k = this.ports.length;
      p.cells = [...p.lane, p.drop];
      p.lane.forEach((c, j) => { const i = this.idx(c.x, c.y); this.type[i] = CELL.LANE; this.laneOf[i] = k; this.laneIdx[i] = j; });
      this.type[this.idx(p.drop.x, p.drop.y)] = CELL.PORT;
      this.ports.push(p);
    }

    // ---------- traffic rules (used by the router) ----------
    // Highways are open to all. Storage cells: a robot carrying a pod only drives
    // over empty ones, an empty robot may also pass under pods (tunnelling).
    // Lanes are driven in order only; stations and chargers are destinations.
    passable(i, r, from) {
      const t = this.type[i];
      if (t === CELL.HIGHWAY) return true;
      if (t === CELL.LANE) return this.enterGoal(i, r, from);
      if (t !== CELL.STORAGE) return false;
      if (!this.podAt[i]) return true;
      return !!r && !r.bin && this.cfg.tunnelling !== 'off';
    }
    // A lane cell is entered from the one before it (or the entry highway), a
    // station only from the end of its lane, so pods queue in order.
    enterGoal(i, r, from) {
      const t = this.type[i];
      if (t === CELL.LANE) {
        const p = this.ports[this.laneOf[i]], j = this.laneIdx[i];
        const prev = j === 0 ? p.entry : p.lane[j - 1];
        return from === this.idx(prev.x, prev.y);
      }
      if (t === CELL.PORT) {
        const p = this.ports.find((q) => this.idx(q.drop.x, q.drop.y) === i), last = p.lane[p.lane.length - 1];
        return from === this.idx(last.x, last.y);
      }
      if (t === CELL.STORAGE && r && r.bin && this.podAt[i]) return false;
      return true;
    }
    // Idle robots wait on storage cells, under a pod when tunnelling is allowed.
    canPark(i) {
      if (this.type[i] !== CELL.STORAGE || this.podTarget[i] >= 0) return false;
      return this.cfg.tunnelling !== 'off' || !this.podAt[i];
    }

    // Control-room map: pods in blue, lanes and stations in amber.
    mapFill(i) {
      const t = this.type[i];
      if (t === CELL.STORAGE) return this.podAt[i] ? '#2a5d9e' : '#162033';
      return { [CELL.HIGHWAY]: '#0c1220', [CELL.LANE]: '#2a2208', [CELL.PORT]: '#3a2a0a', [CELL.CHARGER]: '#0f3321' }[t] || '#070b12';
    }
    get mapTitle() { return 'FLOOR · blue = pod'; }

    decayHeat(dt) {
      const f = Math.exp(-dt / 300);
      for (let i = 0; i < this.waitHeat.length; i++) { this.waitHeat[i] *= f; this.passHeat[i] *= f; }
    }
  }

  WS.PodFloor = PodFloor;
})((globalThis.WS = globalThis.WS || {}));
