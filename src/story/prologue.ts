import * as THREE from 'three';
import type { Stage } from '../render/stage';
import { buildMap } from '../maps/builder';
import { PLAZA, FOYER } from '../maps/layouts';
import { buildEldenArena, type EldenArena } from '../boss/elden';
import { Person, type Pose } from '../hero/person';
import { makeCharacter, type Rig } from '../assets';
import type { KirillLook } from '../hero/look';
import { Rng } from '../core/rng';
import { sfx, juice, music } from '../core/audio';
import { el } from '../ui/dom';
import { t } from '../i18n';

// Prologue: title cards, Kirill arriving, the cast, the reveal.

type Shot =
  | { kind: 'text'; dur: number; lines: string[] }
  | { kind: 'arrive'; dur: number; caption: string }
  | { kind: 'lost'; dur: number; caption: string }
  | { kind: 'meet'; dur: number; who: string; pose: Pose }
  | { kind: 'reveal'; dur: number };

const CAST: [string, Pose][] = [['nina', 'throw'], ['romchik', 'dance'], ['sonya', 'cheer'], ['masha', 'talk'], ['shady', 'special'], ['grisha', 'stun'], ['artem', 'block'], ['pasha', 'talk']];

export class Prologue {
  private shots: Shot[];
  private i = -1;
  private t = 0;
  private cam = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 420);
  private root = new THREE.Group();
  private ui: HTMLElement;
  private kirill: Person | null = null;
  private rig: Rig | null = null;
  private arena: EldenArena | null = null;
  private done = false;
  private keyFn: (e: KeyboardEvent) => void;

  constructor(private stage: Stage, private look: KirillLook, private onDone: () => void) {
    this.shots = [
      { kind: 'text', dur: 5, lines: [t('pr.date'), t('pr.who')] },
      { kind: 'arrive', dur: 6, caption: t('pr.arrive') },
      { kind: 'lost', dur: 5, caption: t('pr.lost') },
      { kind: 'text', dur: 3.4, lines: [t('pr.ahead')] },
      ...CAST.map(([who, pose]) => ({ kind: 'meet' as const, dur: 2.6, who, pose })),
      { kind: 'reveal', dur: 7 },
    ];
    this.ui = el(`<div class="pro"><div class="pro-bars"><i></i><i></i></div><div class="pro-text"></div><div class="pro-card"></div><div class="pro-cap"></div><div class="pro-skip">${t('pr.skip')}</div></div>`);
    document.getElementById('ui')!.appendChild(this.ui);
    this.ui.addEventListener('click', () => this.finish());
    this.keyFn = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); this.finish(); } };
    addEventListener('keydown', this.keyFn);
    stage.override = { scene: stage.scene, camera: this.cam };
    music.start(0.75, 'boss');
    this.next();
  }

  private clear() {
    this.stage.clearWorld();
    this.root = new THREE.Group();
    this.stage.world.add(this.root);
    this.stage.scene.fog = null;
    this.stage.setLighting('golden');
    this.stage.post.resetLook();
    this.arena = null;
    this.kirill = null;
    this.rig = null;
  }

  private next() {
    this.i++;
    this.t = 0;
    const s = this.shots[this.i];
    if (!s) { this.finish(); return; }
    const q = (sel: string) => this.ui.querySelector(sel) as HTMLElement;
    q('.pro-text').innerHTML = '';
    q('.pro-card').innerHTML = '';
    q('.pro-cap').textContent = '';
    this.ui.classList.toggle('black', s.kind === 'text');
    if (s.kind === 'text') {
      this.clear();
      q('.pro-text').innerHTML = s.lines.map((l, i) => `<div style="animation-delay:${0.3 + i * 1.3}s">${l}</div>`).join('');
      sfx.reveal();
    } else if (s.kind === 'arrive') {
      // the plaza in front of the main building, golden morning; he walks up to the doors
      this.clear();
      this.root.add(buildMap(PLAZA, new Rng(3)).group);
      this.kirill = this.person(0, 12, Math.PI);
      this.caption(s.caption);
    } else if (s.kind === 'lost') {
      this.clear();
      this.root.add(buildMap(FOYER, new Rng(42)).group);
      this.kirill = this.person(-10, 3, 0);
      this.caption(s.caption);
    } else if (s.kind === 'meet' || s.kind === 'reveal') {
      if (!this.arena) {
        this.clear();
        this.stage.sun.intensity = 0; this.stage.hemi.intensity = 0;
        this.arena = buildEldenArena(this.root, this.stage.scene, 'pasha', 5);
        this.stage.post.setLook(0.6, 0.84);
      }
      if (this.rig) { this.root.remove(this.rig.root); this.rig = null; }
      if (this.kirill) { this.root.remove(this.kirill.root); this.kirill = null; }
      if (s.kind === 'meet') {
        this.rig = makeCharacter(s.who);
        this.rig.root.scale.multiplyScalar(1.4);
        this.rig.pose = s.pose;
        this.root.add(this.rig.root);
        q('.pro-card').innerHTML = `<div class="pc-name">${t('boss.name.' + s.who)}</div><div class="pc-title">${t('boss.title.' + s.who)}</div><div class="pc-bio">${t('pr.bio.' + s.who)}</div>`;
        juice.thump();
      } else {
        // a small figure on the stones, facing the Tree
        this.kirill = this.person(0, 4, Math.PI);
        this.kirill.pose = 'idle';
        q('.pro-text').innerHTML = `<div style="animation-delay:1.2s">${t('pr.notHero')}</div><div class="big" style="animation-delay:3.2s">${t('pr.youAre')}</div>`;
        setTimeout(() => juice.sting(4), 3200);
      }
    }
  }

  private person(x: number, z: number, facing: number) {
    const p = new Person(this.look);
    p.root.position.set(x, 0, z);
    p.facing = facing;
    p.root.rotation.y = facing;
    this.root.add(p.root);
    return p;
  }

  private caption(text: string) {
    const c = this.ui.querySelector('.pro-cap') as HTMLElement;
    c.textContent = text;
    c.classList.remove('in'); void c.offsetWidth; c.classList.add('in');
  }

  update(dt: number) {
    if (this.done) return;
    this.t += dt;
    const s = this.shots[this.i];
    if (!s) return;
    const u = Math.min(1, this.t / s.dur);
    this.arena?.update(dt, this.t, s.kind === 'reveal' ? u * 0.8 : 0.2);
    const k = this.kirill;
    if (s.kind === 'arrive' && k) {
      // up the plaza toward the doors
      k.root.position.z = 12 - u * 17;
      k.pose = 'walk';
      k.update(dt, 1);
    } else if (s.kind === 'lost' && k) {
      // looking around the hall: which way is room 312?
      k.pose = u > 0.55 ? 'panic' : 'idle';
      k.faceTowards(Math.sin(this.t * 1.7) * 1.4 + Math.PI * 0.15, dt, 4);
      k.update(dt, 0);
    } else if (s.kind === 'reveal' && k) {
      k.update(dt, 0);
    }
    this.rig?.update(dt, 0);
    if (this.t >= s.dur) this.next();
  }

  render() {
    if (this.done) return;
    const s = this.shots[this.i];
    if (!s) return;
    const u = Math.min(1, this.t / s.dur);
    const cam = this.cam;
    if (Math.abs(cam.aspect - innerWidth / innerHeight) > 1e-3) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
    const k = this.kirill?.root.position;
    if (s.kind === 'arrive' && k) {
      // low behind him, the building rising ahead
      cam.position.set(2.2 - u * 1.2, 1.1 + u * 0.6, k.z + 4.2);
      cam.lookAt(0, 2.6 + u * 1.4, k.z - 8);
    } else if (s.kind === 'lost' && k) {
      // a slow push in on his face
      cam.position.set(k.x + 1.2, 1.5, k.z + 3.6 - u * 1.4);
      cam.lookAt(k.x, 1.2, k.z);
    } else if (s.kind === 'meet') {
      // a low, slow orbit: they loom
      const a = -0.5 + u * 0.7;
      cam.position.set(Math.sin(a) * (4.6 - u), 1.0 + u * 0.4, Math.cos(a) * (4.6 - u));
      cam.lookAt(0, 1.9, 0);
    } else if (s.kind === 'reveal' && k) {
      // from his shoulder, pulling up and away until the Tree fills the sky
      const e = u * u * (3 - 2 * u);
      cam.position.set(1.2 + e * 2, 1.6 + e * 14, k.z + 2.6 + e * 18);
      cam.lookAt(0, 1 + e * 22, k.z - 20 - e * 60);
    } else {
      cam.position.set(0, 2, 10);
      cam.lookAt(0, 2, 0);
    }
  }

  finish() {
    if (this.done) return;
    this.done = true;
    removeEventListener('keydown', this.keyFn);
    this.ui.remove();
    if (this.stage.override?.camera === this.cam) this.stage.override = null;
    this.clear();
    this.stage.clearWorld();
    try { localStorage.setItem('burnout.prologue', 'seen'); } catch { /* storage blocked */ }
    this.onDone();
  }

  dispose() { if (!this.done) { this.done = true; removeEventListener('keydown', this.keyFn); this.ui.remove(); if (this.stage.override?.camera === this.cam) this.stage.override = null; this.stage.clearWorld(); } }
}

/** has this browser seen the prologue? */
export function prologueSeen() {
  try { return localStorage.getItem('burnout.prologue') === 'seen'; } catch { return true; }
}
