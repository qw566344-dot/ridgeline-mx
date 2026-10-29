// =====================================================================
//  RIDGELINE MX - entry point. Creates the renderer, game, UI, audio,
//  network and friends objects, wires the menus to the game, and runs the
//  frame loop: the 3D lobby stage while a menu is up, the track otherwise.
// =====================================================================
import { Renderer } from './render/renderer.js';
import { Settings } from './settings.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { Stage } from './stage.js';
import { Thumbs } from './thumbs.js';
import { CasinoUI } from './casino.js';
import { AdminPanel } from './admin.js';
import { ChatBox } from './chat.js';
import { Net } from './net.js';
import { Account } from './account.js';
import { Social } from './social.js';
import { preloadModels, skinTime } from './render/modelRig.js';
import { escapeHtml } from './util.js';

const settings = new Settings();
const R = new Renderer(document.getElementById('game'));
R.applyQuality(settings.quality());
const input = new Input();
const audio = new Audio(settings);
const ui = new UI(settings);
const game = new Game({ renderer: R, settings, audio, input, ui });
const stage = new Stage(R);
const thumbs = new Thumbs(R);
const account = new Account();
const social = new Social(account);
ui.account = account; ui.game = game; ui.stage = stage; ui.social = social; ui.thumbs = thumbs;
// shop pictures: redraw the shop a moment after new ones are ready
let thumbTimer = null;
thumbs.onReady(() => { if (ui.screen === 'shop' && !thumbTimer) thumbTimer = setTimeout(() => { thumbTimer = null; const y = document.getElementById('shop-grid').scrollTop; ui.renderShop(); document.getElementById('shop-grid').scrollTop = y; }, 250); });
game.account = account;
const net = new Net(ui, game, settings);
ui.casino = new CasinoUI(ui, account);
new AdminPanel(ui, account);
new ChatBox(ui, account);
ui.net = net;
social.presence = () => net.presence();

// make sure what's selected is something this account owns
function syncEquipped() {
  if (!account.profile) return;
  for (const slot of ['vehicle', 'color', 'gear']) {
    const want = settings.get(slot);
    if (!account.owns(slot, want)) settings.set(slot, account.equipped(slot));
  }
  settings.set('playerName', account.profile.name);
}
account.onChange(() => { ui.renderTop(); if (ui.screen === 'home') ui.renderHome(); });
ui.on('loggedIn', () => {
  syncEquipped(); ui.show('home'); social.start(); net.sendProfile();
  if (account.restoredNote) { account.restoredNote = false; ui.popup('The server had restarted - your account, coins and items were restored from this computer', 'good', null, 7); }
});
ui.on('logout', () => { if (net.code) net.leave(); account.logout(); social.start(); ui.showAccount(); });

// friends: keep the lists fresh, pop up party invites wherever you are
social.onChange(() => {
  account.setFriends(social.data.friends.map((f) => f.name));
  ui.renderTop();
  if (ui.screen === 'friends') ui.renderFriends();
  if (ui.screen === 'home') ui.renderFriendsMini();
});
social.onAnnounce((a) => ui.announce(a));
social.onPull(() => net.answerPull(account.token));
// admin events: effects in the game, a chip on screen, coins from Coin Rain
social.onEvent((ev, how) => {
  game.event = ev;
  ui.setEvent(ev);
  if (how.fresh) ui.popup(`<b>EVENT: ${escapeHtml(ev.name)}</b><br>${escapeHtml(ev.desc)}`, 'good', null, 8);
  if (how.ended) ui.popup('The event has ended');
  if (how.rain) { account.init(); if (game.state === 'running' && ui.screen === 'hud') game.toast(`+${how.rain} coins (Coin Rain)`, 1.6, 'coins'); else ui.popup(`+${how.rain} coins from the Coin Rain`, 'good'); }
});
window.addEventListener('mx-banned', () => {
  ui.popup('<b>You have been banned.</b><br>An admin banned this account, so you have been logged out. You can still play offline or as a guest.', 'bad', [['OK', () => { account.bannedShown = false; }, true]], 30);
});
social.onInvite((inv) => {
  ui.popup(`<b>${escapeHtml(inv.from)}</b> invited you to their party`, '', [
    ['Join', () => { ui.emit('joinParty', inv); social.dismiss(inv); }, true],
    ['Not now', () => social.dismiss(inv)],
  ], 25);
});
ui.on('joinParty', async (inv) => {
  // riding in another session? leave it first
  if (game.state === 'running') await backToLobby();
  net.joinCode(inv.code, inv.region);
  ui.show('home');
});

// expose for debugging / automated tests in the console
window.MX = { game, ui, settings, R, net, stage, input, account, social };

// ---- menu wiring
ui.on('screen', (name) => { if (name !== 'loading') audio.unlock(); });
ui.on('startMode', async (opts) => {
  audio.unlock();
  social.fast = false;
  await game.startSession(opts);
  social.refresh();
});
ui.on('pause', () => { game.paused = true; input.enabled = false; ui.showPause(); });
ui.on('resume', () => { game.paused = false; input.enabled = true; ui.hidePause(); ui.showHud(game); });
ui.on('restart', async () => {
  ui.hidePause(); ui.hideResults();
  input.enabled = true;
  if (game.opts && game.opts.mp) { net.requestRestart(); return; }
  await game.startSession(game.opts);
});
ui.on('resetVehicle', () => { if (game.player && game.player.veh) game.resetRider(game.player); ui.emit('resume'); });
ui.on('camera', () => { game.cam.cycle(); settings.set('camera', game.cam.mode); });
async function backToLobby() {
  ui.hidePause(); ui.hideResults(); ui.hideHud();
  input.enabled = true;
  if (game.opts && game.opts.mp) {
    // the leader heading back to the lobby ends the session for the party
    if (net.isLeader() && net.session) net.send({ t: 'end' });
    net.leaveSession();
  }
  game.stop();
  social.fast = true;
  stage.snap = true;
  ui.show('home');
  social.refresh();
}
ui.on('mainMenu', backToLobby);
ui.on('region', (id) => {
  settings.set('region', id);
  if (id === 'auto') net.pingRegions(); else net.useRegion(id);
});
ui.on('pingRegions', () => { ui.regionPings = {}; ui.renderSettings(); net.pingRegions(); });
ui.on('quality', async () => {
  R.applyQuality(settings.quality());
  game.applySettings();
  // grass / detail / shadows need the scenery rebuilt
  if (game.world && game.state === 'running') {
    const { Scenery } = await import('./render/scenery.js');
    game.scenery.dispose();
    game.scenery = new Scenery(game.world, R, settings.quality());
    R.scene.add(game.scenery.group);
    game.terrain.setShadowCasting(settings.get('shadows') === 'high');
    game.scenery.forceUpdate(R.camera);
    if (game.phase === 'go') { game.scenery.dropGate(true); game.scenery.setGate(-Math.PI / 2 * 0.96); }
  }
});

window.addEventListener('pointerdown', () => audio.unlock(), { once: false });
window.addEventListener('keydown', () => audio.unlock());

// ---- boot
(async () => {
  ui.showLoading('Loading vehicles...');
  try { await preloadModels((m) => ui.showLoading(m)); } catch (e) { console.warn(e); }
  ui.showLoading('Connecting...');
  await account.init();
  net.pingRegions();
  if (account.loggedIn) { syncEquipped(); ui.show('home'); } else ui.showAccount();
  if (account.expiredName) ui.popup('Please log in again - your progress is kept on this computer', '', null, 7);
  social.start();
  net.autoRejoin();
})();

// ---- frame loop
let last = performance.now();
const STAGE_SCREENS = new Set(['account', 'home', 'play', 'garage', 'shop', 'casino', 'friends', 'settings', 'controls', 'credits']);
function loop(now) {
  const raw = (now - last) / 1000;
  const dt = Math.min(0.1, raw);
  game.rawDt = raw;
  last = now;
  skinTime.value = now / 1000; // animated skins
  input.update(dt);
  if (ui.screen === 'shop') thumbs.step();
  if (STAGE_SCREENS.has(ui.screen) && game.state !== 'running') stage.render(dt);
  else { stage.active = false; game.frame(dt); }
  input.endFrame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
