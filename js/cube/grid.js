/* The grid: a W×D surface of cells on which robots travel, with a column of
 * up to Z stacked bins below every storage cell — the [X][Y][Z] matrix.
 * stacks[i][z] holds a bin id; z = 0 is the floor, the last element is the
 * top-most (accessible) bin. "Depth" is counted from the top: depth 1 = top. */
(function (WS) {
  'use strict';
  const CELL = WS.CELL;

  class Grid {
    constructor(cfg) {
      this.W = cfg.gridW; this.D = cfg.gridD; this.Z = cfg.gridZ;
      const n = this.W * this.D;
      this.type = new Uint8Array(n);
      this.stacks = Array.from({ length: n }, () => []);
      this.claim = new Int16Array(n).fill(-1); // robot holding the cell (single occupancy)
      this.colLock = new Int16Array(n).fill(-1); // robot owning the column for a lift/drop
      this.waitHeat = new Float32Array(n); // decaying seconds of traffic waiting per cell
      this.passHeat = new Float32Array(n); // decaying robot passes per cell
      this.version = 0; // bumped whenever a stack changes (renderer cache key)
      this.ports = []; this.chargers = [];
      this.layout(cfg);
    }
    idx(x, y) { return y * this.W + x; }
    cx(i) { return i % this.W; }
    cy(i) { return (i / this.W) | 0; }
    inside(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.D; }
    isStorage(i) { return this.type[i] === CELL.STORAGE; }
    // Traffic rules used by the router: robots drive over storage cells only;
    // ports and chargers are destinations, never thoroughfares.
    passable(i) { return this.type[i] === CELL.STORAGE; }
    canPark(i) { return this.type[i] === CELL.STORAGE; }
    // Control-room map: cell colour (stack height) and caption.
    mapFill(i, mix) {
      const t = this.type[i];
      return t === CELL.STORAGE ? mix('#131c2c', '#2a5d9e', this.stacks[i].length / this.Z) : t === CELL.PORT ? '#3a2a0a' : '#0f3321';
    }
    get mapTitle() { return 'GRID SURFACE · fill = stack height'; }
    height(i) { return this.stacks[i].length; }
    // [X][Y][Z] accessor, z counted from the floor
    binAt(x, y, z) { return this.stacks[this.idx(x, y)][z]; }
    depthOf(i, binId) {
      const s = this.stacks[i], k = s.lastIndexOf(binId);
      return k < 0 ? -1 : s.length - k;
    }

    layout(cfg) {
      const { W, D } = this;
      // Pick ports on the front face (y = D-1), conveyor ports with a drop and a lift cell
      for (let k = 0; k < cfg.pickPorts; k++) {
        const px = 2 + k * 6;
        if (px + 1 >= W - 1) break;
        this.ports.push({ kind: 'PICK', face: 'front', drop: { x: px, y: D - 1 }, lift: { x: px + 1, y: D - 1 } });
      }
      // Goods-in (decant) ports on the right face (x = W-1)
      for (let k = 0; k < cfg.goodsInPorts; k++) {
        const gy = 2 + k * 5;
        if (gy + 1 >= D - 1) break;
        this.ports.push({ kind: 'GOODS_IN', face: 'right', drop: { x: W - 1, y: gy }, lift: { x: W - 1, y: gy + 1 } });
      }
      for (const p of this.ports) {
        p.cells = [p.drop, p.lift];
        this.type[this.idx(p.drop.x, p.drop.y)] = CELL.PORT;
        this.type[this.idx(p.lift.x, p.lift.y)] = CELL.PORT;
      }
      // Chargers on the back edge
      for (let k = 0; k < cfg.chargers; k++) {
        const x = Math.min(W - 1, Math.round(((k + 0.5) * W) / cfg.chargers));
        const i = this.idx(x, 0);
        this.type[i] = CELL.CHARGER;
        this.chargers.push({ id: k, x, y: 0, robot: -1 });
      }
    }

    decayHeat(dt) {
      const f = Math.exp(-dt / 300); // 5-minute time constant
      for (let i = 0; i < this.waitHeat.length; i++) { this.waitHeat[i] *= f; this.passHeat[i] *= f; }
    }
  }

  WS.Grid = Grid;
})((globalThis.WS = globalThis.WS || {}));
