import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TeapotGeometry } from 'three/examples/jsm/geometries/TeapotGeometry.js';
import { toon } from '../render/toon';
import * as T from '../render/textures';

// Units are unrigged props with faces (GDD §6): each is a few primitives baked into one
// geometry per material, drawn with InstancedMesh, and animated in code.

export type UnitKind =
  | 'quiz' | 'deadline' | 'partner' | 'guard' | 'medBall' | 'volley' | 'drawing' | 'gost'
  | 'leafPile' | 'maple' | 'envelope' | 'receipt' | 'task' | 'starTask' | 'queue' | 'senior'
  | 'car' | 'towTruck' | 'fuse' | 'roach' | 'secretary' | 'teacup' | 'speaker' | 'applause'
  | 'absence' | 'register' | 'olivier' | 'tangerine' | 'garland' | 'credit' | 'cgCredit' | 'fan';

export const UNIT_KINDS: UnitKind[] = [
  'quiz', 'deadline', 'partner', 'guard', 'medBall', 'volley', 'drawing', 'gost',
  'leafPile', 'maple', 'envelope', 'receipt', 'task', 'starTask', 'queue', 'senior',
  'car', 'towTruck', 'fuse', 'roach', 'secretary', 'teacup', 'speaker', 'applause',
  'absence', 'register', 'olivier', 'tangerine', 'garland', 'credit', 'cgCredit', 'fan',
];

export interface UnitModel {
  parts: { geom: THREE.BufferGeometry; mat: THREE.Material }[];
  outline: THREE.BufferGeometry;
  /** don't yaw toward movement; keep the face toward the camera */
  faceCamera: boolean;
  roll: boolean;
  /** rolling models are built around their centre; this lifts them so they sit on the floor */
  lift: number;
}

type V3 = [number, number, number];
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();

class ModelBuilder {
  private byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private outl: THREE.BufferGeometry[] = [];
  constructor(private pre: THREE.Matrix4 = new THREE.Matrix4()) {}
  add(geom: THREE.BufferGeometry, mat: THREE.Material, pos: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], outline = true) {
    m4.compose(new THREE.Vector3(...pos), q.setFromEuler(e.set(...rot)), new THREE.Vector3(...scale)).premultiply(this.pre);
    let g = geom.clone().applyMatrix4(m4);
    if (g.index) g = g.toNonIndexed();
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat)!.push(g);
    if (outline) this.outl.push(g);
    return this;
  }
  done(faceCamera: boolean, roll = false, lift = 0): UnitModel {
    return {
      parts: [...this.byMat].map(([mat, gs]) => ({ geom: mergeGeometries(gs), mat })),
      outline: mergeGeometries(this.outl),
      faceCamera,
      roll,
      lift,
    };
  }
}

const black = () => toon(0x1d1613);
const white = () => toon(0xffffff);

function eyes(b: ModelBuilder, y: number, z: number, spread = 0.09, size = 0.05, tiltX = 0) {
  for (const x of [-spread, spread]) {
    b.add(new THREE.SphereGeometry(size, 10, 8), black(), [x, y, z], [tiltX, 0, 0], [1, 1.3, 0.5], false);
    b.add(new THREE.SphereGeometry(size * 0.35, 6, 5), white(), [x - size * 0.3, y + size * 0.45, z + size * 0.3], [0, 0, 0], [1, 1, 1], false);
  }
}

export function buildUnitModel(kind: UnitKind): UnitModel {
  switch (kind) {
    case 'quiz': {
      // a sheet leaning back toward the camera, with eyes
      const tilt = new THREE.Matrix4().makeRotationX(-0.95);
      const b = new ModelBuilder(new THREE.Matrix4().makeTranslation(0, 0.45, 0).multiply(tilt));
      b.add(new THREE.BoxGeometry(0.52, 0.66, 0.025), toon(0xffffff, { map: T.quizTex() }), [0, 0, 0]);
      b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.52, 8), toon(0xeeeae0), [0, 0.33, 0.01], [0, 0, Math.PI / 2]);
      eyes(b, 0.08, 0.02, 0.1, 0.055);
      return b.done(true);
    }
    case 'drawing': {
      const b = new ModelBuilder();
      b.add(new THREE.BoxGeometry(1.1, 0.025, 0.78), toon(0xffffff, { map: T.drawingTex() }), [0, 0.12, 0]);
      b.add(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 10), toon(0xf2efe6), [0, 0.18, -0.39], [0, 0, Math.PI / 2]);
      eyes(b, 0.2, 0.05, 0.12, 0.06, -Math.PI / 2);
      return b.done(false);
    }
    case 'deadline': {
      // red alarm clock showing 23:59, face tilted toward the camera
      const b = new ModelBuilder(new THREE.Matrix4().makeTranslation(0, 0.42, 0).multiply(new THREE.Matrix4().makeRotationX(0.95)));
      b.add(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 24), toon(0xd8382a), [0, 0, 0]);
      b.add(new THREE.CylinderGeometry(0.29, 0.29, 0.02, 24), toon(0xffffff, { map: T.clockFaceTex() }), [0, 0.105, 0], [0, -Math.PI / 2, 0]);
      for (const x of [-0.2, 0.2]) {
        b.add(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xe8c547), [x, 0, -0.32], [-1.2, 0, x * 1.5]);
        b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 6), toon(0x3b3f47), [x * 1.2, -0.05, 0.3], [0.3, 0, 0]);
      }
      b.add(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), toon(0x3b3f47), [0, 0, -0.42], [Math.PI / 2, 0, 0]);
      eyes(b, 0.12, -0.12, 0.1, 0.045, -Math.PI / 2);
      return b.done(true);
    }
    case 'partner': {
      const b = new ModelBuilder();
      const slime = toon(0x8bc34a);
      b.add(new THREE.SphereGeometry(0.4, 18, 14), slime, [0, 0.33, 0], [0, 0, 0], [1, 0.82, 1]);
      b.add(new THREE.SphereGeometry(0.11, 10, 8), slime, [-0.38, 0.25, 0.1]);
      b.add(new THREE.SphereGeometry(0.11, 10, 8), slime, [0.38, 0.25, 0.1]);
      b.add(new THREE.BoxGeometry(0.28, 0.02, 0.36), toon(0xf6f3ea), [0.42, 0.34, 0.16], [0.4, 0.3, 0.2]);
      eyes(b, 0.5, 0.32, 0.12, 0.06);
      b.add(new THREE.BoxGeometry(0.14, 0.03, 0.02), black(), [0, 0.36, 0.38], [0, 0, 0], [1, 1, 1], false);
      return b.done(false);
    }
    case 'guard': {
      const b = new ModelBuilder();
      const navy = toon(0x2b3550);
      b.add(new THREE.CylinderGeometry(0.3, 0.34, 0.85, 14), navy, [0, 0.43, 0]);
      b.add(new THREE.SphereGeometry(0.27, 16, 12), toon(0xf0c6a4), [0, 1.08, 0]);
      b.add(new THREE.CylinderGeometry(0.27, 0.27, 0.14, 16), navy, [0, 1.3, 0]);
      b.add(new THREE.BoxGeometry(0.3, 0.03, 0.18), toon(0x1d2233), [0, 1.25, 0.26], [0.2, 0, 0]);
      b.add(new THREE.BoxGeometry(0.1, 0.07, 0.02), toon(0xd8b84a), [0, 1.33, 0.27]);
      b.add(new THREE.BoxGeometry(0.08, 0.1, 0.02), toon(0xd8b84a), [0.14, 0.62, 0.3]);
      b.add(new THREE.CapsuleGeometry(0.08, 0.35, 4, 8), navy, [-0.36, 0.55, 0.05], [0, 0, 0.2]);
      b.add(new THREE.CapsuleGeometry(0.08, 0.35, 4, 8), navy, [0.36, 0.55, 0.05], [0, 0, -0.2]);
      b.add(new THREE.BoxGeometry(0.16, 0.035, 0.02), toon(0x5a3a2a), [0, 1.12, 0.26], [0, 0, 0], [1, 1, 1], false);
      eyes(b, 1.1, 0.24, 0.09, 0.042);
      return b.done(false);
    }
    case 'gost': {
      const b = new ModelBuilder();
      const grey = toon(0x6b6f78);
      b.add(new THREE.CylinderGeometry(0.28, 0.32, 0.95, 14), grey, [0, 0.48, 0]);
      b.add(new THREE.BoxGeometry(0.08, 0.5, 0.02), toon(0x8a2a2a), [0, 0.7, 0.29]);
      b.add(new THREE.SphereGeometry(0.26, 16, 12), toon(0xe8c0a0), [0, 1.18, 0]);
      b.add(new THREE.SphereGeometry(0.27, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), toon(0xb0b4bc), [0, 1.2, -0.02], [-0.3, 0, 0]);
      for (const x of [-0.09, 0.09]) b.add(new THREE.TorusGeometry(0.06, 0.012, 6, 14), black(), [x, 1.2, 0.25], [0, 0, 0], [1, 1, 1], false);
      b.add(new THREE.BoxGeometry(0.16, 0.2, 0.16), toon(0xc0392b), [0.4, 0.75, 0.15]);
      b.add(new THREE.BoxGeometry(0.06, 0.6, 0.02), toon(0xe8c547), [-0.38, 0.7, 0.18], [0.3, 0, 0.2]);
      eyes(b, 1.2, 0.235, 0.09, 0.03);
      return b.done(false);
    }
    case 'medBall': {
      // built around its centre so it rolls in place (the renderer lifts it onto the floor)
      const b = new ModelBuilder();
      b.add(new THREE.SphereGeometry(0.4, 20, 16), toon(0x7a4a2a), [0, 0, 0]);
      b.add(new THREE.TorusGeometry(0.405, 0.03, 6, 28), toon(0x4e2e1a), [0, 0, 0], [0, Math.PI / 2, 0], [1, 1, 1], false);
      b.add(new THREE.TorusGeometry(0.405, 0.03, 6, 28), toon(0x4e2e1a), [0, 0, 0], [Math.PI / 2, 0, 0], [1, 1, 1], false);
      return b.done(false, true, 0.4);
    }
    case 'volley': {
      const b = new ModelBuilder();
      b.add(new THREE.SphereGeometry(0.26, 18, 14), toon(0xf2d64a), [0, 0, 0]);
      b.add(new THREE.TorusGeometry(0.265, 0.025, 6, 24), toon(0x2c63b8), [0, 0, 0], [0, 0.6, 0], [1, 1, 1], false);
      b.add(new THREE.TorusGeometry(0.265, 0.025, 6, 24), toon(0x2c63b8), [0, 0, 0], [Math.PI / 2, 0, 0.6], [1, 1, 1], false);
      return b.done(false, true, 0.28);
    }

    // ---------------------------------------------------------------- weeks 4–15
    case 'leafPile': {
      const b = new ModelBuilder();
      const cols = [0xd9a63a, 0xd8743a, 0xc9502a, 0xe8c547];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        b.add(new THREE.SphereGeometry(0.24, 8, 6), toon(cols[i % 4]), [Math.cos(a) * 0.2, 0.18 + (i % 2) * 0.08, Math.sin(a) * 0.2], [0, 0, 0], [1, 0.45, 1]);
      }
      b.add(new THREE.SphereGeometry(0.26, 10, 8), toon(0xd8743a), [0, 0.3, 0], [0, 0, 0], [1, 0.6, 1]);
      eyes(b, 0.42, 0.2, 0.09, 0.045);
      return b.done(false);
    }
    case 'maple': {
      const b = new ModelBuilder();
      b.add(new THREE.CylinderGeometry(0.16, 0.22, 1.6, 8), toon(0x6e4a2a), [0, 0.8, 0]);
      for (const [x, y, z, r, c] of [[0, 2.0, 0, 0.75, 0xd8432a], [-0.45, 1.75, 0.1, 0.5, 0xe8743a], [0.45, 1.8, -0.05, 0.5, 0xc9302a], [0, 2.45, 0, 0.45, 0xe89a3a]] as const)
        b.add(new THREE.SphereGeometry(r, 10, 8), toon(c), [x, y, z]);
      eyes(b, 1.0, 0.18, 0.08, 0.05);
      return b.done(false);
    }
    case 'envelope': {
      const tilt = new THREE.Matrix4().makeRotationX(-0.9);
      const b = new ModelBuilder(new THREE.Matrix4().makeTranslation(0, 0.42, 0).multiply(tilt));
      b.add(new THREE.BoxGeometry(0.62, 0.42, 0.04), toon(0xf4efe2), [0, 0, 0]);
      b.add(new THREE.ConeGeometry(0.31, 0.2, 3), toon(0xe6dcc6), [0, 0.12, 0.03], [Math.PI / 2, Math.PI, 0], [1, 1, 0.15]);
      b.add(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12), toon(0xc0392b), [0, -0.02, 0.035], [Math.PI / 2, 0, 0]);
      eyes(b, 0.08, 0.035, 0.12, 0.045);
      return b.done(true);
    }
    case 'receipt': {
      const tilt = new THREE.Matrix4().makeRotationX(-0.8);
      const b = new ModelBuilder(new THREE.Matrix4().makeTranslation(0, 0.4, 0).multiply(tilt));
      b.add(new THREE.BoxGeometry(0.26, 0.62, 0.015), toon(0xffffff, { map: T.receiptTex('ЧЕК') }), [0, 0, 0]);
      b.add(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 8), toon(0xf2efe6), [0, -0.31, 0.03], [0, 0, Math.PI / 2]);
      eyes(b, 0.15, 0.015, 0.06, 0.035);
      return b.done(true);
    }
    case 'task':
    case 'starTask': {
      const tilt = new THREE.Matrix4().makeRotationX(-0.95);
      const b = new ModelBuilder(new THREE.Matrix4().makeTranslation(0, 0.45, 0).multiply(tilt));
      b.add(new THREE.BoxGeometry(0.5, 0.64, 0.025), toon(0xffffff, { map: T.taskTex(kind === 'starTask') }), [0, 0, 0]);
      if (kind === 'starTask') b.add(new THREE.OctahedronGeometry(0.13), toon(0xffd84a, { emissive: 0x806010 }), [0, 0.42, 0.02]);
      eyes(b, 0.06, 0.02, 0.1, 0.05);
      return b.done(true);
    }
    case 'queue': {
      // four students in a line along x — the Queue blocks a path (Week 7)
      const b = new ModelBuilder();
      const shirts = [0x2b3f6b, 0x8a3a3a, 0x3a6a4a, 0x6a4a8a];
      for (let i = 0; i < 4; i++) {
        const x = -1.2 + i * 0.8;
        b.add(new THREE.CylinderGeometry(0.24, 0.28, 0.9, 10), toon(shirts[i]), [x, 0.6, 0]);
        b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 6), toon(0x2f3d5c), [x - 0.08, 0.15, 0]);
        b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 6), toon(0x2f3d5c), [x + 0.08, 0.15, 0]);
        b.add(new THREE.SphereGeometry(0.22, 12, 10), toon(0xf0c6a4), [x, 1.25, 0]);
        b.add(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), toon([0x2a211d, 0x6b4630, 0xc9a46a, 0x4a3326][i]), [x, 1.28, -0.02], [-0.3, 0, 0]);
        b.add(new THREE.BoxGeometry(0.35, 0.04, 0.25), toon(0x9aa0a8), [x, 0.95, 0.24]);
      }
      return b.done(true);
    }
    case 'senior': {
      const b = new ModelBuilder();
      b.add(new THREE.CylinderGeometry(0.34, 0.4, 1.0, 12), toon(0x5a4a3a), [0, 0.6, 0]);
      b.add(new THREE.SphereGeometry(0.3, 14, 12), toon(0xe8b893), [0, 1.35, 0]);
      b.add(new THREE.SphereGeometry(0.31, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), toon(0x2a211d), [0, 1.38, -0.02], [-0.3, 0, 0]);
      b.add(new THREE.SphereGeometry(0.17, 10, 8), toon(0x3a2a20), [0, 1.18, 0.2], [0, 0, 0], [1.2, 0.8, 0.6]);
      b.add(new THREE.BoxGeometry(0.6, 0.04, 0.4), toon(0x9aa0a8), [0, 0.95, 0.38]);
      b.add(new THREE.CylinderGeometry(0.14, 0.12, 0.08, 12), toon(0xf2efe6), [0, 1.0, 0.38]);
      eyes(b, 1.42, 0.27, 0.1, 0.04);
      return b.done(false);
    }
    case 'car': {
      const b = new ModelBuilder();
      b.add(new THREE.BoxGeometry(1.8, 0.6, 3.9), toon(0xc0392b), [0, 0.55, 0]);
      b.add(new THREE.BoxGeometry(1.6, 0.55, 2.0), toon(0xc0392b), [0, 1.1, -0.2]);
      b.add(new THREE.BoxGeometry(1.62, 0.4, 1.9), toon(0x9fc6e6), [0, 1.12, -0.2], [0, 0, 0], [1, 1, 1], false);
      for (const [x, z] of [[-0.85, 1.2], [0.85, 1.2], [-0.85, -1.3], [0.85, -1.3]])
        b.add(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12), toon(0x1d1d22), [x, 0.34, z], [0, 0, Math.PI / 2]);
      eyes(b, 0.62, 1.96, 0.55, 0.12);
      return b.done(false);
    }
    case 'towTruck': {
      const b = new ModelBuilder();
      b.add(new THREE.BoxGeometry(1.9, 1.2, 1.6), toon(0xe8a23a), [0, 0.95, 1.4]);
      b.add(new THREE.BoxGeometry(1.7, 0.5, 1.5), toon(0x9fc6e6), [0, 1.25, 1.55], [0, 0, 0], [1, 1, 1], false);
      b.add(new THREE.BoxGeometry(1.9, 0.4, 2.6), toon(0x3b3f47), [0, 0.6, -0.7]);
      b.add(new THREE.BoxGeometry(0.15, 1.4, 0.15), toon(0x3b3f47), [0, 1.3, -1.6], [0.5, 0, 0]);
      b.add(new THREE.BoxGeometry(1.2, 0.12, 0.25), toon(0xff5a2a, { emissive: 0x802010 }), [0, 1.62, 1.4]);
      for (const [x, z] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.2], [0.9, -1.2]])
        b.add(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12), toon(0x1d1d22), [x, 0.38, z], [0, 0, Math.PI / 2]);
      eyes(b, 1.0, 2.22, 0.5, 0.12);
      return b.done(false);
    }
    case 'fuse': {
      const b = new ModelBuilder();
      b.add(new THREE.BoxGeometry(0.7, 0.9, 0.35), toon(0x8a8f99), [0, 0.6, 0]);
      b.add(new THREE.BoxGeometry(0.6, 0.8, 0.02), toon(0x6a6f78), [0, 0.6, 0.18]);
      b.add(new THREE.ConeGeometry(0.12, 0.35, 3), toon(0xffd84a, { emissive: 0x806010 }), [0, 0.6, 0.2], [0, 0, 0.4], [1, 1, 0.2]);
      b.add(new THREE.SphereGeometry(0.06, 8, 6), toon(0xff3a2a, { emissive: 0xa01010 }), [0.22, 0.95, 0.2]);
      b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), toon(0x22252b), [0, 0.15, 0]);
      eyes(b, 0.82, 0.2, 0.12, 0.045);
      return b.done(false);
    }
    case 'roach': {
      const b = new ModelBuilder();
      b.add(new THREE.SphereGeometry(0.16, 10, 8), toon(0x4a2a1a), [0, 0.1, 0], [0, 0, 0], [0.75, 0.45, 1.25]);
      b.add(new THREE.SphereGeometry(0.08, 8, 6), toon(0x2a1a10), [0, 0.1, 0.2]);
      for (const z of [-0.08, 0.02, 0.12]) for (const s of [-1, 1])
        b.add(new THREE.BoxGeometry(0.22, 0.015, 0.015), toon(0x2a1a10), [s * 0.14, 0.05, z], [0, 0, s * 0.4], [1, 1, 1], false);
      b.add(new THREE.BoxGeometry(0.01, 0.01, 0.25), toon(0x2a1a10), [-0.04, 0.14, 0.32], [0.4, 0.3, 0], [1, 1, 1], false);
      b.add(new THREE.BoxGeometry(0.01, 0.01, 0.25), toon(0x2a1a10), [0.04, 0.14, 0.32], [0.4, -0.3, 0], [1, 1, 1], false);
      return b.done(false);
    }
    case 'secretary': {
      const b = new ModelBuilder();
      b.add(new THREE.CylinderGeometry(0.3, 0.34, 0.95, 12), toon(0x7a3b5a), [0, 0.6, 0]);
      b.add(new THREE.SphereGeometry(0.27, 14, 12), toon(0xf0c6a4), [0, 1.3, 0]);
      b.add(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), toon(0x8a5a3a), [0, 1.33, -0.02], [-0.3, 0, 0]);
      b.add(new THREE.SphereGeometry(0.13, 10, 8), toon(0x8a5a3a), [0, 1.55, -0.2]);
      for (const x of [-0.09, 0.09]) b.add(new THREE.TorusGeometry(0.06, 0.012, 6, 14), toon(0x7a2a2a), [x, 1.32, 0.26], [0, 0, 0], [1, 1, 1], false);
      eyes(b, 1.32, 0.245, 0.09, 0.032);
      return b.done(false);
    }
    case 'teacup': {
      const b = new ModelBuilder();
      b.add(new THREE.CylinderGeometry(0.24, 0.2, 0.04, 16), toon(0xf6f3ea), [0, 0.04, 0]);
      b.add(new THREE.CylinderGeometry(0.15, 0.11, 0.2, 14), toon(0xf6f3ea), [0, 0.16, 0]);
      b.add(new THREE.TorusGeometry(0.06, 0.02, 6, 10), toon(0xf6f3ea), [0.17, 0.17, 0], [0, 0, 0]);
      b.add(new THREE.CylinderGeometry(0.13, 0.13, 0.01, 14), toon(0x8a4a1a), [0, 0.25, 0], [0, 0, 0], [1, 1, 1], false);
      b.add(new THREE.TorusGeometry(0.15, 0.012, 6, 16), toon(0x3a74c8), [0, 0.2, 0], [Math.PI / 2, 0, 0], [1, 1, 1], false);
      return b.done(false);
    }
    case 'speaker': {
      const b = new ModelBuilder();
      b.add(new THREE.BoxGeometry(0.7, 1.0, 0.45), toon(0x6e4a2a), [0, 0.5, 0.3]);
      b.add(new THREE.BoxGeometry(0.75, 0.05, 0.55), toon(0x8a5a33), [0, 1.03, 0.3], [-0.2, 0, 0]);
      b.add(new THREE.CylinderGeometry(0.26, 0.3, 0.95, 12), toon(0x2a2a30), [0, 0.65, -0.25]);
      b.add(new THREE.SphereGeometry(0.26, 14, 12), toon(0xe8b893), [0, 1.35, -0.25]);
      b.add(new THREE.SphereGeometry(0.27, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.4), toon(0x9a9a9a), [0, 1.38, -0.27], [-0.3, 0, 0]);
      b.add(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 6), toon(0x22252b), [0, 1.2, 0.2], [0.7, 0, 0]);
      eyes(b, 1.38, -0.01, 0.09, 0.035);
      return b.done(false);
    }
    case 'applause': {
      const b = new ModelBuilder();
      for (const [x, ry] of [[-0.22, 0.5], [0.22, -0.5]] as const) {
        b.add(new THREE.SphereGeometry(0.3, 12, 10), toon(0xf0c6a4), [x, 0.6, 0], [0, ry, 0], [0.45, 1, 0.8]);
        for (let f = 0; f < 4; f++) b.add(new THREE.CapsuleGeometry(0.05, 0.18, 3, 6), toon(0xf0c6a4), [x - Math.sign(x) * 0.02, 0.95, -0.12 + f * 0.08], [0, ry, 0]);
      }
      b.add(new THREE.TorusGeometry(0.55, 0.03, 6, 24), toon(0xffd84a, { emissive: 0x604010 }), [0, 0.6, 0], [Math.PI / 2, 0, 0], [1, 1, 1], false);
      return b.done(false);
    }
    case 'absence': {
      // a red «Н» (absence mark) standing up
      const b = new ModelBuilder(new THREE.Matrix4().makeTranslation(0, 0.05, 0));
      const red = toon(0xd8382a);
      b.add(new THREE.BoxGeometry(0.12, 0.62, 0.12), red, [-0.18, 0.36, 0]);
      b.add(new THREE.BoxGeometry(0.12, 0.62, 0.12), red, [0.18, 0.36, 0]);
      b.add(new THREE.BoxGeometry(0.3, 0.11, 0.12), red, [0, 0.36, 0]);
      eyes(b, 0.5, 0.07, 0.18, 0.04);
      return b.done(true);
    }
    case 'register': {
      const b = new ModelBuilder();
      b.add(new THREE.BoxGeometry(0.5, 0.7, 0.35), toon(0x6e4a2a), [0, 0.35, 0]);
      b.add(new THREE.BoxGeometry(0.9, 0.14, 0.65), toon(0x1f3566), [0, 0.8, 0], [-0.35, 0, 0]);
      b.add(new THREE.BoxGeometry(0.85, 0.02, 0.6), toon(0xf4efe2), [0, 0.88, 0.02], [-0.35, 0, 0]);
      b.add(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 10), toon(0x3b3f47), [0, 0.85, 0.42], [Math.PI / 2, 0, 0]);
      eyes(b, 0.98, 0.1, 0.16, 0.05, -0.35);
      return b.done(false);
    }
    case 'olivier': {
      const b = new ModelBuilder();
      b.add(new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon(0xf6f3ea, { side: THREE.DoubleSide }), [0, 0.42, 0]);
      b.add(new THREE.SphereGeometry(0.38, 14, 10), toon(0xf2e2a0), [0, 0.42, 0], [0, 0, 0], [1, 0.45, 1]);
      for (let i = 0; i < 10; i++) {
        const a = i * 2.4, r = 0.1 + (i % 3) * 0.08;
        b.add(new THREE.BoxGeometry(0.06, 0.05, 0.06), toon([0x6fa84a, 0xe8843a, 0xd8d0b8][i % 3]), [Math.cos(a) * r, 0.58, Math.sin(a) * r], [0, 0, 0], [1, 1, 1], false);
      }
      eyes(b, 0.36, 0.4, 0.13, 0.05);
      return b.done(false);
    }
    case 'tangerine': {
      const b = new ModelBuilder();
      b.add(new THREE.SphereGeometry(0.2, 12, 10), toon(0xf08a2c), [0, 0.2, 0], [0, 0, 0], [1, 0.85, 1]);
      b.add(new THREE.ConeGeometry(0.06, 0.14, 4), toon(0x4a8a3a), [0.04, 0.4, 0], [0, 0, -0.8], [1, 1, 0.3]);
      eyes(b, 0.24, 0.18, 0.06, 0.03);
      return b.done(false);
    }
    case 'garland': {
      const b = new ModelBuilder();
      b.add(new THREE.CylinderGeometry(0.04, 0.05, 1.8, 6), toon(0x3b3f47), [0, 0.9, 0]);
      const cols = [0xff3a2a, 0xffd84a, 0x3ac8ff, 0x6aff6a, 0xff6ad8];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        b.add(new THREE.SphereGeometry(0.06, 6, 5), toon(cols[i % 5], { emissive: cols[i % 5], emissiveIntensity: 0.6 }), [Math.cos(a) * 0.7, 1.4 + Math.sin(a * 3) * 0.12, Math.sin(a) * 0.7], [0, 0, 0], [1, 1, 1], false);
      }
      b.add(new THREE.TorusGeometry(0.7, 0.012, 4, 24), toon(0x2a4a2a), [0, 1.4, 0], [Math.PI / 2, 0, 0], [1, 1, 1], false);
      return b.done(false);
    }
    case 'credit': {
      const tilt = new THREE.Matrix4().makeRotationX(-0.9);
      const b = new ModelBuilder(new THREE.Matrix4().makeTranslation(0, 0.45, 0).multiply(tilt));
      b.add(new THREE.BoxGeometry(0.46, 0.62, 0.08), toon(0xffffff, { map: T.creditTex() }), [0, 0, 0]);
      eyes(b, 0.12, 0.045, 0.1, 0.045);
      return b.done(true);
    }
    case 'cgCredit': {
      // the computer graphics credit: a monitor showing the Utah teapot
      const b = new ModelBuilder();
      b.add(new THREE.BoxGeometry(1.3, 0.95, 0.12), toon(0x22252b), [0, 1.2, 0]);
      b.add(new THREE.BoxGeometry(1.15, 0.8, 0.02), toon(0x1d2a4a, { emissive: 0x15253a }), [0, 1.2, 0.07], [0, 0, 0], [1, 1, 1], false);
      b.add(new TeapotGeometry(0.2, 6), toon(0xd8d0c0), [0, 1.18, 0.2]);
      b.add(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 8), toon(0x3b3f47), [0, 0.42, 0]);
      b.add(new THREE.BoxGeometry(0.6, 0.06, 0.4), toon(0x3b3f47), [0, 0.1, 0]);
      eyes(b, 1.5, 0.09, 0.3, 0.06);
      return b.done(false);
    }
    case 'fan': {
      const b = new ModelBuilder();
      b.add(new THREE.CylinderGeometry(0.2, 0.24, 0.8, 10), toon(0xf2a6c0), [0, 0.55, 0]);
      b.add(new THREE.SphereGeometry(0.21, 12, 10), toon(0xf0c6a4), [0, 1.12, 0]);
      b.add(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), toon(0x6b4630), [0, 1.15, -0.02], [-0.3, 0, 0]);
      b.add(new THREE.BoxGeometry(0.1, 0.18, 0.02), toon(0x22252b), [0.18, 1.2, 0.2], [0, -0.3, 0]);
      b.add(new THREE.CapsuleGeometry(0.05, 0.3, 3, 6), toon(0xf2a6c0), [0.2, 0.95, 0.12], [-1.0, 0, 0]);
      eyes(b, 1.14, 0.19, 0.07, 0.03);
      return b.done(false);
    }
  }
}
