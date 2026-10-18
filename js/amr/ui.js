/* AisleMate's part of the user interface: KPI tiles (pickers, robot waits,
 * lines per stop), settings, the shelf and floor inspector, the station
 * inspector, and how robots and their trips are described. */
(function (WS) {
  'use strict';
  const C = WS.CELL, side = (s) => (s ? 'right' : 'left');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.amr = {
    kpiTiles(ui) {
      const sim = ui.sim, k = sim.kpi, pk = sim.pickers, w = sim.waitStats;
      const util = pk.length ? pk.reduce((s, p) => s + p.utilization, 0) / pk.length : 0, picking = pk.filter((p) => p.state === 'PICKING').length;
      const km = pk.reduce((s, p) => s + p.distance, 0) * sim.cfg.cellSize / 1000;
      return [
        ui.kpiTile('Picker utilization', Math.round(util * 100), '%', `${picking} of ${pk.length} picking now · ${km.toFixed(1)} km walked`),
        ui.kpiTile('Robot wait for picker', w.n ? (w.sum / w.n).toFixed(1) : '—', ' s', `per stop · ${sim.fleet.filter((r) => r.displayState === 'WAITING_PICKER').length} robots waiting now`),
        ui.kpiTile('Lines per stop', (k.linesPicked / (k.presentedPick || 1)).toFixed(2), '', `${k.presentedPick} pick stops`),
      ];
    },
    settings(ui, c, num, sel) {
      return {
        live: `${sel('zonePicking', 'Pickers', [['on', 'Zone picking: each keeps to a zone of aisles, helping out next door when idle'], ['off', 'Anywhere: the nearest free picker goes']])}
        <div class="row2">${num('walkSpeed', 'Picker walking speed (m/s)', 0.1, 0.5, 2)}${num('toteHandle', 'Station: tote on or off (s)', 0.5, 1, 15)}</div>
        <div class="row2">${num('batchWait', 'Robot leaves with a part batch after (s)', 5, 0, 300)}${num('putawayStops', 'Stops per putaway tour', 1, 1, 12)}</div>`,
        scenario: `<div class="row2">${num('aisles', 'Aisles', 1, 2, 14)}${num('bays', 'Shelf bays per aisle side', 1, 6, 40)}</div>
        <div class="row2">${num('robots', 'Robots', 1, 1, 40)}${num('pickers', 'Pickers', 1, 1, 30)}</div>
        <div class="row2">${num('robotTotes', 'Order totes per robot', 1, 1, 8)}${num('toteSlots', 'Totes staged per station', 1, 2, 16)}</div>
        <div class="row2">${num('chargers', 'Chargers', 1, 1, 12)}${num('stationLane', 'Queue lane per station (cells)', 1, 1, 5)}</div>
        <div class="row2">${num('vmax', 'Robot top speed (m/s)', 0.1, 0.5, 2.5)}${num('stockedRatio', 'Share of compartments stocked', 0.05, 0.1, 0.95)}</div>`,
        note: 'Zone picking splits the aisles evenly over the pickers; with more pickers than aisles, two share a zone.',
        about: `Collaborative mobile robots (person-to-goods with robot assistance): ${c.aisles} aisles of ordinary shelving, ${c.bays} bays on each side, ${c.shelfLevels} levels with ${c.shelfSlots} slots each. Orders are staged as empty totes at an induct & drop-off station. A robot takes up to ${c.robotTotes} of them (one order per tote; it leaves with fewer once the oldest has waited ${c.batchWait} s) and drives an S-shaped route past the shelf locations of their lines. At every stop it waits beside the shelf, its tablet lit, until a picker walks up, scans the location, picks into the right tote and confirms. ${c.zonePicking === 'on' ? 'Each picker keeps to a zone of aisles and also walks to robots still on their way there; an idle picker helps out where robots are waiting.' : 'The nearest free picker goes to each robot.'} After the last stop the robot queues at an induct & drop-off station: the operator takes the full totes off onto the packing conveyor and, if orders are staged, puts the next batch on. Received goods go the other way: the goods-in operator loads cases onto a robot and pickers put them away at its stops. Robots take two-cell-wide aisles, wait out of the way in the parking rows and charge on the back wall; A* routing with cell reservations. Pickers do not reserve cells. Barcodes: GS1 GTIN-13 on items, GS1-128 GRAI on shelf locations and totes, GS1-128 SSCC on shipping labels.`,
      };
    },
    live: ['zonePicking', 'walkSpeed', 'toteHandle', 'batchWait', 'putawayStops'],
    motion(r) { return `facing ${r.axis.toUpperCase()}${r.shift > 0 ? ' (turning)' : ''}`; },
    mechanism(r) {
      const oms = r.sim.oms, totes = r.totes.map((o) => `<a href="#" data-open="order:${o.id}">${o.id}</a> ${o.lines.reduce((s, l) => s + l.picked, 0)}/${oms.units(o)}`).join(' · ');
      return `<dt>Order totes</dt><dd>${totes || '—'}</dd>${r.cases ? `<dt>Cases</dt><dd>${r.cases} to put away</dd>` : ''}`;
    },
    liftsLabel: 'stops',
    inboundNote: 'The IMS reserves compartment space (same-SKU top-up first, then empty compartments). The goods-in operator loads the cases onto a robot, which drives a putaway tour; at every stop a picker scans the location and puts the goods away.',
    portsNote: 'Bar: operator busy swapping totes (blue) vs. work waiting with no robot coming (orange).',
    taskText(ui, r) {
      const t = r.task, sim = ui.sim;
      if (t.type !== 'TRIP') return '';
      const left = t.stops.filter((s) => !s.done).length, port = sim.ports[t.port].code;
      if (t.kind === 'put') return `Putaway: ${left} of ${t.stops.length} stops left`;
      return r.totes.length ? `Pick ${r.totes.length} orders: ${left} of ${t.stops.length} stops left → ${port}` : `To ${port} for ${t.orders.length} orders`;
    },
    cellWord: 'shelf bay',
    depthTag() { return ''; },
    inspectCell(ui, i) {
      const sim = ui.sim, g = sim.grid, x = g.cx(i), y = g.cy(i), t = g.type[i];
      const occ = g.claim[i] >= 0 ? `<a href="#" data-open="robot:${g.claim[i]}">${sim.fleet[g.claim[i]].name}</a>` : '—';
      if (t === C.STORAGE) {
        const id = g.binAt[i], b = sim.inv.binById.get(id), a = g.aisleOf(x);
        const stop = sim.stops.find((s) => s.bin === b);
        return `<div class="hd"><b>Aisle ${a + 1} · bay ${y - g.Y0 + 1} · ${side(g.sideOf(x))} side</b><button class="close">×</button></div>
          <dl class="kv"><dt>Location</dt><dd><a href="#" data-open="bin:${id}">${id}</a></dd><dt>Lines waiting</dt><dd>${b.requests.reduce((s, q) => s + q.lines.length, 0)}</dd>
          <dt>Robot here</dt><dd>${stop ? `${stop.robot.name} ${stop.arrived ? 'waiting' : 'on its way'}${stop.picker ? ' · ' + esc(stop.picker.name) + (stop.picking ? ' picking' : ' coming') : ''}` : '—'}</dd></dl>
          <h3>Stock</h3><div class="stack">${ui.binRow(id, 1)}</div><div class="note">Colour = ABC class of contents. Open the location for its compartments.</div>`;
      }
      const name = { [C.HIGHWAY]: y >= g.Y0 && y < g.Y0 + g.B ? 'Aisle' : 'Cross-aisle', [C.PARK]: 'Parking place', [C.LANE]: 'Queue lane', [C.PORT]: 'Station', [C.CHARGER]: 'Charger' }[t] || 'Wall';
      const here = sim.pickers.filter((p) => Math.floor(p.x) === x && Math.floor(p.y) === y).map((p) => esc(p.name)).join(', ');
      return `<div class="hd"><b>Cell X${x} · Y${y}</b><span class="pill">${name}</span><button class="close">×</button></div>
        <dl class="kv"><dt>Occupied by</dt><dd>${occ}</dd><dt>Pickers</dt><dd>${here || '—'}</dd>
        <dt>Traffic wait</dt><dd>${g.waitHeat[i].toFixed(1)} s (decaying)</dd></dl>`;
    },
    // Compartments as the picker sees them: top level first.
    unitComps(ui, b, cell) {
      const cfg = ui.sim.cfg, ks = [];
      for (let j = cfg.shelfLevels - 1; j >= 0; j--) for (let s = 0; s < cfg.shelfSlots; s++) ks.push(j * cfg.shelfSlots + s);
      return `<div class="muted" style="margin-top:10px">Top level first</div><div class="comps" style="grid-template-columns:repeat(${cfg.shelfSlots},1fr)">${ks.map(cell).join('')}</div>`;
    },
    locate(ui, b) { const g = ui.sim.grid; return `Aisle ${g.aisleOf(b.x) + 1} · bay ${b.y - g.Y0 + 1} · ${side(g.sideOf(b.x))} side`; },
    // A station: who is being served, who is queueing, the staged order totes.
    inspectPort(ui, p) {
      const sim = ui.sim, busy = p.stats.t ? p.stats.busy / p.stats.t : 0, coming = sim.fleet.filter((r) => r.task && r.task.port === p.idx && r !== p.serving);
      const wall = p.kind === 'PICK' ? `<h3>Staged order totes</h3><div class="wall">${p.slots.map((o, k) => `<div class="slot ${o && o.amr != null ? 'on' : ''}" ${o ? `data-open="order:${o.id}"` : ''}><div class="lamp"></div>Slot ${k + 1}${o ? `<b>${o.id.slice(3)}</b>${o.amr != null ? 'for ' + sim.fleet[o.amr].name : o.lines.length + ' lines'}` : '<b class="faint">free</b>'}</div>`).join('')}</div>` : '';
      return `<div class="hd"><b>${p.code} · ${esc(p.name)}</b><button class="close">×</button></div>
        <div class="hmi"><div class="muted">${p.serving ? `Serving <b>${p.serving.name}</b>: ${p.kind === 'PICK' ? `${p.serving.totes.length} totes on board` : `${p.serving.cases} cases loaded`}` : `Waiting for a robot${coming.length ? ` · ${coming.length} on the way` : ''}`}</div></div>
        ${wall}
        <dl class="kv" style="margin-top:10px"><dt>Robots heading here</dt><dd>${coming.map((r) => `<a href="#" data-open="robot:${r.id}">${r.name}</a>`).join(', ') || '—'}</dd>
        ${p.kind === 'PICK' ? `<dt>Totes dropped</dt><dd>${p.swaps}</dd>` : ''}<dt>Stops served</dt><dd>${p.stats.presented}</dd><dt>Lines · units</dt><dd>${p.stats.lines} · ${p.stats.units}</dd>
        <dt>Operator busy</dt><dd>${Math.round(busy * 100)}%</dd><dt>Starved</dt><dd>${Math.round((p.stats.starved / (p.stats.t || 1)) * 100)}% overall · ${Math.round(p.recentStarve * 100)}% recent (work waiting, no robot coming)</dd></dl>`;
    },
  };
})((globalThis.WS = globalThis.WS || {}));
