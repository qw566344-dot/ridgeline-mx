// =====================================================================
//  CHAT BOX - a small "Chat" button (with a count of new messages),
//  bottom-left in the lobby and top-left while riding. Click it or press T
//  (or Enter) to open and type, Enter sends, Esc or Hide closes.
//  Admins can click a message to delete it.
// =====================================================================
import { escapeHtml, STAFF_TAGS } from './util.js';

const $ = (id) => document.getElementById(id);

export class ChatBox {
  constructor(ui, account) {
    this.ui = ui; this.A = account;
    this.after = 0; this.msgs = []; this.first = true; this.timer = null; this.unread = 0;
    this.el = $('chat'); this.log = $('chat-log'); this.input = $('chat-input');
    window.addEventListener('keydown', (e) => {
      if (!this.visible()) return;
      if ((e.key === 'Enter' || e.code === 'KeyT') && document.activeElement !== this.input) {
        if (e.target && (e.code === 'KeyT' ? /INPUT|TEXTAREA|SELECT/ : /INPUT|TEXTAREA|SELECT|BUTTON/).test(e.target.tagName)) return;
        e.preventDefault(); this.open(true); // preventDefault: the T is not typed into the box
      }
    });
    this.input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = this.input.value.trim();
        if (text) this.send();
        if (!text || this.riding()) this.open(false); // while riding, sending hands the keys back to the bike
      }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.open(false); }
    };
    $('chat-pill').onclick = () => this.open(true);
    $('chat-close').onclick = () => this.open(false);
    $('chat-send').onclick = () => this.send();
    this.log.onclick = (e) => {
      const m = e.target.closest('.cm');
      if (!m || !this.isAdmin() || !m.dataset.id) return;
      if (!m.dataset.sure) { m.dataset.sure = 1; m.title = 'Click again to delete'; m.style.outline = '1px solid var(--bad)'; return; }
      this.A.api('admin/chatdelete', { id: Number(m.dataset.id) }).then(() => { this.msgs = this.msgs.filter((x) => String(x.id) !== m.dataset.id); this.render(); });
    };
    this.loop();
  }

  available() { return this.A.mode === 'online' && !!this.A.token; }
  isAdmin() { return this.available() && this.A.profile && this.A.profile.admin; }
  // in the lobby, and while riding (not on the pause or results screens)
  riding() { return this.ui.screen === 'hud' && !!(this.ui.inGame && this.ui.inGame()); }
  visible() { return this.available() && (this.riding() || (this.ui.screen === 'home' && !(this.ui.inGame && this.ui.inGame()))); }
  isOpen() { return this.el.classList.contains('open'); }

  open(on) {
    this.el.classList.toggle('open', on);
    this.el.classList.toggle('admin', !!this.isAdmin());
    if (on) { this.unread = 0; this.badge(); this.input.focus(); this.render(); this.poll(); }
    else { this.input.blur(); this.input.value = ''; }
  }

  badge() { const b = $('chat-unread'); b.hidden = !this.unread; b.textContent = this.unread > 9 ? '9+' : String(this.unread); }

  async send() {
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = '';
    const r = await this.A.api('chat/send', { text }).catch(() => ({ error: 'Could not reach the server' }));
    if (r.error) { const m = { id: 0, name: '', text: r.error, system: true }; this.msgs.push(m); this.feed([m]); this.render(); return; }
    this.poll();
  }

  async poll() {
    if (!this.available()) return;
    const r = await this.A.api('chat?after=' + this.after).catch(() => null);
    if (!r || r.error || !r.messages) return;
    if (r.latest < this.after) { this.after = 0; this.msgs = []; return this.poll(); } // the chat was reset
    const fresh = r.messages.filter((m) => m.id > this.after);
    const old = this.first; // the first answer is history from before you came online
    this.first = false;
    if (!fresh.length) return;
    // count new messages from other riders
    const me = (this.A.profile && this.A.profile.name || '').toLowerCase();
    if (!old && !this.isOpen()) this.unread += fresh.filter((m) => m.name.toLowerCase() !== me).length;
    this.after = fresh[fresh.length - 1].id;
    this.msgs = this.msgs.concat(fresh).slice(-60);
    if (!old && this.riding()) this.feed(fresh.slice(-4));
    this.badge();
    if (this.isOpen()) this.render();
  }

  // show / hide straight away when you leave or come back to the lobby
  sync() {
    const show = this.visible();
    this.el.classList.toggle('off', !show);
    this.el.classList.toggle('riding', show && this.riding());
    if (!show && this.isOpen()) this.open(false);
  }

  loop() {
    clearTimeout(this.timer);
    if (!this.syncT) this.syncT = setInterval(() => this.sync(), 250);
    this.poll().finally(() => { this.timer = setTimeout(() => this.loop(), this.isOpen() ? 2000 : 5000); });
  }

  html(m) {
    const me = (this.A.profile && this.A.profile.name || '').toLowerCase();
    if (m.system) return `<div class="cm sys" data-id="${m.id || ''}">${escapeHtml(m.text)}</div>`;
    const tags = (STAFF_TAGS[m.name.toLowerCase()] || []).map(([label, cls]) => `<span class="stag ${cls}">${label}</span>`).join('');
    return `<div class="cm${m.name.toLowerCase() === me ? ' me' : ''}" data-id="${m.id}">${tags}<b>${escapeHtml(m.name)}</b>${escapeHtml(m.text)}</div>`;
  }

  render() {
    this.log.innerHTML = this.msgs.map((m) => this.html(m)).join('');
    this.log.scrollTop = this.log.scrollHeight;
  }

  // while riding: new messages show under the Chat button for 8 s, newest 4
  feed(list) {
    const box = $('chat-feed');
    for (const m of list) {
      box.insertAdjacentHTML('beforeend', this.html(m));
      const el = box.lastElementChild;
      setTimeout(() => el.remove(), 8000);
    }
    while (box.children.length > 4) box.removeChild(box.firstChild);
  }
}
