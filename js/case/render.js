/* CaseCraft has no floor view: its structure is many levels deep, which only
 * the 3D view (js/case/render3d.js) shows, and the page opens in it. The app
 * still keeps its view options and the selection in an isometric view
 * object; this one only says so while the 3D view loads. */
(function (WS) {
  'use strict';

  class CaseRenderer extends WS.IsoRenderer {
    fit() {}
    pick() { return null; }
    draw() {
      const c = this.ctx;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.fillStyle = '#0b1220'; c.fillRect(0, 0, this.w, this.h);
      c.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#94a3b8'; c.fillText('CaseCraft is shown in 3D: loading the 3D view…', this.w / 2, this.h / 2);
    }
  }

  WS.CaseRenderer = CaseRenderer;
})((globalThis.WS = globalThis.WS || {}));
