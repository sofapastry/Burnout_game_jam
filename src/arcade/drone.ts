import * as THREE from 'three';
import { Person } from '../hero/person';
import { randomKirillLook } from '../hero/look';
import { Rng } from '../core/rng';
import { sfx, juice, music } from '../core/audio';
import { part, box, toon, at } from '../render/toon';
import { staticBatch } from '../maps/builder';
import * as T from '../render/textures';
import { t } from '../i18n';
import balance from '../data/balance.json';
import { Input, Lights, hudLayer, perspective, fitAspect, countdownText, clamp, type ArcadeCtx, type ArcadeMode } from './common';

// Lecture Drone: rhythm game, you are the lecture. Hit notes in D F J K to make Kirill drowsy;
// red notes wake him up, golden ones catch him on his coffee break.

const L = balance.arcade.drone;
const LANES = ['d', 'f', 'j', 'k'];
const LEAD = 1.7; // seconds a note is visible before it reaches the line
const PERFECT = 0.07, GOOD = 0.14;

type Kind = 'tap' | 'hold' | 'slap' | 'gold';
interface Note { t: number; lane: number; kind: Kind; end: number; el: HTMLElement | null; judged: boolean; holding: boolean; group?: number }

export class LectureDrone implements ArcadeMode {
  scene = new THREE.Scene();
  camera = perspective(45);
  private input: Input;
  private lights: Lights;
  private rng = new Rng(Math.floor(Math.random() * 1e9));
  private kirill: Person;
  private mates: { p: Person; sleepAt: number; asleep: boolean }[] = [];
  private notes: Note[] = [];
  private hud: HTMLElement;
  private lanesEl: HTMLElement;
  private time = -3;
  private drowsy = 0;
  private combo = 0;
  private best = 0;
  private hits = 0;
  private total = 0;
  private coffees: { group: number; t: number; got: number; of: number; done: boolean }[] = [];
  private slapT = 0;
  private sipT = 0;
  private finished = false;
  private outro = 0;
  private won = false;
  private length: number;
  private beat: number;
  /** tests: hit the notes (and leave the slaps alone); autoSkill < 1 skips some, like a human */
  autopilot = false;
  autoSkill = 1;

  constructor(private ctx: ArcadeCtx) {
    this.input = new Input(ctx.stage.renderer.domElement);
    this.scene.background = new THREE.Color(0x2a2430);
    this.lights = new Lights(this.scene, new THREE.Vector3(-8, 14, 6), 12);
    this.lights.follow(0, -2);
    this.length = ctx.story ? L.storyLength : L.length;
    this.beat = 60 / L.bpm;
    this.buildRoom();
    this.kirill = new Person(ctx.story?.look ?? randomKirillLook(this.rng));
    this.seat(this.kirill, 0, -0.9);
    const spots: [number, number][] = [[-2.5, -0.9], [2.5, -0.9], [-1.25, -3.1], [1.25, -3.1], [-3.75, -3.1], [3.75, -3.1]];
    spots.forEach(([x, z], i) => {
      const p = new Person(randomKirillLook(this.rng.fork('mate' + i)));
      this.seat(p, x, z);
      this.mates.push({ p, sleepAt: 6 + i * 6, asleep: false });
    });
    this.chart();
    ctx.stage.override = { scene: this.scene, camera: this.camera };

    this.hud = hudLayer(`
      <div class="ld-top">
        <div class="ld-meter"><span>😴 ${t('ld.eyelids')}</span><div class="bar"><div class="fill dz"></div></div></div>
        <div class="ld-time"></div>
      </div>
      <div class="ld-combo"></div>
      <div class="ld-judge"></div>
      <div class="ld-zzz hidden">Z z z</div>
      <div class="ld-lanes">
        ${LANES.map((k, i) => `<div class="ld-lane" data-lane="${i}"><div class="ld-line"></div><b class="ld-key" data-key="${k}" data-hold>${k.toUpperCase()}</b></div>`).join('')}
      </div>
      <div class="ar-center"></div>
      <div class="ar-bottom"><div class="ar-keys">${t('ld.keys')}</div></div>`);
    this.lanesEl = this.hud.querySelector('.ld-lanes') as HTMLElement;
    this.input.buttons(this.hud);
  }

  private seat(p: Person, x: number, z: number) {
    p.pose = 'sit';
    p.root.position.set(x, 0, z);
    p.root.rotation.y = 0;
    p.facing = 0;
    this.scene.add(p.root);
  }

  // ---------------------------------------------------------------- the room

  private buildRoom() {
    const s = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), toon(0xffffff, { map: T.lectureFloor(14, 12) }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // back wall with windows (evening), side walls
    s.add(at(part(box(14, 5, 0.3), 0xe4dccb, { outline: false }), 0, 2.5, -6.5));
    for (let x = -5; x <= 5; x += 2.5) s.add(at(part(box(1.6, 2.2, 0.1), 0x3a4a78, { emissive: 0x1a2240, outline: false }), x, 2.8, -6.3));
    for (const sx of [-1, 1]) s.add(at(part(box(0.3, 5, 12), 0xd8cfbd, { outline: false }), sx * 6.5, 2.5, -1));
    // desks in two rows, facing the lecturer (the camera)
    for (const [x, z] of [[0, -0.9], [-2.5, -0.9], [2.5, -0.9], [-1.25, -3.1], [1.25, -3.1], [-3.75, -3.1], [3.75, -3.1]]) {
      s.add(at(part(box(1.3, 0.08, 0.7), 0x8a5a35), x, 0.78, z + 0.55));
      s.add(at(part(box(1.2, 0.72, 0.06), 0x6a4630), x, 0.4, z + 0.88));
      s.add(at(part(box(0.32, 0.03, 0.42), 0xf6f3ea, { outline: false }), x - 0.25, 0.83, z + 0.5));
    }
    // the coffee cup on Kirill's desk
    s.add(at(part(new THREE.CylinderGeometry(0.08, 0.065, 0.16, 12), 0xf2efe6), 0.42, 0.9, -0.4));
    this.scene.add(staticBatch(s));
  }

  /** the lecture: steady quarter notes, eighths later on, holds, slaps and coffee bursts */
  private chart() {
    const b = this.beat;
    let lane = 1, group = 0;
    for (let tm = 2 * b; tm < this.length - b; tm += b) {
      const progress = tm / this.length;
      // a coffee burst every ~16 s: four golden notes on eighths
      if (tm >= this.sipT + L.coffeeEvery && tm < this.length - 6) {
        this.sipT = tm;
        group++;
        const lanes = [0, 1, 2, 3].sort(() => this.rng.next() - 0.5);
        for (let i = 0; i < 4; i++) this.add(tm + (i * b) / 2, lanes[i], 'gold', group);
        this.coffees.push({ group, t: tm + 2 * b, got: 0, of: 4, done: false });
        tm += 2 * b;
        continue;
      }
      lane = (lane + this.rng.int(1, 3)) % 4;
      if (progress > 0.2 && this.rng.chance(0.12)) { this.add(tm, lane, 'hold', 0, tm + b * 2); tm += b; continue; }
      if (tm - this.slapT > L.slapEvery && this.rng.chance(0.35)) { this.slapT = tm; this.add(tm, lane, 'slap'); continue; }
      this.add(tm, lane, 'tap');
      // eighth notes in the busier second half
      if (progress > 0.45 && this.rng.chance(0.45)) this.add(tm + b / 2, (lane + 2) % 4, 'tap');
    }
    this.total = this.notes.filter((n) => n.kind !== 'slap').length;
  }

  private add(tm: number, lane: number, kind: Kind, group = 0, end = tm) {
    this.notes.push({ t: tm, lane, kind, end, el: null, judged: false, holding: false, group });
  }

  // ---------------------------------------------------------------- tick

  update(dt: number) {
    if (this.finished) return;
    fitAspect(this.camera);
    if (this.outro > 0) {
      this.outro -= dt;
      this.animate(dt);
      if (this.outro <= 0) this.exit();
      this.input.endFrame();
      return;
    }
    const before = this.time;
    this.time += dt;
    if (before < 0 && this.time >= 0) sfx.reveal();
    music.set(0.074); // ≈ 100 bpm, sparse: the most boring beat in the building
    const k = this.input;
    // presses
    for (let i = 0; i < 4; i++) {
      let hit = k.hit(LANES[i]);
      if (this.autopilot) hit = this.notes.some((n) => n.lane === i && !n.judged && n.kind !== 'slap' && this.time >= n.t + (1 - this.autoSkill) * 0.1 && this.time - n.t < GOOD && (this.autoSkill >= 1 || ((n.t * 1000) % 100) / 100 < this.autoSkill));
      if (hit && this.time >= 0) this.press(i);
    }
    // holds
    for (const n of this.notes) {
      if (n.kind !== 'hold' || !n.holding) continue;
      const held = this.autopilot || k.down(LANES[n.lane]);
      if (!held || this.time >= n.end) { n.holding = false; if (this.time < n.end - 0.15) this.judgeText('miss'); }
      else this.addDrowsy(L.hold * dt);
    }
    // missed notes
    for (const n of this.notes) {
      if (n.judged || this.time < n.t + GOOD) continue;
      n.judged = true;
      if (n.kind === 'slap') { this.addDrowsy(L.slapDodge); continue; }
      this.miss(n);
    }
    // coffee: once its burst is over, he either dozes off on the cup or drinks
    for (const c of this.coffees) {
      if (c.done || this.time < c.t + GOOD) continue;
      c.done = true;
      if (c.got >= 3) { this.flash(t('ld.cupWin')); this.addDrowsy(L.coffeeWin); juice.sting(3); }
      else { this.flash(t('ld.cupLose')); this.addDrowsy(-L.coffeeLose); sfx.debt(); this.kirill.pose = 'cheer'; }
    }
    if (this.time > 0) this.addDrowsy(-L.decay * dt * (1 + 0.04 * ((this.ctx.story?.level ?? 1) - 1)));
    if (this.drowsy >= 100) this.finish(true);
    else if (this.time >= this.length) this.finish(false);
    this.animate(dt);
    this.input.endFrame();
  }

  private press(lane: number) {
    // the nearest note waiting in this lane
    let best: Note | null = null, bd = Infinity;
    for (const n of this.notes) {
      if (n.lane !== lane || n.judged) continue;
      const d = Math.abs(n.t - this.time);
      if (d < bd) { bd = d; best = n; }
    }
    if (!best || bd > GOOD) { this.drone(lane, 0.3); return; }
    best.judged = true;
    best.el?.classList.add('hit');
    if (best.kind === 'slap') {
      // you hit the slap: he slaps himself awake
      this.combo = 0;
      this.addDrowsy(-L.slapHit);
      this.flash(t('ld.slap'));
      this.kirill.hurt();
      sfx.hurt();
      return;
    }
    const perfect = bd <= PERFECT;
    this.combo++;
    this.best = Math.max(this.best, this.combo);
    this.hits++;
    this.judgeText(perfect ? 'perfect' : 'good');
    const mult = 1 + Math.min(1, this.combo / 40);
    this.addDrowsy((perfect ? L.perfect : L.good) * mult);
    if (best.kind === 'hold') best.holding = true;
    if (best.kind === 'gold') { const c = this.coffees.find((x) => x.group === best!.group); if (c) c.got++; }
    this.drone(lane, perfect ? 1 : 0.7);
    if (this.combo % 10 === 0) juice.sting(Math.min(4, this.combo / 10));
  }

  private miss(n: Note) {
    if (n.kind === 'gold') return; // counted by the coffee check
    this.combo = 0;
    this.addDrowsy(-L.miss);
    this.judgeText('miss');
    n.el?.classList.add('missed');
  }

  /** the lecturer's monotone syllable, one pitch per lane */
  private drone(lane: number, vol: number) {
    const f = [131, 147, 156, 175][lane];
    sfx.droneNote(f, vol);
  }

  private addDrowsy(v: number) {
    this.drowsy = clamp(this.drowsy + v, 0, 100);
    // asleep the moment his eyes close (before the per-frame fight against sleep pulls him back)
    if (v > 0 && this.drowsy >= 100) this.finish(true);
  }

  private judgeText(kind: 'perfect' | 'good' | 'miss') {
    const e = this.hud.querySelector('.ld-judge') as HTMLElement;
    e.textContent = t('ld.' + kind);
    e.className = 'ld-judge ' + kind;
    void e.offsetWidth;
    e.classList.add('pop');
  }

  private flash(text: string) {
    const c = this.hud.querySelector('.ar-center') as HTMLElement;
    c.innerHTML = `<div class="ar-flash">${text}</div>`;
    setTimeout(() => { if (c.firstElementChild?.textContent === text) c.innerHTML = ''; }, 1500);
  }

  private animate(dt: number) {
    const k = this.kirill;
    const d = this.drowsy / 100;
    if (k.pose !== 'sit' && this.outro <= 0) { this.sipAnim = (this.sipAnim ?? 0) + dt; if (this.sipAnim > 1.2) { k.pose = 'sit'; this.sipAnim = 0; } }
    k.update(dt, 0);
    // his head droops and his eyes close as the lecture works
    const nod = d > 0.5 ? Math.max(0, Math.sin(this.time * 1.6)) * 0.25 * d : 0;
    k.head.rotation.x = Math.min(1.25, d * 0.8 + nod + (this.won ? 0.6 : 0));
    k.eyes.scale.y = Math.max(0.08, 1 - d * 0.9);
    // classmates nod off as your combo grows
    for (const m of this.mates) {
      if (!m.asleep && this.best >= m.sleepAt) m.asleep = true;
      m.p.update(dt, 0);
      if (m.asleep) { m.p.head.rotation.x = 1.1 + Math.sin(this.time * 1.2 + m.sleepAt) * 0.06; m.p.eyes.scale.y = 0.08; }
    }
  }
  private sipAnim = 0;

  private finish(win: boolean) {
    if (this.outro > 0 || this.finished) return;
    this.won = win;
    this.outro = 2;
    this.flash(t(win ? 'ld.asleep' : 'ld.awake'));
    if (win) { sfx.levelUp(); this.kirill.pose = 'sit'; } else sfx.debt();
  }

  private exit() {
    this.finished = true;
    // accuracy over the notes that actually came up (the lecture may end early)
    const played = this.notes.filter((n) => n.kind !== 'slap' && n.kind !== 'gold' && n.t <= this.time).length;
    const acc = played ? Math.min(100, Math.round((this.hits / played) * 100)) : 0;
    const score = Math.round((this.won ? 3000 : 0) + this.best * 40 + acc * 20 + (this.won ? Math.max(0, (this.length - this.time) * 30) : this.drowsy * 10));
    const detail = t(this.won ? 'ld.won' : 'ld.lost', { s: Math.round(this.time), acc, c: this.best });
    this.ctx.onExit({ mode: 'drone', win: this.won, score, detail });
  }

  render() {
    if (this.finished) return;
    // the lecturer's view: from the front of the room, a slow sway; closer as he nods off
    const d = this.drowsy / 100;
    this.camera.position.set(Math.sin(this.time * 0.25) * 0.4, 2.3 - d * 0.3, 4.6 - d * 1.4);
    this.camera.lookAt(0, 1.0, -1.6);
    // notes
    const laneH = this.lanesEl.clientHeight || 400;
    const lineY = laneH - 70;
    for (const n of this.notes) {
      const dtn = n.t - this.time;
      const visible = dtn < LEAD && (n.kind === 'hold' ? this.time < n.end + 0.2 : dtn > -0.25) && !(n.judged && n.kind !== 'hold' && dtn < -0.08);
      if (!visible) { if (n.el) { n.el.remove(); n.el = null; } continue; }
      if (!n.el) {
        n.el = document.createElement('i');
        n.el.className = `ld-note ${n.kind}`;
        if (n.kind === 'slap') n.el.textContent = '✋';
        if (n.kind === 'gold') n.el.textContent = '☕';
        this.lanesEl.children[n.lane].appendChild(n.el);
      }
      const y = lineY * (1 - dtn / LEAD);
      if (n.kind === 'hold') {
        const yEnd = lineY * (1 - (n.end - this.time) / LEAD);
        n.el.style.top = `${Math.max(-20, yEnd)}px`;
        n.el.style.height = `${Math.max(10, Math.min(lineY, y) - Math.max(-20, yEnd) + 22)}px`;
        n.el.classList.toggle('held', n.holding);
      } else n.el.style.top = `${y}px`;
    }
    for (let i = 0; i < 4; i++) (this.lanesEl.children[i] as HTMLElement).classList.toggle('down', this.input.down(LANES[i]));
    const q = (s: string) => this.hud.querySelector(s) as HTMLElement;
    q('.dz').style.width = `${this.drowsy}%`;
    q('.ld-time').textContent = this.time < 0 ? '' : `${Math.max(0, Math.ceil(this.length - this.time))} ${t('ld.sec')}`;
    q('.ld-combo').textContent = this.combo >= 3 ? `${this.combo} ${t('ld.combo')}` : '';
    q('.ld-zzz').classList.toggle('hidden', this.drowsy < 70 && !this.won);
    if (this.time < 0.8) {
      const c = countdownText(-this.time, t('ld.go'));
      q('.ar-center').innerHTML = c ? `<div class="ar-count">${c}</div>` : '';
    }
  }

  /** for tests */
  get inputs() { return this.input; }
  get state() { return { drowsy: this.drowsy, combo: this.combo, best: this.best, hits: this.hits, total: this.total }; }

  dispose() {
    this.input.dispose();
    this.hud.remove();
    if (this.ctx.stage.override?.scene === this.scene) this.ctx.stage.override = null;
  }
}
