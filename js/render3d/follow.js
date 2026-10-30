/* Follow an order through the warehouse in the 3D view (Camera menu: Follow
 * an order; or Follow in 3D on an order). The camera stays with whatever
 * moves the order on: the robot or machine fetching its stock, the storage
 * unit on its way to the station, the pick into the order tote, the tote on
 * the conveyor to packing, the pack bench, the labelled parcel on its way to
 * the dock and the truck. A panel says what is happening and how far the
 * order is. In the parcel sorters the camera follows a parcel instead: from
 * the feed belt through the induct and the sorter into its chute (the
 * sorter's view says where it is: parcelFocus, js/hub/render3d.js).
 * When the order ships (the parcel is sorted) the camera moves on to the
 * next one. A type can follow its own way (ZoneHop: the A-frame window,
 * the totes, the merge, the van) with orderFocus and followSteps.
 * These are methods of WS.View3D. */
(function (WS) {
  'use strict';
  const V = WS.View3D.prototype, esc = WS.U.esc;
  const STEPS = ['Released', 'Stock', 'Pick', 'Pack', 'Ship'], PARCEL_STEPS = ['Feed', 'Induct', 'Sorter', 'Chute'];
  const STEP = { NEW: 0, BACKORDER: 0, RELEASED: 1, PICKING: 1, PICKED: 3, CONVEYOR: 3, TO_PACK: 3, PACKING: 3, PACKED: 4, LOADED: 4, SHIPPED: 5 };

  // ---------------------------------------------------------------- what to follow
  // An order just released (so the whole journey is still ahead), else the
  // newest one waiting; in a parcel sorter a parcel about to be inducted.
  V.pickFollow = function (not) {
    const sim = this.sim;
    if (sim.parcelHub) {
      const ps = sim.ports.map((p) => p.queue[0]).filter((x) => x && x !== not);
      return ps.length ? { parcel: ps[Math.floor(Math.random() * ps.length)] } : null;
    }
    const open = sim.oms.orders.filter((o) => o !== not && (o.status === 'RELEASED' || o.status === 'NEW'));
    if (!open.length) return null;
    const rel = open.filter((o) => o.status === 'RELEASED' && !o.lines.some((l) => l.picked));
    const pool = rel.length ? rel : open;
    return { order: pool.reduce((a, b) => ((b.times.released || b.created) > (a.times.released || a.created) ? b : a)) };
  };
  // follow order o (or { parcel }) from now on, switching to this camera mode
  V.followOrder = function (target) {
    this.follow = target && target.id ? { order: target } : target;
    this.cam.mode = 'order'; this.shot = 'order'; this.shotT = 0; this.cam.follow = null;
    if (this.cam.walk) { this.cam.walk = false; this.syncWalkButton(); }
    this.syncCamMode();
    this.hud(true);
  };

  // ---------------------------------------------------------------- where it is
  const unitWord = (sim) => sim.terms.unit;
  // where a storage unit is while it moves, or the machine coming for it
  V.binFocus = function (bin) {
    const sim = this.sim, U = unitWord(sim);
    if (bin.loc === 'port' && bin.port >= 0) {
      const p = sim.ports[bin.port], q = p.pick === bin ? this.pickPos(p) : sim.layout.portPath(p).head;
      return { x: q.x, y: q.y, z: this.CZ, text: `${U} ${bin.id} ${p.pick === bin ? 'is presented' : 'waits'} at ${p.name}` };
    }
    if (bin.loc === 'conveyor' && sim.conv) {
      const it = sim.conv.find((i) => i.bin === bin);
      if (it) { const q = sim.convAt(it); return { x: q.x, y: q.y, z: sim.grid.convZ, text: `${U} ${bin.id} rides the conveyor${it.port ? ' to ' + it.port.name : ''}` }; }
    }
    // in a level buffer (RailRunner, DeepLane): where it has rolled to, waiting for the lift
    const aisle = bin.loc === 'buffer' && sim.aisles && sim.aisles[bin.aisle];
    if (aisle && aisle.outBuf) {
      const g = sim.grid, l = aisle.outBuf.findIndex((q) => q.some((it) => it.bin === bin)), inn = l < 0 ? aisle.inBuf.findIndex((q) => q.some((it) => it.bin === bin)) : -1;
      const lv = l >= 0 ? l : inn, it = lv >= 0 && (l >= 0 ? aisle.outBuf : aisle.inBuf)[lv].find((q) => q.bin === bin);
      if (it) return { x: l >= 0 ? g.outX(aisle.a) : g.inX(aisle.a), y: it.pos, z: g.levelZ(lv), text: l >= 0 ? `${U} ${bin.id} waits in the level ${lv + 1} buffer for lift ${aisle.lift.name}` : `${U} ${bin.id} waits in the level ${lv + 1} buffer to be put away` };
    }
    if (bin.loc !== 'grid' && bin.robot >= 0) {
      const m = sim.fleet[bin.robot], p = m && this.followPos(bin.robot, 1);
      if (p) return Object.assign({}, p, { text: `${m.name} carries ${U} ${bin.id}` });
    }
    const t = bin.task, id = t && t.robot >= 0 ? t.robot : bin.loc === 'grid' && bin.robot >= 0 ? bin.robot : -1;
    if (id >= 0) {
      const m = sim.fleet[id], p = m && this.followPos(id, 1);
      if (p) return Object.assign({}, p, { text: `${m.name} is on its way to fetch ${U} ${bin.id}` });
    }
    return null;
  };
  // { x, y, z, step, text, done } for an order now
  V.orderFocus = function (o) {
    const sim = this.sim, L = sim.layout, oms = sim.oms, inv = sim.inv, U = unitWord(sim);
    const port = o.port >= 0 ? sim.ports[o.port] : null, step = STEP[o.status] ?? 0;
    const at = (q, z, text, s = step) => ({ x: q.x, y: q.y, z, text, step: s });
    // AisleMate: the order tote rides a robot from pick stop to pick stop, then back to a station
    const r = sim.fleet.find((m) => m.totes && m.totes.includes(o)), rp = r && this.followPos(r.id, 1);
    if (rp) return Object.assign(rp, o.status === 'PICKED' ? { step: 3, text: `${r.name} brings the full tote to a station, where it goes onto the conveyor to packing` } : { step: 2, text: `${r.name} carries the order tote from pick stop to pick stop; pickers pick into it` });
    switch (o.status) {
      case 'NEW': case 'BACKORDER': {
        const p = sim.ports.find((q) => q.kind === 'PICK') || sim.ports[0], q = L.pickPos(p);
        return at(q, this.CZ, o.status === 'NEW' ? 'Waiting for a station with a free put-wall slot and an empty tote' : 'Waiting for stock: back-ordered');
      }
      case 'RELEASED': case 'PICKING': {
        // a line being picked at the station now
        if (port && port.job && port.pick) {
          const ln = port.job.lines.slice(port.job.next).find((l) => l && l.order === o);
          if (ln) { const prod = inv.byGtin.get(ln.gtin), q = this.pickPos(port); return at(q, this.CZ, `${port.name}: picking ${ln.qty} × ${prod ? prod.name : ln.gtin} from ${U} ${port.pick.id} into the order tote`, 2); }
        }
        // the stock on its way: the unit nearest the station first
        const bins = [];
        for (const b of sim.binsWithRequests) if (b.requests.some((q) => q.lines.some((l) => l.order === o))) bins.push(b);
        for (const p of sim.ports) for (const q of p.inQ) if (q.bin.requests.some((r2) => r2.lines.some((l) => l.order === o)) || (p.job && p.pick === q.bin)) bins.includes(q.bin) || bins.push(q.bin);
        // a unit already moving first, then one a machine is coming for
        bins.sort((a, b) => (a.loc === 'grid') - (b.loc === 'grid'));
        for (const b of bins) { const f = this.binFocus(b); if (f) return Object.assign(f, { step: 1 }); }
        if (port) {
          const k = port.slots.indexOf(o), q = k >= 0 ? this.slotTote(port, k, o) : L.pickPos(port);
          if (sim.kind === 'amr') return at(q, q.z ?? this.CZ, `The order tote is staged at ${port.name}, waiting for a robot to take it round the aisles`, 1);
          const waiting = bins.find((b) => b.loc === 'grid');
          return at(q, q.z ?? this.CZ, waiting ? `${U} ${waiting.id} waits in storage for a ${(sim.terms.machine || 'machine').toLowerCase()}` : `The order tote waits on the put wall of ${port.name}`, 1);
        }
        return at(L.pickPos(sim.ports[0]), this.CZ, 'Released', 1);
      }
      case 'PICKED': case 'CONVEYOR': case 'TO_PACK': {
        const it = oms.conveyor.find((i) => i.kind === 'tote' && i.order === o);
        if (it) { const q = oms.posOnPath(it), pk = oms.packers[it.packer]; return at(q, q.z ?? 1.6, it.queued ? `The tote waits at ${pk.name}` : `The order tote rides the conveyor to ${pk.name}`, 3); }
        break;
      }
      case 'PACKING': {
        const pk = oms.packers.find((p) => p.cur === o);
        if (pk) { const q = L.packerPos(pk.idx); return at(q, 2.2, `${pk.name}: ${pk.kind === 'manual' ? 'packed by hand' : pk.kind === 'bagger' ? 'bagged by the auto-bagger' : 'boxed by the box-making machine'}, an SSCC label printed`, 3); }
        break;
      }
      case 'PACKED': {
        const it = oms.conveyor.find((i) => i.kind === 'parcel' && i.order === o);
        if (it) { const q = oms.posOnPath(it); return at(q, q.z ?? 1.6, `The parcel (SSCC ${o.sscc}) rides to the dock for ${o.carrier ? o.carrier.name : 'the truck'}`, 4); }
        break;
      }
      // loaded: the truck leaves when full or at its cut-off, so the camera moves on
      case 'LOADED': { const d = L.dock(); return Object.assign(at({ x: d.x + 2.5, y: d.y }, 2, `Loaded on truck ${oms.truck.id} (${oms.truck.carrier.name}), ${WS.U.fmtDur(sim.time - o.created)} after the order came in. The truck leaves when full or at its cut-off.`, 5), { done: true }); }
      case 'SHIPPED': { const d = L.dock(); return Object.assign(at({ x: d.x + 2.5, y: d.y }, 2, `Shipped: ${WS.U.fmtDur(o.times.shipped - o.created)} from order to truck`, 5), { done: true }); }
    }
    const d = L.dock();
    return at({ x: d.x, y: d.y }, 2, o.status, step);
  };

  // ---------------------------------------------------------------- camera
  // Keep the subject in the middle, a few metres off, slowly circling it.
  // Returns false: the orbit camera draws from tx / ty / tz.
  V.followCamera = function (dt) {
    const cam = this.cam, F = this.follow;
    if (!F || (!F.order && !F.parcel)) { const t = this.pickFollow(); if (t) this.follow = t; else return false; }
    const f = this.follow.order ? this.orderFocus(this.follow.order) : this.parcelFocus(this.follow.parcel);
    this.followNow = f;
    if (f.done) {
      // shipped (or sorted): stay a moment, then the next one
      this.follow.doneAt = this.follow.doneAt || this.t;
      if (this.t - this.follow.doneAt > 5) {
        const t = this.pickFollow(this.follow.order || this.follow.parcel);
        if (t) { this.follow = t; return this.followCamera(dt); }
      }
    }
    const k = Math.min(1, dt * 2.2), z = f.z ?? this.robotZ;
    if (!this.follow.seen) { this.follow.seen = true; Object.assign(cam, { tx: f.x, ty: f.y, tz: z }); }
    cam.tx += (f.x - cam.tx) * k; cam.ty += (f.y - cam.ty) * k; cam.tz += (z - cam.tz) * k;
    cam.dist += (Math.max(7, 9 / Math.max(0.6, this.sim.cfg.cellSize || 1)) - cam.dist) * Math.min(1, dt * 1.5);
    // down into the aisles for things on the floor, more from the side up in the racking
    cam.pitch += ((z > 3 ? 0.4 : 0.85) - cam.pitch) * Math.min(1, dt * 1.5);
    cam.yaw += dt * 0.07;
    this.hud(true);
    return false;
  };

  // ---------------------------------------------------------------- the panel
  V.hud = function (show) {
    let el = this.hudEl;
    if (!el) {
      el = this.hudEl = document.createElement('div');
      el.className = 'follow-hud'; el.id = 'follow-hud';
      document.getElementById('iso-wrap').appendChild(el);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-fh]');
        if (!b) return;
        if (b.dataset.fh === 'next') this.nextSubject(); else this.setCamMode('free');
      });
    }
    const on = show && this.cam.mode === 'order';
    el.classList.toggle('on', on);
    if (!on || !this.follow || (this.t - (this.hudAt || 0) < 0.25 && this.hudKey === this.followKey())) return;
    this.hudAt = this.t;
    const html = this.hudHTML();
    if (html !== this.hudLast) { el.innerHTML = html; this.hudLast = html; }
    this.hudKey = this.followKey();
  };
  V.followKey = function () { const F = this.follow; return F ? (F.order ? F.order.id : F.parcel.id) : ''; };
  V.hudHTML = function () {
    const F = this.follow, f = this.followNow || { step: 0, text: '' }, parcel = !F.order;
    const steps = parcel ? PARCEL_STEPS : this.followSteps || STEPS;
    const chips = steps.map((s, k) => `<span class="${k < f.step || f.done ? 'done' : k === f.step ? 'now' : ''}">${s}</span>`).join('<i></i>');
    let head, meta;
    if (parcel) {
      const pc = F.parcel;
      head = `Parcel ${pc.id}`; meta = `to ${esc(pc.noRead ? 'reject (label unreadable)' : pc.dest.name)} · SSCC ${pc.sscc}`;
    } else {
      const o = F.order, units = o.lines.reduce((s, l) => s + l.qty, 0), picked = o.lines.reduce((s, l) => s + l.picked, 0);
      head = o.id; meta = `${esc(o.customer)} · ${esc(o.city)} · ${o.lines.length} line${o.lines.length > 1 ? 's' : ''}, ${picked}/${units} units picked`;
    }
    return `<div class="fh-top"><b>${head}</b><button data-fh="next" title="Follow another (N)">Next</button><button data-fh="stop" title="Stop following">×</button></div>
      <div class="fh-meta">${meta}</div><div class="fh-steps">${chips}</div><div class="fh-text">${esc(f.text)}</div>`;
  };
  // a pin over the subject, also with labels off
  const drawLabelLayer = V.drawLabelLayer;
  V.drawLabelLayer = function () {
    drawLabelLayer.call(this);
    const f = this.followNow;
    if (this.cam.mode !== 'order' || !f || !this.follow) return;
    this.label('▼ ' + (this.follow.order ? this.follow.order.id : 'parcel ' + this.follow.parcel.id), f.x, f.y, (f.z ?? this.robotZ) + 2.6, { size: 11, weight: 800, color: '#0f172a', bg: 'rgba(250,204,21,0.92)' });
  };
})((globalThis.WS = globalThis.WS || {}));
