// JUMP CHECKER - fires the real bike and quad physics at every jump on
// every track across a range of speeds and reports, per jump:
//   - the speed window that lands on the landing ramp ("sweet spot")
//   - how fast you can actually be going at the lip after the run-up
//   - problems: no sweet spot, not reachable, crashes, jump hanging off a straight
//   node tools/check-jumps.js            all tracks
//   node tools/check-jumps.js quarry     one track
import { TRACKS } from '../shared/tracks.js';
import { makeWorld } from '../shared/terrain.js';
import { Vehicle, FIXED_DT } from '../client/js/sim/vehicle.js';
import { speedProfile } from '../client/js/sim/ai.js';
import { pointAt, sampleArr, deltaS } from '../shared/trackgen.js';

const only = process.argv[2];
const mph = (v) => (v * 2.237).toFixed(0);
let problems = 0;

function zones(f) {
  const k = f.knots;
  const end = k[k.length - 1].x;
  if (f.type === 'table') return { sweet0: k[3].x - 0.5, sweet1: end, lip: k[2].x };
  if (f.type === 'step') return { sweet0: k[5].x, sweet1: k[6].x + 2, lip: k[2].x };
  return { sweet0: k[k.length - 2].x - 0.5, sweet1: end, lip: k[2].x }; // double / triple
}

function shoot(W, f, vid, v0) {
  const T = W.T;
  const v = new Vehicle(vid, W);
  const sStart = f.s0 - 30;
  const p = pointAt(T, sStart, 0);
  v.placeAt(p.x, p.z, p.tx, p.tz);
  v.vel.set(p.tx * v0, 0, p.tz * v0);
  for (const w of v.wheels) w.spinVel = v0 / w.cfg.r;
  let took = null, landS = null, crashed = false, maxAir = 0, lipV = null;
  for (let i = 0; i < 120 * 8; i++) {
    // hold speed to the lip, then neutral; keep straight
    const q = pointAt(T, v.trackS + 10, 0);
    const dx = q.x - v.pos.x, dz = q.z - v.pos.z;
    v.input.steer = Math.max(-1, Math.min(1, Math.atan2(dx * v.left.x + dz * v.left.z, dx * v.fwd.x + dz * v.fwd.z) * 2.5));
    if (!v.grounded) v.input.steer = 0;
    const into = deltaS(T, f.s0, v.trackS);
    const before = into < zones(f).lip;
    v.input.throttle = before ? (v.speed < v0 - 0.3 ? 1 : 0) : 0.2;
    v.input.brake = before && v.speed > v0 + 0.4 ? 0.6 : 0;
    v.step(FIXED_DT);
    if (v.crashed) { crashed = true; break; }
    if (!v.grounded && v.airTime > 0.2 && took === null && deltaS(T, f.s0, v.trackS) > 0) { took = v.trackS; lipV = v.speed; }
    maxAir = Math.max(maxAir, v.airTime);
    if (took !== null && v.grounded && v.groundTime > 0.05 && landS === null) { landS = deltaS(T, f.s0, v.trackS); }
    if (landS !== null && v.groundTime > 0.6) break;
  }
  return { landX: landS, crashed, air: maxAir, reason: v.crashReason, lipV };
}

for (const def of TRACKS) {
  if (only && def.id !== only) continue;
  const W = makeWorld(def);
  const T = W.T;
  console.log(`\n=== ${def.name} ===`);
  // features piled on top of each other make lumpy, unrideable landings
  for (const a of T.features) for (const b of T.features) {
    if (a === b || a.s0 > b.s0 || (a.lane && b.lane && a.lane !== b.lane)) continue;
    const gap = b.s0 - a.s1;
    if (gap < 3 && b.s0 - a.s0 < T.L / 2) { console.log(`OVERLAP: ${a.type}@${a.segName} ends ${gap.toFixed(1)} m from the ${b.type} after it`); problems++; }
  }
  for (const f of T.features) {
    if (f.type === 'whoops' || f.type === 'rollers') continue;
    const z = zones(f);
    const seg = T.parts.find((p) => p.kind === 'straight' && f.s0 >= p.s0 - 0.01 && f.s0 < p.s1);
    const runup = f.s0 - seg.s0;
    const after = seg.s1 - f.s1;
    const line = [`${f.type.padEnd(6)} ${String(f.lane || '').padEnd(1)} @${f.segName.padEnd(16)}`];
    if (after < 4) { line.push(`LANDING RUNS INTO THE TURN (${after.toFixed(1)} m left)`); problems++; }
    for (const vid of ['mx450', 'atv450']) {
      const res = [];
      for (let v0 = 8; v0 <= 30; v0 += 1) res.push({ v0, ...shoot(W, f, vid, v0) });
      const good = res.filter((r) => !r.crashed && r.landX !== null && r.landX >= z.sweet0 && r.landX <= z.sweet1);
      const ok = res.filter((r) => !r.crashed);
      // speed you can carry: what the AI plans at the straight start, then full throttle over the run-up
      const prof = speedProfile(T, { ...new Vehicle(vid, W).cfg });
      const vEntry = Math.min(sampleArr(T, prof.v, seg.s0), 25);
      const vReach = Math.sqrt(vEntry * vEntry + 2 * (vid === 'mx450' ? 5 : 4) * Math.max(0, runup - 4));
      const sp = good.map((r) => r.lipV || r.v0);
      const lo = good.length ? Math.min(...sp) : null, hi = good.length ? Math.max(...sp) : null;
      let tag = '';
      if (!good.length) { tag = ' <-- NO CLEAN LANDING'; problems++; }
      else if (lo > vReach) { tag = ` <-- needs ${mph(lo)} mph, run-up only gives ~${mph(vReach)}`; problems++; }
      line.push(`${vid}: sweet ${lo ? mph(lo) + '-' + mph(hi) : '--'} mph, reach ~${mph(vReach)}, crash at ${res.filter((r) => r.crashed).map((r) => mph(r.v0)).join(',') || 'none'}${tag}`);
    }
    console.log(line.join(' | '));
  }
}
console.log(`\n${problems} problem(s)`);
process.exitCode = problems ? 1 : 0;
