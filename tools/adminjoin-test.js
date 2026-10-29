// Admin "Join": lmkk drops into a rider who is not in a party.
//   node tools/adminjoin-test.js   (starts its own server on port 5392)
import { spawn } from 'child_process';
import fs from 'fs';
fs.rmSync('tools/out/aj-data', { recursive: true, force: true }); // fresh accounts every run
import { PROTOCOL_VERSION } from '../shared/protocol.js';
const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: '5392', DATA_DIR: 'tools/out/aj-data' } });
await new Promise((r) => setTimeout(r, 1500));
const B = 'http://localhost:5392';
const pw = 'pw-' + Math.random().toString(36).slice(2);
let r = await (await fetch(B + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'lmkk', password: pw }) })).json();
if (!r.token) r = await (await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'lmkk', password: pw }) })).json();
const auth = r.token;
const client = (name) => { const ws = new WebSocket('ws://localhost:5392/ws'); const c = { ws, msgs: [] }; ws.onmessage = (e) => c.msgs.push(JSON.parse(e.data)); c.open = new Promise((res) => (ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name })); res(); })); return c; };
const A = client('lmkk'), T = client('LoneRider');
await Promise.all([A.open, T.open]); await new Promise((res) => setTimeout(res, 400));
A.ws.send(JSON.stringify({ t: 'adminjoin', name: 'lonerider', auth: 'wrong' }));
await new Promise((res) => setTimeout(res, 300));
const refused = A.msgs.some((m) => m.t === 'error' && m.code === 'NOT_ADMIN');
A.ws.send(JSON.stringify({ t: 'adminjoin', name: 'lonerider', auth }));
await new Promise((res) => setTimeout(res, 500));
const pa = [...A.msgs].reverse().find((m) => m.t === 'party'), pt = [...T.msgs].reverse().find((m) => m.t === 'party');
const ok1 = refused && pa && pt && pa.code === pt.code && pa.members.length === 2;
console.log('wrong login refused:', refused, '| same party:', !!(pa && pt && pa.code === pt.code), pa ? pa.members.map((m) => m.name).join(', ') : '');

// a rider who is online (friends poll) but not connected to the game server yet
const post = async (route, body, tok) => (await fetch(B + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) })).json();
const sname = 'Solo' + Math.floor(Math.random() * 1e5);
const sr = await post('register', { name: sname, password: 'pw12345' });
await post('friends', { status: 'riding' }, sr.token);
const A2 = client('lmkk'); await A2.open; await new Promise((res) => setTimeout(res, 300));
A2.ws.send(JSON.stringify({ t: 'adminjoin', name: sname, auth }));
await new Promise((res) => setTimeout(res, 300));
const waiting = A2.msgs.some((m) => m.t === 'notice');
const poll = await post('friends', { status: 'riding' }, sr.token);
const S = client(sname); await S.open; await new Promise((res) => setTimeout(res, 300));
if (poll.pull) S.ws.send(JSON.stringify({ t: 'pulled', auth: sr.token }));
await new Promise((res) => setTimeout(res, 500));
const qa = [...A2.msgs].reverse().find((m) => m.t === 'party'), qs = [...S.msgs].reverse().find((m) => m.t === 'party');
const told = S.msgs.some((m) => m.t === 'adminjoined' && m.leader);
const ok2 = waiting && !!poll.pull && qa && qs && qa.code === qs.code && told;
console.log('not connected yet: admin waits:', waiting, '| asked to connect:', !!poll.pull, '| same party:', !!(qa && qs && qa.code === qs.code), '| told:', told);
const ok = ok1 && ok2;
console.log(ok ? 'all passed' : 'FAILED');
srv.kill(); process.exit(ok ? 0 : 1);
