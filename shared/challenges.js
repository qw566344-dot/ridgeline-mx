// =====================================================================
//  CHALLENGES - 3 daily and 3 weekly goals, the same for everyone (picked
//  from the pools below by the date, UTC). Progress is counted on the
//  server from the rewards the game asks for (laps, races, tricks...);
//  a finished challenge is claimed for coins and XP.
// =====================================================================
import { TP_PER_COIN } from './shop.js';
// stat: what is counted   goal: how many   coins / xp: the prize (worth chasing: a daily is
// about as much as 15-20 minutes of riding, a weekly a good few hours)
export const DAILY_POOL = [
  { id: 'd-laps5', stat: 'laps', goal: 5, text: 'Ride 5 laps', coins: 700, xp: 350 },
  { id: 'd-laps12', stat: 'laps', goal: 12, text: 'Ride 12 laps', coins: 1300, xp: 600 },
  { id: 'd-win1', stat: 'wins', goal: 1, text: 'Win a race', coins: 1200, xp: 550 },
  { id: 'd-races3', stat: 'races', goal: 3, text: 'Finish 3 races', coins: 1000, xp: 450 },
  { id: 'd-tricks10', stat: 'tricks', goal: 10, text: 'Land 10 tricks', coins: 800, xp: 350 },
  { id: 'd-tricks25', stat: 'tricks', goal: 25, text: 'Land 25 tricks', coins: 1400, xp: 600 },
  { id: 'd-tp5k', stat: 'tp', goal: 5000, text: 'Score 5,000 trick points', coins: 900, xp: 400 },
  { id: 'd-tp15k', stat: 'tp', goal: 15000, text: 'Score 15,000 trick points', coins: 1500, xp: 650 },
  { id: 'd-air5', stat: 'airs', goal: 5, text: 'Get big air 5 times', coins: 800, xp: 350 },
];
export const WEEKLY_POOL = [
  { id: 'w-laps60', stat: 'laps', goal: 60, text: 'Ride 60 laps', coins: 6000, xp: 2500 },
  { id: 'w-wins5', stat: 'wins', goal: 5, text: 'Win 5 races', coins: 7500, xp: 3000 },
  { id: 'w-races15', stat: 'races', goal: 15, text: 'Finish 15 races', coins: 6000, xp: 2500 },
  { id: 'w-tricks120', stat: 'tricks', goal: 120, text: 'Land 120 tricks', coins: 6500, xp: 2600 },
  { id: 'w-tp80k', stat: 'tp', goal: 80000, text: 'Score 80,000 trick points', coins: 7500, xp: 3000 },
  { id: 'w-air30', stat: 'airs', goal: 30, text: 'Get big air 30 times', coins: 5500, xp: 2200 },
];

const DAY = 86_400_000;
export const dayNo = (t = Date.now()) => Math.floor(t / DAY);
export const weekNo = (t = Date.now()) => Math.floor((dayNo(t) + 3) / 7); // weeks start on Monday (UTC)
export const dayEnds = (t = Date.now()) => (dayNo(t) + 1) * DAY;
export const weekEnds = (t = Date.now()) => ((weekNo(t) + 1) * 7 - 3) * DAY;

// pick n different items from a pool with a small seeded shuffle
function pick(pool, n, seed) {
  const a = pool.slice();
  let s = (seed * 2654435761) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

export function todaysChallenges(t = Date.now()) {
  return { daily: pick(DAILY_POOL, 3, dayNo(t)), weekly: pick(WEEKLY_POOL, 3, weekNo(t) + 7919) };
}

// which counters a reward moves: the game's reward kinds -> challenge stats
export function statsFor(kind, amount) {
  if (kind === 'lap') return { laps: 1 };
  if (kind === 'win') return { wins: 1, races: 1 };
  if (kind === 'race') return { races: 1 };
  if (kind === 'trick') return { tricks: 1, tp: Math.round(amount * TP_PER_COIN) }; // the coins asked for -> trick points
  if (kind === 'air') return { airs: 1 };
  return {};
}
