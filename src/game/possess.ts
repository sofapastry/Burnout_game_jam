import * as THREE from 'three';
import type { Unit, UnitKind } from '../horde/units';
import type { WeekRun } from './week';
import { sfx } from '../core/audio';
import { localize } from '../i18n';
import { RU_POSSESS } from '../data/ru';
import { juice } from '../core/audio';
import { t } from '../i18n';
import { boon } from './boons';

// Possession: control one unit in third person (combo, dash, sprint), hits drop coins.

const EYE: Partial<Record<UnitKind, number>> = {
  quiz: 0.6, deadline: 0.5, partner: 0.75, medBall: 0.55, drawing: 0.38,
  leafPile: 0.5, envelope: 0.55, receipt: 0.55, senior: 1.4, towTruck: 1.6, roach: 0.22, absence: 0.6, credit: 0.6, applause: 0.8,
};
const POSSESS_EN: Partial<Record<UnitKind, { name: string; attack: string }>> = {
  quiz: { name: 'Pop Quiz', attack: 'Lunge' },
  deadline: { name: 'Deadline', attack: 'DETONATE' },
  partner: { name: 'Group Project Partner', attack: 'Lunge' },
  medBall: { name: 'Medicine Ball', attack: 'Charge' },
  drawing: { name: 'A1 Drawing', attack: 'Slide' },
  leafPile: { name: 'Leaf Pile', attack: 'Lunge' },
  envelope: { name: 'Fee Envelope', attack: 'Lunge' },
  receipt: { name: 'Receipt', attack: 'Lunge' },
  senior: { name: 'Hungry Senior', attack: 'Charge' },
  towTruck: { name: 'Tow Truck', attack: 'Charge' },
  roach: { name: 'Cockroach', attack: 'Lunge' },
  absence: { name: 'Absence Mark «Н»', attack: 'Lunge' },
  credit: { name: 'Credit', attack: 'Lunge' },
  applause: { name: 'Applause Wave', attack: 'Charge' },
};

export const POSSESS_NAMES = localize(POSSESS_EN, RU_POSSESS);

const SPEED_BONUS = 1.35;
/** melee: reach beyond the unit's radius, the arc in front, and each combo step's power */
const REACH = 1.5;
const ARC = 1.25;
const COMBO = [1, 1.25, 2.2];
const COMBO_WINDOW = 0.7;
const SWING_CD = [0.26, 0.26, 0.55];
const COIN_RADIUS = 1.2;
const COIN_MAGNET = 2.8;
const COIN_CHAOS = 4;
const SPRINT = 1.6;
const DASH_SPEED = 3.2;
const DASH_TIME = 0.22;
const DASH_CD = 1.2;
export const CONTACT_BONUS = 1.5;
const POSSESS_HP_BONUS = 4;

// two skills per unit kind, built from a small set of effects
export type Mech = 'swarm' | 'hug' | 'bulldoze' | 'spin' | 'countdown' | 'shockwave' | 'leap' | 'drone' | 'panic' | 'dance' | 'magnet' | 'heal';
const SKILLSET: Partial<Record<UnitKind, [Mech, Mech]>> = {
  quiz: ['swarm', 'panic'], deadline: ['countdown', 'panic'], partner: ['hug', 'drone'], medBall: ['bulldoze', 'leap'],
  drawing: ['spin', 'drone'], leafPile: ['spin', 'swarm'], envelope: ['swarm', 'magnet'], receipt: ['swarm', 'magnet'],
  senior: ['bulldoze', 'shockwave'], towTruck: ['bulldoze', 'magnet'], roach: ['swarm', 'panic'], absence: ['swarm', 'drone'],
  credit: ['heal', 'leap'], applause: ['shockwave', 'dance'],
};
const MECH_CD: Record<Mech, number> = { swarm: 7, hug: 8, bulldoze: 5, spin: 5, countdown: 1, shockwave: 5, leap: 6, drone: 9, panic: 10, dance: 10, magnet: 6, heal: 12 };
/** a body's two skills */
export const skillsOf = (k: UnitKind): [Mech, Mech] => SKILLSET[k] ?? ['shockwave', 'leap'];

export class Possession {
  unit: Unit | null = null;
  private seed = 0;
  yaw = 0;
  pitch = -0.08;
  keys = new Set<string>();
  stamina = 1;
  dashT = 0;
  dashCd = 0;
  private bob = 0;
  private fovKick = 0;
  /** third-person camera (V toggles first person) */
  third = true;
  private camPos = new THREE.Vector3();
  combo = 0;
  private comboT = 0;
  swingCd = 0;
  /** coins grabbed this possession */
  coins = 0;
  /** melee hits landed this possession */
  hits = 0;
  /** the body's two skills: seconds until each is ready */
  skillCd = [0, 0];
  /** a bulldoze charge in progress (hits him once on contact) */
  private charging = 0;

  constructor(private w: WeekRun) {}

  get active() {
    return !!this.unit;
  }

  static canPossess(u: Unit) {
    // only your attackers: not Week 6 tasks, Week 15 tests or Sonya's fans
    return u.alive && !u.stationary && !u.projectile && !u.attached && u.behavior === 'chase' && u.kind in EYE;
  }

  /** Still the same live unit? (Pooled units get reused, so compare the spawn seed too.) */
  valid() {
    return !!this.unit && this.unit.alive && this.unit.seed === this.seed && !this.unit.attached;
  }

  enter(u: Unit) {
    this.unit = u;
    this.seed = u.seed;
    // you're tougher in person: a 1-HP quiz shouldn't pop the instant you take it over
    u.hp += POSSESS_HP_BONUS;
    u.maxHp += POSSESS_HP_BONUS;
    const k = this.w.kirill;
    this.yaw = Math.atan2(-(k.x - u.x), -(k.z - u.z));
    this.pitch = -0.08;
    this.stamina = 1;
    this.dashT = 0;
    this.dashCd = 0;
    this.combo = 0;
    this.swingCd = 0;
    this.coins = 0;
    this.hits = 0;
    this.camPos.set(0, 0, 0);
    this.keys.clear();
    const st = this.w.stage;
    st.view = 'fp';
    this.w.horde.hidden = this.third ? null : u;
    this.w.setFirstPerson(true);
    try {
      // newer Chromium returns a promise; a refusal must not throw us out of first person
      const r = st.renderer.domElement.requestPointerLock?.() as unknown as Promise<void> | undefined;
      r?.catch?.(() => this.w.hud.setMouseCaptured(false));
    } catch { /* refused: the HUD asks for a click */ }
    sfx.teleport();
    this.updateCamera(0);
  }

  // switch body without leaving the view (camera eases over)
  transfer(u: Unit) {
    if (!this.unit) { this.enter(u); return; }
    this.unit = u;
    this.seed = u.seed;
    u.hp += POSSESS_HP_BONUS;
    u.maxHp += POSSESS_HP_BONUS;
    const k = this.w.kirill;
    this.yaw = Math.atan2(-(k.x - u.x), -(k.z - u.z));
    this.dashT = 0;
    this.combo = 0;
    this.swingCd = 0;
    this.skillCd = [0, 0];
    this.fovKick = 1.2;
    this.w.horde.hidden = this.third ? null : u;
    this.w.hud.setFirstPerson(true, u);
  }

  /** start the third-person camera from here (it eases in from the soul's flight) */
  setCamPos(v: THREE.Vector3) { this.camPos.copy(v); }

  exit(reason = '') {
    if (!this.unit) return;
    this.unit = null;
    this.keys.clear();
    this.w.stage.view = 'top';
    this.w.horde.hidden = null;
    this.w.setFirstPerson(false);
    if (document.pointerLockElement) document.exitPointerLock();
    if (reason) this.w.hud.toast(reason);
  }

  look(dx: number, dy: number) {
    this.yaw -= dx * 0.0024;
    this.pitch = Math.max(-1.25, Math.min(1.1, this.pitch - dy * 0.0024));
  }

  /** first ↔ third person */
  toggleView() {
    this.third = !this.third;
    this.w.horde.hidden = this.third ? null : this.unit;
    this.camPos.set(0, 0, 0);
    sfx.click();
  }

  /** Space: a quick dash where you're heading (or looking) */
  dash() {
    if (!this.unit || this.dashCd > 0) { sfx.denied(); return; }
    this.dashT = DASH_TIME;
    this.dashCd = DASH_CD;
    this.fovKick = 1;
    sfx.click();
  }

  /** F / G (story) or X / Z: one of this body's two skills */
  skill(slot = 0) {
    const u = this.unit;
    if (!u) return;
    if (this.skillCd[slot] > 0) { sfx.denied(); return; }
    const w = this.w, k = w.kirill;
    const mech = skillsOf(u.kind)[slot];
    this.skillCd[slot] = MECH_CD[mech] * boon.swingCd(w.sem.boons);
    const dx = k.x - u.x, dz = k.z - u.z, d = Math.hypot(dx, dz) || 1;
    w.fx.popup(u.x, 1.8, u.z, t(`uskill.${u.kind}.${slot}`), 'skill');
    const near = (r: number) => d < r;
    const miss = () => { this.skillCd[slot] = 1; sfx.denied(); };
    switch (mech) {
      case 'swarm': {
        // two more of you, right here
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          const m = w.spawnUnit(u.kind, u.x + Math.sin(a) * 0.8, u.z + Math.cos(a) * 0.8, { card: u.card, level: u.level, mini: true, scale: 0.7, hp: Math.max(1, Math.ceil(u.maxHp * 0.4)), maxHp: Math.max(1, Math.ceil(u.maxHp * 0.4)), speed: u.speed * 1.15, r: u.r * 0.8, touchDmg: u.touchDmg * 0.6, pile: u.pile * 0.5, behavior: 'chase' });
          if (m) w.fx.ring(m.x, m.z, 0.1, 0.8, 0.3, 0x9ff6ff, 0.8);
        }
        sfx.place();
        break;
      }
      case 'hug': {
        // grab him and hold on
        if (!near(2.6)) { miss(); break; }
        k.stun = Math.max(k.stun, 1.8);
        k.standUp();
        w.strikeKirill(u, 1, false);
        w.fx.ring(k.x, k.z, 0.3, 1.6, 0.4, 0xff8ac8, 0.9);
        sfx.levelUp();
        break;
      }
      case 'bulldoze': {
        // a long charge where you look; the first touch knocks him flat
        this.charging = 0.6;
        this.dashT = 0.6;
        this.fovKick = 1.4;
        sfx.swoosh();
        break;
      }
      case 'spin': case 'shockwave': {
        const R = mech === 'spin' ? 2.8 : 3.4, col = mech === 'spin' ? 0xf4efe2 : 0xffd24a;
        w.fx.ring(u.x, u.z, 0.3, R, 0.35, col, 0.9);
        w.fx.burst(u.x, u.z, col, 14, 0.6, 5);
        w.stage.shake(0.25);
        sfx.boom();
        if (near(R)) { w.strikeKirill(u, mech === 'spin' ? 1.6 : 1.3, false); k.stun = Math.max(k.stun, 0.7); }
        break;
      }
      case 'leap': {
        // up and onto him
        if (!near(9)) { miss(); break; }
        w.fx.burst(u.x, u.z, 0xd8c8a8, 8, 0.3, 3);
        u.x = k.x - (dx / d) * 0.9; u.z = k.z - (dz / d) * 0.9;
        w.grid.resolve(u, u.r, u.ghost);
        w.fx.ring(u.x, u.z, 0.3, 2.4, 0.3, 0xffb04a, 0.9);
        w.stage.shake(0.35);
        sfx.boom();
        w.strikeKirill(u, 1.5, true);
        break;
      }
      case 'countdown': {
        // leap at him and go off
        if (d < 7) { u.x = k.x - (dx / d) * 0.6; u.z = k.z - (dz / d) * 0.6; }
        w.fx.ring(u.x, u.z, 0.2, 2.5, 0.25, 0xff4a2a, 0.9);
        w.detonate(u);
        break;
      }
      case 'drone': case 'panic': case 'dance': {
        // get in his head: his beam slows / he panics and stops shooting / he can't help dancing
        if (!near(7)) { miss(); break; }
        if (mech === 'drone') k.drone = Math.max(k.drone, 4);
        else if (mech === 'panic') k.panic = Math.max(k.panic, 1.6);
        else { k.dance = Math.max(k.dance, 1.8); k.standUp(); }
        w.fx.ring(k.x, k.z, 0.3, 2, 0.5, mech === 'drone' ? 0x9a8ae8 : mech === 'panic' ? 0xff6a4a : 0xff4ab0, 0.9);
        w.fx.popup(k.x, 2.8, k.z, t('uskill.fx.' + mech), 'grade-2');
        juice.sting(2);
        break;
      }
      case 'magnet': {
        // his notes fly to you, and he's dragged a step your way
        const got = w.pickups.collect(u.x, u.z, 7, 7, 1);
        if (got) { this.coins += got; w.chaosBonus(got * COIN_CHAOS); }
        if (near(8)) {
          k.x -= (dx / d) * 1.4; k.z -= (dz / d) * 1.4;
          w.grid.resolve(k, k.r);
          w.strikeKirill(u, 0.6, false);
        }
        w.fx.ring(u.x, u.z, 7, 0.4, 0.4, 0xf2c53d, 0.8);
        sfx.ding();
        break;
      }
      case 'heal': {
        // the horde around you gets back up to full
        let n = 0;
        for (const o of w.horde.units) if (o.alive && Math.hypot(o.x - u.x, o.z - u.z) < 5) { o.hp = o.maxHp; n++; w.fx.burst(o.x, o.z, 0x5fe07a, 3, 0.8, 1.5); }
        w.fx.ring(u.x, u.z, 0.3, 5, 0.5, 0x5fe07a, 0.8);
        w.fx.popup(u.x, 2.4, u.z, `+${n}`, 'heal');
        sfx.levelUp();
        break;
      }
    }
  }

  /** click / J: a three-hit melee combo; a Deadline still detonates */
  attack() {
    const u = this.unit;
    if (!u) return;
    if (u.kind === 'deadline') {
      this.w.detonate(u);
      return;
    }
    if (this.swingCd > 0) return;
    this.combo = this.comboT > 0 ? (this.combo % 3) + 1 : 1;
    this.comboT = COMBO_WINDOW;
    const step = this.combo - 1;
    this.swingCd = SWING_CD[step] * boon.swingCd(this.w.sem.boons);
    // face the swing and lunge a little into it
    const f = this.forward();
    u.yaw = Math.atan2(f.x, f.z);
    u.vx += f.x * 5 * (step === 2 ? 1.6 : 1);
    u.vz += f.z * 5 * (step === 2 ? 1.6 : 1);
    this.fovKick = Math.max(this.fovKick, step === 2 ? 0.9 : 0.4);
    // did it connect?
    const k = this.w.kirill;
    const dx = k.x - u.x, dz = k.z - u.z, d = Math.hypot(dx, dz);
    let a = Math.atan2(dx, dz) - Math.atan2(f.x, f.z);
    a = Math.atan2(Math.sin(a), Math.cos(a));
    const swingArc = this.w.fx.ring(u.x + f.x * 0.9, u.z + f.z * 0.9, 0.2, step === 2 ? 1.5 : 1.0, 0.18, step === 2 ? 0xff7a2a : 0xffd24a, 0.8);
    void swingArc;
    if (d <= REACH + u.r + k.r && (Math.abs(a) < ARC || d < 0.8)) { this.hits++; this.w.strikeKirill(u, COMBO[step], step === 2); }
    else sfx.place();
  }

  /** Replaces the unit's AI for this tick. */
  move(u: Unit, dt: number) {
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.skillCd = this.skillCd.map((c) => Math.max(0, c - dt));
    // a bulldoze charge: the first touch flattens him
    if (this.charging > 0) {
      this.charging -= dt;
      const k = this.w.kirill;
      if (Math.hypot(k.x - u.x, k.z - u.z) < u.r + k.r + 0.5) {
        this.charging = 0;
        this.w.strikeKirill(u, 2.2, true);
        k.stun = Math.max(k.stun, 1);
      }
    }
    this.swingCd = Math.max(0, this.swingCd - dt);
    this.comboT = Math.max(0, this.comboT - dt);
    if (this.comboT <= 0) this.combo = 0;
    // arrows turn the camera too (no mouse needed)
    if (this.keys.has('arrowleft')) this.yaw += dt * 2.4;
    if (this.keys.has('arrowright')) this.yaw -= dt * 2.4;
    const fwd = (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) - (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0);
    const side = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0);
    // camera looks down −Z rotated by yaw
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = fx * fwd + rx * side, mz = fz * fwd + rz * side;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }

    const sprinting = this.keys.has('shift') && ml > 0 && this.stamina > 0;
    if (sprinting) this.stamina = Math.max(0, this.stamina - dt / 2.5);
    else this.stamina = Math.min(1, this.stamina + dt / 3);

    let speed = u.speed * SPEED_BONUS * (sprinting ? SPRINT : 1);
    if (this.dashT > 0) {
      this.dashT -= dt;
      // dashes go where you look, even standing still
      if (ml === 0) { mx = fx; mz = fz; }
      speed = u.speed * SPEED_BONUS * DASH_SPEED;
    }
    const k = Math.min(1, dt * (this.dashT > 0 ? 20 : 10));
    u.vx += (mx * speed - u.vx) * k;
    u.vz += (mz * speed - u.vz) * k;
    u.x += u.vx * dt;
    u.z += u.vz * dt;
    this.w.horde.separate(u, dt);
    this.w.grid.resolve(u, u.r, u.ghost);
    const moving = Math.hypot(u.vx, u.vz);
    this.bob += dt * moving * 2.6;
    if (sprinting) this.fovKick = Math.max(this.fovKick, 0.4);
    // coins: pull in the ones nearby and grab them (Kirill's XP becomes your chaos)
    const got = this.w.pickups.collect(u.x, u.z, COIN_RADIUS, COIN_MAGNET, dt);
    if (got > 0) {
      this.coins += got;
      this.w.chaosBonus(got * COIN_CHAOS);
      this.w.fx.popup(u.x, 1.4, u.z, `+${got * COIN_CHAOS} ⚡`, 'skill');
      sfx.ding();
    }
  }

  updateCamera(dt: number) {
    const u = this.unit;
    if (!u) return;
    const cam = this.w.stage.fpCam;
    const eye = EYE[u.kind] ?? 0.6;
    this.fovKick = Math.max(0, this.fovKick - dt * 2.5);
    if (this.third) {
      // over the unit's back; looking up/down raises/lowers the camera; pulls in at walls
      const f = this.forward();
      const want = 3.6, lift = 1.3 + Math.max(-0.5, Math.min(1.6, -this.pitch * 2.2));
      let dist = want;
      for (let s = 0.4; s <= want; s += 0.2) {
        if (this.w.grid.blocked(u.x - f.x * s, u.z - f.z * s)) { dist = Math.max(0.9, s - 0.35); break; }
      }
      const target = new THREE.Vector3(u.x - f.x * dist, eye + lift, u.z - f.z * dist);
      if (this.camPos.lengthSq() === 0) this.camPos.copy(target);
      this.camPos.lerp(target, Math.min(1, dt * 12 || 1));
      cam.position.copy(this.camPos);
      cam.lookAt(u.x + f.x * 2.2, eye + 0.35, u.z + f.z * 2.2);
    } else {
      cam.position.set(u.x, eye + Math.sin(this.bob) * 0.04, u.z);
      cam.rotation.set(this.pitch, this.yaw, Math.sin(this.bob * 0.5) * 0.012, 'YXZ');
    }
    const fov = (this.third ? 70 : 80) + this.fovKick * 12;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  /** Nearest possessable unit to a point (mouse on the floor, or Kirill). */
  pick(x: number, z: number, maxD = Infinity): Unit | null {
    let best: Unit | null = null, bd = maxD;
    for (const u of this.w.horde.units) {
      if (!Possession.canPossess(u)) continue;
      const d = Math.hypot(u.x - x, u.z - z);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  pickSafest(kx: number, kz: number): Unit | null {
    let best: Unit | null = null, bd = -1;
    for (const u of this.w.horde.units) {
      if (!Possession.canPossess(u)) continue;
      const d = Math.hypot(u.x - kx, u.z - kz);
      if (d > bd) { bd = d; best = u; }
    }
    return best;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}
