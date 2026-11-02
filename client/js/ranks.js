// =====================================================================
//  RANK BADGES: one drawn emblem per ranked tier (inline SVG, so it is
//  sharp at any size and needs no image files). Bronze to Platinum are
//  shields with one to four chevrons, Diamond is a cut gem, Pro a crest
//  with a crown. Also the rank-up animation shown after a ranked race.
// =====================================================================
import { RANK_TIERS } from '/shared/shop.js';

const COLORS = {
  Bronze: ['#f0b27a', '#a0582a', '#5c2f12'],
  Silver: ['#f4f7fb', '#a9b4c2', '#5b6675'],
  Gold: ['#fff0a8', '#e2b23a', '#8a5a0c'],
  Platinum: ['#d6fff8', '#5fd3c4', '#1c6f68'],
  Diamond: ['#e3f1ff', '#6fb0ff', '#2a4fb8'],
  Pro: ['#ffd2a8', '#ff6f3c', '#8a1f12'],
};
let uid = 0;

export function rankBadge(tier, size = 64) {
  const [hi, mid, lo] = COLORS[tier] || COLORS.Bronze;
  const id = 'rb' + (uid++);
  const grad = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset="0.55" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></linearGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`;
  let body;
  if (tier === 'Diamond') {
    body = `<polygon points="32,4 56,22 32,60 8,22" fill="url(#${id})" stroke="${lo}" stroke-width="2.5" stroke-linejoin="round"/>
      <polygon points="8,22 56,22 32,60" fill="${lo}" opacity="0.35"/><polyline points="20,22 32,4 44,22 32,60 20,22" fill="none" stroke="${hi}" stroke-width="1.6" opacity="0.8"/>
      <polygon points="32,4 56,22 32,30 8,22" fill="url(#${id}s)"/>`;
  } else if (tier === 'Pro') {
    body = `<path d="M32 8 L54 16 L54 34 C54 47 44 55 32 60 C20 55 10 47 10 34 L10 16 Z" fill="url(#${id})" stroke="${lo}" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M20 40 L22 26 L28 33 L32 22 L36 33 L42 26 L44 40 Z" fill="#fff6e8" stroke="${lo}" stroke-width="1.6" stroke-linejoin="round"/>
      <rect x="20" y="41" width="24" height="5" rx="1.5" fill="#fff6e8" stroke="${lo}" stroke-width="1.4"/>
      <path d="M32 8 L54 16 L54 26 C44 22 20 22 10 26 L10 16 Z" fill="url(#${id}s)"/>`;
  } else {
    const n = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 }[tier] || 1;
    let chev = '';
    for (let i = 0; i < n; i++) { const y = 46 - i * 8 - (4 - n) * 2; chev += `<polyline points="21,${y} 32,${y - 7} 43,${y}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>`; }
    body = `<path d="M32 4 L54 12 L54 32 C54 46 44 55 32 60 C20 55 10 46 10 32 L10 12 Z" fill="url(#${id})" stroke="${lo}" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M32 9 L49 15.5 L49 32 C49 43 41 50 32 54.5 C23 50 15 43 15 32 L15 15.5 Z" fill="none" stroke="${hi}" stroke-width="1.4" opacity="0.7"/>
      ${chev}<path d="M32 4 L54 12 L54 24 C44 20 20 20 10 24 L10 12 Z" fill="url(#${id}s)"/>`;
  }
  return `<svg class="rank-badge" width="${size}" height="${size}" viewBox="0 0 64 64" aria-label="${tier}">${grad}${body}</svg>`;
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
