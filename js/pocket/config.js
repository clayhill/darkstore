/* PocketFlow defaults: fashion e-commerce through an overhead pocket sorter
 * (specs/pocket.txt). Picked items and inspected returns are loaded one by
 * one into pockets hanging from an overhead rail; the pockets wait in
 * storage rails until their order is complete, a two-pass matrix sequencer
 * puts a batch of them in order sequence, and they open one after the
 * other over a pack station. Lengths in metres; one cell is a metre. */
(function (WS) {
  'use strict';
  WS.POCKET_CONFIG = Object.assign({}, WS.BASE_CONFIG, {
    cellSize: 1, // m: positions are in metres
    dayStart: 6 * 3600, // the simulation starts at 06:00

    // The rail
    railSpeed: 1.0, // m/s — friction-driven overhead rail
    pocketPitch: 0.2, // m — pockets queue nose to tail this close
    pockets: 1000, // pockets in the system
    storageLanes: 20, laneLength: 13, // storage rails (first in, first out), m each
    stockLanes: 8, // of them for returns waiting for an order, so they are not in the way of order pockets
    digTaken: 3, digWait: 300, // a stock rail is dug out once it holds this many returns that orders took, or one has waited this long (s)
    seqLines: 8, // lines in each of the sequencer's two banks: a batch of up to seqLines² pockets
    railHeight: 3.6, // m — the rail; the pockets hang under it

    // Orders: fashion, small and often returned
    orderRate: 380, // orders / hour
    itemsPerOrder: [0.48, 0.3, 0.14, 0.08], // share of orders with 1, 2, 3, 4 items
    styles: 160, // styles in the catalogue, each in a few colours and sizes
    batchOrders: 30, // orders a sequencer batch takes at most

    // Picking: people pick from shelving into totes that come to the loading stations
    pickers: 9, pickTime: 34, // s per item, walking included
    toteItems: 12, toteWait: 150, // items in a tote, s a picker waits before sending a part-filled tote

    // Returns
    returnRate: 260, // returned items / hour (fashion: about 40 % of what ships)
    inspectors: 3, inspectTime: 28, // people at the returns desk, s per item (unfold, check, refold, label)
    returnsGood: 0.75, // share that can be sold again: it goes into a pocket as stock
    stockAge: 8, // h a returned item waits in a pocket for an order before it goes back to the shelving

    // Stations
    loadStations: 3, // for picked items, plus one for returns
    loadTime: 6, // s per item: scan, open the pocket, put it in
    packingStations: 4, packBase: 18, packPerItem: 4, // s per order + s per item
    unloadTime: 2.2, // s for a pocket to open over the packing table and close again
    walkSpeed: 1.2,

    // no stock, robots or chargers of the shared kind
    autoOrders: false, autoReplenish: false, products: 0, robots: 0, chargers: 0, toteCount: 0, packStations: 0, // (the shared order flow's pack benches are not used)
  });
})((globalThis.WS = globalThis.WS || {}));
