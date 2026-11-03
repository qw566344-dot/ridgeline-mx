// =====================================================================
//  THE PASS - one reward for every level you reach (levels come from XP:
//  laps, races, wins, tricks). Tier N unlocks at level N + 1, so a new
//  rider sees the first reward a couple of races in. Coins in between,
//  paints and kits along the way, getting rarer every 5 levels, and a
//  legendary at the end. Claimed on the server (server/accounts.js).
//  An item you already own pays out coins instead (half its shop price).
// =====================================================================
// reward: { coins } or { slot, id } (a shop item: 'color' paint/skin or 'gear' kit)
export const PASS = [
  { coins: 300 }, { slot: 'color', id: 'green' }, { coins: 400 }, { slot: 'gear', id: 'flame' }, { slot: 'color', id: 'retro' },
  { coins: 500 }, { slot: 'color', id: 'teal' }, { coins: 600 }, { slot: 'gear', id: 'neon' }, { slot: 'color', id: 'toxic' },
  { coins: 700 }, { slot: 'color', id: 'arctic' }, { coins: 800 }, { slot: 'gear', id: 'ice' }, { slot: 'color', id: 'carbon' },
  { coins: 1000 }, { slot: 'color', id: 'ocean' }, { coins: 1100 }, { slot: 'gear', id: 'kit-tiger' }, { slot: 'color', id: 'inferno' },
  { coins: 1300 }, { slot: 'color', id: 'honeycomb' }, { coins: 1500 }, { slot: 'color', id: 'thunder' }, { slot: 'color', id: 'galaxy' },
  { coins: 1800 }, { slot: 'color', id: 'venom' }, { coins: 2200 }, { slot: 'gear', id: 'kit-lava' }, { slot: 'color', id: 'aurora' },
].map((r, i) => ({ ...r, tier: i + 1, level: i + 2 }));

export const passTier = (tier) => PASS.find((p) => p.tier === tier) || null;
