import * as THREE from 'three';
import { makeCharacter, type Rig } from '../assets';
import { Person } from '../hero/person';
import { randomKirillLook } from '../hero/look';
import { Rng } from '../core/rng';
import { sfx } from '../core/audio';
import { part, box, cyl, toon, at } from '../render/toon';
import { staticBatch } from '../maps/builder';
import { PROPS } from '../maps/props';
import * as T from '../render/textures';
import { t } from '../i18n';
import balance from '../data/balance.json';
import { Input, Lights, hudLayer, perspective, fitAspect, countdownText, clamp, type ArcadeCtx, type ArcadeMode } from './common';

// PE norm race: Kirill must run under the norm, Nina (you) sprints, whistles and taunts to stop
// him. Side-on dolly camera with slow-mo cuts on her skills.

const R_ = balance.arcade.race;
const LEN = R_.length;
const NINA_Z = 1.1, KIRILL_Z = -1.1; // Nina in the near lane, Kirill just behind her
const GRAVITY = 30;

interface Runner {
  rig: Rig;
  nina: boolean;
  x: number; y: number; vy: number;
  base: number; v: number;
  sprint: number; stun: number; stumble: number; fluster: number; anger: number; talk: number;
  done: boolean; time: number;
}

/** a cinematic shot blended over the side dolly */
interface Shot { kind: 'whistle' | 'taunt' | 'sprint' | 'trip' | 'finish'; t: number; dur: number }

interface Hurdle { x: number; hitN: boolean; hitK: boolean; kDecided: boolean; meshes: THREE.Object3D[] }

export class PERace implements ArcadeMode {
  scene = new THREE.Scene();
  camera = perspective(40);
  private input: Input;
  private lights: Lights;
  private rng = new Rng(Math.floor(Math.random() * 1e9));
  private nina: Runner;
  private kirill: Runner;
  private hurdles: Hurdle[] = [];
  private time = -3.2;
  private stamina = 100;
  private cds = { whistle: 0, taunt: 0 };
  private taunts: number[] = [];
  private kSprintT = 8;
  private hud: HTMLElement;
  private finished = false;
  private camX = 0;
  private camD = 12;
  private shot: Shot | null = null;
  private shotW = 0;
  private slow = 0;
  private realT = 0;
  private hurdleHits = 0;
  private outro = 0;
  private norm: number;
  private kTime: number | null = null;
  private ninaFirst = false;
  /** tests: play Nina's skills automatically */
  autopilot = false;

  constructor(private ctx: ArcadeCtx) {
    this.input = new Input(ctx.stage.renderer.domElement);
    this.scene.background = new THREE.Color(0x9cc7ea);
    this.scene.fog = new THREE.Fog(0xcfe0ee, 60, 170);
    this.lights = new Lights(this.scene, new THREE.Vector3(-10, 26, 20), 22);
    this.buildWorld();
    this.nina = this.runner(makeCharacter('nina'), R_.ninaSpeed, true);
    this.kirill = this.runner(new Person(ctx.story?.look ?? randomKirillLook(this.rng)), R_.kirillSpeed * (1 + 0.015 * ((ctx.story?.level ?? 1) - 1)) * (0.93 + 0.07 * (ctx.story?.hp ?? 1)), false);
    this.norm = R_.normSec;
    ctx.stage.override = { scene: this.scene, camera: this.camera };

    this.hud = hudLayer(`
      <div class="rc-top">
        <div class="rc-track"><b class="rc-pace"></b><i class="rc-n"></i><i class="rc-k"></i><span class="rc-finish">🏁</span></div>
        <div class="rc-gap"></div>
      </div>
      <div class="rc-norm-t"></div>
      <div class="rc-bars"><i></i><i></i></div>
      <div class="ar-center"></div>
      <div class="rc-bub bub-n hidden"></div>
      <div class="rc-bub bub-k hidden"></div>
      <div class="ar-bottom">
        <div class="ar-bar"><span>${t('race.stamina')}</span><div class="bar"><div class="fill stam"></div></div></div>
        <div class="ar-skill sk-jump" data-key=" ">⤒ <b>␣</b> ${t('race.jump')}</div>
        <div class="ar-skill sk-sprint" data-key="q">⚡ <b>Q</b> ${t('race.sprint')} <i class="cd"></i></div>
        <div class="ar-skill sk-whistle" data-key="w">🔔 <b>W</b> ${t('race.whistle')} <i class="cd"></i></div>
        <div class="ar-skill sk-taunt" data-key="e">😜 <b>E</b> ${t('race.taunt')} <i class="cd"></i></div>
        <div class="ar-keys">${t('race.keys')}</div>
      </div>
      <div class="rc-anger hidden">${t('race.angryBadge')}</div>`);
    this.input.buttons(this.hud);
  }

  private runner(rig: Rig, base: number, nina: boolean): Runner {
    this.scene.add(rig.root);
    rig.root.rotation.y = Math.PI / 2;
    return { rig, nina, x: 0, y: 0, vy: 0, base, v: 0, sprint: 0, stun: 0, stumble: 0, fluster: 0, anger: 0, talk: 0, done: false, time: 0 };
  }

  // ---------------------------------------------------------------- world: the long straight

  private buildWorld() {
    const statics = new THREE.Group();
    const span = LEN + 90;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(span + 60, 120), toon(0xffffff, { map: T.grassFloor(100, 60) }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(LEN / 2, 0, -20);
    grass.receiveShadow = true;
    this.scene.add(grass);
    const trackTex = laneTex();
    trackTex.repeat.set(span / 8, 1);
    const track = new THREE.Mesh(new THREE.PlaneGeometry(span, 7), toon(0xffffff, { map: trackTex }));
    track.rotation.x = -Math.PI / 2;
    track.position.set(LEN / 2, 0.02, 0);
    track.receiveShadow = true;
    this.scene.add(track);
    for (const x of [0, LEN]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 7), toon(0xffffff, { map: checker() }));
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.03, 0);
      this.scene.add(line);
    }
    // finish arch
    const arch = new THREE.Group();
    arch.add(at(part(box(0.3, 4.4, 0.3), 0x2b3f6b), 0, 2.2, -3.8), at(part(box(0.3, 4.4, 0.3), 0x2b3f6b), 0, 2.2, 3.8));
    arch.add(at(part(box(0.4, 0.9, 7.9), 0xffffff, { map: T.receiptTex(t('race.finish'), '#2b3f6b', '#ffffff') }), 0, 4.4, 0));
    arch.position.x = LEN;
    statics.add(arch);
    // distance boards every 50 m
    for (let x = 50; x < LEN; x += 50) {
      statics.add(at(part(box(0.1, 1.2, 0.1), 0x3b3f47), x, 0.6, -4.3));
      statics.add(at(part(box(1.6, 0.8, 0.08), 0xffffff, { map: T.receiptTex(`${x} m`, '#f4efe6', '#2b3f6b') }), x, 1.5, -4.3));
    }
    // behind the runners: a railing, the stands with a crowd, floodlights, trees and the gym
    for (let x = -30; x < span; x += 2.5) statics.add(at(part(box(0.1, 1.3, 0.1), 0x2b3f6b, { outline: false }), x, 0.65, -4.7));
    statics.add(at(part(box(span + 40, 0.07, 0.07), 0x2b3f6b, { outline: false }), LEN / 2, 1.25, -4.7));
    const crowd = [0xc0392b, 0x2b3f6b, 0xe8c547, 0x23c4b8, 0xf2efe6, 0x6a4a8a, 0x3a6a4a];
    for (let x = -20; x < span; x += 40) {
      for (let r = 0; r < 5; r++) {
        statics.add(at(part(box(34, 0.6, 1.2), 0x8a8f99), x + 17, 0.3 + r * 0.6, -9 - r * 1.2));
        for (let sx = 0.4; sx < 34; sx += 0.9) {
          if (this.rng.chance(0.45)) continue;
          statics.add(at(part(box(0.45, 0.6, 0.35), this.rng.pick(crowd), { outline: false }), x + sx, 0.95 + r * 0.6, -9 - r * 1.2));
          statics.add(at(part(new THREE.SphereGeometry(0.2, 8, 6), 0xf0c6a4, { outline: false }), x + sx, 1.45 + r * 0.6, -9 - r * 1.2));
        }
      }
    }
    for (let x = -10; x < span; x += 70) {
      statics.add(at(part(cyl(0.25, 0.35, 15, 8), 0x8a8f99), x, 7.5, -17));
      statics.add(at(part(box(3, 1.4, 0.6), 0x3b3f47), x, 15, -17));
      statics.add(at(part(box(2.6, 1.0, 0.1), 0xfff8e0, { emissive: 0xfff0c0, emissiveIntensity: 0.9, outline: false }), x, 15, -16.68));
    }
    for (let x = -30; x < span; x += this.rng.range(5, 9)) {
      const tree = PROPS[this.rng.chance(0.4) ? 'fir' : 'tree'].build(this.rng);
      tree.position.set(x, 0, -21 - this.rng.range(0, 6));
      statics.add(tree);
    }
    this.scene.add(staticBatch(statics));
    for (let x = 40; x < span; x += 150) {
      const gym = new THREE.Mesh(box(60, 12, 14), [toon(0xd6c9b0), toon(0xd6c9b0), toon(0x8a8f99), toon(0xd6c9b0), toon(0xffffff, { map: T.facadeTex(30, 4) }), toon(0xd6c9b0)] as unknown as THREE.Material);
      gym.position.set(x, 6, -40);
      this.scene.add(gym);
    }
    // in front of the camera: a low white fence sliding past (parallax)
    const near = new THREE.Group();
    for (let x = -30; x < span; x += 3) near.add(at(part(box(0.12, 0.9, 0.12), 0xf2efe6, { outline: false }), x, 0.45, 5));
    near.add(at(part(box(span + 40, 0.08, 0.08), 0xf2efe6, { outline: false }), LEN / 2, 0.8, 5));
    this.scene.add(staticBatch(near));
    // hurdles across both lanes
    for (let x = R_.firstHurdle; x < LEN - 15; x += this.rng.range(R_.hurdleGap[0], R_.hurdleGap[1])) {
      const meshes = [NINA_Z, KIRILL_Z].map((z) => {
        const h = new THREE.Group();
        h.add(at(part(box(0.08, 0.85, 0.08), 0xf2f0ea), 0, 0.42, -0.8), at(part(box(0.08, 0.85, 0.08), 0xf2f0ea), 0, 0.42, 0.8));
        h.add(at(part(box(0.12, 0.2, 1.8), 0xf2f0ea), 0, 0.85, 0), at(part(box(0.13, 0.2, 0.5), 0x1d1d22, { outline: false }), 0, 0.85, 0));
        h.position.set(x, 0, z);
        this.scene.add(h);
        return h;
      });
      this.hurdles.push({ x, hitN: false, hitK: false, kDecided: false, meshes });
    }
  }

  // ---------------------------------------------------------------- tick

  update(dtReal: number) {
    if (this.finished) return;
    fitAspect(this.camera);
    this.realT += dtReal;
    if (this.outro > 0) {
      // a short victory lap for the camera before the results
      this.outro -= dtReal;
      if (this.shot) this.shot.t += dtReal;
      for (const r of [this.nina, this.kirill]) this.step(r, dtReal * 0.4);
      if (this.outro <= 0) this.exit();
      this.input.endFrame();
      return;
    }
    if (this.shot) { this.shot.t += dtReal; if (this.shot.t >= this.shot.dur) this.shot = null; }
    this.slow = Math.max(0, this.slow - dtReal);
    const dt = dtReal * (this.slow > 0 ? 0.35 : 1);
    const before = this.time;
    this.time += dt;
    if (before < 0 && this.time >= 0) sfx.whistle();
    else if (Math.floor(before) !== Math.floor(this.time) && this.time < 0) sfx.click();
    for (const k of ['whistle', 'taunt'] as const) this.cds[k] = Math.max(0, this.cds[k] - dt);
    if (this.time >= 0) {
      this.skills(dt);
      this.kirillAI(dt);
      this.step(this.nina, dt);
      this.step(this.kirill, dt);
      if (this.kirill.done || this.time >= this.norm) this.finish();
    } else {
      for (const r of [this.nina, this.kirill]) { r.rig.pose = 'idle'; r.rig.update(dt, 0); r.rig.root.position.set(r.x, 0, r.nina ? NINA_Z : KIRILL_Z); }
    }
    this.input.endFrame();
  }

  private skills(dt: number) {
    const k = this.input, n = this.nina, kr = this.kirill;
    this.stamina = clamp(this.stamina + R_.staminaRegen * dt, 0, 100);
    let sprint = k.hit('q', 'shift', '1');
    let whistle = k.hit('w', '2');
    let taunt = k.hit('e', '3');
    let jump = k.hit(' ', 'arrowup', 'mouse0');
    if (this.autopilot) {
      const next = this.hurdles.find((h) => h.x > n.x);
      jump = !!next && next.x - n.x < n.v * 0.3;
      sprint = this.stamina >= 90;
      whistle = true;
      taunt = this.taunts.length < 2 && Math.random() < 0.05;
    }
    if (sprint && this.stamina >= R_.sprintCost && n.stun <= 0 && n.sprint <= 0) {
      this.stamina -= R_.sprintCost;
      n.sprint = R_.sprintSec;
      sfx.levelUp();
      this.say(n, t('race.sprintLine'));
      this.cut('sprint', 1.3);
    }
    if (whistle && this.cds.whistle <= 0) {
      this.cds.whistle = R_.whistleCd;
      kr.stun = R_.whistleStun;
      sfx.whistle();
      this.say(n, t('race.whistleLine'));
      this.say(kr, '!?');
      this.cut('whistle', 1.1);
    }
    if (taunt && this.cds.taunt <= 0) {
      this.cds.taunt = R_.tauntCd;
      this.taunts = this.taunts.filter((x) => this.time - x < R_.angerWindow);
      this.taunts.push(this.time);
      this.say(n, t('race.taunt' + this.rng.int(0, 3)));
      n.talk = 0.6;
      this.cut('taunt', 1.2);
      if (this.taunts.length >= 3) {
        // overdid it: he gets angry and faster
        kr.anger = R_.angerSec;
        kr.fluster = 0;
        this.taunts = [];
        this.say(kr, t('race.angry'));
        this.flash(t('race.angryFlash'));
        sfx.debt();
      } else {
        kr.fluster = R_.flusterSec;
        this.say(kr, t('race.flustered'));
        sfx.click();
      }
    }
    if (jump && n.y <= 0.01 && n.stun <= 0) { n.vy = R_.jumpV; sfx.click(); }
  }

  /** Kirill runs his own race: jumps the hurdles (mostly) and now and then sprints too. */
  private kirillAI(dt: number) {
    const kr = this.kirill;
    const next = this.hurdles.find((h) => h.x > kr.x);
    if (next && !next.kDecided && next.x - kr.x < Math.max(0.8, kr.v * 0.3)) {
      next.kDecided = true;
      if (kr.stun <= 0 && kr.y <= 0.01 && !this.rng.chance(R_.kirillTrip)) kr.vy = R_.jumpV;
    }
    this.kSprintT -= dt;
    if (this.kSprintT <= 0 && kr.stun <= 0) {
      this.kSprintT = this.rng.range(7, 12);
      kr.sprint = 1.2;
      this.say(kr, t('race.kirillSprint'));
    }
  }

  private step(r: Runner, dt: number) {
    const z = r.nina ? NINA_Z : KIRILL_Z;
    if (r.done) { r.rig.pose = 'cheer'; r.rig.update(dt, 0); return; }
    for (const f of ['sprint', 'stun', 'stumble', 'fluster', 'anger', 'talk'] as const) r[f] = Math.max(0, r[f] - dt);
    let v = r.base;
    if (!r.nina) v *= 1 + Math.min(0.08, this.time * 0.002); // he warms up
    if (r.sprint > 0) v *= r.nina ? 2 : 1.45; // Nina's sprint: twice as fast
    if (r.fluster > 0) v *= 1 - R_.flusterSlow;
    if (r.anger > 0) v *= 1 + R_.angerBoost;
    if (r.stumble > 0) v *= 0.3;
    if (r.stun > 0) v = 0;
    r.v += (v - r.v) * Math.min(1, dt * 8);
    r.x += r.v * dt;
    r.vy -= GRAVITY * dt;
    r.y = Math.max(0, r.y + r.vy * dt);
    if (r.y === 0) r.vy = Math.max(0, r.vy);
    // hurdles: clip one if you're not high enough
    for (const h of this.hurdles) {
      if ((r.nina ? h.hitN : h.hitK) || Math.abs(r.x - h.x) > 0.35) continue;
      if (r.nina) h.hitN = true; else h.hitK = true;
      if (r.y < 0.7) {
        r.stumble = R_.stumbleSec;
        h.meshes[r.nina ? 0 : 1].rotation.z = -1.3;
        if (r.nina) { this.flash(t('race.hurdle')); sfx.hurt(); this.hurdleHits++; } else { this.say(r, t('race.ouch')); this.cut('trip', 1.0); }
      }
    }
    if (r.x >= LEN) { r.done = true; r.time = this.time; if (r.nina) sfx.levelUp(); }
    r.rig.pose = r.stun > 0 || r.stumble > 0 ? 'stun' : r.talk > 0 ? 'talk' : r.y > 0.05 ? 'cheer' : 'run';
    r.rig.update(dt, r.v / 2.6);
    r.rig.root.position.set(r.x, r.y, z);
    r.rig.root.rotation.y = Math.PI / 2;
  }

  private say(r: Runner, text: string) {
    const b = this.hud.querySelector(r.nina ? '.bub-n' : '.bub-k') as HTMLElement;
    b.textContent = text;
    b.dataset.t = String(this.time);
    b.classList.remove('hidden');
  }

  private flash(text: string) {
    const c = this.hud.querySelector('.ar-center') as HTMLElement;
    c.innerHTML = `<div class="ar-flash">${text}</div>`;
    setTimeout(() => { if (c.firstElementChild?.textContent === text) c.innerHTML = ''; }, 1100);
  }

  /** cut to a cinematic shot (with slow motion) unless Nina is about to reach a hurdle */
  private cut(kind: Shot['kind'], dur: number) {
    const n = this.nina;
    const next = this.hurdles.find((h) => h.x > n.x && !h.hitN);
    if (next && next.x - n.x < Math.max(4, n.v * 1.2)) return;
    this.shot = { kind, t: 0, dur };
    this.slow = dur * 0.55;
  }

  private finish() {
    if (this.outro > 0) return;
    const n = this.nina, k = this.kirill;
    this.kTime = k.done ? k.time : null;
    this.ninaFirst = n.done ? !k.done || n.time <= k.time : n.x > k.x;
    this.outro = 2.2;
    this.shot = { kind: 'finish', t: 0, dur: 2.2 };
    this.slow = 0;
    const failed = this.kTime === null || this.kTime > this.norm;
    this.flash(failed ? t('race.normFailed') : t('race.normPassed'));
    if (failed) sfx.levelUp(); else sfx.debt();
  }

  private exit() {
    this.finished = true;
    const n = this.nina, k = this.kirill;
    const failed = this.kTime === null || this.kTime > this.norm;
    const over = this.kTime === null ? (LEN - k.x) / Math.max(1, k.base) : this.kTime - this.norm;
    const stars = (failed ? 1 : 0) + (this.ninaFirst ? 1 : 0) + (this.hurdleHits === 0 ? 1 : 0);
    const score = Math.max(0, Math.round((failed ? 2500 : 0) + (this.ninaFirst ? 1500 : 0) + (this.hurdleHits === 0 ? 600 : 0) + Math.max(0, over) * 120 + Math.max(0, n.x - k.x) * 10));
    const detail = (failed ? t('race.failedBy', { s: Math.max(0, over).toFixed(1) }) : t('race.passedBy', { s: (-over).toFixed(1) }))
      + ' ' + t(this.ninaFirst ? 'race.ninaFirst' : 'race.ninaSecond') + ' ' + '★'.repeat(stars) + '☆'.repeat(3 - stars);
    this.ctx.onExit({ mode: 'race', win: failed, score, detail });
  }

  render() {
    if (this.finished) return;
    const n = this.nina, k = this.kirill;
    this.placeCamera();
    // HUD
    const q = (s: string) => this.hud.querySelector(s) as HTMLElement;
    q('.rc-n').style.left = `${clamp(n.x / LEN, 0, 1) * 100}%`;
    q('.rc-k').style.left = `${clamp(k.x / LEN, 0, 1) * 100}%`;
    const gap = n.x - k.x;
    const g = q('.rc-gap');
    g.textContent = gap >= 0 ? t('race.ahead', { m: gap.toFixed(1) }) : t('race.behind', { m: (-gap).toFixed(1) });
    g.className = 'rc-gap ' + (gap >= 0 ? 'good' : 'bad');
    q('.stam').style.width = `${this.stamina}%`;
    const cd = (sel: string, v: number, ready = true) => {
      q(sel).classList.toggle('cooling', v > 0 || !ready);
      (q(sel).querySelector('.cd') as HTMLElement).textContent = v > 0 ? v.toFixed(0) : '';
    };
    cd('.sk-sprint', 0, this.stamina >= R_.sprintCost && n.sprint <= 0);
    cd('.sk-whistle', this.cds.whistle);
    cd('.sk-taunt', this.cds.taunt);
    q('.rc-anger').classList.toggle('hidden', k.anger <= 0);
    // where Kirill must be to make the norm, and his projected time
    q('.rc-pace').style.left = `${clamp(Math.max(0, this.time) / this.norm, 0, 1) * 100}%`;
    const pace = Math.max(0, this.time) + (LEN - k.x) / Math.max(0.1, k.base * 1.06);
    const nt = q('.rc-norm-t');
    nt.innerHTML = t('race.norm', { p: pace.toFixed(1), n: this.norm.toFixed(0) });
    nt.className = 'rc-norm-t ' + (pace > this.norm ? 'good' : 'bad');
    // speech bubbles over their heads, gone after 1.6 s
    for (const r of [n, k]) {
      const b = q(r.nina ? '.bub-n' : '.bub-k');
      if (b.classList.contains('hidden')) continue;
      if (this.time - +(b.dataset.t ?? 0) > 1.6) { b.classList.add('hidden'); continue; }
      const v = new THREE.Vector3(r.x, 2.5 + r.y, r.nina ? NINA_Z : KIRILL_Z).project(this.camera);
      b.style.left = `${((v.x * 0.5 + 0.5) * innerWidth).toFixed(0)}px`;
      b.style.top = `${((-v.y * 0.5 + 0.5) * innerHeight).toFixed(0)}px`;
    }
    if (this.time < 0.8) {
      const c = countdownText(-this.time, t('race.go'));
      q('.ar-center').innerHTML = c ? `<div class="ar-count">${c}</div>` : '';
    }
  }

  /** Side-on dolly that fits both runners, blended with the current cinematic shot. */
  private placeCamera() {
    const n = this.nina, k = this.kirill;
    const cam = this.camera;
    const lo = Math.min(n.x, k.x), hi = Math.max(n.x, k.x);
    // the horizontal half-width the shot needs, then the distance that fits it in the lens
    const half = (hi - lo) / 2 + 3.2;
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(40) / 2) * cam.aspect);
    const wantD = clamp(half / Math.tan(hfov / 2), 10, 70);
    this.camD += (wantD - this.camD) * (wantD > this.camD ? 0.2 : 0.05);
    const mid = (lo + hi) / 2 + 1.2;
    this.camX += (mid - this.camX) * 0.2;
    const sway = Math.sin(this.realT * 0.35) * 0.4;
    const base = new THREE.Vector3(this.camX + sway, 1.6 + this.camD * 0.07, this.camD);
    const baseLook = new THREE.Vector3(this.camX, 1.1, 0);
    // the cinematic shot, eased in and out over the dolly
    const s = this.shot;
    const ease = (x: number) => x * x * (3 - 2 * x);
    const wTarget = s ? ease(clamp(Math.min(s.t / 0.25, (s.dur - s.t) / 0.3), 0, 1)) : 0;
    this.shotW += (wTarget - this.shotW) * 0.35;
    let pos = base, look = baseLook, fov = 40;
    if (s && this.shotW > 0.01) {
      const sp = new THREE.Vector3(), sl = new THREE.Vector3();
      const u = clamp(s.t / s.dur, 0, 1);
      let f = 40;
      if (s.kind === 'whistle') {
        // low, in front of Nina: she blows the whistle into the lens
        sp.set(n.x + 3.2, 1.0 + n.y, NINA_Z + 2.4); sl.set(n.x, 1.7 + n.y, NINA_Z); f = 34;
      } else if (s.kind === 'sprint') {
        // ground-level tracking shot from ahead as she blasts past
        sp.set(n.x + 6 - u * 7, 0.5, NINA_Z + 1.6 + u * 1.2); sl.set(n.x, 1.2 + n.y, NINA_Z); f = 52;
      } else if (s.kind === 'taunt') {
        // over Nina's shoulder at Kirill
        const dir = Math.sign(k.x - n.x) || -1;
        sp.set(n.x - dir * 2.2, 2.0, NINA_Z + 1.5); sl.set(k.x, 1.4 + k.y, KIRILL_Z); f = 38;
      } else if (s.kind === 'trip') {
        sp.set(k.x + 3, 0.8, KIRILL_Z - 2.6); sl.set(k.x, 0.9 + k.y, KIRILL_Z); f = 36;
      } else {
        // finish: a slow orbit around Nina
        const a = -0.6 + u * 1.6;
        sp.set(n.x + Math.sin(a) * 5, 1.6, NINA_Z + Math.cos(a) * 5); sl.set(n.x, 1.3, NINA_Z); f = 36;
      }
      pos = base.clone().lerp(sp, this.shotW);
      look = baseLook.clone().lerp(sl, this.shotW);
      fov = 40 + (f - 40) * this.shotW;
    }
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.position.copy(pos);
    cam.lookAt(look);
    this.lights.follow(this.camX, 0);
    this.hud.querySelector('.rc-bars')?.classList.toggle('on', this.shotW > 0.3);
  }

  /** for tests */
  get inputs() { return this.input; }
  get state() { return { nina: this.nina, kirill: this.kirill, stamina: this.stamina }; }

  dispose() {
    this.input.dispose();
    this.hud.remove();
    if (this.ctx.stage.override?.scene === this.scene) this.ctx.stage.override = null;
  }
}

// ---------------------------------------------------------------- textures

function laneTex() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c8452f';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 300; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(120,30,20,0.25)' : 'rgba(255,140,110,0.18)'; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  g.fillStyle = '#f4efe6';
  for (const y of [3, 64, 125]) g.fillRect(0, y - 1.5, 128, 3);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.anisotropy = 8;
  return tx;
}

function checker() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 128;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 8, y * 8, 8, 8); }
  const tx = new THREE.CanvasTexture(c);
  tx.magFilter = THREE.NearestFilter;
  return tx;
}
