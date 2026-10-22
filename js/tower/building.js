/* FloorStack's building: where everything stands on its three floors. x and
 * y are floor cells (as in RailRunner), the same on every floor; a floor's
 * height is FZ[f] in render levels. The shuttle store's racking fills the
 * first floor (WS.Racking's geometry: aisles along y, fronts at y = B);
 * in front of it run the conveyor lines of each floor:
 *
 *   first floor   a one-way loop: the near line runs west past the aisles'
 *                 outfeeds and infeeds and on past the tote lift and the
 *                 spiral up; the far line runs east back to the aisles,
 *                 past the tote lift's outfeed. The spiral down lands at its
 *                 east end.
 *   second floor  the station line runs east past the pick stations, from
 *                 the top of the spiral up to the top of the spiral down;
 *                 the return line takes totes round again.
 *   ground floor  the same loop for the goods-in stations, fed by the tote
 *                 lift from the first floor and back up it.
 *
 * Spirals are belts whose points climb; the tote lift (and in 'lift' mode
 * the links between the first and second floor) carry totes up and down a
 * shaft at one spot. The pick stations stand along y = D on the second
 * floor, the goods-in stations along the same row on the ground floor, so
 * the shared station layout (WS.Layout) holds for both. Packing is on the
 * second floor; its parcels go down the parcel spiral to the sorter on the
 * ground floor, along the north wall with the outbound dock doors. */
(function (WS) {
  'use strict';
  const R = 2, RP = 1.6; // spiral radius in cells: storage totes, parcels

  class TowerRacking extends WS.Racking {
    constructor(cfg, o) {
      super(cfg, o);
      const A = this.A, B = this.B, P = cfg.pickPorts, G = cfg.goodsInPorts, ZU = WS.RACK_ZU;
      // storey heights (render levels): the first floor fits the racking and its lifts
      this.FH = [14, Math.max(16, Math.ceil(this.Z + 3.2)), 10];
      this.FZ = [0, this.FH[0], this.FH[0] + this.FH[1]];
      this.roofZ = this.FZ[2] + this.FH[2]; this.SLAB = 0.8;
      // the conveyor lines in front of the racking
      this.nearY = B + 2.9; this.farY = this.nearY + 2 * R; // first floor
      this.lineY = this.farY; this.retY = this.lineY - 2; // station lines (ground and second floor) and the second floor's return line
      this.D = B + 8; // the stations' front, a spur's length past the station line
      this.W = Math.max(A * 3, 1 + 6 * Math.max(P, G, 1));
      this.X1 = A * 3 + 0.3; this.XW = -9.2; // the first floor's loop ends
      this.X2 = Math.max(6 * P - 2.5, 3.5); this.XL2 = -2.6; // the second floor's
      this.X0 = Math.max(6 * G - 2.5, 3.5); // the ground floor's east end
      // the tote lift between the ground and the first floor, the spirals between the first and the second
      this.giX = -2.4; this.giY = this.nearY + R;
      this.up = { cx: -6, cy: this.nearY - R - 1.1, r: R };
      this.down = { cx: Math.max(this.X2 + 1.6, this.X1 + R + 0.6), cy: this.nearY + R, r: R };
      // pick stations upstairs, goods-in stations on the ground floor, in the same row
      this.ports = [];
      const add = (kind, floor, k, n) => this.ports.push({ kind, floor, face: 'front', drop: { x: 1 + 6 * k, y: this.D - 1 }, lift: { x: 2 + 6 * k, y: this.D - 1 }, cells: [{ x: n * 3, y: this.L + 1 }, { x: n * 3 + 1, y: this.L + 1 }] });
      for (let k = 0; k < P; k++) add('PICK', 2, k, k);
      for (let k = 0; k < G; k++) add('GOODS_IN', 0, k, P + k);
      // packing (WS.Layout) ends at the parcel spiral, which drops to the sorter
      const dx = this.W + 2.4 + WS.packCount(cfg) * 2.6 + 1.6, dy = this.D + 3;
      this.parcel = { cx: dx + 0.2, cy: dy + RP, r: RP };
      this.SZ = 6.2; // the sorter runs high on the ground floor, the chutes drop to the roll cages
      this.sortY = 3; this.sortRY = 5.2; this.sortX1 = this.parcel.cx - RP - 2; this.sortX0 = 4;
      // outbound dock doors on the north wall, one per carrier, its chutes either side
      const n = WS.CARRIERS.length, span = this.sortX1 - this.sortX0 - 8;
      this.doors = WS.CARRIERS.map((c, k) => ({ k, carrier: c, x: this.sortX0 + 4 + (span * (k + 0.5)) / n }));
      this.chutes = [];
      for (const d of this.doors) for (let j = 0; j < cfg.chutesPerCarrier; j++) this.chutes.push({ door: d, carrier: d.carrier, x: d.x + (j - (cfg.chutesPerCarrier - 1) / 2) * 4.4 });
      this.chutes.sort((a, b) => b.x - a.x); // in the order the sort line passes them, running west
      this.cageY = -0.6;
      // the building: walls round all three floors
      this.bx0 = -11.8; this.by0 = -2.2; this.bx1 = this.parcel.cx + RP + 1.4; this.by1 = this.D + 9.6;
      // inbound dock doors on the west wall, pallet staging inside them
      this.inDoors = [{ k: 0, y: 9 }, { k: 1, y: 15 }];
      this.staging = []; for (let k = 0; k < 6; k++) this.staging.push({ x: -10.4 + (k % 2) * 1.6, y: 7.4 + Math.floor(k / 2) * 3 });
      // the staff core: the goods lift people ride, stairs beside it
      this.core = { x0: -11, x1: -8.2, y0: this.D + 4.4, y1: this.D + 7.6, doorX: -8.2 };
      this.core.cx = (this.core.x0 + this.core.x1) / 2; this.core.cy = (this.core.y0 + this.core.y1) / 2;
      this.walkY = [this.D + 4.6, null, this.D + 3.95]; // the walkway along the south side, per floor
      // the canteen on the ground floor
      this.canteen = { x0: 15, x1: 31, y0: this.D + 4.3, y1: this.D + 9.2 };
      this.seats = [];
      for (let t = 0; t < 3; t++) { const tx = 19 + t * 4.6, ty = this.canteen.y0 + 2.6; for (const [sx, sy] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) this.seats.push({ x: tx + sx, y: ty + sy, tx, ty, face: sy < 0 ? Math.PI : 0 }); }
      this.zs = ZU / cfg.cellSize; // cells per render level
    }
    floorZ(f) { return this.FZ[f]; }
    get floors() { return 3; }
  }

  // ---------------------------------------------------------------- belt geometry
  // Points along a helix round (cx, cy) of radius r, from angle a0 turning
  // `turns` times (dir +1: from +x towards +y), from height z0 to z1.
  WS.helix = (cx, cy, r, a0, dir, turns, z0, z1) => {
    const n = Math.max(8, Math.ceil(turns * 28)), pts = [];
    for (let k = 0; k <= n; k++) { const a = a0 + dir * turns * 2 * Math.PI * (k / n); pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), z: z0 + ((z1 - z0) * k) / n }); }
    return pts;
  };
  // the piece of a polyline from arc length u0 to u1
  WS.cutLine = (pts, u0, u1) => {
    const out = [];
    let u = 0;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], l = Math.hypot(b.x - a.x, b.y - a.y), at = (v) => ({ x: a.x + ((b.x - a.x) * (v - u)) / l, y: a.y + ((b.y - a.y) * (v - u)) / l });
      if (u + l > u0 + 1e-9 && u < u1 - 1e-9) {
        if (!out.length) out.push(u0 > u ? at(u0) : { x: a.x, y: a.y });
        out.push(u1 < u + l ? at(u1) : { x: b.x, y: b.y });
      }
      u += l;
    }
    return out;
  };
  WS.lineLen = (pts) => { let n = 0; for (let k = 1; k < pts.length; k++) n += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); return n; };
  // A closed loop cut into belts at arc lengths `cuts` (0 is always a cut):
  // each belt runs on into the next, which it feeds as its main line.
  WS.loopBelts = (net, name, pts, cuts, o) => {
    const len = WS.lineLen(pts), us = [...new Set([0, ...cuts.map((u) => Math.round(u * 1e6) / 1e6)])].filter((u) => u >= 0 && u < len).sort((a, b) => a - b);
    const segs = us.map((u, k) => net.belt(name, WS.cutLine(pts, u, k + 1 < us.length ? us[k + 1] : len), o));
    segs.forEach((s, k) => { const nx = segs[(k + 1) % segs.length]; s.exit = () => nx; s.next = nx; s.u0 = us[k]; });
    segs.forEach((s, k) => net.link(segs[(k + segs.length - 1) % segs.length], s));
    segs.len = len;
    return segs;
  };

  WS.TowerRacking = TowerRacking;
  WS.TOWER_R = R; WS.TOWER_RP = RP;
})((globalThis.WS = globalThis.WS || {}));
