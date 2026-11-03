// =====================================================================
//  TUTORIAL: a short guided ride for new riders on the Practice track.
//  One step at a time, each with your own keys in it; a step is ticked
//  off when you have actually done it (ridden, steered, braked, shifted
//  your weight, got air, flipped, posed, reset). Offered once to every
//  new account when it first reaches the lobby; replay it any time from
//  the profile menu. Finishing pays 500 coins (once).
// =====================================================================
import { KEYS, keyName } from './input.js';
import { POSES } from './sim/tricks.js';

const k = (action) => `<kbd>${keyName((KEYS[action] || ['?'])[0])}</kbd>`;
const STEPS = [
  { title: 'Ride', text: () => `Hold ${k('throttle')} to open the throttle and get rolling.`, done: (T) => T.speed > 9 },
  { title: 'Steer', text: () => `Steer with ${k('left')} and ${k('right')}. Carve a few turns.`, done: (T) => T.steerAcc > 22 },
  { title: 'Brake', text: () => `Hold ${k('brake')} to brake. Scrub off some speed.`, done: (T) => T.brakeAcc > 0.7 },
  { title: 'Weight', text: () => `Shift your weight: ${k('leanBack')} leans back, ${k('leanFwd')} leans forward. Try both.`, done: (T) => T.backAcc > 0.35 && T.fwdAcc > 0.35 },
  { title: 'Air', text: () => 'Find a jump and send it - stay in the air for a second.', done: (T) => T.bigAir },
  { title: 'Backflip', text: () => `Off a jump, hold ${k('leanBack')} in the air to flip. Let go to land on your wheels.`, done: (T) => T.flipped },
  { title: 'Pose', text: () => `In the air, hold ${k('trick1')} for a Superman (${k('trick2')} ${k('trick3')} ${k('trick4')} are the others).`, done: (T) => T.posed },
  { title: 'Reset', text: () => `Stuck or off the track? Press ${k('reset')} to reset. Try it now.`, done: (T) => T.didReset },
];

export class Tutorial {
  constructor(game, ui, input, settings) {
    this.game = game; this.ui = ui; this.input = input; this.settings = settings;
    this.active = false;
  }

  key() { const A = this.ui.account; return 'mx.tutorialDone.' + ((A && A.profile && A.profile.name) || 'guest').toLowerCase(); }
  isDone() { try { return localStorage.getItem(this.key()) === '1'; } catch { return true; } }
  markDone() { try { localStorage.setItem(this.key(), '1'); } catch { /* private mode */ } }

  // the first time a brand-new rider reaches the lobby: offer it
  maybeOffer() {
    const A = this.ui.account, P = A && A.profile;
    if (this.offered || this.active || !P || this.isDone()) return;
    if ((P.xp || 0) > 400) { this.markDone(); return; } // not new: never nag
    this.offered = true;
    setTimeout(() => {
      if (this.ui.screen !== 'home') { this.offered = false; return; }
      this.ui.popup('<b>New to Ridgeline MX?</b><br>Take a two-minute tutorial ride on the Practice track - the controls, your first jump, a flip and a trick. 500 coins for finishing.', 'good',
        [['Start tutorial', () => this.start(), true], ['Skip', () => this.markDone()]], 0);
    }, 900);
  }

  async start() {
    if (this.active) return;
    const S = this.settings;
    this.active = true; this.step = 0;
    this.T = { speed: 0, steerAcc: 0, brakeAcc: 0, backAcc: 0, fwdAcc: 0, bigAir: false, flipped: false, posed: false, didReset: false };
    this.game.onPlayerEvent = (e) => this.event(e);
    await this.game.startSession({ mode: 'freeride', trackId: 'practice', vehicleId: S.get('vehicle'), colorId: S.get('color'), laps: 1, aiCount: 0 });

    this.mount();
  }

  mount() {
    if (this.el) this.el.remove();
    const el = this.el = document.createElement('div');
    el.className = 'tut';
    document.getElementById('ui').appendChild(el);
    this.draw();
  }

  draw(flash) {
    const el = this.el;
    if (!el) return;
    if (this.step >= STEPS.length) {
      el.innerHTML = `<div class="tut-card done"><div class="tut-kicker">TUTORIAL COMPLETE</div><div class="tut-title">You're ready to ride</div>
        <div class="tut-text">Race in the lobby, climb in Ranked, and pick up rewards in the Pass as you level up.</div>
        <div class="tut-row"><button class="primary" data-tut="finish">Back to the lobby</button><button data-tut="stay">Keep riding</button></div></div>`;
    } else {
      const s = STEPS[this.step];
      el.innerHTML = `<div class="tut-card${flash ? ' flash' : ''}"><div class="tut-kicker">TUTORIAL ${this.step + 1} / ${STEPS.length}</div><div class="tut-title">${s.title}</div>
        <div class="tut-text">${s.text()}</div>
        <div class="tut-dots">${STEPS.map((_, i) => `<i class="${i < this.step ? 'on' : i === this.step ? 'cur' : ''}"></i>`).join('')}</div>
        <button class="tut-skip" data-tut="skip">Skip tutorial</button></div>`;
    }
    el.querySelectorAll('[data-tut]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); this.action(b.dataset.tut); });
  }

  action(a) {
    if (a === 'skip') { this.markDone(); this.stop(true); }
    else if (a === 'finish') this.stop(true);
    else if (a === 'stay') this.stop(false);
  }

  stop(toLobby) {
    this.active = false;
    this.game.onPlayerEvent = null;
    if (this.el) { this.el.remove(); this.el = null; }
    if (toLobby) this.ui.emit('mainMenu');
  }

  // the game tells us what the player just did (see Game: onPlayerEvent)
  event(e) {
    if (!this.active) return;
    const T = this.T;
    if (e.type === 'land' && e.air > 0.8) T.bigAir = true;
    if (e.type === 'reset') T.didReset = true;
    if (e.type === 'trick' && e.parts) {
      if (e.parts.some((p) => /flip/i.test(p.name))) T.flipped = true;
      if (e.parts.some((p) => POSES.some((n) => p.name.includes(n)))) T.posed = true;
    }
  }

  // every frame while it runs: count up what the player is doing, tick off the step
  tick(dt) {
    if (!this.active || !this.el || this.step >= STEPS.length) return;
    const g = this.game, v = g.player && g.player.veh;
    if (!v || g.state !== 'running') return;
    const T = this.T, inp = this.input, spd = Math.abs(v.speed || 0);
    T.speed = spd;
    if (spd > 4 && (inp.held('left') || inp.held('right'))) T.steerAcc += spd * dt * 0.6;
    if (inp.held('brake') && spd > 1.5) T.brakeAcc += dt;
    if (inp.held('leanBack')) T.backAcc += dt;
    if (inp.held('leanFwd')) T.fwdAcc += dt;
    if (STEPS[this.step].done(T)) {
      this.step++;
      if (this.step >= STEPS.length) {
        this.markDone();
        if (!this.paid) { this.paid = true; const A = this.ui.account; if (A && A.reward) A.reward('section', 500).then((n) => n > 0 && g.toast('+' + n + ' coins - tutorial complete!', 2.5, 'coins')); }
      }
      if (g.audio && g.audio.beep) g.audio.beep(true);
      this.draw(true);
    }
  }
}
