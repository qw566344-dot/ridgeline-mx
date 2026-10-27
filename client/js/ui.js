// =====================================================================
//  UI: menus, HUD, minimap, toasts, settings screen, results.
//  Screens are plain HTML (index.html); this file wires them up.
// =====================================================================
import { TRACKS, getTrack } from '/shared/tracks.js';
import { VEHICLES, BIKE_COLORS, getVehicle, paintFor } from '/shared/vehicles.js';
import { GEAR_SETS, shopItem } from '/shared/shop.js';
import { buildTrack, sampleArr } from '/shared/trackgen.js';
import { PRESETS, fmtTime } from './settings.js';
import { CAMERA_MODES } from './camera.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['loading', 'account', 'menu', 'play', 'garage', 'tracks', 'settings', 'controls', 'credits', 'mp', 'pause', 'results'];

export class UI {
  constructor(settings) {
    this.settings = settings;
    this.screen = 'loading';
    this.prev = 'menu';
    this.handlers = {};
    this.selMode = 'freeride';
    this.selSection = null;
    this.hudTimer = 0;
    this.trackCache = new Map();
    this.toastEls = [];
    this.settingsTab = 'Graphics';
    // generic navigation buttons
    document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      const go = b.dataset.go;
      this.emit('click');
      if (go === 'back') this.show(this.prev === 'controls' ? 'menu' : this.prev);
      else this.show(go);
    }));
    document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => { this.selMode = b.dataset.mode; this.renderPlay(); }));
    $('start-mode').addEventListener('click', () => this.emit('startMode', this.playOptions()));
    $('settings-back').addEventListener('click', () => this.show(this.settingsReturn || 'menu'));
    $('p-resume').addEventListener('click', () => this.emit('resume'));
    $('p-restart').addEventListener('click', () => this.emit('restart'));
    $('p-reset').addEventListener('click', () => this.emit('resetVehicle'));
    $('p-camera').addEventListener('click', () => this.emit('camera'));
    $('p-settings').addEventListener('click', () => { this.settingsReturn = 'pause'; this.show('settings'); });
    $('p-menu').addEventListener('click', () => this.emit('mainMenu'));
    $('r-menu').addEventListener('click', () => this.emit('mainMenu'));
    $('r-again').addEventListener('click', () => this.emit('restart'));
    this.minimap = $('minimap');
    this.mctx = this.minimap.getContext('2d');
    const fg = $('tach-fg');
    this.tachLen = fg.getTotalLength ? fg.getTotalLength() : 209;
    fg.style.strokeDasharray = this.tachLen;
  }

  on(name, f) { (this.handlers[name] = this.handlers[name] || []).push(f); }
  emit(name, arg) { (this.handlers[name] || []).forEach((f) => f(arg)); }

  show(name) {
    if (name === 'shop' || name === 'garage') { this.shopMode = name === 'shop'; name = 'garage'; this.preview = null; this.shopError = ''; }
    if (name !== this.screen && !['pause', 'settings', 'controls'].includes(this.screen)) this.prev = this.screen;
    if (name === 'settings' && this.screen !== 'pause') this.settingsReturn = this.screen === 'settings' ? this.settingsReturn : this.screen;
    this.screen = name;
    for (const s of SCREENS) $(s).hidden = s !== name;
    if (name === 'menu') this.renderSummary();
    if (name === 'play') this.renderPlay();
    if (name === 'garage') this.renderGarage();
    if (name === 'tracks') this.renderTracks();
    if (name === 'settings') this.renderSettings();
    this.emit('screen', name);
  }

  showLoading(text) { $('loading-text').textContent = text; if (this.screen !== 'loading') { for (const s of SCREENS) $(s).hidden = s !== 'loading'; this.screen = 'loading'; } }
  hideLoading() { $('loading').hidden = true; if (this.screen === 'loading') this.screen = 'none'; }

  // ------------------------------------------------------------- main menu
  renderSummary() {
    const v = getVehicle(this.settings.get('vehicle'));
    const t = getTrack(this.settings.get('track'));
    const col = paintFor(this.settings.get('vehicle'), this.settings.get('color'));
    const best = this.settings.bestLap(t.id, v.id);
    const A = this.account;
    const who = A && A.profile ? `Rider: <b>${escapeHtml(A.profile.name)}</b> <small>${A.mode === 'online' ? '(online)' : A.mode === 'guest' ? '(guest)' : '(this computer)'}</small><br>Coins: <b>${A.coins.toLocaleString()}</b><br>` : '';
    $('menu-summary').innerHTML = who + `Vehicle: <b>${v.name}</b> <span style="color:#${col.body.toString(16).padStart(6, '0')}">&#9679;</span><br>Track: <b>${t.name}</b><br>Best lap: <b>${fmtTime(best)}</b>` + (A && A.profile ? '<br><button id="logout-btn" style="margin-top:8px;padding:6px 12px;font-size:13px">' + (A.mode === 'guest' ? 'Log in / Create account' : 'Log out') + '</button>' : '');
    const lo = $('logout-btn');
    if (lo) lo.onclick = () => this.emit('logout');
  }

  // ------------------------------------------------------------- play
  renderPlay() {
    document.querySelectorAll('.mode').forEach((b) => b.classList.toggle('sel', b.dataset.mode === this.selMode));
    const o = $('mode-options');
    const S = this.settings;
    const t = getTrack(S.get('track'));
    let html = `<span class="hint">Track: <b>${t.name}</b> &nbsp; Vehicle: <b>${getVehicle(S.get('vehicle')).name}</b></span>`;
    if (this.selMode === 'race') {
      html += `<label class="field">Laps <select id="opt-laps">${[1, 2, 3, 5, 8].map((n) => `<option ${n === S.get('laps') ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field">AI riders <select id="opt-ai">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${n === S.get('aiCount') ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field">AI skill <select id="opt-skill">${['easy', 'medium', 'hard'].map((n) => `<option value="${n}" ${n === S.get('aiSkill') ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
    }
    if (this.selMode === 'timetrial') {
      html += `<span class="hint">Personal best: <b>${fmtTime(S.bestLap(t.id, S.get('vehicle')))}</b></span>`;
    }
    if (this.selMode === 'practice') {
      const T = this.track(t.id);
      if (!this.selSection || !T.sections.find((s) => s.name === this.selSection)) this.selSection = T.sections[1] ? T.sections[1].name : T.sections[0].name;
      html += `<div class="sections" style="width:100%">${T.sections.map((s) => `<button data-sec="${s.name}" class="${s.name === this.selSection ? 'sel' : ''}">${s.name} <small>${fmtTime(S.bestSection(t.id, S.get('vehicle'), s.name))}</small></button>`).join('')}</div>`;
    }
    o.innerHTML = html;
    if (this.selMode === 'race') {
      $('opt-laps').onchange = (e) => S.set('laps', Number(e.target.value));
      $('opt-ai').onchange = (e) => S.set('aiCount', Number(e.target.value));
      $('opt-skill').onchange = (e) => S.set('aiSkill', e.target.value);
    }
    o.querySelectorAll('[data-sec]').forEach((b) => b.addEventListener('click', () => { this.selSection = b.dataset.sec; this.renderPlay(); }));
  }

  playOptions() {
    const S = this.settings;
    return { mode: this.selMode, trackId: S.get('track'), vehicleId: S.get('vehicle'), colorId: S.get('color'), gearId: S.get('gear') || 'match', laps: S.get('laps'), aiCount: S.get('aiCount'), section: this.selSection };
  }

  track(id) {
    if (!this.trackCache.has(id)) this.trackCache.set(id, buildTrack(getTrack(id)));
    return this.trackCache.get(id);
  }

  // ------------------------------------------------------------- garage + shop
  // Everything is listed. Items you own can be equipped with one click;
  // locked ones show their price - click to preview them in 3D, then Buy.
  renderGarage() {
    const S = this.settings, A = this.account;
    const shop = this.shopMode;
    $('garage-title').textContent = shop ? 'Shop' : 'Vehicle Selection';
    $('garage-coins').textContent = A ? A.coins.toLocaleString() : '0';
    const pv = this.preview; // { slot, id } of an item being looked at but not owned
    const cur = (slot) => (pv && pv.slot === slot ? pv.id : slot === 'vehicle' ? S.get('vehicle') : slot === 'color' ? S.get('color') : S.get('gear') || 'match');
    const owns = (slot, id) => !A || A.owns(slot, id);
    const price = (slot, id) => { const it = shopItem(slot, id); return it ? it.price : 0; };
    const pick = async (slot, id) => {
      this.shopError = '';
      if (owns(slot, id)) {
        this.preview = null;
        if (A) { const e = await A.equip(slot, id); if (e) this.shopError = e; }
        S.set(slot === 'gear' ? 'gear' : slot, id);
      } else this.preview = { slot, id };
      this.renderGarage();
      this.emit('garageChange');
    };
    const list = $('vehicle-list');
    list.innerHTML = '';
    for (const type of ['bike', 'atv']) {
      const h = document.createElement('h3');
      h.textContent = type === 'bike' ? 'Dirt bikes' : 'Quads / ATVs';
      list.appendChild(h);
      for (const v of VEHICLES.filter((x) => x.type === type)) {
        const b = document.createElement('button');
        const own = owns('vehicle', v.id);
        b.className = 'vehicle-item' + (v.id === S.get('vehicle') ? ' sel' : '') + (own ? '' : ' locked') + (pv && pv.slot === 'vehicle' && pv.id === v.id ? ' preview' : '');
        b.innerHTML = `<span>${v.name}</span><small>${own ? (type === 'bike' ? 'Bike' : 'Quad') : price('vehicle', v.id).toLocaleString() + ' coins'}</small>`;
        b.onclick = () => pick('vehicle', v.id);
        list.appendChild(b);
      }
    }
    const swatches = (el, items, slot, colorsOf, nameOf) => {
      el.innerHTML = '';
      for (const it of items) {
        const b = document.createElement('button');
        const own = owns(slot, it.id);
        const [c1, c2] = colorsOf(it);
        b.className = 'swatch' + (it.id === cur(slot) && !(pv && pv.slot === slot) ? ' sel' : '') + (own ? '' : ' locked') + (pv && pv.slot === slot && pv.id === it.id ? ' preview' : '');
        b.title = nameOf(it) + (own ? '' : ` - ${price(slot, it.id)} coins`);
        b.style.background = `linear-gradient(135deg, #${c1.toString(16).padStart(6, '0')} 55%, #${c2.toString(16).padStart(6, '0')} 55%)`;
        b.onclick = () => pick(slot, it.id);
        el.appendChild(b);
      }
    };
    swatches($('color-list'), BIKE_COLORS, 'color', (c) => [c.body, c.accent], (c) => c.name);
    const paint = BIKE_COLORS.find((c) => c.id === cur('color')) || BIKE_COLORS[0];
    swatches($('gear-list'), GEAR_SETS, 'gear', (g) => (g.colors ? [g.colors[0], g.colors[2]] : [paint.gear[0], paint.gear[2]]), (g) => g.name);
    // details panel: what is selected / previewed
    const vid = cur('vehicle');
    const v = getVehicle(vid);
    $('garage-name').textContent = v.name;
    $('garage-desc').textContent = v.desc;
    $('garage-model').textContent = 'client/' + v.model;
    const st = v.stats;
    $('garage-stats').innerHTML = [['Top speed', st.speed], ['Acceleration', st.accel], ['Handling', st.handling], ['Stability', st.stability], ['Suspension', st.suspension]]
      .map(([n, x]) => `<div class="stat"><div class="lbl"><span>${n}</span><span>${x}/10</span></div><div class="bar"><i style="width:${x * 10}%"></i></div></div>`).join('');
    const box = $('garage-buy');
    if (pv) {
      const p = price(pv.slot, pv.id);
      const nm = pv.slot === 'vehicle' ? getVehicle(pv.id).name : pv.slot === 'color' ? (BIKE_COLORS.find((c) => c.id === pv.id) || {}).name + ' paint' : (GEAR_SETS.find((g) => g.id === pv.id) || {}).name + ' gear';
      const can = A && A.coins >= p;
      box.innerHTML = `<div>Preview: <b>${nm}</b> &mdash; <span class="price">${p.toLocaleString()} coins</span></div>
        <button id="buy-btn" class="primary" ${can ? '' : 'disabled'}>${can ? 'Buy for ' + p.toLocaleString() : 'Need ' + (p - (A ? A.coins : 0)).toLocaleString() + ' more coins'}</button>
        <button id="buy-cancel">Back to my stuff</button><div class="error">${this.shopError || ''}</div>`;
      $('buy-btn').onclick = async () => {
        const e = await A.buy(pv.slot, pv.id);
        if (e) this.shopError = e;
        else { S.set(pv.slot, pv.id); this.preview = null; this.toast('Bought ' + nm + '!', 2, 'good'); }
        this.renderGarage(); this.emit('garageChange');
      };
      $('buy-cancel').onclick = () => { this.preview = null; this.renderGarage(); this.emit('garageChange'); };
    } else box.innerHTML = this.shopError ? `<div class="error">${this.shopError}</div>` : '';
  }

  // what the 3D showroom should show right now
  garageLook() {
    const S = this.settings, pv = this.preview;
    return {
      vehicle: pv && pv.slot === 'vehicle' ? pv.id : S.get('vehicle'),
      color: pv && pv.slot === 'color' ? pv.id : S.get('color'),
      gear: pv && pv.slot === 'gear' ? pv.id : S.get('gear') || 'match',
    };
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
    $('acct-note').textContent = 'Your account keeps your coins, bikes, paint and gear. Accounts are stored on the game server; if it is not running, the account is saved in this browser only.';
    setMode('login');
  }

  // ------------------------------------------------------------- tracks
  renderTracks() {
    const S = this.settings;
    const el = $('track-list');
    el.innerHTML = '';
    for (const def of TRACKS) {
      const T = this.track(def.id);
      const b = document.createElement('button');
      b.className = 'track-card' + (def.id === S.get('track') ? ' sel' : '');
      const c = document.createElement('canvas');
      c.width = 120; c.height = 120;
      this.drawTrack(c.getContext('2d'), T, 120, null);
      b.appendChild(c);
      const d = document.createElement('div');
      const jumps = T.features.filter((f) => !['whoops', 'rollers'].includes(f.type)).length;
      d.innerHTML = `<b>${def.name}</b><p>${def.desc}</p><p>${(T.L / 1000).toFixed(2)} km &bull; ${jumps} jumps &bull; ${T.sections.length} sections<br>Best lap: ${fmtTime(S.bestLap(def.id, S.get('vehicle')))}</p>`;
      b.appendChild(d);
      b.onclick = () => { S.set('track', def.id); this.renderTracks(); this.emit('trackChange', def.id); };
      el.appendChild(b);
    }
  }

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
    return { sc, ox, oz };
  }

  buildMinimap(T) {
    this.mapT = T;
    const c = document.createElement('canvas');
    c.width = c.height = 200;
    this.mapXf = this.drawTrack(c.getContext('2d'), T, 200, null);
    this.mapBg = c;
  }

  // ------------------------------------------------------------- settings
  renderSettings() {
    const S = this.settings;
    const tabs = ['Graphics', 'Audio', 'Camera & Controls', 'Riding Assists'];
    $('settings-tabs').innerHTML = tabs.map((t) => `<button class="${t === this.settingsTab ? 'sel' : ''}" data-tab="${t}">${t}</button>`).join('');
    $('settings-tabs').querySelectorAll('button').forEach((b) => b.onclick = () => { this.settingsTab = b.dataset.tab; this.renderSettings(); });
    const body = $('settings-body');
    const rows = [];
    const seg = (key, label, opts, fmt) => rows.push(`<div class="setting"><span>${label}</span><div class="seg">${opts.map(([v, n]) => `<button data-key="${key}" data-val="${v}" class="${String(S.get(key)) === String(v) ? 'sel' : ''}">${n}</button>`).join('')}</div><span class="val"></span></div>`);
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
      seg('screenEffects', 'Speed effects (FOV)', [[true, 'On'], [false, 'Off']]);
    } else {
      range('landingAssist', 'Landing assist (auto-level in the air)', 0, 1, 0.05, (x) => (x > 0 ? pct(x) : 'off'));
      seg('tractionAssist', 'Traction control', [[true, 'On'], [false, 'Off']]);
      seg('wheelieAssist', 'Wheelie / stoppie control', [[true, 'On'], [false, 'Off']]);
      rows.push(`<p class="hint">Assists only help you ride - they never change the track or other riders. Turn them off for full control (and more crashes).</p>`);
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
  }

  // ------------------------------------------------------------- HUD
  showHud(game) {
    for (const s of SCREENS) $(s).hidden = true;
    this.screen = 'hud';
    $('hud').hidden = false;
    const race = game.mode === 'race';
    $('hud-pos').hidden = !race && !(game.opts && game.opts.mp);
    $('hud-standings').hidden = !race && !(game.opts && game.opts.mp);
    $('hud-center').textContent = '';
    $('toasts').innerHTML = '';
  }
  hideHud() { $('hud').hidden = true; }

  updateHud(game, dt) {
    const S = this.settings;
    $('hud-fps').hidden = !S.get('showFps');
    if (S.get('showFps')) $('hud-fps').textContent = `${Math.round(game.fps || 0)} FPS`;
    if (game.mode === 'menu' || $('hud').hidden) return;
    const p = game.player;
    if (!p || !p.veh) return;
    const v = p.veh;
    // fast parts every frame
    const mph = Math.round(v.speed * 2.237);
    $('hud-speed').textContent = mph;
    $('hud-gear').textContent = v.engine.reverse ? 'R' : v.grounded || true ? v.engine.gear : '-';
    const rpmFrac = Math.min(1, v.engine.rpm / (v.cfg.engine.redline * 1.03));
    $('tach-fg').style.strokeDashoffset = this.tachLen * (1 - rpmFrac);
    // countdown
    const c = $('hud-center');
    if (game.phase === 'countdown') {
      const n = Math.ceil(game.countdown - 1);
      c.textContent = n > 0 ? String(n) : '';
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
      $('hud-sub').innerHTML = `Lap ${L.laps}${L.lastLap ? ' &bull; last ' + fmtTime(L.lastLap) : ''}`;
    } else if (mode === 'practice') {
      const P = game.practice;
      $('hud-lap').textContent = 'PRACTICE: ' + P.sec.name.toUpperCase();
      $('hud-time').textContent = P.timing !== null ? fmtTime(now - P.timing) : P.last !== null ? fmtTime(P.last) : '0:00.000';
      $('hud-sub').innerHTML = `Best ${fmtTime(P.best)} &bull; T retry`;
    } else {
      const total = mode === 'race' ? game.laps : null;
      const cur = Math.min(L.laps + 1, total || 99);
      $('hud-lap').textContent = mode === 'race' ? `LAP ${cur}/${total}` : L.lapStart === null ? 'OUT LAP' : `LAP ${L.laps + 1}`;
      const t = L.currentLapTime(now);
      $('hud-time').textContent = mode === 'race' ? fmtTime(game.phase === 'countdown' ? 0 : now) : fmtTime(t || 0);
      $('hud-sub').innerHTML = `Lap ${fmtTime(t)}<br>Last ${fmtTime(L.lastLap)}<br>Best ${fmtTime(L.bestLap)}${mode === 'timetrial' ? '<br>Record ' + fmtTime(best) : ''}`;
    }
    // race positions
    if (!$('hud-pos').hidden) {
      const st = game.net && game.net.standings ? game.net.orderedRiders(game) : game.standings();
      const me = st.indexOf(p) + 1;
      $('hud-pos').innerHTML = `P${me}<small>/${st.length}</small>`;
      $('hud-standings').innerHTML = st.slice(0, 8).map((r, i) => `<li class="${r === p ? 'me' : ''}">${i + 1}. ${escapeHtml(r.name)}${r.finished ? ' &#127937;' : ''}</li>`).join('');
    }
    // network
    const net = $('hud-net');
    if (game.net && game.net.connected !== undefined) {
      net.hidden = false;
      net.textContent = `Party ${game.net.code || ''} • ${game.net.connected ? (game.net.ping != null ? game.net.ping + ' ms' : 'online') : 'reconnecting...'}`;
    } else net.hidden = true;
  }

  drawMinimap(game) {
    const ctx = this.mctx, T = this.mapT;
    if (!T || !this.mapBg) return;
    ctx.clearRect(0, 0, 200, 200);
    ctx.drawImage(this.mapBg, 0, 0);
    const { sc, ox, oz } = this.mapXf;
    for (const r of game.riders) {
      const pos = r.vis.root.position;
      ctx.beginPath();
      ctx.arc(pos.x * sc + ox, pos.z * sc + oz, r.isPlayer ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = r.isPlayer ? '#ffd23f' : r.remote ? '#60a5fa' : '#f3f4f6';
      ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#000'; ctx.stroke();
    }
  }

  toast(text, time = 1.6, kind = '') {
    const box = $('toasts');
    if (!box) return;
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
  hidePause() { $('pause').hidden = true; $('settings').hidden = true; this.screen = 'hud'; }

  showResults(rows, game) {
    $('results').hidden = false;
    this.screen = 'results';
    const me = rows.find((r) => r.me);
    $('results-title').textContent = me ? `You finished ${ordinal(me.pos)}` : 'Results';
    $('results-table').innerHTML = `<tr><th>Pos</th><th>Rider</th><th>Vehicle</th><th>Time</th><th>Best lap</th></tr>` +
      rows.map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${r.pos}</td><td>${escapeHtml(r.name)}</td><td>${r.vehicle}</td><td>${r.time != null ? fmtTime(r.time) : r.laps + ' laps'}</td><td>${fmtTime(r.best)}</td></tr>`).join('');
    $('r-again').hidden = !!(game.opts && game.opts.mp && !game.net.isLeader());
  }
  hideResults() { $('results').hidden = true; }
}

export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
