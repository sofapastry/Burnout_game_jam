import * as THREE from 'three';
import type { WeekRun } from './week';
import type { Unit } from '../horde/units';
import type { CardId } from '../data/cards';
import type { KirillTarget } from '../hero/kirill';
import { Pickups } from '../horde/pickups';
import { Nina, Masha, Romchik, Sonya } from '../horde/characters';
import { LINES, pickLine } from '../data/lines';
import { sfx } from '../core/audio';
import { part, box, sphere, toon } from '../render/toon';
import { LOW } from '../maps/grid';
import balance from '../data/balance.json';
import { t } from '../i18n';
import type { DuelFoe } from '../duel/duel';

// One rules object per week (GDD §8): what the fail meter is, what a hit does, the week's units,
// the Q skill, and how the week is won or lost. WeekRun handles everything shared.

const WK = balance.weekRules;

export type MeterMode = 'fail' | 'race' | 'count';

export abstract class Rules {
  /** fail: fills toward a debt · race: Kirill's progress, debt if not full at the bell · count: things left */
  meterMode: MeterMode = 'fail';
  usesSanity = false;
  /** your horde physically blocks Kirill (goal weeks) */
  crowdBlocks = false;
  noShooting = false;
  kirillSpeedMul = 1;
  beamRange: number | undefined = undefined;
  duration: number = balance.week.durationSec;

  constructor(protected w: WeekRun) {}
  protected get k() { return this.w.kirill; }

  /** 0..1, how close the HUD bar is to full */
  abstract progress(): number;
  abstract meterText(): string;
  /** debt right now (default: a fail meter that filled up) */
  instantDebt() { return this.meterMode === 'fail' && this.progress() >= 1; }
  debtAtBell() { return false; }
  passedEarly() { return false; }
  /** what a hit of `dmg` means this week */
  abstract hurt(dmg: number, cause: string): void;
  /** help for Kirill (Grisha's joke, Artem) */
  abstract heal(amount: number): void;
  /** the story's second wind: the meter drops back to `frac` of the way to a debt */
  restore(_frac: number) {}
  /** a stuck-on unit (partner, fee envelope) draining per tick */
  drain(amount: number) { this.hurt(amount, ''); }
  blast(u: Unit) { this.hurt(u.touchDmg, 'Deadline'); }
  artemHelp() { this.heal(balance.allies.artem.heal); }
  /** custom contact; true = handled */
  contact(_u: Unit) { return false; }
  /** custom damage (CG credit can't be killed); true = handled */
  damage(_u: Unit, _dmg: number) { return false; }
  /** adjust every unit you spawn (Week 6: they all flee) */
  adopt(_u: Unit) {}
  playCard(_card: CardId, _level: number, _x: number, _z: number): boolean { return false; }
  /** override where a card may be placed; undefined = default rules */
  spawnSpot(_card: CardId, _x: number, _z: number): { x: number; z: number } | null | undefined { return undefined; }
  /** custom movement; 'move' = moved it (contact still checked), 'skip' = done with it */
  unitTick(_u: Unit, _dt: number): false | 'move' | 'skip' { return false; }
  onKill(_u: Unit) {}
  target(): KirillTarget | null { return null; }
  avoidPoint?(x: number, z: number): { x: number; z: number } | null;
  partySpot?(): { x: number; z: number } | null;
  skill() {}
  meter2(): { label: string; p: number } | null { return null; }
  /** extra Exam Ticket effect for this week (Week 15: +20 tests) */
  ticketBonus(): boolean { return false; }

  // ---- boss duel (Shadow Fight-style): the week's climax decides the debt
  duelFoe: DuelFoe | null = null;
  /** how the boss week ends: a silhouette duel, or Nina's PE norm race */
  climax: 'duel' | 'race' | 'show' = 'duel';
  /** start the duel when the meter fills (instead of an instant debt) */
  duelOnInstant = true;
  /** start the duel when the bell rings */
  duelAtBell = false;
  /** Kirill's health in the duel: the horde phase wears him down */
  duelHp() { return Math.max(0.35, 1 - 0.6 * this.progress()); }

  /** Kirill's All-Nighter comes when things look bad for him (~70%) */
  allNighterReady() {
    const w = this.w, p = this.progress();
    if (this.meterMode === 'fail') return p >= balance.allNighter.at && p < 1;
    if (this.meterMode === 'race') return w.time >= w.duration * 0.55 && p < 0.85;
    return w.time >= w.duration * 0.6;
  }

  // ---- the week's own verb (aim, rotate, drag)
  /** key of a one-line hint shown at the start of the week */
  verbHint: string | null = null;
  onRotate?(): void;
  onPointerDown?(x: number, z: number): boolean;
  onPointerMove?(x: number, z: number): void;
  onPointerUp?(): void;

  setup() {}
  update(_dt: number) {}
  render(_time: number) {}
  dispose() {}
}

// ---------------------------------------------------------------- generic meters

/** Sanity: hits hurt, he regenerates; empty = debt. */
export class SanityRules extends Rules {
  usesSanity = true;
  progress() { return Math.min(1, Math.max(0, 1 - this.k.sanity / this.k.maxSanity)); }
  meterText() { return `${Math.max(0, Math.ceil(this.k.sanity))} / ${Math.round(this.k.maxSanity)}`; }
  hurt(dmg: number, cause: string) { this.w.sanityHit(dmg, cause); }
  heal(n: number) {
    this.k.sanity = Math.min(this.k.maxSanity, this.k.sanity + n);
    this.w.fx.popup(this.k.x, 2.6, this.k.z, t('pop.sanity', { n }), 'heal');
  }
  drain(amount: number) {
    this.k.sanity -= amount;
    this.w.chaosBonus(amount * 0.3);
  }
  restore(frac: number) { this.k.sanity = this.k.maxSanity * (1 - frac); }
}

/** Something piles up on Kirill (drawings, make-up hours); full = debt. Units that reach him are absorbed. */
export class PileRules extends Rules {
  constructor(w: WeekRun, protected limit: number, protected icon: string) { super(w); }
  progress() { return Math.min(1, this.w.pile / this.limit); }
  meterText() { return `${this.w.pile.toFixed(1)} / ${this.limit}`; }
  hurt(dmg: number, _cause = '') { this.w.addPile(dmg / 8, this.icon); }
  heal(n: number) {
    const v = Math.max(1, Math.round(n / 8));
    this.w.pile = Math.max(0, this.w.pile - v);
    this.w.fx.popup(this.k.x, 2.6, this.k.z, `−${v} ${this.icon}`, 'heal');
  }
  drain(amount: number) { this.w.pile += amount * 0.1; }
  restore(frac: number) { this.w.pile = this.limit * frac; }
  blast(u: Unit) { this.w.addPile(u.pile || 1.5, this.icon); }
  artemHelp() {
    const n = balance.allies.artem.pileRemove;
    this.w.pile = Math.max(0, this.w.pile - n);
    this.w.fx.popup(this.k.x, 2.6, this.k.z, t('pop.artemCleared', { n }), 'heal');
  }
  contact(u: Unit) {
    if (u.pile > 0 && u.kind !== 'volley' && u.cd <= 0) {
      this.w.addPile(u.pile, this.icon);
      this.w.killUnit(u, false);
      return true;
    }
    return false;
  }
}

/** A resource that runs out (wallet, hunger); zero = debt. */
export class DrainRules extends Rules {
  value: number;
  constructor(w: WeekRun, public start: number, protected unit: string, protected hitFactor: number) {
    super(w);
    this.value = start;
  }
  progress() { return Math.min(1, Math.max(0, 1 - this.value / this.start)); }
  meterText() { return `${Math.max(0, Math.round(this.value))}${this.unit} / ${this.start}${this.unit}`; }
  hurt(dmg: number, _cause = '') {
    const v = dmg * this.hitFactor;
    this.value -= v;
    this.w.chaosBonus(dmg * 0.3);
    this.k.rig.hurt();
    this.w.fx.popup(this.k.x, 2.4, this.k.z, `−${Math.round(v)}${this.unit}`, v >= 8 ? 'grade-2' : 'grade-3');
    sfx.hurt();
  }
  heal(n: number) {
    this.value = Math.min(this.start, this.value + n);
    this.w.fx.popup(this.k.x, 2.6, this.k.z, `+${Math.round(n)}${this.unit}`, 'heal');
  }
  drain(amount: number) { this.value -= amount * this.hitFactor; this.w.chaosBonus(amount * 0.3); }
  restore(frac: number) { this.value = this.start * (1 - frac); }
}

// ======================================================================= weeks 1–3

class FoyerRules extends SanityRules {
  skill() {
    const k = this.k, w = this.w;
    const z = w.map.layout.zones;
    const to = k.x < 0 ? z.hallB : z.hallA;
    w.fx.ring(k.x, k.z, 0.2, 2, 0.4, 0x9b6ae8);
    const spot = w.grid.nearestFree(to.x, to.z) ?? to;
    k.x = spot.x; k.z = spot.z; k.vx = k.vz = 0;
    k.stun = Math.max(k.stun, 0.5);
    w.fx.ring(k.x, k.z, 2, 0.2, 0.4, 0x9b6ae8);
    sfx.teleport();
    k.say(LINES.kirillTeleport, true);
  }
}

class DrawingsRules extends PileRules {
  constructor(w: WeekRun) { super(w, balance.weeks['2'].pileLimit, '📄'); }
  skill() {
    this.k.drone = 4;
    this.k.say(LINES.kirillDrone, true);
    this.w.fx.ring(this.k.x, this.k.z, 0.5, 5, 0.8, 0x8a7ad8, 0.5);
  }
}

class GymRules extends SanityRules {
  private nina!: Nina;
  private aim!: THREE.Mesh;
  duelFoe: DuelFoe = 'nina';
  climax: 'duel' | 'race' | 'show' = 'race';
  duelAtBell = true;
  verbHint = 'hint.throw';
  setup() {
    const p = this.w.map.layout.zones.nina;
    this.nina = new Nina(this.w, p.x, p.z);
    this.w.nina = this.nina;
    // dashed-looking aim line from Nina to the cursor
    this.aim = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 0.08), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.7, toneMapped: false }));
    this.aim.visible = false;
    this.w.fx.group.add(this.aim);
  }
  private throwing() {
    const c = this.w.hand[this.w.selected]?.card;
    return c === 'volley' || c === 'medBall';
  }
  /** you are Nina's throwing arm: balls fly from her toward where you click */
  spawnSpot(card: CardId, x: number, z: number) {
    return card === 'volley' || card === 'medBall' ? { x, z } : undefined;
  }
  playCard(card: CardId, level: number, x: number, z: number) {
    if (card !== 'volley' && card !== 'medBall') return false;
    const n = this.nina;
    const dx = x - n.x, dz = z - n.z, d = Math.hypot(dx, dz) || 1;
    const sx = n.x + (dx / d) * 0.9, sz = n.z + (dz / d) * 0.9;
    if (card === 'volley')
      this.w.spawnUnit('volley', sx, sz, { card, level, targetable: false, r: 0.26, touchDmg: balance.weekUnits.volley.touchDmg * 1.5, bounces: 3, vx: (dx / d) * 9, vz: (dz / d) * 9, speed: 9, life: 8 });
    else
      this.w.spawnUnit('medBall', sx, sz, { card, level, projectile: true, targetable: false, r: 0.42, touchDmg: balance.cards.medBall.touchDmg, vx: (dx / d) * 7, vz: (dz / d) * 7, speed: 7, life: 6 });
    n.throwAt();
    return true;
  }
  render() {
    const c = this.w.cursorGround, n = this.nina;
    this.aim.visible = !!c && this.throwing() && !this.w.ended && !this.w.possess.active;
    if (!c || !this.aim.visible) return;
    const dx = c.x - n.x, dz = c.z - n.z, d = Math.hypot(dx, dz);
    this.aim.position.set((n.x + c.x) / 2, 0.08, (n.z + c.z) / 2);
    this.aim.rotation.y = Math.atan2(dz, dx) * -1;
    this.aim.scale.x = d;
  }
  skill() {
    this.nina.whistle();
    const k = this.k;
    k.laps = 4;
    const lp = this.w.map.layout.laps ?? [];
    let bi = 0, bd = Infinity;
    lp.forEach((p, i) => { const d = Math.hypot(p.x - k.x, p.z - k.z); if (d < bd) { bd = d; bi = i; } });
    k.lapIdx = bi;
    k.say(LINES.kirillLaps, true);
  }
}

// ======================================================================= Week 4 · leaves

/** Hundreds of leaves on the ground, drawn as one instanced mesh. */
class LeafField {
  x: number[] = []; z: number[] = []; vx: number[] = []; vz: number[] = []; rot: number[] = []; col: number[] = [];
  mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private c = new THREE.Color();
  static MAX = 900;
  constructor(parent: THREE.Object3D, private hw: number, private hh: number) {
    const geo = new THREE.CircleGeometry(0.17, 5);
    geo.rotateX(-Math.PI / 2);
    geo.scale(1, 1, 0.6);
    this.mesh = new THREE.InstancedMesh(geo, toon(0xffffff, { side: THREE.DoubleSide }), LeafField.MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.setColorAt(0, this.c);
    parent.add(this.mesh);
  }
  get n() { return this.x.length; }
  add(x: number, z: number, n: number, spread: number) {
    for (let i = 0; i < n && this.x.length < LeafField.MAX; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      this.x.push(Math.max(-this.hw, Math.min(this.hw, x + Math.cos(a) * r)));
      this.z.push(Math.max(-this.hh, Math.min(this.hh, z + Math.sin(a) * r)));
      this.vx.push(0); this.vz.push(0);
      this.rot.push(Math.random() * Math.PI * 2);
      this.col.push([0xd9a63a, 0xd8743a, 0xc9502a, 0xe8c547, 0xa8642a][Math.floor(Math.random() * 5)]);
    }
  }
  remove(i: number) {
    const last = this.x.length - 1;
    for (const arr of [this.x, this.z, this.vx, this.vz, this.rot, this.col]) { arr[i] = arr[last]; arr.pop(); }
  }
  countNear(x: number, z: number, r: number) {
    let n = 0;
    const r2 = r * r;
    for (let i = 0; i < this.x.length; i++) { const dx = this.x[i] - x, dz = this.z[i] - z; if (dx * dx + dz * dz < r2) n++; }
    return n;
  }
  centroidNear(x: number, z: number, r: number) {
    let sx = 0, sz = 0, n = 0;
    const r2 = r * r;
    for (let i = 0; i < this.x.length; i++) { const dx = this.x[i] - x, dz = this.z[i] - z; if (dx * dx + dz * dz < r2) { sx += this.x[i]; sz += this.z[i]; n++; } }
    return n ? { x: sx / n, z: sz / n, n } : null;
  }
  /** rake a cone in front of Kirill: leaves inside are bagged */
  rake(x: number, z: number, facing: number, r: number, half: number) {
    let got = 0;
    for (let i = this.x.length - 1; i >= 0; i--) {
      const dx = this.x[i] - x, dz = this.z[i] - z, d = Math.hypot(dx, dz);
      if (d > r) continue;
      let a = Math.atan2(dx, dz) - facing;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) <= half || d < 0.6) { this.remove(i); got++; }
    }
    return got;
  }
  update(dt: number) {
    for (let i = 0; i < this.x.length; i++) {
      if (this.vx[i] === 0 && this.vz[i] === 0) continue;
      this.x[i] = Math.max(-this.hw, Math.min(this.hw, this.x[i] + this.vx[i] * dt));
      this.z[i] = Math.max(-this.hh, Math.min(this.hh, this.z[i] + this.vz[i] * dt));
      this.vx[i] *= Math.pow(0.3, dt); this.vz[i] *= Math.pow(0.3, dt);
      if (Math.abs(this.vx[i]) + Math.abs(this.vz[i]) < 0.05) this.vx[i] = this.vz[i] = 0;
      this.rot[i] += dt * 2;
    }
  }
  push(x: number, z: number, speed: number) {
    for (let i = 0; i < this.x.length; i++) {
      const dx = x - this.x[i], dz = z - this.z[i], d = Math.hypot(dx, dz) || 1;
      this.vx[i] = (dx / d) * speed * (0.7 + Math.random() * 0.6);
      this.vz[i] = (dz / d) * speed * (0.7 + Math.random() * 0.6);
    }
  }
  render() {
    const n = this.x.length;
    for (let i = 0; i < n; i++) {
      this.e.set(0, this.rot[i], 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.p.set(this.x[i], 0.03 + (i % 7) * 0.004, this.z[i]), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.setHex(this.col[i]));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

class LeavesRules extends Rules {
  buried = 0;
  leaves!: LeafField;
  private rakeT = 0;
  private gust = 0;
  progress() { return Math.min(1, this.buried / 100); }
  meterText() { return `${Math.round(this.buried)}%`; }
  setup() {
    const L = this.w.map.layout;
    this.leaves = new LeafField(this.w.stage.world, L.w / 2 - 0.3, L.h / 2 - 0.3);
    for (let i = 0; i < 6; i++) {
      const p = this.w.grid.randomFree(() => this.w.rng.next());
      if (p) this.leaves.add(p.x, p.z, 6, 1.5);
    }
  }
  hurt(dmg: number, cause: string) {
    this.buried = Math.min(100, this.buried + dmg * WK.leaves.hitToBuried);
    this.w.flashHit(dmg, cause);
  }
  heal(n: number) { this.buried = Math.max(0, this.buried - n); this.w.fx.popup(this.k.x, 2.6, this.k.z, `−${n}%`, 'heal'); }
  avoidPoint(x: number, z: number) {
    const c = this.leaves.centroidNear(x, z, 4);
    if (!c || c.n < 6) return null;
    const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz) || 1;
    return { x: (dx / d) * 0.6, z: (dz / d) * 0.6 };
  }
  playCard(card: CardId, level: number, x: number, z: number) {
    if (card === 'leafPile') {
      this.w.spawnUnit('leafPile', x, z, { card, level, hp: 2, maxHp: 2, speed: 1.3, r: 0.4, touchDmg: 2 });
      this.leaves.add(x, z, 10, 1.2);
      return true;
    }
    if (card === 'maple') {
      this.w.spawnUnit('maple', x, z, { card, level, hp: 8, maxHp: 8, stationary: true, life: WK.leaves.mapleLife, r: 0.45 });
      return true;
    }
    return false;
  }
  unitTick(u: Unit, dt: number) {
    u.t2 -= dt;
    if (u.kind === 'leafPile' && u.t2 <= 0) { u.t2 = 0.25; this.leaves.add(u.x, u.z, 1, 0.4); }
    if (u.kind === 'maple' && u.t2 <= 0) { u.t2 = 1 / WK.leaves.mapleRate; this.leaves.add(u.x, u.z, 1, 3); }
    return false as const;
  }
  onKill(u: Unit) { if (u.kind === 'leafPile') this.leaves.add(u.x, u.z, 8, 1.4); }
  skill() {
    this.leaves.push(this.k.x, this.k.z, 6);
    this.gust = 1.2;
    this.w.fx.ring(this.k.x, this.k.z, 8, 0.5, 0.8, 0xd9a63a, 0.6);
    sfx.paper();
  }
  update(dt: number) {
    const k = this.k;
    this.leaves.update(dt);
    if (this.gust > 0) this.gust -= dt;
    // leaves drift toward him a little in the wind
    // he rakes every 0.6 s: a cone in front of him
    this.rakeT -= dt;
    if (this.rakeT <= 0 && !k.busy) {
      this.rakeT = WK.leaves.rakeEvery;
      const got = this.leaves.rake(k.x, k.z, k.rig.facing, WK.leaves.rakeRadius, 0.9);
      if (got > 3) this.w.fx.ring(k.x, k.z, 0.4, WK.leaves.rakeRadius, 0.25, 0xd9a63a, 0.4);
    }
    const near = this.leaves.countNear(k.x, k.z, 2.5);
    this.buried = Math.max(0, Math.min(100, this.buried + (near * WK.leaves.perLeaf - WK.leaves.decay) * dt));
  }
  render() { this.leaves.render(); }
  dispose() { this.w.stage.world.remove(this.leaves.mesh); this.leaves.mesh.dispose(); }
}

// ======================================================================= Week 5 · trade union fees

class FeesRules extends DrainRules {
  coins = new Pickups('coin');
  private coinT = 1;
  constructor(w: WeekRun) { super(w, WK.fees.wallet, ' BYN', WK.fees.hitFactor); }
  setup() { this.w.stage.world.add(this.coins.group); }
  target(): KirillTarget | null {
    if (this.value > WK.fees.wallet * 0.85) return null;
    const c = this.coins.nearest(this.k.x, this.k.z, 30);
    return c ? { x: c.x, z: c.z, weight: 1.6, flee: 0.8 } : null;
  }
  playCard(card: CardId, level: number, x: number, z: number) {
    if (card === 'envelope') { this.w.spawnUnit('envelope', x, z, { card, level, hp: 3, maxHp: 3, speed: 1.7, r: 0.34 }); return true; }
    if (card === 'receipt') {
      for (let i = 0; i < 2; i++) this.w.spawnUnit('receipt', x + (i - 0.5) * 0.6, z, { card, level, hp: 1, maxHp: 1, speed: 3.2, r: 0.26, touchDmg: 4 });
      return true;
    }
    return false;
  }
  contact(u: Unit) {
    if (u.kind === 'envelope') {
      if (!u.attached && this.k.noStick <= 0) {
        u.attached = true;
        u.yaw = Math.atan2(u.x - this.k.x, u.z - this.k.z);
        this.w.fx.popup(this.k.x, 2.2, this.k.z, t('pop.fee'), 'grade-3');
      }
      return true;
    }
    return false;
  }
  skill() {
    this.hurt(WK.fees.annualFee / this.hitFactor, '');
    this.w.fx.say('kirill', () => this.k.pos, t('line.annualFee'), 2.2, 2.3, 'hero');
    sfx.debt();
  }
  update(dt: number) {
    this.coinT -= dt;
    if (this.coinT <= 0) {
      this.coinT = WK.fees.coinEvery;
      if (this.coins.count < 4) { const p = this.w.grid.randomFree(() => this.w.rng.next()); if (p) this.coins.drop(p.x, p.z, WK.fees.coinValue, 0); }
    }
    const got = this.coins.update(dt, this.k.x, this.k.z, 1.4);
    if (got) { this.heal(got); sfx.ding(); }
    // Masha signs everyone up: being near her costs money
    for (const g of this.w.guests) if (g.alive && g instanceof Masha && g.near()) this.value -= WK.fees.mashaDrain * dt;
  }
  render(time: number) { this.coins.render(time); }
  dispose() { this.w.stage.world.remove(this.coins.group); this.coins.dispose(); }
}

// ======================================================================= Week 6 · attestation (flipped AI)

class AttestationRules extends Rules {
  meterMode: MeterMode = 'count';
  beamRange = WK.attestation.beamRange;
  constructor(w: WeekRun) { super(w); }
  unsolved() {
    let n = 0;
    for (const u of this.w.horde.units) if (u.alive && u.behavior === 'flee') n++;
    return n;
  }
  progress() { return Math.min(1, this.unsolved() / WK.attestation.debtAt); }
  meterText() { return t('meter.unsolved', { n: this.unsolved(), d: WK.attestation.debtAt }); }
  debtAtBell() { return this.unsolved() >= WK.attestation.debtAt; }
  hurt() {}
  heal() {}
  setup() {
    for (let i = 0; i < WK.attestation.startTasks; i++) this.spawnTask(false);
    // he gets a free upgrade at the start of the week
    this.k.levelUp(true);
  }
  private spawnTask(star: boolean, at?: { x: number; z: number }) {
    const p = at ?? this.w.grid.randomFree(() => this.w.rng.next());
    if (!p || Math.hypot(p.x - this.k.x, p.z - this.k.z) < 3) return;
    this.w.spawnUnit(star ? 'starTask' : 'task', p.x, p.z, { card: star ? 'starTask' : 'task', hp: 2, maxHp: 2, speed: WK.attestation.taskSpeed, r: 0.3, behavior: 'flee', touchDmg: 0 });
  }
  adopt(u: Unit) { u.behavior = 'flee'; u.touchDmg = 0; }
  playCard(card: CardId, _level: number, x: number, z: number) {
    if (card === 'task') { this.spawnTask(false, { x, z }); return true; }
    if (card === 'starTask') { this.spawnTask(true, { x, z }); return true; }
    return false;
  }
  contact() { return true; }
  onKill(u: Unit) {
    if (u.kind === 'starTask') for (let i = 0; i < 2; i++) this.spawnTask(false, { x: u.x + (i - 0.5), z: u.z });
  }
  target(): KirillTarget | null {
    let best: Unit | null = null, bd = Infinity;
    for (const u of this.w.horde.units) {
      if (!u.alive || u.behavior !== 'flee') continue;
      const d = Math.hypot(u.x - this.k.x, u.z - this.k.z);
      if (d < bd) { bd = d; best = u; }
    }
    return best ? { x: (best as Unit).x, z: (best as Unit).z, weight: 2.4, flee: 0 } : null;
  }
  skill() {
    for (let i = 0; i < 5; i++) this.spawnTask(false);
    this.w.feed(t('feed.extraVariant'), 'yours');
    sfx.paper();
  }
}

// ======================================================================= Week 7 · canteen

class CanteenRules extends DrainRules {
  food = new Pickups('tray');
  private foodT = 0.5;
  private cutlets = 0;
  constructor(w: WeekRun) { super(w, 100, '', WK.canteen.hitFactor); }
  meterText() { return `${Math.max(0, Math.round(this.value))} / 100`; }
  setup() { this.w.stage.world.add(this.food.group); }
  private spots() { return Object.entries(this.w.map.layout.zones).filter(([k]) => k.startsWith('food')).map(([, p]) => p); }
  target(): KirillTarget | null {
    if (this.value > 82) return null;
    const f = this.food.nearest(this.k.x, this.k.z, 40);
    return f ? { x: f.x, z: f.z + 0.3, weight: 2.2, flee: 0.6 } : null;
  }
  playCard(card: CardId, level: number, x: number, z: number) {
    if (card === 'queue') {
      const id = 'queue' + Math.random().toString(36).slice(2, 7);
      const u = this.w.spawnUnit('queue', x, z, { card, level, stationary: true, targetable: false, life: WK.canteen.queueLife, r: 0.4, dyn: id });
      if (u) this.w.grid.setDynamic(id, { x, z, w: 3.2, d: 0.7, v: LOW });
      return true;
    }
    if (card === 'senior') { this.w.spawnUnit('senior', x, z, { card, level, hp: 4, maxHp: 4, speed: 2.4, r: 0.4, touchDmg: 4 }); return true; }
    return false;
  }
  spawnSpot(card: CardId, x: number, z: number) {
    if (card !== 'queue') return undefined;
    // the Queue may block a path, but Kirill must still reach the serving line
    const id = 'probe';
    this.w.grid.setDynamic(id, { x, z, w: 3.2, d: 0.7, v: LOW });
    const k = this.k;
    const ok = this.spots().some((p) => this.w.grid.reachable(k.x, k.z, p.x, p.z + 0.3));
    this.w.grid.setDynamic(id, null);
    if (!ok) this.w.hud.toast(t('toast.routeOpen'));
    return ok && !this.w.grid.blocked(x, z) && Math.hypot(x - k.x, z - k.z) > 2.5 ? { x, z } : null;
  }
  unitTick(u: Unit, dt: number) {
    if (u.kind !== 'senior') return false as const;
    const f = this.food.nearest(u.x, u.z, 30);
    if (!f) return false as const;
    const dx = f.x - u.x, dz = f.z + 0.3 - u.z, d = Math.hypot(dx, dz) || 1;
    u.vx = (dx / d) * u.speed; u.vz = (dz / d) * u.speed;
    u.x += u.vx * dt; u.z += u.vz * dt;
    this.w.horde.separate(u, dt);
    this.w.grid.resolve(u, u.r);
    if (d < 0.8 && this.food.take(f.x, f.z, 0.5)) {
      this.w.fx.popup(u.x, 1.8, u.z, t('pop.ate'), 'grade-3');
      sfx.paper();
    }
    return 'move' as const;
  }
  skill() {
    this.food.clear();
    this.cutlets = 5;
    this.w.feed(t('feed.outOfCutlets'), 'yours');
    this.k.say([t('line.noFood')], true);
  }
  update(dt: number) {
    this.value -= WK.canteen.hungerPerSec * dt;
    this.cutlets = Math.max(0, this.cutlets - dt);
    this.foodT -= dt;
    if (this.foodT <= 0 && this.cutlets <= 0) {
      this.foodT = WK.canteen.foodEvery;
      const free = this.spots().filter((p) => !this.food.nearest(p.x, p.z, 0.6));
      if (free.length && this.food.count < 3) { const p = this.w.rng.pick(free); this.food.drop(p.x, p.z, 1, 0); }
    }
    const k = this.k;
    const f = this.food.nearest(k.x, k.z, 1.0);
    if (f && this.value < 95 && !k.busy) {
      f.alive = false;
      this.heal(WK.canteen.foodValue);
      k.eat = 0.8;
      sfx.ding();
    }
  }
  render(time: number) { this.food.render(time); }
  dispose() { this.w.stage.world.remove(this.food.group); this.food.dispose(); }
}

// ======================================================================= Week 8 · parking

class ParkingRules extends Rules {
  crowdBlocks = true;
  kirillSpeedMul = WK.parking.speedMul;
  verbHint = 'hint.cars';
  private arrived = false;
  private gateT = 0;
  /** cars park along z (0) or across, along x (1); R / right-click turns them */
  private carRot = 0;
  private ghost!: THREE.Mesh;
  private dims() { return this.carRot ? { w: 4, d: 1.9 } : { w: 1.9, d: 4 }; }
  onRotate() {
    if (this.w.hand[this.w.selected]?.card !== 'car') return;
    this.carRot = 1 - this.carRot;
    sfx.click();
  }
  setup() {
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 1), new THREE.MeshBasicMaterial({ color: 0x6fb7e8, transparent: true, opacity: 0.35, depthWrite: false }));
    this.ghost.visible = false;
    this.w.fx.group.add(this.ghost);
  }
  render() {
    const c = this.w.cursorGround;
    this.ghost.visible = !!c && this.w.hand[this.w.selected]?.card === 'car' && !this.w.ended && !this.w.possess.active;
    if (!c || !this.ghost.visible) return;
    const d = this.dims();
    this.ghost.position.set(c.x, 0.6, c.z);
    this.ghost.scale.set(d.w, 1, d.d);
  }
  progress() { return Math.min(1, this.w.time / this.duration); }
  meterText() {
    const m = 40 + Math.floor((this.w.time / this.duration) * 20);
    return `7:${String(Math.min(59, m)).padStart(2, '0')} → 8:00`;
  }
  instantDebt() { return false; }
  debtAtBell() { return !this.arrived; }
  passedEarly() { return this.arrived; }
  hurt(dmg: number, cause: string) {
    this.k.stun = Math.max(this.k.stun, Math.min(0.8, dmg * 0.07));
    this.w.flashHit(dmg, cause);
  }
  heal() { this.k.stun = 0; }
  target(): KirillTarget { const g = this.w.map.layout.zones.goal; return { x: g.x, z: g.z, weight: 2.4, flee: 0.35 }; }
  partySpot() { return this.w.map.layout.start; }
  spawnSpot(card: CardId, x: number, z: number) {
    if (card !== 'car') return undefined;
    const k = this.k, g = this.w.map.layout.zones.goal;
    const id = 'probe';
    this.w.grid.setDynamic(id, { x, z, ...this.dims(), v: 2 });
    const free = Math.hypot(x - k.x, z - k.z) > 3.2;
    const ok = free && this.w.grid.reachable(k.x, k.z, g.x, g.z);
    this.w.grid.setDynamic(id, null);
    if (free && !ok) this.w.hud.toast(t('toast.routeOpen'));
    return ok ? { x, z } : null;
  }
  playCard(card: CardId, level: number, x: number, z: number) {
    if (card === 'car') {
      const id = 'car' + Math.random().toString(36).slice(2, 7);
      this.w.spawnUnit('car', x, z, { card, level, stationary: true, targetable: false, r: 0.9, dyn: id, yaw: this.carRot ? Math.PI / 2 : 0 });
      this.w.grid.setDynamic(id, { x, z, ...this.dims(), v: 2 });
      return true;
    }
    if (card === 'towTruck') { this.w.spawnUnit('towTruck', x, z, { card, level, hp: 6, maxHp: 6, speed: 2.6, r: 0.9 }); return true; }
    return false;
  }
  contact(u: Unit) {
    if (u.kind !== 'towTruck') return false;
    const k = this.k, s = this.w.map.layout.start;
    k.drag = WK.parking.towSec;
    k.dragPose = 'stun';
    k.dragSpeed = 2.4;
    k.dragTo = { x: s.x, z: s.z };
    this.w.fx.popup(k.x, 2.4, k.z, t('pop.towed'), 'grade-2');
    this.w.killUnit(u, false);
    return true;
  }
  skill() {
    const g = this.w.map.layout.zones.gate;
    this.w.grid.setDynamic('gate', { x: g.x, z: g.z, w: 5, d: 0.8, v: 2 });
    this.gateT = 4;
    this.w.feed(t('feed.barrier'), 'yours');
    sfx.denied();
  }
  update(dt: number) {
    if (this.gateT > 0) { this.gateT -= dt; if (this.gateT <= 0) this.w.grid.setDynamic('gate', null); }
    const g = this.w.map.layout.zones.goal;
    if (Math.hypot(this.k.x - g.x, this.k.z - g.z) < 1.4) this.arrived = true;
  }
}

// ======================================================================= Week 9 · dorm blackout

class BlackoutRules extends Rules {
  meterMode: MeterMode = 'race';
  lab = 0;
  battery = 100;
  private charging = false;
  private cut = 0;
  private sockets: { x: number; z: number; dead: number; glow: THREE.Mesh }[] = [];
  private desk!: THREE.PointLight;
  private torch!: THREE.PointLight;
  progress() { return Math.min(1, this.lab / 100); }
  meterText() { return t('meter.lab', { n: Math.floor(this.lab), b: Math.round(this.battery) }); }
  debtAtBell() { return this.lab < 100; }
  instantDebt() { return false; }
  hurt(dmg: number, cause: string) {
    this.lab = Math.max(0, this.lab - dmg * WK.blackout.hitToLab);
    this.k.standUp();
    this.k.stun = Math.max(this.k.stun, 0.35);
    this.w.flashHit(dmg, cause);
  }
  heal(n: number) { this.lab = Math.min(100, this.lab + n * 0.4); }
  setup() {
    const z = this.w.map.layout.zones;
    for (const [key, p] of Object.entries(z)) {
      if (!key.startsWith('socket')) continue;
      const glow = new THREE.Mesh(sphere(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0x5fe07a }));
      glow.position.set(p.x, 0.5, p.z);
      this.w.stage.world.add(glow);
      this.sockets.push({ x: p.x, z: p.z, dead: 0, glow });
    }
    this.desk = new THREE.PointLight(0xffd9a0, 6, 9, 1.6);
    this.desk.position.set(z.desk.x, 1.4, z.desk.z - 0.8);
    this.torch = new THREE.PointLight(0xdfe8ff, 5, 7, 1.6);
    this.w.stage.world.add(this.desk, this.torch);
  }
  private powered() { return this.sockets.filter((s) => s.dead <= 0); }
  target(): KirillTarget | null {
    const k = this.k;
    if (this.battery < WK.blackout.lowBattery || this.charging) {
      const ps = this.powered();
      if (ps.length) {
        const s = ps.reduce((a, b) => (Math.hypot(a.x - k.x, a.z - k.z) < Math.hypot(b.x - k.x, b.z - k.z) ? a : b));
        return { x: s.x, z: s.z, weight: 2.2, flee: 0.5 };
      }
    }
    const d = this.w.map.layout.zones.desk;
    return { x: d.x, z: d.z, sit: true, face: Math.PI, weight: 2.2, flee: 0.4 };
  }
  playCard(card: CardId, level: number, x: number, z: number) {
    if (card === 'fuse') { this.w.spawnUnit('fuse', x, z, { card, level, hp: 4, maxHp: 4, stationary: true, life: WK.blackout.fuseLife, r: 0.4 }); return true; }
    if (card === 'roach') {
      for (let i = 0; i < 3; i++) this.w.spawnUnit('roach', x + (Math.random() - 0.5), z + (Math.random() - 0.5), { card, level, hp: 1, maxHp: 1, speed: 3.2, r: 0.2, touchDmg: 2 });
      return true;
    }
    return false;
  }
  skill() {
    this.cut = 5;
    this.w.stage.dim(0.2, 'dark');
    this.w.feed(t('feed.powerCut'), 'yours');
    sfx.denied();
  }
  update(dt: number) {
    const k = this.k;
    // fuses kill sockets around them while they live
    for (const s of this.sockets) {
      s.dead = 0;
      for (const u of this.w.horde.units) if (u.alive && u.kind === 'fuse' && Math.hypot(u.x - s.x, u.z - s.z) < WK.blackout.fuseRadius) s.dead = 1;
      (s.glow.material as THREE.MeshBasicMaterial).color.setHex(s.dead ? 0x6a1a1a : 0x5fe07a);
    }
    if (this.cut > 0) { this.cut -= dt; if (this.cut <= 0) this.w.stage.setLighting('dark'); }
    const atSocket = this.powered().some((s) => Math.hypot(s.x - k.x, s.z - k.z) < 1.0);
    if (atSocket && (this.battery < WK.blackout.lowBattery || this.charging)) {
      this.charging = true;
      this.battery = Math.min(100, this.battery + WK.blackout.chargePerSec * dt);
      if (this.battery >= 95) this.charging = false;
    } else if (!atSocket && this.charging && this.powered().length === 0) this.charging = false;
    if (k.sitting && this.battery > 0) {
      const pasha = this.w.pashaOn ? 0.7 : 1;
      this.lab = Math.min(100, this.lab + WK.blackout.workPerSec * pasha * (this.cut > 0 ? 0.5 : 1) * dt);
      this.battery = Math.max(0, this.battery - WK.blackout.drainPerSec * (this.cut > 0 ? 2 : 1) * dt);
    }
    if (k.sitting && this.battery < WK.blackout.lowBattery) k.standUp();
    // lights: desk lamp, his phone flashlight
    this.desk.intensity = this.battery > 0 && k.sitting ? 6 : 1.5;
    this.torch.position.set(k.x, 1.6, k.z);
    this.torch.intensity = this.cut > 0 ? 2 : 4;
  }
  dispose() {
    for (const s of this.sockets) this.w.stage.world.remove(s.glow);
    this.w.stage.world.remove(this.desk, this.torch);
  }
}

// ======================================================================= Week 10 · dean's office (reverse stealth)

class DeansRules extends Rules {
  suspicion = 0;
  kirillSpeedMul = WK.deans.speedMul;
  duelFoe: DuelFoe = 'dean';
  verbHint = 'hint.gaze';
  /** spotted = the Dean steps out: Kirill comes in fresh-ish */
  duelHp() { return 0.8; }
  /** a sneaking student doesn't pull an All-Nighter */
  allNighterReady() { return false; }
  private turnRate() { return this.w.guests.some((g) => g.alive && g.name === 'masha') ? 2.6 : 1.9; }
  /** you steer the gaze with the mouse; without a mouse (tests, idle) they sweep on their own */
  private steered() { return !!this.w.cursorGround && !this.w.possess.active; }
  private arrived = false;
  private danger: Uint8Array;
  private dangerT = 0;
  private cones = new Map<Unit, THREE.Mesh>();
  private focus = 0;
  private seen = false;
  constructor(w: WeekRun) {
    super(w);
    this.danger = new Uint8Array(w.grid.cols * w.grid.rows);
  }
  progress() { return Math.min(1, this.suspicion / 100); }
  meterText() { return `${Math.round(this.suspicion)}%`; }
  passedEarly() { return this.arrived; }
  hurt(dmg: number, cause: string) {
    this.suspicion = Math.min(100, this.suspicion + dmg * WK.deans.noisePerDmg);
    this.k.stun = Math.max(this.k.stun, 0.3);
    this.w.flashHit(dmg, cause);
  }
  heal(n: number) { this.suspicion = Math.max(0, this.suspicion - n * 2); }
  setup() {
    const z = this.w.map.layout.zones;
    this.addSecretary(z.sec0.x, z.sec0.z);
    this.addSecretary(z.sec1.x, z.sec1.z);
  }
  private addSecretary(x: number, z: number, level = 1) {
    const u = this.w.spawnUnit('secretary', x, z, { card: 'secretary', level, stationary: true, targetable: false, r: 0.35, behavior: 'wander' });
    if (!u) return;
    u.t2 = Math.random() * 10;
    const geo = new THREE.CircleGeometry(WK.deans.range, 28, -WK.deans.halfAngle, WK.deans.halfAngle * 2);
    geo.rotateX(-Math.PI / 2);
    const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.16, depthWrite: false }));
    cone.renderOrder = 2;
    this.w.fx.group.add(cone);
    this.cones.set(u, cone);
  }
  spawnSpot(card: CardId, x: number, z: number) {
    if (card !== 'secretary') return undefined;
    // secretaries only work behind the glass
    return { x: Math.max(-16, Math.min(16, x)), z: Math.max(-12.2, Math.min(-8.2, z)) };
  }
  playCard(card: CardId, level: number, x: number, z: number) {
    if (card === 'secretary') { this.addSecretary(x, z, level); return true; }
    if (card === 'teacup') { this.w.spawnUnit('teacup', x, z, { card, level, stationary: true, targetable: false, r: 0.25, behavior: 'wander' }); return true; }
    return false;
  }
  /** cone angle in "atan2(dx,dz)" space: 0 = facing south (+z) into the hall */
  private yawOf(u: Unit, ahead = 0) {
    const k = this.k;
    if (this.focus > ahead) return Math.atan2(k.x - u.x, k.z - u.z);
    const masha = this.w.guests.some((g) => g.alive && g.name === 'masha');
    return Math.sin((this.w.time + ahead) * WK.deans.sweepSpeed * (masha ? 1.8 : 1) + u.t2) * WK.deans.sweep;
  }
  private glass = (_x: number, z: number) => z < -6.4;
  private sees(u: Unit, x: number, z: number, yaw = u.yaw, extra = 0) {
    const dx = x - u.x, dz = z - u.z, d = Math.hypot(dx, dz);
    if (d > WK.deans.range) return false;
    let a = Math.atan2(dx, dz) - yaw;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(a) > WK.deans.halfAngle + extra) return false;
    return this.w.grid.sees(u.x, u.z, x, z, this.glass);
  }
  target(): KirillTarget {
    const g = this.w.map.layout.zones.goal;
    return { x: g.x, z: g.z, weight: 2.4, flee: 0.3, avoid: this.danger };
  }
  skill() {
    this.focus = 2;
    this.w.feed(t('feed.kettle'), 'yours');
    sfx.whistle();
  }
  update(dt: number) {
    const k = this.k;
    this.focus = Math.max(0, this.focus - dt);
    const secs = [...this.cones.keys()].filter((u) => u.alive);
    const cur = this.w.cursorGround;
    for (const u of secs) {
      let want: number;
      if (this.focus > 0) want = Math.atan2(k.x - u.x, k.z - u.z);
      else if (this.steered() && cur) want = Math.max(-1.35, Math.min(1.35, Math.atan2(cur.x - u.x, cur.z - u.z)));
      else want = this.yawOf(u);
      // they turn their heads at a human speed, so Kirill can slip past a fast sweep
      let d = want - u.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const step = this.turnRate() * dt * (this.focus > 0 ? 2 : 1);
      u.yaw += Math.max(-step, Math.min(step, d));
    }
    // where it's dangerous to stand right now (for his pathing)
    this.dangerT -= dt;
    if (this.dangerT <= 0) {
      this.dangerT = 0.15;
      const g = this.w.grid;
      this.danger.fill(0);
      // he plans around where the cones are now and where they'll sweep in the next 0.6 s
      for (const u of secs) for (const ahead of [0, 0.3, 0.6]) {
        // auto-sweep is predictable; a player-steered gaze could turn either way
        const steered = this.steered();
        const yaw = steered ? u.yaw : this.yawOf(u, ahead);
        const extra = steered ? this.turnRate() * ahead * 0.5 : 0;
        const c0 = g.col(u.x - WK.deans.range), c1 = g.col(u.x + WK.deans.range);
        const r0 = g.row(u.z - 1), r1 = g.row(u.z + WK.deans.range);
        for (let r = Math.max(0, r0); r <= Math.min(g.rows - 1, r1); r++)
          for (let c = Math.max(0, c0); c <= Math.min(g.cols - 1, c1); c++) {
            const i = r * g.cols + c;
            if (this.danger[i]) continue;
            if (this.sees(u, g.cx(c), g.cz(r), yaw, extra)) this.danger[i] = 1;
          }
      }
      // grow danger by one cell: cell centres can hide behind cover while his body still shows
      const grown = this.danger.slice();
      for (let r = 1; r < g.rows - 1; r++)
        for (let c = 1; c < g.cols - 1; c++) {
          if (!this.danger[r * g.cols + c]) continue;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) grown[(r + dr) * g.cols + c + dc] = 1;
        }
      this.danger.set(grown);
      // the goal itself is always allowed: he dashes the last step
      const goal = this.w.map.layout.zones.goal;
      this.danger[g.row(goal.z) * g.cols + g.col(goal.x)] = 0;
    }
    this.seen = secs.some((u) => this.sees(u, k.x, k.z));
    // if he's actually visible, wherever he stands is dangerous — so he moves
    if (this.seen) this.danger[this.w.grid.row(k.z) * this.w.grid.cols + this.w.grid.col(k.x)] = 1;
    const masha = this.w.guests.some((g) => g.alive && g.name === 'masha');
    if (this.seen) this.suspicion = Math.min(100, this.suspicion + WK.deans.seenPerSec * (masha ? 1.4 : 1) * dt);
    else this.suspicion = Math.max(0, this.suspicion - WK.deans.decayPerSec * dt);
    // teacups clink when he brushes past
    for (const u of this.w.horde.units) {
      if (!u.alive || u.kind !== 'teacup') continue;
      if (Math.hypot(u.x - k.x, u.z - k.z) < 1.0) {
        this.focus = 2.5;
        this.suspicion = Math.min(100, this.suspicion + 20);
        this.w.fx.popup(u.x, 1.2, u.z, t('pop.clink'), 'grade-3');
        sfx.ding();
        this.w.killUnit(u, false);
      }
    }
    const g = this.w.map.layout.zones.goal;
    if (Math.hypot(k.x - g.x, k.z - g.z) < 1.1) this.arrived = true;
  }
  render() {
    for (const [u, cone] of this.cones) {
      cone.visible = u.alive;
      if (!u.alive) continue;
      cone.position.set(u.x, 0.06, u.z);
      // CircleGeometry's 0 angle is +x; our yaw 0 is +z
      cone.rotation.y = u.yaw - Math.PI / 2;
      const mat = cone.material as THREE.MeshBasicMaterial;
      mat.color.setHex(this.seen && this.sees(u, this.k.x, this.k.z) ? 0xff4a3a : 0xffe08a);
      mat.opacity = this.focus > 0 ? 0.28 : this.steered() ? 0.22 : 0.16;
    }
  }
  dispose() { for (const c of this.cones.values()) this.w.fx.group.remove(c); }
}

// ======================================================================= Week 11 · assembly hall

class AssemblyRules extends Rules {
  crowdBlocks = true;
  // still here at 22:00 (or the clock runs out)? He's called on stage to present: Masha and Sonya take over
  duelFoe: DuelFoe = 'nina';
  climax: 'duel' | 'race' | 'show' = 'show';
  duelAtBell = true;
  kirillSpeedMul = WK.assembly.speedMul;
  duration = WK.assembly.duration;
  minutes = 0;
  private exited = false;
  private host!: Masha;
  private actT = 3;
  private locks = new Map<number, number>();
  private encore = 0;
  private seatT = 1.5;
  progress() { return Math.min(1, this.clock() / 120); }
  private clock() { return this.w.time * WK.assembly.minutesPerSec + this.minutes; }
  meterText() {
    const m = Math.floor(this.clock());
    return `${20 + Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} → 22:00`;
  }
  passedEarly() { return this.exited; }
  debtAtBell() { return !this.exited; }
  hurt(dmg: number, cause: string) {
    this.minutes += dmg * WK.assembly.minutesPerDmg;
    this.k.stun = Math.max(this.k.stun, 0.25);
    this.w.flashHit(dmg, cause);
  }
  heal(n: number) { this.minutes -= n * 0.5; }
  setup() {
    const s = this.w.map.layout.zones.stage;
    this.host = new Masha(this.w, s.x, s.z, 1, true);
    this.host.elev = 1.15;
    this.w.guests.push(this.host);
    this.k.sitting = true;
  }
  private open(i: number) { return !(this.encore > 0) && !this.locks.has(i); }
  target(): KirillTarget | null {
    if (this.seatT > 0) return null;
    const k = this.k;
    const exits = this.w.map.layout.exits;
    let best = -1, bd = Infinity;
    exits.forEach((e, i) => { if (this.open(i)) { const d = Math.hypot(e.x - k.x, e.z - k.z); if (d < bd) { bd = d; best = i; } } });
    if (best < 0) return null;
    return { x: exits[best].x, z: exits[best].z, weight: 2.3, flee: 0.35 };
  }
  partySpot() { const s = this.w.map.layout.zones.stage; return { x: s.x, z: s.z + 3 }; }
  playCard(card: CardId, level: number, x: number, z: number) {
    if (card === 'speaker') { this.w.spawnUnit('speaker', x, z, { card, level, hp: 5, maxHp: 5, stationary: true, r: 0.45, t2: 3 }); return true; }
    if (card === 'applause') { this.w.spawnUnit('applause', x, z, { card, level, hp: 2, maxHp: 2, speed: 4.5, r: 0.55, touchDmg: 0 }); return true; }
    return false;
  }
  unitTick(u: Unit, dt: number) {
    if (u.kind !== 'speaker') return false as const;
    u.t2 -= dt;
    if (u.t2 <= 0) {
      u.t2 = WK.assembly.speechEvery;
      this.minutes += 15;
      this.w.fx.say('speaker' + u.index, () => new THREE.Vector3(u.x, 0, u.z), t('line.speech'), 2, 2);
      this.w.fx.popup(u.x, 2.2, u.z, '+15 min', 'grade-3');
    }
    return false as const;
  }
  contact(u: Unit) {
    if (u.kind !== 'applause') return false;
    const k = this.k;
    k.drag = 0.7;
    k.dragPose = 'stun';
    k.dragSpeed = 4;
    k.dragTo = { x: k.x, z: Math.max(-7, k.z - 3) };
    this.w.fx.popup(k.x, 2.4, k.z, t('pop.applause'), 'grade-3');
    this.w.killUnit(u, false);
    return true;
  }
  private lockDoor(i: number, sec: number) {
    const e = this.w.map.layout.exits[i];
    this.locks.set(i, sec);
    this.w.grid.setDynamic('door' + i, { x: e.x, z: e.z, w: 1.6, d: 1.6, v: 2 });
  }
  skill() {
    this.encore = 5;
    this.w.map.layout.exits.forEach((_, i) => this.lockDoor(i, 5));
    this.w.feed(t('feed.encore'), 'yours');
    sfx.denied();
  }
  update(dt: number) {
    if (this.seatT > 0) { this.seatT -= dt; if (this.seatT <= 0) this.k.standUp(); }
    this.encore = Math.max(0, this.encore - dt);
    for (const [i, s] of [...this.locks]) {
      if (s - dt <= 0) { this.locks.delete(i); this.w.grid.setDynamic('door' + i, null); }
      else this.locks.set(i, s - dt);
    }
    // Masha announces another act every 10 s and her followers block a door
    this.actT -= dt;
    if (this.actT <= 0) {
      this.actT = WK.assembly.actEvery;
      this.minutes += 15;
      this.host.say(pickLine(LINES.mashaHost), 2.4);
      this.w.feed(t('feed.anotherAct'), 'boss');
      const k = this.k, exits = this.w.map.layout.exits;
      let best = 0, bd = Infinity;
      exits.forEach((e, i) => { const d = Math.hypot(e.x - k.x, e.z - k.z); if (d < bd && !this.locks.has(i)) { bd = d; best = i; } });
      this.lockDoor(best, WK.assembly.followerSec);
      const e = exits[best];
      this.w.spawnUnit('fan', e.x, e.z, { stationary: true, targetable: false, r: 0.3, life: WK.assembly.followerSec, behavior: 'wander' });
    }
    const exits = this.w.map.layout.exits;
    exits.forEach((e, i) => { if (this.open(i) && Math.hypot(e.x - this.k.x, e.z - this.k.z) < 1.3) this.exited = true; });
  }
  dispose() { for (const i of this.locks.keys()) this.w.grid.setDynamic('door' + i, null); }
}

// ======================================================================= Week 12 · nobody showed up

class AbsencesRules extends PileRules {
  private rollCall = 0;
  constructor(w: WeekRun) { super(w, WK.absences.limit, 'Н'); }
  meterText() { return t('meter.hours', { n: this.w.pile.toFixed(1), l: this.limit }); }
  playCard(card: CardId, level: number, x: number, z: number) {
    if (card === 'absence') {
      for (let i = 0; i < 2; i++) this.w.spawnUnit('absence', x + (i - 0.5) * 0.6, z, { card, level, hp: 1, maxHp: 1, speed: 2.8, r: 0.3, pile: 1, touchDmg: 2 });
      return true;
    }
    if (card === 'register') { this.w.spawnUnit('register', x, z, { card, level, hp: 6, maxHp: 6, stationary: true, life: 18, r: 0.45, t2: 1 }); return true; }
    return false;
  }
  unitTick(u: Unit, dt: number) {
    if (u.kind === 'register') {
      u.t2 -= dt;
      if (u.t2 <= 0) {
        u.t2 = WK.absences.registerEvery;
        const k = this.k, dx = k.x - u.x, dz = k.z - u.z, d = Math.hypot(dx, dz) || 1;
        this.w.spawnUnit('absence', u.x + (dx / d) * 0.6, u.z + (dz / d) * 0.6, { card: 'absence', projectile: true, targetable: false, r: 0.28, pile: 1, vx: (dx / d) * 5, vz: (dz / d) * 5, speed: 5, life: 5 });
        sfx.place();
      }
    }
    if (u.kind === 'absence' && this.rollCall > 0 && !u.projectile) u.t2 = 1;
    return false as const;
  }
  skill() {
    this.rollCall = 3;
    for (const u of this.w.horde.units) if (u.alive && u.kind === 'absence' && !u.projectile) u.speed *= 2.5;
    this.w.feed(t('feed.rollCall'), 'yours');
    sfx.alarm();
  }
  update(dt: number) {
    if (this.rollCall > 0) {
      this.rollCall -= dt;
      if (this.rollCall <= 0) for (const u of this.w.horde.units) if (u.alive && u.kind === 'absence' && !u.projectile && u.t2 > 0) { u.speed /= 2.5; u.t2 = 0; }
    }
  }
}

// ======================================================================= Week 13 · New Year's table

class NewYearRules extends Rules {
  meterMode: MeterMode = 'race';
  prep = 0;
  private garlandCd = 0;
  verbHint = 'hint.drag';
  /** the food you're carrying (click and drag Olivier or tangerines) */
  private held: Unit | null = null;
  onPointerDown(x: number, z: number) {
    let best: Unit | null = null, bd = 1.1;
    for (const u of this.w.horde.units) {
      if (!u.alive || u.pull <= 0) continue;
      const d = Math.hypot(u.x - x, u.z - z);
      if (d < bd) { bd = d; best = u; }
    }
    this.held = best;
    if (best) sfx.click();
    return !!best;
  }
  onPointerMove(x: number, z: number) {
    const u = this.held;
    if (!u || !u.alive) { this.held = null; return; }
    u.x = x; u.z = z;
    this.w.grid.resolve(u, u.r);
  }
  onPointerUp() { this.held = null; }
  progress() { return Math.min(1, this.prep / 100); }
  meterText() { return t('meter.prep', { n: Math.floor(this.prep) }); }
  debtAtBell() { return this.prep < 100; }
  instantDebt() { return false; }
  hurt(dmg: number, cause: string) {
    this.prep = Math.max(0, this.prep - dmg * WK.newYear.hitToPrep);
    this.k.standUp();
    this.k.stun = Math.max(this.k.stun, 0.3);
    this.w.flashHit(dmg, cause);
  }
  heal(n: number) { this.prep = Math.min(100, this.prep + n * 0.5); }
  setup() {
    const z = this.w.map.layout.zones;
    this.w.guests.push(new Romchik(this.w, z.romchik.x, z.romchik.z, 1, true), new Sonya(this.w, z.sonya.x, z.sonya.z, 1, true));
  }
  /** the party is by the tree */
  partySpot() { return { x: 12.5, z: -4 }; }

  private want(): Unit | null {
    const k = this.k;
    let best: Unit | null = null, bs = 0;
    for (const u of this.w.horde.units) {
      if (!u.alive || u.pull <= 0) continue;
      const d = Math.hypot(u.x - k.x, u.z - k.z);
      const radius = u.kind === 'olivier' ? 7 : 4;
      if (d > radius) continue;
      const s = u.pull / Math.max(1, d);
      if (s > bs) { bs = s; best = u; }
    }
    return best;
  }
  target(): KirillTarget {
    const u = this.want();
    if (u) return { x: u.x, z: u.z, weight: 2.4, flee: 0.2 };
    const s = this.w.map.layout.zones.seat;
    return { x: s.x, z: s.z, sit: true, face: Math.PI, weight: 2.2, flee: 0.3 };
  }
  playCard(card: CardId, level: number, x: number, z: number) {
    if (card === 'olivier') { this.w.spawnUnit('olivier', x, z, { card, level, stationary: true, targetable: false, r: 0.42, pull: 3, behavior: 'wander' }); return true; }
    if (card === 'tangerine') {
      for (let i = 0; i < 3; i++) this.w.spawnUnit('tangerine', x + (i - 1) * 0.5, z + (Math.random() - 0.5) * 0.5, { card, level, stationary: true, targetable: false, r: 0.2, pull: 1, behavior: 'wander' });
      return true;
    }
    if (card === 'garland') {
      const u = this.w.spawnUnit('garland', x, z, { card, level, stationary: true, targetable: false, r: 0.3, life: 20, behavior: 'wander' });
      if (u) { const d = this.w.fx.disc(WK.newYear.garlandRadius, 0xff6ad8, 0.1); d.position.set(x, 0.035, z); this.w.addZone(x, z, 0, 20, d); }
      return true;
    }
    return false;
  }
  contact(u: Unit) {
    if (u.pull > 0) {
      // he eats it
      this.k.eat = u.kind === 'olivier' ? WK.newYear.olivierEat : WK.newYear.tangerineEat;
      this.k.standUp();
      this.w.fx.popup(u.x, 1.6, u.z, t('pop.yum'), 'grade-3');
      this.w.killUnit(u, false);
      return true;
    }
    return u.kind === 'garland';
  }
  skill() {
    this.k.standUp();
    this.k.dance = 3;
    this.w.feed(t('feed.chimes'), 'yours');
    sfx.levelUp();
  }
  update(dt: number) {
    const k = this.k;
    this.garlandCd = Math.max(0, this.garlandCd - dt);
    if (this.garlandCd <= 0)
      for (const u of this.w.horde.units)
        if (u.alive && u.kind === 'garland' && Math.hypot(u.x - k.x, u.z - k.z) < WK.newYear.garlandRadius) {
          k.standUp(); k.dance = 1.5; this.garlandCd = 3; k.say(LINES.kirillDance); break;
        }
    if (k.sitting) this.prep = Math.min(100, this.prep + WK.newYear.prepPerSec * (this.w.pashaOn ? 0.7 : 1) * dt);
  }
}

// ======================================================================= Week 14 · credit week

class CreditsRules extends Rules {
  meterMode: MeterMode = 'count';
  beamRange = WK.credits.beamRange;
  private passed: { x: number; z: number; mini: boolean }[] = [];
  left() {
    let n = 0;
    for (const u of this.w.horde.units) if (u.alive && (u.kind === 'credit' || u.kind === 'cgCredit')) n++;
    return n;
  }
  progress() { return Math.min(1, this.left() / (WK.credits.debtAbove + 1)); }
  meterText() { return t('meter.credits', { n: this.left(), d: WK.credits.debtAbove }); }
  debtAtBell() { return this.left() > WK.credits.debtAbove; }
  instantDebt() { return false; }
  hurt(dmg: number, cause: string) { this.k.stun = Math.max(this.k.stun, Math.min(0.6, dmg * 0.05)); this.w.flashHit(dmg, cause); }
  heal() {}
  setup() {
    for (let i = 0; i < WK.credits.start; i++) {
      const p = this.w.grid.randomFree(() => this.w.rng.next());
      if (p && Math.hypot(p.x - this.k.x, p.z - this.k.z) > 3) this.credit(p.x, p.z, false);
    }
  }
  private credit(x: number, z: number, mini: boolean) {
    return this.w.spawnUnit('credit', x, z, { card: 'credit', hp: mini ? 2 : 4, maxHp: mini ? 2 : 4, speed: 1.4, r: mini ? 0.24 : 0.32, scale: mini ? 0.7 : 1, mini, touchDmg: 3 });
  }
  shadyHelps() {
    const shady = this.w.guests.some((g) => g.alive && g.name === 'shady');
    const busy = this.w.guests.some((g) => g.alive && g.name === 'sonya');
    return shady && !busy;
  }
  playCard(card: CardId, _level: number, x: number, z: number) {
    if (card === 'credit') { this.credit(x, z, false); return true; }
    if (card === 'cgCredit') { this.w.spawnUnit('cgCredit', x, z, { card, hp: 12, maxHp: 12, speed: 0.9, r: 0.6, touchDmg: 5 }); return true; }
    return false;
  }
  damage(u: Unit, dmg: number) {
    if (u.kind !== 'cgCredit' || this.shadyHelps()) return false;
    // nobody passes computer graphics without Shady: only stunned
    u.hp -= dmg;
    u.flash = 0.08;
    if (u.hp <= 1) {
      u.hp = u.maxHp;
      u.t2 = 2;
      this.w.fx.popup(u.x, 2, u.z, t('pop.cgStunned'), 'skill');
    }
    return true;
  }
  unitTick(u: Unit, dt: number) {
    if (u.kind === 'cgCredit' && u.t2 > 0) { u.t2 -= dt; return 'skip' as const; }
    return false as const;
  }
  onKill(u: Unit) {
    if (u.kind !== 'credit') return;
    this.passed.push({ x: u.x, z: u.z, mini: u.mini });
    this.w.fx.popup(u.x, 1.6, u.z, t('pop.passed'), 'heal');
    // hydra: a full credit splits into two smaller ones
    if (!u.mini) for (let i = 0; i < 2; i++) this.credit(u.x + (i - 0.5) * 0.7, u.z, true);
  }
  target(): KirillTarget | null {
    let best: Unit | null = null, bd = Infinity;
    for (const u of this.w.horde.units) {
      if (!u.alive || (u.kind !== 'credit' && !(u.kind === 'cgCredit' && this.shadyHelps()))) continue;
      const d = Math.hypot(u.x - this.k.x, u.z - this.k.z);
      if (d < bd) { bd = d; best = u; }
    }
    return best ? { x: (best as Unit).x, z: (best as Unit).z, weight: 2, flee: 0.4 } : null;
  }
  skill() {
    const back = this.passed.splice(-5);
    for (const p of back) this.credit(p.x, p.z, p.mini);
    this.w.feed(t('feed.retake', { n: back.length }), 'yours');
    sfx.paper();
  }
}

// ======================================================================= Week 15 · exams

class FinalExam {
  group = new THREE.Group();
  private t = 0;
  private wave = -1;
  private waveHit = false;
  constructor(private w: WeekRun, public x: number, public z: number) {
    // THE FINAL EXAM: a towering stack of papers with a face
    const paper = 0xf6f3ea;
    for (let i = 0; i < 9; i++) {
      const m = part(box(2.2 - i * 0.08, 0.32, 1.6 - i * 0.05), i % 2 ? paper : 0xece6d6);
      m.position.set((Math.random() - 0.5) * 0.15, 0.16 + i * 0.32, 0);
      m.rotation.y = (Math.random() - 0.5) * 0.25;
      this.group.add(m);
    }
    for (const sx of [-0.45, 0.45]) {
      const e = part(sphere(0.22, 12, 10), 0xffffff);
      e.position.set(sx, 2.3, 0.82);
      const p = part(sphere(0.11, 10, 8), 0x1d1613, { outline: false });
      p.position.set(sx, 2.28, 1.0);
      this.group.add(e, p);
    }
    const mouth = part(box(1.0, 0.25, 0.1), 0x8a1f24);
    mouth.position.set(0, 1.5, 0.82);
    this.group.add(mouth);
    this.group.position.set(x, 0, z);
    w.stage.world.add(this.group);
  }
  update(dt: number) {
    this.t += dt;
    this.group.scale.y = 1 + Math.sin(this.t * 3) * 0.03;
    const every = balance.bosses.finalExam.shockwaveEverySec;
    if (this.t >= every) {
      this.t = 0;
      this.wave = 0;
      this.waveHit = false;
      this.w.fx.ring(this.x, this.z, 0.5, 20, 20 / balance.bosses.finalExam.ringSpeed, 0xc0392b, 0.85);
      this.w.stage.shake(0.15);
      sfx.boom();
    }
    if (this.wave >= 0) {
      this.wave += balance.bosses.finalExam.ringSpeed * dt;
      const k = this.w.kirill;
      const d = Math.hypot(k.x - this.x, k.z - this.z);
      if (!this.waveHit && Math.abs(d - this.wave) < 0.5) {
        this.waveHit = true;
        this.w.rules.hurt(balance.bosses.finalExam.shockwaveDmg, t('cause.exam'));
      }
      if (this.wave > 20) this.wave = -1;
    }
  }
  dispose() { this.w.stage.world.remove(this.group); }
}

class ExamsRules extends SanityRules {
  meterMode: MeterMode = 'count';
  duelFoe: DuelFoe = 'finalExam';
  duelAtBell = true;
  /** burning out on sanity is a straight debt; otherwise THE FINAL EXAM settles it */
  duelOnInstant = false;
  /** unsolved tests and lost sanity both wear him down for the duel */
  duelHp() {
    const left = Math.max(0, this.tests) / balance.weeks['15'].tests;
    const lost = 1 - this.k.sanity / this.k.maxSanity;
    return Math.max(0.3, Math.min(1, 1 - 0.45 * left - 0.45 * lost));
  }
  beamRange = WK.exams.beamRange;
  tests: number = balance.weeks['15'].tests;
  private spawnT = 0.5;
  private boss!: FinalExam;
  progress() { return Math.min(1, this.tests / balance.weeks['15'].tests); }
  meterText() { return t('meter.tests', { n: Math.max(0, this.tests) }); }
  instantDebt() { return this.k.sanity <= 0; }
  debtAtBell() { return this.tests > 0; }
  meter2() { return { label: t('meter.sanity'), p: Math.max(0, 1 - this.k.sanity / this.k.maxSanity) }; }
  setup() {
    this.boss = new FinalExam(this.w, 0, -10.6);
    this.w.introduce('finalExam');
  }
  private test(x: number, z: number) {
    return this.w.spawnUnit('quiz', x, z, { card: 'test', hp: 3, maxHp: 3, speed: 1.0, r: 0.3, touchDmg: 0, behavior: 'wander' });
  }
  playCard(card: CardId, _level: number, x: number, z: number) {
    if (card === 'test') { this.tests += balance.weekUnits.test.addsTests; this.test(x, z); return true; }
    return false;
  }
  ticketBonus() { this.tests += 20; this.w.hud.toast(t('toast.moreTests')); return true; }
  contact(u: Unit) { return u.card === 'test'; }
  onKill(u: Unit) {
    if (u.card !== 'test') return;
    this.tests -= balance.weekUnits.test.solvedRemoves;
    this.w.fx.popup(u.x, 1.6, u.z, `−${balance.weekUnits.test.solvedRemoves}`, 'heal');
  }
  target(): KirillTarget | null {
    let best: Unit | null = null, bd = Infinity;
    for (const u of this.w.horde.units) {
      if (!u.alive || u.card !== 'test') continue;
      const d = Math.hypot(u.x - this.k.x, u.z - this.k.z);
      if (d < bd) { bd = d; best = u; }
    }
    return best ? { x: (best as Unit).x, z: (best as Unit).z, weight: 2, flee: 0.7 } : null;
  }
  skill() {
    // Everything at Once: the semester's greatest hits together
    const k = this.k;
    k.drone = 4;
    k.stun = Math.max(k.stun, 1.5);
    k.panic = 3;
    k.panicTarget = this.w.rng.pick(this.w.map.layout.exits);
    this.w.feed(t('feed.everything'), 'yours');
    sfx.alarm();
  }
  update(dt: number) {
    this.boss.update(dt);
    this.spawnT -= dt;
    let onMap = 0;
    for (const u of this.w.horde.units) if (u.alive && u.card === 'test') onMap++;
    if (this.spawnT <= 0 && onMap < balance.weeks['15'].maxTestsOnMap && this.tests > onMap * 10) {
      this.spawnT = balance.weeks['15'].testSpawnSec;
      const p = this.w.grid.randomFree(() => this.w.rng.next());
      if (p && Math.hypot(p.x - this.k.x, p.z - this.k.z) > 3) this.test(p.x, p.z);
    }
  }
  dispose() { this.boss.dispose(); }
}

// ======================================================================= registry

export function makeRules(w: WeekRun): Rules {
  switch (w.def.id) {
    case 1: return new FoyerRules(w);
    case 2: return new DrawingsRules(w);
    case 3: return new GymRules(w);
    case 4: return new LeavesRules(w);
    case 5: return new FeesRules(w);
    case 6: return new AttestationRules(w);
    case 7: return new CanteenRules(w);
    case 8: return new ParkingRules(w);
    case 9: return new BlackoutRules(w);
    case 10: return new DeansRules(w);
    case 11: return new AssemblyRules(w);
    case 12: return new AbsencesRules(w);
    case 13: return new NewYearRules(w);
    case 14: return new CreditsRules(w);
    case 15: return new ExamsRules(w);
    default: return new SanityRules(w);
  }
}

