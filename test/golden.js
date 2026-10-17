// Regression check: runs every storage type for a fixed time and seed and
// compares a fingerprint of the run with test/golden/<kind>.txt. A refactor
// that should not change behaviour must leave these files byte-identical.
//   node test/golden.js            check all types
//   node test/golden.js pod        check one type
//   node test/golden.js --update   rewrite the golden files after an intended change
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const HOURS = 2, SEED = 7, EVERY = 1800; // s between fingerprints
const dir = path.join(__dirname, 'golden');

// Child mode: run one type and print its fingerprint lines.
if (process.argv[2] === '--one') {
  const WS = require('./load'), kind = process.argv[3];
  const sim = new WS.SIMS[kind]({ seed: SEED });
  const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return (h >>> 0).toString(16).padStart(8, '0'); };
  const num = (v) => Math.round(v * 1000) / 1000;
  const counters = () => Object.entries(sim.kpi).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k}=${num(v)}`).join(' ');
  const stock = () => sim.inv.bins.map((b) => [b.id, b.loc, num(b.x || 0), num(b.y || 0), b.comps.map((c) => `${c.gtin}:${c.qty}:${c.reserved}`).join(',')].join('|')).join('\n');
  const fleet = () => sim.fleet.map((r) => [r.name, r.displayState, num(r.x), num(r.y), r.battery == null ? "-" : num(r.battery), r.tasksDone, r.bin || ''].join('|')).join('\n');
  const orders = () => { const st = {}; for (const o of sim.oms.orders) st[o.status] = (st[o.status] || 0) + 1; return Object.keys(st).sort().map((k) => `${k}:${st[k]}`).join(' '); };
  const steps = HOURS * 3600 / sim.cfg.tick, every = EVERY / sim.cfg.tick;
  for (let k = 1; k <= steps; k++) {
    sim.tick();
    if (k % every) continue;
    console.log(`t=${WS.U.fmtClock(sim.time)} stock ${hash(stock())} fleet ${hash(fleet())} tasks ${sim.tasks.length} orders ${orders()}`);
    console.log(`  ${counters()}`);
  }
  process.exit(0);
}

const update = process.argv.includes('--update');
const kinds = process.argv.slice(2).filter((a) => !a.startsWith('--'));
let failed = 0;
for (const kind of kinds.length ? kinds : ['cube', 'pod', 'shuttle', 'crane']) {
  const t0 = Date.now();
  const out = execFileSync(process.execPath, [__filename, '--one', kind], { encoding: 'utf8' });
  const file = path.join(dir, kind + '.txt'), secs = ((Date.now() - t0) / 1000).toFixed(1) + ' s';
  if (update || !fs.existsSync(file)) { fs.writeFileSync(file, out); console.log(`${kind}: written (${secs})`); continue; }
  const want = fs.readFileSync(file, 'utf8');
  if (out === want) { console.log(`${kind}: ok (${secs})`); continue; }
  failed++;
  const a = want.split('\n'), b = out.split('\n'), i = a.findIndex((l, k) => l !== b[k]);
  console.log(`${kind}: DIFFERS from line ${i + 1}\n  golden: ${a[i]}\n  now:    ${b[i]}`);
}
process.exit(failed ? 1 : 0);
