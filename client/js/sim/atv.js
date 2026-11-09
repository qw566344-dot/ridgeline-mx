// =====================================================================
//  QUAD / ATV HANDLING
//  Four independently sprung wheels hold the quad up - there is no
//  balance help, so body roll, weight transfer and rollovers are real.
//  - Ackermann steering on the front wheels, less lock at speed
//  - Solid rear axle: both rear wheels driven together, which makes the
//    quad push wide unless you break the rear loose with throttle
//  - Rider body-English: steering also leans the rider into the turn,
//    which helps keep the inside wheels down
//  - Anti-roll bars tie the left and right suspension together
// =====================================================================
import * as THREE from '../../vendor/three.module.js';
import { groundAt } from '../../../shared/terrain.js';
import { bankBoost } from './bike.js';
import { sideGrip } from './bike.js';
import { newTrick, scoreTricks, trackPose, wheelieAssist, trackWheelie } from './tricks.js';

const DEG = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const g0 = { h: 0, nx: 0, ny: 1, nz: 0 };
const _f = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3();

const _ax = new THREE.Vector3();
// snowmobile whip (a copy of the dirt bike's controller, see bike.js): scratch objects and the "exact angular acceleration" helper
const _qi = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0), _tf = new THREE.Vector3(), _tu = new THREE.Vector3(), _tl = new THREE.Vector3(), _te = new THREE.Vector3(), _tw = new THREE.Vector3(), _lv = new THREE.Vector3();
const _tm = new THREE.Matrix4(), _tq = new THREE.Quaternion(), _ac = new THREE.Vector3(), _lp = new THREE.Vector3();
function addAccel(v, axis, a) {
  const I = v.cfg.inertia;
  _ac.copy(axis).multiplyScalar(a).applyQuaternion(_qi.copy(v.quat).invert());
  _ac.x *= I[0]; _ac.y *= I[1]; _ac.z *= I[2];
  v.torque.add(_ac.applyQuaternion(v.quat));
}
export class AtvController {
  constructor(veh) {
    this.v = veh;
    this.rollCentre = veh.cfg.rollCentre;
    this.pitchCentre = 0.25;
    this.reset();
  }

  // cars: only the roof counts. On its side or nose-up and nearly stopped,
  // the car rolls itself back onto its wheels after a moment.
  toughChecks(dt) {
    const v = this.v;
    if (v.up.y < -0.25) { this.upsideTime += dt; if (this.upsideTime > (v.grounded ? 1.2 : 3)) return v.crash('Landed on the roof'); }
    else this.upsideTime = 0;
    if (v.up.y < 0.55 && v.speed < 4) {
      this.tipTime = (this.tipTime || 0) + dt;
      if (this.tipTime > 0.6) {
        _ax.set(-v.up.z, 0, v.up.x); // axis that turns 'up' back towards the sky
        if (_ax.lengthSq() > 1e-6) v.angVel.addScaledVector(_ax.normalize(), Math.min(4, 9 * dt) * (1 - v.up.y));
      }
    } else this.tipTime = 0;
  }

  reset() { this.steer = 0; this.rollTime = 0; this.upsideTime = 0; this.bodyRoll = 0; this.yawTarget = 0; this.trick = null; }

  preStep(dt) {
    const v = this.v, c = v.cfg, inp = v.input;
    const rate = c.steer.rate * (Math.sign(inp.steer) !== Math.sign(this.steer) ? 1.5 : 1);
    this.steer += clamp(inp.steer - this.steer, -rate * dt, rate * dt);
    v.steerHand = this.steer; // how far the bars / steering wheel are turned (-1..1), for the 3D model
    const spd = Math.abs(v.fwdSpeed);
    const t = clamp(spd / c.steer.highSpeed, 0, 1);
    const maxDeg = c.steer.maxLow + (c.steer.maxHigh - c.steer.maxLow) * Math.sqrt(t);
    // ask for a turn rate (like the bike), heavier and lazier than a bike
    const sliding = inp.rearBrake > 0.1 || Math.max(v.wheels[2].slipLong, v.wheels[3].slipLong) > 0.35;
    const yawMax = spd < 0.2 ? 0 : Math.min((spd * Math.tan(maxDeg * DEG)) / c.wheelbase, ((c.steer.latAcc || 9) * (1 + bankBoost(v, this.steer))) / Math.max(spd, 1));
    this.yawTarget = this.steer * yawMax * Math.sign(v.fwdSpeed || 1) * (sliding ? 1.3 : 1);
    let delta = spd > 0.2 ? Math.atan((this.yawTarget * c.wheelbase) / spd) * Math.sign(v.fwdSpeed) : this.steer * maxDeg * DEG;
    delta = clamp(delta, -maxDeg * DEG, maxDeg * DEG);
    v.steerAngle += (delta - v.steerAngle) * Math.min(1, dt * 20);
    // Ackermann: the inside wheel turns more than the outside one
    const [fl, fr, rl, rr] = v.wheels;
    const L = c.wheelbase, half = Math.abs(fl.cfg.x);
    const d = v.steerAngle;
    if (Math.abs(d) < 1e-4) { fl.steer = fr.steer = 0; }
    else {
      const R = L / Math.tan(Math.abs(d));
      const inner = Math.atan(L / Math.max(0.3, R - half)), outer = Math.atan(L / (R + half));
      if (d > 0) { fl.steer = inner; fr.steer = outer; } else { fl.steer = -outer; fr.steer = -inner; }
    }
    let fb = inp.brake, rb = Math.max(inp.brake * 0.45, inp.rearBrake);
    if (v.engine.reverse) { fb = inp.throttle; rb = inp.throttle * 0.7; }
    fl.brake = fr.brake = fb * c.brakes.front * 0.5;
    rl.brake = rr.brake = rb * c.brakes.rear * 0.5 * (inp.rearBrake > 0.1 ? 1.3 : 1);
    fl.noLock = fr.noLock = true;
    rl.noLock = rr.noLock = inp.rearBrake < 0.1;
    // solid axle: the drive goes to both rear wheels equally when both touch
    if (rl.contact && rr.contact) { const tot = rl.drive + rr.drive; rl.drive = rr.drive = tot / 2; }
    if (v.assist.wheelie && this.wheelieUp) { rl.drive *= 0.8; rr.drive *= 0.8; } // see bike.js
  }

  // anti-roll bars, applied once all four springs are known
  afterWheels() {
    const v = this.v, c = v.cfg;
    const [fl, fr, rl, rr] = v.wheels;
    for (const [a, b] of [[fl, fr], [rl, rr]]) {
      if (!a.contact || !b.contact) continue;
      const F = c.antiRoll * (a.comp - b.comp);
      _f.copy(v.up).multiplyScalar(F);
      v.addForceAt(_f, a.centre);
      _f.multiplyScalar(-1);
      v.addForceAt(_f, b.centre);
    }
  }

  torques(dt, contacts) {
    const v = this.v, c = v.cfg, inp = v.input, I = c.inertia;
    const fwd = v.fwd, up = v.up, left = v.left;
    const rollW = v.angVel.dot(fwd), pitchW = v.angVel.dot(left), yawW = v.angVel.dot(up);
    // rider lean for the visuals: into the turn
    const aLat = v.fwdSpeed * yawW;
    const leanTarget = v.grounded ? clamp(aLat / 9.81, -0.6, 0.6) * 0.6 + this.steer * 0.12 : this.steer * 0.2;
    v.lean += (leanTarget - v.lean) * Math.min(1, dt * 5);
    this.bodyRoll = Math.atan2(left.y, up.y);
    if (v.crashed) return;
    const [fl, fr, rl, rr] = v.wheels;
    if (contacts > 0) {
      // rider throws their weight to the high side and soaks up roll
      _n.set(0, 0, 0);
      for (const w of v.wheels) if (w.contact) _n.add(w.n);
      _n.normalize();
      const re = Math.atan2(_n.dot(left), _n.dot(up));
      v.torque.addScaledVector(fwd, -c.riderBalance * re - rollW * I[2] * 3);
      // the rider's legs soak up the bucking in whoops and on landings
      v.torque.addScaledVector(left, -pitchW * I[0] * 2.2);
      // rider hangs off the inside: rolls the quad into the turn
      const k = clamp(Math.abs(v.fwdSpeed) / 5, 0, 1);
      v.torque.addScaledVector(fwd, -this.steer * c.riderLean * k);
      // solid rear axle scrub -> understeer
      if (c.type === 'atv' && rl.contact && rr.contact) { // cars have independent rear suspension: no scrub
        const slip = Math.max(rl.slipLong, rr.slipLong);
        v.torque.addScaledVector(up, -yawW * c.axleScrub * (rl.load + rr.load) * 0.35 * (1 - slip * 0.8));
      }
      // steering: turn the heading toward the asked-for turn rate
      const sliding = inp.rearBrake > 0.1 || Math.max(rl.slipLong, rr.slipLong) > 0.35;
      let ty = (sliding ? 4 : 18) * (this.yawTarget - yawW); // firm: turns at the asked-for rate
      // grip holds the line (see bike.js sideGrip): no more turning the nose back toward the slide
      if (v.speed > 1) {
        const vlat = v.vel.dot(left);
        if (inp.brake > 0.3) ty += 4 * inp.brake * Math.atan2(vlat, Math.abs(v.vel.dot(fwd)));
        sideGrip(v, vlat, sliding);
      }
      v.torque.addScaledVector(up, clamp(ty, -28, 28) * I[1]);
      // weight shift + manual wheelies (Q + throttle pops the front wheels up)
      const p = v.groundPitch() * DEG;
      const pull = Math.max(0, -inp.lean), push = Math.max(0, inp.lean);
      let a = 0;
      const frontDown = fl.contact || fr.contact, rearDown = rl.contact || rr.contact;
      if (c.type !== 'atv') a = 0; // cars: Q / E only shift weight in the air
      else if (frontDown && rearDown) a = pull * (3 + 6 * inp.throttle) - push * 1.5;
      else if (rearDown && !frontDown && p > 0.03) {
        if (v.assist.wheelie && (pull > 0.2 || this.wheelieUp)) a = wheelieAssist(this, p, pitchW, pull, push, inp, dt, c.wheelieDeg || 40);
        else {
          a = pull * 8 + inp.throttle * 2.5 - push * 7 - inp.rearBrake * 10 - 3.5 + 2 * pitchW;
          if (pull < 0.2 && v.assist.wheelie) a -= (p - 0.05) * 25;
        }
        { const pm = c.wheelieMax || 1.0; if (p > pm) a -= (p - pm) * (c.wheelieMax ? 90 : 50); }
      }
      if (c.type === 'atv') trackWheelie(this, v, frontDown, rearDown, pull, dt);
      this.pitchCentre = v.assist.wheelie && this.wheelieUp ? 1 : 0.25; // see bike.js
      // when you are lifting the front on purpose, most of the bike's weight is
      // balanced out for you so a wheelie is something you can actually hold
      let lift = a * I[0];
      if (c.type === 'atv' && (inp.lean < -0.2 || ((this.wheelieTime > 0 || this.wheelieUp) && p > 0.03))) {
        const rw = v.wheels[2].cfg;
        const d = -rw.z * Math.cos(p) - c.rideHeight * Math.sin(p); // CoM ahead of the rear tyre
        lift += 0.8 * c.mass * 9.81 * Math.max(0, d);
      }
      v.torque.addScaledVector(left, -lift);
    } else {
      // air: Q / E flip, A / D a small sideways throw, landing assist when hands-off
      const A = c.air;
      const tr = this.trick || (this.trick = newTrick(v));
      if (c.type === 'atv') trackPose(tr, inp, dt);
      tr.pitch += pitchW * dt; tr.yaw += yawW * dt;
      const car = c.type === 'car';
      // cars can't flip: Q / E only nudge the nose, and they always level out for the landing
      const lean = car ? clamp(inp.lean, -0.6, 0.6) : inp.lean;
      let ap = (lean * A.flipRate * (globalThis.__flipMul || 1) - pitchW) * (Math.abs(lean) > 0.1 ? A.flipAccel : A.spinDamp);
      ap += -inp.throttle * A.gyro * 0.4 + inp.rearBrake * A.gyro;
      // snowmobiles pitch about a LEVEL axis square to the heading, like the dirt bike (bike.js): with the sled laid over in a
      // whip its own side axis is tilted, and pitch torques then turned into yaw and nose-dived it
      let pAxis = left, pW = pitchW;
      if (c.bikeWhip) {
        const lvl = _lp.set(fwd.z, 0, -fwd.x);
        if (v.airTime < 0.03) this._lvl = null;
        const ls = lvl.lengthSq();
        if (ls > 1e-4) {
          lvl.multiplyScalar(1 / Math.sqrt(ls));
          if (this._lvl && lvl.dot(this._lvl) < 0) lvl.negate();
          const sb = 1 - sstep(0.03, 0.15, ls);
          if (sb > 0) lvl.lerp(left, sb).normalize();
        } else lvl.copy(left);
        (this._lvl || (this._lvl = new THREE.Vector3())).copy(lvl);
        pAxis = lvl; pW = v.angVel.dot(lvl);
      }
      if ((car || Math.abs(inp.lean) < 0.1) && v.airTime > 0.08) {
        const desired = this.landingDirection();
        _c.crossVectors(fwd, desired);
        const e = Math.atan2(_c.dot(pAxis), fwd.dot(desired));
        if (car) {
          // a buggy keeps its momentum in the air: the levelling only fades in after the jump has left the
          // ground and is a soft, well-damped spring (the old stiff one rang and snapped the nose around)
          const k = sstep(0.12, 0.7, v.airTime);
          ap += (e * 4.5 - pitchW * 4.0) * k - pitchW * 0.35 * (1 - k);
        } else {
          const keepAp = -pW * 0.35;
          const assistAp = v.assist.landing > 0 ? ap + (e * 12 - pW * 3) * v.assist.landing : ap;
          const wKeep = sstep(1.0, 1.4, Math.abs(tr.pitch)) * sstep(0.9, 1.3, Math.abs(e));
          ap = assistAp + (keepAp - assistAp) * wKeep;
        }
      }
      if (c.bikeWhip) addAccel(v, pAxis, ap); else v.torque.addScaledVector(left, ap * I[0]);
      const roll = Math.asin(clamp(left.y, -1, 1));
      tr.whip = Math.max(tr.whip, Math.abs(roll));
      if (car) v.torque.addScaledVector(fwd, ((-this.steer * A.whip * DEG - roll) * 13 - rollW * 7) * I[2]);
      else if (c.bikeWhip && !inp.clutch) {
        // SNOWMOBILE WHIP = the dirt bike's whip (bike.js): ONE controller turns the sled toward "laid over and swung out"
        // while A / D is held, and back to upright and lined up with its flight line once let go. (The quad's separate roll
        // and yaw springs overshot on a sled and spun it into a 360.)
        const holding = Math.abs(inp.steer) > 0.15;
        this.whipAmt = holding ? Math.min(1, (this.whipAmt || 0) + dt * 5.0) : Math.max(0, (this.whipAmt || 0) - dt * 9);
        const flipT = Math.max(sstep(1.6, 2.2, Math.abs(tr.pitch)), Math.abs(lean) > 0.1 ? 1 : 0, sstep(1.8, 2.6, Math.abs(pitchW)));
        this.flipBlend = (this.flipBlend || 0) + (flipT - (this.flipBlend || 0)) * Math.min(1, dt * 14);
        const swingK = (1 - this.flipBlend) * clamp((0.985 - Math.abs(fwd.y)) / 0.12, 0, 1);
        if (holding) this.whipSide = Math.sign(inp.steer);
        const late = v.assist.landing > 0 ? clamp(((this.timeToLand || 9) - 0.3) / 0.4, 0, 1) : 1;
        const amt = this.whipAmt * late, side = this.whipSide || 0;
        const ws = c.whipScale || 1;                 // how big the whip is (1 = the full dirt-bike whip; sleds use a small one)
        const rollT = -side * 97 * ws * DEG * amt; // laid over (the bikes go up to flat sideways)
        const yawT = side * 76 * ws * DEG * amt;   // tail kicks out
        const vx = v.vel.x, vz = v.vel.z, vh = Math.hypot(vx, vz);
        const hk = holding ? amt : 0;
        const K = 55 + (30 - 55) * hk, C = 14 + (7.5 - 14) * hk;
        const lvlA = _lv.set(fwd.z, 0, -fwd.x);
        if (swingK > 0 && Math.abs(fwd.y) < 0.95 && lvlA.lengthSq() > 0.01) {
          lvlA.normalize();
          const pitchNow = Math.asin(clamp(fwd.y, -1, 1));
          if (vh > 2) _tf.set(vx / vh, 0, vz / vh).applyAxisAngle(_Y, yawT); else _tf.set(fwd.x, 0, fwd.z).normalize();
          _tf.multiplyScalar(Math.cos(pitchNow)); _tf.y = Math.sin(pitchNow); _tf.normalize();
          _tu.copy(_Y).addScaledVector(_tf, -_tf.y).normalize().applyAxisAngle(_tf, rollT);
          _tl.crossVectors(_tu, _tf);
          _tm.makeBasis(_tl, _tu, _tf); _tq.setFromRotationMatrix(_tm);
          _tq.multiply(_qi.copy(v.quat).invert());
          if (_tq.w < 0) { _tq.x = -_tq.x; _tq.y = -_tq.y; _tq.z = -_tq.z; _tq.w = -_tq.w; }
          const sh = Math.sqrt(1 - Math.min(1, _tq.w * _tq.w)), ang = 2 * Math.acos(Math.min(1, _tq.w));
          _te.set(_tq.x, _tq.y, _tq.z); if (sh > 1e-5) _te.multiplyScalar(ang / sh); else _te.set(0, 0, 0);
          _tw.copy(v.angVel);
          _te.addScaledVector(lvlA, -_te.dot(lvlA)); _tw.addScaledVector(lvlA, -_tw.dot(lvlA)); // the pitch axis belongs to flips and the landing assist
          _te.multiplyScalar(K * swingK).addScaledVector(_tw, -C * swingK);
          addAccel(v, _te, 1);
        }
        if (swingK < 1) v.torque.addScaledVector(fwd, ((rollT - roll) * 75 - rollW * 15) * (1 - swingK) * I[2]); // mid-flip: only keep the roll in check
      }
      else {
        // WHIP, like the bikes' but a little less: hold A / D and the quad lies over while the tail swings out; let go and it
        // straightens along its flight line. It fades out before the landing.
        const holding = Math.abs(inp.steer) > 0.15;
        this.whipAmt = holding ? Math.min(1, (this.whipAmt || 0) + dt * 6) : Math.max(0, (this.whipAmt || 0) - dt * 9);
        if (holding) this.whipSide = Math.sign(inp.steer);
        const side = this.whipSide || 0;
        const late = v.assist.landing > 0 ? clamp(((this.timeToLand || 9) - 0.3) / 0.4, 0, 1) : 1;
        const amt = this.whipAmt * late;
        const rollT = -side * Math.min(100, A.whip * 1.32 * (c.whipScale || 0.7)) * DEG * amt;
        const yawT = side * 76 * (c.whipScale || 0.7) * DEG * amt;
        v.torque.addScaledVector(fwd, ((rollT - roll) * (holding ? 22 : 14) - rollW * (holding ? 6 : 7)) * I[2]);
        const vx = v.vel.x, vz = v.vel.z, hx = fwd.x, hz = fwd.z;
        if (vx * vx + vz * vz > 4 && hx * hx + hz * hz > 0.01 && Math.abs(fwd.y) < 0.95) {
          const yawOff = Math.atan2(vz * hx - vx * hz, vx * hx + vz * hz);       // + = nose to the left of the flight line
          if (!(inp.clutch)) v.torque.addScaledVector(up, ((yawT - yawOff) * 26 - yawW * 7) * I[1]);
        }
      }
      // Shift + A / D: flat spin; otherwise a little yaw to line up the landing
      if (inp.clutch && !car) v.torque.addScaledVector(up, ((-this.steer * A.spinRate - yawW) * 5) * I[1]);
      else if (car) v.torque.addScaledVector(up, (this.steer * 0.9 - yawW * 0.9) * I[1]); // a little steering yaw, and the spin dies down slowly
      else if (false) v.torque.addScaledVector(up, (this.steer * c.steer.airYaw - yawW * 1.2) * I[1]);
    }
  }

  reportTricks(landPitchErr = 0, landRoll = 0) {
    const ev = scoreTricks(this.trick, landPitchErr, landRoll, false);
    if (ev) this.v.events.push(ev);
    this.trick = null;
  }

  landingDirection() {
    const v = this.v, W = v.world;
    _p.copy(v.pos); _d.copy(v.vel);
    let steps = 0;
    for (let i = 0; i < 60; i++) {
      steps = i;
      _p.addScaledVector(_d, 0.05); _d.y -= 9.81 * 0.05;
      groundAt(W, _p.x, _p.z, g0);
      if (_p.y - v.cfg.rideHeight * 0.8 <= g0.h) break;
    }
    this.timeToLand = steps * 0.05;
    _n.set(g0.nx, g0.ny, g0.nz);
    _d.copy(v.vel); _d.y = 0;
    if (_d.lengthSq() < 1) _d.copy(v.fwd);
    return _d.addScaledVector(_n, -_d.dot(_n)).normalize();
  }

  postStep(dt, wasGrounded) {
    const v = this.v, c = v.cfg.crash;
    if (v.crashed) return;
    if (v.grounded && !wasGrounded && v.airTime > 0.3) {
      const p = v.groundPitch();
      groundAt(v.world, v.pos.x, v.pos.z, g0);
      const vin = -(v.prevVel.x * g0.nx + v.prevVel.y * g0.ny + v.prevVel.z * g0.nz);
      v.landImpact = vin;
      if (this.trick && this.trick.cur) return v.crash('Landed still doing a ' + this.trick.cur);
      if (!c.tough) {
        if (p > c.landPitch) return v.crash('Flipped over backwards');
        if (p < -c.landPitch) return v.crash('Nose-dived the landing');
        if (vin > c.impact) return v.crash('Landed way too hard');
      }
      this.reportTricks(Math.abs(p), Math.abs(this.bodyRoll) / DEG);
    }
    if (v.grounded && v.groundTime > 0.2) this.trick = null;
    const hit = v.probeHits;
    if (hit && !c.tough) {
      if (hit.type === 'rider' && (hit.impact > 1.0 || hit.pen > 0.08)) return v.crash('Thrown off');
      if (hit.type === 'roll') return v.crash('Rolled it');
      if (hit.type === 'hard' && hit.impact > (c.nose || 4.5)) return v.crash('Stuffed the nose');
    }
    if (c.tough) return this.toughChecks(dt);
    // rollover: tipped past the point of no return
    if (Math.abs(this.bodyRoll) > c.roll * DEG && v.grounded) { this.rollTime += dt; if (this.rollTime > 0.4) return v.crash('Rolled it'); }
    else this.rollTime = 0;
    if (v.grounded && v.groundPitch() > c.loop) return v.crash('Flipped over backwards');
    if (v.up.y < 0.1) { this.upsideTime += dt; if (v.grounded || this.upsideTime > 1.5) return v.crash('Upside down'); }
    else this.upsideTime = 0;
  }
}
