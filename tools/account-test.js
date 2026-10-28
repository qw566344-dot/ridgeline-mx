// Account test: register, log out, log in, coins + items survive a server
// restart with its data wiped (restore), bad restores are cleaned, test grant.
//   node tools/account-test.js
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'tools/out/account-data');
const BASE = 'http://localhost:5398';
let fails = 0;
const ok = (c, what) => { console.log((c ? 'ok   ' : 'FAIL ') + what); if (!c) fails++; };
const api = async (t, r, b) => (await fetch(BASE + '/api/' + r, { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();
function start() {
  const p = spawn(process.execPath, ['server/server.js'], { cwd: ROOT, env: { ...process.env, PORT: '5398', DATA_DIR: DATA } });
  return p;
}
async function up() { for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/health'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } } }
const pw = 'pw-' + Math.random().toString(36).slice(2, 10);

fs.rmSync(DATA, { recursive: true, force: true });
let srv = start();
try {
  await up();
  let r = await api(null, 'register', { name: 'SaveTester', password: pw });
  ok(r.token && r.profile.coins === 500, 'register gives a token and 500 coins');
  r = await api(null, 'register', { name: 'savetester', password: pw });
  ok(r.error && /taken/.test(r.error), 'same name (any case) is refused');
  r = await api(null, 'register', { name: 'ab', password: pw });
  ok(r.error, 'too-short name refused');
  let tok = (await api(null, 'login', { name: 'SaveTester', password: pw })).token;
  r = await api(tok, 'reward', { kind: 'lap', amount: 300 });
  r = await api(tok, 'buy', { slot: 'color', id: 'green' });
  ok(r.profile && r.profile.coins === 300 && r.profile.owned.includes('color:green'), 'earn + buy saved on the account');
  await api(tok, 'logout', {});
  r = await api(tok, 'me');
  ok(r.error, 'old token stops working after log out');
  r = await api(null, 'login', { name: 'savetester', password: pw });
  ok(r.profile && r.profile.coins === 300 && r.profile.equipped.color === 'green', 'log back in: coins and paint are still there');
  r = await api(null, 'login', { name: 'SaveTester', password: 'wrong' });
  ok(r.error === 'Wrong password', 'wrong password refused');
  const saved = r; void saved;
  await new Promise((res) => setTimeout(res, 500)); // let the save land
  // server restarts and keeps its file
  srv.kill(); await new Promise((res) => setTimeout(res, 300)); srv = start(); await up();
  r = await api(null, 'login', { name: 'SaveTester', password: pw });
  ok(r.profile && r.profile.coins === 300, 'account still there after a normal restart');
  // server restarts with its data wiped (free hosting): the game restores from its copy
  const copy = r.profile;
  srv.kill(); await new Promise((res) => setTimeout(res, 300));
  fs.rmSync(DATA, { recursive: true, force: true });
  srv = start(); await up();
  r = await api(null, 'login', { name: 'SaveTester', password: pw });
  ok(r.error && /No account/.test(r.error), 'wiped server does not know the name');
  r = await api(null, 'register', { name: 'SaveTester', password: pw, restore: copy });
  ok(r.profile && r.profile.coins === 300 && r.profile.owned.includes('color:green') && r.profile.equipped.color === 'green', 'restore brings coins, items and paint back');
  r = await api(null, 'register', { name: 'Cheater1', password: pw, restore: { coins: 1e12, owned: ['vehicle:buggy_unl', 'vehicle:fake', 'color:gold'], equipped: { vehicle: 'fake' } } });
  ok(r.profile && r.profile.coins === 5000000 && r.profile.owned.includes('vehicle:buggy_unl') && !r.profile.owned.includes('vehicle:fake') && r.profile.equipped.vehicle === 'mx250', 'restore is cleaned (coin cap, no fake items)');
  r = await api(null, 'register', { name: 'nahh', password: pw });
  ok(r.profile && r.profile.coins === 1000000, 'test account nahh gets 1,000,000 coins');
} catch (e) { console.error(e); fails++; }
srv.kill();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
