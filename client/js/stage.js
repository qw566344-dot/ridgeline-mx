// =====================================================================
//  STAGE: the 3D lobby behind every menu (Rocket League style).
//  - Your vehicle stands in the middle, party members line up beside
//    you, each with a floating name tag (name, vehicle, ready, ping).
//  - 'lobby' view: wide shot of the whole line-up.
//    'focus' view: close orbit around one vehicle (garage + shop) -
//    drag to spin it. The camera glides between the two.
//  - New arrivals roll in from the back, leavers roll out.
//  Uses the main renderer; drawn instead of the track while a menu is up.
// =====================================================================
import * as THREE from 'three';
import { getVehicle, paintFor, BIKE_COLORS } from '/shared/vehicles.js';
import { VehicleVisual } from './render/vehicleModel.js';
import { Rider, riderScheme } from './render/rider.js';
import { GEAR_SETS } from '/shared/shop.js';
import { escapeHtml, staffTags } from './util.js';

// line-up: middle first, then alternating right / left, packed side by side
// by how wide each vehicle looks at the lobby angle (bikes close, buggies wider)
const GAP = 0.35;
function halfWidthOnStage(def) {
  const a = 0.95; // the angle vehicles face in the lobby
  return Math.abs(Math.sin(a)) * (def.halfLength || 1.1) * 0.82 + Math.abs(Math.cos(a)) * (def.halfWidth || 0.4);
}
const _v = new THREE.Vector3();

export class Stage {
  constructor(R) {
    this.R = R;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xd6e2ea, 40, 170);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    this.build();
    this.entries = new Map();   // key -> entry
    this.view = 'lobby';
    this.focusKey = null;
    this.yaw = 0.65; this.pitch = 0.16; this.drag = null; this.idle = 0;
    this.camPos = new THREE.Vector3(0, 3.2, 16);
    this.camLook = new THREE.Vector3(0, 0.9, 0);
    this.time = 0;
    this.tags = document.getElementById('stage-tags');
    const el = R.renderer.domElement;
    el.addEventListener('pointerdown', (e) => { if (!this.active || this.view !== 'focus') return; this.drag = { x: e.clientX, y: e.clientY }; this.idle = 0; });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag || !this.active) return;
      this.yaw -= (e.clientX - this.drag.x) * 0.008;
      this.pitch = Math.max(-0.02, Math.min(0.75, this.pitch + (e.clientY - this.drag.y) * 0.004));
      this.drag = { x: e.clientX, y: e.clientY };
      this.idle = 0;
    });
    window.addEventListener('pointerup', () => { this.drag = null; });
    el.addEventListener('wheel', (e) => { if (this.active && this.view === 'focus') this.zoom = Math.max(0.7, Math.min(1.5, (this.zoom || 1) + Math.sign(e.deltaY) * 0.08)); }, { passive: true });
  }

  // the room: dirt stage, curved back wall with light strips, spotlights
  // the lobby is a motocross track on a sunny day: sky, rolling grass, a dirt track winding past
  // behind the line-up with a table jump and a berm, taped fences, pines and hills far off
  build() {
    const S = this.scene;
    // sky: a soft vertical gradient behind everything
    const sky = document.createElement('canvas'); sky.width = 2; sky.height = 256;
    const sg = sky.getContext('2d'), grd = sg.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#4f8fd6'); grd.addColorStop(0.55, '#a9cbe8'); grd.addColorStop(0.8, '#dfe9f0'); grd.addColorStop(1, '#e6ecef');
    sg.fillStyle = grd; sg.fillRect(0, 0, 2, 256);
    const skyTex = new THREE.CanvasTexture(sky); skyTex.colorSpace = THREE.SRGBColorSpace;
    S.background = skyTex;
    // light: sky / ground bounce and a warm afternoon sun with shadows
    S.add(new THREE.HemisphereLight(0xd8e8ff, 0x55603a, 1.0));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
    key.position.set(-9, 14, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 1024);
    Object.assign(key.shadow.camera, { left: -22, right: 22, top: 10, bottom: -10, near: 1, far: 50 });
    key.shadow.bias = -0.0004;
    S.add(key);
    const fill = new THREE.DirectionalLight(0x9fc0ff, 0.5);
    fill.position.set(10, 4, -6);
    S.add(fill);
    const rnd = (() => { let x = 1234567; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
    // the dirt track: a ribbon winding left to right behind the line-up
    const trackZ = (x) => -15 - 6 * Math.sin(x / 17) - 0.004 * x * x;
    const jumpY = (x) => { const d = Math.abs(x - 2); return d < 5 ? 1.5 : d < 12 ? 1.5 * (1 - (d - 5) / 7) : 0; }; // a table top
    const hillY = (x, z) => { const r = Math.hypot(x, z); return r < 26 ? 0 : (r - 26) * 0.05 + Math.sin(x * 0.07) * Math.cos(z * 0.05) * 1.6 * Math.min(1, (r - 26) / 20); };
    // grass ground (flat near the line-up, rolling further out)
    const gg = new THREE.PlaneGeometry(320, 320, 96, 96);
    gg.rotateX(-Math.PI / 2);
    const gp = gg.attributes.position;
    for (let i = 0; i < gp.count; i++) gp.setY(i, hillY(gp.getX(i), gp.getZ(i)) - 0.15);
    gg.computeVertexNormals();
    const grass = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: 0x6f9a45, roughness: 1 }));
    grass.receiveShadow = true;
    S.add(grass);
    const W = 9, pos = [], idx = [], N = 160;
    for (let i = 0; i <= N; i++) {
      const x = -80 + (160 * i) / N, z = trackZ(x), z2 = trackZ(x + 0.5);
      const tx = 0.5, tz = z2 - z, l = Math.hypot(tx, tz), nx = -tz / l, nz = tx / l;
      const y = jumpY(x) + 0.02;
      pos.push(x + nx * W / 2, y, z + nz * W / 2, x - nx * W / 2, y, z - nz * W / 2);
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setIndex(idx); tg.computeVertexNormals();
    const track = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 1, side: THREE.DoubleSide }));
    track.receiveShadow = true;
    S.add(track);
    // the jump's sides, so the table reads as a solid mound of dirt
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(7, 12, 1.5, 24, 1), new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 1 }));
    mound.scale.set(1, 1, 0.42); mound.position.set(2, 0.7, trackZ(2)); mound.receiveShadow = true;
    S.add(mound);
    // fences: stakes and tape along both edges of the track
    const postG = new THREE.CylinderGeometry(0.05, 0.05, 1.1, 5), postM = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.8 });
    const tapeM = new THREE.MeshStandardMaterial({ color: 0xe8462a, roughness: 0.6 });
    for (const side of [1, -1]) {
      let prev = null;
      for (let x = -70; x <= 70; x += 4) {
        const z = trackZ(x) + side * (W / 2 + 1.2), y = jumpY(x) * 0.0 + 0.4;
        const p = new THREE.Mesh(postG, postM); p.position.set(x, y, z); p.castShadow = true; S.add(p);
        if (prev) {
          const len = Math.hypot(x - prev.x, z - prev.z);
          const t = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.02), tapeM);
          t.position.set((x + prev.x) / 2, 0.85, (z + prev.z) / 2); t.rotation.y = -Math.atan2(z - prev.z, x - prev.x);
          S.add(t);
        }
        prev = { x, z };
      }
    }
    // dirt pad the line-up stands on, with hay bales either side
    const pad = new THREE.Mesh(new THREE.BoxGeometry(44, 0.26, 9, 1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x8f6a46, roughness: 1 }));
    pad.position.set(0, -0.13, -0.6); pad.receiveShadow = true;
    S.add(pad);
    const bale = new THREE.BoxGeometry(1.6, 0.8, 0.9);
    const baleMat = new THREE.MeshStandardMaterial({ color: 0xd2b066, roughness: 1 });
    for (const x of [-21, -19.2, 19.2, 21]) {
      const bb = new THREE.Mesh(bale, baleMat);
      bb.position.set(x, 0.4, -2.4 + (x > 0 ? 0.4 : 0)); bb.rotation.y = x * 0.1;
      bb.castShadow = true; bb.receiveShadow = true;
      S.add(bb);
    }
    // pines (instanced) behind the track and round the sides, clear of the track
    const pines = [];
    for (let t = 0; t < 900 && pines.length < 260; t++) {
      const x = (rnd() - 0.5) * 260, z = -24 - rnd() * 120;
      if (Math.abs(z - trackZ(x)) < W) continue;
      pines.push([x, z, 0.7 + rnd() * 0.9]);
    }
    for (let t = 0; t < 120; t++) { const sd = rnd() < 0.5 ? -1 : 1; pines.push([sd * (30 + rnd() * 50), -10 + rnd() * 40, 0.7 + rnd() * 0.8]); }
    const cone = new THREE.ConeGeometry(1.6, 5, 7); cone.translate(0, 4, 0);
    const trunk = new THREE.CylinderGeometry(0.2, 0.25, 1.6, 5); trunk.translate(0, 0.8, 0);
    const coneM = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ color: 0x2f5a32, roughness: 1, flatShading: true }), pines.length);
    const trunkM = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x5a3e28, roughness: 1 }), pines.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    pines.forEach(([x, z, k], i) => { m4.compose(new THREE.Vector3(x, hillY(x, z) - 0.15, z), q, sc.set(k, k, k)); coneM.setMatrixAt(i, m4); trunkM.setMatrixAt(i, m4); });
    coneM.castShadow = true;
    S.add(coneM, trunkM);
    // hills far off
    const hillM = new THREE.MeshStandardMaterial({ color: 0x7f9c64, roughness: 1, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(30 + rnd() * 30, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hillM);
      h.position.set(-140 + i * 35 + rnd() * 10, -4, -150 - rnd() * 30); h.scale.y = 0.35 + rnd() * 0.25;
      S.add(h);
    }
    // a start gate banner over the track
    const gateM = new THREE.MeshStandardMaterial({ color: 0xf0743e, roughness: 0.6 });
    const gz = trackZ(-22);
    for (const dz of [-W / 2 - 0.4, W / 2 + 0.4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.5, 0.3), gateM); p.position.set(-22, 2.2, gz + dz); p.castShadow = true; S.add(p); }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, W + 1.1), new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.7 }));
    banner.position.set(-22, 4.2, gz); S.add(banner);
  }

  // list: [{ key, vehicleId, colorId, gearId, name, sub, ready, leader, me, ping }]
  // the first entry takes the middle slot
  setLineup(list) {
    const keep = new Set(list.map((e) => e.key));
    for (const [k, e] of this.entries) if (!keep.has(k)) this.leave(e);
    // where each one stands
    const xs = [];
    let right = 0, left = 0;
    list.forEach((d, i) => {
      const w = halfWidthOnStage(getVehicle(d.vehicleId));
      if (i === 0) { xs.push(0); right = w; left = -w; }
      else if (i % 2) { xs.push(right + GAP + w); right += GAP + 2 * w; }
      else { xs.push(left - GAP - w); left -= GAP + 2 * w; }
    });
    // centre the whole group on the stage
    const mid = (right + left) / 2;
    for (let i = 0; i < xs.length; i++) xs[i] -= mid;
    this.lineWidth = (right - left) / 2;
    list.forEach((d, i) => {
      let e = this.entries.get(d.key);
      const look = d.vehicleId + ':' + d.colorId + ':' + (d.gearId || 'match') + ':' + (d.rims || 'stock');
      if (e && e.look !== look) { this.dispose(e); this.entries.delete(d.key); e = null; }
      if (!e) {
        e = this.make(d, look);
        e.x = xs[i]; e.z = -14; e.arrive = 0; // roll in from the back
        this.entries.set(d.key, e);
      }
      e.slot = i; e.info = d; e.leaving = false;
      e.tx = xs[i];
    });
    this.renderTags();
  }

  make(d, look) {
    const def = getVehicle(d.vehicleId);
    const scheme = { ...paintFor(d.vehicleId, d.colorId), rims: d.rims || 'stock' };
    const vis = new VehicleVisual(def, scheme, d.number || 1);
    vis.tryLoadModel();
    vis.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const holder = new THREE.Group();
    holder.add(vis.root);
    vis.root.position.y = vis.cfg.rideHeight;
    this.scene.add(holder);
    const rs = riderScheme(scheme, d.gearId || 'match', GEAR_SETS, BIKE_COLORS);
    const rider = new Rider(rs);
    if (d.number) rider.setNumber(d.number, rs);
    rider.attachTo(vis.model);
    const wheels = vis.cfg.wheels.map((w) => ({ comp: w.sag * w.travel, spin: 0, steer: 0 }));
    const fake = { input: { throttle: 0, brake: 0, lean: 0 }, speed: 0, grounded: true, airTime: 0, lean: 0, wheels: vis.cfg.wheels.map((w) => ({ comp: w.sag * w.travel, cfg: w })), controller: { steer: 0 } };
    const tag = document.createElement('div');
    tag.className = 'stage-tag';
    this.tags.appendChild(tag);
    return { key: d.key, look, vis, rider, holder, wheels, fake, tag, spin: 0, phase: Math.random() * 6 };
  }

  leave(e) { e.leaving = true; e.tx = e.x; }

  dispose(e) {
    this.scene.remove(e.holder);
    e.vis.dispose(); e.rider.dispose();
    e.tag.remove();
  }

  clear() { for (const e of this.entries.values()) this.dispose(e); this.entries.clear(); }

  renderTags() {
    for (const e of this.entries.values()) {
      const d = e.info;
      if (!d) continue;
      const pingCls = d.ping == null ? '' : d.ping < 80 ? 'good' : d.ping < 160 ? 'ok' : 'bad';
      e.tag.innerHTML = `${staffTags(d.name)}<div class="tag-name">${d.leader ? '<i class="crown" title="Party leader">&#9819;</i>' : ''}${escapeHtml(d.name)}${d.me ? ' <small>YOU</small>' : ''}</div>
        <div class="tag-sub">${escapeHtml(d.sub || getVehicle(d.vehicleId).name)}</div>
        <div class="tag-row">${d.ready === undefined ? '' : d.ready ? '<span class="pill ready">READY</span>' : d.away ? '<span class="pill gone">RECONNECTING</span>' : '<span class="pill">NOT READY</span>'}${d.ping != null ? `<span class="ping ${pingCls}">${d.ping} ms</span>` : ''}</div>`;
      e.tag.classList.toggle('me', !!d.me);
    }
  }

  // 'lobby' (everyone) or 'focus' (one vehicle, orbit camera)
  setView(view, focusKey = null) {
    if (view === 'focus' && this.view !== 'focus') { this.yaw = 0.65; this.pitch = 0.16; this.zoom = 1; }
    this.view = view;
    this.focusKey = focusKey;
  }

  render(dt) {
    this.active = true;
    this.time += dt;
    this.scene.environment = this.R.envMap;
    this.idle += dt;
    const focus = this.view === 'focus' ? this.entries.get(this.focusKey) || [...this.entries.values()][0] : null;
    if (focus && this.idle > 2.5 && !this.drag) this.yaw += dt * 0.22;
    // move entries towards their slots
    for (const e of [...this.entries.values()]) {
      if (e.leaving) {
        e.z += dt * 9; e.x += (e.x >= 0 ? 1 : -1) * dt * 2;
        if (e.z > 22) { this.dispose(e); this.entries.delete(e.key); continue; }
      } else {
        e.arrive = Math.min(1, e.arrive + dt * 0.9);
        const k = 1 - Math.exp(-dt * 4);
        e.x += (e.tx - e.x) * k;
        e.z += (0 - e.z) * (1 - Math.exp(-dt * 3.2));
      }
      const moving = Math.abs(e.tx - e.x) + Math.abs(e.z) > 0.05;
      const isFocus = focus === e;
      // only the focused vehicle while in the garage / shop
      const show = !focus || isFocus;
      e.fade = Math.max(0, Math.min(1, (e.fade ?? 1) + (show ? dt * 3 : -dt * 4)));
      e.holder.visible = e.fade > 0.02;
      e.holder.position.set(e.x, (e.fade - 1) * 0.6, e.z);
      // facing: three-quarter view towards the camera in the lobby, turntable in focus
      const want = isFocus ? 0 : moving ? 0 : 0.95;
      e.spin += (want - e.spin) * (1 - Math.exp(-dt * 3));
      e.holder.rotation.y = e.spin;
      // idle life: suspension breathing, wheels creep when rolling in
      const sp = moving ? 4 : 0;
      e.wheels.forEach((w, i) => { w.spin += (sp / (e.vis.cfg.wheels[i].r || 0.3)) * dt; w.steer = Math.sin(this.time * 0.6 + e.phase) * 0.08; });
      e.fake.speed = sp;
      e.vis.camDist = this.camera.position.distanceTo(e.holder.position);
      e.vis.update({ lean: 0, steer: e.wheels[0].steer, wheels: e.wheels });
      e.holder.updateMatrixWorld();
      e.rider.updateRiding(dt, e.fake, e.vis);
    }
    // camera
    let pos, look;
    if (focus) {
      const len = focus.vis.cfg.halfLength || 1.1;
      const r = (3.6 + len * 1.9) * (this.zoom || 1);
      const c = focus.holder.position;
      pos = _v.set(c.x + Math.sin(this.yaw) * Math.cos(this.pitch) * r, 0.75 + Math.sin(this.pitch) * r, c.z + Math.cos(this.yaw) * Math.cos(this.pitch) * r);
      look = new THREE.Vector3(c.x, 0.5 + len * 0.2, c.z);
    } else {
      // frame the whole line-up, close in when it is just you
      const half = Math.max(1.2, this.lineWidth || 1.2);
      const sway = Math.sin(this.time * 0.15) * 0.5;
      pos = _v.set(sway, 1.45 + half * 0.22, 5.0 + half * 1.75);
      look = new THREE.Vector3(0, 0.8 + half * 0.03, 0);
    }
    const k = 1 - Math.exp(-dt * (this.snap ? 60 : 3.2));
    this.snap = false;
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.aspect = this.R.camera.aspect;
    // push the vehicle sideways on screen when a big panel covers one side (shop)
    const el = this.R.renderer.domElement;
    if (this.screenShift) this.camera.setViewOffset(el.clientWidth, el.clientHeight, -this.screenShift * el.clientWidth, 0, el.clientWidth, el.clientHeight);
    else if (this.camera.view) this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.R.renderer.render(this.scene, this.camera);
    this.placeTags(focus);
  }

  // name tags follow the vehicles on screen
  placeTags(focus) {
    const w = this.R.renderer.domElement.clientWidth, h = this.R.renderer.domElement.clientHeight;
    for (const e of this.entries.values()) {
      const vis = !focus && !e.leaving && e.fade > 0.5 && this.showTags !== false;
      e.tag.style.display = vis ? '' : 'none';
      if (!vis) continue;
      _v.set(e.x, (e.vis.cfg.type === 'car' ? 2.05 : 2.0), e.z).project(this.camera);
      e.tag.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px) translate(-50%, -100%)`;
      e.tag.style.opacity = String(e.arrive);
    }
  }

  hideTags() { for (const e of this.entries.values()) e.tag.style.display = 'none'; this.active = false; }
}
