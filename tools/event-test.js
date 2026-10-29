// Admin events: start one, every rider's friends poll sees it, Double Coins doubles rewards.
//   node tools/event-test.js   (starts its own server on port 5393)
import { spawn } from 'child_process';
import fs from 'fs';
fs.rmSync('tools/out/ev-data', { recursive: true, force: true }); // fresh accounts every run
const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: '5393', DATA_DIR: 'tools/out/ev-data' } });
await new Promise((r) => setTimeout(r, 1500));
const B = 'http://localhost:5393';
const post = async (route, body, tok) => (await fetch(B + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) })).json();
const pw = 'pw-' + Math.random().toString(36).slice(2);
let a = await post('register', { name: 'lmkk', password: pw });
if (!a.token) a = await post('login', { name: 'lmkk', password: pw });
const r = await post('register', { name: 'Ev' + Math.floor(Math.random() * 1e5), password: 'pw12345' });
const notAdmin = (await post('admin/event', { kind: 'double', minutes: 5 }, r.token)).error === 'Admins only';
const started = await post('admin/event', { kind: 'double', minutes: 5 }, a.token);
const poll = await post('friends', { status: 'riding' }, r.token);
const seen = poll.event && poll.event.kind === 'double' && poll.event.left > 200_000;
const rew = await post('reward', { kind: 'lap', amount: 100 }, r.token);
const doubled = rew.added === 200;
await post('admin/event', { kind: '' }, a.token);
const gone = !(await post('friends', { status: 'riding' }, r.token)).event;
console.log('non-admin refused:', notAdmin, '|', started.ok, '| riders see it:', !!seen, '| coins doubled:', doubled, '| stops:', gone);
const ok = notAdmin && seen && doubled && gone;
console.log(ok ? 'all passed' : 'FAILED');
srv.kill(); process.exit(ok ? 0 : 1);
