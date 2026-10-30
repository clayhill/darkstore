/* What every parcel sorter's user interface shares (SortHub, TrayLoop,
 * ShoeLine). They have no stock or orders, so they bring their own KPI
 * tiles, settings panel and side tabs (Chutes, Parcels), the induct cards
 * for the control room, and the chute and induct inspectors. A sorter makes
 * its part with WS.hubUI({ … }), adding its own tiles (moreTiles), settings
 * (liveSettings, scenarioSettings), its paragraph for About (machine) and
 * whatever else it needs. */
(function (WS) {
  'use strict';
  const esc = WS.U.esc, pct = (v) => Math.round(v * 100) + '%';
  WS.TypeUI = WS.TypeUI || {};
  const BASE = {
    // the sorter's word for a parcel that did not go in first time, and what happens to it
    recirc: { title: 'Recirculated', note: (sim, s) => `went round again: chute full · ${s.laps} extra laps`, after: (sim) => sim.cfg.maxLaps + ' laps' },
    allKpiTiles(ui) {
      const sim = ui.sim, k = sim.kpi, s = sim.stats, cap = sim.cfg.bagCapacity, ps = sim.ports, R = this.recirc;
      const waiting = sim.backlog.length + ps.reduce((n, p) => n + p.queue.length, 0), full = sim.chutes.filter((c) => c.count >= cap).length;
      const ind = ps.reduce((a, p) => a + (p.stats.t ? p.stats.busy / p.stats.t : 0), 0) / ps.length;
      const wk = sim.workers.reduce((a, w) => { const t = w.stateTime; return a + (t.WALKING + t.SWAPPING) / (t.IDLE + t.WALKING + t.SWAPPING || 1); }, 0) / (sim.workers.length || 1);
      return [
        ui.kpiTile('Sort rate', Math.round(k.rate('lines')), '/h', `${s.sorted} parcels sorted`),
        ui.kpiTile('Inducted', Math.round(k.rate('presented')), '/h', `${s.arrived} arrived · ${waiting} waiting to be inducted`),
        ui.kpiTile(R.title, s.inducted ? (s.recirculated / s.inducted * 100).toFixed(1) : '0', '%', R.note(sim, s)),
        ui.kpiTile('Rejected', s.sorted ? (s.rejected / s.sorted * 100).toFixed(1) : '0', '%', `${s.noRead} no-reads · ${s.rejected - s.noRead} after ${R.after(sim)}`),
        ui.kpiTile('Bags', s.bags, '', `${full} chutes full now · bag workers ${pct(wk)} busy`),
        ui.kpiTile('Induct utilization', Math.round(ind * 100), '%', `${ps.length} inducts · ${sim.cfg.inductTime} s per parcel`),
        ...this.moreTiles(ui),
      ];
    },
    moreTiles() { return []; },
    liveSettings() { return ''; },
    scenarioSettings() { return ''; },
    settings(ui, c, num, sel) {
      return {
        full: `<div class="sect"><h3>Live</h3><div class="card">
        <div class="row2">${num('parcelRate', 'Parcels per hour', 100, 0, 20000)}${num('noRead', 'Labels not read (share)', 0.005, 0, 0.3)}</div>
        <div class="row2">${num('inductTime', 'Induct: s per parcel', 0.1, 0.8, 10)}${num('bagSwap', 'Bag change (s)', 1, 5, 120)}</div>
        ${this.liveSettings(num, sel)}
        <div class="note">Applied immediately.</div></div></div>
      <div class="sect"><h3>Scenario <span class="sub">restarts the simulation</span></h3><div class="card">
        <div class="row2">${num('destinations', 'Destinations', 1, 2, 60)}${num('chutes', 'Chutes (incl. reject)', 1, 3, 80)}</div>
        <div class="row2">${num('inducts', 'Inducts', 1, 1, 10)}${num('bagCapacity', 'Parcels per bag', 1, 5, 100)}</div>
        <div class="row2">${num('bagWorkers', 'Bag workers', 1, 1, 10)}${num('walkSpeed', 'Walking speed (m/s)', 0.1, 0.5, 2)}</div>
        ${this.scenarioSettings(num, sel)}
        ${num('seed', 'Random seed', 1, 1)}
        <div class="btns"><button class="btn primary" id="cfg-restart">Apply &amp; restart</button><button class="btn ghost" id="cfg-reset">Defaults</button><button class="btn ghost" id="cfg-share" title="Copy a link that opens exactly this setup: the settings above, the seed and the view">Copy link</button></div>
        <div class="note">Chutes are shared out one per destination, the busiest destinations get a second (and third …) chute, and the last one is the reject chute. With fewer chutes than destinations the rest go to the reject chute.</div></div></div>
      <div class="sect"><h3>About the model</h3><div class="card" style="font-size:12px;color:var(--muted)">${this.about(c)}</div></div>`,
      };
    },
    about(c) {
      return `A parcel sorter. Parcels arrive at ${c.parcelRate} per hour, each for one of ${c.destinations} destinations, a few of which take most of the volume. At ${c.inducts} inducts an operator scans each parcel and puts it on the sorter (${c.inductTime} s); ${Math.round(c.noRead * 100)}% of labels cannot be read and go to the reject chute. Every chute ends in a bag of ${c.bagCapacity} parcels; ${c.bagWorkers} bag workers change full bags (${c.bagSwap} s). ${this.machine(c)} SortHub, TrayLoop and ShoeLine sort the same parcel stream with the same inducts, chutes and bags, so their figures compare directly. The order flow of the other simulations is not used here. Barcodes: GS1-128 SSCC on parcels.`;
    },
    live: ['parcelRate', 'noRead', 'inductTime', 'bagSwap'],
    portsNote: 'Bar: operator busy (blue) vs. no parcels to induct (orange).',
    portCard(ui, p) {
      const busy = p.stats.t ? p.stats.busy / p.stats.t : 0, starve = p.stats.t ? p.stats.starved / p.stats.t : 0;
      return `<div class="pcard" data-open="port:${p.idx}"><div class="row"><span class="name">${p.code} · ${esc(p.name)}</span>${p.away ? '<span class="pill BACKORDER">ON BREAK</span>' : p.cur ? '<span class="pill SHIPPED">INDUCTING</span>' : p.ready ? '<span class="pill PICKED">WAITING FOR SORTER</span>' : '<span class="pill">IDLE</span>'}</div>
        <div class="row meta"><span>${p.queue.length} on the feed belt</span><span>${p.done} inducted</span></div>
        <div class="bar"><i style="width:${busy * 100}%;background:#3987e5"></i><i style="width:${starve * 100}%;background:#d95926"></i></div></div>`;
    },
    legendExtra() { return `<span class="faint">· bags: <i style="background:#e5e7eb"></i> filling <i style="background:#ef4444"></i> full <i style="background:#f59e0b"></i> being changed</span>`; },

    // ---------- side tabs
    tab_chutes() { return '<div id="chutes"></div>'; },
    live_chutes(ui) {
      const el = document.getElementById('chutes'); if (!el) return;
      const sim = ui.sim, cap = sim.cfg.bagCapacity;
      el.innerHTML = `<div class="sect"><h3>Chutes <span class="sub">bag fill · click to inspect</span></h3><table class="tbl"><tr><th>Chute</th><th>Destination</th><th>Bag</th><th class="r">Bags</th><th class="r">Sorted</th></tr>${sim.chutes.map((ch) => {
        const f = Math.min(1, ch.count / cap), col = ch.swapping ? '#f59e0b' : f >= 1 ? '#ef4444' : '#3987e5';
        return `<tr class="click" data-open="cell:${sim.grid.idx(Math.floor(ch.cell.x), Math.floor(ch.cell.y))}"><td>${ch.id + 1}</td><td>${ch.dest ? esc(ch.dest.name) : '<b>Reject / overflow</b>'}</td><td style="min-width:70px"><div class="bar" style="margin:0"><i style="width:${f * 100}%;background:${col}"></i></div></td><td class="r">${ch.bags}</td><td class="r">${ch.sorted}</td></tr>`;
      }).join('')}</table></div>`;
    },
    tab_parcels() { return '<div id="parcels"></div>'; },
    live_parcels(ui) {
      const el = document.getElementById('parcels'); if (!el) return;
      const sim = ui.sim, s = sim.stats, total = s.sorted - s.rejected || 1;
      const recent = sim.drops.slice(-12).reverse();
      el.innerHTML = `<div class="sect"><h3>Parcel stream</h3><div class="stats">${[['Arrived', s.arrived], ['Inducted', s.inducted], ['Sorted', s.sorted], ['Rejected', s.rejected], ['At the dock', sim.backlog.length], ['On the sorter', sim.onSorter()]].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div></div>
        <div class="sect"><h3>Just sorted</h3><table class="tbl"><tr><th>SSCC</th><th>To</th><th class="r">Laps</th></tr>${recent.map((d) => `<tr><td class="mono">${d.parcel.sscc}</td><td>${d.chute === sim.reject ? 'reject' : esc(d.parcel.dest.name)}</td><td class="r">${d.parcel.laps}</td></tr>`).join('') || '<tr><td colspan="3" class="faint">Nothing yet</td></tr>'}</table></div>
        <div class="sect"><h3>Destinations</h3><table class="tbl"><tr><th>Destination</th><th class="r">Share</th><th class="r">Chutes</th><th class="r">Sorted</th></tr>${sim.dests.map((d) => `<tr><td>${esc(d.name)}</td><td class="r">${(d.share * 100).toFixed(1)}%</td><td class="r">${d.chutes.length || '<span class="faint">reject</span>'}</td><td class="r">${d.sorted} <span class="faint">${Math.round((d.sorted / total) * 100)}%</span></td></tr>`).join('')}</table></div>`;
    },

    // ---------- inspectors
    cellName: { [WS.CELL.HIGHWAY]: 'Sorter', [WS.CELL.PORT]: 'Induct' },
    cellDetail() { return ''; },
    inspectCell(ui, i) {
      const sim = ui.sim, g = sim.grid, k = g.chuteAt[i];
      if (k >= 0) {
        const ch = sim.chutes[k], cap = sim.cfg.bagCapacity;
        return `<div class="hd"><b>${ch.name}</b><span class="pill">${ch.dest ? esc(ch.dest.name) : 'Reject / overflow'}</span><button class="close">×</button></div>
          <dl class="kv"><dt>Bag</dt><dd>${ch.count} / ${cap} parcels${ch.swapping ? ' · <b>being changed</b>' : ch.count >= cap ? ' · <b>full</b>' : ''}</dd>
          <dt>Bag worker</dt><dd>${ch.worker ? esc(ch.worker.name) + (ch.swapping ? ' changing the bag' : ' on the way') : '—'}</dd>
          <dt>Bags closed</dt><dd>${ch.bags}</dd><dt>Sorted</dt><dd>${ch.sorted} parcels</dd>
          ${ch.dest ? `<dt>Destination</dt><dd>${(ch.dest.share * 100).toFixed(1)}% of the volume · ${ch.dest.chutes.length} chute${ch.dest.chutes.length > 1 ? 's' : ''}</dd>` : '<dt>Takes</dt><dd>unreadable labels, destinations without a chute, and overflow</dd>'}</dl>
          <div class="bar"><i style="width:${Math.min(100, (ch.count / cap) * 100)}%;background:${ch.count >= cap ? '#ef4444' : '#3987e5'}"></i></div>`;
      }
      const name = this.cellName[g.type[i]] || 'Floor';
      return `<div class="hd"><b>Cell X${g.cx(i)} · Y${g.cy(i)}</b><span class="pill">${name}</span><button class="close">×</button></div>
        <dl class="kv">${this.cellDetail(ui, i)}</dl>`;
    },
    inspectPort(ui, p) {
      const busy = p.stats.t ? p.stats.busy / p.stats.t : 0, r = p.ready || p.cur;
      return `<div class="hd"><b>${p.code} · ${esc(p.name)}</b><button class="close">×</button></div>
        <div class="hmi">${r ? `<div class="muted">${p.cur ? 'Scanning' : 'Ready for the sorter'}</div><div class="mono">${r.sscc}</div><div><b>${r.noRead ? 'Label not readable → reject' : esc(r.dest.name)}</b></div><div class="bcwrap" style="margin-top:6px">${WS.Barcode.gs1SVG([['00', r.sscc]], { height: 34 })}</div>` : '<div class="muted">No parcel</div>'}</div>
        <dl class="kv" style="margin-top:10px"><dt>Feed belt</dt><dd>${p.queue.length} parcels</dd><dt>Inducted</dt><dd>${p.done}</dd>
        <dt>Operator busy</dt><dd>${Math.round(busy * 100)}%</dd><dt>Waiting for the sorter</dt><dd>${Math.round((p.stats.blocked / (p.stats.t || 1)) * 100)}% of the time</dd></dl>`;
    },
    cellWord: 'chute',
    depthTag() { return ''; },
    locate() { return '—'; },
    // a parcel sorter without robots: the control room's table lists what its time split counts (a type sets rows)
    fleetRows: null,
    fleetTable(ui) {
      if (!this.fleetRows) return null;
      const sim = ui.sim, C = WS.CHART_COLORS, col = Object.fromEntries(sim.timeSplit.series.map((q) => [q.k, [C[q.slot], q.label]]));
      return this.fleetRows(ui, col);
    },
  };
  WS.hubUI = (o) => Object.assign({}, BASE, o, { live: [...BASE.live, ...(o.live || [])] });
})((globalThis.WS = globalThis.WS || {}));
