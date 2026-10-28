// =====================================================================
//  ACCOUNTS: name + password, coins, owned shop items, equipped items.
//  Saved to server/data/accounts.json. Passwords are never stored -
//  only a salted scrypt hash. Logged-in clients get a random token.
//  HTTP API (JSON):
//    POST /api/register {name, password[, restore]} -> {token, profile}
//         restore: the copy of the account the game keeps on the player's
//         computer, used when this server lost its data (free hosting wipes
//         it on every restart) so nobody loses their progress
//    POST /api/login    {name, password}     -> {token, profile}
//    GET  /api/me                            -> {profile}
//    POST /api/buy      {slot, id}           -> {profile}
//    POST /api/equip    {slot, id}           -> {profile}
//    POST /api/reward   {kind, amount}       -> {profile}
//    POST /api/logout
//  (send the token as  Authorization: Bearer <token>)
// =====================================================================
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SHOP, STARTER, shopItem, MAX_REWARD, upgradeNeeds, inShop } from '../shared/shop.js';
import { VEHICLES, BIKE_COLORS } from '../shared/vehicles.js';
import { Friends } from './friends.js';
import { cloudEnabled, cloudLoad, cloudSave } from './store.js';
import { Casino } from './casino.js';
import { Admin, ADMINS } from './admin.js';

const NAME_RE = /^[A-Za-z0-9_ .-]{3,16}$/;

// TESTING ONLY: accounts topped up to this many coins when they log in.
// Delete the line (or the name) when testing is over.
const TEST_COINS = { nahh: 1_000_000 };
const MAX_COINS = 5_000_000;

export class Accounts {
  constructor(dir) {
    this.file = path.join(dir, 'accounts.json');
    fs.mkdirSync(dir, { recursive: true });
    this.db = { users: {} };
    try { this.db = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* first run */ }
    this.tokens = new Map();
    for (const u of Object.values(this.db.users)) for (const t of u.tokens || []) this.tokens.set(t, u.key);
    this.attempts = new Map();
    this.saveTimer = null;
    this.friends = new Friends(this);
    this.casino = new Casino(this);
    this.admin = new Admin(this);
    this.ready = this.loadCloud();
  }

  // with a cloud save set up, the accounts there win over the (wiped) local file
  async loadCloud() {
    if (!cloudEnabled) { console.log('Accounts: saved on this server only (no cloud save set up)'); return; }
    try {
      const db = await cloudLoad();
      if (db && db.users) {
        // keep anyone who registered in the moments before the load finished
        for (const [k, u] of Object.entries(this.db.users)) if (!db.users[k]) db.users[k] = u;
        this.db = db;
        this.tokens = new Map();
        for (const u of Object.values(this.db.users)) for (const t of u.tokens || []) this.tokens.set(t, u.key);
      }
      console.log('Accounts: loaded', Object.keys(this.db.users).length, 'from the cloud save');
    } catch (e) { console.log('Accounts: cloud load failed -', e.message); }
  }

  // write everything to disk (and the cloud save) right now - used when the server is shutting down
  async flush() {
    clearTimeout(this.saveTimer);
    try { fs.writeFileSync(this.file, JSON.stringify(this.db)); } catch { /* ignore */ }
    try { await cloudSave(this.db); } catch (e) { console.log('Accounts: cloud save failed -', e.message); }
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.db));
      fs.renameSync(tmp, this.file);
      cloudSave(this.db).catch((e) => console.log('Accounts: cloud save failed -', e.message));
    }, 300);
  }

  hash(password, salt) { return crypto.scryptSync(String(password), salt, 32).toString('hex'); }

  profile(u) {
    return { name: u.name, coins: u.coins, owned: u.owned, equipped: u.equipped, stats: u.stats, admin: ADMINS.includes(u.key) };
  }

  issue(u) {
    const t = crypto.randomBytes(24).toString('hex');
    u.tokens = [...(u.tokens || []).slice(-4), t];
    this.tokens.set(t, u.key);
    this.save();
    return t;
  }

  // too many wrong passwords from one address -> slow down
  throttle(ip) {
    const now = Date.now();
    const a = (this.attempts.get(ip) || []).filter((t) => now - t < 60_000);
    a.push(now);
    this.attempts.set(ip, a);
    return a.length > 12;
  }

  // what a restore may bring back: real shop items only, sane numbers
  restoreInto(u, r) {
    if (!r || typeof r !== 'object') return;
    const n = (x, max) => Math.max(0, Math.min(max, Math.floor(Number(x) || 0)));
    u.coins = n(r.coins, MAX_COINS);
    const owned = Array.isArray(r.owned) ? r.owned.filter((k) => typeof k === 'string' && (() => { const [s, ...rest] = k.split(':'); return !!shopItem(s, rest.join(':')); })()) : [];
    u.owned = [...new Set([...STARTER.owned, ...owned])];
    const eq = r.equipped || {};
    for (const slot of ['vehicle', 'color', 'gear']) if (typeof eq[slot] === 'string' && this.has(u, slot + ':' + eq[slot])) u.equipped[slot] = eq[slot];
    const st = r.stats || {};
    u.stats = { laps: n(st.laps, 1e6), wins: n(st.wins, 1e6), tricks: n(st.tricks, 1e7) };
    // friends come back too, once both riders exist again
    u.friends = [];
    for (const fname of Array.isArray(r.friends) ? r.friends.slice(0, 100) : []) {
      const f = this.db.users[String(fname).toLowerCase()];
      if (!f || f.key === u.key) continue;
      u.friends.push(f.key);
      f.friends = f.friends || [];
      if (!f.friends.includes(u.key)) f.friends.push(u.key);
    }
    u.restored = Date.now();
  }

  // TESTING ONLY - see TEST_COINS
  grant(u) {
    const c = ADMINS.includes(u.key) ? 1_000_000 : TEST_COINS[u.key];
    if (c && u.coins < c) { u.coins = c; this.save(); }
    // admins own every vehicle, skin, gear set and upgrade
    if (ADMINS.includes(u.key)) {
      const all = SHOP.map((i) => i.slot + ':' + i.id);
      if (all.some((k) => !u.owned.includes(k))) { u.owned = [...new Set([...u.owned, ...all])]; this.save(); }
    }
  }

  register(name, password, ip, restore) {
    name = String(name || '').trim();
    if (!NAME_RE.test(name)) return { error: 'Names are 3-16 letters, numbers, spaces, _ . or -' };
    if (String(password || '').length < 4) return { error: 'Password must be at least 4 characters' };
    if (this.throttle(ip)) return { error: 'Too many tries - wait a minute' };
    const key = name.toLowerCase();
    if (this.db.users[key]) return { error: 'That name is taken - pick another or log in' };
    const salt = crypto.randomBytes(16).toString('hex');
    const u = { key, name, salt, hash: this.hash(password, salt), created: Date.now(), coins: STARTER.coins, owned: [...STARTER.owned], equipped: { ...STARTER.equipped }, stats: { laps: 0, wins: 0, tricks: 0 }, rewardLog: [] };
    if (restore) this.restoreInto(u, restore);
    this.db.users[key] = u;
    this.grant(u);
    return { token: this.issue(u), profile: this.profile(u), restored: !!restore };
  }

  login(name, password, ip) {
    if (this.throttle(ip)) return { error: 'Too many tries - wait a minute' };
    const u = this.db.users[String(name || '').trim().toLowerCase()];
    if (!u) return { error: 'No account with that name' };
    const h = this.hash(password, u.salt);
    if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(u.hash, 'hex'))) return { error: 'Wrong password' };
    this.grant(u);
    return { token: this.issue(u), profile: this.profile(u) };
  }

  user(token) { const k = this.tokens.get(token); return k ? this.db.users[k] : null; }

  buy(u, slot, id) {
    const item = shopItem(slot, id);
    if (!item) return { error: 'No such item' };
    const k = slot + ':' + id;
    if (u.owned.includes(k)) return { profile: this.profile(u) };
    if (!inShop(slot, id)) return { error: 'That is not in the item shop right now - check back when it rotates' };
    if (slot === 'upgrade') for (const n of upgradeNeeds(item)) if (!this.has(u, n)) return { error: n.startsWith('vehicle') ? 'Buy the vehicle first' : 'Buy the level below first' };
    if (u.coins < item.price) return { error: `Not enough coins (need ${item.price})` };
    u.coins -= item.price;
    u.owned.push(k);
    if (slot !== 'upgrade') u.equipped[slot] = id;
    this.save();
    return { profile: this.profile(u) };
  }

  // free items count as owned for everyone
  has(u, key) { if (u.owned.includes(key)) return true; const [slot, id] = key.split(':'); const it = shopItem(slot, id); return !!it && it.price === 0; }

  equip(u, slot, id) {
    if (!['vehicle', 'color', 'gear'].includes(slot)) return { error: 'Bad slot' };
    if (!this.has(u, slot + ':' + id)) return { error: 'You do not own that yet' };
    u.equipped[slot] = id;
    this.save();
    return { profile: this.profile(u) };
  }

  // coins earned on track (capped per reward and per 10 minutes to stop silly cheating)
  reward(u, kind, amount) {
    amount = Math.round(Number(amount));
    if (!Number.isFinite(amount) || amount <= 0) return { error: 'Bad amount' };
    amount = Math.min(MAX_REWARD, amount);
    const now = Date.now();
    u.rewardLog = (u.rewardLog || []).filter((r) => now - r[0] < 600_000);
    const recent = u.rewardLog.reduce((a, r) => a + r[1], 0);
    const allowed = Math.max(0, 6000 - recent);
    amount = Math.min(amount, allowed);
    if (amount > 0) {
      u.coins += amount;
      u.rewardLog.push([now, amount]);
      if (kind === 'lap') u.stats.laps++;
      if (kind === 'win') u.stats.wins++;
      if (kind === 'trick') u.stats.tricks++;
      this.save();
    }
    return { profile: this.profile(u), added: amount };
  }

  logout(token) {
    const u = this.user(token);
    if (u) { u.tokens = (u.tokens || []).filter((t) => t !== token); this.save(); }
    this.tokens.delete(token);
    return { ok: true };
  }

  // the whole HTTP side
  handle(req, res, ip) {
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
      res.end(JSON.stringify(obj));
    };
    if (req.method === 'OPTIONS') return send(204, {});
    const url = new URL(req.url, 'http://x');
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 65536) req.destroy(); });
    req.on('end', () => {
      let m = {};
      try { m = body ? JSON.parse(body) : {}; } catch { return send(400, { error: 'Bad request' }); }
      const r = url.pathname.replace('/api/', '');
      if (r === 'register') return send(200, this.register(m.name, m.password, ip, m.restore));
      if (r === 'login') return send(200, this.login(m.name, m.password, ip));
      if (r === 'info') return send(200, { ok: true, accounts: Object.keys(this.db.users).length });
      const u = this.user(token);
      if (!u) return send(401, { error: 'Please log in again' });
      if (r === 'me') { this.grant(u); return send(200, { profile: this.profile(u) }); }
      if (r === 'buy') return send(200, this.buy(u, m.slot, m.id));
      if (r === 'equip') return send(200, this.equip(u, m.slot, m.id));
      if (r === 'reward') return send(200, this.reward(u, m.kind, m.amount));
      if (r === 'logout') return send(200, this.logout(token));
      if (r.startsWith('casino/')) { const out = this.casino.handle(r, u, m); if (out) return send(200, out); }
      if (r.startsWith('admin/')) return send(200, this.admin.handle(r, u, m, url));
      if (r === 'friends' || r.startsWith('friends/')) { const out = this.friends.handle(r, u, m, url); if (out) return send(200, out); }
      return send(404, { error: 'Unknown' });
    });
  }
}

void VEHICLES; void BIKE_COLORS; void SHOP;
