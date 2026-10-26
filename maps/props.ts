import * as THREE from 'three';
import { Rng } from '../core/rng';
import { part, at, box, cyl, sphere, toon } from '../render/toon';
import { FREE, LOW, SOLID } from './grid';
import * as T from '../render/textures';

// Shared prop kit, modelled on the "Objects / Details" panels of the location sheets.
// Each prop is built at the origin, facing +z (toward the camera), feet on y=0.

export interface PropDef {
  /** footprint before rotation */
  w: number;
  d: number;
  block: number;
  build(rng: Rng): THREE.Object3D;
}

const WOOD = 0xa0703f, WOOD_DARK = 0x6e4a2a, METAL = 0x8a8f99, METAL_DARK = 0x3b3f47;
const CONCRETE = 0xcfc6b6, NAVY = 0x2b3f6b, LEAF = 0x5d8a46, LEAF_DARK = 0x3f6b34;

function group(...objs: THREE.Object3D[]) {
  const g = new THREE.Group();
  g.add(...objs);
  return g;
}

function bush(rng: Rng, r: number, y: number) {
  const g = new THREE.Group();
  const n = 4 + Math.floor(rng.next() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * rng.range(0.55, 0.8);
    g.add(at(part(sphere(rr, 10, 8), rng.pick([LEAF, LEAF_DARK, 0x6f9a50])), Math.cos(a) * r * 0.45, y + rng.range(0, r * 0.4), Math.sin(a) * r * 0.45));
  }
  return g;
}

export const PROPS: Record<string, PropDef> = {
  pillar: {
    w: 1, d: 1, block: SOLID,
    build: () => group(
      at(part(box(0.9, 3.6, 0.9), 0xe3d6bf), 0, 1.8, 0),
      at(part(box(1.05, 0.25, 1.05), 0xb9a88c), 0, 0.125, 0),
      at(part(box(1.0, 0.18, 1.0), 0xd2c3a8), 0, 3.5, 0),
    ),
  },
  plant: {
    w: 0.8, d: 0.8, block: SOLID,
    build: (rng) => {
      const g = group(at(part(cyl(0.3, 0.22, 0.55, 12), rng.pick([0xe9e4da, 0x9a6b4a, 0x4a4f58])), 0, 0.275, 0));
      const leaves = 6 + Math.floor(rng.next() * 4);
      for (let i = 0; i < leaves; i++) {
        const a = (i / leaves) * Math.PI * 2 + rng.range(-0.2, 0.2);
        const leaf = part(new THREE.ConeGeometry(0.12, 0.85, 5), rng.pick([LEAF, LEAF_DARK]));
        leaf.position.set(Math.cos(a) * 0.15, 0.85, Math.sin(a) * 0.15);
        leaf.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
        g.add(leaf);
      }
      return g;
    },
  },
  planter: {
    w: 2, d: 0.8, block: SOLID,
    build: (rng) => group(at(part(box(2, 0.55, 0.75), CONCRETE), 0, 0.275, 0), at(bush(rng, 0.45, 0.6), -0.5, 0, 0), at(bush(rng, 0.45, 0.6), 0.5, 0, 0)),
  },
  bench: {
    w: 1.8, d: 0.6, block: LOW,
    build: () => {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) g.add(at(part(box(1.8, 0.05, 0.14), WOOD), 0, 0.45, -0.18 + i * 0.18));
      for (let i = 0; i < 2; i++) g.add(at(part(box(1.8, 0.14, 0.05), WOOD), 0, 0.7 + i * 0.17, -0.27, -0.15));
      for (const x of [-0.75, 0.75]) g.add(at(part(box(0.06, 0.45, 0.5), METAL_DARK), x, 0.225, 0));
      return g;
    },
  },
  seatRow: {
    // orange waiting seats from the Building 2 / main building sheets
    w: 2.2, d: 0.7, block: LOW,
    build: (rng) => {
      const c = rng.pick([0xc0773a, 0xb8642f, 0x2c63b8]);
      const g = group(at(part(box(2.1, 0.06, 0.1), METAL_DARK), 0, 0.38, 0));
      for (let i = 0; i < 3; i++) {
        g.add(at(part(box(0.6, 0.08, 0.5), c), -0.7 + i * 0.7, 0.45, 0));
        g.add(at(part(box(0.6, 0.5, 0.08), c), -0.7 + i * 0.7, 0.72, -0.24, -0.15));
      }
      for (const x of [-0.9, 0.9]) g.add(at(part(box(0.06, 0.4, 0.4), METAL_DARK), x, 0.2, 0));
      return g;
    },
  },
  turnstile: {
    w: 0.4, d: 0.9, block: SOLID,
    build: () => group(
      at(part(box(0.32, 1.0, 0.8), 0xb7bcc6), 0, 0.5, 0),
      at(part(box(0.34, 0.06, 0.82), 0x3b3f47), 0, 1.02, 0),
      at(part(cyl(0.025, 0.025, 0.6, 6), 0xd8dde4), 0.32, 0.85, 0, 0, 0, Math.PI / 2),
      at(part(box(0.1, 0.06, 0.02), 0x5fe07a, { emissive: 0x2a8a3a, outline: false }), 0, 0.92, 0.41),
    ),
  },
  vending: {
    w: 1.1, d: 0.9, block: SOLID,
    build: (rng) => {
      const g = group(at(part(box(1.0, 2.0, 0.8), rng.pick([0xc9ccd2, 0x2b3f6b, 0xc0392b])), 0, 1, 0));
      g.add(at(part(box(0.6, 1.3, 0.04), 0x9fc6e6, { emissive: 0x334455, outline: false }), -0.12, 1.2, 0.41));
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 3; c++)
          g.add(at(part(box(0.12, 0.18, 0.04), rng.pick([0xe86a4a, 0xe8c547, 0x5fb0e0, 0x7adf8a]), { outline: false }), -0.3 + c * 0.18, 0.75 + r * 0.28, 0.44));
      g.add(at(part(box(0.18, 0.5, 0.04), METAL_DARK, { outline: false }), 0.36, 1.25, 0.42));
      return g;
    },
  },
  trash: {
    w: 0.5, d: 0.5, block: SOLID,
    build: () => group(at(part(cyl(0.2, 0.17, 0.7, 10), 0x4a4f58), 0, 0.35, 0), at(part(cyl(0.22, 0.22, 0.06, 10), 0x2b2f36), 0, 0.72, 0)),
  },
  sign: {
    w: 0.7, d: 0.4, block: SOLID,
    build: () => group(
      at(part(box(0.65, 1.7, 0.18), 0xe9e9e4, { map: T.directoryTex(['Аудитории →', 'Деканат →', 'Библиотека →', 'Столовая →']) }), 0, 1.0, 0),
      at(part(box(0.75, 0.15, 0.3), 0x6b6f78), 0, 0.075, 0),
    ),
  },
  reception: {
    w: 3.2, d: 1.0, block: SOLID,
    build: () => group(
      at(part(box(3.0, 1.0, 0.8), 0xb07a45), 0, 0.5, 0),
      at(part(box(3.15, 0.08, 0.95), 0xe6d2b0), 0, 1.04, 0),
      at(part(box(0.9, 0.5, 0.05), 0x2c2f36), -0.6, 1.35, -0.25),
      at(part(box(2.9, 0.12, 0.05), NAVY), 0, 0.75, 0.41),
    ),
  },
  stairs: {
    w: 6, d: 3.2, block: SOLID,
    build: () => {
      const g = new THREE.Group();
      for (let i = 0; i < 8; i++) g.add(at(part(box(6, 0.22 * (i + 1), 0.4), i % 2 ? 0xd8cbb4 : 0xcfc0a6, { outline: 0.02 }), 0, 0.11 * (i + 1), 1.4 - i * 0.4));
      for (const x of [-3.05, 3.05]) {
        g.add(at(part(box(0.1, 0.06, 3.4), WOOD_DARK), x, 2.1, 0, -0.5));
        g.add(at(part(box(0.15, 1.6, 3.3), 0xb9a88c), x, 0.8, 0));
      }
      return g;
    },
  },
  waterCooler: {
    w: 0.6, d: 0.6, block: SOLID,
    build: () => group(
      at(part(box(0.45, 1.0, 0.45), 0xeef0f2), 0, 0.5, 0),
      at(part(cyl(0.18, 0.18, 0.45, 12), 0x8fc4e8, { transparent: true, opacity: 0.8 }), 0, 1.25, 0),
    ),
  },
  deskRow: {
    // long lecture desk; the footprint is the desk only — the chairs behind it (south side)
    // stand in the walkway so units can still squeeze along the row
    w: 9, d: 0.7, block: LOW,
    build: (rng) => {
      const g = new THREE.Group();
      const top = rng.pick([0xb07a45, 0xa36c3a, 0xb98550]);
      g.add(at(part(box(9, 0.08, 0.65), top), 0, 0.78, 0));
      g.add(at(part(box(9, 0.6, 0.05), WOOD_DARK), 0, 0.45, -0.3));
      for (const x of [-4.4, 0, 4.4]) g.add(at(part(box(0.08, 0.75, 0.6), WOOD_DARK), x, 0.375, 0));
      for (let i = 0; i < 6; i++) {
        if (rng.chance(0.12)) continue; // a missing chair or two
        const x = -3.75 + i * 1.5 + rng.range(-0.08, 0.08);
        const ch = new THREE.Group();
        ch.add(at(part(box(0.5, 0.06, 0.45), WOOD), 0, 0.46, 0));
        ch.add(at(part(box(0.5, 0.45, 0.05), WOOD), 0, 0.72, 0.22));
        ch.add(at(part(box(0.45, 0.46, 0.4), METAL_DARK, { outline: false }), 0, 0.23, 0));
        ch.position.set(x, 0, 0.65);
        ch.rotation.y = rng.range(-0.12, 0.12);
        g.add(ch);
        if (rng.chance(0.25)) g.add(at(part(box(0.32, 0.03, 0.24), 0xf6f3ea), x, 0.84, 0, 0, rng.range(-0.5, 0.5)));
        if (rng.chance(0.12)) g.add(at(part(box(0.35, 0.02, 0.25), 0x2c2f36), x + 0.3, 0.83, -0.05, 0, rng.range(-0.3, 0.3)));
      }
      return g;
    },
  },
  desk2: {
    // two-seat classroom desk (Building 2); chairs stand behind it, outside the footprint
    w: 2.4, d: 0.7, block: LOW,
    build: (rng) => {
      const g = group(
        at(part(box(2.3, 0.06, 0.6), rng.pick([0xb07a45, 0xa36c3a])), 0, 0.76, 0),
        at(part(box(2.3, 0.55, 0.04), WOOD_DARK), 0, 0.45, -0.28),
        at(part(box(0.06, 0.74, 0.55), METAL_DARK), -1.1, 0.37, 0),
        at(part(box(0.06, 0.74, 0.55), METAL_DARK), 1.1, 0.37, 0),
      );
      for (const x of [-0.55, 0.55]) {
        if (rng.chance(0.1)) continue;
        g.add(at(part(box(0.45, 0.05, 0.42), WOOD), x, 0.46, 0.62));
        g.add(at(part(box(0.45, 0.4, 0.04), WOOD), x, 0.7, 0.83));
        g.add(at(part(box(0.4, 0.44, 0.36), METAL_DARK, { outline: false }), x, 0.22, 0.62));
      }
      return g;
    },
  },
  teacherDesk: {
    w: 2.4, d: 1.0, block: SOLID,
    build: () => group(
      at(part(box(2.2, 0.08, 0.9), 0x8a5a33), 0, 0.8, 0),
      at(part(box(2.2, 0.75, 0.05), 0x6e4a2a), 0, 0.4, 0.42),
      at(part(box(0.5, 0.3, 0.05), 0x2c2f36), 0.5, 1.0, -0.15, -0.2),
      at(part(box(0.4, 0.06, 0.3), 0xf6f3ea), -0.5, 0.86, 0),
    ),
  },
  hoopWall: {
    w: 1.4, d: 1.4, block: SOLID,
    build: () => group(
      at(part(box(0.25, 3.2, 0.25), 0x2c63b8), 0, 1.6, -0.5),
      at(part(box(1.6, 1.1, 0.06), 0xf2f3f5), 0, 3.1, 0.05),
      at(part(box(0.6, 0.45, 0.07), 0xffffff, { outline: false }), 0, 2.95, 0.07),
      at(part(new THREE.TorusGeometry(0.24, 0.025, 6, 16), 0xe0662a), 0, 2.75, 0.35, Math.PI / 2),
      at(part(box(0.1, 0.06, 0.5), METAL_DARK), 0, 2.7, -0.2),
    ),
  },
  mat: {
    w: 2, d: 1, block: FREE,
    build: (rng) => at(part(box(2, 0.1, 1), rng.pick([0x2c63b8, 0x3a74c8]), { outline: 0.015, shadow: false, receive: true }), 0, 0.05, 0),
  },
  gymBench: {
    w: 3, d: 0.5, block: LOW,
    build: () => group(
      at(part(box(3, 0.08, 0.3), 0xc9955a), 0, 0.42, 0),
      at(part(box(0.08, 0.4, 0.28), 0x6b6f78), -1.3, 0.2, 0),
      at(part(box(0.08, 0.4, 0.28), 0x6b6f78), 1.3, 0.2, 0),
    ),
  },
  ballCart: {
    w: 1.2, d: 0.8, block: SOLID,
    build: (rng) => {
      const g = group(at(part(box(1.1, 0.6, 0.7), METAL), 0, 0.4, 0));
      for (let i = 0; i < 6; i++)
        g.add(at(part(sphere(0.17, 12, 8), rng.pick([0xe8c547, 0xe0662a, 0xf2f0ea, 0x2c63b8])), -0.35 + (i % 3) * 0.35, 0.85, -0.15 + Math.floor(i / 3) * 0.3));
      return g;
    },
  },
  lockers: {
    w: 3, d: 0.6, block: SOLID,
    build: () => {
      const g = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        g.add(at(part(box(0.58, 1.9, 0.55), 0x2c4f8c), -1.2 + i * 0.6, 0.95, 0));
        g.add(at(part(box(0.06, 0.2, 0.03), 0xc9ccd2, { outline: false }), -1.0 + i * 0.6, 1.0, 0.29));
      }
      return g;
    },
  },
  bag: {
    w: 0.5, d: 0.4, block: FREE,
    build: (rng) => group(at(part(box(0.4, 0.3, 0.25), rng.pick([0x2b3f6b, 0xc0392b, 0x3a3f4a, 0x5d8a46])), 0, 0.15, 0, 0, rng.range(0, 3), 0)),
  },
  papers: {
    w: 0.6, d: 0.6, block: FREE,
    build: (rng) => {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) g.add(at(part(box(0.3, 0.01, 0.4), 0xf6f3ea, { outline: 0.01, shadow: false }), rng.range(-0.2, 0.2), 0.01 + i * 0.005, rng.range(-0.2, 0.2), 0, rng.range(0, 3), 0));
      return g;
    },
  },
  radiator: {
    w: 1.4, d: 0.3, block: SOLID,
    build: () => {
      const g = new THREE.Group();
      for (let i = 0; i < 9; i++) g.add(at(part(box(0.1, 0.65, 0.18), 0xeeeeea, { outline: 0.015 }), -0.6 + i * 0.15, 0.55, 0));
      return g;
    },
  },

  // ---------------------------------------------------------------- outdoors (plaza, parking)
  tree: {
    w: 1.2, d: 1.2, block: SOLID,
    build: (rng) => {
      const g = group(at(part(cyl(0.16, 0.22, 2.2, 8), 0x6e4a2a), 0, 1.1, 0));
      const fall = rng.pick([[0x6f9a46, 0x5d8a3a], [0xd9a63a, 0xc98a2a], [0xd8743a, 0xb85a2a], [0x8aa848, 0xc9b24a]]);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + rng.range(0, 1);
        g.add(at(part(sphere(rng.range(0.7, 0.95), 10, 8), rng.pick(fall)), Math.cos(a) * 0.5, rng.range(2.4, 3.0), Math.sin(a) * 0.5));
      }
      g.add(at(part(sphere(0.9, 10, 8), fall[0]), 0, 3.3, 0));
      return g;
    },
  },
  fir: {
    w: 1.4, d: 1.4, block: SOLID,
    build: (rng) => {
      const g = group(at(part(cyl(0.14, 0.18, 0.8, 8), 0x5a3a22), 0, 0.4, 0));
      const c = rng.pick([0x2f5a3a, 0x3a6a44, 0x2a4f34]);
      for (let i = 0; i < 4; i++) g.add(at(part(new THREE.ConeGeometry(1.1 - i * 0.22, 1.3, 9), c), 0, 1.1 + i * 0.75, 0));
      return g;
    },
  },
  lampPost: {
    w: 0.4, d: 0.4, block: SOLID,
    build: () => group(
      at(part(cyl(0.06, 0.09, 3.6, 8), 0x2c2f36), 0, 1.8, 0),
      at(part(box(0.4, 0.3, 0.4), 0x2c2f36), 0, 3.7, 0),
      at(part(box(0.3, 0.22, 0.3), 0xfff0c8, { emissive: 0xffd88a, emissiveIntensity: 0.45, outline: false }), 0, 3.5, 0),
    ),
  },
  bust: {
    w: 1.2, d: 1.2, block: SOLID,
    build: () => group(
      at(part(box(1.0, 1.6, 1.0), 0xcfc6b6), 0, 0.8, 0),
      at(part(box(1.15, 0.12, 1.15), 0xb9a88c), 0, 1.62, 0),
      at(part(sphere(0.42, 12, 10), 0xb8b4ac), 0, 1.95, 0, 0, 0, 0),
      at(part(sphere(0.3, 12, 10), 0xb8b4ac), 0, 2.55, 0.04),
    ),
  },
  hedge: {
    w: 3, d: 0.8, block: SOLID,
    build: (rng) => {
      const g = group(at(part(box(3, 0.7, 0.8), LEAF_DARK), 0, 0.35, 0));
      for (let i = 0; i < 5; i++) g.add(at(part(sphere(0.36, 8, 6), rng.pick([LEAF, LEAF_DARK])), -1.2 + i * 0.6, 0.72, 0));
      return g;
    },
  },
  car: {
    w: 1.9, d: 4.0, block: SOLID,
    build: (rng) => {
      const c = rng.pick([0xc0392b, 0x2b3f6b, 0xd8d8d0, 0x3a3f4a, 0x6e8f5a, 0xe8c547, 0x8a8f99]);
      const g = group(
        at(part(box(1.8, 0.6, 3.9), c), 0, 0.55, 0),
        at(part(box(1.6, 0.55, 2.0), c), 0, 1.1, -0.2),
        at(part(box(1.62, 0.4, 1.9), 0x9fc6e6, { outline: false }), 0, 1.12, -0.2),
      );
      for (const [x, z] of [[-0.85, 1.2], [0.85, 1.2], [-0.85, -1.3], [0.85, -1.3]])
        g.add(at(part(cyl(0.34, 0.34, 0.25, 12), 0x1d1d22), x, 0.34, z, 0, 0, Math.PI / 2));
      g.add(at(part(box(0.3, 0.12, 0.05), 0xfff2c8, { emissive: 0x806a3a, outline: false }), -0.6, 0.6, 1.96));
      g.add(at(part(box(0.3, 0.12, 0.05), 0xfff2c8, { emissive: 0x806a3a, outline: false }), 0.6, 0.6, 1.96));
      return g;
    },
  },
  barrierPost: {
    w: 0.6, d: 0.6, block: SOLID,
    build: () => group(
      at(part(box(0.5, 1.0, 0.5), 0xe8e2d6), 0, 0.5, 0),
      at(part(box(0.3, 0.12, 0.3), 0xd8382a, { emissive: 0x501010 }), 0, 1.08, 0),
    ),
  },

  // ---------------------------------------------------------------- canteen «Зодчие»
  servingCounter: {
    w: 12, d: 1.4, block: SOLID,
    build: (rng) => {
      const g = group(
        at(part(box(12, 1.0, 1.2), 0x6e4a2a), 0, 0.5, 0),
        at(part(box(12.2, 0.08, 1.35), 0xd9c7a8), 0, 1.04, 0),
      );
      for (const x of [-4, 0, 4]) {
        g.add(at(part(box(3.2, 0.45, 0.9), 0xbfe3f2, { transparent: true, opacity: 0.45, outline: false }), x, 1.3, -0.05));
        for (let i = 0; i < 6; i++)
          g.add(at(part(sphere(0.12, 8, 6), rng.pick([0xc0702a, 0xe8c547, 0x8a4a2a, 0xd8d0b8])), x - 1.2 + i * 0.48, 1.16, -0.05));
      }
      g.add(at(part(box(0.5, 0.4, 0.4), 0x2c2f36), 5.6, 1.28, 0.1));
      return g;
    },
  },
  canteenTable: {
    w: 2.4, d: 1.8, block: LOW,
    build: (rng) => {
      const g = group(
        at(part(box(2.2, 0.08, 1.0), 0xa36c3a), 0, 0.76, 0),
        at(part(cyl(0.08, 0.12, 0.74, 8), 0x2c2f36), -0.8, 0.37, 0),
        at(part(cyl(0.08, 0.12, 0.74, 8), 0x2c2f36), 0.8, 0.37, 0),
        at(part(box(0.18, 0.2, 0.12), 0xf6f3ea), 0, 0.88, 0),
      );
      for (const x of [-0.55, 0.55])
        for (const z of [-0.75, 0.75]) {
          const ch = new THREE.Group();
          ch.add(at(part(box(0.45, 0.06, 0.42), rng.pick([0x4a6a44, 0x8a5a33])), 0, 0.46, 0));
          ch.add(at(part(box(0.45, 0.45, 0.05), rng.pick([0x4a6a44, 0x8a5a33])), 0, 0.72, z > 0 ? 0.2 : -0.2));
          ch.position.set(x, 0, z);
          g.add(ch);
        }
      return g;
    },
  },
  booth: {
    w: 1.4, d: 2.4, block: SOLID,
    build: () => group(
      at(part(box(1.0, 0.08, 1.3), 0xa36c3a), 0, 0.76, 0),
      at(part(box(1.2, 0.45, 0.45), 0x2f3d2a), 0, 0.22, -0.95),
      at(part(box(1.2, 0.9, 0.12), 0x2f3d2a), 0, 0.7, -1.15),
      at(part(box(1.2, 0.45, 0.45), 0x2f3d2a), 0, 0.22, 0.95),
      at(part(box(1.2, 0.9, 0.12), 0x2f3d2a), 0, 0.7, 1.15),
    ),
  },
  menuBoard: {
    w: 0.8, d: 0.6, block: SOLID,
    build: () => group(
      at(part(box(0.7, 1.1, 0.06), 0xffffff, { map: T.zodchieMenuTex() }), 0, 0.75, 0.12, -0.2),
      at(part(box(0.7, 1.1, 0.06), 0x23201f), 0, 0.75, -0.12, 0.2),
    ),
  },
  pillarWood: {
    w: 1, d: 1, block: SOLID,
    build: () => group(
      at(part(box(0.9, 3.6, 0.9), 0xe3d6bf), 0, 1.8, 0),
      at(part(box(0.95, 2.6, 0.95), 0x7a4e2c), 0, 1.6, 0),
    ),
  },
  planterBox: {
    w: 1.8, d: 0.6, block: SOLID,
    build: (rng) => group(at(part(box(1.8, 0.5, 0.6), 0x9a6b4a), 0, 0.25, 0), at(bush(rng, 0.38, 0.55), -0.45, 0, 0), at(bush(rng, 0.38, 0.55), 0.45, 0, 0)),
  },

  // ---------------------------------------------------------------- dorm
  bed: {
    w: 1.0, d: 2.1, block: SOLID,
    build: (rng) => group(
      at(part(box(0.95, 0.35, 2.0), 0x8a8f99), 0, 0.3, 0),
      at(part(box(0.9, 0.18, 1.9), rng.pick([0x9a3a3a, 0x2b3f6b, 0x6a4a8a])), 0, 0.55, 0.05),
      at(part(box(0.6, 0.14, 0.35), 0xf2efe6), 0, 0.68, -0.75),
    ),
  },
  wardrobe: {
    w: 1.2, d: 0.6, block: SOLID,
    build: () => group(at(part(box(1.15, 2.0, 0.55), 0x8a5a33), 0, 1.0, 0), at(part(box(0.04, 1.8, 0.02), 0x5a3a22, { outline: false }), 0, 1.0, 0.29)),
  },
  studyDesk: {
    w: 1.4, d: 0.8, block: SOLID,
    build: () => group(
      at(part(box(1.3, 0.06, 0.7), 0x8a5a33), 0, 0.76, 0),
      at(part(box(0.06, 0.74, 0.6), 0x6e4a2a), -0.6, 0.37, 0),
      at(part(box(0.06, 0.74, 0.6), 0x6e4a2a), 0.6, 0.37, 0),
      at(part(box(0.45, 0.03, 0.32), 0x2c2f36), 0.1, 0.8, 0),
      at(part(box(0.45, 0.3, 0.02), 0x2c2f36), 0.1, 0.96, -0.15, -0.3),
      at(part(cyl(0.04, 0.08, 0.4, 8), 0x2c2f36), -0.45, 0.98, -0.2),
    ),
  },
  fridge: {
    w: 0.8, d: 0.7, block: SOLID,
    build: () => group(at(part(box(0.75, 1.8, 0.65), 0xf2f0ea), 0, 0.9, 0), at(part(box(0.04, 0.5, 0.04), 0x8a8f99, { outline: false }), 0.3, 1.2, 0.34)),
  },
  stove: {
    w: 0.8, d: 0.7, block: SOLID,
    build: () => {
      const g = group(at(part(box(0.75, 0.9, 0.65), 0xf2f0ea), 0, 0.45, 0), at(part(box(0.6, 0.35, 0.02), 0x2c2f36), 0, 0.45, 0.33));
      for (const [x, z] of [[-0.18, -0.15], [0.18, -0.15], [-0.18, 0.15], [0.18, 0.15]]) g.add(at(part(cyl(0.11, 0.11, 0.03, 12), 0x2c2f36, { outline: false }), x, 0.92, z));
      return g;
    },
  },
  kitchenCounter: {
    w: 2.4, d: 0.7, block: SOLID,
    build: () => group(
      at(part(box(2.4, 0.88, 0.65), 0x8a5a33), 0, 0.44, 0),
      at(part(box(2.45, 0.06, 0.7), 0xd9d2c4), 0, 0.9, 0),
      at(part(box(0.6, 0.06, 0.4), 0x9aa0a8, { outline: false }), 0.5, 0.92, 0),
    ),
  },
  diningTable: {
    w: 3.6, d: 2.0, block: LOW,
    build: (rng) => {
      const g = group(at(part(box(3.4, 0.08, 1.2), 0xb98550), 0, 0.76, 0));
      for (const x of [-1.5, 1.5]) for (const z of [-0.5, 0.5]) g.add(at(part(box(0.08, 0.74, 0.08), 0x6e4a2a), x, 0.37, z));
      for (const x of [-1.1, 0, 1.1])
        for (const z of [-0.85, 0.85]) g.add(at(part(box(0.45, 0.5, 0.42), rng.pick([0x2f5a3a, 0x8a2a2a, 0x2b3f6b])), x, 0.25, z));
      return g;
    },
  },
  rug: {
    w: 2.6, d: 1.8, block: FREE,
    build: (rng) => at(part(box(2.6, 0.03, 1.8), rng.pick([0x9a3a2a, 0x8a2a3a, 0xa0522d]), { outline: 0.01, shadow: false, receive: true }), 0, 0.015, 0),
  },
  newYearTree: {
    w: 1.6, d: 1.6, block: SOLID,
    build: (rng) => {
      const g = group(at(part(cyl(0.12, 0.15, 0.5, 8), 0x5a3a22), 0, 0.25, 0));
      for (let i = 0; i < 4; i++) g.add(at(part(new THREE.ConeGeometry(0.95 - i * 0.2, 1.0, 9), 0x2f6a3a), 0, 0.8 + i * 0.55, 0));
      for (let i = 0; i < 14; i++) {
        const y = 0.6 + rng.range(0, 2.0), r = (1 - (y - 0.4) / 2.6) * 0.9;
        const a = rng.range(0, Math.PI * 2);
        g.add(at(part(sphere(0.08, 8, 6), rng.pick([0xe8c547, 0xd8382a, 0x6fb7e8, 0xe86ab0]), { emissive: 0x302010, outline: false }), Math.cos(a) * r, y, Math.sin(a) * r));
      }
      g.add(at(part(new THREE.OctahedronGeometry(0.18), 0xffd84a, { emissive: 0x806010 }), 0, 3.05, 0));
      return g;
    },
  },

  // ---------------------------------------------------------------- dean's office
  glassCounter: {
    w: 8, d: 1.0, block: SOLID,
    build: () => {
      const g = group(
        at(part(box(8, 1.05, 0.9), 0x8a5a33), 0, 0.52, 0),
        at(part(box(8.1, 0.06, 1.0), 0xd9c7a8), 0, 1.08, 0),
        at(part(box(8, 1.2, 0.04), 0xbfe3f2, { transparent: true, opacity: 0.35, outline: false }), 0, 1.7, -0.1),
      );
      for (let i = 0; i <= 4; i++) g.add(at(part(box(0.06, 1.25, 0.08), 0x6e4a2a), -4 + i * 2, 1.72, -0.1));
      return g;
    },
  },
  counterWindow: {
    // the reception window Kirill is trying to reach (Week 10)
    w: 2.4, d: 1.0, block: SOLID,
    build: () => group(
      at(part(box(2.4, 0.95, 0.9), 0x8a5a33), 0, 0.47, 0),
      at(part(box(2.5, 0.06, 1.0), 0xd9c7a8), 0, 0.98, 0),
      at(part(box(2.4, 0.3, 0.06), 0x2b3f6b), 0, 2.2, -0.1),
      at(part(box(0.06, 1.3, 0.08), 0x6e4a2a), -1.2, 1.65, -0.1),
      at(part(box(0.06, 1.3, 0.08), 0x6e4a2a), 1.2, 1.65, -0.1),
    ),
  },
  officeDesk: {
    w: 1.6, d: 0.8, block: SOLID,
    build: () => group(
      at(part(box(1.5, 0.06, 0.75), 0x8a5a33), 0, 0.76, 0),
      at(part(box(1.5, 0.72, 0.05), 0x6e4a2a), 0, 0.38, -0.33),
      at(part(box(0.5, 0.35, 0.04), 0x2c2f36), 0, 1.0, -0.2),
      at(part(box(0.35, 0.15, 0.3), 0xf6f3ea), 0.5, 0.86, 0),
    ),
  },
  blackSeats: {
    w: 2.2, d: 0.8, block: LOW,
    build: () => {
      const g = group(at(part(box(2.1, 0.06, 0.1), METAL), 0, 0.38, 0));
      for (let i = 0; i < 3; i++) {
        g.add(at(part(box(0.62, 0.1, 0.55), 0x2a2a30), -0.7 + i * 0.7, 0.46, 0));
        g.add(at(part(box(0.62, 0.55, 0.1), 0x2a2a30), -0.7 + i * 0.7, 0.75, -0.26, -0.15));
      }
      for (const x of [-1.05, 1.05]) g.add(at(part(box(0.06, 0.6, 0.5), METAL), x, 0.3, 0));
      return g;
    },
  },
  coffeeTable: {
    w: 1.4, d: 0.8, block: LOW,
    build: () => group(at(part(box(1.3, 0.06, 0.7), 0x8a5a33), 0, 0.45, 0), at(part(box(1.2, 0.42, 0.6), 0x6e4a2a), 0, 0.21, 0), at(part(box(0.35, 0.02, 0.25), 0xf6f3ea), 0.2, 0.49, 0, 0, 0.3)),
  },
  filingShelf: {
    w: 1.6, d: 0.5, block: SOLID,
    build: (rng) => {
      const g = group(at(part(box(1.6, 2.0, 0.45), 0x8a5a33), 0, 1.0, 0));
      for (let s = 0; s < 4; s++)
        for (let i = 0; i < 7; i++)
          g.add(at(part(box(0.16, 0.35, 0.3), rng.pick([0x2b3f6b, 0x3a74c8, 0x2a4a8a]), { outline: false }), -0.6 + i * 0.2, 0.3 + s * 0.45, 0.1));
      return g;
    },
  },
  printer: {
    w: 0.7, d: 0.6, block: SOLID,
    build: () => group(at(part(box(0.65, 0.75, 0.55), 0xeeeeea), 0, 0.37, 0), at(part(box(0.4, 0.04, 0.3), 0xf6f3ea), 0, 0.78, 0.1)),
  },
  flagStand: {
    w: 0.5, d: 0.5, block: SOLID,
    build: () => group(
      at(part(cyl(0.03, 0.03, 2.4, 6), 0xd8c068), 0, 1.2, 0),
      at(part(box(0.9, 0.4, 0.02), 0xc8312a, { outline: false }), 0.47, 2.1, 0),
      at(part(box(0.9, 0.2, 0.02), 0x3a8a3a, { outline: false }), 0.47, 1.8, 0),
    ),
  },

  // ---------------------------------------------------------------- assembly hall
  theaterRow: {
    w: 8, d: 0.9, block: LOW,
    build: () => {
      const g = new THREE.Group();
      for (let i = 0; i < 13; i++) {
        g.add(at(part(box(0.55, 0.1, 0.5), 0x9a2a2a), -3.6 + i * 0.6, 0.45, 0.05));
        g.add(at(part(box(0.55, 0.6, 0.1), 0x9a2a2a), -3.6 + i * 0.6, 0.8, 0.32));
      }
      g.add(at(part(box(8, 0.35, 0.1), 0x3b3f47), 0, 0.2, 0.3));
      return g;
    },
  },
  stage: {
    w: 16, d: 4, block: SOLID,
    build: () => group(
      at(part(box(16, 1.1, 4), 0x8a5a33), 0, 0.55, 0),
      at(part(box(16.1, 0.08, 4.1), 0xb98550), 0, 1.12, 0),
      at(part(box(16, 0.3, 0.05), 0xe8c547), 0, 0.95, 2.02),
    ),
  },
  lectern: {
    w: 0.8, d: 0.6, block: SOLID,
    build: () => group(at(part(box(0.7, 1.2, 0.5), 0x6e4a2a), 0, 0.6, 0), at(part(box(0.75, 0.06, 0.6), 0x8a5a33), 0, 1.22, 0, -0.2), at(part(box(0.3, 0.2, 0.02), 0xe8c547), 0, 0.85, 0.26)),
  },

  // ---------------------------------------------------------------- Lab 317
  pcCluster: {
    w: 3.2, d: 1.8, block: SOLID,
    build: (rng) => {
      const g = group(at(part(box(3.0, 0.06, 1.5), 0xb07a45), 0, 0.76, 0));
      for (const x of [-1.4, 1.4]) for (const z of [-0.6, 0.6]) g.add(at(part(box(0.06, 0.74, 0.06), 0x3b3f47), x, 0.37, z));
      for (const x of [-0.75, 0.75])
        for (const z of [-0.35, 0.35]) {
          const facing = z > 0 ? 1 : -1;
          g.add(at(part(box(0.62, 0.42, 0.05), 0x22252b), x, 1.03, z - facing * 0.05));
          g.add(at(part(box(0.56, 0.34, 0.02), rng.pick([0x2b4a8a, 0x2a6a8a, 0x1d2a3a]), { emissive: 0x15253a, outline: false }), x, 1.03, z + facing * -0.02 + facing * 0.0));
          g.add(at(part(box(0.2, 0.42, 0.42), 0x22252b), x + 0.45, 0.22, z));
        }
      return g;
    },
  },
  pcRowV: {
    w: 1.2, d: 7, block: SOLID,
    build: (rng) => {
      const g = group(at(part(box(1.0, 0.06, 7), 0xb07a45), 0, 0.76, 0), at(part(box(0.9, 0.72, 6.9), 0x6e4a2a), 0, 0.37, 0));
      for (let i = 0; i < 5; i++) g.add(at(part(box(0.05, 0.42, 0.6), 0x22252b), -0.2, 1.03, -2.8 + i * 1.4), at(part(box(0.02, 0.34, 0.54), rng.pick([0x2b4a8a, 0x2a6a8a]), { emissive: 0x15253a, outline: false }), -0.23, 1.03, -2.8 + i * 1.4));
      return g;
    },
  },
  serverRack: {
    w: 0.9, d: 0.9, block: SOLID,
    build: (rng) => {
      const g = group(at(part(box(0.8, 2.2, 0.8), 0x22252b), 0, 1.1, 0));
      for (let i = 0; i < 10; i++) g.add(at(part(box(0.06, 0.04, 0.02), rng.pick([0x5fe07a, 0x6fb7e8, 0xe8c547]), { emissive: 0x2a6a2a, outline: false }), rng.range(-0.3, 0.3), 0.3 + i * 0.18, 0.41));
      return g;
    },
  },
  coatRack: {
    w: 0.5, d: 0.5, block: SOLID,
    build: () => group(at(part(cyl(0.03, 0.03, 1.8, 6), 0x3b3f47), 0, 0.9, 0), at(part(box(0.3, 0.6, 0.15), 0x6e4a2a), 0.12, 1.4, 0), at(part(box(0.28, 0.5, 0.15), 0x2b3f6b), -0.1, 1.45, 0.05)),
  },
};

// ---- wall-mounted decorations (no colliders; built facing +z, placed on a wall)

export const WALL_ITEMS: Record<string, (rng: Rng) => THREE.Object3D> = {
  window: () => group(
    at(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4), new THREE.MeshBasicMaterial({ map: T.windowTex(), color: 0xc4c4c4 })), 0, 0, 0.06),
    at(part(box(2.4, 0.14, 0.2), 0xe8e2d6), 0, -1.25, 0.06),
  ),
  banner: () => at(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), toon(0xffffff, { map: T.bannerTex() })), 0, 0, 0.05),
  noticeBoard: () => part(box(1.9, 1.15, 0.06), 0xffffff, { map: T.noticeBoardTex(), shadow: false }),
  clock: () => group(
    at(part(cyl(0.32, 0.32, 0.07, 20), 0xf6f3ea, { shadow: false }), 0, 0, 0.04, Math.PI / 2),
    at(part(box(0.03, 0.22, 0.02), 0x222222, { outline: false }), 0, 0.08, 0.09),
    at(part(box(0.16, 0.03, 0.02), 0x222222, { outline: false }), 0.06, 0, 0.09),
  ),
  chalkboard: () => group(
    at(part(box(7, 1.6, 0.08), 0xffffff, { map: T.chalkboardTex(), shadow: false }), 0, 0, 0.04),
    at(part(box(7.3, 0.12, 0.2), 0x8a5a33), 0, -0.86, 0.1),
    at(part(box(7.3, 1.85, 0.04), 0x6e4a2a), 0, 0, 0),
  ),
  door: (rng) => group(
    at(part(box(1.3, 2.4, 0.1), rng.pick([0x8a5a33, 0x7a4e2c])), 0, 0, 0.05),
    at(part(box(0.06, 0.06, 0.12), 0xd8c068, { outline: false }), 0.48, 0, 0.12),
    at(part(box(0.5, 0.25, 0.02), 0xf2efe6, { outline: false }), 0, 0.85, 0.11),
  ),
  glassDoors: () => group(
    at(part(box(3.2, 2.6, 0.08), 0x9fc6e6, { transparent: true, opacity: 0.55, outline: false }), 0, 0, 0.05),
    at(part(box(3.4, 0.14, 0.14), 0x6e4a2a), 0, 1.3, 0.06),
    at(part(box(0.1, 2.6, 0.14), 0x6e4a2a), 0, 0, 0.06),
  ),
  wallBars: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) g.add(at(part(box(0.08, 2.6, 0.08), 0xb98550), -0.9 + i * 0.6, 0, 0.2));
    for (let j = 0; j < 9; j++) g.add(at(part(cyl(0.025, 0.025, 1.9, 6), 0xc99a62, { outline: 0.012 }), 0, -1.2 + j * 0.3, 0.2, 0, 0, Math.PI / 2));
    return g;
  },
  extinguisher: () => group(at(part(cyl(0.1, 0.1, 0.5, 10), 0xc0392b), 0, 0, 0.12), at(part(box(0.35, 0.6, 0.05), 0xe9e9e4), 0, 0, 0.02)),
  directory: () => part(box(1.0, 1.4, 0.06), 0xffffff, { map: T.directoryTex(['4  401–420', '3  301–320', '2  201–220', '1  101–120', 'Л  Лаборатории', 'А  Актовый зал'], 'УКАЗАТЕЛЬ'), shadow: false }),
  zodchieMenu: () => part(box(7, 1.6, 0.08), 0xffffff, { map: T.zodchieMenuTex(), shadow: false }),
  deanSign: () => part(box(2.4, 1.5, 0.06), 0xffffff, { map: T.deanSignTex(), shadow: false }),
  facultyBoard: () => part(box(1.0, 1.6, 0.06), 0xffffff, { map: T.facultyBoardTex(), shadow: false }),
  poster: () => part(box(0.8, 1.1, 0.03), 0xffffff, { map: T.posterTex(), shadow: false }),
  projectorScreen: () => group(at(part(box(4.2, 2.6, 0.04), 0xffffff, { map: T.projectorTex(), shadow: false }), 0, 0, 0.04), at(part(box(4.4, 0.12, 0.15), 0x3b3f47), 0, 1.36, 0.08)),
  whiteboard: () => group(at(part(box(2.6, 1.4, 0.04), 0xffffff, { map: T.whiteboardTex(), shadow: false }), 0, 0, 0.04), at(part(box(2.7, 0.08, 0.12), 0x9aa0a8), 0, -0.74, 0.08)),
  curtain: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) g.add(at(part(box(0.9, 4.4, 0.18), i % 2 ? 0x8a1f24 : 0x9e262c, { outline: 0.012 }), -4 + i, 0, 0.12 + (i % 2) * 0.05));
    return g;
  },
  socket: () => group(at(part(box(0.22, 0.3, 0.04), 0xf2f0ea, { shadow: false }), 0, 0, 0.02), at(part(box(0.06, 0.06, 0.02), 0x2c2f36, { outline: false }), 0, 0.04, 0.05)),
  bigWindow: () => group(
    at(new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.9), new THREE.MeshBasicMaterial({ map: T.windowTex(), color: 0xc4c4c4 })), 0, 0, 0.06),
    at(part(box(3.4, 0.14, 0.2), 0x3b3f47), 0, -1.5, 0.06),
  ),
};
