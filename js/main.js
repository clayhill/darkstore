/* App shell: fixed-step simulation loop decoupled from rendering. */
(function (WS) {
  'use strict';
  const app = {
    sim: null, speed: 2, paused: false, view: 'floor',
    acc: 0, last: 0,

    start() {
      // each simulation page names its storage type on <body data-kind>
      const kind = document.body.dataset.kind, K = KINDS[kind] && KINDS[kind]();
      if (!K || !K.Sim || !K.Renderer) {
        const t = document.getElementById('toast');
        t.textContent = `The ${kind} simulation did not load. Reload the page (in Safari: ⌥⌘R).`; t.className = 'toast show err';
        return;
      }
      this.Kind = K;
      this.sim = new this.Kind.Sim();
      this.iso = new this.Kind.Renderer(document.getElementById('iso'), this);
      this.cr = new WS.ControlRoom(this, document.getElementById('crmap'), document.getElementById('chT'), document.getElementById('chU'));
      this.ui = new WS.UI(this);
      const ro = new ResizeObserver(() => { const fresh = !this.iso.w; this.iso.resize(); if (fresh) this.iso.fit(); });
      ro.observe(document.getElementById('iso-wrap'));
      this.iso.resize(); this.iso.fit();
      // optional URL parameters: ?warm=<sim seconds to pre-run>&view=floor|split|control&xray=1
      const q = new URLSearchParams(location.search);
      const warm = +q.get('warm') || 0;
      for (let k = 0; k < warm / this.sim.cfg.tick; k++) this.sim.tick();
      if (q.get('view')) this.setView(q.get('view'));
      for (const o of ['xray', 'heat']) if (q.get(o) === '1') document.querySelector(`[data-opt="${o}"]`).click();
      if (q.get('tab')) this.ui.setTab(q.get('tab'));
      if (+q.get('zoom')) this.iso.zoomAt(this.iso.w * (+q.get('zx') || 0.5), this.iso.h * (+q.get('zy') || 0.5), +q.get('zoom'));
      this.ui.refresh();
      this.render(1);
      requestAnimationFrame((t) => this.frame(t));
    },
    restart(cfg) {
      this.sim = new this.Kind.Sim(cfg);
      this.iso.selected = null; this.iso.xkey = '';
      this.ui.onRestart();
      this.iso.fit();
      this.ui.toast('Simulation restarted');
    },
    setView(v) {
      this.view = v;
      document.getElementById('layout').className = 'layout view-' + v;
      [...document.getElementById('views').children].forEach((b) => b.classList.toggle('on', b.dataset.view === v));
      this.iso.resize(); this.iso.fit(); this.ui.refresh();
    },
    render(alpha) {
      if (this.view !== 'control') this.iso.draw(alpha);
      if (this.view !== 'floor') { this.cr.drawMap(alpha); this.cr.drawThroughput(); this.cr.drawUtil(); }
    },
    frame(t) {
      const dtReal = Math.min(0.1, (t - (this.last || t)) / 1000);
      this.last = t;
      const step = this.sim.cfg.tick;
      if (!this.paused) {
        this.acc += dtReal * this.speed;
        const t0 = performance.now();
        // run whole ticks; bail out if the frame budget is exhausted so the UI stays responsive
        while (this.acc >= step) {
          this.sim.tick(); this.acc -= step;
          if (performance.now() - t0 > 28) { this.acc = Math.min(this.acc, step); break; }
        }
      }
      this.render(this.paused ? 1 : Math.min(1, this.acc / step));
      this.uiClock = (this.uiClock || 0) + dtReal;
      if (this.uiClock > 0.25) { this.uiClock = 0; this.ui.refresh(); }
      requestAnimationFrame((tt) => this.frame(tt));
    },
  };
  const KINDS = {
    cube: () => ({ Sim: WS.CubeSim, Renderer: WS.CubeRenderer }),
    pod: () => ({ Sim: WS.PodSim, Renderer: WS.PodRenderer }),
  };
  WS.app = app;
  window.addEventListener('error', (e) => {
    const t = document.getElementById('toast');
    if (t) { t.textContent = 'Error: ' + e.message + (e.lineno ? ` (${(e.filename || '').split('/').pop()}:${e.lineno})` : ''); t.className = 'toast show err'; }
  });
  window.addEventListener('DOMContentLoaded', () => app.start());
})((globalThis.WS = globalThis.WS || {}));
