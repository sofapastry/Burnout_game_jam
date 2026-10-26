import * as THREE from 'three';
import { toon, outlineMaterial } from '../render/toon';

// Grade points dropped by defeated units. Kirill collects them and levels up (GDD §3 "central tension").

export interface GP { alive: boolean; x: number; z: number; v: number; age: number; seed: number }

const MAX = 300;

export class Pickups {
  items: GP[] = Array.from({ length: MAX }, () => ({ alive: false, x: 0, z: 0, v: 1, age: 0, seed: 0 }));
  group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private outline: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  // coins by default, also stipend coins and canteen trays (flat, no spin)
  constructor(private style: 'grade' | 'coin' | 'tray' = 'grade') {
    const geo = style === 'tray' ? new THREE.BoxGeometry(0.55, 0.06, 0.4) : new THREE.CylinderGeometry(0.17, 0.17, 0.05, 16);
    const mat = style === 'coin' ? toon(0xd8dde4, { emissive: 0x404850 }) : style === 'tray' ? toon(0xc0702a, { emissive: 0x402010 }) : toon(0xf2c53d, { emissive: 0x6a4a00 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.outline = new THREE.InstancedMesh(geo, outlineMaterial(0.03), MAX);
    this.mesh.instanceMatrix = this.outline.instanceMatrix;
    this.mesh.castShadow = true;
    this.mesh.count = this.outline.count = 0;
    this.mesh.frustumCulled = this.outline.frustumCulled = false;
    this.group.add(this.mesh, this.outline);
  }

  drop(x: number, z: number, v: number, jitter = 0.4) {
    const gp = this.items.find((g) => !g.alive);
    if (!gp) return null;
    Object.assign(gp, { alive: true, x: x + (Math.random() - 0.5) * jitter, z: z + (Math.random() - 0.5) * jitter, v, age: 0, seed: Math.random() * 10 });
    return gp;
  }

  get count() {
    let n = 0;
    for (const g of this.items) if (g.alive) n++;
    return n;
  }

  clear() {
    for (const g of this.items) g.alive = false;
  }

  /** Remove the item nearest (x,z) within r (a hungry senior eating a tray). */
  take(x: number, z: number, r: number) {
    const g = this.nearest(x, z, r);
    if (g) g.alive = false;
    return !!g;
  }

  nearest(x: number, z: number, maxD: number) {
    let best: GP | null = null, bd = maxD;
    for (const g of this.items) {
      if (!g.alive) continue;
      const d = Math.hypot(g.x - x, g.z - z);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  /** Your possessed unit grabbing coins: pull those within `magnet`, collect within `r`. */
  collect(x: number, z: number, r: number, magnet: number, dt: number) {
    let got = 0;
    for (const g of this.items) {
      if (!g.alive || g.age < 0.25) continue;
      const dx = x - g.x, dz = z - g.z, d = Math.hypot(dx, dz);
      if (d < r) { g.alive = false; got += g.v; continue; }
      if (d < magnet) { const sp = 6 + (magnet - d) * 5; g.x += (dx / d) * sp * dt; g.z += (dz / d) * sp * dt; }
    }
    return got;
  }

  /** Magnetise toward Kirill inside his pickup radius; returns total value collected this tick. */
  update(dt: number, kx: number, kz: number, radius: number) {
    let got = 0;
    for (const g of this.items) {
      if (!g.alive) continue;
      g.age += dt;
      const dx = kx - g.x, dz = kz - g.z, d = Math.hypot(dx, dz);
      if (d < 0.6) { g.alive = false; got += g.v; continue; }
      if (d < radius) {
        const sp = 4 + (radius - d) * 4;
        g.x += (dx / d) * sp * dt;
        g.z += (dz / d) * sp * dt;
      }
    }
    return got;
  }

  render(time: number) {
    let n = 0;
    for (const g of this.items) {
      if (!g.alive) continue;
      const tray = this.style === 'tray';
      this.e.set(tray ? 0 : Math.PI / 2, tray ? g.seed : time * 3 + g.seed, 0, 'YXZ');
      this.q.setFromEuler(this.e);
      const pop = Math.min(1, g.age * 5);
      const y = tray ? 0.1 : 0.35 + Math.sin(time * 4 + g.seed) * 0.08;
      this.m.compose(this.p.set(g.x, y, g.z), this.q, this.s.setScalar(pop * (g.v > 1 && !tray ? 1.35 : 1)));
      this.outline.setMatrixAt(n++, this.m);
    }
    this.mesh.count = this.outline.count = n;
    this.outline.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.dispose();
    this.outline.dispose();
  }
}
