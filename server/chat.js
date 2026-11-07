// =====================================================================
//  CHAT - one chat room for everyone logged in to an online account.
//    GET  /api/chat?after=ID   -> {messages: [{id, at, name, text}], latest}
//    POST /api/chat/send {text}
//  The last 100 messages are kept in memory (and in the accounts save,
//  so a cloud save keeps them too). Admins can delete or clear.
// =====================================================================
const KEEP = 60;
const MAX_AGE = 6 * 3600 * 1000; // messages older than this are dropped so the save stays small
const MAX_LEN = 200;
const GAP_MS = 100; // spam away - this only stops a stuck key flooding the server

export class Chat {
  constructor(accounts) { this.A = accounts; this.last = new Map(); this.timer = setInterval(() => { if (this.prune()) this.A.save(); }, 30 * 60 * 1000); this.timer.unref && this.timer.unref(); }

  get list() { return this.A.db.chat || (this.A.db.chat = []); }

  read(after) {
    after = Number(after) || 0;
    const list = this.list;
    return { messages: list.filter((m) => m.id > after).slice(-50), latest: list.length ? list[list.length - 1].id : 0 };
  }

  send(u, m) {
    const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
    if (!text) return { error: 'Type a message first' };
    const mu = this.A.admin && this.A.admin.muted(u);
    if (mu) return { error: `You are muted for ${Math.ceil((mu - Date.now()) / 60000)} more min` };
    const now = Date.now();
    if (now - (this.last.get(u.key) || 0) < GAP_MS) return { error: 'Slow down a little' };
    this.last.set(u.key, now);
    const list = this.list;
    const id = (list.length ? list[list.length - 1].id : 0) + 1;
    list.push({ id, at: now, name: u.name, text });
    if (list.length > KEEP) list.splice(0, list.length - KEEP);
    this.prune(now);
    this.A.save();
    return { ok: true, id };
  }

  // periodic cleanup: drop old messages (the newest is always kept so ids keep counting)
  prune(now = Date.now()) {
    const list = this.list;
    let n = 0;
    while (list.length > 1 && now - list[0].at > MAX_AGE) { list.shift(); n++; }
    return n;
  }

  remove(id) { const list = this.list; const i = list.findIndex((m) => m.id === Number(id)); if (i < 0) return { error: 'No such message' }; list.splice(i, 1); this.A.save(); return { ok: 'Message deleted' }; }

  // clearing keeps the id counting up, so riders' "after" still works; the note carries clear: true,
  // which tells every game to wipe what it is showing (even when the list here is already empty)
  clear() {
    const list = this.list, last = list[list.length - 1];
    this.A.db.chat = [{ id: last ? last.id + 1 : Date.now(), at: Date.now(), name: 'Server', text: 'Chat was cleared by an admin', system: true, clear: true }];
    this.A.save();
    return { ok: 'Chat cleared for everyone' };
  }

  handle(route, u, m, url) {
    if (route === 'chat') return this.read(url.searchParams.get('after'));
    if (route === 'chat/send') return this.send(u, m);
    return null;
  }
}
