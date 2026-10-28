// Casino + admin test against a throwaway server (port 5397).
//   node tools/casino-test.js
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { roulettePayout, crashPointFrom } from '../shared/casino.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'tools/out/casino-data');
const BASE = 'http://localhost:5397';
fs.rmSync(DATA, { recursive: true, force: true });
const srv = spawn(process.execPath, ['server/server.js'], { cwd: ROOT, env: { ...process.env, PORT: '5397', DATA_DIR: DATA } });
let fails = 0;
const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) fails++; };
const api = async (t, r, b) => (await fetch(BASE + '/api/' + r, { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pw = 'pw-' + Math.random().toString(36).slice(2, 10);
try {
  for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/health'); break; } catch { await sleep(100); } }
  // rules
  ok(roulettePayout('red', 1) === 2 && roulettePayout('red', 2) === 0 && roulettePayout('green', 0) === 36 && roulettePayout('n17', 17) === 36 && roulettePayout('odd', 0) === 0, 'roulette payouts');
  let low = 0; for (let i = 0; i < 10000; i++) if (crashPointFrom(Math.random()) < 2) low++;
  ok(low > 4500 && low < 5600, `crash: about half the rounds end before 2x (${low / 100}%)`);
  const a = (await api(null, 'register', { name: 'Gambler1', password: pw })).token;
  let r = await api(a, 'casino/roulette', { bet: 5, pick: 'red' });
  ok(r.error, 'bet below the minimum refused');
  r = await api(a, 'casino/roulette', { bet: 99999, pick: 'red' });
  ok(r.error && /coins/.test(r.error), 'bet above your coins refused');
  r = await api(a, 'casino/roulette', { bet: 100, pick: 'banana' });
  ok(r.error, 'nonsense pick refused');
  r = await api(a, 'casino/roulette', { bet: 100, pick: 'red' });
  ok(r.result >= 0 && r.result <= 36 && r.profile.coins === 500 - 100 + r.win, `roulette spin: ${r.result} ${r.color}, coins now ${r.profile.coins}`);
  let coins = r.profile.coins;
  r = await api(a, 'casino/crash/start', { bet: 50 });
  ok(r.id && r.profile.coins === coins - 50, 'crash round started, bet taken');
  const r2 = await api(a, 'casino/crash/start', { bet: 50 });
  ok(r2.error, 'only one crash round at a time');
  await sleep(300);
  const c = await api(a, 'casino/crash/cashout', { id: r.id });
  ok(c.cashed ? c.win >= 50 && c.profile.coins === coins - 50 + c.win : c.crashPoint < 1.05, `cash out: ${c.cashed ? 'won ' + c.win + ' at ' + c.mult + 'x' : 'crashed at ' + c.crashPoint + 'x'}`);
  const c2 = await api(a, 'casino/crash/cashout', { id: r.id });
  ok(c2.error, 'cannot cash out the same round twice');
  // admin
  r = await api(a, 'admin/users');
  ok(r.error === 'Admins only', 'normal riders can not use admin');
  const adm = (await api(null, 'register', { name: 'lmkk', password: pw })).token;
  r = await api(adm, 'me');
  ok(r.profile.admin === true, 'lmkk is an admin');
  r = await api(adm, 'admin/users');
  ok(r.users && r.users.length === 2, 'admin sees the riders');
  r = await api(adm, 'admin/coins', { name: 'Gambler1', add: 1000000 });
  ok(!r.error && r.user.coins >= 1000000, 'admin gives coins');
  r = await api(adm, 'admin/coins', { name: 'gambler1', set: 42 });
  ok(r.user && r.user.coins === 42, 'admin sets coins');
  r = await api(adm, 'admin/unlock', { name: 'Gambler1' });
  const me = await api(a, 'me');
  ok(me.profile.owned.includes('vehicle:buggy_unl') && me.profile.owned.includes('color:goldrush'), 'admin unlocks everything');
  r = await api(adm, 'admin/reset', { name: 'Gambler1' });
  const me2 = await api(a, 'me');
  ok(me2.profile.coins === 500 && !me2.profile.owned.includes('vehicle:buggy_unl'), 'admin reset');
} catch (e) { console.error(e); fails++; }
srv.kill();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
