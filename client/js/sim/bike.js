// =====================================================================
//  DIRT BIKE HANDLING
//  Ground:
//   - A / D ask for a turn RATE. Slow = tight turns, fast = wide arcs.
//     The bike's heading follows that quickly and predictably, the tyres
//     decide how much it actually grips (so you can slide when pushing).
//   - Space (rear brake) or lots of throttle break the rear loose: the
//     back steps out and you can slide it round a berm.
//   - Wheelies are YOURS: hold Q (lean back) with throttle to pop the
//     front up, keep holding Q / throttle to hold it, E or the rear brake
//     to bring it down. Pull too far and you loop it.
//  Air:
//   - Q / E spin the bike backwards / forwards (back flips, front flips).
//   - A / D whip the bike sideways. Straighten it before you land!
//   - Let go of Q / E and landing assist lines you up with the landing.
//  Tricks (flips, whips) are reported to the game when you land them.
// =====================================================================
import * as THREE from '../../vendor/three.module.js';
import { groundAt } from '../../../shared/terrain.js';
import { newTrick, scoreTricks, trackPose, wheelieAssist, trackWheelie } from './tricks.js';

const DEG = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const g0 = { h: 0, nx: 0, ny: 1, nz: 0 };
const _n = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3(), _p = new THREE.Vector3(), _lv = new THREE.Vector3();
const _ax = new THREE.Vector3(), _qi = new THREE.Quaternion();
const _Y = new THREE.Vector3(0, 1, 0), _tf = new THREE.Vector3(), _tu = new THREE.Vector3(), _tl = new THREE.Vector3(), _te = new THREE.Vector3(), _tw = new THREE.Vector3();
const _tm = new THREE.Matrix4(), _tq = new THREE.Quaternion();

// add the torque that gives exactly this angular acceleration (rad/s^2) about a world axis -
// the bike resists roll, pitch and yaw differently, so a plain torque would also spin it on the other axes
function addAccel(v, axis, a) {
  const I = v.cfg.inertia;
  _ax.copy(axis).multiplyScalar(a).applyQuaternion(_qi.copy(v.quat).invert());
  _ax.x *= I[0]; _ax.y *= I[1]; _ax.z *= I[2];
  v.torque.add(_ax.applyQuaternion(v.quat));
}

// a berm leaning into the turn lets you corner much harder (that is what they are for)
export function bankBoost(v, steer) {
  if (!v.grounded || Math.abs(steer) < 0.05) return 0;
  groundAt(v.world, v.pos.x, v.pos.z, g0);
  // ground normal leaning toward the inside of the turn = a banked berm
  const lean = (g0.nx * v.left.x + g0.ny * v.left.y + g0.nz * v.left.z) * Math.sign(steer);
  return Math.max(0, Math.min(0.7, lean * 2.2));
}

// tyre side grip as a force through the centre of mass: stops the slide without turning the nose
export function sideGrip(v, vlat, sliding) {
  const m = v.cfg.mass, cap = m * 9.81 * (sliding ? 0.26249999999999996 : 0.75);
  const f = Math.max(-cap, Math.min(cap, -vlat * m * 8));
  v.force.addScaledVector(v.left, f);
}

export class BikeController {
  constructor(veh) {
    this.v = veh;
    this.rollCentre = 1.0;   // tyre side forces act at the CoM: the lean balances them
    this.pitchCentre = 0.5;  // the rider's body position soaks up half the wheelie / stoppie torque
    this.reset();
  }

  reset() {
    this.steer = 0; this.slideTime = 0; this.rollErr = 0; this.upsideTime = 0;
    this.footDown = 0; this.yawTarget = 0; this.wheelie = false; this.wheelieTime = 0;
    this.trick = null;
  }

  // the turn rate the rider asks for at this speed (rad/s)
  yawMax(spd) {
    const c = this.v.cfg, a = Math.abs(spd);
    if (a < 0.2) return 0;
    return Math.min((a * Math.tan(c.steer.maxLow * DEG)) / c.wheelbase, (c.steer.latAcc * (1 + (this.bankBoost || 0))) / Math.max(a, 1));
  }

  preStep(dt) {
    const v = this.v, c = v.cfg, inp = v.input;
    const rate = c.steer.rate * (Math.sign(inp.steer) !== Math.sign(this.steer) ? 1.8 : 1);
    this.steer += clamp(inp.steer - this.steer, -rate * dt, rate * dt);
    const spd = v.fwdSpeed;
    const front = v.wheels[0], rear = v.wheels[1];
    const sliding = inp.rearBrake > 0.1 || rear.slipLong > 0.35;
    // turn rate target; sliding lets the back come round more
    this.bankBoost = bankBoost(v, this.steer);
    this.yawTarget = this.steer * this.yawMax(spd) * Math.sign(spd || 1) * (sliding ? 1.35 : 1);
    // front wheel angle that gives that turn (for the tyres and the bars)
    let delta = 0;
    if (v.grounded && Math.abs(spd) > 0.2) delta = Math.atan((this.yawTarget * c.wheelbase) / Math.abs(spd)) * Math.sign(spd);
    else if (v.grounded) delta = this.steer * c.steer.maxLow * DEG;
    else delta = this.steer * 12 * DEG;
    delta = clamp(delta, -c.steer.maxLow * DEG, c.steer.maxLow * DEG);
    v.steerAngle += (delta - v.steerAngle) * Math.min(1, dt * 20);
    front.steer = v.grounded ? v.steerAngle : 0;

    // brakes: S = both (front can't lock - the rider feathers it), Space = rear only (locks)
    let fb = inp.brake, rb = Math.max(inp.brake * 0.6, inp.rearBrake);
    if (v.engine.reverse) { fb = inp.throttle; rb = inp.throttle * 0.6; }
    front.brake = fb * c.brakes.front; front.noLock = true;
    rear.brake = rb * c.brakes.rear * (inp.rearBrake > 0.1 ? 1.3 : 1);
    rear.noLock = inp.rearBrake < 0.1; rear.lockCap = 0.55;

    // wheelie / stoppie control (only when you are NOT pulling a wheelie on purpose)
    const wantWheelie = inp.lean < -0.3;
    if (v.assist.wheelie && v.grounded && !wantWheelie) {
      const p = v.groundPitch();
      // wheelies keep full power; the assist only trims it near the loop-out point
      if (!front.contact && p > 40) rear.drive *= clamp(1 - (p - 40) / 15, 0.2, 1);
      if (p < -3) front.brake *= clamp(1 - (-p - 3) / 7, 0.1, 1);
      if (!rear.contact) front.brake *= 0.5;
    }
    // a held wheelie is for show: it costs a little drive, so it is never the fast way round
    if (v.assist.wheelie && this.wheelieUp) rear.drive *= 0.8;
  }

  afterWheels() {}

  torques(dt, contacts) {
    const v = this.v, c = v.cfg, inp = v.input, I = c.inertia;
    const fwd = v.fwd, up = v.up, left = v.left;
    const rollW = v.angVel.dot(fwd);
    const pitchW = v.angVel.dot(left); // + = nose dropping
    const yawW = v.angVel.dot(up);
    const front = v.wheels[0], rear = v.wheels[1];

    // visual lean (the physics body stays square to the ground; the model leans)
    let leanTarget = 0;
    if (v.grounded) {
      const aLat = v.fwdSpeed * yawW;
      leanTarget = clamp(Math.atan(aLat / 9.81), -c.lean.max * DEG, c.lean.max * DEG);
      if (Math.abs(v.fwdSpeed) < 2.5) leanTarget *= Math.abs(v.fwdSpeed) / 2.5;
    }
    v.lean += (leanTarget - v.lean) * Math.min(1, dt * c.lean.rate);
    this.footDown += ((v.speed < 1.2 && v.grounded && !v.crashed ? 1 : 0) - this.footDown) * Math.min(1, dt * 5);

    if (v.crashed) return;

    if (contacts > 0) {
      this.trickEnd = true;
      // keep the bike square to the ground under it (the rider balances it)
      _n.set(0, 0, 0);
      for (const w of v.wheels) if (w.contact) _n.add(w.n);
      _n.normalize();
      const e = Math.atan2(_n.dot(left), _n.dot(up));
      this.rollErr = e;
      v.torque.addScaledVector(fwd, clamp(-c.balance.rollK * e - c.balance.rollC * rollW, -9000, 9000));

      // steering: turn the heading toward the asked-for turn rate
      const sliding = inp.rearBrake > 0.1 || rear.slipLong > 0.35;
      const kp = sliding ? 5 : 20; // firm: the bike turns at the rate you ask for (9 left it ~30% short of it)
      let ty = kp * (this.yawTarget - yawW);
      // the tyres hold the line: sideways sliding is killed by grip, so the bike goes where the
      // nose points. (Turning the nose toward the slide instead made the bike steer itself - it
      // pushed back against every turn and swung the wrong way when you let go.)
      if (v.speed > 1) {
        const vlat = v.vel.dot(left);
        if (inp.brake > 0.3) ty += 6 * inp.brake * Math.atan2(vlat, Math.abs(v.vel.dot(fwd))); // hard braking: stay straight
        sideGrip(v, vlat, sliding);
      }
      ty = clamp(ty, -30, 30);
      v.torque.addScaledVector(up, ty * I[1]);

      // weight shift + manual wheelies
      const p = v.groundPitch() * DEG;   // nose up = +
      let a = 0;                           // nose-up angular acceleration we want
      const pull = Math.max(0, -inp.lean); // Q held
      const push = Math.max(0, inp.lean);  // E held
      if (front.contact && rear.contact) {
        // pop: Q + throttle lifts the front
        a += pull * (5 + 9 * inp.throttle);
        a -= push * 2;
        this.wheelie = false;
      } else if (rear.contact && !front.contact && p > 0.03) {
        // balancing a wheelie: Q / throttle raise it, E / rear brake drop it, gravity always pulls it down
        this.wheelie = pull > 0.2 || this.wheelieTime > 0 || this.wheelieUp;
        if (v.assist.wheelie && (pull > 0.2 || this.wheelieUp)) a = wheelieAssist(this, p, pitchW, pull, push, inp, dt, 44);
        else {
          a += pull * 11 + inp.throttle * 3.5 - push * 9 - inp.rearBrake * 14 - 4.5;
          a -= 4.2 * -pitchW;               // damping (pitchW is + when the nose drops)
          if (!this.wheelie && v.assist.wheelie) a -= (p - 0.05) * 40; // accidental wheelie: bring it down
        }
        if (p > 1.05) a -= (p - 1.05) * 60; // past the balance point: hard to save
      } else if (front.contact && !rear.contact) {
        // stoppie: the rider leans back to put the rear down
        if (v.assist.wheelie) a += (-p - 0.05) * 30 + 3 * pitchW;
      }
      if (rear.contact && !front.contact && pull > 0.2) this.wheelieTime += dt; else this.wheelieTime = Math.max(0, this.wheelieTime - dt * 3);
      trackWheelie(this, v, front.contact, rear.contact, pull, dt);
      // holding a wheelie with the assist: the drive force no longer tips the bike, the assist sets the angle
      this.pitchCentre = v.assist.wheelie && this.wheelieUp ? 1 : 0.5;
      // when you are lifting the front on purpose, most of the bike's weight is
      // balanced out for you so a wheelie is something you can actually hold
      let lift = a * I[0];
      if (inp.lean < -0.2 || ((this.wheelieTime > 0 || this.wheelieUp) && p > 0.03)) {
        const rw = v.wheels[1].cfg;
        const d = -rw.z * Math.cos(p) - c.rideHeight * Math.sin(p); // CoM ahead of the rear tyre
        lift += 0.85 * c.mass * 9.81 * Math.max(0, d);
      }
      v.torque.addScaledVector(left, -lift);
    } else {
      // ------------------------------------------------------------ air
      const A = c.air;
      const tr = this.trick || (this.trick = newTrick(v));
      tr.pitch += pitchW * dt;
      tr.yaw += yawW * dt;
      tr.peak = Math.max(tr.peak, v.pos.y - tr.y0);
      trackPose(tr, inp, dt);
      // flips: Q / E set a spin rate, the rider gets there quickly
      const spinTarget = inp.lean * A.flipRate;
      let ap = (spinTarget - pitchW) * (Math.abs(inp.lean) > 0.1 ? A.flipAccel : A.spinDamp);
      ap += -inp.throttle * A.gyro * 0.4 + inp.rearBrake * A.gyro;   // throttle lifts the nose, rear brake drops it
      const spinning = Math.abs(tr.pitch) > 1.2;
      const desiredDir = this.landingDirection(); // also measures time until we land
      // pitch is measured and pushed around a LEVEL axis square to the heading (= left when the
      // bike is level): with the bike laid over in a whip, the tilted side axis turned yaw into
      // pitch, and long whips nose-dived
      const lvl = _lv.set(fwd.z, 0, -fwd.x);
      if (lvl.lengthSq() > 0.05 && Math.abs(tr.pitch) < 2.0) lvl.normalize(); else lvl.copy(left);
      if (Math.abs(inp.lean) < 0.1 && v.airTime > 0.08) {
        _c.crossVectors(fwd, desiredDir);
        const e = Math.atan2(_c.dot(lvl), fwd.dot(desiredDir));
        const pitchW = v.angVel.dot(lvl);
        // mid-flip and still far from wheels-down: let it keep rotating
        if (spinning && Math.abs(e) > 1.1) ap = (inp.lean * A.flipRate - pitchW) * 0.35;
        else if (v.assist.landing > 0) ap += (e * 14 - pitchW * 3) * v.assist.landing;
      }
      addAccel(v, lvl, ap);
      const roll = Math.asin(clamp(left.y, -1, 1)); // + = leaning right (stays 0 during a flip)
      this.airRoll = roll;
      const late = v.assist.landing > 0 ? Math.min(1, Math.max(0, (this.timeToLand - 0.3) / 0.4)) : 1; // whips fade out 0.7 s before wheels-down
      if (inp.clutch) {
        // Shift + A / D: flat spin (360s), the bike stays level
        const spinT = -this.steer * A.spinRate;
        v.torque.addScaledVector(up, ((spinT - yawW) * 6) * I[1]);
        v.torque.addScaledVector(fwd, ((0 - roll) * 22 - rollW * 6) * I[2]);
      } else {
        // WHIP: hold A / D and the bike rotates around its middle - it lays over
        // sideways while the back wheel swings out (the nose points into the whip).
        // The longer you hold, the further it goes; let go and a spring brings it
        // back upright and lined up with where you are flying, ready to land.
        const holding = Math.abs(inp.steer) > 0.15; // the key itself: the smoothed ground steering kept whipping after you let go
        this.whipAmt = holding ? Math.min(1, (this.whipAmt || 0) + dt * 4.2) : Math.max(0, (this.whipAmt || 0) - dt * 9);
        // the swing spring keeps the bike lined up for the landing - but never in the middle of a flip
        // (a normal jump tips the nose down ~50 degrees - that is not a flip; pointing near vertical it is)
        const flipping = Math.abs(tr.pitch) > 2.0 || Math.abs(inp.lean) > 0.1 || Math.abs(pitchW) > 2.2;
        const swingK = flipping ? 0 : clamp((0.985 - Math.abs(fwd.y)) / 0.12, 0, 1);
        if (holding) this.whipSide = Math.sign(inp.steer);
        const amt = this.whipAmt * late;
        const side = this.whipSide || 0;
        const rollT = -side * Math.min(95, A.whip * 1.25) * DEG * amt; // lay it over (up to flat sideways)
        const yawT = side * 72 * DEG * amt;                 // rear kicks well out, nose into the whip
        // how far the bike points away from the direction it is flying (+ = nose to the left)
        let yawOff = 0;
        const hx = fwd.x, hz = fwd.z, vx = v.vel.x, vz = v.vel.z;
        if (vx * vx + vz * vz > 4 && hx * hx + hz * hz > 0.01) yawOff = Math.atan2(vz * hx - vx * hz, vx * hx + vz * hz);
        // ONE controller turns the bike toward where it should be: laid over and swung out while you
        // hold, straight and upright (lined up with where it is flying) once you let go. Separate roll
        // and turn springs pulled against each other with the nose down, so letting go rolled the bike
        // over the other way, flipped it or landed it crooked. The pitch stays with the landing assist.
        const hk = holding ? amt : 0;     // near the ground the whip fades: pulled straight as if let go
        // let go: straightens in about half a second (was quicker - it snapped back)
        const K = 55 + (30 - 55) * hk, C = 14 + (7.5 - 14) * hk;
        const vh = Math.hypot(vx, vz);
        const lvlA = _lv.set(fwd.z, 0, -fwd.x);
        if (swingK > 0 && Math.abs(fwd.y) < 0.95 && lvlA.lengthSq() > 0.01) {
          lvlA.normalize();
          // target heading: the flight direction turned by the swing, at the bike's own pitch
          const pitchNow = Math.asin(clamp(fwd.y, -1, 1));
          if (vh > 2) _tf.set(vx / vh, 0, vz / vh).applyAxisAngle(_Y, yawT); else _tf.set(fwd.x, 0, fwd.z).normalize();
          _tf.multiplyScalar(Math.cos(pitchNow)); _tf.y = Math.sin(pitchNow); _tf.normalize();
          // target up: square to it, laid over by the whip (left = up x fwd, roll + = left.y > 0)
          _tu.copy(_Y).addScaledVector(_tf, -_tf.y).normalize().applyAxisAngle(_tf, rollT);
          _tl.crossVectors(_tu, _tf);
          _tm.makeBasis(_tl, _tu, _tf); _tq.setFromRotationMatrix(_tm);
          _tq.multiply(_qi.copy(v.quat).invert());          // the turn that takes the bike there (world)
          if (_tq.w < 0) { _tq.x = -_tq.x; _tq.y = -_tq.y; _tq.z = -_tq.z; _tq.w = -_tq.w; }
          const sh = Math.sqrt(1 - Math.min(1, _tq.w * _tq.w)), ang = 2 * Math.acos(Math.min(1, _tq.w));
          _te.set(_tq.x, _tq.y, _tq.z); if (sh > 1e-5) _te.multiplyScalar(ang / sh); else _te.set(0, 0, 0);
          // leave the pitch axis alone (flips and the landing assist own it)
          _tw.copy(v.angVel);
          _te.addScaledVector(lvlA, -_te.dot(lvlA)); _tw.addScaledVector(lvlA, -_tw.dot(lvlA));
          _te.multiplyScalar(K * swingK).addScaledVector(_tw, -C * swingK);
          addAccel(v, _te, 1);
        }
        // mid-flip (or pointing straight down): only keep the roll in check
        if (swingK < 1) v.torque.addScaledVector(fwd, ((rollT - roll) * 75 - rollW * 15) * (1 - swingK) * I[2]);
        // scrub: whipping hard right off the lip keeps the bike low and fast
        // the lay-over about the bike's own length (with the nose down, the lean from level reads smaller)
        const rollAx = Math.asin(clamp(left.y / Math.sqrt(Math.max(0.05, 1 - fwd.y * fwd.y)), -1, 1));
        tr.whip = Math.max(tr.whip, Math.abs(rollAx)); // only real whips count, not the wobble of a spin
        if (v.airTime < 0.35 && Math.abs(roll) > 25 * DEG) { tr.scrub = true; v.force.y -= c.mass * 9.81 * 0.3 * Math.min(1, Math.abs(roll) / (45 * DEG)); }
      }
      this.rollErr = 0;
    }
  }

  // Predict where the bike lands and return the slope direction there
  landingDirection() {
    const v = this.v, W = v.world;
    _p.copy(v.pos); _d.copy(v.vel);
    let i = 0;
    for (; i < 60; i++) {
      _p.addScaledVector(_d, 0.05); _d.y -= 9.81 * (v.gravityScale || (W.def && W.def.gravity) || 1) * 0.05;
      groundAt(W, _p.x, _p.z, g0);
      if (_p.y - v.cfg.rideHeight * 0.8 <= g0.h) break;
    }
    this.timeToLand = i * 0.05;
    _n.set(g0.nx, g0.ny, g0.nz);
    _d.copy(v.vel); _d.y = 0;
    if (_d.lengthSq() < 1) _d.copy(v.fwd);
    return _d.addScaledVector(_n, -_d.dot(_n)).normalize();
  }

  postStep(dt, wasGrounded) {
    const v = this.v, c = v.cfg.crash;
    if (v.crashed) { this.trick = null; return; }
    const fwd = v.fwd;
    if (v.grounded && !wasGrounded && v.airTime > 0.3) {
      const p = v.groundPitch();
      groundAt(v.world, v.pos.x, v.pos.z, g0);
      const vin = -(v.prevVel.x * g0.nx + v.prevVel.y * g0.ny + v.prevVel.z * g0.nz);
      v.landImpact = vin;
      _n.set(g0.nx, g0.ny, g0.nz);
      const sideways = Math.abs(Math.asin(clamp(v.left.dot(_n), -1, 1))) / DEG;
      if (this.trick && this.trick.cur) return v.crash('Landed still doing a ' + this.trick.cur);
      if (p > c.landPitch) return v.crash('Looped out on the landing');
      if (p < -c.landPitch) return v.crash('Nose-dived the landing');
      if (sideways > 45) return v.crash('Landed it sideways');
      if (vin > c.impact) return v.crash('Landed way too hard');
      this.reportTricks(Math.abs(p), sideways);
    }
    if (v.grounded && v.groundTime > 0.2) this.trick = null;
    const hit = v.probeHits;
    if (hit) {
      if (hit.type === 'rider' && (hit.impact > 1.0 || hit.pen > 0.08)) return v.crash('Went over the bars');
      if (hit.type === 'hard' && hit.impact > 3.5) return v.crash('Clipped the ground');
      if (hit.type === 'hard' && v.airTime > 0.25 && hit.impact > 2) return v.crash('Clipped the ground');
      if (hit.type === 'soft' && this.wheelie && hit.impact > 0.5) return v.crash('Looped the wheelie');
    }
    if (Math.abs(this.rollErr) > c.roll * DEG) return v.crash('Lost the balance');
    if (v.grounded && v.speed > 6) {
      const beta = Math.atan2(v.vel.dot(v.left), v.vel.dot(fwd)) / DEG;
      if (Math.abs(beta) > c.slide) { this.slideTime += dt; if (this.slideTime > 0.45) return v.crash('Low-sided'); }
      else this.slideTime = 0;
    }
    if (v.grounded && v.groundPitch() > c.loop) return v.crash('Looped the wheelie');
    if (v.up.y < 0.15) { this.upsideTime += dt; if ((v.grounded && v.speed < 30) || this.upsideTime > 2.5) { if (v.grounded) return v.crash('Upside down'); } }
    else this.upsideTime = 0;
  }

  // flips / whips landed cleanly -> tell the game
  reportTricks(landPitchErr = 0, landRoll = 0) {
    const ev = scoreTricks(this.trick, landPitchErr, landRoll, true);
    if (ev) this.v.events.push(ev);
    this.trick = null;
  }
}
