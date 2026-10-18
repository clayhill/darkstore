/* Free 3D view shared by every storage type, drawn with WebGL (three.js,
 * loaded the first time the view opens). It shows the same world as the
 * isometric view: x and y in cells, z in render levels, and three.js gets
 * X = x, Y = z · LZ, Z = y. Everything is built from boxes and cylinders drawn
 * in bulk (instanced): static parts once, moving parts every frame.
 * This base holds the scene, camera and input (orbit, walk, follow), picking,
 * labels and what every warehouse has outside its storage: stations,
 * packing and the dock. A storage type's 3D renderer extends it. */
(function (WS) {
  'use strict';
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
  // cells per render level: how high the isometric view draws a level
  const LZ = 17 / ((64 / Math.SQRT2) * Math.cos(Math.PI / 6));
  const BG = '#0b1220';
  let THREE = null, M = null, V = null;
  const colors = new Map();
  const col = (c) => { let v = colors.get(c); if (!v) { v = new THREE.Color(c); colors.set(c, v); } return v; };

  // Boxes or cylinders of one material drawn as one instanced mesh. A batch
  // is refilled every frame (begin … end) or once for static parts; slots()
  // gives each object its own fixed range so only changed objects are rewritten.
  class Batch {
    constructor(view, geo, mat, o = {}) {
      Object.assign(this, { view, geo, mat, shadow: o.shadow !== false, n: 0, cap: 0, picks: [], mesh: null });
      this.alloc(o.cap || 256);
    }
    alloc(cap) {
      const old = this.mesh, m = new THREE.InstancedMesh(this.geo, this.mat, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, col('#ffffff'));
      if (old) {
        m.instanceMatrix.array.set(old.instanceMatrix.array); m.instanceColor.array.set(old.instanceColor.array);
        this.view.scene.remove(old); old.dispose();
      }
      m.frustumCulled = false; m.castShadow = m.receiveShadow = this.shadow; m.userData.batch = this;
      this.view.scene.add(m); this.mesh = m; this.cap = cap;
    }
    begin() { this.n = 0; this.picks.length = 0; }
    end() {
      const m = this.mesh;
      m.count = this.n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.boundingSphere = null;
    }
    put(color, pick) {
      if (this.n >= this.cap) this.alloc(this.cap * 2);
      this.mesh.setMatrixAt(this.n, M); this.mesh.setColorAt(this.n, col(color)); this.picks[this.n] = pick || null; this.n++;
    }
    // axis-aligned box between two world corners
    box(x0, y0, z0, x1, y1, z1, color, pick) {
      M.makeScale(Math.abs(x1 - x0) || 1e-4, Math.abs(z1 - z0) * LZ || 1e-4, Math.abs(y1 - y0) || 1e-4);
      M.setPosition((x0 + x1) / 2, ((z0 + z1) / 2) * LZ, (y0 + y1) / 2);
      this.put(color, pick);
    }
    // box given in a frame turned by angle a around (cx, cy), local u right and v forward
    rbox(cx, cy, a, u0, v0, z0, u1, v1, z1, color, pick) {
      const c = Math.cos(a), s = Math.sin(a), uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
      M.makeRotationY(a); M.scale(V.set(u1 - u0 || 1e-4, (z1 - z0) * LZ || 1e-4, v1 - v0 || 1e-4));
      M.setPosition(cx + uc * c + vc * s, ((z0 + z1) / 2) * LZ, cy - uc * s + vc * c);
      this.put(color, pick);
    }
    // cylinder of radius r: upright from z0 to z1 (axis 'z'), or lying along x or y
    // from a to b around (p, q) = (y, z) or (x, z)
    cyl(cx, cy, z0, z1, r, color, pick, a = 0) {
      M.makeRotationY(a); M.scale(V.set(2 * r, (z1 - z0) * LZ, 2 * r));
      M.setPosition(cx, ((z0 + z1) / 2) * LZ, cy);
      this.put(color, pick);
    }
    cylX(x0, x1, y, z, r, color, pick) {
      M.makeRotationZ(Math.PI / 2); M.scale(V.set(2 * r, x1 - x0, 2 * r * LZ));
      M.setPosition((x0 + x1) / 2, z * LZ, y);
      this.put(color, pick);
    }
    cylY(x, y0, y1, z, r, color, pick) {
      M.makeRotationX(Math.PI / 2); M.scale(V.set(2 * r, y1 - y0, 2 * r * LZ));
      M.setPosition(x, z * LZ, (y0 + y1) / 2);
      this.put(color, pick);
    }
    // fixed ranges of `size` instances per object, for `count` objects
    slots(count, size) {
      this.size = size; this.sig = new Array(count).fill(null);
      while (this.cap < count * size) this.alloc(this.cap * 2);
      this.n = 0; M.makeScale(0, 0, 0);
      for (let i = 0; i < count * size; i++) this.mesh.setMatrixAt(i, M);
      this.mesh.count = count * size; this.picks.length = count * size; this.picks.fill(null);
      this.dirty = true;
    }
    // rewrite object k's range when its signature changed; returns false when unchanged
    open(k, sig) {
      if (this.sig[k] === sig) return false;
      this.sig[k] = sig; this.n = k * this.size; this.dirty = true;
      return true;
    }
    close(k) {
      const e = (k + 1) * this.size;
      if (this.n > e) throw new Error('slot overflow');
      M.makeScale(0, 0, 0);
      while (this.n < e) { this.mesh.setMatrixAt(this.n, M); this.picks[this.n++] = null; }
    }
    flush() {
      if (!this.dirty) return;
      this.dirty = false;
      const m = this.mesh; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.boundingSphere = null;
    }
  }

  class View3D {
    // three.js is loaded on first use; create() resolves to the type's 3D renderer
    static async create(Cls, canvas, labels, app) {
      if (!THREE) {
        THREE = View3D.THREE = await import(THREE_URL);
        M = new THREE.Matrix4(); V = new THREE.Vector3();
      }
      return new Cls(canvas, labels, app);
    }

    constructor(canvas, labels, app) {
      this.canvas = canvas; this.labels = labels; this.lctx = labels.getContext('2d'); this.app = app;
      this.t = 0; this.CZ = 2.2; // conveyor height (levels), as in the isometric view
      const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }));
      r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.setClearColor(BG);
      const scene = (this.scene = new THREE.Scene());
      scene.fog = new THREE.Fog(BG, 70, 190);
      this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
      scene.add(new THREE.HemisphereLight('#c7d7ff', '#1a2332', 1.6));
      const sun = (this.sun = new THREE.DirectionalLight('#ffffff', 2.2));
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
      scene.add(sun, sun.target);
      // unit shapes: box, smooth cylinder, octagonal prism (flat sides facing the axes)
      const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 18), oct = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
      oct.rotateY(Math.PI / 8);
      const std = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.08 });
      const lit = new THREE.MeshBasicMaterial({ toneMapped: false }); // lamps, screens, state lights
      const clear = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.32, depthWrite: false });
      this.geos = { box, cyl, oct }; this.mats = { std, lit, clear };
      const mk = () => ({
        box: this.newBatch('box'), cyl: this.newBatch('cyl'), oct: this.newBatch('oct'),
        lit: this.newBatch('box', 'lit'), litCyl: this.newBatch('cyl', 'lit'), litOct: this.newBatch('oct', 'lit'), clear: this.newBatch('box', 'clear'),
      });
      this.st = mk(); this.dy = mk();
      this.paths = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }));
      this.paths.frustumCulled = false; scene.add(this.paths);
      this.cam = { tx: 0, ty: 0, yaw: Math.PI / 4, pitch: 0.62, dist: 40, walk: false, ex: 0, ey: 0, follow: null };
      this.keys = new Set(); this.ray = new THREE.Raycaster(); this.last = 0;
      this.staticKey = null;
      this.bindInput();
    }
    // a batch of one shape ('box', 'cyl', 'oct') in one material ('std', 'lit' unlit, 'clear' see-through)
    newBatch(shape, mat = 'std', cap) { return new Batch(this, this.geos[shape], this.mats[mat], { shadow: mat === 'std', cap }); }
    get sim() { return this.app.sim; }
    get opts() { return this.app.iso.opts; }
    get selected() { return this.app.iso.selected; }
    reset() { this.staticKey = null; this.cam.follow = null; }

    resize() {
      const r = this.canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      if (!r.width) return;
      this.w = r.width; this.h = r.height; this.dpr = dpr;
      this.renderer.setPixelRatio(dpr); this.renderer.setSize(r.width, r.height, false);
      this.labels.width = Math.round(r.width * dpr); this.labels.height = Math.round(r.height * dpr);
      this.camera.aspect = r.width / r.height; this.camera.updateProjectionMatrix();
    }
    // floor area in cells, as the isometric view frames it
    bounds() {
      const g = this.sim.grid, d = this.sim.layout.dock();
      return { x0: -1, y0: -1, x1: d.x + 6, y1: g.D + 8 };
    }
    fit() {
      // look at the storage from the front-right corner, with the stations and packing in view
      const b = this.bounds(), g = this.sim.grid, c = this.cam;
      Object.assign(c, { walk: false, follow: null, tx: (b.x0 + b.x1) * 0.42, ty: g.D * 0.62, yaw: Math.PI / 5, pitch: 0.72 });
      c.dist = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 1.05 / Math.min(1, this.w / this.h);
      this.syncWalkButton();
    }

    // ---------------------------------------------------------------- camera and input
    bindInput() {
      const c = this.canvas;
      let drag = null, hoverAt = 0;
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('pointerdown', (e) => {
        c.setPointerCapture(e.pointerId);
        drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, pan: e.button === 2 || e.shiftKey };
      });
      c.addEventListener('pointermove', (e) => {
        if (!drag) {
          const now = performance.now();
          if (now - hoverAt < 120) return;
          hoverAt = now;
          const p = this.mouse(e);
          this.app.iso.hover = this.pick(p.x, p.y);
          c.style.cursor = this.app.iso.hover ? 'pointer' : this.cam.walk ? 'crosshair' : 'grab';
          return;
        }
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y, cam = this.cam;
        drag.x = e.clientX; drag.y = e.clientY;
        if (cam.walk) { cam.yaw += dx * 0.004; cam.pitch = WS.U.clamp(cam.pitch + dy * 0.004, -1.2, 1.2); } else if (drag.pan) this.panBy(dx, dy);
        else { cam.yaw -= dx * 0.006; cam.pitch = WS.U.clamp(cam.pitch + dy * 0.005, 0.05, 1.5); }
      });
      c.addEventListener('pointerup', (e) => {
        if (drag && Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) < 4) {
          const p = this.mouse(e), hit = this.pick(p.x, p.y);
          this.app.iso.selected = hit; this.app.ui.select(hit);
        }
        drag = null;
      });
      // double-click a robot or machine to ride along with it
      c.addEventListener('dblclick', (e) => {
        const p = this.mouse(e), hit = this.pick(p.x, p.y);
        if (hit && hit.kind === 'robot' && !this.cam.walk) { this.cam.follow = hit.id; this.cam.dist = Math.min(this.cam.dist, 14); }
      });
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        const cam = this.cam, f = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        if (cam.walk) { const s = (1 - f) * 12, h = this.heading(); cam.ex += h.x * s; cam.ey += h.y * s; return; }
        // zoom towards the floor point under the cursor
        const p = this.mouse(e), g = this.floorAt(p.x, p.y), d = WS.U.clamp(cam.dist * f, 3, 220);
        if (g && !cam.follow) { const k = 1 - d / cam.dist; cam.tx += (g.x - cam.tx) * k; cam.ty += (g.y - cam.ty) * k; }
        cam.dist = d;
      }, { passive: false });
      const typing = (e) => e.target.matches && e.target.matches('input, select, textarea');
      window.addEventListener('keydown', (e) => { if (this.app.view === '3d' && !typing(e)) { this.keys.add(e.code); if (e.code === 'Escape') this.cam.follow = null; } });
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
      window.addEventListener('blur', () => this.keys.clear());
      const walk = document.getElementById('btn-walk');
      if (walk) walk.addEventListener('click', () => this.setWalk(!this.cam.walk));
    }
    mouse(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    // direction the camera looks along the floor (x, y)
    heading() { return { x: -Math.sin(this.cam.yaw), y: -Math.cos(this.cam.yaw) }; }
    panBy(dx, dy) {
      const cam = this.cam, s = (cam.dist * 2 * Math.tan((this.camera.fov * Math.PI) / 360)) / this.h, c = Math.cos(cam.yaw), sn = Math.sin(cam.yaw);
      cam.follow = null;
      cam.tx -= (dx * c - dy * sn / Math.max(0.35, Math.sin(cam.pitch))) * s;
      cam.ty -= (-dx * sn - dy * c / Math.max(0.35, Math.sin(cam.pitch))) * s;
    }
    // Walk mode: eye height on the floor, drag to look around, WASD to walk.
    setWalk(on) {
      const cam = this.cam;
      if (on === cam.walk) return;
      cam.walk = on; cam.follow = null;
      if (on) {
        const back = Math.min(cam.dist * 0.5, 8);
        cam.ex = cam.tx + Math.sin(cam.yaw) * back; cam.ey = cam.ty + Math.cos(cam.yaw) * back; cam.pitch = -0.05;
      } else {
        const h = this.heading();
        cam.tx = cam.ex + h.x * 6; cam.ty = cam.ey + h.y * 6; cam.dist = 16; cam.pitch = 0.55;
      }
      this.syncWalkButton();
    }
    syncWalkButton() { const b = document.getElementById('btn-walk'); if (b) b.classList.toggle('on', this.cam.walk); }
    // eye height in cells: 1.7 m
    get eye() { return 1.7 / (this.sim.cfg.cellSize || 1); }
    updateCamera(dt, alpha) {
      const cam = this.cam, k = this.keys, h = this.heading(), side = { x: -h.y, y: h.x };
      let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      let s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const turn = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0), fast = k.has('ShiftLeft') || k.has('ShiftRight') ? 3 : 1;
      cam.yaw -= turn * dt * 1.4;
      if (cam.walk) {
        const v = 3.5 * fast * dt;
        cam.ex += (h.x * f + side.x * s) * v; cam.ey += (h.y * f + side.y * s) * v;
        const p = this.camera.position.set(cam.ex, this.eye, cam.ey);
        this.camera.lookAt(p.x + h.x * Math.cos(cam.pitch), this.eye - Math.sin(cam.pitch), p.z + h.y * Math.cos(cam.pitch));
        return;
      }
      if (f || s) {
        cam.follow = null;
        const v = cam.dist * 0.7 * fast * dt;
        cam.tx += (h.x * f + side.x * s) * v; cam.ty += (h.y * f + side.y * s) * v;
      }
      if (cam.follow != null) {
        const r = this.followPos(cam.follow, alpha);
        if (r) { cam.tx += (r.x - cam.tx) * Math.min(1, dt * 6); cam.ty += (r.y - cam.ty) * Math.min(1, dt * 6); } else cam.follow = null;
      }
      const cp = Math.cos(cam.pitch);
      this.camera.position.set(cam.tx + cam.dist * cp * Math.sin(cam.yaw), cam.dist * Math.sin(cam.pitch), cam.ty + cam.dist * cp * Math.cos(cam.yaw));
      this.camera.lookAt(cam.tx, 0, cam.ty);
    }
    // where a followed robot is drawn now (cell centre); a type may override
    followPos(id, alpha) {
      const r = this.sim.fleet[id];
      if (!r || r.prx == null) return null;
      return { x: r.prx + (r.rx - r.prx) * alpha + 0.5, y: r.pry + (r.ry - r.pry) * alpha + 0.5 };
    }

    // ---------------------------------------------------------------- picking
    floorAt(sx, sy) {
      this.ray.setFromCamera({ x: (sx / this.w) * 2 - 1, y: -(sy / this.h) * 2 + 1 }, this.camera);
      const o = this.ray.ray.origin, d = this.ray.ray.direction;
      if (d.y >= -1e-4) return null;
      const t = -o.y / d.y;
      return { x: o.x + d.x * t, y: o.z + d.z * t };
    }
    // The nearest pickable instance under the cursor, else what is on the floor there.
    pick(sx, sy) {
      if (!this.w) return null;
      this.ray.setFromCamera({ x: (sx / this.w) * 2 - 1, y: -(sy / this.h) * 2 + 1 }, this.camera);
      const meshes = [];
      for (const set of [this.dy, this.st]) for (const k of ['box', 'cyl', 'oct']) if (set[k].mesh.count) meshes.push(set[k].mesh);
      for (const b of this.extraBatches()) if (b.mesh.count) meshes.push(b.mesh);
      // robots win, as in the isometric view: one under a pod is picked through it
      let first = null;
      for (const hit of this.ray.intersectObjects(meshes, false)) {
        const p = hit.object.userData.batch.picks[hit.instanceId];
        if (!p) continue;
        if (p.kind === 'robot') return p;
        if (!first) first = { p, d: hit.distance };
        else if (hit.distance - first.d > 3) break;
      }
      if (first) return first.p;
      const f = this.floorAt(sx, sy);
      return f ? this.pickFloor(f) : null;
    }
    extraBatches() { return []; }
    pickFloor(f) {
      const sim = this.sim, L = sim.layout;
      for (const pk of sim.oms.packers) { const q = L.packerPos(pk.idx); if (Math.abs(f.x - q.x) < 1.2 && Math.abs(f.y - q.y) < 1.2) return { kind: 'packer', id: pk.idx }; }
      const d = L.dock();
      if (f.x > d.x - 1 && f.x < d.x + 6 && Math.abs(f.y - d.y) < 1.6) return { kind: 'dock' };
      return null;
    }

    // ---------------------------------------------------------------- frame
    draw(alpha) {
      if (!this.w) this.resize();
      if (!this.w) return;
      const now = performance.now(), dt = Math.min(0.1, (now - (this.last || now)) / 1000);
      this.last = now; this.t = now / 1000;
      const key = this.buildKey();
      if (key !== this.staticKey) {
        this.staticKey = key;
        for (const b of Object.values(this.st)) b.begin();
        this.buildStatic();
        for (const b of Object.values(this.st)) b.end();
        this.placeSun();
      }
      this.updateCamera(dt, alpha);
      for (const b of Object.values(this.dy)) b.begin();
      this.drawLive(alpha);
      this.drawStationsLive();
      this.drawSelection(alpha);
      for (const b of Object.values(this.dy)) b.end();
      this.drawPaths(alpha);
      this.renderer.render(this.scene, this.camera);
      this.drawLabelLayer();
    }
    // static parts are rebuilt when this changes
    buildKey() { return [this.sim.cfg.seed, this.sim.ports.length, this.opts.heat].join('|'); }
    placeSun() {
      const b = this.bounds(), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, r = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2 + 4;
      this.sun.position.set(cx - r * 0.45, r * 1.1, cy + r * 0.75); this.sun.target.position.set(cx, 0, cy);
      const sc = this.sun.shadow.camera;
      sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = r * 4; sc.updateProjectionMatrix();
    }
    buildStatic() {
      const b = this.bounds(), S = this.st;
      if (!this.ground) {
        this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#1a2332', roughness: 0.95 }));
        this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; this.scene.add(this.ground);
      }
      const x0 = b.x0 - 6, x1 = b.x1 + 6, y0 = b.y0 - 6, y1 = b.y1 + 6;
      this.ground.scale.set(x1 - x0, y1 - y0, 1); this.ground.position.set((x0 + x1) / 2, -0.002, (y0 + y1) / 2);
      this.buildStations(S);
    }

    // ---------------------------------------------------------------- shared parts
    // conveyor: frame from the floor up to z with rollers across it
    conveyor(B, pts, width, z, color) {
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k], hw = width / 2, along = a.x !== b.x;
        const x0 = Math.min(a.x, b.x) - hw, x1 = Math.max(a.x, b.x) + hw, y0 = Math.min(a.y, b.y) - hw, y1 = Math.max(a.y, b.y) + hw;
        B.box.box(x0, y0, z - 0.35, x1, y1, z - 0.05, color || '#334155');
        for (const [lx, ly] of [[x0, y0], [x1, y1], [x0, y1], [x1, y0]]) B.box.box(lx - 0.03 + (lx === x0 ? 0.06 : -0.06), ly - 0.03 + (ly === y0 ? 0.06 : -0.06), 0, lx + 0.03 + (lx === x0 ? 0.06 : -0.06), ly + 0.03 + (ly === y0 ? 0.06 : -0.06), z - 0.35, '#475569');
        const len = along ? x1 - x0 : y1 - y0;
        for (let s = 0.12; s < len; s += 0.25) {
          if (along) B.cyl.cylY(x0 + s, y0 + 0.04, y1 - 0.04, z - 0.07, 0.04, '#64748b');
          else B.cyl.cylX(x0 + 0.04, x1 - 0.04, y0 + s, z - 0.07, 0.04, '#64748b');
        }
      }
    }
    // Plastic tote: four walls and a floor, open at the top.
    tote(B, x0, y0, x1, y1, z0, h, color) {
      const t = 0.035, zt = z0 + h;
      B.box(x0, y0, z0, x1, y1, z0 + 0.08, WS.shade(color, -0.3));
      B.box(x0, y0, z0, x1, y0 + t, zt, color); B.box(x0, y1 - t, z0, x1, y1, zt, color);
      B.box(x0, y0, z0, x0 + t, y1, zt, WS.shade(color, -0.12)); B.box(x1 - t, y0, z0, x1, y1, zt, WS.shade(color, -0.12));
    }
    // blue order tote, fill (0..1) = share of the order already in it
    orderTote(B, x, y, z, fill, s = 1) {
      const w = 0.22 * s, d = 0.28 * s;
      this.tote(B, x - w, y - d, x + w, y + d, z, 0.85 * s, '#2563eb');
      const n = Math.ceil(Math.min(1, fill) * 4);
      for (let k = 0; k < n; k++) {
        const xa = x - w + 0.05 + ((2 * w - 0.1) * (k & 1)) / 2, ya = y - d + 0.06 + ((2 * d - 0.12) * (k >> 1)) / 2;
        B.box(xa + 0.01, ya + 0.01, z + 0.08, xa + (2 * w - 0.1) / 2 - 0.01, ya + (2 * d - 0.12) / 2 - 0.01, z + 0.08 + 0.45 * s, `hsl(${(k * 97 + 30) % 360},55%,60%)`);
      }
    }
    parcel(B, x0, y0, x1, y1, z0, h, label) {
      const my = (y0 + y1) / 2, tw = Math.min(0.06, (y1 - y0) * 0.15);
      B.box(x0, y0, z0, x1, y1, z0 + h, '#b8875a');
      B.box(x0 - 0.005, my - tw, z0 + h * 0.6, x1 + 0.005, my + tw, z0 + h + 0.01, '#e6c79c');
      if (label) B.box(x0 + (x1 - x0) * 0.45, y1, z0 + h * 0.2, x1 - (x1 - x0) * 0.1, y1 + 0.01, z0 + h * 0.75, '#f8fafc');
    }
    // Operator in a hi-vis vest and hard hat, facing angle a (0 = towards -y).
    // When active the arms take turns reaching out to the pick and the put.
    operator(x, y, a, active, vest) {
      const B = this.dy.box, s = active ? Math.sin(this.t * 4.5) : 0;
      const skin = '#e0ac7e', shirt = '#2b3a55', trousers = '#1c2638';
      for (const u of [-0.09, 0.03]) { B.rbox(x, y, a, u, -0.05, 0, u + 0.07, 0.05, 1.7, trousers); B.rbox(x, y, a, u - 0.005, -0.09, 0, u + 0.075, 0.06, 0.18, '#0b0f17'); }
      B.rbox(x, y, a, -0.15, -0.08, 1.7, 0.15, 0.08, 2.75, shirt);
      B.rbox(x, y, a, -0.155, -0.085, 1.85, 0.155, 0.085, 2.7, vest);
      for (const z of [2.0, 2.2]) B.rbox(x, y, a, -0.157, -0.087, z, 0.157, 0.087, z + 0.06, '#e2e8f0');
      // arms: upper arm down the side, forearm reaching forward (left: pick, right: put)
      for (const [side, reach] of [[-1, Math.max(0, s)], [1, Math.max(0, -s)]]) {
        const u0 = side < 0 ? -0.22 : 0.15;
        B.rbox(x, y, a, u0, -0.04, 2.0 - reach * 0.2, u0 + 0.07, 0.04, 2.7, shirt);
        const len = 0.12 + reach * 0.32;
        B.rbox(x, y, a, u0, -0.04 - len, 1.95 + reach * 0.35, u0 + 0.07, -0.0, 2.08 + reach * 0.35, shirt);
        B.rbox(x, y, a, u0 + 0.005, -0.08 - len, 1.95 + reach * 0.35, u0 + 0.065, -0.03 - len, 2.08 + reach * 0.35, skin);
      }
      B.rbox(x, y, a, -0.035, -0.035, 2.75, 0.035, 0.035, 2.85, skin);
      B.rbox(x, y, a, -0.08, -0.09, 2.85, 0.08, 0.08, 3.25, skin);
      B.rbox(x, y, a, -0.085, 0.0, 3.0, 0.085, 0.085, 3.27, '#3b2a20');
      this.dy.cyl.cyl(x, y, 3.2, 3.42, 0.105, '#facc15');
      this.dy.cyl.cyl(x, y, 3.2, 3.24, 0.15, '#eab308');
    }
    // facing angle for an operator who looks at the storage over a station of this face
    faceAngle(p) { return p.face === 'front' ? 0 : Math.PI / 2; }

    // Conveyor workstation (the bin types): frame the bins ride through, screen,
    // stack light. Pod stations override portBody and portLive.
    portBody(S, p) {
      const g = this.sim.grid, CZ = this.CZ, front = p.face === 'front', pick = { kind: 'port', id: p.idx };
      const x0 = front ? p.drop.x + 0.1 : g.W, y0 = front ? g.D : p.drop.y + 0.1;
      const x1 = front ? p.drop.x + 1.9 : g.W + 1.75, y1 = front ? g.D + 1.75 : p.drop.y + 1.9;
      S.box.box(x0, y0, 0, x1, y1, CZ - 0.25, '#3b4658', pick);
      S.box.box(x0, y0, CZ - 0.25, x1, y1, CZ, '#252f3e', pick);
      const sx = front ? p.drop.x + 1.75 : g.W + 1.9, sy = front ? g.D + 1.95 : p.drop.y + 1.75;
      S.box.box(sx - 0.03, sy - 0.03, 0, sx + 0.03, sy + 0.03, 3.4, '#475569');
      S.box.box(sx - 0.28, sy - 0.06, 3.3, sx + 0.28, sy + 0.04, 4.6, '#0f172a', pick);
      const lx = front ? x0 + 0.12 : g.W + 0.12, ly = front ? g.D + 0.12 : y0 + 0.12;
      S.box.box(lx - 0.04, ly - 0.04, CZ, lx + 0.04, ly + 0.04, CZ + 2.2, '#64748b');
    }
    portLive(p) {
      const sim = this.sim, g = sim.grid, L = sim.layout, CZ = this.CZ, front = p.face === 'front', D = this.dy, pp = L.portPath(p);
      const sx = front ? p.drop.x + 1.75 : g.W + 1.9, sy = front ? g.D + 1.95 : p.drop.y + 1.75;
      D.lit.box(sx - 0.24, sy + 0.04, 3.4, sx + 0.24, sy + 0.05, 4.5, p.job ? '#0c4a6e' : '#111c2e');
      const bin = (x, y, id, w, d) => this.tote(D.box, x - w, y - d, x + w, y + d, CZ, 0.95, this.binColor(id));
      p.inQ.forEach((q, k) => { const f = k === 0 ? Math.min(1, q.t / sim.cfg.conveyorStep) : 0, a = pp.entry[0], b = pp.entry[1]; bin(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, q.bin.id, 0.3, 0.26); });
      if (p.pick) bin(pp.pick.x, pp.pick.y, p.pick.id, 0.42, 0.3);
      p.outQ.forEach((b, k) => { const e = pp.exit[k === 0 ? 1 : 0]; bin(e.x, e.y, b.id, 0.3, 0.26); });
      const x0 = front ? p.drop.x + 0.1 : g.W, y0 = front ? g.D : p.drop.y + 0.1;
      this.stackLight(front ? x0 + 0.12 : g.W + 0.12, front ? g.D + 0.12 : y0 + 0.12, CZ + 2.2, p);
    }
    binColor(id) {
      const inv = this.sim.inv, b = id ? inv.binById.get(id) : null;
      return this.opts.heat && b ? WS.CLASS_COLORS[inv.binClass(b)] : '#64748b';
    }
    // red / amber (waiting for storage units) / green (working)
    stackLight(x, y, z, p) {
      const starving = !p.job && !p.inQ.length && p.demand() > 0;
      [['#ef4444', false], ['#f59e0b', starving], ['#22c55e', !!p.job]].forEach(([c, on], k) => {
        const zz = z + k * 0.42;
        (on ? this.dy.litCyl : this.dy.cyl).cyl(x, y, zz, zz + 0.4, 0.09, on ? c : WS.shade(c, -0.65));
      });
    }

    // Static: conveyors, station bodies, put walls, pack benches, the dock.
    buildStations(S) {
      const sim = this.sim, L = sim.layout, oms = sim.oms, CZ = this.CZ;
      const lastPk = L.packerPos(oms.packers.length - 1);
      this.conveyor(S, [{ x: 1.2, y: L.takeawayY }, { x: lastPk.x, y: L.takeawayY }], 0.5, 1.6);
      for (const p of sim.ports) if (p.kind === 'PICK') this.conveyor(S, [{ x: L.spurX(p), y: L.slotPos(p, 0).y }, { x: L.spurX(p), y: L.takeawayY - 0.25 }], 0.45, 1.6);
      for (const pk of oms.packers) { const q = L.packerPos(pk.idx); this.conveyor(S, [{ x: q.x, y: L.takeawayY + 0.25 }, { x: q.x, y: q.y - 0.75 }], 0.45, 1.6); }
      for (const pk of oms.packers) this.conveyor(S, L.parcelRoute(pk.idx).slice(0, 2), 0.45, 1.4, '#2b3646');
      const r0 = L.parcelRoute(0);
      this.conveyor(S, [{ x: L.packerPos(0).x, y: r0[1].y }, r0[2], r0[3]], 0.45, 1.4, '#2b3646');
      for (const p of sim.ports) {
        const pick = { kind: 'port', id: p.idx };
        this.portBody(S, p);
        const op = L.operatorPos(p);
        S.box.box(op.x - 0.55, op.y - 0.45, 0, op.x + 0.55, op.y + 0.45, 0.04, '#10161f');
        if (p.kind === 'PICK') {
          const s0 = L.slotPos(p, 0), wx0 = s0.x - 0.3, wx1 = L.slotPos(p, p.slots.length - 1).x + 0.34, wy0 = s0.y - 0.35, wy1 = s0.y + 0.35;
          S.box.box(wx0, wy0, 0, wx1, wy1, CZ - 0.1, '#334155', pick);
          for (const xx of [wx0, wx1 - 0.08]) S.box.box(xx, wy0, CZ, xx + 0.08, wy0 + 0.08, 4.6, '#64748b');
          S.box.box(wx0, wy0, 4.5, wx1, wy0 + 0.1, 4.7, '#64748b');
        } else {
          // supplier pallets awaiting decant
          const g = sim.grid, px = g.W + 3.4, py = p.drop.y - 0.6;
          for (let k = 0; k < 2; k++) {
            const yy = py + k * 1.6;
            for (const bx of [0, 0.5, 1.0]) S.box.box(px + bx, yy, 0, px + bx + 0.2, yy + 1.2, 0.25, '#8a5a1c');
            for (let s2 = 0; s2 < 5; s2++) S.box.box(px, yy + s2 * 0.25, 0.25, px + 1.2, yy + s2 * 0.25 + 0.2, 0.4, '#b07a2e');
          }
        }
      }
      for (const pk of oms.packers) {
        const q = L.packerPos(pk.idx), pick = { kind: 'packer', id: pk.idx };
        for (const [lx, ly] of [[-0.95, -0.5], [0.87, -0.5], [-0.95, 0.42], [0.87, 0.42]]) S.box.box(q.x + lx, q.y + ly, 0, q.x + lx + 0.08, q.y + ly + 0.08, 1.9, '#64748b');
        S.box.box(q.x - 0.95, q.y - 0.5, 0.45, q.x + 0.95, q.y + 0.5, 0.55, '#475569');
        for (let k = 0; k < 4; k++) S.box.box(q.x - 0.85, q.y - 0.4, 0.55 + k * 0.12, q.x + 0.1, q.y + 0.4, 0.65 + k * 0.12, k % 2 ? '#cfa271' : '#b8875a');
        S.box.box(q.x - 1.0, q.y - 0.55, 1.9, q.x + 1.0, q.y + 0.55, 2.1, '#e7dccb', pick);
        S.box.box(q.x - 0.85, q.y - 0.5, 2.1, q.x - 0.79, q.y - 0.44, 3.6, '#475569');
        S.box.box(q.x - 0.98, q.y - 0.52, 3.3, q.x - 0.5, q.y - 0.44, 4.3, '#0f172a', pick);
        S.box.box(q.x + 0.5, q.y - 0.45, 2.1, q.x + 0.92, q.y - 0.08, 2.75, '#e2e8f0');
        S.box.box(q.x + 0.55, q.y + 0.15, 2.1, q.x + 0.85, q.y + 0.35, 2.4, '#dc2626');
        S.box.box(q.x - 0.55, q.y + 0.55, 0, q.x + 0.55, q.y + 1.45, 0.04, '#10161f');
      }
      const d = L.dock();
      S.box.box(d.x - 0.9, d.y - 1.3, 0, d.x + 0.1, d.y + 1.3, 1.2, '#374151', { kind: 'dock' });
    }
    drawStationsLive() {
      const sim = this.sim, L = sim.layout, oms = sim.oms, D = this.dy, CZ = this.CZ;
      for (const p of sim.ports) {
        this.portLive(p);
        const op = L.operatorPos(p);
        this.operator(op.x, op.y, this.faceAngle(p), !!(p.job && p.job.next < p.job.lines.length && p.mode === 'auto'), p.kind === 'PICK' ? '#f97316' : '#22c55e');
        if (p.kind !== 'PICK') {
          // cartons on the supplier pallets
          const g = sim.grid, px = g.W + 3.4, py = p.drop.y - 0.6, open = oms.receipts.filter((r) => r.status !== 'RECEIVED').reduce((s, r) => s + r.lines.length, 0);
          for (let k = 0; k < 2; k++) {
            const n = Math.max(0, Math.min(8, open - k * 8));
            for (let j = 0; j < n; j++) {
              const cx = px + 0.05 + (j % 2) * 0.56, cy = py + k * 1.6 + 0.05 + ((j >> 1) % 2) * 0.56, cz = 0.4 + Math.floor(j / 4) * 1.1;
              this.parcel(D.box, cx, cy, cx + 0.53, cy + 0.53, cz, 1.05);
            }
          }
          continue;
        }
        const ln = p.currentLine, wy0 = L.slotPos(p, 0).y - 0.35;
        p.slots.forEach((o, k) => {
          const q = L.slotPos(p, k);
          if (o) { const units = oms.units(o), picked = o.lines.reduce((s, l) => s + l.picked, 0); this.orderTote(D.box, q.x, q.y, CZ, picked / units); }
          const target = ln && ln.order === o, on = target && Math.sin(this.t * 9) > -0.3;
          (target ? D.lit : D.box).box(q.x - 0.1, wy0 - 0.02, 4.15, q.x + 0.1, wy0 + 0.12, 4.4, on ? '#4ade80' : o ? '#e2e8f0' : '#334155');
        });
      }
      for (const pk of oms.packers) {
        const q = L.packerPos(pk.idx);
        for (let k = Math.min(pk.queue.length, 3) - 1; k >= 0; k--) this.orderTote(D.box, q.x, q.y - 1.05, 1.6 + k * 0.85, 0.8, 0.9);
        D.lit.box(q.x - 0.95, q.y - 0.44, 3.38, q.x - 0.53, q.y - 0.43, 4.22, pk.cur ? '#0c4a6e' : '#111c2e');
        if (pk.cur) {
          const f = pk.t / pk.dur;
          if (f < 0.6) { this.orderTote(D.box, q.x - 0.45, q.y, 2.1, 1 - f / 0.6); this.tote(D.box, q.x - 0.05, q.y - 0.25, q.x + 0.45, q.y + 0.25, 2.1, 0.25 + Math.min(1, f * 1.6) * 0.55, '#b8875a'); } else this.parcel(D.box, q.x - 0.05, q.y - 0.25, q.x + 0.45, q.y + 0.25, 2.1, 0.8, f > 0.8);
        }
        this.operator(q.x, q.y + 1.0, 0, !!pk.cur, '#38bdf8');
      }
      // truck at the dock, pulling away when it leaves
      const d = L.dock(), tr = oms.truck, off = tr.departing > 0 ? Math.pow(tr.departing, 2) * 0.25 : 0;
      const tx = d.x + 0.25 + off, carrier = { PCL: '#0ea5e9', EXP: '#ef4444', ECO: '#22c55e' }[tr.carrier.code], dock = { kind: 'dock' };
      D.box.box(tx, d.y - 1.0, 0.8, tx + 4.5, d.y + 1.0, 7.2, '#e5e7eb', dock);
      D.box.box(tx + 0.3, d.y + 1.0, 5.6, tx + 4.2, d.y + 1.01, 6.4, carrier);
      D.box.box(tx + 0.3, d.y + 1.0, 1.2, tx + 0.3 + 3.9 * Math.min(1, tr.parcels.length / sim.cfg.truckCapacity), d.y + 1.01, 1.7, '#b08850');
      D.box.box(tx + 4.6, d.y - 0.95, 0.6, tx + 5.8, d.y + 0.95, 5.2, carrier, dock);
      D.lit.box(tx + 5.0, d.y + 0.95, 3.4, tx + 5.65, d.y + 0.96, 4.8, '#1e3a5f');
      D.lit.box(tx + 5.8, d.y - 0.8, 3.3, tx + 5.81, d.y + 0.8, 4.9, '#1e3a5f');
      for (const yy of [d.y - 0.7, d.y + 0.7]) D.litCyl.cylX(tx + 5.8, tx + 5.83, yy, 1.25, 0.12, '#fde68a');
      for (const wx of [tx + 0.7, tx + 1.5, tx + 5.2]) D.cyl.cylY(wx, d.y - 1.02, d.y + 1.02, 0.75, 0.32, '#0b0f17');
      // totes and parcels on the conveyors
      for (const it of oms.conveyor) {
        const q = oms.posOnPath(it);
        if (it.kind === 'tote') this.orderTote(D.box, q.x, q.y, 1.6, 1, 0.85); else this.parcel(D.box, q.x - 0.18, q.y - 0.16, q.x + 0.18, q.y + 0.16, 1.4, 0.6, true);
      }
    }

    // ---------------------------------------------------------------- overlays
    drawSelection(alpha) {
      const s = this.selected;
      if (!s) return;
      const o = this.selectionBox(s, alpha);
      if (!o) return;
      const [x0, y0, x1, y1] = o, t = 0.05, z = 0.02, B = this.dy.lit, c = '#38bdf8';
      B.box(x0, y0, z, x1, y0 + t, z + 0.08, c); B.box(x0, y1 - t, z, x1, y1, z + 0.08, c);
      B.box(x0, y0, z, x0 + t, y1, z + 0.08, c); B.box(x1 - t, y0, z, x1, y1, z + 0.08, c);
    }
    // floor rectangle to outline for a selection; types add their own kinds
    selectionBox(s, alpha) {
      const sim = this.sim, L = sim.layout;
      if (s.kind === 'robot') { const p = this.followPos(s.id, alpha); return p && [p.x - 0.56, p.y - 0.56, p.x + 0.56, p.y + 0.56]; }
      if (s.kind === 'packer') { const q = L.packerPos(s.id); return [q.x - 1.1, q.y - 0.65, q.x + 1.1, q.y + 0.65]; }
      return null;
    }
    // planned routes of moving robots, and the cells they reserved ahead
    drawPaths(alpha) {
      const sim = this.sim, pos = [], cols = [], c = new THREE.Color();
      if (this.opts.paths && sim.fleet.length && sim.fleet[0].path !== undefined) {
        for (const r of sim.fleet) {
          if (!r.path || !r.op || r.op.op !== 'move') continue;
          c.set(WS.stateColor(sim, r.displayState));
          let px = r.prx + (r.rx - r.prx) * alpha + 0.5, py = r.pry + (r.ry - r.pry) * alpha + 0.5;
          for (let k = r.pi + 1; k < r.path.length; k++) {
            const qx = r.path[k].x + 0.5, qy = r.path[k].y + 0.5;
            pos.push(px, 0.03, py, qx, 0.03, qy); cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
            px = qx; py = qy;
          }
        }
      }
      const geo = this.paths.geometry;
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      if (this.opts.claims && sim.grid.claim) {
        const g = sim.grid;
        for (const r of sim.fleet) {
          if (!r.claims) continue;
          const color = WS.stateColor(sim, r.displayState);
          for (const i of r.claims) {
            const x = g.cx(i), y = g.cy(i);
            if (x !== r.x || y !== r.y) this.dy.clear.box(x + 0.12, y + 0.12, 0.01, x + 0.88, y + 0.88, 0.04, color);
          }
        }
        this.dy.clear.end();
      }
    }
    // Text tags drawn over the WebGL canvas at projected world points.
    label(s, x, y, z, o = {}) {
      const p = V.set(x, z * LZ, y).project(this.camera);
      if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) return;
      const c = this.lctx, px = ((p.x + 1) / 2) * this.w, py = ((1 - p.y) / 2) * this.h;
      c.font = `${o.weight || 600} ${o.size || 11}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      if (o.bg) { const w = c.measureText(s).width + 10, h = (o.size || 11) + 6; c.fillStyle = o.bg; WS.roundRect(c, px - w / 2, py - h / 2, w, h, 4); c.fill(); }
      c.fillStyle = o.color || '#e2e8f0'; c.fillText(s, px, py);
    }
    drawLabelLayer() {
      const c = this.lctx;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, this.w, this.h);
      if (this.opts.labels) this.drawLabels();
    }
    drawLabels() {
      const sim = this.sim, g = sim.grid, L = sim.layout, bg = 'rgba(15,23,42,0.82)';
      for (const p of sim.ports) {
        const pos = p.face === 'front' ? { x: p.drop.x + 1, y: g.D + 0.2 } : { x: g.W + 0.2, y: p.drop.y + 1 };
        const st = p.job ? (p.mode === 'manual' ? 'MANUAL' : 'ACTIVE') : p.inQ.length ? 'INBOUND' : 'WAITING';
        this.label(`${p.code} ${p.kind === 'PICK' ? 'PICK' : 'GOODS-IN'} · ${st}`, pos.x, pos.y, 7.2, { size: 10, bg, color: p.kind === 'PICK' ? '#fdba74' : '#86efac' });
      }
      for (const pk of sim.oms.packers) { const q = L.packerPos(pk.idx); this.label(`${pk.name} · ${pk.queue.length} queued`, q.x, q.y, 5, { size: 10, bg, color: '#7dd3fc' }); }
      const d = L.dock(), tr = sim.oms.truck;
      this.label(`${tr.carrier.name} · ${tr.parcels.length}/${sim.cfg.truckCapacity}`, d.x + 2.5, d.y, 8.2, { size: 10, bg, color: '#e2e8f0' });
    }
  }

  View3D.LZ = LZ;
  WS.View3D = View3D;
})((globalThis.WS = globalThis.WS || {}));
