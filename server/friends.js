// =====================================================================
//  FRIENDS + PRESENCE + PARTY INVITES (lives on the home server, next
//  to the accounts). Plain HTTP so it works with any region's parties:
//  the game posts what you are doing every few seconds and gets your
//  friends list, requests and invites back in the same reply.
//    POST /api/friends            {status, code, region, mode, track}  -> lists
//    GET  /api/friends/search?q=name                                    -> {results}
//    POST /api/friends/request    {name}   (also accepts if they already asked you)
//    POST /api/friends/accept     {name}
//    POST /api/friends/decline    {name}
//    POST /api/friends/cancel     {name}   (take back a request you sent)
//    POST /api/friends/remove     {name}
//    POST /api/friends/invite     {name, code, region}
//    POST /api/friends/dismiss    {from, code}
//  Online = posted presence in the last 40 s.
// =====================================================================
export const MAX_FRIENDS = 100;
const MAX_PENDING = 50;
const ONLINE_MS = 40_000;
const INVITE_MS = 5 * 60_000;
const STATUSES = ['menu', 'party', 'riding'];

export class Friends {
  constructor(accounts) {
    this.A = accounts;
    this.presence = new Map(); // key -> { at, status, code, region, mode, track }
    this.invites = new Map();  // key -> [{ from, fromKey, code, region, at }]
    this.searches = new Map(); // key -> [times]
  }

  lists(u) {
    u.friends = u.friends || []; u.incoming = u.incoming || []; u.outgoing = u.outgoing || [];
    return u;
  }

  online(key) { const p = this.presence.get(key); return p && Date.now() - p.at < ONLINE_MS ? p : null; }

  view(u) {
    this.lists(u);
    const now = Date.now();
    const person = (key) => {
      const f = this.A.db.users[key];
      if (!f) return null;
      const p = this.online(key);
      return {
        name: f.name,
        online: !!p,
        status: p ? p.status : 'offline',
        code: p && p.status !== 'menu' ? p.code : null,
        region: p ? p.region : null,
        mode: p ? p.mode : null,
        track: p ? p.track : null,
        lastSeen: p ? now : (this.presence.get(key) || {}).at || f.lastSeen || null,
      };
    };
    const inv = (this.invites.get(u.key) || []).filter((i) => now - i.at < INVITE_MS && u.friends.includes(i.fromKey));
    this.invites.set(u.key, inv);
    const friends = u.friends.map(person).filter(Boolean)
      .sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
    return {
      friends,
      incoming: u.incoming.map((k) => this.A.db.users[k]).filter(Boolean).map((f) => ({ name: f.name })),
      outgoing: u.outgoing.map((k) => this.A.db.users[k]).filter(Boolean).map((f) => ({ name: f.name })),
      invites: inv.map((i) => ({ from: i.from, code: i.code, region: i.region, at: i.at })),
      announce: this.A.admin ? this.A.admin.current() : null,
      pull: this.A.admin ? this.A.admin.takePull(u.key) : null,
      event: this.A.admin ? this.A.admin.eventFor(u) : null,
      admin: this.A.admin ? this.A.admin.takeInbox(u.key) : null,
      max: MAX_FRIENDS,
    };
  }

  heartbeat(u, m) {
    const p = {
      at: Date.now(),
      status: STATUSES.includes(m.status) ? m.status : 'menu',
      code: typeof m.code === 'string' && /^[A-Z0-9]{6}$/.test(m.code) ? m.code : null,
      region: typeof m.region === 'string' ? m.region.slice(0, 24) : null,
      mode: typeof m.mode === 'string' ? m.mode.slice(0, 16) : null,
      track: typeof m.track === 'string' ? m.track.slice(0, 24) : null,
    };
    this.presence.set(u.key, p);
    u.lastSeen = p.at;
    return this.view(u);
  }

  find(name) { return this.A.db.users[String(name || '').trim().toLowerCase()] || null; }

  search(u, q) {
    const now = Date.now();
    const t = (this.searches.get(u.key) || []).filter((x) => now - x < 10_000);
    if (t.length > 15) return { error: 'Slow down a little' };
    t.push(now); this.searches.set(u.key, t);
    q = String(q || '').trim().toLowerCase();
    if (q.length < 2) return { results: [] };
    this.lists(u);
    const out = [];
    for (const f of Object.values(this.A.db.users)) {
      if (!f.key.includes(q)) continue;
      out.push({
        name: f.name,
        you: f.key === u.key,
        friend: u.friends.includes(f.key),
        sent: u.outgoing.includes(f.key),
        received: u.incoming.includes(f.key),
        online: !!this.online(f.key),
        exact: f.key === q,
      });
    }
    out.sort((a, b) => (b.exact - a.exact) || a.name.length - b.name.length || a.name.localeCompare(b.name));
    return { results: out.slice(0, 12) };
  }

  request(u, name) {
    const f = this.find(name);
    if (!f) return { error: `No rider called "${String(name || '').slice(0, 16)}"` };
    if (f.key === u.key) return { error: 'That is you!' };
    this.lists(u); this.lists(f);
    if (u.friends.includes(f.key)) return { error: `${f.name} is already your friend` };
    if (u.incoming.includes(f.key)) return this.accept(u, f.name); // they asked first
    if (u.outgoing.includes(f.key)) return { error: `Request already sent to ${f.name}` };
    if (u.friends.length >= MAX_FRIENDS) return { error: `Your friends list is full (${MAX_FRIENDS})` };
    if (f.friends.length >= MAX_FRIENDS) return { error: `${f.name}'s friends list is full` };
    if (u.outgoing.length >= MAX_PENDING) return { error: 'Too many requests waiting - cancel some first' };
    if (f.incoming.length >= MAX_PENDING) return { error: `${f.name} has too many requests waiting` };
    u.outgoing.push(f.key); f.incoming.push(u.key);
    this.A.save();
    return { ...this.view(u), msg: `Friend request sent to ${f.name}` };
  }

  accept(u, name) {
    const f = this.find(name);
    this.lists(u);
    if (!f || !u.incoming.includes(f.key)) return { error: 'That request is gone' };
    this.lists(f);
    u.incoming = u.incoming.filter((k) => k !== f.key);
    f.outgoing = f.outgoing.filter((k) => k !== u.key);
    if (u.friends.length >= MAX_FRIENDS) return { error: `Your friends list is full (${MAX_FRIENDS})` };
    if (!u.friends.includes(f.key)) u.friends.push(f.key);
    if (!f.friends.includes(u.key)) f.friends.push(u.key);
    this.A.save();
    return { ...this.view(u), msg: `You and ${f.name} are now friends` };
  }

  decline(u, name) {
    const f = this.find(name);
    this.lists(u);
    if (f) { this.lists(f); u.incoming = u.incoming.filter((k) => k !== f.key); f.outgoing = f.outgoing.filter((k) => k !== u.key); this.A.save(); }
    return this.view(u);
  }

  cancel(u, name) {
    const f = this.find(name);
    this.lists(u);
    if (f) { this.lists(f); u.outgoing = u.outgoing.filter((k) => k !== f.key); f.incoming = f.incoming.filter((k) => k !== u.key); this.A.save(); }
    return this.view(u);
  }

  remove(u, name) {
    const f = this.find(name);
    this.lists(u);
    if (!f || !u.friends.includes(f.key)) return { error: 'Not on your friends list' };
    this.lists(f);
    u.friends = u.friends.filter((k) => k !== f.key);
    f.friends = f.friends.filter((k) => k !== u.key);
    this.invites.set(u.key, (this.invites.get(u.key) || []).filter((i) => i.fromKey !== f.key));
    this.invites.set(f.key, (this.invites.get(f.key) || []).filter((i) => i.fromKey !== u.key));
    this.A.save();
    return { ...this.view(u), msg: `Removed ${f.name}` };
  }

  invite(u, m) {
    const f = this.find(m.name);
    this.lists(u);
    if (!f || !u.friends.includes(f.key)) return { error: 'You can only invite friends' };
    if (typeof m.code !== 'string' || !/^[A-Z0-9]{6}$/.test(m.code)) return { error: 'Make a party first' };
    if (!this.online(f.key)) return { error: `${f.name} is offline` };
    const list = (this.invites.get(f.key) || []).filter((i) => i.fromKey !== u.key && Date.now() - i.at < INVITE_MS);
    list.push({ from: u.name, fromKey: u.key, code: m.code, region: typeof m.region === 'string' ? m.region.slice(0, 24) : null, at: Date.now() });
    this.invites.set(f.key, list.slice(-10));
    return { ...this.view(u), msg: `Invite sent to ${f.name}` };
  }

  dismiss(u, m) {
    this.invites.set(u.key, (this.invites.get(u.key) || []).filter((i) => !(i.from === m.from && i.code === m.code)));
    return this.view(u);
  }

  // route one /api/friends... request; returns the reply object or null if not ours
  handle(route, u, m, url) {
    switch (route) {
      case 'friends': return this.heartbeat(u, m);
      case 'friends/search': return this.search(u, url.searchParams.get('q'));
      case 'friends/request': return this.request(u, m.name);
      case 'friends/accept': return this.accept(u, m.name);
      case 'friends/decline': return this.decline(u, m.name);
      case 'friends/cancel': return this.cancel(u, m.name);
      case 'friends/remove': return this.remove(u, m.name);
      case 'friends/invite': return this.invite(u, m);
      case 'friends/dismiss': return this.dismiss(u, m);
      default: return null;
    }
  }
}
