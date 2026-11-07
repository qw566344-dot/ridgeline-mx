// Name change: first free, next two cost 50,000 coins, no more after 3; friends and login follow the new name.
//   node tools/rename-test.js
import { spawn } from 'child_process';
import fs from 'fs';
fs.rmSync('tools/out/rn-data', { recursive: true, force: true });
const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: '5397', DATA_DIR: 'tools/out/rn-data' } });
srv.stderr.on('data', (d) => process.stderr.write(d));
await new Promise((r) => setTimeout(r, 1500));
const B = 'http://localhost:5397/api/';
const post = async (route, body, tok) => (await fetch(B + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-device': 'a'.repeat(32), ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) })).json();
let bad = 0; const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) bad++; };
const a = await post('register', { name: 'OldName', password: 'pw1234' });
ok(!!a.token, 'register');
const again = await post('register', { name: 'SecondTry', password: 'pw1234' });
ok(again.oneAccount === true, 'a second account from the same device is refused');
const r1 = await post('rename', { name: 'NewName1' }, a.token);
ok(r1.profile && r1.profile.name === 'NewName1' && r1.cost === 0, 'first change is free');
const lg = await post('login', { name: 'NewName1', password: 'pw1234' });
ok(!!lg.token, 'login works with the new name');
const r2 = await post('rename', { name: 'NewName2' }, a.token);
ok(r2.error && /50,000/.test(r2.error), 'second change needs 50,000 coins');
srv.kill();
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
