// =====================================================================
//  RIDGELINE MX SERVER
//  One process does both jobs:
//    1. serves the game to the browser   (http://localhost:5323)
//    2. runs multiplayer parties over WebSockets at /ws on the same port
//  Run:    node server/server.js      (or double-click Play.bat)
//  Deploy: any Node 18+ host that keeps WebSocket connections open
//          (Render, Railway, Fly.io, a VPS...). Set PORT if needed.
//  No npm install needed - zero dependencies.
// =====================================================================
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeStaticHandler } from './static.js';
import { attachWebSocket } from './ws.js';
import { Lobby } from './lobby.js';
import { Accounts } from './accounts.js';
import os from 'os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5323;
const HOST = process.env.HOST || '0.0.0.0';

const serveStatic = makeStaticHandler(ROOT);
const accounts = new Accounts(process.env.DATA_DIR || path.join(ROOT, 'server', 'data'));
const lobby = new Lobby((msg) => console.log(new Date().toISOString().slice(11, 19), msg));
accounts.lobby = lobby;
lobby.accounts = accounts;

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/lan')) {
    // addresses friends on the same Wi-Fi can use to reach this computer
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ port: PORT, addresses: lanAddresses() }));
    return;
  }
  if (req.url.startsWith('/api/party')) {
    const code = new URL(req.url, 'http://x').searchParams.get('code');
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ exists: lobby.hasParty(code), region: process.env.REGION || null }));
    return;
  }
  if (req.url.startsWith('/api/')) {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
    accounts.handle(req, res, ip);
    return;
  }
  if (req.url === '/health' || req.url.startsWith('/health?')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, region: process.env.REGION || null, ...lobby.stats() }));
    return;
  }
  serveStatic(req, res);
});

attachWebSocket(server, '/ws', (conn) => lobby.onConnection(conn));

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

// Render (and most hosts) send SIGTERM before a restart: save the accounts first
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { await accounts.flush(); process.exit(0); });

await accounts.ready;
server.listen(PORT, HOST, () => {
  console.log(`Ridgeline MX running at http://localhost:${PORT}  (multiplayer on ws://localhost:${PORT}/ws)`);
  for (const a of lanAddresses()) console.log(`  Friends on the same Wi-Fi can play at: http://${a}:${PORT}`);
});
