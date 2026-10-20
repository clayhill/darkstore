/* Save and share a scenario: the settings live in the page URL. Every setting
 * that differs from the type's defaults is a query parameter (?robots=24&
 * pickPorts=4), and so is the view, so a link opens exactly the setup it was
 * copied from: same settings and seed, so the same run. The URL follows
 * every change (live settings too) without adding to the browser history.
 * Other parameters (warm, tilt, zoom … in js/main.js) are left as they are. */
(function (WS) {
  'use strict';
  const SKIP = new Set(['tick']); // not a scenario setting: the time step is fixed

  WS.Share = {
    // settings from the URL on top of the defaults, each read as its default's type
    read(defaults, search = location.search) {
      const q = new URLSearchParams(search), cfg = {};
      for (const [k, d] of Object.entries(defaults)) {
        if (SKIP.has(k) || !q.has(k)) continue;
        const v = q.get(k);
        if (typeof d === 'number') { if (v.trim() !== '' && Number.isFinite(+v)) cfg[k] = +v; }
        else if (typeof d === 'boolean') cfg[k] = v === '1' || v === 'true';
        else cfg[k] = v;
      }
      return cfg;
    },
    // the query for a running simulation: the settings that differ from the defaults, and the view
    query(app) {
      const sim = app.sim, d = sim.defaults(), q = new URLSearchParams(location.search);
      for (const k of Object.keys(d)) q.delete(k);
      for (const [k, v] of Object.entries(sim.cfg)) {
        if (SKIP.has(k) || !(k in d) || v === d[k]) continue;
        q.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
      }
      if (app.view !== 'floor') q.set('view', app.view); else q.delete('view');
      q.delete('warm'); // a link starts at the beginning of the day
      return q.toString();
    },
    // keep the address bar in step; cheap enough to call on every UI refresh
    sync(app) {
      const s = this.query(app);
      if (s === this.last) return;
      this.last = s;
      try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash); } catch (e) { /* a file:// page in some browsers */ }
    },
    link(app) { const s = this.query(app); return location.href.split(/[?#]/)[0] + (s ? '?' + s : ''); },
    // copy the link to the clipboard, or show it to copy by hand
    async copy(app) {
      const url = this.link(app);
      try { await navigator.clipboard.writeText(url); return true; } catch (e) { window.prompt('Copy this link:', url); return false; }
    },
    // how many settings the link carries, for the toast
    changed(app) { const d = app.sim.defaults(); return Object.keys(app.sim.cfg).filter((k) => !SKIP.has(k) && k in d && app.sim.cfg[k] !== d[k]).length; },
  };
})((globalThis.WS = globalThis.WS || {}));
