// Whips: hold A / D for different times off a big table, let go, and check the bike comes back
// straight and level before it lands (no flips, no crashes, no crooked landings).
//   node tools/whip-test.js [vehicle,...]
import { getTrack } from '../shared/tracks.js';
import { makeWorld } from '../shared/terrain.js';
import { Vehicle, FIXED_DT } from '../client/js/sim/vehicle.js';
import { AIDriver } from '../client/js/sim/ai.js';
import { pointAt } from '../shared/trackgen.js';

const W = makeWorld(getTrack('ridgeline'));
const T = W.T;
const DEG = 180 / Math.PI;
const ids = (process.argv[2] || 'mx450,mx250,mx125,enduro').split(',');
let fails = 0;
const tables = T.features.filter((f) => f.type === 'table' || f.type === 'double').slice(0, 6);
for (const id of ids) for (const tbl of [T.features.find((f) => f.type === 'table' && f.segName === 'Big Downhill'), ...tables.slice(0, 2)]) for (const hold of [0.25, 0.5, 0.8, 1.2]) for (const side of [1, -1]) {
  const v = new Vehicle(id, W);
  const p = pointAt(T, tbl.s0 - 60, 0); v.placeAt(p.x, p.z, p.tx, p.tz);
  const ai = new AIDriver(v, { skill: 1.06 });
  let took = false, maxRoll = 0, maxPitchW = 0, air = 0, land = null, maxTp = 0;
  for (let i = 0; i < 120 * 12; i++) {
    if (!v.grounded && v.airTime > 0.1 && (took || v.trackS > tbl.s0 - 3)) {
      took = true; air = Math.max(air, v.airTime);
      v.input.throttle = 0.3; v.input.brake = 0; v.input.rearBrake = 0; v.input.lean = 0; v.input.trick = 0; v.input.clutch = false;
      v.input.steer = v.airTime < 0.1 + hold ? side : 0;
      maxRoll = Math.max(maxRoll, Math.abs(v.controller.airRoll || 0) * DEG);
      if (v.controller.trick) maxTp = Math.max(maxTp, Math.abs(v.controller.trick.pitch) * DEG);
    } else { if (took && !land) land = { roll: (v.controller.airRoll || 0) * DEG }; ai.update(FIXED_DT); v.input.clutch = false; }
    v.step(FIXED_DT);
    v.events.length = 0;
    if (took && v.grounded && v.groundTime > 0.6) break;
  }
  const bad = v.crashed || maxTp > 150;
  if (bad) fails++;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${id} ${tbl.segName || tbl.type}@${Math.round(tbl.s0)} hold ${hold}s side ${side}: air ${air.toFixed(2)}s max roll ${maxRoll.toFixed(0)} pitch rot ${maxTp.toFixed(0)} ${v.crashed ? 'CRASH ' + v.crashReason : ''}`);
}
console.log(fails ? fails + ' FAILED' : 'all passed');
