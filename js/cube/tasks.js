/* CubeFlow robot tasks: dig a bin out of its stack and deliver it to a port,
 * store a bin from a port on a stack, and put dug-out blockers back. */
(function (WS) {
  'use strict';
  const T = Object.assign({}, WS.Tasks);
  const portDepth = (sim) => (sim.grid.Z - 0.6) * sim.cfg.binHeight;

  // Robot over column i lifts the top bin into its cavity.
  function* liftTop(sim, r, i, bin) {
    const g = sim.grid, bh = sim.cfg.binHeight;
    r.busy = true;
    yield { op: 'winch', to: (g.Z - g.stacks[i].length + 1) * bh };
    yield { op: 'grip' };
    sim.liftFromStack(bin, i, r.id);
    r.bin = bin.id; r.lifts++;
    yield { op: 'winch', to: 0 };
    r.busy = false;
  }
  // Robot over column i lowers its bin on top of the stack.
  function* dropOn(sim, r, i) {
    const g = sim.grid, bh = sim.cfg.binHeight, bin = sim.inv.binById.get(r.bin);
    r.busy = true;
    yield { op: 'winch', to: (g.Z - g.stacks[i].length) * bh };
    yield { op: 'release' };
    sim.placeOnStack(bin, i);
    r.bin = null;
    yield { op: 'winch', to: 0 };
    r.busy = false;
  }
  function* deliverToPort(sim, r, port) {
    const bin = sim.inv.binById.get(r.bin);
    r.state = 'TRANSPORTING_TO_PORT';
    yield { op: 'move', x: port.drop.x, y: port.drop.y };
    r.state = 'AT_PORT';
    yield { op: 'until', fn: () => port.canAccept(), waitState: 'WAITING_PORT' };
    port.entryReserved = true;
    r.busy = true;
    yield { op: 'winch', to: portDepth(sim) };
    yield { op: 'release' };
    r.bin = null;
    port.receive(bin);
    yield { op: 'winch', to: 0 };
    r.busy = false;
  }

  // Fetch a bin from the grid, digging out blockers, and deliver it to a port.
  T.RETRIEVE = function* (sim, r, t) {
    const g = sim.grid, inv = sim.inv, bin = t.bin;
    const col = inv.binColumn(bin), cx = g.cx(col), cy = g.cy(col);
    r.state = 'MOVING_TO_TARGET';
    yield { op: 'move', x: cx, y: cy };
    r.state = 'DIGGING_BIN';
    const t0 = sim.time, depth0 = g.depthOf(col, bin.id), blockers = [];
    if (g.stacks[col].indexOf(bin.id) < 0) throw new Error(`${bin.id} not in locked column ${col}`);
    while (g.stacks[col][g.stacks[col].length - 1] !== bin.id) {
      const top = inv.binById.get(g.stacks[col][g.stacks[col].length - 1]);
      yield* liftTop(sim, r, col, top);
      let tmp;
      while ((tmp = sim.findTempColumn(cx, cy, r.id)) < 0) yield { op: 'wait', t: 1 };
      g.colLock[tmp] = r.id;
      yield { op: 'move', x: g.cx(tmp), y: g.cy(tmp) };
      yield* dropOn(sim, r, tmp);
      g.colLock[tmp] = -1;
      blockers.push({ bin: top, tmp });
      sim.kpi.onShuffle();
      yield { op: 'move', x: cx, y: cy };
    }
    yield* liftTop(sim, r, col, bin);
    g.colLock[col] = -1;
    sim.kpi.onDig(bin, depth0, sim.time - t0);
    if (blockers.length && sim.cfg.restackPolicy === 'origin') sim.createRestack(col, blockers.reverse());
    yield* deliverToPort(sim, r, sim.ports[t.port]);
  };

  // Collect a bin from a port's lift position; route it to the next port that
  // needs it, or store it on top of a stack chosen by the slotting policy.
  T.STORE = function* (sim, r, t) {
    const g = sim.grid, inv = sim.inv, port = sim.ports[t.port];
    r.state = 'MOVING_TO_TARGET';
    yield { op: 'move', x: port.lift.x, y: port.lift.y };
    r.state = 'AT_PORT';
    yield { op: 'until', fn: () => port.outQ.length > 0, waitState: 'WAITING_PORT' };
    r.busy = true;
    yield { op: 'winch', to: portDepth(sim) };
    yield { op: 'grip' };
    const bin = port.takeOut();
    r.bin = bin.id; bin.loc = 'robot'; bin.robot = r.id; bin.port = -1;
    yield { op: 'winch', to: 0 };
    r.busy = false;
    if (bin.requests.length) {
      const next = sim.ports[bin.requests[0].port];
      next.inbound++;
      yield* deliverToPort(sim, r, next);
      return;
    }
    r.state = 'STORING';
    let i;
    while ((i = sim.chooseStoreColumn(bin, r.x, r.y, r.id)) < 0) yield { op: 'wait', t: 1 };
    g.colLock[i] = r.id;
    yield { op: 'move', x: g.cx(i), y: g.cy(i) };
    yield* dropOn(sim, r, i);
    g.colLock[i] = -1;
    sim.kpi.stores++;
  };

  // Consolidation: return dug-out blockers to their original column.
  T.RESTACK = function* (sim, r, t) {
    const g = sim.grid, inv = sim.inv, origin = t.origin;
    r.state = 'RESTACKING';
    for (const it of t.items) {
      if (g.stacks[origin].length >= g.Z) break;
      const s = g.stacks[it.tmp], b = it.bin;
      if (b.loc !== 'grid' || s[s.length - 1] !== b.id || g.colLock[it.tmp] >= 0 || b.requests.length || b.task) continue;
      g.colLock[it.tmp] = r.id; b.task = t;
      yield { op: 'move', x: g.cx(it.tmp), y: g.cy(it.tmp) };
      yield* liftTop(sim, r, it.tmp, b);
      g.colLock[it.tmp] = -1;
      yield { op: 'move', x: g.cx(origin), y: g.cy(origin) };
      yield* dropOn(sim, r, origin);
      b.task = null;
      sim.kpi.restacks++;
    }
    g.colLock[origin] = -1;
  };

  WS.CubeTasks = T;
})((globalThis.WS = globalThis.WS || {}));
