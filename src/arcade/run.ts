import * as THREE from 'three';
import { Person } from '../hero/person';
import { randomKirillLook } from '../hero/look';
import { Rng } from '../core/rng';
import { sfx } from '../core/audio';
import { part, box, cyl, sphere, toon, at } from '../render/toon';
import { WALL_ITEMS, PROPS } from '../maps/props';
import { staticBatch } from '../maps/builder';
import * as T from '../render/textures';
import { t } from '../i18n';
import balance from '../data/balance.json';
import { Input, Lights, hudLayer, perspective, fitAspect, countdownText, clamp, damp, type ArcadeCtx, type ArcadeMode } from './common';

// Semester Run: reverse endless runner. Collect sheets, drop traps in Kirill's lane, break his
// nerve before he reaches the exam.

const RN = balance.arcade.run;
const LANE = 2.2;
const SEG = 24;
const SEGS = 8;
/** corridor ceiling height: tall enough that the chase camera always stays inside */
const CEIL = 6;

type ObKind = 'low' | 'high' | 'block';
interface Obstacle { kind: ObKind; lane: number; z: number; mesh: THREE.Object3D; hit: boolean; kHandled: boolean; trap?: boolean; combo?: boolean }
interface Pickup { kind: 'quiz' | 'mail'; lane: number; z: number; y: number; mesh: THREE.Object3D; taken: boolean }

export class SemesterRun implements ArcadeMode {
  scene = new THREE.Scene();
  camera = perspective(62);
  private input: Input;
  private lights: Lights;
  private rng = new Rng(Math.floor(Math.random() * 1e9));
  private segs: THREE.Group[] = [];
  private obstacles: Obstacle[] = [];
  private pickups: Pickup[] = [];
  private nextRow = -40;
  // the semester (you)
  private sem = new THREE.Group();
  private papers: { m: THREE.Object3D; r: number; y: number; a: number; s: number }[] = [];
  private z = 0;
  private x = 0;
  private lane = 0;
  private y = 0;
  private vy = 0;
  private slide = 0;
  private stumble = 0;
  private boost = 0;
  private chaos = 0;
  private mails = 0;
  // Kirill
  private kirill: Person;
  private kz = 0;
  private kx = 0;
  private klane = 0;
  private ky = 0;
  private kvy = 0;
  private kslide = 0;
  private kstumble = 0;
  private kstun = 0;
  private gap: number = RN.startGap;
  /** Kirill's nerve: 100 = he breaks down in the corridor */
  private nerve = 0;
  private lastTrap = -9;
  private trapsHit = 0;
  private examAt: number;
  private speed: number = RN.startSpeed;
  private time = -3;
  private dist = 0;
  private hud: HTMLElement;
  private finished = false;
  private shake = 0;

  constructor(private ctx: ArcadeCtx) {
    this.input = new Input(ctx.stage.renderer.domElement);
    this.scene.background = new THREE.Color(0x1d1a22);
    this.scene.fog = new THREE.Fog(0x2a2420, 45, 125);
    this.lights = new Lights(this.scene, new THREE.Vector3(-6, 22, 6), 26);
    this.lights.hemi.intensity = 1.6;
    for (let i = 0; i < SEGS; i++) {
      const g = this.buildSegment(i);
      g.position.z = -i * SEG;
      this.scene.add(g);
      this.segs.push(g);
    }
    this.buildSemester();
    this.kirill = new Person(ctx.story?.look ?? randomKirillLook(this.rng));
    this.examAt = ctx.story ? RN.examStory : RN.exam;
    this.kirill.facing = Math.PI;
    this.kirill.root.rotation.y = Math.PI;
    this.scene.add(this.kirill.root);
    this.kz = -this.gap;
    ctx.stage.override = { scene: this.scene, camera: this.camera };

    this.hud = hudLayer(`
      <div class="ar-top"><div class="ar-big dist"></div><div class="run-gap"><span class="gap-t"></span><div class="bar"><div class="fill gap"></div></div></div>
        <div class="run-gap nerve-box"><span>${t('run.nerve')}</span><div class="bar"><div class="fill nerve"></div></div></div></div>
      <div class="ar-center"></div>
      <div class="ar-bottom">
        <div class="ar-bar"><span>${t('run.chaos')}</span><div class="bar"><div class="fill chaos"></div></div><b class="ammo"></b></div>
        <div class="ar-pad"><b class="ar-skill" data-key="a">◀</b><b class="ar-skill" data-key="w">▲</b><b class="ar-skill" data-key="s">▼</b><b class="ar-skill" data-key="d">▶</b></div>
        <div class="ar-skill tr tr-low" data-key="j">🪑 <b>J</b> ${t('run.trapLow')} <i>${RN.trapCost}</i></div>
        <div class="ar-skill tr tr-high" data-key="k">🚧 <b>K</b> ${t('run.trapHigh')} <i>${RN.trapCost}</i></div>
        <div class="ar-skill tr tr-block" data-key="l">🧍 <b>L</b> ${t('run.trapBlock')} <i>${RN.trapCost}</i></div>
        <div class="ar-skill boost-ready" data-key="shift">⇧ ${t('run.boost')} <i>${RN.boostCost}</i></div>
        <div class="ar-skill mails" data-key="e">✉ <b>E</b> <span class="m-n"></span></div>
        <div class="ar-keys">${t('run.keys')}</div>
      </div>`);
    this.input.buttons(this.hud);
  }

  // ---------------------------------------------------------------- world

  /** One 24 m stretch of corridor: tiled floor, walls with doors, boards and windows, ceiling lights. */
  private buildSegment(i: number) {
    const g = new THREE.Group();
    const statics = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9.2, SEG), toon(0xffffff, { map: T.tileFloor(9.2, SEG, 61 + (i % 3), '#e2d7c4', '#d3c6ae', 1.5) }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -SEG / 2;
    floor.receiveShadow = true;
    g.add(floor);
    for (const side of [-1, 1]) {
      statics.add(at(part(box(0.4, CEIL, SEG), 0xe9e1cf, { outline: 0.03 }), side * 4.8, CEIL / 2, -SEG / 2));
      statics.add(at(part(box(0.44, 1.1, SEG), i % 2 ? 0x5e8a6a : 0xb9a88c, { outline: false }), side * 4.78, 0.55, -SEG / 2));
      // wall decor every few metres
      for (let z = -3; z > -SEG; z -= 6) {
        const kind = this.rng.pick(['door', 'noticeBoard', 'window', 'banner', 'door', 'poster', 'extinguisher']);
        const item = WALL_ITEMS[kind](this.rng);
        item.position.set(side * 4.58, kind === 'door' ? 1.2 : kind === 'window' ? 2.2 : 1.8, z + this.rng.range(-1, 1));
        item.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        statics.add(item);
      }
      if (this.rng.chance(0.6)) { const pl = PROPS.plant.build(this.rng); pl.position.set(side * 4.1, 0, -this.rng.range(2, SEG - 2)); statics.add(pl); }
    }
    statics.add(at(part(box(9.6, 0.2, SEG), 0xf1ead8, { outline: false, shadow: false }), 0, CEIL + 0.1, -SEG / 2));
    for (let z = -4; z > -SEG; z -= 8) statics.add(at(part(box(2.6, 0.06, 0.7), 0xffffff, { emissive: 0xfff4dc, emissiveIntensity: 0.9, outline: false, shadow: false }), 0, CEIL - 0.05, z));
    // a hanging zone sign now and then
    if (i % 3 === 1) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.8), toon(0xffffff, { map: T.receiptTex(this.rng.pick(['КОРПУС 2', 'ДЕКАНАТ →', 'СТОЛОВАЯ', 'ЭКЗАМЕН ↑', 'АУДИТОРИЯ 312', 'СПОРТЗАЛ']), '#2b3f6b', '#ffffff') }));
      sign.position.set(0, 4.4, -SEG / 2);
      statics.add(sign);
    }
    g.add(staticBatch(statics));
    return g;
  }

  /** THE SEMESTER: a whirlwind of exam papers and alarm clocks around a dark core with eyes. */
  private buildSemester() {
    const core = part(sphere(0.75, 18, 14), 0x2a1a3a, { emissive: 0x1a0a2a });
    core.position.y = 1.4;
    this.sem.add(core);
    for (const ex of [-0.28, 0.28]) {
      const eye = new THREE.Mesh(sphere(0.16, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff4c0, toneMapped: false }));
      eye.position.set(ex, 1.55, -0.68);
      const pupil = new THREE.Mesh(sphere(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xc0201a }));
      pupil.position.set(ex, 1.55, -0.82);
      this.sem.add(eye, pupil);
    }
    const quiz = T.quizTex();
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56), toon(0xffffff, { map: quiz, side: THREE.DoubleSide }));
      m.castShadow = true;
      this.sem.add(m);
      this.papers.push({ m, r: 0.9 + Math.random() * 1.1, y: 0.3 + Math.random() * 2.6, a: Math.random() * Math.PI * 2, s: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3) });
    }
    for (let i = 0; i < 3; i++) {
      const clock = new THREE.Group();
      clock.add(part(cyl(0.26, 0.26, 0.16, 18), 0xd8382a));
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.22, 18), toon(0xffffff, { map: T.clockFaceTex() }));
      face.position.y = 0.09;
      face.rotation.x = -Math.PI / 2;
      clock.add(face);
      this.sem.add(clock);
      this.papers.push({ m: clock, r: 1.4, y: 1.0 + i * 0.5, a: (i / 3) * Math.PI * 2, s: 2.2 });
    }
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.sem.add(shadow);
    this.scene.add(this.sem);
  }

  /** A row of obstacles 15–22 m apart; at least one lane always passes. */
  private spawnRow(z: number) {
    const kinds: ObKind[] = [];
    const pattern = this.rng.next();
    const lanes = [-1, 0, 1];
    if (pattern < 0.35) {
      // two blocks, one free lane
      const free = this.rng.pick(lanes);
      for (const l of lanes) if (l !== free) this.addObstacle('block', l, z);
      kinds.push('block');
    } else if (pattern < 0.6) {
      for (const l of lanes) this.addObstacle('low', l, z);
      kinds.push('low');
    } else if (pattern < 0.8) {
      for (const l of lanes) this.addObstacle('high', l, z);
      kinds.push('high');
    } else {
      const free = this.rng.pick(lanes);
      for (const l of lanes) if (l !== free) this.addObstacle(this.rng.chance(0.5) ? 'block' : 'low', l, z);
    }
    // pickups: a line of quiz sheets in a lane, sometimes an envelope
    const pl = this.rng.pick(lanes);
    for (let i = 0; i < 5; i++) this.addPickup('quiz', pl, z + 6 + i * 1.6);
    if (this.rng.chance(0.28)) this.addPickup('mail', this.rng.pick(lanes), z - 6);
  }

  private addObstacle(kind: ObKind, lane: number, z: number) {
    let mesh: THREE.Object3D;
    if (kind === 'block') {
      mesh = this.rng.chance(0.5) ? PROPS.vending.build(this.rng) : PROPS.waterCooler.build(this.rng);
      mesh.scale.setScalar(1.15);
    } else if (kind === 'low') {
      mesh = this.rng.chance(0.5) ? PROPS.bench.build(this.rng) : PROPS.turnstile.build(this.rng);
    } else {
      // repair tape / a banner at head height
      const g = new THREE.Group();
      g.add(at(part(box(0.1, 2.0, 0.1), 0x3b3f47), -1, 1.0, 0), at(part(box(0.1, 2.0, 0.1), 0x3b3f47), 1, 1.0, 0));
      g.add(at(part(box(2.2, 0.55, 0.06), 0xffffff, { map: T.receiptTex('РЕМОНТ', '#e8c547', '#1d1613') }), 0, 1.75, 0));
      mesh = g;
    }
    mesh.position.set(lane * LANE, 0, z);
    this.scene.add(mesh);
    this.obstacles.push({ kind, lane, z, mesh, hit: false, kHandled: false });
  }

  private addPickup(kind: 'quiz' | 'mail', lane: number, z: number) {
    const mesh = kind === 'quiz'
      ? new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.64), toon(0xffffff, { map: T.quizTex(), side: THREE.DoubleSide }))
      : new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.06), toon(0xf4efe2, { emissive: 0x3a3020 }));
    mesh.position.set(lane * LANE, 1.0, z);
    this.scene.add(mesh);
    this.pickups.push({ kind, lane, z, y: 1.0, mesh, taken: false });
  }

  // ---------------------------------------------------------------- tick

  update(dt: number) {
    if (this.finished) return;
    fitAspect(this.camera);
    const before = this.time;
    this.time += dt;
    if (before < 0 && this.time >= 0) sfx.whistle();
    if (this.time < 0) { this.animate(dt, 0); this.input.endFrame(); return; }

    const k = this.input;
    // you
    if (k.hit('a', 'arrowleft')) this.lane = Math.max(-1, this.lane - 1);
    if (k.hit('d', 'arrowright')) this.lane = Math.min(1, this.lane + 1);
    if (k.hit('w', 'arrowup', ' ') && this.y <= 0.01) { this.vy = 9.5; this.slide = 0; sfx.click(); }
    if (k.hit('s', 'arrowdown')) { this.slide = 0.7; if (this.y > 0) this.vy = -14; }
    if (k.hit('shift', 'q') && this.chaos >= RN.boostCost && this.boost <= 0) { this.chaos -= RN.boostCost; this.boost = RN.boostSec; sfx.levelUp(); this.flash(t('run.boosting')); }
    if (k.hit('e') && this.mails >= RN.emailCharges) {
      this.mails = 0;
      this.kstun = RN.emailStun;
      this.addNerve(RN.nerveMail);
      sfx.email();
      this.flash(t('run.mailSent'));
    }
    for (const [key, kind] of [['j', 'low'], ['k', 'high'], ['l', 'block']] as [string, ObKind][]) {
      if (k.hit(key) && this.chaos >= RN.trapCost) this.dropTrap(kind);
    }
    this.x += (this.lane * LANE - this.x) * damp(dt, 14);
    this.vy -= 28 * dt;
    this.y = Math.max(0, this.y + this.vy * dt);
    this.slide = Math.max(0, this.slide - dt);
    this.stumble = Math.max(0, this.stumble - dt);
    this.boost = Math.max(0, this.boost - dt);

    this.speed = Math.min(RN.maxSpeed, RN.startSpeed + RN.accel * this.time * 3);
    const vp = this.speed * (this.boost > 0 ? RN.boostMul : 1) * (this.stumble > 0 ? 0.5 : 1);
    this.kstun = Math.max(0, this.kstun - dt);
    this.kstumble = Math.max(0, this.kstumble - dt);
    const vk = this.speed * 1.07 * (this.kstun > 0 ? 0.15 : this.kstumble > 0 ? 0.5 : 1);
    this.z -= vp * dt;
    this.kz -= vk * dt;
    this.dist += vp * dt;
    this.gap = this.z - this.kz;

    this.kirillAI(dt);
    this.collide();
    this.recycle();
    this.animate(dt, vp);
    this.input.endFrame();

    if (this.gap <= RN.catchGap) this.end(true, 'caught');
    else if (this.nerve >= 100) this.end(true, 'broke');
    else if (-this.kz >= this.examAt) this.end(false, 'exam');
    else if (this.gap >= RN.escapeGap || this.time > 180) this.end(false, 'escaped');
  }

  /** Kirill reads the row ahead and dodges — usually. */
  private kirillAI(dt: number) {
    for (const o of this.obstacles) {
      const ahead = this.kz - o.z;
      if (o.kHandled || ahead > 11 || ahead < 0) continue;
      if (o.lane !== this.klane) continue;
      o.kHandled = true;
      // your traps are harder to read, more so in quick succession and as his nerve frays
      const slip = o.trap
        ? this.rng.chance(RN.trapHit + (o.combo ? 0.2 : 0) + this.nerve * 0.002)
        : this.rng.chance(RN.kirillSlip + this.speed * 0.002);
      if (o.kind === 'block') {
        const blocked = new Set(this.obstacles.filter((b) => b.kind === 'block' && Math.abs(b.z - o.z) < 0.5).map((b) => b.lane));
        const free = [-1, 0, 1].filter((l) => !blocked.has(l));
        if (!slip && free.length) this.klane = free.sort((a, b) => Math.abs(a - this.klane) - Math.abs(b - this.klane))[0];
      }
      if (slip) this.kirillPlannedSlip = o;
    }
    // jumps and slides at the right moment
    for (const o of this.obstacles) {
      if (o.lane !== this.klane) continue;
      const ahead = this.kz - o.z;
      if (ahead > 0 && ahead < 2.4 && this.kirillPlannedSlip !== o) {
        if (o.kind === 'low' && this.ky <= 0.01) this.kvy = 9.5;
        if (o.kind === 'high') this.kslide = 0.6;
      }
      if (ahead <= 0 && ahead > -0.6 && this.kirillPlannedSlip === o) {
        this.kirillPlannedSlip = null;
        this.kstumble = RN.stumbleSec;
        if (o.trap) { this.trapsHit++; this.addNerve(RN.nerveTrap); this.flash(t('run.trapped')); this.shake = 0.25; o.mesh.rotation.x = -1.2; }
        else { this.addNerve(RN.nerveSlip); this.flash(t('run.kirillSlip')); }
        sfx.hurt();
      }
    }
    this.kx += (this.klane * LANE - this.kx) * damp(dt, 10);
    this.kvy -= 28 * dt;
    this.ky = Math.max(0, this.ky + this.kvy * dt);
    this.kslide = Math.max(0, this.kslide - dt);
  }
  private kirillPlannedSlip: Obstacle | null = null;

  private collide() {
    for (const o of this.obstacles) {
      if (o.hit || Math.abs(o.z - this.z) > 0.6 || Math.abs(o.lane * LANE - this.x) > 1.1) continue;
      const cleared = (o.kind === 'low' && this.y > 0.7) || (o.kind === 'high' && this.slide > 0);
      if (cleared) continue;
      o.hit = true;
      this.stumble = RN.stumbleSec;
      this.shake = 0.4;
      o.mesh.rotation.x = -1.2;
      sfx.boom();
      this.flash(t('run.ouch'));
    }
    for (const p of this.pickups) {
      if (p.taken || Math.abs(p.z - this.z) > 0.8 || Math.abs(p.lane * LANE - this.x) > 1.0) continue;
      p.taken = true;
      p.mesh.visible = false;
      if (p.kind === 'quiz') { this.chaos = Math.min(RN.chaosMax, this.chaos + 1); sfx.ding(); }
      else { this.mails = Math.min(RN.emailCharges, this.mails + 1); sfx.email(); }
    }
  }

  /** Move passed corridor segments to the front; spawn rows ahead; drop what's behind. */
  private recycle() {
    for (const g of this.segs) if (g.position.z > this.z + SEG + 6) g.position.z -= SEGS * SEG;
    while (this.nextRow > this.z - 110) {
      this.spawnRow(this.nextRow);
      this.nextRow -= this.rng.range(15, 22) + this.speed * 0.25;
    }
    // your traps fold away once Kirill is past them
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      if (o.trap && o.z > this.kz + 1.2) { this.scene.remove(o.mesh); this.obstacles.splice(i, 1); }
    }
    const behind = this.z + 12;
    for (const list of [this.obstacles, this.pickups] as { z: number; mesh: THREE.Object3D }[][]) {
      for (let i = list.length - 1; i >= 0; i--) if (list[i].z > behind) { this.scene.remove(list[i].mesh); list.splice(i, 1); }
    }
  }

  private animate(dt: number, vp: number) {
    const tm = this.time;
    this.sem.position.set(this.x, this.y * 0.9, this.z);
    this.sem.scale.set(1, this.slide > 0 ? 0.55 : 1, 1);
    for (const p of this.papers) {
      p.a += p.s * dt * (1 + vp * 0.03);
      p.m.position.set(Math.cos(p.a) * p.r, p.y + Math.sin(tm * 3 + p.a) * 0.15, Math.sin(p.a) * p.r);
      p.m.rotation.set(tm * 2 + p.a, p.a, 0);
    }
    this.kirill.pose = this.kstun > 0 ? 'stun' : this.kslide > 0 ? 'sit' : 'run';
    this.kirill.update(dt, 3.5);
    this.kirill.root.position.set(this.kx, this.ky * 0.9, this.kz);
    for (const p of this.pickups) if (!p.taken) p.mesh.rotation.y += dt * 3;
    for (const o of this.obstacles) if (o.trap && o.mesh.position.y > 0) o.mesh.position.y = Math.max(0, o.mesh.position.y - dt * 16);
  }

  private flash(text: string) {
    const c = this.hud.querySelector('.ar-center') as HTMLElement;
    c.innerHTML = `<div class="ar-flash">${text}</div>`;
    setTimeout(() => { if (c.firstElementChild?.textContent === text) c.innerHTML = ''; }, 1000);
  }

  /** drop a trap from the ceiling in Kirill's lane, a little ahead of him */
  private dropTrap(kind: ObKind) {
    this.chaos -= RN.trapCost;
    const z = this.kz - RN.trapAhead - this.speed * 0.15;
    // the Dean's queue fills his lane and one more, so he has to read which way is free
    const lanes = kind === 'block' ? [this.klane, this.klane === 0 ? (this.rng.chance(0.5) ? -1 : 1) : 0] : [this.klane];
    const combo = this.time - this.lastTrap < 1.6;
    for (const l of lanes) {
      this.addObstacle(kind, l, z);
      const o = this.obstacles[this.obstacles.length - 1];
      o.trap = true;
      o.combo = combo;
      o.mesh.position.y = 5;
    }
    this.lastTrap = this.time;
    sfx.place();
  }

  private addNerve(n: number) {
    this.nerve = Math.min(100, this.nerve + n);
  }

  private end(win: boolean, why: 'caught' | 'broke' | 'exam' | 'escaped') {
    this.finished = true;
    const score = Math.round(this.dist) + Math.round(this.nerve * 20) + this.trapsHit * 150 + (win ? 3000 + Math.max(0, Math.round(1500 - this.time * 15)) : 0);
    win ? sfx.levelUp() : sfx.debt();
    this.ctx.onExit({ mode: 'run', win, score, detail: t('run.end.' + why, { m: Math.round(this.dist), n: this.trapsHit }) });
  }

  render() {
    if (this.finished) return;
    const sh = this.shake;
    this.shake *= 0.9;
    // low behind the whirlwind, well under the ceiling, looking down the corridor at Kirill
    this.camera.position.set(this.x * 0.55 + (Math.random() - 0.5) * sh, 3.1 + this.y * 0.35 + (Math.random() - 0.5) * sh, this.z + 6.8);
    this.camera.lookAt(this.x * 0.35, 1.3, this.z - 14);
    this.lights.follow(0, this.z - 8);
    const q = (s: string) => this.hud.querySelector(s) as HTMLElement;
    q('.dist').textContent = `${Math.round(this.dist)} ${t('run.m')}`;
    q('.gap-t').textContent = t('run.gap', { m: Math.max(0, Math.round(this.gap)), e: Math.max(0, Math.round(this.examAt + this.kz)) });
    q('.nerve').style.width = `${this.nerve}%`;
    q('.ammo').textContent = `📄 ${this.chaos}`;
    for (const sel of ['.tr-low', '.tr-high', '.tr-block']) q(sel).classList.toggle('cooling', this.chaos < RN.trapCost);
    q('.gap').style.width = `${clamp(1 - this.gap / RN.escapeGap, 0, 1) * 100}%`;
    q('.chaos').style.width = `${(this.chaos / RN.chaosMax) * 100}%`;
    q('.boost-ready').classList.toggle('cooling', this.chaos < RN.boostCost);
    q('.m-n').textContent = '✉'.repeat(this.mails) + '·'.repeat(RN.emailCharges - this.mails);
    q('.mails').classList.toggle('cooling', this.mails < RN.emailCharges);
    if (this.time < 0.8) q('.ar-center').innerHTML = countdownText(-this.time, t('race.go')) ? `<div class="ar-count">${countdownText(-this.time, t('race.go'))}</div>` : '';
  }

  /** for tests */
  get inputs() { return this.input; }
  get state() { return { lane: this.lane, z: this.z, gap: this.gap, obstacles: this.obstacles, chaos: this.chaos, mails: this.mails, nerve: this.nerve }; }

  dispose() {
    this.input.dispose();
    this.hud.remove();
    if (this.ctx.stage.override?.scene === this.scene) this.ctx.stage.override = null;
  }
}
