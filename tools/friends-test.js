// Friends system test: starts a throwaway server on port 5399 with an empty
// data folder, makes three accounts and runs every friends action + edge case.
//   node tools/friends-test.js
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'tools/out/friends-data');
fs.rmSync(DATA, { recursive: true, force: true });
const BASE = 'http://localhost:5399';
const srv = spawn(process.execPath, ['server/server.js'], { cwd: ROOT, env: { ...process.env, PORT: '5399', DATA_DIR: DATA } });
let fails = 0;
const ok = (cond, what) => { console.log((cond ? 'ok   ' : 'FAIL ') + what); if (!cond) fails++; };

async function api(token, route, body, method) {
  const r = await fetch(BASE + '/api/' + route, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}

async function main() {
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/health'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const mk = async (n) => (await api(null, 'register', { name: n, password: 'pass1234' })).token;
  const a = await mk('AlphaRider'), b = await mk('BravoRider'), c = await mk('Charlie');
  ok(a && b && c, 'three accounts made');
  let r = await api(a, 'friends', { status: 'menu' });
  ok(Array.isArray(r.friends) && r.friends.length === 0, 'empty list to start');
  r = await api(a, 'friends/search?q=rider');
  ok(r.results.length === 2 && r.results.some((x) => x.you), 'search finds both riders (and marks you)');
  r = await api(a, 'friends/request', { name: 'alpharider' });
  ok(r.error && /you/i.test(r.error), 'cannot add yourself');
  r = await api(a, 'friends/request', { name: 'Nobody' });
  ok(r.error && /No rider/.test(r.error), 'unknown name rejected');
  r = await api(a, 'friends/request', { name: 'BravoRider' });
  ok(!r.error && r.outgoing.length === 1, 'request sent');
  r = await api(a, 'friends/request', { name: 'BravoRider' });
  ok(r.error && /already sent/.test(r.error), 'duplicate request rejected');
  r = await api(b, 'friends', { status: 'menu' });
  ok(r.incoming.length === 1 && r.incoming[0].name === 'AlphaRider', 'Bravo sees the request');
  r = await api(b, 'friends/accept', { name: 'AlphaRider' });
  ok(!r.error && r.friends.length === 1, 'Bravo accepts');
  r = await api(a, 'friends', { status: 'party', code: 'ABC234', region: 'us' });
  ok(r.friends[0].name === 'BravoRider' && r.friends[0].online, 'Alpha sees Bravo online');
  r = await api(b, 'friends', { status: 'menu' });
  ok(r.friends[0].status === 'party' && r.friends[0].code === 'ABC234', 'Bravo sees Alpha in a party with the code');
  r = await api(a, 'friends/invite', { name: 'BravoRider', code: 'ABC234', region: 'us' });
  ok(!r.error, 'invite sent');
  r = await api(b, 'friends', { status: 'menu' });
  ok(r.invites.length === 1 && r.invites[0].code === 'ABC234' && r.invites[0].from === 'AlphaRider', 'Bravo receives the invite');
  r = await api(b, 'friends/dismiss', { from: 'AlphaRider', code: 'ABC234' });
  ok(r.invites.length === 0, 'invite dismissed');
  r = await api(a, 'friends/invite', { name: 'Charlie', code: 'ABC234' });
  ok(r.error && /friends/.test(r.error), 'cannot invite a non-friend');
  r = await api(a, 'friends/invite', { name: 'BravoRider', code: 'bad' });
  ok(r.error, 'invite needs a party code');
  // mutual requests become a friendship straight away
  await api(c, 'friends/request', { name: 'AlphaRider' });
  r = await api(a, 'friends/request', { name: 'Charlie' });
  ok(!r.error && r.friends.length === 2, 'crossed requests auto-accept');
  // cancel + decline
  r = await api(b, 'friends/request', { name: 'Charlie' });
  r = await api(b, 'friends/cancel', { name: 'Charlie' });
  ok(r.outgoing.length === 0, 'request cancelled');
  r = await api(c, 'friends', {});
  ok(r.incoming.length === 0, 'cancelled request gone for Charlie');
  await api(b, 'friends/request', { name: 'Charlie' });
  r = await api(c, 'friends/decline', { name: 'BravoRider' });
  ok(r.incoming.length === 0 && r.friends.length === 1, 'request declined');
  r = await api(a, 'friends/remove', { name: 'BravoRider' });
  ok(!r.error && r.friends.length === 1, 'friend removed');
  r = await api(b, 'friends', {});
  ok(r.friends.length === 0, 'removal is both ways');
  r = await api(a, 'friends/remove', { name: 'BravoRider' });
  ok(r.error, 'removing a non-friend errors');
  r = await api(null, 'friends', {});
  ok(r.error, 'needs a login');
  // the party lookup used for regions
  r = await (await fetch(BASE + '/api/party?code=ZZZZZZ')).json();
  ok(r.exists === false, 'party lookup answers');
}

main().catch((e) => { console.error(e); fails++; }).finally(() => { srv.kill(); console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0); });
