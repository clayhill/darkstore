/* The AisleMate floor: static shelving in rows along y with aisles two
 * cells wide between them, cross-aisles at the back and the front, and the
 * stations along the front and right edges.
 *  STORAGE  a shelf bay (one stock location), robots cannot enter
 *  HIGHWAY  aisles and cross-aisles, open to robots and pickers
 *  LANE     queue lane in front of a station, entered in order
 *  PORT     where a robot stands while the station operator swaps its totes
 *  CHARGER  charging pad on the back wall
 *  PARK     where idle robots wait, along the front edge and the back wall
 *  BLOCKED  wall
 * Aisle a: shelves at x = 4a (facing x = 4a+1) and x = 4a+3 (facing 4a+2). */
(function (WS) {
  'use strict';
  const CELL = Object.assign(WS.CELL, { PARK: WS.CELL.PARK ?? 7 }); // the same number as StackPilot's parking

  class ShelfFloor extends WS.RobotFloor {
    constructor(cfg) {
      const A = cfg.aisles, B = cfg.bays;
      super(4 * A + 2, B + 6, CELL.BLOCKED);
      this.cfg = cfg; this.A = A; this.B = B;
      this.Y0 = 3; // first shelf row; row 1 is parking along the back wall, row 2 the back cross-aisle
      this.Z = 5.4; // shelf top (render levels)
      this.binAt = new Array(this.W * this.D).fill(null); // stock location on each shelf cell
      this.layout(cfg);
    }
    isShelf(i) { return this.type[i] === CELL.STORAGE; }
    isStorage(i) { return this.isShelf(i); }
    depthOf() { return 1; }
    aisleOf(x) { return Math.floor(x / 4); }
    // the aisle cell a robot stops at to have a shelf cell picked from
    stopCell(x, y) { return { x: x % 4 === 0 ? x + 1 : x - 1, y }; }
    // shelf side: 0 left of its aisle, 1 right
    sideOf(x) { return x % 4 === 0 ? 0 : 1; }

    layout(cfg) {
      const { W, D, A, B, Y0 } = this, L = cfg.stationLane;
      for (let y = 1; y <= D - 2; y++) for (let x = 0; x <= W - 2; x++) {
        const shelf = x < 4 * A && y >= Y0 && y < Y0 + B && (x % 4 === 0 || x % 4 === 3);
        this.type[this.idx(x, y)] = shelf ? CELL.STORAGE : CELL.HIGHWAY;
      }
      // stations, as on the pod floor: a lane of L cells along the edge ending
      // at the cell where the robot is served. at(u, v): u along the edge, v in from it
      const station = (kind, face, s, at) => {
        const lane = [];
        for (let j = L; j >= 1; j--) lane.push(at(s - j, 0));
        const docks = [{ lane, entry: at(s - L, 1), end: at(s, 0) }];
        this.addStation({ kind, face, drop: docks[0].end, lift: at(s, 1), points: 1, docks }, docks[0].end);
      };
      const pitch = L + 3;
      for (let k = 0; k < cfg.pickPorts; k++) {
        const sx = 1 + L + k * pitch;
        if (sx > W - 3) break;
        station('PICK', 'front', sx, (u, v) => ({ x: u, y: D - 1 - v }));
      }
      for (let k = 0; k < cfg.goodsInPorts; k++) {
        const sy = Y0 + L + k * pitch;
        if (sy > D - 3) break;
        station('GOODS_IN', 'right', sy, (u, v) => ({ x: W - 1 - v, y: u }));
      }
      // the rest of the front edge: parking for idle robots
      for (let x = 0; x <= W - 2; x++) { const i = this.idx(x, D - 1); if (this.type[i] === CELL.BLOCKED) this.type[i] = CELL.PARK; }
      // chargers on the back wall, reached from the back cross-aisle
      for (let k = 0; k < cfg.chargers; k++) {
        const x = Math.min(W - 2, Math.max(0, Math.round(((k + 0.5) * (W - 1)) / cfg.chargers)));
        this.type[this.idx(x, 0)] = CELL.CHARGER;
        this.chargers.push({ id: k, x, y: 0, robot: -1 });
      }
      // and along the back wall too, except in front of the chargers
      for (let x = 0; x <= W - 2; x++) if (this.type[this.idx(x, 0)] !== CELL.CHARGER) this.type[this.idx(x, 1)] = CELL.PARK;
    }

    // ---------- traffic rules (used by the router) ----------
    // Aisles and the parking row are open to all (robots asked to make way
    // find a parking place through them); lanes are driven in order;
    // stations and chargers are destinations only.
    passable(i, r, from) {
      const t = this.type[i];
      if (t === CELL.HIGHWAY || t === CELL.PARK) return true;
      if (t === CELL.LANE) return from != null && this.laneEnter(i, from);
      return false;
    }
    enterGoal(i, r, from) {
      const t = this.type[i];
      if (t === CELL.LANE || t === CELL.PORT) return this.laneEnter(i, from);
      return t !== CELL.STORAGE && t !== CELL.BLOCKED;
    }
    canPark(i) { return this.type[i] === CELL.PARK; }
    // pickers walk the aisles and cross-aisles
    walkable(x, y) { return this.inside(x, y) && this.type[this.idx(x, y)] === CELL.HIGHWAY; }

    // Control-room map: shelves by how full they are, stations in amber.
    mapFill(i, mix) {
      const t = this.type[i];
      if (t === CELL.STORAGE) {
        const id = this.binAt[i], b = id && this.sim ? this.sim.inv.binById.get(id) : null;
        return b ? mix('#131c2c', '#2a5d9e', b.comps.filter((c) => c.qty > 0).length / b.ncomp) : '#131c2c';
      }
      return { [CELL.HIGHWAY]: '#0c1220', [CELL.LANE]: '#2a2208', [CELL.PORT]: '#3a2a0a', [CELL.CHARGER]: '#0f3321', [CELL.PARK]: '#101b2e' }[t] || '#070b12';
    }
    get mapTitle() { return 'FLOOR · blue = stocked shelf'; }
  }

  WS.ShelfFloor = ShelfFloor;
})((globalThis.WS = globalThis.WS || {}));
