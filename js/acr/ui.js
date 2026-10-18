/* StackPilot's part of the user interface: KPI tiles (totes per trip, the
 * fleet's time split, aisle waits), settings, the floor and rack-column
 * inspector and how robots and their trips are described. */
(function (WS) {
  'use strict';
  const C = WS.CELL, side = (s) => (s ? 'right' : 'left');
  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.acr = {
    kpiTiles(ui) {
      const sim = ui.sim, tr = sim.trips, aw = sim.aisleWaits, g = sim.grid;
      const fill = sim.loadT ? Math.round((sim.loadSum / sim.loadT / sim.cfg.robotSlots) * 100) : 0, per = (n) => (tr.n ? (n / tr.n).toFixed(1) : '0');
      const st = {};
      for (const r of sim.fleet) for (const [k, v] of Object.entries(r.stateTime)) st[k] = (st[k] || 0) + v;
      const drive = st.MOVING_TO_TARGET + st.STORING + st.TRANSPORTING_TO_PORT, wait = st.WAITING_IN_TRAFFIC + st.WAITING_PORT;
      const tot = drive + st.MAST + st.HANDLING + st.AT_PORT + wait || 1, pct = (v) => Math.round((v / tot) * 100);
      const queued = sim.fleet.filter((r) => { const t = g.type[g.idx(r.x, r.y)]; return t === C.LANE || t === C.PORT; }).length;
      const back = sim.ports.reduce((s, p) => s + p.back.length, 0);
      return [
        ui.kpiTile('Totes per trip', tr.n ? per(tr.takes + tr.puts) : '—', '', `${per(tr.takes)} retrieved · ${per(tr.puts)} stored · back shelves ${fill}% full`),
        ui.kpiTile('Trip time', tr.n ? Math.round(tr.time / tr.n) : '—', ' s', `drive ${pct(drive)}% · mast ${pct(st.MAST)}% · handler ${pct(st.HANDLING)}% · handover ${pct(st.AT_PORT)}% · waiting ${pct(wait)}%`),
        ui.kpiTile('Aisle waits', aw.n, '', `${aw.n ? (aw.t / aw.n).toFixed(1) : 0} s each · ${queued} robots at stations · ${back} totes to store`),
      ];
    },
    settings(ui, c, num, sel) {
      return {
        live: `${sel('putawayPolicy', 'Where totes go back', [['velocity', 'Velocity-based (fast movers low and near the stations, close to the trip)'], ['nearest', 'Fastest free position near the trip'], ['random', 'Random free position']])}
        <div class="row2">${num('handlerTime', 'Take or put a tote (s)', 0.5, 2, 20)}${num('handoverTime', 'Handover per tote (s)', 0.5, 0.5, 10)}</div>
        <div class="row2">${num('minBatch', 'Totes a trip waits for', 1, 1, 12)}${num('batchWait', '… unless waiting for (s)', 5, 0, 300)}</div>`,
        scenario: `${sel('aisleMode', 'Aisle traffic', [['lock', 'Aisle locking: a trip holds its aisles until it has left them'], ['oneway', 'One-way aisles, alternating direction']])}
        <div class="row2">${num('aisles', 'Aisles', 1, 2, 14)}${num('bays', 'Bays per side', 1, 6, 40)}</div>
        <div class="row2">${num('levels', 'Levels', 1, 3, 24)}${num('rackFill', 'Share of positions with a tote', 0.05, 0.2, 0.95)}</div>
        <div class="row2">${num('robots', 'Robots', 1, 1, 30)}${num('robotSlots', 'Back shelves per robot', 1, 1, 12)}</div>
        <div class="row2">${num('vmax', 'Top speed (m/s)', 0.1, 0.5, 4)}${num('accel', 'Acceleration (m/s²)', 0.1, 0.2, 3)}</div>
        <div class="row2">${num('mastSpeed', 'Mast speed (m/s)', 0.1, 0.2, 3)}${num('wheelShift', 'Turn 90° on the spot (s)', 0.1, 0.3, 6)}</div>
        <div class="row2">${num('chargers', 'Chargers', 1, 1, 12)}${num('laneLength', 'Queue lane per station (cells)', 1, 1, 5)}</div>
        <div class="row2">${num('toteSlots', 'Put-wall slots', 1, 4, 16)}${num('portInboundCap', 'Totes in flight per station', 1, 4, 40)}</div>`,
        about: `Case-handling robots (ACR): ${c.aisles} aisles of shelving, ${c.levels} levels high and ${c.bays} bays long on each side, totes single deep. A robot has a mast with a tote handler and ${c.robotSlots} shelves on its back. On one trip it loads totes back from a station, stores them in free positions near the totes it has to fetch, takes those totes (handler up, take, down at every stop) and hands the whole batch over at one station, from where a short conveyor feeds the operator. The robot only lifts or handles a tote while standing still, and blocks its aisle cell meanwhile. Aisles are one robot wide: with aisle locking a trip holds its aisles until it has left them; with one-way aisles neighbouring aisles run in opposite directions. Robots queue in a short lane in front of each station; no more head there than the lane holds. Battery robots with charging trips; A* routing with cell reservations. Not modelled yet: double-deep storage, climbing robots. Barcodes: GS1 GTIN-13 on items, GS1-128 GRAI on totes, GS1-128 SSCC on shipping labels.`,
      };
    },
    live: ['putawayPolicy', 'handlerTime', 'handoverTime', 'minBatch', 'batchWait'],
    motion(r) { return `facing ${r.axis.toUpperCase()}${r.shift > 0 ? ' (turning)' : ''}`; },
    mechanism(r) {
      return `<dt>Handler</dt><dd>${(r.mast * WS.RACK_ZU).toFixed(1)} m up the mast${r.xfer ? ` · ${r.xfer.take ? 'taking a tote from' : 'putting a tote into'} the ${side(r.xfer.side)} rack` : ''}</dd>
        <dt>Back shelves</dt><dd>${r.load.length} / ${r.sim.cfg.robotSlots} totes</dd>`;
    },
    liftsLabel: 'totes handled',
    taskText(ui, r) {
      const t = r.task, ports = ui.sim.ports;
      if (t.type !== 'TRIP') return '';
      const what = [t.puts ? `store ${t.puts}` : '', t.takes ? `retrieve ${t.takes}` : ''].filter(Boolean).join(', ');
      return `Trip: ${what}${t.pickup != null ? ` · from ${ports[t.pickup].code}` : ''}${t.dest != null ? ` → ${ports[t.dest].code}` : ''}`;
    },
    cellWord: 'rack position',
    depthTag(depth) { return 'level ' + depth; },
    inspectCell(ui, i) {
      const sim = ui.sim, g = sim.grid, x = g.cx(i), y = g.cy(i), t = g.type[i];
      const occ = g.claim[i] >= 0 ? `<a href="#" data-open="robot:${g.claim[i]}">${sim.fleet[g.claim[i]].name}</a>` : '—';
      const lock = (a) => (sim.cfg.aisleMode === 'lock' ? (sim.aisles[a].lock >= 0 ? `held by <a href="#" data-open="robot:${sim.aisles[a].lock}">${sim.fleet[sim.aisles[a].lock].name}</a>` : 'free') : sim.aisles[a].dir < 0 ? 'one-way, towards the back' : 'one-way, towards the front');
      if (t === C.STORAGE) {
        const a = Math.floor(x / 3), s = x % 3 ? 1 : 0, b = y - g.Y0, aisle = sim.aisles[a], ids = [];
        for (let l = g.L - 1; l >= 0; l--) { const id = aisle.slot[sim.si(l, s, b)]; if (id) ids.push([id, l + 1]); }
        return `<div class="hd"><b>Aisle ${a + 1} · bay ${b + 1} · ${side(s)} side</b><button class="close">×</button></div>
          <dl class="kv"><dt>Totes</dt><dd>${ids.length} / ${g.L}</dd><dt>Aisle</dt><dd>${lock(a)}</dd></dl>
          ${ids.length ? `<h3>Top level first</h3><div class="stack">${ids.map(([id, l]) => ui.binRow(id, l)).join('')}</div><div class="note">★ = requested by a station. Colour = ABC class of contents.</div>` : ''}`;
      }
      const name = { [C.HIGHWAY]: 'Cross aisle', [C.AISLE]: 'Aisle', [C.PARK]: 'Parking spot', [C.LANE]: 'Queue lane', [C.PORT]: 'Handover point', [C.CHARGER]: 'Charger' }[t] || 'Conveyor area';
      const where = t === C.AISLE ? `Aisle ${g.aisleAt(i) + 1} · bay ${y - g.Y0 + 1}` : `Cell X${x} · Y${y}`;
      return `<div class="hd"><b>${where}</b><span class="pill">${name}</span><button class="close">×</button></div>
        <dl class="kv"><dt>Occupied by</dt><dd>${occ}</dd>${t === C.AISLE ? `<dt>Aisle</dt><dd>${lock(g.aisleAt(i))}</dd>` : ''}
        <dt>Traffic wait</dt><dd>${g.waitHeat[i].toFixed(1)} s (decaying)</dd></dl>`;
    },
    locate(ui, b) { return `Aisle ${b.aisle + 1} · bay ${b.bay + 1} · level ${b.level + 1} · ${side(b.side)} side`; },
  };
})((globalThis.WS = globalThis.WS || {}));
