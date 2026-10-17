/* Landing page: spec chips from the default config and an animated
 * isometric preview of each simulation type. The previews are decorative and
 * do not run the simulator. */
(function (WS) {
  'use strict';

  const C = WS.CUBE_CONFIG, PC = WS.POD_CONFIG, SC = WS.SHUTTLE_CONFIG;
  const specs = {
    cube: [`${C.gridW} × ${C.gridD} grid`, `${C.gridZ} bins deep`, `${C.robots} robots`, `${C.pickPorts} pick ports`],
    pod: [`${PC.floorW} × ${PC.floorD} floor`, `4-sided pods`, `${PC.robots} robots`, `${PC.pickPorts} pick stations`],
    shuttle: [`${SC.aisles} aisles`, `${SC.levels} levels`, `${SC.aisles * SC.levels} shuttles`, `${SC.aisles} lifts`],
  };
  for (const ul of document.querySelectorAll('[data-specs]')) {
    for (const s of specs[ul.dataset.specs] || []) {
      const li = document.createElement('li');
      li.textContent = s;
      ul.appendChild(li);
    }
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Small seeded RNG so the preview looks the same on every visit.
  function rng(seed) {
    return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  // Isometric drawing kit fitted to a gw × gd floor with things up to ztop high.
  function isoKit(canvas, gw, gd, ztop, zk) {
    const ctx = canvas.getContext('2d'), k = { ctx, s: 20, ox: 0, oy: 0 };
    k.P = (x, y, z) => [k.ox + (x - y) * k.s, k.oy + (x + y) * k.s * 0.5 - z * k.s * zk];
    k.resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const spanX = gw + gd, spanY = (gw + gd) * 0.5 + ztop * zk;
      k.s = Math.min(w / (spanX * 1.2), h / (spanY * 1.25));
      k.ox = w / 2 - (gw - gd) * k.s / 2;
      k.oy = h / 2 - ((gw + gd) * 0.5 - ztop * zk) * k.s / 2;
    };
    k.quad = (pts, fill, stroke, lw) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
    };
    // Box with its three visible faces: top, left (y = y1) and right (x = x1).
    k.box = (x0, y0, x1, y1, z0, z1, top, left, right, stroke) => {
      const P = k.P;
      k.quad([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], left, stroke);
      k.quad([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], right, stroke);
      k.quad([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], top, stroke);
    };
    return k;
  }
  // Runs step/draw every frame, or draws one still frame for reduced motion.
  function animate(canvas, kit, step, draw) {
    let last = 0, t = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now; t += dt;
      step(dt);
      kit.ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      draw(t);
      requestAnimationFrame(frame);
    };
    kit.resize();
    addEventListener('resize', () => { kit.resize(); if (reduced) draw(t); });
    if (reduced) {
      // run the robots for a moment off-screen, then show one still frame
      for (let i = 0; i < 90; i++) { t += 0.05; step(0.05); }
      draw(t);
    } else requestAnimationFrame(frame);
  }

  /* ---------- cube storage preview ---------- */
  function cubePreview(canvas) {
    const GW = 8, GD = 6, GH = 5; // cells along x and y, bins per stack
    const kit = isoKit(canvas, GW, GD, GH + 1.2, 0.62), { ctx, P, quad, box } = kit;
    const rand = rng(11);
    const binCol = [];
    for (let i = 0; i < (GW + GD) * GH; i++) {
      const r = rand();
      binCol.push(r < 0.12 ? '#38bdf8' : r < 0.2 ? '#e879f9' : r < 0.27 ? '#facc15' : null);
    }

    // Robots each work their own quarter of the grid so they never collide.
    const zones = [[0, 3, 0, 2], [4, 7, 0, 2], [0, 3, 3, 5], [4, 7, 3, 5]];
    const robots = zones.map((z, i) => ({ zone: z, x: z[0] + (i % 2), y: z[2] + 1, legs: [], wait: 0.4 * i, dig: 0, depth: 1, digT: 0 }));
    const SPEED = 2.4, TURN = 0.35, DIG = 2.8;

    function plan(r) {
      const [x0, x1, y0, y1] = r.zone;
      let tx, ty;
      do { tx = x0 + Math.floor(rand() * (x1 - x0 + 1)); ty = y0 + Math.floor(rand() * (y1 - y0 + 1)); }
      while (tx === r.x && ty === r.y);
      r.legs = [];
      if (tx !== r.x) r.legs.push(['x', tx]);
      if (ty !== r.y) r.legs.push(['y', ty]);
      r.depth = 1 + Math.floor(rand() * (GH - 1));
    }

    function step(r, dt) {
      if (r.wait > 0) { r.wait -= dt; return; }
      if (r.dig > 0) { r.dig = Math.max(0, r.dig - dt); if (!r.dig) plan(r); return; }
      if (!r.legs.length) { plan(r); return; }
      const [axis, to] = r.legs[0];
      const d = to - r[axis], m = SPEED * dt;
      if (Math.abs(d) <= m) {
        r[axis] = to;
        r.legs.shift();
        if (r.legs.length) r.wait = TURN; // wheel set change, never a turn
        else { r.dig = DIG; r.digT = DIG; }
      } else r[axis] += Math.sign(d) * m;
    }

    function drawBlock(t) {
      const top = GH;
      // floor shadow
      quad([P(-0.4, -0.4, 0), P(GW + 0.4, -0.4, 0), P(GW + 0.4, GD + 0.4, 0), P(-0.4, GD + 0.4, 0)], 'rgba(56,189,248,.05)');
      // side faces with bins
      quad([P(0, GD, 0), P(GW, GD, 0), P(GW, GD, top), P(0, GD, top)], '#0b1424');
      quad([P(GW, 0, 0), P(GW, GD, 0), P(GW, GD, top), P(GW, 0, top)], '#08101d');
      let k = 0;
      for (let z = 0; z < GH; z++) {
        for (let x = 0; x < GW; x++, k++) {
          const c = binCol[k];
          quad([P(x + 0.08, GD, z + 0.1), P(x + 0.92, GD, z + 0.1), P(x + 0.92, GD, z + 0.9), P(x + 0.08, GD, z + 0.9)],
            c ? c + '33' : 'rgba(30,42,61,.55)', c ? c + '99' : 'rgba(56,189,248,.12)');
        }
        for (let y = 0; y < GD; y++, k++) {
          const c = binCol[k];
          quad([P(GW, y + 0.08, z + 0.1), P(GW, y + 0.92, z + 0.1), P(GW, y + 0.92, z + 0.9), P(GW, y + 0.08, z + 0.9)],
            c ? c + '22' : 'rgba(30,42,61,.4)', c ? c + '77' : 'rgba(56,189,248,.09)');
        }
      }
      // top surface and rails
      const topQuad = [P(0, 0, top), P(GW, 0, top), P(GW, GD, top), P(0, GD, top)];
      quad(topQuad, '#0d1a2e');
      ctx.save();
      quad(topQuad);
      ctx.clip();
      const c = ((t * 0.9) % (GW + GD + 6)) - 3; // light sweep across the top
      const band = (a) => [P(a + 30, -30, top), P(-30, a + 30, top)];
      const [a0, a1] = band(c), [b1, b0] = band(c + 1.6);
      quad([a0, a1, b0, b1], 'rgba(56,189,248,.10)');
      ctx.restore();
      ctx.strokeStyle = 'rgba(56,189,248,.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= GW; x++) { const a = P(x, 0, top), b = P(x, GD, top); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      for (let y = 0; y <= GD; y++) { const a = P(0, y, top), b = P(GW, y, top); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
      // glowing outline of the block
      ctx.save();
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = 'rgba(125,211,252,.85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      [[P(0, GD, 0), P(GW, GD, 0), P(GW, 0, 0)], [P(0, GD, 0), P(0, GD, top)], [P(GW, GD, 0), P(GW, GD, top)], [P(GW, 0, 0), P(GW, 0, top)]]
        .forEach((l) => l.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))));
      quad(topQuad);
      ctx.stroke();
      ctx.restore();
    }

    // X-ray of the stack under a digging robot, with the bin on the winch.
    function drawDig(r) {
      const prog = 1 - r.dig / r.digT; // 0..1: down then up
      const reach = prog < 0.5 ? prog * 2 : (1 - prog) * 2;
      const zt = GH, zb = GH - r.depth;
      const x = r.x, y = r.y;
      ctx.save();
      box(x + 0.06, y + 0.06, x + 0.94, y + 0.94, zb, zt, 'rgba(250,204,21,.05)', 'rgba(250,204,21,.07)', 'rgba(250,204,21,.05)', 'rgba(250,204,21,.35)');
      const z = zt - reach * r.depth - 0.9;
      const [cx, cy] = P(x + 0.5, y + 0.5, zt);
      const [bx, by] = P(x + 0.5, y + 0.5, z + 0.9);
      ctx.strokeStyle = 'rgba(250,204,21,.8)';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke();
      if (prog >= 0.5) {
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 14;
        box(x + 0.14, y + 0.14, x + 0.86, y + 0.86, z, z + 0.85, 'rgba(250,204,21,.55)', 'rgba(250,204,21,.4)', 'rgba(250,204,21,.3)', '#facc15');
      }
      ctx.restore();
    }

    function drawRobot(r, t) {
      const x = r.x, y = r.y, z = GH;
      const digging = r.dig > 0;
      const led = digging ? '#facc15' : r.legs.length ? '#38bdf8' : '#4ade80';
      box(x + 0.1, y + 0.1, x + 0.9, y + 0.9, z, z + 1.05, '#e6edf7', '#9fb0c8', '#70819b', 'rgba(4,7,13,.5)');
      // state light strip around the body
      ctx.save();
      ctx.shadowColor = led;
      ctx.shadowBlur = 10 + (digging ? 6 * Math.sin(t * 8) : 0);
      quad([P(x + 0.1, y + 0.9, z + 0.62), P(x + 0.9, y + 0.9, z + 0.62), P(x + 0.9, y + 0.9, z + 0.78), P(x + 0.1, y + 0.9, z + 0.78)], led);
      quad([P(x + 0.9, y + 0.1, z + 0.62), P(x + 0.9, y + 0.9, z + 0.62), P(x + 0.9, y + 0.9, z + 0.78), P(x + 0.9, y + 0.1, z + 0.78)], led);
      ctx.restore();
      // lid
      quad([P(x + 0.25, y + 0.25, z + 1.05), P(x + 0.75, y + 0.25, z + 1.05), P(x + 0.75, y + 0.75, z + 1.05), P(x + 0.25, y + 0.75, z + 1.05)], 'rgba(4,7,13,.15)', 'rgba(4,7,13,.35)');
    }

    animate(canvas, kit, (dt) => robots.forEach((r) => step(r, dt)), (t) => {
      drawBlock(t);
      robots.filter((r) => r.dig > 0).forEach(drawDig);
      robots.slice().sort((a, b) => a.x + a.y - (b.x + b.y)).forEach((r) => drawRobot(r, t));
    });
  }

  /* ---------- pod robot preview ---------- */
  // Each robot serves its own station and the pods on either side of that
  // station's highway, so the choreography never needs collision handling.
  function podPreview(canvas) {
    const GW = 11, GD = 7, LEG = 0.5, TOP = 2.7;
    const kit = isoKit(canvas, GW, GD + 1, TOP + 0.6, 0.62), { ctx, P, quad, box } = kit;
    const rand = rng(5), STATIONS = [1, 5, 9];
    const HUES = ['#38bdf8', '#e879f9', '#4ade80', '#fb923c', '#a78bfa', '#f87171'];
    const highway = (x, y) => y === 2 || y === 5 || STATIONS.includes(x);
    const pods = new Map();
    for (let y = 0; y < 5; y++) for (let x = 0; x < GW; x++) {
      if (highway(x, y) || rand() < 0.08) continue;
      const faces = [0, 1, 2, 3].map(() => Array.from({ length: 6 }, () => (rand() < 0.55 ? HUES[Math.floor(rand() * HUES.length)] : null)));
      pods.set(x + ',' + y, { x, y, angle: Math.floor(rand() * 4) * (Math.PI / 2), faces });
    }
    const robots = STATIONS.map((s, k) => ({ s, x: s + (k === 1 ? 1 : -1), y: 1, pod: null, queue: [], wait: 0.6 * k, lift: 0, glow: 0, last: null }));
    const SPEED = 2.2, TURN = 0.3;

    function plan(r) {
      const opts = [...pods.values()].filter((p) => Math.abs(p.x - r.s) === 1 && p.y !== 0 && p !== r.last);
      const p = opts[Math.floor(rand() * opts.length)];
      const hw = p.y === 4 ? 5 : 2;
      r.queue = [['go', [[p.x, r.y], [p.x, p.y]]], ['lift', p], ['go', [[p.x, hw], [r.s, hw], [r.s, 6]]], ['present'],
        ['go', [[r.s, hw], [p.x, hw], [p.x, p.y]]], ['lower']];
    }
    function step(r, dt) {
      if (r.wait > 0) { r.wait -= dt; return; }
      if (!r.queue.length) { plan(r); return; }
      const [op, arg] = r.queue[0];
      if (op === 'go') {
        const [tx, ty] = arg[0], dx = tx - r.x, dy = ty - r.y, m = SPEED * dt;
        const d = Math.abs(dx) + Math.abs(dy);
        if (d <= m) { r.x = tx; r.y = ty; arg.shift(); if (!arg.length) r.queue.shift(); else r.wait = TURN; }
        else if (dx) r.x += Math.sign(dx) * m; else r.y += Math.sign(dy) * m;
      } else if (op === 'lift' || op === 'lower') {
        if (op === 'lift' && !r.pod) { r.pod = arg; pods.delete(arg.x + ',' + arg.y); }
        r.lift = Math.max(0, Math.min(1, r.lift + (op === 'lift' ? dt : -dt) * 2.5));
        if (op === 'lift' ? r.lift >= 1 : r.lift <= 0) {
          if (op === 'lower') { r.pod.x = Math.round(r.x); r.pod.y = Math.round(r.y); pods.set(r.pod.x + ',' + r.pod.y, r.pod); r.last = r.pod; r.pod = null; }
          r.queue.shift();
        }
      } else if (op === 'present') {
        r.glow += dt;
        if (r.glow < 0.8) r.pod.angle += (Math.PI / 2) * dt / 0.8; // turn the pod to the operator
        if (r.glow > 2.6) { r.glow = 0; r.queue.shift(); }
      }
    }

    function drawFloor() {
      quad([P(0, 0, 0), P(GW, 0, 0), P(GW, GD, 0), P(0, GD, 0)], '#0b1424', 'rgba(125,211,252,.5)', 1.2);
      for (let y = 0; y < GD; y++) for (let x = 0; x < GW; x++) {
        const cell = [P(x + 0.04, y + 0.04, 0), P(x + 0.96, y + 0.04, 0), P(x + 0.96, y + 0.96, 0), P(x + 0.04, y + 0.96, 0)];
        if (y === 6) { if (STATIONS.includes(x)) quad(cell, 'rgba(250,204,21,.12)', 'rgba(250,204,21,.8)', 1.4); continue; }
        if (highway(x, y)) quad(cell, 'rgba(56,189,248,.06)');
        else quad(cell, null, 'rgba(56,189,248,.16)');
      }
    }
    function drawPod(p, cx, cy, z0) {
      const h = 0.42, a = p.angle, c = Math.cos(a), sn = Math.sin(a);
      const rot = (u, v) => [cx + u * c + v * sn, cy - u * sn + v * c];
      const corner = [rot(-h, h), rot(h, h), rot(h, -h), rot(-h, -h)];
      for (const q of corner) quad([P(q[0], q[1], z0), P(q[0], q[1], z0 + LEG)], null, '#a16207', 1.6);
      const N = [[0, 1], [1, 0], [0, -1], [-1, 0]];
      for (let k = 0; k < 4; k++) {
        const n = [N[k][0] * c + N[k][1] * sn, -N[k][0] * sn + N[k][1] * c];
        if (n[0] + n[1] <= 0.01) continue;
        const A = corner[k], B = corner[(k + 1) % 4], lit = n[1] > n[0];
        const at = (u, z) => P(A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, z);
        const zb = z0 + LEG, hz = (TOP - LEG) / 3;
        quad([at(0, zb), at(1, zb), at(1, z0 + TOP), at(0, z0 + TOP)], lit ? '#eab308' : '#b78a09');
        for (let j = 0; j < 3; j++) for (let s2 = 0; s2 < 2; s2++) {
          const col = p.faces[k][j * 2 + s2], u0 = 0.08 + s2 * 0.43, u1 = u0 + 0.39, za = zb + j * hz + 0.08, zc = zb + (j + 1) * hz - 0.06;
          quad([at(u0, za), at(u1, za), at(u1, zc), at(u0, zc)], lit ? '#1e3a5f' : '#162c48');
          if (col) quad([at(u0 + 0.05, za + 0.03), at(u1 - 0.05, za + 0.03), at(u1 - 0.05, za + (zc - za) * 0.7), at(u0 + 0.05, za + (zc - za) * 0.7)], col + (lit ? 'cc' : '99'));
        }
      }
      quad(corner.map((q) => P(q[0], q[1], z0 + TOP)), '#facc15', '#a16207');
    }
    function drawRobot(r) {
      const led = r.glow > 0 ? '#4ade80' : r.pod ? '#38bdf8' : '#facc15';
      box(r.x + 0.12, r.y + 0.12, r.x + 0.88, r.y + 0.88, 0, 0.32, '#f97316', '#c2560c', '#9a4309', 'rgba(4,7,13,.4)');
      ctx.save(); ctx.shadowColor = led; ctx.shadowBlur = 8;
      quad([P(r.x + 0.12, r.y + 0.88, 0.16), P(r.x + 0.88, r.y + 0.88, 0.16), P(r.x + 0.88, r.y + 0.88, 0.24), P(r.x + 0.12, r.y + 0.88, 0.24)], led);
      ctx.restore();
    }
    function drawOperator(x, y, busy, t) {
      const [px, py] = P(x, y, 0), u = kit.s / 20, reach = busy ? Math.max(0, Math.sin(t * 5)) * 4 * u : 0;
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(px, py, 7 * u, 3 * u, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1c2638'; ctx.fillRect(px - 3.5 * u, py - 16 * u, 7 * u, 16 * u);
      ctx.fillStyle = '#f97316'; ctx.fillRect(px - 5 * u, py - 28 * u, 10 * u, 13 * u);
      ctx.strokeStyle = '#f97316'; ctx.lineWidth = 2.5 * u; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px - 4 * u, py - 25 * u); ctx.lineTo(px - 7 * u - reach, py - 18 * u - reach); ctx.stroke();
      ctx.fillStyle = '#e0ac7e'; ctx.beginPath(); ctx.arc(px, py - 32 * u, 3.6 * u, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(px, py - 33 * u, 4 * u, Math.PI, 0); ctx.fill();
    }

    animate(canvas, kit, (dt) => robots.forEach((r) => step(r, dt)), (t) => {
      drawFloor();
      const items = [];
      for (const p of pods.values()) items.push({ d: p.x + p.y + 1, fn: () => drawPod(p, p.x + 0.5, p.y + 0.5, 0) });
      for (const r of robots) {
        items.push({ d: r.x + r.y + 0.99, fn: () => { drawRobot(r); if (r.pod) drawPod(r.pod, r.x + 0.5, r.y + 0.5, 0.12 + r.lift * 0.15); } });
        items.push({ d: r.s + GD + 1.5, fn: () => drawOperator(r.s + 0.5, GD + 0.55, r.glow > 0, t) });
        if (r.glow > 0) items.push({ d: r.s + GD + 1.4, fn: () => {
          const [gx, gy] = P(r.s + 0.5, GD - 0.1, 1.6), g = ctx.createRadialGradient(gx, gy, 0, gx, gy, kit.s * 1.4);
          g.addColorStop(0, 'rgba(74,222,128,.45)'); g.addColorStop(1, 'rgba(74,222,128,0)');
          ctx.fillStyle = g; ctx.fillRect(gx - kit.s * 1.4, gy - kit.s * 1.4, kit.s * 2.8, kit.s * 2.8);
        } });
      }
      items.sort((a, b) => a.d - b.d).forEach((it) => it.fn());
    });
  }

  /* ---------- shuttle AS/RS preview ---------- */
  // Wireframe racking; a shuttle on every level runs to a tote and back to the
  // aisle front, the lift carries totes down to the conveyor towards a station.
  function shuttlePreview(canvas) {
    const A = 3, B = 8, L = 5, LH = 0.75, Z0 = 0.9, GW = A * 3 + 3, GD = B + 2.4;
    const kit = isoKit(canvas, GW, GD, Z0 + L * LH + 0.8, 0.62), { ctx, P, quad, box } = kit;
    const rand = rng(9), HUES = ['#38bdf8', '#e879f9', '#facc15'];
    const slots = new Map();
    for (let a = 0; a < A; a++) for (let s2 = 0; s2 < 2; s2++) for (let l = 0; l < L; l++) for (let b = 0; b < B - 1; b++) {
      const r = rand(); if (r < 0.7) slots.set([a, s2, l, b].join(), r < 0.08 ? HUES[Math.floor(rand() * 3)] : null);
    }
    const shuttles = [];
    for (let a = 0; a < A; a++) for (let l = 0; l < L; l++) shuttles.push({ a, l, y: B - 0.5, to: B - 0.5, wait: rand() * 3, tote: false });
    const lifts = [...Array(A)].map((_, a) => ({ a, z: 0.4, to: 0.4, wait: a * 0.9, tote: false }));
    const totes = []; // on the conveyor: x position
    const front = B - 0.5, conveyorY = B + 1.4, station = GW - 1.2;
    let glow = 0;
    function step(dt) {
      for (const sh of shuttles) {
        if (sh.wait > 0) { sh.wait -= dt; continue; }
        const d = sh.to - sh.y, m = 3.2 * dt;
        if (Math.abs(d) > m) { sh.y += Math.sign(d) * m; continue; }
        sh.y = sh.to; sh.wait = 0.6 + rand() * 0.6;
        if (sh.to === front) { sh.tote = false; sh.to = 0.5 + Math.floor(rand() * (B - 2)); } else { sh.tote = true; sh.to = front; }
      }
      for (const lf of lifts) {
        if (lf.wait > 0) { lf.wait -= dt; continue; }
        const d = lf.to - lf.z, m = 2.6 * dt;
        if (Math.abs(d) > m) { lf.z += Math.sign(d) * m; continue; }
        lf.z = lf.to; lf.wait = 0.5;
        if (lf.to === 0.4) { if (lf.tote) totes.push(lf.a * 3 + 1.5); lf.tote = false; lf.to = Z0 + Math.floor(rand() * L) * LH; }
        else { lf.tote = true; lf.to = 0.4; }
      }
      for (let k = totes.length - 1; k >= 0; k--) { totes[k] += 1.6 * dt; if (totes[k] >= station) { totes.splice(k, 1); glow = 1.2; } }
      glow = Math.max(0, glow - dt);
    }
    function rack(a, s2) {
      const x0 = a * 3 + s2 * 2, x1 = x0 + 1, fx = s2 ? x0 : x1, top = Z0 + L * LH;
      quad([P(x0, 0, 0), P(x1, 0, 0), P(x1, B, 0), P(x0, B, 0)], 'rgba(56,189,248,.05)');
      for (let l = 0; l < L; l++) {
        const z = Z0 + l * LH;
        for (let b = 0; b < B - 1; b++) {
          if (!slots.has([a, s2, l, b].join())) continue;
          const c = slots.get([a, s2, l, b].join());
          quad([P(fx, b + 0.12, z + 0.05), P(fx, b + 0.88, z + 0.05), P(fx, b + 0.88, z + LH * 0.8), P(fx, b + 0.12, z + LH * 0.8)], c ? c + '44' : 'rgba(30,42,61,.7)', c ? c + 'aa' : 'rgba(56,189,248,.18)');
        }
        quad([P(x1, 0, z), P(x1, B, z)], null, 'rgba(56,189,248,.28)');
      }
      ctx.save(); ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 8;
      for (const [px, py] of [[x0, B], [x1, B], [x1, 0]]) quad([P(px, py, 0), P(px, py, top)], null, 'rgba(125,211,252,.75)', 1.2);
      quad([P(x0, B, top), P(x1, B, top), P(x1, 0, top), P(x0, 0, top)], 'rgba(56,189,248,.06)', 'rgba(125,211,252,.75)', 1.2);
      ctx.restore();
    }
    function drawShuttle(sh) {
      const x = sh.a * 3 + 1, z = Z0 + sh.l * LH, moving = Math.abs(sh.to - sh.y) > 0.01 && sh.wait <= 0;
      box(x + 0.12, sh.y - 0.4, x + 0.88, sh.y + 0.4, z, z + 0.22, '#0f172a', '#facc15', '#b48a0c', 'rgba(250,204,21,.8)');
      if (sh.tote) box(x + 0.2, sh.y - 0.3, x + 0.8, sh.y + 0.3, z + 0.22, z + 0.62, 'rgba(56,189,248,.5)', 'rgba(56,189,248,.35)', 'rgba(56,189,248,.25)', '#38bdf8');
      if (moving) { ctx.save(); ctx.shadowColor = '#facc15'; ctx.shadowBlur = 10; quad([P(x + 0.12, sh.y + 0.4, z + 0.08), P(x + 0.88, sh.y + 0.4, z + 0.08)], null, '#facc15', 2); ctx.restore(); }
    }
    animate(canvas, kit, step, () => {
      // conveyor and station in front
      quad([P(1, conveyorY - 0.25, 0.4), P(station + 0.6, conveyorY - 0.25, 0.4), P(station + 0.6, conveyorY + 0.25, 0.4), P(1, conveyorY + 0.25, 0.4)], 'rgba(56,189,248,.08)', 'rgba(125,211,252,.5)');
      for (let a = 0; a < A; a++) for (let s2 = 0; s2 < 2; s2++) {
        rack(a, s2);
        if (s2 === 0) shuttles.filter((sh) => sh.a === a).forEach(drawShuttle);
      }
      for (const lf of lifts) {
        const x = lf.a * 3 + 1, top = Z0 + L * LH + 0.4;
        for (const px of [x + 0.1, x + 0.9]) quad([P(px, B + 0.1, 0), P(px, B + 0.1, top)], null, 'rgba(232,121,249,.8)', 1.4);
        box(x + 0.1, B + 0.1, x + 0.9, B + 0.9, lf.z, lf.z + 0.12, 'rgba(232,121,249,.5)', 'rgba(232,121,249,.35)', 'rgba(232,121,249,.25)', '#e879f9');
        if (lf.tote) box(x + 0.2, B + 0.2, x + 0.8, B + 0.8, lf.z + 0.12, lf.z + 0.52, 'rgba(56,189,248,.5)', 'rgba(56,189,248,.35)', 'rgba(56,189,248,.25)', '#38bdf8');
      }
      for (const x of totes) box(x - 0.3, conveyorY - 0.22, x + 0.3, conveyorY + 0.22, 0.4, 0.8, 'rgba(56,189,248,.5)', 'rgba(56,189,248,.35)', 'rgba(56,189,248,.25)', '#38bdf8');
      box(station, conveyorY - 0.6, station + 0.9, conveyorY + 0.6, 0, 0.9, glow ? 'rgba(74,222,128,.55)' : 'rgba(74,222,128,.15)', 'rgba(74,222,128,.25)', 'rgba(74,222,128,.15)', '#4ade80');
    });
  }

  const previews = { cube: cubePreview, pod: podPreview, shuttle: shuttlePreview };
  for (const c of document.querySelectorAll('canvas[data-preview]')) previews[c.dataset.preview](c);
})((globalThis.WS = globalThis.WS || {}));
