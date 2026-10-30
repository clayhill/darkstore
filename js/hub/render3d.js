/* A parcel sorter in the free 3D view (WS.View3D): what every sorter shows
 * (the bags, parcels falling into them, the bag workers, the labels,
 * selecting a chute or an induct) and following a parcel through it. Each
 * sorter builds its own machine (staticParts, liveParts) and says where its
 * bags hang, where its inducts are and where a parcel on it is
 * (sorterFocus). No packing or dock: the shared stations are not drawn. */
(function (WS) {
  'use strict';

  class HubRenderer3D extends WS.View3D {
    bagAt(ch) { return { x: ch.x, y: ch.y }; }
    get bagTop() { return 1.45; } // the top of a bag (render levels), where its lamp goes
    get dropTop() { return 2.7; } // where a falling parcel starts and how far it falls
    get dropFall() { return 1.2; }
    bounds() { const g = this.sim.grid; return { x0: -2, y0: -2, x1: g.W + 2, y1: g.D + 4 }; }
    buildKey() { const c = this.sim.cfg; return [c.seed, this.sim.kind, c.chutes, c.inducts, this.sim.grid.W, this.sim.grid.D].join('|'); }
    buildStatic() {
      const T = WS.View3D.THREE, b = this.bounds(), S = this.st;
      if (!this.ground) {
        this.ground = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ color: '#1a2332', roughness: 0.95 }));
        this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; this.scene.add(this.ground);
      }
      this.ground.scale.set(b.x1 - b.x0 + 12, b.y1 - b.y0 + 12, 1); this.ground.position.set((b.x0 + b.x1) / 2, -0.002, (b.y0 + b.y1) / 2);
      this.staticParts(S);
    }
    staticParts() {}
    liveParts() {}
    drawStationsLive() {}
    chuteCell(ch) { return { kind: 'cell', id: this.sim.grid.idx(Math.floor(ch.cell.x), Math.floor(ch.cell.y)) }; }
    drawLive(alpha) {
      const sim = this.sim, D = this.dy, cap = sim.cfg.bagCapacity, top = this.bagTop;
      // bags: a sack growing as it fills, a lamp when full or being changed
      for (const ch of sim.chutes) {
        const { x, y } = this.bagAt(ch), f = Math.min(1, ch.count / cap), h = 0.25 + f * (top - 0.4);
        D.box.box(x - 0.34, y - 0.34, top - h, x + 0.34, y + 0.34, top, ch.swapping ? '#94a3b8' : '#e5e7eb', this.chuteCell(ch));
        if (ch.count >= cap || ch.swapping) D.litCyl.cyl(x, y, top + this.lampGap, top + this.lampGap + 0.2, 0.08, ch.swapping ? '#f59e0b' : '#ef4444');
      }
      this.liveParts(alpha);
      sim.workers.forEach((w, k) => {
        const x = w.px + (w.x - w.px) * alpha, y = w.py + (w.y - w.py) * alpha, b = w.chute && this.bagAt(w.chute);
        this.operator(x, y, b ? Math.atan2(x - b.x, y - b.y) : 0, w.state === 'SWAPPING', 'bag', 0, 'bag worker ' + k);
      });
      // parcels falling into their chute
      for (const d of sim.drops) {
        const f = (sim.time - d.t) / 0.5;
        if (f < 0 || f > 1) continue;
        const x = d.from.x + (d.to.x - d.from.x) * f, y = d.from.y + (d.to.y - d.from.y) * f, z = this.dropTop - f * f * this.dropFall, s = 0.3 * d.parcel.size;
        D.box.box(x - s, y - s * 0.8, z, x + s, y + s * 0.8, z + 0.45, WS.CARTON(d.parcel));
      }
    }
    get lampGap() { return 0.15; }

    // ---------------------------------------------------------------- inducts and chutes
    // an induct: where its k-th queued parcel waits, where the one ready for the sorter stands, its footprint
    inductQueueAt() { return null; }
    inductReadyAt() { return null; }
    inductRect() { return null; }
    chuteRect() { return null; }
    pickFloor(f) {
      const g = this.sim.grid, x = Math.floor(f.x), y = Math.floor(f.y);
      for (const p of this.sim.ports) { const r = this.inductRect(p); if (r && f.x >= r[0] && f.x <= r[2] && f.y >= r[1] && f.y <= r[3]) return { kind: 'port', id: p.idx }; }
      return g.inside(x, y) ? { kind: 'cell', id: g.idx(x, y) } : null;
    }
    selectionBox(s, alpha) {
      const sim = this.sim, g = sim.grid;
      if (s.kind === 'cell') {
        const k = g.chuteAt[s.id], r = k >= 0 && this.chuteRect(sim.chutes[k]);
        if (r) return r;
        const x = g.cx(s.id), y = g.cy(s.id);
        return [x, y, x + 1, y + 1, this.pickZ];
      }
      if (s.kind === 'port') return this.inductRect(sim.ports[s.id]);
      return super.selectionBox(s, alpha);
    }
    get pickZ() { return 2.4; }
    inductLabel(p) { return { x: p.drop.x + 0.5, y: p.drop.y, z: 5 }; }
    chuteLabel(ch) { return { x: ch.x, y: ch.y, z: 2.6 }; }
    drawLabels() {
      const sim = this.sim, bg = 'rgba(15,23,42,0.82)';
      for (const p of sim.ports) { const q = this.inductLabel(p); this.label(`${p.code} · ${p.queue.length} waiting`, q.x, q.y, q.z, { size: 10, bg, color: '#fdba74' }); }
      if (this.cam.dist > 26 && !this.cam.walk) return; // chute names only up close
      for (const ch of sim.chutes) { const q = this.chuteLabel(ch); this.label(ch.dest ? ch.dest.name.slice(3) : 'REJECT', q.x, q.y, q.z, { size: 9, bg: ch.count >= sim.cfg.bagCapacity ? 'rgba(127,29,29,0.9)' : bg, color: '#e2e8f0' }); }
    }

    // ---------------------------------------------------------------- following a parcel
    // A parcel on the feed belt, at an induct, on the sorter (sorterFocus), in its chute.
    sorterFocus() { return null; }
    get chuteZ() { return 1.5; } // where a sorted parcel is shown, in its bag
    parcelFocus(pc) {
      const sim = this.sim, g = sim.grid;
      for (const p of sim.ports) {
        const k = p.queue.indexOf(pc);
        if (k < 0 && p.cur !== pc && p.ready !== pc) continue;
        const q = k >= 0 ? this.inductQueueAt(p, Math.min(k, 3)) : this.inductReadyAt(p);
        const text = k >= 0 ? `On the feed belt of ${p.name}, ${k ? k + ' ahead of it' : 'next in line'}` : p.cur === pc ? `${p.name}: the operator scans the label${pc.noRead ? ' — it cannot be read' : ''}` : `${p.name}: ready for the sorter`;
        return Object.assign({}, q, { text, step: k >= 0 ? 0 : 1 });
      }
      const on = this.sorterFocus(pc, pc.target === sim.reject ? 'the reject chute' : pc.dest.name);
      if (on) return Object.assign(on, { step: 2 });
      const d = sim.drops.find((x) => x.parcel === pc);
      if (d) { const b = this.bagAt(d.chute); return { x: b.x, y: b.y, z: this.chuteZ, text: `Sorted into ${d.chute.name} for ${d.chute === sim.reject ? 'reject' : pc.dest.name}`, step: 3, done: true }; }
      return { x: g.W / 2, y: g.D / 2, z: 1, text: 'Waiting at the inbound dock', step: 0 };
    }
  }

  WS.HubRenderer3D = HubRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
