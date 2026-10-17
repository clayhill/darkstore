/* Default scenario parameters. Physical values are in SI units (m, s, kg)
 * and roughly follow published figures for cube-storage AS/RS robots. */
(function (WS) {
  'use strict';
  WS.DEFAULT_CONFIG = {
    seed: 7,
    tick: 0.1, // s — fixed simulation time step

    // Grid
    gridW: 26, gridD: 14, gridZ: 12,
    cellSize: 0.70, // m (centre to centre)
    binHeight: 0.33, // m
    initialFill: 0.8, // share of storage positions occupied by bins
    stockedRatio: 0.55, // share of bins that hold stock at start
    products: 520,

    // Fleet
    robots: 16,
    vmax: 3.1, // m/s
    accel: 0.8, // m/s²
    brake: 1.2, // m/s²
    wheelShift: 0.7, // s — pneumatic X/Y track change
    winchEmpty: 1.6, // m/s
    winchLoaded: 1.1, // m/s at max payload
    gripTime: 0.6, // s — gripper latch/unlatch
    maxPayload: 30, // kg
    binTare: 3.2, // kg

    // Battery (% of capacity)
    battIdle: 0.002, battMove: 0.014, battWinch: 0.028, chargeRate: 0.14,
    battLow: 25, battTarget: 92, chargers: 5,

    // Workstations
    pickPorts: 3, goodsInPorts: 1,
    toteSlots: 4,
    portInboundCap: 5, // bins assigned/queued per port
    conveyorStep: 1.4, // s per port conveyor position
    scanTime: 1.2, pickPerUnit: 3.2, putConfirm: 1.0, decantPerUnit: 1.6,

    // Outbound
    packStations: 3, packBase: 18, packPerUnit: 4,
    conveyorSpeed: 0.55, // m/s for tote / parcel conveyors
    toteCount: 40,
    truckCapacity: 40, truckCutoff: 1200, // s

    // Policies
    restackPolicy: 'origin', // 'origin' | 'leave'
    putawayPolicy: 'velocity', // 'velocity' | 'nearest' | 'random'
    burialDepth: 4, // depth at which an A-item counts as buried

    // Demand
    autoOrders: true, orderRate: 300, // orders / hour
    autoReplenish: true,
  };
})((globalThis.WS = globalThis.WS || {}));
