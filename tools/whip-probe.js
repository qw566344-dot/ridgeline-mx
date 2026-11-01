// Traces a whip off the big downhill table: roll, nose offset from the flight
// direction, spin rates, every 0.05 s.   node tools/whip-probe.js [vehicle] [holdSeconds] [steer]
import { getTrack } from '../shared/tracks.js';
import { makeWorld } from '../shared/terrain.js';
import { Vehicle, FIXED_DT } from '../client/js/sim/vehicle.js';
import { AIDriver } from '../client/js/sim/ai.js';
import { pointAt } from '../shared/trackgen.js';

const [id = 'mx450', hold = '0.7', steer = '1'] = process.argv.slice(2);
const W = makeWorld(getTrack('ridgeline'));
const T = W.T;
const D = 180 / Math.PI;
const tbl = T.features.find((f) => f.type === 'table' && f.segName === 'Big Downhill');
const v = new Vehicle(id, W);
const p = pointAt(T, tbl.s0 - 60, 0); v.placeAt(p.x, p.z, p.tx, p.tz);
const ai = new AIDriver(v, { skill: 1.06 });
let took = false, tick = 0;
for (let i = 0; i < 120 * 12; i++) {
  if (!v.grounded && v.airTime > 0.12 && (took || v.trackS > tbl.s0 - 3)) {
    took = true;
    v.input.throttle = 0.3; v.input.brake = 0; v.input.lean = 0; v.input.clutch = false;
    v.input.steer = v.airTime < Number(hold) ? Number(steer) : 0;
  } else { ai.update(FIXED_DT); }
  v.step(FIXED_DT);
  if (took && tick++ % 6 === 0) {
    const f = v.fwd, yawOff = Math.atan2(v.vel.z * f.x - v.vel.x * f.z, v.vel.x * f.x + v.vel.z * f.z) * D;
    console.log(`t ${v.airTime.toFixed(2)} gnd ${v.grounded ? 1 : 0} steerIn ${v.input.steer} roll ${(Math.asin(Math.max(-1, Math.min(1, v.left.y))) * D).toFixed(0)} yawOff ${yawOff.toFixed(0)} pitch ${(Math.asin(f.y) * D).toFixed(0)} wYaw ${v.angVel.y.toFixed(2)} amt ${(v.controller.whipAmt || 0).toFixed(2)}`);
  }
  for (const e of v.events) if (e.type === 'trick') console.log('TRICK', e.name, e.landing, e.score);
  v.events.length = 0;
  if (v.crashed) { console.log('CRASH', v.crashReason); break; }
  if (took && v.grounded && v.groundTime > 0.6) break;
}
