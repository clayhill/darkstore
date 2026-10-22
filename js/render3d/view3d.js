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
      Object.assign(this, { view, geo, mat, shadow: o.shadow !== false, cast: o.cast !== false, n: 0, cap: 0, picks: [], mesh: null });
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
      m.frustumCulled = false; m.receiveShadow = this.shadow; m.castShadow = this.shadow && this.cast; m.userData.batch = this;
      this.view.scene.add(m); this.mesh = m; this.cap = cap;
    }
    begin() { this.n = 0; this.picks.length = 0; }
    end() {
      const m = this.mesh;
      m.count = this.n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.boundingSphere = null;
    }
    // A building of several floors (FloorStack) draws each floor's parts with
    // the view's zLift (levels) added, and leaves out a hidden floor's (skip).
    put(color, pick) {
      const v = this.view;
      if (v.skip) return;
      if (v.zLift) M.elements[13] += v.zLift * LZ;
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
    // cylinder of radius r (cells): upright from level z0 to z1, or lying along x
    // (cylX) or y (cylY) with its axis at level z
    cyl(cx, cy, z0, z1, r, color, pick, a = 0) {
      M.makeRotationY(a); M.scale(V.set(2 * r, (z1 - z0) * LZ, 2 * r));
      M.setPosition(cx, ((z0 + z1) / 2) * LZ, cy);
      this.put(color, pick);
    }
    cylX(x0, x1, y, z, r, color, pick) {
      M.makeRotationZ(Math.PI / 2); M.scale(V.set(2 * r, x1 - x0, 2 * r));
      M.setPosition((x0 + x1) / 2, z * LZ, y);
      this.put(color, pick);
    }
    cylY(x, y0, y1, z, r, color, pick) {
      M.makeRotationX(Math.PI / 2); M.scale(V.set(2 * r, y1 - y0, 2 * r));
      M.setPosition(x, z * LZ, (y0 + y1) / 2);
      this.put(color, pick);
    }
    // sloping slab from x0 to x1, running from (y0, z0) to (y1, z1) in the
    // y-z plane, t (cells) thick: a face that leans, such as an A-frame's
    slab(x0, x1, y0, z0, y1, z1, t, color, pick) {
      const dy = y1 - y0, dz = (z1 - z0) * LZ, len = Math.hypot(dy, dz) || 1e-4;
      M.makeRotationX(Math.atan2(-dz, dy)); M.scale(V.set(Math.abs(x1 - x0) || 1e-4, t, len));
      M.setPosition((x0 + x1) / 2, ((z0 + z1) / 2) * LZ, (y0 + y1) / 2);
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
      r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.25;
      r.setClearColor(BG);
      const scene = (this.scene = new THREE.Scene());
      scene.fog = new THREE.Fog(BG, 70, 190);
      this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
      scene.add((this.hemi = new THREE.HemisphereLight('#c7d7ff', '#1a2332', 1.6)));
      const sun = (this.sun = new THREE.DirectionalLight('#ffffff', 2.2));
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
      scene.add(sun, sun.target);
      // unit shapes: box, smooth cylinder, octagonal prism (flat sides facing the axes)
      const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 18), oct = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
      oct.rotateY(Math.PI / 8);
      // moulded shell: a unit box with rounded upright edges and bevelled top and bottom
      const rr = new THREE.Shape(), q = 0.44, c = 0.1, bv = 0.06;
      rr.moveTo(-q + c, -q); rr.lineTo(q - c, -q); rr.quadraticCurveTo(q, -q, q, -q + c); rr.lineTo(q, q - c); rr.quadraticCurveTo(q, q, q - c, q);
      rr.lineTo(-q + c, q); rr.quadraticCurveTo(-q, q, -q, q - c); rr.lineTo(-q, -q + c); rr.quadraticCurveTo(-q, -q, -q + c, -q);
      const rnd = new THREE.ExtrudeGeometry(rr, { depth: 1 - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 2, curveSegments: 4 });
      rnd.translate(0, 0, -(0.5 - bv)); rnd.rotateX(-Math.PI / 2);
      const std = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.08 });
      const lit = new THREE.MeshBasicMaterial({ toneMapped: false }); // lamps, screens, state lights
      const clear = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.32, depthWrite: false });
      const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.35, depthWrite: false, roughness: 0.15, metalness: 0.1 }); // lit like the rest
      // dome (a hard hat's shell): a half sphere filling the unit box from its base up
      const dome = new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.scale(1, 2, 1); dome.translate(0, -0.5, 0);
      this.geos = { box, cyl, oct, rnd, dome }; this.mats = { std, lit, clear, glass };
      const mk = () => ({
        box: this.newBatch('box'), cyl: this.newBatch('cyl'), oct: this.newBatch('oct'), rnd: this.newBatch('rnd'), dome: this.newBatch('dome'),
        lit: this.newBatch('box', 'lit'), litCyl: this.newBatch('cyl', 'lit'), litOct: this.newBatch('oct', 'lit'), litRnd: this.newBatch('rnd', 'lit'), clear: this.newBatch('box', 'clear'), glass: this.newBatch('box', 'glass'),
      });
      this.st = mk(); this.dy = mk();
      this.paths = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }));
      this.paths.frustumCulled = false; scene.add(this.paths);
      this.cam = { tx: 0, ty: 0, tz: 0, yaw: Math.PI / 4, pitch: 0.62, dist: 40, walk: false, ex: 0, ey: 0, follow: null };
      this.keys = new Set(); this.ray = new THREE.Raycaster(); this.last = 0;
      this.staticKey = null;
      this.spots = [];
      try { this.dark = localStorage.getItem('ds-lights-out') === '1'; } catch (e) { this.dark = false; }
      this.bindInput();
    }
    // a batch of one shape ('box', 'cyl', 'oct', 'rnd' rounded) in one material ('std', 'lit' unlit, 'clear' see-through)
    newBatch(shape, mat = 'std', cap) { return new Batch(this, this.geos[shape], this.mats[mat], { shadow: mat === 'std', cap }); }
    get sim() { return this.app.sim; }
    get opts() { return this.app.iso.opts; }
    get selected() { return this.app.iso.selected; }
    reset() { this.staticKey = null; this.cam.follow = null; }

    resize() {
      const r = this.canvas.getBoundingClientRect(), dpr = Math.min(1.5, window.devicePixelRatio || 1);
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
      Object.assign(c, { walk: false, follow: null, tz: 0, tx: (b.x0 + b.x1) * 0.42, ty: g.D * 0.62, yaw: Math.PI / 5, pitch: 0.72 });
      c.dist = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 1.05 / Math.min(1, this.w / this.h);
      this.syncWalkButton();
    }

    // ---------------------------------------------------------------- camera and input
    bindInput() {
      const c = this.canvas;
      let drag = null, hoverAt = 0;
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('pointerdown', (e) => {
        this.leavePreset();
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
        this.leavePreset();
        const cam = this.cam, f = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        if (cam.walk) { const s = (1 - f) * 12, h = this.heading(); cam.ex += h.x * s; cam.ey += h.y * s; return; }
        // zoom towards the floor point under the cursor
        const p = this.mouse(e), g = this.floorAt(p.x, p.y), d = WS.U.clamp(cam.dist * f, 3, 220);
        if (g && !cam.follow) { const k = 1 - d / cam.dist; cam.tx += (g.x - cam.tx) * k; cam.ty += (g.y - cam.ty) * k; }
        cam.dist = d;
      }, { passive: false });
      const typing = (e) => e.target.matches && e.target.matches('input, select, textarea');
      window.addEventListener('keydown', (e) => {
        if (this.app.view !== '3d' || typing(e)) return;
        if (e.code === 'KeyN' && this.cam.mode && this.cam.mode !== 'free') return this.nextSubject();
        if (/^(Key[WASDQE]|Arrow|Escape)/.test(e.code)) this.leavePreset();
        this.keys.add(e.code); if (e.code === 'Escape') this.cam.follow = null;
      });
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
      window.addEventListener('blur', () => this.keys.clear());
      const mode = document.getElementById('cam-mode');
      if (mode) mode.addEventListener('change', () => this.setCamMode(mode.value));
      const walk = document.getElementById('btn-walk');
      if (walk) walk.addEventListener('click', () => this.setWalk(!this.cam.walk));
      const dark = document.getElementById('btn-dark');
      if (dark) { dark.addEventListener('click', () => this.setDark(!this.dark)); dark.classList.toggle('on', this.dark); }
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
      if (on) this.leavePreset();
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
      if (this.cam.mode && this.cam.mode !== 'free' && this.presetCamera(dt, alpha)) return;
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
        const k = Math.min(1, dt * 6);
        if (r) { cam.tx += (r.x - cam.tx) * k; cam.ty += (r.y - cam.ty) * k; cam.tz += ((r.z ?? this.robotZ) - cam.tz) * k; } else cam.follow = null;
      }
      // the camera orbits a point at level tz (the robots' level while following one)
      const cp = Math.cos(cam.pitch), tz = cam.tz * LZ;
      this.camera.position.set(cam.tx + cam.dist * cp * Math.sin(cam.yaw), tz + cam.dist * Math.sin(cam.pitch), cam.ty + cam.dist * cp * Math.cos(cam.yaw));
      this.camera.lookAt(cam.tx, tz, cam.ty);
    }
    // ---------------------------------------------------------------- camera presets
    // 'free' (yours), 'robot' (mounted on a robot's front, looking where it
    // drives), 'chase' (just behind and above it), 'station' (the work places
    // in turn), 'orbit' (slowly round the warehouse) and 'tour' (all of them in
    // turn, as a screensaver). N picks the next robot or station; any drag,
    // scroll or key gives the camera back.
    setCamMode(mode) {
      const cam = this.cam;
      if (cam.walk) { cam.walk = false; this.syncWalkButton(); }
      cam.mode = mode; cam.follow = null;
      if (mode !== 'order') { this.follow = null; if (this.hud) this.hud(false); }
      if (mode === 'tour') { this.tourK = -1; this.nextShot(); } else if (mode !== 'free') this.startShot(mode);
      this.syncCamMode();
    }
    syncCamMode() { const s = document.getElementById('cam-mode'); if (s) s.value = this.cam.mode || 'free'; }
    leavePreset() {
      const cam = this.cam;
      if (!cam.mode || cam.mode === 'free') return;
      // hand over where the preset was: following the robot it rode, or looking where it looked
      if ((this.shot === 'robot' || this.shot === 'chase') && this.ride) Object.assign(cam, { follow: this.ride.id, dist: 7, pitch: 0.5 });
      cam.mode = 'free'; this.fade(1); this.syncCamMode();
      this.follow = null; if (this.hud) this.hud(false);
    }
    nextSubject() {
      if (this.shot === 'station') this.startShot('station');
      else if (this.shot === 'order') { const F = this.follow, t = this.pickFollow(F && (F.order || F.parcel)); if (t) this.follow = t; }
      else if (this.ride) this.ride = { id: this.pickRider(this.ride.id) };
    }
    startShot(shot) {
      const cam = this.cam;
      this.shot = shot; this.shotT = 0;
      if (shot === 'robot' || shot === 'chase') {
        const sel = this.selected, keep = this.ride && this.cam.mode === 'tour' ? null : this.ride && this.ride.id;
        this.ride = { id: sel && sel.kind === 'robot' && this.sim.fleet[sel.id] ? sel.id : keep ?? this.pickRider() };
      } else if (shot === 'station') {
        const ls = this.workLights();
        this.stationK = ((this.stationK ?? -1) + 1) % ls.length;
        const p = ls[this.stationK];
        Object.assign(cam, { tx: p.x, ty: p.y - 0.6, tz: 2.0, dist: 5.5, pitch: 0.38, yaw: 0.55 });
      } else if (shot === 'order') {
        // an order of its own in the tour; one asked for (Follow in 3D) is kept
        if (!this.follow || cam.mode === 'tour') this.follow = this.pickFollow();
      } else if (shot === 'orbit') {
        const keepYaw = cam.yaw;
        this.fit(); cam.yaw = keepYaw; cam.dist *= 0.85; cam.pitch = 0.55;
      }
    }
    // the tour: robot cam, orbit, chase, a station, … with a short fade between shots
    nextShot() {
      const order = ['robot', 'orbit', 'order', 'chase', 'station'];
      this.tourK = (this.tourK + 1) % order.length;
      this.fade(0);
      setTimeout(() => { if (this.cam.mode !== 'tour') return; this.startShot(order[this.tourK]); this.fade(1); }, 380);
    }
    fade(v) { for (const el of [this.canvas, this.labels]) { el.style.transition = 'opacity .38s'; el.style.opacity = v; } }
    // a robot worth riding: the one asked for, else a busy one, else any
    pickRider(not) {
      const fleet = this.sim.fleet, busy = [];
      fleet.forEach((r, k) => { if (k !== not && this.followPos(k, 1) && /MOVING|TRANSPORT|STORING|DIGGING|HANDLING/.test(r.displayState || '')) busy.push(k); });
      if (busy.length) return busy[Math.floor(Math.random() * busy.length)];
      const any = fleet.map((r, k) => k).filter((k) => k !== not && this.followPos(k, 1));
      return any.length ? any[Math.floor(Math.random() * any.length)] : 0;
    }
    // where a robot cam sits: this far in front of the robot's centre (cells) and this high above its level (levels)
    rideFront() { return 0.48; }
    rideHeight() { return this.lv(0.45); }
    // returns true when it placed the camera; false lets the orbit camera run with the preset's settings
    presetCamera(dt, alpha) {
      const cam = this.cam, shot = this.shot;
      this.shotT = (this.shotT || 0) + dt;
      if (cam.mode === 'tour' && this.shotT > { robot: 24, chase: 20, orbit: 18, station: 12, order: 40 }[shot] && !this.fading) { this.fading = true; this.nextShot(); setTimeout(() => (this.fading = false), 400); }
      if (shot === 'order') return this.followCamera(dt);
      if (shot === 'orbit') { cam.yaw += dt * 0.06; return false; }
      if (shot === 'station') { cam.yaw += dt * 0.025; return false; }
      const R = this.ride, p = R && this.followPos(R.id, alpha);
      if (!p) { this.ride = { id: this.pickRider() }; return false; }
      // heading from how it moves, turned smoothly; a robot standing still keeps its heading
      if (R.last) {
        const dx = p.x - R.last.x, dy = p.y - R.last.y;
        if (Math.hypot(dx, dy) > 1e-4) {
          const want = Math.atan2(dy, dx);
          if (R.h == null) R.h = want;
          else { let d = want - R.h; d = Math.atan2(Math.sin(d), Math.cos(d)); R.h += d * Math.min(1, dt * 5); }
          R.still = 0;
        } else R.still = (R.still || 0) + dt;
      }
      R.last = { x: p.x, y: p.y };
      if (R.h == null) R.h = -Math.PI / 2;
      // in the tour, a robot that stands still for long hands over to another
      if (cam.mode === 'tour' && R.still > 10) this.ride = Object.assign({ id: this.pickRider(R.id) }, { h: null });
      const hx = Math.cos(R.h), hy = Math.sin(R.h), z = (p.z ?? this.robotZ) * LZ, C = this.camera;
      if (shot === 'robot') {
        const f = this.rideFront(), e = z + this.rideHeight() * LZ;
        C.position.set(p.x + hx * f, e, p.y + hy * f);
        C.lookAt(p.x + hx * (f + 5), e - 0.25, p.y + hy * (f + 5));
      } else {
        const to = V.set(p.x - hx * 2.6, z + 1.7, p.y - hy * 2.6);
        if (!R.cam) R.cam = to.clone(); else R.cam.lerp(to, Math.min(1, dt * 3));
        C.position.copy(R.cam);
        C.lookAt(p.x + hx * 1.2, z + 0.4, p.y + hy * 1.2);
      }
      return true;
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
      for (const set of [this.dy, this.st]) for (const k of ['box', 'cyl', 'oct', 'rnd', 'dome']) if (set[k].mesh.count) meshes.push(set[k].mesh);
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
      const sim = this.sim, L = sim.layout, g = sim.grid;
      // conveyor workstation footprint next to the storage
      for (const p of sim.ports) {
        if (p.face === 'front' && f.x >= p.drop.x && f.x <= p.drop.x + 4.6 && f.y >= g.D && f.y <= g.D + 2.8) return { kind: 'port', id: p.idx };
        if (p.face === 'right' && f.x >= g.W && f.x <= g.W + 2.8 && f.y >= p.drop.y - 0.2 && f.y <= p.drop.y + 2.2) return { kind: 'port', id: p.idx };
      }
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
        this.buildHall();
        this.placeSun();
      }
      this.updateCamera(dt, alpha);
      this.cutaway();
      for (const b of Object.values(this.dy)) b.begin();
      this.frameNo = (this.frameNo || 0) + 1;
      this.drawLive(alpha);
      this.drawStationsLive();
      this.drawSelection(alpha);
      for (const b of Object.values(this.dy)) b.end();
      if (this.screens) for (const sc of this.screens.values()) sc.mesh.visible = sc.used === this.frameNo;
      this.drawPaths(alpha);
      this.renderer.render(this.scene, this.camera);
      this.drawLabelLayer();
    }
    // static parts are rebuilt when this changes
    buildKey() { return [this.sim.cfg.seed, this.sim.ports.length, this.opts.heat].join('|') + (this.dark ? '|dark' : ''); }
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

    // ---------------------------------------------------------------- the hall
    // Lights-out: the hall lights go off and the robots work in the dark; only
    // the work places (stations, packing, the dock) keep a light over them.
    setDark(on) {
      this.dark = on; this.staticKey = null;
      try { localStorage.setItem('ds-lights-out', on ? '1' : '0'); } catch (e) { /* private window */ }
      const b = document.getElementById('btn-dark');
      if (b) b.classList.toggle('on', on);
    }
    // metres to render levels
    lv(m) { return m / (LZ * (this.sim.cfg.cellSize || 1)); }
    // the floor the hall stands on and its doors ({ side: 'N' | 'S' | 'W' | 'E', a, b along the wall, h high })
    hall() {
      const b = this.bounds(), L = this.sim.layout, d = L && L.dock ? L.dock() : null;
      return { x0: b.x0 - 0.5, y0: b.y0 - 0.5, x1: d ? d.x + 0.1 : b.x1 + 0.5, y1: b.y1 + 0.5, doors: d ? [{ side: 'E', a: d.y - 1.45, b: d.y + 1.45, h: 7.6 }] : [] };
    }
    // where people work: these keep a light in lights-out
    workLights() {
      const sim = this.sim, L = sim.layout, out = sim.ports.map((p) => L.operatorPos(p));
      for (const pk of sim.oms.packers) out.push(L.packerOperator(pk));
      const d = L.dock(); out.push({ x: d.x - 1, y: d.y });
      return out;
    }
    // highest point of the static parts, in levels
    staticTop() {
      let top = 0;
      for (const b of Object.values(this.st)) {
        const a = b.mesh.instanceMatrix.array;
        for (let i = 0; i < b.n; i++) { const o = i * 16; top = Math.max(top, a[o + 13] + (Math.abs(a[o + 1]) + Math.abs(a[o + 5]) + Math.abs(a[o + 9])) / 2); }
      }
      return top / LZ;
    }
    // Walls round the hall with a concrete plinth, cladding, a band of
    // windows and steel columns; roof trusses with high-bay lamps. A wall on the
    // camera's side drops to a low kerb so the view stays open.
    buildHall() {
      const H = (this.hallRect = this.hall()), cs = this.sim.cfg.cellSize || 1, T = 0.3 / cs;
      const top = (this.hallTop = Math.max(this.staticTop() + this.lv(2.5), this.lv(7.5)));
      const plinth = this.lv(1.2), kerb = this.lv(0.9), w0 = top - this.lv(2.4), w1 = top - this.lv(1.0), colStep = Math.max(4, Math.round(6 / cs));
      if (!this.walls) {
        this.walls = {};
        for (const k of ['N', 'S', 'W', 'E']) this.walls[k] = { full: new Batch(this, this.geos.box, this.mats.std, { cast: false }), glass: new Batch(this, this.geos.box, this.mats.glass, { shadow: false }), low: new Batch(this, this.geos.box, this.mats.std, { cast: false }) };
        this.roof = { box: new Batch(this, this.geos.box, this.mats.std, { cast: false }), cyl: new Batch(this, this.geos.cyl, this.mats.std, { cast: false }), lit: new Batch(this, this.geos.cyl, this.mats.lit, { shadow: false }) };
        const T3 = THREE;
        this.hallFloor = new T3.Mesh(new T3.PlaneGeometry(1, 1), new T3.MeshStandardMaterial({ color: '#2a3446', roughness: 0.7, metalness: 0.05 }));
        this.hallFloor.rotation.x = -Math.PI / 2; this.hallFloor.receiveShadow = true; this.scene.add(this.hallFloor);
      }
      this.hallFloor.scale.set(H.x1 - H.x0, H.y1 - H.y0, 1); this.hallFloor.position.set((H.x0 + H.x1) / 2, -0.001, (H.y0 + H.y1) / 2);
      if (this.ground) this.ground.material.color.set(this.dark ? '#0b0f17' : '#161d29');
      const put = (B, side, s0, s1, t0, t1, z0, z1, c) => { // s along the wall, t outwards from its line
        if (side === 'N') B.box(s0, H.y0 - t1, z0, s1, H.y0 - t0, z1, c);
        else if (side === 'S') B.box(s0, H.y1 + t0, z0, s1, H.y1 + t1, z1, c);
        else if (side === 'W') B.box(H.x0 - t1, s0, z0, H.x0 - t0, s1, z1, c);
        else B.box(H.x1 + t0, s0, z0, H.x1 + t1, s1, z1, c);
      };
      const glassCol = this.dark ? '#0b1730' : '#9cc9f0';
      for (const side of ['N', 'S', 'W', 'E']) {
        const W = this.walls[side], along = side === 'N' || side === 'S', a = (along ? H.x0 : H.y0) - T, b = (along ? H.x1 : H.y1) + T;
        W.full.begin(); W.glass.begin(); W.low.begin();
        const doors = H.doors.filter((d) => d.side === side).sort((p, q) => p.a - q.a), spans = [];
        let s = a;
        for (const d of doors) { spans.push([s, d.a]); s = d.b; }
        spans.push([s, b]);
        for (const [s0, s1] of spans) {
          if (s1 - s0 < 1e-3) continue;
          put(W.full, side, s0, s1, 0, T, 0, plinth, '#4b5563');
          put(W.full, side, s0, s1, 0.04, T, plinth, w0, '#344256');
          put(W.glass, side, s0, s1, 0.1, 0.16, w0, w1, glassCol);
          put(W.full, side, s0, s1, 0.04, T, w1, top, '#344256');
          put(W.full, side, s0, s1, -0.05, T + 0.05, top, top + this.lv(0.35), '#5b6b80');
          for (let r = s0 + 0.5 / cs; r < s1 - 0.1; r += 1 / cs) put(W.full, side, r - 0.03, r + 0.03, 0, 0.04, plinth, w0, '#3d4b60');
          for (let r = s0 + 1 / cs; r < s1 - 0.5; r += 2 / cs) put(W.full, side, r - 0.04, r + 0.04, 0.1, 0.16, w0, w1, '#5b6b80');
          put(W.low, side, s0, s1, 0, T, 0, kerb, '#4b5563');
          put(W.low, side, s0, s1, -0.03, T + 0.03, kerb, kerb + this.lv(0.12), '#facc15');
        }
        for (const d of doors) {
          put(W.full, side, d.a, d.b, 0.04, T, d.h, top, '#344256');
          put(W.full, side, d.a - 0.1, d.b + 0.1, -0.06, T, d.h - 0.4, d.h, '#1f2937');
          for (const e of [d.a, d.b]) for (const B of [W.full, W.low]) {
            const hh = B === W.low ? kerb : d.h;
            for (let z = 0; z < hh; z += 0.6) put(B, side, e - 0.1, e + 0.1, -0.06, T + 0.02, z, Math.min(hh, z + 0.6), (z / 0.6) % 2 < 1 ? '#facc15' : '#111827');
          }
        }
        // steel columns on the inside face, the bottom in a yellow guard
        const span = b - a, n = Math.max(1, Math.round(span / colStep));
        for (let k = 0; k <= n; k++) {
          const r = a + T + ((span - 2 * T) * k) / n;
          if (doors.some((d) => r > d.a - 0.4 && r < d.b + 0.4)) continue;
          put(W.full, side, r - 0.15 / cs, r + 0.15 / cs, -0.3 / cs, 0, 0, top, '#556275');
          put(W.full, side, r - 0.2 / cs, r + 0.2 / cs, -0.35 / cs, 0, 0, this.lv(1.0), '#eab308');
          put(W.low, side, r - 0.2 / cs, r + 0.2 / cs, -0.35 / cs, 0, 0, kerb + this.lv(0.12), '#eab308');
        }
        W.full.end(); W.glass.end(); W.low.end();
      }
      // roof trusses across the hall with lamps hanging from them
      const R = this.roof, lights = this.workLights(), xs = [];
      for (const B of Object.values(R)) B.begin();
      const nx = Math.max(1, Math.round((H.x1 - H.x0) / colStep));
      for (let k = 1; k < nx; k++) xs.push(H.x0 + ((H.x1 - H.x0) * k) / nx);
      const lamp = (x, y, on) => {
        R.cyl.cyl(x, y, top - this.lv(1.4), top - this.lv(0.4), 0.015 / cs, '#64748b');
        R.cyl.cyl(x, y, top - this.lv(1.65), top - this.lv(1.4), 0.3 / cs, '#1f2937');
        (on ? R.lit : R.cyl).cyl(x, y, top - this.lv(1.68), top - this.lv(1.65), 0.26 / cs, on ? '#fff4d6' : '#273244');
      };
      for (const x of xs) {
        R.box.box(x - 0.1 / cs, H.y0, top - this.lv(0.5), x + 0.1 / cs, H.y1, top - this.lv(0.1), '#3b4a5f');
        R.box.box(x - 0.1 / cs, H.y0, top - this.lv(1.0), x + 0.1 / cs, H.y1, top - this.lv(0.85), '#3b4a5f');
        for (let y = H.y0 + colStep / 2; y < H.y1; y += colStep) lamp(x, y, !this.dark);
      }
      // a lamp over every work place
      for (const p of lights) lamp(p.x, p.y, true);
      for (const B of Object.values(R)) B.end();
      this.applyLights(lights, top);
    }
    // the light level of the hall, and a spot over every work place in lights-out
    applyLights(lights, top) {
      const dark = this.dark, bg = dark ? '#03060c' : BG;
      this.renderer.setClearColor(bg); this.scene.fog.color.set(bg);
      this.hemi.intensity = dark ? 0.22 : 1.6; this.hemi.color.set(dark ? '#7d8fc9' : '#c7d7ff');
      this.sun.intensity = dark ? 0.1 : 2.2;
      const n = dark ? Math.min(24, lights.length) : 0;
      while (this.spots.length < n) {
        const sp = new THREE.SpotLight('#ffe9c4', 1, 0, 0.6, 0.65, 2);
        this.scene.add(sp, sp.target); this.spots.push(sp);
      }
      this.spots.forEach((sp, k) => {
        sp.visible = k < n;
        if (k >= n) return;
        // a pool about 3.5 m across whatever the hall's height, as bright as the hall lights
        const p = lights[k], h = (top - this.lv(1.7)) * LZ, r = 3.5 / (this.sim.cfg.cellSize || 1);
        sp.position.set(p.x, h, p.y); sp.target.position.set(p.x, 0, p.y); sp.angle = Math.atan(r / h); sp.intensity = 3.2 * h * h;
      });
    }
    // walls between the camera and the hall drop to their kerb; the roof shows from inside only
    cutaway() {
      if (!this.walls) return;
      const p = this.camera.position, H = this.hallRect, out = { N: p.z < H.y0, S: p.z > H.y1, W: p.x < H.x0, E: p.x > H.x1 };
      for (const [k, W] of Object.entries(this.walls)) { W.full.mesh.visible = W.glass.mesh.visible = !out[k]; W.low.mesh.visible = out[k]; }
      const inside = p.y < this.hallTop * LZ;
      for (const B of Object.values(this.roof)) B.mesh.visible = inside;
    }

    // ---------------------------------------------------------------- screens
    // A screen facing +y between x0 and x1 at y, from level z0 to z1, showing
    // model (WS.paintScreen). Each screen keeps its own small canvas texture,
    // repainted only when what it shows changes, and not while it is far
    // from the camera; a screen not drawn in a frame is hidden.
    screen(key, x0, x1, y, z0, z1, model) {
      if (this.skip) return;
      const S = this.screens || (this.screens = new Map());
      let sc = S.get(key);
      if (!sc) {
        const cv = document.createElement('canvas'), W = 320, H = Math.round((W * (z1 - z0) * LZ) / (x1 - x0));
        cv.width = W; cv.height = H;
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
        this.scene.add(mesh);
        sc = { cv, tex, mesh, sig: null };
        S.set(key, sc);
      }
      sc.used = this.frameNo;
      sc.mesh.position.set((x0 + x1) / 2, ((z0 + z1) / 2 + (this.zLift || 0)) * LZ, y); sc.mesh.scale.set(x1 - x0, (z1 - z0) * LZ, 1);
      const far = this.camera.position.distanceTo(sc.mesh.position) > 40;
      if (far && sc.sig) return;
      const sig = JSON.stringify(model, (k, v) => (k === 'bar' && v != null ? Math.round(v * 40) : v));
      if (sig === sc.sig) return;
      sc.sig = sig;
      WS.paintScreen(sc.cv.getContext('2d'), sc.cv.width, sc.cv.height, model);
      sc.tex.needsUpdate = true;
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
    // Audit (tests only): while this.probe is an array, every storage unit
    // drawn is recorded in it as { kind, box: [x0, y0, z0, x1, y1, z1], who }
    // (who: the drawing function), so a test can find units that intersect.
    probeAdd(kind, x0, y0, z0, x1, y1, z1) {
      const line = (new Error().stack.split('\n')[3] || '').trim().replace(/^at /, '').split(' ')[0];
      this.probe.push({ kind, box: [Math.min(x0, x1), Math.min(y0, y1), z0, Math.max(x0, x1), Math.max(y0, y1), z1], who: line });
    }
    // Plastic tote: four walls and a floor, open at the top.
    tote(B, x0, y0, x1, y1, z0, h, color) {
      if (this.probe) this.probeAdd('tote', x0, y0, z0, x1, y1, z0 + h);
      const t = 0.035, zt = z0 + h;
      B.box(x0, y0, z0, x1, y1, z0 + 0.08, WS.shade(color, -0.3));
      B.box(x0, y0, z0, x1, y0 + t, zt, color); B.box(x0, y1 - t, z0, x1, y1, zt, color);
      B.box(x0, y0, z0, x0 + t, y1, zt, WS.shade(color, -0.12)); B.box(x1 - t, y0, z0, x1, y1, zt, WS.shade(color, -0.12));
      // hand holes in the short ends, below a thicker rim
      const hz0 = z0 + h * 0.68, hz1 = z0 + h * 0.84, dark = WS.shade(color, -0.55);
      if (x1 - x0 < y1 - y0) { const hw = (x1 - x0) * 0.22, mx = (x0 + x1) / 2; for (const e of [y0, y1]) B.box(mx - hw, e - 0.005, hz0, mx + hw, e + 0.005, hz1, dark); } else { const hw = (y1 - y0) * 0.22, my = (y0 + y1) / 2; for (const e of [x0, x1]) B.box(e - 0.005, my - hw, hz0, e + 0.005, my + hw, hz1, dark); }
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
      if (this.probe) this.probeAdd('parcel', x0, y0, z0, x1, y1, z0 + h);
      const my = (y0 + y1) / 2, tw = Math.min(0.06, (y1 - y0) * 0.15);
      B.box(x0, y0, z0, x1, y1, z0 + h, '#b8875a');
      B.box(x0 - 0.005, my - tw, z0 + h * 0.6, x1 + 0.005, my + tw, z0 + h + 0.01, '#e6c79c');
      if (label) B.box(x0 + (x1 - x0) * 0.45, y1, z0 + h * 0.2, x1 - (x1 - x0) * 0.1, y1 + 0.01, z0 + h * 0.75, '#f8fafc');
    }
    // Operator in a hi-vis vest, safety boots and a hard hat, facing angle a
    // (0 = towards -y), standing at level z0, with their own look
    // (WS.personLook(id); id defaults to where they stand). When active the
    // arms take turns reaching out to the pick and the put.
    operator(x, y, a, active, vest, z0 = 0, id) {
      const L = WS.personLook(id ?? Math.round(x * 4) + ',' + Math.round(y * 4)), D = this.dy, s = active ? Math.sin(this.t * 4.5) : 0;
      const part = (B) => (u0, v0, z1, u1, v1, z2, c) => B.rbox(x, y, a, u0, v0, z1 + z0, u1, v1, z2 + z0, c);
      const box = part(D.box), rnd = part(D.rnd), dome = part(D.dome), f = L.female, skin = L.skin, shirt = L.shirt;
      const sh = f ? 0.135 : 0.16, hip = f ? 0.13 : 0.12, hw = f ? 0.07 : 0.075;
      // safety boots with a sole, legs, hips and belt
      for (const u of [-0.102, 0.008]) {
        rnd(u - 0.004, -0.12, 0.03, u + 0.098, 0.06, 0.24, '#111827');
        box(u - 0.006, -0.125, 0, u + 0.1, 0.065, 0.04, '#4b5563');
        rnd(u, -0.052, 0.2, u + 0.094, 0.052, 1.62, L.trousers);
      }
      rnd(-hip, -0.068, 1.48, hip, 0.068, 1.9, L.trousers);
      box(-hip - 0.004, -0.068, 1.8, hip + 0.004, 0.068, 1.86, '#111827');
      // torso narrowing to the waist, the vest over it with reflective tape
      rnd(-hip + 0.005, -0.075, 1.85, hip - 0.005, 0.075, 2.35, shirt);
      rnd(-sh, -0.085, 2.25, sh, 0.085, 2.78, shirt);
      rnd(-hip - 0.002, -0.09, 1.88, hip + 0.002, 0.09, 2.36, vest);
      rnd(-sh + 0.01, -0.092, 2.3, sh - 0.01, 0.092, 2.74, vest);
      for (const z of [2.0, 2.2]) box(-hip - 0.006, -0.094, z, hip + 0.006, 0.094, z + 0.06, '#e2e8f0');
      for (const u of [-0.085, 0.055]) box(u, -0.097, 2.3, u + 0.03, -0.09, 2.74, '#e2e8f0');
      // arms: upper arm down the side, forearm reaching forward (left: pick, right: put), gloved hands
      for (const [side, reach] of [[-1, Math.max(0, s)], [1, Math.max(0, -s)]]) {
        const u0 = side < 0 ? -sh - 0.065 : sh - 0.005;
        rnd(u0, -0.045, 2.0 - reach * 0.2, u0 + 0.07, 0.045, 2.76, shirt);
        const len = 0.12 + reach * 0.32;
        rnd(u0, -0.04 - len, 1.95 + reach * 0.35, u0 + 0.065, 0.0, 2.09 + reach * 0.35, shirt);
        rnd(u0 + 0.004, -0.085 - len, 1.94 + reach * 0.35, u0 + 0.061, -0.03 - len, 2.1 + reach * 0.35, skin);
      }
      // neck and head, ears and face
      box(-0.035, -0.035, 2.74, 0.035, 0.035, 2.9, skin);
      if (L.style === 'long') rnd(-hw - 0.012, -0.02, 2.62, hw + 0.012, 0.095, 3.2, L.hair);
      rnd(-hw, -0.085, 2.84, hw, 0.08, 3.25, skin);
      for (const u of [-hw - 0.012, hw - 0.002]) rnd(u, -0.015, 2.97, u + 0.014, 0.03, 3.09, skin);
      rnd(-hw - 0.006, -0.03, 3.0, hw + 0.006, 0.088, 3.27, L.hair);
      if (L.style === 'ponytail') rnd(-0.028, 0.075, 2.78, 0.028, 0.125, 3.16, L.hair);
      if (L.style === 'beard') rnd(-hw + 0.004, -0.092, 2.83, hw - 0.004, 0.0, 2.98, L.hair);
      for (const u of [-0.045, 0.02]) { box(u, -0.09, 3.06, u + 0.025, -0.084, 3.095, '#111827'); box(u - 0.004, -0.09, 3.12, u + 0.029, -0.084, 3.14, WS.shade(L.hair, -0.2)); }
      box(-0.011, -0.1, 2.99, 0.011, -0.084, 3.07, WS.shade(skin, -0.08));
      if (L.style !== 'beard') box(-0.025, -0.089, 2.92, 0.025, -0.084, 2.94, WS.shade(skin, -0.35));
      // hard hat: shell with a ridge, a narrow brim all round and a peak at the front
      dome(-0.1, -0.11, 3.2, 0.1, 0.105, 3.46, L.hat);
      box(-0.012, -0.07, 3.3, 0.012, 0.065, 3.462, WS.shade(L.hat, 0.12));
      rnd(-0.106, -0.116, 3.18, 0.106, 0.111, 3.22, WS.shade(L.hat, -0.1));
      rnd(-0.08, -0.17, 3.19, 0.08, -0.1, 3.215, WS.shade(L.hat, -0.1));
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
      const l = this.stackLightPos(p);
      S.box.box(l.x - 0.03, l.y - 0.03, l.z - 0.15, l.x + 0.03, l.y + 0.03, l.z, '#64748b');
    }
    portLive(p) {
      const sim = this.sim, g = sim.grid, L = sim.layout, CZ = this.CZ, front = p.face === 'front', D = this.dy, pp = L.portPath(p);
      const sx = front ? p.drop.x + 1.75 : g.W + 1.9, sy = front ? g.D + 1.95 : p.drop.y + 1.75;
      D.lit.box(sx - 0.24, sy + 0.04, 3.4, sx + 0.24, sy + 0.05, 4.5, '#0b1220');
      this.screen('port' + p.idx, sx - 0.235, sx + 0.235, sy + 0.053, 3.42, 4.48, this.portScreen(p));
      const bin = (x, y, id, s) => this.tote(D.box, x - s.w, y - s.d, x + s.w, y + s.d, CZ, 0.95, this.binColor(id)), sz = this.portBinSize(p);
      p.inQ.forEach((q, k) => { const f = k === 0 ? Math.min(1, q.t / sim.cfg.conveyorStep) : 0, a = pp.entry[0], b = pp.head; bin(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, q.bin.id, sz.q); });
      if (p.pick) { const q = this.pickPos(p); bin(q.x, q.y, p.pick.id, sz.pick); }
      p.outQ.forEach((b, k) => { const e = this.outPos(p, k); bin(e.x, e.y, b.id, sz.q); });
      const l = this.stackLightPos(p);
      this.stackLight(l.x, l.y, l.z, p);
    }
    // bin sizes and the sliding pick position, as in the isometric view
    portBinSize(p) { return WS.IsoRenderer.prototype.portBinSize.call(this, p); }
    pickPos(p) { return WS.IsoRenderer.prototype.pickPos.call(this, p); }
    outPos(p, k) { return WS.IsoRenderer.prototype.outPos.call(this, p, k); }
    stackLightPos(p) { return WS.IsoRenderer.prototype.stackLightPos.call(this, p); }
    portScreen(p) { return WS.IsoRenderer.prototype.portScreen.call(this, p); }
    packerScreen(pk) { return WS.IsoRenderer.prototype.packerScreen.call(this, pk); }
    compName(bin, comp) { return WS.IsoRenderer.prototype.compName.call(this, bin, comp); }
    slotTote(p, k, o) { return WS.IsoRenderer.prototype.slotTote.call(this, p, k, o); }
    toteStackTop(n) { return WS.IsoRenderer.prototype.toteStackTop.call(this, n); }
    // empty order totes nested on a dolly
    toteStack(x, y, n) {
      const D = this.dy;
      D.rnd.box(x - 0.3, y - 0.36, 0.1, x + 0.3, y + 0.36, 0.28, '#475569');
      for (const [cx, cy] of [[-0.24, -0.3], [0.24, -0.3], [-0.24, 0.3], [0.24, 0.3]]) D.cyl.cyl(x + cx, y + cy, 0, 0.1, 0.045, '#0b0f17');
      const m = Math.min(n, 12);
      for (let k = 0; k < m - 1; k++) {
        D.box.box(x - 0.215, y - 0.275, 0.28 + k * 0.17, x + 0.215, y + 0.275, 0.42 + k * 0.17, '#1d4ed8');
        D.box.box(x - 0.225, y - 0.285, 0.42 + k * 0.17, x + 0.225, y + 0.285, 0.45 + k * 0.17, '#2563eb');
      }
      if (m) this.orderTote(D.box, x, y, this.toteStackTop(m), 0);
    }
    binColor(id) {
      const inv = this.sim.inv, b = id ? inv.binById.get(id) : null;
      return this.opts.heat && b ? WS.CLASS_COLORS[inv.binClass(b)] : '#64748b';
    }
    // red / amber (waiting for storage units) / green (working)
    stackLight(x, y, z, p) {
      const starving = !p.job && !p.inQ.length && p.demand() > 0;
      [['#ef4444', !!p.away], ['#f59e0b', starving && !p.away], ['#22c55e', !!p.job && !p.away]].forEach(([c, on], k) => {
        const zz = z + k * 0.42;
        (on ? this.dy.litCyl : this.dy.cyl).cyl(x, y, zz, zz + 0.4, 0.09, on ? c : WS.shade(c, -0.65));
      });
    }

    // Static: conveyors, station bodies, put walls, pack benches, the dock.
    buildStations(S) {
      const sim = this.sim, L = sim.layout, oms = sim.oms, CZ = this.CZ;
      const lastPk = L.packerPos(oms.packers.length - 1);
      this.conveyor(S, [{ x: 1.2, y: L.takeawayY }, { x: lastPk.x, y: L.takeawayY }], 0.5, 1.6);
      for (const p of sim.ports) if (p.kind === 'PICK') { const y = L.backLaneY(p); this.conveyor(S, [{ x: L.backLaneX(p), y }, { x: L.spurX(p), y }, { x: L.spurX(p), y: L.takeawayY - 0.25 }], 0.45, 1.6); }
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
        const op = L.packerOperator(pk);
        S.box.box(op.x - 0.55, op.y - 0.45, 0, op.x + 0.55, op.y + 0.45, 0.04, '#10161f');
        if (pk.kind === 'bagger') { this.baggerBody(S, q, pick); continue; }
        if (pk.kind === 'boxer') { this.boxMakerBody(S, q, pick); continue; }
        for (const [lx, ly] of [[-0.95, -0.5], [0.87, -0.5], [-0.95, 0.42], [0.87, 0.42]]) S.box.box(q.x + lx, q.y + ly, 0, q.x + lx + 0.08, q.y + ly + 0.08, 1.9, '#64748b');
        S.box.box(q.x - 0.95, q.y - 0.5, 0.45, q.x + 0.95, q.y + 0.5, 0.55, '#475569');
        for (let k = 0; k < 4; k++) S.box.box(q.x - 0.85, q.y - 0.4, 0.55 + k * 0.12, q.x + 0.1, q.y + 0.4, 0.65 + k * 0.12, k % 2 ? '#cfa271' : '#b8875a');
        S.box.box(q.x - 1.0, q.y - 0.55, 1.9, q.x + 1.0, q.y + 0.55, 2.1, '#e7dccb', pick);
        S.box.box(q.x - 0.85, q.y - 0.5, 2.1, q.x - 0.79, q.y - 0.44, 3.6, '#475569');
        S.box.box(q.x - 0.98, q.y - 0.52, 3.3, q.x - 0.5, q.y - 0.44, 4.3, '#0f172a', pick);
        S.box.box(q.x + 0.5, q.y - 0.45, 2.1, q.x + 0.92, q.y - 0.08, 2.75, '#e2e8f0');
        S.box.box(q.x + 0.55, q.y + 0.15, 2.1, q.x + 0.85, q.y + 0.35, 2.4, '#dc2626');
      }
      const d = L.dock();
      S.box.box(d.x - 0.9, d.y - 1.3, 0, d.x + 0.1, d.y + 1.3, 1.2, '#374151', { kind: 'dock' });
    }
    drawStationsLive() {
      const sim = this.sim, L = sim.layout, oms = sim.oms, D = this.dy, CZ = this.CZ;
      for (const p of sim.ports) {
        this.portLive(p);
        const op = L.operatorPos(p);
        if (p.decanter) {
          const a = WS.IsoRenderer.prototype.decantPose.call(this, p), s = a.src, D = this.dy;
          D.box.box(s.x - 0.32, s.y - 0.32, 0, s.x + 0.32, s.y + 0.32, CZ + 0.5, '#64748b');
          D.lit.box(s.x - 0.22, s.y + 0.32, CZ - 0.3, s.x + 0.22, s.y + 0.33, CZ - 0.1, '#f87171');
          if (!a.tip.hold || a.assist) this.parcel(D.box, s.x - 0.18, s.y - 0.15, s.x + 0.18, s.y + 0.15, CZ + 0.5, 0.45, false);
          this.arm(a);
          if (a.assist) this.operator(a.helper.x, a.helper.y, this.faceAngle(p), true, '#22c55e');
        } else if (p.arm) {
          const a = WS.IsoRenderer.prototype.armPose.call(this, p);
          this.arm(a);
          if (a.assist) this.operator(a.helper.x, a.helper.y, this.faceAngle(p), true, '#f97316');
        } else if (!p.away) this.operator(op.x, op.y, this.faceAngle(p), !!(p.job && p.job.next < p.job.lines.length && p.mode === 'auto'), p.kind === 'PICK' ? '#f97316' : '#22c55e');
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
        const st = L.toteStack(p);
        this.toteStack(st.x, st.y, p.stack ? p.stack.length : 0);
        const ln = p.currentLine, wy0 = L.slotPos(p, 0).y - 0.35;
        p.slots.forEach((o, k) => {
          const q = L.slotPos(p, k);
          if (o) { const units = oms.units(o), picked = o.lines.reduce((s, l) => s + l.picked, 0), t = this.slotTote(p, k, o); this.orderTote(D.box, t.x, t.y, t.z, picked / units); }
          const target = ln && ln.order === o, on = target && Math.sin(this.t * 9) > -0.3;
          (target ? D.lit : D.box).box(q.x - 0.1, wy0 - 0.02, 4.15, q.x + 0.1, wy0 + 0.12, 4.4, on ? '#4ade80' : o ? '#e2e8f0' : '#334155');
        });
      }
      for (const pk of oms.packers) {
        const q = L.packerPos(pk.idx);
        if (pk.kind === 'bagger') this.baggerLive(pk, q);
        else if (pk.kind === 'boxer') this.boxMakerLive(pk, q);
        else { D.lit.box(q.x - 0.95, q.y - 0.44, 3.38, q.x - 0.53, q.y - 0.43, 4.22, '#0b1220'); this.screen('pack' + pk.idx, q.x - 0.945, q.x - 0.535, q.y - 0.427, 3.4, 4.2, this.packerScreen(pk)); }
        if (pk.cur && pk.kind === 'manual') {
          const f = pk.t / pk.dur;
          if (f < 0.6) { this.orderTote(D.box, q.x - 0.45, q.y, 2.1, 1 - f / 0.6); this.tote(D.box, q.x - 0.05, q.y - 0.25, q.x + 0.45, q.y + 0.25, 2.1, 0.25 + Math.min(1, f * 1.6) * 0.55, '#b8875a'); } else this.parcel(D.box, q.x - 0.05, q.y - 0.25, q.x + 0.45, q.y + 0.25, 2.1, 0.8, f > 0.8);
        }
        const op = L.packerOperator(pk);
        this.operator(op.x, op.y, 0, !!pk.cur, '#38bdf8');
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
        if (it.kind === 'tote') this.orderTote(D.box, q.x, q.y, q.z ?? 1.6, 1, 0.85);
        else if (it.order.pack === 'bagger') this.bag(D.box, q.x, q.y, 1.4);
        else this.parcel(D.box, q.x - 0.18, q.y - 0.16, q.x + 0.18, q.y + 0.16, 1.4, 0.6, true);
      }
    }

    // Robot arm (pose from WS.IsoRenderer.armPose): base, column, a boom over
    // to the tip, a rod down to the gripper and the item it holds.
    arm(a) {
      const D = this.dy, b = a.base, t = a.tip, top = this.CZ + 2.6, dx = t.x - b.x, dy = t.y - b.y, len = Math.hypot(dx, dy) || 1e-3;
      D.cyl.cyl(b.x, b.y, 0, 0.35, 0.28, '#334155');
      D.cyl.cyl(b.x, b.y, 0.35, top + 0.1, 0.11, '#f59e0b');
      D.lit.box(b.x - 0.07, b.y - 0.14, top - 1.1, b.x + 0.07, b.y - 0.12, top - 0.8, '#38bdf8');
      D.box.rbox(b.x, b.y, Math.atan2(-dy, dx), 0, -0.08, top - 0.08, len, 0.08, top + 0.12, '#f59e0b');
      D.cyl.cyl(t.x, t.y, top - 0.15, top + 0.15, 0.1, '#d97706');
      D.cyl.cyl(t.x, t.y, t.z + 0.22, top - 0.1, 0.035, '#94a3b8');
      D.box.box(t.x - 0.09, t.y - 0.09, t.z, t.x + 0.09, t.y + 0.09, t.z + 0.22, '#475569');
      if (t.hold && a.carton) {
        this.parcel(D.box, t.x - 0.18, t.y - 0.15, t.x + 0.18, t.y + 0.15, t.z - 0.45, 0.45, false);
        if (a.pour) for (let k = 0; k < 3; k++) { const z = t.z - 0.5 - ((a.pour * 3 + k / 3) % 1) * 1.2; D.box.box(t.x - 0.05 + k * 0.05, t.y - 0.04, z, t.x + k * 0.05, t.y + 0.04, z + 0.1, a.color); }
      } else if (t.hold) D.box.box(t.x - 0.08, t.y - 0.07, t.z - 0.3, t.x + 0.08, t.y + 0.07, t.z, a.color);
    }

    // ---------------------------------------------------------------- packing machines
    // Auto-bagger (as in the isometric view): a tall cabinet with the film
    // roll on top and a loading shelf beside it.
    baggerBody(S, q, pick) {
      S.box.box(q.x - 0.75, q.y - 0.45, 0, q.x + 0.05, q.y + 0.4, 3.7, '#334155', pick);
      S.cyl.cylX(q.x - 0.7, q.x, q.y - 0.05, 3.92, 0.22, '#e5e7eb', pick);
      S.cyl.cylX(q.x - 0.72, q.x + 0.02, q.y - 0.05, 3.92, 0.06, '#64748b');
      S.box.box(q.x - 0.62, q.y + 0.4, 1.15, q.x - 0.08, q.y + 0.41, 1.7, '#0b1220');
      for (const [lx, ly] of [[0.82, -0.4], [0.82, 0.35]]) S.box.box(q.x + lx, q.y + ly, 0, q.x + lx + 0.08, q.y + ly + 0.08, 1.9, '#64748b');
      S.box.box(q.x + 0.05, q.y - 0.4, 1.9, q.x + 0.9, q.y + 0.43, 2.1, '#e7dccb', pick);
    }
    baggerLive(pk, q) {
      const D = this.dy, f = pk.cur ? pk.t / pk.dur : 0;
      D.lit.box(q.x - 0.6, q.y + 0.4, 2.6, q.x - 0.15, q.y + 0.41, 3.3, '#0b1220');
      this.screen('pack' + pk.idx, q.x - 0.595, q.x - 0.155, q.y + 0.413, 2.62, 3.28, this.packerScreen(pk));
      if (pk.cur) D.litCyl.cyl(q.x - 0.05, q.y + 0.35, 3.7, 3.9, 0.06, '#22c55e');
      if (pk.cur && f < 0.6) this.orderTote(D.box, q.x + 0.47, q.y, 2.1, 1 - f / 0.6);
      if (pk.cur && f >= 0.6) this.bag(D.box, q.x - 0.35, q.y + 0.6, 1.4);
    }
    // Box-making machine: an enclosure with a window, the cardboard bale on
    // top and the induction conveyor on the right.
    boxMakerBody(S, q, pick) {
      S.box.box(q.x - 1.1, q.y - 0.55, 0, q.x + 0.35, q.y + 0.45, 3.1, '#cbd5e1', pick);
      S.box.box(q.x - 1.0, q.y - 0.45, 3.1, q.x + 0.0, q.y + 0.3, 3.65, '#b8875a', pick);
      for (let k = 0; k < 10; k++) S.box.box(q.x - 1.1 + k * 0.145, q.y + 0.45, 0, q.x - 1.1 + (k + 1) * 0.145, q.y + 0.46, 0.18, k % 2 ? '#111827' : '#facc15');
      this.conveyor(S, [{ x: q.x + 0.4, y: q.y + 0.03 }, { x: q.x + 0.95, y: q.y + 0.03 }], 0.6, 1.85);
    }
    boxMakerLive(pk, q) {
      const D = this.dy, f = pk.cur ? pk.t / pk.dur : 0;
      D.clear.box(q.x - 0.95, q.y + 0.45, 1.1, q.x + 0.2, q.y + 0.47, 2.7, '#0f172a');
      if (pk.cur && f > 0.3) { const w = Math.min(1, (f - 0.3) / 0.4); this.parcel(D.box, q.x - 0.6, q.y - 0.2, q.x - 0.6 + 0.5 * w, q.y + 0.2, 1.3, 0.2 + 0.4 * w, false); }
      if (pk.cur) D.litCyl.cyl(q.x + 0.3, q.y + 0.4, 3.1, 3.3, 0.06, '#22c55e');
      if (pk.cur && f < 0.5) this.orderTote(D.box, q.x + 0.68, q.y + 0.03, 1.85, 1 - f / 0.5, 0.8);
      if (pk.cur && f >= 0.85) this.parcel(D.box, q.x - 0.55, q.y + 0.5, q.x - 0.1, q.y + 0.85, 1.4, 0.55, true);
    }
    // sealed poly bag with a label
    bag(B, x, y, z) {
      B.box(x - 0.2, y - 0.15, z, x + 0.2, y + 0.15, z + 0.22, '#e2e8f0');
      B.box(x - 0.12, y - 0.08, z + 0.22, x + 0.04, y + 0.08, z + 0.23, '#ffffff');
    }

    // ---------------------------------------------------------------- overlays
    drawSelection(alpha) {
      const s = this.selected;
      if (!s) return;
      const o = this.selectionBox(s, alpha);
      if (!o) return;
      const [x0, y0, x1, y1, z = 0.02] = o, t = 0.05, B = this.dy.lit, c = '#38bdf8';
      B.box(x0, y0, z, x1, y0 + t, z + 0.08, c); B.box(x0, y1 - t, z, x1, y1, z + 0.08, c);
      B.box(x0, y0, z, x0 + t, y1, z + 0.08, c); B.box(x1 - t, y0, z, x1, y1, z + 0.08, c);
    }
    // floor rectangle [x0, y0, x1, y1, z] to outline for a selection; types add their own kinds
    selectionBox(s, alpha) {
      const sim = this.sim, L = sim.layout;
      if (s.kind === 'robot') { const p = this.followPos(s.id, alpha); return p && [p.x - 0.56, p.y - 0.56, p.x + 0.56, p.y + 0.56, (p.z ?? this.robotZ) + 0.02]; }
      if (s.kind === 'packer') { const q = L.packerPos(s.id); return [q.x - 1.1, q.y - 0.65, q.x + 1.1, q.y + 0.65]; }
      return null;
    }
    // level the robots drive on (CubeFlow: the grid top)
    get robotZ() { return 0; }
    // planned routes of moving robots, and the cells they reserved ahead
    drawPaths(alpha) {
      const sim = this.sim, pos = [], cols = [], c = new THREE.Color(), zl = this.robotZ * LZ + 0.03;
      if (this.opts.paths && sim.fleet.some((r) => r.path !== undefined)) {
        for (const r of sim.fleet) {
          if (!r.path || !r.op || r.op.op !== 'move') continue;
          c.set(WS.stateColor(sim, r.displayState));
          let px = r.prx + (r.rx - r.prx) * alpha + 0.5, py = r.pry + (r.ry - r.pry) * alpha + 0.5;
          for (let k = r.pi + 1; k < r.path.length; k++) {
            const qx = r.path[k].x + 0.5, qy = r.path[k].y + 0.5;
            pos.push(px, zl, py, qx, zl, qy); cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
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
            if (x !== r.x || y !== r.y) this.dy.clear.box(x + 0.12, y + 0.12, this.robotZ + 0.01, x + 0.88, y + 0.88, this.robotZ + 0.04, color);
          }
        }
        this.dy.clear.end();
      }
    }
    // Text tags drawn over the WebGL canvas at projected world points.
    label(s, x, y, z, o = {}) {
      if (this.skip) return;
      const p = V.set(x, (z + (this.zLift || 0)) * LZ, y).project(this.camera);
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
        this.label(`${p.code} ${p.kind === 'PICK' ? (p.arm ? 'ROBOT PICK' : 'PICK') : p.decanter ? 'AUTO GOODS-IN' : 'GOODS-IN'} · ${st}`, pos.x, pos.y, 7.2, { size: 10, bg, color: p.kind === 'PICK' ? '#fdba74' : '#86efac' });
      }
      for (const pk of sim.oms.packers) { const q = L.packerPos(pk.idx); this.label(`${pk.name} · ${pk.queue.length} queued`, q.x, q.y, 5, { size: 10, bg, color: '#7dd3fc' }); }
      const d = L.dock(), tr = sim.oms.truck;
      this.label(`${tr.carrier.name} · ${tr.parcels.length}/${sim.cfg.truckCapacity}`, d.x + 2.5, d.y, 8.2, { size: 10, bg, color: '#e2e8f0' });
    }
  }

  View3D.LZ = LZ;
  WS.View3D = View3D;
})((globalThis.WS = globalThis.WS || {}));
