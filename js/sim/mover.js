/* Everything in the fleet that moves and runs generator tasks: battery robots
 * on a grid (js/sim/robot.js) and machines on rails (js/sim/machine.js). The
 * shared part is the state bookkeeping that KPIs, the fleet table, the
 * inspector and the control room read; only robots have a battery, claimed
 * cells and a path. */
(function (WS) {
  'use strict';

  // States every type may use; a type adds its own in sim.extraStates (they count as work unless they name a bucket).
  const STATES = ['IDLE', 'MOVING_TO_TARGET', 'HANDLING', 'TRANSPORTING_TO_PORT', 'AT_PORT', 'STORING', 'WAITING_IN_TRAFFIC', 'WAITING_PORT', 'TO_CHARGER', 'CHARGING', 'YIELDING'];
  // KPI buckets: utilization = WORK / total
  const BUCKET = { IDLE: 'IDLE', YIELDING: 'IDLE', MOVING_TO_TARGET: 'WORK', HANDLING: 'WORK', TRANSPORTING_TO_PORT: 'WORK', AT_PORT: 'WORK', STORING: 'WORK', WAITING_IN_TRAFFIC: 'WAIT', WAITING_PORT: 'WAIT', TO_CHARGER: 'CHARGE', CHARGING: 'CHARGE' };

  class Mover {
    constructor(sim, id, name) {
      this.sim = sim; this.id = id; this.name = name;
      this.x = 0; this.y = 0; this.rx = 0; this.ry = 0; this.prx = 0; this.pry = 0; // render position (current / previous tick)
      this.state = 'IDLE'; this.task = null; this.gen = null; this.op = null; this.bin = null;
      this.v = 0; this.idleTime = 0; this.tasksDone = 0; this.distance = 0; this.lifts = 0;
      this.stateTime = {}; [...STATES, ...Object.keys(sim.extraStates)].forEach((s) => (this.stateTime[s] = 0));
    }
    get displayState() { return this.op && this.op.waitState ? this.op.waitState : this.state; }
    bucketOf(s) { const x = this.sim.extraStates[s]; return BUCKET[s] || (x ? x.bucket || 'WORK' : 'IDLE'); }
    get bucket() { return this.bucketOf(this.displayState); }
    // share of the time spent working
    get utilization() {
      let t = 0, w = 0;
      for (const [k, v] of Object.entries(this.stateTime)) { t += v; if (this.bucketOf(k) === 'WORK') w += v; }
      return t ? w / t : 0;
    }
  }

  WS.Mover = Mover;
  WS.MOVER_STATES = STATES;
  WS.STATE_BUCKET = BUCKET;
})((globalThis.WS = globalThis.WS || {}));
