// =====================================================================
//  RIDER
//  A motocross rider in full gear, drawn as ONE skinned mesh (one draw
//  call). Every body part is rigidly attached to its own bone; each
//  frame the joints are placed procedurally:
//   - hands are pinned to the grips and feet to the pegs with 2-bone IK
//   - the rider sits in corners, stands over jumps / whoops / straights,
//     shifts weight with Q / E, braking and throttle, soaks up landings,
//     sticks the inside leg out in tight bike turns and dabs a foot
//     when nearly stopped
//   - on a crash the rider comes off and tumbles to a stop (ragdoll-lite)
// =====================================================================
import * as THREE from 'three';
import { box, cyl, sphere, torus, merge, colorize, clean, place, roundBox, segScale, segs } from './geo.js';
import { heightAt } from '/shared/terrain.js';
import { helmetModel, helmetMaterial, SKIN_GLSL, skinUniforms, patterned, simplify, shadowProxy, shadowSimplify } from './modelRig.js';

const B = { root: 0, pelvis: 1, torso: 2, head: 3, uaL: 4, faL: 5, hL: 6, uaR: 7, faR: 8, hR: 9, thL: 10, shL: 11, ftL: 12, thR: 13, shR: 14, ftR: 15 };
const BONES = 16;
const LEN = { ua: 0.29, fa: 0.27, th: 0.44, sh: 0.43, torso: 0.52 };
const UNI_R_RIDER = 0.27; // the unicycle's wheel radius (vehicleModel.js UNI_R): the pedals turn round its hub
const geoCache = new Map(), loBody = new Map();
// far away riders use simplified copies (and every rider's shadow comes from one, see shadowProxy)
const loCache = new WeakMap();
const shCache = new WeakMap();
const shadowOf = (geo) => { if (!shCache.has(geo)) shCache.set(geo, shadowSimplify(geo, 0.08)); return shCache.get(geo); };
const midCache = new WeakMap();
function midOf(geo) {
  if (!midCache.has(geo)) {
    // simplify each material group on its own (helmet shell / lens) so the groups survive
    let m = geo;
    if (geo.index && geo.groups.length) {
      const idx = [], groups = [];
      for (const g of geo.groups) {
        const sub = new THREE.BufferGeometry();
        sub.setAttribute('position', geo.attributes.position);
        sub.setIndex(new THREE.BufferAttribute(geo.index.array.slice(g.start, g.start + Math.min(g.count, geo.index.count - g.start)), 1));
        const lo = simplify(sub, 0.4, false, 0.012);
        groups.push([idx.length, lo.index.count, g.materialIndex]);
        for (let i = 0; i < lo.index.count; i++) idx.push(lo.index.array[i]);
      }
      m = new THREE.BufferGeometry();
      for (const [k, at] of Object.entries(geo.attributes)) m.setAttribute(k, at);
      m.setIndex(idx); m.boundingSphere = geo.boundingSphere;
      for (const [st, n, mi] of groups) m.addGroup(st, n, mi);
    } else m = simplify(geo, 0.4, false, 0.012);
    midCache.set(geo, m);
  }
  return midCache.get(geo);
}
function loOf(geo, keep) {
  if (!loCache.has(geo)) {
    const lo = simplify(geo, keep); // the built-in rider has no index: weld identical vertices first
    if (lo !== geo && geo.groups.length) lo.addGroup(0, lo.index.count, 0); // one material for the far copy
    loCache.set(geo, lo);
  }
  return loCache.get(geo);
}
let riderMat = null;
const patternMats = new Map();

// the rider's material: plain vertex colours, or - when the kit wears a skin -
// the bike's skin pattern drawn on the jersey (zone 1) and, a little darker,
// the pants (zone 2). Every part is in its own bone's space, so the pattern
// sits on each panel like a print.
function riderMaterial(scheme) {
  if (!riderMat) riderMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02, envMapIntensity: 0.6 });
  if (!patterned(scheme.gearPattern)) return riderMat;
  const cols = scheme.gearCols || scheme.gear;
  const key = scheme.gearPattern + ':' + cols.join(':');
  if (!patternMats.has(key)) {
    const m = riderMat.clone();
    const u = skinUniforms(cols, scheme.gearPattern);
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float zone; varying float vZone; varying vec3 vPat;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPat = position * 3.0; vZone = zone;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vZone;\n' + SKIN_GLSL)
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (vZone > 0.5) { vec3 k = skinColor(vPat); diffuseColor.rgb = vZone > 1.5 ? k * 0.72 : k; }');
    };
    m.customProgramCacheKey = () => 'rider-skin';
    patternMats.set(key, m);
  }
  return patternMats.get(key);
}

function capsule(r, len, color) {
  const g = clean(new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), segs(6, 3), segs(14, 6)));
  g.translate(0, len / 2, 0);
  return colorize(g, color);
}

// LOFT: a smooth body panel swept up the bone. prof is a list of rings, bottom to top:
// [y, half-width, half-depth, forward offset]. Between rings the shape is eased (Catmull-Rom),
// so a few rings give a natural taper - a chest wider than the waist, a calf, a wrist
function loft(prof, color, rs = 16, rows = 4) {
  const n = prof.length, hs = segs((n - 1) * rows, n - 1);
  const g = new THREE.CylinderGeometry(1, 1, 1, segs(rs, 6), hs, false);
  const p = g.attributes.position;
  const at = (k, j) => prof[Math.max(0, Math.min(n - 1, k))][j] || 0;
  const cr = (k, u, j) => { const p0 = at(k - 1, j), p1 = at(k, j), p2 = at(k + 1, j), p3 = at(k + 2, j); return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u); };
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) + 0.5, fk = t * (n - 1), k = Math.min(n - 2, Math.floor(fk)), u = fk - k;
    const y = at(k, 0) + (at(k + 1, 0) - at(k, 0)) * u;
    p.setXYZ(i, p.getX(i) * cr(k, u, 1), y, p.getZ(i) * cr(k, u, 2) + cr(k, u, 3));
  }
  g.computeVertexNormals();
  return colorize(clean(g), color);
}

function partGeo(scheme) {
  const [jersey, pants, accent] = scheme.gear;
  const boot = 0xf2f2f2, glove = accent, dark = 0x1d1f24, sole = 0x2b2d33;
  const parts = []; // [geometry, boneIndex]
  const add = (g, b) => parts.push([g, b]);
  const silver = 0xb8bec7;
  // pelvis / hips: rounded pants seat with hip pads, a belt with a buckle
  add(loft([[-0.1, 0.11, 0.09, -0.01], [-0.05, 0.16, 0.12, -0.012], [0.03, 0.175, 0.13, -0.005], [0.1, 0.165, 0.12, 0], [0.14, 0.155, 0.112, 0]], pants, 18), B.pelvis);
  for (const s of [1, -1]) add(sphere(0.07, pants, [s * 0.15, 0.03, -0.01], [0.8, 1.1, 1.0], 10, 8), B.pelvis);
  add(loft([[0.1, 0.163, 0.118, 0], [0.145, 0.163, 0.118, 0]], dark, 18, 1), B.pelvis);       // belt
  add(roundBoxC(0.06, 0.04, 0.02, 0.008, silver, [0, 0.122, 0.12]), B.pelvis);                // buckle
  // torso: one smooth jersey (narrow waist, broad chest, sloping shoulders), a loose hem over the
  // belt, the chest protector showing through, roost deflector shoulders, a back protector hump
  add(loft([[0.0, 0.152, 0.11, 0], [0.1, 0.155, 0.112, 0.002], [0.2, 0.168, 0.118, 0.008], [0.3, 0.188, 0.126, 0.014], [0.39, 0.198, 0.126, 0.01], [0.46, 0.178, 0.112, 0], [0.52, 0.11, 0.088, -0.006], [0.56, 0.078, 0.07, -0.006]], jersey, 20), B.torso);
  add(loft([[-0.02, 0.166, 0.124, 0.004], [0.03, 0.162, 0.12, 0.002], [0.07, 0.156, 0.114, 0.002]], accent, 20, 1), B.torso);   // jersey hem
  add(loft([[0.2, 0.12, 0.05, 0.085], [0.28, 0.165, 0.07, 0.085], [0.38, 0.175, 0.07, 0.083], [0.47, 0.15, 0.055, 0.068]], accent, 18), B.torso); // chest protector
  add(roundBoxC(0.13, 0.12, 0.03, 0.014, dark, [0, 0.35, 0.155]), B.torso);                   // protector centre plate
  add(sphere(0.12, accent, [0, 0.33, -0.09], [1.05, 1.25, 0.42], 14, 10), B.torso);           // back protector
  add(sphere(0.188, accent, [0, 0.455, -0.012], [0.98, 0.3, 0.66], 18, 8), B.torso);          // shoulder yoke
  for (const s of [1, -1]) {
    add(sphere(0.085, jersey, [s * 0.2, 0.46, -0.005], [1.08, 0.55, 1.12], 14, 8), B.torso);    // shoulder pads: low and wide
    add(sphere(0.07, accent, [s * 0.205, 0.468, -0.005], [1.05, 0.38, 1.05], 12, 6), B.torso);
    add(sphere(0.13, accent, [s * 0.165, 0.24, -0.005], [0.2, 1.4, 0.72], 10, 10), B.torso);   // side panels
  }
  add(torus(0.088, 0.034, dark, [0, 0.53, -0.01], [Math.PI / 2, 0, 0], 8, 18), B.torso);        // neck brace
  add(roundBoxC(0.09, 0.05, 0.03, 0.012, dark, [0, 0.49, -0.1]), B.torso);                     // neck brace back strut
  add(cyl(0.07, 0.08, 0.05, jersey, [0, 0.555, -0.005], [0, 0, 0], 14), B.torso);               // collar
  // (the race number on the back is a decal mesh, see Rider.setNumber)
  // head: the helmet model is its own mesh on the head bone (see Rider); this is the face
  // inside it, plus a plain shell in case the helmet model could not be loaded
  add(sphere(0.085, 0x2a1f1a, [0, 0.09, -0.02], [1, 1.1, 0.9], 12, 10), B.head); // head inside the helmet (dark, behind the goggle lens)
  if (!helmetModel()) add(sphere(0.155, jersey, [0, 0.13, 0.0], [1.0, 1.04, 1.13], 16, 12), B.head);
  // arms: tapered sleeves (round at the shoulder, narrowing to the elbow, a forearm that swells
  // then slims to the wrist), ball joints so nothing gaps when they bend, elbow guards,
  // gauntlet gloves with a thumb, fingers that curl round the grip and a knuckle guard
  for (const [ua, fa, h] of [[B.uaL, B.faL, B.hL], [B.uaR, B.faR, B.hR]]) {
    add(sphere(0.07, jersey, [0, 0.0, 0], [1, 1, 1], 14, 10), ua);                               // shoulder joint
    add(loft([[0, 0.07, 0.07], [0.06, 0.068, 0.067], [0.15, 0.064, 0.061], [0.24, 0.057, 0.054], [LEN.ua, 0.054, 0.052]], jersey, 14, 3), ua);
    for (const y of [0.5, 0.62]) add(cyl(0.0645, 0.063, 0.026, accent, [0, LEN.ua * y, 0], [0, 0, 0], 14), ua); // sleeve stripes
    add(sphere(0.054, jersey, [0, 0, 0], [1, 1, 1], 12, 8), fa);                                 // elbow joint
    add(loft([[0, 0.054, 0.052], [0.07, 0.06, 0.056], [0.15, 0.057, 0.051], [0.21, 0.05, 0.045], [LEN.fa - 0.02, 0.047, 0.043]], jersey, 14, 3), fa);
    add(sphere(0.062, dark, [0, 0.035, -0.02], [1, 1.25, 0.7], 12, 8), fa);                      // elbow guard
    add(loft([[LEN.fa - 0.075, 0.051, 0.048], [LEN.fa - 0.02, 0.054, 0.05], [LEN.fa + 0.01, 0.048, 0.044]], glove, 14, 1), fa); // gauntlet
    add(roundBoxC(0.088, 0.1, 0.052, 0.024, glove, [0, 0.045, 0]), h);                           // palm
    for (let k = 0; k < 4; k++) {                                                                  // fingers, closed into a fist round the grip
      const x = (k - 1.5) * 0.0215, l = k === 0 || k === 3 ? 0.034 : 0.04;
      add(roundBoxC(0.021, l, 0.026, 0.01, glove, [x, 0.092 + l / 2, 0.004]), h);
      add(roundBoxC(0.021, 0.026, 0.03, 0.01, glove, [x, 0.088 + l, -0.02]), h);
    }
    add(roundBoxC(0.024, 0.055, 0.024, 0.011, glove, [0, 0.05, -0.034]), h);                     // thumb, under the grip
    add(roundBoxC(0.074, 0.03, 0.018, 0.008, dark, [0, 0.085, 0.03]), h);                         // knuckle guard
    add(roundBoxC(0.06, 0.04, 0.012, 0.006, dark, [0, 0.03, 0.028]), h);                          // wrist strap
  }
  // legs: baggy tapered pants with a leather knee panel, knee braces with hinges, tall boots
  // that flare at the top, shin plates, strap buckles, a stepped sole and toe cap
  for (const [th, sh, ft] of [[B.thL, B.shL, B.ftL], [B.thR, B.shR, B.ftR]]) {
    add(sphere(0.092, pants, [0, 0.0, 0], [1, 1, 1], 14, 10), th);                               // hip joint
    add(loft([[0, 0.094, 0.09], [0.08, 0.098, 0.093], [0.2, 0.092, 0.087], [0.33, 0.083, 0.08], [LEN.th, 0.075, 0.073]], pants, 16, 3), th);
    for (const s of [1, -1]) add(sphere(0.07, accent, [s * 0.07, LEN.th * 0.5, 0], [0.3, 2.6, 0.7], 8, 10), th); // pant side panels
    add(sphere(0.078, dark, [0, LEN.th * 0.62, -0.04], [0.9, 1.6, 0.55], 10, 8), th);           // seat / rear panel
    add(sphere(0.072, pants, [0, LEN.th - 0.03, 0.01], [1, 0.9, 1], 12, 8), th);                 // knee
    add(sphere(0.07, dark, [0, LEN.th - 0.05, 0.04], [0.9, 1.3, 0.55], 10, 8), th);              // leather knee panel
    add(loft([[-0.02, 0.078, 0.078, 0.004], [0.06, 0.074, 0.076, 0.008], [0.11, 0.075, 0.078, 0.004]], pants, 14, 2), sh); // pants over the brace, into the boot
    add(roundBoxC(0.12, 0.17, 0.12, 0.045, dark, [0, 0.03, 0.03]), sh);                           // knee brace cup
    for (const s of [1, -1]) add(cyl(0.022, 0.022, 0.03, silver, [s * 0.07, 0.04, 0.01], [0, 0, Math.PI / 2], 10), sh); // hinges
    add(loft([[0.09, 0.072, 0.078, 0.004], [0.16, 0.068, 0.073, 0.004], [0.28, 0.062, 0.068, 0.004], [0.37, 0.058, 0.066, 0.002], [0.43, 0.058, 0.07, 0.004]], boot, 16, 3), sh); // boot shaft
    add(loft([[0.12, 0.05, 0.02, 0.065], [0.24, 0.048, 0.02, 0.06], [0.36, 0.044, 0.018, 0.056]], accent, 12, 2), sh); // shin plate
    for (let k = 0; k < 4; k++) {
      const y = 0.15 + k * 0.07, w = 0.072 - k * 0.003;
      add(loft([[y, w, w + 0.006, 0.004], [y + 0.016, w, w + 0.006, 0.004]], dark, 16, 1), sh); // strap
      for (const s of [1, -1]) add(roundBoxC(0.012, 0.024, 0.03, 0.004, silver, [s * (w + 0.002), y + 0.008, 0.02]), sh); // buckles
    }
    add(roundBoxC(0.112, 0.25, 0.1, 0.042, boot, [0, 0.1, 0.0]), ft);                             // foot
    add(roundBoxC(0.112, 0.07, 0.075, 0.028, dark, [0, 0.21, 0.004]), ft);                        // toe cap
    add(roundBoxC(0.105, 0.06, 0.065, 0.022, dark, [0, -0.01, -0.006]), ft);                       // heel cup
    add(roundBoxC(0.122, 0.28, 0.026, 0.008, sole, [0, 0.1, -0.05]), ft);                         // sole
    add(box(0.124, 0.05, 0.03, dark, [0, 0.07, -0.056]), ft);                                     // instep (sits on the peg)
  }
  // merge, tagging every vertex with its bone, and jersey / pants parts with
  // a zone so a skin pattern can be printed on them (see riderMaterial)
  const cJ = new THREE.Color(jersey), cP = new THREE.Color(pants);
  const geos = parts.map(([g, b]) => {
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = b; sw[i * 4] = 1; }
    const col = g.attributes.color, same = (c) => Math.abs(col.getX(0) - c.r) + Math.abs(col.getY(0) - c.g) + Math.abs(col.getZ(0) - c.b) < 1e-4;
    const z = b === B.head ? 0 : same(cJ) ? 1 : same(cP) ? 2 : 0;
    g.setAttribute('zone', new THREE.Float32BufferAttribute(new Float32Array(n).fill(z), 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    return g;
  });
  return merge(geos);
}

function roundBoxC(w, h, d, r, color, pos) {
  return place(colorize(clean(roundBox(w, h, d, r)), color), pos);
}

// --- 2-bone IK ---------------------------------------------------------
const _d = new THREE.Vector3(), _p = new THREE.Vector3();
function ik(A, T, l1, l2, pole, outMid, outEnd) {
  _d.subVectors(T, A);
  let d = _d.length();
  const maxD = l1 + l2 - 0.002, minD = Math.abs(l1 - l2) + 0.01;
  d = Math.max(minD, Math.min(maxD, d));
  _d.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _p.subVectors(pole, A);
  _p.addScaledVector(_d, -_p.dot(_d)).normalize();
  outMid.copy(A).addScaledVector(_d, a).addScaledVector(_p, h);
  outEnd.copy(A).addScaledVector(_d, d);
}

// orient a bone so +Y runs from a to b, with +Z toward `hint`
const _LAT = new THREE.Vector3(1, 0, 0);
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
function setBone(bone, a, b, hint) {
  _y.subVectors(b, a).normalize();
  _z.copy(hint).addScaledVector(_y, -hint.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  bone.quaternion.setFromRotationMatrix(_m);
  bone.position.copy(a);
}

const V = () => new THREE.Vector3();
// a damped spring toward target (w = stiffness in rad/s, z = damping ratio); the speed lives in s[key + 'V']
function spring(s, key, target, w, z, dt) {
  if (!(dt > 0)) return;
  dt = Math.min(dt, 0.05);
  const vk = key + 'V';
  s[vk] = (s[vk] || 0) + ((target - s[key]) * w * w - 2 * z * w * (s[vk] || 0)) * dt;
  s[key] += s[vk] * dt;
}

export class Rider {
  constructor(scheme) {
    const key = scheme.id;
    if (!geoCache.has(key)) geoCache.set(key, partGeo(scheme));
    this.group = new THREE.Group();
    this.group.name = 'rider';
    this.bones = [];
    for (let i = 0; i < BONES; i++) {
      const b = new THREE.Bone();
      if (i > 0) this.bones[0].add(b);
      this.bones.push(b);
    }
    this.group.add(this.bones[0]);
    this.mesh = new THREE.SkinnedMesh(geoCache.get(key), riderMaterial(scheme));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.mesh.bind(new THREE.Skeleton(this.bones, this.bones.map(() => new THREE.Matrix4())), new THREE.Matrix4());
    this.hiGeo = this.mesh.geometry;
    if (!loBody.has(key)) { segScale(0.4); try { loBody.set(key, partGeo(scheme)); } finally { segScale(1); } } // same parts, fewer segments
    this.loGeo = loBody.get(key);
    this.group.add(shadowProxy(this.mesh, this.loGeo));  // skinned: keeps its skin weights, so the welded copy can't be used
    const hm = helmetModel();
    if (hm) {
      this.helmet = new THREE.Mesh(hm.geometry, helmetMaterial(scheme));
      this.helmetHi = hm.geometry; this.helmetLo = loOf(hm.geometry, 0.15); this.helmetMid = midOf(hm.geometry);
      this.bones[B.head].add(this.helmet);
      this.helmetShadow = shadowProxy(this.helmet, shadowOf(hm.geometry));
      this.bones[B.head].add(this.helmetShadow);
    }
    this.lv = 0;
    // pose state
    this.j = {
      pelvis: V(), neck: V(), head: V(), shL: V(), shR: V(), elL: V(), elR: V(), haL: V(), haR: V(),
      hipL: V(), hipR: V(), knL: V(), knR: V(), anL: V(), anR: V(), toeL: V(), toeR: V(),
    };
    this.s = { stand: 0, crouch: 0, fore: 0, leanBody: 0, footL: 0, footR: 0, legOutL: 0, legOutR: 0, bob: 0, air: 0, pose: 0, poseId: null };
    this.attached = true;
    this.rag = null;
    this.tmp = { a: V(), b: V(), c: V(), up: V(), fwd: V(), left: V() };
    this.grip = [{ dir: V(), off: 0 }, { dir: V(), off: 0 }]; // how each hand holds its grip (see updateRiding / applyBones)
    this.gripOn = false;
  }

  // --- special: no vehicle, the rider crawls on all fours -------------------
  // Deliberately goofy: a frantic scramble whose pace follows the speed - the bum
  // waggles side to side, the head bobbles, hands slap high and wide, and the feet
  // kick up behind like a cartoon. Lots of air flails everything.
  // Each hand / knee reaches FORWARD while it is lifted and pushes back while it is
  // planted (the cycle runs backwards when reversing); the stride is sized so a
  // planted hand keeps pace with the ground, up to a frantic blur at full speed.
  updateCrawl(dt, veh, vis) {
    const s = this.s, J = this.j, t = this.tmp;
    const g = -vis.cfg.rideHeight + 0.02;                  // the ground in vehicle space
    const spd = veh.fwdSpeed !== undefined ? veh.fwdSpeed : veh.speed || 0;
    const thr = Math.abs((veh.input && veh.input.throttle) || 0);
    const rate = Math.min(42, Math.abs(spd) * 6) + 2.5 * thr; // stroke 0.52 m: pi / 0.52 ~ 6 per m/s
    s.walk = (s.walk || 0) + (spd < -0.3 ? -rate : rate) * dt;
    s.idle = (s.idle || 0) + dt;
    const ph = s.walk, air = !veh.grounded && (veh.airTime || 0) > 0.08;
    const go = Math.min(1, Math.abs(spd) / 3 + 0.25);       // how wild it gets
    const fl = air ? Math.sin(s.idle * 22) : 0;            // flailing in the air
    const lift = (x) => (air ? 0.18 + fl * 0.1 : Math.max(0, Math.sin(x)) * 0.22 * go);
    // forward while lifted (sin > 0), back while planted: z = -cos, so dz/dphase = sin
    const swing = (x) => (air ? fl * 0.2 : -Math.cos(x) * 0.26 * go);
    const bob = air ? 0.05 : Math.abs(Math.sin(ph)) * 0.07 * go;
    const wag = Math.sin(ph) * 0.11 * go;                   // bum waggle
    const wob = Math.sin(ph * 2 + 0.6) * 0.07 * go;         // head bobble
    J.pelvis.set(wag, g + 0.53 + bob, -0.38);
    J.neck.set(-wag * 0.4, g + 0.56 + bob * 0.5, 0.2);
    t.up.subVectors(J.neck, J.pelvis).normalize();         // the spine runs forward
    t.fwd.set(wag * 1.5, -1, 0.15).normalize();            // chest to the ground, rolling with the waggle
    t.left.crossVectors(t.up, t.fwd).normalize();
    J.head.copy(J.neck).add(t.c.set(wob, 0.13 + Math.abs(wob) * 0.5, 0.08)); // head up, bobbling
    J.shL.copy(J.neck).addScaledVector(t.left, 0.19).add(t.c.set(0, -0.04, -0.03));
    J.shR.copy(J.neck).addScaledVector(t.left, -0.19).add(t.c.set(0, -0.04, -0.03));
    // hands slap down wide and high (left hand with the right knee)
    for (const [sh, el, ha, sx, x] of [[J.shL, J.elL, J.haL, 1, ph], [J.shR, J.elR, J.haR, -1, ph + Math.PI]]) {
      t.b.set(sx * (0.27 + Math.max(0, Math.sin(x)) * 0.1 * go), g + 0.03 + lift(x), 0.32 + swing(x));
      if (air) t.b.add(t.c.set(sx * 0.25, 0.25, 0));      // arms out like wings in the air
      t.a.copy(sh).add(t.c.set(sx * 0.45, 0.05, -0.15));    // chicken elbows
      ik(sh, t.b, LEN.ua, LEN.fa, t.a, el, ha);
    }
    // knees scuttle under the hips, feet flick up behind
    J.hipL.copy(J.pelvis).addScaledVector(t.left, 0.1);
    J.hipR.copy(J.pelvis).addScaledVector(t.left, -0.1);
    for (const [kn, an, toe, sx, x] of [[J.knL, J.anL, J.toeL, 1, ph + Math.PI], [J.knR, J.anR, J.toeR, -1, ph]]) {
      kn.set(sx * 0.15 + wag * 0.6, g + 0.05 + lift(x) * 0.6, -0.4 + swing(x) * 0.8);
      const kick = air ? 0.35 + fl * 0.1 : Math.max(0, Math.sin(x)) * 0.32 * go; // heels kick up
      an.copy(kn).add(t.c.set(sx * 0.03, 0.04 + kick, -0.42 + kick * 0.45));
      toe.copy(an).add(t.c.set(0, -0.06 + kick * 0.2, -0.1));
    }
    this.applyBones(t.up, t.fwd);
  }

  // --- special: Penguin Slide - belly down on the dirt, no vehicle at all -------
  // Flat on the belly, head up, sliding along. The arms do big swim strokes (reach
  // out front, pull back along the ground under the shoulders), the feet flutter.
  // In the air the arms go out like wings and flap.
  updatePenguin(dt, veh, vis) {
    const s = this.s, J = this.j, t = this.tmp;
    const g = -vis.cfg.rideHeight + 0.02;
    const spd = veh.fwdSpeed !== undefined ? veh.fwdSpeed : veh.speed || 0;
    const thr = Math.abs((veh.input && veh.input.throttle) || 0);
    s.walk = (s.walk || 0) + (Math.min(16, Math.abs(spd) * 1.6) + 3 * thr) * (spd < -0.3 ? -1 : 1) * dt;
    s.idle = (s.idle || 0) + dt;
    const ph = s.walk, air = !veh.grounded && (veh.airTime || 0) > 0.08;
    const go = Math.min(1, Math.abs(spd) / 4 + 0.3 * thr);
    const roll = Math.sin(ph) * 0.12 * go;                 // the body rocks with each stroke
    J.pelvis.set(-roll * 0.3, g + 0.17, -0.42);
    J.neck.set(roll * 0.3, g + 0.24, 0.12);
    t.up.subVectors(J.neck, J.pelvis).normalize();         // spine along the ground, head first
    t.fwd.set(roll, -1, 0.1).normalize();                  // chest down
    t.left.crossVectors(t.up, t.fwd).normalize();
    J.head.copy(J.neck).add(t.c.set(0, 0.15, 0.08));      // chin up, looking ahead
    J.shL.copy(J.neck).addScaledVector(t.left, 0.19).add(t.c.set(0, 0.02, -0.04));
    J.shR.copy(J.neck).addScaledVector(t.left, -0.19).add(t.c.set(0, 0.02, -0.04));
    const flap = Math.sin(s.idle * 14);
    for (const [sh, el, ha, sx, x] of [[J.shL, J.elL, J.haL, 1, ph], [J.shR, J.elR, J.haR, -1, ph + Math.PI]]) {
      if (air) t.b.set(sx * (0.75 + flap * 0.05), g + 0.45 + flap * 0.25, 0.05);   // wings
      else {
        // swim stroke: reach far forward (lifted), pull back along the ground to the hip
        const reach = 0.25 + (1 - Math.cos(x)) * 0.32 * go + (1 - go) * 0.55;
        t.b.set(sx * 0.3, g + 0.04 + Math.max(0, Math.sin(x)) * 0.25 * go, reach);
      }
      t.a.copy(sh).add(t.c.set(sx * 0.4, 0.25, -0.1));      // elbows out and up
      ik(sh, t.b, LEN.ua, LEN.fa, t.a, el, ha);
    }
    J.hipL.copy(J.pelvis).addScaledVector(t.left, 0.1);
    J.hipR.copy(J.pelvis).addScaledVector(t.left, -0.1);
    for (const [hip, kn, an, toe, sx, x] of [[J.hipL, J.knL, J.anL, J.toeL, 1, s.idle * 11], [J.hipR, J.knR, J.anR, J.toeR, -1, s.idle * 11 + Math.PI]]) {
      const kick = Math.sin(x) * (air ? 0.15 : 0.08 + 0.06 * go); // flutter kick
      t.b.set(sx * 0.13, g + 0.12 + kick, -1.22);
      t.a.copy(hip).add(t.c.set(sx * 0.05, -0.3, -0.2));     // knees to the ground
      ik(hip, t.b, LEN.th, LEN.sh, t.a, kn, an);
      toe.copy(an).add(t.c.set(0, -0.02, -0.14));           // toes pointed back
    }
    this.applyBones(t.up, t.fwd);
  }

  // --- special: Sack Race - standing up, feet together, hopping everywhere -------
  // Bounces along in big two-footed hops (faster = quicker, longer hops), knees
  // soaking each landing, arms flailing over the head on every hop. In the air the
  // legs tuck and the arms windmill.
  updateHop(dt, veh, vis) {
    const s = this.s, J = this.j, t = this.tmp;
    const g = -vis.cfg.rideHeight + 0.02;
    const spd = Math.abs(veh.fwdSpeed !== undefined ? veh.fwdSpeed : veh.speed || 0);
    const thr = Math.abs((veh.input && veh.input.throttle) || 0);
    s.walk = (s.walk || 0) + (2.2 + Math.min(4, spd * 0.18) + thr) * Math.PI * dt; // hops per second
    s.idle = (s.idle || 0) + dt;
    const ph = s.walk, air = !veh.grounded && (veh.airTime || 0) > 0.08;
    const go = Math.min(1, spd / 3 + 0.4 * thr + 0.15);
    const hop = air ? 0.25 : Math.abs(Math.sin(ph)) * (0.18 + 0.32 * go); // height of this hop
    const squash = air ? 0 : Math.max(0, 0.12 - hop) * 0.9;              // knees bend at the bottom
    const lean = 0.12 + 0.15 * go;                                         // leaning into the hops
    J.pelvis.set(0, g + 0.86 + hop - squash, -0.02);
    t.up.set(0, Math.cos(lean), Math.sin(lean));
    J.neck.copy(J.pelvis).addScaledVector(t.up, LEN.torso);
    t.fwd.set(0, -Math.sin(lean), Math.cos(lean));
    t.left.crossVectors(t.up, t.fwd).normalize();
    J.shL.copy(J.neck).addScaledVector(t.left, 0.19).addScaledVector(t.up, -0.07);
    J.shR.copy(J.neck).addScaledVector(t.left, -0.19).addScaledVector(t.up, -0.07);
    J.head.copy(J.neck).addScaledVector(t.up, 0.04).add(t.c.set(Math.sin(ph * 2) * 0.03, 0, 0));
    // arms: flung up over the head on each hop (windmilling in the air)
    for (const [sh, el, ha, sx] of [[J.shL, J.elL, J.haL, 1], [J.shR, J.elR, J.haR, -1]]) {
      const a = air ? s.idle * 16 + (sx > 0 ? 0 : Math.PI) : ph * 2;
      const up = air ? Math.sin(a) : Math.abs(Math.sin(ph));
      t.b.copy(sh).add(t.c.set(sx * (0.3 + 0.12 * Math.cos(a)), -0.35 + up * 0.75, 0.12 + (air ? Math.cos(a) * 0.3 : 0)));
      t.a.copy(sh).add(t.c.set(sx * 0.5, 0, -0.1));
      ik(sh, t.b, LEN.ua, LEN.fa, t.a, el, ha);
    }
    // feet together (it is a sack race), tucked up in the air
    J.hipL.copy(J.pelvis).addScaledVector(t.left, 0.1);
    J.hipR.copy(J.pelvis).addScaledVector(t.left, -0.1);
    const footY = g + 0.06 + (air ? 0.35 : Math.max(0, hop - 0.06));
    for (const [hip, kn, an, toe, sx] of [[J.hipL, J.knL, J.anL, J.toeL, 1], [J.hipR, J.knR, J.anR, J.toeR, -1]]) {
      t.b.set(sx * 0.07, footY, 0.02);
      t.a.copy(hip).add(t.c.set(sx * 0.05, 0, 0.6));        // knees forward
      ik(hip, t.b, LEN.th, LEN.sh, t.a, kn, an);
      toe.copy(an).add(t.c.set(0, -0.05, 0.2));
    }
    this.applyBones(t.up, t.fwd);
  }

  // the shared start of the standing / sitting special poses: pelvis, spine and shoulders
  // from a pelvis point and a forward lean (t.up / t.fwd / t.left are left set for the limbs)
  spine(px, py, pz, lean, side = 0) {
    const J = this.j, t = this.tmp;
    J.pelvis.set(px, py, pz);
    t.up.set(Math.sin(side), Math.cos(lean), Math.sin(lean)).normalize();
    J.neck.copy(J.pelvis).addScaledVector(t.up, LEN.torso);
    t.fwd.set(0, -Math.sin(lean), Math.cos(lean));
    t.left.crossVectors(t.up, t.fwd).normalize();
    J.shL.copy(J.neck).addScaledVector(t.left, 0.19).addScaledVector(t.up, -0.07);
    J.shR.copy(J.neck).addScaledVector(t.left, -0.19).addScaledVector(t.up, -0.07);
    J.head.copy(J.neck).addScaledVector(t.up, 0.04);
  }
  arm(sh, el, ha, target, pole) { ik(sh, target, LEN.ua, LEN.fa, pole, el, ha); }
  leg(hip, kn, an, toe, target, pole, toeOff) { ik(hip, target, LEN.th, LEN.sh, pole, kn, an); toe.copy(an).add(toeOff); }

  // --- special: Shopping Cart - standing on the step at the back, leaning on the handle;
  // the back foot kicks off the ground while you are on the gas, and you crouch in the air
  updateCart(dt, veh, vis) {
    const s = this.s, J = this.j, t = this.tmp;
    const g = -vis.cfg.rideHeight;
    const spd = Math.abs(veh.fwdSpeed !== undefined ? veh.fwdSpeed : veh.speed || 0);
    const thr = Math.max(0, (veh.input && veh.input.throttle) || 0);
    const air = !veh.grounded && (veh.airTime || 0) > 0.08;
    s.walk = (s.walk || 0) + (3 + Math.min(4, spd * 0.25)) * dt;
    const kick = air ? 0 : Math.min(1, thr * 1.5) * (spd < 14 ? 1 : 0.3);
    this.spine(0, g + 1.0 - (air ? 0.12 : 0), -0.72, 0.55 + (air ? 0.15 : 0));
    for (const [sh, el, ha, sx] of [[J.shL, J.elL, J.haL, 1], [J.shR, J.elR, J.haR, -1]]) this.arm(sh, el, ha, t.b.set(sx * 0.2, g + 1.0, -0.5), t.a.copy(sh).add(t.c.set(sx * 0.4, -0.2, -0.2)));
    J.hipL.copy(J.pelvis).addScaledVector(t.left, 0.1); J.hipR.copy(J.pelvis).addScaledVector(t.left, -0.1);
    // left foot on the step; right foot on the step too, or kicking the ground behind
    this.leg(J.hipL, J.knL, J.anL, J.toeL, t.b.set(0.1, g + 0.27, -0.6), t.a.copy(J.hipL).add(t.c.set(0.1, 0.1, 0.6)), t.c.set(0, -0.05, 0.22));
    const ph = s.walk * Math.PI, k = Math.max(0, Math.sin(ph)) * kick;
    t.b.set(-0.14, g + 0.27 - k * 0.25 + Math.max(0, -Math.sin(ph)) * kick * 0.08, -0.6 - Math.cos(ph) * kick * 0.35);
    this.leg(J.hipR, J.knR, J.anR, J.toeR, t.b, t.a.copy(J.hipR).add(t.c.set(-0.1, 0.1, 0.6)), t.c.set(0, -0.05, 0.22));
    this.applyBones(t.up, t.fwd);
  }

  // --- special: Ride-on Mower - sat on the seat, both hands on the wheel, feet on the plate
  updateMower(dt, veh, vis) {
    const J = this.j, t = this.tmp, g = -vis.cfg.rideHeight, st = (veh.controller && veh.controller.steer) || (veh.input && veh.input.steer) || 0;
    this.spine(0, g + 0.86, -0.3, 0.12, -st * 0.06);
    // hands on the rim of the steering wheel, turning with it
    const C = t.c.set(0, g + 0.9, 0.06), ang = -st * 2.2;
    for (const [sh, el, ha, sx] of [[J.shL, J.elL, J.haL, 1], [J.shR, J.elR, J.haR, -1]]) {
      const a = (sx > 0 ? Math.PI * 0.15 : Math.PI * 0.85) + ang;
      t.b.set(C.x + Math.cos(a) * 0.12, C.y + Math.sin(a) * 0.12 * 0.85, C.z - Math.sin(a) * 0.12 * 0.5);
      this.arm(sh, el, ha, t.b, t.a.copy(sh).add(t.c.set(sx * 0.4, -0.3, 0)));
    }
    J.hipL.copy(J.pelvis).addScaledVector(t.left, 0.1); J.hipR.copy(J.pelvis).addScaledVector(t.left, -0.1);
    for (const [hip, kn, an, toe, sx] of [[J.hipL, J.knL, J.anL, J.toeL, 1], [J.hipR, J.knR, J.anR, J.toeR, -1]]) {
      this.leg(hip, kn, an, toe, t.b.set(sx * 0.17, g + 0.44, 0.2), t.a.copy(hip).add(t.c.set(sx * 0.15, 0.5, 0.4)), t.c.set(0, 0.03, 0.22));
    }
    this.applyBones(t.up, t.fwd);
  }

  // --- special: Skateboard - side-on (the rider group is turned a quarter, see updateRiding,
  // so the board runs along the rider's own x). Knees bent, arms out; on the gas at low speed
  // the back foot comes off and pushes along the ground beside the board
  updateBoard(dt, veh, vis) {
    const s = this.s, J = this.j, t = this.tmp, g = -vis.cfg.rideHeight;
    const spd = Math.abs(veh.fwdSpeed !== undefined ? veh.fwdSpeed : veh.speed || 0);
    const thr = Math.max(0, (veh.input && veh.input.throttle) || 0), st = (veh.controller && veh.controller.steer) || 0;
    const air = !veh.grounded && (veh.airTime || 0) > 0.08;
    s.walk = (s.walk || 0) + (2.4 + Math.min(3, spd * 0.15)) * dt;
    s.idle = (s.idle || 0) + dt;
    const push = air ? 0 : Math.min(1, thr * 1.4) * (spd < 12 ? 1 : 0.25);
    const crouch = air ? 0.22 : 0.1 + push * 0.06;
    // pelvis over the front foot when pushing, centred otherwise; lean into the carve (toe / heel side)
    this.spine(0.06 * push, g + 0.98 - crouch, 0, 0.18 + (air ? 0.2 : 0), st * 0.25);
    J.pelvis.z += st * 0.06;
    for (const [sh, el, ha, sx] of [[J.shL, J.elL, J.haL, 1], [J.shR, J.elR, J.haR, -1]]) {
      const sway = Math.sin(s.idle * 1.7 + sx) * 0.06;
      this.arm(sh, el, ha, t.b.copy(sh).add(t.c.set(sx * 0.42, -0.32 + sway, 0.08)), t.a.copy(sh).add(t.c.set(sx * 0.4, -0.1, -0.3)));
    }
    J.hipL.copy(J.pelvis).addScaledVector(t.left, 0.1); J.hipR.copy(J.pelvis).addScaledVector(t.left, -0.1);
    const deckY = g + 0.14 + (air ? 0.03 : 0);
    // front foot (rider's left, toward +x = where the board is going), across the board
    this.leg(J.hipL, J.knL, J.anL, J.toeL, t.b.set(0.2, deckY, 0), t.a.copy(J.hipL).add(t.c.set(0.3, 0, 0.6)), t.c.set(0.02, -0.04, 0.2));
    // back foot: on the tail, or pushing along the ground beside the board
    const ph = s.walk * Math.PI, down = Math.max(0, Math.sin(ph)) * push;
    t.b.set(-0.2 - Math.cos(ph) * push * 0.35, deckY - down * 0.13 + Math.max(0, -Math.sin(ph)) * push * 0.06, push * 0.2);
    this.leg(J.hipR, J.knR, J.anR, J.toeR, t.b, t.a.copy(J.hipR).add(t.c.set(-0.3, 0, 0.6)), t.c.set(-0.02, -0.04, 0.2));
    this.applyBones(t.up, t.fwd);
  }

  // --- special: Unicycle - on the saddle, feet on the pedals going round with the wheel,
  // arms out wide and wobbling for balance
  updateUnicycle(dt, veh, vis) {
    const s = this.s, J = this.j, t = this.tmp, g = -vis.cfg.rideHeight;
    s.idle = (s.idle || 0) + dt;
    const st = (veh.controller && veh.controller.steer) || 0, a = vis.crank || 0;
    const wob = Math.sin(s.idle * 2.3) * 0.05 + st * 0.12;
    this.spine(0, g + 1.0, 0, 0.05, wob);
    for (const [sh, el, ha, sx] of [[J.shL, J.elL, J.haL, 1], [J.shR, J.elR, J.haR, -1]]) {
      const flap = Math.sin(s.idle * 3.1 + (sx > 0 ? 0 : 1.7)) * 0.12;
      this.arm(sh, el, ha, t.b.copy(sh).add(t.c.set(sx * 0.55, 0.02 + flap * sx * (wob > 0 ? 1 : -1), 0.05)), t.a.copy(sh).add(t.c.set(sx * 0.3, 0.3, -0.2)));
    }
    J.hipL.copy(J.pelvis).addScaledVector(t.left, 0.1); J.hipR.copy(J.pelvis).addScaledVector(t.left, -0.1);
    const hubY = g + UNI_R_RIDER;
    for (const [hip, kn, an, toe, sx, off] of [[J.hipL, J.knL, J.anL, J.toeL, 1, 0], [J.hipR, J.knR, J.anR, J.toeR, -1, Math.PI]]) {
      const ca = a + off; // the pedal goes round with the wheel
      t.b.set(sx * 0.1, hubY + Math.cos(ca) * 0.12 + 0.03, Math.sin(ca) * 0.12);
      this.leg(hip, kn, an, toe, t.b, t.a.copy(hip).add(t.c.set(sx * 0.1, 0, 0.6)), t.c.set(0, -0.03, 0.2));
    }
    this.applyBones(t.up, t.fwd);
  }

  // --- special: an office chair, ridden BACKWARDS -----------------------------
  // The rider group is turned round (see updateRiding), so this pose is built
  // facing the rider's own front, which is the back of the chair's travel.
  // Sitting on the seat, leaning forward over the knees, both feet reaching
  // out in front and paddling the ground: that pushes the chair the other way.
  updateChair(dt, veh, vis) {
    const s = this.s, J = this.j, t = this.tmp;
    const g = -vis.cfg.rideHeight + 0.02;
    const spd = Math.abs(veh.fwdSpeed !== undefined ? veh.fwdSpeed : veh.speed || 0);
    const push = Math.min(1, spd / 3 + Math.abs((veh.input && veh.input.throttle) || 0));
    s.walk = (s.walk || 0) + (spd * 2.2 + push * 3) * dt;
    const ph = s.walk;
    const seatY = g + 0.5;
    J.pelvis.set(0, seatY + 0.1, -0.02);
    const lean = 0.35 + push * 0.2;                         // hunched forward, pushing
    t.up.set(0, Math.cos(lean), Math.sin(lean)).normalize();
    J.neck.copy(J.pelvis).addScaledVector(t.up, LEN.torso);
    t.fwd.set(0, -Math.sin(lean), Math.cos(lean));
    t.left.crossVectors(t.up, t.fwd).normalize();
    J.shL.copy(J.neck).addScaledVector(t.left, 0.19).addScaledVector(t.up, -0.07);
    J.shR.copy(J.neck).addScaledVector(t.left, -0.19).addScaledVector(t.up, -0.07);
    J.head.copy(J.neck).addScaledVector(t.up, 0.04);
    // hands hold the sides of the seat
    for (const [sh, el, ha, sx] of [[J.shL, J.elL, J.haL, 1], [J.shR, J.elR, J.haR, -1]]) {
      t.b.set(sx * 0.27, seatY + 0.02, 0.08);
      t.a.copy(sh).add(t.c.set(sx * 0.4, -0.2, -0.1));
      ik(sh, t.b, LEN.ua, LEN.fa, t.a, el, ha);
    }
    // feet paddle the ground out in front (each foot plants, pushes back, lifts, reaches again)
    J.hipL.copy(J.pelvis).addScaledVector(t.left, 0.1);
    J.hipR.copy(J.pelvis).addScaledVector(t.left, -0.1);
    for (const [hip, kn, an, toe, sx, a] of [[J.hipL, J.knL, J.anL, J.toeL, 1, ph], [J.hipR, J.knR, J.anR, J.toeR, -1, ph + Math.PI]]) {
      const reach = 0.55 + Math.cos(a) * 0.22 * push;      // foot slides from far to near
      const up = Math.max(0, Math.sin(a)) * 0.12 * push;     // and lifts on the way back out
      t.b.set(sx * 0.17, g + 0.08 + up, reach);
      t.a.copy(hip).add(t.c.set(sx * 0.08, 0.5, 0.3));      // knees up
      ik(hip, t.b, LEN.th, LEN.sh, t.a, kn, an);
      toe.copy(an).add(t.c.set(0, -0.05, 0.2));
    }
    this.applyBones(t.up, t.fwd);
  }

  // --- riding pose (vehicle-local coordinates) ---------------------------
  // --- driver in a side-by-side / buggy: strapped into the seat --------------
  updateSeated(dt, veh, vis) {
    const s = this.s, A = vis.attach, J = this.j, t = this.tmp;
    // the body sways with cornering and bumps, the head stays level-ish
    const lat = Math.max(-0.5, Math.min(0.5, veh.lean || 0));
    s.leanBody += (lat * 0.6 - s.leanBody) * Math.min(1, dt * 5);
    const compAvg = veh.wheels ? veh.wheels.reduce((a, w) => a + w.comp / w.cfg.travel, 0) / veh.wheels.length : 0.3;
    spring(s, 'crouch', Math.max(0, compAvg - 0.35) * 0.6, 13, 0.35, dt); // bounces in the seat over bumps
    J.pelvis.copy(A.seat).add(t.c.set(0, 0.1 - s.crouch * 0.05, 0.06));
    const recline = 0.26;
    t.up.set(Math.sin(s.leanBody) * 0.5, Math.cos(recline), -Math.sin(recline)).normalize();
    J.neck.copy(J.pelvis).addScaledVector(t.up, LEN.torso);
    t.fwd.set(0, Math.sin(recline), Math.cos(recline));
    t.left.crossVectors(t.up, t.fwd).normalize();
    J.shL.copy(J.neck).addScaledVector(t.left, 0.19).addScaledVector(t.up, -0.07);
    J.shR.copy(J.neck).addScaledVector(t.left, -0.19).addScaledVector(t.up, -0.07);
    J.head.copy(J.neck).addScaledVector(t.up, 0.04);
    // in a car the wheel can be further than the arms reach from the seat: lean the upper body
    // toward it (up to 30 cm) so both hands really hold the wheel and turn with it
    {
      t.a.addVectors(J.shL, J.shR).multiplyScalar(0.5);
      t.b.addVectors(A.gripL, A.gripR).multiplyScalar(0.5);
      const reach = (LEN.ua + LEN.fa) * 0.93;
      const far = Math.max(J.shL.distanceTo(A.gripL), J.shR.distanceTo(A.gripR)) - reach;
      if (far > 0) {
        t.c.subVectors(t.b, t.a).normalize().multiplyScalar(Math.min(0.3, far + 0.02));
        for (const j of [J.neck, J.shL, J.shR, J.head]) j.add(t.c);
      }
    }
    for (const [sh, el, ha, grip, sx] of [[J.shL, J.elL, J.haL, A.gripL, 1], [J.shR, J.elR, J.haR, A.gripR, -1]]) {
      t.a.copy(sh).add(t.c.set(sx * 0.45, -0.35, 0.05));
      ik(sh, grip, LEN.ua, LEN.fa, t.a, el, ha);
    }
    J.hipL.copy(J.pelvis).addScaledVector(t.left, 0.1);
    J.hipR.copy(J.pelvis).addScaledVector(t.left, -0.1);
    for (const [hip, kn, an, toe, ped, sx] of [[J.hipL, J.knL, J.anL, J.toeL, A.pegL, 1], [J.hipR, J.knR, J.anR, J.toeR, A.pegR, -1]]) {
      t.a.copy(hip).add(t.c.set(sx * 0.12, 0.6, 0.3));
      ik(hip, ped, LEN.th, LEN.sh, t.a, kn, an);
      toe.copy(an).add(t.c.set(0, 0.08, 0.24));
    }
    this.applyBones(t.up, t.fwd);
  }

  updateRiding(dt, veh, vis) {
    this.group.rotation.y = vis.special === 'chair' ? Math.PI : vis.special === 'board' ? -Math.PI / 2 : 0;
    if (vis.special === 'cart') return this.updateCart(dt, veh, vis);
    if (vis.special === 'mower') return this.updateMower(dt, veh, vis);
    if (vis.special === 'board') return this.updateBoard(dt, veh, vis);
    if (vis.special === 'unicycle') return this.updateUnicycle(dt, veh, vis);
    if (vis.special === 'crawl') return this.updateCrawl(dt, veh, vis);
    if (vis.special === 'chair') return this.updateChair(dt, veh, vis);
    if (vis.special === 'penguin') return this.updatePenguin(dt, veh, vis);
    if (vis.special === 'hop') return this.updateHop(dt, veh, vis);
    if (vis.seated) return this.updateSeated(dt, veh, vis);
    const s = this.s, A = vis.attach, isBike = vis.isBike;
    const inp = veh.input || {};
    // right wrist rolls on with the throttle (follows acceleration: eases in, snaps off when braking)
    const thrT = (inp.throttle || 0) * (veh.grounded ? 1 : 0.6) * (1 - 0.8 * (inp.brake || 0));
    this.thr = (this.thr || 0) + (thrT - (this.thr || 0)) * Math.min(1, dt * 9);
    const spd = veh.speed || 0;
    const air = !veh.grounded && (veh.airTime || 0) > 0.08;
    const steer = veh.controller ? veh.controller.steer || 0 : inp.steer || 0;
    // targets
    let stand = 0;
    if (air) stand = 1;
    else if (spd > 9 && Math.abs(steer) < 0.35) stand = 0.85;
    else if (spd > 5 && Math.abs(steer) < 0.2) stand = 0.5;
    if (!isBike) stand *= 0.75;
    const compAvg = veh.wheels ? veh.wheels.reduce((a, w) => a + w.comp / w.cfg.travel, 0) / veh.wheels.length : 0.3;
    const crouch = Math.max(0, compAvg - 0.35) * 1.6 + (air ? 0.15 : 0) + (veh.preload || 0) * 0.55; // preload: squat into the face
    let fore = (inp.lean || 0) * 0.8 + (inp.brake || 0) * -0.25 + (inp.throttle || 0) * 0.2;
    if (air) fore = (inp.lean || 0) * 1.0;
    const k = Math.min(1, dt * 6);
    // springs, not plain easing: the body has weight. Landings push the rider down into the bike
    // and they spring back up past level and settle; standing up / sitting down overshoots a touch.
    const landed = !air && s.wasAir;
    s.wasAir = air;
    if (landed && dt > 0) s.crouchV = (s.crouchV || 0) + Math.min(4.5, 1.2 + (veh.lastLanding || 0.5) * 2.4);
    spring(s, 'stand', stand, 7.5, 0.82, dt);
    spring(s, 'crouch', Math.min(0.6, crouch), 15, 0.4, dt);
    s.crouch = Math.max(-0.12, Math.min(0.85, s.crouch));
    s.fore += (Math.max(-1, Math.min(1, fore)) - s.fore) * k;
    // on the ground lean with the vehicle; in the air counter the whip and tuck for flips
    const airRoll = air && veh.controller ? veh.controller.airRoll || 0 : 0;
    // whip: the bike lays flat UNDER the rider - hips and legs go with it, the upper body stays
    // up over it (that is what makes a whip look like a whip, not a bike tipping over)
    const leanT = air ? airRoll * (isBike ? 0.62 : 0.3) : (isBike ? -0.25 : 0.9) * (veh.lean || 0);
    s.leanBody += (leanT - s.leanBody) * k;
    const flipping = air && veh.angVel ? Math.min(1, Math.abs(veh.angVel.dot(veh.left)) / 3) : 0;
    s.crouch = Math.max(s.crouch, flipping * 0.45);
    // inside leg out in tight, slow-ish bike turns; foot dab when nearly stopped
    const legOut = isBike && !air && spd > 2.5 && spd < 16 && Math.abs(steer) > 0.45 && s.stand < 0.4 ? 1 : 0;
    s.legOutL += ((legOut && steer > 0 ? 1 : 0) - s.legOutL) * k;
    s.legOutR += ((legOut && steer < 0 ? 1 : 0) - s.legOutR) * k;
    const dab = isBike && !air && spd < 1.2 ? 1 : 0;
    s.footL += ((dab ? 1 : 0) - s.footL) * Math.min(1, dt * 5);
    s.bob += dt * (2 + spd * 0.2);

    const J = this.j, t = this.tmp;
    const seat = A.seat, standH = isBike ? 0.78 : 0.7;
    // pelvis
    const pegY = (A.pegL.y + A.pegR.y) / 2, pegZ = (A.pegL.z + A.pegR.z) / 2;
    J.pelvis.set(0, seat.y + 0.08, seat.z + 0.02);
    t.a.set(0, pegY + standH, pegZ - 0.04);
    J.pelvis.lerp(t.a, s.stand);
    J.pelvis.z += s.fore * 0.14 * (0.5 + s.stand);
    J.pelvis.y -= s.crouch * 0.22 * (0.4 + s.stand);
    J.pelvis.x += Math.sin(s.leanBody) * (air ? 0.16 : 0.1); // hips shift to the high side in a whip
    // rider tricks (keys 1-4 in the air). Each one is a movement, not a morph:
    //  - the weight eases in and out (smoothstep) and the parts are staged - the legs lead, the
    //    body follows a beat later, the hands let go last (Cliffhanger)
    //  - legs travel on curved paths (over the seat, over the bars), never straight through the bike
    //  - while it is held there is a little life in it (a flutter, a reach, a click)
    const curPose = veh.controller && veh.controller.trick && !veh.grounded ? veh.controller.trick.cur : null;
    if (curPose && curPose !== s.poseId) s.poseT = 0;
    if (curPose) s.poseId = curPose;
    s.poseT = (s.poseT || 0) + dt;
    s.pose += ((curPose ? 1 : 0) - s.pose) * Math.min(1, dt * 6);
    const P = s.pose > 0.01 ? s.poseId : null;
    const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    const pw = ease(s.pose), pwL = ease(s.pose * 1.4), pwB = ease(s.pose * 1.4 - 0.4), pwH = ease(s.pose * 1.6 - 0.6); // whole / legs / body / hands
    const held = P ? Math.min(1, s.poseT * 2) * pw : 0, life = Math.sin(s.poseT * 2.6);
    const gY = A.gripL.y, gZ = A.gripL.z;
    if (P === 'Superman') { J.pelvis.y += (0.3 + life * 0.015 * held) * pwB; J.pelvis.z -= 0.36 * pwB; }       // pulled out flat behind the bars
    if (P === 'Nac-Nac') { J.pelvis.x -= 0.14 * pwB; J.pelvis.y += 0.12 * pwB; J.pelvis.z -= 0.05 * pwB; }     // hips slide over as the leg goes across
    if (P === 'Heel Clicker') { J.pelvis.y += 0.1 * pwB; J.pelvis.z -= 0.16 * pwB; }                             // sat back, legs up over the front
    if (P === 'Cliffhanger') J.pelvis.lerp(t.a.set(J.pelvis.x, gY + 0.7 + life * 0.012 * held, gZ - 0.16), pwB);  // stood up tall, toes hooked under the bars
    // torso direction (forward lean + side lean), each trick adding its own
    const base = (isBike ? 0.32 : 0.25) + s.stand * 0.38 + s.fore * 0.25 + s.crouch * 0.35;
    const ADD = { Superman: 1.15, 'Nac-Nac': 0.12, 'Heel Clicker': -0.55, Cliffhanger: -0.42 };
    const pitch = base + ((ADD[P] || 0) + (P === 'Superman' ? life * 0.02 * held : 0)) * pwB;
    const twist = P === 'Nac-Nac' ? 0.35 * pwB : 0; // looking back over the shoulder in a nac-nac
    this.headFollow = 0;
    t.up.set(Math.sin(s.leanBody) * 0.9 - twist * 0.25, Math.cos(pitch), Math.sin(pitch)).normalize();
    J.neck.copy(J.pelvis).addScaledVector(t.up, LEN.torso);
    // shoulders
    t.fwd.set(0, -Math.sin(pitch), Math.cos(pitch));
    t.left.crossVectors(t.up, t.fwd).normalize();
    J.shL.copy(J.neck).addScaledVector(t.left, 0.19).addScaledVector(t.up, -0.07);
    J.shR.copy(J.neck).addScaledVector(t.left, -0.19).addScaledVector(t.up, -0.07);
    J.head.copy(J.neck).addScaledVector(t.up, 0.04);
    // arms to the grips, elbows up and out
    this.gripOn = true; this.rollsThrottle = true;
    for (const [sh, el, ha, grip, sx, G] of [[J.shL, J.elL, J.haL, A.gripL, 1, this.grip[0]], [J.shR, J.elR, J.haR, A.gripR, -1, this.grip[1]]]) {
      // holding the grip like a rider: the wrist bends so the hand lies forward over the bar
      // (not hanging straight off the forearm) and the bar sits in the curl of the fingers, on the
      // middle of the rubber grip (the grip points themselves sit by the lever perch)
      const bar = t.b.subVectors(A.gripL, A.gripR).normalize().multiplyScalar(sx * 0.022).add(grip);
      t.a.subVectors(bar, el.lengthSq() > 0 ? el : sh).normalize();             // forearm line (elbow from last frame)
      G.dir.set(0, -0.45, 1).addScaledVector(t.a, 0.35).normalize();           // where the hand points
      t.c.set(0, 1, -0.3).addScaledVector(G.dir, -G.dir.dot(t.c.set(0, 1, -0.3))).normalize(); // back of the hand
      bar.addScaledVector(G.dir, -0.085).addScaledVector(t.c, 0.025);         // the wrist, from the bar
      // Cliffhanger: the hands let go last and go up in a V, reaching and waving a little
      G.off = P === 'Cliffhanger' ? pwH : 0;
      if (P === 'Cliffhanger') t.b.lerp(t.c.set(sh.x + sx * (0.32 + 0.04 * life * held), sh.y + 0.52 + 0.03 * Math.sin(s.poseT * 3.1 + sx) * held, sh.z + 0.06), pwH);
      t.a.copy(sh).add(t.c.set(sx * 0.5, 0.12, -0.25));
      ik(sh, t.b, LEN.ua, LEN.fa, t.a, el, ha);
    }
    // legs to the pegs (or out / down)
    J.hipL.copy(J.pelvis).addScaledVector(t.left, 0.1);
    J.hipR.copy(J.pelvis).addScaledVector(t.left, -0.1);
    for (const [hip, kn, an, toe, peg, sx, out, dabK] of [
      [J.hipL, J.knL, J.anL, J.toeL, A.pegL, 1, s.legOutL, s.footL], [J.hipR, J.knR, J.anR, J.toeR, A.pegR, -1, s.legOutR, 0]]) {
      t.b.copy(peg).add(t.c.set(0, 0.08, -0.02));
      if (out > 0.01) t.b.lerp(t.c.set(sx * 0.42, -0.42, 0.55), out);
      if (dabK > 0.01) t.b.lerp(t.c.set(sx * 0.45, -0.8, 0.05), dabK);
      // a curved path for a foot: from where it is (t.b), through 'via', to 'to', at u (0..1)
      const arc = (via, to, u) => { const k = 1 - u; t.b.set(k * k * t.b.x + 2 * k * u * via[0] + u * u * to[0], k * k * t.b.y + 2 * k * u * via[1] + u * u * to[1], k * k * t.b.z + 2 * k * u * via[2] + u * u * to[2]); };
      if (P === 'Superman') {          // legs straight out behind, together, toes pointed, a slow flutter
        const fl = Math.sin(s.poseT * 5 + (sx > 0 ? 0 : 1.4)) * 0.05 * held;
        arc([sx * 0.2, seat.y + 0.35, seat.z - 0.35], [J.pelvis.x + sx * 0.09, J.pelvis.y + 0.05 + fl, J.pelvis.z - 0.86], pwL);
      }
      if (P === 'Nac-Nac' && sx > 0) { // the left leg swings up OVER the back of the seat and out the other side
        arc([0.05, seat.y + 0.6, seat.z - 0.45], [-0.55, pegY + 0.62 + life * 0.03 * held, pegZ - 0.42], pwL);
      }
      if (P === 'Heel Clicker') {      // both legs up over the front, outside the arms, heels clicking together
        const click = Math.max(0, Math.sin(s.poseT * 7)) * 0.05 * held;
        arc([sx * 0.32, gY - 0.02, gZ - 0.05], [sx * (0.07 + click), gY + 0.16, gZ + 0.34], pwL);
      }
      if (P === 'Cliffhanger') {       // toes hooked under the bars, legs straight
        arc([sx * 0.22, gY - 0.3, gZ - 0.2], [sx * 0.13, gY - 0.16, gZ + 0.05], pwL);
      }
      t.a.copy(hip).add(t.c.set(sx * 0.18, 0.05, 0.6));
      ik(hip, t.b, LEN.th, LEN.sh, t.a, kn, an);
      toe.copy(an).add(t.c.set(0, -0.06, 0.24));
    }
    this.applyBones(t.up, t.fwd);
  }

  // a hand: on a grip it points where updateRiding aimed it, back of the hand up; otherwise
  // (and while a trick lets go) it carries on from the forearm
  setHand(bone, ha, el, G, fwd) {
    const t = this.tmp;
    _y.subVectors(ha, el).normalize();
    if (this.gripOn && G.off < 0.999) {
      _y.lerp(G.dir, 1 - G.off).normalize();
      t.c.set(0, 1, -0.3).lerp(fwd, G.off);
      // throttle hand: rolling the grip on turns the right wrist back toward the rider about the bar (the side axis),
      // so the hand tilts - it used to roll about its own length, which twisted the glove off the grip
      if (G === this.grip[1] && this.thr > 0.01 && this.rollsThrottle) { const a = -this.thr * 0.4 * (1 - G.off); _y.applyAxisAngle(_LAT, a); t.c.applyAxisAngle(_LAT, a); }
      setBone(bone, ha, t.a.copy(ha).addScaledVector(_y, 0.1), t.c);
    } else setBone(bone, ha, t.a.copy(ha).addScaledVector(_y, 0.1), fwd);
  }

  applyBones(up, fwd) {
    const J = this.j, b = this.bones, t = this.tmp;
    setBone(b[B.pelvis], J.pelvis, t.c.copy(J.pelvis).add(up), fwd);
    setBone(b[B.torso], J.pelvis, J.neck, fwd);
    const hf = this.headFollow || 0; // upside down in a trick the head goes with the body, not the horizon
    setBone(b[B.head], J.head, t.c.copy(J.head).add(t.a.set(0, 1, 0).lerp(up, 0.3 + 0.7 * hf)), t.b.set(0, 0, 1).lerp(fwd, 0.2 + 0.8 * hf));
    const back = t.b.copy(fwd).negate();
    setBone(b[B.uaL], J.shL, J.elL, back); setBone(b[B.faL], J.elL, J.haL, fwd);
    this.setHand(b[B.hL], J.haL, J.elL, this.grip[0], fwd);
    setBone(b[B.uaR], J.shR, J.elR, back); setBone(b[B.faR], J.elR, J.haR, fwd);
    this.setHand(b[B.hR], J.haR, J.elR, this.grip[1], fwd); this.gripOn = false; // set again by the next riding pose
    setBone(b[B.thL], J.hipL, J.knL, fwd); setBone(b[B.shL], J.knL, J.anL, fwd);
    setBone(b[B.ftL], J.anL, J.toeL, t.a.set(0, 1, 0));
    setBone(b[B.thR], J.hipR, J.knR, fwd); setBone(b[B.shR], J.knR, J.anR, fwd);
    setBone(b[B.ftR], J.anR, J.toeR, t.a.set(0, 1, 0));
    // first person: shrink away the head, chest, hips and upper arms (the camera is inside them, and the hips
    // showed as a dark lump under the bars); the forearms, gloves and legs stay, so you see your hands on the
    // bars / steering wheel and your knees
    const fp = this.firstPerson ? 0.0001 : 1;
    b[B.head].scale.setScalar(fp); b[B.torso].scale.setScalar(fp); b[B.pelvis].scale.setScalar(fp);
    b[B.uaL].scale.setScalar(fp); b[B.uaR].scale.setScalar(fp); // no upper arms poking into view: forearms and gloves only
    if (this.helmet) this.helmet.visible = !this.firstPerson;
    if (this.helmetShadow) this.helmetShadow.visible = !this.firstPerson;
  }

  // level of detail: simplified body and helmet as the rider gets further from the camera
  setDetail(dist) {
    const lv = dist > 16 ? 2 : dist > 7 ? 1 : 0;
    if (lv === this.lv) return;
    this.lv = lv;
    this.mesh.geometry = lv === 2 ? this.loGeo : this.hiGeo;
    if (this.helmet) this.helmet.geometry = lv === 2 ? this.helmetLo : lv === 1 ? this.helmetMid : this.helmetHi;
    if (this.numberMesh) this.numberMesh.visible = lv < 2;
  }

  // race number printed on the back of the jersey (a small curved decal on the torso bone)
  setNumber(n, scheme) {
    if (this.numberMesh) { this.numberMesh.removeFromParent(); this.numberMesh.geometry.dispose(); this.numberMesh.material.map.dispose(); this.numberMesh.material.dispose(); }
    const num = String(n == null ? '' : n).slice(0, 3);
    if (!num) return;
    const [jersey, , accent] = scheme.gear;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const x = c.getContext('2d');
    const hex = (v) => '#' + v.toString(16).padStart(6, '0');
    // light jerseys get dark numbers and the other way round
    const lum = (v) => (((v >> 16) & 255) * 0.3 + ((v >> 8) & 255) * 0.59 + (v & 255) * 0.11) / 255;
    const ink = lum(jersey) > 0.6 ? '#111111' : '#ffffff';
    const edge = lum(accent) > 0.6 === lum(jersey) > 0.6 ? (ink === '#ffffff' ? '#111111' : '#ffffff') : hex(accent);
    x.font = `italic 900 ${num.length > 2 ? 70 : 92}px Bahnschrift, 'Arial Black', Impact, sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineJoin = 'round'; x.lineWidth = 12; x.strokeStyle = edge; x.strokeText(num, 64, 70);
    x.fillStyle = ink; x.fillText(num, 64, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    // bend the plane around the back of the jersey
    const g = new THREE.PlaneGeometry(0.19, 0.19, 8, 1);
    g.rotateY(Math.PI); // face backwards (and read the right way round from behind)
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, -0.128 * Math.sqrt(Math.max(0, 1 - (p.getX(i) / 0.19) ** 2)) - 0.004);
    g.translate(0, 0.3, 0);
    g.computeVertexNormals();
    this.numberMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.05, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.bones[B.torso].add(this.numberMesh);
  }

  // --- crash: come off the vehicle and tumble -----------------------------
  detach(scene, vel) {
    if (!this.attached) return;
    const wm = this.group.matrixWorld.clone();
    this.attached = false;
    scene.attach(this.group); // keeps the world transform
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), sc = new THREE.Vector3();
    wm.decompose(pos, quat, sc);
    // body centre in world space
    const centre = this.j.pelvis.clone().applyMatrix4(wm);
    this.rag = {
      pos: centre, vel: vel.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 2.2 + Math.random(), (Math.random() - 0.5) * 2)),
      quat: quat.clone(), ang: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8),
      t: 0, settle: 0, phase: Math.random() * 10,
    };
    this.group.position.set(0, 0, 0);
    this.group.quaternion.identity();
    this.group.updateMatrixWorld();
  }

  attachTo(parent) {
    this.attached = true;
    this.rag = null;
    parent.add(this.group);
    this.group.position.set(0, 0, 0);
    this.group.quaternion.identity();
    // a giant / tiny crash leaves the bike's scale on the rider (scene.attach keeps the
    // world size) - back on the bike it would stack and grow every crash
    this.group.scale.set(1, 1, 1);
  }

  updateRagdoll(dt, world) {
    const R = this.rag;
    if (!R) return;
    R.t += dt;
    const sub = 4;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      R.vel.y -= 9.81 * h;
      R.pos.addScaledVector(R.vel, h);
      const gy = heightAt(world, R.pos.x, R.pos.z) + 0.16;
      if (R.pos.y < gy) {
        R.pos.y = gy;
        if (R.vel.y < 0) R.vel.y *= -0.25;
        R.vel.x *= 1 - 3.5 * h; R.vel.z *= 1 - 3.5 * h;
        R.ang.multiplyScalar(1 - 4 * h);
        R.settle += h;
      }
      const w = R.ang.length();
      if (w > 1e-4) R.quat.premultiply(new THREE.Quaternion().setFromAxisAngle(_x.copy(R.ang).divideScalar(w), w * h));
    }
    // once slow, roll onto the back
    const slow = Math.min(1, Math.max(0, R.settle - 0.4) * 1.5) * (R.vel.length() < 2 ? 1 : 0);
    if (slow > 0) {
      const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, Math.atan2(R.vel.x, R.vel.z) || 0, 0));
      R.quat.slerp(target, Math.min(1, dt * 3 * slow));
    }
    // limbs flail in the air, splay out on the ground
    const J = this.j, t = this.tmp;
    const fl = Math.max(0, 1 - R.settle * 1.2);
    const ph = R.phase + R.t * 9;
    J.pelvis.set(0, 0, 0);
    t.up.set(0, 1, 0); t.fwd.set(0, 0, 1);
    J.neck.set(0, LEN.torso, 0.05);
    J.head.copy(J.neck).add(t.c.set(0, 0.04, 0));
    J.shL.set(0.19, LEN.torso - 0.07, 0); J.shR.set(-0.19, LEN.torso - 0.07, 0);
    J.elL.set(0.35 + Math.sin(ph) * 0.1 * fl, LEN.torso - 0.05 + Math.cos(ph) * 0.2 * fl, 0.05);
    J.haL.set(0.55 + Math.sin(ph + 1) * 0.1 * fl, LEN.torso + 0.1 + Math.cos(ph * 1.3) * 0.25 * fl, 0.1);
    J.elR.set(-0.35 - Math.sin(ph + 2) * 0.1 * fl, LEN.torso - 0.08 + Math.sin(ph) * 0.2 * fl, 0.05);
    J.haR.set(-0.55, LEN.torso - 0.2 + Math.sin(ph * 1.1) * 0.3 * fl, 0.12);
    J.hipL.set(0.1, 0, 0); J.hipR.set(-0.1, 0, 0);
    J.knL.set(0.18, -0.42, 0.08 + Math.sin(ph * 0.8) * 0.2 * fl); J.anL.set(0.24, -0.84, 0.0);
    J.knR.set(-0.16, -0.4, 0.15 + Math.cos(ph * 0.9) * 0.2 * fl); J.anR.set(-0.22, -0.82, 0.05);
    J.toeL.copy(J.anL).add(t.c.set(0, 0.02, 0.24)); J.toeR.copy(J.anR).add(t.c.set(0, 0.02, 0.24));
    this.applyBones(t.up, t.fwd);
    this.group.position.copy(R.pos);
    this.group.quaternion.copy(R.quat);
  }

  dispose() {
    this.group.removeFromParent();
    this.mesh.skeleton.dispose();
    if (this.numberMesh) { this.numberMesh.geometry.dispose(); this.numberMesh.material.map.dispose(); this.numberMesh.material.dispose(); }
  }
}

// rider colours: the paint scheme's kit, or a gear set from the shop
// what the rider wears: Team Kit ('match') takes the bike paint's colours and,
// for a skin, its pattern too; a bundle kit (gear with `skin`) wears that skin;
// any other gear set is its own plain colours
export function riderScheme(paint, gearId, GEAR_SETS, COLORS) {
  const g = GEAR_SETS.find((x) => x.id === gearId);
  const skinOf = (p) => ({ gearPattern: p.pattern || null, gearCols: [p.body, p.accent, p.third || 0x111111] });
  if (!g || (!g.colors && !g.skin)) return { ...paint, ...skinOf(paint) };
  if (g.skin) {
    const s = (COLORS || []).find((c) => c.id === g.skin);
    if (s) return { ...paint, id: paint.id + '|' + g.id, gear: s.gear, ...skinOf(s) };
  }
  return { ...paint, id: paint.id + '|' + g.id, gear: g.colors, gearPattern: null, gearCols: null };
}
