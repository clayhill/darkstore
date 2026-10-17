/* Default scenario for PodSwarm (pod robots carrying shelving units). Shares
 * the order, workstation and outbound settings with the cube defaults; the
 * physical values follow typical figures for this kind of system. */
(function (WS) {
  'use strict';
  WS.POD_CONFIG = Object.assign({}, WS.DEFAULT_CONFIG, {
    // Floor
    floorW: 26, floorD: 15,
    cellSize: 1.2, // m — one pod footprint plus clearance
    blockW: 5, // storage cells between two vertical highways
    podFill: 0.82, // share of storage cells holding a pod
    stockedRatio: 0.45, // share of pod bins that hold stock at start

    // Pods: 4 faces × shelves × bins per shelf
    podShelves: 4, podSlots: 2,
    podBinVol: 30, // litres per pod bin
    binTare: 60, maxPayload: 450, // kg — empty pod, robot lift capacity

    // Fleet
    robots: 16,
    vmax: 1.5, accel: 1.0, brake: 1.2,
    wheelShift: 1.5, // s — rotate 90° on the spot (the router's direction change)
    liftTime: 1.5, // s — lift or lower a pod
    podRotate: 1.5, // s — turn a pod 90° at a station to show another face
    tunnelling: 'on', // empty robots may drive under stored pods
    battMove: 0.018,

    // Workstations: the pod waits in a queue lane, then is presented at the station
    portInboundCap: 6, // pods in flight per station: the queue lane holds all but one
    toteSlots: 8, // a bigger put wall than the cube port: more orders per pod visit
    conveyorStep: 1.0, // s — pod settles at the station before the first pick
  });
})((globalThis.WS = globalThis.WS || {}));
