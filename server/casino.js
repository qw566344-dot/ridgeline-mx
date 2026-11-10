// =====================================================================
//  CASINO (server side) - results come from here, never from the game.
//    POST /api/casino/roulette     {bet, pick}  -> {result, color, payout, win, profile}
//    POST /api/casino/crash/start  {bet}        -> {id, profile}
//    POST /api/casino/crash/check  {id}         -> {crashed, crashPoint?, mult}
//    POST /api/casino/crash/cashout{id}         -> {cashed, mult, win, crashPoint, profile}
//    POST /api/casino/bj/deal {bet} | bj/hit | bj/stand | bj/double -> {hand, profile}
//  A crash round lives here with its secret crash point; the multiplier
//  is worked out from the server's own clock. A blackjack hand (deck and
//  the dealer's face-down card) lives here too; the game only sees bjView.
// =====================================================================
import crypto from 'crypto';
// the player's screen starts the climb a moment after the server does (the start reply takes time to arrive): without this
// cushion the server was always a little ahead of what you saw, and a cash-out on a number you could see could still lose
const CRASH_GRACE_MS = 500;
import { minesStart, minesPick, minesCash, minesView } from '../shared/casino.js';
import { checkBet, validPick, roulettePayout, rouletteColor, crashMult, crashPointFrom, bjDeal, bjHit, bjStand, bjDouble, bjCanDouble, bjView } from '../shared/casino.js';

export class Casino {
  constructor(accounts) {
    this.A = accounts;
    this.rounds = new Map(); // id -> { key, bet, start, cp }
    this.hands = new Map();  // account key -> blackjack hand in play
    setInterval(() => { const now = Date.now(); for (const [id, r] of this.rounds) if (now - r.start > 15 * 60_000) this.rounds.delete(id); }, 60_000).unref();
  }

  roulette(u, m) {
    if (!validPick(m.pick)) return { error: 'Pick red, black, green, odd, even, 1-18, 19-36 or a number' };
    const b = checkBet(m.bet, u.coins);
    if (b.error) return b;
    const n = crypto.randomInt(37);
    const payout = roulettePayout(m.pick, n);
    const win = b.amount * payout;
    u.coins += win - b.amount;
    this.A.save();
    return { result: n, color: rouletteColor(n), payout, win, profile: this.A.profile(u) };
  }

  crashStart(u, m) {
    for (const r of this.rounds.values()) if (r.key === u.key) return { error: 'You already have a round running' };
    const b = checkBet(m.bet, u.coins);
    if (b.error) return b;
    u.coins -= b.amount;
    this.A.save();
    const id = crypto.randomBytes(8).toString('hex');
    this.rounds.set(id, { key: u.key, bet: b.amount, start: Date.now() + CRASH_GRACE_MS, cp: crashPointFrom(crypto.randomInt(1_000_000) / 1_000_000) });
    return { id, profile: this.A.profile(u) };
  }

  round(u, id) { const r = this.rounds.get(id); return r && r.key === u.key ? r : null; }

  crashCheck(u, m) {
    const r = this.round(u, m.id);
    if (!r) return { crashed: true, gone: true };
    const mult = crashMult(Date.now() - r.start);
    if (mult >= r.cp) { this.rounds.delete(m.id); return { crashed: true, crashPoint: r.cp, mult: r.cp }; }
    return { crashed: false, mult };
  }

  crashCashout(u, m) {
    const r = this.round(u, m.id);
    if (!r) return { error: 'That round is over' };
    this.rounds.delete(m.id);
    const mult = Math.floor(crashMult(Date.now() - r.start) * 100) / 100;
    if (mult >= r.cp) return { cashed: false, crashPoint: r.cp, mult: r.cp, profile: this.A.profile(u) };
    const win = Math.floor(r.bet * mult);
    u.coins += win;
    this.A.save();
    return { cashed: true, mult, win, crashPoint: r.cp, profile: this.A.profile(u) };
  }

  // ---- blackjack: the bet comes off on the deal (and again on a double); the win is paid when the hand ends
  bj(u, action, m) {
    let h = this.hands.get(u.key);
    if (action === 'deal') {
      if (h && !h.done) return { error: 'Finish the hand you are playing first', hand: bjView(h) };
      const b = checkBet(m.bet, u.coins);
      if (b.error) return b;
      u.coins -= b.amount;
      h = bjDeal(b.amount, (n) => crypto.randomInt(n));
      this.hands.set(u.key, h);
    } else {
      if (!h || h.done) return { error: 'Deal a new hand' };
      if (action === 'hit') bjHit(h);
      else if (action === 'stand') bjStand(h);
      else if (action === 'double') {
        if (!bjCanDouble(h)) return { error: 'You can only double on your first two cards', hand: bjView(h) };
        if (u.coins < h.bet) return { error: 'Not enough coins to double', hand: bjView(h) };
        u.coins -= h.bet; bjDouble(h);
      } else return { error: 'Unknown move' };
    }
    if (h.done) { u.coins += h.win; this.hands.delete(u.key); }
    this.A.save();
    return { hand: bjView(h), profile: this.A.profile(u) };
  }

  // ---- mines: the bet comes off on the start, the win is paid when the game ends (a mine, or a cash out)
  mines(u, action, m) {
    this.games = this.games || new Map();
    let g = this.games.get(u.key);
    if (action === 'start') {
      if (g && !g.done) return { error: 'Finish the game you are playing first', game: minesView(g) };
      const b = checkBet(m.bet, u.coins);
      if (b.error) return b;
      u.coins -= b.amount;
      g = minesStart(b.amount, m.mines, (n) => crypto.randomInt(n));
      this.games.set(u.key, g);
    } else {
      if (!g || g.done) return { error: 'Start a new game' };
      if (action === 'pick') minesPick(g, m.i);
      else if (action === 'cash') { if (!g.open.length) return { error: 'Open a tile first', game: minesView(g) }; minesCash(g); }
      else return { error: 'Unknown move' };
    }
    if (g.done) { u.coins += g.win; this.games.delete(u.key); }
    this.A.save();
    return { game: minesView(g), profile: this.A.profile(u) };
  }

  handle(route, u, m) {
    if (route.startsWith('casino/mines/')) return this.mines(u, route.slice(13), m);
    if (route.startsWith('casino/bj/')) return this.bj(u, route.slice(10), m);
    switch (route) {
      case 'casino/roulette': return this.roulette(u, m);
      case 'casino/crash/start': return this.crashStart(u, m);
      case 'casino/crash/check': return this.crashCheck(u, m);
      case 'casino/crash/cashout': return this.crashCashout(u, m);
      default: return null;
    }
  }
}
