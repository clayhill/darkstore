/* LayerLift defaults: beverage distribution by layer picking (specs/layer.txt).
 * Gantry robots over a row of pallet flow lanes, one product each, lift
 * whole layers onto customers' pallets; what is short of a full layer is
 * picked by hand at a top-off station. Lengths in metres; one cell a metre. */
(function (WS) {
  'use strict';
  WS.LAYER_CONFIG = Object.assign({}, WS.BASE_CONFIG, {
    cellSize: 1, // m: positions are in metres
    dayStart: 6 * 3600, // the simulation starts at 06:00

    // The pick field
    lanes: 24, // pallet flow lanes, one product each
    laneDepth: 3, // pallets in a lane: the one picked from and those waiting behind it
    buildSpots: 8, // places along the field where customers' pallets are built
    magCap: 16, // empty pallets a magazine holds
    palletIn: 10, // s for an empty pallet to roll in from the dispenser under a build place

    // Gantries
    gantries: 2, // on one runway (1 or 2)
    gantryV: 2.0, gantryA: 0.5, // m/s, m/s² — the bridge along the runway
    trolleyV: 1.0, trolleyA: 0.6, // the trolley across it
    hoistV: 0.8, hoistA: 0.8, // the head up and down
    gripTime: 3.5, releaseTime: 2.5, // s: clamps in and vacuum on (with a check of the layer), and off

    // Orders
    orderRate: 12, // customer orders an hour
    linesPerOrder: [4, 10], // products in an order
    palletLoad: 1.8, palletKg: 1000, // m and kg a customer's pallet takes, not counting the pallet

    // Top-off, wrapping, trucks
    caseTime: 6, // s a person needs to put one case on a pallet at the top-off station
    wrapTime: 35, labelTime: 6,
    doors: 2, truckPallets: 22, cutoff: 20, // route trucks: pallets, minutes after the first pallet they leave anyway

    // Replenishment
    forklifts: 1,

    products: 0, robots: 0, chargers: 0, autoOrders: false, autoReplenish: false, toteCount: 0, packStations: 0, // (the shared order flow is not used)
  });
})((globalThis.WS = globalThis.WS || {}));
