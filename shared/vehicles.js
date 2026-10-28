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
];

// ---------------------------------------------------------------------
//  THE 3D MODELS (measured from the .glb files, in the model's own space:
//  +x = forward, +y = up, +z = right, ground at y = 0, metres)
//  paint:  materials recoloured with the paint's main colour
//  accent: materials recoloured with the paint's second colour
// ---------------------------------------------------------------------
export const MODELS = {
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
  buggy: {
    file: 'models/trophy_buggy.glb', kind: 'car', comX: -0.1,
    paint: ['body_orange'], accent: ['frame_team_blue'],
    steerWheel: 'steering_wheel', wheelCentre: [0.30, 1.10, 0], wheelAxisTo: [0.60, 1.00, 0],
    corners: {
      fl: { wheel: 'wheel_FL', carry: ['knuckle_FL', 'tie_rod_FL'], steer: true, arms: ['a_arm_lower_FL', 'a_arm_upper_FL'], shocks: ['shock_FL', 'bypass_FL'] },
      fr: { wheel: 'wheel_FR', carry: ['knuckle_FR', 'tie_rod_FR'], steer: true, arms: ['a_arm_lower_FR', 'a_arm_upper_FR'], shocks: ['shock_FR', 'bypass_FR'] },
      rl: { wheel: 'wheel_RL', carry: ['cv_axle_RL', 'radius_rods_RL'], trailing: 'trailing_arm_RL', shocks: ['shock_RL', 'bypass_RL'] },
      rr: { wheel: 'wheel_RR', carry: ['cv_axle_RR', 'radius_rods_RR'], trailing: 'trailing_arm_RR', shocks: ['shock_RR', 'bypass_RR'] },
    },
    attach: { seat: [-0.29, 0.62, 0], pegL: [0.66, 0.6, -0.12], pegR: [0.66, 0.6, 0.12], gripL: [0.32, 1.10, -0.2], gripR: [0.32, 1.10, 0.2], wheel: [0.30, 1.10, 0] },
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
  air: { flipRate: 5.6, flipAccel: 9, spinDamp: 1.2, gyro: 2.5, whip: 60, spinRate: 5.0 },
  balance: { rollK: 45000, rollC: 3200, airRollK: 900, airRollC: 160 },
  brakes: { front: 1500, rear: 1000 },      // N of force at the tyre at full input
  crash: { landPitch: 52, impact: 14, slide: 78, roll: 70, loop: 80 },
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
  air: { flipRate: 3.6, flipAccel: 6, spinDamp: 1.0, gyro: 1.6, whip: 25, spinRate: 4.6 },
  brakes: { front: 2100, rear: 1500 },
  crash: { landPitch: 58, impact: 14, roll: 80, loop: 82 },
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
  air: { flipRate: 2.0, flipAccel: 3.5, spinDamp: 1.0, gyro: 1.2, whip: 8, spinRate: 3.6 },
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

const BUGGY_BASE = {
  ...UTV_BASE, modelKey: 'buggy', category: 'Buggies',
  mass: 1350,
  inertia: [1250, 1500, 520],
  rideHeight: 0.86,
  cdA: 1.9,
  wheels: [
    // model: front axle 1.50 m, rear 1.55 m from the middle, CoM 10 cm back; track 2.04 m, 38" tyres
    { id: 'fl', z: 1.60, x: 1.02, r: 0.48, travel: 0.55, freq: 1.25, sag: 0.3, steer: true, driven: false, brake: 'front', mu: 1.0, alphaPeak: 0.15 },
    { id: 'fr', z: 1.60, x: -1.02, r: 0.48, travel: 0.55, freq: 1.25, sag: 0.3, steer: true, driven: false, brake: 'front', mu: 1.0, alphaPeak: 0.15 },
    { id: 'rl', z: -1.45, x: 1.02, r: 0.48, travel: 0.65, freq: 1.3, sag: 0.32, steer: false, driven: true, brake: 'rear', mu: 1.05, alphaPeak: 0.13 },
    { id: 'rr', z: -1.45, x: -1.02, r: 0.48, travel: 0.65, freq: 1.3, sag: 0.32, steer: false, driven: true, brake: 'rear', mu: 1.05, alphaPeak: 0.13 },
  ],
  damping: { bump: 0.4, rebound: 0.68 },
  steer: { maxLow: 30, maxHigh: 7, highSpeed: 34, rate: 2.3, airYaw: 0.4, latAcc: 9.0 },
  antiRoll: 52000,
  riderBalance: 9000,
  air: { flipRate: 1.6, flipAccel: 2.6, spinDamp: 0.9, gyro: 1.0, whip: 6, spinRate: 3.0 },
  brakes: { front: 9800, rear: 7000 },
  probes: [
    { p: [0.45, 1.25, 0.3], r: 0.18, hit: 'roll' },
    { p: [-0.45, 1.25, 0.3], r: 0.18, hit: 'roll' },
    { p: [0.5, 1.15, -1.1], r: 0.18, hit: 'roll' },
    { p: [-0.5, 1.15, -1.1], r: 0.18, hit: 'roll' },
    { p: [0, -0.45, 0.4], r: 0.2, hit: 'skid' },
    { p: [0, -0.4, -0.9], r: 0.2, hit: 'skid' },
    { p: [0, -0.05, 2.05], r: 0.18, hit: 'hard' },
    { p: [0, 0.2, -2.15], r: 0.18, hit: 'soft' },
    { p: [0.55, 0.05, 0], r: 0.18, hit: 'soft' },
    { p: [-0.55, 0.05, 0], r: 0.18, hit: 'soft' },
  ],
  radius: 1.35, halfWidth: 1.18, halfLength: 2.15,
  audio: { kind: 'buggy' },
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
    mass: 185, inertia: [56, 44, 20],
    steer: { ...BIKE_BASE.steer, rate: 4.2, latAcc: 11.0 },
    air: { ...BIKE_BASE.air, flipRate: 6.0 },
    engine: engine({ idle: 2000, redline: 13500, torque: [[1500, 11], [4000, 17], [8000, 24], [11000, 26.5], [13000, 24], [14000, 19]], gearSpeeds: [11, 16, 21, 26, 30.5] }),
  },
  {
    ...BIKE_BASE,
    id: 'mx450', name: 'Factory 450 MX', paint: 'red', tier: 'Pro',
    desc: 'Open-class four-stroke. Brutal torque out of corners and the speed to clear anything on the track.',
    stats: { speed: 9, accel: 9, handling: 7, stability: 7, suspension: 8 },
    engine: engine({ torque: [[1000, 18], [3000, 30], [6000, 40], [8000, 42], [10000, 38], [11500, 30]] }),
  },
  {
    ...BIKE_BASE,
    id: 'mx450w', name: 'Factory 450 Works', paint: 'black', tier: 'Works',
    desc: 'The factory team bike: more power, stiffer race suspension and a tighter front end. Fast, but it bites.',
    stats: { speed: 10, accel: 10, handling: 8, stability: 6, suspension: 9 },
    damping: { bump: 0.46, rebound: 0.66 },
    steer: { ...BIKE_BASE.steer, latAcc: 11.2, rate: 4.0 },
    wheels: BIKE_BASE.wheels.map((w) => ({ ...w, freq: w.freq * 1.08, mu: w.mu * 1.03 })),
    engine: engine({ torque: [[1000, 19], [3000, 32], [6000, 44], [8000, 46], [10000, 42], [11500, 33]], gearSpeeds: [12.5, 18, 24, 29.5, 34.5] }),
  },
  {
    ...ATV_BASE,
    id: 'atv450', name: 'Pro 450R', paint: 'yellow', tier: 'Starter',
    desc: 'A race-bred sport quad. Planted on four wheels, slides the rear when you ask it to.',
    stats: { speed: 8, accel: 7, handling: 8, stability: 8, suspension: 7 },
    engine: engine({ idle: 1600, redline: 10000, torque: [[1000, 22], [3000, 36], [6000, 48], [7500, 50], [9000, 44], [10500, 35]], gearSpeeds: [10, 15, 20, 25, 29.5], reverseSpeed: 4 }),
  },
  {
    ...ATV_BASE,
    id: 'atv700', name: 'Pro 700 Brute', paint: 'orange', tier: 'Pro',
    desc: 'Big-bore torque monster. Heavy and stable, pulls hard everywhere, a handful in tight turns.',
    stats: { speed: 9, accel: 8, handling: 6, stability: 10, suspension: 8 },
    mass: 335, inertia: [105, 128, 58],
    steer: { ...ATV_BASE.steer, maxLow: 30, rate: 2.6 },
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
    steer: { ...UTV_BASE.steer, rate: 3.0, latAcc: 10.0 },
    engine: engine({ idle: 1200, redline: 8200, torque: [[1000, 130], [3000, 200], [5500, 235], [7000, 225], [8500, 190]], gearSpeeds: [12.5, 21, 29.5, 37], engineBrake: 30, shiftTime: 0.07, reverseSpeed: 5 }),
  },
  {
    ...BUGGY_BASE,
    id: 'buggy', name: 'Trophy Buggy', paint: 'orange', tier: 'Pro',
    desc: 'A V8 desert race buggy with a mile of suspension travel. Highest top speed in the game; it hates tight turns.',
    stats: { speed: 10, accel: 8, handling: 5, stability: 10, suspension: 10 },
    engine: engine({ idle: 900, redline: 6800, torque: [[900, 330], [2500, 500], [4500, 620], [6000, 580], [7000, 500]], gearSpeeds: [12, 20, 28, 36, 43], engineBrake: 60, shiftTime: 0.15, reverseSpeed: 5 }),
  },
  {
    ...BUGGY_BASE,
    id: 'buggy_unl', name: 'Trophy Buggy Unlimited', paint: 'white', tier: 'Works',
    desc: 'Unlimited-class build: more power, a lighter chassis and race-valved shocks. Brutal and beautiful.',
    stats: { speed: 10, accel: 9, handling: 6, stability: 10, suspension: 10 },
    mass: 1280,
    damping: { bump: 0.45, rebound: 0.74 },
    engine: engine({ idle: 950, redline: 7200, torque: [[900, 360], [2500, 560], [4500, 700], [6000, 660], [7200, 560]], gearSpeeds: [12.5, 21, 29.5, 38, 45], engineBrake: 60, shiftTime: 0.13, reverseSpeed: 5 }),
  },
];

export const CATEGORIES = ['Dirt Bikes', 'Quads', 'Side-by-Sides', 'Buggies'];

export function getVehicle(id) {
  return VEHICLES.find((v) => v.id === id) || VEHICLES[0];
}

// ---------------------------------------------------------------------
//  UPGRADES (bought in the shop, per vehicle, 3 levels each)
//  They scale the physics a little - never enough to make a vehicle
//  a different class.
// ---------------------------------------------------------------------
export const UPGRADES = {
  engine: { name: 'Engine', levels: [{ price: 800, power: 1.04 }, { price: 1800, power: 1.08 }, { price: 3500, power: 1.12 }] },
  suspension: { name: 'Suspension', levels: [{ price: 700, travel: 1.04, damp: 1.05 }, { price: 1500, travel: 1.08, damp: 1.1 }, { price: 3000, travel: 1.12, damp: 1.15 }] },
  tyres: { name: 'Tyres', levels: [{ price: 600, grip: 1.03 }, { price: 1300, grip: 1.06 }, { price: 2600, grip: 1.09 }] },
};

export function applyUpgrades(def, ups = {}) {
  const e = ups.engine ? UPGRADES.engine.levels[ups.engine - 1] : null;
  const s = ups.suspension ? UPGRADES.suspension.levels[ups.suspension - 1] : null;
  const t = ups.tyres ? UPGRADES.tyres.levels[ups.tyres - 1] : null;
  if (!e && !s && !t) return def;
  const d = JSON.parse(JSON.stringify(def));
  if (e) d.engine.torque = d.engine.torque.map(([r, q]) => [r, q * e.power]);
  if (s) { d.wheels.forEach((w) => { w.travel *= s.travel; }); d.damping.bump *= s.damp; d.damping.rebound *= s.damp; }
  if (t) d.wheels.forEach((w) => { w.mu *= t.grip; });
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
