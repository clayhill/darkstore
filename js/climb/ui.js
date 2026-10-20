/* RackRider's part of the user interface: KPI tiles (cycles, the climb's
 * share of a cycle, aisle waits), settings, and how the climbing robots are
 * described. The floor and rack-column inspector are StackPilot's. */
(function (WS) {
  'use strict';
  const side = (s) => (s ? 'right' : 'left');
  WS.TypeUI.climb = Object.assign({}, WS.TypeUI.acr, {
    kpiTiles(ui) {
      const sim = ui.sim, aw = sim.aisleWaits, g = sim.grid, st = {};
      for (const r of sim.fleet) for (const [k, v] of Object.entries(r.stateTime)) st[k] = (st[k] || 0) + v;
      const drive = st.MOVING_TO_TARGET + st.STORING + st.TRANSPORTING_TO_PORT, wait = st.WAITING_IN_TRAFFIC + st.WAITING_PORT;
      const tot = drive + st.CLIMBING + st.HANDLING + st.AT_PORT + wait || 1, pct = (v) => Math.round((v / tot) * 100);
      const high = sim.fleet.filter((r) => r.mast > 1).length;
      return [
        ui.kpiTile('Robot cycles', Math.round(sim.cycleRate()), '/h', `fetch, present and put away · ${sim.fleet.length} robots`),
        ui.kpiTile('Cycle time split', pct(st.CLIMBING), '% climbing', `drive ${pct(drive)}% · arm ${pct(st.HANDLING)}% · presenting ${pct(st.AT_PORT)}% · waiting ${pct(wait)}%`),
        ui.kpiTile('Aisle waits', aw.n, '', `${aw.n ? (aw.t / aw.n).toFixed(1) : 0} s each · ${high} robots up the racking now`),
      ];
    },
    settings(ui, c, num, sel) {
      return {
        live: `${sel('putawayPolicy', 'Where totes go back', [['velocity', 'Velocity-based (fast movers low and near the stations)'], ['nearest', 'Fastest free position'], ['random', 'Random free position']])}
        <div class="row2">${num('handlerTime', 'Arm: take or put a tote (s)', 0.5, 1, 15)}${num('climbOn', 'Grip or release the uprights (s)', 0.1, 0, 5)}</div>`,
        scenario: `<div class="row2">${num('aisles', 'Aisles', 1, 2, 14)}${num('bays', 'Bays per side', 1, 6, 40)}</div>
        <div class="row2">${num('levels', 'Levels', 1, 3, 30)}${num('rackFill', 'Share of positions with a tote', 0.05, 0.2, 0.95)}</div>
        <div class="row2">${num('robots', 'Robots', 1, 1, 60)}${num('chargers', 'Chargers', 1, 1, 16)}</div>
        <div class="row2">${num('vmax', 'Top speed (m/s)', 0.1, 0.5, 5)}${num('climbSpeed', 'Climbing speed (m/s)', 0.1, 0.3, 4)}</div>
        <div class="row2">${num('accel', 'Acceleration (m/s²)', 0.1, 0.2, 4)}${num('laneLength', 'Queue lane per station (cells)', 1, 1, 6)}</div>
        <div class="row2">${num('toteSlots', 'Put-wall slots', 1, 2, 12)}${num('portInboundCap', 'Robots on their way per station', 1, 1, 12)}</div>`,
        about: `Climbing robots: ${c.aisles} aisles of racking, ${c.levels} levels (${(c.levels * c.levelHeight).toFixed(1)} m) high and ${c.bays} bays long on each side, totes single deep. A robot carries one tote. It drives into the aisle beside the tote, grips the rack uprights and climbs straight up to its level (${c.climbSpeed} m/s), takes it with its telescopic arm and climbs down; while it climbs it blocks its column of the aisle, so the robots behind it wait. It then queues at a station and climbs into the station's frame to present the tote to the operator itself, waits while the lines are picked (and goes on to the next station that wants the tote), and puts it away in a free position: there are no conveyors at the stations, the robot is the conveyor. Neighbouring aisles run in opposite directions. Battery robots with charging trips; A* routing with cell reservations. Barcodes: GS1 GTIN-13 on items, GS1-128 GRAI on totes, GS1-128 SSCC on shipping labels.`,
      };
    },
    live: ['putawayPolicy', 'handlerTime', 'climbOn'],
    motion(r) { return r.mast > 0.05 ? `climbing the racking, ${(r.mast * WS.RACK_ZU).toFixed(1)} m up` : `on the floor, wheels along ${r.axis.toUpperCase()}${r.shift > 0 ? ' (turning)' : ''}`; },
    mechanism(r) {
      return `<dt>Arm</dt><dd>${r.xfer ? `${r.xfer.take ? 'taking a tote from' : 'putting a tote into'} the ${side(r.xfer.side)} rack` : 'in'}</dd>
        <dt>Tote</dt><dd>${r.bin || '—'}</dd>`;
    },
    liftsLabel: 'totes fetched',
    taskText(ui, r) {
      const t = r.task;
      if (t.type !== 'RETRIEVE') return '';
      return `${t.bin.id} → ${ui.sim.ports[t.port].code}`;
    },
  });
})((globalThis.WS = globalThis.WS || {}));
