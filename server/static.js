// Serves the game files (client/ and shared/) over plain HTTP.
// Files are always revalidated (ETag -> 304 when unchanged, so the browser never runs a stale module
// but also never re-downloads one), and text files are gzipped: far less data per visit.
const GZ = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.gltf']);
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

function send(req, res, file, st) {
  const ext = path.extname(file).toLowerCase();
  const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  const head = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag, Vary: 'Accept-Encoding' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); res.end(); return; }
  const gz = GZ.has(ext) || path.basename(file) === 'RidgelineMX.html';
  if (gz && /gzip/.test(req.headers['accept-encoding'] || '') && st.size > 1024) {
    res.writeHead(200, { ...head, 'Content-Encoding': 'gzip' });
    fs.createReadStream(file).pipe(zlib.createGzip({ level: 6 })).pipe(res);
    return;
  }
  res.writeHead(200, { ...head, 'Content-Length': st.size });
  fs.createReadStream(file).pipe(res);
}

export function makeStaticHandler(rootDir) {
  const roots = {
    '/shared/': path.join(rootDir, 'shared'),
    '/tools/out/': path.join(rootDir, 'tools', 'out'),
    '/': path.join(rootDir, 'client'),
  };
  return function handle(req, res) {
    let urlPath;
    try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { urlPath = '/'; }
    if (urlPath === '/') urlPath = '/index.html';
    if (urlPath === '/RidgelineMX.html') { // the single-file build, for testing
      const f = path.join(rootDir, 'RidgelineMX.html');
      if (fs.existsSync(f)) { send(req, res, f, fs.statSync(f)); return; }
    }
    const prefix = Object.keys(roots).find((p) => urlPath.startsWith(p));
    const base = roots[prefix];
    const file = path.normalize(path.join(base, urlPath.slice(prefix.length)));
    if (!file.startsWith(base)) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
      send(req, res, file, st);
    });
  };
}
