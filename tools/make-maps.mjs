// =====================================================================
//  Builds shared/tracksMore.js from the map designs below. For each map it
//  tries every pair of "free" straights (the closure solver stretches those
//  two so the loop closes), keeps the layout with no feature overruns and
//  the most room between far-apart parts, centres it, and sizes the world.
//    node tools/make-maps.mjs
// =====================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildTrack } from '../shared/trackgen.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = (at, h, face, top, land) => ({ at, type: 'table', h, face, top, land });
const D = (at, h, face, gap, h2, land) => ({ at, type: 'double', h, face, gap, h2, land });
const TR = (at, h, face, gap, h2, land) => ({ at, type: 'triple', h, face, gap, h2, land });
const ST = (at, h, face, gap, h2, top, land) => ({ at, type: 'step', h, face, gap, h2, top, land });
const WH = (at, n, len, h) => ({ at, type: 'whoops', n, len, h });
const RO = (at, n, len, h) => ({ at, type: 'rollers', n, len, h });
const turn = (deg, r, berm = 1) => ({ turn: deg, r, berm });
const str = (len, name, features = [], w) => ({ len, name, features, ...(w ? { w } : {}) });

const MAPS = [
  { id: 'redrock', name: 'Red Rock Mesa', difficulty: 'Hard', recommend: ['Dirt Bikes', 'Quads'], seed: 9011, defaultWidth: 12,
    desc: 'Red desert rock, big step-ups and a mesa-top table section with long views.',
    look: { dirt: [1.28, 0.76, 0.58], grass: [1.22, 0.86, 0.6], trees: 0.1, pines: 0.05, rocks: 3.5, fog: 0xe7b897, skyTop: 0x3f7cc4, horizon: 0xf0c9a5 },
    terrain: { hills: 10, hillScale: 180, rim: 48, bumps: [] },
    segments: [str(150, 'Start Straight', [], 20), turn(90, 20), str(120, 'Mesa Step', [ST(22, 1.5, 6.5, 6, 2.4, 9, 10)]), turn(90, 18), str(110, 'Red Rhythm', [D(14, 1.6, 6.5, 5, 1.4, 8), RO(62, 3, 11, 0.9)]), turn(-90, 16), str(120, 'Canyon Table', [T(20, 2.0, 9, 9, 10)]), turn(90, 22), str(130, 'Sandstone Triple', [TR(30, 2.0, 8.5, 8, 1.8, 10)]), turn(90, 20), str(100, 'Dust Whoops', [WH(14, 12, 4.6, 0.5)]), turn(90, 18)] },
  { id: 'bayou', name: 'Bayou Run', difficulty: 'Medium', recommend: ['Quads', 'Side-by-Sides'], seed: 9022, defaultWidth: 14,
    desc: 'Swampy flats and slick mud between mossy trees. Wide lines, long whoops and rolling tables.',
    look: { dirt: [0.6, 0.5, 0.4], grass: [0.7, 0.9, 0.55], trees: 2.4, pines: 0.1, rocks: 0.4, fog: 0xa8b39c, skyTop: 0x6d8597, horizon: 0xb8c2ae },
    terrain: { hills: 5, hillScale: 160, rim: 36, bumps: [{ x: 0, z: 0, r: 70, h: -3 }] },
    segments: [str(160, 'Start Straight', [], 20), turn(90, 24), str(130, 'Gator Tables', [T(16, 1.6, 8, 7, 9), T(70, 1.8, 9, 8, 10)]), turn(90, 22), str(140, 'Swamp Whoops', [WH(16, 14, 5.5, 0.55)]), turn(90, 22), str(150, 'Cypress Double', [D(24, 1.7, 7.5, 6, 1.5, 9), RO(90, 3, 13, 1.0)]), turn(90, 24)] },
  { id: 'alpine', name: 'Alpine Pass', difficulty: 'Hard', recommend: ['Dirt Bikes'], seed: 9033, defaultWidth: 11,
    desc: 'High in the mountains: pine forest, a dusting of snow, steep uphill steps and a downhill triple.',
    look: { snow: 0.35, dirt: [0.8, 0.72, 0.66], grass: [0.8, 1.0, 0.85], trees: 1.6, pines: 1, rocks: 2, fog: 0xd5e0ea, skyTop: 0x3b6fb6, horizon: 0xdde8f2 },
    terrain: { hills: 14, hillScale: 140, rim: 50, bumps: [{ x: 60, z: -60, r: 120, h: 14 }] },
    segments: [str(140, 'Start Straight', [], 18), turn(120, 20), str(110, 'Summit Step', [ST(20, 1.5, 6.5, 6, 2.4, 8, 10)]), turn(-90, 16), str(120, 'Pine Rhythm', [D(12, 1.6, 6.5, 5, 1.4, 8), D(58, 1.6, 6.5, 5, 1.4, 8)]), turn(150, 18), str(140, 'Downhill Triple', [TR(32, 2.1, 9, 8, 1.8, 11)]), turn(90, 20), str(90, 'Ridge Whoops', [WH(12, 10, 4.6, 0.5)]), turn(90, 20)] },
  { id: 'harbor', name: 'Sand Harbor', difficulty: 'Easy', recommend: ['Dirt Bikes', 'Quads', 'Side-by-Sides'], seed: 9044, defaultWidth: 16,
    desc: 'A sunny beach track: soft sand, gentle tables and wide sweeping berms. Great for learning.',
    look: { sand: 0.8, dirt: [1.25, 1.08, 0.85], grass: [1.1, 1.1, 0.85], trees: 0.2, pines: 0.05, rocks: 0.3, fog: 0xe8f2f8, skyTop: 0x3a8ee6, horizon: 0xd9eef8 },
    terrain: { hills: 4, hillScale: 200, rim: 30, bumps: [] },
    segments: [str(170, 'Start Straight', [], 22), turn(90, 30, 0.6), str(140, 'Beach Tables', [T(18, 1.2, 6, 5, 7), T(70, 1.4, 7, 6, 8)]), turn(90, 28, 0.7), str(130, 'Dune Rollers', [RO(14, 4, 12, 0.8)]), turn(90, 28, 0.7), str(150, 'Pier Double', [D(26, 1.5, 7, 5, 1.3, 8)]), turn(90, 30, 0.6)] },
  { id: 'ashfall', name: 'Ashfall Volcano', difficulty: 'Expert', recommend: ['Dirt Bikes'], seed: 9055, defaultWidth: 10,
    desc: 'Black volcanic ash under a burning sky. Tight, technical and full of big gaps.',
    look: { dirt: [0.45, 0.42, 0.42], grass: [0.55, 0.55, 0.5], trees: 0.1, pines: 0.05, rocks: 3, fog: 0x6b5552, skyTop: 0x3a1f2b, horizon: 0xc2553a },
    terrain: { hills: 12, hillScale: 130, rim: 55, bumps: [{ x: 0, z: 0, r: 90, h: 10 }] },
    segments: [str(130, 'Start Straight', [], 16), turn(90, 15), str(120, 'Lava Gap', [D(16, 1.8, 7.5, 7, 1.6, 9), T(64, 1.9, 8.5, 8, 10)]), turn(90, 14), str(100, 'Ash Step', [ST(30, 1.4, 6, 4.5, 2.0, 9, 10)]), turn(-90, 14), str(100, 'Cinder Whoops', [WH(12, 12, 4.4, 0.55)]), turn(90, 14), str(130, 'Caldera Table', [T(22, 2.2, 10, 10, 11)]), turn(90, 15), str(90, 'Ember Rhythm', [D(12, 1.5, 6, 4.5, 1.3, 7)]), turn(-90, 14), str(90, 'Obsidian Rollers', [RO(12, 3, 11, 0.9)]), turn(90, 15), str(110, 'Crater Straight'), turn(90, 16)] },
  { id: 'farm', name: 'Countryside Farm', difficulty: 'Easy', recommend: ['Dirt Bikes', 'Quads'], seed: 9066, defaultWidth: 14,
    desc: 'Green fields and hay bales. A relaxed loop with friendly tables and smooth rollers.',
    look: { dirt: [1.0, 0.86, 0.72], grass: [0.9, 1.15, 0.75], trees: 1.2, pines: 0.1, rocks: 0.2 },
    terrain: { hills: 6, hillScale: 170, rim: 30, bumps: [] },
    segments: [str(150, 'Start Straight', [], 20), turn(90, 24), str(120, 'Barn Tables', [T(16, 1.2, 6, 5, 7), T(64, 1.5, 7, 6, 8)]), turn(90, 22), str(100, 'Field Rollers', [RO(12, 4, 11, 0.8)]), turn(-90, 18), str(90, 'Silo Double', [D(18, 1.5, 6.5, 5, 1.3, 8)]), turn(90, 20), str(120, 'Orchard Run'), turn(90, 22), str(100, 'Haystack Table', [T(20, 1.6, 7, 6, 8)]), turn(90, 22)] },
  { id: 'maple', name: 'Maple Ridge', difficulty: 'Medium', recommend: ['Dirt Bikes', 'Quads'], seed: 9077, defaultWidth: 12,
    desc: 'Autumn colours on a rolling ridge. Flowing rhythm, a stepdown and a long golden triple.',
    look: { dirt: [0.9, 0.75, 0.6], grass: [1.25, 0.95, 0.55], trees: 2.0, pines: 0.2, rocks: 0.6, fog: 0xe2cfb5, skyTop: 0x5a86c0, horizon: 0xf0dcc2 },
    terrain: { hills: 11, hillScale: 150, rim: 40, bumps: [{ x: -40, z: 30, r: 90, h: 8 }] },
    segments: [str(140, 'Start Straight', [], 18), turn(90, 20), str(120, 'Leaf Rhythm', [D(12, 1.6, 6.5, 5, 1.4, 8), RO(62, 3, 11, 0.9)]), turn(120, 18), str(130, 'Golden Triple', [TR(30, 2.0, 8.5, 8, 1.8, 10)]), turn(-60, 24), str(100, 'Acorn Whoops', [WH(14, 12, 4.6, 0.5)]), turn(120, 18), str(120, 'Ridge Table', [T(20, 1.9, 8.5, 8, 10)]), turn(90, 20)] },
  { id: 'motopark', name: 'Motopark GP', difficulty: 'Medium', recommend: ['Dirt Bikes', 'Quads', 'Side-by-Sides'], seed: 9088, defaultWidth: 16,
    desc: 'A wide, fast grand-prix track built for racing: big straights, big tables, room to pass.',
    look: { dirt: [0.98, 0.86, 0.74], grass: [0.85, 1.05, 0.8], trees: 0.6, pines: 0.3, rocks: 0.4 },
    terrain: { hills: 6, hillScale: 200, rim: 34, bumps: [] },
    segments: [str(200, 'Start Straight', [], 24), turn(90, 28), str(180, 'GP Tables', [T(22, 1.8, 9, 9, 10), T(100, 2.1, 10, 10, 11)]), turn(90, 26), str(150, 'Fast Rollers', [RO(16, 4, 14, 1.0)]), turn(-90, 22), str(120, 'Pass Double', [D(22, 1.7, 7.5, 6, 1.5, 9)]), turn(90, 26), str(80, 'Chicane'), turn(90, 24), str(160, 'Back Straight', [TR(40, 2.0, 9, 8, 1.8, 11)]), turn(90, 28)] },
  { id: 'badlands', name: 'Badlands', difficulty: 'Hard', recommend: ['Side-by-Sides', 'Quads'], seed: 9099, defaultWidth: 16,
    desc: 'Grey-tan clay hills and rock everywhere. Long whoop valleys and big tables for four wheels.',
    look: { dirt: [0.95, 0.88, 0.78], grass: [1.0, 0.95, 0.75], trees: 0.05, pines: 0.02, rocks: 4, fog: 0xd8ccb8, skyTop: 0x5a8ccc, horizon: 0xe6dccb },
    terrain: { hills: 12, hillScale: 190, rim: 52, bumps: [{ x: 50, z: 50, r: 110, h: 12 }] },
    segments: [str(180, 'Start Straight', [], 22), turn(90, 30, 0.6), str(170, 'Clay Tables', [T(22, 2.0, 11, 11, 13), T(92, 2.3, 12, 12, 14)]), turn(120, 28, 0.6), str(160, 'Gulch Whoops', [WH(18, 10, 6.5, 0.75)]), turn(-60, 34, 0.4), str(150, 'Butte Rollers', [RO(16, 3, 16, 1.2)]), turn(120, 30, 0.6), str(140, 'Mesa Double', [D(24, 2.0, 10, 8, 1.8, 12)]), turn(90, 30, 0.6)] },
  { id: 'riverbed', name: 'Riverbed Canyon', difficulty: 'Medium', recommend: ['Dirt Bikes', 'Quads'], seed: 9121, defaultWidth: 13,
    desc: 'A dry riverbed between sandstone walls: rocky rhythm, a gap over the old channel and sweeping sand berms.',
    look: { dirt: [1.15, 0.92, 0.72], grass: [1.05, 0.98, 0.72], trees: 0.5, pines: 0.1, rocks: 2.8, fog: 0xe9d8bd, skyTop: 0x4c86c9, horizon: 0xf1e2c8 },
    terrain: { hills: 9, hillScale: 170, rim: 50, bumps: [{ x: 0, z: 0, r: 100, h: -5 }] },
    segments: [str(150, 'Start Straight', [], 18), turn(90, 22), str(120, 'Channel Gap', [D(18, 1.7, 7.5, 6, 1.5, 9)]), turn(90, 20), str(110, 'Pebble Rhythm', [RO(12, 3, 11, 0.9), T(56, 1.6, 7, 6, 8)]), turn(-90, 18), str(100, 'Dry Falls Step', [ST(30, 1.4, 6, 4.5, 2.0, 9, 10)]), turn(90, 20), str(130, 'Sandbar Whoops', [WH(14, 12, 4.8, 0.5)]), turn(90, 22), str(110, 'Canyon Table', [T(22, 1.9, 8.5, 8, 10)]), turn(90, 22)] },
  { id: 'highlands', name: 'Highland Heath', difficulty: 'Hard', recommend: ['Dirt Bikes'], seed: 9132, defaultWidth: 11,
    desc: 'Windswept hilltops and heather: big uphill tables, a cliff-top triple and fast off-camber turns.',
    look: { dirt: [0.82, 0.7, 0.62], grass: [0.82, 0.9, 0.7], trees: 0.4, pines: 0.6, rocks: 2.2, fog: 0xc9d1cc, skyTop: 0x4a6f9a, horizon: 0xd4dbd6 },
    terrain: { hills: 15, hillScale: 160, rim: 52, bumps: [{ x: 50, z: -40, r: 110, h: 12 }] },
    segments: [str(150, 'Start Straight', [], 17), turn(120, 18), str(120, 'Heather Tables', [T(16, 1.8, 8, 7, 9), T(66, 2.0, 9, 8, 10)]), turn(-60, 22), str(110, 'Cliff Triple', [TR(30, 2.0, 8.5, 8, 1.8, 10)]), turn(120, 18), str(100, 'Bog Rhythm', [D(12, 1.5, 6.5, 5, 1.3, 8), RO(56, 3, 11, 0.9)]), turn(90, 18), str(120, 'Moor Whoops', [WH(14, 12, 4.6, 0.5)]), turn(90, 20)] },
  { id: 'twilight', name: 'Twilight Valley', difficulty: 'Medium', recommend: ['Dirt Bikes'], seed: 9110, defaultWidth: 12,
    desc: 'A valley under a purple dusk sky. Rhythm lanes, a big table and a flowing triple.',
    look: { dirt: [0.85, 0.72, 0.75], grass: [0.75, 0.85, 0.9], trees: 1.4, pines: 0.6, rocks: 0.8, fog: 0x6b5b8a, skyTop: 0x1e1b4b, horizon: 0xc77dba },
    terrain: { hills: 9, hillScale: 150, rim: 40, bumps: [{ x: 0, z: 0, r: 80, h: -4 }] },
    segments: [str(150, 'Start Straight', [], 18), turn(90, 20), str(110, 'Dusk Rhythm', [D(12, 1.5, 6.5, 5, 1.3, 8), D(56, 1.6, 6.5, 5, 1.4, 8)]), turn(90, 18), str(120, 'Moon Table', [T(20, 2.0, 9, 9, 10)]), turn(-90, 18), str(90, 'Shadow Whoops', [WH(12, 10, 4.6, 0.5)]), turn(90, 20), str(140, 'Starlight Triple', [TR(32, 2.0, 8.5, 8, 1.8, 10)]), turn(90, 20), str(90, 'Valley Bend', [RO(14, 3, 11, 0.8)]), turn(90, 20)] },

  // ---- figure 8: the start lane runs straight under the middle of a big gap jump on the other lane
  { id: 'crossover', name: 'Crossover 8', difficulty: 'Medium', recommend: ['Dirt Bikes', 'Quads', 'Side-by-Sides'], seed: 9201, defaultWidth: 14,
    desc: 'A giant figure 8. Where the lanes cross, one lane jumps clean over the other - look up as riders fly over your head.',
    look: { dirt: [1.02, 0.84, 0.68], grass: [0.85, 1.05, 0.75], trees: 0.8, pines: 0.3, rocks: 0.4 },
    terrain: { hills: 1.2, hillScale: 220, rim: 30, bumps: [] },
    cross: { under: 0, over: 2, gap: 21, h: 2.6, h2: 2.4, face: 9, land: 10 },
    segments: [str(120, 'Underpass Straight', [], 20), turn(270, 60, 0.7), str(120, 'Crossover Jump'), turn(-270, 60, 0.7)] },

  // ---- big maps for quads and side-by-sides: wide, long, flowing
  { id: 'outback', name: 'Outback Station', difficulty: 'Medium', recommend: ['Side-by-Sides', 'Quads'], seed: 9211, defaultWidth: 20,
    desc: 'A huge red-dirt cattle station. Miles of wide trail, sweeping turns, big rollers and long tables - built for four wheels.',
    look: { dirt: [1.3, 0.8, 0.6], grass: [1.15, 1.0, 0.65], trees: 0.35, pines: 0.02, rocks: 1.6, fog: 0xebc9a6, skyTop: 0x3d84d6, horizon: 0xf2d6b8 },
    terrain: { hills: 9, hillScale: 260, rim: 40, bumps: [{ x: 120, z: -80, r: 200, h: 10 }] },
    segments: [str(240, 'Station Straight', [], 26), turn(70, 60, 0.4), str(260, 'Cattle Rollers', [RO(30, 5, 18, 1.2), T(150, 1.8, 12, 12, 14)]), turn(110, 55, 0.5), str(220, 'Dry Creek', [WH(20, 10, 7, 0.6), D(120, 2.0, 11, 9, 1.8, 13)]), turn(-50, 70, 0.3), str(200, 'Windmill Run', [T(40, 2.2, 13, 14, 15)]), turn(120, 55, 0.5), str(260, 'Red Ridge', [RO(20, 4, 20, 1.3), T(150, 2.0, 12, 13, 14)]), turn(110, 60, 0.4), str(180, 'Homestead Bend', [D(30, 1.9, 11, 8, 1.7, 12)]), turn(-90, 50, 0.5), str(160, 'Dingo Gap', [D(30, 2.2, 12, 10, 2.0, 14)]), turn(90, 55, 0.5)] },
  { id: 'timber', name: 'Timberline Trail', difficulty: 'Medium', recommend: ['Side-by-Sides', 'Quads'], seed: 9222, defaultWidth: 18,
    desc: 'A long forest trail through tall pines: logging-road straights, root whoops and big woodland tables.',
    look: { dirt: [0.78, 0.66, 0.52], grass: [0.75, 0.95, 0.68], trees: 2.6, pines: 2.2, rocks: 1.0, fog: 0xa9bba8, skyTop: 0x4f7aa8, horizon: 0xc7d3c4 },
    terrain: { hills: 14, hillScale: 230, rim: 50, bumps: [{ x: -100, z: 60, r: 180, h: 14 }] },
    segments: [str(220, 'Logging Road', [], 24), turn(90, 50, 0.5), str(220, 'Root Whoops', [WH(24, 12, 6.5, 0.6), T(140, 1.9, 11, 11, 13)]), turn(-60, 60, 0.4), str(200, 'Pine Tables', [T(24, 2.0, 12, 12, 14), T(110, 2.2, 12, 13, 14)]), turn(120, 50, 0.5), str(240, 'Sawmill Rollers', [RO(24, 5, 17, 1.2), D(150, 2.0, 11, 9, 1.8, 13)]), turn(90, 55, 0.5), str(180, 'Creek Crossing', [D(30, 2.1, 12, 10, 1.9, 14)]), turn(-20, 60, 0.4), str(200, 'Ranger Run', [T(40, 2.1, 12, 12, 14)]), turn(140, 50, 0.5)] },
  { id: 'glacier', name: 'Glacier Basin', difficulty: 'Hard', recommend: ['Quads', 'Side-by-Sides'], seed: 9233, defaultWidth: 18,
    desc: 'A frozen mountain basin: snowy berms, icy rollers and huge tables with the peaks all around you.',
    look: { snow: 0.7, dirt: [0.85, 0.85, 0.9], grass: [0.9, 0.95, 1.05], trees: 0.6, pines: 1.4, rocks: 2.4, fog: 0xdfe9f2, skyTop: 0x3566b0, horizon: 0xe6eef6 },
    terrain: { hills: 12, hillScale: 220, rim: 70, bumps: [{ x: 80, z: 80, r: 170, h: 16 }] },
    segments: [str(220, 'Basin Straight', [], 24), turn(100, 55, 0.5), str(220, 'Ice Rollers', [RO(24, 5, 16, 1.2), T(130, 2.2, 12, 12, 14)]), turn(80, 50, 0.5), str(200, 'Crevasse Gap', [D(30, 2.3, 12, 10, 2.1, 14)]), turn(-60, 60, 0.4), str(220, 'Moraine Whoops', [WH(24, 12, 6.5, 0.65), T(140, 2.0, 11, 11, 13)]), turn(130, 50, 0.5), str(200, 'Avalanche Table', [T(30, 2.4, 13, 14, 15)]), turn(60, 55, 0.5), str(160, 'Summit Bend', [RO(20, 3, 16, 1.1)]), turn(50, 50, 0.5)] },
  { id: 'sunset', name: 'Sunset Dunes Ranch', difficulty: 'Easy', recommend: ['Side-by-Sides', 'Quads', 'Dirt Bikes'], seed: 9244, defaultWidth: 20,
    desc: 'Open ranch land at golden hour. Wide, smooth and fast with big friendly tables - a cruising map for everyone.',
    look: { sand: 0.4, dirt: [1.2, 0.95, 0.72], grass: [1.2, 1.0, 0.65], trees: 0.5, pines: 0.05, rocks: 0.6, fog: 0xf0c8a0, skyTop: 0x4a6fb0, horizon: 0xf6b98a },
    terrain: { hills: 7, hillScale: 240, rim: 34, bumps: [] },
    segments: [str(240, 'Ranch Straight', [], 26), turn(90, 60, 0.4), str(240, 'Golden Tables', [T(30, 1.6, 10, 10, 12), T(130, 1.8, 11, 11, 13)]), turn(90, 58, 0.4), str(220, 'Sage Rollers', [RO(24, 5, 18, 1.0)]), turn(-60, 70, 0.3), str(200, 'Corral Double', [D(30, 1.8, 10, 8, 1.6, 12)]), turn(150, 55, 0.5), str(220, 'Canyon Mouth', [T(40, 2.0, 11, 12, 13)]), turn(90, 60, 0.4)] },

  // ---- race tracks: proper motocross circuits with lots of corners and rhythm
  { id: 'thunder', name: 'Thunder Raceway', difficulty: 'Medium', recommend: ['Dirt Bikes', 'Quads'], seed: 9255, defaultWidth: 14,
    desc: 'A pro motocross race circuit: holeshot straight, tight berms, rhythm sections and a big finish-line table.',
    look: { dirt: [0.95, 0.8, 0.66], grass: [0.82, 1.02, 0.74], trees: 0.7, pines: 0.3, rocks: 0.3 },
    terrain: { hills: 4, hillScale: 200, rim: 30, bumps: [] },
    segments: [str(170, 'Holeshot', [], 22), turn(90, 22), str(120, 'Rhythm One', [D(12, 1.6, 6.5, 5, 1.4, 8), RO(64, 3, 11, 0.9)]), turn(120, 18), str(80, 'Step Up', [ST(18, 1.5, 6.5, 6, 2.4, 8, 10)]), turn(-60, 18), str(100, 'Whoop Lane', [WH(14, 12, 4.6, 0.5)]), turn(120, 18), str(110, 'Triple', [TR(24, 2.0, 8.5, 8, 1.8, 10)]), turn(90, 20), str(90, 'Rollers', [RO(12, 4, 11, 0.9)]), turn(-60, 20), str(120, 'Finish Table', [T(28, 2.0, 9, 9, 10)]), turn(60, 22)] },
  { id: 'riverside', name: 'Riverside MX', difficulty: 'Easy', recommend: ['Dirt Bikes', 'Quads'], seed: 9266, defaultWidth: 13,
    desc: 'A grassy race track by the river: flowing berms, small doubles and a fun step-down. Great for racing friends.',
    look: { dirt: [0.88, 0.72, 0.58], grass: [0.78, 1.1, 0.72], trees: 1.8, pines: 0.2, rocks: 0.3, fog: 0xc7d8cc, skyTop: 0x4a85cc, horizon: 0xcfe1e6 },
    terrain: { hills: 5, hillScale: 180, rim: 30, bumps: [{ x: -60, z: 0, r: 80, h: -3 }] },
    segments: [str(150, 'Start Straight', [], 20), turn(90, 20), str(100, 'River Double', [D(16, 1.4, 6, 4.5, 1.2, 7)]), turn(90, 18), str(90, 'Bank Rollers', [RO(12, 4, 10, 0.8)]), turn(-45, 16), str(100, 'Willow Table', [T(18, 1.5, 7, 6, 8)]), turn(135, 18), str(80, 'Boat Ramp', [D(12, 1.5, 6.5, 5, 1.3, 7)]), turn(-45, 18), str(110, 'Meadow Whoops', [WH(12, 10, 4.4, 0.45)]), turn(135, 20)] },
  { id: 'dustbowl', name: 'Dust Bowl Speedway', difficulty: 'Medium', recommend: ['Side-by-Sides', 'Quads'], seed: 9277, defaultWidth: 18,
    desc: 'A side-by-side race track: wide banked corners, big rollers and long straights for drafting and passing.',
    look: { dirt: [1.15, 0.95, 0.72], grass: [1.08, 1.0, 0.7], trees: 0.2, pines: 0.05, rocks: 0.8, fog: 0xe5cfae, skyTop: 0x4b88d0, horizon: 0xeedcc0 },
    terrain: { hills: 3, hillScale: 220, rim: 30, bumps: [] },
    segments: [str(220, 'Front Straight', [], 24), turn(90, 36, 1.1), str(110, 'Dust Table', [T(24, 2.0, 12, 12, 13)]), turn(90, 36, 1.1), str(220, 'Back Rollers', [RO(24, 5, 16, 1.1), T(140, 1.8, 11, 11, 12)]), turn(90, 36, 1.1), str(110, 'Short Chute', [D(24, 1.8, 10, 8, 1.6, 11)]), turn(90, 36, 1.1)] },
];

// Figure 8: find where the 'over' straight crosses the 'under' straight and put a double there
// whose flat gap (ground level) is centred on the crossing - the other lane runs through the gap.
function placeCrossJump(def, c) {
  const T = buildTrack(def);
  const segS = (idx) => { const sec = T.sections.filter((x) => x.name === def.segments[idx].name)[0]; return sec; };
  const over = segS(c.over), under = segS(c.under);
  let best = null;
  for (let a = over.s0; a < over.s1; a += 0.25) {
    const ia = Math.round(a / T.step) % T.n;
    for (let b = under.s0; b < under.s1; b += 0.5) {
      const ib = Math.round(b / T.step) % T.n;
      const d = Math.hypot(T.xs[ia] - T.xs[ib], T.zs[ia] - T.zs[ib]);
      if (!best || d < best.d) best = { d, a, b };
    }
  }
  if (!best || best.d > 1.5) throw new Error(def.id + ': the lanes do not cross');
  // double: face, 0.7 lip, backside max(2.4, 1.5h) down to the ground, then the flat gap
  const toGap = c.face + 0.7 + Math.max(2.4, c.h * 1.5);
  const at = Math.round((best.a - over.s0) - toGap - c.gap / 2);
  def.segments[c.over] = { ...def.segments[c.over], features: [{ at, type: 'double', h: c.h, face: c.face, gap: c.gap, h2: c.h2, land: c.land }] };
  def.crossAt = { s: Math.round(best.a), under: Math.round(best.b) };
  console.log(`${def.name}: lanes cross at s=${best.a.toFixed(1)} (over) / ${best.b.toFixed(1)} (under); gap jump placed at ${at} m`);
}

function evaluate(def) {
  const warns = [];
  const ow = console.warn, ol = console.log;
  console.warn = (m) => warns.push(String(m)); console.log = (m) => { if (/runs|past|overlap/i.test(String(m))) warns.push(String(m)); };
  let T;
  try { T = buildTrack(def); } catch (e) { warns.push(String(e)); }
  console.warn = ow; console.log = ol;
  if (!T) return null;
  let minSep = 1e9, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < T.n; i += 3) {
    x0 = Math.min(x0, T.xs[i]); x1 = Math.max(x1, T.xs[i]); z0 = Math.min(z0, T.zs[i]); z1 = Math.max(z1, T.zs[i]);
    for (let j = i + 3; j < T.n; j += 3) {
      const ds = Math.min(j - i, T.n - (j - i)) * T.step;
      if (ds < 70) continue;
      minSep = Math.min(minSep, Math.hypot(T.xs[i] - T.xs[j], T.zs[i] - T.zs[j]));
    }
  }
  const lens = T.sections ? T.sections.map((s) => s.s1 - s.s0) : [];
  return { T, warns, minSep, bounds: [x0, x1, z0, z1], minLen: Math.min(...lens) };
}

const out = [];
for (const m of MAPS) {
  const idxs = m.segments.map((s, i) => (s.len ? i : -1)).filter((i) => i >= 0);
  let best = null;
  for (let a = 0; a < idxs.length; a++) for (let b = a + 1; b < idxs.length; b++) {
    const def = { ...m, worldSize: 2000, start: { x: 0, z: 0, heading: 0 }, gateAt: 14, finishAt: 100, terrain: { ...m.terrain, rimStart: 900 } };
    def.segments = m.segments.map((s, i) => (s.len ? { ...s, free: i === idxs[a] || i === idxs[b] } : s));
    const r = evaluate(def);
    if (!r || r.warns.length || r.minLen < 30) continue;
    if (!best || m.cross || r.minSep > best.r.minSep) best = { def, r };
  }
  if (!best) { const def = { ...m, worldSize: 2000, start: { x: 0, z: 0, heading: 0 }, gateAt: 14, finishAt: 100, terrain: { ...m.terrain, rimStart: 900 } }; def.segments = m.segments.map((x, i) => (x.len ? { ...x, free: i === idxs[0] || i === idxs[1] } : x)); const r = evaluate(def); console.log('NO LAYOUT for', m.id, r ? JSON.stringify({ warns: r.warns.slice(0, 2), minLen: r.minLen }) : 'build failed'); continue; }
  if (m.cross) placeCrossJump(best.def, m.cross);
  const [x0, x1, z0, z1] = best.r.bounds;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, span = Math.max(x1 - x0, z1 - z0);
  const def = best.def;
  def.start = { x: Math.round(-cx), z: Math.round(-cz), heading: 0 };
  def.worldSize = Math.round(span + 300);
  def.terrain = { ...m.terrain, rimStart: Math.round(span / 2 + 60) };
  const check = evaluate(def);
  console.log(`${m.name}: ${Math.round(check.T.L)} m, min separation ${Math.round(check.minSep)} m, world ${def.worldSize}, warnings ${check.warns.length}`);
  out.push(def);
}
const body = '// Generated by tools/make-maps.mjs - edit the designs there, not here.\nexport const MORE_TRACKS = ' + JSON.stringify(out, null, 1).replace(/"(\w+)":/g, '$1:') + ';\n';
fs.writeFileSync(path.join(ROOT, 'shared/tracksMore.js'), body);
console.log('wrote shared/tracksMore.js with', out.length, 'maps');
