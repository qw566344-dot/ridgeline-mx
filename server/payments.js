// =====================================================================
//  PAYMENTS (Stripe Checkout). No card number ever touches this server:
//    1. the player clicks Buy  -> POST /api/pay/checkout {item}  -> we ask Stripe for a checkout page and hand back its URL
//    2. the player pays on Stripe's own page
//    3. Stripe tells us           -> POST /api/stripe/webhook (signed)  -> ONLY THEN do we add the coins / pass
//  Settings (Render -> Environment):
//    STRIPE_SECRET_KEY      sk_test_... while testing, sk_live_... for real money
//    STRIPE_WEBHOOK_SECRET  whsec_...   (Stripe -> Developers -> Webhooks -> your endpoint)
//  With STRIPE_SECRET_KEY unset everything here is switched off and the game hides the buttons.
// =====================================================================
import crypto from 'node:crypto';
import { moneyItem } from '../shared/money.js';

const SITES = ['https://www.ridgeline-mx.com', 'https://ridgeline-mx.com', 'https://ridgeline-mx.onrender.com'];
const siteFor = (origin) => (SITES.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '')) ? origin : SITES[0];

export class Payments {
  constructor(accounts) { this.accounts = accounts; }
  get enabled() { return !!process.env.STRIPE_SECRET_KEY; }
  get log() { const db = this.accounts.db; return db.payments || (db.payments = {}); } // session id -> what was granted (also stops double grants)

  status() { return { enabled: this.enabled, test: /^sk_test_/.test(process.env.STRIPE_SECRET_KEY || '') }; }

  async checkout(u, itemId, origin) {
    if (!this.enabled) return { error: 'Buying is not switched on yet' };
    const item = moneyItem(String(itemId));
    if (!item) return { error: 'Unknown item' };
    if (item.id === 'pass' && u.passPremium) return { error: 'You already have the Premium Pass' };
    const site = siteFor(origin);
    const f = new URLSearchParams({
      mode: 'payment',
      success_url: site + '/?paid=1',
      cancel_url: site + '/?paid=0',
      client_reference_id: u.key,
      'metadata[user]': u.key,
      'metadata[item]': item.id,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(item.cents),
      'line_items[0][price_data][product_data][name]': item.name,
    });
    try {
      const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }, body: f });
      const j = await r.json();
      if (!r.ok || !j.url) { console.log('stripe checkout failed:', j && j.error && j.error.message); return { error: 'Could not start the payment' }; }
      return { ok: true, url: j.url };
    } catch { return { error: 'Could not reach the payment service' }; }
  }

  // Stripe signs every webhook: "t=timestamp,v1=hmac". Anything that does not verify is thrown away.
  verify(raw, header) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !header) return false;
    const parts = Object.fromEntries(String(header).split(',').map((p) => p.split('=')));
    if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
    const want = crypto.createHmac('sha256', secret).update(parts.t + '.' + raw).digest('hex');
    const a = Buffer.from(want), b = Buffer.from(String(parts.v1));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  // the grant itself; once per Stripe session, whatever Stripe resends
  fulfil(session) {
    if (!session || session.payment_status !== 'paid' || !session.id) return { skipped: true };
    if (this.log[session.id]) return { duplicate: true };
    const meta = session.metadata || {};
    const u = this.accounts.db.users[meta.user];
    const item = moneyItem(meta.item);
    if (!u || !item) { console.log('stripe: paid session with no matching rider/item', session.id); return { skipped: true }; }
    if (session.amount_total != null && session.amount_total !== item.cents) { console.log('stripe: amount mismatch', session.id, session.amount_total, item.cents); return { skipped: true }; }
    if (item.id === 'pass') u.passPremium = true; else u.coins = (u.coins || 0) + item.coins;
    u.rev = (u.rev || 0) + 1; // the open game notices and refreshes the profile (same trick the admin tools use)
    this.log[session.id] = { user: u.key, item: item.id, cents: item.cents, at: Date.now() };
    this.accounts.save();
    console.log('stripe: granted', item.id, 'to', u.name);
    return { granted: true };
  }

  // raw HTTP handler for /api/stripe/webhook (needs the untouched body to check the signature)
  webhook(req, res) {
    let raw = '';
    req.on('data', (d) => { raw += d; if (raw.length > 262144) req.destroy(); });
    req.on('end', () => {
      if (!this.verify(raw, req.headers['stripe-signature'])) { res.writeHead(400); res.end('bad signature'); return; }
      try {
        const ev = JSON.parse(raw);
        if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') this.fulfil(ev.data && ev.data.object);
      } catch { /* ignore */ }
      res.writeHead(200); res.end('ok');
    });
  }
}
