/* DeepLane defaults: an automated pallet shuttle store. Blocks of deep lanes
 * on both sides of a transfer aisle per level, a carrier with a satellite on
 * every level and one pallet lift per block. Values follow typical figures
 * for this kind of system (see specs/pallet.txt), with a small store so the
 * whole of it fits the view. */
(function (WS) {
  'use strict';
  WS.PALLET_CONFIG = Object.assign({}, WS.BASE_CONFIG, {
    // Racking: a block per transfer aisle, lanes on both sides
    aisles: 2, levels: 6, bays: 12, // blocks; levels; lanes per side, the two front lanes of each side hold the level buffers
    laneDepth: 6, // pallets per lane
    cellSize: 1.25, // m — one lane along the transfer aisle (a pallet stands with its 0.8 m side along it)
    slotPitch: 1.3, // m — one pallet position along a lane (1.2 m pallet and clearance)
    levelHeight: 1.9, // m
    rackFill: 0.7, // share of pallet positions holding a pallet
    palletVolume: 900, // L of goods a pallet holds
    maxPayload: 1000, binTare: 25, // kg
    products: 120,

    // Carriers on the transfer aisles (one per level and block, rail powered),
    // each with a satellite that drives into the lanes under the pallets
    shuttleV: 2.0, shuttleA: 0.5, // m/s, m/s² — the carrier along the transfer aisle
    bayPositioning: 1.0, // s — the carrier lines up with a lane
    satV: 1.0, satA: 0.5, // m/s, m/s² — the satellite in a lane
    satLift: 2.5, // s — the satellite lifts a pallet off the rails or sets it down

    // Lifts (one per block, one pallet)
    liftV: 1.5, liftA: 0.8, // m/s, m/s²
    liftTransfer: 6, // s — a pallet on or off the lift
    bufferSize: 2, // pallets per level buffer (outbound and inbound side)

    // Pallet conveyors from the lifts to the stations and back
    preZoneSpeed: 0.5, // m/s
    conveyorStep: 3, // s per station conveyor position
    chargers: 0, robots: 0, // no battery robots
    toteSlots: 6,
    portInboundCap: 3, // pallets on their way to one station
    decantPerUnit: 0.05, // s — goods-in checks and labels a whole pallet, not unit by unit
    orderRate: 70, // orders / hour
  });
})((globalThis.WS = globalThis.WS || {}));
