/* TrayLoop's part of the user interface: on top of what every parcel sorter
 * shows (js/hub/ui.js), the loop's tile and settings, and the control room's
 * table of loaded trays. */
(function (WS) {
  'use strict';
  const esc = WS.U.esc;
  WS.TypeUI = WS.TypeUI || {};
  WS.TypeUI.tray = WS.hubUI({
    moreTiles(ui) {
      const sim = ui.sim, busy = sim.trays.filter((t) => t.parcel).length;
      return [ui.kpiTile('Trays loaded', Math.round((busy / sim.trays.length) * 100), '%', `${busy} of ${sim.trays.length} trays · ${sim.cfg.loopSpeed} m/s`)];
    },
    liveSettings(num) { return `<div class="row2">${num('maxLaps', 'Laps before reject', 1, 1, 10)}<div></div></div>`; },
    live: ['maxLaps'],
    scenarioSettings(num) { return `<div class="row2">${num('loopSpeed', 'Loop speed (m/s)', 0.1, 0.5, 3)}${num('trayPitch', 'Tray pitch (m)', 0.1, 0.6, 2)}</div>`; },
    machine(c) { return `Tilt-tray loop: trays ${c.trayPitch} m apart run round at ${c.loopSpeed} m/s. An induct puts its parcel on the next empty tray; at a chute of its destination with room the tray tilts and the parcel slides in. With its chutes full the parcel goes round again, and after ${c.maxLaps} laps to the reject chute.`; },
    cellName: { [WS.CELL.HIGHWAY]: 'Loop', [WS.CELL.PORT]: 'Induct' },
    // the loaded trays, those going round longest first, with the chute each one is heading for
    fleetRows(ui, col) {
      const sim = ui.sim, loaded = sim.trays.filter((t) => t.parcel).sort((a, b) => b.parcel.laps - a.parcel.laps || a.parcel.t0 - b.parcel.t0);
      const head = '<tr><th>Tray</th><th>State</th><th>Parcel</th><th>To</th><th class="r">Laps</th></tr>';
      if (!loaded.length) return head + '<tr><td colspan="5" class="faint">All trays empty</td></tr>';
      return head + loaded.map((t) => {
        const p = t.parcel, [c, label] = col[sim.trayState(t)];
        return `<tr><td><b>Tray ${t.id + 1}</b></td><td><span class="sdot" style="background:${c}"></span>${label}</td><td class="mono">${p.sscc.slice(-8)}</td><td>${p.target === sim.reject ? 'reject' : esc(p.dest.name)}</td><td class="r">${p.laps}</td></tr>`;
      }).join('');
    },
  });
})((globalThis.WS = globalThis.WS || {}));
