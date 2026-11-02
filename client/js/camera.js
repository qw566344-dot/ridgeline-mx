// =====================================================================
//  CAMERA
//  Modes (press C): Chase, Close chase, Helmet cam, Trackside (TV) cam.
//  The chase cams follow where the vehicle is GOING (velocity), ease
//  in behind it, pull back and widen the view with speed, look ahead,
//  never dip into the ground, and shake on hard landings.
//  Hold the right mouse button and drag to look around.
// =====================================================================
import * as THREE from 'three';
import { heightAt } from '/shared/terrain.js';
import { pointAt, locate } from '/shared/trackgen.js';

export const CAMERA_MODES = ['Chase', 'Close Chase', 'Helmet', 'Trackside'];

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const _e = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _m = new THREE.Matrix4(), _qi = new THREE.Quaternion(), _ql = new THREE.Quaternion(), _eu = new THREE.Euler();
const _w = new THREE.Vector3(), _h = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _l = new THREE.Vector3(); // scratch (no garbage per frame)

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0;
    this.pos = new THREE.Vector3(0, 10, -10);
    this.look = new THREE.Vector3();
    this.heading = new THREE.Vector3(0, 0, 1);
    this.fov = 65;
    this.baseFov = 62; // Settings > Field of view (chase cams); first person gets a bit more
    this.shake = 0;
    this.shakeT = 0;
    this.orbitYaw = 0; this.orbitPitch = 0; this.orbitHold = 0;
    this.sensitivity = 1; this.mouseSens = 1; this.shakeScale = 1;
    this.tvPoint = null; this.tvTimer = 0;
    this.snapNext = true;
    this.orbit = { yaw: 0, t: 0 };
    // subtle effects (Settings > Speed effects): FOV kick on hard acceleration,
    // a springy dip on landings, a little extra distance in the air
    this.effects = true;
    this.dip = 0; this.dipV = 0;
    this.prevSpd = 0; this.accel = 0; this.airPull = 0;
  }

  // a landing pushes the camera down; it springs back up
  landing(strength) { if (this.effects) this.dipV -= Math.min(3, strength * 1.6); }

  cycle() { this.mode = (this.mode + 1) % CAMERA_MODES.length; this.snapNext = true; this.tvPoint = null; return CAMERA_MODES[this.mode]; }
  setMode(i) { this.mode = i % CAMERA_MODES.length; this.snapNext = true; this.tvPoint = null; }
  addShake(a) { this.shake = Math.min(1.2, this.shake + a * this.shakeScale); }

  mouseLook(dx, dy) {
    this.orbitYaw -= dx * 0.005 * this.mouseSens;
    this.orbitPitch = Math.max(-0.5, Math.min(0.9, this.orbitPitch + dy * 0.004 * this.mouseSens));
    this.orbitHold = 1.5;
  }

  // target: { pos, quat, vel, speed, grounded } (interpolated render state)
  update(dt, target, world, riderHead) {
    const cam = this.camera;
    const spd = target.speed;
    // heading follows travel direction when moving, the vehicle's nose when slow
    const fwd = _v.set(0, 0, 1).applyQuaternion(target.quat);
    const vel = _v2.copy(target.vel);
    vel.y *= 0.25;
    const want = spd > 3 ? vel.normalize().lerp(fwd, 0.35) : _w.copy(fwd);
    want.y = Math.max(-0.5, Math.min(0.5, want.y));
    want.normalize();
    const turnRate = (target.grounded ? 3.2 : 1.4) * this.sensitivity;
    this.heading.lerp(want, this.snapNext ? 1 : Math.min(1, dt * turnRate)).normalize();
    if (this.orbitHold > 0) this.orbitHold -= dt;
    else { this.orbitYaw *= 1 - Math.min(1, dt * 2.5); this.orbitPitch *= 1 - Math.min(1, dt * 2.5); }

    const mode = CAMERA_MODES[this.mode];
    let fovTarget = this.baseFov + Math.min(16, spd * 0.45);
    if (dt > 0) {
      const a = (spd - this.prevSpd) / dt;
      this.prevSpd = spd;
      this.accel += (Math.max(-15, Math.min(15, a)) - this.accel) * Math.min(1, dt * 4);
      this.dipV += (-this.dip * 70 - this.dipV * 11) * dt;
      this.dip = Math.max(-0.6, Math.min(0.3, this.dip + this.dipV * dt));
      this.airPull += ((!target.grounded && (target.airTime || 0) > 0.35 ? 1 : 0) - this.airPull) * Math.min(1, dt * 2);
    }
    if (this.effects) fovTarget += Math.max(-2, Math.min(4.5, this.accel * 0.45));
    const fx = this.effects ? 1 : 0;
    const shake = this.shake;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.shakeT += dt * 32;

    if (mode === 'Chase' || mode === 'Close Chase') {
      const close = mode === 'Close Chase';
      const dist = (close ? 3.6 : 5.6) + Math.min(close ? 1.0 : 2.2, spd * (close ? 0.04 : 0.08)) + this.airPull * fx * (close ? 0.8 : 1.4);
      const height = (close ? 1.45 : 2.2) + Math.min(0.6, spd * 0.02);
      const h = _h.copy(this.heading);
      // mouse orbit
      h.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.orbitYaw);
      const desired = _d.copy(target.pos).addScaledVector(h, -dist);
      desired.y = target.pos.y + height + this.orbitPitch * 3 - h.y * dist * 0.5;
      // never inside the ground (check along the line to the bike too)
      for (let i = 0; i <= 4; i++) {
        const p = _p.copy(target.pos).lerp(desired, i / 4);
        const gy = heightAt(world, p.x, p.z) + 0.6 + (i / 4) * 0.6;
        if (desired.y < gy) desired.y = gy;
      }
      const follow = this.snapNext ? 1 : Math.min(1, dt * (target.grounded ? 9 : 5) * this.sensitivity);
      this.pos.lerp(desired, follow);
      // vertical: softer so landings don't jerk the view
      const look = _l.copy(target.pos).addScaledVector(h, close ? 3 : 5 + spd * 0.15);
      look.y = target.pos.y + (close ? 0.75 : 0.9);
      this.look.lerp(look, this.snapNext ? 1 : Math.min(1, dt * 10));
      cam.position.copy(this.pos);
      cam.position.y += this.dip * fx;
      cam.up.set(0, 1, 0);
      cam.lookAt(_v2.copy(this.look).setY(this.look.y + this.dip * fx * 0.4));
    } else if (mode === 'Helmet') {
      // first person from the rider's eyes. The head bounces with the riding animation, so the
      // eye point is smoothed in the vehicle's own frame (bumps still come through, the jitter
      // does not), and the view direction is smoothed too so jumps and whoops don't whip it around.
      const eye = riderHead ? _p.copy(riderHead) : _p.copy(target.pos).add(_v2.set(0, 0.9, 0));
      _qi.copy(target.quat).invert();
      _e.copy(eye).sub(target.pos).applyQuaternion(_qi);               // eye in the vehicle's frame
      // a little behind the head so the bars and your arms come into view (in a car: the wheel and your hands)
      const car = target.type === 'car';
      _e.y += car ? 0.05 : 0.2; _e.z -= car ? 0.14 : 0.55;
      if (!this.eyeLocal || this.snapNext) this.eyeLocal = _e.clone();
      this.eyeLocal.lerp(_e, Math.min(1, dt * 7));
      cam.position.copy(this.eyeLocal).applyQuaternion(target.quat).add(target.pos);
      // look where the bike points, eased toward where it is going; level-ish horizon
      _f.copy(fwd).lerp(this.heading, 0.25);
      _f.y = Math.max(-0.45, Math.min(0.35, _f.y)) - (car ? 0.08 : 0.3); // only a slight tilt down: bars / wheel and arms at the bottom edge
      _f.normalize();
      _f.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.orbitYaw);    // mouse look
      _u.set(0, 1, 0);
      if (target.lean) _u.applyAxisAngle(_f, -target.lean * 0.45);    // lean into turns, but less than the bike
      _m.lookAt(_v2.set(0, 0, 0), _f, _u); // camera looks down its -z: from the origin toward _f
      _q.setFromRotationMatrix(_m);
      // Settings > first person follows tricks: in the air the view goes round with flips and 360s
      // but NOT with whips. The view's heading comes from the bike's side axis (it turns in a
      // spin, stays put in a flip), blended back to where you are flying while the bike is laid
      // over in a whip; its nose angle follows the flip all the way round; the view never rolls
      // sideways. It eases in after take-off and back out on landing, so it never snaps.
      let followW = 0;
      if (this.followFlips && !target.grounded && (target.airTime || 0) > 0.1) {
        followW = 1;
        _w.set(1, 0, 0).applyQuaternion(target.quat);                    // the bike's left side
        const lay = Math.abs(_w.y);                                       // how far it is laid over (whips)
        _w.y = 0;
        _h.copy(this.heading).setY(0);
        if (_h.lengthSq() < 1e-4) _h.copy(fwd).setY(0);
        _h.normalize();
        if (_w.lengthSq() > 0.04) {
          _l.crossVectors(_w.normalize(), THREE.Object3D.DEFAULT_UP).normalize(); // the bike's own heading (spins turn it)
          const whip = Math.min(1, Math.max(0, (lay - 0.2) / 0.3));       // a whip: keep looking where you are flying
          _h.lerp(_l, 1 - whip * whip * (3 - 2 * whip)).normalize();
        }
        // nose angle round the flip (+ = up), all the way round. Measured against the nose's whole
        // level length (with the sign from the heading), not just the part along the heading: in a
        // whip the nose swings sideways, and that read as "nose down" and tipped the view down
        const th = Math.atan2(fwd.y, Math.hypot(fwd.x, fwd.z) * (fwd.dot(_h) < 0 ? -1 : 1));
        const pitch = th - (car ? 0.08 : 0.3);
        _w.crossVectors(_h, THREE.Object3D.DEFAULT_UP).normalize();      // the flip axis (level, square to the heading)
        _f.copy(_h).applyAxisAngle(_w, pitch);
        _u.set(0, 1, 0).applyAxisAngle(_w, pitch);
        _m.lookAt(_v2.set(0, 0, 0), _f, _u);
        if (!this.flipQ) this.flipQ = new THREE.Quaternion();
        this.flipQ.setFromRotationMatrix(_m);                            // kept while fading out after landing
      }
      this.flipLock = (this.flipLock || 0) + (followW - (this.flipLock || 0)) * Math.min(1, dt * 3.5);
      if (this.flipLock > 0.001 && this.flipQ) _q.slerp(this.flipQ, this.flipLock);
      if (!this.helmQ || this.snapNext) this.helmQ = _q.clone();
      this.helmQ.slerp(_q, Math.min(1, dt * (this.flipLock > 0.3 ? 12 : target.grounded ? 9 : 5)));
      cam.quaternion.copy(this.helmQ);
      if (this.orbitPitch) cam.rotateX(-this.orbitPitch * 0.8);
      fovTarget = this.baseFov + 28 + Math.min(8, spd * 0.2);
      this.pos.copy(cam.position);
      this.look.copy(cam.position).addScaledVector(_f, 10);
    } else {
      // trackside TV camera: a fixed spot beside the track, zooming to follow
      // Where the rider is along the track comes from their position (replays and online riders
      // have no lap position of their own - they all read as the start line, so the camera kept
      // re-picking a spot back there every frame and flickered). The new spot is never further
      // ahead than the re-pick distance (fast riders re-picked every frame too), and off the track
      // (free ride) it goes beside where the rider is heading.
      const T = world.T;
      if (!this.tvPoint || this.tvTimer <= 0 || this.tvPoint.distanceTo(target.pos) > 95) {
        const side = Math.random() < 0.5 ? 1 : -1;
        const ahead = Math.min(55, 25 + spd * 1.1);
        const loc = world.F ? locate(world.F, target.pos.x, target.pos.z) : null;
        let x, z;
        if (loc && Math.abs(loc.u) < 25) {
          const p = pointAt(T, loc.s + ahead, side * (11 + Math.random() * 8));
          x = p.x; z = p.z;
        } else {
          const h = _h.copy(target.vel).setY(0);
          if (h.lengthSq() < 1) h.copy(fwd).setY(0);
          h.normalize();
          x = target.pos.x + h.x * ahead - h.z * side * 14; z = target.pos.z + h.z * ahead + h.x * side * 14;
        }
        this.tvPoint = new THREE.Vector3(x, heightAt(world, x, z) + 2.5 + Math.random() * 3, z);
        this.tvTimer = 7;
        this.snapNext = true; // a cut, not a swoop across the map
      }
      this.tvTimer -= dt;
      cam.position.copy(this.tvPoint);
      cam.up.set(0, 1, 0);
      this.look.lerp(_l.copy(target.pos).add(_v2.set(0, 0.6, 0)), this.snapNext ? 1 : Math.min(1, dt * 8));
      cam.lookAt(this.look);
      const d = this.tvPoint.distanceTo(target.pos);
      fovTarget = Math.max(14, Math.min(60, 1400 / Math.max(10, d)));
      this.pos.copy(cam.position);
    }
    if (shake > 0.01) {
      const a = shake * shake * 0.12;
      cam.position.x += Math.sin(this.shakeT * 1.3) * a;
      cam.position.y += Math.sin(this.shakeT * 1.7 + 1) * a;
      cam.rotation.z += Math.sin(this.shakeT * 2.1) * a * 0.15;
    }
    this.fov += (fovTarget - this.fov) * (this.snapNext ? 1 : Math.min(1, dt * 3));
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    this.snapNext = false;
  }

  // slow orbit around a point (main menu background)
  updateOrbit(dt, centre, world) {
    this.orbit.t += dt;
    const a = this.orbit.t * 0.05;
    const r = 70 + Math.sin(this.orbit.t * 0.07) * 20;
    const x = centre.x + Math.cos(a) * r, z = centre.z + Math.sin(a) * r;
    const y = Math.max(heightAt(world, x, z) + 12, centre.y + 18 + Math.sin(this.orbit.t * 0.11) * 6);
    this.camera.position.set(x, y, z);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(centre);
    if (this.camera.fov !== 55) { this.camera.fov = 55; this.camera.updateProjectionMatrix(); }
  }
}
