// =====================================================================
//  ADMIN PANEL - press "-" (only for admin accounts; the server checks
//  every action too). Server stats, announcements to everyone online,
//  coin gifts, events for everyone, give any item, find riders, add coins, unlock
//  everything, ban, reset or delete an account - plus your own cheats.
// =====================================================================
import { escapeHtml, ago } from './util.js';
import { usd } from '/shared/money.js';
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
const since = (t) => ago(Date.now() - t); // util.ago already says "just now" / "5 min ago"
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
    for (const b of document.querySelectorAll('.ax-tab')) b.onclick = () => this.tab(b.dataset.t);
    // while the console is open: 1-6 switch tabs, Esc closes (typing in a box is left alone)
    window.addEventListener('keydown', (e) => {
      if ($('admin').hidden) return;
      if (e.key === 'Escape') { this.toggle(false); return; }
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const t = ['overview', 'riders', 'broadcast', 'money', 'cheats', 'log'][Number(e.key) - 1];
      if (t) this.tab(t);
    });
    this.filter = 'all'; this.sort = 'recent'; this.users = []; this.cur = 'overview'; this.toastTimer = null;
    $('ax-filter').querySelectorAll('button').forEach((b) => b.onclick = () => { this.filter = b.dataset.f; $('ax-filter').querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b)); this.renderRiders(); });
    $('ax-sort').onchange = () => { this.sort = $('ax-sort').value; this.renderRiders(); };
    $('adm-log-q').oninput = () => this.renderLog();
    $('adm-money-btn').onclick = () => this.loadMoney();
    setInterval(() => { if (!$('admin').hidden && this.cur === 'overview') this.loadStats(); }, 8000); // the overview stays live

    // tools
    const send = () => { const text = $('adm-ann').value.trim(); if (text) { this.act('announce', { text }); $('adm-ann').value = ''; } };
    $('adm-ann-go').onclick = send;
    $('adm-ann').onkeydown = (e) => { if (e.key === 'Enter') send(); };
    $('adm-ann-clear').onclick = () => this.act('announce', { text: '' });
    $('adm-log-btn').onclick = () => this.loadLog();
    $('adm-ev-go').onclick = () => this.act('event', { kind: $('adm-ev-kind').value, minutes: Number($('adm-ev-min').value) });
    $('adm-ev-stop').onclick = () => this.act('event', { kind: '' });
    $('adm-chat-clear').onclick = () => { const b = $('adm-chat-clear'); if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Sure?'; return; } delete b.dataset.sure; b.textContent = 'Clear chat for everyone'; this.act('chatclear', {}); };
    document.querySelectorAll('[data-gift]').forEach((b) => b.onclick = () => this.act('giftall', { add: Number(b.dataset.gift) }));
    const groups = { vehicle: 'Vehicles', color: 'Paint & skins', gear: 'Rider gear' };
    $('adm-give-item').innerHTML = Object.entries(groups).map(([slot, label]) => `<optgroup label="${label}">${SHOP.filter((i) => i.slot === slot).map((i) => `<option value="${slot}:${i.id}">${escapeHtml(itemName(i))}</option>`).join('')}</optgroup>`).join('');
    $('adm-give-go').onclick = () => { const name = $('adm-give-name').value.trim(); if (name) this.act('give', { name, item: $('adm-give-item').value }); };

    // cheats only change your own vehicle, in this browser
    this.cheats = {};
    const CHEATS = [['adm-god', 'god'], ['adm-moon', 'moon'], ['adm-turbo', 'turbo'], ['adm-hyper', 'hyper'], ['adm-jump', 'jump'], ['adm-ghost', 'ghost'], ['adm-freeze', 'freezeAi'], ['adm-slowmo', 'slowmo'], ['adm-giant', 'giant'], ['adm-tiny', 'tiny'], ['adm-flips', 'fastflips']];
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
    globalThis.__flipMul = this.allowed() && this.cheats.fastflips ? 10000 : 1; // flips 10,000x faster (admin test cheat)
  }

  // the console's tabs: Overview / Riders / Broadcast / Money / Cheats / Log
  tab(t) {
    this.cur = t;
    for (const b of document.querySelectorAll('.ax-tab')) b.classList.toggle('sel', b.dataset.t === t);
    for (const p of document.querySelectorAll('.ax-pane')) p.hidden = p.dataset.pane !== t;
    if (t === 'overview') this.loadStats();
    if (t === 'riders') this.load();
    if (t === 'log') this.loadLog();
    if (t === 'money') this.loadMoney();
    if (t === 'cheats') this.renderRace();
  }

  toggle(on) {
    const el = $('admin');
    const show = on === undefined ? el.hidden : on;
    el.hidden = !show;
    if (show) { this.tab(this.cur || 'overview'); this.load(); this.renderRace(); }
  }

  say(text, bad) {
    const el = $('adm-msg'); el.textContent = text || ''; el.className = 'ax-toast ' + (bad ? 'bad' : 'good');
    clearTimeout(this.toastTimer); if (text) this.toastTimer = setTimeout(() => { el.textContent = ''; }, 4500);
  }

  async act(route, body) {
    const r = await this.A.api('admin/' + route, body).catch(() => ({ error: 'Could not reach the server' }));
    this.say(r.error || r.ok || '', !!r.error);
    // my own coins changed? refresh
    if (!r.error) { const me = await this.A.api('me').catch(() => null); if (me && me.profile) { this.A.profile = me.profile; this.A.changed(); } }
    this.load(); this.loadStats();
    if (this.cur === 'log') this.loadLog();
  }

  // ban popup: a reason (they see it) and whether their devices are banned too
  banDialog(name) {
    const reasons = ['Cheating', 'Spamming chat', 'Bad language', 'Harassment', 'Exploiting bugs', 'Other'];
    const box = this.ui.modal(`<h2>Ban</h2>
      <p class="hint">They are logged out within a few seconds and see a ban message.</p>
      <label class="field col-field">Reason (they see this) <select id="ban-pick">${reasons.map((r) => `<option>${r}</option>`).join('')}</select></label>
      <label class="field col-field" id="ban-other-row" hidden>Other reason <input type="text" id="ban-reason" maxlength="140" placeholder="Type the reason"></label>
      <label class="field"><input type="checkbox" id="ban-devices" checked> Also ban their devices (no new accounts from them)</label>`, [
      ['Cancel', null, ''],
      ['Ban', (b) => {
        const pick = b.querySelector('#ban-pick').value;
        const reason = pick === 'Other' ? (b.querySelector('#ban-reason').value.trim() || 'Other') : pick;
        this.act('ban', { name, on: true, reason, devices: b.querySelector('#ban-devices').checked });
      }, 'danger'],
    ]);
    const pick = box.querySelector('#ban-pick'), row = box.querySelector('#ban-other-row');
    pick.onchange = () => { row.hidden = pick.value !== 'Other'; if (!row.hidden) box.querySelector('#ban-reason').focus(); };
  }

  // XP popup: quick amounts or type one; their level follows
  xpDialog(name) {
    const n = escapeHtml(name);
    const give = (add) => { if (Number.isFinite(add) && add) this.act('xp', { name, add }); };
    this.ui.modal(`<h2>Give XP to ${n}</h2>
      <p class="hint">Level 2 needs 300 XP, level 5 needs 3,000, level 10 needs 13,500. A minus number takes XP away.</p>
      <div class="row tight">${[500, 3000, 13500, 50000].map((v) => `<button class="ax-btn sm" data-xp="${v}">+${v.toLocaleString()}</button>`).join('')}</div>
      <label class="field col-field">Or type an amount <input type="text" id="xp-amount" inputmode="numeric" placeholder="e.g. 2000"></label>`, [
      ['Cancel', null, ''],
      ['Give XP', (box) => give(Math.round(Number(box.querySelector('#xp-amount').value))), 'primary'],
    ]).querySelectorAll('[data-xp]').forEach((b) => b.onclick = () => { $('modal').hidden = true; give(Number(b.dataset.xp)); });
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
    $('adm-race').innerHTML = others.map((r, i) => `<button class="ax-btn sm bad" data-boom="${i}">${escapeHtml(r.name)}${r.remote ? '' : ' (AI)'} 💥</button>`).join('');
    $('adm-race').querySelectorAll('[data-boom]').forEach((b) => b.onclick = () => {
      const r = others[Number(b.dataset.boom)];
      if (r.remote) this.act('blow', { name: r.name }); // their game throws them, everyone sees it
      else { g.blowUp(r); this.say(`BOOM - ${r.name} blew up`); }
    });
  }

  async loadStats() {
    const s = await this.A.api('admin/stats').catch(() => null);
    if (!s || s.error) { $('adm-stats').innerHTML = ''; return; }
    const card = (k, v, sub, cls) => `<div class="ax-card ${cls || ''}"><small>${k}</small><b>${escapeHtml(String(v))}</b>${sub ? `<em>${escapeHtml(sub)}</em>` : ''}</div>`;
    $('adm-stats').innerHTML = card('Online now', s.online, s.connected + ' connected', 'good') + card('Accounts', s.accounts.toLocaleString()) + card('Parties', s.parties, s.inParties + ' riders') + card('Banned', s.banned, '', s.banned ? 'bad' : '')
      + card('Coins in the game', s.coins.toLocaleString(), '', 'gold') + card('Server up', fmtUp(s.uptime)) + card('Saves', s.cloud ? 'Cloud' : 'Local only', s.cloud ? 'safe across restarts' : 'lost if the server restarts', s.cloud ? 'good' : 'bad');
    const live = [];
    if (s.announcement) live.push(`<div class="ax-live-item"><div><small>Announcement showing</small>${escapeHtml(s.announcement)}</div><button class="ax-btn sm" data-live="ann">Clear</button></div>`);
    if (s.event) live.push(`<div class="ax-live-item"><div><small>Event running</small><b>${escapeHtml(s.event.name)}</b> - ${Math.ceil(s.event.left / 60000)} min left</div><button class="ax-btn sm bad" data-live="ev">Stop</button></div>`);
    for (const p of s.partyList || []) live.push(`<div class="ax-live-item"><div><small>Party ${escapeHtml(p.code)}</small>${escapeHtml(p.members.join(', '))}</div><div class="ax-row"><button class="ax-btn sm" data-join="${escapeHtml(p.code)}">Join</button><button class="ax-btn sm bad" data-close="${escapeHtml(p.code)}">Close</button></div></div>`);
    $('adm-live-box').innerHTML = live.join('') || '<div class="ax-empty">Nothing live right now</div>';
    const box = $('adm-live-box');
    box.querySelectorAll('[data-live="ann"]').forEach((b) => b.onclick = () => this.act('announce', { text: '' }));
    box.querySelectorAll('[data-live="ev"]').forEach((b) => b.onclick = () => this.act('event', { kind: '' }));
    // admins get in even mid-race (as a spectator: flying around as your rider, no bike)
    box.querySelectorAll('[data-join]').forEach((b) => b.onclick = () => this.joinParty(b.dataset.join));
    box.querySelectorAll('[data-close]').forEach((b) => b.onclick = () => { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Sure?'; return; } this.act('closeparty', { code: b.dataset.close }); });
  }

  async load() {
    this.loadStats();
    const q = $('adm-search').value.trim();
    const r = await this.A.api('admin/users?q=' + encodeURIComponent(q)).catch(() => ({ error: 'Could not reach the server' }));
    if (r.error) { $('adm-list').innerHTML = `<div class="ax-empty">${escapeHtml(r.error)}</div>`; return; }
    $('adm-total').textContent = `${r.total.toLocaleString()} accounts`;
    this.users = r.users;
    this.renderRiders();
  }

  renderRiders() {
    const F = { all: () => true, online: (u) => u.online, banned: (u) => u.banned, admin: (u) => u.admin || u.owner }[this.filter] || (() => true);
    const S = { recent: null, coins: (a, b) => b.coins - a.coins, level: (a, b) => (b.level || 1) - (a.level || 1), name: (a, b) => a.name.localeCompare(b.name) }[this.sort];
    const list = this.users.filter(F); if (S) list.sort(S);
    $('adm-list').innerHTML = list.length ? list.map((u) => {
      const n = escapeHtml(u.name), open = this.infoFor === u.name;
      const badges = (u.owner ? '<span class="ax-badge own">owner</span>' : u.admin ? '<span class="ax-badge adm">admin</span>' : '') + (u.banned ? '<span class="ax-badge ban">banned</span>' : '') + (u.muted ? '<span class="ax-badge mut">muted</span>' : '');
      return `<div class="ax-rider ${u.banned ? 'banned' : ''}">
        <div class="ax-rhead">
          <div class="ax-av">${escapeHtml(u.name.slice(0, 1).toUpperCase())}<i class="${u.online ? 'on' : ''}"></i></div>
          <div class="ax-nm"><b>${n}</b>${badges}<small>${u.online ? 'online now' : u.lastSeen ? 'seen ' + since(u.lastSeen) : 'never online'}</small></div>
          <div class="ax-num"><b>Lv ${u.level || 1}</b><small>level</small></div>
          <div class="ax-num"><b>${u.coins.toLocaleString()}</b><small>coins</small></div>
          <div class="ax-num"><b>${u.items}</b><small>items</small></div>
          <div class="ax-quick">
            <button class="ax-btn sm" data-a="add" data-v="10000" data-n="${n}">+10K</button>
            ${u.online && !u.owner ? `<button class="ax-btn sm" data-a="join" data-n="${n}">Join</button>` : ''}
            <button class="ax-btn sm ${open ? 'pri' : ''}" data-a="info" data-n="${n}">${open ? 'Close' : 'Manage'}</button>
          </div>
        </div>
        ${open ? `<div class="ax-drawer">
          <div class="ax-actions">
            <button class="ax-btn sm" data-a="add" data-v="1000000" data-n="${n}">+1M</button>
            <input type="number" class="adm-set" placeholder="coins (minus takes)" data-n="${n}"><button class="ax-btn sm" data-a="addbox" data-n="${n}">Add coins</button>
            <button class="ax-btn sm" data-a="xp" data-n="${n}">Add XP</button>
            <button class="ax-btn sm" data-a="unlock" data-n="${n}">Unlock all</button>
            <button class="ax-btn sm" data-a="give" data-n="${n}">Give item</button>
            ${u.online && !u.owner ? `<button class="ax-btn sm" data-a="summon" data-n="${n}" title="Bring them into your party">Summon</button><button class="ax-btn sm bad" data-a="blow" data-n="${n}" title="Troll: they blow up">Blow up</button>` : ''}
            ${u.owner ? '' : `<button class="ax-btn sm" data-a="kick" data-n="${n}">Kick</button>`}
            ${u.admin ? '' : `<button class="ax-btn sm bad" data-a="ban" data-on="${u.banned ? 0 : 1}" data-n="${n}">${u.banned ? 'Unban' : 'Ban'}</button>`}
            <button class="ax-btn sm bad" data-a="reset" data-n="${n}">Reset</button>
            ${u.admin ? '' : `<button class="ax-btn sm bad" data-a="delete" data-n="${n}">Delete</button>`}
          </div>
          <div id="adm-info-box">Loading...</div></div>` : ''}
      </div>`;
    }).join('') : '<div class="ax-empty">No riders match</div>';
    $('adm-list').querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
      const n = b.dataset.n, a = b.dataset.a;
      // the dangerous ones ask "Sure?" first
      const sure = () => { if (b.dataset.sure) return true; b.dataset.sure = 1; b.textContent = 'Sure?'; return false; };
      if (a === 'info') { this.infoFor = this.infoFor === n ? null : n; this.renderRiders(); }
      if (a === 'add') this.act('coins', { name: n, add: Number(b.dataset.v) });
      if (a === 'addbox') { const inp = b.previousElementSibling; if (inp.value.trim() !== '') this.act('coins', { name: n, add: Number(inp.value) }); }
      if (a === 'unlock') this.act('unlock', { name: n });
      if (a === 'join') this.joinRider(n);
      if (a === 'summon') this.summonRider(n);
      if (a === 'give') { this.tab('broadcast'); $('adm-give-name').value = n; $('adm-give-item').focus(); }
      if (a === 'kick' && sure()) this.act('kick', { name: n });
      if (a === 'blow') this.act('blow', { name: n });
      if (a === 'ban') { if (b.dataset.on === '0') this.act('ban', { name: n, on: false }); else this.banDialog(n); }
      if (a === 'xp') this.xpDialog(n);
      if (a === 'reset' && sure()) this.act('reset', { name: n });
      if (a === 'delete' && sure()) this.act('delete', { name: n });
    });
    $('adm-list').querySelectorAll('.adm-set').forEach((inp) => inp.onkeydown = (e) => { if (e.key === 'Enter' && inp.value.trim() !== '') this.act('coins', { name: inp.dataset.n, add: Number(inp.value) }); });
    if (this.infoFor && $('adm-info-box')) this.loadInfo(this.infoFor);
  }

  joinParty(code) {
    const net = window.MX && window.MX.net;
    if (!net) return;
    this.toggle(false);
    if (this.ui.game && this.ui.game.state === 'running' && this.ui.inGame()) this.ui.emit('mainMenu');
    this.ui.show('home');
    net.whenOnline(() => { net.sendProfile(); net.send({ t: 'adminjoin', code, auth: this.A.token }); });
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
    box.innerHTML = `<div class="ax-detail">
      <span>Status <b>${escapeHtml(where)}</b></span><span>Joined <b>${u.created ? new Date(u.created).toLocaleDateString() : '?'}</b></span>
      <span>Laps <b>${st.laps || 0}</b></span><span>Wins <b>${st.wins || 0}</b></span><span>Tricks <b>${st.tricks || 0}</b></span><span>Friends <b>${u.friends}</b></span>
      <span>Riding <b>${escapeHtml(eq.vehicle || '')}</b> · <b>${escapeHtml(eq.color || '')}</b> · <b>${escapeHtml(eq.gear || '')}</b></span>
      ${u.mutedUntil ? `<span>Muted <b>${Math.ceil((u.mutedUntil - Date.now()) / 60000)} min left</b></span>` : ''}</div>
      <div class="ax-actions"><span class="ax-lbl">Message</span><input id="adm-i-warn" placeholder="Private message / warning for ${n}" maxlength="200" style="flex:1;min-width:160px"><button class="ax-btn sm" id="adm-i-warn-go">Send</button></div>
      <div class="ax-actions"><span class="ax-lbl">Chat</span>${[[10, '10 min'], [60, '1 hour'], [1440, '1 day']].map(([m2, t]) => `<button class="ax-btn sm" data-mute="${m2}">Mute ${t}</button>`).join('')}<button class="ax-btn sm" data-mute="0">Unmute</button></div>
      <div class="ax-actions"><span class="ax-lbl">Take item</span><select id="adm-i-take">${paid.length ? paid.map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(nm(k))}</option>`).join('') : '<option value="">(nothing bought)</option>'}</select><button class="ax-btn sm bad" id="adm-i-take-go">Take</button></div>
      <div class="ax-actions"><span class="ax-lbl">Password</span><input id="adm-i-pw" type="text" placeholder="New password (4+ characters)" autocomplete="off" style="width:200px"><button class="ax-btn sm" id="adm-i-pw-go">Set</button><span class="ax-sub">logs them out everywhere</span></div>
      ${u.owner ? '' : `<div class="ax-actions"><span class="ax-lbl">Admin</span><button class="ax-btn sm" id="adm-i-admin">${u.admin ? 'Remove admin' : 'Make admin'}</button><span class="ax-sub">(owners only)</span></div>`}
      ${u.owner ? '' : `<div class="ax-actions"><span class="ax-lbl">Dev tag</span><button class="ax-btn sm" id="adm-i-dev">${u.dev ? 'Remove DEV tag' : 'Make dev'}</button><span class="ax-sub">just the DEV name tag - no admin panel</span></div>`}`;
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
    if (r.error) { el.innerHTML = `<div class="ax-empty">${escapeHtml(r.error)}</div>`; return; }
    this.logRows = r.log; this.renderLog();
  }

  renderLog() {
    const q = $('adm-log-q').value.trim().toLowerCase(), rows = (this.logRows || []).filter((x) => !q || [x.by, x.action, x.target, x.detail].join(' ').toLowerCase().includes(q)).slice(0, 120);
    $('adm-log').innerHTML = rows.length ? `<table><thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Rider</th><th>Detail</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${since(x.at)}</td><td><b>${escapeHtml(x.by)}</b></td><td>${escapeHtml(x.action)}</td><td>${escapeHtml(x.target)}</td><td>${escapeHtml(String(x.detail).slice(0, 80))}</td></tr>`).join('')}</tbody></table>` : '<div class="ax-empty">Nothing here</div>';
  }

  // real-money purchases (Stripe) - totals and the latest buys
  async loadMoney() {
    const r = await this.A.api('admin/payments').catch(() => ({ error: 'Could not reach the server' }));
    if (r.error) { $('adm-money').innerHTML = `<div class="ax-empty">${escapeHtml(r.error)}</div>`; return; }
    const card = (k, v, sub, cls) => `<div class="ax-card ${cls || ''}"><small>${k}</small><b>${escapeHtml(String(v))}</b>${sub ? `<em>${escapeHtml(sub)}</em>` : ''}</div>`;
    $('adm-money-cards').innerHTML = card('Stripe', r.enabled ? (r.test ? 'Test mode' : 'Live') : 'Off', r.enabled ? (r.test ? 'fake cards only' : 'real money') : 'no key set in Render', r.enabled ? (r.test ? 'gold' : 'good') : 'bad')
      + card('Today', usd(r.today), '', 'good') + card('Last 7 days', usd(r.week)) + card('All time', usd(r.total), r.count + ' purchases') + card('Buyers', r.buyers);
    $('adm-money').innerHTML = r.recent.length ? `<table><thead><tr><th>When</th><th>Rider</th><th>Item</th><th>Paid</th></tr></thead><tbody>${r.recent.map((p) => `<tr><td>${since(p.at)}</td><td><b>${escapeHtml(p.name)}</b></td><td>${p.item === 'pass' ? 'Premium Pass' : 'Coins pack ' + escapeHtml(p.item)}</td><td>${usd(p.cents)}</td></tr>`).join('')}</tbody></table>` : '<div class="ax-empty">No purchases yet</div>';
  }
}
