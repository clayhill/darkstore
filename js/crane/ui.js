/* SkyStack's part of the user interface: KPI tiles (cycles, cycle times next
 * to the FEM 9.851 reference, I/O queues), settings, the rack inspector and how
 * cranes are described. */
(function (WS) {
  'use strict';
  const esc = WS.U.esc, R = WS.RackUI;
  const mean = (n, t) => (n ? Math.round(t / n) + ' s' : '—');
  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.crane = {
    kpiTiles(ui) {
      const sim = ui.sim, c = sim.cycles, fem = sim.femCycles(), n = c.single + c.dual;
      const waiting = sim.aisles.reduce((s, a) => s + a.inQ.length, 0), queued = sim.aisles.reduce((s, a) => s + a.crane.jobs.length, 0);
      return [
        ui.kpiTile('Crane cycles', Math.round(sim.cycleRate()), '/h', `${n ? Math.round((c.dual / n) * 100) : 0}% dual command · ${n} total`),
        ui.kpiTile('Cycle time', mean(c.single, c.singleT), '', `single · dual ${mean(c.dual, c.dualT)} · FEM 9.851 ${Math.round(fem.single)} / ${Math.round(fem.dual)} s`),
        ui.kpiTile('I/O queues', waiting + queued, ' totes', `${waiting} on the infeeds · ${queued} retrievals waiting`),
      ];
    },
    settings(ui, c, num, sel) {
      return {
        live: `${sel('putawayPolicy', 'Where totes go back', [['velocity', 'Velocity-based (fast movers in the fastest crane positions, least busy aisle)'], ['nearest', 'Fastest free position'], ['random', 'Random free position']])}
        <div class="row2">${num('forkTime', 'Fork cycle (s)', 0.1, 1, 15)}${num('settleTime', 'Settling (s)', 0.1, 0, 3)}</div>`,
        scenario: `<div class="row2">${num('aisles', 'Aisles', 1, 1, 8)}${num('levels', 'Levels', 1, 2, 30)}</div>
        <div class="row2">${num('bays', 'Bays per side', 1, 8, 80)}${num('rackFill', 'Share of positions with a tote', 0.05, 0.2, 0.95)}</div>
        <div class="row2">${num('handlerSlots', 'Totes per load handler', 1, 1, 2)}${num('portInboundCap', 'Totes in flight per station', 1, 1, 12)}</div>
        <div class="row2">${num('toteSlots', 'Put-wall slots', 1, 2, 12)}${num('stockedRatio', 'Share of totes stocked', 0.05, 0.1, 0.95)}</div>
        <div class="row2">${num('craneVx', 'Travel speed (m/s)', 0.1, 0.5, 8)}${num('craneAx', 'Travel accel. (m/s²)', 0.1, 0.2, 5)}</div>
        <div class="row2">${num('craneVz', 'Hoist speed (m/s)', 0.1, 0.3, 6)}${num('craneAz', 'Hoist accel. (m/s²)', 0.1, 0.2, 6)}</div>`,
        about: `Stacker crane AS/RS (mini-load): ${c.aisles} aisles of racking, ${c.levels} levels high and ${c.bays} bays long on each side, totes stored single deep. One crane per aisle drives along a floor rail while its carriage moves up or down the mast, so a trip takes the longer of the two motions. Every cycle starts and ends at the I/O point in front of the aisle: a single command stores or retrieves, a dual command stores and then retrieves on the way back, and a twin load handler moves up to two totes each way. Returning totes go to the position the storage policy picks by crane time, in the aisle with the least work; when that aisle's infeed is full, they go on to the next aisle with room or round the pre-zone loop again, as do totes whose station has no room. The cycle-time tile compares measured cycles with the FEM 9.851 reference for this rack (set the handler to 1 tote for a like-for-like comparison). Not modelled yet: double-deep storage, aisle-changing cranes. Barcodes: GS1 GTIN-13 on items, GS1-128 GRAI on totes, GS1-128 SSCC on shipping labels.`,
      };
    },
    live: ['putawayPolicy', 'forkTime', 'settleTime'],
    position(r) {
      const g = r.sim.grid, at = r.pos > g.B ? 'at the I/O point' : `bay ${Math.max(1, Math.round(r.pos + 0.5))}`;
      return `Aisle ${r.a + 1} · ${at} · ${r.z <= g.ioZ + 0.05 && r.z >= g.ioZ - 0.05 ? 'I/O height' : 'level ' + (Math.max(0, Math.round((r.z - g.Z0) / g.LH)) + 1)}`;
    },
    speed(r) { const c = r.sim.cfg; return Math.hypot((r.vel.pos || 0) * c.cellSize, (r.vel.z || 0) * WS.RACK_ZU); },
    motion() { return 'stacker crane on a floor rail'; },
    mechanism(r) { return `<dt>Load handler</dt><dd>${r.load.length} / ${r.sim.cfg.handlerSlots} totes${r.state === 'HANDLING' ? ' · forks out' : ''}</dd>`; },
    power() { return 'rail powered, no charging'; },
    liftsLabel: 'totes delivered',
    taskText(ui, r) {
      const t = r.task;
      if (t.type !== 'CYCLE') return t.type;
      const kind = t.stores.length && t.rets.length ? 'Dual' : 'Single';
      return `${kind}: ${[t.stores.length ? `store ${t.stores.length}` : '', t.rets.length ? `retrieve ${t.rets.length}` : ''].filter(Boolean).join(', ')}`;
    },
    cellWord: R.cellWord,
    depthTag: R.depthTag,
    inspectCell(ui, i) {
      const sim = ui.sim, c = sim.mapGrid.at(i);
      if (!c) return R.conveyorHTML(ui);
      const aisle = sim.aisles[c.a], cr = aisle.crane, link = `<a href="#" data-open="robot:${cr.id}">${cr.name}</a>`;
      if (c.part === 1 || c.part === 3) {
        return `<div class="hd"><b>Aisle ${c.a + 1} · ${c.part === 1 ? 'crane lane' : 'I/O point'}</b><button class="close">×</button></div>
          <dl class="kv"><dt>Crane</dt><dd>${link} · ${esc(ui.stateLabel(cr.displayState))}</dd>
          <dt>Retrievals queued</dt><dd>${cr.jobs.length}</dd><dt>Totes on the infeed</dt><dd>${aisle.inQ.length}</dd>
          <dt>Utilization</dt><dd>${Math.round(cr.utilization * 100)}%</dd></dl>`;
      }
      return R.sideHTML(ui, c.a, c.level, c.part / 2, `<dt>Crane</dt><dd>${link}</dd>`);
    },
    locate: R.locate,
  };
})((globalThis.WS = globalThis.WS || {}));
