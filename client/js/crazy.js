// =====================================================================
//  CRAZYGAMES BUILD
//  node tools/build-html.js --crazy  ->  dist-crazygames/index.html
//  That build sets window.__MX_CRAZY and loads CrazyGames' SDK. In it the game is single player and offline:
//  no accounts, multiplayer, ranked, leaderboards, levels, chat or casino, and every vehicle is unlocked.
//  Everything here is a no-op in the normal game (and when the SDK is not loaded, e.g. when testing locally).
// =====================================================================
export const CRAZY = !!window.__MX_CRAZY;
const sdk = () => (window.CrazyGames && window.CrazyGames.SDK) || null;

// the game's sound is muted while an ad plays (CrazyGames requires it)
let audioRef = null;
export function crazyAudio(a) { audioRef = a; }
const muteWhy = { ad: false, user: false };
const applyMute = () => { try { if (audioRef) { audioRef.externalMute = muteWhy.ad || muteWhy.user; audioRef.applyVolumes(); } } catch { /* ignore */ } };
const mute = (on) => { muteWhy.ad = on; applyMute(); };

// start the SDK (CrazyGames asks for this before anything else)
export async function crazyInit() {
  if (!CRAZY) return;
  document.body.classList.add('crazy');
  const s = sdk();
  if (s) {
    try { await s.init(); } catch (e) { console.warn('CrazyGames SDK did not start', e); }
    // CrazyGames' own mute button: follow it (they ask for this: 'supports muting audio through SDK')
    try {
      muteWhy.user = !!(s.game.settings && s.game.settings.muteAudio); applyMute();
      s.game.addSettingsChangeListener((st) => { muteWhy.user = !!(st && st.muteAudio); applyMute(); });
    } catch { /* older SDK: no settings */ }
    window.MXAds = { showRewarded: rewardedAd };   // the shop's "Watch an ad" button now plays CrazyGames' rewarded ad
  }
}
export function crazyLoading(on) { const s = sdk(); try { if (CRAZY && s) (on ? s.game.loadingStart() : s.game.loadingStop()); } catch { /* ignore */ } }

// "gameplay" = actually riding (not menus, pause or the results screen); CrazyGames uses it for ad timing
let playing = false;
export function gameplay(on) {
  if (!CRAZY || playing === on) return;
  playing = on;
  const s = sdk();
  try { if (s) (on ? s.game.gameplayStart() : s.game.gameplayStop()); } catch { /* ignore */ }
}

// GAMEMONETIZE build (window.__MX_GM): their SDK tells us when an ad starts (SDK_GAME_PAUSE: mute) and ends (SDK_GAME_START)
let gmWait = null;
window.__gmPause = (on) => { mute(on); if (gmWait) (on ? gmWait.onPause() : gmWait.onStart()); };
function gmAd() {
  const g = window.sdk;
  if (!g || typeof g.showBanner !== 'function') return Promise.resolve();
  gameplay(false);
  return new Promise((resolve) => {
    let paused = false, done = false;
    const fin = () => { if (!done) { done = true; gmWait = null; mute(false); resolve(); } };
    gmWait = { onPause: () => { paused = true; }, onStart: fin };
    try { g.showBanner(); } catch { fin(); }
    setTimeout(() => { if (!paused) fin(); }, 2500);   // no ad was ready: carry on
    setTimeout(fin, 90000);                            // never freeze the game on an ad
  });
}

// an ad between races: resolves when it ended or was skipped (or failed - never block the game on an ad)
export function midgameAd() {
  if (window.__MX_GM) return gmAd();
  const s = sdk();
  if (!CRAZY || !s) return Promise.resolve();
  gameplay(false);
  return new Promise((resolve) => {
    let done = false;
    const fin = () => { if (!done) { done = true; mute(false); resolve(); } };
    try { s.ad.requestAd('midgame', { adStarted: () => mute(true), adFinished: fin, adError: fin }); } catch { fin(); }
    setTimeout(fin, 60000); // safety: an ad that never answers must not freeze the game
  });
}

// a rewarded ad: resolves true only if it was watched to the end
export function rewardedAd() {
  const s = sdk();
  if (!s) return Promise.resolve(false);
  gameplay(false);
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; mute(false); resolve(v); } };
    try { s.ad.requestAd('rewarded', { adStarted: () => mute(true), adFinished: () => fin(true), adError: () => fin(false) }); } catch { fin(false); }
    setTimeout(() => fin(false), 120000);
  });
}

