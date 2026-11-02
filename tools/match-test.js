// Matchmaking: casual and ranked queues make a race party and start it; ranked needs an
// account, and the result moves both riders' ratings (and shows on the leaderboard).
//   node tools/match-test.js   (starts its own server on port 5398)
import { spawn } from 'child_process';
import fs from 'fs';
import { PROTOCOL_VERSION } from '../shared/protocol.js';
fs.rmSync('tools/out/mm-data', { recursive: true, force: true });
const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: '5398', DATA_DIR: 'tools/out/mm-data' } });
await new Promise((r) => setTimeout(r, 1500));
const B = 'http://localhost:5398';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (route, body, tok) => (await fetch(B + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) })).json();
const get = async (route) => (await fetch(B + '/api/' + route)).json();
const client = (name) => { const ws = new WebSocket('ws://localhost:5398/ws'); const c = { ws, msgs: [], send: (o) => ws.send(JSON.stringify(o)) }; ws.onmessage = (e) => c.msgs.push(JSON.parse(e.data)); c.open = new Promise((res) => (ws.onopen = () => { c.send({ t: 'hello', v: PROTOCOL_VERSION, name }); res(); })); return c; };
const until = async (c, f, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = c.msgs.find(f); if (m) return m; await wait(100); } return null; };
const results = [];
const check = (name, ok) => { results.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + name); };

// casual: two riders queue, a race starts for both
const a = client('Casual1'), b = client('Casual2');
await Promise.all([a.open, b.open]); await wait(300);
a.send({ t: 'queue', mode: 'casual' }); b.send({ t: 'queue', mode: 'casual' });
const fa = await until(a, (m) => m.t === 'queue' && m.state === 'found'), sa = await until(a, (m) => m.t === 'session'), sb = await until(b, (m) => m.t === 'session');
check('casual: two riders are matched into a race', fa && sa && sb && sa.mode === 'race' && sa.players.length === 2 && sa.id === sb.id);

// ranked needs an account
const c = client('NoAccount'); await c.open; await wait(300);
c.send({ t: 'queue', mode: 'ranked', auth: 'nope' });
const err = await until(c, (m) => m.t === 'error');
check('ranked without an account is refused', err && err.code === 'RANKED_LOGIN');
c.send({ t: 'queue', mode: 'casual' }); await wait(500); c.send({ t: 'unqueue' });
const off = await until(c, (m) => m.t === 'queue' && m.state === 'off');
check('leaving the queue works', !!off);

// ranked: two accounts, matched, then the race ends -> ratings move
const A1 = await post('register', { name: 'RankOne', password: 'rankpw11' }), A2 = await post('register', { name: 'RankTwo', password: 'rankpw22' });
const r1 = client('RankOne'), r2 = client('RankTwo');
await Promise.all([r1.open, r2.open]); await wait(300);
r1.send({ t: 'queue', mode: 'ranked', auth: A1.token }); r2.send({ t: 'queue', mode: 'ranked', auth: A2.token });
const s1 = await until(r1, (m) => m.t === 'session', 20000);
check('ranked: two accounts are matched into a race', s1 && s1.mode === 'race' && s1.players.length === 2);
const leader = (await until(r1, (m) => m.t === 'party' && m.leader)).leader;
const lc = leader === s1.players.find((p) => p.name === 'RankOne').id ? r1 : r2;
lc.send({ t: 'end' });
const k1 = await until(r1, (m) => m.t === 'rank'), k2 = await until(r2, (m) => m.t === 'rank');
check('the result moves both ratings, one up and one down', k1 && k2 && k1.delta + k2.delta === 0 && Math.abs(k1.delta) > 0 && k1.tier && k2.tier);
const me = await (await fetch(B + '/api/me', { headers: { Authorization: 'Bearer ' + A1.token } })).json();
check('the rating is saved on the account', me.profile.rating === k1.rating && me.profile.ranked.races === 1);
const lb = await get('leaderboard');
check('the leaderboard lists ranked riders', lb.ranked && lb.ranked.length === 2 && lb.ranked[0].v >= lb.ranked[1].v && lb.ranked[0].tier);

// ranked is 1v1: three riders queue, two race each other and the third keeps waiting
const T = [];
for (const n of ['TriOne', 'TriTwo', 'TriThree']) { const acc = await post('register', { name: n, password: 'tripw' + n }); const cl = client(n); await cl.open; T.push({ acc, cl }); }
await wait(300);
for (const { acc, cl } of T) cl.send({ t: 'queue', mode: 'ranked', auth: acc.token });
await wait(4000);
const ses = T.map(({ cl }) => cl.msgs.find((m) => m.t === 'session'));
check('ranked is 1v1: three queued -> one 2-rider race, one still waiting', ses.filter(Boolean).length === 2 && ses.filter(Boolean).every((s) => s.players.length === 2));

srv.kill();
for (const x of [a, b, c, r1, r2, ...T.map((t) => t.cl)]) x.ws.close();
const bad = results.filter((x) => !x).length;
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
