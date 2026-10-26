import * as THREE from 'three';
import { KirillMarker } from '../render/marker';
import { Person } from './person';
import type { KirillLook } from './look';
import type { HeroMode } from '../data/weeks';
import { HERO_UPGRADES, type CounterId, type HeroUpgradeId } from '../data/cards';
import balance from '../data/balance.json';
import { toon, part, cyl } from '../render/toon';
import type { WeekRun } from '../game/week';
import type { Unit } from '../horde/units';
import { Flow, LOW } from '../maps/grid';
import { t } from '../i18n';

const B = balance.kirill;

/** What carries over between weeks within a semester (GDD §3 "Hero growth"). */
export interface KirillState {
  level: number;
  xp: number;
  upgrades: Partial<Record<HeroUpgradeId, number>>;
  counters: CounterId[];
  picks: string[];
}

export function newKirillState(): KirillState {
  return { level: 1, xp: 0, upgrades: {}, counters: [], picks: [] };
}

/** "Triple Espresso Lv.3" / «Тройной эспрессо, ур. 3» from a stored "espresso:3". */
export function pickLabel(pick: string) {
  const [id, lv] = pick.split(':');
  return t('pick', { name: HERO_UPGRADES[id as HeroUpgradeId]?.name ?? id, n: lv });
}

export function xpForNext(level: number) {
  return B.xp.firstLevel * Math.pow(B.xp.growth, level - 1);
}

/** What the week wants Kirill to do this tick (seek / goal / desk modes, GDD §5). */
export interface KirillTarget {
  x: number;
  z: number;
  /** sit down on arrival (desk weeks) */
  sit?: boolean;
  /** steering weight vs. fleeing (default 2) */
  weight?: number;
  /** how much he still flees units on the way (default 0.5) */
  flee?: number;
  /** cells to route around (vision cones in Week 10) */
  avoid?: Uint8Array;
  /** facing while seated (radians) */
  face?: number;
}

export class Kirill {
  rig: Person;
  ring: THREE.Mesh;
  private marker: KirillMarker;
  x: number; z: number;
  vx = 0; vz = 0;
  r = 0.42;
  sanity: number;
  maxSanity: number;
  // status timers
  stun = 0; dance = 0; panic = 0; laps = 0; drone = 0; noStick = 0; shieldCd = 0; speechCd = 0;
  /** eating something he couldn't resist (Week 13) or a canteen tray (Week 7) */
  eat = 0;
  /** All-Nighter: winding up (set by the week) and fired up afterwards */
  charge = 0;
  buff = 0;
  panicTarget = { x: 0, z: 0 };
  lapIdx = 0;
  fitness: { x: number; z: number; done: boolean }[] = [];
  // per-frame multipliers set by the week (Pasha, partners…)
  fireMul = 1; regenMul = 1; slowMul = 1;
  /** sitting at a desk/seat: can't move, turns to shoot, longer reach for attackers */
  sitting = false;
  /** outside pulls this tick (Sonya's star power), reset every tick by the week */
  pullX = 0; pullZ = 0;
  /** being dragged (Romchik's party grab, tow truck): position is driven from outside */
  drag = 0;
  dragTo = { x: 0, z: 0 };
  dragSpeed = 3;
  dragPose: 'dance' | 'stun' = 'stun';
  private fireT = 0.6;
  private wanderA = Math.random() * Math.PI * 2;
  private fleeOn = true;
  private fleeToggle = 0;
  private mugAngle = 0;
  private mugs: THREE.Mesh[] = [];
  private auraT = 0;
  private aura: THREE.Mesh | null = null;
  readonly pos = new THREE.Vector3();
  private scale: number;
  /** his own path field toward the current objective */
  private flow: Flow;
  private flowT = 0;
  private moodMul = { sanity: 1, speed: 1 };
  private flowFor = { x: 1e9, z: 1e9 };
  private dir = { x: 0, z: 0 };

  constructor(private w: WeekRun, look: KirillLook, public state: KirillState, public mode: HeroMode, weekNum: number, year: number, private weekId: number) {
    this.rig = new Person(look);
    this.x = w.map.layout.start.x;
    this.z = w.map.layout.start.z;
    this.scale = (1 + B.scaling.perWeek * weekNum) * (1 + B.scaling.perYear * (year - 1));
    const mood = w.sem.mood;
    this.moodMul = mood === 'tired' ? balance.interlude.tired : mood === 'fired' ? balance.interlude.fired : { sanity: 1, speed: 1 };
    this.maxSanity = (weekId === 1 ? B.sanityWeek1 : B.sanity) * this.scale * this.moodMul.sanity;
    this.sanity = this.maxSanity;
    this.flow = new Flow(w.grid, LOW);

    // always marked in red: a ring under him and an arrow over him that shows through everything
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 40), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.85, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 2;
    this.marker = new KirillMarker(2.2, 0.95);
    w.stage.world.add(this.rig.root, this.ring, this.marker.group);
    if (mode === 'seated') {
      this.sitting = true;
      this.rig.facing = Math.PI;
      this.rig.pose = 'sit';
    }
    this.syncMugs();
    if (this.has('headphones')) {
      this.aura = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), new THREE.MeshBasicMaterial({ color: 0x23c4b8, transparent: true, opacity: 0.12, depthWrite: false }));
      this.aura.rotation.x = -Math.PI / 2;
      w.stage.world.add(this.aura);
    }
  }

  has(c: CounterId) { return this.state.counters.includes(c); }
  up(u: HeroUpgradeId) { return this.state.upgrades[u] ?? 0; }

  get stats() {
    const R = this.w.rules;
    return {
      regen: (B.regenPerSec + 0.5 * this.up('powerNap')) * this.scale,
      speed: this.sitting ? 0 : B.speed * Math.pow(1.1, this.up('espresso')) * R.kirillSpeedMul * this.moodMul.speed * (this.buff > 0 ? balance.allNighter.speedMul : 1),
      interval: (this.weekId === 1 ? B.beam.intervalWeek1 : B.beam.interval) * Math.pow(0.85, this.up('laserPlus')) / this.scale,
      range: (R.beamRange ?? B.beam.range) + this.up('longBeam') + (this.sitting ? 1.5 : 0),
      damage: B.beam.damage,
      pickup: B.pickupRadius + this.up('groupChat'),
    };
  }

  get busy() { return this.stun > 0 || this.dance > 0 || this.drag > 0 || this.eat > 0; }

  addXp(v: number) {
    this.state.xp += v;
    let need = xpForNext(this.state.level);
    while (this.state.xp >= need) {
      this.state.xp -= need;
      this.state.level++;
      this.levelUp();
      need = xpForNext(this.state.level);
    }
  }

  /** Offered 3 random upgrades, Kirill picks one; the pick is announced (GDD §5). */
  levelUp(free = false) {
    const pool = (Object.keys(HERO_UPGRADES) as HeroUpgradeId[]).filter((k) => this.up(k) < HERO_UPGRADES[k].max);
    if (!pool.length) return;
    const offer = this.w.rng.shuffle([...pool]).slice(0, 3);
    // he favours whatever fixes his current problem
    const score = (k: HeroUpgradeId) => {
      let s = Math.random();
      if (k === 'powerNap' && this.w.progress > 0.5) s += 0.6;
      if (k === 'laserPlus' && this.w.horde.aliveCount > 25) s += 0.5;
      if (k === 'mugs' && this.w.horde.aliveCount > 15) s += 0.3;
      if (k === 'espresso' && this.mode === 'seated') s -= 2;
      return s;
    };
    const pick = offer.sort((a, b) => score(b) - score(a))[0];
    this.state.upgrades[pick] = this.up(pick) + 1;
    this.state.picks.push(`${pick}:${this.up(pick)}`);
    const label = pickLabel(`${pick}:${this.up(pick)}`);
    this.syncMugs();
    this.w.onKirillLevel(label, HERO_UPGRADES[pick].desc, free);
  }

  private syncMugs() {
    const n = Math.min(4, this.up('mugs'));
    while (this.mugs.length < n) {
      const mug = part(cyl(0.13, 0.11, 0.24, 12), 0xf2efe6);
      const handle = part(new THREE.TorusGeometry(0.07, 0.025, 6, 10), 0xf2efe6);
      handle.position.set(0.15, 0, 0);
      mug.add(handle);
      const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.11, 12), toon(0x5a3a22));
      coffee.rotation.x = -Math.PI / 2;
      coffee.position.y = 0.11;
      mug.add(coffee);
      this.w.stage.world.add(mug);
      this.mugs.push(mug);
    }
  }

  say(lines: string[], force = false) {
    if (!force && this.speechCd > 0) return;
    this.speechCd = 3.5;
    this.w.fx.say('kirill', () => this.pos, lines[Math.floor(Math.random() * lines.length)], 2.2, 2.3, 'hero');
  }

  /** Stand up from a desk (hits, being pulled away). */
  standUp() {
    if (this.mode === 'seated') return;
    this.sitting = false;
  }

  update(dt: number) {
    const st = this.stats;
    this.stun = Math.max(0, this.stun - dt);
    this.dance = Math.max(0, this.dance - dt);
    this.panic = Math.max(0, this.panic - dt);
    this.laps = Math.max(0, this.laps - dt);
    this.drone = Math.max(0, this.drone - dt);
    this.noStick = Math.max(0, this.noStick - dt);
    this.shieldCd = Math.max(0, this.shieldCd - dt);
    this.speechCd = Math.max(0, this.speechCd - dt);
    this.eat = Math.max(0, this.eat - dt);
    this.buff = Math.max(0, this.buff - dt);

    const target = this.mode === 'seated' ? null : this.w.rules.target();
    if (this.drag > 0 || this.panic > 0 || this.laps > 0 || this.busy) this.standUp();

    let dx = 0, dz = 0, speed = st.speed * this.slowMul;
    let pose: typeof this.rig.pose = this.sitting ? 'sit' : 'idle';

    if (this.drag > 0) {
      this.drag -= dt;
      pose = this.dragPose;
      const ddx = this.dragTo.x - this.x, ddz = this.dragTo.z - this.z, l = Math.hypot(ddx, ddz);
      if (l > 0.2) { this.x += (ddx / l) * this.dragSpeed * dt; this.z += (ddz / l) * this.dragSpeed * dt; }
      this.vx = this.vz = 0;
    } else if (this.stun > 0) pose = 'stun';
    else if (this.dance > 0) pose = 'dance';
    else if (this.eat > 0) pose = 'talk';
    else if (this.charge > 0) pose = 'cheer';
    else if (this.sitting) pose = 'sit';
    else if (this.panic > 0) {
      pose = 'panic';
      dx = this.panicTarget.x - this.x; dz = this.panicTarget.z - this.z;
      speed = B.speed * 1.35 * this.slowMul;
    } else if (this.laps > 0 && this.w.map.layout.laps) {
      pose = 'laps';
      const lp = this.w.map.layout.laps;
      const tp = lp[this.lapIdx % lp.length];
      dx = tp.x - this.x; dz = tp.z - this.z;
      if (Math.hypot(dx, dz) < 0.8) this.lapIdx++;
      speed *= 1.1;
    } else if (target) {
      [dx, dz] = this.steerTo(target, dt);
      if (target.sit && Math.hypot(target.x - this.x, target.z - this.z) < 0.45) {
        // arrive and sit down
        this.x = target.x; this.z = target.z;
        this.sitting = true;
        this.vx = this.vz = 0;
        if (target.face !== undefined) { this.rig.facing = target.face; this.rig.root.rotation.y = target.face; }
        pose = 'sit';
        dx = dz = 0;
      }
    } else {
      [dx, dz] = this.steer(dt);
    }

    // outside pulls (Sonya) act even on top of other steering
    if (!this.sitting && this.drag <= 0 && this.stun <= 0 && this.dance <= 0) { dx += this.pullX; dz += this.pullZ; }

    if (this.drag <= 0) {
      if (pose !== 'sit' && pose !== 'stun' && pose !== 'dance' && pose !== 'talk' && pose !== 'cheer') {
        const l = Math.hypot(dx, dz);
        const tvx = l > 0.05 ? (dx / l) * speed * Math.min(1, l) : 0;
        const tvz = l > 0.05 ? (dz / l) * speed * Math.min(1, l) : 0;
        const k = Math.min(1, dt * 8);
        this.vx += (tvx - this.vx) * k;
        this.vz += (tvz - this.vz) * k;
      } else {
        this.vx *= 0.8; this.vz *= 0.8;
      }
      this.x += this.vx * dt;
      this.z += this.vz * dt;
    }
    if (!this.sitting) {
      // stationary units (guards, inspectors, fans) and bosses are solid
      for (const s of this.w.solids()) {
        const ddx = this.x - s.x, ddz = this.z - s.z, d = Math.hypot(ddx, ddz), min = s.r + this.r;
        if (d < min && d > 1e-4) { this.x = s.x + (ddx / d) * min; this.z = s.z + (ddz / d) * min; }
      }
      // in the goal weeks your horde physically blocks the way
      if (this.w.rules.crowdBlocks) {
        this.w.horde.query(this.x, this.z, 1.2, (u, d) => {
          if (u.attached || u.projectile || d < 1e-4) return;
          const min = u.r + this.r;
          if (d < min) { this.x += ((this.x - u.x) / d) * (min - d) * 0.7; this.z += ((this.z - u.z) / d) * (min - d) * 0.7; }
        });
      }
      this.w.grid.resolve(this, this.r);
    }
    const sp = Math.hypot(this.vx, this.vz);
    if (pose === 'idle' && sp > 0.4) pose = 'run';
    this.rig.pose = pose;

    // regen
    if (this.w.rules.usesSanity && this.sanity > 0)
      this.sanity = Math.min(this.maxSanity, this.sanity + st.regen * this.regenMul * dt);

    this.shoot(dt, st);
    this.weapons(dt);

    // facing: movement, or the beam target when seated
    if (sp > 0.3 && !this.sitting) this.rig.faceTowards(Math.atan2(this.vx, this.vz), dt);
    this.rig.update(dt, sp);
    this.rig.root.position.set(this.x, 0, this.z);
    this.pos.set(this.x, 0, this.z);
    this.ring.position.set(this.x, 0.05, this.z);
    this.marker.update(this.x, this.z, this.w.time);
    if (this.aura) this.aura.position.set(this.x, 0.045, this.z);
  }

  /** Path toward the week's objective, still dodging units a little. */
  private steerTo(tg: KirillTarget, dt: number): [number, number] {
    this.flowT -= dt;
    const moved = Math.hypot(tg.x - this.flowFor.x, tg.z - this.flowFor.z) > 0.8;
    if (this.flowT <= 0 || moved || tg.avoid) {
      this.flowT = 0.25;
      this.flowFor = { x: tg.x, z: tg.z };
      this.flow.compute(tg.x, tg.z, 0.6, tg.avoid);
    }
    const d = Math.hypot(tg.x - this.x, tg.z - this.z);
    let gx = 0, gz = 0;
    if (d < 1.2) { gx = (tg.x - this.x) / (d || 1); gz = (tg.z - this.z) / (d || 1); }
    else if (this.flow.dir(this.x, this.z, this.dir)) { gx = this.dir.x; gz = this.dir.z; }
    else if (tg.avoid) {
      // no safe route right now: if a cone is on him, duck into the nearest safe cell; else wait in cover
      const safe = this.nearestSafe(tg.avoid);
      if (!safe) return [-this.vx * 0.5, -this.vz * 0.5];
      return [(safe.x - this.x) * 2, (safe.z - this.z) * 2];
    } else { gx = (tg.x - this.x) / (d || 1); gz = (tg.z - this.z) / (d || 1); }

    let fx = 0, fz = 0;
    const fleeW = tg.flee ?? 0.5;
    if (fleeW > 0) {
      this.w.horde.query(this.x, this.z, 3.5, (u, dd) => {
        if (u.attached || u.behavior !== 'chase') return;
        const wgt = 1 / Math.max(0.3, dd * dd);
        fx += (this.x - u.x) * wgt;
        fz += (this.z - u.z) * wgt;
      });
      const fl = Math.hypot(fx, fz);
      if (fl > 1) { fx /= fl; fz /= fl; }
    }
    const wgt = tg.weight ?? 2;
    return [gx * wgt + fx * fleeW, gz * wgt + fz * fleeW];
  }

  /** Nearest walkable cell outside `avoid`, or null if he's already safe. */
  private nearestSafe(avoid: Uint8Array) {
    const g = this.w.grid;
    const c0 = g.col(this.x), r0 = g.row(this.z);
    if (!g.inside(c0, r0) || !avoid[r0 * g.cols + c0]) return null;
    for (let rad = 1; rad <= 10; rad++)
      for (let dr = -rad; dr <= rad; dr++)
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          const c = c0 + dc, r = r0 + dr;
          if (!g.inside(c, r) || avoid[r * g.cols + c] || g.at(c, r) >= LOW) continue;
          return { x: g.cx(c), z: g.cz(r) };
        }
    return null;
  }

  /** move = flee×1.0 + seek×0.6 + avoid×1.5 + wander×0.2 + centerPull×0.4 (GDD §5) */
  private steer(dt: number): [number, number] {
    const lost = this.mode === 'lost';
    if (lost) {
      this.fleeToggle -= dt;
      if (this.fleeToggle <= 0) { this.fleeOn = Math.random() < 0.5; this.fleeToggle = 1.5; }
    }
    let fx = 0, fz = 0;
    if (!lost || this.fleeOn) {
      this.w.horde.query(this.x, this.z, 5, (u: Unit, d) => {
        if (u.attached || u.behavior !== 'chase') return;
        const wgt = 1 / Math.max(0.3, d * d);
        fx += (this.x - u.x) * wgt;
        fz += (this.z - u.z) * wgt;
      });
      for (const s of this.w.threats()) {
        const d = Math.hypot(this.x - s.x, this.z - s.z);
        if (d < 5 && d > 0.01) { const wgt = 1.5 / Math.max(0.3, d * d); fx += (this.x - s.x) * wgt; fz += (this.z - s.z) * wgt; }
      }
      const away = this.w.rules.avoidPoint?.(this.x, this.z);
      if (away) { fx += away.x; fz += away.z; }
    }
    const fl = Math.hypot(fx, fz);
    if (fl > 1) { fx /= fl; fz /= fl; }

    // seek: fitness-test circles first, then the nearest grade point
    let sx = 0, sz = 0, seekW = 0.6;
    const circle = this.fitness.filter((c) => !c.done).sort((a, b) => Math.hypot(a.x - this.x, a.z - this.z) - Math.hypot(b.x - this.x, b.z - this.z))[0];
    if (circle) {
      sx = circle.x - this.x; sz = circle.z - this.z; seekW = 2.2;
    } else {
      const gp = this.w.pickups.nearest(this.x, this.z, 8);
      if (gp) { sx = gp.x - this.x; sz = gp.z - this.z; }
    }
    const sl = Math.hypot(sx, sz);
    if (sl > 0) { sx /= sl; sz /= sl; }

    // avoid walls: push away from close obstacles in 8 directions
    let ax = 0, az = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
      const c = this.w.grid.clearance(this.x, this.z, cx, cz, 1.6);
      if (c < 1.6) { const k = 1 - c / 1.6; ax -= cx * k; az -= cz * k; }
    }

    this.wanderA += (Math.random() - 0.5) * dt * 4;
    const wx = Math.cos(this.wanderA), wz = Math.sin(this.wanderA);

    const hw = this.w.grid.w / 2, hh = this.w.grid.h / 2;
    const cx = (-this.x / hw) * Math.abs(this.x / hw), cz = (-this.z / hh) * Math.abs(this.z / hh);

    const wanderW = lost ? 0.8 : 0.2;
    return [
      fx * 1.0 + sx * seekW + ax * 1.5 + wx * wanderW + cx * 0.4,
      fz * 1.0 + sz * seekW + az * 1.5 + wz * wanderW + cz * 0.4,
    ];
  }

  private canShoot() {
    if (this.busy || this.panic > 0 || this.charge > 0 || this.w.rules.noShooting) return false;
    return !this.w.inPanicZone(this.x, this.z);
  }

  private shoot(dt: number, st: Kirill['stats']) {
    const mul = this.fireMul * (this.drone > 0 ? 0.5 : 1) * (this.buff > 0 ? balance.allNighter.fireMul : 1);
    this.fireT -= dt * mul;
    if (this.fireT > 0 || !this.canShoot()) return;
    let best: Unit | null = null, bd = st.range;
    this.w.horde.query(this.x, this.z, st.range, (u, d) => {
      if (u.targetable && d < bd) { bd = d; best = u; }
    });
    if (!best) { this.fireT = 0.05; return; }
    const tu = best as Unit;
    this.fireT = st.interval;
    const dx = tu.x - this.x, dz = tu.z - this.z, l = Math.hypot(dx, dz) || 1;
    const ux = dx / l, uz = dz / l;
    const ex = this.x + ux * st.range, ez = this.z + uz * st.range;
    if (this.sitting) {
      this.rig.facing = Math.atan2(ux, uz);
      this.rig.root.rotation.y = this.rig.facing;
    } else if (Math.hypot(this.vx, this.vz) < 0.3) this.rig.faceTowards(Math.atan2(ux, uz), 1);
    this.w.fx.beam(this.x + ux * 0.4, this.z + uz * 0.4, ex, ez);
    // piercing: everything along the segment
    const hits: Unit[] = [];
    this.w.horde.query(this.x + ux * st.range / 2, this.z + uz * st.range / 2, st.range / 2 + 0.6, (u) => {
      if (!u.targetable) return;
      const px = u.x - this.x, pz = u.z - this.z;
      const along = px * ux + pz * uz;
      if (along < 0 || along > st.range) return;
      const perp = Math.abs(px * uz - pz * ux);
      if (perp < u.r + 0.2) hits.push(u);
    });
    for (const u of hits) this.w.damageUnit(u, st.damage);
  }

  private weapons(dt: number) {
    // orbiting coffee mugs
    if (this.mugs.length) {
      this.mugAngle += dt * 3;
      this.mugs.forEach((m, i) => {
        const a = this.mugAngle + (i / this.mugs.length) * Math.PI * 2;
        const mx = this.x + Math.cos(a) * 1.8, mz = this.z + Math.sin(a) * 1.8;
        m.position.set(mx, 0.8, mz);
        m.rotation.y = -a;
        this.w.horde.query(mx, mz, 0.5, (u) => {
          if (u.targetable && u.hitCd <= 0) { u.hitCd = 0.4; this.w.damageUnit(u, 1); }
        });
      });
    }
    // noise-cancelling headphones aura
    if (this.aura) {
      this.auraT -= dt;
      if (this.auraT <= 0) {
        this.auraT = 0.5;
        this.w.horde.query(this.x, this.z, 1.5, (u) => { if (u.targetable) this.w.damageUnit(u, 1); });
      }
    }
  }

  dispose() {
    this.w.stage.world.remove(this.rig.root, this.ring, ...this.mugs);
    this.marker.dispose();
    if (this.aura) this.w.stage.world.remove(this.aura);
  }
}
