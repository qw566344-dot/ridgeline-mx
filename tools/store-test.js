// Cloud save test: a stand-in for Upstash (port 5396) + the game server (port 5395).
// Make an account, wipe the server's disk and restart it - the account must still log in.
//   node tools/store-test.js
import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'tools/out/store-data');
const kv = new Map();
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
    const ok = req.headers.authorization === 'Bearer test-token';
    const [cmd, key, val] = JSON.parse(b || '[]');
    let result = null;
    if (cmd === 'GET') result = kv.has(key) ? kv.get(key) : null;
    if (cmd === 'SET') { kv.set(key, val); result = 'OK'; }
    res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ok ? { result } : { error: 'unauthorized' }));
  });
}).listen(5396);
const BASE = 'http://localhost:5395';
const env = { ...process.env, PORT: '5395', DATA_DIR: DATA, UPSTASH_REDIS_REST_URL: 'http://localhost:5396', UPSTASH_REDIS_REST_TOKEN: 'test-token' };
const start = () => spawn(process.execPath, ['server/server.js'], { cwd: ROOT, env });
const up = async () => { for (let i = 0; i < 80; i++) { try { await fetch(BASE + '/health'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } } };
const api = async (t, r, b) => (await fetch(BASE + '/api/' + r, { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();
let fails = 0;
const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) fails++; };
const pw = 'pw-' + Math.random().toString(36).slice(2, 10);
fs.rmSync(DATA, { recursive: true, force: true });
let srv = start();
try {
  await up();
  let r = await api(null, 'register', { name: 'TravelRider', password: pw });
  const tok = r.token;
  await api(tok, 'reward', { kind: 'lap', amount: 700 });
  await new Promise((res) => setTimeout(res, 800));
  ok(kv.size === 1, 'account written to the cloud save');
  // the host restarts with a blank disk (what free hosting does)
  srv.kill(); await new Promise((res) => setTimeout(res, 400));
  fs.rmSync(DATA, { recursive: true, force: true });
  srv = start(); await up();
  r = await api(null, 'login', { name: 'travelrider', password: pw });
  ok(r.profile && r.profile.coins === 1200, 'after a wiped restart the account logs in with its coins');
  r = await api(tok, 'me');
  ok(r.profile && r.profile.name === 'TravelRider', 'the old login token still works too');
  r = await api(null, 'login', { name: 'TravelRider', password: 'nope' });
  ok(r.error === 'Wrong password', 'wrong password still refused');
  r = await api(null, 'register', { name: 'lmkk', password: pw });
  ok(r.profile && r.profile.coins >= 1000000 && r.profile.owned.includes('vehicle:mx500') && r.profile.owned.includes('color:prism') && r.profile.owned.includes('upgrade:sxs.air.5'), 'lmkk owns everything and has 1,000,000 coins');
} catch (e) { console.error(e); fails++; }
srv.kill(); mock.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
