/* Workstations (ports) at the grid periphery. A conveyor port has a drop cell
 * where robots lower bins in, a pick position presented to the operator and a
 * lift cell where robots collect the bin again.
 *  PICK      — goods-to-person picking with a put-to-light wall of order totes
 *  GOODS_IN  — decanting received goods into storage bin compartments */
(function (WS) {
  'use strict';

  const OUT_ROLL = 0.8, OUT_CLEAR = 0.6; // s for a finished bin to roll to its place on the outfeed; s for a lifted bin to clear it

  class Port {
    constructor(sim, idx, def) {
      this.sim = sim; this.idx = idx;
      Object.assign(this, def); // kind, face, drop, lift
      this.name = (def.kind === 'PICK' ? 'Pick ' : 'Goods-in ') + (idx + 1);
      this.code = 'P' + String(idx + 1).padStart(2, '0');
      this.inbound = 0; this.inQ = []; this.pick = null; this.outQ = []; this.entryReserved = false;
      this.outMoves = new Map(); // bin id → { from: 'pick' | 'out2', t }: a finished bin rolling to its place on the outfeed
      this.job = null; this.mode = 'auto';
      this.slots = def.kind === 'PICK' ? Array(sim.cfg.toteSlots).fill(null) : [];
      this.stats = { presented: 0, busy: 0, starved: 0, blocked: 0, lines: 0, units: 0, t: 0 };
      this.recentStarve = 0; // decaying starvation share (alerts)
    }
    // A robot arm picks here instead of an operator; arm counts its work.
    setArm() {
      this.arm = { tries: 0, picks: 0, assists: 0, units: 0 };
      this.name = 'Robot pick ' + (this.idx + 1);
    }
    // Seconds the arm needs for a line: per unit one grasp, a second one when
    // that fails, and an operator who comes over when that fails too or the
    // item cannot be gripped at all. ln.assist counts those units.
    armLine(ln) {
      const sim = this.sim, c = sim.cfg, a = this.arm, g = sim.inv.gripRate(sim.inv.byGtin.get(ln.gtin));
      let t = 0.5;
      ln.assist = 0;
      for (let u = 0; u < ln.qty; u++) {
        a.units++;
        if (g > 0) {
          let ok = false;
          for (let k = 0; k < 2 && !ok; k++) { t += c.armPerUnit; a.tries++; ok = sim.rng() < g; }
          if (ok) { a.picks++; continue; }
        }
        t += c.armAssistDelay + c.pickPerUnit + c.putConfirm; ln.assist++; a.assists++;
      }
      return t;
    }
    // A decanting cell works here instead of an operator; decanter counts its work.
    setDecanter() {
      this.decanter = { lines: 0, units: 0, assists: 0 };
      this.name = 'Auto goods-in ' + (this.idx + 1);
    }
    // Seconds the cell needs for a receipt line: open the carton and tip it,
    // or, for an item it cannot tip, an operator who comes over and decants
    // by hand (ln.assist).
    decantLine(ln) {
      const sim = this.sim, c = sim.cfg, d = this.decanter;
      d.lines++; d.units += ln.qty;
      if (sim.inv.tippable(sim.inv.byGtin.get(ln.gtin))) { ln.assist = 0; return c.decantCase + ln.qty * c.decantTip; }
      ln.assist = ln.qty; d.assists++;
      return c.armAssistDelay + 2.0 + ln.qty * c.decantPerUnit;
    }
    canAccept() { return this.queueRoom() > 0; }
    queueRoom() { return this.entryReserved ? 0 : 2 - this.inQ.length; } // totes the infeed still takes
    demand() {
      let d = this.inbound;
      for (const b of this.sim.binsWithRequests) if (b.requests.some((q) => q.port === this.idx)) d++;
      return d;
    }
    receive(bin) {
      this.entryReserved = false;
      bin.loc = 'port'; bin.port = this.idx; bin.robot = -1; bin.task = null;
      this.inQ.push({ bin, t: 0 });
      this.inbound = Math.max(0, this.inbound - 1);
    }
    // The bin at the head of the outfeed leaves; the one behind rolls up to
    // the head once the first has been lifted clear (OUT_CLEAR s).
    takeOut() {
      const b = this.outQ.shift();
      if (b) this.outMoves.delete(b.id);
      if (this.outQ[0]) this.outMoves.set(this.outQ[0].id, { from: 'out2', t: this.sim.time + OUT_CLEAR });
      return b;
    }
    // the bin at the head of the outfeed has rolled into place
    outReady() { const b = this.outQ[0], m = b && this.outMoves.get(b.id); return !!b && (!m || this.sim.time >= m.t + OUT_ROLL); }

    startJob(bin) {
      const sim = this.sim, cfg = sim.cfg, lines = [];
      bin.requests = bin.requests.filter((q) => {
        if (q.port !== this.idx) return true;
        lines.push(...q.lines);
        return false;
      });
      if (!bin.requests.length) sim.binsWithRequests.delete(bin);
      if (sim.sequenceLines) sim.sequenceLines(bin, lines, this);
      let t = cfg.scanTime, prev = null;
      for (const ln of lines) {
        if (sim.lineOverhead) t += sim.lineOverhead(bin, ln, prev, this); // e.g. turning a pod to another face
        ln.start = t;
        if (this.kind === 'PICK') t += this.arm ? this.armLine(ln) : 1.0 + ln.qty * cfg.pickPerUnit + cfg.putConfirm;
        else t += this.decanter ? this.decantLine(ln) : 2.0 + ln.qty * cfg.decantPerUnit;
        ln.at = t; prev = ln;
      }
      if (this.kind === 'GOODS_IN') t += 1.5; // bin confirm
      this.job = { bin, lines, t: 0, total: Math.max(t, 1.5), next: 0 };
      bin.presentations++; this.pickAt = sim.time; // for the view: the tote slides in from the infeed
      this.stats.presented++;
      sim.kpi.onPresented(this, bin);
    }
    applyLine(ln) {
      const sim = this.sim, bin = this.job.bin;
      if (this.kind === 'PICK') {
        const q = sim.inv.pick(bin, ln.comp, ln.qty);
        sim.oms.onLinePicked(ln, q, this);
        this.stats.lines++; this.stats.units += q;
      } else {
        sim.inv.decant(bin, ln.comp, ln.qty);
        sim.oms.onDecanted(ln, this);
        this.stats.lines++; this.stats.units += ln.qty;
      }
    }
    // Manual mode: operator confirms the next line (or the bin when all lines are done)
    confirmNext() {
      const j = this.job;
      if (!j) return;
      if (j.next < j.lines.length) { this.applyLine(j.lines[j.next]); j.next++; }
      if (j.next >= j.lines.length) j.t = j.total;
      else j.t = j.lines[j.next - 1].at;
    }
    get currentLine() { return this.job && this.job.lines[this.job.next]; }

    update(dt) {
      const cfg = this.sim.cfg;
      this.stats.t += dt;
      // conveyor: entry → pick position
      const head = this.inQ[0];
      if (head) head.t += dt;
      if (!this.pick && head && head.t >= cfg.conveyorStep && this.sim.portClear(this)) { this.inQ.shift(); this.pick = head.bin; this.startJob(head.bin); }
      let starved = 0;
      if (this.pick) {
        const j = this.job;
        if (j.next < j.lines.length || j.t < j.total) {
          this.stats.busy += dt;
          // a line waits for its order tote to be in the slot
          const ln = j.lines[j.next], tote = ln && ln.order && ln.order.placedAt;
          if (this.mode === 'auto' && !(tote > this.sim.time && j.t + dt >= ln.at)) {
            j.t += dt;
            while (j.next < j.lines.length && j.t >= j.lines[j.next].at) { this.applyLine(j.lines[j.next]); j.next++; }
          }
        } else if (this.outQ.length < 2 && this.sim.portOutOk(this)) {
          this.outMoves.set(this.pick.id, { from: 'pick', t: this.sim.time });
          this.outQ.push(this.pick);
          this.sim.onPortOut(this, this.pick);
          this.pick = null; this.job = null;
        } else this.stats.blocked += dt;
      } else if (!this.inQ.length && this.demand() > 0) { this.stats.starved += dt; starved = 1; }
      const f = Math.exp(-dt / 180);
      this.recentStarve = this.recentStarve * f + starved * (1 - f);
    }
  }

  WS.Port = Port;
  WS.PORT_OUT_ROLL = OUT_ROLL;
})((globalThis.WS = globalThis.WS || {}));
