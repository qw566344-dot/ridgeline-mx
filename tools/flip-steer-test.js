// Flip + steer check: do a backflip (or front flip) off the big table while steering a little (A / D), starting the
// steering at different moments, then let go and land. A good flip stays a flip: it keeps turning at its normal speed,
// a touch of steering must not twist the vehicle into a spin or crash it.
//   node tools/flip-steer-test.js [vehicle,...]
import { getTrack } from '../shared/tracks.js';
import { makeWorld } from '../shared/terrain.js';
import { Vehicle, FIXED_DT } from '../client/js/sim/vehicle.js';
import { AIDriver } from '../client/js/sim/ai.js';
import { pointAt } from '../shared/trackgen.js';

const W = makeWorld(getTrack('ridgeline'));
const T = W.T, D = 180 / Math.PI;
const ids = (process.argv[2] || 'mx450,mx250,atv450,sled600').split(',');
const tbl = T.features.find((f) => f.type === 'table' && f.segName === 'Big Downhill');
let fails = 0, runs = 0;

// the AI uses Math.random: seed it so every run (and the no-steer baseline) takes off exactly the same way
let seedMath = 1; const seedRandom = (n) => { seedMath = n >>> 0; Math.random = () => { seedMath = (seedMath * 1664525 + 1013904223) >>> 0; return seedMath / 4294967296; }; };
function run(id, leanSign, steer, steerStart, steerLen) {
  seedRandom(777);
  const v = new Vehicle(id, W);
  const p = pointAt(T, tbl.s0 - 60, 0); v.placeAt(p.x, p.z, p.tx, p.tz);
  const ai = new AIDriver(v, { skill: 1.06 });
  let took = false, maxW = 0, maxYawW = 0, maxRollW = 0, flips = 0, lastPitch = 0, nan = false, air = 0, flipDone = false;
  let pitchTotal = 0, prevFwd = null;
  for (let i = 0; i < 120 * 12; i++) {
    const inAir = !v.grounded && v.airTime > 0.1 && (took || v.trackS > tbl.s0 - 3);
    if (inAir) {
      took = true; air = Math.max(air, v.airTime);
      const tr = v.controller.trick;
      const pitch = tr ? Math.abs(tr.pitch) : 0;
      if (pitch > 6.0) flipDone = true;                       // one full rotation is done: let go of the flip key
      v.input.throttle = 0.3; v.input.brake = 0; v.input.rearBrake = 0; v.input.trick = 0; v.input.clutch = false;
      v.input.lean = flipDone || v.airTime > 1.35 ? 0 : leanSign;
      v.input.steer = v.airTime >= steerStart && v.airTime < steerStart + steerLen ? steer : 0;
    } else if (!took) ai.update(FIXED_DT);
    v.step(FIXED_DT);
    v.events.length = 0;
    if (v.crashed) break; // what a crashed vehicle does afterwards is not the flip
    if (!Number.isFinite(v.pos.x + v.pos.y + v.pos.z + v.angVel.x + v.angVel.y + v.angVel.z + v.quat.w)) { nan = true; break; }
    if (took && !v.grounded) {
      const w = v.angVel.length(); maxW = Math.max(maxW, w);
      maxYawW = Math.max(maxYawW, Math.abs(v.angVel.dot(v.up)));
      maxRollW = Math.max(maxRollW, Math.abs(v.angVel.dot(v.fwd)));
    }
    if (took && v.grounded && v.groundTime > 0.6) break;
  }
  const tr = v.controller.trick;
  return { crashed: v.crashed, reason: v.crashReason, nan, maxW, maxYawW, maxRollW, air };
}

for (const id of ids) for (const leanSign of [-1, 1]) {
  const base = run(id, leanSign, 0, 0.3, 0.15); // the same flip with no steering at all: steering must not make it worse
  console.log(`     (${id} ${leanSign < 0 ? 'back ' : 'front'} flip with no steering: air ${base.air.toFixed(2)}s, max spin ${base.maxW.toFixed(1)}${base.crashed ? ', CRASH: ' + base.reason : ''})`);
  for (const steer of [0.2, 0.5, 1]) for (const [start, len] of [[0.3, 0.15], [0.5, 0.3], [0.7, 0.6]]) {
    const r = run(id, leanSign, steer, start, len);
    runs++;
    const bad = r.nan || (r.crashed && !base.crashed) || r.maxW > Math.max(11, base.maxW * 1.4 + 1) || (!r.crashed && r.air > base.air + 0.8) || r.maxRollW > base.maxRollW + 4 || r.maxYawW > base.maxYawW + 6;
    if (bad) fails++;
    console.log(`${bad ? 'FAIL' : 'ok  '} ${id} ${leanSign < 0 ? 'back ' : 'front'} flip steer ${steer} @${start}s for ${len}s: air ${r.air.toFixed(2)}s (no steer ${base.air.toFixed(2)})  max spin ${r.maxW.toFixed(1)} (no steer ${base.maxW.toFixed(1)})  twist ${r.maxRollW.toFixed(1)}${r.crashed ? '  CRASH: ' + r.reason : ''}${r.nan ? '  NaN!' : ''}`);
  }
}
console.log(fails ? `${fails} of ${runs} FAILED` : `all ${runs} passed`);
process.exitCode = fails ? 1 : 0;
