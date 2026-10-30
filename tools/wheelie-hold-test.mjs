// Wheelie control: just HOLD Q + throttle (no fiddling) - the front should come
// up, sit at a steady angle without looping, and come down gently when Q is let
// go, scoring a wheelie trick.   node tools/wheelie-hold-test.mjs
import { getTrack } from '../shared/tracks.js';
import { makeWorld } from '../shared/terrain.js';
import { Vehicle, FIXED_DT } from '../client/js/sim/vehicle.js';
import { pointAt } from '../shared/trackgen.js';

const W = makeWorld(getTrack('motopark'));
let ok = true;
for (const id of ['mx250', 'mx450', 'mx125', 'volt', 'sm450', 'atv450', 'atv700']) {
  const v = new Vehicle(id, W);
  v.assist.wheelie = true; v.assist.traction = true; v.assist.landing = 0.6;
  const p = pointAt(W.T, W.T.gateS, 0); v.placeAt(p.x, p.z, p.tx, p.tz);
  const pitches = []; let up = 0, events = [], maxP = 0, touch = 0;
  for (let i = 0; i < 120 * 7; i++) {
    const t = i * FIXED_DT;
    v.input.throttle = t < 5 ? 0.85 : 0.4;
    v.input.lean = t > 0.8 && t < 5 ? -1 : 0;           // hold Q from 0.8 s to 5 s, then let go
    const keep = v.angVel.dot(v.left);
    v.step(FIXED_DT);
    for (const e of v.events) if (e.type === 'trick') events.push(e.name);
    v.events.length = 0;
    const front = v.wheels.filter((w) => w.cfg.z > 0).some((w) => w.contact);
    if (!front && v.grounded) up += FIXED_DT;
    if (t > 2.5 && t < 5) { pitches.push(v.groundPitch()); maxP = Math.max(maxP, v.groundPitch()); }
    if (t > 5 && front && !touch) touch = keep; // nose-down rate when the front touches
    if (v.crashed) break;
  }
  const avg = pitches.reduce((a, b) => a + b, 0) / Math.max(1, pitches.length);
  const spread = Math.max(...pitches) - Math.min(...pitches);
  const pass = !v.crashed && up > 3 && avg > 18 && avg < 45 && spread < 18 && events.some((n) => /Wheelie/.test(n));
  if (!pass) ok = false;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${id}: front up ${up.toFixed(1)} s, angle ${avg.toFixed(0)} deg (swing ${spread.toFixed(0)}), touchdown ${touch.toFixed(2)} rad/s, ${v.crashed ? 'CRASH ' + v.crashReason : events.join(', ') || 'no trick'}`);
}
console.log(ok ? 'all passed' : 'FAILED');
process.exit(ok ? 0 : 1);
