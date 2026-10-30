// =====================================================================
//  MULTIPLAYER CLIENT
//  Talks to a game server over a WebSocket (/ws).
//  - Regions: every server in config.js REGIONS is pinged; parties go to
//    the one you picked in Settings > Online, or the lowest ping (Auto).
//    Joining a code that lives in another region finds it and switches.
//  - Party: create / join with a 6-character code, ready up; the leader
//    picks track + mode + laps and starts. The lobby screen (ui.js) and
//    the 3D line-up (stage.js) draw this.party.
//  - Riding: your own vehicle is simulated here (instant controls) and
//    sent 20x a second. Other riders are drawn a little in the past,
//    smoothly interpolated between server snapshots. How far in the past
//    adapts to how evenly their packets arrive (less lag on a good line,
//    no stutter on a bad one); late packets are briefly extrapolated.
//  - Race laps, positions, freestyle scores and results come from the server.
//  - Drops: reconnects with a token and puts you back in your party and
//    session; your seat is kept for 60 s.
// =====================================================================
import * as THREE from 'three';
import { PROTOCOL_VERSION, SEND_RATE, INTERP_DELAY, packState, cleanName, validCode, F_CRASHED, F_AIR, F_GIANT, F_TINY } from '/shared/protocol.js';
import { getVehicle } from '/shared/vehicles.js';
import { regionList, wsUrlFor, measurePing } from './config.js';
import { escapeHtml, ordinal } from './util.js';

const $ = (id) => document.getElementById(id);
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

export class Net {
  constructor(ui, game, settings) {
    this.ui = ui; this.game = game; this.settings = settings;
    this.ws = null;
    this.connected = undefined;
    this.id = null;
    this.token = ssGet('mx.token');
    this.code = null;
    this.party = null;
    this.offset = 0; this.offsetSet = false;
    this.ping = null;
    this.sendAcc = 0;
    this.session = null;
    this.standings = null;
    this.retry = 0;
    this.wantOnline = false;
    const regs = regionList();
    const saved = ssGet('mx.region');
    this.region = regs.find((r) => r.id === saved) || regs.find((r) => r.id === settings.get('region')) || regs[0];
    this.wire();
  }

  // ------------------------------------------------------------- regions
  // ping every region over HTTP; Auto picks the lowest
  async pingRegions() {
    const regs = regionList();
    const out = this.ui.regionPings;
    await Promise.all(regs.map(async (r) => { out[r.id] = await measurePing(r.url); }));
    if ((this.settings.get('region') || 'auto') === 'auto' && !this.code) {
      const best = regs.filter((r) => out[r.id] != null).sort((a, b) => out[a.id] - out[b.id])[0];
      if (best && best.id !== this.region.id) this.useRegion(best.id, true);
    }
    this.ui.renderTop();
    if (this.ui.screen === 'settings') this.ui.renderSettings();
    return out;
  }

  // switch region (leaves any party on the old one)
  useRegion(id, quiet) {
    const r = regionList().find((x) => x.id === id);
    if (!r || (this.region && r.id === this.region.id && this.ws)) { if (r) this.region = r; return; }
    if (this.code) { this.send({ t: 'leave' }); this.party = null; this.code = null; ssSet('mx.code', ''); }
    this.region = r;
    ssSet('mx.region', r.id);
    if (this.ws) { const w = this.ws; this.ws = null; w.onclose = null; w.close(); }
    this.connected = false; this.ping = null; this.id = null; this.token = null; ssSet('mx.token', '');
    if (!quiet) this.ui.popup(`Server region: <b>${escapeHtml(r.name)}</b>`);
    if (this.wantOnline) this.connect();
    this.refresh();
  }

  serverNow() { return Date.now() + this.offset; }
  isLeader() { return !!this.party && this.party.leader === this.id; }
  me() { return this.party ? this.party.members.find((m) => m.id === this.id) : null; }

  // ------------------------------------------------------------- connection
  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    let ws;
    try { ws = new WebSocket(wsUrlFor(this.region.url)); } catch { this.error('Could not reach the server.'); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.connected = true;
      ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, token: this.token, name: this.name(), vehicle: this.settings.get('vehicle'), color: this.settings.get('color'), gear: this.settings.get('gear') }));
      this.pingTimer = setInterval(() => this.sendPing(), 2000);
      this.refresh();
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.onMessage(m); };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      const was = this.connected;
      this.connected = false;
      this.ws = null;
      if (this.wantOnline || this.code) {
        this.retry++;
        const wait = Math.min(10000, 500 * 2 ** Math.min(5, this.retry));
        if (was && this.game.mode !== 'none' && this.game.state === 'running') this.game.toast('Connection lost - reconnecting...', 2.5, 'bad');
        else if (was) this.ui.popup('Connection to the server lost - reconnecting...', 'bad');
        setTimeout(() => this.connect(), wait);
      }
      this.refresh();
    };
    ws.onerror = () => {};
  }

  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  sendPing() { this.send({ t: 'ping', c: Date.now(), rtt: this.ping }); }
  name() { const A = this.ui.account; return cleanName((A && A.profile && A.profile.name) || this.settings.get('playerName') || 'Rider'); }
  sendProfile() { if (this.connected) this.send({ t: 'profile', name: this.name(), vehicle: this.settings.get('vehicle'), color: this.settings.get('color'), gear: this.settings.get('gear') }); }

  // page reloaded while in a party: reconnect and pick up where we left off
  autoRejoin() { if (this.token && ssGet('mx.code')) { this.wantOnline = true; this.connect(); } }

  whenOnline(f) {
    this.wantOnline = true;
    if (this.connected && this.id) return f();
    this.connect();
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (this.connected && this.id) { clearInterval(iv); f(); }
      else if (Date.now() - t0 > 25000) { clearInterval(iv); this.error(`Could not reach the ${this.region.name} server. Free servers sleep when nobody plays - wait a few seconds and try again, or pick another region in Settings > Online.`); }
    }, 100);
  }

  onMessage(m) {
    switch (m.t) {
      case 'welcome':
        this.id = m.id; this.token = m.token; ssSet('mx.token', m.token);
        this.syncClock(m.s, 0);
        this.refresh();
        break;
      case 'pong': {
        this.ping = Date.now() - m.c;
        this.syncClock(m.s, this.ping);
        this.ui.renderTop();
        break;
      }
      case 'party': {
        const was = this.party;
        this.party = m; this.code = m.code; ssSet('mx.code', m.code);
        if (!was) {
          this.ui.popup(`You are in party <b>${m.code}</b>`, 'good');
          // a party you just made starts with what you had picked solo
          if (m.leader === this.id && m.members.length === 1) {
            const S = this.settings, mode = S.get('mode') === 'practice' ? 'freeride' : S.get('mode');
            this.sendSettings({ track: S.get('track'), mode, laps: mode === 'freestyle' ? Math.max(1, S.get('freestyleTime') || 2) : S.get('laps') });
          }
        } else {
          const before = new Set(was.members.map((x) => x.id));
          for (const x of m.members) if (!before.has(x.id)) this.ui.popup(`<b>${escapeHtml(x.name)}</b> joined the party`);
          for (const x of was.members) if (!m.members.some((y) => y.id === x.id)) this.ui.popup(`<b>${escapeHtml(x.name)}</b> left the party`);
          if (was.leader !== m.leader && m.leader === this.id) this.ui.popup('You are now the party leader', 'good');
        }
        this.refresh();
        this.syncSessionMembers();
        if (this.waitParty) { this.waitParty(m.code); this.waitParty = null; }
        break;
      }
      case 'left':
        this.party = null; this.code = null; ssSet('mx.code', '');
        this.refresh();
        break;
      case 'error':
        if (m.code === 'NO_PARTY' && this.joining && !this.joining.searched) { this.findElsewhere(this.joining.code); break; }
        this.joining = null;
        this.error(m.msg || m.code);
        if (this.game.state === 'running' && this.ui.screen === 'hud') this.game.toast(m.msg || m.code, 2.5, 'bad');
        if (this.waitParty) { this.waitParty(null); this.waitParty = null; }
        break;
      case 'notice': this.ui.popup(m.msg); break;
      case 'pchat': if (this.onPartyChat) this.onPartyChat(m); break;
      case 'adminjoined': this.adminJoined(m); break;
      case 'boom': { // admin troll
        const g = this.game, r = m.id === this.id ? g.player : g.riders && g.riders.find((x) => x.remote && x.id === m.id);
        if (r && g.state === 'running') g.blowUp(r);
        break;
      }
      case 'summoned': if (this.onSummoned) this.onSummoned(m); break;
      case 'kicked': if (this.game.opts && this.game.opts.mp && this.game.state === 'running') this.ui.emit('mainMenu'); break;
      case 'session': this.onSession(m); break;
      case 'go': // everyone has loaded: start the 3-2-1
        if (this.session && this.session.id === m.id) {
          this.session.goAt = m.goAt; this.session.waiting = false;
          const mp = this.game.opts && this.game.opts.mp;
          if (mp && this.game.state === 'running') { mp.startAt = m.goAt + 1000; mp.waiting = false; }
        }
        break;
      case 'snap': this.onSnap(m); break;
      case 'race': this.standings = m.rows; this.onRace(m); break;
      case 'results': this.onResults(m); break;
      case 'ended':
        this.session = null;
        if (this.game.opts && this.game.opts.mp && this.game.state === 'running') {
          this.game.toast('The leader ended the session', 2);
          this.ui.emit('mainMenu');
        }
        break;
      default: break;
    }
  }

  syncClock(serverTime, rtt) {
    const est = serverTime + rtt / 2 - Date.now();
    if (!this.offsetSet) { this.offset = est; this.offsetSet = true; }
    else this.offset = this.offset * 0.85 + est * 0.15;
  }

  // ------------------------------------------------------------- party actions
  wire() {
    $('party-create').addEventListener('click', () => this.createParty());
    $('party-join').addEventListener('click', () => this.joinCode($('party-code').value));
    $('party-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.joinCode($('party-code').value); });
    $('party-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
    $('party-leave').addEventListener('click', () => this.leave());
    $('party-copy').addEventListener('click', () => this.copyCode());
    $('party-invite').addEventListener('click', () => this.ui.show('friends'));
    this.settings.onChange((k) => { if (['vehicle', 'color', 'gear'].includes(k)) this.sendProfile(); });
  }

  // returns a promise of the new party code (null if it failed)
  createParty() {
    this.clearError();
    if (this.code) return Promise.resolve(this.code);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { if (this.waitParty) { this.waitParty = null; resolve(null); } }, 30000);
      this.waitParty = (code) => { clearTimeout(timer); resolve(code); };
      this.whenOnline(() => { this.sendProfile(); this.send({ t: 'create' }); });
    });
  }

  joinCode(raw, regionId = null) {
    this.clearError();
    const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!validCode(code)) { this.error('Party codes are 6 letters and numbers, like MX7K2P.'); return; }
    if (code === this.code) { this.ui.show('home'); return; }
    if (regionId && regionId !== this.region.id && regionList().some((r) => r.id === regionId)) this.useRegion(regionId, false);
    this.joining = { code, searched: false };
    this.whenOnline(() => { this.sendProfile(); this.send({ t: 'join', code }); });
  }

  // the code is not on this region's server: ask the others
  async findElsewhere(code) {
    this.joining.searched = true;
    for (const r of regionList()) {
      if (r.id === this.region.id) continue;
      try {
        const d = await (await fetch(r.url + '/api/party?code=' + code)).json();
        if (d.exists) { this.useRegion(r.id, false); this.joining = { code, searched: true }; this.whenOnline(() => { this.sendProfile(); this.send({ t: 'join', code }); }); return; }
      } catch { /* that region is asleep or down */ }
    }
    this.joining = null;
    this.error(`No party with code ${code}. It may have expired - ask your friend for a new code.`);
  }

  leave() {
    this.send({ t: 'leave' });
    this.party = null; this.code = null; ssSet('mx.code', '');
    this.refresh();
  }

  // the admin asked this game to connect (friends poll): answer with our login
  answerPull(auth) { this.whenOnline(() => { this.sendProfile(); this.send({ t: 'pulled', auth }); }); }

  // an admin dropped into you. Riding alone? Then the ride turns into a party
  // ride on the same track so they appear next to you.
  adminJoined(m) {
    this.ui.popup(`<b>${escapeHtml(m.from)}</b> (admin) joined you`, 'good');
    const g = this.game;
    const solo = g.state === 'running' && g.mode !== 'menu' && g.mode !== 'none' && !(g.opts && g.opts.mp);
    if (!solo || !this.isLeader()) return;
    const mode = g.mode === 'practice' ? 'freeride' : g.mode;
    this.sendSettings({ track: g.trackId, mode, laps: mode === 'freestyle' ? Math.max(1, this.settings.get('freestyleTime') || 2) : (g.laps || this.settings.get('laps')) });
    this.start();
  }

  toggleReady() { const me = this.me(); this.send({ t: 'ready', ready: !(me && me.ready) }); }
  start() { this.send({ t: 'start' }); }
  rejoin() { this.send({ t: 'rejoin' }); }
  sendSettings(s) { this.send({ t: 'settings', track: s.track, mode: s.mode, laps: s.laps }); }

  copyCode() {
    const code = this.code;
    if (!code) return;
    const done = () => { $('party-copy').textContent = 'Copied!'; setTimeout(() => ($('party-copy').textContent = 'Copy'), 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => this.fallbackCopy(code, done));
    else this.fallbackCopy(code, done);
  }
  fallbackCopy(code, done) {
    const ta = document.createElement('textarea');
    ta.value = code; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch { /* ignore */ }
    ta.remove();
  }

  error(msg) {
    const el = $('party-error');
    if (el) el.textContent = msg;
    if (this.ui.screen !== 'home' && this.ui.screen !== 'hud') this.ui.popup(escapeHtml(msg), 'bad', null, 6);
  }
  clearError() { const el = $('party-error'); if (el) el.textContent = ''; }

  // redraw everything that shows the party
  refresh() { this.ui.renderTop(); this.ui.renderHome(); if (this.ui.screen === 'play') this.ui.renderPlay(); if (this.ui.screen === 'friends') this.ui.renderFriends(); }

  // what friends see about you
  presence() {
    const g = this.game;
    const riding = g.state === 'running' && g.mode !== 'none' && g.mode !== 'menu';
    return { status: riding ? 'riding' : this.code ? 'party' : 'menu', code: this.code, region: this.region ? this.region.id : null, mode: riding ? g.mode : null, track: riding ? g.trackId : null };
  }

  // ------------------------------------------------------------- sessions
  async onSession(m) {
    const g = this.game;
    if (m.rejoin && this.session && this.session.id === m.id && g.opts && g.opts.mp && g.state === 'running') {
      this.session = m;
      this.syncSessionMembers(m.players);
      return;
    }
    this.session = m;
    this.standings = null;
    const mine = m.players.find((p) => p.id === this.id);
    if (!mine) return;
    this.ui.hideResults(); this.ui.hidePause();
    await g.startSession({
      mode: m.mode, trackId: m.track, vehicleId: mine.vehicle, colorId: mine.color, gearId: mine.gear, laps: m.laps, number: mine.number,
      mp: { myId: this.id, slot: mine.slot, players: m.players, minutes: m.laps, startAt: m.mode === 'freeride' ? null : m.goAt + 1000, waiting: !!m.waiting, serverNow: () => this.serverNow() },
    });
    // track loaded: the server starts the 3-2-1 once everyone is here
    // (if it already started while we were loading, take the real start time)
    if (this.session === m && m.waiting) this.send({ t: 'loaded', id: m.id });
    else if (g.opts && g.opts.mp) { g.opts.mp.waiting = false; g.opts.mp.startAt = m.mode === 'freeride' ? null : this.session.goAt + 1000; }
    // late join: the gate already dropped
    if (m.mode !== 'freeride' && this.serverNow() > this.session.goAt + 1000 && g.phase === 'countdown') g.countdown = 0.95;
    g.net = this;
  }

  // add / remove remote riders to match the session + party
  syncSessionMembers(players) {
    const g = this.game;
    if (!g.opts || !g.opts.mp || g.state !== 'running' || !this.session) return;
    const list = players || this.session.players;
    const inParty = new Set((this.party ? this.party.members : []).map((m) => m.id));
    for (const p of list) {
      if (p.id === this.id || !inParty.has(p.id)) continue;
      if (!g.riders.some((r) => r.id === p.id)) {
        g.addRider({ id: p.id, name: p.name, vehicleId: p.vehicle, colorId: p.color, gearId: p.gear, number: p.number, remote: true });
        g.toast(`${p.name} joined`, 1.5);
      }
    }
    for (const r of [...g.riders]) if (r.remote && !inParty.has(r.id)) { g.toast(`${r.name} left`, 1.5); g.removeRider(r); }
  }

  tick(dt, game) {
    if (!this.connected || !this.session) return;
    this.sendAcc += dt;
    if (this.sendAcc < 1 / SEND_RATE) return;
    this.sendAcc = 0;
    this.send({ t: 's', d: packState(game.player.veh) });
  }

  sendEvent(e) { this.send({ t: 'ev', e: e.t, v: e.v }); }

  onSnap(m) {
    const g = this.game;
    const now = this.serverNow();
    for (const row of m.p) {
      const id = row[0];
      if (id === this.id) continue;
      const r = g.riders.find((x) => x.id === id && x.remote);
      if (!r) continue;
      const R = r.remote, buf = R.buf;
      const t = row[1];
      if (buf.length && t <= buf[buf.length - 1].t) continue;
      buf.push({ t, d: row.slice(2) });
      if (buf.length > 40) buf.shift();
      // how late do this rider's states arrive, and how much does that wobble?
      const age = now - t;
      R.age = R.age == null ? age : R.age * 0.9 + age * 0.1;
      R.jitter = R.jitter == null ? 0 : R.jitter * 0.9 + Math.abs(age - R.age) * 0.1;
      if (R.lastRecv && Date.now() - R.lastRecv > 3000) g.toast(`${r.name} is back`, 1.5);
      R.lastRecv = Date.now();
    }
  }

  // smooth a remote rider into place for this frame
  interpolate(r, game) {
    const R = r.remote, buf = R.buf;
    if (!buf.length) return;
    // draw them far enough in the past to always have two states to blend
    const want = Math.max(70, Math.min(260, 1000 / SEND_RATE + 1000 / 20 + (R.jitter || 0) * 3));
    R.delay = R.delay == null ? INTERP_DELAY : R.delay + (want - R.delay) * 0.02;
    const rt = this.serverNow() - R.delay - Math.max(0, (R.age || 0) - 40) * 0.5;
    let a = buf[0], b = buf[0], k = 0;
    if (rt <= buf[0].t) { a = b = buf[0]; }
    else if (rt >= buf[buf.length - 1].t) { a = b = buf[buf.length - 1]; }
    else {
      for (let i = 0; i < buf.length - 1; i++) if (buf[i].t <= rt && rt < buf[i + 1].t) { a = buf[i]; b = buf[i + 1]; k = (rt - a.t) / (b.t - a.t); break; }
    }
    const da = a.d, db = b.d;
    const st = R.state || (R.state = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), visual: { lean: 0, steer: 0, wheels: [] }, crashed: false, rpm: 0, thr: 0, spin: [0, 0, 0, 0], airT: 0 });
    const L = (i) => da[i] + (db[i] - da[i]) * k;
    st.pos.set(L(0), L(1), L(2));
    _q1.set(da[3], da[4], da[5], da[6]).normalize(); _q2.set(db[3], db[4], db[5], db[6]).normalize();
    st.quat.copy(_q1).slerp(_q2, k);
    st.vel.set(L(7), L(8), L(9));
    // packets late: carry on along the last velocity for a moment
    const late = (rt - buf[buf.length - 1].t) / 1000;
    if (late > 0) st.pos.addScaledVector(st.vel, Math.min(0.25, late));
    const stale = Date.now() - (R.lastRecv || 0) > 3000;
    if (stale && !R.staleTold) { R.staleTold = true; game.toast(`${r.name} lost connection`, 2, 'bad'); }
    if (!stale) R.staleTold = false;
    r.vis.root.visible = !stale;
    const def = getVehicle(r.vehicleId);
    const dt = 1 / 60;
    const spd = st.vel.length();
    const flags = db[15];
    st.crashed = !!(flags & F_CRASHED);
    r.sizeScale = flags & F_GIANT ? 1.8 : flags & F_TINY ? 0.55 : 1; // their giant / tiny cheat
    st.rpm = L(13); st.thr = L(14);
    const steer = L(11);
    const wheels = def.wheels.map((w, i) => {
      st.spin[i] += (spd / w.r) * dt;
      return { comp: L(16 + i), spin: st.spin[i], steer: w.steer ? steer : 0 };
    });
    st.visual.lean = L(10); st.visual.steer = steer; st.visual.wheels = wheels;
    R.s = db[12];
    R.pos = st.pos; R.vel = st.vel;
    // pose proxy for the rider animation
    const px = R.proxy;
    const air = !!(flags & F_AIR);
    st.airT = air ? st.airT + dt : 0;
    px.speed = spd; px.grounded = !air; px.airTime = st.airT; px.lean = st.visual.lean;
    px.input.throttle = st.thr; px.controller.steer = Math.max(-1, Math.min(1, steer * 3));
    px.wheels.forEach((w, i) => { w.comp = wheels[i] ? wheels[i].comp : 0.1; });
  }

  onRace(m) {
    const g = this.game;
    if (!g.opts || !g.opts.mp) return;
    for (const row of m.rows) {
      const r = g.riders.find((x) => x.id === row.id);
      if (r) { r.finished = row.finished; r.finishTime = row.time; if (row.best != null) r.lap.bestLap = row.best; }
      if (row.id === this.id && row.finished && !this.toldFinish) { this.toldFinish = true; g.toast(`FINISHED ${ordinal(row.pos)}!`, 3, 'good'); }
    }
  }

  orderedRiders(game) {
    if (!this.standings) return game.standings();
    const out = [];
    for (const row of this.standings) { const r = game.riders.find((x) => x.id === row.id); if (r) out.push(r); }
    for (const r of game.riders) if (!out.includes(r)) out.push(r);
    return out;
  }

  onResults(m) {
    this.toldFinish = false;
    const g = this.game;
    const rows = m.rows.map((r) => {
      const rider = g.riders.find((x) => x.id === r.id);
      return { pos: r.pos, name: r.name, vehicle: rider ? getVehicle(rider.vehicleId).name : '', time: m.mode === 'race' ? r.time : r.best, best: r.best, laps: r.laps, score: r.score, me: r.id === this.id };
    });
    g.results = rows;
    const mine = rows.find((r) => r.me);
    if (mine && m.mode === 'race') g.award(mine.pos === 1 ? 'win' : 'race', [500, 320, 220, 150, 110, 90, 80, 70][Math.min(mine.pos, 8) - 1]);
    if (mine && m.mode === 'freestyle') this.settings.saveScore(g.trackId, mine.score || 0);
    setTimeout(() => this.ui.showResults(rows, g), m.mode === 'race' ? 1500 : 600);
  }

  requestRestart() {
    if (this.isLeader()) this.send({ t: 'start' });
    else this.game.toast('Only the party leader can restart', 2);
  }

  // back to the lobby: we stay in the party, we just stop riding
  leaveSession() { this.game.net = null; this.refresh(); }
}

function ssGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } }
