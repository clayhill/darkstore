/* RoboValet defaults: an automated car park. Drivers leave their car in an
 * entry/exit cabin on the street; robots and lifts park it on one of the
 * levels above and bring it back when the driver returns (specs/park.txt).
 * It shares the base defaults for the parts every page reads, but has no
 * stock or orders. Lengths in metres; one cell is a metre. */
(function (WS) {
  'use strict';
  WS.PARK_CONFIG = Object.assign({}, WS.BASE_CONFIG, {
    cellSize: 1, // m: positions are in metres
    dayStart: 6 * 3600, // the simulation starts at 06:00

    // The building
    levels: 5, // parking levels above the ground floor
    modules: 4, // entry/exit cabins on the street, each with a car lift behind it
    baysPerRow: 16, // bays in the north row after the lift shafts; the south row runs the whole length
    bayWidth: 2.6, bayDepth: 5.4, aisleWidth: 6.0, moduleWidth: 4.0, // m
    groundHeight: 3.6, levelHeight: 2.4, // m floor to floor: no people on the parking levels

    // Parking robots: one per level, and one per module on the ground floor
    vEmpty: 2.0, vLoaded: 1.2, accel: 0.5, // m/s, m/s² — a car on board moves gently
    turnRate: 30, // °/s turning on the spot
    clampTime: 6, releaseTime: 5, // s — arms out round the tyres and lift, or set down and arms in

    // Car lifts
    liftV: 1.0, liftA: 0.5, // m/s, m/s²
    liftSettle: 2, // s — the platform levels with the floor and the gate opens

    // Entry/exit cabins (EETs)
    handover: 40, // s — the driver gets out, confirms at the terminal and leaves the cabin
    scanTime: 8, // s — door closes, the car is measured and checked
    getIn: 15, // s — the driver gets in and starts the car
    payTime: 20, // s at the pay kiosk in the lobby
    walkSpeed: 1.3, driveSpeed: 3.0, cabinSpeed: 1.2, // m/s — people, cars in the street, cars inside a cabin
    maxQueue: 12, // drivers in the street queue beyond this go elsewhere

    // Demand: a working day
    residents: 40, // cars parked overnight; most leave in the morning and come back in the evening
    commuters: 120, // arrive around commuteIn, leave around commuteOut
    commuteIn: 8.25, commuteOut: 17.25, // h of day
    spreadIn: 0.45, spreadOut: 0.75, // h (standard deviation): they arrive closer together than they leave
    shoppers: 14, // an hour, 10:00–20:00, staying 30 min to 4 h
    demand: 1, // all of the above scaled

    // Policies
    placement: 'balanced', // 'balanced' | 'nearest' | 'stay'
    appShare: 0.3, // drivers who order their car in the app before they come back
    appLead: 4, // min ahead

    // no stock, orders, batteries or chargers
    autoOrders: false, autoReplenish: false, products: 0, robots: 0, chargers: 0,
  });
})((globalThis.WS = globalThis.WS || {}));
