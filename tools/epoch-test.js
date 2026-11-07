// An update logs everyone out and starts every ranked rating over (placement matches).
//   node tools/epoch-test.js   (starts its own server twice on port 5395)
import { spawn } from 'child_process';
import fs from 'fs';
const DIR = 'tools/out/epoch-data';
fs.rmSync(DIR, { recursive: true, force: true });
const start = async () => { const s = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: '5395', DATA_DIR: DIR } }); s.stderr.on('data', (d) => process.stderr.write(d)); await new Promise((r) => setTimeout(r, 1500)); return s; };
const B = 'http://localhost:5395/api/';
const post = async (route, body, tok) => (await fetch(B + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) })).json();
const me = async (tok) => (await fetch(B + 'me', { headers: { Authorization: 'Bearer ' + tok } })).json();
let bad = 0; const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) bad++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// first run: a rider with a login and a ranked rating, saved by an "older" server (no epochs recorded)
let srv = await start();
const a = await post('register', { name: 'EpochOne', password: 'pw1234' });
ok(!!a.token, 'register');
await wait(600);
srv.kill(); await wait(500);
const file = DIR + '/accounts.json';
const db = JSON.parse(fs.readFileSync(file, 'utf8'));
db.users.epochone.rating = 1500; db.users.epochone.ranked = { races: 9, wins: 5 }; db.users.epochone.rating2 = 1300; db.users.epochone.ranked2 = { races: 2, wins: 1 };
delete db.loginEpoch; delete db.rankEpoch;
fs.writeFileSync(file, JSON.stringify(db));

// the "update": a fresh start applies both resets
srv = await start();
const old = await me(a.token);
ok(!!old.error, 'the old login no longer works after the update');
const l = await post('login', { name: 'EpochOne', password: 'pw1234' });
ok(!!l.token && l.token !== a.token, 'logging in again works');
ok(l.profile.rating === 1000 && l.profile.ranked.races === 0 && l.profile.placed === false, 'the ranked rating starts over (placement matches)');
const again = await post('login', { name: 'EpochOne', password: 'pw1234' });
await wait(600);
srv.kill(); await wait(500);
// a second start must not log anybody out again or reset again
const db2 = JSON.parse(fs.readFileSync(file, 'utf8'));
db2.users.epochone.rating = 1234; db2.users.epochone.ranked = { races: 5, wins: 3 };
fs.writeFileSync(file, JSON.stringify(db2));
srv = await start();
const still = await me(again.token);
ok(!still.error && still.profile.rating === 1234, 'the reset and the logout only happen once');
srv.kill();
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
