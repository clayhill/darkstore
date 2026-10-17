/* PodSwarm's part of the user interface: KPI tiles, settings, the floor-cell
 * inspector and a pod shown face by face. */
(function (WS) {
  'use strict';
  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.pod = {
    kpiTiles(ui) {
      const sim = ui.sim, k = sim.kpi;
      return [
        ui.kpiTile('Hit rate', (k.linesPicked / (k.presentedPick || 1)).toFixed(2), 'lines/pod', `${k.presentedPick} pick presentations`),
        ui.kpiTile('Pod returns', k.stores, '', `${sim.inv.bins.filter((b) => b.loc !== 'grid').length} pods off the floor now`),
      ];
    },
    settings(ui, c, num, sel) {
      return {
        live: `${sel('putawayPolicy', 'Where pods go back', [['velocity', 'Velocity-based (busy pods near the stations)'], ['nearest', 'Nearest free cell'], ['random', 'Random free cell']])}
        ${sel('tunnelling', 'Empty robots under stored pods', [['on', 'Allowed (tunnelling)'], ['off', 'Not allowed — highways and empty cells only']])}
        ${num('podRotate', 'Turn pod 90° (s)', 0.1, 0.3, 6)}`,
        scenario: `<div class="row2">${num('floorW', 'Floor X (cells)', 1, 18, 60)}${num('floorD', 'Floor Y (cells)', 1, 10, 40)}</div>
        <div class="row2">${num('podFill', 'Share of storage cells with a pod', 0.05, 0.3, 0.95)}${num('robots', 'Robots', 1, 1, 80)}</div>
        <div class="row2">${num('portInboundCap', 'Pods in flight per station', 1, 2, 10)}${num('toteSlots', 'Put-wall slots', 1, 2, 12)}</div>
        <div class="row2">${num('chargers', 'Chargers', 1, 1, 12)}${num('stockedRatio', 'Share of pod bins stocked', 0.05, 0.1, 0.95)}</div>
        <div class="row2">${num('vmax', 'Robot top speed (m/s)', 0.1, 0.5, 3)}${num('accel', 'Acceleration (m/s²)', 0.1, 0.2, 3)}</div>
        <div class="row2">${num('wheelShift', 'Turn 90° on the spot (s)', 0.1, 0.3, 5)}${num('liftTime', 'Lift / lower pod (s)', 0.1, 0.3, 5)}</div>`,
        note: "A station's queue lane holds all but one of its pods in flight; each pick station needs that many cells plus three along the front edge.",
        about: `Pod robots: shelving pods stand on a ${c.floorW}×${c.floorD} floor in blocks two cells deep, with highways between them. A robot drives under a pod, lifts it and carries it to a station, where it joins a queue lane. At the station the robot turns the pod to show the operator the face with the next pick. Afterwards the pod goes back to a free cell chosen by the storage policy, so busy pods drift towards the stations. Robots turn on the spot to change direction; empty robots may drive under stored pods. 100 ms fixed time step; moving-block cell reservations, A* routing, yield and evasive manoeuvres. Barcodes: GS1 GTIN-13 on items, GS1-128 GRAI on pods and totes, GS1-128 SSCC on shipping labels.`,
      };
    },
    // pods in flight per station sets the lane length, so it needs a restart
    live: ['putawayPolicy', 'tunnelling', 'podRotate'],
    motion(r) { return `facing ${r.axis.toUpperCase()}${r.shift > 0 ? ' (turning)' : ''}`; },
    mechanism(r) { return `<dt>Lift</dt><dd>${r.state === 'LIFTING_POD' ? (r.bin ? 'lowering' : 'lifting') : r.bin ? 'raised, carrying a pod' : 'down'}</dd>`; },
    liftsLabel: 'pods lifted',
    cellWord: 'cell',
    depthTag() { return ''; },
    inspectCell(ui, i) {
      const sim = ui.sim, g = sim.grid, x = g.cx(i), y = g.cy(i), id = g.podAt[i];
      const type = { [WS.CELL.STORAGE]: 'Storage cell', [WS.CELL.HIGHWAY]: 'Highway', [WS.CELL.LANE]: 'Queue lane', [WS.CELL.PORT]: 'Station', [WS.CELL.CHARGER]: 'Charger' }[g.type[i]] || 'Wall';
      const claim = g.claim[i] >= 0 ? sim.robots[g.claim[i]].name : '—', target = g.podTarget[i] >= 0 ? sim.robots[g.podTarget[i]].name : '';
      return `<div class="hd"><b>Cell X${x} · Y${y}</b><span class="pill">${type}</span><button class="close">×</button></div>
        <dl class="kv"><dt>Pod</dt><dd>${id ? `<a href="#" data-open="bin:${id}">${id}</a>` : target ? `— (${target} is bringing one back)` : '—'}</dd><dt>Occupied by</dt><dd>${claim}</dd>
        <dt>Traffic wait</dt><dd>${g.waitHeat[i].toFixed(1)} s (decaying)</dd><dt>Distance to station</dt><dd>${sim.inv.portDist[i]} cells</dd></dl>
        ${id ? `<h3>Stock on this pod</h3><div class="stack">${ui.binRow(id, 1)}</div><div class="note">Colour = ABC class of contents. Open the pod for its four faces.</div>` : ''}`;
    },
    // One face of a pod as the operator sees it: top shelf first.
    face(ui, b, f, cell) {
      const cfg = ui.sim.cfg, per = ui.sim.perFace, ks = [];
      for (let j = cfg.podShelves - 1; j >= 0; j--) for (let s = 0; s < cfg.podSlots; s++) ks.push(f * per + j * cfg.podSlots + s);
      return `<div class="comps" style="grid-template-columns:repeat(${cfg.podSlots},1fr)">${ks.map(cell).join('')}</div>`;
    },
    unitView(ui, b, p, cell) {
      const sim = ui.sim, ln = p.currentLine, f = ln ? sim.faceOf(ln.comp) : sim.facing(b, p);
      return `<div class="muted">Face ${f + 1} of 4, turned towards you</div>` + this.face(ui, b, f, cell);
    },
    unitComps(ui, b, cell) { return [0, 1, 2, 3].map((f) => `<h3 style="margin-top:12px">Face ${f + 1}</h3>${this.face(ui, b, f, cell)}`).join(''); },
    locate(ui, b) { return `Floor X${b.x} Y${b.y}`; },
  };
})((globalThis.WS = globalThis.WS || {}));
