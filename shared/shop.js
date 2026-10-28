// =====================================================================
//  SHOP CATALOGUE + COIN REWARDS (shared by the game and the server)
//  To add an item: add a line here. price 0 = free from the start.
//  slot: which thing it changes - 'vehicle', 'color' (paint), 'gear' or
//        'upgrade' (id = vehicle.part.level, generated from UPGRADES)
// =====================================================================
import { VEHICLES, UPGRADES } from './vehicles.js';
export const GEAR_SETS = [
  { id: 'match', name: 'Team Kit', desc: 'Matches your paint', colors: null },
  { id: 'black', name: 'Blackout', colors: [0x1c1c22, 0x2a2a30, 0xe5e7eb] },
  { id: 'neon', name: 'Neon Rush', colors: [0x39ff14, 0x111111, 0xff2bd6] },
  { id: 'usa', name: 'Stars & Stripes', colors: [0x1d4ed8, 0xf4f4f4, 0xd8261c] },
  { id: 'flame', name: 'Hot Lap', colors: [0xf97316, 0x18181b, 0xfacc15] },
  { id: 'camo', name: 'Woodland Camo', colors: [0x4d5d2a, 0x3b3424, 0xc2b280] },
  { id: 'ice', name: 'Ice Cold', colors: [0x7dd3fc, 0xf8fafc, 0x0c4a6e] },
  { id: 'gold', name: 'Champion Gold', colors: [0xd4a017, 0x111111, 0xfff4cc] },
];

export const SHOP = [
  // vehicles
  { id: 'mx250', slot: 'vehicle', price: 0 },
  { id: 'atv450', slot: 'vehicle', price: 0 },
  { id: 'mx450', slot: 'vehicle', price: 3000 },
  { id: 'atv700', slot: 'vehicle', price: 3500 },
  { id: 'utv', slot: 'vehicle', price: 5000 },
  { id: 'mx450w', slot: 'vehicle', price: 6500 },
  { id: 'buggy', slot: 'vehicle', price: 8000 },
  { id: 'utvr', slot: 'vehicle', price: 9500 },
  { id: 'buggy_unl', slot: 'vehicle', price: 15000 },
  // paint ('stock' = the colour the vehicle comes in)
  { id: 'stock', slot: 'color', price: 0 },
  { id: 'red', slot: 'color', price: 0 },
  { id: 'blue', slot: 'color', price: 0 },
  { id: 'green', slot: 'color', price: 500 },
  { id: 'orange', slot: 'color', price: 500 },
  { id: 'yellow', slot: 'color', price: 600 },
  { id: 'white', slot: 'color', price: 800 },
  { id: 'teal', slot: 'color', price: 800 },
  { id: 'black', slot: 'color', price: 1200 },
  { id: 'purple', slot: 'color', price: 1400 },
  { id: 'pink', slot: 'color', price: 1400 },
  // skins
  { id: 'digicamo', slot: 'color', price: 2500, rarity: 'Rare' },
  { id: 'glacier', slot: 'color', price: 2200, rarity: 'Rare' },
  { id: 'finish', slot: 'color', price: 2400, rarity: 'Rare' },
  { id: 'toxic', slot: 'color', price: 3500, rarity: 'Epic' },
  { id: 'carbon', slot: 'color', price: 4000, rarity: 'Epic' },
  { id: 'tiger', slot: 'color', price: 4500, rarity: 'Epic' },
  { id: 'neonwave', slot: 'color', price: 4200, rarity: 'Epic' },
  { id: 'inferno', slot: 'color', price: 6000, rarity: 'Legendary' },
  { id: 'galaxy', slot: 'color', price: 7500, rarity: 'Legendary' },
  { id: 'chrome', slot: 'color', price: 9000, rarity: 'Legendary' },
  { id: 'goldrush', slot: 'color', price: 12000, rarity: 'Legendary' },
  // rider gear
  { id: 'match', slot: 'gear', price: 0 },
  { id: 'black', slot: 'gear', price: 700 },
  { id: 'camo', slot: 'gear', price: 900 },
  { id: 'flame', slot: 'gear', price: 1000 },
  { id: 'usa', slot: 'gear', price: 1200 },
  { id: 'ice', slot: 'gear', price: 1200 },
  { id: 'neon', slot: 'gear', price: 1500 },
  { id: 'gold', slot: 'gear', price: 5000 },
];

// performance upgrades: 3 levels of engine / suspension / tyres for every vehicle
for (const v of VEHICLES) {
  for (const [part, U] of Object.entries(UPGRADES)) {
    U.levels.forEach((L, i) => SHOP.push({ id: `${v.id}.${part}.${i + 1}`, slot: 'upgrade', price: L.price, vehicle: v.id, part, level: i + 1 }));
  }
}

// what an upgrade needs before you can buy it (the vehicle, and the level below)
export function upgradeNeeds(item) {
  const needs = ['vehicle:' + item.vehicle];
  if (item.level > 1) needs.push(`upgrade:${item.vehicle}.${item.part}.${item.level - 1}`);
  return needs;
}

// upgrade levels a player owns for one vehicle, from their owned list
export function upgradeLevels(owned, vehicleId) {
  const out = {};
  for (const part of Object.keys(UPGRADES)) {
    let lvl = 0;
    for (let i = 1; i <= UPGRADES[part].levels.length; i++) if (owned.includes(`upgrade:${vehicleId}.${part}.${i}`)) lvl = i;
    if (lvl) out[part] = lvl;
  }
  return out;
}

export const STARTER = { coins: 500, owned: SHOP.filter((i) => i.price === 0).map((i) => i.slot + ':' + i.id), equipped: { vehicle: 'mx250', color: 'stock', gear: 'match' } };

// rarity for the shop cards (set on the item, or from its price)
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
export function rarityOf(it) {
  if (!it) return 'Common';
  if (it.rarity) return it.rarity;
  if (it.slot === 'vehicle') return it.price >= 9000 ? 'Legendary' : it.price >= 6000 ? 'Epic' : it.price >= 3000 ? 'Rare' : it.price > 0 ? 'Uncommon' : 'Common';
  if (it.slot === 'upgrade') return ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'][it.level - 1] || 'Common';
  return it.price >= 4000 ? 'Epic' : it.price >= 1200 ? 'Rare' : it.price > 0 ? 'Uncommon' : 'Common';
}

export function shopItem(slot, id) { return SHOP.find((i) => i.slot === slot && i.id === id) || null; }

// coins for things you do on the track
export const REWARDS = {
  lap: 40,                 // any completed lap
  record: 150,             // new personal best lap
  race: [500, 320, 220, 150, 110, 90, 80, 70], // by finishing position
  trickPer100: 20,         // per 100 trick points (a backflip = 500 points = 100 coins)
  bigAir: 15,              // over 1.3 s in the air
  section: 25,             // practice section completed
};
export const MAX_REWARD = 1500; // the most a single reward can be worth
