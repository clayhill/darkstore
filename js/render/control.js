/* Control room: top-down SCADA map of the grid and KPI trend charts. */
(function (WS) {
  'use strict';
  // dark-surface categorical slots (validated reference palette) + text tokens
  const C = { s1: '#3987e5', s2: '#d95926', s3: '#199e70', s4: '#c98500', down: '#e5484d', surface: '#0f1726', grid: '#1e2a3d', text: '#e6edf7', muted: '#8a9ab3' };

  function setup(cv) {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, w: r.width, h: r.height };
  }
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  class ControlRoom {
    constructor(app, map, chartT, chartU) {
      this.app = app; this.map = map; this.chartT = chartT; this.chartU = chartU;
      this.heat = true; this.hoverT = null; this.hoverU = null;
      for (const [cv, k] of [[chartT, 'hoverT'], [chartU, 'hoverU']]) {
        cv.addEventListener('mousemove', (e) => { const r = cv.getBoundingClientRect(); this[k] = e.clientX - r.left; });
        cv.addEventListener('mouseleave', () => (this[k] = null));
      }
      map.addEventListener('click', (e) => {
        const r = map.getBoundingClientRect(), hit = this.pickMap(e.clientX - r.left, e.clientY - r.top);
        this.app.ui.select(hit); this.app.iso.selected = hit;
      });
    }
    get sim() { return this.app.sim; }
    // a type may give the control room its own map (RailRunner draws levels × aisles)
    get grid() { return this.sim.mapGrid || this.sim.grid; }

    mapGeom(w, h) {
      const g = this.grid, pad = 18;
      const s = Math.min((w - pad * 2) / g.W, (h - pad * 2 - 14) / (g.D + 0.6));
      return { s, ox: (w - s * g.W) / 2, oy: pad + 14 + (h - pad * 2 - 14 - s * (g.D + 0.6)) / 2 };
    }
    pickMap(mx, my) {
      const g = this.grid, r = this.map.getBoundingClientRect(), m = this.mapGeom(r.width, r.height);
      for (const rb of this.sim.fleet) {
        const cx = m.ox + (rb.rx + 0.5) * m.s, cy = m.oy + (rb.ry + 0.5) * m.s;
        if (Math.abs(mx - cx) < m.s * 0.5 && Math.abs(my - cy) < m.s * 0.5) return { kind: 'robot', id: rb.id };
      }
      const x = Math.floor((mx - m.ox) / m.s), y = Math.floor((my - m.oy) / m.s);
      if (!g.inside(x, y)) return null;
      const i = g.idx(x, y), port = this.sim.ports.find((p) => p.cells.some((c) => g.idx(c.x, c.y) === i));
      return port ? { kind: 'port', id: port.idx } : { kind: 'cell', id: i };
    }

    drawMap(alpha) {
      const { c, w, h } = setup(this.map), sim = this.sim, g = this.grid, m = this.mapGeom(w, h), s = m.s;
      const t = performance.now() / 1000;
      c.fillStyle = C.surface; c.fillRect(0, 0, w, h);
      c.font = '600 11px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'; c.fillStyle = C.muted; c.textAlign = 'left';
      c.fillText(g.mapTitle + (this.heat && sim.fleet.length ? ' · red = traffic wait' : ''), m.ox, m.oy - 10);
      for (let y = 0; y < g.D; y++) for (let x = 0; x < g.W; x++) {
        const i = g.idx(x, y), px = m.ox + x * s, py = m.oy + y * s, ty = g.type[i];
        c.fillStyle = g.mapFill(i, mix);
        c.fillRect(px + 0.5, py + 0.5, s - 1, s - 1);
        if (this.heat && (ty === WS.CELL.STORAGE || g.passable(i))) {
          const v = Math.min(1, g.waitHeat[i] / 40);
          if (v > 0.05) { c.fillStyle = `rgba(239,68,68,${(v * 0.75).toFixed(2)})`; c.fillRect(px + 0.5, py + 0.5, s - 1, s - 1); }
        }
        if (g.colLock[i] >= 0 && ty === WS.CELL.STORAGE) { c.fillStyle = '#f59e0b'; c.fillRect(px + s - 5, py + 2, 3, 3); }
      }
      // ports & chargers
      c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const p of sim.ports) {
        const xs = p.cells.map((q) => q.x), ys = p.cells.map((q) => q.y), x0 = Math.min(...xs), y0 = Math.min(...ys);
        const pw = (Math.max(...xs) - x0 + 1) * s, ph = (Math.max(...ys) - y0 + 1) * s;
        const starving = p.recentStarve > 0.35 || p.away;
        c.strokeStyle = p.away ? '#64748b' : starving ? `rgba(239,68,68,${(0.6 + 0.4 * Math.sin(t * 5)).toFixed(2)})` : '#facc15'; c.lineWidth = 2;
        c.strokeRect(m.ox + x0 * s + 1, m.oy + y0 * s + 1, pw - 2, ph - 2);
        c.fillStyle = '#fde68a'; c.font = '700 10px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
        const lx = m.ox + x0 * s + pw / 2, ly = p.face === 'front' ? m.oy + y0 * s + ph + 9 : m.oy + y0 * s + ph / 2;
        const code = p.away ? p.code + ' · BREAK' : p.code;
        if (p.face === 'front') c.fillText(code, lx, ly);
        else { c.save(); c.translate(m.ox + x0 * s + pw + 8, ly); c.rotate(-Math.PI / 2); c.fillText(code, 0, 0); c.restore(); }
      }
      for (const ch of g.chargers) {
        c.fillStyle = ch.down ? '#ef4444' : '#4ade80'; c.font = '700 10px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'; c.fillText(ch.down ? '✕' : '⚡', m.ox + (ch.x + 0.5) * s, m.oy + (ch.y + 0.5) * s);
      }
      // claims and paths (robots only)
      for (const r of sim.fleet) {
        const col = WS.stateColor(this.sim, r.displayState);
        c.strokeStyle = col; c.globalAlpha = 0.6; c.lineWidth = 1;
        if (r.claims) for (const i of r.claims) { if (g.cx(i) === r.x && g.cy(i) === r.y) continue; c.strokeRect(m.ox + g.cx(i) * s + 2.5, m.oy + g.cy(i) * s + 2.5, s - 5, s - 5); }
        if (r.path && r.op && r.op.op === 'move') {
          c.globalAlpha = 0.5; c.lineWidth = 1.5; c.beginPath();
          c.moveTo(m.ox + (r.rx + 0.5) * s, m.oy + (r.ry + 0.5) * s);
          for (let k = r.pi + 1; k < r.path.length; k++) c.lineTo(m.ox + (r.path[k].x + 0.5) * s, m.oy + (r.path[k].y + 0.5) * s);
          c.stroke();
        }
        c.globalAlpha = 1;
      }
      // things that are not robots, such as the trays of a tilt-tray loop, in the time split's colours
      const split = sim.timeSplit;
      if (sim.mapMarks && split) {
        const col = Object.fromEntries(split.series.map((q) => [q.k, C[q.slot]]));
        for (const mk of sim.mapMarks(alpha)) {
          c.fillStyle = mk.state === 'empty' ? '#334155' : col[mk.state];
          c.beginPath(); c.arc(m.ox + (mk.x + 0.5) * s, m.oy + (mk.y + 0.5) * s, Math.max(1.5, s * 0.32), 0, Math.PI * 2); c.fill();
        }
      }
      // robots
      const sel = this.app.ui.selection;
      for (const r of sim.fleet) {
        const x = r.prx + (r.rx - r.prx) * alpha, y = r.pry + (r.ry - r.pry) * alpha;
        const col = WS.stateColor(this.sim, r.displayState), px = m.ox + x * s, py = m.oy + y * s;
        if (r.busy && !r.down) { c.strokeStyle = `rgba(239,68,68,${(0.5 + 0.5 * Math.sin(t * 6)).toFixed(2)})`; c.lineWidth = 2; c.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1); }
        c.fillStyle = col; WS.roundRect(c, px + s * 0.14, py + s * 0.14, s * 0.72, s * 0.72, 3); c.fill();
        if (r.bin) { c.fillStyle = '#0f172a'; c.fillRect(px + s * 0.3, py + s * 0.3, s * 0.4, s * 0.4); }
        c.fillStyle = '#0b1220'; c.font = `700 ${Math.max(7, s * 0.3).toFixed(0)}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`;
        if (!r.bin) c.fillText(String(r.id + 1), px + s / 2, py + s / 2 + 0.5);
        if (r.battery != null) {
          c.fillStyle = '#0b1220'; c.fillRect(px + s * 0.14, py + s * 0.9, s * 0.72, 2.5);
          c.fillStyle = r.battery < 15 ? '#ef4444' : r.battery < 30 ? '#facc15' : '#4ade80';
          c.fillRect(px + s * 0.14, py + s * 0.9, (s * 0.72 * r.battery) / 100, 2.5);
        }
        if (r.down) { // broken down: a red cross over it
          c.strokeStyle = '#fecaca'; c.lineWidth = 2; c.beginPath();
          c.moveTo(px + s * 0.2, py + s * 0.2); c.lineTo(px + s * 0.8, py + s * 0.8); c.moveTo(px + s * 0.8, py + s * 0.2); c.lineTo(px + s * 0.2, py + s * 0.8); c.stroke();
        }
        if (sel && sel.kind === 'robot' && sel.id === r.id) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(px - 1, py - 1, s + 2, s + 2); }
      }
      if (sel && sel.kind === 'cell') { c.strokeStyle = '#38bdf8'; c.lineWidth = 2; c.strokeRect(m.ox + g.cx(sel.id) * s, m.oy + g.cy(sel.id) * s, s, s); }
    }

    // ---------------------------------------------------------------- charts
    axes(c, w, h, ymax, pad, unit) {
      c.font = '500 10px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'; c.textAlign = 'right'; c.textBaseline = 'middle';
      const ticks = 4;
      for (let k = 0; k <= ticks; k++) {
        const v = (ymax * k) / ticks, y = pad.t + (h - pad.t - pad.b) * (1 - k / ticks);
        c.strokeStyle = C.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(pad.l, y + 0.5); c.lineTo(w - pad.r, y + 0.5); c.stroke();
        c.fillStyle = C.muted; c.fillText(unit === '%' ? Math.round(v * 100) + '%' : Math.round(v), pad.l - 6, y);
      }
    }
    xLabels(c, w, h, pad, t0, t1) {
      c.textAlign = 'center'; c.textBaseline = 'top'; c.fillStyle = C.muted;
      for (let k = 0; k <= 3; k++) {
        const t = t0 + ((t1 - t0) * k) / 3;
        c.fillText(WS.U.fmtClock(t).slice(-8, -3), pad.l + ((w - pad.l - pad.r) * k) / 3, h - pad.b + 5);
      }
    }
    tooltip(c, w, h, x, rows, title) {
      c.font = '600 11px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
      const tw = Math.max(c.measureText(title).width, ...rows.map((r) => c.measureText(r[1] + '  ' + r[2]).width + 18)) + 16;
      const th = 20 + rows.length * 16;
      let bx = x + 12; if (bx + tw > w - 4) bx = x - tw - 12;
      c.fillStyle = 'rgba(8,12,22,0.94)'; c.strokeStyle = '#2b3a52'; WS.roundRect(c, bx, 8, tw, th, 6); c.fill(); c.stroke();
      c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = C.text; c.fillText(title, bx + 8, 19);
      rows.forEach(([col, label, val], k) => {
        const y = 35 + k * 16;
        c.fillStyle = col; WS.roundRect(c, bx + 8, y - 4, 8, 8, 2); c.fill();
        c.fillStyle = C.muted; c.fillText(label, bx + 22, y);
        c.fillStyle = C.text; c.textAlign = 'right'; c.fillText(val, bx + tw - 8, y); c.textAlign = 'left';
      });
    }
    drawThroughput() {
      const { c, w, h } = setup(this.chartT), S = this.sim.kpi.series;
      c.fillStyle = C.surface; c.fillRect(0, 0, w, h);
      const pad = { l: 40, r: 64, t: 12, b: 20 };
      const tm = this.sim.terms, series = [{ k: 'bins', col: C.s1, label: tm.flow1 || `${tm.Units} at ${tm.ports} /h` }, { k: 'lines', col: C.s2, label: tm.flow2 || 'Order lines /h' }];
      if (S.length < 2) { c.fillStyle = C.muted; c.font = '500 12px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'; c.textAlign = 'center'; c.fillText('Collecting samples (every 30 s sim-time)…', w / 2, h / 2); return; }
      let ymax = 10; for (const p of S) for (const s of series) ymax = Math.max(ymax, p[s.k]);
      ymax = Math.ceil((ymax * 1.15) / 50) * 50;
      this.axes(c, w, h, ymax, pad, '');
      const t0 = S[0].t, t1 = S[S.length - 1].t, X = (t) => pad.l + ((w - pad.l - pad.r) * (t - t0)) / (t1 - t0 || 1), Y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / ymax);
      this.xLabels(c, w, h, pad, t0, t1);
      this.marks(c, h, pad, t0, t1, X);
      const last = S[S.length - 1], labelY = series.map((s) => Y(last[s.k]));
      if (Math.abs(labelY[0] - labelY[1]) < 12) { const m = (labelY[0] + labelY[1]) / 2, up = labelY[0] <= labelY[1] ? -1 : 1; labelY[0] = m + up * 6; labelY[1] = m - up * 6; }
      series.forEach((s, j) => {
        c.strokeStyle = s.col; c.lineWidth = 2; c.lineJoin = 'round'; c.beginPath();
        S.forEach((p, k) => (k ? c.lineTo(X(p.t), Y(p[s.k])) : c.moveTo(X(p.t), Y(p[s.k])))); c.stroke();
        c.fillStyle = s.col; c.fillRect(X(last.t) + 5, labelY[j] - 3, 6, 6);
        c.fillStyle = C.text; c.font = '600 10px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(Math.round(last[s.k]) + '', X(last.t) + 14, labelY[j]);
      });
      this.hoverLayer(c, w, h, pad, S, X, Y, this.hoverT, (p) => series.map((s) => [s.col, s.label, Math.round(p[s.k]) + '']), series.map((s) => [s.k, s.col]));
    }
    drawUtil() {
      const { c, w, h } = setup(this.chartU), S = this.sim.kpi.series;
      c.fillStyle = C.surface; c.fillRect(0, 0, w, h);
      const pad = { l: 40, r: 64, t: 12, b: 20 }, split = this.sim.timeSplit;
      const series = split ? split.series.map((q) => ({ k: q.k, col: C[q.slot], label: q.label }))
        : [{ k: 'work', col: C.s1, label: 'Working' }, { k: 'wait', col: C.s2, label: 'Waiting (traffic/port)' }, { k: 'idle', col: C.s3, label: 'Idle' }, { k: 'charge', col: C.s4, label: 'Charging' }, { k: 'down', col: C.down, label: 'Down (broken)' }];
      this.splitLabels(split, series);
      if (S.length < 2) { c.fillStyle = C.muted; c.font = '500 12px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'; c.textAlign = 'center'; c.fillText('Collecting samples…', w / 2, h / 2); return; }
      this.axes(c, w, h, 1, pad, '%');
      const t0 = S[0].t, t1 = S[S.length - 1].t, X = (t) => pad.l + ((w - pad.l - pad.r) * (t - t0)) / (t1 - t0 || 1), Y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v);
      this.xLabels(c, w, h, pad, t0, t1);
      const base = S.map(() => 0);
      for (const s of series) {
        const top = S.map((p, k) => base[k] + p[s.k]);
        c.beginPath();
        S.forEach((p, k) => (k ? c.lineTo(X(p.t), Y(top[k])) : c.moveTo(X(p.t), Y(top[k]))));
        for (let k = S.length - 1; k >= 0; k--) c.lineTo(X(S[k].t), Y(base[k]));
        c.closePath(); c.fillStyle = s.col; c.fill();
        // 2px surface gap between stacked bands
        c.beginPath(); S.forEach((p, k) => (k ? c.lineTo(X(p.t), Y(top[k])) : c.moveTo(X(p.t), Y(top[k])))); c.strokeStyle = C.surface; c.lineWidth = 2; c.stroke();
        const lk = S.length - 1, mid = (top[lk] + base[lk]) / 2;
        if (top[lk] - base[lk] > 0.07) { c.fillStyle = C.text; c.font = '600 10px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(split ? s.label : s.label.split(' ')[0], X(S[lk].t) + 6, Y(mid)); }
        top.forEach((v, k) => (base[k] = v));
      }
      this.hoverLayer(c, w, h, pad, S, X, Y, this.hoverU, (p) => series.map((s) => [s.col, s.label, Math.round(p[s.k] * 100) + '%']), []);
    }
    // Disruptions behind the throughput lines: a surge as a shaded band,
    // breakdowns, charger faults and breaks as ticks along the bottom.
    marks(c, h, pad, t0, t1, X) {
      const hist = this.sim.disrupt.history, now = this.sim.time, y0 = pad.t, y1 = h - pad.b;
      c.save(); c.beginPath(); c.rect(pad.l, y0, X(t1) - pad.l, y1 - y0); c.clip();
      for (const e of hist) {
        const e1 = Math.min(e.t1, now);
        if (e1 < t0 || e.t0 > t1) continue;
        const a = X(Math.max(e.t0, t0)), b = Math.max(a + 2, X(Math.min(e1, t1)));
        if (e.kind === 'surge') {
          c.fillStyle = 'rgba(201,133,0,0.16)'; c.fillRect(a, y0, b - a, y1 - y0);
          c.fillStyle = '#e8b04a'; c.font = '600 10px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
          c.fillText(e.label, a + 4, y0 + 2);
        } else {
          c.fillStyle = e.kind === 'breakdown' ? 'rgba(229,72,77,0.85)' : 'rgba(138,154,179,0.8)';
          c.fillRect(a, y1 - 5, b - a, 4);
        }
      }
      c.restore();
    }
    // The time split panel's title and legend, and the fleet table's title,
    // follow the simulation: a type without robots brings its own.
    splitLabels(split, series) {
      if (this.labelsFor === this.sim) return;
      this.labelsFor = this.sim;
      const title = document.getElementById('chU-title'), leg = document.getElementById('chU-legend'), ft = document.getElementById('fleet-title');
      if (!title) return;
      title.dataset.base = title.dataset.base || title.textContent; ft.dataset.base = ft.dataset.base || ft.textContent;
      title.textContent = split ? split.title : title.dataset.base;
      ft.textContent = split ? split.table : ft.dataset.base;
      leg.innerHTML = series.map((s) => `<span><i style="background:${s.col}"></i>${WS.U.esc(s.label.split(' (')[0])}</span>`).join('');
    }
    hoverLayer(c, w, h, pad, S, X, Y, hx, rowsFn, dots) {
      if (hx == null || hx < pad.l || hx > w - pad.r) return;
      let best = S[0];
      for (const p of S) if (Math.abs(X(p.t) - hx) < Math.abs(X(best.t) - hx)) best = p;
      const x = X(best.t);
      c.strokeStyle = 'rgba(230,237,247,0.45)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 0.5, pad.t); c.lineTo(x + 0.5, h - pad.b); c.stroke();
      for (const [k, col] of dots) { c.fillStyle = col; c.strokeStyle = C.surface; c.lineWidth = 2; c.beginPath(); c.arc(x, Y(best[k]), 4.5, 0, Math.PI * 2); c.fill(); c.stroke(); }
      this.tooltip(c, w, h, x, rowsFn(best), WS.U.fmtClock(best.t));
    }
  }

  WS.ControlRoom = ControlRoom;
  WS.CHART_COLORS = C;
})((globalThis.WS = globalThis.WS || {}));
