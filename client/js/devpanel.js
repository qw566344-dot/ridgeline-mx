// Mini dev panel: press = to open it. Devs (and admins) can search riders and mute / unmute them.
// Nothing else - the server only lets devs use mute and the rider search.
const $ = (id) => document.getElementById(id);
export class DevPanel {
  constructor(account) {
    this.A = account;
    const st = document.createElement('style');
    st.textContent = '#devpanel{position:fixed;right:12px;bottom:12px;width:260px;z-index:60;background:rgba(14,17,24,.94);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px;font-size:13px;color:#fff}'
      + '#devpanel[hidden]{display:none}#devpanel h4{margin:0 0 8px}#devpanel input{width:100%;box-sizing:border-box;margin-bottom:6px}'
      + '#devpanel ul{list-style:none;margin:6px 0 0;padding:0;max-height:180px;overflow:auto}#devpanel li{display:flex;justify-content:space-between;align-items:center;padding:3px 0;gap:6px}'
      + '#devpanel li button{padding:2px 8px;font-size:12px}#devpanel .dp-msg{min-height:16px;color:#9aa1ad}#devpanel .on{color:#3ddc84}';
    document.head.appendChild(st);
    const el = document.createElement('div');
    el.id = 'devpanel'; el.hidden = true;
    el.innerHTML = '<h4>DEV - mute riders <small style="float:right;opacity:.6">= closes</small></h4><input id="dp-q" placeholder="Search rider name" autocomplete="off"><div id="dp-msg" class="dp-msg"></div><ul id="dp-list"></ul>';
    document.body.appendChild(el);
    this.el = el;
    let t = null;
    $('dp-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => this.search(), 250); });
    $('dp-q').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.open(false); });
    $('dp-list').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.mute(b.dataset.n, b.dataset.m === '1' ? 0 : Number(prompt('Mute for how many minutes?', '10')) || 0); });
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
  msg(t) { $('dp-msg').textContent = t || ''; }
  async search() {
    const r = await this.A.api('admin/users?q=' + encodeURIComponent($('dp-q').value.trim())).catch(() => ({ error: 'Could not reach the server' }));
    if (r.error) return this.msg(r.error);
    this.msg('');
    $('dp-list').innerHTML = (r.users || []).slice(0, 30).map((u) => `<li><span class="${u.online ? 'on' : ''}">${u.name.replace(/[<>&]/g, '')}${u.muted ? ' (muted)' : ''}</span>${u.admin ? '' : `<button data-n="${u.name.replace(/[<>&"]/g, '')}" data-m="${u.muted ? 1 : 0}">${u.muted ? 'Unmute' : 'Mute'}</button>`}</li>`).join('') || '<li>No riders found</li>';
  }
  async mute(name, minutes) {
    if (!name) return;
    const r = await this.A.api('admin/mute', { name, minutes }).catch(() => ({ error: 'Could not reach the server' }));
    this.msg(r.error || r.ok || 'Done');
    this.search();
  }
}
