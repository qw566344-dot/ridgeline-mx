// Prints what is inside a .glb: node tree (names, positions), meshes, triangle
// counts, materials, textures and the overall size.
//   node tools/inspect-glb.js file.glb [more.glb...]
import fs from 'fs';

for (const file of process.argv.slice(2)) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  console.log(`\n=== ${file} (${(buf.length / 1048576).toFixed(1)} MB) ===`);
  const acc = gltf.accessors || [];
  let tris = 0;
  const meshTris = (gltf.meshes || []).map((m) => m.primitives.reduce((a, p) => a + (p.indices !== undefined ? acc[p.indices].count / 3 : acc[p.attributes.POSITION].count / 3), 0));
  // bounds per node (world), walking the tree
  const nodes = gltf.nodes || [];
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; };
  const local = (n) => {
    if (n.matrix) return n.matrix;
    const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
    return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
      2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
      2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
  };
  const all = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
  const rows = [];
  const walk = (i, parent, depth) => {
    const n = nodes[i];
    const w = mul(parent, local(n));
    let info = '';
    if (n.mesh !== undefined) {
      tris += meshTris[n.mesh];
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (const p of gltf.meshes[n.mesh].primitives) {
        const a = acc[p.attributes.POSITION];
        for (const cx of [0, 1]) for (const cy of [0, 1]) for (const cz of [0, 1]) {
          const v = [cx ? a.max[0] : a.min[0], cy ? a.max[1] : a.min[1], cz ? a.max[2] : a.min[2]];
          const t = [0, 1, 2].map((r) => w[r] * v[0] + w[4 + r] * v[1] + w[8 + r] * v[2] + w[12 + r]);
          for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], t[k]); mx[k] = Math.max(mx[k], t[k]); all.min[k] = Math.min(all.min[k], t[k]); all.max[k] = Math.max(all.max[k], t[k]); }
        }
      }
      const mats = [...new Set(gltf.meshes[n.mesh].primitives.map((p) => (gltf.materials[p.material] || {}).name))].join(',');
      info = ` mesh ${meshTris[n.mesh] | 0} tris [${mats}] centre (${mn.map((v, k) => ((v + mx[k]) / 2).toFixed(2)).join(', ')}) size (${mn.map((v, k) => (mx[k] - v).toFixed(2)).join(' x ')})`;
    }
    const t = n.translation ? ` at (${n.translation.map((v) => v.toFixed(2)).join(', ')})` : '';
    rows.push(`${'  '.repeat(depth)}${n.name || '(unnamed)'}${t}${n.rotation ? ' rot' : ''}${n.scale ? ' scale ' + n.scale.map((v) => v.toFixed(2)) : ''}${info}`);
    for (const c of n.children || []) walk(c, w, depth + 1);
  };
  const scene = gltf.scenes[gltf.scene || 0];
  for (const r of scene.nodes) walk(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 0);
  console.log(rows.join('\n'));
  console.log(`total ${tris | 0} triangles, ${nodes.length} nodes, ${(gltf.meshes || []).length} meshes`);
  console.log(`bounds x ${all.min[0].toFixed(2)}..${all.max[0].toFixed(2)}  y ${all.min[1].toFixed(2)}..${all.max[1].toFixed(2)}  z ${all.min[2].toFixed(2)}..${all.max[2].toFixed(2)}`);
  console.log('materials:', (gltf.materials || []).map((m) => `${m.name}${m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorTexture ? '(tex)' : ''} ${m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorFactor ? m.pbrMetallicRoughness.baseColorFactor.map((x) => x.toFixed(2)).join('/') : ''}`).join(' | '));
  console.log('textures:', (gltf.images || []).map((im) => `${im.name || ''} ${im.mimeType || ''} ${im.bufferView !== undefined ? (gltf.bufferViews[im.bufferView].byteLength / 1024).toFixed(0) + 'KB' : im.uri}`).join(', ') || 'none');
  console.log('extensions:', (gltf.extensionsUsed || []).join(', ') || 'none', ' animations:', (gltf.animations || []).length);
  void binStart;
}
