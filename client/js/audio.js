// =====================================================================
//  AUDIO (Web Audio, all sounds synthesised - no sound files needed)
//  Engine: a pulse train at the firing frequency through distortion and
//  a throttle-controlled filter, so it rises and falls with RPM and load.
//  Bikes get a raspy single, quads a lower, chunkier note.
//  Two-strokes fire every turn (a higher, ring-ding note), the electric bike whines, and
//  every engine bounces off its rev limiter. Also: tyre/dirt hiss, roost (dirt thrown by
//  the back wheel), chain slap over rough ground, wind, heavy landings, crash, beeps, and a
//  crowd near the start straight that cheers when you land a trick.
//  Other riders get simplified engines, only the nearest few play.
// =====================================================================
export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.voices = new Map();
    this.ready = false;
  }

  // browsers only allow audio after a click / key press
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.engineBus = c.createGain(); this.engineBus.connect(this.master);
    this.fxBus = c.createGain(); this.fxBus.connect(this.master);
    this.noise = this.makeNoise();
    // wind + tyres: filtered noise loops
    this.wind = this.noiseLoop(800, 'bandpass', 0.6);
    this.dirt = this.noiseLoop(2200, 'bandpass', 0.8);
    this.roost = this.noiseLoop(650, 'bandpass', 0.5);       // gritty spray off the back wheel
    this.crowdLoop = this.noiseLoop(1100, 'bandpass', 0.35); // a crowd murmur
    this.applyVolumes();
    this.ready = true;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.get('masterVolume');
    this.engineBus.gain.value = s.get('engineVolume');
    this.fxBus.gain.value = s.get('effectsVolume');
  }

  makeNoise() {
    const c = this.ctx, len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.5; }
    return buf;
  }

  noiseLoop(freq, type, q) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.fxBus);
    src.start();
    return { src, f, g };
  }

  // one engine voice
  makeEngine(kind, full, cfg = {}) {
    const c = this.ctx;
    const two = cfg.stroke === 2, elec = !!cfg.electric;
    const out = c.createGain(); out.gain.value = 0;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 1.2;
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) { const x = (i / 511) * 2 - 1; curve[i] = Math.tanh(x * ({ atv: 2.5, utv: 2.2, buggy: 1.8 }[kind] || 3.5)); }
    shaper.curve = curve;
    const pre = c.createGain(); pre.gain.value = 0.5;
    // pulse train: sawtooth + square an octave apart, plus a "rasp" noise gate
    const o1 = c.createOscillator(); o1.type = elec ? 'sine' : 'sawtooth';
    const o2 = c.createOscillator(); o2.type = elec ? 'triangle' : 'square';
    const g1 = c.createGain(), g2 = c.createGain();
    g1.gain.value = 0.6; g2.gain.value = two ? 0.55 : ({ atv: 0.45, utv: 0.4, buggy: 0.55 }[kind] || 0.3);
    o1.connect(g1); o2.connect(g2); g1.connect(pre); g2.connect(pre);
    let rasp = null;
    if (full && !elec) {
      const ns = c.createBufferSource(); ns.buffer = this.noise; ns.loop = true;
      const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1800; nf.Q.value = 0.7;
      const ng = c.createGain(); ng.gain.value = 0;
      const am = c.createGain(); am.gain.value = 0;
      ns.connect(nf); nf.connect(ng); ng.connect(pre);
      ns.start();
      rasp = { ns, nf, ng };
    }
    pre.connect(shaper); shaper.connect(filter); filter.connect(out);
    o1.start(); o2.start();
    let panner = null;
    if (!full) {
      panner = c.createPanner();
      panner.panningModel = 'equalpower'; panner.distanceModel = 'inverse'; panner.refDistance = 8; panner.rolloffFactor = 1.4;
      out.connect(panner); panner.connect(this.engineBus);
    } else out.connect(this.engineBus);
    // the turbo side-by-side whistles under load
    let turbo = null;
    if (kind === 'utv' && full) {
      const o3 = c.createOscillator(); o3.type = 'sine';
      const g3 = c.createGain(); g3.gain.value = 0;
      o3.connect(g3); g3.connect(out); o3.start();
      turbo = { o3, g3 };
    }
    return { o1, o2, filter, out, panner, rasp, kind, turbo, two, elec, pitch: cfg.pitch || 1, sig: kind + (two ? '2' : elec ? 'e' : '') };
  }

  // called every frame for the player's vehicle
  player(veh, cam) {
    if (!this.ready) return;
    let v = this.voices.get('player');
    const A = veh.cfg.audio, kind = A.kind;
    const sig = kind + (A.stroke === 2 ? '2' : A.electric ? 'e' : '');
    if (!v || v.sig !== sig) { if (v) this.stopVoice(v); v = this.makeEngine(kind, true, A); this.voices.set('player', v); }
    this.setEngine(v, veh, kind === 'none' ? 0 : 1); // the crawler and the office chair have no engine
    const t = this.ctx.currentTime;
    const spd = veh.speed;
    this.wind.g.gain.setTargetAtTime(Math.min(0.25, Math.max(0, spd - 8) * 0.012), t, 0.1);
    this.wind.f.frequency.setTargetAtTime(500 + spd * 25, t, 0.1);
    let slip = 0, dirt = 0, contacts = 0;
    for (const w of veh.wheels) if (w.contact) { slip = Math.max(slip, w.slipLong + Math.max(0, w.slipLat - 0.7) * 0.5); dirt += w.surface; contacts++; }
    const roll = contacts ? Math.min(1, spd / 20) * 0.05 : 0;
    this.dirt.g.gain.setTargetAtTime(roll + Math.min(0.35, slip * 0.3) * (contacts ? 1 : 0), t, 0.05);
    // roost: the driven wheel spinning up dirt under throttle
    let spin = 0;
    for (const w of veh.wheels) if (w.cfg.driven && w.contact) spin = Math.max(spin, w.slipLong);
    const thr = veh.input ? veh.input.throttle : 0;
    this.roost.g.gain.setTargetAtTime(Math.min(0.3, spin * thr * 0.5 * Math.min(1, 0.3 + spd / 15)), t, 0.04);
    this.roost.f.frequency.setTargetAtTime(450 + spd * 18, t, 0.1);
    // chain slap: sharp suspension hits on rough ground
    if (veh.cfg.type === 'bike') {
      let comp = 0;
      for (const w of veh.wheels) comp += w.comp || 0;
      const jolt = Math.abs(comp - (this.prevComp ?? comp));
      this.prevComp = comp;
      if (jolt > 0.09 && t - (this.lastSlap || 0) > 0.09) { this.lastSlap = t; this.chainSlap(Math.min(1, jolt * 5)); }
    }
  }

  chainSlap(k) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3200;
    const g = c.createGain(); g.gain.setValueAtTime(0.09 * k, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(f); f.connect(g); g.connect(this.fxBus); src.start(t, Math.random()); src.stop(t + 0.06);
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1900 + Math.random() * 500;
    const og = c.createGain(); og.gain.setValueAtTime(0.025 * k, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    o.connect(og); og.connect(this.fxBus); o.start(t); o.stop(t + 0.04);
  }

  // crowd: a murmur that grows near the start straight (level 0..1)
  crowd(level) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.crowdLoop.g.gain.setTargetAtTime(Math.min(0.12, level * 0.12) * (0.85 + 0.15 * Math.sin(t * 0.7)), t, 0.4);
  }

  // a cheer when you land a trick (bigger trick, louder)
  cheer(k) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    for (let i = 0; i < 3; i++) {
      const src = c.createBufferSource(); src.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 800 + i * 600; f.Q.value = 0.6;
      const g = c.createGain(); const a = Math.min(0.22, 0.06 + k * 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(a, t + 0.25); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6 + k);
      src.connect(f); f.connect(g); g.connect(this.fxBus); src.start(t, Math.random()); src.stop(t + 2 + k);
    }
  }

  setEngine(v, veh, gain) {
    const t = this.ctx.currentTime;
    const rpm = veh.engine ? veh.engine.rpm : veh.rpm || 2000;
    const thr = veh.input ? veh.input.throttle : veh.thr || 0;
    // firing frequency: singles fire every other turn, the turbo triple 1.5x a turn, the V8 4x a turn
    let fire = (rpm / 60) * (v.two ? 1 : v.elec ? 3 : { bike: 0.5, atv: 0.425, utv: 1.5, buggy: 4 }[v.kind] || 0.5);
    fire *= Math.sqrt(v.pitch || 1);
    if (v.turbo) { v.turbo.o3.frequency.setTargetAtTime(1800 + rpm * 0.55, t, 0.05); v.turbo.g3.gain.setTargetAtTime(thr * 0.05 * Math.min(1, rpm / 5000), t, 0.15); }
    v.o1.frequency.setTargetAtTime(fire, t, 0.02);
    v.o2.frequency.setTargetAtTime(fire * 0.5, t, 0.02);
    v.filter.frequency.setTargetAtTime((v.kind === 'buggy' ? 260 : 400) + thr * (v.kind === 'buggy' ? 1500 : v.two ? 3400 : 2600) + rpm * (v.two ? 0.2 : 0.12), t, 0.04);
    const crashed = veh.crashed;
    // rev limiter: the engine cuts in and out, about 22 times a second
    const bounce = veh.engine && veh.engine.limiter && thr > 0.3 ? (Math.floor(t * 22) % 2 ? 0.3 : 1) : 1;
    v.out.gain.setTargetAtTime(crashed ? 0.04 : (v.elec ? 0.07 + thr * 0.08 : 0.16 + thr * 0.14) * gain * bounce, t, bounce < 1 ? 0.005 : 0.05);
    if (v.rasp) {
      v.rasp.ng.gain.setTargetAtTime(thr * 0.25, t, 0.05);
      v.rasp.nf.frequency.setTargetAtTime(900 + rpm * 0.18, t, 0.05);
    }
  }

  // other riders: only the nearest 3 get a voice
  others(list, cam) {
    if (!this.ready) return;
    const c = this.ctx;
    const L = c.listener;
    const p = cam.position;
    const f = cam.getWorldDirection(this._dir || (this._dir = cam.position.clone()));
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
    const near = list.map((o) => ({ o, d: o.pos.distanceToSquared(p) })).sort((a, b) => a.d - b.d).slice(0, 3);
    const keep = new Set();
    for (const { o } of near) {
      const key = 'o:' + o.key;
      keep.add(key);
      let v = this.voices.get(key);
      if (!v || v.kind !== o.kind) { if (v) this.stopVoice(v); v = this.makeEngine(o.kind, false); this.voices.set(key, v); }
      this.setEngine(v, o, o.kind === 'none' ? 0 : 0.9);
      const t = c.currentTime;
      v.panner.positionX ? (v.panner.positionX.setTargetAtTime(o.pos.x, t, 0.03), v.panner.positionY.setTargetAtTime(o.pos.y, t, 0.03), v.panner.positionZ.setTargetAtTime(o.pos.z, t, 0.03)) : v.panner.setPosition(o.pos.x, o.pos.y, o.pos.z);
    }
    for (const [k, v] of this.voices) if (k.startsWith('o:') && !keep.has(k)) { this.stopVoice(v); this.voices.delete(k); }
  }

  stopVoice(v) {
    try {
      const t = this.ctx.currentTime;
      v.out.gain.setTargetAtTime(0, t, 0.05);
      setTimeout(() => { try { v.o1.stop(); v.o2.stop(); if (v.rasp) v.rasp.ns.stop(); if (v.turbo) v.turbo.o3.stop(); v.out.disconnect(); } catch { /* already stopped */ } }, 300);
    } catch { /* ignore */ }
  }

  thud(strength) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180 + strength * 200;
    const g = c.createGain();
    g.gain.setValueAtTime(Math.min(1, 0.25 + strength * 0.5), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f); f.connect(g); g.connect(this.fxBus);
    src.start(t, Math.random()); src.stop(t + 0.4);
    // suspension "clack"
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const og = c.createGain(); og.gain.setValueAtTime(0.3 * strength, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(og); og.connect(this.fxBus); o.start(t); o.stop(t + 0.2);
    // the body of the hit: a low boom, and a metal clank when the suspension bottoms out
    const b = c.createOscillator(); b.type = 'sine'; b.frequency.setValueAtTime(70, t); b.frequency.exponentialRampToValueAtTime(32, t + 0.3);
    const bg = c.createGain(); bg.gain.setValueAtTime(Math.min(0.6, 0.2 + strength * 0.35), t); bg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    b.connect(bg); bg.connect(this.fxBus); b.start(t); b.stop(t + 0.36);
    if (strength > 0.9) {
      const k = c.createOscillator(); k.type = 'square'; k.frequency.setValueAtTime(420, t + 0.02); k.frequency.exponentialRampToValueAtTime(260, t + 0.12);
      const kg = c.createGain(); kg.gain.setValueAtTime(0.0001, t); kg.gain.linearRampToValueAtTime(0.06, t + 0.025); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      k.connect(kg); kg.connect(this.fxBus); k.start(t); k.stop(t + 0.15);
    }
  }

  crash() {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    for (let k = 0; k < 3; k++) {
      const src = c.createBufferSource(); src.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 300 + k * 700; f.Q.value = 0.8;
      const g = c.createGain();
      const t0 = t + k * 0.12;
      g.gain.setValueAtTime(0.6, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      src.connect(f); f.connect(g); g.connect(this.fxBus);
      src.start(t0, Math.random()); src.stop(t0 + 0.55);
    }
  }

  beep(high) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = high ? 1320 : 660;
    const g = c.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + (high ? 0.6 : 0.25));
    o.connect(g); g.connect(this.fxBus); o.start(t); o.stop(t + 0.65);
  }

  silenceAll() {
    if (!this.ready) return;
    for (const v of this.voices.values()) this.stopVoice(v);
    this.voices.clear();
    const t = this.ctx.currentTime;
    this.wind.g.gain.setTargetAtTime(0, t, 0.05);
    this.dirt.g.gain.setTargetAtTime(0, t, 0.05);
    this.roost.g.gain.setTargetAtTime(0, t, 0.05);
    this.crowdLoop.g.gain.setTargetAtTime(0, t, 0.2);
  }
}
