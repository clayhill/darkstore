/* RailRunner's part of the user interface: KPI tiles, settings, the rack
 * inspector and how shuttles and lifts are described. */
(function (WS) {
  'use strict';
  const esc = WS.U.esc;
  const work = (list) => list.reduce((s, r) => s + r.utilization, 0) / list.length;
  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.shuttle = {
    kpiTiles(ui) {
      const sim = ui.sim, lifts = sim.aisles.map((a) => a.lift), shuttles = sim.aisles.flatMap((a) => a.shuttles);
      const busiest = lifts.reduce((m, l) => Math.max(m, work([l])), 0);
      return [
        ui.kpiTile('Lift utilization', Math.round(work(lifts) * 100), '%', `busiest lift ${Math.round(busiest * 100)}% · the usual bottleneck`),
        ui.kpiTile('Shuttle cycles', Math.round(sim.cycleRate()), '/h', `shuttles busy ${Math.round(work(shuttles) * 100)}% of the time`),
        ...(sim.bots ? WS.BotUI.kpiTiles(ui) : []),
      ];
    },
    settings(ui, c, num, sel) {
      return {
        live: `${sel('putawayPolicy', 'Where totes go back', [['velocity', 'Velocity-based (fast movers near the aisle front, least busy aisle)'], ['nearest', 'Nearest to the aisle front'], ['random', 'Random free position']])}
        <div class="row2">${num('handlerTime', 'Load handler (s)', 0.1, 0.5, 10)}${num('liftTransfer', 'Lift transfer (s)', 0.1, 0.3, 6)}</div>`,
        scenario: `<div class="row2">${num('aisles', 'Aisles', 1, 1, 10)}${num('levels', 'Levels', 1, 2, 30)}</div>
        <div class="row2">${num('bays', 'Bays per side', 1, 8, 60)}${num('rackFill', 'Share of positions with a tote', 0.05, 0.2, 0.95)}</div>
        <div class="row2">${num('portInboundCap', 'Totes in flight per station', 1, 1, 12)}${num('toteSlots', 'Put-wall slots', 1, 2, 12)}</div>
        <div class="row2">${num('bufferSize', 'Level buffer (totes)', 1, 1, 4)}${num('stockedRatio', 'Share of totes stocked', 0.05, 0.1, 0.95)}</div>
        <div class="row2">${num('shuttleV', 'Shuttle speed (m/s)', 0.1, 0.5, 6)}${num('shuttleA', 'Shuttle accel. (m/s²)', 0.1, 0.3, 5)}</div>
        <div class="row2">${num('liftV', 'Lift speed (m/s)', 0.1, 0.5, 8)}${num('liftA', 'Lift accel. (m/s²)', 0.1, 0.5, 10)}</div>
        ${WS.BotUI.settings(c, num, sel)}`,
        about: `Shuttle AS/RS: ${c.aisles} aisles of racking, ${c.levels} levels high and ${c.bays} bays long on each side, totes stored single deep. Every level has its own shuttle (captive); it pulls a tote, drives it to the front of the aisle and drops it in the level's outbound buffer, a short conveyor to the lift. The aisle's lift rolls it off onto the aisle's outfeed, and the one-way pre-zone loop carries it to a station; a tote whose station has no room goes round the loop again. Returning totes go to the aisle with the least work and queue on its infeed (when it is full, they go on to the next aisle with room); the lift brings the one at the head up to an inbound buffer and the shuttle puts it away. The lift serves the longest-waiting tote first and combines a put-away with a retrieval on the same level. Not modelled yet: roaming shuttles, double-deep storage, tote sequencing on the conveyor. Barcodes: GS1 GTIN-13 on items, GS1-128 GRAI on totes, GS1-128 SSCC on shipping labels.`,
      };
    },
    live: ['putawayPolicy', 'handlerTime', 'liftTransfer'],
    position(r) {
      if (r.claims) return WS.BotUI.position(r);
      const g = r.sim.grid;
      if (r.axis === 'y') return `Aisle ${r.a + 1} · level ${r.l + 1} · bay ${Math.max(1, Math.round(r.pos + 0.5))}`;
      return `Aisle ${r.a + 1} · ${r.z <= g.ioZ + 0.05 ? 'at the conveyor (I/O)' : 'level ' + (Math.round((r.z - g.Z0) / g.LH) + 1)}`;
    },
    speed(r) { if (r.claims) return WS.BotUI.speed(r); const c = r.sim.cfg; return r.v * (r.axis === 'y' ? c.cellSize : 0.33); },
    motion(r) { if (r.claims) return WS.BotUI.motion(r); return r.axis === 'y' ? 'shuttle on rails' : 'lift'; },
    mechanism(r) { if (r.claims) return WS.BotUI.mechanism(r); return `<dt>${r.axis === 'y' ? 'Load handler' : 'Transfer'}</dt><dd>${r.state === 'HANDLING' ? 'moving a tote' : 'idle'}</dd>`; },
    power() { return 'rail powered, no charging'; },
    liftsLabel: 'totes delivered',
    taskText(ui, r) {
      const t = r.task, sim = ui.sim;
      if (r.claims) return WS.BotUI.taskText(ui, r);
      if (t.type === 'RETRIEVE') return `Retrieve ${t.bin.id} → ${sim.ports[t.port].code}`;
      if (t.type === 'STORE') return `Put away ${t.bin.id}`;
      if (t.type === 'OUT') return `Bring ${t.bin.id} down`;
      if (t.type === 'IN') return `Take ${t.bin.id} up`;
      return t.type;
    },
    cellWord: WS.RackUI.cellWord,
    depthTag: WS.RackUI.depthTag,
    inspectCell(ui, i) {
      const sim = ui.sim, c = sim.mapGrid.at(i);
      if (!c) return WS.RackUI.conveyorHTML(ui);
      const aisle = sim.aisles[c.a], L = c.level;
      if (c.part === 1 || c.part === 3) {
        const m = c.part === 1 ? aisle.shuttles[L] : aisle.lift;
        return `<div class="hd"><b>Aisle ${c.a + 1} · ${c.part === 1 ? 'level ' + (L + 1) + ' lane' : 'lift shaft'}</b><button class="close">×</button></div>
          <dl class="kv"><dt>${c.part === 1 ? 'Shuttle' : 'Lift'}</dt><dd><a href="#" data-open="robot:${m.id}">${m.name}</a> · ${esc(ui.stateLabel(m.displayState))}</dd>
          <dt>Outbound buffer</dt><dd>${aisle.outBuf[L].length} / ${sim.cfg.bufferSize}</dd><dt>Inbound buffer</dt><dd>${aisle.inBuf[L].length} / ${sim.cfg.bufferSize}</dd>
          <dt>Retrievals queued</dt><dd>${aisle.shuttles[L].jobs.length}</dd><dt>Totes waiting for the lift</dt><dd>${aisle.inQ.length}</dd></dl>`;
      }
      return WS.RackUI.sideHTML(ui, c.a, L, c.part / 2, `<dt>Shuttle</dt><dd><a href="#" data-open="robot:${aisle.shuttles[L].id}">${aisle.shuttles[L].name}</a></dd>`);
    },
    locate: WS.RackUI.locate,
  };
})((globalThis.WS = globalThis.WS || {}));
