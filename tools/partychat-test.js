// Party chat: only riders in the same party get the message.
//   node tools/partychat-test.js   (starts its own server on port 5394)
import { spawn } from 'child_process';
import fs from 'fs';
import { PROTOCOL_VERSION } from '../shared/protocol.js';
fs.rmSync('tools/out/pc-data', { recursive: true, force: true });
const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: '5394', DATA_DIR: 'tools/out/pc-data' } });
await new Promise((r) => setTimeout(r, 1500));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const client = (name) => { const ws = new WebSocket('ws://localhost:5394/ws'); const c = { ws, msgs: [], send: (o) => ws.send(JSON.stringify(o)) }; ws.onmessage = (e) => c.msgs.push(JSON.parse(e.data)); c.open = new Promise((res) => (ws.onopen = () => { c.send({ t: 'hello', v: PROTOCOL_VERSION, name }); res(); })); return c; };
const A = client('Alpha'), Bc = client('Bravo'), C = client('Charlie');
await Promise.all([A.open, Bc.open, C.open]); await wait(300);
A.send({ t: 'create' }); await wait(300);
const code = A.msgs.find((m) => m.t === 'party').code;
Bc.send({ t: 'join', code }); C.send({ t: 'create' }); await wait(300);
A.send({ t: 'pchat', text: '  hi   team ' }); await wait(300);
const got = (c) => c.msgs.filter((m) => m.t === 'pchat');
const okB = got(Bc).length === 1 && got(Bc)[0].text === 'hi team' && got(Bc)[0].name === 'Alpha';
const okA = got(A).length === 1, okC = got(C).length === 0;
A.send({ t: 'pchat', text: 'spam' }); await wait(100);
const slowed = A.msgs.some((m) => m.t === 'error' && m.code === 'SLOW');
console.log('party mate gets it:', okB, '| sender sees it:', okA, '| other party does not:', okC, '| rate limited:', slowed);
const ok = okA && okB && okC && slowed;
console.log(ok ? 'all passed' : 'FAILED');
srv.kill(); process.exit(ok ? 0 : 1);
