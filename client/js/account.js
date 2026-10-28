// =====================================================================
//  ACCOUNT (client side)
//  Online: talks to the game server's /api (accounts work on every
//  device that uses the same server).
//  Offline: if the server can't be reached (e.g. you double-clicked the
//  game file and the server isn't running) accounts are kept in this
//  browser instead, with the password hashed. Guests also save locally.
// =====================================================================
import { serverBase } from './config.js';
import { STARTER, shopItem, MAX_REWARD, upgradeNeeds, inShop } from '/shared/shop.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

async function hashPassword(pw, salt) {
  const enc = new TextEncoder();
  if (window.crypto && crypto.subtle) {
    const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
    return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // very old browsers: a simple repeated hash (offline only)
  let h = 2166136261 >>> 0, s = salt + ':' + pw;
  for (let r = 0; r < 20000; r++) for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

function freshProfile(name) {
  return { name, coins: STARTER.coins, owned: [...STARTER.owned], equipped: { ...STARTER.equipped }, stats: { laps: 0, wins: 0, tricks: 0 } };
}

// Backup: every online account is also copied into this browser (coins, items,
// friends + a hash of the password). Free servers forget accounts when they
// restart; logging in then quietly re-creates the account from this copy.
export class Account {
  constructor() {
    const saved = LS.get('mx.account', null);
    this.mode = saved ? saved.mode : null;   // 'online' | 'offline' | 'guest' | null
    this.token = saved ? saved.token : null;
    this.name = saved ? saved.name : null;
    this.profile = saved ? saved.profile : null;
    this.listeners = [];
  }

  get loggedIn() { return !!this.profile; }
  onChange(f) { this.listeners.push(f); }
  changed() {
    LS.set('mx.account', { mode: this.mode, token: this.token, name: this.name, profile: this.profile });
    if (this.mode === 'online' && this.profile) this.backup();
    this.listeners.forEach((f) => f(this.profile));
  }

  // ---- the local copy of online accounts
  backups() { return LS.get('mx.backups', {}); }
  backup(check) {
    const all = this.backups(), k = this.profile.name.toLowerCase();
    const b = all[k] || {};
    all[k] = { ...b, name: this.profile.name, profile: this.profile, friends: this.friendNames || b.friends || [], check: check || b.check, salt: b.salt, at: Date.now() };
    LS.set('mx.backups', all);
  }
  async rememberPassword(pw) {
    const all = this.backups(), k = this.profile.name.toLowerCase();
    const salt = (all[k] && all[k].salt) || Math.random().toString(36).slice(2) + Date.now().toString(36);
    all[k] = { ...(all[k] || {}), salt, check: await hashPassword(pw, salt) };
    LS.set('mx.backups', all);
    this.backup(all[k].check);
  }
  setFriends(names) { this.friendNames = names; if (this.mode === 'online' && this.profile) this.backup(); }
  // the server does not know this name: bring the account back from this browser's copy
  async restore(name, password) {
    const b = this.backups()[name.trim().toLowerCase()];
    if (!b || !b.check || !b.salt) return null;
    if ((await hashPassword(password, b.salt)) !== b.check) return 'Wrong password';
    const r = await this.api('register', { name: b.name, password, restore: { ...b.profile, friends: b.friends || [] } });
    if (r.error) return r.error;
    this.set('online', r.token, r.profile);
    this.restoredNote = true;
    return '';
  }

  async api(path, body) {
    const res = await fetch(serverBase() + '/api/' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  }

  // on start-up: refresh an online profile (coins may have changed elsewhere)
  async init() {
    if (this.mode !== 'online' || !this.token) return;
    try {
      const r = await this.api('me');
      if (r.profile) { this.profile = r.profile; this.changed(); }
      else if (r.error) { this.expiredName = this.name; this.logout(); } // server restarted: log in again (progress comes back)
    } catch { /* server not reachable: keep the cached profile for now */ this.stale = true; }
  }

  async register(name, password) {
    try {
      const r = await this.api('register', { name, password });
      if (r.error) return r.error;
      this.set('online', r.token, r.profile);
      await this.rememberPassword(password);
      return null;
    } catch {
      // no server: make an offline account in this browser
      const all = LS.get('mx.localAccounts', {});
      const key = name.trim().toLowerCase();
      if (!/^[A-Za-z0-9_ .-]{3,16}$/.test(name.trim())) return 'Names are 3-16 letters, numbers, spaces, _ . or -';
      if (password.length < 4) return 'Password must be at least 4 characters';
      if (all[key]) return 'That name is taken on this computer - log in instead';
      const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
      all[key] = { salt, hash: await hashPassword(password, salt), profile: freshProfile(name.trim()) };
      LS.set('mx.localAccounts', all);
      this.set('offline', null, all[key].profile);
      this.offlineNote = true;
      return null;
    }
  }

  async login(name, password) {
    try {
      const r = await this.api('login', { name, password });
      if (r.error) {
        if (/No account/.test(r.error)) {
          // the server lost it (restart)? bring it back from this computer's copy
          const back = await this.restore(name, password);
          if (back === '') return null;
          if (back) return back;
          // an account that only lives on this computer?
          if (LS.get('mx.localAccounts', {})[name.trim().toLowerCase()]) return (await this.localLogin(name, password)) || null;
          return `The server has no account called "${name.trim()}". If you made it on another computer, it was lost when the free server restarted - log in once on that computer to bring it back, or create it again here.`;
        }
        return r.error;
      }
      this.set('online', r.token, r.profile);
      await this.rememberPassword(password);
      return null;
    } catch {
      return this.localLogin(name, password);
    }
  }

  async localLogin(name, password) {
    const all = LS.get('mx.localAccounts', {});
    const a = all[name.trim().toLowerCase()];
    if (!a) return 'No account with that name (the game server is not running, so only accounts made on this computer work)';
    if ((await hashPassword(password, a.salt)) !== a.hash) return 'Wrong password';
    this.set('offline', null, a.profile);
    return null;
  }

  guest() {
    const p = LS.get('mx.guest', null) || freshProfile('Guest');
    this.set('guest', null, p);
  }

  set(mode, token, profile) {
    this.mode = mode; this.token = token; this.profile = profile; this.name = profile.name;
    this.changed();
  }

  logout() {
    if (this.profile && this.mode !== 'guest') this.lastName = this.profile.name;
    if (this.mode === 'online' && this.token) this.api('logout', {}).catch(() => {});
    this.mode = null; this.token = null; this.profile = null; this.name = null;
    LS.del('mx.account');
    this.listeners.forEach((f) => f(null));
  }

  // save a local (offline / guest) profile
  persistLocal() {
    if (this.mode === 'guest') LS.set('mx.guest', this.profile);
    if (this.mode === 'offline') {
      const all = LS.get('mx.localAccounts', {});
      const k = this.profile.name.toLowerCase();
      if (all[k]) { all[k].profile = this.profile; LS.set('mx.localAccounts', all); }
    }
    this.changed();
  }

  owns(slot, id) {
    const it = shopItem(slot, id);
    if (it && it.price === 0) return true; // free items belong to everyone
    return !!this.profile && this.profile.owned.includes(slot + ':' + id);
  }
  equipped(slot) { return this.profile ? this.profile.equipped[slot] : STARTER.equipped[slot]; }
  get coins() { return this.profile ? this.profile.coins : 0; }

  async buy(slot, id) {
    const item = shopItem(slot, id);
    if (!item) return 'No such item';
    if (!this.owns(slot, id) && !inShop(slot, id)) return 'That is not in the item shop right now';
    if (this.mode === 'online') {
      try { const r = await this.api('buy', { slot, id }); if (r.error) return r.error; this.profile = r.profile; this.changed(); return null; }
      catch { return 'Can not reach the server to buy right now'; }
    }
    const p = this.profile;
    if (this.owns(slot, id)) return null;
    if (slot === 'upgrade') for (const n of upgradeNeeds(item)) { const [s2, i2] = n.split(':'); if (!this.owns(s2, i2)) return s2 === 'vehicle' ? 'Buy the vehicle first' : 'Buy the level below first'; }
    if (p.coins < item.price) return `Not enough coins (need ${item.price})`;
    p.coins -= item.price; p.owned.push(slot + ':' + id); if (slot !== 'upgrade') p.equipped[slot] = id;
    this.persistLocal();
    return null;
  }

  async equip(slot, id) {
    if (!this.owns(slot, id)) return 'You do not own that yet';
    if (this.mode === 'online') {
      try { const r = await this.api('equip', { slot, id }); if (r.error) return r.error; this.profile = r.profile; this.changed(); return null; }
      catch { this.profile.equipped[slot] = id; this.changed(); return null; }
    }
    this.profile.equipped[slot] = id;
    this.persistLocal();
    return null;
  }

  // coins for riding; returns how many were actually added
  async reward(kind, amount) {
    if (!this.profile || amount <= 0) return 0;
    amount = Math.min(MAX_REWARD, Math.round(amount));
    if (this.mode === 'online') {
      try { const r = await this.api('reward', { kind, amount }); if (r.profile) { this.profile = r.profile; this.changed(); } return r.added || 0; }
      catch { return 0; }
    }
    this.profile.coins += amount;
    if (kind === 'lap') this.profile.stats.laps++;
    if (kind === 'win') this.profile.stats.wins++;
    if (kind === 'trick') this.profile.stats.tricks++;
    this.persistLocal();
    return amount;
  }
}
