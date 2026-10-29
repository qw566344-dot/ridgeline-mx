// Admin "Join": lmkk drops into a rider who is not in a party.
//   node tools/adminjoin-test.js   (starts its own server on port 5392)
import { spawn } from 'child_process';
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
const ok = refused && pa && pt && pa.code === pt.code && pa.members.length === 2;
console.log('wrong login refused:', refused, '| same party:', !!(pa && pt && pa.code === pt.code), pa ? pa.members.map((m) => m.name).join(', ') : '');
console.log(ok ? 'all passed' : 'FAILED');
srv.kill(); process.exit(ok ? 0 : 1);
