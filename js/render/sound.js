/* Procedural soundscape (Web Audio, no sound files). It listens to the
 * simulation rather than being told: every frame it looks at where the
 * machines are and what they do, and turns that into sound near the point
 * the camera looks at.
 * - Continuous: the faint whine of electric drives and the hiss of their
 *   wheels on the floor, louder the more machines move near you and higher
 *   as they go faster, the whir of conveyors, and the air of the hall.
 * - Events: a servo chirp when a machine sets off, a clunk when forks or a
 *   lift engage, a winch zip, a parcel sliding off, rollers clacking as a
 *   storage unit reaches a station, the scanner beep of a pick, tape at the
 *   pack bench, a chime when a robot starts charging. Panned left or right,
 *   softer further away, and at most a dozen a second: at high speed they
 *   melt into the hum. */
(function (WS) {
  'use strict';
  const RATE = 12, BURST = 5; // event sounds per second, and how many may come at once

  class Sound {
    constructor(app) {
      this.app = app; this.on = false; this.ctx = null;
      this.prev = new Map(); // machine k → { x, y, z, state }
      this.counts = null; this.tokens = BURST; this.simT = null;
      try { this.wanted = localStorage.getItem('ds-sound') === '1'; } catch (e) { this.wanted = false; }
      const b = document.getElementById('btn-sound');
      if (b) b.addEventListener('click', () => this.toggle());
      // browsers start audio only after a gesture: resume on the first one if sound was left on
      if (this.wanted) {
        const go = () => { window.removeEventListener('pointerdown', go); if (this.wanted && !this.on) this.start(); };
        window.addEventListener('pointerdown', go);
      }
      this.sync();
    }
    sync() { const b = document.getElementById('btn-sound'); if (b) { b.classList.toggle('on', this.on); b.textContent = this.on ? 'Sound on' : 'Sound'; } }
    toggle() {
      if (this.on) this.stop(); else this.start();
      this.wanted = this.on;
      try { localStorage.setItem('ds-sound', this.on ? '1' : '0'); } catch (e) { /* private window */ }
    }
    start() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.build();
      }
      this.ctx.resume();
      this.on = true; this.prev.clear(); this.counts = null;
      this.master.gain.setTargetAtTime(0.7, this.ctx.currentTime, 0.3);
      this.sync();
    }
    stop() {
      if (this.ctx) { this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); setTimeout(() => { if (!this.on) this.ctx.suspend(); }, 400); }
      this.on = false; this.sync();
    }

    // ---------------------------------------------------------------- the graph
    build() {
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 0;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
      this.master.connect(comp).connect(c.destination);
      // a few seconds of white noise to draw from
      const n = c.sampleRate * 3, white = c.createBuffer(1, n, c.sampleRate), w = white.getChannelData(0);
      for (let i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;
      this.white = white;
      const loop = (buf) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
      const gain = (v) => { const g = c.createGain(); g.gain.value = v; return g; };
      const filter = (type, f, q = 0.7) => { const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; return fl; };
      // the hall: faint air from the ventilation, nothing low or tonal
      loop(white).connect(filter('bandpass', 900, 0.4)).connect(filter('lowpass', 2500)).connect(gain(0.006)).connect(this.master);
      // electric drives: a single clean, quiet whine that rises with speed (no buzz)
      this.motorG = gain(0); this.motorPan = c.createStereoPanner();
      this.motors = [c.createOscillator()];
      this.motors[0].type = 'sine'; this.motors[0].frequency.value = 800; this.motors[0].start();
      this.motors[0].connect(this.motorG).connect(this.motorPan).connect(this.master);
      // wheels on the floor: a soft, mellow hiss
      this.rollF = filter('lowpass', 900, 0.5); this.rollG = gain(0);
      loop(white).connect(filter('highpass', 180)).connect(this.rollF).connect(this.rollG).connect(this.motorPan);
      // conveyors: a smooth whir of rollers, steady (no pulsing)
      this.convG = gain(0);
      loop(white).connect(filter('bandpass', 600, 0.6)).connect(filter('lowpass', 1400)).connect(this.convG).connect(this.master);
    }

    // ---------------------------------------------------------------- one-shot voices
    // envelope helper: a gain node rising to v in a and falling over d seconds
    env(t, v, a, d) { const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); return g; }
    out(node, pan) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p).connect(this.master); }
    tone(t, type, f0, f1, dur, v, pan) {
      const o = this.ctx.createOscillator(), g = this.env(t, v, 0.005, dur);
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      o.connect(g); this.out(g, pan); o.start(t); o.stop(t + dur + 0.05);
    }
    noise(t, type, f0, f1, q, dur, v, pan, a = 0.003) {
      const s = this.ctx.createBufferSource(), fl = this.ctx.createBiquadFilter(), g = this.env(t, v, a, dur);
      s.buffer = this.white; s.loopStart = Math.random() * 2; s.loop = true;
      fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
      s.connect(fl).connect(g); this.out(g, pan); s.start(t, Math.random() * 2); s.stop(t + a + dur + 0.05);
    }
    play(kind, v, pan) {
      const t = this.ctx.currentTime + 0.01, r = 0.9 + Math.random() * 0.2;
      switch (kind) {
        case 'servo': this.tone(t, 'triangle', 520 * r, 1150 * r, 0.09, 0.09 * v, pan); this.noise(t, 'highpass', 4000, 4000, 0.7, 0.012, 0.05 * v, pan); break;
        case 'clunk': this.tone(t, 'sine', 120 * r, 48, 0.16, 0.32 * v, pan); this.noise(t, 'lowpass', 1400, 300, 0.8, 0.06, 0.14 * v, pan); this.noise(t + 0.09, 'bandpass', 2600, 2600, 4, 0.02, 0.06 * v, pan); break;
        case 'winch': this.tone(t, 'sine', 900 * r, 1500 * r, 0.45, 0.025 * v, pan); this.noise(t, 'bandpass', 1200, 2200, 2, 0.45, 0.035 * v, pan, 0.05); break;
        case 'slide': this.noise(t, 'bandpass', 2400, 500, 1.2, 0.28, 0.12 * v, pan, 0.02); this.tone(t + 0.3, 'sine', 95, 45, 0.14, 0.25 * v, pan); break;
        case 'rollers': for (let k = 0; k < 4; k++) this.noise(t + k * 0.075, 'bandpass', 1900 * r, 1900 * r, 6, 0.018, 0.09 * v, pan); this.tone(t + 0.32, 'sine', 140, 70, 0.08, 0.12 * v, pan); break;
        case 'beep': this.tone(t, 'sine', 1975, 1975, 0.07, 0.06 * v, pan); break;
        case 'tape': this.noise(t, 'bandpass', 1800, 3200, 0.9, 0.34, 0.1 * v, pan, 0.02); break;
        case 'chime': this.tone(t, 'sine', 880, 880, 0.35, 0.05 * v, pan); this.tone(t + 0.12, 'sine', 1318, 1318, 0.45, 0.04 * v, pan); break;
      }
    }

    // ---------------------------------------------------------------- listening to the sim
    // where the ear is ({ x, y }), how far it hears (cells) and which way is right
    listener() {
      const app = this.app;
      if (app.view === '3d' && app.gl && app.gl.camera) {
        const gl = app.gl, cam = gl.camera, e = cam.matrixWorld.elements, inside = gl.cam.walk || (gl.cam.mode && gl.cam.mode !== 'free' && gl.cam.mode !== 'orbit');
        const at = inside ? { x: cam.position.x, y: cam.position.z } : { x: gl.cam.tx, y: gl.cam.ty };
        return { at, R: inside ? 7 : Math.max(5, gl.cam.dist * 0.45), right: { x: e[0], y: e[2] } };
      }
      const iso = app.iso;
      if (!iso || !iso.w) return null;
      const a = iso.toWorld(iso.w / 2, iso.h / 2, 0), b = iso.toWorld(iso.w, iso.h / 2, 0);
      return { at: a, R: Math.max(4, Math.hypot(b.x - a.x, b.y - a.y) * 0.6), right: { x: (b.x - a.x) / (Math.hypot(b.x - a.x, b.y - a.y) || 1), y: (b.y - a.y) / (Math.hypot(b.x - a.x, b.y - a.y) || 1) } };
    }
    // where machine k is (3D knows every type's machines; the floor view the robots')
    posOf(r, k) {
      const gl = this.app.gl;
      if (this.app.view === '3d' && gl) { const p = gl.followPos(k, 1); if (p) return { x: p.x, y: p.y, z: p.z || 0 }; }
      if (r.rx != null) return { x: r.rx + 0.5, y: r.ry + 0.5, z: r.z || 0 };
      if (r.x != null && r.y != null) return { x: r.x + 0.5, y: r.y + 0.5, z: 0 };
      return null;
    }
    update(dtReal) {
      if (!this.on || !this.ctx) return;
      const sim = this.app.sim, L = this.listener();
      if (!L) return;
      const t = this.ctx.currentTime, dtSim = this.simT == null ? 0 : sim.time - this.simT;
      this.simT = sim.time;
      if (dtSim < 0) { this.prev.clear(); this.counts = null; return; } // restarted
      this.tokens = Math.min(BURST, this.tokens + dtReal * RATE);
      const near = (p) => { if (!p) return { g: 0.25, pan: 0 }; const dx = p.x - L.at.x, dy = p.y - L.at.y, d = Math.hypot(dx, dy); return { g: 1 / (1 + (d / L.R) ** 2), pan: d > 0.01 ? ((dx * L.right.x + dy * L.right.y) / d) * Math.min(1, d / 3) : 0 }; };
      const events = [];
      const ev = (kind, p, w = 1) => { const n = near(p); if (n.g > 0.06) events.push({ kind, v: n.g * w, pan: n.pan }); };
      // machines: movement feeds the hum, state changes are events
      let move = 0, speedSum = 0, panSum = 0;
      sim.fleet.forEach((r, k) => {
        const p = this.posOf(r, k), st = r.displayState || r.state, was = this.prev.get(k);
        if (p) {
          const LZ = WS.View3D ? WS.View3D.LZ : 0.43;
          const sp = was && dtSim > 0 ? Math.hypot(p.x - was.x, p.y - was.y, (p.z - was.z) * LZ) / dtSim : 0;
          if (sp > 0.05) { const n = near(p); move += n.g; speedSum += n.g * Math.min(3, sp); panSum += n.g * n.pan; }
        } else if (/MOVING|TRANSPORT|STORING|TO_CHARGER/.test(st || '') && dtSim > 0) { move += 0.25; speedSum += 0.25; } // a machine the floor view cannot place: heard from afar
        if (was && st !== was.state) this.stateEvent(was.state, st, p, ev);
        this.prev.set(k, Object.assign({ state: st }, p || { x: 0, y: 0, z: 0 }));
      });
      // stations, pack benches and charging, from their counters
      const L2 = sim.layout, now = this.countsNow(sim), was = this.counts;
      if (was) {
        sim.ports.forEach((pt, k) => {
          const p = sim.soundPos ? sim.soundPos(pt) : L2 && L2.operatorPos ? L2.operatorPos(pt) : pt.slot || pt.drop;
          if (now.presented[k] > was.presented[k]) ev('rollers', p);
          if (now.lines[k] > was.lines[k]) ev('beep', p, 0.8);
        });
        if (sim.oms) sim.oms.packers.forEach((pk, k) => { if (now.packed[k] > was.packed[k]) ev(pk.kind === 'manual' ? 'tape' : 'clunk', L2.packerPos(pk.idx), 0.8); });
        // a sorter's tray tipping or shoes pushing a parcel into its chute
        if (sim.chuteSounds) sim.chutes.forEach((ch, k) => { if (now.sorted[k] > was.sorted[k]) ev('slide', ch, 0.8); });
        // a type's own events since the last frame (ZoneHop: the A-frame's ejectors, a window tipping)
        if (sim.soundEvents && dtSim > 0) for (const e of sim.soundEvents(sim.time - dtSim, sim.time)) ev(e.kind, e.p, e.w);
      }
      this.counts = now;
      events.sort((a, b) => b.v - a.v);
      for (const e of events) { if (this.tokens < 1) break; this.tokens -= 1; this.play(e.kind, Math.min(1, e.v), e.pan); }
      // continuous voices
      let conv = sim.oms ? sim.oms.conveyor.reduce((s, it) => s + (it.queued ? 0 : near(sim.oms.posOnPath(it)).g), 0) : 0;
      if (sim.soundLoop && dtSim > 0 && !sim.loopStopped) conv += 3 * near(sim.soundLoop).g; // a sorter's tray chain or slats never stop
      if (sim.net) for (const b of sim.net.belts) for (const it of b.totes) if (it.moving) conv += near(it).g; // ZoneHop's belts
      const level = Math.tanh(move / 3), avg = move > 0 ? speedSum / move : 0;
      const k = 0.15;
      this.motorG.gain.setTargetAtTime(0.008 * level * Math.min(1, avg + 0.2), t, k);
      this.motors[0].frequency.setTargetAtTime(700 + Math.min(1.5, avg) * 600, t, k);
      this.rollG.gain.setTargetAtTime(0.045 * level * Math.min(1, avg), t, k);
      this.rollF.frequency.setTargetAtTime(600 + Math.min(1.5, avg) * 400, t, k);
      this.motorPan.pan.setTargetAtTime(move > 0 ? Math.max(-0.8, Math.min(0.8, panSum / move)) : 0, t, k);
      this.convG.gain.setTargetAtTime(0.025 * Math.tanh(conv / 2), t, 0.3);
    }
    countsNow(sim) {
      return {
        presented: sim.ports.map((p) => (p.stats ? p.stats.presented : 0)),
        lines: sim.ports.map((p) => (p.stats ? p.stats.lines : 0)),
        packed: sim.oms ? sim.oms.packers.map((pk) => pk.done) : [],
        sorted: sim.chutes ? sim.chutes.map((ch) => ch.sorted) : [],
      };
    }
    // the sound of a machine changing what it does
    stateEvent(from, to, p, ev) {
      if (to === 'CHARGING') return ev('chime', p, 0.7);
      if (to === 'LIFTING_POD' || to === 'MAST' || (to === 'AT_PORT' && from !== 'WAITING_PORT')) return ev('clunk', p);
      if (to === 'DIGGING_BIN' || to === 'RESTACKING') return ev('winch', p);
      if (to === 'HANDLING') return ev(this.app.sim.chutes ? 'slide' : 'clunk', p); // a sorter robot tips its parcel; elsewhere forks or a handler engage
      if (/MOVING|TRANSPORT|STORING|TO_CHARGER/.test(to) && !/MOVING|TRANSPORT|STORING|TO_CHARGER/.test(from || '')) return ev('servo', p, 0.8);
    }
  }

  WS.Sound = Sound;
})((globalThis.WS = globalThis.WS || {}));
