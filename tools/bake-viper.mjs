// Viper models: the dune buggy GLBs (Sketchfab, ~210k triangles, 7.5 MB each)
// -> slim, rigged models for the game.
//   node tools/bake-viper.mjs in.glb out.glb
// - groups the parts into wheel_FL / wheel_FR / wheel_RL / wheel_RR (tyre, rim,
//   hub - everything inside each wheel), steering_wheel and the body
// - turns it to face +x (the way MODELS expect it; the buggy faces +z)
// - welds + simplifies (about 1/8 of the triangles), shrinks the tyre texture,
//   meshopt-compresses the result (the game loads it with the meshopt decoder)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, join, weld, simplify, dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const [src, out] = process.argv.slice(2);
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
const root = doc.getRoot(), scene = root.listScenes()[0];
await doc.transform(flatten()); // every mesh node straight under the scene, world transforms in its TRS

// world bounding box of a mesh node
const mul = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
function box(node) {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], m = node.getWorldMatrix();
  for (const p of node.getMesh().listPrimitives()) {
    const a = p.getAttribute('POSITION'), mn = a.getMin([]), mx = a.getMax([]);
    for (const c of [[mn[0], mn[1], mn[2]], [mx[0], mx[1], mx[2]], [mn[0], mx[1], mn[2]], [mx[0], mn[1], mx[2]], [mn[0], mn[1], mx[2]], [mx[0], mx[1], mn[2]], [mn[0], mx[1], mx[2]], [mx[0], mn[1], mn[2]]]) {
      const w = mul(m, c);
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], w[i]); hi[i] = Math.max(hi[i], w[i]); }
    }
  }
  return { c: lo.map((v, i) => (v + hi[i]) / 2), s: lo.map((v, i) => hi[i] - v) };
}
const meshNodes = root.listNodes().filter((n) => n.getMesh());
const info = new Map(meshNodes.map((n) => [n, box(n)]));

// the four road wheels: the rubber tyres low down (the spare on the back sits high)
const rubber = meshNodes.filter((n) => n.getMesh().listPrimitives().some((p) => (p.getMaterial() && p.getMaterial().getName()) === 'rubber') && info.get(n).c[1] < 0.8 && info.get(n).s[1] > 0.5);
const tyres = []; // one per wheel (each wheel has a tread and a sidewall mesh)
for (const n of rubber) if (!tyres.some((t) => Math.hypot(...info.get(t).c.map((v, i) => v - info.get(n).c[i])) < 0.3)) tyres.push(n);
if (tyres.length !== 4) throw new Error('expected 4 road tyres, found ' + tyres.length);
// buggy faces +z, so +x is its left
const wheels = tyres.map((n) => { const { c } = info.get(n); return { name: 'wheel_' + (c[2] > 0 ? 'F' : 'R') + (c[0] > 0 ? 'L' : 'R'), c, nodes: [] }; });
// steering wheel: the round black part in front of the driver's seat
const steer = meshNodes.filter((n) => n.getName().startsWith('NurbsCircle'));
const groups = Object.fromEntries([...wheels.map((w) => [w.name, []]), ['steering_wheel', []], ['body', []]]);
for (const n of meshNodes) {
  const { c, s } = info.get(n);
  const w = wheels.find((W) => Math.abs(c[0] - W.c[0]) < 0.25 && Math.hypot(c[1] - W.c[1], c[2] - W.c[2]) < 0.25 && Math.max(s[1], s[2]) < 0.95);
  if (w) groups[w.name].push(n);
  else if (steer.includes(n)) groups.steering_wheel.push(n);
  else groups.body.push(n);
}
// the turned top node with one child per group (meshes keep their world transforms)
const top = doc.createNode('viper').setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]); // +90 deg about y: +z -> +x
for (const [name, list] of Object.entries(groups)) {
  const g = doc.createNode(name);
  for (const n of list) { for (const p of n.listParents()) if (p !== root && p.removeChild) p.removeChild(n); scene.removeChild(n); g.addChild(n); }
  top.addChild(g);
  console.log(name.padEnd(15), list.length, 'parts');
}
scene.addChild(top);

// the tyre texture: 512 px is plenty at game size
for (const t of root.listTextures()) {
  const img = t.getImage();
  if (!img || img.byteLength < 200_000) continue;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viper-'));
  const a = path.join(dir, 'in'), b = path.join(dir, 'out.png');
  fs.writeFileSync(a, img);
  const r = spawnSync('python3', ['-c', `from PIL import Image; im=Image.open('${a}'); im.thumbnail((512,512)); im.save('${b}', optimize=True)`]);
  if (r.status === 0) { t.setImage(new Uint8Array(fs.readFileSync(b))).setMimeType('image/png'); console.log('texture', img.byteLength, '->', fs.statSync(b).size); }
}

await doc.transform(
  dedup(), join({ keepNamed: false }), weld({ tolerance: 0.0005 }), // one mesh per material per group, so it all simplifies
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.1, error: 0.003, lockBorder: true }), // locked borders: thin tubes do not grow spikes
  prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
let tris = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
await io.write(out, doc);
console.log(`wrote ${out}: ${Math.round(tris)} triangles, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
