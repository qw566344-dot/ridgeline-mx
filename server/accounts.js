// =====================================================================
//  ACCOUNTS: name + password, coins, owned shop items, equipped items.
//  Saved to server/data/accounts.json. Passwords are never stored -
//  only a salted scrypt hash. Logged-in clients get a random token.
//  HTTP API (JSON):
//    POST /api/register {name, password}     -> {token, profile}
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
import { SHOP, STARTER, shopItem, MAX_REWARD, upgradeNeeds } from '../shared/shop.js';
import { VEHICLES, BIKE_COLORS } from '../shared/vehicles.js';

const NAME_RE = /^[A-Za-z0-9_ .-]{3,16}$/;

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
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.db));
      fs.renameSync(tmp, this.file);
    }, 300);
  }

  hash(password, salt) { return crypto.scryptSync(String(password), salt, 32).toString('hex'); }

  profile(u) {
    return { name: u.name, coins: u.coins, owned: u.owned, equipped: u.equipped, stats: u.stats };
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

  register(name, password, ip) {
    name = String(name || '').trim();
    if (!NAME_RE.test(name)) return { error: 'Names are 3-16 letters, numbers, spaces, _ . or -' };
    if (String(password || '').length < 4) return { error: 'Password must be at least 4 characters' };
    if (this.throttle(ip)) return { error: 'Too many tries - wait a minute' };
    const key = name.toLowerCase();
    if (this.db.users[key]) return { error: 'That name is taken - pick another or log in' };
    const salt = crypto.randomBytes(16).toString('hex');
    const u = { key, name, salt, hash: this.hash(password, salt), created: Date.now(), coins: STARTER.coins, owned: [...STARTER.owned], equipped: { ...STARTER.equipped }, stats: { laps: 0, wins: 0, tricks: 0 }, rewardLog: [] };
    this.db.users[key] = u;
    return { token: this.issue(u), profile: this.profile(u) };
  }

  login(name, password, ip) {
    if (this.throttle(ip)) return { error: 'Too many tries - wait a minute' };
    const u = this.db.users[String(name || '').trim().toLowerCase()];
    if (!u) return { error: 'No account with that name' };
    const h = this.hash(password, u.salt);
    if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(u.hash, 'hex'))) return { error: 'Wrong password' };
    return { token: this.issue(u), profile: this.profile(u) };
  }

  user(token) { const k = this.tokens.get(token); return k ? this.db.users[k] : null; }

  buy(u, slot, id) {
    const item = shopItem(slot, id);
    if (!item) return { error: 'No such item' };
    const k = slot + ':' + id;
    if (u.owned.includes(k)) return { profile: this.profile(u) };
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
    req.on('data', (d) => { body += d; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      let m = {};
      try { m = body ? JSON.parse(body) : {}; } catch { return send(400, { error: 'Bad request' }); }
      const r = url.pathname.replace('/api/', '');
      if (r === 'register') return send(200, this.register(m.name, m.password, ip));
      if (r === 'login') return send(200, this.login(m.name, m.password, ip));
      if (r === 'info') return send(200, { ok: true, accounts: Object.keys(this.db.users).length });
      const u = this.user(token);
      if (!u) return send(401, { error: 'Please log in again' });
      if (r === 'me') return send(200, { profile: this.profile(u) });
      if (r === 'buy') return send(200, this.buy(u, m.slot, m.id));
      if (r === 'equip') return send(200, this.equip(u, m.slot, m.id));
      if (r === 'reward') return send(200, this.reward(u, m.kind, m.amount));
      if (r === 'logout') return send(200, this.logout(token));
      return send(404, { error: 'Unknown' });
    });
  }
}

void VEHICLES; void BIKE_COLORS; void SHOP;
