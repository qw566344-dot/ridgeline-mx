// Quad models, second pack: one GLB per quad that is already rigged (handlebars_steer, wheelN_steer / wheelN_spin,
// meshes merged by material: Seat, Frame, Paint, Engine, Tire*, Rim*, bars_*). It faces -z, is far too big
// and weighs ~20 MB, so this bakes it into the game's rig:
//   node tools/bake-quads2.mjs <id>=<file.glb> [<id>=<file.glb> ...]
// - turns it to face +x (MODELS convention) and puts the tyre bottoms on y = 0
// - scales it so the grips sit at the height the rider pose was tuned for (shared/quadModels.js)
// - the pack's wheels are close together, so the body is stretched lengthways (the wheels stay round) until
//   the wheelbase matches the physics - the rider, the wheels and the ground contact all line up
// - groups the parts the rig moves: wheel_FL/FR/RL/RR, handlebars, body (paint -> 'body_paint', rims -> 'rim_paint')
// - simplifies the tyres, meshopt-compresses -> client/models/quad_<id>.glb
// - updates the steering pivot / grips in shared/quadModels.js from the new bars (everything else keeps the
//   measured values the physics and the rider pose were tuned with)
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

const SEAT = { z0: -0.3, z1: 2.6, y0: 3.05, y1: 3.4, x: 0.95, debug: !!process.env.SEATDBG }; // Mud Pro seat region, pack units
for (const arg of process.argv.slice(2)) {
  const [id, file] = arg.split('=');
  const old = QUAD_MODELS[id];
  if (!old) throw new Error('unknown quad ' + id);
  const doc = await io.read(path.resolve(file));
  const root = doc.getRoot(), scene = root.listScenes()[0];
  // world matrices and owners (which wheel 1..4 / the bars / the body) before anything is touched
  const WORLD = new Map(), owner = new Map();
  for (const n of root.listNodes()) {
    if (!n.getMesh()) continue;
    WORLD.set(n, n.getWorldMatrix().slice());
    let p = n.getParentNode(), tag = 'body';
    while (p) { const m = p.getName().match(/^[a-z]*[wW]heel([1-4])$/); if (m) { tag = 'w' + m[1]; break; } if (p.getName() === 'handlebars') { tag = 'bars'; break; } p = p.getParentNode(); }
    owner.set(n, tag);
  }
  // private copy of every mesh (the mud model reuses one mesh on two wheels)
  for (const n of root.listNodes()) {
    if (!n.getMesh()) continue;
    const src = n.getMesh(), mesh = doc.createMesh(src.getName()); // real copies: Mesh.clone() would share the primitives
    for (const pr of src.listPrimitives()) {
      const np = doc.createPrimitive().setMode(pr.getMode()).setMaterial(pr.getMaterial()).setIndices(pr.getIndices());
      for (const sem of pr.listSemantics()) np.setAttribute(sem, pr.getAttribute(sem).clone());
      mesh.addPrimitive(np);
    }
    n.setMesh(mesh);
  }
  let nodes = root.listNodes().filter((n) => n.getMesh());
  const W = (n) => WORLD.get(n);
  // The fuel cap is modelled as part of the handlebars, so it turned with the steering. Find it (a flat disc in the
  // middle, well below the grips) and hand it to the body.
  {
    const gripsY = Math.max(...nodes.filter((n) => owner.get(n) === 'bars').map((n) => { const m = W(n); let hi = -1e9; const pos = n.getMesh().listPrimitives()[0].getAttribute('POSITION'); const v = [0, 0, 0]; for (let i = 0; i < pos.getCount(); i += 7) { pos.getElement(i, v); hi = Math.max(hi, m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13]); } return hi; }));
    const barsW = (() => { let lo = 1e9, hi = -1e9; for (const n of nodes.filter((q) => owner.get(q) === 'bars')) { const m = W(n); const pos = n.getMesh().listPrimitives()[0].getAttribute('POSITION'); const v = [0, 0, 0]; for (let i = 0; i < pos.getCount(); i += 5) { pos.getElement(i, v); const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12]; lo = Math.min(lo, x); hi = Math.max(hi, x); } } return hi - lo; })();
    for (const n of nodes.filter((q) => owner.get(q) === 'bars')) {
      const m = W(n), mesh = n.getMesh(), prims = mesh.listPrimitives();
      for (const pr of prims) {
        const pos = pr.getAttribute('POSITION'), idx = pr.getIndices();
        const ix = (i) => (idx ? idx.getScalar(i) : i), tris = (idx ? idx.getCount() : pos.getCount()) / 3;
        const v = [0, 0, 0], key = new Map(), vid = [];
        for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); const k = v.map((x) => Math.round(x * 1e4)).join(','); if (!key.has(k)) key.set(k, key.size); vid.push(key.get(k)); }
        const par = [...Array(key.size).keys()], find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
        for (let t = 0; t < tris; t++) { const a = find(vid[ix(t * 3)]), b = find(vid[ix(t * 3 + 1)]), c = find(vid[ix(t * 3 + 2)]); par[b] = a; par[c] = a; }
        const comps = new Map();
        for (let t = 0; t < tris; t++) {
          const r = find(vid[ix(t * 3)]); const c = comps.get(r) || { tris: [], lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] }; c.tris.push(t);
          for (let k = 0; k < 3; k++) { pos.getElement(ix(t * 3 + k), v); for (let q = 0; q < 3; q++) { const w = m[q] * v[0] + m[4 + q] * v[1] + m[8 + q] * v[2] + m[12 + q]; c.lo[q] = Math.min(c.lo[q], w); c.hi[q] = Math.max(c.hi[q], w); } }
          comps.set(r, c);
        }
        const capTris = new Set();
        for (const c of comps.values()) {
          const xs = c.hi[0] - c.lo[0], ys = c.hi[1] - c.lo[1], cx = (c.hi[0] + c.lo[0]) / 2, cy = (c.hi[1] + c.lo[1]) / 2;
          if (ys < 0.1 * barsW && Math.abs(cx) < 0.1 * barsW && xs > 0.05 * barsW && xs < 0.3 * barsW && gripsY - cy > 0.08 * barsW && c.tris.length >= 20) for (const t of c.tris) capTris.add(t);
        }
        if (!capTris.size) continue;
        const build = (keep) => {
          const np = doc.createPrimitive().setMode(pr.getMode()).setMaterial(pr.getMaterial());
          for (const sem of pr.listSemantics()) {
            const acc = pr.getAttribute(sem), es = acc.getElementSize(), src = acc.getArray(), list = [];
            for (let t = 0; t < tris; t++) if (keep(t)) for (let k = 0; k < 3; k++) list.push(ix(t * 3 + k));
            const arr = new src.constructor(list.length * es);
            list.forEach((vi, j) => { for (let q = 0; q < es; q++) arr[j * es + q] = src[vi * es + q]; });
            np.setAttribute(sem, doc.createAccessor().setType(acc.getType()).setArray(arr).setNormalized(acc.getNormalized()));
          }
          return np;
        };
        const capMesh = doc.createMesh('fuel_cap').addPrimitive(build((t) => capTris.has(t)));
        const capNode = doc.createNode('fuel_cap').setMesh(capMesh);
        WORLD.set(capNode, m); owner.set(capNode, 'body');
        const rest = build((t) => !capTris.has(t));
        mesh.removePrimitive(pr).addPrimitive(rest);
        console.log(`  ${id}: moved the fuel cap (${capTris.size} triangles) out of the handlebars`);
        scene.addChild(capNode);
      }
    }
    nodes = root.listNodes().filter((n) => n.getMesh());
  }
  // The Mud Pro has no seat part: its seat is part of the painted body panel. Cut it out (it sits on the top of the
  // rear half) so it can be black instead of taking the paint colour.
  if (id === 'atv1000') {
    for (const n of nodes.filter((q) => q.getName() === 'Paint')) {
      const m = W(n), mesh = n.getMesh();
      for (const pr of mesh.listPrimitives()) {
        const pos = pr.getAttribute('POSITION'), idx = pr.getIndices();
        const ix = (i) => (idx ? idx.getScalar(i) : i), tris = (idx ? idx.getCount() : pos.getCount()) / 3;
        const wp = (i) => { const v = [0, 0, 0]; pos.getElement(i, v); return [0, 1, 2].map((q) => m[q] * v[0] + m[4 + q] * v[1] + m[8 + q] * v[2] + m[12 + q]); };
        const seatTris = new Set();
        for (let t = 0; t < tris; t++) {
          const a = wp(ix(t * 3)), b = wp(ix(t * 3 + 1)), c = wp(ix(t * 3 + 2));
          const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
          if (cz > SEAT.z0 && cz < SEAT.z1 && cy > SEAT.y0 && cy < SEAT.y1 && Math.abs(cx) < SEAT.x) seatTris.add(t);
        }
        if (!seatTris.size) continue;
        const build = (keep) => {
          const np = doc.createPrimitive().setMode(pr.getMode()).setMaterial(pr.getMaterial());
          for (const sem of pr.listSemantics()) {
            const acc = pr.getAttribute(sem), es = acc.getElementSize(), src = acc.getArray(), list = [];
            for (let t = 0; t < tris; t++) if (keep(t)) for (let k = 0; k < 3; k++) list.push(ix(t * 3 + k));
            const arr = new src.constructor(list.length * es);
            list.forEach((vi, j) => { for (let q = 0; q < es; q++) arr[j * es + q] = src[vi * es + q]; });
            np.setAttribute(sem, doc.createAccessor().setType(acc.getType()).setArray(arr).setNormalized(acc.getNormalized()));
          }
          return np;
        };
        const seatPrim = build((t) => seatTris.has(t));
        seatPrim.setMaterial(pr.getMaterial().clone().setName('Seat').setBaseColorFactor(SEAT.debug ? [1, 0, 0, 1] : [0.012, 0.012, 0.012, 1]));
        const seatNode = doc.createNode('Seat').setMesh(doc.createMesh('Seat').addPrimitive(seatPrim));
        WORLD.set(seatNode, m); owner.set(seatNode, 'body');
        mesh.removePrimitive(pr).addPrimitive(build((t) => !seatTris.has(t)));
        scene.addChild(seatNode);
        console.log(`  ${id}: cut the seat out of the body panel (${seatTris.size} of ${tris} triangles)`);
      }
    }
    nodes = root.listNodes().filter((n) => n.getMesh());
  }
  // bounds of the real vertices (not the accessors' min / max boxes: the nodes are rotated, which inflates those)
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
  const by = (tag) => nodes.filter((n) => owner.get(n) === tag);
  const wb = {};
  for (let i = 1; i <= 4; i++) wb[i] = box(by('w' + i));
  // forward is the pack's -z: the two wheels with the smaller z are the front; the quad's left is -x
  const meanZ = (wb[1].c[2] + wb[2].c[2] + wb[3].c[2] + wb[4].c[2]) / 4;
  const front = [1, 2, 3, 4].filter((i) => wb[i].c[2] < meanZ), rear = [1, 2, 3, 4].filter((i) => !front.includes(i));
  const left = (list) => list.find((i) => wb[i].c[0] < 0), right = (list) => list.find((i) => wb[i].c[0] > 0);
  const WH = { FL: left(front), FR: right(front), RL: left(rear), RR: right(rear) };
  const zF = (wb[WH.FL].c[2] + wb[WH.FR].c[2]) / 2, zR = (wb[WH.RL].c[2] + wb[WH.RR].c[2]) / 2, zMid = (zF + zR) / 2;
  const yGround = Math.min(...[1, 2, 3, 4].map((i) => wb[i].lo[1]));
  // the bars: grips near the top of the bars (the Seat part is the crossbar when there is one)
  const barsAll = by('bars'), crossbar = barsAll.filter((n) => /Seat/i.test(n.getName()));
  let gripBox = box(crossbar.length ? crossbar : barsAll);
  if (!crossbar.length) {
    const sb = gripBox, lo = [sb.lo[0], sb.hi[1] - 0.14 * sb.s[1], sb.lo[2]], hi = [sb.hi[0], sb.hi[1] - 0.04 * sb.s[1], sb.hi[2]];
    gripBox = { lo, hi, c: lo.map((v, i) => (v + hi[i]) / 2), s: lo.map((v, i) => hi[i] - v) };
  }
  // scale: the grips end up as high as the old model's (the rider pose depends on it)
  const s = old.attach.gripL[1] / (gripBox.c[1] - yGround);
  const wheelbaseOld = old.wheels.zF - old.wheels.zR;
  const g = wheelbaseOld / ((zR - zF) * s);      // lengthways stretch of the body so the wheelbase fits the physics
  // pack (x, y, z) -> model (X forward, Y up, Z right)
  const bodyMap = ([x, y, z]) => [g * s * (zMid - z) + old.comX, s * (y - yGround), s * x];
  const wheelMap = (zc) => ([x, y, z]) => [s * (zc - z) + g * s * (zMid - zc) + old.comX, s * (y - yGround), s * x];
  const mapFor = {};
  mapFor.body = bodyMap; mapFor.bars = bodyMap;
  for (let i = 1; i <= 4; i++) mapFor['w' + i] = wheelMap(wb[i].c[2]);
  // bake the world transform + map into every vertex
  for (const n of nodes) {
    const m = W(n), map = mapFor[owner.get(n)];
    // normal matrix = inverse transpose of the 3x3
    const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], gg = m[2], h = m[6], k = m[10];
    const det = a * (e * k - f * h) - b * (d * k - f * gg) + c * (d * h - e * gg);
    const inv = [(e * k - f * h) / det, (c * h - b * k) / det, (b * f - c * e) / det, (f * gg - d * k) / det, (a * k - c * gg) / det, (c * d - a * f) / det, (d * h - e * gg) / det, (b * gg - a * h) / det, (a * e - b * d) / det];
    for (const p of n.getMesh().listPrimitives()) {
      const pos = p.getAttribute('POSITION'), nor = p.getAttribute('NORMAL');
      const v = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        pos.setElement(i, map([m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]));
      }
      if (nor) for (let i = 0; i < nor.getCount(); i++) {
        nor.getElement(i, v);
        const w = [inv[0] * v[0] + inv[3] * v[1] + inv[6] * v[2], inv[1] * v[0] + inv[4] * v[1] + inv[7] * v[2], inv[2] * v[0] + inv[5] * v[1] + inv[8] * v[2]];
        const l = Math.hypot(...w) || 1;
        nor.setElement(i, [-w[2] / l, w[1] / l, w[0] / l]);
      }
    }
    n.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
  // materials: the paint panel and the rims get their own names so paint and skins land on them
  for (const n of nodes) if (/^Seat$/i.test(n.getName())) for (const p of n.getMesh().listPrimitives()) p.setMaterial(p.getMaterial().clone().setName('Seat').setBaseColorFactor([0.012, 0.012, 0.012, 1]));
  let paintMat = null, rimMat = null, accentMat = null;
  // the Mud Pro's cage rails take the paint's second colour, so they can be coloured from the garage too
  const railsAreAccent = id === 'atv1000';
  for (const n of nodes) {
    const nm = n.getName();
    for (const p of n.getMesh().listPrimitives()) {
      if (/^Paint/i.test(nm)) { if (!paintMat) paintMat = p.getMaterial().clone().setName('body_paint').setBaseColorFactor([0.2, 0.2, 0.2, 1]); p.setMaterial(paintMat); }
      else if (railsAreAccent && /^(Frame|bars_Frame)$/.test(nm)) { if (!accentMat) accentMat = p.getMaterial().clone().setName('accent_paint').setBaseColorFactor([0.25, 0.25, 0.25, 1]); p.setMaterial(accentMat); }
      else if (/^Rim/i.test(nm)) { if (!rimMat) rimMat = p.getMaterial().clone().setName('rim_paint').setBaseColorFactor([0.3, 0.3, 0.3, 1]); p.setMaterial(rimMat); }
    }
  }
  // groups (the old hierarchy is left behind empty and pruned)
  const groups = { body: by('body'), handlebars: by('bars') };
  for (const k of ['FL', 'FR', 'RL', 'RR']) groups['wheel_' + k] = by('w' + WH[k]);
  const top = doc.createNode(id);
  for (const [name, list] of Object.entries(groups)) {
    const grp = doc.createNode(name);
    for (const n of list) { const par = n.getParentNode(); if (par) par.removeChild(n); else scene.removeChild(n); grp.addChild(n); }
    top.addChild(grp);
  }
  for (const n of root.listNodes()) if (!n.getParentNode() && n !== top && !n.getMesh() && scene.listChildren().includes(n)) scene.removeChild(n); // old empty hierarchy
  scene.addChild(top);
  // new steering pivot + grips from the new bars (the tilt of the axis stays as measured before)
  const pc = bodyMap([0, gripBox.c[1], gripBox.c[2]]);
  const dx = old.steerAxisTo[0] - old.steerPivot[0], dy = old.steerAxisTo[1] - old.steerPivot[1];
  const inset = gripBox.s[0] * 0.07;
  const gL = bodyMap([gripBox.lo[0] + inset, gripBox.c[1], gripBox.c[2]]), gR = bodyMap([gripBox.hi[0] - inset, gripBox.c[1], gripBox.c[2]]);
  out[id] = {
    ...old,
    wheels: { ...old.wheels, rF: r3((wb[WH.FL].s[1] / 2) * s), rR: r3((wb[WH.RL].s[1] / 2) * s) }, // tyre radius = what you see
    steerPivot: [r3(pc[0]), r3(pc[1]), 0], steerAxisTo: [r3(pc[0] + dx), r3(pc[1] + dy), 0],
    attach: { ...old.attach, gripL: [r3(gL[0]), r3(gL[1]), r3(Math.min(gL[2], gR[2]))], gripR: [r3(gR[0]), r3(gR[1]), r3(Math.max(gL[2], gR[2]))] },
  };
  await doc.transform(dedup(), join({ keepNamed: false }), weld({ tolerance: 0.0005 }), simplify({ simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.002, lockBorder: true }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const dest = `client/models/quad_${id}.glb`;
  await io.write(dest, doc);
  let tris = 0;
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) tris += p.getIndices().getCount() / 3;
  const rF = (wb[WH.FL].s[1] / 2) * s, rR = (wb[WH.RL].s[1] / 2) * s;
  console.log(`${id.padEnd(8)} ${Math.round(tris)} tris, ${(fs.statSync(dest).size / 1024).toFixed(0)} KB, scale ${s.toFixed(3)}, body stretch x${g.toFixed(2)}, tyre radius ${rF.toFixed(3)} / ${rR.toFixed(3)} (physics ${old.wheels.rF} / ${old.wheels.rR}), wheels ${JSON.stringify(WH)}`);
}
fs.writeFileSync('shared/quadModels.js', `// Measured by tools/bake-quads.mjs / bake-quads2.mjs - do not edit by hand, bake again.
// Per quad: model file, centre of mass offset (comX), steering axis, swingarm pivot, rider
// points (model space: +x forward, -z left) and wheel centres / tyre radii for the physics.
export const QUAD_MODELS = ${JSON.stringify(out, null, 2).replace(/\[\s+([^\]]+?)\s+\]/g, (m, v) => '[' + v.split(/,\s*/).join(', ') + ']').replace(/"(\w+)":/g, '$1:').replace(/"/g, "'")};
`);
console.log('wrote shared/quadModels.js');
