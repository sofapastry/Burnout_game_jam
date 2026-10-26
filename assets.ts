import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Person, poseTargets, springTo, restTargets, zeroTargets, type Pose } from './hero/person';
import { PLACEHOLDER_LOOKS } from './hero/look';
import { toon, outlineMaterial } from './render/toon';

// Characters: drop `public/models/<name>.glb` (Meshy export, optimised per GDD §16) and it's used
// automatically; otherwise a procedural placeholder in the same toon style stands in.

export interface Rig {
  root: THREE.Object3D;
  pose: Pose;
  update(dt: number, moveSpeed?: number): void;
  faceTowards(angle: number, dt: number, rate?: number): void;
  hurt(): void;
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const gltfs = new Map<string, GLTF | null>();

export const CHARACTER_NAMES = ['nina', 'pasha', 'artem', 'shady', 'sonya', 'romchik', 'masha', 'grisha'];

async function tryLoad(name: string): Promise<GLTF | null> {
  try {
    const res = await fetch(`models/${name}.glb`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    // Vite answers unknown paths with index.html; only accept real binary glTF.
    if (buf.byteLength < 12 || new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== 'glTF') return null;
    return await loader.parseAsync(buf, 'models/');
  } catch (e) {
    console.warn(`[assets] ${name}.glb failed to load, using placeholder`, e);
    return null;
  }
}

export async function preloadCharacters() {
  await Promise.all(CHARACTER_NAMES.map(async (n) => gltfs.set(n, await tryLoad(n))));
  const found = CHARACTER_NAMES.filter((n) => gltfs.get(n));
  console.info(`[assets] character GLBs: ${found.length ? found.join(', ') : 'none yet (placeholders)'}`);
}

/** tests: register a model parsed outside the browser */
export function registerCharacter(name: string, gltf: GLTF) { gltfs.set(name, gltf); }

export function makeCharacter(name: string): Rig {
  const gltf = gltfs.get(name);
  // models rigged by tools/autorig.py (hips/spine/head/arms/legs) move with the procedural poses
  if (gltf && hasAutoRig(gltf)) return new BoneRig(gltf);
  if (gltf) return new GlbRig(gltf);
  return new Person(PLACEHOLDER_LOOKS[name] ?? PLACEHOLDER_LOOKS.artem);
}

const CLIP_KEYS: Record<Pose, string[]> = {
  idle: ['idle', 'stand', 'breath'],
  run: ['run', 'jog', 'walk'],
  laps: ['run', 'jog'],
  panic: ['run', 'jog'],
  sit: ['sit'],
  dance: ['dance', 'hip', 'samba'],
  stun: ['dizzy', 'hit', 'stun', 'idle'],
  cheer: ['cheer', 'victory', 'jump', 'wave'],
  throw: ['throw', 'attack', 'punch'],
  talk: ['talk', 'wave', 'idle'],
  // duel poses run on the procedural stand-ins; GLBs fall back to these clips if asked
  stance: ['idle', 'fight'], walk: ['walk', 'run'], punch: ['punch', 'attack'], kick: ['kick', 'attack'],
  block: ['block', 'idle'], hit: ['hit', 'idle'], special: ['throw', 'attack'],
  crouch: ['crouch', 'idle'], sweep: ['kick', 'attack'], uppercut: ['punch', 'attack'], jump: ['jump', 'idle'],
  airkick: ['kick', 'jump'], hook: ['punch', 'attack'], spin: ['kick', 'attack'],
};

/** the 11-bone skeleton tools/autorig.py builds (names lose their dots in three.js) */
const boneKey = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');
function hasAutoRig(gltf: GLTF) {
  let n = 0;
  gltf.scene.traverse((o) => { if ((o as THREE.Bone).isBone && ['hips', 'spine', 'head', 'upperarml', 'thighl'].includes(boneKey(o.name))) n++; });
  return n >= 5;
}

/** Toon materials + inverted-hull outlines on every mesh of a model (skinned or not). */
function toonify(model: THREE.Object3D) {
  const outlines: [THREE.Object3D, THREE.Mesh][] = [];
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const mat = toon(src.color ?? 0xffffff, { map: src.map ?? null });
    if (src.map) mat.color.set(0xffffff);
    m.material = mat;
    m.castShadow = true;
    m.frustumCulled = false; // skinned bounds don't follow the pose
    let o2: THREE.Mesh;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
      const sm = m as THREE.SkinnedMesh;
      const os = new THREE.SkinnedMesh(sm.geometry, outlineMaterial(0.012));
      os.bind(sm.skeleton, sm.bindMatrix);
      o2 = os;
    } else {
      o2 = new THREE.Mesh(m.geometry, outlineMaterial(0.012));
    }
    o2.frustumCulled = false;
    o2.position.copy(m.position); o2.quaternion.copy(m.quaternion); o2.scale.copy(m.scale);
    outlines.push([m.parent!, o2]);
  });
  for (const [parent, o] of outlines) parent.add(o);
}

/** Character height in the world (Kirill, the procedural Person, is about 1.6). */
const MODEL_HEIGHT = 1.75;
/** the procedural Person's units → this model's (bodyY offsets) */
const PERSON_SCALE = MODEL_HEIGHT / 1.6;
/** T-pose arms (straight out) brought down to the Person's rest (hanging) */
const ARM_DOWN = 1.3;

interface Joint { bone: THREE.Bone; rest: THREE.Quaternion; model: THREE.Quaternion; modelInv: THREE.Quaternion }

/**
 * GLB character driven bone by bone from the same poseTargets as Person.
 * Model-space rotation D is applied as rest · (M⁻¹ · D · M), M = bone rest orientation.
 */
export class BoneRig implements Rig {
  root = new THREE.Group();
  pose: Pose = 'idle';
  facing = 0;
  /** how fast limbs reach their target pose (duels raise it so strikes snap) */
  snap = 14;
  stars = new THREE.Group();
  /** the spine bone (things attached to the torso ride on it) */
  torso: THREE.Object3D;
  t = Math.random() * 10;
  phase = 0;
  private model: THREE.Object3D;
  private baseY = 0;
  private hurtT = 0;
  private joints = new Map<string, Joint>();
  private cur = restTargets();
  private vel = zeroTargets();
  /** how fast it's turning (rad/s), smoothed: the body leans into turns */
  private turn = 0;
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  constructor(gltf: GLTF) {
    this.model = skeletonClone(gltf.scene);
    toonify(this.model);
    this.model.updateMatrixWorld(true);
    // record each joint's rest orientation in model space; arms and legs get their side from x
    // (Person's "L" limbs are on the −x side)
    const inv = this.model.getWorldQuaternion(new THREE.Quaternion()).invert();
    const pos = new THREE.Vector3();
    this.model.traverse((o) => {
      const b = o as THREE.Bone;
      if (!b.isBone) return;
      let key = boneKey(b.name);
      if (/^(upperarm|forearm|thigh|shin)[lr]$/.test(key)) {
        this.model.worldToLocal(b.getWorldPosition(pos));
        key = key.slice(0, -1) + (pos.x < 0 ? 'L' : 'R');
      }
      const model = inv.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion()));
      this.joints.set(key, { bone: b, rest: b.quaternion.clone(), model, modelInv: model.clone().invert() });
    });
    this.torso = this.joints.get('spine')?.bone ?? this.model;
    // a slightly bigger head reads better from the top-down camera (GDD §13)
    this.joints.get('head')?.bone.scale.setScalar(1.15);
    this.apply();
    this.model.updateMatrixWorld(true);
    // normalise height, feet on the floor
    const bb = new THREE.Box3().setFromObject(this.model, true);
    const s = MODEL_HEIGHT / Math.max(0.01, bb.max.y - bb.min.y);
    this.model.scale.multiplyScalar(s);
    this.model.updateMatrixWorld(true);
    bb.setFromObject(this.model, true);
    this.model.position.y -= bb.min.y;
    this.baseY = this.model.position.y;
    this.root.add(this.model);
  }

  /** rotate a joint by a model-space rotation given as x/z angles (Euler XYZ, like Person's groups) */
  private set(key: string, x: number, z: number, extraZ = 0, y = 0) {
    const j = this.joints.get(key);
    if (!j) return;
    this.q.setFromEuler(this.e.set(x, y, z, 'YXZ'));
    if (extraZ) this.q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), extraZ));
    j.bone.quaternion.copy(j.rest).multiply(j.modelInv.clone().multiply(this.q).multiply(j.model));
  }

  private apply() {
    const c = this.cur;
    // hips sway and twist with the stride and lean into turns; the chest counter-twists
    this.set('hips', 0, c.bodyRoll + clampN(-this.turn * 0.045, 0.22), 0, c.hipYaw);
    this.set('spine', c.lean, c.sway, 0, c.chestYaw - c.hipYaw);
    this.set('head', c.headX, c.headZ, 0, c.headY);
    this.set('upperarmL', c.armLx, c.armLz, ARM_DOWN);
    this.set('upperarmR', c.armRx, c.armRz, -ARM_DOWN);
    // elbows: in the T-pose rest frame a forearm lies along x, so bending forward is a turn
    // about the vertical axis (opposite ways for the two sides); about x it would only twist
    this.set('forearmL', 0, 0, 0, -c.elbowL);
    this.set('forearmR', 0, 0, 0, c.elbowR);
    this.set('thighL', c.legL, 0);
    this.set('thighR', c.legR, 0);
    this.set('shinL', c.kneeL, 0);
    this.set('shinR', c.kneeR, 0);
  }

  update(dt: number, moveSpeed = 0) {
    this.t += dt;
    const T = poseTargets(this.pose, this, dt, moveSpeed);
    springTo(this.cur, this.vel, T, this.snap, dt);
    // turning speed from the root's heading (whoever set it), for leaning into turns
    const yaw = this.root.rotation.y;
    let dy = yaw - this.lastYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.lastYaw = yaw;
    this.turn += ((dt > 0 ? dy / dt : 0) * Math.min(1, moveSpeed) - this.turn) * Math.min(1, dt * 8);
    this.apply();
    let rz = 0;
    if (this.hurtT > 0) { this.hurtT -= dt; rz = Math.sin(this.t * 60) * 0.06; }
    this.model.position.y = this.baseY + this.cur.bodyY * PERSON_SCALE;
    this.model.rotation.z = rz;
  }

  faceTowards(angle: number, dt: number, rate = 12) {
    let d = angle - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * Math.min(1, dt * rate);
    this.root.rotation.y = this.facing;
  }

  hurt() { this.hurtT = 0.25; }
  private lastYaw = 0;
}

const clampN = (v: number, m: number) => Math.max(-m, Math.min(m, v));

class GlbRig implements Rig {
  root = new THREE.Group();
  pose: Pose = 'idle';
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private facing = 0;
  private t = Math.random() * 10;
  private model: THREE.Object3D;
  private baseY = 0;
  private hurtT = 0;

  constructor(gltf: GLTF) {
    this.model = skeletonClone(gltf.scene);
    // toon materials + inverted-hull outlines
    const outlines: [THREE.Object3D, THREE.Mesh][] = [];
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
      const mat = toon(src.color ?? 0xffffff, { map: src.map ?? null });
      if (src.map) mat.color.set(0xffffff);
      m.material = mat;
      m.castShadow = true;
      let o2: THREE.Mesh;
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = m as THREE.SkinnedMesh;
        const os = new THREE.SkinnedMesh(sm.geometry, outlineMaterial(0.012));
        os.bind(sm.skeleton, sm.bindMatrix);
        o2 = os;
      } else {
        o2 = new THREE.Mesh(m.geometry, outlineMaterial(0.012));
      }
      o2.position.copy(m.position); o2.quaternion.copy(m.quaternion); o2.scale.copy(m.scale);
      outlines.push([m.parent!, o2]);
    });
    for (const [parent, o] of outlines) parent.add(o);
    // readable from the top-down camera: head bone ×1.25 (GDD §13)
    this.model.traverse((o) => {
      if ((o as THREE.Bone).isBone && /head/i.test(o.name) && !/end|top/i.test(o.name)) o.scale.multiplyScalar(1.25);
    });
    // normalise height to ~1.9 units, feet on the floor
    const bb = new THREE.Box3().setFromObject(this.model);
    const size = bb.getSize(new THREE.Vector3());
    const s = 1.9 / Math.max(0.01, size.y);
    this.model.scale.multiplyScalar(s);
    bb.setFromObject(this.model);
    this.model.position.y -= bb.min.y;
    this.baseY = this.model.position.y;
    this.root.add(this.model);

    if (gltf.animations.length) {
      this.mixer = new THREE.AnimationMixer(this.model);
      for (const clip of gltf.animations) this.actions.set(clip.name.toLowerCase(), this.mixer.clipAction(clip));
    }
  }

  private clipFor(p: Pose) {
    for (const key of CLIP_KEYS[p]) for (const [name, a] of this.actions) if (name.includes(key)) return a;
    return this.actions.values().next().value ?? null;
  }

  update(dt: number, moveSpeed = 0) {
    this.t += dt;
    if (this.mixer) {
      const want = this.clipFor(this.pose);
      if (want && want !== this.current) {
        want.reset().fadeIn(0.2).play();
        this.current?.fadeOut(0.2);
        this.current = want;
      }
      if (this.current && (this.pose === 'run' || this.pose === 'laps' || this.pose === 'panic')) this.current.timeScale = 0.6 + moveSpeed * 0.25;
      this.mixer.update(dt);
    }
    // procedural flavour on top (or instead, if the GLB has no clips)
    let y = this.baseY, rz = 0;
    if (this.pose === 'dance') { y += Math.abs(Math.sin(this.t * 9)) * 0.12; rz = Math.sin(this.t * 9) * 0.12; }
    else if (this.pose === 'stun') rz = Math.sin(this.t * 6) * 0.1;
    else if (!this.mixer && (this.pose === 'run' || this.pose === 'laps' || this.pose === 'panic')) y += Math.abs(Math.sin(this.t * 12)) * 0.08;
    if (this.hurtT > 0) { this.hurtT -= dt; rz += Math.sin(this.t * 60) * 0.06; }
    this.model.position.y = y;
    this.model.rotation.z = rz;
  }

  faceTowards(angle: number, dt: number, rate = 12) {
    let d = angle - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * Math.min(1, dt * rate);
    this.root.rotation.y = this.facing;
  }

  hurt() { this.hurtT = 0.25; }
}
