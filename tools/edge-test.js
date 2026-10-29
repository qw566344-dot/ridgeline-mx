// No barriers: riding off the edge of the track is out of bounds - bikes and
// quads crash, cars are flagged for a reset. Also checks the admin cheats.
//   node tools/edge-test.js
import { getTrack } from '../shared/tracks.js';
import { makeWorld } from '../shared/terrain.js';
import { Vehicle, FIXED_DT } from '../client/js/sim/vehicle.js';
import { pointAt, sampleArr } from '../shared/trackgen.js';

const W = makeWorld(getTrack('practice'));
const T = W.T;
let fails = 0;
const ok = (c, what) => { console.log((c ? 'ok   ' : 'FAIL ') + what); if (!c) fails++; };

// ride straight out of the side of the track at full throttle
function rideOff(id, set = {}) {
  const v = new Vehicle(id, W);
  Object.assign(v, set);
  const s = T.gateS + 20, p = pointAt(T, s, 0);
  const a = 0.9; // aim ~50 degrees towards the left edge
  const tx = p.tx * Math.cos(a) - p.tz * Math.sin(a), tz = p.tx * Math.sin(a) + p.tz * Math.cos(a);
  v.placeAt(p.x, p.z, tx, tz);
  let maxPast = -99, offT = 0;
  for (let i = 0; i < 120 * 8 && !v.crashed; i++) {
    v.input.throttle = 1;
    v.step(FIXED_DT);
    maxPast = Math.max(maxPast, Math.abs(v.trackU) - Math.max(sampleArr(T, T.fenceL, v.trackS), sampleArr(T, T.fenceR, v.trackS)));
    offT = Math.max(offT, v.offTrack);
  }
  return { v, maxPast, offT };
}

for (const id of ['mx250', 'atv450']) {
  const { v, maxPast } = rideOff(id);
  ok(v.crashed && v.crashReason === 'Out of bounds', `${id} rides off the edge and crashes out of bounds (crashed ${v.crashed} ${v.crashReason || ''})`);
  ok(maxPast > 0.4, `${id} is not stopped by a barrier (got ${maxPast.toFixed(1)} m past the edge)`);
}
{
  const { v, offT } = rideOff('utv');
  ok(!v.crashed && offT >= 0.9, `side-by-side off the edge is reset, not crashed (offTrack ${offT.toFixed(2)})`);
}
{
  const { v, offT } = rideOff('mx250', { noCrash: true });
  ok(!v.crashed && offT >= 0.9, `"No crashing" cheat: no crash, still reset off the edge`);
}
// moon gravity: falls slower
function fall(scale) {
  const v = new Vehicle('mx250', W); v.gravityScale = scale;
  const p = pointAt(T, T.gateS + 20, 0); v.placeAt(p.x, p.z, p.tx, p.tz);
  v.pos.y += 30; v.prevPos.copy(v.pos);
  for (let i = 0; i < 60; i++) v.step(FIXED_DT);
  return -v.vel.y;
}
const f1 = fall(1), f2 = fall(0.35);
ok(f2 < f1 * 0.5, `moon gravity falls slower (${f2.toFixed(1)} vs ${f1.toFixed(1)} m/s after 0.5 s)`);
// turbo: faster on the same straight
function speedAfter(boost) {
  const v = new Vehicle('mx250', W); v.boost = boost;
  const p = pointAt(T, T.gateS + 5, 0); v.placeAt(p.x, p.z, p.tx, p.tz);
  for (let i = 0; i < 120 * 2.5; i++) { v.input.throttle = 1; v.step(FIXED_DT); }
  return v.speed;
}
const s0 = speedAfter(0), s1 = speedAfter(7);
ok(s1 > s0 * 1.2, `turbo is faster (${(s1 * 2.237).toFixed(0)} vs ${(s0 * 2.237).toFixed(0)} mph after 2.5 s)`);
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
