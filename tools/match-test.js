// Matchmaking: casual and ranked queues make a race party and start it; ranked needs an
// account, and the result moves both riders' ratings (and shows on the leaderboard).
//   node tools/match-test.js   (starts its own server on port 5398)
import { spawn } from 'child_process';
import fs from 'fs';
import { PROTOCOL_VERSION } from '../shared/protocol.js';
fs.rmSync('tools/out/mm-data', { recursive: true, force: true });
const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: '5398', DATA_DIR: 'tools/out/mm-data', AFK_MS: '3000' } });
srv.stderr.on('data', (d) => process.stderr.write(d));
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
// a ranked race is a match, not a party
const inRace = T.filter(({ cl }) => cl.msgs.some((m) => m.t === 'session'));
const pm = [...inRace[0].cl.msgs].reverse().find((m) => m.t === 'party');
check('a ranked race is flagged as a match (no lobby party)', pm && pm.match === 'ranked');
// nobody moves: once the gate drops they are AFK and the match ends (AFK_MS is 3 s here)
const res = await until(inRace[0].cl, (m) => m.t === 'results', 30000);
check('AFK riders are put out and the match ends', !!res && res.rows.some((r) => r.out === 'afk') && inRace[0].cl.msgs.some((m) => m.t === 'afk'));
// going back to the lobby leaves the match: you are on your own again
inRace[0].cl.send({ t: 'leave' });
const left = await until(inRace[0].cl, (m) => m.t === 'left', 5000);
check('leaving after a ranked race puts you back on your own', !!left);

// ranked 2v2: four solo riders -> one race, two teams of two; the result moves each team the opposite way
const Q4 = [];
for (const n of ['DuoA1', 'DuoA2', 'DuoA3', 'DuoA4']) { const acc = await post('register', { name: n, password: 'duopw' + n }); const cl = client(n); await cl.open; Q4.push({ acc, cl }); }
await wait(300);
for (const { acc, cl } of Q4) cl.send({ t: 'queue', mode: 'ranked2', auth: acc.token });
const s4 = await Promise.all(Q4.map(({ cl }) => until(cl, (m) => m.t === 'session', 20000)));
check('2v2: four solo riders are matched into one 4-rider race', s4.every((s) => s && s.players.length === 4 && s.id === s4[0].id));
const p4 = await until(Q4[0].cl, (m) => m.t === 'party' && m.teams);
const tc = p4 && Object.values(p4.teams);
check('2v2: the match has two teams of two', p4 && p4.match === 'ranked2' && tc.length === 4 && tc.filter((t) => t === 0).length === 2 && tc.filter((t) => t === 1).length === 2);
const L4 = Q4.find(({ cl }) => cl.msgs.some((m) => m.t === 'welcome' && m.id === p4.leader));
L4.cl.send({ t: 'end' });
const k4 = await Promise.all(Q4.map(({ cl }) => until(cl, (m) => m.t === 'rank' && m.mode === 'ranked2')));
check('2v2: winners go up, losers go down by the same amount', k4.every(Boolean) && k4.filter((k) => k.won).length === 2 && k4.every((k) => (k.won ? k.delta > 0 : k.delta < 0)) && k4.reduce((s, k) => s + k.delta, 0) === 0);
const me4 = await (await fetch(B + '/api/me', { headers: { Authorization: 'Bearer ' + Q4[0].acc.token } })).json();
check('2v2: the rating is saved on the account, apart from the 1v1 one', me4.profile.rating2 === k4[0].rating && me4.profile.ranked2.races === 1 && me4.profile.ranked.races === 0);
await wait(31000); // the leaderboard is cached for 30 s
const lb4 = await get('leaderboard');
check('2v2: the leaderboard has a 2v2 list', lb4.ranked2 && lb4.ranked2.length === 4 && lb4.ranked2[0].v >= lb4.ranked2[3].v);
// a duo: a party of two queues together and stays on one team
const D = [];
for (const n of ['PairL', 'PairM']) { const acc = await post('register', { name: n, password: 'pairpw' + n }); const cl = client(n); await cl.open; D.push({ acc, cl }); }
await wait(300);
const [dl, dm] = D;
dm.cl.send({ t: 'profile', auth: dm.acc.token });
dl.cl.send({ t: 'create' });
const pc = await until(dl.cl, (m) => m.t === 'party' && m.code);
dm.cl.send({ t: 'join', code: pc.code });
await until(dl.cl, (m) => m.t === 'party' && m.members.length === 2);
dl.cl.send({ t: 'queue', mode: 'ranked2', auth: dl.acc.token, duo: true });
const dq = await until(dm.cl, (m) => m.t === 'queue' && m.state === 'waiting' && m.duo === 'PairL');
check('2v2 duo: the teammate is in the queue with the leader', !!dq);
D.push(Q4[0], Q4[1]); // two solos (sign-ups are rate limited per address)
for (const { acc, cl } of D.slice(2)) { cl.send({ t: 'leave' }); cl.send({ t: 'queue', mode: 'ranked2', auth: acc.token }); }
const fd = await until(dl.cl, (m) => m.t === 'queue' && m.state === 'found', 20000);
const pd = await until(dl.cl, (m) => m.t === 'party' && m.teams);
const idOf = (c) => c.msgs.find((m) => m.t === 'welcome').id;
check('2v2 duo: the party of two races on the same team', fd && fd.mate === 'PairM' && pd && pd.teams[idOf(dl.cl)] === pd.teams[idOf(dm.cl)] && pd.teams[idOf(D[2].cl)] === pd.teams[idOf(D[3].cl)]);

srv.kill();
for (const x of [a, b, c, r1, r2, ...T.map((t) => t.cl), ...Q4.map((t) => t.cl), dl.cl, dm.cl]) x.ws.close();
const bad = results.filter((x) => !x).length;
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
