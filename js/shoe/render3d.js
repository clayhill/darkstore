/* ShoeLine in the free 3D view: the line of aluminium slats moving past on
 * its frame, a green shoe on every slat resting in the middle; under a
 * parcel being diverted the shoes glide diagonally across and push it off
 * onto its chute's slide. The induct belts fan in to the merge, the reject
 * chute is straight ahead at the end, and the recirculation belt runs back
 * round behind the south chutes. The bags, falling parcels, bag workers,
 * labels and following a parcel are every sorter's (js/hub/render3d.js). */
(function (WS) {
  'use strict';
  const SZ = 2.2, BAGTOP = 1.35, PITCH = 0.15; // the slats' height, the bags' top (render levels), m between slats

  class ShoeRenderer3D extends WS.HubRenderer3D {
    get G() { return this.sim.G; }
    bagAt(ch) { const G = this.G; return ch.side === 2 ? { x: ch.x + 0.3, y: G.yL } : { x: ch.x, y: ch.y }; }
    get bagTop() { return BAGTOP; }
    get dropTop() { return SZ + 0.1; }
    get dropFall() { return 1.0; }
    get chuteZ() { return BAGTOP; }
    get pickZ() { return SZ; }
    workLights() { return this.sim.ports.map((p) => ({ x: p.slot.x + 0.7, y: p.slot.y - 0.4 })); }
    fit() {
      super.fit();
      const G = this.G;
      Object.assign(this.cam, { tx: G.W * 0.48, ty: G.yL + 1, dist: G.W * 0.7, yaw: -0.25, pitch: 0.7 });
    }
    // a belt along pts: the shared conveyor where it runs along an axis, a beam on legs where it runs at an angle
    belt(S, pts, w, z, col) {
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k];
        if (Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6) { this.conveyor(S, [a, b], w, z, col); continue; }
        S.box.beam(a.x, a.y, z - 0.2, b.x, b.y, z - 0.2, w, 0.3, col);
        for (const f of [0.1, 0.9]) { const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f; S.box.box(x - 0.03, y - 0.03, 0, x + 0.03, y + 0.03, z - 0.35, '#475569'); }
      }
    }
    staticParts(S) {
      const sim = this.sim, G = this.G, lv0 = SZ - 0.35;
      // the line's frame on legs, its side guards with the chutes' openings
      S.box.box(G.X0 - 0.3, G.yL - 0.6, lv0, G.X1 + 0.1, G.yL + 0.6, SZ - 0.12, '#1f2937');
      for (let x = G.X0; x <= G.X1 + 0.01; x += 2) for (const y of [G.yL - 0.55, G.yL + 0.55]) S.box.box(x - 0.05, y - 0.05, 0, x + 0.05, y + 0.05, lv0, '#475569');
      for (const side of [-1, 1]) S.box.box(G.X0 - 0.3, G.yL + side * 0.6 - 0.03, SZ - 0.12, G.D0, G.yL + side * 0.6 + 0.03, SZ + 0.25, '#94a3b8');
      // the induct belts, the queue belts in front of them, the recirculation belt
      for (const p of sim.ports) {
        const s = p.slot, pick = { kind: 'port', id: p.idx };
        this.conveyor(S, [{ x: s.x, y: 0.5 }, { x: s.x, y: s.y - 0.4 }], 0.55, SZ - 0.1, '#334155');
        this.belt(S, sim.feeds[p.idx].pts, 0.55, SZ - 0.1, '#3b4658');
        S.box.box(s.x + 0.35, s.y - 0.9, 0, s.x + 1.05, s.y + 0.1, 0.04, '#10161f', pick);
      }
      this.conveyor(S, sim.ret.pts, 0.55, SZ - 0.1, '#3b4658');
      // the chutes: a slide from the line's edge down to the bag on its stand; the reject chute straight ahead
      for (const ch of sim.chutes) {
        const b = this.bagAt(ch), col = ch === sim.reject ? '#7f1d1d' : '#64748b', cell = this.chuteCell(ch);
        if (ch.side === 2) S.box.slab(G.X1, b.x - 0.35, G.yL - 0.45, SZ - 0.15, G.yL + 0.45, BAGTOP + 0.15, 0.05, col, cell);
        else { const d = ch.side ? 1 : -1; S.box.slab(ch.x - 0.55, ch.x + 0.55, G.yL + d * 0.6, SZ - 0.15, b.y - d * 0.35, BAGTOP + 0.15, 0.05, col, cell); }
        for (const [px, py] of [[-0.42, -0.42], [0.36, 0.36], [-0.42, 0.36], [0.36, -0.42]]) S.box.box(b.x + px, b.y + py, 0, b.x + px + 0.06, b.y + py + 0.06, BAGTOP, '#475569');
        S.box.box(b.x - 0.42, b.y - 0.42, BAGTOP - 0.05, b.x + 0.42, b.y + 0.42, BAGTOP + 0.05, '#475569', cell);
      }
    }
    parcel(x, y, z, p) { const l = WS.SHOE_PLEN(p) / 2, w = 0.25 * p.size; this.dy.box.box(x - l, y - w, z, x + l, y + w, z + 0.4, WS.CARTON(p)); }
    liveParts(alpha) {
      const sim = this.sim, G = this.G, D = this.dy, v = sim.cfg.sorterSpeed, now = sim.time + alpha * sim.cfg.tick, dur = sim.cfg.divertTime;
      // the slats sliding past, each with its shoe; under a parcel being pushed off the shoes glide across, the trailing ones further
      const ph = sim.loopStopped ? (this.slatPh || 0) : (this.slatPh = (now * v) % PITCH);
      for (let x = G.X0 + ph; x < G.X1; x += PITCH) {
        D.box.box(x - 0.055, G.yL - 0.5, SZ - 0.12, x + 0.055, G.yL + 0.5, SZ - 0.06, '#cbd5e1');
        let y = G.yL;
        for (const d of sim.diverts) {
          const t = now - d.t;
          if (t < 0 || t > dur) continue;
          const px = d.x + v * t;
          if (x < px - d.len / 2 - 0.25 || x > px + d.len / 2) continue;
          const f = Math.min(1, Math.max(0, t / dur + (px + d.len / 2 - x) / (d.len + 0.25) * 0.35));
          y = G.yL + (d.ch.side ? 1 : -1) * 0.42 * f;
        }
        D.box.box(x - 0.04, y - 0.05, SZ - 0.06, x + 0.04, y + 0.05, SZ, '#16a34a');
      }
      for (const it of sim.line) { const q = sim.lineAt(it, alpha); this.parcel(q.x, q.y, SZ, it.p); }
      for (const d of sim.diverts) {
        const t = now - d.t;
        if (t < 0 || t > dur) continue;
        this.parcel(d.x + v * t, G.yL + (d.ch.side ? 1 : -1) * 0.95 * (t / dur), SZ, d.p);
      }
      for (const q of [...sim.feeds, sim.ret]) for (const it of q.items) { const a = q.at(it.s); this.parcel(a.x, a.y, SZ - 0.1, it.p); }
      for (const p of sim.ports) {
        const s = p.slot, n = Math.min(4, p.queue.length);
        for (let k = 0; k < n; k++) this.parcel(s.x, 0.9 + k * 0.7, SZ - 0.1, p.queue[k]);
        if (p.ready || p.cur) this.parcel(s.x, s.y - 0.1, SZ - 0.1, p.ready || p.cur);
        if (!p.away) this.operator(s.x + 0.7, s.y - 0.4, Math.PI / 2, !!p.cur, 'station');
      }
    }

    inductQueueAt(p, k) { return { x: p.slot.x, y: 0.9 + k * 0.7, z: SZ }; }
    inductReadyAt(p) { return { x: p.slot.x, y: p.slot.y - 0.1, z: SZ }; }
    inductRect(p) { return [p.slot.x - 0.5, 0.5, p.slot.x + 0.5, p.slot.y + 0.4, SZ]; }
    chuteRect(ch) { const G = this.G, b = this.bagAt(ch); return ch.side === 2 ? [G.X1, G.yL - 0.5, b.x + 0.45, G.yL + 0.5, BAGTOP + 0.1] : [ch.x - 0.6, Math.min(G.yL, b.y) - 0.45, ch.x + 0.6, Math.max(G.yL, b.y) + 0.45, BAGTOP + 0.1]; }
    inductLabel(p) { return { x: p.slot.x, y: 0.2, z: 4.6 }; }
    chuteLabel(ch) { const G = this.G; return ch.side === 2 ? { x: ch.x + 0.3, y: G.yL - 1.1, z: 2.6 } : { x: ch.x, y: G.yL + (ch.side ? 3.0 : -3.0), z: 2.2 }; }
    sorterFocus(pc, dest) {
      const sim = this.sim, G = this.G, it = sim.line.find((x) => x.p === pc);
      if (it) { const q = sim.lineAt(it, this.alpha ?? 1); return { x: q.x, y: q.y, z: SZ, text: `On the slats to ${dest}${pc.laps ? ` · lap ${pc.laps + 1}: its chute was full` : ''}` }; }
      const d = sim.diverts.find((x) => x.p === pc && sim.time - x.t <= sim.cfg.divertTime);
      if (d) return { x: d.x, y: G.yL + (d.ch.side ? 0.9 : -0.9), z: SZ, text: `The shoes push it off into ${d.ch.name}` };
      for (const q of [...sim.feeds, sim.ret]) { const f = q.items.find((x) => x.p === pc); if (f) { const a = q.at(f.s); return { x: a.x, y: a.y, z: SZ, text: q === sim.ret ? `Going round on the recirculation belt (lap ${pc.laps})` : `On the induct belt to the merge${q.atEnd(f) ? ', waiting for a gap' : ''}` }; } }
      return null;
    }
    drawLive(alpha) { this.alpha = alpha; super.drawLive(alpha); }
  }

  WS.ShoeRenderer3D = ShoeRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
