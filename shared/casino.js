// =====================================================================
//  CASINO RULES (shared): roulette and crash, played with coins.
//  The server runs these for online accounts (so nobody can cheat the
//  result); offline / guest accounts run the same rules in the browser.
// =====================================================================
export const MIN_BET = 10, MAX_BET = 1_000_000;
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function rouletteColor(n) { return n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black'; }

// pick: red | black | green | odd | even | low | high | n<number>
export function validPick(pick) {
  if (['red', 'black', 'green', 'odd', 'even', 'low', 'high'].includes(pick)) return true;
  const m = /^n(\d{1,2})$/.exec(String(pick));
  return !!m && Number(m[1]) <= 36;
}

// how many times the bet comes back (0 = lost)
export function roulettePayout(pick, n) {
  const c = rouletteColor(n);
  if (pick === 'green') return n === 0 ? 36 : 0;
  if (pick.startsWith('n')) return Number(pick.slice(1)) === n ? 36 : 0;
  if (n === 0) return 0;
  if (pick === 'red' || pick === 'black') return c === pick ? 2 : 0;
  if (pick === 'odd') return n % 2 === 1 ? 2 : 0;
  if (pick === 'even') return n % 2 === 0 ? 2 : 0;
  if (pick === 'low') return n <= 18 ? 2 : 0;
  if (pick === 'high') return n >= 19 ? 2 : 0;
  return 0;
}

// crash: the multiplier climbs from 1.00x until the round crashes
export const CRASH_RATE = 0.075;                   // 2x after ~9 s, 10x after ~31 s
export function crashMult(ms) { return Math.exp((CRASH_RATE * Math.max(0, ms)) / 1000); }
// where a round crashes, from a uniform random 0..1 (about a 1% house edge - it was 4%: one round in 25 crashed at 1.00x)
export const CRASH_EDGE = 99;
export function crashPointFrom(u) { return Math.min(1000, Math.max(1, Math.floor(CRASH_EDGE / (1 - Math.min(0.999999, u))) / 100)); }

export function checkBet(amount, coins) {
  amount = Math.floor(Number(amount));
  if (!Number.isFinite(amount) || amount < MIN_BET) return { error: `The smallest bet is ${MIN_BET} coins` };
  if (amount > MAX_BET) return { error: `The biggest bet is ${MAX_BET.toLocaleString()} coins` };
  if (amount > coins) return { error: 'Not enough coins' };
  return { amount };
}

// ---------------------------------------------------------------------
//  BLACKJACK: one deck shuffled per hand. Dealer stands on all 17s,
//  blackjack pays 3:2, double down on the first two cards (one more card).
//  A hand is a plain object, so the server and the browser share it.
//  rand(n) -> a random whole number 0..n-1
// ---------------------------------------------------------------------
const SUITS = ['S', 'H', 'D', 'C'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export function bjValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) { const r = c.slice(0, -1); if (r === 'A') { aces++; total += 11; } else total += ['J', 'Q', 'K'].includes(r) ? 10 : Number(r); }
  while (total > 21 && aces) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
const isBJ = (cards) => cards.length === 2 && bjValue(cards).total === 21;
export function bjDeal(bet, rand) {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  for (let i = deck.length - 1; i > 0; i--) { const j = rand(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const h = { deck, bet, player: [deck.pop(), deck.pop()], dealer: [deck.pop(), deck.pop()], done: false, result: null, win: 0, doubled: false };
  if (isBJ(h.player) || isBJ(h.dealer)) bjFinish(h);
  return h;
}
export function bjHit(h) {
  if (h.done) return h;
  h.player.push(h.deck.pop());
  if (bjValue(h.player).total >= 21) bjStand(h);
  return h;
}
export function bjStand(h) {
  if (h.done) return h;
  if (bjValue(h.player).total <= 21) while (bjValue(h.dealer).total < 17) h.dealer.push(h.deck.pop());
  return bjFinish(h);
}
export function bjCanDouble(h) { return !h.done && h.player.length === 2 && !h.doubled; }
export function bjDouble(h) {
  if (!bjCanDouble(h)) return h;
  h.doubled = true; h.bet *= 2;
  h.player.push(h.deck.pop());
  return bjStand(h);
}
// settle: win = coins handed back (the bet included); result: blackjack | win | push | lose | bust
function bjFinish(h) {
  h.done = true;
  const p = bjValue(h.player).total, d = bjValue(h.dealer).total;
  if (isBJ(h.player) && !isBJ(h.dealer)) { h.result = 'blackjack'; h.win = Math.floor(h.bet * 2.5); }
  else if (isBJ(h.player) && isBJ(h.dealer)) { h.result = 'push'; h.win = h.bet; }
  else if (isBJ(h.dealer)) { h.result = 'lose'; h.win = 0; }
  else if (p > 21) { h.result = 'bust'; h.win = 0; }
  else if (d > 21 || p > d) { h.result = 'win'; h.win = h.bet * 2; }
  else if (p === d) { h.result = 'push'; h.win = h.bet; }
  else { h.result = 'lose'; h.win = 0; }
  return h;
}
// what the player may see (the dealer's second card stays face down until the hand is over)
export function bjView(h) {
  return { player: h.player, dealer: h.done ? h.dealer : [h.dealer[0], '??'], pTotal: bjValue(h.player).total, dTotal: h.done ? bjValue(h.dealer).total : bjValue([h.dealer[0]]).total, done: h.done, result: h.result, win: h.win, bet: h.bet, canDouble: bjCanDouble(h) };
}
