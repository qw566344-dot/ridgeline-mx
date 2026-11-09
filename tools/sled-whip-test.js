// Snowmobile whip check: hold A / D for different times off the big table and compare with the dirt bike.
// A good whip lays the vehicle over and swings the tail out (nose offset from the flight line up to ~80 degrees),
// and brings it back straight before landing - it must never spin into a 360 or land crooked.
//   node tools/sled-whip-test.js [vehicle,...]
import { getTrack } from '../shared/tracks.js';
import { makeWorld } from '../shared/terrain.js';
import { Vehicle, FIXED_DT } from '../client/js/sim/vehicle.js';
import { AIDriver } from '../client/js/sim/ai.js';
import { pointAt } from '../shared/trackgen.js';

const W = makeWorld(getTrack('ridgeline'));
const T = W.T, D = 180 / Math.PI;
const ids = (process.argv[2] || 'sled600,sled1000,mx450').split(',');
const tbl = T.features.find((f) => f.type === 'table' && f.segName === 'Big Downhill');
let fails = 0;
for (const id of ids) for (const hold of [0.25, 0.5, 0.8, 1.2]) for (const side of [1, -1]) {
  const v = new Vehicle(id, W);
  const p = pointAt(T, tbl.s0 - 60, 0); v.placeAt(p.x, p.z, p.tx, p.tz);
  const ai = new AIDriver(v, { skill: 1.06 });
  let took = false, maxOff = 0, maxRoll = 0, totalYaw = 0, offAtLand = 0, air = 0, lastYaw = null;
  for (let i = 0; i < 120 * 12; i++) {
    const inAir = !v.grounded && v.airTime > 0.1 && (took || v.trackS > tbl.s0 - 3);
    if (inAir) {
      took = true; air = Math.max(air, v.airTime);
      v.input.throttle = 0.3; v.input.brake = 0; v.input.rearBrake = 0; v.input.lean = 0; v.input.trick = 0; v.input.clutch = false;
      v.input.steer = v.airTime < 0.1 + hold ? side : 0;
    } else if (!took) ai.update(FIXED_DT);
    v.step(FIXED_DT);
    v.events.length = 0;
    if (took && !v.grounded) {
      const hx = v.fwd.x, hz = v.fwd.z, vx = v.vel.x, vz = v.vel.z;
      const off = Math.atan2(vz * hx - vx * hz, vx * hx + vz * hz) * D;           // nose offset from the flight line
      maxOff = Math.max(maxOff, Math.abs(off));
      maxRoll = Math.max(maxRoll, Math.abs(Math.asin(Math.max(-1, Math.min(1, v.left.y))) * D));
      const yaw = Math.atan2(hx, hz); if (lastYaw !== null) { let d = yaw - lastYaw; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; totalYaw += d * D; } lastYaw = yaw;
      offAtLand = off;
      if (process.env.TRACE && id === process.env.TRACE && hold === Number(process.env.HOLD || 0.5) && side === 1 && i % 6 === 0) console.log('  t', v.airTime.toFixed(2), 'steer', v.input.steer, 'roll', (Math.asin(v.left.y) * D).toFixed(0), 'nose', off.toFixed(0), 'pitch', (Math.asin(v.fwd.y) * D).toFixed(0), 'wYaw', v.angVel.dot(v.up).toFixed(2), 'wRoll', v.angVel.dot(v.fwd).toFixed(2), 'wPitch', v.angVel.dot(v.left).toFixed(2));
    }
    if (took && v.grounded && v.groundTime > 0.6) break;
  }
  const bad = v.crashed || Math.abs(totalYaw) > 150 || Math.abs(offAtLand) > 25;
  if (bad) fails++;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${id} hold ${hold}s side ${side}: air ${air.toFixed(2)}s  roll ${maxRoll.toFixed(0)}  nose offset ${maxOff.toFixed(0)}  total spin ${totalYaw.toFixed(0)}  off at landing ${offAtLand.toFixed(0)}${v.crashed ? ' CRASHED' : ''}`);
}
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exitCode = fails ? 1 : 0;
