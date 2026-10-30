// =====================================================================
//  ADMIN PANEL - press "-" (only for admin accounts; the server checks
//  every action too). Server stats, announcements to everyone online,
//  coin gifts, events for everyone, give any item, find riders, add coins, unlock
//  everything, ban, reset or delete an account - plus your own cheats.
// =====================================================================
import { escapeHtml, ago } from './util.js';
import { SHOP, GEAR_SETS, shopItem } from '/shared/shop.js';
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
    $('adm-log-btn').onclick = () => { const el = $('adm-log'); el.hidden = !el.hidden; $('adm-log-btn').textContent = el.hidden ? 'Show recent admin actions' : 'Hide'; if (!el.hidden) this.loadLog(); };
    $('adm-ev-go').onclick = () => this.act('event', { kind: $('adm-ev-kind').value, minutes: Number($('adm-ev-min').value) });
    $('adm-ev-stop').onclick = () => this.act('event', { kind: '' });
    $('adm-chat-clear').onclick = () => { const b = $('adm-chat-clear'); if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Sure?'; return; } delete b.dataset.sure; b.textContent = 'Clear chat for everyone'; this.act('chatclear', {}); };
    document.querySelectorAll('[data-gift]').forEach((b) => b.onclick = () => this.act('giftall', { add: Number(b.dataset.gift) }));
    const groups = { vehicle: 'Vehicles', color: 'Paint & skins', gear: 'Rider gear' };
    $('adm-give-item').innerHTML = Object.entries(groups).map(([slot, label]) => `<optgroup label="${label}">${SHOP.filter((i) => i.slot === slot).map((i) => `<option value="${slot}:${i.id}">${escapeHtml(itemName(i))}</option>`).join('')}</optgroup>`).join('');
    $('adm-give-go').onclick = () => { const name = $('adm-give-name').value.trim(); if (name) this.act('give', { name, item: $('adm-give-item').value }); };

    // cheats only change your own vehicle, in this browser
    this.cheats = {};
    const CHEATS = [['adm-god', 'god'], ['adm-moon', 'moon'], ['adm-turbo', 'turbo'], ['adm-hyper', 'hyper'], ['adm-jump', 'jump'], ['adm-ghost', 'ghost'], ['adm-freeze', 'freezeAi'], ['adm-slowmo', 'slowmo'], ['adm-giant', 'giant'], ['adm-tiny', 'tiny']];
    for (const [id, k] of CHEATS) {
      $(id).onchange = () => {
        this.cheats[k] = $(id).checked;
        // giant and tiny can not both be on
        if (k === 'giant' && this.cheats.giant) { this.cheats.tiny = false; $('adm-tiny').checked = false; }
        if (k === 'tiny' && this.cheats.tiny) { this.cheats.giant = false; $('adm-giant').checked = false; }
        this.applyCheats();
      };
    }
    $('adm-cheats-off').onclick = () => { for (const [id] of CHEATS) $(id).checked = false; this.cheats = {}; this.applyCheats(); };
    document.querySelectorAll('[data-skip]').forEach((b) => b.onclick = () => {
      const g = this.ui.game;
      if (!g || !this.ui.inGame()) { this.say('Start riding first', true); return; }
      g.skipAhead(Number(b.dataset.skip));
    });
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
    if (show) { this.load(); this.renderRace(); }
  }

  say(text, bad) { $('adm-msg').textContent = text; $('adm-msg').className = 'cmsg ' + (bad ? 'bad' : 'good'); }

  async act(route, body) {
    const r = await this.A.api('admin/' + route, body).catch(() => ({ error: 'Could not reach the server' }));
    $('adm-msg').textContent = r.error || r.ok || '';
    $('adm-msg').className = 'cmsg ' + (r.error ? 'bad' : 'good');
    // my own coins changed? refresh
    if (!r.error) { const me = await this.A.api('me').catch(() => null); if (me && me.profile) { this.A.profile = me.profile; this.A.changed(); } }
    this.load();
    if (!$('adm-log').hidden) this.loadLog();
  }

  // drop into a rider (no party needed): connect to the server first, then the
  // server makes a party around them if needed and puts you in their ride
  joinRider(name) {
    const net = window.MX && window.MX.net;
    if (!net) return;
    this.toggle(false);
    if (this.ui.game && this.ui.game.state === 'running' && this.ui.inGame()) this.ui.emit('mainMenu');
    this.ui.show('home');
    this.ui.popup(`Joining <b>${escapeHtml(name)}</b>...`);
    net.whenOnline(() => { net.sendProfile(); net.send({ t: 'adminjoin', name, auth: this.A.token }); });
  }

  // everyone in the race you are riding, each with a Blow up button (troll)
  renderRace() {
    const g = this.ui.game, row = $('adm-race-row');
    const others = g && this.ui.inGame() ? g.riders.filter((r) => !r.isPlayer) : [];
    row.hidden = !others.length;
    if (!others.length) return;
    $('adm-race').innerHTML = others.map((r, i) => `<button class="small danger" data-boom="${i}">${escapeHtml(r.name)}${r.remote ? '' : ' (AI)'} 💥</button>`).join('');
    $('adm-race').querySelectorAll('[data-boom]').forEach((b) => b.onclick = () => {
      const r = others[Number(b.dataset.boom)];
      if (r.remote) this.act('blow', { name: r.name }); // their game throws them, everyone sees it
      else { g.blowUp(r); this.say(`BOOM - ${r.name} blew up`); }
    });
  }

  async loadStats() {
    const s = await this.A.api('admin/stats').catch(() => null);
    if (!s || s.error) { $('adm-stats').innerHTML = ''; return; }
    $('adm-stats').innerHTML = [
      ['Online', s.online], ['Accounts', s.accounts], ['Parties', `${s.parties} (${s.inParties} riders)`], ['Connected', s.connected],
      ['Banned', s.banned], ['Coins out there', s.coins.toLocaleString()], ['Server up', fmtUp(s.uptime)],
      ['Accounts saved', s.cloud ? 'cloud (safe)' : 'this server only'],
    ].map(([k, v]) => `<span>${k} <b>${escapeHtml(String(v))}</b></span>`).join('')
      + (s.announcement ? `<span>Showing: <b>${escapeHtml(s.announcement)}</b></span>` : '')
      + (s.event ? `<span>Event: <b>${escapeHtml(s.event.name)}</b> ${Math.ceil(s.event.left / 60000)} min left</span>` : '')
      + (s.partyList || []).map((p) => `<span>Party <b>${escapeHtml(p.code)}</b> ${escapeHtml(p.members.join(', '))} <button class="small" data-join="${escapeHtml(p.code)}">Join</button><button class="small danger" data-close="${escapeHtml(p.code)}">Close</button></span>`).join('');
    $('adm-stats').querySelectorAll('[data-join]').forEach((b) => b.onclick = () => { this.toggle(false); this.ui.emit('joinParty', { code: b.dataset.join, region: null }); });
    $('adm-stats').querySelectorAll('[data-close]').forEach((b) => b.onclick = () => { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Sure?'; return; } this.act('closeparty', { code: b.dataset.close }); });
  }

  async load() {
    this.loadStats();
    const q = $('adm-search').value.trim();
    const r = await this.A.api('admin/users?q=' + encodeURIComponent(q)).catch(() => ({ error: 'Could not reach the server' }));
    if (r.error) { $('adm-list').innerHTML = `<tr><td colspan="5">${escapeHtml(r.error)}</td></tr>`; return; }
    $('adm-total').textContent = `${r.total} accounts`;
    $('adm-list').innerHTML = r.users.map((u) => {
      const n = escapeHtml(u.name);
      const tags = (u.owner ? ' <small>(owner)</small>' : u.admin ? ' <small>(admin)</small>' : '') + (u.banned ? ' <small>(banned)</small>' : '') + (u.muted ? ' <small>(muted)</small>' : '');
      return `<tr class="${u.banned ? 'banned' : ''}">
      <td><i class="pdot ${u.online ? 'online' : ''}"></i> <b>${n}</b>${tags}<br><small>${u.lastSeen ? 'seen ' + ago(Date.now() - u.lastSeen) : 'never online'}</small></td>
      <td>${u.coins.toLocaleString()}</td><td>${u.items}</td>
      <td class="adm-acts">
        <button class="small" data-a="info" data-n="${n}">${this.infoFor === u.name ? 'Hide' : 'Info'}</button>
        <button class="small" data-a="add" data-v="10000" data-n="${n}">+10K</button>
        <button class="small" data-a="add" data-v="1000000" data-n="${n}">+1M</button>
        <input class="adm-set" type="number" placeholder="add coins" title="Coins to add (a minus number takes coins away), Enter to add" data-n="${n}"><button class="small" data-a="addbox" data-n="${n}">Add</button>
        <button class="small" data-a="unlock" data-n="${n}">Unlock all</button>
        ${u.online && !u.owner ? `<button class="small" data-a="join" data-n="${n}">Join</button><button class="small" data-a="summon" data-n="${n}" title="Bring them into your party">Summon</button>` : ''}
        <button class="small" data-a="give" data-n="${n}">Give item</button>
        ${u.owner ? '' : `<button class="small" data-a="kick" data-n="${n}">Kick</button>`}
        ${u.online && !u.owner ? `<button class="small danger" data-a="blow" data-n="${n}" title="Troll: they blow up (works best when you are in a race with them)">Blow up</button>` : ''}
        ${u.admin ? '' : `<button class="small" data-a="ban" data-on="${u.banned ? 0 : 1}" data-n="${n}">${u.banned ? 'Unban' : 'Ban'}</button>`}
        <button class="small danger" data-a="reset" data-n="${n}">Reset</button>
        ${u.admin ? '' : `<button class="small danger" data-a="delete" data-n="${n}">Delete</button>`}
      </td></tr>${this.infoFor === u.name ? `<tr class="adm-info"><td colspan="4" id="adm-info-box">Loading...</td></tr>` : ''}`;
    }).join('');
    $('adm-list').querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
      const n = b.dataset.n, a = b.dataset.a;
      // the dangerous ones ask "Sure?" first
      const sure = () => { if (b.dataset.sure) return true; b.dataset.sure = 1; b.textContent = 'Sure?'; return false; };
      if (a === 'info') { this.infoFor = this.infoFor === n ? null : n; this.load(); }
      if (a === 'add') this.act('coins', { name: n, add: Number(b.dataset.v) });
      if (a === 'addbox') { const inp = b.previousElementSibling; if (inp.value.trim() !== '') this.act('coins', { name: n, add: Number(inp.value) }); }
      if (a === 'unlock') this.act('unlock', { name: n });
      if (a === 'join') this.joinRider(n);
      if (a === 'summon') this.summonRider(n);
      if (a === 'give') { $('adm-give-name').value = n; $('adm-give-item').focus(); }
      if (a === 'kick' && sure()) this.act('kick', { name: n });
      if (a === 'blow') this.act('blow', { name: n });
      if (a === 'ban' && (b.dataset.on === '0' || sure())) this.act('ban', { name: n, on: b.dataset.on === '1' });
      if (a === 'reset' && sure()) this.act('reset', { name: n });
      if (a === 'delete' && sure()) this.act('delete', { name: n });
    });
    $('adm-list').querySelectorAll('.adm-set').forEach((inp) => inp.onkeydown = (e) => { if (e.key === 'Enter' && inp.value.trim() !== '') this.act('coins', { name: inp.dataset.n, add: Number(inp.value) }); });
    if (this.infoFor && $('adm-info-box')) this.loadInfo(this.infoFor);
  }

  // bring a rider into your party (they ride in if your party is riding)
  summonRider(name) {
    const net = window.MX && window.MX.net;
    if (!net) return;
    this.ui.popup(`Bringing <b>${escapeHtml(name)}</b> to you...`);
    net.whenOnline(() => { net.sendProfile(); net.send({ t: 'adminsummon', name, auth: this.A.token }); });
  }

  // the Info row: everything about one rider, plus warn / mute / take item / password / admin
  async loadInfo(name) {
    const box = $('adm-info-box');
    const r = await this.A.api('admin/user?name=' + encodeURIComponent(name)).catch(() => ({ error: 'Could not reach the server' }));
    if (!box.isConnected) return;
    if (r.error) { box.textContent = r.error; return; }
    const u = r.user, st = u.stats || {}, eq = u.equipped || {};
    const paid = u.owned.filter((k) => { const [s2, i2] = k.split(':'); const it = shopItem(s2, i2); return it && it.price > 0; });
    const nm = (k) => { const [s2, i2] = k.split(':'); const it = shopItem(s2, i2); return it && s2 !== 'upgrade' ? itemName(it) : k; };
    const where = u.online ? (u.status === 'riding' ? `riding ${u.mode || ''}${u.track ? ' on ' + u.track : ''}` : u.status === 'party' ? 'in a party lobby' : 'in the menus') + (u.party ? ` (party ${u.party})` : '') : 'offline';
    const n = escapeHtml(u.name);
    box.innerHTML = `<div class="adm-detail">
      <span>Status <b>${escapeHtml(where)}</b></span><span>Joined <b>${u.created ? new Date(u.created).toLocaleDateString() : '?'}</b></span>
      <span>Laps <b>${st.laps || 0}</b></span><span>Wins <b>${st.wins || 0}</b></span><span>Tricks <b>${st.tricks || 0}</b></span><span>Friends <b>${u.friends}</b></span>
      <span>Riding <b>${escapeHtml(eq.vehicle || '')}</b> · <b>${escapeHtml(eq.color || '')}</b> · <b>${escapeHtml(eq.gear || '')}</b></span>
      ${u.mutedUntil ? `<span>Muted <b>${Math.ceil((u.mutedUntil - Date.now()) / 60000)} min left</b></span>` : ''}</div>
      <div class="adm-row"><span class="lbl">Message</span><input id="adm-i-warn" placeholder="Private message / warning for ${n}" maxlength="200" style="flex:1"><button class="small" id="adm-i-warn-go">Send</button></div>
      <div class="adm-row"><span class="lbl">Chat</span>${[[10, '10 min'], [60, '1 hour'], [1440, '1 day']].map(([m2, t]) => `<button class="small" data-mute="${m2}">Mute ${t}</button>`).join('')}<button class="small" data-mute="0">Unmute</button></div>
      <div class="adm-row"><span class="lbl">Take item</span><select id="adm-i-take">${paid.length ? paid.map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(nm(k))}</option>`).join('') : '<option value="">(nothing bought)</option>'}</select><button class="small danger" id="adm-i-take-go">Take</button></div>
      <div class="adm-row"><span class="lbl">Password</span><input id="adm-i-pw" type="text" placeholder="New password (4+ characters)" autocomplete="off" style="width:200px"><button class="small" id="adm-i-pw-go">Set</button><span class="hint">logs them out everywhere</span></div>
      ${u.owner ? '' : `<div class="adm-row"><span class="lbl">Admin</span><button class="small" id="adm-i-admin">${u.admin ? 'Remove admin' : 'Make admin'}</button><span class="hint">(owners only)</span></div>`}
      ${u.owner ? '' : `<div class="adm-row"><span class="lbl">Dev tag</span><button class="small" id="adm-i-dev">${u.dev ? 'Remove DEV tag' : 'Make dev'}</button><span class="hint">just the DEV name tag - no admin panel</span></div>`}`;
    const warn = () => { const t = $('adm-i-warn').value.trim(); if (t) this.act('warn', { name: u.name, text: t }); };
    $('adm-i-warn-go').onclick = warn;
    $('adm-i-warn').onkeydown = (e) => { if (e.key === 'Enter') warn(); };
    box.querySelectorAll('[data-mute]').forEach((b) => b.onclick = () => this.act('mute', { name: u.name, minutes: Number(b.dataset.mute) }));
    $('adm-i-take-go').onclick = () => { const k = $('adm-i-take').value; if (k) this.act('take', { name: u.name, item: k }); };
    $('adm-i-pw-go').onclick = () => { const pw = $('adm-i-pw').value; if (pw) this.act('password', { name: u.name, password: pw }); };
    if ($('adm-i-admin')) $('adm-i-admin').onclick = () => this.act('makeadmin', { name: u.name, on: !u.admin });
    if ($('adm-i-dev')) $('adm-i-dev').onclick = async () => { await this.act('dev', { name: u.name, on: !u.dev }); const T = window.MX && window.MX.loadTags; if (T) T(); };
  }

  async loadLog() {
    const el = $('adm-log');
    const r = await this.A.api('admin/log').catch(() => ({ error: 'Could not reach the server' }));
    if (r.error) { el.textContent = r.error; return; }
    el.innerHTML = r.log.length ? `<table class="results adm-logt">${r.log.slice(0, 60).map((x) => `<tr><td>${ago(Date.now() - x.at)} ago</td><td><b>${escapeHtml(x.by)}</b></td><td>${escapeHtml(x.action)}</td><td>${escapeHtml(x.target)}</td><td>${escapeHtml(String(x.detail).slice(0, 60))}</td></tr>`).join('')}</table>` : '<p class="hint">Nothing yet.</p>';
  }
}
