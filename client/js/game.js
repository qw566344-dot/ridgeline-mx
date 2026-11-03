// =====================================================================
//  GAME: loads a track, spawns riders, runs the fixed-step physics,
//  draws everything with smooth interpolation, and runs the modes:
//    freeride, timetrial, race, practice, freestyle (tricks for points)
//  Multiplayer sessions use the same modes with remote riders that are
//  NOT simulated here - they are drawn from network snapshots (net.js).
// =====================================================================
import * as THREE from 'three';
import { getTrack } from '/shared/tracks.js';
import { makeWorld, heightAt } from '/shared/terrain.js';
import { KEYS } from './input.js';
import { getVehicle, BIKE_COLORS, VEHICLES, paintFor } from '/shared/vehicles.js';
import { pointAt, sampleArr, wrapS, deltaS } from '/shared/trackgen.js';
import { LapTracker, GAME } from '/shared/rules.js';
import { Vehicle, FIXED_DT } from './sim/vehicle.js';
import { AIDriver } from './sim/ai.js';
import { TerrainMesh } from './render/terrainMesh.js';
import { Scenery } from './render/scenery.js';
import { Effects } from './render/effects.js';
import { VehicleVisual } from './render/vehicleModel.js';
import { Rider, riderScheme } from './render/rider.js';
import { GEAR_SETS, REWARDS, upgradeLevels } from '/shared/shop.js';
import { CameraRig, CAMERA_MODES } from './camera.js';
import { Recorder, ReplayStore, poseRider } from './replay.js';

const AI_NAMES = ['Tanner', 'Kade', 'Brody', 'Jett', 'Ryder', 'Colt', 'Maverick', 'Dax', 'Wyatt', 'Blaze', 'Cruz', 'Ace'];
const MAX_STEPS = 8;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3();

export class Game {
  constructor({ renderer, settings, audio, input, ui }) {
    this.R = renderer;
    this.settings = settings;
    this.audio = audio;
    this.input = input;
    this.ui = ui;
    this.scene = renderer.scene;
    this.cam = new CameraRig(renderer.camera);
    this.cam.setMode(settings.get('camera') || 0);
    this.world = null; this.trackId = null;
    this.riders = [];
    this.player = null;
    this.mode = 'none';
    this.state = 'idle';
    this.acc = 0;
    this.simTime = 0;
    this.raceTime = 0;
    this.phase = 'none';
    this.paused = false;
    this.messages = [];
    this.fpsSamples = [];
    this.lowFpsTime = 0;
    this.net = null;
    this.applySettings();
    settings.onChange(() => this.applySettings());
  }

  applySettings() {
    const s = this.settings;
    this.cam.sensitivity = s.get('cameraSensitivity');
    this.cam.mouseSens = s.get('mouseSensitivity');
    this.cam.shakeScale = s.get('cameraShake');
    this.cam.baseFov = s.get('fov') || 62;
    this.cam.effects = s.get('screenEffects') !== false;
    this.cam.followFlips = s.get('fpFollowFlips') !== false;
    if (this.effects) this.effects.setQuality(s.quality());
    for (const r of this.riders) if (r.veh) this.applyAssists(r.veh, r.isPlayer);
    this.audio.applyVolumes();
  }

  applyAssists(veh, isPlayer) {
    if (!isPlayer) return;
    const s = this.settings;
    veh.assist.landing = s.get('landingAssist');
    veh.assist.traction = s.get('tractionAssist');
    veh.assist.wheelie = s.get('wheelieAssist');
  }

  // ------------------------------------------------------------------ track
  async loadTrack(id, onProgress = () => {}) {
    if (this.trackId === id && this.world) return;
    this.state = 'loading'; // the frame loop waits while the scene is swapped
    this.clearRiders();
    if (this.terrain) { this.terrain.dispose(); this.terrain = null; }
    if (this.scenery) { this.scenery.dispose(); this.scenery = null; }
    if (this.effects) { this.effects.dispose(); this.effects = null; }
    const def = getTrack(id);
    onProgress('Shaping the dirt...');
    await tick();
    this.world = makeWorld(def);
    // resets look here so nobody gets dropped on top of another rider
    this.world.blockers = (self) => this.riders.filter((r) => r.veh !== self && (r.veh || (r.remote && r.remote.pos))).map((r) => (r.veh ? r.veh.pos : r.remote.pos));
    this.R.setLook(def.look);
    const q = this.settings.quality();
    onProgress('Building terrain...');
    await tick();
    this.terrain = new TerrainMesh(this.world, this.R, q);
    this.scene.add(this.terrain.group);
    onProgress('Planting trees and fences...');
    await tick();
    this.scenery = new Scenery(this.world, this.R, q);
    this.scene.add(this.scenery.group);
    this.effects = new Effects(this.scene, this.world, q);
    this.trackId = id;
    this.ui.buildMinimap(this.world.T);
    onProgress('Ready');
  }

  // ------------------------------------------------------------------ riders
  addRider({ id, name, vehicleId, colorId, gearId = 'match', number, isPlayer = false, ai = null, remote = false }) {
    const def = getVehicle(vehicleId);
    const scheme = paintFor(vehicleId, colorId);
    const vis = new VehicleVisual(def, scheme, number);
    vis.tryLoadModel();
    this.scene.add(vis.root);
    const rs = riderScheme(scheme, gearId, GEAR_SETS, BIKE_COLORS);
    const rider = new Rider(rs);
    rider.setNumber(number, rs);
    rider.attachTo(vis.model);
    const r = { id, name, number, isPlayer, vis, rider, vehicleId, colorId, gearId, lap: new LapTracker(this.world.T), finished: false, best: null, key: String(id) };
    if (!remote) {
      const upgrades = isPlayer && this.account && this.account.profile ? upgradeLevels(this.account.profile.owned, vehicleId) : {};
      r.veh = new Vehicle(vehicleId, this.world, { id, ai: !!ai, upgrades });
      this.applyAssists(r.veh, isPlayer);
      if (ai) r.ai = new AIDriver(r.veh, ai);
    } else {
      r.remote = { buf: [], state: null, crashed: false, proxy: makeProxy(getVehicle(vehicleId)) };
    }
    this.riders.push(r);
    if (isPlayer) this.player = r;
    return r;
  }

  removeRider(r) {
    r.vis.dispose();
    r.rider.dispose();
    this.riders = this.riders.filter((x) => x !== r);
    if (this.player === r) this.player = null;
  }

  clearRiders() {
    for (const r of [...this.riders]) this.removeRider(r);
    this.riders = [];
    this.player = null;
    this.audio.silenceAll();
  }

  placeRider(r, s, u) {
    const T = this.world.T;
    const p = pointAt(T, s, u);
    r.veh.placeAt(p.x, p.z, p.tx, p.tz);
    r.veh.trackS = wrapS(T, s); r.veh.safeS = r.veh.trackS;
    if (!r.rider.attached) r.rider.attachTo(r.vis.model);
    r.lap.lastS = null;
  }

  // ------------------------------------------------------------------ modes
  async startMenu() {
    this.mode = 'menu';
    this.paused = false;
    await this.loadTrack(this.settings.get('track'));
    this.clearRiders();
    const T = this.world.T;
    for (let i = 0; i < 5; i++) {
      const vd = VEHICLES[i % VEHICLES.length];
      const r = this.addRider({ id: 100 + i, name: AI_NAMES[i], vehicleId: vd.id, colorId: BIKE_COLORS[(i * 3) % BIKE_COLORS.length].id, number: 10 + i * 7, ai: { skill: 0.88 + Math.random() * 0.1, lane: (i - 2) * 1.2 } });
      this.placeRider(r, T.finishS + 40 + i * 60, (i - 2) * 1.5);
    }
    this.focus = this.riders[0];
    this.focusTimer = 0;
    this.cam.setMode(3);
    this.phase = 'go';
    this.state = 'running';
  }

  // opts: { mode, trackId, vehicleId, colorId, laps, aiCount, section, mp }
  async startSession(opts) {
    this.saveRecording(); // a restart: keep the run you just did
    this.replay = null; this.ui.hideReplay && this.ui.hideReplay();
    this.ui.showLoading('Loading ' + getTrack(opts.trackId).name + '...');
    await this.loadTrack(opts.trackId, (m) => this.ui.showLoading(m));
    this.clearRiders();
    this.mode = opts.mode;
    this.autopilot = null;
    this.net = null; // multiplayer sets this again after the session starts
    this.combo = 0; this.trickScore = 0;
    this.opts = opts;
    this.laps = opts.laps || 3;
    this.paused = false;
    this.results = null;
    this.raceTime = 0;
    this.simTime = 0;
    this.messages = [];
    const T = this.world.T;
    const name = this.settings.get('playerName') || 'You';
    const grid = this.scenery.gridSlots(Math.max(1, (opts.aiCount || 0) + 1 + (opts.mp ? opts.mp.players.length : 0)));
    const me = this.addRider({ id: opts.mp ? opts.mp.myId : 1, name, vehicleId: opts.vehicleId, colorId: opts.colorId, gearId: opts.gearId, number: opts.number || 1, isPlayer: true });
    let slot = opts.mp ? opts.mp.slot : 0;
    if (opts.mp && opts.mp.spectator) this.makeSpectator(me);
    if (opts.mode !== 'practice') {
      const g = grid[slot] || grid[0];
      this.placeRider(me, g.s, g.u);
    }
    if (opts.mode === 'practice') {
      const sec = T.sections.find((s) => s.name === opts.section) || T.sections[0];
      this.practice = { sec, best: this.settings.bestSection(this.trackId, opts.vehicleId, sec.name), timing: null, last: null };
      this.placeRider(me, sec.s0 - 30, 0);
    }
    // AI opponents (single player race)
    if (opts.mode === 'race' && !opts.mp) {
      const skillBase = { easy: 0.84, medium: 0.91, hard: 0.97 }[this.settings.get('aiSkill')] || 0.91;
      for (let i = 0; i < opts.aiCount; i++) {
        // AI rides what suits the track (its recommended vehicle types)
        const rec = getTrack(opts.trackId).recommend;
        const pool = rec ? VEHICLES.filter((x) => rec.includes(x.category)) : VEHICLES;
        const vd = opts.aiVehicleType === 'same' ? getVehicle(opts.vehicleId) : pool[(i + 1) % pool.length];
        const g = grid[i + 1];
        const r = this.addRider({
          id: 10 + i, name: AI_NAMES[i % AI_NAMES.length], vehicleId: vd.id, colorId: BIKE_COLORS[(i + 2) % BIKE_COLORS.length].id,
          number: 2 + i * 9, ai: { skill: skillBase + (Math.random() - 0.5) * 0.06, lane: g.u * 0.4, splitLane: Math.random() < 0.5 ? 'L' : 'R' },
        });
        this.placeRider(r, g.s, g.u);
        r.ai.enabled = false;
      }
    }
    // remote players (multiplayer)
    if (opts.mp) {
      for (const p of opts.mp.players) {
        if (p.id === opts.mp.myId) continue;
        const r = this.addRider({ id: p.id, name: p.name, vehicleId: p.vehicle, colorId: p.color, gearId: p.gear, number: p.number, remote: true });
        if (p.spectator) this.makeSpectator(r);
      }
    }
    // freestyle: score as many trick points as you can before the clock runs out
    this.fs = opts.mode === 'freestyle' ? { limit: opts.mp ? opts.mp.minutes * 60 : (opts.freestyleTime || 0) * 60, best: this.settings.bestScore(opts.trackId), done: false } : null;
    const lapMode = opts.mode === 'timetrial' ? 'flying' : 'race';
    for (const r of this.riders) r.lap.reset(lapMode, 0);
    this.cam.setMode(this.settings.get('camera') || 0);
    this.cam.snapNext = true;
    if (opts.mode !== 'practice') { // every start gets the 3-2-1 gate (free ride too)
      this.phase = 'countdown';
      this.countdown = GAME.countdown + 0.99;
      this.lastBeep = 4;
      this.scenery.dropGate(false);
      this.scenery.setGate(0);
      if (opts.mp && opts.mp.startAt) this.countdown = Math.max(0.5, (opts.mp.startAt - opts.mp.serverNow()) / 1000);
    } else {
      this.phase = 'go';
      this.scenery.dropGate(true);
    }
    this.scenery.forceUpdate(this.R.camera);
    await this.warmShaders();
    this.rec = opts.mp && opts.mp.spectator ? null : new Recorder(this, opts); // the replay of this session
    this.state = 'running';
    this.ui.hideLoading();
    this.ui.showHud(this);
  }

  // ------------------------------------------------------------------ replays
  saveRecording() {
    const rec = this.rec;
    this.rec = null;
    if (!rec) return;
    const rep = rec.finish(this);
    if (rep) ReplayStore.save(rep);
  }

  async startReplay(rep) {
    this.saveRecording();
    this.state = 'idle';
    this.ui.showLoading('Loading replay...');
    await this.loadTrack(rep.meta.track, (m) => this.ui.showLoading(m));
    this.clearRiders();
    this.mode = 'replay'; this.net = null; this.paused = false; this.results = null; this.fs = null; this.practice = null; this.autopilot = null;
    this.opts = { mode: 'replay', trackId: rep.meta.track };
    let focus = 0;
    rep.meta.riders.forEach((m, i) => {
      this.addRider({ id: m.id, name: m.name, vehicleId: m.vehicleId, colorId: m.colorId, gearId: m.gearId, number: m.number, remote: true });
      if (m.me) focus = i;
    });
    this.replay = { rep, t: 0, speed: 1, playing: true, focus, end: rep.times[rep.times.length - 1] };
    this.player = this.riders[focus];
    rep.meta.riders.forEach((m, i) => poseRider(this.riders[i], rep, i, 0, 0));
    this.phase = 'go';
    if (this.scenery.gate) { this.scenery.dropGate(rep.meta.goAt === null || rep.meta.goAt <= 0); this.scenery.setGate(rep.meta.goAt === null || rep.meta.goAt <= 0 ? -Math.PI / 2 * 0.96 : 0); }
    this.cam.setMode(this.settings.get('camera') || 0);
    this.cam.snapNext = true;
    this.scenery.forceUpdate(this.R.camera);
    await this.warmShaders();
    this.state = 'running';
    this.ui.hideLoading();
    this.ui.showReplay(this);
  }

  // jump to a time (seconds) in the replay
  seekReplay(t) {
    const R = this.replay;
    if (!R) return;
    R.t = Math.max(0, Math.min(R.end, t));
    this.cam.snapNext = true;
  }

  watchRider(i) {
    const R = this.replay;
    if (!R || !this.riders[i]) return;
    R.focus = i; this.player = this.riders[i]; this.cam.snapNext = true;
  }

  // replay free cam: fly anywhere while the replay plays (F or the Free cam button)
  toggleFreeCam() {
    const R = this.replay;
    if (!R) return;
    if (R.free) { R.free = false; this.cam.snapNext = true; this.toast('Free cam off', 1.2); }
    else {
      R.free = true; this.cam.droneStart();
      this.toast('Free cam: W/S/A/D fly, E up, Q down, Shift fast, right mouse to look', 3);
    }
    this.ui.updateReplay(this);
  }

  replayFrame(dt) {
    const R = this.replay, rep = R.rep, inp = this.input;
    if (inp.pressedOnce.has('KeyF')) this.toggleFreeCam();
    if (inp.pressed('camera')) { const m = this.cam.cycle(); this.settings.set('camera', this.cam.mode); this.toast('Camera: ' + m); }
    if (inp.pressed('pause')) { this.ui.emit('replayExit'); return; }
    const step = R.playing ? dt * R.speed : 0;
    R.t = Math.min(R.end, R.t + step);
    if (R.t >= R.end) R.playing = false;
    if (this.scenery.gate) this.scenery.dropGate(rep.meta.goAt === null || R.t >= rep.meta.goAt);
    rep.meta.riders.forEach((m, i) => { if (this.riders[i]) poseRider(this.riders[i], rep, i, R.t, step); });
    this.render(dt, 1);
    this.ui.updateReplay(this);
  }

  // compile every shader the session can use before it starts (hidden things too: dust, far-away
  // copies, the finish fireworks...). Otherwise the first time each one shows up the game froze
  // for a moment while the graphics driver compiled it - the main cause of hitches mid-race.
  async warmShaders() {
    const R = this.R, sc = R.scene, hidden = [];
    sc.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try {
      const r = R.renderer;
      if (r.compileAsync) await Promise.race([r.compileAsync(sc, R.camera), new Promise((ok) => setTimeout(ok, 5000))]);
      else r.compile(sc, R.camera);
    } catch (e) { console.warn('shader warm-up', e); }
    for (const o of hidden) o.visible = false;
  }

  // ------------------------------------------------------------------ frame
  frame(dt) {
    if (!this.world || this.state !== 'running') return;
    dt = Math.min(dt, 0.1);
    const C = this.adminCheats();
    if (C.slowmo && !(this.opts && this.opts.mp)) dt *= 0.4; // slow motion (solo only, party timing stays real)
    this.trackFps(dt);
    if (this.replay) { this.replayFrame(dt); return; }
    const inp = this.input;
    const playing = this.mode !== 'menu';
    // global keys
    if (playing && inp.pressed('pause')) this.ui.togglePause(this);
    if (inp.pressed('camera')) {
      if (this.player && this.player.spectator) this.dirNextShot = true; // watching: C picks the next shot
      else { const m = this.cam.cycle(); this.settings.set('camera', this.cam.mode); this.toast('Camera: ' + m); }
    }
    if (inp.pressed('fps')) this.settings.set('showFps', !this.settings.get('showFps'));
    if (this.paused) { this.render(0, 1); return; }
    if (playing && this.player && this.player.veh) {
      if (inp.pressed('reset')) this.requestReset();
      if (inp.pressed('gearMode')) { const m = !this.settings.get('manualGears'); this.settings.set('manualGears', m); this.toast(m ? 'Manual gears: X up, Z down, Shift = clutch' : 'Automatic gears', 2); }
      if (inp.pressed('retry')) this.quickRetry();
      const v = this.player.veh;
      if (C.jump && inp.pressed('jump') && !v.crashed) { v.vel.y = Math.max(v.vel.y, 0) + 11; this.toast('Super jump!', 0.8); }
    }
    // giant / tiny: the admin cheat (yours, or another rider's from their state), the Giant Riders event for everyone
    for (const r of this.riders) {
      const sc = this.sizeOf(r);
      if (r.veh) r.veh.sizeScale = sc; // sent to the others with your state
      if (r.vis && r.vis.root.scale.x !== sc) r.vis.root.scale.setScalar(sc);
    }
    if (inp.mouse.dx || inp.mouse.dy) this.cam.mouseLook(inp.mouse.dx, inp.mouse.dy);

    // physics at a fixed 120 Hz
    this.acc += dt;
    let steps = 0;
    while (this.acc >= FIXED_DT && steps < MAX_STEPS) {
      this.fixedStep(FIXED_DT);
      this.acc -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    const alpha = this.acc / FIXED_DT;
    this.updateLogic(dt);
    if (this.rec) this.rec.sample(this, dt);
    this.render(dt, alpha);
  }

  fixedStep(dt) {
    this.simTime += dt;
    const holding = this.phase === 'countdown';
    if (this.phase === 'go' || this.phase === 'finished') this.raceTime += dt;
    const ctl = this.input.controls;
    for (const r of this.riders) {
      const v = r.veh;
      if (!v) continue;
      if (r.spectator) continue; // watching: the director camera, no rider on the track
      if (r.isPlayer && this.mode !== 'menu') {
        const c = r.finished && this.mode === 'race' ? { throttle: 0.2, brake: 0, steer: 0, rearBrake: 0, clutch: false, lean: 0 } : ctl;
        if (this.autopilot && !holding) this.autopilot.update(dt); // testing / demo: the AI rides your bike
        else Object.assign(v.input, c);
        if (holding) v.input.clutch = true; // rev on the gate
        // admin cheats (set from the admin panel; only admins can open it)
        const C = this.adminCheats();
        const ev = this.liveEvent();
        // moon tracks have their own gravity (tracks.js gravity)
        v.manual = this.settings.get('manualGears') === true; v.noCrash = !!C.god; v.gravityScale = C.moon || ev === 'moon' ? 0.35 : this.world.def.gravity || 1; v.boost = C.hyper ? 18 : C.turbo || ev === 'turbo' ? 7 : 0;
        // auto reset after a crash
        if (v.crashed && v.crashTime > GAME.resetDelay) this.resetRider(r);
        if (!v.crashed && v.offTrack > 0.9) { this.resetRider(r); this.toast('Out of bounds - back on the track', 1.6); }
      } else if (r.ai) {
        if (r.ai.enabled && !holding && !this.adminCheats().freezeAi) r.ai.update(dt);
        else { v.input.throttle = holding ? 0.5 : 0; v.input.clutch = holding; v.input.brake = 0; v.input.steer = 0; }
        if (r.finished && this.mode === 'race') { v.input.throttle = Math.min(v.input.throttle, 0.25); }
      }
      if (holding && r.grid) {
        // on the gate: engine runs, but the bike stays put
        v.step(dt);
        v.pos.copy(r.grid.pos); v.quat.copy(r.grid.quat); v.vel.set(0, 0, 0); v.angVel.set(0, 0, 0);
        v.prevPos.copy(v.pos); v.prevQuat.copy(v.quat);
      } else v.step(dt);
    }
    this.collide(dt);
    // lap tracking (local riders)
    for (const r of this.riders) {
      if (!r.veh || holding || r.spectator) continue;
      const ev = r.lap.update(r.veh.trackS, this.raceTime);
      if (ev) this.onLapEvent(r, ev);
    }
    this.processEvents();
  }

  // an admin watching a race already going: just the rider, flying, no bike
  makeSpectator(r) {
    r.spectator = true;
    if (r.isPlayer) this.dir = null; // the director starts fresh
    if (r.vis.root) r.vis.root.visible = false;
    if (r.vis.container) r.vis.container.visible = false;
    if (r.vis.placeholder) r.vis.placeholder.visible = false;
    if (r.veh) { r.veh.grounded = false; r.flyYaw = Math.atan2(r.veh.fwd.x || 0, r.veh.fwd.z || 1); r.veh.pos.y += 3; }
  }

  // DIRECTOR (watching a race): picks who to watch - a close battle, the leader, someone big in
  // the air or crashing - and cuts between TV shots every few seconds. A / D or the arrow keys
  // pick a rider yourself (the director stays on them a while, still cutting shots), Space goes
  // back to automatic, C cuts to the next shot.
  directorTick(dt) {
    const D = this.dir || (this.dir = { target: null, shot: 'chase', t: 0, pin: 0, cut: true });
    const live = (r) => !r.spectator && (r.veh || (r.remote && r.remote.state));
    const list = this.riders.filter(live);
    if (!list.length) return null;
    const info = (r) => r.veh ? { air: r.veh.grounded ? 0 : r.veh.airTime || 0, crashed: r.veh.crashed, pos: r.veh.pos } : { air: 0, crashed: r.remote.state.crashed, pos: r.remote.state.pos };
    const inp = this.input, k = (...c) => c.some((x) => inp.pressedOnce.has(x));
    const SHOTS = ['chase', 'tv', 'side', 'heli', 'close'];
    const pickShot = (air) => { const opts = SHOTS.filter((s) => s !== D.shot && (!air || s === 'side' || s === 'tv' || s === 'heli')); return opts[Math.floor(Math.random() * opts.length)]; };
    const cutTo = (r, shot, why) => {
      D.target = r; D.shot = shot; D.t = 4 + Math.random() * 4; D.cut = true; D.since = 0;
      const hint = document.getElementById('hud-hint');
      if (hint) hint.innerHTML = `DIRECTOR &nbsp; <b>${(r.name || 'Rider').replace(/[<>&]/g, '')}</b>${why ? ' &nbsp;' + why : ''} &nbsp; A/D pick rider &nbsp; Space auto &nbsp; C next shot${D.pin > 0 ? ' &nbsp; (picked)' : ''}`;
    };
    D.t -= dt; D.since = (D.since || 0) + dt; D.pin = Math.max(0, D.pin - dt);
    if (!list.includes(D.target)) D.target = null;
    // you pick
    if (k('KeyD', 'ArrowRight', 'KeyA', 'ArrowLeft')) {
      const i = Math.max(0, list.indexOf(D.target)), n = list.length;
      D.pin = 25;
      cutTo(list[(i + (k('KeyD', 'ArrowRight') ? 1 : n - 1)) % n], D.shot === 'heli' ? 'chase' : D.shot);
    } else if (k('Space') && D.pin > 0) { D.pin = 0; D.t = 0; }
    else if (this.dirNextShot) cutTo(D.target || list[0], pickShot(false));
    this.dirNextShot = false;
    // the director picks
    if (!D.target || D.t <= 0 || (D.pin <= 0 && D.since > 2.5)) {
      const order = this.standings().filter(live);
      let best = null, bestScore = -1, why = '';
      order.forEach((r, i) => {
        const f = info(r);
        let s = Math.random() * 2, w = '';
        if (i === 0) { s += 3; w = 'leading'; }
        const ahead = order[i - 1];
        if (ahead && info(ahead).pos.distanceTo(f.pos) < 18) { s += 5; w = 'battling for P' + i; }
        if (f.air > 0.5) { s += 6; w = 'big air'; }
        if (f.crashed) { s += 5; w = 'crashed!'; }
        if (r === D.target) s -= 1.5; // keep it moving
        if (s > bestScore) { bestScore = s; best = r; why = w; }
      });
      const urgent = best && best !== D.target && (info(best).air > 0.6 || info(best).crashed) && D.since > 2.5;
      if (D.pin > 0) { if (!D.target || D.t <= 0) cutTo(D.target || best, pickShot(false)); }
      else if (!D.target || D.t <= 0 || urgent) cutTo(best, pickShot(info(best).air > 0.4), why);
    }
    return D.target;
  }

  // spectator flying: W / S forward and back, A / D turn, Space up, Shift down
  fly(r, dt) {
    const v = r.veh, c = this.input.controls;
    v.prevPos.copy(v.pos); v.prevQuat.copy(v.quat);
    r.flyYaw = (r.flyYaw || 0) - c.steer * 2.2 * dt;
    const fx = Math.sin(r.flyYaw), fz = Math.cos(r.flyYaw), sp = 24 * (c.throttle - c.brake);
    const vy = (c.rearBrake > 0.1 ? 10 : 0) - (c.clutch ? 10 : 0);
    v.vel.set(fx * sp, vy, fz * sp);
    v.pos.addScaledVector(v.vel, dt);
    const gy = heightAt(this.world, v.pos.x, v.pos.z) + 1.2;
    if (v.pos.y < gy) v.pos.y = gy;
    v.pos.y = Math.min(v.pos.y, gy + 120);
    v.quat.setFromAxisAngle(_up.set(0, 1, 0), r.flyYaw);
    v.fwd.set(fx, 0, fz);
    v.grounded = false; v.crashed = false; v.speed = Math.abs(sp);
    v.input.throttle = c.throttle; v.input.lean = 0;
  }

  // how big a rider is drawn (1 = normal)
  sizeOf(r) {
    const C = this.adminCheats();
    if (r.isPlayer && C.giant) return 1.8;
    if (r.isPlayer && C.tiny) return 0.55;
    if (r.remote && r.sizeScale && r.sizeScale !== 1) return r.sizeScale;
    return this.liveEvent() === 'giant' ? 1.8 : 1;
  }

  // the admin event running for everyone online (kind), if any
  liveEvent() { const e = this.event; return e && Date.now() < e.endsAt && this.mode !== 'menu' ? e.kind : null; }

  // admin cheats (set from the admin panel; only admins can open it)
  adminCheats() { return (this.account && this.account.profile && this.account.profile.admin && this.cheats) || {}; }

  // admin troll: a rider blows up (your own bike gets thrown; others just show the fireball -
  // their own game throws them and the snapshots show it)
  blowUp(r) {
    if (!r || !r.vis) return;
    const pos = r.vis.root.position;
    this.effects.explosion(pos);
    if (r.veh && !r.veh.crashed) { // you, or an AI rider in a solo race
      const v = r.veh, a = Math.random() * Math.PI * 2;
      v.vel.x += Math.cos(a) * 6; v.vel.z += Math.sin(a) * 6; v.vel.y = Math.max(v.vel.y, 0) + 13;
      v.angVel.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 14);
      v.crash('Blown up!');
      if (r.isPlayer) this.toast('BOOM! You got blown up', 2.2, 'bad');
    }
    if (this.player && this.player.vis && this.player.vis.root.position.distanceTo(pos) < 60) {
      this.audio.crash(); this.cam.addShake(r.isPlayer ? 1.6 : 0.8);
    }
  }

  // admin cheat: jump ahead along the track
  skipAhead(m) {
    const p = this.player;
    if (!p || !p.veh || !(this.account && this.account.profile && this.account.profile.admin)) return;
    this.placeRider(p, p.veh.trackS + m, 0);
    this.cam.snapNext = true;
  }

  // simple rider-to-rider bumping (spheres at the centre of mass)
  collide(dt) {
    const ghost = this.adminCheats().ghost;
    const list = this.riders.filter((r) => (r.veh || (r.remote && r.remote.state)) && !(ghost && r.isPlayer) && !r.spectator);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (!a.veh && !b.veh) continue;
      const pa = a.veh ? a.veh.pos : a.remote.pos, pb = b.veh ? b.veh.pos : b.remote.pos;
      const ra = (a.veh ? a.veh.cfg.radius : 0.7) * this.sizeOf(a), rb = (b.veh ? b.veh.cfg.radius : 0.7) * this.sizeOf(b); // giant / tiny bump at their size
      _v.subVectors(pb, pa);
      const d = _v.length();
      const min = ra + rb;
      if (d >= min || d < 1e-4) continue;
      _v.divideScalar(d);
      const pen = min - d;
      const va = a.veh ? a.veh.vel : a.remote.vel, vb = b.veh ? b.veh.vel : b.remote.vel;
      const rel = (vb.x - va.x) * _v.x + (vb.y - va.y) * _v.y + (vb.z - va.z) * _v.z;
      const both = a.veh && b.veh;
      const push = pen * (both ? 0.5 : 1);
      if (a.veh) { a.veh.pos.addScaledVector(_v, -push); if (rel < 0) a.veh.vel.addScaledVector(_v, rel * (both ? 0.5 : 0.8)); }
      if (b.veh) { b.veh.pos.addScaledVector(_v, push); if (rel < 0) b.veh.vel.addScaledVector(_v, -rel * (both ? 0.5 : 0.8)); }
      if (-rel > 7) {
        // a hard hit knocks the slower rider down
        if (a.veh && !a.veh.crashed && a.veh.speed < (b.veh ? b.veh.speed : 99)) a.veh.crash('Taken out');
        else if (b.veh && !b.veh.crashed) b.veh.crash('Taken out');
      }
    }
  }

  processEvents() {
    for (const r of this.riders) {
      const v = r.veh;
      if (!v || !v.events.length) continue;
      for (const e of v.events) {
        if (e.type === 'crash') {
          if (v.cfg.type !== 'car') r.rider.detach(this.scene, v.vel); // drivers stay strapped in
          this.effects.crash(v.pos, v.vel);
          if (r.isPlayer) {
            this.audio.crash();
            if (this.combo > 1) this.toast('Combo lost', 1.2, 'bad');
            this.combo = 0;
            this.cam.addShake(0.9);
            this.toast('CRASH! ' + e.reason + '  (R to reset)', 2.2, 'bad');
            if (this.net) this.net.sendEvent({ t: 'crash' });
          }
        } else if (e.type === 'backfire') {
          // exhaust pops: flame out of the back, a crack and a thump (only nearby riders are heard)
          this.effects.backfire && this.effects.backfire(v, e.n, e.k, r.vis);
          if (r.isPlayer) this.audio.backfire(e.n, e.k);
          else if (this.player && this.player.veh && v.pos.distanceTo(this.player.veh.pos) < 60) this.audio.backfire(e.n, e.k * 0.4);
        }
        if (r.isPlayer && this.onPlayerEvent) this.onPlayerEvent(e);
        if (e.type === 'land') {
          const strength = Math.min(1.5, (v.landImpact || 0) / 6);
          if (e.air > 0.35) {
            this.effects.landing(v.pos.clone().add(_v.set(0, -v.cfg.rideHeight, 0)), Math.max(0.4, strength));
            if (r.isPlayer) {
              this.audio.thud(Math.max(0.3, strength));
              this.cam.addShake(Math.max(0, strength - 0.6) * 0.8);
              this.cam.landing(strength);
              if (e.air > 1.3) { this.toast(`Big air! ${e.air.toFixed(1)} s`, 1.2, 'good'); this.award('air', REWARDS.bigAir); }
            }
          }
        } else if (e.type === 'trick') {
          if (r.isPlayer) {
            // combos: land tricks one after another (within 4.5 s on the ground) for a multiplier
            this.combo = this.simTime - (this.comboT ?? -99) < 4.5 + (this.player.veh.lastLanding || 0) ? (this.combo || 0) + 1 : 1;
            this.comboT = this.simTime;
            const mult = Math.min(4, 1 + (this.combo - 1) * 0.5);
            const pts = Math.round(e.score * mult);
            this.trickScore = (this.trickScore || 0) + pts;
            this.ui.trickPopup(e, pts, this.combo, mult);
            this.audio.cheer(Math.min(1, pts / 1500)); // the crowd likes it
            if (this.net && this.mode === 'freestyle') this.net.sendEvent({ t: 'trick', v: pts });
            this.audio.beep(true);
            this.award('trick', Math.round((pts / 100) * REWARDS.trickPer100));
          }
        } else if (e.type === 'reset') {
          if (!r.rider.attached) r.rider.attachTo(r.vis.model);
          r.lap.lastS = null;
          if (r.isPlayer && this.net) this.net.sendEvent({ t: 'reset' });
        }
      }
      v.events.length = 0;
    }
  }

  // let the AI ride the player's vehicle (used by the automated tests)
  setAutopilot(on, skill = 1) {
    if (!this.player || !this.player.veh) return;
    if (on) { this.autopilot = new AIDriver(this.player.veh, { skill, lane: 0 }); this.player.veh.isAI = false; }
    else { this.autopilot = null; this.applyAssists(this.player.veh, true); }
  }

  requestReset() {
    const v = this.player.veh;
    if (v.crashed && v.crashTime < 0.8) return;
    if (this.phase === 'countdown') return;
    this.resetRider(this.player);
  }

  resetRider(r) {
    const v = r.veh;
    v.resetToTrack(v.safeS, Math.max(-3, Math.min(3, v.trackU)));
    r.rider.attachTo(r.vis.model);
    if (r.isPlayer) this.cam.snapNext = true;
  }

  quickRetry() {
    if (this.mode === 'freestyle' && !this.opts.mp) { this.ui.hideResults(); this.startSession(this.opts); return; }
    if (this.mode === 'timetrial' && !this.opts.mp) {
      const g = this.scenery.gridSlots(1)[0];
      this.placeRider(this.player, g.s, g.u);
      this.player.lap.reset('flying', this.raceTime);
      this.cam.snapNext = true;
      this.toast('Restarted - timing starts at the finish line');
    } else if (this.mode === 'practice') {
      this.placeRider(this.player, this.practice.sec.s0 - 30, 0);
      this.practice.timing = null;
      this.cam.snapNext = true;
      this.toast('Retry: ' + this.practice.sec.name);
    }
  }

  onLapEvent(r, ev) {
    const isMe = r.isPlayer;
    if (ev.type === 'start' && isMe) this.toast('Timing started', 1.2);
    if (ev.type !== 'lap') return;
    r.best = r.lap.bestLap;
    if (isMe) {
      const rec = this.settings.saveLap(this.trackId, r.vehicleId, ev.time);
      this.toast(`Lap ${ev.laps}: ${fmt(ev.time)}${rec ? '  NEW RECORD!' : ''}`, 2.5, rec ? 'good' : '');
      this.award('lap', REWARDS.lap + (rec ? REWARDS.record : 0));
      this.audio.beep(true);
    }
    if (this.mode === 'race' && !(this.opts && this.opts.mp) && r.lap.laps >= this.laps && !r.finished) {
      r.finished = true;
      r.finishTime = this.raceTime;
      r.place = this.riders.filter((x) => x.finished).length;
      if (isMe) {
        this.toast(`FINISHED ${ordinal(r.place)}!`, 3, 'good');
        this.award(r.place === 1 ? 'win' : 'race', REWARDS.race[Math.min(r.place, REWARDS.race.length) - 1]);
        setTimeout(() => this.showResults(), 2500);
      }
    }
  }

  endFreestyle() {
    const F = this.fs;
    F.done = true;
    const rec = this.settings.saveScore(this.trackId, this.trickScore || 0);
    this.toast("TIME'S UP!", 2.5, 'good');
    if (this.opts.mp) return; // the server sends everyone's scores
    if (rec && this.trickScore) this.toast('New best score!', 2.5, 'good');
    this.results = [{ pos: 1, name: this.player.name, vehicle: getVehicle(this.player.vehicleId).name, score: this.trickScore || 0, best: F.best, record: rec, me: true }];
    setTimeout(() => this.ui.showResults(this.results, this), 1200);
  }

  showResults() {
    if (this.mode !== 'race' || this.results) return;
    this.results = this.standings().map((r, i) => ({ pos: i + 1, name: r.name, vehicle: getVehicle(r.vehicleId).name, time: r.finished ? r.finishTime : null, best: r.lap.bestLap, laps: r.lap.laps, me: r.isPlayer }));
    this.ui.showResults(this.results, this);
  }

  standings() {
    return [...this.riders].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.lap.progress(riderS(b)) - a.lap.progress(riderS(a));
    });
  }

  // ------------------------------------------------------------------ logic
  updateLogic(dt) {
    // countdown / gate
    if (this.phase === 'countdown') {
      if (!this.gridSaved) {
        for (const r of this.riders) if (r.veh) r.grid = { pos: r.veh.pos.clone(), quat: r.veh.quat.clone() };
        this.gridSaved = true;
      }
      // multiplayer: everyone counts down to the same server time
      if (this.opts && this.opts.mp && this.opts.mp.waiting) this.countdown = Math.max(this.countdown, 4); // still waiting for riders to load
      else if (this.opts && this.opts.mp && this.opts.mp.startAt) this.countdown = (this.opts.mp.startAt - this.opts.mp.serverNow()) / 1000;
      else this.countdown -= dt;
      const n = Math.ceil(this.countdown - 1);
      if (n < this.lastBeep && n >= 1 && n <= 3) { this.lastBeep = n; this.audio.beep(false); }
      if (this.countdown <= 1) {
        this.phase = 'go';
        this.gridSaved = false;
        this.raceTime = 0;
        for (const r of this.riders) { r.grid = null; r.lap.reset(this.mode === 'timetrial' ? 'flying' : 'race', 0); if (r.ai) r.ai.enabled = true; }
        this.scenery.dropGate(true);
        this.audio.beep(true);
        this.toast('GO!', 1, 'good');
      }
    }
    // freestyle clock
    if (this.fs && this.phase === 'go' && this.fs.limit && !this.fs.done && this.raceTime >= this.fs.limit) this.endFreestyle();
    // practice section timing
    if (this.mode === 'practice' && this.player && this.player.veh) {
      const P = this.practice, v = this.player.veh;
      const T = this.world.T;
      const into = deltaS(T, P.sec.s0, v.trackS);
      if (P.timing === null && into > 0 && into < 3 && !v.crashed) P.timing = this.raceTime;
      if (P.timing !== null && v.crashed) { P.timing = null; }
      if (P.timing !== null && deltaS(T, P.sec.s1, v.trackS) > 0 && deltaS(T, P.sec.s1, v.trackS) < 5) {
        const t = this.raceTime - P.timing;
        P.last = t; P.timing = null;
        const rec = this.settings.saveSection(this.trackId, this.player.vehicleId, P.sec.name, t);
        if (rec) P.best = t;
        this.award('section', REWARDS.section);
        this.toast(`${P.sec.name}: ${fmt(t)}${rec ? '  NEW BEST!' : ''}   (Y to retry)`, 3, rec ? 'good' : '');
      }
    }
    // menu background: pick a rider to watch now and then
    if (this.mode === 'menu') {
      this.focusTimer -= dt;
      if (this.focusTimer <= 0 || !this.focus) {
        this.focus = this.riders[Math.floor(Math.random() * this.riders.length)];
        this.focusTimer = 9;
        this.cam.tvPoint = null;
      }
    }
    // network: send my state ~20 times a second
    if (this.net && this.player && this.player.veh) this.net.tick(dt, this);
    // remote riders: interpolate from snapshots
    if (this.net) for (const r of this.riders) if (r.remote) this.net.interpolate(r, this);
    // stuck hint
    // stuck hint (once, until you are properly moving again)
    const pv = this.player && this.player.veh;
    if (pv && this.phase === 'go' && (pv.stuckTime > 4 || pv.noProgress) && !this.stuckHinted && this.mode !== 'freeride' && this.mode !== 'freestyle') { this.toast('Stuck? Press R to reset', 2.5); this.stuckHinted = true; }
    if (pv && pv.speed > 6) this.movingTime = (this.movingTime || 0) + dt; else this.movingTime = 0;
    if (this.movingTime > 3) this.stuckHinted = false;
    this.ui.updateHud(this, dt);
  }

  toast(text, time = 1.6, kind = '') { this.ui.toast(text, time, kind); }

  // coins for the player (laps, finishes, records, tricks, big air)
  award(kind, amount) {
    if (!this.account || this.autopilot || amount <= 0) return;
    this.account.reward(kind, amount).then((added) => { if (added > 0) this.toast('+' + added + ' coins', 1.4, 'coins'); });
  }

  // a giant / tiny rider is drawn scaled about the centre of mass: move it along its
  // own up so the wheels still sit on the ground where the physics has them
  groundScaled(r, quat, rideHeight) {
    const s = r.vis.root.scale.x;
    if (s === 1) return;
    r.vis.root.position.addScaledVector(_up.set(0, 1, 0).applyQuaternion(quat), (s - 1) * rideHeight);
  }

  // ------------------------------------------------------------------ draw
  render(dt, alpha) {
    const others = [];
    for (const r of this.riders) {
      let pos, quat, state, crashed;
      if (r.veh) {
        const v = r.veh;
        pos = _v.copy(v.prevPos).lerp(v.pos, alpha);
        quat = _q.copy(v.prevQuat).slerp(v.quat, alpha);
        r.vis.root.position.copy(pos);
        r.vis.root.quaternion.copy(quat);
        this.groundScaled(r, quat, v.cfg.rideHeight);
        r.vis.camDist = this.R.camera.position.distanceTo(pos);
        if (r.rider) r.rider.setDetail(r.vis.camDist);
        r.vis.update({ lean: v.lean, steer: v.steerAngle, hand: v.steerHand, wheels: v.wheels });
        crashed = v.crashed;
        if (dt > 0) this.effects.vehicle(v, dt, r.key);
        if (!r.isPlayer) others.push({ key: r.key, pos: r.vis.root.position, engine: v.engine, input: v.input, crashed, kind: v.cfg.audio.kind });
      } else if (r.remote && r.remote.state) {
        const st = r.remote.state;
        r.vis.root.position.copy(st.pos);
        r.vis.root.quaternion.copy(st.quat);
        this.groundScaled(r, st.quat, getVehicle(r.vehicleId).rideHeight);
        r.vis.camDist = this.R.camera.position.distanceTo(st.pos);
        if (r.rider) r.rider.setDetail(r.vis.camDist);
        r.vis.update(st.visual);
        crashed = st.crashed;
        others.push({ key: r.key, pos: r.vis.root.position, rpm: st.rpm, thr: st.thr, crashed, kind: getVehicle(r.vehicleId).audio.kind });
        // remote crash -> rider tumbles here too
        if (crashed && r.rider.attached && !r.vis.seated) r.rider.detach(this.scene, st.vel);
        if (!crashed && !r.rider.attached) r.rider.attachTo(r.vis.model);
      } else { r.vis.root.visible = false; continue; }
      r.vis.root.visible = true;
      r.vis.root.updateMatrixWorld();
      if (r.rider.attached) r.rider.updateRiding(Math.max(dt, 0.001), r.veh || r.remote.proxy, r.vis);
      else r.rider.updateRagdoll(Math.max(dt, 0.001), this.world);
    }
    // camera
    const cam = this.R.camera;
    const spec = !!(this.player && this.player.spectator && this.mode !== 'menu');
    const focus = this.mode === 'menu' ? this.focus : spec ? (dt > 0 ? this.directorTick(dt) : this.dir && this.dir.target) : this.player;
    if (focus && (focus.veh || (focus.remote && focus.remote.state))) {
      const v = focus.veh;
      const target = v ? {
        pos: focus.vis.root.position, quat: focus.vis.root.quaternion, vel: v.vel, speed: v.speed, grounded: v.grounded,
        trackS: v.trackS, lean: v.lean, airTime: v.airTime, type: v.cfg.type,
      } : { pos: focus.vis.root.position, quat: focus.vis.root.quaternion, vel: focus.remote.state.vel, speed: focus.remote.state.vel.length(), grounded: true, trackS: 0 };
      let head = null;
      if (this.cam.mode === 2 && focus.rider.attached && !spec) {
        head = (this._head || (this._head = new THREE.Vector3())).copy(focus.rider.j.head).add(_v.set(0, 0.15, 0.12)).applyMatrix4(focus.vis.model.matrixWorld);
      }
      if (spec) { if (dt > 0) { this.cam.directorShot(dt, target, this.world, this.dir.shot, this.dir.cut); this.dir.cut = false; } }
      else if (dt > 0) this.cam.update(dt, target, this.world, head);
      // the drone takes over the view in the replay free cam (Space pauses replays)
      if (this.replay && this.replay.free) this.cam.drone(dt, this.input, this.world, true);
      focus.vis.root.visible = true;
      // helmet cam: our own rider loses the head and chest (see rider.js), keeps the arms
      focus.rider.mesh.visible = true;
      for (const r of this.riders) if (r.rider) r.rider.firstPerson = this.cam.mode === 2 && r === focus && r.rider.attached && !spec && !(this.replay && this.replay.free);
      // goggles: a soft frame around the first-person view on bikes and quads (not in cars)
      const gog = this.cam.mode === 2 && focus.rider.attached && v && v.cfg.type !== 'car' && !spec && !(this.replay && this.replay.free);
      if (gog !== this.gogOn) { this.gogOn = gog; const g = document.getElementById('goggles'); if (g) g.hidden = !gog; }
      this.R.followShadow(focus.vis.root.position);
      if (this.player === focus && v) {
        this.audio.player(v, cam);
        // the crowd murmurs louder the closer you are to the start / finish straight
        const T = this.world.T;
        if (!this.finishPt || this.finishPtT !== T) { this.finishPt = pointAt(T, T.finishS); this.finishPtT = T; }
        const d = Math.hypot(v.pos.x - this.finishPt.x, v.pos.z - this.finishPt.z);
        this.audio.crowd(Math.max(0, 1 - d / 140));
      }
    }
    this.audio.others(others, cam);
    this.ui.updateNameTags(this);
    this.scenery.update(dt, cam);
    this.effects.update(dt, cam, this.R.renderer);
    this.R.render();
  }

  // automatically lower optional effects if the frame rate stays low
  trackFps(dt) {
    if ((this.rawDt || dt) > 0.2 || document.hidden) return; // tab in the background: not a real frame rate
    dt = this.rawDt || dt;
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length > 60) this.fpsSamples.shift();
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fps = 1 / avg;
    if (!this.settings.get('autoQuality') || this.mode === 'menu') return;
    const capped = Number(this.settings.get('maxFps')) || 0;
    if (this.fps < (capped ? Math.min(42, capped * 0.8) : 42)) this.lowFpsTime += dt; else this.lowFpsTime = Math.max(0, this.lowFpsTime - dt);
    if (this.lowFpsTime > 4) {
      this.lowFpsTime = 0;
      const q = this.settings;
      if (q.get('particles') > 0.4) { q.set('particles', Math.max(0.3, q.get('particles') - 0.3)); this.toast('Auto quality: fewer particles'); }
      else if (q.get('grass') > 0) { q.set('grass', 0); this.scenery.grass.visible = false; this.toast('Auto quality: grass off'); }
      else if (q.get('shadows') === 'high') { q.set('shadows', 'low'); this.R.applyQuality(q.quality()); this.toast('Auto quality: lower shadows'); }
      else if (q.get('resolution') > 0.7) { q.set('resolution', Math.round((q.get('resolution') - 0.15) * 100) / 100); this.R.applyQuality(q.quality()); this.toast('Auto quality: lower resolution'); }
    }
  }

  // back to the lobby: nothing on track, the menus draw the 3D stage instead
  stop() {
    this.saveRecording();
    this.replay = null;
    if (this.ui.hideReplay) this.ui.hideReplay();
    this.state = 'idle';
    if (this.gogOn) { this.gogOn = false; const g = document.getElementById('goggles'); if (g) g.hidden = true; }
    this.mode = 'none';
    this.paused = false;
    this.net = null;
    this.clearRiders();
    this.audio.silenceAll();
  }
}

function riderS(r) { return r.veh ? r.veh.trackS : r.remote && r.remote.s !== undefined ? r.remote.s : 0; }
function tick() { return new Promise((r) => setTimeout(r, 0)); }
export function fmt(t) {
  if (t == null || !isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
export function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

// a stand-in "vehicle" object so remote riders can be posed like local ones
function makeProxy(def) {
  return {
    input: { throttle: 0, brake: 0, steer: 0, lean: 0 }, speed: 0, grounded: true, airTime: 0, lean: 0,
    wheels: def.wheels.map((w) => ({ comp: 0.09, cfg: { travel: w.travel } })), controller: { steer: 0 },
  };
}
