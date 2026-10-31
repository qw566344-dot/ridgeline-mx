// Steering feel, measured: does the vehicle go where you point it?
//  - turn:    full lock for 1.2 s at riding speed -> how fast it turns (deg/s)
//  - release: let go of the bars -> it must NOT swing back the other way
//  - straight: hands off for 4 s -> it must not wander / steer itself
//   node tools/steer-test.js [vehicle,...]
import { getTrack } from '../shared/tracks.js';
import { makeWorld } from '../shared/terrain.js';
import { Vehicle, FIXED_DT } from '../client/js/sim/vehicle.js';
import { pointAt } from '../shared/trackgen.js';

const W = makeWorld(getTrack('practice'));
const T = W.T;
const ids = (process.argv[2] || 'mx250,mx450,atv450,utv,sxs').split(',');
const heading = (v) => Math.atan2(v.fwd.x, v.fwd.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
let fails = 0;
const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) fails++; };

function run(id, speed, steerDir) {
  const v = new Vehicle(id, W);
  v.trackBounds = () => {}; // open field: no barriers in the way
  const p = pointAt(T, T.gateS + 10, 0);
  v.placeAt(p.x, p.z, p.tx, p.tz);
  const step = (n, inp) => { for (let i = 0; i < n; i++) { Object.assign(v.input, inp); v.step(FIXED_DT); } };
  // get up to speed, straight
  for (let i = 0; i < 120 * 8 && v.speed < speed; i++) step(1, { throttle: 1, steer: 0 });
  step(30, { throttle: 0.5, steer: 0 });
  const h0 = heading(v);
  step(144, { throttle: 0.5, steer: steerDir });           // 1.2 s full lock
  const turned = wrap(heading(v) - h0) / 1.2 * 57.3;        // deg/s
  const h1 = heading(v);
  let back = 0;                                             // how far it swings back against the turn
  for (let i = 0; i < 120; i++) { step(1, { throttle: 0.5, steer: 0 }); back = Math.max(back, -Math.sign(turned) * wrap(heading(v) - h1) * 57.3); }
  // hands off for 4 s: wander
  const h2 = heading(v);
  let wander = 0;
  for (let i = 0; i < 480; i++) { step(1, { throttle: 0.5, steer: 0 }); wander = Math.max(wander, Math.abs(wrap(heading(v) - h2)) * 57.3); }
  return { turned, back, wander, crashed: v.crashed, reason: v.crashReason, spd: v.speed };
}

for (const id of ids) {
  for (const spd of [9, 16]) {
    const L = run(id, spd, 1), R = run(id, spd, -1);
    const t = (Math.abs(L.turned) + Math.abs(R.turned)) / 2;
    console.log(`${id.padEnd(8)} ${spd} m/s  turn ${t.toFixed(0)} deg/s (L ${L.turned.toFixed(0)}, R ${R.turned.toFixed(0)})  swings back ${Math.max(L.back, R.back).toFixed(1)} deg  wanders ${Math.max(L.wander, R.wander).toFixed(1)} deg${L.crashed || R.crashed ? '  CRASH ' + (L.reason || R.reason) : ''}`);
    ok(Math.sign(L.turned) !== Math.sign(R.turned), `${id} ${spd}: left and right turn opposite ways`);
    ok(Math.max(L.back, R.back) < 3, `${id} ${spd}: no swing back the wrong way after letting go`);
    ok(Math.max(L.wander, R.wander) < 8, `${id} ${spd}: goes straight hands-off`); // 4 s across open ground and jumps
    ok(!L.crashed && !R.crashed, `${id} ${spd}: no crash`);
  }
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
