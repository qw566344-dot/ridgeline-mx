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
import { mergeGeometries, mergeVertices, toCreasedNormals } from '../../vendor/addons/utils/BufferGeometryUtils.js';
import { MODELS } from '/shared/vehicles.js';

const templates = new Map(); // model key -> template
const loMap = new WeakMap();  // full-detail geometry -> simplified geometry
const midMap = new WeakMap(); // full-detail geometry -> lightly simplified geometry (middle distance)
const paintCache = new Map();
const LOD_DIST = 22;          // metres: beyond this the simplified meshes are used (a bike there is ~80 px tall)
const MID_DIST = 8;           // metres: beyond this the lightly simplified ones

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
// The helmet model (tools/bake-helmet-mx.mjs) sits on the rider's head bone
// (y up, z towards the face): scaled to 30 cm wide, turned to face +z, back of
// the shell just behind the neck. Two parts: the shell, painted per rider in
// their gear colours (main colour, accent peak and top stripe, darker chin
// bar and rim), and the gold mirrored goggle lens.
const HELMET_FILE = 'models/rider_helmet.glb';
let helmet = null;
function buildHelmet(root) {
  root.updateMatrixWorld(true);
  const part = (name) => { let m = null; root.traverse((o) => { if (o.isMesh && !m && (o.name === name || (o.parent && o.parent.name === name))) m = o; }); return m; };
  const shell = part('shell'), lens = part('lens');
  if (!shell) throw new Error('helmet has no shell');
  const geos = [shell, lens].filter(Boolean).map((m) => { const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; });
  const g = mergeGeometries(geos, true); // group 0 = shell, group 1 = lens
  g.rotateY(Math.PI); // the model faces -z
  g.computeBoundingBox();
  const b = g.boundingBox;
  const s = 0.3 / (b.max.x - b.min.x);
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -b.min.z);
  g.scale(s, s, s);
  g.translate(0, -0.035, -0.175);
  g.computeBoundingBox();
  return { geometry: g, box: g.boundingBox.clone(), hasLens: !!lens };
}
export function helmetModel() { return helmet; }

const HELMET_GLSL = `
uniform vec3 hA; uniform vec3 hB; uniform vec3 hC; uniform vec3 hMin; uniform vec3 hMax;
varying vec3 vHel;
vec3 helmetPaint(vec3 p) {
  vec3 n = (p - hMin) / (hMax - hMin);           // 0..1: x left-right, y bottom-top, z back-front
  vec3 c = uPat > 0.5 ? skinColor(p * 5.0) : hA; // the bike's skin pattern, if the kit has one
  if (abs(p.x) < 0.016 && n.y > 0.5 && n.z < 0.7) c = hC;                    // stripe over the top
  if (abs(p.x) > 0.02 && abs(p.x) < 0.03 && n.y > 0.55 && n.z < 0.62) c = hB; // pinstripes beside it
  if (n.y > 0.6 && n.z > 0.66) c = hC;                                        // peak
  if (n.z > 0.72 && n.y < 0.4) c = hB;                                         // chin bar
  if (n.y < 0.1) c = vec3(0.09, 0.1, 0.12);                                    // rubber rim
  return c;
}
`;
const helmetMats = new Map();
// scheme: a rider scheme (riderScheme in rider.js): gear = [main, second, accent]
// colours, plus gearPattern / gearCols when the kit wears the bike's skin
export function helmetMaterial(scheme) {
  if (!helmet) return null;
  const [a, b2, c] = scheme.gear;
  const pat = patterned(scheme.gearPattern) ? scheme.gearPattern : 'solid';
  const cols = scheme.gearCols || scheme.gear;
  const key = [a, b2, c, pat, ...cols].join(':');
  if (!helmetMats.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color: a, roughness: 0.32, metalness: 0.06, envMapIntensity: 0.9 });
    const box = helmet.box;
    const u = { hA: { value: new THREE.Color(a) }, hB: { value: new THREE.Color(b2) }, hC: { value: new THREE.Color(c) }, hMin: { value: box.min.clone() }, hMax: { value: box.max.clone() }, ...skinUniforms(cols, pat) };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHel; varying vec3 vPat;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHel = position; vPat = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + SKIN_GLSL + HELMET_GLSL).replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = helmetPaint(vHel);');
    };
    m.customProgramCacheKey = () => 'helmet-shell';
    helmetMats.set(key, m);
  }
  return helmet.hasLens ? [helmetMats.get(key), lensMaterial(scheme)] : helmetMats.get(key);
}

// the goggle lens: a mirrored tint in the combo's colours - the accent, or the
// main colour when the accent is plain white / black / grey
const lensMats = new Map();
function lensMaterial(scheme) {
  const cols = scheme.gearCols || scheme.gear;
  const vivid = (c) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; return Math.max(r, g, b) - Math.min(r, g, b) > 60; };
  const pick = [scheme.gear[2], cols[1], scheme.gear[0], cols[0]].find(vivid);
  const tint = pick === undefined ? 0xffc21a : pick; // nothing colourful: classic gold
  if (!lensMats.has(tint)) lensMats.set(tint, new THREE.MeshStandardMaterial({ color: tint, metalness: 0.85, roughness: 0.12, envMapIntensity: 1.6, emissive: tint, emissiveIntensity: 0.12 })); // mirrored, so solid
  return lensMats.get(tint);
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
    loMap.set(geo, simplifyWeld(geo, 0.045));
    midMap.set(geo, simplifyWeld(geo, 0.014)); // looks the same from a few bike lengths away
  }
}

// far-away copies by vertex clustering: every corner snaps to a grid cell (cell metres) and
// triangles that collapse are dropped. Unlike edge collapsing this also melts away the many small
// separate parts (spokes, bolts, cables) these models are made of, which meshopt could not touch
// (and the models are mostly flat-shaded, so their triangles share no corners to collapse)
function simplifyWeld(geo, cell) {
  if (!geo.index || geo.index.count < 600) return geo;
  const pos = geo.attributes.position, idx = geo.index.array, uv = geo.attributes.uv;
  const rep = new Int32Array(pos.count), cells = new Map();
  const sum = [], cnt = [];
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    const key = Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell);
    let r = cells.get(key);
    if (r === undefined) { r = cnt.length; cells.set(key, r); sum.push(0, 0, 0); cnt.push(0); }
    rep[v] = r; sum[r * 3] += x; sum[r * 3 + 1] += y; sum[r * 3 + 2] += z; cnt[r]++;
  }
  const out = [], seen = new Set(), firstV = new Int32Array(cnt.length).fill(-1);
  for (let v = 0; v < pos.count; v++) if (firstV[rep[v]] < 0) firstV[rep[v]] = v;
  for (let t = 0; t < idx.length; t += 3) {
    const a = rep[idx[t]], b = rep[idx[t + 1]], c = rep[idx[t + 2]];
    if (a === b || b === c || a === c) continue;
    // the same triangle (same corners, same winding) only once
    const k = a < b && a < c ? a + ',' + b + ',' + c : b < c ? b + ',' + c + ',' + a : c + ',' + a + ',' + b;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a, b, c);
  }
  if (out.length > idx.length * 0.85) return geo;
  const P = new Float32Array(cnt.length * 3);
  for (let r = 0; r < cnt.length; r++) { P[r * 3] = sum[r * 3] / cnt[r]; P[r * 3 + 1] = sum[r * 3 + 1] / cnt[r]; P[r * 3 + 2] = sum[r * 3 + 2] / cnt[r]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  if (uv) { const U = new Float32Array(cnt.length * 2); for (let r = 0; r < cnt.length; r++) { U[r * 2] = uv.getX(firstV[r]); U[r * 2 + 1] = uv.getY(firstV[r]); } g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); }
  g.setIndex(out);
  const res = toCreasedNormals(g, Math.PI / 5);
  res.boundingSphere = geo.boundingSphere;
  return res;
}

export function simplify(geo, keep = 0.2, lockBorder = false, err = 0.02) {
  if (!geo.index) return geo;
  const idx = geo.index.array;
  if (idx.length < 600) return geo;
  const pos = geo.attributes.position.array;
  const target = Math.max(60, Math.floor((idx.length / 3) * keep) * 3);
  try {
    const [out] = MeshoptSimplifier.simplify(new Uint32Array(idx), pos, 3, target, err, lockBorder ? ['LockBorder'] : []); // locking borders kept nearly everything on models with UV seams
    if (!out || out.length < 3) return geo;
    const lo = new THREE.BufferGeometry();
    for (const [k, at] of Object.entries(geo.attributes)) lo.setAttribute(k, at); // same vertices (uv, skin weights...), fewer triangles
    lo.setIndex(new THREE.BufferAttribute(out, 1));
    lo.boundingSphere = geo.boundingSphere;
    return lo;
  } catch { return geo; }
}

// SHADOW-ONLY stand-ins: a cheap low-detail copy casts the shadow and the detailed mesh casts none.
// It is skipped in the normal pass (it draws nothing there: its draw range is zeroed just before)
// and drawn into the shadow map, which renders it without that hook. In a race, half the
// triangles were vehicles and riders drawn a second time, in full detail, into the shadow map.
const proxyMat = new THREE.MeshBasicMaterial();
function hideInMainPass(o) {
  o.onBeforeRender = (r, sc, cam, geo) => { geo.drawRange.count = 0; };
  o.onAfterRender = (r, sc, cam, geo) => { geo.drawRange.count = Infinity; };
}
export function shadowProxy(mesh, geo) {
  mesh.castShadow = false;
  // its own geometry object (sharing the buffers), so zeroing its draw range touches nothing else
  const g = new THREE.BufferGeometry();
  for (const [k, at] of Object.entries(geo.attributes)) g.setAttribute(k, at);
  g.setIndex(geo.index); g.boundingSphere = geo.boundingSphere;
  const p = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(g, proxyMat) : new THREE.Mesh(g, proxyMat);
  if (mesh.isSkinnedMesh) { p.bind(mesh.skeleton, mesh.bindMatrix); p.frustumCulled = false; }
  p.name = 'shadow_proxy';
  p.castShadow = true; p.receiveShadow = false;
  hideInMainPass(p);
  return p;
}
// one merged, simplified copy of a whole vehicle at rest (wheels spinning or the bars turning make
// no visible difference to a shadow): one shadow draw instead of ~25 detailed ones
function shadowGeometry(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), m = new THREE.Matrix4();
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', o.geometry.attributes.position.clone());
    if (o.geometry.index) g.setIndex(o.geometry.index.clone());
    g.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
    parts.push(g);
  });
  if (!parts.length) return null;
  return shadowSimplify(mergeGeometries(parts, false), 0.1);
}
// position-only copy, welded (UV / normal seams split vertices) and simplified hard: shadows are soft blobs
export function shadowSimplify(geo, keep = 0.1) {
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.attributes.position);
  if (geo.index) g.setIndex(geo.index);
  g = mergeVertices(g, 1e-4);
  const lo = simplify(g, keep, false, 0.05);
  lo.computeBoundingSphere();
  return lo;
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
  return { root, meta, M, shadowGeo: shadowGeometry(root) };
}

// ---------------------------------------------------------------- instances
// paint: a plain colour, or a skin pattern drawn in the model's own space
// uniforms for SKIN_GLSL: the skin's three colours and pattern (also used by
// the rider's kit and helmet so they match the bike)
export function skinUniforms(cols, pat) {
  return { uA: { value: new THREE.Color(cols[0]) }, uB: { value: new THREE.Color(cols[1]) }, uC: { value: new THREE.Color(cols[2] || 0x111111) }, uPat: { value: PATTERN_ID[pat] || 0 }, uTime: skinTime };
}
export const patterned = (pat) => !!pat && pat !== 'solid' && pat !== 'chrome';
export const PATTERN_ID = { solid: 0, stripes: 1, flames: 2, camo: 3, galaxy: 4, carbon: 5, chrome: 6, tiger: 7, gradient: 8, checker: 9, hex: 10, bolt: 11, splatter: 12, pixel: 13, aurora: 14, lava: 15, marble: 16, race: 17, zebra: 18, dots: 19, rainbow: 20, argyle: 21, holo: 22, split: 23, scales: 24, pinstripe: 25, livery: 26, wave: 27, circuit: 28, sunrise: 29, shards: 30, topo: 31, tribal: 32, plaid: 33, nebula: 34, hazard: 35, kaleido: 36, speed: 37, crystal: 38, prism: 39 };
// animated skins (aurora, lava) read this clock; main.js moves it every frame
export const skinTime = { value: 0 };
export const SKIN_GLSL = `
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uPat; uniform float uTime;
varying vec3 vPat;
float skinHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
vec3 skinHue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
vec3 skinDesign(vec3 p);
vec3 skinMore(vec3 p);
// zebra, polka dots, rainbow (moves), argyle, hologram (shimmers)
vec3 skinExtra(vec3 p) {
  if (uPat < 18.5) { float v = sin(p.x * 18.0 + sin(p.y * 7.0) * 2.4 + sin(p.z * 5.0) * 1.2); return mix(uA, uB, smoothstep(0.25, 0.4, v)); }
  if (uPat < 19.5) {
    vec2 q = vec2(p.x + p.z * 0.5, p.y) * 9.0; vec2 c = fract(q) - 0.5;
    float big = step(length(c), 0.28), small = step(length(fract(q + 0.5) - 0.5), 0.12);
    return mix(mix(uA, uB, big), uC, small * (1.0 - big));
  }
  if (uPat < 20.5) return mix(skinHue(fract(p.x * 0.7 + p.y * 0.4 - uTime * 0.12)), uA, 0.12);
  if (uPat < 21.5) {
    vec2 q = vec2(p.x + p.z * 0.3, p.y) * 6.0; vec2 d = abs(fract(vec2(q.x + q.y, q.x - q.y) * 0.5) - 0.5);
    float tile = mod(floor((q.x + q.y) * 0.5) + floor((q.x - q.y) * 0.5), 2.0);
    float line = step(min(d.x, d.y), 0.025);
    return mix(mix(uA, uB, tile), uC, line);
  }
  if (uPat < 22.5) {
    float s = fract(p.y * 1.6 + p.x * 0.9 + p.z * 0.6 + uTime * 0.08);
    return mix(uA, skinHue(s) * 0.6 + uB * 0.4, 0.5 + 0.25 * sin(p.x * 20.0 + uTime));
  }
  // split: two colours on a clean diagonal, a thin third-colour line where they meet
  if (uPat < 23.5) { float d = p.y * 1.1 - p.x * 0.55 - 0.35; return abs(d) < 0.022 ? uC : (d > 0.0 ? uA : uB); }
  // scales: overlapping rows of dragon / mermaid scales, rimmed in the second colour
  if (uPat < 24.5) {
    vec2 q = vec2(p.x + p.z * 0.35, p.y) * vec2(4.5, 6.0);
    float row = floor(q.y); q.x += mod(row, 2.0) * 0.5;
    vec2 c = vec2(fract(q.x) - 0.5, fract(q.y));
    float r = length(c * vec2(1.0, 1.1));
    float shade = 0.75 + 0.35 * c.y;
    return r > 0.46 ? uB : mix(uA * shade, uC, smoothstep(0.38, 0.46, r) * 0.6);
  }
  // pinstripe: thin lines along the bike with a double accent line low down
  if (uPat < 25.5) {
    float y = p.y * 7.0 + p.x * 0.25;
    float line = step(0.94, fract(y));
    float band = step(abs(p.y - 0.42), 0.02) + step(abs(p.y - 0.48), 0.012);
    return mix(mix(uA, uB, line), uC, clamp(band, 0.0, 1.0));
  }
  return skinDesign(p);
}
// designed liveries: factory swoosh, great wave, circuit board, rising sun, low-poly shards, topo map
vec3 skinDesign(vec3 p) {
  // factory: a sweeping band from the front low to the back high, outlined, with a number field
  if (uPat < 26.5) {
    float s = p.y - 0.45 - 0.22 * sin(p.x * 2.2 + 0.6);
    vec3 c = s > 0.0 ? uA : uB;
    if (abs(s) < 0.035) c = uC;
    if (abs(s + 0.12) < 0.018) c = uC;
    return c;
  }
  // great wave: layered curling crests with white foam tips
  if (uPat < 27.5) {
    float x = p.x * 3.0 + p.z * 0.8;
    float v = p.y * 6.0 + 0.9 * sin(x * 2.0) + 0.35 * sin(x * 5.0 + p.y * 3.0);
    float f = fract(v);
    vec3 c = mix(uA, uB, step(0.5, mod(floor(v), 2.0)) * 0.55);
    return mix(c, uC, smoothstep(0.86, 0.9, f) * (1.0 - smoothstep(0.96, 1.0, f)));
  }
  // circuit: right-angle traces with solder pads on a dark board
  if (uPat < 28.5) {
    vec2 q = vec2(p.x + p.z * 0.5, p.y) * 12.0; vec2 cell = floor(q), f = fract(q) - 0.5;
    float h = skinHash(vec3(cell, 1.0));
    float tr = h < 0.5 ? step(abs(f.y), 0.06) : step(abs(f.x), 0.06);
    float pad = step(length(f), 0.18) * step(0.8, skinHash(vec3(cell, 2.0)));
    return mix(mix(uA, uB, clamp(tr, 0.0, 1.0)), uC, pad);
  }
  // rising sun: rays from a sun low at the back, the sun disc in the third colour
  if (uPat < 29.5) {
    vec2 d = vec2(p.x + 0.6, p.y - 0.2);
    float a = atan(d.y, d.x);
    float ray = step(0.5, fract(a * 3.8));
    return length(d) < 0.28 ? uC : mix(uA, uB, ray);
  }
  // shards: flat-shaded triangles, each a tint between the two colours
  if (uPat < 30.5) {
    vec2 q = vec2(p.x + p.z * 0.4, p.y) * 5.0; vec2 c = floor(q), f = fract(q);
    float tri = step(f.x, f.y);
    float n = skinHash(vec3(c, tri));
    vec3 col = mix(uA, uB, n);
    return n > 0.93 ? uC : col;
  }
  // topo: contour lines over a gentle height map, every fifth line bold
  if (uPat > 31.5) return skinMore(p);
  float hgt = sin(p.x * 3.1 + sin(p.y * 2.3) * 1.3) * cos(p.y * 2.7 - p.z * 1.7) + 0.4 * sin(p.x * 7.0 + p.y * 5.0);
  float k = hgt * 9.0, fk = fract(k);
  float ln = step(abs(fk - 0.5), 0.07);
  float bold = step(abs(fract(k / 5.0) - 0.5), 0.04);
  return mix(mix(uA, uB, ln * 0.85), uC, bold);
}
// newer designs: tribal, plaid, nebula (moves), hazard, kaleidoscope (turns), speed streaks, crystal, prism (moves)
vec3 skinMore(vec3 p) {
  // tribal: a sharp zig-zag band with an outline
  if (uPat < 32.5) {
    float x = p.x * 1.2 + p.z * 0.3, t = fract(x * 1.6), spike = abs(t - 0.5) * 2.0;
    float e = (p.y - 0.25) * 2.2 - spike * 0.9 - 0.25 * sin(x * 7.0);
    return e > 0.0 ? uA : (e + 0.12 > 0.0 ? uC : uB);
  }
  // plaid: crossing bands and thin over-stripes
  if (uPat < 33.5) {
    vec2 q = vec2(p.x + p.z * 0.4, p.y) * 5.0;
    float a = step(0.5, fract(q.x)), b = step(0.5, fract(q.y));
    float th = max(step(0.92, fract(q.x * 2.0)), step(0.92, fract(q.y * 2.0)));
    return mix(mix(uA, uB, (a + b) * 0.38), uC, th * 0.8);
  }
  // nebula: drifting gas clouds and twinkling stars
  if (uPat < 34.5) {
    float n1 = sin(p.x * 3.0 + uTime * 0.15 + sin(p.y * 4.0 + uTime * 0.1) * 2.0);
    float n2 = sin(p.y * 5.0 - uTime * 0.12 + sin(p.z * 3.0 + p.x * 2.0) * 1.5);
    float m = 0.5 + 0.5 * n1 * n2;
    vec3 c = mix(uA, uB, smoothstep(0.2, 0.9, m));
    c = mix(c, uC, smoothstep(0.78, 1.0, m) * 0.7);
    float h = skinHash(floor(p * 70.0));
    return c + vec3(step(0.992, h) * (0.6 + 0.4 * sin(uTime * 3.0 + h * 40.0)));
  }
  // hazard: a band of warning stripes, edged
  if (uPat < 35.5) {
    float d = abs(p.y - 0.42), st = step(0.5, fract((p.x + p.y) * 4.0));
    vec3 c = mix(uA, mix(uB, uC, st), step(d, 0.12));
    return mix(c, uB, step(abs(d - 0.12), 0.012));
  }
  // kaleidoscope: mirrored wedges turning slowly
  if (uPat < 36.5) {
    vec2 d = vec2(p.x + p.z * 0.2, p.y - 0.4) * 2.0; float r = length(d);
    float a = abs(mod(atan(d.y, d.x) + uTime * 0.05, 0.7854) - 0.3927);
    vec2 q = vec2(cos(a), sin(a)) * r;
    float v = sin(q.x * 9.0) * sin(q.y * 9.0);
    return mix(mix(uA, uB, step(0.0, v)), uC, step(0.85, abs(v)));
  }
  // speed: streaks of different lengths along the bike, bright tips
  if (uPat < 37.5) {
    float rowf = p.y * 14.0, row = floor(rowf), h = skinHash(vec3(row, 3.0, 1.0));
    float s = fract(p.x * 0.6 * (0.5 + h) + h * 7.0);
    float on = step(0.55, s) * step(0.3, fract(rowf)) * step(fract(rowf), 0.75);
    return mix(mix(uA, uB, on), uC, on * step(0.93, s));
  }
  // crystal: faceted cells, each its own shade, bright edges
  if (uPat < 38.5) {
    vec2 q = vec2(p.x + p.z * 0.35, p.y) * 4.5, g = floor(q), f = fract(q);
    float m1 = 8.0, m2 = 8.0, id = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 r = o + vec2(skinHash(vec3(g + o, 1.0)), skinHash(vec3(g + o, 2.0))) - f;
      float dd = dot(r, r);
      if (dd < m1) { m2 = m1; m1 = dd; id = skinHash(vec3(g + o, 3.0)); } else if (dd < m2) m2 = dd;
    }
    float edge = smoothstep(0.0, 0.06, sqrt(m2) - sqrt(m1));
    return mix(uC, mix(uA, uB, id) * (0.85 + 0.3 * id), edge);
  }
  // prism: iridescent bands sliding over the paint
  float s = (p.x * 0.8 + p.y * 1.4 + p.z * 0.3) * 1.5 - uTime * 0.15;
  vec3 hue = skinHue(fract(s));
  return mix(mix(uA, hue, 0.65), mix(uB, hue, 0.4), step(0.5, fract(s * 4.0)));
}
vec3 skinColor(vec3 p) {
  if (uPat < 0.5 || (uPat > 5.5 && uPat < 6.5)) return uA;
  if (uPat < 1.5) return mix(uA, uB, step(0.62, fract((p.x * 1.6 + p.y * 0.9) * 2.2)));
  if (uPat < 2.5) {
    float e = p.x * 1.4 + 0.35 * sin(p.y * 16.0 + p.z * 7.0) + 0.18 * sin(p.y * 31.0 + p.x * 9.0);
    return mix(mix(uC, uA, smoothstep(-0.1, -0.05, e)), uB, smoothstep(0.25, 0.3, e));
  }
  if (uPat < 3.5) { float n = skinHash(floor(p * 9.0)); return n < 0.4 ? uA : (n < 0.75 ? uB : uC); }
  if (uPat < 4.5) {
    float n = 0.5 + 0.5 * sin(p.x * 7.0 + sin(p.y * 5.0) * 2.0 + p.z * 3.0);
    return mix(mix(uA, uB, n), vec3(1.0), step(0.985, skinHash(floor(p * 60.0))));
  }
  if (uPat < 5.5) { float a = step(0.5, fract((p.x + p.z) * 30.0)), b = step(0.5, fract((p.x - p.z) * 30.0)); return mix(uA, uB, abs(a - b)); }
  if (uPat < 7.5) return mix(uA, uB, step(0.55, sin(p.x * 22.0 + sin(p.y * 11.0) * 1.6 + p.z * 4.0)));
  if (uPat < 8.5) return mix(uB, uA, smoothstep(0.2, 1.1, p.y));
  if (uPat < 9.5) return mix(uA, uB, mod(floor(p.x * 10.0) + floor(p.y * 10.0) + floor(p.z * 10.0), 2.0));
  if (uPat < 10.5) {
    vec2 q = vec2(p.x + p.z * 0.4, p.y) * 13.0; vec2 r = vec2(1.0, 1.732), h = r * 0.5;
    vec2 a = mod(q, r) - h, b = mod(q - h, r) - h; vec2 g = dot(a, a) < dot(b, b) ? a : b;
    float d = max(abs(g.x), dot(abs(g), vec2(0.5, 0.866)));
    return mix(uA * (0.85 + 0.3 * skinHash(floor(vec3(q - g, 0.0)))), uB, smoothstep(0.4, 0.46, d));
  }
  if (uPat < 11.5) { float z = p.y * 7.0 + abs(fract(p.x * 5.0 + p.z) - 0.5) * 2.4; float t = smoothstep(0.78, 0.82, fract(z)) * (1.0 - smoothstep(0.92, 0.96, fract(z))); return mix(uA, uB, t); }
  if (uPat < 12.5) {
    float n = sin(p.x * 13.0 + sin(p.z * 7.0) * 2.0) * sin(p.y * 11.0 + sin(p.x * 5.0) * 2.0) + (skinHash(floor(p * 28.0)) - 0.5) * 0.6;
    vec3 c = mix(uA, uB, step(0.42, n));
    return mix(c, uC, step(0.93, skinHash(floor(p * 20.0 + 3.0))));
  }
  if (uPat < 13.5) { float n = skinHash(floor(p * 14.0)); return n < 0.55 ? uA : (n < 0.85 ? uB : uC); }
  if (uPat < 14.5) {
    float w = 0.5 + 0.5 * sin(p.x * 4.0 + uTime * 1.2 + sin(p.y * 3.0 + uTime) * 1.5);
    float w2 = 0.5 + 0.5 * sin(p.y * 6.0 - uTime * 0.8 + p.z * 3.0);
    return mix(mix(uA, uB, w), uC, w2 * 0.6);
  }
  if (uPat < 15.5) {
    float n = sin(p.x * 9.0 + uTime * 0.7 + sin(p.z * 6.0 + uTime * 0.5) * 2.0) * sin(p.y * 8.0 - uTime * 0.4 + sin(p.x * 4.0) * 1.5);
    float crack = smoothstep(0.7, 0.95, abs(n));
    return mix(uC, mix(uA, uB, 0.5 + 0.5 * sin(uTime * 2.0 + p.x * 3.0)) * 1.4, crack);
  }
  if (uPat < 16.5) { float v = sin(p.x * 6.0 + 3.0 * sin(p.y * 4.0 + 2.0 * sin(p.z * 5.0 + p.x * 3.0))); return mix(uA, uB, smoothstep(0.86, 1.0, abs(v))); }
  if (uPat > 17.5) return skinExtra(p);
  // race livery: twin stripes down the middle and a band near the front
  float st = step(abs(p.z + 0.05), 0.03) + step(abs(p.z - 0.05), 0.03);
  vec3 c = mix(uA, uB, clamp(st, 0.0, 1.0));
  return mix(c, uC, step(0.55, p.x) * step(p.x, 0.68));
}
`;
function paintMaterial(base, scheme, which, key) {
  const pat = which === 'body' ? scheme.pattern || 'solid' : 'solid';
  const color = which === 'body' ? scheme.body : scheme.accent;
  const k = base.uuid + ':' + color + ':' + pat + ':' + (scheme.accent || 0) + ':' + (scheme.third || 0);
  if (!paintCache.has(k)) {
    const m = base.clone();
    m.color = new THREE.Color(color);
    if (pat === 'chrome') {
      // the scenes reflect almost nothing, so real metal reads flat: paint the chrome look in -
      // a bright sky above a hard horizon line, the accent colour as the dark "ground" below it,
      // and a hot highlight streak, all following the view angle so it slides as the bike turns
      m.metalness = 0.35; m.roughness = 0.18; m.envMapIntensity = 1.4;
      const u = { uA: { value: new THREE.Color(scheme.body) }, uB: { value: new THREE.Color(scheme.accent || 0x222222) } };
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uA; uniform vec3 uB;').replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 rv = reflect(-normalize(vViewPosition), normal); // what the surface mirrors
  float y = rv.y + 0.05 * sin(rv.x * 9.0) + 0.1;
  float sky = smoothstep(-0.03, 0.03, y);
  vec3 up = uA * mix(1.3, 0.85, clamp(y * 1.4, 0.0, 1.0));
  vec3 down = mix(uB, uA * 0.6, smoothstep(0.0, -0.7, y));
  vec3 k = mix(down, up, sky) + vec3(0.8) * smoothstep(0.32, 0.38, y) * smoothstep(0.52, 0.46, y);
  diffuseColor.rgb = k;
}`);
      };
      m.customProgramCacheKey = () => 'skin-chrome';
    }
    if (pat === 'carbon') { m.roughness = 0.3; }
    if (pat === 'holo') { m.metalness = 0.7; m.roughness = 0.2; }
    if (patterned(pat)) {
      const u = skinUniforms([scheme.body, scheme.accent, scheme.third], pat);
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPat;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPat = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + SKIN_GLSL).replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = skinColor(vPat);');
      };
      m.customProgramCacheKey = () => 'skin-' + pat;
    }
    paintCache.set(k, m);
  }
  void key;
  return paintCache.get(k);
}

// rim styles (shop.js EXTRAS.rims): a copy of the wheel's rim material in the style's colour
const rimMats = new Map();
const RIM_LOOK = { carbon: { color: 0x26262b, metalness: 0.15, roughness: 0.3 }, gold: { color: 0xf0b92a, metalness: 0.35, roughness: 0.3, emissive: 0x2a1c00 }, neon: { color: 0x22d3ee, metalness: 0.1, roughness: 0.3, emissive: 0x0e8fa8 },
  red: { color: 0xd7262e, metalness: 0.2, roughness: 0.3 }, blue: { color: 0x2f6fe0, metalness: 0.2, roughness: 0.3 }, white: { color: 0xeef2f6, metalness: 0.1, roughness: 0.35 },
  bronze: { color: 0xc07a30, metalness: 0.35, roughness: 0.3, emissive: 0x1a0d00 }, violet: { color: 0x8b5cf6, metalness: 0.2, roughness: 0.3, emissive: 0x150a30 } }; // low metalness: the scenes have no reflections, so full metal reads as black
function rimMaterial(base, style) {
  const L = RIM_LOOK[style];
  if (!L) return base;
  const k = base.uuid + ':' + style;
  if (!rimMats.has(k)) {
    const m = base.clone();
    m.color && m.color.setHex(L.color);
    if ('metalness' in m) { m.metalness = L.metalness; m.roughness = L.roughness; }
    if (L.emissive && m.emissive) { m.emissive.setHex(L.emissive); m.emissiveIntensity = 1.2; }
    if (m.map) m.map = null;
    m.needsUpdate = true;
    rimMats.set(k, m);
  }
  return rimMats.get(k);
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
    if (scheme && scheme.native) { /* stock paint on a model with its own colours: leave them */ }
    else if (T.M.paint.includes(n)) o.material = paintMaterial(o.material, scheme, 'body', key);
    else if (T.M.accent.includes(n)) o.material = paintMaterial(o.material, scheme, 'accent', key);
    if (scheme && scheme.rims && scheme.rims !== 'stock' && /rim|spoke/i.test(n)) o.material = rimMaterial(o.material, scheme.rims);
    meshes.push({ mesh: o, hi: o.geometry, mid: midMap.get(o.geometry) || o.geometry, lo: loMap.get(o.geometry) || o.geometry });
  });
  // the shadow comes from one merged low-detail copy (see shadowProxy)
  if (T.shadowGeo) {
    for (const m of meshes) m.mesh.castShadow = false;
    const sp = new THREE.Mesh(T.shadowGeo, proxyMat);
    sp.name = 'shadow_proxy'; sp.castShadow = true; sp.receiveShadow = false;
    hideInMainPass(sp);
    root.add(sp);
  }
  const get = (n) => root.getObjectByName(n);
  const inst = { key, root, meta: T.meta, M: T.M, meshes, lod: 0, groups: {} };
  root.traverse((o) => { if (o.name && o.name.startsWith('rig_')) inst.groups[o.name] = o; });
  inst.rest = {};
  for (const [n, g] of Object.entries(inst.groups)) inst.rest[n] = { p: g.position.clone(), q: g.quaternion.clone() };
  void get;
  return inst;
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);

// how far a steering wheel is turned (radians): from the driver's input when we have it (the road
// wheels barely turn at speed, so following them left the wheel almost still), else from the road wheels
export const wheelTurn = (state) => (state.hand != null ? state.hand * 2.3 : Math.max(-2.3, Math.min(2.3, (state.steer || 0) * 10)));
// state: { steer, hand, wheels: [{comp, spin, steer}] }  cfg: prepared vehicle config
export function updateModelInstance(inst, state, cfg, camDist = 0) {
  const G = inst.groups, R = inst.rest, meta = inst.meta;
  // level of detail
  // (a little hysteresis so a rider right at the edge doesn't flick between levels)
  const cur = inst.lod | 0, h = 1.5;
  const lod = camDist > LOD_DIST + (cur === 2 ? -h : h) ? 2 : camDist > MID_DIST + (cur >= 1 ? -h : h) ? 1 : 0;
  if (lod !== cur) {
    inst.lod = lod;
    for (const m of inst.meshes) m.mesh.geometry = lod === 2 ? m.lo : lod === 1 ? m.mid : m.hi;
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
    G.rig_wheel.quaternion.copy(R.rig_wheel.q).premultiply(_q.setFromAxisAngle(ax, -wheelTurn(state)));
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
