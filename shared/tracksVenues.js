// =====================================================================
//  VENUE TRACKS: places that are not just another dirt field. Each one
//  has look.venue, which the renderer (light, sky) and scenery (buildings)
//  turn into its own world:
//   arena - indoors: walls, steel roof, rows of lights, grandstands
//   night - a floodlit stadium under the stars
//   moon  - a moon base: grey dust, craters, black sky, low gravity
//   yard  - a construction yard: container stacks, tower cranes, barriers
//  look.floor is the plain ground colour off the track (no grass).
//  gravity (moon) scales the pull for every rider on the track.
// =====================================================================
export const VENUE_TRACKS = [
  {
    id: 'dome', recommend: ['Dirt Bikes', 'Quads'],
    name: 'Steel Dome Arenacross', difficulty: 'Hard',
    desc: 'Indoors under the lights: a packed-dirt arenacross inside a steel dome. Tight 180s, rhythm doubles, a triple and a long whoop lane.',
    worldSize: 300,
    seed: 7101,
    start: { x: -47, z: 49, heading: 0 },
    defaultWidth: 9,
    look: { venue: 'arena', dirt: [0.78, 0.62, 0.5], floor: [0.2, 0.2, 0.22], trees: 0, rocks: 0, fog: 0x1b1d22, skyTop: 0x101216, horizon: 0x1b1d22 },
    terrain: { hills: 0, hillScale: 100, rim: 0, rimStart: 140, bumps: [] },
    segments: [
      { len: 70, w: 12, free: true, name: 'Start Straight' },
      { turn: 180, r: 13, berm: 1 },
      { len: 62, name: 'Rhythm Section', features: [
        { at: 6, keep: true, type: 'double', h: 1.4, face: 5.5, gap: 4, h2: 1.2, land: 6 },
        { at: 32, keep: true, type: 'double', h: 1.4, face: 5.5, gap: 4, h2: 1.2, land: 6 },
      ] },
      { turn: -180, r: 13, berm: 1 },
      { len: 62, name: 'Triple Lane', features: [{ at: 16, type: 'triple', h: 1.6, face: 7, gap: 5.5, h2: 1.4, land: 8 }] },
      { turn: 90, r: 13, berm: 1 },
      { len: 22, name: 'Tunnel Corner' },
      { turn: 90, r: 13, berm: 1 },
      { len: 96, name: 'Whoop Lane', features: [{ at: 16, type: 'whoops', n: 13, len: 4, h: 0.55 }] },
      { turn: 90, r: 13, berm: 1 },
      { len: 60, free: true, name: 'Finish Straight', features: [{ at: 14, type: 'table', h: 1.5, face: 6.5, top: 5, land: 7 }] },
      { turn: 90, r: 13, berm: 1 },
    ],
    gateAt: 12,
    finishAt: 60,
  },
  {
    id: 'midnight', recommend: ['Dirt Bikes', 'Quads', 'Side-by-Sides'],
    name: 'Midnight Lights', difficulty: 'Medium',
    desc: 'A fast, flowing night race under floodlight towers and a sky full of stars: long sweepers, lit-up tables and a triple on the back straight.',
    worldSize: 560,
    seed: 7202,
    start: { x: -122, z: 111, heading: 0 },
    defaultWidth: 12,
    look: { venue: 'night', dirt: [0.86, 0.74, 0.62], grass: [0.36, 0.46, 0.42], trees: 0.35, pines: 0.6, rocks: 0.4, fog: 0x0d1322, skyTop: 0x050a18, horizon: 0x16213a },
    terrain: { hills: 3, hillScale: 140, rim: 20, rimStart: 220, bumps: [] },
    segments: [
      { len: 130, w: 14, free: true, name: 'Start Straight' },
      { turn: 140, r: 28, berm: 1 },
      { len: 108, name: 'Lit Tables', features: [
        { at: 12, type: 'table', h: 1.7, face: 7, top: 7, land: 9 },
        { at: 55, type: 'table', h: 1.9, face: 7.5, top: 8, land: 10 },
      ] },
      { turn: -50, r: 34 },
      { len: 70, name: 'Night Rollers', features: [{ at: 10, type: 'rollers', n: 4, len: 10, h: 0.9 }] },
      { turn: 150, r: 22, berm: 1 },
      { len: 120, free: true, name: 'Floodlight Straight', features: [{ at: 30, type: 'triple', h: 1.8, face: 7.5, gap: 6.5, h2: 1.6, land: 9 }] },
      { turn: -40, r: 40 },
      { len: 60, name: 'Shadow Whoops', features: [{ at: 8, type: 'whoops', n: 10, len: 4.4, h: 0.5 }] },
      { turn: 160, r: 26, berm: 1 },
    ],
    gateAt: 16,
    finishAt: 110,
  },
  {
    id: 'lunar', recommend: ['Dirt Bikes', 'Quads'],
    name: 'Lunar Base One', difficulty: 'Medium',
    desc: 'Racing on the Moon: grey dust, craters, a black starry sky and low gravity - every jump floats. Past the habitat domes and the radio dishes.',
    worldSize: 600,
    seed: 7303,
    start: { x: -85, z: 119, heading: 0 },
    defaultWidth: 13,
    gravity: 0.55,
    look: { venue: 'moon', dirt: [0.72, 0.72, 0.8], floor: [0.27, 0.27, 0.29], trees: 0, rocks: 2.2, fog: 0x07080c, skyTop: 0x000000, horizon: 0x0a0b10 },
    terrain: {
      hills: 4, hillScale: 120, rim: 28, rimStart: 230, bumps: [],
      craters: [
        { x: 0, z: 190, r: 30, d: 8 }, { x: -205, z: 40, r: 24, d: 6 }, { x: 195, z: -60, r: 36, d: 10 },
        { x: -110, z: -200, r: 22, d: 6 }, { x: 165, z: 170, r: 20, d: 5 }, { x: -195, z: -140, r: 26, d: 7 },
      ],
    },
    segments: [
      { len: 140, w: 15, free: true, name: 'Launch Straight' },
      { turn: 90, r: 30, berm: 1 },
      { len: 98, name: 'Moon Hops', features: [
        { at: 10, type: 'table', h: 1.6, face: 7, top: 10, land: 12 },
        { at: 50, type: 'rollers', n: 3, len: 11, h: 1.0 },
      ] },
      { turn: 90, r: 26, berm: 1 },
      { len: 110, name: 'Crater Rim', features: [{ at: 20, type: 'step', h: 1.4, face: 6.5, gap: 6, h2: 2.2, top: 9, land: 11 }] },
      { turn: -70, r: 34 },
      { len: 60, name: 'Dust Whoops', features: [{ at: 8, type: 'whoops', n: 9, len: 5, h: 0.6 }] },
      { turn: 160, r: 24, berm: 1 },
      { len: 120, free: true, name: 'Low-G Table', features: [{ at: 30, type: 'table', h: 2.2, face: 9, top: 14, land: 14 }] },
      { turn: 90, r: 30, berm: 1 },
    ],
    gateAt: 16,
    finishAt: 120,
  },
  {
    id: 'steelyard', recommend: ['Dirt Bikes', 'Quads'],
    name: 'Steel Yard', difficulty: 'Hard',
    desc: 'A construction yard turned race track: square corners between container stacks, step-ups, a gap under the tower crane and gravel everywhere.',
    worldSize: 480,
    seed: 7404,
    start: { x: -99, z: 70, heading: 0 },
    defaultWidth: 11,
    look: { venue: 'yard', dirt: [0.82, 0.72, 0.62], floor: [0.34, 0.33, 0.31], trees: 0, rocks: 0.5, fog: 0xc9c4ba, skyTop: 0x5d84b5, horizon: 0xd9d2c4 },
    terrain: { hills: 0.6, hillScale: 90, rim: 10, rimStart: 190, bumps: [] },
    segments: [
      { len: 110, w: 13, free: true, name: 'Start Straight' },
      { turn: 90, r: 12, berm: 1 },
      { len: 50, name: 'Container Row', features: [{ at: 8, type: 'double', h: 1.5, face: 6, gap: 5, h2: 1.3, land: 7 }] },
      { turn: 90, r: 12, berm: 1 },
      { len: 56, name: 'Crane Gap', features: [{ at: 6, type: 'step', h: 1.3, face: 6, gap: 5, h2: 2.0, top: 7, land: 8 }] },
      { turn: -90, r: 12, berm: 1 },
      { len: 40, name: 'Loading Bay' },
      { turn: 90, r: 12, berm: 1 },
      { len: 75, name: 'Rebar Whoops', features: [{ at: 10, type: 'whoops', n: 11, len: 4.2, h: 0.5 }] },
      { turn: 90, r: 12, berm: 1 },
      { len: 60, free: true, name: 'Scaffold Straight', features: [{ at: 12, type: 'table', h: 1.6, face: 7, top: 6, land: 8 }] },
      { turn: -90, r: 12, berm: 1 },
      { len: 40, name: 'Pipe Stack' },
      { turn: 90, r: 12, berm: 1 },
      { len: 50, free: true, name: 'Gravel Run', features: [{ at: 8, type: 'rollers', n: 3, len: 8, h: 0.8 }] },
      { turn: 90, r: 12, berm: 1 },
    ],
    gateAt: 14,
    finishAt: 95,
  },
  {
    // open: ride anywhere (no barriers); the trail is the race line, the rest is yours to explore
    id: 'wildwood', recommend: ['Dirt Bikes', 'Quads', 'Side-by-Sides'], open: true,
    name: 'Wildwood Free Ride', difficulty: 'Medium',
    desc: 'A huge open valley: ride anywhere. A long trail loop over the hills, and secret jumps hidden in the woods and on the ridges - find them all.',
    worldSize: 900,
    seed: 7505,
    start: { x: -141, z: 269, heading: 0 },
    defaultWidth: 13,
    look: { dirt: [0.95, 0.8, 0.64], grass: [0.9, 1.0, 0.78], trees: 1.2, pines: 0.6, rocks: 1.4 },
    terrain: { hills: 26, hillScale: 230, rim: 60, rimStart: 380, bumps: [], ramps: [
        // secret jumps (found with a script: open, gentle ground, well away from the trail, facing downhill)
        { type: 'kicker', x: -124, z: -300, dir: -1.24, w: 7, len: 10, h: 3.1, gap: 10, landH: 2.6, landLen: 13 },
        { type: 'kicker', x: 12, z: -21, dir: 1.41, w: 7, len: 10, h: 2.7, gap: 10, landH: 2.6, landLen: 13 },
        { type: 'kicker', x: 58, z: 216, dir: 1.58, w: 7, len: 10, h: 2.6, gap: 9, landH: 2.6, landLen: 13 },
        { type: 'kicker', x: 255, z: 15, dir: 2.04, w: 7, len: 10, h: 2.3, gap: 12, landH: 2.6, landLen: 13 },
        { type: 'kicker', x: 303, z: -118, dir: -2.45, w: 7, len: 10, h: 3.1, gap: 8, landH: 2.6, landLen: 13 },
        { type: 'kicker', x: 296, z: 153, dir: 2.33, w: 7, len: 10, h: 3.2, gap: 13, landH: 2.6, landLen: 13 },
        { type: 'kicker', x: -329, z: 110, dir: -2.99, w: 7, len: 10, h: 3.2, gap: 11, landH: 2.6, landLen: 13 },
        { type: 'kicker', x: 282, z: 329, dir: 2.33, w: 7, len: 10, h: 2.6, gap: 13, landH: 2.6, landLen: 13 },
        { type: 'kicker', x: -298, z: -296, dir: -1.29, w: 7, len: 10, h: 3, gap: 9, landH: 2.6, landLen: 13 },
        { type: 'kicker', x: 271, z: -233, dir: 1.55, w: 7, len: 10, h: 2.4, gap: 14, landH: 2.6, landLen: 13 },
        { type: 'kicker', x: -169, z: -155, dir: 1.85, w: 7, len: 10, h: 2.7, gap: 12, landH: 2.6, landLen: 13 },
        { type: 'kicker', x: 223, z: 220, dir: 2.12, w: 7, len: 10, h: 2.9, gap: 9, landH: 2.6, landLen: 13 },
      ] },
    segments: [
      { len: 180, w: 15, free: true, name: 'Ridge Trail' },
      { turn: 70, r: 40, berm: 0.6 },
      { len: 160, name: 'Hilltop Run', features: [{ at: 40, type: 'rollers', n: 4, len: 12, h: 1.0 }] },
      { turn: -50, r: 50 },
      { len: 150, name: 'Creek Jumps', features: [{ at: 20, type: 'table', h: 1.8, face: 7.5, top: 8, land: 10 }, { at: 90, type: 'double', h: 1.7, face: 7, gap: 6, h2: 1.5, land: 9 }] },
      { turn: 120, r: 35, berm: 1 },
      { len: 200, free: true, name: 'Long Valley', features: [{ at: 25, type: 'rollers', n: 4, len: 13, h: 1.1 }] },
      { turn: -40, r: 60 },
      { len: 150, name: 'Forest Climb' },
      { turn: 150, r: 30, berm: 1 },
      { len: 180, free: true, name: 'Lake Shore', features: [{ at: 40, type: 'table', h: 2.0, face: 8, top: 9, land: 11 }] },
      { turn: 110, r: 40, berm: 1 },
    ],
    gateAt: 16,
    finishAt: 160,
  },
  {
    // open, like Wildwood: the oval is the mega ramp line, the rest of the park is free
    id: 'megapark', recommend: ['Dirt Bikes', 'Quads'], open: true, freestyle: true,
    name: 'Mega Ramp Park', difficulty: 'Freestyle',
    desc: 'A stunt park: a 50 m mega ramp gap off a big roll-in hill, quarter pipes round the walls, funboxes and a spine. Ride anywhere, send everything.',
    worldSize: 520,
    seed: 7606,
    start: { x: -150, z: 34, heading: 0 },
    defaultWidth: 26,
    look: { venue: 'yard', dirt: [0.95, 0.8, 0.66], floor: [0.42, 0.4, 0.37], trees: 0, rocks: 0, fog: 0xd8d2c6, skyTop: 0x4f86c9, horizon: 0xe2dccf },
    terrain: { hills: 0, hillScale: 100, rim: 26, rimStart: 215, rimSharp: true, bumps: [{ x: 200, z: 0, r: 65, h: 24 }], ramps: [ // bumps: the roll-in hill (speed for the mega ramp)
        // quarter pipes along both long sides, funboxes in the infield, a spine, two side kickers
        { type: 'quarter', x: -120, z: 150, dir: 3.14, w: 22, r: 6 },
        { type: 'quarter', x: -120, z: -150, dir: 0, w: 22, r: 6 },
        { type: 'quarter', x: -60, z: 150, dir: 3.14, w: 22, r: 6 },
        { type: 'quarter', x: -60, z: -150, dir: 0, w: 22, r: 6 },
        { type: 'quarter', x: 0, z: 150, dir: 3.14, w: 22, r: 6 },
        { type: 'quarter', x: 0, z: -150, dir: 0, w: 22, r: 6 },
        { type: 'quarter', x: 60, z: 150, dir: 3.14, w: 22, r: 6 },
        { type: 'quarter', x: 60, z: -150, dir: 0, w: 22, r: 6 },
        { type: 'quarter', x: 120, z: 150, dir: 3.14, w: 22, r: 6 },
        { type: 'quarter', x: 120, z: -150, dir: 0, w: 22, r: 6 },
        { type: 'box', x: -60, z: 0, dir: 1.57, w: 12, top: 10, s: 6, h: 2.2 },
        { type: 'box', x: 60, z: 0, dir: 1.57, w: 12, top: 10, s: 6, h: 2.2 },
        { type: 'quarter', x: 0, z: -100, dir: 0, w: 20, r: 5 },
        { type: 'quarter', x: 0, z: -108, dir: 3.14, w: 20, r: 5 },
        { type: 'kicker', x: 170, z: 100, dir: 3.14, w: 8, len: 11, h: 3, gap: 14, landH: 3.4, landLen: 15 },
        { type: 'kicker', x: 170, z: -100, dir: 0, w: 8, len: 11, h: 3, gap: 14, landH: 3.4, landLen: 15 },
      ] },
    segments: [
      { len: 300, w: 26, free: true, name: 'Run-up', features: [{ at: 60, type: 'kicker', h: 3.0, face: 10.5, gap: 12, landH: 3.5, land: 13 }] },
      { turn: 180, r: 34, berm: 0.6 },
      { len: 300, w: 26, free: true, name: 'Mega Ramp', features: [{ at: 30, type: 'kicker', h: 6.5, face: 18, gap: 36, landH: 8, land: 32 }] },
      { turn: 180, r: 34, berm: 0.6 },
    ],
    gateAt: 14,
    finishAt: 200,
  },
];

// =====================================================================
//  RAMPAGE TRICK PARK - a dedicated trick map for HUGE jumps, built on a big flat grey baseplate (no trees, no
//  scenery, nothing in the way). Two long run-up lanes on each side with a big jump and a giant one, a mega kicker and
//  a giant gap on the loop through the middle, tall quarter pipes along the walls, a spine and a funbox pyramid.
// =====================================================================
function trickPark() {
  const ramps = [];
  // sizes: M = the 36 m mega gap (proven on the Mega Ramp Park), G = a giant gap, S/H = warm-ups
  const K = {
    S: { len: 10.5, h: 3.0, gap: 12, landH: 3.5, landLen: 13 },
    H: { len: 14, h: 4.5, gap: 22, landH: 5.0, landLen: 22 },
    M: { len: 18, h: 6.5, gap: 36, landH: 8.0, landLen: 32 },
    G: { len: 20, h: 7.5, gap: 44, landH: 9.0, landLen: 38 },
  };
  const kick = (x, z, dir, k) => ramps.push({ type: 'kicker', x, z, dir, w: 10, ...K[k] });
  // outer lanes: a mega, then a giant (A rides +x, B rides -x). 200+ m of flat run-up before each one
  kick(-100, -165, 1.57, 'M'); kick(120, -165, 1.57, 'G');
  kick(100, 165, -1.57, 'M'); kick(-120, 165, -1.57, 'G');
  // inner lanes: warm-ups
  kick(-150, -105, 1.57, 'S'); kick(50, -105, 1.57, 'H');
  kick(150, 105, -1.57, 'S'); kick(-50, 105, -1.57, 'H');
  // tall quarter pipes along both walls
  for (const x of [-240, -120, 0, 120, 240]) ramps.push({ type: 'quarter', x, z: 305, dir: 3.14, w: 30, r: 12 }, { type: 'quarter', x, z: -305, dir: 0, w: 30, r: 12 });
  // funbox pyramid in the middle of the loop, a spine across the park
  ramps.push({ type: 'box', x: 0, z: 0, dir: 1.57, w: 18, top: 16, s: 7, h: 3.5 }, { type: 'box', x: 0, z: 0, dir: 1.57, w: 9, top: 7, s: 4, h: 5.2 });
  ramps.push({ type: 'quarter', x: 0, z: -70, dir: 0, w: 22, r: 6 }, { type: 'quarter', x: 0, z: -78, dir: 3.14, w: 22, r: 6 });
  ramps.push({ type: 'quarter', x: 0, z: 70, dir: 3.14, w: 22, r: 6 }, { type: 'quarter', x: 0, z: 78, dir: 0, w: 22, r: 6 });
  return {
    id: 'trickpark', recommend: ['Dirt Bikes', 'Quads'], open: true, freestyle: true,
    name: 'Rampage Trick Park', difficulty: 'Freestyle',
    desc: 'A huge flat baseplate made for big air: a mega kicker, a giant gap, long run-ups, tall quarter pipes, a spine and a funbox pyramid. Ride anywhere.',
    worldSize: 780,
    seed: 7707,
    start: { x: -200, z: 40, heading: 0 },
    defaultWidth: 26,
    look: { dirt: [0.5, 0.52, 0.56], grass: [0.5, 0.52, 0.56], floor: [0.5, 0.52, 0.56], trees: 0, pines: 0, rocks: 0, fog: 0xcfd6e0, skyTop: 0x4f86c9, horizon: 0xdde3ec },
    terrain: { hills: 0, hillScale: 100, rim: 30, rimStart: 345, rimSharp: true, bumps: [], ramps },
    segments: [
      { len: 420, w: 26, free: true, name: 'Run-up', features: [{ at: 40, type: 'kicker', h: 3.0, face: 10.5, gap: 12, landH: 3.5, land: 13 }, { at: 190, type: 'kicker', h: 6.5, face: 18, gap: 36, landH: 8, land: 32 }] },
      { turn: 180, r: 40, berm: 0.6 },
      { len: 420, w: 26, free: true, name: 'Giant lane', features: [{ at: 60, type: 'kicker', h: 7.5, face: 20, gap: 44, landH: 9, land: 38 }] },
      { turn: 180, r: 40, berm: 0.6 },
    ],
    gateAt: 14,
    finishAt: 200,
  };
}
VENUE_TRACKS.push(trickPark());

// A big snowy mountain for snowmobiles: open (ride anywhere), a groomed trail loop with jumps, and freeride kickers
// scattered over the slopes (their spots come from tools/make-summit.mjs). Sleds only - bikes and quads can ride it too.
VENUE_TRACKS.push({
  id: 'snowfield', recommend: ['Snowmobiles'], open: true,
  name: 'Summit Snowfield', difficulty: 'Medium',
  desc: 'A huge snowy mountain made for sleds: ride anywhere. A groomed trail loop with tables, doubles and whoops, plus freeride kickers hidden across the slopes and ridges.',
  worldSize: 900,
  seed: 7611,
  start: { x: -141, z: 269, heading: 0 },
  defaultWidth: 16,
  look: { snowTrack: 1, snow: 1, dirt: [0.9, 0.92, 0.98], grass: [0.95, 0.99, 1.05], trees: 0.5, pines: 2.4, rocks: 1.2, fog: 0xdbe6f1, skyTop: 0x5a88c0, horizon: 0xeaf1f8 },
  terrain: { hills: 34, hillScale: 240, rim: 70, rimStart: 380, bumps: [{ x: 150, z: -140, r: 240, h: 70 }, { x: -200, z: -160, r: 150, h: 38 }],
    ramps: [
        { type: 'kicker', x: 260, z: 236, dir: -1.28, w: 7, len: 11, h: 2.83, gap: 13, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: -304, z: 152, dir: -0.03, w: 7, len: 11, h: 3.08, gap: 11, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: -52, z: -340, dir: 2.9, w: 7, len: 11, h: 3, gap: 11, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: -112, z: 176, dir: 1.04, w: 7, len: 11, h: 2.62, gap: 13, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: -112, z: -148, dir: 0.75, w: 7, len: 11, h: 3.76, gap: 10, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: -220, z: 56, dir: -1.13, w: 7, len: 11, h: 3, gap: 13, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: -316, z: -256, dir: -1.2, w: 7, len: 11, h: 2.68, gap: 10, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: 92, z: 332, dir: 3.14, w: 7, len: 11, h: 2.73, gap: 9, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: -328, z: -88, dir: -1.37, w: 7, len: 11, h: 2.89, gap: 9, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: 32, z: 200, dir: 0.26, w: 7, len: 11, h: 3.48, gap: 9, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: -184, z: -268, dir: -1.98, w: 7, len: 11, h: 3.57, gap: 11, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: 224, z: -304, dir: 1.48, w: 7, len: 11, h: 3.25, gap: 10, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: -232, z: 284, dir: 0.37, w: 7, len: 11, h: 3.24, gap: 10, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: -340, z: 260, dir: -1.63, w: 7, len: 11, h: 3.54, gap: 12, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: -100, z: 332, dir: 2.43, w: 7, len: 11, h: 3.77, gap: 14, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: 212, z: -136, dir: 2.76, w: 7, len: 11, h: 2.97, gap: 11, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: 104, z: -232, dir: 2.72, w: 7, len: 11, h: 2.79, gap: 10, landH: 2.8, landLen: 14 },
        { type: 'kicker', x: -4, z: -124, dir: -0.66, w: 7, len: 11, h: 3.25, gap: 10, landH: 2.8, landLen: 14 },
    ] },
  segments: [
    { len: 180, w: 17, free: true, name: 'Base Trail' },
    { turn: 70, r: 40, berm: 0.6 },
    { len: 160, name: 'Lodge Rollers', features: [{ at: 40, type: 'rollers', n: 5, len: 12, h: 1.0 }] },
    { turn: -50, r: 50 },
    { len: 150, name: 'Pine Jumps', features: [{ at: 20, type: 'table', h: 1.9, face: 8, top: 8, land: 10 }, { at: 90, type: 'double', h: 1.8, face: 7.5, gap: 6.5, h2: 1.6, land: 9 }] },
    { turn: 120, r: 35, berm: 1 },
    { len: 200, free: true, name: 'Powder Valley', features: [{ at: 25, type: 'whoops', n: 8, len: 5.5, h: 0.5 }] },
    { turn: -40, r: 60 },
    { len: 150, name: 'Ridge Climb' },
    { turn: 150, r: 30, berm: 1 },
    { len: 180, free: true, name: 'Summit Run', features: [{ at: 40, type: 'table', h: 2.1, face: 8.5, top: 9, land: 11 }] },
    { turn: 110, r: 40, berm: 1 },
  ],
  gateAt: 16,
  finishAt: 160,
});
