// =====================================================================
//  THE PASS (Season 1) - rewards for the levels you reach (levels come
//  from XP: laps, races, wins, tricks). Tier N unlocks at level N + 1.
//   FREE track: something small every 3 levels (coins, plain paints, an
//     old shop skin at the end) - everyone gets it.
//   PREMIUM track: bought once with coins (PASS_PRICE, never real money).
//     A reward at EVERY level: pass-only skins and kits you can't get
//     anywhere else, rare shop skins, coins - getting better all the way
//     to the Prism Elite legendary at the end. Buying it late still pays
//     out every level you have already reached.
//  Claimed on the server (server/accounts.js). An item you already own
//  pays out coins instead (half its shop price, at least 300).
// =====================================================================
export const PASS_PRICE = 60000; // coins - a real goal (many hours of riding)
export const PASS_SEASON = 'Season 1';
export const PASS_TIERS = 30;

// reward: { coins } or { slot, id } (a shop item: 'color' paint/skin or 'gear' kit)
const FREE_BY_TIER = {
  3: { coins: 150 }, 6: { slot: 'color', id: 'green' }, 9: { coins: 200 }, 12: { slot: 'gear', id: 'flame' }, 15: { coins: 300 },
  18: { slot: 'color', id: 'purple' }, 21: { coins: 400 }, 24: { slot: 'gear', id: 'camo' }, 27: { coins: 500 }, 30: { slot: 'color', id: 'retro' },
};
const PREMIUM_LIST = [
  { slot: 'color', id: 'p-trailblazer' }, { coins: 500 }, { slot: 'gear', id: 'kit-p-trailblazer' }, { slot: 'color', id: 'lumberjack' }, { coins: 600 },
  { slot: 'color', id: 'p-dustdevil' }, { slot: 'color', id: 'redline' }, { coins: 700 }, { slot: 'color', id: 'warpspeed' }, { slot: 'color', id: 'p-nightrider' },
  { coins: 800 }, { slot: 'color', id: 'amethyst' }, { slot: 'gear', id: 'kit-p-nightrider' }, { coins: 900 }, { slot: 'color', id: 'p-venomstrike' },
  { slot: 'color', id: 'blueflame' }, { coins: 1000 }, { slot: 'color', id: 'p-voltage' }, { slot: 'color', id: 'icefractal' }, { slot: 'color', id: 'p-glacier' },
  { coins: 1200 }, { slot: 'gear', id: 'kit-p-glacier' }, { slot: 'color', id: 'firedragon' }, { slot: 'color', id: 'p-phantom' }, { coins: 1500 },
  { slot: 'color', id: 'p-solarflare' }, { slot: 'gear', id: 'kit-p-solarflare' }, { slot: 'color', id: 'p-royalty' }, { slot: 'gear', id: 'kit-p-prismelite' }, { slot: 'color', id: 'p-prismelite' },
];

export const PASS = Array.from({ length: PASS_TIERS }, (_, i) => {
  const tier = i + 1;
  return { tier, level: tier + 1, free: FREE_BY_TIER[tier] || null, premium: PREMIUM_LIST[i] };
});
export const passTier = (tier) => PASS.find((p) => p.tier === tier) || null;
