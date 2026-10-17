/* CubeFlow defaults. Physical values roughly follow published figures for
 * cube-storage AS/RS robots. */
(function (WS) {
  'use strict';
  WS.CUBE_CONFIG = Object.assign({}, WS.BASE_CONFIG, {
    // Grid
    gridW: 26, gridD: 14, gridZ: 12,
    cellSize: 0.70, // m (centre to centre)
    binHeight: 0.33, // m
    initialFill: 0.8, // share of storage positions occupied by bins

    // Fleet
    vmax: 3.1, // m/s
    accel: 0.8, // m/s²
    brake: 1.2, // m/s²
    wheelShift: 0.7, // s — pneumatic X/Y track change
    winchEmpty: 1.6, // m/s
    winchLoaded: 1.1, // m/s at max payload
    gripTime: 0.6, // s — gripper latch/unlatch
    maxPayload: 30, // kg
    binTare: 3.2, // kg

    battWinch: 0.028, // battery use while the winch runs

    // Policies
    restackPolicy: 'origin', // 'origin' | 'leave'
    burialDepth: 4, // depth at which an A-item counts as buried
  });
})((globalThis.WS = globalThis.WS || {}));
