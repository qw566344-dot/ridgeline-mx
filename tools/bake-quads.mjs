// Quad models: the "ATV Garage" low-poly pack (one GLB per quad, named parts)
// -> client/models/quad_<id>.glb + shared/quadModels.js (measured rig points).
//   node tools/bake-quads.mjs "path/to/ATV Models"
// - turns each quad to face +x (MODELS convention; the pack faces +z)
// - groups the parts the rig moves: wheel_FL/FR/RL/RR, handlebars, the front
//   a-arms / knuckles / shocks per side, the rear swingarm + axle and its shock
//   (named by where they are: front-left is the quad's left when riding it)
// - bodywork (fenders, nose, tank, tail, side covers) gets its own 'body_paint'
//   material so paint and skins land there, not on the footboards
// - simplifies the heavy tyres, meshopt-compresses
// - measures seat, footboards, grips, steering axis and wheels for the config
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, join, weld, simplify, dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import fs from 'fs';
import path from 'path';

const PACK = process.argv[2];
const QUADS = { atv450: 'Pro 450R/pro-450r', atv700: 'Pro 700 Brute/pro-700-brute', atv250: 'Sport 250/sport-250', atv1000: 'Mud Pro 1000/mud-pro-1000', atv90: 'Pit Quad 90/pit-quad-90', atv450w: 'Pro 450R Works/pro-450r-works' };
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const r3 = (v) => Math.round(v * 1000) / 1000;
const mul = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
// pack coords (+z forward, +x = the quad's left) -> model coords (+x forward, -z = left)
const turn = ([x, y, z]) => [r3(z), r3(y), r3(-x)];
const out = {};

for (const [id, rel] of Object.entries(QUADS)) {
  const doc = await io.read(path.join(PACK, rel + '.glb'));
  const root = doc.getRoot(), scene = root.listScenes()[0];
  await doc.transform(flatten());
  const nodes = root.listNodes().filter((n) => n.getMesh());
  const box = (list) => {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const n of list) {
      const m = n.getWorldMatrix();
      for (const p of n.getMesh().listPrimitives()) {
        const a = p.getAttribute('POSITION'), mn = a.getMin([]), mx = a.getMax([]);
        for (let k = 0; k < 8; k++) {
          const w = mul(m, [k & 1 ? mx[0] : mn[0], k & 2 ? mx[1] : mn[1], k & 4 ? mx[2] : mn[2]]);
          for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], w[i]); hi[i] = Math.max(hi[i], w[i]); }
        }
      }
    }
    return { lo, hi, c: lo.map((v, i) => (v + hi[i]) / 2), s: lo.map((v, i) => hi[i] - v) };
  };
  const named = (re) => nodes.filter((n) => re.test(n.getName()));
  // which pack side is the quad's left: +x (see turn)
  const side = (n) => (box([n]).c[0] > 0 ? 'L' : 'R');
  const groups = {};
  const put = (g, n) => (groups[g] = groups[g] || []).push(n);
  for (const n of nodes) {
    const nm = n.getName();
    let m;
    if ((m = nm.match(/^wheel_(front|rear)_[LR]_/))) put('wheel_' + (m[1] === 'front' ? 'F' : 'R') + side(n), n);
    else if (/^(handlebar_|grip_|lever|bar_clamp|display|steering_column)/.test(nm)) put('handlebars', n);
    else if ((m = nm.match(/^a_arm_(upper|lower)_/))) put(`a_arm_${m[1]}_F${side(n)}`, n);
    else if (/^knuckle_/.test(nm)) put('knuckle_F' + side(n), n);
    else if (/^shock_front_/.test(nm)) put('shock_F' + side(n), n);
    else if (/^shock_rear_/.test(nm)) put('shock_R', n);
    else if (/^(swingarm_|rear_axle|axle_carrier|brake_disc|sprocket)/.test(nm)) put('swingarm', n);
    else put('body', n);
  }
  // bodywork -> its own paint material (a copy of what it was)
  const panels = nodes.filter((n) => /^(rear_fender_[LR]|front_fender_[LR]|nose_[LR]|tank_[LR]|tail|side_cover_[LR]|nose_intake)$/.test(n.getName()));
  let paintMat = null;
  for (const n of panels) for (const p of n.getMesh().listPrimitives()) {
    if (!paintMat) paintMat = p.getMaterial().clone().setName('body_paint').setBaseColorFactor([0.2, 0.2, 0.2, 1]); // not identical, or dedup merges it back
    p.setMaterial(paintMat);
  }
  // measurements (before anything moves)
  const wb = Object.fromEntries(['FL', 'FR', 'RL', 'RR'].map((k) => [k, box(groups['wheel_' + k])]));
  const seat = box(named(/^seat_/)), foot = box(named(/^footboard_[LR]$/)), col = box(named(/^steering_column$/));
  const grips = named(/^grip_/).map((n) => box([n]).c);
  const swing = box(groups.swingarm.filter((n) => /^swingarm_/.test(n.getName())));
  const footL = box(named(/^footboard_[LR]$/).filter((n) => side(n) === 'L'));
  const gripL = grips.find((c) => c[0] > 0), gripR = grips.find((c) => c[0] < 0);
  const wF = wb.FL, wR = wb.RL;
  const comZ = (wF.c[2] + wR.c[2]) / 2; // the middle of the wheelbase
  out[id] = {
    file: `models/quad_${id}.glb`, comX: r3(comZ),
    // steering: about the column, from the bar clamp at the top to its foot
    steerPivot: turn([0, col.hi[1], col.lo[2] + 0.02]), steerAxisTo: turn([0, col.lo[1], col.hi[2] - 0.02]),
    rearPivot: turn([0, swing.c[1] + swing.s[1] * 0.25, swing.hi[2]]),
    attach: {
      seat: turn([0, seat.hi[1] + 0.02, seat.c[2] + seat.s[2] * 0.18]),
      pegL: turn([footL.c[0], foot.hi[1] + 0.02, foot.c[2]]), pegR: turn([-footL.c[0], foot.hi[1] + 0.02, foot.c[2]]),
      gripL: turn(gripL), gripR: turn(gripR),
    },
    // for the physics: wheel centres relative to the middle of the wheelbase, tyre radius
    wheels: { zF: r3(wF.c[2] - comZ), zR: r3(wR.c[2] - comZ), xF: r3(Math.abs(wF.c[0])), xR: r3(Math.abs(wR.c[0])), rF: r3(wF.s[1] / 2), rR: r3(wR.s[1] / 2) },
    size: { length: r3(box(nodes).s[2]), width: r3(box(nodes).s[0]) },
  };
  // regroup under one turned top node
  const top = doc.createNode(id).setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]); // +90 deg about y: +z -> +x
  for (const [name, list] of Object.entries(groups)) {
    const g = doc.createNode(name);
    for (const n of list) { scene.removeChild(n); g.addChild(n); }
    top.addChild(g);
  }
  scene.addChild(top);
  await doc.transform(dedup(), join({ keepNamed: false }), weld({ tolerance: 0.0005 }), simplify({ simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.002, lockBorder: true }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = `client/models/quad_${id}.glb`;
  await io.write(file, doc);
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
  console.log(`${id.padEnd(8)} ${rel.split('/')[0].padEnd(16)} ${Math.round(tris)} triangles, ${(fs.statSync(file).size / 1024).toFixed(0)} KB, groups: ${Object.keys(groups).join(' ')}`);
}

fs.writeFileSync('shared/quadModels.js', `// Measured by tools/bake-quads.mjs from the ATV Garage pack - do not edit by hand, bake again.
// Per quad: model file, centre of mass offset (comX), steering axis, swingarm pivot, rider
// points (model space: +x forward, -z left) and wheel centres / tyre radii for the physics.
export const QUAD_MODELS = ${JSON.stringify(out, null, 2).replace(/\[\s+([^\]]+?)\s+\]/g, (m, v) => '[' + v.split(/,\s*/).join(', ') + ']').replace(/"(\w+)":/g, '$1:').replace(/"/g, "'")};
`);
console.log('wrote shared/quadModels.js');
