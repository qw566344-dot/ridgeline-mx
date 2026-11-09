// Mini dev panel: press = to open it. Devs (and admins) can search riders and mute / unmute them.
// Nothing else - the server only lets devs use mute and the rider search.
const $ = (id) => document.getElementById(id);
// how long "Mute" mutes for (minutes); the server allows up to a week
const DURATIONS = [[5, '5 min'], [10, '10 min'], [30, '30 min'], [60, '1 hour'], [360, '6 hours'], [1440, '1 day'], [4320, '3 days'], [10080, '1 week']];
const left = (until) => { const m = Math.max(1, Math.ceil((until - Date.now()) / 60000)); return m >= 1440 ? Math.round(m / 1440) + ' d' : m >= 60 ? Math.round(m / 60) + ' h' : m + ' min'; };
export class DevPanel {
  constructor(account) {
    this.A = account;
    const st = document.createElement('style');
    st.textContent = '#devpanel{position:fixed;right:12px;bottom:12px;width:260px;z-index:60;background:rgba(14,17,24,.94);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px;font-size:13px;color:#fff}'
      + '#devpanel[hidden]{display:none}#devpanel h4{margin:0 0 8px}#devpanel input{width:100%;box-sizing:border-box;margin-bottom:6px}'
      + '#devpanel ul{list-style:none;margin:6px 0 0;padding:0;max-height:180px;overflow:auto}#devpanel li{display:flex;justify-content:space-between;align-items:center;padding:3px 0;gap:6px}'
      + '#devpanel select{width:100%;box-sizing:border-box;margin-bottom:6px}#devpanel li button{padding:2px 8px;font-size:12px}#devpanel li small{opacity:.7;margin-left:4px}#devpanel .dp-msg{min-height:16px;color:#9aa1ad}#devpanel .on{color:#3ddc84}';
    document.head.appendChild(st);
    const el = document.createElement('div');
    el.id = 'devpanel'; el.hidden = true;
    el.innerHTML = '<h4>DEV - mute riders <small style="float:right;opacity:.6">= closes</small></h4><input id="dp-q" placeholder="Search rider name" autocomplete="off"><select id="dp-time" title="How long the Mute button mutes for">' + DURATIONS.map(([m, t]) => `<option value="${m}"${m === 60 ? ' selected' : ''}>Mute for ${t}</option>`).join('') + '<option value="custom">Mute for... (type minutes)</option></select><div id="dp-msg" class="dp-msg"></div><ul id="dp-list"></ul>';
    document.body.appendChild(el);
    this.el = el;
    let t = null;
    $('dp-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => this.search(), 250); });
    $('dp-q').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.open(false); });
    $('dp-list').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) if (b.dataset.m === '1') this.mute(b.dataset.n, 0); else { const m = this.minutes(); if (m) this.mute(b.dataset.n, m); } }); // (a cancelled custom box must not count as 0 = unmute)
    window.addEventListener('keydown', (e) => {
      if (e.key !== '=' || e.ctrlKey || e.metaKey || e.altKey) return;
      const a = document.activeElement;
      if (a && a !== document.body && a.id !== 'dp-q' && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; // typing somewhere else
      if (!this.allowed()) return;
      e.preventDefault(); this.open(this.el.hidden);
    });
  }
  allowed() { const P = this.A.profile; return this.A.mode === 'online' && !!P && (P.dev || P.admin); }
  open(on) { this.el.hidden = !on; if (on) { $('dp-q').focus(); this.search(); } else if (document.activeElement) document.activeElement.blur(); }
  // the minutes picked in the box (or typed, for "custom")
  minutes() {
    const v = $('dp-time').value;
    if (v !== 'custom') return Number(v);
    return Math.round(Number(prompt('Mute for how many minutes? (up to 10080 = 1 week)', '10'))) || 0;
  }
  msg(t) { $('dp-msg').textContent = t || ''; }
  async search() {
    const r = await this.A.api('admin/users?q=' + encodeURIComponent($('dp-q').value.trim())).catch(() => ({ error: 'Could not reach the server' }));
    if (r.error) return this.msg(r.error);
    this.msg('');
    $('dp-list').innerHTML = (r.users || []).slice(0, 30).map((u) => `<li><span class="${u.online ? 'on' : ''}">${u.name.replace(/[<>&]/g, '')}${u.muted ? ` <small>muted ${left(u.mutedUntil)} left</small>` : ''}</span>${u.admin ? '' : `<button data-n="${u.name.replace(/[<>&"]/g, '')}" data-m="${u.muted ? 1 : 0}">${u.muted ? 'Unmute' : 'Mute'}</button>`}</li>`).join('') || '<li>No riders found</li>';
  }
  async mute(name, minutes) {
    if (!name) return;
    const r = await this.A.api('admin/mute', { name, minutes }).catch(() => ({ error: 'Could not reach the server' }));
    await this.search();
    this.msg(r.error || r.ok || 'Done'); // (after the search, which clears the line)
  }
}
