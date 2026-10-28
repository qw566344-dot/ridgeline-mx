// Tests manual wheelies and air tricks with the real physics.
//   node tools/trick-test.js
import { getTrack } from '../shared/tracks.js';
import { makeWorld } from '../shared/terrain.js';
import { Vehicle, FIXED_DT } from '../client/js/sim/vehicle.js';
import { AIDriver } from '../client/js/sim/ai.js';
import { pointAt } from '../shared/trackgen.js';

const W = makeWorld(getTrack('ridgeline'));
const T = W.T;
const f1 = (x) => x.toFixed(1);

// --- wheelie on the start straight
for (const id of ['mx450', 'mx250', 'atv450']) {
  const v = new Vehicle(id, W);
  const p = pointAt(T, T.gateS, 0); v.placeAt(p.x, p.z, p.tx, p.tz);
  for (let i = 0; i < 120 * 1.5; i++) { v.input.throttle = 1; v.step(FIXED_DT); }
  const trace = [];
  let maxP = 0, upTime = 0;
  for (let i = 0; i < 120 * 3; i++) {
    const p = v.groundPitch();
    // hold Q, feather the throttle to keep it near 25 degrees like a player would
    v.input.lean = p < 22 ? -1 : p < 32 ? -0.4 : 0;
    v.input.throttle = p < 30 ? 0.8 : 0.3;
    v.step(FIXED_DT);
    maxP = Math.max(maxP, p);
    if (!v.wheels[0].contact) upTime += FIXED_DT;
    if (i % 60 === 0) trace.push(f1(p));
  }
  console.log(`${id} wheelie: front up ${f1(upTime)}s of 3s, max pitch ${f1(maxP)}, pitch trace ${trace.join(' ')}, crashed ${v.crashed} ${v.crashReason}`);
  // let go: it should come back down by itself
  for (let i = 0; i < 120 * 2; i++) { v.input.lean = 0; v.input.throttle = 0.5; v.step(FIXED_DT); }
  console.log(`   after letting go: pitch ${f1(v.groundPitch())}, front on ground ${v.wheels[0].contact}`);
}

// --- flips off the big downhill table
for (const [id, lean, label] of [['mx450', -1, 'backflip'], ['mx450', 1, 'front flip'], ['mx450', 'whip', 'whip'], ['atv450', -1, 'backflip'], ['mx450', 'spin', '360 spin'], ['atv450', 'spin', '360 spin'], ['utv', 'spin', '360 spin'], ['mx450', 'pose1', 'superman'], ['mx250', 'pose4', 'cliffhanger'], ['atv450', 'pose2', 'nac-nac'], ['mx450', 'posebad', 'superman held into the landing']]) {
  const tbl = T.features.find((f) => f.type === 'table' && f.segName === 'Big Downhill');
  const v = new Vehicle(id, W);
  const p = pointAt(T, tbl.s0 - 60, 0); v.placeAt(p.x, p.z, p.tx, p.tz);
  const ai = new AIDriver(v, { skill: 1.06 });
  let tricks = [], air = 0, took = false;
  for (let i = 0; i < 120 * 12; i++) {
    if (!v.grounded && v.airTime > 0.12) {
      took = true;
      air = Math.max(air, v.airTime);
      const t = v.controller.trick;
      const rot = t ? Math.abs(t.pitch) : 0;
      v.input.throttle = 0.3; v.input.brake = 0; v.input.rearBrake = 0;
      v.input.trick = 0;
      if (String(lean).startsWith('pose')) { v.input.lean = 0; v.input.steer = 0; v.input.trick = lean === 'posebad' ? 1 : v.airTime < 1.0 && !tricks.length ? Number(lean[4]) : 0; }
      else if (lean === 'whip') { v.input.lean = 0; v.input.steer = v.airTime < 0.7 ? 1 : 0; }
      else if (lean === 'spin') { const y = v.controller.trick ? Math.abs(v.controller.trick.yaw) : 0; v.input.lean = 0; v.input.clutch = y < 2 * Math.PI - 1.2; v.input.steer = v.input.clutch ? 1 : 0; }
      else { v.input.steer = 0; v.input.lean = rot < 2 * Math.PI - 1.7 ? lean : 0; }
    } else { ai.update(FIXED_DT); v.input.clutch = false; if (lean !== 'posebad' || !took) v.input.trick = 0; }
    v.step(FIXED_DT);
    for (const e of v.events) if (e.type === 'trick') tricks.push(e.name + ' (' + e.landing + ' ' + e.score + ')');
    v.events.length = 0;
    if (took && v.grounded && v.groundTime > 0.5) break;
  }
  console.log(`${id} ${label}: air ${air.toFixed(2)}s, tricks [${tricks.join(', ')}], crashed ${v.crashed} ${v.crashReason}`);
}
