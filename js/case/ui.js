/* CaseCraft's part of the user interface. It has no stock or orders of the
 * shared kind, so it brings its own KPI tiles, settings panel and side tabs
 * (Stores, Pallets, Stock), the cell cards for the control room, and
 * inspectors for a store order, a pallet, a case, a product and a shelf;
 * case numbers, SSCCs and GTINs can be typed into the scan field. */
(function (WS) {
  'use strict';
  const U = WS.U, esc = U.esc, pct = (v) => Math.round(v * 100);
  const clock = (sim, t) => U.fmtClock(sim.clock(t)).slice(-8, -3);
  const OST = { PLANNED: 'planned, waiting for its palletiser', IN_PROGRESS: 'being palletised', SHIPPED: 'on its way to the store' };
  const PST = { QUEUED: 'waiting for its palletiser', RELEASED: 'next on its palletiser: its cases are being fetched', BUILDING: 'being built', DONE: 'built, leaving the cell', OUT: 'to the wrapper', WRAP: 'being wrapped', LABEL: 'being labelled', TO_DOOR: 'to its door', LOADED: 'in the truck' };
  const CST = { INBOUND: 'on a supplier pallet', ARM: 'in a robot arm', CONV: 'on a conveyor', LIFT: 'in a lift', SLOT: 'on a transfer shelf', BOT: 'on a bot', STORED: 'stored', RELEASED: 'released for a pallet', PALLET: 'on a store pallet' };
  const avg = (ms, k) => (ms.length ? ms.reduce((a, m) => a + (m[k] || 0), 0) / ms.length : 0);
  const skuLink = (p) => `<a href="#" data-open="sku:${p.id}">${esc(p.name)}</a>`;
  const palLink = (pal) => `<a href="#" data-open="pallet:${pal.id}">${pal.inbound ? 'pallet ' + pal.id : `${pal.order.code} · ${pal.k + 1}/${pal.of}`}</a>`;
  const dot = (p) => `<i class="sdot" style="background:${p.color}"></i>`;

  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.case = {
    allKpiTiles(ui) {
      const sim = ui.sim, k = sim.kpi, s = sim.stats, b = sim.stat(s.built, 'fill'), cy = sim.stat(s.cycle, 'c'), n = sim.stat(s.built, 'n'), h = sim.stat(s.built, 'h'), ai = sim.stat(s.built, 'aisles');
      const open = sim.orders.filter((o) => o.status !== 'SHIPPED').length, cells = sim.cells, arms = cells.map((p) => p.robot);
      const wait = cells.length ? cells.reduce((a, p) => a + (p.recentStarve || 0), 0) / cells.length : 0;
      return [
        ui.kpiTile('Cases in', Math.round(k.rate('presented')), '/h', `${s.depal} depalletised today · ${s.palletsIn} supplier pallets`),
        ui.kpiTile('Cases out', Math.round(k.rate('lines')), '/h', `${s.palletised} palletised today`),
        ui.kpiTile('Store pallets', Math.round(k.rate('shipped')), '/h', `${s.pallets} built · ${s.palletsShipped} in trucks`),
        ui.kpiTile('Pallet fill', b ? pct(b.avg) : '—', '%', b ? `last hour · ${n.avg.toFixed(0)} cases, ${h.avg.toFixed(2)} m high, ${ai.avg.toFixed(1)} store aisles a pallet` : 'share of 1.2 × 1.0 × ' + sim.cfg.palletHeight + ' m used'),
        ui.kpiTile('Store orders', s.shipped, 'shipped', `${open} open${cy ? ` · order → truck ${U.fmtDur(cy.avg)}` : ''}`),
        ui.kpiTile('Structure', pct(sim.fill()), '%', `of the shelf length · ${sim.stockCount()} cases · ${sim.lowStock()} products low`),
        ui.kpiTile('Bots busy', pct(avg(sim.botList, 'busyNow')), '%', `last 15 min · ${sim.botList.length} bots on ${sim.cfg.levels} levels`),
        ui.kpiTile('Lifts busy', pct(avg([...sim.inLifts, ...sim.outLifts], 'busyNow')), '%', `in ${pct(avg(sim.inLifts, 'busyNow'))}% · out ${pct(avg(sim.outLifts, 'busyNow'))}%`),
        ui.kpiTile('Palletisers', pct(avg(arms, 'busyNow')), '%', `busy · waiting for their next case ${pct(wait)}% of the last 5 min`),
      ];
    },
    settings(ui, c, num, sel) {
      return {
        full: `<div class="sect"><h3>Live</h3><div class="card">
        ${sel('buildPolicy', 'Build order of a store pallet', [['blend', 'Blend: heavy, normal and light cases in bands, each in store-aisle order'], ['stable', 'Stable: strongest and heaviest first, then by size'], ['aisle', 'Store aisle: in the order of the store\'s aisles, heavy first in each']])}
        ${sel('storagePolicy', 'Where a case is stored', [['bestfit', 'Best fit: the smallest gap it fits, fast movers near the deck'], ['nearest', 'Nearest: the gap nearest the deck']])}
        <div class="row2">${num('orderRate', 'Store orders an hour', 1, 0, 60)}${num('orderCases', 'Cases in an order (average)', 10, 20, 2000)}</div>
        <div class="row2">${num('seqWindow', 'Cases released ahead of the lift', 1, 1, 200)}${num('coverHours', 'Reorder below (h of demand)', 0.5, 0.5, 48)}</div>
        <div class="row2">${num('truckEvery', 'Inbound truck at most every (min)', 5, 5, 240)}${num('palletHeight', 'Store pallet load up to (m)', 0.05, 0.6, 2.2)}</div>
        <div class="note">Applied immediately: the build order and pallet height to orders that come in from now on.</div></div></div>
      <div class="sect"><h3>Scenario <span class="sub">restarts the day at 06:00</span></h3><div class="card">
        <div class="row2">${num('levels', 'Levels', 1, 2, 24)}${num('aisles', 'Aisles', 1, 2, 16)}</div>
        <div class="row2">${num('aisleLength', 'Aisle length (m)', 1, 8, 60)}${num('botsPerLevel', 'Bots on each level', 1, 1, 6)}</div>
        <div class="row2">${num('inLifts', 'Input lifts', 1, 1, 6)}${num('palletCells', 'Palletisers (each with its lift and door)', 1, 1, 6)}</div>
        <div class="row2">${num('depalCells', 'Depalletisers', 1, 1, 6)}${num('skus', 'Products', 10, 20, 600)}</div>
        <div class="row2">${num('vDeck', 'Bot on the deck (m/s)', 0.5, 1, 12)}${num('vAisle', 'Bot in an aisle (m/s)', 0.5, 1, 10)}</div>
        <div class="row2">${num('liftV', 'Lift (m/s)', 0.5, 1, 10)}${num('liftCap', 'Cases on a lift carriage', 1, 1, 3)}</div>
        <div class="row2">${num('palletTime', 'Palletiser: s per case', 0.1, 1, 10)}${num('depalTime', 'Depalletiser: s per case', 0.1, 1, 10)}</div>
        <div class="row2">${num('stockFill', 'Shelves filled at the start (share)', 0.05, 0.1, 0.9)}${num('seed', 'Random seed', 1, 1)}</div>
        <div class="btns"><button class="btn primary" id="cfg-restart">Apply &amp; restart</button><button class="btn ghost" id="cfg-reset">Defaults</button><button class="btn ghost" id="cfg-share" title="Copy a link that opens exactly this setup: the settings above, the seed and the view">Copy link</button></div></div></div>
      <div class="sect"><h3>About the model</h3><div class="card" style="font-size:12px;color:var(--muted)">${this.about(c, ui.sim)}</div></div>`,
      };
    },
    about(c, sim) {
      return `A distribution centre for supermarkets. Suppliers' trucks bring pallets of one product each (at most every ${c.truckEvery} min); a forklift puts them on a pallet conveyor past ${c.depalCells} depalletising cells, where a robot arm takes the cases off one by one (${c.depalTime} s each). A tunnel measures each case and gives it its place: the level with the fewest of its product and the least to do, and there the gap on a shelf it fits best, fast movers near the deck. The structure has ${c.levels} levels of ${c.aisles} aisles, ${c.aisleLength} m long, with shelves on both sides, ${sim.shelves.length} in all; a shelf is one long plank, and a case takes as much of it as it is wide. ${c.inLifts} input lifts take the cases up to the levels' transfer shelves, and on every level ${c.botsPerLevel} bots drive along the deck (two lanes, one each way) and into the aisles, ${c.vDeck} m/s and ${c.vAisle} m/s; a bot needs an aisle to itself and reserves the lane it will drive. Stores order about ${c.orderCases} cases at a time, ${c.orderRate} orders an hour. An order is planned into pallets at once: in the build order (${c.buildPolicy}) each case gets its place where it ends up lowest, standing on at least 75% of its base on cases strong enough to carry it, the load up to ${c.palletHeight} m and ${c.palletWeight} kg. All of an order's pallets are built on one of ${c.palletCells} palletisers, for the door it serves. A palletiser releases its cases in build order, up to ${c.seqWindow} ahead: the bots bring each to its output lift's transfer shelf on that case's level, and the lift takes them down in exactly that order (up to ${c.liftCap} at a time). The arm stacks each where the plan says (${c.palletTime} s). Pallets are stretch-wrapped (${c.wrapTime} s), labelled and conveyed into the store's truck; it leaves when the order is complete. Not modelled: layer picking, rejects at the tunnel, chilled and frozen goods, tier sheets, bots changing level. Speeds and sizes are typical of case-handling systems, not those of one product.`;
    },
    live: ['buildPolicy', 'storagePolicy', 'orderRate', 'orderCases', 'seqWindow', 'coverHours', 'truckEvery', 'palletHeight'],
    portsNote: 'Bar: the arm busy (blue) against waiting for a case (orange). A palletiser waits when its next case in sequence has not come down yet.',
    portCard(ui, p) {
      const A = p.robot, busy = A.busyNow || 0, wait = p.role === 'pal' ? p.recentStarve || 0 : 0;
      const st = A.down ? '<span class="pill BACKORDER">DOWN</span>' : A.state === 'HANDLING' ? '<span class="pill SHIPPED">WORKING</span>' : (p.role === 'pal' ? p.build : p.pal) ? '<span class="pill PICKING">WAITING</span>' : '<span class="pill">IDLE</span>';
      const what = p.role === 'depal' ? (p.pal ? `${esc(p.pal.p.name)} · ${p.pal.left} left` : 'no pallet') + (p.next ? ' · next waiting' : '') : p.build ? `${esc(p.build.order.store.town)} ${p.build.k + 1}/${p.build.of} · ${p.build.placed}/${p.build.items.length}` : `${p.queue.length} pallets queued`;
      return `<div class="pcard" data-open="port:${p.idx}"><div class="row"><span class="name">${p.code} · ${esc(p.name)}</span>${st}</div>
        <div class="row meta"><span>${what}</span><span>${p.cases} cases</span></div>
        <div class="bar"><i style="width:${busy * 100}%;background:#3987e5"></i><i style="width:${wait * 100}%;background:#d95926"></i></div></div>`;
    },
    // the control room's table: the palletisers' sequences
    fleetTable(ui) {
      const sim = ui.sim;
      return `<tr><th>Cell</th><th>Pallet</th><th class="r">Next case</th><th class="r">Released</th><th class="r">Coming down</th></tr>` + sim.cells.map((p) => {
        const b = p.build, coming = p.lift.load.length + p.feed.items.length;
        return `<tr class="click" data-open="port:${p.idx}"><td><b>${p.code}</b></td><td>${b ? `${esc(b.order.store.town)} ${b.k + 1}/${b.of}` : '—'}</td><td class="r">${p.liftSeq}</td><td class="r">${p.bySeq.size}</td><td class="r">${coming}</td></tr>`;
      }).join('');
    },
    legendExtra() { return '<span class="faint">· shelves on the map: <i style="background:#1d3a5c"></i> 40% → <i style="background:#e3a008"></i> full</span>'; },

    // ---------- side tabs
    tab_stores() {
      return `<div class="sect"><div class="stats" id="cc-stats"></div></div>
        <div class="sect"><h3>New store order</h3><div class="card"><div class="btns" style="margin:0"><button class="btn primary" id="cc-one">Random store order</button><button class="btn ghost" id="cc-five">Five at once</button></div>
        <div class="note">An order is planned into pallets as it comes in. Open one to see its pallets and follow a case.</div></div></div>
        <div id="cc-orders"></div>`;
    },
    bind_stores(ui, b) {
      b.querySelector('#cc-one').onclick = () => { const o = ui.sim.newOrder(); if (!o) return ui.toast('Nothing in stock to order', true); ui.toast(`${o.code} for ${o.store.town}: ${o.cases} cases on ${o.pallets.length} pallets`); ui.select({ kind: 'sorder', id: o.id }); };
      b.querySelector('#cc-five').onclick = () => { for (let k = 0; k < 5; k++) ui.sim.newOrder(); ui.toast('Five store orders in'); };
    },
    live_stores(ui) {
      const el = document.getElementById('cc-orders'); if (!el) return;
      const sim = ui.sim, s = sim.stats, os = sim.orders, cnt = (st) => os.filter((o) => o.status === st).length, now = sim.time;
      document.getElementById('cc-stats').innerHTML = [['Planned', cnt('PLANNED')], ['Palletising', cnt('IN_PROGRESS')], ['Shipped', s.shipped], ['Pallets', s.pallets], ['Cases out', s.palletised], ['Short', s.shorts]].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
      el.innerHTML = `<div class="sect"><h3>Store orders</h3><table class="tbl"><tr><th>Order</th><th>Store</th><th class="r">Cases</th><th class="r">Pallets</th><th class="r">Age</th></tr>${os.slice(-40).reverse().map((o) => `<tr class="click" data-open="sorder:${o.id}"><td class="mono">${o.code}</td><td>${o.store.no} ${esc(o.store.town)}</td><td class="r">${o.cases}</td><td class="r">${o.pallets.filter((p) => p.state === 'LOADED').length}/${o.pallets.length}</td><td class="r">${o.status === 'SHIPPED' ? '✓ ' + U.fmtDur(o.shipped - o.created) : U.fmtDur(now - o.created)}</td></tr>`).join('')}</table></div>
        <div class="sect"><h3>Doors</h3>${sim.doors.map((d) => { const t = d.truck, q = sim.cells[d.k].orders; return `<div class="pcard" data-open="port:${sim.cells[d.k].idx}"><div class="row"><span class="name">Door ${d.k + 1} · ${sim.cells[d.k].code}</span><span>${t ? t.state.toLowerCase() : 'no truck'}</span></div><div class="row meta"><span>${t ? `${t.order.store.no} ${esc(t.order.store.town)} · ${t.order.loaded}/${t.order.pallets.length} pallets loaded` : '—'}</span><span>${Math.max(0, q.length - (t ? 1 : 0))} after it</span></div></div>`; }).join('')}</div>`;
    },
    tab_pallets() { return '<div id="cc-pallets"></div>'; },
    live_pallets(ui) {
      const el = document.getElementById('cc-pallets'); if (!el) return;
      const sim = ui.sim, s = sim.stats, last = s.built.slice(-12).reverse(), pic = (p) => this.palletSVG(p);
      el.innerHTML = `<div class="sect"><h3>On the palletisers</h3>${sim.cells.map((p) => { const b = p.build; return `<div class="pcard" data-open="${b ? 'pallet:' + b.id : 'port:' + p.idx}"><div class="row"><span class="name">${p.code} · ${esc(p.name)}</span><span>${b ? `${b.placed}/${b.items.length}` : p.coming ? 'new pallet' : 'waiting'}</span></div>${b ? `<div class="row meta"><span>${b.order.code} · ${b.order.store.no} ${esc(b.order.store.town)} · pallet ${b.k + 1} of ${b.of}</span><span>${Math.round(b.vol / (1.2 * sim.cfg.palletHeight) * 100)}% full</span></div>${pic(b)}` : ''}</div>`; }).join('')}</div>
        <div class="sect"><h3>Just built</h3><table class="tbl"><tr><th>At</th><th class="r">Cases</th><th class="r">Height</th><th class="r">kg</th><th class="r">Fill</th><th class="r">Aisles</th></tr>${last.map((x) => `<tr><td>${clock(sim, x.t)}</td><td class="r">${x.n}</td><td class="r">${x.h.toFixed(2)} m</td><td class="r">${Math.round(x.kg)}</td><td class="r">${pct(x.fill)}%</td><td class="r">${x.aisles}</td></tr>`).join('') || '<tr><td colspan="6" class="faint">None yet</td></tr>'}</table>
        <div class="note">Fill: the cases' volume against 1.2 × 1.0 × ${sim.cfg.palletHeight} m. Aisles: how many of the store's aisles the pallet serves.</div></div>`;
    },
    // A store pallet seen from the south side, as planned: the cases placed so far
    // in their print (the nearer ones brighter), the rest of the plan in outline.
    palletSVG(pal, W = 220, H = 150) {
      const ph = WS.app.sim.cfg.palletHeight, sc = Math.min((W - 20) / 1.2, (H - 16) / (ph + 0.2)), x0 = (W - 1.2 * sc) / 2, y0 = H - 6, f = (v) => v.toFixed(1);
      const items = pal.items.map((it, k) => ({ it, k })).sort((a, b) => b.it.v - a.it.v);
      let out = `<rect x="${f(x0)}" y="${f(y0 - 0.144 * sc)}" width="${f(1.2 * sc)}" height="${f(0.144 * sc)}" fill="#c9a66b"/>`;
      out += `<rect x="${f(x0)}" y="${f(y0 - (0.144 + ph) * sc)}" width="${f(1.2 * sc)}" height="${f(ph * sc)}" fill="none" stroke="rgba(148,163,184,0.5)" stroke-dasharray="4 3"/>`;
      for (const { it, k } of items) {
        const x = x0 + (1.2 - it.u - it.l) * sc, y = y0 - (0.144 + it.z + it.h) * sc, w = it.l * sc, h = it.h * sc, done = k < pal.placed;
        out += done
          ? `<rect x="${f(x + 0.5)}" y="${f(y + 0.5)}" width="${f(w - 1)}" height="${f(h - 1)}" fill="${it.p.look === 'kraft' ? '#b98a58' : it.p.color}" fill-opacity="${(0.55 + 0.45 * (1 - it.v)).toFixed(2)}" stroke="rgba(15,23,42,0.6)"/>`
          : `<rect x="${f(x + 0.5)}" y="${f(y + 0.5)}" width="${f(w - 1)}" height="${f(h - 1)}" fill="none" stroke="rgba(103,232,249,0.5)"/>`;
      }
      return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block;margin:6px auto 2px">${out}</svg>`;
    },
    tab_stock() {
      return `<div class="sect"><div class="field"><label>Find a product</label><input type="text" id="cc-q" placeholder="name or GTIN"></div></div><div id="cc-stock"></div>`;
    },
    bind_stock(ui, b) { b.querySelector('#cc-q').addEventListener('input', () => this.live_stock(ui)); },
    live_stock(ui) {
      const el = document.getElementById('cc-stock'); if (!el) return;
      const sim = ui.sim, q = (document.getElementById('cc-q') || {}).value || '', ql = q.trim().toLowerCase();
      const ps = sim.skus.filter((p) => !ql || p.name.toLowerCase().includes(ql) || p.gtin.includes(ql)).sort((a, b) => sim.cover(a) - sim.cover(b));
      const bar = (v, col) => `<div class="bar" style="margin:3px 0 0"><i style="width:${Math.min(1, v) * 100}%;background:${col}"></i></div>`;
      el.innerHTML = `<div class="sect"><h3>Levels <span class="sub">shelf length used</span></h3>${sim.levels.map((lv) => `<div class="row meta" style="display:flex;justify-content:space-between;gap:8px"><span style="width:34px">L${lv.f + 1}</span><span style="flex:1">${bar(sim.levelFill(lv), '#3987e5')}</span><span style="width:70px;text-align:right">${lv.tasks.length} task${lv.tasks.length === 1 ? '' : 's'}</span></div>`).reverse().join('')}</div>
        <div class="sect"><h3>Products <span class="sub">least cover first</span></h3><table class="tbl"><tr><th>Product</th><th class="r">Free</th><th class="r">Coming</th><th class="r">/h</th></tr>${ps.slice(0, 80).map((p) => `<tr class="click" data-open="sku:${p.id}"><td>${dot(p)}${esc(p.name)}<br><span class="faint mono">${p.gtin}</span></td><td class="r">${p.cases.size - p.alloc}</td><td class="r">${p.coming || ''}</td><td class="r">${p.rate.toFixed(1)}</td></tr>`).join('')}</table>
        <div class="note">Free: stored and not yet given to a store order. ${sim.inQueue.length} supplier pallets ordered for the next trucks.</div></div>`;
    },

    // ---------- inspectors
    inspect: {
      sorder(ui, id) {
        const sim = ui.sim, o = sim.orders.find((x) => x.id === id);
        if (!o) return '<div class="hd"><b>Store order</b><button class="close">×</button></div><div class="faint">Gone from the list.</div>';
        const lines = o.lines.slice().sort((a, b) => a.p.aisle - b.p.aisle || b.qty - a.qty);
        return `<div class="hd"><b>${o.code}</b><span class="pill">${o.status.replace('_', ' ')}</span><button class="close">×</button></div>
          <dl class="kv"><dt>Store</dt><dd>${o.store.no} · ${esc(o.store.town)}</dd><dt>Now</dt><dd>${OST[o.status]} · ${esc(o.cell.name)}, door ${o.cell.k + 1}</dd>
          <dt>Cases</dt><dd>${o.cases} of ${o.lines.length} products</dd><dt>In</dt><dd>${clock(sim, o.created)}${o.shipped ? ` · shipped ${clock(sim, o.shipped)}, after ${U.fmtDur(o.shipped - o.created)}` : ''}</dd></dl>
          <h3>Pallets</h3><table class="tbl">${o.pallets.map((p) => `<tr class="click" data-open="pallet:${p.id}"><td>${p.k + 1}/${p.of}</td><td>${p.items.length} cases · ${p.top.toFixed(2)} m · ${Math.round(p.kg)} kg</td><td>${esc(PST[p.state] || p.state)}</td></tr>`).join('')}</table>
          <h3>By store aisle</h3><table class="tbl">${lines.slice(0, 40).map((l) => `<tr class="click" data-open="sku:${l.p.id}"><td class="faint">${esc(WS.CASE_AISLES[l.p.aisle])}</td><td>${dot(l.p)}${esc(l.p.name)}</td><td class="r">${l.qty}</td></tr>`).join('')}</table>`;
      },
      pallet(ui, id) {
        const sim = ui.sim, pal = sim.palletById.get(id);
        if (!pal) return '<div class="hd"><b>Pallet</b><button class="close">×</button></div><div class="faint">Gone: emptied, or on its way to the store.</div>';
        if (pal.inbound) return `<div class="hd"><b>Supplier pallet ${pal.id}</b><span class="pill">${esc(pal.where)}</span><button class="close">×</button></div>
          <dl class="kv"><dt>Product</dt><dd>${dot(pal.p)}${skuLink(pal.p)}</dd><dt>Cases</dt><dd>${pal.left} of ${pal.p.palletCases} · ${pal.p.perLayer} a layer × ${pal.p.layers}</dd><dt>SSCC</dt><dd class="mono">${pal.sscc}</dd></dl>`;
        const fill = pal.vol / (1.2 * sim.cfg.palletHeight), sup = pal.items.reduce((a, it) => a + it.sup, 0) / pal.items.length;
        return `<div class="hd"><b>${pal.order.code} · ${pal.k + 1}/${pal.of}</b><span class="pill">${pal.state.replace('_', ' ')}</span><button class="close">×</button></div>
          ${WS.TypeUI.case.palletSVG(pal, 260, 170)}
          <dl class="kv"><dt>Store</dt><dd>${pal.order.store.no} · ${esc(pal.order.store.town)}</dd><dt>Now</dt><dd>${esc(PST[pal.state] || pal.state)}</dd>
          <dt>Cases</dt><dd>${pal.placed} of ${pal.items.length} placed</dd><dt>Load</dt><dd>${pal.top.toFixed(2)} m high · ${Math.round(pal.kg)} kg · ${pct(fill)}% full</dd>
          <dt>Stands on</dt><dd>${pct(sup)}% of their bases, on average</dd><dt>Store aisles</dt><dd>${pal.aisles.map((a) => esc(WS.CASE_AISLES[a])).join(', ')}</dd><dt>SSCC</dt><dd class="mono">${pal.sscc}</dd></dl>
          <div class="bcwrap" style="margin-top:6px">${WS.Barcode.gs1SVG([['00', pal.sscc]], { height: 30, module: 1 })}</div>`;
      },
      case(ui, id) {
        const sim = ui.sim, c = sim.caseById.get(id);
        if (!c) return '<div class="hd"><b>Case</b><button class="close">×</button></div><div class="faint">Gone: on its way to a store.</div>';
        const p = c.p, G = sim.G;
        const where = c.state === 'STORED' || c.state === 'RELEASED' ? `level ${c.f + 1}, aisle ${c.k + 1}, ${c.shelf.s < 0 ? 'west' : 'east'} shelf, ${(G.yS - c.y).toFixed(1)} m in` : c.state === 'BOT' ? `on ${c.bot.name}` : c.state === 'LIFT' ? `in ${c.lift.name}` : c.state === 'PALLET' ? palLink(c.palOut) : c.pal ? palLink(c.pal) : '';
        return `<div class="hd"><b>Case ${c.id}</b><span class="pill">${c.state}</span><button class="close">×</button></div>
          <dl class="kv"><dt>Product</dt><dd>${dot(p)}${skuLink(p)}</dd><dt>Size</dt><dd>${p.L.toFixed(2)} × ${p.W.toFixed(2)} × ${p.H.toFixed(2)} m · ${p.kg} kg · ${['fragile', 'normal', 'strong'][p.crush]}</dd>
          <dt>Now</dt><dd>${CST[c.state] || c.state}${where ? ' · ' + where : ''}</dd>
          ${c.cell ? `<dt>For</dt><dd>${c.item.pal.order.code} · ${esc(c.item.pal.order.store.town)}, pallet ${c.item.pal.k + 1}, place ${c.seq - c.item.pal.items[0].seq + 1} of ${c.item.pal.items.length}</dd>` : ''}</dl>
          <div class="bcwrap" style="margin-top:6px">${WS.Barcode.ean13SVG(p.gtin, { height: 30, module: 1.2 })}</div>
          <div class="btns"><button class="btn ghost" data-casecraft="follow:${c.id}">Follow in 3D</button></div>`;
      },
      sku(ui, id) {
        const sim = ui.sim, p = sim.skus[id], lv = p.lv.map((n, f) => (n ? `L${f + 1}: ${n}` : '')).filter(Boolean).join(' · ');
        return `<div class="hd"><b>${dot(p)}${esc(p.name)}</b><span class="pill ${p.cls}">${p.cls}</span><button class="close">×</button></div>
          <dl class="kv"><dt>Store aisle</dt><dd>${esc(WS.CASE_AISLES[p.aisle])}</dd><dt>Case</dt><dd>${p.L.toFixed(2)} × ${p.W.toFixed(2)} × ${p.H.toFixed(2)} m · ${p.kg} kg · ${['fragile: carries up to 5 kg', 'normal: carries up to 14 kg', 'strong'][p.crush]}</dd>
          <dt>Stored</dt><dd>${p.stock} cases · ${p.cases.size - p.alloc} free · ${p.alloc} given to orders</dd><dt>Coming</dt><dd>${p.coming} cases on ${p.inb} pallets ordered today</dd>
          <dt>Sells</dt><dd>${p.rate.toFixed(1)} cases an hour · reorder below ${p.rop}</dd><dt>Supplier pallet</dt><dd>${p.palletCases} cases: ${p.perLayer} a layer × ${p.layers}</dd>
          <dt>Levels</dt><dd>${lv || '—'}</dd></dl>
          <div class="bcwrap" style="margin-top:6px">${WS.Barcode.ean13SVG(p.gtin, { height: 30, module: 1.2 })}</div>`;
      },
      shelf(ui, id) {
        const sim = ui.sim, sh = sim.shelves[id], ps = new Map();
        for (const e of sh.items) ps.set(e.c.p, (ps.get(e.c.p) || 0) + 1);
        return `<div class="hd"><b>Level ${sh.f + 1} · aisle ${sh.k + 1} · ${sh.s < 0 ? 'west' : 'east'}</b><button class="close">×</button></div>
          <dl class="kv"><dt>Cases</dt><dd>${sh.items.length} · ${pct(sh.used / sim.shelfLen)}% of its ${sim.shelfLen.toFixed(1)} m</dd><dt>Aisle</dt><dd>${sim.levels[sh.f].aisleBy[sh.k] ? 'a bot is in it: ' + sim.levels[sh.f].aisleBy[sh.k].name : 'free'}</dd></dl>
          <table class="tbl">${[...ps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([p, n]) => `<tr class="click" data-open="sku:${p.id}"><td>${dot(p)}${esc(p.name)}</td><td class="r">${n}</td></tr>`).join('')}</table>
          <div class="note">A shelf is one plank: each case takes as much of it as it is wide, plus 3 cm. Gaps left between cases are filled by the next case they fit.</div>`;
      },
    },
    inspectCell(ui, i) {
      const sim = ui.sim, s = sim.map.shelfOf[i];
      if (s >= 0) { const k = s >> 1, side = s & 1 ? 1 : -1; return `<div class="hd"><b>Aisle ${k + 1} · ${side < 0 ? 'west' : 'east'} shelves</b><button class="close">×</button></div><dl class="kv"><dt>Filled</dt><dd>${pct(sim.shelfFill(s))}% over all ${sim.cfg.levels} levels</dd></dl><div class="faint">Click a shelf in 3D for a level's own.</div>`; }
      return '<div class="hd"><b>Floor</b><button class="close">×</button></div><div class="faint">Click a bot, a lift, a cell or a shelf.</div>';
    },
    inspectPort(ui, p) {
      const sim = ui.sim, A = p.robot, cs = A.c;
      const body = p.role === 'depal'
        ? `<dt>Pallet</dt><dd>${p.pal ? `${palLink(p.pal)} · ${esc(p.pal.p.name)} · ${p.pal.left} left` : '—'}</dd><dt>Next</dt><dd>${p.next ? palLink(p.next) : '—'}</dd><dt>Empties</dt><dd>${p.empties} stacked</dd>`
        : `<dt>Pallet</dt><dd>${p.build ? `${palLink(p.build)} · ${p.build.placed}/${p.build.items.length}` : p.coming ? 'a new pallet coming in' : '—'}</dd><dt>Sequence</dt><dd>case ${p.liftSeq} next for ${p.lift.name} · ${p.bySeq.size} released · ${p.toRelease.length} to release</dd><dt>Queued</dt><dd>${p.queue.length} pallet${p.queue.length === 1 ? '' : 's'} · ${p.orders.length} order${p.orders.length === 1 ? '' : 's'} for door ${p.k + 1}</dd>`;
      return `<div class="hd"><b>${p.code} · ${esc(p.name)}</b><span class="pill">${A.down ? 'DOWN' : ui.stateLabel(A.displayState)}</span><button class="close">×</button></div>
        ${p.role === 'pal' && p.build ? this.palletSVG(p.build, 260, 170) : ''}
        <div class="hmi">${cs ? `<div class="muted">${p.role === 'depal' ? 'Taking off' : 'Placing'}</div><div>${dot(cs.p)}<b>${esc(cs.p.name)}</b></div>` : `<div class="muted">${p.role === 'pal' && p.build ? 'Waiting for case ' + p.liftSeq : 'Idle'}</div>`}</div>
        <dl class="kv" style="margin-top:10px">${body}<dt>Cases</dt><dd>${p.cases} today</dd><dt>Busy</dt><dd>${pct(A.busyNow || 0)}% the last 15 min</dd></dl>`;
    },
    // ---------- machines
    position(r) {
      if (r instanceof WS.CaseBot) return `level ${r.level + 1} · ${r.at.kind === 'aisle' ? 'aisle ' + (r.at.k + 1) : r.at.kind === 'lift' ? 'at ' + r.at.L.name : 'parked'} · ${r.x.toFixed(1)}, ${r.y.toFixed(1)}`;
      if (r instanceof WS.CaseLift) { const f = r.at; return f === -1 ? 'at the bottom' : f == null ? `${r.z.toFixed(1)} m up` : 'at level ' + (f + 1); }
      return `${r.x.toFixed(1)}, ${r.y.toFixed(1)}`;
    },
    speed(r) { return r instanceof WS.CaseLift ? r.vel.z || 0 : Math.hypot(r.vel.x || 0, r.vel.y || 0); },
    motion(r) { return r instanceof WS.CaseBot ? 'case bot on its level' : r instanceof WS.CaseLift ? 'case lift' : r instanceof WS.CaseArm ? 'six-axis robot arm' : 'forklift'; },
    mechanism(r) {
      if (r instanceof WS.CaseBot) return `<dt>Carrying</dt><dd>${r.c ? `<a href="#" data-open="case:${r.c.id}">case ${r.c.id}</a> · ${esc(r.c.p.name)}` : '—'}</dd><dt>Jobs</dt><dd>${r.jobs}</dd>`;
      if (r instanceof WS.CaseLift) return `<dt>On the carriage</dt><dd>${r.load.map((c) => `<a href="#" data-open="case:${c.id}">${c.id}</a>`).join(' ') || '—'}</dd><dt>Trips</dt><dd>${r.trips}</dd>`;
      if (r instanceof WS.CaseArm) return `<dt>Holding</dt><dd>${r.c ? `<a href="#" data-open="case:${r.c.id}">case ${r.c.id}</a>` : '—'}</dd><dt>Cases</dt><dd>${r.cases}</dd>`;
      return `<dt>Pallets moved</dt><dd>${r.moves}</dd>`;
    },
    power() { return 'mains or battery, not modelled'; },
    liftsLabel: 'cases moved',
    taskText(ui, r) {
      if (r instanceof WS.CaseBot) { const t = r.task; return t ? `${t.type === 'store' ? 'store' : 'fetch'} case ${t.c.id}${t.seq != null ? ' (seq ' + t.seq + ')' : ''}` : ''; }
      if (r instanceof WS.CaseLift) return r.load.length ? `${r.load.length} case${r.load.length > 1 ? 's' : ''}` : '';
      if (r instanceof WS.CaseArm) return r.c ? esc(r.c.p.name) : '';
      return r.pal ? 'a pallet' : '';
    },
    cellWord: 'shelf',
    depthTag() { return ''; },
    locate() { return '—'; },
    // case numbers, SSCCs and GTINs typed into the scan field
    scan(ui, v) {
      const sim = ui.sim, q = String(v).trim().toUpperCase(), d = q.replace(/\D/g, '');
      if (/^\d{1,7}$/.test(q) && sim.caseById.has(+q)) { ui.select({ kind: 'case', id: +q }); return true; }
      const o = sim.orders.find((x) => x.code === q || x.code === 'SO-' + q);
      if (o) { ui.select({ kind: 'sorder', id: o.id }); return true; }
      for (const pal of sim.palletById.values()) if (pal.sscc === d || pal.sscc === d.slice(-18)) { ui.select({ kind: 'pallet', id: pal.id }); return true; }
      const p = sim.skuByGtin.get(d);
      if (p) { ui.select({ kind: 'sku', id: p.id }); return true; }
      return false;
    },
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-casecraft]'), app = WS.app;
    if (!b || !app || !app.sim || app.sim.kind !== 'case') return;
    const [k, id] = b.dataset.casecraft.split(':'), c = app.sim.caseById.get(+id);
    if (k === 'follow' && c) { const go = () => app.gl.followOrder(c); if (app.gl) go(); else app.setView('3d'); if (app.loading3d) app.loading3d.then(go); }
  });
})((globalThis.WS = globalThis.WS || {}));
