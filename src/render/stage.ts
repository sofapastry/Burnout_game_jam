import * as THREE from 'three';
import { Post } from './post';

const PITCH = THREE.MathUtils.degToRad(55);

/** Renderer, camera, lights. The arena always fits on screen; the camera never follows anyone (GDD §10). */
export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  /** Eye-level camera used while possessing a unit. */
  fpCam = new THREE.PerspectiveCamera(80, 1, 0.05, 200);
  view: 'top' | 'fp' = 'top';
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** Everything belonging to the current map/week lives here and is cleared between weeks. */
  world = new THREE.Group();
  private arena = { w: 40, h: 26 };
  private camBase = new THREE.Vector3();
  private target = new THREE.Vector3();
  private shakeAmt = 0;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** Screen-space safe area (NDC) the arena must fit in, leaving room for HUD bars. */
  safe = { top: 0.8, bottom: -0.72, side: 0.97 };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 400);
    this.scene.background = new THREE.Color(0x1d1a22);
    this.scene.add(this.world);

    // Warm golden-hour sun from the west windows, long shadows.
    this.hemi = new THREE.HemisphereLight(0xfff1dc, 0x6a5a48, 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffcf8f, 2.4);
    this.sun.position.set(-26, 30, -8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -32; sc.right = 32; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 100;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.post = new Post(this.renderer);
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  setArena(w: number, h: number) {
    this.undirect();
    this.arena = { w, h };
    this.fit();
  }

  setLighting(mood: 'golden' | 'gym' | 'dark' | 'evening') {
    this.hemi.color.set(0xfff1dc);
    this.hemi.groundColor.set(0x6a5a48);
    if (mood === 'golden') {
      this.sun.color.set(0xffcf8f); this.sun.intensity = 2.4; this.hemi.intensity = 1.25;
      this.sun.position.set(-26, 30, -8);
    } else if (mood === 'gym') {
      this.sun.color.set(0xffdcaa); this.sun.intensity = 2.0; this.hemi.intensity = 1.5;
      this.sun.position.set(-10, 34, -22);
    } else if (mood === 'evening') {
      // day turning to night (GDD §13): low pink sun, cooler fill
      this.sun.color.set(0xff9a7a); this.sun.intensity = 1.6; this.hemi.intensity = 0.95;
      this.hemi.color.set(0xd8c8f0);
      this.sun.position.set(-30, 18, 4);
    } else {
      // blackout: moonlight through the windows; local lights do the rest
      this.sun.color.set(0x6a7ab8); this.sun.intensity = 0.45; this.hemi.intensity = 0.28;
      this.hemi.color.set(0x8090c8);
      this.sun.position.set(-8, 30, -26);
    }
  }

  /** Scale the ambient light (Week 9 power cut). */
  dim(factor: number, mood: 'golden' | 'gym' | 'dark' | 'evening') {
    this.setLighting(mood);
    this.sun.intensity *= factor;
    this.hemi.intensity *= factor;
  }

  /** bloom, grading and a vignette over every screen */
  post!: Post;

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h);
    this.camera.aspect = w / h;
    this.fpCam.aspect = w / h;
    this.fpCam.updateProjectionMatrix();
    this.fit();
  }

  /** Binary-search the camera distance so all four arena corners land inside the safe area. */
  private fit() {
    const { w, h } = this.arena;
    const dir = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
    const corners = [
      new THREE.Vector3(-w / 2, 0, -h / 2), new THREE.Vector3(w / 2, 0, -h / 2),
      new THREE.Vector3(-w / 2, 0, h / 2), new THREE.Vector3(w / 2, 0, h / 2),
      new THREE.Vector3(-w / 2, 3, -h / 2), new THREE.Vector3(w / 2, 3, -h / 2),
    ];
    // Aim slightly below centre so the tall north wall gets space.
    this.target.set(0, 0, 0.6);
    let lo = 10, hi = 200;
    const v = new THREE.Vector3();
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      this.camera.position.copy(this.target).addScaledVector(dir, mid);
      this.camera.lookAt(this.target);
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();
      let ok = true;
      for (const c of corners) {
        v.copy(c).project(this.camera);
        if (Math.abs(v.x) > this.safe.side || v.y > this.safe.top || v.y < this.safe.bottom) { ok = false; break; }
      }
      if (ok) hi = mid; else lo = mid;
    }
    this.camera.position.copy(this.target).addScaledVector(dir, hi);
    this.camera.lookAt(this.target);
    this.camBase.copy(this.camera.position);
    // Re-centre vertically within the safe band.
    this.camera.updateMatrixWorld();
  }

  /** Close-up for intro cards; setArena()/resize() returns to the arena view. */
  closeUp(x: number, y: number, z: number, dist: number, offsetX = 0) {
    this.undirect();
    this.target.set(x, y, z);
    const dir = new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(20)), Math.cos(THREE.MathUtils.degToRad(20)));
    this.camera.position.copy(this.target).addScaledVector(dir, dist);
    this.camera.lookAt(this.target);
    // shift the subject sideways so the card on the other side doesn't cover it
    this.camera.position.x -= offsetX;
    this.camBase.copy(this.camera.position);
  }

  // ---- the director: during a week the camera drifts toward Kirill, leans in when he's close to
  // a debt, punches in on big moments, and each week opens with a low sweep onto him
  private dir = { on: false, x: 0, z: 0, push: 0, punch: 0, sweep: 0, sx: 0, sz: 0 };
  private focus = new THREE.Vector3();
  private look = new THREE.Vector3();

  /** follow this point (Kirill) this frame; push 0..1 leans the camera in */
  direct(x: number, z: number, push = 0) {
    if (!this.dir.on) this.focus.copy(this.target);
    this.dir.on = true; this.dir.x = x; this.dir.z = z; this.dir.push = Math.max(0, Math.min(1, push));
  }
  /** a quick zoom-in on a big moment (0.03..0.1) */
  punch(amount: number) { this.dir.punch = Math.min(0.12, Math.max(this.dir.punch, amount)); }
  /** open the week with a low sweep that lands on this point */
  sweep(x: number, z: number) { this.dir.sweep = 2.4; this.dir.sx = x; this.dir.sz = z; }
  private undirect() { this.dir.on = false; this.dir.sweep = 0; this.dir.punch = 0; this.show.t = 0; }
  /** a low close shot of a character for a few seconds (guest entrances) */
  private show = { t: 0, dur: 1, x: 0, z: 0 };
  showcase(x: number, z: number, dur: number) { this.show = { t: dur, dur, x, z }; }

  shake(amount: number) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  /** A separate scene drawn instead of the map (the side-view duel). */
  override: { scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null;

  render(dt: number) {
    if (this.override) {
      this.post.render(this.override.scene, this.override.camera);
      return;
    }
    if (this.view === 'fp') {
      // first person: shake as a brief jitter around the controller-placed camera
      const base = this.fpCam.position.clone();
      if (this.shakeAmt > 0.001) {
        this.fpCam.position.x += (Math.random() - 0.5) * this.shakeAmt * 0.4;
        this.fpCam.position.y += (Math.random() - 0.5) * this.shakeAmt * 0.4;
        this.shakeAmt *= Math.pow(0.002, dt);
      }
      this.post.render(this.scene, this.fpCam);
      this.fpCam.position.copy(base);
      return;
    }
    const d = this.dir;
    const pos = this.camera.position.copy(this.camBase);
    let aim: THREE.Vector3 | null = null;
    if (d.on || d.sweep > 0) {
      // lean a little toward Kirill (more when he's in trouble), zoom in on punches
      this.focus.lerp(new THREE.Vector3(d.x, 0, d.z), 1 - Math.pow(0.25, dt));
      const lean = d.on ? 0.1 + d.push * 0.3 : 0;
      aim = this.look.copy(this.target).lerp(this.focus, lean);
      const zoom = 1 - d.push * 0.13 - d.punch;
      pos.copy(aim).add(this.camBase.clone().sub(this.target).multiplyScalar(zoom));
      d.punch *= Math.pow(0.004, dt);
      if (d.sweep > 0) {
        d.sweep = Math.max(0, d.sweep - dt);
        const u = 1 - d.sweep / 2.4, e = u * u * (3 - 2 * u);
        const from = new THREE.Vector3(d.sx - 7, 2.6, d.sz + 8.5), fromLook = new THREE.Vector3(d.sx, 1.2, d.sz);
        pos.copy(from.lerp(pos, e));
        aim = fromLook.lerp(aim, e);
      }
    }
    if (this.show.t > 0) {
      const sh = this.show;
      sh.t = Math.max(0, sh.t - dt);
      const el = sh.dur - sh.t, w = Math.min(1, el / 0.5, sh.t / 0.5), e = w * w * (3 - 2 * w);
      const spot = new THREE.Vector3(sh.x + 2.6, 1.7, sh.z + 3.6), look = new THREE.Vector3(sh.x - 0.9, 1.15, sh.z);
      pos.lerp(spot, e);
      aim = (aim ?? this.target.clone()).lerp(look, e);
    }
    if (this.shakeAmt > 0.001) {
      pos.x += (Math.random() - 0.5) * this.shakeAmt;
      pos.y += (Math.random() - 0.5) * this.shakeAmt;
      pos.z += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.pow(0.002, dt);
    }
    // (without the director the orientation set by fit()/closeUp() stays as it is)
    if (aim) this.camera.lookAt(aim);
    this.post.render(this.scene, this.camera);
  }

  /** The camera currently on screen. */
  get active() {
    if (this.override) return this.override.camera;
    return this.view === 'fp' ? this.fpCam : this.camera;
  }

  /** Mouse → point on the floor plane (top-down view). */
  groundPoint(clientX: number, clientY: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    return this.ray.ray.intersectPlane(this.plane, out);
  }

  /** Where the first-person crosshair meets the floor, within maxDist. */
  crosshairPoint(maxDist = 16, out = new THREE.Vector3()): THREE.Vector3 | null {
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.fpCam);
    const hit = this.ray.ray.intersectPlane(this.plane, out);
    if (!hit || hit.distanceTo(this.fpCam.position) > maxDist) return null;
    return hit;
  }

  toScreen(p: THREE.Vector3, out = { x: 0, y: 0 }) {
    const v = p.clone().project(this.active);
    if (v.z > 1) { out.x = out.y = -9999; return out; } // behind the camera
    out.x = (v.x * 0.5 + 0.5) * innerWidth;
    out.y = (-v.y * 0.5 + 0.5) * innerHeight;
    return out;
  }

  clearWorld() {
    this.world.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
    });
    this.world.clear();
  }
}
