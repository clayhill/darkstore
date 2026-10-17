// Headless simulation test: node test/run.js [hours] [seed] [cube|pod|shuttle]
const WS = require('./load');
const hours = +(process.argv[2] || 1), seed = +(process.argv[3] || 7), kind = process.argv[4] || 'cube';
const sim = new WS.SIMS[kind]({ seed });
const g = sim.grid;
function check() {
  // single occupancy: each robot's current cell claimed by itself, no two robots on same cell
  const seen = new Map();
  for (const r of kind === 'shuttle' ? [] : sim.fleet) {
    const i = g.idx(r.x, r.y);
    if (g.claim[i] !== r.id) throw new Error(`t=${sim.time.toFixed(1)} ${r.name} cell not claimed by itself (claim=${g.claim[i]})`);
    if (seen.has(i)) throw new Error('two robots on cell ' + i);
    seen.set(i, r.id);
    for (const c of r.claims) if (g.claim[c] !== r.id) throw new Error(`${r.name} claim set mismatch`);
  }
  if (kind === 'pod') checkPods(); else if (kind === 'shuttle') checkRacking(); else checkStacks();
  for (const p of sim.inv.products) {
    let oh = 0, res = 0;
    for (const b of sim.inv.bins) for (const c of b.comps) if (c.gtin === p.gtin) { oh += c.qty; res += c.reserved; if (c.qty < 0 || c.reserved < 0) throw new Error('negative comp ' + b.id); }
    if (oh !== p.onHand || res !== p.reserved) throw new Error(`stock mismatch ${p.gtin} oh ${oh}/${p.onHand} res ${res}/${p.reserved}`);
  }
}
// shuttle: every tote in exactly one place — a rack slot, a shuttle, a buffer,
// the lift, the conveyor, an aisle's queue or a station
function checkRacking() {
  const where = new Map(), put = (id, w) => { if (where.has(id)) throw new Error(`${id} in ${where.get(id)} and ${w}`); where.set(id, w); };
  for (const a of sim.aisles) {
    a.slot.forEach((id, i) => { if (id) put(id, 'slot'); });
    a.outBuf.forEach((q) => q.forEach((it) => put(it.bin.id, 'outBuf')));
    a.inBuf.forEach((q) => q.forEach((it) => put(it.bin.id, 'inBuf')));
    a.inQ.forEach((it) => put(it.bin.id, 'inQ'));
    for (const r of [...a.shuttles, a.lift]) if (r.bin) put(r.bin, r.name);
  }
  sim.conv.forEach((it) => put(it.bin.id, 'conveyor'));
  for (const p of sim.ports) { p.inQ.forEach((q) => put(q.bin.id, p.code)); if (p.pick) put(p.pick.id, p.code); p.outQ.forEach((b) => put(b.id, p.code)); }
  for (const b of sim.inv.bins) {
    if (!where.has(b.id)) throw new Error(`tote ${b.id} (${b.loc}) is nowhere`);
    if (b.loc === 'grid' && where.get(b.id) !== 'slot') throw new Error(`${b.id} loc grid but in ${where.get(b.id)}`);
    if (b.loc === 'grid' && sim.aisles[b.aisle].slot[sim.si(b.level, b.side, b.bay)] !== b.id) throw new Error('slot mismatch ' + b.id);
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
