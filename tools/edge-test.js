// Barriers: a hard hit crashes you, a gentle one does not, and going over the
// barrier puts you back on the track. Also checks the admin cheats.
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

for (const id of ['mx250', 'atv450', 'utv']) {
  const { v, maxPast } = rideOff(id);
  ok(v.crashed && v.crashReason === 'Hit the barrier', `${id} slams into the barrier and crashes (crashed ${v.crashed} ${v.crashReason || ''})`);
  ok(maxPast < 0.5, `${id} is stopped by the barrier (${maxPast.toFixed(1)} m past it)`);
}
// a gentle bump just scrapes along
{
  const v = new Vehicle('mx250', W);
  const s0 = T.gateS + 20, p = pointAt(T, s0, sampleArr(T, T.fenceL, s0) - 2);
  const a = 0.25, tx = p.tx * Math.cos(a) - p.tz * Math.sin(a), tz = p.tx * Math.sin(a) + p.tz * Math.cos(a);
  v.placeAt(p.x, p.z, tx, tz);
  for (let i = 0; i < 120 * 3; i++) { v.input.throttle = 0.35; v.step(FIXED_DT); }
  ok(!v.crashed, `a gentle bump into the barrier is not a crash (crashed ${v.crashed} ${v.crashReason || ''})`);
}
// over the barrier (came down outside it) = reset, not a crash
for (const id of ['mx250', 'utv']) {
  const v = new Vehicle(id, W);
  const s0 = T.gateS + 20, p = pointAt(T, s0, sampleArr(T, T.fenceL, s0) + 6);
  v.placeAt(p.x, p.z, p.tx, p.tz);
  let off = 0;
  for (let i = 0; i < 120; i++) { v.step(FIXED_DT); off = Math.max(off, v.offTrack); }
  ok(!v.crashed && off >= 0.9, `${id} landing past the barrier is reset (offTrack ${off.toFixed(2)}, crashed ${v.crashed})`);
}
{
  const { v } = rideOff('mx250', { noCrash: true });
  ok(!v.crashed, '"No crashing" cheat: no crash on the barrier');
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
