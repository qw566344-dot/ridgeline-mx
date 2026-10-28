// Does a held wheelie cost speed? Same bike, same flat straight: one run flat out,
// one run flat out while holding a wheelie (Q). Prints speed over time.
//   node tools/wheelie-test.mjs
import { getTrack } from '../shared/tracks.js';
import { makeWorld } from '../shared/terrain.js';
import { Vehicle, FIXED_DT } from '../client/js/sim/vehicle.js';
import { pointAt } from '../shared/trackgen.js';

const W = makeWorld(getTrack('motopark'));
const T = W.T;
for (const id of ['mx450', 'mx250', 'atv450']) {
  const res = {};
  for (const mode of ['normal', 'wheelie']) {
    const v = new Vehicle(id, W);
    v.assist.wheelie = true; v.assist.traction = true; v.assist.landing = 0.6;
    const p = pointAt(T, T.gateS, 0); v.placeAt(p.x, p.z, p.tx, p.tz);
    const trace = [];
    let upTime = 0;
    for (let i = 0; i < 120 * 6; i++) {
      v.input.throttle = 1;
      // hold the front up: pull Q, ease off once it is up past ~20 degrees, then hold it there
      const pitch = v.groundPitch();
      v.input.lean = mode === 'wheelie' ? (pitch < 18 ? -1 : pitch > 30 ? 0.3 : -0.35) : 0;
      v.step(FIXED_DT);
      if (mode === 'wheelie' && !v.wheels[0].contact && v.grounded) upTime += FIXED_DT;
      if (i % 120 === 119) trace.push((v.speed * 2.237).toFixed(1));
      if (v.crashed) { trace.push('CRASH ' + v.crashReason); break; }
    }
    res[mode] = trace.join(' ') + (mode === 'wheelie' ? `  (front up ${upTime.toFixed(1)} s)` : '');
  }
  console.log(id, '\n  normal :', res.normal, '\n  wheelie:', res.wheelie);
}
