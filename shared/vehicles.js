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
];
export const PATTERNS = ['solid', 'stripes', 'flames', 'camo', 'galaxy', 'carbon', 'chrome', 'tiger', 'gradient', 'checker', 'hex', 'bolt', 'splatter', 'pixel', 'aurora', 'lava', 'marble', 'race'];

// ---------------------------------------------------------------------
//  THE 3D MODELS (measured from the .glb files, in the model's own space:
//  +x = forward, +y = up, +z = right, ground at y = 0, metres)
//  paint:  materials recoloured with the paint's main colour
//  accent: materials recoloured with the paint's second colour
// ---------------------------------------------------------------------
export const MODELS = {
  // the user's long-travel side-by-side, split into wheels by tools/bake-sxs.py
  sxs: {
    file: 'models/dune_runner.glb', kind: 'car', comX: -0.05,
    paint: ['material'], accent: ['material_6'],
    steerWheel: 'steering_wheel', wheelCentre: [0.59, 0.6, -0.23], wheelAxisTo: [0.86, 0.5, -0.23],
    corners: { fl: { wheel: 'wheel_FL', steer: true }, fr: { wheel: 'wheel_FR', steer: true }, rl: { wheel: 'wheel_RL' }, rr: { wheel: 'wheel_RR' } },
    attach: { seat: [0.0, 0.36, -0.23], pegL: [0.86, 0.34, -0.31], pegR: [0.86, 0.34, -0.15], gripL: [0.57, 0.62, -0.42], gripR: [0.57, 0.62, -0.04], wheel: [0.59, 0.6, -0.23] },
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
  quad: {
    file: 'models/pro_450r_quad.glb', kind: 'atv', comX: 0.0,
    paint: ['plastic_yellow'], accent: ['shock_spring_red'],
    steerGroup: 'handlebars', steerPivot: [0.27, 0.98, 0], steerAxisTo: [0.48, 0.33, 0],
    corners: {
      fl: { wheel: 'wheel_FL', carry: ['knuckle_FL', 'tie_rod_FL'], steer: true, arms: ['a_arm_lower_FL', 'a_arm_upper_FL'], shocks: ['shock_FL'] },
      fr: { wheel: 'wheel_FR', carry: ['knuckle_FR', 'tie_rod_FR'], steer: true, arms: ['a_arm_lower_FR', 'a_arm_upper_FR'], shocks: ['shock_FR'] },
    },
    rearAxle: { group: 'swingarm', pivot: [-0.11, 0.30, 0], wheels: ['wheel_RL', 'wheel_RR'], shock: 'shock_R' },
    attach: { seat: [-0.26, 0.90, 0], pegL: [-0.02, 0.33, -0.36], pegR: [-0.02, 0.33, 0.36], gripL: [0.23, 1.04, -0.39], gripR: [0.23, 1.04, 0.39] },
  },
  utv: {
    file: 'models/viper_rs_turbo.glb', kind: 'car', comX: 0.0,
    paint: ['body_green'], accent: ['shock_spring_orange'],
    steerWheel: 'steering_wheel', wheelCentre: [0.25, 0.98, -0.33], wheelAxisTo: [0.55, 0.88, -0.33],
    corners: {
      fl: { wheel: 'wheel_FL', carry: ['knuckle_FL', 'tie_rod_FL'], steer: true, arms: ['a_arm_lower_FL', 'a_arm_upper_FL'], shocks: ['shock_FL'] },
      fr: { wheel: 'wheel_FR', carry: ['knuckle_FR', 'tie_rod_FR'], steer: true, arms: ['a_arm_lower_FR', 'a_arm_upper_FR'], shocks: ['shock_FR'] },
      rl: { wheel: 'wheel_RL', carry: ['cv_axle_RL', 'radius_rods_RL'], trailing: 'trailing_arm_RL', shocks: ['shock_RL'] },
      rr: { wheel: 'wheel_RR', carry: ['cv_axle_RR', 'radius_rods_RR'], trailing: 'trailing_arm_RR', shocks: ['shock_RR'] },
    },
    attach: { seat: [-0.36, 0.62, -0.33], pegL: [0.62, 0.48, -0.45], pegR: [0.62, 0.48, -0.21], gripL: [0.27, 0.98, -0.53], gripR: [0.27, 0.98, -0.13], wheel: [0.25, 0.98, -0.33] },
    seated: true,
  },

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
    { id: 'fl', z: 0.64, x: 0.47, r: 0.28, travel: 0.23, freq: 1.75, sag: 0.3, steer: true, driven: false, brake: 'front', mu: 0.97, alphaPeak: 0.16 },
    { id: 'fr', z: 0.64, x: -0.47, r: 0.28, travel: 0.23, freq: 1.75, sag: 0.3, steer: true, driven: false, brake: 'front', mu: 0.97, alphaPeak: 0.16 },
    { id: 'rl', z: -0.64, x: 0.43, r: 0.255, travel: 0.25, freq: 1.8, sag: 0.32, steer: false, driven: true, brake: 'rear', mu: 1.0, alphaPeak: 0.14 },
    { id: 'rr', z: -0.64, x: -0.43, r: 0.255, travel: 0.25, freq: 1.8, sag: 0.32, steer: false, driven: true, brake: 'rear', mu: 1.0, alphaPeak: 0.14 },
  ],
  damping: { bump: 0.45, rebound: 0.75 },
  progressive: 5,
  steer: { maxLow: 33, maxHigh: 8, highSpeed: 22, rate: 3.0, airYaw: 0.8, latAcc: 9.0 },
  antiRoll: 16000,                 // N per metre of left/right compression difference
  rollCentre: 0.6,                 // 0 = tyre forces at the ground (tippy), 1 = at the CoM (can't tip)
  riderLean: 900,                  // N m of body-English torque when steering
  riderBalance: 5200,              // N m per radian: the rider throws weight to the high side
  axleScrub: 0.22,                 // solid rear axle resists turning (understeer)
  air: { flipRate: 3.3, flipAccel: 5.5, spinDamp: 1.0, gyro: 1.4, whip: 25, spinRate: 3.6 },
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
  steer: { maxLow: 32, maxHigh: 9, highSpeed: 30, rate: 2.6, airYaw: 0.5, latAcc: 9.5 },
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
    id: 'atv450', name: 'Pro 450R', paint: 'yellow', tier: 'Starter',
    desc: 'A race-bred sport quad. Planted on four wheels, slides the rear when you ask it to.',
    stats: { speed: 8, accel: 7, handling: 8, stability: 8, suspension: 7 },
    mass: 285, inertia: [88, 106, 48],
    air: { ...ATV_BASE.air, flipRate: 3.7, spinRate: 4.0 },
    engine: engine({ idle: 1600, redline: 10000, torque: [[1000, 22], [3000, 36], [6000, 48], [7500, 50], [9000, 44], [10500, 35]], gearSpeeds: [10, 15, 20, 25, 29.5], reverseSpeed: 4 }),
  },
  {
    ...ATV_BASE,
    id: 'atv700', name: 'Pro 700 Brute', paint: 'orange', tier: 'Pro',
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
    desc: 'Two-seat turbo side-by-side with all-wheel drive. Soaks up huge landings and drifts on command.',
    stats: { speed: 9, accel: 8, handling: 7, stability: 9, suspension: 10 },
    engine: engine({ idle: 1200, redline: 8000, torque: [[1000, 120], [3000, 175], [5500, 205], [7000, 195], [8500, 165]], gearSpeeds: [12, 20, 28, 35], engineBrake: 30, shiftTime: 0.08, reverseSpeed: 5 }),
  },
  {
    ...UTV_BASE,
    id: 'utvr', name: 'Viper RS Turbo R', paint: 'black', tier: 'Works',
    desc: 'Race-built Viper: bigger turbo, stiffer shocks and a quicker steering rack. The fastest thing on four small wheels.',
    stats: { speed: 10, accel: 9, handling: 8, stability: 9, suspension: 10 },
    damping: { bump: 0.48, rebound: 0.78 },
    steer: { ...UTV_BASE.steer, rate: 3.2, latAcc: 10.4 },
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
    audio: { kind: 'bike', pitch: 1.35 },
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
    audio: { kind: 'bike', pitch: 0.8 },
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
    id: 'sxs', modelKey: 'sxs', name: 'Dune Runner XP', paint: 'orange', tier: 'Pro',
    desc: 'A stripped-down long-travel side-by-side with an open cage. Shorter and lighter than the Viper - it dances over rough ground.',
    stats: { speed: 9, accel: 9, handling: 8, stability: 8, suspension: 10 },
    mass: 720, rideHeight: 0.7,
    wheels: UTV_BASE.wheels.map((w) => ({ ...w, z: Math.sign(w.z) * 1.043, x: Math.sign(w.x) * (w.z > 0 ? 0.852 : 0.925), r: 0.37, travel: w.travel * 1.1 })),
    halfLength: 1.7, halfWidth: 0.85,
    steer: { ...UTV_BASE.steer, rate: 3.3 },
    engine: engine({ idle: 1200, redline: 8500, torque: [[1000, 115], [3000, 170], [5500, 200], [7000, 192], [8500, 160]], gearSpeeds: [12, 20, 28, 36], engineBrake: 28, shiftTime: 0.08, reverseSpeed: 5 }),
  },
  // ---- more quads ----
  {
    ...ATV_BASE,
    id: 'atv250', name: 'Sport 250', paint: 'green', tier: 'Starter',
    desc: 'A light, nimble sport quad. Not much top end, but it turns on a dime and flicks into the air.',
    stats: { speed: 6, accel: 6, handling: 9, stability: 7, suspension: 6 },
    mass: 255, inertia: [78, 94, 42],
    steer: { ...ATV_BASE.steer, rate: 3.4 },
    air: { ...ATV_BASE.air, flipRate: 4.0, spinRate: 4.3 },
    engine: engine({ idle: 1700, redline: 10500, torque: [[1000, 15], [3000, 24], [6000, 32], [8000, 33], [9500, 29], [10500, 24]], gearSpeeds: [9.5, 14, 18.5, 23, 27] }),
  },
  {
    ...ATV_BASE,
    id: 'atv1000', name: 'Mud Pro 1000', paint: 'black', tier: 'Works',
    desc: 'A twin-cylinder brute. Huge torque everywhere and the most stable quad on the hill - heavy in the air.',
    stats: { speed: 10, accel: 9, handling: 5, stability: 10, suspension: 9 },
    mass: 390, inertia: [125, 150, 70],
    steer: { ...ATV_BASE.steer, maxLow: 28, rate: 2.2 },
    air: { ...ATV_BASE.air, flipRate: 2.6, spinRate: 2.8 },
    engine: engine({ idle: 1200, redline: 8000, torque: [[1000, 52], [2500, 74], [4500, 86], [6000, 82], [7000, 72], [8000, 58]], gearSpeeds: [10, 15.5, 21, 26.5, 32], reverseSpeed: 4 }),
  },
];

export const CATEGORIES = ['Dirt Bikes', 'Quads', 'Side-by-Sides'];

export function getVehicle(id) {
  return VEHICLES.find((v) => v.id === id) || VEHICLES[0];
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
};

export function applyUpgrades(def, ups = {}) {
  const L = (p) => (ups[p] ? UPGRADES[p].levels[Math.min(ups[p], UPGRADES[p].levels.length) - 1] : null);
  const e = L('engine'), s = L('suspension'), t = L('tyres'), w = L('weight'), a = L('air');
  if (!e && !s && !t && !w && !a) return def;
  const d = JSON.parse(JSON.stringify(def));
  if (e) d.engine.torque = d.engine.torque.map(([r, q]) => [r, q * e.power]);
  if (s) { d.wheels.forEach((x) => { x.travel *= s.travel; }); d.damping.bump *= s.damp; d.damping.rebound *= s.damp; }
  if (t) d.wheels.forEach((x) => { x.mu *= t.grip; });
  if (w) { d.mass *= w.mass; d.inertia = d.inertia.map((i) => i * w.mass); }
  if (a) { d.air.flipRate *= a.rot; d.air.spinRate *= a.rot; d.air.flipAccel *= a.rot; }
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
  const id = !colorId || colorId === 'stock' ? v.paint : colorId;
  return BIKE_COLORS.find((c) => c.id === id) || BIKE_COLORS[0];
}
