/* Default scenario for SortHub (a parcel sorter). It shares the base
 * defaults for the parts every page reads, but has no stock or orders: a
 * stream of parcels arrives, operators induct them, and a tilt-tray loop or
 * a floor of small robots sorts them into chutes, one bag per chute. */
(function (WS) {
  'use strict';
  WS.SORT_CONFIG = Object.assign({}, WS.BASE_CONFIG, {
    mechanism: 'robots', // 'robots': robot sorter on a raised deck · 'tray': tilt-tray loop
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

    // Tilt-tray loop
    loopSpeed: 2.0, trayPitch: 1.0, // m/s, m between trays
    maxLaps: 3, // a parcel whose chute stays full goes to the reject chute after this many laps

    // Robot sorter
    robots: 45, // up to about 70 on the default deck; more crowd the streets until they lock up
    vmax: 2.0, accel: 2.0, brake: 2.5, wheelShift: 0.35, tipTime: 0.8, // small, quick sorter robots
    chargers: 10, stationLane: 3, battMove: 0.01, // light robots: half the drain of the bigger floor robots

    // no stock, orders or replenishment
    autoOrders: false, autoReplenish: false, products: 0,
  });
})((globalThis.WS = globalThis.WS || {}));
