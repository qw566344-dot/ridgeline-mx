// =====================================================================
//  ADMIN PANEL - press "-" (only for admin accounts; the server checks
//  every action too). Server stats, announcements to everyone online,
//  coin gifts, give any item, find riders, give or set coins, unlock
//  everything, ban, reset or delete an account - plus your own cheats.
// =====================================================================
import { escapeHtml, ago } from './util.js';
import { SHOP, GEAR_SETS } from '/shared/shop.js';
import { getVehicle, BIKE_COLORS } from '/shared/vehicles.js';

const $ = (id) => document.getElementById(id);

// readable names for the "Give item" list (vehicles, paints, rider gear)
function itemName(i) {
  if (i.slot === 'vehicle') return getVehicle(i.id).name;
  if (i.slot === 'color') return (BIKE_COLORS.find((c) => c.id === i.id) || {}).name || i.id;
  if (i.slot === 'gear') return (GEAR_SETS.find((g) => g.id === i.id) || {}).name || i.id;
  return i.id;
}
const fmtUp = (ms) => { const m = Math.floor(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };

export class AdminPanel {
  constructor(ui, account) {
    this.ui = ui; this.A = account;
    window.addEventListener('keydown', (e) => {
      if (e.key !== '-' && e.code !== 'NumpadSubtract') return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (!this.allowed()) return;
      this.toggle();
    });
    let t = null;
    $('adm-search').oninput = () => { clearTimeout(t); t = setTimeout(() => this.load(), 250); };
    $('adm-close').onclick = () => this.toggle(false);

    // tools
    const send = () => { const text = $('adm-ann').value.trim(); if (text) { this.act('announce', { text }); $('adm-ann').value = ''; } };
    $('adm-ann-go').onclick = send;
    $('adm-ann').onkeydown = (e) => { if (e.key === 'Enter') send(); };
    $('adm-ann-clear').onclick = () => this.act('announce', { text: '' });
    $('adm-chat-clear').onclick = () => { const b = $('adm-chat-clear'); if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Sure?'; return; } delete b.dataset.sure; b.textContent = 'Clear chat for everyone'; this.act('chatclear', {}); };
    document.querySelectorAll('[data-gift]').forEach((b) => b.onclick = () => this.act('giftall', { add: Number(b.dataset.gift) }));
    const groups = { vehicle: 'Vehicles', color: 'Paint & skins', gear: 'Rider gear' };
    $('adm-give-item').innerHTML = Object.entries(groups).map(([slot, label]) => `<optgroup label="${label}">${SHOP.filter((i) => i.slot === slot).map((i) => `<option value="${slot}:${i.id}">${escapeHtml(itemName(i))}</option>`).join('')}</optgroup>`).join('');
    $('adm-give-go').onclick = () => { const name = $('adm-give-name').value.trim(); if (name) this.act('give', { name, item: $('adm-give-item').value }); };

    // cheats only change your own vehicle, in this browser
    this.cheats = {};
    for (const [id, k] of [['adm-god', 'god'], ['adm-moon', 'moon'], ['adm-turbo', 'turbo']]) {
      $(id).onchange = () => { this.cheats[k] = $(id).checked; this.applyCheats(); };
    }
  }

  allowed() { return this.A.mode === 'online' && this.A.profile && this.A.profile.admin; }

  applyCheats() {
    const g = this.ui.game;
    if (g) g.cheats = this.allowed() ? { ...this.cheats } : {};
  }

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

  async loadStats() {
    const s = await this.A.api('admin/stats').catch(() => null);
    if (!s || s.error) { $('adm-stats').innerHTML = ''; return; }
    $('adm-stats').innerHTML = [
      ['Online', s.online], ['Accounts', s.accounts], ['Parties', `${s.parties} (${s.inParties} riders)`], ['Connected', s.connected],
      ['Banned', s.banned], ['Coins out there', s.coins.toLocaleString()], ['Server up', fmtUp(s.uptime)],
      ['Accounts saved', s.cloud ? 'cloud (safe)' : 'this server only'],
    ].map(([k, v]) => `<span>${k} <b>${escapeHtml(String(v))}</b></span>`).join('')
      + (s.announcement ? `<span>Showing: <b>${escapeHtml(s.announcement)}</b></span>` : '');
  }

  async load() {
    this.loadStats();
    const q = $('adm-search').value.trim();
    const r = await this.A.api('admin/users?q=' + encodeURIComponent(q)).catch(() => ({ error: 'Could not reach the server' }));
    if (r.error) { $('adm-list').innerHTML = `<tr><td colspan="5">${escapeHtml(r.error)}</td></tr>`; return; }
    $('adm-total').textContent = `${r.total} accounts`;
    $('adm-list').innerHTML = r.users.map((u) => {
      const n = escapeHtml(u.name);
      return `<tr class="${u.banned ? 'banned' : ''}">
      <td><i class="pdot ${u.online ? 'online' : ''}"></i> <b>${n}</b>${u.admin ? ' <small>(admin)</small>' : ''}${u.banned ? ' <small>(banned)</small>' : ''}<br><small>${u.lastSeen ? 'seen ' + ago(Date.now() - u.lastSeen) : 'never online'}</small></td>
      <td>${u.coins.toLocaleString()}</td><td>${u.items}</td>
      <td class="adm-acts">
        <button class="small" data-a="add" data-v="10000" data-n="${n}">+10K</button>
        <button class="small" data-a="add" data-v="1000000" data-n="${n}">+1M</button>
        <input class="adm-set" placeholder="set coins" data-n="${n}">
        <button class="small" data-a="unlock" data-n="${n}">Unlock all</button>
        <button class="small" data-a="give" data-n="${n}">Give item</button>
        ${u.admin ? '' : `<button class="small" data-a="ban" data-on="${u.banned ? 0 : 1}" data-n="${n}">${u.banned ? 'Unban' : 'Ban'}</button>`}
        <button class="small danger" data-a="reset" data-n="${n}">Reset</button>
        ${u.admin ? '' : `<button class="small danger" data-a="delete" data-n="${n}">Delete</button>`}
      </td></tr>`;
    }).join('');
    $('adm-list').querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
      const n = b.dataset.n, a = b.dataset.a;
      // the dangerous ones ask "Sure?" first
      const sure = () => { if (b.dataset.sure) return true; b.dataset.sure = 1; b.textContent = 'Sure?'; return false; };
      if (a === 'add') this.act('coins', { name: n, add: Number(b.dataset.v) });
      if (a === 'unlock') this.act('unlock', { name: n });
      if (a === 'give') { $('adm-give-name').value = n; $('adm-give-item').focus(); }
      if (a === 'ban' && (b.dataset.on === '0' || sure())) this.act('ban', { name: n, on: b.dataset.on === '1' });
      if (a === 'reset' && sure()) this.act('reset', { name: n });
      if (a === 'delete' && sure()) this.act('delete', { name: n });
    });
    $('adm-list').querySelectorAll('.adm-set').forEach((inp) => inp.onkeydown = (e) => { if (e.key === 'Enter' && inp.value.trim() !== '') this.act('coins', { name: inp.dataset.n, set: Number(inp.value) }); });
  }
}
