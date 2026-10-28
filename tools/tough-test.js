// Cars should be hard to crash: tipped on the side they right themselves,
// hard and nose-heavy landings are survived, and the roof never leaves you stuck.
//   node tools/tough-test.js
import * as THREE from '../client/vendor/three.module.js';
import { getTrack } from '../shared/tracks.js';
import { makeWorld } from '../shared/terrain.js';
import { Vehicle, FIXED_DT } from '../client/js/sim/vehicle.js';
import { pointAt } from '../shared/trackgen.js';

const W = makeWorld(getTrack('practice'));
const T = W.T;
let fails = 0;
const ok = (c, what) => { console.log((c ? 'ok   ' : 'FAIL ') + what); if (!c) fails++; };
function drop(id, rollDeg, pitchDeg, height, vy = 0) {
  const v = new Vehicle(id, W);
  const p = pointAt(T, T.gateS + 20, 0); v.placeAt(p.x, p.z, p.tx, p.tz);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchDeg * Math.PI / 180, 0, rollDeg * Math.PI / 180));
  v.quat.multiply(q); v.pos.y += height; v.vel.y = vy;
  v.prevQuat.copy(v.quat); v.prevPos.copy(v.pos);
  for (let i = 0; i < 120 * 6; i++) v.step(FIXED_DT);
  return v;
}
for (const id of ['utv', 'utvr']) {
  let v = drop(id, 85, 0, 0.8);
  ok(!v.crashed && v.up.y > 0.8, `${id} on its side rights itself (up ${v.up.y.toFixed(2)}, crashed ${v.crashed})`);
  v = drop(id, 0, -40, 3, -12);
  ok(!v.crashed, `${id} survives a nose-first slam from 3 m (crashed ${v.crashed} ${v.crashReason || ''})`);
  v = drop(id, 0, 55, 2, -10);
  ok(!v.crashed, `${id} survives landing on its tail (crashed ${v.crashed} ${v.crashReason || ''})`);
  v = drop(id, 180, 0, 1.5);
  ok(v.crashed || v.up.y > 0.8, `${id} on its roof never stays stuck (crashed ${v.crashed}, up ${v.up.y.toFixed(2)})`);
}
console.log(fails ? `${fails} FAILED` : 'all passed');
