// Chat pictures: only the account lmkk can post one (a dragged-in image or a typed link to an image).
//   node tools/chat-image-test.js
import { Accounts } from '../server/accounts.js';
import fs from 'fs'; import os from 'os'; import path from 'path';
const A = new Accounts(fs.mkdtempSync(path.join(os.tmpdir(), 'ci-')));
const dev = { id: '', ip: '' };
A.register('lmkk', 'password1', '1.1.1.1', null, dev); A.register('other', 'password1', '1.1.1.2', null, dev);
const L = A.db.users.lmkk, O = A.db.users.other;
const wait = () => new Promise((r) => setTimeout(r, 120));
const tiny = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const t = [];
t.push(['other data img refused', !!A.chat.send(O, { img: tiny }).error]); await wait();
t.push(['other url img refused', !!A.chat.send(O, { img: 'https://x.com/a.png' }).error]); await wait();
t.push(['other typed url stays text', (() => { A.chat.send(O, { text: 'https://x.com/a.png' }); const m = A.chat.list.at(-1); return m.text === 'https://x.com/a.png' && !m.img; })()]); await wait();
t.push(['lmkk typed url -> picture', (() => { const r = A.chat.send(L, { text: 'https://x.com/cat.png' }); const m = A.chat.list.at(-1); return r.ok && m.img === 'https://x.com/cat.png' && m.text === ''; })()]); await wait();
t.push(['lmkk long link without .jpg becomes a picture', (() => { const u = 'https://imgs.search.brave.com/' + 'a'.repeat(215) + '/rs:fit:500:0:1:0/g:ce'; A.chat.send(L, { text: u }); const m = A.chat.list.at(-1); return m.img === u && !m.text; })()]); await wait();
t.push(['lmkk dropped image ok + served', (() => { const r = A.chat.send(L, { img: tiny, text: 'look' }); const m = A.chat.read(0).messages.at(-1); return r.ok && m.img === tiny && m.text === 'look'; })()]); await wait();
t.push(['bad data refused', !!A.chat.send(L, { img: 'data:text/html;base64,AAAA' }).error]); await wait();
t.push(['javascript url refused', !!A.chat.send(L, { img: 'javascript:alert(1)' }).error]); await wait();
t.push(['saved chat has no data blob', !JSON.stringify(A.db.chat).includes('base64')]);
for (const [n, ok] of t) console.log(ok ? 'ok  ' : 'FAIL', n);
process.exit(t.every((x) => x[1]) ? 0 : 1);
