/* Base for every floor battery robots drive on (CubeFlow's grid surface,
 * PodSwarm's floor, StackPilot's aisles): a W×D grid of cells with a type, the
 * robot holding each cell, traffic heat, and the queue lanes in front of
 * stations. A floor adds its layout and its traffic rules: passable(),
 * enterGoal() and canPark() for the router, mapFill() for the control room. */
(function (WS) {
  'use strict';
  const CELL = Object.assign(WS.CELL, { HIGHWAY: 3, LANE: 4, BLOCKED: 5 });

  class RobotFloor {
    constructor(W, D, fill) {
      this.W = W; this.D = D;
      const n = W * D;
      this.type = new Uint8Array(n).fill(fill);
      this.claim = new Int16Array(n).fill(-1); // robot holding the cell (single occupancy)
      this.colLock = new Int16Array(n).fill(-1); // robot owning the column for a lift/drop (cube)
      this.waitHeat = new Float32Array(n); // decaying seconds of traffic waiting per cell
      this.passHeat = new Float32Array(n); // decaying robot passes per cell
      this.laneOf = new Int16Array(n).fill(-1); // station whose queue lane this cell is
      this.laneIdx = new Int16Array(n).fill(-1); // position in the lane, 0 = entry
      this.portOf = new Int16Array(n).fill(-1); // station whose end cell this is
      this.dockOf = new Int8Array(n).fill(-1); // which of the station's docks a lane or end cell belongs to
      this.version = 0;
      this.ports = []; this.chargers = [];
    }
    idx(x, y) { return y * this.W + x; }
    cx(i) { return i % this.W; }
    cy(i) { return (i / this.W) | 0; }
    inside(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.D; }
    decayHeat(dt) {
      const f = Math.exp(-dt / 300); // 5-minute time constant
      for (let i = 0; i < this.waitHeat.length; i++) { this.waitHeat[i] *= f; this.passHeat[i] *= f; }
    }

    // ---------- station queue lanes ----------
    // A station p is served at one or more docks: a lane of cells (entered
    // from d.entry) ending at d.end, the cell where a robot is served. Without
    // p.docks the station has one dock made of p.lane and p.entry, ending at `end`.
    addStation(p, end) {
      const k = this.ports.length;
      p.docks = p.docks || [{ lane: p.lane, entry: p.entry, end }];
      p.cells = [];
      p.docks.forEach((d, n) => {
        d.n = n; d.cells = [...d.lane, d.end];
        d.lane.forEach((c, j) => { const i = this.idx(c.x, c.y); this.type[i] = CELL.LANE; this.laneOf[i] = k; this.laneIdx[i] = j; this.dockOf[i] = n; });
        const e = this.idx(d.end.x, d.end.y);
        this.type[e] = CELL.PORT; this.portOf[e] = k; this.dockOf[e] = n;
        p.cells.push(...d.cells);
      });
      this.ports.push(p);
    }
    // A lane cell is entered from the one before it (or the entry cell), a
    // dock's end cell only from the end of its lane, so robots queue in order.
    laneEnter(i, from) {
      const lane = this.type[i] === CELL.LANE, p = this.ports[lane ? this.laneOf[i] : this.portOf[i]], d = p.docks[this.dockOf[i]];
      const j = lane ? this.laneIdx[i] : d.lane.length, prev = j === 0 ? d.entry : d.lane[j - 1];
      return from === this.idx(prev.x, prev.y);
    }
  }

  WS.RobotFloor = RobotFloor;
})((globalThis.WS = globalThis.WS || {}));
