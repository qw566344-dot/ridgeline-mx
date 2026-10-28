// =====================================================================
//  CASINO SCREEN (Lobby > Casino): roulette and crash with your coins.
//  Online accounts: the server decides every result (server/casino.js).
//  Offline / guest accounts: the same rules run here (shared/casino.js).
// =====================================================================
import { checkBet, validPick, roulettePayout, rouletteColor, crashMult, crashPointFrom, MIN_BET } from '/shared/casino.js';

const $ = (id) => document.getElementById(id);

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

  wire() {
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
    // flick through numbers, slowing down, then land on the result
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

  // the rising line
  drawCrash(m, dead, cashedAt = 0) {
    const c = $('cr-canvas'), x = c.getContext('2d');
    const w = c.width, h = c.height;
    x.clearRect(0, 0, w, h);
    const top = Math.max(2, m * 1.15);
    const tMax = Math.log(top) / 0.075;
    x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 1;
    for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(0, (h * i) / 5); x.lineTo(w, (h * i) / 5); x.stroke(); }
    const tNow = Math.log(Math.max(1, m)) / 0.075;
    x.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = (tNow * i) / 60, mm = Math.exp(0.075 * t);
      const px = (t / Math.max(1, tMax)) * w, py = h - ((mm - 1) / (top - 1)) * (h - 10) - 4;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.strokeStyle = dead ? '#f87171' : '#4ade80'; x.lineWidth = 4; x.stroke();
    $('cr-mult').textContent = (dead ? 'CRASHED ' : '') + m.toFixed(2) + 'x';
    $('cr-mult').className = 'cr-mult' + (dead ? ' dead' : cashedAt ? ' won' : '');
  }
}
