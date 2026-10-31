// The Render Key Value (REDIS_URL) cloud save, against a stand-in Redis server:
// make an account, wipe the server's disk, restart - the account is still there.
//   node tools/redis-store-test.js
import net from 'net';
import { spawn } from 'child_process';
import fs from 'fs';
const kv = new Map();
// a stand-in Redis that understands AUTH, GET and SET (RESP)
const mock = net.createServer((s) => {
  let buf = '';
  s.on('data', (d) => {
    buf += d;
    for (;;) {
      const m = /^\*(\d+)\r\n/.exec(buf); if (!m) return;
      let i = m[0].length; const args = [];
      for (let k = 0; k < Number(m[1]); k++) {
        const h = /^\$(\d+)\r\n/.exec(buf.slice(i)); if (!h) return;
        i += h[0].length; const n = Number(h[1]); if (buf.length < i + n + 2) return;
        args.push(buf.slice(i, i + n)); i += n + 2;
      }
      buf = buf.slice(i);
      const [c, k, v] = args;
      if (c === 'AUTH') s.write(v === undefined && k === 'secret' ? '+OK\r\n' : '-ERR bad password\r\n');
      else if (c === 'GET') { const x = kv.get(k); s.write(x === undefined ? '$-1\r\n' : `$${Buffer.byteLength(x)}\r\n${x}\r\n`); }
      else if (c === 'SET') { kv.set(k, v); s.write('+OK\r\n'); }
      else s.write('-ERR unknown\r\n');
    }
  });
}).listen(5398);
const DATA = 'tools/out/redis-data';
const env = { ...process.env, PORT: '5399', DATA_DIR: DATA, REDIS_URL: 'redis://:secret@127.0.0.1:5398', CLOUD_RETRY_MS: '600' };
const start = () => spawn(process.execPath, ['server/server.js'], { env });
const B = 'http://localhost:5399';
const up = async () => { for (let i = 0; i < 80; i++) { try { await fetch(B + '/health'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } } };
const api = async (t, r, b) => (await fetch(B + '/api/' + r, { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();
let fails = 0; const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) fails++; };
fs.rmSync(DATA, { recursive: true, force: true });
let srv = start();
try {
  await up();
  const pw = 'pw-' + Math.random().toString(36).slice(2);
  const a = await api(null, 'register', { name: 'KeyValueKid', password: pw });
  const b = await api(null, 'register', { name: 'KVBuddy', password: pw });
  await api(a.token, 'friends/request', { name: 'KVBuddy' }); await api(b.token, 'friends/accept', { name: 'KeyValueKid' });
  await new Promise((r) => setTimeout(r, 900));
  ok(kv.size === 1, 'accounts written to Key Value');
  srv.kill(); await new Promise((r) => setTimeout(r, 400));
  fs.rmSync(DATA, { recursive: true, force: true });
  srv = start(); await up();
  const me = await api(a.token, 'me');
  ok(me.profile && me.profile.name === 'KeyValueKid', 'after a wiped restart the old login still works');
  const fr = await api(a.token, 'friends');
  ok(fr.friends && fr.friends.some((f) => f.name === 'KVBuddy'), 'and the friends list is still there');
} catch (e) { console.error(e); fails++; }
srv.kill(); mock.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
