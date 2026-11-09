// =====================================================================
//  REAL-MONEY PRICES (Stripe). Change a price or a coin amount here and nothing else:
//  the shop, the checkout and the server all read this one list.
//  cents = what the player pays in US cents.  coins = what they get.
// =====================================================================
export const COIN_PACKS = [
  { id: 'c1', cents: 49, coins: 10000 },
  { id: 'c2', cents: 99, coins: 25000 },
  { id: 'c3', cents: 199, coins: 60000 },
  { id: 'c4', cents: 399, coins: 130000 },
];
// MASTER SWITCH for real-money buying. false = the + button is hidden, the pass says "coming soon", checkout refuses.
// Flip to true (and make sure the live Stripe keys are in Render) to open the shop.
export const PAYMENTS_ON = false;

export const PASS_CENTS = 299; // the Premium Pass, bought once

export const usd = (cents) => '$' + (cents / 100).toFixed(2);

// what a checkout id means: 'pass' or one of the pack ids
export function moneyItem(id) {
  if (id === 'pass') return { id: 'pass', cents: PASS_CENTS, name: 'Ridgeline MX Premium Pass', coins: 0 };
  const p = COIN_PACKS.find((x) => x.id === id);
  return p ? { id: p.id, cents: p.cents, name: `${p.coins.toLocaleString('en-US')} Ridgeline MX coins`, coins: p.coins } : null;
}
