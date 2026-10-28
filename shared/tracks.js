// =====================================================================
//  TRACK LAYOUTS
//  Each track is drawn "turtle style": a list of straights and turns.
//  Two straights are marked `free: true` - the generator stretches or
//  shrinks those two so the loop closes exactly. Change any length or
//  angle here and the whole track (terrain, berms, fences, AI line,
//  checkpoints) rebuilds itself.
//
//  turn:     { turn: degrees (+ = left, - = right), r: radius m, berm: 0..1 }
//  straight: { len: metres, w: track width m (optional), features: [...] }
//
//  Jump features (positions are metres from the start of the straight):
//    table  { h, face, top, land }          tabletop
//    double { h, face, gap, h2, land }      two humps, gap between
//    triple { h, face, gap, h2, land }      three humps, clear them all
//    step   { h, face, gap, h2, top, land } step-up onto a plateau
//    whoops { n, len, h }                   n bumps, len apart
//    rollers{ n, len, h }                   n big soft bumps
//  Add  lane: 'L'  or  lane: 'R'  to put a feature in one half of a split lane.
// =====================================================================

export const TRACKS = [
  {
    id: 'ridgeline', recommend: ['Dirt Bikes', 'Quads'],
    name: 'Ridgeline National', difficulty: 'Medium',
    desc: 'A big outdoor national track carved into rolling hills. Tall berms, a ridge-top triple, a long downhill with big air and a split rhythm lane.',
    worldSize: 700,
    seed: 1207,
    start: { x: -147, z: 171, heading: 0 },
    defaultWidth: 12,
    terrain: {
      hills: 9, hillScale: 170,
      rim: 34, rimStart: 270,
      bumps: [
        { x: 153, z: -89, r: 90, h: 12 },    // the ridge (whoops climb it, triple crosses the top)
        { x: -147, z: -159, r: 80, h: 11 },  // west hill (uphill table, then the long downhill)
        { x: 43, z: 31, r: 70, h: -3 },       // infield dip
      ],
    },
    segments: [
      { len: 160, w: 20, free: true, name: 'Start Straight' },
      { turn: 100, r: 26, berm: 0.9 },
      { len: 85, name: 'Holeshot Table', features: [{ at: 28, type: 'table', h: 1.8, face: 8, top: 8, land: 10 }] },
      { turn: -100, r: 16, berm: 1 },
      { len: 110, name: 'Rhythm One', features: [
        { at: 10, type: 'rollers', n: 1, len: 9, h: 0.8 },
        { at: 25, type: 'double', h: 1.6, face: 6.5, gap: 6, h2: 1.4, land: 9 },
        { at: 62, type: 'rollers', n: 2, len: 9, h: 0.8 },
      ] },
      { turn: 90, r: 20, berm: 1 },
      { len: 120, name: 'Whoops Climb', features: [{ at: 18, type: 'whoops', n: 18, len: 4.6, h: 0.5 }] },
      { turn: 70, r: 30, berm: 0.5 },
      { len: 120, name: 'Ridge Triple', features: [{ at: 36, type: 'triple', h: 2.2, face: 9, gap: 9, h2: 1.9, land: 12 }] },
      { turn: 110, r: 16, berm: 1 },
      { len: 70, name: 'Step-Up', features: [{ at: 18, type: 'step', h: 1.4, face: 6, gap: 4.5, h2: 2.0, top: 9, land: 10 }] },
      { turn: -90, r: 18, berm: 1 },
      { len: 110, w: 22, name: 'Split Lanes', features: [
        { at: 20, type: 'triple', h: 1.8, face: 7.5, gap: 5, h2: 1.6, land: 10, lane: 'L' },
        { at: 20, type: 'rollers', n: 5, len: 10, h: 0.9, lane: 'R' },
      ] },
      { turn: -90, r: 22, berm: 1 },
      { len: 60, name: 'Uphill Table', features: [{ at: 14, type: 'table', h: 1.6, face: 7, top: 6, land: 8 }] },
      { turn: 180, r: 20, berm: 1 },
      { len: 280, free: true, name: 'Big Downhill', features: [
        { at: 20, type: 'rollers', n: 4, len: 16, h: 0.9 },
        { at: 100, type: 'double', h: 2.0, face: 8.5, gap: 10, h2: 1.8, land: 11 },
        { at: 170, type: 'table', h: 2.3, face: 9.5, top: 12, land: 12 },
      ] },
      { turn: 90, r: 25, berm: 0.9 },
    ],
    gateAt: 14,        // metres along the lap where the start gate stands
    finishAt: 115,     // metres along the lap of the finish line
  },
  {
    id: 'quarry', recommend: ['Dirt Bikes'],
    look: { dirt: [0.86, 0.83, 0.8], grass: [0.82, 0.88, 0.7], trees: 0.25, pines: 0.2, rocks: 3.2, fog: 0xd2cdc4, skyTop: 0x4f7fb8, horizon: 0xdcd6cc },
    name: 'Quarry Arenacross', difficulty: 'Expert',
    desc: 'Tight, technical and fast on the floor of an old stone quarry. Hairpin switchbacks, rhythm after rhythm and a long wall-side straight.',
    worldSize: 460,
    seed: 4471,
    start: { x: -102, z: -66, heading: 0 },
    defaultWidth: 11,
    terrain: {
      hills: 1.2, hillScale: 60,
      rim: 40, rimStart: 175, rimSharp: true,
      bumps: [{ x: 63, z: -126, r: 70, h: 5 }],
    },
    segments: [
      { len: 140, w: 18, name: 'Start Straight' },
      { turn: -180, r: 16, berm: 1 },
      { len: 90, name: 'Quarry Rhythm', features: [
        { at: 10, type: 'double', h: 1.4, face: 6, gap: 5, h2: 1.2, land: 7 },
        { at: 45, type: 'table', h: 1.5, face: 6.5, top: 6, land: 8 },
      ] },
      { turn: 180, r: 14, berm: 1 },
      { len: 100, name: 'Back Whoops', features: [{ at: 14, type: 'whoops', n: 15, len: 4.4, h: 0.5 }] },
      { turn: -180, r: 15, berm: 1 },
      { len: 100, name: 'Big Triple', features: [{ at: 24, type: 'triple', h: 2.0, face: 8.5, gap: 8, h2: 1.8, land: 11 }] },
      { turn: 90, r: 14, berm: 1 },
      { len: 60, name: 'Step Rhythm', features: [
        { at: 4, type: 'rollers', n: 2, len: 8, h: 0.7 },
        { at: 25, type: 'double', h: 1.3, face: 5.5, gap: 4.5, h2: 1.1, land: 7 },
      ] },
      { turn: 90, r: 16, berm: 1 },
      { len: 150, name: 'Quarry Straight', features: [
        { at: 20, type: 'step', h: 1.5, face: 6.5, gap: 6, h2: 2.4, top: 8, land: 10 },
        { at: 72, type: 'rollers', n: 3, len: 10, h: 0.9 },
        { at: 112, type: 'table', h: 1.6, face: 7, top: 6, land: 9 },
      ] },
      { turn: 90, r: 16, berm: 1 },
      { len: 200, free: true, name: 'Wall Ride', features: [
        { at: 20, type: 'double', h: 1.8, face: 7.5, gap: 7, h2: 1.6, land: 9 },
        { at: 66, type: 'whoops', n: 12, len: 4.6, h: 0.5 },
        { at: 140, type: 'table', h: 2.2, face: 9, top: 10, land: 11 },
      ] },
      { turn: 90, r: 18, berm: 1 },
      { len: 210, free: true, name: 'Top Straight', features: [
        { at: 14, type: 'rollers', n: 3, len: 10, h: 0.9 },
        { at: 66, type: 'triple', h: 2.0, face: 8.5, gap: 7, h2: 1.8, land: 10 },
        { at: 135, type: 'table', h: 1.7, face: 7.5, top: 8, land: 9 },
      ] },
      { turn: 90, r: 16, berm: 1 },
      { len: 16, name: 'Back Chute' },
      { turn: 90, r: 16, berm: 1 },
    ],
    gateAt: 14,
    finishAt: 100,
  },
  {
    id: 'canyon', recommend: ['Dirt Bikes', 'Quads', 'Side-by-Sides'],
    name: 'Canyon Creek', difficulty: 'Hard',
    desc: 'Red dirt on a desert canyon floor. A massive canyon gap, deep sand whoops and long, fast mesa straights.',
    worldSize: 760,
    seed: 9083,
    start: { x: -136, z: 158, heading: 0 },
    defaultWidth: 13,
    look: { dirt: [1.18, 0.86, 0.68], grass: [1.18, 1.05, 0.62], trees: 0.18, pines: 0.2, rocks: 3, fog: 0xe8d6bf, skyTop: 0x4a86c8, horizon: 0xf1dfc4 },
    terrain: {
      hills: 12, hillScale: 210,
      rim: 70, rimStart: 300, rimSharp: true,
      bumps: [{ x: 134, z: -122, r: 90, h: 10 }, { x: -156, z: -72, r: 70, h: -5 }],
    },
    segments: [
      { len: 160, w: 20, free: true, name: 'Start Straight' },
      { turn: 95, r: 28, berm: 0.9 },
      { len: 130, name: 'Canyon Gap', features: [{ at: 36, type: 'double', h: 2.4, face: 10, gap: 12, h2: 2.1, land: 12 }] },
      { turn: 85, r: 20, berm: 1 },
      { len: 150, name: 'Sand Whoops', features: [{ at: 20, type: 'whoops', n: 22, len: 5, h: 0.42 }] },
      { turn: -100, r: 16, berm: 1 },
      { len: 95, name: 'Mesa Step', features: [{ at: 20, type: 'step', h: 1.6, face: 7, gap: 6, h2: 2.6, top: 10, land: 10 }] },
      { turn: 110, r: 18, berm: 1 },
      { len: 125, name: 'Red Rock Rhythm', features: [
        { at: 6, type: 'rollers', n: 2, len: 9, h: 0.8 },
        { at: 30, type: 'double', h: 1.6, face: 6.5, gap: 6, h2: 1.4, land: 8 },
        { at: 76, type: 'table', h: 1.7, face: 7.5, top: 7, land: 9 },
      ] },
      { turn: 80, r: 22, berm: 0.8 },
      { len: 270, free: true, name: 'Long Mesa', features: [
        { at: 40, type: 'table', h: 2.4, face: 10, top: 14, land: 12 },
        { at: 125, type: 'triple', h: 2.1, face: 9, gap: 9, h2: 1.9, land: 11 },
        { at: 205, type: 'rollers', n: 3, len: 14, h: 1.0 },
      ] },
      { turn: 90, r: 26, berm: 0.9 },
    ],
    gateAt: 14,
    finishAt: 110,
  },
  {
    id: 'pine', recommend: ['Dirt Bikes', 'Quads'],
    name: 'Pine Hollow', difficulty: 'Medium',
    desc: 'A tight, hilly track cut through a pine forest. Rollers, rhythm and off-camber corners - flow is everything.',
    worldSize: 640,
    seed: 3361,
    start: { x: -81, z: 102, heading: 0 },
    defaultWidth: 11,
    look: { dirt: [0.78, 0.72, 0.68], grass: [0.78, 1.0, 0.78], trees: 2.2, pines: 0.9, rocks: 0.8, fog: 0xb9c9c4, skyTop: 0x3c6fae, horizon: 0xc8d6d6 },
    terrain: {
      hills: 13, hillScale: 120,
      rim: 40, rimStart: 240,
      bumps: [{ x: -1, z: -18, r: 80, h: 9 }],
    },
    segments: [
      { len: 120, w: 18, free: true, name: 'Start Straight' },
      { turn: 90, r: 20, berm: 1 },
      { len: 90, name: 'Root Rollers', features: [{ at: 10, type: 'rollers', n: 5, len: 10, h: 0.9 }] },
      { turn: 180, r: 15, berm: 1 },
      { len: 60, name: 'Hollow Double', features: [{ at: 10, type: 'double', h: 1.6, face: 6.5, gap: 5, h2: 1.4, land: 8 }] },
      { turn: -180, r: 15, berm: 1 },
      { len: 140, name: 'Ridge Climb', features: [
        { at: 12, type: 'table', h: 1.6, face: 7, top: 6, land: 8 },
        { at: 55, type: 'step', h: 1.5, face: 6.5, gap: 6, h2: 2.4, top: 8, land: 10 },
      ] },
      { turn: 90, r: 18, berm: 0.4 },
      { len: 110, name: 'Pine Whoops', features: [{ at: 15, type: 'whoops', n: 14, len: 4.6, h: 0.5 }] },
      { turn: 90, r: 18, berm: 1 },
      { len: 155, free: true, name: 'Forest Triple', features: [
        { at: 35, type: 'triple', h: 2.0, face: 8.5, gap: 8, h2: 1.8, land: 10 },
        { at: 100, type: 'rollers', n: 3, len: 12, h: 0.9 },
      ] },
      { turn: 90, r: 20, berm: 0.9 },
    ],
    gateAt: 14,
    finishAt: 95,
  },
  {
    id: 'practice', recommend: ['Dirt Bikes', 'Quads', 'Side-by-Sides', 'Buggies'],
    name: 'Practice Ground', difficulty: 'Easy',
    desc: 'A wide, forgiving loop to learn on: small tables, then medium, then big ones, plus friendly rollers and berms.',
    worldSize: 560,
    seed: 5150,
    start: { x: -110, z: 110, heading: 0 },
    defaultWidth: 16,
    look: { dirt: [1.05, 0.95, 0.85], grass: [0.95, 1.08, 0.9], trees: 0.8, pines: 0.3, rocks: 0.6 },
    terrain: {
      hills: 5, hillScale: 170,
      rim: 28, rimStart: 225,
      bumps: [{ x: 0, z: -20, r: 60, h: -2 }],
    },
    segments: [
      { len: 140, w: 20, free: true, name: 'Start Straight' },
      { turn: 90, r: 30, berm: 0.6 },
      { len: 160, name: 'Small Tables', features: [
        { at: 20, type: 'table', h: 1.0, face: 5, top: 4, land: 6 },
        { at: 58, type: 'table', h: 1.3, face: 6, top: 5, land: 7 },
        { at: 102, type: 'table', h: 1.6, face: 7, top: 6, land: 8 },
      ] },
      { turn: 90, r: 24, berm: 1 },
      { len: 120, free: true, name: 'Berms & Rollers', features: [{ at: 15, type: 'rollers', n: 4, len: 12, h: 0.7 }] },
      { turn: 90, r: 18, berm: 1 },
      { len: 160, name: 'Big Tables', features: [
        { at: 18, type: 'table', h: 1.9, face: 8, top: 8, land: 9 },
        { at: 66, type: 'double', h: 1.7, face: 7, gap: 6, h2: 1.5, land: 9 },
        { at: 112, type: 'table', h: 2.2, face: 9, top: 10, land: 10 },
      ] },
      { turn: 90, r: 24, berm: 0.8 },
    ],
    gateAt: 14,
    finishAt: 100,
  },
  {
    id: 'frostbite', recommend: ['Dirt Bikes', 'Quads'],
    name: 'Frostbite MX', difficulty: 'Medium',
    desc: 'A winter national cut through snowy hills. Icy rhythm, a pine-ridge triple and an avalanche step-up.',
    worldSize: 680,
    seed: 7311,
    start: { x: -150, z: 160, heading: 0 },
    defaultWidth: 12,
    look: { dirt: [0.72, 0.62, 0.56], grass: [0.9, 1.0, 0.95], snow: 0.9, trees: 1.5, pines: 1, rocks: 0.7, fog: 0xdfe6ee, skyTop: 0x8aa4c4, horizon: 0xe8eef4 },
    terrain: {
      hills: 12, hillScale: 160,
      rim: 45, rimStart: 260,
      bumps: [{ x: 60, z: -120, r: 90, h: 12 }, { x: -170, z: -40, r: 60, h: 6 }],
    },
    segments: [
      { len: 150, w: 20, name: 'Start Straight' },
      { turn: 120, r: 24, berm: 1 },
      { len: 90, name: 'Frost Table', features: [{ at: 22, type: 'table', h: 1.8, face: 8, top: 8, land: 10 }] },
      { turn: -120, r: 16, berm: 1 },
      { len: 115, name: 'Ice Rhythm', features: [
        { at: 8, type: 'rollers', n: 2, len: 9, h: 0.8 },
        { at: 36, type: 'double', h: 1.6, face: 6.5, gap: 6, h2: 1.4, land: 9 },
      ] },
      { turn: 90, r: 20, berm: 1 },
      { len: 115, name: 'Glacier Whoops', features: [{ at: 15, type: 'whoops', n: 16, len: 4.6, h: 0.45 }] },
      { turn: 90, r: 18, berm: 1 },
      { len: 140, free: true, name: 'Pine Ridge Triple', features: [{ at: 32, type: 'triple', h: 2.1, face: 9, gap: 8, h2: 1.8, land: 11 }] },
      { turn: 90, r: 22, berm: 1 },
      { len: 110, name: 'Avalanche Step', features: [{ at: 20, type: 'step', h: 1.5, face: 6.5, gap: 6, h2: 2.4, top: 9, land: 10 }] },
      { turn: 60, r: 30, berm: 0.5 },
      { len: 75, name: 'Snowdrift Double', features: [{ at: 14, type: 'double', h: 1.6, face: 7, gap: 6, h2: 1.4, land: 9 }] },
      { turn: -60, r: 30, berm: 0.5 },
      { turn: 90, r: 24, berm: 0.9 },
    ],
    gateAt: 14,
    finishAt: 110,
  },
  {
    id: 'freestyle', recommend: ['Dirt Bikes', 'Quads'],
    name: 'Freestyle Compound', difficulty: 'Freestyle',
    desc: 'A wide arena built for tricks: freestyle kickers with open gaps up to 20 m, a huge table and room to land anything.',
    worldSize: 600,
    seed: 2219,
    start: { x: -120, z: 60, heading: 0 },
    defaultWidth: 24,
    look: { dirt: [1.1, 0.88, 0.7], grass: [1.05, 1.02, 0.78], trees: 0.4, pines: 0.4, rocks: 1.2 },
    terrain: {
      hills: 3, hillScale: 150,
      rim: 34, rimStart: 230,
      bumps: [],
    },
    segments: [
      { len: 240, w: 24, free: true, name: 'Kicker Row', features: [
        { at: 40, type: 'kicker', h: 2.4, face: 8.5, gap: 8, landH: 3.0, land: 14 },
        { at: 108, type: 'kicker', h: 3.0, face: 10.5, gap: 12, landH: 3.5, land: 16 },
        { at: 172, type: 'kicker', h: 3.5, face: 12, gap: 16, landH: 4.2, land: 18 },
      ] },
      { turn: 180, r: 34, berm: 0.5 },
      { len: 240, w: 24, free: true, name: 'Big Air', features: [
        { at: 26, type: 'table', h: 3.0, face: 12, top: 14, land: 16 },
        { at: 105, type: 'kicker', h: 4.0, face: 13.5, gap: 20, landH: 4.5, land: 20 },
        { at: 196, type: 'rollers', n: 2, len: 14, h: 1.2 },
      ] },
      { turn: 180, r: 34, berm: 0.5 },
    ],
    gateAt: 14,
    finishAt: 60,
    freestyle: true,
  },
];

// easiest first (used by the menus)
TRACKS.push(...[
  {
    id: 'dunes', recommend: ['Buggies', 'Side-by-Sides'],
    name: 'Sandstorm Dunes', difficulty: 'Medium',
    desc: 'Wide, fast desert loop over rolling dunes. Huge tabletops and long sand rollers - made for buggies and side-by-sides.',
    worldSize: 980,
    seed: 8123,
    start: { x: -199, z: 154, heading: 0 },
    defaultWidth: 22,
    look: { sand: 1, dirt: [1.3, 1.08, 0.8], grass: [1.42, 1.2, 0.78], trees: 0.04, pines: 0, rocks: 1.4, fog: 0xf0dcb0, skyTop: 0x5a8fd0, horizon: 0xf5e3c0 },
    terrain: { hills: 7, hillScale: 230, rim: 55, rimStart: 380, bumps: [{ x: 120, z: -150, r: 140, h: 10 }] },
    segments: [
      { len: 220, w: 26, free: true, name: 'Start Straight' },
      { turn: 90, r: 45, berm: 0.5 },
      { len: 200, name: 'Dune Tables', features: [
        { at: 30, type: 'table', h: 2.2, face: 14, top: 14, land: 16 },
        { at: 110, type: 'table', h: 2.6, face: 15, top: 16, land: 18 },
      ] },
      { turn: 120, r: 40, berm: 0.6 },
      { len: 160, name: 'Whoop Valley', features: [{ at: 20, type: 'whoops', n: 10, len: 7, h: 0.8 }] },
      { turn: -60, r: 50, berm: 0.3 },
      { len: 230, name: 'Big Air Dune', features: [
        { at: 40, type: 'table', h: 3.0, face: 16, top: 18, land: 20 },
        { at: 135, type: 'double', h: 2.4, face: 14, gap: 10, h2: 2.0, land: 16 },
      ] },
      { turn: 120, r: 42, berm: 0.6 },
      { len: 130, free: true, name: 'Sand Rollers', features: [{ at: 15, type: 'rollers', n: 3, len: 18, h: 1.2 }] },
      { turn: 90, r: 45, berm: 0.5 },
    ],
    gateAt: 16,
    finishAt: 140,
  },
  {
    id: 'mud', recommend: ['Quads', 'Dirt Bikes'],
    name: 'Mudhole Woods', difficulty: 'Hard',
    desc: 'Dark, wet and tight. Rutted mud through thick woods with log rollers, a swamp double and bog whoops.',
    worldSize: 600,
    seed: 4417,
    start: { x: -95, z: 81, heading: 0 },
    defaultWidth: 10,
    look: { dirt: [0.56, 0.45, 0.38], grass: [0.62, 0.86, 0.55], trees: 2.8, pines: 0.35, rocks: 1.0, fog: 0x9aa79a, skyTop: 0x5f7487, horizon: 0xa9b5ad },
    terrain: { hills: 9, hillScale: 110, rim: 38, rimStart: 220, bumps: [{ x: 20, z: 10, r: 60, h: -3 }] },
    segments: [
      { len: 110, w: 16, name: 'Start Straight' },
      { turn: 90, r: 16, berm: 1 },
      { len: 80, free: true, name: 'Log Rollers', features: [{ at: 10, type: 'rollers', n: 4, len: 9, h: 0.8 }] },
      { turn: -90, r: 14, berm: 1 },
      { len: 70, name: 'Swamp Double', features: [{ at: 14, type: 'double', h: 1.5, face: 6, gap: 5, h2: 1.3, land: 8 }] },
      { turn: 180, r: 16, berm: 1 },
      { len: 100, free: true, name: 'Bog Whoops', features: [{ at: 12, type: 'whoops', n: 12, len: 4.4, h: 0.55 }] },
      { turn: 90, r: 16, berm: 1 },
      { len: 130, name: 'Root Rhythm', features: [
        { at: 14, type: 'table', h: 1.4, face: 6, top: 5, land: 7 },
        { at: 62, type: 'double', h: 1.6, face: 6.5, gap: 5, h2: 1.4, land: 8 },
      ] },
      { turn: 90, r: 18, berm: 1 },
    ],
    gateAt: 14,
    finishAt: 90,
  },
  {
    id: 'stadium', recommend: ['Dirt Bikes'],
    name: 'Sunset Supercross', difficulty: 'Expert',
    desc: 'A stadium-style supercross under an orange sky: tight 180s, rhythm lanes, a triple and a whoop lane.',
    worldSize: 420,
    seed: 6060,
    start: { x: -68, z: 52, heading: 0 },
    defaultWidth: 10,
    look: { dirt: [0.98, 0.8, 0.68], grass: [0.78, 0.86, 0.6], trees: 0.25, pines: 0.1, rocks: 0.3, fog: 0xe9a46a, skyTop: 0x2c3e7a, horizon: 0xf2a65a },
    terrain: { hills: 2, hillScale: 160, rim: 30, rimStart: 160, bumps: [] },
    segments: [
      { len: 95, w: 14, free: true, name: 'Start Straight' },
      { turn: 180, r: 15, berm: 1 },
      { len: 95, name: 'Rhythm Lane', features: [
        { at: 8, type: 'double', h: 1.5, face: 6, gap: 4.5, h2: 1.3, land: 7 },
        { at: 48, type: 'double', h: 1.5, face: 6, gap: 4.5, h2: 1.3, land: 7 },
      ] },
      { turn: -180, r: 15, berm: 1 },
      { len: 95, name: 'Triple Lane', features: [{ at: 30, type: 'triple', h: 1.7, face: 7.5, gap: 6, h2: 1.5, land: 9 }] },
      { turn: 90, r: 15, berm: 1 },
      { len: 26, name: 'Stadium Corner' },
      { turn: 90, r: 15, berm: 1 },
      { len: 140, name: 'Whoop Lane', features: [{ at: 30, type: 'whoops', n: 14, len: 4.2, h: 0.6 }] },
      { turn: 90, r: 15, berm: 1 },
      { len: 90, free: true, name: 'Back Straight', features: [{ at: 18, type: 'table', h: 1.6, face: 7, top: 6, land: 8 }] },
      { turn: 90, r: 15, berm: 1 },
    ],
    gateAt: 14,
    finishAt: 80,
  },
]);

export const DIFFICULTY_ORDER = ['Easy', 'Medium', 'Hard', 'Expert', 'Freestyle'];
TRACKS.sort((a, b) => DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty));

export function getTrack(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
