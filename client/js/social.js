// =====================================================================
//  FRIENDS (client side). Talks to the home server's /api/friends
//  (server/friends.js). Every few seconds it reports what you are doing
//  (in the menu / in a party / riding, plus your party code) and gets
//  back your friends list, requests and party invites.
//  Needs an online account; offline and guest accounts get a message.
// =====================================================================
export class Social {
  constructor(account) {
    this.account = account;
    this.data = { friends: [], incoming: [], outgoing: [], invites: [] };
    this.listeners = [];
    this.inviteListeners = [];
    this.seen = new Set();
    this.presence = () => ({ status: 'menu' });
    this.fast = true;
    this.error = '';
    this.timer = null;
  }

  get available() { return this.account.mode === 'online' && !!this.account.token; }
  onChange(f) { this.listeners.push(f); }
  onInvite(f) { this.inviteListeners.push(f); }
  changed() { this.listeners.forEach((f) => f(this.data)); }

  start() {
    clearTimeout(this.timer);
    if (!this.available) { this.data = { friends: [], incoming: [], outgoing: [], invites: [] }; this.changed(); return; }
    const loop = async () => {
      await this.refresh();
      this.timer = setTimeout(loop, this.fast ? 5000 : 15000);
    };
    loop();
  }
  stop() { clearTimeout(this.timer); this.timer = null; }

  take(r) {
    if (!r || r.error) { this.error = r ? r.error : 'No connection'; return r && r.error ? r.error : 'Could not reach the server'; }
    this.error = '';
    this.data = { friends: r.friends || [], incoming: r.incoming || [], outgoing: r.outgoing || [], invites: r.invites || [], max: r.max };
    for (const inv of this.data.invites) {
      const k = inv.from + ':' + inv.code + ':' + inv.at;
      if (!this.seen.has(k)) { this.seen.add(k); this.inviteListeners.forEach((f) => f(inv)); }
    }
    this.changed();
    return null;
  }

  async call(route, body) {
    if (!this.available) return 'Log in with an online account to use friends';
    try { const r = await this.account.api(route, body); const e = this.take(r); return e ? e : (r.msg || null); }
    catch { this.error = 'Could not reach the server'; this.changed(); return this.error; }
  }

  // returns null or an error message
  async refresh() {
    if (!this.available) return null;
    try { return this.take(await this.account.api('friends', this.presence())); }
    catch { this.error = 'Friends are offline - the server can not be reached'; this.changed(); return this.error; }
  }

  async search(q) {
    if (!this.available) return { error: 'Log in with an online account to use friends' };
    try { return await this.account.api('friends/search?q=' + encodeURIComponent(q)); }
    catch { return { error: 'Could not reach the server' }; }
  }

  // these return { ok: message } or { error: message }
  async act(route, body) {
    const res = await this.call('friends/' + route, body);
    if (this.error) return { error: this.error };
    return { ok: res };
  }
  request(name) { return this.act('request', { name }); }
  accept(name) { return this.act('accept', { name }); }
  decline(name) { return this.act('decline', { name }); }
  cancel(name) { return this.act('cancel', { name }); }
  remove(name) { return this.act('remove', { name }); }
  invite(name, code, region) { return this.act('invite', { name, code, region }); }
  dismiss(inv) { return this.act('dismiss', { from: inv.from, code: inv.code }); }

  online() { return this.data.friends.filter((f) => f.online); }
}
