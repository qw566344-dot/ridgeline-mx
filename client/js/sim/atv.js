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

const DEG = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const g0 = { h: 0, nx: 0, ny: 1, nz: 0 };
const _f = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3();

export class AtvController {
  constructor(veh) {
    this.v = veh;
    this.rollCentre = veh.cfg.rollCentre;
    this.pitchCentre = 0.25;
    this.reset();
  }

  reset() { this.steer = 0; this.rollTime = 0; this.upsideTime = 0; this.bodyRoll = 0; this.yawTarget = 0; this.trick = null; }

  preStep(dt) {
    const v = this.v, c = v.cfg, inp = v.input;
    const rate = c.steer.rate * (Math.sign(inp.steer) !== Math.sign(this.steer) ? 1.5 : 1);
    this.steer += clamp(inp.steer - this.steer, -rate * dt, rate * dt);
    const spd = Math.abs(v.fwdSpeed);
    const t = clamp(spd / c.steer.highSpeed, 0, 1);
    const maxDeg = c.steer.maxLow + (c.steer.maxHigh - c.steer.maxLow) * Math.sqrt(t);
    // ask for a turn rate (like the bike), heavier and lazier than a bike
    const sliding = inp.rearBrake > 0.1 || Math.max(v.wheels[2].slipLong, v.wheels[3].slipLong) > 0.35;
    const yawMax = spd < 0.2 ? 0 : Math.min((spd * Math.tan(maxDeg * DEG)) / c.wheelbase, 9.0 / Math.max(spd, 1));
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
    v.lean += (leanTarget - v.lean) * Math.min(1, dt * 6);
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
      if (rl.contact && rr.contact) {
        const slip = Math.max(rl.slipLong, rr.slipLong);
        v.torque.addScaledVector(up, -yawW * c.axleScrub * (rl.load + rr.load) * 0.35 * (1 - slip * 0.8));
      }
      // steering: turn the heading toward the asked-for turn rate
      const sliding = inp.rearBrake > 0.1 || Math.max(rl.slipLong, rr.slipLong) > 0.35;
      let ty = (sliding ? 3 : 7) * (this.yawTarget - yawW);
      if (v.speed > 2) ty += (sliding ? 1 : 4) * Math.atan2(v.vel.dot(left), Math.abs(v.vel.dot(fwd)));
      v.torque.addScaledVector(up, clamp(ty, -12, 12) * I[1]);
      // weight shift + manual wheelies (Q + throttle pops the front wheels up)
      const p = v.groundPitch() * DEG;
      const pull = Math.max(0, -inp.lean), push = Math.max(0, inp.lean);
      let a = 0;
      const frontDown = fl.contact || fr.contact, rearDown = rl.contact || rr.contact;
      if (frontDown && rearDown) a = pull * (3 + 6 * inp.throttle) - push * 1.5;
      else if (rearDown && !frontDown && p > 0.03) {
        a = pull * 8 + inp.throttle * 2.5 - push * 7 - inp.rearBrake * 10 - 3.5 + 2 * pitchW;
        if (pull < 0.2 && v.assist.wheelie) a -= (p - 0.05) * 25;
        if (p > 1.0) a -= (p - 1.0) * 50;
      }
      // when you are lifting the front on purpose, most of the bike's weight is
      // balanced out for you so a wheelie is something you can actually hold
      let lift = a * I[0];
      if (inp.lean < -0.2 || (this.wheelieTime > 0 && p > 0.03)) {
        const rw = v.wheels[2].cfg;
        const d = -rw.z * Math.cos(p) - c.rideHeight * Math.sin(p); // CoM ahead of the rear tyre
        lift += 0.8 * c.mass * 9.81 * Math.max(0, d);
      }
      v.torque.addScaledVector(left, -lift);
    } else {
      // air: Q / E flip, A / D a small sideways throw, landing assist when hands-off
      const A = c.air;
      const tr = this.trick || (this.trick = { pitch: 0, whip: 0, yaw: 0 });
      tr.pitch += pitchW * dt; tr.yaw += yawW * dt;
      let ap = (inp.lean * A.flipRate - pitchW) * (Math.abs(inp.lean) > 0.1 ? A.flipAccel : A.spinDamp);
      ap += -inp.throttle * A.gyro * 0.4 + inp.rearBrake * A.gyro;
      if (Math.abs(inp.lean) < 0.1 && v.airTime > 0.08) {
        const desired = this.landingDirection();
        _c.crossVectors(fwd, desired);
        const e = Math.atan2(_c.dot(left), fwd.dot(desired));
        if (Math.abs(tr.pitch) > 1.2 && Math.abs(e) > 1.1) ap = -pitchW * 0.35;
        else if (v.assist.landing > 0) ap += (e * 12 - pitchW * 3) * v.assist.landing;
      }
      v.torque.addScaledVector(left, ap * I[0]);
      const roll = Math.asin(clamp(left.y, -1, 1));
      tr.whip = Math.max(tr.whip, Math.abs(roll));
      v.torque.addScaledVector(fwd, ((-this.steer * A.whip * DEG - roll) * 10 - rollW * 4) * I[2]);
      v.torque.addScaledVector(up, (this.steer * c.steer.airYaw - yawW * 1.2) * I[1]);
    }
  }

  reportTricks() {
    const t = this.trick;
    if (!t) return;
    const flips = Math.round(Math.abs(t.pitch) / (2 * Math.PI) - 0.1);
    if (flips >= 1) this.v.events.push({ type: 'trick', name: (flips > 1 ? flips + 'x ' : '') + (t.pitch < 0 ? 'Backflip' : 'Front Flip'), score: flips * 700 });
    this.trick = null;
  }

  landingDirection() {
    const v = this.v, W = v.world;
    _p.copy(v.pos); _d.copy(v.vel);
    for (let i = 0; i < 60; i++) {
      _p.addScaledVector(_d, 0.05); _d.y -= 9.81 * 0.05;
      groundAt(W, _p.x, _p.z, g0);
      if (_p.y - v.cfg.rideHeight * 0.8 <= g0.h) break;
    }
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
      if (p > c.landPitch) return v.crash('Flipped over backwards');
      if (p < -c.landPitch) return v.crash('Nose-dived the landing');
      if (vin > c.impact) return v.crash('Landed way too hard');
      this.reportTricks();
    }
    if (v.grounded && v.groundTime > 0.2) this.trick = null;
    const hit = v.probeHits;
    if (hit) {
      if (hit.type === 'rider' && (hit.impact > 1.0 || hit.pen > 0.08)) return v.crash('Thrown off');
      if (hit.type === 'roll') return v.crash('Rolled it');
      if (hit.type === 'hard' && hit.impact > 4.5) return v.crash('Stuffed the nose');
    }
    // rollover: tipped past the point of no return
    if (Math.abs(this.bodyRoll) > c.roll * DEG && v.grounded) { this.rollTime += dt; if (this.rollTime > 0.4) return v.crash('Rolled it'); }
    else this.rollTime = 0;
    if (v.grounded && v.groundPitch() > c.loop) return v.crash('Flipped over backwards');
    if (v.up.y < 0.1) { this.upsideTime += dt; if (v.grounded || this.upsideTime > 1.5) return v.crash('Upside down'); }
    else this.upsideTime = 0;
  }
}
