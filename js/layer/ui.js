/* LayerLift's part of the user interface: its KPI tiles, settings, the
 * Orders and Lanes tabs, the build places and the top-off station as cards
 * in the control room, and inspectors for an order, a customer's pallet and
 * a lane; order numbers, SSCCs and GTINs can be typed into the scan field. */
(function (WS) {
  'use strict';
  const U = WS.U, esc = U.esc, pct = (v) => Math.round(v * 100);
  const clock = (sim, t) => U.fmtClock(sim.clock(t)).slice(-8, -3);
  const PST = { QUEUED: 'waiting for a build place', BASE: 'an empty pallet rolls in', BUILDING: 'its layers going on', LAYERS_DONE: 'all its layers on', TO_TOP: 'to the top-off station', TO_WRAP: 'to the wrapper', WRAP: 'being wrapped', LABEL: 'being labelled', TO_DOOR: 'to its route truck', LOADED: 'on a route truck' };
  const dot = (p) => `<i class="sdot" style="background:${p.color}"></i>`;
  const avg = (ms, k) => (ms.length ? ms.reduce((a, m) => a + (m[k] || 0), 0) / ms.length : 0);

  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.layer = {
    allKpiTiles(ui) {
      const sim = ui.sim, s = sim.stats, k = sim.kpi, cy = sim.stat(s.cycle, 'c'), lt = sim.stat(s.layerTimes, 'c'), open = sim.orders.filter((o) => o.status !== 'SHIPPED').length;
      const byLayer = s.cases - s.casesTop, gs = sim.gantryList;
      return [
        ui.kpiTile('Layers', Math.round(k.rate('presented')), '/h', `${s.layers} today · ${gs.length} gantr${gs.length > 1 ? 'ies' : 'y'}`),
        ui.kpiTile('Cases out', Math.round(k.rate('lines')), '/h', `${s.cases} picked today`),
        ui.kpiTile('Picked in layers', s.cases ? pct(byLayer / s.cases) : '—', '%', `of the cases · ${s.casesTop} put on by hand`),
        ui.kpiTile('Orders', s.shipped, 'shipped', `${open} open${cy ? ` · order → truck ${U.fmtDur(cy.avg)}` : ''}`),
        ui.kpiTile('Gantries busy', pct(avg(gs, 'busyNow')), '%', `last 15 min · ${gs.map((g) => pct(g.busyNow || 0) + '%').join(' · ')}${lt ? ` · ${Math.round(lt.avg)} s a layer` : ''}`),
        ui.kpiTile('Top-off busy', pct(sim.topOff.busyNow || 0), '%', `last 15 min · ${sim.collector.items.length} pallets waiting`),
        ui.kpiTile('Pick field', pct(sim.layersInField() / sim.storageCapacity()), '%', `${sim.layersInField()} layers · ${sim.lanes.filter((l) => l.out).length} lanes empty · ${s.palletsIn} pallets in`),
        ui.kpiTile('Route trucks', s.trucks, 'left', `${s.pallets} pallets built`),
      ];
    },
    settings(ui, c, num) {
      return {
        full: `<div class="sect"><h3>Live</h3><div class="card">
        <div class="row2">${num('orderRate', 'Orders an hour', 1, 0, 60)}${num('caseTime', 'Top-off: s a case', 0.5, 1, 30)}</div>
        <div class="row2">${num('palletLoad', 'Pallet load up to (m)', 0.05, 0.6, 2.4)}${num('cutoff', 'Truck leaves after its first pallet (min)', 5, 5, 240)}</div>
        <div class="note">Applied immediately: the pallet height to orders that come in from now on.</div></div></div>
      <div class="sect"><h3>Scenario <span class="sub">restarts the day at 06:00</span></h3><div class="card">
        <div class="row2">${num('gantries', 'Gantries on the runway (1 or 2)', 1, 1, 2)}${num('lanes', 'Lanes (products)', 1, 4, 40)}</div>
        <div class="row2">${num('laneDepth', 'Pallets a lane holds', 1, 2, 5)}${num('magCap', 'Empty pallets a magazine holds', 1, 4, 30)}</div>
        <div class="row2">${num('buildSpots', 'Build places', 1, 1, 16)}${num('forklifts', 'Forklifts', 1, 1, 2)}</div>
        <div class="row2">${num('gantryV', 'Gantry along the runway (m/s)', 0.1, 0.5, 5)}${num('gripTime', 'Gripping a layer (s)', 0.5, 1, 15)}</div>
        <div class="row2">${num('doors', 'Doors', 1, 1, 4)}${num('truckPallets', 'Pallets on a route truck', 1, 4, 33)}</div>
        ${num('seed', 'Random seed', 1, 1)}
        <div class="btns"><button class="btn primary" id="cfg-restart">Apply &amp; restart</button><button class="btn ghost" id="cfg-reset">Defaults</button><button class="btn ghost" id="cfg-share" title="Copy a link that opens exactly this setup: the settings above, the seed and the view">Copy link</button></div></div></div>
      <div class="sect"><h3>About the model</h3><div class="card" style="font-size:12px;color:var(--muted)">${this.about(c)}</div></div>`,
      };
    },
    about(c) {
      return `A beverage distribution centre: water, soft drinks, beer crates, cans, juice and wine, ${c.lanes} products, each in a pallet flow lane ${c.laneDepth} pallets deep. Over the lanes ${c.gantries > 1 ? `${c.gantries} gantry robots share one runway` : 'a gantry robot runs on its runway'}: it comes down round the top layer of a lane's front pallet, clamps and grips it (${c.gripTime} s), and sets it on a customer's pallet at one of ${c.buildSpots} build places, heaviest layers first. ${c.gantries > 1 ? 'A gantry moves only within a stretch of runway it has reserved, clear of the other one; an idle gantry in the way goes back to its end, so the second gantry adds far less than the first. ' : ''}It also lifts an emptied pallet off its lane into the magazine at its end of the runway, and the full pallets behind roll forward; a forklift brings new ones from the reserve rack to the back of the lane. A customer orders cases (${c.orderRate} orders an hour); whole layers are picked by the gantries, and what is short of a layer is put on top by hand at the top-off station (${c.caseTime} s a case). Pallets are wrapped, labelled and loaded on the next route truck with room (${c.truckPallets} pallets), which leaves when full or ${c.cutoff} min after its first pallet. Not modelled: layer patterns other than one product per layer, slip sheets, damaged layers, the pallet store the reserve rack stands for.`;
    },
    live: ['orderRate', 'caseTime', 'palletLoad', 'cutoff'],
    portsNote: 'Build places: busy (blue) while a gantry works on their pallet, waiting (orange) for their next layer. The top-off station: busy while a person puts cases on.',
    portCard(ui, p) {
      const busy = p.busyNow || 0, wait = p.waitNow || 0;
      const st = p.role === 'top' ? (p.away ? '<span class="pill BACKORDER">BREAK</span>' : p.pal ? '<span class="pill SHIPPED">TOPPING OFF</span>' : '<span class="pill">WAITING</span>') : `<span class="pill ${p.state === 'BUILD' ? 'PICKING' : p.state === 'FREE' ? '' : 'SHIPPED'}">${p.state.replace('_', ' ')}</span>`;
      const what = p.role === 'top' ? (p.pal ? `${p.pal.order.code} · ${p.pal.casesPlaced}/${p.pal.cases.length} cases` : 'no pallet') : p.pal ? `${p.pal.order.code} · ${p.pal.placed}/${p.pal.layers.length} layers` : 'free';
      return `<div class="pcard" data-open="port:${p.idx}"><div class="row"><span class="name">${p.code} · ${esc(p.name)}</span>${st}</div>
        <div class="row meta"><span>${what}</span><span>${p.done} pallets</span></div>
        <div class="bar"><i style="width:${busy * 100}%;background:#3987e5"></i><i style="width:${wait * 100}%;background:#d95926"></i></div></div>`;
    },

    // ---------- side tabs
    tab_orders() {
      return `<div class="sect"><div class="stats" id="ll-stats"></div></div>
        <div class="sect"><h3>New order</h3><div class="card"><div class="btns" style="margin:0"><button class="btn primary" id="ll-one">Random order</button><button class="btn ghost" id="ll-five">Five at once</button></div>
        <div class="note">Whole layers go on by gantry, the rest by hand at the top-off station. Open an order to follow it.</div></div></div>
        <div id="ll-orders"></div>`;
    },
    bind_orders(ui, b) {
      b.querySelector('#ll-one').onclick = () => { const o = ui.sim.newOrder(); ui.toast(`${o.code} for ${o.cust}: ${o.pallets.length} pallet${o.pallets.length > 1 ? 's' : ''}`); ui.select({ kind: 'border', id: o.id }); };
      b.querySelector('#ll-five').onclick = () => { for (let k = 0; k < 5; k++) ui.sim.newOrder(); ui.toast('Five orders in'); };
    },
    live_orders(ui) {
      const el = document.getElementById('ll-orders'); if (!el) return;
      const sim = ui.sim, s = sim.stats, os = sim.orders, cnt = (st) => os.filter((o) => o.status === st).length, now = sim.time;
      document.getElementById('ll-stats').innerHTML = [['Waiting', cnt('PLANNED')], ['Building', cnt('IN_PROGRESS')], ['Shipped', s.shipped], ['Layers', s.layers], ['By hand', s.casesTop], ['Trucks', s.trucks]].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
      el.innerHTML = `<div class="sect"><h3>Orders</h3><table class="tbl"><tr><th>Order</th><th>Customer</th><th class="r">Layers</th><th class="r">Cases</th><th class="r">Age</th></tr>${os.slice(-40).reverse().map((o) => `<tr class="click" data-open="border:${o.id}"><td class="mono">${o.code}</td><td>${esc(o.cust)}</td><td class="r">${o.lines.reduce((a, l) => a + l.layers, 0)}</td><td class="r">${o.lines.reduce((a, l) => a + l.cases, 0)}</td><td class="r">${o.status === 'SHIPPED' ? '✓ ' + U.fmtDur(o.shipped - o.created) : U.fmtDur(now - o.created)}</td></tr>`).join('')}</table></div>`;
    },
    tab_lanes() { return '<div id="ll-lanes"></div>'; },
    live_lanes(ui) {
      const el = document.getElementById('ll-lanes'); if (!el) return;
      const sim = ui.sim, bar = (v, col) => `<div class="bar" style="margin:3px 0 0"><i style="width:${Math.min(1, v) * 100}%;background:${col}"></i></div>`;
      el.innerHTML = `<div class="sect"><h3>Lanes <span class="sub">layers left · pallets</span></h3>${sim.lanes.map((ln) => { const n = ln.pallets.reduce((a, p) => a + p.layers, 0), cap = ln.sku.layers * sim.cfg.laneDepth; return `<div class="pcard" data-open="lane:${ln.k}" style="padding:6px 10px"><div class="row meta"><span>${dot(ln.sku)}${esc(ln.sku.name)}</span><span>${n} · ${ln.pallets.length}${ln.coming ? ' +' + ln.coming : ''}</span></div>${bar(n / cap, ln.out ? '#d95926' : '#3987e5')}</div>`; }).join('')}</div>
        <div class="sect"><h3>Magazines <span class="sub">empty pallets</span></h3>${sim.mags.map((m) => `<div class="row meta" style="display:flex;justify-content:space-between"><span>${m.k ? 'East' : 'West'} end</span><b>${m.count} / ${sim.cfg.magCap}</b></div>`).join('')}</div>`;
    },

    // ---------- inspectors
    inspect: {
      border(ui, id) {
        const sim = ui.sim, o = sim.orders.find((x) => x.id === id);
        if (!o) return '<div class="hd"><b>Order</b><button class="close">×</button></div><div class="faint">Gone from the list.</div>';
        return `<div class="hd"><b>${o.code}</b><span class="pill">${o.status.replace('_', ' ')}</span><button class="close">×</button></div>
          <dl class="kv"><dt>Customer</dt><dd>${esc(o.cust)}</dd><dt>In</dt><dd>${clock(sim, o.created)}${o.shipped ? ` · on a truck ${clock(sim, o.shipped)}, after ${U.fmtDur(o.shipped - o.created)}` : ''}</dd></dl>
          <h3>Lines</h3><table class="tbl"><tr><th>Product</th><th class="r">Layers</th><th class="r">Cases</th></tr>${o.lines.map((l) => `<tr class="click" data-open="lane:${l.p.id}"><td>${dot(l.p)}${esc(l.p.name)}</td><td class="r">${l.layers || ''}</td><td class="r">${l.cases || ''}</td></tr>`).join('')}</table>
          <h3>Pallets</h3><table class="tbl">${o.pallets.map((p) => `<tr class="click" data-open="lpallet:${p.id}"><td>${p.k + 1}/${p.of}</td><td>${p.layers.length} layers${p.cases.length ? ` + ${p.cases.length} cases` : ''}</td><td>${esc(PST[p.state] || p.state)}</td></tr>`).join('')}</table>
          <div class="btns"><button class="btn ghost" data-layerlift="follow:${o.id}">Follow in 3D</button></div>`;
      },
      lpallet(ui, id) {
        const sim = ui.sim, pal = sim.palletById.get(id);
        if (!pal) return '<div class="hd"><b>Pallet</b><button class="close">×</button></div><div class="faint">On its way to the customer.</div>';
        return `<div class="hd"><b>${pal.order.code} · ${pal.k + 1}/${pal.of}</b><span class="pill">${pal.state.replace('_', ' ')}</span><button class="close">×</button></div>
          <dl class="kv"><dt>For</dt><dd>${esc(pal.order.cust)}</dd><dt>Now</dt><dd>${esc(PST[pal.state] || pal.state)}${pal.spot && pal.where === 'spot' ? ' · ' + pal.spot.name : ''}</dd><dt>Weight</dt><dd>${Math.round(pal.kg)} kg</dd><dt>SSCC</dt><dd class="mono">${pal.sscc}</dd></dl>
          <h3>Layers, bottom up</h3><table class="tbl">${pal.layers.map((p, k) => `<tr><td>${k < pal.placed ? '✓' : ''}</td><td>${dot(p)}${esc(p.name)}</td><td class="r">${p.perLayer} cases</td></tr>`).join('') || '<tr><td class="faint">None</td></tr>'}</table>
          ${pal.cases.length ? `<h3>By hand on top</h3><div class="faint">${pal.casesPlaced} of ${pal.cases.length} cases: ${[...new Set(pal.cases.map((c) => c.p.name))].map(esc).join(', ')}</div>` : ''}`;
      },
      lane(ui, id) {
        const sim = ui.sim, ln = sim.lanes[id], p = ln.sku;
        return `<div class="hd"><b>${dot(p)}${esc(p.name)}</b><span class="pill">${ln.out ? 'EMPTY' : 'LANE ' + (ln.k + 1)}</span><button class="close">×</button></div>
          <dl class="kv"><dt>Case</dt><dd>${p.L.toFixed(2)} × ${p.W.toFixed(2)} × ${p.H.toFixed(2)} m · ${p.kg} kg</dd><dt>Layer</dt><dd>${p.perLayer} cases (${p.nx} × ${p.ny}) · ${Math.round(p.layerKg)} kg</dd><dt>Pallet</dt><dd>${p.layers} layers</dd>
          <dt>In the lane</dt><dd>${ln.pallets.map((q) => q.layers).join(' · ') || '—'} layers, front first${ln.coming ? ` · ${ln.coming} on its way` : ''}</dd><dt>Layers picked</dt><dd>${ln.picks}</dd></dl>
          <div class="bcwrap" style="margin-top:6px">${WS.Barcode.ean13SVG(p.gtin, { height: 30, module: 1.2 })}</div>`;
      },
    },
    inspectCell(ui, i) {
      const sim = ui.sim, l = sim.map.laneOf[i];
      if (l >= 0) return this.inspect.lane(ui, l);
      return '<div class="hd"><b>Floor</b><button class="close">×</button></div><div class="faint">Click a lane, a gantry or a build place.</div>';
    },
    inspectPort(ui, p) {
      const pal = p.pal;
      return `<div class="hd"><b>${p.code} · ${esc(p.name)}</b><span class="pill">${p.role === 'top' ? (p.away ? 'BREAK' : pal ? 'TOPPING OFF' : 'WAITING') : p.state.replace('_', ' ')}</span><button class="close">×</button></div>
        <dl class="kv"><dt>Pallet</dt><dd>${pal ? `<a href="#" data-open="lpallet:${pal.id}">${pal.order.code} · ${pal.k + 1}/${pal.of}</a> · ${p.role === 'top' ? `${pal.casesPlaced}/${pal.cases.length} cases` : `${pal.placed}/${pal.layers.length} layers`}` : '—'}</dd>
        ${p.role === 'spot' && pal && pal.layers[pal.placed] ? `<dt>Next layer</dt><dd>${dot(pal.layers[pal.placed])}${esc(pal.layers[pal.placed].name)}</dd>` : ''}
        <dt>Pallets</dt><dd>${p.done} today</dd><dt>Busy</dt><dd>${pct(p.busyNow || 0)}% the last 15 min</dd></dl>`;
    },
    position(r) { return r instanceof WS.LayerGantry ? `${r.x.toFixed(1)} m along the runway, head ${r.z.toFixed(2)} m up` : `${r.x.toFixed(1)}, ${r.y.toFixed(1)}`; },
    speed(r) { return Math.hypot(r.vel.x || 0, r.vel.y || 0, r.vel.z || 0); },
    motion(r) { return r instanceof WS.LayerGantry ? 'gantry robot with a layer head' : 'forklift'; },
    mechanism(r) {
      if (r instanceof WS.LayerGantry) return `<dt>Holding</dt><dd>${r.held ? (r.held.kind === 'layer' ? 'a layer of ' + esc(r.held.sku.name) : 'an empty pallet') : '—'}</dd><dt>Layers</dt><dd>${r.layers} today</dd><dt>Runway</dt><dd>${r.claim ? `${r.claim.lo.toFixed(1)}–${r.claim.hi.toFixed(1)} m reserved` : 'nothing reserved'}</dd>`;
      return `<dt>Carrying</dt><dd>${r.pal ? 'a pallet of ' + esc(r.pal.sku.name) : r.stack ? r.stack + ' empty pallets' : '—'}</dd><dt>Trips</dt><dd>${r.moves}</dd>`;
    },
    power() { return 'mains (gantries) or battery, not modelled'; },
    liftsLabel: 'jobs',
    taskText(ui, r) {
      if (r instanceof WS.LayerGantry) { const j = r.task; return j ? (j.kind === 'layer' ? `${esc(j.lane.sku.name)} → ${j.spot.code}` : 'empty pallet → magazine') : ''; }
      return r.pal ? esc(r.pal.sku.name) : r.stack ? 'empty pallets' : '';
    },
    cellWord: 'lane',
    depthTag() { return ''; },
    locate() { return '—'; },
    scan(ui, v) {
      const sim = ui.sim, q = String(v).trim().toUpperCase(), d = q.replace(/\D/g, '');
      const o = sim.orders.find((x) => x.code === q || x.code === 'BO-' + q);
      if (o) { ui.select({ kind: 'border', id: o.id }); return true; }
      for (const pal of sim.palletById.values()) if (pal.sscc === d) { ui.select({ kind: 'lpallet', id: pal.id }); return true; }
      const p = sim.skus.find((x) => x.gtin === d);
      if (p) { ui.select({ kind: 'lane', id: p.id }); return true; }
      return false;
    },
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-layerlift]'), app = WS.app;
    if (!b || !app || !app.sim || app.sim.kind !== 'layer') return;
    const [k, id] = b.dataset.layerlift.split(':'), o = app.sim.orders.find((x) => x.id === +id);
    if (k === 'follow' && o) { const go = () => app.gl.followOrder(o); if (app.gl) go(); else app.setView('3d'); if (app.loading3d) app.loading3d.then(go); }
  });
})((globalThis.WS = globalThis.WS || {}));
