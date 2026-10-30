/* What every parcel sorter shares (SortHub, TrayLoop, ShoeLine): the same
 * parcel stream, destinations, inducts, chutes and bags, so the three can
 * be compared on the same parcels. Each sorter's config adds its own
 * machine. No stock or orders. */
(function (WS) {
  'use strict';
  WS.HUB_CONFIG = Object.assign({}, WS.BASE_CONFIG, {
    cellSize: 0.75, // m

    // Parcels
    parcelRate: 3600, // parcels / hour arriving at the inducts
    destinations: 28, // routes the parcels are sorted to (a few take most of the volume)
    noRead: 0.02, // share of labels the induct scanner cannot read: they go to the reject chute

    // Inducts: an operator scans each parcel and puts it on the sorter
    inducts: 4, inductTime: 2.4, // s per parcel
    inductQueue: 40, // parcels a feed belt holds in front of an induct

    // Chutes: one per destination, a second one for the busiest, and a reject chute
    chutes: 36,
    bagCapacity: 30, // parcels per bag
    bagWorkers: 2, bagSwap: 25, walkSpeed: 1.2, // people, s per bag change, m/s

    // no stock, orders or replenishment
    autoOrders: false, autoReplenish: false, products: 0,
  });
})((globalThis.WS = globalThis.WS || {}));
