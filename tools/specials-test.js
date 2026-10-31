// Special vehicles: lmkk owns the Crawler and the Office Chair; nobody else can buy them,
// be given them, unlock them or bring them in through a restore.
//   node tools/specials-test.js
import { spawn } from 'child_process';
import fs from 'fs';
const DATA = 'tools/out/specials-data';
fs.rmSync(DATA, { recursive: true, force: true });
const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: '5393', DATA_DIR: DATA, REDIS_URL: '', UPSTASH_REDIS_REST_URL: '' } });
const B = 'http://localhost:5393';
for (let i = 0; i < 80; i++) { try { await fetch(B + '/health'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
const api = async (t, r, b) => (await fetch(B + '/api/' + r, { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();
let fails = 0; const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) fails++; };
try {
  const pw = 'pw-' + Math.random().toString(36).slice(2);
  const L = await api(null, 'register', { name: 'lmkk', password: pw });
  ok(L.profile.owned.includes('vehicle:crawl') && L.profile.owned.includes('vehicle:chair'), 'lmkk owns the Crawler and the Office Chair');
  ok(!(await api(L.token, 'equip', { slot: 'vehicle', id: 'chair' })).error, 'lmkk can ride the chair');
  const o = await api(null, 'register', { name: 'Someone', password: pw });
  ok(!o.profile.owned.includes('vehicle:crawl'), 'other riders do not have them');
  await api(L.token, 'admin/coins', { name: 'Someone', set: 2e9 });
  ok((await api(o.token, 'buy', { slot: 'vehicle', id: 'crawl' })).error, 'they cannot buy one');
  ok((await api(L.token, 'admin/give', { name: 'Someone', item: 'vehicle:crawl' })).error, 'the admin panel cannot give one away');
  await api(L.token, 'admin/unlock', { name: 'Someone' });
  ok(!(await api(o.token, 'me')).profile.owned.includes('vehicle:chair'), 'Unlock all leaves them out');
  ok((await api(o.token, 'equip', { slot: 'vehicle', id: 'chair' })).error, 'and they cannot ride one');
  const r = await api(null, 'register', { name: 'Sneaky', password: pw, restore: { owned: ['vehicle:crawl', 'vehicle:chair'] } });
  ok(!r.profile.owned.includes('vehicle:crawl'), 'a restore cannot sneak them in');
} catch (e) { console.error(e); fails++; }
srv.kill();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
