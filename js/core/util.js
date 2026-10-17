/* Shared helpers: seeded RNG, binary heap, formatting. */
(function (WS) {
  'use strict';
  const U = (WS.U = {});

  // mulberry32 — small, fast, deterministic PRNG so scenarios are reproducible
  U.rng = function (seed) {
    let a = seed >>> 0;
    const f = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.weighted = (weights, total) => {
      if (total === undefined) total = weights.reduce((s, w) => s + w, 0);
      let r = f() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
      }
      return weights.length - 1;
    };
    return f;
  };

  class Heap {
    constructor(cmp) { this.a = []; this.cmp = cmp; }
    get size() { return this.a.length; }
    push(x) {
      const a = this.a; a.push(x);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this.cmp(a[i], a[p]) >= 0) break;
        [a[i], a[p]] = [a[p], a[i]]; i = p;
      }
    }
    pop() {
      const a = this.a; if (!a.length) return undefined;
      const top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
          if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
          if (m === i) break;
          [a[i], a[m]] = [a[m], a[i]]; i = m;
        }
      }
      return top;
    }
  }
  U.Heap = Heap;

  U.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.pad = (n, w) => String(n).padStart(w, '0');
  U.fmtClock = (s) => {
    const d = Math.floor(s / 86400);
    s -= d * 86400;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return (d ? 'D' + (d + 1) + ' ' : '') + U.pad(h, 2) + ':' + U.pad(m, 2) + ':' + U.pad(sec, 2);
  };
  U.fmtDur = (s) => {
    if (!isFinite(s)) return '—';
    if (s < 60) return s.toFixed(0) + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + U.pad(Math.floor(s % 60), 2) + 's';
    return Math.floor(s / 3600) + 'h ' + U.pad(Math.floor((s % 3600) / 60), 2) + 'm';
  };
  U.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
})((globalThis.WS = globalThis.WS || {}));
