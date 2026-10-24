/* Conveyors as a network of belts that carry totes or parcels (ZoneHop,
 * FloorStack). A belt is a path of straight pieces (in floor cells) that runs
 * at one speed; the
 * totes on it keep a tote's length and a gap apart (the pitch) and stop
 * behind each other. Where a belt ends, its exit decides where the front
 * tote goes: onto another belt, into something that takes it off the
 * conveyor (exit returns true), or nowhere yet (it stops at the end, as at
 * a pick position or a machine). Where two belts run into one, the first
 * belt feeding it (the main line) goes first; a tote waiting to join gets
 * its turn once it has waited a few seconds. */
(function (WS) {
  'use strict';
  const JOIN_WAIT = 4; // s a tote waits to join before the main line gives way

  class Belt {
    constructor(net, name, pts, o = {}) {
      Object.assign(this, { net, name, pts, idx: net.belts.length, totes: [], inputs: [], exit: o.exit || null, z: o.z ?? 0.8, kind: o.kind || 'belt', floor: o.floor || 0 });
      this.cum = [0]; this.sloped = pts[0].z != null;
      const zs = net.zScale || 0, seg = (a, b) => (this.sloped ? Math.hypot(b.x - a.x, b.y - a.y, (b.z - a.z) * zs) : Math.hypot(b.x - a.x, b.y - a.y));
      for (let k = 1; k < pts.length; k++) this.cum.push(this.cum[k - 1] + seg(pts[k - 1], pts[k]));
      this.len = this.cum[this.cum.length - 1];
      net.belts.push(this);
    }
    // where position s along the belt is: { x, y, dx, dy } with (dx, dy) the
    // direction of travel, and on a sloped belt its height z
    at(s) {
      const p = this.pts, c = this.cum;
      let k = 1;
      while (k < p.length - 1 && s > c[k]) k++;
      const a = p[k - 1], b = p[k], l = c[k] - c[k - 1], f = l ? Math.max(0, Math.min(1, (s - c[k - 1]) / l)) : 0;
      if (this.sloped) {
        const h = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, dx: (b.x - a.x) / h, dy: (b.y - a.y) / h };
      }
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dx: l ? (b.x - a.x) / l : 0, dy: l ? (b.y - a.y) / l : 0 };
    }
    get back() { return this.totes[this.totes.length - 1] || null; }
    get front() { return this.totes[0] || null; }
    // a tote can come onto the belt at its start
    hasRoom() { const b = this.back; return !b || b.s >= this.net.pitch - 1e-9; }
    // how full the belt is, 0 … 1
    get fill() { return Math.min(1, (this.totes.length * this.net.pitch) / Math.max(this.len, this.net.pitch)); }
    // a tote starts on the belt here (order start, a picker putting a tote down)
    put(t, s = 0) { t.belt = this; t.s = s; t.wait = 0; this.totes.push(t); this.idle = false; this.net.place(t); t.px = t.x; t.py = t.y; t.pz = t.z; }
  }

  class BeltNet {
    constructor(sim, speed, pitch) {
      this.sim = sim; this.belts = [];
      this.speed = speed; this.pitch = pitch; // cells/s, cells
      this.n = 0; // updates so far: a tote that moved onto a later belt does not move twice in one
      // strict: only a tote that asked to join counts as waiting to (PocketFlow, where pockets
      // stand at the ends of storage rails on purpose); otherwise any tote waiting at the end does
      this.strict = false;
      // fast: a belt where nothing moved the last time and whose front still cannot go is left as
      // it is (PocketFlow, with long queues standing still); the totes behind its front then do
      // not count their waiting, which only a belt's front needs
      this.fast = false;
    }
    belt(name, pts, o) { return new Belt(this, name, pts, o); }
    // b feeds into `to`; the first input of a belt is its main line
    link(b, to) { if (!to.inputs.includes(b)) to.inputs.push(b); }
    place(t) { const q = t.belt.at(t.s); t.x = q.x; t.y = q.y; t.dx = q.dx; t.dy = q.dy; if (q.z != null) t.z = q.z; }
    // May tote t at the end of belt `from` join `to` now? There must be
    // room, and a joining tote gives way to the main line, unless it has
    // waited long enough: then the main line waits for it.
    mayJoin(t, from, to) {
      if (!to.hasRoom()) return false;
      const main = to.inputs[0];
      if (!main || main === from) {
        for (const b of to.inputs) if (b !== from && b.front && b.front.wait > JOIN_WAIT && b.front.s >= b.len - 1e-9 && (!this.strict || b.front.joining === to)) return false;
        return true;
      }
      const m = main.front;
      return !m || m.s < main.len - this.pitch || t.wait > JOIN_WAIT;
    }
    update(dt) {
      const v = this.speed * dt, P = this.pitch, n = ++this.n;
      for (const b of this.belts) {
        let limit = b.len, k = 0, moved = false;
        const idle = this.fast && b.idle;
        while (k < b.totes.length) {
          if (idle && k === 1 && !moved) break; // the front stayed: so does everything behind it
          const t = b.totes[k], s0 = t.s;
          if (t.moved === n) { limit = t.s - P; k++; moved = true; continue; } // it came onto this belt in this update
          t.moved = n; t.px = t.x; t.py = t.y; t.pz = t.z;
          let s = Math.min(s0 + v, limit);
          if (k === 0 && s0 + v >= b.len - 1e-9) {
            // at the end: where to?
            const to = b.exit ? b.exit(t, b) : null;
            if (to === true) { b.totes.splice(k, 1); t.belt = null; t.moving = s0 < b.len; moved = true; continue; }
            if (to && this.strict) t.joining = to;
            if (to && this.mayJoin(t, b, to)) {
              const back = to.back, over = Math.max(0, s0 + v - b.len), ns = back ? Math.min(over, back.s - P) : over;
              b.totes.splice(k, 1);
              t.belt = to; t.s = Math.max(0, ns); t.wait = 0; t.moving = true;
              to.totes.push(t); this.place(t); to.idle = false; moved = true;
              continue;
            }
            s = b.len;
          }
          t.moving = s > s0 + 1e-9;
          t.wait = t.moving ? 0 : t.wait + dt;
          t.s = Math.max(s0, s);
          if (t.s !== s0) { this.place(t); moved = true; } // one standing still is where it was
          limit = t.s - P;
          k++;
        }
        b.idle = !moved;
      }
    }
  }

  WS.BeltNet = BeltNet;
})((globalThis.WS = globalThis.WS || {}));
