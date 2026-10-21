// Headless simulation test: node test/run.js [hours] [seed] [cube|pod|shuttle|crane|acr|amr|sort|pallet|climb|zone] [settings as JSON]
const WS = require('./load');
const hours = +(process.argv[2] || 1), seed = +(process.argv[3] || 7), kind = process.argv[4] || 'cube';
const sim = new WS.SIMS[kind](Object.assign({ seed }, JSON.parse(process.argv[5] || '{}')));
const g = sim.grid;
function check() {
  // single occupancy: each robot's current cell claimed by itself, no two robots on same cell
  const seen = new Map();
  for (const r of sim.fleet.filter((x) => x.claims)) {
    const i = g.idx(r.x, r.y);
    if (g.claim[i] !== r.id) throw new Error(`t=${sim.time.toFixed(1)} ${r.name} cell not claimed by itself (claim=${g.claim[i]})`);
    if (seen.has(i)) throw new Error('two robots on cell ' + i);
    seen.set(i, r.id);
    for (const c of r.claims) if (g.claim[c] !== r.id) throw new Error(`${r.name} claim set mismatch`);
  }
  if (kind === 'pod') checkPods(); else if (kind === 'amr') checkShelves(); else if (kind === 'sort') return checkSorter(); else if (kind === 'zone') checkZone(); else if (kind === 'shuttle' || kind === 'crane' || kind === 'acr' || kind === 'pallet' || kind === 'climb') checkRacking(); else checkStacks();
  for (const p of sim.inv.products) {
    let oh = 0, res = 0;
    for (const b of sim.inv.bins) for (const c of b.comps) if (c.gtin === p.gtin) { oh += c.qty; res += c.reserved; if (c.qty < 0 || c.reserved < 0) throw new Error('negative comp ' + b.id); }
    if (oh !== p.onHand || res !== p.reserved) throw new Error(`stock mismatch ${p.gtin} oh ${oh}/${p.onHand} res ${res}/${p.reserved}`);
  }
}
// racking types: every tote in exactly one place — a rack slot, a shuttle,
// a buffer, the lift, the crane, a robot, the conveyor, a queue or a station
function checkRacking() {
  const where = new Map(), put = (id, w) => { if (where.has(id)) throw new Error(`${id} in ${where.get(id)} and ${w}`); where.set(id, w); };
  for (const a of sim.aisles) {
    a.slot.forEach((id, i) => { if (id) put(id, 'slot'); });
    if (a.inQ) a.inQ.forEach((it) => { if (!it.conv) put(it.bin.id, 'inQ'); }); // a queued tote still on the conveyor counts there
    if (a.crane) { a.crane.load.forEach((id) => put(id, a.crane.name)); continue; }
    if (!a.shuttles) continue;
    a.outBuf.forEach((q) => q.forEach((it) => put(it.bin.id, 'outBuf')));
    a.inBuf.forEach((q) => q.forEach((it) => put(it.bin.id, 'inBuf')));
    for (const r of [...a.shuttles, a.lift]) if (r.bin) put(r.bin, r.name);
  }
  sim.conv.forEach((it) => put(it.bin.id, 'conveyor'));
  // totes on the conveyors never overlap
  const T = sim.convTote(), at = sim.conv.map((it) => sim.convAt(it));
  at.forEach((p, i) => at.forEach((q, j) => {
    if (j > i && Math.abs(p.x - q.x) < 2 * T.w - 1e-6 && Math.abs(p.y - q.y) < 2 * T.d - 1e-6) throw new Error(`t=${sim.time.toFixed(1)} totes ${sim.conv[i].bin.id} and ${sim.conv[j].bin.id} overlap at ${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  }));
  if (kind === 'acr' || kind === 'climb') {
    // a climbing robot holds the tote while it presents it: counted at the station
    for (const r of sim.fleet) r.load.forEach((id) => { if (kind !== 'climb' || sim.inv.binById.get(id).loc !== 'port') put(id, r.name); });
    for (const p of sim.ports) p.back.forEach((b) => { if (!b.conv) put(b.id, p.code + ' return'); }); // still on the return conveyor: counted there
  }
  if (sim.bots) {
    // transport robots: one tote on the deck; a tote at the end of a station's outfeed is still on the conveyor
    for (const r of sim.bots.robots) {
      if (r.bin) put(r.bin, r.name);
      const t = g.type[g.idx(r.x, r.y)];
      if (t === WS.CELL.BLOCKED || t === WS.CELL.STAND) throw new Error(`t=${sim.time.toFixed(1)} ${r.name} on a cell robots do not drive on (${r.x},${r.y})`);
    }
    for (const p of sim.ports) p.back.forEach((b) => { if (!b.conv) put(b.id, p.code + ' outfeed'); });
  }
  for (const p of sim.ports) { p.inQ.forEach((q) => put(q.bin.id, p.code)); if (p.pick) put(p.pick.id, p.code); p.outQ.forEach((b) => put(b.id, p.code)); }
  if (kind === 'pallet') { checkLanes(); for (const b of sim.inv.bins) if (b.loc === 'dock') put(b.id, 'dock'); }
  for (const b of sim.inv.bins) {
    if (!where.has(b.id)) throw new Error(`tote ${b.id} (${b.loc}) is nowhere`);
    if (b.loc === 'grid' && where.get(b.id) !== 'slot') throw new Error(`${b.id} loc grid but in ${where.get(b.id)}`);
    if (b.loc === 'grid' && sim.aisles[b.aisle].slot[sim.si(b.level, b.side, b.bay, b.depth)] !== b.id) throw new Error('slot mismatch ' + b.id);
  }
}
// pallet lanes: filled from the back without gaps, one SKU per lane
function checkLanes() {
  const DN = sim.cfg.laneDepth;
  for (const a of sim.aisles) for (let l = 0; l < sim.cfg.levels; l++) for (let s = 0; s < 2; s++) for (let b = 0; b < g.SB; b++) {
    let gtin = null, seen = false;
    for (let d = 0; d < DN; d++) {
      const id = a.slot[sim.si(l, s, b, d)];
      if (!id) { if (seen) throw new Error(`t=${sim.time.toFixed(1)} gap in lane ${a.a}.${l}.${s}.${b} at ${d}`); continue; }
      seen = true;
      const gt = sim.inv.binById.get(id).comps[0].gtin;
      if (gtin && gt && gt !== gtin) throw new Error(`two SKUs in lane ${a.a}.${l}.${s}.${b}`);
      gtin = gtin || gt;
    }
  }
}
// pods: every stored pod on exactly one cell, every other pod on a robot
function checkPods() {
  let n = 0;
  for (let i = 0; i < g.podAt.length; i++) {
    const id = g.podAt[i]; if (!id) continue;
    const b = sim.inv.binById.get(id);
    if (b.loc !== 'grid' || g.idx(b.x, b.y) !== i) throw new Error('pod loc mismatch ' + id);
    if (g.type[i] !== WS.CELL.STORAGE) throw new Error('pod on non-storage cell ' + id);
    n++;
  }
  for (const b of sim.inv.bins) {
    if (b.loc === 'grid') { n--; continue; }
    const r = sim.fleet.find((x) => x.bin === b.id);
    if (!r) throw new Error(`pod ${b.id} (${b.loc}) not carried by any robot`);
  }
  if (n !== 0) throw new Error('pod count mismatch');
}
// sorter: every parcel that arrived is in exactly one place (inbound dock,
// a feed belt, an induct, a tray or robot, or sorted into a chute), and no
// bag holds more than it can
function checkSorter() {
  const ind = sim.ports.reduce((n, p) => n + p.queue.length + (p.cur ? 1 : 0) + (p.ready ? 1 : 0), 0);
  const moving = sim.trays.filter((t) => t.parcel).length + sim.fleet.filter((r) => r.parcel).length;
  const n = sim.backlog.length + ind + moving + sim.stats.sorted;
  if (n !== sim.stats.arrived) throw new Error(`t=${sim.time.toFixed(1)} parcels: ${n} accounted for, ${sim.stats.arrived} arrived`);
  for (const ch of sim.chutes) if (ch.count > sim.cfg.bagCapacity) throw new Error(`${ch.name} holds ${ch.count}`);
  for (const r of sim.fleet.filter((x) => x.claims)) if (g.claim[g.idx(r.x, r.y)] !== r.id) throw new Error(`${r.name} cell not claimed`);
}
// ZoneHop: every tote in exactly one place (the de-stacker's stack, a belt,
// the merge, an RF picker's cart, a van or the return dock); totes on a belt
// keep their distance; a zone works only a tote at its pick position; no
// order line gets more units than ordered
function checkZone() {
  const where = new Map(), put = (t, w) => { if (where.has(t)) throw new Error(`t=${sim.time.toFixed(1)} tote ${t.id} in ${where.get(t)} and ${w}`); where.set(t, w); };
  sim.oms.freeTotes.forEach((t) => put(t, 'stack'));
  for (const b of sim.net.belts) b.totes.forEach((t, k) => {
    put(t, b.name);
    if (t.belt !== b) throw new Error(`${t.id} on ${b.name} thinks it is on ${t.belt && t.belt.name}`);
    if (k && b.totes[k - 1].s - t.s < sim.net.pitch - 1e-6) throw new Error(`t=${sim.time.toFixed(1)} totes ${b.totes[k - 1].id} and ${t.id} too close on ${b.name}`);
    if (t.s < -1e-9 || t.s > b.len + 1e-9) throw new Error(`${t.id} off the end of ${b.name}`);
  });
  sim.merge.totes.forEach((t) => put(t, 'merge')); sim.merge.rf.forEach((t) => put(t, 'merge RF'));
  for (const pk of sim.pickers) if (pk.job) pk.job.totes.slice(pk.job.put).forEach((t) => put(t, pk.name));
  for (const v of sim.vansOut) v.totes.forEach((t) => put(t, 'van ' + v.route.name));
  sim.lanes.forEach((l) => l.stack.forEach((t) => put(t, 'lane ' + l.route.name)));
  sim.returnDock.forEach((t) => put(t, 'return dock')); sim.recycling.forEach((r) => put(r.t, 'recycling'));
  for (const t of sim.oms.totes) if (!where.has(t)) throw new Error(`t=${sim.time.toFixed(1)} tote ${t.id} (${t.at}) is nowhere`);
  if (where.size !== sim.oms.totes.length) throw new Error('tote count');
  for (const z of sim.zones) if (z.job && z.in.front !== z.job.tote) throw new Error(`${z.id} works a tote that is not at its pick position`);
  for (const o of sim.oms.orders) for (const l of o.lines) if (l.picked > l.qty) throw new Error(`${o.id} ${l.gtin} picked ${l.picked} of ${l.qty}`);
}
// shelving: locations never move; every released order tote is staged at
// exactly one station or rides on exactly one robot; no robot waits for ever
function checkShelves() {
  for (const b of sim.inv.bins) if (b.loc !== 'grid' || g.binAt[g.idx(b.x, b.y)] !== b.id) throw new Error('location moved ' + b.id);
  const at = new Map(), put = (o, w) => { if (at.has(o)) throw new Error(`${o.id} at ${at.get(o)} and ${w}`); at.set(o, w); };
  for (const p of sim.ports) p.slots.forEach((o) => o && put(o, p.code));
  for (const r of sim.fleet) { if (r.totes.length > sim.cfg.robotTotes) throw new Error(r.name + ' overloaded'); r.totes.forEach((o) => put(o, r.name)); }
  for (const o of sim.oms.orders) if (['RELEASED', 'PICKING', 'PICKED'].includes(o.status) && !at.has(o)) throw new Error(`${o.id} (${o.status}) nowhere`);
  for (const st of sim.stops) if (st.arrived && sim.time - st.since > 900) throw new Error(`${st.robot.name} waiting for a picker since ${st.since.toFixed(0)}`);
}
// cube: every grid bin exactly once in stacks, stack heights <= Z
function checkStacks() {
  let n = 0;
  for (let i = 0; i < g.stacks.length; i++) {
    if (g.stacks[i].length > g.Z) throw new Error('overfull column ' + i);
    for (const id of g.stacks[i]) { const b = sim.inv.binById.get(id); if (b.loc !== 'grid' || g.idx(b.x, b.y) !== i) throw new Error('bin loc mismatch ' + id); n++; }
  }
  const inGrid = sim.inv.bins.filter((b) => b.loc === 'grid').length;
  if (n !== inGrid) throw new Error('grid bin count mismatch');
}
const t0 = Date.now();
const total = hours * 3600 / sim.cfg.tick;
for (let k = 0; k < total; k++) {
  sim.tick();
  if (k % 600 === 0) check();
  if (k % 36000 === 0 && k) {
    const u = sim.kpi.utilization(true);
    console.log(`t=${WS.U.fmtClock(sim.time)} bins/h ${sim.kpi.rate('presented').toFixed(0)} lines/h ${sim.kpi.rate('lines').toFixed(0)} shipped ${sim.kpi.ordersShipped} open ${sim.oms.orders.filter(o=>o.status!=='SHIPPED').length} util ${(u.work*100).toFixed(0)}% wait ${(u.wait*100).toFixed(0)}% dig ${sim.kpi.digRatio.toFixed(2)} hit ${(sim.kpi.linesPicked / (sim.kpi.presentedPick || 1)).toFixed(2)} tasks ${sim.tasks.length} backorder ${sim.oms.orders.filter(o=>o.status==='BACKORDER').length}`);
  }
}
check();
const st = {}; for (const o of sim.oms.orders) st[o.status] = (st[o.status] || 0) + 1;
console.log('order statuses', st);
console.log("fleet", sim.fleet.map((r) => `${r.name}:${r.displayState}${r.battery == null ? "" : ":" + r.battery.toFixed(0) + "%"}`).join(' '));
console.log('router replans', sim.router.replans, 'evasions', sim.router.evasions, 'yields', sim.router.yields, 'restacks', sim.kpi.restacks, 'penalties', sim.kpi.penaltyEvents);
console.log('receipts', sim.oms.receipts.map(r=>r.status).reduce((a,s)=>(a[s]=(a[s]||0)+1,a),{}));
console.log('alerts', sim.kpi.alerts.map(a=>a.title+': '+a.msg));
console.log('wall time', (Date.now() - t0) / 1000, 's');
