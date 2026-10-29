/* AirPost defaults: a hospital's pneumatic tube system with its pharmacy
 * (specs/tube.txt). Wards, the emergency department, theatres and ICU send
 * samples to the lab and get their medicines from the pharmacy, where a
 * dispensing robot picks the packs; carriers fly through the tubes one at a
 * time on each line. Lengths in metres; one cell a metre. */
(function (WS) {
  'use strict';
  WS.TUBE_CONFIG = Object.assign({}, WS.BASE_CONFIG, {
    cellSize: 1, // m: positions are in metres
    dayStart: 6 * 3600, // the simulation starts at 06:00

    // The hospital
    wings: 3, // side by side along the street, each with its own riser
    floors: 5, // above the ground floor
    wingWidth: 24, floorHeight: 4.0, // m

    // The tube network
    zonesPerWing: 1, // 1: one line up each wing; 2: a lower and an upper line, each with its own blower
    labLine: 'own', // 'own': the lab on a line of its own; 'core': on the core line with the pharmacy
    tubeV: 6, gentleV: 3, tubeA: 2, // m/s, m/s² — samples travel gently
    switchTime: 3, // s: the diverters set and the blower starts
    landTime: 2, // s: the carrier slows on its air cushion and drops into the basket
    tuTime: 5, tuSlots: 4, // the transfer unit: s to shift a carrier to another line, carriers it holds
    priority: 'stat', // 'stat': urgent carriers first on every line; 'fifo': in turn

    // Carriers
    carriers: 90, // in the whole system
    par: 3, // empty carriers a station wants at hand (the pharmacy twice as many)
    carrierPolicy: 'store', // 'store': the system tops stations up from a carrier store and takes surpluses back; 'sender': staff send foreign empties back to their home station now and then
    returnEvery: 30, // min between rounds of sending empties home ('sender')
    porterAfter: 15, // min a sample or medicine waits for an empty carrier before a porter takes it by hand

    // People at the stations
    loadTime: 20, unloadTime: 15, // s
    respondWard: 150, respondLab: 20, // s on average before someone sees a carrier has landed (a third for an urgent one)

    // Traffic (an hour)
    demand: 1, // everything below scaled
    wardSamples: 3, wardMeds: 1.5, // per ward; samples twice as many on the morning round (06:30–09:00)
    bloodRate: 2, // units of blood from the lab's blood bank to theatres, ICU and the ED

    // The pharmacy's dispensing robot
    drugs: 140, // products in the robot
    robotV: 1.2, robotA: 1.5, robotZV: 0.9, robotZA: 1.5, // m/s, m/s² — along the aisle and up and down
    grabTime: 2.5, dropTime: 1.5, // s a pack
    checkTime: 25, // s: the pharmacist checks an order before it goes into a carrier

    products: 0, robots: 0, chargers: 0, autoOrders: false, autoReplenish: false, toteCount: 0, packStations: 0, // (the shared order flow is not used)
  });
})((globalThis.WS = globalThis.WS || {}));
