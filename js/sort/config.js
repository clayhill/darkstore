/* Default scenario for SortHub, the robot sorter: the parcel stream,
 * inducts and chutes every sorter shares (WS.HUB_CONFIG), and a raised deck
 * of small robots that carry each parcel to its chute. */
(function (WS) {
  'use strict';
  WS.SORT_CONFIG = Object.assign({}, WS.HUB_CONFIG, {
    robots: 45, // up to about 70 on the default deck; more crowd the streets until they lock up
    vmax: 2.0, accel: 2.0, brake: 2.5, wheelShift: 0.35, tipTime: 0.8, // small, quick sorter robots
    chargers: 10, stationLane: 3, battMove: 0.01, // light robots: half the drain of the bigger floor robots
  });
})((globalThis.WS = globalThis.WS || {}));
