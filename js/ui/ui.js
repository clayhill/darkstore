/* DOM user interface: header controls, side-panel tabs (inbound, orders,
 * inventory, outbound, settings), control-room panels, inspector, labels.
 * What differs per storage type (KPI tiles, settings, cell inspector, how a
 * unit's compartments are shown) comes from WS.TypeUI[kind]. */
(function (WS) {
  'use strict';
  const U = WS.U, BC = WS.Barcode, esc = U.esc;
  const $ = (s, r) => (r || document).querySelector(s);
  const STATE_LABEL = { IDLE: 'Idle', MOVING_TO_TARGET: 'To target', DIGGING_BIN: 'Digging', LIFTING_POD: 'Lifting pod', HANDLING: 'Handling', TRANSPORTING_TO_PORT: 'To port', AT_PORT: 'At port', STORING: 'Storing', RESTACKING: 'Restacking', WAITING_IN_TRAFFIC: 'Waiting (traffic)', WAITING_PORT: 'Waiting (port)', TO_CHARGER: 'To charger', CHARGING: 'Charging', YIELDING: 'Yielding' };
  const SPEEDS = [1, 2, 5, 10, 30, 60, 120];
  const SEV_ICON = { critical: '⛔', warning: '⚠️', info: 'ℹ️' };
  const LOG_COL = { order: '#7dd3fc', release: '#93c5fd', pick: '#86efac', pack: '#c4b5fd', ship: '#4ade80', inbound: '#fde68a', warn: '#fca5a5', penalty: '#fb923c', robot: '#facc15', system: '#e2e8f0' };

  class UI {
    constructor(app) {
      this.app = app; this.selection = null; this.tab = 'inbound';
      this.rcLines = []; this.soLines = []; this.logSeen = 0;
      this.init();
    }
    get sim() { return this.app.sim; }
    get terms() { return this.sim.terms; }
    // the storage type's own UI pieces (js/<type>/ui.js)
    get type() { return WS.TypeUI[this.sim.kind]; }
    stateLabel(k) { return (this.sim.stateLabels || {})[k] || STATE_LABEL[k]; }

    init() {
      const app = this.app;
      $('#speeds').innerHTML = SPEEDS.map((s) => `<button data-s="${s}" class="${s === app.speed ? 'on' : ''}">${s}×</button>`).join('');
      $('#speeds').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.setSpeed(+b.dataset.s); });
      $('#btn-play').addEventListener('click', () => this.togglePause());
      $('#views').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) app.setView(b.dataset.view); });
      $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.setTab(b.dataset.tab); });
      $('#iso-tools').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.id === 'btn-fit') { app.iso.fit(); return; }
        const k = b.dataset.opt; app.iso.opts[k] = !app.iso.opts[k]; b.classList.toggle('on', app.iso.opts[k]);
      });
      $('#btn-mapheat').addEventListener('click', (e) => { app.cr.heat = !app.cr.heat; e.target.textContent = app.cr.heat ? 'Heat on' : 'Heat off'; e.target.classList.toggle('on', app.cr.heat); });
      $('#btn-mapheat').classList.add('on');
      $('#scan-form').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#scan').value.trim(); if (v) this.scan(v); });
      $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('.close')) this.closeModal(); });
      document.addEventListener('keydown', (e) => {
        if (e.target.matches('input, select, textarea')) return;
        if (e.code === 'Space') { e.preventDefault(); this.togglePause(); }
        if (e.key === 'Escape') { this.closeModal(); this.select(null); }
      });
      // delegated clicks for entity links anywhere
      // pointerdown, not click: live panels re-render several times a second
      document.body.addEventListener('click', (e) => { if (e.target.closest('a[data-open]')) e.preventDefault(); });
      document.body.addEventListener('pointerdown', (e) => {
        const a = e.target.closest('[data-open]');
        if (!a || e.button !== 0) return;
        e.preventDefault();
        const [k, id] = a.dataset.open.split(':');
        if (k === 'bin') this.showBin(id); else if (k === 'prod') this.showProduct(id); else if (k === 'order') this.showOrder(id);
        else if (k === 'label') this.showLabel(id); else if (k === 'asn') this.showReceipt(id);
        else if (k === 'robot' || k === 'port' || k === 'cell' || k === 'packer') { const hit = { kind: k, id: +id }; this.app.iso.selected = hit; this.select(hit); }
      });
      const legend = this.sim.legendStates || Object.keys(STATE_LABEL).filter((k) => k !== 'YIELDING' && k !== 'LIFTING_POD');
      $('#legend').innerHTML = legend.map((k) => `<span><i style="background:${WS.STATE_COLORS[k]}"></i>${this.stateLabel(k)}</span>`).join('') +
        `<span class="faint">· ABC: <i style="background:${WS.CLASS_COLORS.A}"></i> A <i style="background:${WS.CLASS_COLORS.B}"></i> B <i style="background:${WS.CLASS_COLORS.C}"></i> C</span>`;
      this.setTab('inbound');
    }
    setSpeed(s) { this.app.speed = s; this.app.paused = false; $('#btn-play').textContent = '❚❚'; [...$('#speeds').children].forEach((b) => b.classList.toggle('on', +b.dataset.s === s)); }
    togglePause() { this.app.paused = !this.app.paused; $('#btn-play').textContent = this.app.paused ? '▶' : '❚❚'; }
    toast(msg, err) {
      const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
      clearTimeout(this.tt); this.tt = setTimeout(() => (t.className = 'toast'), 2600);
    }
    onRestart() { this.selection = null; this.logSeen = 0; $('#inspector').classList.add('hidden'); this.rcLines = []; this.soLines = []; this.setTab(this.tab); }

    // ---------------------------------------------------------------- periodic refresh
    refresh() {
      const sim = this.sim;
      $('#clock').textContent = U.fmtClock(sim.time);
      if (this.app.view !== 'floor') { this.renderKPIs(); this.renderPorts(); this.renderAlerts(); this.renderFleet(); this.renderLog(); }
      this.refreshTab();
      if (this.selection) this.renderInspector();
    }
    kpiTile(k, v, unit, d) { return `<div class="kpi"><div class="k">${k}</div><div class="v">${v}<small>${unit || ''}</small></div><div class="d">${d || '&nbsp;'}</div></div>`; }
    renderKPIs() {
      const sim = this.sim, k = sim.kpi, u = k.utilization(true), ur = k.utilization(false);
      const open = sim.oms.orders.filter((o) => o.status !== 'SHIPPED' && o.status !== 'LOADED');
      const onTruck = sim.oms.truck.parcels.length;
      const back = open.filter((o) => o.status === 'BACKORDER').length;
      const charging = sim.robots.filter((r) => r.bucket === 'CHARGE').length, tm = this.terms;
      $('#kpis').innerHTML = [
        this.kpiTile('Throughput', Math.round(k.rate('presented')), tm.units + '/h', `${k.presented} ${tm.units} presented`),
        this.kpiTile('Order lines', Math.round(k.rate('lines')), 'LPH', `${k.unitsPicked} units picked`),
        this.kpiTile('Orders shipped', Math.round(k.rate('shipped')), '/h', `${k.ordersShipped} total`),
        this.kpiTile((tm.machine || 'Robot') + ' utilization', Math.round(u.work * 100), '%', `now ${Math.round(ur.work * 100)}% · waiting ${Math.round(u.wait * 100)}%`),
        ...this.type.kpiTiles(this),
        this.kpiTile('Order cycle', k.cycleN ? U.fmtDur(k.cycleSum / k.cycleN) : '—', '', 'receipt → truck'),
        this.kpiTile('Orders in process', open.length, '', `${back ? back + ' backordered · ' : ''}${onTruck} on truck`),
        sim.cfg.chargers ? this.kpiTile('Fleet battery', Math.round(sim.robots.reduce((s, r) => s + r.battery, 0) / sim.robots.length), '%', `${charging} charging`) : '',
      ].join('');
    }
    renderPorts() {
      const sim = this.sim, cfg = sim.cfg;
      $('#portcards').innerHTML = sim.ports.map((p) => {
        const busy = p.stats.t ? p.stats.busy / p.stats.t : 0, starve = p.stats.t ? p.stats.starved / p.stats.t : 0;
        const dots = [...p.inQ.map(() => '<i class="f"></i>'), p.pick ? '<i class="p"></i>' : '<i></i>', ...p.outQ.map(() => '<i class="f"></i>')].join('');
        const slots = p.kind === 'PICK' ? `${p.slots.filter(Boolean).length}/${p.slots.length} totes` : `${sim.oms.receipts.filter((r) => r.status !== 'RECEIVED').length} open ASN`;
        const status = p.job ? (p.mode === 'manual' ? '<span class="pill PICKED">MANUAL — needs you</span>' : '<span class="pill SHIPPED">ACTIVE</span>') : p.recentStarve > 0.35 ? '<span class="pill BACKORDER">STARVED</span>' : '<span class="pill">WAITING</span>';
        return `<div class="pcard" data-open="port:${p.idx}"><div class="row"><span class="name">${p.code} · ${esc(p.name)}</span>${status}</div>
          <div class="row meta"><span>${p.inbound} inbound · ${slots}</span><span class="qdots">${dots}</span></div>
          <div class="bar" title="busy ${Math.round(busy * 100)}% · starved ${Math.round(starve * 100)}%"><i style="width:${busy * 100}%;background:#3987e5"></i><i style="width:${starve * 100}%;background:#d95926"></i></div>
          <div class="row meta"><span>busy ${Math.round(busy * 100)}% · starved ${Math.round(starve * 100)}%</span><span>${p.stats.presented} ${this.terms.units} · ${p.stats.lines} lines</span></div></div>`;
      }).join('') + `<div class="note">Bar: operator busy (blue) vs. waiting for ${this.terms.units} with demand queued (orange). Cap ${cfg.portInboundCap} ${this.terms.units} in flight per ${this.terms.port}.</div>`;
    }
    renderAlerts() {
      const a = this.sim.kpi.alerts;
      $('#alerts').innerHTML = a.length ? a.map((x) => `<div class="alert ${x.sev}" ${x.port != null ? `data-open="port:${x.port}"` : x.cell != null ? `data-open="cell:${x.cell}"` : ''}><span class="ic">${SEV_ICON[x.sev]}</span><div><b>${esc(x.title)}</b><span>${esc(x.msg)}</span></div></div>`).join('') : '<div class="ok-msg">✓ No bottlenecks detected</div>';
    }
    taskText(r) {
      const t = r.task; if (!t) return '<span class="faint">—</span>';
      const own = this.type.taskText && this.type.taskText(this, r);
      if (own) return own;
      const p = t.port != null ? this.sim.ports[t.port].code : '';
      if (t.type === 'RETRIEVE') return `Retrieve ${t.bin.id} → ${p}`;
      if (t.type === 'STORE') return `Store from ${p}${r.bin ? ' (' + r.bin + ')' : ''}`;
      if (t.type === 'RESTACK') return `Restack ${t.items.length} bin(s)`;
      if (t.type === 'CHARGE') return `Charge @ C${t.charger.id + 1}`;
      return t.type === 'YIELD' ? 'Yield for traffic' : 'Park';
    }
    battBar(b) { const c = b < 15 ? '#ef4444' : b < 30 ? '#facc15' : '#4ade80'; return `<span class="batt"><i style="width:${b}%;background:${c}"></i></span>${Math.round(b)}%`; }
    renderFleet() {
      $('#fleet').innerHTML = '<tr><th>Robot</th><th>State</th><th>Battery</th><th>Task</th><th class="r">Util</th></tr>' + this.sim.robots.map((r) => {
        const st = r.displayState, tot = Object.values(r.stateTime).reduce((a, b) => a + b, 0) || 1;
        const work = Object.entries(r.stateTime).reduce((s, [k, v]) => s + (WS.ROBOT_BUCKET[k] === 'WORK' ? v : 0), 0);
        return `<tr class="click" data-open="robot:${r.id}"><td><b>${r.name}</b></td><td><span class="sdot" style="background:${WS.STATE_COLORS[st]}"></span>${this.stateLabel(st)}</td><td>${this.battBar(r.battery)}</td><td>${this.taskText(r)}</td><td class="r">${Math.round((work / tot) * 100)}%</td></tr>`;
      }).join('');
    }
    renderLog() {
      const logs = this.sim.logs;
      if (logs.length && logs[logs.length - 1].id === this.logSeen) return;
      this.logSeen = logs.length ? logs[logs.length - 1].id : 0;
      $('#log').innerHTML = logs.slice(-80).reverse().map((l) => `<div><span class="t">${U.fmtClock(l.t).slice(-8)}</span><span class="ty" style="color:${LOG_COL[l.type] || '#cbd5e1'}">${l.type}</span><span>${esc(l.msg)}</span></div>`).join('');
    }

    // ---------------------------------------------------------------- tabs
    setTab(t) {
      this.tab = t;
      [...$('#tabs').children].forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
      const body = $('#tab-body');
      body.innerHTML = this['tab_' + t]();
      const bind = this['bind_' + t]; if (bind) bind.call(this, body);
      this.refreshTab(true);
    }
    refreshTab(force) {
      const fn = this['live_' + this.tab];
      if (fn) fn.call(this, force);
    }
    productOptions() { return `<datalist id="prodlist">${this.sim.inv.products.map((p) => `<option value="${p.gtin} — ${esc(p.name)}">`).join('')}</datalist>`; }
    parseGtin(v) { const m = String(v).match(/\d{13}/); return m && this.sim.inv.byGtin.has(m[0]) ? m[0] : null; }
    linesHtml(lines, withBin) {
      if (!lines.length) return '<div class="faint" style="font-size:12px">No lines yet — scan or pick a product.</div>';
      return lines.map((l, k) => { const p = this.sim.inv.byGtin.get(l.gtin); return `<div class="ln"><span><span class="mono">${l.gtin}</span><br><span class="muted">${esc(p.name)}${withBin && l.bin ? ` → ${this.terms.unit} ` + esc(l.bin) : ''}</span></span><b>× ${l.qty}</b><button class="x" data-del="${k}">✕</button></div>`; }).join('');
    }

    // ----- inbound
    tab_inbound() {
      const cfg = this.sim.cfg, tm = this.terms, sample = (this.sim.inv.bins[41] || this.sim.inv.bins[0]).id;
      return `${this.productOptions()}
      <div class="sect"><h3>Receive goods · advance shipping notice</h3><div class="card">
        <div class="field"><label>Supplier</label><input type="text" id="rc-sup" value="Acme Distribution"></div>
        <div class="row3"><div class="field"><label>Product (scan GTIN-13 / EAN)</label><input type="text" id="rc-prod" list="prodlist" placeholder="9521234…"></div>
          <div class="field"><label>Qty</label><input type="number" id="rc-qty" value="24" min="1"></div><div class="field"><button class="btn" id="rc-add">Add</button></div></div>
        <div class="field"><label>Target storage ${tm.unit} (optional — leave empty for system slotting)</label><input type="text" id="rc-bin" placeholder="e.g. ${sample}"></div>
        <div class="lines" id="rc-lines"></div>
        <div class="btns"><button class="btn primary" id="rc-go">Create receipt &amp; call ${tm.units} to goods-in</button></div>
        <div class="note">The IMS reserves compartment space (same-SKU top-up first, then empty compartments). Robots bring those ${tm.units} to the goods-in ${tm.port}, the operator decants and scans each unit, then the ${tm.unit} is stored back using the slotting policy.</div>
      </div></div>
      <div class="sect"><h3>New product <span class="sub">assigns a GS1 GTIN-13</span></h3><div class="card">
        <div class="field"><label>Name</label><input type="text" id="np-name" placeholder="e.g. Espresso Cups 4pk"></div>
        <div class="row2"><div class="field"><label>Unit weight (kg)</label><input type="number" id="np-w" value="0.4" step="0.05" min="0.01"></div><div class="field"><label>Unit volume (L)</label><input type="number" id="np-v" value="1.2" step="0.1" min="0.05"></div></div>
        <div class="field"><label>Expected demand</label><select id="np-d"><option value="0.5">Fast mover</option><option value="0.12" selected>Medium</option><option value="0.03">Slow mover</option></select></div>
        <div class="btns"><button class="btn" id="np-go">Create product</button></div><div id="np-out"></div>
      </div></div>
      <div class="sect"><div class="toggle"><span>Auto-replenishment (min/max)</span><label class="switch"><input type="checkbox" id="rc-auto" ${cfg.autoReplenish ? 'checked' : ''}><span></span></label></div></div>
      <div class="sect"><h3>Receipts</h3><div id="rc-list"></div></div>`;
    }
    bind_inbound(b) {
      const redraw = () => ($('#rc-lines').innerHTML = this.linesHtml(this.rcLines, true));
      redraw();
      $('#rc-add', b).onclick = () => {
        const g = this.parseGtin($('#rc-prod').value), q = +$('#rc-qty').value, bin = $('#rc-bin').value.trim();
        if (!g) return this.toast('Unknown product — scan a valid GTIN-13', true);
        if (bin && !this.sim.inv.findBin(bin)) return this.toast(`Unknown ${this.terms.unit} ${bin}`, true);
        if (!(q > 0)) return this.toast('Quantity must be positive', true);
        this.rcLines.push({ gtin: g, qty: q, bin: bin || null }); $('#rc-prod').value = ''; redraw();
      };
      $('#rc-prod', b).addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#rc-add').click(); });
      $('#rc-lines', b).onclick = (e) => { const d = e.target.closest('[data-del]'); if (d) { this.rcLines.splice(+d.dataset.del, 1); redraw(); } };
      $('#rc-go', b).onclick = () => {
        if (!this.rcLines.length) return this.toast('Add at least one line', true);
        try { const rc = this.sim.oms.createReceipt({ supplier: $('#rc-sup').value || 'Supplier', lines: this.rcLines }); this.rcLines = []; redraw(); this.toast(`${rc.id} created — ${this.terms.units} requested at goods-in`); this.refreshTab(true); }
        catch (e) { this.toast(e.message, true); }
      };
      $('#np-go', b).onclick = () => {
        const name = $('#np-name').value.trim(); if (!name) return this.toast('Enter a product name', true);
        const inv = this.sim.inv, d = +$('#np-d').value;
        const p = inv.addProduct({ name, weight: +$('#np-w').value || 0.4, vol: +$('#np-v').value || 1, demand: d });
        p.hits = this.sim.cfg.orderRate * 1.9 * d / inv.products.reduce((s, x) => s + x.demand, 0);
        p.min = 0; p.max = 0; inv.classify();
        $('#np-out').innerHTML = `<div style="margin-top:10px"><div class="bcwrap">${BC.ean13SVG(p.gtin)}</div><div class="note">${esc(p.name)} · ${p.sku} — now receive it above.</div></div>`;
        $('#np-name').value = '';
        const dl = $('#prodlist'); dl.insertAdjacentHTML('beforeend', `<option value="${p.gtin} — ${esc(p.name)}">`);
        $('#rc-prod').value = p.gtin + ' — ' + p.name;
      };
      $('#rc-auto', b).onchange = (e) => (this.sim.cfg.autoReplenish = e.target.checked);
    }
    live_inbound() {
      const el = $('#rc-list'); if (!el) return;
      const list = this.sim.oms.receipts.slice(-25).reverse();
      el.innerHTML = list.length ? `<table class="tbl"><tr><th>ASN</th><th>Supplier</th><th class="r">Units</th><th>Status</th></tr>${list.map((r) => {
        const tot = r.lines.reduce((s, l) => s + l.qty, 0), got = r.lines.reduce((s, l) => s + l.received, 0);
        return `<tr class="click" data-open="asn:${r.id}"><td class="mono">${r.id}</td><td>${esc(r.supplier)}</td><td class="r">${got}/${tot}</td><td><span class="pill ${r.status}">${r.status.replace('_', ' ')}</span></td></tr>`;
      }).join('')}</table>` : '<div class="faint">No receipts yet.</div>';
    }

    // ----- orders
    tab_orders() {
      const cfg = this.sim.cfg;
      return `${this.productOptions()}
      <div class="sect"><h3>New customer order</h3><div class="card">
        <div class="row2"><div class="field"><label>Customer</label><input type="text" id="so-cust" placeholder="(random)"></div>
          <div class="field"><label>Priority</label><select id="so-prio"><option value="0">Standard</option><option value="2">Express</option></select></div></div>
        <div class="row2"><div class="field"><label>Postcode</label><input type="text" id="so-pc" placeholder="1000"></div><div class="field"><label>City</label><input type="text" id="so-city" placeholder="Brussels"></div></div>
        <div class="row3"><div class="field"><label>Scan product barcode (GTIN-13)</label><input type="text" id="so-prod" list="prodlist" placeholder="9521234…"></div>
          <div class="field"><label>Qty</label><input type="number" id="so-qty" value="1" min="1"></div><div class="field"><button class="btn" id="so-add">Add</button></div></div>
        <div class="lines" id="so-lines"></div>
        <div class="btns"><button class="btn primary" id="so-go">Submit order</button><button class="btn ghost" id="so-rand">Random order</button><button class="btn ghost" id="so-burst">Burst ×20</button></div>
      </div></div>
      <div class="sect"><div class="toggle"><span>Automatic order intake</span><label class="switch"><input type="checkbox" id="so-auto" ${cfg.autoOrders ? 'checked' : ''}><span></span></label></div>
        <div class="field"><label>Order rate: <b id="so-rate-v">${cfg.orderRate}</b> orders / hour</label><input type="range" id="so-rate" min="0" max="900" step="10" value="${cfg.orderRate}"></div></div>
      <div class="sect"><h3>Orders</h3><div class="stats" id="so-stats"></div><div id="so-list"></div></div>`;
    }
    bind_orders(b) {
      const redraw = () => ($('#so-lines').innerHTML = this.linesHtml(this.soLines));
      redraw();
      $('#so-add', b).onclick = () => {
        const g = this.parseGtin($('#so-prod').value), q = +$('#so-qty').value;
        if (!g) return this.toast('Unknown product — scan a valid GTIN-13', true);
        this.soLines.push({ gtin: g, qty: Math.max(1, q | 0) }); $('#so-prod').value = ''; redraw(); $('#so-prod').focus();
      };
      $('#so-prod', b).addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#so-add').click(); });
      $('#so-lines', b).onclick = (e) => { const d = e.target.closest('[data-del]'); if (d) { this.soLines.splice(+d.dataset.del, 1); redraw(); } };
      $('#so-go', b).onclick = () => {
        if (!this.soLines.length) return this.toast('Add at least one product', true);
        try {
          const o = this.sim.oms.createOrder({ customer: $('#so-cust').value.trim() || undefined, postcode: $('#so-pc').value.trim() || undefined, city: $('#so-city').value.trim() || undefined, priority: +$('#so-prio').value, lines: this.soLines });
          this.soLines = []; redraw(); this.toast(`${o.id} accepted — watch it flow`); this.refreshTab(true);
        } catch (e) { this.toast(e.message, true); }
      };
      $('#so-rand', b).onclick = () => { this.sim.oms.generateOrder(); this.toast('Random order created'); };
      $('#so-burst', b).onclick = () => { for (let k = 0; k < 20; k++) this.sim.oms.generateOrder(); this.toast('20 orders dropped in'); };
      $('#so-auto', b).onchange = (e) => (this.sim.cfg.autoOrders = e.target.checked);
      $('#so-rate', b).oninput = (e) => { this.sim.cfg.orderRate = +e.target.value; $('#so-rate-v').textContent = e.target.value; this.sim.oms.nextGap = undefined; };
    }
    live_orders() {
      const el = $('#so-list'); if (!el) return;
      const os = this.sim.oms.orders, cnt = (f) => os.filter(f).length;
      $('#so-stats').innerHTML = [['Open', cnt((o) => o.status !== 'SHIPPED')], ['Picking', cnt((o) => o.status === 'RELEASED' || o.status === 'PICKING')], ['Backorder', cnt((o) => o.status === 'BACKORDER')], ['Packing', cnt((o) => ['PICKED', 'CONVEYOR', 'TO_PACK', 'PACKING'].includes(o.status))], ['On dock', cnt((o) => o.status === 'PACKED' || o.status === 'LOADED')], ['Shipped', this.sim.kpi.ordersShipped]].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
      const list = os.slice(-60).reverse(), now = this.sim.time;
      el.innerHTML = `<table class="tbl"><tr><th>Order</th><th>Status</th><th class="r">Lines</th><th>Where</th><th class="r">Age</th></tr>${list.map((o) => {
        const where = o.port >= 0 && ['RELEASED', 'PICKING'].includes(o.status) ? `${this.sim.ports[o.port].code}/${o.slot + 1}` : o.tote ? o.tote.id : o.sscc ? 'SSCC' : '';
        const age = (o.times.shipped || now) - o.created;
        return `<tr class="click" data-open="order:${o.id}"><td class="mono">${o.id}${o.source === 'manual' ? ' ★' : ''}</td><td><span class="pill ${o.status}">${o.status.replace('_', ' ')}</span></td><td class="r">${o.lines.length}</td><td>${where}</td><td class="r">${U.fmtDur(age)}</td></tr>`;
      }).join('')}</table>`;
    }

    // ----- inventory
    tab_inventory() {
      return `<div class="sect"><div class="stats" id="inv-stats"></div>
        <div class="field"><input type="text" id="inv-q" placeholder="Filter by name, GTIN or SKU"></div>
        <div class="row2" style="margin-bottom:8px"><select id="inv-sort"><option value="hits">Sort: velocity</option><option value="name">Sort: name</option><option value="avail">Sort: available</option><option value="bins">Sort: ${this.terms.units}</option></select><select id="inv-cls"><option value="">All classes</option><option>A</option><option>B</option><option>C</option></select></div>
        <div id="inv-list"></div></div>`;
    }
    bind_inventory(b) {
      for (const id of ['#inv-q', '#inv-sort', '#inv-cls']) $(id, b).addEventListener('input', () => this.live_inventory(true));
    }
    live_inventory(force) {
      const el = $('#inv-list'); if (!el) return;
      if (!force && document.activeElement && document.activeElement.closest('#tab-body') && this._invT && performance.now() - this._invT < 2000) return;
      this._invT = performance.now();
      const inv = this.sim.inv, tm = this.terms;
      const empty = inv.bins.filter((b) => inv.isEmpty(b)).length, inGrid = inv.bins.filter((b) => b.loc === 'grid').length;
      const cap = this.sim.storageCapacity();
      $('#inv-stats').innerHTML = [['SKUs', inv.products.length], [tm.Units, inv.bins.length], ['Empty ' + tm.units, empty], [tm.Store + ' fill', Math.round((inGrid / cap) * 100) + '%'], ['On hand', inv.products.reduce((s, p) => s + p.onHand, 0)], ['Reserved', inv.products.reduce((s, p) => s + p.reserved, 0)]].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
      const q = ($('#inv-q').value || '').toLowerCase(), cls = $('#inv-cls').value, srt = $('#inv-sort').value;
      let ps = inv.products.filter((p) => (!q || p.name.toLowerCase().includes(q) || p.gtin.includes(q) || p.sku.toLowerCase().includes(q)) && (!cls || p.cls === cls));
      const key = { hits: (p) => -p.hits, name: (p) => p.name, avail: (p) => p.onHand - p.reserved, bins: (p) => -p.bins.size }[srt];
      ps.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
      el.innerHTML = `<table class="tbl"><tr><th>Product</th><th>ABC</th><th class="r">Avail</th><th class="r">${tm.Units}</th><th class="r">Lines/h</th></tr>${ps.slice(0, 120).map((p) => `<tr class="click" data-open="prod:${p.gtin}"><td><span class="mono faint">${p.gtin}</span><br>${esc(p.name)}</td><td><span class="pill ${p.cls}">${p.cls}</span></td><td class="r">${p.onHand - p.reserved}${p.incoming ? `<br><span class="faint">+${p.incoming}</span>` : ''}</td><td class="r">${p.bins.size}</td><td class="r">${p.hits.toFixed(1)}</td></tr>`).join('')}</table>${ps.length > 120 ? `<div class="note">${ps.length - 120} more — refine the filter.</div>` : ''}`;
    }

    // ----- outbound
    tab_outbound() { return '<div id="ob"></div>'; }
    live_outbound() {
      const el = $('#ob'); if (!el) return;
      const oms = this.sim.oms, cfg = this.sim.cfg, tr = oms.truck;
      const packed = oms.orders.filter((o) => o.sscc).slice(-30).reverse();
      el.innerHTML = `<div class="sect"><h3>Pack stations</h3>${oms.packers.map((pk) => `<div class="pcard" data-open="packer:${pk.idx}"><div class="row"><span class="name">${pk.name}</span>${pk.cur ? `<span class="pill PACKING">PACKING ${pk.cur.id}</span>` : '<span class="pill">IDLE</span>'}</div>
        <div class="row meta"><span>${pk.queue.length} totes queued · ${pk.incoming} on conveyor</span><span>${pk.done} packed</span></div>${pk.cur ? `<div class="bar"><i style="width:${Math.min(100, (pk.t / pk.dur) * 100)}%;background:#3987e5"></i></div>` : ''}</div>`).join('')}</div>
        <div class="sect"><h3>Outbound dock</h3><div class="card"><div class="row2"><div><b>${tr.id}</b> · ${tr.carrier.name}<br><span class="muted">${tr.parcels.length}/${cfg.truckCapacity} parcels · departs at capacity or ${U.fmtDur(cfg.truckCutoff)} cut-off</span></div>
        <div style="text-align:right">${tr.departing ? '<span class="pill SHIPPED">DEPARTING</span>' : `<span class="muted">cut-off in</span><br><b>${tr.parcels.length ? U.fmtDur(Math.max(0, cfg.truckCutoff - (this.sim.time - tr.arrived))) : '—'}</b>`}</div></div>
        <div class="bar"><i style="width:${(tr.parcels.length / cfg.truckCapacity) * 100}%;background:#3987e5"></i></div></div>
        ${oms.trucksGone.length ? `<table class="tbl" style="margin-top:8px"><tr><th>Truck</th><th>Carrier</th><th class="r">Parcels</th><th class="r">Departed</th></tr>${oms.trucksGone.slice(-6).reverse().map((t) => `<tr><td>${t.id}</td><td>${t.carrier}</td><td class="r">${t.parcels}</td><td class="r">${U.fmtClock(t.t)}</td></tr>`).join('')}</table>` : ''}</div>
        <div class="sect"><h3>Labelled parcels · SSCC</h3>${packed.length ? `<table class="tbl"><tr><th>SSCC</th><th>Order</th><th>Status</th></tr>${packed.map((o) => `<tr class="click" data-open="label:${o.id}"><td class="mono">${o.sscc}</td><td>${o.id}</td><td><span class="pill ${o.status}">${o.status}</span></td></tr>`).join('')}</table>` : '<div class="faint">No parcels packed yet.</div>'}</div>`;
    }

    // ----- settings
    tab_settings() {
      const c = this.sim.cfg, tm = this.terms;
      const num = (k, label, step, min, max) => `<div class="field"><label>${label}</label><input type="number" data-cfg="${k}" value="${c[k]}" step="${step || 1}" min="${min ?? 0}" ${max ? `max="${max}"` : ''}></div>`;
      const sel = (k, label, opts) => `<div class="field"><label>${label}</label><select data-cfg="${k}">${opts.map(([v, t]) => `<option value="${v}" ${c[k] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
      const t = this.type.settings(this, c, num, sel);
      return `<div class="sect"><h3>Live policies</h3><div class="card">
        ${t.live}
        <div class="row2">${num('pickPerUnit', 'Pick time / unit (s)', 0.1, 0.5)}${num('truckCapacity', 'Truck capacity', 1, 1)}</div>
        <div class="row2">${num('truckCutoff', 'Truck cut-off (s)', 60, 60)}${c.chargers ? num('battLow', 'Charge below (%)', 1, 5, 80) : ''}</div>
        <div class="note">Applied immediately. Each ${tm.port} can be switched to manual operation from its inspector (click a ${tm.port}).</div></div></div>
      <div class="sect"><h3>Scenario <span class="sub">restarts the simulation</span></h3><div class="card">
        ${t.scenario}
        <div class="row2">${num('pickPorts', 'Pick ' + tm.ports, 1, 1, 7)}${num('goodsInPorts', 'Goods-in ' + tm.ports, 1, 0, 3)}</div>
        <div class="row2">${num('packStations', 'Pack stations', 1, 1, 5)}${num('products', 'SKUs', 10, 20, 2000)}</div>
        ${num('seed', 'Random seed', 1, 1)}
        <div class="btns"><button class="btn primary" id="cfg-restart">Apply &amp; restart</button><button class="btn ghost" id="cfg-reset">Defaults</button></div>
        ${t.note ? `<div class="note">${t.note}</div>` : ''}</div></div>
      <div class="sect"><h3>About the model</h3><div class="card" style="font-size:12px;color:var(--muted)">${t.about}</div></div>`;
    }
    bind_settings(b) {
      const live = ['pickPerUnit', 'truckCapacity', 'truckCutoff', 'battLow', ...this.type.live]; // apply without a restart
      b.querySelectorAll('[data-cfg]').forEach((el) => {
        const k = el.dataset.cfg;
        if (live.includes(k)) el.addEventListener('change', () => { this.sim.cfg[k] = el.tagName === 'SELECT' ? el.value : +el.value; this.toast('Applied: ' + k); });
      });
      $('#cfg-restart', b).onclick = () => {
        const cfg = {};
        b.querySelectorAll('[data-cfg]').forEach((el) => (cfg[el.dataset.cfg] = el.tagName === 'SELECT' ? el.value : +el.value));
        const keep = { autoOrders: this.sim.cfg.autoOrders, orderRate: this.sim.cfg.orderRate, autoReplenish: this.sim.cfg.autoReplenish };
        this.app.restart(Object.assign({}, this.sim.cfg, cfg, keep));
      };
      $('#cfg-reset', b).onclick = () => this.app.restart({});
    }

    // ---------------------------------------------------------------- inspector
    select(hit) {
      this.selection = hit;
      const el = $('#inspector');
      if (!hit) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      this.renderInspector(true);
    }
    renderInspector(force) {
      const el = $('#inspector'), s = this.selection, sim = this.sim;
      if (!s) return;
      if (!force && (el.matches(':hover') || (el.contains(document.activeElement) && document.activeElement.tagName === 'SELECT'))) return;
      let html = '';
      if (s.kind === 'robot') html = this.inspectRobot(sim.robots[s.id]);
      else if (s.kind === 'cell') html = this.inspectCell(s.id);
      else if (s.kind === 'port') html = this.inspectPort(sim.ports[s.id]);
      else if (s.kind === 'packer') html = this.inspectPacker(sim.oms.packers[s.id]);
      else if (s.kind === 'dock') html = '<div class="hd"><b>Outbound dock</b><button class="close">×</button></div>' + '<div id="ob-insp"></div>';
      el.innerHTML = html;
      el.querySelector('.close').onclick = () => { this.select(null); this.app.iso.selected = null; };
      if (s.kind === 'port') this.bindPort(el, sim.ports[s.id]);
      if (s.kind === 'dock') { const t = sim.oms.truck; el.querySelector('#ob-insp').innerHTML = `<dl class="kv"><dt>Truck</dt><dd>${t.id}</dd><dt>Carrier</dt><dd>${t.carrier.name}</dd><dt>Parcels</dt><dd>${t.parcels.length}/${sim.cfg.truckCapacity}</dd><dt>At dock since</dt><dd>${U.fmtClock(t.arrived)}</dd></dl>`; }
    }
    inspectRobot(r) {
      const st = r.displayState, sim = this.sim;
      const tot = Object.values(r.stateTime).reduce((a, b) => a + b, 0) || 1;
      const bars = Object.entries(r.stateTime).filter(([, v]) => v / tot > 0.01).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<i style="width:${(v / tot) * 100}%;background:${WS.STATE_COLORS[k]}" title="${this.stateLabel(k)} ${Math.round((v / tot) * 100)}%"></i>`).join('');
      const T = this.type;
      const dest = r.goal && r.op && r.op.op === 'move' ? `${r.goal.x}, ${r.goal.y}` : '—';
      return `<div class="hd"><span class="sdot" style="background:${WS.STATE_COLORS[st]};width:12px;height:12px"></span><b>${this.terms.machine || 'Robot'} ${r.name}</b><span class="pill">${this.stateLabel(st)}</span><button class="close">×</button></div>
        <dl class="kv"><dt>Position</dt><dd>${T.position ? T.position(r) : `X ${r.x} · Y ${r.y}`}${r.busy ? ' <span class="pill BACKORDER">cell blocked</span>' : ''}</dd>
        <dt>Speed</dt><dd>${(T.speed ? T.speed(r) : r.v * sim.cfg.cellSize).toFixed(2)} m/s · ${T.motion(r)}</dd>
        <dt>Destination</dt><dd>${dest}</dd><dt>Task</dt><dd>${this.taskText(r)}</dd>
        <dt>Carrying</dt><dd>${r.bin ? `<a href="#" data-open="bin:${r.bin}">${r.bin}</a>` : '—'}</dd>
        ${T.mechanism(r)}
        ${T.power ? `<dt>Power</dt><dd>${T.power(r)}</dd>` : `<dt>Battery</dt><dd>${this.battBar(r.battery)}</dd><dt>Reserved cells</dt><dd>${r.claims.size}</dd>`}
        <dt>Tasks done</dt><dd>${r.tasksDone} · ${r.lifts} ${T.liftsLabel}</dd>
        <dt>Distance</dt><dd>${(r.distance * sim.cfg.cellSize / 1000).toFixed(2)} km</dd></dl>
        <h3>Time by state</h3><div class="bar" style="height:10px">${bars}</div>`;
    }
    binRow(id, depth) {
      const inv = this.sim.inv, b = inv.binById.get(id), cls = inv.binClass(b);
      const content = b.comps.filter((c) => c.gtin).map((c) => `${c.qty}× ${esc(inv.byGtin.get(c.gtin).name)}`).join(', ') || '<span class="faint">empty</span>';
      return `<div class="sb" data-open="bin:${id}" style="border-left-color:${WS.CLASS_COLORS[cls]}"><span class="faint">${this.type.depthTag(depth)}</span><span class="mono">${id}${b.requests.length ? ' ★' : ''}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${content}</span></div>`;
    }
    inspectCell(i) { return this.type.inspectCell(this, i); }
    // all compartments of a unit side by side (types with other layouts override unitView)
    compGrid(b, cell) { return `<div class="comps ${b.ncomp > 1 ? 'n' + b.ncomp : ''}">${b.comps.map((c, k) => cell(k)).join('')}</div>`; }
    compCell(b, k, hl) {
      const c = b.comps[k];
      return `<div class="comp ${hl ? 'hl' : ''}"><span class="faint">#${k + 1}</span><b>${c.qty}</b>${c.gtin ? esc(this.sim.inv.byGtin.get(c.gtin).name) : '<span class="faint">empty</span>'}</div>`;
    }
    inspectPort(p) {
      const sim = this.sim, inv = sim.inv, j = p.job, ln = p.currentLine, tm = this.terms;
      let hmi = `<div class="hmi"><div class="muted">Waiting for next ${tm.unit}…</div></div>`;
      if (j) {
        const b = j.bin, cell = (k) => this.compCell(b, k, ln && ln.comp === k);
        const comps = this.type.unitView ? this.type.unitView(this, b, p, cell) : this.compGrid(b, cell);
        let task;
        if (ln) {
          const prod = inv.byGtin.get(ln.gtin);
          task = p.kind === 'PICK'
            ? `<div class="muted">PICK from ${sim.compLabel(ln.comp)} → put in slot ${ln.order.slot + 1} (tote ${ln.order.tote ? ln.order.tote.id : '—'})</div><div class="big">${ln.qty}×</div><div><b>${esc(prod.name)}</b></div><div class="bcwrap" style="margin-top:6px">${BC.ean13SVG(prod.gtin, { height: 34, module: 1.3 })}</div>`
            : `<div class="muted">DECANT into ${sim.compLabel(ln.comp)} · ${ln.receipt.id}</div><div class="big">${ln.qty}×</div><div><b>${esc(prod.name)}</b></div><div class="bcwrap" style="margin-top:6px">${BC.ean13SVG(prod.gtin, { height: 34, module: 1.3 })}</div>`;
        } else task = `<div class="muted">${j.lines.length ? 'All lines done — releasing ' + tm.unit : 'No lines for this ' + tm.unit}</div>`;
        hmi = `<div class="hmi"><div class="row2" style="align-items:center"><div><span class="muted">${tm.Unit}</span> <b class="mono">${b.id}</b></div><div style="text-align:right" class="muted">line ${Math.min(j.next + 1, j.lines.length)}/${j.lines.length}</div></div>
          ${comps}${task}
          ${p.mode === 'manual' ? `<div class="btns"><button class="btn primary" id="pt-confirm">${ln ? 'Confirm ' + (p.kind === 'PICK' ? 'pick' : 'decant') : 'Release ' + tm.unit}</button></div>` : `<div class="bar"><i style="width:${Math.min(100, (j.t / j.total) * 100)}%;background:#3987e5"></i></div>`}</div>`;
      }
      const wall = p.kind === 'PICK' ? `<h3>Put wall</h3><div class="wall">${p.slots.map((o, k) => {
        const on = ln && o && ln.order === o;
        return `<div class="slot ${on ? 'on' : ''}" ${o ? `data-open="order:${o.id}"` : ''}><div class="lamp"></div>Slot ${k + 1}${o ? `<b>${o.id.slice(3)}</b>${o.lines.reduce((s, l) => s + l.picked, 0)}/${sim.oms.units(o)} u` : '<b class="faint">free</b>'}</div>`;
      }).join('')}</div>` : '';
      const busy = p.stats.t ? p.stats.busy / p.stats.t : 0;
      return `<div class="hd"><b>${p.code} · ${esc(p.name)}</b><button class="close">×</button></div>
        <div class="toggle"><span>Operator mode</span><select id="pt-mode" style="width:auto"><option value="auto" ${p.mode === 'auto' ? 'selected' : ''}>Simulated operator</option><option value="manual" ${p.mode === 'manual' ? 'selected' : ''}>Manual (you pick)</option></select></div>
        ${hmi}${wall}
        <dl class="kv" style="margin-top:10px"><dt>Queue</dt><dd>${p.inQ.length} in · ${p.pick ? 1 : 0} at pick · ${p.outQ.length} out · ${p.inbound} inbound</dd>
        <dt>${tm.Units} presented</dt><dd>${p.stats.presented}</dd><dt>Lines · units</dt><dd>${p.stats.lines} · ${p.stats.units}</dd><dt>Operator busy</dt><dd>${Math.round(busy * 100)}%</dd><dt>Starved</dt><dd>${Math.round((p.stats.starved / (p.stats.t || 1)) * 100)}% overall · ${Math.round(p.recentStarve * 100)}% recent</dd></dl>`;
    }
    bindPort(el, p) {
      const m = el.querySelector('#pt-mode'); if (m) m.onchange = () => { p.mode = m.value; this.renderInspector(true); };
      const c = el.querySelector('#pt-confirm'); if (c) c.onclick = () => { p.confirmNext(); this.renderInspector(true); };
    }
    inspectPacker(pk) {
      const o = pk.cur;
      return `<div class="hd"><b>${pk.name}</b><button class="close">×</button></div>
        <dl class="kv"><dt>Status</dt><dd>${o ? 'Packing ' + `<a href="#" data-open="order:${o.id}">${o.id}</a>` : 'Idle'}</dd><dt>Queue</dt><dd>${pk.queue.length} totes · ${pk.incoming} on conveyor</dd><dt>Packed</dt><dd>${pk.done}</dd></dl>
        ${o ? `<div class="bar"><i style="width:${Math.min(100, (pk.t / pk.dur) * 100)}%;background:#3987e5"></i></div><div class="note">Scan tote ${o.tote ? o.tote.id : ''} → verify ${this.sim.oms.units(o)} units → carton → print SSCC label → parcel conveyor.</div>` : ''}`;
    }

    // ---------------------------------------------------------------- modals
    modal(title, body) {
      $('#modal-card').innerHTML = `<div class="hd"><b>${title}</b><button class="close">×</button></div>${body}`;
      $('#modal').classList.remove('hidden');
    }
    closeModal() { $('#modal').classList.add('hidden'); }
    binLocation(b) {
      if (b.loc === 'grid') return this.type.locate(this, b);
      if (b.loc === 'robot') return `On robot ${this.sim.robots[b.robot].name}`;
      if (b.loc === 'port') return `At port ${this.sim.ports[b.port].code}`;
      return b.loc;
    }
    showProduct(gtin) {
      const inv = this.sim.inv, p = inv.byGtin.get(gtin); if (!p) return;
      const rows = [];
      for (const id of p.bins) { const b = inv.binById.get(id); b.comps.forEach((c, k) => { if (c.gtin === gtin) rows.push({ b, k, c }); }); }
      rows.sort((a, b) => inv.binDepth(a.b) - inv.binDepth(b.b));
      this.modal(esc(p.name), `<div class="row2"><div><div class="bcwrap">${BC.ean13SVG(p.gtin)}</div><div class="note">GS1 GTIN-13 / EAN-13</div></div>
        <dl class="kv"><dt>SKU</dt><dd>${p.sku}</dd><dt>Class</dt><dd><span class="pill ${p.cls}">${p.cls}</span> · ${p.hits.toFixed(1)} lines/h</dd><dt>Unit</dt><dd>${p.weight} kg · ${p.vol} L</dd>
        <dt>On hand</dt><dd>${p.onHand}</dd><dt>Reserved</dt><dd>${p.reserved}</dd><dt>Incoming</dt><dd>${p.incoming}</dd><dt>Min / max</dt><dd>${p.min || '—'} / ${p.max || '—'}</dd><dt>Picked</dt><dd>${p.lines} lines · ${p.units} units</dd></dl></div>
        <h3 style="margin-top:12px">Stock locations</h3><table class="tbl"><tr><th>${this.terms.Unit}</th><th>Location</th><th class="r">Comp</th><th class="r">Qty</th><th class="r">Resv</th></tr>${rows.map(({ b, k, c }) => `<tr class="click" data-open="bin:${b.id}"><td class="mono">${b.id}</td><td>${this.binLocation(b)}</td><td class="r">${k + 1}/${b.ncomp}</td><td class="r">${c.qty}${c.incoming ? ` +${c.incoming}` : ''}</td><td class="r">${c.reserved}</td></tr>`).join('') || '<tr><td colspan="5" class="faint">No stock</td></tr>'}</table>`);
    }
    showBin(id) {
      const inv = this.sim.inv, b = inv.findBin(id); if (!b) return this.toast('Unknown bin ' + id, true);
      const T = this.type;
      const cell = (k) => { const c = b.comps[k]; return `<div class="comp"><span class="faint">#${k + 1}</span><b>${c.qty}${c.incoming ? `<span class="faint" style="font-size:11px"> +${c.incoming}</span>` : ''}</b>${c.gtin ? `<a href="#" data-open="prod:${c.gtin}">${esc(inv.byGtin.get(c.gtin).name)}</a><br><span class="faint">${c.reserved} reserved</span>` : '<span class="faint">empty</span>'}</div>`; };
      const comps = T.unitComps ? T.unitComps(this, b, cell) : this.compGrid(b, cell);
      this.modal(`Storage ${this.terms.unit} ` + b.id, `<div class="bcwrap">${BC.gs1SVG([['8003', b.grai]], { height: 50 })}</div><div class="note">GS1-128 · AI 8003 GRAI (returnable asset)</div>
        <dl class="kv" style="margin-top:10px"><dt>Location</dt><dd>${this.binLocation(b)}</dd><dt>Gross weight</dt><dd>${inv.binWeight(b).toFixed(1)} kg</dd><dt>Class</dt><dd>${inv.binClass(b)}</dd><dt>Presentations</dt><dd>${b.presentations}</dd>
        <dt>Requests</dt><dd>${b.requests.map((q) => this.sim.ports[q.port].code + ' (' + q.lines.length + ' lines)').join(', ') || '—'}</dd></dl>
        ${comps}
        ${b.loc === 'grid' ? `<div class="btns"><button class="btn" data-open="cell:${this.sim.unitCell(b)}">Show ${T.cellWord}</button></div>` : ''}`);
    }
    showOrder(id) {
      const o = this.sim.oms.byId.get(id); if (!o) return this.toast('Unknown order ' + id, true);
      const inv = this.sim.inv, tl = o.times;
      const steps = [['Received', tl.created], ['Released to port', tl.released], ['First pick', tl.firstPick], ['Picked', tl.picked], ['Packed', tl.packed], ['On truck', tl.loaded], ['Shipped', tl.shipped]];
      this.modal(`Order ${o.id} <span class="pill ${o.status}">${o.status}</span>`, `<dl class="kv"><dt>Customer</dt><dd>${esc(o.customer)} · ${esc(o.postcode)} ${esc(o.city)} ${o.country}</dd><dt>Priority</dt><dd>${o.priority ? 'Express' : 'Standard'}</dd>
        <dt>Port / slot</dt><dd>${o.port >= 0 ? this.sim.ports[o.port].code + ' / ' + (o.slot + 1) : '—'}</dd><dt>Order tote</dt><dd>${o.tote ? o.tote.id : o.toteId || '—'}</dd>${o.sscc ? `<dt>SSCC</dt><dd class="mono">${o.sscc}</dd><dt>Carrier</dt><dd>${o.carrier.name}</dd>` : ''}</dl>
        <table class="tbl"><tr><th>GTIN</th><th>Product</th><th class="r">Qty</th><th class="r">Picked</th></tr>${o.lines.map((l) => `<tr class="click" data-open="prod:${l.gtin}"><td class="mono">${l.gtin}</td><td>${esc(inv.byGtin.get(l.gtin).name)}</td><td class="r">${l.qty}</td><td class="r">${l.picked}</td></tr>`).join('')}</table>
        <h3 style="margin-top:12px">Timeline</h3><dl class="kv">${steps.map(([k, t]) => `<dt>${k}</dt><dd>${t != null ? U.fmtClock(t) + (k !== 'Received' ? ` <span class="faint">+${U.fmtDur(t - tl.created)}</span>` : '') : '<span class="faint">—</span>'}</dd>`).join('')}</dl>
        ${o.tote ? `<div class="bcwrap">${BC.gs1SVG([['8003', o.tote.grai]], { height: 40 })}</div><div class="note">Order tote ${o.tote.id} · GS1-128 GRAI</div>` : ''}
        ${o.sscc ? `<div class="btns"><button class="btn primary" data-open="label:${o.id}">Show shipping label</button></div>` : ''}`);
    }
    showLabel(id) {
      const o = this.sim.oms.byId.get(id); if (!o || !o.sscc) return;
      const units = this.sim.oms.units(o), pc = o.postcode.replace(/\D/g, '');
      this.modal('GS1 logistics label', `<div class="label-sheet">
        <div class="sec two"><div><div class="t">From</div><b>DarkStore DC</b><br>Rue de l'Entrepôt 1<br>1000 Brussels, BE</div><div><div class="t">To</div><b>${esc(o.customer)}</b><br>${esc(o.postcode)} ${esc(o.city)}<br>${o.country}</div></div>
        <div class="sec two"><div><div class="t">Carrier</div><div class="big">${o.carrier.name}</div></div><div><div class="t">Order · Units</div><div class="big">${o.id.slice(3)} · ${units}</div></div></div>
        <div class="sec">${BC.gs1SVG([['420', pc || '0000'], ['400', o.id]], { height: 46, module: 1.2 })}</div>
        <div class="sec"><div class="t">SSCC</div><div class="big mono">${o.sscc}</div>${BC.gs1SVG([['00', o.sscc]], { height: 70, module: 1.5 })}</div></div>
        <div class="note">Layout follows the GS1 logistic label: trading-partner block, carrier block with (420) ship-to postal code + (400) order reference, and the SSCC in GS1-128 at the bottom.</div>`);
    }
    showReceipt(id) {
      const rc = this.sim.oms.receipts.find((r) => r.id === id); if (!rc) return;
      const inv = this.sim.inv;
      this.modal(`Receipt ${rc.id} <span class="pill ${rc.status}">${rc.status}</span>`, `<dl class="kv"><dt>Supplier</dt><dd>${esc(rc.supplier)}</dd><dt>Created</dt><dd>${U.fmtClock(rc.created)}</dd></dl>
        <table class="tbl"><tr><th>Product</th><th class="r">Qty</th><th class="r">Recv</th><th>Bins</th></tr>${rc.lines.map((l) => `<tr><td><a href="#" data-open="prod:${l.gtin}">${esc(inv.byGtin.get(l.gtin).name)}</a></td><td class="r">${l.qty}</td><td class="r">${l.received}${l.short ? ` <span class="faint">(${l.short} no space)</span>` : ''}</td><td>${l.bins.map((b) => `<a href="#" data-open="bin:${b}">${b}</a>`).join(' ')}</td></tr>`).join('')}</table>`);
    }

    scan(v) {
      const sim = this.sim, id = BC.identify(v);
      $('#scan').select();
      if (id.type === 'GTIN') { if (sim.inv.byGtin.has(id.value)) return this.showProduct(id.value); return this.toast('GTIN not in item master: ' + id.value, true); }
      if (id.type === 'SSCC') { const o = sim.oms.orders.find((x) => x.sscc === id.value); if (o) return this.showLabel(o.id); return this.toast('No parcel with SSCC ' + id.value, true); }
      const s = id.value;
      if (sim.inv.findBin(s)) return this.showBin(s);
      const tote = sim.oms.totes.find((t) => t.id === s || t.grai === s);
      if (tote) { if (tote.order) return this.showOrder(tote.order.id); return this.toast(`Tote ${tote.id} is empty (in tote stack)`); }
      if (sim.oms.byId.has(s)) return this.showOrder(s);
      if (/^\d{6}$/.test(s) && sim.oms.byId.has('SO-' + s)) return this.showOrder('SO-' + s);
      if (sim.oms.receipts.find((r) => r.id === s)) return this.showReceipt(s);
      const r = sim.robots.find((x) => x.name === s); if (r) { this.app.iso.selected = { kind: 'robot', id: r.id }; return this.select({ kind: 'robot', id: r.id }); }
      const p = sim.ports.find((x) => x.code === s); if (p) return this.select({ kind: 'port', id: p.idx });
      const prods = sim.inv.products.filter((x) => x.name.toUpperCase().includes(s));
      if (prods.length === 1) return this.showProduct(prods[0].gtin);
      this.toast('Nothing found for "' + v + '"', true);
    }
  }

  WS.UI = UI;
})((globalThis.WS = globalThis.WS || {}));
