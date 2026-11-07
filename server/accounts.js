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
//    POST /api/buy      {slot, id}           -> {profile}   (slot 'bundle': skin + matching kit)
//    POST /api/equip    {slot, id}           -> {profile}
//    POST /api/reward   {kind, amount}       -> {profile}
//    POST /api/logout
//  (send the token as  Authorization: Bearer <token>)
// =====================================================================
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SHOP, STARTER, shopItem, MAX_REWARD, upgradeNeeds, inShop, getBundle, bundleParts, bundlePrice, xpFor, levelInfo, vehicleLevel, RANK_START, rankTier, TP_PER_COIN, COIN_CAP } from '../shared/shop.js';
import { VEHICLES, BIKE_COLORS, ownsSpecials } from '../shared/vehicles.js';
import { Friends } from './friends.js';
import { Chat } from './chat.js';
import { cloudEnabled, cloudLoad, cloudSave } from './store.js';
import { Casino } from './casino.js';
import { hasBadWords } from '../shared/badwords.js';
import { todaysChallenges, statsFor, dayNo, weekNo, dayEnds, weekEnds } from '../shared/challenges.js';
import { Admin, ADMINS } from './admin.js';
import { PASS, passTier, PASS_PRICE } from '../shared/pass.js';

const splitKey = (k) => { const [s, ...rest] = String(k).split(':'); return [s, rest.join(':')]; };
const NAME_RE = /^[A-Za-z0-9_ .-]{3,16}$/;

// TESTING ONLY: accounts topped up to this many coins when they log in.
// Delete the line (or the name) when testing is over.
const TEST_COINS = { nahh: 1_000_000 };
const MAX_COINS = 5_000_000;
const CLOUD_RETRY_MS = Number(process.env.CLOUD_RETRY_MS) || 30_000; // background cloud load retry (tests make it short)

export class Accounts {
  constructor(dir) {
    this.file = path.join(dir, 'accounts.json');
    fs.mkdirSync(dir, { recursive: true });
    this.db = { users: {} };
    try { this.db = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* first run */ }
    this.tokens = new Map();
    for (const u of Object.values(this.db.users)) for (const t of u.tokens || []) this.tokens.set(t, u.key);
    this.attempts = new Map();
    this.bannedTokens = new Map(); // login tokens of riders banned since the server started -> reason (so their game hears "banned")
    this.saveTimer = null;
    this.friends = new Friends(this);
    this.casino = new Casino(this);
    this.admin = new Admin(this);
    this.chat = new Chat(this);
    this.startedAt = Date.now();
    // the cloud copy is never written until it has been read: a wiped local file
    // must not overwrite everyone's accounts (see loadCloud)
    this.cloudLoaded = !cloudEnabled;
    this.cloudBusy = false; this.cloudDirty = false; this.cloudRetry = null;
    this.ready = this.loadCloud();
  }

  // with a cloud save set up, the accounts there win over the (wiped) local file.
  // A failed load is tried again (3 times before the server opens, then every
  // 30 s in the background); until it works nothing is written to the cloud.
  async loadCloud(attempt = 1) {
    if (!cloudEnabled) { console.log('Accounts: saved on this server only (no cloud save set up)'); return; }
    try {
      const db = await cloudLoad();
      this.mergeCloud(db);
      this.cloudLoaded = true;
      console.log('Accounts: loaded', Object.keys(this.db.users).length, 'from the cloud save');
      if (this.cloudDirty || attempt > 1) this.cloudPush();
    } catch (e) {
      console.log(`Accounts: cloud load failed (try ${attempt}) -`, e.message);
      if (attempt < 3) { await new Promise((r) => setTimeout(r, (CLOUD_RETRY_MS / 15) * attempt)); return this.loadCloud(attempt + 1); }
      setTimeout(() => this.loadCloud(attempt + 1), CLOUD_RETRY_MS);
    }
  }

  // cloud accounts come in; anyone made or restored here since the server started keeps their local copy
  mergeCloud(db) {
    if (!db || !db.users) return;
    for (const [k, u] of Object.entries(this.db.users)) {
      const cu = db.users[k];
      if (!cu || (u.created || 0) >= this.startedAt || (u.restored || 0) >= this.startedAt) db.users[k] = u;
    }
    for (const key of ['admins', 'devs', 'adminLog', 'chat']) if (!db[key] && this.db[key]) db[key] = this.db[key];
    this.db = db;
    this.tokens = new Map();
    for (const u of Object.values(this.db.users)) for (const t of u.tokens || []) this.tokens.set(t, u.key);
  }

  // one cloud write at a time, always the latest data; a failed write is retried
  async cloudPush() {
    if (!cloudEnabled) return;
    if (!this.cloudLoaded || this.cloudBusy) { this.cloudDirty = true; return; }
    this.cloudBusy = true; this.cloudDirty = false;
    try { await cloudSave(this.db); }
    catch (e) {
      console.log('Accounts: cloud save failed, trying again soon -', e.message);
      this.cloudDirty = true;
      clearTimeout(this.cloudRetry);
      this.cloudRetry = setTimeout(() => { this.cloudRetry = null; this.cloudPush(); }, CLOUD_RETRY_MS / 6);
    } finally { this.cloudBusy = false; }
    if (this.cloudDirty && !this.cloudRetry) this.cloudPush();
    else if (!this.cloudDirty) { clearTimeout(this.cloudRetry); this.cloudRetry = null; }
  }

  writeLocal() {
    try {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.db));
      fs.renameSync(tmp, this.file); // a crash mid-write never leaves a half file
    } catch (e) { console.log('Accounts: could not write', this.file, '-', e.message); }
  }

  // write everything to disk (and the cloud save) right now - used when the server is shutting down
  async flush() {
    clearTimeout(this.saveTimer);
    this.writeLocal();
    if (!cloudEnabled || !this.cloudLoaded) return;
    for (let i = 0; i < 50 && this.cloudBusy; i++) await new Promise((r) => setTimeout(r, 100));
    try { await cloudSave(this.db); } catch (e) { console.log('Accounts: cloud save failed -', e.message); }
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { this.writeLocal(); this.cloudPush(); }, 300);
  }

  // new password (admin tool): every login token stops working
  setPassword(u, password) {
    u.salt = crypto.randomBytes(16).toString('hex');
    u.hash = this.hash(password, u.salt);
    for (const t of u.tokens || []) this.tokens.delete(t);
    u.tokens = [];
    this.save();
  }

  hash(password, salt) { return crypto.scryptSync(String(password), salt, 32).toString('hex'); }

  profile(u) {
    return { name: u.name, coins: u.coins, owned: u.owned, equipped: u.equipped, stats: u.stats, xp: u.xp || 0, level: levelInfo(u.xp || 0).level, rating: u.rating || RANK_START, tier: rankTier(u.rating || RANK_START), ranked: u.ranked || { races: 0, wins: 0 }, rating2: u.rating2 || RANK_START, tier2: rankTier(u.rating2 || RANK_START), ranked2: u.ranked2 || { races: 0, wins: 0 }, pass: u.pass || [], passP: u.passP || [], passPremium: !!u.passPremium, admin: this.admin.isAdmin(u) };
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
    // pass items can't come back from a saved copy (they are only earned on the Premium Pass)
    u.owned = [...new Set([...STARTER.owned, ...owned])].filter((k) => { const it = shopItem(...splitKey(k)) || {}; return (!it.special || ownsSpecials(u.key)) && !it.pass; });
    const eq = r.equipped || {};
    for (const slot of ['vehicle', 'color', 'gear']) if (typeof eq[slot] === 'string' && this.has(u, slot + ':' + eq[slot])) u.equipped[slot] = eq[slot];
    const st = r.stats || {};
    u.stats = { laps: n(st.laps, 1e6), wins: n(st.wins, 1e6), tricks: n(st.tricks, 1e7) };
    u.xp = n(r.xp, 1e8);
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
      const all = SHOP.filter((i) => !i.special || ownsSpecials(u.key)).map((i) => i.slot + ':' + i.id);
      if (all.some((k) => !u.owned.includes(k))) { u.owned = [...new Set([...u.owned, ...all])]; this.save(); }
    }
  }

  // ---- device bans: a ban also blocks the browsers and internet addresses the rider used,
  // so they can not just make a new account. Browsers can not read real hardware ids, so a
  // device is the random id the game keeps in that browser (client/js/account.js), plus the
  // "banned" note it keeps there; clearing the browser's site data removes both.
  track(u, dev) {
    if (!u || !dev) return;
    const add = (list, v) => (v ? [...(list || []).filter((x) => x !== v), v].slice(-8) : list || []);
    u.devices = add(u.devices, dev.id); u.ips = add(u.ips, dev.ip);
  }
  // the ban that blocks this browser / address (admins are never blocked), or null
  deviceBan(dev, u) {
    if (!dev || (u && this.admin.isAdmin(u))) return null;
    const D = this.db.bannedDevices || {}, I = this.db.bannedIps || {};
    if (dev.id && D[dev.id]) return D[dev.id];
    if (dev.ip && I[dev.ip]) return I[dev.ip];
    // the browser's own "banned" note counts unless an admin unbanned this browser / address
    const C = this.db.unbannedDevices || {};
    if (dev.flagged && !(dev.id && C[dev.id]) && !(dev.ip && C[dev.ip])) return 'this browser';
    return null;
  }
  // ban / unban everything this rider has logged in from (never an address an admin uses)
  banDevices(u, on) {
    const D = this.db.bannedDevices || (this.db.bannedDevices = {}), I = this.db.bannedIps || (this.db.bannedIps = {});
    const C = this.db.unbannedDevices || (this.db.unbannedDevices = {});
    for (const v of [...(u.devices || []), ...(u.ips || [])]) if (on) delete C[v]; else C[v] = u.name;
    if (on) {
      const adminIps = new Set(Object.values(this.db.users).filter((x) => this.admin.isAdmin(x)).flatMap((x) => x.ips || []));
      for (const d of u.devices || []) D[d] = u.name;
      for (const ip of u.ips || []) if (!adminIps.has(ip)) I[ip] = u.name;
      for (const t of u.tokens || []) this.bannedTokens.set(t, u.banReason || '');
    } else {
      for (const k of Object.keys(D)) if (D[k] === u.name) delete D[k];
      for (const k of Object.keys(I)) if (I[k] === u.name) delete I[k];
    }
  }

  register(name, password, ip, restore, dev) {
    name = String(name || '').trim();
    if (!NAME_RE.test(name)) return { error: 'Names are 3-16 letters, numbers, spaces, _ . or -' };
    if (hasBadWords(name) || hasBadWords(name.replace(/[_.-]+/g, ' '))) return { error: 'That name is not allowed - pick another' };
    if (String(password || '').length < 4) return { error: 'Password must be at least 4 characters' };
    if (this.throttle(ip)) return { error: 'Too many tries - wait a minute' };
    if (this.deviceBan(dev)) return { error: 'This device is banned - it can not make new accounts', banned: true };
    const key = name.toLowerCase();
    if (this.db.users[key]) return { error: 'That name is taken - pick another or log in' };
    // one account per player: a device that already made an account can not make another
    if (dev && dev.id) {
      const had = Object.values(this.db.users).find((x) => x.key !== key && (x.dev0 || (x.devices && x.devices[0])) === dev.id);
      if (had) return { error: 'This device already has an account (' + had.name + '). Accounts are limited to one per player - please log in to it.', oneAccount: true };
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const u = { key, name, salt, hash: this.hash(password, salt), created: Date.now(), coins: STARTER.coins, owned: [...STARTER.owned], equipped: { ...STARTER.equipped }, stats: { laps: 0, wins: 0, tricks: 0 }, rewardLog: [], dev0: (dev && dev.id) || undefined };
    if (restore) this.restoreInto(u, restore);
    this.db.users[key] = u;
    this.grant(u);
    return { token: this.issue(u), profile: this.profile(u), restored: !!restore, seal: this.seal(u) };
  }

  // the account's password check, handed to its owner's browser after a real login. If the
  // free server is wiped, that browser sends it back (revive) and the account - coins, items,
  // friends - comes back by itself, with the same password, without anyone logging in again.
  seal(u) { return { salt: u.salt, hash: u.hash }; }

  revive(m, ip, dev) {
    if (this.throttle(ip)) return { error: 'Too many tries - wait a minute' };
    const name = String(m.name || '').trim(), key = name.toLowerCase();
    // a wiped server forgets its bans; the banned browser's own note still keeps it out
    if (this.deviceBan(dev, this.db.users[key])) return { error: 'This account has been banned', banned: true };
    const token = String(m.token || ''), s = m.seal || {};
    if (!NAME_RE.test(name) || !/^[0-9a-f]{48}$/.test(token) || !/^[0-9a-f]{32}$/.test(String(s.salt)) || !/^[0-9a-f]{64}$/.test(String(s.hash))) return { error: 'Please log in again' };
    let u = this.db.users[key];
    if (u) {
      // the account is here already (someone revived or re-made it): only its owner gets in
      if (u.salt !== s.salt || u.hash !== s.hash) return { error: 'Please log in again' };
      if (u.banned) return { error: 'This account has been banned' };
    } else {
      u = { key, name, salt: s.salt, hash: s.hash, created: Date.now(), coins: STARTER.coins, owned: [...STARTER.owned], equipped: { ...STARTER.equipped }, stats: { laps: 0, wins: 0, tricks: 0 }, rewardLog: [] };
      this.restoreInto(u, m.restore);
      this.db.users[key] = u;
    }
    // keep the browser's own login token working
    if (!(u.tokens || []).includes(token)) { u.tokens = [...(u.tokens || []).slice(-4), token]; this.tokens.set(token, u.key); }
    this.grant(u);
    this.save();
    return { token, profile: this.profile(u), revived: true, seal: this.seal(u) };
  }

  login(name, password, ip, dev) {
    if (this.throttle(ip)) return { error: 'Too many tries - wait a minute' };
    const u = this.db.users[String(name || '').trim().toLowerCase()];
    if (!u) return { error: 'No account with that name' };
    const h = this.hash(password, u.salt);
    if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(u.hash, 'hex'))) return { error: 'Wrong password' };
    if (u.banned) return { error: 'This account has been banned', banned: true, reason: u.banReason || '' };
    if (this.deviceBan(dev, u)) return { error: 'This device is banned', banned: true };
    this.grant(u);
    return { token: this.issue(u), profile: this.profile(u), seal: this.seal(u) };
  }

  user(token) { const k = this.tokens.get(token); return k ? this.db.users[k] : null; }

  // a bike skin + its matching rider kit, both equipped
  buyBundle(u, id) {
    const b = getBundle(id);
    if (!b) return { error: 'No such bundle' };
    const owns = (s, i) => this.has(u, s + ':' + i);
    const price = bundlePrice(b, owns);
    if (u.coins < price) return { error: `Not enough coins (need ${price})` };
    u.coins -= price;
    for (const [s, i] of bundleParts(b)) { if (!owns(s, i)) u.owned.push(s + ':' + i); u.equipped[s] = i; }
    this.save();
    return { profile: this.profile(u) };
  }

  buy(u, slot, id) {
    if (slot === 'bundle') return this.buyBundle(u, id);
    const item = shopItem(slot, id);
    if (!item) return { error: 'No such item' };
    const k = slot + ':' + id;
    if (u.owned.includes(k)) return { profile: this.profile(u) };
    if (item.special || item.pass) return { error: 'That one is not for sale' };
    if (!inShop(slot, id)) return { error: 'That is not in the item shop right now - check back when it rotates' };
    const need = vehicleLevel(item);
    if (levelInfo(u.xp || 0).level < need) return { error: `Reach level ${need} to buy this` };
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
    if (!['vehicle', 'color', 'gear', 'rims', 'flame', 'sound', 'trail'].includes(slot)) return { error: 'Bad slot' };
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
    // trick points for the leaderboard: the game pays coins for trick points (REWARDS.trickPer100), so the points
    // come from the coins asked for (before the coin cap), with their own cap per 10 min
    if (kind === 'trick') {
      u.tpLog = (u.tpLog || []).filter((r) => now - r[0] < 600_000);
      const tp = Math.min(Math.round(amount * TP_PER_COIN), Math.max(0, 250_000 - u.tpLog.reduce((a, r) => a + r[1], 0)));
      if (tp > 0) { u.stats.tp = (u.stats.tp || 0) + tp; u.tpLog.push([now, tp]); this.lbCache = null; this.save(); }
    }
    // challenge progress counts the ride itself, so it keeps going after the coin cap is hit
    // (trick points from the amount asked for, which MAX_REWARD already limits)
    const C = this.chal(u);
    for (const [k, n] of Object.entries(statsFor(kind, amount))) { C.d[k] = (C.d[k] || 0) + n; C.w[k] = (C.w[k] || 0) + n; }
    u.rewardLog = (u.rewardLog || []).filter((r) => now - r[0] < 600_000);
    const recent = u.rewardLog.reduce((a, r) => a + r[1], 0);
    const allowed = Math.max(0, COIN_CAP - recent);
    amount = Math.min(amount, allowed);
    // Double Coins event: the bonus is on top of the normal cap
    const bonus = amount * ((this.admin ? this.admin.coinFactor() : 1) - 1);
    if (amount > 0) {
      u.coins += amount + bonus;
      u.rewardLog.push([now, amount]);
      if (kind === 'lap') u.stats.laps++;
      if (kind === 'win') u.stats.wins++;
      if (kind === 'trick') u.stats.tricks++;
      u.xp = (u.xp || 0) + xpFor(kind, amount);
    }
    this.save();
    return { profile: this.profile(u), added: amount + bonus };
  }

  // ---- the pass: one reward per level reached (shared/pass.js); each tier once
  // give one pass reward (an owned item turns into coins: half its price, pass-only items by rarity)
  grantPass(u, R) {
    if (R.coins) { u.coins += R.coins; return `+${R.coins.toLocaleString()} coins`; }
    const key = R.slot + ':' + R.id, item = shopItem(R.slot, R.id);
    if (!item) return null;
    if (u.owned.includes(key)) {
      const c = item.pass ? ({ Rare: 1000, Epic: 2000, Legendary: 4000 }[item.rarity] || 800) : Math.max(300, Math.round((item.price || 600) / 2));
      u.coins += c; return `already owned: +${c.toLocaleString()} coins`;
    }
    u.owned.push(key); return 'unlocked';
  }
  // claim a tier on one track ('free' or 'premium'); tier 0 = everything that is ready on both
  claimPass(u, tier, track) {
    u.pass = u.pass || []; u.passP = u.passP || [];
    const level = levelInfo(u.xp || 0).level, got = [];
    const one = (P, tr) => {
      const R = tr === 'premium' ? P.premium : P.free, list = tr === 'premium' ? u.passP : u.pass;
      if (!R || list.includes(P.tier) || level < P.level || (tr === 'premium' && !u.passPremium)) return;
      const g = this.grantPass(u, R);
      if (g) { list.push(P.tier); got.push(g); }
    };
    if (!tier) { for (const P of PASS) { one(P, 'free'); one(P, 'premium'); } }
    else {
      const P = passTier(tier);
      if (!P) return { error: 'No such reward' };
      const tr = track === 'premium' ? 'premium' : 'free', R = tr === 'premium' ? P.premium : P.free;
      if (!R) return { error: 'Nothing on that tier' };
      if (tr === 'premium' && !u.passPremium) return { error: 'That one is on the Premium Pass' };
      if ((tr === 'premium' ? u.passP : u.pass).includes(tier)) return { error: 'Already claimed' };
      if (level < P.level) return { error: `Reach level ${P.level} first` };
      one(P, tr);
    }
    if (!got.length) return { error: 'Nothing to claim yet' };
    this.save();
    return { ok: got.length === 1 ? got[0] : `${got.length} rewards claimed`, profile: this.profile(u) };
  }
  // the premium pass: coins only, once
  buyPass(u) {
    if (u.passPremium) return { error: 'You already have the Premium Pass' };
    if (u.coins < PASS_PRICE) return { error: `The Premium Pass costs ${PASS_PRICE.toLocaleString()} coins` };
    u.coins -= PASS_PRICE; u.passPremium = true;
    this.save();
    return { ok: 'Premium Pass unlocked!', profile: this.profile(u) };
  }

  // ---- challenges: today's / this week's counters (reset when the day / week turns over, UTC)
  chal(u) {
    const d = dayNo(), w = weekNo();
    const C = u.chal || (u.chal = { day: d, week: w, d: {}, w: {}, claimed: [] });
    if (C.day !== d) { C.day = d; C.d = {}; C.claimed = C.claimed.filter((id) => id.startsWith('w-')); }
    if (C.week !== w) { C.week = w; C.w = {}; C.claimed = C.claimed.filter((id) => id.startsWith('d-')); }
    return C;
  }
  challenges(u) {
    const C = this.chal(u), T = todaysChallenges();
    const row = (c, counts) => ({ id: c.id, text: c.text, goal: c.goal, progress: Math.min(c.goal, counts[c.stat] || 0), coins: c.coins, xp: c.xp, claimed: C.claimed.includes(c.id) });
    return { daily: T.daily.map((c) => row(c, C.d)), weekly: T.weekly.map((c) => row(c, C.w)), dayEnds: dayEnds(), weekEnds: weekEnds(), now: Date.now() };
  }
  claimChallenge(u, id) {
    const C = this.chal(u), T = todaysChallenges();
    const c = T.daily.find((x) => x.id === id) || T.weekly.find((x) => x.id === id);
    if (!c) return { error: 'That challenge is over' };
    if (C.claimed.includes(id)) return { error: 'Already claimed' };
    const counts = id.startsWith('w-') ? C.w : C.d;
    if ((counts[c.stat] || 0) < c.goal) return { error: 'Not done yet' };
    C.claimed.push(id);
    u.coins += c.coins; u.xp = (u.xp || 0) + c.xp;
    this.save();
    return { ok: `+${c.coins.toLocaleString()} coins and +${c.xp} XP`, profile: this.profile(u), ...this.challenges(u) };
  }

  // top 25 riders by trick points (cached for 30 s)
  leaderboard() {
    const now = Date.now();
    if (this.lbCache && now - this.lbCache.at < 30_000) return this.lbCache.data;
    const users = Object.values(this.db.users).filter((u) => !u.banned);
    const data = { tricks: users.map((u) => ({ name: u.name, v: (u.stats && u.stats.tp) || 0, level: levelInfo(u.xp || 0).level })).filter((r) => r.v > 0).sort((a, b) => b.v - a.v).slice(0, 25),
      // ranked: riders who have played at least one ranked race, by rating
      ranked: users.filter((u) => u.ranked && u.ranked.races).map((u) => ({ name: u.name, v: u.rating || RANK_START, tier: rankTier(u.rating || RANK_START), races: u.ranked.races, wins: u.ranked.wins })).sort((a, b) => b.v - a.v).slice(0, 25),
      // ranked 2v2: its own rating
      ranked2: users.filter((u) => u.ranked2 && u.ranked2.races).map((u) => ({ name: u.name, v: u.rating2 || RANK_START, tier: rankTier(u.rating2 || RANK_START), races: u.ranked2.races, wins: u.ranked2.wins })).sort((a, b) => b.v - a.v).slice(0, 25) };
    this.lbCache = { at: now, data };
    return data;
  }

  // levels for name tags: ?names=a,b,c -> { levels: { a: 3, ... } }
  levels(names) {
    const out = {};
    for (const n of String(names || "").split(",").slice(0, 40)) {
      const u = this.db.users[n.trim().toLowerCase()];
      if (u) out[n.trim()] = levelInfo(u.xp || 0).level;
    }
    return { levels: out };
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
      res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device, X-Banned', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
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
      // the browser's own id (X-Device) and its "this browser was banned" note (X-Banned), see bans below
      const dev = { id: /^[0-9a-f]{32}$/.test(String(req.headers['x-device'] || '')) ? req.headers['x-device'] : '', flagged: req.headers['x-banned'] === '1', ip };
      if (['register', 'login', 'revive'].includes(r)) {
        const out = r === 'register' ? this.register(m.name, m.password, ip, m.restore, dev) : r === 'login' ? this.login(m.name, m.password, ip, dev) : this.revive(m, ip, dev);
        if (out.token) this.track(this.user(out.token), dev);
        if (out.token && dev.flagged) out.clearBan = true; // unbanned: the browser can drop its "banned" note
        return send(200, out);
      }
      if (r === 'info') return send(200, { ok: true, accounts: Object.keys(this.db.users).length });
      if (r === 'leaderboard') return send(200, this.leaderboard());
      if (r === 'levels') return send(200, this.levels(url.searchParams.get('names')));
      if (r === 'tags') return send(200, { tags: this.admin.tags() }); // name tags anyone can see (DEV)
      const u = this.user(token);
      if (!u || u.banned) return send(401, { error: u || this.bannedTokens.has(token) ? 'This account has been banned' : 'Please log in again', ...(u ? { reason: u.banReason || '' } : this.bannedTokens.has(token) ? { reason: this.bannedTokens.get(token) } : {}) });
      if (r === 'me') { this.grant(u); this.track(u, dev); return send(200, { profile: this.profile(u), seal: this.seal(u) }); }
      // the game asks every few seconds: admin messages for this rider, and the profile again
      // when an admin changed it (coins, items, XP) - so nobody has to refresh
      if (r === 'inbox') {
        const rev = u.rev || 0, seen = Number(url.searchParams.get('rev'));
        return send(200, { admin: this.admin.takeInbox(u.key), rev, ...(seen !== rev ? { profile: this.profile(u) } : {}) });
      }
      if (r === 'buy') return send(200, this.buy(u, m.slot, m.id));
      if (r === 'equip') return send(200, this.equip(u, m.slot, m.id));
      if (r === 'reward') return send(200, this.reward(u, m.kind, m.amount));
      if (r === 'challenges') return send(200, this.challenges(u));
      if (r === 'challenges/claim') return send(200, this.claimChallenge(u, String(m.id || '')));
      if (r === 'pass/claim') return send(200, this.claimPass(u, Number(m.tier) || 0, String(m.track || 'free')));
      if (r === 'pass/buy') return send(200, this.buyPass(u));
      if (r === 'logout') return send(200, this.logout(token));
      if (r.startsWith('casino/')) { const out = this.casino.handle(r, u, m); if (out) return send(200, out); }
      if (r === 'chat' || r.startsWith('chat/')) { const out = this.chat.handle(r, u, m, url); if (out) return send(200, out); }
      if (r.startsWith('admin/')) return send(200, this.admin.handle(r, u, m, url));
      if (r === 'friends' || r.startsWith('friends/')) { const out = this.friends.handle(r, u, m, url); if (out) return send(200, out); }
      return send(404, { error: 'Unknown' });
    });
  }
}

void VEHICLES; void BIKE_COLORS; void SHOP;
