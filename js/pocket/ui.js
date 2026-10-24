/* PocketFlow's part of the user interface. It has no stock or orders of the
 * shared kind, so it brings its own KPI tiles, settings panel and side tabs
 * (Orders, Pockets, Returns), the station cards for the control room, a
 * legend of pocket states, and inspectors for an order, a pocket and a rail. */
(function (WS) {
  'use strict';
  const U = WS.U, esc = U.esc, pct = (v) => Math.round(v * 100);
  const PCOL = { EMPTY: '#64748b', STOCK: '#c98500', WAIT: '#d95926', READY: '#3987e5', SEQ: '#a855f7', PACK: '#199e70', RESTOCK: '#94a3b8' };
  const OSTATE = { OPEN: 'being picked', READY: 'complete in storage', BATCHED: 'in the sequencer', PACKING: 'being packed', SHIPPED: 'shipped' };
  const clock = (sim, t) => U.fmtClock(sim.clock(t)).slice(-8, -3);
  const pocketLink = (p) => `<a href="#" data-open="pocket:${p.id}">${p.code}</a>`;
  const where = (sim, it) => {
    if (it.pocket) { const p = it.pocket, b = p.belt; return `pocket ${p.code} · ${b ? b.name.replace(/ spur$/, ' buffer') : 'moving'}`; }
    if (it.at.startsWith('table')) return 'on the packing table';
    if (it.at.startsWith('tote')) return 'picked, in ' + it.at;
    return it.src === 'pick' ? 'waiting to be picked' : it.at;
  };

  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.pocket = {
    allKpiTiles(ui) {
      const sim = ui.sim, k = sim.kpi, s = sim.stats, cy = sim.stat(s.cycle, 'c'), cap = sim.storageCapacity(), st = sim.stored();
      const pk = sim.pocketList, n = (f) => pk.filter(f).length, now = (ps) => ps.reduce((a, p) => a + (p.busyNow || 0), 0) / (ps.length || 1);
      const items = Math.max(1, s.fromReturns + s.picked);
      return [
        ui.kpiTile('Orders shipped', Math.round(k.rate('shipped')), '/h', `${s.shipped} today · ${sim.orders.filter((o) => o.status !== 'SHIPPED').length} open`),
        ui.kpiTile('Items packed', Math.round(k.rate('lines')), '/h', `${Math.round(k.rate('presented'))}/h into pockets`),
        ui.kpiTile('Order to parcel', cy ? U.fmtDur(cy.avg) : '—', '', cy ? `last hour · 90% within ${U.fmtDur(cy.p90)}` : 'order in → parcel packed'),
        ui.kpiTile('Sold from returns', pct(s.fromReturns / items), '%', `${s.fromReturns} items never went back to the shelving · ${n((p) => p.state === 'STOCK')} returns waiting in pockets`),
        ui.kpiTile('Pockets in storage', pct(st / cap), '%', `${st} of ${cap} places · ${n((p) => p.state === 'EMPTY')} empty pockets`),
        ui.kpiTile('Sent round again', Math.round((s.recirc / Math.max(1, s.loaded)) * 100) / 100, 'per item', `${s.recirc} pockets moved out of the way · ${s.batches} batches`),
        ui.kpiTile('Loading busy', pct(now(sim.loaders)), '%', `last 15 min · ${sim.loaders.length} stations · ${sim.pickQueue.length} items to pick`),
        ui.kpiTile('Packing busy', pct(now(sim.packers)), '%', `last 15 min · ${sim.packers.length} stations`),
      ];
    },
    settings(ui, c, num, sel) {
      return {
        full: `<div class="sect"><h3>Live</h3><div class="card">
        <div class="row2">${num('orderRate', 'Orders an hour', 10, 0, 2000)}${num('returnRate', 'Returned items an hour', 10, 0, 2000)}</div>
        <div class="row2">${num('stockAge', 'Returns wait in a pocket at most (h)', 0.5, 0.5, 72)}${num('batchOrders', 'Orders per batch at most', 1, 1, 64)}</div>
        <div class="row2">${num('digTaken', 'Dig a stock rail out at (taken returns)', 1, 1, 30)}${num('digWait', 'or after (s)', 30, 0, 3600)}</div>
        <div class="note">Applied immediately.</div></div></div>
      <div class="sect"><h3>Scenario <span class="sub">restarts the simulation</span></h3><div class="card">
        <div class="row2">${num('pockets', 'Pockets', 50, 200, 2000)}${num('railSpeed', 'Rail speed (m/s)', 0.1, 0.3, 3)}</div>
        <div class="row2">${num('storageLanes', 'Storage rails', 1, 4, 40)}${num('stockLanes', 'of them for returns', 1, 1, 20)}</div>
        <div class="row2">${num('seqLines', 'Sequencer lines (batch of lines²)', 1, 2, 12)}${num('laneLength', 'Rail length (m)', 1, 6, 30)}</div>
        <div class="row2">${num('loadStations', 'Loading stations (picks)', 1, 1, 6)}${num('packingStations', 'Pack stations', 1, 1, 6)}</div>
        <div class="row2">${num('pickers', 'Pickers in the shelving', 1, 1, 40)}${num('inspectors', 'People at the returns desk', 1, 1, 10)}</div>
        <div class="row2">${num('loadTime', 'Loading: s per item', 0.5, 2, 30)}${num('packBase', 'Packing: s per order', 1, 2, 120)}</div>
        ${num('seed', 'Random seed', 1, 1)}
        <div class="btns"><button class="btn primary" id="cfg-restart">Apply &amp; restart</button><button class="btn ghost" id="cfg-reset">Defaults</button><button class="btn ghost" id="cfg-share" title="Copy a link that opens exactly this setup: the settings above, the seed and the view">Copy link</button></div></div></div>
      <div class="sect"><h3>About the model</h3><div class="card" style="font-size:12px;color:var(--muted)">${this.about(c)}</div></div>`,
      };
    },
    about(c) {
      return `Fashion e-commerce through an overhead pocket sorter of ${c.pockets} pockets on a rail at ${c.railSpeed} m/s. Orders come in at ${c.orderRate} an hour, most of them one or two items. ${c.pickers} pickers pick the items from shelving into totes that come to ${c.loadStations} loading stations; returned items (${c.returnRate} an hour) are checked at the returns desk, and the ${pct(c.returnsGood)}% that can be sold again come to the returns loading station. An operator scans each item and puts it into an empty pocket (${c.loadTime} s). The main loop takes it to one of ${c.storageLanes} storage rails (first in, first out): ${c.stockLanes} of them hold returns waiting for an order; on the others a pocket goes behind pockets of older orders, so it is in nobody's way when its turn comes. A new order takes a return of its article from the stock rails if one waits there, instead of having it picked; a stock rail is dug out in one sweep once it holds ${c.digTaken} returns that orders took, or one has waited ${c.digWait} s; returns that wait more than ${c.stockAge} h go back to the shelving. Once every item of an order is on the order rails, the order can go into a batch: up to ${c.seqLines * c.seqLines} pockets and ${c.batchOrders} orders, for the pack station with least to do. The batch's pockets leave storage (a pocket in front of one goes round again) for a sequencer of two banks of ${c.seqLines} lines: pass 1 sorts by the last digit of a pocket's place in the batch, the lines are emptied one after the other into pass 2, which sorts by the first, and emptied in turn again the pockets leave in exact order. Over the pack station they open one after the other (${c.unloadTime} s); the packer packs an order when all of it is on the table (${c.packBase} s + ${c.packPerItem} s an item). The empty pockets go back to the buffer along the west wall. Not modelled: the shelving and its stock, hanging garments too long for the rail, rejected items at the loading station.`;
    },
    live: ['orderRate', 'returnRate', 'stockAge', 'batchOrders', 'digTaken', 'digWait'],
    portsNote: 'Bar: busy (blue) against nothing to do (orange): a loading station waits for items or an empty pocket, a pack station for its pockets.',
    portCard(ui, p) {
      const busy = p.busyNow || 0, sim = ui.sim;
      const what = p.kind === 'LOAD' ? `${p.queue.reduce((n, t) => n + t.items.length, 0)} items in totes · ${p.done} loaded` : p.role === 'restock' ? `${p.done} back to the shelving` : `${p.spur.totes.length} pockets above · ${p.table.length} items on the table · ${p.done} parcels`;
      const st = p.away ? '<span class="pill BACKORDER">ON BREAK</span>' : p.t > 0 || p.packing ? `<span class="pill SHIPPED">${p.kind === 'LOAD' ? 'LOADING' : p.packing ? 'PACKING' : 'UNLOADING'}</span>` : '<span class="pill">WAITING</span>';
      void sim;
      return `<div class="pcard" data-open="port:${p.idx}"><div class="row"><span class="name">${p.code} · ${esc(p.name)}</span>${st}</div>
        <div class="row meta"><span>${what}</span><span>${esc(p.op)}</span></div>
        <div class="bar"><i style="width:${busy * 100}%;background:#3987e5"></i><i style="width:${(1 - busy) * 100}%;background:#d95926"></i></div></div>`;
    },
    // the control room's table: the batches in the sequencer and at the pack stations
    fleetTable(ui) {
      const sim = ui.sim, rows = sim.batches.map((b) => {
        const where = { A1: 'from storage into bank A', A2: 'bank A → bank B', B1: 'into bank B', B2: 'bank B → ' + b.port.name, PACK: 'at ' + b.port.name }[b.phase] || b.phase;
        const n = b.pockets.length, done = b.orders.filter((o) => o.status === 'SHIPPED').length;
        return `<tr><td><b>${b.id}</b></td><td>${where}</td><td class="r">${b.orders.length}</td><td class="r">${n}</td><td class="r">${done}/${b.orders.length}</td></tr>`;
      }).join('');
      return `<tr><th>Batch</th><th>Where</th><th class="r">Orders</th><th class="r">Pockets</th><th class="r">Packed</th></tr>` + (rows || '<tr><td colspan="5" class="faint">No batch in the sequencer</td></tr>');
    },
    legend() { return Object.entries(WS.POCKET_STATES).filter(([k]) => k !== 'RESTOCK').map(([k, v]) => `<span><i style="background:${PCOL[k]}"></i>${v}</span>`).join('') + '<span class="faint">· pocket states, as on the map and in the pockets\' hooks</span>'; },
    pocketColor(p) { return PCOL[p.state] || '#64748b'; },

    // ---------- side tabs
    tab_orders() {
      return `<div class="sect"><div class="stats" id="po-stats"></div></div>
        <div class="sect"><h3>New order</h3><div class="card"><div class="btns" style="margin:0"><button class="btn primary" id="po-one">Random order</button><button class="btn ghost" id="po-burst">Burst ×20</button></div>
        <div class="note">An order takes returns of its articles from the pockets where they wait; the rest is picked. Open an order to follow it.</div></div></div>
        <div id="po-list"></div>`;
    },
    bind_orders(ui, b) {
      b.querySelector('#po-one').onclick = () => { const o = ui.sim.newOrder(); ui.toast(`${o.id}: ${o.items.length} item${o.items.length > 1 ? 's' : ''}${o.items.some((it) => it.fromStock) ? ', some from returns' : ''}`); ui.select({ kind: 'web', id: o.id }); };
      b.querySelector('#po-burst').onclick = () => { for (let k = 0; k < 20; k++) ui.sim.newOrder(); ui.toast('20 orders dropped in'); };
    },
    live_orders(ui) {
      const el = document.getElementById('po-list'); if (!el) return;
      const sim = ui.sim, os = sim.orders, cnt = (st) => os.filter((o) => o.status === st).length, now = sim.time;
      document.getElementById('po-stats').innerHTML = [['Being picked', cnt('OPEN')], ['Ready', cnt('READY')], ['Sequencing', cnt('BATCHED')], ['Packing', cnt('PACKING')], ['Shipped', sim.stats.shipped], ['From returns', sim.stats.fromReturns]].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
      el.innerHTML = `<div class="sect"><h3>Orders</h3><table class="tbl"><tr><th>Order</th><th>Status</th><th class="r">Items</th><th class="r">Age</th></tr>${os.slice(-40).reverse().map((o) => `<tr class="click" data-open="web:${o.id}"><td class="mono">${o.id}</td><td><span class="pill ${o.status === 'SHIPPED' ? 'SHIPPED' : o.status === 'OPEN' ? 'NEW' : 'PICKING'}">${o.status}</span></td><td class="r">${o.items.length}${o.items.some((it) => it.fromStock) ? ' ↺' : ''}</td><td class="r">${U.fmtDur((o.shipped || now) - o.created)}</td></tr>`).join('')}</table><div class="note">↺: an item from returns.</div></div>`;
    },
    tab_pockets() { return '<div id="pk-p"></div>'; },
    live_pockets(ui) {
      const el = document.getElementById('pk-p'); if (!el) return;
      const sim = ui.sim, c = sim.cfg, st = {}, bar = (v, col) => `<div class="bar" style="margin:3px 0 0"><i style="width:${Math.min(1, v) * 100}%;background:${col}"></i></div>`;
      for (const p of sim.pocketList) st[p.state] = (st[p.state] || 0) + 1;
      const bt = (b) => (b ? `${b.id} · ${b.orders.length} orders, ${b.pockets.length} pockets · ${{ A1: 'pass 1, from storage', A2: 'emptying into bank B, line ' + (b.cur + 1), B1: 'filling', B2: 'to ' + b.port.name + ', line ' + (b.cur + 1) }[b.phase] || b.phase}` : 'free');
      el.innerHTML = `<div class="sect"><h3>Pockets <span class="sub">${sim.pocketList.length}</span></h3>${Object.entries(WS.POCKET_STATES).map(([k, v]) => `<div class="row meta" style="display:flex;justify-content:space-between"><span><i class="sdot" style="background:${PCOL[k]}"></i>${v}</span><b>${st[k] || 0}</b></div>`).join('')}</div>
        <div class="sect"><h3>Sequencer <span class="sub">two banks of ${c.seqLines} lines</span></h3><div class="card"><div class="row meta"><span><b>Bank A</b> ${esc(bt(sim.batchA && sim.batchA.phase !== 'A2' ? sim.batchA : sim.batchA))}</span></div><div class="row meta"><span><b>Bank B</b> ${esc(bt(sim.batchB && sim.batchB !== sim.batchA ? sim.batchB : null))}</span></div></div></div>
        <div class="sect"><h3>Storage rails <span class="sub">${sim.laneCap} pockets each</span></h3>${sim.lanes.map((L) => `<div class="pcard" data-open="lane:${L.idx}" style="padding:6px 10px"><div class="row meta"><span>${esc(L.name)}${L.i < c.stockLanes ? ' · returns' : ''}${L.dig ? ' · <b>being dug out</b>' : ''}</span><span>${L.totes.length}</span></div>${bar(L.totes.length / sim.laneCap, L.i < c.stockLanes ? PCOL.STOCK : PCOL.READY)}</div>`).join('')}</div>`;
    },
    tab_returns() { return '<div id="pk-r"></div>'; },
    live_returns(ui) {
      const el = document.getElementById('pk-r'); if (!el) return;
      const sim = ui.sim, s = sim.stats, stock = sim.pocketList.filter((p) => p.state === 'STOCK').sort((a, b) => a.since - b.since);
      el.innerHTML = `<div class="sect"><h3>Returns</h3><div class="stats">${[['Returned', s.returned], ['At the desk', sim.returnsQ.length + sim.inspect.filter(Boolean).length], ['Rework', s.rework], ['In pockets', stock.length], ['Sold again', s.fromReturns], ['Back to shelf', s.restocked]].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div>
        <div class="note">A return that can be sold again goes into a pocket and waits on the stock rails. An order for its article takes it instead of having it picked; after ${sim.cfg.stockAge} h it goes back to the shelving.</div></div>
        <div class="sect"><h3>Waiting longest</h3><table class="tbl"><tr><th>Pocket</th><th>Item</th><th class="r">Waiting</th></tr>${stock.slice(0, 15).map((p) => `<tr class="click" data-open="pocket:${p.id}"><td class="mono">${p.code}</td><td>${esc(p.item.sku.name)}</td><td class="r">${U.fmtDur(sim.time - p.since)}</td></tr>`).join('') || '<tr><td colspan="3" class="faint">None</td></tr>'}</table></div>`;
    },

    // ---------- inspectors
    inspect: {
      web(ui, id) {
        const sim = ui.sim, o = sim.byId.get(id);
        if (!o) return '<div class="hd"><b>Order</b><button class="close">×</button></div><div class="faint">Gone from the list.</div>';
        return `<div class="hd"><b>${o.id}</b><span class="pill">${o.status}</span><button class="close">×</button></div>
          <dl class="kv"><dt>Customer</dt><dd>${esc(o.customer)} · ${o.postcode} ${esc(o.city)}</dd><dt>Now</dt><dd>${OSTATE[o.status]}${o.batch && o.status !== 'SHIPPED' ? ` · batch ${o.batch.id} for ${o.batch.port.name}` : ''}</dd>
          <dt>In</dt><dd>${clock(sim, o.created)}${o.shipped ? ` · packed ${clock(sim, o.shipped)}, after ${U.fmtDur(o.shipped - o.created)}` : ''}</dd></dl>
          <h3>Items</h3><table class="tbl">${o.items.map((it) => `<tr><td><i class="sdot" style="background:${it.sku.hex}"></i>${esc(it.sku.name)}${it.fromStock ? ' <span class="faint">↺ return</span>' : ''}</td><td>${it.pocket ? pocketLink(it.pocket) : ''} ${esc(where(sim, it).replace(/^pocket \S+ · /, ''))}</td></tr>`).join('')}</table>
          <div class="btns"><button class="btn ghost" data-pocketflow="follow:${o.id}">Follow in 3D</button></div>`;
      },
      pocket(ui, id) {
        const sim = ui.sim, p = sim.pocketList[id], it = p.item;
        return `<div class="hd"><b>Pocket ${p.code}</b><span class="pill" style="background:${PCOL[p.state]}33;color:${PCOL[p.state]}">${WS.POCKET_STATES[p.state]}</span><button class="close">×</button></div>
          <dl class="kv"><dt>On</dt><dd>${p.belt ? esc(p.belt.name) : '—'}${p.moving ? ' · moving' : ''}</dd>
          <dt>Holds</dt><dd>${it ? `<i class="sdot" style="background:${it.sku.hex}"></i>${esc(it.sku.name)}${it.sku.style.hang ? ' (on a hanger)' : ''}` : 'nothing'}</dd>
          ${it ? `<dt>For</dt><dd>${it.order ? `<a href="#" data-open="web:${it.order.id}">${it.order.id}</a>` : `stock: a return${p.since != null ? `, waiting ${U.fmtDur(sim.time - p.since)}` : ''}`}</dd>` : ''}
          ${p.batch ? `<dt>Batch</dt><dd>${p.batch.id} · place ${p.seq + 1} of ${p.batch.pockets.length}</dd>` : ''}
          <dt>Sent round</dt><dd>${p.recirc || 0} times</dd></dl>
          ${it ? `<div class="bcwrap" style="margin-top:6px">${WS.Barcode.ean13SVG(it.sku.gtin, { height: 30, module: 1.2 })}</div>` : ''}`;
      },
      lane(ui, id) {
        const sim = ui.sim, b = sim.net.belts[id], st = {};
        for (const p of b.totes) st[p.state] = (st[p.state] || 0) + 1;
        return `<div class="hd"><b>${esc(b.name)}</b><button class="close">×</button></div>
          <dl class="kv"><dt>Pockets</dt><dd>${b.totes.length}${b.kind === 'lane' ? ' of ' + sim.laneCap : ''}</dd>${Object.entries(st).map(([k, v]) => `<dt>${WS.POCKET_STATES[k]}</dt><dd>${v}</dd>`).join('')}
          <dt>Front</dt><dd>${b.front ? pocketLink(b.front) + (b.front.item ? ' · ' + esc(b.front.item.sku.name) : '') : '—'}</dd></dl>
          <div class="note">${b.kind === 'lane' ? 'First in, first out: only the front pocket can leave. A pocket the sequencer needs from further back has to wait until those in front have gone round again.' : b.kind.startsWith('seq') ? 'A sequencer line: filled in pass ' + (b.kind === 'seqA' ? '1' : '2') + ', emptied whole when its turn comes.' : ''}</div>`;
      },
    },
    inspectCell(ui, i) {
      const sim = ui.sim, x = sim.map.cx(i) + sim.G.X0 + 0.5, y = sim.map.cy(i) + 0.5;
      const p = sim.pocketList.reduce((a, q) => (Math.hypot(q.x - x, q.y - y) < Math.hypot(a.x - x, a.y - y) ? q : a));
      if (Math.hypot(p.x - x, p.y - y) < 1.2) return this.inspect.pocket(ui, p.id);
      return '<div class="hd"><b>Floor</b><button class="close">×</button></div><div class="faint">Click a pocket, a rail or a station.</div>';
    },
    inspectPort(ui, p) {
      const sim = ui.sim, cur = p.cur && p.cur.item;
      const body = p.kind === 'LOAD'
        ? `<dt>Totes</dt><dd>${p.queue.length} · ${p.queue.reduce((n, t) => n + t.items.length, 0)} items</dd><dt>Empty pockets</dt><dd>${p.spur.totes.length} waiting</dd><dt>Loaded</dt><dd>${p.done}</dd>`
        : p.role === 'restock' ? `<dt>Back to the shelving</dt><dd>${p.done}</dd>` : `<dt>Pockets above</dt><dd>${p.spur.totes.length}</dd><dt>On the table</dt><dd>${[...new Set(p.table.map((it) => it.order))].map((o) => `<a href="#" data-open="web:${o.id}">${o.id}</a> ${p.table.filter((it) => it.order === o).length}/${o.items.length}`).join(' · ') || '—'}</dd><dt>Packed</dt><dd>${p.done} parcels</dd>`;
      return `<div class="hd"><b>${p.code} · ${esc(p.name)}</b><span class="pill">${esc(p.op)}</span><button class="close">×</button></div>
        <div class="hmi">${cur ? `<div class="muted">${p.kind === 'LOAD' ? 'Scan and put into pocket ' + p.cur.pocket.code : 'Pocket ' + p.cur.pocket.code + ' opens'}</div><div><i class="sdot" style="background:${cur.sku.hex}"></i><b>${esc(cur.sku.name)}</b></div><div class="muted">${cur.order ? 'for ' + cur.order.id : 'a return: stock'}</div><div class="bcwrap" style="margin-top:6px">${WS.Barcode.ean13SVG(cur.sku.gtin, { height: 30, module: 1.2 })}</div>` : p.packing ? `<div class="muted">Packing</div><div><b>${p.packing.order.id}</b> · ${p.packing.order.items.length} items</div>` : '<div class="muted">Waiting</div>'}</div>
        <dl class="kv" style="margin-top:10px">${body}<dt>Busy</dt><dd>${pct(p.busyNow || 0)}% the last 15 min</dd></dl>`;
    },
    taskText() { return ''; },
    cellWord: 'rail',
    depthTag() { return ''; },
    locate() { return '—'; },
    scan(ui, v) {
      const sim = ui.sim, q = String(v).trim().toUpperCase();
      const o = sim.byId.get(q) || sim.byId.get('WEB-' + q);
      if (o) { ui.select({ kind: 'web', id: o.id }); return true; }
      const p = sim.pocketList.find((x) => x.code === q);
      if (p) { ui.app.iso.selected = { kind: 'pocket', id: p.id }; ui.select(ui.app.iso.selected); return true; }
      const sku = sim.skuById.get(q.replace(/\D/g, ''));
      if (sku) { const hold = sim.pocketList.find((x) => x.item && x.item.sku === sku); if (hold) { ui.select({ kind: 'pocket', id: hold.id }); return true; } ui.toast(`${sku.name}: in no pocket now`); return true; }
      return false;
    },
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pocketflow]'), app = WS.app;
    if (!b || !app || !app.sim || app.sim.kind !== 'pocket') return;
    const [k, id] = b.dataset.pocketflow.split(':'), o = app.sim.byId.get(id);
    if (k === 'follow' && o) { const go = () => app.gl.followOrder(o); if (app.gl) go(); else app.setView('3d'); if (app.loading3d) app.loading3d.then(go); }
  });
})((globalThis.WS = globalThis.WS || {}));
