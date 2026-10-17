/* Scenario defaults shared by every storage type: stock, fleet size and
 * battery, workstations, packing, outbound and demand. Each type extends them
 * (js/cube/config.js, js/pod/config.js). Physical values are in SI units. */
(function (WS) {
  'use strict';
  WS.BASE_CONFIG = {
    seed: 7,
    tick: 0.1, // s — fixed simulation time step
    products: 520,
    stockedRatio: 0.55, // share of storage units that hold stock at start
    robots: 16,

    // Battery (% of capacity)
    battIdle: 0.002, battMove: 0.014, chargeRate: 0.14,
    battLow: 25, battTarget: 92, chargers: 5,

    // Workstations
    pickPorts: 3, goodsInPorts: 1,
    toteSlots: 4,
    portInboundCap: 5, // bins assigned/queued per port
    conveyorStep: 1.4, // s per port conveyor position
    scanTime: 1.2, pickPerUnit: 3.2, putConfirm: 1.0, decantPerUnit: 1.6,

    // Outbound
    packStations: 3, packBase: 18, packPerUnit: 4,
    conveyorSpeed: 0.55, // m/s for tote / parcel conveyors
    toteCount: 40,
    truckCapacity: 40, truckCutoff: 1200, // s

    // Policies
    putawayPolicy: 'velocity', // 'velocity' | 'nearest' | 'random'

    // Demand
    autoOrders: true, orderRate: 300, // orders / hour
    autoReplenish: true,
  };
})((globalThis.WS = globalThis.WS || {}));
