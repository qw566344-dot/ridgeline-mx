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
// PICTURES: only the account IMAGE_USER can put an image in the chat - by dragging one in (sent as a small data image,
// kept in memory only so the save stays small) or by typing a link to an image (kept as the link).
export const IMAGE_USER = 'lmkk';
export const MAX_DATA_IMG = 160_000;                       // characters of the data image the game sends (it shrinks the picture first)
export const DATA_IMG = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const IMG_URL = /^https?:\/\/[^\s"'<>\\]{4,1000}$/i;
// any web link works for the picture account (image search results, CDNs and so on have no file ending): the game just tries to show it as a picture
export const isImageUrl = (s) => IMG_URL.test(s);
const GAP_MS = 100; // spam away - this only stops a stuck key flooding the server

export class Chat {
  constructor(accounts) { this.A = accounts; this.imgs = new Map(); this.last = new Map(); this.timer = setInterval(() => { if (this.prune()) this.A.save(); }, 30 * 60 * 1000); this.timer.unref && this.timer.unref(); }

  get list() { return this.A.db.chat || (this.A.db.chat = []); }

  read(after) {
    after = Number(after) || 0;
    const list = this.list;
    return { messages: list.filter((m) => m.id > after).slice(-50).map((m) => (m.pic && this.imgs.has(m.id) ? { ...m, img: this.imgs.get(m.id) } : m)), latest: list.length ? list[list.length - 1].id : 0,
      // messages deleted lately: every game takes them off its screen (a deleted picture used to stay on other riders' screens)
      gone: (this.gone || []).filter((g) => Date.now() - g.at < 15 * 60_000).map((g) => g.id) };
  }

  send(u, m) {
    const full = String(m.text || '').replace(/\s+/g, ' ').trim();
    let text = full.slice(0, MAX_LEN);
    // pictures: only IMAGE_USER. A link to an image typed on its own becomes a picture for them; for everybody else it stays plain text.
    const mayPic = String(u.name).toLowerCase() === IMAGE_USER;
    let img = null, data = null;
    if (m.img !== undefined && m.img !== null && m.img !== '') {
      if (!mayPic) return { error: 'Only ' + IMAGE_USER + ' can send pictures' };
      const s = String(m.img);
      if (DATA_IMG.test(s) && s.length <= MAX_DATA_IMG) data = s;
      else if (isImageUrl(s)) img = s;
      else return { error: 'That picture is too big or not an image' };
    } else if (mayPic && isImageUrl(full)) { img = full; text = ''; } // (the whole link, even a long one)
    if (!text && !img && !data) return { error: 'Type a message first' };
    const mu = this.A.admin && this.A.admin.muted(u);
    if (mu) return { error: `You are muted for ${Math.ceil((mu - Date.now()) / 60000)} more min` };
    const now = Date.now();
    if (now - (this.last.get(u.key) || 0) < GAP_MS) return { error: 'Slow down a little' };
    this.last.set(u.key, now);
    const list = this.list;
    const id = (list.length ? list[list.length - 1].id : 0) + 1;
    list.push({ id, at: now, name: u.name, text, ...(img ? { img } : {}), ...(data ? { pic: true } : {}) });
    if (data) this.imgs.set(id, data);
    if (list.length > KEEP) list.splice(0, list.length - KEEP);
    for (const k of this.imgs.keys()) if (!list.some((x) => x.id === k)) this.imgs.delete(k); // pictures leave with their message
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

  remove(id) {
    const list = this.list; id = Number(id);
    const i = list.findIndex((m) => m.id === id);
    if (i < 0) return { error: 'No such message' };
    list.splice(i, 1);
    this.imgs.delete(id);                                  // the picture itself goes too
    (this.gone = this.gone || []).push({ id, at: Date.now() });
    this.gone = this.gone.filter((g) => Date.now() - g.at < 15 * 60_000).slice(-200);
    this.A.save();
    return { ok: 'Message deleted' };
  }
  // the rider who posted a message can delete it too (their own pictures)
  removeOwn(u, id) {
    const m = this.list.find((x) => x.id === Number(id));
    if (!m) return { error: 'No such message' };
    if (String(m.name).toLowerCase() !== String(u.name).toLowerCase() && !(this.A.admin && this.A.admin.isAdmin(u))) return { error: 'You can only delete your own messages' };
    return this.remove(id);
  }

  // clearing keeps the id counting up, so riders' "after" still works; the note carries clear: true,
  // which tells every game to wipe what it is showing (even when the list here is already empty)
  clear() {
    const list = this.list, last = list[list.length - 1];
    this.A.db.chat = [{ id: last ? last.id + 1 : Date.now(), at: Date.now(), name: 'Server', text: 'Chat was cleared by an admin', system: true, clear: true }];
    this.A.save();
    return { ok: 'Chat cleared for everyone' };
  }

  // PARTY pictures: the party chat runs over the game connection (small messages only), so a dragged-in picture is
  // handed in here first (over HTTP, picture account only) and the party message then just carries its ticket
  stash(u, m) {
    if (String(u.name).toLowerCase() !== IMAGE_USER) return { error: 'Only ' + IMAGE_USER + ' can send pictures' };
    const s = String(m.img || '');
    if (!(DATA_IMG.test(s) && s.length <= MAX_DATA_IMG)) return { error: 'That picture is too big or not an image' };
    this.tickets = this.tickets || new Map();
    const now = Date.now();
    for (const [k, v] of this.tickets) if (now - v.at > 60_000) this.tickets.delete(k);
    const id = Math.random().toString(36).slice(2) + now.toString(36);
    this.tickets.set(id, { at: now, key: u.key, data: s });
    return { ok: true, ticket: id };
  }
  // the party chat picks the picture up once
  take(id, key) {
    const v = this.tickets && this.tickets.get(String(id));
    if (!v || v.key !== key || Date.now() - v.at > 60_000) return null;
    this.tickets.delete(String(id));
    return v.data;
  }

  handle(route, u, m, url) {
    if (route === 'chat/stash') return this.stash(u, m);
    if (route === 'chat') return this.read(url.searchParams.get('after'));
    if (route === 'chat/send') return this.send(u, m);
    if (route === 'chat/delete') return this.removeOwn(u, m.id);
    return null;
  }
}
