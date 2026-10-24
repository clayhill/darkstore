/* CaseCraft defaults: a distribution centre that turns single-product
 * pallets into mixed store pallets, case by case (specs/case.txt). Robot
 * arms depalletise, case bots store the cases in a dense structure of many
 * levels, lifts bring them down in sequence and robot arms build stable
 * mixed pallets. Lengths in metres; one cell is a metre. */
(function (WS) {
  'use strict';
  WS.CASE_CONFIG = Object.assign({}, WS.BASE_CONFIG, {
    cellSize: 1, // m: positions are in metres
    dayStart: 6 * 3600, // the simulation starts at 06:00

    // The structure
    aisles: 16, aisleLength: 12, // aisles, m long
    levels: 14, levelHeight: 0.72, baseHeight: 0.9, // levels, m apart, the first this high
    botsPerLevel: 3,
    storagePolicy: 'bestfit', // 'bestfit' | 'nearest'
    stockFill: 0.62, // share of the shelf length filled at the start

    // Case bots
    vDeck: 6, vAisle: 5, botAccel: 4, // m/s, m/s²
    turnTime: 0.6, // s for a quarter turn
    transferTime: 2.2, // s to put a case on a shelf or take one off

    // Lifts
    inLifts: 3, // output lifts: one per palletising cell
    liftV: 5, liftA: 5, liftCap: 3, // m/s, m/s², cases on the carriage
    seqWindow: 24, // cases a palletiser releases ahead of the one its lift brings down next
    liftShelf: 0.9, liftLoad: 0.8, liftUnload: 0.6, // s per case: to or from a transfer shelf, loading at the bottom, onto the conveyor

    // Depalletising
    depalCells: 3, depalTime: 2.6, // s per case
    truckEvery: 30, truckPallets: 22, // min between inbound trucks, pallets on one
    coverHours: 3, // a product is reordered below this many hours of its demand

    // Store orders and palletising
    stores: 24,
    orderRate: 9, // store orders an hour
    orderCases: 250, // cases in an order, on average
    skus: 150, // products stocked
    palletCells: 3, palletTime: 3.4, palletIn: 8, // s per case, s for a new pallet to come in
    buildPolicy: 'blend', // 'blend' | 'stable' | 'aisle'
    palletHeight: 1.6, palletWeight: 800, // m of load, kg
    wrapTime: 35, labelTime: 6,
    doors: 3, // outbound doors, a store's truck at each

    products: 0, robots: 0, chargers: 0, autoOrders: false, autoReplenish: false, toteCount: 0, packStations: 0, // (the shared order flow is not used)
  });
})((globalThis.WS = globalThis.WS || {}));
