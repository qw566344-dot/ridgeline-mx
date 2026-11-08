// Rewarded ads: 5,000 coins each, 20 a day, a wait between ads, and the ad must have been on screen before it can be claimed.
//   node tools/ad-test.js   (starts its own server on port 5392; the waits are shortened with env vars)
import { spawn } from 'child_process';
import fs from 'fs';
fs.rmSync('tools/out/ad-data', { recursive: true, force: true });
const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, ADS_ENABLED: '1', PORT: '5392', DATA_DIR: 'tools/out/ad-data', AD_COOLDOWN_MS: '400', AD_MIN_WATCH_S: '0.3' } });
srv.stderr.on('data', (d) => process.stderr.write(d));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1500);
const call = async (route, body, tok) => (await fetch('http://localhost:5392/api/' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined })).json();
let bad = 0; const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) bad++; };
const a = await call('register', { name: 'AdRider', password: 'pw1234' });
const coins = async () => (await call('me', null, a.token)).profile.coins;
const c0 = await coins();
let st = await call('ad/status', null, a.token);
ok(st.left === 20 && st.coins === 5000, '20 ads a day, 5,000 coins each');
const s1 = await call('ad/start', {}, a.token);
ok(s1.ok && s1.nonce, 'an ad can be started');
const early = await call('ad/claim', { nonce: s1.nonce }, a.token);
ok(!!early.error && (await coins()) === c0, 'claiming straight away (before the ad was on screen) gives nothing');
await wait(500);
const s2 = await call('ad/start', {}, a.token);
await wait(450);
ok((await call('ad/claim', { nonce: 'wrong' }, a.token)).error !== undefined, 'a made-up claim code is refused');
const got = await call('ad/claim', { nonce: s2.nonce }, a.token);
ok(got.added === 5000 && (await coins()) === c0 + 5000, 'a watched ad pays 5,000 coins');
ok((await call('ad/claim', { nonce: s2.nonce }, a.token)).error !== undefined, 'the same ad cannot be claimed twice');
const tooSoon = await call('ad/start', {}, a.token);
ok(!!tooSoon.error, 'the next ad is refused during the wait');
// watch up to the daily cap
let n = 1;
for (let i = 0; i < 25; i++) {
  await wait(420);
  const s = await call('ad/start', {}, a.token);
  if (s.error) break;
  await wait(350);
  const r = await call('ad/claim', { nonce: s.nonce }, a.token);
  if (r.added) n++; else break;
}
ok(n === 20, 'exactly 20 ads were paid today (got ' + n + ')');
await wait(450);
const over = await call('ad/start', {}, a.token);
ok(/all 20|tomorrow/.test(over.error || ''), 'the 21st ad is refused until tomorrow');
ok((await coins()) === c0 + 20 * 5000, 'the account got 100,000 coins in total');
srv.kill();
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
