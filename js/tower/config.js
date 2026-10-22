/* FloorStack defaults: a fulfilment building of three floors. The shuttle
 * store (RailRunner's, WS.SHUTTLE_CONFIG) fills the first floor; the pick
 * stations and packing are on the second, goods-in, the parcel sorter and
 * the docks on the ground floor. Spiral conveyors and lifts link the floors
 * (see specs/tower.txt). */
(function (WS) {
  'use strict';
  WS.TOWER_CONFIG = Object.assign({}, WS.SHUTTLE_CONFIG, {
    // the store on the first floor: lower than RailRunner's, it has to fit under the second floor
    aisles: 6, levels: 8, bays: 20,
    pickPorts: 4, goodsInPorts: 2, toteSlots: 6,
    portInboundCap: 10, // totes on their way to one station: the way up to the second floor is long
    packStations: 4, packBaggers: 1, toteCount: 60,
    orderRate: 400,
    transport: 'loop', // no transport robots here: the conveyors and the links between the floors carry the totes

    // Conveyors on every floor (totes); spirals run at the same speed
    conveyorSpeed: 0.55, // m/s — order totes and parcels on the second floor (as everywhere)
    beltSpeed: 0.8, // m/s — storage totes on the loops and spirals
    totePitch: 0.72, // m — a storage tote with its gap
    loopLimit: 0.7, // the store's lifts send no more totes out while the first floor's loop is this full

    // Links between the first and the second floor: spiral conveyors, or a lift each way
    linkType: 'spiral', // 'spiral' | 'lift'
    spiralPitch: 1.2, // m the spiral climbs per turn
    // Tote lifts (vertical reciprocating conveyors): goods-in ↔ store, and the links in 'lift' mode
    vrcV: 1.5, vrcA: 1.0, // m/s, m/s²
    vrcTransfer: 2.5, // s — a tote rolls onto or off the carriage
    vrcCap: 2, // totes on the carriage

    // Parcels: down the parcel spiral to the sorter loop, into a roll cage at a chute
    sorterSpeed: 1.0, // m/s — the parcel spiral and the sorter loop
    parcelPitch: 0.55, // m
    chutesPerCarrier: 2,
    cageCap: 20, // parcels in a roll cage
    // Outbound trucks: one dock door per carrier
    truckCages: 8, // cages a trailer takes
    truckEvery: 2700, // s between a carrier's scheduled departures
    truckGap: 240, // s from one truck leaving to the next one docking
    cageTime: 6, // s to hook up a roll cage, or push it into a trailer

    // People
    walkSpeed: 1.2, // m/s
    staffLiftV: 1.0, // m/s — the goods lift people ride
    breakEvery: 2400, // s between scheduled breaks, one operator after the other (0 = only from the Disruptions buttons)

    // Inbound: suppliers' trucks with pallets of cartons for goods-in
    inboundPallets: 6, // pallets on a supplier's truck
    casesPerPallet: 12, // receipt lines decanted from one pallet

    truckCapacity: 160, truckCutoff: 2700, // (the shared single truck is not used: the doors have their own)
  });
})((globalThis.WS = globalThis.WS || {}));
