/* SkyStack defaults: a mini-load stacker crane AS/RS with one crane per aisle.
 * Values follow the mini-load figures in specs/crane.txt, with a shorter rack
 * so the whole system fits the view. */
(function (WS) {
  'use strict';
  WS.CRANE_CONFIG = Object.assign({}, WS.BASE_CONFIG, WS.BOT_CONFIG, {
    // Racking
    aisles: 5, levels: 12, bays: 28, // bays per side
    cellSize: 0.65, // m — one bay; also the unit of the pre-zone conveyors
    levelHeight: 0.4, // m
    rackFill: 0.8, // share of storage positions holding a tote
    maxPayload: 50, binTare: 3.2, // kg

    // Cranes (one per aisle, rail powered); mast and carriage move at the same time
    craneVx: 5, craneAx: 2, // m/s, m/s² — along the aisle
    craneVz: 3, craneAz: 3, // m/s, m/s² — carriage up and down the mast
    settleTime: 0.5, // s — settling before the forks go out
    forkTime: 4, // s — one fork cycle: take or put one tote
    handlerSlots: 2, // totes the load handler holds; 1 = classic single / dual command

    // Pre-zone conveyor from the I/O points to the stations and back
    preZoneSpeed: 1.0, // m/s
    chargers: 0, robots: 0, // no battery robots
    toteSlots: 6,
    portInboundCap: 6, // totes on their way to one station
  });
})((globalThis.WS = globalThis.WS || {}));
