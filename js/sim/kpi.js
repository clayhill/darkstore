/* KPI tracking: throughput (bins presented / lines per hour), robot utilization,
 * dig ratio, burial penalties, cycle times, and bottleneck alerts. */
(function (WS) {
  'use strict';
  const HOUR = 3600;

  class KPI {
    constructor(sim) {
      this.sim = sim;
      Object.assign(this, {
        presented: 0, presentedPick: 0, presentedIn: 0, linesPicked: 0, unitsPicked: 0, unitsReceived: 0,
        ordersShipped: 0, shuffles: 0, productive: 0, digs: 0, digTime: 0, penaltyTime: 0, penaltyEvents: 0,
        restacks: 0, stores: 0, cycleSum: 0, cycleN: 0, depthSum: 0,
      });
      this.win = { presented: [], lines: [], shipped: [], shuffles: [], productive: [] };
      this.series = [];
      this.acc = { WORK: 0, WAIT: 0, IDLE: 0, CHARGE: 0, DOWN: 0 };
      this.accTotal = { WORK: 0, WAIT: 0, IDLE: 0, CHARGE: 0, DOWN: 0 };
      this.sampleTimer = 0; this.alertTimer = 0; this.alerts = []; this.penaltyLog = [];
      this.sampleEvery = 30;
    }
    push(w, n = 1) { for (let k = 0; k < n; k++) this.win[w].push(this.sim.time); }
    rate(w) {
      const a = this.win[w], now = this.sim.time;
      while (a.length && a[0] < now - HOUR) a.shift();
      const span = Math.min(HOUR, Math.max(now, 120));
      return (a.length * HOUR) / span;
    }

    onPresented(port) {
      this.presented++; this.push('presented');
      if (port.kind === 'PICK') this.presentedPick++; else this.presentedIn++;
    }
    onLinePicked(units) { this.linesPicked++; this.unitsPicked += units; this.push('lines'); }
    onShuffle() { this.shuffles++; this.push('shuffles'); }
    onDig(bin, depth, time) {
      this.productive++; this.push('productive'); this.depthSum += depth;
      if (depth > 1) { this.digs++; this.digTime += time; }
      const inv = this.sim.inv;
      if (inv.binClass(bin) === 'A' && depth >= this.sim.cfg.burialDepth) {
        this.penaltyTime += time; this.penaltyEvents++;
        const e = { t: this.sim.time, bin: bin.id, depth, time, x: bin.x, y: bin.y };
        this.penaltyLog.push(e); if (this.penaltyLog.length > 50) this.penaltyLog.shift();
        this.sim.log('penalty', `Burial penalty: fast-mover bin ${bin.id} dug from depth ${depth} — ${time.toFixed(1)}s shuffling`);
      }
    }
    onShipped(o) {
      this.ordersShipped++; this.push('shipped');
      this.cycleSum += o.times.shipped - o.times.created; this.cycleN++;
    }
    get digRatio() { return this.productive ? this.shuffles / this.productive : 0; }
    get recentDigRatio() { const p = this.rate('productive'); return p ? this.rate('shuffles') / p : 0; }
    utilization(total) {
      const a = total ? this.accTotal : this.acc;
      const s = a.WORK + a.WAIT + a.IDLE + a.CHARGE + a.DOWN;
      return s ? { work: a.WORK / s, wait: a.WAIT / s, idle: a.IDLE / s, charge: a.CHARGE / s, down: a.DOWN / s } : { work: 0, wait: 0, idle: 1, charge: 0, down: 0 };
    }

    update(dt) {
      const sim = this.sim;
      for (const r of sim.fleet) { const b = r.bucket; this.acc[b] += dt; this.accTotal[b] += dt; }
      const split = sim.timeSplit; // a type without a fleet (the tray loop) brings its own time split
      if (split) { const f = split.sample(); this.splitT = (this.splitT || 0) + dt; this.splitAcc = this.splitAcc || {}; for (const k in f) this.splitAcc[k] = (this.splitAcc[k] || 0) + f[k] * dt; }
      this.sampleTimer += dt;
      if (this.sampleTimer >= this.sampleEvery) {
        this.sampleTimer = 0;
        const u = this.utilization(false);
        const open = sim.oms.orders.filter((o) => o.status !== 'SHIPPED').length;
        this.series.push({
          t: sim.time, bins: this.rate('presented'), lines: this.rate('lines'), shipped: this.rate('shipped'),
          work: u.work, wait: u.wait, idle: u.idle, charge: u.charge, down: u.down, open,
          batt: sim.cfg.chargers ? sim.fleet.reduce((s, r) => s + r.battery, 0) / sim.fleet.length : null, dig: this.recentDigRatio,
        });
        if (split) { const p = this.series[this.series.length - 1]; for (const k in this.splitAcc) p[k] = this.splitAcc[k] / this.splitT; this.splitAcc = {}; this.splitT = 0; }
        if (this.series.length > 720) this.series.shift();
        this.acc = { WORK: 0, WAIT: 0, IDLE: 0, CHARGE: 0, DOWN: 0 };
      }
      this.alertTimer += dt;
      if (this.alertTimer >= 2) { this.alertTimer = 0; this.computeAlerts(); }
    }

    computeAlerts() {
      const sim = this.sim, g = sim.grid, out = [];
      // traffic hotspots
      const hot = [];
      for (let i = 0; i < g.waitHeat.length; i++) if (g.waitHeat[i] > 25) hot.push(i);
      hot.sort((a, b) => g.waitHeat[b] - g.waitHeat[a]);
      for (const i of hot.slice(0, 3)) {
        const v = g.waitHeat[i];
        out.push({ sev: v > 80 ? 'critical' : 'warning', key: 'hot' + i, title: 'Traffic hotspot', msg: `Cell ${g.cx(i)},${g.cy(i)} — ${v.toFixed(0)} s queued (5-min decay)`, cell: i });
      }
      for (const p of sim.ports) {
        if (p.recentStarve > 0.35 && p.stats.t > 120 && !p.away)
          out.push({ sev: p.recentStarve > 0.6 ? 'critical' : 'warning', key: 'starve' + p.idx, title: p.name + ' starved', msg: `Waiting for ${sim.terms.starve || sim.terms.units} ${(p.recentStarve * 100).toFixed(0)}% of recent time`, port: p.idx });
        if (p.outQ.length >= 2 && p.job && p.job.next >= p.job.lines.length && p.job.t >= p.job.total)
          out.push({ sev: 'warning', key: 'blocked' + p.idx, title: p.name + ' blocked', msg: 'Outgoing bins not collected — robot shortage', port: p.idx });
      }
      const back = sim.oms.orders.filter((o) => o.status === 'BACKORDER').length;
      if (back) out.push({ sev: back > 10 ? 'critical' : 'warning', key: 'back', title: 'Backorders', msg: `${back} order(s) waiting for stock` });
      if (sim.oms.orders.length && !sim.oms.emptyTotes) out.push({ sev: 'warning', key: 'totes', title: 'Tote shortage', msg: 'No empty order totes — release paused' });
      const low = sim.cfg.chargers ? sim.fleet.filter((r) => r.battery < 12) : [];
      if (low.length) out.push({ sev: 'critical', key: 'batt', title: 'Low battery', msg: low.map((r) => r.name).join(', ') + ' below 12%' });
      const waiting = sim.fleet.filter((r) => r.displayState === 'WAITING_IN_TRAFFIC').length;
      if (waiting > sim.fleet.length * 0.3) out.push({ sev: 'warning', key: 'jam', title: 'Congestion', msg: `${waiting} of ${sim.fleet.length} robots waiting in traffic` });
      const recentPen = this.penaltyLog.filter((e) => e.t > sim.time - 600).length;
      if (recentPen >= 3) out.push({ sev: 'info', key: 'bury', title: 'Fast movers buried', msg: `${recentPen} burial penalties in the last 10 min` });
      const packers = sim.oms.packers, toPack = packers.reduce((s, p) => s + p.queue.length + p.incoming, 0);
      if (toPack > packers.length * 4) out.push({ sev: toPack > packers.length * 8 ? 'critical' : 'warning', key: 'pack', title: 'Packing backlog', msg: `${toPack} order totes waiting for ${packers.length} pack stations` });
      out.unshift(...sim.disrupt.alerts());
      if (sim.extraAlerts) out.push(...sim.extraAlerts());
      this.alerts = out;
    }
  }

  WS.KPI = KPI;
})((globalThis.WS = globalThis.WS || {}));
