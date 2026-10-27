// =====================================================================
//  SHOP CATALOGUE + COIN REWARDS (shared by the game and the server)
//  To add an item: add a line here. price 0 = free from the start.
//  slot: which thing it changes - 'vehicle', 'color' (paint) or 'gear'
// =====================================================================
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
  // paint
  { id: 'red', slot: 'color', price: 0 },
  { id: 'blue', slot: 'color', price: 0 },
  { id: 'green', slot: 'color', price: 500 },
  { id: 'orange', slot: 'color', price: 500 },
  { id: 'yellow', slot: 'color', price: 600 },
  { id: 'white', slot: 'color', price: 800 },
  { id: 'teal', slot: 'color', price: 800 },
  { id: 'black', slot: 'color', price: 1200 },
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

export const STARTER = { coins: 500, owned: SHOP.filter((i) => i.price === 0).map((i) => i.slot + ':' + i.id), equipped: { vehicle: 'mx250', color: 'red', gear: 'match' } };

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
