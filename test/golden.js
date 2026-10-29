// Regression check: runs every storage type for a fixed time and seed and
// compares a fingerprint of the run with test/golden/<kind>.txt. A refactor
// that should not change behaviour must leave these files byte-identical.
// Besides the defaults, a few runs cover settings the defaults leave unused.
//   node test/golden.js            check every run
//   node test/golden.js pod        check one run (a type or a variant name)
//   node test/golden.js --update   rewrite the golden files after an intended change
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const HOURS = 2, SEED = 7, EVERY = 1800; // s between fingerprints
const dir = path.join(__dirname, 'golden');
// run name → [storage type, settings on top of its defaults]
const RUNS = {
  cube: ['cube', {}], 'cube-arm': ['cube', { armStations: 2, armExceptions: 'route' }], 'cube-nearest': ['cube', { putawayPolicy: 'nearest' }],
  pod: ['pod', {}], 'pod-packing': ['pod', { packBaggers: 1, packBoxers: 1 }], 'pod-single': ['pod', { stationPoints: 1 }], 'pod-notunnel': ['pod', { tunnelling: 'off' }],
  shuttle: ['shuttle', {}], 'shuttle-decant': ['shuttle', { autoDecant: 1 }], 'shuttle-robots': ['shuttle', { transport: 'robots' }],
  crane: ['crane', {}], 'crane-single': ['crane', { handlerSlots: 1 }], 'crane-robots': ['crane', { transport: 'robots' }],
  acr: ['acr', {}], 'acr-oneway': ['acr', { aisleMode: 'oneway' }],
  sort: ['sort', {}], 'sort-tray': ['sort', { mechanism: 'tray' }],
  amr: ['amr', {}], 'amr-nozones': ['amr', { zonePicking: 'off' }],
  climb: ['climb', {}],
  pallet: ['pallet', {}], 'pallet-small': ['pallet', { palletVolume: 25 }],
  zone: ['zone', {}],
  tower: ['tower', {}], 'tower-lifts': ['tower', { linkType: 'lift' }],
  park: ['park', {}], 'park-stay': ['park', { placement: 'stay' }],
  pocket: ['pocket', {}], 'pocket-noreturns': ['pocket', { returnRate: 0 }],
  case: ['case', {}], 'case-aisle': ['case', { buildPolicy: 'aisle', storagePolicy: 'nearest' }],
  layer: ['layer', {}], 'layer-one': ['layer', { gantries: 1, orderRate: 8 }], tube: ['tube', {}], 'tube-sender': ['tube', { carrierPolicy: 'sender' }],
};

// Child mode: run one type and print its fingerprint lines.
if (process.argv[2] === '--one') {
  const WS = require('./load'), [kind, cfg] = RUNS[process.argv[3]];
  const sim = new WS.SIMS[kind](Object.assign({ seed: SEED }, cfg));
  const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return (h >>> 0).toString(16).padStart(8, '0'); };
  const num = (v) => Math.round(v * 1000) / 1000;
  const counters = () => Object.entries(sim.kpi).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k}=${num(v)}`).join(' ');
  // a type without stock adds its own (RoboValet: every car and where it is)
  const stock = () => sim.inv.bins.map((b) => [b.id, b.loc, num(b.x || 0), num(b.y || 0), b.comps.map((c) => `${c.gtin}:${c.qty}:${c.reserved}`).join(',')].join('|')).join('\n') + (sim.fingerprint ? '\n' + sim.fingerprint() : '');
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
for (const kind of kinds.length ? kinds : Object.keys(RUNS)) {
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
