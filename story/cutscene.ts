import * as THREE from 'three';
import type { Stage } from '../render/stage';
import { buildMap } from '../maps/builder';
import { LAYOUTS } from '../maps/layouts';
import { Person } from '../hero/person';
import { makeCharacter, type Rig } from '../assets';
import type { KirillLook } from '../hero/look';
import { Rng } from '../core/rng';
import { sfx, juice } from '../core/audio';
import { voice } from '../core/voice';
import { el } from '../ui/dom';
import { t } from '../i18n';
import type { Chapter } from './campaign';

// Chapter cutscene: wide shot with the title, dialogue over the shoulder, Kirill's reaction.

/** a quick cut between two kinds of play (horde → boss, race, duel…): its own title, shorter shots */
export interface CutOpts { kicker: string; title: string; place: string; quick: boolean }

export class Cutscene {
  private cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 300);
  private root = new THREE.Group();
  private ui: HTMLElement;
  private kirill: Person;
  private cast: Rig[] = [];
  private t = 0;
  private phase: 'wide' | 'talk' | 'reply' = 'wide';
  private line = -1;
  private lineT = 0;
  private done = false;
  private keyFn: (e: KeyboardEvent) => void;
  private start: { x: number; z: number };
  private dir: THREE.Vector2;
  private life: { update(dt: number): void };

  constructor(private stage: Stage, private ch: Chapter, n: number, look: KirillLook, private onDone: () => void, private opts?: CutOpts) {
    stage.clearWorld();
    stage.world.add(this.root);
    const layout = LAYOUTS[ch.map];
    const map = buildMap(layout, new Rng(n * 13 + 5));
    this.life = map.life;
    this.root.add(map.group);
    stage.setLighting(layout.mood);
    stage.scene.background = new THREE.Color(layout.outdoor ? 0x9cc7ea : 0x1d1a22);
    stage.post.setLook(0.4, 0.9);
    this.start = layout.start;
    // the people he meets stand a few steps ahead of him, toward the middle of the room
    const toward = new THREE.Vector2(-this.start.x, -this.start.z);
    this.dir = toward.lengthSq() > 1 ? toward.normalize() : new THREE.Vector2(0, -1);
    const facing = Math.atan2(this.dir.x, this.dir.y);
    this.kirill = new Person(look);
    this.kirill.root.position.set(this.start.x, 0, this.start.z);
    this.kirill.facing = facing;
    this.kirill.root.rotation.y = facing;
    this.root.add(this.kirill.root);
    const perp = new THREE.Vector2(-this.dir.y, this.dir.x);
    ch.cast.forEach((who, i) => {
      const r = makeCharacter(who);
      const off = (i - (ch.cast.length - 1) / 2) * 1.6;
      const x = this.start.x + this.dir.x * 3.6 + perp.x * off, z = this.start.z + this.dir.y * 3.6 + perp.y * off;
      r.root.position.set(x, 0, z);
      r.faceTowards(facing + Math.PI, 1, 100);
      r.pose = 'idle';
      this.root.add(r.root);
      this.cast.push(r);
    });
    this.ui = el(`<div class="pro cut"><div class="pro-bars"><i></i><i></i></div>
      <div class="cut-title${opts?.quick ? ' quick' : ''}"><small>${opts?.kicker ?? t('ch.chapter', { n })}</small><b>${opts?.title ?? t('ch.title.' + ch.id)}</b><i>${opts?.place ?? t('ch.place.' + ch.id)}</i></div>
      <div class="cut-line"><b></b><span></span></div>
      <div class="pro-skip">${t('pr.skip')}</div></div>`);
    document.getElementById('ui')!.appendChild(this.ui);
    this.ui.addEventListener('click', () => this.advance());
    this.keyFn = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.advance(); } else if (e.key === 'Escape') this.finish(); };
    addEventListener('keydown', this.keyFn);
    stage.override = { scene: stage.scene, camera: this.cam };
    juice.sting(2);
  }

  /** a click: the next line (or skip the wide shot) */
  private advance() {
    if (this.phase === 'wide') { this.phase = 'talk'; this.t = 0; this.nextLine(); return; }
    this.nextLine();
  }

  private nextLine() {
    this.line++;
    this.lineT = 0;
    const box = this.ui.querySelector('.cut-line') as HTMLElement;
    const title = this.ui.querySelector('.cut-title') as HTMLElement;
    title.classList.add('out');
    if (this.line < this.ch.lines.length) {
      const [who, key] = this.ch.lines[this.line];
      this.say(t('char.' + who), t(key), false);
      voice.play(who + '_line');
      this.cast.forEach((r, i) => { r.pose = this.ch.cast[i] === who ? 'talk' : 'idle'; });
    } else if (this.line === this.ch.lines.length) {
      this.phase = 'reply';
      this.t = 0;
      this.say(t('hud.kirill'), t(this.ch.reply), true);
      this.cast.forEach((r) => { r.pose = 'idle'; });
      this.kirill.pose = 'talk';
    } else {
      box.classList.remove('in');
      this.finish();
    }
  }

  private say(name: string, text: string, hero: boolean) {
    const box = this.ui.querySelector('.cut-line') as HTMLElement;
    (box.querySelector('b') as HTMLElement).textContent = name;
    (box.querySelector('span') as HTMLElement).textContent = text;
    box.classList.toggle('hero', hero);
    box.classList.remove('in'); void box.offsetWidth; box.classList.add('in');
    sfx.click();
  }

  update(dt: number) {
    if (this.done) return;
    this.t += dt;
    this.lineT += dt;
    const q = this.opts?.quick;
    if (this.phase === 'wide' && this.t > (q ? 2.2 : 3.6)) this.advance();
    else if (this.phase !== 'wide' && this.lineT > (q ? 2.4 : 3.4)) this.nextLine();
    this.kirill.update(dt, 0);
    for (const r of this.cast) r.update(dt, 0);
    this.life.update(dt);
  }

  render() {
    if (this.done) return;
    const cam = this.cam;
    if (Math.abs(cam.aspect - innerWidth / innerHeight) > 1e-3) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
    const s = this.start, d = this.dir;
    const mx = s.x + d.x * 3.6, mz = s.z + d.y * 3.6;
    if (this.phase === 'wide') {
      // high and slow over the room
      const a = this.t * 0.12 + Math.atan2(s.x, s.z);
      cam.position.set(Math.sin(a) * 16, 11 - this.t * 0.8, Math.cos(a) * 16);
      cam.lookAt(mx * 0.5, 1, mz * 0.5);
    } else if (this.phase === 'talk') {
      // over Kirill's shoulder at whoever is talking
      const u = Math.min(1, this.t / 8);
      cam.position.set(s.x - d.x * 2.3 + d.y * 0.9, 1.75, s.z - d.y * 2.3 - d.x * 0.9);
      cam.lookAt(mx, 1.45 + u * 0.05, mz);
    } else {
      // Kirill's face
      const u = Math.min(1, this.t / 3);
      cam.position.set(s.x + d.x * (2.2 - u * 0.5) - d.y * 0.4, 1.55, s.z + d.y * (2.2 - u * 0.5) + d.x * 0.4);
      cam.lookAt(s.x, 1.35, s.z);
    }
  }

  finish() {
    if (this.done) return;
    this.done = true;
    removeEventListener('keydown', this.keyFn);
    this.ui.remove();
    if (this.stage.override?.camera === this.cam) this.stage.override = null;
    this.stage.clearWorld();
    this.stage.post.resetLook();
    this.onDone();
  }

  dispose() {
    if (this.done) return;
    this.done = true;
    removeEventListener('keydown', this.keyFn);
    this.ui.remove();
    if (this.stage.override?.camera === this.cam) this.stage.override = null;
    this.stage.clearWorld();
  }
}
