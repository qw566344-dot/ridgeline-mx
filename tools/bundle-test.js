// Bundles: buying one gives the skin + kit, equips both, charges 25% less,
// takes owned parts off the price; kits can not be bought on their own.
//   node tools/bundle-test.js   (starts its own server on port 5395)
import { spawn } from 'child_process';
import fs from 'fs';
import { getBundle, shopItem } from '../shared/shop.js';
fs.rmSync('tools/out/bu-data', { recursive: true, force: true });
const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: '5395', DATA_DIR: 'tools/out/bu-data' } });
await new Promise((r) => setTimeout(r, 1500));
const B = 'http://localhost:5395';
const post = async (route, body, tok) => (await fetch(B + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) })).json();
const pw = 'pw-' + Math.random().toString(36).slice(2);
const adm = await post('register', { name: 'lmkk', password: pw });
const r = await post('register', { name: 'Bun' + Math.floor(Math.random() * 1e5), password: 'pw12345' });
const name = r.profile.name;
await post('admin/coins', { name, add: 100000 }, adm.token);
const b = getBundle('tiger');
const solo = await post('buy', { slot: 'gear', id: b.gear }, r.token);
const kitAlone = !!solo.error;
const before = 500 + 100000; // starter coins + the admin's gift
const got = await post('buy', { slot: 'bundle', id: 'tiger' }, r.token);
const p = got.profile;
const okBuy = p && p.owned.includes('color:tiger') && p.owned.includes('gear:kit-tiger') && p.equipped.color === 'tiger' && p.equipped.gear === 'kit-tiger' && p.coins === before - b.price;
// own the skin already: the bundle costs 75% of the kit
const inf = getBundle('inferno');
await post('admin/give', { name, item: 'color:inferno' }, adm.token);
const c0 = (await post('buy', { slot: 'bundle', id: 'nope' }, r.token)).error === 'No such bundle';
const me0 = p.coins;
const got2 = await post('buy', { slot: 'bundle', id: 'inferno' }, r.token);
const okPartial = got2.profile && got2.profile.coins === me0 - Math.round((shopItem('gear', inf.gear).price * 0.75) / 100) * 100;
console.log('kit alone refused:', kitAlone, '| bundle gives + equips both:', !!okBuy, '| partly owned is cheaper:', !!okPartial, '| bad id refused:', c0);
const ok = kitAlone && okBuy && okPartial && c0;
console.log(ok ? 'all passed' : 'FAILED');
srv.kill(); process.exit(ok ? 0 : 1);
