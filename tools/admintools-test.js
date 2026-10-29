// Admin tools: warn, kick, mute, take item, new password, close party,
// make admin (owners only, owners protected), summon, and the admin log.
//   node tools/admintools-test.js   (starts its own server on port 5396)
import { spawn } from 'child_process';
import fs from 'fs';
import { PROTOCOL_VERSION } from '../shared/protocol.js';
fs.rmSync('tools/out/at-data', { recursive: true, force: true });
const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: '5396', DATA_DIR: 'tools/out/at-data' } });
await new Promise((r) => setTimeout(r, 1500));
const B = 'http://localhost:5396';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (route, body, tok) => (await fetch(B + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) })).json();
const get = async (route, tok) => (await fetch(B + '/api/' + route, { headers: { Authorization: 'Bearer ' + tok } })).json();
const client = (name) => { const ws = new WebSocket('ws://localhost:5396/ws'); const c = { ws, msgs: [], send: (o) => ws.send(JSON.stringify(o)) }; ws.onmessage = (e) => c.msgs.push(JSON.parse(e.data)); c.open = new Promise((res) => (ws.onopen = () => { c.send({ t: 'hello', v: PROTOCOL_VERSION, name }); res(); })); return c; };
const results = [];
const check = (name, ok) => { results.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + name); };

const owner = await post('register', { name: 'lmkk', password: 'ownerpw1' });
const R = await post('register', { name: 'Rider1', password: 'riderpw1' });
const H = await post('register', { name: 'Helper', password: 'helperpw' });
await post('friends', { status: 'menu' }, R.token);

// warn: shows up once in the rider's next poll
await post('admin/warn', { name: 'Rider1', text: 'Be nice' }, owner.token);
const p1 = await post('friends', { status: 'menu' }, R.token), p2 = await post('friends', { status: 'menu' }, R.token);
check('warn reaches the rider once', p1.admin && p1.admin[0].kind === 'warn' && p1.admin[0].text === 'Be nice' && !p2.admin);

// mute: no global chat, then unmute
await post('admin/mute', { name: 'Rider1', minutes: 10 }, owner.token);
const mutedSend = await post('chat/send', { text: 'hello' }, R.token);
await post('admin/mute', { name: 'Rider1', minutes: 0 }, owner.token);
const freeSend = await post('chat/send', { text: 'hello again' }, R.token);
check('mute blocks chat, unmute lets it through', /muted/.test(mutedSend.error || '') && freeSend.ok);

// take item
await post('admin/give', { name: 'Rider1', item: 'color:tiger' }, owner.token);
await post('equip', { slot: 'color', id: 'tiger' }, R.token);
await post('admin/take', { name: 'Rider1', item: 'color:tiger' }, owner.token);
const me = await get('me', R.token);
check('take item removes it and unequips it', !me.profile.owned.includes('color:tiger') && me.profile.equipped.color === 'stock');

// kick: out of the party on the game server, and a kick in the next poll
const A = client('lmkk'), T = client('Rider1');
await Promise.all([A.open, T.open]); await wait(300);
T.send({ t: 'create' }); await wait(300);
await post('admin/kick', { name: 'Rider1' }, owner.token); await wait(300);
const kp = await post('friends', { status: 'menu' }, R.token);
check('kick: out of the party + told to go to the menu', T.msgs.some((m) => m.t === 'left') && T.msgs.some((m) => m.t === 'kicked') && kp.admin && kp.admin.some((x) => x.kind === 'kick'));

// summon: the rider lands in the admin's party
A.send({ t: 'adminsummon', name: 'Rider1', auth: owner.token }); await wait(400);
const pa = [...A.msgs].reverse().find((m) => m.t === 'party'), pt = [...T.msgs].reverse().find((m) => m.t === 'party');
check('summon brings the rider into the admin\'s party', pa && pt && pa.code === pt.code && T.msgs.some((m) => m.t === 'summoned'));

// close party
const st = await get('admin/stats', owner.token);
const code = st.partyList[0].code;
await post('admin/closeparty', { code }, owner.token); await wait(300);
const st2 = await get('admin/stats', owner.token);
check('close party ends it for everyone', st2.parties === 0 && T.msgs.some((m) => m.t === 'ended'));

// make admin: owners only; a made admin can use the panel but not touch the owner
const notOwner = await post('admin/makeadmin', { name: 'Rider1' }, H.token);
await post('admin/makeadmin', { name: 'Helper', on: true }, owner.token);
const hMe = await get('me', H.token);
const hStats = await get('admin/stats', H.token);
const hBan = await post('admin/ban', { name: 'lmkk', on: true }, H.token);
const hMake = await post('admin/makeadmin', { name: 'Rider1', on: true }, H.token);
check('make admin: owner only, new admin works, owner protected', notOwner.error && hMe.profile.admin && !hStats.error && hBan.error && /owners/i.test(hMake.error || ''));
await post('admin/makeadmin', { name: 'Helper', on: false }, owner.token);
check('remove admin', (await get('admin/stats', H.token)).error === 'Admins only');

// new password: old login stops working, the new password logs in
await post('admin/password', { name: 'Rider1', password: 'newpass9' }, owner.token);
const old = await get('me', R.token);
const relog = await post('login', { name: 'Rider1', password: 'newpass9' });
check('new password logs them out and works', !!old.error && !!relog.token);

// log
const log = await get('admin/log', owner.token);
const acts = new Set(log.log.map((x) => x.action));
check('admin log has every action', ['warn', 'mute', 'unmute', 'give', 'take', 'kick', 'closeparty', 'makeadmin', 'removeadmin', 'password'].every((a) => acts.has(a)));

const ok = results.every(Boolean);
console.log(ok ? 'all passed' : 'FAILED');
srv.kill(); process.exit(ok ? 0 : 1);
