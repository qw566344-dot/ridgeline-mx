// =====================================================================
//  SERVERS - where accounts, friends and multiplayer live.
//
//  PUBLIC_SERVER is the "home" server: accounts, coins and friends are
//  kept there. It is also the first multiplayer region.
//
//  REGIONS: every server players can host parties on. The game pings
//  each one and puts you on the closest (or the one picked in
//  Settings > Online). To add a region, deploy another copy of the
//  server in that part of the world (README.md, "Regional servers"),
//  add a line here, and rebuild RidgelineMX.html.
// =====================================================================
export const PUBLIC_SERVER = 'https://ridgeline-mx.onrender.com';

export const REGIONS = [
  { id: 'na', name: 'North America', place: 'Oregon, USA', url: 'https://ridgeline-mx.onrender.com' },
  { id: 'eu', name: 'Europe', place: 'Frankfurt, Germany', url: 'https://ridgeline-mx-eu.onrender.com' },
  { id: 'asia', name: 'Asia', place: 'Singapore', url: 'https://ridgeline-mx-asia.onrender.com' },
];

function stored() { try { return localStorage.getItem('mx.server') || ''; } catch { return ''; } }
const clean = (u) => u.replace(/\/ws$/, '').replace(/^ws/, 'http').replace(/\/$/, '');

// a server typed in by hand (or ?server=...) replaces the region list
export function customServer() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return clean(q);
  const s = stored();
  return s ? clean(s) : '';
}

// http(s) address of the home server (accounts + friends)
export function serverBase() {
  const c = customServer();
  if (c) return c;
  // the page came from a game server (Play.bat on this computer / on the Wi-Fi): use it
  if (/^https?:$/.test(location.protocol) && location.host && !location.host.endsWith('onrender.com') && /^(localhost|127\.|192\.168\.|10\.|172\.)/.test(location.hostname)) return location.origin;
  if (PUBLIC_SERVER) return PUBLIC_SERVER.replace(/\/$/, '');
  if (location.protocol === 'file:' || !location.host) return 'http://localhost:5323';
  return location.origin;
}

// the regions this copy of the game can use
export function regionList() {
  const home = serverBase();
  if (home !== PUBLIC_SERVER.replace(/\/$/, '')) return [{ id: 'local', name: home.replace(/^https?:\/\//, ''), place: 'Custom server', url: home }];
  return REGIONS;
}

export function setServerBase(url) {
  try {
    if (!url) localStorage.removeItem('mx.server');
    else {
      let u = url.trim();
      if (!/^https?:\/\//.test(u)) u = (/^(localhost|\d+\.\d+\.\d+\.\d+)(:\d+)?$/.test(u) ? 'http://' : 'https://') + u;
      localStorage.setItem('mx.server', u.replace(/\/$/, ''));
    }
  } catch { /* ignore */ }
}

export function wsUrlFor(base) { return base.replace(/^http/, 'ws') + '/ws'; }
export function wsUrl() { return wsUrlFor(serverBase()); }

// round-trip time to a server in ms (best of a few tries); null if unreachable
export async function measurePing(base, tries = 3, timeout = 9000) {
  let best = null;
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    const t0 = performance.now();
    try {
      const r = await fetch(base + '/health?t=' + Date.now(), { signal: ctl.signal, cache: 'no-store' });
      await r.json();
      const ms = Math.round(performance.now() - t0);
      best = best == null ? ms : Math.min(best, ms);
    } catch { if (best == null && i === 0) { clearTimeout(timer); return null; } }
    clearTimeout(timer);
  }
  return best;
}
