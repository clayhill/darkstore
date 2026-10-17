// Headless simulation test: node test/run.js [hours] [seed]
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const files = ['js/core/util.js', 'js/core/barcode.js', 'js/core/config.js', 'js/sim/grid.js', 'js/sim/inventory.js', 'js/sim/router.js', 'js/sim/robot.js', 'js/sim/ports.js', 'js/sim/orders.js', 'js/sim/kpi.js', 'js/sim/sim.js'];
for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
const WS = globalThis.WS;
const hours = +(process.argv[2] || 1), seed = +(process.argv[3] || 7);
const sim = new WS.Sim({ seed });
const g = sim.grid;
function check() {
  // single occupancy: each robot's current cell claimed by itself, no two robots on same cell
  const seen = new Map();
  for (const r of sim.robots) {
    const i = g.idx(r.x, r.y);
    if (g.claim[i] !== r.id) throw new Error(`t=${sim.time.toFixed(1)} ${r.name} cell not claimed by itself (claim=${g.claim[i]})`);
    if (seen.has(i)) throw new Error('two robots on cell ' + i);
    seen.set(i, r.id);
    for (const c of r.claims) if (g.claim[c] !== r.id) throw new Error(`${r.name} claim set mismatch`);
  }
  // inventory: every grid bin exactly once in stacks, stack heights <= Z
  let n = 0;
  for (let i = 0; i < g.stacks.length; i++) {
    if (g.stacks[i].length > g.Z) throw new Error('overfull column ' + i);
    for (const id of g.stacks[i]) { const b = sim.inv.binById.get(id); if (b.loc !== 'grid' || g.idx(b.x, b.y) !== i) throw new Error('bin loc mismatch ' + id); n++; }
  }
  const inGrid = sim.inv.bins.filter((b) => b.loc === 'grid').length;
  if (n !== inGrid) throw new Error('grid bin count mismatch');
  for (const p of sim.inv.products) {
    let oh = 0, res = 0;
    for (const b of sim.inv.bins) for (const c of b.comps) if (c.gtin === p.gtin) { oh += c.qty; res += c.reserved; if (c.qty < 0 || c.reserved < 0) throw new Error('negative comp ' + b.id); }
    if (oh !== p.onHand || res !== p.reserved) throw new Error(`stock mismatch ${p.gtin} oh ${oh}/${p.onHand} res ${res}/${p.reserved}`);
  }
}
const t0 = Date.now();
const total = hours * 3600 / sim.cfg.tick;
for (let k = 0; k < total; k++) {
  sim.tick();
  if (k % 600 === 0) check();
  if (k % 36000 === 0 && k) {
    const u = sim.kpi.utilization(true);
    console.log(`t=${WS.U.fmtClock(sim.time)} bins/h ${sim.kpi.rate('presented').toFixed(0)} lines/h ${sim.kpi.rate('lines').toFixed(0)} shipped ${sim.kpi.ordersShipped} open ${sim.oms.orders.filter(o=>o.status!=='SHIPPED').length} util ${(u.work*100).toFixed(0)}% wait ${(u.wait*100).toFixed(0)}% dig ${sim.kpi.digRatio.toFixed(2)} tasks ${sim.tasks.length} backorder ${sim.oms.orders.filter(o=>o.status==='BACKORDER').length}`);
  }
}
check();
const st = {}; for (const o of sim.oms.orders) st[o.status] = (st[o.status] || 0) + 1;
console.log('order statuses', st);
console.log('robots', sim.robots.map((r) => `${r.name}:${r.displayState}:${r.battery.toFixed(0)}%`).join(' '));
console.log('router replans', sim.router.replans, 'evasions', sim.router.evasions, 'yields', sim.router.yields, 'restacks', sim.kpi.restacks, 'penalties', sim.kpi.penaltyEvents);
console.log('receipts', sim.oms.receipts.map(r=>r.status).reduce((a,s)=>(a[s]=(a[s]||0)+1,a),{}));
console.log('alerts', sim.kpi.alerts.map(a=>a.title+': '+a.msg));
console.log('wall time', (Date.now() - t0) / 1000, 's');
