/* Default scenario for AisleMate (collaborative mobile robots that bring
 * order totes to pickers in ordinary shelving). Shares the order,
 * workstation and outbound settings with the other types; the physical
 * values follow typical figures for this kind of system. */
(function (WS) {
  'use strict';
  WS.AMR_CONFIG = Object.assign({}, WS.BASE_CONFIG, {
    // Shelving: aisles two cells wide with a shelving row on each side
    aisles: 6, bays: 14, // aisles, shelf bays along each aisle
    cellSize: 0.75, // m — one shelf bay, half an aisle
    shelfLevels: 4, shelfSlots: 2, // compartments per bay: levels × slots
    slotVol: 40, // litres per compartment
    binTare: 0, maxPayload: 400, // kg — a shelf bay weighs nothing extra; what one bay may hold
    stockedRatio: 0.6,

    // Robots: each carries a batch of order totes
    robots: 10,
    robotTotes: 4, // order totes per robot (one order each)
    vmax: 1.2, accel: 0.7, brake: 0.9,
    wheelShift: 0.8, // s — turn 90° on the spot
    batchWait: 30, // s — a robot leaves with fewer totes when the oldest order has waited this long
    putawayStops: 6, // shelf locations per putaway tour
    toteHandle: 3.5, // s — the station operator takes a tote off or puts one on a robot
    chargers: 4,

    // Pickers walk the aisles and pick into the robots' totes
    pickers: 6,
    walkSpeed: 1.1, // m/s
    zonePicking: 'on', // 'on': each picker keeps to a zone of aisles · 'off': anywhere

    // Stations: where robots drop full totes and take empty ones
    pickPorts: 2, goodsInPorts: 1,
    stationLane: 3, // cells of queue in front of each station
    toteSlots: 8, // order totes staged per station, waiting for a robot
    toteCount: 90,
    scanTime: 1.5, // s — scan the location at a stop
  });
})((globalThis.WS = globalThis.WS || {}));
