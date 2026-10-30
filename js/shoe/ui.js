/* ShoeLine's part of the user interface: on top of what every parcel sorter
 * shows (js/hub/ui.js), the line's tiles and settings, and the control
 * room's table of parcels going round. */
(function (WS) {
  'use strict';
  const esc = WS.U.esc;
  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.shoe = WS.hubUI({
    moreTiles(ui) {
      const sim = ui.sim, c = sim.cfg, s = sim.stats, avgL = 0.525, cap = Math.round((3600 * c.sorterSpeed) / (avgL + c.gap));
      return [
        ui.kpiTile('Line filled', Math.round(sim.lineFill * 100), '%', `of ${sim.Ls.toFixed(0)} m by parcels and their gaps · ${c.sorterSpeed} m/s`),
        ui.kpiTile('Merge', Math.round((sim.kpi.rate('presented') / cap) * 100), '%', `of about ${cap} parcels/h the gaps allow · ${sim.ret.items.length} coming round${s.jam ? ` · stopped ${WS.U.fmtDur(s.jam)}` : ''}`),
      ];
    },
    liveSettings(num) { return `<div class="row2">${num('maxLaps', 'Laps before reject', 1, 1, 10)}${num('gap', 'Gap between parcels (m)', 0.05, 0.1, 1.5)}</div>`; },
    live: ['maxLaps', 'gap'],
    scenarioSettings(num) { return `<div class="row2">${num('sorterSpeed', 'Sorter speed (m/s)', 0.1, 0.5, 3)}${num('chutePitch', 'Chute pitch (m)', 0.1, 1.2, 3)}</div>`; },
    machine(c) { return `Shoe sorter: each induct puts its parcels on a belt of its own to the merge, where a gapper lets one at a time onto the sorter, keeping ${c.gap} m between one parcel and the next; parcels coming round go first. The sorter is a straight line of slats running at ${c.sorterSpeed} m/s with a chute every ${c.chutePitch} m on both sides. At a chute of its destination with room the shoes under the parcel glide diagonally across the slats and push it off (${c.divertTime} s). A parcel that reaches the end goes onto the recirculation belt back to the merge, and after ${c.maxLaps} laps into the reject chute straight ahead; with neither free the line stops. Its capacity is the speed over each parcel's length plus the gap.`; },
    cellName: { [WS.CELL.HIGHWAY]: 'Line', [WS.CELL.PORT]: 'Induct' },
    // the parcels going round: on the recirculation belt, or on the line on a second lap
    fleetRows(ui, col) {
      const sim = ui.sim, round = [...sim.ret.items.map((it) => ({ p: it.p, where: 'Recirculation belt' })), ...sim.line.filter((it) => it.p.laps).map((it) => ({ p: it.p, where: 'Line' }))].sort((a, b) => b.p.laps - a.p.laps);
      const head = '<tr><th>Parcel</th><th>Where</th><th>To</th><th class="r">Laps</th></tr>';
      if (!round.length) return head + '<tr><td colspan="4" class="faint">Nothing going round</td></tr>';
      const [c] = col.round;
      return head + round.slice(0, 30).map((r) => `<tr><td class="mono">${r.p.sscc.slice(-8)}</td><td><span class="sdot" style="background:${c}"></span>${r.where}</td><td>${r.p.target === sim.reject ? 'reject' : esc(r.p.dest.name)}</td><td class="r">${r.p.laps}</td></tr>`).join('');
    },
  });
})((globalThis.WS = globalThis.WS || {}));
