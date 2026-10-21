/* UI pieces shared by the racking types (RailRunner, SkyStack): the rack side
 * inspector and where a stored tote is. */
(function (WS) {
  'use strict';
  WS.RackUI = {
    // One rack side at one level, front of the aisle first. `extra` adds rows
    // to the summary (the machine that serves it).
    sideHTML(ui, a, L, s, extra) {
      const sim = ui.sim, aisle = sim.aisles[a], SB = sim.grid.SB, ids = [];
      for (let b = SB - 1; b >= 0; b--) { const id = aisle.slot[sim.si(L, s, b)]; if (id) ids.push([id, b + 1]); }
      return `<div class="hd"><b>Aisle ${a + 1} · level ${L + 1} · ${s ? 'right' : 'left'} side</b><button class="close">×</button></div>
        <dl class="kv"><dt>Totes</dt><dd>${ids.length} / ${SB}</dd>${extra}</dl>
        ${ids.length ? `<h3>Front of the aisle first</h3><div class="stack">${ids.map(([id, b]) => ui.binRow(id, b)).join('')}</div><div class="note">★ = requested by a station. Colour = ABC class of contents.</div>` : ''}`;
    },
    conveyorHTML(ui) { return `<div class="hd"><b>Conveyor and stations</b><button class="close">×</button></div><dl class="kv"><dt>Totes on the conveyor</dt><dd>${ui.sim.conv.length}</dd></dl>`; },
    locate(ui, b) { return `Aisle ${b.aisle + 1} · level ${b.level + 1} · ${b.side ? 'right' : 'left'} side · bay ${b.bay + 1}`; },
    depthTag(depth) { return 'bay ' + depth; },
    cellWord: 'rack position',
  };

  // Transport robots between the racking and the stations (WS.ToteBots):
  // what the fleet table and the robot inspector say about them.
  WS.BotUI = {
    // control-room tiles for the transport robots
    kpiTiles(ui) {
      const sim = ui.sim, k = sim.bots.kpis(), rs = sim.bots.robots, u = rs.reduce((a, r) => a + r.utilization, 0) / rs.length, pc = (v) => Math.round(v * 100);
      return [
        ui.kpiTile('Transport robots', pc(u), '%', `${rs.length} robots at work · ${pc(k.empty)}% of their driving empty · ${k.perTote.toFixed(0)} m per tote`),
        ui.kpiTile('Paired trips', pc(k.paired), '%', `of the totes leaving a station taken by the robot that brought one`),
        ui.kpiTile('Stand waits', k.standWait.toFixed(0), 's', `a tote on an outfeed stand waits for a robot · stands full ${pc(k.standFull)}% of the time · at a station's outfeed ${k.outWait.toFixed(0)} s`),
      ];
    },
    // the transport setting, and the robots' when they carry the totes
    settings(c, num, sel) {
      return `<div class="row2">${sel('transport', 'Transport to the stations', [['loop', 'Conveyor loop'], ['robots', 'Mobile robots']])}${c.transport === 'robots' ? num('transportRobots', 'Robots per station', 0.5, 0.5, 8) : '<div></div>'}</div>
        ${c.transport === 'robots' ? `<div class="row2">${num('standCap', 'Totes per stand', 1, 1, 3)}${num('transferTime', 'Tote on/off a robot (s)', 0.5, 1, 10)}</div>` : ''}`;
    },
    position(r) {
      const sim = r.sim, g = sim.grid, C = WS.CELL, i = g.idx(r.x, r.y), t = g.type[i], a = Math.floor(r.x / 3) + 1;
      if (t === C.HAND) return `At aisle ${a}'s ${r.x % 3 ? 'infeed' : 'outfeed'} stand`;
      if (t === C.PORT || t === C.PORT_OUT || t === C.LANE) { const p = sim.ports[g.portOf[i]]; return t === C.LANE ? `Queueing for ${p.code}` : `At ${p.code}'s ${t === C.PORT ? 'infeed' : 'outfeed'}`; }
      if (t === C.CHARGER) return 'On a charger';
      if (t === C.PARK) return 'Parked';
      return `On the ${g.west.includes(r.y) ? 'west' : 'east'}bound highway · x ${r.x}`;
    },
    speed(r) { return r.v * r.sim.cfg.cellSize; },
    // A cell of the robot floor (a map cell below the racking): a stand pair,
    // the highway, a parking spot or charger.
    inspectFloor(ui, i) {
      const sim = ui.sim, g = sim.grid, C = WS.CELL, f = sim.mapGrid.floorCell(i);
      if (f < 0) return WS.RackUI.conveyorHTML(ui);
      const x = g.cx(f), y = g.cy(f), t = g.type[f], esc = WS.U.esc, link = (r) => `<a href="#" data-open="robot:${r.id}">${r.name}</a>`;
      const here = sim.bots.robots.find((r) => r.x === x && r.y === y), a = Math.floor(x / 3);
      let title = 'Robot floor', rows = '';
      if ((t === C.STAND || t === C.HAND) && a < g.A) {
        const aisle = sim.aisles[a], out = sim.bots.outStand(a).sort((p, q) => q.s - p.s), bots = sim.bots.robots.filter((r) => r.task && r.task.type === 'CARRY' && !r.task.done && (r.task.fromKey === 's' + a || r.task.toStand === a));
        title = `Aisle ${a + 1} · stands`;
        rows = `<dt>Outfeed stand</dt><dd>${out.length} / ${sim.cfg.standCap}${out.length ? ' · ' + out.map((it) => `<a href="#" data-open="bin:${it.bin.id}">${it.bin.id}</a> → ${it.port.code}`).join(', ') : ''}</dd>
          <dt>Infeed stand</dt><dd>${aisle.inQ.length} / ${sim.cfg.standCap}${aisle.inQ.length ? ' · ' + aisle.inQ.map((q) => `<a href="#" data-open="bin:${q.bin.id}">${q.bin.id}</a>`).join(', ') : ''}</dd>
          <dt>Robots on their way</dt><dd>${bots.length ? bots.map(link).join(', ') : '—'}</dd>`;
      } else if (t === C.HIGHWAY) {
        title = `${g.west.includes(y) ? 'Westbound' : 'Eastbound'} highway`;
        rows = `<dt>Cell</dt><dd>x ${x}</dd><dt>Traffic wait</dt><dd>${g.waitHeat[f].toFixed(0)} s (5-min decay)</dd>`;
      } else if (t === C.PARK || t === C.CHARGER) {
        const ch = g.chargers.find((c) => c.x === x && c.y === y);
        title = ch ? `Charger ${ch.id + 1}` : 'Parking spot';
        if (ch) rows = `<dt>State</dt><dd>${ch.down ? 'out of service' : ch.robot >= 0 ? 'charging ' + link(sim.fleet[ch.robot]) : 'free'}</dd>`;
      }
      return `<div class="hd"><b>${esc(title)}</b><button class="close">×</button></div><dl class="kv">${rows}<dt>Robot here</dt><dd>${here ? link(here) + ' · ' + esc(ui.stateLabel(here.displayState)) : '—'}</dd></dl>`;
    },
    motion(r) { return `facing ${r.axis.toUpperCase()}${r.shift > 0 ? ' (turning)' : ''}`; },
    mechanism(r) { return `<dt>Roller deck</dt><dd>${r.xfer ? (r.xfer.take ? 'taking a tote on' : 'rolling a tote off') : r.bin ? 'carrying a tote' : 'empty'}</dd>`; },
    taskText(ui, r) {
      const t = r.task, sim = ui.sim;
      if (t.type !== 'CARRY') return { CHARGE: 'Charging', PARK: 'To a parking spot', YIELD: 'Making way' }[t.type] || t.type;
      const from = t.fromPort != null ? sim.ports[t.fromPort].code : `aisle ${(t.fromKey.slice(1) | 0) + 1}`, to = t.toPort != null ? sim.ports[t.toPort].code : `aisle ${t.toStand + 1}`;
      return `${t.bin.id}: ${from} → ${to}${t.took ? '' : ' (collecting)'}`;
    },
  };
})((globalThis.WS = globalThis.WS || {}));
