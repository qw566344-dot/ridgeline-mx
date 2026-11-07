// =====================================================================
//  VEHICLE VISUALS
//  Draws a bike or quad that follows the physics: wheels spin, forks and
//  swingarm move with the suspension, bars turn with the steering, and
//  the bike leans into corners.
//
//  YOUR MODELS: drop a .glb into client/models/ with the file name given
//  in shared/vehicles.js (e.g. models/dirtbike_450.glb). Name the wheel
//  objects so they can spin - see MODELS.md. If the file is missing, a
//  detailed placeholder with the same dimensions is built instead.
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/addons/loaders/GLTFLoader.js';
import { box, cyl, tube, sphere, torus, pipe, plate, merge, colorize, clean, place, roundBox } from './geo.js';
import { prepareVehicle, MODELS } from '/shared/vehicles.js';
import { createModelInstance, updateModelInstance, wheelTurn, barTurn } from './modelRig.js';

const DEG = Math.PI / 180;
const loader = new GLTFLoader();
const glbCache = new Map();     // url -> Promise<gltf|null>
const placeholderCache = new Map();

export function loadGLB(url) {
  if (!glbCache.has(url)) {
    glbCache.set(url, new Promise((resolve) => {
      fetch(url, { method: 'HEAD' }).then((r) => {
        if (!r.ok) return resolve(null);
        loader.load(url, (g) => resolve(g), undefined, (e) => { console.warn('Could not load model', url, e); resolve(null); });
      }).catch(() => resolve(null));
    }));
  }
  return glbCache.get(url);
}

// shared materials (vertex colours carry the actual colours)
const MATS = {};
function mats() {
  if (!MATS.paint) {
    MATS.paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.05, envMapIntensity: 0.9 });
    MATS.metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.85, envMapIntensity: 1.0 });
    MATS.rubber = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.3 });
  }
  return MATS;
}

// build meshes for a part list grouped by material
function meshGroup(lists) {
  const g = new THREE.Group();
  const M = mats();
  for (const key of ['paint', 'metal', 'rubber']) {
    const l = lists[key];
    if (!l || !l.length) continue;
    const geo = merge(l);
    const m = new THREE.Mesh(geo, M[key]);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

function cloneGroup(g) {
  // geometry and materials are shared between copies
  return g.clone(true);
}

// --- wheel ------------------------------------------------------------
function wheelParts(r, width, rim = 0x1a1a1a, hub = 0xb8bcc4, atv = false) {
  const paint = [], metal = [], rubber = [];
  const tyreR = atv ? width * 0.5 : r * 0.17;
  const core = r - tyreR;
  if (atv) {
    // balloon tyre: a lathe with a rounded profile, axis along x
    const pts = [];
    const hw = width / 2;
    for (let i = 0; i <= 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * Math.PI;
      pts.push(new THREE.Vector2(r - 0.08 + Math.cos(a) * 0.08, Math.sin(a) * hw));
    }
    pts.unshift(new THREE.Vector2(r * 0.55, -hw * 0.95)); pts.push(new THREE.Vector2(r * 0.55, hw * 0.95));
    const lg = clean(new THREE.LatheGeometry(pts, 24));
    lg.rotateZ(Math.PI / 2);
    rubber.push(colorize(lg, 0x1b1b1b));
    // knobs
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      for (const s of [-1, 1]) {
        rubber.push(place(colorize(clean(new THREE.BoxGeometry(width * 0.32, 0.03, 0.05)), 0x161616), [s * width * 0.22, Math.cos(a + s * 0.08) * (r - 0.005), Math.sin(a + s * 0.08) * (r - 0.005)], [a, 0, 0]));
      }
    }
    metal.push(cyl(r * 0.56, r * 0.56, width * 0.8, rim, [0, 0, 0], [0, 0, Math.PI / 2], 16));
    metal.push(cyl(r * 0.2, r * 0.2, width * 0.9, hub, [0, 0, 0], [0, 0, Math.PI / 2], 8));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      metal.push(place(colorize(clean(new THREE.BoxGeometry(width * 0.1, r * 0.4, 0.05)), hub), [width * 0.38, Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32], [a, 0, 0]));
    }
  } else {
    rubber.push(torus(core + tyreR * 0.1, tyreR, 0x1b1b1b, [0, 0, 0], [0, Math.PI / 2, 0], 8, 32));
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const rr = r - 0.008;
      rubber.push(place(colorize(clean(new THREE.BoxGeometry(width * 0.95, 0.022, 0.035)), 0x141414), [((i % 2) - 0.5) * width * 0.25, Math.cos(a) * rr, Math.sin(a) * rr], [a, 0, 0]));
    }
    metal.push(torus(core - 0.01, 0.014, rim, [0, 0, 0], [0, Math.PI / 2, 0], 6, 32));
    metal.push(cyl(0.045, 0.045, width * 1.3, hub, [0, 0, 0], [0, 0, Math.PI / 2], 10));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const side = i % 2 ? 1 : -1;
      metal.push(tube([side * 0.035, Math.cos(a) * 0.04, Math.sin(a) * 0.04], [0, Math.cos(a + 0.3) * (core - 0.015), Math.sin(a + 0.3) * (core - 0.015)], 0.0035, 0xc9ccd2, 3));
    }
    metal.push(cyl(r * 0.36, r * 0.36, 0.006, 0x8a8f96, [0.05, 0, 0], [0, 0, Math.PI / 2], 16)); // brake disc
  }
  return { paint, metal, rubber };
}

// --- placeholder dirt bike ----------------------------------------------
function buildBike(cfg, scheme, number) {
  const body = scheme.body, acc = scheme.accent;
  const blk = 0x1c1c1f, alu = 0xb9bec6, gold = 0xc9a03a;
  const front = cfg.wheels[0], rear = cfg.wheels[1];
  const fy = front.y - (front.travel - front.sag * front.travel), ry = rear.y - (rear.travel - rear.sag * rear.travel);
  const axF = new THREE.Vector3(0, fy, front.z), axR = new THREE.Vector3(0, ry, rear.z);
  const rake = 27 * DEG;
  const forkDir = new THREE.Vector3(0, -Math.cos(rake), Math.sin(rake)); // down the fork
  const head = axF.clone().addScaledVector(forkDir, -0.92);  // top clamp
  const pivot = new THREE.Vector3(0, -0.28, -0.16);           // swingarm pivot

  // ---- chassis (does not move)
  const C = { paint: [], metal: [], rubber: [] };
  const H = [head.x, head.y, head.z];
  C.metal.push(tube(H, [0, -0.36, 0.28], 0.024, alu), tube(H, [0, 0.12, -0.18], 0.022, alu));
  for (const s of [1, -1]) {
    C.metal.push(tube([s * 0.07, 0.1, -0.15], [s * 0.08, -0.32, -0.2], 0.02, alu));
    C.metal.push(tube([s * 0.07, 0.12, -0.15], [s * 0.06, 0.12, -0.75], 0.014, alu));
    C.metal.push(tube([s * 0.06, -0.1, -0.2], [s * 0.06, 0.1, -0.7], 0.012, alu));
  }
  // engine + cases
  C.metal.push(box(0.22, 0.36, 0.42, 0x3b3f45, [0, -0.25, 0.06], undefined, 0.05));
  C.metal.push(box(0.17, 0.22, 0.22, 0x50555c, [0, 0.0, 0.1], [0.3, 0, 0], 0.04));
  C.metal.push(cyl(0.12, 0.12, 0.27, 0x2e3238, [0, -0.32, -0.02], [0, 0, Math.PI / 2], 14));
  C.metal.push(box(0.26, 0.05, 0.42, alu, [0, -0.45, 0.06])); // bash plate
  // radiators + shrouds
  for (const s of [1, -1]) {
    C.metal.push(box(0.03, 0.26, 0.2, 0x2a2d31, [s * 0.11, 0.0, 0.32], [0, 0, 0]));
    C.paint.push(plate([[0, 0], [0.34, 0.06], [0.3, 0.26], [0.02, 0.22]], 0.012, body, [s * 0.14, -0.08, 0.15], [0, -Math.PI / 2, 0]));
    C.paint.push(plate([[0.04, 0.04], [0.22, 0.08], [0.2, 0.16], [0.06, 0.14]], 0.006, acc, [s * 0.15, -0.06, 0.17], [0, -Math.PI / 2, 0]));
  }
  // tank + seat
  C.paint.push(box(0.24, 0.17, 0.36, body, [0, 0.16, 0.15], [-0.12, 0, 0], 0.07));
  C.rubber.push(box(0.21, 0.09, 0.95, 0x17171a, [0, 0.16, -0.3], [0.04, 0, 0], 0.04));
  C.paint.push(box(0.2, 0.03, 0.85, acc, [0, 0.112, -0.32], [0.04, 0, 0]));
  // side number plates + airbox
  for (const s of [1, -1]) {
    C.paint.push(plate([[0, 0], [0.42, 0.1], [0.4, 0.3], [0.03, 0.24]], 0.012, 0xf4f4f4, [s * 0.13, -0.08, -0.25], [0, Math.PI / 2, 0]));
  }
  // rear fender
  C.paint.push(plate([[0, 0], [0.55, 0.12], [0.5, 0.17], [0, 0.07]], 0.2, body, [0, 0.09, -0.45], [0, Math.PI / 2, 0], 0.02));
  // exhaust (right side = -x)
  C.metal.push(pipe([[-0.04, -0.12, 0.25], [-0.12, -0.3, 0.32], [-0.17, -0.38, 0.12], [-0.17, -0.18, -0.25], [-0.16, 0.0, -0.5]], 0.03, 0x9a7b55, 24, 8));
  C.metal.push(cyl(0.055, 0.055, 0.45, 0xc9ccd2, [-0.16, 0.05, -0.7], [Math.PI / 2 - 0.25, 0, 0], 12));
  C.metal.push(cyl(0.035, 0.035, 0.05, 0x222222, [-0.16, 0.11, -0.93], [Math.PI / 2 - 0.25, 0, 0], 10));
  // pegs + shock
  for (const s of [1, -1]) C.metal.push(box(0.11, 0.025, 0.05, alu, [s * 0.17, -0.38, -0.12]));
  C.metal.push(tube([0, 0.08, -0.15], [0, -0.3, -0.42], 0.03, 0xd9b232));
  const chassis = meshGroup(C);

  // ---- steering assembly: bars, top clamp, fork tubes, number plate, fender
  const S = { paint: [], metal: [], rubber: [] };
  // built around the top clamp at origin, fork axis along -forkDir
  const toLocal = (v) => v.clone().sub(head);
  const bars = [[0.4, 0.13, -0.06], [0.2, 0.1, -0.03], [-0.2, 0.1, -0.03], [-0.4, 0.13, -0.06]];
  S.metal.push(pipe(bars, 0.012, 0x2a2a2a, 16, 6));
  for (const s of [1, -1]) S.rubber.push(cyl(0.018, 0.018, 0.12, 0x111111, [s * 0.36, 0.125, -0.055], [0, 0, Math.PI / 2], 8));
  S.metal.push(box(0.26, 0.04, 0.12, alu, [0, 0, 0]));
  S.metal.push(box(0.26, 0.05, 0.12, alu, [0, -0.2, 0.09]));
  for (const s of [1, -1]) {
    const a = new THREE.Vector3(s * 0.085, 0.02, 0), b = a.clone().addScaledVector(forkDir, 0.5);
    S.metal.push(tube([a.x, a.y, a.z], [b.x, b.y, b.z], 0.026, 0xd8b04a));
  }
  S.paint.push(plate([[-0.14, 0], [0.14, 0], [0.12, 0.22], [-0.12, 0.22]], 0.012, 0xf4f4f4, [0, -0.16, 0.13], [-0.35, 0, 0]));
  S.paint.push(plate([[0, 0], [0.5, -0.05], [0.48, 0.02], [0.02, 0.06]], 0.14, body, [0, -0.3, 0.05], [0, -Math.PI / 2, -0.35], 0.02));
  const steer = meshGroup(S);
  // fork lowers + front wheel (slide along the fork)
  const L = { paint: [], metal: [], rubber: [] };
  for (const s of [1, -1]) {
    const a = new THREE.Vector3(s * 0.085, 0, 0), b = a.clone().addScaledVector(forkDir, -0.38);
    L.metal.push(tube([a.x, a.y, a.z], [b.x, b.y, b.z], 0.032, 0x26282c));
    L.paint.push(box(0.012, 0.18, 0.05, 0xe5e7eb, [s * 0.12, 0.12, -0.03], [-rake, 0, 0]));
  }
  const forkLower = meshGroup(L);
  const fw = wheelParts(front.r, 0.1);
  const frontWheel = meshGroup(fw);

  // ---- swingarm + rear wheel
  const A = { paint: [], metal: [], rubber: [] };
  const armLen = pivot.distanceTo(axR);
  for (const s of [1, -1]) A.metal.push(box(0.035, 0.06, armLen, alu, [s * 0.08, 0, -armLen / 2], undefined, 0.012));
  A.metal.push(box(0.2, 0.05, 0.08, alu, [0, 0, -0.05]));
  A.metal.push(box(0.018, 0.04, armLen * 0.95, 0x1a1a1a, [0.115, 0.02, -armLen / 2])); // chain guide
  const swingarm = meshGroup(A);
  const rw = wheelParts(rear.r, 0.13);
  const rearWheel = meshGroup(rw);

  return { chassis, steer, forkLower, frontWheel, swingarm, rearWheel, head, forkDir, pivot, axF, axR, armLen, rake };
}

// --- placeholder quad -------------------------------------------------
function buildAtv(cfg, scheme) {
  const body = scheme.body, acc = scheme.accent;
  const blk = 0x1c1c1f, alu = 0xa7adb5;
  const [fl, fr, rl, rr] = cfg.wheels;
  const restY = (w) => w.y - (w.travel - w.sag * w.travel);
  const C = { paint: [], metal: [], rubber: [] };
  // frame
  for (const s of [1, -1]) {
    C.metal.push(tube([s * 0.2, -0.28, 0.75], [s * 0.2, -0.28, -0.65], 0.022, 0x2f3338));
    C.metal.push(tube([s * 0.2, -0.28, 0.75], [s * 0.18, 0.12, 0.45], 0.02, 0x2f3338));
    C.metal.push(tube([s * 0.18, 0.12, 0.45], [s * 0.16, 0.1, -0.7], 0.02, 0x2f3338));
    // nerf bars
    C.metal.push(pipe([[s * 0.2, -0.24, 0.42], [s * 0.45, -0.3, 0.3], [s * 0.47, -0.3, -0.3], [s * 0.2, -0.24, -0.42]], 0.018, 0x26282c, 16, 6));
    C.metal.push(box(0.2, 0.02, 0.5, 0x3a3d42, [s * 0.38, -0.3, 0.0]));
  }
  // front bumper + rear grab bar
  C.metal.push(pipe([[0.25, -0.15, 0.92], [0.2, 0.05, 1.05], [-0.2, 0.05, 1.05], [-0.25, -0.15, 0.92]], 0.02, 0x26282c, 16, 6));
  C.metal.push(pipe([[0.22, 0.2, -0.78], [0.2, 0.22, -0.98], [-0.2, 0.22, -0.98], [-0.22, 0.2, -0.78]], 0.018, 0x26282c, 16, 6));
  // engine
  C.metal.push(box(0.3, 0.34, 0.45, 0x3b3f45, [0, -0.18, 0.02], undefined, 0.05));
  C.metal.push(cyl(0.11, 0.11, 0.32, 0x2e3238, [0, -0.26, -0.08], [0, 0, Math.PI / 2], 12));
  // plastics: front fenders/hood, rear fenders
  C.paint.push(box(1.12, 0.06, 0.62, body, [0, 0.12, 0.72], [0.12, 0, 0], 0.03));
  for (const s of [1, -1]) C.paint.push(box(0.36, 0.05, 0.6, body, [s * 0.44, 0.07, 0.66], [0.1, 0, s * 0.18], 0.025));
  C.paint.push(box(0.5, 0.22, 0.42, body, [0, 0.22, 0.42], [-0.2, 0, 0], 0.08));
  C.paint.push(box(1.08, 0.06, 0.6, body, [0, 0.16, -0.66], [-0.06, 0, 0], 0.03));
  for (const s of [1, -1]) C.paint.push(box(0.34, 0.05, 0.62, body, [s * 0.43, 0.1, -0.65], [-0.05, 0, s * 0.16], 0.025));
  C.paint.push(box(0.46, 0.04, 0.42, acc, [0, 0.25, 0.45], [-0.2, 0, 0]));
  // number plate on the front
  C.paint.push(plate([[-0.16, 0], [0.16, 0], [0.14, 0.2], [-0.14, 0.2]], 0.012, 0xf4f4f4, [0, 0.17, 0.98], [-0.25, 0, 0]));
  // seat
  C.rubber.push(box(0.3, 0.1, 0.8, 0x17171a, [0, 0.28, -0.25], [0.02, 0, 0], 0.05));
  // exhaust
  C.metal.push(pipe([[-0.06, -0.08, 0.2], [-0.2, -0.05, 0.05], [-0.22, 0.05, -0.4], [-0.2, 0.12, -0.6]], 0.03, 0x9a7b55, 20, 8));
  C.metal.push(cyl(0.06, 0.06, 0.35, 0xc9ccd2, [-0.2, 0.15, -0.75], [Math.PI / 2 - 0.12, 0, 0], 12));
  // rear axle carrier
  C.metal.push(box(0.12, 0.12, 0.12, alu, [0, restY(rl) + 0.02, -0.4]));
  const chassis = meshGroup(C);
  // steering: handlebar on a post
  const S = { paint: [], metal: [], rubber: [] };
  S.metal.push(pipe([[0.44, 0.08, -0.06], [0.2, 0.05, 0], [-0.2, 0.05, 0], [-0.44, 0.08, -0.06]], 0.012, 0x2a2a2a, 16, 6));
  for (const s of [1, -1]) S.rubber.push(cyl(0.019, 0.019, 0.12, 0x111111, [s * 0.4, 0.075, -0.05], [0, 0, Math.PI / 2], 8));
  S.metal.push(cyl(0.02, 0.02, 0.35, 0x2a2a2a, [0, -0.15, 0.04], [0.25, 0, 0], 8));
  S.paint.push(box(0.2, 0.06, 0.08, acc, [0, 0.06, 0.02], undefined, 0.02));
  const steer = meshGroup(S);
  const wheelsF = [fl, fr].map((w) => meshGroup(wheelParts(w.r, 0.2, 0x1a1a1a, alu, true)));
  const wheelsR = [rl, rr].map((w) => meshGroup(wheelParts(w.r, 0.24, 0x1a1a1a, alu, true)));
  // rear axle (a bar between the rear wheels, tilts with them)
  const axle = meshGroup({ metal: [cyl(0.03, 0.03, Math.abs(rl.x - rr.x) + 0.1, 0x2a2d31, [0, 0, 0], [0, 0, Math.PI / 2], 8)] });
  // a-arm (unit length along +z, scaled each frame)
  const arm = meshGroup({ metal: [box(0.05, 0.03, 1, 0x2f3338, [0, 0, 0.5], undefined, 0.01)] });
  const shock = meshGroup({ metal: [cyl(0.025, 0.025, 1, 0xd9b232, [0, 0.5, 0], [0, 0, 0], 8)] });
  return { chassis, steer, wheelsF, wheelsR, axle, arm, shock, restY };
}

// ---------------------------------------------------------------------
// office chair (special vehicle): five-star base on casters, gas lift, seat and a backrest.
// The rider sits on it backwards, so the backrest is on the side the chair travels toward (+z).
function buildChair(cfg, scheme) {
  const g = -cfg.rideHeight;                               // the ground in vehicle space
  const paint = [], metal = [], rubber = [];
  const fabric = scheme && scheme.body !== undefined ? scheme.body : 0x2b2f36, dark = 0x1d1f24, chrome = 0xb8bec7;
  for (let i = 0; i < 5; i++) {                             // the star base and its casters
    const a = (i / 5) * Math.PI * 2;
    const x = Math.sin(a) * 0.17, z = Math.cos(a) * 0.17;
    metal.push(box(0.05, 0.035, 0.34, dark, [x, g + 0.11, z], [0, a, 0]));
    rubber.push(sphere(0.045, 0x111111, [Math.sin(a) * 0.33, g + 0.045, Math.cos(a) * 0.33], [1, 1, 0.75], 10, 8));
  }
  metal.push(cyl(0.05, 0.06, 0.06, dark, [0, g + 0.13, 0]));
  metal.push(cyl(0.026, 0.026, 0.3, chrome, [0, g + 0.28, 0], [0, 0, 0], 12));          // gas lift
  metal.push(box(0.2, 0.03, 0.2, dark, [0, g + 0.43, 0]));                                // seat plate
  paint.push(box(0.5, 0.08, 0.48, fabric, [0, g + 0.49, 0], [0, 0, 0], 0.03));            // cushion
  metal.push(box(0.05, 0.36, 0.035, dark, [0, g + 0.6, 0.25], [0.12, 0, 0]));             // back post
  paint.push(box(0.46, 0.5, 0.07, fabric, [0, g + 0.86, 0.29], [0.14, 0, 0], 0.03));      // backrest
  for (const sx of [1, -1]) {                                                              // armrests
    metal.push(box(0.035, 0.2, 0.035, dark, [sx * 0.25, g + 0.6, 0.02]));
    rubber.push(box(0.06, 0.03, 0.26, dark, [sx * 0.25, g + 0.71, 0.02]));
  }
  return meshGroup({ paint, metal, rubber });
}

// ---------------------------------------------------------------------
// the other built specials. Each returns { group, wheels: [{ m, r, axis }], steer: [...], ... }
// so update() can spin the wheels with the physics and turn what steers.
const spinner = (list, r, mat = 'rubber') => { const g = meshGroup({ [mat]: list }); return { m: g, r }; };

// shopping cart: a wire basket on a frame, four swivel casters, a red handle at the back
// and a little step behind it to stand on
function buildCart(cfg) {
  const g = -cfg.rideHeight, chrome = 0xc9ced6, red = 0xd23a2a, metal = [], paint = [];
  const bx = 0.27, bz0 = -0.42, bz1 = 0.48, y0 = g + 0.42, y1 = g + 0.92;
  // basket: corner posts, top and bottom rims, side and floor wires
  const top = [[-bx - 0.03, y1, bz0], [bx + 0.03, y1, bz0], [bx, y1, bz1], [-bx, y1, bz1]];
  const bot = [[-bx + 0.03, y0, bz0 + 0.06], [bx - 0.03, y0, bz0 + 0.06], [bx - 0.05, y0, bz1 - 0.04], [-bx + 0.05, y0, bz1 - 0.04]];
  for (let i = 0; i < 4; i++) {
    metal.push(tube(top[i], top[(i + 1) % 4], 0.012, chrome, 6), tube(bot[i], bot[(i + 1) % 4], 0.01, chrome, 6), tube(top[i], bot[i], 0.01, chrome, 6));
  }
  for (let k = 1; k < 8; k++) {
    const t = k / 8, z = bz0 + (bz1 - bz0) * t;
    for (const sx of [1, -1]) metal.push(tube([sx * (bx + 0.03 - 0.03 * t), y1, z], [sx * (bx - 0.03 - 0.02 * t), y0, z + 0.03], 0.006, chrome, 4));
    metal.push(tube([-bx + 0.04, y0, z], [bx - 0.04, y0, z], 0.006, chrome, 4));
  }
  for (let k = 1; k < 5; k++) { const x = -bx + (2 * bx * k) / 5; metal.push(tube([x, y1, bz1], [x, y0, bz1 - 0.04], 0.006, chrome, 4), tube([x, y1, bz0], [x, y0, bz0 + 0.06], 0.006, chrome, 4)); }
  for (let k = 1; k < 4; k++) { const y = y0 + ((y1 - y0) * k) / 4; metal.push(tube([-bx, y, bz1 - 0.01], [bx, y, bz1 - 0.01], 0.006, chrome, 4)); }
  // frame and bottom tray down to the casters
  for (const sx of [1, -1]) {
    metal.push(tube([sx * 0.24, g + 0.12, bz0 - 0.02], [sx * 0.22, g + 0.12, bz1], 0.014, chrome, 6));
    metal.push(tube([sx * 0.24, g + 0.12, bz0 - 0.02], [sx * (bx + 0.02), y1 + 0.06, bz0 - 0.08], 0.014, chrome, 6)); // back legs up to the handle
    metal.push(tube([sx * 0.22, g + 0.12, bz1], [sx * (bx - 0.03), y0, bz1 - 0.06], 0.012, chrome, 6));
  }
  for (let k = 0; k < 5; k++) metal.push(tube([-0.22, g + 0.16, bz0 + 0.1 + k * 0.17], [0.22, g + 0.16, bz0 + 0.1 + k * 0.17], 0.006, chrome, 4));
  paint.push(cyl(0.02, 0.02, 2 * bx + 0.12, red, [0, y1 + 0.07, bz0 - 0.09], [0, 0, Math.PI / 2], 10));       // the handle
  metal.push(box(0.4, 0.02, 0.12, 0x6d737c, [0, g + 0.2, bz0 - 0.16]));                                      // the step at the back
  const group = meshGroup({ metal, paint });
  const wheels = [], steer = [];
  for (const [x, z, front] of [[0.22, bz1 - 0.02, true], [-0.22, bz1 - 0.02, true], [0.24, bz0, false], [-0.24, bz0, false]]) {
    const piv = new THREE.Group(); piv.position.set(x, g + 0.06, z);
    piv.add(meshGroup({ metal: [box(0.012, 0.07, 0.04, chrome, [0.025, 0.03, 0]), box(0.012, 0.07, 0.04, chrome, [-0.025, 0.03, 0])] }));
    const w = spinner([cyl(0.055, 0.055, 0.035, 0x1a1a1a, [0, 0, 0], [0, 0, Math.PI / 2], 12), cyl(0.03, 0.03, 0.04, 0x9aa0a8, [0, 0, 0], [0, 0, Math.PI / 2], 8)], 0.055);
    piv.add(w.m); group.add(piv); wheels.push(w);
    if (front) steer.push({ m: piv, k: 1.1 });
  }
  return { group, wheels, steer };
}

// ride-on mower: a green bonnet, a yellow seat on a frame, the cutting deck slung underneath,
// big rear wheels, small front ones that steer, and a steering wheel on a column
function buildMower(cfg, scheme) {
  const g = -cfg.rideHeight, body = scheme && scheme.body !== undefined && scheme.paintId !== 'stock' ? scheme.body : 0x3f9a3a;
  const yellow = 0xf2c230, dark = 0x26292e, paint = [], metal = [], rubber = [];
  paint.push(box(0.58, 0.3, 0.62, body, [0, g + 0.42, 0.42], [0.08, 0, 0], 0.06));        // bonnet
  paint.push(box(0.6, 0.12, 0.5, body, [0, g + 0.3, -0.1], [0, 0, 0], 0.03));              // floor pan
  paint.push(box(0.62, 0.22, 0.38, body, [0, g + 0.42, -0.42], [0, 0, 0], 0.05));          // rear body / fenders
  metal.push(box(0.9, 0.08, 0.6, dark, [0, g + 0.16, 0.05], [0, 0, 0], 0.03));             // cutting deck
  metal.push(box(0.6, 0.035, 0.3, 0x6d737c, [0, g + 0.37, 0.18]));                          // foot plate
  metal.push(box(0.05, 0.22, 0.05, dark, [0, g + 0.62, -0.32]));                            // seat post
  paint.push(box(0.42, 0.08, 0.36, yellow, [0, g + 0.74, -0.32], [0, 0, 0], 0.035));        // seat
  paint.push(box(0.42, 0.28, 0.07, yellow, [0, g + 0.9, -0.52], [-0.2, 0, 0], 0.035));      // seat back
  metal.push(cyl(0.025, 0.025, 0.42, dark, [0, g + 0.72, 0.18], [-0.55, 0, 0], 8));          // steering column
  paint.push(box(0.5, 0.06, 0.16, yellow, [0, g + 0.58, 0.72], [0.1, 0, 0], 0.02));          // front bumper stripe
  for (const sx of [1, -1]) metal.push(box(0.06, 0.05, 0.05, 0xfff2b0, [sx * 0.18, g + 0.5, 0.74])); // headlights
  const group = meshGroup({ paint, metal, rubber });
  const wheel = new THREE.Group(); wheel.position.set(0, g + 0.9, 0.06); wheel.rotation.x = -0.55;
  wheel.add(meshGroup({ rubber: [torus(0.13, 0.018, 0x1d1f24, [0, 0, 0], [Math.PI / 2, 0, 0], 8, 20)], metal: [box(0.24, 0.015, 0.02, dark), box(0.02, 0.015, 0.24, dark)] }));
  group.add(wheel);
  const wheels = [], steer = [{ m: wheel, k: -2.2, axis: 'y', local: true }];
  for (const [x, z, r, front] of [[0.36, 0.5, 0.15, true], [-0.36, 0.5, 0.15, true], [0.38, -0.42, 0.24, false], [-0.38, -0.42, 0.24, false]]) {
    const piv = new THREE.Group(); piv.position.set(x, g + r, z);
    const w = spinner([cyl(r, r, front ? 0.1 : 0.16, 0x1a1a1a, [0, 0, 0], [0, 0, Math.PI / 2], 16), cyl(r * 0.55, r * 0.55, (front ? 0.1 : 0.16) + 0.01, 0xd9d9d9, [0, 0, 0], [0, 0, Math.PI / 2], 12)], r);
    piv.add(w.m); group.add(piv); wheels.push(w);
    if (front) steer.push({ m: piv, k: 0.5 });
  }
  return { group, wheels, steer, wheel };
}

// skateboard: a deck with kicktails, two trucks and four little wheels; the deck tilts as you carve
function buildBoard(cfg, scheme) {
  const g = -cfg.rideHeight, deckCol = scheme && scheme.body !== undefined && scheme.paintId !== 'stock' ? scheme.body : 0xe0532b;
  const grip = 0x222428, paint = [], metal = [];
  paint.push(box(0.22, 0.018, 0.62, deckCol, [0, g + 0.11, 0], [0, 0, 0], 0.008));
  paint.push(box(0.22, 0.004, 0.62, grip, [0, g + 0.121, 0]));
  for (const sz of [1, -1]) {
    paint.push(box(0.22, 0.018, 0.16, deckCol, [0, g + 0.13, sz * 0.38], [sz * -0.35, 0, 0], 0.008));
    paint.push(box(0.22, 0.004, 0.16, grip, [0, g + 0.141, sz * 0.38], [sz * -0.35, 0, 0]));
    metal.push(box(0.05, 0.04, 0.05, 0x9aa0a8, [0, g + 0.08, sz * 0.22]), cyl(0.008, 0.008, 0.2, 0x9aa0a8, [0, g + 0.035, sz * 0.22], [0, 0, Math.PI / 2], 6));
  }
  const deck = meshGroup({ paint, metal });
  const group = new THREE.Group(); group.add(deck);
  const wheels = [];
  for (const [x, z] of [[0.09, 0.22], [-0.09, 0.22], [0.09, -0.22], [-0.09, -0.22]]) {
    const piv = new THREE.Group(); piv.position.set(x, g + 0.03, z);
    const w = spinner([cyl(0.03, 0.03, 0.035, 0xf4efe0, [0, 0, 0], [0, 0, Math.PI / 2], 12)], 0.03, 'paint');
    piv.add(w.m); deck.add(piv); wheels.push(w);
  }
  return { group, wheels, steer: [], deck };
}

// unicycle: one wheel, a fork up to the saddle, and cranks with pedals that turn with the wheel
const UNI_R = 0.27, UNI_CRANK = 0.12;
function buildUnicycle(cfg, scheme) {
  const g = -cfg.rideHeight, frame = scheme && scheme.body !== undefined && scheme.paintId !== 'stock' ? scheme.body : 0x2f6fe0;
  const group = new THREE.Group();
  const hub = new THREE.Group(); hub.position.set(0, g + UNI_R, 0); group.add(hub);
  const spokes = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; spokes.push(tube([0, 0, 0], [0, Math.sin(a) * (UNI_R - 0.03), Math.cos(a) * (UNI_R - 0.03)], 0.003, 0xc9ced6, 4)); }
  const w = { m: meshGroup({ rubber: [torus(UNI_R - 0.02, 0.025, 0x1a1a1a, [0, 0, 0], [0, Math.PI / 2, 0], 10, 32)], metal: [...spokes, cyl(0.03, 0.03, 0.06, 0x9aa0a8, [0, 0, 0], [0, 0, Math.PI / 2], 10)] }), r: UNI_R };
  hub.add(w.m);
  // cranks + pedals turn with the wheel too (they are on the axle)
  const cranks = new THREE.Group(); hub.add(cranks);
  cranks.add(meshGroup({ metal: [box(0.015, UNI_CRANK, 0.02, 0x9aa0a8, [0.06, UNI_CRANK / 2, 0]), box(0.015, UNI_CRANK, 0.02, 0x9aa0a8, [-0.06, -UNI_CRANK / 2, 0]),
    box(0.07, 0.015, 0.05, 0x1d1f24, [0.1, UNI_CRANK, 0]), box(0.07, 0.015, 0.05, 0x1d1f24, [-0.1, -UNI_CRANK, 0])] }));
  group.add(meshGroup({
    paint: [tube([0.045, g + UNI_R, 0], [0.04, g + 0.72, 0], 0.014, frame, 8), tube([-0.045, g + UNI_R, 0], [-0.04, g + 0.72, 0], 0.014, frame, 8), box(0.1, 0.03, 0.05, frame, [0, g + 0.73, 0])],
    metal: [cyl(0.016, 0.016, 0.2, 0xc9ced6, [0, g + 0.83, 0], [0, 0, 0], 8)],
    rubber: [box(0.12, 0.05, 0.28, 0x1d1f24, [0, g + 0.95, -0.01], [0, 0, 0], 0.025)],
  }));
  return { group, wheels: [w], steer: [], cranks };
}

// where each model's exhaust comes out, in the model file's own space (x forward, y up from the
// ground, z across), and which way the pipe points. Found by eye on each model (the silencer tip),
// so a backfire flash comes out of the real pipe on every variant that shares the model.
const EXHAUST = {
  bike: { p: [-0.72, 0.86, 0.08], d: [-1, 0.06, 0] },
  q_atv250: { p: [-0.766, 0.64, -0.18], d: [-1, 0, 0] },
  q_atv450: { p: [-0.852, 0.72, -0.21], d: [-1, 0, 0] },
  q_atv450w: { p: [-0.758, 0.68, -0.2], d: [-1, 0, 0] },
  q_atv700: { p: [-0.944, 0.82, -0.22], d: [-1, 0, 0] },
  q_atv1000: { p: [-0.942, 0.85, -0.21], d: [-1, 0, 0] },
  utv: { p: [-1.725, 1.12, -0.38], d: [-0.8, 0.6, 0] },
  sxs: { p: [-1.67, 0.55, -0.22], d: [-0.9, -0.4, 0] },
};
EXHAUST.utvr = EXHAUST.utvbaja = EXHAUST.utv;
EXHAUST.supermoto = EXHAUST.bike;
EXHAUST.q_venomx = { p: [-0.88, 0.74, 0.2], d: [-1, 0.05, 0] }; // twin pipes: the left one
EXHAUST.sxs_up = EXHAUST.sxs_race = EXHAUST.sxs;
const _ex = new THREE.Vector3();

export class VehicleVisual {
  constructor(def, scheme, number = 1) {
    this.def = def;
    this.cfg = prepareVehicle(def);
    this.scheme = scheme;
    this.root = new THREE.Group();          // follows the physics body (CoM)
    this.ground = new THREE.Group();        // pivot at the ground for leaning
    this.lean = new THREE.Group();
    this.model = new THREE.Group();         // vehicle-local space (origin = CoM)
    this.root.add(this.ground); this.ground.add(this.lean); this.lean.add(this.model);
    this.ground.position.y = -this.cfg.rideHeight;
    this.model.position.y = this.cfg.rideHeight;
    this.attach = {
      seat: new THREE.Vector3(), gripL: new THREE.Vector3(), gripR: new THREE.Vector3(),
      pegL: new THREE.Vector3(), pegR: new THREE.Vector3(),
    };
    this.isBike = this.cfg.type === 'bike';
    this.seated = this.cfg.type === 'car';
    this.usingGLB = false;
    // special vehicles (vehicles.js SPECIAL_VEHICLES): the crawler has no vehicle at all, the
    // office chair is built here; the rider pose for each is in rider.js
    this.special = def.special || null;
    if (this.special) {
      this.seated = false; this.isBike = false; this.camDist = 0;
      if (this.special === 'chair') { this.chair = buildChair(this.cfg, scheme); this.model.add(this.chair); }
      const build = { cart: buildCart, mower: buildMower, board: buildBoard, unicycle: buildUnicycle }[this.special];
      if (build) { this.spec = build(this.cfg, scheme); this.model.add(this.spec.group); this.crank = 0; }
      return;
    }
    // the real 3D model (see modelRig.js); the built-in model is only a fallback
    this.inst = createModelInstance(this.cfg.modelKey, scheme);
    if (this.inst) {
      this.M = MODELS[this.cfg.modelKey];
      const c = new THREE.Group();
      c.rotation.y = -Math.PI / 2;                     // model faces +x, the game faces +z
      c.position.set(0, -this.cfg.rideHeight, -this.M.comX);
      c.add(this.inst.root);
      this.model.add(c);
      this.container = c;
      this.usingGLB = true;
      this.camDist = 0;
    } else if (this.cfg.type !== 'car') this.buildPlaceholder(number);
  }

  buildPlaceholder(number) {
    const key = this.def.id + ':' + this.scheme.id;
    let parts = placeholderCache.get(key);
    if (!parts) {
      parts = this.isBike ? buildBike(this.cfg, this.scheme, number) : buildAtv(this.cfg, this.scheme);
      placeholderCache.set(key, parts);
    }
    this.parts = parts;
    const P = parts;
    this.placeholder = new THREE.Group();
    this.model.add(this.placeholder);
    if (this.isBike) {
      this.placeholder.add(cloneGroup(P.chassis));
      // steering pivot sits at the top clamp, rotates about the fork axis
      this.steerPivot = new THREE.Group();
      this.steerPivot.position.copy(P.head);
      this.placeholder.add(this.steerPivot);
      this.steerPivot.add(cloneGroup(P.steer));
      this.forkLower = new THREE.Group();
      this.steerPivot.add(this.forkLower);
      this.forkLower.add(cloneGroup(P.forkLower));
      this.forkRest = 0.92; // top clamp -> axle at rest
      this.forkLower.position.copy(P.forkDir).multiplyScalar(0.54);
      this.frontWheel = cloneGroup(P.frontWheel);
      this.frontWheelHolder = new THREE.Group();
      this.steerPivot.add(this.frontWheelHolder);
      this.frontWheelHolder.add(this.frontWheel);
      this.swingarm = new THREE.Group();
      this.swingarm.position.copy(P.pivot);
      this.placeholder.add(this.swingarm);
      this.swingarm.add(cloneGroup(P.swingarm));
      this.rearWheel = cloneGroup(P.rearWheel);
      this.rearWheel.position.set(0, 0, -P.armLen);
      this.swingarm.add(this.rearWheel);
    } else {
      this.placeholder.add(cloneGroup(P.chassis));
      this.steerPivot = new THREE.Group();
      this.steerPivot.position.set(0, 0.36, 0.36);
      this.steerPivot.rotation.x = -0.25;
      this.placeholder.add(this.steerPivot);
      this.steerPivot.add(cloneGroup(P.steer));
      this.atvWheels = this.cfg.wheels.map((w, i) => {
        const holder = new THREE.Group();
        const steer = new THREE.Group();
        const spin = cloneGroup(i < 2 ? P.wheelsF[i] : P.wheelsR[i - 2]);
        holder.add(steer); steer.add(spin);
        holder.position.set(w.x + Math.sign(w.x) * 0.02, P.restY(w), w.z);
        this.placeholder.add(holder);
        return { holder, steer, spin };
      });
      this.axle = cloneGroup(P.axle);
      this.placeholder.add(this.axle);
      this.arms = [0, 1].map(() => [cloneGroup(P.arm), cloneGroup(P.arm)]);
      for (const a of this.arms) for (const m of a) this.placeholder.add(m);
      this.shocks = [0, 1].map(() => cloneGroup(P.shock));
      for (const s of this.shocks) this.placeholder.add(s);
    }
  }

  // Swap the placeholder for the player's GLB model (if one is available)
  async tryLoadModel() {
    if (this.inst || this.seated) return true;
    if (this.special || !this.def.model) return false; // specials (crawler, chair...) have no model file
    const gltf = await loadGLB(this.def.model);
    if (!gltf) return false;
    try {
      this.integrateGLB(gltf.scene);
      return true;
    } catch (e) {
      console.warn('Model integration failed, keeping placeholder:', e);
      return false;
    }
  }

  integrateGLB(src) {
    const scene = src.clone(true);
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nodes = [];
    scene.traverse((o) => nodes.push(o));
    const find = (tests) => nodes.find((o) => tests.some((t) => t.test(norm(o.name))));
    const isBike = this.isBike;
    const wheelNodes = isBike
      ? { f: find([/^wheelf/, /wheelfront/, /frontwheel/, /fwheel/, /tirefront/, /fronttire/]), r: find([/^wheelr/, /wheelrear/, /rearwheel/, /wheelback/, /backwheel/, /rwheel/, /tirerear/, /reartire/]) }
      : {
        fl: find([/wheelfl/, /flwheel/, /wheelfrontleft/, /frontleftwheel/, /wheelleftfront/]),
        fr: find([/wheelfr$/, /wheelfr[^o]/, /frwheel/, /wheelfrontright/, /frontrightwheel/, /wheelrightfront/]),
        rl: find([/wheelrl/, /rlwheel/, /wheelrearleft/, /rearleftwheel/, /wheelbackleft/, /wheelleftrear/]),
        rr: find([/wheelrr/, /rrwheel/, /wheelrearright/, /rearrightwheel/, /wheelbackright/, /wheelrightrear/]),
      };
    const steerNode = find([/handlebar/, /handle/, /steer/, /^bars?$/]);
    const forkNode = isBike ? find([/forklower/, /^fork/, /frontfork/]) : null;
    const swingNode = isBike ? find([/swingarm/, /swing/]) : null;

    scene.updateMatrixWorld(true);
    const centre = (o) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    const size = (o) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
    const W = this.cfg.wheels;
    let fwd, scale, offset;
    const haveWheels = isBike ? wheelNodes.f && wheelNodes.r : wheelNodes.fl && wheelNodes.fr && wheelNodes.rl && wheelNodes.rr;
    const holder = new THREE.Group();
    holder.add(scene);
    if (haveWheels) {
      const cF = isBike ? centre(wheelNodes.f) : centre(wheelNodes.fl).add(centre(wheelNodes.fr)).multiplyScalar(0.5);
      const cR = isBike ? centre(wheelNodes.r) : centre(wheelNodes.rl).add(centre(wheelNodes.rr)).multiplyScalar(0.5);
      fwd = cF.clone().sub(cR); fwd.y = 0;
      const wbModel = fwd.length();
      scale = this.cfg.wheelbase / wbModel;
      // rotate so the model's front points along +z
      const yaw = Math.atan2(fwd.x, fwd.z);
      scene.rotation.y = -yaw;
      scene.scale.setScalar(scale);
      scene.updateMatrixWorld(true);
      const nF = isBike ? centre(wheelNodes.f) : centre(wheelNodes.fl).add(centre(wheelNodes.fr)).multiplyScalar(0.5);
      const restY = (w) => w.y - (w.travel - w.sag * w.travel);
      const target = new THREE.Vector3(0, restY(W[0]), W[0].z);
      offset = target.sub(nF);
      scene.position.add(offset);
      scene.updateMatrixWorld(true);
    } else {
      // no named wheels: fit the whole model to the expected length and sit it on the ground
      const s = size(scene);
      const len = Math.max(s.x, s.z);
      scale = (isBike ? 2.15 : 1.9) / len;
      if (s.x > s.z) scene.rotation.y = Math.PI / 2;
      scene.scale.setScalar(scale);
      scene.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(scene);
      const c = bb.getCenter(new THREE.Vector3());
      scene.position.set(-c.x, -this.cfg.rideHeight - bb.min.y, -c.z);
    }
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) if (m && /paint|body|plastic|color|colour|livery/i.test(m.name || '')) { m.color = new THREE.Color(this.scheme.body); }
      }
    });
    // build spin / steer pivots around the named parts
    const pivotAt = (node, parent) => {
      const p = new THREE.Group();
      parent.add(p);
      p.updateMatrixWorld(true);
      const c = centre(node);
      p.parent.updateMatrixWorld(true);
      p.position.copy(p.parent.worldToLocal(c.clone()));
      p.updateMatrixWorld(true);
      p.attach(node);
      return p;
    };
    this.model.add(holder);
    this.model.updateMatrixWorld(true);
    this.glb = { holder, scene, haveWheels };
    if (haveWheels) {
      this.placeholder.visible = false;
      if (isBike) {
        this.glb.front = pivotAt(wheelNodes.f, this.model);
        this.glb.rear = pivotAt(wheelNodes.r, this.model);
        this.glb.frontRest = this.glb.front.position.clone();
        this.glb.rearRest = this.glb.rear.position.clone();
        if (steerNode && steerNode !== wheelNodes.f) { this.glb.steer = pivotAt(steerNode, this.model); }
        if (forkNode) { this.glb.fork = forkNode; this.glb.forkRest = forkNode.position.clone(); }
        if (swingNode) { this.glb.swing = swingNode; }
      } else {
        this.glb.wheels = ['fl', 'fr', 'rl', 'rr'].map((k) => {
          const p = pivotAt(wheelNodes[k], this.model);
          return { pivot: p, rest: p.position.clone() };
        });
        if (steerNode) this.glb.steer = pivotAt(steerNode, this.model);
      }
    } else {
      // keep the placeholder's wheels / forks / bars, hide its body
      this.placeholder.children[0].visible = false;
    }
    this.usingGLB = true;
  }

  // the exhaust tip and the way it points, in world space, following the drawn vehicle (its lean
  // and where it is drawn this frame). False when there is no exhaust (specials, the electric bike)
  exhaust(outPos, outDir) {
    const E = EXHAUST[this.cfg.modelKey];
    if (!E || !this.container || this.special) return false;
    this.container.updateWorldMatrix(true, false);
    outPos.fromArray(E.p).applyMatrix4(this.container.matrixWorld);
    outDir.fromArray(E.d).transformDirection(this.container.matrixWorld);
    return true;
  }

  // state: { lean, steer, wheels:[{comp, spin, steer}], crashed }
  update(state) {
    if (this.special) {
      // the chair turns a little under the rider as you steer; the crawler has nothing to move
      if (this.chair) this.chair.rotation.y = -(state.steer || 0) * 0.35;
      this.lean.rotation.z = 0;
      const S = this.spec;
      if (S) {
        // wheels roll with the physics wheels (scaled to their own size), steering parts turn
        const w0 = state.wheels && state.wheels[2] ? state.wheels[2] : state.wheels && state.wheels[0];
        const ang = w0 ? w0.spin * (this.cfg.wheels[2] ? this.cfg.wheels[2].r : 0.26) : 0; // metres rolled
        for (const w of S.wheels) w.m.rotation.x = ang / w.r;
        for (const p of S.steer) p.m.rotation[p.axis || 'y'] = (state.steer || 0) * p.k;
        if (S.deck) S.deck.rotation.z = -(state.steer || 0) * 0.25;                    // carving: the deck tilts
        if (S.cranks) { S.cranks.rotation.x = 0; this.crank = ang / UNI_R; }        // the cranks are on the hub already
      }
      return;
    }
    if (this.inst) return this.updateRigged(state);
    const cfg = this.cfg;
    this.lean.rotation.z = this.isBike ? -state.lean : 0;
    const A = this.attach;
    if (this.isBike) {
      const [wf, wr] = cfg.wheels;
      const extF = wf.travel - state.wheels[0].comp, extR = wr.travel - state.wheels[1].comp;
      const restF = wf.travel - wf.sag * wf.travel, restR = wr.travel - wr.sag * wr.travel;
      // front: steer about the fork axis, slide the lowers along it
      const P = this.parts;
      const axis = P.forkDir;
      this.steerPivot.quaternion.setFromAxisAngle(_v.copy(axis).negate(), state.steer * 1.0);
      const slide = (extF - restF) / Math.cos(P.rake);
      this.forkLower.position.copy(axis).multiplyScalar(0.54 + slide);
      this.frontWheelHolder.position.copy(axis).multiplyScalar(0.92 + slide);
      this.frontWheel.rotation.x = state.wheels[0].spin;
      // rear: swingarm points at the axle
      const axY = wr.y - extR, axZ = wr.z;
      const ang = Math.atan2(axY - P.pivot.y, -(axZ - P.pivot.z));
      this.swingarm.rotation.x = ang;
      this.rearWheel.rotation.x = state.wheels[1].spin;
      // attachment points (vehicle-local, before lean)
      A.seat.set(0, 0.2, -0.22);
      A.pegL.set(0.18, -0.36, -0.12); A.pegR.set(-0.18, -0.36, -0.12);
      const gL = _v.set(0.36, 0.125, -0.055).applyQuaternion(this.steerPivot.quaternion).add(P.head);
      A.gripL.copy(gL);
      const gR = _v.set(-0.36, 0.125, -0.055).applyQuaternion(this.steerPivot.quaternion).add(P.head);
      A.gripR.copy(gR);
      if (this.usingGLB && this.glb.haveWheels) {
        const g = this.glb;
        g.front.position.copy(g.frontRest); g.front.position.y += restF - extF;
        g.front.rotation.set(state.wheels[0].spin, 0, 0);
        g.rear.position.copy(g.rearRest); g.rear.position.y += restR - extR;
        g.rear.rotation.set(state.wheels[1].spin, 0, 0);
        if (g.steer) g.steer.rotation.y = state.steer;
        if (g.fork && g.forkRest) { g.fork.position.copy(g.forkRest); }
      }
    } else {
      const P = this.parts;
      const W = cfg.wheels;
      this.steerPivot.rotation.y = state.steer * 0.9;
      this.atvWheels.forEach((w, i) => {
        const c = W[i];
        const ext = c.travel - state.wheels[i].comp;
        w.holder.position.y = c.y - ext;
        w.steer.rotation.y = state.wheels[i].steer || 0;
        w.spin.rotation.x = state.wheels[i].spin;
      });
      // rear axle sits between the two rear wheels
      const yl = this.atvWheels[2].holder.position.y, yr = this.atvWheels[3].holder.position.y;
      this.axle.position.set(0, (yl + yr) / 2, W[2].z);
      this.axle.rotation.z = Math.atan2(yl - yr, W[2].x - W[3].x);
      // front a-arms + shocks
      for (let k = 0; k < 2; k++) {
        const wh = this.atvWheels[k].holder.position;
        const sx = Math.sign(W[k].x);
        for (let j = 0; j < 2; j++) {
          const from = _v.set(sx * 0.18, -0.24 + j * 0.12, W[k].z + (j ? -0.05 : 0.05));
          const to = _v2.set(wh.x - sx * 0.12, wh.y + (j ? 0.06 : -0.04), wh.z);
          const arm = this.arms[k][j];
          arm.position.copy(from);
          arm.scale.set(1, 1, from.distanceTo(to));
          arm.quaternion.setFromUnitVectors(_z, _v4.subVectors(to, from).normalize());
        }
        const sh = this.shocks[k];
        const top = _v.set(sx * 0.15, 0.08, W[k].z - 0.05), bot = _v2.set(wh.x - sx * 0.14, wh.y + 0.04, wh.z);
        sh.position.copy(bot);
        sh.quaternion.setFromUnitVectors(_y, _v4.subVectors(top, bot).normalize());
        sh.scale.set(1, top.distanceTo(bot), 1);
      }
      A.seat.set(0, 0.36, -0.28);
      A.pegL.set(0.38, -0.27, -0.02); A.pegR.set(-0.38, -0.27, -0.02);
      const sq = this.steerPivot.quaternion, sp = this.steerPivot.position;
      A.gripL.set(0.4, 0.075, -0.05).applyQuaternion(sq).add(sp);
      A.gripR.set(-0.4, 0.075, -0.05).applyQuaternion(sq).add(sp);
      if (this.usingGLB && this.glb.haveWheels) {
        this.glb.wheels.forEach((w, i) => {
          const c = W[i];
          const ext = c.travel - state.wheels[i].comp, rest = c.travel - c.sag * c.travel;
          w.pivot.position.copy(w.rest); w.pivot.position.y += rest - ext;
          w.pivot.rotation.set(state.wheels[i].spin, state.wheels[i].steer || 0, 0, 'YXZ');
        });
        if (this.glb.steer) this.glb.steer.rotation.y = state.steer * 0.9;
      }
    }
  }

  // model point (model space) -> vehicle space, for the rider's hands / feet / seat
  mv(p, out) { return out.set(-p[2], p[1] - this.cfg.rideHeight, p[0] - this.M.comX); }

  updateRigged(state) {
    this.lean.rotation.z = this.isBike ? -state.lean : 0;
    updateModelInstance(this.inst, state, this.cfg, this.camDist);
    const A = this.attach, M = this.M, at = M.attach, meta = this.inst.meta;
    this.mv(at.seat, A.seat);
    this.mv(at.pegL, A.pegL); this.mv(at.pegR, A.pegR);
    // hands follow the bars / steering wheel as they turn
    const turn = (p, pivotP, axis, ang, out) => {
      _v.set(p[0] - pivotP[0], p[1] - pivotP[1], p[2] - pivotP[2]).applyAxisAngle(_v2.fromArray(axis), ang);
      return this.mv([_v.x + pivotP[0], _v.y + pivotP[1], _v.z + pivotP[2]], out);
    };
    if (M.steerWheel) {
      turn(at.gripL, M.wheelCentre, meta.wheelAxis, -wheelTurn(state), A.gripL);
      turn(at.gripR, M.wheelCentre, meta.wheelAxis, -wheelTurn(state), A.gripR);
    } else {
      const up = [-meta.axisDown[0], -meta.axisDown[1], -meta.axisDown[2]];
      const ang = this.isBike ? state.steer : barTurn(state); // quad hands stay on the bars as they turn
      turn(at.gripL, M.steerPivot, up, ang, A.gripL);
      turn(at.gripR, M.steerPivot, up, ang, A.gripR);
    }
  }

  dispose() {
    this.root.removeFromParent();
    // geometry/material are shared through the caches; only GLB clones own nothing extra
  }
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1), _y = new THREE.Vector3(0, 1, 0);
