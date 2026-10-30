// =====================================================================
//  CHAT BOX - always open: bottom-left in the lobby, top-left (smaller,
//  see-through) while riding. Press T or Enter (or click it) to type,
//  Enter sends and - while riding - hands the keys back to the bike,
//  Esc stops typing.
//  Two tabs: Global (everyone with an online account, over HTTP) and
//  Party (only your party, over the game connection) - the Party tab only
//  shows while you are in a party.
//  Admins can click a global message to delete it.
// =====================================================================
import { escapeHtml, STAFF_TAGS } from './util.js';

const $ = (id) => document.getElementById(id);

export class ChatBox {
  constructor(ui, account, net) {
    this.ui = ui; this.A = account; this.net = net;
    this.after = 0; this.msgs = []; this.first = true; this.timer = null;
    this.pmsgs = []; this.tab = 'global'; this.unread = { global: 0, party: 0 };
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
      if (e.key === 'Tab') { e.preventDefault(); this.setTab(this.tab === 'global' && this.inParty() ? 'party' : 'global'); }
    };
    this.input.onfocus = () => this.open(true);
    this.input.onblur = () => this.el.classList.remove('typing');
    $('chat-send').onclick = () => this.send();
    this.el.querySelectorAll('[data-chat-tab]').forEach((b) => b.onclick = () => { this.setTab(b.dataset.chatTab); this.input.focus(); });
    this.log.onclick = (e) => {
      const m = e.target.closest('.cm');
      if (this.tab !== 'global' || !m || !this.isAdmin() || !m.dataset.id) return;
      if (!m.dataset.sure) { m.dataset.sure = 1; m.title = 'Click again to delete'; m.style.outline = '1px solid var(--bad)'; return; }
      this.A.api('admin/chatdelete', { id: Number(m.dataset.id) }).then(() => { this.msgs = this.msgs.filter((x) => String(x.id) !== m.dataset.id); this.render(); });
    };
    if (net) net.onPartyChat = (m) => this.partyMessage(m);
    this.loop();
  }

  available() { return this.A.mode === 'online' && !!this.A.token; }
  inParty() { return !!(this.net && this.net.code && this.net.party); }
  isAdmin() { return this.available() && this.A.profile && this.A.profile.admin; }
  myName() { return ((this.A.profile && this.A.profile.name) || (this.net && this.net.name()) || '').toLowerCase(); }
  // in the lobby, and while riding (not on the pause or results screens)
  riding() { return this.ui.screen === 'hud' && !!(this.ui.inGame && this.ui.inGame()); }
  visible() { return (this.available() || this.inParty()) && (this.riding() || (this.ui.screen === 'home' && !(this.ui.inGame && this.ui.inGame()))); }
  // the box is always shown; "open" means you are typing in it
  isOpen() { return this.el.classList.contains('typing'); }

  open(on) {
    this.el.classList.toggle('typing', on);
    this.el.classList.toggle('admin', !!this.isAdmin());
    if (on) { this.unread[this.tab] = 0; this.badge(); if (document.activeElement !== this.input) this.input.focus(); this.render(); this.poll(); }
    else { this.input.blur(); this.input.value = ''; }
  }

  setTab(tab) {
    if (tab === 'party' && !this.inParty()) tab = 'global';
    if (tab === 'global' && !this.available()) tab = 'party';
    this.tab = tab;
    this.el.querySelectorAll('[data-chat-tab]').forEach((b) => b.classList.toggle('sel', b.dataset.chatTab === tab));
    this.input.placeholder = tab === 'party' ? 'Message your party, Enter sends' : 'Message everyone, Enter sends';
    if (this.isOpen()) this.unread[tab] = 0;
    this.badge();
    this.render();
  }

  // a dot on the other tab when it has something new
  badge() {
    for (const t of ['global', 'party']) { const d = $('chat-dot-' + t); if (d) d.hidden = !this.unread[t] || this.tab === t; }
  }

  async send() {
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = '';
    if (this.tab === 'party') {
      if (!this.inParty() || !this.net.connected) { this.system('Not connected to your party', 'party'); return; }
      this.net.send({ t: 'pchat', text });
      return;
    }
    const r = await this.A.api('chat/send', { text }).catch(() => ({ error: 'Could not reach the server' }));
    if (r.error) { this.system(r.error, 'global'); return; }
    this.poll();
  }

  system(text, tab) {
    const m = { id: 0, name: '', text, system: true };
    (tab === 'party' ? this.pmsgs : this.msgs).push(m);
    this.render();
  }

  // a message in your party (from the game server)
  partyMessage(m) {
    const msg = { id: 0, name: String(m.name || ''), text: String(m.text || ''), party: true, system: !!m.system };
    this.pmsgs = this.pmsgs.concat(msg).slice(-60);
    if (msg.name.toLowerCase() !== this.myName() && this.tab !== 'party') this.unread.party++;
    this.badge();
    this.render();
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
    const me = this.myName();
    if (!old && this.tab !== 'global') this.unread.global += fresh.filter((m) => m.name.toLowerCase() !== me).length;
    this.after = fresh[fresh.length - 1].id;
    this.msgs = this.msgs.concat(fresh).slice(-60);
    this.badge();
    this.render();
  }

  // show / hide straight away when you leave or come back to the lobby,
  // and the Party tab only while you are in a party
  sync() {
    const show = this.visible();
    this.el.classList.toggle('off', !show);
    this.el.classList.toggle('riding', show && this.riding());
    if (!show && this.isOpen()) this.open(false);
    const party = this.inParty();
    $('chat-tabs').hidden = !party;
    if (party && this.partyCode !== this.net.code) { this.partyCode = this.net.code; this.pmsgs = []; this.unread.party = 0; this.badge(); }
    if (!party && this.partyCode) { this.partyCode = null; this.pmsgs = []; this.unread.party = 0; this.badge(); }
    if (show && !this.drawn) { this.drawn = true; this.render(); } // first time on screen: the empty-chat hint
    if (show && ((this.tab === 'party' && !party) || (this.tab === 'global' && !this.available()))) this.setTab(this.tab === 'party' ? 'global' : 'party');
  }

  loop() {
    clearTimeout(this.timer);
    if (!this.syncT) this.syncT = setInterval(() => this.sync(), 250);
    this.poll().finally(() => { this.timer = setTimeout(() => this.loop(), this.isOpen() ? 2000 : this.visible() ? 3000 : 6000); });
  }

  html(m) {
    const me = this.myName();
    if (m.system) return `<div class="cm sys" data-id="${m.id || ''}">${escapeHtml(m.text)}</div>`;
    const tags = (STAFF_TAGS[m.name.toLowerCase()] || []).map(([label, cls]) => `<span class="stag ${cls}">${label}</span>`).join('');
    return `<div class="cm${m.name.toLowerCase() === me ? ' me' : ''}${m.party ? ' pt' : ''}" data-id="${m.id}">${tags}<b>${escapeHtml(m.name)}</b>${escapeHtml(m.text)}</div>`;
  }

  render() {
    const list = this.tab === 'party' ? this.pmsgs : this.msgs;
    this.log.innerHTML = list.length ? list.map((m) => this.html(m)).join('') : `<div class="cm sys">${this.tab === 'party' ? 'Only your party sees these messages.' : 'Say hi to everyone online.'}</div>`;
    this.log.scrollTop = this.log.scrollHeight;
  }
}
