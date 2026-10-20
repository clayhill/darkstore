/* DeepLane's part of the user interface: KPI tiles, settings, the lane
 * inspector and how carriers and lifts are described. */
(function (WS) {
  'use strict';
  const esc = WS.U.esc;
  const work = (list) => list.reduce((s, r) => s + r.utilization, 0) / list.length;
  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.pallet = {
    kpiTiles(ui) {
      const sim = ui.sim, lifts = sim.aisles.map((a) => a.lift), carriers = sim.aisles.flatMap((a) => a.shuttles);
      const busiest = lifts.reduce((m, l) => Math.max(m, work([l])), 0), n = sim.inv.bins.filter((b) => b.loc === 'grid').length;
      return [
        ui.kpiTile('Lift utilization', Math.round(work(lifts) * 100), '%', `busiest lift ${Math.round(busiest * 100)}% · the usual bottleneck`),
        ui.kpiTile('Carrier cycles', Math.round(sim.cycleRate()), '/h', `carriers busy ${Math.round(work(carriers) * 100)}% of the time`),
        ui.kpiTile('Pallets stored', n, '', `${Math.round((n / sim.storageCapacity()) * 100)}% of ${sim.storageCapacity()} positions · ${sim.stats.received} received · ${sim.stats.emptied} empty out`),
      ];
    },
    settings(ui, c, num, sel) {
      return {
        live: `${sel('putawayPolicy', 'Where pallets go back', [['velocity', 'Velocity-based (fast movers in the lanes near the lift, least busy block)'], ['nearest', 'Nearest to the lift'], ['random', 'Random lane with room']])}
        <div class="row2">${num('satLift', 'Satellite lift / set down (s)', 0.1, 0.5, 10)}${num('liftTransfer', 'Lift transfer (s)', 0.1, 1, 15)}</div>`,
        scenario: `<div class="row2">${num('aisles', 'Blocks (transfer aisles)', 1, 1, 6)}${num('levels', 'Levels', 1, 2, 12)}</div>
        <div class="row2">${num('bays', 'Lanes per side', 1, 6, 40)}${num('laneDepth', 'Pallets per lane', 1, 2, 20)}</div>
        <div class="row2">${num('rackFill', 'Share of positions with a pallet', 0.05, 0.2, 0.95)}${num('palletVolume', 'Goods per pallet (L)', 50, 50, 2000)}</div>
        <div class="row2">${num('portInboundCap', 'Pallets in flight per station', 1, 1, 6)}${num('toteSlots', 'Put-wall slots', 1, 2, 12)}</div>
        <div class="row2">${num('shuttleV', 'Carrier speed (m/s)', 0.1, 0.5, 4)}${num('satV', 'Satellite speed (m/s)', 0.1, 0.3, 2)}</div>
        <div class="row2">${num('liftV', 'Lift speed (m/s)', 0.1, 0.5, 4)}${num('liftA', 'Lift accel. (m/s²)', 0.1, 0.2, 3)}</div>`,
        note: 'Each lane holds one SKU and is last in, first out: only the pallet nearest the transfer aisle can be taken.',
        about: `Automated pallet shuttle store: ${c.aisles} blocks, ${c.levels} levels high, with ${c.bays} lanes on each side of a transfer aisle per level, ${c.laneDepth} pallets deep. On every level a carrier runs along the transfer aisle with a satellite on board; at a lane the satellite drives in under the pallets, lifts one off the rails and brings it back. Each lane holds one SKU and is filled from the back, so it works last in, first out: only the pallet nearest the transfer aisle can be taken, and a returning pallet goes in front of the others (of its own SKU, or into an empty lane, never in front of a pallet a station is waiting for). An order line the front pallets cannot fill on their own empties a front pallet and goes on with the one behind it. The carrier drops a pallet in the level's outbound buffer, the block's lift takes it down, and the pallet conveyor loop carries it to a station. Full pallets come in from the receiving dock past the goods-in station, where they are checked and labelled; a pallet picked empty goes to the empty-pallet stacker. Barcodes: GS1 GTIN-13 on items, GS1-128 GRAI on pallets, GS1-128 SSCC on shipping labels.`,
      };
    },
    live: ['putawayPolicy', 'satLift', 'liftTransfer'],
    inboundNote: 'Received goods arrive as new full pallets at the receiving dock. The conveyor takes each one past the goods-in station, where the operator checks and labels it, and the store puts it in front of pallets of its SKU or in an empty lane. A pallet picked empty leaves to the empty-pallet stacker.',
    position(r) {
      const g = r.sim.grid;
      if (r.axis === 'y') return `Block ${r.a + 1} · level ${r.l + 1} · lane ${Math.max(1, Math.round(r.pos + 0.5))}${r.sat > 0.6 ? ` · satellite ${(r.sat * r.sim.cfg.cellSize).toFixed(1)} m into the ${r.satSide ? 'right' : 'left'} lane` : ''}`;
      return `Block ${r.a + 1} · ${r.z <= g.ioZ + 0.05 ? 'at the conveyor (I/O)' : 'level ' + (Math.round((r.z - g.Z0) / g.LH) + 1)}`;
    },
    speed(r) { const c = r.sim.cfg; return r.v * (r.axis === 'y' ? c.cellSize : 0.33); },
    motion(r) { return r.axis === 'y' ? 'carrier on rails, satellite on board' : 'pallet lift'; },
    mechanism(r) { return r.axis === 'y' ? `<dt>Satellite</dt><dd>${r.sat > 0.6 ? 'in a lane' : 'on the carrier'}${r.raised ? ', holding a pallet' : ''}</dd>` : `<dt>Transfer</dt><dd>${r.state === 'HANDLING' ? 'moving a pallet' : 'idle'}</dd>`; },
    power() { return 'rail powered, no charging'; },
    liftsLabel: 'pallets delivered',
    taskText(ui, r) {
      const t = r.task, sim = ui.sim;
      if (t.type === 'RETRIEVE') return `Retrieve ${t.bin.id} → ${sim.ports[t.port].code}`;
      if (t.type === 'STORE') return `Put away ${t.bin.id}`;
      if (t.type === 'OUT') return `Bring ${t.bin.id} down`;
      if (t.type === 'IN') return `Take ${t.bin.id} up`;
      return t.type;
    },
    cellWord: 'lane',
    depthTag(depth) { return depth > 1 ? `${depth - 1} in front` : 'at the front'; },
    // A lane side at one level: every lane with its pallets, the front first.
    inspectCell(ui, i) {
      const sim = ui.sim, c = sim.mapGrid.at(i);
      if (!c) return WS.RackUI.conveyorHTML(ui).replace('Totes', 'Pallets');
      const aisle = sim.aisles[c.a], L = c.level;
      if (c.part === 1 || c.part === 3) {
        const m = c.part === 1 ? aisle.shuttles[L] : aisle.lift;
        return `<div class="hd"><b>Block ${c.a + 1} · ${c.part === 1 ? 'level ' + (L + 1) + ' transfer aisle' : 'lift shaft'}</b><button class="close">×</button></div>
          <dl class="kv"><dt>${c.part === 1 ? 'Carrier' : 'Lift'}</dt><dd><a href="#" data-open="robot:${m.id}">${m.name}</a> · ${esc(ui.stateLabel(m.displayState))}</dd>
          <dt>Outbound buffer</dt><dd>${aisle.outBuf[L].length} / ${sim.cfg.bufferSize}</dd><dt>Inbound buffer</dt><dd>${aisle.inBuf[L].length} / ${sim.cfg.bufferSize}</dd>
          <dt>Retrievals queued</dt><dd>${aisle.shuttles[L].jobs.length}</dd><dt>Pallets waiting for the lift</dt><dd>${aisle.inQ.length}</dd></dl>`;
      }
      const s = c.part / 2, SB = sim.grid.SB, DN = sim.cfg.laneDepth, rows = [];
      let n = 0;
      for (let b = SB - 1; b >= 0; b--) {
        const cnt = sim.laneCount(aisle, L, s, b), gtin = sim.laneGtin(aisle, L, s, b), prod = gtin && sim.inv.byGtin.get(gtin);
        n += cnt;
        const front = cnt ? aisle.slot[sim.si(L, s, b, DN - cnt)] : null;
        rows.push(`<tr${front ? ` class="click" data-open="bin:${front}"` : ''}><td>${b + 1}</td><td>${prod ? esc(prod.name) : '<span class="faint">empty</span>'}</td><td style="min-width:60px"><div class="bar" style="margin:0"><i style="width:${(cnt / DN) * 100}%;background:#3987e5"></i></div></td><td class="r">${cnt} / ${DN}${aisle.resv[sim.si(L, s, b)] ? ' <span class="faint">+1 coming</span>' : ''}</td></tr>`);
      }
      return `<div class="hd"><b>Block ${c.a + 1} · level ${L + 1} · ${s ? 'right' : 'left'} lanes</b><button class="close">×</button></div>
        <dl class="kv"><dt>Pallets</dt><dd>${n} / ${SB * DN}</dd><dt>Carrier</dt><dd><a href="#" data-open="robot:${aisle.shuttles[L].id}">${aisle.shuttles[L].name}</a></dd></dl>
        <h3>Lanes, nearest the lift first</h3><table class="tbl"><tr><th>Lane</th><th>SKU</th><th>Fill</th><th class="r">Pallets</th></tr>${rows.join('')}</table>
        <div class="note">One SKU per lane, last in, first out. Click a lane for its front pallet.</div>`;
    },
    locate(ui, b) { return `Block ${b.aisle + 1} · level ${b.level + 1} · ${b.side ? 'right' : 'left'} lane ${b.bay + 1} · ${b.depth ? 'position ' + (b.depth + 1) + ' from the front' : 'at the front'}`; },
  };
})((globalThis.WS = globalThis.WS || {}));
