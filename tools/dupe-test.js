// One account per player: logging into your main account deletes your other accounts made on the same device.
//   node tools/dupe-test.js   (starts its own server on port 5396)
import { spawn } from 'child_process';
import fs from 'fs';
fs.rmSync('tools/out/dupe-data', { recursive: true, force: true });
const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: '5396', DATA_DIR: 'tools/out/dupe-data' } });
srv.stderr.on('data', (d) => process.stderr.write(d));
await new Promise((r) => setTimeout(r, 1500));
const B = 'http://localhost:5396/api/';
const D1 = 'a'.repeat(32), D2 = 'b'.repeat(32);
const post = async (route, body, dev, tok) => (await fetch(B + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(dev ? { 'x-device': dev } : {}), ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) })).json();
let bad = 0; const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) bad++; };
const exists = async (name) => !(await post('login', { name, password: 'pw1234' }, D1)).error || false;
// legacy duplicates: made before devices were tracked (no device id), then used on device D1
const main = await post('register', { name: 'MainOne', password: 'pw1234' }, D1);
const x1 = await post('register', { name: 'ExtraOne', password: 'pw1234' });
const x2 = await post('register', { name: 'ExtraTwo', password: 'pw1234' });
const other = await post('register', { name: 'OtherDev', password: 'pw1234' }, D2); // also used on D1 below: a different person's account
ok(main.token && x1.token && x2.token && other.token, 'four accounts exist');
// they were used on D1 (a plain session check records the device without logging in again)
for (const t of [x1.token, x2.token, other.token]) await post('me', {}, D1, t);
// the player logs into their main account on D1
await post('login', { name: 'MainOne', password: 'pw1234' }, D1);
const gone1 = await post('login', { name: 'ExtraOne', password: 'pw1234' }, D1), gone2 = await post('login', { name: 'ExtraTwo', password: 'pw1234' }, D1);
ok(gone1.error === 'No account with that name' && gone2.error === 'No account with that name', 'the extra accounts from this device were deleted');
const still = await post('login', { name: 'MainOne', password: 'pw1234' }, D1);
ok(!!still.token, 'the account they logged into is kept');
const keep = await post('login', { name: 'OtherDev', password: 'pw1234' }, D2);
ok(!!keep.token, 'an account that was also used on another device is not touched');
srv.kill();
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
