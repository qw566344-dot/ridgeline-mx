// =====================================================================
//  ADMIN PANEL (server side). The owners in ADMINS, and anyone an owner
//  made an admin (db.admins), may use it; the game opens the panel with
//  the "-" key for them. Owners can not be banned, reset, muted or kicked.
//  Every change is written to the admin log.
//    GET  /api/admin/users?q=          -> {users: [{name, coins, created, lastSeen, online, items, banned}]}
//    GET  /api/admin/stats             -> accounts, online, parties, uptime, cloud save...
//    POST /api/admin/coins  {name, add} or {name, set}
//    POST /api/admin/unlock {name}       (every vehicle, skin, gear and upgrade)
//    POST /api/admin/give   {name, item} (one item, e.g. "vehicle:mx500")
//    POST /api/admin/reset  {name}       (back to a fresh account, keeps the password)
//    POST /api/admin/ban    {name, on}   (banned riders cannot log in)
//    POST /api/admin/delete {name}       (removes the account for good)
//    POST /api/admin/giftall {add}       (coins for everyone online right now)
//    POST /api/admin/announce {text}     (a message that pops up for everyone online)
//    POST /api/admin/chatdelete {id} / chatclear  (moderate the chat)
//    POST /api/admin/event {kind, minutes}  (start an event for everyone online; kind '' stops it)
//    GET  /api/admin/user?name=          -> one rider in detail (stats, items, equipped, mute...)
//    POST /api/admin/warn {name, text}   (a private message that pops up for that rider)
//    POST /api/admin/kick {name}         (back to the menu and out of their party)
//    POST /api/admin/blow {name}         (troll: they blow up - in a race their party sees it)
//    POST /api/admin/mute {name, minutes} (no chat; minutes 0 unmutes)
//    POST /api/admin/take {name, item}   (remove one item)
//    POST /api/admin/password {name, password}  (new password; logs them out everywhere)
//    POST /api/admin/closeparty {code}   (ends a party for everyone in it)
//    POST /api/admin/makeadmin {name, on}  (owners only)
//    GET  /api/admin/log                 -> the last 100 admin actions
//    POST /api/admin/dev {name, on}      (the DEV name tag - just the tag, no admin panel)
//    GET  /api/tags (anyone)             -> {tags: {name: ['DEV']}} for name tags / chat
// =====================================================================
import { SHOP, STARTER, shopItem } from '../shared/shop.js';
import { cloudEnabled } from './store.js';

export const ADMINS = ['lmkk']; // owners
const LOG_KEEP = 100;

// events an admin can start for everyone online (the game applies the effects)
export const EVENTS = {
  double: { name: 'Double Coins', desc: 'Every coin earned on track counts twice' },
  rain: { name: 'Coin Rain', desc: '+500 coins every minute for everyone online' },
  moon: { name: 'Moon Gravity', desc: 'Low gravity for every rider - huge air' },
  turbo: { name: 'Turbo Frenzy', desc: 'Every bike gets a turbo' },
  giant: { name: 'Giant Riders', desc: 'Everyone rides super-sized' },
};
const RAIN_COINS = 500;
const ANNOUNCE_MS = 5 * 60_000; // how long a new rider coming online still sees it
const started = Date.now();

export class Admin {
  constructor(accounts) { this.A = accounts; this.announcement = null; this.pulls = new Map(); this.event = null; this.rain = new Map(); this.inbox = new Map(); }

  // ---- messages for one rider, handed over with their next friends poll
  // ({kind: 'warn' | 'kick', text, from}); taken once
  tell(key, msg) { const l = this.inbox.get(key) || []; l.push({ ...msg, at: Date.now() }); this.inbox.set(key, l.slice(-5)); }
  takeInbox(key) { const l = this.inbox.get(key); this.inbox.delete(key); return l && l.length ? l.filter((x) => Date.now() - x.at < 10 * 60_000) : null; }

  // ---- log of what admins did
  get log() { return this.A.db.adminLog || (this.A.db.adminLog = []); }
  record(u, action, target, detail) {
    this.log.push({ at: Date.now(), by: u.name, action, target: target || '', detail: detail || '' });
    if (this.log.length > LOG_KEEP) this.log.splice(0, this.log.length - LOG_KEEP);
  }

  isOwner(u) { return !!u && ADMINS.includes(u.key); }
  muted(u) { return !!u && u.mutedUntil && Date.now() < u.mutedUntil ? u.mutedUntil : 0; }

  // one rider in detail
  user(name) {
    const u = this.find(name);
    if (!u) return { error: 'No such rider' };
    const F = this.A.friends, p = F && F.online(u.key);
    return { user: {
      name: u.name, coins: u.coins, created: u.created, lastSeen: u.lastSeen || null, online: !!p, status: p ? p.status : 'offline', mode: p ? p.mode : null, track: p ? p.track : null, party: p ? p.code : null,
      stats: u.stats || {}, equipped: u.equipped, owned: u.owned, friends: (u.friends || []).length, banned: !!u.banned, admin: this.isAdmin(u), owner: this.isOwner(u), mutedUntil: this.muted(u), dev: (this.A.db.devs || []).includes(u.key),
    } };
  }

  warn(u, m) {
    const t = this.find(m.name);
    if (!t) return { error: 'No such rider' };
    const text = String(m.text || '').trim().slice(0, 200);
    if (!text) return { error: 'Type the message first' };
    this.tell(t.key, { kind: 'warn', text, from: u.name });
    this.record(u, 'warn', t.name, text);
    return { ok: `Message sent to ${t.name} (they see it within a few seconds)` };
  }

  kick(u, m) {
    const t = this.find(m.name);
    if (!t) return { error: 'No such rider' };
    if (this.isOwner(t)) return { error: 'Owners can not be kicked' };
    this.tell(t.key, { kind: 'kick', text: String(m.text || '').trim().slice(0, 200), from: u.name });
    const n = this.A.lobby ? this.A.lobby.kick(t.name) : 0;
    this.record(u, 'kick', t.name);
    return { ok: `Kicked ${t.name}${n ? ' out of their party' : ''}` };
  }

  // troll: blow a rider up (their party sees it; not connected to the game server -> their
  // game does it through the friends poll)
  blow(u, m) {
    const t = this.find(m.name);
    if (!t) return { error: 'No such rider' };
    if (this.isOwner(t) && !this.isOwner(u)) return { error: 'Owners can not be blown up' };
    const live = this.A.lobby ? this.A.lobby.blowUp(t.name, u.name) : false;
    if (!live) this.tell(t.key, { kind: 'boom', text: '', from: u.name });
    this.record(u, 'blowup', t.name);
    return { ok: `BOOM - ${t.name} blew up` };
  }

  mute(u, m) {
    const t = this.find(m.name);
    if (!t) return { error: 'No such rider' };
    const min = Math.max(0, Math.min(7 * 24 * 60, Math.round(Number(m.minutes) || 0)));
    if (min && this.isOwner(t)) return { error: 'Owners can not be muted' };
    t.mutedUntil = min ? Date.now() + min * 60_000 : 0;
    this.A.save();
    this.record(u, min ? 'mute' : 'unmute', t.name, min ? min + ' min' : '');
    if (min) this.tell(t.key, { kind: 'warn', text: `You are muted in chat for ${min >= 60 ? Math.round(min / 60) + ' h' : min + ' min'}.`, from: u.name });
    return { ok: min ? `Muted ${t.name} for ${min} min` : `Unmuted ${t.name}` };
  }

  take(u, m) {
    const t = this.find(m.name);
    if (!t) return { error: 'No such rider' };
    const k = String(m.item || '');
    if (!t.owned.includes(k)) return { error: `${t.name} does not have that` };
    const [slot, id] = k.split(':');
    const it = shopItem(slot, id);
    if (it && it.price === 0) return { error: 'Free items belong to everyone' };
    t.owned = t.owned.filter((x) => x !== k);
    if (t.equipped[slot] === id) t.equipped[slot] = STARTER.equipped[slot];
    this.A.save();
    this.record(u, 'take', t.name, k);
    return { ok: `Took ${k} from ${t.name}` };
  }

  password(u, m) {
    const t = this.find(m.name);
    if (!t) return { error: 'No such rider' };
    if (this.isOwner(t) && !this.isOwner(u)) return { error: 'Only an owner can change an owner\'s password' };
    const pw = String(m.password || '');
    if (pw.length < 4 || pw.length > 64) return { error: 'Passwords are 4-64 characters' };
    this.A.setPassword(t, pw);
    this.record(u, 'password', t.name);
    return { ok: `New password set for ${t.name} - they are logged out everywhere` };
  }

  closeParty(u, m) {
    const code = String(m.code || '').toUpperCase();
    const n = this.A.lobby ? this.A.lobby.closeParty(code) : -1;
    if (n < 0) return { error: 'No such party' };
    this.record(u, 'closeparty', code, n + ' riders');
    return { ok: `Closed party ${code} (${n} rider${n === 1 ? '' : 's'})` };
  }

  // the DEV tag: shows over their rider, in chat and in the lobby - nothing else
  dev(u, m) {
    const t = this.find(m.name);
    if (!t) return { error: 'No such rider' };
    const list = this.A.db.devs || (this.A.db.devs = []);
    const on = m.on !== false;
    this.A.db.devs = on ? [...new Set([...list, t.key])] : list.filter((k) => k !== t.key);
    this.A.save();
    this.record(u, on ? 'dev' : 'undev', t.name);
    return { ok: on ? `${t.name} has the DEV tag now` : `${t.name} no longer has the DEV tag` };
  }
  tags() {
    const out = {};
    for (const k of this.A.db.devs || []) { const t = this.A.db.users[k]; if (t) out[t.name] = ['DEV']; }
    return out;
  }

  makeAdmin(u, m) {
    if (!this.isOwner(u)) return { error: 'Only owners can make admins' };
    const t = this.find(m.name);
    if (!t) return { error: 'No such rider' };
    if (this.isOwner(t)) return { error: `${t.name} is an owner` };
    const list = this.A.db.admins || (this.A.db.admins = []);
    const on = m.on !== false;
    this.A.db.admins = on ? [...new Set([...list, t.key])] : list.filter((k) => k !== t.key);
    if (on && t.banned) t.banned = false;
    this.A.save();
    this.record(u, on ? 'makeadmin' : 'removeadmin', t.name);
    return { ok: on ? `${t.name} is now an admin` : `${t.name} is no longer an admin` };
  }

  // ---- events
  startEvent(u, m) {
    const kind = String(m.kind || '');
    if (!kind) { const was = this.event; this.event = null; return { ok: was ? `${was.name} stopped` : 'No event running' }; }
    const E = EVENTS[kind];
    if (!E) return { error: 'No such event' };
    const minutes = Math.max(1, Math.min(120, Math.round(Number(m.minutes) || 10)));
    this.event = { id: Date.now(), kind, name: E.name, desc: E.desc, from: u.name, endsAt: Date.now() + minutes * 60_000 };
    return { ok: `${E.name} started for ${minutes} min` };
  }
  currentEvent() { const e = this.event; if (e && Date.now() > e.endsAt) this.event = null; return this.event; }
  // what the friends poll hands each rider (time left, so their clock does not matter)
  eventFor(u) {
    const e = this.currentEvent();
    if (!e) return null;
    if (e.kind === 'rain') {
      // one shower per minute per rider, while they are online
      const now = Date.now();
      const r = this.rain.get(u.key);
      if (!r || r.id !== e.id) this.rain.set(u.key, { id: e.id, at: now });
      else if (now - r.at >= 60_000) { r.at = now; u.coins = Math.min(1e12, u.coins + RAIN_COINS); this.A.save(); return { ...this.publicEvent(e), rain: RAIN_COINS }; }
    }
    return this.publicEvent(e);
  }
  publicEvent(e) { return { id: e.id, kind: e.kind, name: e.name, desc: e.desc, from: e.from, left: e.endsAt - Date.now() }; }
  // coins earned on track during Double Coins
  coinFactor() { const e = this.currentEvent(); return e && e.kind === 'double' ? 2 : 1; }

  // "an admin wants to join you": handed to that rider's game with its next friends poll
  pull(key, from) { this.pulls.set(key, { from, at: Date.now() }); }
  takePull(key) { const x = this.pulls.get(key); this.pulls.delete(key); return x && Date.now() - x.at < 60_000 ? x : null; }
  isAdmin(u) { return !!u && (ADMINS.includes(u.key) || (this.A.db.admins || []).includes(u.key)); }

  users(q) {
    q = String(q || '').trim().toLowerCase();
    const F = this.A.friends;
    const list = Object.values(this.A.db.users)
      .filter((u) => !q || u.key.includes(q))
      .map((u) => ({ name: u.name, coins: u.coins, created: u.created, lastSeen: u.lastSeen || null, online: !!(F && F.online(u.key)), items: u.owned.length, banned: !!u.banned, admin: this.isAdmin(u), owner: this.isOwner(u), muted: !!this.muted(u) }))
      .sort((a, b) => (b.online - a.online) || (b.lastSeen || 0) - (a.lastSeen || 0));
    return { users: list, total: Object.keys(this.A.db.users).length };
  }

  stats() {
    const users = Object.values(this.A.db.users), F = this.A.friends, L = this.A.lobby;
    const parties = L ? [...L.parties.values()] : [];
    return {
      accounts: users.length,
      online: users.filter((u) => F && F.online(u.key)).length,
      banned: users.filter((u) => u.banned).length,
      coins: users.reduce((a, u) => a + (u.coins || 0), 0),
      parties: parties.length,
      inParties: parties.reduce((a, p) => a + p.members.size, 0),
      connected: L ? L.players.size : 0,
      uptime: Date.now() - started,
      cloud: cloudEnabled,
      announcement: this.current() ? this.announcement.text : null,
      event: this.currentEvent() ? { ...this.publicEvent(this.event) } : null,
      partyList: parties.map((p) => ({ code: p.code, members: [...p.members.values()].map((m) => m.name) })),
    };
  }

  find(name) { return this.A.db.users[String(name || '').trim().toLowerCase()] || null; }

  coins(m) {
    const u = this.find(m.name);
    if (!u) return { error: 'No such rider' };
    if (m.set !== undefined) { const v = Math.floor(Number(m.set)); if (!Number.isFinite(v) || v < 0) return { error: 'Bad amount' }; u.coins = Math.min(1e12, v); }
    else { const v = Math.floor(Number(m.add)); if (!Number.isFinite(v)) return { error: 'Bad amount' }; u.coins = Math.max(0, Math.min(1e12, u.coins + v)); }
    this.A.save();
    return { ok: `${u.name} now has ${u.coins.toLocaleString()} coins`, user: { name: u.name, coins: u.coins } };
  }

  unlock(m) {
    const u = this.find(m.name);
    if (!u) return { error: 'No such rider' };
    u.owned = [...new Set([...u.owned, ...SHOP.map((i) => i.slot + ':' + i.id)])];
    this.A.save();
    return { ok: `Unlocked everything for ${u.name}` };
  }

  give(m) {
    const u = this.find(m.name);
    if (!u) return { error: 'No such rider' };
    const [slot, id] = String(m.item || '').split(':');
    const item = shopItem(slot, id);
    if (!item) return { error: 'No such item' };
    const k = slot + ':' + id;
    if (u.owned.includes(k)) return { ok: `${u.name} already has ${item.name || id}` };
    u.owned.push(k);
    this.A.save();
    return { ok: `Gave ${item.name || id} to ${u.name}` };
  }

  reset(m) {
    const u = this.find(m.name);
    if (!u) return { error: 'No such rider' };
    u.coins = STARTER.coins; u.owned = [...STARTER.owned]; u.equipped = { ...STARTER.equipped }; u.stats = { laps: 0, wins: 0, tricks: 0 };
    this.A.grant(u);
    this.A.save();
    return { ok: `Reset ${u.name}` };
  }

  ban(m) {
    const u = this.find(m.name);
    if (!u) return { error: 'No such rider' };
    if (this.isAdmin(u)) return { error: 'Admins cannot be banned' };
    u.banned = m.on !== false;
    if (u.banned) { for (const t of u.tokens || []) this.A.tokens.delete(t); u.tokens = []; }
    this.A.save();
    return { ok: u.banned ? `Banned ${u.name}` : `Unbanned ${u.name}` };
  }

  remove(m) {
    const u = this.find(m.name);
    if (!u) return { error: 'No such rider' };
    if (this.isAdmin(u)) return { error: 'Admin accounts cannot be deleted' };
    for (const t of u.tokens || []) this.A.tokens.delete(t);
    delete this.A.db.users[u.key];
    // take them off everyone's friend lists
    for (const o of Object.values(this.A.db.users)) for (const f of ['friends', 'incoming', 'outgoing']) if (o[f]) o[f] = o[f].filter((k) => k !== u.key);
    this.A.save();
    return { ok: `Deleted ${u.name}` };
  }

  giftAll(m) {
    const v = Math.floor(Number(m.add));
    if (!Number.isFinite(v) || v <= 0 || v > 1e9) return { error: 'Bad amount' };
    const F = this.A.friends;
    const on = Object.values(this.A.db.users).filter((u) => F && F.online(u.key));
    for (const u of on) u.coins = Math.min(1e12, u.coins + v);
    if (on.length) this.A.save();
    return { ok: `Gave ${v.toLocaleString()} coins to ${on.length} rider${on.length === 1 ? '' : 's'} online` };
  }

  announce(u, m) {
    const text = String(m.text || '').trim().slice(0, 140);
    if (!text) { this.announcement = null; return { ok: 'Announcement cleared' }; }
    this.announcement = { id: Date.now(), text, from: u.name, at: Date.now() };
    return { ok: 'Sent to everyone online' };
  }

  // the latest announcement while it is fresh (sent to every rider with the friends poll)
  current() { const a = this.announcement; return a && Date.now() - a.at < ANNOUNCE_MS ? a : null; }

  handle(route, u, m, url) {
    if (!route.startsWith('admin/')) return null;
    if (!this.isAdmin(u)) return { error: 'Admins only' };
    const out = this.route(route, u, m, url);
    // everything that changes something goes in the log (the new tools log themselves)
    const logged = { 'admin/coins': 'coins', 'admin/unlock': 'unlock', 'admin/give': 'give', 'admin/reset': 'reset', 'admin/ban': 'ban', 'admin/delete': 'delete', 'admin/giftall': 'giftall', 'admin/announce': 'announce', 'admin/chatclear': 'chatclear', 'admin/event': 'event' };
    if (out && !out.error && logged[route]) this.record(u, logged[route], m.name || '', m.add !== undefined ? String(m.add) : m.item || m.text || m.kind || (m.on !== undefined ? String(m.on) : ''));
    return out;
  }

  route(route, u, m, url) {
    // owners are protected from the other admins
    const t = m && m.name ? this.find(m.name) : null;
    if (t && this.isOwner(t) && !this.isOwner(u) && ['admin/reset', 'admin/ban', 'admin/delete', 'admin/take', 'admin/coins'].includes(route)) return { error: 'Owners can only be changed by an owner' };
    switch (route) {
      case 'admin/user': return this.user(url.searchParams.get('name'));
      case 'admin/log': return { log: [...this.log].reverse() };
      case 'admin/warn': return this.warn(u, m);
      case 'admin/kick': return this.kick(u, m);
      case 'admin/blow': return this.blow(u, m);
      case 'admin/mute': return this.mute(u, m);
      case 'admin/take': return this.take(u, m);
      case 'admin/password': return this.password(u, m);
      case 'admin/closeparty': return this.closeParty(u, m);
      case 'admin/makeadmin': return this.makeAdmin(u, m);
      case 'admin/dev': return this.dev(u, m);
      case 'admin/users': return this.users(url.searchParams.get('q'));
      case 'admin/stats': return this.stats();
      case 'admin/coins': return this.coins(m);
      case 'admin/unlock': return this.unlock(m);
      case 'admin/give': return this.give(m);
      case 'admin/reset': return this.reset(m);
      case 'admin/ban': return this.ban(m);
      case 'admin/delete': return this.remove(m);
      case 'admin/giftall': return this.giftAll(m);
      case 'admin/announce': return this.announce(u, m);
      case 'admin/chatdelete': return this.A.chat.remove(m.id);
      case 'admin/chatclear': return this.A.chat.clear();
      case 'admin/event': return this.startEvent(u, m);
      default: return { error: 'Unknown admin action' };
    }
  }
}
