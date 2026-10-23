/* RoboValet's part of the user interface. It has no stock or orders, so it
 * brings its own KPI tiles, settings panel and side tabs (Cars, Levels),
 * the cabin cards for the control room, and inspectors for a car, a bay
 * and a cabin; plates and bay names can be typed into the scan field. */
(function (WS) {
  'use strict';
  const U = WS.U, esc = U.esc, pct = (v) => Math.round(v * 100);
  const CAB = { FREE: 'free', ENTERING: 'a car drives in', HANDOVER: 'the driver gets out', SCAN: 'door closed, checking the car', READY_IN: 'car ready for the robot', CLEARING: 'the robot takes the car out', RESERVED: 'held for a car on its way down', READY_OUT: 'car ready, waiting for its driver', LEAVING: 'the driver gets in and drives off' };
  const CAB_PILL = { FREE: '', ENTERING: 'PICKED', HANDOVER: 'PICKED', SCAN: 'PICKED', READY_IN: 'RELEASED', CLEARING: 'RELEASED', RESERVED: 'BACKORDER', READY_OUT: 'SHIPPED', LEAVING: 'SHIPPED' };
  const CAR = { QUEUED: 'queueing in the street', ENTERING: 'driving into a cabin', HANDOVER: 'in a cabin, the driver getting out', WAITING_ROBOT: 'in a cabin, waiting for the robot', TO_LEVEL: 'on its way up to its bay', PARKED: 'parked', RETRIEVING: 'on its way down', READY: 'ready in a cabin', BOARDING: 'the driver gets in', LEAVING: 'driving off' };
  const FLOOR = (f) => (f ? 'level ' + f : 'the ground floor');
  const clock = (sim, t) => U.fmtClock(sim.clock(t)).slice(-8, -3);
  const plate = (car) => `<span class="plate"><i>B</i>${esc(car.plate)}</span>`;
  const carLink = (car) => `<a href="#" data-open="car:${car.id}">${esc(car.plate)}</a>`;
  const groupBusy = (ms) => (ms.length ? ms.reduce((s, m) => s + m.utilization, 0) / ms.length : 0);

  // A car's whereabouts in words
  function where(sim, car) {
    if (car.state === 'PARKED') return `parked in ${car.bay.name}`;
    if (car.robot) return `on robot ${car.robot.name}${car.state === 'TO_LEVEL' && car.target ? `, to ${car.target.name}` : ''}`;
    if (car.lift) return `in ${car.lift.name}${car.lift.at == null ? ', moving' : ' at ' + FLOOR(car.lift.at)}`;
    if (car.cabin && car.where === 'cabin') return `in ${car.cabin.name}: ${CAR[car.state] || car.state.toLowerCase()}`;
    if (car.state === 'QUEUED') return `in the street, ${sim.queue.indexOf(car) + 1} in the queue`;
    return CAR[car.state] || car.state.toLowerCase();
  }

  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.park = {
    allKpiTiles(ui) {
      const sim = ui.sim, k = sim.kpi, s = sim.stats, n = sim.bays.length, occ = sim.occupancy(), free = sim.bays.filter((b) => !b.car && !b.reserved).length;
      const w = sim.stat(s.waits, 'w'), r = sim.stat(s.retrievals, 'r'), lobby = sim.drivers.filter((d) => d.state === 'WAITING').length;
      const cabs = sim.ports, now = (ms) => (ms.length ? ms.reduce((a, m) => a + (m.busyNow || 0), 0) / ms.length : 0), held = cabs.filter((p) => p.state === 'RESERVED').length;
      const robots = sim.fleet.filter((m) => m instanceof WS.ParkRobot);
      return [
        ui.kpiTile('Occupancy', pct(occ / n), '%', `${occ} of ${n} bays · ${free} free`),
        ui.kpiTile('Cars in', Math.round(k.rate('presented')), '/h', `${s.stored} parked today · ${s.arrived} arrived`),
        ui.kpiTile('Cars out', Math.round(k.rate('lines')), '/h', `${s.delivered} delivered · ${s.left} gone`),
        ui.kpiTile('Driver wait', w ? U.fmtDur(w.avg) : '—', '', w ? `last hour · 90% within ${U.fmtDur(w.p90)} · ${lobby} waiting now` : `${lobby} waiting now`),
        ui.kpiTile('Retrieval', r ? U.fmtDur(r.avg) : '—', '', r ? `request → car in a cabin · longest ${U.fmtDur(r.max)}` : 'request → car in a cabin'),
        ui.kpiTile('Street queue', sim.queue.length, '', `${s.turnedAway} turned away${s.full ? ` · ${s.full} when full` : ''}`),
        ui.kpiTile('Cabins busy', pct(now(cabs)), '%', `last 15 min · ${held} of ${cabs.length} held for cars on their way down now`),
        ui.kpiTile('Lifts busy', pct(now(sim.lifts)), '%', `last 15 min · today ${pct(groupBusy(sim.lifts))}% · ${sim.lifts.reduce((a, L) => a + L.trips, 0)} trips`),
        ui.kpiTile('Robots busy', pct(now(robots)), '%', `last 15 min · ${robots.length} robots · ${robots.reduce((a, m) => a + m.lifts, 0)} cars moved`),
      ];
    },
    settings(ui, c, num, sel) {
      return {
        full: `<div class="sect"><h3>Live</h3><div class="card">
        ${sel('placement', 'Where cars are parked', [['balanced', 'Balanced: the level whose robot has least to do, near the lift'], ['nearest', 'Nearest: low levels near the lifts first'], ['stay', 'By stay: short stays near the lifts, long stays far up']])}
        <div class="row2">${num('appShare', 'Drivers who order in the app (share)', 0.05, 0, 1)}${num('appLead', 'They order this far ahead (min)', 1, 0, 30)}</div>
        <div class="row2">${num('demand', 'Traffic (× the day below)', 0.1, 0, 3)}${num('maxQueue', 'Drivers give up past this queue', 1, 1, 40)}</div>
        <div class="note">Applied immediately. The app share applies to cars that arrive from now on.</div></div></div>
      <div class="sect"><h3>Scenario <span class="sub">restarts the day at 06:00</span></h3><div class="card">
        <div class="row2">${num('levels', 'Parking levels', 1, 1, 10)}${num('modules', 'Cabins (each with a lift)', 1, 1, 8)}</div>
        <div class="row2">${num('baysPerRow', 'Bays in the north row', 1, 4, 40)}${num('residents', 'Residents parked overnight', 1, 0, 300)}</div>
        <div class="row2">${num('commuters', 'Commuters', 5, 0, 600)}${num('shoppers', 'Visitors an hour (10–20 h)', 1, 0, 200)}</div>
        <div class="row2">${num('commuteIn', 'Commuters arrive around (h)', 0.25, 6, 12)}${num('commuteOut', 'and leave around (h)', 0.25, 12, 21)}</div>
        <div class="row2">${num('vLoaded', 'Robot with a car (m/s)', 0.1, 0.3, 3)}${num('vEmpty', 'Robot empty (m/s)', 0.1, 0.3, 4)}</div>
        <div class="row2">${num('liftV', 'Lift speed (m/s)', 0.1, 0.2, 4)}${num('clampTime', 'Clamp and lift a car (s)', 1, 1, 30)}</div>
        ${num('seed', 'Random seed', 1, 1)}
        <div class="btns"><button class="btn primary" id="cfg-restart">Apply &amp; restart</button><button class="btn ghost" id="cfg-reset">Defaults</button><button class="btn ghost" id="cfg-share" title="Copy a link that opens exactly this setup: the settings above, the seed and the view">Copy link</button></div>
        <div class="note">Each cabin has its own lift behind it and a robot that carries cars between the two. Every level has one robot.</div></div></div>
      <div class="sect"><h3>About the model</h3><div class="card" style="font-size:12px;color:var(--muted)">${this.about(c, ui.sim)}</div></div>`,
      };
    },
    about(c, sim) {
      return `An automated car park on ${c.levels} levels above a ground floor, ${sim.bays.length} bays. Drivers leave their car in one of ${c.modules} entry/exit cabins on the street: they get out, confirm at the terminal and walk off (${c.handover} s), the door closes and the car is checked (${c.scanTime} s). Behind each cabin is a car lift; a ground robot carries the car across into it. A robot is a flat AGV that slides under the car, clamps its four tyres and lifts it a few centimetres (${c.clampTime} s); it moves sideways as easily as forwards and turns a car on the spot. The lift (${c.liftV} m/s) takes the car up, and the robot of that level (${c.vLoaded} m/s with a car, ${c.vEmpty} m/s empty) takes it off and parks it in a bay. Robots never leave their floor and the lifts carry only the car, so there is no traffic between robots. A driver coming back pays at a kiosk in the lobby (${c.payTime} s) and waits; ${pct(c.appShare)}% order the car in the app ${c.appLead} min ahead. A retrieval books a free cabin together with its lift: the level robot fetches the car and turns it round, so it comes down facing the street, and the cabin stays held for it. The day: residents parked overnight, ${c.commuters} commuters arriving around ${c.commuteIn}h and leaving around ${c.commuteOut}h, visitors through the day. Drivers who find ${c.maxQueue} cars queueing, or the car park full, go elsewhere. Not modelled: robot batteries, cars too big for the bays, re-parking cars overnight. Dimensions and speeds are typical of AGV car parks, not those of one product.`;
    },
    live: ['placement', 'appShare', 'appLead', 'demand', 'maxQueue'],
    portsNote: 'Bar: busy (blue), of which held for a car on its way down (orange). A cabin and its lift serve cars going in and out; a retrieval holds the cabin until the car has come down and been driven off.',
    portCard(ui, p) {
      const busy = p.stats.t ? p.stats.busy / p.stats.t : 0, held = p.stats.t ? p.stats.blocked / p.stats.t : 0, car = p.car || (p.state === 'RESERVED' && ui.sim.cars.find((c) => c.cabin === p && c.state === 'RETRIEVING'));
      return `<div class="pcard" data-open="port:${p.idx}"><div class="row"><span class="name">${p.code} · ${esc(p.name)}</span><span class="pill ${CAB_PILL[p.state]}">${p.state.replace('_', ' ')}</span></div>
        <div class="row meta"><span>${car ? esc(car.plate) + ' · ' : ''}${CAB[p.state]}</span><span>${p.ins} in · ${p.outs} out</span></div>
        <div class="bar"><i style="width:${(busy - held) * 100}%;background:#3987e5"></i><i style="width:${held * 100}%;background:#d95926"></i></div></div>`;
    },
    legendExtra() { return `<span class="faint">· cars in bays on the map: <i style="background:#1d4ed8"></i> just in → <i style="background:#7c3aed"></i> 8 h</span>`; },

    // ---------- side tabs
    tab_cars() {
      return `<div class="sect"><div class="stats" id="pk-stats"></div></div>
        <div class="sect"><h3>Call a car</h3><div class="card"><div class="row3"><div class="field"><label>Number plate or bay</label><input type="text" id="pk-plate" placeholder="1-ABC-123 or L2-07" list="pk-plates"></div><div class="field"><button class="btn primary" id="pk-call">Call it now</button></div><div class="field"><button class="btn ghost" id="pk-rand">Any car</button></div></div><datalist id="pk-plates"></datalist>
        <div class="note">The driver orders it in the app and walks over to the lobby; the car comes down to the first free cabin.</div></div></div>
        <div id="pk-lists"></div>`;
    },
    bind_cars(ui, b) {
      const call = (car) => { if (!car) return ui.toast('No parked car with that plate or bay', true); ui.sim.callCar(car); ui.toast(`${car.plate} called · ${car.driverName} is on the way`); ui.app.iso.selected = { kind: 'car', id: car.id }; ui.select(ui.app.iso.selected); };
      b.querySelector('#pk-call').onclick = () => call(this.findCar(ui.sim, b.querySelector('#pk-plate').value));
      b.querySelector('#pk-plate').addEventListener('keydown', (e) => { if (e.key === 'Enter') b.querySelector('#pk-call').click(); });
      b.querySelector('#pk-rand').onclick = () => { const ps = ui.sim.cars.filter((c) => c.state === 'PARKED' && !c.requested); call(ps[Math.floor(Math.random() * ps.length)]); };
    },
    findCar(sim, v) {
      const q = String(v || '').trim().toUpperCase().replace(/\s+/g, '');
      if (!q) return null;
      const bay = sim.bays.find((b) => b.name === q);
      if (bay) return bay.car && bay.car.state === 'PARKED' ? bay.car : null;
      return sim.cars.find((c) => c.plate.replace(/-/g, '') === q.replace(/-/g, '')) || null;
    },
    live_cars(ui) {
      const el = document.getElementById('pk-lists'); if (!el) return;
      const sim = ui.sim, s = sim.stats, cars = sim.cars, now = sim.time;
      const cnt = (f) => cars.filter(f).length;
      document.getElementById('pk-stats').innerHTML = [['Parked', sim.occupancy()], ['Queueing', sim.queue.length], ['Going in', cnt((c) => ['ENTERING', 'HANDOVER', 'WAITING_ROBOT', 'TO_LEVEL'].includes(c.state))], ['Being fetched', cnt((c) => c.state === 'RETRIEVING')], ['Ready', cnt((c) => c.state === 'READY')], ['Gone today', s.left]].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
      const dl = document.getElementById('pk-plates');
      if (dl && dl.dataset.n !== String(s.stored)) { dl.dataset.n = String(s.stored); dl.innerHTML = cars.filter((c) => c.state === 'PARKED').map((c) => `<option value="${c.plate}">`).join(''); }
      const waiting = sim.drivers.filter((d) => ['TO_KIOSK', 'PAY', 'TO_SEAT', 'WAITING', 'TO_CAR'].includes(d.state));
      const dstate = (d) => ({ TO_KIOSK: 'to the kiosk', PAY: 'paying', TO_SEAT: 'to a seat', WAITING: d.car.state === 'READY' ? 'car ready' : 'waiting', TO_CAR: `to ${d.car.cabin ? d.car.cabin.name : 'the car'}` }[d.state]);
      const recent = s.waits.slice(-8).reverse();
      el.innerHTML = `<div class="sect"><h3>Drivers in the lobby</h3>${waiting.length ? `<table class="tbl"><tr><th>Car</th><th>Driver</th><th>Now</th><th class="r">Waiting</th></tr>${waiting.map((d) => `<tr class="click" data-open="car:${d.car.id}"><td class="mono">${esc(d.car.plate)}${d.car.app ? ' 📱' : ''}</td><td>${esc(d.name)}</td><td>${dstate(d)}</td><td class="r">${d.car.times.lobby != null ? U.fmtDur(now - d.car.times.lobby) : '—'}</td></tr>`).join('')}</table>` : '<div class="faint">Nobody waiting.</div>'}</div>
        <div class="sect"><h3>Street queue</h3>${sim.queue.length ? `<table class="tbl"><tr><th>Car</th><th>Model</th><th class="r">Queueing</th></tr>${sim.queue.map((c) => `<tr class="click" data-open="car:${c.id}"><td class="mono">${esc(c.plate)}</td><td>${esc(c.model.name)}, ${c.colorName}</td><td class="r">${U.fmtDur(now - c.times.arrived)}</td></tr>`).join('')}</table>` : '<div class="faint">No queue.</div>'}</div>
        <div class="sect"><h3>Just collected</h3>${recent.length ? `<table class="tbl"><tr><th>Car</th><th>At</th><th class="r">Driver waited</th></tr>${recent.map((x) => `<tr><td class="mono">${esc(x.plate)}</td><td>${clock(sim, x.t)}</td><td class="r">${U.fmtDur(x.w)}</td></tr>`).join('')}</table>` : '<div class="faint">Nobody yet.</div>'}</div>
        <div class="sect"><h3>Parked longest</h3><table class="tbl"><tr><th>Car</th><th>Bay</th><th class="r">In since</th></tr>${cars.filter((c) => c.state === 'PARKED').sort((a, b) => a.times.parked - b.times.parked).slice(0, 12).map((c) => `<tr class="click" data-open="car:${c.id}"><td class="mono">${esc(c.plate)}</td><td>${c.bay.name}</td><td class="r">${c.times.parked < 0 ? 'last night' : clock(sim, c.times.parked)}</td></tr>`).join('')}</table></div>`;
    },
    tab_levels() { return '<div id="pk-levels"></div>'; },
    live_levels(ui) {
      const el = document.getElementById('pk-levels'); if (!el) return;
      const sim = ui.sim, bar = (v, col) => `<div class="bar" style="margin:4px 0 0"><i style="width:${v * 100}%;background:${col}"></i></div>`;
      const robotRow = (r) => `<a href="#" data-open="robot:${r.id}">${esc(r.name)}</a> · ${ui.stateLabel(r.displayState)}${r.car ? ' · ' + esc(r.car.plate) : ''}${r.jobs && r.jobs.length ? ` · ${r.jobs.length} queued` : ''}`;
      el.innerHTML = `<div class="sect"><h3>Levels <span class="sub">bays taken · robot</span></h3>${sim.levelBots.slice(1).map((r, k) => {
        const f = k + 1, bays = sim.bays.filter((b) => b.level === f), taken = bays.filter((b) => b.car).length, res = bays.filter((b) => b.reserved).length;
        return `<div class="pcard" data-open="robot:${r.id}"><div class="row"><span class="name">Level ${f}</span><span>${taken} / ${bays.length}${res ? ` · ${res} reserved` : ''}</span></div>${bar(taken / bays.length, '#3987e5')}<div class="row meta"><span>${robotRow(r)}</span></div></div>`;
      }).reverse().join('')}</div>
        <div class="sect"><h3>Lifts and ground robots</h3>${sim.lifts.map((L, k) => `<div class="pcard" data-open="robot:${L.id}"><div class="row"><span class="name">${L.name} · ${sim.ports[k].name}</span><span>${L.at == null ? 'moving' : 'at ' + FLOOR(L.at)}</span></div><div class="row meta"><span>${L.job ? `${L.job.type === 'store' ? 'up to' : 'down from'} level ${L.job.level} with ${esc(L.job.car.plate)}` : 'free'}${L.car ? ' · car on board' : ''}</span><span>${L.trips} trips</span></div><div class="row meta"><span>${robotRow(sim.ground[k])}</span></div></div>`).join('')}</div>`;
    },

    // ---------- inspectors
    inspect: {
      car(ui, id) {
        const sim = ui.sim, car = sim.cars.find((c) => c.id === id);
        if (!car) return '<div class="hd"><b>Car</b><button class="close">×</button></div><div class="faint">This car has left the car park.</div>';
        const t = car.times, row = (k, v) => (v != null ? `<dt>${k}</dt><dd>${clock(sim, v)}</dd>` : '');
        return `<div class="hd">${plate(car)}<span class="pill">${esc(car.state.replace('_', ' '))}</span><button class="close">×</button></div>
          <dl class="kv"><dt>Car</dt><dd>${esc(car.model.name)}, ${car.colorName} · ${car.model.L.toFixed(2)} × ${car.model.W.toFixed(2)} × ${car.model.H.toFixed(2)} m</dd>
          <dt>Driver</dt><dd>${esc(car.driverName)} · ${{ resident: 'resident', commuter: 'commuter', shopper: 'visitor' }[car.kind]}${car.app ? ' · orders in the app' : ''}</dd>
          <dt>Now</dt><dd>${where(sim, car)}</dd>
          ${car.ret < Infinity ? `<dt>Back at</dt><dd>${clock(sim, car.ret)}${sim.cfg.placement === 'stay' ? ' (told the terminal)' : ''}</dd>` : '<dt>Back</dt><dd>not today</dd>'}
          ${t.parked < 0 ? '<dt>Parked</dt><dd>overnight</dd>' : ''}${row('Arrived', t.arrived)}${row('Handed over', t.handed)}${t.parked >= 0 ? row('Parked', t.parked) : ''}${row('Requested', t.requested)}${row('Ready', t.ready)}</dl>
          <div class="btns">${car.state === 'PARKED' && !car.requested ? `<button class="btn primary" data-park="call:${car.id}">Call it now</button>` : ''}<button class="btn ghost" data-park="follow:${car.id}">Follow in 3D</button>${car.bay ? `<button class="btn ghost" data-open="bay:${car.bay.id}">Bay ${car.bay.name}</button>` : ''}</div>`;
      },
      bay(ui, id) {
        const sim = ui.sim, b = sim.bays[id], G = sim.G, car = b.car;
        const lx = sim.lifts.reduce((a, L) => (Math.abs(L.x - b.x) < Math.abs(a.x - b.x) ? L : a));
        return `<div class="hd"><b>Bay ${b.name}</b><span class="pill">${car ? 'TAKEN' : b.reserved ? 'RESERVED' : 'FREE'}</span><button class="close">×</button></div>
          <dl class="kv"><dt>Where</dt><dd>level ${b.level}, ${b.row === 'N' ? 'north' : 'south'} row, ${(Math.abs(b.x - lx.x)).toFixed(0)} m along the aisle from ${lx.name}, ${G.FZ[b.level].toFixed(1)} m up</dd>
          <dt>Car</dt><dd>${car ? `${carLink(car)} · ${esc(car.model.name)}, ${car.colorName}` : b.reserved ? 'a car on its way up' : '—'}</dd>
          ${car ? `<dt>In since</dt><dd>${car.times.parked < 0 ? 'last night' : clock(sim, car.times.parked)}</dd>` : ''}</dl>`;
      },
    },
    inspectCell(ui, i) {
      const sim = ui.sim, b = sim.map.bayAt[i];
      if (b >= 0) return this.inspect.bay(ui, b);
      const f = sim.map.floorAt(i);
      return `<div class="hd"><b>${f ? 'Level ' + f : 'Ground floor'}</b><button class="close">×</button></div><div class="faint">Click a bay, a cabin, a robot or a lift.</div>`;
    },
    inspectPort(ui, p) {
      const sim = ui.sim, car = p.car || sim.cars.find((c) => c.cabin === p && c.state === 'RETRIEVING'), L = sim.lifts[p.idx];
      return `<div class="hd"><b>${p.code} · ${esc(p.name)}</b><span class="pill ${CAB_PILL[p.state]}">${p.state.replace('_', ' ')}</span><button class="close">×</button></div>
        <div class="hmi"><div class="muted">${CAB[p.state]}</div>${car ? `<div style="margin:6px 0">${plate(car)}</div><div>${esc(car.model.name)}, ${car.colorName}</div>` : ''}</div>
        <dl class="kv" style="margin-top:10px"><dt>Cars in · out</dt><dd>${p.ins} · ${p.outs}</dd><dt>Busy</dt><dd>${pct(p.stats.busy / (p.stats.t || 1))}% · held for cars on their way down ${pct(p.stats.blocked / (p.stats.t || 1))}%</dd>
        <dt>Lift</dt><dd><a href="#" data-open="robot:${L.id}">${L.name}</a> · ${L.job ? (L.job.type === 'store' ? 'taking a car up' : 'bringing a car down') : 'free'}</dd><dt>Ground robot</dt><dd><a href="#" data-open="robot:${sim.ground[p.idx].id}">${sim.ground[p.idx].name}</a></dd></dl>`;
    },
    // ---------- robots and lifts
    position(r) { return r instanceof WS.ParkLift ? (r.at == null ? `between floors, ${r.z.toFixed(1)} m up` : 'at ' + FLOOR(r.at)) : `${FLOOR(r.level)} · ${r.x.toFixed(1)} m along, ${r.y.toFixed(1)} m in`; },
    speed(r) { return r instanceof WS.ParkLift ? r.vel.z || 0 : Math.hypot(r.vel.x || 0, r.vel.y || 0); },
    motion(r) { return r instanceof WS.ParkLift ? 'car lift' : `omnidirectional · heading ${Math.round((((-r.a * 180) / Math.PI) % 360 + 360) % 360)}°`; },
    mechanism(r) {
      if (r instanceof WS.ParkLift) return `<dt>On the platform</dt><dd>${r.car ? carLink(r.car) : '—'}</dd><dt>Trips</dt><dd>${r.trips}</dd>`;
      return `<dt>Carrying</dt><dd>${r.car ? `${carLink(r.car)} · ${esc(r.car.model.name)}` : '—'}${r.anim ? (r.anim.on ? ' · clamping' : ' · setting down') : ''}</dd><dt>Queued</dt><dd>${r.jobs.length} job${r.jobs.length === 1 ? '' : 's'}</dd>`;
    },
    power() { return 'mains (lift) or battery, not modelled'; },
    liftsLabel: 'cars moved',
    taskText(ui, r) {
      const J = r.task; if (!J) return '';
      const car = J.car ? esc(J.car.plate) : '';
      if (r instanceof WS.ParkLift) return J.type === 'store' ? `${car} up to level ${J.level}` : `${car} down from level ${J.level}`;
      if (r.ground) return J.type === 'store' ? `${car}: cabin → lift` : `${car}: lift → cabin`;
      return J.type === 'store' ? `${car}: lift → ${J.bay.name}` : `${car}: ${J.bay.name} → lift`;
    },
    cellWord: 'bay',
    depthTag() { return ''; },
    locate() { return '—'; },
    // plates and bay names typed into the scan field
    scan(ui, v) {
      const car = this.findCar(ui.sim, v);
      if (car) { ui.select({ kind: 'car', id: car.id }); return true; }
      return false;
    },
  };

  // buttons in the inspectors: call a car, follow it in 3D
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-park]'), app = WS.app;
    if (!b || !app || !app.sim || app.sim.kind !== 'park') return;
    const [k, id] = b.dataset.park.split(':'), car = app.sim.cars.find((c) => c.id === +id);
    if (!car) return;
    if (k === 'call') { app.sim.callCar(car); app.ui.toast(`${car.plate} called · ${car.driverName} is on the way`); app.ui.renderInspector(true); }
    if (k === 'follow') { const go = () => app.gl.followOrder(car); if (app.gl) go(); else app.setView('3d'); if (app.loading3d) app.loading3d.then(go); }
  });
})((globalThis.WS = globalThis.WS || {}));
