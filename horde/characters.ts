import * as THREE from 'three';
import { makeCharacter, type Rig } from '../assets';
import { part, box, cyl } from '../render/toon';
import { LINES, pickLine } from '../data/lines';
import { sfx } from '../core/audio';
import balance from '../data/balance.json';
import type { WeekRun } from '../game/week';
import { t } from '../i18n';

// Rigged side characters: Pasha (guest card), Nina (Week 3 boss), Artem (Kirill's friend).

const RING_YOURS = 0xe8573a, RING_FRIEND = 0x23c4b8;

function groundRing(color: number, r = 0.6) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.05;
  m.renderOrder = 2;
  return m;
}

let nextId = 0;

export abstract class Character {
  rig: Rig;
  ring: THREE.Mesh;
  root = new THREE.Group();
  x: number; z: number;
  alive = true;
  /** standing height (Masha on the assembly-hall stage) */
  elev = 0;
  readonly pos = new THREE.Vector3();
  private id = nextId++;
  constructor(protected w: WeekRun, public name: string, x: number, z: number, ringColor: number) {
    this.rig = makeCharacter(name);
    this.ring = groundRing(ringColor);
    this.root.add(this.rig.root, this.ring);
    this.x = x; this.z = z;
    w.stage.world.add(this.root);
    this.sync();
    w.introduce(name, this);
  }
  protected sync() {
    this.root.position.set(this.x, this.elev, this.z);
    this.pos.set(this.x, this.elev, this.z);
  }
  say(text: string, dur = 2.2) {
    this.w.fx.say('char' + this.id, () => this.pos, text, dur, 2.4);
  }
  abstract update(dt: number): void;
  dispose() {
    this.w.stage.world.remove(this.root);
    this.alive = false;
  }
}

const P = balance.cards.pasha;

/** Pasha: stands with his speaker and drops a beat ring every 3 s (GDD §7). */
export class Pasha extends Character {
  private life: number;
  private beatT = 1;
  private every: number;
  private danceSec: number;
  constructor(w: WeekRun, x: number, z: number, public level: number) {
    super(w, 'pasha', x, z, RING_YOURS);
    this.life = P.lifeSec;
    this.every = level >= 2 ? 2 : P.beatEverySec;
    this.danceSec = level >= 3 ? 1.5 : P.beatStunSec;
    const speaker = new THREE.Group();
    speaker.add(part(box(0.5, 0.8, 0.45), 0x22252b));
    const cone = part(cyl(0.16, 0.16, 0.04, 16), 0x5a5f6a);
    cone.rotation.x = Math.PI / 2;
    cone.position.set(0, 0.12, 0.23);
    speaker.add(cone);
    speaker.position.set(0.75, 0.4, 0.1);
    this.root.add(speaker);
    this.rig.faceTowards(Math.atan2(w.kirill.x - x, w.kirill.z - z), 1, 100);
    this.say(pickLine(LINES.pasha));
  }
  update(dt: number) {
    this.life -= dt;
    this.beatT -= dt;
    this.rig.pose = 'dance';
    if (this.beatT <= 0) {
      this.beatT = this.every;
      sfx.beat();
      this.w.fx.ring(this.x, this.z, 0.4, P.beatRadius, 0.6, 0xb04ae8, 0.85);
      const d = Math.hypot(this.w.kirill.x - this.x, this.w.kirill.z - this.z);
      if (d < P.beatRadius) {
        const k = this.w.kirill;
        const sec = this.danceSec * (k.has('earplugs') ? 0.5 : 1);
        if (k.dance < sec) { k.dance = sec; k.say(LINES.kirillDance); }
      }
    }
    this.rig.update(dt, 0);
    this.sync();
    if (this.life <= 0) {
      this.w.fx.burst(this.x, this.z, 0xb04ae8, 8, 1);
      this.dispose();
    }
  }
}

const N = balance.bosses.nina;

/** Nina, the PE teacher: fitness tests and medicine-ball throws; the Q skill makes her whistle. */
export class Nina extends Character {
  private actionT = 4;
  private throwT = 0;
  private test: { circles: { x: number; z: number; done: boolean; disc: THREE.Group }[]; t: number } | null = null;
  r = 0.6;
  constructor(w: WeekRun, x: number, z: number) {
    super(w, 'nina', x, z, RING_YOURS);
  }
  /** a throw you aimed (Week 3: you are her arm) */
  throwAt() {
    this.rig.pose = 'throw';
    this.throwT = 0.6;
    this.actionT = Math.max(this.actionT, 2);
    sfx.place();
  }
  whistle() {
    sfx.whistle();
    this.say(pickLine(LINES.nina), 1.8);
    this.rig.pose = 'talk';
    this.w.fx.ring(this.x, this.z, 0.5, 6, 0.5, 0xffffff, 0.7);
  }
  update(dt: number) {
    const k = this.w.kirill;
    this.actionT -= dt;
    this.throwT -= dt;
    if (this.actionT <= 0) {
      this.actionT = N.actionEverySec;
      if (!this.test && this.w.rng.chance(N.fitnessTestChance)) this.startTest();
      else this.throwBall();
    }
    if (this.test) {
      this.test.t -= dt;
      for (const c of this.test.circles) {
        if (!c.done && Math.hypot(k.x - c.x, k.z - c.z) < 1.2) {
          c.done = true;
          (c.disc.children[0] as THREE.Mesh).material = new THREE.MeshBasicMaterial({ color: 0x5fe07a, transparent: true, opacity: 0.35, depthWrite: false });
        }
      }
      k.fitness = this.test.circles;
      const all = this.test.circles.every((c) => c.done);
      if (all || this.test.t <= 0) {
        if (!all) {
          this.say(t('nina.fail'), 1.6);
          this.w.hurtKirill(N.testFailDmg, t('cause.fitness'));
        } else this.say(t('nina.ok'), 1.6);
        for (const c of this.test.circles) this.w.fx.group.remove(c.disc);
        this.test = null;
        k.fitness = [];
      }
    }
    if (this.throwT <= 0 && this.rig.pose === 'throw') this.rig.pose = 'idle';
    if (this.rig.pose === 'talk' && this.throwT < -1.5) this.rig.pose = 'idle';
    this.rig.faceTowards(Math.atan2(k.x - this.x, k.z - this.z), dt, 4);
    this.rig.update(dt, 0);
    this.sync();
  }
  private startTest() {
    const circles: { x: number; z: number; done: boolean; disc: THREE.Group }[] = [];
    for (let tries = 0; circles.length < N.circles && tries < 60; tries++) {
      const x = this.w.rng.range(-14, 14), z = this.w.rng.range(-8, 8);
      if (circles.some((c) => Math.hypot(c.x - x, c.z - z) < 4) || Math.hypot(x - this.x, z - this.z) < 3) continue;
      const disc = this.w.fx.disc(1.2, 0xe8c547, 0.3);
      disc.position.set(x, 0.04, z);
      circles.push({ x, z, done: false, disc });
    }
    this.test = { circles, t: N.testSec };
    this.say(t('nina.go'), 1.8);
    sfx.whistle();
    this.w.feed(t('feed.ninaTest'), 'boss');
  }
  private throwBall() {
    const k = this.w.kirill;
    this.rig.pose = 'throw';
    this.throwT = 0.6;
    const dx = k.x - this.x, dz = k.z - this.z, d = Math.hypot(dx, dz) || 1;
    const u = this.w.horde.spawn('medBall', this.x + (dx / d) * 0.9, this.z + (dz / d) * 0.9);
    if (!u) return;
    Object.assign(u, { projectile: true, targetable: false, touchDmg: 10, r: 0.4, vx: (dx / d) * N.ballSpeed, vz: (dz / d) * N.ballSpeed, speed: N.ballSpeed, life: 6 });
  }
  dispose() {
    if (this.test) for (const c of this.test.circles) this.w.fx.group.remove(c.disc);
    super.dispose();
  }
}

const A = balance.allies.artem;

/** Artem walks in once per week and helps Kirill unless your units body-block him. */
export class Artem extends Character {
  state: 'walk' | 'help' | 'leave' = 'walk';
  private helpT = 0;
  private exit: { x: number; z: number };
  private dir = { x: 0, z: 0 };
  constructor(w: WeekRun, x: number, z: number) {
    super(w, 'artem', x, z, RING_FRIEND);
    this.exit = { x, z };
    w.feed(t('feed.artemComing'), 'ally');
  }
  private chatted = false;
  private chatT = 0;

  update(dt: number) {
    const k = this.w.kirill;
    let tx = k.x, tz = k.z;
    if (this.state === 'leave') { tx = this.exit.x; tz = this.exit.z; }
    // he stops to chat for 3 s when he passes Masha or Sonya (GDD §7)
    if (this.state === 'walk' && !this.chatted) {
      const pal = this.w.guests.find((g) => g.alive && (g.name === 'masha' || g.name === 'sonya') && Math.hypot(g.x - this.x, g.z - this.z) < 2.2);
      if (pal) { this.chatted = true; this.chatT = 3; this.say(t('artem.chat')); }
    }
    if (this.chatT > 0) {
      this.chatT -= dt;
      this.rig.pose = 'talk';
      this.rig.update(dt, 0);
      return;
    }
    if (this.state === 'help') {
      this.helpT -= dt;
      this.rig.pose = 'talk';
      if (this.helpT <= 0) this.state = 'leave';
    } else {
      // body-blocking: every unit next to him slows him down
      let blockers = 0;
      this.w.horde.query(this.x, this.z, 1.2, (u) => { if (!u.projectile) blockers++; });
      const speed = A.speed * Math.pow(A.slowPerNearbyUnit, Math.min(blockers, 4));
      let dx = tx - this.x, dz = tz - this.z;
      const d = Math.hypot(dx, dz);
      const fd = this.w.grid.flowDist(this.x, this.z);
      const near = d < 2 && fd >= 0 && fd <= 3;
      if (this.state === 'walk' && !near && this.w.grid.flowDir(this.x, this.z, false, this.dir)) { dx = this.dir.x; dz = this.dir.z; }
      const l = Math.hypot(dx, dz) || 1;
      this.x += (dx / l) * speed * dt;
      this.z += (dz / l) * speed * dt;
      this.w.grid.resolve(this, 0.35);
      this.rig.pose = speed > 0.1 ? 'run' : 'idle';
      this.rig.faceTowards(Math.atan2(dx, dz), dt);
      if (this.state === 'walk' && d < 1.2) {
        this.state = 'help';
        this.helpT = 1.6;
        this.say(pickLine(LINES.artem));
        this.w.artemHelps();
      }
      if (this.state === 'leave' && d < 0.8) this.dispose();
    }
    this.rig.update(dt, 2);
    this.sync();
  }
}

const G = balance.guests;

/** Romchik: hyperactive, zigzags in and drags Kirill off to a party (GDD §7). */
export class Romchik extends Character {
  private life: number;
  private grabCd = 1;
  private zig = Math.random() * 10;
  constructor(w: WeekRun, x: number, z: number, public level: number, private permanent = false) {
    super(w, 'romchik', x, z, RING_YOURS);
    this.life = permanent ? Infinity : G.romchik.lifeSec;
    this.say(pickLine(LINES.romchik));
  }
  update(dt: number) {
    const k = this.w.kirill;
    this.life -= dt;
    this.grabCd -= dt;
    this.zig += dt * 9;
    if (k.drag > 0 && k.dragPose === 'dance') {
      // dancing him over to the party
      this.x = k.x + 0.6; this.z = k.z;
      this.rig.pose = 'dance';
    } else {
      const dx = k.x - this.x, dz = k.z - this.z, d = Math.hypot(dx, dz) || 1;
      const side = Math.sin(this.zig) * 0.8;
      const vx = dx / d - (dz / d) * side, vz = dz / d + (dx / d) * side;
      const l = Math.hypot(vx, vz) || 1;
      const speed = this.grabCd > 0 ? G.romchik.speed * 0.4 : G.romchik.speed;
      this.x += (vx / l) * speed * dt;
      this.z += (vz / l) * speed * dt;
      this.w.grid.resolve(this, 0.35);
      this.rig.pose = 'run';
      this.rig.faceTowards(Math.atan2(vx, vz), dt);
      if (d < 0.9 && this.grabCd <= 0 && !k.sitting && k.drag <= 0) this.grab();
      else if (d < 0.9 && this.grabCd <= 0 && k.sitting) { k.standUp(); this.grab(); }
    }
    this.rig.update(dt, 4);
    this.sync();
    if (this.life <= 0) { this.w.fx.burst(this.x, this.z, 0xe8c547, 8, 1); this.dispose(); }
  }
  private grab() {
    const k = this.w.kirill;
    // the After-Party combo needs both played as guests, not the two sitting at the New Year table
    const afterParty = !this.permanent && this.w.guests.some((g) => g.alive && g.name === 'sonya');
    let sec = (this.level >= 2 ? 3 : G.romchik.grabSec) - (k.has('noParties') ? 1 : 0);
    if (afterParty) sec *= 2;
    k.drag = Math.max(0.5, sec);
    k.dragPose = 'dance';
    k.dragSpeed = 3.2;
    k.dragTo = this.partySpot();
    // sitting at the New Year table all week, he only grabs now and then
    this.grabCd = this.permanent ? 11 : 6;
    this.say(pickLine(LINES.romchik), 1.6);
    sfx.beat();
    if (afterParty) this.w.feed(t('feed.afterParty'), 'yours');
  }
  /** Level 3 drags him straight into your units; otherwise to the far corner of the room. */
  private partySpot() {
    const k = this.w.kirill;
    if (this.level >= 3) {
      let sx = 0, sz = 0, n = 0;
      for (const u of this.w.horde.units) if (u.alive && !u.stationary && u.behavior === 'chase') { sx += u.x; sz += u.z; n++; }
      if (n) return { x: sx / n, z: sz / n };
    }
    const spot = this.w.rules.partySpot?.();
    if (spot) return spot;
    const hw = this.w.grid.w / 2 - 2, hh = this.w.grid.h / 2 - 2;
    return { x: k.x > 0 ? -hw : hw, z: k.z > 0 ? -hh * 0.5 : hh };
  }
}

/** Sonya: star power pulls Kirill in, her fan club blocks the paths. */
export class Sonya extends Character {
  private life: number;
  fans: import('./units').Unit[] = [];
  constructor(w: WeekRun, x: number, z: number, public level: number, private permanent = false) {
    super(w, 'sonya', x, z, RING_YOURS);
    this.life = permanent ? Infinity : G.sonya.lifeSec;
    this.say(pickLine(LINES.sonya));
    // at the New Year table she came without her fan club
    for (let i = 0; i < (permanent ? 0 : G.sonya.fans); i++) {
      const a = (i / G.sonya.fans) * Math.PI * 2;
      const fx = x + Math.cos(a) * 1.9, fz = z + Math.sin(a) * 1.9;
      if (w.grid.blocked(fx, fz)) continue;
      const u = w.horde.spawn('fan', fx, fz);
      if (u) { Object.assign(u, { stationary: true, targetable: false, r: 0.32, life: this.life, behavior: 'wander' }); this.fans.push(u); }
    }
    const disc = w.fx.disc(this.radius(), 0xe86ab0, 0.06);
    disc.position.set(x, 0.035, z);
    this.ringDisc = disc;
  }
  private ringDisc: THREE.Group;
  radius() {
    const romchik = this.w.guests.some((g) => g.alive && g.name === 'romchik');
    return G.sonya.pullRadius * (this.level >= 2 ? 1.5 : 1) * (romchik ? 1.5 : 1);
  }
  update(dt: number) {
    const k = this.w.kirill;
    this.life -= dt;
    const r = this.radius();
    const dx = this.x - k.x, dz = this.z - k.z, d = Math.hypot(dx, dz);
    if (d < r && d > 1.2) {
      const s = G.sonya.pull * (k.has('alreadySelfie') ? 0.5 : 1) * (this.permanent ? 0.4 : 1);
      k.pullX += (dx / d) * s; k.pullZ += (dz / d) * s;
    }
    // level 3: the fans slow him down too
    if (this.level >= 3 && this.fans.some((f) => f.alive && Math.hypot(f.x - k.x, f.z - k.z) < 1.3)) k.slowMul *= 1 - G.sonya.fanSlow;
    this.rig.pose = 'talk';
    this.rig.faceTowards(Math.atan2(k.x - this.x, k.z - this.z), dt, 4);
    this.rig.update(dt, 0);
    this.sync();
    if (this.life <= 0) this.dispose();
  }
  dispose() {
    for (const f of this.fans) if (f.alive) this.w.horde.kill(f);
    this.w.fx.group.remove(this.ringDisc);
    super.dispose();
  }
}

/** Masha: gossip aura — no Sanity regen near her. Hosts the endless event in Week 11. */
export class Masha extends Character {
  private life: number;
  private aura: THREE.Group;
  constructor(w: WeekRun, x: number, z: number, public level: number, permanent = false) {
    super(w, 'masha', x, z, RING_YOURS);
    this.life = permanent ? Infinity : G.masha.lifeSec;
    this.aura = w.fx.disc(G.masha.gossipRadius, 0x9a5ae8, 0.08);
    this.aura.position.set(x, 0.035, z);
    this.say(pickLine(LINES.masha));
  }
  near() {
    const k = this.w.kirill;
    return Math.hypot(k.x - this.x, k.z - this.z) < G.masha.gossipRadius && !k.has('thickSkin');
  }
  update(dt: number) {
    const k = this.w.kirill;
    this.life -= dt;
    if (this.near()) {
      k.regenMul = 0;
      if (this.level >= 2) k.fireMul *= 0.8;
    }
    this.rig.pose = 'talk';
    this.rig.faceTowards(Math.atan2(k.x - this.x, k.z - this.z), dt, 4);
    this.rig.update(dt, 0);
    this.aura.position.set(this.x, this.elev + 0.035, this.z);
    this.sync();
    if (this.life <= 0) this.dispose();
  }
  dispose() {
    this.w.fx.group.remove(this.aura);
    super.dispose();
  }
}

/** Grisha, the wildcard: drifts half asleep; near Kirill it's a joke (+Sanity) or a contagious yawn. */
export class Grisha extends Character {
  private goal: { x: number; z: number };
  private done = false;
  private exit: { x: number; z: number };
  private nap = 0;
  constructor(w: WeekRun, x: number, z: number) {
    super(w, 'grisha', x, z, 0xffffff);
    this.exit = { x, z };
    this.goal = w.grid.randomFree(() => w.rng.next()) ?? { x: 0, z: 0 };
    w.feed(t('feed.grisha'), 'ally');
  }
  update(dt: number) {
    const k = this.w.kirill;
    if (this.nap > 0) { this.nap -= dt; this.rig.pose = 'stun'; this.rig.update(dt, 0); return; }
    const tgt = this.done ? this.exit : this.goal;
    const dx = tgt.x - this.x, dz = tgt.z - this.z, d = Math.hypot(dx, dz);
    if (d < 0.6) {
      if (this.done) { this.dispose(); return; }
      this.goal = this.w.grid.randomFree(() => this.w.rng.next()) ?? this.goal;
    }
    this.x += (dx / (d || 1)) * G.grisha.speed * dt;
    this.z += (dz / (d || 1)) * G.grisha.speed * dt;
    // your units can nudge him toward Kirill
    this.w.horde.query(this.x, this.z, 0.9, (u, ud) => {
      if (u.stationary || ud < 1e-3) return;
      this.x += ((this.x - u.x) / ud) * 0.6 * dt * 4;
      this.z += ((this.z - u.z) / ud) * 0.6 * dt * 4;
    });
    this.w.grid.resolve(this, 0.35);
    this.rig.pose = 'run';
    this.rig.faceTowards(Math.atan2(dx, dz), dt, 3);
    if (!this.done && Math.hypot(k.x - this.x, k.z - this.z) < G.grisha.triggerRadius) {
      this.done = true;
      if (this.w.rng.chance(0.5)) {
        this.say(t('grisha.joke'), 2.4);
        k.say([t('kirill.laugh')], true);
        this.w.rules.heal(G.grisha.jokeHeal);
      } else {
        this.say(t('grisha.yawn'), 2);
        k.stun = Math.max(k.stun, G.grisha.yawnSec);
        k.say(['…zzz'], true);
        this.nap = 1.2;
      }
    }
    this.rig.update(dt, 0.9);
    this.sync();
  }
}

/** Shady: joins after Artem has helped once; hacks one of your skills unless his friends are around. */
export class Shady extends Character {
  private t = 0;
  private hacked = false;
  private exit: { x: number; z: number };
  constructor(w: WeekRun, x: number, z: number) {
    super(w, 'shady', x, z, RING_FRIEND);
    this.exit = { x, z };
    w.feed(t('feed.shady'), 'ally');
  }
  update(dt: number) {
    const k = this.w.kirill;
    this.t += dt;
    const friend = this.w.guests.find((g) => g.alive && (g.name === 'romchik' || g.name === 'sonya'));
    const tgt = this.hacked ? this.exit : friend ? { x: friend.x + 1.2, z: friend.z } : { x: k.x + 2, z: k.z + 1 };
    const dx = tgt.x - this.x, dz = tgt.z - this.z, d = Math.hypot(dx, dz);
    if (d > 0.5) {
      this.x += (dx / d) * 2.2 * dt;
      this.z += (dz / d) * 2.2 * dt;
      this.w.grid.resolve(this, 0.35);
      this.rig.pose = 'run';
      this.rig.faceTowards(Math.atan2(dx, dz), dt);
    } else {
      this.rig.pose = friend && !this.hacked ? 'dance' : 'talk';
      if (this.hacked && d < 0.8) { this.dispose(); return; }
    }
    if (!this.hacked && !friend && this.t > 3) {
      this.hacked = true;
      const key = this.w.hackSkill();
      if (key) this.say(t('shady.hack'), 2.2);
    } else if (friend && !this.hacked && this.t > 3 && this.t < 3.1) this.say(t('shady.party'), 2);
    this.rig.update(dt, 2);
    this.sync();
  }
}
