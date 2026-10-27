// Multiplayer end-to-end test: two clients race a full lap through the real server.
//   node tools/mp-test.js [ws://localhost:5323/ws]
import { getTrack } from '../shared/tracks.js';
import { buildTrack, pointAt } from '../shared/trackgen.js';

const URL = process.argv[2] || 'ws://localhost:5323/ws';
const T = buildTrack(getTrack('quarry'));

function client(name) {
  const ws = new WebSocket(URL);
  const c = { ws, name, msgs: [], waiters: [] };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    c.msgs.push(m);
    c.waiters = c.waiters.filter((w) => (w.test(m) ? (w.res(m), false) : true));
  };
  c.send = (o) => ws.send(JSON.stringify(o));
  c.wait = (test, ms = 8000) => new Promise((res, rej) => {
    const hit = c.msgs.find(test);
    if (hit) return res(hit);
    c.waiters.push({ test, res });
    setTimeout(() => rej(new Error(name + ' timed out')), ms);
  });
  c.open = new Promise((r) => (ws.onopen = r));
  return c;
}

const A = client('Alice'), B = client('Bob');
await Promise.all([A.open, B.open]);
A.send({ t: 'hello', v: 1, name: 'Alice', vehicle: 'mx450', color: 'red' });
B.send({ t: 'hello', v: 1, name: 'Bob', vehicle: 'atv450', color: 'blue' });
await A.wait((m) => m.t === 'welcome'); await B.wait((m) => m.t === 'welcome');
A.send({ t: 'create' });
const party = await A.wait((m) => m.t === 'party');
console.log('party code', party.code);
B.send({ t: 'join', code: party.code });
await B.wait((m) => m.t === 'party' && m.members.length === 2);
A.send({ t: 'settings', track: 'quarry', mode: 'race', laps: 1 });
B.send({ t: 'settings', track: 'ridgeline', mode: 'freeride', laps: 9 }); // not the leader: must be refused
const refused = await B.wait((m) => m.t === 'error' && m.code === 'NOT_LEADER');
console.log('non-leader settings refused:', !!refused);
A.send({ t: 'start' });
const sa = await A.wait((m) => m.t === 'session');
await B.wait((m) => m.t === 'session');
console.log('session started on', sa.track, sa.mode, 'riders', sa.players.map((p) => p.name).join(', '));
// both ride the lap; Alice 28 m/s, Bob 25 m/s; they start at the gate after the gate drops
const wait = Math.max(0, sa.goAt - Date.now()) + 100;
await new Promise((r) => setTimeout(r, wait));
const speeds = { A: 28 * 2.5, B: 25 * 2.5 }; // sped up so the test is quick, but still under the anti-teleport limit per packet
let sA = T.gateS, sB = T.gateS;
const pack = (s) => { const p = pointAt(T, s, 0); return [p.x, 0, p.z, 0, 0, 0, 1, p.tx * 25, 0, p.tz * 25, 0, 0, s % T.L, 8000, 1, 0, 0.1, 0.1, 0, 0]; };
const t0 = Date.now();
const timer = setInterval(() => {
  sA += speeds.A * 0.05; sB += speeds.B * 0.05;
  A.send({ t: 's', d: pack(sA) }); B.send({ t: 's', d: pack(sB) });
}, 50);
const res = await A.wait((m) => m.t === 'results', 60000);
clearInterval(timer);
console.log('results after', ((Date.now() - t0) / 1000).toFixed(1), 's:', res.rows.map((r) => `${r.pos}. ${r.name} ${r.time ? r.time.toFixed(2) + 's' : ''}`).join('  '));
const snaps = B.msgs.filter((m) => m.t === 'snap').length;
console.log('Bob received', snaps, 'snapshots; Alice received', A.msgs.filter((m) => m.t === 'snap').length);
// Bob leaves: Alice should see it
B.send({ t: 'leave' });
const after = await A.wait((m) => m.t === 'party' && m.members.length === 1);
console.log('after Bob left, party has', after.members.map((m) => m.name).join(', '));
A.ws.close(); B.ws.close();
const ok = res.rows[0].name === 'Alice' && res.rows.length === 2 && snaps > 10 && refused;
console.log(ok ? 'MULTIPLAYER TEST PASSED' : 'MULTIPLAYER TEST FAILED');
process.exit(ok ? 0 : 1);
