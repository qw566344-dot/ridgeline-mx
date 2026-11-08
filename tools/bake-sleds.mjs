// Snowmobile models: one GLB per sled with named parts (ski_left, handlebar, track, track_lug_*, drive_sprocket_*...).
// It faces -x and is in metres through a 0.3 root scale. This bakes it into the game's quad rig:
//   node tools/bake-sleds.mjs sled400=<snow_cruiser_400.glb> sled600=<...> sled800=<...> sled1000=<...>
// - turns it to face +x (MODELS convention), tyre/ski bottoms on y = 0, the middle of the wheelbase at x = 0
// - groups: wheel_FL / wheel_FR = the skis (they steer, they do not spin), handlebars (steering post, bar, grips, guards),
//   wheel_RL / wheel_RR = the two drive sprockets (they spin), swingarm = the whole track assembly (it pitches with the
//   rear suspension), body = everything else (body_paint takes the garage paint)
// - measures the physics wheels, the steering axis, seat, running boards and grips -> shared/quadModels.js
// - merges the ~200 parts into a handful of meshes, simplifies, meshopt-compresses -> client/models/quad_<id>.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { join, weld, simplify, dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import fs from 'fs';
import path from 'path';
import { QUAD_MODELS } from '../shared/quadModels.js';

await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const r3 = (v) => Math.round(v * 1000) / 1000;
const out = { ...QUAD_MODELS };

for (const arg of process.argv.slice(2)) {
  const [id, file] = arg.split('=');
  const doc = await io.read(path.resolve(file));
  const root = doc.getRoot(), scene = root.listScenes()[0];
  const nodes = root.listNodes().filter((n) => n.getMesh());
  const WORLD = new Map(nodes.map((n) => [n, n.getWorldMatrix().slice()]));
  const W = (n) => WORLD.get(n);
  const name = (n) => n.getName();
  // bounds of the real vertices in the file's own (world) space
  const box = (list) => {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], v = [0, 0, 0];
    for (const n of list) {
      const m = W(n);
      for (const p of n.getMesh().listPrimitives()) {
        const a = p.getAttribute('POSITION');
        for (let i = 0; i < a.getCount(); i++) {
          a.getElement(i, v);
          for (let k = 0; k < 3; k++) { const w = m[k] * v[0] + m[4 + k] * v[1] + m[8 + k] * v[2] + m[12 + k]; if (w < lo[k]) lo[k] = w; if (w > hi[k]) hi[k] = w; }
        }
      }
    }
    return { lo, hi, c: lo.map((q, i) => (q + hi[i]) / 2), s: lo.map((q, i) => hi[i] - q) };
  };
  const named = (re) => nodes.filter((n) => re.test(name(n)));
  // forward: the hood is at the front
  const hood = box(named(/^hood$/)), tunnel = box(named(/^tunnel_top$/));
  const fwdSign = hood.c[0] < tunnel.c[0] ? -1 : 1;          // -1: the file faces -x
  const leftSign = 1;                                       // decided below from the skis
  // file -> model: rotate to face +x. Facing -x needs a half turn about y (x -> -x, z -> -z)
  const mapRaw = ([x, y, z]) => (fwdSign < 0 ? [-x, y, -z] : [x, y, z]);

  // ----- groups
  const skiRe = /^(ski_left|ski_right|ski_saddle_left|ski_saddle_right|spindle_left|spindle_right)$/;
  const barsRe = /^(steering_post|handlebar|bar_pad|grip_left|grip_right|hand_guard_left|hand_guard_right|mountain_bar_hook)$/;
  const sprocketRe = /^drive_sprocket_wheel_(left|right)(_hub)?$/;
  const trackRe = /^(track|track_lug_.*|slide_rail_.*|rear_arm_.*|idler_.*|bogie_.*|rear_shock_spring)$/;
  const tag = new Map();
  for (const n of nodes) {
    const nm = name(n);
    tag.set(n, skiRe.test(nm) ? 'ski' : barsRe.test(nm) ? 'bars' : sprocketRe.test(nm) ? 'sprocket' : trackRe.test(nm) ? 'track' : 'body');
  }
  const by = (t) => nodes.filter((n) => tag.get(n) === t);
  // left / right after the half turn: the model's left is -z
  const modelZ = (n) => mapRaw(box([n]).c)[2];
  const sideOf = (n) => (modelZ(n) < 0 ? 'L' : 'R');
  const skis = by('ski'), sprockets = by('sprocket');
  const g = { body: by('body'), handlebars: by('bars'), swingarm: by('track') };
  for (const n of skis) (g['wheel_F' + sideOf(n)] = g['wheel_F' + sideOf(n)] || []).push(n);
  for (const n of sprockets) (g['wheel_R' + sideOf(n)] = g['wheel_R' + sideOf(n)] || []).push(n);

  // ----- measurements (file space), then the model-space origin
  const skiBox = box(named(/^ski_(left|right)$/)), trackBox = box(named(/^track$/)), all = box(nodes);
  const yGround = Math.min(skiBox.lo[1], trackBox.lo[1]);
  const frontX = mapRaw(skiBox.c)[0];
  const rearX = mapRaw(trackBox.c)[0];
  const midX = (frontX + rearX) / 2;
  const M = (p) => { const q = mapRaw(p); return [q[0] - midX, q[1] - yGround, q[2]]; };
  const mc = (re, pick = (b) => b.c) => M(pick(box(named(re))));
  // (measured before the vertices are moved: the exhaust below needs them)
  const tunnelBox0 = box(named(/^tunnel_top$/)), boardBox0 = box(named(/^running_board_left$/));
  // ----- the track: the lugs (track_lug_<n>l / r) go round the belt in order. Their centres are the belt path. To make the
  // track run, the lugs are baked in K phases, each shifted a bit further along the path; the game shows one phase at a time.
  const K = 6;
  const lugNodes = named(/^track_lug_\d+[lr]$/);
  const lugInfo = lugNodes.map((n) => { const mm = name(n).match(/^track_lug_(\d+)([lr])$/); return { n, idx: +mm[1], c: M(box([n]).c) }; });
  const NL = lugInfo.length ? Math.max(...lugInfo.map((l) => l.idx)) + 1 : 0;
  let pts = Array.from({ length: NL }, (_, i) => { const a = lugInfo.filter((l) => l.idx === i); return [a.reduce((q, l) => q + l.c[0], 0) / a.length, a.reduce((q, l) => q + l.c[1], 0) / a.length]; });
  if (NL) {
    // index-increasing must run BACKWARD along the bottom of the belt (that is how a track moves when the sled drives forward)
    let bi = 0; pts.forEach((p, i) => { if (p[1] < pts[bi][1]) bi = i; });
    if (pts[(bi + 1) % NL][0] - pts[(bi - 1 + NL) % NL][0] > 0) { pts = pts.reverse(); for (const l of lugInfo) l.idx = NL - 1 - l.idx; }
  }
  const lugPitch = NL ? pts.reduce((q, p, i) => q + Math.hypot(pts[(i + 1) % NL][0] - p[0], pts[(i + 1) % NL][1] - p[1]), 0) / NL : 0.07;
  // ----- the entry for shared/quadModels.js (model space)
  const mid = (a, b) => a.map((q, i) => (q + b[i]) / 2);
  const skiL = box(g.wheel_FL), skiR = box(g.wheel_FR);
  const skiCtr = (b) => M(b.c);
  const fl = skiCtr(skiL), fr = skiCtr(skiR);
  const trackHalf = trackBox.s[2] / 2;
  const post = box(named(/^steering_post$/)), bar = box(named(/^handlebar$/));
  const pivotTop = M([bar.c[0], bar.hi[1], bar.c[2] * 0 + (post.c[2])]);
  const gripL = mc(fwdSign < 0 ? /^grip_right$/ : /^grip_left$/), gripR = mc(fwdSign < 0 ? /^grip_left$/ : /^grip_right$/);
  const seatB = box(named(/^seat$/));
  const seatTop = M([seatB.c[0], seatB.hi[1], seatB.c[2]]);
  const board = box(named(/^running_board_left$/));
  const boardSide = Math.abs(M(board.c)[2]);
  const peg = M([board.c[0], board.hi[1], board.c[2]]);
  const rear = M(trackBox.c);
  const wheelbase = Math.abs(fl[0] - rear[0]);
  const lenM = all.s[0], widM = all.s[2];
  out[id] = {
    file: `models/quad_${id}.glb`,
    comX: 0,
    // the steering column: the bar sits on top of the post, the axis runs down and forward
    steerPivot: [r3(pivotTop[0]), r3(pivotTop[1]), 0],
    steerAxisTo: [r3(pivotTop[0] + 0.12), r3(pivotTop[1] - 0.5), 0],
    rearPivot: [r3(M([fwdSign < 0 ? trackBox.lo[0] : trackBox.hi[0], trackBox.c[1], trackBox.c[2]])[0]), r3(trackBox.c[1] - yGround + 0.1), 0],
    attach: {
      seat: [r3(seatTop[0]), r3(seatTop[1] + 0.02), 0],
      pegL: [r3(peg[0]), r3(peg[1] + 0.02), -r3(boardSide)], pegR: [r3(peg[0]), r3(peg[1] + 0.02), r3(boardSide)],
      gripL: [r3(gripL[0]), r3(gripL[1]), r3(Math.min(gripL[2], gripR[2]))], gripR: [r3(gripR[0]), r3(gripR[1]), r3(Math.max(gripL[2], gripR[2]))],
    },
    // physics: skis are the front "wheels" (a little round contact), the track is two rear wheels inside it
    wheels: { zF: r3(fl[0]), zR: r3(rear[0]), xF: r3(Math.abs(fl[2])), xR: r3(trackHalf * 0.6), rF: 0.2, rR: 0.24 },
    size: { length: r3(lenM), width: r3(widM) },
  };
  // bake the world transform + map into every vertex
  for (const n of nodes) {
    const m = W(n);
    const sx = Math.hypot(m[0], m[1], m[2]) || 1;           // uniform scale only (0.3): normals just need the rotation
    for (const p of n.getMesh().listPrimitives()) {
      const pos = p.getAttribute('POSITION'), nor = p.getAttribute('NORMAL');
      const v = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        pos.setElement(i, M([m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]));
      }
      if (nor) for (let i = 0; i < nor.getCount(); i++) {
        nor.getElement(i, v);
        const w = [(m[0] * v[0] + m[4] * v[1] + m[8] * v[2]) / sx, (m[1] * v[0] + m[5] * v[1] + m[9] * v[2]) / sx, (m[2] * v[0] + m[6] * v[1] + m[10] * v[2]) / sx];
        const q = mapRaw(w), l = Math.hypot(...q) || 1;
        nor.setElement(i, [q[0] / l, q[1] / l, q[2] / l]);
      }
    }
    n.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
  // ----- (an exhaust pipe used to be added here; it was removed again - set ADD_EXHAUST to bring it back)
  const ADD_EXHAUST = false;
  if (ADD_EXHAUST) {
    const tb = tunnelBox0;
    const xs = [M([tb.lo[0], 0, 0])[0], M([tb.hi[0], 0, 0])[0]];
    const rearX = Math.min(...xs);                       // model +x is forward, so the back of the tunnel is the smaller x
    const bd = boardBox0;
    const baseY = M([0, bd.hi[1], 0])[1] + 0.3;
    const zc = 0.47;                                     // just outside the tunnel wall
    const steel = root.listMaterials().find((m) => m.getName() === 'steel');
    const mat = (steel ? steel.clone() : doc.createMaterial()).setName('exhaust_steel').setBaseColorFactor([0.62, 0.63, 0.67, 1]).setMetallicFactor(0.7).setRoughnessFactor(0.45);
    const tipMat = (steel ? steel.clone() : doc.createMaterial()).setName('exhaust_tip').setBaseColorFactor([0.09, 0.08, 0.08, 1]);
    const cyl = (x0, x1, r0, r1, material) => {      // a cylinder / cone along x from x0 to x1 at (y = baseY, z = zc)
      const N = 14, pos = [], nor = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2, cy = Math.cos(a), sz = Math.sin(a);
        pos.push(x0, baseY + cy * r0, zc + sz * r0, x1, baseY + cy * r1, zc + sz * r1);
        nor.push(0, cy, sz, 0, cy, sz);
        if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const P = doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos));
      const Nn = doc.createAccessor().setType('VEC3').setArray(new Float32Array(nor));
      const I = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(idx));
      return doc.createPrimitive().setAttribute('POSITION', P).setAttribute('NORMAL', Nn).setIndices(I).setMaterial(material);
    };
    const front = rearX + 1.05, back = rearX + 0.12;
    const mesh = doc.createMesh('exhaust')
      .addPrimitive(cyl(front, front - 0.32, 0.04, 0.075, mat))             // the header pipe widening into the can
      .addPrimitive(cyl(front - 0.32, back + 0.05, 0.075, 0.075, mat))        // the muffler can
      .addPrimitive(cyl(back + 0.05, back - 0.1, 0.075, 0.05, tipMat));     // the tail pipe
    const exNode = doc.createNode('exhaust').setMesh(mesh); scene.addChild(exNode);
    WORLD.set(exNode, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    tag.set(exNode, 'body');
    g.body.push(exNode);
    out[id].exhaust = { p: [r3(back - 0.1), r3(baseY), r3(zc)], d: [-1, 0.02, 0] };
  }
  // ----- the lug phases (model space now)
  const lugSet = new Set(lugNodes);
  const beltGroups = [lugInfo.map((l) => l.n)];
  if (NL) {
    const Tk = pts.map((p, k) => { const a = pts[(k + 1) % NL], b = pts[(k - 1 + NL) % NL]; return [a[0] - b[0], a[1] - b[1]]; });
    for (let ph = 1; ph < K; ph++) {
      const off = ph / K, list = [];
      for (const l of lugInfo) {
        const u = (l.idx + off) % NL, i0 = Math.floor(u), f = u - i0, i1 = (i0 + 1) % NL;
        const P = [pts[i0][0] + (pts[i1][0] - pts[i0][0]) * f, pts[i0][1] + (pts[i1][1] - pts[i0][1]) * f];
        const Tc = [Tk[i0][0] + (Tk[i1][0] - Tk[i0][0]) * f, Tk[i0][1] + (Tk[i1][1] - Tk[i0][1]) * f];
        const dth = Math.atan2(Tc[1], Tc[0]) - Math.atan2(Tk[l.idx][1], Tk[l.idx][0]), cs = Math.cos(dth), sn = Math.sin(dth);
        const Pr = pts[l.idx];
        const src = l.n.getMesh(), mesh = doc.createMesh(src.getName() + '_p' + ph);
        for (const pr of src.listPrimitives()) {
          const np = doc.createPrimitive().setMode(pr.getMode()).setMaterial(pr.getMaterial());
          if (pr.getIndices()) np.setIndices(pr.getIndices());
          for (const sem of pr.listSemantics()) {
            const acc = pr.getAttribute(sem);
            if (sem !== 'POSITION' && sem !== 'NORMAL') { np.setAttribute(sem, acc.clone()); continue; }
            const arr = new Float32Array(acc.getCount() * 3), v = [0, 0, 0];
            for (let i = 0; i < acc.getCount(); i++) {
              acc.getElement(i, v);
              if (sem === 'POSITION') { const lx = v[0] - Pr[0], ly = v[1] - Pr[1]; arr[i * 3] = P[0] + cs * lx - sn * ly; arr[i * 3 + 1] = P[1] + sn * lx + cs * ly; arr[i * 3 + 2] = v[2]; }
              else { arr[i * 3] = cs * v[0] - sn * v[1]; arr[i * 3 + 1] = sn * v[0] + cs * v[1]; arr[i * 3 + 2] = v[2]; }
            }
            np.setAttribute(sem, doc.createAccessor().setType('VEC3').setArray(arr));
          }
          mesh.addPrimitive(np);
        }
        const node = doc.createNode(name(l.n) + '_p' + ph).setMesh(mesh); scene.addChild(node); list.push(node);
      }
      beltGroups.push(list);
    }
    g.swingarm = g.swingarm.filter((n) => !lugSet.has(n));
    beltGroups.forEach((list, ph) => { g['belt_p' + ph] = list; });
    out[id].belt = { k: K, pitch: r3(lugPitch) };
  }
  // ----- regroup, merge, compress
  const top = doc.createNode(id);
  for (const [gname, list] of Object.entries(g)) {
    const grp = doc.createNode(gname);
    for (const n of list) { const par = n.getParentNode(); if (par) par.removeChild(n); else scene.removeChild(n); grp.addChild(n); }
    top.addChild(grp);
  }
  for (const n of root.listNodes()) if (!n.getParentNode() && n !== top && !n.getMesh() && scene.listChildren().includes(n)) scene.removeChild(n);
  scene.addChild(top);
  await doc.transform(dedup(), join({ keepNamed: false }), weld({ tolerance: 0.0005 }), simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.002, lockBorder: true }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const dest = `client/models/quad_${id}.glb`;
  await io.write(dest, doc);
  let tris = 0;
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
  console.log(`${id.padEnd(9)} ${Math.round(tris)} tris, ${(fs.statSync(dest).size / 1024).toFixed(0)} KB, faces ${fwdSign < 0 ? '-x (turned)' : '+x'}, wheelbase ${wheelbase.toFixed(2)} m, length ${lenM.toFixed(2)}, width ${widM.toFixed(2)}, groups ${Object.entries(g).map(([k, v]) => k + ':' + v.length).join(' ')}`);
}
fs.writeFileSync('shared/quadModels.js', `// Measured by tools/bake-quads.mjs / bake-quads2.mjs / bake-sleds.mjs - do not edit by hand, bake again.
// Per quad: model file, centre of mass offset (comX), steering axis, swingarm pivot, rider
// points (model space: +x forward, -z left) and wheel centres / tyre radii for the physics.
export const QUAD_MODELS = ${JSON.stringify(out, null, 2).replace(/\[\s+([^\]]+?)\s+\]/g, (m, v) => '[' + v.split(/,\s*/).join(', ') + ']').replace(/"(\w+)":/g, '$1:').replace(/"/g, "'")};
`);
console.log('wrote shared/quadModels.js');
