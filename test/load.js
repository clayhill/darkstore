// Loads the simulation scripts (no rendering or UI) into this Node process and
// returns the WS namespace with the simulation class of each storage type.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const files = ['js/core/util.js', 'js/core/barcode.js', 'js/core/config.js', 'js/sim/inventory.js', 'js/sim/router.js', 'js/sim/mover.js', 'js/sim/robot.js', 'js/sim/ports.js', 'js/sim/orders.js', 'js/sim/kpi.js', 'js/sim/disrupt.js', 'js/sim/sim.js', 'js/sim/floor.js', 'js/sim/machine.js', 'js/sim/rack.js', 'js/sim/prezone.js',
  'js/cube/config.js', 'js/cube/grid.js', 'js/cube/tasks.js', 'js/cube/sim.js', 'js/pod/config.js', 'js/pod/floor.js', 'js/pod/sim.js',
  'js/shuttle/config.js', 'js/shuttle/sim.js', 'js/crane/config.js', 'js/crane/sim.js', 'js/acr/config.js', 'js/acr/sim.js', 'js/amr/config.js', 'js/amr/floor.js', 'js/amr/sim.js', 'js/sort/config.js', 'js/sort/sim.js', 'js/pallet/config.js', 'js/pallet/sim.js', 'js/climb/config.js', 'js/climb/sim.js'];
for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
const WS = globalThis.WS;
WS.SIMS = { cube: WS.CubeSim, pod: WS.PodSim, shuttle: WS.ShuttleSim, crane: WS.CraneSim, acr: WS.AcrSim, amr: WS.AmrSim, sort: WS.SortSim, pallet: WS.PalletSim, climb: WS.ClimbSim };
module.exports = WS;
