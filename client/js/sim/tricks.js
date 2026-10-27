// =====================================================================
//  TRICKS - what you did in the air, and how many points it is worth.
//  Each jump collects: flips (pitch), spins (yaw), whips / scrubs (roll).
//  The landing grade multiplies the score:
//    Perfect  (wheels within 7 degrees of the slope)  x1.5
//    Clean    (within 16 degrees)                     x1.2
//    Sketchy  (anything you rode away from)           x0.8
//  Combos across jumps are counted by the game (game.js).
// =====================================================================
const DEG = Math.PI / 180;

export const TRICK_POINTS = {
  backflip: 500, frontflip: 600, multiFlipBonus: 1.3,
  spin: 400, whip: 150, whipPerDeg: 6, hugeWhip: 300, scrub: 250, bigAir: 100,
};

export function newTrick(v) {
  return { pitch: 0, yaw: 0, whip: 0, scrub: false, peak: 0, y0: v.pos.y, t0: v.time };
}

// what is happening right now, for the HUD while you are in the air
export function liveTrick(tr) {
  if (!tr) return '';
  const out = [];
  const deg = Math.abs(tr.pitch) / DEG;
  if (deg > 120) out.push(`${tr.pitch < 0 ? 'BACKFLIP' : 'FRONT FLIP'} ${Math.round(deg)}°`);
  const yaw = Math.abs(tr.yaw) / DEG;
  if (yaw > 120) out.push(`SPIN ${Math.round(yaw)}°`);
  if (tr.whip > 25 * DEG) out.push(tr.scrub ? 'SCRUB' : `WHIP ${Math.round(tr.whip / DEG)}°`);
  return out.join('  ');
}

export function scoreTricks(tr, landPitchErr, landRollErr, canWhip) {
  if (!tr) return null;
  const P = TRICK_POINTS;
  const parts = [];
  const flips = Math.round(Math.abs(tr.pitch) / (2 * Math.PI) - 0.1);
  if (flips >= 1) {
    const back = tr.pitch < 0;
    const name = (flips === 2 ? 'Double ' : flips === 3 ? 'Triple ' : flips > 3 ? flips + 'x ' : '') + (back ? 'Backflip' : 'Front Flip');
    parts.push({ name, points: Math.round((back ? P.backflip : P.frontflip) * flips * (flips > 1 ? P.multiFlipBonus : 1)) });
  }
  const spins = Math.round(Math.abs(tr.yaw) / (2 * Math.PI) - 0.15);
  if (spins >= 1) parts.push({ name: spins * 360 + '', points: P.spin * spins * (spins > 1 ? 1.25 : 1) });
  if (canWhip && tr.whip > 32 * DEG) {
    if (tr.scrub) parts.push({ name: 'Scrub', points: P.scrub });
    else if (tr.whip > 55 * DEG) parts.push({ name: 'Huge Whip', points: P.hugeWhip + Math.round((tr.whip / DEG - 32) * P.whipPerDeg) });
    else parts.push({ name: 'Whip', points: P.whip + Math.round((tr.whip / DEG - 32) * P.whipPerDeg) });
  }
  if (!parts.length) return null;
  const worst = Math.max(landPitchErr, landRollErr);
  const landing = worst < 7 ? 'Perfect' : worst < 16 ? 'Clean' : 'Sketchy';
  const mult = landing === 'Perfect' ? 1.5 : landing === 'Clean' ? 1.2 : 0.8;
  const base = parts.reduce((a, p) => a + p.points, 0);
  return { type: 'trick', name: parts.map((p) => p.name).join(' + '), parts, landing, score: Math.round(base * mult) };
}
