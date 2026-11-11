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
const IMAGE_USER = 'lmkk';
const MAX_DATA_IMG = 160_000;                       // characters of the data image the game sends (it shrinks the picture first)
const DATA_IMG = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const IMG_URL = /^https?:\/\/[^\s"'<>\\]{4,480}$/i;
const IMG_EXT = /\.(png|jpe?g|gif|webp|avif)(\?[^\s]*)?$/i;
const IMG_HOST = /^https?:\/\/(i\.imgur\.com|media\.discordapp\.net|cdn\.discordapp\.com|pbs\.twimg\.com|i\.redd\.it|upload\.wikimedia\.org)\//i;
const isImageUrl = (s) => IMG_URL.test(s) && (IMG_EXT.test(s) || IMG_HOST.test(s));
const GAP_MS = 100; // spam away - this only stops a stuck key flooding the server

export class Chat {
  constructor(accounts) { this.A = accounts; this.imgs = new Map(); this.last = new Map(); this.timer = setInterval(() => { if (this.prune()) this.A.save(); }, 30 * 60 * 1000); this.timer.unref && this.timer.unref(); }

  get list() { return this.A.db.chat || (this.A.db.chat = []); }

  read(after) {
    after = Number(after) || 0;
    const list = this.list;
    return { messages: list.filter((m) => m.id > after).slice(-50).map((m) => (m.pic && this.imgs.has(m.id) ? { ...m, img: this.imgs.get(m.id) } : m)), latest: list.length ? list[list.length - 1].id : 0 };
  }

  send(u, m) {
    let text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
    // pictures: only IMAGE_USER. A link to an image typed on its own becomes a picture for them; for everybody else it stays plain text.
    const mayPic = String(u.name).toLowerCase() === IMAGE_USER;
    let img = null, data = null;
    if (m.img !== undefined && m.img !== null && m.img !== '') {
      if (!mayPic) return { error: 'Only ' + IMAGE_USER + ' can send pictures' };
      const s = String(m.img);
      if (DATA_IMG.test(s) && s.length <= MAX_DATA_IMG) data = s;
      else if (isImageUrl(s)) img = s;
      else return { error: 'That picture is too big or not an image' };
    } else if (mayPic && isImageUrl(text)) { img = text; text = ''; }
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
