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
})((globalThis.WS = globalThis.WS || {}));
