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

// NEW ADDRESS: the game moved from ridgeline-mx.onrender.com to www.ridgeline-mx.com.
//  - on the old address: a banner with a "Go" button (nobody is forced; the old link keeps working)
//  - on the new address, right after Go: one reminder to bookmark it (a page can't add a bookmark by itself,
//    so it tells them the shortcut)
const NEW_HOME = 'https://www.ridgeline-mx.com/';
export function watchMoved() {
  const banner = (tag, text, btn, onBtn) => {
    const el = document.createElement('div');
    el.className = 'newver';
    el.innerHTML = '<span class="nv-tag">' + tag + '</span><span class="nv-text">' + text + '</span>' + (btn ? '<button class="nv-btn">' + btn + '</button>' : '') + '<button class="nv-x" title="Close">&times;</button>';
    if (btn) el.querySelector('.nv-btn').onclick = onBtn;
    el.querySelector('.nv-x').onclick = () => el.remove();
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
  };
  if (location.hostname === 'ridgeline-mx.onrender.com') {
    banner('NEW LINK', 'Ridgeline MX has a new home: ridgeline-mx.com', 'Go', () => { location.href = NEW_HOME + '?moved=1'; });
  } else if (location.hostname.endsWith('ridgeline-mx.com') && /[?&]moved=1/.test(location.search)) {
    history.replaceState(null, '', location.pathname);
    let seen = false; try { seen = !!localStorage.getItem('mx.movedAsked'); localStorage.setItem('mx.movedAsked', '1'); } catch { /* private mode */ }
    if (seen) return;
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    banner('BOOKMARK', 'Save the new link: press ' + (mac ? '⌘ + D' : 'Ctrl + D'), '', null);
  }
}
