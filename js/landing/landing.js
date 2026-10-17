/* Landing page: spec chips from the default config and an animated
 * isometric preview of each simulation type. The previews are decorative and
 * do not run the simulator. */
(function (WS) {
  'use strict';

  const C = WS.DEFAULT_CONFIG;
  const specs = {
    cube: [`${C.gridW} × ${C.gridD} grid`, `${C.gridZ} bins deep`, `${C.robots} robots`, `${C.pickPorts} pick ports`],
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

  /* ---------- cube storage preview ---------- */
  function cubePreview(canvas) {
    const ctx = canvas.getContext('2d');
    const GW = 8, GD = 6, GH = 5; // cells along x and y, bins per stack
    const ZK = 0.62; // vertical scale of one bin relative to a cell
    const rand = rng(11);
    const binCol = [];
    for (let i = 0; i < (GW + GD) * GH; i++) {
      const r = rand();
      binCol.push(r < 0.12 ? '#38bdf8' : r < 0.2 ? '#e879f9' : r < 0.27 ? '#facc15' : null);
    }

    let s = 20, ox = 0, oy = 0;
    const P = (x, y, z) => [ox + (x - y) * s, oy + (x + y) * s * 0.5 - z * s * ZK];

    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const spanX = GW + GD, spanY = (GW + GD) * 0.5 + (GH + 1.2) * ZK;
      s = Math.min(w / (spanX * 1.2), h / (spanY * 1.25));
      ox = w / 2 - (GW - GD) * s / 2;
      oy = h / 2 - ((GW + GD) * 0.5 - (GH + 1.2) * ZK) * s / 2;
    }

    function quad(pts, fill, stroke, lw) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
    }
    // Box with its three visible faces: top, left (y = y1) and right (x = x1).
    function box(x0, y0, x1, y1, z0, z1, top, left, right, stroke) {
      quad([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], left, stroke);
      quad([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], right, stroke);
      quad([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], top, stroke);
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

    function draw(t) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      drawBlock(t);
      robots.filter((r) => r.dig > 0).forEach(drawDig);
      robots.slice().sort((a, b) => a.x + a.y - (b.x + b.y)).forEach((r) => drawRobot(r, t));
    }

    let last = 0, t = 0;
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      t += dt;
      robots.forEach((r) => step(r, dt));
      draw(t);
      requestAnimationFrame(frame);
    }

    resize();
    addEventListener('resize', () => { resize(); if (reduced) draw(t); });
    if (reduced) {
      // Run the robots for a moment off-screen, then show one still frame.
      for (let i = 0; i < 90; i++) { t += 0.05; robots.forEach((r) => step(r, 0.05)); }
      draw(t);
    } else requestAnimationFrame(frame);
  }

  const previews = { cube: cubePreview };
  for (const c of document.querySelectorAll('canvas[data-preview]')) previews[c.dataset.preview](c);
})((globalThis.WS = globalThis.WS || {}));
