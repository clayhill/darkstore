/* SortHub's part of the user interface: on top of what every parcel sorter
 * shows (js/hub/ui.js), the robots' tiles, settings and inspector. */
(function (WS) {
  'use strict';
  const esc = WS.U.esc;
  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.sort = WS.hubUI({
    recirc: { title: 'Overflowed', note: () => 'chutes of their destination full: to the overflow chute', after: () => 'overflow' },
    moreTiles(ui) {
      const sim = ui.sim, k = sim.kpi, u = k.utilization(true), ur = k.utilization(false);
      return [
        ui.kpiTile('Robot utilization', Math.round(u.work * 100), '%', `now ${Math.round(ur.work * 100)}% · waiting ${Math.round(u.wait * 100)}%`),
        ui.kpiTile('Fleet battery', Math.round(sim.fleet.reduce((a, r) => a + r.battery, 0) / sim.fleet.length), '%', `${sim.fleet.filter((r) => r.bucket === 'CHARGE').length} charging`),
      ];
    },
    scenarioSettings(num) {
      return `<div class="row2">${num('robots', 'Robots', 1, 1, 70)}${num('vmax', 'Robot top speed (m/s)', 0.1, 0.5, 3.5)}</div>
        <div class="row2">${num('chargers', 'Chargers', 1, 1, 20)}${num('stationLane', 'Queue per induct (cells)', 1, 1, 5)}</div>`;
    },
    machine(c) { return `Robot sorter: ${c.robots} small robots on a raised deck each take one parcel from an induct and carry it to a hole above its chute's bag, then tip it in. They drive one-way streets between the holes and never stop in a crossing; with every chute of the destination full the parcel goes to the overflow (reject) chute. Battery robots with charging; A* routing with cell reservations.`; },
    cellName: { [WS.CELL.HIGHWAY]: 'Deck street', [WS.CELL.PORT]: 'Induct', [WS.CELL.LANE]: 'Induct lane', [WS.CELL.CHARGER]: 'Charger', [WS.CELL.PARK]: 'Parking' },
    cellDetail(ui, i) {
      const sim = ui.sim, g = sim.grid, occ = g.claim[i] >= 0 ? `<a href="#" data-open="robot:${g.claim[i]}">${sim.fleet[g.claim[i]].name}</a>` : '—';
      return `<dt>Occupied by</dt><dd>${occ}</dd><dt>Traffic wait</dt><dd>${g.waitHeat[i].toFixed(1)} s (decaying)</dd>`;
    },
    // ---------- robots
    motion(r) { return `facing ${r.axis.toUpperCase()}${r.shift > 0 ? ' (turning)' : ''}`; },
    mechanism(r) { const p = r.parcel; return `<dt>Parcel</dt><dd>${p ? `<span class="mono">${p.sscc}</span> → ${p.target === r.sim.reject ? 'reject' : esc(p.dest.name)}` : '—'}</dd>`; },
    liftsLabel: 'parcels sorted',
    taskText(ui, r) {
      const t = r.task;
      if (t.type !== 'SORT') return '';
      return r.parcel ? `Parcel to ${t.chute ? t.chute.name : '…'}` : `To ${ui.sim.ports[t.port].code}`;
    },
  });
})((globalThis.WS = globalThis.WS || {}));
