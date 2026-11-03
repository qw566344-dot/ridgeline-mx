// The Supermoto Factory model -> client/models/supermoto_factory.glb, rigged like the KX dirt bike
// (same size and layout): its loose parts are grouped into the nodes the bike rig moves -
// front_end (bars, plastics that turn), fork_lowers (slide with the suspension), swingarm,
// wheel_front, wheel_rear - everything else is the body. The rim parts get a 'rim_' material so
// the pass rim styles reach them.
//   node tools/bake-supermoto.mjs path/to/supermoto_factory.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import fs from 'fs';

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(process.argv[2]);
const root = doc.getRoot(), scene = root.listScenes()[0];
await doc.transform(flatten());
const groups = { body: [], front_end: [], fork_lowers: [], swingarm: [], wheel_front: [], wheel_rear: [] };
for (const n of root.listNodes().filter((x) => x.getMesh())) {
  const nm = n.getName();
  const g = /^front_end_/.test(nm) ? 'front_end' : /^fork_lowers_/.test(nm) ? 'fork_lowers' : /^swingarm_/.test(nm) ? 'swingarm'
    : /^wheel_front_/.test(nm) || nm === 'front_caliper' ? (nm === 'front_caliper' ? 'fork_lowers' : 'wheel_front') : /^wheel_rear_/.test(nm) ? 'wheel_rear' : 'body';
  groups[g].push(n);
  if (/_rim$/.test(nm)) for (const p of n.getMesh().listPrimitives()) { const m = p.getMaterial(), c = m.getBaseColorFactor(); p.setMaterial(m.clone().setName('rim_' + m.getName()).setBaseColorFactor([c[0] + 0.004, c[1] + 0.004, c[2] + 0.004, c[3]])); } // not identical, or dedup merges it back
}
const top = doc.createNode('supermoto');
for (const [name, list] of Object.entries(groups)) {
  const g = doc.createNode(name);
  for (const n of list) { for (const p of n.listParents()) if (p !== root && p.removeChild) p.removeChild(n); g.addChild(n); }
  top.addChild(g);
}
for (const c of scene.listChildren()) scene.removeChild(c);
scene.addChild(top);
await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const file = 'client/models/supermoto_factory.glb';
await io.write(file, doc);
console.log(Object.entries(groups).map(([k, v]) => `${k}:${v.length}`).join(' '), (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
