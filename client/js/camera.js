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

  // DIRECTOR shots (spectating): like a TV director, the game picks who to watch (see
  // Game.directorTick) and this frames them. chase / close / tv reuse the normal camera modes;
  // side tracks alongside the rider, heli circles high above. cut = a new shot: jump straight there
  directorShot(dt, target, world, shot, cut) {
    const cam = this.camera;
    if (cut) { this.snapNext = true; this.tvPoint = null; this.dirS = null; }
    const modes = { chase: 0, close: 1, tv: 3 };
    if (shot in modes) {
      const keep = this.mode; this.mode = modes[shot];
      this.update(dt, target, world, null);
      this.mode = keep;
      return;
    }
    const D = this.dirS || (this.dirS = { pos: null, a: Math.random() * Math.PI * 2, side: Math.random() < 0.5 ? 1 : -1 });
    const h = _h.copy(target.vel).setY(0);
    if (h.lengthSq() < 4) h.set(0, 0, 1).applyQuaternion(target.quat).setY(0);
    h.normalize();
    const want = _d;
    if (shot === 'side') {
      // alongside, a little ahead, low: the classic tracking shot
      want.copy(target.pos).addScaledVector(_w.crossVectors(h, THREE.Object3D.DEFAULT_UP).normalize(), 7.5 * D.side).addScaledVector(h, 2.5);
      want.y = Math.max(target.pos.y, heightAt(world, want.x, want.z)) + 1.3;
    } else {
      // heli: high and wide, slowly circling
      D.a += dt * 0.22;
      want.set(target.pos.x + Math.sin(D.a) * 18, 0, target.pos.z + Math.cos(D.a) * 18);
      want.y = Math.max(target.pos.y, heightAt(world, want.x, want.z)) + 12;
    }
    if (!D.pos || this.snapNext) D.pos = want.clone();
    D.pos.lerp(want, Math.min(1, dt * (shot === 'side' ? 4 : 2)));
    const floor = heightAt(world, D.pos.x, D.pos.z) + 0.8;
    if (D.pos.y < floor) D.pos.y = floor;
    cam.position.copy(D.pos); cam.up.set(0, 1, 0);
    _l.copy(target.pos).addScaledVector(target.vel, 0.15); _l.y += 0.7;
    cam.lookAt(_l);
    const fov = shot === 'side' ? 50 : 42;
    cam.fov += (fov - cam.fov) * (this.snapNext ? 1 : Math.min(1, dt * 4)); cam.updateProjectionMatrix();
    this.pos.copy(cam.position); this.look.copy(_l);
    this.snapNext = false;
  }

  // DRONE camera (spectating, replay free cam), like Rocket League's: it flies with momentum -
  // W / S forward and back along where you look, A / D sideways, Space or E up, Ctrl or Q down,
  // Shift fast; hold the right mouse button to look around. noSpace: Space is taken (replays pause)
  droneStart() {
    const cam = this.camera, d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    this.droneS = { pos: cam.position.clone(), vel: new THREE.Vector3(), yaw: Math.atan2(d.x, d.z), pitch: Math.asin(Math.max(-1, Math.min(1, d.y))) };
    this.droneS.tyaw = this.droneS.yaw; this.droneS.tpitch = this.droneS.pitch;
  }
  drone(dt, input, world, noSpace = false) {
    if (!this.droneS) this.droneStart();
    const D = this.droneS, cam = this.camera, m = input.mouse, down = input.down;
    const k = (...codes) => codes.some((c) => down.has(c));
    if (m.dx || m.dy) { D.tyaw -= m.dx * 0.0035 * this.mouseSens; D.tpitch = Math.max(-1.5, Math.min(1.5, D.tpitch - m.dy * 0.0035 * this.mouseSens)); }
    const look = 1 - Math.exp(-dt * 14);
    D.yaw += (D.tyaw - D.yaw) * look; D.pitch += (D.tpitch - D.pitch) * look;
    const cp = Math.cos(D.pitch);
    const fx = Math.sin(D.yaw) * cp, fy = Math.sin(D.pitch), fz = Math.cos(D.yaw) * cp;
    const rx = -Math.cos(D.yaw), rz = Math.sin(D.yaw);           // right (screen) direction
    const f = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0), s = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
    const u = ((!noSpace && k('Space')) || k('KeyE') ? 1 : 0) - (k('ControlLeft', 'ControlRight', 'KeyQ') ? 1 : 0);
    const top = k('ShiftLeft', 'ShiftRight') ? 48 : 18;
    const wish = _w.set(fx * f + rx * s, fy * f + u, fz * f + rz * s);
    if (wish.lengthSq() > 1) wish.normalize();
    D.vel.lerp(wish.multiplyScalar(top), 1 - Math.exp(-dt * (wish.lengthSq() ? 3.5 : 2.2))); // speeds up and glides to a stop
    D.pos.addScaledVector(D.vel, dt);
    const half = world.half - 2;
    D.pos.x = Math.max(-half, Math.min(half, D.pos.x)); D.pos.z = Math.max(-half, Math.min(half, D.pos.z));
    const floor = heightAt(world, D.pos.x, D.pos.z) + 0.6;
    if (D.pos.y < floor) { D.pos.y = floor; D.vel.y = Math.max(0, D.vel.y); }
    D.pos.y = Math.min(D.pos.y, 400);
    cam.position.copy(D.pos); cam.up.set(0, 1, 0);
    cam.lookAt(D.pos.x + fx, D.pos.y + fy, D.pos.z + fz);
    if (cam.fov !== 70) { cam.fov += (70 - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
    this.pos.copy(cam.position);
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
      _e.copy(eye).sub(target.pos).applyQuaternion(_qi);               // the head in the vehicle's frame
      const car = target.type === 'car';
      if (!this.eyeLocal || this.snapNext) this.eyeLocal = _e.clone();
      this.eyeLocal.lerp(_e, Math.min(1, dt * 7));
      const headW = (this.headW || (this.headW = new THREE.Vector3())).copy(this.eyeLocal).applyQuaternion(target.quat).add(target.pos);
      // where you are flying over the ground. In the air the bike's nose swings round in whips and
      // flips but the path doesn't, so the view is built on this (the old one chased the nose)
      const air = !target.grounded && (target.airTime || 0) > 0.1;
      _h.set(target.vel.x, 0, target.vel.z);
      if (_h.lengthSq() < 4) _h.copy(fwd).setY(0);
      if (_h.lengthSq() < 1e-4) _h.set(0, 0, 1);
      _h.normalize();
      if (!this.fpPath || this.snapNext) this.fpPath = _h.clone();
      this.fpPath.lerp(_h, Math.min(1, dt * (air ? 1.5 : 8))).normalize();
      // on the ground: look where the bike points, eased toward where it is going; level-ish horizon
      _f.copy(fwd).lerp(this.heading, 0.25);
      _f.y = Math.max(-0.45, Math.min(0.35, _f.y)) - (car ? 0.08 : 0.3); // only a slight tilt down: bars / wheel and arms at the bottom edge
      _f.normalize();
      _f.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.orbitYaw);    // mouse look
      _u.set(0, 1, 0);
      if (target.lean) _u.applyAxisAngle(_f, -target.lean * 0.45);    // lean into turns, but less than the bike
      _m.lookAt(_v2.set(0, 0, 0), _f, _u); // camera looks down its -z: from the origin toward _f
      _q.setFromRotationMatrix(_m);
      // In the air the view is built from angles, never from the bike's nose directly: its heading is
      // the flight path; with Settings > first person follows tricks on, it also turns with 360s and
      // its nose angle goes round with flips. Whips never move it (a whip lays the bike over and
      // swings the nose sideways and back - the view keeps looking where you are flying). It never
      // rolls, eases in after take-off and back out on landing, so it never snaps.
      let followW = 0;
      if (air) {
        followW = 1;
        if (!this.fSpinOn) { this.fSpinOn = true; this.fSpin = 0; this.fPrevL = null; }
        _w.set(1, 0, 0).applyQuaternion(target.quat);                    // the bike's left side
        const lay = Math.abs(_w.y);                                       // how far it is laid over (whips)
        _w.y = 0;
        if (this.followFlips && _w.lengthSq() > 0.04) {
          _l.crossVectors(_w.normalize(), THREE.Object3D.DEFAULT_UP).normalize(); // the bike's own heading
          if (this.fPrevL) {
            // only while the nose is near level (a 360) and the bike is not laid over (a whip)
            const turn = Math.atan2(this.fPrevL.z * _l.x - this.fPrevL.x * _l.z, this.fPrevL.dot(_l));
            const level = fwd.x * fwd.x + fwd.z * fwd.z, whip = Math.min(1, Math.max(0, (lay - 0.15) / 0.25));
            this.fSpin += turn * level * level * (1 - whip);
          }
          (this.fPrevL || (this.fPrevL = new THREE.Vector3())).copy(_l);
        }
        _h.copy(this.fpPath).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.followFlips ? this.fSpin : 0);
        // nose angle round the flip (+ = up), in the upright plane along the heading. When the nose
        // points sideways (a whip) that plane says nothing, so the angle is held instead of jumping
        let th = 0;
        if (this.followFlips) {
          const along = fwd.dot(_h);
          th = Math.hypot(fwd.y, along) > 0.55 ? Math.atan2(fwd.y, along) : (this.fPitch ?? 0);
        }
        if (this.fPitch == null) this.fPitch = th;
        else { const d = th - this.fPitch; this.fPitch += d - Math.round(d / (Math.PI * 2)) * Math.PI * 2; }
        (this.fH || (this.fH = new THREE.Vector3())).copy(_h);            // kept while fading out after landing
      } else {
        this.fSpinOn = false;
        if (this.fPitch != null) this.fPitch -= Math.round(this.fPitch / (Math.PI * 2)) * Math.PI * 2; // landed: the nearest way back to level
      }
      this.flipLock = (this.flipLock || 0) + (followW - (this.flipLock || 0)) * Math.min(1, dt * 3.5);
      // blend the ANGLES (heading, nose angle) from the normal view to the flip view. Blending the
      // two orientations instead took the shortest way between them - from level to upside down
      // that way flips between rolling left and rolling right, which shook the view mid-flip
      if (this.flipLock > 0.001 && this.fH && this.fPitch != null) {
        const k = this.flipLock;
        const lvlPitch = Math.asin(Math.max(-1, Math.min(1, _f.y)));
        _d.copy(_f).setY(0).normalize().lerp(this.fH, k).normalize();     // heading
        const P = lvlPitch + (this.fPitch - (car ? 0.08 : 0.3) - lvlPitch) * k;
        _w.crossVectors(_d, THREE.Object3D.DEFAULT_UP).normalize();      // the flip axis (level, square to the heading)
        _f.copy(_d).applyAxisAngle(_w, P);
        _u.set(0, 1, 0).applyAxisAngle(_w, P);
        if (target.lean) _u.applyAxisAngle(_f, -target.lean * 0.45 * (1 - k));
        _m.lookAt(_v2.set(0, 0, 0), _f, _u);
        _q.setFromRotationMatrix(_m);
      } else if (followW === 0) this.fPitch = null;
      if (!this.helmQ || this.snapNext) this.helmQ = _q.clone();
      this.helmQ.slerp(_q, Math.min(1, dt * (this.flipLock > 0.3 ? 12 : target.grounded ? 9 : 5)));
      cam.quaternion.copy(this.helmQ);
      if (this.orbitPitch) cam.rotateX(-this.orbitPitch * 0.8);
      // the eye: a little behind and above the head so the bars and your arms come into view (in a car:
      // the wheel and your hands). Placed from the VIEW, not the bike's frame, so the eye and the view
      // always agree - pinned to the bike, it swung round the head in flips and whips while the view didn't
      cam.position.copy(headW).add(_v2.set(0, car ? 0.05 : 0.2, car ? 0.14 : 0.55).applyQuaternion(this.helmQ));
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
