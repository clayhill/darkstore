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
      name: 'CubeFlow', sub: 'Cube AS/RS', scan: 'bin, tote, order', xray: true, click: 'robots, cells, ports',
      map: 'Grid surface', stations: 'Workstations', flow: 'Bins at ports', fleet: 'Fleet',
      sim: ['js/cube/config.js', 'js/cube/grid.js', 'js/cube/tasks.js', 'js/cube/sim.js'], view: ['js/cube/render.js', 'js/cube/ui.js'],
    },
    pod: {
      name: 'PodSwarm', sub: 'Pod robots', scan: 'pod, tote, order', click: 'robots, pods, stations',
      map: 'Floor', stations: 'Stations', flow: 'Pods at stations', fleet: 'Fleet',
      sim: ['js/pod/config.js', 'js/pod/floor.js', 'js/pod/sim.js'], view: ['js/pod/render.js', 'js/pod/ui.js'],
    },
    shuttle: {
      name: 'RailRunner', sub: 'Shuttle AS/RS', scan: 'tote, order, machine', click: 'shuttles, lifts, racks, stations',
      map: 'Levels × aisles', stations: 'Stations', flow: 'Totes at stations', fleet: 'Machine',
      sim: ['js/shuttle/config.js', 'js/shuttle/sim.js'], view: ['js/render/rack.js', 'js/ui/rack.js', 'js/shuttle/render.js', 'js/shuttle/ui.js'],
    },
    crane: {
      name: 'SkyStack', sub: 'Stacker crane AS/RS', scan: 'tote, order, crane', click: 'cranes, racks, stations',
      map: 'Levels × aisles', stations: 'Stations', flow: 'Totes at stations', fleet: 'Crane',
      sim: ['js/crane/config.js', 'js/crane/sim.js'], view: ['js/render/rack.js', 'js/ui/rack.js', 'js/crane/render.js', 'js/crane/ui.js'],
    },
  };
  const SHARED = ['js/core/util.js', 'js/core/barcode.js', 'js/core/config.js', 'js/sim/inventory.js', 'js/sim/router.js', 'js/sim/mover.js', 'js/sim/robot.js',
    'js/sim/machine.js', 'js/sim/ports.js', 'js/sim/orders.js', 'js/sim/kpi.js', 'js/sim/sim.js', 'js/sim/rack.js'];
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
      <button data-view="control">Control room</button>
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
        <div class="iso-tools" id="iso-tools">
${k.xray ? '          <button data-opt="xray" title="Show every bin in the [X][Y][Z] matrix">X-ray stacks</button>\n' : ''}          <button data-opt="heat" title="ABC velocity colours and traffic heat">ABC &amp; heat</button>
          <button data-opt="paths" class="on">Paths</button>
          <button data-opt="claims" class="on" title="Cells reserved ahead by the fleet manager">Reservations</button>
          <button data-opt="labels" class="on">Labels</button>
          <button id="btn-fit">Fit</button>
        </div>
        <div class="legend" id="legend"></div>
        <div class="hint">Drag to pan · scroll / pinch to zoom · click ${k.click}</div>
      </div>
      <div class="control" id="control">
        <div class="kpi-row" id="kpis"></div>
        <div class="cr-grid">
          <div class="panel map-panel"><h3>${k.map} — live <button class="mini" id="btn-mapheat">Heat on</button></h3><canvas id="crmap"></canvas></div>
          <div class="panel ports-panel"><h3>${k.stations}</h3><div id="portcards" class="portcards"></div></div>
          <div class="panel chart-panel"><h3>Throughput <span class="sub">rolling 1 h rate</span></h3>
            <div class="clegend"><span><i style="background:#3987e5"></i>${k.flow} /h</span><span><i style="background:#d95926"></i>Order lines /h</span></div>
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
        <button data-tab="inbound" class="on">Inbound</button>
        <button data-tab="orders">Orders</button>
        <button data-tab="inventory">Inventory</button>
        <button data-tab="outbound">Outbound</button>
        <button data-tab="settings">Settings</button>
      </nav>
      <div class="tab-body" id="tab-body"></div>
    </aside>
  </main>

  <div class="inspector hidden" id="inspector"></div>
  <div class="modal hidden" id="modal"><div class="modal-card" id="modal-card"></div></div>
  <div class="toast" id="toast"></div>
`);
  for (const src of [...SHARED, ...k.sim, 'js/render/iso.js', 'js/render/control.js', ...k.view, 'js/ui/ui.js', 'js/main.js']) {
    const s = document.createElement('script');
    s.src = src + '?t=' + T; s.async = false; // run in this order
    document.body.appendChild(s);
  }
})();
