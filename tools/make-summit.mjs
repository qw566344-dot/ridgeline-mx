// Builds the ramp list for the open snowmobile map "Summit Snowfield" (shared/tracksVenues.js): scans the mountain for
// gentle downhill spots away from the trail and prints kickers (a freeride jump line) to paste into the map.
//   node tools/make-summit.mjs
import { buildTrack, pointAt } from '../shared/trackgen.js';
import { makeBaseFn } from '../shared/terrain.js';
import { VENUE_TRACKS } from '../shared/tracksVenues.js';

const def = VENUE_TRACKS.find((t) => t.id === 'snowfield');
const T = buildTrack(def), base = makeBaseFn({ ...def, terrain: { ...def.terrain, ramps: [] } });
const pts = []; for (let s = 0; s < T.L; s += 6) { const p = pointAt(T, s, 0); pts.push([p.x, p.z]); }
const trailDist = (x, z) => { let m = 1e9; for (const [px, pz] of pts) m = Math.min(m, Math.hypot(px - x, pz - z)); return m; };
let seed = 4242; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const cands = [];
for (let x = -340; x <= 340; x += 12) for (let z = -340; z <= 340; z += 12) {
  const e = 4, gx = (base(x + e, z) - base(x - e, z)) / (2 * e), gz = (base(x, z + e) - base(x, z - e)) / (2 * e);
  const sl = Math.hypot(gx, gz);
  if (sl < 0.09 || sl > 0.2) continue;
  const dir = Math.atan2(-gx, -gz);                 // facing downhill (dir 0 = +z)
  // the run-up (behind) and the landing (ahead) must both be rideable: no cliff within the line
  const sn = Math.sin(dir), cs = Math.cos(dir); let ok = true;
  for (let a = -30; a <= 45; a += 5) { const hh = base(x + sn * a, z + cs * a), h0 = base(x, z) - a * sl; if (Math.abs(hh - h0) > 2.6) { ok = false; break; } }
  for (let b = -6; b <= 6; b += 3) if (Math.abs(base(x + cs * b, z - sn * b) - base(x, z)) > 1.4) ok = false;
  if (!ok || trailDist(x, z) < 40) continue;
  cands.push({ x, z, dir, sl });
}
for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
const picked = [];
for (const c of cands) { if (picked.length >= 18) break; if (picked.every((p) => Math.hypot(p.x - c.x, p.z - c.z) > 110)) picked.push(c); }
console.error(cands.length + ' candidates, ' + picked.length + ' picked, trail length ' + T.L.toFixed(0));
const r1 = (n) => Math.round(n * 100) / 100;
console.log(picked.map((c) => `        { type: 'kicker', x: ${Math.round(c.x)}, z: ${Math.round(c.z)}, dir: ${r1(c.dir)}, w: 7, len: 11, h: ${r1(2.6 + rnd() * 1.6)}, gap: ${9 + Math.floor(rnd() * 6)}, landH: 2.8, landLen: 14 },`).join('\n'));
