// One AI lap on every track: crashes, out-of-bounds resets and lap time.
// Use it after changing the AI, the tracks or the track edges.
//   node tools/ai-sweep.js [vehicle,...]
import { TRACKS } from '../shared/tracks.js';
import { makeWorld } from '../shared/terrain.js';
import { Vehicle, FIXED_DT } from '../client/js/sim/vehicle.js';
import { AIDriver } from '../client/js/sim/ai.js';
import { pointAt } from '../shared/trackgen.js';

const vids = (process.argv[2] || 'mx450,atv450,utv').split(',');
let bad = 0;
for (const tr of TRACKS.filter((t) => !process.argv[3] || process.argv[3].split(',').includes(t.id))) {
  const W = makeWorld(tr), T = W.T;
  const row = [];
  for (const vid of vids) {
    const v = new Vehicle(vid, W);
    const p = pointAt(T, T.gateS, 0);
    v.placeAt(p.x, p.z, p.tx, p.tz);
    const ai = new AIDriver(v, { skill: 1, lane: 0 });
    let dist = 0, last = v.trackS, t = 0, crashes = 0, oob = 0;
    const where = [];
    while (dist < T.L && t < 300) {
      ai.update(FIXED_DT);
      v.step(FIXED_DT);
      t += FIXED_DT;
      let d = v.trackS - last; if (d < -T.L / 2) d += T.L; if (d > T.L / 2) d -= T.L;
      if (Math.abs(d) < 30) dist += d;
      last = v.trackS;
      for (const e of v.events) if (e.type === 'crash') { crashes++; if (e.reason === 'Out of bounds') oob++; if (where.length < 3) where.push(Math.round(v.trackS)); }
      v.events.length = 0;
    }
    const done = dist >= T.L;
    if (!done || crashes > 2) bad++;
    row.push(`${vid} ${done ? t.toFixed(0) + 's' : 'DNF'} crash ${crashes}${oob ? ` (oob ${oob} at ${where.join(',')})` : ''}`);
  }
  console.log(tr.id.padEnd(14), row.join('  |  '));
}
console.log(bad ? `${bad} runs with a DNF or 3+ crashes` : 'all clean');
