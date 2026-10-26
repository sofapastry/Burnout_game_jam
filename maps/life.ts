import * as THREE from 'three';
import type { Rng } from '../core/rng';
import { Person, type Pose } from '../hero/person';
import { randomKirillLook } from '../hero/look';

// Background life: seated students and dust. Decoration only.

/** where people sit on a seat prop, in its own space: x, z, and which way they face */
const SEATS: Record<string, { x: number; z: number; face: number }[]> = {
  deskRow: Array.from({ length: 6 }, (_, i) => ({ x: -3.75 + i * 1.5, z: 0.62, face: Math.PI })),
  seatRow: [-0.7, 0, 0.7].map((x) => ({ x, z: 0.02, face: 0 })),
  blackSeats: [-0.7, 0, 0.7].map((x) => ({ x, z: 0.02, face: 0 })),
};
const MAX_PEOPLE = 16;
const ROT_Y = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

interface Sitter { p: Person; t: number; pose: Pose; next: number }

export class MapLife {
  group = new THREE.Group();
  private sitters: Sitter[] = [];
  private dust: THREE.Points | null = null;
  private dustBase: Float32Array | null = null;
  private time = 0;

  constructor(private rng: Rng) {}

  /** a seat prop was placed: maybe somebody's sitting in it */
  seat(kind: string, x: number, z: number, rot: number) {
    const spots = SEATS[kind];
    if (!spots) return;
    for (const s of spots) {
      if (this.sitters.length >= MAX_PEOPLE || !this.rng.chance(kind === 'deskRow' ? 0.28 : 0.35)) continue;
      const a = ROT_Y[rot] ?? 0, c = Math.cos(a), sn = Math.sin(a);
      const wx = x + s.x * c + s.z * sn, wz = z - s.x * sn + s.z * c;
      const look = randomKirillLook(this.rng.fork('sit' + this.sitters.length));
      look.backpack = null;
      const p = new Person(look);
      p.root.scale.setScalar(0.92);
      p.root.position.set(wx, 0, wz);
      p.facing = s.face + a;
      p.root.rotation.y = p.facing;
      p.pose = 'sit';
      this.group.add(p.root);
      this.sitters.push({ p, t: this.rng.range(0, 6), pose: 'sit', next: this.rng.range(4, 12) });
    }
  }

  /** motes of dust over the floor, catching the light */
  addDust(w: number, h: number, height: number, warm: boolean) {
    const n = Math.min(260, Math.round(w * h * 0.25));
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (this.rng.next() - 0.5) * w;
      pos[i * 3 + 1] = 0.3 + this.rng.next() * height;
      pos[i * 3 + 2] = (this.rng.next() - 0.5) * h;
    }
    this.dustBase = pos.slice();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: warm ? 0xffe2b0 : 0xd8e4ff, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  update(dt: number) {
    this.time += dt;
    for (const s of this.sitters) {
      s.t += dt;
      // now and then a sitter raises a hand, chats with a neighbour, or slumps
      if (s.t > s.next) {
        s.t = 0;
        s.next = this.rng.range(5, 14);
        s.pose = s.pose !== 'sit' ? 'sit' : this.rng.pick<Pose>(['talk', 'cheer', 'sit', 'sit']);
      }
      s.p.pose = s.pose === 'sit' || s.t > 2.2 ? 'sit' : s.pose;
      s.p.update(dt, 0);
    }
    if (this.dust && this.dustBase) {
      const a = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
      const b = this.dustBase, T = this.time;
      for (let i = 0; i < a.count; i++) {
        a.setX(i, b[i * 3] + Math.sin(T * 0.21 + i) * 0.4);
        a.setY(i, b[i * 3 + 1] + Math.sin(T * 0.33 + i * 1.7) * 0.25);
        a.setZ(i, b[i * 3 + 2] + Math.cos(T * 0.17 + i * 0.7) * 0.4);
      }
      a.needsUpdate = true;
    }
  }
}
