/* ZoneHop's part of the user interface. It has no robots or stations, so
 * it brings its own KPI tiles, settings panel, the zone cards and zone
 * table of the control room, the tote legend, the side tabs for the zones
 * and the routes, and the inspectors for zones, the A-frame, machines and
 * lanes. Orders and stock use the shared tabs. */
(function (WS) {
  'use strict';
  const U = WS.U, esc = U.esc, pct = (v) => Math.round(v * 100) + '%';
  const share = (p) => (p.stats.t ? p.stats.busy / p.stats.t : 0);
  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.zone = {
    allKpiTiles(ui) {
      const sim = ui.sim, k = sim.kpi, s = sim.stats, c = sim.cfg;
      const afUnits = sim.channels.reduce((a, ch) => a + ch.dispensed, 0), empty = sim.channels.filter((ch) => ch.comps[0].qty <= 0).length, req = sim.channels.filter((ch) => ch.req).length;
      const open = sim.oms.orders.filter((o) => o.status !== 'SHIPPED').length, lanes = sim.lanes.reduce((a, l) => a + l.stack.length, 0);
      const next = sim.routes.reduce((a, r) => Math.min(a, r.next), Infinity);
      return [
        ui.kpiTile('Order totes out', Math.round(k.rate('presented')), '/h', `${s.out} labelled · ${s.started} started`),
        ui.kpiTile('Order lines', Math.round(k.rate('lines')), 'LPH', `${k.unitsPicked} units picked`),
        ui.kpiTile('A-frame share', k.unitsPicked ? Math.round((afUnits / k.unitsPicked) * 100) : 0, '% of units', `${sim.channels.length} channels · ${empty} empty · ${req} waiting for a refill · ${s.short} lines short → completion`),
        ui.kpiTile('Loop', Math.round(sim.loopFill() * 100), '% full', `${s.loopTotes ? Math.round((s.recirc / s.loopTotes) * 100) : 0}% of totes went round again · start holds at ${pct(c.loopLimit)}`),
        ui.kpiTile('Merge wait', s.mergeN ? U.fmtDur(s.mergeWait / s.mergeN) : '—', '', `${sim.merge.totes.length} order totes · ${sim.merge.rf.length} RF totes at the merge · ${s.merged} RF totes tipped in`),
        ui.kpiTile('Orders shipped', Math.round(k.rate('shipped')), '/h', `${k.ordersShipped} on vans · ${s.missed} missed their van`),
        ui.kpiTile('In the lanes', lanes, 'totes', `next van ${isFinite(next) ? 'in ' + U.fmtDur(next - sim.time) : '—'} · ${s.shipped} totes shipped`),
        ui.kpiTile('Order cycle', k.cycleN ? U.fmtDur(k.cycleSum / k.cycleN) : '—', '', `order in → van · ${open} open · ${sim.waiting.length} not started`),
        ui.kpiTile('Empty totes', sim.oms.freeTotes.length, '', `on the de-stacker · ${sim.vansOut.reduce((a, v) => a + v.totes.length, 0)} out on vans · ${sim.returnDock.length} back at the dock`),
      ];
    },
    legend() {
      const T = { order: '#2563eb', rf: '#f59e0b', empty: '#64748b' };
      return `<span><i style="background:${T.order}"></i>Order tote</span><span><i style="background:${T.rf}"></i>RF tote</span><span><i style="background:${T.empty}"></i>Empty, back from a van</span><span class="faint">· A-frame channels: <i style="background:#f59e0b"></i> waiting for a refill <i style="background:#22c55e"></i> being refilled <i style="background:#7f1d1d"></i> empty</span>`;
    },
    settings(ui, c, num, sel) {
      return {
        full: `<div class="sect"><h3>Live</h3><div class="card">
        <div class="row2">${num('waves', 'Order waves (0 = steady)', 0.1, 0, 1)}${num('cutoff', 'Order cut-off before the van (s)', 60, 0, 7200)}</div>
        <div class="row2">${num('ptlLine', 'Pick-to-light: s per line', 0.1, 0.5, 10)}${num('ptlUnit', 'Pick-to-light: s per unit', 0.1, 0.2, 5)}</div>
        <div class="row2">${num('refillTime', 'A-frame refill (s)', 1, 5, 120)}${num('refillLevel', 'Refill a channel at (units)', 1, 0, 79)}</div>
        <div class="row2">${num('rfLine', 'RF: s per line', 0.5, 2, 30)}${num('mergeTime', 'Merge: s per RF tote', 0.5, 1, 30)}</div>
        <div class="row2">${num('loopLimit', 'Order start holds at loop fill', 0.05, 0.2, 1)}${num('spurTotes', 'Totes per zone spur', 1, 1, 6)}</div>
        <div class="row2">${num('weightErr', 'Weight check fails (share)', 0.005, 0, 0.3)}${num('startTime', 'Order start: s per tote', 0.5, 1, 20)}</div>
        <div class="note">Applied immediately. The order rate is in the Orders tab.</div></div></div>
      <div class="sect"><h3>Scenario <span class="sub">restarts the simulation</span></h3><div class="card">
        <div class="row2">${num('afChannels', 'A-frame channels', 20, 40, 480)}${num('refillOps', 'A-frame refill operators', 1, 0, 8)}</div>
        <div class="row2">${num('ptlZones', 'Pick-to-light zones', 1, 1, 5)}${num('ptlLocations', 'Locations per zone', 5, 20, 200)}</div>
        <div class="row2">${sel('carousels', 'Carousel zone', [[2, 'Two carousels, one operator'], [0, 'None']])}${num('carouselShelves', 'Shelves per carousel', 5, 20, 100)}</div>
        <div class="row2">${num('rfPickers', 'RF pickers', 1, 1, 10)}${num('rfLocations', 'RF locations', 50, 100, 1500)}</div>
        <div class="row2">${num('routes', 'Routes (vans)', 1, 2, 16)}${num('vanCapacity', 'Totes per van', 5, 10, 200)}</div>
        <div class="row2">${num('tourEvery', 'A tour leaves every (s)', 600, 1800, 21600)}${num('toteCount', 'Totes in circulation', 50, 100, 4000)}</div>
        <div class="row2">${num('products', 'SKUs', 50, 200, 2000)}${num('seed', 'Random seed', 1, 1)}</div>
        <div class="btns"><button class="btn primary" id="cfg-restart">Apply &amp; restart</button><button class="btn ghost" id="cfg-reset">Defaults</button><button class="btn ghost" id="cfg-share" title="Copy a link that opens exactly this setup: the settings above, the seed and the view">Copy link</button></div>
        <div class="note">Products are slotted by units a day: the fastest that fit the A-frame's channels go there, the next ones to the pick-to-light zones, then the carousels, the long tail to the RF shelving. Every route's van leaves once per tour, a van every ${c.vanStagger} s.</div></div></div>
      <div class="sect"><h3>About the model</h3><div class="card" style="font-size:12px;color:var(--muted)">${this.about(c)}</div></div>`,
      };
    },
    about(c) {
      return `A pharmacy wholesaler's order picking, where the order tote travels past the stock. Pharmacies on ${c.routes} routes order ${c.minLines}–${c.maxLines} lines at a time, ${c.orderRate} orders an hour on average, in waves before their van leaves. Order start, past the end of the A-frame: the de-stacker feeds an empty tote (${c.startTime} s) and a printer labels it; the tote passes under the A-frame's hopper on its way to the loop and waits there only when its order has A-frame lines. The A-frame (${c.afChannels} channels on two sloping faces) has a belt underneath with a ${c.windowLength} m window per order,; each channel ejects its product into the windows that need it (${c.unitTime} s a unit) and the window tips into the order tote at the end of the belt, which waits for its tote. Refill operators (${c.refillOps}) refill channels at ${c.refillLevel} units with a bin of the product from the flow rack behind their walkway (${c.refillTime} s), the one that runs out first first; the Cuby shuttle store (${c.cubyAisles} aisles) sends a new bin to the lane for each one taken; a line whose channel is empty goes short and the tote goes to the completion zone. The tote then rides a loop and turns into every zone its order has lines in, and only those: ${c.ptlZones} pick-to-light zones with flow racks (${c.ptlLine} s a line + ${c.ptlUnit} s a unit) and ${c.carousels ? 'a zone with two horizontal carousels, one turning while the operator picks from the other' : 'no carousels'}. A full spur sends it round again; the order start holds while the loop is ${pct(c.loopLimit)} full. Slow movers are picked by ${c.rfPickers} RF pickers in shelving, in batches of ${c.rfBatch} orders, into their own tote, which an operator tips into the order tote at the merge. The closing line weighs (${pct(c.weightErr)} go to a manual check), inserts the documents, closes the lid and labels each tote; the shipping sorter sends it to its route's lane, where it waits for the van (${c.vanCapacity} totes). Vans bring the empty totes back after their trip; the tote-emptying machine tips them and stacks them for the de-stacker. Barcodes: GS1 GTIN-13 on items, GRAI on totes, SSCC on the closed totes.`;
    },
    live: ['waves', 'cutoff', 'ptlLine', 'ptlUnit', 'refillTime', 'refillLevel', 'rfLine', 'mergeTime', 'loopLimit', 'spurTotes', 'weightErr', 'startTime'],

    // ---------- control room
    portsNote: 'Bar: busy. Zones: share of totes that skip the zone. RF: the pickers on average.',
    portCard(ui, p) {
      const sim = ui.sim, z = p.zoneRef;
      let busy = share(p), meta = '', status = p.busy ? '<span class="pill SHIPPED">WORKING</span>' : '<span class="pill">IDLE</span>';
      if (z) meta = `<span>${z.in.totes.length}/${sim.cfg.spurTotes} on the spur · ${z.lines} lines</span><span>skipped by ${sim.stats.loopTotes ? pct(z.skipped / sim.stats.loopTotes) : '—'}</span>`;
      else if (p === sim.afPort) { meta = `<span>${sim.windows.length} windows on the belt · ${sim.channels.filter((ch) => ch.req).length} refills asked</span><span>${sim.channels.filter((ch) => ch.comps[0].qty <= 0).length} empty</span>`; status = sim.windows.length && !sim.afRunning ? '<span class="pill BACKORDER">BELT WAITS FOR A TOTE</span>' : sim.windows.length ? '<span class="pill SHIPPED">RUNNING</span>' : '<span class="pill">IDLE</span>'; }
      else if (p === sim.rfPort) { busy = sim.pickers.reduce((a, k) => a + k.utilization, 0) / (sim.pickers.length || 1); meta = `<span>${sim.rfQueue.length} orders waiting · ${sim.pickers.filter((k) => k.job).length}/${sim.pickers.length} pickers out</span><span>${p.stats.lines} lines</span>`; status = sim.pickers.some((k) => k.job) ? '<span class="pill SHIPPED">PICKING</span>' : '<span class="pill">IDLE</span>'; }
      else if (p === sim.mergePort) meta = `<span>${sim.merge.totes.length} order totes · ${sim.merge.rf.length} RF totes</span><span>${sim.stats.merged} tipped in</span>`;
      else if (p === sim.checkPort) meta = `<span>${sim.checkStation.tote ? 'checking a tote' : 'nothing to check'}</span><span>${sim.checkStation.done} checked</span>`;
      if (p.away) status = '<span class="pill BACKORDER">ON BREAK</span>';
      return `<div class="pcard" data-open="port:${p.idx}"><div class="row"><span class="name">${p.code} · ${esc(p.name)}</span>${status}</div>
        <div class="row meta">${meta}</div>
        <div class="bar"><i style="width:${busy * 100}%;background:#3987e5"></i></div></div>`;
    },
    // the control room's table: the zones, with what they pick and how often they are skipped
    fleetTable(ui) {
      const sim = ui.sim, n = sim.stats.loopTotes || 1, h = Math.max(sim.time, 60) / 3600;
      const rows = sim.zones.map((z) => `<tr class="click" data-open="port:${z.port.idx}"><td><b>${z.port.code}</b> ${esc(z.kind === 'carousel' ? 'Carousels' : 'Pick-to-light')}</td><td class="r">${Math.round(z.lines / h)}</td><td class="r">${pct(share(z.port))}</td><td class="r">${pct(z.skipped / n)}</td><td class="r">${z.in.totes.length}</td></tr>`);
      const af = sim.afPort;
      rows.unshift(`<tr class="click" data-open="port:${af.idx}"><td><b>AF</b> A-frame</td><td class="r">${Math.round(af.stats.lines / h)}</td><td class="r">${pct(share(af))}</td><td class="r">${sim.stats.started ? pct(1 - sim.stats.afTotes / sim.stats.started) : '—'}</td><td class="r">${sim.windows.length}</td></tr>`);
      rows.push(`<tr class="click" data-open="port:${sim.rfPort.idx}"><td><b>RF</b> RF shelving</td><td class="r">${Math.round(sim.rfPort.stats.lines / h)}</td><td class="r">${pct(sim.pickers.reduce((a, k) => a + k.utilization, 0) / (sim.pickers.length || 1))}</td><td class="r">${sim.stats.orders ? pct(1 - sim.stats.rfTotes / sim.stats.orders) : '—'}</td><td class="r">${sim.rfQueue.length}</td></tr>`);
      return `<tr><th>Zone</th><th class="r">Lines/h</th><th class="r">Busy</th><th class="r">Skipped</th><th class="r">Queue</th></tr>` + rows.join('');
    },

    // ---------- side tabs
    tab_zones() { return '<div id="zones"></div>'; },
    live_zones(ui) {
      const el = document.getElementById('zones'); if (!el) return;
      const sim = ui.sim, c = sim.cfg, h = Math.max(sim.time, 60) / 3600, n = sim.stats.loopTotes || 1;
      const low = sim.channels.filter((ch) => ch.req).sort((a, b) => sim.channelUrgency(a) - sim.channelUrgency(b)).slice(0, 10);
      el.innerHTML = `<div class="sect"><h3>A-frame <span class="sub">${sim.channels.length} channels · belt ${sim.afRunning || !sim.windows.length ? 'running' : 'waiting for a tote'}</span></h3><div class="stats">${[['Windows on belt', sim.windows.length], ['Empty channels', sim.channels.filter((ch) => ch.comps[0].qty <= 0).length], ['Refills asked', sim.channels.filter((ch) => ch.req && !ch.req.op).length], ['Being refilled', sim.channels.filter((ch) => ch.req && ch.req.op).length], ['Waiting for a bin', sim.channels.filter((ch) => ch.req && !ch.req.op && ch.res < 1).length], ['Bins from the Cuby', sim.cuby.moving.filter((m) => m.full).length], ['Lines short', sim.stats.short], ['Completed', sim.stats.completed]].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div>
        <table class="tbl"><tr><th>Refill operator</th><th>Doing</th><th class="r">Refills</th><th class="r">Busy</th></tr>${sim.refillers.map((op) => `<tr><td>${esc(op.name)}</td><td>${op.away && !op.job ? 'on a break' : op.job ? `${op.state === 'WORKING' ? (op.fetch ? 'taking the bin for' : 'refilling') : 'to'} ${op.job.code}` : 'waiting'}</td><td class="r">${op.done}</td><td class="r">${pct(op.utilization)}</td></tr>`).join('')}</table>
        ${low.length ? `<table class="tbl" style="margin-top:8px"><tr><th>Channel</th><th>Product</th><th class="r">Units</th><th class="r">Runs out in</th></tr>${low.map((ch) => { const p = sim.inv.byGtin.get(ch.comps[0].gtin); return `<tr class="click" data-open="prod:${p.gtin}"><td class="mono">${ch.code}</td><td>${esc(p.name)}</td><td class="r">${ch.comps[0].qty}</td><td class="r">${U.fmtDur((ch.comps[0].qty / Math.max(0.05, p.hits * 1.55)) * 3600)}</td></tr>`; }).join('')}</table>` : ''}</div>
        <div class="sect"><h3>Zones on the loop</h3><table class="tbl"><tr><th>Zone</th><th class="r">Lines/h</th><th class="r">Skipped</th><th class="r">Busy</th></tr>${sim.zones.map((z) => `<tr class="click" data-open="port:${z.port.idx}"><td><b>${z.port.code}</b> ${esc(z.kind === 'carousel' ? 'Carousels' : z.idx === 0 ? 'Pick-to-light · completion' : 'Pick-to-light')}</td><td class="r">${Math.round(z.lines / h)}</td><td class="r">${pct(z.skipped / n)}</td><td class="r">${pct(share(z.port))}</td></tr>`).join('')}</table>
        <div class="note">A tote turns into a zone only when its order has lines there (zone skipping). With the spur full (${c.spurTotes} totes) it goes round the loop again: ${pct(sim.stats.recirc / n)} of totes so far.</div></div>
        <div class="sect"><h3>RF shelving <span class="sub">${sim.rfQueue.length} orders waiting</span></h3><table class="tbl"><tr><th>Picker</th><th>Doing</th><th class="r">Batches</th><th class="r">Busy</th></tr>${sim.pickers.map((pk) => `<tr><td>${esc(pk.name)}</td><td>${pk.away && !pk.job ? 'on a break' : pk.job ? (pk.job.k < pk.job.stops.length ? `line ${pk.job.k + 1} of ${pk.job.stops.length}` : 'putting totes on the belt') : 'waiting for a batch'}</td><td class="r">${pk.done}</td><td class="r">${pct(pk.utilization)}</td></tr>`).join('')}</table></div>`;
    },
    tab_routes() { return '<div id="routes"></div>'; },
    live_routes(ui) {
      const el = document.getElementById('routes'); if (!el) return;
      const sim = ui.sim, c = sim.cfg;
      el.innerHTML = `<div class="sect"><h3>Route lanes <span class="sub">a van leaves every ${U.fmtDur(c.tourEvery)}</span></h3><table class="tbl"><tr><th>Route</th><th class="r">In lane</th><th class="r">Leaves</th><th class="r">Trips</th><th class="r">Missed</th></tr>${sim.lanes.map((l) => { const r = l.route, f = Math.min(1, l.stack.length / c.vanCapacity); return `<tr class="click" data-open="cell:${sim.grid.idx(Math.floor(sim.grid.SX + 7), Math.floor(l.y))}"><td><span class="sdot" style="background:${r.color}"></span>${esc(r.name)}</td><td class="r" style="min-width:64px">${l.stack.length}<div class="bar" style="margin:2px 0 0"><i style="width:${f * 100}%;background:${f >= 1 ? '#ef4444' : '#3987e5'}"></i></div></td><td class="r">${U.fmtClock(r.next).slice(-8, -3)}</td><td class="r">${r.trips}</td><td class="r">${r.missed}</td></tr>`; }).join('')}</table></div>
        <div class="sect"><h3>Vans gone</h3><table class="tbl"><tr><th>Van</th><th class="r">Left</th><th class="r">Totes</th><th class="r">Orders</th><th class="r">Missed it</th></tr>${sim.vanLog.slice(-16).reverse().map((v) => `<tr><td><span class="sdot" style="background:${v.route.color}"></span>${esc(v.route.name)}</td><td class="r">${U.fmtClock(v.t).slice(-8, -3)}</td><td class="r">${v.totes}</td><td class="r">${v.orders}</td><td class="r">${v.missed}</td></tr>`).join('') || '<tr><td colspan="5" class="faint">No van has left yet</td></tr>'}</table>
        <div class="note">An order is due on the first van of its route that leaves at least ${U.fmtDur(c.cutoff)} after it came in; one that is not on it has missed its van and goes on the next trip.</div></div>`;
    },

    // ---------- inspectors
    inspectCell(ui, i) {
      const sim = ui.sim, g = sim.grid, th = g.what[i] >= 0 ? sim.things[g.what[i]] : null, hd = (t, pill) => `<div class="hd"><b>${t}</b>${pill ? `<span class="pill">${pill}</span>` : ''}<button class="close">×</button></div>`;
      const sel = ui.selection;
      if (sel && sel.tote) return this.inspectTote(ui, sel.tote, hd);
      if (th && th.kind === 'machine') {
        const m = th.m, t = m.tote;
        return hd(m.name, m.down ? 'DOWN' : t ? 'WORKING' : 'IDLE') + `<dl class="kv"><dt>Cycle</dt><dd>${sim.cfg[m.id + 'Time']} s per tote</dd><dt>Tote</dt><dd>${t ? `${t.id} · <a href="#" data-open="order:${t.order.id}">${t.order.id}</a>` : '—'}</dd><dt>Totes done</dt><dd>${m.cycles}</dd><dt>Busy</dt><dd>${pct(m.busy / Math.max(1, sim.time))}</dd>${m.id === 'scale' ? `<dt>Off weight</dt><dd>${sim.stats.weightFails} totes to the manual check</dd>` : ''}</dl>`;
      }
      if (th && th.kind === 'lane') {
        const l = th.lane, r = l.route;
        return hd(`Lane ${esc(r.name)}`, `${l.stack.length} totes`) + `<dl class="kv"><dt>Van</dt><dd>leaves ${U.fmtClock(r.next)} (in ${U.fmtDur(r.next - sim.time)}) · ${sim.cfg.vanCapacity} totes</dd><dt>Trips</dt><dd>${r.trips} · ${r.totes} totes</dd><dt>Missed</dt><dd>${r.missed} orders</dd><dt>Pharmacies</dt><dd>${r.pharmacies.slice(0, 6).map((p) => esc(p.name)).join(', ')} …</dd></dl>
          <div class="bar"><i style="width:${Math.min(100, (l.stack.length / sim.cfg.vanCapacity) * 100)}%;background:${r.color}"></i></div>`;
      }
      if (th && th.kind === 'merge') return this.inspectPort(ui, sim.mergePort);
      if (th && th.kind === 'rf') return this.inspectPort(ui, sim.rfPort);
      if (th && th.kind === 'aframe') return this.inspectPort(ui, sim.afPort);
      if (th && th.kind === 'zone') return this.inspectPort(ui, th.zone.port);
      if (th && th.kind === 'cuby') {
        const cb = sim.cuby, h = Math.max(sim.time, 60) / 3600, c = sim.cfg;
        return hd('Cuby shuttle store') + `<dl class="kv"><dt>Aisles</dt><dd>${c.cubyAisles}, ${c.cubyLevels} levels with a shuttle each, a lift at the end</dd><dt>Holds</dt><dd>the reserve bins of the A-frame's products (its own stock is not modelled)</dd><dt>Bins sent</dt><dd>${cb.retrieved} · ${Math.round(cb.retrieved / h)} an hour</dd><dt>On their way</dt><dd>${cb.moving.filter((m) => m.full).length} full to the flow racks, ${cb.moving.filter((m) => !m.full).length} empty back</dd><dt>Waiting</dt><dd>${cb.aisles.map((a) => `aisle ${a.a + 1}: ${Math.max(0, Math.round(a.free - sim.time))} s`).join(' · ')}</dd><dt>Per bin</dt><dd>${c.cubyRetrieve} s from the request to the lift, one every ${c.cubyCycle} s from each lift; then the conveyor</dd></dl><div class="note">A lane in the flow rack that gives up a bin to a refill operator asks for another; the aisle whose lift is free first sends it.</div>`;
      }
      if (th && th.kind === 'start') return hd('Order start') + `<dl class="kv"><dt>De-stacker</dt><dd>${sim.oms.freeTotes.length} empty totes</dd><dt>Orders waiting</dt><dd>${sim.waiting.length}</dd><dt>Started</dt><dd>${sim.stats.started} totes · one every ${sim.cfg.startTime} s at most</dd><dt>Holds</dt><dd>while the loop is ${pct(sim.cfg.loopLimit)} full (now ${pct(sim.loopFill())}) or the A-frame has no free window</dd></dl>`;
      const b = sim.net.belts.find((x) => x.totes.some((t) => Math.floor(t.x) === g.cx(i) && Math.floor(t.y) === g.cy(i)));
      return hd(`Cell X${g.cx(i)} · Y${g.cy(i)}`, b ? esc(b.name) : '') + (b ? `<dl class="kv"><dt>Belt</dt><dd>${esc(b.name)} · ${b.totes.length} totes</dd></dl>` : '');
    },
    // An order tote: its order and pharmacy, the zones it needs and has done, where it is.
    inspectTote(ui, t, hd) {
      const sim = ui.sim, o = t.order;
      const where = t.belt ? t.belt.name : { merge: 'at the merge', lane: 'in its route lane', van: 'on the van', gone: 'on the van', dock: 'back at the dock', stack: 'on the de-stacker', recycle: 'emptied, back to the de-stacker', cart: 'on an RF cart' }[t.at] || t.at;
      if (!o) return hd(`Tote ${t.id}`, 'EMPTY') + `<dl class="kv"><dt>Where</dt><dd>${esc(where)}</dd></dl><div class="bcwrap">${WS.Barcode.gs1SVG([['8003', t.grai]], { height: 40 })}</div><div class="note">GS1-128 · AI 8003 GRAI (returnable tote)</div>`;
      const zones = [...(t.zones || [])].map((z) => `${t.done && t.done.has(z) ? '✓' : '○'} ${z}`).join(' · ') || (t.kind === 'rf' ? 'RF shelving' : 'none: the A-frame only');
      return hd(`Tote ${t.id}`, t.kind === 'rf' ? 'RF TOTE' : `${t.no} of ${o.ntotes}`) + `<dl class="kv"><dt>Order</dt><dd><a href="#" data-open="order:${o.id}">${o.id}</a> · <span class="pill ${o.status}">${o.status}</span></dd><dt>Pharmacy</dt><dd>${esc(o.customer)} · ${esc(o.postcode)} ${esc(o.city)}</dd><dt>Route</dt><dd><span class="sdot" style="background:${o.route.color}"></span>${esc(o.route.name)} · van at ${U.fmtClock(o.due).slice(-8, -3)}</dd>
        <dt>Where</dt><dd>${esc(where)}</dd>${t.kind === 'order' ? `<dt>A-frame</dt><dd>${t.afLines && t.afLines.length ? `${t.afLines.length} lines${t.tipped ? ' · tipped in' : ' · window on the belt'}${t.completion ? ` · ${t.completion.length} short → completion` : ''}` : 'none'}</dd><dt>Zones</dt><dd>${zones}</dd><dt>Laps</dt><dd>${Math.max(0, (t.laps || 0) - 1)} extra</dd>` : ''}
        <dt>Lines</dt><dd>${t.lines ? t.lines.length : 0} · ${t.units || 0} units in it</dd>${t.sscc ? `<dt>SSCC</dt><dd class="mono">${t.sscc}</dd>` : ''}</dl>
        <div class="bcwrap">${WS.Barcode.gs1SVG(t.sscc ? [['00', t.sscc]] : [['8003', t.grai]], { height: 40 })}</div><div class="note">${t.sscc ? 'GS1-128 SSCC on the closed tote' : 'GS1-128 · AI 8003 GRAI (returnable tote)'}</div>`;
    },
    inspectPort(ui, p) {
      const sim = ui.sim, z = p.zoneRef, hd = `<div class="hd"><b>${p.code} · ${esc(p.name)}</b>${p.away ? '<span class="pill BACKORDER">ON BREAK</span>' : ''}<button class="close">×</button></div>`;
      if (z) {
        const j = z.job, x = j && j.cur, prod = x && sim.inv.byGtin.get(x.line.gtin);
        const screen = x ? `<div class="muted">${x.completion ? 'COMPLETION · from the reserve' : `PICK from ${x.bin.code}`} → tote ${j.tote.id}</div><div class="big">${x.qty}×</div><div><b>${esc(prod.name)}</b></div><div class="bcwrap" style="margin-top:6px">${WS.Barcode.ean13SVG(prod.gtin, { height: 34, module: 1.3 })}</div>` : j ? `<div class="muted">Tote ${j.tote.id} · ${j.tote.order.id}</div><div>${z.kind === 'carousel' ? 'Carousels turning to the next shelf' : 'Confirming'}</div>` : '<div class="muted">No tote at the pick position</div>';
        return hd + `<div class="hmi">${screen}${j ? `<div class="bar"><i style="width:${(1 - (j.queue.length + (j.queues ? j.queues.reduce((a, q) => a + q.length, 0) : 0)) / Math.max(1, j.n)) * 100}%;background:#3987e5"></i></div>` : ''}</div>
          <dl class="kv" style="margin-top:10px"><dt>Locations</dt><dd>${z.bins.length}${z === sim.zones[0] ? ' · also the completion zone for A-frame lines that came short' : ''}</dd><dt>Spur</dt><dd>${z.in.totes.length} of ${sim.cfg.spurTotes} totes</dd><dt>Totes picked</dt><dd>${z.done} · ${z.lines} lines · ${z.units} units</dd><dt>Skipped by</dt><dd>${sim.stats.loopTotes ? pct(z.skipped / sim.stats.loopTotes) : '—'} of the totes</dd><dt>Operator busy</dt><dd>${pct(share(p))}</dd>${z.kind === 'carousel' ? `<dt>Carousels</dt><dd>${z.carousels.map((cr) => `${(cr.moved * 1).toFixed(0)} m turned`).join(' · ')}</dd>` : ''}</dl>`;
      }
      if (p === sim.afPort) {
        const w = sim.windows;
        return hd + `<dl class="kv"><dt>Belt</dt><dd>${sim.afRunning || !w.length ? 'running' : '<b>waiting for its tote at the end</b>'} · ${sim.cfg.beltSpeed} m/s · ${w.length} windows on it</dd><dt>Front window</dt><dd>${w[0] ? `<a href="#" data-open="order:${w[0].order.id}">${w[0].order.id}</a> · ${w[0].units} units so far` : '—'}</dd>
          <dt>Channels</dt><dd>${sim.channels.length} · ${sim.channels.filter((ch) => ch.comps[0].qty <= 0).length} empty · ${sim.channels.filter((ch) => ch.req).length} asking for a refill</dd><dt>Units dispensed</dt><dd>${sim.channels.reduce((a, ch) => a + ch.dispensed, 0)}</dd><dt>Short lines</dt><dd>${sim.stats.short} sent to completion</dd><dt>Refill operators</dt><dd>${sim.refillers.map((op) => `${esc(op.name)}: ${op.done} refills`).join(' · ')}</dd></dl>`;
      }
      if (p === sim.rfPort) return hd + `<dl class="kv"><dt>Locations</dt><dd>${sim.rfBins.length} in ${sim.grid.na} aisles</dd><dt>Orders waiting</dt><dd>${sim.rfQueue.length} · batches of ${sim.cfg.rfBatch}</dd><dt>Pickers</dt><dd>${sim.pickers.map((pk) => `${esc(pk.name)} ${pct(pk.utilization)}`).join(' · ')}</dd><dt>RF totes</dt><dd>${sim.stats.rfTotes} · ${p.stats.lines} lines</dd></dl>`;
      if (p === sim.mergePort) { const j = sim.merge.job; return hd + `<dl class="kv"><dt>Now</dt><dd>${j ? `tipping the RF tote into <a href="#" data-open="order:${j.o.id}">${j.o.id}</a>` : 'waiting for a complete order'}</dd><dt>Waiting</dt><dd>${sim.merge.totes.length} order totes (room for ${sim.cfg.mergeBuffer}) · ${sim.merge.rf.length} RF totes</dd><dt>Tipped in</dt><dd>${sim.stats.merged} RF totes</dd><dt>Average wait</dt><dd>${sim.stats.mergeN ? U.fmtDur(sim.stats.mergeWait / sim.stats.mergeN) : '—'}</dd></dl>`; }
      return hd + `<dl class="kv"><dt>Checked</dt><dd>${sim.checkStation.done} totes · ${sim.cfg.checkTime} s each</dd><dt>Now</dt><dd>${sim.checkStation.tote ? sim.checkStation.tote.order.id : '—'}</dd></dl>`;
    },
    locate(ui, b) { return `${b.code} · ${{ AF: 'A-frame', RF: 'RF shelving', CA: 'carousels' }[b.zone] || 'pick-to-light ' + b.zone}`; },
    cellWord: 'location',
    depthTag() { return ''; },
    motion() { return ''; },
    mechanism() { return ''; },
    liftsLabel: '',
  };
})((globalThis.WS = globalThis.WS || {}));
