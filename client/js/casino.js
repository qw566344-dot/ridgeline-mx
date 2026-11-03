// =====================================================================
//  CASINO SCREEN (Lobby > Casino): roulette and crash with your coins.
//  Online accounts: the server decides every result (server/casino.js).
//  Offline / guest accounts: the same rules run here (shared/casino.js).
// =====================================================================
import { checkBet, validPick, roulettePayout, rouletteColor, crashMult, crashPointFrom, MIN_BET, bjDeal, bjHit, bjStand, bjDouble, bjCanDouble, bjView } from '/shared/casino.js';

const $ = (id) => document.getElementById(id);
// the pockets round a European wheel, clockwise from 0
const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const POCKET = { red: '#c81e2a', black: '#17181c', green: '#138a43' };

export class CasinoUI {
  constructor(ui, account) {
    this.ui = ui; this.A = account;
    this.pick = 'red';
    this.history = [];
    this.crashHist = [];
    this.round = null;
    this.spinning = false;
    this.wire();
  }

  online() { return this.A.mode === 'online' && this.A.token; }

  // ---- talking to the server (or doing it here for local accounts)
  async call(route, body) {
    if (this.online()) {
      try {
        const r = await this.A.api('casino/' + route, body);
        if (r.profile) { this.A.profile = r.profile; this.A.changed(); }
        return r;
      } catch { return { error: 'Could not reach the server' }; }
    }
    const p = this.A.profile;
    const save = () => this.A.persistLocal();
    if (route === 'roulette') {
      if (!validPick(body.pick)) return { error: 'Pick something to bet on' };
      const b = checkBet(body.bet, p.coins); if (b.error) return b;
      const n = Math.floor(Math.random() * 37), payout = roulettePayout(body.pick, n), win = b.amount * payout;
      p.coins += win - b.amount; save();
      return { result: n, color: rouletteColor(n), payout, win };
    }
    if (route === 'crash/start') {
      const b = checkBet(body.bet, p.coins); if (b.error) return b;
      p.coins -= b.amount; save();
      this.local = { bet: b.amount, start: Date.now(), cp: crashPointFrom(Math.random()) };
      return { id: 'local' };
    }
    if (route.startsWith('bj/')) { // blackjack, same rules as the server
      const a = route.slice(3);
      let h = this.localHand;
      if (a === 'deal') {
        if (h && !h.done) return { error: 'Finish the hand you are playing first' };
        const b = checkBet(body.bet, p.coins); if (b.error) return b;
        p.coins -= b.amount; h = this.localHand = bjDeal(b.amount, (n) => Math.floor(Math.random() * n));
      } else {
        if (!h || h.done) return { error: 'Deal a new hand' };
        if (a === 'hit') bjHit(h); else if (a === 'stand') bjStand(h);
        else if (a === 'double') { if (!bjCanDouble(h) || p.coins < h.bet) return { error: 'You can not double now' }; p.coins -= h.bet; bjDouble(h); }
      }
      if (h.done) { p.coins += h.win; this.localHand = null; }
      save();
      return { hand: bjView(h) };
    }
    const L = this.local;
    if (!L) return { crashed: true, gone: true };
    const mult = crashMult(Date.now() - L.start);
    if (route === 'crash/check') { if (mult >= L.cp) { this.local = null; return { crashed: true, crashPoint: L.cp, mult: L.cp }; } return { crashed: false, mult }; }
    if (route === 'crash/cashout') {
      this.local = null;
      const m = Math.floor(mult * 100) / 100;
      if (m >= L.cp) return { cashed: false, crashPoint: L.cp };
      const win = Math.floor(L.bet * m); p.coins += win; save();
      return { cashed: true, mult: m, win, crashPoint: L.cp };
    }
    return { error: 'Unknown' };
  }

  // switch the game on screen (Roulette / Blackjack / Crash tabs)
  setGame(id) {
    this.game = id;
    try { localStorage.setItem('mx.casinoGame', id); } catch { /* private mode */ }
    document.querySelectorAll('[data-cgame]').forEach((b) => b.classList.toggle('sel', b.dataset.cgame === id));
    document.querySelectorAll('.casino-stage [data-game]').forEach((g) => (g.hidden = g.dataset.game !== id));
    if (id === 'crash' && !this.round) this.drawCrash(1, false);
  }

  // the roulette wheel: coloured pockets (one conic gradient) with their numbers round the rim
  buildWheel() {
    const disc = $('rl-disc');
    if (!disc || disc.childElementCount) return;
    const step = 360 / WHEEL.length;
    disc.style.background = 'conic-gradient(' + WHEEL.map((n, i) => `${POCKET[rouletteColor(n)]} ${i * step}deg ${(i + 1) * step}deg`).join(',') + ')';
    disc.innerHTML = WHEEL.map((n, i) => `<span style="transform: rotate(${(i + 0.5) * step}deg)"><b>${n}</b></span>`).join('');
    this.wheelRot = 0;
  }

  wire() {
    this.buildWheel();
    document.querySelectorAll('[data-cgame]').forEach((b) => b.onclick = () => this.setGame(b.dataset.cgame));
    let last = null; try { last = localStorage.getItem('mx.casinoGame'); } catch { /* private mode */ }
    this.setGame(['roulette', 'blackjack', 'crash'].includes(last) ? last : 'roulette');
    document.querySelectorAll('[data-chip]').forEach((b) => b.onclick = () => {
      const inp = $(b.dataset.for);
      const v = b.dataset.chip;
      const coins = this.A.coins;
      inp.value = v === 'max' ? Math.min(coins, 1_000_000) : v === 'half' ? Math.max(MIN_BET, Math.floor((Number(inp.value) || 0) / 2)) : v === 'x2' ? Math.min(coins, (Number(inp.value) || MIN_BET) * 2) : (Number(inp.value) || 0) + Number(v);
    });
    document.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => { this.pick = b.dataset.pick; this.renderPicks(); });
    $('rl-num').oninput = () => { const n = Math.max(0, Math.min(36, Math.floor(Number($('rl-num').value) || 0))); this.pick = 'n' + n; this.renderPicks(); };
    $('rl-spin').onclick = () => this.spin();
    $('cr-go').onclick = () => (this.round ? this.cashOut() : this.startCrash());
    $('bj-deal').onclick = () => this.bjMove('deal');
    $('bj-hit').onclick = () => this.bjMove('hit');
    $('bj-stand').onclick = () => this.bjMove('stand');
    $('bj-double').onclick = () => this.bjMove('double');
  }

  show() {
    $('casino-coins').textContent = this.A.coins.toLocaleString();
    this.renderPicks();
    this.renderHist();
    this.drawCrash(1, false);
  }

  renderPicks() {
    document.querySelectorAll('[data-pick]').forEach((b) => b.classList.toggle('sel', b.dataset.pick === this.pick));
    $('rl-num').classList.toggle('sel', this.pick.startsWith('n'));
    const names = { red: 'Red (x2)', black: 'Black (x2)', green: 'Green 0 (x36)', odd: 'Odd (x2)', even: 'Even (x2)', low: '1-18 (x2)', high: '19-36 (x2)' };
    $('rl-pickname').textContent = this.pick.startsWith('n') ? `Number ${this.pick.slice(1)} (x36)` : names[this.pick];
  }

  renderHist() {
    $('rl-hist').innerHTML = this.history.map((n) => `<span class="rh ${rouletteColor(n)}">${n}</span>`).join('');
    $('cr-hist').innerHTML = this.crashHist.map((c) => `<span class="ch ${c >= 2 ? 'hi' : ''}">${c.toFixed(2)}x</span>`).join('');
  }

  msg(id, text, kind = '') { const el = $(id); el.textContent = text; el.className = 'cmsg ' + kind; }

  // ---- roulette
  async spin() {
    if (this.spinning) return;
    this.spinning = true;
    $('rl-spin').disabled = true;
    this.msg('rl-msg', '');
    const r = await this.call('roulette', { bet: Number($('rl-bet').value), pick: this.pick });
    if (r.error) { this.msg('rl-msg', r.error, 'bad'); this.spinning = false; $('rl-spin').disabled = false; return; }
    // the wheel spins and slows so the winning pocket stops under the pointer, while the
    // hub flicks through numbers, slowing down, then lands on the result
    const disc = $('rl-disc'), step = 360 / WHEEL.length;
    if (disc) {
      const at = (WHEEL.indexOf(r.result) + 0.5) * step;
      const base = Math.ceil((this.wheelRot || 0) / 360) * 360;
      const from = this.wheelRot || 0, to = base + 360 * 5 + (360 - at);
      this.wheelRot = to;
      // animated frame by frame (a CSS transition can be skipped or frozen by the browser):
      // fast at first, easing out to a stop on the pocket
      const t0 = performance.now(), dur = 2600;
      disc.style.transition = 'none';
      const turn = (now) => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3.2);
        disc.style.transform = `rotate(${from + (to - from) * e}deg)`;
        if (k < 1) setTimeout(() => turn(performance.now()), 16); // a timer, not animation frames: those pause in some panes
      };
      turn(t0);
    }
    const ball = $('rl-ball');
    let delay = 40, t = 0;
    await new Promise((done) => {
      const tick = () => {
        const n = t > 2200 ? r.result : Math.floor(Math.random() * 37);
        ball.textContent = n; ball.className = 'rl-ball ' + rouletteColor(n);
        if (t > 2200) return done();
        t += delay; delay *= 1.09;
        setTimeout(tick, delay);
      };
      tick();
    });
    ball.classList.add('land');
    this.history = [r.result, ...this.history].slice(0, 14);
    this.renderHist();
    if (r.payout) this.msg('rl-msg', `${r.result} ${r.color.toUpperCase()} - you win ${r.win.toLocaleString()} coins!`, 'good');
    else this.msg('rl-msg', `${r.result} ${r.color.toUpperCase()} - no luck this time`, 'bad');
    $('casino-coins').textContent = this.A.coins.toLocaleString();
    this.ui.renderTop();
    this.spinning = false; $('rl-spin').disabled = false;
  }

  // ---- blackjack
  async bjMove(action) {
    if (this.bjBusy) return;
    this.bjBusy = true;
    if (action === 'deal') this.msg('bj-msg', '');
    const r = await this.call('bj/' + action, action === 'deal' ? { bet: Number($('bj-bet').value) } : {});
    this.bjBusy = false;
    if (r.error) this.msg('bj-msg', r.error, 'bad');
    if (r.hand) this.renderHand(r.hand);
    $('casino-coins').textContent = this.A.coins.toLocaleString(); this.ui.renderTop();
  }
  renderHand(h) {
    const card = (c, i) => {
      if (c === '??') return `<span class="pcard back" style="animation-delay:${i * 0.08}s"></span>`;
      const suit = c.slice(-1), rank = c.slice(0, -1), red = suit === 'H' || suit === 'D';
      const s = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' }[suit];
      return `<span class="pcard${red ? ' red' : ''}" style="animation-delay:${i * 0.08}s"><em>${rank}<br>${s}</em><i>${s}</i><em class="br">${rank}<br>${s}</em></span>`;
    };
    $('bj-dealer').innerHTML = h.dealer.map(card).join(''); $('bj-player').innerHTML = h.player.map(card).join('');
    $('bj-dtotal').textContent = h.dTotal; $('bj-ptotal').textContent = h.pTotal;
    const playing = !h.done;
    $('bj-hit').disabled = $('bj-stand').disabled = !playing; $('bj-double').disabled = !h.canDouble;
    $('bj-deal').disabled = playing;
    if (h.done) {
      const t = { blackjack: `Blackjack! +${(h.win - h.bet).toLocaleString()} coins`, win: `You win +${(h.win - h.bet).toLocaleString()} coins`, push: 'Push - your bet comes back', lose: 'Dealer wins', bust: 'Bust - over 21' }[h.result];
      this.msg('bj-msg', t, h.win > h.bet ? 'good' : h.result === 'push' ? '' : 'bad');
    }
  }

  // ---- crash
  async startCrash() {
    this.msg('cr-msg', '');
    const r = await this.call('crash/start', { bet: Number($('cr-bet').value) });
    if (r.error) { this.msg('cr-msg', r.error, 'bad'); return; }
    this.round = { id: r.id, start: performance.now(), bet: Number($('cr-bet').value), auto: Number($('cr-auto').value) || 0 };
    $('cr-go').textContent = 'CASH OUT'; $('cr-go').classList.add('cash');
    $('casino-coins').textContent = this.A.coins.toLocaleString(); this.ui.renderTop();
    const loop = () => {
      if (!this.round) return;
      const m = crashMult(performance.now() - this.round.start);
      this.drawCrash(m, false);
      $('cr-go').textContent = `CASH OUT ${Math.floor(this.round.bet * m).toLocaleString()}`;
      if (this.round.auto >= 1.01 && m >= this.round.auto && !this.round.cashing) this.cashOut();
      requestAnimationFrame(loop);
    };
    loop();
    // ask the server now and then whether it has crashed
    const poll = async () => {
      if (!this.round || this.round.cashing) return;
      const c = await this.call('crash/check', { id: this.round.id });
      if (!this.round) return;
      if (c.crashed) return this.crashed(c.crashPoint || 1);
      this.round.poll = setTimeout(poll, 250);
    };
    this.round.poll = setTimeout(poll, 250);
  }

  async cashOut() {
    const R = this.round;
    if (!R || R.cashing) return;
    R.cashing = true;
    const r = await this.call('crash/cashout', { id: R.id });
    clearTimeout(R.poll);
    this.round = null;
    this.resetBtn();
    if (r.cashed) {
      this.crashHist = [r.crashPoint, ...this.crashHist].slice(0, 12);
      this.msg('cr-msg', `Cashed out at ${r.mult.toFixed(2)}x: +${r.win.toLocaleString()} coins (it crashed at ${r.crashPoint.toFixed(2)}x)`, 'good');
      this.drawCrash(r.mult, false, r.mult);
    } else { this.crashed(r.crashPoint || 1); return; }
    this.renderHist();
    $('casino-coins').textContent = this.A.coins.toLocaleString(); this.ui.renderTop();
  }

  crashed(cp) {
    if (this.round) { clearTimeout(this.round.poll); this.round = null; }
    this.resetBtn();
    this.crashHist = [cp, ...this.crashHist].slice(0, 12);
    this.drawCrash(cp, true);
    this.msg('cr-msg', `Crashed at ${cp.toFixed(2)}x - bet lost`, 'bad');
    this.renderHist();
    $('casino-coins').textContent = this.A.coins.toLocaleString(); this.ui.renderTop();
  }

  resetBtn() { $('cr-go').textContent = 'BET'; $('cr-go').classList.remove('cash'); }

  // the rising line: a glowing curve with the area under it filled, a marker riding the tip,
  // and the multiplier marked up the side
  drawCrash(m, dead, cashedAt = 0) {
    const c = $('cr-canvas'), x = c.getContext('2d');
    const w = c.width, h = c.height, padL = 46, padB = 18;
    x.clearRect(0, 0, w, h);
    const top = Math.max(2, m * 1.15);
    const tMax = Math.log(top) / 0.075;
    const Y = (mm) => h - padB - ((mm - 1) / (top - 1)) * (h - padB - 14);
    x.font = '600 13px Saira, sans-serif'; x.textAlign = 'right'; x.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const mm = 1 + ((top - 1) * i) / 4, y = Y(mm);
      x.strokeStyle = 'rgba(255,255,255,0.07)'; x.lineWidth = 1; x.beginPath(); x.moveTo(padL, y); x.lineTo(w, y); x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.4)'; x.fillText(mm.toFixed(mm < 10 ? 1 : 0) + 'x', padL - 8, y);
    }
    const tNow = Math.log(Math.max(1, m)) / 0.075;
    const col = dead ? '#f87171' : cashedAt ? '#facc15' : '#4ade80';
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const t = (tNow * i) / 80, mm = Math.exp(0.075 * t);
      pts.push([padL + (t / Math.max(1, tMax)) * (w - padL - 20), Y(mm)]);
    }
    const end = pts[pts.length - 1];
    const fill = x.createLinearGradient(0, end[1], 0, h - padB);
    fill.addColorStop(0, dead ? 'rgba(248,113,113,0.35)' : 'rgba(74,222,128,0.35)'); fill.addColorStop(1, 'rgba(0,0,0,0)');
    x.beginPath(); x.moveTo(pts[0][0], h - padB); for (const [px, py] of pts) x.lineTo(px, py); x.lineTo(end[0], h - padB); x.closePath();
    x.fillStyle = fill; x.fill();
    x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    x.shadowColor = col; x.shadowBlur = 16; x.strokeStyle = col; x.lineWidth = 4; x.lineCap = 'round'; x.stroke();
    x.beginPath(); x.arc(end[0], end[1], 7, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill();
    x.shadowBlur = 0;
    $('cr-mult').textContent = (dead ? 'CRASHED ' : '') + m.toFixed(2) + 'x';
    $('cr-mult').className = 'cr-mult' + (dead ? ' dead' : cashedAt ? ' won' : '');
  }
}
