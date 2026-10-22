/* Fleet Manager ("the router"). Space-reservation traffic control:
 *  - A* over the grid surface (direction-aware, so X⇄Y track changes cost time)
 *  - moving-block reservation: a robot may only move into cells it has claimed,
 *    and always claims at least its braking distance ahead (single occupancy)
 *  - robots holding a winch over a column are hard obstacles
 *  - wait → re-route → evasive step, and idle robots are asked to yield,
 *    which resolves head-on conflicts, gridlock and deadlock cycles. */
(function (WS) {
  'use strict';
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];

  class Router {
    constructor(sim) {
      this.sim = sim;
      const c = sim.cfg;
      this.vmax = c.vmax / c.cellSize; // cells/s
      this.acc = c.accel / c.cellSize;
      this.brk = c.brake / c.cellSize;
      this.turnCost = c.wheelShift + this.vmax / this.acc;
      this.replans = 0; this.evasions = 0; this.yields = 0;
    }

    // ---------- path planning ----------
    plan(r, gx, gy, avoidStopped) {
      const sim = this.sim, g = sim.grid, W = g.W, n = W * g.D;
      const start = g.idx(r.x, r.y), goal = g.idx(gx, gy);
      if (g.oneRoute) avoidStopped = false; // a floor with one route only (a one-way ring): planning round stopped robots finds none
      if (start === goal) return [{ x: r.x, y: r.y }];
      const robots = sim.fleet;
      const cellCost = 1 / this.vmax;
      const blocked = (i, from) => {
        if (i === goal) return g.enterGoal ? !g.enterGoal(i, r, from) : false;
        if (!g.passable(i, r, from)) return true; // e.g. ports & chargers only as destinations
        const o = g.claim[i];
        if (o < 0 || o === r.id) return false;
        const ro = robots[o];
        if (ro.busy) return true; // winch down / charging / port handling
        return avoidStopped && ro.v === 0 && !ro.shift;
      };
      const extra = (i) => {
        let c = Math.min(g.waitHeat[i] * 0.04, 2.5);
        const o = g.claim[i];
        if (o >= 0 && o !== r.id) {
          const ro = robots[o];
          c += !ro.task ? 3 : ro.v === 0 ? 4 : 0.6;
        }
        return c;
      };
      const S = n * 5; // state = cell*5 + dir (4 = no heading yet)
      // Float64: with Float32 costs the search skips entries as stale on long routes (above about 30 s)
      const gs = new Float64Array(S).fill(Infinity);
      const prev = new Int32Array(S).fill(-1);
      const h = (i) => (Math.abs((i % W) - gx) + Math.abs(((i / W) | 0) - gy)) * cellCost;
      const heap = new WS.U.Heap((a, b) => a[0] - b[0]);
      const s0 = start * 5 + 4;
      gs[s0] = 0; heap.push([h(start), s0]);
      let found = -1, expanded = 0;
      while (heap.size) {
        const [f, s] = heap.pop();
        const ci = (s / 5) | 0, dir = s % 5, gcur = gs[s];
        if (f - h(ci) > gcur + 1e-6) continue;
        if (ci === goal) { found = s; break; }
        if (++expanded > 20000) break;
        const x = ci % W, y = (ci / W) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= W || ny >= g.D) continue;
          const ni = ny * W + nx;
          if (blocked(ni, ci)) continue;
          let cost = cellCost + extra(ni);
          const axis = d < 2 ? 'x' : 'y';
          if (dir === 4) { if (axis !== r.axis) cost += this.sim.cfg.wheelShift; cost += this.vmax / this.acc * 0.5; }
          else if ((dir < 2) !== (d < 2)) cost += this.turnCost;
          else if (dir !== d) cost += this.turnCost * 2; // reversal
          const ns = ni * 5 + d, ng = gcur + cost;
          if (ng < gs[ns]) { gs[ns] = ng; prev[ns] = s; heap.push([ng + h(ni), ns]); }
        }
      }
      if (found < 0) return null;
      const path = [];
      for (let s = found; s >= 0; s = prev[s]) { const ci = (s / 5) | 0; path.push({ x: ci % W, y: (ci / W) | 0 }); }
      path.reverse();
      return path;
    }

    // ---------- claims ----------
    claimCell(r, i) {
      const g = this.sim.grid;
      if (g.claim[i] === r.id) return true;
      if (g.claim[i] >= 0) return false;
      g.claim[i] = r.id; r.claims.add(i);
      return true;
    }
    releaseCell(r, i) {
      const g = this.sim.grid;
      if (g.claim[i] === r.id) g.claim[i] = -1;
      r.claims.delete(i);
    }
    releaseAllBut(r, keep) {
      for (const i of Array.from(r.claims)) if (i !== keep) this.releaseCell(r, i);
    }

    // ---------- motion ----------
    setGoal(r, gx, gy) {
      this.releaseAllBut(r, this.sim.grid.idx(r.x, r.y));
      r.goal = { x: gx, y: gy }; r.path = null; r.pi = 0; r.prog = 0; r.detour = false;
      r.wait = 0; r.waitTotal = 0; r.replanIn = 0;
    }
    // Advance robot r toward its goal by dt. Returns true once arrived.
    step(r, dt) {
      const g = this.sim.grid, cfg = this.sim.cfg;
      r.blocked = false;
      if (r.shift > 0) { r.shift -= dt; if (r.shift < 0) r.shift = 0; return false; }
      if (!r.path) {
        if (r.x === r.goal.x && r.y === r.goal.y) return true;
        if (r.replanIn > 0) { r.replanIn -= dt; r.blocked = true; r.wait += dt; return false; }
        r.path = this.plan(r, r.goal.x, r.goal.y, r.waitTotal > 0);
        r.pi = 0; r.prog = 0;
        if (!r.path) { r.replanIn = 0.8 + this.sim.rng() * 0.8; r.blocked = true; return false; }
      }
      const path = r.path;
      let k = r.pi;
      if (k === path.length - 1 && r.prog === 0) {
        r.v = 0; r.path = null;
        if (r.detour) { r.detour = false; return false; } // evasive step done → re-route to the real goal
        return r.x === r.goal.x && r.y === r.goal.y;
      }
      const a = path[k], b = path[k + 1];
      const axis = a.x !== b.x ? 'x' : 'y';
      if (r.prog === 0 && r.v === 0 && axis !== r.axis) { r.axis = axis; r.shift = cfg.wheelShift; return false; }
      const ddx = b.x - a.x, ddy = b.y - a.y;
      let e = k + 1;
      while (e + 1 < path.length && path[e + 1].x - path[e].x === ddx && path[e + 1].y - path[e].y === ddy) e++;

      // claim braking distance ahead within the straight segment
      const bd = (r.v * r.v) / (2 * this.brk);
      const want = Math.min(e, k + Math.ceil(r.prog + bd + 1e-6) + 1);
      let L = k, blocker = -1;
      for (let j = k + 1; j <= want; j++) {
        const ci = g.idx(path[j].x, path[j].y);
        if (this.claimCell(r, ci)) L = j;
        else { blocker = g.claim[ci]; break; }
      }
      // A floor may name cells a robot must not stop in (g.noStop: crossings,
      // where it would block the crossing street): claim on through them
      // along the straight, or stop before them.
      if (g.noStop) {
        const stop = (j) => j === path.length - 1 || !g.noStop(g.idx(path[j].x, path[j].y));
        while (L > k && L < e && !stop(L)) {
          const ci = g.idx(path[L + 1].x, path[L + 1].y);
          if (this.claimCell(r, ci)) L++; else { blocker = g.claim[ci]; break; }
        }
        if (!stop(L) && L < e) { while (L > k && !stop(L)) { this.releaseCell(r, g.idx(path[L].x, path[L].y)); L--; } }
      }
      const dist = L - k - r.prog;
      if (dist <= 1e-6) { r.v = 0; this.onBlocked(r, dt, path[k + 1], blocker); return false; }
      r.wait = 0;
      const vAllowed = Math.sqrt(2 * this.brk * dist);
      let v = Math.min(this.vmax, r.v + this.acc * dt, vAllowed);
      if (v < 0.05) v = Math.min(0.05, dist / dt);
      const stepLen = v * dt;
      if (stepLen >= dist - 1e-4) {
        for (let j = k; j < L; j++) this.enterNext(r, path, j);
        r.pi = L; r.prog = 0; r.v = L === e ? 0 : v;
      } else {
        r.prog += stepLen;
        while (r.prog >= 1) { r.prog -= 1; this.enterNext(r, path, r.pi); r.pi++; }
        r.v = v;
      }
      r.moved += stepLen;
      return false;
    }
    enterNext(r, path, j) {
      // robot reached the centre of path[j+1]: free path[j]
      const g = this.sim.grid;
      this.releaseCell(r, g.idx(path[j].x, path[j].y));
      r.x = path[j + 1].x; r.y = path[j + 1].y;
      g.passHeat[g.idx(r.x, r.y)] += 1;
    }

    onBlocked(r, dt, next, blocker) {
      const sim = this.sim, g = sim.grid;
      r.blocked = true; r.wait += dt; r.waitTotal += dt;
      g.waitHeat[g.idx(next.x, next.y)] += dt;
      if (blocker >= 0) {
        const o = sim.fleet[blocker];
        if (!o.task) this.requestYield(o, r);
      }
      if (r.wait > r.patience) {
        // re-route around stopped robots; release look-ahead claims first
        r.wait = 0; r.patience = 1.2 + sim.rng() * 1.6;
        this.releaseAllBut(r, g.idx(r.x, r.y));
        const p = this.plan(r, r.goal.x, r.goal.y, true);
        this.replans++;
        if (p) { r.path = p; r.pi = 0; r.prog = 0; }
      }
      if (r.waitTotal > r.evadeAt) {
        r.waitTotal = 0; r.evadeAt = 5 + sim.rng() * 6;
        this.evade(r, next);
      }
    }
    // Step aside to a random free neighbour to break symmetric deadlocks.
    evade(r, avoid) {
      const g = this.sim.grid, opts = [];
      for (let d = 0; d < 4; d++) {
        const nx = r.x + DX[d], ny = r.y + DY[d];
        if (!g.inside(nx, ny) || (nx === avoid.x && ny === avoid.y)) continue;
        const i = g.idx(nx, ny);
        if (!g.passable(i, r, g.idx(r.x, r.y)) || g.claim[i] >= 0) continue;
        opts.push({ x: nx, y: ny });
      }
      if (!opts.length) return;
      const t = opts[Math.floor(this.sim.rng() * opts.length)];
      this.releaseAllBut(r, g.idx(r.x, r.y));
      r.path = [{ x: r.x, y: r.y }, t]; r.pi = 0; r.prog = 0; r.detour = true;
      this.evasions++;
    }

    // Ask an idle robot to move off a requester's route.
    requestYield(o, requester) {
      const sim = this.sim, g = sim.grid;
      if (o.task || o.busy || o.yieldCooldown > 0) return;
      const avoid = new Set();
      if (requester.path) for (let j = requester.pi; j < Math.min(requester.path.length, requester.pi + 14); j++) avoid.add(g.idx(requester.path[j].x, requester.path[j].y));
      if (requester.goal) avoid.add(g.idx(requester.goal.x, requester.goal.y));
      // BFS for the nearest free storage cell off the requester's path
      const start = g.idx(o.x, o.y), seen = new Uint8Array(g.W * g.D), q = [start];
      seen[start] = 1;
      let target = -1;
      for (let h = 0; h < q.length && h < 400; h++) {
        const ci = q[h];
        if (ci !== start && !avoid.has(ci) && g.claim[ci] < 0 && g.canPark(ci, o)) { target = ci; break; }
        const x = ci % g.W, y = (ci / g.W) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (!g.inside(nx, ny)) continue;
          const ni = g.idx(nx, ny);
          if (seen[ni] || !g.passable(ni, o, ci)) continue;
          const c = g.claim[ni];
          if (c >= 0 && c !== o.id && sim.fleet[c].busy) continue;
          seen[ni] = 1; q.push(ni);
        }
      }
      if (target < 0) return;
      o.yieldCooldown = 2;
      this.yields++;
      sim.assignTask(o, { type: 'YIELD', x: g.cx(target), y: g.cy(target), priority: 0 });
    }
  }

  WS.Router = Router;
})((globalThis.WS = globalThis.WS || {}));
