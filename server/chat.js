// =====================================================================
//  CHAT - one chat room for everyone logged in to an online account.
//    GET  /api/chat?after=ID   -> {messages: [{id, at, name, text}], latest}
//    POST /api/chat/send {text}
//  The last 100 messages are kept in memory (and in the accounts save,
//  so a cloud save keeps them too). Admins can delete or clear.
// =====================================================================
const KEEP = 100;
const MAX_LEN = 200;
const GAP_MS = 1200; // one message per 1.2 s per rider

export class Chat {
  constructor(accounts) { this.A = accounts; this.last = new Map(); }

  get list() { return this.A.db.chat || (this.A.db.chat = []); }

  read(after) {
    after = Number(after) || 0;
    const list = this.list;
    return { messages: list.filter((m) => m.id > after).slice(-50), latest: list.length ? list[list.length - 1].id : 0 };
  }

  send(u, m) {
    const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
    if (!text) return { error: 'Type a message first' };
    const now = Date.now();
    if (now - (this.last.get(u.key) || 0) < GAP_MS) return { error: 'Slow down a little' };
    this.last.set(u.key, now);
    const list = this.list;
    const id = (list.length ? list[list.length - 1].id : 0) + 1;
    list.push({ id, at: now, name: u.name, text });
    if (list.length > KEEP) list.splice(0, list.length - KEEP);
    this.A.save();
    return { ok: true, id };
  }

  remove(id) { const list = this.list; const i = list.findIndex((m) => m.id === Number(id)); if (i < 0) return { error: 'No such message' }; list.splice(i, 1); this.A.save(); return { ok: 'Message deleted' }; }

  // clearing keeps the id counting up, so riders' "after" still works
  clear() { const list = this.list; const last = list[list.length - 1]; this.A.db.chat = []; if (last) this.A.db.chat.push({ id: last.id + 1, at: Date.now(), name: 'Server', text: 'Chat was cleared by an admin', system: true }); this.A.save(); return { ok: 'Chat cleared' }; }

  handle(route, u, m, url) {
    if (route === 'chat') return this.read(url.searchParams.get('after'));
    if (route === 'chat/send') return this.send(u, m);
    return null;
  }
}
