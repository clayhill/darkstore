/* Landing page: an animated isometric preview of each simulation type. The
 * previews are decorative and do not run the simulator. */
(function (WS) {
  'use strict';

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // A small worker in a hi-vis vest and hard hat, at screen point (px, py),
  // u pixels per unit, an arm reaching out by reach. Person k gets their own
  // look: woman or man, skin and hair (long hair or a ponytail, a beard).
  const SKIN = ['#f3cfb3', '#e0ac7e', '#c68c5e', '#a0693f', '#6f4a2e'], HAIR = ['#1c140f', '#3b2a20', '#5a3a22', '#8a5a2b', '#c9a15a', '#9a3f1c'];
  function person(ctx, px, py, u, vest, reach, k) {
    const h = Math.imul(k + 7, 2654435761) >>> 0, female = (h >>> 3) & 1, skin = SKIN[(h >>> 5) % 5], hair = HAIR[(h >>> 9) % 6], sw = female ? 4.3 : 5;
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(px, py, 7 * u, 3 * u, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c2638'; ctx.fillRect(px - 3.4 * u, py - 16 * u, 3.1 * u, 15 * u); ctx.fillRect(px + 0.3 * u, py - 16 * u, 3.1 * u, 15 * u);
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(px - 3.8 * u, py - 1.6 * u, 3.6 * u, 1.6 * u); ctx.fillRect(px + 0.2 * u, py - 1.6 * u, 3.6 * u, 1.6 * u);
    ctx.fillStyle = vest; ctx.beginPath(); ctx.moveTo(px - sw * u, py - 28 * u); ctx.lineTo(px + sw * u, py - 28 * u); ctx.lineTo(px + 4 * u, py - 15 * u); ctx.lineTo(px - 4 * u, py - 15 * u); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(232,238,245,.9)'; ctx.fillRect(px - 4.2 * u, py - 21 * u, 8.4 * u, 1.3 * u);
    ctx.strokeStyle = vest; ctx.lineWidth = 2.4 * u; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px - (sw - 1) * u, py - 25 * u); ctx.lineTo(px - (sw + 2) * u - reach, py - 18 * u - reach); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + (sw - 1) * u, py - 25 * u); ctx.lineTo(px + (sw + 1) * u, py - 17 * u); ctx.stroke();
    ctx.fillStyle = hair;
    if (female) { if ((h >>> 13) & 1) ctx.fillRect(px - 3.8 * u, py - 33 * u, 7.6 * u, 7.5 * u); else { ctx.beginPath(); ctx.ellipse(px + 3.6 * u, py - 30 * u, 1.3 * u, 3 * u, -0.3, 0, Math.PI * 2); ctx.fill(); } }
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(px, py - 31.5 * u, 3.3 * u, 3.7 * u, 0, 0, Math.PI * 2); ctx.fill();
    if (!female && (h >>> 13) % 3 === 0) { ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(px, py - 30 * u, 3 * u, 2 * u, 0, 0, Math.PI); ctx.fill(); }
    ctx.fillStyle = '#eab308'; ctx.beginPath(); ctx.ellipse(px, py - 33.6 * u, 4.8 * u, 1.3 * u, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.ellipse(px, py - 34 * u, 3.9 * u, 4 * u, 0, Math.PI, 0); ctx.fill();
  }

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
  // Runs step/draw every frame while the canvas is on screen, or draws one
  // still frame for reduced motion.
  function animate(canvas, kit, step, draw) {
    let last = 0, t = 0, shown = false, raf = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now; t += dt;
      step(dt);
      kit.ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      draw(t);
      raf = shown ? requestAnimationFrame(frame) : 0;
    };
    kit.resize();
    addEventListener('resize', () => { kit.resize(); if (!raf) draw(t); });
    if (reduced) {
      // run the robots for a moment off-screen, then show one still frame
      for (let i = 0; i < 90; i++) { t += 0.05; step(0.05); }
      draw(t);
    } else new IntersectionObserver(([e]) => {
      shown = e.isIntersecting;
      if (shown && !raf) raf = requestAnimationFrame(frame);
    }).observe(canvas);
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
      person(ctx, px, py, u, '#f97316', reach, Math.round(x * 3));
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

  /* ---------- pallet shuttle preview ---------- */
  // One block of deep lanes on both sides of a transfer aisle. On every level
  // a carrier drives to a lane, its satellite dives in under the pallets and
  // comes back with the front one; at the front the lift takes it down to the
  // conveyor and on to a station.
  function palletPreview(canvas) {
    const B = 6, L = 4, LH = 1.0, Z0 = 0.3, DN = 4, AX = DN, GW = 2 * DN + 4, GD = B + 2.6, TOP = Z0 + L * LH;
    const kit = isoKit(canvas, GW, GD, TOP + 0.8, 0.62), { ctx, P, quad, box } = kit;
    const rand = rng(17), HUES = ['#38bdf8', '#e879f9', '#facc15'], lanes = new Map();
    for (let s2 = 0; s2 < 2; s2++) for (let l = 0; l < L; l++) for (let b = 0; b < B - 1; b++) {
      const n = Math.floor(rand() * (DN + 1)), hue = rand() < 0.15 ? HUES[Math.floor(rand() * 3)] : null;
      lanes.set([s2, l, b].join(), { n, hue });
    }
    const front = B - 0.5, conveyorY = B + 1.5, station = GW - 0.8;
    const carriers = [...Array(L)].map((_, l) => ({ l, y: front, to: front, sat: 0, satTo: 0, side: 0, wait: rand() * 3, load: false, phase: 'idle', lane: null }));
    const lift = { z: 0.4, to: 0.4, wait: 0.5, load: false, queue: [] }, pallets = [];
    let glow = 0;
    const slotX = (s2, d) => (s2 ? AX + 1 + d + 0.5 : AX - d - 0.5);
    function step(dt) {
      for (const c of carriers) {
        if (c.wait > 0) { c.wait -= dt; continue; }
        if (Math.abs(c.to - c.y) > 1e-3) { const m = 2.4 * dt; c.y = Math.abs(c.to - c.y) > m ? c.y + Math.sign(c.to - c.y) * m : c.to; continue; }
        if (Math.abs(c.satTo - c.sat) > 1e-3) { const m = 1.8 * dt; c.sat = Math.abs(c.satTo - c.sat) > m ? c.sat + Math.sign(c.satTo - c.sat) * m : c.satTo; continue; }
        if (c.phase === 'idle') {
          // a lane with pallets on this level
          const opts = [...lanes.entries()].filter(([k, v]) => v.n && k.split(',')[1] === String(c.l));
          if (!opts.length) { c.wait = 1; continue; }
          const [k, v] = opts[Math.floor(rand() * opts.length)], [s2, , b] = k.split(',').map(Number);
          Object.assign(c, { lane: v, side: s2, to: b + 0.5, phase: 'in' });
        } else if (c.phase === 'in') { c.satTo = DN - c.lane.n + 0.5; c.phase = 'take'; }
        else if (c.phase === 'take') { c.lane.n--; c.load = true; c.hue = c.lane.hue; c.satTo = 0; c.wait = 0.5; c.phase = 'home'; }
        else if (c.phase === 'home') { c.to = front; c.phase = 'hand'; }
        else if (c.phase === 'hand') { if (lift.queue.length < 2) { lift.queue.push({ l: c.l, hue: c.hue }); c.load = false; c.phase = 'back'; c.wait = 0.6; } else c.wait = 0.5; }
        else { c.lane.n = Math.min(DN, c.lane.n + 1); c.phase = 'idle'; c.wait = 0.4 + rand(); } // a returning pallet goes back in front
      }
      if (lift.wait > 0) lift.wait -= dt;
      else if (Math.abs(lift.to - lift.z) > 1e-3) { const m = 2.2 * dt; lift.z = Math.abs(lift.to - lift.z) > m ? lift.z + Math.sign(lift.to - lift.z) * m : lift.to; }
      else if (lift.load && lift.to === 0.4) { pallets.push({ x: AX + 0.5, hue: lift.hue }); lift.load = false; lift.wait = 0.6; }
      else if (lift.load) lift.to = 0.4;
      else if (lift.cur && lift.to !== 0.4) { lift.load = true; lift.hue = lift.cur.hue; lift.cur = null; lift.wait = 0.6; }
      else if (lift.queue.length && !lift.cur) { lift.cur = lift.queue.shift(); lift.to = Z0 + lift.cur.l * LH; }
      for (let k = pallets.length - 1; k >= 0; k--) { pallets[k].x += 1.3 * dt; if (pallets[k].x >= station) { pallets.splice(k, 1); glow = 1.2; } }
      glow = Math.max(0, glow - dt);
    }
    const pallet = (x, y, z, hue, w = 0.42, d = 0.36) => {
      box(x - w, y - d, x + w, y + d, z, z + 0.1, '#8a6a42', '#6b4f2e', '#5a4126');
      box(x - w + 0.03, y - d + 0.03, x + w - 0.03, y + d - 0.03, z + 0.1, z + 0.68, hue ? hue + '66' : 'rgba(30,42,61,.75)', hue ? hue + '44' : 'rgba(30,42,61,.6)', hue ? hue + '33' : 'rgba(30,42,61,.5)', hue ? hue + 'cc' : 'rgba(56,189,248,.25)');
    };
    function side(s2) {
      const x0 = s2 ? AX + 1 : 0, x1 = x0 + DN;
      quad([P(x0, 0, 0), P(x1, 0, 0), P(x1, B - 1, 0), P(x0, B - 1, 0)], 'rgba(56,189,248,.05)');
      for (let l = 0; l < L; l++) {
        const z = Z0 + l * LH;
        for (let b = 0; b < B - 1; b++) {
          const v = lanes.get([s2, l, b].join());
          for (let k = 0; k < v.n; k++) pallet(slotX(s2, DN - 1 - k), b + 0.5, z, v.hue);
        }
        quad([P(s2 ? x0 : x1, 0, z), P(s2 ? x0 : x1, B - 1, z)], null, 'rgba(56,189,248,.3)');
      }
      ctx.save(); ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 8;
      for (const [px, py] of [[x0, B - 1], [x1, B - 1], [s2 ? x1 : x0, 0]]) quad([P(px, py, 0), P(px, py, TOP)], null, 'rgba(125,211,252,.75)', 1.2);
      quad([P(x0, B - 1, TOP), P(x1, B - 1, TOP), P(x1, 0, TOP), P(x0, 0, TOP)], 'rgba(56,189,248,.06)', 'rgba(125,211,252,.75)', 1.2);
      ctx.restore();
    }
    function drawCarrier(c) {
      const z = Z0 + c.l * LH, cx = AX + 0.5, sx = cx + (c.side ? 1 : -1) * c.sat;
      box(cx - 0.45, c.y - 0.42, cx + 0.45, c.y + 0.42, z - 0.2, z, '#0f172a', '#f97316', '#b45309', 'rgba(249,115,22,.8)');
      box(sx - 0.35, c.y - 0.26, sx + 0.35, c.y + 0.26, z, z + 0.08, '#facc15', '#ca8a04', '#a16207');
      if (c.load) pallet(sx, c.y, z + 0.1, c.hue);
    }
    animate(canvas, kit, step, () => {
      quad([P(AX + 0.1, conveyorY - 0.4, 0.4), P(station + 0.6, conveyorY - 0.4, 0.4), P(station + 0.6, conveyorY + 0.4, 0.4), P(AX + 0.1, conveyorY + 0.4, 0.4)], 'rgba(56,189,248,.08)', 'rgba(125,211,252,.5)');
      quad([P(AX + 0.1, B - 0.9, 0.4), P(AX + 0.9, B - 0.9, 0.4), P(AX + 0.9, conveyorY - 0.4, 0.4), P(AX + 0.1, conveyorY - 0.4, 0.4)], 'rgba(56,189,248,.08)', 'rgba(125,211,252,.5)');
      side(0);
      carriers.forEach(drawCarrier);
      side(1);
      const lx = AX + 0.5;
      for (const px of [lx - 0.45, lx + 0.45]) quad([P(px, B - 0.5, 0), P(px, B - 0.5, TOP + 0.4)], null, 'rgba(232,121,249,.8)', 1.4);
      box(lx - 0.5, B - 0.95, lx + 0.5, B - 0.05, lift.z, lift.z + 0.1, 'rgba(232,121,249,.5)', 'rgba(232,121,249,.35)', 'rgba(232,121,249,.25)', '#e879f9');
      if (lift.load) pallet(lx, B - 0.5, lift.z + 0.1, lift.hue);
      for (const p of pallets) pallet(p.x, conveyorY, 0.4, p.hue, 0.36, 0.42);
      box(station, conveyorY - 0.7, station + 1, conveyorY + 0.7, 0, 0.9, glow ? 'rgba(74,222,128,.55)' : 'rgba(74,222,128,.15)', 'rgba(74,222,128,.25)', 'rgba(74,222,128,.15)', '#4ade80');
    });
  }

  // See-through racking for the crane and ACR previews: A aisles of B bays and
  // L levels with totes on both sides (a few lit up, `fill` of the positions
  // used); rack(a, side) draws one side of an aisle.
  function racking(kit, A, B, L, LH, Z0, rand, fill) {
    const { ctx, P, quad } = kit, TOP = Z0 + L * LH, HUES = ['#38bdf8', '#e879f9', '#facc15'], slots = new Map();
    for (let a = 0; a < A; a++) for (let s2 = 0; s2 < 2; s2++) for (let l = 0; l < L; l++) for (let b = 0; b < B; b++) {
      const r = rand(); if (r < fill) slots.set([a, s2, l, b].join(), r < 0.08 ? HUES[Math.floor(rand() * 3)] : null);
    }
    return function rack(a, s2) {
      const x0 = a * 3 + s2 * 2, x1 = x0 + 1, fx = s2 ? x0 : x1;
      quad([P(x0, 0, 0), P(x1, 0, 0), P(x1, B, 0), P(x0, B, 0)], 'rgba(56,189,248,.05)');
      for (let l = 0; l < L; l++) {
        const z = Z0 + l * LH;
        for (let b = 0; b < B; b++) {
          if (!slots.has([a, s2, l, b].join())) continue;
          const c = slots.get([a, s2, l, b].join());
          quad([P(fx, b + 0.12, z + 0.05), P(fx, b + 0.88, z + 0.05), P(fx, b + 0.88, z + LH * 0.8), P(fx, b + 0.12, z + LH * 0.8)], c ? c + '44' : 'rgba(30,42,61,.7)', c ? c + 'aa' : 'rgba(56,189,248,.18)');
        }
        quad([P(x1, 0, z), P(x1, B, z)], null, 'rgba(56,189,248,.28)');
      }
      ctx.save(); ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 8;
      for (const [px, py] of [[x0, B], [x1, B], [x1, 0]]) quad([P(px, py, 0), P(px, py, TOP)], null, 'rgba(125,211,252,.75)', 1.2);
      quad([P(x0, B, TOP), P(x1, B, TOP), P(x1, 0, TOP), P(x0, 0, TOP)], 'rgba(56,189,248,.06)', 'rgba(125,211,252,.75)', 1.2);
      ctx.restore();
    };
  }

  // High racking with a stacker crane in each aisle: the mast drives along the
  // aisle while the carriage climbs, fetches a tote and brings it to the
  // conveyor at the front.
  function cranePreview(canvas) {
    const A = 3, B = 9, L = 7, LH = 0.62, Z0 = 0.2, TOP = Z0 + L * LH, GW = A * 3 + 3, GD = B + 2.4;
    const kit = isoKit(canvas, GW, GD, TOP + 0.6, 0.62), { ctx, P, quad, box } = kit;
    const rand = rng(21), rack = racking(kit, A, B, L, LH, Z0, rand, 0.72);
    const io = { y: B + 0.5, z: 0.4 };
    const cranes = [...Array(A)].map((_, a) => ({ a, y: io.y, z: io.z, ty: io.y, tz: io.z, wait: a * 1.1, tote: false }));
    const totes = [], conveyorY = B + 1.4, station = GW - 1.2;
    let glow = 0;
    function step(dt) {
      for (const cr of cranes) {
        if (cr.wait > 0) { cr.wait -= dt; continue; }
        const dy = cr.ty - cr.y, dz = cr.tz - cr.z, my = 3.6 * dt, mz = 1.8 * dt;
        cr.y = Math.abs(dy) > my ? cr.y + Math.sign(dy) * my : cr.ty;
        cr.z = Math.abs(dz) > mz ? cr.z + Math.sign(dz) * mz : cr.tz;
        if (cr.y !== cr.ty || cr.z !== cr.tz) continue;
        cr.wait = 0.7;
        if (cr.ty === io.y) {
          if (cr.tote) totes.push(cr.a * 3 + 1.5);
          cr.tote = false; cr.ty = 0.5 + Math.floor(rand() * B); cr.tz = Z0 + Math.floor(rand() * L) * LH;
        } else { cr.tote = true; cr.ty = io.y; cr.tz = io.z; }
      }
      for (let k = totes.length - 1; k >= 0; k--) { totes[k] += 1.6 * dt; if (totes[k] >= station) { totes.splice(k, 1); glow = 1.2; } }
      glow = Math.max(0, glow - dt);
    }
    function drawCrane(cr) {
      const x = cr.a * 3 + 1.5, moving = cr.wait <= 0 && (cr.y !== cr.ty || cr.z !== cr.tz);
      quad([P(x, 0, 0.02), P(x, B + 1, 0.02)], null, 'rgba(250,204,21,.5)', 1.2);
      ctx.save(); if (moving) { ctx.shadowColor = '#facc15'; ctx.shadowBlur = 10; }
      quad([P(x, cr.y - 0.4, 0), P(x, cr.y - 0.4, TOP + 0.3)], null, '#facc15', 2.2);
      ctx.restore();
      box(x - 0.3, cr.y - 0.5, x + 0.3, cr.y + 0.5, 0, 0.2, '#0f172a', '#facc15', '#b48a0c', 'rgba(250,204,21,.8)');
      box(x - 0.4, cr.y - 0.35, x + 0.4, cr.y + 0.45, cr.z, cr.z + 0.1, 'rgba(232,121,249,.5)', 'rgba(232,121,249,.35)', 'rgba(232,121,249,.25)', '#e879f9');
      if (cr.tote) box(x - 0.3, cr.y - 0.25, x + 0.3, cr.y + 0.35, cr.z + 0.1, cr.z + 0.5, 'rgba(56,189,248,.5)', 'rgba(56,189,248,.35)', 'rgba(56,189,248,.25)', '#38bdf8');
    }
    animate(canvas, kit, step, () => {
      quad([P(1, conveyorY - 0.25, 0.4), P(station + 0.6, conveyorY - 0.25, 0.4), P(station + 0.6, conveyorY + 0.25, 0.4), P(1, conveyorY + 0.25, 0.4)], 'rgba(56,189,248,.08)', 'rgba(125,211,252,.5)');
      for (let a = 0; a < A; a++) { rack(a, 0); drawCrane(cranes[a]); rack(a, 1); }
      for (const x of totes) box(x - 0.3, conveyorY - 0.22, x + 0.3, conveyorY + 0.22, 0.4, 0.8, 'rgba(56,189,248,.5)', 'rgba(56,189,248,.35)', 'rgba(56,189,248,.25)', '#38bdf8');
      box(station, conveyorY - 0.6, station + 0.9, conveyorY + 0.6, 0, 0.9, glow ? 'rgba(74,222,128,.55)' : 'rgba(74,222,128,.15)', 'rgba(74,222,128,.25)', 'rgba(74,222,128,.15)', '#4ade80');
    });
  }

  // Shelving aisles with case-handling robots: a robot drives into an aisle,
  // stops, runs its handler up the mast for a tote, collects a few on its back
  // shelves and brings them to the station at the front.
  function acrPreview(canvas) {
    const A = 4, B = 8, L = 6, LH = 0.62, Z0 = 0.3, TOP = Z0 + L * LH, GW = A * 3 + 2, GD = B + 3.2, FY = B + 0.9, ST = { x: GW - 1.4, y: B + 2.4 };
    const kit = isoKit(canvas, GW, GD, TOP + 0.8, 0.62), { ctx, P, quad, box } = kit;
    const rand = rng(33), rack = racking(kit, A, B, L, LH, Z0, rand, 0.7);
    // each robot follows a list of waypoints; at a stop the handler goes up and back
    const bots = [...Array(3)].map((_, k) => ({ x: ST.x - 1 - k * 1.2, y: FY, z: 0.3, path: [], stop: null, wait: k * 1.5, load: 0 }));
    function plan(bot) {
      const a = Math.floor(rand() * A), lx = a * 3 + 1.5, stops = 1 + Math.floor(rand() * 2);
      bot.path = [{ x: lx, y: FY }];
      let b = B - 1;
      for (let k = 0; k < stops; k++) { b = Math.max(0, b - 1 - Math.floor(rand() * 3)); bot.path.push({ x: lx, y: b + 0.5, stop: Z0 + Math.floor(rand() * L) * LH + 0.1 }); }
      bot.path.push({ x: lx, y: FY }, { x: ST.x, y: FY }, { x: ST.x, y: ST.y - 0.6, drop: true });
    }
    let glow = 0;
    function step(dt) {
      for (const bot of bots) {
        if (bot.wait > 0) { bot.wait -= dt; continue; }
        if (bot.stop) {
          const s = bot.stop, mz = 1.4 * dt;
          if (s.up) { bot.z = Math.min(s.h, bot.z + mz); if (bot.z === s.h) { s.up = false; s.hold = 0.6; } }
          else if (s.hold > 0) { s.hold -= dt; if (s.hold <= 0) bot.load++; }
          else { bot.z = Math.max(0.3, bot.z - mz); if (bot.z === 0.3) bot.stop = null; }
          continue;
        }
        if (!bot.path.length) { plan(bot); continue; }
        const w = bot.path[0], dx = w.x - bot.x, dy = w.y - bot.y, m = 2.4 * dt;
        if (Math.abs(dx) > 1e-3) bot.x = Math.abs(dx) > m ? bot.x + Math.sign(dx) * m : w.x;
        else if (Math.abs(dy) > 1e-3) bot.y = Math.abs(dy) > m ? bot.y + Math.sign(dy) * m : w.y;
        else {
          bot.path.shift();
          if (w.stop) bot.stop = { h: w.stop, up: true };
          if (w.drop) { bot.load = 0; bot.wait = 1; glow = 1.2; bot.path.push({ x: ST.x, y: FY }); }
        }
      }
      glow = Math.max(0, glow - dt);
    }
    function drawBot(bot) {
      const { x, y } = bot, H = TOP + 0.3, moving = bot.wait <= 0 && !bot.stop && bot.path.length;
      box(x - 0.38, y - 0.38, x + 0.38, y + 0.38, 0, 0.22, '#0f172a', '#f97316', '#b4500c', 'rgba(249,115,22,.8)');
      ctx.save(); if (moving || bot.stop) { ctx.shadowColor = '#f97316'; ctx.shadowBlur = 10; }
      for (const [px, py] of [[x - 0.28, y + 0.28], [x + 0.28, y + 0.28], [x + 0.28, y - 0.28]]) quad([P(px, py, 0.22), P(px, py, H)], null, '#fdba74', 1.4);
      ctx.restore();
      for (let k = 0; k < 4; k++) {
        const z = 0.7 + k * (H - 1.2) / 3;
        quad([P(x - 0.28, y - 0.28, z), P(x + 0.28, y - 0.28, z), P(x + 0.28, y + 0.28, z), P(x - 0.28, y + 0.28, z)], 'rgba(249,115,22,.08)', 'rgba(253,186,116,.5)');
        if (k < bot.load) box(x - 0.22, y - 0.22, x + 0.22, y + 0.22, z, z + 0.32, 'rgba(56,189,248,.5)', 'rgba(56,189,248,.35)', 'rgba(56,189,248,.25)', '#38bdf8');
      }
      box(x - 0.35, y - 0.3, x + 0.35 + (bot.stop && !bot.stop.up && bot.stop.hold > 0 ? 0.5 : 0), y + 0.3, bot.z, bot.z + 0.08, 'rgba(232,121,249,.5)', 'rgba(232,121,249,.35)', 'rgba(232,121,249,.25)', '#e879f9');
    }
    animate(canvas, kit, step, () => {
      quad([P(0, B + 0.3, 0), P(GW, B + 0.3, 0), P(GW, B + 1.5, 0), P(0, B + 1.5, 0)], 'rgba(250,204,21,.04)', 'rgba(250,204,21,.25)');
      box(ST.x - 0.6, ST.y, ST.x + 0.6, ST.y + 0.9, 0, 0.9, glow ? 'rgba(74,222,128,.55)' : 'rgba(74,222,128,.15)', 'rgba(74,222,128,.25)', 'rgba(74,222,128,.15)', '#4ade80');
      // painter's order: racks and robots from the back
      const items = [];
      for (let a = 0; a < A; a++) { items.push({ d: a * 3, fn: () => rack(a, 0) }); items.push({ d: a * 3 + 2.4, fn: () => rack(a, 1) }); }
      for (const bot of bots) items.push({ d: bot.y > B ? 100 + bot.x : bot.x - 0.5 + 1, fn: () => drawBot(bot) });
      items.sort((p, q) => p.d - q.d).forEach((it) => it.fn());
    });
  }

  /* ---------- climbing robots preview ---------- */
  // Tall racking; robots drive into an aisle, climb straight up the rack to
  // a tote, climb down with it and bring it to the station themselves.
  function climbPreview(canvas) {
    const A = 4, B = 8, L = 9, LH = 0.5, Z0 = 0.3, TOP = Z0 + L * LH, GW = A * 3 + 2, GD = B + 3.2, FY = B + 0.9, ST = { x: GW - 1.4, y: B + 2.4 };
    const kit = isoKit(canvas, GW, GD, TOP + 0.8, 0.62), { ctx, P, quad, box } = kit;
    const rand = rng(41), rack = racking(kit, A, B, L, LH, Z0, rand, 0.72);
    const bots = [...Array(4)].map((_, k) => ({ x: ST.x - 1 - k * 1.2, y: FY, z: 0, path: [], climb: null, wait: k * 1.1, load: false }));
    function plan(bot) {
      const a = Math.floor(rand() * A), lx = a * 3 + 1.5, b = Math.floor(rand() * (B - 1));
      bot.path = [{ x: lx, y: FY }, { x: lx, y: b + 0.5, climb: Z0 + Math.floor(rand() * L) * LH }, { x: lx, y: FY }, { x: ST.x, y: FY }, { x: ST.x, y: ST.y - 0.6, drop: true }];
    }
    let glow = 0;
    function step(dt) {
      for (const bot of bots) {
        if (bot.wait > 0) { bot.wait -= dt; continue; }
        if (bot.climb) {
          const c = bot.climb, mz = 1.6 * dt;
          if (c.up) { bot.z = Math.min(c.h, bot.z + mz); if (bot.z === c.h) { c.up = false; c.hold = 0.7; } }
          else if (c.hold > 0) { c.hold -= dt; if (c.hold <= 0) bot.load = true; }
          else { bot.z = Math.max(0, bot.z - mz); if (bot.z === 0) bot.climb = null; }
          continue;
        }
        if (!bot.path.length) { plan(bot); continue; }
        const w = bot.path[0], dx = w.x - bot.x, dy = w.y - bot.y, m = 3 * dt;
        if (Math.abs(dx) > 1e-3) bot.x = Math.abs(dx) > m ? bot.x + Math.sign(dx) * m : w.x;
        else if (Math.abs(dy) > 1e-3) bot.y = Math.abs(dy) > m ? bot.y + Math.sign(dy) * m : w.y;
        else {
          bot.path.shift();
          if (w.climb) bot.climb = { h: w.climb, up: true };
          if (w.drop) { bot.load = false; bot.wait = 1; glow = 1.2; bot.path.push({ x: ST.x, y: FY }); }
        }
      }
      glow = Math.max(0, glow - dt);
    }
    function drawBot(bot) {
      const { x, y, z } = bot, up = !!bot.climb, H = 0.62;
      if (z > 0.05) quad([P(x - 0.3, y - 0.3, 0), P(x + 0.3, y - 0.3, 0), P(x + 0.3, y + 0.3, 0), P(x - 0.3, y + 0.3, 0)], 'rgba(0,0,0,.35)');
      box(x - 0.38, y - 0.36, x + 0.38, y + 0.36, z, z + 0.18, '#0f172a', '#1f2937', '#111827', 'rgba(103,232,249,.6)');
      ctx.save(); if (up || (bot.wait <= 0 && bot.path.length)) { ctx.shadowColor = up ? '#e879f9' : '#22d3ee'; ctx.shadowBlur = 10; }
      for (const px of [x - 0.36, x + 0.36]) quad([P(px, y + 0.3, z + 0.18), P(px, y + 0.3, z + H)], null, up ? '#f0abfc' : '#a5f3fc', 1.6);
      ctx.restore();
      if (bot.load) box(x - 0.24, y - 0.22, x + 0.24, y + 0.22, z + 0.2, z + 0.5, 'rgba(56,189,248,.55)', 'rgba(56,189,248,.4)', 'rgba(56,189,248,.3)', '#38bdf8');
      box(x - 0.38, y - 0.36, x + 0.38, y + 0.36, z + H, z + H + 0.07, 'rgba(34,211,238,.6)', 'rgba(34,211,238,.4)', 'rgba(34,211,238,.3)', '#22d3ee');
    }
    animate(canvas, kit, step, () => {
      quad([P(0, B + 0.3, 0), P(GW, B + 0.3, 0), P(GW, B + 1.5, 0), P(0, B + 1.5, 0)], 'rgba(250,204,21,.04)', 'rgba(250,204,21,.25)');
      box(ST.x - 0.6, ST.y, ST.x + 0.6, ST.y + 0.9, 0, 0.9, glow ? 'rgba(74,222,128,.55)' : 'rgba(74,222,128,.15)', 'rgba(74,222,128,.25)', 'rgba(74,222,128,.15)', '#4ade80');
      const items = [];
      for (let a = 0; a < A; a++) { items.push({ d: a * 3, fn: () => rack(a, 0) }); items.push({ d: a * 3 + 2.4, fn: () => rack(a, 1) }); }
      for (const bot of bots) items.push({ d: bot.y > B ? 100 + bot.x : bot.x + 0.5, fn: () => drawBot(bot) });
      items.sort((p, q) => p.d - q.d).forEach((it) => it.fn());
    });
  }

  /* ---------- robots alongside pickers preview ---------- */
  // Ordinary shelving; in each aisle a robot drives from stop to stop with its
  // order totes and the aisle's picker walks over to pick into them.
  function amrPreview(canvas) {
    const A = 3, B = 6, GW = A * 4, GD = B + 3, TOP = 2.2;
    const kit = isoKit(canvas, GW, GD, TOP + 1.2, 0.62), { ctx, P, quad, box } = kit;
    const rand = rng(17), HUES = ['#38bdf8', '#e879f9', '#4ade80', '#fb923c', '#a78bfa', '#f87171', '#facc15'];
    const shelves = [];
    for (let a = 0; a < A; a++) for (const x of [a * 4, a * 4 + 3]) for (let y = 1; y <= B; y++) shelves.push({ x, y, goods: [0, 1, 2].map(() => (rand() < 0.75 ? HUES[Math.floor(rand() * HUES.length)] : null)) });
    // per aisle one robot and one picker; the robot stops beside a shelf, the picker comes and picks
    const crews = [...Array(A)].map((_, a) => ({ a, rx: a * 4 + 1.5, ry: B + 1.6, ty: null, wait: a * 0.9, px: a * 4 + 2.5, py: B + 1.2, pick: 0, totes: 1 + (a % 3) }));
    function step(dt) {
      for (const c of crews) {
        if (c.wait > 0) { c.wait -= dt; continue; }
        if (c.ty == null) { c.ty = 1.5 + Math.floor(rand() * B); c.side = rand() < 0.5 ? 0 : 1; }
        const lane = c.a * 4 + 1.5 + c.side, m = 2.2 * dt;
        if (Math.abs(c.rx - lane) > 1e-3 && Math.abs(c.ry - (B + 1.6)) < 0.05) c.rx += Math.max(-m, Math.min(m, lane - c.rx));
        else if (Math.abs(c.ry - c.ty) > 1e-3) c.ry += Math.max(-m, Math.min(m, c.ty - c.ry));
        else if (Math.abs(c.rx - lane) > 1e-3) c.rx += Math.max(-m, Math.min(m, lane - c.rx));
        // the picker walks to the robot's stop and picks once both are there
        const sx = lane + (c.side ? 0.25 : -0.25), sy = c.ty + 0.55, d = Math.hypot(sx - c.px, sy - c.py), w = 1.4 * dt;
        if (d > w) { c.px += ((sx - c.px) / d) * w; c.py += ((sy - c.py) / d) * w; } else { c.px = sx; c.py = sy; }
        if (d <= w && Math.abs(c.ry - c.ty) < 1e-3 && Math.abs(c.rx - lane) < 1e-3) {
          c.pick += dt;
          if (c.pick > 1.6) { c.pick = 0; c.ty = null; c.wait = 0.3; c.totes = c.totes % 4 + 1; }
        }
      }
    }
    function drawShelf(sh) {
      const { x, y } = sh;
      for (let k = 0; k < 3; k++) {
        const z = 0.15 + k * 0.7;
        box(x + 0.05, y + 0.04, x + 0.95, y + 0.96, z - 0.06, z, 'rgba(203,213,225,.35)', 'rgba(249,115,22,.55)', 'rgba(249,115,22,.4)');
        if (sh.goods[k]) box(x + 0.2, y + 0.15, x + 0.8, y + 0.85, z, z + 0.4, sh.goods[k] + 'aa', sh.goods[k] + '88', sh.goods[k] + '66');
      }
      box(x + 0.05, y + 0.04, x + 0.95, y + 0.96, TOP - 0.06, TOP, 'rgba(203,213,225,.3)', 'rgba(29,78,216,.6)', 'rgba(29,78,216,.45)');
      for (const [px, py] of [[x + 0.05, y + 0.96], [x + 0.95, y + 0.96], [x + 0.95, y + 0.04]]) quad([P(px, py, 0), P(px, py, TOP)], null, '#3b82f6', 1.4);
    }
    function drawRobot(c, t) {
      const x = c.rx, y = c.ry, waiting = c.pick > 0 || (Math.abs(c.ry - (c.ty ?? -9)) < 1e-3);
      box(x - 0.32, y - 0.32, x + 0.32, y + 0.32, 0, 0.3, '#e2e8f0', '#cbd5e1', '#94a3b8', 'rgba(4,7,13,.4)');
      for (let k = 0; k < c.totes; k++) { const tz = 0.32 + Math.floor(k / 2) * 0.45, tx = x - 0.15 + (k % 2) * 0.3; box(tx - 0.12, y - 0.16, tx + 0.12, y + 0.16, tz, tz + 0.3, 'rgba(37,99,235,.9)', '#1d4ed8', '#1e3a8a'); }
      quad([P(x, y - 0.28, 0.3), P(x, y - 0.28, 1.6)], null, '#64748b', 1.6);
      ctx.save(); if (waiting) { ctx.shadowColor = '#2dd4bf'; ctx.shadowBlur = 10; }
      quad([P(x - 0.2, y - 0.27, 1.5), P(x + 0.2, y - 0.27, 1.5), P(x + 0.2, y - 0.27, 1.9), P(x - 0.2, y - 0.27, 1.9)], waiting ? '#14b8a6' : '#0c4a6e', '#0f172a');
      ctx.restore();
    }
    function drawPicker(c, t) {
      const [px, py] = P(c.px, c.py, 0), u = kit.s / 22, reach = c.pick > 0 ? Math.max(0, Math.sin(t * 6)) * 4 * u : 0;
      person(ctx, px, py, u, '#a3e635', reach, crews.indexOf(c) + 20);
    }
    animate(canvas, kit, step, (t) => {
      quad([P(0, 0, 0), P(GW, 0, 0), P(GW, GD, 0), P(0, GD, 0)], '#0b1424', 'rgba(125,211,252,.5)', 1.2);
      for (let a = 0; a < A; a++) quad([P(a * 4 + 1, 1, 0), P(a * 4 + 3, 1, 0), P(a * 4 + 3, B + 1, 0), P(a * 4 + 1, B + 1, 0)], 'rgba(56,189,248,.06)', 'rgba(202,138,4,.35)');
      const items = shelves.map((sh) => ({ d: sh.x + sh.y + 1, fn: () => drawShelf(sh) }));
      for (const c of crews) {
        items.push({ d: c.rx + c.ry + 0.5, fn: () => drawRobot(c, t) });
        items.push({ d: c.px + c.py + 0.2, fn: () => drawPicker(c, t) });
      }
      items.sort((p, q) => p.d - q.d).forEach((it) => it.fn());
    });
  }

  /* ---------- parcel sorter preview ---------- */
  // A robot sorter: robots on a raised deck take a parcel at an induct along
  // the front, drive to a chute hole, tip the parcel into the bag below and
  // go back. Each robot has its own induct and rows, so they never meet.
  function sortPreview(canvas) {
    const GW = 10, GD = 7, DZ = 1.3;
    const kit = isoKit(canvas, GW, GD + 1.5, 2.6, 0.62), { ctx, P, quad, box } = kit;
    const rand = rng(41), HUES = ['#b8875a', '#a8794f', '#c6956a', '#9c6f47', '#d0a070'];
    // holes every third cell; a bag under each, filling up
    const holes = [];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) holes.push({ x: 1 + 3 * i, y: 1 + 3 * j, fill: rand() * 0.7 });
    const INDUCTS = [1.5, 4.5, 7.5];
    const bots = INDUCTS.map((ix, k) => ({ ix, x: ix, y: GD - 0.5, path: [], parcel: null, tip: 0, wait: k * 0.7 }));
    function plan(b) {
      const h = holes[Math.floor(rand() * holes.length)], tx = h.x + 0.5, ty = h.y + 1.5; // stop just in front of the hole
      b.target = h;
      b.path = [{ x: b.ix, y: ty }, { x: tx, y: ty }, { tip: true }, { x: b.ix, y: ty }, { x: b.ix, y: GD - 0.5, load: true }];
    }
    function step(dt) {
      for (const b of bots) {
        if (b.wait > 0) { b.wait -= dt; continue; }
        if (b.tip > 0) { b.tip -= dt; if (b.tip <= 0) { b.parcel = null; b.target.fill = b.target.fill > 0.9 ? 0.05 : b.target.fill + 0.12; } continue; }
        if (!b.path.length) { b.parcel = HUES[Math.floor(rand() * HUES.length)]; b.wait = 0.4; plan(b); continue; }
        const w = b.path[0];
        if (w.tip) { b.tip = 0.5; b.path.shift(); continue; }
        const dx = w.x - b.x, dy = w.y - b.y, m = 2.2 * dt;
        if (Math.abs(dx) > 1e-3) b.x = Math.abs(dx) > m ? b.x + Math.sign(dx) * m : w.x;
        else if (Math.abs(dy) > 1e-3) b.y = Math.abs(dy) > m ? b.y + Math.sign(dy) * m : w.y;
        else { b.path.shift(); if (w.load) b.wait = 0.5; }
      }
    }
    animate(canvas, kit, step, () => {
      quad([P(0, 0, 0), P(GW, 0, 0), P(GW, GD + 1.5, 0), P(0, GD + 1.5, 0)], '#0b1424', 'rgba(125,211,252,.35)', 1);
      // legs holding the deck up
      for (let x = 0; x <= GW; x += 2.5) for (let y = 0; y <= GD; y += 3.5) quad([P(x, y, 0), P(x, y, DZ)], null, 'rgba(125,211,252,.5)', 1.4);
      // bags under the deck
      for (const h of holes) { const x = h.x + 0.5, y = h.y + 0.5, top = DZ - 0.1, ht = 0.15 + h.fill * (DZ - 0.3); box(x - 0.36, y - 0.36, x + 0.36, y + 0.36, top - ht, top, '#e5e7ebdd', '#cbd5e1cc', '#94a3b8cc', h.fill > 0.9 ? '#ef4444' : null); }
      // the deck: a grating with the holes cut out, inducts along the front
      quad([P(0, 0, DZ), P(GW, 0, DZ), P(GW, GD, DZ), P(0, GD, DZ)], 'rgba(56,189,248,.07)', 'rgba(125,211,252,.55)', 1.2);
      ctx.globalAlpha = 0.25;
      for (let x = 1; x < GW; x++) quad([P(x, 0, DZ), P(x, GD, DZ)], null, '#38bdf8', 0.6);
      for (let y = 1; y < GD; y++) quad([P(0, y, DZ), P(GW, y, DZ)], null, '#38bdf8', 0.6);
      ctx.globalAlpha = 1;
      for (const h of holes) quad([P(h.x + 0.1, h.y + 0.1, DZ), P(h.x + 0.9, h.y + 0.1, DZ), P(h.x + 0.9, h.y + 0.9, DZ), P(h.x + 0.1, h.y + 0.9, DZ)], '#020617', h.fill > 0.9 ? '#ef4444' : '#facc15', 1.4);
      for (const ix of INDUCTS) quad([P(ix - 0.5, GD - 1, DZ), P(ix + 0.5, GD - 1, DZ), P(ix + 0.5, GD, DZ), P(ix - 0.5, GD, DZ)], 'rgba(250,204,21,.15)', 'rgba(250,204,21,.8)', 1.3);
      const items = [];
      // an operator at each induct, on the platform in front of the deck
      for (const ix of INDUCTS) items.push({ d: ix + GD + 1, fn: () => {
        box(ix - 0.6, GD, ix + 0.6, GD + 1.1, 0, DZ - 0.02, 'rgba(56,189,248,.12)', 'rgba(56,189,248,.08)', 'rgba(56,189,248,.06)', 'rgba(125,211,252,.45)');
        const [px, py] = P(ix, GD + 0.6, DZ), u = kit.s / 20, busy = bots.some((b) => b.ix === ix && b.y > GD - 0.6 && b.wait > 0), reach = busy ? Math.max(0, Math.sin(performance.now() / 120)) * 3 * u : 0;
        ctx.fillStyle = '#1c2638'; ctx.fillRect(px - 3 * u, py - 14 * u, 6 * u, 14 * u);
        ctx.fillStyle = '#f97316'; ctx.fillRect(px - 4.5 * u, py - 25 * u, 9 * u, 12 * u);
        ctx.strokeStyle = '#f97316'; ctx.lineWidth = 2.4 * u; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(px - 3.5 * u, py - 22 * u); ctx.lineTo(px - 6 * u - reach, py - 16 * u - reach); ctx.stroke();
        ctx.fillStyle = '#e0ac7e'; ctx.beginPath(); ctx.arc(px, py - 28.5 * u, 3.3 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(px, py - 29.5 * u, 3.7 * u, Math.PI, 0); ctx.fill();
      } });
      for (const b of bots) items.push({ d: b.x + b.y, fn: () => {
        const { x, y } = b, t = b.tip > 0 ? 1 - b.tip / 0.5 : 0;
        box(x - 0.3, y - 0.3, x + 0.3, y + 0.3, DZ, DZ + 0.22, '#e2e8f0', '#cbd5e1', '#94a3b8', 'rgba(4,7,13,.4)');
        ctx.save(); ctx.shadowColor = b.tip > 0 ? '#f59e0b' : '#38bdf8'; ctx.shadowBlur = 8;
        quad([P(x - 0.3, y + 0.3, DZ + 0.1), P(x + 0.3, y + 0.3, DZ + 0.1), P(x + 0.3, y + 0.3, DZ + 0.15), P(x - 0.3, y + 0.3, DZ + 0.15)], b.tip > 0 ? '#f59e0b' : '#38bdf8');
        ctx.restore();
        box(x - 0.3, y - 0.3, x + 0.3, y + 0.3, DZ + 0.24, DZ + 0.3, '#0ea5e9', '#0369a1', '#075985');
        if (b.parcel) { const py = y - t * 0.9, pz = DZ + 0.3 - t * 0.8; box(x - 0.2, py - 0.16, x + 0.2, py + 0.16, pz, pz + 0.3, b.parcel, '#8a623f', '#6b4a2e'); }
      } });
      items.sort((a, b) => a.d - b.d).forEach((it) => it.fn());
    });
  }

  /* ---------- pharmacy wholesale preview ---------- */
  // An A-frame: its belt carries a window per order under the channels, which
  // drop their boxes in; at the end the window tips into the order tote
  // waiting below. The tote rides on to a pick-to-light rack, where the light
  // shows the location and an operator picks into it.
  function zonePreview(canvas) {
    const GW = 12, GD = 6.4, AY = 1.1, BZ = 0.55, TY = 2.6, LY = 4.6, X0 = 1, X1 = 8, TIP = 8.6, PICK = 6, NC = 14;
    const kit = isoKit(canvas, GW, GD, 2.4, 0.62), { ctx, P, quad, box } = kit;
    const rand = rng(41), HUES = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#2dd4bf', '#fb923c', '#f87171'];
    const chans = [...Array(NC * 2)].map((_, k) => ({ x: X0 + 0.25 + ((k % NC) + 0.5) * ((X1 - X0 - 0.5) / NC), side: k < NC ? -1 : 1, col: HUES[Math.floor(rand() * HUES.length)], fill: 0.4 + rand() * 0.6, drop: -1 }));
    // the tote's path: along the A-frame to the tip, round to the rack, away
    const path = [{ x: 0.4, y: TY }, { x: TIP, y: TY }, { x: GW - 0.6, y: TY }, { x: GW - 0.6, y: LY }, { x: 1.2, y: LY }];
    const segs = path.slice(1).map((b, k) => { const a = path[k]; return { a, b, l: Math.hypot(b.x - a.x, b.y - a.y) }; }), L = segs.reduce((n, g) => n + g.l, 0);
    const at = (s) => { for (const g of segs) { if (s <= g.l) return { x: g.a.x + ((g.b.x - g.a.x) * s) / g.l, y: g.a.y + ((g.b.y - g.a.y) * s) / g.l }; s -= g.l; } return path[path.length - 1]; };
    const sTip = TIP - 0.4, sPick = segs[0].l + segs[1].l + segs[2].l + (GW - 0.6 - PICK);
    const totes = [], wins = [];
    let spawn = 0, glow = 0, lit = -1;
    function step(dt) {
      spawn -= dt;
      if (spawn <= 0 && (!totes.length || totes[totes.length - 1].s > 1.2)) { spawn = 2.4; totes.push({ s: 0, units: 0, hold: 0, tipped: false, picked: false }); wins.push({ x: X0 - 0.3, units: [], tote: totes[totes.length - 1] }); }
      // windows: along the belt, the channels over them dropping in a box; waiting at the end for their tote
      for (const w of wins) {
        const end = X1 + 0.1, tAt = w.tote.s >= sTip - 1e-3;
        const nx = Math.min(end, w.x + 1.55 * dt);
        for (const c of chans) if (c.x > w.x && c.x <= nx && rand() < 0.35) { w.units.push(c.col); c.drop = 0.35; c.fill = Math.max(0.1, c.fill - 0.08); }
        w.x = nx;
        if (w.x >= end && tAt && !w.tote.tipped) { w.tote.tipped = true; w.tote.units = w.units.length; w.tote.hold = 0.6; glow = 0.5; w.done = true; }
      }
      while (wins.length && wins[0].done) wins.shift();
      for (const c of chans) { c.drop -= dt; if (c.fill < 0.2 && rand() < dt * 0.5) c.fill = 1; }
      // totes: keep their distance; wait at the tip for the window, at the rack for the pick
      for (let k = 0; k < totes.length; k++) {
        const t = totes[k], ahead = totes[k - 1];
        if (t.hold > 0) { t.hold -= dt; continue; }
        let lim = ahead ? ahead.s - 0.9 : Infinity;
        if (!t.tipped) lim = Math.min(lim, sTip);
        if (!t.picked) lim = Math.min(lim, sPick);
        const ns = Math.min(lim, t.s + 1.8 * dt);
        if (t.s < sPick && ns >= sPick - 1e-3 && !t.picked) { t.picked = true; t.hold = 1.3; t.units += 2; lit = Math.floor(rand() * 10); }
        t.s = Math.max(t.s, ns);
      }
      while (totes.length && totes[0].s >= L - 0.05) totes.shift();
      glow = Math.max(0, glow - dt);
    }
    const drawTote = (t) => {
      const q = at(t.s), w = 0.32, d = 0.26;
      box(q.x - w, q.y - d, q.x + w, q.y + d, 0.45, 0.85, 'rgba(37,99,235,.65)', 'rgba(29,78,216,.75)', 'rgba(30,64,175,.75)', '#60a5fa');
      for (let k = 0; k < Math.min(4, Math.ceil(t.units / 2)); k++) box(q.x - w + 0.08 + (k % 2) * 0.28, q.y - d + 0.06 + Math.floor(k / 2) * 0.24, q.x - w + 0.32 + (k % 2) * 0.28, q.y - d + 0.24 + Math.floor(k / 2) * 0.24, 0.85, 0.92, HUES[(k * 3 + 1) % HUES.length]);
    };
    animate(canvas, kit, step, () => {
      // conveyors
      for (let k = 1; k < path.length; k++) { const a = path[k - 1], b = path[k], x0 = Math.min(a.x, b.x) - 0.35, x1 = Math.max(a.x, b.x) + 0.35, y0 = Math.min(a.y, b.y) - 0.35, y1 = Math.max(a.y, b.y) + 0.35; box(x0, y0, x1, y1, 0.3, 0.45, 'rgba(51,65,85,.55)', 'rgba(30,41,59,.6)', 'rgba(15,23,42,.6)', 'rgba(125,211,252,.35)'); }
      // the A-frame: belt with its windows, two faces of channels
      box(X0 - 0.4, AY - 0.3, X1 + 0.4, AY + 0.3, BZ - 0.15, BZ, '#0f172a', '#111827', '#0b1220', 'rgba(125,211,252,.4)');
      for (const w of wins) { const hw = 0.45; quad([P(w.x - hw, AY - 0.28, BZ + 0.01), P(w.x + hw, AY - 0.28, BZ + 0.01), P(w.x + hw, AY + 0.28, BZ + 0.01), P(w.x - hw, AY + 0.28, BZ + 0.01)], 'rgba(56,189,248,.12)', '#38bdf8', 1); w.units.slice(0, 8).forEach((c, k) => box(w.x - 0.35 + (k % 4) * 0.18, AY - 0.18 + Math.floor(k / 4) * 0.18, w.x - 0.23 + (k % 4) * 0.18, AY - 0.06 + Math.floor(k / 4) * 0.18, BZ, BZ + 0.12, c)); }
      const face = (side) => {
        const yf = AY + side * 0.7, zf = BZ + 0.5, zt = 2.1;
        quad([P(X0, yf, zf), P(X1, yf, zf), P(X1, AY, zt), P(X0, AY, zt)], side > 0 ? 'rgba(14,165,233,.10)' : 'rgba(14,165,233,.06)', 'rgba(125,211,252,.5)', 1);
        for (const c of chans) {
          if (c.side !== side) continue;
          const f = c.fill, hw = 0.16, zb = zf + 0.05, ztop = zf + 0.05 + (zt - zf - 0.1) * f, yb = yf - side * 0.05, ytop = yf + (AY - yf) * ((ztop - zf) / (zt - zf));
          quad([P(c.x - hw, yb, zb), P(c.x + hw, yb, zb), P(c.x + hw, ytop, ztop), P(c.x - hw, ytop, ztop)], c.fill < 0.2 ? '#f59e0b' : c.col + (side > 0 ? '99' : 'dd'));
          if (c.drop > 0) box(c.x - 0.07, AY + side * 0.35 * (c.drop / 0.35) - 0.06, c.x + 0.07, AY + side * 0.35 * (c.drop / 0.35) + 0.06, BZ + 0.6 * (c.drop / 0.35), BZ + 0.6 * (c.drop / 0.35) + 0.12, c.col);
        }
      };
      face(-1);
      // the A of the frame at both ends
      for (const x of [X0, X1]) quad([P(x, AY - 0.75, BZ - 0.15), P(x, AY, 2.2), P(x, AY + 0.75, BZ - 0.15)], null, 'rgba(125,211,252,.7)', 1.4);
      quad([P(X0, AY, 2.2), P(X1, AY, 2.2)], null, 'rgba(186,230,253,.9)', 2);
      // the tip chute down to the tote
      quad([P(X1 + 0.4, AY - 0.25, BZ), P(X1 + 0.4, AY + 0.25, BZ), P(TIP + 0.25, TY - 0.3, 1.0), P(TIP - 0.25, TY - 0.3, 1.0)], glow ? 'rgba(74,222,128,.5)' : 'rgba(148,163,184,.25)', 'rgba(148,163,184,.6)', 1);
      const items = [];
      items.push({ d: AY + 3, fn: () => face(1) });
      // the pick-to-light rack behind the operator
      const rx0 = 3.2, rx1 = 8.8, ry = LY + 1.4;
      items.push({ d: ry + 4, fn: () => {
        box(rx0, ry - 0.3, rx1, ry + 0.3, 0, 0.9, 'rgba(30,64,175,.18)', 'rgba(30,64,175,.22)', 'rgba(30,58,138,.25)', 'rgba(96,165,250,.55)');
        for (let k = 0; k < 10; k++) for (let lv = 0; lv < 2; lv++) {
          const x = rx0 + 0.3 + k * 0.54, z = 0.2 + lv * 0.4, on = k === lit && lv === 1 && totes.some((t) => t.hold > 0 && t.picked);
          box(x - 0.18, ry - 0.2, x + 0.18, ry + 0.2, z, z + 0.25, HUES[(k + lv * 3) % HUES.length] + '66', HUES[(k + lv * 3) % HUES.length] + '44', HUES[(k + lv * 3) % HUES.length] + '33');
          if (on) { ctx.save(); ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 12; box(x - 0.1, ry - 0.34, x + 0.1, ry - 0.3, z + 0.3, z + 0.38, '#4ade80', '#4ade80', '#4ade80'); ctx.restore(); }
        }
      } });
      const busy = totes.some((t) => t.hold > 0 && t.picked);
      items.push({ d: PICK + LY + 0.9, fn: () => { const [px, py] = P(PICK, LY + 0.75, 0); person(ctx, px, py, kit.s / 20, '#f97316', busy ? Math.max(0, Math.sin(performance.now() / 110)) * 3 * kit.s / 20 : 0, 3); } });
      for (const t of totes) { const q = at(t.s); items.push({ d: q.x + q.y, fn: () => drawTote(t) }); }
      items.sort((a, b) => a.d - b.d).forEach((it) => it.fn());
    });
  }

  /* ---------- multi-storey building preview ---------- */
  // Three floors cut open: the store on the first, a spiral carrying totes up
  // to the pick stations on the second, parcels dropping down the parcel
  // spiral to the sorter on the ground floor, the tote lift between
  // goods-in and the store.
  function towerPreview(canvas) {
    const GW = 9, GD = 6, FZ = [0, 2.9, 5.8], TOP = 7.6;
    const kit = isoKit(canvas, GW, GD, TOP, 0.62), { ctx, P, quad, box } = kit;
    const rand = rng(53), HUES = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#2dd4bf'];
    const helix = (cx, cy, r, z0, z1, turns, a0, dir) => (u) => { const a = a0 + dir * u * turns * Math.PI * 2; return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), z: z0 + (z1 - z0) * u }; };
    const up = helix(1.6, 4.4, 0.7, FZ[1] + 0.3, FZ[2] + 0.3, 2.5, Math.PI, 1), down = helix(7.6, 4.7, 0.55, FZ[2] + 0.25, FZ[0] + 1.05, 4.25, -Math.PI / 2, 1);
    const totes = [0, 0.25, 0.5, 0.75].map((s) => ({ s, c: '#7d8ca3' })), parcels = [0, 0.2, 0.4, 0.6, 0.8].map((s) => ({ s }));
    const lift = { z: FZ[0] + 0.3, dir: 1, hold: 1 }, cages = [0.3, 0.6, 0.15];
    const racks = [...Array(12)].map(() => rand() < 0.8);
    function step(dt) {
      for (const t of totes) t.s = (t.s + dt * 0.09) % 1;
      for (const p of parcels) { p.s += dt * 0.08; if (p.s >= 1) { p.s -= 1; const k = Math.floor(rand() * 3); cages[k] = cages[k] >= 1 ? 0.1 : cages[k] + 0.1; } }
      if (lift.hold > 0) lift.hold -= dt;
      else { lift.z += lift.dir * dt * 0.9; const lo = FZ[0] + 0.3, hi = FZ[1] + 0.3; if (lift.z >= hi || lift.z <= lo) { lift.z = Math.max(lo, Math.min(hi, lift.z)); lift.dir *= -1; lift.hold = 1.2; } }
    }
    // a slab, its edge, and what stands on it
    const slab = (z, fill) => { quad([P(0, 0, z), P(GW, 0, z), P(GW, GD, z), P(0, GD, z)], fill, 'rgba(125,211,252,.35)', 1); quad([P(0, GD, z - 0.12), P(GW, GD, z - 0.12), P(GW, GD, z), P(0, GD, z)], 'rgba(51,65,85,.8)'); quad([P(GW, 0, z - 0.12), P(GW, GD, z - 0.12), P(GW, GD, z), P(GW, 0, z)], 'rgba(30,41,59,.8)'); };
    const coilSegs = (f, zMin, zMax, col) => { const out = []; for (let k = 0; k < 120; k++) { const a = f(k / 120), b = f((k + 1) / 120); if (a.z < zMin || a.z >= zMax) continue; out.push({ d: (a.x + a.y) + 0.001 * a.z, fn: () => { ctx.strokeStyle = col; ctx.lineWidth = 3.2 * kit.s / 20; ctx.beginPath(); const p = P(a.x, a.y, a.z), q = P(b.x, b.y, b.z); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); } }); } return out; };
    animate(canvas, kit, step, () => {
      for (let f = 0; f < 3; f++) {
        const z = FZ[f], z1 = f < 2 ? FZ[f + 1] : TOP, items = [];
        slab(z, f === 0 ? 'rgba(30,41,59,.85)' : 'rgba(30,41,59,.55)');
        if (f === 0) {
          // the sorter along the back, chutes and roll cages under it, a truck at the door
          box(1, 0.6, 8.2, 0.9, z + 1.05, z + 1.2, '#334155', '#1e293b', '#0f172a', 'rgba(196,181,253,.5)');
          cages.forEach((c, k) => { const x = 2 + k * 2.2; items.push({ d: x + 0.3, fn: () => { box(x, 0.05, x + 0.6, 0.5, z, z + 0.9, 'rgba(148,163,184,.25)', 'rgba(148,163,184,.3)', 'rgba(148,163,184,.25)', '#cbd5e1'); box(x + 0.05, 0.1, x + 0.55, 0.45, z, z + 0.85 * Math.min(1, c), '#b8875a', '#a87a4f', '#8a623f'); } }); });
          items.push({ d: 1, fn: () => box(3.5, -2.2, 5, -0.05, z - 0.2, z + 1.6, '#e2e8f0', '#cbd5e1', '#94a3b8') });
          items.push({ d: 8.5, fn: () => { box(1.2, 4.4, 3.4, 5.2, z, z + 0.45, '#334155', '#1e293b', '#0f172a'); box(1.5, 4.5, 2.1, 5.1, z + 0.45, z + 0.95, '#b8875a', '#a87a4f', '#8a623f'); person(ctx, ...P(2.6, 5.6, z), kit.s / 20, '#22c55e', 0, 1); } });
        }
        if (f === 1) {
          // a block of racking, its totes
          items.push({ d: 4, fn: () => { box(3, 0.4, 6.2, 2.8, z, z + 1.9, 'rgba(37,99,235,.18)', 'rgba(37,99,235,.22)', 'rgba(30,58,138,.28)', 'rgba(96,165,250,.6)'); racks.forEach((on, k) => { if (!on) return; const x = 3.15 + (k % 4) * 0.78, zz = z + 0.15 + Math.floor(k / 4) * 0.6; box(x, 2.3, x + 0.6, 2.75, zz, zz + 0.4, '#94a3b8', '#64748b', '#475569'); }); } });
        }
        if (f === 2) {
          // pick stations with their put walls and operators
          for (let k = 0; k < 3; k++) { const x = 2.6 + k * 1.9; items.push({ d: x + 4.6, fn: () => { box(x, 3.9, x + 1.3, 4.5, z, z + 0.5, '#475569', '#334155', '#1e293b'); for (let j = 0; j < 3; j++) box(x + 0.1 + j * 0.4, 3.95, x + 0.4 + j * 0.4, 4.25, z + 0.5, z + 0.8, '#2563eb', '#1d4ed8', '#1e40af'); person(ctx, ...P(x + 0.6, 5.1, z), kit.s / 20, '#f97316', Math.max(0, Math.sin(performance.now() / 160 + k)) * 3 * kit.s / 20, k + 4); } }); }
        }
        // the tote lift between the ground and first floor
        if (f < 2) items.push({ d: 7.2, fn: () => { const lx = 6.6, ly = 1.6; if (f === 0) for (const [dx, dy] of [[0, 0], [0.7, 0], [0, 0.7], [0.7, 0.7]]) quad([P(lx + dx, ly + dy, FZ[0]), P(lx + dx, ly + dy, FZ[1] + 1)], null, 'rgba(34,211,238,.8)', 1.4); if (lift.z >= z && lift.z < z1) { box(lx, ly, lx + 0.7, ly + 0.7, lift.z - 0.08, lift.z, '#0891b2', '#0e7490', '#155e75'); box(lx + 0.12, ly + 0.15, lx + 0.58, ly + 0.55, lift.z, lift.z + 0.32, '#94a3b8', '#64748b', '#475569'); } } });
        // the spirals: the part of them on this storey, and what rides them
        items.push(...coilSegs(up, z, z1, 'rgba(56,189,248,.85)'), ...coilSegs(down, z, z1, 'rgba(196,181,253,.85)'));
        for (const t of totes) { const q = up(t.s); if (q.z >= z && q.z < z1) items.push({ d: q.x + q.y + 0.01, fn: () => box(q.x - 0.18, q.y - 0.14, q.x + 0.18, q.y + 0.14, q.z, q.z + 0.28, '#94a3b8', '#64748b', '#475569') }); }
        for (const p of parcels) { const q = down(p.s); if (q.z >= z && q.z < z1) items.push({ d: q.x + q.y + 0.01, fn: () => box(q.x - 0.13, q.y - 0.11, q.x + 0.13, q.y + 0.11, q.z, q.z + 0.2, '#d2a676', '#b8875a', '#8a623f') }); }
        items.sort((a, b) => a.d - b.d).forEach((it) => it.fn());
      }
      void HUES;
    });
  }

  /* ---------- pocket sorter preview ---------- */
  // An overhead loop with pockets riding round it, storage rails across it,
  // one of them letting its pockets go, and a pack station where they open.
  function pocketPreview(canvas) {
    const GW = 9, GD = 6, RZ = 2.6;
    const kit = isoKit(canvas, GW, GD, RZ + 0.4, 0.7), { ctx, P, quad, box } = kit;
    const rand = rng(41), HUES = ['#f472b6', '#38bdf8', '#a3e635', '#fbbf24', '#c084fc', '#f1f5f9', '#fb7185', '#2dd4bf'];
    const X0 = 0.6, X1 = GW - 0.6, Y0 = 0.6, Y1 = GD - 1.6, L = 2 * (X1 - X0) + 2 * (Y1 - Y0);
    // a point at distance u round the loop (clockwise in the view)
    const loop = (u) => { u = ((u % L) + L) % L; const w = X1 - X0, h = Y1 - Y0; if (u < w) return { x: X0 + u, y: Y0 }; if (u < w + h) return { x: X1, y: Y0 + u - w }; if (u < 2 * w + h) return { x: X1 - (u - w - h), y: Y1 }; return { x: X0, y: Y1 - (u - 2 * w - h) }; };
    const lanes = [1.6, 2.4, 3.2, 4.0, 4.8, 5.6, 6.4, 7.2].map((x, k) => ({ x, n: 4 + Math.floor(rand() * 7), seq: k === 5 }));
    const riders = [...Array(22)].map((_, k) => ({ u: (k * L) / 22, c: HUES[Math.floor(rand() * HUES.length)] }));
    const lanePk = lanes.map((ln) => [...Array(ln.n)].map(() => HUES[Math.floor(rand() * HUES.length)]));
    let t = 0;
    const step = (dt) => { t += dt; for (const r of riders) r.u = (r.u + dt * 0.8) % L; };
    const pocket = (x, y, z, c, open) => {
      ctx.strokeStyle = 'rgba(148,163,184,.8)'; ctx.lineWidth = 1; const a = P(x, y, z), b = P(x, y, z - 0.18); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      box(x - 0.16, y - 0.05, x + 0.16, y + 0.05, z - 0.62 - (open ? 0.15 : 0), z - 0.18, 'rgba(226,232,240,.85)', 'rgba(203,213,225,.85)', 'rgba(148,163,184,.85)');
      if (c) box(x - 0.11, y - 0.04, x + 0.11, y + 0.04, z - 0.3, z - 0.2, c, c, c);
    };
    animate(canvas, kit, step, () => {
      // the floor, the pack station at the front with its packer's table
      quad([P(0, 0, 0), P(GW, 0, 0), P(GW, GD, 0), P(0, GD, 0)], 'rgba(15,23,42,.9)', 'rgba(56,189,248,.35)', 1);
      box(5.6, GD - 1.0, 7.2, GD - 0.4, 0, 0.55, '#d6c6a5', '#b8a888', '#a08f70');
      const items = [];
      // the rails: the loop and the storage rails across it
      const rail = (a, b, col) => items.push({ d: -1, fn: () => { ctx.strokeStyle = col; ctx.lineWidth = 2.2 * kit.s / 20; const p = P(a.x, a.y, RZ), q = P(b.x, b.y, RZ); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); } });
      for (let u = 0; u < L; u += 0.25) rail(loop(u), loop(u + 0.26), 'rgba(125,211,252,.85)');
      for (const ln of lanes) rail({ x: ln.x, y: Y0 }, { x: ln.x, y: Y1 }, ln.seq ? 'rgba(192,132,252,.95)' : 'rgba(125,211,252,.55)');
      // a rail down to the pack station, where the pockets open over the table
      rail({ x: 6.4, y: Y1 }, { x: 6.4, y: GD - 0.7 }, 'rgba(74,222,128,.9)');
      lanes.forEach((ln, k) => {
        const n = ln.seq ? Math.max(0, ln.n - Math.floor((t * 0.8) % (ln.n + 3))) : ln.n;
        lanePk[k].slice(0, n).forEach((c, j) => items.push({ d: ln.x + Y0 + 0.4 + j * 0.32, fn: () => pocket(ln.x, Y0 + 0.4 + j * 0.32, RZ, c) }));
      });
      for (const r of riders) { const q = loop(r.u); items.push({ d: q.x + q.y, fn: () => pocket(q.x, q.y, RZ, r.c) }); }
      // pockets going down to the packer, the front one open
      for (let j = 0; j < 3; j++) { const y = GD - 0.75 - j * 0.3, open = j === 0 && (t % 2) < 1; items.push({ d: 6.4 + y, fn: () => pocket(6.4, y, RZ, open ? null : HUES[(j + Math.floor(t / 2)) % HUES.length], open) }); }
      items.push({ d: 7 + GD, fn: () => person(ctx, ...P(6.4, GD - 0.1, 0), kit.s / 20, '#38bdf8', Math.max(0, Math.sin(t * 3)) * 3 * kit.s / 20, 7) });
      items.sort((a, b) => a.d - b.d).forEach((it) => it.fn());
    });
  }

  /* ---------- automated car park preview ---------- */
  // Three parking levels over the ground floor: cars in their bays, a lift
  // taking a car up, a robot carrying a car down the aisle to a free bay,
  // and a car driving in from the street.
  function parkPreview(canvas) {
    const GW = 8, GD = 4, BW = 0.8, FZ = [0, 1.5, 2.75, 4.0], TOP = 5.0, AY = GD / 2;
    const kit = isoKit(canvas, GW, GD + 1.4, TOP, 0.78), { P, quad, box } = kit;
    const rand = rng(29), PAINT = ['#f1f5f9', '#334155', '#94a3b8', '#cbd5e1', '#3b82f6', '#ef4444', '#f1f5f9', '#22d3ee', '#facc15'];
    const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16), ch = (v) => Math.round(v * (1 + f)); return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`; };
    const bays = [];
    for (let f = 1; f < 4; f++) for (const row of [0, 1]) for (let k = row ? 0 : 2; k < GW / BW; k++) bays.push({ f, row, x: k * BW, car: rand() < 0.72 ? PAINT[Math.floor(rand() * PAINT.length)] : null });
    const target = bays.find((b) => b.f === 2 && b.row === 1 && !b.car && b.x > 3) || bays.find((b) => b.f === 2 && b.row === 1 && !b.car);
    if (target) target.car = null;
    const T = 16, CAR = '#ef4444'; // one cycle: lift up (0–4), robot along the aisle (4–9), into the bay (9–10.5), out (10.5–12), lift down (12–16)
    let t = 0;
    const step = (dt) => { t = (t + dt) % T; if (target) target.car = t >= 10.5 ? CAR : null; };
    const ease = (u) => u * u * (3 - 2 * u), seg = (a, b) => ease(Math.min(1, Math.max(0, (t - a) / (b - a))));
    // a car across the aisle (its length along y), seen from above
    const drawCar = (x, y, z, c) => {
      box(x - 0.18, y - 0.36, x + 0.18, y + 0.36, z + 0.05, z + 0.25, c, shade(c, -0.2), shade(c, -0.38));
      box(x - 0.15, y - 0.2, x + 0.15, y + 0.17, z + 0.25, z + 0.4, '#1e293b', '#0f172a', '#0b1220');
    };
    const robot = (x, y, z) => box(x - 0.12, y - 0.34, x + 0.12, y + 0.34, z, z + 0.05, '#facc15', '#ca8a04', '#a16207', 'rgba(254,240,138,.8)');
    animate(canvas, kit, step, () => {
      // the street in front, with a car driving along and into a cabin
      quad([P(-0.5, GD + 0.2, 0), P(GW + 0.5, GD + 0.2, 0), P(GW + 0.5, GD + 1.4, 0), P(-0.5, GD + 1.4, 0)], 'rgba(15,23,42,.9)', 'rgba(56,189,248,.25)', 1);
      for (let x = 0; x < GW; x += 0.9) quad([P(x, GD + 0.78, 0.01), P(x + 0.45, GD + 0.78, 0.01), P(x + 0.45, GD + 0.82, 0.01), P(x, GD + 0.82, 0.01)], 'rgba(226,232,240,.45)');
      const u = (t % 8) / 8, sx = u < 0.6 ? GW + 0.3 - (u / 0.6) * (GW - 0.7) : 0.6, sy = u < 0.6 ? GD + 0.5 : GD + 0.5 - ((u - 0.6) / 0.4) * 1.2;
      const lz = t < 4 ? FZ[2] * seg(0, 4) : t < 12 ? FZ[2] : FZ[2] * (1 - seg(12, 16));
      for (let f = 0; f < 4; f++) {
        const z = FZ[f], items = [];
        quad([P(0, 0, z), P(GW, 0, z), P(GW, GD, z), P(0, GD, z)], f ? 'rgba(30,41,59,.62)' : 'rgba(15,23,42,.92)', 'rgba(56,189,248,.55)', 1.2);
        quad([P(0, GD, z - 0.1), P(GW, GD, z - 0.1), P(GW, GD, z), P(0, GD, z)], 'rgba(56,189,248,.28)');
        quad([P(GW, 0, z - 0.1), P(GW, GD, z - 0.1), P(GW, GD, z), P(GW, 0, z)], 'rgba(14,116,144,.35)');
        // columns up to the next slab
        if (f < 3) for (let x = 0; x <= GW; x += 2.4) for (const y of [0, GD]) items.push({ d: x + y - 0.1, fn: () => box(x - 0.04, y - 0.04, x + 0.04, y + 0.04, z, FZ[f + 1] - 0.1, 'rgba(148,163,184,.5)', 'rgba(100,116,139,.6)', 'rgba(71,85,105,.6)') });
        if (f === 0) {
          // two cabins on the street, the glazed lobby beside them
          for (const x of [0, 1.2]) items.push({ d: x + GD, fn: () => box(x + 0.05, GD - 1.3, x + 1.15, GD, z, z + 0.8, 'rgba(226,232,240,.14)', 'rgba(226,232,240,.08)', 'rgba(226,232,240,.22)', 'rgba(226,232,240,.55)') });
          items.push({ d: 4 + GD, fn: () => box(2.6, GD - 1.2, 5.4, GD, z, z + 1.0, 'rgba(56,189,248,.1)', 'rgba(56,189,248,.16)', 'rgba(56,189,248,.1)', 'rgba(125,211,252,.7)') });
          items.push({ d: sx + sy, fn: () => drawCar(sx, sy, z, '#f1f5f9') });
        } else {
          for (const b of bays.filter((q) => q.f === f)) {
            const y = b.row ? GD - 0.65 : 0.65, x = b.x + BW / 2;
            items.push({ d: x + y, fn: () => { quad([P(b.x, b.row ? GD - 1.3 : 0, z + 0.005), P(b.x + 0.03, b.row ? GD - 1.3 : 0, z + 0.005), P(b.x + 0.03, b.row ? GD : 1.3, z + 0.005), P(b.x, b.row ? GD : 1.3, z + 0.005)], 'rgba(226,232,240,.55)'); if (b.car) drawCar(x, y, z, b.car); } });
          }
          if (f === 2 && target) {
            // the robot: from the lift along the aisle to the free bay, into it, and back out
            const lx = 0.8, bx = target.x + BW / 2, by = GD - 0.65;
            let rx = lx, ry = AY;
            if (t >= 4 && t < 9) rx = lx + (bx - lx) * seg(4, 9); else if (t >= 9) { rx = bx; ry = t < 10.5 ? AY + (by - AY) * seg(9, 10.5) : t < 12 ? by - (by - AY) * seg(10.5, 12) : AY; }
            if (t >= 12) rx = bx;
            const carried = t >= 4 && t < 10.5;
            items.push({ d: rx + ry + 0.05, fn: () => { robot(rx, ry, z); if (carried) drawCar(rx, ry, z + 0.04, CAR); } });
          }
        }
        // the lift at the back corner: its platform and, on the way up, the car
        if (lz >= z - 0.01 && lz < (FZ[f + 1] ?? TOP) - 0.01) items.push({ d: 1.5, fn: () => { box(0.1, 0.05, 1.5, 1.25, lz - 0.06, lz, '#22d3ee', '#0891b2', '#0e7490', 'rgba(165,243,252,.8)'); if (t < 4) drawCar(0.8, 0.65, lz, CAR); } });
        items.sort((a, b) => a.d - b.d).forEach((it) => it.fn());
      }
    });
  }

  function casePreview(canvas) {
    const GW = 8, GD = 5.2, LZ = [0.35, 1.25, 2.15], DY = 2.6, TOP = 2.95;
    const kit = isoKit(canvas, GW, GD, TOP + 0.4, 0.85), { ctx, P, quad, box } = kit;
    const rand = rng(53), INK = ['#dc2626', '#f59e0b', '#16a34a', '#2563eb', '#7c3aed', '#0891b2', '#e5e7eb', '#b98a58', '#b98a58', '#b98a58'];
    const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16), ch = (v) => Math.round(Math.min(255, v * (1 + f))); return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`; };
    const kase = (x, y, z, w, d, h, c) => box(x - w / 2, y - d / 2, x + w / 2, y + d / 2, z, z + h, c, shade(c, -0.18), shade(c, -0.34));
    // the shelves: two aisles, cases on both sides of each, on every level
    const AX = [1.5, 3.9], shelf = LZ.map(() => AX.map(() => [-1, 1].map(() => [...Array(5)].map(() => (rand() < 0.85 ? { c: INK[Math.floor(rand() * INK.length)], w: 0.34 + rand() * 0.1 } : null)))));
    // the pallet being built in front: a plan of three layers, placed one case at a time
    const plan = [];
    for (let l = 0; l < 3; l++) for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) plan.push({ x: 6.15 + i * 0.4, y: 4.0 + j * 0.45, z: 0.3 + l * 0.32, c: INK[(l * 5 + j * 3 + i * 7) % INK.length] });
    const C = 2.0; // s per case
    let t = 0;
    const step = (dt) => { t = (t + dt) % (plan.length * C + 3); };
    const ease = (u) => u * u * (3 - 2 * u);
    animate(canvas, kit, step, () => {
      quad([P(0, 0, 0), P(GW, 0, 0), P(GW, GD, 0), P(0, GD, 0)], 'rgba(15,23,42,.9)', 'rgba(56,189,248,.35)', 1);
      const items = [];
      LZ.forEach((z, f) => {
        // the level's deck along the front
        items.push({ d: -1 + f * 0.001, fn: () => quad([P(0.2, DY, z), P(5.4, DY, z), P(5.4, DY + 0.65, z), P(0.2, DY + 0.65, z)], 'rgba(51,65,85,.8)', 'rgba(125,211,252,.4)', 1) });
        AX.forEach((ax, k) => [-1, 1].forEach((sd, si) => shelf[f][k][si].forEach((cs, j) => {
          const x = ax + sd * 0.5, y = 0.5 + j * 0.45;
          items.push({ d: x + y + f * 0.01, fn: () => { quad([P(x - 0.24, y - 0.22, z), P(x + 0.24, y - 0.22, z), P(x + 0.24, y + 0.22, z), P(x - 0.24, y + 0.22, z)], 'rgba(148,163,184,.4)'); if (cs) kase(x, y, z + 0.02, 0.42, cs.w, 0.32, cs.c); } });
        })));
        // a bot on each level, to and fro along the deck
        const u = ((t * 0.3 + f * 0.43) % 2), g = u < 1 ? ease(u) : ease(2 - u), bx = 0.7 + g * 4.2, by = DY + 0.33;
        items.push({ d: bx + by + 0.3, fn: () => { box(bx - 0.32, by - 0.16, bx + 0.32, by + 0.16, z, z + 0.09, '#334155', '#1f2937', '#111827', 'rgba(56,189,248,.85)'); if (f !== 1) kase(bx, by, z + 0.09, 0.36, 0.28, 0.26, INK[(f * 3 + 2) % INK.length]); } });
      });
      for (const x of [0.4, 2.7, 5.0]) items.push({ d: x + DY - 0.05, fn: () => box(x - 0.035, DY - 0.08, x + 0.035, DY - 0.01, 0, TOP, '#3b6cb8', '#1e3a6e', '#1e3a6e') });
      // the output lift at the deck's end, its carriage bringing a case down
      const lt = (t % 4) / 4, lz = LZ[2] * (lt < 0.5 ? 1 - ease(lt * 2) : ease((lt - 0.5) * 2));
      items.push({ d: 5.8 + DY, fn: () => { for (const x of [5.45, 6.2]) box(x - 0.04, DY + 0.08, x + 0.04, DY + 0.16, 0, TOP + 0.25, '#475569', '#334155', '#1e293b'); box(5.5, DY, 6.15, DY + 0.6, lz, lz + 0.06, '#2563eb', '#1d4ed8', '#1e3a8a'); if (lt < 0.5) kase(5.82, DY + 0.3, lz + 0.06, 0.36, 0.3, 0.26, '#f59e0b'); } });
      // the conveyor down to the palletiser, the case on it
      items.push({ d: 5.8 + 3.6, fn: () => quad([P(5.55, DY + 0.65, 0.3), P(6.1, DY + 0.65, 0.3), P(6.1, 4.6, 0.3), P(5.55, 4.6, 0.3)], 'rgba(71,85,105,.95)', 'rgba(148,163,184,.6)', 1) });
      const n = Math.min(plan.length, Math.floor(t / C)), ph = (t % C) / C, cur = plan[n];
      if (cur && ph < 0.35) { const cy = DY + 0.9 + (4.3 - DY - 0.9) * Math.min(1, ph * 3); items.push({ d: 5.82 + cy + 0.1, fn: () => kase(5.82, cy, 0.3, 0.36, 0.34, 0.3, cur.c) }); }
      // the pallet, the cases placed so far, the next place as a ghost
      items.push({ d: 6.8 + 4.0, fn: () => box(6.1, 3.95, 7.4, 4.95, 0, 0.28, '#c9a66b', '#a8844f', '#8a6b3c') });
      plan.slice(0, n).forEach((q) => items.push({ d: q.x + q.y + q.z * 0.1, fn: () => kase(q.x + 0.2, q.y + 0.22, q.z, 0.38, 0.43, 0.3, q.c) }));
      if (cur) items.push({ d: cur.x + cur.y + 0.6, fn: () => { const a = P(cur.x + 0.01, cur.y + 0.01, cur.z + 0.3), b = P(cur.x + 0.39, cur.y + 0.44, cur.z); ctx.strokeStyle = 'rgba(103,232,249,.85)'; ctx.setLineDash([3, 2]); ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); ctx.setLineDash([]); } });
      // the arm on its pedestal: shoulder, elbow, a wrist over the case, the gripper down to it
      if (cur) items.push({ d: 7.8 + 5.2, fn: () => {
        const sw = ph < 0.35 ? 0 : ph < 0.75 ? ease((ph - 0.35) / 0.4) : 1 - ease((ph - 0.75) / 0.25), tx = 5.82 + (cur.x + 0.2 - 5.82) * sw, ty = 4.3 + (cur.y + 0.22 - 4.3) * sw;
        const hold = ph > 0.3 && ph < 0.78, gz = hold ? Math.max(cur.z + 0.62, 0.95) : 0.95, bx = 7.2, by = 5.2;
        box(bx - 0.2, by - 0.2, bx + 0.2, by + 0.2, 0, 0.35, '#475569', '#334155', '#1e293b');
        const s1 = P(bx, by, 0.75), e = P((bx + tx) / 2 + 0.1, (by + ty) / 2 + 0.1, 2.1), w = P(tx, ty, gz + 0.35), g = P(tx, ty, gz), b0 = P(bx, by, 0.35);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#f08a24'; ctx.lineWidth = 7 * kit.s / 20;
        ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(s1[0], s1[1]); ctx.lineTo(e[0], e[1]); ctx.lineTo(w[0], w[1]); ctx.stroke();
        ctx.strokeStyle = '#334155'; ctx.lineWidth = 3 * kit.s / 20; ctx.beginPath(); ctx.moveTo(w[0], w[1]); ctx.lineTo(g[0], g[1]); ctx.stroke();
        if (hold) kase(tx, ty, gz - 0.3, 0.38, 0.43, 0.3, cur.c);
      } });
      items.sort((a, b) => a.d - b.d).forEach((it) => it.fn());
    });
  }
  function layerPreview(canvas) {
    const GW = 8, GD = 5, RZ = 2.6, LY = 1.2, BY = 3.4;
    const kit = isoKit(canvas, GW, GD, RZ + 0.5, 0.85), { ctx, P, quad, box } = kit;
    const INK = ['#38bdf8', '#dc2626', '#ca8a04', '#16a34a', '#f97316', '#7c3aed'];
    const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16), ch = (v) => Math.round(Math.min(255, v * (1 + f))); return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`; };
    const lanes = INK.map((c, k) => ({ x: 0.9 + k * 1.15, c, n: 6 }));
    // one layer: the pallet's footprint split into cases
    const layer = (x, y, z, c) => { for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) box(x - 0.45 + i * 0.3, y - 0.3 + j * 0.3, x - 0.17 + i * 0.3, y - 0.02 + j * 0.3, z, z + 0.22, c, shade(c, -0.18), shade(c, -0.34)); };
    const pallet = (x, y, z) => box(x - 0.48, y - 0.32, x + 0.48, y + 0.32, z, z + 0.1, '#c9a66b', '#a8844f', '#8a6b3c');
    const plan = [0, 2, 2, 4, 1, 3], C = 3.2, tx = 4.2; // which lane each layer comes from, s a layer
    let t = 0;
    const step = (dt) => { t = (t + dt) % (plan.length * C + 2); };
    const ease = (u) => u * u * (3 - 2 * u);
    animate(canvas, kit, step, () => {
      quad([P(0, 0, 0), P(GW, 0, 0), P(GW, GD, 0), P(0, GD, 0)], 'rgba(15,23,42,.9)', 'rgba(56,189,248,.35)', 1);
      const n = Math.min(plan.length, Math.floor(t / C)), ph = (t % C) / C, cur = n < plan.length ? lanes[plan[n]] : null, items = [];
      // the lanes, each pallet's layers less those already taken
      const taken = lanes.map((ln, k) => plan.slice(0, n + (ph > 0.3 && cur && plan[n] === k ? 1 : 0)).filter((q) => q === k).length);
      lanes.forEach((ln, k) => {
        items.push({ d: ln.x + LY - 0.5, fn: () => { quad([P(ln.x - 0.55, LY - 1.0, 0.02), P(ln.x + 0.55, LY - 1.0, 0.02), P(ln.x + 0.55, LY + 0.4, 0.02), P(ln.x - 0.55, LY + 0.4, 0.02)], 'rgba(71,85,105,.8)'); pallet(ln.x, LY - 0.4, 0.02); for (let l = 0; l < ln.n - 2; l++) layer(ln.x, LY - 0.7, 0.12 + l * 0.22, shade(ln.c, 0.15)); } });
        items.push({ d: ln.x + LY, fn: () => { pallet(ln.x, LY, 0.02); for (let l = 0; l < ln.n - taken[k]; l++) layer(ln.x, LY, 0.12 + l * 0.22, ln.c); } });
      });
      // the customer's pallet in front, its layers so far
      items.push({ d: tx + BY, fn: () => { pallet(tx, BY, 0.02); for (let l = 0; l < n; l++) layer(tx, BY, 0.12 + l * 0.22, lanes[plan[l]].c); } });
      // the runway, the gantry's bridge and head; the layer in its clamps
      if (cur) {
        const sw = ph < 0.3 ? 0 : ph < 0.75 ? ease((ph - 0.3) / 0.45) : 1, gx = ph < 0.3 ? cur.x + (cur.x - tx) * 0 : cur.x + (tx - cur.x) * sw, gy = LY + (BY - LY) * sw;
        const down = ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI) : ph > 0.75 ? Math.sin(((ph - 0.75) / 0.25) * Math.PI) : 0;
        const topL = sw < 1 ? 0.12 + (cur.n - taken[plan[n]] + (ph > 0.3 ? 1 : 0)) * 0.22 : 0.12 + (n + 1) * 0.22, hz = RZ - 0.4 - down * (RZ - 0.4 - topL);
        items.push({ d: 30, fn: () => {
          for (const y of [LY - 0.6, BY + 0.6]) box(0.2, y - 0.06, GW - 0.2, y + 0.06, RZ, RZ + 0.12, '#64748b', '#475569', '#334155');
          box(gx - 0.12, LY - 0.65, gx + 0.12, BY + 0.65, RZ + 0.12, RZ + 0.3, '#f59e0b', '#d97706', '#b45309');
          const a = P(gx, gy, RZ + 0.12), b = P(gx, gy, hz + 0.3); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3 * kit.s / 20; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
          box(gx - 0.5, gy - 0.35, gx + 0.5, gy + 0.35, hz + 0.22, hz + 0.32, '#334155', '#1f2937', '#111827');
          if (ph > 0.3 && ph < 0.9) layer(gx, gy, hz, cur.c);
        } });
      }
      items.sort((a, b) => a.d - b.d).forEach((it) => it.fn());
    });
  }
  /* ---------- tilt-tray sorter preview ---------- */
  // A loop of trays round two straights with chutes on both sides: a tray
  // takes a parcel at the induct, carries it round and tilts to drop it
  // into the chute of its destination.
  function trayPreview(canvas) {
    const GW = 10, GD = 5, Y0 = 1.6, Y1 = 3.4, X0 = 2, X1 = 8, R = (Y1 - Y0) / 2, S = X1 - X0, L = 2 * S + 2 * Math.PI * R, TZ = 0.6;
    const kit = isoKit(canvas, GW, GD, 1.4, 0.7), { P, quad, box } = kit;
    const rand = rng(17), HUES = ['#b8875a', '#a8794f', '#c6956a', '#9c6f47', '#d0a070'];
    const at = (u) => { u = ((u % L) + L) % L; if (u < S) return { x: X0 + u, y: Y0, out: -1 }; if (u < S + Math.PI * R) { const t = (u - S) / R; return { x: X1 + R * Math.sin(t), y: Y0 + R - R * Math.cos(t), out: 0 }; } if (u < 2 * S + Math.PI * R) return { x: X1 - (u - S - Math.PI * R), y: Y1, out: 1 }; const t = (u - 2 * S - Math.PI * R) / R; return { x: X0 - R * Math.sin(t), y: Y1 - R + R * Math.cos(t), out: 0 }; };
    const chutes = [];
    for (let k = 0; k < 5; k++) { chutes.push({ u: 1.6 + k * 1.1, side: -1 }); chutes.push({ u: S + Math.PI * R + 0.5 + k * 1.1, side: 1 }); }
    for (const c of chutes) { const q = at(c.u); c.x = q.x; c.fill = rand() * 0.6; }
    const N = 20, trays = Array.from({ length: N }, (_, k) => ({ k, parcel: null, to: null, tilt: 0 }));
    let off = 0;
    const step = (dt) => {
      const v = 1.6 * dt, prev = off; off = (off + v) % L;
      for (const tr of trays) {
        const u0 = (prev + (tr.k * L) / N) % L, u1 = u0 + v;
        const pass = (u) => (u0 <= u && u < u1) || (u0 <= u + L && u + L < u1);
        if (tr.tilt > 0) tr.tilt = Math.max(0, tr.tilt - dt);
        if (!tr.parcel && pass(0.6) && rand() < 0.75) { tr.parcel = HUES[Math.floor(rand() * HUES.length)]; tr.to = chutes[Math.floor(rand() * chutes.length)]; }
        else if (tr.parcel && pass(tr.to.u)) { tr.parcel = null; tr.tilt = 0.5; tr.to.fill = tr.to.fill > 0.9 ? 0.05 : tr.to.fill + 0.15; }
      }
    };
    animate(canvas, kit, step, () => {
      quad([P(0, 0, 0), P(GW, 0, 0), P(GW, GD, 0), P(0, GD, 0)], '#0b1424', 'rgba(125,211,252,.35)', 1);
      // chutes sloping out from the loop to their bags
      for (const c of chutes) {
        const y = c.side < 0 ? Y0 : Y1, d = c.side;
        quad([P(c.x - 0.35, y + d * 0.35, TZ - 0.05), P(c.x + 0.35, y + d * 0.35, TZ - 0.05), P(c.x + 0.35, y + d * 1.1, 0.25), P(c.x - 0.35, y + d * 1.1, 0.25)], 'rgba(56,189,248,.12)', 'rgba(125,211,252,.55)', 1);
        const by = y + d * 1.35, ht = 0.1 + c.fill * 0.3;
        box(c.x - 0.3, by - 0.25, c.x + 0.3, by + 0.25, 0.3 - ht, 0.3, '#e5e7ebdd', '#cbd5e1cc', '#94a3b8cc', c.fill > 0.9 ? '#ef4444' : null);
      }
      // the loop's frame, then the trays, tipping as they drop a parcel
      const pts = []; for (let k = 0; k <= 64; k++) { const q = at((k * L) / 64); pts.push(P(q.x, q.y, TZ - 0.1)); }
      kit.ctx.strokeStyle = 'rgba(56,189,248,.35)'; kit.ctx.lineWidth = 0.9 * kit.s; kit.ctx.beginPath(); pts.forEach((q, i) => (i ? kit.ctx.lineTo(q[0], q[1]) : kit.ctx.moveTo(q[0], q[1]))); kit.ctx.stroke();
      const items = trays.map((tr) => { const q = at(off + (tr.k * L) / N); return { d: q.x + q.y, tr, q }; }).sort((a, b) => a.d - b.d);
      for (const { tr, q } of items) {
        const t = tr.tilt * 0.5, z = TZ;
        quad([P(q.x - 0.22, q.y - 0.18, z - (q.out < 0 ? t : 0)), P(q.x + 0.22, q.y - 0.18, z - (q.out < 0 ? t : 0)), P(q.x + 0.22, q.y + 0.18, z - (q.out > 0 ? t : 0)), P(q.x - 0.22, q.y + 0.18, z - (q.out > 0 ? t : 0))], tr.tilt ? '#38bdf8' : 'rgba(14,165,233,.85)', 'rgba(125,211,252,.8)', 1);
        if (tr.parcel) box(q.x - 0.15, q.y - 0.12, q.x + 0.15, q.y + 0.12, z, z + 0.22, tr.parcel, tr.parcel, tr.parcel, 'rgba(0,0,0,.25)');
      }
    });
  }

  /* ---------- sliding shoe sorter preview ---------- */
  // A straight line of slats: parcels come from the merge with a gap between
  // them, and at the chute of its destination a row of shoes glides across
  // under a parcel and pushes it off diagonally.
  function shoePreview(canvas) {
    const GW = 11, GD = 5, YL = 2.5, XA = 1.2, XB = 10, Z = 0.55;
    const kit = isoKit(canvas, GW, GD, 1.2, 0.7), { P, quad, box } = kit;
    const rand = rng(23), HUES = ['#b8875a', '#a8794f', '#c6956a', '#9c6f47', '#d0a070'];
    const chutes = [];
    for (let k = 0; k < 6; k++) for (const side of [-1, 1]) chutes.push({ x: 3 + k * 1.2, side, fill: rand() * 0.6 });
    let parcels = [], gapT = 0, t = 0;
    const step = (dt) => {
      t += dt; gapT -= dt;
      const v = 1.8 * dt;
      if (gapT <= 0) { parcels.push({ x: XA, y: YL, len: 0.35 + rand() * 0.3, c: HUES[Math.floor(rand() * HUES.length)], to: chutes[Math.floor(rand() * chutes.length)], push: 0 }); gapT = 0.55 + rand() * 0.4; }
      for (const p of parcels) {
        p.x += v;
        if (!p.push && p.x >= p.to.x) p.push = 0.001;
        if (p.push) { p.push += dt / 0.4; p.y = YL + p.to.side * Math.min(1.2, p.push * 0.7); }
      }
      parcels = parcels.filter((p) => { if (p.push >= 1.8) { p.to.fill = p.to.fill > 0.9 ? 0.05 : p.to.fill + 0.15; return false; } return p.x < XB; });
    };
    animate(canvas, kit, step, () => {
      quad([P(0, 0, 0), P(GW, 0, 0), P(GW, GD, 0), P(0, GD, 0)], '#0b1424', 'rgba(125,211,252,.35)', 1);
      for (const c of chutes) {
        const y0 = YL + c.side * 0.45, y1 = YL + c.side * 1.3;
        quad([P(c.x - 0.4, y0, Z - 0.05), P(c.x + 0.4, y0, Z - 0.05), P(c.x + 0.3, y1, 0.25), P(c.x - 0.3, y1, 0.25)], 'rgba(56,189,248,.12)', 'rgba(125,211,252,.5)', 1);
        const by = YL + c.side * 1.55, ht = 0.1 + c.fill * 0.3;
        box(c.x - 0.3, by - 0.25, c.x + 0.3, by + 0.25, 0.3 - ht, 0.3, '#e5e7ebdd', '#cbd5e1cc', '#94a3b8cc', c.fill > 0.9 ? '#ef4444' : null);
      }
      // the induct belts merging in from the back
      for (const k of [0, 1]) quad([P(0.2 + k * 0.6, 0.2, Z - 0.05), P(0.6 + k * 0.6, 0.2, Z - 0.05), P(XA + 0.1, YL - 0.2, Z - 0.05), P(XA - 0.3, YL - 0.2, Z - 0.05)], 'rgba(56,189,248,.1)', 'rgba(125,211,252,.4)', 1);
      // the slats, moving; a shoe on each, those under a parcel being pushed off slid across
      quad([P(XA, YL - 0.45, Z), P(XB, YL - 0.45, Z), P(XB, YL + 0.45, Z), P(XA, YL + 0.45, Z)], 'rgba(56,189,248,.08)', 'rgba(125,211,252,.6)', 1.2);
      const ph = (t * 1.8) % 0.2;
      for (let x = XA + ph; x < XB; x += 0.2) {
        quad([P(x, YL - 0.43, Z), P(x, YL + 0.43, Z)], null, 'rgba(148,163,184,.45)', 0.8);
        const pp = parcels.find((p) => p.push && x > p.x - p.len / 2 - 0.15 && x < p.x + p.len / 2);
        const sy = pp ? YL + pp.to.side * Math.min(0.4, (pp.push * 0.7) * (0.6 + (pp.x + pp.len / 2 - x) * 0.5)) : YL;
        box(x - 0.04, sy - 0.05, x + 0.04, sy + 0.05, Z, Z + 0.05, '#22c55e', '#16a34a', '#15803d');
      }
      for (const p of parcels.slice().sort((a, b) => a.x + a.y - b.x - b.y)) { const w = 0.18; box(p.x - p.len / 2, p.y - w, p.x + p.len / 2, p.y + w, Z + 0.02, Z + 0.24, p.c, p.c, p.c, 'rgba(0,0,0,.25)'); }
    });
  }

  /* ---------- hospital tube system preview ---------- */
  // Three floors of a hospital cut open: a riser up the side with a branch
  // to a station on every floor. A green carrier of medicines flies from
  // the pharmacy up to a ward; a red one with samples comes down to the lab.
  function tubePreview(canvas) {
    const GW = 8, GD = 3.2, FZ = [0, 1.35, 2.7], TOP = 4.0, C = 1.15, RX = 1.0, RY = 0.7;
    const kit = isoKit(canvas, GW, GD, TOP, 0.85), { ctx, P, quad, box } = kit;
    const pt = (x, y, z) => ({ x, y, z });
    // the routes: from the pharmacy (ground, x 3) and the lab (ground, x 6.2), and a station on each upper floor (x 5)
    const stn = [pt(3.0, 1.4, 0.75), pt(5.0, 1.4, FZ[1] + 0.75), pt(5.0, 1.4, FZ[2] + 0.75)], lab = pt(6.3, 1.4, 0.75);
    const up = (s) => [s, pt(s.x, s.y, s.z - 0.75 + C), pt(s.x, RY, s.z - 0.75 + C)];
    const med = [...up(stn[0]), pt(RX, RY, C), pt(RX, RY, FZ[2] + C), pt(stn[2].x, RY, FZ[2] + C), pt(stn[2].x, stn[2].y, FZ[2] + C), stn[2]];
    const smp = [...up(stn[1]), pt(RX, RY, FZ[1] + C), pt(RX, RY, C), pt(lab.x, RY, C), pt(lab.x, lab.y, C), lab];
    const len = (r) => r.slice(1).reduce((a, q, i) => a + Math.hypot(q.x - r[i].x, q.y - r[i].y, q.z - r[i].z), 0);
    const at = (r, d) => { for (let i = 1; i < r.length; i++) { const a = r[i - 1], b = r[i], l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); if (d <= l || i === r.length - 1) { const u = l ? Math.min(1, d / l) : 0; return pt(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u); } d -= l; } return r[r.length - 1]; };
    const T = 9;
    let t = 0;
    const step = (dt) => { t = (t + dt) % T; };
    const seg = (a, b, w, col) => { const p = P(a.x, a.y, a.z), q = P(b.x, b.y, b.z); ctx.strokeStyle = col; ctx.lineWidth = w * kit.s / 20; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); };
    const route = (r, col) => { for (let i = 1; i < r.length; i++) { seg(r[i - 1], r[i], 4.5, 'rgba(219,234,254,.28)'); seg(r[i - 1], r[i], 1.6, col); } };
    const carrier = (p, col) => { box(p.x - 0.1, p.y - 0.1, p.x + 0.1, p.y + 0.1, p.z - 0.16, p.z + 0.16, col, col, col, 'rgba(255,255,255,.85)'); };
    const station = (s, col) => box(s.x - 0.2, s.y - 0.12, s.x + 0.2, s.y + 0.12, s.z - 0.45, s.z + 0.15, '#e2e8f0', '#94a3b8', '#cbd5e1', col);
    animate(canvas, kit, step, () => {
      const u = t / T, cm = at(med, Math.min(1, u * 1.25) * len(med)), cs = at(smp, Math.min(1, Math.max(0, u * 1.25 - 0.15)) * len(smp));
      for (let f = 0; f < FZ.length; f++) {
        const z = FZ[f];
        quad([P(0, 0, z), P(GW, 0, z), P(GW, GD, z), P(0, GD, z)], f ? 'rgba(30,41,59,.6)' : 'rgba(15,23,42,.92)', 'rgba(56,189,248,.5)', 1.1);
        quad([P(0, GD, z - 0.1), P(GW, GD, z - 0.1), P(GW, GD, z), P(0, GD, z)], 'rgba(56,189,248,.25)');
        // beds on the wards, the dispensing robot's cabinet and the lab bench on the ground floor
        if (f) for (let x = 2.4; x < GW - 0.5; x += 1.4) box(x, GD - 1.0, x + 0.5, GD - 0.2, z, z + 0.18, '#e2e8f0', '#94a3b8', '#cbd5e1');
        else { box(0.6, 1.9, 2.4, 2.6, z, z + 0.9, 'rgba(147,197,253,.35)', 'rgba(56,189,248,.25)', 'rgba(56,189,248,.18)', 'rgba(125,211,252,.7)'); box(5.6, 2.1, 7.6, 2.6, z, z + 0.4, '#e7e5e4', '#a8a29e', '#d6d3d1'); }
        if (f) station(stn[f], f === 2 ? '#22c55e' : '#ef4444');
        else { station(stn[0], '#22c55e'); station(lab, '#ef4444'); }
        if (f === 0) { route(med, '#38bdf8'); route(smp, '#a78bfa'); }
        if (cm.z >= z - 0.3 && (f === FZ.length - 1 || cm.z < FZ[f + 1] - 0.3)) carrier(cm, '#22c55e');
        if (cs.z >= z - 0.3 && (f === FZ.length - 1 || cs.z < FZ[f + 1] - 0.3)) carrier(cs, '#ef4444');
      }
      // the blower on the roof over the riser
      box(RX - 0.3, RY - 0.25, RX + 0.3, RY + 0.25, FZ[2] + C + 0.2, FZ[2] + C + 0.6, '#475569', '#334155', '#1f2937');
      seg(pt(RX, RY, FZ[2] + C), pt(RX, RY, FZ[2] + C + 0.2), 4.5, 'rgba(219,234,254,.28)');
    });
  }

  const previews = { cube: cubePreview, pod: podPreview, shuttle: shuttlePreview, crane: cranePreview, acr: acrPreview, amr: amrPreview, sort: sortPreview, pallet: palletPreview, climb: climbPreview, zone: zonePreview, tower: towerPreview, park: parkPreview, pocket: pocketPreview, case: casePreview, layer: layerPreview, tube: tubePreview, tray: trayPreview, shoe: shoePreview };
  for (const c of document.querySelectorAll('canvas[data-preview]')) previews[c.dataset.preview](c);
})((globalThis.WS = globalThis.WS || {}));
