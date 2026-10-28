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
  { id: 'utvr', slot: 'vehicle', price: 9500 },
  { id: 'mx125', slot: 'vehicle', price: 1500 },
  { id: 'sxs', slot: 'vehicle', price: 7000 },
  { id: 'atv250', slot: 'vehicle', price: 1800 },
  { id: 'mx350', slot: 'vehicle', price: 4500 },
  { id: 'enduro', slot: 'vehicle', price: 5500 },
  { id: 'mx500', slot: 'vehicle', price: 11000 },
  { id: 'atv1000', slot: 'vehicle', price: 12000 },
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
  { id: 'retro', slot: 'color', price: 2600, rarity: 'Rare' },
  { id: 'sunsetrace', slot: 'color', price: 2600, rarity: 'Rare' },
  { id: 'eightbit', slot: 'color', price: 2800, rarity: 'Rare' },
  { id: 'ocean', slot: 'color', price: 3000, rarity: 'Rare' },
  { id: 'honeycomb', slot: 'color', price: 3800, rarity: 'Epic' },
  { id: 'venom', slot: 'color', price: 4200, rarity: 'Epic' },
  { id: 'thunder', slot: 'color', price: 4600, rarity: 'Epic' },
  { id: 'splatter', slot: 'color', price: 4400, rarity: 'Epic' },
  { id: 'cybergrid', slot: 'color', price: 5000, rarity: 'Epic' },
  { id: 'marble', slot: 'color', price: 5200, rarity: 'Epic' },
  { id: 'obsidian', slot: 'color', price: 8500, rarity: 'Legendary' },
  { id: 'bloodmoon', slot: 'color', price: 10000, rarity: 'Legendary' },
  { id: 'lava', slot: 'color', price: 11000, rarity: 'Legendary' },
  { id: 'aurora', slot: 'color', price: 14000, rarity: 'Legendary' },
  { id: 'arctic', slot: 'color', price: 2800, rarity: 'Rare' },
  { id: 'neontiger', slot: 'color', price: 4800, rarity: 'Epic' },
  { id: 'prism', slot: 'color', price: 15000, rarity: 'Legendary' },
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
// ---------------------------------------------------------------------
//  ITEM SHOP ROTATION: skins and rider gear can only be bought while they
//  are in the shop. 3 Featured + 8 Daily items, new every hour (UTC), the
//  same for everyone. Vehicles are always for sale; upgrades are in the garage.
// ---------------------------------------------------------------------
export const ROTATION_MS = 3600_000;
function rotRng(seed) { let x = (seed * 2654435761) >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
function shuffled(list, r) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function shopRotation(now = Date.now()) {
  const slot = Math.floor(now / ROTATION_MS);
  const r = rotRng(slot + 7);
  const paid = SHOP.filter((i) => (i.slot === 'color' || i.slot === 'gear') && i.price > 0);
  const big = paid.filter((i) => i.slot === 'color' && ['Epic', 'Legendary'].includes(rarityOf(i)));
  const featured = shuffled(big, r).slice(0, 3);
  const rest = paid.filter((i) => !featured.includes(i));
  // daily: mostly skins, at least two gear sets
  const gear = shuffled(rest.filter((i) => i.slot === 'gear'), r).slice(0, 2);
  const skins = shuffled(rest.filter((i) => i.slot === 'color'), r).slice(0, 6);
  return { slot, endsAt: (slot + 1) * ROTATION_MS, featured: featured.map((i) => ({ slot: i.slot, id: i.id })), daily: shuffled([...skins, ...gear], r).map((i) => ({ slot: i.slot, id: i.id })) };
}
// can this be bought right now? (a 2-minute grace after the shop changes)
export function inShop(slot, id, now = Date.now()) {
  if (slot === 'vehicle' || slot === 'upgrade') return true;
  const it = shopItem(slot, id);
  if (!it || it.price === 0) return true;
  for (const t of [now, now - 120_000]) {
    const R = shopRotation(t);
    if ([...R.featured, ...R.daily].some((x) => x.slot === slot && x.id === id)) return true;
  }
  return false;
}

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
