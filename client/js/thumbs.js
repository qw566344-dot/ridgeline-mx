// =====================================================================
//  THUMBNAILS: pictures of a vehicle in a paint / skin (and its rider's
//  gear) for the shop cards. Drawn off-screen with the main renderer,
//  one per frame so the menus never stutter, then kept as image URLs.
// =====================================================================
import * as THREE from 'three';
import { getVehicle, paintFor } from '/shared/vehicles.js';
import { VehicleVisual } from './render/vehicleModel.js';
import { Rider, riderScheme } from './render/rider.js';
import { GEAR_SETS } from '/shared/shop.js';

const W = 320, H = 240;

export class Thumbs {
  constructor(R) {
    this.R = R;
    this.cache = new Map();
    this.queue = [];
    this.queued = new Set();
    this.listeners = [];
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(4, 6, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffd2a8, 1.2);
    rim.position.set(-5, 3, -4);
    this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
    this.rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.pixels = new Uint8Array(W * H * 4);
  }

  onReady(f) { this.listeners.push(f); }

  // image URL, or null while it is being drawn (onReady fires when done)
  get(vehicleId, colorId, gearId = 'match') {
    const k = vehicleId + ':' + colorId + ':' + gearId;
    if (this.cache.has(k)) return this.cache.get(k);
    if (!this.queued.has(k)) { this.queued.add(k); this.queue.push({ k, vehicleId, colorId, gearId }); }
    return null;
  }

  // draw the next one (call once a frame)
  step() {
    const job = this.queue.shift();
    if (!job) return;
    const R = this.R.renderer;
    const def = getVehicle(job.vehicleId);
    const scheme = paintFor(job.vehicleId, job.colorId);
    const vis = new VehicleVisual(def, scheme, 7);
    vis.tryLoadModel();
    vis.root.position.y = vis.cfg.rideHeight;
    this.scene.add(vis.root);
    const rider = new Rider(riderScheme(scheme, job.gearId, GEAR_SETS));
    rider.attachTo(vis.model);
    const wheels = vis.cfg.wheels.map((w) => ({ comp: w.sag * w.travel, spin: 0, steer: 0 }));
    const fake = { input: { throttle: 0, brake: 0, lean: 0 }, speed: 0, grounded: true, airTime: 0, lean: 0, wheels: vis.cfg.wheels.map((w) => ({ comp: w.sag * w.travel, cfg: w })), controller: { steer: 0 } };
    vis.camDist = 3;
    vis.update({ lean: 0, steer: 0.2, wheels });
    vis.root.updateMatrixWorld(true);
    for (let i = 0; i < 20; i++) rider.updateRiding(1 / 30, fake, vis);
    const len = vis.cfg.halfLength || 1.1;
    const r = 2.5 + len * 1.75;
    this.camera.position.set(Math.sin(0.85) * r, 0.75 + len * 0.32, Math.cos(0.85) * r);
    this.camera.lookAt(0, 0.5 + len * 0.12, 0);
    this.scene.environment = this.R.envMap;
    const prevTarget = R.getRenderTarget(), prevAlpha = R.getClearAlpha();
    const prevColor = new THREE.Color(); R.getClearColor(prevColor);
    R.setRenderTarget(this.rt);
    R.setClearColor(0x000000, 0);
    R.clear();
    R.render(this.scene, this.camera);
    R.readRenderTargetPixels(this.rt, 0, 0, W, H, this.pixels);
    R.setRenderTarget(prevTarget);
    R.setClearColor(prevColor, prevAlpha);
    // flip (WebGL rows start at the bottom) into the canvas
    const img = this.ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(this.pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    this.ctx.putImageData(img, 0, 0);
    const url = this.canvas.toDataURL('image/png');
    this.cache.set(job.k, url);
    this.scene.remove(vis.root);
    vis.dispose(); rider.dispose();
    this.listeners.forEach((f) => f(job.k));
  }
}
