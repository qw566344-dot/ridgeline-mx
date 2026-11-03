// Preload pop: holding E (lean forward) and letting go pops the bike only on a jump - never on the
// flat (leaning into a turn with E and letting go used to bunny-hop the bike).
//   node tools/pop-test.js
import { makeWorld } from '../shared/terrain.js';
import { Vehicle, FIXED_DT } from '../client/js/sim/vehicle.js';
import { pointAt } from '../shared/trackgen.js';
import { TRACKS } from '../shared/tracks.js';
import { AIDriver } from '../client/js/sim/ai.js';

const OVAL = {
  id: 'oval', name: 'Test Oval', worldSize: 900, seed: 1, start: { x: -300, z: 120, heading: 0 }, defaultWidth: 30,
  terrain: { hills: 0, hillScale: 100, rim: 0, rimStart: 999, bumps: [] },
  segments: [{ len: 600, free: true }, { turn: 180, r: 120, berm: 0 }, { len: 600, free: true }, { turn: 180, r: 120, berm: 0 }],
  gateAt: 10, finishAt: 50,
};
const W = makeWorld(OVAL);
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

for (const id of ['mx250', 'mx450']) {
  const v = new Vehicle(id, W);
  const p = pointAt(W.T, W.T.gateS + 20, 0);
  v.placeAt(p.x, p.z, p.tx, p.tz);
  let pops = 0;
  const run = (secs, set) => { for (let t = 0; t < secs; t += FIXED_DT) { set(); v.events.length = 0; v.step(FIXED_DT); pops += v.events.filter((e) => e.type === 'pop').length; } };
  run(3, () => { v.input.throttle = 1; v.input.steer = 0; v.input.lean = 0; });                 // get up to speed
  for (let k = 0; k < 4; k++) {
    run(1.2, () => { v.input.throttle = 0.6; v.input.steer = 0.7; v.input.lean = 1; });          // turn, leaning in with E
    run(0.8, () => { v.input.throttle = 0.6; v.input.steer = 0.2; v.input.lean = 0; });          // let go
  }
  ok(pops === 0, `${id}: leaning into turns with E and letting go on the flat never hops (${pops} pops)`);
}
// on real jumps: the AI rides a track; hold E while the bike climbs a jump face, let go at the lip
{
  const world = makeWorld(TRACKS.find((t) => t.id === 'ridgeline') || TRACKS[0]);
  const v = new Vehicle('mx450', world);
  const p = pointAt(world.T, world.T.gateS, 0);
  v.placeAt(p.x, p.z, p.tx, p.tz);
  const ai = new AIDriver(v, { skill: 1.0, lane: 0 });
  let pops = 0;
  for (let t = 0; t < 90 && pops < 2; t += FIXED_DT) {
    ai.update(FIXED_DT);
    v.input.lean = v.grounded && v.fwd.y > 0.16 ? 1 : 0; // compress up the face, release at the lip
    v.events.length = 0;
    v.step(FIXED_DT);
    pops += v.events.filter((e) => e.type === 'pop').length;
  }
  ok(pops > 0, `letting go of E at the lip of a real jump still pops (${pops})`);
}
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
