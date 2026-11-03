// =====================================================================
//  RANK BADGES: one drawn emblem per ranked tier (inline SVG, so it is
//  sharp at any size and needs no image files). Each is a bevelled metal
//  shield that gets grander up the ladder: Bronze one chevron, Silver two
//  and small wings, Gold three, bigger wings and a star, Platinum a gem and
//  full wings, Diamond a cut crystal with wings, Pro a crowned crest with a
//  ruby. Also the rank-up animation shown after a ranked race.
// =====================================================================
import { RANK_TIERS } from '/shared/shop.js';

// [light, mid, dark, deepest] per tier
const COLORS = {
  Bronze: ['#ffd1a6', '#c97a3f', '#7a3d17', '#3d1d09'],
  Silver: ['#ffffff', '#c3ccd8', '#6f7b8c', '#343b46'],
  Gold: ['#fff6c2', '#f0c03e', '#a26a0c', '#4f3105'],
  Platinum: ['#eafffb', '#7fe3d6', '#258077', '#0d3b37'],
  Diamond: ['#f2f8ff', '#8cc3ff', '#2f5fd0', '#132a6b'],
  Pro: ['#ffe2c4', '#ff7a3d', '#a8231a', '#4a0c08'],
};
let uid = 0;

const SHIELD = 'M50 9 L79 19 L79 47 C79 69 64 82 50 90 C36 82 21 69 21 47 L21 19 Z';
const INNER = 'M50 16 L72 23.5 L72 47 C72 64 61 74.5 50 81 C39 74.5 28 64 28 47 L28 23.5 Z';
const star = (cx, cy, r, fill, stroke) => {
  let p = '';
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; p += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1); }
  return `<path d="${p}Z" fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"/>`;
};
// a fan of feathers off the left side of the shield, mirrored to the right
const wings = (n, len, metal, dark) => {
  let f = '';
  for (let i = 0; i < n; i++) {
    const ang = -38 + i * (76 / Math.max(1, n - 1)), L = len - Math.abs(i - (n - 1) / 2) * 3;
    f += `<ellipse cx="${(-L / 2).toFixed(1)}" cy="0" rx="${(L / 2).toFixed(1)}" ry="4.2" transform="translate(25 46) rotate(${ang.toFixed(1)})" fill="${metal}" stroke="${dark}" stroke-width="1.3"/>`;
  }
  return `<g>${f}</g><g transform="translate(100 0) scale(-1 1)">${f}</g>`;
};
// a chevron cut into the face: dark groove under a bright edge
const chevron = (y, lo, hi) => `<polyline points="36,${y + 1.6} 50,${y - 7.4} 64,${y + 1.6}" fill="none" stroke="${lo}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>
  <polyline points="36,${y} 50,${y - 9} 64,${y}" fill="none" stroke="${hi}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>`;

export function rankBadge(tier, size = 64) {
  const [hi, mid, lo, deep] = COLORS[tier] || COLORS.Bronze;
  const id = 'rb' + (uid++);
  const metal = `url(#${id}m)`, face = `url(#${id}f)`;
  const defs = `<defs>
    <linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset="0.45" stop-color="${mid}"/><stop offset="0.75" stop-color="${lo}"/><stop offset="1" stop-color="${mid}"/></linearGradient>
    <radialGradient id="${id}f" cx="0.42" cy="0.3" r="0.8"><stop offset="0" stop-color="${mid}"/><stop offset="0.6" stop-color="${lo}"/><stop offset="1" stop-color="${deep}"/></radialGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="${tier === 'Pro' ? '#ff4a4a' : mid}"/><stop offset="1" stop-color="${tier === 'Pro' ? '#7a0a12' : lo}"/></linearGradient>
  </defs>`;
  const shine = `<path d="M50 16 L72 23.5 L72 36 C62 31 38 31 28 36 L28 23.5 Z" fill="url(#${id}s)"/>`;
  const shield = (inner) => `<path d="${SHIELD}" fill="${deep}" transform="translate(0 2.5)" opacity="0.5"/>
    <path d="${SHIELD}" fill="${metal}" stroke="${deep}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="${INNER}" fill="${face}" stroke="${hi}" stroke-width="1.2" stroke-opacity="0.7" stroke-linejoin="round"/>${inner}${shine}`;
  let body;
  if (tier === 'Diamond') {
    // a cut crystal on wings, with a sparkle
    body = wings(5, 30, metal, deep) + `<polygon points="50,8 78,32 50,92 22,32" fill="${deep}" transform="translate(0 2.5)" opacity="0.5"/>
      <polygon points="50,8 78,32 50,92 22,32" fill="url(#${id}g)" stroke="${deep}" stroke-width="2.2" stroke-linejoin="round"/>
      <polygon points="22,32 78,32 50,92" fill="${lo}" opacity="0.45"/>
      <polyline points="36,32 50,8 64,32 50,92 36,32" fill="none" stroke="${hi}" stroke-width="1.6" opacity="0.85"/>
      <polyline points="22,32 50,44 78,32" fill="none" stroke="${hi}" stroke-width="1.2" opacity="0.6"/>
      <polygon points="50,8 78,32 50,38 22,32" fill="url(#${id}s)"/>
      ${star(70, 18, 6, '#ffffff', 'none')}`;
  } else if (tier === 'Pro') {
    // a crowned crest with a ruby, on big wings
    body = wings(6, 34, metal, deep) + shield(`<polygon points="50,40 60,52 50,66 40,52" fill="url(#${id}g)" stroke="${deep}" stroke-width="1.6" stroke-linejoin="round"/>
      <polygon points="50,40 60,52 50,52 40,52" fill="#fff" opacity="0.35"/>`) + `
      <path d="M30 22 L33 6 L41 15 L50 2 L59 15 L67 6 L70 22 Z" fill="${metal}" stroke="${deep}" stroke-width="1.8" stroke-linejoin="round"/>
      <rect x="29" y="20" width="42" height="6" rx="2" fill="${metal}" stroke="${deep}" stroke-width="1.6"/>
      <circle cx="50" cy="23" r="2.2" fill="#ff4a4a"/><circle cx="40" cy="23" r="1.6" fill="#fff"/><circle cx="60" cy="23" r="1.6" fill="#fff"/>`;
  } else {
    const n = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 }[tier] || 1;
    let inner = '';
    for (let i = 0; i < Math.min(n, 3); i++) inner += chevron(70 - i * 11 - (3 - Math.min(n, 3)) * 5, deep, hi);
    if (n === 4) inner = chevron(72, deep, hi) + chevron(62, deep, hi) + `<polygon points="50,28 60,40 50,52 40,40" fill="url(#${id}g)" stroke="${deep}" stroke-width="1.6" stroke-linejoin="round"/><polygon points="50,28 60,40 40,40" fill="#fff" opacity="0.35"/>`;
    body = (n >= 2 ? wings(n + 1, 18 + n * 4, metal, deep) : '') + shield(inner) + (n >= 3 ? star(50, 9, 7.5, metal, deep) : '');
  }
  return `<svg class="rank-badge" width="${size}" height="${size}" viewBox="0 0 100 100" aria-label="${tier}">${defs}${body}</svg>`;
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
