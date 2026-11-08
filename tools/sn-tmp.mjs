import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const f3 = (v) => v.map((x) => +x.toFixed(2)).join(',');
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f); console.log('==', f.split(/[\/]/).pop(), 'nodes', doc.getRoot().listNodes().length, 'meshes', doc.getRoot().listMeshes().length, 'mats', doc.getRoot().listMaterials().map((m) => m.getName()).join('/'));
  const depth = (n) => { let d = 0, p = n.getParentNode(); while (p) { d++; p = p.getParentNode(); } return d; };
  for (const n of doc.getRoot().listNodes()) {
    const m = n.getWorldMatrix(); let bb = '';
    if (n.getMesh()) { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; let tr = 0; for (const p of n.getMesh().listPrimitives()) { const a = p.getAttribute('POSITION'); tr += (p.getIndices() ? p.getIndices().getCount() : a.getCount()) / 3; const v = [0, 0, 0]; for (let i = 0; i < a.getCount(); i += 3) { a.getElement(i, v); for (let k = 0; k < 3; k++) { const w = m[k] * v[0] + m[4 + k] * v[1] + m[8 + k] * v[2] + m[12 + k]; lo[k] = Math.min(lo[k], w); hi[k] = Math.max(hi[k], w); } } } bb = ' tris ' + tr + ' [' + f3(lo) + ']..[' + f3(hi) + '] mat ' + n.getMesh().listPrimitives().map((p) => p.getMaterial() && p.getMaterial().getName()).join('/'); }
    console.log('  '.repeat(depth(n)) + n.getName(), 'T', f3(n.getTranslation()), 'S', f3(n.getScale()), bb);
  }
}
