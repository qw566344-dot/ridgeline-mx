// Admin panel, live: clear chat for everyone, device + address bans that stop new
// accounts, the "banned" answer for a banned rider's game, admin changes (coins,
// items, XP) reaching the rider through the inbox, and the XP tool.
//   node tools/adminlive-test.js   (starts its own server on port 5397)
import { spawn } from 'child_process';
import fs from 'fs';
fs.rmSync('tools/out/al-data', { recursive: true, force: true });
const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: '5397', DATA_DIR: 'tools/out/al-data' } });
await new Promise((r) => setTimeout(r, 1500));
const B = 'http://localhost:5397';
// each fake browser: its own device id and internet address
const browser = (device, ip, flagged = false) => {
  const h = (tok) => ({ 'Content-Type': 'application/json', 'X-Device': device, 'X-Forwarded-For': ip, ...(flagged ? { 'X-Banned': '1' } : {}), ...(tok ? { Authorization: 'Bearer ' + tok } : {}) });
  return {
    post: async (route, body, tok) => (await fetch(B + '/api/' + route, { method: 'POST', headers: h(tok), body: JSON.stringify(body) })).json(),
    get: async (route, tok) => (await fetch(B + '/api/' + route, { headers: h(tok) })).json(),
  };
};
const dev = (c) => c.repeat(32);
const results = [];
const check = (name, ok) => { results.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + name); };

const A = browser(dev('a'), '10.0.0.1'), C = browser(dev('c'), '10.0.0.2'), D = browser(dev('d'), '10.0.0.3'), E = browser(dev('e'), '10.0.0.2'), F = browser(dev('f'), '10.0.0.9');
const owner = await A.post('register', { name: 'lmkk', password: 'ownerpw1' });
const cheat = await C.post('register', { name: 'Cheater', password: 'cheatpw1' });
const friend = await D.post('register', { name: 'Friendly', password: 'friendpw' });

// clear chat: the note says clear, older messages are gone
await C.post('chat/send', { text: 'spam spam' }, cheat.token);
await D.post('chat/send', { text: 'hello' }, friend.token);
const before = await D.get('chat?after=0', friend.token);
const cl = await A.post('admin/chatclear', {}, owner.token);
const after = await D.get('chat?after=' + before.latest, friend.token);
const all = await D.get('chat?after=0', friend.token);
check('clear chat: games get a "cleared" note that wipes their chat', cl.ok && after.messages.length === 1 && after.messages[0].clear === true && all.messages.length === 1);

// live changes: the inbox hands the new profile over when an admin changed it
const i0 = await C.get('inbox?rev=-1', cheat.token);
await A.post('admin/coins', { name: 'Cheater', add: 5000 }, owner.token);
const i1 = await C.get('inbox?rev=' + i0.rev, cheat.token);
const i2 = await C.get('inbox?rev=' + i1.rev, cheat.token);
check('coins an admin gives reach the rider without a refresh', i1.profile && i1.profile.coins === cheat.profile.coins + 5000 && !i2.profile);
await A.post('admin/give', { name: 'Cheater', item: 'color:tiger' }, owner.token);
const i3 = await C.get('inbox?rev=' + i2.rev, cheat.token);
check('items too', i3.profile && i3.profile.owned.includes('color:tiger'));

// XP tool
const xp = await A.post('admin/xp', { name: 'Cheater', add: 3000 }, owner.token);
const i4 = await C.get('inbox?rev=' + i3.rev, cheat.token);
check('Add XP: level goes up, the rider sees it live', /level 5/.test(xp.ok || '') && i4.profile && i4.profile.level === 5 && i4.profile.xp === 3000);
const users = await A.get('admin/users?q=cheat', owner.token);
check('the admin list shows the level', users.users[0].level === 5);

// ban with a reason + devices
const ban = await A.post('admin/ban', { name: 'Cheater', on: true, reason: 'cheating' }, owner.token);
const kicked = await C.get('inbox?rev=0', cheat.token);
check('a banned rider\'s game hears "banned" with the reason', ban.ok && /banned/i.test(kicked.error || '') && kicked.reason === 'cheating');
const relog = await C.post('login', { name: 'Cheater', password: 'cheatpw1' });
check('the banned account can not log in', /banned/i.test(relog.error || '') && relog.reason === 'cheating');
const alt = await C.post('register', { name: 'Cheater2', password: 'cheatpw1' });
check('their device can not make a new account', alt.banned && /device/i.test(alt.error || ''));
const altIp = await E.post('register', { name: 'Cheater3', password: 'cheatpw1' });
check('nor can a new browser on their internet address', altIp.banned);
const other = await F.post('register', { name: 'Newbie', password: 'newbiepw' });
check('someone else can still sign up', !!other.token);
const fr = await D.post('login', { name: 'Friendly', password: 'friendpw' });
check('other riders still log in', !!fr.token);
const flagged = browser(dev('9'), '10.0.0.50', true);
const fl = await flagged.post('register', { name: 'Sneaky', password: 'sneakypw' });
check('a browser that keeps the "banned" note is refused even on a new address', fl.banned);
const ownerFlag = await browser(dev('a'), '10.0.0.2', true).post('login', { name: 'lmkk', password: 'ownerpw1' });
check('admins are never device-blocked', !!ownerFlag.token);

// unban: account and devices free again
await A.post('admin/ban', { name: 'Cheater', on: false }, owner.token);
const back = await C.post('login', { name: 'Cheater', password: 'cheatpw1' });
const newAcc = await E.post('register', { name: 'Cheater4', password: 'cheatpw1' });
check('unban frees the account and its devices', !!back.token && !!newAcc.token);

srv.kill();
const bad = results.filter((x) => !x).length;
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
