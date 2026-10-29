/* AirPost's part of the user interface: its KPI tiles, settings, the
 * Carriers, Stations and Pharmacy tabs, the stations as cards in the control
 * room, and inspectors for a carrier, a medicine order and a product of the
 * dispensing robot; carrier codes, order numbers and GTINs can be typed
 * into the scan field. */
(function (WS) {
  'use strict';
  const U = WS.U, esc = U.esc, pct = (v) => Math.round(v * 100);
  const clock = (sim, t) => U.fmtClock(sim.clock(t)).slice(-8, -3);
  const CST = { EMPTY: 'empty, in the rack', LOADING: 'being loaded', QUEUED: 'in the send dock, waiting for its line', IN_TUBE: 'in the tube', TRANSFER: 'in the transfer unit', ARRIVED: 'landed in the basket', UNLOADING: 'being emptied' };
  const OST = { QUEUED: 'waiting for the robot', PICKING: 'the robot picking', CHECK: 'the pharmacist checking it', SENT: 'on its way by tube', DELIVERED: 'on the ward', PORTER: 'with a porter' };
  const KCOL = { sample: '#ef4444', med: '#22c55e', blood: '#b91c1c', empty: '#94a3b8' };
  const kindOf = (cr) => (cr.contents ? cr.contents.kind : 'empty');
  const dot = (c) => `<i class="sdot" style="background:${c}"></i>`;
  const avg = (ms, k) => (ms.length ? ms.reduce((a, m) => a + (m[k] || 0), 0) / ms.length : 0);
  const dur = (x) => (x ? U.fmtDur(x.avg) : '—');
  const where = (sim, cr) => (cr.at && cr.at.code ? cr.at.name : cr.at === sim.tu ? 'the transfer unit' : cr.at && cr.at.name ? cr.at.name : '—');
  const crLink = (cr) => `<a href="#" data-open="carrier:${cr.id}">${cr.code}</a>`;

  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.tube = {
    allKpiTiles(ui) {
      const sim = ui.sim, s = sim.stats, k = sim.kpi, tr = sim.stat(s.transit, 'c'), st = sim.stat(s.transit, 'c', 3600, (e) => e.stat), qw = sim.stat(s.qwait, 'c');
      const sm = sim.stat(s.sampleT, 'c'), md = sim.stat(s.medT, 'c'), zs = sim.zones.slice().sort((a, b) => (b.busyNow || 0) - (a.busyNow || 0)), short = sim.ports.filter((p) => p.noCarrier()).length;
      return [
        ui.kpiTile('Carriers', Math.round(k.rate('presented')), '/h', `${s.landed} landed today · ${sim.inTubes()} on their way`),
        ui.kpiTile('Door to door', tr ? Math.round(tr.avg) : '—', 's', `send dock to basket · urgent ${st ? Math.round(st.avg) + ' s' : '—'} · 90% within ${tr ? Math.round(tr.p90) + ' s' : '—'}`),
        ui.kpiTile('Waiting for the line', qw ? Math.round(qw.avg) : '—', 's', `in the send dock · 90% within ${qw ? Math.round(qw.p90) + ' s' : '—'}`),
        ui.kpiTile('Busiest line', pct(zs[0].busyNow || 0), '%', `${esc(zs[0].name)} · next ${esc(zs[1] ? zs[1].short : '')} ${zs[1] ? pct(zs[1].busyNow || 0) + '%' : ''}`),
        ui.kpiTile('Samples to the lab', Math.round(sim.stat(s.sampleT, 'c') ? sim.stat(s.sampleT, 'c').n : 0), '/h', `taken → at the lab ${dur(sm)} · ${s.samples} today`),
        ui.kpiTile('Medicines', md ? Math.round(md.avg / 60) : '—', 'min', `order → on the ward · ${s.delivered} orders today`),
        ui.kpiTile('Empty carriers', short, short === 1 ? 'station short' : 'stations short', `${s.waitedEmpty} sends waited for one · ${s.porter} by porter`),
        ui.kpiTile('Dispensing robot', Math.round(k.rate('lines')), 'packs/h', `busy ${pct(sim.robot.busyNow || 0)}% · ${sim.rxQueue.length} orders waiting`),
      ];
    },
    settings(ui, c, num, sel) {
      return {
        full: `<div class="sect"><h3>Live</h3><div class="card">
        <div class="row2">${num('demand', 'Traffic (× the usual)', 0.1, 0.1, 4)}${num('wardSamples', 'Samples a ward sends an hour', 0.5, 0, 20)}</div>
        <div class="row2">${num('wardMeds', 'Medicine orders a ward an hour', 0.5, 0, 10)}${num('porterAfter', 'Porter after (min without a carrier)', 1, 1, 120)}</div>
        <div class="row2">${sel('priority', 'Urgent carriers', [['stat', 'first on every line'], ['fifo', 'in turn like the rest']])}${num('respondWard', 'Ward notices a carrier (s, average)', 10, 10, 900)}</div>
        <div class="note">Applied immediately.</div></div></div>
      <div class="sect"><h3>Scenario <span class="sub">restarts the day at 06:00</span></h3><div class="card">
        <div class="row2">${num('wings', 'Wings (2–4)', 1, 2, 4)}${num('floors', 'Floors above the ground floor', 1, 2, 9)}</div>
        <div class="row2">${num('zonesPerWing', 'Lines up each wing (1 or 2)', 1, 1, 2)}${sel('labLine', 'The lab', [['own', 'on a line of its own'], ['core', 'on the core line']])}</div>
        <div class="row2">${num('carriers', 'Carriers', 1, 20, 400)}${sel('carrierPolicy', 'Empty carriers', [['store', 'carrier store, topped up automatically'], ['sender', 'staff send them home now and then']])}</div>
        <div class="row2">${num('tubeV', 'Carrier speed (m/s)', 0.5, 1, 10)}${num('tuSlots', 'Transfer unit holds', 1, 1, 12)}</div>
        <div class="row2">${num('par', 'Empties a station keeps', 1, 0, 10)}${num('returnEvery', 'Sending home every (min)', 5, 5, 240)}</div>
        ${num('seed', 'Random seed', 1, 1)}
        <div class="btns"><button class="btn primary" id="cfg-restart">Apply &amp; restart</button><button class="btn ghost" id="cfg-reset">Defaults</button><button class="btn ghost" id="cfg-share" title="Copy a link that opens exactly this setup: the settings above, the seed and the view">Copy link</button></div></div></div>
      <div class="sect"><h3>About the model</h3><div class="card" style="font-size:12px;color:var(--muted)">${this.about(c)}</div></div>`,
      };
    },
    about(c) {
      return `A hospital of ${c.wings} wings and ${c.floors + 1} floors with a pneumatic tube system. Every ward, the emergency department, theatres, ICU, outpatients and radiology have a station: a send dock, a basket carriers land in and a rack of empty carriers. A line is one tube with one blower and carries one carrier at a time: the diverters are set (${c.switchTime} s), the carrier flies (${c.tubeV} m/s, samples and blood ${c.gentleV} m/s), slows on its air cushion and drops into the basket (${c.landTime} s). Each wing has ${c.zonesPerWing > 1 ? 'a lower and an upper line' : 'a line up its riser'}; the pharmacy${c.carrierPolicy === 'store' ? ' and the carrier store' : ''} have the core line${c.labLine !== 'core' ? ', the lab a line of its own' : ', and the lab is on it too'}. Lines meet at the transfer unit, which shifts a carrier to its next line (${c.tuTime} s, ${c.tuSlots} at a time). ${c.priority === 'stat' ? 'Urgent carriers go first on every line.' : 'Urgent carriers wait their turn.'} Wards send samples to the lab (${c.wardSamples} an hour each, twice that on the morning round) and order medicines (${c.wardMeds} an hour); the pharmacy's dispensing robot picks the packs from its shelves and the pharmacist checks them (${c.checkTime} s) and sends them up. Nothing goes without an empty carrier: ${c.carrierPolicy === 'store' ? `stations below ${c.par} empties get one from the carrier store, and a surplus goes back to it` : `every ${c.returnEvery} min staff send the carriers that are not theirs back home`}. What has waited ${c.porterAfter} min for a carrier goes by porter. Not modelled: pressure and blower power, carriers that jam or open, the lab's analysers, the pneumatic tube's own maintenance. Speeds and times are typical of hospital systems, not those of one maker.`;
    },
    live: ['demand', 'wardSamples', 'wardMeds', 'porterAfter', 'priority', 'respondWard'],
    portsNote: 'Stations: busy (blue) while someone loads or empties a carrier, red while something waits for an empty carrier.',
    portCard(ui, p) {
      const busy = p.busyNow || 0, wait = p.waitNow || 0, short = p.noCarrier();
      const st = p.away ? '<span class="pill BACKORDER">BREAK</span>' : short ? '<span class="pill BACKORDER">NO CARRIER</span>' : p.basket.length ? '<span class="pill SHIPPED">LANDED</span>' : p.outQ.length ? '<span class="pill PICKING">SENDING</span>' : '<span class="pill">READY</span>';
      return `<div class="pcard" data-open="port:${p.idx}"><div class="row"><span class="name">${p.code} · ${esc(p.name)}</span>${st}</div>
        <div class="row meta"><span>${p.empties.length} empty · ${p.basket.length} in the basket · ${p.outQ.length} to go</span><span>${p.sent} sent</span></div>
        <div class="bar"><i style="width:${busy * 100}%;background:#3987e5"></i><i style="width:${wait * 100}%;background:#d95926"></i></div></div>`;
    },

    // ---------- side tabs
    tab_carriers() {
      return `<div class="sect"><div class="stats" id="ap-stats"></div></div>
        <div class="sect"><h3>Send now</h3><div class="card"><div class="btns" style="margin:0"><button class="btn primary" id="ap-sample">Urgent sample from the ED</button><button class="btn ghost" id="ap-rush">Morning rush: 20 samples</button></div>
        <div class="note">Open a carrier to follow it through the tubes.</div></div></div>
        <div id="ap-moving"></div>`;
    },
    bind_carriers(ui, b) {
      b.querySelector('#ap-sample').onclick = () => { const sim = ui.sim, ed = sim.ports.find((p) => p.type === 'ED') || sim.ports.find((p) => p.staffed && p.type !== 'LAB'); sim.want(ed, { kind: 'sample', dest: sim.lab, stat: true, t0: sim.time, from: ed }); ui.toast(`An urgent sample at ${ed.name}, for the lab`); ui.select({ kind: 'port', id: ed.idx }); };
      b.querySelector('#ap-rush').onclick = () => { const sim = ui.sim, ws = sim.ports.filter((p) => p.type === 'WARD'); for (let k = 0; k < 20; k++) { const p = ws[k % ws.length]; sim.want(p, { kind: 'sample', dest: sim.lab, stat: false, t0: sim.time, from: p }); } ui.toast('20 samples on the wards, for the lab'); };
    },
    live_carriers(ui) {
      const el = document.getElementById('ap-moving'); if (!el) return;
      const sim = ui.sim, s = sim.stats, cs = sim.carriers, cnt = (f) => cs.filter(f).length;
      document.getElementById('ap-stats').innerHTML = [['In tubes', cnt((c) => c.state === 'IN_TUBE')], ['To go', cnt((c) => c.state === 'QUEUED')], ['Transfer', cnt((c) => c.state === 'TRANSFER')], ['Landed', cnt((c) => c.state === 'ARRIVED')], ['Empty', cnt((c) => c.state === 'EMPTY')], ['Porter', s.porter]].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
      const moving = cs.filter((c) => c.state === 'IN_TUBE' || c.state === 'QUEUED' || c.state === 'TRANSFER').sort((a, b) => a.tq0 - b.tq0);
      el.innerHTML = `<div class="sect"><h3>On their way</h3><table class="tbl"><tr><th>Carrier</th><th>With</th><th>From</th><th>To</th><th class="r">For</th></tr>${moving.slice(0, 40).map((c) => `<tr class="click" data-open="carrier:${c.id}"><td class="mono">${c.code}</td><td>${dot(KCOL[kindOf(c)])}${WS.TUBE_KIND[kindOf(c)]}${c.contents && c.contents.stat ? ' <b style="color:#f87171">STAT</b>' : ''}</td><td>${esc(c.from ? c.from.code : '')}</td><td>${esc(c.dest ? c.dest.code : '')}</td><td class="r">${U.fmtDur(sim.time - c.tq0)}</td></tr>`).join('') || '<tr><td class="faint" colspan="5">None just now</td></tr>'}</table></div>`;
    },
    tab_stations() { return '<div id="ap-stations"></div>'; },
    live_stations(ui) {
      const el = document.getElementById('ap-stations'); if (!el) return;
      const sim = ui.sim;
      el.innerHTML = `<div class="sect"><h3>Lines <span class="sub">busy the last 15 min</span></h3>${sim.zones.map((z) => `<div class="pcard" data-open="robot:${z.id}" style="padding:6px 10px"><div class="row meta"><span>${dot(WS.TUBE_ZCOL[z.k % WS.TUBE_ZCOL.length])}${esc(z.name)}</span><span>${pct(z.busyNow || 0)}% · ${z.legs} trips</span></div><div class="bar" style="margin:3px 0 0"><i style="width:${(z.busyNow || 0) * 100}%;background:${WS.TUBE_ZCOL[z.k % WS.TUBE_ZCOL.length]}"></i></div></div>`).join('')}</div>
        <div class="sect"><h3>Stations <span class="sub">empty · basket · to go</span></h3><table class="tbl"><tr><th>Station</th><th class="r">Empty</th><th class="r">Basket</th><th class="r">To go</th><th class="r">Sent</th></tr>${sim.ports.map((p) => `<tr class="click" data-open="port:${p.idx}"><td>${esc(p.code)} · ${esc(p.name)}</td><td class="r"${p.noCarrier() ? ' style="color:#f87171"' : ''}>${p.empties.length}</td><td class="r">${p.basket.length}</td><td class="r">${p.outQ.length + p.wants.length}</td><td class="r">${p.sent}</td></tr>`).join('')}</table></div>`;
    },
    tab_pharmacy() {
      return `<div class="sect"><div class="stats" id="ap-rxstats"></div></div>
        <div class="sect"><h3>New order</h3><div class="card"><div class="btns" style="margin:0"><button class="btn primary" id="ap-rxone">Urgent order for ICU</button><button class="btn ghost" id="ap-rx5">Five ward orders</button></div></div></div>
        <div id="ap-rxlist"></div>`;
    },
    bind_pharmacy(ui, b) {
      b.querySelector('#ap-rxone').onclick = () => { const sim = ui.sim, w = sim.ports.find((p) => p.type === 'ICU') || sim.ports.find((p) => p.type === 'WARD'), o = sim.newOrder(w, true); ui.toast(`${o.code} for ${w.name}: ${o.lines.length} line${o.lines.length > 1 ? 's' : ''}, urgent`); ui.select({ kind: 'morder', id: o.id }); };
      b.querySelector('#ap-rx5').onclick = () => { const sim = ui.sim, ws = sim.ports.filter((p) => p.type === 'WARD'); for (let k = 0; k < 5; k++) sim.newOrder(ws[Math.floor(sim.rng() * ws.length)]); ui.toast('Five medicine orders in'); };
    },
    live_pharmacy(ui) {
      const el = document.getElementById('ap-rxlist'); if (!el) return;
      const sim = ui.sim, s = sim.stats, os = sim.orders, now = sim.time;
      document.getElementById('ap-rxstats').innerHTML = [['Waiting', sim.rxQueue.length], ['Checking', os.filter((o) => o.status === 'CHECK').length], ['By tube', os.filter((o) => o.status === 'SENT').length], ['Delivered', s.delivered], ['Packs', s.packs], ['Put away', s.stocked]].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
      const low = sim.drugs.filter((d) => d.stock < d.min).length;
      el.innerHTML = `<div class="sect"><h3>Orders</h3><table class="tbl"><tr><th>Order</th><th>For</th><th class="r">Lines</th><th>Now</th><th class="r">Age</th></tr>${os.slice(-40).reverse().map((o) => `<tr class="click" data-open="morder:${o.id}"><td class="mono">${o.code}${o.stat ? ' <b style="color:#f87171">!</b>' : ''}</td><td>${esc(o.ward.code)}</td><td class="r">${o.lines.length}</td><td>${esc(OST[o.status] || o.status)}</td><td class="r">${o.done ? '✓ ' + U.fmtDur(o.done - o.created) : U.fmtDur(now - o.created)}</td></tr>`).join('')}</table></div>
        <div class="sect"><h3>The robot's stock <span class="sub">${sim.drugs.length} products · ${low} below their minimum · ${sim.inTray.reduce((a, t) => a + t.qty, 0)} packs to put away</span></h3><table class="tbl">${sim.drugs.slice(0, 30).map((d) => `<tr class="click" data-open="drug:${d.id}"><td>${dot(d.color)}${esc(d.name)}</td><td class="faint">${esc(d.form)}</td><td class="r"${d.stock < d.min ? ' style="color:#fbbf24"' : ''}>${d.stock} / ${d.cap}</td></tr>`).join('')}</table></div>`;
    },

    // ---------- inspectors
    inspect: {
      carrier(ui, id) {
        const sim = ui.sim, cr = sim.carrierById.get(id);
        if (!cr) return '<div class="hd"><b>Carrier</b><button class="close">×</button></div><div class="faint">Unknown.</div>';
        const ct = cr.contents, k = kindOf(cr);
        return `<div class="hd"><b>Carrier ${cr.code}</b><span class="pill">${cr.state.replace('_', ' ')}</span><button class="close">×</button></div>
          <dl class="kv"><dt>Carrying</dt><dd>${dot(KCOL[k])}${WS.TUBE_KIND[k]}${ct && ct.stat ? ' · <b style="color:#f87171">urgent</b>' : ''}${ct && ct.order ? ` · <a href="#" data-open="morder:${ct.order.id}">${ct.order.code}</a>` : ''}</dd>
          <dt>Now</dt><dd>${esc(CST[cr.state] || cr.state)} · ${esc(where(sim, cr))}</dd>
          ${cr.dest ? `<dt>From → to</dt><dd>${esc(cr.from ? cr.from.name : '—')} → ${esc(cr.dest.name)}</dd><dt>Since</dt><dd>${U.fmtDur(sim.time - cr.tq0)} in the system${cr.leg ? ` · ${cr.leg.zone.name}` : ''}</dd>` : ''}
          <dt>Home</dt><dd>${esc(cr.home.name)}</dd><dt>Trips</dt><dd>${cr.trips} today</dd><dt>Tag</dt><dd class="mono">RFID ${cr.code}</dd></dl>
          <div class="btns"><button class="btn ghost" data-airpost="follow:${cr.id}">Follow in 3D</button></div>`;
      },
      morder(ui, id) {
        const sim = ui.sim, o = sim.orders.find((x) => x.id === id);
        if (!o) return '<div class="hd"><b>Order</b><button class="close">×</button></div><div class="faint">Gone from the list.</div>';
        return `<div class="hd"><b>${o.code}</b><span class="pill">${o.status}</span><button class="close">×</button></div>
          <dl class="kv"><dt>For</dt><dd>${esc(o.ward.name)} (${esc(o.ward.code)})${o.stat ? ' · <b style="color:#f87171">urgent</b>' : ''}</dd><dt>In</dt><dd>${clock(sim, o.created)}${o.done ? ` · on the ward ${clock(sim, o.done)}, after ${U.fmtDur(o.done - o.created)}` : ''}</dd>
          <dt>Now</dt><dd>${esc(OST[o.status] || o.status)}${o.carrier && o.status === 'SENT' ? ' · ' + crLink(o.carrier) : ''}</dd></dl>
          <h3>Lines</h3><table class="tbl">${o.lines.map((l) => `<tr class="click" data-open="drug:${l.drug.id}"><td>${l.done ? '✓' : ''}</td><td>${dot(l.drug.color)}${esc(l.drug.name)}</td><td class="r">${l.qty} ${esc(l.drug.form)}</td></tr>`).join('')}</table>
          ${o.carrier ? `<div class="btns"><button class="btn ghost" data-airpost="follow:${o.carrier.id}">Follow its carrier</button></div>` : ''}`;
      },
      drug(ui, id) {
        const sim = ui.sim, d = sim.drugs[id];
        return `<div class="hd"><b>${dot(d.color)}${esc(d.name)}</b><span class="pill">${esc(d.form)}</span><button class="close">×</button></div>
          <dl class="kv"><dt>In the robot</dt><dd>${d.stock} of ${d.cap} packs · reorder below ${d.min}${d.onOrder ? ` · ${d.onOrder} on order` : ''}</dd><dt>Where</dt><dd>${d.slot.side < 0 ? 'north' : 'south'} shelves, ${d.slot.z.toFixed(2)} m up, ${(d.slot.x0 - sim.G.cab.x0).toFixed(1)}–${(d.slot.x1 - sim.G.cab.x0).toFixed(1)} m along</dd><dt>Pack</dt><dd>${Math.round(d.w * 100)} × ${Math.round(d.dp * 100)} × ${Math.round(d.h * 100)} cm</dd><dt>Picked</dt><dd>${d.picks} times today</dd></dl>
          <div class="bcwrap" style="margin-top:6px">${WS.Barcode.ean13SVG(d.gtin, { height: 30, module: 1.2 })}</div>`;
      },
    },
    inspectCell(ui, i) {
      const sim = ui.sim, m = sim.map, z = m.zoneOf[i], s = m.stOf[i];
      if (s >= 0) return ui.inspectPort ? ui.inspectPort(sim.ports[s]) : '';
      if (z >= 0) { ui.select({ kind: 'robot', id: sim.zones[z].id }); return ''; }
      return '<div class="hd"><b>Hospital</b><button class="close">×</button></div><div class="faint">Click a station, a tube or a carrier.</div>';
    },
    inspectPort(ui, p) {
      const sim = ui.sim, w = p.work, list = (cs) => cs.map(crLink).join(' ') || '—';
      const wants = p.wants.map((x) => `${WS.TUBE_KIND[x.kind]}${x.stat ? ' (urgent)' : ''} → ${esc(x.dest.code)}`).join(' · ');
      return `<div class="hd"><b>${p.code} · ${esc(p.name)}</b><span class="pill">${p.away ? 'BREAK' : p.noCarrier() ? 'NO CARRIER' : w ? (w.kind === 'load' ? 'LOADING' : 'EMPTYING') : 'READY'}</span><button class="close">×</button></div>
        <dl class="kv"><dt>Floor</dt><dd>${p.f ? 'Floor ' + p.f : 'Ground floor'} · ${esc(p.zone ? p.zone.name : '')}</dd>
        <dt>Empty carriers</dt><dd>${list(p.empties)}${p.coming ? ` · ${p.coming} coming` : ''}</dd><dt>In the basket</dt><dd>${list(p.basket)}${p.incoming ? ` · ${p.incoming} on the way` : ''}</dd>
        <dt>Send dock</dt><dd>${list(p.outQ)}</dd>${wants ? `<dt>Waiting to go</dt><dd>${wants}</dd>` : ''}
        <dt>Today</dt><dd>${p.sent} sent · ${p.got} landed${p.noCarrierT ? ` · ${U.fmtDur(p.noCarrierT)} without a carrier` : ''}</dd><dt>Busy</dt><dd>${pct(p.busyNow || 0)}% the last 15 min</dd></dl>`;
    },
    position(r) { return r instanceof WS.TubeZone ? (r.leg ? `${r.s.toFixed(1)} of ${r.leg.L.toFixed(1)} m along its leg` : 'at rest') : r instanceof WS.TubeDispenser ? `${(r.x - r.sim.G.cab.x0).toFixed(1)} m along the aisle, ${r.z.toFixed(2)} m up` : 'in the plant room'; },
    speed(r) { return Math.max(...Object.values(r.vel || { a: 0 }).map((v) => v || 0), 0); },
    motion(r) { return r instanceof WS.TubeZone ? 'blower and tube line' : r instanceof WS.TubeTransfer ? 'linear transfer unit' : 'pharmacy picking robot'; },
    mechanism(r) {
      if (r instanceof WS.TubeZone) return `<dt>Carrier</dt><dd>${r.leg ? `${crLink(r.leg.cr)} · ${r.leg.from ? esc(r.leg.from.code) : 'transfer unit'} → ${r.leg.to ? esc(r.leg.to.code) : 'transfer unit'}` : '—'}</dd><dt>Stations</dt><dd>${r.stations.map((p) => esc(p.code)).join(', ')}</dd><dt>Trips</dt><dd>${r.legs} today</dd>`;
      if (r instanceof WS.TubeTransfer) return `<dt>Holding</dt><dd>${r.slots.map(crLink).join(' ') || '—'} of ${r.sim.cfg.tuSlots}${r.res ? ` · ${r.res} on the way` : ''}</dd><dt>Shifts</dt><dd>${r.shifts} today</dd>`;
      return `<dt>Holding</dt><dd>${r.held ? `${r.held.n} × ${esc(r.held.drug.name)}` : '—'}</dd><dt>Packs</dt><dd>${r.packs} picked · ${r.stocked} put away</dd>`;
    },
    power() { return 'mains, not modelled'; },
    liftsLabel: 'trips',
    taskText(ui, r) {
      if (r instanceof WS.TubeZone) return r.leg ? `${r.leg.cr.code} → ${r.leg.to ? r.leg.to.code : 'TU'}` : '';
      if (r instanceof WS.TubeDispenser) return r.task ? (r.task.kind === 'pick' ? r.task.order.code : 'putting away') : '';
      return r.cur ? r.cur.code : '';
    },
    cellWord: 'station',
    depthTag() { return ''; },
    locate() { return '—'; },
    scan(ui, v) {
      const sim = ui.sim, q = String(v).trim().toUpperCase(), d = q.replace(/\D/g, '');
      const cr = /^C?\d{1,4}$/.test(q) && sim.carriers.find((x) => x.code === 'C' + d.padStart(3, '0'));
      if (cr) { ui.select({ kind: 'carrier', id: cr.id }); return true; }
      const o = sim.orders.find((x) => x.code === q || x.code === 'RX-' + d);
      if (o) { ui.select({ kind: 'morder', id: o.id }); return true; }
      const p = sim.ports.find((x) => x.code === q);
      if (p) { ui.select({ kind: 'port', id: p.idx }); return true; }
      const dr = sim.drugs.find((x) => x.gtin === d);
      if (dr) { ui.select({ kind: 'drug', id: dr.id }); return true; }
      return false;
    },
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-airpost]'), app = WS.app;
    if (!b || !app || !app.sim || app.sim.kind !== 'tube') return;
    const [k, id] = b.dataset.airpost.split(':'), cr = app.sim.carrierById.get(+id);
    if (k === 'follow' && cr) { const go = () => app.gl.followOrder(cr); if (app.gl) go(); else app.setView('3d'); if (app.loading3d) app.loading3d.then(go); }
  });
})((globalThis.WS = globalThis.WS || {}));
