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
  ok(minD > 2 * def.defaultWidth + 6, `${def.id}: the lap never runs over itself`);
  ok(ext < def.worldSize / 2 - 40, `${def.id}: fits in the world with room round it`);
  if (def.terrain.craters) ok(crater > 8, `${def.id}: craters are clear of the track (${crater.toFixed(0)} m)`);
}
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
