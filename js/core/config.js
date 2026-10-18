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
    // Robot arm picking: the first armStations pick stations have a robot arm
    // instead of an operator (0 = none). It picks a unit in armPerUnit s and
    // tries again once when a grasp fails; then, or straight away for an item
    // it cannot grip, an operator comes over (armAssistDelay s) and picks it
    // by hand. armExceptions 'route' keeps orders with such items away from
    // the arm stations at release.
    armStations: 0, armPerUnit: 4.5, armAssistDelay: 20, armExceptions: 'assist', // 'assist' | 'route'
    // Automated decanting: the first autoDecant goods-in stations are robotic
    // cells (0 = none). A case opener cuts each carton open and an arm tips it
    // into the storage unit: decantCase s per receipt line plus decantTip s per
    // unit. Items it cannot tip are decanted by an operator who comes over.
    autoDecant: 0, decantCase: 6, decantTip: 0.2,

    // Outbound
    packStations: 3, packBase: 18, packPerUnit: 4, // manual pack benches: s per order + s per unit
    // Packing machines next to the benches (0 = none). An auto-bagger: the
    // operator drops the items in, the machine bags, seals and labels them;
    // it takes small, light orders. A box-making machine cuts a carton to
    // size around the items, closes and labels it; it takes orders up to a
    // carton limit. Orders that fit neither go to a person.
    packBaggers: 0, bagBase: 6, bagPerUnit: 2.5, bagMaxUnits: 3, bagMaxVol: 4, bagMaxWeight: 2, // s, s, units, L, kg
    packBoxers: 0, boxBase: 9, boxPerUnit: 1.5, boxMaxUnits: 10, boxMaxVol: 30, // s, s, units, L
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
