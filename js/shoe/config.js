/* Default scenario for ShoeLine, the sliding shoe sorter: the parcel stream,
 * inducts and chutes every sorter shares (WS.HUB_CONFIG), and a straight line
 * of slats whose shoes push each parcel off into its chute. Lengths in metres. */
(function (WS) {
  'use strict';
  WS.SHOE_CONFIG = Object.assign({}, WS.HUB_CONFIG, {
    cellSize: 1, // m: positions are in metres
    sorterSpeed: 2.0, // m/s, the slats
    gap: 0.35, // m the gapper keeps between one parcel and the next as it puts them on the sorter
    divertTime: 0.45, // s the shoes take to push a parcel across the slats into its chute
    chutePitch: 1.6, // m between chutes along the line, on both sides
    feedSpeed: 1.5, returnSpeed: 1.5, // m/s, the belts from the inducts to the merge and the recirculation belt
    maxLaps: 3, // a parcel whose chute stays full goes to the reject chute at the end after this many laps
  });
})((globalThis.WS = globalThis.WS || {}));
