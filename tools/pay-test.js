// Payments test: the signed Stripe webhook grants coins / the pass exactly once; bad signatures, wrong amounts
// and unpaid sessions grant nothing; checkout refuses when Stripe is not configured.
//   node tools/pay-test.js
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { COIN_PACKS, PASS_CENTS } from '../shared/money.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'tools/out/pay-data');
const BASE = 'http://localhost:5397', SECRET = 'whsec_test_secret';
let fails = 0;
const ok = (c, what) => { console.log((c ? 'ok   ' : 'FAIL ') + what); if (!c) fails++; };
const api = async (t, r, b) => (await fetch(BASE + '/api/' + r, { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();
const hook = async (session, { secret = SECRET, age = 0 } = {}) => {
  const raw = JSON.stringify({ type: 'checkout.session.completed', data: { object: session } }), t = Math.floor(Date.now() / 1000) - age;
  const sig = crypto.createHmac('sha256', secret).update(t + '.' + raw).digest('hex');
  return fetch(BASE + '/api/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${t},v1=${sig}` }, body: raw });
};
const sess = (id, user, item, cents, status = 'paid') => ({ id, payment_status: status, amount_total: cents, metadata: { user, item } });
async function up() { for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/health'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } } }

fs.rmSync(DATA, { recursive: true, force: true });
const srv = spawn(process.execPath, ['server/server.js'], { cwd: ROOT, env: { ...process.env, PORT: '5397', DATA_DIR: DATA, STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_SECRET_KEY: '' } });
try {
  await up();
  const pw = 'pw-' + Math.random().toString(36).slice(2, 10);
  const tk = (await api(null, 'register', { name: 'PayTester', password: pw })).token;
  const coins = async () => (await api(tk, 'me')).profile.coins;
  const c0 = await coins(), pack = COIN_PACKS[1];
  ok((await api(tk, 'pay/status')).enabled === false, 'buying reports itself switched off without a Stripe key');
  ok(/not switched on/i.test((await api(tk, 'pay/checkout', { item: 'c1' })).error || ''), 'checkout refuses without a Stripe key');
  ok((await hook(sess('cs_1', 'paytester', pack.id, pack.cents), { secret: 'wrong' })).status === 400 && await coins() === c0, 'a wrongly signed webhook is rejected and grants nothing');
  ok((await hook(sess('cs_1', 'paytester', pack.id, pack.cents), { age: 3600 })).status === 400 && await coins() === c0, 'an old (replayed) webhook is rejected');
  ok((await hook(sess('cs_1', 'paytester', pack.id, pack.cents))).status === 200 && await coins() === c0 + pack.coins, 'a paid, signed webhook adds the pack coins');
  await hook(sess('cs_1', 'paytester', pack.id, pack.cents));
  ok(await coins() === c0 + pack.coins, 'the same Stripe session is never paid out twice');
  await hook(sess('cs_2', 'paytester', pack.id, pack.cents, 'unpaid'));
  await hook(sess('cs_3', 'paytester', pack.id, 1));
  await hook(sess('cs_4', 'nobody', pack.id, pack.cents));
  await hook(sess('cs_5', 'paytester', 'bogus', pack.cents));
  ok(await coins() === c0 + pack.coins, 'unpaid, wrong-amount, unknown-rider and unknown-item sessions grant nothing');
  ok(!(await api(tk, 'me')).profile.passPremium, 'no pass before buying it');
  ok(/45,000/.test((await api(tk, 'pass/buy')).error || '') && !(await api(tk, 'me')).profile.passPremium, 'too few coins: the pass is refused (it costs 45,000 coins)');
  await hook(sess('cs_6', 'paytester', 'pass', PASS_CENTS));
  ok((await api(tk, 'me')).profile.passPremium === true, 'the paid pass webhook unlocks the Premium Pass');
  ok((await api(tk, 'inbox?rev=0')).profile !== undefined, 'the open game is told to refresh its profile');
  { // coming back from Stripe: the buyer can ask what their purchase was (no refresh, no waiting)
    const c = await api(tk, 'pay/confirm', { sid: 'cs_1' }), p = await api(tk, 'pay/confirm', { sid: 'cs_6' });
    ok(c.ok && c.item === pack.id && c.coins === pack.coins && c.cents === pack.cents && c.profile.coins === await coins(), 'confirm tells the buyer what they bought, with the fresh profile');
    ok(p.ok && p.item === 'pass' && p.profile.passPremium, 'confirm works for the pass too');
    const other = (await api(null, 'register', { name: 'Stranger', password: pw })).token;
    ok((await api(other, 'pay/confirm', { sid: 'cs_1' })).pending === true, "nobody else can read someone's purchase");
    ok((await api(tk, 'pay/confirm', { sid: 'cs_unknown_zzzzzz' })).pending === true && !!(await api(tk, 'pay/confirm', { sid: '../x' })).error, 'unknown purchases stay pending, bad ids are refused');
  }
} finally { srv.kill(); }
console.log(fails ? `\n${fails} FAILED` : '\nall payment checks passed');
process.exit(fails ? 1 : 0);
