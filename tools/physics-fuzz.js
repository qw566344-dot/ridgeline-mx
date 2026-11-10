// PHYSICS FUZZ: every vehicle rides a few tracks driven by the AI with random input glitches thrown in (steer bursts,
// flips, whips, clutch spins, brake stabs, wheelies), while we check that the physics never breaks:
//   - no NaN / infinite numbers          - spin rate stays sane (flips are ~4-6 rad/s; > 16 is a bug)
//   - never falls through the ground     - speed stays sane
//   - never freezes in mid-air or gets stuck forever on flat ground with throttle held
//   node tools/physics-fuzz.js [vehicle,...] [trackId,...] [seconds]
import { getTrack } from '../shared/tracks.js';
import { makeWorld, groundAt } from '../shared/terrain.js';
import { VEHICLES, PASS_VEHICLES } from '../shared/vehicles.js';
import { Vehicle, FIXED_DT } from '../client/js/sim/vehicle.js';
import { AIDriver } from '../client/js/sim/ai.js';
import { pointAt } from '../shared/trackgen.js';

const ids = (process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : [...VEHICLES, ...PASS_VEHICLES].map((v) => v.id));
const tracks = (process.argv[3] || 'ridgeline,quarry,powder,trickpark').split(',');
const SECONDS = Number(process.argv[4] || 40);
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const g = { h: 0, nx: 0, ny: 1, nz: 0 };

const problems = [];
const note = (id, track, what, detail) => { problems.push({ id, track, what, detail }); };
const crashTally = {};

for (const tid of tracks) {
  let W;
  try { W = makeWorld(getTrack(tid)); } catch { continue; }
  const T = W.T;
  for (const id of ids) {
    let sm = 99; Math.random = () => { sm = (sm * 1664525 + 1013904223) >>> 0; return sm / 4294967296; }; // seedMath: the AI's own randomness repeats too
    seed = 12345; for (const ch of id + tid) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0; // each vehicle+track replays the same glitches
    const v = new Vehicle(id, W);
    const p = pointAt(T, 20, 0); v.placeAt(p.x, p.z, p.tx, p.tz);
    const ai = new AIDriver(v, { skill: 1.0 });
    let justReset = false, glitch = null, glitchUntil = 0, stuck = 0, airFreeze = 0, lastPos = v.pos.clone(), reported = new Set(), crashes = 0;
    const ring = [];
    const flag = (what, detail) => { if (!reported.has(what)) { reported.add(what); note(id, tid, what, detail); if (process.env.TRACE) for (const r of ring) console.log('   ', r); } };
    for (let i = 0; i < 120 * SECONDS; i++) {
      const t = i * FIXED_DT;
      ai.update(FIXED_DT);
      // random glitches layered on top of the AI
      if (t > glitchUntil) {
        glitch = null;
        if (rnd() < 0.02) {
          const kinds = ['steerL', 'steerR', 'flipBack', 'flipFront', 'whipL', 'whipR', 'clutchL', 'clutchR', 'brake', 'wheelie', 'flipSteer', 'throttleOff', 'rearBrake'];
          glitch = kinds[Math.floor(rnd() * kinds.length)]; glitchUntil = t + 0.15 + rnd() * 1.2;
        }
      }
      const inp = v.input;
      if (glitch) {
        if (glitch === 'steerL') inp.steer = -1; if (glitch === 'steerR') inp.steer = 1;
        if (!v.grounded) {
          if (glitch === 'flipBack') inp.lean = -1; if (glitch === 'flipFront') inp.lean = 1;
          if (glitch === 'whipL') inp.steer = -1; if (glitch === 'whipR') inp.steer = 1;
          if (glitch === 'clutchL') { inp.clutch = true; inp.steer = -1; } if (glitch === 'clutchR') { inp.clutch = true; inp.steer = 1; }
          if (glitch === 'flipSteer') { inp.lean = rnd() < 0.5 ? -1 : 1; inp.steer = (rnd() - 0.5) * 0.6; }
        }
        if (glitch === 'brake') inp.brake = 1;
        if (glitch === 'rearBrake') inp.rearBrake = 1;
        if (glitch === 'wheelie') inp.lean = -1;
        if (glitch === 'throttleOff') inp.throttle = 0;
      }
      v.step(FIXED_DT);
      if (v.events.some((e) => e.type === 'reset')) justReset = true; // the game itself put the vehicle back on the track (out of bounds, stuck...): not a bug
      v.events.length = 0;
      if (process.env.TRACE) { ring.push(`t=${t.toFixed(2)} gnd=${v.grounded ? 1 : 0} spd=${v.speed.toFixed(1)} w=(${v.angVel.x.toFixed(1)},${v.angVel.y.toFixed(1)},${v.angVel.z.toFixed(1)}) up.y=${v.up.y.toFixed(2)} fwd.y=${v.fwd.y.toFixed(2)} steer=${inp.steer.toFixed(2)} thr=${inp.throttle.toFixed(2)} brk=${inp.brake.toFixed(2)} rb=${inp.rearBrake.toFixed(2)} clutch=${inp.clutch ? 1 : 0} lean=${inp.lean.toFixed(1)} glitch=${glitch} hit=${v.probeHits ? v.probeHits.type : '-'} bar=${(v.barrierHit || 0).toFixed(1)}`); if (ring.length > 14) ring.shift(); }
      // ---- invariants
      const pv = [v.pos.x, v.pos.y, v.pos.z, v.vel.x, v.vel.y, v.vel.z, v.angVel.x, v.angVel.y, v.angVel.z, v.quat.x, v.quat.y, v.quat.z, v.quat.w];
      if (pv.some((x) => !Number.isFinite(x))) { flag('NaN/Infinity', `t=${t.toFixed(1)}s glitch=${glitch}`); break; }
      const w = v.angVel.length();
      if (w > 16 && !v.crashed) flag('spin > 16 rad/s', `t=${t.toFixed(1)}s ${w.toFixed(1)} rad/s grounded=${v.grounded} glitch=${glitch}`);
      if (Math.abs(v.vel.y) > 45) flag('vertical speed > 45 m/s', `t=${t.toFixed(1)}s vy=${v.vel.y.toFixed(0)} glitch=${glitch}`);
      { const jump = Math.hypot(v.pos.x - lastPos.x, v.pos.y - lastPos.y, v.pos.z - lastPos.z); if (jump > 2.5 && !justReset) flag('teleported', `t=${t.toFixed(1)}s moved ${jump.toFixed(1)} m in one step`); lastPos.copy(v.pos); justReset = false; }
      if (v.speed > 90) flag('speed > 90 m/s', `t=${t.toFixed(1)}s ${v.speed.toFixed(0)} m/s glitch=${glitch}`);
      groundAt(W, v.pos.x, v.pos.z, g);
      if (!v.crashed && v.pos.y < g.h - 1.5) flag('fell through the ground', `t=${t.toFixed(1)}s y=${v.pos.y.toFixed(2)} ground=${g.h.toFixed(2)} glitch=${glitch}`);
      if (!v.crashed && !v.grounded && v.airTime > 6 && v.speed < 1) flag('frozen in mid-air', `t=${t.toFixed(1)}s`);
      if (v.crashed) {
        crashes++; crashTally[v.crashReason] = (crashTally[v.crashReason] || 0) + 1;
        // respawn like the game does (put back on the track) and carry on
        const q = pointAt(T, v.trackS || 20, 0); v.placeAt(q.x, q.z, q.tx, q.tz); justReset = true; v.crashed = false; v.crashReason = ''; v.vel.set(0, 0, 0); v.angVel.set(0, 0, 0);
        if (v.controller && v.controller.reset) v.controller.reset();
      }
      // stuck: throttle held, on the ground, not moving for 6 seconds
      if (v.grounded && v.input.throttle > 0.5 && v.speed < 0.3) stuck += FIXED_DT; else stuck = 0;
      if (stuck > 6) { flag('stuck on the ground with throttle held', `t=${t.toFixed(1)}s at ${v.pos.x.toFixed(0)},${v.pos.z.toFixed(0)}`); stuck = -100; }
    }
  }
}

if (!problems.length) console.log(`no physics problems: ${ids.length} vehicles x ${tracks.length} tracks x ${SECONDS}s`);
else { console.log(`${problems.length} problem(s):`); for (const p of problems) console.log(`  ${p.id} on ${p.track}: ${p.what} (${p.detail})`); }
console.log('crash reasons seen:', JSON.stringify(crashTally));
process.exitCode = problems.length ? 1 : 0;
