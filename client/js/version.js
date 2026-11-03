// =====================================================================
//  NEW VERSION: the page remembers which build it loaded (/api/version)
//  and checks again every minute and whenever you come back to the tab.
//  When the server has a newer build, a banner offers a refresh. Only for
//  the hosted game (the single-file copy has nothing to refresh to).
// =====================================================================
let loaded = null, shown = false;

async function check() {
  if (shown || !location.protocol.startsWith('http')) return;
  let b = null;
  try { b = (await (await fetch('/api/version', { cache: 'no-store' })).json()).build; } catch { return; }
  if (!b) return;
  if (!loaded) { loaded = b; return; }
  if (b !== loaded) show();
}

function show() {
  shown = true;
  const el = document.createElement('div');
  el.className = 'newver';
  el.innerHTML = '<span class="nv-tag">NEW VERSION</span><span class="nv-text">Ridgeline MX has been updated</span><button class="nv-btn">Refresh</button><button class="nv-x" title="Later">&times;</button>';
  el.querySelector('.nv-btn').onclick = () => location.reload();
  el.querySelector('.nv-x').onclick = () => el.remove();
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
}

export function watchVersion() {
  check();
  setInterval(check, 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}
