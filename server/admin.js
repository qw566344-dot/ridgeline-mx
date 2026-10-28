// =====================================================================
//  ADMIN PANEL (server side). Only the accounts in ADMINS may use it;
//  the game opens the panel with the "-" key for them.
//    GET  /api/admin/users?q=          -> {users: [{name, coins, created, lastSeen, online, items}]}
//    POST /api/admin/coins  {name, add} or {name, set}
//    POST /api/admin/unlock {name}       (every vehicle, skin, gear and upgrade)
//    POST /api/admin/reset  {name}       (back to a fresh account, keeps the password)
//  Note: on free hosting the server forgets accounts when it restarts; log in
//  as an admin soon after a restart so nobody else can take the name.
// =====================================================================
import { SHOP, STARTER } from '../shared/shop.js';

export const ADMINS = ['lmkk'];

export class Admin {
  constructor(accounts) { this.A = accounts; }
  isAdmin(u) { return !!u && ADMINS.includes(u.key); }

  users(q) {
    q = String(q || '').trim().toLowerCase();
    const F = this.A.friends;
    const list = Object.values(this.A.db.users)
      .filter((u) => !q || u.key.includes(q))
      .map((u) => ({ name: u.name, coins: u.coins, created: u.created, lastSeen: u.lastSeen || null, online: !!(F && F.online(u.key)), items: u.owned.length }))
      .sort((a, b) => (b.online - a.online) || (b.lastSeen || 0) - (a.lastSeen || 0));
    return { users: list.slice(0, 200), total: Object.keys(this.A.db.users).length };
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

  reset(m) {
    const u = this.find(m.name);
    if (!u) return { error: 'No such rider' };
    u.coins = STARTER.coins; u.owned = [...STARTER.owned]; u.equipped = { ...STARTER.equipped }; u.stats = { laps: 0, wins: 0, tricks: 0 };
    this.A.save();
    return { ok: `Reset ${u.name}` };
  }

  handle(route, u, m, url) {
    if (!route.startsWith('admin/')) return null;
    if (!this.isAdmin(u)) return { error: 'Admins only' };
    switch (route) {
      case 'admin/users': return this.users(url.searchParams.get('q'));
      case 'admin/coins': return this.coins(m);
      case 'admin/unlock': return this.unlock(m);
      case 'admin/reset': return this.reset(m);
      default: return { error: 'Unknown admin action' };
    }
  }
}
