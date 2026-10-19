/* Builds a simulation page. Each page is just <body data-kind="…"> and a
 * loader; this adds the shared markup with the type's own names, then loads
 * the shared scripts and the type's scripts in order. Every file is fetched
 * with the page's load time as a query, so a browser never mixes cached old
 * files with new ones. */
(function () {
  'use strict';
  const T = new URLSearchParams(document.currentScript.src.split('?')[1] || '').get('t') || Date.now();
  const KINDS = {
    cube: {
      name: 'CubeFlow', sub: 'Cube AS/RS', scan: 'bin, tote, order', xray: true, click: 'robots, cells, ports', three: ['js/cube/render3d.js'],
      map: 'Grid surface', stations: 'Workstations', flow: 'Bins at ports', fleet: 'Fleet',
      sim: ['js/cube/config.js', 'js/cube/grid.js', 'js/cube/tasks.js', 'js/cube/sim.js'], view: ['js/cube/render.js', 'js/cube/ui.js'],
    },
    pod: {
      name: 'PodSwarm', sub: 'Pod robots', scan: 'pod, tote, order', click: 'robots, pods, stations', three: ['js/pod/render3d.js'],
      map: 'Floor', stations: 'Stations', flow: 'Pods at stations', fleet: 'Fleet',
      sim: ['js/pod/config.js', 'js/pod/floor.js', 'js/pod/sim.js'], view: ['js/pod/render.js', 'js/pod/ui.js'],
    },
    shuttle: {
      name: 'RailRunner', cut: true, three: ['js/render3d/rack3d.js', 'js/shuttle/render3d.js'], sub: 'Shuttle AS/RS', scan: 'tote, order, machine', click: 'shuttles, lifts, racks, stations',
      map: 'Levels × aisles', stations: 'Stations', flow: 'Totes at stations', fleet: 'Machine',
      sim: ['js/sim/prezone.js', 'js/shuttle/config.js', 'js/shuttle/sim.js'], view: ['js/render/rack.js', 'js/render/prezone.js', 'js/ui/rack.js', 'js/shuttle/render.js', 'js/shuttle/ui.js'],
    },
    crane: {
      name: 'SkyStack', cut: true, three: ['js/render3d/rack3d.js', 'js/crane/render3d.js'], sub: 'Stacker crane AS/RS', scan: 'tote, order, crane', click: 'cranes, racks, stations',
      map: 'Levels × aisles', stations: 'Stations', flow: 'Totes at stations', fleet: 'Crane',
      sim: ['js/sim/prezone.js', 'js/crane/config.js', 'js/crane/sim.js'], view: ['js/render/rack.js', 'js/render/prezone.js', 'js/ui/rack.js', 'js/crane/render.js', 'js/crane/ui.js'],
    },
    acr: {
      name: 'StackPilot', cut: true, three: ['js/render3d/rack3d.js', 'js/acr/render3d.js'], sub: 'Case-handling robots', scan: 'tote, order, robot', click: 'robots, rack columns, stations',
      map: 'Floor', stations: 'Stations', flow: 'Totes at stations', fleet: 'Fleet',
      sim: ['js/acr/config.js', 'js/acr/sim.js'], view: ['js/render/rack.js', 'js/acr/render.js', 'js/acr/ui.js'],
    },
    sort: {
      name: 'SortHub', sub: 'Parcel sorter', scan: 'SSCC', click: 'chutes, inducts, robots', three: ['js/sort/render3d.js'],
      map: 'Sorter', stations: 'Inducts', flow: 'Parcels inducted', flow2: 'Parcels sorted', fleet: 'Robot fleet',
      tabs: [['chutes', 'Chutes'], ['parcels', 'Parcels'], ['settings', 'Settings']],
      sim: ['js/sort/config.js', 'js/sort/sim.js'], view: ['js/sort/render.js', 'js/sort/ui.js'],
    },
    amr: {
      name: 'AisleMate', sub: 'Robots alongside pickers', scan: 'location, tote, order', click: 'robots, shelves, stations', three: ['js/amr/render3d.js'],
      map: 'Floor', stations: 'Stations', flow: 'Pick stops', fleet: 'Fleet',
      sim: ['js/amr/config.js', 'js/amr/floor.js', 'js/amr/sim.js'], view: ['js/amr/render.js', 'js/amr/ui.js'],
    },
  };
  const SHARED = ['js/core/util.js', 'js/core/barcode.js', 'js/core/config.js', 'js/sim/inventory.js', 'js/sim/router.js', 'js/sim/mover.js', 'js/sim/robot.js',
    'js/sim/machine.js', 'js/sim/ports.js', 'js/sim/orders.js', 'js/sim/kpi.js', 'js/sim/sim.js', 'js/sim/floor.js', 'js/sim/rack.js'];
  const k = KINDS[document.body.dataset.kind];
  document.title = `${k.name} — DarkStore`;
  // keep the page hidden until the stylesheet is in, so it never flashes unstyled
  document.body.style.visibility = 'hidden';
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = 'css/style.css?t=' + T;
  css.onload = css.onerror = () => (document.body.style.visibility = '');
  document.head.appendChild(css);
  document.body.insertAdjacentHTML('afterbegin', `  <header class="top">
    <a class="brand" href="index.html" title="Back to all DarkStore simulations">
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path d="M16 2 29 9.5v13L16 30 3 22.5v-13z" fill="#0ea5e9"/><path d="M16 2 29 9.5 16 17 3 9.5z" fill="#7dd3fc"/><path d="M16 17v13L3 22.5v-13z" fill="#0369a1"/><rect x="13" y="7.5" width="6" height="4" rx="1" fill="#0c4a6e"/></svg>
      <div><b>${k.name}</b><span>DarkStore · ${k.sub}</span></div>
    </a>
    <div class="clock"><span class="lbl">SIM TIME</span><span id="clock">00:00:00</span></div>
    <div class="transport">
      <button id="btn-play" class="icon" title="Pause / resume (space)">❚❚</button>
      <div class="seg" id="speeds"></div>
    </div>
    <div class="seg views" id="views">
      <button data-view="floor" class="on">Floor</button>
      <button data-view="split">Split</button>
${k.three ? '      <button data-view="3d" title="Free 3D view: orbit, walk through the warehouse, follow a robot">3D</button>\n' : ''}      <button data-view="control">Control room</button>
    </div>
    <form class="scan" id="scan-form" autocomplete="off">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M2 4h2v16H2zm3 0h1v16H5zm2 0h2v16H7zm3 0h1v16h-1zm3 0h2v16h-2zm3 0h1v16h-1zm2 0h1v16h-1zm2 0h2v16h-2z"/></svg>
      <input id="scan" placeholder="Scan or type: GTIN, SSCC, ${k.scan}…" spellcheck="false">
    </form>
  </header>

  <main class="layout view-floor" id="layout">
    <section class="stage">
      <div class="iso-wrap" id="iso-wrap">
        <canvas id="iso"></canvas>
${k.three ? '        <canvas id="gl"></canvas><canvas id="gl-labels"></canvas>\n' : ''}
        <div class="iso-tools" id="iso-tools">
${k.xray ? '          <button data-opt="xray" title="Show every bin in the [X][Y][Z] matrix">X-ray stacks</button>\n' : ''}${k.cut ? '          <div class="cut" id="cut" title="Show the racking up to a level, or one level only"><span>Levels</span><input type="range" id="cut-level" min="1" max="1" value="1" aria-label="Highest level shown"><b id="cut-label">all</b><button id="cut-only" title="Show only the chosen level">Only</button></div>\n          <button data-opt="solid" title="Draw the racking solid, so it hides the machines behind it; Shift-drag to look down into the aisles">Solid racking</button>\n' : ''}          <button data-opt="heat" title="ABC velocity colours and traffic heat">ABC &amp; heat</button>
          <button data-opt="paths" class="on">Paths</button>
          <button data-opt="claims" class="on" title="Cells reserved ahead by the fleet manager">Reservations</button>
          <button data-opt="labels" class="on">Labels</button>
          <button id="btn-fit">Fit</button>
${k.three ? '          <button id="btn-walk" class="only3d" title="Walk through the warehouse at eye height (WASD to move, drag to look)">Walk</button>\n          <button id="btn-dark" class="only3d" title="Lights-out: the hall lights go off and the robots work in the dark; only the work places stay lit">Lights out</button>\n' : ''}
        </div>
        <div class="legend" id="legend"></div>
        <div class="hint hint2d">Drag to pan · Shift-drag to tilt · scroll / pinch to zoom · click ${k.click}</div>
        <div class="hint hint3d">Drag to orbit · right-drag to pan · scroll to zoom · WASD to move · double-click a robot to follow</div>
      </div>
      <div class="control" id="control">
        <div class="kpi-row" id="kpis"></div>
        <div class="cr-grid">
          <div class="panel map-panel"><h3>${k.map} — live <button class="mini" id="btn-mapheat">Heat on</button></h3><canvas id="crmap"></canvas></div>
          <div class="panel ports-panel"><h3>${k.stations}</h3><div id="portcards" class="portcards"></div></div>
          <div class="panel chart-panel"><h3>Throughput <span class="sub">rolling 1 h rate</span></h3>
            <div class="clegend"><span><i style="background:#3987e5"></i>${k.flow} /h</span><span><i style="background:#d95926"></i>${k.flow2 || 'Order lines'} /h</span></div>
            <canvas id="chT"></canvas></div>
          <div class="panel chart-panel"><h3>${k.fleet} time split <span class="sub">per 30 s sample</span></h3>
            <div class="clegend"><span><i style="background:#3987e5"></i>Working</span><span><i style="background:#d95926"></i>Waiting</span><span><i style="background:#199e70"></i>Idle</span><span><i style="background:#c98500"></i>Charging</span></div>
            <canvas id="chU"></canvas></div>
          <div class="panel alerts-panel"><h3>Bottleneck alerts</h3><div id="alerts" class="alerts"></div></div>
          <div class="panel fleet-panel"><h3>Fleet</h3><div class="scroll"><table class="tbl" id="fleet"></table></div></div>
          <div class="panel log-panel"><h3>Event log</h3><div id="log" class="log"></div></div>
        </div>
      </div>
    </section>

    <aside class="side" id="side">
      <nav class="tabs" id="tabs">
${(k.tabs || [['inbound', 'Inbound'], ['orders', 'Orders'], ['inventory', 'Inventory'], ['outbound', 'Outbound'], ['settings', 'Settings']]).map(([id, label], n) => `        <button data-tab="${id}"${n ? '' : ' class="on"'}>${label}</button>`).join('\n')}
      </nav>
      <div class="tab-body" id="tab-body"></div>
    </aside>
  </main>

  <div class="inspector hidden" id="inspector"></div>
  <div class="modal hidden" id="modal"><div class="modal-card" id="modal-card"></div></div>
  <div class="toast" id="toast"></div>
`);
  for (const src of [...SHARED, ...k.sim, 'js/render/iso.js', 'js/render/stations.js', 'js/render/control.js', ...k.view, ...(k.three ? ['js/render3d/view3d.js', ...k.three] : []), 'js/ui/ui.js', 'js/main.js']) {
    const s = document.createElement('script');
    s.src = src + '?t=' + T; s.async = false; // run in this order
    document.body.appendChild(s);
  }
})();
