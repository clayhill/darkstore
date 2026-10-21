/* ZoneHop defaults: a pharmacy wholesaler's order picking. Order totes
 * travel past an A-frame and picking zones on a conveyor loop, then through
 * a closing line to route lanes and the vans. Values follow specs/pharma.txt,
 * tuned so the whole system runs in balance: fewer orders an hour than the
 * spec's first guess, and enough totes for the ones out on the vans. */
(function (WS) {
  'use strict';
  WS.ZONE_CONFIG = Object.assign({}, WS.BASE_CONFIG, {
    cellSize: 0.75, // m — one floor cell; a tote on a conveyor takes a little more than one
    products: 1200,

    // Orders: pharmacies on a route, in waves before the vans leave
    orderRate: 250, // orders / hour, on average over a tour
    minLines: 8, maxLines: 30, // lines per order (one product each)
    waves: 0.6, // how much the order rate rises before a tour leaves: 0 = steady
    routes: 12,
    tourEvery: 7200, // s between tours: every route's van leaves once per tour
    firstTour: 3600, // s — the first tour leaves at this time of day
    vanStagger: 90, // s between the vans of one tour
    vanCapacity: 60, // totes
    vanTrip: 5400, // s — a van is back with the empty totes of its last trip this long after leaving
    cutoff: 1200, // s — an order is due on the first van that leaves at least this long after it came in
    toteVolume: 32, // L of goods an order tote holds
    toteCount: 1000,

    // A-frame: channels on both sides of the frame, a belt underneath
    afChannels: 240, // 120 per side, 0.1 m apart
    beltSpeed: 0.5, windowLength: 1.2, unitTime: 0.25, // m/s, m per order window, s per unit ejected
    channelCap: 80, refillLevel: 20, // units a channel holds; a channel at or below this asks for a refill
    refillTime: 30, refillOps: 2, // s to take a reserve bin from the flow rack and fill a channel from it; refill operators
    walkSpeed: 1.1, // m/s
    // Reserve: each channel's lane in the flow rack behind the walkway holds
    // bins of its product; the Cuby shuttle store sends a new one for each
    // bin taken
    reserveBins: 2, // bins a lane holds
    cubyAisles: 3, cubyLevels: 10, // shuttle aisles (each with its lift), levels (a shuttle each)
    cubyRetrieve: 25, cubyCycle: 8, // s from a request to the bin leaving the lift; s between bins out of one lift

    // Order start: the de-stacker feeds an empty tote and a printer labels it
    startTime: 4, // s per tote
    loopLimit: 0.75, // order start holds while the loop is this full
    emptyTime: 3, // s — the tote-emptying machine tips a returned tote and stacks it

    // Conveyors
    conveyorSpeed: 0.6, // m/s
    totePitch: 0.7, // m — a tote with its gap on a conveyor
    spurTotes: 4, // totes a zone spur holds, the one at the pick position included

    // Pick-to-light zones: flow racks along a spur, one operator each
    ptlZones: 3, ptlLocations: 100,
    ptlLine: 2, ptlUnit: 1.2, // s per line, s per unit

    // Carousels: one zone, two horizontal carousels and one operator
    carousels: 2, carouselShelves: 60,
    carouselSpeed: 0.5, carouselLine: 3, carouselUnit: 0.8, // m/s, s per line, s per unit

    // RF shelving for the slow movers: pickers with a scanner and a cart
    rfLocations: 600, rfAisles: 5, rfPickers: 3,
    rfLine: 8, rfBatch: 8, rfBatchWait: 120, // s per line, orders per batch, s the oldest waits before a smaller batch goes

    // Replenishment of the zones from the reserve store (not modelled): a
    // location that runs low is topped up to its capacity after a delay
    zoneRefill: 900, // s
    zoneStock: 2, // hours of demand a zone location holds

    // Merge: an operator tips the RF tote into its order tote
    mergeBuffer: 24, mergeTime: 6, // order totes waiting at the merge; s per RF tote
    // Closing line: s per tote for each machine; a tote off weight goes to a manual check
    scaleTime: 2, docsTime: 4, lidTime: 3, labelTime: 3,
    weightErr: 0.01, checkTime: 40,

    // no robots, stations, packing or goods-in: the order flow of the other types is not used
    robots: 0, chargers: 0, pickPorts: 0, goodsInPorts: 0, packStations: 0, autoReplenish: false,
    vmax: 1, accel: 1, brake: 1, binTare: 0, maxPayload: 50,
  });
})((globalThis.WS = globalThis.WS || {}));
