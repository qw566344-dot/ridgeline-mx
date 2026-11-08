// =====================================================================
//  COOKIE / PRIVACY NOTICE
//  A small banner on a player's first visit: "Accept" or "Essential only". The choice is kept in localStorage as
//  { ads: true|false }. Nothing needs it today (the game only uses essential storage), but when an ad network is
//  connected its script must only be loaded if  window.MXConsent.get()?.ads  is true (needed in the EU / UK).
//  Not shown in the CrazyGames build (CrazyGames handles consent on their site).
// =====================================================================
import { CRAZY } from './crazy.js';
const KEY = 'mx.consent';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
window.MXConsent = { get: read };

export function initConsent() {
  if (CRAZY || read()) return;
  const el = document.getElementById('consent');
  if (!el) return;
  el.hidden = false;
  const choose = (ads) => {
    try { localStorage.setItem(KEY, JSON.stringify({ ads, at: Date.now() })); } catch { /* private mode */ }
    el.hidden = true;
    window.dispatchEvent(new CustomEvent('mx-consent', { detail: { ads } }));
  };
  document.getElementById('consent-all').onclick = () => choose(true);
  document.getElementById('consent-min').onclick = () => choose(false);
}
