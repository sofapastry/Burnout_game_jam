import * as THREE from 'three';
import type { Stage } from './stage';

// World effects (rings, beams, paper bursts) and DOM overlays that track world positions
// (grade pop-ups "2!, 3-, 4", speech bubbles, status icons).

interface Ring { mesh: THREE.Mesh; t: number; dur: number; r0: number; r1: number; op: number }
interface Beam { mesh: THREE.Mesh; t: number; dur: number }
interface Bit { mesh: THREE.Mesh; vx: number; vy: number; vz: number; t: number; dur: number; spin: number }
interface Popup { el: HTMLDivElement; pos: THREE.Vector3; t: number; dur: number }
interface Bubble { el: HTMLDivElement; get: () => THREE.Vector3; t: number; dur: number; height: number }

const ringGeo = new THREE.RingGeometry(0.92, 1, 48);
const beamGeo = new THREE.BoxGeometry(1, 1, 1);
const bitGeo = new THREE.PlaneGeometry(0.16, 0.2);

export class Fx {
  group = new THREE.Group();
  private rings: Ring[] = [];
  private beams: Beam[] = [];
  private bits: Bit[] = [];
  private popups: Popup[] = [];
  private bubbles: Bubble[] = [];
  private layer: HTMLElement;
  private tmp = new THREE.Vector3();
  private sp = { x: 0, y: 0 };

  constructor(private stage: Stage) {
    this.layer = document.getElementById('world-ui')!;
    stage.world.add(this.group);
  }

  ring(x: number, z: number, r0: number, r1: number, dur: number, color: number, opacity = 0.8, y = 0.06) {
    const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(r0);
    mesh.renderOrder = 2;
    this.group.add(mesh);
    this.rings.push({ mesh, t: 0, dur, r0, r1, op: opacity });
  }

  /** A filled disc that the caller owns (zones, safe radius, fitness circles). */
  disc(r: number, color: number, opacity = 0.3) {
    const g = new THREE.Group();
    const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    fill.rotation.x = -Math.PI / 2;
    const edge = new THREE.Mesh(new THREE.RingGeometry(r * 0.93, r, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.min(1, opacity * 2.5), depthWrite: false }));
    edge.rotation.x = -Math.PI / 2;
    g.add(fill, edge);
    g.position.y = 0.04;
    g.renderOrder = 2;
    this.group.add(g);
    return g;
  }

  beam(x0: number, z0: number, x1: number, z1: number, color = 0xb6ff3a, dur = 0.12, width = 0.14) {
    const mesh = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false }));
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    mesh.position.set((x0 + x1) / 2, 0.95, (z0 + z1) / 2);
    mesh.rotation.y = Math.atan2(dx, dz);
    mesh.scale.set(width, width, len);
    this.group.add(mesh);
    this.beams.push({ mesh, t: 0, dur });
  }

  burst(x: number, z: number, color: number, n = 6, y = 0.6, speed = 3) {
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(bitGeo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true }));
      mesh.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.group.add(mesh);
      this.bits.push({ mesh, vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s, t: 0, dur: 0.7 + Math.random() * 0.4, spin: (Math.random() - 0.5) * 20 });
    }
  }

  popup(x: number, y: number, z: number, text: string, cls = '') {
    if (this.popups.length > 60) this.popups.shift()!.el.remove();
    const el = document.createElement('div');
    el.className = 'popup ' + cls;
    el.textContent = text;
    this.layer.appendChild(el);
    this.popups.push({ el, pos: new THREE.Vector3(x + (Math.random() - 0.5) * 0.5, y, z), t: 0, dur: 0.9 });
  }

  /** Speech bubble that follows something; one per speaker (replaces the previous one). */
  say(key: string, get: () => THREE.Vector3, text: string, dur = 2.2, height = 2.4, cls = '') {
    const old = this.bubbles.find((b) => b.el.dataset.key === key);
    if (old) { old.el.remove(); this.bubbles.splice(this.bubbles.indexOf(old), 1); }
    const el = document.createElement('div');
    el.className = 'bubble ' + cls;
    el.dataset.key = key;
    el.textContent = text;
    this.layer.appendChild(el);
    this.bubbles.push({ el, get, t: 0, dur, height });
  }

  update(dt: number) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k)));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = r.op * (1 - k);
      if (k >= 1) { this.group.remove(r.mesh); (r.mesh.material as THREE.Material).dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      const k = b.t / b.dur;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      if (k >= 1) { this.group.remove(b.mesh); (b.mesh.material as THREE.Material).dispose(); this.beams.splice(i, 1); }
    }
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.t += dt;
      b.vy -= 12 * dt;
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y = Math.max(0.03, b.mesh.position.y + b.vy * dt);
      b.mesh.position.z += b.vz * dt;
      b.mesh.rotation.x += b.spin * dt;
      b.mesh.rotation.z += b.spin * 0.7 * dt;
      if (b.mesh.position.y <= 0.03) { b.vx *= 0.8; b.vz *= 0.8; }
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, 2 * (1 - b.t / b.dur));
      if (b.t >= b.dur) { this.group.remove(b.mesh); (b.mesh.material as THREE.Material).dispose(); this.bits.splice(i, 1); }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      p.pos.y += dt * 1.6;
      this.place(p.el, p.pos);
      p.el.style.opacity = String(Math.min(1, 3 * (1 - p.t / p.dur)));
      if (p.t >= p.dur) { p.el.remove(); this.popups.splice(i, 1); }
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t += dt;
      this.tmp.copy(b.get());
      this.tmp.y += b.height;
      this.place(b.el, this.tmp);
      if (b.t >= b.dur) { b.el.remove(); this.bubbles.splice(i, 1); }
    }
  }

  private place(el: HTMLElement, p: THREE.Vector3) {
    this.stage.toScreen(p, this.sp);
    el.style.transform = `translate(${this.sp.x.toFixed(1)}px, ${this.sp.y.toFixed(1)}px) translate(-50%, -100%)`;
  }

  clear() {
    for (const p of this.popups) p.el.remove();
    for (const b of this.bubbles) b.el.remove();
    this.popups = []; this.bubbles = []; this.rings = []; this.beams = []; this.bits = [];
    this.group.clear();
  }
}
