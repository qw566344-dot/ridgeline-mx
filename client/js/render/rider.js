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
import { box, cyl, sphere, torus, merge, colorize, clean, place, roundBox } from './geo.js';
import { heightAt } from '/shared/terrain.js';
import { helmetModel, helmetMaterial, SKIN_GLSL, skinUniforms, patterned } from './modelRig.js';

const B = { root: 0, pelvis: 1, torso: 2, head: 3, uaL: 4, faL: 5, hL: 6, uaR: 7, faR: 8, hR: 9, thL: 10, shL: 11, ftL: 12, thR: 13, shR: 14, ftR: 15 };
const BONES = 16;
const LEN = { ua: 0.29, fa: 0.27, th: 0.44, sh: 0.43, torso: 0.52 };
const geoCache = new Map();
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
  const g = clean(new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 6, 14));
  g.translate(0, len / 2, 0);
  return colorize(g, color);
}

function partGeo(scheme) {
  const [jersey, pants, accent] = scheme.gear;
  const boot = 0xf2f2f2, glove = accent, dark = 0x1d1f24;
  const parts = []; // [geometry, boneIndex]
  const add = (g, b) => parts.push([g, b]);
  const silver = 0xb8bec7;
  // pelvis / hips: pants with hip pads and a belt
  add(sphere(0.17, pants, [0, 0.04, 0], [1.05, 0.62, 0.78], 16, 10), B.pelvis);
  for (const s of [1, -1]) add(sphere(0.07, pants, [s * 0.15, 0.03, -0.01], [0.8, 1.1, 1.0], 10, 8), B.pelvis);
  add(cyl(0.165, 0.165, 0.045, dark, [0, 0.12, 0], [0, 0, 0], 18), B.pelvis);
  // torso: shaped jersey (chest wider than the waist), chest protector, shoulder cups, collar
  add(sphere(0.2, jersey, [0, 0.33, 0], [0.92, 1.3, 0.62], 18, 14), B.torso);
  add(sphere(0.155, jersey, [0, 0.12, 0], [1.0, 0.9, 0.78], 16, 10), B.torso);
  add(sphere(0.19, accent, [0, 0.37, 0.035], [0.98, 0.78, 0.6], 16, 12), B.torso);            // chest protector
  add(sphere(0.12, dark, [0, 0.36, 0.06], [0.55, 0.42, 0.62], 12, 8), B.torso);               // protector centre plate
  add(sphere(0.188, accent, [0, 0.455, -0.012], [0.98, 0.3, 0.66], 18, 8), B.torso);          // shoulder yoke
  add(sphere(0.158, accent, [0, 0.035, 0], [1.03, 0.16, 0.8], 16, 6), B.torso);               // jersey hem
  for (const s of [1, -1]) {
    add(sphere(0.085, jersey, [s * 0.2, 0.46, -0.005], [1.08, 0.55, 1.12], 14, 8), B.torso);    // shoulder pads: low and wide
    add(sphere(0.07, accent, [s * 0.205, 0.468, -0.005], [1.05, 0.38, 1.05], 12, 6), B.torso);
    add(sphere(0.13, accent, [s * 0.16, 0.24, -0.005], [0.22, 1.4, 0.72], 10, 10), B.torso); // side panels
  }
  add(torus(0.088, 0.034, dark, [0, 0.53, -0.01], [Math.PI / 2, 0, 0], 8, 18), B.torso);        // neck brace
  add(cyl(0.07, 0.08, 0.05, jersey, [0, 0.555, -0.005], [0, 0, 0], 14), B.torso);               // collar
  // (the race number on the back is a decal mesh, see Rider.setNumber)
  // head: the helmet model is its own mesh on the head bone (see Rider); this is the face
  // inside it, plus a plain shell in case the helmet model could not be loaded
  add(sphere(0.1, 0xd9a07a, [0, 0.1, 0.03], [1, 1.1, 1], 12, 10), B.head);
  if (!helmetModel()) add(sphere(0.155, jersey, [0, 0.13, 0.0], [1.0, 1.04, 1.13], 16, 12), B.head);
  // arms: smooth sleeves, elbow guards, cuffs, shaped gloves with a knuckle guard
  for (const [ua, fa, h] of [[B.uaL, B.faL, B.hL], [B.uaR, B.faR, B.hR]]) {
    add(capsule(0.062, LEN.ua, jersey), ua);
    for (const y of [0.5, 0.62]) add(cyl(0.0655, 0.0655, 0.028, accent, [0, LEN.ua * y, 0], [0, 0, 0], 14), ua); // sleeve stripes
    add(capsule(0.052, LEN.fa, jersey), fa);
    add(sphere(0.06, dark, [0, 0.02, -0.012], [1, 0.95, 0.8], 12, 8), fa);                       // elbow guard
    add(cyl(0.056, 0.05, 0.07, accent, [0, LEN.fa - 0.035, 0], [0, 0, 0], 14), fa);             // cuff
    add(roundBoxC(0.088, 0.1, 0.05, 0.022, glove, [0, 0.04, 0]), h);                             // palm
    add(roundBoxC(0.084, 0.06, 0.04, 0.016, glove, [0, 0.105, 0.012]), h);                       // fingers
    add(roundBoxC(0.07, 0.035, 0.02, 0.008, dark, [0, 0.07, 0.03]), h);                          // knuckle guard
  }
  // legs: smooth pants, knee braces with hinges, tall boots with shin plates, buckles, toe caps
  for (const [th, sh, ft] of [[B.thL, B.shL, B.ftL], [B.thR, B.shR, B.ftR]]) {
    add(capsule(0.082, LEN.th, pants), th);
    for (const s of [1, -1]) add(sphere(0.07, accent, [s * 0.062, LEN.th * 0.5, 0], [0.32, 2.6, 0.7], 8, 10), th); // pant side panels
    add(sphere(0.078, dark, [0, LEN.th * 0.62, -0.035], [0.9, 1.6, 0.55], 10, 8), th);          // seat / rear panel
    add(sphere(0.07, pants, [0, LEN.th - 0.03, 0.01], [1, 0.9, 1], 12, 8), th);                  // knee
    add(roundBoxC(0.12, 0.2, 0.12, 0.045, dark, [0, 0.04, 0.012]), sh);                           // knee brace
    for (const s of [1, -1]) add(cyl(0.022, 0.022, 0.03, silver, [s * 0.068, 0.04, 0.01], [0, 0, Math.PI / 2], 10), sh); // hinges
    add(roundBoxC(0.125, 0.32, 0.135, 0.05, boot, [0, 0.25, 0.0]), sh);                           // boot shaft
    add(roundBoxC(0.09, 0.26, 0.03, 0.014, accent, [0, 0.24, 0.07]), sh);                         // shin plate
    for (let k = 0; k < 4; k++) add(box(0.132, 0.018, 0.142, k % 2 ? silver : dark, [0, 0.13 + k * 0.065, 0]), sh); // buckles
    add(roundBoxC(0.115, 0.26, 0.1, 0.04, boot, [0, 0.1, 0.0]), ft);                              // foot
    add(roundBoxC(0.112, 0.06, 0.07, 0.025, dark, [0, 0.215, 0.005]), ft);                        // toe cap
    add(roundBoxC(0.105, 0.05, 0.06, 0.02, dark, [0, -0.01, -0.01]), ft);                          // heel
    add(box(0.12, 0.27, 0.022, dark, [0, 0.1, -0.05]), ft);                                        // sole
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
    const hm = helmetModel();
    if (hm) {
      this.helmet = new THREE.Mesh(hm.geometry, helmetMaterial(scheme));
      this.helmet.castShadow = true;
      this.bones[B.head].add(this.helmet);
    }
    // pose state
    this.j = {
      pelvis: V(), neck: V(), head: V(), shL: V(), shR: V(), elL: V(), elR: V(), haL: V(), haR: V(),
      hipL: V(), hipR: V(), knL: V(), knR: V(), anL: V(), anR: V(), toeL: V(), toeR: V(),
    };
    this.s = { stand: 0, crouch: 0, fore: 0, leanBody: 0, footL: 0, footR: 0, legOutL: 0, legOutR: 0, bob: 0, air: 0, pose: 0, poseId: null };
    this.attached = true;
    this.rag = null;
    this.tmp = { a: V(), b: V(), c: V(), up: V(), fwd: V(), left: V() };
  }

  // --- riding pose (vehicle-local coordinates) ---------------------------
  // --- driver in a side-by-side / buggy: strapped into the seat --------------
  updateSeated(dt, veh, vis) {
    const s = this.s, A = vis.attach, J = this.j, t = this.tmp;
    // the body sways with cornering and bumps, the head stays level-ish
    const lat = Math.max(-0.5, Math.min(0.5, veh.lean || 0));
    s.leanBody += (lat * 0.6 - s.leanBody) * Math.min(1, dt * 5);
    const compAvg = veh.wheels ? veh.wheels.reduce((a, w) => a + w.comp / w.cfg.travel, 0) / veh.wheels.length : 0.3;
    s.crouch += (Math.max(0, compAvg - 0.35) * 0.6 - s.crouch) * Math.min(1, dt * 10);
    J.pelvis.copy(A.seat).add(t.c.set(0, 0.1 - s.crouch * 0.05, 0.06));
    const recline = 0.26;
    t.up.set(Math.sin(s.leanBody) * 0.5, Math.cos(recline), -Math.sin(recline)).normalize();
    J.neck.copy(J.pelvis).addScaledVector(t.up, LEN.torso);
    t.fwd.set(0, Math.sin(recline), Math.cos(recline));
    t.left.crossVectors(t.up, t.fwd).normalize();
    J.shL.copy(J.neck).addScaledVector(t.left, 0.19).addScaledVector(t.up, -0.07);
    J.shR.copy(J.neck).addScaledVector(t.left, -0.19).addScaledVector(t.up, -0.07);
    J.head.copy(J.neck).addScaledVector(t.up, 0.04);
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
    if (vis.seated) return this.updateSeated(dt, veh, vis);
    const s = this.s, A = vis.attach, isBike = vis.isBike;
    const inp = veh.input || {};
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
    const crouch = Math.max(0, compAvg - 0.35) * 1.6 + (air ? 0.15 : 0);
    let fore = (inp.lean || 0) * 0.8 + (inp.brake || 0) * -0.25 + (inp.throttle || 0) * 0.2;
    if (air) fore = (inp.lean || 0) * 1.0;
    const k = Math.min(1, dt * 6);
    s.stand += (stand - s.stand) * Math.min(1, dt * 3.5);
    s.crouch += (Math.min(0.6, crouch) - s.crouch) * Math.min(1, dt * 12);
    s.fore += (Math.max(-1, Math.min(1, fore)) - s.fore) * k;
    // on the ground lean with the vehicle; in the air counter the whip and tuck for flips
    const airRoll = air && veh.controller ? veh.controller.airRoll || 0 : 0;
    // in the air the rider goes with the bike (a little extra into a whip), not against it
    const leanT = air ? airRoll * 0.18 : (isBike ? -0.25 : 0.9) * (veh.lean || 0);
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
    J.pelvis.x += Math.sin(s.leanBody) * 0.1;
    // rider tricks (keys 1-4 in the air): blend into the pose
    const curPose = veh.controller && veh.controller.trick && !veh.grounded ? veh.controller.trick.cur : null;
    if (curPose) s.poseId = curPose;
    s.pose += ((curPose ? 1 : 0) - s.pose) * Math.min(1, dt * 9);
    const P = s.pose > 0.01 ? s.poseId : null, pw = s.pose;
    if (P === 'Superman') { J.pelvis.y += 0.24 * pw; J.pelvis.z -= 0.3 * pw; }                  // body stretched out behind the bars
    if (P === 'Cliffhanger') J.pelvis.y += 0.28 * pw;
    if (P === 'Heel Clicker') { J.pelvis.y += 0.12 * pw; J.pelvis.z -= 0.12 * pw; }
    if (P === 'Nac-Nac') { J.pelvis.x -= 0.12 * pw; J.pelvis.y += 0.14 * pw; }
    // torso direction (forward lean + side lean)
    const pitch = (isBike ? 0.32 : 0.25) + s.stand * 0.38 + s.fore * 0.25 + s.crouch * 0.35 + (P === 'Superman' ? 1.1 * pw : P === 'Cliffhanger' ? -0.3 * pw : P === 'Heel Clicker' ? -0.45 * pw : P === 'Nac-Nac' ? 0.15 * pw : 0);
    t.up.set(Math.sin(s.leanBody) * 0.9, Math.cos(pitch), Math.sin(pitch)).normalize();
    J.neck.copy(J.pelvis).addScaledVector(t.up, LEN.torso);
    // shoulders
    t.fwd.set(0, -Math.sin(pitch), Math.cos(pitch));
    t.left.crossVectors(t.up, t.fwd).normalize();
    J.shL.copy(J.neck).addScaledVector(t.left, 0.19).addScaledVector(t.up, -0.07);
    J.shR.copy(J.neck).addScaledVector(t.left, -0.19).addScaledVector(t.up, -0.07);
    J.head.copy(J.neck).addScaledVector(t.up, 0.04);
    // arms to the grips, elbows up and out
    for (const [sh, el, ha, grip, sx] of [[J.shL, J.elL, J.haL, A.gripL, 1], [J.shR, J.elR, J.haR, A.gripR, -1]]) {
      t.b.copy(grip).add(t.c.set(0, 0.0, -0.03));
      if (P === 'Cliffhanger') t.b.lerp(t.c.set(sh.x + sx * 0.3, sh.y + 0.5, sh.z + 0.05), pw);   // hands up
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
      if (P === 'Superman') t.b.lerp(t.c.set(sx * 0.18, seat.y + 0.55, seat.z - 1.05), pw);           // legs flying out behind
      if (P === 'Nac-Nac' && sx > 0) t.b.lerp(t.c.set(-0.55, pegY + 0.75, pegZ - 0.45), pw);          // left leg swung over the back
      if (P === 'Heel Clicker') t.b.lerp(t.c.set(sx * 0.13, A.gripL.y + 0.14, A.gripL.z + 0.32), pw);  // heels together over the bars
      if (P === 'Cliffhanger') t.b.lerp(t.c.set(sx * 0.12, A.gripL.y - 0.18, A.gripL.z + 0.08), pw);
      t.a.copy(hip).add(t.c.set(sx * 0.18, 0.05, 0.6));
      ik(hip, t.b, LEN.th, LEN.sh, t.a, kn, an);
      toe.copy(an).add(t.c.set(0, -0.06, 0.24));
    }
    this.applyBones(t.up, t.fwd);
  }

  applyBones(up, fwd) {
    const J = this.j, b = this.bones, t = this.tmp;
    setBone(b[B.pelvis], J.pelvis, t.c.copy(J.pelvis).add(up), fwd);
    setBone(b[B.torso], J.pelvis, J.neck, fwd);
    setBone(b[B.head], J.head, t.c.copy(J.head).add(t.a.set(0, 1, 0).lerp(up, 0.3)), t.b.set(0, 0, 1).lerp(fwd, 0.2));
    const back = t.b.copy(fwd).negate();
    setBone(b[B.uaL], J.shL, J.elL, back); setBone(b[B.faL], J.elL, J.haL, fwd);
    setBone(b[B.hL], J.haL, t.c.copy(J.haL).addScaledVector(_y.subVectors(J.haL, J.elL).normalize(), 0.1), fwd);
    setBone(b[B.uaR], J.shR, J.elR, back); setBone(b[B.faR], J.elR, J.haR, fwd);
    setBone(b[B.hR], J.haR, t.c.copy(J.haR).addScaledVector(_y.subVectors(J.haR, J.elR).normalize(), 0.1), fwd);
    setBone(b[B.thL], J.hipL, J.knL, fwd); setBone(b[B.shL], J.knL, J.anL, fwd);
    setBone(b[B.ftL], J.anL, J.toeL, t.a.set(0, 1, 0));
    setBone(b[B.thR], J.hipR, J.knR, fwd); setBone(b[B.shR], J.knR, J.anR, fwd);
    setBone(b[B.ftR], J.anR, J.toeR, t.a.set(0, 1, 0));
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
