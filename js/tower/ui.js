/* FloorStack's part of the user interface: RailRunner's (the store on the
 * first floor, WS.TypeUI.shuttle) with the links between the floors, the
 * sorter and the trucks in the KPI tiles, its own settings, the dock in the
 * Outbound tab, and inspectors for the spirals and lifts, the chutes, the
 * dock doors, the goods lift, the canteen and the people. */
(function (WS) {
  'use strict';
  const esc = WS.U.esc, U = WS.U, S = WS.TypeUI.shuttle;
  const FLOOR = ['ground floor', 'first floor', 'second floor'];
  const pc = (v) => Math.round(v * 100);
  const fill = (b, pitch) => (b ? (b.totes.length * pitch) / b.len : 0);
  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.tower = Object.assign({}, S, {
    kpiTiles(ui) {
      const sim = ui.sim, k = sim.kpi, L = sim.links, d = sim.docks, p = sim.net.pitch;
      const link = (l, key, what) => (l.vrc ? `${l.vrc.name} busy ${pc(l.vrc.utilization)}%` : `spiral ${pc(fill(l.sp, p))}% full`) + ` · ${what}`;
      const next = d.doors.filter((x) => x.truck && x.truck.state === 'DOCKED').sort((a, b) => a.due - b.due)[0];
      return S.kpiTiles(ui).concat([
        ui.kpiTile('Up to picking', Math.round(k.rate('up')), 'totes/h', link(L.up, 'up', `${L.up.inn.totes.length} waiting at its foot`)),
        ui.kpiTile('Down to the store', Math.round(k.rate('down')), 'totes/h', link(L.down, 'down', `${sim.stats.laps2} laps upstairs`)),
        ui.kpiTile('Tote lift', pc(L.gi.vrc.utilization), '%', `goods-in: ${Math.round(k.rate('giDown'))} totes/h down, ${Math.round(k.rate('giUp'))} up`),
        ui.kpiTile('Parcels sorted', Math.round(k.rate('sorted')), '/h', `${d.loop.reduce((n, b) => n + b.totes.length, 0)} on the sorter · ${d.stats.laps} went round · ${d.parcelQ.length + d.spiral.totes.length} on the way down`),
        ui.kpiTile('Trucks out', d.stats.trucks, '', next ? `next: ${next.carrier.name} at ${U.fmtClock(next.due).slice(-8, -3)}, ${next.truck.cages.length}/${sim.cfg.truckCages} cages` : 'no truck at a door'),
      ]);
    },
    settings(ui, c, num, sel) {
      return {
        live: `${sel('putawayPolicy', 'Where totes go back', [['velocity', 'Velocity-based (fast movers near the aisle front, least busy aisle)'], ['nearest', 'Nearest to the aisle front'], ['random', 'Random free position']])}
        <div class="row2">${num('loopLimit', 'First-floor loop limit (share)', 0.05, 0.3, 0.95)}${num('cageCap', 'Parcels per roll cage', 1, 4, 40)}</div>
        <div class="row2">${num('truckEvery', 'Truck departures every (s)', 60, 600, 7200)}${num('breakEvery', 'A break every (s, 0 = none)', 60, 0, 7200)}</div>`,
        scenario: `<div class="row2">${sel('linkType', 'Between the first and second floor', [['spiral', 'Spiral conveyors'], ['lift', 'A tote lift each way']])}${num('beltSpeed', 'Belts and spirals (m/s)', 0.1, 0.3, 2)}</div>
        <div class="row2">${num('vrcV', 'Tote lift speed (m/s)', 0.1, 0.3, 4)}${num('vrcCap', 'Totes per lift carriage', 1, 1, 4)}</div>
        <div class="row2">${num('aisles', 'Aisles', 1, 2, 8)}${num('levels', 'Levels', 1, 4, 10)}</div>
        <div class="row2">${num('bays', 'Bays per side', 1, 8, 40)}${num('rackFill', 'Share of positions with a tote', 0.05, 0.2, 0.95)}</div>
        <div class="row2">${num('portInboundCap', 'Totes in flight per station', 1, 1, 24)}${num('toteSlots', 'Put-wall slots', 1, 2, 7)}</div>
        <div class="row2">${num('chutesPerCarrier', 'Chutes per carrier', 1, 1, 2)}${num('truckCages', 'Roll cages per truck', 1, 2, 16)}</div>
        <div class="row2">${num('toteCount', 'Order totes', 5, 10, 200)}${num('stockedRatio', 'Share of totes stocked', 0.05, 0.1, 0.95)}</div>`,
        about: `A fulfilment building of three floors. On the first floor a shuttle store (as RailRunner): ${c.aisles} aisles, ${c.levels} levels, a shuttle per level and a lift per aisle, with a one-way conveyor loop in front of the aisles. The pick stations and packing are a floor up: ${c.linkType === 'lift' ? 'a tote lift carries the totes up to them and another one back down' : 'a spiral conveyor carries the totes up to them and another one back down'}, onto a station line with a spur into every station. Goods-in is on the ground floor, linked to the store by a tote lift with room for ${c.vrcCap} totes. Packed parcels drop down a parcel spiral, two floors, to a sorter loop that runs high along the north wall; each carrier has a dock door with two chutes, a parcel slides into a roll cage there, and a loader pushes full cages into the truck, which leaves when full or at its carrier's departure time. Suppliers' trucks bring pallets to the west doors. Operators take their breaks in the canteen on the ground floor and ride the goods lift. The links between the floors are the new bottleneck: totes travel far, so a station needs more of them in flight, and lifts instead of spirals carry far fewer. Not modelled: a second storage system, returns, people on the stairs. Barcodes: GS1 GTIN-13 on items, GS1-128 GRAI on totes, GS1-128 SSCC on parcels.`,
      };
    },
    live: ['putawayPolicy', 'loopLimit', 'cageCap', 'truckEvery', 'breakEvery', 'handlerTime', 'liftTransfer'],
    position(r) {
      if (r instanceof WS.Vrc) { const f = r.floor; return f == null ? `between the ${FLOOR[r.stops[0].floor]} and the ${FLOOR[r.stops[1].floor]}` : `at the ${FLOOR[f]}`; }
      return S.position(r) + ' · first floor';
    },
    speed(r) { return r instanceof WS.Vrc ? (r.vel.z || 0) * WS.RACK_ZU : S.speed(r); },
    motion(r) { return r instanceof WS.Vrc ? 'tote lift (vertical conveyor)' : S.motion(r); },
    mechanism(r) { return r instanceof WS.Vrc ? `<dt>Carriage</dt><dd>${r.load.length} / ${r.sim.cfg.vrcCap} totes${r.roll ? ' · a tote rolling' : ''}</dd><dt>Trips</dt><dd>${r.trips}</dd>` : S.mechanism(r); },
    taskText(ui, r) {
      if (r instanceof WS.Vrc) { const t = r.task; return t ? `${r.load.length ? 'Carry' : 'Fetch'} totes to the ${FLOOR[t.to]}` : '—'; }
      return S.taskText(ui, r);
    },
    portsNote: 'Bar: operator busy (blue) vs. waiting for totes with demand queued (orange). The totes come up from the store on the first floor: a long way, so stations wait for totes that are already on their way.',

    // ---------------------------------------------------------------- outbound: the dock doors
    tab_outbound() { return '<div id="ob"></div>'; },
    live_outbound(ui) {
      const el = document.getElementById('ob');
      if (!el) return;
      const sim = ui.sim, d = sim.docks, oms = sim.oms, c = sim.cfg;
      el.innerHTML = `<div class="sect"><h3>Pack stations <span class="sub">second floor</span></h3>${oms.packers.map((pk) => `<div class="pcard" data-open="packer:${pk.idx}"><div class="row"><span class="name">${pk.name}${pk.kind !== 'manual' ? ' <span class="faint">· machine</span>' : ''}</span>${pk.cur ? `<span class="pill PACKING">PACKING ${pk.cur.id}</span>` : '<span class="pill">IDLE</span>'}</div>
        <div class="row meta"><span>${pk.queue.length} totes queued · ${pk.incoming} on conveyor</span><span>${pk.done} packed</span></div></div>`).join('')}</div>
        <div class="sect"><h3>Dock doors <span class="sub">ground floor</span></h3>${d.doors.map((x) => this.doorCard(ui, x)).join('')}</div>
        ${oms.trucksGone.length ? `<div class="sect"><h3>Trucks gone</h3><table class="tbl"><tr><th>Truck</th><th>Carrier</th><th class="r">Cages</th><th class="r">Parcels</th><th class="r">Left</th></tr>${oms.trucksGone.slice(-8).reverse().map((t) => `<tr><td>${t.id}</td><td>${esc(t.carrier)}</td><td class="r">${t.cages}</td><td class="r">${t.parcels}</td><td class="r">${U.fmtClock(t.t).slice(-8)}</td></tr>`).join('')}</table></div>` : ''}
        <div class="note">Parcels drop down the parcel spiral to the sorter; each goes into an open chute of its carrier (${c.chutesPerCarrier} per door) and a roll cage of ${c.cageCap}. A full cage closes its chute until the loader has changed it.</div>`;
    },
    doorCard(ui, d) {
      const sim = ui.sim, c = sim.cfg, tr = d.truck, st = !tr ? `<span class="pill">NO TRUCK · next ${U.fmtClock(d.nextAt).slice(-8, -3)}</span>` : tr.state === 'DOCKED' ? '<span class="pill SHIPPED">LOADING</span>' : `<span class="pill">${tr.state}</span>`;
      return `<div class="pcard" data-open="door:${d.k}"><div class="row"><span class="name">Door ${d.k + 1} · ${esc(d.carrier.name)}</span>${st}</div>
        <div class="row meta"><span>${tr ? `${tr.id} · ${tr.cages.length}/${c.truckCages} cages · leaves ${U.fmtClock(d.due).slice(-8, -3)}` : '—'}</span><span>${d.staged.length} cages waiting</span></div>
        <div class="row meta"><span>${d.chutes.map((ch) => `chute ${ch.idx + 1}: ${ch.cage ? ch.cage.items.length + '/' + c.cageCap : 'changing'}`).join(' · ')}</span><span>${d.gone} trucks gone</span></div></div>`;
    },

    // ---------------------------------------------------------------- inspectors
    inspect: {
      link(ui, id) {
        const sim = ui.sim, L = sim.links, d = sim.docks, hd = (t) => `<div class="hd"><b>${esc(t)}</b><button class="close">×</button></div>`;
        if (id === 'parcel') return hd('Parcel spiral') + `<dl class="kv"><dt>Runs</dt><dd>second floor → ground floor, past the first</dd><dt>Parcels on it</dt><dd>${d.spiral.totes.length}</dd><dt>Waiting at the top</dt><dd>${d.parcelQ.length}</dd><dt>Length</dt><dd>${(d.spiral.len * sim.cfg.cellSize).toFixed(0)} m at ${sim.cfg.sorterSpeed} m/s</dd></dl>`;
        if (id === 'sorter') return hd('Sorter loop') + `<dl class="kv"><dt>Parcels on it</dt><dd>${d.loop.reduce((n, b) => n + b.totes.length, 0)}</dd><dt>Sorted</dt><dd>${d.stats.sorted} · ${Math.round(sim.kpi.rate('sorted'))}/h</dd><dt>Went round</dt><dd>${d.stats.laps} (chute closed or cage full)</dd></dl>`;
        const l = L[id], up = id === 'up';
        if (l.vrc) return hd(l.vrc.name) + `<dl class="kv"><dt>Runs</dt><dd>${up ? 'first floor → second floor' : 'second floor → first floor'}</dd><dt>Busy</dt><dd>${pc(l.vrc.utilization)}%</dd><dt>Waiting at its infeed</dt><dd>${l.inn.totes.length}</dd><dt>Totes moved</dt><dd>${sim.stats[id]}</dd></dl><div class="btns"><button class="btn" data-open="robot:${l.vrc.id}">Open the lift</button></div>`;
        return hd(up ? 'Spiral up' : 'Spiral down') + `<dl class="kv"><dt>Runs</dt><dd>${up ? 'first floor → second floor, to the pick stations' : 'second floor → first floor, back to the store'}</dd><dt>Totes on it</dt><dd>${l.sp.totes.length} · ${pc(fill(l.sp, sim.net.pitch))}% full</dd><dt>Waiting at its foot</dt><dd>${l.inn.totes.length}</dd><dt>Length</dt><dd>${(l.sp.len * sim.cfg.cellSize).toFixed(0)} m, ${((l.sp.len * sim.cfg.cellSize) / sim.cfg.beltSpeed).toFixed(0)} s a ride</dd><dt>Totes moved</dt><dd>${sim.stats[id]} · ${Math.round(sim.kpi.rate(id))}/h</dd></dl>`;
      },
      chute(ui, id) {
        const sim = ui.sim, ch = sim.docks.chutes[id], c = sim.cfg;
        return `<div class="hd"><b>Chute ${ch.idx + 1} · ${esc(ch.carrier.name)}</b><button class="close">×</button></div><dl class="kv"><dt>State</dt><dd>${ch.busy ? 'closed: the loader is changing its cage' : sim.docks.open(ch) ? 'open' : 'closed: the cage is full'}</dd><dt>Roll cage</dt><dd>${ch.cage ? `${ch.cage.id} · ${ch.cage.items.length}/${c.cageCap} parcels` : '—'}</dd><dt>On the chute</dt><dd>${ch.belt.totes.length}</dd><dt>Dock door</dt><dd><a href="#" data-open="door:${ch.door.k}">Door ${ch.door.k + 1}</a></dd></dl>`;
      },
      door(ui, id) { const d = ui.sim.docks.doors[id]; return `<div class="hd"><b>Dock door ${d.k + 1}</b><button class="close">×</button></div>${WS.TypeUI.tower.doorCard(ui, d)}<dl class="kv"><dt>Loader</dt><dd><a href="#" data-open="person:${d.loader.id}">${esc(d.loader.name)}</a> · ${d.loader.task ? 'at work' : 'waiting'}</dd><dt>Empty cages by the door</dt><dd>${d.empties}</dd></dl>`; },
      inDoor(ui, id) { const d = ui.sim.docks.inDoors[id], tr = d.truck; return `<div class="hd"><b>Inbound door ${d.k + 1}</b><button class="close">×</button></div><dl class="kv"><dt>Truck</dt><dd>${tr ? `${tr.id} · ${tr.state.toLowerCase()} · ${tr.pallets} pallets left` : 'none'}</dd><dt>Pallets in staging</dt><dd>${ui.sim.docks.staging.filter((s) => s.full === true).length}</dd></dl>`; },
      staff(ui) {
        const L = ui.sim.people.lift;
        return `<div class="hd"><b>Goods lift</b><button class="close">×</button></div><dl class="kv"><dt>Car</dt><dd>${L.floor == null ? 'between the floors' : 'at the ' + FLOOR[L.floor]} · ${L.state.toLowerCase()}</dd><dt>Riding</dt><dd>${L.riders.length ? L.riders.map((P) => esc(P.name)).join(', ') : '—'}</dd><dt>Called to</dt><dd>${L.calls.length ? L.calls.map((f) => FLOOR[f]).join(', ') : '—'}</dd><dt>Trips</dt><dd>${L.trips}</dd></dl><div class="note">People ride it to the canteen on the ground floor and back. Stairs run beside it.</div>`;
      },
      canteen(ui) {
        const sim = ui.sim, seated = sim.people.seats.filter((s) => s.taken);
        return `<div class="hd"><b>Canteen</b><button class="close">×</button></div><dl class="kv"><dt>On a break</dt><dd>${seated.length ? seated.map((s) => esc(s.taken.name)).join(', ') : 'nobody'}</dd><dt>Breaks so far</dt><dd>${sim.disrupt.count.break}</dd><dt>Next scheduled</dt><dd>${sim.cfg.breakEvery ? U.fmtClock(sim.people.breakNext).slice(-8, -3) : 'none'}</dd></dl>`;
      },
      person(ui, id) {
        const P = ui.sim.people.list[id], what = { AT_STATION: 'at the station', TO_BREAK: 'on the way to the canteen', BREAK: 'on a break in the canteen', FROM_BREAK: 'on the way back', IDLE: P.task ? 'at work' : 'waiting' }[P.state] || P.state;
        return `<div class="hd"><b>${esc(P.name)}</b><span class="pill">${esc(P.role)}</span><button class="close">×</button></div><dl class="kv"><dt>Now</dt><dd>${P.inLift ? 'riding the goods lift' : what}${P.carry ? (P.carry === 'pallet' ? ' · with a pallet' : ` · pushing roll cage ${P.carry.id}`) : ''}</dd><dt>Floor</dt><dd>${FLOOR[P.floor]}</dd><dt>Walked</dt><dd>${((P.walked * ui.sim.cfg.cellSize) / 1000).toFixed(2)} km</dd>${P.port ? `<dt>Station</dt><dd><a href="#" data-open="port:${P.port.idx}">${P.port.name}</a></dd>` : ''}</dl>`;
      },
    },
  });
})((globalThis.WS = globalThis.WS || {}));
