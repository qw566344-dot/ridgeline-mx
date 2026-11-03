// =====================================================================
//  VEHICLES - every tuning number for every vehicle lives here.
//  Want a faster bike? Raise `torque`. Softer suspension? Lower `freq`.
//
//  The game has 4 3D models (MODELS below). Every vehicle in the list is
//  one of those models with its own paint and its own tuning - to add a
//  new one, copy a block in VEHICLES, give it a new id, change numbers.
//
//  Physics types:  'bike' (2 wheels, rider balances it)
//                  'atv'  (quad: 4 wheels, rider leans)
//                  'car'  (side-by-side / buggy: 4 wheels, driver seated)
//
//  Local axes:  +z = forward,  +y = up,  +x = LEFT side of the vehicle.
//  The body origin is the centre of mass (rider included).
// =====================================================================
import { QUAD_MODELS } from './quadModels.js';

export const BIKE_COLORS = [
  { id: 'red', name: 'Factory Red', body: 0xd8261c, accent: 0xffffff, gear: [0xd8261c, 0x1b1b1f, 0xffffff] },
  { id: 'blue', name: 'Race Blue', body: 0x1d4ed8, accent: 0xffffff, gear: [0x1d4ed8, 0xf2f2f2, 0x0f172a] },
  { id: 'green', name: 'Lime Green', body: 0x46b11c, accent: 0x111111, gear: [0x46b11c, 0x111111, 0xffffff] },
  { id: 'orange', name: 'Orange Crush', body: 0xf06a0f, accent: 0x1d4ed8, gear: [0xf06a0f, 0x1e293b, 0xffffff] },
  { id: 'yellow', name: 'Desert Yellow', body: 0xf2b21b, accent: 0x1f2937, gear: [0xf2c21b, 0x1f2937, 0xffffff] },
  { id: 'white', name: 'Ghost White', body: 0xf1f1ee, accent: 0xd8261c, gear: [0xf1f1ee, 0x6b21a8, 0x111111] },
  { id: 'black', name: 'Stealth Black', body: 0x1c1c22, accent: 0xd4a017, gear: [0x1c1c22, 0xef4444, 0xdddddd] },
  { id: 'teal', name: 'Teal Storm', body: 0x0d9488, accent: 0xf1f1ee, gear: [0x0d9488, 0xf8fafc, 0x134e4a] },
  { id: 'purple', name: 'Ultraviolet', body: 0x6d28d9, accent: 0xfacc15, gear: [0x6d28d9, 0x111111, 0xfacc15] },
  { id: 'pink', name: 'Hot Pink', body: 0xec4899, accent: 0x111111, gear: [0xec4899, 0x111111, 0xffffff] },
  // skins: a pattern drawn over the plastics (see PATTERNS / modelRig.js). third = a third colour
  { id: 'inferno', name: 'Inferno', pattern: 'flames', body: 0xff3b00, accent: 0xffd000, third: 0x18181b, gear: [0xff3b00, 0x18181b, 0xffd000] },
  { id: 'toxic', name: 'Toxic', pattern: 'stripes', body: 0x39ff14, accent: 0x111111, gear: [0x39ff14, 0x111111, 0x39ff14] },
  { id: 'galaxy', name: 'Galaxy', pattern: 'galaxy', body: 0x1e1b4b, accent: 0x9333ea, gear: [0x312e81, 0x0f0a1f, 0xc084fc] },
  { id: 'chrome', name: 'Liquid Chrome', pattern: 'chrome', body: 0xd6dbe1, accent: 0x52525b, gear: [0xd6dbe1, 0x27272a, 0xffffff] },
  { id: 'carbon', name: 'Carbon Fiber', pattern: 'carbon', body: 0x18181b, accent: 0x3f3f46, gear: [0x18181b, 0x3f3f46, 0xef4444] },
  { id: 'digicamo', name: 'Digital Camo', pattern: 'camo', body: 0x556b3a, accent: 0x2f3a26, third: 0x9c9a6a, gear: [0x556b3a, 0x2f3a26, 0x9c9a6a] },
  { id: 'tiger', name: 'Tiger', pattern: 'tiger', body: 0xf28c16, accent: 0x111111, gear: [0xf28c16, 0x111111, 0xffffff] },
  { id: 'glacier', name: 'Glacier Fade', pattern: 'gradient', body: 0xe0f2fe, accent: 0x0284c7, gear: [0x7dd3fc, 0xf8fafc, 0x0c4a6e] },
  { id: 'finish', name: 'Finish Line', pattern: 'checker', body: 0xf4f4f4, accent: 0x111111, gear: [0x111111, 0xf4f4f4, 0xef4444] },
  { id: 'goldrush', name: 'Gold Rush', pattern: 'chrome', body: 0xd4a017, accent: 0x111111, gear: [0xd4a017, 0x111111, 0xfff4cc] },
  { id: 'neonwave', name: 'Neon Wave', pattern: 'stripes', body: 0xec4899, accent: 0x22d3ee, gear: [0xec4899, 0x0f172a, 0x22d3ee] },
  { id: 'honeycomb', name: 'Honeycomb', pattern: 'hex', body: 0xf5b301, accent: 0x1c1917, gear: [0xf5b301, 0x1c1917, 0xffffff] },
  { id: 'venom', name: 'Venom', pattern: 'hex', body: 0x16a34a, accent: 0x052e16, gear: [0x22c55e, 0x052e16, 0x111111] },
  { id: 'thunder', name: 'Thunderbolt', pattern: 'bolt', body: 0x1e3a8a, accent: 0xfacc15, gear: [0x1e3a8a, 0xfacc15, 0xffffff] },
  { id: 'splatter', name: 'Paint Splatter', pattern: 'splatter', body: 0xf8fafc, accent: 0xec4899, third: 0x22d3ee, gear: [0xf8fafc, 0xec4899, 0x22d3ee] },
  { id: 'ocean', name: 'Ocean Splash', pattern: 'splatter', body: 0x0c4a6e, accent: 0x38bdf8, third: 0xffffff, gear: [0x0c4a6e, 0x38bdf8, 0xffffff] },
  { id: 'eightbit', name: '8-Bit', pattern: 'pixel', body: 0x7c3aed, accent: 0x22d3ee, third: 0xf472b6, gear: [0x7c3aed, 0x111827, 0x22d3ee] },
  { id: 'cybergrid', name: 'Cyber Grid', pattern: 'pixel', body: 0x020617, accent: 0x06b6d4, third: 0x0e7490, gear: [0x020617, 0x06b6d4, 0x67e8f9] },
  { id: 'aurora', name: 'Aurora', pattern: 'aurora', body: 0x22c55e, accent: 0x8b5cf6, third: 0x06b6d4, gear: [0x14532d, 0x1e1b4b, 0x67e8f9] },
  { id: 'lava', name: 'Molten Lava', pattern: 'lava', body: 0xff5a00, accent: 0xffd000, third: 0x1c1917, gear: [0x1c1917, 0xff5a00, 0xffd000] },
  { id: 'bloodmoon', name: 'Blood Moon', pattern: 'lava', body: 0xdc2626, accent: 0xff7a7a, third: 0x0c0a09, gear: [0x0c0a09, 0xdc2626, 0xff7a7a] },
  { id: 'marble', name: 'White Marble', pattern: 'marble', body: 0xf1f5f9, accent: 0x64748b, gear: [0xf1f5f9, 0x334155, 0xcbd5e1] },
  { id: 'obsidian', name: 'Obsidian', pattern: 'marble', body: 0x0a0a0a, accent: 0xd4a017, gear: [0x0a0a0a, 0xd4a017, 0xfff4cc] },
  { id: 'retro', name: 'Retro Racer', pattern: 'race', body: 0xf8fafc, accent: 0x1d4ed8, third: 0xdc2626, gear: [0xf8fafc, 0x1d4ed8, 0xdc2626] },
  { id: 'sunsetrace', name: 'Sunset Racer', pattern: 'race', body: 0x7c2d12, accent: 0xf97316, third: 0xfacc15, gear: [0x7c2d12, 0xf97316, 0xfacc15] },
  { id: 'arctic', name: 'Arctic Camo', pattern: 'camo', body: 0xe2e8f0, accent: 0x94a3b8, third: 0x7dd3fc, gear: [0xe2e8f0, 0x475569, 0x7dd3fc] },
  { id: 'neontiger', name: 'Neon Tiger', pattern: 'tiger', body: 0xff2bd6, accent: 0x22d3ee, gear: [0xff2bd6, 0x0f172a, 0x22d3ee] },
  { id: 'prism', name: 'Prism', pattern: 'aurora', body: 0xef4444, accent: 0xfacc15, third: 0x3b82f6, gear: [0xef4444, 0x111827, 0xfacc15] },
  { id: 'zebra', name: 'Zebra', pattern: 'zebra', body: 0xf5f5f4, accent: 0x111111, gear: [0xf5f5f4, 0x111111, 0xef4444] },
  { id: 'candyzebra', name: 'Candy Zebra', pattern: 'zebra', body: 0xfbcfe8, accent: 0xdb2777, gear: [0xdb2777, 0xfbcfe8, 0xffffff] },
  { id: 'polka', name: 'Polka Pop', pattern: 'dots', body: 0xdc2626, accent: 0xffffff, third: 0xfacc15, gear: [0xdc2626, 0xffffff, 0x111111] },
  { id: 'mintchip', name: 'Mint Chip', pattern: 'dots', body: 0x99f6e4, accent: 0x3f2a1d, third: 0x3f2a1d, gear: [0x5eead4, 0x3f2a1d, 0xffffff] },
  { id: 'rainbow', name: 'Rainbow Road', pattern: 'rainbow', body: 0xffffff, accent: 0x111111, gear: [0x8b5cf6, 0x111111, 0xfacc15] },
  { id: 'argyle', name: 'Argyle', pattern: 'argyle', body: 0x1e3a8a, accent: 0x3b82f6, third: 0xfacc15, gear: [0x1e3a8a, 0xfacc15, 0xffffff] },
  { id: 'royal', name: 'Royal Diamond', pattern: 'argyle', body: 0x581c87, accent: 0x7e22ce, third: 0xd4a017, gear: [0x581c87, 0xd4a017, 0xfff4cc] },
  { id: 'hologram', name: 'Hologram', pattern: 'holo', body: 0xc7d2fe, accent: 0xe0f2fe, gear: [0xc7d2fe, 0x1e1b4b, 0x67e8f9] },
  { id: 'iceflame', name: 'Ice Flames', pattern: 'flames', body: 0x38bdf8, accent: 0xffffff, third: 0x0c4a6e, gear: [0x38bdf8, 0x0c4a6e, 0xffffff] },
  { id: 'sakura', name: 'Sakura Fade', pattern: 'gradient', body: 0xfce7f3, accent: 0xec4899, gear: [0xf9a8d4, 0xfdf2f8, 0x831843] },
  { id: 'rosegold', name: 'Rose Gold', pattern: 'chrome', body: 0xd4917f, accent: 0x3f2a2a, gear: [0xd4917f, 0x2a1d1d, 0xfde2d8] },
  { id: 'emerald', name: 'Emerald Chrome', pattern: 'chrome', body: 0x10b981, accent: 0x052e16, gear: [0x10b981, 0x052e16, 0xd1fae5] },
  { id: 'desertcamo', name: 'Desert Camo', pattern: 'camo', body: 0xc8a165, accent: 0x8a6a3d, third: 0xe7d3a8, gear: [0xc8a165, 0x5c4526, 0xe7d3a8] },
  { id: 'bumblebee', name: 'Bumblebee', pattern: 'stripes', body: 0xfacc15, accent: 0x111111, gear: [0xfacc15, 0x111111, 0xffffff] },
  { id: 'zombie', name: 'Zombie', pattern: 'splatter', body: 0x65a30d, accent: 0x7f1d1d, third: 0x1c1917, gear: [0x3f6212, 0x7f1d1d, 0xd9f99d] },
  { id: 'bubblegum', name: 'Bubblegum', pattern: 'dots', body: 0xf9a8d4, accent: 0x60a5fa, third: 0xffffff, gear: [0xf9a8d4, 0x1e3a8a, 0xffffff] },
  { id: 'nebula', name: 'Teal Nebula', pattern: 'galaxy', body: 0x042f2e, accent: 0x2dd4bf, gear: [0x115e59, 0x042f2e, 0x99f6e4] },
  { id: 'cherrybomb', name: 'Cherry Bomb', pattern: 'checker', body: 0xdc2626, accent: 0x111111, gear: [0xdc2626, 0x111111, 0xffffff] },
  { id: 'jungle', name: 'Jungle Cat', pattern: 'tiger', body: 0x15803d, accent: 0x052e16, gear: [0x15803d, 0x052e16, 0xfacc15] },
  { id: 'frostbite', name: 'Frostbite', pattern: 'hex', body: 0xbae6fd, accent: 0x0369a1, gear: [0xbae6fd, 0x0c4a6e, 0xffffff] },
  { id: 'police', name: 'Highway Patrol', pattern: 'bolt', body: 0xf8fafc, accent: 0x1d4ed8, gear: [0x1e3a8a, 0xf8fafc, 0xef4444] },
  { id: 'firestorm', name: 'Firestorm', pattern: 'lava', body: 0xfb923c, accent: 0xfef08a, third: 0x450a0a, gear: [0x450a0a, 0xfb923c, 0xfef08a] },
  { id: 'matrix', name: 'Matrix', pattern: 'pixel', body: 0x020a02, accent: 0x22c55e, third: 0x14532d, gear: [0x020a02, 0x22c55e, 0x86efac] },
  { id: 'candycane', name: 'Candy Cane', pattern: 'stripes', body: 0xffffff, accent: 0xdc2626, gear: [0xffffff, 0xdc2626, 0x16a34a] },
  { id: 'blackchrome', name: 'Black Chrome', pattern: 'chrome', body: 0x27272a, accent: 0xef4444, gear: [0x18181b, 0x3f3f46, 0xef4444] },
  { id: 'copper', name: 'Copper', pattern: 'chrome', body: 0xb45309, accent: 0x1c1917, gear: [0xb45309, 0x1c1917, 0xfde68a] },
  { id: 'patriot', name: 'Patriot', pattern: 'race', body: 0x1e3a8a, accent: 0xffffff, third: 0xdc2626, gear: [0x1e3a8a, 0xffffff, 0xdc2626] },
  { id: 'woodland', name: 'Woodland', pattern: 'camo', body: 0x3f4f2a, accent: 0x6b5d3a, third: 0x1f2a16, gear: [0x3f4f2a, 0x1f2a16, 0xc2b280] },
  { id: 'unicorn', name: 'Unicorn', pattern: 'aurora', body: 0xf0abfc, accent: 0x93c5fd, third: 0xfde68a, gear: [0xf0abfc, 0x6b21a8, 0xfde68a] },
  { id: 'twoface', name: 'Two Face', pattern: 'split', body: 0x111111, accent: 0xf5f5f5, third: 0xdc2626, gear: [0x111111, 0xf5f5f5, 0xdc2626] },
  { id: 'sunsetsplit', name: 'Sunset Split', pattern: 'split', body: 0xf97316, accent: 0x6d28d9, third: 0xfde047, gear: [0x6d28d9, 0xf97316, 0xfde047] },
  { id: 'icefire', name: 'Ice & Fire', pattern: 'split', body: 0x2563eb, accent: 0xea580c, third: 0xffffff, gear: [0x2563eb, 0xea580c, 0xffffff] },
  { id: 'dragon', name: 'Dragon', pattern: 'scales', body: 0x15803d, accent: 0x052e16, third: 0xfacc15, gear: [0x15803d, 0x052e16, 0xfacc15] },
  { id: 'mermaid', name: 'Mermaid', pattern: 'scales', body: 0x14b8a6, accent: 0x5b21b6, third: 0xa5f3fc, gear: [0x14b8a6, 0x5b21b6, 0xa5f3fc] },
  { id: 'cobra', name: 'Cobra', pattern: 'scales', body: 0x1c1917, accent: 0xb45309, third: 0xfbbf24, gear: [0x1c1917, 0xb45309, 0xfbbf24] },
  { id: 'gentleman', name: 'Gentleman', pattern: 'pinstripe', body: 0x1e293b, accent: 0xcbd5e1, third: 0xd4a017, gear: [0x1e293b, 0xd4a017, 0xcbd5e1] },
  { id: 'racinggreen', name: 'Racing Green', pattern: 'pinstripe', body: 0x14532d, accent: 0xf8fafc, third: 0xfacc15, gear: [0x14532d, 0xf8fafc, 0xfacc15] },
  { id: 'bubblepop', name: 'Bubble Pop', pattern: 'pinstripe', body: 0xf472b6, accent: 0xffffff, third: 0x7c3aed, gear: [0xf472b6, 0xffffff, 0x7c3aed] },
  { id: 'storm', name: 'Lightning Storm', pattern: 'bolt', body: 0x3b0764, accent: 0xfde047, gear: [0x3b0764, 0xfde047, 0xffffff] },
  { id: 'limehex', name: 'Lime Hex', pattern: 'hex', body: 0x84cc16, accent: 0x111111, gear: [0x84cc16, 0x111111, 0xffffff] },
  { id: 'goldcheck', name: 'Gold Checker', pattern: 'checker', body: 0xd4a017, accent: 0x111111, gear: [0x111111, 0xd4a017, 0xfff4cc] },
  // designed liveries (modelRig.js skinDesign)
  { id: 'factoryred', name: 'Factory Red', pattern: 'livery', body: 0xc8102e, accent: 0xf5f5f0, third: 0x111111, gear: [0xc8102e, 0xf5f5f0, 0x111111] },
  { id: 'factoryblue', name: 'Factory Blue', pattern: 'livery', body: 0x1f3a93, accent: 0xf5f5f0, third: 0xf2b21b, gear: [0x1f3a93, 0xf5f5f0, 0xf2b21b] },
  { id: 'heritage', name: 'Heritage', pattern: 'livery', body: 0xefe6d2, accent: 0x1e4d3a, third: 0xb5862b, gear: [0xefe6d2, 0x1e4d3a, 0xb5862b] },
  { id: 'greatwave', name: 'Great Wave', pattern: 'wave', body: 0x1b3b6f, accent: 0x2e6aa6, third: 0xf1ede4, gear: [0x1b3b6f, 0x2e6aa6, 0xf1ede4] },
  { id: 'sandwave', name: 'Dune Wave', pattern: 'wave', body: 0xc49a6c, accent: 0x8a6240, third: 0xf3e6cf, gear: [0xc49a6c, 0x8a6240, 0xf3e6cf] },
  { id: 'circuit', name: 'Circuit Board', pattern: 'circuit', body: 0x0f2a1d, accent: 0x2f8f5b, third: 0xd4af37, gear: [0x0f2a1d, 0x2f8f5b, 0xd4af37] },
  { id: 'risingsun', name: 'Rising Sun', pattern: 'sunrise', body: 0xf3ede2, accent: 0xc8102e, third: 0xc8102e, gear: [0xf3ede2, 0xc8102e, 0xc8102e] },
  { id: 'duskrays', name: 'Dusk Rays', pattern: 'sunrise', body: 0x2b1d3f, accent: 0x5a3a6e, third: 0xf2a65a, gear: [0x2b1d3f, 0x5a3a6e, 0xf2a65a] },
  { id: 'shards', name: 'Low Poly', pattern: 'shards', body: 0x35506b, accent: 0x7aa2c4, third: 0xf4f1ea, gear: [0x35506b, 0x7aa2c4, 0xf4f1ea] },
  { id: 'emberglass', name: 'Ember Glass', pattern: 'shards', body: 0x5a1e12, accent: 0xc2562d, third: 0xf2c46d, gear: [0x5a1e12, 0xc2562d, 0xf2c46d] },
  { id: 'topo', name: 'Topo Map', pattern: 'topo', body: 0xd9cfb8, accent: 0x8a7a5c, third: 0x5a4632, gear: [0xd9cfb8, 0x8a7a5c, 0x5a4632] },
  // more skins (2026-11-03): new patterns tribal, plaid, nebula, hazard, kaleido, speed, crystal, prism
  { id: 'tribalfire', name: 'Tribal Fire', pattern: 'tribal', body: 0x111111, accent: 0xff4d00, third: 0xffd000, gear: [0x111111, 0xffd000, 0xff4d00] },
  { id: 'icetribe', name: 'Ice Tribe', pattern: 'tribal', body: 0x0b1e33, accent: 0x7dd3fc, third: 0xffffff, gear: [0x0b1e33, 0x111111, 0x7dd3fc] },
  { id: 'jadetribe', name: 'Jade Tribal', pattern: 'tribal', body: 0x062e1f, accent: 0x34d399, third: 0xd1fae5, gear: [0x062e1f, 0xd1fae5, 0x34d399] },
  { id: 'lumberjack', name: 'Lumberjack', pattern: 'plaid', body: 0xb91c1c, accent: 0x111111, third: 0xfca5a5, gear: [0xb91c1c, 0xfca5a5, 0x111111] },
  { id: 'highland', name: 'Highland', pattern: 'plaid', body: 0x14532d, accent: 0x1e3a8a, third: 0xfacc15, gear: [0x14532d, 0xfacc15, 0x1e3a8a] },
  { id: 'grungeplaid', name: 'Grunge Plaid', pattern: 'plaid', body: 0x3f3f46, accent: 0x7c2d12, third: 0xe5e7eb, gear: [0x3f3f46, 0xe5e7eb, 0x7c2d12] },
  { id: 'nebula2', name: 'Nebula', pattern: 'nebula', body: 0x0f0a1f, accent: 0x7e22ce, third: 0xf472b6, gear: [0x0f0a1f, 0xf472b6, 0x7e22ce] },
  { id: 'deepspace', name: 'Deep Space', pattern: 'nebula', body: 0x020617, accent: 0x1d4ed8, third: 0x22d3ee, gear: [0x020617, 0x22d3ee, 0x1d4ed8] },
  { id: 'supernova', name: 'Supernova', pattern: 'nebula', body: 0x1c0a00, accent: 0xf97316, third: 0xfde047, gear: [0x1c0a00, 0xfde047, 0xf97316] },
  { id: 'hazard', name: 'Hazard', pattern: 'hazard', body: 0x27272a, accent: 0x111111, third: 0xfacc15, gear: [0x27272a, 0xfacc15, 0x111111] },
  { id: 'biohazard', name: 'Biohazard', pattern: 'hazard', body: 0x1a2e05, accent: 0x111111, third: 0x84cc16, gear: [0x1a2e05, 0x84cc16, 0x111111] },
  { id: 'redzone', name: 'Red Zone', pattern: 'hazard', body: 0xf4f4f5, accent: 0x111111, third: 0xdc2626, gear: [0xf4f4f5, 0xdc2626, 0x111111] },
  { id: 'kaleido', name: 'Kaleidoscope', pattern: 'kaleido', body: 0x581c87, accent: 0x06b6d4, third: 0xfacc15, gear: [0x581c87, 0xfacc15, 0x06b6d4] },
  { id: 'mandala', name: 'Mandala', pattern: 'kaleido', body: 0x7c2d12, accent: 0xf59e0b, third: 0xfef3c7, gear: [0x7c2d12, 0xfef3c7, 0xf59e0b] },
  { id: 'icefractal', name: 'Ice Fractal', pattern: 'kaleido', body: 0xe0f2fe, accent: 0x0ea5e9, third: 0x0c4a6e, gear: [0xe0f2fe, 0x0c4a6e, 0x0ea5e9] },
  { id: 'warpspeed', name: 'Warp Speed', pattern: 'speed', body: 0x0f172a, accent: 0x38bdf8, third: 0xffffff, gear: [0x0f172a, 0x111111, 0x38bdf8] },
  { id: 'redline', name: 'Redline', pattern: 'speed', body: 0x111111, accent: 0xef4444, third: 0xfef2f2, gear: [0x111111, 0xfef2f2, 0xef4444] },
  { id: 'goldstreak', name: 'Gold Streak', pattern: 'speed', body: 0x18181b, accent: 0xeab308, third: 0xfef9c3, gear: [0x18181b, 0xfef9c3, 0xeab308] },
  { id: 'amethyst', name: 'Amethyst', pattern: 'crystal', body: 0x3b0764, accent: 0xa855f7, third: 0xf5d0fe, gear: [0x3b0764, 0xf5d0fe, 0xa855f7] },
  { id: 'emeraldcut', name: 'Emerald Cut', pattern: 'crystal', body: 0x022c22, accent: 0x10b981, third: 0xa7f3d0, gear: [0x022c22, 0xa7f3d0, 0x10b981] },
  { id: 'icecrystal', name: 'Ice Crystal', pattern: 'crystal', body: 0xbae6fd, accent: 0xf0f9ff, third: 0x0369a1, gear: [0xbae6fd, 0x0369a1, 0xf0f9ff] },
  { id: 'ruby', name: 'Ruby', pattern: 'crystal', body: 0x450a0a, accent: 0xdc2626, third: 0xfecaca, gear: [0x450a0a, 0xfecaca, 0xdc2626] },
  { id: 'prismatic', name: 'Prismatic', pattern: 'prism', body: 0x111827, accent: 0xf8fafc, third: 0xd4a017, gear: [0x111827, 0xd4a017, 0xf8fafc] },
  { id: 'opal', name: 'Opal', pattern: 'prism', body: 0xf5f5f4, accent: 0xe0e7ff, third: 0xffffff, gear: [0xf5f5f4, 0x111111, 0xe0e7ff] },
  { id: 'blueflame', name: 'Blue Flame', pattern: 'flames', body: 0x1d4ed8, accent: 0x7dd3fc, third: 0x0b1020, gear: [0x1d4ed8, 0x0b1020, 0x7dd3fc] },
  { id: 'ghostflame', name: 'Ghost Flame', pattern: 'flames', body: 0x3f3f46, accent: 0x71717a, third: 0x111111, gear: [0x3f3f46, 0x111111, 0x71717a] },
  { id: 'greenflame', name: 'Toxic Flame', pattern: 'flames', body: 0x16a34a, accent: 0xbef264, third: 0x052e16, gear: [0x16a34a, 0x052e16, 0xbef264] },
  { id: 'arcticcamo', name: 'Arctic Camo', pattern: 'camo', body: 0xe5e7eb, accent: 0x9ca3af, third: 0x4b5563, gear: [0xe5e7eb, 0x4b5563, 0x9ca3af] },
  { id: 'sandcamo', name: 'Sand Camo', pattern: 'camo', body: 0xc2a878, accent: 0x8a6d46, third: 0xe8d9b5, gear: [0xc2a878, 0xe8d9b5, 0x8a6d46] },
  { id: 'pinkcamo', name: 'Pink Camo', pattern: 'camo', body: 0xf9a8d4, accent: 0xdb2777, third: 0xfce7f3, gear: [0xf9a8d4, 0xfce7f3, 0xdb2777] },
  { id: 'urbancamo', name: 'Urban Camo', pattern: 'camo', body: 0x52525b, accent: 0x27272a, third: 0xa1a1aa, gear: [0x52525b, 0xa1a1aa, 0x27272a] },
  { id: 'whitetiger', name: 'White Tiger', pattern: 'tiger', body: 0xf4f4f5, accent: 0x111111, third: 0x60a5fa, gear: [0xf4f4f5, 0x60a5fa, 0x111111] },
  { id: 'neonclaw', name: 'Neon Claw', pattern: 'tiger', body: 0x111111, accent: 0x22d3ee, third: 0xf0abfc, gear: [0x111111, 0xf0abfc, 0x22d3ee] },
  { id: 'cyberhex', name: 'Cyber Hex', pattern: 'hex', body: 0x0f172a, accent: 0xa855f7, third: 0x22d3ee, gear: [0x0f172a, 0x22d3ee, 0xa855f7] },
  { id: 'goldhex', name: 'Gold Hex', pattern: 'hex', body: 0xd4a017, accent: 0x1c1917, third: 0xfff4cc, gear: [0xd4a017, 0xfff4cc, 0x1c1917] },
  { id: 'redbolt', name: 'Red Bolt', pattern: 'bolt', body: 0x111111, accent: 0xef4444, third: 0xffffff, gear: [0x111111, 0x111111, 0xef4444] },
  { id: 'electric', name: 'Electric', pattern: 'bolt', body: 0x020617, accent: 0x67e8f9, third: 0xffffff, gear: [0x020617, 0x111111, 0x67e8f9] },
  { id: 'graffiti', name: 'Graffiti', pattern: 'splatter', body: 0x111111, accent: 0xfacc15, third: 0xec4899, gear: [0x111111, 0xec4899, 0xfacc15] },
  { id: 'mudsplash', name: 'Mud Splash', pattern: 'splatter', body: 0xe7e5e4, accent: 0x78350f, third: 0x451a03, gear: [0xe7e5e4, 0x451a03, 0x78350f] },
  { id: 'glitch', name: 'Glitch', pattern: 'pixel', body: 0x111111, accent: 0xff00aa, third: 0x00ffcc, gear: [0x111111, 0x00ffcc, 0xff00aa] },
  { id: 'arcade', name: 'Arcade', pattern: 'pixel', body: 0x1e1b4b, accent: 0xfacc15, third: 0xef4444, gear: [0x1e1b4b, 0xef4444, 0xfacc15] },
  { id: 'borealis', name: 'Borealis', pattern: 'aurora', body: 0x0f766e, accent: 0x6366f1, third: 0xa7f3d0, gear: [0x0f766e, 0xa7f3d0, 0x6366f1] },
  { id: 'frostflow', name: 'Frost Flow', pattern: 'lava', body: 0x0c4a6e, accent: 0x7dd3fc, third: 0x020617, gear: [0x0c4a6e, 0x020617, 0x7dd3fc] },
  { id: 'whitemarble', name: 'White Marble', pattern: 'marble', body: 0xf5f5f4, accent: 0x78716c, third: 0xd6d3d1, gear: [0xf5f5f4, 0xd6d3d1, 0x78716c] },
  { id: 'blackmarble', name: 'Black Marble', pattern: 'marble', body: 0x111111, accent: 0xd4a017, third: 0x3f3f46, gear: [0x111111, 0x3f3f46, 0xd4a017] },
  { id: 'gulfrace', name: 'Gulf Racer', pattern: 'race', body: 0x7dd3fc, accent: 0xf97316, third: 0x111111, gear: [0x7dd3fc, 0x111111, 0xf97316] },
  { id: 'martini', name: 'Martini Stripe', pattern: 'race', body: 0xf4f4f5, accent: 0x1e3a8a, third: 0xdc2626, gear: [0xf4f4f5, 0xdc2626, 0x1e3a8a] },
  { id: 'goldzebra', name: 'Gold Zebra', pattern: 'zebra', body: 0xd4a017, accent: 0x111111, third: 0xfff4cc, gear: [0xd4a017, 0xfff4cc, 0x111111] },
  { id: 'popart', name: 'Pop Art', pattern: 'dots', body: 0xfacc15, accent: 0xef4444, third: 0x111111, gear: [0xfacc15, 0x111111, 0xef4444] },
  { id: 'royalargyle', name: 'Royal Argyle', pattern: 'argyle', body: 0x1e3a8a, accent: 0x312e81, third: 0xfacc15, gear: [0x1e3a8a, 0xfacc15, 0x312e81] },
  { id: 'halfhalf', name: 'Half & Half', pattern: 'split', body: 0xf4f4f5, accent: 0x111111, third: 0xef4444, gear: [0xf4f4f5, 0xef4444, 0x111111] },
  { id: 'dusksplit', name: 'Dusk Split', pattern: 'split', body: 0xf97316, accent: 0x7c3aed, third: 0xfde047, gear: [0xf97316, 0xfde047, 0x7c3aed] },
  { id: 'firedragon', name: 'Fire Dragon', pattern: 'scales', body: 0x7f1d1d, accent: 0x111111, third: 0xf59e0b, gear: [0x7f1d1d, 0xf59e0b, 0x111111] },
  { id: 'siren', name: 'Siren', pattern: 'scales', body: 0x0d9488, accent: 0x1e3a8a, third: 0xa5f3fc, gear: [0x0d9488, 0xa5f3fc, 0x1e3a8a] },
  { id: 'tuxedo', name: 'Tuxedo', pattern: 'pinstripe', body: 0x18181b, accent: 0x52525b, third: 0xd4a017, gear: [0x18181b, 0xd4a017, 0x52525b] },
  { id: 'worksblue', name: 'Works Blue', pattern: 'livery', body: 0x1d4ed8, accent: 0xf4f4f5, third: 0xfacc15, gear: [0x1d4ed8, 0xfacc15, 0xf4f4f5] },
  { id: 'factorygreen', name: 'Factory Green', pattern: 'livery', body: 0x65a30d, accent: 0x111111, third: 0xffffff, gear: [0x65a30d, 0x111111, 0x111111] },
  { id: 'worksred', name: 'Works Red', pattern: 'livery', body: 0xdc2626, accent: 0xf4f4f5, third: 0x111111, gear: [0xdc2626, 0x111111, 0xf4f4f5] },
  { id: 'tsunami', name: 'Tsunami', pattern: 'wave', body: 0x1e3a8a, accent: 0x0ea5e9, third: 0xffffff, gear: [0x1e3a8a, 0x111111, 0x0ea5e9] },
  { id: 'motherboard', name: 'Motherboard', pattern: 'circuit', body: 0x052e16, accent: 0x22c55e, third: 0xfacc15, gear: [0x052e16, 0xfacc15, 0x22c55e] },
  { id: 'redsun', name: 'Red Sun', pattern: 'sunrise', body: 0xf4f4f5, accent: 0xfecaca, third: 0xdc2626, gear: [0xf4f4f5, 0xdc2626, 0xfecaca] },
  { id: 'polyice', name: 'Low Poly Ice', pattern: 'shards', body: 0x0ea5e9, accent: 0xe0f2fe, third: 0xffffff, gear: [0x0ea5e9, 0x111111, 0xe0f2fe] },
  { id: 'polyfire', name: 'Low Poly Fire', pattern: 'shards', body: 0xdc2626, accent: 0xfacc15, third: 0xffffff, gear: [0xdc2626, 0x111111, 0xfacc15] },
  { id: 'redrock', name: 'Red Rock', pattern: 'topo', body: 0xc2410c, accent: 0x7c2d12, third: 0xfed7aa, gear: [0xc2410c, 0xfed7aa, 0x7c2d12] },
  { id: 'neonchecker', name: 'Neon Checker', pattern: 'checker', body: 0x111111, accent: 0x84cc16, third: 0xffffff, gear: [0x111111, 0x111111, 0x84cc16] },
  { id: 'sunsetfade', name: 'Sunset Fade', pattern: 'gradient', body: 0xfde047, accent: 0xdb2777, third: 0xffffff, gear: [0xfde047, 0x111111, 0xdb2777] },
  { id: 'mintfade', name: 'Mint Fade', pattern: 'gradient', body: 0xd1fae5, accent: 0x0d9488, third: 0xffffff, gear: [0xd1fae5, 0x111111, 0x0d9488] },
  { id: 'mirage', name: 'Mirage', pattern: 'holo', body: 0xe0e7ff, accent: 0xf5d0fe, third: 0xffffff, gear: [0xe0e7ff, 0x111111, 0xf5d0fe] },
  { id: 'p-trailblazer', name: 'Trailblazer', pattern: 'livery', body: 0x0f172a, accent: 0xf97316, third: 0xfacc15, gear: [0x0f172a, 0xfacc15, 0xf97316] },
  { id: 'p-dustdevil', name: 'Dust Devil', pattern: 'wave', body: 0xc2a878, accent: 0x78350f, third: 0xfef3c7, gear: [0xc2a878, 0xfef3c7, 0x78350f] },
  { id: 'p-nightrider', name: 'Night Rider', pattern: 'speed', body: 0x020617, accent: 0x6366f1, third: 0xe0e7ff, gear: [0x020617, 0xe0e7ff, 0x6366f1] },
  { id: 'p-venomstrike', name: 'Venom Strike', pattern: 'tribal', body: 0x052e16, accent: 0x84cc16, third: 0xecfccb, gear: [0x052e16, 0xecfccb, 0x84cc16] },
  { id: 'p-voltage', name: 'Voltage', pattern: 'circuit', body: 0x020617, accent: 0x22d3ee, third: 0xfacc15, gear: [0x020617, 0xfacc15, 0x22d3ee] },
  { id: 'p-glacier', name: 'Glacier Elite', pattern: 'crystal', body: 0x0c4a6e, accent: 0xbae6fd, third: 0xffffff, gear: [0x0c4a6e, 0x111111, 0xbae6fd] },
  { id: 'p-phantom', name: 'Phantom', pattern: 'kaleido', body: 0x111111, accent: 0x3f3f46, third: 0xa1a1aa, gear: [0x111111, 0xa1a1aa, 0x3f3f46] },
  { id: 'p-solarflare', name: 'Solar Flare', pattern: 'nebula', body: 0x1c0a00, accent: 0xfb923c, third: 0xfef08a, gear: [0x1c0a00, 0xfef08a, 0xfb923c] },
  { id: 'p-royalty', name: 'Royalty', pattern: 'scales', body: 0x3b0764, accent: 0xd4a017, third: 0xfef3c7, gear: [0x3b0764, 0xfef3c7, 0xd4a017] },
  { id: 'p-prismelite', name: 'Prism Elite', pattern: 'prism', body: 0x0b0b12, accent: 0xffffff, third: 0xd4a017, gear: [0x0b0b12, 0xd4a017, 0xffffff] },
  { id: 'nightrun', name: 'Night Survey', pattern: 'topo', body: 0x141a24, accent: 0x3a4a5e, third: 0x7fb3d5, gear: [0x141a24, 0x3a4a5e, 0x7fb3d5] },
];
export const PATTERNS = ['solid', 'stripes', 'flames', 'camo', 'galaxy', 'carbon', 'chrome', 'tiger', 'gradient', 'checker', 'hex', 'bolt', 'splatter', 'pixel', 'aurora', 'lava', 'marble', 'race'];

// ---------------------------------------------------------------------
//  THE 3D MODELS (measured from the .glb files, in the model's own space:
//  +x = forward, +y = up, +z = right, ground at y = 0, metres)
//  paint:  materials recoloured with the paint's main colour
//  accent: materials recoloured with the paint's second colour
// ---------------------------------------------------------------------
function viperModel(file, dy) {
  const y = (v) => +(v + dy).toFixed(3);
  return {
    file, kind: 'car', comX: 0.035,
    paint: ['diffuse'], accent: ['spring'],
    steerWheel: 'steering_wheel', wheelCentre: [0.28, y(1.01), -0.32], wheelAxisTo: [0.55, y(0.94), -0.32],
    corners: { fl: { wheel: 'wheel_FL', steer: true }, fr: { wheel: 'wheel_FR', steer: true }, rl: { wheel: 'wheel_RL' }, rr: { wheel: 'wheel_RR' } },
    attach: { seat: [-0.3, y(0.62), -0.32], pegL: [0.7, y(0.6), -0.44], pegR: [0.7, y(0.6), -0.2], gripL: [0.28, y(1.01), -0.5], gripR: [0.28, y(1.01), -0.14], wheel: [0.28, y(1.01), -0.32] },
    seated: true,
  };
}

function quadModel(q) {
  const corner = (k) => ({ wheel: 'wheel_' + k, carry: ['knuckle_' + k], steer: true, arms: ['a_arm_lower_' + k, 'a_arm_upper_' + k], shocks: ['shock_' + k] });
  return {
    file: q.file, kind: 'atv', comX: q.comX,
    paint: ['body_paint'], accent: ['accent_paint', 'rim_paint'],
    steerGroup: 'handlebars', steerPivot: q.steerPivot, steerAxisTo: q.steerAxisTo,
    corners: { fl: corner('FL'), fr: corner('FR') },
    rearAxle: { group: 'swingarm', pivot: q.rearPivot, wheels: ['wheel_RL', 'wheel_RR'], shock: 'shock_R' },
    attach: q.attach,
  };
}

export const MODELS = {
  // the user's long-travel side-by-side, split into wheels by tools/bake-sxs.py
  // the user's buggy in three looks, by tools/bake-buggy.py (wheels split, the real steering wheel)
  sxs: {
    file: 'models/dune_runner_stock.glb', kind: 'car', comX: -0.05,
    paint: ['material_3'], accent: ['material_6'],
    steerWheel: 'steering_wheel', wheelCentre: [0.264,0.825,0.002], wheelAxisTo: [0.531,0.688,0.009],
    corners: { fl: { wheel: 'wheel_FL', steer: true }, fr: { wheel: 'wheel_FR', steer: true }, rl: { wheel: 'wheel_RL' }, rr: { wheel: 'wheel_RR' } },
    // centre seat; hands on the rim at 9 and 3 o'clock; feet on the pedals
    attach: { seat: [-0.22, 0.470, 0], pegL: [0.65, 0.500, -0.12], pegR: [0.65, 0.500, 0.12], gripL: [0.246,0.834,-0.12], gripR: [0.246,0.834,0.12], wheel: [0.264,0.825,0.002] },
    seated: true,
  },
  sxs_up: {
    file: 'models/dune_runner_upgraded.glb', kind: 'car', comX: -0.05,
    paint: ['paint_sand'], accent: ['shock_gold'],
    steerWheel: 'steering_wheel', wheelCentre: [0.264,0.861,0.002], wheelAxisTo: [0.531,0.724,0.009],
    corners: { fl: { wheel: 'wheel_FL', steer: true }, fr: { wheel: 'wheel_FR', steer: true }, rl: { wheel: 'wheel_RL' }, rr: { wheel: 'wheel_RR' } },
    // centre seat; hands on the rim at 9 and 3 o'clock; feet on the pedals
    attach: { seat: [-0.22, 0.506, 0], pegL: [0.65, 0.536, -0.12], pegR: [0.65, 0.536, 0.12], gripL: [0.246,0.87,-0.12], gripR: [0.246,0.87,0.12], wheel: [0.264,0.861,0.002] },
    seated: true,
  },
  sxs_race: {
    file: 'models/dune_runner_race.glb', kind: 'car', comX: -0.05,
    paint: ['paint_race_orange'], accent: ['shock_orange'],
    steerWheel: 'steering_wheel', wheelCentre: [0.264,0.825,0.002], wheelAxisTo: [0.531,0.688,0.009],
    corners: { fl: { wheel: 'wheel_FL', steer: true }, fr: { wheel: 'wheel_FR', steer: true }, rl: { wheel: 'wheel_RL' }, rr: { wheel: 'wheel_RR' } },
    // centre seat; hands on the rim at 9 and 3 o'clock; feet on the pedals
    attach: { seat: [-0.22, 0.470, 0], pegL: [0.65, 0.500, -0.12], pegR: [0.65, 0.500, 0.12], gripL: [0.246,0.834,-0.12], gripR: [0.246,0.834,0.12], wheel: [0.264,0.825,0.002] },
    seated: true,
  },
  bike: {
    // the user's 2-stroke bike, split into parts by tools/bake-kx-bike.py
    file: 'models/kx_dirt_bike.glb', kind: 'bike', comX: -0.02,
    paint: ['plastic_paint'], accent: [],
    steerGroup: 'front_end', steerPivot: [0.284, 1.099, 0], steerAxisTo: [0.765, 0.345, 0],
    forkSlide: 'fork_lowers', wheelF: 'wheel_front', wheelR: 'wheel_rear',
    swingarm: 'swingarm', swingPivot: [-0.176, 0.488, 0], shock: null,
    attach: { seat: [-0.25, 1.0, 0], pegL: [-0.077, 0.40, -0.15], pegR: [-0.077, 0.40, 0.15], gripL: [0.255, 1.175, -0.31], gripR: [0.255, 1.175, 0.31] },
  },
  // the quads: the ATV Garage pack, one model per quad (tools/bake-quads.mjs -> quadModels.js)
  ...Object.fromEntries(Object.entries(QUAD_MODELS).map(([id, q]) => ['q_' + id, quadModel(q)])),

  // the Vipers: the user's dune buggy, three versions (tools/bake-viper.mjs groups the
  // wheels and steering wheel). dy: how much higher the chassis sits than the Turbo's
  utv: viperModel('models/viper_turbo.glb', 0),
  utvr: viperModel('models/viper_turbo_r.glb', -0.03),
  utvbaja: viperModel('models/viper_baja.glb', 0.12),

};

const G = 9.81;

// ---------------------------------------------------------------------
//  BASE TUNING PER TYPE
// ---------------------------------------------------------------------
const BIKE_BASE = {
  type: 'bike', modelKey: 'bike', category: 'Dirt Bikes',
  mass: 195,                     // kg, bike + rider
  inertia: [62, 48, 22],          // pitch (x), yaw (y), roll (z)  kg m^2
  rideHeight: 0.86,               // centre of mass above flat ground at rest
  cdA: 0.75, crr: 0.025,
  wheels: [
    // z / r measured from the model (axle 0.745 m ahead of / behind the middle, CoM 2 cm back)
    { id: 'front', z: 0.765, x: 0, r: 0.345, travel: 0.30, freq: 1.55, sag: 0.30, steer: true, driven: false, brake: 'front', mu: 1.0, alphaPeak: 0.17 },
    { id: 'rear', z: -0.725, x: 0, r: 0.34, travel: 0.31, freq: 1.7, sag: 0.33, steer: false, driven: true, brake: 'rear', mu: 1.06, alphaPeak: 0.13 },
  ],
  damping: { bump: 0.4, rebound: 0.6 },
  progressive: 6,                 // spring force at full travel = this x static load
  steer: { maxLow: 32, latAcc: 10.6, rate: 3.6, feedback: 2.5, airYaw: 2.2 },
  lean: { max: 52, rate: 7 },
  air: { flipRate: 4.8, flipAccel: 7.5, spinDamp: 1.2, gyro: 2.2, whip: 78, spinRate: 3.9 },
  balance: { rollK: 45000, rollC: 3200, airRollK: 900, airRollC: 160 },
  brakes: { front: 1500, rear: 1000 },      // N of force at the tyre at full input
  crash: { landPitch: 64, impact: 19, slide: 86, roll: 80, loop: 90 },
  probes: [
    { p: [0, 0.75, 0.15], r: 0.18, hit: 'rider' },     // rider head / helmet
    { p: [0.42, 0.35, 0.62], r: 0.06, hit: 'hard' },   // left bar end
    { p: [-0.42, 0.35, 0.62], r: 0.06, hit: 'hard' },  // right bar end
    { p: [0, -0.35, 0.05], r: 0.12, hit: 'skid' },     // bash plate
    { p: [0, 0.18, 1.12], r: 0.1, hit: 'hard' },       // front fender
    { p: [0, 0.25, -1.0], r: 0.1, hit: 'soft' },       // rear fender
    { p: [0.22, -0.28, -0.12], r: 0.06, hit: 'hard' }, // left peg
    { p: [-0.22, -0.28, -0.12], r: 0.06, hit: 'hard' },// right peg
  ],
  radius: 0.55, halfWidth: 0.42, halfLength: 1.1,
  audio: { kind: 'bike' },
};

const ATV_BASE = {
  type: 'atv', modelKey: 'quad', category: 'Quads',
  mass: 300,
  inertia: [95, 115, 52],
  rideHeight: 0.56,
  cdA: 1.0, crr: 0.03,
  wheels: [
    // the model: axles 0.64 m ahead / behind, front track 0.94 m, rear 0.86 m
    { id: 'fl', z: 0.64, x: 0.47, r: 0.28, travel: 0.23, freq: 1.75, sag: 0.3, steer: true, driven: false, brake: 'front', mu: 1.05, alphaPeak: 0.16 },
    { id: 'fr', z: 0.64, x: -0.47, r: 0.28, travel: 0.23, freq: 1.75, sag: 0.3, steer: true, driven: false, brake: 'front', mu: 1.05, alphaPeak: 0.16 },
    { id: 'rl', z: -0.64, x: 0.43, r: 0.255, travel: 0.25, freq: 1.8, sag: 0.32, steer: false, driven: true, brake: 'rear', mu: 1.0, alphaPeak: 0.14 },
    { id: 'rr', z: -0.64, x: -0.43, r: 0.255, travel: 0.25, freq: 1.8, sag: 0.32, steer: false, driven: true, brake: 'rear', mu: 1.0, alphaPeak: 0.14 },
  ],
  damping: { bump: 0.5, rebound: 0.78 },
  progressive: 5,
  steer: { maxLow: 35, maxHigh: 9, highSpeed: 22, rate: 3.8, airYaw: 0.9, latAcc: 10.0 }, // quicker, sharper than before
  antiRoll: 16000,                 // N per metre of left/right compression difference
  rollCentre: 0.68,                // 0 = tyre forces at the ground (tippy), 1 = at the CoM (can't tip)
  riderLean: 900,                  // N m of body-English torque when steering
  riderBalance: 5200,              // N m per radian: the rider throws weight to the high side
  axleScrub: 0.14,                 // solid rear axle resists turning (understeer)
  air: { flipRate: 3.6, flipAccel: 6.0, spinDamp: 1.0, gyro: 1.5, whip: 35, spinRate: 3.9 },
  brakes: { front: 2100, rear: 1500 },
  crash: { landPitch: 66, impact: 19, roll: 88, loop: 90 },
  probes: [
    { p: [0, 0.85, -0.05], r: 0.2, hit: 'rider' },
    { p: [0.42, 0.48, 0.25], r: 0.07, hit: 'hard' },
    { p: [-0.42, 0.48, 0.25], r: 0.07, hit: 'hard' },
    { p: [0, -0.26, 0.0], r: 0.14, hit: 'skid' },
    { p: [0, 0.0, 1.05], r: 0.14, hit: 'hard' },
    { p: [0, 0.15, -1.0], r: 0.14, hit: 'soft' },
    { p: [0.45, 0.2, -0.65], r: 0.12, hit: 'soft' },
    { p: [-0.45, 0.2, -0.65], r: 0.12, hit: 'soft' },
    { p: [0.5, 0.1, 0.65], r: 0.12, hit: 'soft' },
    { p: [-0.5, 0.1, 0.65], r: 0.12, hit: 'soft' },
    { p: [0, 0.35, 0.3], r: 0.25, hit: 'roll' },   // top of the body (rollover)
  ],
  radius: 0.75, halfWidth: 0.6, halfLength: 1.1,
  audio: { kind: 'atv' },
};
// a quad's physics shaped like its model (quadModels.js): wheel positions and tyre sizes,
// and the body crash points / size scaled from the Pro 450R's (a pit quad's nose is much
// closer than a full-size one's). f: per-wheel tweaks on top
function quadShape(id, f = (w) => w) {
  const q = QUAD_MODELS[id], w = q.wheels, ref = QUAD_MODELS.atv450;
  const kl = q.size.length / ref.size.length, kw = q.size.width / ref.size.width, kh = (w.rF + w.rR) / (ref.wheels.rF + ref.wheels.rR);
  return {
    wheels: ATV_BASE.wheels.map((b) => f(b.z > 0 ? { ...b, z: w.zF, x: Math.sign(b.x) * w.xF, r: w.rF } : { ...b, z: w.zR, x: Math.sign(b.x) * w.xR, r: w.rR })),
    probes: ATV_BASE.probes.map((pr) => ({ ...pr, p: [pr.p[0] * kw, pr.p[1] * kh, pr.p[2] * kl], r: pr.r * Math.min(kl, kw) })),
    radius: ATV_BASE.radius * kl, halfWidth: ATV_BASE.halfWidth * kw, halfLength: ATV_BASE.halfLength * kl,
  };
}

// side-by-side: heavy, long travel, seated driver inside a roll cage
const UTV_BASE = {
  type: 'car', modelKey: 'utv', category: 'Side-by-Sides',
  mass: 820,
  inertia: [520, 640, 260],
  rideHeight: 0.74,
  cdA: 1.6, crr: 0.03,
  wheels: [
    // model: axles 1.25 m ahead / behind, track 1.58 m, 32" tyres
    { id: 'fl', z: 1.25, x: 0.79, r: 0.405, travel: 0.42, freq: 1.45, sag: 0.3, steer: true, driven: true, brake: 'front', mu: 1.0, alphaPeak: 0.15 },
    { id: 'fr', z: 1.25, x: -0.79, r: 0.405, travel: 0.42, freq: 1.45, sag: 0.3, steer: true, driven: true, brake: 'front', mu: 1.0, alphaPeak: 0.15 },
    { id: 'rl', z: -1.25, x: 0.79, r: 0.405, travel: 0.48, freq: 1.5, sag: 0.32, steer: false, driven: true, brake: 'rear', mu: 1.02, alphaPeak: 0.13 },
    { id: 'rr', z: -1.25, x: -0.79, r: 0.405, travel: 0.48, freq: 1.5, sag: 0.32, steer: false, driven: true, brake: 'rear', mu: 1.02, alphaPeak: 0.13 },
  ],
  damping: { bump: 0.42, rebound: 0.7 },
  progressive: 5,
  steer: { maxLow: 38, maxHigh: 18, highSpeed: 34, rate: 5.2, airYaw: 0.5, latAcc: 13.0 }, // quicker, more lock at speed: they used to plough straight on
  antiRoll: 30000,
  rollCentre: 0.55,
  riderLean: 0, riderBalance: 6000, axleScrub: 0,
  air: { flipRate: 1.2, flipAccel: 2.5, spinDamp: 1.6, gyro: 0.6, whip: 0, spinRate: 1.5 },
  brakes: { front: 6200, rear: 4400 },
  // cars are tough: a roll cage and seat belts. Only ending up on the roof counts as a crash,
  // and a car on its side pushes itself back onto its wheels
  crash: { landPitch: 62, impact: 16, roll: 85, loop: 85, nose: 9, tough: true },
  probes: [
    { p: [0.6, 1.05, 0.2], r: 0.15, hit: 'roll' },   // roll cage corners
    { p: [-0.6, 1.05, 0.2], r: 0.15, hit: 'roll' },
    { p: [0.6, 1.05, -0.9], r: 0.15, hit: 'roll' },
    { p: [-0.6, 1.05, -0.9], r: 0.15, hit: 'roll' },
    { p: [0, -0.4, 0.2], r: 0.18, hit: 'skid' },
    { p: [0, -0.3, -0.9], r: 0.18, hit: 'skid' },
    { p: [0, -0.15, 1.95], r: 0.15, hit: 'hard' },    // nose
    { p: [0, 0.0, -1.95], r: 0.15, hit: 'soft' },     // tail
    { p: [0.7, 0.05, 0], r: 0.15, hit: 'soft' },
    { p: [-0.7, 0.05, 0], r: 0.15, hit: 'soft' },
  ],
  radius: 1.1, halfWidth: 0.92, halfLength: 1.98,
  audio: { kind: 'utv' },
};
// wheel positions of the Viper models (see viperModel), for the physics
function viperWheels(r, f = (w) => w) {
  return UTV_BASE.wheels.map((w) => f({ ...w, z: Math.sign(w.z) * 1.125, x: Math.sign(w.x) * 0.86, r }));
}

function engine(o) {
  return {
    idle: 1700, redline: 11000, torque: [[1000, 18], [3000, 30], [6000, 44], [8000, 48], [10000, 43], [11500, 35]],
    gearSpeeds: [12, 17.5, 23, 28.5, 33], shiftUp: 0.93, shiftDown: 0.45, shiftTime: 0.12,
    engineBrake: 9, inertia: 0.12, reverseSpeed: 2, ...o,
  };
}

// ---------------------------------------------------------------------
//  THE VEHICLES (each one = a model + paint + tuning)
//  paint: the colour it comes in (from BIKE_COLORS); tier: shown in the garage
// ---------------------------------------------------------------------
export const VEHICLES = [
  {
    ...BIKE_BASE,
    id: 'mx250', name: 'Factory 250F', paint: 'blue', tier: 'Starter',
    desc: 'Light and screaming. Less grunt than the 450 but it flicks into turns, floats over whoops and spins fast in the air.',
    stats: { speed: 7, accel: 7, handling: 9, stability: 6, suspension: 7 },
    // light and nimble: quick to turn and rotate, revs to the moon, short on grunt
    mass: 172, inertia: [48, 37, 17],
    steer: { ...BIKE_BASE.steer, rate: 4.8, latAcc: 11.4 },
    air: { ...BIKE_BASE.air, flipRate: 5.4, spinRate: 4.5, whip: 82 },
    wheels: BIKE_BASE.wheels.map((w) => ({ ...w, freq: w.freq * 0.94 })),
    engine: engine({ idle: 2000, redline: 13500, torque: [[1500, 11], [4000, 17], [8000, 24], [11000, 26.5], [13000, 24], [14000, 19]], gearSpeeds: [11, 16, 21, 26, 30.5] }),
  },
  {
    ...BIKE_BASE,
    id: 'mx450', name: 'Factory 450 MX', paint: 'red', tier: 'Pro',
    desc: 'Open-class four-stroke. Brutal torque out of corners and the speed to clear anything on the track.',
    stats: { speed: 9, accel: 9, handling: 7, stability: 7, suspension: 8 },
    // heavier and torquey: pulls from nothing, slower to turn and rotate, very planted
    mass: 204, inertia: [66, 52, 24],
    steer: { ...BIKE_BASE.steer, rate: 3.3, latAcc: 10.3 },
    air: { ...BIKE_BASE.air, flipRate: 4.4, spinRate: 3.5, whip: 72 },
    engine: engine({ idle: 1500, redline: 10500, torque: [[1000, 26], [3000, 38], [6000, 45], [8000, 45], [10000, 38], [11000, 30]], gearSpeeds: [12.5, 18.5, 24.5, 30, 35] }),
  },
  {
    ...BIKE_BASE,
    id: 'mx450w', name: 'Factory 450 Works', paint: 'black', tier: 'Works',
    desc: 'The factory team bike: more power, stiffer race suspension and a tighter front end. Fast, but it bites.',
    stats: { speed: 10, accel: 10, handling: 8, stability: 6, suspension: 9 },
    damping: { bump: 0.46, rebound: 0.66 },
    steer: { ...BIKE_BASE.steer, latAcc: 11.2, rate: 4.0 },
    wheels: BIKE_BASE.wheels.map((w) => ({ ...w, freq: w.freq * 1.08, mu: w.mu * 1.03 })),
    mass: 198, inertia: [62, 48, 22],
    air: { ...BIKE_BASE.air, flipRate: 4.8, spinRate: 3.9, whip: 78 },
    engine: engine({ idle: 1500, redline: 11200, torque: [[1000, 27], [3000, 41], [6000, 50], [8000, 52], [10000, 47], [11500, 37]], gearSpeeds: [13, 19.5, 25.5, 31.5, 37] }),
  },
  {
    ...ATV_BASE,
    id: 'atv450', modelKey: 'q_atv450', ...quadShape('atv450'), name: 'Pro 450R', paint: 'yellow', tier: 'Starter',
    desc: 'A race-bred sport quad. Planted on four wheels, slides the rear when you ask it to.',
    stats: { speed: 8, accel: 7, handling: 8, stability: 8, suspension: 7 },
    mass: 285, inertia: [88, 106, 48],
    air: { ...ATV_BASE.air, flipRate: 3.7, spinRate: 4.0 },
    engine: engine({ idle: 1600, redline: 10000, torque: [[1000, 22], [3000, 36], [6000, 48], [7500, 50], [9000, 44], [10500, 35]], gearSpeeds: [10, 15, 20, 25, 29.5], reverseSpeed: 4 }),
  },
  {
    ...ATV_BASE,
    id: 'atv700', modelKey: 'q_atv700', ...quadShape('atv700'), name: 'Pro 700 Brute', paint: 'orange', tier: 'Pro',
    desc: 'Big-bore torque monster. Heavy and stable, pulls hard everywhere, a handful in tight turns.',
    stats: { speed: 9, accel: 8, handling: 6, stability: 10, suspension: 8 },
    mass: 350, inertia: [112, 136, 62],
    steer: { ...ATV_BASE.steer, maxLow: 29, rate: 2.4 },
    air: { ...ATV_BASE.air, flipRate: 2.9, spinRate: 3.1 },
    engine: engine({ idle: 1300, redline: 8500, torque: [[1000, 38], [2500, 55], [4500, 66], [6000, 64], [7500, 56], [9000, 44]], gearSpeeds: [9.5, 14.5, 19.5, 24.5, 30], reverseSpeed: 4 }),
  },
  {
    ...UTV_BASE,
    id: 'utv', name: 'Viper RS Turbo', paint: 'green', tier: 'Pro',
    wheels: viperWheels(0.375), halfLength: 1.83, halfWidth: 1.0,
    desc: 'Two-seat turbo side-by-side with all-wheel drive. Soaks up huge landings and drifts on command.',
    stats: { speed: 9, accel: 8, handling: 7, stability: 9, suspension: 10 },
    engine: engine({ idle: 1200, redline: 8000, torque: [[1000, 120], [3000, 175], [5500, 205], [7000, 195], [8500, 165]], gearSpeeds: [12, 20, 28, 35], engineBrake: 30, shiftTime: 0.08, reverseSpeed: 5 }),
  },
  {
    ...UTV_BASE,
    id: 'utvr', modelKey: 'utvr', name: 'Viper RS Turbo R', paint: 'black', tier: 'Works',
    wheels: viperWheels(0.375), halfLength: 1.83, halfWidth: 1.0, rideHeight: 0.72,
    desc: 'Race-built Viper: bigger turbo, stiffer shocks and a quicker steering rack. The fastest thing on four small wheels.',
    stats: { speed: 10, accel: 9, handling: 8, stability: 9, suspension: 10 },
    damping: { bump: 0.48, rebound: 0.78 },
    steer: { ...UTV_BASE.steer, rate: 5.6, latAcc: 13.6 },
    mass: 780,
    engine: engine({ idle: 1200, redline: 8200, torque: [[1000, 130], [3000, 200], [5500, 235], [7000, 225], [8500, 190]], gearSpeeds: [12.5, 21, 29.5, 37], engineBrake: 30, shiftTime: 0.07, reverseSpeed: 5 }),
  },
  // ---- more bikes (same model, different engines and chassis) ----
  {
    ...BIKE_BASE,
    id: 'mx125', name: 'Two-Stroke 125', paint: 'yellow', tier: 'Starter',
    desc: 'A screaming little two-stroke. Lightest bike in the pits: keep it pinned and it floats over everything.',
    stats: { speed: 6, accel: 6, handling: 10, stability: 5, suspension: 6 },
    mass: 160, inertia: [44, 34, 15],
    steer: { ...BIKE_BASE.steer, rate: 5.0, latAcc: 11.6 },
    air: { ...BIKE_BASE.air, flipRate: 5.6, spinRate: 4.8, whip: 85 },
    wheels: BIKE_BASE.wheels.map((w) => ({ ...w, freq: w.freq * 0.9 })),
    engine: engine({ idle: 2200, redline: 14000, torque: [[2000, 8], [5000, 12], [9000, 20], [12000, 23], [13500, 21], [14500, 16]], gearSpeeds: [10.5, 15.5, 20.5, 25, 29] }),
    audio: { kind: 'bike', pitch: 1.35, stroke: 2 },
  },
  {
    ...BIKE_BASE,
    id: 'mx350', name: 'Factory 350F', paint: 'orange', tier: 'Pro',
    desc: 'The in-between: nearly the 450\'s pull with the 250\'s flick. The all-rounder of the paddock.',
    stats: { speed: 8, accel: 8, handling: 8, stability: 7, suspension: 8 },
    mass: 190, inertia: [58, 45, 20],
    steer: { ...BIKE_BASE.steer, rate: 4.0, latAcc: 10.9 },
    air: { ...BIKE_BASE.air, flipRate: 4.9, spinRate: 4.0, whip: 78 },
    engine: engine({ idle: 1800, redline: 12500, torque: [[1500, 15], [4000, 24], [7500, 33], [10000, 35], [12000, 31], [13000, 25]], gearSpeeds: [11.5, 17, 22.5, 28, 32.5] }),
  },
  {
    ...BIKE_BASE,
    id: 'mx500', name: 'Open 500 Two-Stroke', paint: 'white', tier: 'Works',
    desc: 'An old-school open-class monster. Wild power that hits like a truck - hang on.',
    stats: { speed: 10, accel: 10, handling: 6, stability: 6, suspension: 8 },
    mass: 205, inertia: [66, 50, 23],
    steer: { ...BIKE_BASE.steer, rate: 3.2, latAcc: 10.2 },
    air: { ...BIKE_BASE.air, flipRate: 4.2, spinRate: 3.4, whip: 74 },
    engine: engine({ idle: 1500, redline: 9500, torque: [[1500, 22], [3500, 40], [6000, 58], [7500, 56], [9000, 44], [10000, 34]], gearSpeeds: [13.5, 20, 26.5, 32.5, 38] }),
    audio: { kind: 'bike', pitch: 0.8, stroke: 2 },
  },
  {
    ...BIKE_BASE,
    id: 'enduro', name: 'Enduro 300', paint: 'teal', tier: 'Pro',
    desc: 'Built for long days off-road: plush, soft suspension and a smooth engine. Soaks up whoops, wallows on big jumps.',
    stats: { speed: 7, accel: 7, handling: 7, stability: 9, suspension: 10 },
    mass: 200, inertia: [64, 50, 22],
    damping: { bump: 0.34, rebound: 0.55 },
    wheels: BIKE_BASE.wheels.map((w) => ({ ...w, freq: w.freq * 0.85, travel: w.travel * 1.08, mu: w.mu * 1.04 })),
    air: { ...BIKE_BASE.air, flipRate: 4.2, spinRate: 3.5, whip: 70 },
    engine: engine({ idle: 1500, redline: 10000, torque: [[1000, 22], [3000, 32], [5500, 38], [7500, 37], [9000, 32], [10000, 26]], gearSpeeds: [11, 16.5, 22, 27, 31.5] }),
  },
  // ---- the Dune Runner (the user's side-by-side model) ----
  {
    ...UTV_BASE,
    id: 'sxs', modelKey: 'sxs', name: 'Dune Runner XP', paint: 'white', native: true, tier: 'Pro',
    desc: 'A stripped-down long-travel side-by-side with an open cage. Shorter and lighter than the Viper - it dances over rough ground.',
    stats: { speed: 9, accel: 9, handling: 8, stability: 8, suspension: 10 },
    mass: 720, rideHeight: 0.7,
    wheels: UTV_BASE.wheels.map((w) => ({ ...w, z: Math.sign(w.z) * 1.043, x: Math.sign(w.x) * (w.z > 0 ? 0.852 : 0.925), r: 0.37, travel: w.travel * 1.1 })),
    halfLength: 1.7, halfWidth: 0.85,
    steer: { ...UTV_BASE.steer, rate: 5.4 },
    engine: engine({ idle: 1200, redline: 8500, torque: [[1000, 115], [3000, 170], [5500, 200], [7000, 192], [8500, 160]], gearSpeeds: [12, 20, 28, 36], engineBrake: 28, shiftTime: 0.08, reverseSpeed: 5 }),
  },
  // ---- more quads ----
  {
    ...ATV_BASE,
    id: 'atv250', modelKey: 'q_atv250', ...quadShape('atv250'), name: 'Sport 250', paint: 'green', tier: 'Starter',
    desc: 'A light, nimble sport quad. Not much top end, but it turns on a dime and flicks into the air.',
    stats: { speed: 6, accel: 6, handling: 9, stability: 7, suspension: 6 },
    mass: 255, inertia: [78, 94, 42],
    steer: { ...ATV_BASE.steer, rate: 3.4 },
    air: { ...ATV_BASE.air, flipRate: 4.0, spinRate: 4.3 },
    engine: engine({ idle: 1700, redline: 10500, torque: [[1000, 15], [3000, 24], [6000, 32], [8000, 33], [9500, 29], [10500, 24]], gearSpeeds: [9.5, 14, 18.5, 23, 27] }),
  },
  {
    ...ATV_BASE,
    id: 'atv1000', modelKey: 'q_atv1000', ...quadShape('atv1000'), name: 'Mud Pro 1000', paint: 'black', tier: 'Works',
    desc: 'A twin-cylinder brute. Huge torque everywhere and the most stable quad on the hill - heavy in the air.',
    stats: { speed: 10, accel: 9, handling: 5, stability: 10, suspension: 9 },
    mass: 390, inertia: [125, 150, 70],
    steer: { ...ATV_BASE.steer, maxLow: 28, rate: 2.2 },
    air: { ...ATV_BASE.air, flipRate: 2.6, spinRate: 2.8 },
    engine: engine({ idle: 1200, redline: 8000, torque: [[1000, 52], [2500, 74], [4500, 86], [6000, 82], [7000, 72], [8000, 58]], gearSpeeds: [10, 15.5, 21, 26.5, 32], reverseSpeed: 4 }),
  },
  // ---- round two: more bikes, quads and side-by-sides ----
  {
    ...BIKE_BASE,
    id: 'mx85', name: 'Mini 85', paint: 'green', tier: 'Starter',
    desc: 'A big-wheel minibike two-stroke. Tiny, buzzy and slow on the straights, but it goes wherever you point it.',
    stats: { speed: 5, accel: 6, handling: 10, stability: 4, suspension: 5 },
    mass: 152, inertia: [42, 33, 14.5],
    steer: { ...BIKE_BASE.steer, rate: 5.4, latAcc: 11.8 },
    air: { ...BIKE_BASE.air, flipRate: 6.0, spinRate: 5.2, whip: 88 },
    wheels: BIKE_BASE.wheels.map((w) => ({ ...w, freq: w.freq * 0.9 })),
    engine: engine({ idle: 2300, redline: 14500, torque: [[2000, 6], [5000, 10], [9000, 16], [12000, 18.5], [14000, 17], [15000, 13]], gearSpeeds: [9.5, 14, 18, 22, 25.5] }),
    audio: { kind: 'bike', pitch: 1.55, stroke: 2 },
  },
  {
    ...BIKE_BASE,
    id: 'volt', name: 'Volt E-MX', paint: 'white', tier: 'Pro',
    desc: 'Electric. Full torque from zero, one long gear and almost silent - it pulls out of turns like nothing else.',
    stats: { speed: 8, accel: 10, handling: 8, stability: 7, suspension: 8 },
    mass: 182, inertia: [56, 44, 19],
    steer: { ...BIKE_BASE.steer, rate: 4.2, latAcc: 11.0 },
    air: { ...BIKE_BASE.air, flipRate: 5.0, spinRate: 4.2, whip: 80 },
    engine: engine({ idle: 600, redline: 12000, torque: [[500, 40], [3000, 40], [6000, 38], [9000, 33], [11000, 27], [12500, 20]], gearSpeeds: [33], shiftTime: 0.05, engineBrake: 14 }),
    audio: { kind: 'bike', pitch: 1.9, electric: true },
  },
  {
    ...BIKE_BASE,
    id: 'sm450', name: 'Supermoto 450', paint: 'red', tier: 'Works',
    desc: 'Street tyres and stiff, short suspension. Grips like glue and has the highest top speed - but it hates big landings.',
    stats: { speed: 10, accel: 9, handling: 9, stability: 6, suspension: 5 },
    mass: 200, inertia: [62, 49, 22],
    damping: { bump: 0.5, rebound: 0.72 },
    steer: { ...BIKE_BASE.steer, rate: 3.8, latAcc: 12.2 },
    wheels: BIKE_BASE.wheels.map((w) => ({ ...w, freq: w.freq * 1.2, travel: w.travel * 0.8, mu: w.mu * 1.12 })),
    air: { ...BIKE_BASE.air, flipRate: 4.2, spinRate: 3.4, whip: 66 },
    engine: engine({ idle: 1500, redline: 10800, torque: [[1000, 27], [3000, 40], [6000, 48], [8000, 50], [10000, 44], [11000, 35]], gearSpeeds: [14, 21, 28, 34, 40] }),
  },
  {
    ...BIKE_BASE,
    id: 'rally', name: 'Desert Rally 450', paint: 'yellow', tier: 'Works',
    desc: 'Built for the Dakar: long gearing, a heavy tank and the calmest chassis in the paddock. Unshakeable at speed.',
    stats: { speed: 10, accel: 8, handling: 6, stability: 10, suspension: 9 },
    mass: 222, inertia: [72, 58, 26],
    damping: { bump: 0.4, rebound: 0.62 },
    steer: { ...BIKE_BASE.steer, rate: 3.0, latAcc: 10.0 },
    wheels: BIKE_BASE.wheels.map((w) => ({ ...w, travel: w.travel * 1.06, mu: w.mu * 1.02 })),
    air: { ...BIKE_BASE.air, flipRate: 3.8, spinRate: 3.0, whip: 64 },
    engine: engine({ idle: 1400, redline: 10200, torque: [[1000, 28], [3000, 41], [6000, 49], [8000, 49], [10000, 42], [11000, 33]], gearSpeeds: [14, 21, 28, 34.5, 40.5] }),
    audio: { kind: 'bike', pitch: 0.9 },
  },
  {
    ...ATV_BASE,
    id: 'atv90', modelKey: 'q_atv90', ...quadShape('atv90'), name: 'Pit Quad 90', paint: 'pink', tier: 'Starter',
    desc: 'A little pit quad. Slow but impossible to fall off - perfect for learning the jumps.',
    stats: { speed: 4, accel: 5, handling: 9, stability: 9, suspension: 5 },
    mass: 210, inertia: [64, 78, 35],
    crash: { ...ATV_BASE.crash, impact: ATV_BASE.crash.impact * 1.35 }, // forgiving landings: it is the learner's quad
    steer: { ...ATV_BASE.steer, rate: 3.6 },
    air: { ...ATV_BASE.air, flipRate: 4.2, spinRate: 4.5 },
    engine: engine({ idle: 1800, redline: 10000, torque: [[1000, 11], [3000, 17], [6000, 23], [8000, 24], [9500, 21], [10500, 17]], gearSpeeds: [8, 12, 16, 19.5, 23], reverseSpeed: 3 }),
  },
  {
    ...ATV_BASE,
    id: 'atv450w', modelKey: 'q_atv450w', ...quadShape('atv450w', (w) => ({ ...w, freq: w.freq * 1.06, mu: w.mu * 1.04 })), name: 'Pro 450R Works', paint: 'purple', tier: 'Works',
    desc: 'The factory race quad: more power, race shocks and wider grip. The quickest quad around a track.',
    stats: { speed: 9, accel: 9, handling: 9, stability: 8, suspension: 9 },
    mass: 278, inertia: [86, 102, 46],
    damping: { bump: 0.46, rebound: 0.7 },
    steer: { ...ATV_BASE.steer, rate: 3.2 },
    air: { ...ATV_BASE.air, flipRate: 3.9, spinRate: 4.1 },
    engine: engine({ idle: 1600, redline: 10500, torque: [[1000, 25], [3000, 40], [6000, 53], [7500, 55], [9000, 49], [10500, 38]], gearSpeeds: [10.5, 16, 21.5, 27, 32], reverseSpeed: 4 }),
  },
  {
    ...UTV_BASE,
    id: 'utvbaja', modelKey: 'utvbaja', name: 'Viper Baja', paint: 'desertcamo', tier: 'Works',
    halfLength: 1.83, halfWidth: 1.0, rideHeight: 0.86,
    desc: 'Long-travel desert Viper with tall gearing. Floats over whoops at full throttle and lands from the moon.',
    stats: { speed: 10, accel: 8, handling: 7, stability: 10, suspension: 10 },
    damping: { bump: 0.4, rebound: 0.68 },
    wheels: viperWheels(0.43, (w) => ({ ...w, travel: w.travel * 1.15, freq: w.freq * 0.92 })), // bigger tyres, longer travel
    mass: 820,
    engine: engine({ idle: 1200, redline: 8000, torque: [[1000, 125], [3000, 190], [5500, 220], [7000, 212], [8500, 178]], gearSpeeds: [13, 22, 31, 39], engineBrake: 30, shiftTime: 0.08, reverseSpeed: 5 }),
  },
  {
    ...UTV_BASE,
    id: 'sxsr', modelKey: 'sxs_race', name: 'Dune Runner Turbo', paint: 'orange', native: true, tier: 'Works',
    desc: 'The Dune Runner with a turbo bolted on. Light, angry and very fast - keep it pointed straight on landing.',
    stats: { speed: 10, accel: 10, handling: 8, stability: 7, suspension: 10 },
    mass: 735, rideHeight: 0.7,
    wheels: UTV_BASE.wheels.map((w) => ({ ...w, z: Math.sign(w.z) * 1.043, x: Math.sign(w.x) * (w.z > 0 ? 0.852 : 0.925), r: 0.37, travel: w.travel * 1.1 })),
    halfLength: 1.7, halfWidth: 0.85,
    steer: { ...UTV_BASE.steer, rate: 5.4 },
    engine: engine({ idle: 1200, redline: 8800, torque: [[1000, 128], [3000, 196], [5500, 232], [7000, 224], [8800, 186]], gearSpeeds: [12.5, 21, 29.5, 38], engineBrake: 28, shiftTime: 0.07, reverseSpeed: 5 }),
  },
  {
    ...UTV_BASE,
    id: 'sxsu', modelKey: 'sxs_up', name: 'Dune Runner Pro', paint: 'yellow', native: true, tier: 'Works',
    desc: 'The upgraded Dune Runner: sand paint, gold shocks, bronze wheels and taller tyres. Soaks up anything.',
    stats: { speed: 9, accel: 9, handling: 8, stability: 9, suspension: 10 },
    mass: 728, rideHeight: 0.736,
    wheels: UTV_BASE.wheels.map((w) => ({ ...w, z: Math.sign(w.z) * 1.043, x: Math.sign(w.x) * (w.z > 0 ? 0.852 : 0.925), r: 0.406, travel: w.travel * 1.18 })),
    halfLength: 1.7, halfWidth: 0.85,
    steer: { ...UTV_BASE.steer, rate: 5.4, latAcc: 13.4 },
    engine: engine({ idle: 1200, redline: 8800, torque: [[1000, 128], [3000, 196], [5500, 232], [7000, 224], [8800, 186]], gearSpeeds: [12.5, 21, 29.5, 38], engineBrake: 28, shiftTime: 0.07, reverseSpeed: 5 }),
  },
];

export const CATEGORIES = ['Dirt Bikes', 'Quads', 'Side-by-Sides'];

// ---------------------------------------------------------------------
//  SPECIAL VEHICLES - never sold, never in the shop or the AI pool. Only the
//  accounts in SPECIAL_OWNERS have them (the server enforces it).
//   crawl: no vehicle at all - the rider crawls on all fours, with the
//          Desert Rally 450's speed and handling
//   chair: an office chair; the rider sits on it backwards and pushes with
//          their feet (built from simple shapes, drawn in vehicleModel.js)
//   penguin: no vehicle - belly-down slide with swim strokes (rider.js)
//   hop:     no vehicle - a sack race, hopping along feet together (rider.js)
//   cart:    a shopping cart, ridden standing on the back, kicking along
//   mower:   a ride-on lawn mower, sat on, steering wheel and all
//   board:   a skateboard, side-on stance, pushing with the back foot
//   unicycle: one wheel, pedalling, arms out for balance
//  (the cart, mower, board and unicycle are built from simple shapes in vehicleModel.js)
// ---------------------------------------------------------------------
export const SPECIAL_OWNERS = ['lmkk'];
const RALLY = VEHICLES.find((v) => v.id === 'rally');
export const SPECIAL_VEHICLES = [
  {
    ...RALLY, id: 'crawl', name: 'The Crawler', category: 'Specials', tier: 'Dev', special: 'crawl', modelKey: 'none', paint: 'stock',
    desc: 'No bike. Just you, on all fours, FASTER than a Desert Rally 450. Only lmkk has this one.',
    // the Desert Rally 450, tuned up: more pull and taller gearing
    engine: engine({ idle: 1400, redline: 10200, torque: [[1000, 38], [3000, 55], [6000, 66], [8000, 66], [10000, 57], [11000, 45]], gearSpeeds: [17, 26, 35, 43, 51] }),
    audio: { kind: 'none' },
  },
  {
    ...ATV_BASE, id: 'chair', name: 'Office Chair', category: 'Specials', tier: 'Dev', special: 'chair', modelKey: 'none', paint: 'stock',
    desc: 'A swivel chair, ridden backwards, pushed along with both feet. Only lmkk has this one.',
    stats: { speed: 7, accel: 8, handling: 7, stability: 6, suspension: 3 },
    mass: 140, inertia: [40, 50, 22],
    engine: engine({ idle: 1200, redline: 7000, torque: [[1000, 26], [3000, 36], [5000, 40], [7000, 34]], gearSpeeds: [11, 17, 23, 27] }),
    crash: { landPitch: 60, impact: 15, roll: 80, loop: 85 },
    audio: { kind: 'none' },
  },
  {
    ...ATV_BASE, id: 'penguin', name: 'Penguin Slide', category: 'Specials', tier: 'Dev', special: 'penguin', modelKey: 'none', paint: 'stock',
    desc: 'Belly down, arms out, sliding across the dirt like a penguin on ice. Flaps on the jumps. Only lmkk has this one.',
    stats: { speed: 9, accel: 7, handling: 6, stability: 9, suspension: 4 },
    mass: 180, inertia: [55, 70, 30],
    steer: { ...ATV_BASE.steer, rate: 2.6 },                 // slippery: wide, lazy turns
    wheels: ATV_BASE.wheels.map((w) => ({ ...w, mu: w.mu * 0.85, alphaPeak: w.alphaPeak * 1.4 })),
    engine: engine({ idle: 1200, redline: 9000, torque: [[1000, 30], [3000, 44], [6000, 52], [8000, 50], [9000, 44]], gearSpeeds: [13, 20, 27, 33, 39] }),
    audio: { kind: 'none' },
  },
  {
    ...ATV_BASE, id: 'hop', name: 'Sack Race', category: 'Specials', tier: 'Dev', special: 'hop', modelKey: 'none', paint: 'stock',
    desc: 'Both feet in a sack, hopping round the track as fast as a quad. Arms flailing. Only lmkk has this one.',
    stats: { speed: 7, accel: 6, handling: 9, stability: 8, suspension: 9 },
    mass: 160, inertia: [45, 55, 25],
    steer: { ...ATV_BASE.steer, rate: 3.8 },
    air: { ...ATV_BASE.air, flipRate: 4.5, spinRate: 5 },
    engine: engine({ idle: 1400, redline: 9500, torque: [[1000, 22], [3000, 34], [6000, 42], [8000, 41], [9500, 35]], gearSpeeds: [11, 17, 23, 28, 33] }),
    audio: { kind: 'none' },
  },
  {
    ...ATV_BASE, id: 'cart', name: 'Shopping Cart', category: 'Specials', tier: 'Dev', special: 'cart', modelKey: 'none', paint: 'stock',
    desc: 'Stand on the back, lean on the handle, kick off and let it roll. Wobbly wheels included. Only lmkk has this one.',
    stats: { speed: 6, accel: 7, handling: 6, stability: 7, suspension: 2 },
    mass: 130, inertia: [42, 52, 24],
    steer: { ...ATV_BASE.steer, rate: 2.8 },
    wheels: ATV_BASE.wheels.map((w) => ({ ...w, mu: w.mu * 0.9, travel: w.travel * 0.6 })),
    engine: engine({ idle: 1200, redline: 8000, torque: [[1000, 24], [3000, 34], [6000, 40], [8000, 34]], gearSpeeds: [10, 16, 22, 27] }),
    crash: { landPitch: 55, impact: 13, roll: 70, loop: 80 },
    audio: { kind: 'none' },
  },
  {
    ...ATV_BASE, id: 'mower', name: 'Ride-on Mower', category: 'Specials', tier: 'Dev', special: 'mower', modelKey: 'none', paint: 'stock',
    desc: 'A sit-on lawn mower with a little too much engine. Slow off the line, never stops, cuts the track short. Only lmkk has this one.',
    stats: { speed: 6, accel: 4, handling: 5, stability: 10, suspension: 3 },
    mass: 260, inertia: [80, 96, 44],
    steer: { ...ATV_BASE.steer, rate: 2.4 },
    engine: engine({ idle: 1500, redline: 7200, torque: [[1000, 40], [3000, 52], [5500, 56], [7200, 48]], gearSpeeds: [7, 12, 17, 22, 26] }),
    crash: { landPitch: 60, impact: 16, roll: 75, loop: 85 },
  },
  {
    ...ATV_BASE, id: 'board', name: 'Skateboard', category: 'Specials', tier: 'Dev', special: 'board', modelKey: 'none', paint: 'stock',
    desc: 'Side-on, knees bent, pushing with the back foot. Twitchy, quick and flips like crazy. Only lmkk has this one.',
    stats: { speed: 8, accel: 7, handling: 10, stability: 4, suspension: 2 },
    mass: 95, inertia: [30, 36, 16],
    steer: { ...ATV_BASE.steer, rate: 4.4 },
    air: { ...ATV_BASE.air, flipRate: 4.8, spinRate: 5.4 },
    wheels: ATV_BASE.wheels.map((w) => ({ ...w, travel: w.travel * 0.5 })),
    engine: engine({ idle: 1200, redline: 9000, torque: [[1000, 22], [3000, 32], [6000, 40], [9000, 34]], gearSpeeds: [12, 19, 26, 32, 37] }),
    crash: { landPitch: 50, impact: 12, roll: 65, loop: 75 },
    audio: { kind: 'none' },
  },
  {
    ...ATV_BASE, id: 'unicycle', name: 'Unicycle', category: 'Specials', tier: 'Dev', special: 'unicycle', modelKey: 'none', paint: 'stock',
    desc: 'One wheel, two pedals, arms everywhere. Somehow keeps up with the quads. Only lmkk has this one.',
    stats: { speed: 6, accel: 6, handling: 8, stability: 5, suspension: 4 },
    mass: 110, inertia: [36, 44, 20],
    steer: { ...ATV_BASE.steer, rate: 3.6 },
    air: { ...ATV_BASE.air, flipRate: 4.2, spinRate: 5 },
    engine: engine({ idle: 1300, redline: 8500, torque: [[1000, 22], [3000, 32], [6000, 38], [8500, 32]], gearSpeeds: [10, 16, 22, 27, 31] }),
    crash: { landPitch: 55, impact: 13, roll: 70, loop: 80 },
    audio: { kind: 'none' },
  },
];
export const SPECIAL_CATEGORY = 'Specials';
export const isSpecial = (id) => SPECIAL_VEHICLES.some((v) => v.id === id);
export const ownsSpecials = (accountKey) => SPECIAL_OWNERS.includes(String(accountKey || '').toLowerCase());

export function getVehicle(id) {
  return VEHICLES.find((v) => v.id === id) || SPECIAL_VEHICLES.find((v) => v.id === id) || VEHICLES[0];
}

// ---------------------------------------------------------------------
//  UPGRADES (bought in the shop, per vehicle, 5 levels each)
//  They scale the physics a little - never enough to make a vehicle
//  a different class.
// ---------------------------------------------------------------------
export const UPGRADES = {
  engine: { name: 'Engine', levels: [800, 1600, 3000, 5000, 8000].map((price, i) => ({ price, power: [1.04, 1.08, 1.12, 1.16, 1.22][i] })) },
  suspension: { name: 'Suspension', levels: [700, 1400, 2600, 4400, 7000].map((price, i) => ({ price, travel: 1 + 0.03 * (i + 1), damp: 1 + 0.04 * (i + 1) })) },
  tyres: { name: 'Tyres', levels: [600, 1300, 2400, 4000, 6500].map((price, i) => ({ price, grip: 1 + 0.03 * (i + 1) })) },
  weight: { name: 'Weight Reduction', levels: [700, 1500, 2800, 4500, 7000].map((price, i) => ({ price, mass: 1 - 0.03 * (i + 1) })) },
  air: { name: 'Air Control', levels: [600, 1200, 2200, 3600, 5500].map((price, i) => ({ price, rot: 1 + 0.06 * (i + 1) })) },
  // anti-lag: lift and get back on the gas and the power is there straight away (a short kick),
  // and the exhaust pops and bangs much harder
  antilag: { name: 'Anti-Lag', levels: [1800, 3600, 6500].map((price, i) => ({ price, kick: [0.08, 0.14, 0.2][i], pops: [0.35, 0.65, 1][i] })) },
};

export function applyUpgrades(def, ups = {}) {
  const L = (p) => (ups[p] ? UPGRADES[p].levels[Math.min(ups[p], UPGRADES[p].levels.length) - 1] : null);
  const e = L('engine'), s = L('suspension'), t = L('tyres'), w = L('weight'), a = L('air'), al = L('antilag');
  if (!e && !s && !t && !w && !a && !al) return def;
  const d = JSON.parse(JSON.stringify(def));
  if (e) d.engine.torque = d.engine.torque.map(([r, q]) => [r, q * e.power]);
  if (s) { d.wheels.forEach((x) => { x.travel *= s.travel; }); d.damping.bump *= s.damp; d.damping.rebound *= s.damp; }
  if (t) d.wheels.forEach((x) => { x.mu *= t.grip; });
  if (w) { d.mass *= w.mass; d.inertia = d.inertia.map((i) => i * w.mass); }
  if (a) { d.air.flipRate *= a.rot; d.air.spinRate *= a.rot; d.air.flipAccel *= a.rot; }
  if (al) d.antilag = { kick: al.kick, pops: al.pops };
  return d;
}

// Fill in derived numbers (spring rates, mount points, gear ratios)
export function prepareVehicle(def) {
  const v = JSON.parse(JSON.stringify(def));
  const zs = v.wheels.map((w) => w.z);
  const zf = Math.max(...zs), zr = Math.min(...zs);
  const wb = zf - zr;
  for (const w of v.wheels) {
    const sameAxle = v.wheels.filter((o) => o.z === w.z).length;
    const frac = w.z === zf ? -zr / wb : zf / wb;          // share of weight on this axle
    const load = (v.mass * G * frac) / sameAxle;            // static load on this wheel
    const mw = load / G;
    w.k = mw * Math.pow(2 * Math.PI * w.freq, 2);
    const sagDist = w.sag * w.travel;
    w.preload = Math.max(0, load - w.k * sagDist);
    const full = load * v.progressive;
    w.k3 = Math.max(0, (full - w.preload - w.k * w.travel) / Math.pow(w.travel, 3));
    w.cBump = 2 * v.damping.bump * Math.sqrt(w.k * mw);
    w.cRebound = 2 * v.damping.rebound * Math.sqrt(w.k * mw);
    w.staticLoad = load;
    // mount = wheel centre when the suspension is fully compressed
    w.y = -(v.rideHeight - w.r) + w.travel - sagDist;
  }
  v.wheelbase = wb;
  const driven = v.wheels.find((w) => w.driven);
  const wr = (v.engine.redline * 2 * Math.PI) / 60;
  v.engine.ratios = v.engine.gearSpeeds.map((s) => (wr * driven.r) / s);
  return v;
}

// the paint a vehicle is shown in: 'stock' = the colour that model variant comes in
export function paintFor(vehicleId, colorId) {
  const v = getVehicle(vehicleId);
  const stock = !colorId || colorId === 'stock';
  const id = stock ? v.paint : colorId;
  const c = BIKE_COLORS.find((x) => x.id === id) || BIKE_COLORS[0];
  // native: the model keeps its own painted colours in stock (only the rider kit uses 'paint')
  return stock && v.native ? { ...c, id: 'native-' + v.id, native: true } : c;
}
