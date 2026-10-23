/* Disruptions: a bad day instead of a calm, steady one. Every system can be
 * hit by the same things, from the Settings tab or at random:
 *  surge      orders (or parcels) come in surgeFactor times as fast for
 *             surgeMinutes, as on Black Friday
 *  breakdown  a robot or machine stops where it is until a technician has
 *             repaired it (repairMinutes); it stays in the way meanwhile. A
 *             type without a fleet stops its own machine: the tilt-tray loop
 *             its sorter, ZoneHop jams an A-frame channel (sim.fault).
 *  charger    a charger is out of service for chargerMinutes; a robot on it
 *             stops charging and goes to another one
 *  break      the operator of a station walks off for breakMinutes; the
 *             station stops and gets no new orders meanwhile
 * With failRate > 0 robots and machines also break down at random (that many
 * breakdowns per hour over the whole fleet). Each disruption is noted in
 * `history`, which the throughput chart marks. */
(function (WS) {
  'use strict';
  const MIN = 60;

  class Disruptions {
    constructor(sim) {
      this.sim = sim;
      this.surge = null; this.loop = null; // the tilt-tray loop stopped
      this.history = []; // { kind, t0, t1, label }
      this.count = { surge: 0, breakdown: 0, charger: 0, break: 0 };
      this.downTime = 0; // machine-seconds out of service
    }
    get rateFactor() { return this.surge ? this.surge.factor : 1; }
    note(kind, label, t1) { const h = { kind, t0: this.sim.time, t1, label }; this.history.push(h); if (this.history.length > 200) this.history.shift(); this.count[kind]++; return h; }
    mins(m) { return m < 1 ? `${Math.round(m * 60)} s` : `${Math.round(m)} min`; }

    // ---------------------------------------------------------------- triggers
    startSurge() {
      const sim = this.sim, c = sim.cfg, until = sim.time + c.surgeMinutes * MIN;
      const name = sim.terms.surge || 'Order surge';
      if (this.surge) { this.surge.until = until; this.surge.h.t1 = until; return name + ' extended'; }
      this.surge = { factor: c.surgeFactor, until };
      this.surge.h = this.note('surge', `Surge ×${c.surgeFactor}`, until);
      sim.log('warn', `${name}: ${sim.terms.surge ? sim.terms.units : sim.terms.units === 'parcels' ? 'parcels' : 'orders'} ×${c.surgeFactor} for ${this.mins(c.surgeMinutes)}`);
      return `Surge ×${c.surgeFactor} for ${this.mins(c.surgeMinutes)}`;
    }
    // Robots and machines that can break down: those at work first, never one
    // already down; on the tray loop the sorter itself.
    breakdown(target) {
      const sim = this.sim, until = sim.time + sim.cfg.repairMinutes * MIN;
      if (!sim.fleet.length) {
        if (sim.fault) return sim.fault(until);
        if (!sim.stopLoop || this.loop) return null;
        this.loop = { until }; sim.stopLoop(true);
        this.loop.h = this.note('breakdown', 'Loop stopped', until);
        sim.log('warn', `Sorter loop stopped: a drive fault · repair ${this.mins(sim.cfg.repairMinutes)}`);
        return 'The tray loop stopped';
      }
      let m = target;
      if (!m) {
        const atWork = (r) => (r.task && r.task.type ? !['CHARGE', 'PARK', 'YIELD'].includes(r.task.type) : !!r.gen);
        const ok = sim.fleet.filter((r) => !r.down), working = ok.filter(atWork), pool = working.length ? working : ok;
        if (!pool.length) return null;
        m = pool[Math.floor(sim.rng() * pool.length)];
      }
      if (m.down) return null;
      m.down = { until, busy: m.busy };
      m.busy = true; // a hard obstacle: the router plans round it and never asks it to yield
      m.v = 0;
      // it keeps the cells it stands on, not the ones it had claimed ahead
      if (m.claims && m.path) {
        const g = sim.grid, keep = new Set([g.idx(m.x, m.y)]);
        if (m.prog > 0 && m.path[m.pi + 1]) keep.add(g.idx(m.path[m.pi + 1].x, m.path[m.pi + 1].y));
        for (const i of Array.from(m.claims)) if (!keep.has(i)) sim.router.releaseCell(m, i);
      }
      m.down.h = this.note('breakdown', `${m.name} down`, until);
      sim.log('warn', `${m.name} broke down · technician on the way, repair ${this.mins(sim.cfg.repairMinutes)}`);
      return `${m.name} broke down`;
    }
    chargerFault(ch) {
      const sim = this.sim, chs = sim.grid.chargers || [];
      ch = ch || chs.filter((c) => !c.down).sort((a, b) => (b.robot >= 0) - (a.robot >= 0))[0]; // one in use if there is one
      if (!ch) return null;
      const until = sim.time + sim.cfg.chargerMinutes * MIN;
      ch.down = { until };
      ch.down.h = this.note('charger', `Charger ${ch.id + 1} out`, until);
      sim.log('warn', `Charger ${ch.id + 1} out of service for ${this.mins(sim.cfg.chargerMinutes)}`);
      return `Charger ${ch.id + 1} out of service`;
    }
    // People who can go on a break: station operators (not at a robot arm or
    // a decanting cell); a type adds its own (AisleMate's pickers).
    people() { return this.sim.breakTargets ? this.sim.breakTargets() : this.sim.ports.filter((p) => !p.arm && !p.decanter); }
    busyShare(p) { return p.stats ? p.stats.busy / (p.stats.t || 1) : p.utilization; }
    operatorBreak(p) {
      const sim = this.sim;
      if (!p) {
        const free = this.people().filter((q) => !q.away);
        if (!free.length) return null;
        // the busiest one: where it hurts most
        p = free.reduce((a, b) => (this.busyShare(b) > this.busyShare(a) ? b : a));
      }
      if (p.away) return null;
      const until = sim.time + sim.cfg.breakMinutes * MIN;
      p.away = { until };
      p.away.h = this.note('break', `${p.code || p.name} on break`, until);
      sim.log('warn', `${this.who(p)} on a break for ${this.mins(sim.cfg.breakMinutes)}`);
      return `${this.who(p)} on a break`;
    }
    who(p) { return p.stats ? `${p.name}: operator` : p.roleName ? `${p.roleName} ${p.name}` : p.name; }
    // Everything back to normal now.
    clear() {
      const sim = this.sim;
      if (this.surge) this.endSurge();
      for (const m of sim.fleet) if (m.down) this.repair(m);
      for (const ch of sim.grid.chargers || []) if (ch.down) this.restore(ch);
      for (const p of this.people()) if (p.away) this.back(p);
      if (this.loop) this.restartLoop();
      if (sim.clearFaults) sim.clearFaults();
    }

    // ---------------------------------------------------------------- endings
    endSurge() { this.surge.h.t1 = this.sim.time; this.surge = null; this.sim.log('system', 'Order surge over'); }
    repair(m) {
      const sim = this.sim;
      m.busy = m.down.busy; m.down.h.t1 = sim.time; m.down = null;
      sim.log('robot', `${m.name} repaired, back to work`);
    }
    restore(ch) { ch.down.h.t1 = this.sim.time; ch.down = null; this.sim.log('system', `Charger ${ch.id + 1} back in service`); }
    back(p) { p.away.h.t1 = this.sim.time; p.away = null; this.sim.log('system', `${this.who(p)} back from the break`); }
    restartLoop() { this.loop.h.t1 = this.sim.time; this.loop = null; this.sim.stopLoop(false); this.sim.log('system', 'Sorter loop running again'); }

    update(dt) {
      const sim = this.sim, t = sim.time, c = sim.cfg;
      if (this.surge && t >= this.surge.until) this.endSurge();
      if (this.loop && t >= this.loop.until) this.restartLoop();
      for (const m of sim.fleet) if (m.down) { this.downTime += dt; if (t >= m.down.until) this.repair(m); }
      for (const ch of sim.grid.chargers || []) if (ch.down && t >= ch.down.until) this.restore(ch);
      for (const p of this.people()) if (p.away && t >= p.away.until) this.back(p);
      // random breakdowns: failRate per hour over the whole fleet
      if (c.failRate > 0 && sim.rng() < (c.failRate / 3600) * dt) this.breakdown();
    }

    // alerts for the control room
    alerts() {
      const sim = this.sim, t = sim.time, out = [], left = (u) => this.mins((u - t) / MIN) + ' left';
      if (this.surge) out.push({ sev: 'warning', key: 'surge', title: `${sim.terms.surge || 'Order surge'} ×${this.surge.factor}`, msg: `${sim.terms.surge ? sim.terms.Units : sim.terms.units === 'parcels' ? 'Parcels' : 'Orders'} arriving ${this.surge.factor} times as fast · ${left(this.surge.until)}` });
      if (this.loop) out.push({ sev: 'critical', key: 'loop', title: 'Sorter loop stopped', msg: `Drive fault · repair ${left(this.loop.until)}` });
      if (sim.faultAlerts) out.push(...sim.faultAlerts(left));
      const down = sim.fleet.filter((m) => m.down);
      if (down.length) out.push({ sev: 'critical', key: 'down', title: `${down.length} broken down`, msg: down.slice(0, 4).map((m) => `${m.name} (${left(m.down.until)})`).join(', ') + (down.length > 4 ? ' …' : '') });
      for (const ch of sim.grid.chargers || []) if (ch.down) out.push({ sev: 'warning', key: 'chg' + ch.id, title: `Charger ${ch.id + 1} out of service`, msg: left(ch.down.until) });
      for (const p of this.people()) if (p.away) out.push(p.stats ? { sev: 'warning', key: 'away' + p.idx, title: `${p.name}: operator on break`, msg: `Station stopped · ${left(p.away.until)}`, port: p.idx } : { sev: 'info', key: 'away-' + p.name, title: `${this.who(p)} on break`, msg: left(p.away.until) });
      return out;
    }
  }

  WS.Disruptions = Disruptions;
})((globalThis.WS = globalThis.WS || {}));
