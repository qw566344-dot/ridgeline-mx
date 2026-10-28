// =====================================================================
//  CASINO (server side) - results come from here, never from the game.
//    POST /api/casino/roulette     {bet, pick}  -> {result, color, payout, win, profile}
//    POST /api/casino/crash/start  {bet}        -> {id, profile}
//    POST /api/casino/crash/check  {id}         -> {crashed, crashPoint?, mult}
//    POST /api/casino/crash/cashout{id}         -> {cashed, mult, win, crashPoint, profile}
//  A crash round lives here with its secret crash point; the multiplier
//  is worked out from the server's own clock.
// =====================================================================
import crypto from 'crypto';
import { checkBet, validPick, roulettePayout, rouletteColor, crashMult, crashPointFrom } from '../shared/casino.js';

export class Casino {
  constructor(accounts) {
    this.A = accounts;
    this.rounds = new Map(); // id -> { key, bet, start, cp }
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
    this.rounds.set(id, { key: u.key, bet: b.amount, start: Date.now(), cp: crashPointFrom(crypto.randomInt(1_000_000) / 1_000_000) });
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

  handle(route, u, m) {
    switch (route) {
      case 'casino/roulette': return this.roulette(u, m);
      case 'casino/crash/start': return this.crashStart(u, m);
      case 'casino/crash/check': return this.crashCheck(u, m);
      case 'casino/crash/cashout': return this.crashCashout(u, m);
      default: return null;
    }
  }
}
