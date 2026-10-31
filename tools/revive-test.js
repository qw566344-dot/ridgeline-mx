// No cloud save at all (the free server as it is): the server is wiped, and each
// player's browser puts its account back by itself - coins, items, friends, same
// login, same password - without anyone typing a password.
//   node tools/revive-test.js
import { spawn } from 'child_process';
import fs from 'fs';
const DATA = 'tools/out/revive-data';
const env = { ...process.env, PORT: '5394', DATA_DIR: DATA, REDIS_URL: '', UPSTASH_REDIS_REST_URL: '' };
const start = () => spawn(process.execPath, ['server/server.js'], { env });
const B = 'http://localhost:5394';
const up = async () => { for (let i = 0; i < 80; i++) { try { await fetch(B + '/health'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } } };
const api = async (t, r, b) => (await fetch(B + '/api/' + r, { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();
let fails = 0; const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) fails++; };
fs.rmSync(DATA, { recursive: true, force: true });
let srv = start();
try {
  await up();
  const pw = 'pw-' + Math.random().toString(36).slice(2);
  const a = await api(null, 'register', { name: 'ReviveRider', password: pw });
  const b = await api(null, 'register', { name: 'ReviveBuddy', password: pw });
  await api(a.token, 'friends/request', { name: 'ReviveBuddy' }); await api(b.token, 'friends/accept', { name: 'ReviveRider' });
  await api(a.token, 'reward', { kind: 'lap', amount: 400 });
  const meA = await api(a.token, 'me'), meB = await api(b.token, 'me');
  ok(meA.seal && meA.seal.hash, 'the browser is handed its account seal');
  // the server is wiped
  srv.kill(); await new Promise((r) => setTimeout(r, 400)); fs.rmSync(DATA, { recursive: true, force: true }); srv = start(); await up();
  ok((await api(a.token, 'me')).error === 'Please log in again', 'the wiped server has forgotten everyone');
  // what each browser does on start-up (account.js revive)
  const ra = await api(null, 'revive', { name: 'ReviveRider', token: a.token, seal: meA.seal, restore: { ...meA.profile, friends: ['ReviveBuddy'] } });
  const rb = await api(null, 'revive', { name: 'ReviveBuddy', token: b.token, seal: meB.seal, restore: { ...meB.profile, friends: ['ReviveRider'] } });
  ok(ra.revived && ra.profile.coins === meA.profile.coins, 'account back with its coins, no password typed');
  ok((await api(a.token, 'me')).profile, 'the old login token works again');
  const fr = await api(a.token, 'friends');
  ok(fr.friends && fr.friends.some((f) => f.name === 'ReviveBuddy'), 'friends are friends again');
  ok((await api(null, 'login', { name: 'ReviveRider', password: pw })).token, 'the same password still logs in (on any computer)');
  ok((await api(null, 'revive', { name: 'ReviveRider', token: 'f'.repeat(48), seal: { salt: '0'.repeat(32), hash: '0'.repeat(64) } })).error, 'someone else cannot take the account over');
  void rb;
} catch (e) { console.error(e); fails++; }
srv.kill();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
