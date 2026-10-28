// =====================================================================
//  MODEL RIG - turns the 4 vehicle .glb files into animated vehicles.
//
//  For each model (see MODELS in shared/vehicles.js) this finds the named
//  parts and builds a small rig of pivots, all in the model's own space
//  (+x forward, +y up, +z right):
//    wheels spin about their axle, front wheels steer, suspension moves
//    the wheel up and down, A-arms / trailing arms / swingarm swing to
//    follow it, shocks stretch and squash, forks slide, bars / steering
//    wheel turn, and paint materials get the chosen colours.
//
//  To keep it fast: all the parts that move together are merged into one
//  mesh per material (dozens of draw calls -> a handful), and every mesh
//  gets a simplified copy that is used when the vehicle is far away.
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../../vendor/addons/libs/meshopt_decoder.module.js';
import { MeshoptSimplifier } from '../../vendor/addons/libs/meshopt_simplifier.module.js';
import { mergeGeometries } from '../../vendor/addons/utils/BufferGeometryUtils.js';
import { MODELS } from '/shared/vehicles.js';

const templates = new Map(); // model key -> template
const loMap = new WeakMap();  // full-detail geometry -> simplified geometry
const paintCache = new Map();
const LOD_DIST = 45;          // metres: beyond this the simplified meshes are used

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// ---------------------------------------------------------------- loading
function loadOne(key) { return loadFile(MODELS[key].file); }

function loadFile(file) {
  const M = { file };
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  // the single-file build embeds the models; otherwise fetch them
  const embedded = window.__MX_MODELS && window.__MX_MODELS[M.file];
  const url = embedded ? 'data:model/gltf-binary;base64,' + embedded : M.file;
  return new Promise((resolve) => {
    loader.load(url, (g) => resolve(g), undefined, (e) => { console.warn('Model failed to load:', M.file, e); resolve(null); });
  });
}

export async function preloadModels(onProgress = () => {}) {
  await MeshoptSimplifier.ready;
  const keys = Object.keys(MODELS);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (templates.has(k)) continue;
    onProgress(`Loading ${k} (${i + 1}/${keys.length})...`);
    const g = await loadOne(k);
    if (g) {
      try { templates.set(k, buildTemplate(k, g.scene)); }
      catch (e) { console.warn('Model rig failed for', k, e); }
    }
  }
  if (!helmet) {
    onProgress('Loading rider gear...');
    const g = await loadFile(HELMET_FILE);
    if (g) { try { helmet = buildHelmet(g.scene); } catch (e) { console.warn('Helmet failed', e); } }
  }
  return templates;
}

// ---------------------------------------------------------------- rider helmet
// The helmet model sits on the rider's head bone (y up, z towards the face):
// scaled to 30 cm wide, turned to face +z, back of the shell just behind the neck.
// The shell is marked magenta in its texture; helmetMaterial swaps that for
// each rider's jersey colour, keeping the trim, vents and goggles.
const HELMET_FILE = 'models/rider_helmet.glb';
let helmet = null;
function buildHelmet(root) {
  root.updateMatrixWorld(true);
  let mesh = null;
  root.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  const g = mesh.geometry.clone();
  g.applyMatrix4(mesh.matrixWorld);
  g.rotateY(Math.PI); // the model faces -z
  g.computeBoundingBox();
  const b = g.boundingBox;
  const s = 0.3 / (b.max.x - b.min.x);
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -b.min.z);
  g.scale(s, s, s);
  g.translate(0, -0.035, -0.175);
  const map = mesh.material.map;
  return { geometry: g, image: map ? map.image : null, flipY: map ? map.flipY : false };
}
export function helmetModel() { return helmet; }

const helmetMats = new Map();
export function helmetMaterial(tint) {
  if (!helmet) return null;
  if (helmetMats.has(tint)) return helmetMats.get(tint);
  const opts = { vertexColors: !!helmet.geometry.attributes.color, roughness: 0.38, metalness: 0.05, envMapIntensity: 0.8 };
  let mat;
  if (helmet.image) {
    const c = document.createElement('canvas');
    c.width = helmet.image.width; c.height = helmet.image.height;
    const x = c.getContext('2d');
    x.drawImage(helmet.image, 0, 0);
    // swap the magenta key (the shell) for the rider's colour
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255;
    for (let i = 0; i < p.length; i += 4) {
      const k = Math.min(p[i], p[i + 2]) - p[i + 1]; // how magenta this pixel is (0..255)
      if (k > 60) { const t = Math.min(1, (k - 60) / 150); p[i] += (tr - p[i]) * t; p[i + 1] += (tg - p[i + 1]) * t; p[i + 2] += (tb - p[i + 2]) * t; }
    }
    x.putImageData(d, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.flipY = helmet.flipY;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    mat = new THREE.MeshStandardMaterial({ map: tex, ...opts });
  } else mat = new THREE.MeshStandardMaterial({ color: tint, ...opts });
  helmetMats.set(tint, mat);
  return mat;
}

export function hasModel(key) { return templates.has(key); }

// ---------------------------------------------------------------- building
function boxOf(obj) { return new THREE.Box3().setFromObject(obj); }

// put `node` (keeping where it is in the world) under a new pivot group at `at`
function pivot(name, node, parent, at) {
  const g = new THREE.Group();
  g.name = name;
  parent.add(g);
  parent.updateMatrixWorld(true);
  g.position.copy(parent.worldToLocal(at.clone()));
  g.updateMatrixWorld(true);
  if (node) g.attach(node);
  return g;
}

// shocks: a pivot at the top mount whose local +Y runs down the shock, so
// scaling Y squashes it and turning it follows the bottom mount
function shockPivot(name, node, parent, meta) {
  const b = boxOf(node);
  const kids = node.children.map((c) => ({ c, box: boxOf(c) }));
  const body = kids.find((k) => /body/.test(k.c.name)) || kids[0];
  const shaft = kids.find((k) => /shaft/.test(k.c.name)) || kids[kids.length - 1];
  const dir = body.box.getCenter(new THREE.Vector3()).sub(shaft.box.getCenter(new THREE.Vector3()));
  if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
  dir.normalize(); // points up the shock (towards the top mount)
  const corners = [];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const c = b.getCenter(new THREE.Vector3());
  let hi = -1e9, lo = 1e9;
  for (const p of corners) { const d = p.clone().sub(c).dot(dir); hi = Math.max(hi, d); lo = Math.min(lo, d); }
  const top = c.clone().addScaledVector(dir, hi), bottom = c.clone().addScaledVector(dir, lo);
  const g = new THREE.Group();
  g.name = name;
  parent.add(g);
  parent.updateMatrixWorld(true);
  g.position.copy(parent.worldToLocal(top.clone()));
  const down = bottom.clone().sub(top);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), down.clone().normalize());
  g.updateMatrixWorld(true);
  g.attach(node);
  meta[name] = { top: top.toArray(), bottom: bottom.toArray(), len: down.length(), q0: g.quaternion.toArray() };
  return g;
}

function toFloatGeometry(geo) {
  const out = new THREE.BufferGeometry();
  const p = geo.attributes.position, n = geo.attributes.normal;
  const pos = new Float32Array(p.count * 3), nor = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    pos[i * 3] = p.getX(i); pos[i * 3 + 1] = p.getY(i); pos[i * 3 + 2] = p.getZ(i);
    if (n) { nor[i * 3] = n.getX(i); nor[i * 3 + 1] = n.getY(i); nor[i * 3 + 2] = n.getZ(i); }
  }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const idx = geo.index ? Uint32Array.from(geo.index.array) : Uint32Array.from({ length: p.count }, (_, i) => i);
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  if (!n) out.computeVertexNormals();
  return out;
}

// merge every mesh that belongs to this rig group (not to a child rig group)
function mergeGroup(group) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const byMat = new Map();
  const remove = [];
  const visit = (o) => {
    for (const c of o.children) {
      if (c !== group && c.name && c.name.startsWith('rig_')) continue; // its own group handles it
      if (c.isMesh) {
        const g = toFloatGeometry(c.geometry);
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
        const m = Array.isArray(c.material) ? c.material[0] : c.material;
        if (!byMat.has(m)) byMat.set(m, []);
        byMat.get(m).push(g);
        remove.push(c);
      }
      visit(c);
    }
  };
  visit(group);
  for (const c of remove) c.removeFromParent();
  for (const [mat, list] of byMat) {
    const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'merged_' + (mat.name || 'mat');
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    loMap.set(geo, simplify(geo));
  }
}

function simplify(geo) {
  const idx = geo.index.array;
  if (idx.length < 600) return geo;
  const pos = geo.attributes.position.array;
  const target = Math.max(60, Math.floor((idx.length / 3) * 0.2) * 3);
  try {
    const [out] = MeshoptSimplifier.simplify(new Uint32Array(idx), pos, 3, target, 0.02, ['LockBorder']);
    if (!out || out.length < 3) return geo;
    const lo = new THREE.BufferGeometry();
    lo.setAttribute('position', geo.attributes.position);
    lo.setAttribute('normal', geo.attributes.normal);
    lo.setIndex(new THREE.BufferAttribute(out, 1));
    lo.boundingSphere = geo.boundingSphere;
    return lo;
  } catch { return geo; }
}

function buildTemplate(key, scene) {
  const M = MODELS[key];
  const root = new THREE.Group();
  root.name = 'rig_root';
  root.add(scene);
  root.updateMatrixWorld(true);
  const find = (n) => root.getObjectByName(n); // parts move into rig groups as we go, so search everything
  const meta = { key };
  const groups = [root];
  const centre = (o) => boxOf(o).getCenter(new THREE.Vector3());

  if (M.kind === 'bike') {
    // front end: steers about the fork axis; the lowers slide along it
    const axisDown = V(M.steerAxisTo).sub(V(M.steerPivot)).normalize();
    meta.axisDown = axisDown.toArray();
    const steer = pivot('rig_steer', find(M.steerGroup), root, V(M.steerPivot));
    const fork = pivot('rig_fork', find(M.forkSlide), steer, V(M.steerPivot));
    const wf = find(M.wheelF);
    const spinF = pivot('rig_spin_front', wf, fork, centre(wf));
    // rear: swingarm swings at its pivot and carries the rear wheel
    const swing = pivot('rig_swing', find(M.swingarm), root, V(M.swingPivot));
    const wr = find(M.wheelR);
    const spinR = pivot('rig_spin_rear', wr, swing, centre(wr));
    meta.swingLen = V(M.swingPivot).distanceTo(centre(wr));
    if (M.shock && find(M.shock)) groups.push(shockPivot('rig_shock_rear', find(M.shock), root, meta));
    groups.push(steer, fork, spinF, swing, spinR);
  } else {
    if (M.steerGroup) {
      const axisDown = V(M.steerAxisTo).sub(V(M.steerPivot)).normalize();
      meta.axisDown = axisDown.toArray();
      groups.push(pivot('rig_steer', find(M.steerGroup), root, V(M.steerPivot)));
    }
    if (M.steerWheel) {
      meta.wheelAxis = V(M.wheelAxisTo).sub(V(M.wheelCentre)).normalize().toArray();
      groups.push(pivot('rig_wheel', find(M.steerWheel), root, V(M.wheelCentre)));
    }
    for (const [id, C] of Object.entries(M.corners)) {
      const wheel = find(C.wheel);
      const wc = centre(wheel);
      const carrier = pivot('rig_carrier_' + id, null, root, wc);
      const steerG = pivot('rig_steer_' + id, null, carrier, wc);
      for (const n of C.carry || []) { const o = find(n); if (o) (C.steer && /knuckle/.test(n) ? steerG : carrier).attach(o); }
      const spin = pivot('rig_spin_' + id, wheel, steerG, wc);
      groups.push(carrier, steerG, spin);
      meta['wc_' + id] = wc.toArray();
      (C.arms || []).forEach((n, k) => {
        const o = find(n);
        if (!o) return;
        const b = boxOf(o), side = Math.sign(wc.z) || 1;
        const inner = new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, side > 0 ? b.min.z : b.max.z);
        const g = pivot(`rig_arm_${id}_${k}`, o, root, inner);
        meta[g.name] = { len: Math.abs(b.max.z - b.min.z), side };
        groups.push(g);
      });
      if (C.trailing) {
        const o = find(C.trailing);
        const b = boxOf(o);
        const front = new THREE.Vector3(b.max.x, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
        const g = pivot('rig_trail_' + id, o, root, front);
        meta[g.name] = { len: Math.max(0.3, front.x - wc.x) };
        groups.push(g);
      }
      (C.shocks || []).forEach((n, k) => { const o = find(n); if (o) groups.push(shockPivot(`rig_shock_${id}_${k}`, o, root, meta)); });
    }
    if (M.rearAxle) {
      const A = M.rearAxle;
      const sw = pivot('rig_axle', find(A.group), root, V(A.pivot));
      groups.push(sw);
      A.wheels.forEach((n, k) => {
        const w = find(n); const wc = centre(w);
        const id = k === 0 ? 'rl' : 'rr';
        meta['wc_' + id] = wc.toArray();
        groups.push(pivot('rig_spin_' + id, w, sw, wc));
      });
      meta.axleLen = V(A.pivot).distanceTo(V(meta.wc_rl));
      if (A.shock && find(A.shock)) groups.push(shockPivot('rig_shock_rear', find(A.shock), root, meta));
    }
  }
  // merge everything that moves together, deepest groups first
  for (const g of groups.reverse()) mergeGroup(g);
  // drop now-empty nodes from the original scene
  const prune = (o) => { for (const c of [...o.children]) { prune(c); if (!c.isMesh && !c.name.startsWith('rig_') && c.children.length === 0) c.removeFromParent(); } };
  prune(root);
  let draws = 0, tris = 0;
  root.traverse((o) => { if (o.isMesh) { draws++; tris += o.geometry.index.count / 3; } });
  meta.draws = draws; meta.tris = tris | 0;
  return { root, meta, M };
}

// ---------------------------------------------------------------- instances
function paintMaterial(base, color, key) {
  const k = base.uuid + ':' + color;
  if (!paintCache.has(k)) {
    const m = base.clone();
    m.color = new THREE.Color(color);
    paintCache.set(k, m);
  }
  return paintCache.get(k);
}

// a ready-to-animate copy of a model in the given paint
export function createModelInstance(key, scheme) {
  const T = templates.get(key);
  if (!T) return null;
  const root = T.root.clone(true);
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.material.name;
    if (T.M.paint.includes(n)) o.material = paintMaterial(o.material, scheme.body, key);
    else if (T.M.accent.includes(n)) o.material = paintMaterial(o.material, scheme.accent, key);
    meshes.push({ mesh: o, hi: o.geometry, lo: loMap.get(o.geometry) || o.geometry });
  });
  const get = (n) => root.getObjectByName(n);
  const inst = { key, root, meta: T.meta, M: T.M, meshes, lod: false, groups: {} };
  root.traverse((o) => { if (o.name && o.name.startsWith('rig_')) inst.groups[o.name] = o; });
  inst.rest = {};
  for (const [n, g] of Object.entries(inst.groups)) inst.rest[n] = { p: g.position.clone(), q: g.quaternion.clone() };
  void get;
  return inst;
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);

// state: { steer, wheels: [{comp, spin, steer}] }  cfg: prepared vehicle config
export function updateModelInstance(inst, state, cfg, camDist = 0) {
  const G = inst.groups, R = inst.rest, meta = inst.meta;
  // level of detail
  const lod = camDist > LOD_DIST;
  if (lod !== inst.lod) {
    inst.lod = lod;
    for (const m of inst.meshes) { m.mesh.geometry = lod ? m.lo : m.hi; m.mesh.castShadow = !lod; }
  }
  const W = cfg.wheels;
  const dy = (i) => {
    const w = W[i];
    return state.wheels[i].comp - w.sag * w.travel; // + = wheel pushed up into the body
  };
  const shock = (name, lift) => {
    const g = G[name]; if (!g) return;
    const m = meta[name];
    const top = _a.fromArray(m.top), bot = _b.fromArray(m.bottom);
    bot.y += lift;
    const d = bot.sub(top);
    const len = d.length();
    g.quaternion.setFromUnitVectors(_y, d.divideScalar(len));
    g.scale.set(1, len / m.len, 1);
  };
  if (inst.M.kind === 'bike') {
    const a = _v.fromArray(meta.axisDown);
    const up = _a.copy(a).negate();
    G.rig_steer.quaternion.copy(R.rig_steer.q).premultiply(_q.setFromAxisAngle(up, state.steer));
    const df = dy(0);
    const slide = df / Math.max(0.3, -a.y);
    G.rig_fork.position.copy(R.rig_fork.p).addScaledVector(a, -slide);
    G.rig_spin_front.rotation.z = -state.wheels[0].spin;
    const dr = dy(1);
    G.rig_swing.rotation.z = -Math.asin(Math.max(-0.9, Math.min(0.9, dr / meta.swingLen)));
    G.rig_spin_rear.rotation.z = -state.wheels[1].spin;
    shock('rig_shock_rear', dr * 0.3);
    return;
  }
  // bars / steering wheel
  if (G.rig_steer) {
    const up = _a.fromArray(meta.axisDown).negate();
    G.rig_steer.quaternion.copy(R.rig_steer.q).premultiply(_q.setFromAxisAngle(up, state.steer * 0.9));
  }
  if (G.rig_wheel) {
    const ax = _a.fromArray(meta.wheelAxis);
    G.rig_wheel.quaternion.copy(R.rig_wheel.q).premultiply(_q.setFromAxisAngle(ax, -state.steer * 5));
  }
  const ids = ['fl', 'fr', 'rl', 'rr'];
  for (let i = 0; i < W.length; i++) {
    const id = ids[i];
    const d = dy(i);
    const carrier = G['rig_carrier_' + id];
    if (carrier) {
      carrier.position.copy(R['rig_carrier_' + id].p); carrier.position.y += d;
      G['rig_steer_' + id].rotation.y = state.wheels[i].steer || 0;
    }
    const spin = G['rig_spin_' + id];
    if (spin) spin.rotation.z = -state.wheels[i].spin;
    for (let k = 0; k < 2; k++) {
      const arm = G[`rig_arm_${id}_${k}`];
      if (!arm) continue;
      const m = meta[arm.name];
      arm.rotation.x = -m.side * Math.asin(Math.max(-0.9, Math.min(0.9, d / m.len)));
    }
    const tr = G['rig_trail_' + id];
    if (tr) tr.rotation.z = -Math.asin(Math.max(-0.9, Math.min(0.9, d / meta[tr.name].len)));
    for (let k = 0; k < 2; k++) shock(`rig_shock_${id}_${k}`, d * 0.75);
  }
  if (G.rig_axle) {
    // solid rear axle on a swingarm: it follows the average of both rear wheels
    const d = (dy(2) + dy(3)) / 2;
    G.rig_axle.rotation.z = -Math.asin(Math.max(-0.9, Math.min(0.9, d / meta.axleLen)));
    shock('rig_shock_rear', d * 0.35);
  }
}

// converts a point given in model space into vehicle space
export function modelToVehicle(M, rideHeight, p, out = new THREE.Vector3()) {
  return out.set(-p[2], p[1] - rideHeight, p[0] - M.comX);
}

export function modelStats() {
  const out = {};
  for (const [k, T] of templates) out[k] = { draws: T.meta.draws, tris: T.meta.tris };
  return out;
}
