// Cloud save safety, against a fake Upstash Redis:
//  - a cloud that can not be read at start-up is never overwritten by the empty local file
//  - once it can be read, its accounts and the ones made meanwhile are merged and saved
//  - many quick saves end with the latest data in the cloud; a failed save is retried
//   node tools/cloudsave-test.js   (ports 5397 + 5398)
import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
fs.rmSync('tools/out/cs-data', { recursive: true, force: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok) => { results.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + name); };

// the fake cloud: one key, can be told to fail
let store = JSON.stringify({ users: { oldrider: { key: 'oldrider', name: 'OldRider', salt: 'x', hash: 'x', created: 1, coins: 777, owned: [], equipped: { vehicle: 'mx250', color: 'stock', gear: 'match' }, stats: { laps: 0, wins: 0, tricks: 0 } } } });
let failing = true, sets = 0;
const cloud = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    if (failing) { res.writeHead(500); res.end(JSON.stringify({ error: 'down' })); return; }
    const [cmd, , val] = JSON.parse(b);
    if (cmd === 'SET') { store = val; sets++; }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ result: cmd === 'GET' ? store : 'OK' }));
  });
}).listen(5398);
const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: '5397', DATA_DIR: 'tools/out/cs-data', UPSTASH_REDIS_REST_URL: 'http://localhost:5398', UPSTASH_REDIS_REST_TOKEN: 't', CLOUD_RETRY_MS: '1500' } });
let log = ''; srv.stdout.on('data', (d) => (log += d));
const B = 'http://localhost:5397';
const post = async (route, body, tok) => (await fetch(B + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) })).json();
for (let i = 0; i < 40 && !/running at/.test(log); i++) await wait(250);
check('server opens even with the cloud down', /running at/.test(log));
const n = await post('register', { name: 'NewRider', password: 'pw12345' });
await wait(800);
check('the unreadable cloud is not overwritten', JSON.parse(store).users.oldrider && !JSON.parse(store).users.newrider && sets === 0);
failing = false;
await wait(2500);
const c = JSON.parse(store);
check('after it comes back: old and new accounts merged in the cloud', c.users.oldrider && c.users.oldrider.coins === 777 && c.users.newrider);
// many quick changes: the last one wins
for (let i = 0; i < 8; i++) { await post('reward', { kind: 'lap', amount: 10 }, n.token); }
await wait(1200);
const me = await (await fetch(B + '/api/me', { headers: { Authorization: 'Bearer ' + n.token } })).json();
check('quick saves end with the latest coins in the cloud', JSON.parse(store).users.newrider.coins === me.profile.coins);
// a failed save is retried
failing = true;
await post('reward', { kind: 'lap', amount: 10 }, n.token);
await wait(700);
failing = false;
await wait(1200);
const me2 = await (await fetch(B + '/api/me', { headers: { Authorization: 'Bearer ' + n.token } })).json();
check('a failed cloud save is tried again', JSON.parse(store).users.newrider.coins === me2.profile.coins);
const ok = results.every(Boolean);
console.log(ok ? 'all passed' : 'FAILED');
srv.kill(); cloud.close(); process.exit(ok ? 0 : 1);
