// Rider helmet: dirtbike_helmet.glb (Sketchfab, two meshes: black shell + gold
// goggle lens) -> client/models/rider_helmet.glb.
//   node tools/bake-helmet-mx.mjs in.glb [out.glb]
// - turns it to face -z (what buildHelmet in modelRig.js expects), y up
// - simplifies the 24k-triangle shell to about 7k (six riders on screen)
// - keeps two meshes: "shell" (the game paints it per rider) and "lens"
import fs from 'fs';
import { MeshoptSimplifier } from './node_modules/meshoptimizer/index.module.js';

const [src, out = 'client/models/rider_helmet.glb'] = process.argv.slice(2);
const buf = fs.readFileSync(src);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const bin = buf.slice(20 + jsonLen + 8);

// ---- read: world matrix of every node, then each mesh's triangles in world space
const mul = (a, b) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; };
const local = (n) => {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
};
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function readAccessor(i) {
  const a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
  const off = (v.byteOffset || 0) + (a.byteOffset || 0), stride = v.byteStride || n * T.BYTES_PER_ELEMENT;
  const outA = new (T === Float32Array ? Float32Array : Uint32Array)(a.count * n);
  const dv = new DataView(bin.buffer, bin.byteOffset);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
    const p = off + k * stride + c * T.BYTES_PER_ELEMENT;
    outA[k * n + c] = T === Float32Array ? dv.getFloat32(p, true) : T === Uint32Array ? dv.getUint32(p, true) : T === Uint16Array ? dv.getUint16(p, true) : dv.getUint8(p);
  }
  return outA;
}
const meshes = {};
const walk = (i, parent) => {
  const n = gltf.nodes[i], w = mul(parent, local(n));
  if (n.mesh !== undefined) {
    const pos = [], idx = [];
    for (const pr of gltf.meshes[n.mesh].primitives) {
      const P = readAccessor(pr.attributes.POSITION), base = pos.length / 3;
      for (let k = 0; k < P.length; k += 3) {
        const x = P[k], y = P[k + 1], z = P[k + 2];
        pos.push(w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13], w[2] * x + w[6] * y + w[10] * z + w[14]);
      }
      const ix = pr.indices !== undefined ? readAccessor(pr.indices) : P.map((_, k) => k).filter((k) => k < P.length / 3);
      for (const k of ix) idx.push(base + k);
    }
    meshes[n.name] = { pos, idx };
  }
  for (const c of n.children || []) walk(c, w);
};
for (const r of gltf.scenes[gltf.scene || 0].nodes) walk(r, I);
const shell = meshes.Object_3, lens = meshes.Object_2;
if (!shell || !lens) throw new Error('expected Object_3 (shell) and Object_2 (lens)');

// ---- turn: the lens sits in front of the shell. Find the yaw that makes the
// helmet narrowest across (its long axis along z), lens towards -z.
const centroid = (m) => { let x = 0, z = 0; const n = m.pos.length / 3; for (let k = 0; k < m.pos.length; k += 3) { x += m.pos[k]; z += m.pos[k + 2]; } return [x / n, z / n]; };
const [sx, sz] = centroid(shell), [lx, lz] = centroid(lens);
const yaw0 = Math.atan2(lx - sx, lz - sz); // angle of the face direction from +z
const width = (a) => { let lo = 1e9, hi = -1e9; const c = Math.cos(a), s = Math.sin(a); for (let k = 0; k < shell.pos.length; k += 9) { const x = shell.pos[k] * c - shell.pos[k + 2] * s; lo = Math.min(lo, x); hi = Math.max(hi, x); } return hi - lo; };
let best = yaw0, bw = 1e9;
for (let d = -0.35; d <= 0.35; d += 0.005) { const w = width(yaw0 + d); if (w < bw) { bw = w; best = yaw0 + d; } }
// rotate by -best about y (face -> +z), then half a turn (face -> -z)
const rot = -best + Math.PI, c = Math.cos(rot), s = Math.sin(rot);
for (const m of [shell, lens]) for (let k = 0; k < m.pos.length; k += 3) { const x = m.pos[k], z = m.pos[k + 2]; m.pos[k] = x * c + z * s; m.pos[k + 2] = -x * s + z * c; }
// centre on x (so the shell is symmetric), keep units (the game scales it)
let x0 = 1e9, x1 = -1e9;
for (let k = 0; k < shell.pos.length; k += 3) { x0 = Math.min(x0, shell.pos[k]); x1 = Math.max(x1, shell.pos[k]); }
for (const m of [shell, lens]) for (let k = 0; k < m.pos.length; k += 3) m.pos[k] -= (x0 + x1) / 2;

// ---- weld + simplify the shell
function weld(m) {
  const map = new Map(), pos = [], remap = [];
  for (let k = 0; k < m.pos.length / 3; k++) {
    const key = m.pos.slice(k * 3, k * 3 + 3).map((v) => Math.round(v * 1e4)).join(',');
    if (!map.has(key)) { map.set(key, pos.length / 3); pos.push(m.pos[k * 3], m.pos[k * 3 + 1], m.pos[k * 3 + 2]); }
    remap.push(map.get(key));
  }
  return { pos, idx: m.idx.map((i) => remap[i]) };
}
await MeshoptSimplifier.ready;
function simplify(m, ratio) {
  const w = weld(m);
  const P = new Float32Array(w.pos), target = Math.floor((w.idx.length / 3) * ratio) * 3;
  const [idx] = MeshoptSimplifier.simplify(new Uint32Array(w.idx), P, 3, target, 0.01, []);
  // drop unused vertices
  const used = new Map(), pos = [];
  const out = Array.from(idx, (i) => { if (!used.has(i)) { used.set(i, pos.length / 3); pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); } return used.get(i); });
  return { pos, idx: out };
}
const S = simplify(shell, 0.3), L = simplify(lens, 0.6);
console.log(`shell ${shell.idx.length / 3} -> ${S.idx.length / 3} tris, lens ${lens.idx.length / 3} -> ${L.idx.length / 3} tris, turned ${(rot * 180 / Math.PI).toFixed(1)} deg`);

// smooth normals (area-weighted, per welded vertex)
function normals(m) {
  const n = new Float32Array(m.pos.length);
  for (let t = 0; t < m.idx.length; t += 3) {
    const [a, b, d] = [m.idx[t], m.idx[t + 1], m.idx[t + 2]];
    const ux = m.pos[b * 3] - m.pos[a * 3], uy = m.pos[b * 3 + 1] - m.pos[a * 3 + 1], uz = m.pos[b * 3 + 2] - m.pos[a * 3 + 2];
    const vx = m.pos[d * 3] - m.pos[a * 3], vy = m.pos[d * 3 + 1] - m.pos[a * 3 + 1], vz = m.pos[d * 3 + 2] - m.pos[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, d]) { n[v * 3] += nx; n[v * 3 + 1] += ny; n[v * 3 + 2] += nz; }
  }
  for (let k = 0; k < n.length; k += 3) { const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1; n[k] /= l; n[k + 1] /= l; n[k + 2] /= l; }
  return n;
}

// ---- write the glb
const parts = [];
let byteLen = 0;
const views = [], accessors = [];
function addView(arr, target) {
  const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  const pad = (4 - (b.length % 4)) % 4;
  views.push({ buffer: 0, byteOffset: byteLen, byteLength: b.length, target });
  parts.push(b, Buffer.alloc(pad)); byteLen += b.length + pad;
  return views.length - 1;
}
function addMesh(m) {
  const P = new Float32Array(m.pos), N = normals(m), X = new Uint32Array(m.idx);
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let k = 0; k < P.length; k += 3) for (let c2 = 0; c2 < 3; c2++) { mn[c2] = Math.min(mn[c2], P[k + c2]); mx[c2] = Math.max(mx[c2], P[k + c2]); }
  accessors.push({ bufferView: addView(P, 34962), componentType: 5126, count: P.length / 3, type: 'VEC3', min: mn, max: mx });
  accessors.push({ bufferView: addView(N, 34962), componentType: 5126, count: N.length / 3, type: 'VEC3' });
  accessors.push({ bufferView: addView(X, 34963), componentType: 5125, count: X.length, type: 'SCALAR' });
  return accessors.length - 3;
}
const a0 = addMesh(S), a1 = addMesh(L);
const json = {
  asset: { version: '2.0', generator: 'ridgeline bake-helmet-mx' },
  scene: 0, scenes: [{ nodes: [0, 1] }],
  nodes: [{ name: 'shell', mesh: 0 }, { name: 'lens', mesh: 1 }],
  materials: [{ name: 'shell', pbrMetallicRoughness: { baseColorFactor: [0.05, 0.05, 0.05, 1], metallicFactor: 0.05, roughnessFactor: 0.4 } },
    { name: 'lens', alphaMode: 'BLEND', pbrMetallicRoughness: { baseColorFactor: [1, 0.87, 0.1, 0.6], metallicFactor: 0.6, roughnessFactor: 0.15 } }],
  meshes: [{ name: 'shell', primitives: [{ attributes: { POSITION: a0, NORMAL: a0 + 1 }, indices: a0 + 2, material: 0 }] },
    { name: 'lens', primitives: [{ attributes: { POSITION: a1, NORMAL: a1 + 1 }, indices: a1 + 2, material: 1 }] }],
  buffers: [{ byteLength: byteLen }], bufferViews: views, accessors,
};
let js = Buffer.from(JSON.stringify(json));
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const body = Buffer.concat(parts);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + body.length, 8);
const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
fs.writeFileSync(out, Buffer.concat([head, ch(js.length, 0x4e4f534a), js, ch(body.length, 0x004e4942), body]));
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
