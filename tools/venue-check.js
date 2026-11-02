// Checks the venue tracks: the lap never runs over itself, it fits inside the
// world with room for the buildings, and no crater sits on the track.
//   node tools/venue-check.js
import { VENUE_TRACKS } from '../shared/tracksVenues.js';
import { getTrack } from '../shared/tracks.js';
import { makeWorld } from '../shared/terrain.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
for (const def of VENUE_TRACKS) {
  const W = makeWorld(getTrack(def.id));
  const T = W.T, n = T.xs.length, step = T.L / n;
  // closest approach between parts of the lap at least 60 m apart along it
  let minD = Infinity;
  for (let i = 0; i < n; i += 4) for (let j = i + 4; j < n; j += 4) {
    const ds = Math.min(Math.abs(i - j) * step, T.L - Math.abs(i - j) * step);
    if (ds < 60) continue;
    minD = Math.min(minD, Math.hypot(T.xs[i] - T.xs[j], T.zs[i] - T.zs[j]));
  }
  let ext = 0;
  for (let i = 0; i < n; i++) ext = Math.max(ext, Math.abs(T.xs[i]), Math.abs(T.zs[i]));
  let crater = Infinity;
  for (const c of def.terrain.craters || []) for (let i = 0; i < n; i += 2) crater = Math.min(crater, Math.hypot(T.xs[i] - c.x, T.zs[i] - c.z) - c.r * 1.6);
  console.log(`${def.id}: lap ${T.L.toFixed(0)} m, ${T.features.length} features, closest other part ${minD.toFixed(1)} m, reaches ${ext.toFixed(0)} of ${def.worldSize / 2}`);
  ok(minD > def.defaultWidth + 12, `${def.id}: the lap never runs over itself`);
  ok(ext < def.worldSize / 2 - 40, `${def.id}: fits in the world with room round it`);
  if (def.terrain.craters) ok(crater > 8, `${def.id}: craters are clear of the track (${crater.toFixed(0)} m)`);
  // ramps (free-ride jumps, the stunt park) must sit off the track
  let rampGap = Infinity;
  for (const R of def.terrain.ramps || []) {
    const a0 = R.type === 'kicker' ? -R.len : R.type === 'quarter' ? -4 - R.r : -(R.top / 2 + R.s);
    const a1 = R.type === 'kicker' ? R.gap + (R.landLen || R.landH * 4) : R.type === 'quarter' ? R.r : R.top / 2 + R.s;
    const sn = Math.sin(R.dir || 0), cs = Math.cos(R.dir || 0);
    for (let a = a0; a <= a1; a += 2) for (const b of [-R.w / 2, 0, R.w / 2]) {
      const x = R.x + sn * a + cs * b, z = R.z + cs * a - sn * b;
      for (let i = 0; i < n; i += 3) rampGap = Math.min(rampGap, Math.hypot(T.xs[i] - x, T.zs[i] - z) - def.defaultWidth / 2);
    }
  }
  if (def.terrain.ramps && def.terrain.ramps.length) ok(rampGap > 4, `${def.id}: ${def.terrain.ramps.length} ramps are clear of the track (${rampGap.toFixed(0)} m)`);
}
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
