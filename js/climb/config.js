/* RackRider defaults: climbing robots (Exotec Skypod style). The racking of
 * StackPilot, but taller, and robots that carry one tote: they drive on the
 * floor, climb straight up the racking to fetch it and bring it to a
 * station themselves. Values follow specs/climb.txt, with a smaller store so
 * the whole of it fits the view. */
(function (WS) {
  'use strict';
  WS.CLIMB_CONFIG = Object.assign({}, WS.ACR_CONFIG, {
    // Racking: aisles one robot wide, racking on both sides, single deep
    aisles: 8, bays: 14, levels: 20, // bays per side
    cellSize: 1.0, // m — one bay along the aisle; also one floor cell
    levelHeight: 0.42, // m
    rackFill: 0.75,
    aisleMode: 'oneway', // neighbouring aisles run in opposite directions

    // Robots: one tote each; they drive, climb and present the tote themselves
    robots: 20,
    robotSlots: 1,
    vmax: 4, accel: 2, brake: 2, // m/s, m/s² on the floor
    wheelShift: 0.4, // s — the wheels turn to drive the other way, the robot itself does not turn
    climbSpeed: 1.5, // m/s up and down the racking
    climbOn: 1.2, // s — engage with the rack uprights before climbing, or let go after
    handlerTime: 3, // s — the telescopic arm takes a tote from the rack or puts it back
    presentHeight: 0.55, // m — how high the robot climbs in the station's frame to present the tote
    battMove: 0.02, battMast: 0.05, chargers: 6,

    // Stations: a queue lane in front of each; the robot presents the tote in the station's frame
    laneLength: 3, // cells
    conveyorStep: 0.6, // s — the robot is in place and the screen shows the line
    toteSlots: 6, toteCount: 40,
    portInboundCap: 5, // robots on their way to one station
    orderRate: 320, // orders / hour
  });
})((globalThis.WS = globalThis.WS || {}));
