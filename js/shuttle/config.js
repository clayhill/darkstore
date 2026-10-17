/* RailRunner defaults: a shuttle AS/RS with one captive shuttle per aisle
 * level and one lift per aisle. Values follow typical figures for this kind
 * of system (see specs/shuttle.txt). */
(function (WS) {
  'use strict';
  WS.SHUTTLE_CONFIG = Object.assign({}, WS.BASE_CONFIG, {
    // Racking
    aisles: 6, levels: 10, bays: 22, // bays per side; the two front bays of each side are level buffers
    cellSize: 0.65, // m — one bay; also the unit of the pre-zone conveyors
    levelHeight: 0.4, // m
    rackFill: 0.8, // share of storage positions holding a tote
    maxPayload: 50, binTare: 3.2, // kg

    // Shuttles (one per aisle level, rail powered)
    shuttleV: 4, shuttleA: 2, // m/s, m/s²
    bayPositioning: 0.5, // s — fine positioning at the bay
    handlerTime: 3.5, // s — pull or push one tote, single deep

    // Lifts (one per aisle, one tote)
    liftV: 5, liftA: 7, // m/s, m/s²
    liftTransfer: 2, // s — tote on or off the lift
    bufferSize: 2, // totes per level buffer (outbound and inbound side)

    // Pre-zone conveyor from the lifts to the stations and back
    preZoneSpeed: 1.0, // m/s
    chargers: 0, robots: 0, // no battery robots
    toteSlots: 6,
    portInboundCap: 6, // totes on their way to one station
  });
})((globalThis.WS = globalThis.WS || {}));
