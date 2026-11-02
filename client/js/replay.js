// =====================================================================
//  REPLAYS - every session is recorded (all riders, 20 times a second)
//  and the last few are kept in this browser (IndexedDB). The Replays
//  tab plays them back with the normal riders, camera and sounds: each
//  recorded rider is driven like a remote multiplayer rider.
//
//  A frame row per rider (same layout as the multiplayer state):
//  [x, y, z, qx, qy, qz, qw, vx, vy, vz, lean, steer, s, rpm, thr, flags, susp0..3]
// =====================================================================
import * as THREE from 'three';
import { packState, F_CRASHED, F_AIR, F_GIANT, F_TINY } from '/shared/protocol.js';
import { getVehicle } from '/shared/vehicles.js';

export const ROW = 20;
const RATE = 20;             // samples per second
const MAX_SECONDS = 15 * 60; // a session longer than this keeps its first 15 minutes
const KEEP = 12;             // replays kept (starred ones are never deleted for room)

// ---------------------------------------------------------------- recording
export class Recorder {
  constructor(game, opts) {
    this.meta = {
      track: game.trackId, mode: opts.mode, date: Date.now(), mp: !!opts.mp,
      riders: game.riders.filter((r) => !r.spectator).map((r) => ({ id: r.id, name: r.name, vehicleId: r.vehicleId, colorId: r.colorId, gearId: r.gearId || 'match', number: r.number, me: !!r.isPlayer })),
      goAt: null, result: null,
    };
    this.ids = this.meta.riders.map((r) => r.id);
    this.times = [];
    this.rows = this.ids.map(() => []);
    this.t = 0; this.acc = 1; // first sample straight away
  }

  sample(game, dt) {
    if (this.times.length >= MAX_SECONDS * RATE) return;
    this.t += dt;
    if (game.phase === 'go' && this.meta.goAt === null) this.meta.goAt = this.t;
    this.acc += dt;
    if (this.acc < 1 / RATE) return;
    this.acc = 0;
    this.times.push(this.t);
    for (let i = 0; i < this.ids.length; i++) {
      const r = game.riders.find((x) => x.id === this.ids[i]);
      const out = this.rows[i];
      const row = !r ? null : r.veh ? packState(r.veh) : r.remote && r.remote.state ? packRemote(r) : null;
      if (row) for (let k = 0; k < ROW; k++) out.push(row[k] || 0);
      else if (out.length >= ROW) for (let k = 0; k < ROW; k++) out.push(out[out.length - ROW]); // missing: hold the last one
      else for (let k = 0; k < ROW; k++) out.push(k === 6 ? 1 : 0);
    }
  }

  get seconds() { return this.t; }

  // the finished replay (null if it was too short to be worth keeping)
  finish(game) {
    if (this.times.length < RATE * 8) return null;
    const me = game.results && game.results.find((r) => r.me);
    if (me) this.meta.result = { pos: me.pos, of: game.results.length, time: me.time ?? null, score: me.score ?? null };
    else if (this.meta.mode === 'freestyle' && game.trickScore) this.meta.result = { score: game.trickScore };
    this.meta.length = this.t;
    return { meta: this.meta, times: new Float32Array(this.times), rows: this.rows.map((r) => new Float32Array(r)) };
  }
}

// a remote (multiplayer) rider's current look, in the same layout
function packRemote(r) {
  const st = r.remote.state, px = r.remote.proxy;
  const flags = (st.crashed ? F_CRASHED : 0) | (px && !px.grounded ? F_AIR : 0) | ((r.sizeScale || 1) > 1 ? F_GIANT : 0) | ((r.sizeScale || 1) < 1 ? F_TINY : 0);
  const w = st.visual.wheels || [];
  return [st.pos.x, st.pos.y, st.pos.z, st.quat.x, st.quat.y, st.quat.z, st.quat.w, st.vel.x, st.vel.y, st.vel.z,
    st.visual.lean || 0, st.visual.steer || 0, r.remote.s || 0, st.rpm || 0, st.thr || 0, flags,
    w[0] ? w[0].comp : 0, w[1] ? w[1].comp : 0, w[2] ? w[2].comp : 0, w[3] ? w[3].comp : 0];
}

// ---------------------------------------------------------------- playback
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

// index of the last sample at or before time t (binary search)
export function frameAt(times, t) {
  let lo = 0, hi = times.length - 1;
  if (t <= times[0]) return 0;
  if (t >= times[hi]) return hi;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; }
  return lo;
}

// put a recorded rider where it was at time t (fills r.remote.state like the multiplayer code)
export function poseRider(r, rep, i, t, dt) {
  const times = rep.times, rows = rep.rows[i];
  const a = frameAt(times, t), b = Math.min(a + 1, times.length - 1);
  const k = b > a ? Math.max(0, Math.min(1, (t - times[a]) / (times[b] - times[a]))) : 0;
  const A = a * ROW, B = b * ROW;
  const L = (n) => rows[A + n] + (rows[B + n] - rows[A + n]) * k;
  const R = r.remote;
  const st = R.state || (R.state = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), visual: { lean: 0, steer: 0, wheels: [] }, crashed: false, rpm: 0, thr: 0, spin: [0, 0, 0, 0], airT: 0 });
  st.pos.set(L(0), L(1), L(2));
  _q1.set(rows[A + 3], rows[A + 4], rows[A + 5], rows[A + 6]).normalize();
  _q2.set(rows[B + 3], rows[B + 4], rows[B + 5], rows[B + 6]).normalize();
  st.quat.copy(_q1).slerp(_q2, k);
  st.vel.set(L(7), L(8), L(9));
  const flags = rows[B + 15];
  st.crashed = !!(flags & F_CRASHED);
  r.sizeScale = flags & F_GIANT ? 1.8 : flags & F_TINY ? 0.55 : 1;
  st.rpm = L(13); st.thr = L(14);
  const def = getVehicle(r.vehicleId), spd = st.vel.length(), steer = L(11);
  st.visual.wheels = def.wheels.map((w, n) => {
    st.spin[n] += (spd / w.r) * dt;
    return { comp: L(16 + n), spin: st.spin[n], steer: w.steer ? steer : 0 };
  });
  st.visual.lean = L(10); st.visual.steer = steer;
  R.s = L(12); R.pos = st.pos; R.vel = st.vel;
  const px = R.proxy, air = !!(flags & F_AIR);
  st.airT = air ? st.airT + dt : 0;
  px.speed = spd; px.grounded = !air; px.airTime = st.airT; px.lean = st.visual.lean;
  px.input.throttle = st.thr; px.controller.steer = Math.max(-1, Math.min(1, steer * 3));
  px.wheels.forEach((w, n) => { w.comp = st.visual.wheels[n] ? st.visual.wheels[n].comp : 0.1; });
}

// ---------------------------------------------------------------- storage (IndexedDB)
// two stores: 'meta' (small, for the list) and 'data' (the frames)
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((ok, bad) => {
    try {
      const req = indexedDB.open('ridgeline-replays', 1);
      req.onupgradeneeded = () => { const d = req.result; d.createObjectStore('meta', { keyPath: 'id' }); d.createObjectStore('data', { keyPath: 'id' }); };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => bad(req.error);
    } catch (e) { bad(e); }
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}
const tx = (d, stores, mode, f) => new Promise((ok, bad) => { const t = d.transaction(stores, mode); const out = f(t); t.oncomplete = () => ok(out && out.result !== undefined ? out.result : out); t.onerror = () => bad(t.error); t.onabort = () => bad(t.error); });

export const ReplayStore = {
  async list() {
    try {
      const d = await db();
      const all = await new Promise((ok, bad) => { const r = d.transaction('meta').objectStore('meta').getAll(); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
      return all.sort((a, b) => b.date - a.date);
    } catch { return []; }
  },
  async save(rep) {
    try {
      const d = await db();
      const id = 'r' + rep.meta.date.toString(36) + Math.random().toString(36).slice(2, 6);
      const meta = { ...rep.meta, id, starred: false };
      await tx(d, ['meta', 'data'], 'readwrite', (t) => { t.objectStore('meta').put(meta); t.objectStore('data').put({ id, times: rep.times, rows: rep.rows }); });
      // room: drop the oldest unstarred ones
      const list = await this.list();
      const extra = list.filter((m) => !m.starred).slice(KEEP);
      for (const m of extra) await this.remove(m.id);
      return id;
    } catch (e) { console.warn('replay not saved', e); return null; }
  },
  async load(id) {
    const d = await db();
    const [meta, data] = await Promise.all(['meta', 'data'].map((s) => new Promise((ok, bad) => { const r = d.transaction(s).objectStore(s).get(id); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); })));
    return meta && data ? { meta, times: data.times, rows: data.rows } : null;
  },
  async remove(id) {
    const d = await db();
    await tx(d, ['meta', 'data'], 'readwrite', (t) => { t.objectStore('meta').delete(id); t.objectStore('data').delete(id); });
  },
  async star(id, on) {
    const d = await db();
    const m = await new Promise((ok) => { const r = d.transaction('meta').objectStore('meta').get(id); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); });
    if (!m) return;
    m.starred = on;
    await tx(d, ['meta'], 'readwrite', (t) => t.objectStore('meta').put(m));
  },
};
