/* PodSwarm in the free 3D view (WS.View3D): the painted floor, shelving pods
 * with their stocked pockets, drive units, the fence and chargers, and the
 * pod stations. Pods keep a fixed range in one instanced batch and are only
 * rewritten when they move, turn or their stock changes. */
(function (WS) {
  'use strict';
  const C = WS.CELL;
  const LEG = 0.9, TOP = 4.6, HALF = 0.42, BODY = 0.62; // as in the isometric view (levels, cells)
  const QUARTER = Math.PI / 2, PER_POD = 72;

  class PodRenderer3D extends WS.View3D {
    buildKey() { return super.buildKey() + '|' + this.sim.inv.bins.length; }

    buildStatic() {
      super.buildStatic();
      const sim = this.sim, g = sim.grid, S = this.st;
      this.buildFloor();
      // safety fence along the back and the left, charger posts on the back wall
      S.glass.box(0, -0.03, 0, g.W, 0.0, 7.4, '#94a3b8'); S.glass.box(-0.03, 0, 0, 0, g.D, 7.4, '#94a3b8');
      for (let x = 0; x <= g.W; x += 2) S.box.box(x - 0.04, -0.06, 0, x + 0.04, 0.02, 7.4, '#64748b');
      for (let y = 0; y <= g.D; y += 2) S.box.box(-0.06, y - 0.04, 0, 0.02, y + 0.04, 7.4, '#64748b');
      S.box.box(0, -0.06, 7.3, g.W, 0.02, 7.45, '#94a3b8'); S.box.box(-0.06, 0, 7.3, 0.02, g.D, 7.45, '#94a3b8');
      for (const ch of g.chargers) S.box.box(ch.x + 0.3, 0.02, 0, ch.x + 0.7, 0.18, 1.8, '#334155');
      // every pod gets its own range in one batch
      if (!this.podBatch) this.podBatch = this.newBatch('box', 'std', 4096);
      this.podBatch.slots(sim.inv.bins.length, PER_POD);
      this.podIdx = new Map(sim.inv.bins.map((b, k) => [b.id, k]));
    }
    extraBatches() { return [this.podBatch]; }

    // The floor paint as one texture: storage cells, highways with their
    // fiducials, lanes with chevrons, stations, chargers, and the traffic heat.
    buildFloor() {
      const g = this.sim.grid, PX = 32, T = WS.View3D.THREE;
      if (!this.floorCv) {
        this.floorCv = document.createElement('canvas');
        this.floorTex = new T.CanvasTexture(this.floorCv);
        this.floorTex.colorSpace = T.SRGBColorSpace; this.floorTex.anisotropy = 8;
        const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ map: this.floorTex, roughness: 0.9 }));
        m.rotation.x = -Math.PI / 2; m.receiveShadow = true; this.scene.add(m); this.floorMesh = m;
      }
      this.floorMesh.scale.set(g.W, g.D, 1); this.floorMesh.position.set(g.W / 2, 0.002, g.D / 2);
      this.floorCv.width = g.W * PX; this.floorCv.height = g.D * PX;
      this.paintFloor(); this.heatAt = performance.now();
    }
    paintFloor() {
      const sim = this.sim, g = sim.grid, PX = 32, c = this.floorCv.getContext('2d');
      c.fillStyle = '#232d3d'; c.fillRect(0, 0, g.W * PX, g.D * PX);
      const rect = (x, y, i, fill) => { c.fillStyle = fill; c.fillRect(x * PX + i, y * PX + i, PX - 2 * i, PX - 2 * i); };
      for (let y = 0; y < g.D; y++) for (let x = 0; x < g.W; x++) {
        const i = g.idx(x, y), t = g.type[i];
        if (t === C.STORAGE) rect(x, y, 1, '#1c2533');
        else if (t === C.BLOCKED) rect(x, y, 0, '#141b27');
        else if (t === C.LANE) {
          rect(x, y, 1, '#2a2614');
          const d = sim.ports[g.laneOf[i]].docks[g.dockOf[i]], nx = d.cells[g.laneIdx[i] + 1], dx = nx.x - x, dy = nx.y - y, mx = (x + 0.5) * PX, my = (y + 0.5) * PX, k = PX * 0.2;
          c.strokeStyle = 'rgba(250,204,21,0.6)'; c.lineWidth = 3; c.beginPath();
          c.moveTo(mx - k * dx - k * dy, my - k * dy + k * dx); c.lineTo(mx + k * 0.5 * dx, my + k * 0.5 * dy); c.lineTo(mx - k * dx + k * dy, my - k * dy - k * dx); c.stroke();
        } else if (t === C.PORT) { rect(x, y, 1, '#3a2f12'); c.strokeStyle = '#facc15'; c.lineWidth = 2; c.strokeRect(x * PX + 2, y * PX + 2, PX - 4, PX - 4); } else if (t === C.CHARGER) { rect(x, y, 2, '#14532d'); c.strokeStyle = '#4ade80'; c.lineWidth = 1.5; c.strokeRect(x * PX + 6, y * PX + 6, PX - 12, PX - 12); }
        if (t === C.STORAGE || t === C.HIGHWAY) { rect(x, y, PX * 0.44, '#64748b'); rect(x, y, PX * 0.47, '#1e293b'); }
        if (this.opts.heat && (t === C.STORAGE || t === C.HIGHWAY)) {
          const v = Math.max(Math.min(1, g.waitHeat[i] / 40), Math.min(1, g.passHeat[i] / 60) * 0.6);
          if (v > 0.04) rect(x, y, 0, `rgba(239,68,68,${(v * 0.7).toFixed(2)})`);
        }
      }
      // storage blocks outlined in yellow floor paint
      c.strokeStyle = 'rgba(202,138,4,0.6)'; c.lineWidth = 2; c.beginPath();
      const st = (x, y) => g.inside(x, y) && g.type[g.idx(x, y)] === C.STORAGE;
      for (let y = 0; y < g.D; y++) for (let x = 0; x < g.W; x++) {
        if (!st(x, y)) continue;
        if (!st(x, y - 1)) { c.moveTo(x * PX, y * PX); c.lineTo((x + 1) * PX, y * PX); }
        if (!st(x, y + 1)) { c.moveTo(x * PX, (y + 1) * PX); c.lineTo((x + 1) * PX, (y + 1) * PX); }
        if (!st(x - 1, y)) { c.moveTo(x * PX, y * PX); c.lineTo(x * PX, (y + 1) * PX); }
        if (!st(x + 1, y)) { c.moveTo((x + 1) * PX, y * PX); c.lineTo((x + 1) * PX, (y + 1) * PX); }
      }
      c.stroke();
      this.floorTex.needsUpdate = true;
    }

    // ---------------------------------------------------------------- pods
    // One pocket of face k (shelf j, bin s) as a box sticking out of the face
    // between `o0` and `o1` cells, from z0 to z1.
    pocket(B, cx, cy, a, k, s, o0, o1, z0, z1, color, pick) {
      const h = HALF, slots = this.sim.cfg.podSlots;
      const t0 = 0.06 + (0.88 * s) / slots + 0.02, t1 = 0.06 + (0.88 * (s + 1)) / slots - 0.02;
      // position along the face from its corner k to corner k + 1, and the outward side
      const along = [[-h + 2 * h * t0, -h + 2 * h * t1], [h - 2 * h * t0, h - 2 * h * t1], [h - 2 * h * t0, h - 2 * h * t1], [-h + 2 * h * t0, -h + 2 * h * t1]][k];
      const lo = Math.min(...along), hi = Math.max(...along), out = k < 2 ? 1 : -1, n0 = out * (h + o0), n1 = out * (h + o1);
      if (k % 2 === 0) B.rbox(cx, cy, a, lo, Math.min(n0, n1), z0, hi, Math.max(n0, n1), z1, color, pick);
      else B.rbox(cx, cy, a, Math.min(n0, n1), lo, z0, Math.max(n0, n1), hi, z1, color, pick);
    }
    stockColor(cp) {
      const inv = this.sim.inv;
      return this.opts.heat ? WS.CLASS_COLORS[inv.byGtin.get(cp.gtin).cls] : `hsl(${(parseInt(cp.gtin.slice(7, 12), 10) * 47) % 360},50%,55%)`;
    }
    // Shelving pod: legs, deck, body, top, and four faces of pockets showing their stock.
    writePod(B, pod, cx, cy, a, z0, pick) {
      const cfg = this.sim.cfg, inv = this.sim.inv, h = HALF, zb = z0 + LEG, zt = z0 + TOP;
      for (const [u, v] of [[-h, -h], [h - 0.06, -h], [-h, h - 0.06], [h - 0.06, h - 0.06]]) B.rbox(cx, cy, a, u, v, z0, u + 0.06, v + 0.06, zb, '#a16207', pick);
      B.rbox(cx, cy, a, -h, -h, zb - 0.12, h, h, zb, '#5c4310', pick);
      B.rbox(cx, cy, a, -h + 0.01, -h + 0.01, zb, h - 0.01, h - 0.01, zt, '#ca9a0a', pick);
      B.rbox(cx, cy, a, -h, -h, zt, h, h, zt + 0.1, pod.requests.length && pod.loc === 'grid' ? '#fde68a' : '#facc15', pick);
      const shelves = cfg.podShelves, slots = cfg.podSlots, per = shelves * slots, hz = (zt - zb) / shelves;
      for (let k = 0; k < 4; k++) {
        for (let j = 0; j < shelves; j++) {
          const za = zb + j * hz + 0.12, zc = zb + (j + 1) * hz - 0.08;
          for (let s = 0; s < slots; s++) {
            const cp = pod.comps[k * per + j * slots + s];
            this.pocket(B, cx, cy, a, k, s, -0.01, 0.012, za, zc, '#1e3a5f', pick);
            if (cp.gtin && cp.qty > 0) {
              const fill = Math.min(1, cp.qty / inv.compCap(pod, inv.byGtin.get(cp.gtin)));
              this.pocket(B, cx, cy, a, k, s, 0.0, 0.035, za + 0.04, za + 0.04 + (zc - za - 0.12) * (0.35 + 0.65 * fill), this.stockColor(cp), pick);
            }
          }
        }
      }
    }
    // a pod's footprint (turned by angle) for the audit (WS.View3D.probe)
    probePod(cx, cy, a, z0) { const h = HALF * (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a))); this.probeAdd('pod', cx - h, cy - h, z0, cx + h, cy + h, z0 + TOP); }
    stockSig(pod) { let h = 0; for (let k = 0; k < pod.comps.length; k++) h = (h * 31 + pod.comps[k].qty * (k + 1)) | 0; return h; }

    // ---------------------------------------------------------------- frame
    drawLive(alpha) {
      const sim = this.sim, g = sim.grid, inv = sim.inv, D = this.dy, P = this.podBatch;
      if (this.opts.heat && performance.now() - this.heatAt > 1000) { this.paintFloor(); this.heatAt = performance.now(); }
      const seen = new Uint8Array(inv.bins.length), heat = this.opts.heat ? 1 : 0;
      // a pod being lifted off its cell rises with the robot under it
      const lifting = new Map();
      for (const r of sim.fleet) if (r.state === 'LIFTING_POD' && r.op && r.op.op === 'timer' && !r.bin) lifting.set(g.idx(r.x, r.y), r.op.t / r.op.dur);
      for (let i = 0; i < g.podAt.length; i++) {
        const id = g.podAt[i]; if (!id) continue;
        const pod = inv.binById.get(id), k = this.podIdx.get(id), lift = (lifting.get(i) || 0) * 0.25;
        seen[k] = 1;
        if (this.probe) this.probePod(g.cx(i) + 0.5, g.cy(i) + 0.5, pod.angle, lift);
        if (P.open(k, `${i}|${pod.angle}|${lift}|${pod.requests.length > 0}|${heat}|${this.stockSig(pod)}`)) {
          this.writePod(P, pod, g.cx(i) + 0.5, g.cy(i) + 0.5, pod.angle, lift, { kind: 'cell', id: i });
          P.close(k);
        }
      }
      for (const r of sim.fleet) {
        const x = r.prx + (r.rx - r.prx) * alpha + 0.5, y = r.pry + (r.ry - r.pry) * alpha + 0.5, pick = { kind: 'robot', id: r.id };
        this.drawRobot(r, x, y, pick);
        if (!r.bin) continue;
        const pod = inv.binById.get(r.bin), k = this.podIdx.get(r.bin);
        let lift = 1;
        if (r.state === 'LIFTING_POD' && r.op && r.op.op === 'timer') lift = 1 - r.op.t / r.op.dur;
        seen[k] = 1;
        if (this.probe) this.probePod(x, y, pod.angle, lift * 0.25);
        if (P.open(k, `r${x}|${y}|${pod.angle}|${lift}|${heat}|${this.stockSig(pod)}`)) { this.writePod(P, pod, x, y, pod.angle, lift * 0.25, pick); P.close(k); }
        // the pocket the operator picks from lights up
        const port = pod.loc === 'port' ? sim.ports[pod.port] : null, ln = port && port.job && port.job.bin === pod ? port.currentLine : null;
        if (ln) {
          const per = sim.perFace, f = Math.floor(ln.comp / per), rest = ln.comp % per, j = Math.floor(rest / sim.cfg.podSlots), s = rest % sim.cfg.podSlots;
          const zb = lift * 0.25 + LEG, hz = (TOP - LEG) / sim.cfg.podShelves, on = Math.sin(this.t * 8) > -0.4;
          if (on) this.pocket(D.lit, x, y, pod.angle, f, s, 0.03, 0.05, zb + j * hz + 0.1, zb + (j + 1) * hz - 0.06, '#4ade80');
        }
      }
      for (let k = 0; k < seen.length; k++) if (!seen[k] && P.open(k, 'off')) P.close(k);
      P.flush();
      for (const ch of g.chargers) {
        const on = ch.robot >= 0 && sim.fleet[ch.robot].state === 'CHARGING';
        (on ? D.lit : D.box).box(ch.x + 0.35, 0.17, 1.2, ch.x + 0.65, 0.19, 1.6, on ? '#4ade80' : '#166534');
      }
    }
    // Drive unit: low orange octagonal body on a dark skirt, a state-coloured
    // light band and the round lift plate on top. It turns on the spot.
    drawRobot(r, x, y, pick) {
      const sim = this.sim, D = this.dy, col = WS.stateColor(sim, r.displayState);
      const f = r.shift > 0 ? 1 - r.shift / sim.cfg.wheelShift : 1, a = (r.axis === 'x' ? 0 : QUARTER) - (1 - f) * QUARTER;
      const d = 0.8 / Math.cos(Math.PI / 8);
      D.oct.cyl(x, y, 0.02, 0.16, d / 2, '#1f2937', pick, a);
      D.oct.cyl(x, y, 0.16, 0.36, d / 2, '#ea6a12', pick, a);
      D.litOct.cyl(x, y, 0.36, 0.46, d / 2 + 0.005, col, null, a);
      D.oct.cyl(x, y, 0.46, BODY, d / 2, '#f97316', pick, a);
      D.cyl.cyl(x, y, BODY, BODY + 0.05, 0.27, '#334155', pick);
    }
    // Pod station: a pick frame across the presentation points with a light
    // curtain, the operator's screen and a stack light.
    frame(p) {
      const g = this.sim.grid, n = p.points, front = p.face === 'front';
      return front ? { x0: p.drop.x, y0: g.D, x1: p.drop.x + n, y1: g.D } : { x0: g.W, y0: p.drop.y, x1: g.W, y1: p.drop.y + n };
    }
    portBody(S, p) {
      const f = this.frame(p), pick = { kind: 'port', id: p.idx }, front = p.face === 'front';
      for (const [px, py] of [[f.x0, f.y0], [f.x1, f.y1]]) S.box.box(px - 0.05, py - 0.05, 0, px + 0.05, py + 0.05, TOP + 1.1, '#475569', pick);
      S.box.box(f.x0 - 0.05, f.y0 - 0.05, TOP + 0.9, f.x1 + 0.05, f.y1 + 0.05, TOP + 1.25, '#1f2937', pick);
      const sx = front ? f.x0 - 0.35 : f.x0 + 0.35, sy = front ? f.y0 + 0.35 : f.y0 - 0.35;
      S.box.box(sx - 0.03, sy - 0.03, 0, sx + 0.03, sy + 0.03, 3.4, '#475569');
      S.box.box(sx - 0.28, sy - 0.06, 3.3, sx + 0.28, sy + 0.04, 4.6, '#0f172a', pick);
    }
    portLive(p) {
      const D = this.dy, f = this.frame(p), front = p.face === 'front', active = !!(p.job && p.currentLine);
      if (active) for (let z = 0.6; z < TOP; z += 0.55) D.clear.box(f.x0, f.y0 - 0.01, z, f.x1, f.y1 + 0.01, z + 0.04, '#f87171');
      if (active) D.lit.box(f.x0 + 0.1, f.y0 + 0.04, TOP + 0.95, f.x1 - 0.1, f.y1 + 0.06, TOP + 1.05, '#4ade80');
      const sx = front ? f.x0 - 0.35 : f.x0 + 0.35, sy = front ? f.y0 + 0.35 : f.y0 - 0.35;
      D.lit.box(sx - 0.24, sy + 0.04, 3.4, sx + 0.24, sy + 0.05, 4.5, p.job ? '#0c4a6e' : '#111c2e');
      if (p.job) { D.lit.box(sx - 0.2, sy + 0.05, 4.2, sx + 0.05, sy + 0.06, 4.38, '#e0f2fe'); D.lit.box(sx - 0.2, sy + 0.05, 3.85, sx + 0.18, sy + 0.06, 4.05, '#4ade80'); }
      this.stackLight(f.x1, f.y1, TOP + 1.3, p);
    }

    // ---------------------------------------------------------------- picking and selection
    pickFloor(f) {
      const sim = this.sim, g = sim.grid, x = Math.floor(f.x), y = Math.floor(f.y);
      if (g.inside(x, y)) {
        const i = g.idx(x, y), port = sim.ports.find((p) => p.cells.some((c) => g.idx(c.x, c.y) === i));
        return port ? { kind: 'port', id: port.idx } : { kind: 'cell', id: i };
      }
      for (const p of sim.ports) {
        const fr = this.frame(p);
        if (p.face === 'front' && f.x >= fr.x0 - 0.6 && f.x <= fr.x1 + 0.6 && f.y >= g.D && f.y <= g.D + 1.6) return { kind: 'port', id: p.idx };
        if (p.face === 'right' && f.y >= fr.y0 - 0.6 && f.y <= fr.y1 + 0.6 && f.x >= g.W && f.x <= g.W + 1.6) return { kind: 'port', id: p.idx };
      }
      return super.pickFloor(f);
    }
    selectionBox(s, alpha) {
      const g = this.sim.grid;
      if (s.kind === 'cell') { const x = g.cx(s.id), y = g.cy(s.id); return [x, y, x + 1, y + 1]; }
      if (s.kind === 'port') { const p = this.sim.ports[s.id], f = this.frame(p); return p.face === 'front' ? [f.x0, g.D - 1, f.x1, g.D + 1.4] : [g.W - 1, f.y0, g.W + 1.4, f.y1]; }
      return super.selectionBox(s, alpha);
    }
    drawLabels() {
      super.drawLabels();
      for (const r of this.sim.fleet) this.label(r.name, r.rx + 0.5, r.ry + 0.5, r.bin ? TOP + 1.2 : 1.6, { size: 9, color: '#0f172a', weight: 800, bg: 'rgba(241,245,249,0.85)' });
    }
  }

  WS.PodRenderer3D = PodRenderer3D;
})((globalThis.WS = globalThis.WS || {}));
