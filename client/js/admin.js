// =====================================================================
//  ADMIN PANEL - press "-" (only for admin accounts; the server checks
//  every action too). Find riders, give or set coins, unlock everything,
//  reset an account.
// =====================================================================
import { escapeHtml, ago } from './util.js';

const $ = (id) => document.getElementById(id);

export class AdminPanel {
  constructor(ui, account) {
    this.ui = ui; this.A = account;
    window.addEventListener('keydown', (e) => {
      if (e.key !== '-' && e.code !== 'NumpadSubtract') return;
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (!this.allowed()) return;
      this.toggle();
    });
    let t = null;
    $('adm-search').oninput = () => { clearTimeout(t); t = setTimeout(() => this.load(), 250); };
    $('adm-close').onclick = () => this.toggle(false);
  }

  allowed() { return this.A.mode === 'online' && this.A.profile && this.A.profile.admin; }

  toggle(on) {
    const el = $('admin');
    const show = on === undefined ? el.hidden : on;
    el.hidden = !show;
    if (show) this.load();
  }

  async act(route, body) {
    const r = await this.A.api('admin/' + route, body).catch(() => ({ error: 'Could not reach the server' }));
    $('adm-msg').textContent = r.error || r.ok || '';
    $('adm-msg').className = 'cmsg ' + (r.error ? 'bad' : 'good');
    // my own coins changed? refresh
    if (!r.error) { const me = await this.A.api('me').catch(() => null); if (me && me.profile) { this.A.profile = me.profile; this.A.changed(); } }
    this.load();
  }

  async load() {
    const q = $('adm-search').value.trim();
    const r = await this.A.api('admin/users?q=' + encodeURIComponent(q)).catch(() => ({ error: 'Could not reach the server' }));
    if (r.error) { $('adm-list').innerHTML = `<tr><td colspan="5">${escapeHtml(r.error)}</td></tr>`; return; }
    $('adm-total').textContent = `${r.total} accounts`;
    $('adm-list').innerHTML = r.users.map((u) => `<tr>
      <td><i class="pdot ${u.online ? 'online' : ''}"></i> <b>${escapeHtml(u.name)}</b><br><small>${u.lastSeen ? 'seen ' + ago(Date.now() - u.lastSeen) : 'never online'}</small></td>
      <td>${u.coins.toLocaleString()}</td><td>${u.items}</td>
      <td class="adm-acts">
        <button class="small" data-a="add" data-v="10000" data-n="${escapeHtml(u.name)}">+10K</button>
        <button class="small" data-a="add" data-v="1000000" data-n="${escapeHtml(u.name)}">+1M</button>
        <input class="adm-set" placeholder="set coins" data-n="${escapeHtml(u.name)}">
        <button class="small" data-a="unlock" data-n="${escapeHtml(u.name)}">Unlock all</button>
        <button class="small danger" data-a="reset" data-n="${escapeHtml(u.name)}">Reset</button>
      </td></tr>`).join('');
    $('adm-list').querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
      const n = b.dataset.n, a = b.dataset.a;
      if (a === 'add') this.act('coins', { name: n, add: Number(b.dataset.v) });
      if (a === 'unlock') this.act('unlock', { name: n });
      if (a === 'reset') { if (b.dataset.sure) this.act('reset', { name: n }); else { b.dataset.sure = 1; b.textContent = 'Sure?'; } }
    });
    $('adm-list').querySelectorAll('.adm-set').forEach((inp) => inp.onkeydown = (e) => { if (e.key === 'Enter' && inp.value.trim() !== '') this.act('coins', { name: inp.dataset.n, set: Number(inp.value) }); });
  }
}
