/* Default scenario for TrayLoop, the tilt-tray sorter: the parcel stream,
 * inducts and chutes every sorter shares (WS.HUB_CONFIG), and a loop of
 * trays that tip each parcel into its chute. */
(function (WS) {
  'use strict';
  WS.TRAY_CONFIG = Object.assign({}, WS.HUB_CONFIG, {
    loopSpeed: 2.0, trayPitch: 1.0, // m/s, m between trays
    maxLaps: 3, // a parcel whose chute stays full goes to the reject chute after this many laps
  });
})((globalThis.WS = globalThis.WS || {}));
