// =====================================================================
//  UI: every menu, the HUD, the minimap, toasts and popups.
//  Screens are plain HTML (index.html); this file fills them in.
//   - Lobby (home): your party lined up in 3D (stage.js), party panel,
//     friends online, and the PLAY dock (mode + track).
//   - Match setup: game mode cards + track grid with difficulty.
//   - Garage: look at, compare and choose vehicles, paint and gear.
//   - Shop: buy vehicles, paint, gear and performance upgrades.
//   - Friends: search, add, accept, remove, invite, join.
//   - Settings (incl. Online: server regions + ping), Controls, Credits.
//  The party itself lives in net.js; friends in social.js.
// =====================================================================
import { TRACKS, getTrack, DIFFICULTY_ORDER } from '/shared/tracks.js';
import { VEHICLES, BIKE_COLORS, getVehicle, paintFor, CATEGORIES, UPGRADES } from '/shared/vehicles.js';
import { GEAR_SETS, shopItem, upgradeLevels, upgradeNeeds, rarityOf, shopRotation, inShop, BUNDLES, getBundle, bundlePrice } from '/shared/shop.js';
import { buildTrack } from '/shared/trackgen.js';
import { fmtTime } from './settings.js';
import { CAMERA_MODES } from './camera.js';
import { escapeHtml, ordinal, hex, ago, staffTags } from './util.js';
import { liveTrick } from './sim/tricks.js';
import { regionList, customServer, setServerBase, serverBase } from './config.js';

export { escapeHtml };
import { Vector3 } from 'three';
const $ = (id) => document.getElementById(id);
const _tv = new Vector3();
const SCREENS = ['loading', 'account', 'home', 'play', 'garage', 'shop', 'casino', 'friends', 'settings', 'controls', 'credits', 'pause', 'results'];
const MENUS = new Set(['home', 'play', 'garage', 'shop', 'casino', 'friends', 'settings', 'controls', 'credits']);
const NAV = { home: 'home', play: 'home', garage: 'garage', shop: 'shop', casino: 'casino', friends: 'friends', settings: 'settings', controls: 'controls' };

export const MODES = [
  { id: 'freeride', name: 'Free Ride', desc: 'Ride at your own pace. No timer, no pressure.', party: true },
  { id: 'timetrial', name: 'Time Trial', desc: 'Hot laps against the clock. Y restarts the lap.', party: true },
  { id: 'race', name: 'Race', desc: 'Line up on the gate - against AI riders, or your party.', party: true },
  { id: 'practice', name: 'Practice', desc: 'Drill one section until it is perfect. T retries it.', party: false },
  { id: 'freestyle', name: 'Freestyle', desc: 'Flips, whips and spins for points. Chain combos!', party: true },
];
export const modeName = (id) => (MODES.find((m) => m.id === id) || MODES[0]).name;

// rough effect of each upgrade level on the 0-10 stat bars
const UP_STAT = { engine: { speed: 0.25, accel: 0.32 }, suspension: { suspension: 0.25, stability: 0.18 }, tyres: { handling: 0.28, stability: 0.1 }, weight: { accel: 0.2, handling: 0.15 }, air: { handling: 0.05 } };
const UP_TEXT = {
  engine: (L) => `+${Math.round((L.power - 1) * 100)}% engine power`,
  suspension: (L) => `+${Math.round((L.travel - 1) * 100)}% travel, +${Math.round((L.damp - 1) * 100)}% damping`,
  tyres: (L) => `+${Math.round((L.grip - 1) * 100)}% grip`,
  weight: (L) => `-${Math.round((1 - L.mass) * 100)}% weight (faster, nimbler)`,
  air: (L) => `+${Math.round((L.rot - 1) * 100)}% flip and spin speed`,
};
const STATS = [['speed', 'Top speed'], ['accel', 'Acceleration'], ['handling', 'Handling'], ['stability', 'Stability'], ['suspension', 'Suspension']];

export class UI {
  constructor(settings) {
    this.settings = settings;
    this.screen = 'loading';
    this.prev = 'home';
    this.handlers = {};
    this.selSection = null;
    this.hudTimer = 0;
    this.trackCache = new Map();
    this.settingsTab = 'Graphics';
    this.trackFilter = 'All';
    this.garageCat = null;
    this.gView = null;           // vehicle being looked at in the garage
    this.shopTab = 'Vehicles';
    this.shopSel = null;         // { slot, id }
    this.shopUpVehicle = null;
    this.friendMsg = '';
    this.removeArm = null;
    this.regionPings = {};
    // navigation
    document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      const go = b.dataset.go;
      this.emit('click');
      $('profile-menu').hidden = true;
      if (go === 'back') this.show(this.inGame() ? 'pause' : MENUS.has(this.prev) ? this.prev : 'home');
      else this.show(go);
    }));
    $('profile-chip').addEventListener('click', (e) => { e.stopPropagation(); $('profile-menu').hidden = !$('profile-menu').hidden; this.renderProfile(); });
    document.addEventListener('click', (e) => { if (!$('profile-menu').hidden && !$('profile-menu').contains(e.target)) $('profile-menu').hidden = true; });
    $('logout-btn').addEventListener('click', () => { $('profile-menu').hidden = true; this.emit('logout'); });
    $('region-chip').addEventListener('click', () => { this.settingsTab = 'Online'; this.show('settings'); });
    $('dock-setup').addEventListener('click', () => this.show('play'));
    $('play-btn').addEventListener('click', () => this.onPlay());
    $('play-confirm').addEventListener('click', () => this.show('home'));
    $('settings-back').addEventListener('click', () => this.show(this.settingsReturn || 'home'));
    $('p-resume').addEventListener('click', () => this.emit('resume'));
    $('p-restart').addEventListener('click', () => this.emit('restart'));
    $('p-reset').addEventListener('click', () => this.emit('resetVehicle'));
    $('p-camera').addEventListener('click', () => this.emit('camera'));
    $('p-settings').addEventListener('click', () => { this.settingsReturn = 'pause'; this.show('settings'); });
    $('p-controls').addEventListener('click', () => this.show('controls'));
    $('p-menu').addEventListener('click', () => this.emit('mainMenu'));
    $('r-menu').addEventListener('click', () => this.emit('mainMenu'));
    $('r-again').addEventListener('click', () => this.emit('restart'));
    // friends screen
    let st = null;
    $('friend-search').addEventListener('input', () => { clearTimeout(st); st = setTimeout(() => this.searchFriends(), 280); });
    $('friend-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.addFriend(); });
    $('friend-add').addEventListener('click', () => this.addFriend());
    // HUD
    this.minimap = $('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.sctx = $('speedo').getContext('2d');
  }

  on(name, f) { (this.handlers[name] = this.handlers[name] || []).push(f); }
  emit(name, arg) { (this.handlers[name] || []).forEach((f) => f(arg)); }
  inGame() { return this.game && this.game.state === 'running' && this.game.mode !== 'menu' && this.game.mode !== 'none'; }
  inParty() { return !!(this.net && this.net.party); }

  show(name) {
    if (name === 'menu' || name === 'mp') name = 'home';
    if (name === 'settings') this.settingsReturn = this.screen === 'pause' ? 'pause' : (this.screen === 'settings' ? this.settingsReturn : (MENUS.has(this.screen) ? this.screen : 'home'));
    if (name !== this.screen && MENUS.has(this.screen)) this.prev = this.screen;
    this.screen = name;
    for (const s of SCREENS) $(s).hidden = s !== name;
    const menu = MENUS.has(name) && this.settingsReturn !== 'pause' || (MENUS.has(name) && name !== 'settings' && name !== 'controls');
    const showTop = MENUS.has(name) && !this.inGame();
    $('topbar').hidden = !showTop;
    void menu;
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('sel', b.dataset.go === NAV[name]));
    if (name === 'pause') $('pause').hidden = false;
    if (name === 'home') this.renderHome();
    if (name === 'play') this.renderPlay();
    if (name === 'garage') { this.gView = null; this.renderGarage(); }
    if (name === 'shop') this.renderShop();
    if (name === 'casino' && this.casino) this.casino.show();
    if (name === 'friends') { this.renderFriends(); if (this.social) this.social.refresh(); }
    if (name === 'settings') this.renderSettings();
    this.renderTop();
    this.emit('screen', name);
    this.syncStage();
  }

  showLoading(text) {
    $('loading-text').textContent = text;
    if (this.screen !== 'loading') { for (const s of SCREENS) $(s).hidden = s !== 'loading'; $('topbar').hidden = true; this.screen = 'loading'; }
  }
  hideLoading() { $('loading').hidden = true; if (this.screen === 'loading') this.screen = 'none'; }

  // ------------------------------------------------------------- top bar
  renderTop() {
    const A = this.account;
    $('top-coins').textContent = A ? A.coins.toLocaleString() : '0';
    $('profile-name').textContent = A && A.profile ? A.profile.name : 'Rider';
    $('profile-mode').textContent = !A ? '' : A.mode === 'online' ? '' : A.mode === 'guest' ? 'guest' : 'offline';
    const n = this.social ? this.social.data.incoming.length + this.social.data.invites.length : 0;
    $('friends-badge').hidden = !n; $('friends-badge').textContent = n;
    this.renderRegionChip();
  }

  renderRegionChip() {
    const net = this.net;
    const dot = $('region-chip').querySelector('.dot');
    let text = 'Offline', cls = 'bad';
    if (net) {
      const reg = net.region;
      const ping = net.connected ? net.ping : (reg ? this.regionPings[reg.id] : null);
      if (reg) text = reg.name + (ping != null ? ` · ${ping} ms` : net.connected ? '' : ' · checking');
      if (ping != null) cls = ping < 90 ? 'good' : ping < 170 ? 'ok' : 'bad';
      else if (reg && this.regionPings[reg.id] === null) { text = reg.name + ' · waking up'; cls = 'ok'; }
      else cls = '';
    }
    $('region-text').textContent = text;
    dot.className = 'dot ' + cls;
  }

  renderProfile() {
    const A = this.account;
    if (!A || !A.profile) return;
    const s = A.profile.stats || {};
    $('profile-stats').innerHTML = `<b>${escapeHtml(A.profile.name)}</b><br>${A.mode === 'online' ? 'Online account' : A.mode === 'guest' ? 'Guest - progress saved in this browser' : 'Offline account (this computer)'}<br>Laps <b>${s.laps || 0}</b> &bull; Wins <b>${s.wins || 0}</b> &bull; Tricks <b>${s.tricks || 0}</b>`;
    $('logout-btn').textContent = A.mode === 'guest' ? 'Log in / create account' : 'Log out';
  }

  // what the 3D stage should show for the current screen
  syncStage() {
    const st = this.stage;
    if (!st) return;
    const S = this.settings;
    if (this.screen === 'garage') {
      const v = this.gView || S.get('vehicle');
      st.setLineup([{ key: 'view', vehicleId: v, colorId: v === S.get('vehicle') ? S.get('color') : 'stock', gearId: S.get('gear') || 'match', name: '' }]);
      st.setView('focus', 'view'); st.screenShift = 0;
    } else if (this.screen === 'shop') {
      const sel = this.shopSel;
      let v = S.get('vehicle'), c = S.get('color'), g = S.get('gear') || 'match';
      if (sel && sel.slot === 'vehicle') { v = sel.id; c = 'stock'; }
      if (sel && sel.slot === 'color') c = sel.id;
      if (sel && sel.slot === 'gear') g = sel.id;
      if (sel && sel.slot === 'bundle') { const b = getBundle(sel.id); if (b) { c = b.color; g = b.gear; } }
      if (sel && sel.slot === 'upgrade') v = shopItem('upgrade', sel.id).vehicle, c = v === S.get('vehicle') ? c : 'stock';
      st.setLineup([{ key: 'view', vehicleId: v, colorId: c, gearId: g, name: '' }]);
      st.setView('focus', 'view'); st.screenShift = window.innerWidth > 820 ? 0.17 : 0;
    } else {
      st.setLineup(this.lineup());
      st.setView('lobby'); st.screenShift = 0;
    }
    st.showTags = this.screen === 'home';
  }

  // party members (or just you) for the lobby stage
  lineup() {
    const S = this.settings, net = this.net, A = this.account;
    const myName = A && A.profile ? A.profile.name : S.get('playerName') || 'You';
    if (net && net.party) {
      const P = net.party;
      const me = P.members.find((m) => m.id === net.id);
      const others = P.members.filter((m) => m.id !== net.id);
      return [me, ...others].filter(Boolean).map((m) => ({
        key: 'p' + m.id, vehicleId: m.vehicle, colorId: m.color, gearId: m.gear || 'match', name: m.id === net.id ? myName : m.name,
        ready: m.id === P.leader ? undefined : !!m.ready, away: !m.connected, leader: m.id === P.leader, me: m.id === net.id, ping: m.id === net.id ? net.ping : m.ping, number: m.number,
      }));
    }
    return [{ key: 'me', vehicleId: S.get('vehicle'), colorId: S.get('color'), gearId: S.get('gear') || 'match', name: myName, me: true }];
  }

  // ------------------------------------------------------------- lobby
  renderHome() {
    if (this.screen !== 'home') { this.syncStage(); return; }
    const net = this.net, S = this.settings;
    const P = net && net.party;
    $('party-solo').hidden = !!P;
    $('party-in').hidden = !P;
    const stEl = $('party-status');
    if (P) {
      const live = P.members.filter((m) => m.connected).length;
      stEl.textContent = P.session ? 'In session' : `${live}/8 riders`;
      stEl.className = 'status ok';
      $('party-codeshow').textContent = P.code;
      $('party-members').innerHTML = P.members.map((m) => {
        const v = getVehicle(m.vehicle), col = paintFor(m.vehicle, m.color);
        const tags = [];
        if (m.id === P.leader) tags.push('<span class="pill leader">LEADER</span>');
        else if (!m.connected) tags.push('<span class="pill gone">AWAY</span>');
        else tags.push(m.ready ? '<span class="pill ready">READY</span>' : '<span class="pill">NOT READY</span>');
        const ping = m.id === net.id ? net.ping : m.ping;
        return `<li class="${m.id === net.id ? 'me' : ''}"><span class="who"><i class="pdot" style="background:${hex(col.body)}"></i><span><b>${escapeHtml(m.name)}</b>${m.id === net.id ? ' <small style="display:inline">(you)</small>' : ''}<small>${v.name}${ping != null ? ' &bull; ' + ping + ' ms' : ''}</small></span></span>${tags.join('')}</li>`;
      }).join('');
    } else {
      stEl.textContent = net && net.connected ? 'Solo · online' : 'Solo';
      stEl.className = 'status';
    }
    // dock: mode + track, and what the big button does
    const mode = P ? P.settings.mode : S.get('mode');
    const track = P ? P.settings.track : S.get('track');
    $('dock-mode').textContent = modeName(mode) + (mode === 'race' ? ` · ${P ? P.settings.laps : S.get('laps')} laps` : mode === 'freestyle' ? ` · ${fsLabel(P ? P.settings.laps : S.get('freestyleTime'))}` : '');
    $('dock-track').textContent = getTrack(track).name;
    const btn = $('play-btn'), note = $('dock-note');
    btn.classList.remove('ready');
    btn.disabled = false;
    if (!P) { btn.textContent = 'PLAY'; note.textContent = ''; }
    else if (P.session && !net.isLeader()) { btn.textContent = 'JOIN'; note.textContent = `${modeName(P.session.mode)} in progress - jump in`; }
    else if (net.isLeader()) {
      const others = P.members.filter((m) => m.id !== net.id && m.connected);
      const ready = others.filter((m) => m.ready).length;
      btn.textContent = 'START';
      note.textContent = others.length ? `${ready}/${others.length} ready${ready < others.length ? ' - you can start anyway' : ''}` : 'Invite friends or share the code - or start on your own';
    } else {
      const me = net.me();
      btn.textContent = me && me.ready ? 'READY ✓' : 'READY UP';
      if (me && me.ready) btn.classList.add('ready');
      note.textContent = 'The party leader picks the mode and starts';
    }
    this.renderFriendsMini();
    this.syncStage();
  }

  onPlay() {
    const net = this.net;
    if (net && net.party) {
      const P = net.party;
      if (P.session && !net.isLeader()) return net.rejoin();
      if (net.isLeader()) return net.start();
      return net.toggleReady();
    }
    this.emit('startMode', this.playOptions());
  }

  renderFriendsMini() {
    const el = $('friends-mini');
    if (!el) return;
    const So = this.social;
    if (!So || !So.available) { el.innerHTML = '<li class="empty">Log in with an online account to see friends.</li>'; return; }
    const on = So.online();
    if (!on.length) { el.innerHTML = `<li class="empty">${So.data.friends.length ? 'No friends online right now.' : 'No friends yet - add some!'}</li>`; return; }
    el.innerHTML = on.slice(0, 8).map((f) => `<li><span class="who"><i class="pdot ${f.status === 'menu' ? 'online' : f.status}"></i><span><b>${escapeHtml(f.name)}</b><small>${statusText(f)}</small></span></span><button class="small" data-inv="${escapeHtml(f.name)}">Invite</button></li>`).join('');
    el.querySelectorAll('[data-inv]').forEach((b) => b.onclick = () => this.inviteFriend(b.dataset.inv, b));
  }

  // ------------------------------------------------------------- match setup
  renderPlay() {
    const S = this.settings, net = this.net;
    const P = net && net.party;
    const canEdit = !P || net.isLeader();
    const mode = P ? P.settings.mode : S.get('mode');
    const track = P ? P.settings.track : S.get('track');
    $('play-who').textContent = P ? (canEdit ? 'You are the party leader - this is what everyone rides' : 'The party leader chooses - you can look') : 'Solo';
    $('mode-cards').innerHTML = MODES.map((m) => `<button class="mode ${m.id === mode ? 'sel' : ''}" data-mode="${m.id}" ${!canEdit || (P && !m.party) ? 'disabled' : ''}><b>${m.name}</b><span>${m.desc}${P && !m.party ? '<br><i>Solo only</i>' : ''}</span></button>`).join('');
    $('mode-cards').querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => this.setMatch({ mode: b.dataset.mode }));
    const filters = ['All', ...DIFFICULTY_ORDER];
    $('track-filter').innerHTML = filters.map((f) => `<button class="${f === this.trackFilter ? 'sel' : ''}" data-f="${f}">${f}</button>`).join('');
    $('track-filter').querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { this.trackFilter = b.dataset.f; this.renderPlay(); });
    const grid = $('track-grid');
    grid.innerHTML = '';
    for (const def of TRACKS) {
      if (this.trackFilter !== 'All' && def.difficulty !== this.trackFilter) continue;
      const T = this.track(def.id);
      const b = document.createElement('button');
      b.className = 'track-card' + (def.id === track ? ' sel' : '');
      b.disabled = !canEdit;
      const c = document.createElement('canvas');
      c.width = c.height = 148;
      this.drawTrack(c.getContext('2d'), T, 148, null);
      b.appendChild(c);
      const d = document.createElement('div');
      const jumps = T.features.filter((f) => !['whoops', 'rollers'].includes(f.type)).length;
      const rec = mode === 'freestyle' ? `Best ${(S.bestScore(def.id) || 0).toLocaleString()} pts` : `Best lap ${fmtTime(S.bestLap(def.id, S.get('vehicle')))}`;
      const recs = (def.recommend || []).map((c) => `<span class="rec">${{ 'Dirt Bikes': 'BIKE', Quads: 'QUAD', 'Side-by-Sides': 'UTV', Buggies: 'BUGGY' }[c]}</span>`).join('');
      d.innerHTML = `<b>${def.name}</b><span class="diff ${def.difficulty}">${def.difficulty.toUpperCase()}</span>${recs}<p>${(T.L / 1000).toFixed(2)} km &bull; ${jumps} jumps</p><p>${rec}</p>`;
      d.title = def.desc;
      b.appendChild(d);
      b.onclick = () => this.setMatch({ track: def.id });
      grid.appendChild(b);
    }
    // options for the chosen mode
    const o = $('mode-options');
    let html = '';
    const sel = (id, label, opts, cur) => `<label class="field">${label} <select id="${id}" ${canEdit ? '' : 'disabled'}>${opts.map(([v, n]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
    if (mode === 'race') {
      html += sel('opt-laps', 'Laps', [1, 2, 3, 5, 8].map((n) => [n, n]), P ? P.settings.laps : S.get('laps'));
      if (!P) {
        html += sel('opt-ai', 'AI riders', [1, 2, 3, 4, 5, 6, 7].map((n) => [n, n]), S.get('aiCount'));
        html += sel('opt-skill', 'AI skill', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], S.get('aiSkill'));
      }
    }
    if (mode === 'timetrial' && P) html += sel('opt-laps', 'Session length (laps for the leaderboard)', [1, 2, 3, 5, 8].map((n) => [n, n]), P.settings.laps);
    if (mode === 'timetrial' && !P) html += `<span class="hint">Personal best on this track: <b>${fmtTime(S.bestLap(track, S.get('vehicle')))}</b></span>`;
    if (mode === 'freestyle') html += sel('opt-fs', 'Time limit', (P ? [1, 2, 3, 5] : [0, 1, 2, 3, 5]).map((n) => [n, fsLabel(n)]), P ? P.settings.laps : S.get('freestyleTime'));
    if (mode === 'freestyle') html += `<span class="hint">Tip: the Freestyle Compound is built for this, but every track has air.</span>`;
    if (mode === 'practice') {
      const T = this.track(track);
      if (!this.selSection || !T.sections.find((s) => s.name === this.selSection)) this.selSection = T.sections[1] ? T.sections[1].name : T.sections[0].name;
      html += `<div class="sections">${T.sections.map((s) => `<button data-sec="${escapeHtml(s.name)}" class="${s.name === this.selSection ? 'sel' : ''}">${escapeHtml(s.name)} <small>${fmtTime(S.bestSection(track, S.get('vehicle'), s.name))}</small></button>`).join('')}</div>`;
    }
    if (mode === 'freeride') html += '<span class="hint">No timer. Explore the track, practise jumps, try tricks.</span>';
    o.innerHTML = html;
    const on = (id, f) => { const e = $(id); if (e) e.onchange = (ev) => f(ev.target.value); };
    on('opt-laps', (v) => this.setMatch({ laps: Number(v) }));
    on('opt-fs', (v) => this.setMatch({ laps: Number(v), freestyleTime: Number(v) }));
    on('opt-ai', (v) => S.set('aiCount', Number(v)));
    on('opt-skill', (v) => S.set('aiSkill', v));
    o.querySelectorAll('[data-sec]').forEach((b) => b.addEventListener('click', () => { this.selSection = b.dataset.sec; this.renderPlay(); }));
    $('play-confirm').textContent = canEdit ? 'Done' : 'Back';
  }

  // change mode / track / laps - the party's if you lead one, your own otherwise
  setMatch(ch) {
    const S = this.settings, net = this.net;
    if (net && net.party) {
      if (!net.isLeader()) return;
      const cur = net.party.settings;
      const next = { track: ch.track || cur.track, mode: ch.mode || cur.mode, laps: ch.laps || cur.laps };
      if (ch.mode === 'freestyle' && !ch.laps) next.laps = Math.max(1, Math.min(5, S.get('freestyleTime') || 2));
      if (ch.mode === 'race' && !ch.laps && cur.mode === 'freestyle') next.laps = S.get('laps');
      net.sendSettings(next);
      Object.assign(net.party.settings, next); // show it straight away
    } else {
      if (ch.mode) S.set('mode', ch.mode);
      if (ch.track) S.set('track', ch.track);
      if (ch.laps && S.get('mode') === 'race') S.set('laps', ch.laps);
      if (ch.freestyleTime !== undefined) S.set('freestyleTime', ch.freestyleTime);
    }
    this.renderPlay();
  }

  playOptions() {
    const S = this.settings;
    return { mode: S.get('mode'), trackId: S.get('track'), vehicleId: S.get('vehicle'), colorId: S.get('color'), gearId: S.get('gear') || 'match', laps: S.get('laps'), aiCount: S.get('aiCount'), section: this.selSection || this.defaultSection(S.get('track')), freestyleTime: S.get('freestyleTime') };
  }
  defaultSection(track) { const T = this.track(track); return T.sections[1] ? T.sections[1].name : T.sections[0].name; }

  track(id) {
    if (!this.trackCache.has(id)) this.trackCache.set(id, buildTrack(getTrack(id)));
    return this.trackCache.get(id);
  }

  // ------------------------------------------------------------- garage
  // look, compare, choose. Locked things are shown with what they cost and
  // a button that takes you to them in the shop.
  renderGarage() {
    const S = this.settings, A = this.account;
    const owns = (slot, id) => !A || A.owns(slot, id);
    const cur = S.get('vehicle');
    const view = this.gView || cur;
    const vv = getVehicle(view);
    if (!this.garageCat) this.garageCat = getVehicle(cur).category;
    $('garage-cats').innerHTML = CATEGORIES.map((c) => `<button class="${c === this.garageCat ? 'sel' : ''}" data-cat="${c}">${c}</button>`).join('');
    $('garage-cats').querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { this.garageCat = b.dataset.cat; this.renderGarage(); });
    const list = $('garage-vehicles');
    list.innerHTML = '';
    const ownedHere = VEHICLES.filter((x) => x.category === this.garageCat && owns('vehicle', x.id));
    if (!ownedHere.length) list.innerHTML = '<p class="hint">You have none of these yet - get one in the Shop.</p>';
    for (const v of ownedHere) {
      const own = true;
      const b = document.createElement('button');
      b.className = 'vcard' + (v.id === view ? ' sel' : '') + (own ? '' : ' locked');
      b.style.setProperty('--swatch', hex(paintFor(v.id, 'stock').body));
      const tag = v.id === cur ? '<span class="tag on">RIDING</span>' : own ? '<span class="tag">OWNED</span>' : `<span class="tag lock">${shopItem('vehicle', v.id).price.toLocaleString()}</span>`;
      b.innerHTML = `<b>${v.name}</b>${tag}<small>${v.tier} &bull; ${v.category.replace(/ies$/, 'y').replace(/s$/, '')}</small>`;
      b.onclick = () => { this.gView = v.id; this.renderGarage(); this.syncStage(); };
      list.appendChild(b);
    }
    // details
    const tierEl = $('g-tier');
    tierEl.textContent = `${vv.tier} · ${vv.category.replace(/ies$/, 'y').replace(/s$/, '')}`;
    tierEl.className = 'tier ' + vv.tier;
    $('g-name').textContent = vv.name;
    $('g-desc').textContent = vv.desc;
    const ups = A && A.profile ? upgradeLevels(A.profile.owned, view) : {};
    const base = getVehicle(cur);
    const curUps = A && A.profile ? upgradeLevels(A.profile.owned, cur) : {};
    const rated = (v, u) => { const o = { ...v.stats }; for (const [p, L] of Object.entries(u)) for (const [k, d] of Object.entries(UP_STAT[p])) o[k] = Math.min(10, o[k] + d * L); return o; };
    const mine = rated(base, curUps), shown = rated(vv, ups);
    $('g-stats').innerHTML = STATS.map(([k, n]) => {
      const b0 = vv.stats[k], b1 = shown[k];
      const diff = view !== cur ? Math.round((b1 - mine[k]) * 10) / 10 : 0;
      const d = diff ? `<em class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : ''}${diff}</em>` : '';
      return `<div class="stat"><div class="lbl"><span>${n}</span><span>${d} ${b1.toFixed(1).replace(/\.0$/, '')}</span></div><div class="bar"><i style="width:${b0 * 10}%"></i>${b1 > b0 ? `<i class="plus" style="width:${(b1 - b0) * 10}%"></i>` : ''}</div></div>`;
    }).join('') + (view !== cur ? `<p class="hint">Green / red numbers compare it with the ${escapeHtml(base.name)} you ride now.</p>` : '');
    // upgrades for this vehicle: level pips and a button to buy the next level
    const coins = A ? A.coins : 0;
    $('g-ups').innerHTML = owns('vehicle', view) ? '<h4>Upgrades</h4>' + Object.entries(UPGRADES).map(([p, U]) => {
      const lvl = ups[p] || 0, max = U.levels.length, next = lvl < max ? U.levels[lvl] : null;
      const pips = U.levels.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      const btn = next ? `<button class="small ${coins >= next.price ? 'primary' : ''}" data-up="${view}.${p}.${lvl + 1}" ${coins >= next.price ? '' : 'disabled'}><i class="coin"></i>${next.price.toLocaleString()}</button>` : '<span class="maxed">MAX</span>';
      return `<div class="uprow"><span class="upname">${U.name}<small>${next ? UP_TEXT[p](next) : 'Fully upgraded'}</small></span><span class="pips">${pips}</span>${btn}</div>`;
    }).join('') : '';
    $('g-ups').querySelectorAll('[data-up]').forEach((b) => b.onclick = async () => {
      b.disabled = true;
      const e = await A.buy('upgrade', b.dataset.up);
      if (e) this.popup(escapeHtml(e), 'bad'); else this.popup('Upgrade installed', 'good');
      this.renderGarage(); this.renderTop();
    });
    // paint + gear (owned ones apply straight away; locked ones go to the shop)
    const ownV = owns('vehicle', view);
    const sw = (el, items, slot, colorsOf, nameOf, curId) => {
      el.innerHTML = '';
      for (const it of items) {
        const own = owns(slot, it.id);
        if (!own) continue; // the garage only shows what you own
        const b = document.createElement('button');
        const [c1, c2] = colorsOf(it);
        b.className = 'swatch' + (it.id === curId ? ' sel' : '') + (own ? '' : ' locked');
        b.title = nameOf(it) + (own ? '' : ` - ${shopItem(slot, it.id).price.toLocaleString()} coins in the shop`);
        b.style.background = `linear-gradient(135deg, ${hex(c1)} 55%, ${hex(c2)} 55%)`;
        b.onclick = async () => {
          if (!own) { this.openShop(slot === 'color' ? 'Paint' : 'Rider Gear', { slot, id: it.id }); return; }
          if (A) await A.equip(slot, it.id);
          S.set(slot, it.id);
          this.renderGarage(); this.syncStage(); this.renderTop();
          this.emit('garageChange');
        };
        el.appendChild(b);
      }
    };
    const paintItems = [{ id: 'stock', name: 'Factory colours' }, ...BIKE_COLORS];
    sw($('g-paint'), paintItems, 'color', (c) => { const p = paintFor(view, c.id); return [p.body, p.accent]; }, (c) => c.name, view === cur ? S.get('color') : 'stock');
    const paint = paintFor(cur, S.get('color'));
    // bundle kits show once you own them (they wear their skin's colours)
    const kitCols = (g) => { const k = BIKE_COLORS.find((c) => c.id === g.skin); return k ? [k.body, k.accent] : [paint.gear[0], paint.gear[2]]; };
    const gearItems = GEAR_SETS.filter((g) => !g.skin || (A && A.owns('gear', g.id)));
    sw($('g-gear'), gearItems, 'gear', (g) => (g.skin ? kitCols(g) : g.colors ? [g.colors[0], g.colors[2]] : [paint.gear[0], paint.gear[2]]), (g) => g.name, S.get('gear') || 'match');
    // combos: a bundle you own puts the skin and its rider kit on together
    const combos = BUNDLES.filter((b) => owns('color', b.color) && owns('gear', b.gear));
    const ce = $('g-combo');
    ce.innerHTML = combos.length ? '' : '<span class="hint">Bundles in the Shop give you matching combos. You can still mix any bike skin with any rider skin below.</span>';
    for (const b of combos) {
      const k = BIKE_COLORS.find((c) => c.id === b.color);
      const btn = document.createElement('button');
      btn.className = 'swatch combo' + (S.get('color') === b.color && S.get('gear') === b.gear ? ' sel' : '');
      btn.title = b.name.replace(/ Bundle$/, '') + ' combo';
      btn.style.background = `linear-gradient(135deg, ${hex(k.body)} 40%, ${hex(k.accent)} 40%, ${hex(k.accent)} 60%, ${hex(k.gear[0])} 60%)`;
      btn.onclick = async () => {
        if (A) { await A.equip('color', b.color); await A.equip('gear', b.gear); }
        S.set('color', b.color); S.set('gear', b.gear);
        this.renderGarage(); this.syncStage(); this.renderTop();
        this.emit('garageChange');
      };
      ce.appendChild(btn);
    }
    ce.style.opacity = $('g-paint').style.opacity = view === cur ? '' : '0.45';
    ce.style.pointerEvents = $('g-paint').style.pointerEvents = view === cur ? '' : 'none';
    const act = $('g-action');
    if (view === cur) act.innerHTML = '<button disabled class="wide">Riding this one</button>';
    else if (ownV) act.innerHTML = `<button id="g-choose" class="primary wide">Ride the ${escapeHtml(vv.name)}</button>`;
    else act.innerHTML = `<button id="g-shop" class="primary wide">Unlock in the shop - ${shopItem('vehicle', view).price.toLocaleString()} coins</button>`;
    act.innerHTML += '<button id="g-shopmore" class="wide">More vehicles and skins in the Shop</button>';
    if ($('g-choose')) $('g-choose').onclick = async () => {
      if (A) await A.equip('vehicle', view);
      S.set('vehicle', view);
      this.gView = null;
      this.renderGarage(); this.syncStage();
      this.emit('garageChange');
      this.popup(`Now riding the <b>${escapeHtml(vv.name)}</b>`, 'good');
    };
    if ($('g-shop')) $('g-shop').onclick = () => this.openShop('Vehicles', { slot: 'vehicle', id: view });
    if ($('g-shopmore')) $('g-shopmore').onclick = () => this.show('shop');
  }

  // ------------------------------------------------------------- shop
  openShop(tab, sel) { this.shopTab = tab; this.shopSel = sel; this.show('shop'); }

  // Item shop, laid out like a battle-royale store: FEATURED (big cards) and
  // DAILY rotate every day at midnight UTC (the same for everyone), then
  // BROWSE has every vehicle, skin, gear set and upgrade.
  renderShop() {
    const R = shopRotation();
    const left = Math.max(0, R.endsAt - Date.now());
    const mm = String(Math.floor(left / 60000)).padStart(2, '0'), ss = String(Math.floor(left / 1000) % 60).padStart(2, '0');
    const grid = $('shop-grid');
    grid.innerHTML = `<div class="shop-head"><div><h2>Item Shop</h2><small>Skins and gear are only here while they are in the shop. Vehicles are always for sale.</small></div><div class="reset">NEW ITEMS IN <b id="shop-timer">${mm}:${ss}</b></div></div>
      <h3 class="fsec">Featured</h3><div class="fgrid featured">${R.featured.map((x) => this.shopCard(x, true)).join('')}</div>
      <h3 class="fsec">Bundles <small class="fsec-note">bike skin + matching rider kit, 25% off</small></h3><div class="fgrid">${BUNDLES.map((b) => this.bundleCard(b)).join('')}</div>
      <h3 class="fsec">Daily</h3><div class="fgrid">${R.daily.map((x) => this.shopCard(x)).join('')}</div>
      <h3 class="fsec">Vehicles</h3><div class="fgrid">${VEHICLES.map((v) => this.shopCard({ slot: 'vehicle', id: v.id })).join('')}</div>`;
    $('shop-tabs').innerHTML = ''; $('shop-sub').innerHTML = '';
    grid.querySelectorAll('.fcard').forEach((b) => b.onclick = () => { this.shopSel = { slot: b.dataset.slot, id: b.dataset.id }; grid.querySelectorAll('.fcard.sel').forEach((x) => x.classList.remove('sel')); grid.querySelectorAll(`.fcard[data-slot="${b.dataset.slot}"][data-id="${b.dataset.id}"]`).forEach((x) => x.classList.add('sel')); this.renderShopDetail(); this.syncStage(); });
    // count down, and swap the items when the hour turns over
    clearInterval(this.shopTick);
    this.shopTick = setInterval(() => {
      if (this.screen !== 'shop') { clearInterval(this.shopTick); return; }
      const l = Math.max(0, shopRotation().endsAt - Date.now());
      if (shopRotation().slot !== R.slot) { this.shopSel = null; const y = grid.scrollTop; this.renderShop(); grid.scrollTop = y; this.popup('The item shop has new items!', 'good'); return; }
      const t = $('shop-timer'); if (t) t.textContent = String(Math.floor(l / 60000)).padStart(2, '0') + ':' + String(Math.floor(l / 1000) % 60).padStart(2, '0');
    }, 1000);
    this.renderShopDetail();
  }

  // a bundle card: the bike in the skin with the rider in the matching kit
  bundleCard(b) {
    const S = this.settings, A = this.account;
    const owns = (s, i) => !A || A.owns(s, i);
    const own = owns('color', b.color) && owns('gear', b.gear);
    const price = bundlePrice(b, owns);
    const img = this.thumbs && this.thumbs.get(S.get('vehicle'), b.color, b.gear);
    const sel = this.shopSel && this.shopSel.slot === 'bundle' && this.shopSel.id === b.id;
    return `<button class="fcard bundle ${b.rarity}${sel ? ' sel' : ''}${own ? ' is-owned' : ''}" data-slot="bundle" data-id="${b.id}">
      <span class="rar">Bundle</span>${img ? `<img src="${img}" alt="">` : '<span class="loading-img"></span>'}
      <span class="fname"><b>${escapeHtml(b.name)}</b><small>Skin + rider kit</small><span class="fprice">${own ? '<span class="owned">OWNED</span>' : `<s>${b.full.toLocaleString()}</s> <i class="coin"></i>${price.toLocaleString()}`}</span></span></button>`;
  }

  // one shop card: rarity colours, a rendered picture, name and price
  shopCard(x, big = false) {
    const S = this.settings, A = this.account;
    const it = shopItem(x.slot, x.id);
    if (!it) return '';
    const own = !A || A.owns(x.slot, x.id);
    const rar = rarityOf(it);
    let name = '', type = '', img = null, badge = '';
    if (x.slot === 'vehicle') { const v = getVehicle(x.id); name = v.name; type = v.tier + ' ' + v.category.replace(/ies$/, 'y').replace(/s$/, ''); img = this.thumbs && this.thumbs.get(x.id, 'stock'); }
    if (x.slot === 'color') { const c = BIKE_COLORS.find((q) => q.id === x.id); name = c.name; type = c.pattern ? 'Skin' : 'Paint'; img = this.thumbs && this.thumbs.get(S.get('vehicle'), x.id, S.get('gear') || 'match'); }
    if (x.slot === 'gear') { const g = GEAR_SETS.find((q) => q.id === x.id); name = g.name; type = 'Rider Gear'; img = this.thumbs && this.thumbs.get(S.get('vehicle'), S.get('color'), x.id); }
    if (x.slot === 'upgrade') { const U = UPGRADES[it.part]; name = U.name + ' ' + it.level; type = getVehicle(it.vehicle).name; badge = `<span class="big-l">L${it.level}</span>`; }
    const need = x.slot === 'upgrade' && !own ? upgradeNeeds(it).find((n) => { const [s2, i2] = n.split(':'); return A && !A.owns(s2, i2); }) : null;
    const price = own ? '<span class="owned">OWNED</span>' : need ? `<span class="need">${need.startsWith('vehicle') ? 'Needs vehicle' : 'Needs L' + (it.level - 1)}</span>` : `<i class="coin"></i>${it.price.toLocaleString()}`;
    const sel = this.shopSel && this.shopSel.slot === x.slot && this.shopSel.id === x.id;
    return `<button class="fcard ${rar}${big ? ' big' : ''}${sel ? ' sel' : ''}${own ? ' is-owned' : ''}" data-slot="${x.slot}" data-id="${x.id}">
      <span class="rar">${rar}</span>${img ? `<img src="${img}" alt="">` : badge || '<span class="loading-img"></span>'}
      <span class="fname"><b>${escapeHtml(name)}</b><small>${escapeHtml(type)}</small><span class="fprice">${price}</span></span></button>`;
  }

  renderShopDetail() {
    const el = $('shop-detail'), A = this.account, S = this.settings;
    const sel = this.shopSel;
    const coins = A ? A.coins : 0;
    if (!sel) {
      el.innerHTML = `<h3>Shop</h3><p class="hint">Pick something to see it on your vehicle. Coins come from riding: laps, records, races, big air and tricks.</p><div class="price-big"><i class="coin"></i>${coins.toLocaleString()}</div>`;
      return;
    }
    if (sel.slot === 'bundle') return this.renderBundleDetail(getBundle(sel.id));
    const it = shopItem(sel.slot, sel.id);
    const own = !A || A.owns(sel.slot, sel.id);
    let title = '', body = '';
    if (sel.slot === 'vehicle') { const v = getVehicle(sel.id); title = v.name; body = `<p class="desc">${v.desc}</p>` + STATS.map(([k, n]) => `<div class="stat"><div class="lbl"><span>${n}</span><span>${v.stats[k]}</span></div><div class="bar"><i style="width:${v.stats[k] * 10}%"></i></div></div>`).join(''); }
    if (sel.slot === 'color') { const c = BIKE_COLORS.find((x) => x.id === sel.id); title = c.name + (c.pattern ? ' skin' : ' paint'); body = '<p class="desc">Works on every vehicle you own, with matching rider kit when your gear is set to Team Kit.</p>'; }
    if (sel.slot === 'gear') { const g = GEAR_SETS.find((x) => x.id === sel.id); title = g.name + ' gear'; body = '<p class="desc">Jersey, pants and gloves for your rider.</p>'; }
    if (sel.slot === 'upgrade') { const U = UPGRADES[it.part]; title = `${getVehicle(it.vehicle).name}: ${U.name} level ${it.level}`; body = `<p class="desc">${UP_TEXT[it.part](U.levels[it.level - 1])}. Only for this vehicle. Upgrades stack - each level replaces the one below.</p>`; }
    let need = null;
    if (sel.slot === 'upgrade' && !own) need = upgradeNeeds(it).find((n) => { const [s2, i2] = n.split(':'); return A && !A.owns(s2, i2); });
    const can = !own && !need && coins >= it.price;
    let btn;
    if (own) {
      const equipped = sel.slot === 'upgrade' || S.get(sel.slot) === sel.id;
      btn = equipped ? '<button class="wide" disabled>Owned</button>' : '<button id="shop-equip" class="primary wide">Use it now</button>';
    } else if (need) btn = `<button class="wide" disabled>${need.startsWith('vehicle') ? 'Buy the vehicle first' : 'Buy level ' + (it.level - 1) + ' first'}</button>`;
    else if (!inShop(sel.slot, sel.id)) btn = '<button class="wide" disabled>Not in the shop right now</button>';
    else btn = `<button id="shop-buy" class="primary wide" ${can ? '' : 'disabled'}>${can ? 'Buy for ' + it.price.toLocaleString() + ' coins' : 'Need ' + (it.price - coins).toLocaleString() + ' more coins'}</button>`;
    el.innerHTML = `<h2>${escapeHtml(title)}</h2>${body}${own ? '' : `<div class="price-big"><i class="coin"></i>${it.price.toLocaleString()}</div>`}${btn}<div class="lock-note">You have ${coins.toLocaleString()} coins.</div><div class="error" id="shop-err"></div>`;
    const buy = $('shop-buy');
    if (buy) buy.onclick = async () => {
      buy.disabled = true;
      const e = await A.buy(sel.slot, sel.id);
      if (e) { $('shop-err').textContent = e; buy.disabled = false; return; }
      if (sel.slot !== 'upgrade') S.set(sel.slot, sel.id);
      this.popup(`Unlocked <b>${escapeHtml(title)}</b>${sel.slot === 'upgrade' ? '' : ' - equipped'}`, 'good');
      this.emit('garageChange');
      this.renderShop(); this.renderTop(); this.syncStage();
    };
    const eq = $('shop-equip');
    if (eq) eq.onclick = async () => { if (A) await A.equip(sel.slot, sel.id); S.set(sel.slot, sel.id); this.emit('garageChange'); this.renderShop(); this.syncStage(); };
  }

  renderBundleDetail(b) {
    const el = $('shop-detail'), A = this.account, S = this.settings;
    const coins = A ? A.coins : 0;
    const owns = (s, i) => !A || A.owns(s, i);
    const skin = BIKE_COLORS.find((c) => c.id === b.color), kit = GEAR_SETS.find((g) => g.id === b.gear);
    const own = owns('color', b.color) && owns('gear', b.gear), price = bundlePrice(b, owns);
    const using = S.get('color') === b.color && S.get('gear') === b.gear;
    const row = (name, has) => `<li>${escapeHtml(name)}${has ? ' <span class="owned">OWNED</span>' : ''}</li>`;
    const btn = own ? (using ? '<button class="wide" disabled>Owned - in use</button>' : '<button id="shop-equip" class="primary wide">Use both now</button>')
      : `<button id="shop-buy" class="primary wide" ${coins >= price ? '' : 'disabled'}>${coins >= price ? 'Buy bundle for ' + price.toLocaleString() + ' coins' : 'Need ' + (price - coins).toLocaleString() + ' more coins'}</button>`;
    el.innerHTML = `<h2>${escapeHtml(b.name)}</h2><p class="desc">The ${escapeHtml(skin.name)} skin for every vehicle you own, and the ${escapeHtml(kit.name)}: jersey, pants and helmet in the same pattern. The kit is only sold in this bundle.</p>
      <ul class="bundle-list">${row(skin.name + ' skin', owns('color', b.color))}${row(kit.name, owns('gear', b.gear))}</ul>
      ${own ? '' : `<div class="price-big"><s>${b.full.toLocaleString()}</s> <i class="coin"></i>${price.toLocaleString()}</div>`}${btn}<div class="lock-note">You have ${coins.toLocaleString()} coins.</div><div class="error" id="shop-err"></div>`;
    const done = () => { this.emit('garageChange'); this.renderShop(); this.renderTop(); this.syncStage(); };
    const buy = $('shop-buy');
    if (buy) buy.onclick = async () => {
      buy.disabled = true;
      const e = await A.buyBundle(b.id);
      if (e) { $('shop-err').textContent = e; buy.disabled = false; return; }
      S.set('color', b.color); S.set('gear', b.gear);
      this.popup(`Unlocked <b>${escapeHtml(b.name)}</b> - equipped`, 'good');
      done();
    };
    const eq = $('shop-equip');
    if (eq) eq.onclick = async () => { if (A) { await A.equip('color', b.color); await A.equip('gear', b.gear); } S.set('color', b.color); S.set('gear', b.gear); done(); };
  }

  // ------------------------------------------------------------- friends
  renderFriends() {
    const So = this.social, A = this.account;
    const off = !So || !So.available;
    $('friends-off').hidden = !off;
    $('friends-on').hidden = off;
    if (off) {
      $('friends-off').innerHTML = `Friends need an <b>online account</b> on the game server${A && A.mode === 'guest' ? ' - you are playing as a guest' : A && A.mode === 'offline' ? ' - this account only lives on this computer because the server could not be reached when it was made' : ''}.<div class="row"><button id="friends-login" class="primary">Log in / create account</button></div>`;
      $('friends-login').onclick = () => this.emit('logout');
      return;
    }
    const D = So.data;
    $('friends-count').textContent = `${D.friends.length}/${D.max || 100} friends · ${So.online().length} online`;
    const msg = $('friend-msg');
    msg.textContent = this.friendMsg || So.error || '';
    msg.className = 'msg' + (this.friendBad || So.error ? ' bad' : '');
    const fl = $('friend-list');
    fl.innerHTML = D.friends.length ? D.friends.map((f) => {
      const canJoin = f.code && f.status !== 'menu' && !(this.net && this.net.code === f.code);
      return `<li><span class="who"><i class="pdot ${f.online ? (f.status === 'menu' ? 'online' : f.status) : ''}"></i><span><b>${escapeHtml(f.name)}</b><small>${statusText(f)}</small></span></span><span class="acts">
        ${canJoin ? `<button data-join="${escapeHtml(f.name)}" class="primary">Join</button>` : ''}
        <button data-inv="${escapeHtml(f.name)}" ${f.online ? '' : 'disabled title="Offline"'}>Invite</button>
        <button data-rem="${escapeHtml(f.name)}" class="danger">${this.removeArm === f.name ? 'Sure?' : 'Remove'}</button></span></li>`;
    }).join('') : '<li class="empty">No friends yet. Search for a rider name above.</li>';
    fl.querySelectorAll('[data-inv]').forEach((b) => b.onclick = () => this.inviteFriend(b.dataset.inv, b));
    fl.querySelectorAll('[data-join]').forEach((b) => b.onclick = () => { const f = D.friends.find((x) => x.name === b.dataset.join); if (f) this.emit('joinParty', { code: f.code, region: f.region, from: f.name }); });
    fl.querySelectorAll('[data-rem]').forEach((b) => b.onclick = async () => {
      const n = b.dataset.rem;
      if (this.removeArm !== n) { this.removeArm = n; this.renderFriends(); setTimeout(() => { if (this.removeArm === n) { this.removeArm = null; this.renderFriends(); } }, 3000); return; }
      this.removeArm = null;
      this.result(await So.remove(n));
    });
    const il = $('invite-list');
    il.innerHTML = D.invites.length ? D.invites.map((i) => `<li><span class="who"><span><b>${escapeHtml(i.from)}</b><small>Party ${i.code} &bull; ${ago(Date.now() - i.at)}</small></span></span><span class="acts"><button class="primary" data-ij="${i.code}" data-from="${escapeHtml(i.from)}">Join</button><button data-ix="${i.code}" data-from="${escapeHtml(i.from)}">Dismiss</button></span></li>`).join('') : '<li class="empty">No invites.</li>';
    il.querySelectorAll('[data-ij]').forEach((b) => b.onclick = () => { const inv = D.invites.find((x) => x.code === b.dataset.ij && x.from === b.dataset.from); if (inv) { this.emit('joinParty', { code: inv.code, region: inv.region, from: inv.from }); So.dismiss(inv); } });
    il.querySelectorAll('[data-ix]').forEach((b) => b.onclick = () => { const inv = D.invites.find((x) => x.code === b.dataset.ix && x.from === b.dataset.from); if (inv) So.dismiss(inv); });
    const rl = $('request-list');
    const reqs = D.incoming.map((r) => `<li><span class="who"><span><b>${escapeHtml(r.name)}</b><small>wants to be friends</small></span></span><span class="acts"><button class="primary" data-acc="${escapeHtml(r.name)}">Accept</button><button data-dec="${escapeHtml(r.name)}">Decline</button></span></li>`)
      .concat(D.outgoing.map((r) => `<li><span class="who"><span><b>${escapeHtml(r.name)}</b><small>request sent</small></span></span><span class="acts"><button data-can="${escapeHtml(r.name)}">Cancel</button></span></li>`));
    rl.innerHTML = reqs.length ? reqs.join('') : '<li class="empty">No requests.</li>';
    rl.querySelectorAll('[data-acc]').forEach((b) => b.onclick = async () => this.result(await So.accept(b.dataset.acc)));
    rl.querySelectorAll('[data-dec]').forEach((b) => b.onclick = async () => this.result(await So.decline(b.dataset.dec)));
    rl.querySelectorAll('[data-can]').forEach((b) => b.onclick = async () => this.result(await So.cancel(b.dataset.can)));
  }

  result(r) {
    this.friendMsg = r.error || r.ok || '';
    this.friendBad = !!r.error;
    if (this.screen === 'friends') { this.renderFriends(); this.searchFriends(); }
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => { this.friendMsg = ''; if (this.screen === 'friends') this.renderFriends(); }, 4000);
  }

  async searchFriends() {
    const q = $('friend-search').value.trim();
    const out = $('friend-results');
    if (q.length < 2 || !this.social) { out.innerHTML = ''; return; }
    const r = await this.social.search(q);
    if (r.error) { out.innerHTML = `<li class="empty">${escapeHtml(r.error)}</li>`; return; }
    out.innerHTML = r.results.length ? r.results.map((x) => {
      const act = x.you ? '<span class="pill">YOU</span>' : x.friend ? '<span class="pill ready">FRIENDS</span>' : x.sent ? '<span class="pill">REQUESTED</span>' : x.received ? `<button class="primary" data-acc="${escapeHtml(x.name)}">Accept</button>` : `<button data-add="${escapeHtml(x.name)}">Add</button>`;
      return `<li><span class="who"><i class="pdot ${x.online ? 'online' : ''}"></i><b>${escapeHtml(x.name)}</b></span>${act}</li>`;
    }).join('') : `<li class="empty">No rider called "${escapeHtml(q)}"</li>`;
    out.querySelectorAll('[data-add]').forEach((b) => b.onclick = async () => this.result(await this.social.request(b.dataset.add)));
    out.querySelectorAll('[data-acc]').forEach((b) => b.onclick = async () => this.result(await this.social.accept(b.dataset.acc)));
  }

  async addFriend() {
    const q = $('friend-search').value.trim();
    if (!q) { this.result({ error: 'Type a rider name first' }); return; }
    this.result(await this.social.request(q));
  }

  // invite: makes a party first if you are not in one
  async inviteFriend(name, btn) {
    if (btn) btn.disabled = true;
    const net = this.net;
    const code = net.code || await net.createParty();
    if (!code) { this.popup('Could not make a party - the server is not reachable', 'bad'); if (btn) btn.disabled = false; return; }
    const r = await this.social.invite(name, code, net.region ? net.region.id : null);
    this.popup(r.error ? escapeHtml(r.error) : `Invite sent to <b>${escapeHtml(name)}</b>`, r.error ? 'bad' : 'good');
    if (btn) { btn.textContent = r.error ? 'Invite' : 'Sent'; setTimeout(() => { btn.disabled = false; btn.textContent = 'Invite'; }, 3000); }
  }

  // ------------------------------------------------------------- popups
  popup(html, kind = '', actions = null, time = 4) {
    const box = $('popups');
    const el = document.createElement('div');
    el.className = 'popup ' + kind;
    el.innerHTML = html;
    if (actions) {
      const row = document.createElement('div');
      row.className = 'row';
      for (const [label, f, primary] of actions) {
        const b = document.createElement('button');
        b.className = 'small' + (primary ? ' primary' : '');
        b.textContent = label;
        b.onclick = () => { el.remove(); f(); };
        row.appendChild(b);
      }
      el.appendChild(row);
    }
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    if (time) setTimeout(() => el.remove(), time * 1000);
    return el;
  }

  // ------------------------------------------------------------- account
  showAccount() {
    this.show('account');
    let mode = 'login';
    const setMode = (m) => {
      mode = m;
      $('acct-tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.acct === m));
      $('acct-go').textContent = m === 'login' ? 'Log in' : 'Create account';
      $('acct-pass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
      $('acct-error').textContent = '';
    };
    $('acct-tabs').querySelectorAll('button').forEach((b) => (b.onclick = () => setMode(b.dataset.acct)));
    const last = this.account.expiredName || this.account.lastName;
    if (last && !$('acct-name').value) $('acct-name').value = last;
    const go = async () => {
      const name = $('acct-name').value.trim(), pw = $('acct-pass').value;
      if (!name || !pw) { $('acct-error').textContent = 'Type a name and a password'; return; }
      $('acct-go').disabled = true;
      const err = mode === 'login' ? await this.account.login(name, pw) : await this.account.register(name, pw);
      $('acct-go').disabled = false;
      if (err) { $('acct-error').textContent = err; return; }
      $('acct-pass').value = '';
      this.emit('loggedIn');
    };
    $('acct-go').onclick = go;
    $('acct-pass').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    $('acct-guest').onclick = () => { this.account.guest(); this.emit('loggedIn'); };
    $('acct-note').textContent = 'Your account keeps your coins, vehicles, upgrades and friends, on every device. Guests save in this browser only and can not use friends.';
    setMode('login');
  }

  // ------------------------------------------------------------- maps
  drawTrack(ctx, T, size, riders) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < T.n; i += 8) { x0 = Math.min(x0, T.xs[i]); x1 = Math.max(x1, T.xs[i]); z0 = Math.min(z0, T.zs[i]); z1 = Math.max(z1, T.zs[i]); }
    const sc = (size * 0.82) / Math.max(x1 - x0, z1 - z0);
    const ox = size / 2 - ((x0 + x1) / 2) * sc, oz = size / 2 - ((z0 + z1) / 2) * sc;
    ctx.clearRect(0, 0, size, size);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= T.n; i += 4) { const k = i % T.n; const x = T.xs[k] * sc + ox, y = T.zs[k] * sc + oz; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(4, size / 22); ctx.stroke();
    ctx.strokeStyle = '#c79a62'; ctx.lineWidth = Math.max(2, size / 40); ctx.stroke();
    const f = Math.floor(T.finishS / T.step);
    ctx.fillStyle = '#fff';
    ctx.fillRect(T.xs[f] * sc + ox - 3, T.zs[f] * sc + oz - 3, 6, 6);
    void riders;
    return { sc, ox, oz };
  }

  // the minimap background: dark disc, the track as a dirt ribbon with
  // direction chevrons and a chequered finish line. Drawn once per track at
  // 2x pixels; drawMinimap() puts the riders on top every frame.
  buildMinimap(T) {
    this.mapT = T;
    const c = document.createElement('canvas');
    c.width = c.height = 400;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < T.n; i += 8) { x0 = Math.min(x0, T.xs[i]); x1 = Math.max(x1, T.xs[i]); z0 = Math.min(z0, T.zs[i]); z1 = Math.max(z1, T.zs[i]); }
    const sc = 140 / Math.max(x1 - x0, z1 - z0); // 140 px square fits inside the 200 px disc
    const ox = 100 - ((x0 + x1) / 2) * sc, oz = 100 - ((z0 + z1) / 2) * sc;
    const px = (k) => T.xs[k] * sc + ox, py = (k) => T.zs[k] * sc + oz;
    // disc
    const bg = ctx.createRadialGradient(100, 90, 10, 100, 100, 100);
    bg.addColorStop(0, 'rgba(32, 38, 50, 0.86)'); bg.addColorStop(1, 'rgba(8, 10, 15, 0.9)');
    ctx.beginPath(); ctx.arc(100, 100, 99, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; ctx.lineWidth = 1;
    for (const r of [33, 66]) { ctx.beginPath(); ctx.arc(100, 100, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(100, 0); ctx.lineTo(100, 200); ctx.moveTo(0, 100); ctx.lineTo(200, 100); ctx.stroke();
    // track ribbon: shadow, edge, surface, centre line
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= T.n; i += 2) { const k = i % T.n; i ? ctx.lineTo(px(k), py(k)) : ctx.moveTo(px(k), py(k)); }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'; ctx.lineWidth = 13; ctx.stroke();
    ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = '#d8ad74'; ctx.lineWidth = 6.5; ctx.stroke();
    ctx.setLineDash([3, 5]); ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    // which way the track runs
    const step = Math.max(8, Math.floor(T.n / 7));
    const f = Math.floor(T.finishS / T.step) % T.n;
    ctx.fillStyle = 'rgba(70, 45, 20, 0.85)';
    for (let i = step; i < T.n - step / 2; i += step) {
      const k = (f + i) % T.n, k2 = (k + 3) % T.n;
      const a = Math.atan2(py(k2) - py(k), px(k2) - px(k));
      ctx.save(); ctx.translate(px(k), py(k)); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(2.5, 0); ctx.lineTo(-2, -2.6); ctx.lineTo(-0.8, 0); ctx.lineTo(-2, 2.6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // chequered finish line across the track
    const f2 = (f + 3) % T.n;
    const fa = Math.atan2(py(f2) - py(f), px(f2) - px(f));
    ctx.save(); ctx.translate(px(f), py(f)); ctx.rotate(fa);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; ctx.fillRect(-2.6, -6.6, 5.2, 13.2);
    for (let r = 0; r < 2; r++) for (let q = 0; q < 6; q++) { ctx.fillStyle = (r + q) % 2 ? '#111' : '#fff'; ctx.fillRect(-2 + r * 2, -6 + q * 2, 2, 2); }
    ctx.restore();
    ctx.restore();
    // rim
    ctx.beginPath(); ctx.arc(100, 100, 98.5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(100, 100, 95, -Math.PI * 0.75, -Math.PI * 0.25); ctx.strokeStyle = 'rgba(255, 90, 31, 0.7)'; ctx.lineWidth = 2; ctx.stroke();
    this.mapXf = { sc, ox, oz };
    this.mapBg = c;
  }

  // ------------------------------------------------------------- settings
  renderSettings() {
    const S = this.settings;
    const tabs = ['Graphics', 'Audio', 'Camera & Controls', 'Riding Assists', 'Online'];
    $('settings-tabs').innerHTML = tabs.map((t) => `<button class="${t === this.settingsTab ? 'sel' : ''}" data-tab="${t}">${t}</button>`).join('');
    $('settings-tabs').querySelectorAll('button').forEach((b) => b.onclick = () => { this.settingsTab = b.dataset.tab; this.renderSettings(); });
    const body = $('settings-body');
    const rows = [];
    const seg = (key, label, opts) => rows.push(`<div class="setting"><span>${label}</span><div class="seg">${opts.map(([v, n]) => `<button data-key="${key}" data-val="${v}" class="${String(S.get(key)) === String(v) ? 'sel' : ''}">${n}</button>`).join('')}</div><span class="val"></span></div>`);
    const range = (key, label, min, max, step, fmt = (x) => x) => rows.push(`<div class="setting"><span>${label}</span><input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${S.get(key)}"><span class="val" data-val-for="${key}">${fmt(S.get(key))}</span></div>`);
    const pct = (x) => Math.round(x * 100) + '%';
    if (this.settingsTab === 'Graphics') {
      rows.push(`<div class="setting"><span>Quality preset</span><div class="seg">${['low', 'medium', 'high'].map((p) => `<button data-preset="${p}" class="${S.get('preset') === p ? 'sel' : ''}">${p}</button>`).join('')}<button disabled class="${S.get('preset') === 'custom' ? 'sel' : ''}">custom</button></div><span class="val"></span></div>`);
      seg('shadows', 'Shadows', [['off', 'Off'], ['low', 'Low'], ['high', 'High']]);
      range('resolution', 'Resolution scale', 0.5, 1, 0.05, pct);
      range('viewDistance', 'View distance', 400, 1200, 20, (x) => x + ' m');
      range('grass', 'Grass density', 0, 20, 1, (x) => (x ? x : 'off'));
      range('particles', 'Dust and particles', 0, 1, 0.05, pct);
      seg('detail', 'Scenery detail', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]);
      seg('tireMarks', 'Tyre marks', [[true, 'On'], [false, 'Off']]);
      seg('autoQuality', 'Auto-lower effects when FPS drops', [[true, 'On'], [false, 'Off']]);
      seg('showFps', 'FPS counter', [[true, 'On'], [false, 'Off']]);
      rows.push(`<div class="setting"><span>Display</span><div class="seg"><button id="fullscreen-btn">${document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'}</button></div><span class="val"></span></div>`);
    } else if (this.settingsTab === 'Audio') {
      range('masterVolume', 'Master volume', 0, 1, 0.05, pct);
      range('engineVolume', 'Engine volume', 0, 1, 0.05, pct);
      range('effectsVolume', 'Effects volume', 0, 1, 0.05, pct);
    } else if (this.settingsTab === 'Camera & Controls') {
      seg('camera', 'Default camera', CAMERA_MODES.map((m, i) => [i, m]));
      range('cameraSensitivity', 'Camera follow speed', 0.4, 2, 0.05, (x) => x.toFixed(2) + 'x');
      range('mouseSensitivity', 'Mouse look sensitivity', 0.2, 3, 0.1, (x) => x.toFixed(1) + 'x');
      range('cameraShake', 'Camera shake', 0, 1.5, 0.05, pct);
      seg('screenEffects', 'Speed effects (FOV, landing dip)', [[true, 'On'], [false, 'Off']]);
    } else if (this.settingsTab === 'Riding Assists') {
      range('landingAssist', 'Landing assist (auto-level in the air)', 0, 1, 0.05, (x) => (x > 0 ? pct(x) : 'off'));
      seg('tractionAssist', 'Traction control', [[true, 'On'], [false, 'Off']]);
      seg('wheelieAssist', 'Wheelie / stoppie control', [[true, 'On'], [false, 'Off']]);
      rows.push(`<p class="hint">Assists only help you ride - they never change the track or other riders. Turn them off for full control (and more crashes).</p>`);
    } else {
      this.renderOnline(rows);
    }
    body.innerHTML = rows.join('');
    body.querySelectorAll('[data-preset]').forEach((b) => b.onclick = () => { S.applyPreset(b.dataset.preset); this.emit('quality'); this.renderSettings(); });
    body.querySelectorAll('.seg button[data-key]').forEach((b) => b.onclick = () => {
      let v = b.dataset.val;
      if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(Number(v)) && b.dataset.key === 'camera') v = Number(v);
      S.set(b.dataset.key, v);
      if (['shadows', 'detail', 'tireMarks'].includes(b.dataset.key)) this.emit('quality');
      this.renderSettings();
    });
    body.querySelectorAll('input[type=range]').forEach((inp) => {
      inp.oninput = () => {
        const k = inp.dataset.key, v = Number(inp.value);
        S.set(k, v);
        const lbl = body.querySelector(`[data-val-for="${k}"]`);
        if (lbl) lbl.textContent = { masterVolume: 1, engineVolume: 1, effectsVolume: 1, resolution: 1, particles: 1, cameraShake: 1, landingAssist: 1 }[k] ? Math.round(v * 100) + '%' : k === 'viewDistance' ? v + ' m' : String(v);
      };
      inp.onchange = () => { if (['resolution', 'viewDistance', 'grass', 'particles'].includes(inp.dataset.key)) this.emit('quality'); };
    });
    const fs = $('fullscreen-btn');
    if (fs) fs.onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); setTimeout(() => this.renderSettings(), 300); };
    body.querySelectorAll('[data-region]').forEach((b) => b.onclick = () => { this.emit('region', b.dataset.region); this.renderSettings(); });
    const save = $('srv-save');
    if (save) save.onclick = () => { const v = $('srv-input').value.trim(); if (v) { setServerBase(v); location.reload(); } };
    const reset = $('srv-reset');
    if (reset) reset.onclick = () => { setServerBase(''); location.reload(); };
    const rp = $('region-ping');
    if (rp) rp.onclick = () => this.emit('pingRegions');
  }

  // Settings > Online: pick a server region (auto = lowest ping)
  renderOnline(rows) {
    const S = this.settings, net = this.net;
    const regs = regionList();
    const chosen = S.get('region') || 'auto';
    const p = (id) => (this.regionPings[id] === undefined ? 'checking...' : this.regionPings[id] === null ? 'asleep / unreachable' : this.regionPings[id] + ' ms');
    rows.push('<h4>Server region</h4><p class="hint">Parties are hosted in the region you pick. Auto chooses the one with the lowest ping. A party code works from any region - the game finds it.</p>');
    rows.push(`<div class="region-list"><button class="region ${chosen === 'auto' ? 'sel' : ''}" data-region="auto"><span><b>Auto (lowest ping)</b><br><small>${net && net.region ? 'Using ' + escapeHtml(net.region.name) : ''}</small></span><span></span></button>` +
      regs.map((r) => `<button class="region ${chosen === r.id ? 'sel' : ''}" data-region="${r.id}"><span><b>${escapeHtml(r.name)}</b><br><small>${escapeHtml(r.place)}</small></span><span class="ping ${pingCls(this.regionPings[r.id])}">${p(r.id)}</span></button>`).join('') + '</div>');
    rows.push(`<div class="row"><button id="region-ping" class="small">Measure ping again</button><span class="hint">${net && net.connected ? 'Connected' + (net.ping != null ? ` · ${net.ping} ms` : '') : 'Not connected - the game connects when you make or join a party'}</span></div>`);
    rows.push(`<h4>Custom server</h4><p class="hint">For your own server (Play.bat on this computer or on your Wi-Fi). Everyone in a party must use the same one. Accounts live on the server: ${escapeHtml(serverBase().replace(/^https?:\/\//, ''))}</p>
      <div class="server-box"><input id="srv-input" placeholder="e.g. 192.168.1.20:5323" value="${escapeHtml(customServer())}" spellcheck="false"> <button id="srv-save" class="small">Use this server</button> <button id="srv-reset" class="small">Default</button></div>`);
    if (regs.length === 1 && regs[0].id !== 'local') rows.push('<p class="hint">Only one region is online right now. More regions appear here once they are added to the server list.</p>');
  }

  // ------------------------------------------------------------- HUD
  showHud(game) {
    for (const s of SCREENS) $(s).hidden = true;
    $('topbar').hidden = true;
    this.screen = 'hud';
    $('hud').hidden = false;
    const mp = !!(game.opts && game.opts.mp);
    const ranked = game.mode === 'race' || (mp && game.mode !== 'freeride');
    $('hud-pos').hidden = !ranked;
    $('hud-standings').hidden = !ranked;
    $('hud-board').hidden = !ranked;
    $('hud-center').textContent = '';
    $('hud-trick').textContent = '';
    $('trick-pop').innerHTML = '';
    $('name-tags').innerHTML = ''; this.nameTagEls = new Map();
    $('toasts').innerHTML = '';
    $('hud-hint').innerHTML = game.mode === 'freestyle' ? 'Q/E flip &nbsp; A/D whip &nbsp; Shift+A/D spin &nbsp; Y restart' : 'R reset &nbsp; C camera &nbsp; Esc pause';
    if (this.stage) this.stage.hideTags();
  }
  hideHud() { $('hud').hidden = true; }

  // a landed trick: name, landing grade, points and combo
  trickPopup(e, pts, combo, mult) {
    const el = $('trick-pop');
    el.innerHTML = `<div class="tp"><div class="tp-name">${escapeHtml(e.name)}</div><div class="tp-land ${e.landing}">${e.wheelie ? 'ON ONE WHEEL' : e.landing.toUpperCase() + ' LANDING'}</div><div class="tp-pts">+${pts.toLocaleString()}</div>${combo > 1 ? `<div class="combo">COMBO x${combo} &bull; ${mult.toFixed(1)}x points</div>` : ''}</div>`;
  }

  updateHud(game, dt) {
    const S = this.settings;
    $('hud-fps').hidden = !S.get('showFps');
    if (S.get('showFps')) $('hud-fps').textContent = `${Math.round(game.fps || 0)} FPS`;
    if ($('hud').hidden) return;
    const p = game.player;
    if (!p || !p.veh) return;
    const v = p.veh;
    // ground speed (not falling speed), smoothed so the number does not flicker
    const ground = Math.hypot(v.vel.x, v.vel.z) * 2.237;
    this.mphS = this.mphS === undefined ? ground : this.mphS + (ground - this.mphS) * 0.25;
    this.rpmS = this.rpmS === undefined ? v.engine.rpm : this.rpmS + (v.engine.rpm - this.rpmS) * Math.min(1, dt * 18);
    this.drawSpeedo(v, game.raceTime || 0);
    // what you are doing in the air right now
    const tr = v.controller && v.controller.trick;
    const wr = v.controller && v.controller.wheelieUp ? v.controller.wheelieRun || 0 : 0;
    $('hud-trick').textContent = !v.grounded && tr ? liveTrick(tr) : wr > 0.6 ? `WHEELIE ${wr.toFixed(1)} s` : '';
    const c = $('hud-center');
    if (game.phase === 'countdown') {
      const n = Math.ceil(game.countdown - 1);
      const wait = game.opts && game.opts.mp && game.opts.mp.waiting;
      c.classList.toggle('small', !!wait || n > 3);
      c.textContent = wait ? 'Waiting for riders...' : n > 3 ? 'Get ready' : n > 0 ? String(n) : '';
    } else if (c.textContent && game.phase === 'go' && game.raceTime > 1) c.textContent = '';
    this.drawMinimap(game);
    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.1;
    const L = p.lap;
    const now = game.raceTime;
    const mode = game.mode;
    const best = S.bestLap(game.trackId, p.vehicleId);
    if (mode === 'freeride') {
      const sec = game.world.T.sections.find((x) => v.trackS >= x.s0 && v.trackS < x.s1);
      $('hud-lap').textContent = 'FREE RIDE';
      $('hud-time').textContent = sec ? sec.name : '';
      $('hud-sub').innerHTML = `Lap ${L.laps}${L.lastLap ? ' &bull; last ' + fmtTime(L.lastLap) : ''}${game.trickScore ? `<br>Tricks ${game.trickScore.toLocaleString()} pts` : ''}`;
    } else if (mode === 'freestyle') {
      const F = game.fs;
      const left = F.limit ? Math.max(0, F.limit - (game.phase === 'go' ? now : 0)) : null;
      $('hud-lap').textContent = 'FREESTYLE';
      $('hud-time').textContent = (game.trickScore || 0).toLocaleString() + ' pts';
      $('hud-sub').innerHTML = `${left != null ? `Time left <b>${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</b>` : 'No time limit'}${game.combo > 1 ? `<br>Combo x${game.combo}` : ''}<br>Best ${(F.best || 0).toLocaleString()}`;
    } else if (mode === 'practice') {
      const P = game.practice;
      $('hud-lap').textContent = 'PRACTICE: ' + P.sec.name.toUpperCase();
      $('hud-time').textContent = P.timing !== null ? fmtTime(now - P.timing) : P.last !== null ? fmtTime(P.last) : '0:00.000';
      $('hud-sub').innerHTML = `Best ${fmtTime(P.best)} &bull; Y retry`;
    } else {
      const total = mode === 'race' ? game.laps : null;
      const cur = Math.min(L.laps + 1, total || 99);
      $('hud-lap').textContent = mode === 'race' ? `LAP ${cur}/${total}` : L.lapStart === null ? 'OUT LAP' : `LAP ${L.laps + 1}`;
      const t = L.currentLapTime(now);
      $('hud-time').textContent = mode === 'race' ? fmtTime(game.phase === 'countdown' ? 0 : now) : fmtTime(t || 0);
      $('hud-sub').innerHTML = `Lap ${fmtTime(t)}<br>Last ${fmtTime(L.lastLap)}<br>Best ${fmtTime(L.bestLap)}${mode === 'timetrial' ? '<br>Record ' + fmtTime(best) : ''}`;
    }
    if (!$('hud-pos').hidden) {
      const st = game.net && game.net.standings ? game.net.orderedRiders(game) : game.standings();
      const me = st.indexOf(p) + 1;
      $('hud-pos').innerHTML = `P${me}<small>/${st.length}</small>`;
      const score = (r) => (mode === 'freestyle' && game.net ? ' ' + ((game.net.standings || []).find((x) => x.id === r.id) || {}).score || '' : '');
      $('hud-standings').innerHTML = st.slice(0, 8).map((r, i) => `<li class="${r === p ? 'me' : ''}">${i + 1}. ${escapeHtml(r.name)}${r.finished ? ' &#127937;' : ''}${score(r)}</li>`).join('');
    }
    const net = $('hud-net');
    if (game.net && game.net.connected !== undefined) {
      net.hidden = false;
      const ping = game.net.ping;
      net.innerHTML = `<span>Party ${game.net.code || ''}</span><span class="ping ${pingCls(ping)}">${game.net.connected ? (ping != null ? ping + ' ms' : 'online') : 'reconnecting...'}</span>`;
    } else net.hidden = true;
  }

  // small name tags above everyone else on the track (fade with distance)
  updateNameTags(game) {
    const box = $('name-tags');
    if (!box || $('hud').hidden) return;
    const cam = game.R.camera, w = window.innerWidth, h = window.innerHeight;
    const tags = this.nameTagEls || (this.nameTagEls = new Map());
    const seen = new Set();
    for (const r of game.riders) {
      if (r.isPlayer || !r.vis.root.visible) continue;
      const p = r.vis.root.position;
      const d = cam.position.distanceTo(p);
      if (d > 160) continue;
      _tv.set(p.x, p.y + (r.vis.cfg.type === 'car' ? 2.0 : 1.75), p.z).project(cam);
      if (_tv.z > 1 || Math.abs(_tv.x) > 1.2 || Math.abs(_tv.y) > 1.2) continue;
      let el = tags.get(r.key);
      if (!el) {
        el = document.createElement('div');
        el.className = 'ntag' + (r.remote ? ' friend' : '');
        const st = staffTags(r.name);
        if (st) el.classList.add('staff');
        el.innerHTML = `${st}<i>${r.number || ''}</i>${escapeHtml(r.name)}`;
        box.appendChild(el);
        tags.set(r.key, el);
      }
      seen.add(r.key);
      el.style.display = '';
      el.style.opacity = String(Math.max(0, Math.min(1, (160 - d) / 80)));
      el.style.transform = `translate(${((_tv.x + 1) / 2) * w}px, ${((1 - _tv.y) / 2) * h}px) translate(-50%, -100%)`;
    }
    for (const [k, el] of tags) if (!seen.has(k)) { if (!game.riders.some((r) => r.key === k)) { el.remove(); tags.delete(k); } else el.style.display = 'none'; }
  }

  drawMinimap(game) {
    const ctx = this.mctx, T = this.mapT;
    if (!T || !this.mapBg) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 400, 400);
    ctx.drawImage(this.mapBg, 0, 0);
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    const { sc, ox, oz } = this.mapXf;
    ctx.save();
    ctx.beginPath(); ctx.arc(100, 100, 97, 0, Math.PI * 2); ctx.clip();
    let me = null;
    for (const r of game.riders) {
      if (r.isPlayer) { me = r; continue; }
      const pos = r.vis.root.position;
      ctx.beginPath();
      ctx.arc(pos.x * sc + ox, pos.z * sc + oz, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = r.remote ? '#60a5fa' : '#e5e7eb';
      ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'; ctx.stroke();
    }
    // you: a gold arrow pointing the way you face, with a soft pulse
    if (me) {
      const pos = me.vis.root.position, x = pos.x * sc + ox, y = pos.z * sc + oz;
      const fw = me.veh && me.veh.fwd;
      const a = fw && (fw.x || fw.z) ? Math.atan2(fw.z, fw.x) : 0;
      const pulse = (performance.now() % 1400) / 1400;
      ctx.beginPath(); ctx.arc(x, y, 5 + pulse * 9, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 210, 63, ${0.35 * (1 - pulse)})`; ctx.fill();
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4.5, -5); ctx.lineTo(-2, 0); ctx.lineTo(-4.5, 5); ctx.closePath();
      ctx.fillStyle = '#ffd23f'; ctx.fill();
      ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)'; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // speedometer: a 270 degree rev dial (ticks per 1000 rpm, red zone, floating
  // needle), shift lights across the top, speed in the middle, gear box below
  drawSpeedo(v, t) {
    const ctx = this.sctx;
    const ec = v.cfg.engine, e = v.engine;
    const cx = 120, cy = 120;
    const maxRpm = Math.ceil((ec.redline * 1.03) / 1000) * 1000;
    const A0 = Math.PI * 0.75, SW = Math.PI * 1.5;
    const ang = (rpm) => A0 + SW * Math.max(0, Math.min(1, rpm / maxRpm));
    const rpm = this.rpmS || 0, frac = rpm / ec.redline;
    const font = (w, px) => `${w} ${px}px Bahnschrift, 'DIN Alternate', 'Segoe UI', Roboto, Arial, sans-serif`;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, 240, 240);
    // face
    const bg = ctx.createRadialGradient(cx, cy - 20, 10, cx, cy, 116);
    bg.addColorStop(0, 'rgba(34, 40, 52, 0.88)'); bg.addColorStop(1, 'rgba(8, 10, 15, 0.92)');
    ctx.beginPath(); ctx.arc(cx, cy, 116, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'; ctx.stroke();
    // red zone
    ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(cx, cy, 104, ang(ec.redline), ang(maxRpm)); ctx.lineWidth = 6; ctx.strokeStyle = '#ef4444'; ctx.stroke();
    // rev bar
    ctx.beginPath(); ctx.arc(cx, cy, 94, A0, A0 + SW); ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)'; ctx.stroke();
    if (rpm > 0) {
      const hot = frac > 0.92;
      let col = hot ? '#ef4444' : '#ff5a1f';
      if (!hot && ctx.createConicGradient) {
        col = ctx.createConicGradient(A0, cx, cy);
        col.addColorStop(0, '#ff8a3d'); col.addColorStop(0.55, '#ff5a1f'); col.addColorStop(0.75, '#ef4444'); col.addColorStop(1, '#ef4444');
      }
      ctx.save(); ctx.shadowColor = hot ? 'rgba(239, 68, 68, 0.9)' : 'rgba(255, 90, 31, 0.7)'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(cx, cy, 94, A0, ang(rpm)); ctx.lineWidth = 9; ctx.strokeStyle = col; ctx.stroke();
      ctx.restore();
    }
    // ticks and numbers (x1000 rpm)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let r = 0; r <= maxRpm; r += 500) {
      const a = ang(r), major = r % 1000 === 0, red = r >= ec.redline;
      const c = Math.cos(a), s = Math.sin(a);
      const r0 = major ? 80 : 84;
      ctx.beginPath(); ctx.moveTo(cx + c * r0, cy + s * r0); ctx.lineTo(cx + c * 88, cy + s * 88);
      ctx.lineWidth = major ? 2.5 : 1.5; ctx.strokeStyle = red ? '#f87171' : major ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.35)'; ctx.stroke();
      if (major && (maxRpm <= 10000 || (r / 1000) % 2 === 0 || r === maxRpm)) {
        ctx.font = font(700, 14); ctx.fillStyle = red ? '#f87171' : 'rgba(255, 255, 255, 0.7)';
        ctx.fillText(String(r / 1000), cx + c * 68, cy + s * 68);
      }
    }
    // floating needle (stops short of the centre so the speed stays readable)
    {
      const a = ang(rpm), c = Math.cos(a), s = Math.sin(a);
      ctx.save(); ctx.shadowColor = 'rgba(255, 255, 255, 0.8)'; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo(cx + c * 56, cy + s * 56); ctx.lineTo(cx + c * 101, cy + s * 101);
      ctx.lineCap = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.restore();
    }
    // shift lights: green, yellow, red as the revs climb, all flash at the limiter
    const leds = 7, flash = e.limiter && Math.floor(t * 12) % 2 === 0;
    for (let i = 0; i < leds; i++) {
      const on = flash || (!e.limiter && frac > 0.7 + (i / leds) * 0.28);
      const col = i < 3 ? '74, 222, 128' : i < 5 ? '250, 204, 21' : '239, 68, 68';
      ctx.beginPath(); ctx.arc(cx - 30 + i * 10, 60, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = on ? `rgb(${flash ? '96, 165, 250' : col})` : 'rgba(255, 255, 255, 0.1)';
      if (on) { ctx.save(); ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8; ctx.fill(); ctx.restore(); } else ctx.fill();
    }
    // speed
    const mph = Math.round(this.mphS < 0.5 ? 0 : this.mphS);
    ctx.save(); ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'; ctx.shadowBlur = 6;
    ctx.font = font(700, 62); ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(mph), cx, cy + 22);
    ctx.restore();
    ctx.font = font(700, 13); ctx.fillStyle = '#aeb4bf'; ctx.textBaseline = 'middle';
    ctx.fillText('M P H', cx, cy + 36);
    // gear box in the gap at the bottom of the dial; lights up while shifting
    const g = e.reverse ? 'R' : e.gear === 0 ? 'N' : String(e.gear);
    const shifting = e.shift > 0;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx - 21, cy + 52, 42, 36, 8) : ctx.rect(cx - 21, cy + 52, 42, 36);
    ctx.fillStyle = shifting ? 'rgba(255, 210, 63, 0.22)' : 'rgba(255, 255, 255, 0.06)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = frac > 0.92 && !e.reverse ? '#ef4444' : 'rgba(255, 210, 63, 0.7)'; ctx.stroke();
    ctx.font = font(700, 26); ctx.fillStyle = e.reverse ? '#f87171' : '#ffd23f';
    ctx.fillText(g, cx, cy + 71);
    ctx.font = font(700, 10); ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillText('x1000 RPM', cx, cy - 44);
  }

  // admin event chip (top centre): name and time left
  setEvent(ev) {
    let el = $('event-chip');
    if (!el) { el = document.createElement('div'); el.id = 'event-chip'; document.body.appendChild(el); }
    this.eventInfo = ev;
    clearInterval(this.eventTimer);
    const draw = () => {
      const e = this.eventInfo, left = e ? e.endsAt - Date.now() : 0;
      if (!e || left <= 0) { el.hidden = true; clearInterval(this.eventTimer); return; }
      el.hidden = false;
      el.classList.toggle('riding', this.screen === 'hud');
      const s = Math.ceil(left / 1000);
      el.innerHTML = `<b>EVENT</b> ${escapeHtml(e.name)} <span>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</span>`;
      el.title = e.desc;
    };
    draw();
    if (ev) this.eventTimer = setInterval(draw, 1000);
  }

  // message from an admin, shown for 8 s over everything
  announce(a) {
    let el = $('announce');
    if (!el) { el = document.createElement('div'); el.id = 'announce'; document.body.appendChild(el); }
    el.innerHTML = `<small>ANNOUNCEMENT from ${escapeHtml(a.from)}</small>${escapeHtml(a.text)}`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this.announceT);
    this.announceT = setTimeout(() => el.classList.remove('show'), 8000);
  }

  toast(text, time = 1.6, kind = '') {
    if (this.screen !== 'hud' && this.screen !== 'pause' && this.screen !== 'results') { this.popup(escapeHtml(text), kind === 'bad' ? 'bad' : kind === 'good' || kind === 'coins' ? 'good' : '', null, time + 1); return; }
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => el.remove(), time * 1000);
  }

  togglePause(game) {
    if (this.screen === 'results') return;
    if (game.paused) this.emit('resume'); else this.emit('pause');
  }

  showPause() { $('pause').hidden = false; this.screen = 'pause'; }
  hidePause() { $('pause').hidden = true; $('settings').hidden = true; $('controls').hidden = true; this.settingsReturn = null; this.screen = 'hud'; }

  showResults(rows, game) {
    $('results').hidden = false;
    this.screen = 'results';
    const me = rows.find((r) => r.me);
    const fs = game.mode === 'freestyle';
    if (fs) {
      $('results-title').textContent = rows.length > 1 && me ? `Freestyle: ${ordinal(me.pos)} place` : `Freestyle: ${(me ? me.score : 0).toLocaleString()} points${me && me.record ? ' - NEW BEST!' : ''}`;
      $('results-table').innerHTML = `<tr><th>Pos</th><th>Rider</th><th>Vehicle</th><th>Score</th></tr>` +
        rows.map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${r.pos}</td><td>${escapeHtml(r.name)}</td><td>${r.vehicle}</td><td>${(r.score || 0).toLocaleString()}</td></tr>`).join('') +
        (rows.length === 1 && me ? `<tr><td></td><td colspan="2">Your best on this track</td><td>${Math.max(me.best || 0, me.score || 0).toLocaleString()}</td></tr>` : '');
    } else {
      $('results-title').textContent = me ? `You finished ${ordinal(me.pos)}` : 'Results';
      $('results-table').innerHTML = `<tr><th>Pos</th><th>Rider</th><th>Vehicle</th><th>Time</th><th>Best lap</th></tr>` +
        rows.map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${r.pos}</td><td>${escapeHtml(r.name)}</td><td>${r.vehicle}</td><td>${r.time != null ? fmtTime(r.time) : r.laps + ' laps'}</td><td>${fmtTime(r.best)}</td></tr>`).join('');
    }
    $('r-again').hidden = !!(game.opts && game.opts.mp && !game.net.isLeader());
  }
  hideResults() { $('results').hidden = true; }
}

function statusText(f) {
  if (!f.online) return f.lastSeen ? 'Offline · seen ' + ago(Date.now() - f.lastSeen) : 'Offline';
  if (f.status === 'riding') return `Riding ${modeName(f.mode)}${f.track ? ' · ' + getTrack(f.track).name : ''}`;
  if (f.status === 'party') return 'In a party lobby';
  return 'Online · in the menus';
}
function seeded(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
function fsLabel(n) { return n ? n + ' min' : 'No limit'; }
function pingCls(p) { return p == null ? '' : p < 90 ? 'good' : p < 170 ? 'ok' : 'bad'; }
void ordinal;
