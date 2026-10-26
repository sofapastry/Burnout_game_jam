import * as THREE from 'three';
import { outlineMaterial } from '../render/toon';
import { buildUnitModel, UNIT_KINDS, type UnitKind, type UnitModel } from './unitModels';
import type { CardId } from '../data/cards';
import type { Grid } from '../maps/grid';

export type { UnitKind };

/** One pooled unit. Pooled objects, not per-spawn allocations (GDD §15 perf targets). */
export class Unit {
  index = 0;
  alive = false;
  kind: UnitKind = 'quiz';
  card: CardId | null = null;
  level = 1;
  x = 0; z = 0; vx = 0; vz = 0;
  hp = 1; maxHp = 1; r = 0.3; speed = 1;
  age = 0; life = 0;
  /** contact cooldown */
  cd = 0;
  /** orbiting-mug / aura hit cooldown */
  hitCd = 0;
  touchDmg = 0; pile = 0;
  ghost = false; targetable = true; stationary = false;
  attached = false; bounces = 0; mini = false; projectile = false;
  scale = 1; flash = 0; seed = 0; yaw = 0; roll = 0;
  /** Week 6/14/15 targets run from Kirill or drift instead of chasing him */
  behavior: 'chase' | 'flee' | 'wander' = 'chase';
  /** Week 13: how strongly Kirill wants this (Olivier > tangerines) */
  pull = 0;
  /** id of the grid obstacle this unit owns (parked car, the Queue) */
  dyn: string | null = null;
  /** generic per-unit timer and target for week rules */
  t2 = 0;
  tx = 0; tz = 0;
}

const MAX = 420;

interface KindRender { model: UnitModel; meshes: THREE.InstancedMesh[]; outline: THREE.InstancedMesh }

export class Horde {
  units: Unit[] = [];
  group = new THREE.Group();
  /** the possessed unit isn't drawn: the first-person camera sits inside it */
  hidden: Unit | null = null;
  private renders = new Map<UnitKind, KindRender>();
  private free: number[] = [];
  // spatial hash (1-unit cells), rebuilt every tick
  private hashCols: number;
  private hashRows: number;
  private buckets: number[][];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(private grid: Grid) {
    for (let i = 0; i < MAX; i++) {
      const u = new Unit();
      u.index = i;
      this.units.push(u);
      this.free.push(MAX - 1 - i);
    }
    for (const k of UNIT_KINDS) {
      const model = buildUnitModel(k);
      const meshes = model.parts.map((p) => {
        const im = new THREE.InstancedMesh(p.geom, p.mat, MAX);
        im.castShadow = true;
        im.count = 0;
        im.frustumCulled = false;
        im.setColorAt(0, new THREE.Color(1, 1, 1));
        return im;
      });
      const outline = new THREE.InstancedMesh(model.outline, outlineMaterial(0.025), MAX);
      outline.count = 0;
      outline.frustumCulled = false;
      // share one matrix buffer between all parts of a kind
      for (const im of meshes) im.instanceMatrix = outline.instanceMatrix;
      this.group.add(...meshes, outline);
      this.renders.set(k, { model, meshes, outline });
    }
    this.hashCols = Math.ceil(grid.w);
    this.hashRows = Math.ceil(grid.h);
    this.buckets = Array.from({ length: this.hashCols * this.hashRows }, () => []);
  }

  get aliveCount() {
    return MAX - this.free.length;
  }

  spawn(kind: UnitKind, x: number, z: number): Unit | null {
    const i = this.free.pop();
    if (i === undefined) return null;
    const u = this.units[i];
    Object.assign(u, new Unit(), { index: i, alive: true, kind, x, z, seed: Math.random() * 100 });
    return u;
  }

  kill(u: Unit) {
    if (!u.alive) return;
    u.alive = false;
    this.free.push(u.index);
  }

  clear() {
    for (const u of this.units) if (u.alive) this.kill(u);
  }

  rebuildHash() {
    for (const b of this.buckets) b.length = 0;
    for (const u of this.units) {
      if (!u.alive) continue;
      const c = this.hc(u.x, u.z);
      if (c >= 0) this.buckets[c].push(u.index);
    }
  }

  private hc(x: number, z: number) {
    const c = Math.floor(x + this.grid.w / 2), r = Math.floor(z + this.grid.h / 2);
    if (c < 0 || r < 0 || c >= this.hashCols || r >= this.hashRows) return -1;
    return r * this.hashCols + c;
  }

  /** Visit alive units within radius of (x,z). */
  query(x: number, z: number, rad: number, fn: (u: Unit, d: number) => void) {
    const c0 = Math.floor(x - rad + this.grid.w / 2), c1 = Math.floor(x + rad + this.grid.w / 2);
    const r0 = Math.floor(z - rad + this.grid.h / 2), r1 = Math.floor(z + rad + this.grid.h / 2);
    for (let r = Math.max(0, r0); r <= Math.min(this.hashRows - 1, r1); r++)
      for (let c = Math.max(0, c0); c <= Math.min(this.hashCols - 1, c1); c++)
        for (const i of this.buckets[r * this.hashCols + c]) {
          const u = this.units[i];
          if (!u.alive) continue;
          const d = Math.hypot(u.x - x, u.z - z);
          if (d <= rad) fn(u, d);
        }
  }

  /** Separation so a swarm spreads instead of stacking into one point. */
  separate(u: Unit, dt: number) {
    let px = 0, pz = 0;
    this.query(u.x, u.z, u.r * 2.2, (o, d) => {
      if (o === u || o.stationary || d < 1e-4) return;
      const overlap = u.r + o.r - d;
      if (overlap > 0) { px += ((u.x - o.x) / d) * overlap; pz += ((u.z - o.z) / d) * overlap; }
    });
    u.x += px * Math.min(1, dt * 10);
    u.z += pz * Math.min(1, dt * 10);
  }

  render(time: number) {
    const counts = new Map<UnitKind, number>();
    for (const u of this.units) {
      if (!u.alive || u === this.hidden) continue;
      const R = this.renders.get(u.kind)!;
      const n = counts.get(u.kind) ?? 0;
      counts.set(u.kind, n + 1);

      // code animation: pop-in, bob, flutter, squash & stretch
      const pop = Math.min(1, u.age * 6);
      const popS = pop < 1 ? pop * (1.3 - 0.3 * pop) : 1;
      const t = time * 1 + u.seed;
      let y = 0, sx = 1, sy = 1, rx = 0, rz = 0;
      const moving = Math.hypot(u.vx, u.vz);
      switch (u.kind) {
        case 'quiz':
          y = 0.12 + Math.sin(t * 9) * 0.08; rz = Math.sin(t * 13) * 0.25; rx = Math.sin(t * 7) * 0.1; break;
        case 'drawing':
          y = Math.sin(t * 5) * 0.03; rz = Math.sin(t * 6) * 0.06; break;
        case 'deadline': {
          const shake = Math.sin(t * 40) * 0.08;
          rz = shake; y = Math.abs(Math.sin(t * 14)) * 0.12; sy = 1 + Math.sin(t * 28) * 0.05; break;
        }
        case 'partner':
          sy = 1 + Math.sin(t * 6) * 0.1; sx = 1 - Math.sin(t * 6) * 0.06; break;
        case 'guard':
        case 'gost':
          sy = 1 + Math.sin(t * 2) * 0.015; break;
      }
      // balls only turn when they're really rolling somewhere (jostling made them spin in place)
      if (moving > (R.model.roll ? 0.8 : 0.05) && !R.model.faceCamera) u.yaw = R.model.roll ? turnToward(u.yaw, Math.atan2(u.vx, u.vz), 0.25) : Math.atan2(u.vx, u.vz);
      if (R.model.roll) u.roll += moving * 0.016 / (u.kind === 'volley' ? 0.26 : 0.4);
      const s = u.scale * popS;
      this.e.set(rx, R.model.faceCamera ? 0 : u.yaw, rz, 'YXZ');
      this.q.setFromEuler(this.e);
      if (R.model.roll) {
        const rq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), u.roll);
        this.q.multiply(rq);
      }
      this.m.compose(this.p.set(u.x, y + R.model.lift * s, u.z), this.q, this.s.set(s * sx, s * sy, s * sx));
      R.outline.setMatrixAt(n, this.m);
      const f = u.flash > 0 ? 2.4 : 1;
      this.c.setRGB(f, f, f);
      for (const im of R.meshes) im.setColorAt(n, this.c);
    }
    for (const [k, R] of this.renders) {
      const n = counts.get(k) ?? 0;
      R.outline.count = n;
      R.outline.instanceMatrix.needsUpdate = true;
      for (const im of R.meshes) {
        im.count = n;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    }
  }

  dispose() {
    for (const R of this.renders.values()) {
      R.outline.dispose();
      for (const im of R.meshes) im.dispose();
    }
  }
}

/** turn an angle toward another by a fraction, the short way round */
function turnToward(a: number, b: number, f: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * f;
}
