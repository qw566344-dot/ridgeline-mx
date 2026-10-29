// =====================================================================
//  CHAT BOX - bottom-left, for everyone on an online account.
//  Enter opens it (in the menus and while riding), Enter sends, Esc closes.
//  New messages show for a few seconds even when it is closed.
//  Admins can click a message to delete it.
// =====================================================================
import { escapeHtml, STAFF_TAGS } from './util.js';

const $ = (id) => document.getElementById(id);
const SHOW_MS = 9000; // closed chat: how long a new message stays on screen

export class ChatBox {
  constructor(ui, account) {
    this.ui = ui; this.A = account;
    this.after = 0; this.msgs = []; this.first = true; this.timer = null;
    this.el = $('chat'); this.log = $('chat-log'); this.input = $('chat-input');
    window.addEventListener('keydown', (e) => {
      if (!this.available()) return;
      if (e.key === 'Enter' && document.activeElement !== this.input) {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        e.preventDefault(); this.open(true);
      }
    });
    this.input.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (this.input.value.trim()) this.send(); else this.open(false); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.open(false); }
    };
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

  open(on) {
    this.el.classList.toggle('open', on);
    this.el.classList.toggle('admin', !!this.isAdmin());
    if (on) { this.input.focus(); this.render(); this.log.scrollTop = this.log.scrollHeight; this.poll(); }
    else { this.input.blur(); this.input.value = ''; }
  }

  async send() {
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = '';
    const r = await this.A.api('chat/send', { text }).catch(() => ({ error: 'Could not reach the server' }));
    if (r.error) { this.msgs.push({ id: 0, at: Date.now(), name: '', text: r.error, system: true }); this.render(); return; }
    this.poll();
  }

  async poll() {
    if (!this.available()) { this.el.classList.add('off'); return; }
    this.el.classList.remove('off');
    const r = await this.A.api('chat?after=' + this.after).catch(() => null);
    if (!r || r.error || !r.messages) return;
    if (r.latest < this.after) { this.after = 0; this.msgs = []; return this.poll(); } // the chat was reset
    const fresh = r.messages.filter((m) => m.id > this.after);
    if (!fresh.length) return;
    // messages from before you opened the game count as old (no pop-up)
    for (const m of fresh) m.seenAt = this.first ? 0 : Date.now();
    this.first = false;
    this.after = fresh[fresh.length - 1].id;
    this.msgs = this.msgs.concat(fresh).slice(-60);
    this.render();
  }

  loop() {
    clearTimeout(this.timer);
    const open = this.el.classList.contains('open');
    this.poll().finally(() => { this.timer = setTimeout(() => this.loop(), open ? 2000 : 4000); });
    // fade out messages that have been on screen long enough
    for (const el of this.log.children) if (Date.now() - Number(el.dataset.seen || 0) > SHOW_MS) el.classList.add('old');
  }

  render() {
    const me = (this.A.profile && this.A.profile.name || '').toLowerCase();
    const now = Date.now();
    this.log.innerHTML = this.msgs.map((m) => {
      if (m.system) return `<div class="cm sys${now - (m.seenAt ?? now) > SHOW_MS ? ' old' : ''}" data-seen="${m.seenAt ?? now}" data-id="${m.id || ''}">${escapeHtml(m.text)}</div>`;
      const tags = (STAFF_TAGS[m.name.toLowerCase()] || []).map(([label, cls]) => `<span class="stag ${cls}">${label}</span>`).join('');
      const old = now - (m.seenAt || 0) > SHOW_MS;
      return `<div class="cm${m.name.toLowerCase() === me ? ' me' : ''}${old ? ' old' : ''}" data-seen="${m.seenAt || 0}" data-id="${m.id}">${tags}<b>${escapeHtml(m.name)}</b>${escapeHtml(m.text)}</div>`;
    }).join('');
    this.log.scrollTop = this.log.scrollHeight;
  }
}
