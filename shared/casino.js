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
// where a round crashes, from a uniform random 0..1 (about 4% house edge)
export function crashPointFrom(u) { return Math.min(1000, Math.max(1, Math.floor(96 / (1 - Math.min(0.999999, u))) / 100)); }

export function checkBet(amount, coins) {
  amount = Math.floor(Number(amount));
  if (!Number.isFinite(amount) || amount < MIN_BET) return { error: `The smallest bet is ${MIN_BET} coins` };
  if (amount > MAX_BET) return { error: `The biggest bet is ${MAX_BET.toLocaleString()} coins` };
  if (amount > coins) return { error: 'Not enough coins' };
  return { amount };
}
