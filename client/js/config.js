// =====================================================================
//  SERVER ADDRESS - where accounts and multiplayer live.
//
//  PUBLIC_SERVER: after you put the server online (see README.md,
//  "Play with friends anywhere"), paste its address here, for example
//      export const PUBLIC_SERVER = 'https://ridgeline-mx.onrender.com';
//  then rebuild RidgelineMX.html. Everyone using that file connects
//  there automatically and only needs the party code.
// =====================================================================
export const PUBLIC_SERVER = 'https://ridgeline-mx.onrender.com';

function stored() { try { return localStorage.getItem('mx.server') || ''; } catch { return ''; } }

// http(s) base address of the game server
export function serverBase() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q.replace(/\/ws$/, '').replace(/^ws/, 'http').replace(/\/$/, '');
  const s = stored();
  if (s) return s.replace(/\/$/, '');
  if (PUBLIC_SERVER) return PUBLIC_SERVER.replace(/\/$/, '');
  if (location.protocol === 'file:' || !location.host) return 'http://localhost:5323';
  return location.origin; // the page came from the game server itself
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

export function wsUrl() { return serverBase().replace(/^http/, 'ws') + '/ws'; }
