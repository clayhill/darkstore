/* CubeFlow's part of the user interface: KPI tiles, settings, the stack
 * inspector and how a bin and its compartments are shown. */
(function (WS) {
  'use strict';
  const U = WS.U;
  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.cube = {
    kpiTiles(ui) {
      const k = ui.sim.kpi;
      return [
        ui.kpiTile('Dig ratio', k.digRatio.toFixed(2), '', `${k.shuffles} shuffles / ${k.productive} productive`),
        ui.kpiTile('Burial penalties', k.penaltyEvents, '', `${U.fmtDur(k.penaltyTime)} shuffling on A-items`),
      ];
    },
    settings(ui, c, num, sel) {
      return `<div class="sect"><h3>Live policies</h3><div class="card">
        ${sel('restackPolicy', 'Blocker handling after a dig', [['origin', 'Consolidate — return blockers to origin column'], ['leave', 'Leave on neighbouring stacks (self-sorting)']])}
        ${sel('putawayPolicy', 'Putaway / slotting', [['velocity', 'Velocity-based (ABC zones, avoid burying fast movers)'], ['nearest', 'Nearest free column'], ['random', 'Random column']])}
        <div class="row2">${num('burialDepth', 'Burial penalty depth', 1, 2, 16)}${num('portInboundCap', 'Bins in flight per port', 1, 1, 10)}</div>
        <div class="row2">${num('pickPerUnit', 'Pick time / unit (s)', 0.1, 0.5)}${num('battLow', 'Charge below (%)', 1, 5, 80)}</div>
        <div class="row2">${num('truckCapacity', 'Truck capacity', 1, 1)}${num('truckCutoff', 'Truck cut-off (s)', 60, 60)}</div>
        <div class="note">Applied immediately. Ports can be switched to manual operation from their inspector (click a port).</div></div></div>
      <div class="sect"><h3>Scenario <span class="sub">restarts the simulation</span></h3><div class="card">
        <div class="row2">${num('gridW', 'Grid X (columns)', 1, 14, 48)}${num('gridD', 'Grid Y (rows)', 1, 8, 30)}</div>
        <div class="row2">${num('gridZ', 'Grid Z (bins per stack)', 1, 4, 24)}${num('robots', 'Robots', 1, 1, 80)}</div>
        <div class="row2">${num('pickPorts', 'Pick ports', 1, 1, 7)}${num('goodsInPorts', 'Goods-in ports', 1, 0, 3)}</div>
        <div class="row2">${num('chargers', 'Chargers', 1, 1, 12)}${num('packStations', 'Pack stations', 1, 1, 5)}</div>
        <div class="row2">${num('products', 'SKUs', 10, 20, 2000)}${num('initialFill', 'Initial grid fill', 0.05, 0.1, 0.98)}</div>
        <div class="row2">${num('vmax', 'Robot top speed (m/s)', 0.1, 0.5, 5)}${num('accel', 'Acceleration (m/s²)', 0.1, 0.2, 3)}</div>
        <div class="row2">${num('winchEmpty', 'Winch empty (m/s)', 0.1, 0.3, 3)}${num('winchLoaded', 'Winch full load (m/s)', 0.1, 0.3, 3)}</div>
        ${num('seed', 'Random seed', 1, 1)}
        <div class="btns"><button class="btn primary" id="cfg-restart">Apply &amp; restart</button><button class="btn ghost" id="cfg-reset">Defaults</button></div>
        <div class="note">Pick ports need 6 columns each along the front face; goods-in ports need 5 rows on the right face.</div></div></div>
      <div class="sect"><h3>About the model</h3><div class="card" style="font-size:12px;color:var(--muted)">
        Cube-storage AS/RS: bins stacked in a ${c.gridW}×${c.gridD}×${c.gridZ} [X][Y][Z] grid, robots on top travelling orthogonally (X/Y wheel-set change, no turning), digging out blockers to neighbour columns, delivering to conveyor ports. 100 ms fixed time step; moving-block cell reservations, A* routing, yield and evasive manoeuvres for deadlock resolution. Barcodes: GS1 GTIN-13 (EAN-13) on items, GS1-128 GRAI (AI 8003) on storage bins and totes, GS1-128 SSCC (AI 00) on shipping labels.</div></div>`;;
    },
    live: ['restackPolicy', 'putawayPolicy', 'burialDepth', 'portInboundCap', 'pickPerUnit', 'battLow', 'truckCapacity', 'truckCutoff'],
    motion(r) { return `${r.axis.toUpperCase()}-wheels${r.shift > 0 ? ' (shifting)' : ''}`; },
    mechanism(r) { return `<dt>Winch</dt><dd>${r.winch > 0.01 ? r.winch.toFixed(2) + ' m down' : 'retracted'}</dd>`; },
    liftsLabel: 'lifts',
    cellWord: 'column',
    depthTag(depth) { return 'd' + depth; },
    inspectCell(ui, i) {
      const sim = ui.sim, g = sim.grid, s = g.stacks[i], x = g.cx(i), y = g.cy(i);
      const type = ['Storage column', 'Port shaft', 'Charger'][g.type[i]];
      const claim = g.claim[i] >= 0 ? sim.robots[g.claim[i]].name : '—', lock = g.colLock[i] >= 0 ? sim.robots[g.colLock[i]].name : '—';
      return `<div class="hd"><b>Cell X${x} · Y${y}</b><span class="pill">${type}</span><button class="close">×</button></div>
        <dl class="kv"><dt>Stack height</dt><dd>${s.length} / ${g.Z} bins</dd><dt>Occupied by</dt><dd>${claim}</dd><dt>Column lock</dt><dd>${lock}</dd>
        <dt>Traffic wait</dt><dd>${g.waitHeat[i].toFixed(1)} s (decaying)</dd><dt>Distance to port</dt><dd>${sim.inv.portDist[i]} cells</dd></dl>
        ${s.length ? `<h3>Stack — top (Z=1) to bottom</h3><div class="stack">${s.slice().reverse().map((id, k) => ui.binRow(id, k + 1)).join('')}</div><div class="note">★ = requested by a port. Colour = ABC class of contents.</div>` : ''}`;
    },
    locate(ui, b) {
      const g = ui.sim.grid;
      return `Grid X${b.x} Y${b.y} · depth ${ui.sim.inv.binDepth(b)} (Z level ${g.stacks[g.idx(b.x, b.y)].indexOf(b.id) + 1} from floor)`;
    },
  };
})((globalThis.WS = globalThis.WS || {}));
