// Admin joins a party that is racing: comes in as a spectator (flies, no bike),
// the racers see them, and they stay out of the standings.
//   node tools/spectate-test.js   (starts its own server on port 5399)
import { spawn } from 'child_process';
import fs from 'fs';
import { PROTOCOL_VERSION } from '../shared/protocol.js';
fs.rmSync('tools/out/sp-data', { recursive: true, force: true });
const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: '5399', DATA_DIR: 'tools/out/sp-data' } });
await new Promise((r) => setTimeout(r, 1500));
const B = 'http://localhost:5399';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (route, body, tok) => (await fetch(B + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) })).json();
const client = (name) => { const ws = new WebSocket('ws://localhost:5399/ws'); const c = { ws, msgs: [], send: (o) => ws.send(JSON.stringify(o)) }; ws.onmessage = (e) => c.msgs.push(JSON.parse(e.data)); c.open = new Promise((res) => (ws.onopen = () => { c.send({ t: 'hello', v: PROTOCOL_VERSION, name }); res(); })); return c; };
const results = [];
const check = (name, ok) => { results.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + name); };
const owner = await post('register', { name: 'lmkk', password: 'ownerpw1' });
const R1 = client('Racer1'), R2 = client('Racer2'), A = client('lmkk');
await Promise.all([R1.open, R2.open, A.open]); await wait(300);
R1.send({ t: 'create' }); await wait(300);
const code = R1.msgs.find((m) => m.t === 'party').code;
R2.send({ t: 'join', code }); await wait(200);
R1.send({ t: 'settings', track: 'motopark', mode: 'race', laps: 3 }); await wait(100);
R1.send({ t: 'start' }); await wait(300);
const sid = R1.msgs.find((m) => m.t === 'session').id;
R1.send({ t: 'loaded', id: sid }); R2.send({ t: 'loaded', id: sid }); await wait(300);
// a normal rider can not drop into the race
const Late = client('Late'); await Late.open; await wait(200);
Late.send({ t: 'join', code }); await wait(300);
check('a normal rider joining mid-race waits for the next one', !Late.msgs.some((m) => m.t === 'session'));
// the admin can: as a spectator
A.send({ t: 'adminjoin', code, auth: owner.token }); await wait(400);
const as = [...A.msgs].reverse().find((m) => m.t === 'session');
const me = as && as.players.find((p) => p.name === 'lmkk');
check('admin drops into the race as a spectator', me && me.spectator === true);
const r1s = [...R1.msgs].reverse().find((m) => m.t === 'session');
check('the racers are told (spectator in their player list)', r1s && r1s.players.some((p) => p.name === 'lmkk' && p.spectator));
// fly far and fast: accepted, relayed, not flagged; not in the standings
const st = (x, y, z) => [x, y, z, 0, 0, 0, 1, 30, 0, 0, 0, 0, 0, 1000, 0, 2, 0, 0, 0, 0];
A.send({ t: 's', d: st(0, 20, 0) }); await wait(100); A.send({ t: 's', d: st(80, 30, 40) }); await wait(300);
const snap = [...R1.msgs].reverse().find((m) => m.t === 'snap' && m.p.some((x) => x[0] === me.id));
check('racers see the spectator flying', !!snap);
R1.send({ t: 's', d: st(5, 1, 5) }); await wait(150); R1.send({ t: 's', d: st(6, 1, 6) }); await wait(1200);
const race = [...R1.msgs].reverse().find((m) => m.t === 'race');
check('spectator is not in the standings', !race || !race.rows.some((x) => x.name === 'lmkk'));
const ok = results.every(Boolean);
console.log(ok ? 'all passed' : 'FAILED');
srv.kill(); process.exit(ok ? 0 : 1);
