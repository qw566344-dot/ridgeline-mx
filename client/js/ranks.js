// =====================================================================
//  RANK BADGES: one drawn emblem per ranked tier (inline SVG, so it is
//  sharp at any size and needs no image files). Each is a layered metal
//  crest that gets grander up the ladder:
//    a glow behind (stronger each tier), wings with two rows of feathers
//    (Silver up), a riveted bevelled shield with an engraved, textured face,
//    a centre medallion with a spoked MX wheel, chevrons below it, a top
//    ornament (stud, star, gems, crystal, crown), laurels (Platinum up) and
//    a ribbon across the bottom (Gold up), plus sparkles at the top tiers.
//  Also the rank-up animation shown after a ranked race.
// =====================================================================
import { RANK_TIERS } from '/shared/shop.js';
import { RANK_IMG } from './rankImages.js';

// [light, mid, dark, deepest, accent gem] per tier
const COLORS = {
  Bronze: ['#ffd9b3', '#cd7f42', '#7d3f18', '#3a1b08', '#ffb074'],
  Silver: ['#ffffff', '#c9d2de', '#717e90', '#2f3540', '#9fd0ff'],
  Gold: ['#fff7c9', '#f2c23f', '#a66c0c', '#4a2e04', '#ff5a5a'],
  Platinum: ['#effffc', '#86e6d9', '#24857b', '#0b3934', '#c38cff'],
  Diamond: ['#f4f9ff', '#93c8ff', '#2e60d4', '#0f2462', '#ffffff'],
  Pro: ['#ffe6cc', '#ff7d3e', '#ad2419', '#430a06', '#ff2e4d'],
};
const LEVEL = { Bronze: 0, Silver: 1, Gold: 2, Platinum: 3, Diamond: 4, Pro: 5 };
let uid = 0;

const SHIELD = 'M50 12 L77 21 L77 47 C77 67 63.5 79 50 86 C36.5 79 23 67 23 47 L23 21 Z';
const INNER = 'M50 18.5 L71 25.5 L71 47 C71 62.5 60.5 72.5 50 78.5 C39.5 72.5 29 62.5 29 47 L29 25.5 Z';
const f1 = (n) => n.toFixed(1);
const starPath = (cx, cy, r, k = 0.45, pts = 5) => {
  let p = '';
  for (let i = 0; i < pts * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / pts, rr = i % 2 ? r * k : r; p += (i ? 'L' : 'M') + f1(cx + Math.cos(a) * rr) + ' ' + f1(cy + Math.sin(a) * rr); }
  return p + 'Z';
};
const sparkle = (cx, cy, r) => `<path d="${starPath(cx, cy, r, 0.18, 4)}" fill="#fff"/>`;

// the rank badge: the tier's emblem image
export function rankBadge(tier, size = 64) {
  const src = RANK_IMG[tier] || RANK_IMG.Bronze;
  return `<img class="rank-badge" src="${src}" width="${size}" height="${size}" alt="${tier}" draggable="false">`;
}

// (the older drawn crest, kept for reference)
export function rankCrestSvg(tier, size = 64) {
  const [hi, mid, lo, deep, gem] = COLORS[tier] || COLORS.Bronze;
  const L = LEVEL[tier] || 0;
  const id = 'rb' + (uid++);
  const metal = `url(#${id}m)`, face = `url(#${id}f)`, gemF = `url(#${id}g)`;
  const defs = `<defs>
    <linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset="0.35" stop-color="${mid}"/><stop offset="0.6" stop-color="${lo}"/><stop offset="0.8" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></linearGradient>
    <radialGradient id="${id}f" cx="0.4" cy="0.28" r="0.85"><stop offset="0" stop-color="${mid}"/><stop offset="0.55" stop-color="${lo}"/><stop offset="1" stop-color="${deep}"/></radialGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.65"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="${gem}"/><stop offset="1" stop-color="${deep}"/></linearGradient>
    <radialGradient id="${id}h"><stop offset="0" stop-color="${mid}" stop-opacity="0.75"/><stop offset="1" stop-color="${mid}" stop-opacity="0"/></radialGradient>
    <pattern id="${id}p" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="none"/><path d="M0 0 V5" stroke="#fff" stroke-width="1" opacity="0.07"/></pattern>
    <clipPath id="${id}c"><path d="${INNER}"/></clipPath>
  </defs>`;
  let out = '';
  // glow behind, stronger up the ladder
  if (L >= 1) out += `<circle cx="50" cy="50" r="${36 + L * 2.5}" fill="url(#${id}h)" opacity="${0.25 + L * 0.13}"/>`;
  // wings: a back row of long feathers and a front row of short ones, each feather with a quill line
  if (L >= 1) {
    const n = 2 + L, len = 18 + L * 4;
    let back = '', front = '';
    for (let i = 0; i < n; i++) {
      const ang = -42 + i * (84 / (n - 1)), l = len - Math.abs(i - (n - 1) / 2) * 2.6;
      back += `<g transform="translate(26 47) rotate(${f1(ang)})"><path d="M0 0 C${f1(-l * 0.3)} -6 ${f1(-l * 0.8)} -5.5 ${f1(-l)} 0 C${f1(-l * 0.8)} 4 ${f1(-l * 0.3)} 4.5 0 0Z" fill="${metal}" stroke="${deep}" stroke-width="1.2"/><path d="M-2 0 L${f1(-l + 3)} 0" stroke="${deep}" stroke-width="0.7" opacity="0.6"/></g>`;
      if (i % 2 === 0) front += `<g transform="translate(27 49) rotate(${f1(ang * 0.8 + 6)})"><path d="M0 0 C${f1(-l * 0.2)} -4 ${f1(-l * 0.5)} -4 ${f1(-l * 0.62)} 0 C${f1(-l * 0.5)} 3 ${f1(-l * 0.2)} 3 0 0Z" fill="${lo}" stroke="${deep}" stroke-width="1"/></g>`;
    }
    const wing = back + front;
    out += `<g>${wing}</g><g transform="translate(100 0) scale(-1 1)">${wing}</g>`;
  }
  // laurels round the bottom of the shield
  if (L >= 3) {
    let leaves = '';
    for (let i = 0; i < 6; i++) {
      const t = i / 5, ang = 200 - t * 70, r = 34, x = 50 + Math.cos((ang * Math.PI) / 180) * r, y = 52 - Math.sin((ang * Math.PI) / 180) * r * 1.05;
      leaves += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="5.2" ry="2.2" transform="rotate(${f1(-ang + 120)} ${f1(x)} ${f1(y)})" fill="${metal}" stroke="${deep}" stroke-width="0.9"/>`;
    }
    out += `<g>${leaves}</g><g transform="translate(100 0) scale(-1 1)">${leaves}</g>`;
  }
  if (tier === 'Diamond') {
    // a cut crystal in a metal frame
    out += `<polygon points="50,6 80,33 50,94 20,33" fill="${deep}" transform="translate(0 2.5)" opacity="0.5"/>
      <polygon points="50,6 80,33 50,94 20,33" fill="${metal}" stroke="${deep}" stroke-width="2" stroke-linejoin="round"/>
      <polygon points="50,13 73,33.5 50,84 27,33.5" fill="${gemF}" stroke="${hi}" stroke-width="1" stroke-linejoin="round"/>
      <polygon points="27,33.5 73,33.5 50,84" fill="${lo}" opacity="0.5"/>
      <polyline points="38,33.5 50,13 62,33.5 50,84 38,33.5" fill="none" stroke="#fff" stroke-width="1.2" opacity="0.8"/>
      <polyline points="27,33.5 50,45 73,33.5" fill="none" stroke="#fff" stroke-width="1" opacity="0.6"/>
      <polyline points="38,33.5 50,45 62,33.5" fill="none" stroke="#fff" stroke-width="0.8" opacity="0.5"/>
      <polygon points="50,13 73,33.5 50,40 27,33.5" fill="url(#${id}s)"/>
      ${sparkle(70, 16, 7)}${sparkle(28, 66, 5)}${sparkle(76, 54, 4)}`;
  } else {
    // the shield: drop shadow, metal rim, rivets, textured engraved face, bevel highlight
    out += `<path d="${SHIELD}" fill="${deep}" transform="translate(0 2.5)" opacity="0.55"/>
      <path d="${SHIELD}" fill="${metal}" stroke="${deep}" stroke-width="2" stroke-linejoin="round"/>
      <path d="${INNER}" fill="${face}" stroke="${deep}" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="${INNER}" fill="url(#${id}p)"/>
      <path d="M50 22 L67.5 28 L67.5 47 C67.5 60.5 58.5 69.5 50 74.5 C41.5 69.5 32.5 60.5 32.5 47 L32.5 28 Z" fill="none" stroke="${hi}" stroke-width="0.9" opacity="0.45" stroke-dasharray="2 1.6"/>`;
    for (const [x, y] of [[26, 24], [74, 24], [26, 45], [74, 45], [36, 74], [64, 74], [50, 15]]) out += `<circle cx="${x}" cy="${y}" r="1.7" fill="${hi}" stroke="${deep}" stroke-width="0.8"/>`;
    // centre medallion: a spoked MX wheel
    let spokes = '';
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; spokes += `<path d="M${f1(50 + Math.cos(a) * 3)} ${f1(42 + Math.sin(a) * 3)} L${f1(50 + Math.cos(a) * 8.5)} ${f1(42 + Math.sin(a) * 8.5)}" stroke="${deep}" stroke-width="1.1"/>`; }
    out += `<circle cx="50" cy="42" r="12.5" fill="${metal}" stroke="${deep}" stroke-width="1.5"/>
      <circle cx="50" cy="42" r="10" fill="${lo}" stroke="${deep}" stroke-width="2.6" stroke-dasharray="1.6 1.1"/>
      <circle cx="50" cy="42" r="8.5" fill="${face}"/>${spokes}
      <circle cx="50" cy="42" r="3" fill="${tier === 'Pro' || L >= 2 ? gemF : metal}" stroke="${deep}" stroke-width="1"/>`;
    // chevrons below: one per tier (up to three), cut in with a groove under a bright edge
    const nC = Math.min(3, L + 1);
    for (let i = 0; i < nC; i++) {
      const y = 70 - i * 6.5;
      out += `<polyline points="39,${f1(y + 1.2)} 50,${f1(y - 4.8)} 61,${f1(y + 1.2)}" fill="none" stroke="${deep}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
        <polyline points="39,${f1(y)} 50,${f1(y - 6)} 61,${f1(y)}" fill="none" stroke="${hi}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    out += `<g clip-path="url(#${id}c)"><path d="M29 25.5 L71 25.5 L71 38 C60 33 40 33 29 38 Z" fill="url(#${id}s)"/></g>`;
    out += `<path d="M50 12 L77 21 L77 26 L50 17 L23 26 L23 21 Z" fill="#fff" opacity="0.25"/>`;
    // side gems (Platinum up)
    if (L >= 3) for (const x of [26, 74]) out += `<polygon points="${x},31 ${x + 3},35 ${x},39 ${x - 3},35" fill="${gemF}" stroke="${deep}" stroke-width="0.9"/>`;
    // top ornament
    if (tier === 'Pro') {
      out += `<path d="M31 21 L33.5 5 L41.5 13 L50 1.5 L58.5 13 L66.5 5 L69 21 Z" fill="${metal}" stroke="${deep}" stroke-width="1.6" stroke-linejoin="round"/>
        <rect x="30" y="18.5" width="40" height="6" rx="2" fill="${metal}" stroke="${deep}" stroke-width="1.4"/>
        <circle cx="33.5" cy="5" r="2" fill="${gemF}" stroke="${deep}" stroke-width="0.7"/><circle cx="50" cy="2" r="2.4" fill="${gemF}" stroke="${deep}" stroke-width="0.7"/><circle cx="66.5" cy="5" r="2" fill="${gemF}" stroke="${deep}" stroke-width="0.7"/>
        <polygon points="50,15.5 53,21.5 50,27.5 47,21.5" fill="${gemF}" stroke="${deep}" stroke-width="0.9"/>
        ${sparkle(80, 14, 6)}${sparkle(20, 66, 4.5)}`;
    } else if (L >= 2) out += `<path d="${starPath(50, 11, 8.5)}" fill="${metal}" stroke="${deep}" stroke-width="1.3" stroke-linejoin="round"/><circle cx="50" cy="11.5" r="2.2" fill="${gemF}"/>`;
    else if (L === 1) out += `<polygon points="50,6 55,12 50,18 45,12" fill="${gemF}" stroke="${deep}" stroke-width="1.2"/>`;
    if (L >= 3) out += sparkle(78, 18, 5);
  }
  // ribbon across the bottom (Gold up)
  if (L >= 2) {
    out += `<path d="M20 78 L30 74 L30 86 L20 90 L24 84 Z" fill="${lo}" stroke="${deep}" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M80 78 L70 74 L70 86 L80 90 L76 84 Z" fill="${lo}" stroke="${deep}" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M28 74 Q50 82 72 74 L72 85 Q50 93 28 85 Z" fill="${metal}" stroke="${deep}" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M31 78.5 Q50 86 69 78.5" fill="none" stroke="${hi}" stroke-width="0.8" opacity="0.6"/>`;
    for (let i = 0; i < L - 1; i++) out += `<path d="${starPath(50 + (i - (L - 2) / 2) * 7, 82.5, 2.6)}" fill="${deep}"/>`;
  }
  return `<svg class="rank-badge" width="${size}" height="${size}" viewBox="0 0 100 100" aria-label="${tier}">${defs}${out}</svg>`;
}

// the tier after this one (and the rating it starts at), for the progress bar
export function nextTier(tier) {
  const i = RANK_TIERS.findIndex(([n]) => n === tier);
  return i >= 0 && i < RANK_TIERS.length - 1 ? RANK_TIERS[i + 1] : null;
}
export function tierStart(tier) { const t = RANK_TIERS.find(([n]) => n === tier); return t ? t[1] : 0; }

// full-screen rank up: the old badge, a flash, the new badge landing, and the rating counting up
export function rankUpAnimation(from, to, rating, delta) {
  const el = document.createElement('div');
  el.className = 'rankup';
  el.innerHTML = `<div class="ru-rays"></div><div class="ru-box">
      <div class="ru-label">PROMOTED</div>
      <div class="ru-badges"><div class="ru-old">${rankBadge(from, 110)}</div><div class="ru-new">${rankBadge(to, 190)}</div></div>
      <div class="ru-tier tier ${to}">${to.toUpperCase()}</div>
      <div class="ru-rating">Rating <b>${rating - delta}</b></div>
      <div class="ru-hint">click to continue</div></div>`;
  document.getElementById('ui').appendChild(el);
  const num = el.querySelector('.ru-rating b');
  const t0 = performance.now() + 1300;
  const tick = (now) => {
    const k = Math.min(1, Math.max(0, (now - t0) / 900));
    num.textContent = Math.round(rating - delta + delta * (1 - (1 - k) ** 3));
    if (k < 1 && el.isConnected) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 400); };
  el.onclick = close;
  setTimeout(() => el.isConnected && close(), 6500);
}
