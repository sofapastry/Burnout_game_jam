import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, outlineMaterial, box, cyl, sphere, capsule } from '../render/toon';

// Procedural low-poly person (Kirill, and fallback for characters without a model).

export type HairStyle = 'spiky' | 'messy' | 'bowl' | 'curly' | 'sidepart' | 'buzz' | 'bun' | 'swept' | 'long';
export type Glasses = 'none' | 'round' | 'square' | 'thick' | 'aviator';
export type Accessory = 'none' | 'headphones' | 'scarf' | 'pins' | 'lanyard' | 'cap' | 'beanie' | 'whistle' | 'chain';
export type BackpackStyle = 'classic' | 'roll' | 'patches' | 'tablet';
export type Pose =
  | 'idle' | 'run' | 'sit' | 'dance' | 'stun' | 'panic' | 'cheer' | 'throw' | 'talk' | 'laps'
  // duel poses (side view)
  | 'stance' | 'walk' | 'punch' | 'kick' | 'block' | 'hit' | 'special'
  | 'crouch' | 'sweep' | 'uppercut' | 'jump' | 'airkick' | 'hook' | 'spin';

export interface PersonLook {
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  eyes: number;
  top: number;
  topTrim: number;
  topKind: 'hoodie' | 'jacket' | 'tracksuit' | 'shirt' | 'uniform';
  pants: number;
  shoes: number;
  sole: number;
  backpack: number | null;
  backpackStyle: BackpackStyle;
  backpackAccent: number;
  keychain: number | null;
  glasses: Glasses;
  glassesColor: number;
  accessory: Accessory;
  accessoryColor: number;
  chestPrint: number | null;
  height: number;
  build: number;
  blush: boolean;
  skirt?: boolean;
}

type Item = { g: THREE.BufferGeometry; color: number; outline: boolean };
type V3 = [number, number, number];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

class Bucket {
  items: Item[] = [];
  add(geom: THREE.BufferGeometry, color: number, pos: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], outline = true) {
    _m.compose(_p.set(...pos), _q.setFromEuler(_e.set(...rot)), _s.set(...scale));
    this.items.push({ g: geom.clone().applyMatrix4(_m), color, outline });
    return this;
  }
  bake(into: THREE.Object3D, outlineTh = 0.022) {
    const byColor = new Map<number, THREE.BufferGeometry[]>();
    const outl: THREE.BufferGeometry[] = [];
    for (const it of this.items) {
      if (!byColor.has(it.color)) byColor.set(it.color, []);
      byColor.get(it.color)!.push(it.g);
      if (it.outline) outl.push(it.g);
    }
    for (const [color, geoms] of byColor) {
      const mesh = new THREE.Mesh(mergeGeometries(geoms), toon(color));
      mesh.castShadow = true;
      into.add(mesh);
    }
    if (outl.length) {
      const o = new THREE.Mesh(mergeGeometries(outl), outlineMaterial(outlineTh));
      o.raycast = () => {};
      into.add(o);
    }
  }
}

function shadeHex(hex: number, l: number) {
  return new THREE.Color(hex).offsetHSL(0, 0, l).getHex();
}

export class Person {
  root = new THREE.Group();
  body = new THREE.Group();
  torso = new THREE.Group();
  head = new THREE.Group();
  eyes = new THREE.Group();
  mouth: THREE.Mesh;
  armL = new THREE.Group();
  armR = new THREE.Group();
  legL = new THREE.Group();
  legR = new THREE.Group();
  stars = new THREE.Group();
  pose: Pose = 'idle';
  facing = 0;
  t = Math.random() * 10;
  phase = 0;
  private cur = restTargets();
  private vel = zeroTargets();
  private blinkIn = 2 + Math.random() * 3;
  private hurtT = 0;
  /** how fast limbs reach their target pose; duels use a higher value so strikes snap */
  snap = 14;

  constructor(public look: PersonLook) {
    const L = look;
    const r = this.root;
    r.add(this.body);

    // ---- legs
    for (const [leg, x] of [[this.legL, -0.1], [this.legR, 0.1]] as const) {
      leg.position.set(x, 0.66, 0);
      const b = new Bucket();
      b.add(capsule(0.085, 0.4), L.pants, [0, -0.3, 0]);
      b.add(box(0.15, 0.1, 0.26), L.shoes, [0, -0.6, 0.04]);
      b.add(box(0.16, 0.03, 0.27), L.sole, [0, -0.645, 0.04]);
      b.bake(leg);
      this.body.add(leg);
    }
    const pelvis = new Bucket();
    if (L.skirt) pelvis.add(cyl(0.16, 0.27, 0.3, 14), L.pants, [0, 0.58, 0]);
    else pelvis.add(sphere(0.18), L.pants, [0, 0.66, 0], [0, 0, 0], [1.15, 0.6, 0.85]);
    pelvis.bake(this.body);

    // ---- torso
    this.torso.position.set(0, 0.66, 0);
    this.body.add(this.torso);
    const t = new Bucket();
    t.add(capsule(0.2, 0.26), L.top, [0, 0.3, 0], [0, 0, 0], [1.18, 1, 0.82]);
    t.add(cyl(0.065, 0.07, 0.1), L.skin, [0, 0.6, 0]);
    if (L.topKind === 'hoodie') {
      t.add(cyl(0.235, 0.235, 0.06, 16), L.topTrim, [0, 0.04, 0], [0, 0, 0], [1, 1, 0.82]);
      t.add(box(0.26, 0.11, 0.03), shadeHex(L.top, -0.06), [0, 0.17, 0.165]);
      t.add(cyl(0.008, 0.008, 0.14, 5), L.topTrim, [-0.045, 0.45, 0.17], [0, 0, 0], [1, 1, 1], false);
      t.add(cyl(0.008, 0.008, 0.14, 5), L.topTrim, [0.045, 0.45, 0.17], [0, 0, 0], [1, 1, 1], false);
      t.add(sphere(0.17), L.top, [0, 0.57, -0.13], [0, 0, 0], [1.25, 0.65, 0.9]);
    } else if (L.topKind === 'tracksuit') {
      t.add(box(0.03, 0.5, 0.02), L.topTrim, [0, 0.3, 0.168]);
      t.add(box(0.36, 0.04, 0.02), L.topTrim, [0, 0.45, 0.14], [0.3, 0, 0], [1, 1, 1], false);
      t.add(cyl(0.11, 0.12, 0.08, 12), L.top, [0, 0.58, 0]);
    } else if (L.topKind === 'jacket') {
      t.add(box(0.03, 0.5, 0.02), shadeHex(L.top, -0.12), [0, 0.3, 0.168]);
      t.add(box(0.12, 0.2, 0.02), L.topTrim, [0, 0.42, 0.16]);
      t.add(cyl(0.12, 0.13, 0.08, 12), L.top, [0, 0.58, 0]);
    } else if (L.topKind === 'uniform') {
      t.add(box(0.36, 0.04, 0.02), L.topTrim, [0, 0.05, 0.165]);
      t.add(box(0.08, 0.06, 0.02), 0xd8b84a, [0.09, 0.4, 0.168]);
    } else {
      t.add(box(0.14, 0.06, 0.02), L.topTrim, [0, 0.52, 0.15]);
    }
    if (L.chestPrint !== null) t.add(box(0.12, 0.08, 0.01), L.chestPrint, [0.07, 0.36, 0.172], [0, 0, 0], [1, 1, 1], false);

    if (L.backpack !== null) {
      const bp = L.backpack, dark = shadeHex(bp, -0.15);
      t.add(box(0.38, 0.4, 0.17), bp, [0, 0.32, -0.24]);
      t.add(cyl(0.085, 0.085, 0.38, 12), bp, [0, 0.52, -0.24], [0, 0, Math.PI / 2]);
      t.add(box(0.28, 0.15, 0.06), dark, [0, 0.2, -0.34]);
      t.add(box(0.05, 0.36, 0.03), dark, [-0.12, 0.36, 0.16]);
      t.add(box(0.05, 0.36, 0.03), dark, [0.12, 0.36, 0.16]);
      if (L.backpackStyle === 'roll') t.add(cyl(0.07, 0.07, 0.46, 12), L.backpackAccent, [0, 0.66, -0.24], [0, 0, Math.PI / 2]);
      if (L.backpackStyle === 'patches') {
        t.add(box(0.07, 0.07, 0.01), L.backpackAccent, [-0.08, 0.38, -0.33], [0, 0, 0.3], [1, 1, 1], false);
        t.add(cyl(0.035, 0.035, 0.01, 10), 0xf2e6c8, [0.09, 0.42, -0.33], [Math.PI / 2, 0, 0], [1, 1, 1], false);
      }
      if (L.backpackStyle === 'tablet') t.add(box(0.26, 0.2, 0.03), 0x30343c, [0, 0.47, -0.36]);
      if (L.keychain !== null) t.add(sphere(0.035, 8, 6), L.keychain, [0.15, 0.12, -0.34]);
    }

    switch (L.accessory) {
      case 'headphones':
        t.add(new THREE.TorusGeometry(0.16, 0.025, 6, 18), L.accessoryColor, [0, 0.6, 0.02], [Math.PI / 2 - 0.25, 0, 0]);
        t.add(cyl(0.065, 0.065, 0.05, 12), L.accessoryColor, [-0.16, 0.6, 0.05], [0, 0, Math.PI / 2]);
        t.add(cyl(0.065, 0.065, 0.05, 12), L.accessoryColor, [0.16, 0.6, 0.05], [0, 0, Math.PI / 2]);
        break;
      case 'scarf':
        t.add(new THREE.TorusGeometry(0.14, 0.06, 8, 16), L.accessoryColor, [0, 0.58, 0], [Math.PI / 2, 0, 0]);
        t.add(box(0.09, 0.24, 0.03), L.accessoryColor, [0.09, 0.44, 0.17], [0, 0, 0.1]);
        break;
      case 'pins':
        [[0.09, 0.42, 0xe8c547], [0.13, 0.33, 0xd8504a], [-0.1, 0.4, 0x6fb7e8]].forEach(([x, y, c]) =>
          t.add(cyl(0.025, 0.025, 0.012, 10), c, [x, y, 0.172], [Math.PI / 2, 0, 0], [1, 1, 1], false));
        break;
      case 'lanyard':
        t.add(box(0.012, 0.3, 0.01), L.accessoryColor, [-0.06, 0.45, 0.168], [0, 0, -0.25], [1, 1, 1], false);
        t.add(box(0.012, 0.3, 0.01), L.accessoryColor, [0.06, 0.45, 0.168], [0, 0, 0.25], [1, 1, 1], false);
        t.add(box(0.08, 0.11, 0.012), 0xf4f4f0, [0, 0.27, 0.175]);
        break;
      case 'whistle':
        t.add(box(0.01, 0.25, 0.01), L.accessoryColor, [0, 0.45, 0.168], [0, 0, 0], [1, 1, 1], false);
        t.add(cyl(0.03, 0.03, 0.08, 8), 0xc9ccd2, [0, 0.31, 0.19], [0, 0, Math.PI / 2]);
        break;
      case 'chain':
        t.add(new THREE.TorusGeometry(0.13, 0.015, 6, 18), 0xe0bb45, [0, 0.52, 0.06], [Math.PI / 2 - 0.6, 0, 0]);
        t.add(cyl(0.035, 0.035, 0.015, 10), 0xe0bb45, [0, 0.4, 0.172], [Math.PI / 2, 0, 0]);
        break;
    }
    t.bake(this.torso);

    // ---- arms
    for (const [arm, x] of [[this.armL, -0.255], [this.armR, 0.255]] as const) {
      arm.position.set(x, 0.53, 0);
      const a = new Bucket();
      a.add(capsule(0.07, 0.26), L.top, [0, -0.2, 0]);
      a.add(cyl(0.075, 0.075, 0.04, 12), L.topTrim, [0, -0.36, 0]);
      a.add(sphere(0.065, 10, 8), L.skin, [0, -0.42, 0]);
      a.bake(arm);
      this.torso.add(arm);
    }

    // ---- head (×1.25 readability scale is baked into the proportions)
    this.head.position.set(0, 0.64, 0);
    this.torso.add(this.head);
    const h = new Bucket();
    const hc: V3 = [0, 0.27, 0];
    h.add(sphere(0.3, 24, 18), L.skin, hc, [0, 0, 0], [1, 0.96, 0.95]);
    h.add(sphere(0.06, 8, 6), L.skin, [-0.295, 0.25, 0], [0, 0, 0], [0.6, 1, 1]);
    h.add(sphere(0.06, 8, 6), L.skin, [0.295, 0.25, 0], [0, 0, 0], [0.6, 1, 1]);
    // brows
    h.add(box(0.085, 0.02, 0.02), shadeHex(L.hair, -0.05), [-0.105, 0.37, 0.27], [0, 0, 0.12], [1, 1, 1], false);
    h.add(box(0.085, 0.02, 0.02), shadeHex(L.hair, -0.05), [0.105, 0.37, 0.27], [0, 0, -0.12], [1, 1, 1], false);
    if (L.blush) {
      h.add(sphere(0.04, 8, 6), 0xf2a093, [-0.16, 0.18, 0.24], [0, 0, 0], [1, 0.5, 0.3], false);
      h.add(sphere(0.04, 8, 6), 0xf2a093, [0.16, 0.18, 0.24], [0, 0, 0], [1, 0.5, 0.3], false);
    }
    this.addHair(h, L);
    this.addGlasses(h, L);
    this.addHeadwear(h, L);
    h.bake(this.head);

    // eyes in their own group so they can blink/squint
    this.eyes.position.set(0, 0.26, 0.265);
    this.head.add(this.eyes);
    const e = new Bucket();
    for (const x of [-0.105, 0.105]) {
      e.add(sphere(0.052, 12, 10), L.eyes, [x, 0, 0], [0, 0, 0], [0.95, 1.35, 0.45], false);
      e.add(sphere(0.017, 6, 5), 0xffffff, [x - 0.016, 0.028, 0.022], [0, 0, 0], [1, 1, 1], false);
    }
    e.bake(this.eyes);

    this.mouth = new THREE.Mesh(box(0.07, 0.016, 0.02), toon(0x5a2a22));
    this.mouth.position.set(0, 0.14, 0.268);
    this.head.add(this.mouth);

    // stun stars
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), toon(0xffd84a, { emissive: 0x806010 }));
      const a = (i / 3) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.3, 0.68, Math.sin(a) * 0.3);
      this.stars.add(s);
    }
    this.stars.visible = false;
    this.head.add(this.stars);

    r.scale.set(L.build, L.height, L.build);
  }

  private addHair(h: Bucket, L: PersonLook) {
    const c = L.hair;
    const capTilt: V3 = [-0.38, 0, 0];
    const cap = (theta: number, rad = 0.318) => new THREE.SphereGeometry(rad, 22, 12, 0, Math.PI * 2, 0, Math.PI * theta);
    const hidden = L.accessory === 'cap' || L.accessory === 'beanie';
    switch (L.hairStyle) {
      case 'spiky': {
        h.add(cap(0.55), c, [0, 0.29, 0], capTilt);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const tilt = 0.75;
          h.add(new THREE.ConeGeometry(0.075, 0.24, 6), c,
            [Math.sin(a) * 0.17, 0.53, Math.cos(a) * 0.17 - 0.04], [Math.cos(a) * tilt, 0, -Math.sin(a) * tilt]);
        }
        h.add(new THREE.ConeGeometry(0.08, 0.22, 6), c, [0, 0.6, -0.02]);
        break;
      }
      case 'messy': {
        h.add(cap(0.56), c, [0, 0.29, 0], capTilt);
        const pts: V3[] = [[-0.16, 0.47, 0.17], [0, 0.5, 0.2], [0.16, 0.46, 0.18], [-0.22, 0.5, -0.05], [0.2, 0.52, -0.06], [0, 0.58, -0.05], [0.08, 0.55, 0.1]];
        for (const p of pts) h.add(sphere(0.1, 10, 8), c, p, [0, 0, 0], [1.1, 0.75, 1]);
        break;
      }
      case 'bowl':
        h.add(cap(0.6), c, [0, 0.29, 0], [-0.12, 0, 0], [1.04, 1, 1.04]);
        h.add(box(0.42, 0.08, 0.06), c, [0, 0.42, 0.25]);
        break;
      case 'curly': {
        h.add(cap(0.55), c, [0, 0.29, 0], capTilt);
        for (let i = 0; i < 16; i++) {
          const a = i * 2.399, rr = 0.1 + (i % 4) * 0.045;
          h.add(sphere(0.075, 8, 6), c, [Math.cos(a) * rr * 1.1, 0.52 + (0.2 - rr) * 0.4, Math.sin(a) * rr - 0.02]);
        }
        break;
      }
      case 'sidepart':
        h.add(cap(0.56), c, [0, 0.29, 0], capTilt);
        h.add(sphere(0.14, 12, 8), c, [0.07, 0.5, 0.15], [0.2, 0, -0.35], [1.7, 0.55, 1]);
        break;
      case 'swept':
        h.add(cap(0.55), c, [0, 0.29, 0], capTilt);
        h.add(sphere(0.13, 12, 8), c, [0, 0.54, 0.12], [-0.6, 0, 0], [1.6, 0.7, 1.3]);
        h.add(sphere(0.1, 10, 8), c, [0, 0.6, -0.04], [0, 0, 0], [1.4, 0.7, 1.3]);
        break;
      case 'buzz':
        h.add(cap(0.52, 0.306), c, [0, 0.28, 0], capTilt);
        break;
      case 'bun':
        h.add(cap(0.58), c, [0, 0.29, 0], capTilt);
        h.add(sphere(0.12, 12, 10), c, [0, 0.58, -0.17]);
        break;
      case 'long':
        h.add(cap(0.58), c, [0, 0.29, 0], capTilt);
        h.add(box(0.5, 0.42, 0.2), c, [0, 0.15, -0.16]);
        h.add(box(0.1, 0.36, 0.14), c, [-0.27, 0.18, 0.05]);
        h.add(box(0.1, 0.36, 0.14), c, [0.27, 0.18, 0.05]);
        break;
    }
    if (hidden) {
      // tufts peeking from under the cap
      h.add(sphere(0.07, 8, 6), c, [-0.27, 0.34, 0.08]);
      h.add(sphere(0.07, 8, 6), c, [0.27, 0.34, 0.08]);
    }
  }

  private addGlasses(h: Bucket, L: PersonLook) {
    if (L.glasses === 'none') return;
    const c = L.glassesColor;
    const y = 0.26, z = 0.3;
    for (const x of [-0.105, 0.105]) {
      if (L.glasses === 'round') h.add(new THREE.TorusGeometry(0.082, 0.014, 6, 20), c, [x, y, z], [0, 0, 0], [1, 1, 1], false);
      if (L.glasses === 'thick') h.add(new THREE.TorusGeometry(0.085, 0.026, 6, 20), c, [x, y, z], [0, 0, 0], [1, 1, 1], false);
      if (L.glasses === 'square') h.add(new THREE.TorusGeometry(0.1, 0.017, 4, 4), c, [x, y, z], [0, 0, Math.PI / 4], [1.1, 0.85, 1], false);
      if (L.glasses === 'aviator') h.add(new THREE.TorusGeometry(0.085, 0.012, 6, 20), c, [x, y - 0.01, z], [0, 0, 0], [1.05, 0.9, 1], false);
    }
    h.add(cyl(0.01, 0.01, 0.05, 5), c, [0, y + 0.02, z + 0.01], [0, 0, Math.PI / 2], [1, 1, 1], false);
    h.add(box(0.014, 0.014, 0.27), c, [-0.255, y + 0.01, 0.17], [0, -0.35, 0], [1, 1, 1], false);
    h.add(box(0.014, 0.014, 0.27), c, [0.255, y + 0.01, 0.17], [0, 0.35, 0], [1, 1, 1], false);
  }

  private addHeadwear(h: Bucket, L: PersonLook) {
    const c = L.accessoryColor;
    if (L.accessory === 'cap') {
      h.add(new THREE.SphereGeometry(0.33, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), c, [0, 0.32, 0], [-0.15, 0, 0]);
      h.add(box(0.24, 0.025, 0.18), c, [0, 0.4, -0.36], [-0.25, 0, 0]);
    } else if (L.accessory === 'beanie') {
      h.add(new THREE.SphereGeometry(0.33, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), c, [0, 0.33, 0], [-0.2, 0, 0], [1, 1.15, 1]);
      h.add(new THREE.TorusGeometry(0.31, 0.045, 8, 22), shadeHex(c, -0.08), [0, 0.38, 0.02], [Math.PI / 2 - 0.2, 0, 0]);
      h.add(sphere(0.075, 10, 8), 0xf2efe6, [0, 0.72, -0.07]);
    }
  }

  hurt() {
    this.hurtT = 0.3;
  }

  /** Smoothly turn towards a world-space heading (radians, 0 = +z). */
  faceTowards(angle: number, dt: number, rate = 12) {
    let d = angle - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * Math.min(1, dt * rate);
    this.root.rotation.y = this.facing;
  }

  update(dt: number, moveSpeed = 0) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * this.snap);
    const T = poseTargets(this.pose, this, dt, moveSpeed);
    const p = this.pose;
    void k;
    springTo(this.cur, this.vel, T, this.snap, dt);
    const c = this.cur;
    this.legL.rotation.x = c.legL;
    this.legR.rotation.x = c.legR;
    this.armL.rotation.x = c.armLx;
    this.armR.rotation.x = c.armRx;
    this.armL.rotation.z = c.armLz;
    this.armR.rotation.z = c.armRz;
    this.torso.rotation.set(c.lean, c.chestYaw - c.hipYaw, c.sway);
    this.body.position.y = c.bodyY;
    this.body.rotation.set(0, c.hipYaw * 0.6, c.bodyRoll);
    this.head.rotation.set(c.headX, c.headY, c.headZ);

    // face: blink, squint when hurt, round mouth when panicking
    this.blinkIn -= dt;
    let eyeY = 1;
    if (this.blinkIn < 0) {
      eyeY = 0.12;
      if (this.blinkIn < -0.12) this.blinkIn = 2 + Math.random() * 3.5;
    }
    if (this.hurtT > 0) { this.hurtT -= dt; eyeY = 0.25; }
    if (p === 'stun' || p === 'dance') eyeY = p === 'stun' ? 0.3 : 0.5;
    this.eyes.scale.y = eyeY;
    const round = p === 'panic' || p === 'stun' || this.hurtT > 0;
    this.mouth.scale.set(round ? 0.6 : 1, round ? 3.5 : 1, 1);

    this.stars.visible = p === 'stun';
    if (this.stars.visible) this.stars.rotation.y += dt * 5;
  }
}

export interface PoseTargets {
  legL: number; legR: number; armLx: number; armRx: number; armLz: number; armRz: number; lean: number; sway: number; bodyY: number; headX: number; headZ: number;
  /** the secondary channels (rigged models use all of them; the procedural Person some) */
  kneeL: number; kneeR: number; elbowL: number; elbowR: number; hipYaw: number; chestYaw: number; bodyRoll: number; headY: number;
}

/** a fresh, neutral set of targets */
// damped spring per channel
export function springTo(cur: PoseTargets, vel: PoseTargets, target: PoseTargets, snap: number, dt: number) {
  const c = cur as unknown as Record<string, number>, v = vel as unknown as Record<string, number>, g = target as unknown as Record<string, number>;
  const w = snap, z = 0.62;
  const h = Math.min(dt, 1 / 30);
  for (const k in g) {
    v[k] += (w * w * (g[k] - c[k]) - 2 * z * w * v[k]) * h;
    c[k] += v[k] * h;
  }
}

export const zeroTargets = (): PoseTargets => ({ legL: 0, legR: 0, armLx: 0, armRx: 0, armLz: 0, armRz: 0, lean: 0, sway: 0, bodyY: 0, headX: 0, headZ: 0, kneeL: 0, kneeR: 0, elbowL: 0, elbowR: 0, hipYaw: 0, chestYaw: 0, bodyRoll: 0, headY: 0 });

export const restTargets = (): PoseTargets => ({ legL: 0, legR: 0, armLx: 0, armRx: 0, armLz: 0.08, armRz: -0.08, lean: 0, sway: 0, bodyY: 0, headX: 0, headZ: 0, kneeL: 0, kneeR: 0, elbowL: 0, elbowR: 0, hipYaw: 0, chestYaw: 0, bodyRoll: 0, headY: 0 });

// secondary motion on top of a pose (bends, twist, bounce, breathing)
function addLife(T: PoseTargets, p: Pose, st: { t: number; phase: number }, moveSpeed: number) {
  const t = st.t;
  const bend = (b: number) => { T.legL -= b * 0.45; T.legR -= b * 0.45; T.kneeL += b; T.kneeR += b; T.bodyY -= 0.07 * b; };
  if (p === 'run' || p === 'panic' || p === 'laps' || p === 'walk') {
    const ph = p === 'walk' ? t * 11 : st.phase;
    const s = Math.sin(ph), c = Math.cos(ph);
    const amp = p === 'walk' ? 0.5 : Math.min(1, 0.45 + moveSpeed * 0.3);
    // knees fold as each leg swings through, elbows bent like a runner
    T.kneeL += (0.2 + Math.max(0, -c) * 1.15) * amp;
    T.kneeR += (0.2 + Math.max(0, c) * 1.15) * amp;
    T.elbowL = T.elbowR = p === 'panic' ? -0.3 : -0.55 - amp * 0.75;
    T.hipYaw = -s * 0.2 * amp;
    T.chestYaw = s * 0.28 * amp;
    T.bodyRoll = s * 0.05 * amp;
    T.lean += 0.06 * amp;
    T.headX -= T.lean * 0.55;
    T.headY = -T.chestYaw * 0.7;
  } else if (p === 'idle' || p === 'talk') {
    // breathing, shifting weight, glancing around
    T.lean += Math.sin(t * 1.9) * 0.018;
    T.bodyRoll = Math.sin(t * 0.55) * 0.035;
    T.hipYaw = Math.sin(t * 0.55) * 0.06;
    T.headY = Math.sin(t * 0.37) * 0.28 * (Math.sin(t * 0.11) > 0 ? 1 : 0.3);
    T.elbowL = -0.18; T.elbowR = p === 'talk' ? -1.0 + Math.sin(t * 5) * 0.25 : -0.18;
    bend(0.06);
  } else if (p === 'stance' || p === 'block') {
    // a boxer's bounce, side-on, guard up
    bend(0.42 + Math.sin(t * 7) * 0.08);
    T.bodyY += Math.abs(Math.sin(t * 7)) * 0.025;
    T.chestYaw = 0.32; T.hipYaw = 0.2;
    T.elbowL = T.elbowR = p === 'block' ? -2.0 : -1.75;
    T.headY = -0.25;
  } else if (p === 'punch') { T.chestYaw = -0.5; T.hipYaw = -0.18; T.elbowR = 0; T.elbowL = -1.6; bend(0.3); }
  else if (p === 'hook') { T.chestYaw = -0.85; T.hipYaw = -0.3; T.elbowR = -0.9; T.elbowL = -1.6; bend(0.3); }
  else if (p === 'uppercut') { T.chestYaw = -0.35; T.elbowR = -1.3; T.elbowL = -1.5; bend(0.55); }
  else if (p === 'kick' || p === 'spin') { T.hipYaw = 0.35; T.kneeL += 0.35; T.kneeR += 0.1; T.elbowL = T.elbowR = -1.3; T.bodyRoll = -0.08; }
  else if (p === 'sweep' || p === 'crouch') { bend(1.0); T.elbowL = T.elbowR = -1.3; T.chestYaw = 0.25; }
  else if (p === 'jump') { T.kneeL += 1.2; T.kneeR += 0.9; T.elbowL = T.elbowR = -0.9; }
  else if (p === 'airkick') { T.kneeL += 1.4; T.elbowL = T.elbowR = -1.0; T.hipYaw = 0.3; }
  else if (p === 'sit') { T.kneeL = T.kneeR = 1.45; T.elbowL = T.elbowR = -1.0; T.headY = Math.sin(t * 0.3) * 0.2; }
  else if (p === 'cheer') { T.elbowL = T.elbowR = -0.3; T.bodyRoll = Math.sin(t * 10) * 0.06; bend(0.15 + Math.max(0, Math.sin(t * 10)) * 0.2); }
  else if (p === 'dance') { T.hipYaw = Math.sin(t * 9) * 0.4; T.chestYaw = -Math.sin(t * 9) * 0.25; T.bodyRoll = Math.sin(t * 4.5) * 0.12; T.elbowL = T.elbowR = -1.2; bend(0.25 + Math.abs(Math.sin(t * 9)) * 0.25); }
  else if (p === 'throw' || p === 'special') { T.chestYaw = -0.45; T.hipYaw = -0.15; T.elbowR = -0.4; T.elbowL = -1.2; bend(0.2); }
  else if (p === 'hit') { T.chestYaw = 0.3; T.headX -= 0.25; T.elbowL = T.elbowR = -0.8; bend(0.25); }
  else if (p === 'stun') { T.bodyRoll = Math.sin(t * 5) * 0.1; T.headY = Math.sin(t * 3) * 0.3; T.elbowL = T.elbowR = -0.3; bend(0.2); }
  else if (p === 'throw' as Pose) { /* covered above */ }
}

// target limb angles for a pose, shared by Person and BoneRig
export function poseTargets(p: Pose, st: { t: number; phase: number }, dt: number, moveSpeed: number): PoseTargets {
  const T = restTargets();
  if (p === 'run' || p === 'panic' || p === 'laps') {
    st.phase += dt * (6 + moveSpeed * 3.2);
    const s = Math.sin(st.phase);
    T.legL = s * 0.85; T.legR = -s * 0.85;
    T.bodyY = Math.abs(Math.cos(st.phase)) * 0.06;
    T.lean = 0.18;
    if (p === 'panic') {
      T.armLx = -2.7 + s * 0.4; T.armRx = -2.7 - s * 0.4; T.armLz = 0.3; T.armRz = -0.3;
      T.headZ = Math.sin(st.t * 20) * 0.12;
    } else {
      T.armLx = -s * 0.75; T.armRx = s * 0.75;
    }
  } else if (p === 'sit') {
    T.legL = -1.45; T.legR = -1.45; T.bodyY = -0.24;
    T.armLx = -1.1; T.armRx = -1.1 + Math.sin(st.t * 9) * 0.15; T.lean = 0.12;
    T.headX = 0.15 + Math.sin(st.t * 1.3) * 0.05;
  } else if (p === 'dance') {
    const s = Math.sin(st.t * 9);
    T.bodyY = Math.abs(s) * 0.1;
    T.sway = s * 0.2;
    T.armLx = -2.6; T.armRx = -2.6; T.armLz = 0.4 + s * 0.4; T.armRz = -0.4 + s * 0.4;
    T.legL = Math.max(0, s) * 0.5; T.legR = Math.max(0, -s) * 0.5;
    T.headZ = s * 0.2;
  } else if (p === 'stun') {
    T.headZ = Math.sin(st.t * 6) * 0.25;
    T.sway = Math.sin(st.t * 6) * 0.1;
    T.armLz = 0.5; T.armRz = -0.5;
  } else if (p === 'cheer') {
    const s = Math.sin(st.t * 10);
    T.armLx = -3; T.armRx = -3; T.bodyY = Math.max(0, s) * 0.18;
  } else if (p === 'throw') {
    T.armRx = -2.6 + Math.sin(st.t * 7) * 1.6; T.lean = 0.1;
  } else if (p === 'talk') {
    T.armRx = -0.9 + Math.sin(st.t * 5) * 0.3; T.armRz = -0.3;
    T.headZ = Math.sin(st.t * 3) * 0.08;
  } else if (p === 'stance' || p === 'walk') {
    // fighting guard: fists up, feet apart, a little bounce
    const b = Math.sin(st.t * (p === 'walk' ? 11 : 5));
    T.legL = 0.35 + (p === 'walk' ? b * 0.35 : 0); T.legR = -0.3 - (p === 'walk' ? b * 0.35 : 0);
    T.armLx = -1.35; T.armRx = -1.05; T.armLz = 0.35; T.armRz = -0.25;
    T.lean = 0.16; T.bodyY = -0.04 + Math.abs(b) * 0.03;
  } else if (p === 'punch') {
    T.legL = 0.4; T.legR = -0.35;
    T.armRx = -1.7; T.armRz = 0.05; T.armLx = -1.25; T.armLz = 0.4;
    T.lean = 0.32; T.sway = -0.05;
  } else if (p === 'kick') {
    T.legR = -1.55; T.legL = 0.15;
    T.armLx = -0.6; T.armRx = 0.5; T.armLz = 0.6; T.armRz = -0.6;
    T.lean = -0.3; T.bodyY = 0.04;
  } else if (p === 'block') {
    T.legL = 0.3; T.legR = -0.3;
    T.armLx = -2.2; T.armRx = -2.2; T.armLz = -0.45; T.armRz = 0.45;
    T.lean = -0.08; T.bodyY = -0.08; T.headX = 0.25;
  } else if (p === 'hit') {
    T.legL = 0.2; T.legR = -0.4;
    T.armLx = 0.4; T.armRx = 0.3; T.armLz = 0.5; T.armRz = -0.5;
    T.lean = -0.4; T.headX = -0.35;
  } else if (p === 'hook') {
    // wide swing across the body
    T.legL = 0.45; T.legR = -0.35;
    T.armRx = -1.55; T.armRz = 0.9; T.armLx = -1.1; T.armLz = 0.45;
    T.lean = 0.25; T.sway = -0.25;
  } else if (p === 'spin') {
    // spinning back kick: leg out high, body twisted (the duel turns the root)
    T.legR = -1.75; T.legL = 0.2;
    T.armLx = -0.3; T.armRx = 0.6; T.armLz = 1.0; T.armRz = -1.0;
    T.lean = -0.45; T.bodyY = 0.06;
  } else if (p === 'crouch') {
    // low guard (the duel also squashes the root)
    T.legL = 0.75; T.legR = -0.7;
    T.armLx = -1.3; T.armRx = -1.1; T.armLz = 0.4; T.armRz = -0.3;
    T.lean = 0.4; T.bodyY = -0.06;
  } else if (p === 'sweep') {
    T.legR = -1.5; T.legL = 0.9;
    T.armLx = 0.3; T.armRx = 0.2; T.armLz = 1.1; T.armRz = -0.9;
    T.lean = 0.55; T.bodyY = -0.06;
  } else if (p === 'uppercut') {
    T.legL = 0.3; T.legR = -0.45;
    T.armRx = -2.85; T.armRz = 0.15; T.armLx = -1.0; T.armLz = 0.45;
    T.lean = -0.2; T.bodyY = 0.05; T.headX = -0.2;
  } else if (p === 'jump') {
    T.legL = -1.0; T.legR = 0.55;
    T.armLx = -1.6; T.armRx = -1.3; T.armLz = 0.6; T.armRz = -0.6;
    T.lean = 0.15; T.bodyY = 0.05;
  } else if (p === 'airkick') {
    T.legR = -1.45; T.legL = 0.95;
    T.armLx = -0.8; T.armRx = 0.6; T.armLz = 0.9; T.armRz = -0.9;
    T.lean = -0.35;
  } else if (p === 'special') {
    T.legL = 0.5; T.legR = -0.4;
    T.armRx = -2.9; T.armLx = -1.5; T.armLz = 0.5;
    T.lean = -0.15;
  } else {
    T.bodyY = Math.sin(st.t * 2.2) * 0.012;
    T.armLz = 0.1 + Math.sin(st.t * 2.2) * 0.03; T.armRz = -T.armLz;
  }
  addLife(T, p, st, moveSpeed);
  return T;
}
