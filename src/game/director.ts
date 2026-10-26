import * as THREE from 'three';
import { drawIcon, iconFor } from '../ui/icons';
import type { WeekRun } from './week';
import { Person } from '../hero/person';
import { randomKirillLook } from '../hero/look';
import { Rng } from '../core/rng';
import { juice, ambience } from '../core/audio';
import { voice } from '../core/voice';
import { t } from '../i18n';
import balance from '../data/balance.json';

// Week director: random events every ~18 s, final countdown, Kirill's mood and taunts, walkers.

const D = balance.director;

type EventId = 'quiz' | 'mom' | 'coffee' | 'stipend' | 'wifi' | 'paperwork' | 'bell';
interface Ev { id: EventId; icon: string; good: boolean; dur: number }
const EVENTS: Ev[] = [
  { id: 'quiz', icon: '📝', good: true, dur: 10 },
  { id: 'mom', icon: '📞', good: true, dur: 0 },
  { id: 'coffee', icon: '☕', good: true, dur: 9 },
  { id: 'stipend', icon: '💸', good: false, dur: 8 },
  { id: 'wifi', icon: '📶', good: true, dur: 9 },
  { id: 'paperwork', icon: '🗂️', good: true, dur: 0 },
  { id: 'bell', icon: '🔔', good: false, dur: 7 },
];

const MOODS = ['😎', '🙂', '😬', '😰', '😭'];

/** an emoji drawn into a sprite (cached per emoji) */
const emojiTex = new Map<string, THREE.Texture>();
function emojiSprite(e: string) {
  let tex = emojiTex.get(e);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d')!;
    // a dark medallion with a gold rim, and his mood drawn in it
    g.fillStyle = 'rgba(16,10,14,0.82)';
    g.beginPath(); g.arc(48, 48, 44, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d8b86a'; g.lineWidth = 4; g.stroke();
    drawIcon(g, iconFor(e) ?? 'smile', 48, 48, 64, '#f2e2b0', 2);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    emojiTex.set(e, tex);
  }
  return tex;
}

interface Walker { p: Person; tx: number; tz: number; wait: number }

export class Director {
  private next: number;
  private active: { ev: Ev; t: number } | null = null;
  private banner: HTMLElement;
  private count: HTMLElement;
  private lastCount = -1;
  private mood = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
  private moodNow = '';
  private moodHold = 0;
  private tauntT = 9;
  private kills: number[] = [];
  private walkers: Walker[] = [];
  private rng: Rng;
  /** multipliers the week reads each tick */
  chaosMul = 1;
  kirillSpeed = 1;
  kirillFire = 1;
  hordeSpeed = 1;
  /** how far into the end-of-week countdown (0..1) */
  final = 0;

  constructor(private w: WeekRun) {
    this.rng = w.rng.fork('director');
    this.next = D.firstEvent + this.rng.range(0, 4);
    this.banner = document.createElement('div');
    this.banner.className = 'dr-banner hidden';
    this.count = document.createElement('div');
    this.count.className = 'dr-count hidden';
    w.hud.root.append(this.banner, this.count);
    this.mood.scale.set(0.9, 0.9, 1);
    this.mood.renderOrder = 10;
    w.stage.world.add(this.mood);
    this.setMood('😎');
    // a few students who just live here (not in exams, the dean's office or at night)
    const busy = ['foyer', 'plaza', 'b2hall', 'canteen', 'parking', 'gym', 'assembly'].includes(w.def.location);
    if (busy) for (let i = 0; i < D.walkers; i++) this.addWalker(i);
    ambience.start(w.def.location);
  }

  private addWalker(i: number) {
    const look = randomKirillLook(this.rng.fork('walker' + i));
    look.backpack = null;
    const p = new Person(look);
    p.root.scale.setScalar(0.92);
    const s = this.w.grid.randomFree(() => this.rng.next());
    if (!s) return;
    p.root.position.set(s.x, 0, s.z);
    p.pose = 'idle';
    this.w.stage.world.add(p.root);
    this.walkers.push({ p, tx: s.x, tz: s.z, wait: this.rng.range(0, 3) });
  }

  // ---------------------------------------------------------------- tick

  update(dt: number) {
    const w = this.w;
    this.chaosMul = 1; this.kirillSpeed = 1; this.kirillFire = 1; this.hordeSpeed = 1;
    // events
    if (this.active) {
      this.active.t -= dt;
      this.applyEvent(this.active.ev);
      (this.banner.querySelector('.dr-bar i') as HTMLElement | null)?.style.setProperty('width', `${Math.max(0, this.active.t / Math.max(0.01, this.active.ev.dur)) * 100}%`);
      if (this.active.t <= 0) { this.active = null; this.banner.classList.add('hidden'); }
    }
    const left = w.duration - w.time;
    this.next -= dt;
    if (this.next <= 0 && !this.active && left > 14) {
      this.next = this.rng.range(D.every[0], D.every[1]);
      this.fire();
    }
    // the last ten seconds
    if (left <= 10 && left > 0) {
      this.final = 1 - left / 10;
      const n = Math.ceil(left);
      if (n !== this.lastCount) {
        this.lastCount = n;
        this.count.classList.remove('hidden');
        this.count.textContent = n === 10 ? t('dir.final') : String(n);
        this.count.classList.toggle('big', n === 10);
        this.count.classList.remove('tick'); void this.count.offsetWidth; this.count.classList.add('tick');
        juice.tick(n <= 3);
      }
    }
    this.personality(dt);
    this.walk(dt);
  }

  private fire() {
    const w = this.w;
    // two in three events help you (if you've been playing: luck follows the active); the rest are drama
    const active = w.time - w.lastCardAt < 15;
    const pool = EVENTS.filter((e) => (active && this.rng.chance(0.66) ? e.good : !e.good));
    const ev = this.rng.pick(pool.length ? pool : EVENTS);
    this.active = { ev, t: ev.dur };
    this.banner.className = `dr-banner ${ev.good ? 'good' : 'bad'}`;
    this.banner.innerHTML = `<span class="dr-icon">${ev.icon}</span><div><b>${t('dir.ev.' + ev.id)}</b><small>${t('dir.evd.' + ev.id)}</small>${ev.dur ? '<div class="dr-bar"><i></i></div>' : ''}</div>`;
    juice.sting(ev.good ? 2 : 1);
    w.stage.punch(0.05);
    const k = w.kirill;
    if (ev.id === 'mom') { k.stun = Math.max(k.stun, D.momStun); k.say([t('dir.momLine')], true); voice.play('kirill_phone'); }
    if (ev.id === 'paperwork') w.chaosBonus(D.paperworkChaos);
    if (ev.id === 'stipend') k.say([t('dir.stipendLine')], true);
    if (ev.id === 'coffee') k.say([t('dir.coffeeLine')], true);
    if (!ev.dur) setTimeout(() => { if (this.active?.ev === ev) { this.active = null; this.banner.classList.add('hidden'); } }, 2600);
    if (!ev.dur) this.active.t = 2.6;
  }

  private applyEvent(ev: Ev) {
    if (ev.id === 'quiz') this.chaosMul = 2;
    if (ev.id === 'coffee') this.kirillSpeed = 0.72;
    if (ev.id === 'stipend') this.kirillSpeed = 1.22;
    if (ev.id === 'wifi') this.kirillFire = 0.5;
    if (ev.id === 'bell') this.hordeSpeed = 0.7;
  }

  // ---------------------------------------------------------------- Kirill's personality

  /** a unit of yours just died to his beam: a streak of them and he shows off */
  unitKilled() {
    const now = this.w.time;
    this.kills = this.kills.filter((x) => now - x < 3);
    this.kills.push(now);
    if (this.kills.length >= 5) { this.kills = []; this.w.kirill.say([t('dir.brag' + this.rng.int(0, 3))], true); this.setMood('😤', 2); voice.play('kirill_brag'); }
  }

  /** a big hit on him: a shocked face for a moment */
  bigHit() { this.setMood('🤯', 1.2); }

  private setMood(e: string, hold = 0) {
    if (hold) this.moodHold = hold;
    if (e === this.moodNow) return;
    this.moodNow = e;
    this.mood.material.map = emojiSprite(e);
    this.mood.material.needsUpdate = true;
  }

  private personality(dt: number) {
    const w = this.w, k = w.kirill;
    const p = w.rules.progress();
    const fail = w.rules.meterMode === 'fail';
    const danger = fail ? p : Math.min(1, w.time / w.duration);
    this.moodHold = Math.max(0, this.moodHold - dt);
    if (this.moodHold <= 0) {
      if (k.stun > 0) this.setMood('😵');
      else if (k.buff > 0) this.setMood('🔥');
      else this.setMood(MOODS[Math.min(MOODS.length - 1, Math.floor(danger * MOODS.length))]);
    }
    this.mood.position.set(k.x, 3.0 + Math.sin(w.time * 3) * 0.06, k.z);
    // he talks to you now and then; more nervous as the meter fills
    this.tauntT -= dt;
    if (this.tauntT <= 0) {
      this.tauntT = this.rng.range(D.taunt[0], D.taunt[1]);
      const key = danger > 0.66 ? 'dir.sweat' : danger > 0.33 ? 'dir.unsure' : 'dir.taunt';
      k.say([t(key + this.rng.int(0, 3))]);
      voice.play(danger > 0.66 ? 'kirill_sweat' : 'kirill_taunt');
    }
    // the camera leans in when he's close to a debt
    w.stage.direct(k.x, k.z, fail ? Math.max(0, (p - 0.75) / 0.25) : this.final * 0.7);
  }

  private walk(dt: number) {
    for (const wk of this.walkers) {
      const p = wk.p.root.position;
      const dx = wk.tx - p.x, dz = wk.tz - p.z, d = Math.hypot(dx, dz);
      if (d < 0.3) {
        wk.p.pose = 'talk';
        wk.wait -= dt;
        if (wk.wait <= 0) {
          const s = this.w.grid.randomFree(() => this.rng.next());
          if (s) { wk.tx = s.x; wk.tz = s.z; }
          wk.wait = this.rng.range(2, 6);
        }
        wk.p.update(dt, 0);
        continue;
      }
      const sp = 1.3;
      const nx = p.x + (dx / d) * sp * dt, nz = p.z + (dz / d) * sp * dt;
      if (this.w.grid.blocked(nx, nz)) { wk.tx = p.x; wk.tz = p.z; continue; }
      p.set(nx, 0, nz);
      wk.p.pose = 'run';
      wk.p.faceTowards(Math.atan2(dx, dz), dt, 6);
      wk.p.update(dt, 0.6);
    }
  }

  dispose() {
    this.banner.remove();
    this.count.remove();
    this.mood.removeFromParent();
    for (const wk of this.walkers) wk.p.root.removeFromParent();
    ambience.stop();
  }
}
