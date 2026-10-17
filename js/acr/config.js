/* StackPilot defaults: case-handling robots (ACR) collecting totes from
 * ordinary shelving. Values follow specs/acr.txt, with fewer aisles, bays and
 * levels so the whole system fits the view. */
(function (WS) {
  'use strict';
  WS.ACR_CONFIG = Object.assign({}, WS.BASE_CONFIG, {
    // Shelving: aisles one robot wide, racking on both sides, single deep
    aisles: 10, bays: 14, levels: 12, // bays per side
    cellSize: 1.0, // m — one bay along the aisle; also one floor cell
    levelHeight: 0.35, // m
    rackFill: 0.75, // share of storage positions holding a tote
    maxPayload: 30, binTare: 3.2, // kg
    aisleMode: 'lock', // 'lock': a trip holds its aisles until it has left them · 'oneway': aisles alternate direction

    // Robots: mast with a tote handler, a column of shelves on the back
    robots: 10,
    robotSlots: 8, // totes on the back shelves (the onboard buffer)
    vmax: 2, accel: 0.5, brake: 0.5, // m/s, m/s²
    wheelShift: 2, // s — turn 90° on the spot
    mastSpeed: 0.8, // m/s — handler up or down the mast
    handlerTime: 8, // s — take a tote off a shelf or put one back
    handoverTime: 2, // s per tote at a station's handover point
    minBatch: 4, batchWait: 25, // totes a trip waits for, unless the oldest has waited this long (s)
    battMove: 0.02, battMast: 0.01, chargers: 4,

    // Stations: a queue lane and a handover point in front of each
    laneLength: 2, // cells
    preZoneSpeed: 1.0, // m/s — conveyors between the handover points and the stations
    // a robot needs minutes to bring a batch, so a station keeps more orders
    // open (a wide put wall) to stay busy
    toteSlots: 12, toteCount: 60,
    portInboundCap: 24, // totes on their way to one station
  });
})((globalThis.WS = globalThis.WS || {}));
